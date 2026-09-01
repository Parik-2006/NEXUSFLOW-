/**
 * server/scripts/testTeamHealth.js
 * NEXUSFLOW 3.0 — Phase 12 Validation: Team Health Scoring Engine
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import TeamHealth from "../models/TeamHealth.js";
import { computeTeamHealth } from "../services/teamHealth.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: TEAM HEALTH VALIDATION SUITE");
  console.log("========================================================\n");

  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected to MongoDB.");

  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) { console.log(`  ✓ PASS: ${name}`); passed++; }
    else { console.error(`  ✗ FAIL: ${name}`); failed++; }
  }

  try {
    const user = await User.create({
      name: "Health Test Lead",
      email: `health_${Date.now()}@test.com`,
      password: "password123",
    });

    const team = await Team.create({
      name: `Health Team ${Date.now()}`,
      ownerId: user._id,
      members: [
        { userId: user._id, name: user.name, role: "leader", capacity: 40 },
      ],
    });

    const project = await Project.create({
      teamId: team._id,
      title: "Health Test Project",
      status: "active",
    });

    await Task.insertMany([
      { teamId: team._id, projectId: project._id, title: "Done Task 1", status: "done", estimatedHours: 8 },
      { teamId: team._id, projectId: project._id, title: "Done Task 2", status: "done", estimatedHours: 4 },
      { teamId: team._id, projectId: project._id, title: "In Progress Task", status: "in_progress", estimatedHours: 6, assignedTo: user._id, requiredSkills: ["javascript"] },
    ]);

    console.log("\n[TEST 1] Computing Team Health Snapshot...");
    const health = await computeTeamHealth(project._id.toString());

    assert(health !== null, "Health snapshot computed successfully");
    assert(health.score >= 0 && health.score <= 100, `Score is within 0-100: ${health.score}`);
    assert(["A", "B", "C", "D", "F"].includes(health.grade), `Grade is valid letter grade: ${health.grade}`);
    assert(health.dimensions !== null, "Health dimensions object exists");
    assert(typeof health.dimensions?.taskCompletion?.score === "number", `Task completion score: ${health.dimensions?.taskCompletion?.score}`);
    assert(typeof health.dimensions?.workloadBalance?.score === "number", `Workload balance score: ${health.dimensions?.workloadBalance?.score}`);
    assert(typeof health.dimensions?.blockedTasks?.score === "number", `Blocked tasks score: ${health.dimensions?.blockedTasks?.score}`);
    assert(typeof health.dimensions?.skillCoverage?.score === "number", `Skill coverage score: ${health.dimensions?.skillCoverage?.score}`);
    assert(Array.isArray(health.strengths), "Strengths array exists");
    assert(Array.isArray(health.warnings), "Warnings array exists");

    console.log("\n[TEST 2] Verifying MongoDB persistence...");
    const persisted = await TeamHealth.findById(health._id).lean();
    assert(!!persisted, "Health document persisted in MongoDB");
    assert(persisted.score === health.score, "Persisted score matches computed score");

    await Task.deleteMany({ projectId: project._id });
    await TeamHealth.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

    console.log("\n========================================================");
    console.log(`   TEAM HEALTH TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("========================================================\n");
  } catch (err) {
    console.error("Test error:", err);
    failed++;
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
