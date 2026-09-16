/**
 * server/scripts/testWorkflowConformance.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKFLOW CONFORMANCE ENGINE TEST SUITE (Prompt 12)
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Sprint from "../models/Sprint.js";
import ProjectEvent from "../models/ProjectEvent.js";
import { analyzeWorkflowConformance } from "../services/workflowConformanceEngine.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — WORKFLOW CONFORMANCE ENGINE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let testUser, testTeam, wfProj, scrumProj, kanbanProj;

  try {
    testUser = await User.create({
      name: `Conformance Tester ${ts}`,
      email: `conf_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Conformance Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Conformance Suite",
    });

    // ── Test 1: Empty Project Handled Gracefully
    console.log("[TEST 1] Empty project conformance check");
    wfProj = await Project.create({
      teamId: testTeam._id,
      title: "Waterfall Project",
      methodology: "WATERFALL",
      waterfallPhase: "requirements",
    });

    const emptyResult = await analyzeWorkflowConformance(wfProj._id);
    assert(emptyResult.status === "INSUFFICIENT_EVIDENCE", "Empty project returns INSUFFICIENT_EVIDENCE");
    assert(emptyResult.deviationCount === 0, "Zero deviations on empty project");
    assert(emptyResult.mutatesState === false, "Zero mutation flag confirmed");

    // ── Test 2: Waterfall Phase Gate Violation
    console.log("\n[TEST 2] Waterfall phase gate violation detection");
    const outOfPhaseTask = await Task.create({
      projectId: wfProj._id,
      teamId: testTeam._id,
      title: "Early Deployment Script",
      status: "in_progress",
      phase: "deployment", // Current project phase is 'requirements'
    });

    // Add baseline project event
    await ProjectEvent.create({
      projectId: wfProj._id,
      teamId: testTeam._id,
      actorId: testUser._id,
      actorName: testUser.name,
      title: "Task created",
      eventType: "TASK_CREATED",
      entityType: "task",
      entityId: outOfPhaseTask._id.toString(),
      newValue: "in_progress",
    });

    const wfResult = await analyzeWorkflowConformance(wfProj._id);
    const phaseDev = wfResult.deviations.find(d => d.deviationType === "PHASE_GATE_VIOLATION");
    assert(Boolean(phaseDev), "PHASE_GATE_VIOLATION detected");
    assert(phaseDev.severity === "HIGH", "Phase violation is severity HIGH");
    assert(wfResult.conformanceScore < 100, `Conformance score reduced (${wfResult.conformanceScore}%)`);

    // Clean tasks for next test
    await Task.deleteMany({ projectId: wfProj._id });
    await ProjectEvent.deleteMany({ projectId: wfProj._id });

    // ── Test 3: Skipped Required Stage
    console.log("\n[TEST 3] Skipped required stage detection (TODO -> DONE directly)");
    const skippedTask = await Task.create({
      projectId: wfProj._id,
      teamId: testTeam._id,
      title: "Quick Fix",
      status: "done",
    });

    await ProjectEvent.create([
      {
        projectId: wfProj._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        actorName: testUser.name,
        title: "Task status TODO",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: skippedTask._id.toString(),
        previousValue: "CREATED",
        newValue: "TODO",
        timestamp: new Date(Date.now() - 10000),
      },
      {
        projectId: wfProj._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        actorName: testUser.name,
        title: "Task jumped directly to DONE",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: skippedTask._id.toString(),
        previousValue: "TODO",
        newValue: "DONE",
        timestamp: new Date(),
      },
    ]);

    const skipResult = await analyzeWorkflowConformance(wfProj._id);
    const skipDev = skipResult.deviations.find(d => d.deviationType === "SKIPPED_REQUIRED_STAGE");
    assert(Boolean(skipDev), "SKIPPED_REQUIRED_STAGE detected");
    assert(skipDev.expectedPath === "TODO -> IN_PROGRESS -> DONE", "Expected path reported");
    assert(skipDev.actualPath === "TODO -> DONE", "Actual path reported");

    // ── Test 4: Scrum Unsprinted Work
    console.log("\n[TEST 4] Scrum unsprinted rogue work detection");
    const scrumTeam = await Team.create({
      name: `Scrum Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Scrum Conformance",
    });

    scrumProj = await Project.create({
      teamId: scrumTeam._id,
      title: "Scrum Project",
      methodology: "SCRUM",
    });

    const activeSprint = await Sprint.create({
      projectId: scrumProj._id,
      teamId: scrumTeam._id,
      sprintNumber: 1,
      name: "Sprint 1",
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const unsprintedTask = await Task.create({
      projectId: scrumProj._id,
      teamId: scrumTeam._id,
      title: "Unapproved Task",
      status: "in_progress",
      sprintId: null, // No sprint!
    });

    await ProjectEvent.create({
      projectId: scrumProj._id,
      teamId: scrumTeam._id,
      actorId: testUser._id,
      actorName: testUser.name,
      title: "Task status in progress",
      eventType: "TASK_STATUS_CHANGED",
      entityType: "task",
      entityId: unsprintedTask._id.toString(),
      previousValue: "TODO",
      newValue: "IN_PROGRESS",
    });

    const scrumResult = await analyzeWorkflowConformance(scrumProj._id);
    const unsprintedDev = scrumResult.deviations.find(d => d.deviationType === "UNSPRINTED_WORK");
    assert(Boolean(unsprintedDev), "UNSPRINTED_WORK detected in Scrum");
    assert(unsprintedDev.severity === "MEDIUM", "Severity is MEDIUM");

    // ── Test 5: Kanban WIP Limit Exceeded
    console.log("\n[TEST 5] Kanban WIP limit violation detection");
    const kanbanTeam = await Team.create({
      name: `Kanban Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Kanban Conformance",
    });

    kanbanProj = await Project.create({
      teamId: kanbanTeam._id,
      title: "Kanban Project",
      methodology: "KANBAN",
      kanbanConfig: {
        workflowColumns: [
          { id: "backlog", name: "Backlog", wipLimit: 0 },
          { id: "in_progress", name: "In Progress", wipLimit: 2 },
          { id: "done", name: "Done", wipLimit: 0, isDoneColumn: true },
        ],
      },
    });

    // Create 3 in_progress tasks (exceeding limit of 2)
    await Task.create([
      { projectId: kanbanProj._id, teamId: kanbanTeam._id, title: "WIP 1", status: "in_progress", workflowColumn: "in_progress" },
      { projectId: kanbanProj._id, teamId: kanbanTeam._id, title: "WIP 2", status: "in_progress", workflowColumn: "in_progress" },
      { projectId: kanbanProj._id, teamId: kanbanTeam._id, title: "WIP 3", status: "in_progress", workflowColumn: "in_progress" },
    ]);

    await ProjectEvent.create({
      projectId: kanbanProj._id,
      teamId: kanbanTeam._id,
      actorId: testUser._id,
      actorName: testUser.name,
      title: "Task moved",
      eventType: "TASK_STATUS_CHANGED",
      entityType: "task",
      entityId: "temp",
      newValue: "in_progress",
    });

    const kanbanResult = await analyzeWorkflowConformance(kanbanProj._id);
    const wipDev = kanbanResult.deviations.find(d => d.deviationType === "WIP_LIMIT_EXCEEDED");
    assert(Boolean(wipDev), "WIP_LIMIT_EXCEEDED detected in Kanban");
    assert(wipDev.columnName === "In Progress", "Target column identified");

    // ── Test 6: Non-Destructive Invariant Check
    console.log("\n[TEST 6] Non-destructive invariant verification");
    const pCheck = await Project.findById(kanbanProj._id).lean();
    assert(pCheck.methodology === "KANBAN", "Project methodology untouched");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (wfProj) {
      await Project.deleteOne({ _id: wfProj._id });
      await Task.deleteMany({ projectId: wfProj._id });
      await ProjectEvent.deleteMany({ projectId: wfProj._id });
    }
    if (scrumProj) {
      await Project.deleteOne({ _id: scrumProj._id });
      await Team.deleteOne({ _id: scrumProj.teamId });
      await Task.deleteMany({ projectId: scrumProj._id });
      await Sprint.deleteMany({ projectId: scrumProj._id });
      await ProjectEvent.deleteMany({ projectId: scrumProj._id });
    }
    if (kanbanProj) {
      await Project.deleteOne({ _id: kanbanProj._id });
      await Team.deleteOne({ _id: kanbanProj.teamId });
      await Task.deleteMany({ projectId: kanbanProj._id });
      await ProjectEvent.deleteMany({ projectId: kanbanProj._id });
    }
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`WORKFLOW CONFORMANCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
