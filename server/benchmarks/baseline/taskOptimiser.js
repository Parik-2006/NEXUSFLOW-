/**
 * taskOptimiser.js  —  DAA Algorithm Suite for NexusFlow
 * =======================================================
 * Algorithms implemented (all pure functions, zero I/O):
 *
 *  1. Greedy Scheduling      —  value/effort ratio ordering          O(n log n)
 *  2. 0/1 Knapsack DP        —  sprint capacity planning             O(n × W)
 *  3. Topological Sort (DFS) —  dependency-safe execution order      O(V + E)
 *  4. BFS Dependency Levels  —  parallel-execution tier discovery    O(V + E)
 *  5. Merge Sort             —  stable multi-key task sorting        O(n log n)
 *  6. Boyer-Moore-Horspool   —  sub-linear title search              O(n/m) avg
 *
 * The public entry-point is `computeRecommendation(allTasks, sprintCapacity)`.
 * All other exports are exposed for unit-testing.
 *
 * NOTE (de-duplication): the graph-traversal algorithms (Topological Sort and
 * BFS level discovery) are NOT re-implemented here — they delegate to the
 * canonical implementations in ./graphTraversal.js so the whole app shares one
 * source of truth for DFS/BFS/Kahn's. Greedy / Knapsack / Merge Sort /
 * Boyer-Moore remain local because no server-side module exports them.
 */

import { buildGraph, topologicalSort as graphTopologicalSort, bfs as graphBfs } from "./graphTraversal.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GREEDY SPRINT RANKING  (ALGORITHM IDENTITY: GreedySprintRanking)
//    Rank by value/effort ratio (higher = more ROI per story-point).
//    Ties broken by explicit priority field.
//
//    Problem solved : "Which tasks give the best return-on-investment per unit
//                      of effort?" — an ROI ranking that feeds the Knapsack
//                      selection below.
//
//    ⚠ This is NOT the same algorithm as GreedyPriorityScheduler in
//      greedyScheduler.js. That one orders tasks by urgency/impact/dependency
//      weight (a prioritisation problem). This one ranks by value/effort ratio
//      (a knapsack-feeder ROI problem). Different inputs, objective, and output.
//
//    Greedy choice property: at each step the locally optimal pick
//    (highest ratio) belongs to some globally optimal schedule.
//
//    Time : O(n log n)  — one comparison-sort
//    Space: O(n)        — shallow copy of input array
// ─────────────────────────────────────────────────────────────────────────────
export function greedySprintRanking(tasks) {
  return [...tasks].sort((a, b) => {
    const ra = a.value / a.effort;
    const rb = b.value / b.effort;
    if (Math.abs(ra - rb) > 1e-9) return rb - ra; // higher ratio first
    return b.priority - a.priority;               // tie-break: priority
  });
}

// Back-compat alias (kept so any external caller of the old name still works).
export const greedySchedule = greedySprintRanking;

