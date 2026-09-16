/**
 * server/scripts/testFairContribution.js
 * ============================================================================
 * NEXUSFLOW V4 — FAIR CONTRIBUTION ANALYSIS TEST SUITE (Prompt 15)
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
import ContributionDispute from "../models/ContributionDispute.js";
import {
  calculateProjectContribution,
  getStudentContributionView,
  createContributionDispute,
  resolveContributionDispute,
  CONTRIBUTION_WEIGHTS,
} from "../services/fairContributionService.js";

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
  console.log("NEXUSFLOW V4 — FAIR CONTRIBUTION ANALYSIS TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let studentA, studentB, facultyUser, testTeam, testProject;

  try {
    studentA = await User.create({
      name: `Alice Eng ${ts}`,
      email: `alice_${ts}@university.edu`,
      password: "Password123!",
      role: "student",
    });

    studentB = await User.create({
      name: `Bob Code ${ts}`,
      email: `bob_${ts}@university.edu`,
      password: "Password123!",
      role: "student",
    });

    facultyUser = await User.create({
      name: `Dr. Garcia ${ts}`,
      email: `garcia_${ts}@university.edu`,
      password: "Password123!",
      role: "faculty",
    });

    testTeam = await Team.create({
      name: `Robotics Team ${ts}`,
      ownerId: studentA._id,
      projectTitle: "Autonomous Rover",
      members: [
        { userId: studentA._id, name: studentA.name, role: "leader" },
        { userId: studentB._id, name: studentB.name, role: "member" },
      ],
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Mars Rover Telemetry",
      methodology: "SCRUM",
      requirements: [
        {
          reqId: "REQ-PATH",
          title: "Pathfinding Algorithm",
          status: "approved",
          implementationEvidence: ["git-commit-1"],
          testEvidence: ["unit-test-report"],
        },
        {
          reqId: "REQ-SENSORS",
          title: "LIDAR Integration",
          status: "approved",
          implementationEvidence: ["lidar-driver-code"],
          testEvidence: [],
        },
      ],
    });

    // Task 1: Assigned to Alice (Critical complexity, 20h, linked to REQ-PATH)
    const task1 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Implement A* Pathfinding",
      status: "done",
      estimatedHours: 20,
      priorityLabel: "critical",
      assignedTo: studentA._id,
    });

    // Link task1 to requirement
    await Project.updateOne(
      { _id: testProject._id, "requirements.reqId": "REQ-PATH" },
      { $push: { "requirements.$.taskIds": task1._id.toString() } }
    );

    // Task 2: Assigned to Bob (Standard complexity, 10h, linked to REQ-SENSORS)
    const task2 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "LIDAR Driver Interface",
      status: "done",
      estimatedHours: 10,
      priorityLabel: "medium",
      assignedTo: studentB._id,
    });

    // Link task2 to requirement
    await Project.updateOne(
      { _id: testProject._id, "requirements.reqId": "REQ-SENSORS" },
      { $push: { "requirements.$.taskIds": task2._id.toString() } }
    );

    // Create project events
    await ProjectEvent.create([
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: studentA._id,
        actorName: studentA.name,
        title: "Task completed",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: task1._id.toString(),
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        projectId: testProject._id,
        teamId: testTeam._id,
        actorId: studentB._id,
        actorName: studentB.name,
        title: "Task completed",
        eventType: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: task2._id.toString(),
        timestamp: new Date(),
      },
    ]);

    // ── Test 1: Multidimensional Contribution Analysis
    console.log("[TEST 1] Multidimensional contribution analysis");
    const analysis = await calculateProjectContribution(testProject._id);
    assert(analysis.status === "COMPUTED", "Analysis computed successfully");
    assert(analysis.weights.taskWorkload === 0.4, "Task workload weight is 40%");
    assert(analysis.weights.requirementCoverage === 0.25, "Requirement coverage weight is 25%");
    assert(analysis.members.length === 2, "Evaluated both team members");

    const aliceRecord = analysis.members.find(m => m.memberId === studentA._id.toString());
    const bobRecord = analysis.members.find(m => m.memberId === studentB._id.toString());

    assert(Boolean(aliceRecord && bobRecord), "Records present for both students");
    assert(
      aliceRecord.completedWorkloadHours > bobRecord.completedWorkloadHours,
      `Workload reflects task complexity and hours (Alice: ${aliceRecord.completedWorkloadHours}h vs Bob: ${bobRecord.completedWorkloadHours}h)`
    );
    assert(
      aliceRecord.factualSummary.includes("completed 1 tasks"),
      "Factual summary contains objective task counts"
    );

    // ── Test 2: Formula and Transparency
    console.log("\n[TEST 2] Formula explanation transparency");
    assert(
      analysis.formulaExplanation.includes("40% Workload Hours"),
      "Formula explicitly displayed in analysis response"
    );
    assert(
      aliceRecord.dimensionalShares.taskWorkload > 0,
      "Dimensional shares broken down"
    );

    // ── Test 3: Student Self-Inspection View
    console.log("\n[TEST 3] Student self-view data isolation");
    const aliceSelfView = await getStudentContributionView(testProject._id, studentA._id);
    assert(aliceSelfView.isPersonalView === true, "Marked as personal view");
    assert(aliceSelfView.student.memberId === studentA._id.toString(), "Returns student's own record");

    // ── Test 4: Contribution Dispute Workflow
    console.log("\n[TEST 4] Contribution dispute filing & resolution");
    const dispute = await createContributionDispute({
      projectId: testProject._id,
      studentId: studentB._id,
      studentName: studentB.name,
      disputeCategory: "EVIDENCE_UNATTRIBUTED",
      description: "Tested the LIDAR sensor in lab; test report was attached by lead without my tag.",
      evidenceUrls: ["https://drive.google.com/test-report"],
    });

    assert(dispute.status === "PENDING", "Dispute created in PENDING status");
    assert(dispute.disputeCategory === "EVIDENCE_UNATTRIBUTED", "Category recorded");

    // Resolve dispute
    const resolvedDispute = await resolveContributionDispute(
      dispute._id,
      {
        status: "RESOLVED",
        resolutionNotes: "Attributed LIDAR lab test report to Bob as co-author.",
      },
      facultyUser._id,
      facultyUser.name
    );

    assert(resolvedDispute.status === "RESOLVED", "Dispute marked RESOLVED");
    assert(resolvedDispute.resolutionNotes.includes("co-author"), "Resolution notes recorded");
    assert(resolvedDispute.resolvedBy.toString() === facultyUser._id.toString(), "Resolver recorded");

  } finally {
    console.log("\n[CLEANUP]");
    if (studentA) await User.deleteOne({ _id: studentA._id });
    if (studentB) await User.deleteOne({ _id: studentB._id });
    if (facultyUser) await User.deleteOne({ _id: facultyUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) {
      await Project.deleteOne({ _id: testProject._id });
      await Task.deleteMany({ projectId: testProject._id });
      await ProjectEvent.deleteMany({ projectId: testProject._id });
      await ContributionDispute.deleteMany({ projectId: testProject._id });
    }
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`FAIR CONTRIBUTION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
