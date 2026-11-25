/**
 * NEXUSFLOW Phase 2 — Task 3: Google OIDC hardening and one-time exchange.
 * Google is fully mocked: a local RSA key stands in for Google's JWKS and the
 * token endpoint is intercepted. No live Google calls are made.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser } from "../helpers/fixtures.js";

let env, req, google, OAuthState, AuthExchangeCode, User, limits;
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rogue = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid-1";
let nextIdToken = null; // what the mocked token endpoint returns

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = `${env.baseUrl}/api/auth/google/callback`;
  google = await import("../../services/googleOAuth.js");
  limits = await import("../../utils/rateLimiter.js");
  ({ default: OAuthState } = await import("../../models/OAuthState.js"));
  ({ default: AuthExchangeCode } = await import("../../models/AuthExchangeCode.js"));
  ({ default: User } = await import("../../models/User.js"));
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
  google.googleDeps.fetch = async (url) => {
    if (String(url).startsWith(google.GOOGLE_JWKS_URL)) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (String(url).startsWith(google.GOOGLE_TOKEN_URL)) return new Response(JSON.stringify({ id_token: nextIdToken }), { status: 200 });
    throw new Error("unexpected external call " + url);
  };
});
after(async () => env?.stop());
beforeEach(() => limits.resetAllRateLimiters());

const verifier = () => crypto.randomBytes(32).toString("base64url");
const challengeOf = (v) => crypto.createHash("sha256").update(v).digest("base64url");

/** Start the flow; returns { state, nonce, cookie, location }. */
async function start({ redirect } = {}) {
  const v = verifier();
  const q = new URLSearchParams({ client_challenge: challengeOf(v), ...(redirect ? { redirect } : {}) });
  const res = await fetch(`${env.baseUrl}/api/auth/google?${q}`, { redirect: "manual" });
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, google.GOOGLE_AUTH_URL);
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return { v, state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce"), cookie };
}

function idToken(claims, { key = privateKey, kid = KID } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: "https://accounts.google.com", aud: CLIENT_ID, iat: now, exp: now + 600, email_verified: true, ...claims },
    key,
    { algorithm: "RS256", keyid: kid }
  );
}

