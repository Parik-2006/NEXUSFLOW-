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

const router = Router();

// ── Helper: verify project exists and return it ─────────────────────────────
async function findProject(projectId, res) {
  if (!mongoose.isValidObjectId(projectId)) {
    res.status(400).json({ error: "invalid_project_id" });
    return null;
  }
  const project = await Project.findById(projectId).lean();
  if (!project) {
    res.status(404).json({ error: "project_not_found" });
    return null;
  }
  return project;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CRUD
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects ─────────────────────────────────────────────────────────
// List all projects. Optional query param: ?teamId= to filter by team.
router.get("/projects", requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.teamId && mongoose.isValidObjectId(req.query.teamId)) {
      filter.teamId = req.query.teamId;
    }
    const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects ────────────────────────────────────────────────────────
// Create a new project.
// Body: { teamId (required), title, description, originalPrompt, domain,
//         projectType, academicContext, teamSize, sprintWeeks, context? }
//
// TEAM RELATIONSHIP:
// When a project is created, Team.activeProjectId is updated to point to
// the new project (if the team didn't already have an active project).
// The Team's projectTitle/projectDescription are NOT modified — they remain
// as the legacy fallback for existing algorithms.
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

export default router;
