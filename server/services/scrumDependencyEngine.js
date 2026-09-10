/**
 * server/services/scrumDependencyEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM DEPENDENCY ENGINE
 *
 * Extends the existing graphTraversal.js with Sprint-aware dependency analysis.
 * REUSES existing DFS, BFS, topologicalSort from graphTraversal.js.
 *
 * CAPABILITIES:
 *   - Cross-Sprint dependency detection
 *   - Sprint-scoped critical path
 *   - Blocking chain identification
 *   - Cycle detection with Sprint context
 *   - Dependency impact assessment
 *
 * DETERMINISTIC — no AI, no randomization.
 * ============================================================================
 */

import { buildGraph, topologicalSort, dfs, bfs } from "../algorithms/graphTraversal.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";

/**
 * Analyze dependencies within a Sprint context.
 *
 * @param {Array} tasks - All project tasks
 * @param {String} sprintId - Current Sprint ID (optional)
 * @returns {Object} Dependency analysis results
 */
export function analyzeScrumDependencies(tasks, sprintId = null) {
  if (!tasks || tasks.length === 0) {
    return {
      graph: { nodes: [], edges: [] },
      topologicalOrder: [],
      hasCycle: false,
      cyclicNodes: [],
      criticalPath: [],
      crossSprintDeps: [],
      blockingChains: [],
      sprintDependencyHealth: 100,
    };
  }

  // Build the graph using existing infrastructure
  const { adjList, inDegree, nodeMap } = buildGraph(tasks);

  // Run topological sort (Kahn's algorithm) — reuse existing
  const topoResult = topologicalSort(adjList, inDegree);

  // Detect cycles
  const cyclicNodes = [];
  if (topoResult.hasCycle) {
    // Find nodes not in topo order (they form cycles)
    const orderedSet = new Set(topoResult.order);
    for (const id of adjList.keys()) {
      if (!orderedSet.has(id)) cyclicNodes.push(id);
    }
  }

  // Calculate critical path (longest path through dependency graph)
  const criticalPath = calculateCriticalPath(tasks, adjList, inDegree, topoResult.order);

  // Detect cross-Sprint dependencies
  const crossSprintDeps = detectCrossSprintDependencies(tasks, sprintId);

  // Identify blocking chains
  const blockingChains = identifyBlockingChains(tasks, adjList);

  // Build visual graph data
  const nodes = tasks.map((t) => ({
    id: t._id.toString(),
    label: t.title,
    status: t.scrumStatus || t.status,
    sprintId: t.sprintId?.toString() || null,
    estimatedHours: t.estimatedHours || 0,
    isBlocked: t.scrumStatus === "BLOCKED",
    isCritical: criticalPath.includes(t._id.toString()),
    isCyclic: cyclicNodes.includes(t._id.toString()),
  }));

  const edges = [];
  for (const t of tasks) {
    const deps = (t.dependencies || []).map(String);
    for (const dep of deps) {
      if (adjList.has(dep)) {
        const isCrossSprint = t.sprintId?.toString() !== tasks.find((x) => x._id.toString() === dep)?.sprintId?.toString();
        edges.push({
          source: dep,
          target: t._id.toString(),
          isCrossSprint,
          isBlocking: tasks.find((x) => x._id.toString() === dep)?.scrumStatus === "BLOCKED",
        });
      }
    }
  }

  // Sprint dependency health score
  let depHealth = 100;
  if (topoResult.hasCycle) depHealth -= 30;
  if (crossSprintDeps.length > 0) depHealth -= crossSprintDeps.length * 10;
  const blockedTasks = tasks.filter((t) => t.scrumStatus === "BLOCKED");
  if (blockedTasks.length > 0) depHealth -= blockedTasks.length * 8;
  depHealth = Math.max(0, Math.min(100, depHealth));

  return {
    graph: { nodes, edges },
    topologicalOrder: topoResult.order,
    hasCycle: topoResult.hasCycle,
    cyclicNodes,
    criticalPath,
    crossSprintDeps,
    blockingChains,
    sprintDependencyHealth: depHealth,
  };
}

/**
 * Calculate critical path through the dependency graph.
 * Uses deterministic longest-path algorithm on DAG.
 */
function calculateCriticalPath(tasks, adjList, inDegree, topoOrder) {
  if (topoOrder.length === 0) return [];

  const taskMap = new Map(tasks.map((t) => [t._id.toString(), t]));
  const dist = new Map(); // longest path to each node
  const pred = new Map(); // predecessor on critical path

  // Initialize distances
  for (const id of adjList.keys()) {
    dist.set(id, 0);
    pred.set(id, null);
  }

  // Process in topological order
  for (const u of topoOrder) {
    const task = taskMap.get(u);
    const weight = task?.estimatedHours || 1;

    for (const v of adjList.get(u) || []) {
      const newDist = dist.get(u) + weight;
      if (newDist > dist.get(v)) {
        dist.set(v, newDist);
        pred.set(v, u);
      }
    }
  }

  // Find the node with maximum distance (end of critical path)
  let maxDist = 0;
  let endNode = null;
  for (const [id, d] of dist.entries()) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Trace back the critical path
  const path = [];
  let current = endNode;
  while (current) {
    path.unshift(current);
    current = pred.get(current);
  }

  return path;
}

