/**
 * server/tests/helpers/fixtures.js
 * Phase 1 security fixtures: two independent workspaces with distinct users.
 * All records live only in the in-memory test database.
 */

import mongoose from "mongoose";
import User from "../../models/User.js";
import Team from "../../models/Team.js";
import Project from "../../models/Project.js";
import Task from "../../models/Task.js";
import Sprint from "../../models/Sprint.js";
import { sign } from "../../auth.js";

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(name, extra = {}) {
  const id = uniq();
  const user = await User.create({ name, email: `${name.toLowerCase().replace(/\W+/g, ".")}.${id}@test.local`, password: "test-password-123", ...extra });
  return { user, id: user._id.toString(), token: sign(user) };
}

function member(u, role = "member") {
  return { userId: u.user._id, name: u.user.name, role, skills: {} };
}

export async function createWorkspace(label, { owner, members = [], methodology = "WATERFALL", placeholderName = null } = {}) {
  const extra = placeholderName
    ? [{ userId: new mongoose.Types.ObjectId(), name: placeholderName, role: "member", placeholder: true, skills: {} }]
    : [];
  const team = await Team.create({
    name: `Workspace ${label}`,
    ownerId: owner.user._id,
    methodology,
    members: [member(owner, "leader"), ...members.map(([u, role]) => member(u, role)), ...extra],
  });
  const project = await Project.create({ teamId: team._id, title: `Project ${label}`, methodology });
  await Team.updateOne({ _id: team._id }, { $set: { activeProjectId: project._id } });
  const tasks = await Task.create([
    { teamId: team._id, projectId: project._id, title: `${label} task 1`, estimatedHours: 4 },
    { teamId: team._id, projectId: project._id, title: `${label} task 2`, estimatedHours: 2 },
  ]);
  const sprint = await Sprint.create({
    projectId: project._id,
    teamId: team._id,
    name: `${label} Sprint 1`,
    sprintNumber: 1,
    status: "PLANNING",
    startDate: new Date(),
    endDate: new Date(Date.now() + 14 * 86400000),
    totalCapacityHours: 80,
  });
  return {
    team: await Team.findById(team._id).lean(),
    teamId: team._id.toString(),
    project,
    projectId: project._id.toString(),
    tasks,
    taskIds: tasks.map((t) => t._id.toString()),
    sprint,
    sprintId: sprint._id.toString(),
  };
}

/**
 * Standard two-workspace world used by the security suites.
 *   A: ownerA (owner), memberA (member), managerA (manager), removedA (to be removed), placeholder "Ghost Member"
 *   B: ownerB (owner), memberB (member)
 *   outsider: registered user in no workspace
 */
export async function createSecurityWorld() {
  const ownerA = await createUser("Owner A");
  const memberA = await createUser("Member A");
  const managerA = await createUser("Manager A");
  const removedA = await createUser("Removed A");
  const ownerB = await createUser("Owner B");
  const memberB = await createUser("Member B");
  const outsider = await createUser("Outsider");
  const A = await createWorkspace("A", {
    owner: ownerA,
    members: [[memberA, "Frontend Developer"], [managerA, "manager"], [removedA, "member"]],
    placeholderName: "Ghost Member",
  });
  const B = await createWorkspace("B", { owner: ownerB, members: [[memberB, "member"]] });
  return { ownerA, memberA, managerA, removedA, ownerB, memberB, outsider, A, B };
}

/** Deterministic snapshot of every collection, for "no mutation" assertions. */
export async function snapshotDatabase() {
  const db = mongoose.connection.db;
  const out = {};
  const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
  for (const name of cols) {
    const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    out[name] = JSON.stringify(docs);
  }
  return out;
}
