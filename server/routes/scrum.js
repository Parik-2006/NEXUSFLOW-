/**
 * server/routes/scrum.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM API ROUTES (DUAL ROUTING & HYDRATION ENGINE)
 *
 * All Scrum-specific endpoints. Protected by requireAuth middleware.
 * Supports BOTH route conventions:
 *   - Client-style:   /api/scrum/overview/:id, /api/scrum/sprints/:id, etc.
 *   - Spec-style:     /api/scrum/:projectId/overview, etc.
 *
 * Automatically resolves target ID as either Project ID or Team ID.
 *
 * AUTHORIZATION:
 *   - All routes require authenticated user
 *   - Project/Team membership verified
 *   - Consequential changes require appropriate role
 * ============================================================================
 */

import express from "express";
import mongoose from "mongoose";
import Sprint from "../models/Sprint.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Retrospective from "../models/Retrospective.js";
import ProjectMemory from "../models/ProjectMemory.js";
import Risk from "../models/Risk.js";
import ScrumHealthSnapshot from "../models/ScrumHealthSnapshot.js";
import { computeScrumHealth } from "../services/scrumHealthService.js";
import { scanScrumRisks } from "../services/scrumRiskEngine.js";
import {
  isMethodologyAllowedForNewProjects,
  getMethodologyAvailability,
} from "../config/methodologyAvailability.js";
import {
  createSprint,
  startSprint,
  completeSprint,
  cancelSprint,
  getActiveSprint,
  getSprintBacklog,
  addToSprint,
  removeFromSprint,
  updateTaskStatus,
  recalculateSprintMetrics,
  getProjectSprints,
  calculateScrumHealth,
} from "../services/scrumEngine.js";
import { rankBacklog, scorePlanningCandidates, calculateScrumPriority } from "../services/scrumPriorityEngine.js";
import { calculateSprintCapacity, suggestAllocation } from "../services/scrumCapacityEngine.js";
import { analyzeScrumDependencies, wouldCreateCycle, assessDependencyImpact } from "../services/scrumDependencyEngine.js";
import { handleScrumMutation } from "../services/scrumReactiveEngine.js";
import { generateRetrospective, buildDeterministicAnalysis } from "../services/retrospectiveService.js";
import { recordProjectEvent } from "../services/eventService.js";
import {
  analyzeScrumProject,
  generateScrumStorySuggestions,
  approveScrumSuggestion,
  rejectScrumSuggestion,
  updateDraftSuggestion,
  bulkApproveScrumSuggestions,
  calculateScrumPlanReadiness,
  finalizeScrumPlan,
  resolveScrumConflict,
} from "../services/scrumPlanningService.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// ── Helper: verify project / team access (Accepts Project ID OR Team ID) ───────
async function verifyProjectAccess(req, res, targetId) {
  const id = targetId || req.params.id || req.params.projectId || req.params.teamId || req.body?.projectId || req.body?.teamId;
  if (!id) {
    res.status(400).json({ error: "Target ID (Project or Team) is required" });
    return null;
  }

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid Project or Team ID" });
    return null;
  }

  let project = null;
  let team = null;

  // Try finding as Project first
  project = await Project.findById(id);
  if (project) {
    team = await Team.findById(project.teamId);
  } else {
    // Try finding as Team
    team = await Team.findById(id);
    if (team) {
      if (team.activeProjectId && mongoose.isValidObjectId(team.activeProjectId)) {
        project = await Project.findById(team.activeProjectId);
      }
      if (!project) {
        project = await Project.findOne({ teamId: team._id }).sort({ updatedAt: -1 });
      }
    }
  }

  if (!team) {
    res.status(404).json({ error: "Workspace or Project not found" });
    return null;
  }

  // STRICT AUTHORIZATION CHECK FIRST BEFORE ANY DATA MODIFICATION
  const userId = req.user?._id?.toString() || req.user?.id?.toString();
  const userEmail = req.user?.email?.toLowerCase()?.trim();
  const userName = req.user?.name?.trim();
  const isOwner = team.ownerId && team.ownerId.toString() === userId;
  const isMember = Array.isArray(team.members) && team.members.some((m) => {
    const mIdStr = (m.userId?._id || m.userId)?.toString() || "";
    const mName = (m.name || "").toLowerCase().trim();
    return (
      (mIdStr && mIdStr === userId) ||
      (mName && userEmail && mName === userEmail) ||
      (mName && userName && mName === userName)
    );
  });

  if (!isOwner && !isMember && team.ownerId && team.members?.length > 0 && req.user?.role !== "admin") {
    res.status(403).json({ error: "Forbidden: You are not a member of this project's team" });
    return null;
  }

  // If no project exists for this team yet:
  if (!project) {
    const isSetup = req.path === "/setup" || req.url === "/setup";
    if (isSetup) {
      return { project: null, team };
    }
    // Only auto-initialize project if the workspace is actually a Scrum workspace
    if (team.methodology === "SCRUM" || team.methodology === "Scrum") {
      project = await Project.create({
        teamId: team._id,
        title: team.projectTitle || team.name,
        description: team.projectDescription || "",
        methodology: "SCRUM",
        scrumConfig: {
          sprintDuration: 14,
          defaultCapacityPerMember: 30,
          estimationUnit: "both",
          definitionOfDone: ["Code complete", "Tests passing", "Code reviewed", "Documentation updated"],
        },
      });
      team.activeProjectId = project._id;
      await team.save();
    } else {
      res.status(400).json({ error: `Workspace methodology is ${team.methodology || "unspecified"}, not Scrum.` });
      return null;
    }
  }

  return { project, team };
}

// ── Helper: Authoritative Scrum Task Query ───────────────────────────────────
// Ensures only genuine Scrum backlog items and sprint tasks are returned,
// strictly excluding generic Waterfall phase starter tasks.
export const SCRUM_TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "BLOCKED",
  "SELECTED_FOR_SPRINT",
  "CARRIED_OVER",
];

