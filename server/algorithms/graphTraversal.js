/**
 * graphTraversal.js — canonical dependency-graph algorithms for NEXUSFLOW
 * ============================================================================
 *
 * EDGE CONVENTION (used everywhere in NEXUSFLOW, Phase 3):
 *
 *     A → B   means   "task A must finish before task B can execute".
 *
 *   A task document stores its PREREQUISITES in `dependencies`; therefore a
 *   task B with `dependencies: [A]` contributes the edge A → B.
 *
 *   in-degree(v)        = number of direct prerequisites of v
 *   out-degree(v)       = number of direct dependents of v ("tasks v unblocks")
 *   downstream reach(v) = number of UNIQUE tasks transitively depending on v
 *   dependency depth(v) = length of the longest prerequisite chain ending at v
 *                         (= execution wave index, sources are wave 0)
 *
 * Edges are de-duplicated, self-loops and references to tasks outside the
 * supplied set (deleted / archived / foreign) are reported and ignored.
 *
 * Algorithms and complexity (V vertices, E distinct edges):
 *   buildGraph            O(V + E) time, O(V + E) space
 *   dfs (iterative)       O(V + E)
 *   bfs (reachability)    O(V + E)   — first-discovery (shortest-hop) levels
 *   topologicalSort       O(E + V log V) — Kahn + binary min-heap
 *                         (deterministic: smallest ready id first)
 *   topologicalSortFifo   O(V + E)   — Kahn + FIFO queue (no ordering policy)
 *   executionWaves        O(E + V log V) — longest-path levels over a DAG
 *   cycle diagnostics     O(V + E)   — Tarjan SCC on the unprocessed remainder
 */

// ---------------------------------------------------------------------------
// Deterministic binary min-heap (string keys compared by code unit)
// ---------------------------------------------------------------------------
export class MinHeap {
  constructor(compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    this.items = [];
    this.compare = compare;
    this.ops = 0; // sift steps — instrumentation for benchmarks
  }
  get size() { return this.items.length; }
  push(x) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      this.ops++;
      if (this.compare(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.compare(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.compare(a[r], a[m]) < 0) m = r;
        this.ops++;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

const idOf = (x) => {
  if (x === null || x === undefined) return null;
  if (typeof x === "object") return x._id !== undefined ? String(x._id) : String(x);
  return String(x);
};

/**
 * buildGraph(tasks)
 * @returns {{ adjList: Map<string,string[]>, inDegree: Map<string,number>,
 *             nodeMap: Map<string,object>, edgeCount: number,
 *             selfLoops: string[], missingRefs: {taskId,ref}[], duplicateEdges: number }}
 * Self-loops are kept OUT of adjList (they are not schedulable) and reported in
 * `selfLoops`; consumers that need cycle semantics treat them as cycles.
 */
export function buildGraph(tasks) {
  const adjList = new Map();
  const inDegree = new Map();
  const nodeMap = new Map();
  for (const t of tasks) {
    const id = idOf(t);
    if (id === null || nodeMap.has(id)) continue; // duplicate task ids collapse
    adjList.set(id, []);
    inDegree.set(id, 0);
    nodeMap.set(id, t);
  }
  const seen = new Set();
  const selfLoops = [];
  const missingRefs = [];
  let duplicateEdges = 0;
  let edgeCount = 0;
  for (const [id, t] of nodeMap) {
    for (const raw of t.dependencies ?? []) {
      const dep = idOf(raw);
      if (dep === null) continue;
      if (dep === id) { selfLoops.push(id); continue; }
      if (!adjList.has(dep)) { missingRefs.push({ taskId: id, ref: dep }); continue; }
      const key = `${dep}>${id}`;
      if (seen.has(key)) { duplicateEdges++; continue; }
      seen.add(key);
      adjList.get(dep).push(id);
      inDegree.set(id, inDegree.get(id) + 1);
      edgeCount++;
    }
  }
  // Deterministic neighbour order (code-unit order of ids).
  for (const list of adjList.values()) list.sort();
  return { adjList, inDegree, nodeMap, edgeCount, selfLoops, missingRefs, duplicateEdges };
}

/**
 * dfs(adjList) — iterative depth-first search (no recursion-depth limit).
 * Produces the same discovery/finish timestamps as the textbook recursive DFS.
 * @returns {{ order: string[] (post-order), timestamps, edgesExamined: number }}
 */
export function dfs(adjList) {
  const visited = new Set();
  const order = [];
  const timestamps = {};
  let time = 0;
  let edgesExamined = 0;
  for (const root of adjList.keys()) {
    if (visited.has(root)) continue;
    visited.add(root);
    timestamps[root] = { disc: ++time, fin: null };
    const stack = [[root, 0]];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [u, i] = frame;
      const nbrs = adjList.get(u) ?? [];
      if (i < nbrs.length) {
        frame[1] = i + 1;
        edgesExamined++;
        const v = nbrs[i];
        if (!visited.has(v)) {
          visited.add(v);
          timestamps[v] = { disc: ++time, fin: null };
          stack.push([v, 0]);
        }
      } else {
        timestamps[u].fin = ++time;
        order.push(u);
        stack.pop();
      }
    }
  }
  return { order, timestamps, edgesExamined };
}

/**
 * bfs(adjList, inDegree) — ordinary breadth-first traversal from all sources.
 * `levels` are FIRST-DISCOVERY (shortest hop) distances from the nearest
 * source. They are NOT dependency-safe execution waves — use executionWaves().
 * Vertices unreachable from any source (i.e. on/behind a cycle) get level -1.
 */
export function bfs(adjList, inDegree) {
  const levels = {};
  const order = [];
  const queue = [];
  let edgesExamined = 0;
  for (const [u, deg] of inDegree.entries()) {
    if (deg === 0) { queue.push(u); levels[u] = 0; }
  }
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const v of adjList.get(u) ?? []) {
      edgesExamined++;
      if (levels[v] === undefined) {
        levels[v] = levels[u] + 1;
        queue.push(v);
      }
    }
  }
  for (const u of adjList.keys()) {
    if (levels[u] === undefined) { levels[u] = -1; order.push(u); }
  }
  return { order, levels, edgesExamined };
}

