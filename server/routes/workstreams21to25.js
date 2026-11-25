/**
 * server/routes/workstreams21to25.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAMS 21–25 REST API ROUTES
 *
 * Scope:
 * WS 21: Project Learning Loop (/api/projects/:projectId/lessons, /api/lessons/reusable)
 * WS 22: Capability Intelligence (/api/projects/:projectId/capability-overview, /api/projects/:projectId/assignment/...)
 * WS 23: Explainable Decision Intelligence (/api/projects/:projectId/decisions/explain/...)
 * WS 24: Project Health 2.0 & Early Warnings (/api/projects/:projectId/health-v2, /api/projects/:projectId/warnings/...)
 *
 * Invariants:
 * 1. All endpoints require authentication (requireAuth) and project/team isolation.
 * 2. Role-based authorization enforced on state-changing operations.
 * 3. AI remains advisory and never mutates project state.
 * 4. DAA operations remain deterministic and reproducible.
 * ============================================================================
 */

import { Router } from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import { requireAuth } from "../auth.js";

// Services
import {
  collectLearningEvidence,
  generateLessonCandidates,
  validateLesson,
  applyLesson,
  archiveLesson,
  getProjectLessons,
  getReusableLessons,
} from "../services/projectLearningService.js";

import {
  buildCapabilityProfile,
  analyzeCapabilityGaps,
  previewDynamicAssignment,
  acceptAssignment,
} from "../services/capabilityIntelligenceService.js";

import {
  explainTaskPriority,
  recomputeCounterfactual,
  summarizeDecisionWithAI,
  getDecisionExplanation,
  getProjectDecisionsByType,
} from "../services/decisionIntelligenceService.js";

import {
  evaluateProjectHealth2,
  acknowledgeWarning,
  resolveWarning,
  dismissWarning,
  getProjectWarnings,
} from "../services/projectHealth2Service.js";

import {
  authorizeProjectAccess as centralAuthorizeProjectAccess,
  getMembership,
  roleRank,
  findScopedTask,
} from "../services/accessControlService.js";
import ProjectLesson from "../models/ProjectLesson.js";
import DecisionRecord from "../models/DecisionRecord.js";
import EarlyWarning from "../models/EarlyWarning.js";
import { getAuthUserId, isValidId } from "../utils/identity.js";

const router = Router();

/**
 * Security Helper: Verify project existence and ensure calling user has access.
 */
async function authorizeProjectAccess(projectId, req, res) {
  // Phase 1: central, id-only, FAIL-CLOSED check (previously a missing team
  // returned isLeader:true). Assigned faculty keep their existing access.
  const result = await centralAuthorizeProjectAccess(projectId, req.user, { allowTeamId: false, allowFaculty: true });
  if (result.error) {
    const status = result.status === 400 ? 400 : result.status === 404 ? 404 : result.status;
    res.status(status).json({ error: status === 404 ? "Project not found" : status === 400 ? "Invalid project ID format" : "Forbidden: You do not have permission to access this project.", code: result.code });
    return null;
  }
  const { project, team, membership, userId } = result;
  const isFaculty = Boolean(membership?.isFaculty);
  const isLeader = isFaculty || roleRank(getMembership(team, userId).accessRole) >= roleRank("manager");
  return { project, team, isLeader, isFaculty, userId };
}

/** Phase 1 (D-3): a child record must belong to the authorized project. */
async function childInProject(Model, filter, projectId) {
  if (!filter || Object.values(filter).some((v) => !v)) return false;
  return Boolean(await Model.exists({ ...filter, projectId }));
}

// ============================================================================
// WORKSTREAM 21: PROJECT LEARNING LOOP
// ============================================================================

