/**
 * server/middleware/authorization.js
 * NEXUSFLOW Phase 1 — Express wrappers around accessControlService.
 *
 * Order enforced on every protected request:
 *   authenticate (requireAuth) → resolve resource → verify permission →
 *   [route] validate → mutate → emit → respond
 * These middlewares are read-only; unauthorized requests never mutate data.
 */

import {
  authorizeTeamAccess,
  authorizeProjectAccess,
  hasPermission,
  sendAccessError,
} from "../services/accessControlService.js";

/** Guard for routes carrying a team id param. Sets req.teamAccess. */
export function requireTeamAccess({ param = "teamId", permission = "team:read" } = {}) {
  return async function teamAccessGuard(req, res, next) {
    try {
      const result = await authorizeTeamAccess(req.params[param], req.user, { permission });
      if (result.error) return sendAccessError(res, result);
      req.teamAccess = result;
      req.team = result.team; // legacy handlers read req.team
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Guard for routes carrying a project id param (which may also be a team id
 * for legacy clients unless allowTeamId=false). Sets req.projectAccess.
 */
export function requireProjectAccess({
  param = "projectId",
  permission = "team:read",
  allowTeamId = true,
  allowFaculty = false,
} = {}) {
  return async function projectAccessGuard(req, res, next) {
    try {
      const result = await authorizeProjectAccess(req.params[param], req.user, {
        permission,
        allowTeamId,
        allowFaculty,
      });
      if (result.error) return sendAccessError(res, result);
      req.projectAccess = result;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Additional permission check after a team/project guard has run. */
export function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    const access = req.teamAccess || req.projectAccess;
    if (!access?.team) return res.status(403).json({ error: "Forbidden", code: "NO_SCOPE" });
    if (!hasPermission(access.team, access.userId, permission)) {
      return res.status(403).json({
        error: "Forbidden: Your workspace role does not permit this action.",
        code: "INSUFFICIENT_ROLE",
      });
    }
    next();
  };
}
