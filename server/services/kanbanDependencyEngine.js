/**
 * server/services/kanbanDependencyEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN DEPENDENCY & DAG ENGINE (Prompt 15)
 *
 * Cycle prevention, blocking impact, critical path identification, and pull
 * dependency validation. AI must never invent dependencies without evidence.
 * ============================================================================
 */

/**
 * Check if adding an edge source -> target would introduce a cycle in the DAG
 */
export function wouldCreateCycle(taskId, newDependencyId, allTasks = []) {
  if (String(taskId) === String(newDependencyId)) return true;

  // Build adjacency list: node -> dependencies
  const adj = new Map();
  for (const t of allTasks) {
    const tid = String(t._id);
    const deps = (t.dependencies || []).map((d) => String(d?._id || d?.taskId || d?.task || d));
    adj.set(tid, deps);
  }

  // Add the proposed edge: taskId depends on newDependencyId
  const currentDeps = adj.get(String(taskId)) || [];
  adj.set(String(taskId), [...currentDeps, String(newDependencyId)]);

  // DFS cycle detection starting from newDependencyId to see if we can reach taskId
  const visited = new Set();
  const recStack = new Set();

  function dfs(curr) {
    visited.add(curr);
    recStack.add(curr);

    const neighbors = adj.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(curr);
    return false;
  }

  return dfs(String(newDependencyId));
}

/**
 * Analyze complete dependency graph for Kanban work items
 */
export function analyzeKanbanDependencies(tasks = []) {
  const taskMap = new Map();
  for (const t of tasks) {
    taskMap.set(String(t._id), t);
  }

  const dependentsMap = new Map(); // task -> items that depend on it
  for (const t of tasks) {
    const tid = String(t._id);
    if (!dependentsMap.has(tid)) dependentsMap.set(tid, []);
    for (const depId of (t.dependencies || [])) {
      const dKey = String(depId?._id || depId?.taskId || depId?.task || depId);
      if (!dependentsMap.has(dKey)) dependentsMap.set(dKey, []);
      dependentsMap.get(dKey).push(tid);
    }
  }

  // Identify blocked work items whose dependencies are not completed
  const pullBlockers = [];
  const chains = [];

  for (const t of tasks) {
    const tid = String(t._id);
    const isDone = t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
    const unresolvedPrereqs = [];

    for (const depId of (t.dependencies || [])) {
      const dKey = String(depId?._id || depId);
      const prereq = taskMap.get(dKey);
      if (!prereq) continue;
      const prereqDone = prereq.kanbanStatus === "DONE" || prereq.status === "done" || prereq.workflowColumn === "done";
      if (!prereqDone) {
        unresolvedPrereqs.push({
          taskId: prereq._id,
          title: prereq.title,
          status: prereq.kanbanStatus || prereq.status,
          column: prereq.workflowColumn || "in_progress",
        });
      }
    }

    if (!isDone && unresolvedPrereqs.length > 0) {
      pullBlockers.push({
        taskId: t._id,
        title: t.title,
        column: t.workflowColumn || t.kanbanStatus || "backlog",
        unresolvedDependencies: unresolvedPrereqs,
        reason: `Cannot pull cleanly: blocked by ${unresolvedPrereqs.length} incomplete prerequisite(s).`,
      });
    }

    // Measure downstream blocking depth
    const downstream = dependentsMap.get(tid) || [];
    if (downstream.length > 0) {
      chains.push({
        taskId: t._id,
        title: t.title,
        dependentCount: downstream.length,
        dependentTaskIds: downstream,
      });
    }
  }

  // Sort chains by highest downstream impact
  chains.sort((a, b) => b.dependentCount - a.dependentCount);

  return {
    totalTasks: tasks.length,
    blockedFromPullCount: pullBlockers.length,
    pullBlockers,
    highImpactChains: chains.slice(0, 10),
  };
}
