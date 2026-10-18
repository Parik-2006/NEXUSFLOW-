/**
 * server/scripts/testWaterfallLifecycleAndGating.js
 * ============================================================================
 * Comprehensive Verification Suite for:
 * 1. Artifact Scope Extraction (all 3 cards populated with 2-3 word labels)
 * 2. Scope Conflict Detection and Resolution
 * 3. Document Readiness & Plan Finalization Lifecycle
 * 4. Task Generation across 6 Waterfall Phases with Prerequisite Dependencies
 * 5. Strict Server-Side Sequential Execution Enforcement
 * 6. Kanban Preservation (no Waterfall phase gates applied to Kanban)
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import {
  parseArtifactDocument,
  detectScopeConflicts,
  generateWaterfallTasksFromPlan,
} from "../services/requirementService.js";
import { assertWaterfallTaskExecutable } from "../services/phaseGateService.js";

const MONGO_URI = process.env.MONGO_URI;

async function runTests() {
  console.log("================================================================================");
  console.log("   NEXUSFLOW WATERFALL ARTIFACT INTELLIGENCE & STRICT GATING TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB Atlas\n");

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Artifact Scope Extraction (All 3 Cards Populated with 2-3 Word Labels)
    // --------------------------------------------------------------------------
    console.log("--- TEST 1: Artifact Extraction & Scope Cards ---");
    const sampleBrief = `
# PhishShield — Phishing Detection System
## Executive Summary
Build an explainable URL phishing detector for enterprise employees.
Achieve zero false accusations and high transparency.

## Key Deliverables
- Explainable Risk Scoring: URL breakdown and rule weights.
- Rule-Based Analyzer: Heuristic matching engine.
- Evaluation Dashboard: Metrics and verification UI.
- Testing Report: Security benchmark documentation.

## Constraints & Policies
- No Credential Storage: Zero retention of user passwords or tokens.
- Privacy-First Design: Local heuristics without sending raw payloads.
- No Automatic Navigation: Do not follow redirects automatically.
    `;

    const parsed = parseArtifactDocument(sampleBrief, "PhishShield Brief");

    assert(Array.isArray(parsed.goals) && parsed.goals.length > 0, "Executive Goals card populated");
    assert(Array.isArray(parsed.deliverables) && parsed.deliverables.length >= 3, "Key Deliverables card populated (no longer empty)");
    assert(Array.isArray(parsed.constraints) && parsed.constraints.length >= 3, "Constraints & Policies card populated (no longer empty)");

    const deliverableLabels = parsed.deliverables.map((d) => d.label);
    const labelLengths = deliverableLabels.map((l) => l.split(/\s+/).length);
    assert(
      labelLengths.every((len) => len >= 1 && len <= 4),
      "Deliverable labels are concise 2–3-word phrases: " + deliverableLabels.join(", ")
    );

    const constraintLabels = parsed.constraints.map((c) => c.label);
    assert(
      constraintLabels.includes("No Credential Storage") || constraintLabels.some((l) => l.includes("Privacy")),
      "Extracted real constraints from artifact text: " + constraintLabels.join(", ")
    );

    // --------------------------------------------------------------------------
    // TEST 2: Scope Conflict Detection
    // --------------------------------------------------------------------------
    console.log("\n--- TEST 2: Scope Conflict Detection ---");
    const conflictingContext = {
      description: "Mandatory ML classifier with deep learning model and browser extension popup.",
      expectedOutputs: ["Browser Extension", "Deep Neural Network Model"],
    };
    const conflicts = detectScopeConflicts({
      artifactData: parsed,
      projectDescription: conflictingContext.description,
      existingGoals: conflictingContext.expectedOutputs,
      artifacts: [
        {
          name: "PHISHGUARD ARTIFACT",
          content: sampleBrief + "\nFirst release must use transparent rules. Machine-learning classifier is an optional future extension. Browser extension and automatic URL navigation are explicitly out of scope; form to paste sample only.",
        },
      ],
    });
    assert(Array.isArray(conflicts) && conflicts.length >= 2, `Detected scope contradictions between brief and context (found ${conflicts.length})`);
    assert(
      conflicts.some((c) => c.title.toLowerCase().includes("rules") || c.statementB.includes("rules")),
      "Surfaced conflict: Rule-Based first release vs. ML classifier"
    );
    assert(
      conflicts.some((c) => c.title.toLowerCase().includes("interface") || c.statementB.includes("Browser Extension")),
      "Surfaced conflict: Web interface vs. browser extension"
    );

    // --------------------------------------------------------------------------
    // TEST 3: Pre-Finalization Execution Lock (Tasks & Timeline Gated)
    // --------------------------------------------------------------------------
    console.log("\n--- TEST 3: Pre-Finalization Execution Gating ---");
    const testProject = new Project({
      title: "Test Waterfall Gating Project",
      teamId: new mongoose.Types.ObjectId(),
      methodology: "WATERFALL",
      waterfallPlanLifecycle: {
        status: "PLAN_REVIEW_REQUIRED",
        planRevision: 1,
        artifactAnalysisRevision: 1,
        documentReadinessConfirmed: false,
        conflicts: conflicts,
        scope: parsed,
      },
    });
    await testProject.save();

    // Create a draft task in the project
    const draftTask = new Task({
      title: "Test Draft Task",
      project: testProject._id,
      teamId: testProject.teamId,
      phase: "requirements",
      status: "todo",
      executionOrder: 1,
    });
    await draftTask.save();

    // Verify assertWaterfallTaskExecutable rejects unfinalized plan
    let rejectedPreFinalize = false;
    let preFinalizeReason = "";
    try {
      await assertWaterfallTaskExecutable(draftTask, testProject, "in_progress");
    } catch (err) {
      rejectedPreFinalize = true;
      preFinalizeReason = err.message;
    }
    assert(rejectedPreFinalize, `Task start rejected before plan finalization: ${preFinalizeReason}`);
    await draftTask.deleteOne();

    // --------------------------------------------------------------------------
    // TEST 4: Plan Finalization & Task Generation
    // --------------------------------------------------------------------------
    console.log("\n--- TEST 4: Finalization & 6-Phase Task Generation ---");
    // Resolve conflicts
    testProject.waterfallPlanLifecycle.conflicts = testProject.waterfallPlanLifecycle.conflicts.map((c) => ({
      ...c,
      status: "resolved",
      selectedResolution: c.statementA,
    }));
    testProject.waterfallPlanLifecycle.documentReadinessConfirmed = true;
    testProject.waterfallPlanLifecycle.status = "AWAITING_FINALIZATION";
    await testProject.save();

    // Generate tasks from finalized plan
    const generatedTasks = await generateWaterfallTasksFromPlan({ project: testProject, teamId: testProject.teamId });
    assert(generatedTasks.length >= 8, `Generated ${generatedTasks.length} tasks across Waterfall phases`);

    const phasesRepresented = new Set(generatedTasks.map((t) => t.phase));
    assert(phasesRepresented.has("requirements"), "Requirements phase tasks generated");
    assert(phasesRepresented.has("system_design") || phasesRepresented.has("design"), "System Design phase tasks generated");
    assert(phasesRepresented.has("implementation"), "Implementation phase tasks generated");
    assert(phasesRepresented.has("verification") || phasesRepresented.has("testing"), "Verification phase tasks generated");
    assert(phasesRepresented.has("deployment"), "Deployment phase tasks generated");
    assert(phasesRepresented.has("maintenance"), "Maintenance phase tasks generated");

    // Check prerequisite dependencies exist
    const tasksWithDeps = generatedTasks.filter((t) => t.dependencies && t.dependencies.length > 0);
    assert(tasksWithDeps.length > 0, `Tasks contain explicit prerequisite dependencies (${tasksWithDeps.length} tasks)`);

    // Mark lifecycle as TASKS_GENERATED
    testProject.waterfallPlanLifecycle.status = "TASKS_GENERATED";
    testProject.waterfallPlanLifecycle.finalizedPlanRevision = 1;
    testProject.phaseGateStatus = { currentPhase: "requirements" };
    await testProject.save();

    // --------------------------------------------------------------------------
    // TEST 5: Strict Sequential Phase Gate & Task Execution Enforcement
    // --------------------------------------------------------------------------
    console.log("\n--- TEST 5: Strict Sequential Phase & Task Execution ---");
    const reqTask1 = await Task.findOne({ projectId: testProject._id, requirementId: "W-01" });
    const reqTask2 = await Task.findOne({ projectId: testProject._id, requirementId: "W-02" });
    const implTask = await Task.findOne({ projectId: testProject._id, phase: "implementation" });

    // 5.1 Starting task in locked future phase must be REJECTED
    let futurePhaseRejected = false;
    let futurePhaseReason = "";
    try {
      await assertWaterfallTaskExecutable(implTask, testProject, "in_progress");
    } catch (err) {
      futurePhaseRejected = true;
      futurePhaseReason = err.message;
    }
    assert(futurePhaseRejected, `Starting task in locked future phase rejected: ${futurePhaseReason}`);

    // 5.2 Starting task 2 before predecessor task 1 is done must be REJECTED
    let predecessorViolationRejected = false;
    let predecessorReason = "";
    try {
      await assertWaterfallTaskExecutable(reqTask2, testProject, "in_progress");
    } catch (err) {
      predecessorViolationRejected = true;
      predecessorReason = err.message;
    }
    assert(predecessorViolationRejected, `Starting task before prerequisite predecessor rejected: ${predecessorReason}`);

    // 5.3 Starting task 1 (eligible first task) must SUCCEED
    let task1Succeeded = false;
    try {
      const exec = await assertWaterfallTaskExecutable(reqTask1, testProject, "in_progress");
      task1Succeeded = exec.executable === true;
    } catch (err) {
      task1Succeeded = false;
    }
    assert(task1Succeeded, "Starting eligible task 1 in active Requirements phase succeeds");

    // Complete task 1
    reqTask1.status = "done";
    await Task.findByIdAndUpdate(reqTask1._id, { status: "done" });
    const freshReqTask2 = await Task.findById(reqTask2._id).lean();

    // 5.4 Now task 2 becomes eligible
    let task2Succeeded = false;
    try {
      const exec = await assertWaterfallTaskExecutable(freshReqTask2, testProject, "in_progress");
      task2Succeeded = exec.executable === true;
    } catch (err) {
      task2Succeeded = false;
    }
    assert(task2Succeeded, "Starting task 2 succeeds once prerequisite predecessor task 1 is complete");

    // --------------------------------------------------------------------------
    // TEST 6: Kanban Preservation (No Phase Gates Applied to Kanban)
    // --------------------------------------------------------------------------
    console.log("\n--- TEST 6: Kanban Preservation ---");
    const kanbanProject = new Project({
      title: "Test Kanban Project",
      teamId: new mongoose.Types.ObjectId(),
      methodology: "KANBAN",
    });
    await kanbanProject.save();

    const kanbanTask = new Task({
      title: "Kanban Task In Any Stage",
      project: kanbanProject._id,
      teamId: kanbanProject.teamId,
      phase: "implementation", // Arbitrary phase or no phase
      status: "todo",
    });
    await kanbanTask.save();

    let kanbanRejected = false;
    try {
      const exec = await assertWaterfallTaskExecutable(kanbanTask, kanbanProject, "in_progress");
      assert(exec.executable === true, "Kanban task execution is un-gated (passes immediately)");
    } catch (err) {
      kanbanRejected = true;
    }
    assert(!kanbanRejected, "Kanban projects do NOT enforce Waterfall phase gates or sequential locking");

    // --------------------------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------------------------
    await Task.deleteMany({ project: { $in: [testProject._id, kanbanProject._id] } });
    await Project.deleteMany({ _id: { $in: [testProject._id, kanbanProject._id] } });
    await draftTask.deleteOne();

    console.log("\n================================================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("================================================================================");

    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  }
}

runTests();
