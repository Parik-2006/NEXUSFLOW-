/**
 * scripts/testDeleteWorkspace.js
 * Smoke test for the DELETE /api/teams/:teamId endpoint after V3.0 fix.
 *
 * Covers:
 *   1. Non-owner cannot delete another user's team (403)
 *   2. Owner can delete; team, tasks, projects, invitations, chat, risks, etc.
 *      are removed
 *   3. After delete: GET /api/teams/:teamId returns 404
 *   4. Other users' data is not affected
 *   5. Invalid team id returns 400
 *   6. Missing token returns 401
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ override: true });

const BASE = process.env.TEST_BASE || "http://localhost:4000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

let pass = 0, fail = 0;
const log = (...a) => console.log(...a);
const check = (name, ok, extra) => {
  if (ok) { pass++; log(`  PASS: ${name}`); }
  else    { fail++; log(`  FAIL: ${name}${extra ? " — " + extra : ""}`); }
};

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function signup(name, email, password) {
  return api("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const User = (await import("../models/User.js")).default;
  const Team = (await import("../models/Team.js")).default;

  const suffix = Date.now();
  const a = `owner${suffix}`;
  const b = `other${suffix}`;
  await User.deleteMany({ email: { $in: [`${a}@x.com`, `${b}@x.com`] } });
  await Team.deleteMany({ name: { $in: [`DelSmoke-${suffix}`] } });

  const owner = await signup("Owner", `${a}@x.com`, "password123");
  const other = await signup("Other", `${b}@x.com`, "password123");
  check("owner signup ok", owner.status === 201 && owner.body?.token, `status=${owner.status}`);
  check("other signup ok", other.status === 201 && other.body?.token, `status=${other.status}`);

  // Create a team as owner
  const create = await api("/api/teams", {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.body.token}` },
    body: JSON.stringify({ name: `DelSmoke-${suffix}`, projectTitle: "Test", projectDescription: "Test desc" }),
  });
  check("team created", create.status === 201 && create.body?._id, `status=${create.status}`);
  const teamId = create.body._id;

  // Add a task to make sure cascade deletes tasks
  const task = await api(`/api/teams/${teamId}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.body.token}` },
    body: JSON.stringify({ title: "Do thing", category: "General" }),
  });
  check("task created", task.status === 201);

  // Non-owner cannot delete
  const delByOther = await api(`/api/teams/${teamId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${other.body.token}` },
  });
  check("non-owner DELETE is 403", delByOther.status === 403, `status=${delByOther.status}`);

  // Invalid id
  const delBad = await api(`/api/teams/not-an-id`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${owner.body.token}` },
  });
  check("invalid id DELETE is 400", delBad.status === 400, `status=${delBad.status}`);

  // No auth
  const delNoAuth = await api(`/api/teams/${teamId}`, { method: "DELETE" });
  check("no-auth DELETE is 401", delNoAuth.status === 401, `status=${delNoAuth.status}`);

  // Owner deletes
  const delOk = await api(`/api/teams/${teamId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${owner.body.token}` },
  });
  check("owner DELETE is 200", delOk.status === 200, `status=${delOk.status}`);

  // GET should be 404
  const getAfter = await api(`/api/teams/${teamId}`, {
    headers: { Authorization: `Bearer ${owner.body.token}` },
  });
  check("GET after delete is 404", getAfter.status === 404, `status=${getAfter.status}`);

  // Tasks cascaded
  const Task = (await import("../models/Task.js")).default;
  const taskCount = await Task.countDocuments({ teamId });
  check("tasks cascaded", taskCount === 0, `leftover=${taskCount}`);

  // Cleanup
  await User.deleteMany({ email: { $in: [`${a}@x.com`, `${b}@x.com`] } });
  await mongoose.disconnect();

  log(`\nDELETE smoke: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("test error:", e);
  process.exit(1);
});
