/**
 * server/services/scrumReactiveEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — REACTIVE SPRINT PLANNING ENGINE
 *
 * Detects meaningful project state changes and recalculates Sprint
 * planning, priority, capacity, and health WITHOUT automatically
 * modifying Sprint commitments.
 *
 * BEHAVIOR:
 *   1. Detect impact of a change
 *   2. Recalculate deterministic values
 *   3. Explain the impact
 *   4. Recommend possible actions
 *   5. Require explicit user/team decision for consequential changes
 *
 * HISTORY PRESERVATION:
 *   - DONE work is historical truth — never rewrite
 *   - IN_PROGRESS work is protected from destructive replanning
 *   - TODO/PLANNED work is eligible for replanning
 *   - Historical Sprint decisions are never rewritten
 *
 * DETERMINISTIC — no AI, no randomization.
 * ============================================================================
 */

import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import { recalculateSprintMetrics } from "./scrumEngine.js";
import { calculateScrumPriority, rankBacklog } from "./scrumPriorityEngine.js";
import { calculateSprintCapacity } from "./scrumCapacityEngine.js";
import { analyzeScrumDependencies, assessDependencyImpact } from "./scrumDependencyEngine.js";
import { recordProjectEvent } from "./eventService.js";
import { logger } from "../utils/logger.js";

// Debounce lock to prevent cascade recalculation
const reactiveLocks = new Set();

/**
 * Handle a Scrum-specific project mutation.
 * Detects impact and generates recommendations.
 */
export async function handleScrumMutation({
  projectId,
  teamId,
  actorId = null,
  actorName = "System",
  mutationType,
  entityId = "",
  payload = {},
  io = null,
}) {
  const lockKey = `scrum:${projectId}:${mutationType}:${entityId}`;
  if (reactiveLocks.has(lockKey)) return null;
  reactiveLocks.add(lockKey);

  try {
    const project = await Project.findById(projectId);
    if (!project || project.methodology !== "SCRUM") return null;

    const activeSprint = await Sprint.findOne({ projectId, status: { $in: ["ACTIVE", "REVIEW"] } });
    if (!activeSprint) return null;

    const allTasks = await Task.find({ projectId }).lean();
    const sprintTasks = allTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString());

    let impact = null;

    switch (mutationType) {
      case "TASK_ESTIMATE_CHANGED":
        impact = await handleEstimateChange(activeSprint, sprintTasks, allTasks, payload, projectId, teamId, actorId, actorName);
        break;

      case "TASK_PRIORITY_CHANGED":
        impact = await handlePriorityChange(activeSprint, sprintTasks, allTasks, payload, projectId, teamId);
        break;

      case "TASK_BLOCKED":
        impact = await handleTaskBlocked(activeSprint, sprintTasks, allTasks, payload, projectId, teamId, actorId, actorName);
        break;

      case "DEPENDENCY_ADDED":
      case "DEPENDENCY_REMOVED":
        impact = await handleDependencyChange(activeSprint, sprintTasks, allTasks, payload, projectId, teamId);
        break;

      case "ASSIGNMENT_CHANGED":
        impact = await handleAssignmentChange(activeSprint, sprintTasks, payload, projectId, teamId);
        break;

      case "CAPACITY_CHANGED":
        impact = await handleCapacityChange(activeSprint, sprintTasks, payload, projectId, teamId);
        break;

      case "DEADLINE_CHANGED":
        impact = await handleDeadlineChange(activeSprint, payload, projectId, teamId);
        break;

      default:
        // Recalculate basic sprint metrics for any unknown mutation
        await recalculateSprintMetrics(activeSprint._id);
        break;
    }

    // Always update sprint metrics after any mutation
    await recalculateSprintMetrics(activeSprint._id);

    // Emit socket event for real-time UI updates
    if (io && impact) {
      io.to(`project:${projectId}`).emit("sprint:impact", {
        sprintId: activeSprint._id,
        mutationType,
        impact,
      });
    }

    return impact;
  } catch (err) {
    logger.error("[scrumReactive] Mutation handling error", { error: err.message, mutationType, projectId });
    return null;
  } finally {
    reactiveLocks.delete(lockKey);
  }
}

/**
 * Handle task estimate change.
 */
