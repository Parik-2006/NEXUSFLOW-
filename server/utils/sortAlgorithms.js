// server/utils/sortAlgorithms.js
//
// DAA Module — Task Analytics Engine
// -----------------------------------------------------------------------
// Two sorting strategies over a team's task list, ordered by priorityScore
// (desc) then updatedAt (desc). Each run is instrumented so the dashboard
// can render a live complexity comparison.
//
// Bubble Sort  : O(n^2) comparisons/swaps  — naive baseline
// Merge Sort   : O(n log n) comparisons    — production-grade stable sort
// -----------------------------------------------------------------------

/**
 * Comparator: higher priorityScore first; ties broken by most-recently
 * updated first. Falls back to legacy `priority` when priorityScore is absent.
 */
function compareTasks(a, b) {
  const pa = a.priorityScore ?? a.priority ?? 0;
  const pb = b.priorityScore ?? b.priority ?? 0;
  if (pb !== pa) return pb - pa;
  return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
}

/** Bubble Sort — O(n^2) time, O(1) extra space. Naive analytics baseline. */
export function bubbleSortTasks(tasks) {
  const arr = [...tasks];
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;

  for (let i = 0; i < n - 1; i++) {
    let swappedThisPass = false;
    for (let j = 0; j < n - 1 - i; j++) {
      comparisons++;
      if (compareTasks(arr[j], arr[j + 1]) > 0) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swaps++;
        swappedThisPass = true;
      }
    }
    if (!swappedThisPass) break; // best case O(n)
  }

  return { sorted: arr, comparisons, swaps };
}

/** Merge Sort — O(n log n) time, O(n) extra space. Stable, deterministic. */
export function mergeSortTasks(tasks) {
  let comparisons = 0;

  function merge(left, right) {
    const result = [];
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      comparisons++;
      if (compareTasks(left[i], right[j]) <= 0) result.push(left[i++]);
      else result.push(right[j++]);
    }
    while (i < left.length) result.push(left[i++]);
    while (j < right.length) result.push(right[j++]);
    return result;
  }

  function sort(arr) {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    return merge(sort(arr.slice(0, mid)), sort(arr.slice(mid)));
  }

  const sorted = sort([...tasks]);
  return { sorted, comparisons, swaps: 0 };
}

/**
 * Run both algorithms over the same input and return timing + operation
 * metrics for the analytics dashboard.
 */
export function compareSortAlgorithms(tasks) {
  const n = tasks.length;

  const bubbleStart = process.hrtime.bigint();
  const bubble = bubbleSortTasks(tasks);
  const bubbleEnd = process.hrtime.bigint();

  const mergeStart = process.hrtime.bigint();
  const merge = mergeSortTasks(tasks);
  const mergeEnd = process.hrtime.bigint();

  const bubbleMs = Number(bubbleEnd - bubbleStart) / 1e6;
  const mergeMs = Number(mergeEnd - mergeStart) / 1e6;

  return {
    n,
    bubbleSort: { timeMs: round(bubbleMs), comparisons: bubble.comparisons, swaps: bubble.swaps, complexity: "O(n^2)" },
    mergeSort:  { timeMs: round(mergeMs),  comparisons: merge.comparisons,  swaps: merge.swaps,  complexity: "O(n log n)" },
    sorted: merge.sorted,
  };
}

function round(ms) {
  return Math.round(ms * 1000) / 1000;
}
