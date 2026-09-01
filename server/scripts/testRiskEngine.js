/**
 * server/scripts/testRiskEngine.js
 * NEXUSFLOW 3.0 — Phase 13 Validation: Risk Intelligence Engine
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
import Risk from "../models/Risk.js";
import { scanProjectRisks } from "../services/riskEngine.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: RISK INTELLIGENCE VALIDATION SUITE");
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
      name: "Risk Test User",
      email: `risk_${Date.now()}@test.com`,
      password: "password123",
      skills: ["javascript"],
    });

    const team = await Team.create({
      name: `Risk Team ${Date.now()}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: "Risk Test User", role: "leader", capacity: 20 }],
    });

    const project = await Project.create({
      teamId: team._id,
      title: "Risk Test Project",
      status: "active",
    });

    // Seed data to trigger specific risk categories
    const nearDue = new Date(Date.now() + 3 * 86_400_000); // 3 days from now
    await Task.insertMany([
      {
        teamId: team._id,
        projectId: project._id,
        title: "Critical Server Fix",
        status: "in_progress",
        assignedTo: user._id,
        estimatedHours: 18,
        dueDate: nearDue,
        requiredSkills: ["devops"],
      },
      {
        teamId: team._id,
        projectId: project._id,
        title: "Heavy ML Pipeline Construction",
        status: "in_progress",
        assignedTo: user._id,
        estimatedHours: 15,
        requiredSkills: ["ml"],
      },
      {
        teamId: team._id,
        projectId: project._id,
        title: "Integration Deployment",
        status: "todo",
        requiredSkills: ["devops"],
        dependencyCount: 1,
      },
    ]);

    console.log("\n[TEST 1] Running Deterministic Risk Scan...");
    const risks = await scanProjectRisks(project._id.toString());

    assert(Array.isArray(risks), "Risk scan returned array");
    assert(risks.length >= 2, `Detected ${risks.length} risk(s)`);

    const categories = risks.map((r) => r.category);
    console.log("  Detected risk categories:", categories);

    assert(categories.includes("deadline"), "Detected deadline proximity risk");
    assert(categories.includes("overload"), "Detected member workload overload risk");
    assert(categories.includes("blocked_tasks"), "Detected dependency blocked tasks risk");

    for (const risk of risks) {
      assert(typeof risk.evidence === "string" && risk.evidence.length > 0, `Evidence recorded for risk '${risk.title}'`);
      assert(["low", "medium", "high", "critical"].includes(risk.severity), `Severity valid for '${risk.title}': ${risk.severity}`);
      assert(risk.status === "open", `Initial status is 'open' for '${risk.title}'`);
    }

    console.log("\n[TEST 2] Testing Risk lifecycle updates...");
    const firstRisk = risks[0];
    await Risk.findByIdAndUpdate(firstRisk._id, { $set: { status: "acknowledged" } });
    const acked = await Risk.findById(firstRisk._id).lean();
    assert(acked.status === "acknowledged", "Risk transitioned to 'acknowledged'");

    await Risk.findByIdAndUpdate(firstRisk._id, { $set: { status: "resolved", resolvedAt: new Date() } });
    const resolved = await Risk.findById(firstRisk._id).lean();
    assert(resolved.status === "resolved" && resolved.resolvedAt !== null, "Risk transitioned to 'resolved' with resolvedAt");

    await Task.deleteMany({ projectId: project._id });
    await Risk.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

    console.log("\n========================================================");
    console.log(`   RISK INTELLIGENCE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
