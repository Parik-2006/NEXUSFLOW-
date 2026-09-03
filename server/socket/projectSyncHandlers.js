/**
 * server/socket/projectSyncHandlers.js
 * NEXUSFLOW 3.0 — Phase 10: Project-Scoped Real-Time Sync
 *
 * Manages project:${projectId} Socket.IO rooms.
 * Privacy guarantee: Copilot conversation history is NEVER broadcast.
 */

import mongoose from "mongoose";
import Team from "../models/Team.js";

/**
 * Verifies that the socket's authenticated user is a member of the team
 * that owns the given project (or team), before allowing them to join the room.
 */
async function verifyProjectAccess(userId, projectId) {
  if (!mongoose.isValidObjectId(projectId) || !userId) return false;
  const Project = (await import("../models/Project.js")).default;
  let targetTeamId = null;

  const project = await Project.findById(projectId).select("teamId").lean();
  if (project) {
    targetTeamId = project.teamId;
  } else {
    // projectId might be a teamId
    const teamDoc = await Team.findById(projectId).select("_id ownerId members").lean();
    if (teamDoc) targetTeamId = teamDoc._id;
  }

  if (!targetTeamId) return false;

  const team = await Team.findOne({
    _id: targetTeamId,
    $or: [
      { ownerId: userId },
      { "members.userId": userId },
    ],
  }).lean();

  return !!team;
}

export function registerProjectSyncHandlers(io, socket) {
  const userId = socket.data.user?.id || socket.data.user?._id;

  // Client requests to join a project-scoped room
  socket.on("room:join:project", async ({ projectId } = {}) => {
    if (!userId || !projectId) return;
    const allowed = await verifyProjectAccess(userId, projectId);
    if (allowed) {
      socket.join(`project:${projectId}`);
      // Also join activeProjectId if projectId was a teamId
      try {
        const team = await Team.findById(projectId).select("activeProjectId").lean();
        if (team?.activeProjectId) {
          socket.join(`project:${team.activeProjectId}`);
        }
      } catch {}
    }
  });

  // Client requests to leave a project-scoped room
  socket.on("room:leave:project", ({ projectId } = {}) => {
    if (projectId) socket.leave(`project:${projectId}`);
  });
}

// ── Broadcast Helpers ────────────────────────────────────────────────────────

function emit(io, projectId, event, payload) {
  if (!io || !projectId) return;
  io.to(`project:${projectId}`).emit(event, { projectId, _ts: Date.now(), ...payload });
}

export const broadcastDecisionUpdate      = (io, pid, p) => emit(io, pid, "project:decision:updated",      p);
export const broadcastResearchUpdate      = (io, pid, p) => emit(io, pid, "project:research:updated",      p);
export const broadcastArchitectureUpdate  = (io, pid, p) => emit(io, pid, "project:architecture:updated",  p);
export const broadcastGuidanceUpdate      = (io, pid, p) => emit(io, pid, "project:guidance:updated",      p);
export const broadcastOpinionUpdate       = (io, pid, p) => emit(io, pid, "project:opinion:updated",       p);
export const broadcastRiskUpdate          = (io, pid, p) => emit(io, pid, "project:risk:updated",          p);
export const broadcastHealthUpdate        = (io, pid, p) => emit(io, pid, "project:health:updated",        p);
export const broadcastRetrospectiveUpdate = (io, pid, p) => emit(io, pid, "project:retrospective:updated", p);
