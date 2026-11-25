/**
 * server/utils/rateLimiter.js
 * NEXUSFLOW Phase 2 (Task 2) — bounded, instance-local sliding-window limiter.
 * $0 cost: no Redis. Limits are per server instance (documented limitation).
 *
 * - Fixed memory ceiling (maxEntries) with oldest-first eviction, plus a
 *   periodic sweep (unref'd so it never keeps the process alive).
 * - 429 responses carry `Retry-After` (seconds) and `retryAfterMs`.
 * - Keys come from req.ip (only as trustworthy as Express "trust proxy",
 *   configured in app.js) or from a caller-supplied key function (e.g. a
 *   normalized account email). Raw credentials are never stored or logged.
 */

const allLimiters = new Set();

function intFromEnv(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export class SlidingWindowLimiter {
  constructor({ windowMs, max, maxEntries = 50_000 }) {
    this.windowMs = windowMs;
    this.max = max;
    this.maxEntries = maxEntries;
    this.store = new Map(); // key -> number[] timestamps (ascending)
    allLimiters.add(this);
  }

  _prune(key, now) {
    const list = this.store.get(key);
    if (!list) return [];
    const start = now - this.windowMs;
    let i = 0;
    while (i < list.length && list[i] <= start) i++;
    const kept = i ? list.slice(i) : list;
    if (kept.length) this.store.set(key, kept);
    else this.store.delete(key);
    return kept;
  }

  /** Remaining time (ms) until another hit is allowed; 0 if allowed now. */
  check(key, now = Date.now()) {
    const list = this._prune(key, now);
    if (list.length < this.max) return 0;
    return Math.max(1, list[0] + this.windowMs - now);
  }

  hit(key, now = Date.now()) {
    const list = this._prune(key, now);
    list.push(now);
    this.store.delete(key); // re-insert → Map order approximates recency
    this.store.set(key, list);
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value);
    }
  }

  reset(key) {
    this.store.delete(key);
  }

  sweep(now = Date.now()) {
    for (const key of [...this.store.keys()]) this._prune(key, now);
  }

  clear() {
    this.store.clear();
  }
}

const sweeper = setInterval(() => {
  for (const l of allLimiters) l.sweep();
}, 60_000);
sweeper.unref?.();

export function sendRateLimited(res, retryMs, message = "Too many attempts. Please try again later.") {
  const secs = Math.ceil(retryMs / 1000);
  res.set("Retry-After", String(secs));
  return res.status(429).json({ error: message, code: "RATE_LIMITED", retryAfterSeconds: secs, retryAfterMs: retryMs });
}

/**
 * Express middleware counting EVERY request per key.
 * keyFn(req) → string | null (null = skip this limiter).
 */
export function createRateLimiter({ windowMs = 60_000, max = 20, keyPrefix = "rl", keyFn, message } = {}) {
  const limiter = new SlidingWindowLimiter({ windowMs, max });
  const middleware = function rateLimiterMiddleware(req, res, next) {
    const raw = keyFn ? keyFn(req) : req.user?.id || req.ip || "anon";
    if (raw === null || raw === undefined || raw === "") return next();
    const key = `${keyPrefix}:${raw}`;
    const wait = limiter.check(key);
    if (wait > 0) return sendRateLimited(res, wait, message);
    limiter.hit(key);
    next();
  };
  middleware.limiter = limiter;
  return middleware;
}

/** Test helper: forget all limiter state. */
export function resetAllRateLimiters() {
  for (const l of allLimiters) l.clear();
}

const MIN = 60_000;
const normEmail = (req) => {
  const e = req.body?.email;
  return typeof e === "string" && e.trim() ? e.trim().toLowerCase().slice(0, 254) : null;
};

/**
 * Authentication limits (Phase 2). Defaults are deliberately generous for
 * legitimate users and configurable via env (RATE_LIMIT_* in .env.example).
 */
export const authLimits = {
  loginIp: createRateLimiter({
    keyPrefix: "login-ip", windowMs: 15 * MIN, max: intFromEnv("RATE_LIMIT_LOGIN_IP_MAX", 30), keyFn: (r) => r.ip,
  }),
  signupIp: createRateLimiter({
    keyPrefix: "signup-ip", windowMs: 60 * MIN, max: intFromEnv("RATE_LIMIT_SIGNUP_IP_MAX", 5), keyFn: (r) => r.ip,
  }),
  forgotIp: createRateLimiter({
    keyPrefix: "forgot-ip", windowMs: 60 * MIN, max: intFromEnv("RATE_LIMIT_FORGOT_IP_MAX", 10), keyFn: (r) => r.ip,
  }),
  // Keyed by the submitted email whether or not an account exists, so a 429
  // never reveals account existence.
  forgotAccount: createRateLimiter({
    keyPrefix: "forgot-acct", windowMs: 60 * MIN, max: intFromEnv("RATE_LIMIT_FORGOT_ACCOUNT_MAX", 3), keyFn: normEmail,
  }),
  resetIp: createRateLimiter({
    keyPrefix: "reset-ip", windowMs: 15 * MIN, max: intFromEnv("RATE_LIMIT_RESET_IP_MAX", 10), keyFn: (r) => r.ip,
  }),
  oauthIp: createRateLimiter({
    keyPrefix: "oauth-ip", windowMs: 15 * MIN, max: intFromEnv("RATE_LIMIT_OAUTH_IP_MAX", 20), keyFn: (r) => r.ip,
  }),
};

/**
 * Failed-login limiter per account (normalized email): 5 failures / 15 min.
 * Only failures count; a successful login clears the counter. Lockout is
 * temporary (window-based), so an attacker cannot lock a user out forever.
 */
export const loginFailures = new SlidingWindowLimiter({
  windowMs: 15 * MIN,
  max: intFromEnv("RATE_LIMIT_LOGIN_FAILURES_MAX", 5),
});

// Pre-configured limiters kept for compatibility with earlier imports.
export const aiRateLimiter = createRateLimiter({ windowMs: 60_000, max: 15, keyPrefix: "ai" });
export const githubRateLimiter = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: "gh" });
