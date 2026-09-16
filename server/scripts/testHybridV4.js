/**
 * server/scripts/testHybridV4.js
 * ============================================================================
 * NEXUSFLOW V4 — HYBRID METHODOLOGY ENGINE TEST SUITE (Prompt 6)
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { validateHybridConfig, configureHybrid, getHybridState, listHybridTemplates, getDefaultHybridConfig, HYBRID_TEMPLATES } from "../services/hybridEngine.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0, blocked = 0;

function assert(condition, message) {
  if (condition) { console.log(`  ✅ PASS: ${message}`); passed++; }
  else { console.error(`  ❌ FAIL: ${message}`); failed++; }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — HYBRID METHODOLOGY ENGINE TEST SUITE");
  console.log("=".repeat(60) + "\n");

  try { await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 }); }
  catch { await mongoose.connect("mongodb://127.0.0.1:27017/nexusflow_dev", { serverSelectionTimeoutMS: 4000 }); }
  console.log("Connected to MongoDB.\n");

  const ts = Date.now();
  let testUser, testTeam, testProject;

  try {
    // Setup
    testUser = await User.create({ name: `Hybrid Test ${ts}`, email: `hybrid_${ts}@test.dev`, password: "Test123!" });
    testTeam = await Team.create({ name: `Hybrid Team ${ts}`, ownerId: testUser._id, projectTitle: "Hybrid Test" });
    testProject = await Project.create({ teamId: testTeam._id, title: "Hybrid Test Project", methodology: "HYBRID", domain: "IoT" });

    // ── Test 1: Validation — Valid config
    console.log("[TEST 1] Valid hybrid configuration");
    const valid = validateHybridConfig({ planningMethodology: "WATERFALL", executionMethodology: "SCRUM", governanceMethodology: "WATERFALL" });
    assert(valid.valid === true, "Valid config passes validation");
    assert(valid.errors.length === 0, "No errors for valid config");

    // ── Test 2: Validation — Invalid config (missing fields)
    console.log("\n[TEST 2] Invalid config — missing fields");
    const invalid1 = validateHybridConfig({});
    assert(invalid1.valid === false, "Empty config rejected");
    assert(invalid1.errors.length > 0, "Errors returned for empty config");

    // ── Test 3: Validation — Incoherent combination
    console.log("\n[TEST 3] Incoherent combination rejected");
    const incoherent = validateHybridConfig({
      planningMethodology: "KANBAN",
      executionMethodology: "WATERFALL",
      governanceMethodology: "WATERFALL",
    });
    assert(incoherent.valid === false, "Kanban planning + Waterfall execution rejected");

    // ── Test 4: Validation — Null config
    console.log("\n[TEST 4] Null config rejected");
    const nullResult = validateHybridConfig(null);
    assert(nullResult.valid === false, "Null config rejected");

    // ── Test 5: Configure hybrid
    console.log("\n[TEST 5] Configure hybrid on project");
    const configResult = await configureHybrid({
      projectId: testProject._id,
      config: { planningMethodology: "WATERFALL", executionMethodology: "SCRUM", governanceMethodology: "WATERFALL" },
      userId: testUser._id,
      userName: testUser.name,
    });
    assert(configResult.success === true, "Hybrid configuration applied");
    assert(configResult.templateName === "waterfall_planning_scrum_execution", "Correct template identified");

    // ── Test 6: Persistence
    console.log("\n[TEST 6] Configuration persisted");
    const reloaded = await Project.findById(testProject._id).lean();
    assert(reloaded.methodology === "HYBRID", "Methodology set to HYBRID");
    assert(reloaded.hybridConfig !== null, "hybridConfig persisted");
    assert(reloaded.hybridConfig.planningMethodology === "WATERFALL", "Planning methodology persisted");
    assert(reloaded.hybridConfig.executionMethodology === "SCRUM", "Execution methodology persisted");

    // ── Test 7: State query
    console.log("\n[TEST 7] Hybrid state query");
    const state = await getHybridState(testProject._id);
    assert(state.isHybrid === true, "isHybrid flag true");
    assert(state.activeRules.length > 0, "Active rules returned");
    assert(state.methodologyBoundaries.planning === "WATERFALL", "Planning boundary correct");
    assert(state.methodologyBoundaries.execution === "SCRUM", "Execution boundary correct");

    // ── Test 8: Templates
    console.log("\n[TEST 8] Template listing");
    const templates = listHybridTemplates();
    assert(templates.length >= 5, `${templates.length} templates available`);
    assert(templates.some(t => t.id === "waterfall_planning_scrum_execution"), "Key template exists");

    // ── Test 9: Default config
    console.log("\n[TEST 9] Default hybrid config");
    const defaults = getDefaultHybridConfig();
    assert(defaults.planningMethodology === "WATERFALL", "Default planning is WATERFALL");
    assert(defaults.executionMethodology === "SCRUM", "Default execution is SCRUM");

    // ── Test 10: Invalid configure (should reject)
    console.log("\n[TEST 10] Invalid configuration rejected server-side");
    const badResult = await configureHybrid({
      projectId: testProject._id,
      config: { planningMethodology: "KANBAN", executionMethodology: "WATERFALL", governanceMethodology: "WATERFALL" },
      userId: testUser._id,
    });
    assert(badResult.success === false, "Incoherent config rejected by configureHybrid");

    // ── Test 11: Non-hybrid project state query
    console.log("\n[TEST 11] Non-hybrid project returns isHybrid=false");
    const waterfallProj = await Project.create({ teamId: testTeam._id, title: "Waterfall Project", methodology: "WATERFALL" });
    const wfState = await getHybridState(waterfallProj._id);
    assert(wfState.isHybrid === false, "Non-hybrid project returns isHybrid=false");
    await Project.deleteOne({ _id: waterfallProj._id });

    // ── Test 12: Warnings for unusual combinations
    console.log("\n[TEST 12] Warnings generated for unusual combinations");
    const warnResult = validateHybridConfig({
      planningMethodology: "SCRUM",
      executionMethodology: "KANBAN",
      governanceMethodology: "WATERFALL",
      reviewBehavior: "sprint_review",
    });
    assert(warnResult.valid === true, "Unusual but valid config accepted");
    assert(warnResult.warnings.length > 0, "Warnings generated for unusual combination");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testTeam) await Project.deleteMany({ teamId: testTeam._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`HYBRID ENGINE RESULTS: ${passed} PASSED, ${failed} FAILED, ${blocked} BLOCKED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => { console.error("Test error:", e); process.exit(1); });
