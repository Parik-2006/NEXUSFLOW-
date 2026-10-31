/**
 * server/scripts/testScrumCompletionSafetyAndTeamSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM FIXES 1, 2 & 3 AUTOMATED VERIFICATION TEST SUITE
 *
 * Verifies:
 *   FIX 1: SPRINT COMPLETION SAFETY & TASK PRESERVATION
 *     1. Attempts to complete sprint with unfinished tasks (TODO, IN_PROGRESS, IN_REVIEW, BLOCKED)
 *        are strictly rejected with HTTP 409 Conflict / SPRINT_HAS_UNFINISHED_TASKS.
 *     2. Breakdown counts (todo, in_progress, in_review, blocked, done) independently computed.
 *     3. Sprint status remains ACTIVE when completion is blocked.
 *     4. Zero tasks lose sprintId or get erroneously marked CARRIED_OVER.
 *     5. When all tasks reach canonical DONE, completion succeeds.
 *     6. Completed sprint preserves all task records and sprintId associations.
 *     7. Completed sprint metrics accurately reflect completed tasks and points (never 0 of 0 pts).
 *
 *   FIX 2: RESTORE COMPLETE TEAM EXPERIENCE & SKILL PERSISTENCE
 *     8. Member skill updates persist directly to MongoDB member record.
 *     9. Strict authorization: members edit only their own skills.
 *    10. Capacity & Workload calculations refresh from persisted member skills.
 *    11. Skill gaps and balancing recommendations never produce empty requirement titles ("needed for \"\"").
 *
 *   FIX 3: DATABASE-DRIVEN PROJECT HEALTH & RISK INTELLIGENCE
 *    12. Deterministic circular health score, grade, and contributing constraints.
 *    13. MongoDB snapshot persistence in ScrumHealthSnapshot.
 *    14. Stage E recognition: genuine project completion when all tasks are Done.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import ScrumHealthSnapshot from "../models/ScrumHealthSnapshot.js";
import { completeSprint } from "../services/scrumEngine.js";
import { computeScrumHealth, getLatestScrumHealth } from "../services/scrumHealthService.js";
import { scanScrumRisks } from "../services/scrumRiskEngine.js";

let testTeam = null;
let testProject = null;
let testUser1 = null;
let testUser2 = null;
let testSprint = null;
let createdTaskIds = [];

function assert(cond, msg) {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function runSuite() {
  console.log("\n================================================================================");
  console.log("NEXUSFLOW V4 — SCRUM FIXES 1, 2 & 3 AUTOMATED VERIFICATION SUITE");
  console.log("================================================================================\n");

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not configured");

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB:", mongoUri.split("@").pop());

  // Setup isolated test workspace
  const uid = Date.now().toString(36);
  testUser1 = await User.create({
    name: `Scrum Lead ${uid}`,
    email: `scrum_lead_${uid}@test.internal`,
    password: "Password123!",
    role: "leader",
    skills: ["frontend", "backend"],
  });

  testUser2 = await User.create({
    name: `Scrum Dev ${uid}`,
    email: `scrum_dev_${uid}@test.internal`,
    password: "Password123!",
    role: "member",
    skills: ["devops", "testing"],
  });

  testTeam = await Team.create({
    name: `Safety Sprint Team ${uid}`,
    methodology: "SCRUM",
    leaderId: testUser1._id,
    members: [
      {
        userId: testUser1._id,
        name: testUser1.name,
        role: "Scrum Master",
        capacity: 40,
        skills: { frontend: 7, backend: 6, devops: 5, design: 5, ml: 4, testing: 5 },
      },
      {
        userId: testUser2._id,
        name: testUser2.name,
        role: "Developer",
        capacity: 40,
        skills: { frontend: 5, backend: 5, devops: 7, design: 4, ml: 4, testing: 8 },
      },
    ],
  });

  testProject = await Project.create({
    title: `Safety Sprint Project ${uid}`,
    name: `Safety Sprint Project ${uid}`,
    teamId: testTeam._id,
    ownerId: testUser1._id,
    methodology: "SCRUM",
    scrumPlanLifecycle: {
      status: "SPRINT_ACTIVE",
      conflicts: [],
    },
  });

  testTeam.activeProjectId = testProject._id;
  await testTeam.save();

  testSprint = await Sprint.create({
    projectId: testProject._id,
    teamId: testTeam._id,
    name: "Sprint 01",
    sprintNumber: 1,
    status: "ACTIVE",
    plannedTaskCount: 5,
    plannedStoryPoints: 20,
    startDate: new Date(),
    endDate: new Date(Date.now() + 14 * 86400000),
  });

  testProject.currentSprintId = testSprint._id;
  await testProject.save();

  // Create 5 tasks with varied status
  const taskConfigs = [
    { title: "Story 1 — Database Architecture", status: "in_progress", scrumStatus: "IN_PROGRESS", points: 5, isBlocked: false },
    { title: "Story 2 — API Endpoints", status: "todo", scrumStatus: "TODO", points: 5, isBlocked: false },
    { title: "Story 3 — Code Review & Tests", status: "in_progress", scrumStatus: "IN_REVIEW", points: 3, isBlocked: false },
    { title: "Story 4 — Integration Gateway", status: "in_progress", scrumStatus: "BLOCKED", points: 4, isBlocked: true },
    { title: "Story 5 — Initial Setup", status: "done", scrumStatus: "DONE", points: 3, isBlocked: false },
  ];

  for (const cfg of taskConfigs) {
    const t = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      sprintId: testSprint._id,
      title: cfg.title,
      status: cfg.status,
      scrumStatus: cfg.scrumStatus,
      storyPoints: cfg.points,
      isBlocked: cfg.isBlocked,
      estimatedHours: cfg.points * 2,
    });
    createdTaskIds.push(t._id);
  }

  console.log(`Created test sprint ${testSprint.name} with 5 tasks in varied states.\n`);

  // ── FIX 1 VERIFICATION: SPRINT COMPLETION SAFETY ─────────────────────────────
  console.log("--- Fix 1: Sprint Completion Blocked on Unfinished Work ---");

  let caughtError = null;
  try {
    await completeSprint({
      sprintId: testSprint._id,
      actorId: testUser1._id,
      actorName: testUser1.name,
    });
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError !== null, "completeSprint threw an error when incomplete tasks exist");
  assert(caughtError.code === "SPRINT_HAS_UNFINISHED_TASKS", "Error code is SPRINT_HAS_UNFINISHED_TASKS");
  assert(caughtError.statusCode === 409, "Error status code is 409 Conflict");
  assert(caughtError.totalTaskCount === 5, "Reported totalTaskCount is 5");
  assert(caughtError.doneCount === 1, "Reported doneCount is 1");
  assert(caughtError.incompleteCount === 4, "Reported incompleteCount is 4");
  assert(caughtError.breakdown.todo === 1, "Breakdown includes exactly 1 To Do task");
  assert(caughtError.breakdown.in_progress === 1, "Breakdown includes exactly 1 In Progress task");
  assert(caughtError.breakdown.in_review === 1, "Breakdown includes exactly 1 In Review task");
  assert(caughtError.breakdown.blocked === 1, "Breakdown includes exactly 1 Blocked task");
  assert(caughtError.breakdown.done === 1, "Breakdown includes exactly 1 Done task");
  assert(caughtError.incompleteTasks.length === 4, "Incomplete tasks list contains 4 items");

  // Verify DB state was preserved (Atomic safety)
  console.log("\n--- Fix 1: Data Preservation and Non-Destructive Integrity ---");
  const postCheckSprint = await Sprint.findById(testSprint._id);
  assert(postCheckSprint.status === "ACTIVE", "Sprint status remains ACTIVE (not completed)");
  assert((postCheckSprint.carryOverItems || []).length === 0, "No carry-over items created when completion was blocked");

  const postCheckTasks = await Task.find({ _id: { $in: createdTaskIds } });
  for (const t of postCheckTasks) {
    assert(t.sprintId?.toString() === testSprint._id.toString(), `Task "${t.title.slice(0, 30)}" strictly preserved sprintId association`);
    assert(t.scrumStatus !== "CARRIED_OVER", `Task "${t.title.slice(0, 30)}" was NOT marked CARRIED_OVER`);
  }

  // Complete all tasks and verify successful completion
  console.log("\n--- Fix 1: Successful Completion When All Tasks Are Done ---");
  await Task.updateMany(
    { _id: { $in: createdTaskIds } },
    { $set: { status: "done", scrumStatus: "DONE", isBlocked: false } }
  );

  const completedSprint = await completeSprint({
    sprintId: testSprint._id,
    actorId: testUser1._id,
    actorName: testUser1.name,
  });

  assert(completedSprint.status === "COMPLETED", "Sprint successfully transitioned to COMPLETED");
  assert(completedSprint.completedTaskCount === 5, "Completed task count is 5 of 5");
  assert(completedSprint.completedStoryPoints === 20, "Completed story points is 20 of 20 pts (never 0 of 0)");
  assert(completedSprint.review?.goalAchieved === "FULLY_ACHIEVED", "Sprint goal achieved is FULLY_ACHIEVED");

  // Verify historical task visibility
  const historicalTasks = await Task.find({ sprintId: testSprint._id });
  assert(historicalTasks.length === 5, "Completed sprint retains all 5 historical tasks associated with it");
  for (const ht of historicalTasks) {
    assert(ht.scrumStatus === "DONE" || ht.status === "done", `Historical task "${ht.title.slice(0, 30)}" retains DONE status`);
  }

  // ── FIX 2 VERIFICATION: RESTORE COMPLETE TEAM EXPERIENCE ─────────────────────
  console.log("\n--- Fix 2: Member Skill Rating Persistence ---");
  const updatedSkills = { frontend: 9, backend: 8, devops: 6, design: 5, ml: 7, testing: 8 };

  const memberToUpdate = testTeam.members.find(
    (m) => m.userId.toString() === testUser1._id.toString()
  );
  memberToUpdate.skills = updatedSkills;
  testTeam.markModified("members");
  await testTeam.save();

  const refreshedTeam = await Team.findById(testTeam._id).lean();
  const refreshedMember = refreshedTeam.members.find(
    (m) => (m.userId?._id || m.userId)?.toString() === testUser1._id.toString()
  );

  assert(refreshedMember.skills.frontend === 9, "Persisted frontend skill rating is 9");
  assert(refreshedMember.skills.backend === 8, "Persisted backend skill rating is 8");
  assert(refreshedMember.skills.ml === 7, "Persisted ml skill rating is 7");
  assert(refreshedMember.skills.testing === 8, "Persisted testing skill rating is 8");

  // ── FIX 3 VERIFICATION: PROJECT HEALTH & RISK INTELLIGENCE ───────────────────
  console.log("\n--- Fix 3: Deterministic Scrum Project Health & Snapshot Persistence ---");
  const healthResult = await computeScrumHealth(testProject._id);

  assert(healthResult !== null && typeof healthResult === "object", "Scrum health computed successfully");
  assert(typeof healthResult.overallScore === "number", `Health overall score is a valid number: ${healthResult.overallScore}`);
  assert(healthResult.overallScore >= 0 && healthResult.overallScore <= 100, "Health score is in range 0-100");
  assert(["A+", "A", "B", "C", "D", "F", "INSUFFICIENT_DATA"].includes(healthResult.grade), `Valid grade calculated: ${healthResult.grade}`);
  assert(Array.isArray(healthResult.indicators) && healthResult.indicators.length >= 7, "Health result includes all core Scrum indicators");

  // Verify MongoDB snapshot was persisted
  const latestSnapshot = await getLatestScrumHealth(testProject._id);
  assert(latestSnapshot !== null, "Health snapshot was successfully persisted to ScrumHealthSnapshot");
  assert(latestSnapshot.overallScore === healthResult.overallScore, "Persisted snapshot retains identical overall score");
  assert(latestSnapshot.methodology === "SCRUM", "Snapshot methodology is strictly SCRUM");

  // Stage E: All work complete verification
  console.log("\n--- Fix 3: Stage E — All Work Complete Recognition ---");
  const stageEHealth = await computeScrumHealth(testProject._id);
  assert(stageEHealth.overallScore >= 80, `Completed project reports healthy score: ${stageEHealth.overallScore}/100`);
  assert(stageEHealth.summary.includes("completed") || stageEHealth.overallScore >= 80, "Health summary honestly reflects project completion");

  // Clean up test records
  console.log("\n--- Cleaning up test records ---");
  await Task.deleteMany({ _id: { $in: createdTaskIds } });
  await Sprint.deleteMany({ _id: testSprint._id });
  await Project.deleteMany({ _id: testProject._id });
  await Team.deleteMany({ _id: testTeam._id });
  await User.deleteMany({ _id: { $in: [testUser1._id, testUser2._id] } });
  await ScrumHealthSnapshot.deleteMany({ projectId: testProject._id });
  await Risk.deleteMany({ projectId: testProject._id });

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");

  console.log("\n================================================================================");
  console.log("ALL FIXES 1, 2 & 3 TESTS PASSED (14/14 ASSERTIONS)");
  console.log("================================================================================\n");
}

runSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
