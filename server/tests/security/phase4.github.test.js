/**
 * NEXUSFLOW Phase 4 — GitHub credential cryptography (AES-256-GCM), legacy
 * migration, credential ownership, API error handling and repository sync.
 * Synthetic keys / tokens only; every GitHub HTTP call is mocked.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

const KEY = crypto.randomBytes(32).toString("base64");
const KEY2 = crypto.randomBytes(32).toString("base64");
const LEGACY = "legacy-synthetic-encryption-key-0123456789";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
process.env.GITHUB_TOKEN_ENCRYPTION_KEY_ID = "k1";

const { startTestEnvironment, makeClient } = await import("../helpers/testEnv.js");
const { createSecurityWorld } = await import("../helpers/fixtures.js");
const C = await import("../../services/githubTokenCrypto.js");

let env, req, W, GH, GitHubCredential, GitHubIntegration, RepositoryIndex, mig;
const uid = () => new mongoose.Types.ObjectId().toString();
const TOKEN = "gho_" + "x".repeat(36); // synthetic

/** Legacy AES-256-CBC value exactly as the pre-Phase-4 code produced it. */
function legacyEncrypt(plain, raw = LEGACY) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-cbc", Buffer.from(raw.padEnd(32, "_").slice(0, 32)), iv);
  return iv.toString("hex") + ":" + Buffer.concat([c.update(plain, "utf8"), c.final()]).toString("hex");
}

