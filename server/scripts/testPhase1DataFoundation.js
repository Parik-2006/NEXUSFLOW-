/**
 * server/scripts/testPhase1DataFoundation.js
 * ============================================================================
 * PHASE 1 VERIFICATION SCRIPT — Tests that all new schemas and routes
 * are syntactically and structurally correct WITHOUT requiring a running
 * MongoDB instance (pure schema/validation tests).
 *
 * Also performs a live MongoDB test when MONGO_URI is available.
 *
 * Tests:
 *   1. Import all models without errors
 *   2. Validate Mongoose schema structures
 *   3. Test model validation rules (required fields, enum values, min/max)
 *   4. Test that Task.projectId is optional (existing code compatibility)
 *   5. Test that Team.activeProjectId is optional (existing code compatibility)
 *   6. Test compound index definitions on Project, Task
 *   7. [Live] Create, read, update, and delete a complete project lifecycle
 *   8. Verify routes/projects.js imports without errors
 *
 * USAGE:
 *   # Static tests only (no MongoDB needed)
 *   node scripts/testPhase1DataFoundation.js
 *
 *   # Full tests including live DB (requires MongoDB running)
 *   MONGO_URI=mongodb://localhost:27017/nexusflow_test node scripts/testPhase1DataFoundation.js
 * ============================================================================
 */