async function handleEstimateChange(sprint, sprintTasks, allTasks, payload, projectId, teamId, actorId, actorName) {
  const { taskId, previousEstimate, newEstimate } = payload;

  const totalAllocated = sprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const capacityExceeded = totalAllocated > sprint.totalCapacityHours;
  const excess = Math.max(0, totalAllocated - sprint.totalCapacityHours);

  const depImpact = assessDependencyImpact(allTasks, taskId);

  const recommendations = [];
  if (capacityExceeded) {
    recommendations.push({
      type: "CAPACITY_EXCEEDED",
      message: `Sprint capacity exceeded by ${excess}h after estimate change (${previousEstimate}h → ${newEstimate}h)`,
      suggestions: [
        "Remove a lower-priority item from the Sprint",
        "Split a large item into smaller pieces",
        "Accept the overcommitment risk",
      ],
    });
  }

  if (depImpact.affectedCount > 0) {
    recommendations.push({
      type: "DEPENDENCY_IMPACT",
      message: `${depImpact.affectedCount} dependent task(s) affected (${depImpact.totalImpact}h total)`,
      suggestions: ["Review dependent task schedules", "Check if Sprint Goal is still achievable"],
    });
  }

  await recordProjectEvent({
    projectId,
    teamId,
    actorId,
    actorName,
    eventType: "TASK_ESTIMATE_CHANGED",
    entityType: "task",
    entityId: taskId,
    title: "Task estimate changed during Sprint",
    description: `Estimate changed from ${previousEstimate}h to ${newEstimate}h. ${capacityExceeded ? `Sprint capacity exceeded by ${excess}h.` : "Within capacity."}`,
    previousValue: { estimatedHours: previousEstimate },
    newValue: { estimatedHours: newEstimate, capacityExceeded, excess },
    source: "scrum_engine",
  });

  return {
    type: "ESTIMATE_CHANGE_IMPACT",
    severity: capacityExceeded ? "high" : "low",
    capacityExceeded,
    excessHours: excess,
    totalAllocated,
    totalCapacity: sprint.totalCapacityHours,
    dependencyImpact: depImpact,
    recommendations,
  };
}

/**
 * Handle priority change during active Sprint.
 */
async function handlePriorityChange(sprint, sprintTasks, allTasks, payload, projectId, teamId) {
  // Re-rank backlog items (NOT sprint items — sprint is committed)
  const backlogItems = allTasks.filter((t) => !t.sprintId && (t.scrumStatus === "BACKLOG" || !t.scrumStatus));
  const reranked = rankBacklog(backlogItems.map((t) => ({ ...t, _id: t._id })));

  return {
    type: "PRIORITY_CHANGE_IMPACT",
    severity: "low",
    message: "Backlog re-ranked. Active Sprint items remain committed.",
    backlogReranked: reranked.length,
    note: "Sprint commitments are not automatically changed by priority recalculation. Use Sprint Planning to adjust scope.",
  };
}

/**
 * Handle a task becoming blocked.
 */
async function handleTaskBlocked(sprint, sprintTasks, allTasks, payload, projectId, teamId, actorId, actorName) {
  const { taskId, reason } = payload;
  const task = allTasks.find((t) => t._id.toString() === taskId);
  const depImpact = assessDependencyImpact(allTasks, taskId);

  // Check if blocked task affects Sprint Goal
  const blockedHours = task?.estimatedHours || 0;
  const totalRemaining = sprintTasks
    .filter((t) => t.scrumStatus !== "DONE" && t.status !== "done")
    .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  const goalAtRisk = depImpact.affectedCount >= 2 || blockedHours > sprint.remainingCapacityHours * 0.3;

  const recommendations = [];
  if (goalAtRisk) {
    recommendations.push({
      type: "SPRINT_GOAL_AT_RISK",
      message: "Sprint Goal may be at risk due to blocked work",
      suggestions: [
        "Resolve the blocker as soon as possible",
        "Identify alternative approaches",
        "Consider scope adjustment if the blocker persists",
      ],
    });
  }

  if (depImpact.affectedCount > 0) {
    recommendations.push({
      type: "DOWNSTREAM_BLOCKED",
      message: `${depImpact.affectedCount} downstream tasks are affected`,
      suggestions: [
        "Work on unblocked tasks while resolving the blocker",
        "Escalate if the blocker is external",
      ],
    });
  }

  await recordProjectEvent({
    projectId,
    teamId,
    actorId,
    actorName,
    eventType: "TASK_BLOCKED",
    entityType: "task",
    entityId: taskId,
    title: `Task "${task?.title}" blocked`,
    description: reason || "Task blocked during Sprint",
    newValue: { blockedReason: reason, goalAtRisk, affectedCount: depImpact.affectedCount },
    source: "scrum_engine",
  });

  return {
    type: "TASK_BLOCKED_IMPACT",
    severity: goalAtRisk ? "high" : "medium",
    goalAtRisk,
    blockedTask: { id: taskId, title: task?.title, estimatedHours: blockedHours },
    dependencyImpact: depImpact,
    recommendations,
  };
}

