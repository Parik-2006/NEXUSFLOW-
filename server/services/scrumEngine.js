/**
 * server/services/scrumEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM EXECUTION ENGINE
 *
 * Core Sprint lifecycle management and Scrum workflow execution.
 *
 * LIFECYCLE STATE MACHINE:
 *   PLANNING → ACTIVE → REVIEW → COMPLETED
 *                  ↘ CANCELLED
 *
 * SAFETY RULES:
 *   - DONE work is historical truth — never rewrite
 *   - IN_PROGRESS work is protected from automatic replanning
 *   - Sprint Goal changes require explicit authorization
 *   - Sprint completion preserves all history
 *   - Carry-over items are tracked with full provenance
 *   - No silent state mutations
 *
 * DAA / AI SEPARATION:
 *   This engine performs DETERMINISTIC calculations only.
 *   No AI/LLM calls. No probabilistic behavior.
 * ============================================================================
 */

import Sprint from "../models/Sprint.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { recordProjectEvent } from "./eventService.js";
import { logger } from "../utils/logger.js";

// ── Valid Sprint State Transitions ────────────────────────────────────────────
const VALID_TRANSITIONS = {
  PLANNING:  ["ACTIVE", "CANCELLED"],
  ACTIVE:    ["REVIEW", "COMPLETED", "CANCELLED"],
  REVIEW:    ["COMPLETED", "ACTIVE"], // can return to ACTIVE if review reveals issues
  COMPLETED: [],                       // terminal state
  CANCELLED: [],                       // terminal state
};

// ── Valid Scrum Task State Transitions ─────────────────────────────────────────
const VALID_TASK_TRANSITIONS = {
  BACKLOG:              ["SELECTED_FOR_SPRINT", "TODO", "CANCELLED"],
  SELECTED_FOR_SPRINT:  ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "BACKLOG", "CANCELLED"],
  TODO:                 ["IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "BACKLOG", "CANCELLED"],
  IN_PROGRESS:          ["IN_REVIEW", "DONE", "BLOCKED", "TODO", "CANCELLED"],
  IN_REVIEW:            ["DONE", "IN_PROGRESS", "BLOCKED", "TODO", "CANCELLED"],
  DONE:                 ["IN_REVIEW", "IN_PROGRESS"],  // allow reopen/rework if defect found
  BLOCKED:              ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"],
  CARRIED_OVER:         ["BACKLOG", "SELECTED_FOR_SPRINT", "TODO", "IN_PROGRESS"],
  CANCELLED:            ["BACKLOG", "TODO"],
};

/**
 * Normalize Scrum status to canonical uppercase enum.
 */
export function normalizeScrumStatus(status) {
  if (!status) return "TODO";
  const upper = String(status).trim().toUpperCase();
  const mapping = {
    TODO: "TODO",
    TO_DO: "TODO",
    "TO DO": "TODO",
    IN_PROGRESS: "IN_PROGRESS",
    "IN PROGRESS": "IN_PROGRESS",
    INPROGRESS: "IN_PROGRESS",
    IN_REVIEW: "IN_REVIEW",
    "IN REVIEW": "IN_REVIEW",
    INREVIEW: "IN_REVIEW",
    REVIEW: "IN_REVIEW",
    DONE: "DONE",
    COMPLETED: "DONE",
    COMPLETE: "DONE",
    BLOCKED: "BLOCKED",
    BACKLOG: "BACKLOG",
    SELECTED_FOR_SPRINT: "SELECTED_FOR_SPRINT",
    CARRIED_OVER: "CARRIED_OVER",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
  };
  return mapping[upper] || upper;
}

/**
 * Validate a Sprint state transition.
 */
export function validateSprintTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Validate a Scrum task state transition.
 */
export function validateTaskTransition(currentStatus, newStatus) {
  if (!currentStatus || !newStatus) return true; // allow initial assignment
  const normCurrent = normalizeScrumStatus(currentStatus);
  const normNew = normalizeScrumStatus(newStatus);
  if (normCurrent === normNew) return true; // no-op is always valid

  let allowed = [...(VALID_TASK_TRANSITIONS[normCurrent] || [])];
  // Safe compatibility: SELECTED_FOR_SPRINT items are execution-ready (equivalent to TODO)
  if (normCurrent === "SELECTED_FOR_SPRINT") {
    allowed = Array.from(new Set([...allowed, ...(VALID_TASK_TRANSITIONS["TODO"] || [])]));
  }

  return allowed.includes(normNew);
}

