/**
 * server/scripts/testAdaptiveMethodology.js
 * ============================================================================
 * NEXUSFLOW V4 — ADAPTIVE METHODOLOGY DRIFT MONITORING TESTS (Prompt 8)
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
import Task from "../models/Task.js";
import User from "../models/User.js";
import Sprint from "../models/Sprint.js";
import { analyzeMethodologyDrift } from "../services/methodologyDriftService.js";

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
  console.log("NEXUSFLOW V4 — ADAPTIVE METHODOLOGY DRIFT TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let testUser, testTeam, wfProject, scrumProject;

  try {
    testUser = await User.create({
      name: `Drift Tester ${ts}`,
      email: `drift_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Drift Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Drift Test Team",
    });

    // ── Test 1: Clean Waterfall Project (NORMAL)
    console.log("[TEST 1] Clean Waterfall project with no drift");
    wfProject = await Project.create({
      teamId: testTeam._id,
      title: "Clean Waterfall Project",
      methodology: "WATERFALL",
      waterfallPhase: "requirements",
    });

    await Task.create([
      { projectId: wfProject._id, teamId: testTeam._id, title: "Draft Requirements", status: "in_progress", phase: "requirements" },
      { projectId: wfProject._id, teamId: testTeam._id, title: "Review Requirements", status: "todo", phase: "requirements" },
      { projectId: wfProject._id, teamId: testTeam._id, title: "System Architecture", status: "todo", phase: "design" },
    ]);

    const cleanResult = await analyzeMethodologyDrift(wfProject._id);
    assert(cleanResult.driftState === "NORMAL", `Clean project is NORMAL (got ${cleanResult.driftState})`);
    assert(cleanResult.driftScore === 0, `Clean project score is 0 (got ${cleanResult.driftScore})`);
    assert(cleanResult.mutatesState === false, "Analysis explicitly reports mutatesState = false");
    assert(cleanResult.deterministic === true, "Analysis is deterministic");

    // ── Test 2: Waterfall Project with Phase Violation Drift
    console.log("\n[TEST 2] Waterfall project with phase violation drift");
    // Add out-of-phase active tasks: current phase is requirements, but implementation & testing are in progress
    await Task.create([
      { projectId: wfProject._id, teamId: testTeam._id, title: "Build Database Backend", status: "in_progress", phase: "implementation" },
      { projectId: wfProject._id, teamId: testTeam._id, title: "Integration Testing", status: "in_progress", phase: "testing" },
      { projectId: wfProject._id, teamId: testTeam._id, title: "Deploy to Prod", status: "in_progress", phase: "deployment" },
    ]);

    const driftResult = await analyzeMethodologyDrift(wfProject._id);
    assert(driftResult.driftScore >= 20, `Drift score increased due to phase violations (${driftResult.driftScore})`);
    assert(driftResult.driftState === "WATCH" || driftResult.driftState === "DRIFT", `Drift state elevated to ${driftResult.driftState}`);
    const phaseIndicator = driftResult.indicators.find(i => i.area === "phase_violation");
    assert(Boolean(phaseIndicator), "phase_violation indicator detected");
    assert(phaseIndicator.severity === "high", "phase_violation indicator has high severity");

    // ── Test 3: Non-mutation Verification
    console.log("\n[TEST 3] Verify drift analysis does NOT mutate project state");
    const projCheck = await Project.findById(wfProject._id).lean();
    assert(projCheck.methodology === "WATERFALL", "Project methodology remains WATERFALL (no auto-switch)");
    assert(projCheck.waterfallPhase === "requirements", "Waterfall phase remains unchanged");

    // ── Test 4: Scrum Project with Unsprinted Work
    console.log("\n[TEST 4] Scrum project with unsprinted active work");
    const scrumTeam = await Team.create({
      name: `Drift Scrum Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Scrum Team",
    });

    scrumProject = await Project.create({
      teamId: scrumTeam._id,
      title: "Scrum Drift Project",
      methodology: "SCRUM",
    });

    // Create tasks working in-progress without sprint assignment
    await Task.create([
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Rogue Task 1", status: "in_progress", sprintId: null },
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Rogue Task 2", status: "in_progress", sprintId: null },
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Rogue Task 3", status: "in_progress", sprintId: null },
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Normal Backlog Task", status: "todo", sprintId: null },
    ]);

    const scrumDrift = await analyzeMethodologyDrift(scrumProject._id);
    assert(scrumDrift.driftScore >= 15, `Scrum drift detected (${scrumDrift.driftScore})`);
    const unsprintedInd = scrumDrift.indicators.find(i => i.area === "unsprint_work");
    assert(Boolean(unsprintedInd), "unsprint_work indicator found");

    // ── Test 5: High Blocker Ratio Signal
    console.log("\n[TEST 5] High blocker ratio triggers blocked_work indicator");
    await Task.create([
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Blocked Task 1", status: "todo", isBlocked: true },
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Blocked Task 2", status: "todo", isBlocked: true },
      { projectId: scrumProject._id, teamId: scrumTeam._id, title: "Blocked Task 3", status: "in_progress", isBlocked: true },
    ]);

    const blockerDrift = await analyzeMethodologyDrift(scrumProject._id);
    const blockedInd = blockerDrift.indicators.find(i => i.area === "blocked_work");
    assert(Boolean(blockedInd), "blocked_work indicator detected when > 30% blocked");
    assert(blockerDrift.driftScore >= 30, `Cumulative drift score reflects multiple deviations (${blockerDrift.driftScore})`);

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) {
      await Team.deleteOne({ _id: testTeam._id });
      await Task.deleteMany({ teamId: testTeam._id });
    }
    if (scrumProject) {
      await Project.deleteOne({ _id: scrumProject._id });
      await Team.deleteOne({ _id: scrumProject.teamId });
      await Task.deleteMany({ teamId: scrumProject.teamId });
    }
    if (wfProject) await Project.deleteOne({ _id: wfProject._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`ADAPTIVE DRIFT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
