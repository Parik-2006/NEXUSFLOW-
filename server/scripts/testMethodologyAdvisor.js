/**
 * server/scripts/testMethodologyAdvisor.js
 * ============================================================================
 * NEXUSFLOW V4 — METHODOLOGY RECOMMENDATION ENGINE TEST SUITE (Prompt 7)
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
import {
  extractSignals,
  scoreMethodologies,
  generateRecommendation,
  recommendMethodology,
  selectMethodology,
} from "../services/methodologyAdvisor.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — METHODOLOGY RECOMMENDATION ENGINE TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let testUser, testTeam, testProject;

  try {
    testUser = await User.create({
      name: `Advisor Tester ${ts}`,
      email: `advisor_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Advisor Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Recommendation Test",
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Recommendation Sandbox",
      methodology: "CLASSIC",
      domain: "Web Application",
      context: {
        constraints: ["Frozen requirements", "Strict phase sign-offs required"],
        goals: ["Deliver fixed scope"],
        estimatedDurationDays: 120,
      },
      academicContext: "Final Year B.Tech Capstone",
    });

    // ── Test 1: Signal Extraction
    console.log("[TEST 1] Signal extraction from project context");
    const signals = extractSignals(testProject);
    assert(signals.requirementStability === "high", "High requirement stability detected");
    assert(signals.hasGovernance === true, "Governance requirement detected");
    assert(signals.isFinalYear === true, "Final year academic context detected");
    assert(signals.timelinePressure === "low", "Timeline pressure evaluated correctly");

    // ── Test 2: Scoring Matrix Determinism
    console.log("\n[TEST 2] Deterministic scoring matrix");
    const { scores, reasons } = scoreMethodologies(signals);
    assert(typeof scores.WATERFALL === "number" && scores.WATERFALL > 0, "Waterfall scored positively");
    assert(reasons.WATERFALL.length > 0, "Waterfall reasons populated");

    // ── Test 3: Recommendation Generation (Waterfall favored here)
    console.log("\n[TEST 3] Recommendation generation for waterfall-heavy signals");
    const rec = generateRecommendation(testProject);
    assert(rec.deterministic === true, "Flagged as deterministic");
    assert(rec.recommendation === "WATERFALL", `Recommended WATERFALL (got ${rec.recommendation})`);
    assert(rec.confidence > 0 && rec.confidence <= 95, `Confidence capped at 95% (got ${rec.confidence}%)`);
    assert(rec.reasons.length > 0, "Structured explanation reasons provided");

    // ── Test 4: Recommendation for Agile / Fast-paced Signals
    console.log("\n[TEST 4] Recommendation for agile / changing requirements");
    const agileRec = generateRecommendation({
      domain: "Mobile App",
      context: {
        constraints: ["Evolving requirements", "Rapid user feedback"],
        goals: ["Sprint iterations", "Iterative MVP release"],
      },
    }, { teamSize: 5 });
    assert(agileRec.recommendation === "SCRUM", `Recommended SCRUM for iterative context (got ${agileRec.recommendation})`);

    // ── Test 5: Recommendation for DevOps / Continuous Flow
    console.log("\n[TEST 5] Recommendation for DevOps continuous flow");
    const flowRec = generateRecommendation({
      domain: "DevOps Infrastructure",
      context: {
        constraints: ["No sprints"],
        goals: ["Continuous deployment", "Daily release"],
      },
    }, { teamSize: 2, timelinePressure: "extreme" });
    assert(flowRec.recommendation === "KANBAN", `Recommended KANBAN for continuous flow (got ${flowRec.recommendation})`);

    // ── Test 6: Persisting Recommendation to Project
    console.log("\n[TEST 6] Persist recommendation to DB project");
    const persisted = await recommendMethodology(testProject._id, {}, testUser._id, testUser.name);
    assert(persisted.recommendation === "WATERFALL", "Returned recommendation result");

    const refreshedProj = await Project.findById(testProject._id).lean();
    assert(refreshedProj.recommendedMethodology === "WATERFALL", "Project saved recommendedMethodology");
    assert(Array.isArray(refreshedProj.recommendationReasons), "Project saved recommendationReasons");
    assert(refreshedProj.recommendationScore > 0, "Project saved recommendationScore");

    // ── Test 7: User Methodology Selection (Override / Accept)
    console.log("\n[TEST 7] User methodology selection");
    const selection = await selectMethodology(testProject._id, "SCRUM", testUser._id, testUser.name);
    assert(selection.success === true, "Selection succeeded");
    assert(selection.previousMethodology === "CLASSIC", "Captured previous methodology");
    assert(selection.selectedMethodology === "SCRUM", "Recorded new selection");

    const afterSelect = await Project.findById(testProject._id).lean();
    assert(afterSelect.methodology === "SCRUM", "Project methodology updated to SCRUM");
    assert(afterSelect.userOverrodeRecommendation === true, "Flagged that user overrode recommendation");

    // ── Test 8: Invalid Methodology Selection Rejection
    console.log("\n[TEST 8] Reject invalid methodology selection");
    let caught = false;
    try {
      await selectMethodology(testProject._id, "INVALID_METHODOLOGY_XYZ", testUser._id);
    } catch (err) {
      caught = true;
      assert(err.message.includes("Invalid methodology"), "Error explains invalid methodology");
    }
    assert(caught, "Rejected invalid methodology");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) await Project.deleteOne({ _id: testProject._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`RECOMMENDATION ENGINE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
