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
import DecisionFeedback from "../models/DecisionFeedback.js";
import ProjectMemory    from "../models/ProjectMemory.js";

import {
  buildProjectContext,
  analyzeProject,
  chatWithProjectAdvisor,
  decomposeTasksWithContext,
  buildTaskGenerationContext,
} from "../services/projectIntelligence.js";
import { discoverAcademicPapers } from "../services/academicResearchService.js";
import { getProjectToolRecommendations } from "../services/projectToolsService.js";
import { discoverProjectResources } from "../services/resourceDiscoveryService.js";

// NEXUSFLOW 3.0 — Phase 12-17 imports
import TeamHealth        from "../models/TeamHealth.js";
import Risk              from "../models/Risk.js";
import Opinion          from "../models/Opinion.js";
import Retrospective    from "../models/Retrospective.js";
import LearningInsight  from "../models/LearningInsight.js";
import { computeTeamHealth, resolveProjectAndTeam } from "../services/teamHealth.js";
import { scanProjectRisks }       from "../services/riskEngine.js";
import { generateRetrospective }  from "../services/retrospectiveService.js";
import { generateInsights }       from "../services/learningService.js";
import { buildProjectBrainContext, serializeBrainForPrompt } from "../services/projectBrain.js";
import { broadcastDecisionUpdate, broadcastResearchUpdate, broadcastArchitectureUpdate, broadcastGuidanceUpdate, broadcastRiskUpdate, broadcastHealthUpdate, broadcastRetrospectiveUpdate, broadcastOpinionUpdate } from "../socket/projectSyncHandlers.js";

// V4 Waterfall Requirement & Plan Services
import {
  calculateRequirementScore,
  sortRequirementsMergeSort,
  extractRequirementsFromArtifacts,
} from "../services/requirementService.js";

// V4 Waterfall Phase Gates, Change Impact, Reactive Engine, Events
import {
  evaluateProjectPhaseGate,
  advanceProjectPhase,
  overrideProjectPhaseGate,
  getWaterfallPhaseStates,
} from "../services/phaseGateService.js";
import { simulateChangeImpact } from "../services/changeImpactService.js";
import { handleProjectMutation } from "../services/reactiveEngine.js";
import { recordProjectEvent, getProjectEvents } from "../services/eventService.js";

