/**
 * NEXUSFLOW Phase 3 — Task 11: benchmark harness validity and isolation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runBenchmarks, LIMITS, SEED } from "../../benchmarks/runBenchmarks.js";
import { mulberry32, randomDag, randomKnapsackItems } from "../helpers/seededRandom.js";

test("seeded datasets are reproducible", () => {
  assert.deepEqual(randomDag(mulberry32(SEED), 300, 0.05), randomDag(mulberry32(SEED), 300, 0.05));
  assert.deepEqual(randomKnapsackItems(mulberry32(7), 50), randomKnapsackItems(mulberry32(7), 50));
  assert.notDeepEqual(randomKnapsackItems(mulberry32(7), 50), randomKnapsackItems(mulberry32(8), 50));
});

test("quick run: every row carries measured, finite timings and truthful labels", () => {
  const out = runBenchmarks({ quick: true });
  assert.match(out.dataset, /synthetic/);
  assert.ok(out.environment.node && out.environment.cpu);
  assert.ok(out.results.length >= 15);
  for (const r of out.results) {
    assert.ok(typeof r.algorithm === "string" && r.complexity?.time, r.algorithm);
    for (const key of ["medianMs", "p90Ms", "minMs", "maxMs"]) {
      assert.ok(Number.isFinite(r.current[key]) && r.current[key] >= 0, `${r.algorithm} ${key}`);
    }
    assert.ok(r.current.minMs <= r.current.medianMs && r.current.medianMs <= r.current.maxMs);
    assert.equal(typeof r.exact, "boolean");
  }
  const kahn = out.results.filter((r) => r.algorithm === "Kahn topological sort");
  for (const k of kahn) {
    assert.ok(k.current.ops.heapOps > 0 && k.current.ops.edgesExamined === k.size.E, "operation counts are real");
    assert.equal(k.baseline.sameOrderAsCurrent, true, "heap Kahn reproduces the baseline order exactly");
  }
  const waves = out.results.filter((r) => r.algorithm === "Dependency execution waves");
  assert.ok(waves.every((w) => w.current.constraintViolations === 0));
  assert.ok(waves.some((w) => w.baseline.constraintViolations > 0), "baseline BFS levels violate dependency order on random DAGs");
  for (const k of out.results.filter((r) => r.variant.startsWith("bottom-up DP (integer"))) assert.equal(k.baseline.sameOptimum, true);
  for (const b of out.results.filter((r) => r.algorithm === "Branch and Bound assignment")) {
    assert.equal(b.exact, true);
    assert.ok(b.current.ops.nodesExplored > 0);
  }
});

test("workload limits are explicit and exact B&B is never benchmarked on large inputs", () => {
  assert.ok(LIMITS.maxExactAssignmentTasks <= 16);
  const src = fs.readFileSync(new URL("../../benchmarks/runBenchmarks.js", import.meta.url), "utf8");
  assert.match(src, /assertLimit\(nT <= LIMITS\.maxExactAssignmentTasks/);
});

test("benchmarks have no HTTP surface, no database access and cannot mutate data", async () => {
  const src = fs.readFileSync(new URL("../../benchmarks/runBenchmarks.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from "mongoose"|\/models\//);
  const appSrc = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appSrc, /benchmark/i, "no benchmark route is mounted");
});
