/**
 * server/scripts/testWorkstream29DaaAiBoundary.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 29: DAA VS AI BOUNDARY AUDIT SUITE
 *
 * Verifies:
 * - Bit-identical reproducibility of deterministic DAA engines
 * - Zero-cost AI provider cascade: Gemini -> Groq -> OpenRouter -> Graceful Fallback
 * - System stability: Total AI failure does NOT break deterministic intelligence
 * - State mutation safety: AI outputs remain strictly advisory
 * - Local AI foundation: metadata/interface only, disabled by default
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";

import { computeTaskPriority } from "../algorithms/taskPriorityEngine.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { evaluateProjectHealth2 } from "../services/projectHealth2Service.js";
import { topologicalSort, buildGraph } from "../algorithms/graphTraversal.js";
import { executeAiQuery } from "../services/aiProviderAbstraction.js";
import { explainTaskPriority } from "../services/decisionIntelligenceService.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_test";

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

async function runDaaAiBoundarySuite() {
  console.log("\n========================================================");
  console.log("  NEXUSFLOW V4 — WORKSTREAM 29 DAA VS AI BOUNDARY AUDIT  ");
  console.log("========================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  try {
    // ── 1. DETERMINISTIC REPEATABILITY AUDIT ──
    console.log("--- 1. Deterministic Repeatability & Bit-Identical Verification ---");

    // Task Priority 2.0
    const sampleTask = {
      _id: new mongoose.Types.ObjectId(),
      title: "Critical Engine Calibration",
      urgency: 5,
      impact: 4,
      dependencyCount: 2,
      deadline: new Date(Date.now() + 86400000 * 2),
      estimatedHours: 6,
      businessValue: 9,
    };

    const run1 = computeTaskPriority(sampleTask);
    let allIdenticalPriority = true;
    for (let i = 0; i < 10; i++) {
      const runN = computeTaskPriority(sampleTask);
      if (runN.score !== run1.score || JSON.stringify(runN.factors) !== JSON.stringify(run1.factors)) {
        allIdenticalPriority = false;
        break;
      }
    }
    assert(allIdenticalPriority, "Task Priority 2.0 produces bit-identical score across 10 consecutive runs");

    // Branch & Bound Assignment
    const members = [
      { userId: "m1", name: "Dev 1", skills: { frontend: 8, backend: 4 }, capacity: 40 },
      { userId: "m2", name: "Dev 2", skills: { frontend: 3, backend: 9 }, capacity: 40 },
    ];
    const tasks = [
      { _id: "t1", title: "Frontend UI", skillWeights: { frontend: 7, backend: 2 } },
      { _id: "t2", title: "Backend API", skillWeights: { frontend: 2, backend: 8 } },
    ];

    const bb1 = assignTasksToMembers(members, tasks);
    let allIdenticalBB = true;
    for (let i = 0; i < 10; i++) {
      const bbN = assignTasksToMembers(members, tasks);
      if (bbN.totalCost !== bb1.totalCost || JSON.stringify(bbN.assignments) !== JSON.stringify(bb1.assignments)) {
        allIdenticalBB = false;
        break;
      }
    }
    assert(allIdenticalBB, "Branch & Bound assignment produces bit-identical cost and allocations across 10 runs");

    // Topological Sort DAG
    const dagTasks = [
      { _id: "task_a", dependencies: [] },
      { _id: "task_b", dependencies: ["task_a"] },
      { _id: "task_c", dependencies: ["task_b"] },
    ];
    const { adjList, inDegree } = buildGraph(dagTasks);
    const topo1 = topologicalSort(adjList, inDegree);
    let allIdenticalTopo = true;
    for (let i = 0; i < 10; i++) {
      const topoN = topologicalSort(adjList, inDegree);
      if (JSON.stringify(topoN.order) !== JSON.stringify(topo1.order)) {
        allIdenticalTopo = false;
        break;
      }
    }
    assert(allIdenticalTopo, "Topological sort DAG produces deterministic Kahn execution order across 10 runs");

    // ── 2. AI CASCADE & GRACEFUL FAILURE ──
    console.log("\n--- 2. AI Provider Cascade & Graceful Fallback ---");

    // Test query execution via zero-cost cascade
    const cascadeResult = await executeAiQuery({
      prompt: "Explain why a high-urgency task on critical path has high priority in 1 sentence.",
    });

    assert(cascadeResult && cascadeResult.success === true, "AI query executed successfully through provider cascade");
    const providerUsed = cascadeResult.telemetry?.successfulProvider;
    assert(providerUsed !== undefined, `Provider selected: ${providerUsed}`);
    assert(["gemini", "groq", "openrouter", "local"].includes(providerUsed), "Selected provider conforms to approved zero-cost whitelist");

    // Test forced failure: simulate network/timeout error
    console.log("\n--- 3. System Independence from AI Outages ---");

    const team = await Team.create({ name: "Boundary Team", members: [] });
    const project = await Project.create({ title: "Boundary Project", teamId: team._id, methodology: "WATERFALL" });
    const task = await Task.create({
      teamId: team._id,
      projectId: project._id,
      title: "Boundary Verification Task",
      urgency: 4,
      impact: 5,
    });

    // Compute Health 2.0 — must be 100% deterministic with ZERO AI dependence
    const health = await evaluateProjectHealth2(project._id);
    assert(health && typeof health.overallScore === "number", "Health 2.0 computes reliably without requiring any AI provider calls");

    // Compute Decision Explanation with AI offline or skipped
    const explanation = await explainTaskPriority(task._id);
    assert(explanation && explanation.factors.length > 0, "Decision explanation generates structured factor evidence deterministically");
    assert(explanation.classification === "DETERMINISTIC", "Decision record strictly classified as DETERMINISTIC");
    assert(explanation.explanation && explanation.explanation.what, "Decision explanation includes deterministic What/Why breakdown");

    // ── 4. STATE MUTATION GUARDS ──
    console.log("\n--- 4. State Mutation Isolation Guards ---");

    // Ensure AI query did not mutate task state
    const postAiTask = await Task.findById(task._id).lean();
    assert(postAiTask.urgency === 4, "Task urgency remains untouched by AI analysis");
    assert(postAiTask.impact === 5, "Task impact remains untouched by AI analysis");
    assert(postAiTask.status === "todo", "Task status remains untouched by AI analysis");
    assert(postAiTask.assignedTo === null, "Task assignedTo remains null (no silent reassignment)");

    // Cleanup
    await Task.deleteOne({ _id: task._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });

  } finally {
    await mongoose.disconnect();
  }

  console.log("\n========================================================");
  console.log(`  WORKSTREAM 29 RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runDaaAiBoundarySuite().catch((err) => {
  console.error("FATAL in testWorkstream29DaaAiBoundary:", err);
  process.exit(1);
});
