/**
 * server/routes/auth.js
 * NEXUSFLOW Phase 2 — Google OIDC login (hardened), one-time login exchange,
 * and secure password recovery. Every route is rate limited.
 */
import { Router } from "express";
import crypto from "node:crypto";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import OAuthState from "../models/OAuthState.js";
import AuthExchangeCode from "../models/AuthExchangeCode.js";
import { sign, formatUser } from "../auth.js";
import { authLimits } from "../utils/rateLimiter.js";
import { validatePassword } from "../utils/passwordPolicy.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";
import { logger } from "../utils/logger.js";
import {
  GOOGLE_AUTH_URL,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  googleIsAuthoritativeForEmail,
  sanitizeRedirectPath,
  randomToken,
  sha256b64url,
  sha256hex,
  safeEqual,
  GoogleAuthError,
} from "../services/googleOAuth.js";

const router = Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_FORGOT = "If an account with that email exists, a reset link has been sent.";

const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = () => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    return "https://nexusflow-nxeg.onrender.com/api/auth/google/callback";
  }
  return "http://localhost:4000/api/auth/google/callback";
};
const getFrontendUrl = () => {
  const url = process.env.FRONTEND_URL || "";
  if (!url || url.includes("your-frontend") || url.includes("example.com")) return "http://localhost:8081";
  return url.replace(/\/+$/, "");
};

const STATE_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 2 * 60 * 1000;
const BIND_COOKIE = "nf_oauth_bind";
const resetTtlMinutes = () => {
  const n = Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES ?? "", 10);
  return Number.isFinite(n) && n >= 5 && n <= 60 ? n : 20;
};
const isSecureCookie = () => process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function redirectWithError(res, code) {
  return res.redirect(`${getFrontendUrl()}/login?auth_error=${encodeURIComponent(code)}`);
}

// ── GOOGLE OAUTH ────────────────────────────────────────────────────────────
// GET /api/auth/google?client_challenge=<b64url SHA-256 of client verifier>&redirect=/path
router.get("/auth/google", authLimits.oauthIp, async (req, res) => {
  try {
    const clientId = GOOGLE_CLIENT_ID();
    if (!clientId || !GOOGLE_CLIENT_SECRET()) {
      return res.status(503).json({ error: "Google sign-in is not configured on the server." });
    }
    const clientChallenge = String(req.query.client_challenge || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(clientChallenge)) {
      return res.status(400).json({ error: "Missing or invalid client_challenge." });
    }

    const state = randomToken(32);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(48);
    const binding = randomToken(32);

    await OAuthState.create({
      state,
      provider: "google",
      codeVerifier,
      nonce,
      browserBindingHash: sha256hex(binding),
      clientChallenge,
      redirectPath: sanitizeRedirectPath(req.query.redirect),
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    // Binds the callback to the browser that started the flow (login CSRF).
    res.cookie(BIND_COOKIE, binding, {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      maxAge: STATE_TTL_MS,
      path: "/api/auth/google",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: GOOGLE_REDIRECT_URI(),
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: sha256b64url(codeVerifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  } catch (err) {
    logger.error("google_oauth:init_failed", { reason: err?.message });
    res.status(500).json({ error: "Failed to start Google sign-in." });
  }
});

router.get("/auth/google/callback", authLimits.oauthIp, async (req, res) => {
  const bindingCookie = readCookie(req, BIND_COOKIE);
  res.clearCookie(BIND_COOKIE, { path: "/api/auth/google" });
  try {
    if (req.query.error) return redirectWithError(res, req.query.error === "access_denied" ? "cancelled" : "google_error");
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) return redirectWithError(res, "missing_code");

    // Atomic single-use state consumption (expired / replayed → null).
    const stored = await OAuthState.findOneAndUpdate(
      { state, provider: "google", isConsumed: false, expiresAt: { $gt: new Date() } },
      { $set: { isConsumed: true, consumedAt: new Date() } },
      { new: false }
    ).select("+codeVerifier");
    if (!stored) return redirectWithError(res, "invalid_state");
    if (!bindingCookie || !safeEqual(sha256hex(bindingCookie), stored.browserBindingHash)) {
      return redirectWithError(res, "state_mismatch");
    }

    const clientId = GOOGLE_CLIENT_ID();
    const tokens = await exchangeGoogleCode({
      code,
      codeVerifier: stored.codeVerifier,
      clientId,
      clientSecret: GOOGLE_CLIENT_SECRET(),
      redirectUri: GOOGLE_REDIRECT_URI(),
    });
    const claims = await verifyGoogleIdToken(tokens.id_token, { clientId, nonce: stored.nonce });

    const googleId = claims.sub;
    const email = String(claims.email || "").toLowerCase().trim();
    if (!EMAIL_REGEX.test(email)) return redirectWithError(res, "invalid_google_payload");

    // ── Account linking (stable subject id first) ─────────────────────────
    let user = await User.findOne({ googleId });
    if (!user) {
      const byEmail = await User.findOne({ email });
      if (byEmail) {
        if (byEmail.googleId && byEmail.googleId !== googleId) return redirectWithError(res, "email_conflict");
        if (!googleIsAuthoritativeForEmail(claims)) {
          // Google is not this address's provider → no proof of control over
          // the existing password account. User must sign in with password.
          return redirectWithError(res, "link_requires_password");
        }
        user = await User.findOneAndUpdate(
          { _id: byEmail._id, $or: [{ googleId: "" }, { googleId: null }, { googleId: { $exists: false } }] },
          { $set: { googleId } },
          { new: true }
        );
        if (!user) return redirectWithError(res, "email_conflict");
        logger.info("google_oauth:account_linked", { userId: String(user._id) });
      } else {
        user = await User.create({
          name: String(claims.name || "").trim() || email.split("@")[0],
          email,
          password: randomToken(32),
          googleId,
          authProvider: "google",
        });
      }
    }

    // One-time exchange code — the JWT never appears in a URL.
    const exchangeCode = randomToken(32);
    await AuthExchangeCode.create({
      codeHash: sha256hex(exchangeCode),
      userId: user._id,
      clientChallenge: stored.clientChallenge,
      redirectPath: stored.redirectPath || "/",
      expiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
    });
    res.redirect(`${getFrontendUrl()}/?auth_code=${encodeURIComponent(exchangeCode)}`);
  } catch (err) {
    const code = err instanceof GoogleAuthError ? err.code : "server_error";
    logger.warn("google_oauth:callback_rejected", { code });
    redirectWithError(res, code);
  }
});

// POST /api/auth/exchange { code, verifier } → { token, user, redirectPath }
router.post("/auth/exchange", authLimits.oauthIp, async (req, res) => {
  try {
    const code = String(req.body?.code || "");
    const verifier = String(req.body?.verifier || "");
    if (!code || !verifier || code.length > 200 || verifier.length > 200) {
      return res.status(400).json({ error: "Invalid sign-in exchange." });
    }
    // Atomic single-use consumption; a failed verifier check still burns it.
    const record = await AuthExchangeCode.findOneAndUpdate(
      { codeHash: sha256hex(code), used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true } },
      { new: false }
    );
    if (!record || !safeEqual(sha256b64url(verifier), record.clientChallenge)) {
      return res.status(400).json({ error: "This sign-in link is invalid or has expired. Please try again.", code: "INVALID_EXCHANGE" });
    }
    const user = await User.findById(record.userId);
    if (!user) return res.status(400).json({ error: "Account not found.", code: "INVALID_EXCHANGE" });
    res.json({ success: true, token: sign(user), user: formatUser(user), redirectPath: record.redirectPath || "/" });
  } catch (err) {
    res.status(500).json({ error: "Sign-in exchange failed." });
  }
});

// ── PASSWORD RECOVERY ──────────────────────────────────────────────────────
router.post("/auth/forgot-password", authLimits.forgotIp, authLimits.forgotAccount, async (req, res) => {
  const normalizedEmail = String(req.body?.email || "").toLowerCase().trim();
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: "A valid email address is required." });
  }
  // Identical response for every valid address, sent BEFORE any account
  // lookup or e-mail work, so neither content nor timing reveals existence.
  res.json({ success: true, message: GENERIC_FORGOT });

  try {
    const user = await User.findOne({ email: normalizedEmail }).select("_id email name").lean();
    if (!user) return;
    const token = randomToken(32);
    const minutes = resetTtlMinutes();
    // Invalidate this user's older active tokens only (never other users').
    await PasswordReset.updateMany({ userId: user._id, used: false }, { $set: { used: true, usedAt: new Date() } });
    await PasswordReset.create({
      userId: user._id,
      tokenHash: sha256hex(token),
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
    });
    const delivery = await sendPasswordResetEmail({ to: user.email, name: user.name, token, expiresMinutes: minutes });
    if (!delivery.delivered) {
      logger.warn("password_reset:email_not_delivered", { userId: String(user._id), reason: delivery.reason });
    }
  } catch (err) {
    logger.error("password_reset:request_failed", { reason: err?.message });
  }
});