/** reachableFrom(adjList, start) — set of vertices reachable from start (excl. start). O(V+E). */
export function reachableFrom(adjList, start) {
  const seen = new Set([start]);
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    for (const v of adjList.get(queue[h]) ?? []) {
      if (!seen.has(v)) { seen.add(v); queue.push(v); }
    }
  }
  seen.delete(start);
  return seen;
}

/**
 * Tarjan SCC restricted to `nodes`; returns components that are real cycles
 * (size > 1, or a self-loop). Iterative. O(V + E).
 */
function cycleComponents(adjList, nodes, selfLoopSet) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const comps = [];
  let idx = 0;
  const inSet = (v) => nodes.has(v);
  for (const root of [...nodes].sort()) {
    if (index.has(root)) continue;
    const work = [[root, 0]];
    index.set(root, idx); low.set(root, idx); idx++;
    stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [u, i] = frame;
      const nbrs = (adjList.get(u) ?? []).filter(inSet);
      if (i < nbrs.length) {
        frame[1] = i + 1;
        const v = nbrs[i];
        if (!index.has(v)) {
          index.set(v, idx); low.set(v, idx); idx++;
          stack.push(v); onStack.add(v);
          work.push([v, 0]);
        } else if (onStack.has(v)) {
          low.set(u, Math.min(low.get(u), index.get(v)));
        }
      } else {
        work.pop();
        if (work.length) {
          const p = work[work.length - 1][0];
          low.set(p, Math.min(low.get(p), low.get(u)));
        }
        if (low.get(u) === index.get(u)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== u);
          if (comp.length > 1 || selfLoopSet.has(u)) comps.push(comp.sort());
        }
      }
    }
  }
  return comps;
}

function cycleDiagnostics(adjList, processed, selfLoops = []) {
  const remainder = new Set([...adjList.keys()].filter((v) => !processed.has(v)));
  for (const s of selfLoops) if (adjList.has(s)) remainder.add(s);
  const selfLoopSet = new Set(selfLoops);
  const cycles = cycleComponents(adjList, remainder, selfLoopSet);
  const inCycle = new Set(cycles.flat());
  const blockedByCycle = [...remainder].filter((v) => !inCycle.has(v)).sort();
  return { cycles, cycleNodes: [...inCycle].sort(), blockedByCycle };
}

/**
 * topologicalSort(adjList, inDegree, { selfLoops }) — Kahn's algorithm with a
 * deterministic binary min-heap of ready vertices (smallest id first).
 *   Time  O(E + V log V)   Space O(V + E)
 * On a cycle the partial order is returned with hasCycle=true and diagnostics;
 * consumers must NOT treat it as a complete schedule.
 */