// GET /api/projects/:projectId/lessons
router.get("/projects/:projectId/lessons", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const statusParam = req.query.status;
    const filterStatus = statusParam && statusParam.toUpperCase() !== "ALL" ? statusParam.toUpperCase() : null;

    const allLessons = await getProjectLessons(req.params.projectId);
    const counts = {
      all: allLessons.length,
      candidate: allLessons.filter((l) => l.status === "CANDIDATE").length,
      validated: allLessons.filter((l) => l.status === "VALIDATED").length,
      applied: allLessons.filter((l) => l.status === "APPLIED").length,
      archived: allLessons.filter((l) => l.status === "ARCHIVED").length,
    };

    const lessons = filterStatus ? allLessons.filter((l) => l.status === filterStatus) : allLessons;
    res.json({ lessons, counts, count: lessons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/lessons/evidence
router.get("/projects/:projectId/lessons/evidence", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const evidence = await collectLearningEvidence(req.params.projectId);
    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/lessons/generate
router.post("/projects/:projectId/lessons/generate", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const io = req.app.get("io");
    const candidates = await generateLessonCandidates(req.params.projectId, req.user, io);
    res.status(201).json({ success: true, candidates, count: candidates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/lessons/:lessonId/validate
router.patch("/projects/:projectId/lessons/:lessonId/validate", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    if (!auth.isLeader) {
      return res.status(403).json({ error: "Only team leaders, managers, or faculty can validate lessons." });
    }
    if (!isValidId(req.params.lessonId) || !(await childInProject(ProjectLesson, { _id: req.params.lessonId }, auth.project._id))) {
      return res.status(404).json({ error: "Lesson not found in this project." });
    }

    const io = req.app.get("io");
    const lesson = await validateLesson(
      req.params.lessonId,
      req.user,
      { approved: req.body.approved !== false, notes: req.body.notes },
      io
    );
    res.json({ success: true, lesson });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/lessons/:lessonId/apply
router.patch("/projects/:projectId/lessons/:lessonId/apply", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    if (!isValidId(req.params.lessonId) || !(await childInProject(ProjectLesson, { _id: req.params.lessonId }, auth.project._id))) {
      return res.status(404).json({ error: "Lesson not found in this project." });
    }
    const targetProjectId = req.body.targetProjectId || req.params.projectId;
    const targetAuth = await authorizeProjectAccess(targetProjectId, req, res);
    if (!targetAuth) return;
    if (!targetAuth.isLeader) {
      return res.status(403).json({ error: "Only team leaders, managers, or faculty can apply lessons." });
    }

    const io = req.app.get("io");
    const lesson = await applyLesson(
      req.params.lessonId,
      targetProjectId,
      req.user,
      { notes: req.body.notes },
      io
    );
    res.json({ success: true, lesson, advisoryNotice: "Lesson applied as advisory planning guide." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/lessons/:lessonId/archive
router.patch("/projects/:projectId/lessons/:lessonId/archive", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    if (!auth.isLeader) {
      return res.status(403).json({ error: "Only team leaders or faculty can archive lessons." });
    }
    if (!isValidId(req.params.lessonId) || !(await childInProject(ProjectLesson, { _id: req.params.lessonId }, auth.project._id))) {
      return res.status(404).json({ error: "Lesson not found in this project." });
    }

    const io = req.app.get("io");
    const lesson = await archiveLesson(req.params.lessonId, req.user, req.body.reason, io);
    res.json({ success: true, lesson });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/lessons/reusable
router.get("/lessons/reusable", requireAuth, async (req, res) => {
  try {
    const { domain, methodology, tag } = req.query;
    const userId = getAuthUserId(req.user);
    const myTeams = await Team.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).select("_id").lean();
    const myTeamIds = new Set(myTeams.map((t) => String(t._id)));
    const lessons = (await getReusableLessons({ domain, methodology, tag })).filter((l) => myTeamIds.has(String(l.teamId)));
    res.json({ lessons, count: lessons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// WORKSTREAM 22: CAPABILITY INTELLIGENCE & DYNAMIC TEAM ASSIGNMENT
// ============================================================================

// GET /api/projects/:projectId/capability-overview
router.get("/projects/:projectId/capability-overview", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const gaps = await analyzeCapabilityGaps(req.params.projectId);
    res.json(gaps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/members/:userId/capability
router.get("/teams/:teamId/members/:userId/capability", requireAuth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const profile = await buildCapabilityProfile(userId, teamId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/assignment/preview
router.get("/projects/:projectId/assignment/preview", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const preview = await previewDynamicAssignment(req.params.projectId);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/assignment/accept
router.post("/projects/:projectId/assignment/accept", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    if (!auth.isLeader) {
      return res.status(403).json({ error: "Only team leaders or managers can accept assignment changes." });
    }

    const { taskId, newAssigneeId } = req.body;
    if (!taskId || !newAssigneeId) {
      return res.status(400).json({ error: "taskId and newAssigneeId are required." });
    }

    const io = req.app.get("io");
    const result = await acceptAssignment(
      req.params.projectId,
      { taskId, newAssigneeId },
      req.user,
      io
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// WORKSTREAM 23: EXPLAINABLE DECISION INTELLIGENCE
// ============================================================================

// GET /api/projects/:projectId/decisions/explain/:decisionId
router.get("/projects/:projectId/decisions/explain/:decisionId", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const decision = await getDecisionExplanation(req.params.decisionId);
    if (!decision || String(decision.projectId) !== String(auth.project._id)) {
      return res.status(404).json({ error: "Decision explanation not found." });
    }

    res.json(decision);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/decisions/explain/type/:decisionType
router.get("/projects/:projectId/decisions/explain/type/:decisionType", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const decisions = await getProjectDecisionsByType(req.params.projectId, req.params.decisionType);
    res.json({ decisions, count: decisions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/decisions/explain/task-priority/:taskId
router.post("/projects/:projectId/decisions/explain/task-priority/:taskId", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    if (!(await findScopedTask(req.params.taskId, { teamId: auth.team._id, projectId: auth.project._id }))) {
      return res.status(404).json({ error: "Task not found in this project." });
    }
    const io = req.app.get("io");
    const explanation = await explainTaskPriority(req.params.taskId, io);
    res.json(explanation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/decisions/explain/counterfactual
router.post("/projects/:projectId/decisions/explain/counterfactual", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const { decisionId, parameter, modifiedValue } = req.body;
    if (!decisionId || !parameter) {
      return res.status(400).json({ error: "decisionId and parameter are required." });
    }

    if (!(await childInProject(DecisionRecord, { decisionId: String(decisionId) }, auth.project._id))) {
      return res.status(404).json({ error: "Decision explanation not found." });
    }
    const recomputed = await recomputeCounterfactual(decisionId, { parameter, modifiedValue });
    res.json(recomputed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/decisions/:decisionId/ai-summary
router.post("/decisions/:decisionId/ai-summary", requireAuth, async (req, res) => {
  try {
    const record = await DecisionRecord.findOne({ decisionId: String(req.params.decisionId) }).select("projectId").lean();
    if (!record) return res.status(404).json({ error: "Decision explanation not found." });
    const auth = await authorizeProjectAccess(String(record.projectId), req, res);
    if (!auth) return;
    const decision = await summarizeDecisionWithAI(req.params.decisionId);
    res.json({ success: true, decision, aiSummary: decision.aiSummary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// WORKSTREAM 24: PROJECT HEALTH 2.0 & EARLY WARNING SYSTEM
// ============================================================================

// GET /api/projects/:projectId/health-v2 & /api/projects/:projectId/health2
router.get(["/projects/:projectId/health-v2", "/projects/:projectId/health2"], requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const io = req.app.get("io");
    const health = await evaluateProjectHealth2(req.params.projectId, io);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/warnings
router.get("/projects/:projectId/warnings", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const warnings = await getProjectWarnings(req.params.projectId, {
      status: req.query.status,
    });
    res.json({ warnings, count: warnings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/warnings/:warningId/acknowledge
router.patch("/projects/:projectId/warnings/:warningId/acknowledge", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;
    if (!isValidId(req.params.warningId) || !(await childInProject(EarlyWarning, { _id: req.params.warningId }, auth.project._id))) {
      return res.status(404).json({ error: "Warning not found in this project." });
    }

    const io = req.app.get("io");
    const warning = await acknowledgeWarning(req.params.warningId, req.user, io);
    res.json({ success: true, warning });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/warnings/:warningId/resolve
router.patch("/projects/:projectId/warnings/:warningId/resolve", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;
    if (!isValidId(req.params.warningId) || !(await childInProject(EarlyWarning, { _id: req.params.warningId }, auth.project._id))) {
      return res.status(404).json({ error: "Warning not found in this project." });
    }

    if (!auth.isLeader) {
      return res.status(403).json({ error: "Only team leaders or managers can resolve early warnings." });
    }

    const io = req.app.get("io");
    const warning = await resolveWarning(req.params.warningId, req.user, req.body.reason, io);
    res.json({ success: true, warning });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectId/warnings/:warningId/dismiss
router.patch("/projects/:projectId/warnings/:warningId/dismiss", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;
    if (!isValidId(req.params.warningId) || !(await childInProject(EarlyWarning, { _id: req.params.warningId }, auth.project._id))) {
      return res.status(404).json({ error: "Warning not found in this project." });
    }

    if (!auth.isLeader) {
      return res.status(403).json({ error: "Only team leaders or managers can dismiss early warnings." });
    }

    if (!req.body.reason || !String(req.body.reason).trim()) {
      return res.status(400).json({ error: "A business reason is required to dismiss a warning." });
    }

    const io = req.app.get("io");
    const warning = await dismissWarning(req.params.warningId, req.user, req.body.reason, io);
    res.json({ success: true, warning });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
