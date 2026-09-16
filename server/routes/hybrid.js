/**
 * server/routes/hybrid.js
 * ============================================================================
 * NEXUSFLOW V4 — HYBRID METHODOLOGY API ROUTES (Prompt 6)
 *
 * All Hybrid methodology endpoints. Protected by requireAuth middleware.
 * Follows the same dual-routing pattern as scrum.js and kanban.js.
 *
 * AUTHORIZATION:
 *   - All routes require authenticated user
 *   - Project/Team membership verified
 *   - Configuration changes require team leader/owner role
 * ============================================================================
 */

import express from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import {
  configureHybrid,
  getHybridState,
  validateHybridConfig,
  listHybridTemplates,
  getDefaultHybridConfig,
  HYBRID_TEMPLATES,
} from "../services/hybridEngine.js";

const router = express.Router();

/**
 * Helper: verify project / team access (Accepts Project ID OR Team ID)
 */
async function verifyProjectAccess(req, res, targetId) {
  const id = targetId || req.params.id || req.params.projectId || req.params.teamId || req.body?.projectId || req.body?.teamId;
  if (!id) {
    res.status(400).json({ error: "Target ID (Project or Team) is required" });
    return null;
  }

  let project = null;
  let team = null;

  if (mongoose.isValidObjectId(id)) {
    project = await Project.findById(id);
    if (!project) {
      team = await Team.findById(id);
      if (team) {
        project = await Project.findOne({ teamId: team._id }).sort({ createdAt: -1 });
      }
    }
  }

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  if (!team) {
    team = await Team.findById(project.teamId);
  }

  // Verify membership
  if (team) {
    const userId = (req.user?._id || req.user?.id)?.toString() || "";
    const userEmail = (req.user?.email || "").toLowerCase().trim();
    const isOwner = team.ownerId?.toString() === userId;
    const isMember = Array.isArray(team.members) && team.members.some(m => {
      const mId = (m.userId?._id || m.userId)?.toString() || "";
      return mId === userId || (m.name || "").toLowerCase().trim() === userEmail;
    });
    if (!isOwner && !isMember) {
      res.status(403).json({ error: "Forbidden: You do not have access to this project." });
      return null;
    }
  }

  return { project, team };
}

/**
 * Helper: check if user is team leader/owner
 */
function isTeamLeader(team, userId) {
  if (!team || !userId) return false;
  const uid = userId.toString();
  if (team.ownerId?.toString() === uid) return true;
  const member = (team.members || []).find(m => (m.userId?._id || m.userId)?.toString() === uid);
  return member?.role === "leader" || member?.role === "admin";
}

// ── GET /api/hybrid/templates ──────────────────────────────────────────────────
// List available hybrid configuration templates
router.get("/templates", (req, res) => {
  res.json({ templates: listHybridTemplates() });
});

// ── GET /api/hybrid/overview/:id ───────────────────────────────────────────────
// Get hybrid state and active rules for a project
router.get("/overview/:id", async (req, res) => {
  try {
    const ctx = await verifyProjectAccess(req, res);
    if (!ctx) return;
    const state = await getHybridState(ctx.project._id);
    res.json(state);
  } catch (err) {
    console.error("[HYBRID] Overview error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hybrid/config/:id ─────────────────────────────────────────────────
// Get current hybrid configuration
router.get("/config/:id", async (req, res) => {
  try {
    const ctx = await verifyProjectAccess(req, res);
    if (!ctx) return;
    const config = ctx.project.hybridConfig || getDefaultHybridConfig();
    const isHybrid = ctx.project.methodology === "HYBRID";
    res.json({ isHybrid, config, methodology: ctx.project.methodology });
  } catch (err) {
    console.error("[HYBRID] Config fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hybrid/configure/:id ─────────────────────────────────────────────
// Set or update hybrid configuration (requires team leader)
router.post("/configure/:id", async (req, res) => {
  try {
    const ctx = await verifyProjectAccess(req, res);
    if (!ctx) return;

    const userId = (req.user?._id || req.user?.id)?.toString();
    if (!isTeamLeader(ctx.team, userId)) {
      return res.status(403).json({ error: "Only team leaders can configure hybrid methodology." });
    }

    const result = await configureHybrid({
      projectId: ctx.project._id,
      config: req.body,
      userId,
      userName: req.user?.name || "User",
    });

    if (!result.success) {
      return res.status(400).json({ error: "Invalid hybrid configuration", details: result.errors, warnings: result.warnings });
    }

    // Emit Socket.IO event
    const io = req.app.get("io");
    if (io) {
      io.to(`team:${ctx.project.teamId}`).emit("hybrid:configured", {
        projectId: ctx.project._id.toString(),
        config: result.config,
        templateName: result.templateName,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("[HYBRID] Configure error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hybrid/validate ──────────────────────────────────────────────────
// Validate a hybrid configuration without applying it
router.post("/validate", (req, res) => {
  try {
    const result = validateHybridConfig(req.body);
    res.json(result);
  } catch (err) {
    console.error("[HYBRID] Validate error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hybrid/apply-template/:id ────────────────────────────────────────
// Apply a predefined template
router.post("/apply-template/:id", async (req, res) => {
  try {
    const ctx = await verifyProjectAccess(req, res);
    if (!ctx) return;

    const userId = (req.user?._id || req.user?.id)?.toString();
    if (!isTeamLeader(ctx.team, userId)) {
      return res.status(403).json({ error: "Only team leaders can configure hybrid methodology." });
    }

    const { templateId } = req.body;
    const template = HYBRID_TEMPLATES[templateId];
    if (!template) {
      return res.status(400).json({ error: `Unknown template: ${templateId}`, available: Object.keys(HYBRID_TEMPLATES) });
    }

    const result = await configureHybrid({
      projectId: ctx.project._id,
      config: { ...template, templateName: templateId },
      userId,
      userName: req.user?.name || "User",
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`team:${ctx.project.teamId}`).emit("hybrid:configured", {
        projectId: ctx.project._id.toString(),
        config: result.config,
        templateName: result.templateName,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("[HYBRID] Apply template error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
