/**
 * NEXUSFLOW Phase 2 — Tasks 8 & 9: authoritative counters and dashboard.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser, createWorkspace } from "../helpers/fixtures.js";

let env, req, Task, Project, Sprint, Team, lifecycle;
before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Sprint } = await import("../../models/Sprint.js"));
  ({ default: Team } = await import("../../models/Team.js"));
  lifecycle = await import("../../services/lifecycleService.js");
});
after(async () => env?.stop());

const summary = async (u) => (await req("GET", "/api/dashboard/summary", { token: u.token })).body;

describe("dashboard summary", () => {
  test("empty dashboard is all zeros (not fabricated)", async () => {
    const u = await createUser("Dash Empty");
    const s = await summary(u);
    assert.equal(s.workspaceCount, 0);
    assert.equal(s.totalTasks, 0);
    assert.equal(s.completionPercentage, 0);
    assert.equal(s.uniqueMemberCount, 0);
    assert.equal(s.activeSprintCount, 0);
    assert.equal(s.aiPlansReady, 0);
  });

  test("mixed statuses across conventions, exclusions, unique members, sprints and plans", async () => {
    const owner = await createUser("Dash Owner");
    const shared = await createUser("Dash Shared");
    const A = await createWorkspace("DA", { owner, members: [[shared, "Developer"]], placeholderName: "Planner Ghost" });
    const B = await createWorkspace("DB", { owner, members: [[shared, "Developer"]] });
    const outsider = await createUser("Dash Outsider");
    const X = await createWorkspace("DX", { owner: outsider });
    // Workspace A: 2 fixture tasks (open) + varied states
    await Task.create([
      { teamId: A.teamId, projectId: A.projectId, title: "done classic", status: "done" },
      { teamId: A.teamId, projectId: A.projectId, title: "done scrum-style", scrumStatus: "DONE" },
      { teamId: A.teamId, projectId: A.projectId, title: "done kanban", kanbanStatus: "DONE", workflowColumn: "done" },
      { teamId: A.teamId, projectId: A.projectId, title: "in progress", status: "in_progress" },
      { teamId: A.teamId, projectId: A.projectId, title: "blocked", kanbanStatus: "BLOCKED" },
      { teamId: A.teamId, projectId: A.projectId, title: "blocked by blocker", blockers: [{ blockerId: "b1", title: "x", status: "OPEN" }] },
      { teamId: A.teamId, projectId: A.projectId, title: "cancelled", scrumStatus: "CANCELLED" },
      { teamId: A.teamId, projectId: null, title: "team-level task" },
      { teamId: A.teamId, projectId: new mongoose.Types.ObjectId(), title: "orphan project task" },
    ]);
    // archived project in A with a task → excluded
    const archivedP = await Project.create({ teamId: A.teamId, title: "Archived P" });
    await Task.create({ teamId: A.teamId, projectId: archivedP._id, title: "archived project task", status: "done" });
    await lifecycle.archiveProject({ projectId: archivedP._id, actorId: owner.user._id });
    // sprints: 1 ACTIVE in A, 1 in archived project (excluded), fixtures are PLANNING
    await Sprint.create({ projectId: A.projectId, teamId: A.teamId, name: "Live", sprintNumber: 2, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 864e5) });
    await Sprint.create({ projectId: archivedP._id, teamId: A.teamId, name: "Hidden", sprintNumber: 1, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 864e5) });
    // plans: A finalized waterfall; B analysis pending (not ready)
    await Project.updateOne({ _id: A.projectId }, { $set: { "waterfallPlanLifecycle.status": "PLAN_FINALIZED" } });
    await Project.updateOne({ _id: B.projectId }, { $set: { "waterfallPlanLifecycle.status": "ANALYSIS_PENDING" } });
    // outsider's workspace has a done task and an active sprint — must not count
    await Task.create({ teamId: X.teamId, projectId: X.projectId, title: "x", status: "done" });
    await Sprint.create({ projectId: X.projectId, teamId: X.teamId, name: "X", sprintNumber: 2, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 864e5) });

    const s = await summary(owner);
    // A eligible: 2 fixtures + 7 (cancelled, orphan, archived-project excluded) = 9; B: 2
    assert.equal(s.workspaceCount, 2);
    assert.equal(s.totalTasks, 11);
    assert.equal(s.completedTasks, 3);
    assert.equal(s.inProgressTasks, 1);
    assert.equal(s.blockedTasks, 2);
    assert.equal(s.openTasks, 8);
    assert.equal(s.completionPercentage, Math.round((3 / 11) * 100));
    assert.equal(s.uniqueMemberCount, 2, "owner + shared member counted once each");
    assert.equal(s.placeholderMemberCount, 1);
    assert.equal(s.activeSprintCount, 1);
    assert.equal(s.aiPlansReady, 1);

    const teams = (await req("GET", "/api/teams", { token: owner.token })).body;
    const a = teams.find((t) => t._id === A.teamId);
    assert.equal(a.taskCount, 9);
    assert.equal(a.doneCount, 3);
    assert.equal(a.taskStats.completionPercentage, 33);
  });

  test("open tasks without an ACTIVE sprint report zero active sprints", async () => {
    const u = await createUser("Dash NoSprint");
    await createWorkspace("NS", { owner: u });
    const s = await summary(u);
    assert.ok(s.openTasks > 0);
    assert.equal(s.activeSprintCount, 0);
  });

  test("archived workspace disappears from metrics and returns on restore", async () => {
    const u = await createUser("Dash Archive");
    const W = await createWorkspace("AR", { owner: u });
    assert.equal((await summary(u)).workspaceCount, 1);
    await lifecycle.archiveWorkspace({ teamId: W.teamId, actorId: u.user._id });
    const s = await summary(u);
    assert.equal(s.workspaceCount, 0);
    assert.equal(s.totalTasks, 0);
    await lifecycle.restoreWorkspace({ teamId: W.teamId, actorId: u.user._id });
    assert.equal((await summary(u)).totalTasks, 2);
  });

  test("Scrum done counts stay inside their own workspace (regression)", async () => {
    const u1 = await createUser("Scrum One");
    const u2 = await createUser("Scrum Two");
    const S1 = await createWorkspace("S1", { owner: u1, methodology: "SCRUM" });
    const S2 = await createWorkspace("S2", { owner: u2, methodology: "SCRUM" });
    await Task.create([
      { teamId: S1.teamId, projectId: S1.projectId, title: "s1", scrumStatus: "TODO", source: "manual" },
      { teamId: S2.teamId, projectId: S2.projectId, title: "s2 done", scrumStatus: "DONE", source: "manual" },
      { teamId: S2.teamId, projectId: S2.projectId, title: "s2 done b", scrumStatus: "DONE", source: "manual" },
    ]);
    const t1 = (await req("GET", "/api/teams", { token: u1.token })).body[0];
    assert.equal(t1.doneCount, 0, "another workspace's DONE tasks are not counted");
    const single = (await req("GET", `/api/teams/${S1.teamId}`, { token: u1.token })).body;
    assert.equal(single.doneCount, 0);
  });
});

describe("counter consistency", () => {
  test("REST, socket-equivalent and concurrent status changes keep counts exact", async () => {
    const u = await createUser("Dash Consistency");
    // Classic workspace: Waterfall phase gates would (correctly) block "done" here.
    const W = await createWorkspace("CO", { owner: u, methodology: "CLASSIC" });
    const created = await Promise.all([1, 2, 3, 4].map((i) => req("POST", `/api/teams/${W.teamId}/tasks`, { token: u.token, body: { title: `c${i}` } })));
    const ids = created.map((r) => r.body._id);
    await Promise.all(ids.map((id) => req("PATCH", `/api/teams/${W.teamId}/tasks/${id}`, { token: u.token, body: { status: "done" } })));
    await req("PATCH", `/api/teams/${W.teamId}/tasks/${ids[0]}`, { token: u.token, body: { status: "todo" } });
    await req("DELETE", `/api/teams/${W.teamId}/tasks/${ids[1]}`, { token: u.token });
    const t = (await req("GET", `/api/teams/${W.teamId}`, { token: u.token })).body;
    assert.equal(t.taskCount, 2 + 3);
    assert.equal(t.doneCount, 2);
    const s = await summary(u);
    assert.equal(s.totalTasks, 5);
    assert.equal(s.completedTasks, 2);
    assert.ok(s.openTasks >= 0 && s.completionPercentage <= 100);
  });
});
