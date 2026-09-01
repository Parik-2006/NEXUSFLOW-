/**
 * server/scripts/testPhase10Sync.js
 * NEXUSFLOW 3.0 — Phase 10 Validation: Real-Time Socket Broadcast Helpers
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
import {
  broadcastDecisionUpdate,
  broadcastResearchUpdate,
  broadcastArchitectureUpdate,
  broadcastGuidanceUpdate,
  broadcastOpinionUpdate,
  broadcastRiskUpdate,
  broadcastHealthUpdate,
  broadcastRetrospectiveUpdate,
} from "../socket/projectSyncHandlers.js";

async function run() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 3.0: PHASE 10 REAL-TIME SYNC VALIDATION");
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
    const member = await User.create({
      name: "Team Member Alpha",
      email: `member_${Date.now()}@test.com`,
      password: "password123",
    });

    const team = await Team.create({
      name: `Sync Test Team ${Date.now()}`,
      ownerId: member._id,
      members: [{ userId: member._id, name: member.name, role: "leader" }],
    });

    const project = await Project.create({
      teamId: team._id,
      title: "Sync Test Project",
      status: "active",
    });

    console.log("\n[TEST 1] Testing Project Room Event Broadcasters...");
    const emittedEvents = [];
    const mockIo = {
      to: (room) => ({ emit: (event, payload) => { emittedEvents.push({ room, event, payload }); } }),
    };

    const projectIdStr = project._id.toString();

    broadcastDecisionUpdate(mockIo, projectIdStr, { action: "create", test: 1 });
    broadcastResearchUpdate(mockIo, projectIdStr, { action: "create", test: 2 });
    broadcastArchitectureUpdate(mockIo, projectIdStr, { action: "update", test: 3 });
    broadcastGuidanceUpdate(mockIo, projectIdStr, { action: "create", test: 4 });
    broadcastOpinionUpdate(mockIo, projectIdStr, { action: "response", test: 5 });
    broadcastRiskUpdate(mockIo, projectIdStr, { action: "scan", test: 6 });
    broadcastHealthUpdate(mockIo, projectIdStr, { action: "refresh", test: 7 });
    broadcastRetrospectiveUpdate(mockIo, projectIdStr, { action: "create", test: 8 });

    assert(emittedEvents.length === 8, "All 8 broadcast helpers emitted events");
    for (const e of emittedEvents) {
      assert(e.room === `project:${projectIdStr}`, `Event targets room project:${projectIdStr}`);
      assert(e.payload?.projectId === projectIdStr, "Payload contains projectId string");
      assert(typeof e.payload?._ts === "number", "Payload contains timestamp _ts");
    }

    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: member._id });

    console.log("\n========================================================");
    console.log(`   PHASE 10 REAL-TIME SYNC SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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
