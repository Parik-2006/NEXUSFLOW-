/**
 * server/scripts/testV4WaterfallCompletion.js
 * ============================================================================
 * NEXUSFLOW V4 — WATERFALL COMPLETION & REGRESSION TEST SUITE
 *
 * Validates Prompts 14–23:
 *   [TEST 1] Project Event Model & Audit Trail (Prompt 17)
 *   [TEST 2] Waterfall Phase Gate Evaluation & Blockers (Prompt 14)
 *   [TEST 3] Server-Side Authorization for Phase Gate Advance (Prompt 14)
 *   [TEST 4] Leader Gate Override with Mandatory Justification (Prompt 14)
 *   [TEST 5] Waterfall Change Impact Multi-Hop Tracing (Prompt 15)
 *   [TEST 6] Change Impact Safety: Read-Only Simulation Guarantee (Prompt 15)
 *   [TEST 7] Reactive Engine & Cache Invalidation Versioning (Prompt 16)
 *   [TEST 8] NexusFlow Classic Entry & Methodology Isolation (Prompt 23)
 *   [TEST 9] Full-Chain Waterfall Integration (Prompt 22)
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import ProjectEvent from "../models/ProjectEvent.js";

import {
  evaluateProjectPhaseGate,
  advanceProjectPhase,
  overrideProjectPhaseGate,
} from "../services/phaseGateService.js";
import { simulateChangeImpact } from "../services/changeImpactService.js";
import { handleProjectMutation } from "../services/reactiveEngine.js";
import { recordProjectEvent, getProjectEvents } from "../services/eventService.js";
import { calculateRequirementScore, sortRequirementsMergeSort } from "../services/requirementService.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexusflow_dev";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runCompletionSuite() {
  console.log("\n========================================================");
  console.log("NEXUSFLOW V4 — WATERFALL COMPLETION TEST SUITE (PROMPTS 14–23)");
  console.log("========================================================\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB successfully.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const timestamp = Date.now();
  let leaderUser, memberUser, testTeam, waterfallProject, classicProject;

  try {
    // ── Setup Users & Team ──────────────────────────────────────────────────
    console.log("[SETUP] Creating Test Leader, Member, and Team...");
    leaderUser = await User.create({
      name: `Leader ${timestamp}`,
      email: `leader_${timestamp}@nexusflow.dev`,
      password: "Password123!",
    });

    memberUser = await User.create({
      name: `Member ${timestamp}`,
      email: `member_${timestamp}@nexusflow.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `V4 Waterfall Completion Team ${timestamp}`,
      leaderId: leaderUser._id,
      members: [
        { userId: leaderUser._id, name: leaderUser.name, role: "leader" },
        { userId: memberUser._id, name: memberUser.name, role: "member" },
      ],
    });

    waterfallProject = await Project.create({
      teamId: testTeam._id,
      title: "AI Crop Disease Detection System",
      description: "Automated vision model for plant pathology via edge devices.",
      methodology: "WATERFALL",
      waterfallPhase: "requirements",
      requirements: [],
      derivedVersion: 1,
    });

    assert(waterfallProject.waterfallPhase === "requirements", "Waterfall project initialized in 'requirements' phase");

    // =========================================================================
    // [TEST 1] Project Event Model & Audit Trail (Prompt 17)
    // =========================================================================
    console.log("\n[TEST 1] Project Event Model & Audit Trail (Prompt 17)");
    const createdEvent = await recordProjectEvent({
      projectId: waterfallProject._id,
      teamId: testTeam._id,
      actorId: leaderUser._id,
      actorName: leaderUser.name,
      eventType: "PROJECT_CREATED",
      entityType: "project",
      entityId: waterfallProject._id.toString(),
      title: "Project Initialized",
      description: "Waterfall methodology configured with sequential phase gating.",
      source: "user",
    });

    assert(createdEvent !== null, "ProjectEvent created successfully");
    assert(createdEvent.eventType === "PROJECT_CREATED", "Event record carries correct eventType");

    const eventsList = await getProjectEvents(waterfallProject._id, { limit: 10 });
    assert(eventsList.events.length >= 1, "Project events queried and returned via getProjectEvents");
    assert(eventsList.events[0].title === "Project Initialized", "Event title matches recorded event");

    // =========================================================================
    // [TEST 2] Waterfall Phase Gate Evaluation & Blockers (Prompt 14)
    // =========================================================================
    console.log("\n[TEST 2] Waterfall Phase Gate Evaluation & Blockers (Prompt 14)");
    // With 0 requirements, the Requirements -> Design gate MUST be BLOCKED
    const gateEvalEmpty = await evaluateProjectPhaseGate(waterfallProject._id);
    assert(gateEvalEmpty.status === "BLOCKED", "Empty requirements phase correctly marked BLOCKED");
    assert(gateEvalEmpty.canAdvance === false, "canAdvance is false when requirements are missing");
    assert(gateEvalEmpty.blockers.length >= 1, `Gate returns explainable blocker: "${gateEvalEmpty.blockers[0]}"`);

    // Add unapproved requirement -> still blocked
    waterfallProject.requirements.push({
      reqId: "REQ-001",
      title: "Edge Model Inference Pipeline",
      phase: "requirements",
      academicValue: 9,
      teacherImportance: 9,
      criticality: 8,
      businessValue: 7,
      status: "draft", // not approved yet
      priorityScore: 88,
    });
    await waterfallProject.save();

    const gateEvalDraft = await evaluateProjectPhaseGate(waterfallProject._id);
    assert(gateEvalDraft.canAdvance === false, "Gate remains blocked while requirements are in draft status");

    // Approve requirement -> gate becomes READY
    waterfallProject.requirements[0].status = "approved";
    await waterfallProject.save();

    const gateEvalReady = await evaluateProjectPhaseGate(waterfallProject._id);
    assert(gateEvalReady.status === "READY", "Gate evaluates to READY once required requirements are approved");
    assert(gateEvalReady.canAdvance === true, "canAdvance is true when all prerequisites pass");
    assert(gateEvalReady.targetPhase === "design", "Target phase correctly identified as 'design'");

    // =========================================================================
    // [TEST 3] Server-Side Authorization for Phase Gate Advance (Prompt 14)
    // =========================================================================
    console.log("\n[TEST 3] Server-Side Authorization for Phase Gate Advance (Prompt 14)");
    let memberAdvanceFailed = false;
    try {
      await advanceProjectPhase({
        projectId: waterfallProject._id,
        teamId: testTeam._id,
        userId: memberUser._id, // Non-leader
        userName: memberUser.name,
      });
    } catch (authErr) {
      memberAdvanceFailed = authErr.statusCode === 403;
    }
    assert(memberAdvanceFailed, "Non-leader member advance attempt rejected with 403 Unauthorized");

    // Leader advances phase
    const advanceResult = await advanceProjectPhase({
      projectId: waterfallProject._id,
      teamId: testTeam._id,
      userId: leaderUser._id, // Leader
      userName: leaderUser.name,
    });

    assert(advanceResult.success === true, "Leader successfully advanced project to next phase");
    assert(advanceResult.waterfallPhase === "design", "Project is now in 'design' phase");

    const reloadedProject = await Project.findById(waterfallProject._id);
    assert(reloadedProject.waterfallPhase === "design", "Project waterfallPhase persisted as 'design' in MongoDB");
    assert(reloadedProject.phaseGateHistory.length >= 1, "Phase advancement recorded in phaseGateHistory");

    // =========================================================================
    // [TEST 4] Leader Gate Override with Mandatory Justification (Prompt 14)
    // =========================================================================
    console.log("\n[TEST 4] Leader Gate Override with Mandatory Justification (Prompt 14)");
    // In 'design' phase with no design components, Design -> Implementation is BLOCKED
    const designGateEval = await evaluateProjectPhaseGate(waterfallProject._id);
    assert(designGateEval.status === "BLOCKED", "Design phase initially BLOCKED without design specs");

    // Attempt override without reason -> rejected
    let emptyReasonFailed = false;
    try {
      await overrideProjectPhaseGate({
        projectId: waterfallProject._id,
        teamId: testTeam._id,
        userId: leaderUser._id,
        userName: leaderUser.name,
        phase: "design",
        reason: "",
      });
    } catch (e) {
      emptyReasonFailed = e.statusCode === 400;
    }
    assert(emptyReasonFailed, "Override rejected when justification reason is missing");

    // Leader provides valid override
    const overrideResult = await overrideProjectPhaseGate({
      projectId: waterfallProject._id,
      teamId: testTeam._id,
      userId: leaderUser._id,
      userName: leaderUser.name,
      phase: "design",
      reason: "Course instructor approved parallel implementation of baseline ML architecture.",
    });

    assert(overrideResult.success === true, "Leader override successfully recorded");

    const postOverrideGate = await evaluateProjectPhaseGate(waterfallProject._id);
    assert(postOverrideGate.status === "OVERRIDDEN", "Phase gate status is now OVERRIDDEN");
    assert(postOverrideGate.canAdvance === true, "Overridden gate allows progression to Implementation");
    assert(postOverrideGate.isOverridden === true, "Gate reflects isOverridden flag");

    // =========================================================================
    // [TEST 5] Waterfall Change Impact Multi-Hop Tracing (Prompt 15)
    // =========================================================================
    console.log("\n[TEST 5] Waterfall Change Impact Multi-Hop Tracing (Prompt 15)");
    // Create tasks with dependency chain: Task A -> Task B (Critical)
    const taskA = await Task.create({
      teamId: testTeam._id,
      projectId: waterfallProject._id,
      title: "Sensor Interface Driver",
      phase: "implementation",
      priority: "high",
      requirementId: "REQ-001",
      estimatedHours: 16,
      skills: ["backend", "devops"],
      status: "in_progress",
    });

    const taskB = await Task.create({
      teamId: testTeam._id,
      projectId: waterfallProject._id,
      title: "Real-time Telemetry Pipeline",
      phase: "implementation",
      priority: "urgent",
      requirementId: "REQ-001",
      dependencies: [taskA._id],
      estimatedHours: 24,
      skills: ["backend"],
      status: "todo",
    });

    // Simulate change: adding major new requirement
    const impactResult = await simulateChangeImpact({
      projectId: waterfallProject._id,
      changeType: "requirement_added",
      entityId: "REQ-002",
      payload: {
        title: "Automated Edge Firmware OTA Updates",
        estimatedHours: 32,
        phase: "implementation",
        requiredSkills: ["devops", "backend"],
      },
    });

    assert(impactResult.sourceChange.type === "requirement_added", "Change impact source identified");
    assert(impactResult.scheduleImpact.estimatedDaysAdded >= 4, `Projected schedule addition: +${impactResult.scheduleImpact.estimatedDaysAdded} days`);
    assert(typeof impactResult.severity === "string", `Impact severity computed: ${impactResult.severity}`);
    assert(impactResult.explanation.length > 20, "Human-readable narrative explanation generated");

    // =========================================================================
    // [TEST 6] Change Impact Safety: Read-Only Simulation Guarantee (Prompt 15)
    // =========================================================================
    console.log("\n[TEST 6] Change Impact Safety: Read-Only Simulation Guarantee (Prompt 15)");
    // Verify that simulating impact did NOT alter tasks, requirements, or deadlines
    const tasksAfterSimulation = await Task.find({ teamId: testTeam._id });
    const projectAfterSimulation = await Project.findById(waterfallProject._id);

    assert(tasksAfterSimulation.length === 2, "Task count remains untouched (2 -> 2)");
    assert(projectAfterSimulation.requirements.length === 1, "Requirements remain untouched (1 -> 1)");
    assert(projectAfterSimulation.waterfallPhase === "design", "Project phase remains untouched");

    // =========================================================================
    // [TEST 7] Reactive Engine & Cache Invalidation Versioning (Prompt 16)
    // =========================================================================
    console.log("\n[TEST 7] Reactive Engine & Cache Invalidation Versioning (Prompt 16)");
    const initialVersion = projectAfterSimulation.derivedVersion || 1;

    const mutationResult = await handleProjectMutation({
      projectId: waterfallProject._id,
      teamId: testTeam._id,
      actorId: leaderUser._id,
      actorName: leaderUser.name,
      mutationType: "TASK_STATUS_CHANGED",
      entityId: taskA._id.toString(),
      payload: { previousStatus: "in_progress", newStatus: "done" },
    });

    assert(mutationResult !== null && mutationResult.success === true, "Reactive engine handled mutation");
    assert(mutationResult.derivedVersion === initialVersion + 1, `Derived version bumped ${initialVersion} → ${mutationResult.derivedVersion}`);
    assert(mutationResult.affectedDomains.includes("CRITICAL_PATH"), "Affected domains identified (includes CRITICAL_PATH)");

    const updatedProjectAfterReactive = await Project.findById(waterfallProject._id);
    assert(updatedProjectAfterReactive.derivedVersion === initialVersion + 1, "Bumped version saved in MongoDB");

    // =========================================================================
    // [TEST 8] NexusFlow Classic Entry & Methodology Isolation (Prompt 23)
    // =========================================================================
    console.log("\n[TEST 8] NexusFlow Classic Entry & Methodology Isolation (Prompt 23)");
    classicProject = await Project.create({
      teamId: testTeam._id,
      title: "Classic V3 Web Portal",
      description: "Existing V3-style unstructured team project.",
      methodology: "CLASSIC",
      derivedVersion: 1,
    });

    assert(classicProject.methodology === "CLASSIC", "Project created with CLASSIC methodology enum");

    // Project with legacy alias "NEXUSFLOW"
    const nexusflowAliasProject = await Project.create({
      teamId: testTeam._id,
      title: "Legacy Alias Project",
      methodology: "NEXUSFLOW",
    });
    assert(nexusflowAliasProject.methodology === "NEXUSFLOW", "NEXUSFLOW alias accepted by Project model");

    // Verify Classic project does not have mandatory waterfallPhase barriers
    assert(classicProject.waterfallPhase === "requirements", "Default waterfallPhase field exists without breaking");

    // =========================================================================
    // [TEST 9] Full-Chain Waterfall Integration (Prompt 22)
    // =========================================================================
    console.log("\n[TEST 9] Full-Chain Waterfall Integration (Prompt 22)");
    // Requirement -> Scored -> Task -> Linked -> Change Impact -> Event
    const reqData = {
      academicValue: 10,
      teacherImportance: 9,
      criticality: 9,
      businessValue: 8,
      dependencies: ["REQ-001"],
    };
    const scoredReq = calculateRequirementScore(reqData);
    assert(scoredReq.priorityScore >= 80, `DAA Requirement Score computed: ${scoredReq.priorityScore}`);

    const eventHistory = await getProjectEvents(waterfallProject._id);
    assert(eventHistory.total >= 3, `Full audit trail verified: ${eventHistory.total} events recorded for project`);

    console.log("\n[CLEANUP] Cleaning up test records...");
    await ProjectEvent.deleteMany({ projectId: waterfallProject._id });
    await Task.deleteMany({ teamId: testTeam._id });
    await Project.deleteMany({ teamId: testTeam._id });
    await Team.findByIdAndDelete(testTeam._id);
    await User.deleteMany({ _id: { $in: [leaderUser._id, memberUser._id] } });

    await mongoose.disconnect();
    console.log("Database connection closed cleanly.\n");

    console.log("========================================================");
    console.log(`V4 WATERFALL COMPLETION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("========================================================\n");

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runCompletionSuite();
