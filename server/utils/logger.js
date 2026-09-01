/**
 * server/utils/logger.js
 * NEXUSFLOW 3.0 — Phase 19: Structured Sanitizing Logger
 * Redacts forbidden keys before output. Never logs secrets / tokens / passwords.
 */

const FORBIDDEN_KEYS = [
  "password", "confirmPassword", "token", "accessToken", "refreshToken",
  "apiKey", "api_key", "secret", "clientSecret", "encryptedToken",
  "jwt", "authorization", "cookie", "GITHUB_CLIENT_SECRET", "ENCRYPTION_KEY",
];

function redact(obj, depth = 0) {
  if (depth > 6 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    const isForbidden = FORBIDDEN_KEYS.some((f) => lower.includes(f.toLowerCase()));
    out[k] = isForbidden ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function formatLog(level, message, meta = {}) {
  const safe = redact(meta);
  return JSON.stringify({ ts: new Date().toISOString(), level, message, ...safe });
}

export const logger = {
  info:  (msg, meta = {}) => console.log(formatLog("info",  msg, meta)),
  warn:  (msg, meta = {}) => console.warn(formatLog("warn",  msg, meta)),
  error: (msg, meta = {}) => console.error(formatLog("error", msg, meta)),
  debug: (msg, meta = {}) => {
    if (process.env.NODE_ENV !== "production") console.log(formatLog("debug", msg, meta));
  },
};
