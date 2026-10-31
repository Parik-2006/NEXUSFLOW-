/**
 * server/scripts/testScrumSprintAnalyticsSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM SPRINT ANALYTICS AUTOMATED TEST SUITE
 *
 * Verifies Part 2:
 * 1. Grounded in authoritative MongoDB records (Sprint, Task, Team, Project).
 * 2. Backlog isolation: Unassigned backlog tasks never inflate sprint commitments.
 * 3. Velocity integrity: Strictly derived from completed sprints (0 if none completed).
 * 4. Task Flow Distribution: To Do, In Progress, In Review, Blocked, Done sum to 100%.
 * 5. Burndown calculation: Ideal linear points trajectory vs actual remaining points.
 * 6. Team capacity & workload: Utilization %, unassigned work detection.
 * 7. Division safety: Zero tasks / zero points safely handled without NaN.
 * 8. Sprint selection parameter: ?sprintId filtering.
 * 9. Non-mutating read-only guarantee.
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import assert from "assert";
import mongoose from "mongoose";
import { getScrumSprintAnalytics } from "../services/scrumAnalyticsService.js";
import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";

// Load environment
const envPath = path.resolve("server/.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

let passed = 0;
let failed = 0;

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log("\n=======================================================");
  console.log("RUNNING NEXUSFLOW SCRUM SPRINT ANALYTICS TEST SUITE");
  console.log("=======================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for testing.\n");

  try {
    // Target: TEAM OP3 (PhishShield)
    const teamId = "6ae19ab12b6004b647c971e6";
    const team = await Team.findById(teamId).lean();
    assert.ok(team, `Team ${teamId} must exist`);

    const project = await Project.findOne({ teamId: team._id }).lean();
    assert.ok(project, "Project must exist for team");

    // 1. Fetch live analytics
    const analytics = await getScrumSprintAnalytics(teamId);

    await test("1. Returns structured analytics payload with project and team metadata", () => {
      assert.strictEqual(analytics.teamId, teamId);
      assert.ok(analytics.projectName);
      assert.ok(Array.isArray(analytics.sprints));
      assert.ok(analytics.selectedSprint);
      assert.ok(analytics.overview);
      assert.ok(analytics.burndown);
      assert.ok(analytics.velocity);
      assert.ok(analytics.distribution);
      assert.ok(analytics.capacity);
    });

    await test("2. Selected sprint defaults to active sprint (Sprint 01)", () => {
      assert.strictEqual(analytics.selectedSprint.status, "ACTIVE");
      assert.ok(analytics.selectedSprint.name.includes("Sprint 01") || analytics.selectedSprint.name.includes("Sprint 1"));
    });

    await test("3. Backlog isolation: Sprint commitments strictly reflect sprint tasks (9 tasks, 37 points)", () => {
      assert.strictEqual(analytics.overview.totalCommittedStories, 9);
      assert.strictEqual(analytics.overview.totalCommittedPoints, 37);
      assert.strictEqual(analytics.overview.completedStories, 0);
      assert.strictEqual(analytics.overview.completedPoints, 0);
      assert.strictEqual(analytics.overview.remainingStories, 9);
      assert.strictEqual(analytics.overview.remainingPoints, 37);
    });

    await test("4. Task Flow Distribution sums exactly to total committed tasks (6 To Do + 2 In Progress + 1 In Review = 9)", () => {
      const dist = analytics.distribution;
      assert.strictEqual(dist.todo.count, 6);
      assert.strictEqual(dist.todo.storyPoints, 22);
      assert.strictEqual(dist.in_progress.count, 2);
      assert.strictEqual(dist.in_progress.storyPoints, 10);
      assert.strictEqual(dist.in_review.count, 1);
      assert.strictEqual(dist.in_review.storyPoints, 5);
      assert.strictEqual(dist.blocked.count, 0);
      assert.strictEqual(dist.done.count, 0);

      const sumCounts = dist.todo.count + dist.in_progress.count + dist.in_review.count + dist.blocked.count + dist.done.count;
      assert.strictEqual(sumCounts, analytics.overview.totalCommittedStories);
      assert.strictEqual(sumCounts, 9);

      const sumPoints = dist.todo.storyPoints + dist.in_progress.storyPoints + dist.in_review.storyPoints + dist.blocked.storyPoints + dist.done.storyPoints;
      assert.strictEqual(sumPoints, analytics.overview.totalCommittedPoints);
      assert.strictEqual(sumPoints, 37);
    });

    await test("5. Velocity integrity: Active & planning sprints strictly contribute 0 to completed velocity", () => {
      const vel = analytics.velocity;
      assert.strictEqual(vel.completedSprintCount, 0, "No sprints have been completed yet");
      assert.strictEqual(vel.averageVelocity, 0, "Average velocity must be 0 when 0 completed sprints exist");
      assert.strictEqual(vel.highestVelocity, 0);
      assert.strictEqual(vel.lowestVelocity, 0);
      assert.strictEqual(vel.totalCompletedStoryPoints, 0);
      assert.strictEqual(vel.history.length, 0);
    });

    await test("6. Burndown trajectory includes ideal baseline from 37 points to 0", () => {
      const burn = analytics.burndown;
      assert.ok(burn.idealTrajectory && burn.idealTrajectory.length > 0);
      assert.strictEqual(burn.idealTrajectory[0].points, 37);
      const lastIdeal = burn.idealTrajectory[burn.idealTrajectory.length - 1];
      assert.strictEqual(lastIdeal.points, 0);
      assert.ok(burn.actualTrajectory && burn.actualTrajectory.length > 0);
      assert.strictEqual(burn.actualTrajectory[0].points, 37);
    });

    await test("7. Team capacity & workload reflects members and tracks utilization", () => {
      const cap = analytics.capacity;
      assert.ok(cap.totalCapacityHours > 0);
      assert.ok(Array.isArray(cap.memberWorkloads));
      assert.strictEqual(typeof cap.capacityUtilizationPct, "number");
      assert.strictEqual(typeof cap.unassignedTasksCount, "number");
    });

    await test("8. Specific sprint query ?sprintId returns analytics for the specified sprint", async () => {
      const sprints = await Sprint.find({ projectId: project._id }).lean();
      if (sprints.length > 1) {
        const targetSprint = sprints[1];
        const res = await getScrumSprintAnalytics(teamId, targetSprint._id.toString());
        assert.strictEqual(res.selectedSprint._id, targetSprint._id.toString());
      } else {
        const res = await getScrumSprintAnalytics(teamId, analytics.selectedSprint._id);
        assert.strictEqual(res.selectedSprint._id, analytics.selectedSprint._id);
      }
    });

    await test("9. Division by zero safety: Handles empty sprint without NaN or crash", async () => {
      // Create a temporary mock in-memory sprint without tasks
      const emptySprint = await Sprint.create({
        projectId: project._id,
        teamId: team._id,
        name: "Test Empty Sprint Zero Safety",
        sprintNumber: 99,
        status: "PLANNING",
        durationDays: 14,
      });

      try {
        const res = await getScrumSprintAnalytics(teamId, emptySprint._id.toString());
        assert.strictEqual(res.overview.totalCommittedStories, 0);
        assert.strictEqual(res.overview.totalCommittedPoints, 0);
        assert.strictEqual(res.overview.storyCompletionPct, 0);
        assert.strictEqual(res.overview.pointCompletionPct, 0);
        assert.strictEqual(isNaN(res.overview.storyCompletionPct), false);
        assert.strictEqual(isNaN(res.overview.pointCompletionPct), false);
        assert.strictEqual(isFinite(res.overview.storyCompletionPct), true);
        assert.strictEqual(isFinite(res.overview.pointCompletionPct), true);
      } finally {
        await Sprint.findByIdAndDelete(emptySprint._id);
      }
    });

    await test("10. Non-mutating guarantee: Database state is unchanged after analytics execution", async () => {
      const sprintAfter = await Sprint.findById(analytics.selectedSprint._id).lean();
      assert.strictEqual(sprintAfter.status, "ACTIVE");
      const tasksCountAfter = await Task.countDocuments({ sprintId: analytics.selectedSprint._id });
      assert.strictEqual(tasksCountAfter, 9);
    });

  } finally {
    await mongoose.disconnect();
  }

  console.log("\n-------------------------------------------------------");
  console.log(`Scrum Sprint Analytics Suite Results: ${passed} passed, ${failed} failed`);
  console.log("-------------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