/**
 * Create a new Sprint for a Scrum project.
 */
export async function createSprint({
  projectId,
  teamId,
  name,
  goal = "",
  startDate = null,
  endDate = null,
  durationDays = 14,
  actorId = null,
  actorName = "System",
}) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");
  if (project.methodology !== "SCRUM") throw new Error("Project is not using Scrum methodology");

  // Check for existing active sprint
  const activeSprint = await Sprint.findOne({ projectId, status: { $in: ["ACTIVE", "REVIEW"] } });
  if (activeSprint) {
    throw new Error(`Sprint "${activeSprint.name}" is currently active. Complete or cancel it before creating a new sprint.`);
  }

  // Calculate sprint number
  const lastSprint = await Sprint.findOne({ projectId }).sort({ sprintNumber: -1 }).lean();
  const sprintNumber = (lastSprint?.sprintNumber || 0) + 1;

  // Calculate dates
  const calcStartDate = startDate ? new Date(startDate) : new Date();
  const calcEndDate = endDate ? new Date(endDate) : new Date(calcStartDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Calculate team capacity
  const team = await Team.findById(teamId).lean();
  const members = team?.members || [];
  const scrumConfig = project.scrumConfig || {};
  const capacityPerMember = scrumConfig.defaultCapacityPerMember || 30;
  const totalCapacity = members.length * capacityPerMember;

  const memberCapacities = members.map((m) => ({
    userId: m.userId,
    userName: m.name || "Member",
    role: m.role === "leader" ? "scrum_master" : "developer",
    availableHours: capacityPerMember,
    allocatedHours: 0,
    skills: Object.entries(m.skills || {}).filter(([, v]) => v >= 5).map(([k]) => k),
  }));

  const sprint = await Sprint.create({
    projectId,
    teamId,
    sprintNumber,
    name: name || `Sprint ${sprintNumber}`,
    goal,
    startDate: calcStartDate,
    endDate: calcEndDate,
    durationDays,
    status: "PLANNING",
    totalCapacityHours: totalCapacity,
    remainingCapacityHours: totalCapacity,
    memberCapacities,
    history: [
      {
        action: "CREATED",
        actorId,
        actorName,
        reason: `Sprint ${sprintNumber} created`,
        timestamp: new Date(),
      },
    ],
  });

  // Update project sprint count
  await Project.findByIdAndUpdate(projectId, { $inc: { sprintCount: 1 } });

  // Record event
  await recordProjectEvent({
    projectId,
    teamId,
    actorId,
    actorName,
    eventType: "SPRINT_CREATED",
    entityType: "sprint",
    entityId: sprint._id.toString(),
    title: `Sprint ${sprintNumber} created`,
    description: goal ? `Goal: ${goal}` : `Sprint ${sprintNumber} planning started`,
    newValue: { sprintNumber, name: sprint.name, goal, durationDays },
    source: "scrum_engine",
  });

  logger.info("[scrumEngine] Sprint created", { projectId: projectId.toString(), sprintNumber, name: sprint.name });

  return sprint;
}

/**
 * Start a Sprint (PLANNING → ACTIVE).
 */
