/**
 * server/utils/rateLimiter.js
 * NEXUSFLOW 3.0 — Phase 19: Sliding-Window In-Memory Rate Limiter
 * $0 cost — no Redis dependency required.
 */

/**
 * createRateLimiter({ windowMs, max, keyPrefix })
 * Returns Express middleware that enforces a sliding window rate limit.
 */
export function createRateLimiter({ windowMs = 60_000, max = 20, keyPrefix = "rl" } = {}) {
  // Map<key, number[]> — tracks request timestamps per identity
  const store = new Map();

  return function rateLimiterMiddleware(req, res, next) {
    const id = req.user?.id || req.ip || "anon";
    const key = `${keyPrefix}:${id}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Prune expired timestamps
    const timestamps = (store.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= max) {
      res.status(429).json({
        error: "rate_limit_exceeded",
        retryAfterMs: windowMs - (now - timestamps[0]),
      });
      return;
    }

    timestamps.push(now);
    store.set(key, timestamps);
    next();
  };
}

// Pre-configured limiters for AI and GitHub endpoints
export const aiRateLimiter     = createRateLimiter({ windowMs: 60_000, max: 15, keyPrefix: "ai" });
export const githubRateLimiter = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: "gh" });
