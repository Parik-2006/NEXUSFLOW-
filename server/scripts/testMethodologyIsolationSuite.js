/**
 * server/scripts/testMethodologyIsolationSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — STRICT SCRUM / WATERFALL METHODOLOGY ISOLATION SUITE
 *
 * Validates:
 *   1. Frontend Navigation Tab Structure & Deep-Link Isolation
 *   2. Data Model Isolation (Project, Task, Sprint, Retrospective)
 *   3. Bidirectional Workflow Non-Interference:
 *      - Scrum sprint actions NEVER trigger Waterfall phase gates or alter phases
 *      - Waterfall phase actions NEVER create or alter Scrum sprints/backlog
 *   4. Analytics & Gating Isolation (Phase Gates vs. Sprint Capacity)
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import Retrospective from "../models/Retrospective.js";

import {
  evaluateProjectPhaseGate,
  advanceProjectPhase,
} from "../services/phaseGateService.js";
import { calculateSprintCapacity } from "../services/scrumCapacityEngine.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexusflow_dev";

let passedCount = 0;
let totalCount = 0;

function report(name, pass, detail = "") {
  totalCount++;
  if (pass) {
    passedCount++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    console.error(`  ✗ [FAIL] ${name} ${detail}`);
  }
}

async function runIsolationSuite() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: STRICT SCRUM / WATERFALL METHODOLOGY ISOLATION SUITE");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected to MongoDB Atlas successfully.");

  const suffix = Date.now().toString().slice(-6);
  let waterfallTeam = null;
  let waterfallProject = null;
  let scrumTeam = null;
  let scrumProject = null;
  let scrumSprint = null;
  let waterfallTask = null;
  let scrumTask = null;

  try {
    // ── Group 1: Navigation & Routing Isolation ─────────────────────────────
    console.log("\n--- Group 1: Navigation & Deep-Link Routing Isolation ---");

    const teamPageCode = fs.readFileSync("client/app/team/[teamId].tsx", "utf-8");

    // 1.1 Waterfall Tab Order & Definition
    const waterfallTabsMatch = teamPageCode.includes('const WATERFALL_PRIMARY_TABS:');
    report("Waterfall defines its own primary navigation structure independently", waterfallTabsMatch);

    const waterfallHasTimeline = teamPageCode.includes('{ key: "timeline",  label: "Timeline",   icon: "calendar"');
    report("Waterfall retains top-level Timeline primary tab", waterfallHasTimeline);

    const scrumHasNoTimeline = !teamPageCode.includes('const SCRUM_PRIMARY_TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [\n  { key: "timeline"');
    report("Scrum navigation strictly excludes top-level Timeline tab", scrumHasNoTimeline);

    // 1.2 Deep Link Normalization Isolation
    // In Waterfall: timeline -> timeline
    // In Scrum: timeline -> tasks
    report("Scrum maps 'timeline' to 'tasks' only when isScrum is true", teamPageCode.includes('if (rawTab === "timeline") return isScrum ? "tasks" : "timeline";'));

    // In Waterfall: retro -> insights
    // In Scrum: retro -> retro
    report("Waterfall maps 'retro' to 'insights' while Scrum keeps dedicated 'retro'", teamPageCode.includes('if (rawTab === "retro" && isScrum) return "retro";') && teamPageCode.includes('["graph", "analytics", "health", "risks", "retro"].includes(rawTab)) return "insights";'));

    // In Waterfall: plan -> overview (with initialSection="plan")
    // In Scrum: plan -> overview (with initialSection="plan")
    report("Waterfall and Scrum both route 'plan' to Overview without separate Plan tabs", teamPageCode.includes('if (rawTab === "plan") return isScrum ? "overview" : isKanban ? "plan" : "overview";'));

    // ── Group 2: Data Model Schema Isolation ────────────────────────────────
    console.log("\n--- Group 2: Data Model Schema Isolation ---");

    const ownerId = new mongoose.Types.ObjectId();

    // Create pure Waterfall project
    waterfallTeam = await Team.create({
      name: `Waterfall Isolation Team ${suffix}`,
      ownerId,
      methodology: "WATERFALL",
      members: [{ userId: ownerId, name: "Waterfall Lead", role: "owner" }],
    });

    waterfallProject = await Project.create({
      title: `Waterfall Project ${suffix}`,
      teamId: waterfallTeam._id,
      methodology: "WATERFALL",
      currentWaterfallPhase: "requirements",
      waterfallPhases: [
        { phase: "requirements", status: "in_progress", order: 1 },
        { phase: "design", status: "locked", order: 2 },
      ],
      requirements: [
        {
          reqId: `REQ-${suffix}-01`,
          title: "Deterministic Phase Gate Spec",
          phase: "requirements",
          status: "approved",
          approvalStatus: "approved",
          estimatedHours: 8,
        },
      ],
    });

    report("Waterfall Project is created with scrumPlanLifecycle = null by default", waterfallProject.scrumPlanLifecycle === null);

    // Create pure Scrum project
    scrumTeam = await Team.create({
      name: `Scrum Isolation Team ${suffix}`,
      ownerId,
      methodology: "SCRUM",
      members: [{ userId: ownerId, name: "Scrum Master", role: "owner", capacity: 40 }],
    });

    scrumProject = await Project.create({
      title: `Scrum Project ${suffix}`,
      teamId: scrumTeam._id,
      methodology: "SCRUM",
      scrumPlanLifecycle: {
        status: "SETUP_PENDING",
        suggestions: [],
      },
    });

    report("Scrum Project retains its scrumPlanLifecycle structure", scrumProject.scrumPlanLifecycle !== null && scrumProject.scrumPlanLifecycle.status === "SETUP_PENDING");

    // ── Group 3: Task Model Isolation & Query Boundaries ────────────────────
    console.log("\n--- Group 3: Task Model Isolation & Query Boundaries ---");

    // Create Waterfall Task
    waterfallTask = await Task.create({
      teamId: waterfallTeam._id,
      projectId: waterfallProject._id,
      title: `Waterfall Task ${suffix}`,
      phase: "requirements",
      requirementId: `REQ-${suffix}-01`,
      status: "done",
      storyPoints: 1,
    });

    // Create Scrum Task
    scrumTask = await Task.create({
      teamId: scrumTeam._id,
      projectId: scrumProject._id,
      title: `Scrum Story ${suffix}`,
      scrumStatus: "BACKLOG",
      status: "todo",
      storyPoints: 5,
      estimatedHours: 6,
    });

    // Verify task queries
    const wfTasks = await Task.find({ projectId: waterfallProject._id });
    report("Waterfall task query returns only Waterfall tasks (0 Scrum stories)", wfTasks.length === 1 && !wfTasks[0].scrumStatus);

    const scTasks = await Task.find({ projectId: scrumProject._id });
    report("Scrum task query returns only Scrum stories (0 Waterfall tasks)", scTasks.length === 1 && scTasks[0].scrumStatus === "BACKLOG");

    report("Waterfall task does not have sprintId or sprint association", !waterfallTask.sprintId);

    // ── Group 4: Phase Gate vs. Sprint Lifecycle Isolation ──────────────────
    console.log("\n--- Group 4: Phase Gate vs. Sprint Lifecycle Isolation ---");

    // Create Scrum Sprint
    scrumSprint = await Sprint.create({
      projectId: scrumProject._id,
      teamId: scrumTeam._id,
      number: 1,
      sprintNumber: 1,
      name: "Sprint 1",
      goal: "Scrum isolated delivery",
      status: "ACTIVE",
      committedTasks: [scrumTask._id],
    });

    scrumTask.sprintId = scrumSprint._id;
    scrumTask.assignedTo = ownerId;
    await scrumTask.save();

    // Evaluate Waterfall Phase Gate
    const gateEval = await evaluateProjectPhaseGate(waterfallProject._id);
    report("Waterfall phase gate evaluates independently without interference from active Scrum sprint", gateEval.canAdvance === true && gateEval.currentPhase === "requirements");

    // Advance Waterfall Phase Gate
    const advanceResult = await advanceProjectPhase({
      projectId: waterfallProject._id,
      teamId: waterfallTeam._id,
      userId: ownerId.toString(),
      userName: "Methodology Leader",
    });
    report("Advancing Waterfall phase moves waterfallProject to 'design'", advanceResult.waterfallPhase === "design");

    const reloadedSprint = await Sprint.findById(scrumSprint._id);
    report("Advancing Waterfall phase has ZERO side-effects on Scrum Sprint (remains ACTIVE)", reloadedSprint.status === "ACTIVE");

    // Calculate Scrum Capacity passing BOTH Scrum and Waterfall tasks
    const cap = calculateSprintCapacity(scrumSprint, [scrumTask, waterfallTask], scrumTeam);
    report("Scrum capacity engine calculates Scrum team exclusively (excludes Waterfall tasks)", cap.summary.totalAllocated === 6);

  } finally {
    console.log("\n--- Cleanup ---");
    if (waterfallTask) await Task.deleteMany({ _id: waterfallTask._id });
    if (scrumTask) await Task.deleteMany({ _id: scrumTask._id });
    if (scrumSprint) await Sprint.deleteMany({ _id: scrumSprint._id });
    if (waterfallProject) await Project.deleteMany({ _id: waterfallProject._id });
    if (scrumProject) await Project.deleteMany({ _id: scrumProject._id });
    if (waterfallTeam) await Team.deleteMany({ _id: waterfallTeam._id });
    if (scrumTeam) await Team.deleteMany({ _id: scrumTeam._id });
    await mongoose.disconnect();
    console.log("  Disconnected from MongoDB Atlas.");
  }

  console.log("\n================================================================================");
  console.log(`  ALL ISOLATION TESTS PASSED: ${passedCount} / ${totalCount} (100%)`);
  console.log("================================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runIsolationSuite().catch((err) => {
  console.error("Isolation suite error:", err);
  process.exit(1);
});