export async function startSprint({ sprintId, actorId = null, actorName = "System" }) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error("Sprint not found");
  if (!validateSprintTransition(sprint.status, "ACTIVE")) {
    throw new Error(`Cannot start sprint in ${sprint.status} state`);
  }

  // Count planned tasks
  const sprintTasks = await Task.find({ sprintId: sprint._id }).lean();
  const plannedCount = sprintTasks.length;
  const plannedPoints = sprintTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const plannedHours = sprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  sprint.status = "ACTIVE";
  sprint.startDate = sprint.startDate || new Date();
  sprint.plannedTaskCount = plannedCount;
  sprint.plannedStoryPoints = plannedPoints;
  sprint.plannedHours = plannedHours;

  // Set all SELECTED_FOR_SPRINT tasks to TODO
  await Task.updateMany(
    { sprintId: sprint._id, scrumStatus: "SELECTED_FOR_SPRINT" },
    { $set: { scrumStatus: "TODO", status: "todo" } }
  );

  sprint.history.push({
    action: "STARTED",
    actorId,
    actorName,
    reason: `Sprint started with ${plannedCount} tasks`,
    newValue: { plannedCount, plannedPoints, plannedHours },
    timestamp: new Date(),
  });

  await sprint.save();

  // Update project's current sprint
  await Project.findByIdAndUpdate(sprint.projectId, {
    currentSprintId: sprint._id,
    status: "active",
  });

  await recordProjectEvent({
    projectId: sprint.projectId,
    teamId: sprint.teamId,
    actorId,
    actorName,
    eventType: "SPRINT_STARTED",
    entityType: "sprint",
    entityId: sprint._id.toString(),
    title: `${sprint.name} started`,
    description: `Goal: ${sprint.goal || "No goal set"} | ${plannedCount} tasks | ${plannedHours}h planned`,
    newValue: { status: "ACTIVE", plannedCount, plannedPoints, plannedHours },
    source: "scrum_engine",
  });

  return sprint;
}

/**
 * Complete a Sprint (ACTIVE/REVIEW → COMPLETED).
 * Handles carry-over of incomplete work.
 */
export async function completeSprint({ sprintId, actorId = null, actorName = "System", reviewData = null }) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error("Sprint not found");
  if (!validateSprintTransition(sprint.status, "REVIEW") && !validateSprintTransition(sprint.status, "COMPLETED")) {
    throw new Error(`Cannot complete sprint in ${sprint.status} state`);
  }

  const sprintTasks = await Task.find({ sprintId: sprint._id }).lean();

  const completedTasks = sprintTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
  const incompleteTasks = sprintTasks.filter((t) => t.scrumStatus !== "DONE" && t.status !== "done" && t.scrumStatus !== "CANCELLED");

  // Calculate metrics
  sprint.completedTaskCount = completedTasks.length;
  sprint.completedStoryPoints = completedTasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  sprint.actualHours = sprintTasks.reduce((sum, t) => sum + (t.actualHours || t.estimatedHours || 0), 0);

  // Determine goal achievement
  const completionRate = sprint.plannedTaskCount > 0 ? (sprint.completedTaskCount / sprint.plannedTaskCount) * 100 : 0;
  let goalAchieved = "NOT_ACHIEVED";
  if (completionRate >= 90) goalAchieved = "FULLY_ACHIEVED";
  else if (completionRate >= 50) goalAchieved = "PARTIALLY_ACHIEVED";

  // Handle carry-over items — move incomplete back to backlog with history
  const carryOverItems = [];
  for (const task of incompleteTasks) {
    carryOverItems.push({
      taskId: task._id,
      fromSprintId: sprint._id,
      reason: task.scrumStatus === "BLOCKED" ? "blocked" : "incomplete",
      originalEstimate: task.estimatedHours,
      remainingWork: (task.estimatedHours || 0) - (task.actualHours || 0),
    });

    // Update task — move back to backlog with carry-over history
    await Task.findByIdAndUpdate(task._id, {
      $set: {
        sprintId: null,
        scrumStatus: "CARRIED_OVER",
      },
      $push: {
        carryOverHistory: {
          fromSprintId: sprint._id,
          toSprintId: null,
          reason: task.scrumStatus === "BLOCKED" ? "blocked" : "incomplete",
          carriedAt: new Date(),
        },
      },
    });
  }

  sprint.carryOverItems = carryOverItems;
  sprint.status = "COMPLETED";
  sprint.endDate = new Date();

  // Store review if provided
  if (reviewData) {
    sprint.review = {
      goalAchieved,
      completedItems: completedTasks.map((t) => t._id),
      incompleteItems: incompleteTasks.map((t) => t._id),
      ...reviewData,
      reviewedAt: new Date(),
    };
  } else {
    sprint.review = {
      goalAchieved,
      completedItems: completedTasks.map((t) => t._id),
      incompleteItems: incompleteTasks.map((t) => t._id),
      reviewedAt: new Date(),
    };
  }

  sprint.history.push({
    action: "COMPLETED",
    actorId,
    actorName,
    reason: `Sprint completed: ${completedTasks.length}/${sprintTasks.length} tasks done (${Math.round(completionRate)}%)`,
    newValue: { completedTaskCount: sprint.completedTaskCount, carryOverCount: carryOverItems.length, goalAchieved },
    timestamp: new Date(),
  });

  await sprint.save();

  // Update project
  await Project.findByIdAndUpdate(sprint.projectId, {
    currentSprintId: null,
    $inc: { completedSprintCount: 1 },
  });

  // Update velocity history
  const project = await Project.findById(sprint.projectId);
  if (project?.scrumConfig) {
    project.scrumConfig.velocityHistory = [
      ...(project.scrumConfig.velocityHistory || []),
      sprint.completedStoryPoints,
    ];
    await project.save();
  }

  await recordProjectEvent({
    projectId: sprint.projectId,
    teamId: sprint.teamId,
    actorId,
    actorName,
    eventType: "SPRINT_COMPLETED",
    entityType: "sprint",
    entityId: sprint._id.toString(),
    title: `${sprint.name} completed`,
    description: `${completedTasks.length} completed, ${carryOverItems.length} carried over. Goal: ${goalAchieved}`,
    newValue: { completedTaskCount: sprint.completedTaskCount, completionRate: Math.round(completionRate), goalAchieved, carryOverCount: carryOverItems.length },
    source: "scrum_engine",
  });

  return sprint;
}

