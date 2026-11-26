/**
 * server/services/githubTokenCrypto.js — GitHub token encryption (Phase 4, D-30)
 * ============================================================================
 * AES-256-GCM (Node crypto), authenticated, versioned, key-identified.
 *
 * Envelope (ASCII, dot-separated, base64url fields):
 *     nf1.a256gcm.<keyId>.<iv 12 bytes>.<ciphertext>.<tag 16 bytes>
 *
 * Associated data (authenticated, not stored):
 *     "nexusflow:github-token:nf1:user:<ownerUserId>"
 * → a ciphertext only decrypts for the GitHub account owner it was issued to.
 * Copying it between records of the SAME owner (credential → integration) is
 * legitimate; moving it to another user's record fails authentication.
 *
 * Keys (environment only — never derived from JWT_SECRET, never generated at
 * startup, no development fallback):
 *     GITHUB_TOKEN_ENCRYPTION_KEY       32 bytes, base64 / base64url / 64-hex
 *     GITHUB_TOKEN_ENCRYPTION_KEY_ID    short id written into envelopes (default "k1")
 *     GITHUB_TOKEN_PREVIOUS_KEYS        "id:key,id:key" — decrypt-only (rotation)
 *     GITHUB_TOKEN_LEGACY_KEY           the old ENCRYPTION_KEY string — decrypts
 *                                       legacy AES-256-CBC "ivhex:cthex" values
 *                                       for migration / transition only
 */
import crypto from "node:crypto";

export const ENVELOPE_VERSION = "nf1";
const ALG = "a256gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const LEGACY_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;

export class TokenCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TokenCryptoError";
    this.code = code;
  }
}

/** Decode a 32-byte key from base64 / base64url / hex; throws on any other length. */
export function decodeKey(raw) {
  const v = String(raw || "").trim();
  if (!v) throw new TokenCryptoError("KEY_MISSING", "GitHub token encryption key is not configured.");
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) buf = Buffer.from(v, "hex");
  else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) buf = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (!buf || buf.length !== 32) throw new TokenCryptoError("KEY_INVALID", "GitHub token encryption key must decode to exactly 32 bytes.");
  return buf;
}

/** Key ring from env (pure; env injectable for tests). */
export function loadKeyRing(env = process.env) {
  const id = (env.GITHUB_TOKEN_ENCRYPTION_KEY_ID || "k1").trim();
  if (!KEY_ID_RE.test(id)) throw new TokenCryptoError("KEY_ID_INVALID", "GITHUB_TOKEN_ENCRYPTION_KEY_ID must be 1–16 characters [A-Za-z0-9_-].");
  const active = { id, key: decodeKey(env.GITHUB_TOKEN_ENCRYPTION_KEY) };
  const previous = new Map();
  for (const pair of String(env.GITHUB_TOKEN_PREVIOUS_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const i = pair.indexOf(":");
    const pid = pair.slice(0, i), pkey = pair.slice(i + 1);
    if (i <= 0 || !KEY_ID_RE.test(pid) || pid === id) throw new TokenCryptoError("KEY_ID_INVALID", "GITHUB_TOKEN_PREVIOUS_KEYS entries must be id:key with unique ids.");
    previous.set(pid, decodeKey(pkey));
  }
  return { active, previous };
}

const b64u = (buf) => buf.toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");

export function aadFor(ownerUserId) {
  const owner = String(ownerUserId || "").trim();
  if (!/^[0-9a-fA-F]{24}$/.test(owner)) throw new TokenCryptoError("CONTEXT_INVALID", "A valid owner user id is required for token encryption.");
  return Buffer.from(`nexusflow:github-token:${ENVELOPE_VERSION}:user:${owner.toLowerCase()}`, "utf8");
}

export function isEnvelope(value) {
  return typeof value === "string" && value.startsWith(`${ENVELOPE_VERSION}.${ALG}.`);
}
export function isLegacyCiphertext(value) {
  return typeof value === "string" && LEGACY_RE.test(value);
}

/** encryptGitHubToken(plaintext, { userId }, env?) → envelope string. */
export function encryptGitHubToken(plaintext, { userId } = {}, env = process.env) {
  if (typeof plaintext !== "string" || !plaintext || plaintext.length > 4096) throw new TokenCryptoError("PLAINTEXT_INVALID", "Token to encrypt is missing or invalid.");
  const { active } = loadKeyRing(env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", active.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(userId));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, ALG, active.id, b64u(iv), b64u(ct), b64u(tag)].join(".");
}

/** decryptGitHubToken(envelope, { userId }, env?) → plaintext; throws TokenCryptoError. */
export function decryptGitHubToken(envelope, { userId } = {}, env = process.env) {
  if (typeof envelope !== "string" || !envelope) throw new TokenCryptoError("ENVELOPE_INVALID", "Stored GitHub credential is missing.");
  if (isLegacyCiphertext(envelope)) return decryptLegacy(envelope, env);
  const parts = envelope.split(".");
  if (parts.length !== 6 || parts[0] !== ENVELOPE_VERSION || parts[1] !== ALG || !KEY_ID_RE.test(parts[2])) {
    throw new TokenCryptoError("ENVELOPE_INVALID", "Stored GitHub credential has an unrecognised format.");
  }
  const ring = loadKeyRing(env);
  const key = parts[2] === ring.active.id ? ring.active.key : ring.previous.get(parts[2]);
  if (!key) throw new TokenCryptoError("KEY_UNKNOWN", "Stored GitHub credential uses an unknown key id.");
  let iv, ct, tag;
  try { iv = unb64u(parts[3]); ct = unb64u(parts[4]); tag = unb64u(parts[5]); } catch { throw new TokenCryptoError("ENVELOPE_INVALID", "Stored GitHub credential is malformed."); }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ct.length === 0) throw new TokenCryptoError("ENVELOPE_INVALID", "Stored GitHub credential is malformed.");
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    d.setAAD(aadFor(userId));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof TokenCryptoError) throw e;
    // Wrong key, modified ciphertext / tag, or wrong owner context: no plaintext is released.
    throw new TokenCryptoError("AUTH_FAILED", "Stored GitHub credential failed authentication.");
  }
}

/** Legacy AES-256-CBC (no integrity). Only with an explicitly configured legacy key. */
export function decryptLegacy(value, env = process.env) {
  const raw = env.GITHUB_TOKEN_LEGACY_KEY || "";
  if (!raw) throw new TokenCryptoError("LEGACY_KEY_MISSING", "Legacy GitHub credential requires reconnection (legacy key not configured).");
  const [ivHex, ctHex] = value.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  // Matches the pre-Phase-4 derivation: first 32 bytes of the configured string.
  const key = Buffer.from(String(raw).padEnd(32, "_").slice(0, 32));
  try {
    const d = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const out = Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    if (!out || /[\u0000-\u001f]/.test(out)) throw new Error("implausible plaintext");
    return out;
  } catch {
    throw new TokenCryptoError("LEGACY_DECRYPT_FAILED", "Legacy GitHub credential could not be decrypted; reconnection required.");
  }
}

/** Configuration status for diagnostics (never key material). */
export function encryptionStatus(env = process.env) {
  try {
    const r = loadKeyRing(env);
    return { configured: true, keyId: r.active.id, previousKeyIds: [...r.previous.keys()], legacyKeyConfigured: Boolean(env.GITHUB_TOKEN_LEGACY_KEY) };
  } catch (e) {
    return { configured: false, reason: e.code, legacyKeyConfigured: Boolean(env.GITHUB_TOKEN_LEGACY_KEY) };
  }
}
