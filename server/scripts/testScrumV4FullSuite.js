/**
 * server/scripts/testScrumV4FullSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — FULL SCRUM IMPLEMENTATION COMPREHENSIVE TEST SUITE
 *
 * Verifies Prompts 0 through 20+:
 *   1. Scrum Priority Engine (13 weighted factors, explainability) (Prompt 6)
 *   2. Backlog Ranking & Planning Candidates (Prompt 5)
 *   3. Scrum Dependency Engine (DAG, cycles, cross-sprint, critical path) (Prompt 8)
 *   4. Scrum Capacity & Load Balancing Engine (Branch & Bound advisory) (Prompt 10 & 11)
 *   5. Scrum Sprint Lifecycle & Review (PLANNING, ACTIVE, COMPLETED, CANCELLED) (Prompt 14 & 15)
 *   6. Scrum Task Transitions (BACKLOG -> SELECTED -> TODO -> IN_PROGRESS -> IN_REVIEW -> DONE) (Prompt 7)
 *   7. Scrum Health & Delivery Probability (Prompt 12)
 * ============================================================================
 */

import assert from "node:assert";
import {
  calculateScrumPriority,
  rankBacklog,
  scorePlanningCandidates,
} from "../services/scrumPriorityEngine.js";
import {
  analyzeScrumDependencies,
  wouldCreateCycle,
  assessDependencyImpact,
} from "../services/scrumDependencyEngine.js";
import {
  calculateSprintCapacity,
  suggestAllocation,
} from "../services/scrumCapacityEngine.js";
import {
  validateSprintTransition,
  validateTaskTransition,
  calculateScrumHealth,
} from "../services/scrumEngine.js";

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log("\n=======================================================");
console.log("  NEXUSFLOW V4 SCRUM COMPREHENSIVE VERIFICATION SUITE  ");
console.log("=======================================================\n");

// ── TEST GROUP 1: SCRUM DYNAMIC PRIORITY ENGINE (Prompt 6) ─────────────
console.log("--- 1. Scrum Priority Engine (13 Configurable Factors) ---");

test("Calculates deterministic priority score with explainable factor breakdown", () => {
  const task = {
    businessValue: 8,
    urgency: 4,
    estimatedHours: 8,
    storyPoints: 5,
    deadline: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    dependencies: ["dep1", "dep2"],
    technicalUncertainty: 7,
    teacherImportance: 9,
  };

  const result = calculateScrumPriority(task);
  assert(typeof result.score === "number", "Score must be a number");
  assert(result.score >= 0 && result.score <= 100, "Score must be between 0 and 100");
  assert(result.factors, "Factors breakdown must exist");
  assert(result.factors.businessValue > 0, "Business value factor must be positive");
  assert(result.factors.teacherImportance > 0, "Teacher importance factor must be positive");
  assert(result.factors.urgency > 0, "Urgency factor must be positive");
  assert(typeof result.tier === "string", "Tier must be present");
  assert(typeof result.explanation === "string", "Explanation must be present");
});

test("Backlog ranking orders items deterministically by dynamic priority", () => {
  const items = [
    { _id: "t1", title: "Low priority task", businessValue: 2, urgency: 1, storyPoints: 2, priorityScore: 20 },
    { _id: "t2", title: "Critical API task", businessValue: 10, urgency: 5, storyPoints: 5, teacherImportance: 10, priorityScore: 95 },
    { _id: "t3", title: "Medium feature", businessValue: 6, urgency: 3, storyPoints: 3, priorityScore: 60 },
  ];

  const ranked = rankBacklog(items);
  assert.strictEqual(ranked.length, 3);
  assert.strictEqual(ranked[0]._id, "t2", "Critical API task must rank #1");
  assert.strictEqual(ranked[1]._id, "t3", "Medium feature must rank #2");
  assert.strictEqual(ranked[2]._id, "t1", "Low priority must rank #3");
});

test("Scores Sprint Planning candidate with capacity & fit analysis (Knapsack)", () => {
  const candidates = [
    { _id: "t10", title: "Prediction Service", businessValue: 8, storyPoints: 5, estimatedHours: 12 },
    { _id: "t11", title: "Minor css tweak", businessValue: 1, storyPoints: 1, estimatedHours: 2 },
  ];

  const result = scorePlanningCandidates(candidates, {
    sprintGoal: "prediction service and API",
    totalCapacityHours: 40,
  });

  assert(result.recommended, "Must return recommended candidates array");
  assert(Array.isArray(result.recommended));
  assert(result.analysis, "Must provide planning analysis");
});

