/**
 * server/routes/projects.js
 * ============================================================================
 * PROJECT ROUTES — REST API for all Project-centric NEXUSFLOW 2.0 entities.
 *
 * DESIGN PRINCIPLES:
 * 1. All routes require authentication (requireAuth middleware)
 * 2. All routes are additive — they do NOT modify existing Team/Task behavior
 * 3. projectId is always validated before returning data
 * 4. Existing teamId-based task queries in routes/teams.js are UNCHANGED
 * 5. No algorithm code is duplicated here; algorithms in /algorithms/* still
 *    operate on Task documents, which now have an optional projectId field
 *
 * ROUTE OVERVIEW:
 *   Project CRUD:
 *     GET    /api/projects                         — List all projects (optional ?teamId=)
 *     POST   /api/projects                         — Create new project
 *     GET    /api/projects/:projectId              — Get single project
 *     PATCH  /api/projects/:projectId              — Update project fields
 *     DELETE /api/projects/:projectId              — Delete project (does NOT delete tasks)
 *
 *   Project Tasks:
 *     GET    /api/projects/:projectId/tasks        — Tasks scoped to project (Greedy sorted)
 *
 *   Project Context:
 *     PATCH  /api/projects/:projectId/context      — Update embedded ProjectContext
 *
 *   Decisions:
 *     GET    /api/projects/:projectId/decisions    — List decisions
 *     POST   /api/projects/:projectId/decisions    — Create decision
 *     PATCH  /api/projects/:projectId/decisions/:decisionId — Update decision
 *     DELETE /api/projects/:projectId/decisions/:decisionId — Delete decision
 *
 *   Research Items:
 *     GET    /api/projects/:projectId/research     — List research items
 *     POST   /api/projects/:projectId/research     — Add research item
 *     PATCH  /api/projects/:projectId/research/:itemId  — Update item
 *     DELETE /api/projects/:projectId/research/:itemId  — Delete item
 *
 *   Recommendations:
 *     GET    /api/projects/:projectId/recommendations
 *     POST   /api/projects/:projectId/recommendations
 *     PATCH  /api/projects/:projectId/recommendations/:recId
 *     DELETE /api/projects/:projectId/recommendations/:recId
 *
 *   Architecture Components:
 *     GET    /api/projects/:projectId/architecture
 *     POST   /api/projects/:projectId/architecture
 *     PATCH  /api/projects/:projectId/architecture/:compId
 *     DELETE /api/projects/:projectId/architecture/:compId
 *
 *   Resources:
 *     GET    /api/projects/:projectId/resources
 *     POST   /api/projects/:projectId/resources
 *     PATCH  /api/projects/:projectId/resources/:resourceId
 *     DELETE /api/projects/:projectId/resources/:resourceId
 *
 *   AI Conversations & Messages:
 *     GET    /api/projects/:projectId/conversations
 *     POST   /api/projects/:projectId/conversations
 *     GET    /api/projects/:projectId/conversations/:convId/messages
 *     POST   /api/projects/:projectId/conversations/:convId/messages
 * ============================================================================
 */

import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";

// Import all Phase 1 models
import Project          from "../models/Project.js";
import Team             from "../models/Team.js";
import Task             from "../models/Task.js";
import Decision         from "../models/Decision.js";
import ResearchItem     from "../models/ResearchItem.js";
import Recommendation   from "../models/Recommendation.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import Resource         from "../models/Resource.js";
import AIConversation   from "../models/AIConversation.js";
import AIMessage        from "../models/AIMessage.js";

import {
  buildProjectContext,
  analyzeProject,
  chatWithProjectAdvisor,
  decomposeTasksWithContext,
  buildTaskGenerationContext,
} from "../services/projectIntelligence.js";
import { discoverAcademicPapers } from "../services/academicResearchService.js";
import { getProjectToolRecommendations } from "../services/projectToolsService.js";

// NEXUSFLOW 3.0 — Phase 12-17 imports
import TeamHealth        from "../models/TeamHealth.js";
import Risk              from "../models/Risk.js";
import Opinion          from "../models/Opinion.js";
import Retrospective    from "../models/Retrospective.js";
import LearningInsight  from "../models/LearningInsight.js";
import { computeTeamHealth }      from "../services/teamHealth.js";
import { scanProjectRisks }       from "../services/riskEngine.js";
import { generateRetrospective }  from "../services/retrospectiveService.js";
import { generateInsights }       from "../services/learningService.js";
import { buildProjectBrainContext, serializeBrainForPrompt } from "../services/projectBrain.js";
import { broadcastDecisionUpdate, broadcastResearchUpdate, broadcastArchitectureUpdate, broadcastGuidanceUpdate, broadcastRiskUpdate, broadcastHealthUpdate, broadcastRetrospectiveUpdate, broadcastOpinionUpdate } from "../socket/projectSyncHandlers.js";

const router = Router();

