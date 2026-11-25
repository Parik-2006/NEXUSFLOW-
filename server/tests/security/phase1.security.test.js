/**
 * NEXUSFLOW Phase 1 — Security acceptance suite (Section E).
 * Two independent workspaces, separate authenticated users, real Express +
 * Socket.IO app, isolated in-memory MongoDB. No external network.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { io as ioClient } from "socket.io-client";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createSecurityWorld, createUser, snapshotDatabase } from "../helpers/fixtures.js";

let env, req, W;
let Task, Team, Project, Invitation;

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Team } = await import("../../models/Team.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Invitation } = await import("../../models/Invitation.js"));
  W = await createSecurityWorld();
});
after(async () => {
  await env?.stop();
});

// ── socket helpers ───────────────────────────────────────────────────────────
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(env.baseUrl, { auth: token === undefined ? {} : { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    s.once("connect", () => resolve(s));
    s.once("connect_error", (e) => { s.close(); reject(e); });
  });
}
const emitAck = (s, ev, payload) => s.timeout(8000).emitWithAck(ev, payload);
function waitFor(s, ev, ms = 1500) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { s.off(ev, h); resolve(null); }, ms);
    const h = (data) => { clearTimeout(t); resolve(data); };
    s.once(ev, h);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("authentication", () => {
  test("missing authentication is rejected (401)", async () => {
    assert.equal((await req("GET", "/api/teams")).status, 401);
    assert.equal((await req("GET", `/api/projects/${W.A.projectId}/health`)).status, 401);
    assert.equal((await req("GET", `/api/kanban/overview/${W.A.teamId}`)).status, 401);
  });
  test("invalid JWT is rejected (401)", async () => {
    assert.equal((await req("GET", "/api/teams", { token: "abc.def.ghi" })).status, 401);
  });
  test("valid member is authorized (200)", async () => {
    const r = await req("GET", `/api/teams/${W.A.teamId}`, { token: W.memberA.token });
    assert.equal(r.status, 200);
    assert.equal(r.body._id, W.A.teamId);
  });
});

describe("workspace isolation (D-2, D-5, D-6)", () => {
  test("user from another workspace cannot read the team", async () => {
    assert.equal((await req("GET", `/api/teams/${W.A.teamId}`, { token: W.memberB.token })).status, 403);
    assert.equal((await req("GET", `/api/teams/${W.A.teamId}/tasks`, { token: W.memberB.token })).status, 403);
  });
  test("team list contains only the caller's workspaces", async () => {
    const r = await req("GET", "/api/teams", { token: W.memberB.token });
    assert.deepEqual(r.body.map((t) => t._id), [W.B.teamId]);
  });
  const intelligencePaths = ["health", "project-health", "team-health", "risks", "brain", "opinions", "retrospectives", "insights", "tasks", "decisions", "recommendations", "events", "phase-gates"];
  for (const p of intelligencePaths) {
    test(`project intelligence GET /${p} is rejected cross-workspace`, async () => {
      const byProject = await req("GET", `/api/projects/${W.A.projectId}/${p}`, { token: W.memberB.token });
      assert.equal(byProject.status, 403, `${p} by project id`);
      const byTeam = await req("GET", `/api/projects/${W.A.teamId}/${p}`, { token: W.memberB.token });
      assert.equal(byTeam.status, 403, `${p} by team id`);
    });
  }
  test("legacy root-mounted /projects prefix is guarded too", async () => {
    assert.equal((await req("GET", `/projects/${W.A.projectId}/risks`, { token: W.memberB.token })).status, 403);
  });
  test("project intelligence is available to members", async () => {
    assert.equal((await req("GET", `/api/projects/${W.A.projectId}/health`, { token: W.memberA.token })).status, 200);
    assert.equal((await req("GET", `/api/projects/${W.A.projectId}/risks`, { token: W.memberA.token })).status, 200);
  });
  test("mutating intelligence routes are rejected cross-workspace", async () => {
    assert.equal((await req("POST", `/api/projects/${W.A.projectId}/risks/scan`, { token: W.memberB.token })).status, 403);
    assert.equal((await req("POST", `/api/projects/${W.A.projectId}/opinions`, { token: W.memberB.token, body: { question: "x?" } })).status, 403);
  });
  test("name-based impersonation is rejected (same display name, different account)", async () => {
    const twin = await createUser("Member A");
    assert.equal((await req("GET", `/api/teams/${W.A.teamId}`, { token: twin.token })).status, 403);
    const list = await req("GET", "/api/teams", { token: twin.token });
    assert.equal(list.body.length, 0);
    // even after renaming to the placeholder's name and re-logging in
    await req("PATCH", "/api/me", { token: twin.token, body: { name: "Ghost Member" } });
    const login = await req("POST", "/api/auth/login", { body: { email: twin.user.email, password: "test-password-123" } });
    assert.equal(login.status, 200);
    assert.equal((await req("GET", `/api/teams/${W.A.teamId}`, { token: login.body.token })).status, 403);
  });
  test("orphaned project (missing team) fails closed", async () => {
    const orphan = await Project.create({ teamId: new mongoose.Types.ObjectId(), title: "Orphan" });
    assert.equal((await req("GET", `/api/projects/${orphan._id}/lessons`, { token: W.memberA.token })).status, 403);
    assert.equal((await req("GET", `/api/projects/${orphan._id}`, { token: W.memberA.token })).status, 403);
  });
  test("owner-less, member-less legacy team grants nothing", async () => {
    const legacy = await Team.create({ name: "Legacy", members: [] });
    assert.equal((await req("GET", `/api/teams/${legacy._id}`, { token: W.outsider.token })).status, 403);
  });
});

describe("task isolation (D-3)", () => {
  test("cross-workspace task update via another team's path is rejected", async () => {
    const before = await Task.findById(W.A.taskIds[0]).lean();
    const r = await req("PATCH", `/api/teams/${W.B.teamId}/tasks/${W.A.taskIds[0]}`, { token: W.memberB.token, body: { title: "pwned", status: "done" } });
    assert.equal(r.status, 404);
    const afterDoc = await Task.findById(W.A.taskIds[0]).lean();
    assert.equal(afterDoc.title, before.title);
  });
  test("cross-workspace task priority change (no team in path) is rejected", async () => {
    const r = await req("PATCH", `/api/tasks/${W.A.taskIds[0]}/priority`, { token: W.memberB.token, body: { urgency: 5 } });
    assert.equal(r.status, 403);
  });
  test("cross-workspace task deletion is rejected", async () => {
    const r = await req("DELETE", `/api/teams/${W.B.teamId}/tasks/${W.A.taskIds[1]}`, { token: W.memberB.token });
    assert.equal(r.status, 404);
    assert.ok(await Task.exists({ _id: W.A.taskIds[1] }));
  });
  test("cross-workspace dependency edge is rejected", async () => {
    const r = await req("POST", `/api/teams/${W.B.teamId}/tasks/${W.B.taskIds[0]}/dependencies`, { token: W.memberB.token, body: { dependsOn: W.A.taskIds[0] } });
    assert.equal(r.status, 404);
    const t = await Task.findById(W.B.taskIds[0]).lean();
    assert.equal((t.dependencies || []).length, 0);
  });
  test("assignee from another workspace is rejected", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/tasks/${W.A.taskIds[0]}`, { token: W.memberA.token, body: { assignedTo: W.memberB.id } });
    assert.equal(r.status, 400);
  });
  test("unauthorized sprint assignment is rejected (foreign sprint)", async () => {
    const r = await req("POST", `/api/scrum/sprints/${W.A.sprintId}/items`, { token: W.memberB.token, body: { taskId: W.B.taskIds[0] } });
    assert.equal(r.status, 403);
  });
  test("unauthorized sprint assignment is rejected (foreign task into own sprint)", async () => {
    const r = await req("POST", `/api/scrum/sprints/${W.B.sprintId}/items`, { token: W.memberB.token, body: { taskId: W.A.taskIds[0] } });
    assert.equal(r.status, 404);
    const t = await Task.findById(W.A.taskIds[0]).lean();
    assert.equal(t.sprintId, null);
  });
  test("sprint item removal across workspaces is rejected", async () => {
    const r = await req("DELETE", `/api/scrum/sprints/${W.A.sprintId}/items/${W.A.taskIds[0]}`, { token: W.memberB.token });
    assert.equal(r.status, 403);
  });
  test("kanban task update across workspaces is rejected", async () => {
    const r = await req("PATCH", `/api/kanban/${W.B.projectId}/tasks/${W.A.taskIds[0]}`, { token: W.memberB.token, body: { title: "pwned" } });
    assert.equal(r.status, 404);
  });
  test("kanban backlog / delivery views never include another workspace's tasks", async () => {
    const backlog = await req("GET", `/api/kanban/${W.B.projectId}/backlog`, { token: W.memberB.token });
    assert.equal(backlog.status, 200);
    const text = JSON.stringify(backlog.body);
    for (const id of W.A.taskIds) assert.ok(!text.includes(id), "A task leaked into B's backlog");
    assert.ok(W.B.taskIds.some((id) => text.includes(id)), "B's own backlog tasks are listed");
    const cd = await req("GET", `/api/kanban/${W.B.projectId}/continuous-delivery`, { token: W.memberB.token });
    for (const id of W.A.taskIds) assert.ok(!JSON.stringify(cd.body).includes(id));
  });
  test("scrum backlog item cannot depend on another workspace's task", async () => {
    const r = await req("POST", `/api/scrum/${W.B.projectId}/backlog`, { token: W.memberB.token, body: { title: "x", dependencies: [W.A.taskIds[0]] } });
    assert.equal(r.status, 400);
  });
  test("scrum analytics across workspaces is rejected", async () => {
    assert.equal((await req("GET", `/api/scrum/analytics/${W.A.projectId}`, { token: W.memberB.token })).status, 403);
  });
  test("authorized member can update their own workspace task", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/tasks/${W.A.taskIds[1]}`, { token: W.memberA.token, body: { description: "updated by member" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.description, "updated by member");
  });
});

describe("roles and privilege escalation (D-7, D-15)", () => {
  test("ordinary member cannot promote themselves", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${W.memberA.id}`, { token: W.memberA.token, body: { role: "leader" } });
    assert.equal(r.status, 403);
  });
  test("manager cannot change their own role", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${W.managerA.id}`, { token: W.managerA.token, body: { role: "leader" } });
    assert.equal(r.status, 403);
  });
  test("manager cannot grant a role above their own", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${W.memberA.id}`, { token: W.managerA.token, body: { role: "leader" } });
    assert.equal(r.status, 403);
  });
  test("manager cannot modify the owner", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${W.ownerA.id}`, { token: W.managerA.token, body: { role: "member" } });
    assert.equal(r.status, 403);
  });
  test("manager may set a lower functional role", async () => {
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${W.memberA.id}`, { token: W.managerA.token, body: { role: "Designer" } });
    assert.equal(r.status, 200);
  });
  test("member cannot rename the workspace (leader-only settings)", async () => {
    assert.equal((await req("PATCH", `/api/teams/${W.A.teamId}`, { token: W.memberA.token, body: { name: "hijacked" } })).status, 403);
  });
  test("member cannot complete a sprint; owner without a leader label can (D-15)", async () => {
    const t = await Team.findById(W.A.teamId);
    t.methodology = "SCRUM";
    t.members.find((m) => String(m.userId) === W.ownerA.id).role = "Product Designer";
    await t.save();
    await Project.updateOne({ _id: W.A.projectId }, { $set: { methodology: "SCRUM" } });
    const denied = await req("POST", `/api/scrum/sprints/${W.A.sprintId}/complete`, { token: W.memberA.token, body: {} });
    assert.equal(denied.status, 403);
    const owner = await req("POST", `/api/scrum/sprints/${W.A.sprintId}/complete`, { token: W.ownerA.token, body: {} });
    assert.notEqual(owner.status, 403, `owner must pass the leader check (got ${owner.status}: ${JSON.stringify(owner.body)})`);
  });
  test("placeholder member cannot be given a privileged role", async () => {
    const team = await Team.findById(W.A.teamId).lean();
    const ghost = team.members.find((m) => m.placeholder);
    const r = await req("PATCH", `/api/teams/${W.A.teamId}/members/${ghost.userId}`, { token: W.ownerA.token, body: { role: "leader" } });
    assert.equal(r.status, 400);
  });
});

describe("membership & invitations (D-8)", () => {
  test("direct add cannot link a registered account by email", async () => {
    const r = await req("POST", `/api/teams/${W.A.teamId}/members`, { token: W.ownerA.token, body: { name: W.outsider.user.email } });
    assert.equal(r.status, 409);
    const team = await Team.findById(W.A.teamId).lean();
    assert.ok(!team.members.some((m) => String(m.userId) === W.outsider.id));
  });
  test("direct add by a registered user's display name creates an unlinked placeholder", async () => {
    const r = await req("POST", `/api/teams/${W.A.teamId}/members`, { token: W.ownerA.token, body: { name: "Outsider" } });
    assert.equal(r.status, 201);
    const team = await Team.findById(W.A.teamId).lean();
    const added = team.members.filter((m) => m.name === "Outsider");
    assert.equal(added.length, 1);
    assert.equal(added[0].placeholder, true);
    assert.notEqual(String(added[0].userId), W.outsider.id);
    assert.equal((await req("GET", `/api/teams/${W.A.teamId}`, { token: W.outsider.token })).status, 403);
  });
  test("ordinary member cannot add members or invite", async () => {
    assert.equal((await req("POST", `/api/teams/${W.A.teamId}/members`, { token: W.memberA.token, body: { name: "Someone" } })).status, 403);
    assert.equal((await req("POST", `/api/teams/${W.A.teamId}/invitations`, { token: W.memberA.token, body: { email: W.outsider.user.email } })).status, 403);
  });
  test("manager cannot invite someone as leader", async () => {
    const r = await req("POST", `/api/teams/${W.A.teamId}/invitations`, { token: W.managerA.token, body: { email: W.outsider.user.email, role: "leader" } });
    assert.equal(r.status, 403);
  });
  let invitationId;
  test("owner invites; another user cannot accept it", async () => {
    const inv = await req("POST", `/api/teams/${W.A.teamId}/invitations`, { token: W.ownerA.token, body: { email: W.outsider.user.email } });
    assert.equal(inv.status, 201);
    invitationId = inv.body.invitation._id;
    assert.equal((await req("POST", `/api/invitations/${invitationId}/accept`, { token: W.memberB.token })).status, 403);
  });
  test("concurrent duplicate acceptance creates exactly one membership", async () => {
    const results = await Promise.all([
      req("POST", `/api/invitations/${invitationId}/accept`, { token: W.outsider.token }),
      req("POST", `/api/invitations/${invitationId}/accept`, { token: W.outsider.token }),
      req("POST", `/api/invitations/${invitationId}/accept`, { token: W.outsider.token }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    const team = await Team.findById(W.A.teamId).lean();
    assert.equal(team.members.filter((m) => String(m.userId) === W.outsider.id).length, 1);
    assert.equal((await Invitation.findById(invitationId).lean()).status, "accepted");
  });
  test("consumed invitation cannot be reused", async () => {
    assert.notEqual((await req("POST", `/api/invitations/${invitationId}/accept`, { token: W.outsider.token })).status, 200);
  });
});

describe("destructive operations (D-9)", () => {
  test("ordinary member cannot delete a project", async () => {
    const r = await req("DELETE", `/api/projects/${W.A.projectId}`, { token: W.memberA.token, body: { confirmName: "Project A" } });
    assert.equal(r.status, 403);
    assert.ok(await Project.exists({ _id: W.A.projectId }));
  });
  test("project deletion requires typed confirmation even for the owner", async () => {
    const r = await req("DELETE", `/api/projects/${W.A.projectId}`, { token: W.ownerA.token, body: {} });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "CONFIRMATION_REQUIRED");
    assert.ok(await Project.exists({ _id: W.A.projectId }));
  });
  test("non-owners cannot delete the workspace", async () => {
    for (const u of [W.memberA, W.managerA, W.memberB]) {
      const r = await req("DELETE", `/api/teams/${W.A.teamId}`, { token: u.token, body: { confirmName: "Workspace A" } });
      assert.equal(r.status, 403);
    }
    assert.ok(await Team.exists({ _id: W.A.teamId }));
  });
  test("workspace deletion requires the exact name", async () => {
    const r = await req("DELETE", `/api/teams/${W.A.teamId}`, { token: W.ownerA.token, body: { confirmName: "workspace a" } });
    assert.equal(r.status, 400);
    assert.ok(await Team.exists({ _id: W.A.teamId }));
  });
  test("ordinary member cannot restore (wipe) the AI backlog", async () => {
    assert.equal((await req("POST", `/api/teams/${W.A.teamId}/restore-backlog`, { token: W.memberA.token })).status, 403);
  });
  test("owner can delete a disposable workspace with confirmation", async () => {
    const tmp = await Team.create({ name: "Disposable", ownerId: W.ownerB.user._id, members: [{ userId: W.ownerB.user._id, name: "Owner B", role: "leader" }] });
    const r = await req("DELETE", `/api/teams/${tmp._id}`, { token: W.ownerB.token, body: { confirmName: "Disposable" } });
    assert.equal(r.status, 200);
    assert.equal(await Team.exists({ _id: tmp._id }), null);
  });
});

describe("no writes before authorization (D-10)", () => {
  test("unauthorized Kanban/Scrum/intelligence requests leave the database unchanged", async () => {
    const kanbanTeam = await Team.create({ name: "Kanban No Project", ownerId: W.ownerB.user._id, methodology: "KANBAN", members: [{ userId: W.ownerB.user._id, name: "Owner B", role: "leader" }] });
    const before = await snapshotDatabase();
    const attempts = [
      req("GET", `/api/kanban/overview/${kanbanTeam._id}`, { token: W.outsider.token }),
      req("POST", `/api/kanban/${kanbanTeam._id}/tasks`, { token: W.outsider.token, body: { title: "x" } }),
      req("GET", `/api/scrum/overview/${kanbanTeam._id}`, { token: W.outsider.token }),
      req("GET", `/api/projects/${kanbanTeam._id}/risks`, { token: W.outsider.token }),
      req("GET", `/api/projects/${kanbanTeam._id}/team-health`, { token: W.outsider.token }),
      req("POST", `/api/teams/${kanbanTeam._id}/initialize-project`, { token: W.outsider.token }),
      req("PATCH", `/api/teams/${W.A.teamId}/members/${W.memberA.id}`, { token: W.memberB.token, body: { role: "leader" } }),
      req("DELETE", `/api/teams/${W.A.teamId}`, { token: W.memberB.token, body: { confirmName: "Workspace A" } }),
    ];
    const results = await Promise.all(attempts);
    for (const r of results) assert.ok([401, 403, 404].includes(r.status), `unexpected ${r.status}: ${JSON.stringify(r.body)}`);
    const afterSnap = await snapshotDatabase();
    assert.deepEqual(afterSnap, before);
    const t = await Team.findById(kanbanTeam._id).lean();
    assert.equal(t.methodology, "KANBAN");
    assert.equal(t.activeProjectId, null);
  });
  test("authorized GET on an uninitialized workspace does not create a project", async () => {
    const t = await Team.create({ name: "Uninit", ownerId: W.ownerB.user._id, methodology: "KANBAN", members: [{ userId: W.ownerB.user._id, name: "Owner B", role: "leader" }] });
    const r = await req("GET", `/api/kanban/overview/${t._id}`, { token: W.ownerB.token });
    assert.equal(r.status, 409);
    assert.equal(await Project.countDocuments({ teamId: t._id }), 0);
    const risks = await req("GET", `/api/projects/${t._id}/risks`, { token: W.ownerB.token });
    assert.equal(risks.status, 409);
    assert.equal(await Project.countDocuments({ teamId: t._id }), 0);
  });
  test("explicit initialization is authorized, idempotent and race-safe", async () => {
    const t = await Team.create({ name: "Init Race", ownerId: W.ownerB.user._id, methodology: "KANBAN", members: [{ userId: W.ownerB.user._id, name: "Owner B", role: "leader" }] });
    const results = await Promise.all([1, 2, 3, 4].map(() => req("POST", `/api/teams/${t._id}/initialize-project`, { token: W.ownerB.token })));
    for (const r of results) assert.ok([200, 201].includes(r.status));
    assert.equal(await Project.countDocuments({ teamId: t._id }), 1);
    const pid = (await Team.findById(t._id).lean()).activeProjectId;
    assert.ok(results.every((r) => String(r.body.projectId) === String(pid)));
  });
});

describe("Socket.IO security (D-4, D-28)", () => {
  test("missing and invalid socket tokens are rejected at handshake", async () => {
    await assert.rejects(connect(undefined), /unauthorized/);
    await assert.rejects(connect("forged.token.value"), /unauthorized/);
  });
  test("unauthorized room join is rejected", async () => {
    const s = await connect(W.memberB.token);
    try {
      const ack = await emitAck(s, "room:join", { teamId: W.A.teamId });
      assert.equal(ack.ok, false);
    } finally { s.close(); }
  });
  test("unauthorized task search is rejected; oversized query is rejected", async () => {
    const s = await connect(W.memberB.token);
    try {
      const leak = waitFor(s, "task:searchResult", 800);
      const ack = await emitAck(s, "task:search", { teamId: W.A.teamId, query: "task" });
      assert.equal(ack.ok, false);
      assert.equal(await leak, null);
      const big = await emitAck(s, "task:search", { teamId: W.B.teamId, query: "x".repeat(500) });
      assert.equal(big.ok, false);
      const own = await emitAck(s, "task:search", { teamId: W.B.teamId, query: "task" });
      assert.equal(own.ok, true);
    } finally { s.close(); }
  });
  test("cross-workspace socket task mutation is rejected", async () => {
    const s = await connect(W.memberB.token);
    try {
      const before = await Task.findById(W.A.taskIds[0]).lean();
      const ack = await emitAck(s, "task:update", { teamId: W.B.teamId, taskId: W.A.taskIds[0], fields: { title: "pwned" } });
      assert.equal(ack.ok, false);
      assert.equal((await Task.findById(W.A.taskIds[0]).lean()).title, before.title);
    } finally { s.close(); }
  });
  test("spoofed identity in payloads is ignored", async () => {
    const s = await connect(W.memberA.token);
    try {
      assert.equal((await emitAck(s, "room:join", { teamId: W.A.teamId, userId: W.ownerA.id })).ok, true);
      const got = waitFor(s, "chat:message");
      s.emit("chat:message", { teamId: W.A.teamId, text: "hello", userId: W.ownerA.id, name: "Owner A" });
      const msg = await got;
      assert.equal(msg.userId, W.memberA.id);
      assert.equal(msg.name, "Member A");
    } finally { s.close(); }
  });
  test("events without payloads do not crash the server", async () => {
    const s = await connect(W.memberA.token);
    try {
      s.emit("chat:global:send");
      s.emit("task:search");
      s.emit("room:join");
      await new Promise((r) => setTimeout(r, 300));
      assert.equal((await req("GET", "/api/teams", { token: W.memberA.token })).status, 200);
    } finally { s.close(); }
  });
  test("authorized collaboration: members receive their workspace broadcasts", async () => {
    const s = await connect(W.memberA.token);
    try {
      assert.equal((await emitAck(s, "room:join", { teamId: W.A.teamId })).ok, true);
      const got = waitFor(s, "task:updated", 3000);
      const ack = await emitAck(s, "task:update", { teamId: W.A.teamId, taskId: W.A.taskIds[1], fields: { description: "via socket" } });
      assert.equal(ack.ok, true);
      assert.ok(await got);
    } finally { s.close(); }
  });
  test("removed member loses private room access immediately (all sessions) and on reconnect", async () => {
    const s1 = await connect(W.removedA.token);
    const s2 = await connect(W.removedA.token);
    const watcher = await connect(W.memberA.token);
    try {
      for (const s of [s1, s2, watcher]) assert.equal((await emitAck(s, "room:join", { teamId: W.A.teamId })).ok, true);
      const del = await req("DELETE", `/api/teams/${W.A.teamId}/members/${W.removedA.id}`, { token: W.ownerA.token, body: { reason: "test" } });
      assert.equal(del.status, 200);
      const leak1 = waitFor(s1, "task:created", 2000);
      const leak2 = waitFor(s2, "task:created", 2000);
      const seen = waitFor(watcher, "task:created", 2000);
      const created = await req("POST", `/api/teams/${W.A.teamId}/tasks`, { token: W.ownerA.token, body: { title: "post-removal secret task" } });
      assert.equal(created.status, 201);
      assert.ok(await seen, "remaining member should receive the broadcast");
      assert.equal(await leak1, null, "removed session 1 must not receive private events");
      assert.equal(await leak2, null, "removed session 2 must not receive private events");
      s1.close();
      const re = await connect(W.removedA.token);
      try {
        assert.equal((await emitAck(re, "room:join", { teamId: W.A.teamId })).ok, false);
      } finally { re.close(); }
    } finally { s1.close(); s2.close(); watcher.close(); }
  });
  test("valid reconnect re-joins successfully", async () => {
    const s = await connect(W.memberA.token);
    s.close();
    const s2 = await connect(W.memberA.token);
    try {
      assert.equal((await emitAck(s2, "room:join", { teamId: W.A.teamId })).ok, true);
    } finally { s2.close(); }
  });
});

describe("ownership", () => {
  test("only the owner can transfer ownership, to a real member, atomically", async () => {
    const owner = await createUser("Owner T");
    const lead = await createUser("Lead T");
    const t = await Team.create({ name: "Transfer", ownerId: owner.user._id, members: [{ userId: owner.user._id, name: "Owner T", role: "leader" }, { userId: lead.user._id, name: "Lead T", role: "leader" }] });
    assert.equal((await req("POST", `/api/teams/${t._id}/transfer-ownership`, { token: lead.token, body: { newOwnerId: lead.id } })).status, 403);
    const r = await req("POST", `/api/teams/${t._id}/transfer-ownership`, { token: owner.token, body: { newOwnerId: lead.id } });
    assert.equal(r.status, 200);
    const fresh = await Team.findById(t._id).lean();
    assert.equal(String(fresh.ownerId), lead.id);
    assert.ok(fresh.members.some((m) => String(m.userId) === owner.id));
  });
  test("owner cannot leave without transferring", async () => {
    assert.equal((await req("POST", `/api/teams/${W.B.teamId}/leave`, { token: W.ownerB.token, body: {} })).status, 400);
  });
});
