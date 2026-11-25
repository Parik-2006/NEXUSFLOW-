/**
 * NEXUSFLOW Phase 2 — Task 1: secure password recovery + session revocation.
 * Mock e-mail transport only; isolated in-memory database.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { io as ioClient } from "socket.io-client";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser } from "../helpers/fixtures.js";

let env, req, PasswordReset, mailer, limits;
const outbox = [];
const mockTransport = { sendMail: async (msg) => { outbox.push(msg); return { messageId: "mock" }; } };

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: PasswordReset } = await import("../../models/PasswordReset.js"));
  mailer = await import("../../utils/mailer.js");
  limits = await import("../../utils/rateLimiter.js");
  mailer.setMailTransportForTests(mockTransport);
});
after(async () => {
  mailer?.setMailTransportForTests(null);
  await env?.stop();
});
beforeEach(() => {
  outbox.length = 0;
  limits.resetAllRateLimiters();
});

async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}
const tokenFrom = (msg) => /reset-password\?token=([A-Za-z0-9_-]+)/.exec(msg.text)[1];

async function requestReset(email) {
  const r = await req("POST", "/api/auth/forgot-password", { body: { email } });
  return r;
}
async function resetTokenFor(user) {
  await requestReset(user.user.email);
  const msg = await waitFor(() => outbox.find((m) => m.to === user.user.email));
  assert.ok(msg, "reset e-mail captured by mock transport");
  return tokenFrom(msg);
}

describe("request", () => {
  test("registered and unregistered emails get the identical generic response", async () => {
    const u = await createUser("Reset Known");
    const a = await requestReset(u.user.email);
    const b = await requestReset(`nobody.${Date.now()}@test.local`);
    assert.equal(a.status, 200);
    assert.deepEqual(a, b);
    await waitFor(() => outbox.length >= 1);
    assert.equal(outbox.length, 1, "only the registered account receives mail");
    assert.equal(outbox[0].to, u.user.email);
  });
  test("token is stored hashed and scoped to the right user", async () => {
    const u = await createUser("Reset Scope");
    const token = await resetTokenFor(u);
    const docs = await PasswordReset.find({ userId: u.user._id }).lean();
    assert.equal(docs.length, 1);
    assert.notEqual(docs[0].tokenHash, token);
    assert.ok(!JSON.stringify(docs).includes(token), "raw token never stored");
  });
  test("a newer request invalidates the older token, not other users' tokens", async () => {
    const u = await createUser("Reset Multi");
    const other = await createUser("Reset Other");
    const otherToken = await resetTokenFor(other);
    const first = await resetTokenFor(u);
    outbox.length = 0;
    const second = await resetTokenFor(u);
    assert.notEqual(first, second);
    assert.equal((await req("GET", `/api/auth/reset-password/validate?token=${first}`)).body.valid, false);
    assert.equal((await req("GET", `/api/auth/reset-password/validate?token=${second}`)).body.valid, true);
    assert.equal((await req("POST", "/api/auth/reset-password/validate", { body: { token: otherToken } })).body.valid, true);
  });
  test("missing SMTP configuration: generic success, nothing claimed, no crash", async () => {
    mailer.setMailTransportForTests(null);
    try {
      const u = await createUser("Reset NoSmtp");
      const r = await requestReset(u.user.email);
      assert.equal(r.status, 200);
      assert.match(r.body.message, /If an account/);
      assert.ok(await waitFor(() => PasswordReset.exists({ userId: u.user._id })));
    } finally {
      mailer.setMailTransportForTests(mockTransport);
    }
  });
  test("e-mail delivery failure is handled without leaking", async () => {
    mailer.setMailTransportForTests({ sendMail: async () => { throw Object.assign(new Error("smtp down"), { code: "ECONNECTION" }); } });
    try {
      const u = await createUser("Reset SmtpFail");
      const r = await requestReset(u.user.email);
      assert.equal(r.status, 200);
      assert.ok(!JSON.stringify(r.body).includes("smtp"));
    } finally {
      mailer.setMailTransportForTests(mockTransport);
    }
  });
  test("invalid e-mail format is rejected", async () => {
    assert.equal((await requestReset("not-an-email")).status, 400);
  });
});

describe("reset", () => {
  test("invalid, expired and consumed tokens are rejected", async () => {
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token: "bogus", password: "NewPass123", confirmPassword: "NewPass123" } })).status, 400);
    const u = await createUser("Reset Expired");
    const token = await resetTokenFor(u);
    await PasswordReset.updateOne({ userId: u.user._id, used: false }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token, password: "NewPass123", confirmPassword: "NewPass123" } })).status, 400);
  });
  test("weak password and confirmation mismatch are rejected without consuming the token", async () => {
    const u = await createUser("Reset Weak");
    const token = await resetTokenFor(u);
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token, password: "short", confirmPassword: "short" } })).status, 400);
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token, password: "abcdefghij", confirmPassword: "abcdefghij" } })).status, 400);
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token, password: "NewPass123", confirmPassword: "NewPass124" } })).status, 400);
    assert.equal((await req("GET", `/api/auth/reset-password/validate?token=${token}`)).body.valid, true);
  });
  test("concurrent reuse of one token succeeds exactly once", async () => {
    const u = await createUser("Reset Race");
    const token = await resetTokenFor(u);
    const body = { token, password: "RacePass123", confirmPassword: "RacePass123" };
    const results = await Promise.all([1, 2, 3, 4].map(() => req("POST", "/api/auth/reset-password", { body })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  });
  test("successful reset: new password works, old password and old sessions are revoked", async () => {
    const u = await createUser("Reset Success");
    const oldToken = u.token;
    assert.equal((await req("GET", "/api/me", { token: oldToken })).status, 200);
    const resetToken = await resetTokenFor(u);
    const r = await req("POST", "/api/auth/reset-password", { body: { token: resetToken, password: "BrandNew123", confirmPassword: "BrandNew123" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.token, undefined, "no session is issued by the reset endpoint");
    assert.equal((await req("POST", "/api/auth/login", { body: { email: u.user.email, password: "test-password-123" } })).status, 401);
    const login = await req("POST", "/api/auth/login", { body: { email: u.user.email, password: "BrandNew123" } });
    assert.equal(login.status, 200);
    assert.equal((await req("GET", "/api/me", { token: oldToken })).status, 401, "old REST session revoked");
    assert.equal((await req("GET", "/api/me", { token: login.body.token })).status, 200);
    await assert.rejects(
      new Promise((resolve, reject) => {
        const s = ioClient(env.baseUrl, { auth: { token: oldToken }, transports: ["websocket"], reconnection: false, forceNew: true });
        s.once("connect", () => { s.close(); resolve(); });
        s.once("connect_error", (e) => { s.close(); reject(e); });
      }),
      /unauthorized/,
      "old socket session revoked"
    );
    assert.equal((await req("POST", "/api/auth/reset-password", { body: { token: resetToken, password: "Again1234", confirmPassword: "Again1234" } })).status, 400, "token cannot be reused");
  });
});