/**
 * Cancel a Sprint.
 */
export async function cancelSprint({ sprintId, reason = "", actorId = null, actorName = "System" }) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error("Sprint not found");
  if (!validateSprintTransition(sprint.status, "CANCELLED")) {
    throw new Error(`Cannot cancel sprint in ${sprint.status} state`);
  }

  // Move all sprint tasks back to backlog
  await Task.updateMany(
    { sprintId: sprint._id, scrumStatus: { $ne: "DONE" } },
    { $set: { sprintId: null, scrumStatus: "BACKLOG" } }
  );

  sprint.status = "CANCELLED";
  sprint.history.push({
    action: "CANCELLED",
    actorId,
    actorName,
    reason: reason || "Sprint cancelled",
    timestamp: new Date(),
  });

  await sprint.save();

  await Project.findByIdAndUpdate(sprint.projectId, { currentSprintId: null });

  await recordProjectEvent({
    projectId: sprint.projectId,
    teamId: sprint.teamId,
    actorId,
    actorName,
    eventType: "SPRINT_CANCELLED",
    entityType: "sprint",
    entityId: sprint._id.toString(),
    title: `${sprint.name} cancelled`,
    description: reason || "Sprint was cancelled",
    source: "scrum_engine",
  });

  return sprint;
}

/**
 * Get the active Sprint for a project.
 */
export async function getActiveSprint(projectId) {
  return Sprint.findOne({ projectId, status: { $in: ["ACTIVE", "REVIEW"] } }).lean();
}

/**
 * Get Sprint backlog (tasks in a sprint).
 */
export async function getSprintBacklog(sprintId) {
  return Task.find({ sprintId }).sort({ priorityScore: -1 }).lean();
}

/**
 * Add a task to a Sprint with capacity checking.
 */
