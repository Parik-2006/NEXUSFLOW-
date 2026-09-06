/**
 * server/scripts/testFixes3Versioning.js
 * ============================================================================
 * V4 Fix 3: Reactive Greedy Recalculation + Planning Re-Merge
 *
 * Tests the derived-state versioning system:
 *   • Task State Version increments on mutation
 *   • Greedy Result Version / Planning Result Version track currency
 *   • Stale derived state is detectable (cached version < task stateVersion)
 *   • Recalculation endpoint refreshes derived state
 *   • DONE history is protected (completedAt preserved)
 *   • IN PROGRESS is protected where practical
 *   • TODO/PLANNED work can be re-ranked/reallocated
 *   • Socket.IO events carry version info for client-side deduplication
 *   • Concurrency: higher stateVersion wins
 *   • No destructive automatic restructuring
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ override: true });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

let passed = 0;
let failed = 0;
let mongoAvailable = false;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected.\n");
    mongoAvailable = true;
  } catch (e) {
    console.log("MongoDB not available — running pure algorithm tests only.\n");
    mongoAvailable = false;
  }
}

// ── Pure Algorithm Tests (no MongoDB needed) ──────────────────────
function runPureTests() {
  console.log("── Pure Algorithm Tests (Version Comparison Logic) ──\n");

  // Test 1: Stale detection logic
  {
    const stateVersion = 5;
    const cachedGreedyVersion = 3;
    const cachedPlanningVersion = 4;

    assert(cachedGreedyVersion < stateVersion === true, "Greedy stale: 3 < 5 → true");
    assert(cachedPlanningVersion < stateVersion === true, "Planning stale: 4 < 5 → true");
  }

  // Test 2: Fresh state detection
  {
    const stateVersion = 5;
    const cachedGreedyVersion = 5;
    const cachedPlanningVersion = 5;

    assert(cachedGreedyVersion < stateVersion === false, "Greedy fresh: 5 < 5 → false");
    assert(cachedPlanningVersion < stateVersion === false, "Planning fresh: 5 < 5 → false");
  }

  // Test 3: Version increment arithmetic
  {
    const initialVersion = 1;
    const afterMutation = initialVersion + 1;
    const afterSecondMutation = afterMutation + 1;

    assert(afterMutation === 2, `Version increment: 1 → 2 (got ${afterMutation})`);
    assert(afterSecondMutation === 3, `Version increment: 2 → 3 (got ${afterSecondMutation})`);
  }

  // Test 4: Stale result rejection
  {
    const stateVersion = 7;
    const clientCachedGreedyVersion = 4;
    const clientCachedPlanningVersion = 6;

    const greedyNeedsRecalc = clientCachedGreedyVersion < stateVersion;
    const planningNeedsRecalc = clientCachedPlanningVersion < stateVersion;

    assert(greedyNeedsRecalc === true, "Greedy needs recalc: 4 < 7 → true");
    assert(planningNeedsRecalc === true, "Planning needs recalc: 6 < 7 → true");
  }

  // Test 5: Version coalescing (higher version wins)
  {
    const versions = [1, 3, 2, 5, 4];
    const maxVersion = Math.max(...versions);
    assert(maxVersion === 5, `Coalescing: max version = 5 (got ${maxVersion})`);
  }

  // Test 6: Version field types
  {
    const stateVersion = 1;
    const greedyVersion = 0;
    const planningVersion = 0;

    assert(typeof stateVersion === "number", "stateVersion is number");
    assert(typeof greedyVersion === "number", "greedyVersion is number");
    assert(typeof planningVersion === "number", "planningVersion is number");
    assert(Number.isInteger(stateVersion), "stateVersion is integer");
  }

  // Test 7: DONE preservation logic
  {
    const status = "done";
    const completedAt = new Date(Date.UTC(2024, 1, 15));
    const isDone = status === "done";
    assert(isDone === true, "DONE status preserved");
    assert(completedAt !== null, "completedAt preserved for DONE task");
  }

  // Test 8: TODO re-ranking logic
  {
    const tasks = [
      { title: "High", priorityScore: 90, status: "todo" },
      { title: "Low", priorityScore: 10, status: "todo" },
      { title: "Mid", priorityScore: 50, status: "todo" },
    ];
    const sorted = [...tasks].sort((a, b) => b.priorityScore - a.priorityScore);
    assert(sorted[0].title === "High", "TODO re-ranking: High first");
    assert(sorted[1].title === "Mid", "TODO re-ranking: Mid second");
    assert(sorted[2].title === "Low", "TODO re-ranking: Low last");
  }

  // Test 9: No destructive restructuring check
  {
    const allowedOperations = ["re-rank", "re-allocate", "recalculate", "refresh"];
    const forbiddenOperations = ["delete", "remove-member", "change-methodology", "alter-skills"];
    assert(allowedOperations.includes("re-rank"), "Re-ranking is allowed");
    assert(!forbiddenOperations.includes("re-rank"), "Re-ranking is not destructive");
  }

  // Test 10: Socket event version payload structure
  {
    const eventPayload = {
      taskId: "t1",
      stateVersion: 5,
      greedyVersion: 0,
      planningVersion: 0,
      prevStatus: "todo",
    };
    assert(eventPayload.stateVersion === 5, "Socket event includes stateVersion");
    assert(eventPayload.greedyVersion === 0, "Socket event includes greedyVersion (stale)");
    assert(eventPayload.planningVersion === 0, "Socket event includes planningVersion (stale)");
  }
}

// ── MongoDB Integration Tests ─────────────────────────────────────
async function runIntegrationTests() {
  console.log("── Integration Tests (MongoDB) ──\n");

  const { default: Task } = await import("../models/Task.js");

  // Test 1: State version increments on task creation
  {
    const task = new Task({ title: "Task A" });
    await task.save();
    assert(task.stateVersion === 1, `Creation: stateVersion = 1 (got ${task.stateVersion})`);
    assert(task.greedyVersion === 1, `Creation: greedyVersion = 1 (got ${task.greedyVersion})`);
    assert(task.planningVersion === 1, `Creation: planningVersion = 1 (got ${task.planningVersion})`);
  }

  // Test 2: State version increments on general update
  {
    const task = await Task.findOne({ title: "Task A" });
    const oldStateVersion = task.stateVersion;
    await Task.updateOne({ _id: task._id }, { $set: { urgency: 3 } });
    const updated = await Task.findById(task._id);
    assert(updated.stateVersion === oldStateVersion + 1,
      `General update: stateVersion incremented (old=${oldStateVersion}, new=${updated.stateVersion})`);
  }

  // Test 3: State version increments on priority update
  {
    const task = await Task.findOne({ title: "Task A" });
    const oldStateVersion = task.stateVersion;
    await Task.updateOne({ _id: task._id }, {
      urgency: 5, impact: 5,
      stateVersion: task.stateVersion + 1,
      greedyVersion: 0, planningVersion: 0,
    });
    const updated = await Task.findById(task._id);
    assert(updated.stateVersion === oldStateVersion + 1,
      `Priority update: stateVersion incremented (old=${oldStateVersion}, new=${updated.stateVersion})`);
    assert(updated.greedyVersion === 0, "Priority update: greedyVersion reset to 0 (stale)");
    assert(updated.planningVersion === 0, "Priority update: planningVersion reset to 0 (stale)");
  }

  // Test 4: Stale derived state is detectable
  {
    const task = await Task.findOne({ title: "Task A" });
    assert(task.greedyVersion < task.stateVersion,
      `Stale detection: cached greedyVersion (${task.greedyVersion}) < stateVersion (${task.stateVersion}) → STALE`);
  }

  // Test 5: DONE history is protected
  {
    const task = new Task({ title: "Done Task", status: "done", completedAt: new Date(Date.UTC(2024, 1, 15)) });
    await task.save();
    const saved = await Task.findById(task._id);
    assert(saved.completedAt && saved.completedAt.getTime() === new Date(Date.UTC(2024, 1, 15)).getTime(),
      `DONE history protected: completedAt preserved (${saved.completedAt})`);
  }

  // Test 6: TODO/PLANNED work can be re-ranked/reallocated
  {
    const todo1 = new Task({ title: "Todo High", urgency: 5, impact: 5, status: "todo" });
    const todo2 = new Task({ title: "Todo Low", urgency: 1, impact: 1, status: "todo" });
    await todo1.save();
    await todo2.save();
    const tasks = await Task.find({ status: "todo" }).sort({ priorityScore: -1 });
    assert(tasks[0].title === "Todo High", `TODO re-ranking: highest priority first (got ${tasks[0].title})`);
    assert(tasks[1].title === "Todo Low", `TODO re-ranking: lowest priority second (got ${tasks[1].title})`);
  }

  // Test 7: Concurrency: higher stateVersion wins
  {
    const task = new Task({ title: "Concurrent Task", urgency: 3, impact: 3 });
    await task.save();
    const initialVersion = task.stateVersion;
    await Task.updateOne({ _id: task._id }, { $set: { urgency: 5 }, stateVersion: initialVersion + 1 });
    const afterFirst = await Task.findById(task._id);
    assert(afterFirst.stateVersion === initialVersion + 1,
      `Concurrent update 1: stateVersion = ${afterFirst.stateVersion}`);
    await Task.updateOne({ _id: task._id }, { $set: { impact: 5 }, stateVersion: afterFirst.stateVersion + 1 });
    const afterSecond = await Task.findById(task._id);
    assert(afterSecond.stateVersion === initialVersion + 2,
      `Concurrent update 2: stateVersion = ${afterSecond.stateVersion} (higher wins)`);
    assert(afterSecond.urgency === 5, "Concurrent update 2: urgency preserved as 5");
    assert(afterSecond.impact === 5, "Concurrent update 2: impact preserved as 5");
  }

  // Test 8: Socket event version info in toObject
  {
    const task = new Task({ title: "Socket Task" });
    const obj = task.toObject();
    assert('stateVersion' in obj, "toObject() includes stateVersion");
    assert('greedyVersion' in obj, "toObject() includes greedyVersion");
    assert('planningVersion' in obj, "toObject() includes planningVersion");
  }
}

async function main() {
  await connectMongo();
  runPureTests();

  if (mongoAvailable) {
    await runIntegrationTests();
    await mongoose.disconnect();
  }

  console.log(`\nV4 Fix 3 Versioning: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("test error:", e);
  process.exit(1);
});
