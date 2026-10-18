/**
 * server/scripts/testWaterfallThreeFixesSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — WATERFALL THREE FIXES AUTOMATED TEST SUITE (ESM)
 *
 * Covers:
 * FIX 1: Waterfall Task Sequencing, Phase-Gate Enforcement, Real Dependency Graph,
 *        Cycle Detection, and Rejection of Unauthorized Later-Phase Moves.
 * FIX 2: Removal of Retrospectives, Analytics, and Event History from Waterfall
 *        Navigation while Preserving Underlying Services & Audit Data.
 * FIX 3: Unified Project Health (Single Score, Deterministic Dimensions,
 *        Deduplicated Warnings, Team Execution Health, Methodology Terminology).
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import {
  assertWaterfallTaskExecutable,
  evaluateProjectPhaseGate,
  advanceProjectPhase,
  getWaterfallPhaseStates,
} from "../services/phaseGateService.js";
import {
  removeDependencyCycles,
  normalizeWaterfallPhase,
} from "../services/requirementService.js";
import unifiedProjectHealthService from "../services/unifiedProjectHealthService.js";

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    results.push({ status: "PASS", message });
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failed++;
    results.push({ status: "FAIL", message });
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

async function canExecute(task, status = "in_progress") {
  try {
    const res = await assertWaterfallTaskExecutable(task, status);
    return { allowed: res.executable === true, reason: "" };
  } catch (err) {
    return { allowed: false, reason: err.message, code: err.code };
  }
}

async function runSuite() {
  console.log("==================================================================");
  console.log(" NEXUSFLOW V4: THREE FIXES AUTOMATED TEST SUITE");
  console.log("==================================================================");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB successfully.\n");

  const testTeamId = new mongoose.Types.ObjectId();
  const testUserId = new mongoose.Types.ObjectId();
  const testProjectId = new mongoose.Types.ObjectId();

  try {
    // ------------------------------------------------------------------------
    // SETUP: Create isolated test project & team
    // ------------------------------------------------------------------------
    console.log("--- TEST FIX 1: TASK SEQUENCING & PHASE GATES ---");

    const testProject = await Project.create({
      _id: testProjectId,
      title: "Waterfall Automated Test Project",
      name: "Waterfall Automated Test Project",
      description: "Waterfall Automated Test Project problem statement and scope",
      teamId: testTeamId,
      createdBy: testUserId,
      methodology: "WATERFALL",
      waterfallPhase: "requirements",
      waterfallPlanLifecycle: {
        status: "TASKS_GENERATED",
        finalizedPlanRevision: 1,
      },
      phaseGateStatus: {
        currentPhase: "requirements",
      },
      requirements: [
        { reqId: "REQ-01", title: "User Auth", status: "approved", phase: "requirements" },
        { reqId: "REQ-02", title: "Profiles", status: "approved", phase: "requirements" },
      ],
      phases: [
        { phase: "requirements", status: "in_progress", order: 1 },
        { phase: "design", status: "locked", order: 2 },
        { phase: "implementation", status: "locked", order: 3 },
        { phase: "testing", status: "locked", order: 4 },
        { phase: "deployment", status: "locked", order: 5 },
        { phase: "maintenance", status: "locked", order: 6 },
      ],
    });

    const testTeam = await Team.create({
      _id: testTeamId,
      name: "Waterfall Test Team",
      methodology: "WATERFALL",
      activeProjectId: testProjectId,
      leaderId: testUserId,
      members: [
        { userId: testUserId, name: "Test Lead", role: "leader", capacity: 40 },
        { userId: new mongoose.Types.ObjectId(), name: "Test Member", role: "member", capacity: 40 },
      ],
      settings: { weeklyCapacityHours: 40 },
    });

    // Create tasks across phases
    // Requirements Phase tasks:
    // T1: FR-01 (no deps)
    // T2: FR-02 (depends on T1)
    // T3: FR-03 (depends on T2)
    const t1 = await Task.create({
      projectId: testProjectId,
      teamId: testTeamId,
      title: "FR-01: User Auth",
      phase: "requirements",
      waterfallPhase: "requirements",
      status: "todo",
      dependencies: [],
      executionOrder: 1,
    });

    const t2 = await Task.create({
      projectId: testProjectId,
      teamId: testTeamId,
      title: "FR-02: User Profiles",
      phase: "requirements",
      waterfallPhase: "requirements",
      status: "todo",
      dependencies: [t1._id],
      executionOrder: 2,
    });

    const t3 = await Task.create({
      projectId: testProjectId,
      teamId: testTeamId,
      title: "FR-03: Session Auditing",
      phase: "requirements",
      waterfallPhase: "requirements",
      status: "todo",
      dependencies: [t2._id],
      executionOrder: 3,
    });

    // System Design Phase task:
    const tDesign = await Task.create({
      projectId: testProjectId,
      teamId: testTeamId,
      title: "SYS-01: Architecture Schema",
      phase: "design",
      waterfallPhase: "design",
      status: "todo",
      dependencies: [t3._id],
      executionOrder: 4,
    });

    // Test 1.1: Initially, only eligible Requirements-phase tasks can start (T1 actionable, T2 blocked)
    const checkT1 = await canExecute(t1, "in_progress");
    assert(checkT1.allowed === true, "Initially, T1 (no deps, requirements phase) can start");

    const checkT2 = await canExecute(t2, "in_progress");
    assert(
      checkT2.allowed === false && checkT2.reason.includes("Prerequisite tasks must be completed"),
      "T2 is blocked because prerequisite T1 is not completed"
    );

    // Test 1.2: Moving arbitrary later-phase task (tDesign) is rejected because phase is locked
    const checkDesignBlocked = await canExecute(tDesign, "in_progress");
    assert(
      checkDesignBlocked.allowed === false && checkDesignBlocked.reason.includes("locked phase"),
      "Later phase task tDesign is rejected while Requirements phase is active"
    );

    // Test 1.3: Complete T1 -> T2 becomes actionable
    await Task.updateOne({ _id: t1._id }, { status: "done" });
    const freshT2 = await Task.findById(t2._id);
    const checkT2AfterT1 = await canExecute(freshT2, "in_progress");
    assert(checkT2AfterT1.allowed === true, "After T1 completes, T2 prerequisites are satisfied and it becomes actionable");

    // Test 1.4: T3 remains blocked until T2 completes
    const freshT3 = await Task.findById(t3._id);
    const checkT3BeforeT2 = await canExecute(freshT3, "in_progress");
    assert(
      checkT3BeforeT2.allowed === false && checkT3BeforeT2.reason.includes("Prerequisite tasks must be completed"),
      "T3 remains blocked because prerequisite T2 is still TODO"
    );

    // Test 1.5: Complete T2 -> T3 becomes actionable
    await Task.updateOne({ _id: t2._id }, { status: "done" });
    const freshT3AfterT2 = await Task.findById(t3._id);
    const checkT3AfterT2 = await canExecute(freshT3AfterT2, "in_progress");
    assert(checkT3AfterT2.allowed === true, "After T2 completes, T3 becomes actionable");

    // Test 1.6: Circular dependency detection
    const circularDeps = [
      { refId: "A", predecessorRefs: ["B"] },
      { refId: "B", predecessorRefs: ["C"] },
      { refId: "C", predecessorRefs: ["A"] },
    ];
    removeDependencyCycles(circularDeps);
    const cNode = circularDeps.find((d) => d.refId === "C");
    const hasBackEdge = cNode?.predecessorRefs?.includes("A");
    assert(!hasBackEdge, "removeDependencyCycles detects and breaks circular dependency A -> B -> C -> A");

    // Test 1.7: Canonical phase normalization
    assert(
      normalizeWaterfallPhase("testing") === "testing" &&
      normalizeWaterfallPhase("Verification") === "testing" &&
      normalizeWaterfallPhase("System Design") === "design",
      "normalizeWaterfallPhase correctly normalizes display labels and legacy keys to canonical phases"
    );

    // Test 1.8: Phase gate transition verification
    const gateCheckReqs = await evaluateProjectPhaseGate(testProjectId, "requirements");
    assert(
      gateCheckReqs.canAdvance === false || gateCheckReqs.status === "BLOCKED",
      "Requirements phase gate rejects advancement while T3 is still TODO"
    );

    await Task.updateOne({ _id: t3._id }, { status: "done" });
    const gateCheckReqsAllDone = await evaluateProjectPhaseGate(testProjectId, "requirements");
    assert(
      gateCheckReqsAllDone.canAdvance === true || gateCheckReqsAllDone.status === "PASSED" || gateCheckReqsAllDone.allRequiredPassed === true,
      "Requirements phase gate passes once all requirements tasks are DONE"
    );

    // Transition project to design phase
    await advanceProjectPhase({
      projectId: testProjectId,
      teamId: testTeamId,
      userId: testUserId,
      userName: "Test Lead",
    });
    const updatedProj = await Project.findById(testProjectId);
    assert(
      updatedProj.phaseGateStatus?.currentPhase === "design" || updatedProj.waterfallPhase === "design",
      "Phase transition moves current phase to 'design' after requirements gate passes"
    );

    // Now tDesign is executable!
    const freshDesign = await Task.findById(tDesign._id);
    const checkDesignNow = await canExecute(freshDesign, "in_progress");
    assert(checkDesignNow.allowed === true, "tDesign becomes executable after design phase is unlocked");

    // ------------------------------------------------------------------------
    // TEST FIX 2: NAVIGATION & SHARED DATA PRESERVATION
    // ------------------------------------------------------------------------
    console.log("\n--- TEST FIX 2: NAVIGATION & DATA PRESERVATION ---");

    const waterfallInsightsContent = fs.readFileSync(
      path.resolve(__dirname, "../../client/components/workspace/WaterfallInsightsPanel.tsx"),
      "utf8"
    );

    const hasRetroSubTab = waterfallInsightsContent.includes('{ key: "retro"');
    const hasAnalyticsSubTab = waterfallInsightsContent.includes('{ key: "analytics"');
    const hasHistorySubTab = waterfallInsightsContent.includes('{ key: "history"');
    const hasHealth2SubTab = waterfallInsightsContent.includes('{ key: "health2"');

    assert(!hasRetroSubTab, "WaterfallInsightsPanel has removed Retrospectives sub-tab");
    assert(!hasAnalyticsSubTab, "WaterfallInsightsPanel has removed Analytics sub-tab");
    assert(!hasHistorySubTab, "WaterfallInsightsPanel has removed Event History sub-tab");
    assert(!hasHealth2SubTab, "WaterfallInsightsPanel has removed competing Health 2.0 sub-tab");

    assert(
      waterfallInsightsContent.includes('{ key: "health",    label: "Project Health"') &&
      waterfallInsightsContent.includes('{ key: "learning",  label: "Learning Loop"') &&
      waterfallInsightsContent.includes('{ key: "capability",label: "Capability"') &&
      waterfallInsightsContent.includes('{ key: "risks",     label: "Risk Radar"') &&
      waterfallInsightsContent.includes('{ key: "dag",       label: "Dependency DAG"'),
      "Waterfall retains clean 5-item sub-navigation (Project Health, Learning, Capability, Risks, DAG)"
    );

    const docsContent = fs.readFileSync(path.resolve(__dirname, "../../client/app/docs.tsx"), "utf8");
    assert(
      docsContent.includes("analytics-audit") && docsContent.includes("AnalyticsAuditSection"),
      "Documentation page documents analytics, retrospectives, and historical audit ledger separately"
    );

    const scrumInsightsExists = fs.existsSync(
      path.resolve(__dirname, "../../client/components/workspace/ScrumInsightsPanel.tsx")
    );
    const kanbanInsightsExists = fs.existsSync(
      path.resolve(__dirname, "../../client/components/workspace/KanbanInsightsPanel.tsx")
    );
    const retroPanelExists = fs.existsSync(
      path.resolve(__dirname, "../../client/components/workspace/RetroPanel.tsx")
    );
    const analyticsPanelExists = fs.existsSync(
      path.resolve(__dirname, "../../client/components/workspace/AnalyticsPanel.tsx")
    );

    assert(
      scrumInsightsExists && kanbanInsightsExists && retroPanelExists && analyticsPanelExists,
      "Shared Scrum/Kanban insights, RetroPanel, and AnalyticsPanel remain fully preserved in codebase"
    );

    // ------------------------------------------------------------------------
    // TEST FIX 3: UNIFIED PROJECT HEALTH INTELLIGENCE
    // ------------------------------------------------------------------------
    console.log("\n--- TEST FIX 3: UNIFIED PROJECT HEALTH ---");

    const healthResult = await unifiedProjectHealthService.calculateProjectHealth(testProjectId);

    assert(typeof healthResult.overallScore === "number", "Unified health returns single overall score (0-100)");
    assert(typeof healthResult.overallGrade === "string", "Unified health returns canonical grade (A-F)");
    assert(healthResult.methodology === "WATERFALL", "Unified health recognizes waterfall methodology");
    assert(healthResult.terms.phaseLabel === "Phase", "Waterfall uses Phase terminology instead of Sprint");
    assert(healthResult.terms.paceLabel === "Phase Delivery Pace", "Waterfall uses 'Phase Delivery Pace'");

    const dimensionKeys = (healthResult.dimensions || []).map((d) => d.key);
    assert(
      dimensionKeys.includes("schedule") &&
      dimensionKeys.includes("risk") &&
      dimensionKeys.includes("capacity") &&
      dimensionKeys.includes("delivery") &&
      dimensionKeys.includes("quality") &&
      dimensionKeys.includes("process") &&
      dimensionKeys.includes("skill") &&
      dimensionKeys.includes("dependencies"),
      "Unified health includes all core deterministic dimensions without gaps"
    );

    assert(healthResult.teamExecution != null, "Unified health contains absorbed Team Execution section");
    assert(typeof healthResult.teamExecution.taskCompletion?.total === "number", "Team execution reports total tasks");
    assert(typeof healthResult.teamExecution.taskCompletion?.done === "number", "Team execution reports done tasks");
    assert(Array.isArray(healthResult.teamExecution.memberLoad), "Team execution reports memberLoad array");

    const scrumTerms = unifiedProjectHealthService.getMethodologyTerms("SCRUM");
    assert(
      scrumTerms.phaseLabel === "Sprint" && scrumTerms.paceLabel === "Sprint Velocity Pace",
      "Scrum retains Sprint-based terminology in unified health service"
    );

    const kanbanTerms = unifiedProjectHealthService.getMethodologyTerms("KANBAN");
    assert(
      kanbanTerms.phaseLabel === "Flow Stage" && kanbanTerms.paceLabel === "Throughput Flow Pace",
      "Kanban retains Flow-based terminology in unified health service"
    );

    // Verify severity safeguard on distressed project
    const distressedProjectId = new mongoose.Types.ObjectId();
    await Project.create({
      _id: distressedProjectId,
      title: "Distressed Project",
      name: "Distressed Project",
      teamId: testTeamId,
      createdBy: testUserId,
      methodology: "WATERFALL",
      waterfallPhase: "requirements",
    });

    for (let i = 0; i < 10; i++) {
      await Task.create({
        projectId: distressedProjectId,
        teamId: testTeamId,
        title: `Task ${i}`,
        phase: "requirements",
        waterfallPhase: "requirements",
        status: "todo",
        estimatedHours: 25,
      });
    }

    const distressedHealth = await unifiedProjectHealthService.calculateProjectHealth(distressedProjectId);
    assert(
      distressedHealth.overallScore <= 55,
      `Severity safeguard caps distressed project score (actual: ${distressedHealth.overallScore}/100, grade: ${distressedHealth.overallGrade})`
    );

    await Task.deleteMany({ projectId: distressedProjectId });
    await Project.deleteOne({ _id: distressedProjectId });

  } finally {
    await Task.deleteMany({ projectId: testProjectId });
    await Project.deleteOne({ _id: testProjectId });
    await Team.deleteOne({ _id: testTeamId });
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
  }

  console.log("\n==================================================================");
  console.log(` SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test Suite Unhandled Exception:", err);
  process.exit(1);
});
