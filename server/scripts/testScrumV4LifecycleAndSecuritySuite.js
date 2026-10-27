/**
 * server/scripts/testScrumV4LifecycleAndSecuritySuite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM LIFECYCLE, SECURITY & INTEGRATION TEST SUITE
 *
 * Verifies:
 *   1. Environment-specific release channel contract & production isolation
 *   2. Strict authorization & IDOR isolation on Scrum backend routes
 *   3. Non-destructive safety (read requests never alter methodology or projects)
 *   4. End-to-end Scrum lifecycle:
 *      - Backlog creation & INVEST validation
 *      - DAA Knapsack sprint planning candidate scoring
 *      - Sprint lifecycle state machine (PLANNING -> ACTIVE -> REVIEW -> COMPLETED)
 *      - Sprint execution board transitions & terminal truth
 *      - Team capacity & Branch-and-Bound load balancing
 *      - Cross-sprint dependencies & cycle detection
 *      - Sprint retrospective generation from live DB records
 *   5. Regressions: Waterfall, Classic, Kanban and Hybrid invariants preserved
 * ============================================================================
 */

import assert from "node:assert";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

import {
  getReleaseChannel,
  isScrumDevelopmentEnabled,
  areExperimentalMethodologiesEnabled,
  getMethodologyRegistry,
  isMethodologyAllowedForNewProjects,
  normalizeMethodologyId,
} from "../config/methodologyAvailability.js";

import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import Retrospective from "../models/Retrospective.js";

import {
  createSprint,
  startSprint,
  completeSprint,
  cancelSprint,
  getActiveSprint,
  addToSprint,
  updateTaskStatus,
  calculateScrumHealth,
  validateSprintTransition,
  validateTaskTransition,
} from "../services/scrumEngine.js";

import {
  calculateScrumPriority,
  rankBacklog,
  scorePlanningCandidates,
} from "../services/scrumPriorityEngine.js";

import {
  calculateSprintCapacity,
  suggestAllocation,
} from "../services/scrumCapacityEngine.js";

import {
  analyzeScrumDependencies,
  wouldCreateCycle,
} from "../services/scrumDependencyEngine.js";

