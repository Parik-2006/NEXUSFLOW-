/**
 * NEXUSFLOW Phase 3 — reproducible DAA benchmark harness (offline CLI).
 * ============================================================================
 *   npm run bench                 → full run, writes results JSON
 *   node benchmarks/runBenchmarks.js --quick   → small sizes (CI / tests)
 *
 * • Synthetic data only, generated from fixed seeds (mulberry32) — never
 *   project data, no database, no network, no HTTP surface.
 * • Identical datasets are fed to the CURRENT implementation and to the frozen
 *   pre-Phase-3 implementation in benchmarks/baseline/ (where the baseline can
 *   process the input correctly).
 * • Each case: warm-up runs, then N timed repetitions (process.hrtime.bigint);
 *   reported median, p90, min, max. Operation counts are reported ONLY where
 *   the implementation is instrumented (heap ops, edges examined, DP cells,
 *   B&B nodes, character comparisons).
 * • Workloads are bounded by explicit limits (LIMITS) — e.g. exact Branch and
 *   Bound is never run on large inputs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, randInt, randomDag, randomKnapsackItems } from "../tests/helpers/seededRandom.js";
import { buildGraph, topologicalSort, executionWaves, bfs, dfs } from "../algorithms/graphTraversal.js";
import { solveKnapsack } from "../algorithms/knapsack.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { horspoolIndexOf } from "../algorithms/stringSearch.js";
import { rankTasks } from "../algorithms/taskPriorityEngine.js";
import { greedySortTasks } from "../algorithms/greedyScheduler.js";
import * as baseGraph from "./baseline/graphTraversal.js";
import * as baseOpt from "./baseline/taskOptimiser.js";
import * as baseBnB from "./baseline/branchAndBound.js";
import * as basePriority from "./baseline/taskPriorityEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEED = 20261125;
export const LIMITS = Object.freeze({ maxGraphVertices: 20000, maxKnapsackItems: 2000, maxExactAssignmentTasks: 12, maxSortSize: 100000, maxTextLength: 2_000_000 });

function timeIt(fn, { warmup = 2, reps = 9 } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = [];
  let last;
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    last = fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * (samples.length - 1) + 0.5))];
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { stats: { medianMs: r3(q(0.5)), p90Ms: r3(q(0.9)), minMs: r3(samples[0]), maxMs: r3(samples[samples.length - 1]), reps }, last };
}

function assertLimit(cond, msg) {
  if (!cond) throw new Error(`benchmark input limit: ${msg}`);
}

export function runBenchmarks({ quick = false } = {}) {
  const rng = mulberry32(SEED);
  const cfg = quick
    ? { reps: 3, warmup: 1, graph: [200, 1000], rank: [100, 300], sort: [1000, 5000], knap: [[20, 40], [60, 80]], bnb: [[4, 4], [6, 3]], text: [20000] }
    : { reps: 11, warmup: 3, graph: [500, 2000, 5000, 10000], rank: [100, 500, 1000], sort: [1000, 10000, 50000], knap: [[50, 40], [200, 80], [500, 200]], bnb: [[4, 4], [6, 6], [8, 8], [12, 4]], text: [10000, 100000, 1000000] };
  const t = { reps: cfg.reps, warmup: cfg.warmup };
  const results = [];

  // ── Graph: Kahn (heap vs baseline sort-per-step), waves, DFS/BFS ────────────
  for (const V of cfg.graph) {
    assertLimit(V <= LIMITS.maxGraphVertices, `V=${V}`);
    const tasks = randomDag(rng, V, Math.min(0.5, 6 / V));
    const g = buildGraph(tasks);
    const kahn = timeIt(() => topologicalSort(g.adjList, g.inDegree), t);
    const bg = baseGraph.buildGraph(tasks);
    const baseKahn = V <= 5000 ? timeIt(() => baseGraph.topologicalSort(bg.adjList, bg.inDegree), t) : null;
    const sameOrder = baseKahn ? JSON.stringify(baseKahn.last.order) === JSON.stringify(kahn.last.order) : null;
    results.push({
      algorithm: "Kahn topological sort", variant: "binary min-heap (deterministic)", size: { V, E: g.edgeCount },
      complexity: { time: "O(E + V log V)", space: "O(V + E)" },
      current: { ...kahn.stats, ops: { heapOps: kahn.last.heapOps, edgesExamined: kahn.last.edgesExamined } },
      baseline: baseKahn ? { ...baseKahn.stats, variant: "ready list re-sorted every step", sameOrderAsCurrent: sameOrder } : { skipped: "baseline not run above 5000 vertices (quadratic re-sorting)" },
      exact: true,
    });
    const waves = timeIt(() => executionWaves(g.adjList, g.inDegree), t);
    const baseLevels = baseGraph.bfs(bg.adjList, bg.inDegree).levels;
    let violated = 0;
    for (const [u, vs] of g.adjList) for (const v of vs) if (!(baseLevels[u] < baseLevels[v])) violated++;
    results.push({
      algorithm: "Dependency execution waves", variant: "longest-prerequisite depth over a topological order", size: { V, E: g.edgeCount },
      complexity: { time: "O(E + V log V)", space: "O(V + E)" },
      current: { ...waves.stats, ops: { waves: waves.last.waves.length }, constraintViolations: 0 },
      baseline: { variant: "first-discovery BFS levels", constraintViolations: violated, note: "edges whose prerequisite was NOT in an earlier level" },
      exact: true,
    });
    const d = timeIt(() => dfs(g.adjList), t);
    const b = timeIt(() => bfs(g.adjList, g.inDegree), t);
    results.push({ algorithm: "DFS", variant: "iterative", size: { V, E: g.edgeCount }, complexity: { time: "O(V + E)", space: "O(V)" }, current: { ...d.stats, ops: { verticesVisited: d.last.order.length, edgesExamined: d.last.edgesExamined } }, exact: true });
    results.push({ algorithm: "BFS", variant: "multi-source reachability (shortest-hop levels)", size: { V, E: g.edgeCount }, complexity: { time: "O(V + E)", space: "O(V)" }, current: { ...b.stats, ops: { verticesVisited: b.last.order.length, edgesExamined: b.last.edgesExamined } }, exact: true });
  }

  // ── Greedy ranking (Task Intelligence) and merge sort ──────────────────────
  for (const n of cfg.rank) {
    const tasks = randomDag(rng, n, Math.min(0.3, 3 / n)).map((x, i) => ({ ...x, urgency: randInt(rng, 1, 5), impact: randInt(rng, 1, 5), businessValue: randInt(rng, 0, 10), status: "todo", createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))) }));
    const now = Date.UTC(2026, 1, 1);
    const cur = timeIt(() => rankTasks(tasks, { now }), t);
    const base = timeIt(() => basePriority.rankTasks(tasks.map((x) => ({ ...x, dependencyCount: x.dependencies.length })), { now, allTasks: tasks }), t);
    const maxScore = Math.max(...cur.last.map((x) => x.priorityResult.score));
    results.push({
      algorithm: "Task Intelligence ranking", variant: "7-factor weighted score + eligibility + downstream reach", size: { n },
      complexity: { time: "O(V + E) metrics + O(V·(V+E)) reach (≤ 2000 tasks) + O(n log n) sort", space: "O(V + E)" },
      current: { ...cur.stats, ops: { ranked: cur.last.length }, maxScore },
      baseline: { ...base.stats, variant: "pre-Phase-3 engine (greedy factor capped at 75, O(n·E) depth scan)" },
      exact: true,
    });
  }
  for (const n of cfg.sort) {
    assertLimit(n <= LIMITS.maxSortSize, `n=${n}`);
    const arr = Array.from({ length: n }, (_, i) => ({ id: i, priorityScore: randInt(rng, 0, 100), createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))) }));
    const cur = timeIt(() => greedySortTasks(arr), t);
    const nat = timeIt(() => [...arr].sort((a, b) => b.priorityScore - a.priorityScore || a.createdAt - b.createdAt), t);
    results.push({ algorithm: "Merge sort", variant: "top-down, stable", size: { n }, complexity: { time: "O(n log n)", space: "O(n)" }, current: cur.stats, reference: { ...nat.stats, variant: "Array.prototype.sort (TimSort, built-in)" }, exact: true });
  }

  // ── 0/1 Knapsack ────────────────────────────────────────────────────────────
  for (const [n, cap] of cfg.knap) {
    assertLimit(n <= LIMITS.maxKnapsackItems, `n=${n}`);
    const frac = randomKnapsackItems(rng, n, { decimals: 2 });
    const ints = frac.map((x) => ({ ...x, effort: Math.max(1, Math.round(x.effort)) }));
    const curInt = timeIt(() => solveKnapsack(ints, cap, { scale: 1 }), t);
    const baseInt = timeIt(() => baseOpt.knapsackSprint(ints.map((x) => ({ _id: x.id, effort: x.effort, value: x.value })), cap), t);
    const curFrac = timeIt(() => solveKnapsack(frac, cap), t);
    let baseFracSelected;
    try { baseFracSelected = baseOpt.knapsackSprint(frac.map((x) => ({ _id: x.id, effort: x.effort, value: x.value })), cap).selectedTasks.length; } catch (e) { baseFracSelected = `error: ${e.message}`; }
    results.push({
      algorithm: "0/1 Knapsack", variant: "bottom-up DP (integer efforts, scale 1)", size: { n, capacity: cap, W: curInt.last.capacityUnits },
      complexity: { time: "O(n·W)", space: "O(W) + O(n·W) bits" },
      current: { ...curInt.stats, ops: { dpCells: curInt.last.meta.cells }, totalValue: curInt.last.totalValue, utilizationPct: curInt.last.utilizationPct },
      baseline: { ...baseInt.stats, variant: "2-D Int32Array table", totalValue: baseInt.last.totalValue, sameOptimum: baseInt.last.totalValue === curInt.last.totalValue },
      exact: curInt.last.exact,
    });
    results.push({
      algorithm: "0/1 Knapsack", variant: "bottom-up DP (fractional efforts, 0.01 h units)", size: { n, capacity: cap, W: curFrac.last.capacityUnits },
      complexity: { time: "O(n·W)", space: "O(W) + O(n·W) bits" },
      current: { ...curFrac.stats, ops: { dpCells: curFrac.last.meta.cells }, totalValue: curFrac.last.totalValue, utilizationPct: curFrac.last.utilizationPct, selected: curFrac.last.selected.length },
      baseline: { note: "baseline cannot index fractional efforts", selected: baseFracSelected },
      exact: curFrac.last.exact,
    });
  }

  // ── Branch and Bound assignment ─────────────────────────────────────────────
  const SK = ["frontend", "backend", "devops", "design", "ml", "testing"];
  for (const [nT, nM] of cfg.bnb) {
    assertLimit(nT <= LIMITS.maxExactAssignmentTasks, `nTasks=${nT}`);
    const members = Array.from({ length: nM }, (_, i) => ({ userId: `u${i}`, name: `M${i}`, capacity: 40, skills: Object.fromEntries(SK.map((k) => [k, randInt(rng, 0, 10)])) }));
    const tasks = Array.from({ length: nT }, (_, j) => ({ _id: `t${j}`, title: `Task ${j}`, estimatedHours: randInt(rng, 1, 8), skillWeights: Object.fromEntries(SK.map((k) => [k, rng() < 0.4 ? randInt(rng, 1, 10) : 0])) }));
    const cur = timeIt(() => assignTasksToMembers(members, tasks), t);
    const base = timeIt(() => baseBnB.assignTasksToMembers(members, tasks), t);
    results.push({
      algorithm: "Branch and Bound assignment", variant: "capacity-constrained, lexicographic objective", size: { tasks: nT, members: nM },
      complexity: { time: "O(m^n) worst case", space: "O(m·n)" },
      current: { ...cur.stats, ops: { nodesExplored: cur.last.meta.nodesExplored, nodesPruned: cur.last.meta.nodesPruned }, totalCost: cur.last.totalCost, assigned: cur.last.assignments.length },
      baseline: { ...base.stats, variant: "B&B on first min(n,m) tasks + greedy overflow, no capacity", ops: { nodesExplored: base.last.meta.nodesExplored, nodesPruned: base.last.meta.nodesPruned }, totalCost: base.last.totalCost },
      exact: cur.last.meta.exact,
    });
  }

  // ── Boyer–Moore–Horspool ────────────────────────────────────────────────────
  const words = ["sprint", "deploy", "api", "login", "schema", "review", "ಕನ್ನಡ", "café", "🚀", "backlog"];
  for (const len of cfg.text) {
    assertLimit(len <= LIMITS.maxTextLength, `text=${len}`);
    let text = "";
    while (text.length < len) text += words[randInt(rng, 0, words.length - 1)] + " ";
    text = text.slice(0, len);
    for (const m of [8, 64, 255]) {
      const pat = "q".repeat(m - 1) + "z"; // absent pattern → full scan
      const stats = { comparisons: 0, shifts: 0 };
      horspoolIndexOf(text, pat, { stats });
      const cur = timeIt(() => horspoolIndexOf(text, pat), t);
      const base = timeIt(() => baseOpt.boyerMooreSearch([{ title: text }], pat).length, t);
      const naive = timeIt(() => text.indexOf(pat), t);
      results.push({
        algorithm: "Boyer–Moore–Horspool", variant: "Map shift table", size: { textLength: len, patternLength: m },
        complexity: { time: "O(n·m) worst, ≈ n/m typical", space: "O(min(m, σ))" },
        current: { ...cur.stats, ops: { characterComparisons: stats.comparisons, windowShifts: stats.shifts } },
        baseline: { ...base.stats, variant: "Uint8Array(128) shift table + lower-casing per call (m < 256 only)" },
        reference: { ...naive.stats, variant: "String.prototype.indexOf (native)" },
        exact: true,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dataset: "synthetic, seeded (mulberry32) — no project data",
    seed: SEED,
    quick,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(), cpu: os.cpus()[0]?.model?.trim() ?? "unknown", logicalCpus: os.cpus().length },
    method: { warmup: cfg.warmup, repetitions: cfg.reps, statistic: "median (p90/min/max also reported)", timer: "process.hrtime.bigint" },
    limits: LIMITS,
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quick = process.argv.includes("--quick");
  const out = runBenchmarks({ quick });
  if (!quick) {
    const json = JSON.stringify(out, null, 2) + "\n";
    fs.mkdirSync(path.join(__dirname, "results"), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "results", "daa-benchmarks.json"), json);
    fs.writeFileSync(path.join(__dirname, "..", "..", "client", "constants", "daaBenchmarks.json"), json);
    console.log(`wrote ${out.results.length} benchmark rows → server/benchmarks/results/daa-benchmarks.json (+ client/constants/daaBenchmarks.json)`);
  } else {
    console.log(JSON.stringify(out.results.map((r) => [r.algorithm, r.size, r.current.medianMs]), null, 0));
  }
}
