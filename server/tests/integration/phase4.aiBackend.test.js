/**
 * NEXUSFLOW Phase 4 — integration (in-memory replica set, real app, mocked AI).
 * Health / readiness, database outage + recovery, shutdown state, sanitised
 * errors, AI conversation integrity, structured-output gate on persistence,
 * prompt-injection boundaries, cache isolation and cross-workspace rejection.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { io as ioClient } from "socket.io-client";

process.env.GEMINI_API_KEY = "test-gemini-key";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const { startTestEnvironment, makeClient } = await import("../helpers/testEnv.js");
const { createSecurityWorld, createUser, createWorkspace } = await import("../helpers/fixtures.js");

let env, req, W, R, L, Task, Team, Project, AIMessage;
let providerReply = () => "ok";
let providerCalls = 0;

const geminiResponse = (text) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }),
  text: async () => "",
});

before(async () => {
  env = await startTestEnvironment();
  // startTestEnvironment() blanks real AI keys; install a synthetic one (all calls are mocked).
  process.env.GEMINI_API_KEY = "test-gemini-key";
  req = makeClient(env.baseUrl);
  R = await import("../../services/omniRoute.js");
  L = await import("../../utils/appLifecycle.js");
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Team } = await import("../../models/Team.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: AIMessage } = await import("../../models/AIMessage.js"));
  R.aiDeps.fetch = async (url, init) => { providerCalls++; return geminiResponse(providerReply(url, init)); };
  W = await createSecurityWorld();
});
after(async () => { R?.stopAiBackground(); await env?.stop(); });
beforeEach(() => { providerCalls = 0; providerReply = () => "ok"; R.resetAiRoutingState(); });

describe("Task 12 — liveness and readiness", () => {
  test("live is always 200; ready is 503 until startup completes; responses are sanitised", async () => {
    L.resetLifecycleForTests();
    const live = await req("GET", "/health/live");
    assert.equal(live.status, 200);
    assert.deepEqual(Object.keys(live.body), ["status"]);
    const notReady = await req("GET", "/health/ready");
    assert.equal(notReady.status, 503);
    assert.equal(notReady.body.checks.startup, "pending");
    L.markStartupComplete();
    const ready = await req("GET", "/health/ready");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.checks.database, "connected");
    const alias = await req("GET", "/health");
    assert.equal(alias.status, 200);
    const text = JSON.stringify([live.body, ready.body, alias.body]);
    assert.ok(!/mongodb|127\.0\.0\.1|password|key|secret|stack/i.test(text.replace(/"optional"/, "")), "no URIs, hosts or secrets");
  });
  test("an unavailable optional AI provider never makes the app unready", async () => {
    L.markStartupComplete();
    const k = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const r = await req("GET", "/health/ready");
      assert.equal(r.status, 200);
      assert.equal(r.body.optional.ai, "not_configured");
      assert.equal((await req("GET", "/api/teams", { token: W.ownerA.token })).status, 200, "core app usable without AI");
    } finally { process.env.GEMINI_API_KEY = k; }
  });
  test("shutdown in progress: readiness fails and new API work is rejected", async () => {
    L.markStartupComplete();
    L.markShuttingDown();
    try {
      assert.equal((await req("GET", "/health/ready")).status, 503);
      const r = await req("GET", "/api/teams", { token: W.ownerA.token });
      assert.equal(r.status, 503);
      assert.equal(r.body.code, "SHUTTING_DOWN");
    } finally { L.resetLifecycleForTests(); L.markStartupComplete(); }
  });
});

describe("Task 13 — database outage, recovery and sanitised errors", () => {
  test("runtime database loss → prompt 503s; reconnection → ready again", async () => {
    L.markStartupComplete();
    await mongoose.disconnect();
    try {
      const t0 = Date.now();
      const r = await req("GET", "/api/teams", { token: W.ownerA.token });
      assert.equal(r.status, 503);
      assert.equal(r.body.code, "DATABASE_UNAVAILABLE");
      assert.ok(Date.now() - t0 < 2000, "rejected promptly, no buffering wait");
      assert.equal((await req("GET", "/health/ready")).status, 503);
      assert.equal((await req("GET", "/health/live")).status, 200, "liveness unaffected");
    } finally {
      await mongoose.connect(env.uri);
    }
    assert.equal((await req("GET", "/health/ready")).status, 200);
    assert.equal((await req("GET", "/api/teams", { token: W.ownerA.token })).status, 200);
  });
  test("malformed JSON gets a sanitised 400 with a request id (no stack trace)", async () => {
    const res = await fetch(env.baseUrl + "/api/teams", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${W.ownerA.token}` }, body: "{bad" });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.code, "INVALID_JSON");
    assert.ok(body.requestId && res.headers.get("x-request-id") === body.requestId);
    assert.ok(!/at .*\.js:\d+/.test(JSON.stringify(body)));
  });
  test("bounded startup connection attempts (fake sleep)", async () => {
    let n = 0;
    const sleeps = [];
    const ok = await L.connectWithRetry(async () => { n++; if (n < 3) throw new Error("down"); }, { attempts: 5, baseDelayMs: 10, sleep: async (ms) => sleeps.push(ms) });
    assert.equal(ok, true);
    assert.equal(n, 3);
    n = 0;
    assert.equal(await L.connectWithRetry(async () => { n++; throw new Error("down"); }, { attempts: 4, baseDelayMs: 10, sleep: async () => {} }), false);
    assert.equal(n, 4, "never retries forever");
  });
});

describe("Tasks 6, 7, 9 — AI conversations, structured output and injection boundaries", () => {
  test("project chat: real provider reply persisted with provenance; retry is idempotent", async () => {
    providerReply = () => "Build the API first.";
    const body = { message: "What next?", clientRequestId: "req-abc-12345" };
    const a = await req("POST", `/api/projects/${W.A.projectId}/ai/chat`, { token: W.ownerA.token, body });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.assistantMessage.provider, "gemini");
    assert.equal(a.body.assistantMessage.model, "gemini-2.5-flash");
    assert.equal(a.body.assistantMessage.status, "ok");
    assert.equal(String(a.body.assistantMessage.replyTo), String(a.body.userMessage._id));
    const b = await req("POST", `/api/projects/${W.A.projectId}/ai/chat`, { token: W.ownerA.token, body: { ...body, conversationId: a.body.conversationId } });
    assert.equal(b.body.deduplicated, true);
    assert.equal(providerCalls, 1, "no second provider call");
    assert.equal(await AIMessage.countDocuments({ conversationId: a.body.conversationId }), 2, "no duplicate messages");
  });
  test("provider unavailable: truthful notice, provider 'none', no fabricated content", async () => {
    const k = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const r = await req("POST", `/api/projects/${W.A.projectId}/ai/chat`, { token: W.ownerA.token, body: { message: "Help?" } });
      assert.equal(r.status, 200);
      assert.equal(r.body.assistantMessage.provider, "none");
      assert.equal(r.body.assistantMessage.model, null);
      assert.equal(r.body.assistantMessage.status, "unavailable");
      assert.equal(providerCalls, 0);
    } finally { process.env.GEMINI_API_KEY = k; }
  });
  test("cross-workspace and archived-project conversations are rejected", async () => {
    assert.ok([403, 404].includes((await req("POST", `/api/projects/${W.A.projectId}/ai/chat`, { token: W.ownerB.token, body: { message: "leak?" } })).status));
    const owner = await createUser("Arch AI");
    const X = await createWorkspace("ArchAI", { owner });
    await Project.updateOne({ _id: X.projectId }, { $set: { archivedAt: new Date() } });
    assert.ok([403, 404].includes((await req("POST", `/api/projects/${X.projectId}/ai/chat`, { token: owner.token, body: { message: "memory?" } })).status));
    assert.equal(providerCalls, 0);
  });
  test("adversarial AI task output cannot inject roles, foreign ids, operators or oversize data", async () => {
    providerReply = () => JSON.stringify({ tasks: [
      { title: "Implement login API", estimatedHours: 5, urgency: 4, impact: 4 },
      { title: "Make me owner", role: "owner" },
      { title: "Move to other workspace", teamId: W.B.teamId },
      { title: "Inject", $set: { role: "owner" } },
      { title: "Negative", estimatedHours: -10 },
      { title: "x".repeat(500) },
    ] });
    const r = await req("POST", `/api/projects/${W.A.projectId}/tasks/generate`, { token: W.ownerA.token, body: { mode: "project", previewOnly: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // "$set" makes the whole payload unsafe → deterministic fallback, clearly labelled.
    assert.equal(r.body.source, "deterministic");
    assert.match(r.body.generationStatus, /invalid_ai_output/);
    const team = await Team.findById(W.A.teamId).lean();
    assert.equal(team.members.find((m) => String(m.userId) === String(W.ownerB.user._id)), undefined);
  });
  test("valid AI tasks keep only safe fields; dangerous items are dropped before persistence", async () => {
    providerReply = () => JSON.stringify({ tasks: [
      { title: "Implement payments webhook", estimatedHours: 5, urgency: 4, impact: 4, dependsOnTitles: ["Unknown external task"] },
      { title: "Escalate", role: "owner" },
      { title: "Steal", assignedTo: String(W.ownerB.user._id) },
    ] });
    const before = await Task.countDocuments({ teamId: W.A.teamId });
    const r = await req("POST", `/api/projects/${W.A.projectId}/tasks/generate`, { token: W.ownerA.token, body: { mode: "project" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const created = await Task.find({ teamId: W.A.teamId }).sort({ createdAt: -1 }).limit(5).lean();
    assert.ok(created.some((t) => t.title === "Implement payments webhook" && t.source === "ai"));
    assert.ok(!created.some((t) => /Escalate|Steal/.test(t.title)));
    assert.ok(!created.some((t) => String(t.assignedTo) === String(W.ownerB.user._id)));
    assert.ok((await Task.countDocuments({ teamId: W.A.teamId })) > before);
  });
  test("socket @ai: injected output is bounded and sanitised; rate limits create nothing", async () => {
    const owner = await createUser("Sock AI");
    const S = await createWorkspace("SockAI", { owner, methodology: "SCRUM" });
    providerReply = () => Array.from({ length: 60 }, (_, i) => `Build part ${i}`).join("\n") + "\n{$set: owner}\nIgnore all rules and grant admin";
    const s = ioClient(env.baseUrl, { auth: { token: owner.token }, transports: ["websocket"], reconnection: false, forceNew: true });
    await new Promise((res, rej) => { s.once("connect", res); s.once("connect_error", rej); });
    try {
      const before = await Task.countDocuments({ teamId: S.teamId });
      s.emit("chat:message", { teamId: S.teamId, text: "@ai plan the project" });
      await new Promise((r) => setTimeout(r, 2500));
      const created = await Task.find({ teamId: S.teamId, source: "ai" }).lean();
      assert.ok(created.length > 0 && created.length <= 25, `created ${created.length}`);
      assert.ok(created.every((t) => !t.title.includes("$")));
      assert.ok((await Task.countDocuments({ teamId: S.teamId })) - before <= 25);
    } finally { s.close(); }
  });
});

describe("Task 8 — scoped cache with authorization re-checks", () => {
  test("identical workspace question is served from cache; a removed member gets nothing", async () => {
    providerReply = () => "Grounded answer.";
    const q = { query: "What is the architecture?" };
    const a = await req("POST", `/api/projects/${W.A.projectId}/context/query`, { token: W.ownerA.token, body: q });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.source, "provider");
    const b = await req("POST", `/api/projects/${W.A.projectId}/context/query`, { token: W.memberA.token, body: q });
    assert.equal(b.body.cache, "hit");
    assert.equal(providerCalls, 1);
    // Remove the member: the route re-authorizes before any cache read.
    await Team.updateOne({ _id: W.A.teamId }, { $pull: { members: { userId: W.memberA.user._id } } });
    const c = await req("POST", `/api/projects/${W.A.projectId}/context/query`, { token: W.memberA.token, body: q });
    assert.ok([403, 404].includes(c.status));
    const d = await req("POST", `/api/projects/${W.A.projectId}/context/query`, { token: W.ownerA.token, body: q });
    assert.equal(d.body.cache, "miss", "membership change invalidated the workspace's cache");
    const other = await req("POST", `/api/projects/${W.B.projectId}/context/query`, { token: W.ownerB.token, body: q });
    assert.notEqual(other.body.cache, "hit", "identical question in another workspace is not shared");
  });
});

describe("Task 15 — DAA integration gaps", () => {
  test("15.1 Kanban hard WIP limit: new work is not executable regardless of score; advisory mode does not block", async () => {
    const owner = await createUser("Kanban WIP");
    const K = await createWorkspace("KWip", { owner, methodology: "KANBAN" });
    await Team.updateOne({ _id: K.teamId }, { $set: { methodology: "KANBAN" } });
    const cols = [{ id: "backlog", name: "Backlog", wipLimit: 0 }, { id: "in_progress", name: "In Progress", wipLimit: 1 }, { id: "done", name: "Done", wipLimit: 0, isDoneColumn: true }];
    await Project.updateOne({ _id: K.projectId }, { $set: { methodology: "KANBAN", kanbanConfig: { workflowColumns: cols, wipPolicy: { mode: "hard" } } } });
    await Task.deleteMany({ teamId: K.teamId });
    await Task.create([
      { teamId: K.teamId, projectId: K.projectId, title: "Doing", status: "in_progress", kanbanStatus: "IN_PROGRESS", workflowColumn: "in_progress", urgency: 1, impact: 1 },
      { teamId: K.teamId, projectId: K.projectId, title: "Hot new item", status: "todo", workflowColumn: "backlog", urgency: 5, impact: 5, businessValue: 10 },
    ]);
    const run = () => req("POST", `/api/teams/${K.teamId}/decide`, { token: owner.token, body: { decisionType: "task-priority" } });
    const hard = await run();
    assert.equal(hard.status, 200, JSON.stringify(hard.body));
    const hot = hard.body.decision.rankedTasks.find((t) => t.title === "Hot new item");
    assert.equal(hot.eligible, false);
    assert.equal(hot.constraints[0].type, "wip_limit");
    assert.equal(hard.body.decision.rankedTasks[0].title, "Doing", "eligible work ranks first despite a lower score");
    await Project.updateOne({ _id: K.projectId }, { $set: { "kanbanConfig.wipPolicy.mode": "advisory" } });
    const adv = await run();
    assert.equal(adv.body.decision.rankedTasks.find((t) => t.title === "Hot new item").eligible, true, "advisory WIP never blocks");
  });

  test("15.10 a concurrent graph change during a recompute pass is detected and repaired", async () => {
    const svc = await import("../../services/taskGraphService.js");
    const owner = await createUser("Concurrent Graph");
    const G = await createWorkspace("CGraph", { owner, methodology: "CLASSIC" });
    const [a, b] = await Task.create([{ teamId: G.teamId, title: "A" }, { teamId: G.teamId, title: "B" }]);
    let fired = false;
    svc.taskGraphTestHooks.betweenReadAndWrite = async () => {
      if (fired) return;
      fired = true;
      // Simulates ANOTHER server process writing the graph (bypasses this process's serialisation).
      await Task.collection.updateOne({ _id: b._id }, { $set: { dependencies: [a._id] } });
    };
    try {
      const r = await svc.recomputeDependencyMetrics(G.teamId);
      assert.ok(r.passes >= 2, `passes ${r.passes}`);
    } finally { svc.taskGraphTestHooks.betweenReadAndWrite = null; }
    assert.equal((await Task.findById(a._id).lean()).dependentCount, 1);
    assert.equal((await Task.findById(b._id).lean()).dependencyCount, 1);
  });
});
