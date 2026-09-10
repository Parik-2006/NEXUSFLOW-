/**
 * server/services/kanbanEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — CENTRAL KANBAN EXECUTION ENGINE (Prompts 1, 5, 6, 7, 9, 10)
 *
 * Core orchestrator for Kanban board queries, continuous pull execution,
 * column moves, WIP validation, timestamp accumulation, and overview metrics.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { getDefaultKanbanConfig, checkDefinitionOfReady, checkDefinitionOfDone } from "./kanbanMethodologyService.js";
import { calculateColumnWip, calculatePersonalWip, validatePullWip } from "./kanbanWipService.js";
import { calculateFlowMetrics } from "./kanbanFlowMetricsService.js";
import { calculateFlowForecast } from "./kanbanForecastService.js";
import { detectBottlenecks } from "./kanbanBottleneckService.js";
import { calculateKanbanHealth } from "./kanbanHealthService.js";
import { aggregateProjectBlockers } from "./kanbanBlockerService.js";
import { analyzeKanbanDependencies } from "./kanbanDependencyEngine.js";
import { handleKanbanMutation } from "./kanbanReactiveEngine.js";

/**
 * Ensure project has initialized kanbanConfig
 */
export async function ensureKanbanConfig(project) {
  if (!project.kanbanConfig || !project.kanbanConfig.workflowColumns || project.kanbanConfig.workflowColumns.length === 0) {
    project.kanbanConfig = getDefaultKanbanConfig();
    project.methodology = "KANBAN";
    await project.save();
  }
  return project.kanbanConfig;
}

/**
 * Fetch complete Kanban board state with tasks partitioned by column
 */
export async function getKanbanBoard(projectId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const config = await ensureKanbanConfig(project);
  const tasks = await Task.find({
    $or: [{ projectId }, { teamId: project.teamId }],
  })
    .populate("assignedTo", "name email avatar role skills")
    .populate("dependencies", "title kanbanStatus workflowColumn status")
    .sort({ priorityScore: -1, createdAt: -1 });

  const columns = config.workflowColumns || [];
  const columnWip = calculateColumnWip(tasks, columns);

  // Group tasks by column
  const boardColumns = columns.map((col) => {
    const colTasks = tasks.filter((t) => {
      if (t.workflowColumn) return t.workflowColumn === col.id;
      // Fallback mappings
      if (col.id === "backlog") return !t.kanbanStatus || t.kanbanStatus === "BACKLOG";
      if (col.id === "ready") return t.kanbanStatus === "READY";
      if (col.id === "in_progress") return t.kanbanStatus === "IN_PROGRESS" || t.status === "in_progress";
      if (col.id === "in_review") return t.kanbanStatus === "IN_REVIEW";
      if (col.id === "done") return t.kanbanStatus === "DONE" || t.status === "done";
      return false;
    });

    const wipInfo = columnWip[col.id] || {};

    return {
      id: col.id,
      name: col.name,
      wipLimit: col.wipLimit,
      isDoneColumn: Boolean(col.isDoneColumn),
      order: col.order,
      count: colTasks.length,
      isSaturated: wipInfo.isSaturated,
      isOverloaded: wipInfo.isOverloaded,
      availableSlots: wipInfo.availableSlots,
      tasks: colTasks,
    };
  });

  // Flow metrics & blockers
  const blockers = aggregateProjectBlockers(tasks);
  const dependencies = analyzeKanbanDependencies(tasks);
  const flowMetrics = calculateFlowMetrics(tasks, { sleTargetDays: config.serviceLevelExpectation?.targetDays || 4 });
  const health = calculateKanbanHealth({
    flowMetrics,
    columnWip,
    blockerData: blockers,
    dependencyData: dependencies,
  });

  return {
    projectId: project._id,
    projectTitle: project.title,
    methodology: project.methodology,
    config,
    columns: boardColumns,
    summary: {
      totalTasks: tasks.length,
      activeWipCount: flowMetrics.activeWipCount,
      completedCount: flowMetrics.totalCompleted,
      activeBlockersCount: blockers.totalActive,
      health,
    },
  };
}

