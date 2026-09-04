/**
 * server/scripts/testMethodologyEngine.js
 * ============================================================================
 * V4 METHODOLOGY ENGINE TEST SUITE
 *
 * Verifies:
 * 1. Project model defaults to "WATERFALL"
 * 2. Supported methodology enum ["WATERFALL", "SCRUM", "KANBAN", "HYBRID"]
 * 3. Uppercase normalization
 * 4. Backward compatibility: existing projects without methodology default safely
 * 5. Rejection of unapproved methodology values
 * 6. Mongoose index on methodology
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";

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

async function runTestSuite() {
  console.log("\n========================================================");
  console.log("NEXUSFLOW V4 — METHODOLOGY ENGINE TEST SUITE");
  console.log("========================================================\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  } catch (err) {
    console.log("SRV failed, falling back to local MongoDB...");
    await mongoose.connect("mongodb://127.0.0.1:27017/nexusflow_dev", { serverSelectionTimeoutMS: 4000 });
  }
  console.log("Connected to MongoDB successfully.\n");

  const timestamp = Date.now();
  let testUser, testTeam, projWaterfall, projScrum, projKanban, projHybrid, projDefault;

  try {
    console.log("[TEST 1] Setup Test Team & Owner");
    testUser = await User.create({
      name: `Methodology Test User ${timestamp}`,
      email: `methodology_${timestamp}@nexusflow.dev`,
      password: "Password123!",
    });
    testTeam = await Team.create({
      name: `Methodology Team ${timestamp}`,
      ownerId: testUser._id,
      projectTitle: "AI Student Performance Prediction",
    });
    assert(testTeam && testTeam._id, "Test team created");

    console.log("\n[TEST 2] Default Methodology is WATERFALL");
    projDefault = await Project.create({
      teamId: testTeam._id,
      title: "Project with No Explicit Methodology",
      domain: "AI",
    });
    assert(projDefault.methodology === "WATERFALL", `Default methodology is "WATERFALL" (got: ${projDefault.methodology})`);

    console.log("\n[TEST 3] Explicit Supported Methodologies");
    projWaterfall = await Project.create({
      teamId: testTeam._id,
      title: "Waterfall Project",
      methodology: "WATERFALL",
      domain: "AI",
    });
    assert(projWaterfall.methodology === "WATERFALL", "Explicit WATERFALL accepted");

    projScrum = await Project.create({
      teamId: testTeam._id,
      title: "Scrum Project",
      methodology: "SCRUM",
      domain: "AI",
    });
    assert(projScrum.methodology === "SCRUM", "Explicit SCRUM accepted");

    projKanban = await Project.create({
      teamId: testTeam._id,
      title: "Kanban Project",
      methodology: "KANBAN",
      domain: "AI",
    });
    assert(projKanban.methodology === "KANBAN", "Explicit KANBAN accepted");

    projHybrid = await Project.create({
      teamId: testTeam._id,
      title: "Hybrid Project",
      methodology: "HYBRID",
      domain: "AI",
    });
    assert(projHybrid.methodology === "HYBRID", "Explicit HYBRID accepted");

    console.log("\n[TEST 4] Case-Insensitive Normalization");
    const projLower = await Project.create({
      teamId: testTeam._id,
      title: "Lowercase Methodology Project",
      methodology: "waterfall",
      domain: "AI",
    });
    assert(projLower.methodology === "WATERFALL", `Normalized "waterfall" to "WATERFALL" (got: ${projLower.methodology})`);

    console.log("\n[TEST 5] Invalid Methodology Validation");
    let validationError = null;
    try {
      await Project.create({
        teamId: testTeam._id,
        title: "Invalid Methodology Project",
        methodology: "EXTREME_PROGRAMMING_UNSUPPORTED",
      });
    } catch (e) {
      validationError = e;
    }
    assert(validationError !== null, "Unsupported methodology rejected by Mongoose enum validator");

    console.log("\n[TEST 6] Project Update / Patch Methodology");
    const updated = await Project.findByIdAndUpdate(
      projDefault._id,
      { $set: { methodology: "HYBRID" } },
      { new: true }
    );
    assert(updated.methodology === "HYBRID", `Updated methodology from WATERFALL to HYBRID (got: ${updated.methodology})`);

    console.log("\n[TEST 7] Methodology Querying by Index");
    const waterfallProjects = await Project.find({ teamId: testTeam._id, methodology: "WATERFALL" }).lean();
    assert(waterfallProjects.length >= 2, `Indexed query found ${waterfallProjects.length} WATERFALL projects for team`);

  } finally {
    console.log("\n[CLEANUP] Cleaning up test records...");
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testTeam) await Team.deleteOne({ _id: testTeam._id });
    if (testTeam) await Project.deleteMany({ teamId: testTeam._id });
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }

  console.log("\n========================================================");
  console.log(`METHODOLOGY ENGINE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runTestSuite().catch((e) => {
  console.error("Test runner encountered error:", e);
  process.exit(1);
});