export function topologicalSort(adjList, inDegree, opts = {}) {
  const deg = new Map(inDegree);
  const heap = new MinHeap();
  for (const [u, d] of deg) if (d === 0) heap.push(u);
  const order = [];
  const processed = new Set();
  let edgesExamined = 0;
  while (heap.size) {
    const u = heap.pop();
    order.push(u);
    processed.add(u);
    for (const v of adjList.get(u) ?? []) {
      edgesExamined++;
      const nd = deg.get(v) - 1;
      deg.set(v, nd);
      if (nd === 0) heap.push(v);
    }
  }
  const selfLoops = opts.selfLoops ?? [];
  const hasCycle = order.length < adjList.size || selfLoops.length > 0;
  const result = { order, hasCycle, heapOps: heap.ops, edgesExamined };
  if (hasCycle) Object.assign(result, cycleDiagnostics(adjList, processed, selfLoops));
  return result;
}

/** topologicalSortFifo — Kahn with a FIFO queue, O(V + E). Order follows insertion, not ids. */
export function topologicalSortFifo(adjList, inDegree, opts = {}) {
  const deg = new Map(inDegree);
  const queue = [];
  for (const [u, d] of deg) if (d === 0) queue.push(u);
  const processed = new Set();
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    processed.add(u);
    for (const v of adjList.get(u) ?? []) {
      const nd = deg.get(v) - 1;
      deg.set(v, nd);
      if (nd === 0) queue.push(v);
    }
  }
  const selfLoops = opts.selfLoops ?? [];
  const hasCycle = queue.length < adjList.size || selfLoops.length > 0;
  const result = { order: queue, hasCycle };
  if (hasCycle) Object.assign(result, cycleDiagnostics(adjList, processed, selfLoops));
  return result;
}

/**
 * executionWaves(adjList, inDegree, { selfLoops })
 * Dependency-safe execution levels for a DAG:
 *     level(v) = 0                                  if v has no prerequisites
 *     level(v) = max over prerequisites u of level(u) + 1
 * computed by relaxing edges in topological order. Every prerequisite is in a
 * strictly earlier wave than its dependent. Waves are id-sorted.
 * If the graph has a cycle no schedule is claimed: { valid:false, waves:[] }.
 *   Time  O(E + V log V)   Space O(V + E)
 */
export function executionWaves(adjList, inDegree, opts = {}) {
  const topo = topologicalSort(adjList, inDegree, opts);
  if (topo.hasCycle) {
    return { valid: false, waves: [], levels: {}, cycles: topo.cycles, cycleNodes: topo.cycleNodes, blockedByCycle: topo.blockedByCycle };
  }
  const level = new Map();
  for (const u of topo.order) if (!level.has(u)) level.set(u, 0);
  for (const u of topo.order) {
    const lu = level.get(u);
    for (const v of adjList.get(u) ?? []) {
      if ((level.get(v) ?? 0) < lu + 1) level.set(v, lu + 1);
    }
  }
  const waves = [];
  for (const u of topo.order) (waves[level.get(u)] ??= []).push(u);
  for (const w of waves) w.sort();
  return { valid: true, waves, levels: Object.fromEntries(level), order: topo.order };
}

/**
 * dependencyMetrics(tasks) — batched per-task metrics in O(V + E) for degrees
 * and O(V·(V+E)) worst case for downstream reach (computed with one BFS per
 * vertex only when `withReach` is true; bounded by `maxReachNodes`).
 * @returns Map<id, { prerequisites, dependents, downstreamReach, depth }>
 */
export function dependencyMetrics(tasks, { withReach = true, maxReachNodes = 2000 } = {}) {
  const g = buildGraph(tasks);
  const metrics = new Map();
  for (const id of g.adjList.keys()) {
    metrics.set(id, { prerequisites: g.inDegree.get(id), dependents: g.adjList.get(id).length, downstreamReach: null, depth: null });
  }
  const waves = executionWaves(g.adjList, g.inDegree, { selfLoops: g.selfLoops });
  if (waves.valid) for (const [id, lvl] of Object.entries(waves.levels)) metrics.get(id).depth = lvl;
  if (withReach && g.adjList.size <= maxReachNodes) {
    for (const id of g.adjList.keys()) metrics.get(id).downstreamReach = reachableFrom(g.adjList, id).size;
  }
  return { metrics, graph: g, waves };
}