/**
 * Continuous pull operation: move a work item into a downstream stage
 */
export async function pullWorkItem(projectId, taskId, toColumnId, user = {}, options = {}) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const config = await ensureKanbanConfig(project);
  const columns = config.workflowColumns || [];
  const targetCol = columns.find((c) => c.id === toColumnId);
  if (!targetCol) throw new Error(`Target column '${toColumnId}' does not exist.`);

  const task = await Task.findById(taskId).populate("dependencies");
  if (!task) throw new Error("Task not found.");

  const fromColumnId = task.workflowColumn || (task.kanbanStatus ? task.kanbanStatus.toLowerCase() : "backlog");

  // 1. Definition of Ready validation when pulling into Ready or In Progress
  if (config.pullPolicies?.requireDoR && (toColumnId === "ready" || toColumnId === "in_progress")) {
    const dor = checkDefinitionOfReady(task, config.definitionOfReady);
    if (!dor.isReady && !options.hasOverride) {
      return {
        success: false,
        error: `Task does not satisfy Definition of Ready (Score: ${dor.score}%). Missing: ${dor.missingCriteria.join(", ")}.`,
        dor,
      };
    }
  }

  // 2. Dependency blocker check: cannot pull if unresolved prerequisites exist
  if (!config.pullPolicies?.allowPullWhenBlocked && (toColumnId === "in_progress" || toColumnId === "ready")) {
    const unresolved = (task.dependencies || []).filter((d) => {
      const isDone = d.kanbanStatus === "DONE" || d.status === "done" || d.workflowColumn === "done";
      return !isDone;
    });
    if (unresolved.length > 0 && !options.hasOverride) {
      return {
        success: false,
        error: `Cannot pull: blocked by ${unresolved.length} incomplete dependency prerequisite(s).`,
        unresolvedDependencies: unresolved.map((d) => ({ id: d._id, title: d.title })),
      };
    }
  }

  // 3. WIP Limit Validation
  const allTasks = await Task.find({ $or: [{ projectId }, { teamId: project.teamId }] });
  const columnWip = calculateColumnWip(allTasks, columns);
  const currentCount = columnWip[toColumnId]?.count || 0;

  const wipValidation = validatePullWip({
    column: targetCol,
    currentCount,
    classOfService: task.classOfService || "standard",
    hasOverride: Boolean(options.hasOverride),
    wipPolicy: config.wipPolicy,
  });

  if (!wipValidation.allowed) {
    return {
      success: false,
      error: wipValidation.error,
      suggestedAction: wipValidation.suggestedAction,
    };
  }

  // 4. Update task state & timestamps
  const now = new Date();
  task.workflowColumn = toColumnId;

  // Status mapping
  if (toColumnId === "backlog") task.kanbanStatus = "BACKLOG";
  else if (toColumnId === "ready") {
    task.kanbanStatus = "READY";
    if (!task.readyAt) task.readyAt = now;
  } else if (toColumnId === "in_progress") {
    task.kanbanStatus = "IN_PROGRESS";
    task.status = "in_progress";
    if (!task.activeStartedAt) task.activeStartedAt = now;
  } else if (toColumnId === "in_review") {
    task.kanbanStatus = "IN_REVIEW";
    if (!task.reviewStartedAt) task.reviewStartedAt = now;
  } else if (targetCol.isDoneColumn || toColumnId === "done") {
    task.kanbanStatus = "DONE";
    task.status = "done";
    if (!task.doneAt) task.doneAt = now;
    task.completedAt = now;
  }

  // If override was applied, record it
  if (options.hasOverride) {
    task.wipOverride = {
      overriddenBy: user._id || user.id,
      overriddenByName: user.name || "Leader",
      reason: options.overrideReason || "Authorized WIP pull override",
      timestamp: now,
    };

    // Also persist into Project history
    if (!project.kanbanConfig.wipOverridesHistory) project.kanbanConfig.wipOverridesHistory = [];
    project.kanbanConfig.wipOverridesHistory.push({
      taskId: task._id,
      fromColumn: fromColumnId,
      toColumn: toColumnId,
      overriddenBy: user._id || user.id,
      overriddenByName: user.name || "Leader",
      reason: options.overrideReason || "Authorized WIP pull override",
      timestamp: now,
    });
    await project.save();
  }

  await task.save();

  // 5. Invoke Reactive Engine (events + memory + cache invalidation)
  await handleKanbanMutation({
    eventType: "ITEM_PULLED",
    projectId: project._id,
    teamId: project.teamId,
    actor: user,
    taskId: task._id,
    taskTitle: task.title,
    fromState: fromColumnId,
    toState: toColumnId,
    metadata: {
      wipWarning: wipValidation.warning || null,
      isOverridden: Boolean(options.hasOverride),
      overrideReason: options.overrideReason || null,
    },
    io: options.io || null,
  });

  return {
    success: true,
    task,
    fromColumn: fromColumnId,
    toColumn: toColumnId,
    warning: wipValidation.warning,
  };
}

