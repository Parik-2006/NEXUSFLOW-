/**
 * server/services/googleOAuth.js
 * NEXUSFLOW Phase 2 (Task 3) — Google OpenID Connect helpers.
 *
 * - Authorization-code flow with PKCE (S256) and an OIDC nonce.
 * - ID tokens are verified CRYPTOGRAPHICALLY against Google's published JWKS
 *   (RS256 signature, issuer, audience, expiry, nonce) and must carry
 *   email_verified === true. Decoded-but-unverified payloads are never used.
 * - All network calls go through googleDeps.fetch so tests can mock Google.
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const googleDeps = { fetch: (...args) => globalThis.fetch(...args) };

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256b64url = (value) => crypto.createHash("sha256").update(String(value)).digest("base64url");
export const sha256hex = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export class GoogleAuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// ── JWKS cache ───────────────────────────────────────────────────────────────
let jwks = { keys: [], fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

export function resetGoogleKeyCacheForTests() {
  jwks = { keys: [], fetchedAt: 0 };
}

async function loadJwks(force = false) {
  if (!force && jwks.keys.length && Date.now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
  const res = await googleDeps.fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new GoogleAuthError("jwks_unavailable", "Could not load Google signing keys.");
  const body = await res.json();
  jwks = { keys: Array.isArray(body.keys) ? body.keys : [], fetchedAt: Date.now() };
  return jwks.keys;
}

async function signingKeyFor(kid) {
  let keys = await loadJwks();
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    keys = await loadJwks(true); // key rotation
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new GoogleAuthError("unknown_key", "ID token signed with an unknown key.");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/** Exchange an authorization code (+ PKCE verifier) for Google tokens. */
export async function exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  const res = await googleDeps.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new GoogleAuthError("token_exchange_failed", `Google token endpoint returned ${res.status}.`);
  const data = await res.json();
  if (!data.id_token) throw new GoogleAuthError("no_id_token", "Google did not return an ID token.");
  return data;
}

/** Verify a Google ID token. Returns the verified payload or throws GoogleAuthError. */
export async function verifyGoogleIdToken(idToken, { clientId, nonce }) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid || decoded.header.alg !== "RS256") {
    throw new GoogleAuthError("invalid_token", "Malformed or unsupported ID token.");
  }
  const key = await signingKeyFor(decoded.header.kid);
  let payload;
  try {
    payload = jwt.verify(idToken, key, { algorithms: ["RS256"], audience: clientId, issuer: GOOGLE_ISSUERS });
  } catch (e) {
    const code = e?.name === "TokenExpiredError" ? "expired_token" : /audience/i.test(e?.message) ? "invalid_audience" : /issuer/i.test(e?.message) ? "invalid_issuer" : "invalid_signature";
    throw new GoogleAuthError(code, "Google ID token verification failed.");
  }
  if (!nonce || !safeEqual(payload.nonce, nonce)) throw new GoogleAuthError("invalid_nonce", "ID token nonce mismatch.");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new GoogleAuthError("email_not_verified", "Google account e-mail is not verified.");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new GoogleAuthError("invalid_subject", "Missing subject.");
  return payload;
}

/**
 * Account-linking policy: Google proves control of an e-mail address only when
 * Google is that address's provider — consumer Gmail, or a Google Workspace
 * domain asserted by the verified `hd` claim. Only then may Google sign in to
 * an EXISTING password account with the same e-mail.
 */
export function googleIsAuthoritativeForEmail(payload) {
  const email = String(payload?.email || "").toLowerCase();
  const domain = email.split("@")[1] || "";
  if (domain === "gmail.com" || domain === "googlemail.com") return true;
  return Boolean(payload?.hd && String(payload.hd).toLowerCase() === domain);
}

/** Only same-app relative paths (no scheme, no protocol-relative "//"). */
export function sanitizeRedirectPath(p) {
  const s = String(p || "");
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\r\n]/.test(s) || s.length > 200) return "/";
  return s;
}
