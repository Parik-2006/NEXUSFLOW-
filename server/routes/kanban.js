/**
 * server/routes/kanban.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN API ROUTES (DUAL ROUTING & HYDRATION ENGINE)
 *
 * All Kanban continuous-flow endpoints. Protected by requireAuth middleware.
 * Supports BOTH route conventions:
 *   - Client-style: /api/kanban/overview/:id, /api/kanban/board/:id, etc.
 *   - Spec-style:   /api/kanban/:projectId/overview, etc.
 *
 * Automatically resolves target ID as either Project ID or Team ID.
 * ============================================================================
 */

import express from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import ProjectEvent from "../models/ProjectEvent.js";
import {
  ensureKanbanConfig,
  getKanbanBoard,
  pullWorkItem,
  moveWorkItem,
  getKanbanOverview,
} from "../services/kanbanEngine.js";
import { getDefaultKanbanConfig, validateKanbanWorkflow } from "../services/kanbanMethodologyService.js";
import { calculateColumnWip, calculatePersonalWip } from "../services/kanbanWipService.js";
import { calculateKanbanPriority, rankBacklogCandidates } from "../services/kanbanPriorityEngine.js";
import { calculateFlowMetrics } from "../services/kanbanFlowMetricsService.js";
import { calculateFlowForecast } from "../services/kanbanForecastService.js";
import { detectBottlenecks } from "../services/kanbanBottleneckService.js";
import { addBlockerToTask, updateTaskBlocker, aggregateProjectBlockers } from "../services/kanbanBlockerService.js";
import { calculateKanbanHealth } from "../services/kanbanHealthService.js";
import { evaluateReplenishmentCandidates } from "../services/kanbanReplenishmentService.js";
import { assessKanbanChangeImpact } from "../services/kanbanChangeImpactService.js";
import { analyzeKanbanDependencies } from "../services/kanbanDependencyEngine.js";
import { handleKanbanMutation } from "../services/kanbanReactiveEngine.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * Helper: verify project / team access (Accepts Project ID OR Team ID)
 */
async function verifyProjectAccess(req, res, targetId) {
  const id =
    targetId ||
    req.params.id ||
    req.params.projectId ||
    req.params.teamId ||
    req.body?.projectId ||
    req.body?.teamId;

  if (!id) {
    res.status(400).json({ error: "Target ID (Project or Team) is required" });
    return null;
  }

  let project = null;
  let team = null;

  if (mongoose.isValidObjectId(id)) {
    project = await Project.findById(id);
    if (project) {
      team = await Team.findById(project.teamId);
    } else {
      team = await Team.findById(id);
      if (team) {
        if (team.activeProjectId) {
          project = await Project.findById(team.activeProjectId);
        }
        if (!project) {
          project = await Project.findOne({ teamId: team._id }).sort({ updatedAt: -1 });
        }
        if (!project) {
          // Initialize a default Kanban project if none exists for this workspace
          project = await Project.create({
            teamId: team._id,
            title: team.projectTitle || team.name,
            description: team.projectDescription || "",
            methodology: "KANBAN",
            kanbanConfig: getDefaultKanbanConfig(),
          });
          team.activeProjectId = project._id;
          team.methodology = "KANBAN";
          await team.save();
        }
      }
    }
  }

  if (!team || !project) {
    res.status(404).json({ error: "Project or Workspace not found" });
    return null;
  }

  // Verify user authorization: must be a member or owner of the team
  const userId = req.user?.id || req.user?._id;
  const userEmail = (req.user?.email || "").toLowerCase().trim();

  const isOwner = team.ownerId && team.ownerId.toString() === userId?.toString();
  const isMember = (team.members || []).some((m) => {
    const mId = (m.userId?._id || m.userId)?.toString();
    const mEmail = (m.email || "").toLowerCase().trim();
    return (mId && userId && mId === userId.toString()) || (mEmail && userEmail && mEmail === userEmail);
  });

  if (!isOwner && !isMember) {
    res.status(403).json({ error: "Access denied: you are not a member of this workspace" });
    return null;
  }

  // Ensure Kanban methodology config is hydrated
  if (!project.kanbanConfig || !project.kanbanConfig.workflowColumns) {
    await ensureKanbanConfig(project);
  }

  return { project, team, isOwner };
}