/**
 * Move a work item across columns
 */
export async function moveWorkItem(projectId, taskId, toColumnId, user = {}, options = {}) {
  // Delegate to pullWorkItem for consolidated WIP & policy checks
  return pullWorkItem(projectId, taskId, toColumnId, user, options);
}

/**
 * Fetch Live Kanban Overview Command Center data
 */
export async function getKanbanOverview(projectId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const config = await ensureKanbanConfig(project);
  const tasks = await Task.find({ $or: [{ projectId }, { teamId: project.teamId }] })
    .populate("assignedTo", "name email avatar")
    .sort({ updatedAt: -1 });

  const columns = config.workflowColumns || [];
  const columnWip = calculateColumnWip(tasks, columns);
  const blockers = aggregateProjectBlockers(tasks);
  const dependencies = analyzeKanbanDependencies(tasks);
  const flowMetrics = calculateFlowMetrics(tasks, {
    sleTargetDays: config.serviceLevelExpectation?.targetDays || 4,
    agingWarningDays: config.agingThresholds?.warningDays || 3,
    agingCriticalDays: config.agingThresholds?.criticalDays || 6,
  });
  const forecast = calculateFlowForecast(tasks, {
    sleTargetDays: config.serviceLevelExpectation?.targetDays || 4,
  });
  const bottlenecks = detectBottlenecks(tasks, columns, {
    agingWarningDays: config.agingThresholds?.warningDays || 3,
  });

  const team = await Team.findById(project.teamId);
  const personalWip = calculatePersonalWip(tasks, team?.members || [], config.wipPolicy?.defaultPersonalWip || 3);

  const health = calculateKanbanHealth({
    flowMetrics,
    columnWip,
    bottlenecks,
    blockerData: blockers,
    dependencyData: dependencies,
    personalWip,
  });

  return {
    projectId: project._id,
    projectTitle: project.title,
    methodology: "KANBAN",
    health,
    columnWip,
    flowMetrics,
    forecast,
    bottlenecks,
    blockers: {
      totalActive: blockers.totalActive,
      active: blockers.active.slice(0, 5),
    },
    dependencies: {
      blockedFromPullCount: dependencies.blockedFromPullCount,
      highImpactChains: dependencies.highImpactChains.slice(0, 5),
    },
    personalWip,
    recentActivity: tasks.slice(0, 8).map((t) => ({
      taskId: t._id,
      title: t.title,
      column: t.workflowColumn || t.kanbanStatus || "in_progress",
      updatedAt: t.updatedAt,
      assignee: t.assignedTo?.name || "Unassigned",
    })),
  };
}
