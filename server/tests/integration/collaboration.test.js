/**
 * NEXUSFLOW Phase 1 — regression suite for legitimate (authorized) flows.
 * Verifies the security hardening did not break collaboration across the
 * Classic / Waterfall / Scrum / Kanban / Hybrid surfaces. Isolated DB only.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser, createWorkspace } from "../helpers/fixtures.js";

let env, req, Team, Project, Task;
const LONG_DESC = "A collaborative project management platform for student teams. ".repeat(20);

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Team } = await import("../../models/Team.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Task } = await import("../../models/Task.js"));
});
after(async () => env?.stop());

describe("authentication flows", () => {
  let token, email;
  test("signup → login → session restore (/api/me) → profile update", async () => {
    email = `signup.${Date.now()}@test.local`;
    const su = await req("POST", "/api/auth/signup", { body: { name: "Signup User", email, password: "secret123", confirmPassword: "secret123" } });
    assert.equal(su.status, 201);
    const li = await req("POST", "/api/auth/login", { body: { email, password: "secret123" } });
    assert.equal(li.status, 200);
    token = li.body.token;
    const me = await req("GET", "/api/me", { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, email);
    const upd = await req("PATCH", "/api/me", { token, body: { bio: "hello" } });
    assert.equal(upd.status, 200);
  });
  test("wrong password is rejected", async () => {
    assert.equal((await req("POST", "/api/auth/login", { body: { email, password: "nope-nope" } })).status, 401);
  });
});

describe("workspace lifecycle (Waterfall)", () => {
  let owner, mate, teamId, projectId;
  before(async () => {
    owner = await createUser("Lifecycle Owner");
    mate = await createUser("Lifecycle Mate");
  });
  test("create workspace → listed → project created", async () => {
    const r = await req("POST", "/api/teams", { token: owner.token, body: { name: "Lifecycle WS", projectTitle: "LC", projectDescription: LONG_DESC, methodology: "WATERFALL" } });
    assert.equal(r.status, 201);
    teamId = r.body._id;
    projectId = String(r.body.activeProjectId);
    assert.equal(String(r.body.ownerId), owner.id);
    const list = await req("GET", "/api/teams", { token: owner.token });
    assert.ok(list.body.some((t) => t._id === teamId));
  });
  test("invite → accept → member listed → member can read workspace", async () => {
    const inv = await req("POST", `/api/teams/${teamId}/invitations`, { token: owner.token, body: { email: mate.user.email, role: "Backend Developer" } });
    assert.equal(inv.status, 201);
    const mine = await req("GET", "/api/invitations", { token: mate.token });
    assert.equal(mine.body.length, 1);
    const acc = await req("POST", `/api/invitations/${inv.body.invitation._id}/accept`, { token: mate.token });
    assert.equal(acc.status, 200);
    const team = await req("GET", `/api/teams/${teamId}`, { token: mate.token });
    assert.equal(team.status, 200);
    assert.ok(team.body.members.some((m) => m.userId === mate.id && m.role === "Backend Developer"));
  });
  test("invitation can be cancelled by the inviter", async () => {
    const extra = await createUser("Cancel Me");
    const inv = await req("POST", `/api/teams/${teamId}/invitations`, { token: owner.token, body: { email: extra.user.email } });
    const c = await req("DELETE", `/api/teams/${teamId}/invitations/${inv.body.invitation._id}`, { token: owner.token });
    assert.equal(c.status, 200);
    assert.notEqual((await req("POST", `/api/invitations/${inv.body.invitation._id}/accept`, { token: extra.token })).status, 200);
  });
  test("owner manages roles; member collaborates on tasks", async () => {
    assert.equal((await req("PATCH", `/api/teams/${teamId}/members/${mate.id}`, { token: owner.token, body: { role: "manager" } })).status, 200);
    const t = await req("POST", `/api/teams/${teamId}/tasks`, { token: mate.token, body: { title: "Write API spec", urgency: 3, impact: 4, estimatedHours: 3 } });
    assert.equal(t.status, 201);
    const t2 = await req("POST", `/api/teams/${teamId}/tasks`, { token: mate.token, body: { title: "Implement API", estimatedHours: 5 } });
    const dep = await req("POST", `/api/teams/${teamId}/tasks/${t2.body._id}/dependencies`, { token: mate.token, body: { dependsOn: t.body._id } });
    assert.equal(dep.status, 200);
    const assign = await req("PATCH", `/api/teams/${teamId}/tasks/${t.body._id}`, { token: mate.token, body: { assignedTo: mate.id } });
    assert.equal(assign.status, 200);
    const order = await req("GET", `/api/teams/${teamId}/tasks/execution-order`, { token: mate.token });
    assert.equal(order.status, 200);
    const opt = await req("POST", `/api/teams/${teamId}/sprint-optimize`, { token: mate.token, body: { sprintHours: 10 } });
    assert.equal(opt.status, 200);
    const pr = await req("PATCH", `/api/tasks/${t.body._id}/priority`, { token: mate.token, body: { urgency: 5 } });
    assert.equal(pr.status, 200);
    const rm = await req("DELETE", `/api/teams/${teamId}/tasks/${t2.body._id}/dependencies/${t.body._id}`, { token: mate.token });
    assert.equal(rm.status, 200);
  });
  test("waterfall phase gates: readable by members; advance is leader-gated", async () => {
    assert.equal((await req("GET", `/api/projects/${projectId}/phase-gates`, { token: mate.token })).status, 200);
    const asManager = await req("POST", `/api/projects/${projectId}/phase-gates/advance`, { token: mate.token });
    assert.equal(asManager.status, 403);
    const asOwner = await req("POST", `/api/projects/${projectId}/phase-gates/advance`, { token: owner.token });
    assert.notEqual(asOwner.status, 403, JSON.stringify(asOwner.body));
  });
  test("project intelligence, chat, notifications and GitHub status work for members", async () => {
    for (const p of ["health", "risks", "team-health", "decisions", "requirements/coverage"]) {
      const r = await req("GET", `/api/projects/${projectId}/${p}`, { token: mate.token });
      assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`);
    }
    assert.equal((await req("GET", `/api/chat/team/${teamId}`, { token: mate.token })).status, 200);
    assert.equal((await req("GET", "/api/chat/global", { token: mate.token })).status, 200);
    assert.equal((await req("GET", "/api/notifications", { token: mate.token })).status, 200);
    assert.equal((await req("GET", `/api/projects/${projectId}/github/status`, { token: mate.token })).status, 200);
  });
  test("member leaves → loses access", async () => {
    assert.equal((await req("POST", `/api/teams/${teamId}/leave`, { token: mate.token, body: { reason: "done" } })).status, 200);
    assert.equal((await req("GET", `/api/teams/${teamId}`, { token: mate.token })).status, 403);
  });
  test("owner deletes workspace with confirmation", async () => {
    assert.equal((await req("DELETE", `/api/teams/${teamId}`, { token: owner.token, body: { confirmName: "Lifecycle WS" } })).status, 200);
    assert.equal(await Team.exists({ _id: teamId }), null);
  });
});

describe("Scrum", () => {
  test("members create sprints and plan items within their workspace", async () => {
    const owner = await createUser("Scrum Owner");
    const dev = await createUser("Scrum Dev");
    const S = await createWorkspace("S", { owner, members: [[dev, "Developer"]], methodology: "SCRUM" });
    const created = await req("POST", `/api/scrum/${S.projectId}/sprints`, { token: dev.token, body: { name: "Sprint 2", goal: "ship", durationDays: 14 } });
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
    const add = await req("POST", `/api/scrum/sprints/${S.sprintId}/items`, { token: dev.token, body: { taskId: S.taskIds[0] } });
    assert.equal(add.status, 200, JSON.stringify(add.body));
    assert.equal(String((await Task.findById(S.taskIds[0]).lean()).sprintId), S.sprintId);
    const rem = await req("DELETE", `/api/scrum/sprints/${S.sprintId}/items/${S.taskIds[0]}`, { token: dev.token });
    assert.equal(rem.status, 200, JSON.stringify(rem.body));
    assert.equal((await req("GET", `/api/scrum/${S.projectId}/sprints`, { token: dev.token })).status, 200);
    assert.equal((await req("GET", `/api/scrum/analytics/${S.projectId}`, { token: dev.token })).status, 200);
  });
});

describe("Kanban", () => {
  test("explicit initialization, task creation and board movement", async () => {
    const owner = await createUser("Kanban Owner");
    const t = await Team.create({ name: "Kanban WS", ownerId: owner.user._id, methodology: "KANBAN", members: [{ userId: owner.user._id, name: "Kanban Owner", role: "leader" }] });
    const init = await req("POST", `/api/teams/${t._id}/initialize-project`, { token: owner.token });
    assert.equal(init.status, 201);
    const pid = String(init.body.projectId);
    const board = await req("GET", `/api/kanban/board/${pid}`, { token: owner.token });
    assert.equal(board.status, 200, JSON.stringify(board.body));
    const created = await req("POST", `/api/kanban/${pid}/tasks`, { token: owner.token, body: { title: "Card 1", acceptanceCriteria: ["done"], estimatedHours: 2 } });
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
    const taskId = created.body.task?._id || created.body._id;
    const moved = await req("POST", `/api/kanban/${pid}/pull`, { token: owner.token, body: { taskId, toColumn: "ready", hasOverride: true, overrideReason: "test" } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(await Project.countDocuments({ teamId: t._id }), 1);
  });
});

describe("Hybrid", () => {
  test("templates are available and hybrid overview is member-only", async () => {
    const owner = await createUser("Hybrid Owner");
    const outsider = await createUser("Hybrid Outsider");
    const H = await createWorkspace("H", { owner, methodology: "HYBRID" });
    assert.equal((await req("GET", "/api/hybrid/templates", { token: owner.token })).status, 200);
    assert.notEqual((await req("GET", `/api/hybrid/overview/${H.projectId}`, { token: owner.token })).status, 403);
    assert.equal((await req("GET", `/api/hybrid/overview/${H.projectId}`, { token: outsider.token })).status, 403);
  });
});
