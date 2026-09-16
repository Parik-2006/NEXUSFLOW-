/**
 * server/scripts/testWhatIfSimulation.js
 * ============================================================================
 * NEXUSFLOW V4 — WHAT-IF SIMULATION SANDBOX TESTS (Prompt 9)
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
import { getSimulationBaseline, runSimulation } from "../services/simulationEngine.js";

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
  console.log("NEXUSFLOW V4 — WHAT-IF SIMULATION ENGINE TESTS");
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
      name: `Simulation Tester ${ts}`,
      email: `sim_${ts}@test.dev`,
      password: "Password123!",
    });

    testTeam = await Team.create({
      name: `Simulation Team ${ts}`,
      ownerId: testUser._id,
      projectTitle: "Simulation Team",
      members: [
        { userId: testUser._id, role: "Lead", capacityHoursPerWeek: 40 },
      ],
    });

    testProject = await Project.create({
      teamId: testTeam._id,
      title: "Simulation Sandbox Project",
      methodology: "SCRUM",
    });

    // Create a chain of tasks with dependencies to establish a critical path
    const taskA = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task A: Architecture",
      status: "done",
      estimatedHours: 10,
    });

    const taskB = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task B: API Backend",
      status: "in_progress",
      estimatedHours: 20,
      dependencies: [taskA._id],
    });

    const taskC = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task C: Frontend UI",
      status: "todo",
      estimatedHours: 25,
      dependencies: [taskB._id],
    });

    const taskD = await Task.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      title: "Task D: Quality Assurance",
      status: "todo",
      estimatedHours: 15,
      dependencies: [taskC._id],
    });

    // ── Test 1: Baseline Metrics
    console.log("[TEST 1] Calculate project baseline metrics");
    const baseline = await getSimulationBaseline(testProject._id);
    assert(baseline.totalTasks === 4, "Baseline has 4 total tasks");
    assert(baseline.doneTasks === 1, "Baseline has 1 completed task");
    assert(baseline.remainingTasks === 3, "Baseline has 3 remaining tasks");
    assert(baseline.totalRemainingHours === 60, `Remaining hours calculated (got ${baseline.totalRemainingHours})`);
    assert(baseline.projectedDaysRemaining > 0, `Projected days calculated (${baseline.projectedDaysRemaining} days)`);
    assert(baseline.liveStateMutated === false, "Live state mutation flag is explicitly false");
    assert(baseline.criticalPath.length > 0, `Critical path identified (${baseline.criticalPath.length} tasks)`);

    // ── Test 2: Capacity Change Simulation
    console.log("\n[TEST 2] Capacity variation simulation");
    const reducedCap = await runSimulation(testProject._id, { capacityChange: -50, includeMonteCarlo: false });
    const increasedCap = await runSimulation(testProject._id, { capacityChange: 50, includeMonteCarlo: false });

    assert(
      reducedCap.simulated.projectedDays > increasedCap.simulated.projectedDays,
      `Reduced capacity takes longer (${reducedCap.simulated.projectedDays}d) than increased capacity (${increasedCap.simulated.projectedDays}d)`
    );
    assert(reducedCap.liveStateMutated === false, "Scenario run confirms zero mutation");
    assert(reducedCap.simulated.capacityPressure > increasedCap.simulated.capacityPressure, "Capacity pressure higher under reduced capacity");

    // ── Test 3: Scope Shock Simulation
    console.log("\n[TEST 3] Scope shock simulation (+4 tasks)");
    const scopeSim = await runSimulation(testProject._id, { scopeShock: 4, scopeShockHoursPerTask: 10, includeMonteCarlo: false });
    assert(scopeSim.simulated.remainingHours === baseline.totalRemainingHours + 40, "Scope addition accurately adds 40 hours");
    assert(scopeSim.delta.daysChange > 0, "Schedule variance increased due to scope shock");
    assert(scopeSim.scopeAffectedTasks.length === 4, "Affected tasks list includes 4 added tasks");

    // ── Test 4: Timeline Compression Simulation
    console.log("\n[TEST 4] Timeline compression simulation");
    const compressedSim = await runSimulation(testProject._id, { timelineCompression: 5, includeMonteCarlo: false });
    assert(compressedSim.scenario.timelineCompression === 5, "Timeline compression recorded in scenario");
    assert(Array.isArray(compressedSim.risks), "Risks assessed under compression");

    // ── Test 5: Monte Carlo Simulation
    console.log("\n[TEST 5] Monte Carlo probabilistic simulation (200 iterations)");
    const mcSim = await runSimulation(testProject._id, { includeMonteCarlo: true, monteCarloIterations: 200 });
    assert(Boolean(mcSim.monteCarlo), "Monte Carlo results object present");
    assert(mcSim.monteCarlo.iterations === 200, "Ran 200 iterations");
    const { p50, p75, p85, p95 } = mcSim.monteCarlo.completionDays;
    assert(p50 <= p75 && p75 <= p85 && p85 <= p95, `Percentile monotonicity holds: p50(${p50}) <= p75(${p75}) <= p85(${p85}) <= p95(${p95})`);
    assert(Array.isArray(mcSim.monteCarlo.distribution), "Distribution histogram data returned");

    // ── Test 6: Invariant Verification — Database untouched
    console.log("\n[TEST 6] Absolute non-destructive invariant check");
    const dbTasks = await Task.find({ projectId: testProject._id }).lean();
    assert(dbTasks.length === 4, "Task count in MongoDB remains exactly 4");
    const untouchedTaskA = dbTasks.find(t => t._id.toString() === taskA._id.toString());
    assert(untouchedTaskA.status === "done", "Task A status unaffected");
    const untouchedTaskB = dbTasks.find(t => t._id.toString() === taskB._id.toString());
    assert(untouchedTaskB.status === "in_progress", "Task B status unaffected");

    const dbProject = await Project.findById(testProject._id).lean();
    assert(dbProject.methodology === "SCRUM", "Project methodology untouched");

  } finally {
    console.log("\n[CLEANUP]");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testProject) await Project.deleteOne({ _id: testProject._id });
    if (testProject) await Task.deleteMany({ projectId: testProject._id });
    await mongoose.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log(`WHAT-IF SIMULATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});
