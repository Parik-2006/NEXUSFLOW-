/**
 * server/scripts/testLearningLoop.js
 * NEXUSFLOW 3.0 — Phase 16 Validation: Learning Loop Insight Engine
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
import LearningInsight from "../models/LearningInsight.js";
import { generateInsights } from "../services/learningService.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: LEARNING LOOP VALIDATION SUITE");
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
    const user = await User.create({ name: "Insights Lead", email: `insights_${Date.now()}@test.com`, password: "password123" });
    const team = await Team.create({
      name: `Insights Team ${Date.now()}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });
    const project = await Project.create({ teamId: team._id, title: "Insights Test Project", status: "active" });

    const past = new Date(Date.now() - 15 * 86_400_000);
    const pastDue = new Date(Date.now() - 16 * 86_400_000);

    // Seed historical tasks (6 Backend category, all late)
    for (let i = 0; i < 6; i++) {
      await Task.create({
        teamId: team._id,
        projectId: project._id,
        title: `Backend Task ${i + 1}`,
        status: "done",
        category: "Backend",
        estimatedHours: 1,
        actualHours: 18,
        dueDate: pastDue,
        updatedAt: past,
      });
    }

    // Seed 2 retrospectives with low completion
    await Retrospective.insertMany([
      {
        projectId: project._id,
        teamId: team._id,
        sprintName: "Sprint 1",
        taskStats: { total: 10, completed: 4, completionRate: 40 },
        analysis: { wentWell: [], wentPoorly: [], recommendations: [], bottlenecks: [], risks: [], suggestedImprovements: [], summary: "" },
        generatedBy: "deterministic",
      },
      {
        projectId: project._id,
        teamId: team._id,
        sprintName: "Sprint 2",
        taskStats: { total: 10, completed: 6, completionRate: 60 },
        analysis: { wentWell: [], wentPoorly: [], recommendations: [], bottlenecks: [], risks: [], suggestedImprovements: [], summary: "" },
        generatedBy: "deterministic",
      },
    ]);

    console.log("\n[TEST 1] Running Learning Pattern Engine...");
    const insights = await generateInsights(project._id.toString(), team._id.toString());

    assert(Array.isArray(insights), "Insights returned as an array");
    assert(insights.length >= 2, `Generated ${insights.length} learning insight(s)`);

    const types = insights.map((i) => i.type);
    console.log("  Detected learning insight types:", types);

    assert(types.includes("sprint_velocity"), "Identified sprint velocity pattern from retro history");
    assert(types.includes("deadline_accuracy") || types.includes("task_duration"), "Identified task timing / duration pattern");

    for (const insight of insights) {
      assert(typeof insight.insight === "string" && insight.insight.length > 10, `Insight has clear statement: "${insight.insight}"`);
      assert(typeof insight.recommendation === "string" && insight.recommendation.length > 5, `Insight has actionable recommendation: "${insight.recommendation}"`);
      assert(insight.confidence >= 0 && insight.confidence <= 1, `Insight has valid confidence: ${insight.confidence}`);
      assert(insight.evidence !== null && typeof insight.evidence === "object", "Insight is backed by concrete evidence object");
    }

    await Task.deleteMany({ projectId: project._id });
    await Retrospective.deleteMany({ projectId: project._id });
    await LearningInsight.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

    console.log("\n========================================================");
    console.log(`   LEARNING LOOP TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
