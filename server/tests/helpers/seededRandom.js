/**
 * Deterministic seeded PRNG + generators for reproducible property tests and
 * benchmarks (mulberry32). Same seed → identical sequence on every platform.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

const pad = (i) => `t${String(i).padStart(5, "0")}`;

/**
 * Random DAG: vertices t00000.., edges only from lower to higher index (so it
 * is acyclic); the vertex order is then shuffled so ids do not reveal it.
 */
export function randomDag(rng, n, edgeProb = 0.1, { maxEdgesPerNode = 6 } = {}) {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const tasks = perm.map((p) => ({ _id: pad(p), title: `Task ${p}`, dependencies: [] }));
  const byIdx = new Map(tasks.map((t) => [Number(t._id.slice(1)), t]));
  for (let v = 1; v < n; v++) {
    let added = 0;
    for (let u = 0; u < v && added < maxEdgesPerNode; u++) {
      if (rng() < edgeProb) { byIdx.get(v).dependencies.push(pad(u)); added++; }
    }
  }
  return tasks;
}

export function randomKnapsackItems(rng, n, { maxEffort = 8, maxValue = 10, decimals = 2 } = {}) {
  const f = 10 ** decimals;
  return Array.from({ length: n }, (_, i) => ({
    id: `k${String(i).padStart(4, "0")}`,
    effort: Math.round((0.25 + rng() * maxEffort) * f) / f,
    value: randInt(rng, 1, maxValue),
  }));
}
