/**
 * NEXUSFLOW Phase 3 — DAA integration (in-memory replica set, real app).
 * Partial-update priority preservation (D-20), derived dependency counts
 * (D-21), REST/Socket.IO equivalence, concurrency, archive handling,
 * cross-workspace rejection, sprint knapsack (D-26), assignment (D-33),
 * search bounds (D-32) and health scoring (D-24).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { io as ioClient } from "socket.io-client";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createSecurityWorld, createUser, createWorkspace } from "../helpers/fixtures.js";

let env, req, W, Task, Project, Team, computePriorityScore, svc;

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Team } = await import("../../models/Team.js"));
  ({ computePriorityScore } = await import("../../algorithms/greedyScheduler.js"));
  svc = await import("../../services/taskGraphService.js");
  W = await createSecurityWorld();
});
after(async () => env?.stop());

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(env.baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    s.once("connect", () => resolve(s));
    s.once("connect_error", (e) => { s.close(); reject(e); });
  });
}
const emitAck = (s, ev, payload) => s.timeout(8000).emitWithAck(ev, payload);
const newTask = (fields) => Task.create({ teamId: W.A.teamId, projectId: W.A.projectId, title: `t-${new mongoose.Types.ObjectId()}`, ...fields });
const expectedScore = (t) => computePriorityScore({ urgency: t.urgency, impact: t.impact, dependentCount: t.dependentCount });

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 2 — partial priority updates never reset untouched factors (D-20)", () => {
  test("pipeline expression equals computePriorityScore for every (u, i, d) on the grid", async () => {
    const docs = [];
    for (let u = 1; u <= 5; u++) for (let i = 1; i <= 5; i++) for (let d = 0; d <= 21; d++) {
      docs.push({ _id: new mongoose.Types.ObjectId(), teamId: W.B.teamId, title: `grid-${u}-${i}-${d}`, urgency: u, impact: i, dependentCount: d });
    }
    await Task.collection.insertMany(docs.map((d) => ({ ...d, teamId: new mongoose.Types.ObjectId(W.B.teamId), priorityScore: -1 })));
    await svc.recomputePriorityScores({ _id: { $in: docs.map((d) => d._id) } });
    const back = await Task.find({ _id: { $in: docs.map((d) => d._id) } }).lean();
    assert.equal(back.length, docs.length);
    for (const t of back) assert.equal(t.priorityScore, expectedScore(t), `u=${t.urgency} i=${t.impact} d=${t.dependentCount}`);
    await Task.collection.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  });

  test("REST: urgency-only, impact-only, deadline-only and unrelated updates keep the other factors", async () => {
    const t = await newTask({ urgency: 4, impact: 5 });
    const tok = W.ownerA.token;
    let r = await req("PATCH", `/api/teams/${W.A.teamId}/tasks/${t._id}`, { token: tok, body: { urgency: 2 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.impact, 5, "impact preserved");
    assert.equal(r.body.priorityScore, computePriorityScore({ urgency: 2, impact: 5 }), "returned score is fresh");
    r = await req("PATCH", `/api/tasks/${t._id}/priority`, { token: tok, body: { impact: 3 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.task.urgency, 2, "urgency preserved");
    assert.equal(r.body.task.priorityScore, computePriorityScore({ urgency: 2, impact: 3 }));
    r = await req("PATCH", `/api/teams/${W.A.teamId}/tasks/${t._id}`, { token: tok, body: { dueDate: new Date(Date.now() + 86400000).toISOString(), title: "renamed" } });
    assert.equal(r.status, 200);
    const db = await Task.findById(t._id).lean();
    assert.deepEqual([db.urgency, db.impact, db.priorityScore], [2, 3, computePriorityScore({ urgency: 2, impact: 3 })]);
  });

  test("invalid factor values are rejected by schema validation", async () => {
    const t = await newTask({ urgency: 3, impact: 3 });
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/tasks/${t._id}`, { token: W.ownerA.token, body: { urgency: 99 } });
    assert.notEqual(r.status, 200);
    assert.equal((await Task.findById(t._id).lean()).urgency, 3);
  });

  test("Socket.IO task:update is equivalent to REST and preserves untouched factors", async () => {
    const t = await newTask({ urgency: 5, impact: 4 });
    const s = await connect(W.ownerA.token);
    try {
      const ack = await emitAck(s, "task:update", { teamId: W.A.teamId, taskId: String(t._id), impact: 1 });
      assert.equal(ack.ok, true, JSON.stringify(ack));
      assert.equal(ack.task.urgency, 5);
      assert.equal(ack.task.priorityScore, computePriorityScore({ urgency: 5, impact: 1 }));
    } finally { s.close(); }
  });

  test("concurrent urgency and impact updates converge to the score of the final document", async () => {
    const t = await newTask({ urgency: 1, impact: 1 });
    await Promise.all([
      ...Array.from({ length: 6 }, (_, k) => Task.findOneAndUpdate({ _id: t._id }, { $set: { urgency: 1 + (k % 5) } })),
      ...Array.from({ length: 6 }, (_, k) => Task.updateOne({ _id: t._id }, { $set: { impact: 5 - (k % 5) } })),
    ]);
    const db = await Task.findById(t._id).lean();
    assert.equal(db.priorityScore, expectedScore(db));
  });

  test("bulk updateMany recomputes every matched task from its own persisted state", async () => {
    const a = await newTask({ urgency: 2, impact: 5, category: "bulk-x" });
    const b = await newTask({ urgency: 4, impact: 1, category: "bulk-x" });
    await Task.updateMany({ category: "bulk-x" }, { $set: { urgency: 5 } });
    for (const id of [a._id, b._id]) {
      const db = await Task.findById(id).lean();
      assert.equal(db.urgency, 5);
      assert.equal(db.priorityScore, expectedScore(db));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 3 — derived prerequisite / dependent counts (D-21)", () => {
  test("diamond graph via the dependency API: counts and greedy reward the unblocker", async () => {
    const [A, B, C, D] = await Promise.all(["A", "B", "C", "D"].map((n) => newTask({ title: `dia-${n}`, urgency: 3, impact: 3 })));
    const add = (task, dep) => req("POST", `/api/teams/${W.A.teamId}/tasks/${task._id}/dependencies`, { token: W.ownerA.token, body: { dependsOn: String(dep._id) } });
    for (const [x, y] of [[B, A], [C, A], [D, B], [D, C]]) assert.equal((await add(x, y)).status, 200);
    const get = async (t) => Task.findById(t._id).lean();
    const [a, b, c, d] = await Promise.all([A, B, C, D].map(get));
    assert.deepEqual([a.dependencyCount, a.dependentCount], [0, 2]);
    assert.deepEqual([b.dependencyCount, b.dependentCount], [1, 1]);
    assert.deepEqual([c.dependencyCount, c.dependentCount], [1, 1]);
    assert.deepEqual([d.dependencyCount, d.dependentCount], [2, 0]);
    assert.ok(a.priorityScore > d.priorityScore, "A unblocks work; D only waits");
    assert.equal(a.priorityScore, expectedScore(a));
    // duplicate edge is refused and does not drift the counters
    assert.equal((await add(B, A)).status, 409);
    assert.equal((await get(A)).dependentCount, 2);
    // archiving a dependent removes it from the active graph; restore brings it back
    await Task.updateOne({ _id: C._id }, { $set: { archivedAt: new Date() } });
    assert.equal((await get(A)).dependentCount, 1);
    assert.equal((await get(D)).dependencyCount, 1);
    await Task.updateOne({ _id: C._id }, { $set: { archivedAt: null } }, { includeArchived: true });
    assert.equal((await get(A)).dependentCount, 2);
    // deleting a task updates the counts of its neighbours
    await Task.deleteOne({ _id: D._id });
    assert.equal((await get(B)).dependentCount, 0);
  });

  test("Scrum dependency add/remove no longer drifts the counter", async () => {
    const { default: Sprint } = await import("../../models/Sprint.js");
    void Sprint;
    const p = await newTask({ title: "scrum-pre" });
    const q = await newTask({ title: "scrum-post" });
    await Task.updateOne({ _id: q._id }, { $addToSet: { dependencies: p._id } });
    await Task.updateOne({ _id: q._id }, { $addToSet: { dependencies: p._id } }); // re-add: set semantics
    assert.equal((await Task.findById(p._id).lean()).dependentCount, 1);
    assert.equal((await Task.findById(q._id).lean()).dependencyCount, 1);
  });

  test("cross-workspace dependency edges are rejected", async () => {
    const a = await newTask({ title: "xw-a" });
    const r = await req("POST", `/api/teams/${W.A.teamId}/tasks/${a._id}/dependencies`, { token: W.ownerA.token, body: { dependsOn: W.B.taskIds[0] } });
    assert.ok([400, 403, 404].includes(r.status), `got ${r.status}`);
    assert.equal((await Task.findById(a._id).lean()).dependencies.length, 0);
  });

  test("dependency-graph API returns dependency-safe waves and the graph convention", async () => {
    const r = await req("GET", `/api/teams/${W.A.teamId}/dependency-graph`, { token: W.ownerA.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.wavesResult.valid, true);
    const level = r.body.wavesResult.levels;
    for (const e of r.body.edges) {
      const from = e.from ?? e.source, to = e.to ?? e.target;
      if (level[from] !== undefined && level[to] !== undefined) assert.ok(level[from] < level[to]);
    }
    assert.match(r.body.graphConvention, /A → B/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 7 / 8 / 9 — knapsack, assignment and search through the real routes", () => {
  test("sprint-optimize selects a 2.5 h task for a 5 h sprint and never exceeds capacity", async () => {
    const owner = await createUser("Knap Owner");
    const K = await createWorkspace("Knap", { owner, methodology: "CLASSIC" });
    await Task.deleteMany({ teamId: K.teamId });
    await Task.create([
      { teamId: K.teamId, title: "frac", status: "todo", estimatedHours: 2.5, businessValue: 8 },
      { teamId: K.teamId, title: "a254", status: "todo", estimatedHours: 2.54, businessValue: 5 },
      { teamId: K.teamId, title: "b254", status: "todo", estimatedHours: 2.54, businessValue: 5 },
    ]);
    const r = await req("POST", `/api/teams/${K.teamId}/sprint-optimize`, { token: owner.token, body: { sprintHours: 5 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.exact, true);
    assert.ok(r.body.totalHours <= 5, `total ${r.body.totalHours}`);
    // 2.5 + 2.54 = 5.04 h and 2.54 + 2.54 = 5.08 h both exceed 5 h, so the true
    // optimum is the 2.5 h task alone (value 8). The pre-Phase-3 Math.round(×10)
    // weights (25 + 25 = 50 ≤ 50) would have returned value 10 or 13 by
    // overfilling the sprint.
    assert.deepEqual(r.body.selectedTasks.map((t) => t.title), ["frac"]);
    assert.equal(r.body.totalValue, 8);
    assert.equal(r.body.totalHours, 2.5);
    const bad = await req("POST", `/api/teams/${K.teamId}/sprint-optimize`, { token: owner.token, body: { sprintHours: -5 } });
    assert.equal(bad.status, 400);
  });

  test("sprint-optimize excludes tasks waiting on unfinished prerequisites", async () => {
    const owner = await createUser("Knap Dep");
    const K = await createWorkspace("KnapDep", { owner, methodology: "CLASSIC" });
    await Task.deleteMany({ teamId: K.teamId });
    const [pre] = await Task.create([{ teamId: K.teamId, title: "pre", status: "todo", estimatedHours: 1, businessValue: 1 }]);
    await Task.create([{ teamId: K.teamId, title: "post", status: "todo", estimatedHours: 1, businessValue: 9, dependencies: [pre._id] }]);
    const r = await req("POST", `/api/teams/${K.teamId}/sprint-optimize`, { token: owner.token, body: { sprintHours: 10 } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.selectedTasks.map((t) => t.title), ["pre"]);
    assert.match(r.body.ineligible.find((t) => t.title === "post").reason, /unfinished prerequisite/);
  });

  test("assignment route skips placeholder members and reports exactness", async () => {
    await Team.updateOne({ _id: W.A.teamId, "members.userId": W.ownerA.user._id }, { $set: { "members.$.skills": { frontend: 9, backend: 2, devops: 5, design: 5, ml: 5, testing: 5 } } });
    const r = await req("POST", `/api/teams/${W.A.teamId}/assign`, { token: W.ownerA.token, body: { persist: false } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const team = await Team.findById(W.A.teamId).lean();
    const placeholderIds = team.members.filter((m) => m.placeholder).map((m) => String(m.userId));
    for (const a of r.body.assignments) assert.ok(!placeholderIds.includes(a.memberId));
    assert.equal(typeof r.body.meta.exact, "boolean");
    assert.ok(Array.isArray(r.body.unassigned));
  });

  test("task:search accepts a 200-character query without hanging and rejects oversize queries", async () => {
    const s = await connect(W.ownerA.token);
    try {
      const ok = await emitAck(s, "task:search", { teamId: W.A.teamId, query: "a".repeat(200) });
      assert.equal(ok.ok, true);
      const big = await emitAck(s, "task:search", { teamId: W.A.teamId, query: "a".repeat(5000) });
      assert.equal(big.ok, false);
      const foreign = await emitAck(s, "task:search", { teamId: W.B.teamId, query: "task" });
      assert.equal(foreign.ok, false, "cross-workspace search rejected");
    } finally { s.close(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 10 — evidence-based health (D-24)", () => {
  test("empty project: no fabricated perfect score", async () => {
    const owner = await createUser("Health Empty");
    const H = await createWorkspace("HealthEmpty", { owner, methodology: "CLASSIC" });
    await Task.deleteMany({ teamId: H.teamId });
    const r = await req("GET", `/api/projects/${H.projectId}/health`, { token: owner.token });
    assert.equal(r.status, 200);
    const q = r.body.dimensions.find((d) => d.key === "quality");
    assert.equal(q.score, null, "missing quality evidence is not fabricated");
    assert.notEqual(r.body.confidence, "high");
    for (const d of r.body.dimensions.filter((x) => x.score === null)) assert.equal(d.effectiveWeight, 0);
  });

  test("weights renormalise over scored dimensions and requirements contribute when present", async () => {
    const owner = await createUser("Health Req");
    const H = await createWorkspace("HealthReq", { owner, methodology: "WATERFALL" });
    await Project.updateOne({ _id: H.projectId }, { $set: { requirements: [
      { reqId: "REQ-001", title: "Login", status: "approved" },
      { reqId: "REQ-002", title: "Reports", status: "draft" },
    ] } });
    const r = await req("GET", `/api/projects/${H.projectId}/health`, { token: owner.token });
    assert.equal(r.status, 200);
    const req1 = r.body.dimensions.find((d) => d.key === "requirements");
    assert.equal(req1.score, 50);
    assert.ok(req1.effectiveWeight > 0, "requirements dimension carries real weight");
    const sumW = r.body.dimensions.reduce((s, d) => s + (d.effectiveWeight || 0), 0);
    assert.ok(Math.abs(sumW - 1) < 0.001, `weights sum ${sumW}`);
    const recomputed = r.body.dimensions.reduce((s, d) => s + (d.score === null ? 0 : d.effectiveWeight * d.score), 0);
    assert.ok(Math.abs(Math.round(recomputed) - (r.body.uncappedScore ?? r.body.overallScore)) <= 1);
  });

  test("health excludes other projects' tasks and archived tasks; foreign users rejected", async () => {
    const owner = await createUser("Health Scope");
    const H = await createWorkspace("HealthScope", { owner, methodology: "CLASSIC" });
    const other = await Project.create({ teamId: H.teamId, title: "Other project" });
    await Task.create({ teamId: H.teamId, projectId: other._id, title: "other-project-task", status: "todo" });
    await Task.create({ teamId: H.teamId, projectId: H.projectId, title: "archived", status: "todo", archivedAt: new Date() });
    const r = await req("GET", `/api/projects/${H.projectId}/health`, { token: owner.token });
    assert.equal(r.body.teamExecution.totalTasks, 2, "only this project's two fixture tasks");
    const foreign = await req("GET", `/api/projects/${H.projectId}/health`, { token: W.ownerB.token });
    assert.ok([403, 404].includes(foreign.status));
  });
});
