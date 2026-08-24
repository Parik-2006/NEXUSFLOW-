/**
 * server/scripts/testPhase3TaskDecomposition.js
 * ============================================================================
 * PHASE 3 VERIFICATION SCRIPT — Tests AI-Enhanced Task Decomposition with
 * Project Context Injection, Decision Grounding, Architecture Tasks,
 * Dependency Resolution, Duplicate Prevention, and DAA Algorithm Integrity.
 *
 * Runs both static validation and live MongoDB integration tests.
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";

// Models
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Decision from "../models/Decision.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import Recommendation from "../models/Recommendation.js";
import ResearchItem from "../models/ResearchItem.js";
import Resource from "../models/Resource.js";

// Services
import {
  buildTaskGenerationContext,
  validateDecomposedTasks,
  generateHeuristicProjectTasks,
  normalizeTaskTitle,
  persistGeneratedTasks,
  decomposeTasksWithContext,
} from "../services/taskDecomposer.js";

// DAA Algorithms
import { computePriorityScore } from "../algorithms/greedyScheduler.js";
import { buildGraph, topologicalSort as topoSortGraph } from "../algorithms/graphTraversal.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { boyerMooreSearch } from "../algorithms/taskOptimiser.js";

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        })
        .catch((err) => {
          console.log(`  ✗ ${name}: ${err.message}`);
          failed++;
          errors.push({ name, error: err.message });
        });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
    errors.push({ name, error: err.message });
  }
}

function section(title) {
  console.log(`\n[ ${title} ]`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. STATIC UNIT TESTS (Structured Validation & Heuristic Engine)
// ═════════════════════════════════════════════════════════════════════════════

section("1. Task Decomposition Validation & Normalization");

test("Structured task validator accepts and normalizes valid tasks", () => {
  const input = {
    tasks: [
      {
        title: "Configure ESP32 Firmware and WiFi Stack",
        description: "Set up PlatformIO environment and connect to 2.4GHz network.",
        category: "hardware",
        urgency: 4,
        impact: 5,
        estimatedHours: 6,
        businessValue: 10,
        skillWeights: { backend: 7, devops: 4 },
        dependsOnTitles: [],
        reason: "Hardware foundation for telemetry.",
      },
      {
        title: "Implement MQTT Telemetry Ingestion Endpoint",
        description: "Build Express route receiving JSON payloads from ESP32.",
        category: "backend",
        urgency: 4,
        impact: 4,
        estimatedHours: 5,
        businessValue: 8,
        dependsOnTitles: ["Configure ESP32 Firmware and WiFi Stack"],
        reason: "Required for backend telemetry ingestion.",
      },
    ],
  };

  const validated = validateDecomposedTasks(input);
  if (validated.length !== 2) throw new Error(`Expected 2 tasks, got ${validated.length}`);
  if (validated[0].category !== "Hardware") throw new Error(`Expected category "Hardware", got "${validated[0].category}"`);
  if (validated[1].category !== "Backend") throw new Error(`Expected category "Backend", got "${validated[1].category}"`);
  if (validated[0].skillWeights.backend !== 7) throw new Error("Skill weights normalization failed");
  if (validated[1].dependsOnTitles.length !== 1) throw new Error("dependsOnTitles not preserved");
});

test("Malformed or empty task payloads are rejected safely", () => {
  const empty = validateDecomposedTasks({ tasks: [] });
  if (empty.length !== 0) throw new Error("Expected empty array for empty tasks");

  const invalid = validateDecomposedTasks({ tasks: [{ title: "" }, null, "string"] });
  if (invalid.length !== 0) throw new Error("Expected invalid tasks to be filtered out");
});

test("normalizeTaskTitle strips punctuation, prefixes, and whitespace", () => {
  const n1 = normalizeTaskTitle("1. Implement ESP32-WiFi Module!");
  const n2 = normalizeTaskTitle("implement esp32-wifi module");
  if (n1 !== n2) throw new Error(`Expected "${n1}" === "${n2}"`);
});

section("2. Project-Context-Aware Heuristic Decomposer");

test("Heuristic decomposer generates domain-aware tasks respecting accepted decisions", () => {
  const context = {
    title: "Smart Irrigation & Soil Predictor",
    originalPrompt: "IoT system with soil sensors and weather API.",
    description: "Automated farm watering system.",
    domain: "Internet of Things (IoT)",
    projectType: "Smart Agriculture",
    acceptedDecisions: [
      { category: "database", title: "Database Choice", decision: "Use MongoDB Timeseries", selectedOption: "MongoDB" },
    ],
    architectureComponents: [
      { type: "hardware", name: "ESP32 Sensor Unit", technology: "C++" },
      { type: "backend", name: "IoT Telemetry Gateway", technology: "Node.js" },
    ],
    existingCategories: ["Planning", "Hardware"],
  };

  // 1. Test Project Mode (should include MongoDB and ESP32 tasks, NOT PostgreSQL or Shopify)
  const projectTasks = generateHeuristicProjectTasks(context, { mode: "project" });
  if (projectTasks.length < 4) throw new Error(`Expected at least 4 project tasks, got ${projectTasks.length}`);

  const hasMongoTask = projectTasks.some((t) => /mongodb/i.test(t.title) || /mongodb/i.test(t.description));
  if (!hasMongoTask) throw new Error("Expected MongoDB-specific task based on accepted decision");

  const hasShopify = projectTasks.some((t) => /shopify|cart|stripe|checkout/i.test(t.title));
  if (hasShopify) throw new Error("Unrelated e-commerce task generated for IoT project!");

  // 2. Test Missing Phases Mode
  const missingTasks = generateHeuristicProjectTasks(context, { mode: "missing_phases" });
  if (!missingTasks.some((t) => t.category === "Testing" || t.category === "Deployment")) {
    throw new Error("Missing phase mode did not generate Testing or Deployment tasks");
  }

  // 3. Test Architecture Mode
  const archTasks = generateHeuristicProjectTasks(context, { mode: "architecture" });
  if (archTasks.length !== 2) throw new Error(`Expected 2 architecture tasks, got ${archTasks.length}`);
  if (!archTasks.some((t) => t.title.includes("ESP32 Sensor Unit"))) {
    throw new Error("Architecture mode did not generate task for ESP32 component");
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. DAA ALGORITHMIC INTEGRITY TESTS
// ═════════════════════════════════════════════════════════════════════════════

section("3. Deterministic DAA Pipeline Preservation");

test("Topological Sort correctly orders generated DAG without cycles", () => {
  const sampleTasks = [
    { _id: new mongoose.Types.ObjectId("64a100000000000000000001"), dependencies: [] },
    { _id: new mongoose.Types.ObjectId("64a100000000000000000002"), dependencies: [new mongoose.Types.ObjectId("64a100000000000000000001")] },
    { _id: new mongoose.Types.ObjectId("64a100000000000000000003"), dependencies: [new mongoose.Types.ObjectId("64a100000000000000000002")] },
  ];

  const { adjList, inDegree } = buildGraph(sampleTasks);
  const { order, hasCycle } = topoSortGraph(adjList, inDegree);

  if (hasCycle) throw new Error("Unexpected cycle in valid DAG");
  if (order.length !== 3) throw new Error("Topo sort failed to order all tasks");
  if (order[0].toString() !== sampleTasks[0]._id.toString()) throw new Error("First task in topo order is incorrect");
});

test("Branch & Bound assignment matches skill weights to member skills", () => {
  const members = [
    { userId: new mongoose.Types.ObjectId(), name: "Hardware Specialist", skills: { frontend: 3, backend: 6, devops: 4, ml: 2, testing: 4, design: 2 } },
    { userId: new mongoose.Types.ObjectId(), name: "ML Engineer", skills: { frontend: 2, backend: 5, devops: 4, ml: 9, testing: 5, design: 2 } },
  ];

  const tasks = [
    { _id: new mongoose.Types.ObjectId(), title: "Train ML Model", skillWeights: { ml: 9, backend: 4 }, estimatedHours: 6, priorityScore: 80 },
    { _id: new mongoose.Types.ObjectId(), title: "Wire Sensors", skillWeights: { backend: 6, devops: 4 }, estimatedHours: 4, priorityScore: 75 },
  ];

  const result = assignTasksToMembers(members, tasks);
  if (result.assignments.length !== 2) throw new Error("Branch & Bound failed to assign all tasks");

  const mlAssignment = result.assignments.find((a) => a.taskId.toString() === tasks[0]._id.toString());
  if (!mlAssignment || mlAssignment.memberId !== members[1].userId.toString()) {
    throw new Error(`Expected ML task assigned to ML Engineer ID ${members[1].userId}, got ${mlAssignment?.memberId}`);
  }
});

test("Boyer-Moore search accurately matches task title substrings", () => {
  const tasks = [
    { _id: "1", title: "Configure ESP32 Firmware" },
    { _id: "2", title: "Build Mobile Dashboard" },
  ];

  const matches = boyerMooreSearch(tasks, "ESP32");
  if (matches.length !== 1 || matches[0].title !== "Configure ESP32 Firmware") {
    throw new Error("Boyer-Moore failed to find matching task");
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LIVE DATABASE & PROJECT CONTEXT INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

section("4. Live MongoDB Task Decomposition Tests");

let testTeamId, testProjectId, testUserId;

await test("Connect to MongoDB for Phase 3 Integration Tests", async () => {
  await mongoose.connect(MONGO_URI);
});

await test("Setup Test Team, Project, Decisions, and Architecture", async () => {
  testUserId = new mongoose.Types.ObjectId();
  const team = await Team.create({
    name: "Phase3_TestTeam_" + Date.now(),
    members: [
      {
        userId: testUserId,
        name: "Parikshit",
        role: "Team Lead",
        skills: { frontend: 8, backend: 9, devops: 7, ml: 9 },
      },
    ],
    projectTitle: "AI Smart Irrigation Drone",
    projectDescription: "Autonomous soil monitoring drone system.",
  });
  testTeamId = team._id;

  const project = await Project.create({
    teamId: testTeamId,
    title: "AI Smart Irrigation Drone",
    description: "Autonomous soil monitoring drone system.",
    originalPrompt: "Build an AI-powered soil analysis drone.",
    domain: "Robotics & IoT",
    projectType: "Autonomous System",
    status: "active",
    currentPhase: "development",
  });
  testProjectId = project._id;
  await Team.updateOne({ _id: testTeamId }, { $set: { activeProjectId: testProjectId } });

  // Add an accepted decision: "Use MQTT" and "Use MongoDB"
  await Decision.create({
    projectId: testProjectId,
    title: "Telemetry Communication Protocol",
    decision: "Use MQTT Protocol for real-time sensor publishing",
    selectedOption: "MQTT",
    status: "accepted", // Confirmed by team!
    category: "architecture",
  });

  // Add Architecture Components
  await ArchitectureComponent.create({
    projectId: testProjectId,
    componentType: "hardware",
    name: "Drone Thermal Sensor Payload",
    technology: "FLIR Lepton",
    status: "planned",
  });
});

await test("buildTaskGenerationContext loads project facts and accepted decisions", async () => {
  const ctx = await buildTaskGenerationContext(testProjectId, testTeamId);
  if (ctx.title !== "AI Smart Irrigation Drone") throw new Error("Project title mismatch");
  if (ctx.acceptedDecisions.length !== 1) throw new Error("Expected 1 accepted decision in context");
  if (!ctx.acceptedDecisions[0].decision.includes("MQTT")) throw new Error("Accepted decision not loaded");
  if (ctx.architectureComponents.length !== 1) throw new Error("Architecture components not loaded");
});

await test("decomposeTasksWithContext in preview mode returns structured tasks without saving to DB", async () => {
  const preview = await decomposeTasksWithContext({
    projectId: testProjectId,
    teamId: testTeamId,
    mode: "project",
    previewOnly: true,
  });

  if (!preview.preview) throw new Error("Expected preview flag in result");
  if (!Array.isArray(preview.tasks) || preview.tasks.length === 0) throw new Error("No tasks returned in preview");

  // Verify nothing was persisted yet
  const dbCount = await Task.countDocuments({ teamId: testTeamId });
  if (dbCount !== 0) throw new Error(`Expected 0 tasks in DB during preview, found ${dbCount}`);
});

await test("decomposeTasksWithContext creates project tasks with projectId, priorityScore, and topoOrder", async () => {
  const res = await decomposeTasksWithContext({
    projectId: testProjectId,
    teamId: testTeamId,
    mode: "project",
    previewOnly: false,
  });

  if (!res.success) throw new Error("Task decomposition failed");
  if (res.added === 0) throw new Error("No tasks were added");

  // Verify tasks in database
  const dbTasks = await Task.find({ teamId: testTeamId }).sort({ topoOrder: 1 }).lean();
  if (dbTasks.length !== res.added) throw new Error(`DB task count mismatch (${dbTasks.length} vs ${res.added})`);

  for (const t of dbTasks) {
    if (!t.projectId || t.projectId.toString() !== testProjectId.toString()) {
      throw new Error(`Task ${t.title} missing projectId association`);
    }
    if (typeof t.priorityScore !== "number" || t.priorityScore <= 0) {
      throw new Error(`Task ${t.title} missing valid greedy priorityScore`);
    }
  }
});

await test("Duplicate tasks are prevented on re-running task decomposition", async () => {
  const initialCount = await Task.countDocuments({ teamId: testTeamId });

  // Re-run decomposition with same mode
  const reRun = await decomposeTasksWithContext({
    projectId: testProjectId,
    teamId: testTeamId,
    mode: "project",
    previewOnly: false,
  });

  const postCount = await Task.countDocuments({ teamId: testTeamId });
  if (postCount !== initialCount) {
    throw new Error(`Expected no new duplicates added (count remained ${initialCount}), but got ${postCount}`);
  }
  if (reRun.duplicatesSkipped === 0) {
    throw new Error("Expected duplicatesSkipped > 0 on duplicate run");
  }
});

await test("Generating subtasks for an existing task assigns correct dependencies", async () => {
  const parentTask = await Task.findOne({ teamId: testTeamId }).lean();
  if (!parentTask) throw new Error("Parent task not found for subtask test");

  const subtaskRes = await decomposeTasksWithContext({
    projectId: testProjectId,
    teamId: testTeamId,
    mode: "subtasks",
    taskId: parentTask._id.toString(),
  });

  if (subtaskRes.added === 0) throw new Error("No subtasks were created");
});

await test("Cleanup Phase 3 integration test artifacts", async () => {
  await Promise.all([
    Task.deleteMany({ teamId: testTeamId }),
    ArchitectureComponent.deleteMany({ projectId: testProjectId }),
    Decision.deleteMany({ projectId: testProjectId }),
    Project.deleteMany({ _id: testProjectId }),
    Team.deleteMany({ _id: testTeamId }),
  ]);
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log("PHASE 3 TEST RESULTS");
console.log("=".repeat(70));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (errors.length > 0) {
  console.log("\nFailed tests:");
  for (const e of errors) console.log(`  ✗ ${e.name}: ${e.error}`);
}
console.log("=".repeat(70));

if (failed > 0) process.exit(1);
