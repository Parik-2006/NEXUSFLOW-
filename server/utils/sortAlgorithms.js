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

/** Selection Sort — O(n^2) comparisons, ≤ n−1 swaps. */
export function selectionSortTasks(tasks) {
  const arr = [...tasks];
  let comparisons = 0, swaps = 0;
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      comparisons++;
      if (compareTasks(arr[j], arr[min]) < 0) min = j;
    }
    if (min !== i) { [arr[i], arr[min]] = [arr[min], arr[i]]; swaps++; }
  }
  return { sorted: arr, comparisons, swaps };
}

/** Insertion Sort — O(n^2) worst, O(n) best. Shifts counted as swaps. */
export function insertionSortTasks(tasks) {
  const arr = [...tasks];
  let comparisons = 0, swaps = 0;
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0) {
      comparisons++;
      if (compareTasks(arr[j], key) > 0) { arr[j + 1] = arr[j]; swaps++; j--; }
      else break;
    }
    arr[j + 1] = key;
  }
  return { sorted: arr, comparisons, swaps };
}

/** Quick Sort — O(n log n) avg, O(n^2) worst. Lomuto partition, last pivot. */
export function quickSortTasks(tasks) {
  const arr = [...tasks];
  let comparisons = 0, swaps = 0;
  const swap = (i, j) => { if (i !== j) { [arr[i], arr[j]] = [arr[j], arr[i]]; swaps++; } };

  function partition(lo, hi) {
    const pivot = arr[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      comparisons++;
      if (compareTasks(arr[j], pivot) < 0) { swap(i, j); i++; }
    }
    swap(i, hi);
    return i;
  }
  // Iterative to avoid stack overflow on adversarial inputs.
  const stack = [[0, arr.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (lo >= hi) continue;
    const p = partition(lo, hi);
    stack.push([lo, p - 1], [p + 1, hi]);
  }
  return { sorted: arr, comparisons, swaps };
}

function timed(fn, tasks) {
  const start = process.hrtime.bigint();
  const r = fn(tasks);
  const end = process.hrtime.bigint();
  return { ...r, timeMs: round(Number(end - start) / 1e6) };
}

/**
 * Run all five sorting algorithms over the same task set and return per-algorithm
 * timing + operation metrics for the analytics dashboard. All values are derived
 * live from the team's actual tasks.
 */
export function compareSortAlgorithms(tasks) {
  const n = tasks.length;

  const bubble    = timed(bubbleSortTasks, tasks);
  const selection = timed(selectionSortTasks, tasks);
  const insertion = timed(insertionSortTasks, tasks);
  const merge     = timed(mergeSortTasks, tasks);
  const quick     = timed(quickSortTasks, tasks);

  const algorithms = [
    { key: "bubble",    name: "Bubble Sort",    complexity: "O(n^2)",     timeMs: bubble.timeMs,    comparisons: bubble.comparisons,    swaps: bubble.swaps },
    { key: "selection", name: "Selection Sort", complexity: "O(n^2)",     timeMs: selection.timeMs, comparisons: selection.comparisons, swaps: selection.swaps },
    { key: "insertion", name: "Insertion Sort", complexity: "O(n^2)",     timeMs: insertion.timeMs, comparisons: insertion.comparisons, swaps: insertion.swaps },
    { key: "merge",     name: "Merge Sort",     complexity: "O(n log n)", timeMs: merge.timeMs,     comparisons: merge.comparisons,     swaps: merge.swaps },
    { key: "quick",     name: "Quick Sort",     complexity: "O(n log n)", timeMs: quick.timeMs,     comparisons: quick.comparisons,     swaps: quick.swaps },
  ];

  return {
    n,
    algorithms,
    // Back-compat fields for older clients.
    bubbleSort: { timeMs: bubble.timeMs, comparisons: bubble.comparisons, swaps: bubble.swaps, complexity: "O(n^2)" },
    mergeSort:  { timeMs: merge.timeMs,  comparisons: merge.comparisons,  swaps: merge.swaps,  complexity: "O(n log n)" },
    sorted: merge.sorted,
  };
}

function round(ms) {
  return Math.round(ms * 1000) / 1000;
}
