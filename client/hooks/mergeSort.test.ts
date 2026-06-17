/**
 * mergeSort.test.ts  — NexusFlow v2
 *
 * Unit tests for the Merge Sort implementation in useTeamTasks.ts.
 * Run with:  npx jest mergeSort.test.ts
 *
 * These tests demonstrate:
 *   1. Correctness across all three SortMode comparators.
 *   2. Stability (equal elements preserve original relative order).
 *   3. Edge cases: empty array, single element, already-sorted, reverse-sorted.
 *   4. The original array is NOT mutated (immutability contract).
 *
 * For the viva: the examiner may ask "how do you verify your sort is
 * correct?"  Point to these tests.
 */

import {
  mergeSort,
  comparePriority,
  compareDeadline,
  compareProgress,
  SortMode,
} from "../hooks/useTeamTasks";
import type { Task } from "../hooks/useTeamTasks";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder
// ─────────────────────────────────────────────────────────────────────────────

const makeTask = (
  id: string,
  overrides: Partial<Task> = {}
): Task => ({
  _id: id,
  teamId: "team1",
  title: `Task ${id}`,
  status: "todo",
  priorityScore: 50,
  progress: 0,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeSort — edge cases", () => {
  it("returns [] for empty input", () => {
    expect(mergeSort([], comparePriority)).toEqual([]);
  });

  it("returns a copy for single-element input", () => {
    const t = makeTask("A");
    const result = mergeSort([t], comparePriority);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(t);
  });

  it("does not mutate the source array", () => {
    const tasks = [makeTask("A", { priorityScore: 10 }), makeTask("B", { priorityScore: 90 })];
    const original = [...tasks];
    mergeSort(tasks, comparePriority);
    expect(tasks[0]._id).toBe(original[0]._id); // source unchanged
  });
});

describe("comparePriority + mergeSort", () => {
  it("sorts by priorityScore DESC", () => {
    const tasks = [
      makeTask("low",  { priorityScore: 10 }),
      makeTask("high", { priorityScore: 90 }),
      makeTask("mid",  { priorityScore: 50 }),
    ];
    const sorted = mergeSort(tasks, comparePriority);
    expect(sorted.map((t) => t._id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties by deadline ASC", () => {
    const tasks = [
      makeTask("A", { priorityScore: 80, deadline: "2025-12-31" }),
      makeTask("B", { priorityScore: 80, deadline: "2025-06-01" }),
    ];
    const sorted = mergeSort(tasks, comparePriority);
    expect(sorted[0]._id).toBe("B"); // earlier deadline wins
  });

  it("tasks without deadline sort AFTER tasks with deadline on tie", () => {
    const tasks = [
      makeTask("no-dl", { priorityScore: 80, deadline: undefined }),
      makeTask("has-dl", { priorityScore: 80, deadline: "2025-01-01" }),
    ];
    const sorted = mergeSort(tasks, comparePriority);
    expect(sorted[0]._id).toBe("has-dl");
  });
});

describe("compareDeadline + mergeSort", () => {
  it("sorts by earliest deadline first", () => {
    const tasks = [
      makeTask("C", { deadline: "2025-09-01" }),
      makeTask("A", { deadline: "2025-03-15" }),
      makeTask("B", { deadline: "2025-06-30" }),
    ];
    const sorted = mergeSort(tasks, compareDeadline);
    expect(sorted.map((t) => t._id)).toEqual(["A", "B", "C"]);
  });

  it("tasks with no deadline sort to end", () => {
    const tasks = [
      makeTask("no-dl"),
      makeTask("has-dl", { deadline: "2025-01-01" }),
    ];
    const sorted = mergeSort(tasks, compareDeadline);
    expect(sorted[0]._id).toBe("has-dl");
    expect(sorted[1]._id).toBe("no-dl");
  });
});

describe("compareProgress + mergeSort", () => {
  it("sorts by lowest progress first (blocked tasks surface)", () => {
    const tasks = [
      makeTask("done",    { progress: 100 }),
      makeTask("blocked", { progress: 0   }),
      makeTask("partial", { progress: 45  }),
    ];
    const sorted = mergeSort(tasks, compareProgress);
    expect(sorted.map((t) => t._id)).toEqual(["blocked", "partial", "done"]);
  });
});

describe("stability", () => {
  it("preserves original relative order for equal elements", () => {
    // All tasks have identical priorityScore and no deadline.
    const tasks = [
      makeTask("first",  { priorityScore: 50 }),
      makeTask("second", { priorityScore: 50 }),
      makeTask("third",  { priorityScore: 50 }),
    ];
    const sorted = mergeSort(tasks, comparePriority);
    // Stable sort: original order preserved.
    expect(sorted.map((t) => t._id)).toEqual(["first", "second", "third"]);
  });
});

describe("already-sorted and reverse-sorted inputs", () => {
  const desc = [
    makeTask("a", { priorityScore: 90 }),
    makeTask("b", { priorityScore: 60 }),
    makeTask("c", { priorityScore: 30 }),
  ];
  const asc = [...desc].reverse();

  it("handles already-sorted DESC input", () => {
    const result = mergeSort(desc, comparePriority);
    expect(result.map((t) => t._id)).toEqual(["a", "b", "c"]);
  });

  it("handles reverse-sorted (ASC) input", () => {
    const result = mergeSort(asc, comparePriority);
    expect(result.map((t) => t._id)).toEqual(["a", "b", "c"]);
  });
});