export function getScrumTaskQuery(projectId, teamId) {
  return {
    $or: [{ projectId }, { teamId }],
    $and: [
      {
        $or: [
          { scrumStatus: { $in: SCRUM_TASK_STATUSES } },
          { sprintId: { $ne: null } },
          { source: { $in: ["approved_suggestion", "user_story", "scrum_planning", "manual"] } },
          { userStory: { $exists: true, $ne: "" } },
        ],
      },
      { scrumStatus: { $ne: "CANCELLED" } },
      {
        $nor: [
          {
            scrumStatus: null,
            sprintId: null,
            phase: { $in: ["requirements", "design", "testing", "deployment", "maintenance"] },
            userStory: { $in: [null, ""] },
          },
        ],
      },
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SETUP & CONFIG
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/scrum/setup
 */
router.post("/setup", async (req, res) => {
  try {
    if (!isMethodologyAllowedForNewProjects("SCRUM")) {
      const meta = getMethodologyAvailability("SCRUM");
      return res.status(403).json({
        error: "METHODOLOGY_UNAVAILABLE",
        message: `${meta?.name || "Scrum"} is currently in development and is not available in this environment.`,
        methodology: "SCRUM",
        status: meta?.status || "IN_PROGRESS",
        reason: meta?.reason || "In development.",
      });
    }

    const {
      projectId,
      teamId,
      sprintDuration = 14,
      preferredStartDay = "monday",
      defaultCapacityPerMember = 30,
      workingDaysPerWeek = 5,
      definitionOfDone = [],
      estimationUnit = "both",
      productOwner = null,
      scrumMaster = null,
      initialBacklog = [],
    } = req.body;

    const access = await verifyProjectAccess(req, res, projectId || teamId);
    if (!access) return;
    let { project, team } = access;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    if (!project) {
      project = await Project.create({
        teamId: team._id,
        title: team.projectTitle || team.name,
        description: team.projectDescription || "",
        methodology: "SCRUM",
        status: "planning",
        scrumConfig: {
          sprintDuration,
          defaultSprintLength: sprintDuration,
          preferredStartDay,
          defaultCapacityPerMember,
          workingDaysPerWeek,
          definitionOfDone: definitionOfDone.length > 0 ? definitionOfDone : ["Code complete", "Tests passing", "Code reviewed", "Documentation updated"],
          estimationUnit,
          productOwner: productOwner || null,
          scrumMaster: scrumMaster || null,
          velocityHistory: [],
        },
      });
      team.activeProjectId = project._id;
    } else {
      project.methodology = "SCRUM";
      project.scrumConfig = {
        sprintDuration,
        defaultSprintLength: sprintDuration,
        preferredStartDay,
        defaultCapacityPerMember,
        workingDaysPerWeek,
        definitionOfDone: definitionOfDone.length > 0 ? definitionOfDone : ["Code complete", "Tests passing", "Code reviewed", "Documentation updated"],
        estimationUnit,
        productOwner: productOwner || null,
        scrumMaster: scrumMaster || null,
        velocityHistory: [],
      };
      project.status = "planning";
      await project.save();
    }

    team.methodology = "SCRUM";
    await team.save();

    if (initialBacklog.length > 0) {
      for (const item of initialBacklog) {
        await Task.create({
          teamId: project.teamId,
          projectId: project._id,
          title: item.title || "Backlog Item",
          description: item.description || "",
          userStory: item.userStory || "",
          acceptanceCriteria: item.acceptanceCriteria || [],
          estimatedHours: item.estimatedHours || null,
          storyPoints: item.storyPoints || 1,
          businessValue: item.businessValue || 5,
          urgency: item.urgency || 1,
          scrumStatus: "BACKLOG",
          status: "todo",
          source: item.source || "manual",
          requiredSkills: item.requiredSkills || [],
          createdBy: userId,
        });
      }
    }

    await recordProjectEvent({
      projectId: project._id.toString(),
      teamId: project.teamId.toString(),
      actorId: userId,
      actorName: req.user?.name || "User",
      eventType: "METHODOLOGY_CHANGED",
      entityType: "project",
      entityId: project._id.toString(),
      title: "Scrum Setup completed",
      description: `Project configured for Scrum with ${sprintDuration}-day sprints`,
      newValue: { sprintDuration, estimationUnit, initialBacklogCount: initialBacklog.length },
      source: "user",
    });

    res.json({
      success: true,
      project,
      message: "Scrum project setup complete",
    });
  } catch (err) {
    logger.error("[scrum/setup] Error:", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scrum/config/:id or /api/scrum/:projectId/config
 */
const handleGetConfig = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;
    const { project } = access;
    res.json({
      config: project.scrumConfig || {
        sprintDuration: 14,
        preferredStartDay: "monday",
        defaultCapacityPerMember: 30,
        workingDaysPerWeek: 5,
        definitionOfDone: ["Code complete", "Tests passing", "Code reviewed", "Documentation updated"],
        estimationUnit: "both",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/config/:id", handleGetConfig);
router.get("/:projectId/config", handleGetConfig);

/**
 * PUT /api/scrum/config/:id or /api/scrum/:projectId/config
 */
const handlePutConfig = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;
    const { project } = access;
    project.scrumConfig = {
      ...(project.scrumConfig || {}),
      ...req.body,
    };
    await project.save();
    res.json({ config: project.scrumConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.put("/config/:id", handlePutConfig);
router.put("/:projectId/config", handlePutConfig);

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW (COMMAND CENTER)
// ══════════════════════════════════════════════════════════════════════════════

const handleGetOverview = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const activeSprint = await getActiveSprint(project._id.toString());
    const allTasks = await Task.find(getScrumTaskQuery(project._id, team._id)).lean();

    const sprintTasks = activeSprint
      ? allTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString())
      : [];
    const backlogTasks = allTasks.filter(
      (t) => (!t.sprintId || t.scrumStatus === "BACKLOG") && t.scrumStatus !== "CANCELLED"
    );

    const health = calculateScrumHealth(activeSprint, allTasks, team);

    const completed = sprintTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
    const inProgress = sprintTasks.filter((t) => t.scrumStatus === "IN_PROGRESS");
    const inReview = sprintTasks.filter((t) => t.scrumStatus === "IN_REVIEW");
    const blocked = sprintTasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
    const todo = sprintTasks.filter(
      (t) => t.scrumStatus === "TODO" || t.scrumStatus === "SELECTED_FOR_SPRINT" || t.status === "todo"
    );

    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.storyPoints || 1), 0);
    const completedPoints = completed.reduce((sum, t) => sum + (t.storyPoints || 1), 0);
    const completionRate = sprintTasks.length > 0 ? Math.round((completed.length / sprintTasks.length) * 100) : 0;

    let dayProgress = null;
    if (activeSprint?.startDate && activeSprint?.endDate) {
      const totalDays = Math.max(1, Math.ceil((new Date(activeSprint.endDate) - new Date(activeSprint.startDate)) / (1000 * 60 * 60 * 24)));
      const elapsedDays = Math.max(0, Math.ceil((Date.now() - new Date(activeSprint.startDate)) / (1000 * 60 * 60 * 24)));
      dayProgress = { elapsed: Math.min(elapsedDays, totalDays), total: totalDays };
    }

    const teamCapacityHours = (team.members || []).reduce((sum, m) => sum + (m.capacity || 40), 0);
    const allocatedHours = sprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 6), 0);
    const utilizationPct = teamCapacityHours > 0 ? Math.min(100, Math.round((allocatedHours / teamCapacityHours) * 100)) : 0;

    const blockersList = allTasks
      .filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked")
      .map((t) => ({
        id: t._id,
        taskId: t._id,
        taskTitle: t.title,
        reason: t.blockedReason || "Impasse flagged during development",
        flaggedAt: t.updatedAt,
      }));

    const readyCount = backlogTasks.filter((t) => t.userStory && (t.acceptanceCriteria || []).length > 0).length;

    res.json({
      project: {
        title: project.title,
        methodology: project.methodology || "SCRUM",
        status: project.status,
      },
      currentSprint: activeSprint ? {
        id: activeSprint._id,
        _id: activeSprint._id,
        name: activeSprint.name,
        goal: activeSprint.goal,
        status: activeSprint.status,
        dayProgress,
        progress: completionRate,
        completionRate,
        tasks: {
          completed: completed.length,
          inProgress: inProgress.length,
          inReview: inReview.length,
          blocked: blocked.length,
          remaining: todo.length,
          total: sprintTasks.length,
        },
        capacity: {
          total: activeSprint.totalCapacityHours || teamCapacityHours,
          allocated: activeSprint.allocatedHours || allocatedHours,
          remaining: Math.max(0, (activeSprint.totalCapacityHours || teamCapacityHours) - (activeSprint.allocatedHours || allocatedHours)),
          utilization: utilizationPct,
        },
        healthScore: activeSprint.healthScore || health.healthScore,
        riskLevel: activeSprint.riskLevel || health.grade,
      } : null,
      metrics: {
        completionRate,
        totalStoryPoints: totalPoints,
        completedStoryPoints: completedPoints,
        blockedCount: blockersList.length,
        tasksCount: {
          todo: todo.length,
          in_progress: inProgress.length,
          in_review: inReview.length,
          done: completed.length,
          blocked: blocked.length,
          total: sprintTasks.length,
        },
      },
      capacity: {
        totalCapacity: teamCapacityHours,
        allocatedHours,
        utilizationPct,
        overloadedMembers: (team.members || []).filter((m) => (m.assignedLoad || 0) > (m.capacity || 40)).map((m) => m.name),
      },
      blockers: blockersList,
      backlogSummary: {
        totalCount: backlogTasks.length,
        totalStoryPoints: backlogTasks.reduce((sum, t) => sum + (t.storyPoints || 1), 0),
        readyCount,
      },
      upcomingEvents: [
        { title: "Daily Standup", time: "Tomorrow, 09:30 AM", type: "standup" },
        { title: "Sprint Backlog Refinement", time: "Thursday, 02:00 PM", type: "refinement" },
        { title: "Sprint Review & Demo", time: "Sprint End, 04:00 PM", type: "review" },
      ],
      currentSprintTasks: sprintTasks,
      backlogTasks: backlogTasks.slice(0, 30),
      teamMembers: team.members || [],
      health,
      backlog: {
        total: backlogTasks.length,
        highPriority: backlogTasks.filter((t) => (t.urgency || 0) >= 4 || (t.businessValue || 0) >= 8).length,
      },
      team: {
        _id: team._id,
        name: team.name,
        ownerId: team.ownerId,
        members: team.members || [],
        size: team.members?.length || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/overview/:id", handleGetOverview);
router.get("/:projectId/overview", handleGetOverview);

// ══════════════════════════════════════════════════════════════════════════════
// SPRINTS (LIFECYCLE)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/sprints/:id or /api/scrum/:projectId/sprints
 */
const handleGetSprints = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const isOwner = access.team.ownerId && access.team.ownerId.toString() === userId;
    const memberMeta = Array.isArray(access.team.members) && access.team.members.find((m) => {
      const mId = (m.userId?._id || m.userId)?.toString();
      return mId === userId;
    });
    const isLeader = isOwner ||
      memberMeta?.role === "leader" ||
      memberMeta?.role === "lead" ||
      memberMeta?.role === "manager" ||
      memberMeta?.role === "scrum_master" ||
      req.user?.role === "leader" ||
      req.user?.role === "lead" ||
      req.user?.role === "admin";

    const sprints = await getProjectSprints(access.project._id.toString());
    res.json({
      sprints,
      isLeader,
      team: {
        _id: access.team._id,
        name: access.team.name,
        ownerId: access.team.ownerId,
        members: access.team.members || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/sprints/:id", handleGetSprints);
router.get("/:projectId/sprints", handleGetSprints);

/**
 * POST /api/scrum/sprints/:id or /api/scrum/:projectId/sprints
 */
const handleCreateSprint = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const sprint = await createSprint({
      projectId: access.project._id.toString(),
      teamId: access.team._id,
      name: req.body.name,
      goal: req.body.goal,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      durationDays: req.body.durationDays || access.project.scrumConfig?.sprintDuration || 14,
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    res.json({ sprint, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.post("/sprints/:id", handleCreateSprint);
router.post("/:projectId/sprints", handleCreateSprint);

/**
 * PUT /api/scrum/sprints/:sprintId
 */
const handleUpdateSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    if (sprint.status === "COMPLETED" || sprint.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot modify a completed or cancelled sprint" });
    }

    const allowedFields = ["name", "goal", "startDate", "endDate", "durationDays"];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    if (Object.keys(updates).length > 0) {
      Object.assign(sprint, updates);
      sprint.history.push({
        action: "UPDATED",
        actorId: userId,
        actorName: req.user?.name || "User",
        reason: `Sprint updated: ${Object.keys(updates).join(", ")}`,
        previousValue: allowedFields.reduce((acc, f) => { if (req.body[f] !== undefined) acc[f] = sprint[f]; return acc; }, {}),
        newValue: updates,
        timestamp: new Date(),
      });
      await sprint.save();
    }

    res.json({ sprint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.put("/sprints/:sprintId", handleUpdateSprint);
router.put("/:projectId/sprints/:sprintId", handleUpdateSprint);

/**
 * POST /api/scrum/sprints/:sprintId/start
 */
const handleStartSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const updated = await startSprint({
      sprintId: req.params.sprintId,
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    res.json({ sprint: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/start", handleStartSprint);
router.post("/:projectId/sprints/:sprintId/start", handleStartSprint);

/**
 * POST /api/scrum/sprints/:sprintId/complete
 */
const handleCompleteSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const updated = await completeSprint({
      sprintId: req.params.sprintId,
      actorId: userId,
      actorName: req.user?.name || "User",
      reviewData: req.body.review || null,
      carryOverAction: req.body.carryOverAction || "BACKLOG",
    });

    await ProjectMemory.create({
      projectId: sprint.projectId,
      category: "SPRINT_REVIEW",
      title: `${updated.name} completed`,
      content: `Goal: ${updated.goal || "None"}. Completed: ${updated.completedTaskCount}/${updated.plannedTaskCount} tasks. Carry-over: ${updated.carryOverItems?.length || 0} items.`,
      scope: "persistent",
      authorId: userId,
      authorName: req.user?.name || "User",
      confidence: 1.0,
      tags: ["sprint-completion", `sprint-${updated.sprintNumber}`],
    });

    res.json({ sprint: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/complete", handleCompleteSprint);
router.post("/:projectId/sprints/:sprintId/complete", handleCompleteSprint);

/**
 * POST /api/scrum/sprints/:sprintId/cancel
 */
const handleCancelSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const updated = await cancelSprint({
      sprintId: req.params.sprintId,
      reason: req.body.reason || "",
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    res.json({ sprint: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/cancel", handleCancelSprint);
router.post("/:projectId/sprints/:sprintId/cancel", handleCancelSprint);

/**
 * DELETE /api/scrum/sprints/:sprintId or /api/scrum/:projectId/sprints/:sprintId
 * Team Leader-Only Delete Sprint Action
 */
const handleDeleteSprint = async (req, res) => {
  try {
    const sprintId = req.params.sprintId;
    if (!mongoose.isValidObjectId(sprintId)) {
      return res.status(400).json({ error: "Invalid Sprint ID" });
    }

    const sprint = await Sprint.findById(sprintId);
    if (!sprint) {
      return res.status(404).json({ error: "Sprint not found" });
    }

    if (req.params.projectId && req.params.projectId !== sprint.projectId.toString()) {
      return res.status(403).json({ error: "Forbidden: Sprint does not belong to specified project" });
    }

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const { project, team } = access;

    if (project.methodology !== "SCRUM") {
      return res.status(400).json({ error: "Sprint deletion is only valid for Scrum methodology projects" });
    }

    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    // Verify authorized team leader permissions
    const isOwner = team.ownerId && team.ownerId.toString() === userId;
    const memberMeta = Array.isArray(team.members) && team.members.find((m) => {
      const mId = (m.userId?._id || m.userId)?.toString();
      return mId === userId;
    });
    const isLeader = isOwner ||
      memberMeta?.role === "leader" ||
      memberMeta?.role === "lead" ||
      memberMeta?.role === "manager" ||
      memberMeta?.role === "scrum_master" ||
      req.user?.role === "leader" ||
      req.user?.role === "lead" ||
      req.user?.role === "admin";

    if (!isLeader) {
      return res.status(403).json({
        error: "Forbidden: Only authorized team leaders can delete sprints.",
      });
    }

    // Lifecycle validation
    if (sprint.status === "ACTIVE") {
      return res.status(400).json({
        error: `Active sprint "${sprint.name}" cannot be hard-deleted. Sprints in active execution must be completed or cancelled through sprint review.`,
      });
    }

    if (sprint.status === "COMPLETED" || sprint.status === "REVIEW") {
      return res.status(400).json({
        error: `Historical sprint "${sprint.name}" (${sprint.status}) cannot be deleted. Retain completed sprint records for audit history and velocity metrics.`,
      });
    }

    // For PLANNING (or CANCELLED) sprints:
    // Safely uncommit associated tasks and restore them to eligible Unassigned Backlog
    const sprintTasks = await Task.find({ sprintId: sprint._id });
    const taskIds = sprintTasks.map((t) => t._id);

    if (taskIds.length > 0) {
      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          $set: {
            sprintId: null,
            scrumStatus: "BACKLOG",
            status: "todo",
          },
        }
      );
    }

    // Clean up draft retrospective records for this deleted sprint
    await Retrospective.deleteMany({ sprintId: sprint._id });

    // Clear currentSprintId on Project if it was pointing to this sprint
    if (project.currentSprintId && project.currentSprintId.toString() === sprint._id.toString()) {
      await Project.findByIdAndUpdate(project._id, { currentSprintId: null });
    }

    // Delete the sprint record
    await Sprint.findByIdAndDelete(sprint._id);

    // Refresh project & team metrics
    const scrumQuery = getScrumTaskQuery(project._id, team._id);
    const totalCount = await Task.countDocuments(scrumQuery);
    await Team.findByIdAndUpdate(team._id, { taskCount: totalCount });
    await Project.findByIdAndUpdate(project._id, { taskCount: totalCount });

    // Record auditable project event
    await recordProjectEvent({
      projectId: project._id,
      teamId: team._id,
      actorId: userId,
      actorName: req.user?.name || "Team Leader",
      eventType: "SPRINT_DELETED",
      entityType: "sprint",
      entityId: sprint._id.toString(),
      title: `Sprint ${sprint.name} deleted`,
      description: `Planning sprint ${sprint.name} deleted by authorized team leader. ${taskIds.length} stories safely returned to Unassigned Backlog.`,
      source: "scrum_engine",
    });

    const io = req.app?.get("io");
    if (io) {
      io.to(`team:${team._id}`).emit("scrum:sprint_deleted", {
        teamId: team._id.toString(),
        projectId: project._id.toString(),
        sprintId: sprint._id.toString(),
        uncommittedCount: taskIds.length,
      });
    }

    res.json({
      success: true,
      message: `Sprint "${sprint.name}" deleted successfully. ${taskIds.length} stories returned to unassigned backlog.`,
      deletedSprintId: sprint._id,
      uncommittedCount: taskIds.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.delete("/sprints/:sprintId", handleDeleteSprint);
router.delete("/:projectId/sprints/:sprintId", handleDeleteSprint);

/**
 * GET & POST /api/scrum/sprints/:sprintId/review
 */
const handleGetReview = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId).lean();
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const tasks = await Task.find({ sprintId: sprint._id }).lean();
    const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
    const incomplete = tasks.filter((t) => t.scrumStatus !== "DONE" && t.status !== "done" && t.scrumStatus !== "CANCELLED");

    const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

    res.json({
      review: {
        sprint: {
          id: sprint._id,
          name: sprint.name,
          goal: sprint.goal,
          status: sprint.status,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
        },
        goalStatus: completionRate >= 90 ? "FULLY_ACHIEVED" : completionRate >= 50 ? "PARTIALLY_ACHIEVED" : "NOT_ACHIEVED",
        completionRate,
        completed: completed.map((t) => ({
          id: t._id, title: t.title, storyPoints: t.storyPoints,
          acceptanceCriteria: t.acceptanceCriteria,
        })),
        incomplete: incomplete.map((t) => ({
          id: t._id, title: t.title, status: t.scrumStatus || t.status,
          reason: t.blockedReason || "Incomplete",
        })),
        savedReview: sprint.review,
        metrics: {
          plannedTasks: sprint.plannedTaskCount,
          completedTasks: completed.length,
          plannedPoints: sprint.plannedStoryPoints,
          completedPoints: sprint.completedStoryPoints,
          plannedHours: sprint.plannedHours,
          actualHours: sprint.actualHours,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/sprints/:sprintId/review", handleGetReview);
router.get("/:projectId/sprints/:sprintId/review", handleGetReview);

const handlePostReview = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    sprint.review = {
      ...sprint.review,
      ...req.body,
      reviewedBy: userId,
      reviewedAt: new Date(),
    };

    if (sprint.status === "ACTIVE") {
      sprint.status = "REVIEW";
      sprint.history.push({
        action: "REVIEWED",
        actorId: userId,
        actorName: req.user?.name || "User",
        reason: "Sprint Review submitted",
        timestamp: new Date(),
      });
    }

    await sprint.save();
    res.json({ sprint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/review", handlePostReview);
router.post("/:projectId/sprints/:sprintId/review", handlePostReview);

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT BACKLOG
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/backlog/:id or /api/scrum/:projectId/backlog
 */
const handleGetBacklog = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const tasks = await Task.find(getScrumTaskQuery(project._id, team._id))
      .sort({ priorityScore: -1 })
      .lean();

    const teamSkills = [];
    team.members?.forEach((m) => {
      Object.entries(m.skills || {})
        .filter(([, v]) => (v || 0) >= 5)
        .forEach(([k]) => teamSkills.push(k));
    });

    const ranked = rankBacklog(tasks, { teamSkills });

    res.json({
      backlog: ranked,
      items: ranked,
      total: ranked.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/backlog/:id", handleGetBacklog);
router.get("/:projectId/backlog", handleGetBacklog);

/**
 * POST /api/scrum/backlog/:id or /api/scrum/:projectId/backlog
 */
const handleCreateBacklogItem = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    const task = await Task.create({
      teamId: team._id,
      projectId: project._id,
      title: req.body.title || "New Story",
      description: req.body.description || req.body.want || "",
      userStory: req.body.userStory || (req.body.want ? `As a ${req.body.role || "user"}, I want ${req.body.want}, so that ${req.body.benefit || "it helps the project"}` : ""),
      acceptanceCriteria: Array.isArray(req.body.acceptanceCriteria) ? req.body.acceptanceCriteria : (req.body.acceptanceCriteria ? [String(req.body.acceptanceCriteria)] : []),
      estimatedHours: req.body.estimatedHours ? Number(req.body.estimatedHours) : 6,
      storyPoints: req.body.storyPoints ? Number(req.body.storyPoints) : 3,
      businessValue: req.body.businessValue ? Number(req.body.businessValue) : 50,
      urgency: req.body.urgency ? Number(req.body.urgency) : 2,
      impact: req.body.impact ? Number(req.body.impact) : 2,
      scrumStatus: "BACKLOG",
      status: "todo",
      requiredSkills: req.body.requiredSkills || [],
      teacherImportance: req.body.teacherImportance || null,
      milestoneImportance: req.body.milestoneImportance || null,
      technicalUncertainty: req.body.technicalUncertainty || null,
      expectedValue: req.body.expectedValue || null,
      dependencies: req.body.dependencies || [],
      source: req.body.source || "manual",
      createdBy: userId,
    });

    await recordProjectEvent({
      projectId: project._id.toString(),
      teamId: team._id.toString(),
      actorId: userId,
      actorName: req.user?.name || "User",
      eventType: "BACKLOG_ITEM_CREATED",
      entityType: "backlog_item",
      entityId: task._id.toString(),
      title: `Backlog item created: "${task.title}"`,
      newValue: { title: task.title, storyPoints: task.storyPoints },
      source: "user",
    });

    res.json({ task, item: task, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/backlog/:id", handleCreateBacklogItem);
router.post("/:projectId/backlog", handleCreateBacklogItem);

/**
 * PUT /api/scrum/backlog/task/:taskId or /api/scrum/:projectId/backlog/:itemId
 */
const handleUpdateBacklogItem = async (req, res) => {
  try {
    const taskId = req.params.taskId || req.params.itemId;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Item not found" });

    const access = await verifyProjectAccess(req, res, (task.projectId || task.teamId).toString());
    if (!access) return;

    if (task.scrumStatus === "DONE") {
      return res.status(400).json({ error: "Cannot modify completed items — historical truth" });
    }

    const allowedFields = [
      "title", "description", "userStory", "acceptanceCriteria",
      "estimatedHours", "storyPoints", "businessValue", "urgency", "impact",
      "requiredSkills", "teacherImportance", "milestoneImportance",
      "technicalUncertainty", "expectedValue", "priorityLabel", "dependencies",
    ];

    const previousValues = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        previousValues[field] = task[field];
        task[field] = req.body[field];
      }
    }

    await task.save();

    if (task.sprintId) {
      const estimateChanged = previousValues.estimatedHours !== undefined;
      if (estimateChanged) {
        await handleScrumMutation({
          projectId: (task.projectId || access.project._id).toString(),
          teamId: access.team._id,
          actorId: req.user?._id?.toString() || req.user?.id?.toString(),
          actorName: req.user?.name || "User",
          mutationType: "TASK_ESTIMATE_CHANGED",
          entityId: task._id.toString(),
          payload: {
            taskId: task._id.toString(),
            previousEstimate: previousValues.estimatedHours,
            newEstimate: task.estimatedHours,
          },
        });
      }
    }

    res.json({ task, item: task, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.put("/backlog/task/:taskId", handleUpdateBacklogItem);
router.put("/:projectId/backlog/:itemId", handleUpdateBacklogItem);

/**
 * DELETE /api/scrum/backlog/task/:taskId or /api/scrum/:projectId/backlog/:itemId
 */
const handleDeleteBacklogItem = async (req, res) => {
  try {
    const taskId = req.params.taskId || req.params.itemId;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Item not found" });

    const access = await verifyProjectAccess(req, res, (task.projectId || task.teamId).toString());
    if (!access) return;

    if (task.scrumStatus === "DONE") {
      return res.status(400).json({ error: "Cannot delete completed items" });
    }

    await Task.findByIdAndDelete(taskId);
    res.json({ success: true, message: "Backlog item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.delete("/backlog/task/:taskId", handleDeleteBacklogItem);
router.delete("/:projectId/backlog/:itemId", handleDeleteBacklogItem);

// ══════════════════════════════════════════════════════════════════════════════
// SPRINT PLANNING (DAA DETERMINISTIC ENGINE)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/scrum/planning/candidates/:id or /api/scrum/:projectId/sprints/:sprintId/plan
 */
const handlePlanningCandidates = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const capacityHours = Number(req.body.capacityHours) || 80;

    const backlog = await Task.find({
      $or: [{ projectId: project._id }, { teamId: team._id }],
      $and: [
        { $or: [{ sprintId: null }, { scrumStatus: "BACKLOG" }, { scrumStatus: "CARRIED_OVER" }] },
        { scrumStatus: { $nin: ["DONE", "CANCELLED"] } },
      ],
    }).lean();

    const teamSkills = [];
    team.members?.forEach((m) => {
      Object.entries(m.skills || {})
        .filter(([, v]) => (v || 0) >= 5)
        .forEach(([k]) => teamSkills.push(k));
    });

    const planning = scorePlanningCandidates(backlog, {
      totalCapacity: capacityHours,
      teamSkills,
    });

    res.json({
      candidates: planning.candidates || [],
      committed: planning.committed || [],
      remainingBacklog: planning.remainingBacklog || [],
      capacitySummary: planning.capacitySummary || {
        totalCapacityHours: capacityHours,
        allocatedHours: (planning.committed || []).reduce((sum, c) => sum + (c.estimatedHours || 0), 0),
        utilizationPct: 0,
      },
      recommendations: [
        `Recommended commitment fits comfortably within team capacity of ${capacityHours}h`,
        "Deterministic DAA ranking prioritizes high-value, unblocked critical path user stories",
      ],
      planning,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/planning/candidates/:id", handlePlanningCandidates);
router.post("/:projectId/planning/candidates", handlePlanningCandidates);
router.post("/:projectId/sprints/:sprintId/plan", handlePlanningCandidates);

/**
 * POST /api/scrum/planning/commit/:id
 */
const handleCommitPlanning = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const sprintId = req.body.sprintId;
    const name = req.body.name;
    const goal = req.body.goal || req.body.sprintGoal;
    const duration = Number(req.body.duration || req.body.durationDays) || 14;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const selectedTaskIds = req.body.committedTaskIds || req.body.selectedTaskIds || req.body.taskIds || [];
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    if (!Array.isArray(selectedTaskIds) || selectedTaskIds.length === 0) {
      return res.status(400).json({
        error: "NO_STORIES_SELECTED",
        message: "Please select at least one eligible Product Backlog story to commit to the sprint.",
      });
    }

    let sprint = null;
    if (sprintId && mongoose.isValidObjectId(sprintId)) {
      sprint = await Sprint.findById(sprintId);
      if (sprint) {
        if (sprint.projectId.toString() !== project._id.toString()) {
          return res.status(403).json({ error: "Sprint does not belong to this project" });
        }
        if (sprint.status !== "PLANNING" && sprint.status !== "ACTIVE") {
          return res.status(400).json({ error: `Cannot commit stories to sprint in ${sprint.status} state` });
        }
        if (name && name.trim()) sprint.name = name.trim();
        if (goal && goal.trim()) sprint.goal = goal.trim();
        if (startDate) sprint.startDate = new Date(startDate);
        if (endDate) sprint.endDate = new Date(endDate);
        if (duration) sprint.durationDays = duration;
        await sprint.save();
      }
    }

    if (!sprint) {
      const existingSprintCount = (await Sprint.countDocuments({ projectId: project._id })) || 0;
      sprint = await createSprint({
        projectId: project._id.toString(),
        teamId: team._id,
        name: name || `Sprint ${String(existingSprintCount + 1).padStart(2, "0")}`,
        goal: goal || "Sprint execution goal",
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        durationDays: duration,
        actorId: userId,
        actorName: req.user?.name || "User",
      });
    }

    // Commit each selected story to the sprint
    let committedCount = 0;
    for (const tId of selectedTaskIds) {
      const task = await Task.findOne({
        _id: tId,
        $or: [{ projectId: project._id }, { teamId: team._id }],
      });
      if (!task) continue;

      await addToSprint({
        sprintId: sprint._id.toString(),
        taskId: tId,
        actorId: userId,
        actorName: req.user?.name || "User",
      });
      committedCount++;
    }

    // Refresh sprint metrics
    const sprintTasks = await Task.find({ sprintId: sprint._id }).lean();
    sprint.plannedTaskCount = sprintTasks.length;
    sprint.plannedStoryPoints = sprintTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    sprint.plannedHours = sprintTasks.reduce((acc, t) => acc + (t.estimatedHours || 0), 0);
    sprint.allocatedHours = sprint.plannedHours;
    sprint.remainingCapacityHours = Math.max(0, (sprint.totalCapacityHours || 0) - sprint.allocatedHours);
    await sprint.save();

    // Ensure team task count is refreshed
    const scrumQuery = getScrumTaskQuery(project._id, team._id);
    const totalCount = await Task.countDocuments(scrumQuery);
    await Team.findByIdAndUpdate(team._id, { taskCount: totalCount });
    await Project.findByIdAndUpdate(project._id, { taskCount: totalCount });

    const io = req.app?.get("io");
    if (io) {
      io.to(`team:${team._id}`).emit("scrum:sprint_committed", {
        teamId: team._id.toString(),
        projectId: project._id.toString(),
        sprintId: sprint._id.toString(),
        committedCount,
      });
    }

    res.json({
      success: true,
      sprint,
      committedTaskCount: committedCount,
      message: `Successfully committed ${committedCount} story/stories to ${sprint.name}!`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/planning/commit/:id", handleCommitPlanning);
router.post("/:projectId/planning/commit", handleCommitPlanning);

/**
 * POST /api/scrum/:projectId/sprints/:sprintId/items
 */
const handleAddItemToSprint = async (req, res) => {
  try {
    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const result = await addToSprint({
      sprintId: req.params.sprintId,
      taskId: req.body.taskId,
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/items", handleAddItemToSprint);
router.post("/:projectId/sprints/:sprintId/items", handleAddItemToSprint);

/**
 * DELETE /api/scrum/:projectId/sprints/:sprintId/items/:taskId
 */
const handleRemoveItemFromSprint = async (req, res) => {
  try {
    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const result = await removeFromSprint({
      sprintId: req.params.sprintId,
      taskId: req.params.taskId,
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.delete("/sprints/:sprintId/items/:taskId", handleRemoveItemFromSprint);
router.delete("/:projectId/sprints/:sprintId/items/:taskId", handleRemoveItemFromSprint);

// ══════════════════════════════════════════════════════════════════════════════
// TASK STATUS (SCRUM EXECUTION BOARD)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/scrum/task/:taskId/status or /api/scrum/:projectId/tasks/:taskId/status
 */
const handleUpdateTaskStatus = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const access = await verifyProjectAccess(req, res, (task.projectId || task.teamId).toString());
    if (!access) return;

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    const updated = await updateTaskStatus({
      taskId,
      newStatus: req.body.status,
      reason: req.body.reason || "",
      actorId: userId,
      actorName: req.user?.name || "User",
    });

    if (req.body.status === "BLOCKED" || req.body.status === "blocked") {
      await handleScrumMutation({
        projectId: access.project._id.toString(),
        teamId: access.team._id,
        actorId: userId,
        actorName: req.user?.name || "User",
        mutationType: "TASK_BLOCKED",
        entityId: task._id.toString(),
        payload: { taskId: task._id.toString(), reason: req.body.reason },
      });
    }

    res.json({ task: updated, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.put("/task/:taskId/status", handleUpdateTaskStatus);
router.put("/:projectId/tasks/:taskId/status", handleUpdateTaskStatus);

// ══════════════════════════════════════════════════════════════════════════════
// CAPACITY & TEAM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/capacity/:id or /api/scrum/:projectId/capacity
 */
const handleGetCapacity = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const activeSprint = await getActiveSprint(project._id.toString());
    const sprintTasks = activeSprint
      ? await Task.find({ sprintId: activeSprint._id }).lean()
      : [];
    const backlogTasks = await Task.find({
      ...getScrumTaskQuery(project._id, team._id),
      sprintId: null,
    }).lean();

    const members = team.members || [];
    const totalCapacityHours = members.reduce((s, m) => s + (m.capacity || 40), 0);
    const totalCommittedHours = activeSprint
      ? sprintTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0)
      : 0;
    const utilizationPct = totalCapacityHours > 0
      ? Math.round((totalCommittedHours / totalCapacityHours) * 100)
      : 0;

    const memberCards = members.map((m) => {
      const mId = (m.userId?._id || m.userId)?.toString();
      const mName = m.name || "";
      const memberSprintTasks = sprintTasks.filter(
        (t) => (t.assignedTo?._id || t.assignedTo)?.toString() === mId || (mName && t.assignedToName === mName)
      );
      const memberBacklogTasks = backlogTasks.filter(
        (t) => (t.assignedTo?._id || t.assignedTo)?.toString() === mId || (mName && t.assignedToName === mName)
      );
      const committedHours = memberSprintTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
      const memberCapacity = m.capacity || 40;
      const memberUtilPct = memberCapacity > 0 ? Math.round((committedHours / memberCapacity) * 100) : 0;
      const isOverloaded = committedHours > memberCapacity;

      return {
        id: mId,
        userId: mId,
        name: m.name || "Developer",
        role: m.role || "Developer",
        capacityHours: memberCapacity,
        committedHours,
        allocatedHours: committedHours,
        utilizationPct: memberUtilPct,
        assignedTasksCount: memberSprintTasks.length,
        backlogAssignedCount: memberBacklogTasks.length,
        backlogAssignedHours: memberBacklogTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
        overloaded: isOverloaded,
        skills: m.skills || {},
        verifiedSkills: Object.entries(m.skills || {})
          .filter(([, val]) => (val || 0) >= 5)
          .map(([k]) => k.toUpperCase()),
      };
    });

    // Authoritative skill gap detection: check real tasks against verified team skills
    const teamSkillSet = new Set();
    members.forEach((m) => {
      Object.entries(m.skills || {}).forEach(([k, v]) => {
        if ((v || 0) >= 5) teamSkillSet.add(k.toLowerCase());
      });
      if (Array.isArray(m.verifiedSkills)) {
        m.verifiedSkills.forEach((s) => teamSkillSet.add(String(s).toLowerCase()));
      }
    });

    const targetTasksForGaps = activeSprint && sprintTasks.length > 0 ? sprintTasks : backlogTasks;
    const skillGaps = [];
    const seenGaps = new Set();
    for (const t of targetTasksForGaps) {
      const reqSkills = Array.isArray(t.requiredSkills) ? [...t.requiredSkills] : [];
      if (reqSkills.length === 0 && t.skillWeights) {
        Object.entries(t.skillWeights).forEach(([sk, weight]) => {
          if ((weight || 0) >= 6) reqSkills.push(sk);
        });
      }
      for (const sk of reqSkills) {
        const normalized = sk.trim().toLowerCase();
        if (normalized && !teamSkillSet.has(normalized)) {
          const gapKey = `${normalized}:${t._id}`;
          if (!seenGaps.has(gapKey)) {
            seenGaps.add(gapKey);
            skillGaps.push({
              skill: sk.charAt(0).toUpperCase() + sk.slice(1),
              taskTitle: t.title || "Untitled Task",
              taskId: t._id,
              missingCapability: `No team member with verified ${sk} competency (level >= 5)`,
              basis: t.requiredSkills?.length ? "Explicit story requirement" : "Inferred skill demand",
              scope: activeSprint ? "Committed Sprint Work" : "Candidate Backlog Work",
              action: "Pair with experienced developer or update member skill profile",
            });
          }
        }
      }
    }

    // Branch & Bound balancing advisory
    const memberLoads = {};
    memberCards.forEach((m) => {
      memberLoads[m.userId] = m.committedHours;
    });

    const candidateTasks = activeSprint
      ? sprintTasks.filter((t) => !t.assignedTo)
      : backlogTasks.filter((t) => !t.assignedTo).slice(0, 15);

    const tasksToSolve = candidateTasks.length > 0
      ? candidateTasks
      : (activeSprint ? sprintTasks : backlogTasks).slice(0, 15);

    const rawSuggestions = suggestAllocation(tasksToSolve, members, { memberLoads });
    const balancingSuggestions = rawSuggestions.length > 0
      ? rawSuggestions.map((sug) => ({
          type: "ADVISORY",
          taskId: sug.taskId,
          taskTitle: sug.taskTitle,
          topCandidate: sug.topCandidate,
          message: sug.reason || `Suggest assigning "${sug.taskTitle}" (${sug.estimatedHours}h) to ${sug.topCandidate?.userName} (Score: ${sug.topCandidate?.totalScore}%)`,
        }))
      : [
          {
            type: "ADVISORY",
            message: activeSprint
              ? "All sprint tasks are assigned and within capacity."
              : "Team capacity is ready for sprint planning. Backlog items can be assigned upon sprint commitment.",
          },
        ];

    res.json({
      capacity: {
        totalCapacityHours,
        totalCommittedHours,
        utilizationPct,
        overloadCount: memberCards.filter((m) => m.overloaded).length,
        backlogHours: backlogTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0),
        backlogStoryCount: backlogTasks.length,
        backlogStoryPoints: backlogTasks.reduce((s, t) => s + (t.storyPoints || 1), 0),
        activeSprintId: activeSprint?._id || null,
        activeSprintName: activeSprint?.name || null,
      },
      members: memberCards,
      skillGaps,
      balancingSuggestions,
      assignments: rawSuggestions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/capacity/:id", handleGetCapacity);
router.get("/:projectId/capacity", handleGetCapacity);
router.get("/capability/:id", handleGetCapacity);
router.get("/:projectId/capability", handleGetCapacity);
router.get("/:projectId/sprints/:sprintId/capacity", handleGetCapacity);

/**
 * POST /api/scrum/capability/:id/assign or /api/scrum/:projectId/capability/assign
 * Working Accept Assign operation that persists assignment to MongoDB without altering sprint commitment
 */
const handleAcceptScrumAssignment = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const { taskId, memberId, newAssigneeId } = req.body;
    const targetMemberId = memberId || newAssigneeId;

    if (!taskId || !targetMemberId) {
      return res.status(400).json({ error: "taskId and memberId (or newAssigneeId) are required." });
    }

    const task = await Task.findOne({
      _id: taskId,
      $or: [{ projectId: project._id }, { teamId: team._id }],
    });
    if (!task) {
      return res.status(404).json({ error: "Task not found in this Scrum project." });
    }

    const members = team.members || [];
    const member = members.find(
      (m) => (m.userId?._id || m.userId)?.toString() === targetMemberId.toString()
    );
    if (!member) {
      return res.status(400).json({ error: "Proposed assignee is not a member of this team." });
    }

    const memberName = member.name || "Team Member";

    // Persist assignment without altering sprint commitment
    task.assignedTo = targetMemberId;
    task.assignedName = memberName;
    await task.save();

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    await recordProjectEvent({
      projectId: project._id,
      teamId: team._id,
      actorId: userId,
      actorName: req.user?.name || "User",
      eventType: "ASSIGNMENT_ACCEPTED",
      entityType: "task",
      entityId: task._id.toString(),
      title: `Assignment Accepted: ${task.title} → ${memberName}`,
      description: `Task "${task.title}" assigned to ${memberName} via Branch & Bound recommendation. Sprint commitment status preserved.`,
      source: "scrum_capability",
    });

    const io = req.app?.get("io");
    if (io) {
      io.to(`team:${team._id}`).emit("scrum:assignment_updated", {
        taskId: task._id.toString(),
        assignedTo: targetMemberId,
        assignedName: memberName,
        sprintId: task.sprintId,
      });
    }

    res.json({
      success: true,
      task,
      assignedTo: memberName,
      message: `Assignment successfully persisted for "${task.title}".`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/capability/:id/assign", handleAcceptScrumAssignment);
router.post("/:projectId/capability/assign", handleAcceptScrumAssignment);
router.post("/assignment/accept", handleAcceptScrumAssignment);
router.post("/:projectId/assignment/accept", handleAcceptScrumAssignment);

// ══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/dependencies/:id or /api/scrum/:projectId/dependencies
 */
const handleGetDependencies = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const allTasks = await Task.find(getScrumTaskQuery(project._id, team._id)).lean();
    const sprints = await Sprint.find({ projectId: project._id }).sort({ sprintNumber: 1 }).lean();
    const sprintMap = new Map(sprints.map((s) => [s._id.toString(), s]));
    const activeSprint = sprints.find((s) => s.status === "ACTIVE" || s.status === "REVIEW") || sprints[0];
    const analysis = analyzeScrumDependencies(allTasks, activeSprint?._id?.toString());

    // Resolve human-readable prerequisite titles and sprint metadata for each task
    const taskMap = new Map(allTasks.map((t) => [t._id.toString(), t]));
    const memberMap = new Map((team.members || []).map((m) => [String(m.userId?._id || m.userId), m.name]));

    const formattedTasks = allTasks.map((t) => {
      const assignedName = t.assignedTo ? (memberMap.get(t.assignedTo.toString()) || "Member") : "Unassigned";
      const sRef = t.sprintId ? sprintMap.get(t.sprintId.toString()) : null;
      return {
        _id: t._id,
        id: t._id,
        title: t.title,
        status: t.scrumStatus || t.status || "BACKLOG",
        scrumStatus: t.scrumStatus || (t.sprintId ? "TODO" : "BACKLOG"),
        sprintId: t.sprintId || null,
        sprintName: sRef ? sRef.name : "Product Backlog (Unassigned)",
        storyPoints: t.storyPoints || 0,
        estimatedHours: t.estimatedHours || 0,
        priority: t.priorityScore || 50,
        priorityLabel: t.priorityLabel || null,
        assignedTo: t.assignedTo || null,
        assignedName,
        prerequisites: (t.dependencies || []).map((depId) => {
          const depStr = depId?.toString();
          const prereq = taskMap.get(depStr);
          return {
            id: depStr,
            title: prereq ? prereq.title : `Prerequisite (${depStr.slice(-4)})`,
          };
        }),
      };
    });

    const edges = [];
    allTasks.forEach((t) => {
      const targetId = t._id.toString();
      (t.dependencies || []).forEach((depId) => {
        const fromStr = depId?.toString();
        if (taskMap.has(fromStr)) {
          edges.push({ from: fromStr, to: targetId });
        }
      });
    });

    res.json({
      dependencies: analysis,
      nodes: allTasks.map((t) => {
        const sRef = t.sprintId ? sprintMap.get(t.sprintId.toString()) : null;
        return {
          id: t._id.toString(),
          title: t.title,
          status: (t.scrumStatus || t.status || "todo").toLowerCase().includes("done")
            ? "done"
            : (t.scrumStatus || t.status || "").toLowerCase().includes("prog")
            ? "in_progress"
            : "todo",
          sprintId: t.sprintId,
          sprintName: sRef ? sRef.name : null,
          priority: t.priorityScore || 50,
          priorityLabel: t.priorityLabel || null,
          estimatedHours: t.estimatedHours || 0,
          storyPoints: t.storyPoints || 0,
          assignee: t.assignedTo ? (memberMap.get(t.assignedTo.toString()) || "Member") : null,
          dependencies: (t.dependencies || []).map((d) => d.toString()),
        };
      }),
      edges,
      depCount: edges.length,
      criticalPath: analysis.criticalPath || [],
      crossSprintDependencies: analysis.crossSprintDependencies || [],
      tasks: formattedTasks,
      topoResult: {
        order: analysis.topologicalOrder || [],
        hasCycle: analysis.hasCycle || false,
      },
      algorithm: "Kahn's BFS Topological Sort",
      complexity: { time: "O(V + E)", space: "O(V + E)" },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/dependencies/:id", handleGetDependencies);
router.get("/:projectId/dependencies", handleGetDependencies);

/**
 * POST /api/scrum/dependencies/:id or /api/scrum/:projectId/dependencies
 * Add a dependency edge between two Scrum stories/tasks.
 */
const handleAddDependency = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const fromId = req.body.fromId || req.body.dependsOn || req.body.prerequisiteId;
    const toId = req.body.toId || req.body.taskId || req.body.dependentId;
    const type = req.body.type || "blocks";
    const notes = req.body.notes || "";

    if (!fromId || !toId) {
      return res.status(400).json({
        error: "MISSING_TASK_IDS",
        message: "Both prerequisite (from) and dependent (to) items are required.",
      });
    }

    if (String(fromId) === String(toId)) {
      return res.status(400).json({
        error: "self_dependency_not_allowed",
        message: "A story or task cannot depend on itself.",
      });
    }

    // Verify both tasks belong to this authorized project/team
    const allScrumTasks = await Task.find(getScrumTaskQuery(project._id, team._id)).lean();
    const fromTask = allScrumTasks.find((t) => t._id.toString() === String(fromId));
    const toTask = allScrumTasks.find((t) => t._id.toString() === String(toId));

    if (!fromTask || !toTask) {
      return res.status(404).json({
        error: "TASK_NOT_FOUND",
        message: "One or both selected tasks do not exist in this Scrum project.",
      });
    }

    // Check duplicate edge: does toTask already list fromId as dependency?
    if ((toTask.dependencies || []).some((d) => d.toString() === String(fromId))) {
      return res.status(409).json({
        error: "dependency_already_exists",
        message: "This dependency relationship already exists in the graph.",
      });
    }

    // Cycle detection check: adding fromId as prerequisite to toTask
    // (meaning fromId must finish before toId)
    // If toTask is already an ancestor of fromTask, adding this edge creates a cycle
    const createsCycle = wouldCreateCycle(allScrumTasks, String(toId), String(fromId));
    if (createsCycle) {
      return res.status(422).json({
        error: "cycle_detected",
        message: `Cycle detected — adding dependency "${fromTask.title}" → "${toTask.title}" would introduce a circular chain.`,
      });
    }

    // Persist dependency
    await Task.updateOne(
      { _id: toTask._id },
      {
        $addToSet: { dependencies: fromTask._id },
        $inc: { dependencyCount: 1 },
      }
    );

    const userId = req.user?._id?.toString() || req.user?.id?.toString();
    await recordProjectEvent({
      projectId: project._id.toString(),
      teamId: team._id.toString(),
      actorId: userId,
      actorName: req.user?.name || "User",
      eventType: "DEPENDENCY_ADDED",
      entityType: "task",
      entityId: toTask._id.toString(),
      title: `Dependency added: "${fromTask.title}" → "${toTask.title}"`,
      newValue: { fromId: fromTask._id, toId: toTask._id, type, notes },
      source: "user",
    });

    const io = req.app?.get("io");
    if (io) {
      io.to(`team:${team._id}`).emit("scrum:dependency_updated", {
        teamId: team._id.toString(),
        projectId: project._id.toString(),
        fromId: fromTask._id.toString(),
        toId: toTask._id.toString(),
      });
    }

    res.json({
      success: true,
      message: `Dependency added successfully: "${fromTask.title}" is now a prerequisite for "${toTask.title}".`,
      fromId: fromTask._id,
      toId: toTask._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/dependencies/:id", handleAddDependency);
router.post("/:projectId/dependencies", handleAddDependency);

/**
 * DELETE /api/scrum/dependencies/:id or /api/scrum/:projectId/dependencies
 * Remove a dependency edge.
 */
const handleRemoveDependency = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const fromId = req.body.fromId || req.query.fromId || req.body.dependsOn;
    const toId = req.body.toId || req.query.toId || req.body.taskId;

    if (!fromId || !toId) {
      return res.status(400).json({ error: "MISSING_TASK_IDS", message: "Both fromId and toId are required." });
    }

    await Task.updateOne(
      { _id: toId, $or: [{ projectId: project._id }, { teamId: team._id }] },
      {
        $pull: { dependencies: fromId },
        $inc: { dependencyCount: -1 },
      }
    );

    res.json({
      success: true,
      message: "Dependency removed successfully.",
      fromId,
      toId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.delete("/dependencies/:id", handleRemoveDependency);
router.delete("/:projectId/dependencies", handleRemoveDependency);

/**
 * POST check cycle
 */
const handleCheckCycle = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const tasks = await Task.find({
      $or: [{ projectId: access.project._id }, { teamId: access.team._id }],
    }).lean();
    const wouldCycle = wouldCreateCycle(tasks, req.body.fromId, req.body.toId);
    res.json({ wouldCycle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/dependencies/check-cycle", handleCheckCycle);
router.post("/dependencies/check-cycle/:id", handleCheckCycle);
router.post("/:projectId/dependencies/check-cycle", handleCheckCycle);

// ══════════════════════════════════════════════════════════════════════════════
// INSIGHTS & HEALTH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/insights/:id or /api/scrum/:projectId/insights
 */
const handleGetInsights = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const allTasks = await Task.find(getScrumTaskQuery(project._id, team._id)).lean();
    const sprints = await Sprint.find({ projectId: project._id }).sort({ sprintNumber: 1 }).lean();
    const activeSprint = sprints.find((s) => s.status === "ACTIVE" || s.status === "REVIEW");
    const completedSprints = sprints.filter((s) => s.status === "COMPLETED");

    const sprintTasks = activeSprint
      ? allTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString())
      : [];
    const completed = sprintTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
    const inProgress = sprintTasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.scrumStatus === "IN_REVIEW");
    const blocked = sprintTasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
    const remaining = sprintTasks.filter((t) => t.scrumStatus === "TODO" || t.scrumStatus === "SELECTED_FOR_SPRINT");

    const trends = completedSprints.map((s) => ({
      sprintNumber: s.sprintNumber,
      name: s.name,
      planned: s.plannedTaskCount,
      completed: s.completedTaskCount,
      carryOver: s.carryOverItems?.length || 0,
      velocity: s.completedStoryPoints,
    }));

    const backlogItems = allTasks.filter((t) => (!t.sprintId || t.scrumStatus === "BACKLOG") && t.scrumStatus !== "CANCELLED");
    const highPriority = backlogItems.filter((t) => (t.urgency || 0) >= 4 || (t.businessValue || 0) >= 8);

    // Genuine cross-sprint dependencies based on active sprint tasks and prerequisites
    const taskMap = new Map(allTasks.map((t) => [t._id.toString(), t]));
    const crossSprintDependencies = [];
    if (activeSprint) {
      for (const t of sprintTasks) {
        for (const depId of (t.dependencies || [])) {
          const prereq = taskMap.get(depId?.toString());
          if (prereq && prereq.sprintId?.toString() !== activeSprint._id.toString()) {
            crossSprintDependencies.push({
              fromTask: prereq.title,
              toTask: t.title,
              risk: prereq.scrumStatus === "DONE" || prereq.status === "done" ? "Low" : "High",
            });
          }
        }
      }
    }

    // Genuine, evidence-based risks derived from actual tasks
    const risks = [];
    if (blocked.length > 0) {
      risks.push({
        id: "blocked-tasks",
        title: `${blocked.length} Active Sprint Task(s) Blocked`,
        severity: "high",
        probability: "high",
        impact: "Active impediment hindering sprint delivery",
        evidence: blocked.map((t) => t.title).join(", "),
      });
    }
    const unassignedInSprint = sprintTasks.filter((t) => !t.assignedTo && !t.assignedName);
    if (unassignedInSprint.length > 0) {
      risks.push({
        id: "unassigned-tasks",
        title: `${unassignedInSprint.length} Committed Sprint Task(s) Unassigned`,
        severity: "medium",
        probability: "medium",
        impact: "Work lacking an owner risks scope slippage",
        evidence: unassignedInSprint.map((t) => t.title).join(", "),
      });
    }

    res.json({
      currentSprint: activeSprint ? {
        id: activeSprint._id,
        name: activeSprint.name,
        goal: activeSprint.goal,
        progress: sprintTasks.length > 0 ? Math.round((completed.length / sprintTasks.length) * 100) : 0,
        completed: completed.length,
        inProgress: inProgress.length,
        blocked: blocked.length,
        remaining: remaining.length,
        total: sprintTasks.length,
        healthScore: activeSprint.healthScore || 85,
        riskLevel: activeSprint.riskLevel || "Low",
      } : null,
      trends,
      backlog: {
        total: backlogItems.length,
        highPriority: highPriority.length,
        stale: 0,
      },
      crossSprintDependencies,
      risks,
      velocity: completedSprints.map((s) => s.completedStoryPoints || 0),
      averageVelocity: completedSprints.length > 0
        ? Math.round(completedSprints.reduce((sum, s) => sum + (s.completedStoryPoints || 0), 0) / completedSprints.length)
        : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/insights/:id", handleGetInsights);
router.get("/:projectId/insights", handleGetInsights);

/**
 * GET /api/scrum/health/:id or /api/scrum/:projectId/health
 */
const handleGetHealth = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const health = await computeScrumHealth(project._id, req.app.get("io"), req.user?.id);

    res.json({
      health,
      healthScore: health.overallScore,
      overallScore: health.overallScore,
      grade: health.grade,
      status: health.status,
      summary: health.summary,
      assessmentScope: health.assessmentScope,
      backlogReadiness: health.backlogReadiness,
      sprintDelivery: health.sprintDelivery,
      indicators: health.indicators,
      warnings: health.warnings,
      criticalFactors: health.criticalFactors,
      riskSummary: health.riskSummary,
      workloadAndCapacity: health.workloadAndCapacity,
      hasSprintData: health.sprintDelivery?.hasActiveSprint || false,
      insufficientData: !health.sprintDelivery?.hasActiveSprint && health.assessmentScope !== "PROJECT_PLANNING",
      message: health.summary,
      factors: health.indicators || [],
      ...health,
    });
  } catch (err) {
    logger.error("[scrum.js] handleGetHealth error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
router.get("/health/:id", handleGetHealth);
router.get("/:projectId/health", handleGetHealth);

/**
 * POST /api/scrum/health/:id/refresh or /api/scrum/:projectId/health/refresh
 */
const handleRefreshHealth = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const health = await computeScrumHealth(project._id, req.app.get("io"), req.user?.id);

    res.json({
      health,
      healthScore: health.overallScore,
      overallScore: health.overallScore,
      grade: health.grade,
      status: health.status,
      summary: health.summary,
      assessmentScope: health.assessmentScope,
      backlogReadiness: health.backlogReadiness,
      sprintDelivery: health.sprintDelivery,
      indicators: health.indicators,
      warnings: health.warnings,
      criticalFactors: health.criticalFactors,
      riskSummary: health.riskSummary,
      workloadAndCapacity: health.workloadAndCapacity,
      hasSprintData: health.sprintDelivery?.hasActiveSprint || false,
      insufficientData: !health.sprintDelivery?.hasActiveSprint && health.assessmentScope !== "PROJECT_PLANNING",
      message: health.summary,
      factors: health.indicators || [],
      ...health,
    });
  } catch (err) {
    logger.error("[scrum.js] handleRefreshHealth error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
router.post("/health/:id/refresh", handleRefreshHealth);
router.post("/:projectId/health/refresh", handleRefreshHealth);

// ══════════════════════════════════════════════════════════════════════════════
// SCRUM RISK RADAR (WATERFALL-PARITY PERSISTENCE & ACTIONS)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/risks/:id or /api/scrum/:projectId/risks
 */
const handleGetRisks = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const { status = "open" } = req.query;

    const { risks, counts } = await scanScrumRisks(project._id, req.app.get("io"));
    const filteredRisks = status === "all" ? risks : risks.filter((r) => r.status === status);

    res.json({ risks: filteredRisks, counts });
  } catch (err) {
    logger.error("[scrum.js] handleGetRisks error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
router.get("/risks/:id", handleGetRisks);
router.get("/:projectId/risks", handleGetRisks);

/**
 * POST /api/scrum/risks/:id/scan or /api/scrum/:projectId/risks/scan
 */
const handleScanRisks = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const { risks, counts } = await scanScrumRisks(project._id, req.app.get("io"));

    res.json({ risks, counts, count: risks.length });
  } catch (err) {
    logger.error("[scrum.js] handleScanRisks error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
router.post("/risks/:id/scan", handleScanRisks);
router.post("/:projectId/risks/scan", handleScanRisks);

/**
 * PATCH /api/scrum/risks/:id/:riskId or /api/scrum/:projectId/risks/:riskId
 */
const handleUpdateRisk = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const { riskId } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(riskId)) {
      return res.status(400).json({ error: "invalid_risk_id" });
    }
    if (!["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "status must be acknowledged or resolved" });
    }

    const updates = { status };
    if (status === "acknowledged") {
      updates.acknowledgedBy = req.user?.id || req.user?._id;
      updates.acknowledgedAt = new Date();
    } else if (status === "resolved") {
      updates.resolvedBy = req.user?.id || req.user?._id;
      updates.resolvedAt = new Date();
      updates.resolutionReason = req.body.resolutionReason || "Manually resolved by authorized team member";
    }

    const risk = await Risk.findOneAndUpdate(
      { _id: riskId, projectId: project._id, methodology: "SCRUM" },
      { $set: updates },
      { new: true }
    );

    if (!risk) {
      return res.status(404).json({ error: "risk_not_found" });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${project._id}`).emit("project:risk:updated", { risk, action: "status_update" });
      if (team) {
        io.to(`team:${team._id}`).emit("project:risk:updated", { risk, action: "status_update" });
      }
    }

    res.json({ risk });
  } catch (err) {
    logger.error("[scrum.js] handleUpdateRisk error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
router.patch("/risks/:id/:riskId", handleUpdateRisk);
router.patch("/:projectId/risks/:riskId", handleUpdateRisk);

// ══════════════════════════════════════════════════════════════════════════════
// TIMELINE (BURNDOWN & VELOCITY)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/timeline/:id or /api/scrum/:projectId/timeline
 */
const handleGetTimeline = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const sprints = await Sprint.find({ projectId: project._id })
      .sort({ sprintNumber: 1 })
      .lean();

    const activeSprint = sprints.find((s) => s.status === "ACTIVE" || s.status === "PLANNING");
    const activeTasks = activeSprint
      ? await Task.find({ sprintId: activeSprint._id }).lean()
      : [];

    const totalPoints = activeTasks.reduce((sum, t) => sum + (t.storyPoints || 1), 0) || 40;
    const donePoints = activeTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done")
      .reduce((sum, t) => sum + (t.storyPoints || 1), 0);

    const burndown = {
      days: ["Day 1", "Day 3", "Day 5", "Day 7", "Day 10", "Day 14"],
      ideal: [totalPoints, Math.round(totalPoints * 0.8), Math.round(totalPoints * 0.6), Math.round(totalPoints * 0.4), Math.round(totalPoints * 0.2), 0],
      actual: [totalPoints, Math.round(totalPoints * 0.85), Math.round(totalPoints * 0.7), Math.max(0, totalPoints - donePoints)],
      currentDay: 7,
      totalDays: 14,
    };

    const velocityHistory = sprints.map((s) => ({
      sprintNumber: s.sprintNumber,
      name: s.name,
      planned: s.plannedStoryPoints || 30,
      completed: s.completedStoryPoints || 25,
    }));

    if (velocityHistory.length === 0) {
      velocityHistory.push(
        { sprintNumber: 1, name: "Sprint 01", planned: 25, completed: 22 },
        { sprintNumber: 2, name: "Sprint 02", planned: 30, completed: 28 }
      );
    }

    const averageVelocity = Math.round(
      velocityHistory.reduce((sum, v) => sum + v.completed, 0) / velocityHistory.length
    );

    const timeline = sprints.map((s) => ({
      id: s._id,
      sprintNumber: s.sprintNumber,
      name: s.name,
      goal: s.goal,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      durationDays: s.durationDays,
      plannedTaskCount: s.plannedTaskCount,
      completedTaskCount: s.completedTaskCount,
      completedStoryPoints: s.completedStoryPoints,
      healthScore: s.healthScore,
      riskLevel: s.riskLevel,
    }));

    res.json({
      burndown,
      velocity: {
        history: velocityHistory,
        averageVelocity,
      },
      sprintSchedule: timeline,
      timeline,
      milestones: (project.requirements || [])
        .filter((r) => r.priority === "critical" || r.mandatory)
        .map((r) => ({ title: r.title, priority: r.priority })),
      projectDeadline: project.context?.estimatedDurationDays,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/timeline/:id", handleGetTimeline);
router.get("/:projectId/timeline", handleGetTimeline);

// ══════════════════════════════════════════════════════════════════════════════
// RETROSPECTIVE (CURRENT SPRINT LIVE ANALYSIS)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/retrospective/:id or /api/scrum/:projectId/retrospective
 */
const handleGetRetrospective = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    let targetSprint = null;
    const reqSprintId = req.query.sprintId || req.params.sprintId;

    if (reqSprintId && mongoose.isValidObjectId(reqSprintId)) {
      targetSprint = await Sprint.findOne({ _id: reqSprintId, projectId: project._id });
    }
    if (!targetSprint) {
      targetSprint = await getActiveSprint(project._id.toString());
    }
    if (!targetSprint) {
      targetSprint = await Sprint.findOne({ projectId: project._id }).sort({ sprintNumber: -1 });
    }

    if (!targetSprint) {
      return res.json({
        retrospective: {
          sprintName: "No Sprints Available",
          analysis: {
            whatWentWell: [],
            whatNeedsAttention: [],
            rootCauses: [],
            recommendations: [],
          },
          actionItems: [],
        },
        sprint: null,
        metrics: { completionRate: 0, velocityPoints: 0, blockedTasksCount: 0, carryingOverCount: 0 },
        noActiveSprint: true,
      });
    }

    // Task query isolated strictly to selected sprint
    const tasks = await Task.find({ sprintId: targetSprint._id }).lean();
    const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
    const blocked = tasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
    const inProgress = tasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.status === "in_progress");
    const incomplete = tasks.filter((t) => t.scrumStatus !== "DONE" && t.status !== "done");

    const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedPoints = completed.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

    // Check if an authoritative persisted retrospective exists for this specific sprint
    let retro = await Retrospective.findOne({ projectId: project._id, sprintId: targetSprint._id }).lean();

    // If no retrospective saved yet, produce a faithful, lifecycle-aware interim/draft view WITHOUT persisting fake records
    if (!retro) {
      const liveAnalysis = buildDeterministicAnalysis({
        sprint: targetSprint,
        tasks,
        team,
      });

      retro = {
        _id: null,
        projectId: project._id,
        teamId: team._id,
        sprintId: targetSprint._id,
        sprintNumber: targetSprint.sprintNumber,
        sprintName: targetSprint.name,
        period: { start: targetSprint.startDate, end: targetSprint.endDate || new Date() },
        taskStats: {
          total: tasks.length,
          completed: completed.length,
          inProgress: inProgress.length,
          blocked: blocked.length,
          completionRate,
        },
        analysis: liveAnalysis,
        actionItems: [],
        generatedBy: "live_observation",
        isSaved: false,
      };
    }

    res.json({
      retrospective: retro,
      sprint: {
        _id: targetSprint._id,
        name: targetSprint.name,
        sprintNumber: targetSprint.sprintNumber,
        status: targetSprint.status,
        goal: targetSprint.goal,
        startDate: targetSprint.startDate,
        endDate: targetSprint.endDate,
      },
      metrics: {
        completionRate,
        velocityPoints: completedPoints,
        totalStoryPoints: totalPoints,
        completedStoryPoints: completedPoints,
        blockedTasksCount: blocked.length,
        carryingOverCount: incomplete.length,
        totalTasks: tasks.length,
        completedTasks: completed.length,
        inProgressTasks: inProgress.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/retrospective/:id", handleGetRetrospective);
router.get("/:projectId/retrospective", handleGetRetrospective);
router.get("/:projectId/sprints/:sprintId/retrospective", handleGetRetrospective);

/**
 * POST /api/scrum/retrospective/:id (GENERATE FRESH ANALYSIS VIA OMNIROUTE)
 */
const handlePostRetrospective = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    let targetSprint = null;
    const reqSprintId = req.body?.sprintId || req.query?.sprintId;

    if (reqSprintId && mongoose.isValidObjectId(reqSprintId)) {
      targetSprint = await Sprint.findOne({ _id: reqSprintId, projectId: project._id });
    }
    if (!targetSprint) {
      targetSprint = await getActiveSprint(project._id.toString());
    }
    if (!targetSprint) {
      targetSprint = await Sprint.findOne({ projectId: project._id }).sort({ sprintNumber: -1 });
    }

    if (!targetSprint) {
      return res.status(400).json({ error: "Cannot generate retrospective without an eligible sprint." });
    }

    const retro = await generateRetrospective({
      projectId: project._id.toString(),
      teamId: team._id,
      sprint: targetSprint,
      sprintName: targetSprint.name,
      sprintId: targetSprint._id,
      sprintNumber: targetSprint.sprintNumber,
      period: {
        start: targetSprint.startDate || new Date(Date.now() - 14 * 24 * 3600 * 1000),
        end: targetSprint.endDate || new Date(),
      },
    });

    const tasks = await Task.find({ sprintId: targetSprint._id }).lean();
    const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
    const blocked = tasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
    const inProgress = tasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.status === "in_progress");
    const incomplete = tasks.filter((t) => t.scrumStatus !== "DONE" && t.status !== "done");

    const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedPoints = completed.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    res.json({
      success: true,
      retrospective: retro,
      sprint: {
        _id: targetSprint._id,
        name: targetSprint.name,
        sprintNumber: targetSprint.sprintNumber,
        status: targetSprint.status,
        goal: targetSprint.goal,
      },
      metrics: {
        completionRate: tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0,
        velocityPoints: completedPoints,
        totalStoryPoints: totalPoints,
        completedStoryPoints: completedPoints,
        blockedTasksCount: blocked.length,
        carryingOverCount: incomplete.length,
        totalTasks: tasks.length,
        completedTasks: completed.length,
        inProgressTasks: inProgress.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/retrospective/:id", handlePostRetrospective);
router.post("/:projectId/retrospective", handlePostRetrospective);

// ══════════════════════════════════════════════════════════════════════════════
// COPILOT CONTEXT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/copilot/context/:id or /api/scrum/:projectId/copilot-context
 */
const handleGetCopilotContext = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const activeSprint = await getActiveSprint(project._id.toString());
    const allTasks = await Task.find({
      $or: [{ projectId: project._id }, { teamId: team._id }],
    }).lean();

    const sprintTasks = activeSprint
      ? allTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString())
      : [];
    const sprints = await Sprint.find({ projectId: project._id }).sort({ sprintNumber: -1 }).limit(5).lean();
    const memories = await ProjectMemory.find({ projectId: project._id, status: "active" })
      .sort({ createdAt: -1 }).limit(20).lean();

    const health = calculateScrumHealth(activeSprint, allTasks, team);
    const deps = analyzeScrumDependencies(allTasks, activeSprint?._id?.toString());

    res.json({
      context: {
        methodology: "SCRUM",
        project: {
          title: project.title,
          description: project.description,
          domain: project.domain,
          status: project.status,
        },
        currentSprint: activeSprint ? {
          name: activeSprint.name,
          goal: activeSprint.goal,
          status: activeSprint.status,
          progress: sprintTasks.length > 0
            ? Math.round((sprintTasks.filter((t) => t.scrumStatus === "DONE").length / sprintTasks.length) * 100)
            : 0,
          remainingDays: activeSprint.endDate
            ? Math.max(0, Math.ceil((new Date(activeSprint.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null,
          blockedTasksCount: sprintTasks.filter((t) => t.scrumStatus === "BLOCKED").length,
        } : null,
        backlog: {
          totalCount: allTasks.filter((t) => !t.sprintId).length,
          readyCount: allTasks.filter((t) => !t.sprintId && t.userStory).length,
        },
        health: {
          score: health.healthScore,
          grade: health.grade,
          risks: health.riskFactors,
        },
        dependencies: {
          cycleCount: deps.hasCycle ? 1 : 0,
          crossSprintCount: deps.crossSprintDependencies?.length || 0,
        },
        velocityHistory: sprints.map((s) => ({
          name: s.name,
          status: s.status,
          completionRate: s.plannedTaskCount > 0 ? Math.round((s.completedTaskCount / s.plannedTaskCount) * 100) : 0,
        })),
        projectMemory: memories.map((m) => ({ category: m.category, title: m.title, content: m.content })),
        requirements: (project.requirements || []).slice(0, 10).map((r) => ({
          title: r.title, priority: r.priority, status: r.status,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/copilot/context/:id", handleGetCopilotContext);
router.get("/:projectId/copilot-context", handleGetCopilotContext);

// ══════════════════════════════════════════════════════════════════════════════
// V4 SCRUM AI PLANNING, SUGGESTIONS & REVIEW ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/plan/:id or /api/scrum/:projectId/plan
 * Returns full planning workspace state: artifacts, AI analysis, suggestions, backlog, sprints
 */
const handleGetPlan = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const backlog = await Task.find({
      $or: [{ projectId: project._id }, { teamId: team._id }],
      scrumStatus: "BACKLOG",
    }).sort({ priorityScore: -1, createdAt: -1 }).lean();

    const sprints = await Sprint.find({
      $or: [{ projectId: project._id }, { teamId: team._id }],
    }).sort({ sprintNumber: -1 }).lean();

    const activeSprint = sprints.find((s) => s.status === "ACTIVE" || s.status === "PLANNING") || null;

    const readiness = calculateScrumPlanReadiness(project, backlog, req.user);
    const conflicts = project.scrumPlanLifecycle?.conflicts || [];

    res.json({
      project: {
        _id: project._id,
        title: project.title,
        description: project.description,
        methodology: project.methodology,
        scrumConfig: project.scrumConfig,
      },
      artifacts: project.artifacts || [],
      planLifecycle: project.scrumPlanLifecycle || {
        status: "SETUP_PENDING",
        analysisRevision: 0,
        suggestionsRevision: 0,
        analysis: {},
        suggestions: [],
        conflicts: [],
      },
      analysis: project.scrumPlanLifecycle?.analysis || null,
      suggestions: project.scrumPlanLifecycle?.suggestions || [],
      conflicts,
      readiness,
      backlog,
      sprints,
      activeSprint,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/plan/:id", handleGetPlan);
router.get("/:projectId/plan", handleGetPlan);

/**
 * GET /api/scrum/plan/readiness/:id or /api/scrum/:projectId/plan/readiness
 * Evaluates initial Scrum plan readiness gate against authoritative policy
 */
const handleGetPlanReadiness = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const backlog = await Task.find({
      $or: [{ projectId: project._id }, { teamId: team._id }],
      scrumStatus: "BACKLOG",
    }).sort({ priorityScore: -1, createdAt: -1 }).lean();

    const readiness = calculateScrumPlanReadiness(project, backlog, req.user);
    res.json({ success: true, readiness });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/plan/readiness/:id", handleGetPlanReadiness);
router.get("/:projectId/plan/readiness", handleGetPlanReadiness);

/**
 * POST /api/scrum/plan/finalize/:id or /api/scrum/:projectId/plan/finalize
 * Finalize Scrum Plan & Enable Workspace Operational Features (Fix 5 Gate)
 */
const handleFinalizePlan = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const io = req.app.get("io");

    const result = await finalizeScrumPlan({
      project,
      team,
      user: req.user,
      io,
    });

    res.json(result);
  } catch (err) {
    const statusCode = err.statusCode || (err.message?.includes("Cannot finalize") ? 400 : 500);
    res.status(statusCode).json({
      error: err.message,
      blockers: err.blockers || [err.message],
      readiness: err.readiness || null,
    });
  }
};
router.post("/plan/finalize/:id", handleFinalizePlan);
router.post("/:projectId/plan/finalize", handleFinalizePlan);

/**
 * PATCH /api/scrum/plan/conflicts/:id/:conflictId or /api/scrum/:projectId/plan/conflicts/:conflictId
 * Resolve material scope contradiction
 */
const handleResolveConflict = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const { conflictId } = req.params;
    const { resolution, note = "", resolutionType = "custom_rationale" } = req.body || {};

    const result = await resolveScrumConflict({
      project,
      conflictId,
      resolution,
      note,
      resolutionType,
      user: req.user,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.patch("/plan/conflicts/:id/:conflictId", handleResolveConflict);
router.patch("/:projectId/plan/conflicts/:conflictId", handleResolveConflict);

/**
 * POST /api/scrum/plan/analyze/:id or /api/scrum/:projectId/plan/analyze
 * Analyzes project artifacts and context using zero-cost OmniRoute AI
 */
const handleAnalyzePlan = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const analysis = await analyzeScrumProject(project, req.user);

    res.json({
      success: true,
      analysis,
      planLifecycle: project.scrumPlanLifecycle,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/plan/analyze/:id", handleAnalyzePlan);
router.post("/:projectId/plan/analyze", handleAnalyzePlan);

/**
 * POST /api/scrum/plan/generate/:id or /api/scrum/:projectId/plan/generate
 * Generates INVEST user story suggestions stored as separate draft records
 */
const handleGeneratePlan = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const result = await generateScrumStorySuggestions(project, req.user);

    const suggestionsList = Array.isArray(result) ? result : (result.suggestions || []);
    const count = result.newCount !== undefined ? result.newCount : (result.count !== undefined ? result.count : suggestionsList.length);
    const message = result.message || (count > 0 ? `Generated ${count} user story suggestions!` : "No additional unique stories were found. Your current backlog already covers the analyzed requirements.");

    res.json({
      success: true,
      suggestions: suggestionsList,
      count,
      newCount: count,
      message,
      planLifecycle: project.scrumPlanLifecycle,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/plan/generate/:id", handleGeneratePlan);
router.post("/:projectId/plan/generate", handleGeneratePlan);

/**
 * POST /api/scrum/plan/suggestions/:id/approve or /api/scrum/:projectId/plan/suggestions/:suggestionId/approve
 * Server-side validated human approval creating official Product Backlog item idempotently
 */
const handleApproveSuggestion = async (req, res) => {
  try {
    const id = req.params.id || req.params.projectId;
    const suggestionId = req.params.suggestionId || req.body.suggestionId;

    const access = await verifyProjectAccess(req, res, id);
    if (!access) return;

    const { project, team } = access;

    const result = await approveScrumSuggestion({
      projectId: project._id,
      teamId: team._id,
      suggestionId,
      user: req.user,
      editedPayload: req.body.editedStory || req.body,
    });

    res.status(result.idempotent ? 200 : 201).json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to approve story suggestion" });
  }
};
router.post("/plan/suggestions/:id/approve", handleApproveSuggestion);
router.post("/:projectId/plan/suggestions/:suggestionId/approve", handleApproveSuggestion);

/**
 * POST /api/scrum/plan/suggestions/:id/bulk-approve or /api/scrum/:projectId/plan/suggestions/bulk-approve
 * Bulk approval of eligible story suggestions with transactional safety and duplicate prevention
 */
const handleBulkApproveSuggestions = async (req, res) => {
  try {
    const id = req.params.id || req.params.projectId;
    const access = await verifyProjectAccess(req, res, id);
    if (!access) return;

    const { project, team } = access;
    const result = await bulkApproveScrumSuggestions({
      projectId: project._id,
      teamId: team._id,
      suggestionIds: req.body.suggestionIds || null,
      user: req.user,
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to bulk approve suggestions" });
  }
};
router.post("/plan/suggestions/:id/bulk-approve", handleBulkApproveSuggestions);
router.post("/:projectId/plan/suggestions/bulk-approve", handleBulkApproveSuggestions);

/**
 * POST /api/scrum/plan/suggestions/:id/reject or /api/scrum/:projectId/plan/suggestions/:suggestionId/reject
 */
const handleRejectSuggestion = async (req, res) => {
  try {
    const id = req.params.id || req.params.projectId;
    const suggestionId = req.params.suggestionId || req.body.suggestionId;

    const access = await verifyProjectAccess(req, res, id);
    if (!access) return;

    const { project } = access;
    const result = await rejectScrumSuggestion({
      projectId: project._id,
      suggestionId,
      user: req.user,
      reason: req.body.reason,
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to reject suggestion" });
  }
};
router.post("/plan/suggestions/:id/reject", handleRejectSuggestion);
router.post("/:projectId/plan/suggestions/:suggestionId/reject", handleRejectSuggestion);

/**
 * PUT /api/scrum/plan/suggestions/:id or /api/scrum/:projectId/plan/suggestions/:suggestionId
 * Update draft suggestion without altering official stories
 */
const handleUpdateDraft = async (req, res) => {
  try {
    const id = req.params.id || req.params.projectId;
    const suggestionId = req.params.suggestionId || req.body.suggestionId;

    const access = await verifyProjectAccess(req, res, id);
    if (!access) return;

    const { project } = access;
    const result = await updateDraftSuggestion({
      projectId: project._id,
      suggestionId,
      user: req.user,
      updates: req.body,
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to update draft suggestion" });
  }
};
router.put("/plan/suggestions/:id", handleUpdateDraft);
router.put("/:projectId/plan/suggestions/:suggestionId", handleUpdateDraft);

// ══════════════════════════════════════════════════════════════════════════════
// DAILY SCRUM / STANDUP
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/scrum/sprints/:sprintId/standup
 */
const handleGetStandup = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    res.json({
      sprintId: sprint._id,
      sprintName: sprint.name,
      checkins: sprint.dailyScrumCheckins || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/sprints/:sprintId/standup", handleGetStandup);
router.get("/:projectId/sprints/:sprintId/standup", handleGetStandup);

/**
 * POST /api/scrum/sprints/:sprintId/standup
 */
const handlePostStandup = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const access = await verifyProjectAccess(req, res, sprint.projectId.toString());
    if (!access) return;

    const userId = req.user?._id || req.user?.id;
    const userName = req.user?.name || "Team Member";

    const checkin = {
      date: new Date(),
      userId,
      userName,
      goalProgress: req.body.goalProgress || "",
      yesterdayWork: req.body.yesterdayWork || "",
      todayPlan: req.body.todayPlan || "",
      blockers: req.body.blockers || "",
      timestamp: new Date(),
    };

    sprint.dailyScrumCheckins = sprint.dailyScrumCheckins || [];
    sprint.dailyScrumCheckins.unshift(checkin);
    await sprint.save();

    res.status(201).json({ success: true, checkin, sprintId: sprint._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/sprints/:sprintId/standup", handlePostStandup);
router.post("/:projectId/sprints/:sprintId/standup", handlePostStandup);

// ══════════════════════════════════════════════════════════════════════════════
// RETROSPECTIVE IMPROVEMENT ACTIONS & LEARNING LOOP
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/scrum/retrospective/:id/actions
 * Add improvement action item to specific sprint retrospective
 */
const handleAddRetroAction = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project, team } = access;
    const { action, owner = "", ownerId = null, dueDate = null } = req.body;

    if (!action || !action.trim()) {
      return res.status(400).json({ error: "Action description is required" });
    }

    const reqSprintId = req.body?.sprintId || req.query?.sprintId;
    let targetSprint = null;

    if (reqSprintId && mongoose.isValidObjectId(reqSprintId)) {
      targetSprint = await Sprint.findOne({ _id: reqSprintId, projectId: project._id });
    }
    if (!targetSprint && req.body.retrospectiveId && mongoose.isValidObjectId(req.body.retrospectiveId)) {
      const existingRetro = await Retrospective.findById(req.body.retrospectiveId);
      if (existingRetro?.sprintId) {
        targetSprint = await Sprint.findOne({ _id: existingRetro.sprintId, projectId: project._id });
      }
    }
    if (!targetSprint) {
      targetSprint = await getActiveSprint(project._id.toString());
    }
    if (!targetSprint) {
      targetSprint = await Sprint.findOne({ projectId: project._id }).sort({ sprintNumber: -1 });
    }

    let retro = null;
    if (targetSprint) {
      retro = await Retrospective.findOne({ projectId: project._id, sprintId: targetSprint._id });
      if (!retro) {
        retro = await Retrospective.create({
          projectId: project._id,
          teamId: team._id,
          sprintId: targetSprint._id,
          sprintNumber: targetSprint.sprintNumber,
          sprintName: targetSprint.name,
          period: {
            start: targetSprint.startDate || new Date(),
            end: targetSprint.endDate || new Date(),
          },
          taskStats: { total: 0, completed: 0, inProgress: 0, blocked: 0, completionRate: 0 },
          analysis: { whatWentWell: [], whatNeedsAttention: [], rootCauses: [], recommendations: [] },
          actionItems: [],
          generatedBy: "deterministic",
        });
      }
    } else {
      retro = await Retrospective.findOne({ projectId: project._id }).sort({ createdAt: -1 });
      if (!retro) {
        retro = await Retrospective.create({
          projectId: project._id,
          teamId: team._id,
          sprintName: "General Retrospective",
          taskStats: { total: 0, completed: 0, inProgress: 0, blocked: 0, completionRate: 0 },
          analysis: { whatWentWell: [], whatNeedsAttention: [], rootCauses: [], recommendations: [] },
          actionItems: [],
          generatedBy: "deterministic",
        });
      }
    }

    const userId = req.user?._id || req.user?.id;
    const newAction = {
      action: action.trim(),
      description: (req.body.description || "").trim(),
      owner: owner.trim(),
      ownerId: ownerId && mongoose.isValidObjectId(ownerId) ? ownerId : (userId ? new mongoose.Types.ObjectId(userId) : null),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: req.body.status || "OPEN",
      priority: req.body.priority || "MEDIUM",
      relatedFinding: (req.body.relatedFinding || "").trim(),
      sourceRationale: (req.body.sourceRationale || "").trim(),
      createdBy: userId ? new mongoose.Types.ObjectId(userId) : null,
      createdByName: req.user?.name || "Team Member",
      evidence: (req.body.evidence || "").trim(),
      verificationNote: (req.body.verificationNote || "").trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    retro.actionItems = retro.actionItems || [];
    retro.actionItems.push(newAction);
    await retro.save();

    res.status(201).json({
      success: true,
      action: retro.actionItems[retro.actionItems.length - 1],
      retrospective: retro,
      actionItems: retro.actionItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/retrospective/:id/actions", handleAddRetroAction);
router.post("/:projectId/retrospective/actions", handleAddRetroAction);

/**
 * PUT /api/scrum/retrospective/:id/actions/:actionId
 * Update action status or evidence
 */
const handleUpdateRetroAction = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const actionId = req.params.actionId;

    const retro = await Retrospective.findOne({
      projectId: project._id,
      "actionItems._id": actionId,
    });

    if (!retro) {
      return res.status(404).json({ error: "Retrospective or action item not found" });
    }

    const item = retro.actionItems.id(actionId);
    if (!item) return res.status(404).json({ error: "Action item not found" });

    if (req.body.status !== undefined) item.status = req.body.status;
    if (req.body.evidence !== undefined) item.evidence = req.body.evidence;
    if (req.body.owner !== undefined) item.owner = req.body.owner;
    if (req.body.dueDate !== undefined) item.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body.priority !== undefined) item.priority = req.body.priority;
    if (req.body.verificationNote !== undefined) item.verificationNote = req.body.verificationNote;
    item.updatedAt = new Date();

    await retro.save();
    res.json({
      success: true,
      action: item,
      retrospective: retro,
      actionItems: retro.actionItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.put("/retrospective/:id/actions/:actionId", handleUpdateRetroAction);
router.put("/:projectId/retrospective/actions/:actionId", handleUpdateRetroAction);

/**
 * GET /api/scrum/insights/:id/learning-loop
 * Aggregates retrospective summaries, repeat themes, and action items across all sprints
 */
const handleGetLearningLoop = async (req, res) => {
  try {
    const access = await verifyProjectAccess(req, res, req.params.id || req.params.projectId);
    if (!access) return;

    const { project } = access;
    const retros = await Retrospective.find({ projectId: project._id }).sort({ createdAt: -1 }).lean();

    const allActions = [];
    const themes = {
      wentWell: [],
      wentPoorly: [],
      recommendations: [],
    };

    for (const r of retros) {
      if (Array.isArray(r.actionItems)) {
        r.actionItems.forEach((a) => {
          allActions.push({
            ...a,
            sprintName: r.sprintName,
            retrospectiveId: r._id,
          });
        });
      }
      const ana = r.analysis || {};
      (ana.wentWell || []).forEach((w) => themes.wentWell.push(w));
      (ana.wentPoorly || []).forEach((p) => themes.wentPoorly.push(p));
      (ana.recommendations || []).forEach((rc) => themes.recommendations.push(rc));
    }

    const completedActions = allActions.filter((a) => a.status === "completed").length;
    const openActions = allActions.filter((a) => a.status === "open" || a.status === "in_progress").length;

    res.json({
      retrospectives: retros.map((r) => ({
        _id: r._id,
        sprintName: r.sprintName,
        sprintNumber: r.sprintNumber,
        period: r.period,
        taskStats: r.taskStats,
        actionItemsCount: r.actionItems?.length || 0,
        createdAt: r.createdAt,
      })),
      actionItems: allActions,
      actionStats: {
        total: allActions.length,
        completed: completedActions,
        open: openActions,
        resolutionRate: allActions.length > 0 ? Math.round((completedActions / allActions.length) * 100) : 0,
      },
      recurringThemes: {
        strengths: [...new Set(themes.wentWell)].slice(0, 5),
        impediments: [...new Set(themes.wentPoorly)].slice(0, 5),
        improvements: [...new Set(themes.recommendations)].slice(0, 5),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.get("/insights/:id/learning-loop", handleGetLearningLoop);
router.get("/:projectId/insights/learning-loop", handleGetLearningLoop);

/**
 * POST /api/scrum/backlog/task/:taskId/decompose
 * Decompose an approved user story into subtasks
 */
const handleDecomposeStory = async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const parentStory = await Task.findById(taskId);
    if (!parentStory) return res.status(404).json({ error: "Story not found" });

    const access = await verifyProjectAccess(req, res, (parentStory.projectId || parentStory.teamId).toString());
    if (!access) return;

    const subtasks = req.body.subtasks || [
      { title: `Design & Schema: ${parentStory.title}`, estimatedHours: 4 },
      { title: `Implement Logic: ${parentStory.title}`, estimatedHours: 6 },
      { title: `Unit & Integration Tests: ${parentStory.title}`, estimatedHours: 4 },
    ];

    const createdTasks = [];
    for (const st of subtasks) {
      const subtask = await Task.create({
        teamId: access.team._id,
        projectId: parentStory.projectId,
        title: st.title || `Subtask of ${parentStory.title}`,
        description: `Subtask created from parent story: ${parentStory.title}`,
        parentStoryId: parentStory._id,
        sprintId: parentStory.sprintId,
        estimatedHours: Number(st.estimatedHours) || 4,
        storyPoints: 1,
        scrumStatus: parentStory.sprintId ? "TODO" : "BACKLOG",
        status: "todo",
        source: "manual",
        category: parentStory.category || "General",
        createdBy: req.user?._id || req.user?.id,
      });
      createdTasks.push(subtask);
    }

    res.status(201).json({ success: true, parentStoryId: parentStory._id, subtasks: createdTasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post("/backlog/task/:taskId/decompose", handleDecomposeStory);
router.post("/:projectId/backlog/:taskId/decompose", handleDecomposeStory);

export default router;
