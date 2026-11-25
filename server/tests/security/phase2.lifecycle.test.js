/**
 * NEXUSFLOW Phase 2 — Tasks 6 & 7: archive / restore / transactional purge.
 * Isolated in-memory replica set (transactions supported).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { io as ioClient } from "socket.io-client";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createUser, createWorkspace } from "../helpers/fixtures.js";

let env, req, Team, Project, Task, lifecycle;
const raw = () => mongoose.connection.db;
const withArchived = { includeArchived: true };

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Team } = await import("../../models/Team.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Task } = await import("../../models/Task.js"));
  lifecycle = await import("../../services/lifecycleService.js");
});
after(async () => env?.stop());

/** A workspace with related records in many owned collections. */
async function richWorkspace(label) {
  const owner = await createUser(`${label} Owner`);
  const leader = await createUser(`${label} Leader`);
  const member = await createUser(`${label} Member`);
  const W = await createWorkspace(label, { owner, members: [[leader, "leader"], [member, "Developer"]] });
  const tid = new mongoose.Types.ObjectId(W.teamId);
  const pid = new mongoose.Types.ObjectId(W.projectId);
  for (const c of ["projectmemories", "decisions", "risks", "aiconversations", "aimessages", "githubintegrations", "repositoryindexes", "projectevents"]) {
    await raw().collection(c).insertOne({ teamId: tid, projectId: pid, marker: label });
  }
  await raw().collection("chatmessages").insertOne({ teamId: tid, senderId: owner.user._id, message: "hi", type: "team" });
  await raw().collection("invitations").insertOne({ teamId: tid, invitedUserId: member.user._id, status: "pending" });
  await raw().collection("notifications").insertMany([
    { userId: member.user._id, type: "team_invitation", title: "t", message: "m", data: { teamId: tid } },
    { userId: member.user._id, type: "general", title: "t", message: "m", data: { teamId: tid } },
  ]);
  await raw().collection("githubcredentials").insertOne({ userId: owner.user._id, encryptedToken: "x" });
  return { ...W, owner, leader, member, tid, pid };
}

const countFor = async (col, filter) => raw().collection(col).countDocuments(filter);

