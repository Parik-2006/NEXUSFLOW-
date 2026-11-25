/**
 * NEXUSFLOW Phase 2 — Task 4: requirement references stay inside the project.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createSecurityWorld } from "../helpers/fixtures.js";

let env, req, W, Project, Task, audit, secondProject, secondTask;

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Task } = await import("../../models/Task.js"));
  ({ auditRequirementReferences: audit } = await import("../../services/requirementReferenceService.js"));
  W = await createSecurityWorld();
  secondProject = await Project.create({ teamId: W.A.teamId, title: "A second project" });
  secondTask = await Task.create({ teamId: W.A.teamId, projectId: secondProject._id, title: "A2 task" });
});
after(async () => env?.stop());

const base = (token) => (method, path, body) => req(method, `/api/projects/${W.A.projectId}/requirements${path}`, { token, body });

async function snapshotA() {
  return JSON.stringify(await Project.findById(W.A.projectId).lean());
}

describe("requirement references", () => {
  let reqA, reqB;
  test("valid requirements and same-project dependencies succeed", async () => {
    const call = base(W.memberA.token);
    const a = await call("POST", "", { title: "Login", reqId: "REQ-A" });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await call("POST", "", { title: "Profile", reqId: "REQ-B", dependencies: ["REQ-A"] });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    reqA = "REQ-A"; reqB = "REQ-B";
  });
  test("unknown / foreign / self dependencies are rejected without mutation", async () => {
    const call = base(W.memberA.token);
    const before = await snapshotA();
    for (const deps of [["REQ-NOPE"], [W.B.taskIds[0]], [W.A.taskIds[0]], ["REQ-X-SELF"], [""], "REQ-A"]) {
      const r = await call("POST", "", { title: "Bad", reqId: "REQ-X-SELF", dependencies: deps });
      assert.equal(r.status, 400, `deps ${JSON.stringify(deps)} → ${r.status}`);
    }
    assert.equal(await snapshotA(), before);
  });
  test("duplicate requirement id is rejected", async () => {
    assert.equal((await base(W.memberA.token)("POST", "", { title: "Dup", reqId: "REQ-A" })).status, 409);
  });
  test("task references: own project tasks succeed; other project / other workspace / orphan / malformed fail", async () => {
    const call = base(W.memberA.token);
    const ok = await call("PATCH", `/${reqB}`, { taskIds: [W.A.taskIds[0], W.A.taskIds[0]] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const stored = (await Project.findById(W.A.projectId).lean()).requirements.find((r) => r.reqId === reqB);
    assert.deepEqual(stored.taskIds, [W.A.taskIds[0]], "deduplicated");
    const before = await snapshotA();
    for (const ids of [[secondTask._id.toString()], [W.B.taskIds[0]], [new mongoose.Types.ObjectId().toString()], ["not-an-id"], [W.A.taskIds[1], W.B.taskIds[0]]]) {
      const r = await call("PATCH", `/${reqB}`, { taskIds: ids, title: "changed" });
      assert.equal(r.status, 400, `taskIds ${JSON.stringify(ids)}`);
    }
    assert.equal(await snapshotA(), before, "rejected bulk reference updates change nothing");
  });
  test("mass assignment of protected fields is ignored", async () => {
    const call = base(W.memberA.token);
    await call("PATCH", `/${reqA}`, { reqId: "HIJACK", approvedBy: W.memberB.id, priorityScore: 99999, description: "edited" });
    const r = (await Project.findById(W.A.projectId).lean()).requirements.find((x) => x.description === "edited");
    assert.equal(r.reqId, reqA);
    assert.notEqual(r.priorityScore, 99999);
  });
  test("deleting a requirement removes dangling dependency references", async () => {
    const call = base(W.memberA.token);
    assert.equal((await call("DELETE", `/${reqA}`)).status, 200);
    const b = (await Project.findById(W.A.projectId).lean()).requirements.find((x) => x.reqId === reqB);
    assert.deepEqual(b.dependencies, []);
  });
  test("outsiders cannot add references at all", async () => {
    assert.equal((await base(W.memberB.token)("POST", "", { title: "x" })).status, 403);
  });
});

describe("integrity audit (read-only)", () => {
  test("reports invalid legacy references without exposing foreign content and without writing", async () => {
    const legacy = await Project.create({
      teamId: W.B.teamId,
      title: "Legacy B",
      requirements: [{ reqId: "L-1", title: "Old", taskIds: [W.A.taskIds[0], W.A.taskIds[0], "garbage", new mongoose.Types.ObjectId().toString()], dependencies: ["L-1", "GHOST"] }],
    });
    const before = JSON.stringify(await Project.findById(legacy._id).lean());
    const report = await audit({ projectFilter: { _id: legacy._id } });
    const p = report.projects[0];
    assert.equal(p.crossWorkspace, 1);
    assert.equal(p.duplicateRefs, 1);
    assert.equal(p.invalidIds, 1);
    assert.equal(p.orphanedTasks, 1);
    assert.equal(p.selfDependencies, 1);
    assert.equal(p.unknownDependencies, 1);
    assert.ok(!JSON.stringify(report).includes("A task 1"), "no foreign task content");
    assert.equal(JSON.stringify(await Project.findById(legacy._id).lean()), before, "audit is read-only");
  });
});
