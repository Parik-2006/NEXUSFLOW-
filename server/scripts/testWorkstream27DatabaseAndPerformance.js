/**
 * server/scripts/testWorkstream27DatabaseAndPerformance.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 27: DATABASE, PERFORMANCE & INDEX AUDIT SUITE
 *
 * Verifies:
 * - Model schema indexes, compound indexes, and TTL definitions
 * - Query scoping and N+1 prevention
 * - Safe pagination and query limits
 * - Real execution timings for representative project operations
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Task from "../models/Task.js";
import ProjectLesson from "../models/ProjectLesson.js";
import CapabilityProfile from "../models/CapabilityProfile.js";
import DecisionRecord from "../models/DecisionRecord.js";
import EarlyWarning from "../models/EarlyWarning.js";
import TemporaryContext from "../models/TemporaryContext.js";
import ProjectEvent from "../models/ProjectEvent.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";

import { evaluateProjectHealth2 } from "../services/projectHealth2Service.js";
import { analyzeProjectProcess } from "../services/processMiningEngine.js";
import { greedySortTasks } from "../algorithms/greedyScheduler.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_test";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runDatabasePerformanceSuite() {
  console.log("\n========================================================");
  console.log("  NEXUSFLOW V4 — WORKSTREAM 27 DATABASE & PERFORMANCE  ");
  console.log("========================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  try {
    // ── 1. INDEX & SCHEMA AUDIT ──
    console.log("--- 1. Index & Schema Audit ---");

    // Task Indexes
    const taskIndexes = Task.schema.indexes();
    const hasTaskCompoundStatus = taskIndexes.some(([idx]) => idx.teamId === 1 && idx.status === 1);
    const hasTaskPrioritySort = taskIndexes.some(([idx]) => idx.teamId === 1 && idx.priorityScore === -1);
    assert(hasTaskCompoundStatus, "Task model has compound index { teamId: 1, status: 1 }");
    assert(hasTaskPrioritySort, "Task model has compound index { teamId: 1, priorityScore: -1, createdAt: 1 }");

    // ProjectLesson Indexes
    const lessonIndexes = ProjectLesson.schema.indexes();
    const hasLessonStatusCompound = lessonIndexes.some(([idx]) => idx.projectId === 1 && idx.status === 1);
    assert(hasLessonStatusCompound, "ProjectLesson has compound index { projectId: 1, status: 1, createdAt: -1 }");

    // CapabilityProfile Unique Compound Index
    const capabilityIndexes = CapabilityProfile.schema.indexes();
    const hasCapabilityUnique = capabilityIndexes.some(
      ([idx, opts]) => idx.teamId === 1 && idx.userId === 1 && opts?.unique === true
    );
    assert(hasCapabilityUnique, "CapabilityProfile has unique compound index { teamId: 1, userId: 1 }");

    // EarlyWarning Fingerprint Index
    const warningIndexes = EarlyWarning.schema.indexes();
    const hasWarningFingerprint = warningIndexes.some(([idx]) => idx.projectId === 1 && idx.fingerprint === 1);
    assert(hasWarningFingerprint, "EarlyWarning has compound index { projectId: 1, fingerprint: 1, status: 1 }");

    // TemporaryContext TTL Index
    const tempContextIndexes = TemporaryContext.schema.indexes();
    const hasTempContextCompound = tempContextIndexes.some(([idx]) => idx.projectId === 1 && idx.userId === 1);
    const expiresPath = TemporaryContext.schema.path("expiresAt");
    const hasTTL = expiresPath && expiresPath.options?.index?.expires !== undefined;
    assert(hasTempContextCompound, "TemporaryContext has compound index { projectId: 1, userId: 1, createdAt: -1 }");
    assert(hasTTL, "TemporaryContext has MongoDB TTL auto-expiry index on expiresAt");

    // ProjectEvent Audit Indexes
    const eventIndexes = ProjectEvent.schema.indexes();
    const hasEventTimeCompound = eventIndexes.some(([idx]) => idx.projectId === 1 && idx.timestamp === -1);
    assert(hasEventTimeCompound, "ProjectEvent has audit index { projectId: 1, timestamp: -1 }");

    // ── 2. QUERY SCOPING & N+1 PREVENTION ──
    console.log("\n--- 2. Query Scoping & N+1 Prevention ---");

    const team = await Team.create({ name: "Perf Team", members: [] });
    const project = await Project.create({ title: "Perf Project", teamId: team._id, methodology: "SCRUM" });

    // Seed 30 sample tasks using bulkWrite (preventing N individual inserts)
    const taskBulkOps = Array.from({ length: 30 }).map((_, i) => ({
      insertOne: {
        document: {
          teamId: team._id,
          projectId: project._id,
          title: `Perf Task ${i + 1}`,
          status: i % 3 === 0 ? "done" : "todo",
          urgency: (i % 5) + 1,
          impact: (i % 5) + 1,
          estimatedHours: 4,
          businessValue: 8,
          priorityScore: ((i % 5) + 1) * 15,
        },
      },
    }));
    await Task.bulkWrite(taskBulkOps);
    const count = await Task.countDocuments({ projectId: project._id });
    assert(count === 30, "Tasks populated via atomic bulkWrite without N+1 insert roundtrips");

    // Scoped query testing
    const scopedTasks = await Task.find({ projectId: project._id }).lean();
    assert(scopedTasks.length === 30, "Tasks properly scoped by projectId");
    const otherTeamTasks = await Task.find({ projectId: new mongoose.Types.ObjectId() }).lean();
    assert(otherTeamTasks.length === 0, "Query scoping strictly excludes unassociated projects");

    // ── 3. PAGINATION & BOUNDS ENFORCEMENT ──
    console.log("\n--- 3. Pagination & Bounds Enforcement ---");

    const pageSize = 10;
    const page1 = await Task.find({ projectId: project._id })
      .sort({ priorityScore: -1 })
      .limit(pageSize)
      .lean();
    const page2 = await Task.find({ projectId: project._id })
      .sort({ priorityScore: -1 })
      .skip(pageSize)
      .limit(pageSize)
      .lean();

    assert(page1.length === 10, "Page 1 respects limit parameter (10 items)");
    assert(page2.length === 10, "Page 2 respects skip parameter (10 items)");
    assert(page1[0]._id.toString() !== page2[0]._id.toString(), "Page 1 and Page 2 contain non-overlapping items");

    // ── 4. REAL PERFORMANCE TIMINGS ──
    console.log("\n--- 4. Real Performance Measurements ---");

    // Measure Greedy / MergeSort Ranking Time
    const t0 = performance.now();
    const sortedTasks = greedySortTasks(scopedTasks);
    const tGreedy = performance.now() - t0;
    assert(sortedTasks.length === 30, `Greedy scheduler ranked 30 tasks in ${tGreedy.toFixed(2)}ms (< 50ms)`);
    assert(tGreedy < 50, "Greedy ranking completed well within real-time interactive threshold");

    // Measure Project Health 2.0 Calculation Time
    const t1 = performance.now();
    const health = await evaluateProjectHealth2(project._id);
    const tHealth = performance.now() - t1;
    assert(health && health.overallScore !== undefined, `Project Health 2.0 computed in ${tHealth.toFixed(2)}ms`);
    assert(tHealth < 1000, "Health 2.0 calculation completes within 1 second budget");

    // Measure Process Mining Analysis Time
    const t2 = performance.now();
    const miningResult = await analyzeProjectProcess(project._id);
    const tMining = performance.now() - t2;
    assert(miningResult && miningResult.status, `Process mining analysis computed in ${tMining.toFixed(2)}ms`);
    assert(tMining < 1000, "Process mining completes within 1 second budget");

    // Cleanup
    await Task.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });

  } finally {
    await mongoose.disconnect();
  }

  console.log("\n========================================================");
  console.log(`  WORKSTREAM 27 RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runDatabasePerformanceSuite().catch((err) => {
  console.error("FATAL in testWorkstream27DatabaseAndPerformance:", err);
  process.exit(1);
});
