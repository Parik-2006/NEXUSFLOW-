/**
 * server/scripts/testWorkstreams21to25Suite.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAMS 21–25 COMPREHENSIVE AUTOMATED TEST SUITE
 *
 * Covers:
 * WS 21: Project Learning Loop (evidence, patterns, lifecycle, no-auto-mutation)
 * WS 22: Capability Intelligence (canonical skills, verified weights, B&B assignment, human acceptance)
 * WS 23: Explainable Decision Intelligence (factors, evidence, counterfactuals, reproducibility)
 * WS 24: Project Health 2.0 & Early Warnings (9 dimensions, deduplicated fingerprints, lifecycle)
 * WS 25: Unified Integration, Security, and Cross-Project Isolation
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import Retrospective from "../models/Retrospective.js";
import Risk from "../models/Risk.js";
import ProjectEvent from "../models/ProjectEvent.js";
import SkillVerification from "../models/SkillVerification.js";
import ProjectLesson from "../models/ProjectLesson.js";
import CapabilityProfile from "../models/CapabilityProfile.js";
import DecisionRecord from "../models/DecisionRecord.js";
import EarlyWarning from "../models/EarlyWarning.js";

// Services
import {
  collectLearningEvidence,
  generateLessonCandidates,
  validateLesson,
  applyLesson,
  archiveLesson,
  getProjectLessons,
  getReusableLessons,
} from "../services/projectLearningService.js";

import {
  buildCapabilityProfile,
  analyzeCapabilityGaps,
  previewDynamicAssignment,
  acceptAssignment,
} from "../services/capabilityIntelligenceService.js";

import {
  explainTaskPriority,
  recomputeCounterfactual,
  getDecisionExplanation,
} from "../services/decisionIntelligenceService.js";

import {
  evaluateProjectHealth2,
  acknowledgeWarning,
  resolveWarning,
  dismissWarning,
  getProjectWarnings,
} from "../services/projectHealth2Service.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

async function runSuite() {
  console.log("\n" + "=".repeat(70));
  console.log("   NEXUSFLOW V4: WORKSTREAMS 21–25 COMPREHENSIVE TEST SUITE");
  console.log("=".repeat(70) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("[DB] Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let userLeader, userDevA, userDevB, userOther;
  let team, projectA, projectB;

  try {
    // ── Setup Test Entities ──────────────────────────────────────────────────
    console.log("[SETUP] Provisioning test users, teams, and isolated projects...");
    userLeader = await User.create({
      name: `Leader ${ts}`,
      email: `leader_${ts}@test.com`,
      password: "Password123!",
      skills: ["Backend", "PostgreSQL", "DevOps"],
    });

    userDevA = await User.create({
      name: `Developer A ${ts}`,
      email: `deva_${ts}@test.com`,
      password: "Password123!",
      skills: ["Frontend", "React"],
    });

    userDevB = await User.create({
      name: `Developer B ${ts}`,
      email: `devb_${ts}@test.com`,
      password: "Password123!",
      skills: ["Python", "Testing"],
    });

    userOther = await User.create({
      name: `Unrelated User ${ts}`,
      email: `other_${ts}@test.com`,
      password: "Password123!",
      skills: ["Design"],
    });

    team = await Team.create({
      name: `V4 Team ${ts}`,
      ownerId: userLeader._id,
      members: [
        { userId: userLeader._id, name: userLeader.name, role: "leader", capacity: 40 },
        { userId: userDevA._id, name: userDevA.name, role: "member", capacity: 35 },
        { userId: userDevB._id, name: userDevB.name, role: "member", capacity: 20 },
      ],
    });

    projectA = await Project.create({
      teamId: team._id,
      title: "FinTech Transaction Engine",
      domain: "Financial Technology",
      methodology: "SCRUM",
      status: "active",
    });

    projectB = await Project.create({
      teamId: team._id,
      title: "Isolated Health App",
      domain: "Healthcare",
      methodology: "WATERFALL",
      status: "active",
    });

    // Seed canonical quiz verification for userDevA in Frontend
    await SkillVerification.create({
      userId: userDevA._id,
      skill: "frontend",
      skillId: "frontend",
      skillName: "Frontend",
      category: "Software Development",
      score: 4,
      totalQuestions: 5,
      percentage: 80,
      verified: true,
      verifiedAt: new Date(),
    });

    // =========================================================================
    // WORKSTREAM 21: PROJECT LEARNING LOOP
    // =========================================================================
    console.log("\n[WS 21] Testing Project Learning Loop...");

    // Seed historical tasks with significant estimation variance (late backend tasks)
    const task1 = await Task.create({
      projectId: projectA._id,
      teamId: team._id,
      title: "Payment Gateway Integration",
      status: "done",
      category: "Backend",
      estimatedHours: 8,
      actualHours: 24, // 3x planned
      assignedTo: userLeader._id,
    });

    const task2 = await Task.create({
      projectId: projectA._id,
      teamId: team._id,
      title: "Ledger Reconciliation API",
      status: "done",
      category: "Backend",
      estimatedHours: 10,
      actualHours: 25, // 2.5x planned
      assignedTo: userLeader._id,
    });

    // Seed sprint with poor completion rate (< 70%)
    await Retrospective.create({
      projectId: projectA._id,
      teamId: team._id,
      sprintName: "Sprint 1",
      taskStats: { total: 10, completed: 4, completionRate: 40 },
      analysis: { wentWell: [], wentPoorly: [], recommendations: [] },
      generatedBy: "deterministic",
    });

    // 1. Evidence Collection
    const evidence = await collectLearningEvidence(projectA._id);
    assert(evidence.doneCount >= 2, "Evidence accurately counts completed tasks");
    assert(evidence.estimationByCat["Backend"]?.count >= 2, "Evidence groups tasks by category");
    assert(evidence.estimationByCat["Backend"]?.totalActual > evidence.estimationByCat["Backend"]?.totalEstimated, "Evidence computes actual vs estimated variance");

    // 2. Candidate Generation
    const candidates = await generateLessonCandidates(projectA._id, userLeader);
    assert(candidates.length >= 2, `Generated ${candidates.length} lesson candidates from real evidence`);
    const estimationCandidate = candidates.find((c) => c.category === "estimation");
    assert(estimationCandidate != null, "Extracted estimation underestimation candidate");
    assert(estimationCandidate.confidence >= 0.7, "Candidate contains deterministic confidence >= 0.7");
    assert(estimationCandidate.status === "CANDIDATE", "Candidate status initialized to CANDIDATE");

    // 3. Deduplication Check
    const reCandidates = await generateLessonCandidates(projectA._id, userLeader);
    assert(reCandidates.length === candidates.length, "Deduplication: recurring candidate generation does not create duplicate records");

    // 4. Lifecycle: CANDIDATE -> VALIDATED
    const validated = await validateLesson(estimationCandidate._id, userLeader, {
      approved: true,
      notes: "Confirmed that banking API sandbox integration caused the delay.",
    });
    assert(validated.status === "VALIDATED", "Leader can validate candidate with empirical evidence");
    assert(validated.validatorId.toString() === userLeader._id.toString(), "Validator ID recorded");

    // 5. Invariant: Applying a lesson does NOT mutate tasks
    const applied = await applyLesson(validated._id, projectA._id, userLeader);
    assert(applied.status === "APPLIED", "Validated lesson successfully applied to project");
    const taskAfter = await Task.findById(task1._id).lean();
    assert(taskAfter.estimatedHours === 8, "INVARIANT: Applying lesson did NOT silently mutate task estimated hours");

    // 6. Insufficient Evidence Validation Guard
    const weakLesson = await ProjectLesson.create({
      projectId: projectA._id,
      teamId: team._id,
      category: "other",
      title: "Weak Speculation",
      description: "A one-off speculative observation",
      observedPattern: "Speculation",
      confidence: 0.2, // Below threshold 0.4
      status: "CANDIDATE",
      evidenceMetrics: { sampleSize: 0 },
    });
    let weakErr = false;
    try {
      await validateLesson(weakLesson._id, userLeader, { approved: true });
    } catch {
      weakErr = true;
    }
    assert(weakErr, "INVARIANT: System refuses to validate lessons with insufficient evidence (confidence < 0.4)");

    // 7. Isolation Guard
    const projectBLessons = await getProjectLessons(projectB._id);
    assert(projectBLessons.length === 0, "Project isolation: Project B receives 0 lessons from Project A");

    // =========================================================================
    // WORKSTREAM 22: CAPABILITY INTELLIGENCE + DYNAMIC ASSIGNMENT
    // =========================================================================
    console.log("\n[WS 22] Testing Capability Intelligence & Dynamic Assignment...");

    // 1. Build Capability Profile for Developer A
    const profileA = await buildCapabilityProfile(userDevA._id, team._id, projectA._id);
    assert(profileA != null, "CapabilityProfile built for Developer A");
    const frontendSkill = profileA.canonicalSkills.find((s) => s.skillId === "frontend");
    assert(frontendSkill != null, "Profile includes canonical Frontend skill");
    assert(frontendSkill.verificationStatus === "verified", "Frontend skill has verified status from passed quiz");
    assert(frontendSkill.weight === 1.0, "Verified quiz assigns weight 1.0");

    // 2. Build Capability Profile for Developer B (self-declared Python)
    const profileB = await buildCapabilityProfile(userDevB._id, team._id, projectA._id);
    const pythonSkill = profileB.canonicalSkills.find((s) => s.skillId === "python");
    assert(pythonSkill != null, "Profile includes self-declared Python skill");
    assert(pythonSkill.verificationStatus === "self_declared", "Skill marked as self_declared");
    assert(pythonSkill.weight === 0.4, "INVARIANT: Self-declared skill receives weight 0.4 (< 1.0)");

    // 3. Capability Gaps Detection
    const gaps = await analyzeCapabilityGaps(projectA._id);
    assert(gaps.totalMembers === 3, "Capability analysis evaluated all 3 team members");
    assert(Array.isArray(gaps.singlePointRisks), "Identifies single-point capability concentrations");
    assert(Array.isArray(gaps.coverage), "Calculates canonical skill coverage across team");

    // 4. Dynamic Team Assignment Preview (Branch & Bound)
    const openTask = await Task.create({
      projectId: projectA._id,
      teamId: team._id,
      title: "Build Responsive React Dashboard UI",
      status: "todo",
      category: "Frontend",
      estimatedHours: 12,
      urgency: 4,
      impact: 4,
    });

    const assignPreview = await previewDynamicAssignment(projectA._id);
    assert(assignPreview.advisoryOnly === true, "INVARIANT: Dynamic assignment output is strictly advisory");
    assert(assignPreview.assignments.length >= 1, "Branch & Bound solver produced task assignment");
    const taskRecommendation = assignPreview.assignments.find((a) => a.taskId === openTask._id.toString());
    assert(taskRecommendation != null, "Recommendation returned for open task");
    assert(taskRecommendation.recommendedMemberId === userDevA._id.toString(), "Branch & Bound correctly selected Developer A (verified in Frontend)");
    assert(Array.isArray(taskRecommendation.alternatives), "Exposes alternative candidate options");

    // Invariant: preview did NOT mutate task
    const openTaskCheck = await Task.findById(openTask._id).lean();
    assert(openTaskCheck.assignedTo == null, "INVARIANT: Preview did NOT assign task automatically");

    // 5. Human Acceptance Workflow
    const accepted = await acceptAssignment(
      projectA._id,
      { taskId: openTask._id, newAssigneeId: userDevA._id },
      userLeader
    );
    assert(accepted.success === true, "Leader explicitly accepted assignment");
    const assignedTask = await Task.findById(openTask._id).lean();
    assert(assignedTask.assignedTo.toString() === userDevA._id.toString(), "Task assigned only after explicit human acceptance");

    // Check auditable ProjectEvent created
    const assignEvents = await ProjectEvent.find({
      projectId: projectA._id,
      eventType: "ASSIGNMENT_ACCEPTED",
    });
    assert(assignEvents.length >= 1, "Auditable ProjectEvent created on assignment acceptance");

    // =========================================================================
    // WORKSTREAM 23: EXPLAINABLE DECISION INTELLIGENCE
    // =========================================================================
    console.log("\n[WS 23] Testing Explainable Decision Intelligence...");

    // 1. Task Priority Explanation
    const explanation = await explainTaskPriority(openTask._id);
    assert(explanation != null, "Generated structured decision record for task priority");
    assert(explanation.decisionType === "TASK_PRIORITY", "Decision type is TASK_PRIORITY");
    assert(explanation.classification === "DETERMINISTIC", "Classification is DETERMINISTIC");
    assert(explanation.factors.length === 3, "Exposes exact factors (Urgency, Impact, Dependencies)");
    assert(explanation.explanation?.what.length > 0, "Includes WHAT explanation");
    assert(explanation.explanation?.why.length > 0, "Includes WHY explanation");

    // 2. Counterfactual Recomputation
    const cf = await recomputeCounterfactual(explanation.decisionId, {
      parameter: "urgency",
      modifiedValue: 5,
    });
    assert(cf != null, "Counterfactual recomputed");
    assert(typeof cf.projectedScore === "number", "Calculated projected score deterministically");
    assert(cf.deltaExplanation.includes("shifts score"), "Produced human-readable delta explanation");

    // 3. Retrieval by Decision ID
    const retrieved = await getDecisionExplanation(explanation.decisionId);
    assert(retrieved.decisionId === explanation.decisionId, "Retrieved decision explanation faithfully from database");

    // =========================================================================
    // WORKSTREAM 24: PROJECT HEALTH 2.0 & EARLY WARNING SYSTEM
    // =========================================================================
    console.log("\n[WS 24] Testing Project Health 2.0 & Early Warning System...");

    // Seed an overdue task
    await Task.create({
      projectId: projectA._id,
      teamId: team._id,
      title: "Overdue Critical Security Patch",
      status: "todo",
      dueDate: new Date(Date.now() - 3 * 86_400_000), // 3 days ago
      estimatedHours: 6,
    });

    // Seed blocked task
    await Task.create({
      projectId: projectA._id,
      teamId: team._id,
      title: "Blocked Database Migration",
      status: "in_progress",
      isBlocked: true,
      estimatedHours: 8,
    });

    // 1. Health 2.0 Multi-Dimension Evaluation
    const health = await evaluateProjectHealth2(projectA._id);
    assert(health.dimensions.length === 9, "Evaluates all 9 deterministic health dimensions");
    assert(typeof health.overallScore === "number" && health.overallScore <= 100, "Calculates weighted overall health score");
    assert(["A", "B", "C", "D", "F"].includes(health.grade), "Maps score to clear grade (A–F)");

    // Verify Schedule dimension reflects overdue task
    const schedDim = health.dimensions.find((d) => d.key === "schedule");
    assert(schedDim != null && schedDim.score < 100, "Schedule dimension penalizes overdue tasks");

    // Verify Dependencies dimension reflects blocked task
    const depDim = health.dimensions.find((d) => d.key === "dependencies");
    assert(depDim != null && depDim.score < 100, "Dependencies dimension penalizes blocked tasks");

    // 2. Early Warning Creation & Deduplication
    assert(health.activeWarnings.length >= 2, `Opened ${health.activeWarnings.length} early warning(s) for overdue & blocked tasks`);
    const initialWarningCount = await EarlyWarning.countDocuments({ projectId: projectA._id });

    // Rerun health evaluation — warnings must deduplicate, not duplicate
    await evaluateProjectHealth2(projectA._id);
    const postWarningCount = await EarlyWarning.countDocuments({ projectId: projectA._id });
    assert(initialWarningCount === postWarningCount, "DEDUPLICATION: Re-evaluation does not create duplicate early warning records");

    // 3. Early Warning Lifecycle (Acknowledge -> Resolve)
    const activeWarn = health.activeWarnings[0];
    const acknowledged = await acknowledgeWarning(activeWarn._id, userLeader);
    assert(acknowledged.status === "ACKNOWLEDGED", "Warning successfully acknowledged");
    assert(acknowledged.acknowledgedBy?.name === userLeader.name, "Recorded user who acknowledged warning");

    const resolved = await resolveWarning(activeWarn._id, userLeader, "Impediment cleared.");
    assert(resolved.status === "RESOLVED", "Warning manually resolved with documented justification");

    // 4. Missing Data Invariant Check (Empty Project)
    const emptyHealth = await evaluateProjectHealth2(projectB._id);
    assert(emptyHealth.overallScore === 100, "INVARIANT: Empty project receives baseline healthy score (100) with no false alarms");
    assert(emptyHealth.dimensions.every((d) => d.score === 100), "All 9 dimensions handle missing data deterministically");

    // =========================================================================
    // WORKSTREAM 25: MASTER INTEGRATION CHAIN & SECURITY AUDIT
    // =========================================================================
    console.log("\n[WS 25] Testing Master Integration Chain & Security Boundaries...");

    // 1. Verify Event Audit Chain
    const allProjectEvents = await ProjectEvent.find({ projectId: projectA._id });
    const eventTypes = allProjectEvents.map((e) => e.eventType);
    assert(eventTypes.includes("LESSON_CANDIDATE_GENERATED"), "Audit chain: recorded LESSON_CANDIDATE_GENERATED");
    assert(eventTypes.includes("LESSON_VALIDATED"), "Audit chain: recorded LESSON_VALIDATED");
    assert(eventTypes.includes("LESSON_APPLIED"), "Audit chain: recorded LESSON_APPLIED");
    assert(eventTypes.includes("ASSIGNMENT_ACCEPTED"), "Audit chain: recorded ASSIGNMENT_ACCEPTED");

    // 2. Cross-Project Isolation
    const crossLessons = await ProjectLesson.find({ projectId: projectB._id });
    assert(crossLessons.length === 0, "Zero cross-project lesson leakage");

    const crossDecisions = await DecisionRecord.find({ projectId: projectB._id });
    assert(crossDecisions.length === 0, "Zero cross-project decision explanation leakage");

    const crossWarnings = await EarlyWarning.find({ projectId: projectB._id });
    assert(crossWarnings.length === 0, "Zero cross-project warning leakage");

  } finally {
    console.log("\n[CLEANUP] Cleaning up test records from database...");
    if (userLeader) await User.findByIdAndDelete(userLeader._id);
    if (userDevA) await User.findByIdAndDelete(userDevA._id);
    if (userDevB) await User.findByIdAndDelete(userDevB._id);
    if (userOther) await User.findByIdAndDelete(userOther._id);
    if (team) await Team.findByIdAndDelete(team._id);
    if (projectA) {
      await Project.findByIdAndDelete(projectA._id);
      await Task.deleteMany({ projectId: projectA._id });
      await Sprint.deleteMany({ projectId: projectA._id });
      await Retrospective.deleteMany({ projectId: projectA._id });
      await Risk.deleteMany({ projectId: projectA._id });
      await ProjectEvent.deleteMany({ projectId: projectA._id });
      await ProjectLesson.deleteMany({ projectId: projectA._id });
      await CapabilityProfile.deleteMany({ projectId: projectA._id });
      await DecisionRecord.deleteMany({ projectId: projectA._id });
      await EarlyWarning.deleteMany({ projectId: projectA._id });
    }
    if (projectB) {
      await Project.findByIdAndDelete(projectB._id);
      await Task.deleteMany({ projectId: projectB._id });
      await ProjectLesson.deleteMany({ projectId: projectB._id });
      await CapabilityProfile.deleteMany({ projectId: projectB._id });
      await DecisionRecord.deleteMany({ projectId: projectB._id });
      await EarlyWarning.deleteMany({ projectId: projectB._id });
    }
    if (userDevA) {
      await SkillVerification.deleteMany({ userId: userDevA._id });
    }
    await mongoose.disconnect();
    console.log("[DB] Disconnected cleanly.\n");
  }

  console.log("=".repeat(70));
  console.log(`WORKSTREAMS 21–25 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(70) + "\n");

  if (failed > 0) {
    console.error("Failures:", failures);
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