// ── Helper: verify project exists, check authorization, and return it ────────
async function findProject(projectId, res, user = null) {
  if (!mongoose.isValidObjectId(projectId)) {
    res.status(400).json({ error: "invalid_project_id" });
    return null;
  }
  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(404).json({ error: "project_not_found" });
    return null;
  }

  // Security Check: Verify team access if user context is available
  if (user && project.teamId) {
    const team = await Team.findById(project.teamId).lean();
    if (team) {
      const userIdStr = (user._id || user.id)?.toString() || "";
      const userEmail = (user.email || "").toLowerCase().trim();
      const userName = (user.name || "").toLowerCase().trim();

      const isOwner = team.ownerId && team.ownerId.toString() === userIdStr;
      const isMember = Array.isArray(team.members) && team.members.some((m) => {
        const mIdStr = (m.userId?._id || m.userId)?.toString() || "";
        const mName = (m.name || "").toLowerCase().trim();
        return (
          (mIdStr && mIdStr === userIdStr) ||
          (mName && userEmail && mName === userEmail) ||
          (mName && userName && mName === userName)
        );
      });

      const isLegacy = !team.ownerId && (!team.members || team.members.length === 0);

      if (!isOwner && !isMember && !isLegacy && user.role !== "admin") {
        res.status(403).json({ error: "Forbidden: You do not have access to this project." });
        return null;
      }
    }
  }

  return project;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CRUD
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects ─────────────────────────────────────────────────────────
// List all projects strictly scoped to teams the authenticated user belongs to.
router.get("/projects", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userEmail = req.user?.email?.toLowerCase()?.trim();
    const userName = req.user?.name?.trim();

    const teamConditions = [];
    if (userId && mongoose.isValidObjectId(userId)) {
      teamConditions.push({ ownerId: userId });
      teamConditions.push({ "members.userId": userId });
    }
    if (userEmail) teamConditions.push({ "members.name": userEmail });
    if (userName) teamConditions.push({ "members.name": userName });

    // Find all teams the user belongs to
    const userTeams = await Team.find(teamConditions.length > 0 ? { $or: teamConditions } : { _id: null }).select("_id").lean();
    const allowedTeamIds = userTeams.map((t) => t._id);

    const filter = { teamId: { $in: allowedTeamIds } };
    if (req.query.teamId && mongoose.isValidObjectId(req.query.teamId)) {
      const requestedId = new mongoose.Types.ObjectId(req.query.teamId);
      if (allowedTeamIds.some((id) => id.equals(requestedId))) {
        filter.teamId = requestedId;
      } else {
        return res.json([]); // Not authorized for this team -> return empty
      }
    }

    const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects ────────────────────────────────────────────────────────
// Create a new project.
router.post("/projects", requireAuth, async (req, res) => {
  try {
    const {
      teamId, title, description = "", originalPrompt = "",
      domain = "", projectType = "", academicContext = "",
      teamSize, sprintWeeks, context = {}, status = "ideation",
    } = req.body ?? {};

    if (!teamId || !mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "teamId (valid ObjectId) is required." });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Project title is required." });
    }

    // Verify the team exists
    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });

    // Verify team ownership / membership
    const userIdStr = (req.user?._id || req.user?.id)?.toString() || "";
    const userEmail = (req.user?.email || "").toLowerCase().trim();
    const userName = (req.user?.name || "").toLowerCase().trim();

    const isOwner = team.ownerId && team.ownerId.toString() === userIdStr;
    const isMember = Array.isArray(team.members) && team.members.some((m) => {
      const mIdStr = (m.userId?._id || m.userId)?.toString() || "";
      const mName = (m.name || "").toLowerCase().trim();
      return (
        (mIdStr && mIdStr === userIdStr) ||
        (mName && userEmail && mName === userEmail) ||
        (mName && userName && mName === userName)
      );
    });

    if (!isOwner && !isMember && team.ownerId && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: You are not a member of this team." });
    }

    // Create the project document
    const project = await Project.create({
      teamId,
      title:          String(title).trim(),
      description:    String(description).trim(),
      originalPrompt: String(originalPrompt).trim(),
      domain:         String(domain).trim(),
      projectType:    String(projectType).trim(),
      academicContext: String(academicContext).trim(),
      teamSize:       teamSize  ? Number(teamSize)  : null,
      sprintWeeks:    sprintWeeks ? Number(sprintWeeks) : null,
      status,
      context,
    });

    // If the team has no active project yet, point it to the new one.
    // This is additive — we only set it if null, never overwrite an existing pointer.
    if (!team.activeProjectId) {
      await Team.updateOne({ _id: teamId }, { $set: { activeProjectId: project._id } });
    }

    res.status(201).json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/projects/:projectId ──────────────────────────────────────────────
