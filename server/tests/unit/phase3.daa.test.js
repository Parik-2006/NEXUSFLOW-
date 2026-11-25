/**
 * NEXUSFLOW Phase 3 — DAA reference-correctness and property tests (pure, no DB).
 * Every algorithm is checked against an INDEPENDENT reference (brute force,
 * exhaustive search, naive matching, hand-computed formulas) or invariants.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { computePriorityScore, computePriorityComponents, resolveWeights, greedySortTasks, DEP_CAP } from "../../algorithms/greedyScheduler.js";
import { computeTaskPriority, rankTasks, DEFAULT_WEIGHTS, resolvePriorityWeights } from "../../algorithms/taskPriorityEngine.js";
import { buildGraph, topologicalSort, topologicalSortFifo, executionWaves, bfs, dfs, dependencyMetrics, reachableFrom } from "../../algorithms/graphTraversal.js";
import * as baselineGraph from "../../benchmarks/baseline/graphTraversal.js";
import { solveKnapsack, bruteForceKnapsack } from "../../algorithms/knapsack.js";
import { knapsackSprint, bfsDependencyLevels, boyerMooreSearch, mergeSort } from "../../algorithms/taskOptimiser.js";
import { assignTasksToMembers, exhaustiveAssignment } from "../../algorithms/branchAndBound.js";
import { horspoolIndexOf, horspoolAllMatches, searchContains, normalizeForSearch, normalizeQuery, validateSearchQuery, MAX_QUERY_LENGTH } from "../../algorithms/stringSearch.js";
import { evaluateDecision } from "../../algorithms/decisionEngine.js";
import { mulberry32, randInt, randomDag, randomKnapsackItems } from "../helpers/seededRandom.js";

const ids = (arr) => arr.map((t) => String(t._id ?? t));

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1 — greedy normalisation (D-22)", () => {
  test("minimum and maximum scores are exactly 0 and 100", () => {
    assert.equal(computePriorityScore({ urgency: 1, impact: 1, dependentCount: 0 }), 0);
    assert.equal(computePriorityScore({ urgency: 5, impact: 5, dependentCount: DEP_CAP }), 100);
    assert.equal(computePriorityScore({ urgency: 5, impact: 5, dependentCount: 999 }), 100, "saturates, never exceeds");
  });

  test("matches an EXACT integer reference for every input on the domain grid", () => {
    // 100·(0.5(u−1)/4 + 0.35(i−1)/4 + 0.15·d/20) = (50(u−1) + 35(i−1) + 3d) / 4 exactly,
    // and round-half-up(N/4) = floor((N + 2)/4) in integer arithmetic.
    for (let u = 1; u <= 5; u++) for (let i = 1; i <= 5; i++) for (let d = 0; d <= DEP_CAP; d++) {
      const N = 50 * (u - 1) + 35 * (i - 1) + 3 * d;
      assert.equal(computePriorityScore({ urgency: u, impact: i, dependentCount: d }), Math.floor((N + 2) / 4), `u=${u} i=${i} d=${d}`);
    }
  });

  test("missing / invalid values follow the documented policy (minimum) and stay finite", () => {
    for (const bad of [undefined, null, "", "abc", NaN, Infinity, -Infinity]) {
      const s = computePriorityScore({ urgency: bad, impact: bad, dependentCount: bad });
      assert.ok(Number.isFinite(s) && s === 0, `value ${String(bad)} → ${s}`);
    }
    assert.equal(computePriorityScore({ urgency: 99, impact: -4, dependentCount: -3 }), 50, "out-of-range clamps to [1,5] / ≥0");
  });

  test("monotonic in every factor", () => {
    for (let u = 1; u < 5; u++) assert.ok(computePriorityScore({ urgency: u + 1, impact: 3 }) >= computePriorityScore({ urgency: u, impact: 3 }));
    for (let d = 0; d < 25; d++) assert.ok(computePriorityScore({ urgency: 2, dependentCount: d + 1 }) >= computePriorityScore({ urgency: 2, dependentCount: d }));
  });

  test("weight validation rejects invalid sets and normalises valid ones", () => {
    const d = { a: 0.5, b: 0.5 };
    assert.equal(resolveWeights({ a: -1 }, d).valid, false);
    assert.equal(resolveWeights({ a: "x" }, d).valid, false);
    assert.equal(resolveWeights({ a: 0, b: 0 }, d).valid, false);
    const r = resolveWeights({ a: 3, b: 1 }, d);
    assert.equal(r.valid, true);
    assert.equal(r.weights.a, 0.75);
    assert.equal(r.weights.b, 0.25);
  });

  test("REGRESSION: Task Intelligence reaches 100 when every factor is maximal (old engine capped the greedy factor at 75)", async () => {
    const now = Date.UTC(2026, 0, 10);
    const hub = { _id: "hub", title: "hub", urgency: 5, impact: 5, businessValue: 10, dueDate: new Date(now - 86_400_000), requiredSkills: ["x"], assignedTo: "m1", status: "todo" };
    const deps = Array.from({ length: 20 }, (_, i) => ({ _id: `d${i}`, title: `d${i}`, dependencies: ["hub"], status: "todo" }));
    const ctx = { now, allTasks: [hub, ...deps], riskTaskIds: new Set(["hub"]), teamSkills: { m1: { x: 1 } }, memberWorkload: { m1: { load: 0, capacity: 40 } }, weights: { greedy: 0.35, deadline: 0.2, value: 0.15, risk: 0.1, depth: 0.1, skillGap: 0.05, overload: 0.05 } };
    const r = computeTaskPriority(hub, { ...ctx, weights: { ...ctx.weights, risk: 0 } });
    // risk factor maxes at 90 by design; with risk weight 0 every remaining factor is 100.
    assert.equal(r.factors.greedy.score, 100);
    assert.equal(r.score, 100);
    const old = await import("../../benchmarks/baseline/taskPriorityEngine.js");
    const oldR = old.computeTaskPriority({ ...hub, dependencyCount: 20 }, ctx);
    assert.equal(oldR.factors.greedy.score, 75, "baseline reproduces the D-22 cap");
  });

  test("final score equals Σ weight × factor (contributions consistent with displayed score)", () => {
    const rng = mulberry32(22);
    for (let k = 0; k < 200; k++) {
      const t = { _id: `x${k}`, urgency: randInt(rng, 1, 5), impact: randInt(rng, 1, 5), businessValue: randInt(rng, 0, 10), dueDate: rng() < 0.5 ? new Date(Date.UTC(2026, 0, 1 + randInt(rng, 0, 60))) : null, status: "todo" };
      const r = computeTaskPriority(t, { now: Date.UTC(2026, 0, 15) });
      let raw = 0;
      for (const f of Object.values(r.factors)) raw += f.weight * f.score;
      assert.ok(Math.abs(raw - r.rawScore) < 0.01, `raw ${raw} vs ${r.rawScore}`);
      assert.equal(r.score, Math.round(r.rawScore));
      assert.ok(r.score >= 0 && r.score <= 100);
      const wsum = Object.values(r.factors).reduce((s, f) => s + f.weight, 0);
      assert.ok(Math.abs(wsum - 1) < 1e-12);
    }
  });

  test("custom weights apply exactly once and invalid custom weights fall back", () => {
    const t = { _id: "a", urgency: 5, impact: 5, status: "todo" };
    const onlyGreedy = computeTaskPriority(t, { weights: { greedy: 1, deadline: 0, value: 0, risk: 0, depth: 0, skillGap: 0, overload: 0 } });
    assert.equal(onlyGreedy.score, computePriorityScore({ urgency: 5, impact: 5 }));
    assert.equal(resolvePriorityWeights({ greedy: -1 }).valid, false);
    const fallback = computeTaskPriority(t, { weights: { greedy: -1 } });
    assert.deepEqual(fallback.weights, { ...DEFAULT_WEIGHTS });
  });

  test("ranking is deterministic, permutation-invariant and uses code-unit tie-breaks", () => {
    const rng = mulberry32(7);
    const tasks = Array.from({ length: 60 }, (_, i) => ({ _id: `id${String(i).padStart(3, "0")}`, title: `T${i % 7}`, urgency: randInt(rng, 1, 5), impact: randInt(rng, 1, 5), status: "todo" }));
    const a = ids(rankTasks(tasks, { now: 0 }));
    const shuffled = [...tasks].reverse();
    const b = ids(rankTasks(shuffled, { now: 0 }));
    assert.deepEqual(a, b);
    const eq = [{ _id: "z", title: "same" }, { _id: "a", title: "same" }, { _id: "m", title: "same" }];
    assert.deepEqual(ids(rankTasks(eq, { now: 0 })), ["a", "m", "z"]);
  });

  test("merge sort (greedySortTasks) is a stable sort equal to a trusted stable reference", () => {
    const rng = mulberry32(99);
    for (let trial = 0; trial < 30; trial++) {
      const arr = Array.from({ length: randInt(rng, 0, 80) }, (_, i) => ({ id: i, priorityScore: randInt(rng, 0, 5), createdAt: new Date(Date.UTC(2026, 0, randInt(rng, 1, 3))) }));
      const ref = arr.map((x, i) => [x, i]).sort((p, q) => (q[0].priorityScore - p[0].priorityScore) || (p[0].createdAt - q[0].createdAt) || (p[1] - q[1])).map((p) => p[0]);
      assert.deepEqual(greedySortTasks(arr).map((x) => x.id), ref.map((x) => x.id));
    }
    const s = mergeSort([{ status: "done", priority: 1, effort: 1, title: "b" }, { status: "todo", priority: 1, effort: 1, title: "a" }]);
    assert.equal(s[0].status, "todo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 3 — graph semantics: prerequisites vs dependents (D-21)", () => {
  const diamond = [
    { _id: "A", dependencies: [] },
    { _id: "B", dependencies: ["A"] },
    { _id: "C", dependencies: ["A"] },
    { _id: "D", dependencies: ["B", "C"] },
  ];

  test("diamond: in-degree = prerequisites, out-degree = dependents", () => {
    const { metrics } = dependencyMetrics(diamond);
    const m = (k) => metrics.get(k);
    assert.deepEqual([m("A").prerequisites, m("A").dependents], [0, 2]);
    assert.deepEqual([m("B").prerequisites, m("B").dependents], [1, 1]);
    assert.deepEqual([m("C").prerequisites, m("C").dependents], [1, 1]);
    assert.deepEqual([m("D").prerequisites, m("D").dependents], [2, 0]);
    assert.equal(m("A").downstreamReach, 3);
    assert.equal(m("D").depth, 2);
  });

  test("duplicate edges, self-loops and missing references are handled", () => {
    const g = buildGraph([{ _id: "A" }, { _id: "B", dependencies: ["A", "A", "B", "ghost"] }]);
    assert.equal(g.edgeCount, 1);
    assert.equal(g.duplicateEdges, 1);
    assert.deepEqual(g.selfLoops, ["B"]);
    assert.deepEqual(g.missingRefs, [{ taskId: "B", ref: "ghost" }]);
    assert.equal(g.inDegree.get("B"), 1);
  });

  test("priority engine rewards the task that UNBLOCKS work, not the one waiting", () => {
    const tasks = [
      { _id: "unblocker", title: "u", urgency: 3, impact: 3, dependencies: [], status: "todo" },
      { _id: "w1", title: "w1", urgency: 3, impact: 3, dependencies: ["unblocker"], status: "todo" },
      { _id: "w2", title: "w2", urgency: 3, impact: 3, dependencies: ["unblocker"], status: "todo" },
      { _id: "waiter", title: "waiter", urgency: 3, impact: 3, dependencies: ["w1", "w2"], status: "todo" },
    ];
    const ranked = rankTasks(tasks, { now: 0 });
    assert.equal(ranked[0]._id, "unblocker");
    const r = Object.fromEntries(ranked.map((t) => [t._id, t.priorityResult]));
    assert.ok(r.unblocker.factors.greedy.score > r.waiter.factors.greedy.score);
    assert.equal(r.waiter.eligible, false, "waiting task is not executable");
  });

  test("random graphs: degrees equal an independent edge count", () => {
    const rng = mulberry32(21);
    for (let trial = 0; trial < 20; trial++) {
      const tasks = randomDag(rng, 40, 0.15);
      const { metrics } = dependencyMetrics(tasks);
      const inRef = new Map(), outRef = new Map();
      for (const t of tasks) for (const d of new Set(t.dependencies)) {
        inRef.set(t._id, (inRef.get(t._id) ?? 0) + 1);
        outRef.set(d, (outRef.get(d) ?? 0) + 1);
      }
      for (const t of tasks) {
        assert.equal(metrics.get(t._id).prerequisites, inRef.get(t._id) ?? 0);
        assert.equal(metrics.get(t._id).dependents, outRef.get(t._id) ?? 0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 5 — execution waves (D-25) and BFS separation", () => {
  const assertWaveInvariant = (tasks, waves) => {
    const level = new Map();
    waves.forEach((w, i) => w.forEach((id) => level.set(id, i)));
    for (const t of tasks) for (const d of t.dependencies ?? []) {
      if (d === t._id || !level.has(d)) continue;
      assert.ok(level.get(d) < level.get(t._id), `${d} (wave ${level.get(d)}) must precede ${t._id} (wave ${level.get(t._id)})`);
    }
  };

  test("shortcut graph A→B, A→C, B→C gives waves [A],[B],[C]; baseline BFS was wrong", () => {
    const tasks = [{ _id: "A" }, { _id: "B", dependencies: ["A"] }, { _id: "C", dependencies: ["A", "B"] }];
    assert.deepEqual(bfsDependencyLevels(tasks), [["A"], ["B"], ["C"]]);
    const g = baselineGraph.buildGraph(tasks);
    const old = baselineGraph.bfs(g.adjList, g.inDegree).levels;
    assert.equal(old.B, old.C, "baseline first-discovery BFS put B and C in one level (the defect)");
    // ordinary BFS keeps shortest-hop semantics
    const ng = buildGraph(tasks);
    assert.equal(bfs(ng.adjList, ng.inDegree).levels.C, 1);
  });

  test("empty, single, chain, diamond, multiple roots, disconnected", () => {
    assert.deepEqual(bfsDependencyLevels([]), []);
    assert.deepEqual(bfsDependencyLevels([{ _id: "x" }]), [["x"]]);
    assert.deepEqual(bfsDependencyLevels([{ _id: "c", dependencies: ["b"] }, { _id: "b", dependencies: ["a"] }, { _id: "a" }]), [["a"], ["b"], ["c"]]);
    assert.deepEqual(bfsDependencyLevels([{ _id: "A" }, { _id: "B", dependencies: ["A"] }, { _id: "C", dependencies: ["A"] }, { _id: "D", dependencies: ["B", "C"] }]), [["A"], ["B", "C"], ["D"]]);
    assert.deepEqual(bfsDependencyLevels([{ _id: "r2" }, { _id: "r1" }, { _id: "x", dependencies: ["r1", "r2"] }, { _id: "lone" }]), [["lone", "r1", "r2"], ["x"]]);
  });

  test("cycles: no executable schedule is claimed; participants are distinguished from blocked nodes", () => {
    assert.deepEqual(bfsDependencyLevels([{ _id: "s", dependencies: ["s"] }]), []);
    const tasks = [{ _id: "a", dependencies: ["c"] }, { _id: "b", dependencies: ["a"] }, { _id: "c", dependencies: ["b"] }, { _id: "down", dependencies: ["c"] }, { _id: "free" }];
    const g = buildGraph(tasks);
    const w = executionWaves(g.adjList, g.inDegree, { selfLoops: g.selfLoops });
    assert.equal(w.valid, false);
    assert.deepEqual(w.waves, []);
    assert.deepEqual(w.cycleNodes, ["a", "b", "c"]);
    assert.deepEqual(w.blockedByCycle, ["down"]);
  });

  test("random DAGs (seeded): every prerequisite is in a strictly earlier wave; large DAG", () => {
    const rng = mulberry32(25);
    for (let trial = 0; trial < 25; trial++) {
      const tasks = randomDag(rng, randInt(rng, 1, 120), rng() * 0.2);
      const waves = bfsDependencyLevels(tasks);
      assert.equal(waves.flat().length, tasks.length);
      assertWaveInvariant(tasks, waves);
    }
    const big = randomDag(rng, 5000, 0.002);
    const waves = bfsDependencyLevels(big);
    assert.equal(waves.flat().length, 5000);
    assertWaveInvariant(big, waves);
  });

  test("DFS is iterative (no stack overflow on a 20 000-node chain) and visits every edge once", () => {
    const n = 20000;
    const chain = Array.from({ length: n }, (_, i) => ({ _id: `n${String(i).padStart(5, "0")}`, dependencies: i ? [`n${String(i - 1).padStart(5, "0")}`] : [] }));
    const g = buildGraph(chain);
    const r = dfs(g.adjList);
    assert.equal(r.order.length, n);
    assert.equal(r.edgesExamined, n - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 6 — Kahn topological sort (D-31)", () => {
  const assertTopo = (tasks, order) => {
    const pos = new Map(order.map((id, i) => [id, i]));
    for (const t of tasks) for (const d of t.dependencies ?? []) if (d !== t._id && pos.has(d)) assert.ok(pos.get(d) < pos.get(t._id));
  };

  test("heap order is IDENTICAL to the baseline (smallest-ready-id) order on seeded DAGs", () => {
    const rng = mulberry32(31);
    for (let trial = 0; trial < 40; trial++) {
      const tasks = randomDag(rng, randInt(rng, 0, 150), rng() * 0.15);
      const g = buildGraph(tasks);
      const ng = topologicalSort(g.adjList, g.inDegree);
      const bg = baselineGraph.buildGraph(tasks);
      const old = baselineGraph.topologicalSort(bg.adjList, bg.inDegree);
      assert.equal(ng.hasCycle, false);
      assert.deepEqual(ng.order, old.order);
      assertTopo(tasks, ng.order);
      const fifo = topologicalSortFifo(g.adjList, g.inDegree);
      assert.equal(fifo.order.length, tasks.length);
      assertTopo(tasks, fifo.order);
    }
  });

  test("empty, single, dense DAG, disconnected and cycles", () => {
    const e = buildGraph([]);
    assert.deepEqual(topologicalSort(e.adjList, e.inDegree).order, []);
    const dense = Array.from({ length: 40 }, (_, i) => ({ _id: `d${String(i).padStart(2, "0")}`, dependencies: Array.from({ length: i }, (_, j) => `d${String(j).padStart(2, "0")}`) }));
    const g = buildGraph(dense);
    const r = topologicalSort(g.adjList, g.inDegree);
    assert.equal(r.edgesExamined, (40 * 39) / 2);
    assertTopo(dense, r.order);
    const cyc = buildGraph([{ _id: "a", dependencies: ["b"] }, { _id: "b", dependencies: ["a"] }, { _id: "c" }]);
    const cr = topologicalSort(cyc.adjList, cyc.inDegree);
    assert.equal(cr.hasCycle, true);
    assert.deepEqual(cr.cycles, [["a", "b"]]);
    const self = buildGraph([{ _id: "s", dependencies: ["s"] }]);
    assert.equal(topologicalSort(self.adjList, self.inDegree, { selfLoops: self.selfLoops }).hasCycle, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 7 — 0/1 Knapsack with fractional effort (D-26)", () => {
  test("2.5 h task fits a 5 h sprint (baseline returned nothing)", async () => {
    const r = knapsackSprint([{ _id: "a", effort: 2.5, value: 10 }], 5);
    assert.deepEqual(ids(r.selectedTasks), ["a"]);
    assert.equal(r.totalValue, 10);
    const old = await import("../../benchmarks/baseline/taskOptimiser.js");
    let oldSelected;
    try { oldSelected = old.knapsackSprint([{ _id: "a", effort: 2.5, value: 10 }], 5).selectedTasks.length; } catch { oldSelected = "threw"; }
    assert.notEqual(oldSelected, 1, "baseline reproduces the defect");
  });

  test("0.5 h tasks, exact capacity, nothing fits, empty backlog, zero capacity", () => {
    assert.equal(solveKnapsack([1, 2, 3, 4].map((i) => ({ id: `h${i}`, effort: 0.5, value: 1 })), 1.5).selected.length, 3);
    const exact = solveKnapsack([{ id: "a", effort: 2.25, value: 3 }, { id: "b", effort: 2.75, value: 4 }], 5);
    assert.equal(exact.totalEffort, 5);
    assert.equal(exact.totalValue, 7);
    assert.equal(solveKnapsack([{ id: "a", effort: 6, value: 9 }], 5).selected.length, 0);
    assert.equal(solveKnapsack([], 10).selected.length, 0);
    const z = solveKnapsack([{ id: "free", effort: 0, value: 2 }, { id: "a", effort: 1, value: 5 }], 0);
    assert.deepEqual(z.selectedIds, ["free"], "zero-effort items are allowed and fit zero capacity");
  });

  test("invalid input policy: capacity, effort, value, duplicate ids", () => {
    assert.equal(solveKnapsack([{ id: "a", effort: 1, value: 1 }], -1).status, "invalid_capacity");
    assert.equal(solveKnapsack([{ id: "a", effort: 1, value: 1 }], NaN).status, "invalid_capacity");
    const r = solveKnapsack([
      { id: "neg", effort: -1, value: 5 }, { id: "nan", effort: NaN, value: 5 }, { id: "miss", value: 5 },
      { id: "inf", effort: Infinity, value: 5 }, { id: "badv", effort: 1, value: -2 },
      { id: "dup", effort: 1, value: 1 }, { id: "dup", effort: 1, value: 100 },
    ], 10);
    const reasons = Object.fromEntries(r.rejected.map((x) => [x.id + ":" + x.reason, true]));
    for (const k of ["neg:negative_effort", "nan:missing_or_invalid_effort", "miss:missing_or_invalid_effort", "inf:missing_or_invalid_effort", "badv:invalid_value", "dup:duplicate_id"]) assert.ok(reasons[k], k);
    assert.deepEqual(r.selectedIds, ["dup"]);
    assert.equal(r.totalValue, 1, "first duplicate kept, later one rejected");
  });

  test("rounding never exceeds the ORIGINAL capacity (2 × 2.54 h does not fit 5 h)", () => {
    const r = solveKnapsack([{ id: "a", effort: 2.54, value: 5 }, { id: "b", effort: 2.54, value: 5 }], 5);
    assert.equal(r.selected.length, 1);
    assert.ok(r.totalEffort <= 5);
    const n = solveKnapsack([{ id: "a", effort: 2.3, value: 1 }, { id: "b", effort: 2.7, value: 1 }], 5);
    assert.equal(n.selected.length, 2, "float noise (2.3·100 = 229.999…) does not drop a fitting task");
  });

  test("exact optimum equals brute force on 300 seeded instances; capacity and uniqueness invariants", () => {
    const rng = mulberry32(26);
    for (let trial = 0; trial < 300; trial++) {
      const items = randomKnapsackItems(rng, randInt(rng, 0, 12));
      const cap = Math.round(rng() * 20 * 100) / 100;
      const r = solveKnapsack(items, cap);
      assert.equal(r.exact, true);
      assert.ok(Math.abs(r.totalValue - bruteForceKnapsack(items, cap)) < 1e-9, `trial ${trial}`);
      assert.ok(r.totalEffort <= cap + 1e-9);
      assert.equal(new Set(r.selectedIds).size, r.selectedIds.length);
      const again = solveKnapsack([...items].reverse(), cap);
      assert.deepEqual(again.selectedIds, r.selectedIds, "deterministic regardless of input order");
    }
  });

  test("equal-value alternatives prefer smaller total effort", () => {
    const r = solveKnapsack([{ id: "heavy", effort: 4, value: 6 }, { id: "light", effort: 2, value: 6 }], 4);
    assert.deepEqual(r.selectedIds, ["light"]);
  });

  test("workload guard returns a truthfully labelled approximation", () => {
    const rng = mulberry32(5);
    const items = randomKnapsackItems(rng, 50);
    const r = solveKnapsack(items, 40, { maxCells: 1000 });
    assert.equal(r.exact, false);
    assert.match(r.meta.algorithm, /approximate/);
    assert.ok(r.totalEffort <= 40);
    const exact = solveKnapsack(items, 40);
    assert.ok(r.totalValue >= exact.totalValue / 2 - 1e-9, "≥ 50% of optimum");
    assert.ok(r.totalValue <= exact.totalValue + 1e-9);
  });

  test("large input stays exact within limits (500 tasks × 200 h)", () => {
    const rng = mulberry32(500);
    const r = solveKnapsack(randomKnapsackItems(rng, 500), 200);
    assert.equal(r.exact, true);
    assert.ok(r.totalEffort <= 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 8 — Branch and Bound assignment (D-33)", () => {
  const SK = ["frontend", "backend", "devops", "design", "ml", "testing"];
  const randomMembers = (rng, n) => Array.from({ length: n }, (_, i) => ({
    userId: `u${i}`, name: `M${i}`, capacity: randInt(rng, 4, 40),
    skills: Object.fromEntries(SK.map((k) => [k, randInt(rng, 0, 10)])),
  }));
  const randomTasks = (rng, n) => Array.from({ length: n }, (_, j) => ({
    _id: `t${j}`, title: `Task ${j}`, estimatedHours: rng() < 0.8 ? randInt(rng, 1, 16) : null,
    skillWeights: Object.fromEntries(SK.map((k) => [k, rng() < 0.4 ? randInt(rng, 1, 10) : 0])),
  }));

  test("exact result equals exhaustive enumeration on 150 seeded instances", () => {
    const rng = mulberry32(33);
    for (let trial = 0; trial < 150; trial++) {
      const members = randomMembers(rng, randInt(rng, 1, 4));
      const tasks = randomTasks(rng, randInt(rng, 1, 6));
      const r = assignTasksToMembers(members, tasks);
      const ref = exhaustiveAssignment(members, tasks);
      assert.equal(r.meta.exact, true);
      assert.equal(r.assignments.length, ref.assigned, `trial ${trial} assigned`);
      assert.equal(r.totalCost, ref.cost, `trial ${trial} cost`);
    }
  });

  test("hard constraints never violated (hour capacity, per-member cap, no placeholder)", () => {
    const rng = mulberry32(34);
    for (let trial = 0; trial < 60; trial++) {
      const members = [...randomMembers(rng, randInt(rng, 1, 5)), { name: "Ghost" }, { userId: "ph", name: "Placeholder", placeholder: true }];
      const tasks = randomTasks(rng, randInt(rng, 1, 25));
      const r = assignTasksToMembers(members, tasks);
      const hours = {}, counts = {};
      for (const a of r.assignments) {
        assert.ok(!["ph", undefined].includes(a.memberId), "placeholders are never assigned");
        const t = tasks.find((x) => x._id === a.taskId);
        hours[a.memberId] = (hours[a.memberId] ?? 0) + (t.estimatedHours ?? 0);
        counts[a.memberId] = (counts[a.memberId] ?? 0) + 1;
      }
      for (const [m, h] of Object.entries(hours)) assert.ok(h <= members.find((x) => x.userId === m).capacity + 1e-9);
      for (const c of Object.values(counts)) assert.ok(c <= r.meta.maxTasksPerMember);
      assert.equal(r.assignments.length + r.unassigned.length, tasks.length);
    }
  });

  test("permutation invariance and determinism (input-order bias removed)", () => {
    const rng = mulberry32(35);
    const members = randomMembers(rng, 3);
    const tasks = randomTasks(rng, 7);
    const key = (r) => JSON.stringify([...r.assignments].map((a) => [a.taskId, a.memberId]).sort());
    const base = assignTasksToMembers(members, tasks);
    assert.equal(key(assignTasksToMembers([...members].reverse(), [...tasks].reverse())), key(base));
    assert.equal(key(assignTasksToMembers(members, tasks)), key(base));
  });

  test("one task / one member; more members than tasks; zero availability; insufficient capacity", () => {
    const m = [{ userId: "u1", name: "A", skills: { backend: 9 } }];
    assert.equal(assignTasksToMembers(m, [{ _id: "t", title: "API", skillWeights: { backend: 5 } }]).assignments[0].cost, 0);
    const many = assignTasksToMembers([{ userId: "a", skills: {} }, { userId: "b", skills: {} }, { userId: "c", skills: {} }], [{ _id: "t", title: "x" }]);
    assert.equal(many.assignments.length, 1);
    const zero = assignTasksToMembers([{ userId: "a", capacity: 10, skills: {} }], [{ _id: "t", title: "x" }], { existingLoadHours: { a: 10 } });
    assert.equal(zero.assignments.length, 0);
    assert.equal(zero.meta.unavailableMembers[0].reason, "no remaining hour capacity");
    const big = assignTasksToMembers([{ userId: "a", capacity: 8, skills: {} }], [{ _id: "t", title: "x", estimatedHours: 12 }]);
    assert.match(big.unassigned[0].reason, /no member has that much remaining capacity/);
  });

  test("large workload is bounded and labelled approximate; node budget is honoured", () => {
    const rng = mulberry32(36);
    const members = randomMembers(rng, 8);
    const tasks = randomTasks(rng, 300);
    const t0 = performance.now();
    const r = assignTasksToMembers(members, tasks);
    assert.ok(performance.now() - t0 < 5000);
    assert.equal(r.meta.exact, false);
    assert.match(r.meta.terminationReason, /exceeds_exact_limit/);
    assert.match(r.meta.algorithm, /approximate/);
    const budget = assignTasksToMembers(randomMembers(rng, 6), randomTasks(rng, 14), { limits: { maxNodes: 50 } });
    if (!budget.meta.exact) assert.equal(budget.meta.terminationReason, "node_budget_exhausted");
    assert.ok(budget.meta.nodesExplored <= 51);
  });

  test("assignment explanations reflect the computed costs", () => {
    const r = assignTasksToMembers([{ userId: "u", name: "A", skills: { backend: 2 } }], [{ _id: "t", title: "x", skillWeights: { backend: 7 } }]);
    const a = r.assignments[0];
    assert.equal(a.cost, 5);
    assert.deepEqual(a.explanation.skillGaps, [{ skill: "backend", required: 7, has: 2 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 9 — Boyer–Moore–Horspool search (D-32)", () => {
  const naive = (text, pat) => text.indexOf(pat);

  test("pattern lengths 255, 256, 257 terminate and match (baseline Uint8Array wrapped 256 → 0)", () => {
    for (const m of [255, 256, 257, MAX_QUERY_LENGTH]) {
      const pat = "a".repeat(m);
      assert.equal(horspoolIndexOf("x" + "a".repeat(m + 3), pat), 1);
      assert.equal(horspoolIndexOf("b".repeat(m * 2), pat), -1);
    }
  });

  test("edge cases: empty text/pattern, longer pattern, repeated characters, overlapping", () => {
    assert.equal(horspoolIndexOf("", ""), 0);
    assert.equal(horspoolIndexOf("", "a"), -1);
    assert.equal(horspoolIndexOf("abc", ""), 0);
    assert.equal(horspoolIndexOf("ab", "abc"), -1);
    assert.equal(horspoolIndexOf("aaaaab", "aab"), 3);
    assert.deepEqual(horspoolAllMatches("aaaa", "aa"), [0, 1, 2]);
    assert.equal(boyerMooreSearch([{ title: "x" }], "").length, 1, "empty query matches everything");
  });

  test("Unicode: Kannada, accents (NFC/NFD), emoji, case-insensitive — baseline missed non-ASCII", async () => {
    const tasks = [{ title: "xಅಬ" }, { title: "Café menu" }, { title: "Deploy 🚀 now" }, { title: "ಕನ್ನಡ ಪರೀಕ್ಷೆ" }];
    assert.equal(boyerMooreSearch(tasks, "ಅಬ").length, 1);
    assert.equal(boyerMooreSearch(tasks, "café").length, 1, "decomposed query matches precomposed title");
    assert.equal(boyerMooreSearch(tasks, "CAFÉ").length, 1);
    assert.equal(boyerMooreSearch(tasks, "🚀").length, 1);
    assert.equal(boyerMooreSearch(tasks, "ಪರೀಕ್ಷೆ").length, 1);
    const old = await import("../../benchmarks/baseline/taskOptimiser.js");
    assert.equal(old.boyerMooreSearch([{ title: "xಅಬ" }], "ಅಬ").length, 0, "baseline reproduces the non-ASCII miss");
  });

  test("seeded random comparison with String.prototype.indexOf (trusted reference)", () => {
    const rng = mulberry32(32);
    const alphabet = ["a", "b", "c", "ಅ", "é", "🚀", " "];
    for (let k = 0; k < 2000; k++) {
      const gen = (n) => Array.from({ length: n }, () => alphabet[randInt(rng, 0, alphabet.length - 1)]).join("");
      const text = gen(randInt(rng, 0, 40));
      const pat = rng() < 0.5 && text.length > 2 ? text.slice(randInt(rng, 0, text.length - 2), randInt(rng, 1, text.length)) : gen(randInt(rng, 1, 5));
      assert.equal(horspoolIndexOf(text, pat), naive(text, pat), JSON.stringify([text, pat]));
    }
  });

  test("shared front/back fixture: every case matches the normalised naive reference", () => {
    const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/searchCases.json", import.meta.url), "utf8"));
    assert.ok(fixture.cases.length >= 20);
    for (const c of fixture.cases) {
      const ref = normalizeQuery(c.query) === "" ? true : normalizeForSearch(c.text).includes(normalizeQuery(c.query));
      assert.equal(ref, c.expected, `fixture self-check: ${c.name}`);
      assert.equal(searchContains(c.text, c.query), c.expected, c.name);
    }
  });

  test("query validation bounds length", () => {
    assert.equal(validateSearchQuery("x".repeat(MAX_QUERY_LENGTH)).ok, true);
    assert.equal(validateSearchQuery("x".repeat(MAX_QUERY_LENGTH + 1)).ok, false);
    assert.equal(validateSearchQuery(42).ok, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 4 — decision modes drive the actual ranking (D-23)", () => {
  // evaluateDecision uses the real clock, so due dates are relative to it.
  const now = Date.now();
  const tasks = [
    { _id: "deadline", title: "Deadline task", urgency: 2, impact: 2, businessValue: 2, dueDate: new Date(now + 3600_000), status: "todo" },
    { _id: "value", title: "Value task", urgency: 2, impact: 2, businessValue: 10, dueDate: new Date(now + 60 * 86_400_000), status: "todo" },
  ];
  const run = (mode) => evaluateDecision({ decisionType: "task-priority", preferences: { priorityMode: mode }, ctx: { members: [] }, tasks });

  test("changing the mode changes the ranking, and the difference is mathematically justified", () => {
    const fast = run("fast_delivery");
    const impact = run("high_impact");
    assert.equal(fast.rankedTasks[0].taskId, "deadline");
    assert.equal(impact.rankedTasks[0].taskId, "value");
    // Recompute independently from the reported factors and effective weights.
    for (const res of [fast, impact]) {
      for (const t of res.rankedTasks) {
        let raw = 0;
        for (const [k, f] of Object.entries(t.factorBreakdown)) raw += res.effectiveWeights[k] * f.score;
        assert.ok(Math.abs(Math.round(raw) - t.priorityScore) <= 1, "explanation matches computation");
      }
    }
  });

  test("default (balanced) equals the engine default weights; invalid custom weights are rejected", () => {
    const bal = run(undefined);
    assert.equal(bal.mode, "balanced");
    for (const k of Object.keys(DEFAULT_WEIGHTS)) assert.ok(Math.abs(bal.effectiveWeights[k] - DEFAULT_WEIGHTS[k]) < 1e-12);
    const bad = evaluateDecision({ decisionType: "task-priority", preferences: { priorityWeights: { greedy: -5 } }, ctx: { members: [] }, tasks });
    assert.match(bad.weightSource, /invalid custom weights rejected/);
  });

  test("hard constraints are never overridden by score", () => {
    const blocked = [
      { _id: "pre", title: "prereq", urgency: 1, impact: 1, status: "todo" },
      { _id: "hot", title: "hot", urgency: 5, impact: 5, businessValue: 10, dueDate: new Date(now - 1), dependencies: ["pre"], status: "todo" },
    ];
    const ranked = rankTasks(blocked, { now });
    assert.equal(ranked[0]._id, "pre");
    assert.equal(ranked[1].priorityResult.eligible, false);
    assert.ok(ranked[1].priorityResult.score > ranked[0].priorityResult.score);
    const wf = rankTasks([{ _id: "d", title: "design", phase: "design", urgency: 5, impact: 5 }, { _id: "r", title: "req", phase: "requirements", urgency: 1 }], { now, waterfallPhase: "requirements" });
    assert.equal(wf[0]._id, "r");
    assert.equal(wf[1].priorityResult.constraints[0].type, "phase_gate");
    const wip = rankTasks([{ _id: "n", title: "new", status: "todo", urgency: 5 }, { _id: "p", title: "doing", status: "in_progress", urgency: 1 }], { now, wipBlocked: true });
    assert.equal(wip[0]._id, "p");
    assert.equal(wip[1].priorityResult.constraints[0].type, "wip_limit");
  });
});