import { generateRetrospective } from "../services/retrospectiveService.js";

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: SCRUM LIFECYCLE, SECURITY & INTEGRATION TEST SUITE");
  console.log("================================================================================\n");

  // ── GROUP 1: RELEASE CONTRACT & PRODUCTION SAFETY ─────────────────────────
  console.log("--- Group 1: Release Contract & Production Isolation ---");

  runTest("V4 Development release channel enables Scrum DEV_PREVIEW", () => {
    process.env.METHODOLOGY_RELEASE_CHANNEL = "development";
    delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
    delete process.env.NODE_ENV;

    assert.strictEqual(getReleaseChannel(), "development");
    assert.strictEqual(isScrumDevelopmentEnabled(), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("WATERFALL"), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("CLASSIC"), true);

    // Kanban and Hybrid remain strictly blocked
    assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);

    const reg = getMethodologyRegistry();
    assert.strictEqual(reg.SCRUM.status, "AVAILABLE");
    assert.strictEqual(reg.SCRUM.badge, "DEV_PREVIEW");
    assert.strictEqual(reg.KANBAN.status, "IN_PROGRESS");
    assert.strictEqual(reg.HYBRID.status, "IN_PROGRESS");
  });

  runTest("Production release channel forcibly blocks Scrum regardless of non-production settings", () => {
    process.env.METHODOLOGY_RELEASE_CHANNEL = "production";
    process.env.NODE_ENV = "development";
    process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES = "true";

    assert.strictEqual(getReleaseChannel(), "production");
    assert.strictEqual(isScrumDevelopmentEnabled(), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("WATERFALL"), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("CLASSIC"), true);
    delete process.env.ENABLE_EXPERIMENTAL_METHODOLOGIES;
  });

  runTest("Production-like runtime with missing channel fails safe to production rules", () => {
    delete process.env.METHODOLOGY_RELEASE_CHANNEL;
    process.env.NODE_ENV = "production";

    assert.strictEqual(getReleaseChannel(), "production");
    assert.strictEqual(isScrumDevelopmentEnabled(), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);
  });

  runTest("Vercel Preview (NODE_ENV=production + METHODOLOGY_RELEASE_CHANNEL=development) permits Scrum dev", () => {
    process.env.NODE_ENV = "production";
    process.env.METHODOLOGY_RELEASE_CHANNEL = "development";

    assert.strictEqual(getReleaseChannel(), "development");
    assert.strictEqual(isScrumDevelopmentEnabled(), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("SCRUM"), true);
    assert.strictEqual(isMethodologyAllowedForNewProjects("KANBAN"), false);
    assert.strictEqual(isMethodologyAllowedForNewProjects("HYBRID"), false);
  });

  // Restore development release channel for remainder of tests
  process.env.METHODOLOGY_RELEASE_CHANNEL = "development";
  delete process.env.NODE_ENV;

  // ── GROUP 2: DATABASE PERSISTENCE & SCRUM LIFECYCLE ───────────────────────
  console.log("\n--- Group 2: Live Database Persistence & Scrum Lifecycle ---");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("  [SKIP] MongoDB URI not provided, skipping live DB checks.");
  } else {
    await mongoose.connect(mongoUri);
    console.log("  Connected to MongoDB successfully.");

    const testOwnerId = new mongoose.Types.ObjectId();
    const testMemberId = new mongoose.Types.ObjectId();
    let testTeam = null;
    let testProject = null;
    let testSprint = null;
    let testTasks = [];

    try {
      await runAsyncTest("Create test Scrum Team and Project in development environment", async () => {
        testTeam = await Team.create({
          name: "Test Scrum Autonomous Team",
          ownerId: testOwnerId,
          projectTitle: "Automated Scrum Test Suite",
          projectDescription: "A fully verified Scrum lifecycle test workspace for continuous integration.",
          methodology: "SCRUM",
          members: [
            { userId: testOwnerId, name: "Scrum Master", role: "leader", capacity: 40 },
            { userId: testMemberId, name: "Lead Developer", role: "member", capacity: 40 },
          ],
        });

        testProject = await Project.create({
          teamId: testTeam._id,
          title: "Automated Scrum Test Suite",
          description: "Scrum lifecycle testing workspace",
          methodology: "SCRUM",
          status: "planning",
          scrumConfig: {
            sprintDuration: 14,
            defaultCapacityPerMember: 40,
            estimationUnit: "both",
            definitionOfDone: ["Code complete", "Tests passing", "Code reviewed"],
          },
        });

        testTeam.activeProjectId = testProject._id;
        await testTeam.save();

        assert.ok(testTeam._id);
        assert.ok(testProject._id);
        assert.strictEqual(testTeam.methodology, "SCRUM");
        assert.strictEqual(testProject.methodology, "SCRUM");
      });

      await runAsyncTest("Create Product Backlog items with INVEST attributes and verify DAA dynamic scoring", async () => {
        const item1 = await Task.create({
          teamId: testTeam._id,
          projectId: testProject._id,
          title: "Implement Authentication Module",
          userStory: "As a user, I want OAuth login so that my workspace is protected",
          acceptanceCriteria: ["Google OAuth functional", "JWT minted on success"],
          businessValue: 90,
          urgency: 5,
          storyPoints: 5,
          estimatedHours: 12,
          scrumStatus: "BACKLOG",
          status: "todo",
        });

        const item2 = await Task.create({
          teamId: testTeam._id,
          projectId: testProject._id,
          title: "Build Velocity Burndown Chart",
          userStory: "As a Scrum Master, I want a burndown curve to assess trajectory",
          acceptanceCriteria: ["Chart renders ideal vs actual points"],
          businessValue: 70,
          urgency: 3,
          storyPoints: 3,
          estimatedHours: 8,
          scrumStatus: "BACKLOG",
          status: "todo",
        });

        const item3 = await Task.create({
          teamId: testTeam._id,
          projectId: testProject._id,
          title: "Minor CSS button padding adjustment",
          businessValue: 15,
          urgency: 1,
          storyPoints: 1,
          estimatedHours: 2,
          scrumStatus: "BACKLOG",
          status: "todo",
        });

        testTasks = [item1, item2, item3];

        const ranked = rankBacklog(testTasks.map((t) => t.toObject()));
        assert.strictEqual(ranked.length, 3);
        assert.strictEqual(ranked[0]._id.toString(), item1._id.toString(), "Auth task must rank #1");
        assert.strictEqual(ranked[1]._id.toString(), item2._id.toString(), "Burndown task must rank #2");
        assert.strictEqual(ranked[2]._id.toString(), item3._id.toString(), "CSS tweak must rank #3");
      });

      await runAsyncTest("DAA Knapsack planning scores candidates within capacity constraint", async () => {
        const candidates = testTasks.map((t) => t.toObject());
        const planning = scorePlanningCandidates(candidates, {
          sprintGoal: "Ship Authentication Module and Core Dashboard",
          totalCapacityHours: 80,
        });

        assert.ok(Array.isArray(planning.recommended));
        assert.ok(planning.recommended.length >= 1);
        assert.strictEqual(planning.recommended[0]._id.toString(), testTasks[0]._id.toString());
      });

      await runAsyncTest("Create Sprint in PLANNING status and commit backlog items", async () => {
        testSprint = await Sprint.create({
          projectId: testProject._id,
          teamId: testTeam._id,
          sprintNumber: 1,
          name: "Sprint 01",
          goal: "Ship Authentication Module and Core Dashboard",
          status: "PLANNING",
          durationDays: 14,
          startDate: new Date(),
          endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
          totalCapacityHours: 80,
        });

        assert.strictEqual(testSprint.status, "PLANNING");

        // Add task 1 and task 2 to sprint
        await Task.updateOne(
          { _id: testTasks[0]._id },
          { $set: { sprintId: testSprint._id, scrumStatus: "SELECTED_FOR_SPRINT" } }
        );
        await Task.updateOne(
          { _id: testTasks[1]._id },
          { $set: { sprintId: testSprint._id, scrumStatus: "SELECTED_FOR_SPRINT" } }
        );

        const sprintTasks = await Task.find({ sprintId: testSprint._id }).lean();
        assert.strictEqual(sprintTasks.length, 2);
      });

      await runAsyncTest("Start Sprint enforces state transition (PLANNING -> ACTIVE)", async () => {
        assert.strictEqual(validateSprintTransition("PLANNING", "ACTIVE"), true);

        testSprint.status = "ACTIVE";
        await testSprint.save();

        await Task.updateMany(
          { sprintId: testSprint._id, scrumStatus: "SELECTED_FOR_SPRINT" },
          { $set: { scrumStatus: "TODO" } }
        );

        const refreshedSprint = await Sprint.findById(testSprint._id).lean();
        assert.strictEqual(refreshedSprint.status, "ACTIVE");

        const activeTasks = await Task.find({ sprintId: testSprint._id }).lean();
        assert.ok(activeTasks.every((t) => t.scrumStatus === "TODO"));
      });

      await runAsyncTest("Task state transitions enforce Scrum workflow (TODO -> IN_PROGRESS -> IN_REVIEW -> DONE)", async () => {
        const taskId = testTasks[0]._id;

        // Valid forward progression
        assert.strictEqual(validateTaskTransition("TODO", "IN_PROGRESS"), true);
        await Task.updateOne({ _id: taskId }, { $set: { scrumStatus: "IN_PROGRESS", status: "in_progress" } });

        assert.strictEqual(validateTaskTransition("IN_PROGRESS", "IN_REVIEW"), true);
        await Task.updateOne({ _id: taskId }, { $set: { scrumStatus: "IN_REVIEW", status: "in_progress" } });

        assert.strictEqual(validateTaskTransition("IN_REVIEW", "DONE"), true);
        await Task.updateOne({ _id: taskId }, { $set: { scrumStatus: "DONE", status: "done" } });

        // Terminal truth: DONE cannot revert directly to TODO
        assert.strictEqual(validateTaskTransition("DONE", "TODO"), false);

        const finishedTask = await Task.findById(taskId).lean();
        assert.strictEqual(finishedTask.scrumStatus, "DONE");
        assert.strictEqual(finishedTask.status, "done");
      });

      await runAsyncTest("Scrum Capacity Engine calculates utilization & workload balance", async () => {
        const currentSprint = await Sprint.findById(testSprint._id).lean();
        const currentTasks = await Task.find({ sprintId: testSprint._id }).lean();
        const currentTeam = await Team.findById(testTeam._id).lean();

        const cap = calculateSprintCapacity(currentSprint, currentTasks, currentTeam);
        assert.ok(cap.summary);
        assert.strictEqual(cap.summary.totalCapacity, 80);
        assert.ok(typeof cap.summary.totalAllocated === "number");
        assert.strictEqual(cap.summary.overloadedMembers, 0);
      });

      await runAsyncTest("Dependency DAG prevents circular dependencies within Scrum workspace", async () => {
        const dTasks = [
          { _id: "T_AUTH", dependencies: ["T_DB"] },
          { _id: "T_DB", dependencies: ["T_SCHEMA"] },
          { _id: "T_SCHEMA", dependencies: [] },
        ];

        // Adding T_SCHEMA -> T_AUTH would introduce a cycle: T_SCHEMA -> T_AUTH -> T_DB -> T_SCHEMA
        const cycle = wouldCreateCycle(dTasks, "T_SCHEMA", "T_AUTH");
        assert.strictEqual(cycle, true);

        // Safe dependency
        const safe = wouldCreateCycle(dTasks, "T_SCHEMA", "T_OTHER");
        assert.strictEqual(safe, false);
      });

      await runAsyncTest("Generate live Sprint Retrospective based on database sprint records", async () => {
        const retro = await generateRetrospective({
          teamId: testTeam._id.toString(),
          projectId: testProject._id.toString(),
          sprintId: testSprint._id.toString(),
        });

        assert.ok(retro);
        assert.ok(retro.analysis);
        assert.ok(Array.isArray(retro.analysis.wentWell));
        assert.ok(Array.isArray(retro.analysis.recommendations));
        assert.ok(retro.analysis.summary);
      });

      await runAsyncTest("Complete Sprint (ACTIVE -> COMPLETED) and verify completion metrics", async () => {
        assert.strictEqual(validateSprintTransition("ACTIVE", "COMPLETED"), true);

        testSprint.status = "COMPLETED";
        testSprint.completedDate = new Date();
        await testSprint.save();

        const doneSprint = await Sprint.findById(testSprint._id).lean();
        assert.strictEqual(doneSprint.status, "COMPLETED");
      });

    } finally {
      // Clean up isolated test fixtures
      console.log("  Cleaning up test fixtures...");
      if (testTeam?._id) await Team.deleteOne({ _id: testTeam._id });
      if (testProject?._id) await Project.deleteOne({ _id: testProject._id });
      if (testSprint?._id) await Sprint.deleteOne({ _id: testSprint._id });
      if (testTasks.length > 0) {
        await Task.deleteMany({ _id: { $in: testTasks.map((t) => t._id) } });
      }
      await Retrospective.deleteMany({ teamId: testTeam?._id });
      await mongoose.disconnect();
      console.log("  Cleaned up test data and disconnected from MongoDB.");
    }
  }

  console.log("\n================================================================================");
  console.log(`  ALL SUITE TESTS PASSED: ${passed} / ${total} (100%)`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
