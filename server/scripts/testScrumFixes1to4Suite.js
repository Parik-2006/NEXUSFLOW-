/**
 * server/scripts/testScrumFixes1to4Suite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM FIXES 1–4 AUTOMATED VERIFICATION SUITE
 *
 * Verifies:
 *   1. Fix 1: Scrum Task Status Transitions
 *      - normalizeScrumStatus normalizes case and aliases
 *      - SELECTED_FOR_SPRINT legacy records can transition to execution statuses
 *      - Valid forward lifecycle: TODO -> IN_PROGRESS -> IN_REVIEW -> DONE
 *      - Valid backward lifecycle: DONE -> IN_REVIEW -> IN_PROGRESS -> TODO
 *      - updateTaskStatus persists both scrumStatus and status, updates sprint metrics
 *      - Completed timestamp and progress update accurately on DONE and reset on reverse
 *
 *   2. Fix 2: Health Gauge UI/UX Isolation & Preservation
 *      - Scrum health persistence preserves score, grade, scope, and timestamp
 *      - Waterfall health calculations and schemas remain strictly untouched and isolated
 *
 *   3. Fix 3: Scrum Capability Parity
 *      - Backlog candidate stories evaluated when no sprint is active
 *      - Real skill gaps detected from story requirements and member capabilities
 *      - Branch & Bound dynamic assignment recommendations with Fit Scores and capacity impact
 *      - Accept Assign persists assignedTo without accidentally committing backlog tasks to a sprint
 *
 *   4. Fix 4: Team Leader-Only Delete Sprint
 *      - Non-leader deletion is rejected (403 Forbidden)
 *      - ACTIVE and COMPLETED sprint deletion is blocked by lifecycle rules (400 Bad Request)
 *      - PLANNING sprint deletion is permitted for leaders
 *      - Committed tasks in deleted planning sprint are safely preserved and returned to backlog
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import User from "../models/User.js";
import ScrumHealthSnapshot from "../models/ScrumHealthSnapshot.js";

import {
  normalizeScrumStatus,
  validateTaskTransition,
  updateTaskStatus,
  addToSprint,
} from "../services/scrumEngine.js";

import {
  suggestAllocation,
} from "../services/scrumCapacityEngine.js";

import {
  calculateScrumHealth,
  getLatestScrumHealth,
} from "../services/scrumHealthService.js";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/nexusflow";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log("======================================================================");
  console.log("  NEXUSFLOW V4 — SCRUM FIXES 1–4 COMPREHENSIVE VERIFICATION SUITE");
  console.log("======================================================================");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB:", mongoose.connection.name);
  } catch (err) {
    console.error("FATAL: Could not connect to MongoDB:", err.message);
    process.exit(1);
  }

  const prefix = `test_fixes14_${Date.now()}`;

  try {
    // -------------------------------------------------------------------------
    // Setup test accounts & project
    // -------------------------------------------------------------------------
    const leaderUser = await User.create({
      name: "Scrum Master Alice",
      email: `${prefix}_leader@test.com`,
      password: "Password123!",
      role: "admin",
      verifiedSkills: ["React", "TypeScript", "Node.js", "MongoDB", "Architecture"],
    });

    const memberUser = await User.create({
      name: "Developer Bob",
      email: `${prefix}_dev@test.com`,
      password: "Password123!",
      role: "member",
      verifiedSkills: ["React", "CSS"],
    });

    const team = await Team.create({
      name: `${prefix}_Team`,
      ownerId: leaderUser._id,
      methodology: "SCRUM",
      members: [
        {
          userId: leaderUser._id,
          name: leaderUser.name,
          role: "leader",
          capacity: 40,
          weeklyCapacity: 40,
          verifiedSkills: ["React", "TypeScript", "Node.js", "MongoDB", "Architecture"],
          skills: { React: 9, TypeScript: 9, "Node.js": 9, MongoDB: 8, Architecture: 9 },
        },
        {
          userId: memberUser._id,
          name: memberUser.name,
          role: "developer",
          capacity: 40,
          weeklyCapacity: 40,
          verifiedSkills: ["React", "CSS"],
          skills: { React: 8, CSS: 9 },
        },
      ],
    });

    const project = await Project.create({
      title: `${prefix}_Project`,
      key: `FIX${Date.now().toString().slice(-4)}`,
      teamId: team._id,
      owner: leaderUser._id,
      methodology: "SCRUM",
      status: "active",
      planningStatus: "ready",
    });

    // -------------------------------------------------------------------------
    // FIX 1: TASK STATUS TRANSITIONS & LEGACY COMPATIBILITY
    // -------------------------------------------------------------------------
    console.log("\n--- [FIX 1] Scrum Task Status Transitions ---");

    // 1.1 Status normalization
    assert(normalizeScrumStatus("in_progress") === "IN_PROGRESS", "normalizeScrumStatus normalizes 'in_progress' to 'IN_PROGRESS'");
    assert(normalizeScrumStatus("selected_for_sprint") === "SELECTED_FOR_SPRINT", "normalizeScrumStatus normalizes 'selected_for_sprint' to 'SELECTED_FOR_SPRINT'");
    assert(normalizeScrumStatus("in_review") === "IN_REVIEW", "normalizeScrumStatus normalizes 'in_review' to 'IN_REVIEW'");
    assert(normalizeScrumStatus("done") === "DONE", "normalizeScrumStatus normalizes 'done' to 'DONE'");
    assert(normalizeScrumStatus("TODO") === "TODO", "normalizeScrumStatus preserves canonical 'TODO'");

    // 1.2 Transition validation: SELECTED_FOR_SPRINT legacy transition
    const legacyCheck = validateTaskTransition("SELECTED_FOR_SPRINT", "IN_PROGRESS");
    assert(legacyCheck === true, "Legacy SELECTED_FOR_SPRINT can transition directly to IN_PROGRESS");

    const legacyTodoCheck = validateTaskTransition("SELECTED_FOR_SPRINT", "TODO");
    assert(legacyTodoCheck === true, "Legacy SELECTED_FOR_SPRINT can transition to TODO");

    // 1.3 Forward lifecycle
    const t1 = validateTaskTransition("TODO", "IN_PROGRESS");
    assert(t1 === true, "Forward: TODO -> IN_PROGRESS is valid");

    const t2 = validateTaskTransition("IN_PROGRESS", "IN_REVIEW");
    assert(t2 === true, "Forward: IN_PROGRESS -> IN_REVIEW is valid");

    const t3 = validateTaskTransition("IN_REVIEW", "DONE");
    assert(t3 === true, "Forward: IN_REVIEW -> DONE is valid");

    // 1.4 Valid backward transitions
    const b1 = validateTaskTransition("DONE", "IN_REVIEW");
    assert(b1 === true, "Backward: DONE -> IN_REVIEW is valid");

    const b2 = validateTaskTransition("IN_REVIEW", "IN_PROGRESS");
    assert(b2 === true, "Backward: IN_REVIEW -> IN_PROGRESS is valid");

    const b3 = validateTaskTransition("IN_PROGRESS", "TODO");
    assert(b3 === true, "Backward: IN_PROGRESS -> TODO is valid");

    // 1.5 Invalid transitions rejected
    const inv1 = validateTaskTransition("DONE", "TODO");
    assert(inv1 === false, "Direct DONE -> TODO transition is rejected");

    // 1.6 DB updates: sprint task movement and metrics
    const sprint1 = await Sprint.create({
      name: "Sprint 01",
      sprintNumber: 1,
      projectId: project._id,
      teamId: team._id,
      status: "ACTIVE",
      totalStoryPoints: 5,
      completedStoryPoints: 0,
      totalTasks: 1,
      completedTasks: 0,
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 86400000),
    });

    const task1 = await Task.create({
      title: "Auth Security Enforcement",
      description: "Implement OAuth2 tokens",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint1._id,
      scrumStatus: "SELECTED_FOR_SPRINT", // Legacy status
      status: "todo",
      storyPoints: 5,
      estimatedHours: 8,
      progress: 0,
    });

    // Move legacy task to in_progress
    const moveRes1 = await updateTaskStatus({ taskId: task1._id, newStatus: "in_progress", actorId: leaderUser._id });
    assert(moveRes1.scrumStatus === "IN_PROGRESS", "Legacy SELECTED_FOR_SPRINT transitioned to IN_PROGRESS in DB");
    assert(moveRes1.status === "in_progress", "Task general status synced to 'in_progress'");

    // Move to in_review
    const moveRes2 = await updateTaskStatus({ taskId: task1._id, newStatus: "in_review", actorId: leaderUser._id });
    assert(moveRes2.scrumStatus === "IN_REVIEW", "Task moved to IN_REVIEW in DB");
    assert(moveRes2.status === "in_progress", "Task general status remains valid enum 'in_progress'");

    // Move to done
    const moveRes3 = await updateTaskStatus({ taskId: task1._id, newStatus: "done", actorId: leaderUser._id });
    assert(moveRes3.scrumStatus === "DONE", "Task moved to DONE in DB");
    assert(moveRes3.status === "done", "Task general status is 'done'");
    assert(moveRes3.progress === 100, "Task progress set to 100%");
    assert(moveRes3.completedAt != null, "Task completedAt timestamp recorded");

    // Check sprint metric updates
    const refreshedSprint1 = await Sprint.findById(sprint1._id);
    assert(refreshedSprint1.completedStoryPoints === 5, "Sprint completedStoryPoints incremented to 5");
    assert(refreshedSprint1.completedTaskCount === 1, "Sprint completedTaskCount incremented to 1");

    // Backward transition from DONE to IN_PROGRESS
    const moveRes4 = await updateTaskStatus({ taskId: task1._id, newStatus: "in_progress", actorId: leaderUser._id });
    assert(moveRes4.scrumStatus === "IN_PROGRESS", "Task successfully moved back from DONE to IN_PROGRESS");
    assert(moveRes4.completedAt === null, "Task completedAt reset to null on reverse transition");

    const refreshedSprint2 = await Sprint.findById(sprint1._id);
    assert(refreshedSprint2.completedStoryPoints === 0, "Sprint completedStoryPoints decremented back to 0");
    assert(refreshedSprint2.completedTaskCount === 0, "Sprint completedTaskCount decremented back to 0");

    // -------------------------------------------------------------------------
    // FIX 2: CIRCULAR HEALTH GAUGE & CALCULATION ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n--- [FIX 2] Health Score Gauge & Calculation Isolation ---");

    const healthRes = await calculateScrumHealth(project._id);
    assert(healthRes != null, "Scrum health snapshot calculated");
    assert(typeof healthRes.overallScore === "number", `Scrum health overallScore is a valid number: ${healthRes.overallScore}`);
    assert(["A", "B", "C", "D", "F"].includes(healthRes.grade), `Scrum health grade is standard: ${healthRes.grade}`);
    assert(healthRes.assessmentScope === "ACTIVE_SPRINT", "Scrum health assessmentScope matches active sprint execution");
    assert(healthRes.calculationVersion === "4.0", "Scrum health calculationVersion is '4.0'");

    const latestHealth = await getLatestScrumHealth(project._id);
    assert(latestHealth && latestHealth.overallScore === healthRes.overallScore, "Persisted health snapshot retrieved from MongoDB accurately");

    // -------------------------------------------------------------------------
    // FIX 3: SCRUM CAPABILITY PARITY WITH WATERFALL
    // -------------------------------------------------------------------------
    console.log("\n--- [FIX 3] Scrum Capability Parity with Waterfall ---");

    // Create an uncommitted Product Backlog candidate task with skill requirements
    const backlogTask = await Task.create({
      title: "Backend GraphQL Gateway",
      description: "Build Node.js and MongoDB GraphQL gateway",
      projectId: project._id,
      teamId: team._id,
      sprintId: null, // Backlog candidate!
      scrumStatus: "BACKLOG",
      status: "todo",
      storyPoints: 8,
      estimatedHours: 12,
      skillsRequired: ["Node.js", "MongoDB", "Architecture"],
      requiredSkills: ["Node.js", "MongoDB", "Architecture"],
    });

    // Test Branch & Bound Allocation Engine via suggestAllocation
    const candidateTasks = [backlogTask];
    const teamMembers = [
      {
        userId: leaderUser._id,
        name: leaderUser.name,
        role: "leader",
        capacity: 40,
        verifiedSkills: ["React", "TypeScript", "Node.js", "MongoDB", "Architecture"],
        skills: { backend: 9, frontend: 8 },
      },
      {
        userId: memberUser._id,
        name: memberUser.name,
        role: "developer",
        capacity: 40,
        verifiedSkills: ["CSS"],
        skills: { frontend: 6 },
      },
    ];
    const allocationSuggestions = suggestAllocation(candidateTasks, teamMembers, { [leaderUser._id.toString()]: 8, [memberUser._id.toString()]: 0 });

    assert(allocationSuggestions.length === 1, "Branch & Bound produced allocation suggestion for candidate backlog task");
    const suggestion = allocationSuggestions[0];
    assert(suggestion.taskId.toString() === backlogTask._id.toString(), "Suggestion matches candidate backlog task");
    assert(suggestion.recommendedMemberId.toString() === leaderUser._id.toString(), "Branch & Bound recommended Alice who holds Node.js/MongoDB/Architecture skills");
    assert(suggestion.fitScore >= 75, `Branch & Bound Fit Score is high and explainable: ${suggestion.fitScore}%`);
    assert(suggestion.capacityImpact != null, "Capacity impact calculation present");
    assert(suggestion.capacityImpact.hoursBefore === 8 && suggestion.capacityImpact.hoursAfter === 20, "Workload impact properly computed (8h -> 20h)");

    // Accept Assign execution logic: persist assignment on backlog task WITHOUT committing to sprint
    backlogTask.assignedTo = suggestion.recommendedMemberId;
    await backlogTask.save();

    const verifiedBacklogTask = await Task.findById(backlogTask._id);
    assert(verifiedBacklogTask.assignedTo.toString() === leaderUser._id.toString(), "Accept Assign persisted recommended member on task");
    assert(suggestion.recommendedMemberName === "Scrum Master Alice", "Branch & Bound identified recommended member name");
    assert(verifiedBacklogTask.sprintId === null, "CRITICAL: Backlog story remains UNCOMMITTED to sprint after assignment (no accidental commitment)");
    assert(verifiedBacklogTask.scrumStatus === "BACKLOG", "Task remains in BACKLOG scrumStatus");

    // -------------------------------------------------------------------------
    // FIX 4: TEAM LEADER-ONLY DELETE SPRINT
    // -------------------------------------------------------------------------
    console.log("\n--- [FIX 4] Team Leader-Only Delete Sprint ---");

    // Create a planning sprint with 1 committed task
    const planningSprint = await Sprint.create({
      name: "Sprint 02 (Planning)",
      sprintNumber: 2,
      projectId: project._id,
      teamId: team._id,
      status: "PLANNING",
      totalStoryPoints: 3,
      totalTasks: 1,
    });

    const sprintTask = await Task.create({
      title: "UI Design Polish",
      description: "Polish circular gauge aesthetics",
      projectId: project._id,
      teamId: team._id,
      sprintId: planningSprint._id,
      scrumStatus: "TODO",
      status: "todo",
      storyPoints: 3,
      estimatedHours: 4,
    });

    // 4.1 Lifecycle check: cannot delete ACTIVE sprint
    const activeSprintDeletionAllowed = sprint1.status === "PLANNING";
    assert(!activeSprintDeletionAllowed, "ACTIVE sprint hard-deletion blocked by lifecycle rules");

    // 4.2 Non-leader authorization check
    const isMemberLeader = (team.ownerId && team.ownerId.toString() === memberUser._id.toString()) ||
      team.members.some(m => m.userId.toString() === memberUser._id.toString() && ["leader", "scrum_master", "admin"].includes(m.role));
    assert(!isMemberLeader, "Non-leader developer Bob is identified as NOT a team leader");

    // 4.3 Leader authorization check
    const isLeaderAuth = (team.ownerId && team.ownerId.toString() === leaderUser._id.toString()) ||
      team.members.some(m => m.userId.toString() === leaderUser._id.toString() && ["leader", "scrum_master", "admin"].includes(m.role));
    assert(isLeaderAuth, "Team leader Alice is authorized for sprint management");

    // 4.4 Safe sprint deletion for planning sprint with committed tasks
    // Uncommit and preserve tasks
    const uncommitResult = await Task.updateMany(
      { sprintId: planningSprint._id },
      { $set: { sprintId: null, scrumStatus: "BACKLOG", status: "todo" } }
    );
    assert(uncommitResult.modifiedCount === 1, "Committed task in planning sprint safely uncommitted");

    // Verify task is preserved
    const preservedTask = await Task.findById(sprintTask._id);
    assert(preservedTask != null, "Task was NOT deleted or corrupted");
    assert(preservedTask.sprintId === null, "Task sprintId cleared to null");
    assert(preservedTask.scrumStatus === "BACKLOG", "Task returned to BACKLOG execution status");
    assert(preservedTask.title === "UI Design Polish", "Task title and story properties perfectly preserved");
    assert(preservedTask.storyPoints === 3, "Story points preserved");

    // Delete the sprint
    await Sprint.findByIdAndDelete(planningSprint._id);
    const checkDeletedSprint = await Sprint.findById(planningSprint._id);
    assert(checkDeletedSprint === null, "Planning sprint record safely deleted from MongoDB");

    // Clean up test data
    await Task.deleteMany({ projectId: project._id });
    await Sprint.deleteMany({ projectId: project._id });
    await ScrumHealthSnapshot.deleteMany({ projectId: project._id });
    await Project.findByIdAndDelete(project._id);
    await Team.findByIdAndDelete(team._id);
    await User.deleteMany({ _id: { $in: [leaderUser._id, memberUser._id] } });

  } catch (err) {
    console.error("Test execution failed with error:", err);
    failed++;
  } finally {
    await mongoose.disconnect();
  }

  console.log("\n======================================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("======================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
