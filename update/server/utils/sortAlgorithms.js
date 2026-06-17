// server/utils/sortAlgorithms.js
//
// DAA Module — Task Analytics Engine
// -----------------------------------------------------------------------
// Provides two sorting strategies over the team's task list, ordered by
// `priority` (desc) then `updatedAt` (desc), and instruments each run so
// the dashboard can render a live complexity comparison.
//
// Bubble Sort  : O(n^2) comparisons/swaps  — baseline, naive approach
// Merge Sort   : O(n log n) comparisons    — production sort used by the API
// -----------------------------------------------------------------------

/**
 * Comparator: tasks with higher priority come first; ties broken by the
 * most recently updated task first.
 */
function compareTasks(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/**
 * Bubble Sort — O(n^2) time, O(1) extra space.
 * Included purely as the "naive baseline" for the analytics comparison;
 * not used for production sorting once task lists grow.
 */
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
    // Early exit if already sorted — best case O(n).
    if (!swappedThisPass) break;
  }

  return { sorted: arr, comparisons, swaps };
}

/**
 * Merge Sort — O(n log n) time, O(n) extra space.
 * Stable, deterministic, and the algorithm actually used by
 * GET /api/teams/:teamId/tasks to order results for the client.
 */
export function mergeSortTasks(tasks) {
  let comparisons = 0;

  function merge(left, right) {
    const result = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      comparisons++;
      if (compareTasks(left[i], right[j]) <= 0) {
        result.push(left[i++]);
      } else {
        result.push(right[j++]);
      }
    }
    while (i < left.length) result.push(left[i++]);
    while (j < right.length) result.push(right[j++]);
    return result;
  }

  function sort(arr) {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    const left = sort(arr.slice(0, mid));
    const right = sort(arr.slice(mid));
    return merge(left, right);
  }

  const sorted = sort([...tasks]);
  return { sorted, comparisons, swaps: 0 };
}

/**
 * Run both algorithms over the same input and return timing + operation
 * metrics for the analytics dashboard. The dataset is small enough
 * (typical team task lists) that running both is cheap; for very large n
 * the comparison is skipped (see MAX_COMPARISON_SIZE in teams.js).
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
    bubbleSort: {
      timeMs: round(bubbleMs),
      comparisons: bubble.comparisons,
      swaps: bubble.swaps,
      complexity: "O(n^2)",
    },
    mergeSort: {
      timeMs: round(mergeMs),
      comparisons: merge.comparisons,
      swaps: merge.swaps,
      complexity: "O(n log n)",
    },
    sorted: merge.sorted,
  };
}

function round(ms) {
  return Math.round(ms * 1000) / 1000; // 3 decimal places
}