// ── TEST GROUP 2: SCRUM DEPENDENCY ENGINE (Prompt 8) ───────────────────
console.log("\n--- 2. Scrum Dependency Engine & DAG Integrity ---");

test("Detects circular dependencies in tasks and prevents them", () => {
  const tasks = [
    { _id: "A", dependencies: ["B"] },
    { _id: "B", dependencies: ["C"] },
    { _id: "C", dependencies: [] },
  ];

  // Adding C -> A would form C -> A -> B -> C cycle
  const createsCycle = wouldCreateCycle(tasks, "C", "A");
  assert.strictEqual(createsCycle, true, "Must detect circular dependency");

  // Adding C -> D does not create cycle
  const safeEdge = wouldCreateCycle(tasks, "C", "D");
  assert.strictEqual(safeEdge, false, "Safe edge must pass");
});

test("Identifies cross-sprint dependencies and critical path", () => {
  const sprintId = "sprint_01";
  const tasks = [
    { _id: "t1", title: "API Task", sprintId: "sprint_01", dependencies: ["t0"], estimatedHours: 8 },
    { _id: "t0", title: "DB Task", sprintId: "sprint_00", dependencies: [], estimatedHours: 16, scrumStatus: "DONE" },
    { _id: "t2", title: "UI Task", sprintId: "sprint_01", dependencies: ["t1"], estimatedHours: 10 },
  ];

  const analysis = analyzeScrumDependencies(tasks, sprintId);
  assert(Array.isArray(analysis.crossSprintDeps), "Must return crossSprintDeps array");
  assert.strictEqual(analysis.crossSprintDeps.length, 1);
  assert.strictEqual(analysis.crossSprintDeps[0].dependsOnId, "t0");
  assert(Array.isArray(analysis.criticalPath), "Must calculate critical path");
  assert(analysis.criticalPath.length > 0, "Critical path must have nodes");
});

test("Assesses dependency impact when task is modified", () => {
  const tasks = [
    { _id: "t1", dependencies: [], title: "Base task", estimatedHours: 4 },
    { _id: "t2", dependencies: ["t1"], title: "Dependent task 1", estimatedHours: 8 },
    { _id: "t3", dependencies: ["t2"], title: "Dependent task 2", estimatedHours: 6 },
  ];

  const impact = assessDependencyImpact(tasks, "t1");
  assert.strictEqual(impact.affectedCount, 2, "Modifying t1 must impact t2 and t3");
  assert.strictEqual(impact.totalImpact, 14, "Total hours at risk: 8 + 6 = 14h");
  assert(impact.affected.some((a) => a.taskId === "t2"));
  assert(impact.affected.some((a) => a.taskId === "t3"));
});

// ── TEST GROUP 3: SCRUM CAPACITY & BALANCING ENGINE (Prompt 10 & 11) ───
console.log("\n--- 3. Scrum Capacity & Load Balancing Engine ---");

test("Calculates sprint capacity and identifies overloaded members", () => {
  const sprint = { _id: "sprint_01" };
  const team = {
    members: [
      { userId: "u1", name: "Alice", capacity: 40, role: "developer", skills: { frontend: 8 } },
      { userId: "u2", name: "Bob", capacity: 40, role: "developer", skills: { backend: 8 } },
    ],
  };
  const tasks = [
    { sprintId: "sprint_01", assignedTo: "u1", estimatedHours: 50, scrumStatus: "IN_PROGRESS" }, // 50/40 = 125%
    { sprintId: "sprint_01", assignedTo: "u2", estimatedHours: 20, scrumStatus: "TODO" },        // 20/40 = 50%
  ];

  const cap = calculateSprintCapacity(sprint, tasks, team);
  assert.strictEqual(cap.summary.totalCapacity, 80);
  assert.strictEqual(cap.summary.totalAllocated, 70);
  assert.strictEqual(cap.summary.overloadedMembers, 1);
  assert(cap.members.some((m) => m.userName === "Alice" && m.isOverloaded));
});

