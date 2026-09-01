/**
 * server/scripts/testProjectBrain.js
 * NEXUSFLOW 3.0 — Phase 17 & Phase 20 Validation: Project Brain RAG Context Builder
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
import Decision from "../models/Decision.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import ResearchItem from "../models/ResearchItem.js";
import Risk from "../models/Risk.js";
import { buildProjectBrainContext, serializeBrainForPrompt } from "../services/projectBrain.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: PROJECT BRAIN RAG CONTEXT SUITE");
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
      name: "Brain Test Lead",
      email: `brain_${Date.now()}@test.com`,
      password: "password123",
    });

    const team = await Team.create({
      name: `Brain Test Team ${Date.now()}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });

    const project = await Project.create({
      teamId: team._id,
      title: "NexusFlow Autonomous Engine",
      description: "Distributed task allocation with real-time graph scheduling",
      domain: "Distributed Systems & AI",
      status: "active",
    });

    // Seed diverse project intelligence documents
    const decision = await Decision.create({
      projectId: project._id,
      title: "Core Database Selection",
      decision: "Adopted MongoDB with Replica Sets",
      reasoning: "High write throughput for real-time task graph recalculations",
      selectedOption: "MongoDB with Replica Sets",
      category: "technology",
      status: "accepted",
    });

    await ArchitectureComponent.create({
      projectId: project._id,
      componentType: "database",
      name: "MongoDB Atlas Primary Cluster",
      technology: "MongoDB 7.0",
      description: "Stores project briefs, decision logs, and task dependencies",
      status: "completed",
    });

    await ResearchItem.create({
      projectId: project._id,
      title: "Efficient Topological Sort for Dynamic Graphs",
      summary: "Kahn's algorithm with incremental updates achieves O(V+E)",
      relevance: 5,
    });

    await Risk.create({
      projectId: project._id,
      teamId: team._id,
      title: "High API Latency on Cold Start",
      severity: "medium",
      recommendation: "Introduce connection pooling and cache warmed connections",
      status: "open",
    });

    await Task.create({
      teamId: team._id,
      projectId: project._id,
      title: "Implement Kahn's Algorithm",
      status: "in_progress",
      priorityScore: 85,
    });

    console.log("\n[TEST 1] Building Project Brain Context Snapshot...");
    const brain = await buildProjectBrainContext(project._id.toString(), user._id.toString());

    assert(brain !== null, "Project Brain snapshot assembled");
    assert(brain.project?.title === "NexusFlow Autonomous Engine", `Project title: "${brain.project?.title}"`);
    assert(brain.decisions?.length === 1, `Decisions aggregated: ${brain.decisions?.length}`);
    assert(brain.architecture?.length === 1, `Architecture components aggregated: ${brain.architecture?.length}`);
    assert(brain.research?.length === 1, `Research items aggregated: ${brain.research?.length}`);
    assert(brain.risks?.length === 1, `Open risks aggregated: ${brain.risks?.length}`);
    assert(brain.tasks?.activeTasks?.length === 1, `Active tasks aggregated: ${brain.tasks?.activeTasks?.length}`);

    console.log("\n[TEST 2] Serializing Project Brain for LLM Prompt Injection...");
    const promptString = serializeBrainForPrompt(brain);

    assert(typeof promptString === "string" && promptString.length > 50, "Serialized prompt is a non-empty string");
    assert(promptString.includes("NexusFlow Autonomous Engine"), "Prompt contains project title");
    assert(promptString.includes("MongoDB Atlas Primary Cluster"), "Prompt contains architecture component");
    assert(promptString.includes("High API Latency on Cold Start"), "Prompt contains risk information");
    assert(promptString.includes("Core Database Selection"), "Prompt contains decision title");

    await Decision.deleteMany({ projectId: project._id });
    await ArchitectureComponent.deleteMany({ projectId: project._id });
    await ResearchItem.deleteMany({ projectId: project._id });
    await Risk.deleteMany({ projectId: project._id });
    await Task.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

    console.log("\n========================================================");
    console.log(`   PROJECT BRAIN TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