describe("AES-256-GCM token envelope", () => {
  const u1 = uid(), u2 = uid();
  test("round trip, versioned envelope, fresh 12-byte nonce, no plaintext", () => {
    const a = C.encryptGitHubToken(TOKEN, { userId: u1 });
    const b = C.encryptGitHubToken(TOKEN, { userId: u1 });
    assert.match(a, /^nf1\.a256gcm\.k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.notEqual(a, b, "different nonces for repeated plaintext");
    assert.equal(Buffer.from(a.split(".")[3], "base64url").length, 12);
    assert.equal(Buffer.from(a.split(".")[5], "base64url").length, 16);
    assert.ok(!a.includes(TOKEN) && !a.includes(Buffer.from(TOKEN).toString("base64")));
    assert.equal(C.decryptGitHubToken(a, { userId: u1 }), TOKEN);
  });
  test("modified ciphertext, modified tag, wrong key, wrong owner, invalid envelope all fail closed", () => {
    const e = C.encryptGitHubToken(TOKEN, { userId: u1 });
    const p = e.split(".");
    const flip = (s) => { const b = Buffer.from(s, "base64url"); b[0] ^= 1; return b.toString("base64url"); };
    for (const bad of [[...p.slice(0, 4), flip(p[4]), p[5]], [...p.slice(0, 5), flip(p[5])]]) {
      assert.throws(() => C.decryptGitHubToken(bad.join("."), { userId: u1 }), (x) => x.code === "AUTH_FAILED");
    }
    assert.throws(() => C.decryptGitHubToken(e, { userId: u1 }, { GITHUB_TOKEN_ENCRYPTION_KEY: KEY2 }), (x) => x.code === "AUTH_FAILED");
    assert.throws(() => C.decryptGitHubToken(e, { userId: u2 }), (x) => x.code === "AUTH_FAILED", "ciphertext moved to another user's record");
    for (const bad of ["", "nf1.a256gcm.k1.x", "nf2.a256gcm.k1.a.b.c", "garbage"]) assert.throws(() => C.decryptGitHubToken(bad, { userId: u1 }));
    assert.throws(() => C.encryptGitHubToken(TOKEN, { userId: "not-an-id" }), (x) => x.code === "CONTEXT_INVALID");
  });
  test("missing / malformed keys fail safely; no development fallback", () => {
    assert.throws(() => C.encryptGitHubToken(TOKEN, { userId: u1 }, {}), (x) => x.code === "KEY_MISSING");
    assert.throws(() => C.encryptGitHubToken(TOKEN, { userId: u1 }, { GITHUB_TOKEN_ENCRYPTION_KEY: "short" }), (x) => x.code === "KEY_INVALID");
    assert.equal(C.encryptionStatus({}).configured, false);
  });
  test("key rotation: previous key ids still decrypt, new writes use the active key", () => {
    const old = C.encryptGitHubToken(TOKEN, { userId: u1 }, { GITHUB_TOKEN_ENCRYPTION_KEY: KEY, GITHUB_TOKEN_ENCRYPTION_KEY_ID: "k1" });
    const rotated = { GITHUB_TOKEN_ENCRYPTION_KEY: KEY2, GITHUB_TOKEN_ENCRYPTION_KEY_ID: "k2", GITHUB_TOKEN_PREVIOUS_KEYS: `k1:${KEY}` };
    assert.equal(C.decryptGitHubToken(old, { userId: u1 }, rotated), TOKEN);
    assert.match(C.encryptGitHubToken(TOKEN, { userId: u1 }, rotated), /^nf1\.a256gcm\.k2\./);
    assert.throws(() => C.decryptGitHubToken(old, { userId: u1 }, { GITHUB_TOKEN_ENCRYPTION_KEY: KEY2, GITHUB_TOKEN_ENCRYPTION_KEY_ID: "k2" }), (x) => x.code === "KEY_UNKNOWN");
  });
  test("legacy CBC values decrypt only with the explicitly configured legacy key", () => {
    const legacy = legacyEncrypt(TOKEN);
    assert.ok(C.isLegacyCiphertext(legacy));
    assert.throws(() => C.decryptGitHubToken(legacy, { userId: u1 }), (x) => x.code === "LEGACY_KEY_MISSING");
    assert.equal(C.decryptGitHubToken(legacy, { userId: u1 }, { ...process.env, GITHUB_TOKEN_LEGACY_KEY: LEGACY }), TOKEN);
    assert.throws(() => C.decryptLegacy(legacy, { GITHUB_TOKEN_LEGACY_KEY: "wrong-legacy-key-value-000000000000" }), (x) => x.code === "LEGACY_DECRYPT_FAILED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
const json = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) });
let ghCalls = [];
let ghRoute = () => json(404, {});
let integrationA;

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  GH = await import("../../services/githubService.js");
  ({ default: GitHubCredential } = await import("../../models/GitHubCredential.js"));
  ({ default: GitHubIntegration } = await import("../../models/GitHubIntegration.js"));
  ({ default: RepositoryIndex } = await import("../../models/RepositoryIndex.js"));
  mig = await import("../../services/githubCredentialMigration.js");
  GH.githubDeps.fetch = async (url, init) => { ghCalls.push(url); return ghRoute(url, init); };
  W = await createSecurityWorld();
});
after(async () => env?.stop());
beforeEach(async () => {
  ghCalls = [];
  await GitHubCredential.deleteMany({});
  await GitHubIntegration.deleteMany({});
  await RepositoryIndex.deleteMany({});
  const owner = W.ownerA.user._id;
  await GitHubCredential.create({ userId: owner, githubLogin: "owner-a", encryptedToken: C.encryptGitHubToken(TOKEN, { userId: String(owner) }) });
  integrationA = await GitHubIntegration.create({
    userId: owner, teamId: W.A.teamId, projectId: W.A.projectId, repoOwner: "acme", repoName: "app",
    repoFullName: "acme/app", isActive: true, connectionStatus: "connected", selectedBranch: "main",
    encryptedToken: C.encryptGitHubToken(TOKEN, { userId: String(owner) }),
  });
});

describe("credential ownership and authorization", () => {
  test("a member without their own GitHub credential cannot use another member's token to connect a repo", async () => {
    ghRoute = () => json(200, { id: 1, name: "secret", full_name: "acme/secret", owner: { login: "acme" }, private: true });
    const r = await req("POST", `/api/projects/${W.A.projectId}/github/connect`, { token: W.memberA.token, body: { repoOwner: "acme", repoName: "secret" } });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "GITHUB_NOT_AUTHORIZED");
    assert.equal(ghCalls.length, 0, "no GitHub call made with someone else's token");
  });
  test("a token copied onto another user's integration record cannot be decrypted", async () => {
    const stolen = await GitHubIntegration.findById(integrationA._id).select("+encryptedToken").lean();
    assert.throws(() => GH.decryptToken({ encryptedToken: stolen.encryptedToken, userId: String(W.memberA.user._id) }), (e) => e.kind === "CREDENTIAL");
  });
  test("cross-workspace users cannot read or sync another workspace's repository", async () => {
    for (const [m, p] of [["GET", "summary"], ["POST", "sync"], ["GET", "status"]]) {
      const r = await req(m, `/api/projects/${W.A.projectId}/github/${p}`, { token: W.ownerB.token });
      assert.ok([403, 404].includes(r.status), `${p}: ${r.status}`);
    }
    assert.equal(ghCalls.length, 0);
  });
  test("injected owner/repo names are rejected before any request", async () => {
    await assert.rejects(GH.validateRepoAccess({ encryptedToken: "x", userId: uid() }, "../../user", "repos"), (e) => e.kind === "INVALID_REQUEST");
  });
});