import mongoose from "mongoose";

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch((err) => {
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

// ── Section header ────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n[ ${title} ]`);
}

// ═════════════════════════════════════════════════════════════════════════════
// STATIC TESTS (No MongoDB connection required)
// ═════════════════════════════════════════════════════════════════════════════

section("1. Model Imports");

// These imports will throw if there are any module-level syntax errors
let Project, Decision, ResearchItem, Recommendation, ArchitectureComponent;
let Resource, AIConversation, AIMessage, Team, Task;

await test("Import Project model", async () => {
  ({ default: Project } = await import("../models/Project.js"));
  if (!Project) throw new Error("Project model is undefined after import");
});

await test("Import Decision model", async () => {
  ({ default: Decision } = await import("../models/Decision.js"));
});

await test("Import ResearchItem model", async () => {
  ({ default: ResearchItem } = await import("../models/ResearchItem.js"));
});

await test("Import Recommendation model", async () => {
  ({ default: Recommendation } = await import("../models/Recommendation.js"));
});

await test("Import ArchitectureComponent model", async () => {
  ({ default: ArchitectureComponent } = await import("../models/ArchitectureComponent.js"));
});

await test("Import Resource model", async () => {
  ({ default: Resource } = await import("../models/Resource.js"));
});

await test("Import AIConversation model", async () => {
  ({ default: AIConversation } = await import("../models/AIConversation.js"));
});

await test("Import AIMessage model", async () => {
  ({ default: AIMessage } = await import("../models/AIMessage.js"));
});

await test("Import Task model (existing, modified)", async () => {
  ({ default: Task } = await import("../models/Task.js"));
});

await test("Import Team model (existing, modified)", async () => {
  ({ default: Team } = await import("../models/Team.js"));
});

// ─────────────────────────────────────────────────────────────────────────────
section("2. Schema Structure Verification");
// ─────────────────────────────────────────────────────────────────────────────

test("Project schema has teamId field", () => {
  const path = Project.schema.path("teamId");
  if (!path) throw new Error("teamId field missing from Project schema");
  if (!path.options.required) throw new Error("teamId should be required");
});

test("Project schema has originalPrompt field", () => {
  const path = Project.schema.path("originalPrompt");
  if (!path) throw new Error("originalPrompt field missing from Project schema");
});

test("Project schema has embedded context (ProjectContextSchema)", () => {
  const path = Project.schema.path("context");
  if (!path) throw new Error("context field missing from Project schema");
  // Embedded sub-document should have nested paths
  const nested = Project.schema.path("context.problemStatement");
  if (!nested) throw new Error("context.problemStatement missing — embedded schema may be broken");
});

test("Project schema has status enum with correct values", () => {
  const path = Project.schema.path("status");
  const expected = ["ideation", "planning", "active", "on_hold", "completed", "cancelled"];
  for (const v of expected) {
    if (!path.enumValues.includes(v)) {
      throw new Error(`status enum missing value: "${v}"`);
    }
  }
});

test("Task schema has optional projectId field (Phase 1 backward compat)", () => {
  const path = Task.schema.path("projectId");
  if (!path) throw new Error("projectId field missing from Task schema");
  // Must NOT be required — that would break all existing task creation
  if (path.options.required) throw new Error("Task.projectId must NOT be required — would break legacy task creation");
  if (path.options.default !== null) throw new Error("Task.projectId default must be null");
});

test("Team schema has optional activeProjectId field (Phase 1 backward compat)", () => {
  const path = Team.schema.path("activeProjectId");
  if (!path) throw new Error("activeProjectId field missing from Team schema");
  if (path.options.required) throw new Error("Team.activeProjectId must NOT be required");
  if (path.options.default !== null) throw new Error("Team.activeProjectId default must be null");
});

test("Decision schema has correct status enum", () => {
  const path = Decision.schema.path("status");
  const expected = ["proposed", "accepted", "rejected", "superseded"];
  for (const v of expected) {
    if (!path.enumValues.includes(v)) throw new Error(`Decision.status missing enum: "${v}"`);
  }
});

test("ResearchItem schema has embeddingVector field (Phase 4 placeholder)", () => {
  const path = ResearchItem.schema.path("embeddingVector");
  if (!path) throw new Error("embeddingVector field missing — Phase 4 placeholder is required");
});

test("Recommendation schema has polymorphic recommendationType", () => {
  const path = Recommendation.schema.path("recommendationType");
  if (!path) throw new Error("recommendationType field missing");
  if (!path.enumValues.includes("technology")) throw new Error("Missing 'technology' enum value");
  if (!path.enumValues.includes("hardware"))   throw new Error("Missing 'hardware' enum value");
  if (!path.enumValues.includes("ai_model"))   throw new Error("Missing 'ai_model' enum value");
});

test("ArchitectureComponent schema has componentType field with all required types", () => {
  const path = ArchitectureComponent.schema.path("componentType");
  const required = ["frontend", "backend", "database", "ai_ml", "hardware"];
  for (const v of required) {
    if (!path.enumValues.includes(v)) throw new Error(`componentType missing enum: "${v}"`);
  }
});

test("Resource schema has metadata (Mixed) for polymorphic type-specific data", () => {
  const path = Resource.schema.path("metadata");
  if (!path) throw new Error("metadata field missing from Resource schema");
  // Mixed type means instanceof is mongoose.Schema.Types.Mixed
});

test("AIMessage schema has required role enum", () => {
  const path = AIMessage.schema.path("role");
  if (!path) throw new Error("role field missing from AIMessage schema");
  const expected = ["user", "assistant", "system"];
  for (const v of expected) {
    if (!path.enumValues.includes(v)) throw new Error(`AIMessage.role missing enum: "${v}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
section("3. Index Definitions");
// ─────────────────────────────────────────────────────────────────────────────

test("Project has compound index: teamId + createdAt", () => {
  const indexes = Project.schema.indexes();
  const hasIndex = indexes.some(([keys]) =>
    keys.teamId !== undefined && keys.createdAt !== undefined
  );
  if (!hasIndex) throw new Error("Project is missing teamId + createdAt compound index");
});

test("Task has project-scoped priorityScore index (Phase 1 new)", () => {
  const indexes = Task.schema.indexes();
  const hasIndex = indexes.some(([keys]) =>
    keys.projectId !== undefined && keys.priorityScore !== undefined
  );
  if (!hasIndex) throw new Error("Task missing projectId + priorityScore compound index");
});

test("Task has project-scoped topoOrder index (Phase 1 new)", () => {
  const indexes = Task.schema.indexes();
  const hasIndex = indexes.some(([keys]) =>
    keys.projectId !== undefined && keys.topoOrder !== undefined
  );
  if (!hasIndex) throw new Error("Task missing projectId + topoOrder compound index");
});

test("Task still has original team-scoped priorityScore index (unchanged)", () => {
  const indexes = Task.schema.indexes();
  const hasIndex = indexes.some(([keys]) =>
    keys.teamId !== undefined && keys.priorityScore !== undefined
  );
  if (!hasIndex) throw new Error("Task lost original teamId + priorityScore compound index — BREAKING CHANGE");
});

// ─────────────────────────────────────────────────────────────────────────────
section("4. Validation Rules");
// ─────────────────────────────────────────────────────────────────────────────

test("Project requires title (validation check)", async () => {
  const p = new Project({ teamId: new mongoose.Types.ObjectId() });
  try {
    await p.validate();
    throw new Error("Should have thrown validation error for missing title");
  } catch (e) {
    if (!e.errors?.title) throw new Error(`Expected title validation error, got: ${e.message}`);
  }
});

test("Project requires teamId (validation check)", async () => {
  const p = new Project({ title: "Test Project" });
  try {
    await p.validate();
    throw new Error("Should have thrown validation error for missing teamId");
  } catch (e) {
    if (!e.errors?.teamId) throw new Error(`Expected teamId validation error, got: ${e.message}`);
  }
});

test("ResearchItem rejects invalid relevance values (< 1 or > 5)", async () => {
  const item = new ResearchItem({
    projectId: new mongoose.Types.ObjectId(),
    title:     "Test",
    relevance: 10,  // out of range
  });
  try {
    await item.validate();
    throw new Error("Should have thrown validation error for relevance=10");
  } catch (e) {
    if (!e.errors?.relevance) throw new Error(`Expected relevance validation error, got: ${e.message}`);
  }
});

test("AIMessage rejects invalid role values", async () => {
  const msg = new AIMessage({
    conversationId: new mongoose.Types.ObjectId(),
    projectId:      new mongoose.Types.ObjectId(),
    role:           "invalid_role",
    content:        "test",
  });
  try {
    await msg.validate();
    throw new Error("Should have thrown validation error for invalid role");
  } catch (e) {
    if (!e.errors?.role) throw new Error(`Expected role validation error, got: ${e.message}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
section("5. Backward Compatibility Guards");
// ─────────────────────────────────────────────────────────────────────────────

test("Task can be created without projectId (legacy task simulation)", async () => {
  const task = new Task({
    teamId:      new mongoose.Types.ObjectId(),
    title:       "Legacy Task",
    description: "This task has no projectId",
    status:      "todo",
    urgency:     3,    // 1-5, valid
    impact:      4,    // 1-5, valid (was 7 which is > max:5)
    assignedTo:  null, // ObjectId field — cannot be a string
    dependencies: [],
  });
  await task.validate(); // Must NOT throw
  if (task.projectId !== null) throw new Error(`Expected projectId=null, got: ${task.projectId}`);
});

test("Team can be created without activeProjectId (legacy team simulation)", async () => {
  const team = new Team({
    name:    "Legacy Team",
    password: "test",
    members: [],
  });
  await team.validate(); // Must NOT throw
  if (team.activeProjectId !== null) {
    throw new Error(`Expected activeProjectId=null, got: ${team.activeProjectId}`);
  }
});

test("Existing Team fields still exist: projectTitle, projectDescription", () => {
  if (!Team.schema.path("projectTitle"))      throw new Error("Team.projectTitle was removed — BREAKING CHANGE");
  if (!Team.schema.path("projectDescription")) throw new Error("Team.projectDescription was removed — BREAKING CHANGE");
});

test("Existing Task fields still exist: priorityScore, topoOrder, dependencies", () => {
  if (!Task.schema.path("priorityScore"))  throw new Error("Task.priorityScore was removed — BREAKING CHANGE");
  if (!Task.schema.path("topoOrder"))      throw new Error("Task.topoOrder was removed — BREAKING CHANGE");
  if (!Task.schema.path("dependencies"))   throw new Error("Task.dependencies was removed — BREAKING CHANGE");
});

// ─────────────────────────────────────────────────────────────────────────────
section("6. Routes Import");
// ─────────────────────────────────────────────────────────────────────────────

await test("Import routes/projects.js without errors", async () => {
  // This validates that all imports inside projects.js resolve correctly
  // (without starting the express server)
  const mod = await import("../routes/projects.js");
  if (!mod.default) throw new Error("projects.js does not export a default Router");
});

// ═════════════════════════════════════════════════════════════════════════════
// LIVE MONGODB TESTS (Only when MONGO_URI is provided)
// ═════════════════════════════════════════════════════════════════════════════

const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
  console.log(`\n[ Live MongoDB Tests — ${MONGO_URI} ]`);
  console.log("  (These tests write to and read from the actual database)");

  await mongoose.connect(MONGO_URI);
  console.log("  ✓ MongoDB connected");

  // Create a test team for all live tests
  let testTeamId, testProjectId, testDecisionId, testResearchId, testRecId,
      testCompId, testResourceId, testConvId, testMsgId;

  await test("Live: Create a test Team document", async () => {
    const team = await Team.create({
      name:               "Phase1TestTeam_" + Date.now(),
      password:           "test",
      projectTitle:       "Smart Irrigation System",
      projectDescription: "An IoT system that monitors soil moisture and automates irrigation using ESP32 and ML.",
      members:            [{ name: "Alice", role: "Full Stack", skillLevel: "Intermediate" }],
    });
    testTeamId = team._id;
    if (!testTeamId) throw new Error("Team was not created");
  });

  await test("Live: Create a Project document", async () => {
    const project = await Project.create({
      teamId:         testTeamId,
      title:          "Smart Irrigation System",
      description:    "IoT + ML system for automated irrigation",
      originalPrompt: "Build an AI irrigation system using ESP32 that detects soil moisture and controls pumps",
      domain:         "IoT",
      projectType:    "Smart Agriculture",
      academicContext: "Final Year Project",
      teamSize:       3,
      sprintWeeks:    8,
      status:         "active",
      currentPhase:   "planning",
      context: {
        problemStatement: "Farmers waste water due to manual, uninformed irrigation decisions",
        targetUsers:      ["Small-scale farmers", "Agricultural extension officers"],
        goals:            ["Reduce water usage by 30%", "Alert farmers via SMS"],
        hardwareRequirements: ["ESP32", "Soil moisture sensor YL-69", "5V relay module"],
        softwareRequirements: ["Node.js backend", "React Native dashboard"],
        aiMlRequirements:     ["LSTM soil moisture prediction model"],
        integrations:         ["OpenWeatherMap API", "Twilio SMS"],
        budgetUsd:            150,
        estimatedDurationDays: 60,
        preferredStack:       ["Python", "TensorFlow Lite", "MongoDB"],
        extractedBy:          "manual",
      },
    });
    testProjectId = project._id;
    if (!testProjectId) throw new Error("Project was not created");
    if (!project.context.problemStatement) throw new Error("ProjectContext was not saved");
  });

  await test("Live: Team.activeProjectId update works", async () => {
    await Team.updateOne({ _id: testTeamId }, { $set: { activeProjectId: testProjectId } });
    const team = await Team.findById(testTeamId).lean();
    if (!team.activeProjectId) throw new Error("Team.activeProjectId was not set");
    if (String(team.activeProjectId) !== String(testProjectId)) {
      throw new Error("Team.activeProjectId does not match created project");
    }
  });

  await test("Live: Create a Task with projectId", async () => {
    const task = await Task.create({
      teamId:      testTeamId,
      projectId:   testProjectId,
      title:       "Implement soil moisture sensor API endpoint",
      description: "Create REST endpoint that receives ESP32 sensor readings",
      status:      "todo",
      urgency:     5,    // 1-5 valid (high urgency)
      impact:      4,    // 1-5 valid
      assignedTo:  null, // ObjectId ref, not a string
    });
    if (!task.projectId) throw new Error("Task.projectId was not saved");
    if (!task.priorityScore || task.priorityScore === 0) throw new Error("pre-save hook did not compute priorityScore");
  });

  await test("Live: Create a Decision document", async () => {
    const decision = await Decision.create({
      projectId:              testProjectId,
      title:                  "Database Technology Selection",
      decision:               "Use MongoDB as the primary database",
      reasoning:              "Flexible document model suits evolving sensor data schemas. Team has Mongoose experience.",
      alternativesConsidered: ["PostgreSQL", "Firebase Firestore"],
      selectedOption:         "MongoDB",
      category:               "database",
      source:                 "manual",
      confidence:             0.9,
      status:                 "accepted",
    });
    testDecisionId = decision._id;
    if (!testDecisionId) throw new Error("Decision was not created");
  });

  await test("Live: Create a ResearchItem document", async () => {
    const item = await ResearchItem.create({
      projectId:  testProjectId,
      title:      "Soil Moisture Prediction using LSTM Networks",
      source:     "paper",
      abstract:   "This paper proposes LSTM-based prediction for smart irrigation with 94% accuracy.",
      topics:     ["LSTM", "soil moisture", "precision agriculture"],
      relevance:  5,
      notes:      "Architecture from section 3 is very relevant. Should adapt for ESP32.",
      status:     "reading",
    });
    testResearchId = item._id;
    if (!testResearchId) throw new Error("ResearchItem was not created");
  });

  await test("Live: Create a Recommendation document", async () => {
    const rec = await Recommendation.create({
      projectId:          testProjectId,
      recommendationType: "library",
      recommendedItem:    "TensorFlow Lite",
      category:           "AI/ML Framework",
      reason:             "TFLite is optimised for ESP32 edge inference — matches hardware constraints.",
      confidence:         0.85,
      source:             "system",
      alternatives:       ["PyTorch Mobile", "Edge Impulse"],
      status:             "pending",
    });
    testRecId = rec._id;
    if (!testRecId) throw new Error("Recommendation was not created");
  });

  await test("Live: Create an ArchitectureComponent document", async () => {
    const comp = await ArchitectureComponent.create({
      projectId:     testProjectId,
      componentType: "hardware",
      name:          "ESP32 Sensor Node",
      description:   "Main IoT node — reads soil moisture, sends to backend via MQTT/WiFi",
      technology:    "ESP32-WROOM-32",
      supportingTools: ["Arduino IDE", "PlatformIO", "FreeRTOS"],
      status:        "planned",
    });
    testCompId = comp._id;
    if (!testCompId) throw new Error("ArchitectureComponent was not created");
  });

  await test("Live: Create a Resource document", async () => {
    const res = await Resource.create({
      projectId:        testProjectId,
      resourceType:     "api",
      name:             "OpenWeatherMap API",
      description:      "Provides real-time weather data for irrigation scheduling decisions",
      url:              "https://openweathermap.org/api",
      accessType:       "freemium",
      estimatedCostUsd: 0,
      metadata: {
        apiKeyRequired:    true,
        rateLimitPerMin:   60,
        dataFields:        ["temperature", "humidity", "rainfall"],
      },
      status: "identified",
    });
    testResourceId = res._id;
    if (!testResourceId) throw new Error("Resource was not created");
  });

  await test("Live: Create an AIConversation document", async () => {
    const conv = await AIConversation.create({
      projectId: testProjectId,
      title:     "Initial Project Onboarding",
      topic:     "project_onboarding",
      status:    "active",
    });
    testConvId = conv._id;
    if (!testConvId) throw new Error("AIConversation was not created");
  });

  await test("Live: Create AIMessage documents in the conversation", async () => {
    const [userMsg, assistantMsg] = await Promise.all([
      AIMessage.create({
        conversationId:  testConvId,
        projectId:       testProjectId,
        role:            "user",
        content:         "I want to build a smart irrigation system using ESP32",
        contextSnapshot: { phase: "idea", decisionsCount: 0 },
      }),
      AIMessage.create({
        conversationId:  testConvId,
        projectId:       testProjectId,
        role:            "assistant",
        content:         "Great idea! For a smart irrigation system with ESP32, you'll need soil moisture sensors, a relay to control the pump, and a WiFi-enabled backend...",
        contextSnapshot: { phase: "idea", decisionsCount: 0 },
        tokensUsed:      { prompt: 120, completion: 250, total: 370 },
      }),
    ]);
    testMsgId = userMsg._id;
    await AIConversation.updateOne({ _id: testConvId }, { $inc: { messageCount: 2 } });

    const conv = await AIConversation.findById(testConvId).lean();
    if (conv.messageCount !== 2) throw new Error(`Expected messageCount=2, got ${conv.messageCount}`);
  });

  await test("Live: Project/summary aggregation query works", async () => {
    const [taskCount, decisionCount, researchCount] = await Promise.all([
      Task.countDocuments({ projectId: testProjectId }),
      Decision.countDocuments({ projectId: testProjectId }),
      ResearchItem.countDocuments({ projectId: testProjectId }),
    ]);
    if (taskCount < 1)     throw new Error(`Expected at least 1 task, got ${taskCount}`);
    if (decisionCount < 1) throw new Error(`Expected at least 1 decision, got ${decisionCount}`);
    if (researchCount < 1) throw new Error(`Expected at least 1 research item, got ${researchCount}`);
  });

  await test("Live: Greedy sort query works by projectId", async () => {
    const tasks = await Task.find({ projectId: testProjectId })
      .sort({ priorityScore: -1 })
      .lean();
    if (tasks.length === 0) throw new Error("No tasks returned for project greedy sort query");
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  await test("Live: Cleanup — delete all test documents", async () => {
    await Promise.all([
      AIMessage.deleteMany({ projectId: testProjectId }),
      AIConversation.deleteMany({ projectId: testProjectId }),
      Resource.deleteMany({ projectId: testProjectId }),
      ArchitectureComponent.deleteMany({ projectId: testProjectId }),
      Recommendation.deleteMany({ projectId: testProjectId }),
      ResearchItem.deleteMany({ projectId: testProjectId }),
      Decision.deleteMany({ projectId: testProjectId }),
      Task.deleteMany({ projectId: testProjectId }),
      Project.deleteMany({ _id: testProjectId }),
      Team.deleteMany({ _id: testTeamId }),
    ]);
    // Verify cleanup
    const remaining = await Project.countDocuments({ _id: testProjectId });
    if (remaining !== 0) throw new Error("Test project was not deleted");
  });

  await mongoose.disconnect();
  console.log("\n  ✓ MongoDB disconnected");
}

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log("TEST RESULTS");
console.log("=".repeat(70));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (errors.length > 0) {
  console.log("\nFailed tests:");
  for (const e of errors) console.log(`  ✗ ${e.name}: ${e.error}`);
}
console.log("=".repeat(70));

if (failed > 0) process.exit(1);
