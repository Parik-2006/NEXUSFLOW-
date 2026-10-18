/**
 * server/scripts/testWaterfallAndRiskReconciliationSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — FINAL TWO FIXES INTEGRATED TEST SUITE:
 * 1. Waterfall Plan: Shorter Bulk-Conversion Button ("Convert All to Tasks") & Responsive Layout
 * 2. Task Completion, Stale Risk Reconciliation & Cross-Tab Consistency
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import SkillVerification from "../models/SkillVerification.js";
import { scanProjectRisks, isTaskDone, isTaskCancelled } from "../services/riskEngine.js";
import { computeUnifiedProjectHealth } from "../services/unifiedProjectHealthService.js";
import { bulkConvertApprovedRequirementsToTasks } from "../services/requirementService.js";
import { acceptAssignment } from "../services/capabilityIntelligenceService.js";

async function runSuite() {
  console.log("\n" + "=".repeat(80));
  console.log(" NEXUSFLOW V4 — FINAL TWO FIXES TEST SUITE: WATERFALL BUTTON & RISK RECONCILIATION");
  console.log("=".repeat(80) + "\n");

  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected to MongoDB.\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const suffix = Date.now().toString(36);
  let testUser = null;
  let testMember2 = null;
  let testTeam = null;
  let testProject = null;

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // PART 1: FIX 1 — WATERFALL BUTTON UI/UX & RESPONSIVE LAYOUT VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("--- PART 1: FIX 1 — Waterfall Button UI/UX & Responsive Layout ---");

    const planPanelPath = join(__dirname, "../../client/components/workspace/PlanPanel.tsx");
    const planPanelSource = fs.readFileSync(planPanelPath, "utf-8");

    // 1.1 Exact label
    assert(
      planPanelSource.includes("<Text style={s.bulkConvertBtnText}>Convert All to Tasks</Text>"),
      "Exact button label 'Convert All to Tasks' is present in PlanPanel.tsx"
    );
    assert(
      !planPanelSource.includes("Convert All Approved Requirements to Active Tasks ("),
      "Dynamic count string removed from the button label"
    );

    // 1.2 Layout & Responsive Flex
    assert(
      planPanelSource.includes("reqsCardHeader: {"),
      "Dedicated reqsCardHeader style is defined in PlanPanel stylesheet"
    );
    assert(
      planPanelSource.includes("flexWrap: \"wrap\"") && planPanelSource.includes("reqsCardHeaderLeft: {"),
      "Responsive wrapping style configured on requirements header container"
    );
    assert(
      planPanelSource.includes("bulkConvertBtn: {") && planPanelSource.includes("backgroundColor: \"#0d9488\""),
      "Dark teal/green primary action styling (#0d9488) preserved on bulkConvertBtn"
    );
    assert(
      planPanelSource.includes("<Ionicons name=\"flash\" size={15} color=\"#fff\" />"),
      "Lightning flash icon is preserved inside Convert All to Tasks button"
    );
    assert(
      planPanelSource.includes("s.cardHeaderRightRow"),
      "Header right row contains action controls cleanly aligned"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // PART 2: TASK STATUS NORMALIZATION & ISOLATED FIXTURES CREATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n--- PART 2: Task Status Normalization Checks ---");

    assert(isTaskDone({ status: "done" }) === true, "isTaskDone identifies 'done' status");
    assert(isTaskDone({ status: "DONE" }) === true, "isTaskDone identifies uppercase 'DONE'");
    assert(isTaskDone({ status: "completed" }) === true, "isTaskDone identifies 'completed'");
    assert(isTaskDone({ status: "todo", scrumStatus: "DONE" }) === true, "isTaskDone identifies scrumStatus 'DONE'");
    assert(isTaskDone({ status: "todo", kanbanStatus: "DONE" }) === true, "isTaskDone identifies kanbanStatus 'DONE'");
    assert(isTaskDone({ status: "todo" }) === false, "isTaskDone returns false for 'todo'");
    assert(isTaskDone({ status: "in_progress" }) === false, "isTaskDone returns false for 'in_progress'");
    assert(isTaskCancelled({ status: "cancelled" }) === true, "isTaskCancelled identifies 'cancelled'");
    assert(isTaskCancelled({ scrumStatus: "CANCELLED" }) === true, "isTaskCancelled identifies scrumStatus 'CANCELLED'");

    // Set up real test users, team, and project
    testUser = await User.create({
      name: `Alice Lead_${suffix}`,
      email: `alice_${suffix}@test.com`,
      password: "hashedpassword123",
      skills: ["react", "typescript"],
    });

    testMember2 = await User.create({
      name: `Bob Dev_${suffix}`,
      email: `bob_${suffix}@test.com`,
      password: "hashedpassword123",
      skills: ["python"],
    });

    testTeam = await Team.create({
      name: `Waterfall Reconcile Team ${suffix}`,
      ownerId: testUser._id,
      members: [
        { userId: testUser._id, name: testUser.name, role: "leader", capacity: 30 },
        { userId: testMember2._id, name: testMember2.name, role: "developer", capacity: 30 },
      ],
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: `Waterfall Reconcile Project ${suffix}`,
      status: "active",
      methodology: "WATERFALL",
      requirements: [
        {
          reqId: "REQ-01",
          title: "System Architecture Specification",
          status: "approved",
          phase: "requirements",
          priority: "high",
          estimatedHours: 8,
          businessValue: 9,
          urgency: 4,
          impact: 4,
          requiredSkills: ["architecture"],
        },
        {
          reqId: "REQ-02",
          title: "Database Schema & Migration",
          status: "approved",
          phase: "design",
          priority: "critical",
          estimatedHours: 12,
          businessValue: 8,
          urgency: 5,
          impact: 5,
          dependencies: ["REQ-01"],
          requiredSkills: ["postgresql"],
        },
        {
          reqId: "REQ-03",
          title: "Core Service Engine",
          status: "approved",
          phase: "implementation",
          priority: "medium",
          estimatedHours: 10,
          businessValue: 7,
          urgency: 3,
          impact: 3,
          dependencies: ["REQ-02"],
          requiredSkills: ["typescript"],
        },
      ],
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PART 3: BULK CONVERSION FUNCTIONALITY PRESERVED
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n--- PART 3: Authoritative Bulk Conversion Verification ---");

    const conversionResult = await bulkConvertApprovedRequirementsToTasks({
      project: testProject,
      teamId: testTeam._id,
      userId: testUser._id,
      io: null,
    });

    assert(conversionResult.success === true, "Bulk conversion executes successfully");
    assert(conversionResult.createdCount === 3, "Converted exactly 3 approved requirements to tasks");

    const createdTasks = await Task.find({ projectId: testProject._id }).sort({ phase: 1 }).lean();
    assert(createdTasks.length === 3, "Database contains exactly 3 active tasks");

    const tReq01 = createdTasks.find((t) => t.requirementId === "REQ-01");
    const tReq02 = createdTasks.find((t) => t.requirementId === "REQ-02");
    const tReq03 = createdTasks.find((t) => t.requirementId === "REQ-03");

    assert(Boolean(tReq01 && tReq02 && tReq03), "All 3 requirements mapped to individual task records");
    assert(tReq02.dependencies.some((d) => d.toString() === tReq01._id.toString()), "Dependency linkage REQ-02 -> REQ-01 preserved");

    // ═══════════════════════════════════════════════════════════════════════════
    // PART 4: FIX 2 — TASK COMPLETION & RISK RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("\n--- PART 4: Task Completion & Risk Reconciliation Suite ---");

    // Initial scan with 3 unassigned tasks
    console.log("\n[4.1 Initial Risk Scan with Unfinished Work]");
    let risks = await scanProjectRisks(testProject._id);
    let openRisks = risks.filter((r) => r.status === "open");

    const unassignedRisksInitial = openRisks.filter((r) => r.category === "unassigned_high_priority");
    assert(unassignedRisksInitial.length >= 1, "Unfinished high-priority tasks generate active unassigned risk");

    const blockedRisksInitial = openRisks.filter((r) => r.category === "blocked_tasks");
    assert(
      blockedRisksInitial.some((r) => r.affectedArea === tReq02.title || r.title.includes(tReq02.title)),
      "Task REQ-02 is flagged as blocked because REQ-01 is incomplete"
    );

    // 4.2 Prerequisite Completion clears Dependency Blocker Risk
    console.log("\n[4.2 Prerequisite Completion & Blocker Reconciliation]");
    await Task.findByIdAndUpdate(tReq01._id, {
      $set: { status: "done", completedAt: new Date() },
    });

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");

    const tReq02BlockedRisk = openRisks.find(
      (r) => r.category === "blocked_tasks" && (r.affectedArea === tReq02.title || r.title.includes(tReq02.title))
    );
    assert(
      !tReq02BlockedRisk,
      "Completing prerequisite REQ-01 automatically cleared blocked risk for REQ-02"
    );

    const resolvedReq01BlockedRisk = risks.find(
      (r) => r.status === "resolved" && r.category === "blocked_tasks" && (r.affectedArea === tReq02.title || r.title.includes(tReq02.title))
    );
    assert(
      Boolean(resolvedReq01BlockedRisk),
      "Previous blocked risk for REQ-02 is retained in database as 'resolved' with audit history"
    );
    assert(
      resolvedReq01BlockedRisk.resolvedAt !== null,
      "Resolved risk includes resolvedAt timestamp"
    );

    // 4.3 Task Completion Reconciles Task-Derived Unassigned Risk
    console.log("\n[4.3 Task Completion Reconciles Unassigned Risk]");
    const tReq01UnassignedRisk = openRisks.find(
      (r) => r.category === "unassigned_high_priority" && (r.affectedArea === tReq01.title || r.title.includes(tReq01.title))
    );
    assert(
      !tReq01UnassignedRisk,
      "Completed task REQ-01 no longer produces an active unassigned risk"
    );

    // 4.4 Unfinished unassigned task remains flagged after unrelated completion
    const tReq02UnassignedRisk = openRisks.find(
      (r) => r.category === "unassigned_high_priority" && (r.affectedArea === tReq02.title || r.title.includes(tReq02.title))
    );
    assert(
      Boolean(tReq02UnassignedRisk),
      "Unfinished high-priority task REQ-02 remains flagged as unassigned"
    );

    // 4.5 Task Assignment Reconciles Unassigned Risk Only After Persistence
    console.log("\n[4.5 Assignment Acceptance & Risk Invalidation]");
    await acceptAssignment(
      testProject._id,
      { taskId: tReq02._id.toString(), newAssigneeId: testUser._id.toString() },
      testUser
    );

    const updatedTReq02 = await Task.findById(tReq02._id).lean();
    assert(
      updatedTReq02.assignedTo?.toString() === testUser._id.toString(),
      "Task REQ-02 assignedTo successfully persisted in database"
    );

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");

    const tReq02UnassignedAfter = openRisks.find(
      (r) => r.category === "unassigned_high_priority" && (r.affectedArea === tReq02.title || r.title.includes(tReq02.title))
    );
    assert(
      !tReq02UnassignedAfter,
      "Assigning REQ-02 removed its unassigned risk from open findings"
    );

    // 4.6 Skill Gap Reconciliation Against Remaining Work
    console.log("\n[4.6 Skill Gap Reconciliation Against Remaining Work]");
    // REQ-01 required "architecture". But REQ-01 is complete!
    // REQ-02 required "postgresql". Neither Alice nor Bob has postgresql yet.
    const skillGapRisks = openRisks.filter((r) => r.category === "skill_gap");
    assert(
      skillGapRisks.length > 0 && skillGapRisks.some((r) => r.evidence.includes("postgresql")),
      "Skill gap for active unfinished task (postgresql) is properly detected"
    );
    assert(
      !skillGapRisks.some((r) => r.evidence.includes("architecture")),
      "Completed task's skill requirement (architecture) is NOT reported as an active skill gap"
    );

    // Now complete REQ-02 as well
    await Task.findByIdAndUpdate(tReq02._id, {
      $set: { status: "done", completedAt: new Date() },
    });

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");

    const skillGapAfterReq02Done = openRisks.filter(
      (r) => r.category === "skill_gap" && r.evidence.includes("postgresql")
    );
    assert(
      skillGapAfterReq02Done.length === 0,
      "Completing REQ-02 resolved the postgresql skill gap because no unfinished tasks require it"
    );

    // 4.7 Verified Skills Recognition
    console.log("\n[4.7 Verified Skills Verification]");
    // Add a new unfinished task requiring "devops"
    const tDevOps = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "CI/CD Pipeline Setup",
      status: "todo",
      priorityLabel: "high",
      priorityScore: 75,
      requiredSkills: ["devops"],
      estimatedHours: 6,
    });

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");
    assert(
      openRisks.some((r) => r.category === "skill_gap" && r.evidence.includes("devops")),
      "Unfinished task with unverified skill (devops) generates skill gap"
    );

    // Verify Bob with SkillVerification for devops
    await SkillVerification.create({
      userId: testMember2._id,
      skill: "devops",
      score: 10,
      totalQuestions: 10,
      percentage: 100,
      verified: true,
      verifiedAt: new Date(),
    });

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");
    assert(
      !openRisks.some((r) => r.category === "skill_gap" && r.evidence.includes("devops")),
      "Adding verified skill to team member reconciles the skill gap risk immediately"
    );

    // Clean up temporary task
    await Task.findByIdAndDelete(tDevOps._id);

    // 4.8 Workload Capacity & Exclusion of Completed Work
    console.log("\n[4.8 Workload Capacity & Completed Work Exclusion]");
    // Assign 40 hours of new work to Alice (capacity 30h)
    const tHeavy1 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Heavy Algorithm 1",
      status: "in_progress",
      assignedTo: testUser._id,
      estimatedHours: 25,
      priorityLabel: "medium",
      priorityScore: 50,
    });
    const tHeavy2 = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Heavy Algorithm 2",
      status: "in_progress",
      assignedTo: testUser._id,
      estimatedHours: 20,
      priorityLabel: "medium",
      priorityScore: 50,
    });

    // 25h + 20h = 45h > 30h * 1.2 = 36h -> Overload!
    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");
    assert(
      openRisks.some((r) => r.category === "member_overload" && (r.affectedArea === testUser.name || r.title.includes(testUser.name))),
      "Member overload correctly detected when active hours exceed capacity (45h vs 30h)"
    );

    // Complete Heavy Algorithm 1 (25h) -> Remaining active: 20h <= 30h -> No overload!
    await Task.findByIdAndUpdate(tHeavy1._id, {
      $set: { status: "done", completedAt: new Date() },
    });

    risks = await scanProjectRisks(testProject._id);
    openRisks = risks.filter((r) => r.status === "open");
    assert(
      !openRisks.some((r) => r.category === "member_overload" && (r.affectedArea === testUser.name || r.title.includes(testUser.name))),
      "Completing task drops active remaining hours below threshold and reconciles member overload"
    );

    // Clean up temporary heavy tasks
    await Task.findByIdAndDelete(tHeavy1._id);
    await Task.findByIdAndDelete(tHeavy2._id);

    // 4.9 Risk Lifecycle Preservation (Open, Acknowledged, Resolved, All)
    console.log("\n[4.9 Risk Lifecycle Preservation]");
    // Create an unassigned task to test lifecycle
    const tCycle = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Audit Review Task",
      status: "todo",
      priorityLabel: "critical",
      priorityScore: 90,
      estimatedHours: 5,
    });

    risks = await scanProjectRisks(testProject._id);
    let cycleRisk = risks.find((r) => r.category === "unassigned_high_priority" && r.status === "open");
    assert(Boolean(cycleRisk), "Found open risk for lifecycle test");

    // Acknowledge the risk
    await Risk.findByIdAndUpdate(cycleRisk._id, {
      $set: {
        status: "acknowledged",
        acknowledgedBy: testUser._id,
        acknowledgedAt: new Date(),
      },
    });

    // Rescan: the risk condition still persists (tCycle is still unassigned)
    risks = await scanProjectRisks(testProject._id);
    const ackedAfterRescan = risks.find((r) => r._id.toString() === cycleRisk._id.toString());
    assert(
      ackedAfterRescan.status === "acknowledged",
      "Acknowledged risk is NEVER reset to open during rescan while condition persists"
    );

    // Now resolve the underlying condition by assigning tCycle
    await Task.findByIdAndUpdate(tCycle._id, {
      $set: { assignedTo: testUser._id },
    });

    // Rescan: condition is gone -> should transition acknowledged risk to resolved
    risks = await scanProjectRisks(testProject._id);
    const ackedAfterResolved = risks.find((r) => r._id.toString() === cycleRisk._id.toString());
    assert(
      ackedAfterResolved.status === "resolved",
      "Acknowledged risk whose condition is demonstrably gone transitions to 'resolved'"
    );
    assert(
      ackedAfterResolved.acknowledgedAt !== null,
      "Historical acknowledgedAt timestamp is fully preserved"
    );
    assert(
      Boolean(ackedAfterResolved.resolutionReason),
      "Resolution metadata / reason is recorded on resolved risk"
    );

    // All view check
    const allRisksInDb = await Risk.find({ projectId: testProject._id }).lean();
    assert(
      allRisksInDb.length > 0 && allRisksInDb.some((r) => r.status === "resolved"),
      "Historical risks remain preserved in database and visible in 'All' tab"
    );

    await Task.findByIdAndDelete(tCycle._id);

    // 4.10 Unified Project Health Calculation Consistency
    console.log("\n[4.10 Unified Project Health Canonical Calculation]");
    const healthResult = await computeUnifiedProjectHealth(testProject._id);
    const scoreVal = healthResult.overallScore ?? healthResult.score;
    assert(
      typeof scoreVal === "number" && scoreVal >= 0 && scoreVal <= 100,
      `Unified health score is valid numeric bound: ${scoreVal}`
    );
    assert(
      ["HEALTHY", "NEEDS_ATTENTION", "CRITICAL"].includes(healthResult.status),
      `Unified health status is valid: ${healthResult.status}`
    );
    assert(
      Boolean(healthResult.dimensions),
      "Health dimensions are returned from canonical service"
    );

    // 4.11 Idempotency of repeated scans
    console.log("\n[4.11 Scan Idempotency Check]");
    const scan1 = await scanProjectRisks(testProject._id);
    const scan2 = await scanProjectRisks(testProject._id);
    const scan3 = await scanProjectRisks(testProject._id);
    assert(
      scan1.length === scan2.length && scan2.length === scan3.length,
      `Repeated scans are idempotent (retained exact same risk count: ${scan1.length})`
    );

    console.log("\n" + "=".repeat(80));
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (Total assertions: ${passed + failed})`);
    console.log("=".repeat(80) + "\n");
  } catch (err) {
    console.error("Test Suite Runtime Error:", err);
    failed++;
  } finally {
    // Clean up isolated test records
    console.log("Cleaning up isolated test fixtures...");
    if (testProject) {
      await Task.deleteMany({ projectId: testProject._id });
      await Risk.deleteMany({ projectId: testProject._id });
      await Project.deleteOne({ _id: testProject._id });
    }
    if (testTeam) {
      await Team.deleteOne({ _id: testTeam._id });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    if (testMember2) {
      await SkillVerification.deleteMany({ userId: testMember2._id });
      await User.deleteOne({ _id: testMember2._id });
    }

    await mongoose.disconnect();
    console.log("[DB] Disconnected from MongoDB cleanly.\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSuite();