describe("GitHub API error handling", () => {
  test("revoked token → 401 reconnect-required and truthful integration state", async () => {
    ghRoute = () => json(401, { message: "Bad credentials" });
    const r = await req("GET", `/api/projects/${W.A.projectId}/github/summary`, { token: W.ownerA.token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "GITHUB_RECONNECT_REQUIRED");
    assert.ok(!JSON.stringify(r.body).includes("Bad credentials"), "no raw upstream message");
    assert.equal((await GitHubIntegration.findById(integrationA._id).lean()).connectionStatus, "reconnect_required");
  });
  test("rate limit (primary and secondary) → 429 with Retry-After, rate_limited state", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    ghRoute = () => json(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) });
    const r = await req("GET", `/api/projects/${W.A.projectId}/github/summary`, { token: W.ownerA.token });
    assert.equal(r.status, 429);
    assert.equal((await GitHubIntegration.findById(integrationA._id).lean()).connectionStatus, "rate_limited");
    ghRoute = () => json(403, { message: "You have exceeded a secondary rate limit" }, { "retry-after": "30" });
    await assert.rejects(GH.fetchLatestCommit({ encryptedToken: (await GitHubIntegration.findById(integrationA._id).select("+encryptedToken").lean()).encryptedToken, userId: String(W.ownerA.user._id) }, "acme", "app"), (e) => e.kind === "RATE_LIMITED" && e.retryAfterMs === 30000);
  });
  test("pagination follows Link headers on api.github.com only, bounded to 5 pages", async () => {
    let n = 0;
    ghRoute = (url) => { n++; return json(200, [{ id: n, name: `r${n}`, full_name: `a/r${n}`, owner: { login: "a" } }], { link: `<https://api.github.com/user/repos?page=${n + 1}>; rel="next"` }); };
    const cred = { encryptedToken: C.encryptGitHubToken(TOKEN, { userId: String(W.ownerA.user._id) }), userId: String(W.ownerA.user._id) };
    assert.equal((await GH.fetchUserRepos(cred)).length, 5);
    n = 0;
    ghRoute = () => json(200, [{ id: 1, name: "r", full_name: "a/r", owner: { login: "a" } }], { link: `<https://evil.example/next>; rel="next"` });
    assert.equal((await GH.fetchUserRepos(cred)).length, 1, "off-domain Link ignored");
  });
});

describe("incremental synchronisation and indexing", () => {
  const SHA1 = "a".repeat(40), SHA2 = "b".repeat(40);
  const tree = (n) => [
    { path: ".env", type: "blob", size: 10 }, { path: "config/.env.production", type: "blob", size: 10 },
    { path: "keys/id_rsa", type: "blob", size: 10 }, { path: "certs/server.pem", type: "blob", size: 10 },
    { path: "node_modules/x/index.js", type: "blob", size: 10 }, { path: "logo.png", type: "blob", size: 10 },
    { path: "package-lock.json", type: "blob", size: 10 }, { path: "big.bin.js", type: "blob", size: 5_000_000 },
    { path: "README.md", type: "blob", size: 100 },
    ...Array.from({ length: n }, (_, i) => ({ path: `src/module${i}.js`, type: "blob", size: 200 })),
  ];
  const repoRoutes = (sha, n = 10) => (url) => {
    if (url.includes("/commits/main")) return json(200, { sha, commit: { message: "m", author: { name: "a", date: new Date().toISOString() } } });
    if (url.includes("/git/trees/")) return json(200, { sha, truncated: false, tree: tree(n) });
    if (url.includes("/contents/README.md")) return json(200, { type: "file", size: 80, content: Buffer.from("# App\nAPI_KEY=sk-" + "z".repeat(30)).toString("base64") });
    if (/\/repos\/acme\/app$/.test(url)) return json(200, { html_url: "https://github.com/acme/app", default_branch: "main", private: true });
    return json(200, []);
  };

  test("first sync indexes source files and excludes secrets, binaries, generated and oversized files", async () => {
    ghRoute = repoRoutes(SHA1);
    const r = await req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token, body: { force: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const idx = await RepositoryIndex.findOne({ projectId: W.A.projectId }).lean();
    const paths = idx.files.map((f) => f.path);
    for (const p of [".env", "config/.env.production", "keys/id_rsa", "certs/server.pem", "node_modules/x/index.js", "logo.png", "package-lock.json", "big.bin.js"]) assert.ok(!paths.includes(p), p);
    assert.ok(paths.includes("README.md") && paths.includes("src/module0.js"));
    const readme = idx.files.find((f) => f.path === "README.md");
    assert.ok(!String(readme.contentSnippet || "").includes("sk-zzzz"), "secret redacted from stored snippet");
    assert.ok(ghCalls.some((u) => u.includes(`/git/trees/${SHA1}`)), "tree read at the exact commit SHA");
  });
  test("unchanged commit ⇒ exactly one GitHub request; updated commit ⇒ re-index", async () => {
    ghRoute = repoRoutes(SHA1);
    ghCalls = [];
    await req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token, body: { force: true } });
    const initialRequests = ghCalls.length;
    ghCalls = [];
    const same = await req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token });
    assert.equal(same.body.noop, true);
    assert.equal(ghCalls.length, 1);
    console.log(`[measure] github sync requests: initial=${initialRequests} unchanged=${ghCalls.length}`);
    ghRoute = repoRoutes(SHA2);
    ghCalls = [];
    const changed = await req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token });
    assert.equal(changed.body.commitSha, SHA2);
    console.log(`[measure] github sync requests: updated-commit=${ghCalls.length}`);
    assert.ok(ghCalls.length > 1);
  });
  test("large repository is bounded (250 files) and reported", async () => {
    ghRoute = repoRoutes(SHA1, 400);
    const r = await req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token, body: { force: true } });
    assert.equal(r.body.filesIndexed, 250);
    assert.ok(r.body.skippedForLimit > 0);
  });
  test("duplicate concurrent synchronisation is rejected (atomic claim)", async () => {
    ghRoute = async (url) => { await new Promise((res) => setTimeout(res, 80)); return repoRoutes(SHA1)(url); };
    const [a, b] = await Promise.all([1, 2].map(() => req("POST", `/api/projects/${W.A.projectId}/github/sync`, { token: W.ownerA.token, body: { force: true } })));
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
  test("disconnection removes the stored token copy", async () => {
    const r = await req("DELETE", `/api/projects/${W.A.projectId}/github`, { token: W.ownerA.token });
    assert.equal(r.status, 200);
    const doc = await GitHubIntegration.findById(integrationA._id).select("+encryptedToken").lean();
    assert.equal(doc.encryptedToken, undefined);
    assert.equal(doc.isActive, false);
  });
});

