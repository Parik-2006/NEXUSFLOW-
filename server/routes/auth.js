import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import { sign, verify, requireAuth, formatUser } from "../auth.js";

const router = Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = () => process.env.GOOGLE_REDIRECT_URI || "";
const getFrontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:8081").replace(/\/+$/, "");

// Simple in-memory store for OAuth state tokens (CSRF protection)
const oauthStateStore = new Map();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateOAuthState() {
  const state = cryptoRandomToken(32);
  oauthStateStore.set(state, Date.now());
  return state;
}

function validateOAuthState(state) {
  if (!state) return false;
  const timestamp = oauthStateStore.get(state);
  if (!timestamp) return false;
  if (Date.now() - timestamp > OAUTH_STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return false;
  }
  oauthStateStore.delete(state);
  return true;
}

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, timestamp] of oauthStateStore.entries()) {
    if (now - timestamp > OAUTH_STATE_TTL_MS) {
      oauthStateStore.delete(state);
    }
  }
}, 60_000);

// ── GOOGLE OAUTH ────────────────────────────────────────────────────────────────

router.get("/auth/google", (req, res) => {
  const clientId = GOOGLE_CLIENT_ID();
  const redirectUri = GOOGLE_REDIRECT_URI();
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: "Google OAuth is not configured on the server." });
  }
  const state = generateOAuthState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/auth/google/callback", async (req, res) => {
  const frontendUrl = getFrontendUrl();
  try {
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    
    if (!code) return res.redirect(`${frontendUrl}/?error=missing_code`);
    if (!validateOAuthState(state)) {
      return res.redirect(`${frontendUrl}/?error=invalid_state`);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID(),
        client_secret: GOOGLE_CLIENT_SECRET(),
        redirect_uri: GOOGLE_REDIRECT_URI(),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[Google OAuth] Token exchange failed:", tokenRes.status, text);
      return res.redirect(`${frontendUrl}/?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    if (!idToken) return res.redirect(`${frontendUrl}/?error=no_id_token`);

    const payloadRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!payloadRes.ok) return res.redirect(`${frontendUrl}/?error=invalid_token`);
    const payload = await payloadRes.json();

    const googleId = String(payload.sub || "");
    const email = String(payload.email || "").toLowerCase().trim();
    const name = String(payload.name || "").trim();

    if (!googleId || !email || !EMAIL_REGEX.test(email)) {
      return res.redirect(`${frontendUrl}/?error=invalid_google_payload`);
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      if (user.googleId && user.googleId !== googleId) {
        return res.redirect(`${frontendUrl}/?error=email_conflict`);
      }
      if (!user.googleId) {
        user = await User.findByIdAndUpdate(user._id, { $set: { googleId, authProvider: "google" } }, { new: true });
      }
    } else {
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: cryptoRandomToken(32),
        googleId,
        authProvider: "google",
      });
    }

    const jwtToken = sign(user);
    res.cookie("nf_jwt", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });
    res.redirect(`${frontendUrl}/?google=1&token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    console.error("[Google OAuth] Callback error:", err.message);
    res.redirect(`${frontendUrl}/?error=server_error`);
  }
});

// ── FORGOT PASSWORD ─────────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    const normalizedEmail = String(email || "").toLowerCase().trim();

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const user = await User.findOne({ email: normalizedEmail }).select("_id email").lean();
    if (!user) {
      return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }

    const rawToken = cryptoRandomToken(32);
    const tokenHash = await bcryptHash(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await PasswordReset.create({
      userId: user._id,
      email: normalizedEmail,
      tokenHash,
      expiresAt,
    });

    await PasswordReset.updateMany(
      { userId: user._id, _id: { $ne: new mongoose.Types.ObjectId() }, used: false },
      { $set: { used: true } }
    );

    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("[Forgot Password] Error:", err.message);
    res.status(500).json({ error: "Failed to process reset request." });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body ?? {};
    const rawToken = String(token || "").trim();

    if (!rawToken || !password) {
      return res.status(400).json({ error: "Token and new password are required." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const matchedReset = await findValidResetToken(rawToken);

    if (!matchedReset) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const user = await User.findById(matchedReset.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    user.password = String(password);
    await user.save();

    await PasswordReset.findByIdAndUpdate(matchedReset._id, { $set: { used: true } });
    await PasswordReset.updateMany(
      { userId: matchedReset.userId, _id: { $ne: matchedReset._id }, used: false },
      { $set: { used: true } }
    );

    const jwtToken = sign(user);
    res.json({ success: true, token: jwtToken, user: formatUser(user) });
  } catch (err) {
    console.error("[Reset Password] Error:", err.message);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

router.get("/auth/reset-password/validate", async (req, res) => {
  try {
    const rawToken = String(req.query.token || "").trim();
    if (!rawToken) {
      return res.status(400).json({ valid: false, error: "Token is required." });
    }

    const matchedReset = await findValidResetToken(rawToken);

    res.json({ valid: !!matchedReset });
  } catch (err) {
    res.status(500).json({ valid: false, error: "Failed to validate token." });
  }
});

// ── UTILS ──────────────────────────────────────────────────────────────────────

// Shared helper: find a valid password reset token by raw token value.
// Returns the matched reset document or null.
async function findValidResetToken(rawToken) {
  const candidateResets = await PasswordReset.find({ used: false, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (candidateResets.length > 0 && await bcryptCompare(rawToken, candidateResets[0].tokenHash)) {
    return candidateResets[0];
  }
  return null;
}

function cryptoRandomToken(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

async function bcryptHash(plain) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plain, 10);
}

async function bcryptCompare(plain, hash) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(plain, hash);
}

export default router;