// Fetch a single project with all its embedded context.
router.get("/projects/:projectId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId ───────────────────────────────────────────
// Update top-level project fields. Does NOT touch embedded context (use /context).
router.patch("/projects/:projectId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "title", "description", "originalPrompt", "domain", "projectType",
      "academicContext", "teamSize", "sprintWeeks", "status", "currentPhase",
    ];
    const update = {};
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $set: update },
      { new: true, lean: true }
    );

    if (update.title && updated?.teamId) {
      await Team.updateOne({ _id: updated.teamId }, { $set: { projectTitle: String(update.title).trim() } });
    }

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId ──────────────────────────────────────────
// Delete a project and all associated sub-entities (Decisions, Research,
// Recommendations, Architecture, Resources, Conversations, Messages).
// Does NOT delete Tasks (Tasks remain with teamId; projectId is cleared).
// Does NOT delete the Team.
router.delete("/projects/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await findProject(projectId, res);
    if (!project) return;

    // Clear projectId on all tasks that referenced this project.
    // Tasks are preserved — only the project-scoping link is removed.
    await Task.updateMany({ projectId }, { $set: { projectId: null } });

    // Remove all sub-entities
    await Promise.all([
      Decision.deleteMany({ projectId }),
      ResearchItem.deleteMany({ projectId }),
      Recommendation.deleteMany({ projectId }),
      ArchitectureComponent.deleteMany({ projectId }),
      Resource.deleteMany({ projectId }),
      AIConversation.deleteMany({ projectId }),
      AIMessage.deleteMany({ projectId }),
    ]);

    // If the team's activeProjectId points to this project, clear it
    await Team.updateMany(
      { activeProjectId: projectId },
      { $set: { activeProjectId: null } }
    );

    await Project.findByIdAndDelete(projectId);
    res.json({ ok: true, deletedProjectId: projectId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT TASKS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/tasks ────────────────────────────────────────
// Fetch tasks that belong to this project, sorted by Greedy priority (DESC).
// Legacy tasks (projectId = null) are NOT included here; use /api/teams/:teamId/tasks
// for team-wide task listings.
router.get("/projects/:projectId/tasks", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const tasks = await Task.find({ projectId: req.params.projectId })
      .sort({ priorityScore: -1, createdAt: 1 })
      .lean();

    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

// ── PATCH /api/projects/:projectId/context ────────────────────────────────────
// Update the embedded ProjectContext fields.
// Only the fields provided in the body are updated (partial update via $set).
router.patch("/projects/:projectId/context", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const CONTEXT_FIELDS = [
      "problemStatement", "targetUsers", "goals", "constraints",
      "expectedOutputs", "hardwareRequirements", "softwareRequirements",
      "aiMlRequirements", "integrations", "deploymentRequirements",
      "securityConsiderations", "budgetUsd", "estimatedDurationDays",
      "preferredStack", "assumptions", "extractedBy", "extractionConfidence",
    ];
    const setOps = {};
    for (const k of CONTEXT_FIELDS) {
      if (req.body[k] !== undefined) setOps[`context.${k}`] = req.body[k];
    }
    if (!Object.keys(setOps).length) {
      return res.status(400).json({ error: "No valid context fields to update." });
    }

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $set: setOps },
      { new: true, lean: true }
    );
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DECISIONS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/decisions ────────────────────────────────────
router.get("/projects/:projectId/decisions", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const decisions = await Decision.find(filter).sort({ createdAt: -1 }).lean();
    res.json(decisions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/decisions ───────────────────────────────────
router.post("/projects/:projectId/decisions", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { title, decision, reasoning = "", alternativesConsidered = [],
            selectedOption = "", category = "technology", source = "manual",
            confidence, status = "proposed" } = req.body ?? {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Decision title is required." });
    }
    if (!decision || !String(decision).trim()) {
      return res.status(400).json({ error: "Decision statement is required." });
    }

    const createdBy = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;
    const doc = await Decision.create({
      projectId: req.params.projectId,
      title: String(title).trim(),
      decision: String(decision).trim(),
      reasoning, alternativesConsidered, selectedOption,
      category, source, confidence: confidence ?? null,
      status, createdBy,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/decisions/:decisionId ─────────────────────
router.patch("/projects/:projectId/decisions/:decisionId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "title", "decision", "reasoning", "alternativesConsidered",
      "selectedOption", "category", "source", "confidence",
      "status", "supersededBy", "rejectionReason",
    ];
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const updated = await Decision.findOneAndUpdate(
      { _id: req.params.decisionId, projectId: req.params.projectId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Decision not found." });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/decisions/:decisionId ────────────────────
router.delete("/projects/:projectId/decisions/:decisionId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const deleted = await Decision.findOneAndDelete({
      _id: req.params.decisionId,
      projectId: req.params.projectId,
    });
    if (!deleted) return res.status(404).json({ error: "Decision not found." });
    res.json({ ok: true, deletedId: req.params.decisionId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH ITEMS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/research ─────────────────────────────────────
router.get("/projects/:projectId/research", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;

    const items = await ResearchItem.find(filter).sort({ relevance: -1, createdAt: -1 }).lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/research/discover ───────────────────────────
// Triggers real academic paper discovery from OpenAlex / Crossref.
// Strictly $0 cost, returns real academic papers with valid DOIs and OA PDFs.
router.post("/projects/:projectId/research/discover", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const papers = await discoverAcademicPapers(project);
    res.json({
      success: true,
      count: papers.length,
      papers,
    });
  } catch (e) {
    console.error("[POST /projects/:id/research/discover] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to discover research papers" });
  }
});

// ── GET /api/projects/:projectId/tools ────────────────────────────────────────
// Returns project-tailored APIs, developer tools, SDKs, and models.
// READ-ONLY / DECISION SUPPORT ONLY — DOES NOT CREATE TASKS OR MODIFY KANBAN.
router.get("/projects/:projectId/tools", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const tools = await getProjectToolRecommendations(project);
    res.json({
      success: true,
      projectId: req.params.projectId,
      tools,
    });
  } catch (e) {
    console.error("[GET /projects/:id/tools] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to load project tools" });
  }
});

// ── POST /api/projects/:projectId/research ────────────────────────────────────
router.post("/projects/:projectId/research", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { title, authors = [], url = "", source = "article", abstract = "",
            topics = [], relevance = 3, notes = "", publishedAt,
            status = "found" } = req.body ?? {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Research item title is required." });
    }

    const addedBy = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;
    const doc = await ResearchItem.create({
      projectId: req.params.projectId,
      title: String(title).trim(),
      authors, url, source, abstract, topics, relevance, notes,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      status, addedBy,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/research/:itemId ──────────────────────────
router.patch("/projects/:projectId/research/:itemId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "title", "authors", "url", "source", "abstract", "topics",
      "relevance", "notes", "publishedAt", "status",
    ];
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const updated = await ResearchItem.findOneAndUpdate(
      { _id: req.params.itemId, projectId: req.params.projectId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Research item not found." });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/research/:itemId ─────────────────────────
router.delete("/projects/:projectId/research/:itemId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const deleted = await ResearchItem.findOneAndDelete({
      _id: req.params.itemId,
      projectId: req.params.projectId,
    });
    if (!deleted) return res.status(404).json({ error: "Research item not found." });
    res.json({ ok: true, deletedId: req.params.itemId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/recommendations ─────────────────────────────
router.get("/projects/:projectId/recommendations", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.recommendationType) filter.recommendationType = req.query.recommendationType;

    const recs = await Recommendation.find(filter).sort({ createdAt: -1 }).lean();
    res.json(recs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/recommendations ────────────────────────────
router.post("/projects/:projectId/recommendations", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { recommendationType = "technology", recommendedItem, category = "",
            reason = "", confidence, source = "system", alternatives = [],
            relatedTaskId, status = "pending" } = req.body ?? {};

    if (!recommendedItem || !String(recommendedItem).trim()) {
      return res.status(400).json({ error: "recommendedItem is required." });
    }

    const doc = await Recommendation.create({
      projectId: req.params.projectId,
      recommendationType,
      recommendedItem: String(recommendedItem).trim(),
      category, reason, confidence: confidence ?? null, source, alternatives,
      relatedTaskId: relatedTaskId && mongoose.isValidObjectId(relatedTaskId) ? relatedTaskId : null,
      status,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/recommendations/:recId ────────────────────
router.patch("/projects/:projectId/recommendations/:recId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "recommendationType", "recommendedItem", "category", "reason",
      "confidence", "source", "alternatives", "relatedTaskId",
      "status", "rejectionReason",
    ];
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const updated = await Recommendation.findOneAndUpdate(
      { _id: req.params.recId, projectId: req.params.projectId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Recommendation not found." });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/recommendations/:recId ───────────────────
router.delete("/projects/:projectId/recommendations/:recId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const deleted = await Recommendation.findOneAndDelete({
      _id: req.params.recId,
      projectId: req.params.projectId,
    });
    if (!deleted) return res.status(404).json({ error: "Recommendation not found." });
    res.json({ ok: true, deletedId: req.params.recId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/architecture ─────────────────────────────────
router.get("/projects/:projectId/architecture", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.componentType) filter.componentType = req.query.componentType;
    if (req.query.status) filter.status = req.query.status;

    const components = await ArchitectureComponent.find(filter).lean();
    res.json(components);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/architecture ────────────────────────────────
router.post("/projects/:projectId/architecture", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { componentType, name, description = "", technology = "",
            supportingTools = [], dependsOn = [], relatedTaskIds = [],
            configuration = {}, status = "planned" } = req.body ?? {};

    if (!componentType) return res.status(400).json({ error: "componentType is required." });
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Component name is required." });

    const doc = await ArchitectureComponent.create({
      projectId: req.params.projectId,
      componentType,
      name: String(name).trim(),
      description, technology, supportingTools, dependsOn,
      relatedTaskIds, configuration, status,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/architecture/:compId ──────────────────────
router.patch("/projects/:projectId/architecture/:compId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "componentType", "name", "description", "technology",
      "supportingTools", "dependsOn", "relatedTaskIds", "configuration", "status",
    ];
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const updated = await ArchitectureComponent.findOneAndUpdate(
      { _id: req.params.compId, projectId: req.params.projectId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Architecture component not found." });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/architecture/:compId ─────────────────────
router.delete("/projects/:projectId/architecture/:compId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const deleted = await ArchitectureComponent.findOneAndDelete({
      _id: req.params.compId,
      projectId: req.params.projectId,
    });
    if (!deleted) return res.status(404).json({ error: "Architecture component not found." });
    res.json({ ok: true, deletedId: req.params.compId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/resources ────────────────────────────────────
router.get("/projects/:projectId/resources", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.resourceType) filter.resourceType = req.query.resourceType;
    if (req.query.status) filter.status = req.query.status;

    const resources = await Resource.find(filter).sort({ resourceType: 1, createdAt: -1 }).lean();
    res.json(resources);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/resources ───────────────────────────────────
router.post("/projects/:projectId/resources", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { resourceType, name, description = "", url = "",
            accessType = "unknown", estimatedCostUsd, metadata = {},
            status = "identified", relatedTaskId } = req.body ?? {};

    if (!resourceType) return res.status(400).json({ error: "resourceType is required." });
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Resource name is required." });

    const addedBy = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;
    const doc = await Resource.create({
      projectId: req.params.projectId,
      resourceType,
      name: String(name).trim(),
      description, url, accessType,
      estimatedCostUsd: estimatedCostUsd != null ? Number(estimatedCostUsd) : null,
      metadata, status,
      relatedTaskId: relatedTaskId && mongoose.isValidObjectId(relatedTaskId) ? relatedTaskId : null,
      addedBy,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/resources/:resourceId ─────────────────────
router.patch("/projects/:projectId/resources/:resourceId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const ALLOWED = [
      "resourceType", "name", "description", "url", "accessType",
      "estimatedCostUsd", "metadata", "status", "relatedTaskId",
    ];
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const updated = await Resource.findOneAndUpdate(
      { _id: req.params.resourceId, projectId: req.params.projectId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!updated) return res.status(404).json({ error: "Resource not found." });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/resources/:resourceId ────────────────────
router.delete("/projects/:projectId/resources/:resourceId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const deleted = await Resource.findOneAndDelete({
      _id: req.params.resourceId,
      projectId: req.params.projectId,
    });
    if (!deleted) return res.status(404).json({ error: "Resource not found." });
    res.json({ ok: true, deletedId: req.params.resourceId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI CONVERSATIONS & MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/conversations ────────────────────────────────
router.get("/projects/:projectId/conversations", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const filter = { projectId: req.params.projectId };
    if (req.query.status) filter.status = req.query.status;

    const conversations = await AIConversation.find(filter).sort({ createdAt: -1 }).lean();
    res.json(conversations);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/conversations ───────────────────────────────
router.post("/projects/:projectId/conversations", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const { title = "New Conversation", topic = "general_assistance" } = req.body ?? {};
    const startedBy = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;

    const conv = await AIConversation.create({
      projectId: req.params.projectId,
      title: String(title).trim(),
      topic,
      startedBy,
    });
    res.status(201).json(conv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/projects/:projectId/conversations/:convId/messages ───────────────
// Returns messages in chronological order. Supports ?limit= and ?before= for pagination.
router.get("/projects/:projectId/conversations/:convId/messages", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const conv = await AIConversation.findOne({
      _id: req.params.convId,
      projectId: req.params.projectId,
    }).lean();
    if (!conv) return res.status(404).json({ error: "Conversation not found." });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const filter = { conversationId: req.params.convId };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

    const messages = await AIMessage.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    res.json({ conversation: conv, messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/conversations/:convId/messages ──────────────
// Add a message to a conversation. Also increments conversation.messageCount.
router.post("/projects/:projectId/conversations/:convId/messages", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const conv = await AIConversation.findOne({
      _id: req.params.convId,
      projectId: req.params.projectId,
    });
    if (!conv) return res.status(404).json({ error: "Conversation not found." });

    const { role = "user", content, contextSnapshot, toolAction, tokensUsed } = req.body ?? {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "Message content is required." });
    }
    if (!["user", "assistant", "system"].includes(role)) {
      return res.status(400).json({ error: "role must be 'user', 'assistant', or 'system'." });
    }

    const sentBy = role === "user" && mongoose.isValidObjectId(req.user?.id)
      ? req.user.id
      : null;

    const [message] = await Promise.all([
      AIMessage.create({
        conversationId: conv._id,
        projectId:      req.params.projectId,
        role,
        content: String(content).trim(),
        contextSnapshot: contextSnapshot ?? null,
        toolAction:      toolAction ?? null,
        tokensUsed:      tokensUsed ?? { prompt: null, completion: null, total: null },
        sentBy,
      }),
      // Increment denormalized message counter on the conversation
      AIConversation.updateOne({ _id: conv._id }, { $inc: { messageCount: 1 } }),
    ]);

    res.status(201).json(message);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT SUMMARY (convenient combined endpoint for dashboard)
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/summary ─────────────────────────────────────
// Returns project + counts of all sub-entities in one request.
// Used by the project dashboard to show progress overview without N queries.
router.get("/projects/:projectId/summary", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res);
    if (!project) return;

    const pid = req.params.projectId;
    const [
      taskCount, doneTaskCount,
      decisionCount, acceptedDecisionCount,
      researchCount, appliedResearchCount,
      recommendationCount, acceptedRecommendationCount,
      componentCount,
      resourceCount, integratedResourceCount,
      conversationCount,
    ] = await Promise.all([
      Task.countDocuments({ projectId: pid }),
      Task.countDocuments({ projectId: pid, status: "done" }),
      Decision.countDocuments({ projectId: pid }),
      Decision.countDocuments({ projectId: pid, status: "accepted" }),
      ResearchItem.countDocuments({ projectId: pid }),
      ResearchItem.countDocuments({ projectId: pid, status: "applied" }),
      Recommendation.countDocuments({ projectId: pid }),
      Recommendation.countDocuments({ projectId: pid, status: "accepted" }),
      ArchitectureComponent.countDocuments({ projectId: pid }),
      Resource.countDocuments({ projectId: pid }),
      Resource.countDocuments({ projectId: pid, status: "integrated" }),
      AIConversation.countDocuments({ projectId: pid }),
    ]);

    res.json({
      project,
      counts: {
        tasks: { total: taskCount, done: doneTaskCount },
        decisions: { total: decisionCount, accepted: acceptedDecisionCount },
        research: { total: researchCount, applied: appliedResearchCount },
        recommendations: { total: recommendationCount, accepted: acceptedRecommendationCount },
        architectureComponents: componentCount,
        resources: { total: resourceCount, integrated: integratedResourceCount },
        conversations: conversationCount,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: PROJECT INTELLIGENCE & ADVISOR ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/projects/:projectId/analyze ────────────────────────────────────
// Triggers structured AI / heuristic analysis of the project.
// Extracts domain, requirements, recommendations, decision candidates,
// research topics, and architecture components with duplicate prevention.
router.post("/projects/:projectId/analyze", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const result = await analyzeProject(req.params.projectId, req.body);
    res.json(result);
  } catch (e) {
    console.error("[POST /projects/:id/analyze] error:", e.message);
    res.status(500).json({ error: e.message || "Project analysis failed" });
  }
});

// ── GET /api/projects/:projectId/intelligence ────────────────────────────────
// Returns aggregated project intelligence snapshot (context, accepted decisions,
// pending decisions, recommendations, architecture, research, risks, and task stats).
router.get("/projects/:projectId/intelligence", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const context = await buildProjectContext(req.params.projectId);
    res.json({
      success: true,
      intelligence: context,
    });
  } catch (e) {
    console.error("[GET /projects/:id/intelligence] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to load project intelligence" });
  }
});

// ── GET /api/projects/:projectId/ai/conversation ────────────────────────────
// Fetches the user's active private Copilot conversation and message history.
router.get("/projects/:projectId/ai/conversation", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const userId = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;
    const query = { projectId: req.params.projectId, status: "active" };
    if (userId) query.startedBy = userId;

    let conversation = await AIConversation.findOne(query).sort({ updatedAt: -1 }).lean();
    if (!conversation) {
      return res.json({ conversation: null, messages: [] });
    }

    const messages = await AIMessage.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (e) {
    console.error("[GET /projects/:id/ai/conversation] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to load conversation" });
  }
});

// ── DELETE /api/projects/:projectId/ai/conversation ─────────────────────────
// Clears the authenticated user's private Copilot conversation for this project.
// Strictly deletes only the active user's AIConversation and AIMessages for [projectId + userId].
// Leaves project knowledge, brief, guidance, decisions, architecture, and team intact.
router.delete("/projects/:projectId/ai/conversation", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const userId = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;
    const query = { projectId: req.params.projectId };
    if (userId) query.startedBy = userId;

    const userConversations = await AIConversation.find(query).select("_id").lean();
    const convIds = userConversations.map((c) => c._id);

    if (convIds.length > 0) {
      await Promise.all([
        AIMessage.deleteMany({ conversationId: { $in: convIds } }),
        AIConversation.deleteMany({ _id: { $in: convIds } }),
      ]);
    }

    res.json({
      success: true,
      message: "Copilot conversation cleared successfully. Project intelligence and memory remain intact.",
    });
  } catch (e) {
    console.error("[DELETE /projects/:id/ai/conversation] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to clear conversation" });
  }
});

// ── POST /api/projects/:projectId/ai/chat ────────────────────────────────────
// Project-aware AI chat conversation endpoint.
// Injects project context, decisions, architecture, and recent conversation turns.
router.post("/projects/:projectId/ai/chat", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { message, conversationId } = req.body ?? {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const response = await chatWithProjectAdvisor({
      projectId: req.params.projectId,
      conversationId,
      message,
      user: req.user,
    });

    res.json({
      success: true,
      ...response,
    });
  } catch (e) {
    console.error("[POST /projects/:id/ai/chat] error:", e.message);
    res.status(500).json({ error: e.message || "Project chat advisory failed" });
  }
});

// ── POST /api/projects/:projectId/ai/messages/:messageId/feedback ────────────
// Records helpful/unhelpful rating on an assistant message.
router.post("/projects/:projectId/ai/messages/:messageId/feedback", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { rating, comment = "" } = req.body ?? {};
    if (!["helpful", "unhelpful", null].includes(rating)) {
      return res.status(400).json({ error: "Rating must be 'helpful', 'unhelpful', or null." });
    }

    const msg = await AIMessage.findOne({
      _id: req.params.messageId,
      projectId: req.params.projectId,
    });

    if (!msg) {
      return res.status(404).json({ error: "Message not found." });
    }

    msg.feedback = {
      rating,
      comment: String(comment).trim(),
      feedbackAt: new Date(),
    };
    await msg.save();

    res.json({
      success: true,
      messageId: msg._id,
      feedback: msg.feedback,
    });
  } catch (e) {
    console.error("[POST /projects/:id/ai/messages/:msgId/feedback] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to record feedback" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: PROJECT-AWARE TASK DECOMPOSITION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /api/projects/:projectId/tasks/generate ─────────────────────────────
// Generates project tasks using Phase 2 Project Intelligence context (accepted
// decisions, architecture components, recommendations, research topics, team skills).
// Supports modes: "project", "related", "missing_phases", "subtasks", "architecture", "research".
// Also supports previewOnly: true for reviewing proposed tasks before persisting.
router.post("/projects/:projectId/tasks/generate", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { mode = "project", prompt = "", taskId, phase, previewOnly = false } = req.body ?? {};

    const result = await decomposeTasksWithContext({
      projectId: req.params.projectId,
      teamId: project.teamId,
      mode,
      prompt,
      taskId,
      phase,
      previewOnly: Boolean(previewOnly),
      user: req.user,
    });

    res.json(result);
  } catch (e) {
    console.error("[POST /projects/:id/tasks/generate] error:", e.message);
    res.status(500).json({ error: e.message || "Task decomposition failed" });
  }
});

// ── POST /api/projects/:projectId/tasks/ai-suggest ───────────────────────────
// Project-aware AI autofill suggestion for the Create Task modal.
router.post("/projects/:projectId/tasks/ai-suggest", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { mode = "related", taskId } = req.body ?? {};

    const result = await decomposeTasksWithContext({
      projectId: req.params.projectId,
      teamId: project.teamId,
      mode,
      taskId,
      previewOnly: true,
      user: req.user,
    });

    const candidate = result.tasks?.[0] || null;
    if (!candidate) {
      return res.status(404).json({ error: "No suggestion could be generated." });
    }

    const dueInDays = Math.max(2, Math.round((candidate.estimatedHours || 4) / 2));
    const start = new Date();
    const due = new Date(Date.now() + dueInDays * 86_400_000);
    const reminder = new Date(due.getTime() - 86_400_000);
    reminder.setHours(9, 0, 0, 0);

    res.json({
      task: {
        title: candidate.title,
        description: candidate.description,
        category: candidate.category,
        urgency: candidate.urgency,
        impact: candidate.impact,
        estimatedHours: candidate.estimatedHours,
        businessValue: candidate.businessValue,
        skillWeights: candidate.skillWeights,
        startDate: start.toISOString(),
        dueDate: due.toISOString(),
        reminderAt: reminder.toISOString(),
      },
      explanation: {
        mode,
        reason: candidate.reason,
        domain: result.contextHighlights?.domain,
        acceptedDecisionsCount: result.contextHighlights?.acceptedDecisionsCount,
      },
    });
  } catch (e) {
    console.error("[POST /projects/:id/tasks/ai-suggest] error:", e.message);
    res.status(500).json({ error: e.message || "AI suggestion failed" });
  }
});

export default router;

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 12: TEAM HEALTH ENGINE
// =============================================================================

// GET /api/projects/:projectId/team-health
router.get("/projects/:projectId/team-health", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const existing = await TeamHealth.findOne({ projectId }).sort({ createdAt: -1 }).lean();
    if (existing) return res.json({ health: existing });
    const health = await computeTeamHealth(projectId);
    res.json({ health });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/team-health/refresh
router.post("/projects/:projectId/team-health/refresh", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const health = await computeTeamHealth(projectId);
    const io = req.app.get("io");
    if (io) broadcastHealthUpdate(io, projectId, { health });
    res.json({ health });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 13: RISK INTELLIGENCE ENGINE
// =============================================================================

// GET /api/projects/:projectId/risks
router.get("/projects/:projectId/risks", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { status = "open" } = req.query;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const filter = { projectId };
    if (status !== "all") filter.status = status;
    const risks = await Risk.find(filter).sort({ severity: 1, createdAt: -1 }).lean();
    res.json({ risks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/risks/scan
router.post("/projects/:projectId/risks/scan", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const risks = await scanProjectRisks(projectId);
    const io = req.app.get("io");
    if (io) broadcastRiskUpdate(io, projectId, { action: "scan", risks });
    res.json({ risks, count: risks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/projects/:projectId/risks/:riskId
router.patch("/projects/:projectId/risks/:riskId", requireAuth, async (req, res) => {
  const { projectId, riskId } = req.params;
  const { status } = req.body;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(riskId)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  if (!["acknowledged", "resolved"].includes(status)) {
    return res.status(400).json({ error: "status must be acknowledged or resolved" });
  }
  try {
    const updates = { status };
    if (status === "resolved") {
      updates.resolvedBy = req.user.id;
      updates.resolvedAt = new Date();
    }
    const risk = await Risk.findOneAndUpdate({ _id: riskId, projectId }, { $set: updates }, { new: true });
    if (!risk) return res.status(404).json({ error: "risk_not_found" });
    const io = req.app.get("io");
    if (io) broadcastRiskUpdate(io, projectId, { risk });
    res.json({ risk });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 14: OPINION + DECISION SYSTEM
// =============================================================================

// GET /api/projects/:projectId/opinions
router.get("/projects/:projectId/opinions", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const opinions = await Opinion.find({ projectId }).sort({ createdAt: -1 }).lean();
    res.json({ opinions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/opinions
router.post("/projects/:projectId/opinions", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { question, options, deadline } = req.body;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: "question and at least 2 options required" });
  }
  try {
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "project_not_found" });
    const opinion = await Opinion.create({
      projectId,
      teamId: project.teamId,
      createdBy: req.user.id,
      question,
      options,
      deadline: deadline || null,
    });
    const io = req.app.get("io");
    if (io) broadcastOpinionUpdate(io, projectId, { action: "create", opinion });
    res.status(201).json({ opinion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/opinions/:opinionId/respond
router.post("/projects/:projectId/opinions/:opinionId/respond", requireAuth, async (req, res) => {
  const { projectId, opinionId } = req.params;
  const { option, reasoning } = req.body;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(opinionId)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  if (!option) return res.status(400).json({ error: "option is required" });
  try {
    const opinion = await Opinion.findOneAndUpdate(
      { _id: opinionId, projectId, status: "open" },
      {
        $push: {
          responses: {
            userId: req.user.id,
            userName: req.user.name || "Team Member",
            option,
            reasoning: reasoning || "",
          },
        },
      },
      { new: true }
    );
    if (!opinion) return res.status(404).json({ error: "opinion_not_found_or_closed" });
    const io = req.app.get("io");
    if (io) broadcastOpinionUpdate(io, projectId, { action: "response", opinionId });
    res.json({ opinion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/opinions/:opinionId/decide
router.post("/projects/:projectId/opinions/:opinionId/decide", requireAuth, async (req, res) => {
  const { projectId, opinionId } = req.params;
  const { selectedOption, reasoning } = req.body;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(opinionId)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  if (!selectedOption) return res.status(400).json({ error: "selectedOption required" });
  try {
    const opinion = await Opinion.findOne({ _id: opinionId, projectId });
    if (!opinion) return res.status(404).json({ error: "opinion_not_found" });

    const decision = await Decision.create({
      projectId,
      title: `Team consensus: ${opinion.question.slice(0, 80)}`,
      decision: selectedOption,
      selectedOption,
      reasoning: reasoning || opinion.aiAnalysis?.reasoning || "",
      status: "accepted",
      category: "process",
    });

    opinion.status = "decided";
    opinion.finalDecisionId = decision._id;
    await opinion.save();

    const io = req.app.get("io");
    if (io) broadcastOpinionUpdate(io, projectId, { action: "decided", opinionId, opinion });
    if (io) broadcastDecisionUpdate(io, projectId, { action: "create", decision });
    res.status(201).json({ decision, opinion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 15: AI SPRINT RETROSPECTIVE
// =============================================================================

// POST /api/projects/:projectId/retrospectives
router.post("/projects/:projectId/retrospectives", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const { sprintName, period } = req.body;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  if (!sprintName) return res.status(400).json({ error: "sprintName is required" });
  try {
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "project_not_found" });
    const retro = await generateRetrospective({ projectId, teamId: project.teamId, sprintName, period });
    const io = req.app.get("io");
    if (io) broadcastRetrospectiveUpdate(io, projectId, { action: "create", retrospective: retro });
    res.status(201).json({ retrospective: retro });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:projectId/retrospectives
router.get("/projects/:projectId/retrospectives", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const retros = await Retrospective.find({ projectId }).sort({ createdAt: -1 }).lean();
    res.json({ retrospectives: retros });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:projectId/retrospectives/:retroId
router.get("/projects/:projectId/retrospectives/:retroId", requireAuth, async (req, res) => {
  const { projectId, retroId } = req.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(retroId)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  try {
    const retro = await Retrospective.findOne({ _id: retroId, projectId }).lean();
    if (!retro) return res.status(404).json({ error: "retrospective_not_found" });
    res.json({ retrospective: retro });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/projects/:projectId/retrospectives/:retroId/acknowledge
router.patch("/projects/:projectId/retrospectives/:retroId/acknowledge", requireAuth, async (req, res) => {
  const { projectId, retroId } = req.params;
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(retroId)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  try {
    const retro = await Retrospective.findOneAndUpdate(
      { _id: retroId, projectId },
      { $addToSet: { acknowledgedBy: req.user.id } },
      { new: true }
    );
    if (!retro) return res.status(404).json({ error: "retrospective_not_found" });
    res.json({ retrospective: retro });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 16: LEARNING LOOP
// =============================================================================

// GET /api/projects/:projectId/insights
router.get("/projects/:projectId/insights", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const insights = await LearningInsight.find({ projectId, isStale: false }).sort({ confidence: -1 }).lean();
    res.json({ insights });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/insights/generate
router.post("/projects/:projectId/insights/generate", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "project_not_found" });
    const insights = await generateInsights(projectId, project.teamId);
    res.json({ insights });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 17: PROJECT BRAIN RAG CONTEXT
// =============================================================================

// GET /api/projects/:projectId/brain
router.get("/projects/:projectId/brain", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
    const brain = await buildProjectBrainContext(projectId, req.user.id);
    if (!brain) return res.status(404).json({ error: "project_not_found" });
    const serialized = serializeBrainForPrompt(brain);
    res.json({ brain, serialized });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