describe("legacy credential migration (in-memory DB only)", () => {
  test("dry run writes nothing; apply migrates, is idempotent, and marks unrecoverable records", async () => {
    const u = W.memberA.user._id;
    const legacyGood = legacyEncrypt(TOKEN);
    const legacyBad = legacyEncrypt(TOKEN, "some-other-legacy-key-000000000000000");
    const good = await GitHubCredential.create({ userId: u, encryptedToken: legacyGood });
    const bad = await GitHubIntegration.create({ userId: u, teamId: W.A.teamId, projectId: new mongoose.Types.ObjectId(), repoFullName: "x/y", isActive: false, encryptedToken: legacyBad });
    const envM = { ...process.env, GITHUB_TOKEN_LEGACY_KEY: LEGACY };
    const plan = await mig.planGitHubTokenMigration({ env: envM });
    assert.equal(plan.report.GitHubCredential.counts.legacy_recoverable, 1);
    assert.equal(plan.report.GitHubIntegration.counts.legacy_unrecoverable, 1);
    assert.equal((await GitHubCredential.findById(good._id).select("+encryptedToken").lean()).encryptedToken, legacyGood, "dry run unchanged");
    const r1 = await mig.applyGitHubTokenMigration({ env: envM });
    assert.equal(r1.result.GitHubCredential.migrated, 1);
    assert.equal(r1.result.GitHubIntegration.markedForReconnect, 1);
    const migrated = (await GitHubCredential.findById(good._id).select("+encryptedToken").lean()).encryptedToken;
    assert.ok(C.isEnvelope(migrated));
    assert.equal(C.decryptGitHubToken(migrated, { userId: String(u) }), TOKEN);
    assert.equal((await GitHubIntegration.findById(bad._id).lean()).connectionStatus, "reconnect_required");
    const r2 = await mig.applyGitHubTokenMigration({ env: envM });
    assert.equal(r2.result.GitHubCredential.migrated, 0, "idempotent");
    assert.ok(!JSON.stringify([plan, r1, r2]).includes(TOKEN), "no plaintext in reports");
  });
  test("migration refuses to run without a valid new key (no partial migration)", async () => {
    await GitHubCredential.create({ userId: W.managerA.user._id, encryptedToken: legacyEncrypt(TOKEN) });
    await assert.rejects(mig.applyGitHubTokenMigration({ env: { GITHUB_TOKEN_LEGACY_KEY: LEGACY } }), (e) => e.code === "KEY_MISSING");
  });
});
