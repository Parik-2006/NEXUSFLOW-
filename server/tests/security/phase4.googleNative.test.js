/**
 * NEXUSFLOW Phase 4 — Task 14: native Google sign-in callback (simulated, mocked Google).
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

async function startNative(v = verifier()) {
  const q = new URLSearchParams({ client_challenge: challengeOf(v), platform: "native" });
  const res = await fetch(`${env.baseUrl}/api/auth/google?${q}`, { redirect: "manual" });
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  return { v, state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce"), cookie: res.headers.get("set-cookie").split(";")[0] };
}
async function nativeCallbackRaw(flow, opts = {}) {
  const res = await fetch(`${env.baseUrl}/api/auth/google/callback?code=abc&state=${encodeURIComponent(opts.state ?? flow.state)}`, {
    redirect: "manual", headers: opts.cookie === null ? {} : { Cookie: opts.cookie ?? flow.cookie },
  });
  assert.equal(res.status, 302);
  return res.headers.get("location");
}

describe("native Google sign-in (server side; device flow not verified)", () => {
  test("native flow delivers a one-time code ONLY to the app deep link (no JWT in URL)", async () => {
    const flow = await startNative();
    nextIdToken = idToken({ sub: "g-native-1", email: "native1@gmail.com", nonce: flow.nonce });
    const loc = await nativeCallbackRaw(flow);
    assert.match(loc, /^nexusflow:\/\/auth\/callback\?auth_code=[A-Za-z0-9_-]+$/);
    assert.ok(!/token=|eyJ/.test(loc));
    const code = new URL(loc.replace("nexusflow://", "https://x/")).searchParams.get("auth_code");
    const ok = await req("POST", "/api/auth/exchange", { body: { code, verifier: flow.v } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    const reuse = await req("POST", "/api/auth/exchange", { body: { code, verifier: flow.v } });
    assert.equal(reuse.status, 400, "exchange code is single-use");
  });
  test("a code cannot be redeemed by an unrelated initiating session (wrong verifier)", async () => {
    const flow = await startNative();
    nextIdToken = idToken({ sub: "g-native-2", email: "native2@gmail.com", nonce: flow.nonce });
    const code = new URL((await nativeCallbackRaw(flow)).replace("nexusflow://", "https://x/")).searchParams.get("auth_code");
    assert.equal((await req("POST", "/api/auth/exchange", { body: { code, verifier: verifier() } })).status, 400);
  });
  test("errors, cancellation and binding mismatch are sent to the app deep link as error codes", async () => {
    const flow = await startNative();
    const cancelled = await fetch(`${env.baseUrl}/api/auth/google/callback?error=access_denied&state=${flow.state}`, { redirect: "manual", headers: { Cookie: flow.cookie } });
    assert.equal(cancelled.headers.get("location"), "nexusflow://auth/callback?auth_error=cancelled");
    const flow2 = await startNative();
    nextIdToken = idToken({ sub: "g-native-3", email: "n3@gmail.com", nonce: flow2.nonce });
    assert.equal(await nativeCallbackRaw(flow2, { cookie: null }), "nexusflow://auth/callback?auth_error=state_mismatch");
    // replayed state
    const flow3 = await startNative();
    nextIdToken = idToken({ sub: "g-native-4", email: "n4@gmail.com", nonce: flow3.nonce });
    await nativeCallbackRaw(flow3);
    assert.match(await nativeCallbackRaw(flow3), /auth_error=invalid_state/);
  });
  test("the native destination is server-configured, never request-supplied; unsafe schemes are refused", async () => {
    const r = await fetch(`${env.baseUrl}/api/auth/google?client_challenge=${challengeOf(verifier())}&platform=native&redirect=evil://x`, { redirect: "manual" });
    assert.equal(r.status, 302);
    const { nativeCallbackBase } = await import("../../routes/auth.js");
    assert.equal(nativeCallbackBase({ GOOGLE_NATIVE_REDIRECT_SCHEME: "https" }), null);
    assert.equal(nativeCallbackBase({ GOOGLE_NATIVE_REDIRECT_SCHEME: "javascript" }), null);
    assert.equal(nativeCallbackBase({}), "nexusflow://auth/callback");
  });
  test("web flow unchanged: code delivered to the web frontend", async () => {
    const { loc } = await fullLogin((f) => idToken({ sub: "g-web-1", email: "web1@gmail.com", nonce: f.nonce }));
    assert.ok(loc.searchParams.get("auth_code"));
    assert.ok(loc.protocol.startsWith("http"));
  });
});