export async function addToSprint({ sprintId, taskId, actorId = null, actorName = "System" }) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error("Sprint not found");
  if (sprint.status !== "PLANNING" && sprint.status !== "ACTIVE") {
    throw new Error(`Cannot add tasks to sprint in ${sprint.status} state`);
  }

  const task = await Task.findById(taskId);
  if (!task) throw new Error("Task not found");

  const taskHours = task.estimatedHours || 0;
  const newAllocated = sprint.allocatedHours + taskHours;

  // Capacity warning (not a hard block — user decides)
  const capacityExceeded = newAllocated > sprint.totalCapacityHours;

  // Update task
  task.sprintId = sprint._id;
  task.scrumStatus = "TODO";
  task.status = "todo";
  await task.save();

  // Update sprint capacity
  sprint.allocatedHours = newAllocated;
  sprint.remainingCapacityHours = Math.max(0, sprint.totalCapacityHours - newAllocated);
  sprint.plannedTaskCount = await Task.countDocuments({ sprintId: sprint._id });
  sprint.plannedStoryPoints = (await Task.find({ sprintId: sprint._id }).lean())
    .reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  sprint.plannedHours = newAllocated;

  sprint.history.push({
    action: "SCOPE_CHANGED",
    actorId,
    actorName,
    reason: `Task "${task.title}" added to sprint`,
    newValue: { taskId: task._id.toString(), allocatedHours: newAllocated, capacityExceeded },
    timestamp: new Date(),
  });

  await sprint.save();

  return { sprint, task, capacityExceeded };
}

/**
 * Remove a task from a Sprint.
 */
export async function removeFromSprint({ sprintId, taskId, actorId = null, actorName = "System" }) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) throw new Error("Sprint not found");

  const task = await Task.findById(taskId);
  if (!task) throw new Error("Task not found");

  // Protect DONE work
  if (task.scrumStatus === "DONE" || task.status === "done") {
    throw new Error("Cannot remove completed work from sprint — this is historical truth");
  }

  const taskHours = task.estimatedHours || 0;

  task.sprintId = null;
  task.scrumStatus = "BACKLOG";
  await task.save();

  sprint.allocatedHours = Math.max(0, sprint.allocatedHours - taskHours);
  sprint.remainingCapacityHours = sprint.totalCapacityHours - sprint.allocatedHours;
  sprint.plannedTaskCount = await Task.countDocuments({ sprintId: sprint._id });

  sprint.history.push({
    action: "SCOPE_CHANGED",
    actorId,
    actorName,
    reason: `Task "${task.title}" removed from sprint`,
    previousValue: { taskId: task._id.toString() },
    timestamp: new Date(),
  });

  await sprint.save();

  return { sprint, task };
}

/**
 * Update Sprint task status with Scrum state machine enforcement.
 */
export async function updateTaskStatus({ taskId, newStatus, reason = "", actorId = null, actorName = "System" }) {
  const task = await Task.findById(taskId);
  if (!task) throw new Error("Task not found");

  const currentStatus = task.scrumStatus || (task.status ? task.status.toUpperCase() : "BACKLOG");
  const normCurrent = normalizeScrumStatus(currentStatus);
  const normNew = normalizeScrumStatus(newStatus);

  if (!validateTaskTransition(normCurrent, normNew)) {
    throw new Error(`Invalid task transition: ${normCurrent} → ${normNew}`);
  }

  const previousStatus = task.scrumStatus;
  task.scrumStatus = normNew;

  // Sync legacy status field for V3 compatibility and board filtering
  const statusMap = {
    TODO: "todo",
    IN_PROGRESS: "in_progress",
    IN_REVIEW: "in_progress", // Compatible with Task.status enum ["todo", "in_progress", "done"]
    DONE: "done",
    BLOCKED: "todo",
    BACKLOG: "todo",
    SELECTED_FOR_SPRINT: "todo",
    CARRIED_OVER: "todo",
    CANCELLED: "done",
  };
  task.status = statusMap[normNew] || "todo";

  if (normNew === "DONE") {
    task.completedAt = new Date();
    task.progress = 100;
  } else if (normNew === "TODO" || normNew === "BACKLOG") {
    task.completedAt = null;
    task.progress = 0;
  } else if (normNew === "IN_PROGRESS") {
    task.completedAt = null;
    if (!task.progress || task.progress === 100) task.progress = 50;
  } else if (normNew === "IN_REVIEW") {
    task.completedAt = null;
    if (!task.progress || task.progress < 75) task.progress = 85;
  }

  if (normNew === "BLOCKED" && reason) {
    task.blockedReason = reason;
  }
  if (normNew !== "BLOCKED") {
    task.blockedReason = "";
  }

  await task.save();

  // Update sprint metrics if task is in a sprint
  if (task.sprintId) {
    await recalculateSprintMetrics(task.sprintId);
  }

  // Record event
  if (task.projectId) {
    await recordProjectEvent({
      projectId: task.projectId,
      teamId: task.teamId,
      actorId,
      actorName,
      eventType: "TASK_STATUS_CHANGED",
      entityType: "task",
      entityId: task._id.toString(),
      title: `Task "${task.title}" moved to ${newStatus}`,
      description: reason || `Status changed from ${previousStatus} to ${newStatus}`,
      previousValue: { scrumStatus: previousStatus },
      newValue: { scrumStatus: newStatus },
      source: "scrum_engine",
    });
  }

  return task;
}