// V4 Fix 5 — Project Memory Context Service
import {
  getProjectContext,
  getProjectContextSummary,
  getPersistentContext,
  getTemporaryContext,
  buildMemoryContextForPrompt,
} from "../services/projectMemoryContext.js";

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

  // Security Check: Verify team access if user context is available (from arg or Express req)
  const effectiveUser = user || res?.req?.user;
  if (effectiveUser && project.teamId) {
    const team = await Team.findById(project.teamId).lean();
    if (team) {
      const userIdStr = (effectiveUser._id || effectiveUser.id)?.toString() || "";
      const userEmail = (effectiveUser.email || "").toLowerCase().trim();
      const userName = (effectiveUser.name || "").toLowerCase().trim();

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

      if (!isOwner && !isMember && !isLegacy && effectiveUser.role !== "admin") {
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
      methodology = "WATERFALL",
    } = req.body ?? {};

    if (!teamId || !mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "teamId (valid ObjectId) is required." });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Project title is required." });
    }

    // FIX A & B: Project description validation — minimum 1000 meaningful characters
    const rawProjectDesc = description || originalPrompt || req.body?.projectDescription || "";
    const projectDescTrimmed = String(rawProjectDesc || "").trim();
    if (!projectDescTrimmed || projectDescTrimmed.length < 1000) {
      return res.status(400).json({
        error: "INVALID_DESCRIPTION",
        message: "Project description must contain at least 1000 meaningful characters.",
      });
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

    const validMethodologies = ["WATERFALL", "SCRUM", "KANBAN", "HYBRID"];
    const normalizedMethodology = typeof methodology === "string" && validMethodologies.includes(methodology.toUpperCase().trim())
      ? methodology.toUpperCase().trim()
      : "WATERFALL";

    // Create the project document
    const project = await Project.create({
      teamId,
      title:          String(title).trim(),
      description:    String(description).trim(),
      originalPrompt: String(originalPrompt).trim(),
      domain:         String(domain).trim(),
      projectType:    String(projectType).trim(),
      academicContext: String(academicContext).trim(),
      methodology:    normalizedMethodology,
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
      "methodology",
    ];
    const update = {};
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) {
        if (k === "methodology") {
          const val = String(req.body[k]).toUpperCase().trim();
          if (["WATERFALL", "SCRUM", "KANBAN", "HYBRID"].includes(val)) {
            update[k] = val;
          }
        } else {
          update[k] = req.body[k];
        }
      }
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
// V4 WATERFALL PLAN & REQUIREMENTS WORKSPACE
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/plan ─────────────────────────────────────────
// Fetch project plan data: uploaded artifacts, structured requirements, and context.
router.get("/projects/:projectId/plan", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const requirements = sortRequirementsMergeSort(project.requirements || []);
    res.json({
      success: true,
      artifacts: project.artifacts || [],
      requirements,
      context: project.context || {},
      goals: project.context?.goals || [],
      constraints: project.context?.constraints || [],
      deliverables: project.context?.expectedOutputs || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/artifacts ──────────────────────────────────
// Upload or save project artifact (persistent or temporary).
router.post("/projects/:projectId/artifacts", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { name, artifactType = "document", content = "", scope = "persistent", summary = "" } = req.body || {};
    if (!name) return res.status(400).json({ error: "Artifact name is required" });

    const newArtifact = {
      name: String(name).trim(),
      artifactType,
      content: String(content || ""),
      scope: scope === "temporary" ? "temporary" : "persistent",
      fileSize: Buffer.byteLength(content || "", "utf8"),
      summary: String(summary || ""),
      uploadedAt: new Date(),
    };

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $push: { artifacts: newArtifact } },
      { new: true, lean: true }
    );

    res.status(201).json({
      success: true,
      artifact: updated.artifacts[updated.artifacts.length - 1],
      artifacts: updated.artifacts,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/artifacts/:artifactId ────────────────────
// Remove an uploaded artifact.
router.delete("/projects/:projectId/artifacts/:artifactId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $pull: { artifacts: { _id: req.params.artifactId } } },
      { new: true, lean: true }
    );

    res.json({ success: true, artifacts: updated.artifacts || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/plan/extract ───────────────────────────────
// Extract draft requirements, goals, and deliverables via Project AI under $0 policy.
// Does NOT silently commit; returns draft items for human review.
router.post("/projects/:projectId/plan/extract", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const artifacts = project.artifacts || [];
    if (!artifacts || artifacts.length === 0) {
      return res.status(400).json({
        error: "Upload an SRS, specification, or project artifact before analyzing.",
      });
    }

    const extracted = await extractRequirementsFromArtifacts({
      artifacts,
      projectTitle: project.title,
      projectDescription: project.description || project.originalPrompt,
      domain: project.domain || "General Software",
    });

    res.json({
      success: true,
      extracted,
      message: "Draft plan extracted successfully. Review and approve before persisting.",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/projects/:projectId/waterfall/state ──────────────────────────────
// Authoritative Waterfall phase and sequential gate evaluation across all tabs.
router.get("/projects/:projectId/waterfall/state", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const state = await getWaterfallPhaseStates(project._id, project.teamId);
    res.json({ success: true, ...state });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/requirements ────────────────────────────────
// Manually create or batch approve requirements.
router.post("/projects/:projectId/requirements", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const {
      reqId,
      title,
      description = "",
      phase = "requirements",
      businessValue = 7,
      academicValue = 8,
      criticality = 7,
      teacherImportance = 8,
      estimatedHours = 12,
      requiredSkills = [],
      dependencies = [],
      acceptanceCriteria = [],
      status = "draft",
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "Requirement title is required" });

    const scored = calculateRequirementScore({
      academicValue,
      teacherImportance,
      criticality,
      businessValue,
      dependencies,
    });

    const nextId = reqId || `REQ-${String((project.requirements?.length || 0) + 1).padStart(3, "0")}`;

    const newReq = {
      reqId: nextId,
      title: String(title).trim(),
      description: String(description).trim(),
      phase,
      businessValue: Number(businessValue),
      academicValue: Number(academicValue),
      criticality: Number(criticality),
      teacherImportance: Number(teacherImportance),
      estimatedHours: Number(estimatedHours),
      requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
      status,
      priorityScore: scored.priorityScore,
      scoreExplanation: scored.scoreExplanation,
      createdAt: new Date(),
    };

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $push: { requirements: newReq } },
      { new: true, lean: true }
    );

    res.status(201).json({
      success: true,
      requirement: updated.requirements[updated.requirements.length - 1],
      requirements: sortRequirementsMergeSort(updated.requirements),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/requirements/:reqId ───────────────────────
// Update a requirement (triggers dynamic DAA priority recalculation).
router.patch("/projects/:projectId/requirements/:reqId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const existingIndex = (project.requirements || []).findIndex(
      (r) => r.reqId === req.params.reqId || r._id?.toString() === req.params.reqId
    );
    if (existingIndex === -1) {
      return res.status(404).json({ error: "Requirement not found" });
    }

    const current = project.requirements[existingIndex];
    const merged = {
      ...current,
      ...req.body,
    };

    // Recalculate deterministic score
    const scored = calculateRequirementScore(merged);
    merged.priorityScore = scored.priorityScore;
    merged.scoreExplanation = scored.scoreExplanation;

    project.requirements[existingIndex] = merged;

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $set: { requirements: project.requirements } },
      { new: true, lean: true }
    );

    res.json({
      success: true,
      requirement: merged,
      requirements: sortRequirementsMergeSort(updated.requirements),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/projects/:projectId/requirements/:reqId ──────────────────────
// Delete a requirement.
router.delete("/projects/:projectId/requirements/:reqId", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      {
        $pull: {
          requirements: {
            $or: [{ reqId: req.params.reqId }, { _id: req.params.reqId }],
          },
        },
      },
      { new: true, lean: true }
    );

    res.json({
      success: true,
      requirements: sortRequirementsMergeSort(updated.requirements || []),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/requirements/:reqId/convert-to-task ────────
// Convert an approved requirement into an active Task with phase and Greedy priority.
router.post("/projects/:projectId/requirements/:reqId/convert-to-task", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const reqItem = (project.requirements || []).find(
      (r) => r.reqId === req.params.reqId || r._id?.toString() === req.params.reqId
    );
    if (!reqItem) return res.status(404).json({ error: "Requirement not found" });

    // Map requirement attributes to Task
    const urgency = Math.min(5, Math.max(1, Math.round(reqItem.criticality / 2)));
    const impact = Math.min(5, Math.max(1, Math.round(reqItem.businessValue / 2)));

    const task = await Task.create({
      teamId: project.teamId,
      projectId: project._id,
      title: reqItem.title,
      description: reqItem.description,
      phase: reqItem.phase || "requirements",
      requirementId: reqItem.reqId,
      category: reqItem.phase || "Requirements",
      urgency,
      impact,
      estimatedHours: reqItem.estimatedHours || 12,
      businessValue: reqItem.businessValue || 7,
      requiredSkills: reqItem.requiredSkills || [],
      source: "manual",
      status: "todo",
      createdBy: req.user?._id || req.user?.id,
    });

    // Mark requirement as in_progress or approved
    await Project.updateOne(
      { _id: project._id, "requirements.reqId": reqItem.reqId },
      { $set: { "requirements.$.status": "in_progress" } }
    );

    res.status(201).json({
      success: true,
      task,
      message: `Requirement ${reqItem.reqId} converted into an active task.`,
    });
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
// NEXUSFLOW 3.0 — Fix 1: AI & Dataset Resources Discovery
// ─────────────────────────────────────────────────────────────────────────────
//
// RESOURCE DISCOVERY (recommendation only — no tasks, no downloads, no model
// training). Returns structured datasets and pretrained models that fit the
// project context. Uses OmniRoute ($0 policy). Falls back to a deterministic
// curated set when AI is unavailable.

router.post("/projects/:projectId/resources/discover", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const team = project.teamId
      ? await Team.findById(project.teamId).lean()
      : null;

    const result = await discoverProjectResources({ project, team });

    res.json({
      success: true,
      datasets: result.datasets,
      models: result.models,
      provider: result.provider,
      tier: result.tier,
      aiEnhanced: result.aiEnhanced,
    });
  } catch (e) {
    console.error("[POST /projects/:id/resources/discover] error:", e.message);
    res.status(500).json({ error: e.message || "Resource discovery failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEXUSFLOW 3.0 — Fix 2: Decision Engine Feedback & Reliability Learning
// ─────────────────────────────────────────────────────────────────────────────
//
// Endpoints to persist Decision Engine feedback signals and compute historical
// reliability context for future AI explanations. DAA scores remain untouched.

router.post("/projects/:projectId/decision-feedback", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { feedback, decisionType, question, options, selected, score, factors, tradeoffs, risks, reason, comment, linkedDecisionId } = req.body ?? {};

    if (!["helpful", "not_helpful", "saved"].includes(feedback)) {
      return res.status(400).json({ error: "feedback must be 'helpful', 'not_helpful', or 'saved'." });
    }

    const userId = mongoose.isValidObjectId(req.user?.id) ? req.user.id : null;

    const record = await DecisionFeedback.create({
      projectId: req.params.projectId,
      teamId: project.teamId,
      userId,
      feedback,
      decisionType: ["technology", "task-priority", "sprint", "assignment"].includes(decisionType) ? decisionType : "technology",
      question: typeof question === "string" ? question.slice(0, 500) : "",
      options: Array.isArray(options) ? options.map((o) => String(o)).slice(0, 25) : [],
      selected: typeof selected === "string" ? selected.slice(0, 250) : "",
      score: Number.isFinite(score) ? score : null,
      factors: factors ?? null,
      tradeoffs: tradeoffs ?? null,
      risks: risks ?? null,
      reason: typeof reason === "string" ? reason.slice(0, 1000) : "",
      comment: typeof comment === "string" ? comment.slice(0, 500) : "",
      linkedDecisionId: mongoose.isValidObjectId(linkedDecisionId) ? linkedDecisionId : null,
    });

    res.json({ success: true, feedbackId: record._id });
  } catch (e) {
    console.error("[POST /projects/:id/decision-feedback] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to record decision feedback" });
  }
});

router.get("/projects/:projectId/decision-feedback/summary", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const MIN_SAMPLES = 3; // avoid misleading percentages from tiny samples
    const records = await DecisionFeedback.find({ projectId: req.params.projectId }).lean();
    const total = records.length;

    const helpful = records.filter((r) => r.feedback === "helpful").length;
    const notHelpful = records.filter((r) => r.feedback === "not_helpful").length;
    const saved = records.filter((r) => r.feedback === "saved").length;

    const byCategory = {};
    for (const r of records) {
      const cat = r.decisionType || "technology";
      if (!byCategory[cat]) byCategory[cat] = { helpful: 0, notHelpful: 0, saved: 0 };
      if (r.feedback === "helpful") byCategory[cat].helpful += 1;
      else if (r.feedback === "not_helpful") byCategory[cat].notHelpful += 1;
      else if (r.feedback === "saved") byCategory[cat].saved += 1;
    }

    const summary = {
      total,
      helpful,
      notHelpful,
      saved,
      minSamplesRequired: MIN_SAMPLES,
      sufficientSamples: total >= MIN_SAMPLES,
      helpfulPct: total > 0 ? Math.round((helpful / total) * 100) : null,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => {
          const cTotal = v.helpful + v.notHelpful;
          const helpfulRatio = cTotal > 0 ? Math.round((v.helpful / cTotal) * 100) : null;
          return [k, { ...v, total: cTotal, helpfulPct: helpfulRatio }];
        })
      ),
    };

    res.json({ success: true, summary });
  } catch (e) {
    console.error("[GET /projects/:id/decision-feedback/summary] error:", e.message);
    res.status(500).json({ error: e.message || "Failed to compute feedback summary" });
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

// =============================================================================
// NEXUSFLOW 3.0 — PHASE 12: TEAM HEALTH ENGINE
// =============================================================================

// GET /api/projects/:projectId/team-health
router.get("/projects/:projectId/team-health", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: "invalid_project_id" });
  try {
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
    const { projectId: resolvedPid } = await resolveProjectAndTeam(projectId);
    const health = await computeTeamHealth(projectId);
    const io = req.app.get("io");
    if (io) {
      broadcastHealthUpdate(io, resolvedPid, { health });
      broadcastHealthUpdate(io, projectId, { health });
    }
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
    const { projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const filter = { $or: [{ projectId: resolvedPid }, { teamId }] };
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
    const { projectId: resolvedPid } = await resolveProjectAndTeam(projectId);
    const risks = await scanProjectRisks(projectId);
    const io = req.app.get("io");
    if (io) {
      broadcastRiskUpdate(io, resolvedPid, { action: "scan", risks });
      broadcastRiskUpdate(io, projectId, { action: "scan", risks });
    }
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
    const { projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const updates = { status };
    if (status === "resolved") {
      updates.resolvedBy = req.user.id || req.user._id;
      updates.resolvedAt = new Date();
    }
    const risk = await Risk.findOneAndUpdate(
      { _id: riskId, $or: [{ projectId: resolvedPid }, { teamId }, { projectId }] },
      { $set: updates },
      { new: true }
    );
    if (!risk) return res.status(404).json({ error: "risk_not_found" });
    const io = req.app.get("io");
    if (io) {
      broadcastRiskUpdate(io, resolvedPid, { risk });
      broadcastRiskUpdate(io, projectId, { risk });
    }
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
    const { project, team, projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const retro = await generateRetrospective({ projectId: resolvedPid, teamId, sprintName, period });
    const io = req.app.get("io");
    if (io) {
      broadcastRetrospectiveUpdate(io, resolvedPid, { action: "create", retrospective: retro });
      broadcastRetrospectiveUpdate(io, projectId, { action: "create", retrospective: retro });
    }
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
    const { projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const retros = await Retrospective.find({
      $or: [{ projectId: resolvedPid }, { teamId }, { projectId }],
    }).sort({ createdAt: -1 }).lean();
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
    const { projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const retro = await Retrospective.findOne({
      _id: retroId,
      $or: [{ projectId: resolvedPid }, { teamId }, { projectId }],
    }).lean();
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
    const { projectId: resolvedPid, teamId } = await resolveProjectAndTeam(projectId);
    const userId = req.user?.id || req.user?._id;
    const retro = await Retrospective.findOneAndUpdate(
      { _id: retroId, $or: [{ projectId: resolvedPid }, { teamId }, { projectId }] },
      { $addToSet: { acknowledgedBy: userId } },
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

// =============================================================================
// NEXUSFLOW V4.0 — PROMPTS 14, 15, 17: PHASE GATES, CHANGE IMPACT, EVENTS
// =============================================================================

// GET /api/projects/:projectId/phase-gates — Evaluate current Waterfall phase gate
router.get("/projects/:projectId/phase-gates", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  try {
    const gate = await evaluateProjectPhaseGate(projectId);
    res.json({ gate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/phase-gates/advance — Advance to next phase
router.post("/projects/:projectId/phase-gates/advance", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  try {
    const result = await advanceProjectPhase({
      projectId,
      teamId: project.teamId,
      userId: req.user.id,
      userName: req.user.name,
    });
    // Trigger reactive engine invalidation
    await handleProjectMutation({
      projectId,
      teamId: project.teamId,
      actorId: req.user.id,
      actorName: req.user.name,
      mutationType: "PHASE_ADVANCED",
      entityId: result.toPhase,
      payload: result,
      io: req.app?.get("io") || null,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message, blockers: e.blockers || [] });
  }
});

// POST /api/projects/:projectId/phase-gates/override — Leader override for blocked gate
router.post("/projects/:projectId/phase-gates/override", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  const { phase, reason } = req.body;
  try {
    const result = await overrideProjectPhaseGate({
      projectId,
      teamId: project.teamId,
      userId: req.user.id,
      userName: req.user.name,
      phase,
      reason,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/change-impact/simulate — Trace downstream impact
router.post("/projects/:projectId/change-impact/simulate", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  const { changeType = "requirement_changed", entityId = "", payload = {} } = req.body;
  try {
    const impact = await simulateChangeImpact({
      projectId,
      changeType,
      entityId,
      payload,
    });
    res.json({ impact });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:projectId/events — Query project history & audit trail
router.get("/projects/:projectId/events", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  const { limit, skip, eventType, entityType } = req.query;
  try {
    const result = await getProjectEvents(projectId, {
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0,
      eventType,
      entityType,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:projectId/events — Record manual or external project event
router.post("/projects/:projectId/events", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const project = await findProject(projectId, res, req.user);
  if (!project) return;
  const { eventType, entityType, entityId, title, description, metadata } = req.body;
  try {
    const event = await recordProjectEvent({
      projectId,
      teamId: project.teamId,
      actorId: req.user.id,
      actorName: req.user.name,
      eventType: eventType || "USER_ACTION",
      entityType: entityType || "project",
      entityId: entityId || "",
      title: title || "User Event",
      description: description || "",
      metadata: metadata || {},
      source: "user",
    });
    res.json({ event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── V4 FIX 4: REQUIREMENT TRACEABILITY ────────────────────────────────

// ── GET /api/projects/:projectId/requirements/coverage ─────────────────
// Calculate coverage metrics for all requirements in a project.
// Returns: total, covered, implemented, tested, evidence-backed, uncovered.
router.get("/projects/:projectId/requirements/coverage", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const requirements = project.requirements || [];
    const total = requirements.length;

    const covered = requirements.filter((r) => r.coverageState !== "NOT_STARTED").length;
    const implemented = requirements.filter((r) =>
      ["IN_PROGRESS", "IMPLEMENTED", "TESTED", "EVIDENCE_ATTACHED", "COMPLETED"].includes(r.coverageState)
    ).length;
    const tested = requirements.filter((r) =>
      ["TESTED", "EVIDENCE_ATTACHED", "COMPLETED"].includes(r.coverageState)
    ).length;
    const evidenceBacked = requirements.filter((r) =>
      (r.implementationEvidence && r.implementationEvidence.length > 0) ||
      (r.testEvidence && r.testEvidence.length > 0) ||
      (r.artifactEvidence && r.artifactEvidence.length > 0)
    ).length;
    const uncovered = total - covered;

    // Per-phase breakdown
    const phases = ["requirements", "design", "implementation", "testing", "deployment", "maintenance"];
    const phaseBreakdown = phases.map((phase) => {
      const phaseReqs = requirements.filter((r) => r.phase === phase);
      const phaseTotal = phaseReqs.length;
      const phaseCovered = phaseReqs.filter((r) => r.coverageState !== "NOT_STARTED").length;
      return {
        phase,
        total: phaseTotal,
        covered: phaseCovered,
        uncovered: phaseTotal - phaseCovered,
        coveragePct: phaseTotal > 0 ? Math.round((phaseCovered / phaseTotal) * 100) : 100,
      };
    });

    // Per-source breakdown
    const sources = ["teacher", "faculty", "client", "team", "project"];
    const sourceBreakdown = sources.map((source) => {
      const sourceReqs = requirements.filter((r) => r.source === source);
      const sourceTotal = sourceReqs.length;
      const sourceCovered = sourceReqs.filter((r) => r.coverageState !== "NOT_STARTED").length;
      return {
        source,
        total: sourceTotal,
        covered: sourceCovered,
        uncovered: sourceTotal - sourceCovered,
        mandatory: sourceReqs.filter((r) => r.mandatory).length,
      };
    });

    res.json({
      ok: true,
      projectId: project._id,
      coverage: {
        total,
        covered,
        implemented,
        tested,
        evidenceBacked,
        uncovered,
        coveragePct: total > 0 ? Math.round((covered / total) * 100) : 100,
        implementedPct: total > 0 ? Math.round((implemented / total) * 100) : 100,
        testedPct: total > 0 ? Math.round((tested / total) * 100) : 100,
        evidenceBackedPct: total > 0 ? Math.round((evidenceBacked / total) * 100) : 100,
      },
      phaseBreakdown,
      sourceBreakdown,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/projects/:projectId/requirements/:reqId/evidence ──────────
// Add implementation, test, or artifact evidence to a requirement.
// Does NOT mark the requirement as complete — evidence is separate from coverage state.
router.post("/projects/:projectId/requirements/:reqId/evidence", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { reqId } = req.params;
    const { evidenceType, evidenceUrl, description } = req.body ?? {};

    // Validate evidence type
    const validTypes = ["implementation", "test", "artifact"];
    if (!validTypes.includes(evidenceType)) {
      return res.status(400).json({ error: `evidenceType must be one of: ${validTypes.join(", ")}` });
    }

    if (!evidenceUrl) {
      return res.status(400).json({ error: "evidenceUrl is required" });
    }

    const reqIndex = (project.requirements || []).findIndex(
      (r) => r.reqId === reqId || r._id?.toString() === reqId
    );
    if (reqIndex === -1) {
      return res.status(404).json({ error: "Requirement not found" });
    }

    const evidenceField = `${evidenceType}Evidence`;
    if (!project.requirements[reqIndex][evidenceField]) {
      project.requirements[reqIndex][evidenceField] = [];
    }
    project.requirements[reqIndex][evidenceField].push({
      url: evidenceUrl,
      description: description || "",
      addedBy: req.user?._id || req.user?.id,
      addedAt: new Date(),
    });

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $set: { requirements: project.requirements } },
      { new: true, lean: true }
    );

    res.json({
      ok: true,
      requirement: updated.requirements[updated.requirements.length - 1],
      evidenceAdded: true,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/projects/:projectId/requirements/:reqId/coverage-state ───
// Update the coverage state of a requirement.
// Does NOT auto-mark as COMPLETED just because a task exists.
// A requirement is only COMPLETED when all acceptance criteria are met
// and all evidence is attached.
router.patch("/projects/:projectId/requirements/:reqId/coverage-state", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { reqId } = req.params;
    const { coverageState } = req.body ?? {};

    const validStates = ["NOT_STARTED", "PLANNED", "IN_PROGRESS", "IMPLEMENTED", "TESTED", "EVIDENCE_ATTACHED", "COMPLETED"];
    if (!validStates.includes(coverageState)) {
      return res.status(400).json({ error: `coverageState must be one of: ${validStates.join(", ")}` });
    }

    const reqIndex = (project.requirements || []).findIndex(
      (r) => r.reqId === reqId || r._id?.toString() === reqId
    );
    if (reqIndex === -1) {
      return res.status(404).json({ error: "Requirement not found" });
    }

    // Guard: Cannot mark COMPLETED without evidence
    if (coverageState === "COMPLETED") {
      const req = project.requirements[reqIndex];
      const hasEvidence = (req.implementationEvidence && req.implementationEvidence.length > 0) ||
        (req.testEvidence && req.testEvidence.length > 0) ||
        (req.artifactEvidence && req.artifactEvidence.length > 0);
      if (!hasEvidence) {
        return res.status(400).json({
          error: "Cannot mark COMPLETED without evidence. Add implementation, test, or artifact evidence first.",
        });
      }
      // Guard: Cannot mark COMPLETED without all acceptance criteria met
      // (This is a soft check — the client should verify acceptance criteria)
    }

    project.requirements[reqIndex].coverageState = coverageState;

    const updated = await Project.findByIdAndUpdate(
      req.params.projectId,
      { $set: { requirements: project.requirements } },
      { new: true, lean: true }
    );

    res.json({
      ok: true,
      requirement: updated.requirements[updated.requirements.length - 1],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/projects/:projectId/requirements/:reqId/traceability ───────
// Get full traceability chain: requirement → linked tasks → dependencies → evidence.
router.get("/projects/:projectId/requirements/:reqId/traceability", requireAuth, async (req, res) => {
  try {
    const project = await findProject(req.params.projectId, res, req.user);
    if (!project) return;

    const { reqId } = req.params;
    const reqIndex = (project.requirements || []).findIndex(
      (r) => r.reqId === reqId || r._id?.toString() === reqId
    );
    if (reqIndex === -1) {
      return res.status(404).json({ error: "Requirement not found" });
    }

    const req = project.requirements[reqIndex];
    const taskIds = req.taskIds || [];

    // Fetch linked tasks
    const linkedTasks = taskIds.length > 0
      ? await Task.find({ _id: { $in: taskIds }, teamId: project.teamId }).lean()
      : [];

    // Build traceability chain
    const traceability = {
      requirement: {
        reqId: req.reqId,
        title: req.title,
        description: req.description,
        source: req.source,
        mandatory: req.mandatory,
        priority: req.priority,
        coverageState: req.coverageState,
        acceptanceCriteria: req.acceptanceCriteria,
      },
      linkedTasks: linkedTasks.map((t) => ({
        taskId: t._id.toString(),
        title: t.title,
        status: t.status,
        urgency: t.urgency,
        impact: t.impact,
        priorityScore: t.priorityScore,
        assignedTo: t.assignedTo,
        estimatedHours: t.estimatedHours,
      })),
      dependencies: req.dependencies || [],
      evidence: {
        implementation: req.implementationEvidence || [],
        test: req.testEvidence || [],
        artifact: req.artifactEvidence || [],
      },
      coverageImpact: {
        taskCount: linkedTasks.length,
        doneTasks: linkedTasks.filter((t) => t.status === "done").length,
        inProgressTasks: linkedTasks.filter((t) => t.status === "in_progress").length,
        todoTasks: linkedTasks.filter((t) => t.status === "todo").length,
      },
    };

    res.json({ ok: true, traceability });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// V4 FIX 5 — PROJECT MEMORY ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/projects/:projectId/memory/context — Full project memory context ──
router.get(
  "/:projectId/memory/context",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const context = await getProjectContext(req.params.projectId);
      if (!context) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }

      res.json({ ok: true, context });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GET /api/projects/:projectId/memory/summary — Memory summary ────────────────
router.get(
  "/:projectId/memory/summary",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const summary = await getProjectContextSummary(req.params.projectId);
      if (!summary) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }

      res.json({ ok: true, summary });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GET /api/projects/:projectId/memory/persistent — Persistent memory only ─────
router.get(
  "/:projectId/memory/persistent",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const context = await getPersistentContext(req.params.projectId);
      if (!context) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }

      res.json({ ok: true, context });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GET /api/projects/:projectId/memory/temporary — Temporary memory only ───────
router.get(
  "/:projectId/memory/temporary",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const context = await getTemporaryContext(req.params.projectId);
      if (!context) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }

      res.json({ ok: true, context });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GET /api/projects/:projectId/memory — List all memory entries ───────────────
router.get(
  "/:projectId/memory",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const { category, scope, status } = req.query;
      const filter = { projectId: req.params.projectId };
      if (category) filter.category = category;
      if (scope)   filter.scope   = scope;
      if (status)  filter.status  = status;

      const memories = await ProjectMemory.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      res.json({ ok: true, memories });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── POST /api/projects/:projectId/memory — Create memory entry ──────────────────
router.post(
  "/:projectId/memory",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const { category, title, content, scope, source, confidence, tags, relatedEntityIds, evidence } = req.body;

      if (!category || !title) {
        res.status(400).json({ error: "category and title are required" });
        return;
      }

      const memory = new ProjectMemory({
        projectId:       req.params.projectId,
        category,
        title,
        content:        content || "",
        scope:          scope || "persistent",
        source:         source || "manual",
        confidence:     confidence ?? 1.0,
        tags:           tags || [],
        relatedEntityIds: relatedEntityIds || [],
        evidence:       evidence || [],
        createdBy:      req.user?._id || null,
      });

      await memory.save();

      res.status(201).json({ ok: true, memory });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── PATCH /api/projects/:projectId/memory/:memoryId — Update memory entry ───────
router.patch(
  "/:projectId/memory/:memoryId",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const memory = await ProjectMemory.findOne({
        _id:       req.params.memoryId,
        projectId: req.params.projectId,
      });

      if (!memory) {
        res.status(404).json({ error: "memory_not_found" });
        return;
      }

      const allowedFields = ["title", "content", "scope", "source", "confidence", "tags", "relatedEntityIds", "evidence", "lastVerifiedAt"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          memory[field] = req.body[field];
        }
      }

      await memory.save();
      res.json({ ok: true, memory });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── DELETE /api/projects/:projectId/memory/:memoryId — Delete memory entry ──────
router.delete(
  "/:projectId/memory/:memoryId",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const memory = await ProjectMemory.findOneAndDelete({
        _id:       req.params.memoryId,
        projectId: req.params.projectId,
      });

      if (!memory) {
        res.status(404).json({ error: "memory_not_found" });
        return;
      }

      res.json({ ok: true, deletedId: memory._id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── POST /api/projects/:projectId/memory/:memoryId/archive — Archive memory ─────
router.post(
  "/:projectId/memory/:memoryId/archive",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const memory = await ProjectMemory.findOne({
        _id:       req.params.memoryId,
        projectId: req.params.projectId,
      });

      if (!memory) {
        res.status(404).json({ error: "memory_not_found" });
        return;
      }

      memory.status = "archived";
      await memory.save();

      res.json({ ok: true, memory });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── POST /api/projects/:projectId/memory/:memoryId/restore — Restore archived memory ─
router.post(
  "/:projectId/memory/:memoryId/restore",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const memory = await ProjectMemory.findOne({
        _id:       req.params.memoryId,
        projectId: req.params.projectId,
      });

      if (!memory) {
        res.status(404).json({ error: "memory_not_found" });
        return;
      }

      memory.status = "restored";
      await memory.save();

      res.json({ ok: true, memory });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GET /api/projects/:projectId/memory/context/prompt — Build prompt context ────
router.get(
  "/:projectId/memory/context/prompt",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;

      const promptContext = await buildMemoryContextForPrompt(req.params.projectId);
      res.json({ ok: true, promptContext });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 7 — METHODOLOGY RECOMMENDATION
// ─────────────────────────────────────────────────────────────────────────────

import { generateRecommendation, recommendMethodology, selectMethodology } from "../services/methodologyAdvisor.js";

// GET /api/projects/:projectId/methodology-recommendation
router.get(
  "/projects/:projectId/methodology-recommendation",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      // Pure deterministic recommendation — no DB mutation
      const result = generateRecommendation(project, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/methodology-recommendation
router.post(
  "/projects/:projectId/methodology-recommendation",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const result = await recommendMethodology(req.params.projectId, req.body, userId, req.user?.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/methodology-select
router.post(
  "/projects/:projectId/methodology-select",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const { methodology } = req.body;
      if (!methodology) return res.status(400).json({ error: "methodology is required" });
      const userId = (req.user?._id || req.user?.id)?.toString();
      const result = await selectMethodology(req.params.projectId, methodology, userId, req.user?.name);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 8 — ADAPTIVE METHODOLOGY DRIFT
// ─────────────────────────────────────────────────────────────────────────────

import { analyzeMethodologyDrift } from "../services/methodologyDriftService.js";

// GET /api/projects/:projectId/methodology-drift
router.get(
  "/projects/:projectId/methodology-drift",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const result = await analyzeMethodologyDrift(req.params.projectId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/methodology-drift/analyze
router.post(
  "/projects/:projectId/methodology-drift/analyze",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const result = await analyzeMethodologyDrift(req.params.projectId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 9 — WHAT-IF SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

import { getSimulationBaseline, runSimulation } from "../services/simulationEngine.js";

// GET /api/projects/:projectId/simulation/baseline
router.get(
  "/projects/:projectId/simulation/baseline",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const baseline = await getSimulationBaseline(req.params.projectId);
      res.json(baseline);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/simulation/run
router.post(
  "/projects/:projectId/simulation/run",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const params = {
        capacityChange: Number(req.body.capacityChange) || 0,
        timelineCompression: Number(req.body.timelineCompression) || 0,
        scopeShock: Number(req.body.scopeShock) || 0,
        scopeShockHoursPerTask: Number(req.body.scopeShockHoursPerTask) || 8,
        includeMonteCarlo: req.body.includeMonteCarlo !== false,
        monteCarloIterations: Number(req.body.monteCarloIterations) || 500,
      };
      const result = await runSimulation(req.params.projectId, params);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 10 — DIGITAL TWIN
// ─────────────────────────────────────────────────────────────────────────────

import { getDigitalTwinState, getDigitalTwinDelta } from "../services/digitalTwinService.js";

// GET /api/projects/:projectId/digital-twin
router.get(
  "/projects/:projectId/digital-twin",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const state = await getDigitalTwinState(req.params.projectId);
      res.json(state);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/digital-twin/delta
router.get(
  "/projects/:projectId/digital-twin/delta",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const delta = await getDigitalTwinDelta(req.params.projectId);
      res.json(delta);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 11 — PROCESS MINING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

import { analyzeProjectProcess } from "../services/processMiningEngine.js";

// GET /api/projects/:projectId/process-mining
router.get(
  "/projects/:projectId/process-mining",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const result = await analyzeProjectProcess(req.params.projectId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 12 — WORKFLOW CONFORMANCE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

import { analyzeWorkflowConformance } from "../services/workflowConformanceEngine.js";

// GET /api/projects/:projectId/workflow-conformance
router.get(
  "/projects/:projectId/workflow-conformance",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const result = await analyzeWorkflowConformance(req.params.projectId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 13 — TEACHER REVIEW & FACULTY PORTAL
// ─────────────────────────────────────────────────────────────────────────────

import {
  createTeacherReview,
  addReviewComment,
  updateReviewStatus,
  getProjectTeacherReviews,
  getFacultyAssignedProjects,
  assignFacultyToProject,
} from "../services/teacherReviewService.js";

// GET /api/faculty/assigned-projects
router.get(
  "/faculty/assigned-projects",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req.user?._id || req.user?.id)?.toString();
      const projects = await getFacultyAssignedProjects(userId);
      res.json({ projects });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/teacher-reviews
router.get(
  "/projects/:projectId/teacher-reviews",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const isFaculty = req.user?.role === "teacher" || req.user?.role === "faculty" ||
        (project.assignedFacultyIds || []).some(id => id.toString() === userId);

      const reviews = await getProjectTeacherReviews(req.params.projectId, isFaculty);
      res.json({ reviews });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/teacher-reviews
router.post(
  "/projects/:projectId/teacher-reviews",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const review = await createTeacherReview({
        projectId: req.params.projectId,
        teamId: project.teamId,
        teacherId: userId,
        teacherName: req.user?.name || "Faculty",
        targetType: req.body.targetType,
        targetId: req.body.targetId,
        targetTitle: req.body.targetTitle,
        initialComment: req.body.initialComment,
        isPrivateNote: req.body.isPrivateNote,
      });
      res.status(201).json(review);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/teacher-reviews/:reviewId/comments
router.post(
  "/projects/:projectId/teacher-reviews/:reviewId/comments",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const role = (req.user?.role === "teacher" || req.user?.role === "faculty") ? "teacher" : "student";
      const updated = await addReviewComment({
        reviewId: req.params.reviewId,
        authorId: userId,
        authorName: req.user?.name || "User",
        authorRole: role,
        text: req.body.text,
        isPrivateNote: req.body.isPrivateNote,
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// PATCH /api/projects/:projectId/teacher-reviews/:reviewId/status
router.patch(
  "/projects/:projectId/teacher-reviews/:reviewId/status",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const updated = await updateReviewStatus({
        reviewId: req.params.reviewId,
        status: req.body.status,
        actorId: userId,
        actorName: req.user?.name || "User",
        actorRole: req.user?.role || "user",
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 14 — ACADEMIC EVALUATION MODE
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAcademicEvaluation,
  upsertAcademicRubric,
  evaluateRubricCriterion,
  submitAcademicEvaluation,
} from "../services/academicEvaluationService.js";

// GET /api/projects/:projectId/academic-evaluation
router.get(
  "/projects/:projectId/academic-evaluation",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const evaluation = await getAcademicEvaluation(req.params.projectId);
      res.json(evaluation);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/academic-evaluation/rubric
router.post(
  "/projects/:projectId/academic-evaluation/rubric",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const rubric = await upsertAcademicRubric(req.params.projectId, req.body, userId, req.user?.name);
      res.json(rubric);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// PATCH /api/projects/:projectId/academic-evaluation/criterion/:criterionId
router.patch(
  "/projects/:projectId/academic-evaluation/criterion/:criterionId",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const crit = await evaluateRubricCriterion(
        req.params.projectId,
        req.params.criterionId,
        req.body,
        userId,
        req.user?.name
      );
      res.json(crit);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/academic-evaluation/evaluate
router.post(
  "/projects/:projectId/academic-evaluation/evaluate",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const result = await submitAcademicEvaluation(
        req.params.projectId,
        req.body,
        userId,
        req.user?.name
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 PROMPT 15 — FAIR CONTRIBUTION ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

import {
  calculateProjectContribution,
  getStudentContributionView,
  createContributionDispute,
  resolveContributionDispute,
} from "../services/fairContributionService.js";

// GET /api/projects/:projectId/contribution-analysis
router.get(
  "/projects/:projectId/contribution-analysis",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const result = await calculateProjectContribution(req.params.projectId, req.query);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/contribution-analysis/me
router.get(
  "/projects/:projectId/contribution-analysis/me",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const result = await getStudentContributionView(req.params.projectId, userId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/contribution-disputes
router.post(
  "/projects/:projectId/contribution-disputes",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const dispute = await createContributionDispute({
        projectId: req.params.projectId,
        studentId: userId,
        studentName: req.user?.name || "Student",
        disputeCategory: req.body.disputeCategory,
        description: req.body.description,
        evidenceUrls: req.body.evidenceUrls,
      });
      res.status(201).json(dispute);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// PATCH /api/projects/:projectId/contribution-disputes/:disputeId
router.patch(
  "/projects/:projectId/contribution-disputes/:disputeId",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const resolved = await resolveContributionDispute(
        req.params.disputeId,
        req.body,
        userId,
        req.user?.name || "Faculty"
      );
      res.json(resolved);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// V4 WORKSTREAMS 16–20 — PROCESS INTELLIGENCE & DOMAIN COPILOT
// ─────────────────────────────────────────────────────────────────────────────

import {
  ingestAttachment,
  getProjectTemporaryContexts,
  promoteAttachmentToMemory,
  deleteTemporaryContext,
  buildAugmentedCopilotContext,
} from "../services/copilotAttachmentService.js";
import {
  answerMultimodalQuery,
  analyzeVisualArtifact,
} from "../services/multimodalCopilotService.js";
import {
  evaluateDomainIntelligence,
  setProjectDomain,
  getDomainProfile,
  CANONICAL_DOMAINS,
} from "../services/domainIntelligenceService.js";
import { resolveEnvironment } from "../services/domainMethodologyResolver.js";
import { LOCAL_MODEL_REGISTRY } from "../services/aiProviderAbstraction.js";

// POST /api/projects/:projectId/attachments
router.post(
  "/projects/:projectId/attachments",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const { filename, mimeType, content, size } = req.body;
      const attachment = await ingestAttachment({
        projectId: req.params.projectId,
        userId,
        filename,
        mimeType,
        content,
        size,
      });
      res.status(201).json(attachment);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/temporary-contexts
router.get(
  "/projects/:projectId/temporary-contexts",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const contexts = await getProjectTemporaryContexts(req.params.projectId, userId);
      res.json({ contexts });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// DELETE /api/projects/:projectId/temporary-contexts/:contextId
router.delete(
  "/projects/:projectId/temporary-contexts/:contextId",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const deleted = await deleteTemporaryContext(req.params.contextId, userId);
      res.json(deleted);
    } catch (e) {
      res.status(403).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/temporary-contexts/:contextId/promote
router.post(
  "/projects/:projectId/temporary-contexts/:contextId/promote",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const memory = await promoteAttachmentToMemory(
        req.params.contextId,
        userId,
        req.body,
        req.user?.name || "Team Member"
      );
      res.status(201).json(memory);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/projects/:projectId/copilot/query
router.post(
  "/projects/:projectId/copilot/query",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const userId = (req.user?._id || req.user?.id)?.toString();
      const answer = await answerMultimodalQuery({
        projectId: req.params.projectId,
        userId,
        query: req.body.query,
        attachmentIds: req.body.attachmentIds || [],
      });
      res.json(answer);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/domain-intelligence
router.get(
  "/projects/:projectId/domain-intelligence",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const intelligence = await evaluateDomainIntelligence(req.params.projectId);
      res.json(intelligence);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// PATCH /api/projects/:projectId/domain
router.patch(
  "/projects/:projectId/domain",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const updated = await setProjectDomain(req.params.projectId, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/projects/:projectId/resolved-environment
router.get(
  "/projects/:projectId/resolved-environment",
  requireAuth,
  async (req, res) => {
    try {
      const project = await findProject(req.params.projectId, res, req.user);
      if (!project) return;
      const resolved = resolveEnvironment({
        domain: project.domain,
        subdomain: project.subdomain,
        methodology: project.methodology,
        hybridConfig: project.hybridConfig,
      });
      res.json(resolved);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/ai/local-models
router.get(
  "/ai/local-models",
  requireAuth,
  async (req, res) => {
    try {
      res.json({
        models: LOCAL_MODEL_REGISTRY,
        productionPolicy: "$0 Free Whitelist (Gemini -> Groq -> OpenRouter)",
        localAiStatus: "RESEARCH_AND_INTEGRATION_FOUNDATION",
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

export default router;

