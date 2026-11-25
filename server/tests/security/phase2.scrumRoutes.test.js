/**
 * NEXUSFLOW Phase 2 — Task 10: Scrum route ordering and cycle-check endpoint.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createSecurityWorld } from "../helpers/fixtures.js";

let env, req, W, Task, Project, scrumRouter;
before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  scrumRouter = (await import("../../routes/scrum.js")).default;
  W = await createSecurityWorld();
  // A → task0 depends on task1
  await Task.updateOne({ _id: W.A.taskIds[0] }, { $set: { dependencies: [W.A.taskIds[1]] } });
});
after(async () => env?.stop());

describe("route table", () => {
  test("no Scrum route is shadowed by an earlier parameterized route", () => {
    const layers = scrumRouter.stack.filter((l) => l.route);
    const OID = "64b7f1c2a1b2c3d4e5f60718";
    const shadowed = [];
    for (const own of layers) {
      for (const method of Object.keys(own.route.methods)) {
        for (const p of [].concat(own.route.path)) {
          const url = p.replace(/:(\w+)(\([^)]*\))?/g, OID);
          const first = layers.find((l) => l.route.methods[method] && l.regexp.test(url));
          if (first !== own && String(first.route.path) !== String(own.route.path)) shadowed.push(`${method} ${p} <- ${first.route.path}`);
        }
      }
    }
    assert.deepEqual(shadowed, []);
  });
});

describe("cycle check", () => {
  const check = (token, body, path = "/api/scrum/dependencies/check-cycle") => req("POST", path, { token, body });
  test("reaches the cycle-check handler (no longer captured by /dependencies/:id)", async () => {
    const r = await check(W.memberA.token, { projectId: W.A.projectId, fromId: W.A.taskIds[1], toId: W.A.taskIds[0] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(typeof r.body.wouldCycle, "boolean");
  });
  test("acyclic vs cyclic edges", async () => {
    // wouldCreateCycle semantics: "fromId" would gain a dependency on "toId".
    // task0 already depends on task1, so task1 → depends on task0 closes a cycle.
    const cyc = await check(W.memberA.token, { projectId: W.A.projectId, fromId: W.A.taskIds[1], toId: W.A.taskIds[0] });
    assert.equal(cyc.body.wouldCycle, true);
    const extra = await Task.create({ teamId: W.A.teamId, projectId: W.A.projectId, title: "extra" });
    const ok = await check(W.memberA.token, { projectId: W.A.projectId, fromId: String(extra._id), toId: W.A.taskIds[0] });
    assert.equal(ok.body.wouldCycle, false);
  });
  test("self-dependency is reported as a cycle", async () => {
    const r = await check(W.memberA.token, { projectId: W.A.projectId, fromId: W.A.taskIds[0], toId: W.A.taskIds[0] });
    assert.equal(r.body.wouldCycle, true);
  });
  test("alternate path conventions reach the same handler", async () => {
    assert.equal((await check(W.memberA.token, { fromId: W.A.taskIds[1], toId: W.A.taskIds[0] }, `/api/scrum/dependencies/check-cycle/${W.A.projectId}`)).status, 200);
    assert.equal((await check(W.memberA.token, { fromId: W.A.taskIds[1], toId: W.A.taskIds[0] }, `/api/scrum/${W.A.projectId}/dependencies/check-cycle`)).status, 200);
  });
  test("malformed ids, unknown project, unauthorized and cross-project tasks are rejected", async () => {
    assert.equal((await check(W.memberA.token, { projectId: W.A.projectId, fromId: "nope", toId: W.A.taskIds[0] })).status, 400);
    assert.equal((await check(W.memberA.token, { projectId: new mongoose.Types.ObjectId().toString(), fromId: W.A.taskIds[0], toId: W.A.taskIds[1] })).status, 404);
    assert.equal((await check(W.memberB.token, { projectId: W.A.projectId, fromId: W.A.taskIds[0], toId: W.A.taskIds[1] })).status, 403);
    const other = await Project.create({ teamId: W.A.teamId, title: "Other project" });
    const foreign = await Task.create({ teamId: W.A.teamId, projectId: other._id, title: "other-project task" });
    assert.equal((await check(W.memberA.token, { projectId: W.A.projectId, fromId: String(foreign._id), toId: W.A.taskIds[0] })).status, 404);
    assert.equal((await check(W.memberA.token, { projectId: W.A.projectId, fromId: W.B.taskIds[0], toId: W.A.taskIds[0] })).status, 404);
  });
  test("existing dynamic dependency routes still work", async () => {
    const r = await req("GET", `/api/scrum/dependencies/${W.A.projectId}`, { token: W.memberA.token });
    assert.notEqual(r.status, 404);
    assert.notEqual(r.status, 403);
  });
});