/**
 * Handle dependency changes during Sprint.
 */
async function handleDependencyChange(sprint, sprintTasks, allTasks, payload, projectId, teamId) {
  const analysis = analyzeScrumDependencies(allTasks, sprint._id?.toString());

  const recommendations = [];
  if (analysis.hasCycle) {
    recommendations.push({
      type: "CIRCULAR_DEPENDENCY",
      message: "Circular dependency detected! This must be resolved.",
      suggestions: ["Remove one of the dependencies in the cycle", "Restructure the dependency chain"],
    });
  }

  if (analysis.crossSprintDeps.length > 0) {
    recommendations.push({
      type: "CROSS_SPRINT_DEPENDENCY",
      message: `${analysis.crossSprintDeps.length} cross-Sprint dependency(ies) detected`,
      suggestions: [
        "Move the dependency into the current Sprint if possible",
        "Accept the cross-Sprint risk and monitor closely",
      ],
    });
  }

  return {
    type: "DEPENDENCY_CHANGE_IMPACT",
    severity: analysis.hasCycle ? "critical" : analysis.crossSprintDeps.length > 0 ? "high" : "low",
    hasCycle: analysis.hasCycle,
    cyclicNodes: analysis.cyclicNodes,
    crossSprintDeps: analysis.crossSprintDeps,
    blockingChains: analysis.blockingChains,
    dependencyHealth: analysis.sprintDependencyHealth,
    recommendations,
  };
}

/**
 * Handle assignment changes.
 */
async function handleAssignmentChange(sprint, sprintTasks, payload, projectId, teamId) {
  return {
    type: "ASSIGNMENT_CHANGE_IMPACT",
    severity: "low",
    message: "Task assignment updated. Capacity will be recalculated.",
  };
}

/**
 * Handle capacity changes (member availability, etc.).
 */
async function handleCapacityChange(sprint, sprintTasks, payload, projectId, teamId) {
  const totalAllocated = sprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const newCapacity = payload.newCapacity || sprint.totalCapacityHours;
  const capacityExceeded = totalAllocated > newCapacity;

  const recommendations = [];
  if (capacityExceeded) {
    recommendations.push({
      type: "CAPACITY_EXCEEDED_AFTER_CHANGE",
      message: `Capacity reduced. Sprint is now over-committed by ${totalAllocated - newCapacity}h`,
      suggestions: [
        "Defer lower-priority TODO items to next Sprint",
        "Find additional capacity from team members",
        "Accept the risk and monitor progress closely",
      ],
    });
  }

  return {
    type: "CAPACITY_CHANGE_IMPACT",
    severity: capacityExceeded ? "high" : "low",
    previousCapacity: sprint.totalCapacityHours,
    newCapacity,
    totalAllocated,
    capacityExceeded,
    recommendations,
  };
}

/**
 * Handle deadline changes.
 */
async function handleDeadlineChange(sprint, payload, projectId, teamId) {
  return {
    type: "DEADLINE_CHANGE_IMPACT",
    severity: "medium",
    message: "Deadline changed. Sprint timeline and capacity may need review.",
    recommendations: [{
      type: "REVIEW_SPRINT_TIMELINE",
      message: "Check if Sprint dates need adjustment",
      suggestions: ["Review Sprint end date", "Recalculate available working time", "Assess milestone impact"],
    }],
  };
}