async function findActiveReset(rawToken) {
  if (!rawToken || rawToken.length > 200) return null;
  return PasswordReset.findOne({ tokenHash: sha256hex(rawToken), used: false, expiresAt: { $gt: new Date() } }).lean();
}

const validateHandler = async (req, res) => {
  try {
    const rawToken = String(req.body?.token || req.query?.token || "").trim();
    if (!rawToken) return res.status(400).json({ valid: false, error: "Token is required." });
    res.json({ valid: Boolean(await findActiveReset(rawToken)) });
  } catch {
    res.status(500).json({ valid: false, error: "Failed to validate token." });
  }
};
router.get("/auth/reset-password/validate", authLimits.resetIp, validateHandler);
router.post("/auth/reset-password/validate", authLimits.resetIp, validateHandler);

router.post("/auth/reset-password", authLimits.resetIp, async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body ?? {};
    const rawToken = String(token || "").trim();
    if (!rawToken || typeof password !== "string") {
      return res.status(400).json({ error: "Token and new password are required." });
    }
    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ error: policyError });
    if (password !== confirmPassword) return res.status(400).json({ error: "Passwords do not match." });

    // Atomic single-use consumption: concurrent submissions → exactly one wins.
    const consumed = await PasswordReset.findOneAndUpdate(
      { tokenHash: sha256hex(rawToken), used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true, usedAt: new Date() } },
      { new: false }
    );
    if (!consumed) return res.status(400).json({ error: "This reset link is invalid or has expired.", code: "INVALID_RESET_TOKEN" });

    const user = await User.findById(consumed.userId).select("+password");
    if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired.", code: "INVALID_RESET_TOKEN" });

    user.password = password; // hashed by the existing bcrypt pre-save hook
    user.tokenVersion = (user.tokenVersion || 0) + 1; // revokes every existing session
    user.passwordChangedAt = new Date();
    await user.save();
    await PasswordReset.updateMany({ userId: user._id, used: false }, { $set: { used: true, usedAt: new Date() } });

    const io = req.app.get("io");
    if (io) io.in(`user:${user._id}`).disconnectSockets(true);
    logger.info("password_reset:completed", { userId: String(user._id) });
    res.json({ success: true, message: "Your password has been reset. Please sign in with your new password." });
  } catch (err) {
    logger.error("password_reset:failed", { reason: err?.message });
    res.status(500).json({ error: "Failed to reset password." });
  }
});

export default router;
