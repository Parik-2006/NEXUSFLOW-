/**
 * server/services/kanbanChangeImpactService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN CHANGE IMPACT INTELLIGENCE (Prompt 26)
 *
 * Deterministic multi-hop propagation of proposed changes across requirements,
 * work items, dependencies, WIP pressure, and flow completion forecasts.
 *
 * SAFETY GUARANTEE: Read-only simulation. Never mutates live project state.
 * ============================================================================
 */

/**
 * Assess the multi-hop impact of a proposed change in a Kanban environment
 */
export function assessKanbanChangeImpact({
  changeType = "SCOPE_EXPANSION", // "SCOPE_EXPANSION" | "REQUIREMENT_MODIFIED" | "DEADLINE_SHIFT" | "WIP_POLICY_CHANGE"
  targetTaskId = null,
  targetRequirementId = null,
  addedEffortHours = 0,
  shiftedDays = 0,
  tasks = [],
  kanbanConfig = {},
} = {}) {
  const affectedTasks = [];
  const downstreamTaskIds = new Set();

  // Find root task directly modified
  let rootTask = null;
  if (targetTaskId) {
    rootTask = tasks.find((t) => String(t._id) === String(targetTaskId));
    if (rootTask) affectedTasks.push(rootTask);
  } else if (targetRequirementId) {
    // Tasks linked to requirement
    for (const t of tasks) {
      if (t.requirementId === targetRequirementId) {
        affectedTasks.push(t);
        if (!rootTask) rootTask = t;
      }
    }
  }

  // Multi-hop dependency traversal: find all items depending on affected tasks
  const queue = affectedTasks.map((t) => String(t._id));
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currId = queue.shift();
    for (const t of tasks) {
      const deps = (t.dependencies || []).map((d) => String(d?._id || d));
      if (deps.includes(currId)) {
        const tid = String(t._id);
        if (!visited.has(tid)) {
          visited.add(tid);
          downstreamTaskIds.add(tid);
          queue.push(tid);
          affectedTasks.push(t);
        }
      }
    }
  }

  // Calculate flow schedule addition
  const baseEffortHours = addedEffortHours > 0 ? addedEffortHours : 16;
  const daysAdded = parseFloat((baseEffortHours / 6).toFixed(1)); // assuming 6h effective daily flow throughput

  // Measure WIP pressure impact
  const inProgressCol = (kanbanConfig.workflowColumns || []).find((c) => c.id === "in_progress");
  const inProgressLimit = inProgressCol?.wipLimit || 3;
  const currentInProgress = tasks.filter((t) => t.workflowColumn === "in_progress" || t.kanbanStatus === "IN_PROGRESS").length;
  const wipSaturationRatio = Math.round((currentInProgress / inProgressLimit) * 100);

  // Classify severity
  let severity = "LOW";
  if (daysAdded > 5 || downstreamTaskIds.size >= 3 || wipSaturationRatio >= 100) {
    severity = "CRITICAL";
  } else if (daysAdded > 2 || downstreamTaskIds.size >= 1) {
    severity = "HIGH";
  } else if (daysAdded > 1) {
    severity = "MEDIUM";
  }

  // Build transparent narrative
  const targetLabel = rootTask ? `'${rootTask.title}'` : targetRequirementId ? `Requirement [${targetRequirementId}]` : "Selected scope";
  const narrative = [
    `Change simulation on ${targetLabel}:`,
    `1. Direct scope expansion: +${baseEffortHours} hours estimated effort.`,
    `2. Downstream chain: propagates to ${downstreamTaskIds.size} dependent work item(s).`,
    `3. Projected flow schedule elongation: +${daysAdded} days.`,
    `4. WIP Pressure: In Progress column currently at ${wipSaturationRatio}% of limit.`,
    `Severity: ${severity}. Advising replenishment reassessment without modifying live board.`,
  ].join(" ");

  return {
    isSimulation: true,
    severity,
    changeType,
    estimatedAdditionalHours: baseEffortHours,
    projectedDaysAdded: daysAdded,
    directAffectedCount: rootTask ? 1 : affectedTasks.length - downstreamTaskIds.size,
    downstreamCount: downstreamTaskIds.size,
    totalAffectedTasks: affectedTasks.map((t) => ({
      taskId: t._id,
      title: t.title,
      column: t.workflowColumn || t.kanbanStatus || "backlog",
      isDownstream: downstreamTaskIds.has(String(t._id)),
    })),
    wipSaturationRatio,
    narrative,
  };
}
