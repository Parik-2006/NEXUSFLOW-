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
  ACTIVE:    ["REVIEW", "CANCELLED"],
  REVIEW:    ["COMPLETED", "ACTIVE"], // can return to ACTIVE if review reveals issues
  COMPLETED: [],                       // terminal state
  CANCELLED: [],                       // terminal state
};

// ── Valid Scrum Task State Transitions ─────────────────────────────────────────
const VALID_TASK_TRANSITIONS = {
  BACKLOG:              ["SELECTED_FOR_SPRINT", "CANCELLED"],
  SELECTED_FOR_SPRINT:  ["TODO", "BACKLOG", "CANCELLED"],
  TODO:                 ["IN_PROGRESS", "BLOCKED", "BACKLOG", "CANCELLED"],
  IN_PROGRESS:          ["IN_REVIEW", "BLOCKED", "TODO", "CANCELLED"],
  IN_REVIEW:            ["DONE", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  DONE:                 [],  // terminal — historical truth
  BLOCKED:              ["TODO", "IN_PROGRESS", "CANCELLED"],
  CARRIED_OVER:         ["BACKLOG", "SELECTED_FOR_SPRINT", "TODO"],
  CANCELLED:            ["BACKLOG"], // can be restored to backlog
};

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
  const allowed = VALID_TASK_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
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
  task.scrumStatus = sprint.status === "ACTIVE" ? "TODO" : "SELECTED_FOR_SPRINT";
  if (!task.status || task.status === "todo") task.status = "todo";
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

  const currentStatus = task.scrumStatus || "BACKLOG";

  if (!validateTaskTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid task transition: ${currentStatus} → ${newStatus}`);
  }

  const previousStatus = task.scrumStatus;
  task.scrumStatus = newStatus;

  // Sync legacy status field for V3 compatibility
  const statusMap = {
    TODO: "todo",
    IN_PROGRESS: "in_progress",
    IN_REVIEW: "in_progress",
    DONE: "done",
    BLOCKED: "in_progress",
    BACKLOG: "todo",
    SELECTED_FOR_SPRINT: "todo",
    CARRIED_OVER: "todo",
    CANCELLED: "done",
  };
  task.status = statusMap[newStatus] || "todo";

  if (newStatus === "DONE") {
    task.completedAt = new Date();
    task.progress = 100;
  }

  if (newStatus === "BLOCKED" && reason) {
    task.blockedReason = reason;
  }

  if (newStatus !== "BLOCKED") {
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
 */
export function calculateScrumHealth(sprint, tasks, team) {
  const members = team?.members || [];
  const backlogSize = tasks.filter((t) => t.scrumStatus === "BACKLOG").length;

  // Sprint Goal Health
  const completedTasks = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
  const sprintTasks = tasks.filter((t) => t.sprintId?.toString() === sprint?._id?.toString());
  const sprintGoalHealth = sprintTasks.length > 0
    ? Math.round((completedTasks.filter((t) => t.sprintId?.toString() === sprint?._id?.toString()).length / sprintTasks.length) * 100)
    : 100;

  // Capacity Health
  const capacityHealth = sprint?.totalCapacityHours > 0
    ? Math.round(Math.max(0, 100 - Math.abs(((sprint.allocatedHours / sprint.totalCapacityHours) * 100) - 75)))
    : 100;

  // Dependency Health
  const blockedTasks = tasks.filter((t) => t.scrumStatus === "BLOCKED");
  const dependencyHealth = tasks.length > 0
    ? Math.round(100 - (blockedTasks.length / tasks.length) * 100)
    : 100;

  // Risk Health
  const highRiskCount = tasks.filter((t) => (t.technicalUncertainty || 0) >= 7).length;
  const riskHealth = tasks.length > 0
    ? Math.round(100 - (highRiskCount / tasks.length) * 100)
    : 100;

  // Team Workload Health
  const overloadedMembers = members.filter((m) => (m.assignedLoad || 0) > (m.capacity || 40));
  const teamHealth = members.length > 0
    ? Math.round(100 - (overloadedMembers.length / members.length) * 100)
    : 100;

  // Backlog Health
  const backlogHealth = backlogSize > 0 ? Math.min(100, Math.round((backlogSize / Math.max(1, tasks.length)) * 50 + 50)) : 50;

  const overall = Math.round((sprintGoalHealth + capacityHealth + dependencyHealth + riskHealth + teamHealth) / 5);

  return {
    sprintGoalHealth,
    capacityHealth,
    dependencyHealth,
    riskHealth,
    teamHealth,
    backlogHealth,
    overall,
    status: overall >= 80 ? "HEALTHY" : overall >= 60 ? "AT_RISK" : "CRITICAL",
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
