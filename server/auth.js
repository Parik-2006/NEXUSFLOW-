import jwt from "jsonwebtoken";
import { isValidId } from "./utils/identity.js";

/**
 * NEXUSFLOW Phase 1 — JWT authentication (D-1).
 *
 * - No hardcoded fallback secret. JWT_SECRET must be configured, ≥ 32 bytes,
 *   not a known placeholder, and not trivially low-entropy.
 * - Tokens are signed and verified with HS256 only (algorithm pinning blocks
 *   "none" / algorithm-confusion tokens).
 * - Verified payloads must carry a valid ObjectId `id` claim; tokens without
 *   one (e.g. legacy email-as-id tokens) are rejected and the user re-logs in.
 * - REST (requireAuth) and Socket.IO (index.js handshake) share verify().
 */

export const JWT_ALGORITHM = "HS256";
export const JWT_EXPIRES_IN = "7d";
export const MIN_JWT_SECRET_BYTES = 32;

// Known placeholder / previously-committed values that must never be accepted.
const KNOWN_INSECURE_SECRETS = new Set([
  "nexusflow-production-jwt-secret-key-2026",
  "dev-secret-change-me",
  "changeme",
  "change-me",
  "secret",
  "jwt-secret",
  "jwt_secret",
  "your-secret",
  "your_jwt_secret",
  "replace-me",
]);
const PLACEHOLDER_PATTERN = /(change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(jwt[-_ ]?)?secret|placeholder|example)/i;

export class AuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/** Validate a candidate secret. Returns { ok, reason }. Never echoes the secret. */
export function validateJwtSecret(secret) {
  if (typeof secret !== "string" || secret.trim() === "") {
    return { ok: false, reason: "JWT_SECRET is missing or empty." };
  }
  const s = secret.trim();
  if (Buffer.byteLength(s, "utf8") < MIN_JWT_SECRET_BYTES) {
    return { ok: false, reason: `JWT_SECRET must be at least ${MIN_JWT_SECRET_BYTES} bytes.` };
  }
  if (KNOWN_INSECURE_SECRETS.has(s.toLowerCase()) || PLACEHOLDER_PATTERN.test(s)) {
    return { ok: false, reason: "JWT_SECRET is a known placeholder/default value." };
  }
  if (new Set(s).size < 10) {
    return { ok: false, reason: "JWT_SECRET has too little entropy (fewer than 10 distinct characters)." };
  }
  return { ok: true, reason: "" };
}

function getSecret() {
  const secret = process.env.JWT_SECRET;
  const { ok, reason } = validateJwtSecret(secret);
  if (!ok) throw new AuthConfigError(reason);
  return secret.trim();
}

/**
 * Called once at server startup. Throws AuthConfigError so index.js can refuse
 * to start (fail closed) instead of serving requests with an unsafe config.
 */
export function assertAuthConfig() {
  getSecret();
  return true;
}

export function sign(user) {
  const id = (user?._id || user?.id)?.toString();
  if (!isValidId(id)) throw new Error("Cannot sign a token without a valid user id.");
  return jwt.sign({ id, email: user.email, name: user.name }, getSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify a token. Returns the payload, or null for any missing / malformed /
 * expired / wrongly-signed / wrong-algorithm / claim-less token, and also when
 * the server auth configuration is invalid (fail closed).
 */
export function verify(token) {
  if (!token || typeof token !== "string") return null;
  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  try {
    const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
    if (!payload || typeof payload !== "object" || !isValidId(payload.id)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Format sanitized User object for client responses
export function formatUser(user) {
  if (!user) return null;
  return {
    id: (user._id || user.id)?.toString(),
    _id: (user._id || user.id)?.toString(),
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    bio: user.bio || "",
    role: user.role || "Product Builder",
    experience: user.experience || "Mid-level",
    skills: user.skills || ["Frontend"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Express middleware — 401 for unauthenticated (authorization is separate: 403).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const payload = token && verify(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized: Invalid or missing token" });
  req.user = payload;
  next();
}