/**
 * Recalculate Sprint metrics from current task state.
 * DETERMINISTIC — no AI involved.
 */
export async function recalculateSprintMetrics(sprintId) {
  const sprint = await Sprint.findById(sprintId);
  if (!sprint) return null;

  const tasks = await Task.find({ sprintId }).lean();

  const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
  const blocked = tasks.filter((t) => t.scrumStatus === "BLOCKED");
  const inProgress = tasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.scrumStatus === "IN_REVIEW");
  const remaining = tasks.filter((t) => t.scrumStatus === "TODO" || t.scrumStatus === "SELECTED_FOR_SPRINT");

  sprint.completedTaskCount = completed.length;
  sprint.completedStoryPoints = completed.reduce((s, t) => s + (t.storyPoints || 0), 0);
  sprint.actualHours = tasks.reduce((s, t) => s + (t.actualHours || 0), 0);
  sprint.blockedCount = blocked.length;
  sprint.allocatedHours = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
  sprint.remainingCapacityHours = Math.max(0, sprint.totalCapacityHours - sprint.allocatedHours);
  sprint.plannedTaskCount = tasks.length;
  sprint.plannedStoryPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  sprint.plannedHours = sprint.allocatedHours;

  // Calculate health score (deterministic)
  let health = 100;
  const completionRate = tasks.length > 0 ? (completed.length / tasks.length) * 100 : 100;
  const capacityUtilization = sprint.totalCapacityHours > 0 ? (sprint.allocatedHours / sprint.totalCapacityHours) * 100 : 0;

  if (blocked.length > 0) health -= blocked.length * 10;
  if (capacityUtilization > 100) health -= (capacityUtilization - 100) * 2;
  if (sprint.status === "ACTIVE") {
    // Check time progress vs work progress
    const now = new Date();
    const sprintStart = new Date(sprint.startDate);
    const sprintEnd = new Date(sprint.endDate);
    const totalDuration = sprintEnd.getTime() - sprintStart.getTime();
    const elapsed = now.getTime() - sprintStart.getTime();
    const timeProgress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
    const workProgress = completionRate;

    if (timeProgress > 50 && workProgress < timeProgress * 0.5) {
      health -= 20; // significantly behind
    }
  }

  sprint.healthScore = Math.max(0, Math.min(100, Math.round(health)));
  sprint.riskLevel = health >= 80 ? "LOW" : health >= 60 ? "MEDIUM" : health >= 40 ? "HIGH" : "CRITICAL";
  sprint.atRiskItems = blocked.length + remaining.filter((t) => (t.estimatedHours || 0) > sprint.remainingCapacityHours).length;

  await sprint.save();
  return sprint;
}

/**
 * Get Scrum project health (deterministic composite).
 * When no active sprint exists, returns insufficientData state rather than
 * a misleading percentage.
 */