async function callback(flow, { cookie = flow.cookie, state = flow.state } = {}) {
  const res = await fetch(`${env.baseUrl}/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(res.status, 302);
  return new URL(res.headers.get("location"));
}

async function fullLogin(claimsFn, opts = {}) {
  const flow = await start(opts);
  nextIdToken = typeof claimsFn === "function" ? claimsFn(flow) : claimsFn;
  const loc = await callback(flow);
  return { flow, loc };
}

const goodClaims = (sub, email, extra = {}) => (flow) => idToken({ sub, email, nonce: flow.nonce, name: "G User", ...extra });

describe("successful flow", () => {
  test("new Google user: code-only redirect, one-time exchange, valid session", async () => {
    const { flow, loc } = await fullLogin(goodClaims("sub-new-1", `g.new.${Date.now()}@gmail.com`));
    assert.ok(loc.searchParams.get("auth_code"), JSON.stringify(Object.fromEntries(loc.searchParams)));
    assert.ok(!loc.href.includes("eyJ"), "no JWT in the redirect URL");
    const ex = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } });
    assert.equal(ex.status, 200);
    assert.equal((await req("GET", "/api/me", { token: ex.body.token })).status, 200);
    const reuse = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } });
    assert.equal(reuse.status, 400, "exchange code is single-use");
  });
  test("existing Google account signs in by stable subject id", async () => {
    const sub = `sub-existing-${Date.now()}`;
    const email = `g.exist.${Date.now()}@gmail.com`;
    const first = await fullLogin(goodClaims(sub, email));
    const second = await fullLogin(goodClaims(sub, email));
    const e1 = await req("POST", "/api/auth/exchange", { body: { code: first.loc.searchParams.get("auth_code"), verifier: first.flow.v } });
    const e2 = await req("POST", "/api/auth/exchange", { body: { code: second.loc.searchParams.get("auth_code"), verifier: second.flow.v } });
    assert.equal(e1.body.user.id, e2.body.user.id);
    assert.equal(await User.countDocuments({ googleId: sub }), 1);
  });
  test("exchange requires the initiating client's verifier (login CSRF)", async () => {
    const { loc } = await fullLogin(goodClaims(`sub-csrf-${Date.now()}`, `g.csrf.${Date.now()}@gmail.com`));
    const r = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: verifier() } });
    assert.equal(r.status, 400);
  });
  test("open redirect attempts are reduced to a same-app path", async () => {
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const { flow, loc } = await fullLogin(goodClaims(`sub-redir-${Math.random()}`, `g.r.${Date.now()}${Math.random()}@gmail.com`), { redirect: evil });
      const ex = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } });
      assert.equal(ex.body.redirectPath, "/");
    }
    const ok = await fullLogin(goodClaims(`sub-redir-ok`, `g.ok.${Date.now()}@gmail.com`), { redirect: "/(tabs)/dashboard" });
    const ex = await req("POST", "/api/auth/exchange", { body: { code: ok.loc.searchParams.get("auth_code"), verifier: ok.flow.v } });
    assert.equal(ex.body.redirectPath, "/(tabs)/dashboard");
  });
});

describe("state handling", () => {
  test("reused state is rejected", async () => {
    const flow = await start();
    nextIdToken = idToken({ sub: "s-reuse", email: `r.${Date.now()}@gmail.com`, nonce: flow.nonce });
    await callback(flow);
    const again = await callback(flow);
    assert.equal(again.searchParams.get("auth_error"), "invalid_state");
  });
  test("invalid state is rejected", async () => {
    const flow = await start();
    assert.equal((await callback(flow, { state: "forged" })).searchParams.get("auth_error"), "invalid_state");
  });
  test("expired state is rejected", async () => {
    const flow = await start();
    await OAuthState.updateOne({ state: flow.state }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await callback(flow)).searchParams.get("auth_error"), "invalid_state");
  });
  test("callback from a different browser (no binding cookie) is rejected", async () => {
    const flow = await start();
    assert.equal((await callback(flow, { cookie: null })).searchParams.get("auth_error"), "state_mismatch");
  });
  test("cancelled consent is reported", async () => {
    const res = await fetch(`${env.baseUrl}/api/auth/google/callback?error=access_denied&state=x`, { redirect: "manual" });
    assert.equal(new URL(res.headers.get("location")).searchParams.get("auth_error"), "cancelled");
  });
  test("start requires a client challenge", async () => {
    const res = await fetch(`${env.baseUrl}/api/auth/google`, { redirect: "manual" });
    assert.equal(res.status, 400);
  });
});

describe("identity token verification", () => {
  const cases = [
    ["incorrect audience", "invalid_audience", (f) => idToken({ sub: "x", email: "a@gmail.com", nonce: f.nonce, aud: "someone-else" })],
    ["incorrect issuer", "invalid_issuer", (f) => idToken({ sub: "x", email: "a@gmail.com", nonce: f.nonce, iss: "https://evil.example" })],
    ["unverified email", "email_not_verified", (f) => idToken({ sub: "x", email: "a@gmail.com", nonce: f.nonce, email_verified: false })],
    ["invalid signature", "invalid_signature", (f) => idToken({ sub: "x", email: "a@gmail.com", nonce: f.nonce }, { key: rogue.privateKey })],
    ["expired identity token", "expired_token", (f) => idToken({ sub: "x", email: "a@gmail.com", nonce: f.nonce, iat: 1000, exp: 2000 })],
    ["nonce mismatch", "invalid_nonce", () => idToken({ sub: "x", email: "a@gmail.com", nonce: "other" })],
  ];
  for (const [label, code, make] of cases) {
    test(`${label} is rejected`, async () => {
      const { loc } = await fullLogin(make);
      assert.equal(loc.searchParams.get("auth_error"), code);
      assert.equal(loc.searchParams.get("auth_code"), null);
    });
  }
});

describe("account linking", () => {
  test("existing password account on a non-Google domain is NOT auto-linked", async () => {
    const local = await createUser("Corp User");
    const { loc } = await fullLogin(goodClaims(`sub-corp-${Date.now()}`, local.user.email));
    assert.equal(loc.searchParams.get("auth_error"), "link_requires_password");
    assert.equal((await User.findById(local.user._id).lean()).googleId, "");
  });
  test("existing gmail password account is linked (Google is the e-mail provider)", async () => {
    const email = `linkme.${Date.now()}@gmail.com`;
    const local = await createUser("Gmail User", { email });
    const sub = `sub-link-${Date.now()}`;
    const { flow, loc } = await fullLogin(goodClaims(sub, email));
    const ex = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } });
    assert.equal(ex.body.user.id, local.id);
    assert.equal((await User.findById(local.user._id).lean()).googleId, sub);
  });
  test("an e-mail already bound to a different Google subject is rejected", async () => {
    const email = `bound.${Date.now()}@gmail.com`;
    await createUser("Bound User", { email, googleId: "sub-original" });
    const { loc } = await fullLogin(goodClaims("sub-attacker", email));
    assert.equal(loc.searchParams.get("auth_error"), "email_conflict");
  });
  test("workspace domain asserted by hd claim may link", async () => {
    const email = `ws.${Date.now()}@school.example`;
    const local = await createUser("Workspace User", { email });
    const { flow, loc } = await fullLogin(goodClaims(`sub-hd-${Date.now()}`, email, { hd: "school.example" }));
    const ex = await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } });
    assert.equal(ex.body.user.id, local.id);
  });
});

describe("exchange codes", () => {
  test("expired exchange code is rejected", async () => {
    const { flow, loc } = await fullLogin(goodClaims(`sub-exp-${Date.now()}`, `exp.${Date.now()}@gmail.com`));
    await AuthExchangeCode.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await req("POST", "/api/auth/exchange", { body: { code: loc.searchParams.get("auth_code"), verifier: flow.v } })).status, 400);
  });
  test("legacy ?token= URLs are no longer issued by the callback", async () => {
    const { loc } = await fullLogin(goodClaims(`sub-legacy-${Date.now()}`, `legacy.${Date.now()}@gmail.com`));
    assert.equal(loc.searchParams.get("token"), null);
    assert.equal(loc.searchParams.get("google"), null);
  });
});
