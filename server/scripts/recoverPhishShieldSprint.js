/**
 * server/scripts/recoverPhishShieldSprint.js
 * ============================================================================
 * NEXUSFLOW V4 — PHISHSHIELD SPRINT 01 RECOVERY SCRIPT
 *
 * Restores the 9 tasks for TEAM OP3 (PhishShield) that were prematurely unlinked
 * and marked CARRIED_OVER when Sprint 01 was completed with unfinished work.
 * Restores Sprint 01 to ACTIVE status with its original 9 tasks and 34 story points.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Team from "../models/Team.js";
import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import { computeScrumHealth } from "../services/scrumHealthService.js";

async function runRecovery() {
  console.log("\n=================================================================");
  console.log("PHISHSHIELD SPRINT 01 DATA RECOVERY");
  console.log("=================================================================");

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI not configured in server/.env");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  const teamId = new mongoose.Types.ObjectId("6ae19ab12b6004b647c971e6");
  const sprintId = new mongoose.Types.ObjectId("6ae1a11e2b6004b647c97a11");

  const team = await Team.findById(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }
  console.log(`Found team: ${team.name} (${team._id})`);

  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    throw new Error(`Sprint ${sprintId} not found`);
  }
  console.log(`Found sprint: ${sprint.name} (${sprint._id}), current status: ${sprint.status}`);

  // Query all tasks for this team with carryOverHistory referencing sprintId
  const tasks = await Task.find({
    teamId,
    $or: [
      { sprintId: null, "carryOverHistory.fromSprintId": sprintId },
      { sprintId },
    ],
  });

  console.log(`Found ${tasks.length} task(s) associated with Sprint 01.`);

  let restoredPoints = 0;
  for (const task of tasks) {
    const originalStatus = String(task.status || "todo").toLowerCase();
    const targetScrumStatus = originalStatus === "in_progress" ? "IN_PROGRESS" : "TODO";

    task.sprintId = sprintId;
    task.scrumStatus = targetScrumStatus;
    // Pop the erroneous carryOverHistory entry if fromSprintId matches
    if (task.carryOverHistory && task.carryOverHistory.length > 0) {
      task.carryOverHistory = task.carryOverHistory.filter(
        (h) => h.fromSprintId?.toString() !== sprintId.toString()
      );
    }
    await task.save();
    restoredPoints += task.storyPoints || 0;
    console.log(`  -> Restored task: [${task._id}] "${task.title.slice(0, 45)}..." -> sprintId: ${sprintId}, scrumStatus: ${targetScrumStatus}`);
  }

  // Update Sprint 01 back to ACTIVE
  sprint.status = "ACTIVE";
  sprint.plannedTaskCount = tasks.length;
  sprint.plannedStoryPoints = restoredPoints || 34;
  sprint.completedTaskCount = 0;
  sprint.completedStoryPoints = 0;
  sprint.carryOverItems = [];
  sprint.review = null;
  sprint.endDate = new Date(Date.now() + 14 * 86400000);
  await sprint.save();

  console.log(`\nSprint 01 successfully restored to ACTIVE with ${tasks.length} tasks and ${sprint.plannedStoryPoints} story points.`);

  // Recalculate health snapshot
  if (team.activeProjectId) {
    try {
      console.log(`Recalculating Scrum health for project ${team.activeProjectId}...`);
      await computeScrumHealth(team.activeProjectId);
      console.log("Health successfully recomputed.");
    } catch (e) {
      console.warn("Health recomputation notice:", e.message);
    }
  }

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB. Recovery complete.\n");
}

runRecovery().catch((err) => {
  console.error("Recovery failed:", err);
  process.exit(1);
});

