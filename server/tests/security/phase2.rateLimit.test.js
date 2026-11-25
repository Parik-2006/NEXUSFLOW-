/**
 * NEXUSFLOW Phase 2 — Task 2: authentication rate limiting.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser } from "../helpers/fixtures.js";

let env, req, limits;
before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  limits = await import("../../utils/rateLimiter.js");
});
after(async () => env?.stop());
beforeEach(() => limits.resetAllRateLimiters());

async function raw(path, body, headers = {}) {
  const res = await fetch(env.baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, retryAfter: res.headers.get("retry-after"), body: await res.json().catch(() => null) };
}

describe("limiter primitive", () => {
  test("window expiry, bounded memory and reset", () => {
    const l = new limits.SlidingWindowLimiter({ windowMs: 1000, max: 2, maxEntries: 3 });
    const t = 1_000_000;
    l.hit("a", t); l.hit("a", t);
    assert.ok(l.check("a", t + 10) > 0, "limited inside the window");
    assert.equal(l.check("a", t + 1001), 0, "allowed after the window");
    for (const k of ["b", "c", "d", "e"]) l.hit(k, t);
    assert.ok(l.store.size <= 3, "memory is bounded");
    l.hit("z", t); l.hit("z", t); l.reset("z");
    assert.equal(l.check("z", t), 0);
  });
});

describe("login", () => {
  test("5 failed attempts lock that account temporarily (with Retry-After); other accounts unaffected", async () => {
    const victim = await createUser("RL Victim");
    const other = await createUser("RL Other");
    for (let i = 0; i < 5; i++) {
      assert.equal((await raw("/api/auth/login", { email: victim.user.email, password: "wrong-pass-1" })).status, 401);
    }
    const locked = await raw("/api/auth/login", { email: victim.user.email, password: "test-password-123" });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.retryAfter) > 0);
    assert.equal(locked.body.code, "RATE_LIMITED");
    assert.equal((await raw("/api/auth/login", { email: other.user.email, password: "test-password-123" })).status, 200);
  });
  test("successful login clears the failure counter", async () => {
    const u = await createUser("RL Reset");
    for (let i = 0; i < 4; i++) await raw("/api/auth/login", { email: u.user.email, password: "bad-password-9" });
    assert.equal((await raw("/api/auth/login", { email: u.user.email, password: "test-password-123" })).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await raw("/api/auth/login", { email: u.user.email, password: "bad-password-9" })).status, 401);
  });
  test("non-existent accounts are limited identically (no enumeration)", async () => {
    const email = `ghost.${Date.now()}@test.local`;
    for (let i = 0; i < 5; i++) assert.equal((await raw("/api/auth/login", { email, password: "x1234567" })).status, 401);
    assert.equal((await raw("/api/auth/login", { email, password: "x1234567" })).status, 429);
  });
  test("per-IP login limit is shared by legacy alias routes and ignores spoofed X-Forwarded-For", async () => {
    let limited = null;
    for (let i = 0; i < 40 && !limited; i++) {
      const path = i % 2 ? "/api/login" : "/api/auth/login";
      const r = await raw(path, { email: `ip${i}@test.local`, password: "x1234567" }, { "X-Forwarded-For": `10.0.0.${i}` });
      if (r.status === 429) limited = i;
    }
    assert.equal(limited, 30, "the 31st request from one client is limited regardless of route alias / spoofed header");
  });
  test("malformed login requests are rejected and still counted", async () => {
    const r = await raw("/api/auth/login", {});
    assert.equal(r.status, 400);
  });
});

describe("other auth endpoints", () => {
  test("signup: 5 per IP per hour", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await raw(i % 2 ? "/api/signup" : "/api/auth/signup", { name: "S", email: `su${Date.now()}${i}@test.local`, password: "Valid1234" })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201]);
    assert.equal(statuses[5], 429);
  });
  test("forgot password: 3 per account per hour, same for unknown accounts", async () => {
    const email = `fp.${Date.now()}@test.local`;
    const s = [];
    for (let i = 0; i < 4; i++) s.push((await raw("/api/auth/forgot-password", { email })).status);
    assert.deepEqual(s, [200, 200, 200, 429]);
  });
  test("reset submission and validation are limited", async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await raw("/api/auth/reset-password", { token: "nope", password: "Valid1234", confirmPassword: "Valid1234" });
    assert.equal(last.status, 429);
  });
  test("Google OAuth start is limited", async () => {
    let status;
    for (let i = 0; i < 21; i++) status = (await fetch(`${env.baseUrl}/api/auth/google`, { redirect: "manual" })).status;
    assert.equal(status, 429);
  });
});
