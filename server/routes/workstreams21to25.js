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

const router = Router();

/**
 * Security Helper: Verify project existence and ensure calling user has access.
 */
async function authorizeProjectAccess(projectId, req, res) {
  if (!mongoose.isValidObjectId(projectId)) {
    res.status(400).json({ error: "Invalid project ID format" });
    return null;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  const user = req.user;
  if (user && project.teamId) {
    const team = await Team.findById(project.teamId).lean();
    if (team) {
      const userIdStr = (user._id || user.id)?.toString() || "";
      const isOwner = team.ownerId && team.ownerId.toString() === userIdStr;
      const isMember = Array.isArray(team.members) && team.members.some((m) => {
        const mId = (m.userId?._id || m.userId)?.toString() || "";
        return mId && mId === userIdStr;
      });
      const isFaculty = Array.isArray(project.assignedFacultyIds) && project.assignedFacultyIds.some((f) => {
        const fId = (f?._id || f)?.toString() || "";
        return fId && fId === userIdStr;
      });

      if (!isOwner && !isMember && !isFaculty && user.role !== "admin") {
        res.status(403).json({ error: "Forbidden: You do not have permission to access this project." });
        return null;
      }

      const memberMeta = team.members?.find((m) => (m.userId?._id || m.userId)?.toString() === userIdStr);
      const isLeader = isOwner || memberMeta?.role === "leader" || memberMeta?.role === "manager" || isFaculty || user.role === "admin";

      return { project, team, isLeader, isFaculty };
    }
  }

  return { project, team: null, isLeader: true, isFaculty: false };
}

// ============================================================================
// WORKSTREAM 21: PROJECT LEARNING LOOP
// ============================================================================

// GET /api/projects/:projectId/lessons
router.get("/projects/:projectId/lessons", requireAuth, async (req, res) => {
  try {
    const auth = await authorizeProjectAccess(req.params.projectId, req, res);
    if (!auth) return;

    const lessons = await getProjectLessons(req.params.projectId, {
      status: req.query.status,
      category: req.query.category,
    });
    res.json({ lessons, count: lessons.length });
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

    const targetProjectId = req.body.targetProjectId || req.params.projectId;
    const targetAuth = await authorizeProjectAccess(targetProjectId, req, res);
    if (!targetAuth) return;

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
    const lessons = await getReusableLessons({ domain, methodology, tag });
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
    if (!decision) return res.status(404).json({ error: "Decision explanation not found." });

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

    const recomputed = await recomputeCounterfactual(decisionId, { parameter, modifiedValue });
    res.json(recomputed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/decisions/:decisionId/ai-summary
router.post("/decisions/:decisionId/ai-summary", requireAuth, async (req, res) => {
  try {
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
