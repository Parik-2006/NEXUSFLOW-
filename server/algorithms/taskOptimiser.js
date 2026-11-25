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

import { buildGraph, topologicalSort as graphTopologicalSort, executionWaves } from "./graphTraversal.js";
import { solveKnapsack } from "./knapsack.js";
import { searchContains } from "./stringSearch.js";

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
  const ratio = (t) => (Number(t.effort) > 0 ? Number(t.value) / Number(t.effort) : Number(t.value) > 0 ? Infinity : 0);
  return [...tasks].sort((a, b) => {
    const ra = ratio(a), rb = ratio(b);
    if (ra !== rb && Math.abs(ra - rb) > 1e-9) return rb > ra ? 1 : -1; // higher ratio first
    const pd = (Number(b.priority) || 0) - (Number(a.priority) || 0);    // tie-break: priority
    if (pd) return pd;
    const ia = String(a._id ?? a.title ?? ""), ib = String(b._id ?? b.title ?? "");
    return ia < ib ? -1 : ia > ib ? 1 : 0;                                 // then id (code-unit)
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
export function knapsackSprint(tasks, capacity, options = {}) {
  // Phase 3 (D-26): delegates to the canonical exact solver (knapsack.js),
  // which discretises effort in 0.01 units (ceil) and capacity (floor), so
  // fractional efforts such as 2.5 h are handled exactly and the original
  // capacity is never exceeded.
  const items = tasks.map((t, i) => ({ id: t._id !== undefined && t._id !== null ? String(t._id) : `idx:${String(i).padStart(6, "0")}`, effort: t.effort, value: t.value, task: t }));
  const r = solveKnapsack(items, Number(capacity), options);
  const chosen = new Set(r.selected.map((x) => x.id));
  const selectedTasks = items.filter((x) => chosen.has(x.id)).map((x) => x.task); // input order
  return {
    selectedTasks,
    totalValue: r.totalValue,
    effortUsed: r.totalEffort,
    capacityLeft: r.capacityLeft,
    exact: r.exact,
    status: r.status,
    rejected: r.rejected.map((x) => ({ ...x, task: items.find((it) => it.id === x.id)?.task })),
    meta: r.meta,
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
  // Phase 3 (D-25): waves are LONGEST-prerequisite-depth levels computed over
  // a topological order, not first-discovery BFS levels. For A→B, A→C, B→C
  // first-discovery BFS puts B and C together (invalid: C waits for B);
  // longest-path levels give [A], [B], [C]. A cyclic graph yields [] — no
  // executable schedule is claimed.
  const { adjList, inDegree, selfLoops } = buildGraph(tasks);
  const result = executionWaves(adjList, inDegree, { selfLoops });
  return result.valid ? result.waves : [];
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
  const pw = (Number(b.priority) || 0) - (Number(a.priority) || 0);
  if (pw)  return pw;
  const ew = (Number(a.effort) || 0) - (Number(b.effort) || 0);
  if (ew)  return ew;
  const ta = a.title ?? "", tb = b.title ?? "";
  return ta < tb ? -1 : ta > tb ? 1 : 0; // code-unit order: identical on every ICU build
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. BOYER-MOORE-HORSPOOL  —  task title search (see stringSearch.js)
//    Variant: Horspool (bad-character rule on the last window character).
//    Shift table: Map keyed by UTF-16 code unit — no overflow for long
//    patterns, correct shifts for non-ASCII text. Normalisation: NFC + lower.
//    Preprocessing O(m) · search O(n·m) worst, ≈ n/m typical · space O(min(m, σ)).
// ─────────────────────────────────────────────────────────────────────────────
export function boyerMooreSearch(tasks, pattern) {
  // Phase 3 (D-32): Boyer–Moore–Horspool with a Map shift table and
  // NFC + lower-case normalisation (see stringSearch.js). Empty query → all.
  if (pattern === null || pattern === undefined || String(pattern).trim() === "") return tasks;
  return tasks.filter((task) => searchContains(task.title ?? "", pattern));
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
  // A prerequisite blocks only if it exists in the active task set and is not
  // done; references to deleted / archived / foreign tasks are ignored.
  const known = new Set(allTasks.map(sid));
  const ready = todo.filter((t) =>
    (t.dependencies ?? []).every((dep) => !known.has(String(dep)) || doneIds.has(String(dep)))
  );

  // ── Phase 2 : Greedy — rank ready tasks by value/effort ratio ─────────────
  const greedyRanked = greedySprintRanking(ready);

  // ── Phase 3 : Knapsack — pick optimal subset within sprint capacity ────────
  const knap = knapsackSprint(greedyRanked, sprintCapacity);
  const { selectedTasks, totalValue, effortUsed, capacityLeft } = knap;

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
      name       : "Dependency readiness filter",
      description: "Keeps only To-Do tasks whose prerequisites (edges A → B: A before B) are all complete. Knapsack then optimises over this ready pool only — it is NOT a precedence-constrained knapsack.",
      inputStats : `${todo.length} todo tasks · ${doneIds.size} completed deps`,
      outputStats: `${ready.length} dependency-free tasks ready`,
      complexity : { time: "O(V + E)", space: "O(V)" },
    },
    greedy: {
      name       : "GreedySprintRanking (Value / Effort Ratio)",
      description: "Ranks ready tasks by ROI proxy (value ÷ effort). This ordering is optimal for the FRACTIONAL knapsack; for 0/1 selection it is only a heuristic, so the exact DP below makes the decision.",
      inputStats : `${ready.length} ready tasks`,
      outputStats: `Ranked — top ratio: ${greedyRanked[0] ? (greedyRanked[0].value / greedyRanked[0].effort).toFixed(2) : "n/a"}`,
      complexity : { time: "O(n log n)", space: "O(n)" },
    },
    knapsack: {
      name       : knap.exact ? "0/1 Knapsack DP — Sprint Capacity Planning (exact)" : "0/1 Knapsack — approximate (workload limit exceeded)",
      description: knap.exact
        ? "Bottom-up DP over effort discretised to 0.01 units (task effort rounded up, capacity rounded down) selects the value-maximising subset that never exceeds capacity."
        : "The exact DP table would exceed the safe workload limit; a deterministic greedy + best-single-item approximation (≥ 50% of optimum) was used instead.",
      inputStats : `${greedyRanked.length} candidates · capacity = ${sprintCapacity}`,
      outputStats: `${selectedTasks.length} tasks selected · value ${totalValue} · effort ${effortUsed}/${sprintCapacity}`,
      complexity : { time: "O(n × W)", space: "O(W) + O(n × W) bits" },
      exact      : knap.exact,
      dpCells    : knap.meta?.cells ?? 0,
    },
    mergeSort: {
      name       : "Merge Sort — Stable Multi-Key Display Sort",
      description: "Sorts selected tasks by status weight → priority (desc) → effort (asc) → title. Stability preserves knapsack selection order among equal keys.",
      inputStats : `${selectedTasks.length} knapsack-selected tasks`,
      outputStats: "Sorted: todo → in_progress → done, priority desc, effort asc",
      complexity : { time: "O(n log n)", space: "O(n)" },
    },
    topological: {
      name       : "Topological Sort (Kahn's algorithm + min-heap)",
      description: "Computes a dependency-safe global execution sequence. Labels each recommended task with its execution slot so engineers know which to tackle first.",
      inputStats : `${active.length} active tasks with dependency graph`,
      outputStats: hasCycle
        ? "⚠ Circular dependency detected — execution labels unavailable"
        : `Execution order computed for ${topoSorted?.length ?? 0} tasks`,
      complexity : { time: "O(E + V log V)", space: "O(V + E)" },
    },
  };

  return {
    recommendedTasks,
    sprintStats: {
      capacity        : sprintCapacity,
      effortUsed,
      capacityLeft,
      totalValue,
      utilizationPct  : sprintCapacity > 0 ? Math.round((effortUsed / sprintCapacity) * 100) : 0,
      exact           : knap.exact,
      taskCount       : selectedTasks.length,
      candidateCount  : ready.length,
    },
    algorithmSummary,
    hasCycle,
    generatedAt: new Date().toISOString(),
  };
}