export function calculateScrumHealth(sprint, tasks = [], team = null) {
  const members = team?.members || [];
  const sprintTasks = sprint ? tasks.filter((t) => t.sprintId?.toString() === sprint?._id?.toString()) : [];
  const backlogTasks = tasks.filter((t) => (!t.sprintId || t.scrumStatus === "BACKLOG") && t.scrumStatus !== "CANCELLED");

  // Backlog Readiness calculations (always available if backlog exists)
  const estimatedBacklog = backlogTasks.filter((t) => (t.storyPoints || 0) > 0 || (t.estimatedHours || 0) > 0);
  const specBacklog = backlogTasks.filter((t) => t.userStory && (t.acceptanceCriteria || []).length > 0);
  const backlogReadinessScore = backlogTasks.length > 0
    ? Math.round(((estimatedBacklog.length / backlogTasks.length) * 0.5 + (specBacklog.length / backlogTasks.length) * 0.5) * 100)
    : 0;

  // If no active sprint exists or no sprint tasks, indicate insufficient sprint data
  if (!sprint || sprintTasks.length === 0) {
    return {
      hasSprintData: false,
      insufficientData: true,
      overall: null,
      healthScore: null,
      grade: "INSUFFICIENT_DATA",
      status: "INSUFFICIENT_DATA",
      message: "Insufficient sprint data — plan and complete a sprint to begin tracking delivery health.",
      backlogReadiness: {
        score: backlogReadinessScore,
        totalItems: backlogTasks.length,
        estimatedCount: estimatedBacklog.length,
        specifiedCount: specBacklog.length,
      },
      factors: [],
    };
  }

  // Active sprint calculations
  const completedTasks = sprintTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
  const sprintGoalHealth = sprintTasks.length > 0
    ? Math.round((completedTasks.length / sprintTasks.length) * 100)
    : 0;

  const capacityHealth = sprint?.totalCapacityHours > 0
    ? Math.round(Math.max(0, 100 - Math.abs(((sprint.allocatedHours / sprint.totalCapacityHours) * 100) - 75)))
    : 100;

  const blockedTasks = sprintTasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
  const dependencyHealth = sprintTasks.length > 0
    ? Math.round(100 - (blockedTasks.length / sprintTasks.length) * 100)
    : 100;

  const highRiskCount = sprintTasks.filter((t) => (t.technicalUncertainty || 0) >= 7).length;
  const riskHealth = sprintTasks.length > 0
    ? Math.round(100 - (highRiskCount / sprintTasks.length) * 100)
    : 100;

  const overloadedMembers = members.filter((m) => (m.assignedLoad || 0) > (m.capacity || 40));
  const teamHealth = members.length > 0
    ? Math.round(100 - (overloadedMembers.length / members.length) * 100)
    : 100;

  const overall = Math.round((sprintGoalHealth + capacityHealth + dependencyHealth + riskHealth + teamHealth) / 5);

  return {
    hasSprintData: true,
    insufficientData: false,
    sprintGoalHealth,
    capacityHealth,
    dependencyHealth,
    riskHealth,
    teamHealth,
    overall,
    healthScore: overall,
    status: overall >= 80 ? "HEALTHY" : overall >= 60 ? "AT_RISK" : "CRITICAL",
    grade: overall >= 80 ? "Healthy" : overall >= 60 ? "At Risk" : "Critical",
    backlogReadiness: {
      score: backlogReadinessScore,
      totalItems: backlogTasks.length,
      estimatedCount: estimatedBacklog.length,
      specifiedCount: specBacklog.length,
    },
    factors: [
      { name: "Sprint Goal Trajectory", score: sprintGoalHealth, status: sprintGoalHealth >= 80 ? "healthy" : "attention", desc: `${completedTasks.length} of ${sprintTasks.length} sprint tasks completed` },
      { name: "Capacity Alignment", score: capacityHealth, status: capacityHealth >= 80 ? "healthy" : "attention", desc: `${sprint.allocatedHours || 0}h committed of ${sprint.totalCapacityHours || 0}h capacity` },
      { name: "Dependency Flow", score: dependencyHealth, status: dependencyHealth >= 80 ? "healthy" : "attention", desc: `${blockedTasks.length} blocked tasks` },
      { name: "Risk Health", score: riskHealth, status: riskHealth >= 80 ? "healthy" : "attention", desc: `${highRiskCount} high uncertainty tasks` },
    ],
  };
}

/**
 * Get all sprints for a project.
 */
export async function getProjectSprints(projectId) {
  return Sprint.find({ projectId }).sort({ sprintNumber: -1 }).lean();
}

/**
 * Get sprint by ID.
 */
export async function getSprintById(sprintId) {
  return Sprint.findById(sprintId).lean();
}
