/**
 * server/routes/lifecycle.js
 * NEXUSFLOW Phase 2 (Task 7) — Trash: list, restore, permanently delete.
 *
 *   GET    /api/trash                              archived items the caller may manage
 *   POST   /api/trash/workspaces/:id/restore       workspace owner
 *   DELETE /api/trash/workspaces/:id  {confirmName} workspace owner (transactional purge)
 *   POST   /api/trash/projects/:id/restore         owner/leader of the (active) workspace
 *   DELETE /api/trash/projects/:id    {confirmName} owner/leader (transactional purge)
 *
 * Archived resources are invisible to every ordinary endpoint; only these
 * routes read them (includeArchived). Non-members get 404 (no existence leak).
 */
import { Router } from "express";
import { requireAuth } from "../auth.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import { getAuthUserId, idEquals, isValidId } from "../utils/identity.js";
import { getMembership, hasPermission } from "../services/accessControlService.js";
import {
  listTrash,
  restoreWorkspace,
  purgeWorkspace,
  restoreProject,
  purgeProject,
  LifecycleError,
  recoveryDays,
} from "../services/lifecycleService.js";

const router = Router();
const withArchived = { includeArchived: true };

function fail(res, e) {
  if (e instanceof LifecycleError) return res.status(e.status).json({ error: e.message, code: e.code });
  return res.status(500).json({ error: "Lifecycle operation failed." });
}

async function loadArchivedWorkspace(req, res) {
  const userId = getAuthUserId(req.user);
  if (!isValidId(req.params.id)) { res.status(400).json({ error: "Invalid workspace ID." }); return null; }
  const team = await Team.findOne({ _id: req.params.id }).setOptions(withArchived).lean();
  if (!team || !team.archivedAt || !getMembership(team, userId).isMember) {
    res.status(404).json({ error: "Archived workspace not found.", code: "NOT_FOUND" });
    return null;
  }
  if (!idEquals(team.ownerId, userId)) {
    res.status(403).json({ error: "Only the workspace owner can manage an archived workspace.", code: "INSUFFICIENT_ROLE" });
    return null;
  }
  return { team, userId };
}

async function loadArchivedProject(req, res) {
  const userId = getAuthUserId(req.user);
  if (!isValidId(req.params.id)) { res.status(400).json({ error: "Invalid project ID." }); return null; }
  const project = await Project.findOne({ _id: req.params.id }).setOptions(withArchived).lean();
  const team = project ? await Team.findOne({ _id: project.teamId }).setOptions(withArchived).lean() : null;
  if (!project || !project.archivedAt || !team || !getMembership(team, userId).isMember) {
    res.status(404).json({ error: "Archived project not found.", code: "NOT_FOUND" });
    return null;
  }
  if (!hasPermission(team, userId, "project:delete")) {
    res.status(403).json({ error: "Only the workspace owner or a leader can manage archived projects.", code: "INSUFFICIENT_ROLE" });
    return null;
  }
  return { project, team, userId };
}

router.get("/trash", requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req.user);
    const items = await listTrash(userId, { canManageProject: (team) => hasPermission(team, userId, "project:delete") });
    res.json({ items, recoveryDays: recoveryDays() });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/trash/workspaces/:id/restore", requireAuth, async (req, res) => {
  try {
    const ctx = await loadArchivedWorkspace(req, res);
    if (!ctx) return;
    const r = await restoreWorkspace({ teamId: ctx.team._id, actorId: ctx.userId });
    const io = req.app.get("io");
    if (io) io.to(`user:${ctx.userId}`).emit("team:restored", { teamId: String(ctx.team._id) });
    res.json({ success: true, ...r });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/trash/workspaces/:id", requireAuth, async (req, res) => {
  try {
    const ctx = await loadArchivedWorkspace(req, res);
    if (!ctx) return;
    if (String(req.body?.confirmName ?? "").trim() !== String(ctx.team.name || "").trim()) {
      return res.status(400).json({ error: "Confirmation required: type the exact workspace name.", code: "CONFIRMATION_REQUIRED" });
    }
    const r = await purgeWorkspace({ teamId: ctx.team._id, actorId: ctx.userId });
    res.json({ success: true, purged: Boolean(r.purged) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/trash/projects/:id/restore", requireAuth, async (req, res) => {
  try {
    const ctx = await loadArchivedProject(req, res);
    if (!ctx) return;
    if (ctx.team.archivedAt) {
      return res.status(409).json({ error: "Restore the parent workspace first.", code: "PARENT_ARCHIVED" });
    }
    const r = await restoreProject({ projectId: ctx.project._id, actorId: ctx.userId });
    const io = req.app.get("io");
    if (io) io.to(`team:${ctx.team._id}`).emit("project:restored", { projectId: String(ctx.project._id) });
    res.json({ success: true, ...r });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/trash/projects/:id", requireAuth, async (req, res) => {
  try {
    const ctx = await loadArchivedProject(req, res);
    if (!ctx) return;
    if (String(req.body?.confirmName ?? "").trim() !== String(ctx.project.title || "").trim()) {
      return res.status(400).json({ error: "Confirmation required: type the exact project title.", code: "CONFIRMATION_REQUIRED" });
    }
    const r = await purgeProject({ projectId: ctx.project._id, actorId: ctx.userId });
    res.json({ success: true, purged: Boolean(r.purged) });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
