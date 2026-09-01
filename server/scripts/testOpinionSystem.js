/**
 * server/scripts/testOpinionSystem.js
 * NEXUSFLOW 3.0 — Phase 14 Validation: Opinion Poll & Decision System
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
import Opinion from "../models/Opinion.js";
import Decision from "../models/Decision.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: OPINION + DECISION VALIDATION SUITE");
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
    const userA = await User.create({ name: "Opinion Lead", email: `oplead_${Date.now()}@test.com`, password: "password123" });
    const userB = await User.create({ name: "Opinion Member", email: `opmember_${Date.now()}@test.com`, password: "password123" });

    const team = await Team.create({
      name: `Opinion Team ${Date.now()}`,
      ownerId: userA._id,
      members: [
        { userId: userA._id, name: userA.name, role: "leader" },
        { userId: userB._id, name: userB.name, role: "member" },
      ],
    });

    const project = await Project.create({ teamId: team._id, title: "Opinion Test Project", status: "active" });

    console.log("\n[TEST 1] Creating Opinion Poll...");
    const opinion = await Opinion.create({
      projectId: project._id,
      teamId: team._id,
      createdBy: userA._id,
      question: "Which deployment strategy should we use?",
      options: ["Blue-Green", "Canary Release", "Rolling Update"],
    });

    assert(!!opinion._id, "Opinion poll created in MongoDB");
    assert(opinion.options.length === 3, "3 options recorded");
    assert(opinion.status === "open", "Initial status is 'open'");

    console.log("\n[TEST 2] Submitting Team Member Responses...");
    await Opinion.findByIdAndUpdate(opinion._id, {
      $push: { responses: { userId: userA._id, userName: userA.name, option: "Blue-Green", reasoning: "Zero downtime" } },
    });
    await Opinion.findByIdAndUpdate(opinion._id, {
      $push: { responses: { userId: userB._id, userName: userB.name, option: "Blue-Green", reasoning: "Safest option" } },
    });

    const updated = await Opinion.findById(opinion._id).lean();
    assert(updated.responses.length === 2, "2 responses collected");

    console.log("\n[TEST 3] Finalizing Decision from Poll Consensus...");
    const decision = await Decision.create({
      projectId: project._id,
      title: "Team consensus: Which deployment strategy should we use?",
      decision: "Blue-Green",
      selectedOption: "Blue-Green",
      reasoning: "Team unanimously selected for zero-downtime deployments",
      status: "accepted",
      category: "process",
    });

    await Opinion.findByIdAndUpdate(opinion._id, { $set: { status: "decided", finalDecisionId: decision._id } });
    const finalOpinion = await Opinion.findById(opinion._id).lean();

    assert(!!decision._id, "Decision record created in MongoDB");
    assert(decision.status === "accepted", "Decision status is 'accepted'");
    assert(finalOpinion.status === "decided", "Opinion status updated to 'decided'");
    assert(finalOpinion.finalDecisionId.toString() === decision._id.toString(), "Opinion linked to final Decision");

    await Opinion.deleteMany({ projectId: project._id });
    await Decision.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });

    console.log("\n========================================================");
    console.log(`   OPINION + DECISION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
