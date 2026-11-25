/**
 * NexusFlow – DAA Module: Graph Traversal & Dependency Analysis
 *
 * Implements DFS, BFS, and Topological Sort on a task-dependency graph.
 * Used by the /api/teams/:teamId/dependency-graph endpoint.
 *
 * Complexity Summary
 * ------------------
 * All three algorithms operate on G = (V, E) where
 *   V = number of tasks in the sprint
 *   E = total dependency edges
 *
 * DFS             O(V + E) time   O(V) stack space
 * BFS             O(V + E) time   O(V) queue space
 * Topological Sort  O(V + E) time   O(V) auxiliary space
 */

/**
 * Build an adjacency list from a flat task array.
 * Each task's `dependencies` field is an array of task _id strings.
 */
export function buildGraph(tasks) {
  const adjList  = new Map();
  const inDegree = new Map();
  const nodeMap  = new Map();

  for (const t of tasks) {
    const id = t._id.toString();
    adjList.set(id, []);
    inDegree.set(id, 0);
    nodeMap.set(id, t);
  }

  for (const t of tasks) {
    const id   = t._id.toString();
    const deps = (t.dependencies ?? []).map(String);
    for (const dep of deps) {
      if (adjList.has(dep)) {
        adjList.get(dep).push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  return { adjList, inDegree, nodeMap };
}

/**
 * Depth-First Search from every unvisited node.
 * Returns traversal order and per-node discovery/finish timestamps.
 * Time: O(V + E)  Space: O(V)
 */
export function dfs(adjList) {
  const visited    = new Set();
  const order      = [];
  const timestamps = {};
  let   time       = 0;

  function visit(u) {
    visited.add(u);
    timestamps[u] = { disc: ++time, fin: null };
    for (const v of (adjList.get(u) ?? [])) {
      if (!visited.has(v)) visit(v);
    }
    timestamps[u].fin = ++time;
    order.push(u);
  }

  for (const u of adjList.keys()) {
    if (!visited.has(u)) visit(u);
  }

  return { order, timestamps };
}

/**
 * Breadth-First Search starting from all source nodes (in-degree 0).
 * Annotates each node with its BFS level (parallel execution tier).
 * Time: O(V + E)  Space: O(V)
 */
export function bfs(adjList, inDegree) {
  const levels  = {};
  const order   = [];
  const queue   = [];

  for (const [u, deg] of inDegree.entries()) {
    if (deg === 0) { queue.push(u); levels[u] = 0; }
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const v of (adjList.get(u) ?? [])) {
      if (levels[v] === undefined) {
        levels[v] = (levels[u] ?? 0) + 1;
        queue.push(v);
      }
    }
  }

  for (const u of adjList.keys()) {
    if (levels[u] === undefined) { levels[u] = -1; order.push(u); }
  }

  return { order, levels };
}

/**
 * Kahn's Algorithm – Topological Sort.
 * Produces a valid linear execution order respecting all dependencies.
 * If a cycle is detected, hasCycle=true and order is partial.
 *
 * CANONICAL ORDERING: this is the single topological-sort used across the whole
 * app (dependency-graph API, execution-order API, socket recompute, and the
 * recommendation engine all call this). The ready set is sorted by id on every
 * step so the ordering is fully deterministic — identical output for identical
 * input on every screen.
 *
 * Time: O(V + E + V log V)  Space: O(V)
 */
export function topologicalSort(adjList, inDegree) {
  const deg   = new Map(inDegree);
  const order = [];

  let ready = [];
  for (const [u, d] of deg.entries()) {
    if (d === 0) ready.push(u);
  }

  while (ready.length) {
    ready.sort();                 // deterministic tie-break (stable across calls)
    const u = ready.shift();
    order.push(u);
    for (const v of (adjList.get(u) ?? [])) {
      deg.set(v, deg.get(v) - 1);
      if (deg.get(v) === 0) ready.push(v);
    }
  }

  return {
    order,
    hasCycle: order.length < adjList.size,
  };
}
