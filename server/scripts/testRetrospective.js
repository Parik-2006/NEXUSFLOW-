/**
 * server/scripts/testRetrospective.js
 * NEXUSFLOW 3.0 — Phase 15 Validation: AI Sprint Retrospective
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
import Retrospective from "../models/Retrospective.js";
import { generateRetrospective } from "../services/retrospectiveService.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: SPRINT RETROSPECTIVE VALIDATION SUITE");
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
    const user = await User.create({ name: "Retro Lead", email: `retro_${Date.now()}@test.com`, password: "password123" });
    const team = await Team.create({
      name: `Retro Team ${Date.now()}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });
    const project = await Project.create({ teamId: team._id, title: "Retro Test Project", status: "active" });

    await Task.insertMany([
      { teamId: team._id, projectId: project._id, title: "Task 1", status: "done",        estimatedHours: 8, assignedTo: user._id },
      { teamId: team._id, projectId: project._id, title: "Task 2", status: "done",        estimatedHours: 4, assignedTo: user._id },
      { teamId: team._id, projectId: project._id, title: "Task 3", status: "in_progress", estimatedHours: 6, assignedTo: user._id },
    ]);

    console.log("\n[TEST 1] Generating Retrospective via Service...");
    const retro = await generateRetrospective({
      projectId: project._id,
      teamId: team._id,
      sprintName: "Sprint 1 — Alpha Release",
    });

    assert(!!retro._id, "Retrospective generated successfully");
    assert(retro.sprintName === "Sprint 1 — Alpha Release", "Sprint name matches input");
    assert(!!retro.taskStats, "taskStats object exists");
    assert(retro.taskStats.total === 3, `Total tasks counted: ${retro.taskStats.total}`);
    assert(retro.taskStats.completed === 2, `Completed tasks counted: ${retro.taskStats.completed}`);
    assert(retro.taskStats.completionRate === 67, `Completion rate is 67%: ${retro.taskStats.completionRate}`);
    assert(Array.isArray(retro.analysis?.wentWell), "wentWell list exists");
    assert(Array.isArray(retro.analysis?.wentPoorly), "wentPoorly list exists");
    assert(Array.isArray(retro.analysis?.recommendations), "recommendations list exists");
    assert(["ai", "deterministic"].includes(retro.generatedBy), `Generator method valid: ${retro.generatedBy}`);

    console.log("\n[TEST 2] Testing User Acknowledgement...");
    await Retrospective.findByIdAndUpdate(retro._id, { $addToSet: { acknowledgedBy: user._id } });
    const updated = await Retrospective.findById(retro._id).lean();
    assert(updated.acknowledgedBy.some((id) => id.toString() === user._id.toString()), "User A recorded in acknowledgedBy");

    await Task.deleteMany({ projectId: project._id });
    await Retrospective.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

    console.log("\n========================================================");
    console.log(`   SPRINT RETROSPECTIVE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