describe("workspace archive / restore", () => {
  let W;
  before(async () => { W = await richWorkspace("LA"); });

  test("members cannot archive; owner archives with exact name; data is retained but hidden", async () => {
    assert.equal((await req("DELETE", `/api/teams/${W.teamId}`, { token: W.leader.token, body: { confirmName: "Workspace LA" } })).status, 403);
    const r = await req("DELETE", `/api/teams/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace LA" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.archived, true);
    assert.ok(r.body.purgeAfter);
    assert.equal(await countFor("teams", { _id: W.tid }), 1, "not deleted");
    assert.equal(await countFor("tasks", { teamId: W.tid }), 2, "children retained");
    const list = await req("GET", "/api/teams", { token: W.owner.token });
    assert.ok(!list.body.some((t) => t._id === W.teamId), "hidden from active list");
    assert.equal((await req("GET", `/api/teams/${W.teamId}`, { token: W.member.token })).status, 404);
    assert.equal((await req("GET", `/api/projects/${W.projectId}/health`, { token: W.member.token })).status, 403);
  });
  test("duplicate archive request is a safe no-op", async () => {
    const r = await req("DELETE", `/api/teams/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace LA" } });
    assert.equal(r.status, 404);
  });
  test("archived workspace rejects socket room joins", async () => {
    const s = await new Promise((resolve, reject) => {
      const c = ioClient(env.baseUrl, { auth: { token: W.member.token }, transports: ["websocket"], reconnection: false, forceNew: true });
      c.once("connect", () => resolve(c));
      c.once("connect_error", reject);
    });
    try {
      assert.equal((await s.timeout(5000).emitWithAck("room:join", { teamId: W.teamId })).ok, false);
    } finally { s.close(); }
  });
  test("trash lists it for the owner only; non-owners cannot restore", async () => {
    const trash = await req("GET", "/api/trash", { token: W.owner.token });
    assert.ok(trash.body.items.some((i) => i.type === "workspace" && i.id === W.teamId));
    const memberTrash = await req("GET", "/api/trash", { token: W.member.token });
    assert.ok(!memberTrash.body.items.some((i) => i.id === W.teamId));
    assert.equal((await req("POST", `/api/trash/workspaces/${W.teamId}/restore`, { token: W.member.token })).status, 403);
    const outsider = await createUser("LA Outsider");
    assert.equal((await req("POST", `/api/trash/workspaces/${W.teamId}/restore`, { token: outsider.token })).status, 404);
  });
  test("owner restores; workspace and its data are active again; second restore is safe", async () => {
    const r = await req("POST", `/api/trash/workspaces/${W.teamId}/restore`, { token: W.owner.token });
    assert.equal(r.status, 200);
    assert.equal((await req("GET", `/api/teams/${W.teamId}`, { token: W.member.token })).status, 200);
    assert.equal((await req("GET", `/api/teams/${W.teamId}/tasks`, { token: W.member.token })).body.length, 2);
    assert.equal((await req("POST", `/api/trash/workspaces/${W.teamId}/restore`, { token: W.owner.token })).status, 404);
  });
  test("restore after the recovery window is rejected", async () => {
    await req("DELETE", `/api/teams/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace LA" } });
    await Team.updateOne({ _id: W.tid }, { $set: { purgeAfter: new Date(Date.now() - 1000) } }).setOptions(withArchived);
    assert.equal((await req("POST", `/api/trash/workspaces/${W.teamId}/restore`, { token: W.owner.token })).status, 410);
  });
});

describe("workspace purge", () => {
  test("rolls back completely when a step fails inside the transaction", async () => {
    const W = await richWorkspace("RB");
    await req("DELETE", `/api/teams/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace RB" } });
    lifecycle.lifecycleTestHooks.beforeCommit = async () => { throw new Error("injected failure"); };
    try {
      const r = await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace RB" } });
      assert.equal(r.status, 500);
    } finally {
      lifecycle.lifecycleTestHooks.beforeCommit = null;
    }
    assert.equal(await countFor("teams", { _id: W.tid }), 1);
    assert.equal(await countFor("tasks", { teamId: W.tid }), 2);
    assert.equal(await countFor("projectmemories", { teamId: W.tid }), 1);
    assert.equal(await countFor("projects", { teamId: W.tid }), 1);
  });

  test("requires archive first and exact confirmation; purges every owned record and nothing else", async () => {
    const W = await richWorkspace("PG");
    const other = await richWorkspace("PO");
    assert.equal((await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace PG" } })).status, 404, "must be archived first");
    await req("DELETE", `/api/teams/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace PG" } });
    assert.equal((await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.owner.token, body: { confirmName: "wrong" } })).status, 400);
    assert.equal((await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.leader.token, body: { confirmName: "Workspace PG" } })).status, 403);
    const r = await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace PG" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    for (const c of ["tasks", "sprints", "projects", "projectmemories", "decisions", "risks", "aiconversations", "aimessages", "githubintegrations", "repositoryindexes", "projectevents", "chatmessages", "invitations"]) {
      assert.equal(await countFor(c, { $or: [{ teamId: W.tid }, { projectId: W.pid }] }), 0, `${c} purged`);
    }
    assert.equal(await countFor("teams", { _id: W.tid }), 0);
    assert.equal(await countFor("users", { _id: W.owner.user._id }), 1, "users preserved");
    assert.equal(await countFor("githubcredentials", { userId: W.owner.user._id }), 1, "GitHub credentials preserved");
    assert.equal(await countFor("notifications", { userId: W.member.user._id, type: "team_invitation", "data.teamId": W.tid }), 0, "actionable notification removed");
    assert.equal(await countFor("notifications", { userId: W.member.user._id, type: "general" }), 1, "other notification kept");
    assert.equal(await countFor("notifications", { "data.teamId": W.tid }), 0, "no dangling data.teamId");
    assert.equal(await countFor("tasks", { teamId: other.tid }), 2, "other workspace untouched");
    assert.equal(await countFor("projectmemories", { teamId: other.tid }), 1);
    assert.equal((await req("DELETE", `/api/trash/workspaces/${W.teamId}`, { token: W.owner.token, body: { confirmName: "Workspace PG" } })).status, 404, "repeat is safe");
  });
});

describe("project archive / restore / purge", () => {
  let W, p2, p2Task;
  before(async () => {
    W = await richWorkspace("PJ");
    p2 = await Project.create({ teamId: W.tid, title: "Side Project" });
    p2Task = await Task.create({ teamId: W.tid, projectId: p2._id, title: "Side task" });
  });

  test("ordinary members cannot archive; leaders can; tasks are hidden and events follow the commit", async () => {
    assert.equal((await req("DELETE", `/api/projects/${p2._id}`, { token: W.member.token, body: { confirmName: "Side Project" } })).status, 403);
    const s = await new Promise((resolve, reject) => {
      const c = ioClient(env.baseUrl, { auth: { token: W.owner.token }, transports: ["websocket"], reconnection: false, forceNew: true });
      c.once("connect", () => resolve(c));
      c.once("connect_error", reject);
    });
    try {
      assert.equal((await s.timeout(5000).emitWithAck("room:join", { teamId: W.teamId })).ok, true);
      const event = new Promise((resolve) => s.once("project:archived", async (e) => {
        resolve({ e, archivedInDb: Boolean((await Project.findOne({ _id: p2._id }).setOptions(withArchived).lean()).archivedAt) });
      }));
      const r = await req("DELETE", `/api/projects/${p2._id}`, { token: W.leader.token, body: { confirmName: "Side Project" } });
      assert.equal(r.status, 200);
      const got = await event;
      assert.equal(got.archivedInDb, true, "event emitted after the change was committed");
    } finally { s.close(); }
    const tasks = await req("GET", `/api/teams/${W.teamId}/tasks`, { token: W.member.token });
    assert.ok(!tasks.body.some((t) => t._id === String(p2Task._id)), "archived project's tasks hidden");
    assert.equal((await req("GET", `/api/projects/${p2._id}/health`, { token: W.member.token })).status, 404);
  });
  test("leader restores the project and exactly its tasks", async () => {
    const trash = await req("GET", "/api/trash", { token: W.leader.token });
    assert.ok(trash.body.items.some((i) => i.type === "project" && i.id === String(p2._id)));
    assert.equal((await req("POST", `/api/trash/projects/${p2._id}/restore`, { token: W.member.token })).status, 403);
    assert.equal((await req("POST", `/api/trash/projects/${p2._id}/restore`, { token: W.leader.token })).status, 200);
    const tasks = await req("GET", `/api/teams/${W.teamId}/tasks`, { token: W.member.token });
    assert.ok(tasks.body.some((t) => t._id === String(p2Task._id)));
  });
  test("project cannot be restored while its workspace is archived", async () => {
    await req("DELETE", `/api/projects/${p2._id}`, { token: W.leader.token, body: { confirmName: "Side Project" } });
    await Team.updateOne({ _id: W.tid }, { $set: { archivedAt: new Date(), purgeAfter: new Date(Date.now() + 86400000) } });
    try {
      const r = await req("POST", `/api/trash/projects/${p2._id}/restore`, { token: W.owner.token });
      assert.ok([404, 409].includes(r.status));
    } finally {
      await Team.updateOne({ _id: W.tid }, { $set: { archivedAt: null, purgeAfter: null } }).setOptions(withArchived);
    }
  });
  test("purge removes only that project's records", async () => {
    const r = await req("DELETE", `/api/trash/projects/${p2._id}`, { token: W.leader.token, body: { confirmName: "Side Project" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await countFor("projects", { _id: p2._id }), 0);
    assert.equal(await countFor("tasks", { projectId: p2._id }), 0);
    assert.equal(await countFor("tasks", { projectId: W.pid }), 2, "sibling project untouched");
    assert.equal(await countFor("projectmemories", { projectId: W.pid }), 1);
  });
});

describe("expiry job", () => {
  test("purges only expired archives and never runs twice concurrently", async () => {
    const expired = await richWorkspace("EX");
    const fresh = await richWorkspace("FR");
    await lifecycle.archiveWorkspace({ teamId: expired.tid, actorId: expired.owner.user._id });
    await lifecycle.archiveWorkspace({ teamId: fresh.tid, actorId: fresh.owner.user._id });
    await Team.updateOne({ _id: expired.tid }, { $set: { purgeAfter: new Date(Date.now() - 1000) } }).setOptions(withArchived);
    const [a, b] = await Promise.all([lifecycle.purgeExpired({ owner: "a" }), lifecycle.purgeExpired({ owner: "b" })]);
    assert.ok(a.skipped === "locked" || b.skipped === "locked", "second runner was locked out");
    assert.equal(await countFor("teams", { _id: expired.tid }), 0);
    assert.equal(await countFor("teams", { _id: fresh.tid }), 1, "unexpired archive retained");
  });
});
