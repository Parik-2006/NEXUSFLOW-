/**
 * server/scripts/testDigitalTwin.js
 * ============================================================================
 * NEXUSFLOW V4 — UNIFIED DIGITAL TWIN DATA SERVICE TESTS (Prompt 10)
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
import { getDigitalTwinState, getDigitalTwinDelta } from "../services/digitalTwinService.js";
import { configureHybrid } from "../services/hybridEngine.js";

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
  console.log("NEXUSFLOW V4 — UNIFIED DIGITAL TWIN SERVICE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let testUser, testTeam, wfProj, scrumProj, kanbanProj, hybridProj;

  try {
    testUser = await User.create({
      name: `Digital Twin Tester ${ts}`,
      email: `twin_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Twin Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Twin Test Suite",
    });

    // ── Test 1: Waterfall Digital Twin Adapter
    console.log("[TEST 1] Waterfall Digital Twin Adapter");
    wfProj = await Project.create({
      teamId: testTeam._id,
      title: "Waterfall Twin Project",
      methodology: "WATERFALL",
      waterfallPhase: "design",
    });

    const task1 = await Task.create({
      projectId: wfProj._id,
      teamId: testTeam._id,
      title: "Requirement Specs",
      status: "done",
      phase: "requirements",
    });

    const task2 = await Task.create({
      projectId: wfProj._id,
      teamId: testTeam._id,
      title: "Architecture Design",
      status: "in_progress",
      phase: "design",
      dependencies: [task1._id],
    });

    const wfState = await getDigitalTwinState(wfProj._id);
    assert(wfState.readOnly === true, "Digital Twin state is explicitly readOnly");
    assert(wfState.project.methodology === "WATERFALL", "Methodology is WATERFALL");
    assert(wfState.methodologyAdapter.type === "waterfall", "Adapter type is waterfall");
    assert(wfState.methodologyAdapter.phases.length === 6, "Waterfall adapter includes 6 phases");
    assert(wfState.methodologyAdapter.currentPhase === "design", "Current phase is design");
    assert(wfState.methodologyAdapter.currentPhaseIndex === 1, "Current phase index is 1");
    assert(wfState.tasks.length === 2, "Common state contains 2 tasks");
    assert(wfState.edges.length === 1, "Common state dependency graph has 1 edge");

    // ── Test 5 (Early): Lightweight Delta Updates for Socket.IO
    console.log("\n[TEST 2] Lightweight Delta Updates for Socket.IO");
    const delta = await getDigitalTwinDelta(wfProj._id);
    assert(delta !== null, "Delta object returned");
    assert(delta.projectId === wfProj._id.toString(), "Delta projectId matches");
    assert(delta.tasks.length === 2, "Delta tasks count matches");
    assert(delta.metrics.total === 2, "Delta total count is 2");
    assert(delta.metrics.done === 1, "Delta done count is 1");
    assert(typeof delta.timestamp === "string", "Delta timestamp attached");

    // Clear waterfall tasks for clean isolation
    await Task.deleteMany({ teamId: testTeam._id });

    // ── Test 3: Scrum Digital Twin Adapter
    console.log("\n[TEST 3] Scrum Digital Twin Adapter");
    scrumProj = await Project.create({
      teamId: testTeam._id,
      title: "Scrum Twin Project",
      methodology: "SCRUM",
    });

    const sprint = await Sprint.create({
      projectId: scrumProj._id,
      teamId: testTeam._id,
      sprintNumber: 1,
      name: "Sprint 1 — Alpha",
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      goal: "Ship MVP backend",
    });

    await Task.create({
      projectId: scrumProj._id,
      teamId: testTeam._id,
      title: "Sprint Story 1",
      status: "in_progress",
      sprintId: sprint._id,
    });

    await Task.create({
      projectId: scrumProj._id,
      teamId: testTeam._id,
      title: "Backlog Item 1",
      status: "todo",
      sprintId: null,
    });

    const scrumState = await getDigitalTwinState(scrumProj._id);
    assert(scrumState.methodologyAdapter.type === "scrum", "Adapter type is scrum");
    assert(scrumState.methodologyAdapter.sprints.length === 1, "Scrum adapter includes 1 sprint");
    assert(scrumState.methodologyAdapter.activeSprint.name === "Sprint 1 — Alpha", "Active sprint identified");
    assert(scrumState.methodologyAdapter.activeSprint.taskCount === 1, "Active sprint task counted");
    assert(scrumState.methodologyAdapter.backlogCount === 1, "Backlog task counted");

    await Task.deleteMany({ teamId: testTeam._id });

    // ── Test 4: Kanban Digital Twin Adapter
    console.log("\n[TEST 4] Kanban Digital Twin Adapter");
    kanbanProj = await Project.create({
      teamId: testTeam._id,
      title: "Kanban Twin Project",
      methodology: "KANBAN",
      kanbanConfig: {
        workflowColumns: [
          { id: "backlog", name: "Backlog", wipLimit: 0 },
          { id: "in_progress", name: "In Progress", wipLimit: 3 },
          { id: "done", name: "Done", wipLimit: 0, isDoneColumn: true },
        ],
      },
    });

    await Task.create({
      projectId: kanbanProj._id,
      teamId: testTeam._id,
      title: "Flowing Item",
      status: "in_progress",
      workflowColumn: "in_progress",
    });

    const kanbanState = await getDigitalTwinState(kanbanProj._id);
    assert(kanbanState.methodologyAdapter.type === "kanban", "Adapter type is kanban");
    assert(kanbanState.methodologyAdapter.columns.length === 3, "Kanban adapter includes 3 columns");
    assert(kanbanState.methodologyAdapter.columns.find(c => c.id === "in_progress").taskCount === 1, "In progress column has 1 item");

    await Task.deleteMany({ teamId: testTeam._id });

    // ── Test 5: Hybrid Digital Twin Adapter
    console.log("\n[TEST 5] Hybrid Digital Twin Adapter");
    hybridProj = await Project.create({
      teamId: testTeam._id,
      title: "Hybrid Twin Project",
      methodology: "HYBRID",
    });

    await configureHybrid({
      projectId: hybridProj._id,
      config: {
        planningMethodology: "WATERFALL",
        executionMethodology: "SCRUM",
        governanceMethodology: "WATERFALL",
      },
      userId: testUser._id,
      userName: testUser.name,
    });

    const hybridState = await getDigitalTwinState(hybridProj._id);
    assert(hybridState.methodologyAdapter.type === "hybrid", "Adapter type is hybrid");
    assert(hybridState.methodologyAdapter.boundaries.planning === "WATERFALL", "Hybrid planning boundary is WATERFALL");
    assert(hybridState.methodologyAdapter.boundaries.execution === "SCRUM", "Hybrid execution boundary is SCRUM");
    assert(hybridState.methodologyAdapter.layers.length >= 2, "Hybrid adapter includes multiple methodology layers");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (wfProj) await Project.deleteOne({ _id: wfProj._id });
    if (scrumProj) await Project.deleteOne({ _id: scrumProj._id });
    if (kanbanProj) await Project.deleteOne({ _id: kanbanProj._id });
    if (hybridProj) await Project.deleteOne({ _id: hybridProj._id });
    if (testTeam) await Task.deleteMany({ teamId: testTeam._id });
    if (scrumProj) await Sprint.deleteMany({ projectId: scrumProj._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`DIGITAL TWIN RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
