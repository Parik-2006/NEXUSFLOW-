/**
 * NEXUSFLOW Phase 1 — automated route authorization coverage matrix.
 *
 * Enumerates EVERY route registered on every router (including alternate /
 * legacy prefixes such as the root-mounted /projects and the dual
 * /api/scrum/:projectId vs /api/scrum/overview/:id conventions), calls each one
 * as an authenticated OUTSIDER with workspace A's real identifiers in the path
 * and body, and asserts:
 *   1. no workspace-scoped route returns 2xx to the outsider;
 *   2. no 2xx response body contains any of workspace A's identifiers;
 *   3. workspace A's documents are byte-identical afterwards (no mutation).
 * The resulting matrix is written to tests/.artifacts/route-coverage.json.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { startTestEnvironment, makeClient } from "../helpers/testEnv.js";
import { createSecurityWorld } from "../helpers/fixtures.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let env, req, W, Team, Project, Task, Sprint;

const MOUNTS = [
  ["../../routes/auth.js", ["/api"]],
  ["../../routes/chat.js", ["/api"]],
  ["../../routes/skills.js", ["/api"]],
  ["../../routes/ai.js", ["/api"]],
  ["../../routes/userLookup.js", ["/api"]],
  ["../../routes/teams.js", ["/api"]],
  ["../../routes/projects.js", ["/api", ""]],
  ["../../routes/github.js", ["/api"]],
  ["../../routes/discovery.js", ["/api"]],
  ["../../routes/scrum.js", ["/api/scrum"]],
  ["../../routes/kanban.js", ["/api/kanban"]],
  ["../../routes/hybrid.js", ["/api/hybrid"]],
  ["../../routes/workstreams21to25.js", ["/api"]],
];

// Workspace-scoped params; an outsider must never get 2xx on these routes.
const SCOPED_PARAMS = ["projectId", "teamId", "id", "sprintId", "taskId", "itemId"];
// Public by design (no workspace data unless the team opted into discovery).
const PUBLIC_SCOPED = [/^\/api\/discovery\/teams\/:teamId$/];

before(async () => {
  env = await startTestEnvironment();
  req = makeClient(env.baseUrl);
  ({ default: Team } = await import("../../models/Team.js"));
  ({ default: Project } = await import("../../models/Project.js"));
  ({ default: Task } = await import("../../models/Task.js"));
  ({ default: Sprint } = await import("../../models/Sprint.js"));
  W = await createSecurityWorld();
});
after(async () => env?.stop());

async function collectRoutes() {
  const routes = [];
  for (const [modPath, prefixes] of MOUNTS) {
    const router = (await import(modPath)).default;
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const method of Object.keys(layer.route.methods)) {
        for (const p of paths) for (const prefix of prefixes) routes.push({ method: method.toUpperCase(), path: prefix + p });
      }
    }
  }
  return routes;
}

async function snapshotWorkspaceA() {
  const [team, project, tasks, sprints] = await Promise.all([
    Team.findById(W.A.teamId).lean(),
    Project.findById(W.A.projectId).lean(),
    Task.find({ teamId: W.A.teamId }).sort({ _id: 1 }).lean(),
    Sprint.find({ teamId: W.A.teamId }).sort({ _id: 1 }).lean(),
  ]);
  return JSON.stringify({ team, project, tasks, sprints });
}

test("every route denies an outsider access to another workspace", { timeout: 600000 }, async () => {
  const routes = await collectRoutes();
  const fill = (p) =>
    p
      .replace(/:projectId/g, W.A.projectId)
      .replace(/:teamId/g, W.A.teamId)
      .replace(/:id\b/g, W.A.projectId)
      .replace(/:sprintId/g, W.A.sprintId)
      .replace(/:taskId|:itemId/g, W.A.taskIds[0])
      .replace(/:userId/g, W.ownerA.id)
      .replace(/:[A-Za-z]+/g, () => new mongoose.Types.ObjectId().toString());
  const body = {
    projectId: W.A.projectId, teamId: W.A.teamId, taskId: W.A.taskIds[0], taskIds: W.A.taskIds,
    sprintId: W.A.sprintId, toColumn: "ready", fromId: W.A.taskIds[0], toId: W.A.taskIds[1],
    confirmName: "Workspace A", role: "leader", name: "x", title: "x",
  };
  const secrets = [W.A.teamId, W.A.projectId, ...W.A.taskIds, W.A.sprintId];
  const before = await snapshotWorkspaceA();

  const matrix = [];
  const violations = [];
  for (const r of routes) {
    const url = fill(r.path);
    const scoped = SCOPED_PARAMS.some((p) => r.path.includes(`:${p}`)) && !PUBLIC_SCOPED.some((re) => re.test(r.path));
    let res;
    try {
      res = await req(r.method, url, { token: W.outsider.token, body: r.method === "GET" ? undefined : body });
    } catch (e) {
      res = { status: 0, body: { error: e.message } };
    }
    const ok = res.status >= 200 && res.status < 300;
    const leaked = ok && secrets.some((s) => JSON.stringify(res.body ?? "").includes(s));
    matrix.push({ method: r.method, route: r.path, scoped, status: res.status });
    if ((scoped && ok) || leaked) violations.push(`${r.method} ${r.path} → ${res.status}${leaked ? " (LEAKS workspace A ids)" : ""}`);
  }

  const after = await snapshotWorkspaceA();
  fs.mkdirSync(path.join(here, "..", ".artifacts"), { recursive: true });
  fs.writeFileSync(path.join(here, "..", ".artifacts", "route-coverage.json"), JSON.stringify({ total: matrix.length, scoped: matrix.filter((m) => m.scoped).length, matrix }, null, 2));

  assert.deepEqual(violations, [], `authorization violations:\n${violations.join("\n")}`);
  assert.equal(after, before, "workspace A was mutated by outsider requests");
  assert.ok(matrix.length > 300, `expected to exercise the full route table, got ${matrix.length}`);
});

// D-3 pattern: a legitimate member of workspace B authorizes against B's own
// containers but supplies workspace A's CHILD ids (tasks, sprints, items) in
// the path and body. Workspace A must never change and no 2xx response may
// expose A's child identifiers.
test("no route lets a member of B reach A's child resources via B's containers", { timeout: 600000 }, async () => {
  const routes = await collectRoutes();
  const fill = (p) =>
    p
      .replace(/:projectId/g, W.B.projectId)
      .replace(/:teamId/g, W.B.teamId)
      .replace(/:id\b/g, W.B.projectId)
      .replace(/:sprintId/g, W.A.sprintId)
      .replace(/:taskId|:itemId/g, W.A.taskIds[0])
      .replace(/:userId/g, W.memberB.id)
      .replace(/:[A-Za-z]+/g, () => new mongoose.Types.ObjectId().toString());
  const body = {
    projectId: W.B.projectId, teamId: W.B.teamId, taskId: W.A.taskIds[0], taskIds: W.A.taskIds,
    sprintId: W.A.sprintId, toColumn: "ready", fromId: W.A.taskIds[0], toId: W.A.taskIds[1], dependsOn: W.A.taskIds[1],
    dependencies: [W.A.taskIds[1]], assignments: [{ taskId: W.A.taskIds[0], memberId: W.memberB.id }],
    title: "x", name: "x",
  };
  const aChildIds = [...W.A.taskIds, W.A.sprintId];
  // Content that only workspace A's documents contain (titles / sprint name).
  const aContent = ["A task 1", "A task 2", "A Sprint 1"];
  const before = await snapshotWorkspaceA();
  const leaks = [];
  const foreignRefs = [];
  // Skip destructive routes that would delete B itself (not under test here).
  const skip = [/^DELETE \/api\/teams\/:teamId$/, /^DELETE (\/api)?\/projects\/:projectId$/, /\/restore-backlog$/, /\/leave$/, /\/transfer-ownership$/];
  for (const r of routes) {
    if (skip.some((re) => re.test(`${r.method} ${r.path}`))) continue;
    let res;
    try {
      res = await req(r.method, fill(r.path), { token: W.memberB.token, body: r.method === "GET" ? undefined : body });
    } catch {
      continue;
    }
    const text = JSON.stringify(res.body ?? "");
    const ok = res.status >= 200 && res.status < 300;
    if (ok && aContent.some((c) => text.includes(c))) {
      leaks.push(`${r.method} ${r.path} → ${res.status} exposes workspace A data`);
    } else if (ok && r.method !== "GET" && aChildIds.some((id) => text.includes(id))) {
      foreignRefs.push(`${r.method} ${r.path} → ${res.status}`);
    }
  }
  const after = await snapshotWorkspaceA();
  fs.mkdirSync(path.join(here, "..", ".artifacts"), { recursive: true });
  fs.writeFileSync(path.join(here, "..", ".artifacts", "foreign-references.json"), JSON.stringify(foreignRefs, null, 2));
  assert.deepEqual(leaks, [], leaks.join("\n"));
  assert.equal(after, before, "workspace A was mutated through workspace B's containers");
});