// ─────────────────────────────────────────────────────────────────────────────
// 2. 0/1 KNAPSACK  —  Sprint Capacity Planning
//    Classic bottom-up DP.  Each task is either included (1) or excluded (0).
//    Backtracking recovers the exact selected subset.
//
//    W = sprintCapacity (integer story-points budget).
//
//    Time : O(n × W)
//    Space: O(n × W)  — full table kept for backtrack; reducible to O(W) if
//                       only the optimal value is needed.
// ─────────────────────────────────────────────────────────────────────────────
export function knapsackSprint(tasks, capacity) {
  const n  = tasks.length;
  // (n+1) × (capacity+1) DP table initialised to 0. // rows = tasks, cols = capacity.
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(capacity + 1));

  for (let i = 1; i <= n; i++) {
    const { effort, value } = tasks[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];                                    // exclude
      if (effort <= w) {
        const include = dp[i - 1][w - effort] + value;
        if (include > dp[i][w]) dp[i][w] = include;               // include
      }
    }
  }

  // Backtrack: walk from dp[n][capacity] up to dp[0][*].
  const selected = [];
  let w = capacity;
  for (let i = n; i >= 1; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(tasks[i - 1]);
      w -= tasks[i - 1].effort;
    }
  }

  const effortUsed = capacity - w;
  return {
    selectedTasks : selected.reverse(),
    totalValue    : dp[n][capacity],
    effortUsed,
    capacityLeft  : capacity - effortUsed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOPOLOGICAL SORT  (iterative post-order DFS)
//    Produces a dependency-safe execution ordering.
//    Returns { sorted: Task[], hasCycle: false }
//         or { sorted: null,    hasCycle: true  } on circular dependency.
//
//    Time : O(V + E)   V = |tasks|, E = Σ|dependencies|
//    Space: O(V)       visited + inStack sets + output stack
// ─────────────────────────────────────────────────────────────────────────────
export function topologicalSort(tasks) {
  const sid     = (x) => String(x._id ?? x);
  const taskMap = new Map(tasks.map((t) => [sid(t), t]));

  // Delegate to the canonical Kahn's implementation (graphTraversal.js).
  const { adjList, inDegree } = buildGraph(tasks);
  const { order, hasCycle }   = graphTopologicalSort(adjList, inDegree);

  if (hasCycle) return { sorted: null, hasCycle: true };

  const sorted = order.map((id) => taskMap.get(id)).filter(Boolean);
  return { sorted, hasCycle: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BFS  —  Dependency Level Discovery (Kahn's algorithm variant)
//    Groups tasks into execution waves.  Tasks in wave[k] depend only on
//    tasks in waves 0..k-1 → entire wave can run in parallel.
//
//    Time : O(V + E)
//    Space: O(V)
// ─────────────────────────────────────────────────────────────────────────────
export function bfsDependencyLevels(tasks) {
  // Delegate to the canonical BFS (graphTraversal.js), then group the
  // per-node level map into execution "waves" (levels[0] runs first, …).
  const { adjList, inDegree } = buildGraph(tasks);
  const { levels: levelMap }  = graphBfs(adjList, inDegree);

  const waves = [];
  for (const [id, lvl] of Object.entries(levelMap)) {
    if (lvl < 0) continue;            // nodes inside a cycle (unreachable)
    (waves[lvl] = waves[lvl] ?? []).push(id);
  }
  return waves.map((w) => w ?? []);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MERGE SORT  —  Stable Multi-Key Task Sorting
//    Keys (in order of significance):
//      1. Status weight  : todo(0) → in_progress(1) → done(2)
//      2. Priority       : descending  (higher priority first)
//      3. Effort         : ascending   (quick wins first)
//      4. Title          : ascending   (alphabetic)
//
//    Stability preserves insertion order for tasks with identical keys.
//
//    Time : O(n log n) — all cases (merge sort is not adaptive)
//    Space: O(n)       — auxiliary merge buffer
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_W = { todo: 0, in_progress: 1, done: 2 };

// RUNTIME-SEPARATION NOTE (Task 5): a Merge Sort also exists on the client
// (client/hooks/useTeamTasks.ts). It is NOT shared because the two run in
// different runtimes (Node ESM server vs React Native bundle) and sort by
// different keys (this one: status→priority→effort→title for sprint display;
// the client one: priorityScore/deadline/progress for live list ordering).
// A shared import would couple the bundles and force one comparator on both.
export function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = arr.length >> 1;
  return _merge(mergeSort(arr.slice(0, mid)), mergeSort(arr.slice(mid)));
}

function _merge(L, R) {
  const out = [];
  let i = 0, j = 0;
  while (i < L.length && j < R.length) {
    out.push(_cmp(L[i], R[j]) <= 0 ? L[i++] : R[j++]);
  }
  while (i < L.length) out.push(L[i++]);
  while (j < R.length) out.push(R[j++]);
  return out;
}

function _cmp(a, b) {
  const sw = (STATUS_W[a.status] ?? 0) - (STATUS_W[b.status] ?? 0);
  if (sw)  return sw;
  const pw = b.priority - a.priority;
  if (pw)  return pw;
  const ew = a.effort - b.effort;
  if (ew)  return ew;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. BOYER-MOORE-HORSPOOL  —  Sub-linear Pattern Search
//    Scans task titles for `pattern` using a bad-character shift table.
//    Window slides right by the shift amount derived from the rightmost
//    occurrence of the mismatched character in the pattern.
//
//    Preprocessing: O(|pattern| + σ)   σ = alphabet size (128 ASCII chars)
//    Search        : O(n / m) average  (sub-linear on typical text)
//                    O(n × m) worst    (all-same characters — rare in titles)
//    Space         : O(σ) shift table
//
//    RUNTIME-SEPARATION NOTE (Task 5): a Boyer-Moore search also exists on the
//    client (client/utils/boyerMoore.ts) powering the instant chat search box.
//    It is NOT shared with this server copy because they run in different
//    runtimes (Node ESM vs React Native bundle); the client variant returns
//    {task, matchedFields} for highlighting, while this one filters task docs
//    for the socket `task:search` path. Same algorithm, different I/O contracts.
// ─────────────────────────────────────────────────────────────────────────────
export function boyerMooreSearch(tasks, pattern) {
  if (!pattern || pattern.length === 0) return tasks;

  const pat = pattern.toLowerCase();
  const m   = pat.length;

  // Build Horspool bad-character shift table.
  const shift = new Uint8Array(128).fill(m);
  for (let i = 0; i < m - 1; i++) {
    const c = pat.charCodeAt(i);
    if (c < 128) shift[c] = m - 1 - i;
  }

  function matches(text) {
    const t = text.toLowerCase();
    const n = t.length;
    let   i = m - 1;
    while (i < n) {
      let k = 0;
      while (k < m && pat[m - 1 - k] === t[i - k]) k++;
      if (k === m) return true;                     // pattern found
      const c = t.charCodeAt(i);
      i += (c < 128 ? shift[c] : m);
    }
    return false;
  }

  return tasks.filter((task) => matches(task.title ?? ""));
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATION ENGINE  —  public orchestrator
//
//  Combines all six algorithms into a single, explainable recommendation:
//
//  Phase 1 — BFS: find tasks whose dependencies are all complete (ready set).
//  Phase 2 — Greedy: rank ready tasks by value/effort ratio.
//  Phase 3 — Knapsack: select the optimal subset within sprint capacity.
//  Phase 4 — Merge Sort: stable-sort selected tasks for display.
//  Phase 5 — Topological Sort: compute global execution order labels.
//
//  Overall pipeline complexity (dominated by DP):
//    Time : O(n × W) where n = |todo tasks|, W = sprintCapacity
//    Space: O(n × W) for DP table
// ─────────────────────────────────────────────────────────────────────────────
export function computeRecommendation(allTasks, sprintCapacity = 20) {
  const sid    = (x) => String(x._id ?? x);

  const active  = allTasks.filter((t) => t.status !== "done");
  const todo    = allTasks.filter((t) => t.status === "todo");
  const doneIds = new Set(allTasks.filter((t) => t.status === "done").map(sid));

  // ── Phase 1 : BFS — isolate dependency-free (ready) tasks ─────────────────
  const ready = todo.filter((t) =>
    (t.dependencies ?? []).every((dep) => doneIds.has(String(dep)))
  );

  // ── Phase 2 : Greedy — rank ready tasks by value/effort ratio ─────────────
  const greedyRanked = greedySprintRanking(ready);

  // ── Phase 3 : Knapsack — pick optimal subset within sprint capacity ────────
  const { selectedTasks, totalValue, effortUsed, capacityLeft } =
    knapsackSprint(greedyRanked, sprintCapacity);

  // ── Phase 4 : Merge Sort — stable multi-key sort for display ──────────────
  const displayed = mergeSort(selectedTasks);

  // ── Phase 5 : Topological Sort — global execution sequence labels ──────────
  const { sorted: topoSorted, hasCycle } = topologicalSort(active);
  const topoIndex = new Map((topoSorted ?? []).map((t, i) => [sid(t), i + 1]));

  // ── Build per-task explanation objects ────────────────────────────────────
  const recommendedTasks = displayed.map((t) => ({
    taskId    : sid(t),
    title     : t.title,
    status    : t.status,
    priority  : t.priority,
    effort    : t.effort,
    value     : t.value,
    topoOrder : topoIndex.get(sid(t)) ?? null,
    ratio     : parseFloat((t.value / t.effort).toFixed(2)),
    reason    : `Value/Effort ratio ${(t.value / t.effort).toFixed(2)} · `
              + `Priority ${t.priority} · `
              + `Execution order #${topoIndex.get(sid(t)) ?? "?"}`,
  }));

  // ── Algorithm metadata (shown in viva / UI accordion) ─────────────────────
  const algorithmSummary = {
    bfs: {
      name       : "BFS — Dependency Level Discovery",
      description: "Identifies tasks whose upstream dependencies are all complete, forming the ready-to-start candidate pool.",
      inputStats : `${todo.length} todo tasks · ${doneIds.size} completed deps`,
      outputStats: `${ready.length} dependency-free tasks ready`,
      complexity : { time: "O(V + E)", space: "O(V)" },
    },
    greedy: {
      name       : "GreedySprintRanking (Value / Effort Ratio)",
      description: "Ranks ready tasks by ROI proxy (value ÷ effort). Greedy choice property guarantees this ordering is optimal for the fractional variant and provides a strong heuristic for 0/1 selection.",
      inputStats : `${ready.length} ready tasks`,
      outputStats: `Ranked — top ratio: ${greedyRanked[0] ? (greedyRanked[0].value / greedyRanked[0].effort).toFixed(2) : "n/a"}`,
      complexity : { time: "O(n log n)", space: "O(n)" },
    },
    knapsack: {
      name       : "0/1 Knapsack DP — Sprint Capacity Planning",
      description: "Bottom-up DP selects the exact subset of tasks that maximises total business value without exceeding the sprint story-point budget.",
      inputStats : `${greedyRanked.length} candidates · capacity = ${sprintCapacity} pts`,
      outputStats: `${selectedTasks.length} tasks selected · value ${totalValue} · effort ${effortUsed}/${sprintCapacity} pts`,
      complexity : { time: "O(n × W)", space: "O(n × W)" },
    },
    mergeSort: {
      name       : "Merge Sort — Stable Multi-Key Display Sort",
      description: "Sorts selected tasks by status weight → priority (desc) → effort (asc) → title. Stability preserves knapsack selection order among equal keys.",
      inputStats : `${selectedTasks.length} knapsack-selected tasks`,
      outputStats: "Sorted: todo → in_progress → done, priority desc, effort asc",
      complexity : { time: "O(n log n)", space: "O(n)" },
    },
    topological: {
      name       : "Topological Sort (post-order DFS)",
      description: "Computes a dependency-safe global execution sequence. Labels each recommended task with its execution slot so engineers know which to tackle first.",
      inputStats : `${active.length} active tasks with dependency graph`,
      outputStats: hasCycle
        ? "⚠ Circular dependency detected — execution labels unavailable"
        : `Execution order computed for ${topoSorted?.length ?? 0} tasks`,
      complexity : { time: "O(V + E)", space: "O(V)" },
    },
  };

  return {
    recommendedTasks,
    sprintStats: {
      capacity        : sprintCapacity,
      effortUsed,
      capacityLeft,
      totalValue,
      utilizationPct  : Math.round((effortUsed / sprintCapacity) * 100),
      taskCount       : selectedTasks.length,
      candidateCount  : ready.length,
    },
    algorithmSummary,
    hasCycle,
    generatedAt: new Date().toISOString(),
  };
}
