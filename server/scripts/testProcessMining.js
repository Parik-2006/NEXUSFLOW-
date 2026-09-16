/**
 * server/scripts/testProcessMining.js
 * ============================================================================
 * NEXUSFLOW V4 — PROCESS MINING ENGINE TEST SUITE (Prompt 11)
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
import ProjectEvent from "../models/ProjectEvent.js";
import { normalizeProcessEvent, analyzeProjectProcess } from "../services/processMiningEngine.js";

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
  console.log("NEXUSFLOW V4 — PROCESS MINING ENGINE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let testUser, testTeam, testProject;

  try {
    testUser = await User.create({
      name: `Process Miner ${ts}`,
      email: `miner_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Process Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Mining Suite",
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Mining Project",
      methodology: "SCRUM",
    });

    // ── Test 1: Empty Project Handled with INSUFFICIENT_EVIDENCE
    console.log("[TEST 1] Empty project event history");
    const emptyAnalysis = await analyzeProjectProcess(testProject._id);
    assert(emptyAnalysis.status === "INSUFFICIENT_EVIDENCE", "Empty project returns INSUFFICIENT_EVIDENCE");
    assert(emptyAnalysis.eventCount === 0, "Event count is 0");
    assert(emptyAnalysis.readOnly === true, "Analysis is readOnly");

    // ── Test 2: Event Normalization Unit Check
    console.log("\n[TEST 2] Event normalization");
    const sampleEvent = {
      _id: new mongoose.Types.ObjectId(),
      timestamp: new Date(),
      actorId: testUser._id,
      actorName: "Developer",
      eventType: "TASK_STATUS_CHANGED",
      entityType: "task",
      entityId: "task_123",
      previousValue: "todo",
      newValue: "in_progress",
    };
    const norm = normalizeProcessEvent(sampleEvent);
    assert(norm.fromState === "TODO", "fromState normalized to uppercase");
    assert(norm.toState === "IN_PROGRESS", "toState normalized to uppercase");
    assert(norm.entityId === "task_123", "entityId preserved");

    // ── Test 3: Populate Real Event History & Analyze Transitions
    console.log("\n[TEST 3] State transitions graph and dwell time calculation");
    const taskA = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task A: Authentication",
      status: "done",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
      updatedAt: new Date(),
    });

    const taskB = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task B: Database Setup",
      status: "in_progress",
      isBlocked: true,
      totalBlockedDurationMs: 6 * 60 * 60 * 1000, // 6h
    });

    // Create realistic sequential events for Task A
    await ProjectEvent.create([
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        actorName: testUser.name,
        title: "Task status changed to IN_PROGRESS",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskA._id.toString(),
        previousValue: "TODO",
        newValue: "IN_PROGRESS",
        timestamp: new Date(Date.now() - 40 * 60 * 60 * 1000),
      },
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        actorName: testUser.name,
        title: "Task status changed to REVIEW",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskA._id.toString(),
        previousValue: "IN_PROGRESS",
        newValue: "REVIEW",
        timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        actorName: testUser.name,
        title: "Task status changed to DONE",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskA._id.toString(),
        previousValue: "REVIEW",
        newValue: "DONE",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);

    const analysis = await analyzeProjectProcess(testProject._id);
    assert(analysis.status === "SUFFICIENT_EVIDENCE", "Status is SUFFICIENT_EVIDENCE");
    assert(analysis.eventCount >= 3, `Event count analyzed (${analysis.eventCount})`);
    assert(analysis.transitions.length >= 2, "Transition edges constructed");
    assert(analysis.cycleTimes.count === 1, "Computed cycle time for completed Task A");
    assert(analysis.cycleTimes.meanHours > 0, `Mean cycle time calculated (${analysis.cycleTimes.meanHours}h)`);

    // ── Test 4: Blocked Metrics
    console.log("\n[TEST 4] Blocked duration metrics");
    assert(analysis.blockedMetrics.blockedTaskCount === 1, "Blocked task detected");
    assert(analysis.blockedMetrics.totalBlockedDurationHours === 6, "Blocked duration aggregated (6h)");

    // ── Test 5: Rework Loop Detection
    console.log("\n[TEST 5] Rework cycle detection");
    // Add rework events for Task B: IN_PROGRESS -> REVIEW -> IN_PROGRESS (loop!)
    await ProjectEvent.create([
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        title: "Task status changed to IN_PROGRESS",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskB._id.toString(),
        previousValue: "TODO",
        newValue: "IN_PROGRESS",
        timestamp: new Date(Date.now() - 15 * 60 * 60 * 1000),
      },
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        title: "Task status changed to REVIEW",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskB._id.toString(),
        previousValue: "IN_PROGRESS",
        newValue: "REVIEW",
        timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000),
      },
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: testUser._id,
        title: "Task rework to IN_PROGRESS",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: taskB._id.toString(),
        previousValue: "REVIEW",
        newValue: "IN_PROGRESS", // Rework back to IN_PROGRESS
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    ]);

    const reworkAnalysis = await analyzeProjectProcess(testProject._id);
    assert(reworkAnalysis.rework.loopCount >= 1, `Rework loop count detected (${reworkAnalysis.rework.loopCount})`);
    assert(reworkAnalysis.rework.affectedTasks.length >= 1, "Task B flagged with rework loop");
    assert(
      reworkAnalysis.rework.affectedTasks[0].repeatedStates.includes("IN_PROGRESS"),
      "Repeated state 'IN_PROGRESS' identified"
    );

    // ── Test 6: Invariant Verification — No state mutation
    console.log("\n[TEST 6] Non-destructive invariant verification");
    const projCheck = await Project.findById(testProject._id).lean();
    assert(projCheck.methodology === "SCRUM", "Project methodology untouched");
    const taskCheck = await Task.findById(taskA._id).lean();
    assert(taskCheck.status === "done", "Task A status untouched");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) {
      await Project.deleteOne({ _id: testProject._id });
      await Task.deleteMany({ projectId: testProject._id });
      await ProjectEvent.deleteMany({ projectId: testProject._id });
    }
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`PROCESS MINING RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
