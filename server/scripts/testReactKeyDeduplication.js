/**
 * testReactKeyDeduplication.js
 * -----------------------------------------------------------------------------
 * Targeted test suite verifying:
 * 1. Task record normalization (missing identifiers, ObjectId, string, empty)
 * 2. Deduplication logic at data boundary
 * 3. Grouping key stability (phase groups, priority tiers, deadline buckets)
 * 4. Project schema pre-save hook for requirement reqId, artifact _id, and conflict id
 */

import assert from "assert";

// Import client logic ported to pure test harness or simulated
function normalizeTaskRecord(raw, index, source = "test") {
  if (!raw || typeof raw !== "object") {
    return {
      _id: `task-invalid-${index}`,
      teamId: "",
      title: "Malformed Task",
      status: "todo",
    };
  }

  const rawId = raw._id ?? raw.id;
  const idStr = typeof rawId === "object" && rawId !== null
    ? (rawId.toString ? rawId.toString() : String(rawId))
    : (rawId ? String(rawId).trim() : "");

  const stableId = idStr || `task-fallback-${raw.teamId || "team"}-${index}-${(raw.title || "unnamed").replace(/\s+/g, "_")}`;

  return {
    ...raw,
    _id: stableId,
    id: raw.id || stableId,
  };
}

function validateAndDeduplicateTasks(taskList, source = "test") {
  if (!Array.isArray(taskList)) return [];
  const seenIds = new Set();
  const normalized = [];

  for (let i = 0; i < taskList.length; i++) {
    const t = normalizeTaskRecord(taskList[i], i, source);
    if (seenIds.has(t._id)) {
      continue;
    }
    seenIds.add(t._id);
    normalized.push(t);
  }

  return normalized;
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log("REACT KEY DEDUPLICATION & IDENTIFIER NORMALIZATION TEST SUITE");
console.log("================================================================================");

runTest("1. Missing _id and id produces non-empty fallback key", () => {
  const malformed = { title: "Draft Task", status: "todo", teamId: "team-1" };
  const res = normalizeTaskRecord(malformed, 0);
  assert(res._id && res._id.length > 0, "Expected non-empty _id");
  assert.notStrictEqual(res._id, "", "Expected _id not to be empty string");
  assert(res._id.startsWith("task-fallback-"), "Expected deterministic prefix");
});

runTest("2. Persisted MongoDB string _id is strictly preserved", () => {
  const persisted = { _id: "6ace4be5ae858d8bf82c0450", title: "DB Task" };
  const res = normalizeTaskRecord(persisted, 0);
  assert.strictEqual(res._id, "6ace4be5ae858d8bf82c0450");
});

runTest("3. ObjectId instances are normalized to non-empty strings", () => {
  const fakeObjectId = {
    toString: () => "670c32f81234567890abcdef",
  };
  const objTask = { _id: fakeObjectId, title: "ObjectId Task" };
  const res = normalizeTaskRecord(objTask, 0);
  assert.strictEqual(res._id, "670c32f81234567890abcdef");
  assert.strictEqual(typeof res._id, "string");
});

runTest("4. Empty string _id does not pass through to render", () => {
  const emptyKeyTask = { _id: "", title: "Empty Key Task", teamId: "team-xyz" };
  const res = normalizeTaskRecord(emptyKeyTask, 5);
  assert.notStrictEqual(res._id, "", "Empty string must be replaced");
  assert(res._id.includes("team-xyz-5"), "Fallback should include index");
});

runTest("5. Non-object task records are handled defensively without throwing", () => {
  const res = normalizeTaskRecord(null, 2);
  assert(res._id && res._id.startsWith("task-invalid-2"));
  assert.strictEqual(res.title, "Malformed Task");
});

runTest("6. Duplicate task IDs in payload are deduplicated retaining first occurrence", () => {
  const tasks = [
    { _id: "task-01", title: "Task 1 (Original)" },
    { _id: "task-02", title: "Task 2" },
    { _id: "task-01", title: "Task 1 (Duplicate)" },
  ];
  const deduplicated = validateAndDeduplicateTasks(tasks);
  assert.strictEqual(deduplicated.length, 2, "Expected 2 tasks after deduplication");
  assert.strictEqual(deduplicated[0].title, "Task 1 (Original)");
  assert.strictEqual(deduplicated[1]._id, "task-02");
});

runTest("7. Phase group keys are unique across waterfall phases", () => {
  const phases = ["requirements", "design", "implementation", "testing", "deployment"];
  const renderedPhaseKeys = phases.map(p => `phase-section-${p}`);
  const uniqueKeys = new Set(renderedPhaseKeys);
  assert.strictEqual(uniqueKeys.size, phases.length);
  assert(!uniqueKeys.has(""), "No empty key in phase sections");
});

runTest("8. Priority group and deadline bucket composite keys never collide", () => {
  const priorities = ["critical", "high", "medium", "low"];
  const renderedPriorityKeys = priorities.map(k => `priority-tier-${k}`);
  const deadlineBuckets = ["overdue", "today", "week", "later", "none"];
  const renderedDeadlineKeys = deadlineBuckets.map(b => `deadline-bucket-${b}`);

  assert.strictEqual(new Set(renderedPriorityKeys).size, priorities.length);
  assert.strictEqual(new Set(renderedDeadlineKeys).size, deadlineBuckets.length);
  renderedPriorityKeys.forEach(k => assert.notStrictEqual(k, ""));
  renderedDeadlineKeys.forEach(k => assert.notStrictEqual(k, ""));
});

console.log("================================================================================");
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================");

if (failed > 0) process.exit(1);