// ── 1. OVERVIEW ENDPOINTS ───────────────────────────────────────────────────
async function handleOverview(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;
    const overview = await getKanbanOverview(auth.project._id);
    res.json({ success: true, overview });
  } catch (err) {
    logger.error(`[Kanban Overview Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/overview/:id", handleOverview);
router.get("/:projectId/overview", handleOverview);

// ── 2. BOARD ENDPOINTS ──────────────────────────────────────────────────────
async function handleBoard(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;
    const board = await getKanbanBoard(auth.project._id);
    res.json({ success: true, board });
  } catch (err) {
    logger.error(`[Kanban Board Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/board/:id", handleBoard);
router.get("/:projectId/board", handleBoard);

// ── 3. PULL / MOVE ENDPOINTS ────────────────────────────────────────────────
async function handlePull(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const { taskId, toColumn, hasOverride, overrideReason } = req.body;
    if (!taskId || !toColumn) {
      return res.status(400).json({ error: "taskId and toColumn are required." });
    }

    const io = req.app.get("io");
    const result = await pullWorkItem(auth.project._id, taskId, toColumn, req.user, {
      hasOverride,
      overrideReason,
      io,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    logger.error(`[Kanban Pull Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.post("/pull", handlePull);
router.post("/:projectId/pull", handlePull);
router.post("/move", handlePull);
router.post("/:projectId/move", handlePull);

// ── 4. BACKLOG & REPLENISHMENT ENDPOINTS ────────────────────────────────────
async function handleBacklog(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({
      $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }],
      $or: [
        { kanbanStatus: "BACKLOG" },
        { workflowColumn: "backlog" },
        { kanbanStatus: null, status: "todo", workflowColumn: null },
      ],
    }).populate("assignedTo", "name email avatar");

    const ranked = rankBacklogCandidates(tasks);
    const readyCol = (auth.project.kanbanConfig.workflowColumns || []).find((c) => c.id === "ready");
    const activeReadyTasks = await Task.countDocuments({
      $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }],
      $or: [{ kanbanStatus: "READY" }, { workflowColumn: "ready" }],
    });
    const readyLimit = readyCol?.wipLimit || 5;
    const availableReadySlots = Math.max(0, readyLimit - activeReadyTasks);

    const replenishment = evaluateReplenishmentCandidates(tasks, availableReadySlots, {
      definitionOfReady: auth.project.kanbanConfig.definitionOfReady,
    });

    res.json({
      success: true,
      backlogCount: tasks.length,
      availableReadySlots,
      rankedBacklog: ranked,
      replenishment,
    });
  } catch (err) {
    logger.error(`[Kanban Backlog Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/backlog/:id", handleBacklog);
router.get("/:projectId/backlog", handleBacklog);

// Batch pull items into Ready (Replenishment action)
async function handleBatchReplenish(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const { taskIds = [] } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: "taskIds array is required for replenishment." });
    }

    const io = req.app.get("io");
    const results = [];

    for (const tid of taskIds) {
      const pullRes = await pullWorkItem(auth.project._id, tid, "ready", req.user, { io });
      results.push({ taskId: tid, ...pullRes });
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error(`[Kanban Replenish Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.post("/backlog/replenish", handleBatchReplenish);
router.post("/:projectId/backlog/replenish", handleBatchReplenish);

// ── 5. WORK ITEM MANAGEMENT (CRUD) ──────────────────────────────────────────
async function handleCreateTask(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const {
      title,
      description = "",
      userStory = "",
      acceptanceCriteria = [],
      classOfService = "standard",
      workflowColumn = "backlog",
      estimatedHours = null,
      storyPoints = 1,
      assignedTo = null,
      dependencies = [],
      priorityLabel = null,
      dueDate = null,
      teacherImportance = null,
      technicalUncertainty = null,
      requiredSkills = [],
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Title is required for work items." });
    }

    const now = new Date();
    const newTask = new Task({
      teamId: auth.team._id,
      projectId: auth.project._id,
      title: String(title).trim(),
      description,
      userStory,
      acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
      classOfService,
      workflowColumn,
      kanbanStatus: workflowColumn.toUpperCase(),
      estimatedHours: estimatedHours ? Number(estimatedHours) : null,
      storyPoints: storyPoints ? Number(storyPoints) : 1,
      assignedTo: assignedTo && mongoose.isValidObjectId(assignedTo) ? assignedTo : null,
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      priorityLabel,
      dueDate: dueDate ? new Date(dueDate) : null,
      teacherImportance: teacherImportance ? Number(teacherImportance) : null,
      technicalUncertainty: technicalUncertainty ? Number(technicalUncertainty) : null,
      requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
      createdBy: req.user?.id || req.user?._id,
      readyAt: workflowColumn === "ready" ? now : null,
      activeStartedAt: workflowColumn === "in_progress" ? now : null,
    });

    await newTask.save();

    // Increment team taskCount
    await Team.findByIdAndUpdate(auth.team._id, { $inc: { taskCount: 1 } });

    const io = req.app.get("io");
    await handleKanbanMutation({
      eventType: "ITEM_CREATED",
      projectId: auth.project._id,
      teamId: auth.team._id,
      actor: req.user,
      taskId: newTask._id,
      taskTitle: newTask.title,
      fromState: "NONE",
      toState: workflowColumn,
      io,
    });

    res.status(201).json({ success: true, task: newTask });
  } catch (err) {
    logger.error(`[Kanban Create Task Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.post("/tasks", handleCreateTask);
router.post("/:projectId/tasks", handleCreateTask);

async function handleUpdateTask(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const taskId = req.params.taskId || req.body?.taskId;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found." });

    const allowed = [
      "title",
      "description",
      "userStory",
      "acceptanceCriteria",
      "classOfService",
      "estimatedHours",
      "storyPoints",
      "assignedTo",
      "dependencies",
      "priorityLabel",
      "dueDate",
      "teacherImportance",
      "technicalUncertainty",
      "requiredSkills",
      "deliveryEvidence",
      "teacherFeedback",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        task[key] = req.body[key];
      }
    }

    await task.save();

    const io = req.app.get("io");
    await handleKanbanMutation({
      eventType: "ITEM_UPDATED",
      projectId: auth.project._id,
      teamId: auth.team._id,
      actor: req.user,
      taskId: task._id,
      taskTitle: task.title,
      fromState: task.workflowColumn,
      toState: task.workflowColumn,
      io,
    });

    res.json({ success: true, task });
  } catch (err) {
    logger.error(`[Kanban Update Task Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.patch("/tasks/:taskId", handleUpdateTask);
router.patch("/:projectId/tasks/:taskId", handleUpdateTask);

// ── 6. FLOW METRICS & FORECASTING ENDPOINTS ─────────────────────────────────
async function handleFlow(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const config = auth.project.kanbanConfig;
    const flowMetrics = calculateFlowMetrics(tasks, {
      sleTargetDays: config.serviceLevelExpectation?.targetDays || 4,
      agingWarningDays: config.agingThresholds?.warningDays || 3,
      agingCriticalDays: config.agingThresholds?.criticalDays || 6,
    });
    const forecast = calculateFlowForecast(tasks, {
      sleTargetDays: config.serviceLevelExpectation?.targetDays || 4,
    });

    res.json({ success: true, flowMetrics, forecast });
  } catch (err) {
    logger.error(`[Kanban Flow Metrics Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/flow-metrics/:id", handleFlow);
router.get("/:projectId/flow-metrics", handleFlow);
router.get("/flow/:id", handleFlow);
router.get("/:projectId/flow", handleFlow);

// ── 7. BLOCKER ENDPOINTS ────────────────────────────────────────────────────
async function handleGetBlockers(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const blockers = aggregateProjectBlockers(tasks);
    res.json({ success: true, ...blockers });
  } catch (err) {
    logger.error(`[Kanban Get Blockers Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/blockers/:id", handleGetBlockers);
router.get("/:projectId/blockers", handleGetBlockers);

async function handleCreateBlocker(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const { taskId, title, description, category, severity } = req.body;
    if (!taskId || !title) {
      return res.status(400).json({ error: "taskId and title are required to report a blocker." });
    }

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found." });

    const newBlocker = addBlockerToTask(task, { title, description, category, severity }, req.user);
    await task.save();

    const io = req.app.get("io");
    await handleKanbanMutation({
      eventType: "ITEM_BLOCKED",
      projectId: auth.project._id,
      teamId: auth.team._id,
      actor: req.user,
      taskId: task._id,
      taskTitle: task.title,
      fromState: task.workflowColumn,
      toState: "BLOCKED",
      metadata: { blocker: newBlocker },
      io,
    });

    res.status(201).json({ success: true, blocker: newBlocker, task });
  } catch (err) {
    logger.error(`[Kanban Create Blocker Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.post("/blockers", handleCreateBlocker);
router.post("/:projectId/blockers", handleCreateBlocker);

async function handleUpdateBlocker(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const blockerId = req.params.blockerId;
    const { taskId, status, resolutionNotes, severity, category } = req.body;

    // Find task containing this blocker
    let task = null;
    if (taskId) {
      task = await Task.findById(taskId);
    } else {
      task = await Task.findOne({ "blockers.blockerId": blockerId });
    }

    if (!task) return res.status(404).json({ error: "Task with specified blocker not found." });

    const updated = updateTaskBlocker(task, blockerId, { status, resolutionNotes, severity, category }, req.user);
    await task.save();

    const io = req.app.get("io");
    if (status === "RESOLVED") {
      await handleKanbanMutation({
        eventType: "ITEM_UNBLOCKED",
        projectId: auth.project._id,
        teamId: auth.team._id,
        actor: req.user,
        taskId: task._id,
        taskTitle: task.title,
        fromState: "BLOCKED",
        toState: task.workflowColumn,
        metadata: { blockerId, resolutionNotes },
        io,
      });
    }

    res.json({ success: true, blocker: updated, task });
  } catch (err) {
    logger.error(`[Kanban Update Blocker Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.patch("/blockers/:blockerId", handleUpdateBlocker);
router.patch("/:projectId/blockers/:blockerId", handleUpdateBlocker);

// ── 8. TEAM INTELLIGENCE & PERSONAL WIP ─────────────────────────────────────
async function handleTeam(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const members = auth.team.members || [];
    const personalWip = calculatePersonalWip(tasks, members, auth.project.kanbanConfig.wipPolicy?.defaultPersonalWip || 3);

    res.json({
      success: true,
      teamMembersCount: members.length,
      personalWipEnabled: auth.project.kanbanConfig.wipPolicy?.personalWipEnabled || false,
      personalWip,
    });
  } catch (err) {
    logger.error(`[Kanban Team Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/team/:id", handleTeam);
router.get("/:projectId/team", handleTeam);

// ── 9. POLICIES ENDPOINTS ───────────────────────────────────────────────────
async function handleGetPolicies(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    res.json({
      success: true,
      methodology: "KANBAN",
      policies: auth.project.kanbanConfig,
    });
  } catch (err) {
    logger.error(`[Kanban Get Policies Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/policies/:id", handleGetPolicies);
router.get("/:projectId/policies", handleGetPolicies);

async function handleUpdatePolicies(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    // Leader permission check
    const isLeader = auth.isOwner || (auth.team.members || []).some(
      (m) => (m.userId?._id || m.userId)?.toString() === req.user?.id?.toString() && m.role === "leader"
    );

    if (!isLeader) {
      return res.status(403).json({ error: "Only team leaders or workspace owners can modify Kanban policies." });
    }

    const {
      workflowColumns,
      wipPolicy,
      pullPolicies,
      classesOfService,
      definitionOfReady,
      definitionOfDone,
      serviceLevelExpectation,
      agingThresholds,
    } = req.body;

    if (workflowColumns) {
      const v = validateKanbanWorkflow(workflowColumns);
      if (!v.valid) return res.status(400).json({ error: v.error });
      auth.project.kanbanConfig.workflowColumns = workflowColumns;
    }

    if (wipPolicy) auth.project.kanbanConfig.wipPolicy = { ...auth.project.kanbanConfig.wipPolicy, ...wipPolicy };
    if (pullPolicies) auth.project.kanbanConfig.pullPolicies = { ...auth.project.kanbanConfig.pullPolicies, ...pullPolicies };
    if (classesOfService) auth.project.kanbanConfig.classesOfService = classesOfService;
    if (definitionOfReady) auth.project.kanbanConfig.definitionOfReady = definitionOfReady;
    if (definitionOfDone) auth.project.kanbanConfig.definitionOfDone = definitionOfDone;
    if (serviceLevelExpectation) auth.project.kanbanConfig.serviceLevelExpectation = serviceLevelExpectation;
    if (agingThresholds) auth.project.kanbanConfig.agingThresholds = agingThresholds;

    auth.project.markModified("kanbanConfig");
    await auth.project.save();

    const io = req.app.get("io");
    await handleKanbanMutation({
      eventType: "POLICY_CHANGED",
      projectId: auth.project._id,
      teamId: auth.team._id,
      actor: req.user,
      description: "Kanban workflow and WIP policies updated by leader",
      io,
    });

    res.json({ success: true, policies: auth.project.kanbanConfig });
  } catch (err) {
    logger.error(`[Kanban Update Policies Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.put("/policies/:id", handleUpdatePolicies);
router.put("/:projectId/policies", handleUpdatePolicies);

// ── 10. HEALTH & CONTINUOUS IMPROVEMENT ──────────────────────────────────────
async function handleHealth(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const config = auth.project.kanbanConfig;
    const columns = config.workflowColumns || [];
    const columnWip = calculateColumnWip(tasks, columns);
    const blockers = aggregateProjectBlockers(tasks);
    const dependencies = analyzeKanbanDependencies(tasks);
    const flowMetrics = calculateFlowMetrics(tasks, { sleTargetDays: config.serviceLevelExpectation?.targetDays || 4 });
    const bottlenecks = detectBottlenecks(tasks, columns);
    const personalWip = calculatePersonalWip(tasks, auth.team.members || [], config.wipPolicy?.defaultPersonalWip || 3);

    const health = calculateKanbanHealth({
      flowMetrics,
      columnWip,
      bottlenecks,
      blockerData: blockers,
      dependencyData: dependencies,
      personalWip,
    });

    res.json({ success: true, health });
  } catch (err) {
    logger.error(`[Kanban Health Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/health/:id", handleHealth);
router.get("/:projectId/health", handleHealth);

// Continuous improvement insights
async function handleContinuousImprovement(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const config = auth.project.kanbanConfig;
    const columns = config.workflowColumns || [];
    const flowMetrics = calculateFlowMetrics(tasks, { sleTargetDays: config.serviceLevelExpectation?.targetDays || 4 });
    const bottlenecks = detectBottlenecks(tasks, columns);
    const blockers = aggregateProjectBlockers(tasks);

    // Formulate evidence-backed recommendations (Prompt 24)
    const recommendations = [];

    if (bottlenecks.isConstrained) {
      for (const b of bottlenecks.bottlenecks) {
        recommendations.push({
          category: "WIP_BOTTLENECK",
          stage: b.columnName,
          severity: b.severity,
          action: b.recommendation,
          evidence: b.evidenceFactors.join("; "),
        });
      }
    }

    if (blockers.totalActive > 0) {
      recommendations.push({
        category: "BLOCKER_SWARM",
        severity: blockers.active.some((b) => b.severity === "critical") ? "CRITICAL" : "HIGH",
        action: "Convene a team blocker swarm to unblock impeded in-flight work items.",
        evidence: `${blockers.totalActive} active impediment(s) logged on the board.`,
      });
    }

    if (flowMetrics.flowEfficiency.percentage < 60) {
      recommendations.push({
        category: "FLOW_EFFICIENCY",
        severity: "MEDIUM",
        action: "Investigate waiting handoffs between execution and review stages to improve flow efficiency.",
        evidence: `Flow efficiency is currently ${flowMetrics.flowEfficiency.percentage}% with ${flowMetrics.flowEfficiency.waitingHours}h waiting time.`,
      });
    }

    res.json({
      success: true,
      recommendations,
      bottlenecks,
      flowMetrics,
    });
  } catch (err) {
    logger.error(`[Kanban CI Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/continuous-improvement/:id", handleContinuousImprovement);
router.get("/:projectId/continuous-improvement", handleContinuousImprovement);

// ── 11. CONTINUOUS DELIVERY REVIEW ──────────────────────────────────────────
async function handleContinuousDelivery(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const completed = await Task.find({
      $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }],
      $or: [{ kanbanStatus: "DONE" }, { workflowColumn: "done" }, { status: "done" }],
    }).sort({ doneAt: -1, updatedAt: -1 });

    res.json({
      success: true,
      deliveredItemsCount: completed.length,
      deliveredItems: completed,
    });
  } catch (err) {
    logger.error(`[Kanban Delivery Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/continuous-delivery/:id", handleContinuousDelivery);
router.get("/:projectId/continuous-delivery", handleContinuousDelivery);

// ── 12. CHANGE IMPACT SIMULATION ────────────────────────────────────────────
async function handleChangeImpact(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const { changeType, targetTaskId, targetRequirementId, addedEffortHours, shiftedDays } = req.body;

    const simulation = assessKanbanChangeImpact({
      changeType,
      targetTaskId,
      targetRequirementId,
      addedEffortHours,
      shiftedDays,
      tasks,
      kanbanConfig: auth.project.kanbanConfig,
    });

    res.json({ success: true, simulation });
  } catch (err) {
    logger.error(`[Kanban Change Impact Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.post("/change-impact/:id", handleChangeImpact);
router.post("/:projectId/change-impact", handleChangeImpact);

// ── 13. PROJECT EVENTS & AUDIT LOG ──────────────────────────────────────────
async function handleEvents(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const events = await ProjectEvent.find({
      $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }],
      eventType: { $regex: /^KANBAN_/ },
    })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ success: true, events });
  } catch (err) {
    logger.error(`[Kanban Events Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/events/:id", handleEvents);
router.get("/:projectId/events", handleEvents);

// ── 14. COPILOT STRUCTURED CONTEXT ──────────────────────────────────────────
async function handleCopilotContext(req, res) {
  try {
    const auth = await verifyProjectAccess(req, res);
    if (!auth) return;

    const overview = await getKanbanOverview(auth.project._id);
    const tasks = await Task.find({ $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }] });
    const config = auth.project.kanbanConfig;

    res.json({
      success: true,
      projectTitle: auth.project.title,
      methodology: "KANBAN",
      domain: auth.project.domain || "General",
      kanbanFacts: {
        healthGrade: overview.health.grade,
        healthScore: overview.health.overall,
        activeWip: overview.flowMetrics.activeWipCount,
        throughputWeekly: overview.flowMetrics.throughput.averageWeekly,
        medianCycleTimeDays: overview.flowMetrics.cycleTime.medianDays,
        sleTargetDays: config.serviceLevelExpectation?.targetDays || 4,
        sleAttainmentRate: overview.flowMetrics.sle.attainmentRate,
        activeBlockers: overview.blockers.totalActive,
        isBottlenecked: overview.bottlenecks.isConstrained,
        wipPolicyMode: config.wipPolicy?.mode || "advisory",
      },
      topPriorities: rankBacklogCandidates(tasks).slice(0, 3).map((r) => ({
        title: r.task.title,
        score: r.score,
        tier: r.tier,
        explanation: r.explanation,
      })),
    });
  } catch (err) {
    logger.error(`[Kanban Copilot Context Error]: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
router.get("/copilot-context/:id", handleCopilotContext);
router.get("/:projectId/copilot-context", handleCopilotContext);

export default router;