test("Suggests Branch & Bound allocation recommendations without auto-assigning", () => {
  const members = [
    { userId: "u1", name: "Alice", capacity: 40, assignedLoad: 35, skills: { backend: 8 } },
    { userId: "u2", name: "Bob", capacity: 40, assignedLoad: 10, skills: { backend: 8 } },
  ];
  const tasks = [
    { _id: "t1", title: "Unassigned API", assignedTo: null, estimatedHours: 15, requiredSkills: ["backend"] },
  ];

  const suggestions = suggestAllocation(tasks, members);
  assert(Array.isArray(suggestions), "Must return suggestions array");
  assert(suggestions.length > 0, "Must provide allocation suggestions");
  assert.strictEqual(suggestions[0].taskId, "t1");
  assert(suggestions[0].topCandidate !== undefined, "Must provide top candidate");
});

// ── TEST GROUP 4: SPRINT LIFECYCLE & STATE MACHINE (Prompt 14 & 15) ────
console.log("\n--- 4. Scrum State Machine & Lifecycle Rules ---");

test("Sprint state transitions enforce Scrum lifecycle (PLANNING -> ACTIVE -> REVIEW -> COMPLETED)", () => {
  // PLANNING -> ACTIVE: OK
  assert.strictEqual(validateSprintTransition("PLANNING", "ACTIVE"), true);
  // ACTIVE -> REVIEW: OK (Sprint Review ceremony)
  assert.strictEqual(validateSprintTransition("ACTIVE", "REVIEW"), true);
  // REVIEW -> COMPLETED: OK
  assert.strictEqual(validateSprintTransition("REVIEW", "COMPLETED"), true);
  // ACTIVE -> CANCELLED: OK
  assert.strictEqual(validateSprintTransition("ACTIVE", "CANCELLED"), true);
  // COMPLETED -> ACTIVE: Invalid
  assert.strictEqual(validateSprintTransition("COMPLETED", "ACTIVE"), false);
  // PLANNING -> COMPLETED: Invalid (must be active first)
  assert.strictEqual(validateSprintTransition("PLANNING", "COMPLETED"), false);
});

test("Task state transitions enforce Scrum execution rules", () => {
  // BACKLOG -> SELECTED_FOR_SPRINT: OK
  assert.strictEqual(validateTaskTransition("BACKLOG", "SELECTED_FOR_SPRINT"), true);
  // SELECTED_FOR_SPRINT -> TODO: OK
  assert.strictEqual(validateTaskTransition("SELECTED_FOR_SPRINT", "TODO"), true);
  // TODO -> IN_PROGRESS: OK
  assert.strictEqual(validateTaskTransition("TODO", "IN_PROGRESS"), true);
  // IN_PROGRESS -> IN_REVIEW: OK
  assert.strictEqual(validateTaskTransition("IN_PROGRESS", "IN_REVIEW"), true);
  // IN_REVIEW -> DONE: OK
  assert.strictEqual(validateTaskTransition("IN_REVIEW", "DONE"), true);
  // DONE -> TODO: Invalid (DONE is terminal historical truth)
  assert.strictEqual(validateTaskTransition("DONE", "TODO"), false);
});

// ── TEST GROUP 5: SCRUM HEALTH & INSIGHTS (Prompt 12) ──────────────────
console.log("\n--- 5. Scrum Health & Delivery Probability ---");

test("Calculates composite Scrum Health Grade and metrics", () => {
  const sprint = {
    _id: "sprint_01",
    status: "ACTIVE",
    totalCapacityHours: 80,
    allocatedHours: 65,
  };
  const team = {
    members: [
      { userId: "u1", capacity: 40, assignedLoad: 35 },
      { userId: "u2", capacity: 40, assignedLoad: 30 },
    ],
  };
  const tasks = [
    { sprintId: "sprint_01", scrumStatus: "DONE", status: "done", storyPoints: 15, estimatedHours: 20 },
    { sprintId: "sprint_01", scrumStatus: "IN_PROGRESS", status: "in_progress", storyPoints: 10, estimatedHours: 15 },
    { sprintId: "sprint_01", scrumStatus: "TODO", status: "todo", storyPoints: 5, estimatedHours: 8 },
  ];

  const health = calculateScrumHealth(sprint, tasks, team);
  assert(typeof health.overall === "number", "Overall health score must be a number");
  assert(health.overall >= 0 && health.overall <= 100);
  assert(["HEALTHY", "AT_RISK", "CRITICAL"].includes(health.status), "Health status must be valid");
  assert(typeof health.sprintGoalHealth === "number");
  assert(typeof health.capacityHealth === "number");
  assert(typeof health.dependencyHealth === "number");
});

console.log("\n=======================================================");
console.log(`  RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log("=======================================================\n");

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