/**
 * Detect dependencies that cross Sprint boundaries.
 * These are high-risk because a dependency in a future Sprint
 * can block work in the current Sprint.
 */
function detectCrossSprintDependencies(tasks, currentSprintId) {
  const crossDeps = [];

  for (const task of tasks) {
    const taskSprintId = task.sprintId?.toString();
    const deps = (task.dependencies || []).map(String);

    for (const depId of deps) {
      const depTask = tasks.find((t) => t._id.toString() === depId);
      if (!depTask) continue;

      const depSprintId = depTask.sprintId?.toString();

      // Different sprints
      if (taskSprintId && depSprintId && taskSprintId !== depSprintId) {
        crossDeps.push({
          taskId: task._id.toString(),
          taskTitle: task.title,
          taskSprintId,
          dependsOnId: depId,
          dependsOnTitle: depTask.title,
          dependsOnSprintId: depSprintId,
          risk: "HIGH",
          description: `"${task.title}" in Sprint depends on "${depTask.title}" in a different Sprint`,
        });
      }

      // Task in sprint depends on item NOT in any sprint
      if (taskSprintId && !depSprintId) {
        crossDeps.push({
          taskId: task._id.toString(),
          taskTitle: task.title,
          taskSprintId,
          dependsOnId: depId,
          dependsOnTitle: depTask.title,
          dependsOnSprintId: null,
          risk: "MEDIUM",
          description: `"${task.title}" in Sprint depends on "${depTask.title}" which is still in Product Backlog`,
        });
      }
    }
  }

  return crossDeps;
}

/**
 * Identify blocking chains — sequences of tasks blocked by a root blocker.
 */
function identifyBlockingChains(tasks, adjList) {
  const blockedTasks = tasks.filter((t) => t.scrumStatus === "BLOCKED");
  const chains = [];

  for (const blocked of blockedTasks) {
    const chain = [blocked._id.toString()];
    const downstream = [];

    // Find all tasks downstream of this blocked task
    const visited = new Set();
    const queue = [blocked._id.toString()];
    visited.add(blocked._id.toString());

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adjList.get(current) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          downstream.push(n);
          queue.push(n);
        }
      }
    }

    if (downstream.length > 0) {
      chains.push({
        blockerTaskId: blocked._id.toString(),
        blockerTitle: blocked.title,
        blockedReason: blocked.blockedReason || "Unknown",
        affectedTaskIds: downstream,
        affectedCount: downstream.length,
        totalBlockedHours: downstream
          .map((id) => tasks.find((t) => t._id.toString() === id))
          .filter(Boolean)
          .reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
      });
    }
  }

  return chains;
}

/**
 * Check if adding a dependency would create a cycle.
 * DETERMINISTIC cycle detection.
 *
 * @param {Array} tasks - All tasks
 * @param {String} fromId - Task that will depend on toId
 * @param {String} toId - Task that fromId depends on
 * @returns {Boolean} true if adding the dependency would create a cycle
 */
export function wouldCreateCycle(tasks, fromId, toId) {
  // Temporarily add the dependency and check
  const tempTasks = tasks.map((t) => {
    if (t._id.toString() === fromId) {
      return {
        ...t,
        dependencies: [...(t.dependencies || []).map(String), toId],
      };
    }
    return t;
  });

  const { adjList, inDegree } = buildGraph(tempTasks);
  const result = topologicalSort(adjList, inDegree);
  return result.hasCycle;
}

/**
 * Get dependency impact of a task change.
 * What happens if this task is delayed/blocked/removed?
 */
export function assessDependencyImpact(tasks, taskId) {
  const task = tasks.find((t) => t._id.toString() === taskId);
  if (!task) return { affected: [], totalImpact: 0 };

  const { adjList } = buildGraph(tasks);

  // Find all downstream tasks (BFS from this task)
  const affected = [];
  const visited = new Set();
  const queue = [taskId];
  visited.add(taskId);

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjList.get(current) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        const affectedTask = tasks.find((t) => t._id.toString() === n);
        if (affectedTask) {
          affected.push({
            taskId: n,
            title: affectedTask.title,
            status: affectedTask.scrumStatus || affectedTask.status,
            estimatedHours: affectedTask.estimatedHours || 0,
            sprintId: affectedTask.sprintId?.toString(),
          });
        }
        queue.push(n);
      }
    }
  }

  return {
    affected,
    totalImpact: affected.reduce((sum, t) => sum + t.estimatedHours, 0),
    affectedCount: affected.length,
    crossSprintImpact: affected.filter((t) => t.sprintId && t.sprintId !== task.sprintId?.toString()).length > 0,
  };
}
