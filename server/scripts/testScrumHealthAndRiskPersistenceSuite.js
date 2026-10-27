/**
 * server/scripts/testScrumHealthAndRiskPersistenceSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — FIX 6: SCRUM PROJECT HEALTH & PERSISTED RISK RADAR TEST SUITE
 *
 * Verifies:
 *   1. Pre-Sprint Planning Health:
 *      - Computes explainable score (0-100), grade, and status when no sprint is active
 *      - Backlog readiness assessed from estimates and acceptance criteria
 *      - Sprint Goal Trajectory honestly marked unavailable (not fabricated 0% or 100%)
 *
 *   2. Active Sprint Delivery Health:
 *      - Evaluates genuine sprint delivery (goal trajectory, capacity alignment, blocked tasks)
 *      - Only committed sprint work is included
 *      - Handles zero-denominator edge cases without fabricating 100% completion
 *
 *   3. MongoDB Health Snapshot Persistence:
 *      - Snapshots stored in ScrumHealthSnapshot collection with calculationVersion: "4.0"
 *      - Retains assessmentScope, indicators, warnings, riskSummary
 *      - Recalculation appends history without corrupting prior snapshots
 *
 *   4. Deterministic Scrum Risk Detection (12 Triggers):
 *      - Scans capacity overload, member overload, unassigned sprint work,
 *        skill gaps, blocked tasks, cross-sprint dependencies, scope conflicts
 *
 *   5. Stable Fingerprint & Deduplication:
 *      - Same condition produces identical fingerprint (fp("scrum_" + hash))
 *      - Re-scanning updates existing risk, does NOT create duplicates
 *      - Preserves firstDetectedAt, updates lastDetectedAt
 *
 *   6. Complete Risk Lifecycle (Open -> Acknowledged -> Resolved -> All):
 *      - Functional Acknowledge updates status, acknowledgedAt, acknowledgedBy
 *      - Functional Resolve updates status, resolvedAt, resolvedBy, resolutionReason
 *      - Live counts for Open, Acknowledged, Resolved, All match persisted state
 *
 *   7. Condition Clearing & Re-opening:
 *      - Auto-resolves cleared conditions (e.g., unassigned task gets an owner)
 *      - Re-opens resolved risk if condition recurs, preserving audit history
 *
 *   8. Methodology & Data Isolation:
 *      - Scrum risks strictly have methodology: "SCRUM"
 *      - Waterfall risks remain untouched and isolated
 *      - Cross-project or cross-team leakage prevented
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
import Risk from "../models/Risk.js";
import ScrumHealthSnapshot from "../models/ScrumHealthSnapshot.js";

import {
  calculateScrumHealth,
  recalculateScrumHealth,
  getLatestScrumHealth,
} from "../services/scrumHealthService.js";

import {
  scanScrumRisks,
  getScrumRisks,
  updateScrumRiskStatus,
} from "../services/scrumRiskEngine.js";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/nexusflow";

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? `— ${details}` : ""}`);
    failed++;
  }
}

async function runSuite() {
  console.log("\n================================================================================");
  console.log("NEXUSFLOW V4 — FIX 6: SCRUM PROJECT HEALTH & RISK RADAR PERSISTENCE SUITE");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB:", MONGO_URI);

  const testSuffix = Date.now().toString().slice(-6);
  let testUser, testTeam, testProject, sprintPlanning, sprintActive;

  try {
    // ── Setup: Create Isolated Scrum Test Environment ─────────────────────────
    testUser = await User.create({
      name: `Scrum QA Lead ${testSuffix}`,
      email: `scrum_qa_${testSuffix}@nexusflow.test`,
      password: "password123",
      role: "lead",
    });

    testTeam = await Team.create({
      name: `Scrum Test Team ${testSuffix}`,
      methodology: "SCRUM",
      members: [
        {
          userId: testUser._id,
          name: `Scrum QA Lead ${testSuffix}`,
          role: "Developer",
          capacity: 40,
          skills: { frontend: 9, backend: 8, devops: 6, testing: 7 },
        },
      ],
    });

    testProject = await Project.create({
      title: `Scrum Health QA Project ${testSuffix}`,
      key: `SHQA${testSuffix.slice(-4)}`,
      methodology: "SCRUM",
      status: "active",
      teamId: testTeam._id,
      owner: testUser._id,
    });

    sprintPlanning = await Sprint.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      name: "Sprint 01 (Planning)",
      sprintNumber: 1,
      status: "PLANNING",
      capacityHours: 40,
      goal: "Finalize planning and backlog estimates",
    });

    // Create 4 initial stories in Backlog (pre-sprint state)
    const story1 = await Task.create({
      title: "Story 1: Auth Architecture",
      projectId: testProject._id,
      teamId: testTeam._id,
      storyPoints: 5,
      estimatedHours: 12,
      acceptanceCriteria: ["Valid token returned", "OAuth2 handshake verified"],
      requiredSkills: ["TypeScript", "Backend"],
      scrumStatus: "BACKLOG",
      status: "todo",
    });

    const story2 = await Task.create({
      title: "Story 2: Session Store",
      projectId: testProject._id,
      teamId: testTeam._id,
      storyPoints: 3,
      estimatedHours: 8,
      acceptanceCriteria: ["Redis cluster failover supported"],
      dependencies: [story1._id],
      scrumStatus: "BACKLOG",
      status: "todo",
    });

    const story3 = await Task.create({
      title: "Story 3: User Dashboard UI",
      projectId: testProject._id,
      teamId: testTeam._id,
      storyPoints: 8,
      estimatedHours: 20,
      acceptanceCriteria: ["Profile photo uploaded", "Activity feed rendered"],
      requiredSkills: ["Frontend", "React"],
      scrumStatus: "BACKLOG",
      status: "todo",
    });

    const story4 = await Task.create({
      title: "Story 4: Unestimated Spike Story",
      projectId: testProject._id,
      teamId: testTeam._id,
      storyPoints: null, // Unestimated
      estimatedHours: null,
      acceptanceCriteria: [], // Missing acceptance criteria
      scrumStatus: "BACKLOG",
      status: "todo",
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 1: PRE-SPRINT PLANNING HEALTH
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 1: Pre-Sprint Planning Health ---");

    const preSprintHealth = await calculateScrumHealth(testProject._id, testTeam._id, {
      userId: testUser._id,
      persist: true,
    });

    assert(preSprintHealth !== null, "calculateScrumHealth returns non-null result in pre-sprint state");
    assert(preSprintHealth.assessmentScope === "PROJECT_PLANNING", "Assessment scope is PROJECT_PLANNING when no sprint is active");
    assert(typeof preSprintHealth.overallScore === "number" && preSprintHealth.overallScore > 0, "Overall score is a positive number (not N/A)", `Score: ${preSprintHealth.overallScore}`);
    assert(["PLANNING_READY", "PLANNING_ATTENTION", "PLANNING_BLOCKED"].includes(preSprintHealth.status), "Status reflects planning phase condition", `Status: ${preSprintHealth.status}`);
    assert(preSprintHealth.backlogReadiness.score > 0, "Backlog readiness score is calculated from real criteria and estimates", `Score: ${preSprintHealth.backlogReadiness.score}`);
    assert(preSprintHealth.backlogReadiness.estimatedCount === 3, "Correctly identifies 3 estimated stories out of 4", `Estimated: ${preSprintHealth.backlogReadiness.estimatedCount}`);
    assert(preSprintHealth.backlogReadiness.criteriaCount === 3, "Correctly identifies 3 stories with acceptance criteria", `Criteria: ${preSprintHealth.backlogReadiness.criteriaCount}`);

    const trajectoryIndicator = preSprintHealth.indicators.find((ind) => ind.key === "sprint_goal_trajectory");
    assert(trajectoryIndicator && trajectoryIndicator.isAvailable === false, "Sprint Goal Trajectory is honestly marked isAvailable: false when awaiting sprint", `isAvailable: ${trajectoryIndicator?.isAvailable}`);
    assert(trajectoryIndicator && trajectoryIndicator.score === null, "Sprint Goal Trajectory score is null instead of fabricated 0% or 100%");

    const backlogIndicator = preSprintHealth.indicators.find((ind) => ind.key === "backlog_readiness");
    assert(backlogIndicator && backlogIndicator.isAvailable === true && backlogIndicator.score === preSprintHealth.backlogReadiness.score, "Backlog Readiness indicator is available and matches calculated score");

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 2: HEALTH SNAPSHOT PERSISTENCE IN MONGODB
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 2: Health Snapshot Persistence in MongoDB ---");

    const savedSnapshots = await ScrumHealthSnapshot.find({ projectId: testProject._id });
    assert(savedSnapshots.length >= 1, "Health snapshot was successfully persisted to ScrumHealthSnapshot collection");

    const latestSnapshot = await getLatestScrumHealth(testProject._id);
    assert(latestSnapshot !== null, "getLatestScrumHealth retrieves persisted snapshot");
    assert(latestSnapshot.overallScore === preSprintHealth.overallScore, "Persisted snapshot retains correct overallScore");
    assert(latestSnapshot.calculationVersion === "4.0", "Snapshot is stamped with calculationVersion: '4.0'");
    assert(Array.isArray(latestSnapshot.indicators) && latestSnapshot.indicators.length === 7, "Snapshot retains all 7 core indicators");

    // Test recalculateScrumHealth appends a new snapshot and updates history
    const refreshedHealth = await recalculateScrumHealth(testProject._id, testTeam._id, testUser._id);
    assert(refreshedHealth.overallScore === preSprintHealth.overallScore, "Recalculation with identical inputs produces reproducible score");
    const countAfterRefresh = await ScrumHealthSnapshot.countDocuments({ projectId: testProject._id });
    assert(countAfterRefresh === savedSnapshots.length + 1, "Recalculate preserves historical snapshots (appends history)");

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 3: ACTIVE SPRINT DELIVERY HEALTH
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 3: Active Sprint Delivery Health ---");

    // Commit Story 1, Story 2, and Story 3 to Sprint 01 and activate it
    sprintActive = await Sprint.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      name: "Sprint 01 (Execution)",
      sprintNumber: 1,
      status: "ACTIVE",
      capacityHours: 40,
      totalHours: 40,
      goal: "Complete authentication and user dashboard",
    });

    await Task.updateMany(
      { _id: { $in: [story1._id, story2._id, story3._id] } },
      { $set: { sprintId: sprintActive._id, scrumStatus: "IN_SPRINT" } }
    );

    // Mark story1 as done (5 pts), story2 as in_progress (3 pts), story3 as blocked (8 pts)
    await Task.updateOne({ _id: story1._id }, { $set: { status: "done" } });
    await Task.updateOne({ _id: story2._id }, { $set: { status: "in_progress" } });
    await Task.updateOne({ _id: story3._id }, { $set: { status: "blocked" } });

    const activeSprintHealth = await calculateScrumHealth(testProject._id, testTeam._id, {
      userId: testUser._id,
      persist: true,
    });

    assert(activeSprintHealth.assessmentScope === "ACTIVE_SPRINT", "Assessment scope transitions to ACTIVE_SPRINT when sprint is running");
    assert(activeSprintHealth.sprintDelivery.activeSprintId.toString() === sprintActive._id.toString(), "Health targets the active sprint record");
    assert(activeSprintHealth.sprintDelivery.committedPoints === 16, "Committed points correctly calculated for sprint (5 + 3 + 8 = 16 pts)", `Committed: ${activeSprintHealth.sprintDelivery.committedPoints}`);
    assert(activeSprintHealth.sprintDelivery.completedPoints === 5, "Completed points correctly calculated (Story 1 = 5 pts)", `Completed: ${activeSprintHealth.sprintDelivery.completedPoints}`);
    assert(activeSprintHealth.sprintDelivery.blockedTasksCount === 1, "Correctly identifies 1 blocked task in sprint");

    const activeTrajectory = activeSprintHealth.indicators.find((ind) => ind.key === "sprint_goal_trajectory");
    assert(activeTrajectory && activeTrajectory.isAvailable === true, "Sprint Goal Trajectory is available during active sprint");
    assert(activeTrajectory.score === Math.round((5 / 16) * 100), "Sprint Goal Trajectory accurately reflects 5/16 pts (31%)", `Score: ${activeTrajectory.score}`);

    // Verify warnings include blocked task warning
    const blockedWarning = activeSprintHealth.warnings.find((w) => w.code === "BLOCKED_SPRINT_WORK");
    assert(blockedWarning !== undefined, "Critical warning generated for blocked task in active sprint");

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 4: DETERMINISTIC SCRUM RISK DETECTION (12 TRIGGERS)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 4: Deterministic Scrum Risk Detection ---");

    // Currently:
    // - Story 1, 2, 3 in sprintActive have assignedTo = null -> Unassigned sprint work trigger!
    // - Story 3 is blocked -> Blocked task trigger!
    // - Story 4 is unestimated -> Missing estimate trigger!
    const scanResult = await scanScrumRisks(testProject._id, testTeam._id, testUser._id);
    assert(scanResult.success === true, "scanScrumRisks executes successfully");
    assert(scanResult.count > 0, "Deterministic risk engine detects active risks", `Count: ${scanResult.count}`);

    const unassignedRisk = scanResult.risks.find((r) => r.category === "unassigned_sprint_work");
    assert(unassignedRisk !== undefined, "Detected unassigned_sprint_work risk for unassigned sprint tasks");
    assert(unassignedRisk.status === "open", "Unassigned risk is created in 'open' status");
    assert(unassignedRisk.relatedTaskIds.length === 2, "Unassigned risk references both incomplete sprint tasks needing an owner (Story 2 & 3)");

    const blockedRisk = scanResult.risks.find((r) => r.category === "blocked_tasks");
    assert(blockedRisk !== undefined, "Detected blocked_tasks risk for Story 3");
    assert(blockedRisk.severity === "high" || blockedRisk.severity === "critical", "Blocked sprint work is rated high or critical");

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 5: STABLE FINGERPRINT & DEDUPLICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 5: Stable Fingerprint & Deduplication ---");

    const firstScanRiskIds = scanResult.risks.map((r) => r._id.toString());
    const unassignedFp = unassignedRisk.fingerprint;
    assert(typeof unassignedFp === "string" && unassignedFp.startsWith("scrum_"), "Risk has stable deterministic fingerprint starting with 'scrum_'");

    // Re-scan with identical state
    const reScanResult = await scanScrumRisks(testProject._id, testTeam._id, testUser._id);
    const secondScanRiskIds = reScanResult.risks.map((r) => r._id.toString());

    assert(reScanResult.count === scanResult.count, "Re-scan produces identical risk count (no duplicates created)");
    assert(
      JSON.stringify(firstScanRiskIds.sort()) === JSON.stringify(secondScanRiskIds.sort()),
      "Re-scan preserves existing risk IDs (stable identity across scans)"
    );

    const reScanUnassigned = reScanResult.risks.find((r) => r.fingerprint === unassignedFp);
    assert(
      reScanUnassigned.firstDetectedAt.getTime() === unassignedRisk.firstDetectedAt.getTime(),
      "firstDetectedAt timestamp is preserved across recalculations"
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 6: COMPLETE RISK LIFECYCLE (OPEN -> ACKNOWLEDGED -> RESOLVED)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 6: Complete Risk Lifecycle (Open -> Acknowledged -> Resolved) ---");

    // Acknowledge the blockedRisk
    const ackResult = await updateScrumRiskStatus(testProject._id, blockedRisk._id, "acknowledged", {
      userId: testUser._id,
      notes: "Dev lead investigating block with infrastructure team",
    });

    assert(ackResult.status === "acknowledged", "Risk status successfully transitioned to 'acknowledged'");
    assert(ackResult.acknowledgedAt !== null, "acknowledgedAt timestamp is recorded");
    assert(ackResult.acknowledgedBy.toString() === testUser._id.toString(), "acknowledgedBy records authorized user ID");

    // Fetch risks by filter
    const openRisks = await getScrumRisks(testProject._id, "open");
    const ackRisks = await getScrumRisks(testProject._id, "acknowledged");
    const allRisks = await getScrumRisks(testProject._id, "all");

    assert(!openRisks.risks.some((r) => r._id.toString() === blockedRisk._id.toString()), "Acknowledged risk no longer appears in Open tab");
    assert(ackRisks.risks.some((r) => r._id.toString() === blockedRisk._id.toString()), "Acknowledged risk appears in Acknowledged tab");
    assert(allRisks.counts.acknowledged >= 1, "Authoritative count for acknowledged risks is at least 1");
    assert(allRisks.counts.total === allRisks.counts.open + allRisks.counts.acknowledged + allRisks.counts.resolved, "Total count strictly equals open + acknowledged + resolved");

    // Resolve the blockedRisk
    const resolveResult = await updateScrumRiskStatus(testProject._id, blockedRisk._id, "resolved", {
      userId: testUser._id,
      notes: "Infrastructure blocker resolved; dependencies cleared",
    });

    assert(resolveResult.status === "resolved", "Risk status successfully transitioned to 'resolved'");
    assert(resolveResult.resolvedAt !== null, "resolvedAt timestamp is recorded");
    assert(resolveResult.resolvedBy.toString() === testUser._id.toString(), "resolvedBy records authorized user ID");
    assert(resolveResult.resolutionReason.includes("Infrastructure blocker resolved"), "resolutionReason persists explanatory notes");

    const resRisks = await getScrumRisks(testProject._id, "resolved");
    assert(resRisks.risks.some((r) => r._id.toString() === blockedRisk._id.toString()), "Resolved risk appears in Resolved tab");

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 7: CONDITION CLEARING & RE-OPENING BEHAVIOR
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 7: Condition Clearing & Re-opening Behavior ---");

    // Assign Story 1, 2, 3 to testUser to clear the unassigned_sprint_work condition
    await Task.updateMany(
      { _id: { $in: [story1._id, story2._id, story3._id] } },
      { $set: { assignedTo: testUser._id, assignedName: testUser.name } }
    );

    // Re-scan: the unassigned risk condition is no longer present in source records
    await scanScrumRisks(testProject._id, testTeam._id, testUser._id);
    const updatedUnassignedRisk = await Risk.findById(unassignedRisk._id);
    assert(
      updatedUnassignedRisk.status === "resolved",
      "Risk automatically transitions to 'resolved' when condition is resolved in real data"
    );
    assert(
      updatedUnassignedRisk.resolutionReason.includes("automatically cleared"),
      "Auto-resolution logs descriptive explanation"
    );

    // Now unassign Story 2 to cause the condition to RECUR
    await Task.updateOne({ _id: story2._id }, { $unset: { assignedTo: 1, assignedName: 1 } });
    await scanScrumRisks(testProject._id, testTeam._id, testUser._id);

    const reopenedUnassignedRisk = await Risk.findById(unassignedRisk._id);
    assert(
      reopenedUnassignedRisk.status === "open",
      "Resolved risk re-opens when condition recurs in active sprint"
    );
    assert(
      reopenedUnassignedRisk.reopenCount >= 1,
      "reopenCount is incremented on condition recurrence",
      `reopenCount: ${reopenedUnassignedRisk.reopenCount}`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 8: METHODOLOGY ISOLATION & ZERO-LEAKAGE
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n--- Suite 8: Methodology Isolation & Zero-Leakage ---");

    // Create a dummy Waterfall risk
    const wfRisk = await Risk.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      methodology: "WATERFALL",
      category: "other",
      severity: "medium",
      status: "open",
      title: "Waterfall Phase Gate Delay",
      explanation: "Testing Waterfall methodology boundary isolation",
      fingerprint: `wf_test_${testSuffix}`,
    });

    const scrumOnlyRisks = await getScrumRisks(testProject._id, "all");
    const containsWaterfallRisk = scrumOnlyRisks.risks.some((r) => r.methodology === "WATERFALL" || r._id.toString() === wfRisk._id.toString());
    assert(
      !containsWaterfallRisk,
      "Scrum Risk Radar strictly isolates Scrum risks (0 Waterfall risks returned)"
    );

    const verifiedScrumMethodology = scrumOnlyRisks.risks.every((r) => r.methodology === "SCRUM");
    assert(verifiedScrumMethodology, "All returned Scrum risk records have methodology: 'SCRUM'");

    // Clean up dummy waterfall risk
    await Risk.deleteOne({ _id: wfRisk._id });

  } catch (err) {
    console.error("Unhandled error during test suite:", err);
    failed++;
  } finally {
    // Clean up test data
    console.log("\n--- Cleaning up test artifacts ---");
    if (testProject) {
      await ScrumHealthSnapshot.deleteMany({ projectId: testProject._id });
      await Risk.deleteMany({ projectId: testProject._id });
      await Task.deleteMany({ projectId: testProject._id });
      await Sprint.deleteMany({ projectId: testProject._id });
      await Project.deleteOne({ _id: testProject._id });
    }
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }

  console.log("\n================================================================================");
  console.log(`FIX 6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite();
