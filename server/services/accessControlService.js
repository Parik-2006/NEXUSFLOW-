/**
 * server/services/accessControlService.js
 * NEXUSFLOW Phase 1 — Centralized, read-only workspace authorization.
 *
 * RULES (D-2, D-5, D-6, D-7, D-15):
 *   - Identity is the verified JWT user id only. No name/email matching.
 *   - Fail closed: invalid ids, missing teams, orphaned projects and
 *     owner-less/member-less "legacy" teams grant nothing.
 *   - These helpers NEVER write to the database (D-10).
 *   - Security (access) roles are derived from the existing free-text
 *     `members[].role` label; functional labels ("Frontend Developer",
 *     "Designer", …) map to plain "member". Only privileged labels confer
 *     elevated permissions, and assigning them is itself permission-gated.
 *
 * TENANT SCOPING: Task.teamId is required, so the team is the tenant boundary.
 * Every task / sprint query is bound to { teamId: authorizedTeam._id } and,
 * where a project scope exists, to that project as well.
 */

import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import { isValidId, idEquals, toIdString, getAuthUserId } from "../utils/identity.js";

// ── Access roles ─────────────────────────────────────────────────────────────
export const ACCESS_ROLES = Object.freeze({
  OWNER: "owner",
  LEADER: "leader",
  MANAGER: "manager",
  MEMBER: "member",
});
const RANK = { member: 0, manager: 1, leader: 2, owner: 3 };

// Labels that confer elevated access. Compared case-insensitively.
const LEADER_LABELS = new Set(["leader", "lead", "team leader", "team lead", "scrum master", "scrum_master", "owner", "admin"]);
const MANAGER_LABELS = new Set(["manager", "project manager", "product owner"]);

/** Map a stored member role label to its access role (never "owner"). */
export function classifyRoleLabel(label) {
  const l = String(label || "").trim().toLowerCase();
  if (LEADER_LABELS.has(l)) return ACCESS_ROLES.LEADER;
  if (MANAGER_LABELS.has(l)) return ACCESS_ROLES.MANAGER;
  return ACCESS_ROLES.MEMBER;
}

export function roleRank(role) {
  return RANK[role] ?? 0;
}

// ── Permission matrix ────────────────────────────────────────────────────────
// Minimum access role required for each privileged action.
export const PERMISSIONS = Object.freeze({
  "team:read": "member",
  "task:write": "member",
  "chat:write": "member",
  "team:update": "leader",          // rename, logo, settings
  "member:invite": "manager",
  "member:add_placeholder": "manager",
  "member:remove": "manager",       // target must rank strictly lower (owner may remove anyone but self)
  "member:update": "manager",       // role assignment additionally needs outranking the target and the new role
  "application:review": "manager",
  "task:assign": "member",
  "sprint:manage": "member",        // create/plan/start/cancel (existing collaborative behaviour)
  "sprint:complete": "leader",
  "sprint:delete": "manager",
  "assignment:bulk": "manager",
  "phase:approve": "leader",
  "project:manage": "member",
  "project:delete": "leader",
  "backlog:restore": "leader",
  "methodology:initialize": "member",
  "ownership:transfer": "owner",
  "team:delete": "owner",
});

/**
 * Membership of `userId` in a (lean or hydrated) team document.
 * @returns {{ isOwner, isMember, accessRole, member }}
 */
export function getMembership(team, userId) {
  const none = { isOwner: false, isMember: false, accessRole: null, member: null };
  if (!team || !isValidId(userId)) return none;
  const isOwner = idEquals(team.ownerId, userId);
  const member = (team.members || []).find((m) => idEquals(m?.userId, userId)) || null;
  if (!isOwner && !member) return none;
  const accessRole = isOwner ? ACCESS_ROLES.OWNER : classifyRoleLabel(member.role);
  return { isOwner, isMember: true, accessRole, member };
}

export function isTeamMember(team, userId) {
  return getMembership(team, userId).isMember;
}

export function isTeamLeader(team, userId) {
  const { accessRole } = getMembership(team, userId);
  return accessRole === ACCESS_ROLES.OWNER || accessRole === ACCESS_ROLES.LEADER;
}

export function isTeamOwner(team, userId) {
  return getMembership(team, userId).isOwner;
}

export function hasPermission(team, userId, permission) {
  const { isMember, accessRole } = getMembership(team, userId);
  if (!isMember) return false;
  const required = PERMISSIONS[permission];
  if (!required) return false; // unknown permission → deny
  return roleRank(accessRole) >= roleRank(required);
}

// ── Result helpers ───────────────────────────────────────────────────────────
export class AccessError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const deny = (status, message, code) => ({ error: message, status, code });

export function sendAccessError(res, result) {
  return res.status(result.status || 403).json({ error: result.error, code: result.code });
}

// ── Team / project resolution (read-only) ────────────────────────────────────
/**
 * Load a team and authorize the user.
 * @returns {{team, membership}} or {error,status,code}
 */
export async function authorizeTeamAccess(teamId, authUser, { permission = "team:read", lean = true } = {}) {
  const userId = getAuthUserId(authUser);
  if (!userId) return deny(401, "Unauthorized", "UNAUTHENTICATED");
  if (!isValidId(teamId)) return deny(400, "Invalid team ID.", "INVALID_ID");
  const q = Team.findById(teamId);
  const team = lean ? await q.lean() : await q;
  if (!team) return deny(404, "Team not found.", "NOT_FOUND");
  const membership = getMembership(team, userId);
  if (!membership.isMember) return deny(403, "Forbidden: You are not a member of this team.", "NOT_MEMBER");
  if (permission && !hasPermission(team, userId, permission)) {
    return deny(403, "Forbidden: Your workspace role does not permit this action.", "INSUFFICIENT_ROLE");
  }
  return { team, membership, userId };
}

/**
 * Resolve an id that may be a Project id or (for legacy/client compatibility)
 * a Team id, then authorize. Never creates anything.
 *
 * @returns {{project|null, team, membership, userId}} or {error,status,code}
 */
export async function authorizeProjectAccess(
  id,
  authUser,
  { permission = "team:read", allowTeamId = true, lean = true, allowFaculty = false } = {}
) {
  const userId = getAuthUserId(authUser);
  if (!userId) return deny(401, "Unauthorized", "UNAUTHENTICATED");
  if (!isValidId(id)) return deny(400, "Invalid project ID.", "INVALID_ID");

  const pq = Project.findById(id);
  let project = lean ? await pq.lean() : await pq;
  let team = null;

  if (project) {
    if (!isValidId(project.teamId)) return deny(403, "Forbidden: project has no owning workspace.", "ORPHANED_PROJECT");
    const tq = Team.findById(project.teamId);
    team = lean ? await tq.lean() : await tq;
    if (!team) return deny(403, "Forbidden: project workspace no longer exists.", "ORPHANED_PROJECT");
  } else if (allowTeamId) {
    const tq = Team.findById(id);
    team = lean ? await tq.lean() : await tq;
    if (!team) return deny(404, "Project not found.", "NOT_FOUND");
    project = await findActiveProjectForTeam(team, { lean });
  } else {
    return deny(404, "Project not found.", "NOT_FOUND");
  }

  const membership = getMembership(team, userId);
  if (!membership.isMember) {
    const isFaculty =
      allowFaculty &&
      project &&
      Array.isArray(project.assignedFacultyIds) &&
      project.assignedFacultyIds.some((f) => idEquals(f, userId));
    if (!isFaculty) return deny(403, "Forbidden: You do not have access to this project.", "NOT_MEMBER");
    return { project, team, membership: { ...membership, isFaculty: true }, userId };
  }
  if (permission && !hasPermission(team, userId, permission)) {
    return deny(403, "Forbidden: Your workspace role does not permit this action.", "INSUFFICIENT_ROLE");
  }
  return { project, team, membership, userId };
}

/** Read-only lookup of a team's active project (bound to that team). */
export async function findActiveProjectForTeam(team, { lean = true } = {}) {
  if (!team?._id) return null;
  let q = null;
  if (isValidId(team.activeProjectId)) {
    q = Project.findOne({ _id: team.activeProjectId, teamId: team._id });
    const p = lean ? await q.lean() : await q;
    if (p) return p;
  }
  q = Project.findOne({ teamId: team._id }).sort({ updatedAt: -1 });
  return lean ? await q.lean() : await q;
}

/**
 * Explicit, authorized, idempotent workspace project initialization (D-10).
 * Only call AFTER authorizeTeamAccess/authorizeProjectAccess succeeded.
 * Concurrency: the Team.activeProjectId pointer is claimed atomically; a racing
 * caller that loses deletes its own freshly-created project and re-reads.
 */
export async function initializeWorkspaceProject(team, { methodology, extra = {} } = {}) {
  // The Team.activeProjectId pointer is the single source of truth. It is only
  // ever set when null (compare-and-set) and never unset here, so the project
  // it points to is never deleted by a racing initializer.
  const readPointer = async () => {
    const t = await Team.findById(team._id).select("activeProjectId").lean();
    return t?.activeProjectId ? Project.findOne({ _id: t.activeProjectId, teamId: team._id }) : null;
  };

  const current = await readPointer();
  if (current) return { project: current, created: false };

  // Legacy team with projects but no pointer → adopt its oldest project.
  const legacy = await Project.findOne({ teamId: team._id }).sort({ createdAt: 1, _id: 1 });
  const candidate =
    legacy ||
    (await Project.create({
      teamId: team._id,
      title: team.projectTitle || team.name || "Default Project",
      description: team.projectDescription || "",
      ...(methodology ? { methodology } : {}),
      ...extra,
    }));
  const createdHere = !legacy;

  await Team.updateOne(
    { _id: team._id, $or: [{ activeProjectId: null }, { activeProjectId: { $exists: false } }] },
    { $set: { activeProjectId: candidate._id } }
  );
  const winner = await readPointer();
  const won = Boolean(winner && winner._id.equals(candidate._id));
  if (createdHere && !won) {
    // Lost the race: remove only our own unreferenced project.
    await Project.deleteOne({ _id: candidate._id });
  }
  return { project: winner, created: createdHere && won };
}

// ── Child-resource scoping (D-3) ─────────────────────────────────────────────
/** Mongo filter binding a task id to the authorized team. */
export function taskScopeFilter(taskId, teamId) {
  return { _id: taskId, teamId };
}

/** Load a task only if it belongs to the authorized team (and project, if given). */
export async function findScopedTask(taskId, { teamId, projectId = null, lean = true } = {}) {
  if (!isValidId(taskId) || !isValidId(teamId)) return null;
  const filter = taskScopeFilter(taskId, teamId);
  const q = Task.findOne(filter);
  const task = lean ? await q.lean() : await q;
  if (!task) return null;
  // A task already bound to a different project of the same team is out of scope.
  if (projectId && task.projectId && !idEquals(task.projectId, projectId)) return null;
  return task;
}

/**
 * Authorize a task by its own id: resolve the owning team from the task and
 * check membership. Used by endpoints that only receive a task id.
 */
export async function authorizeTaskAccess(taskId, authUser, { permission = "task:write" } = {}) {
  if (!isValidId(taskId)) return deny(400, "Invalid task ID.", "INVALID_ID");
  const task = await Task.findById(taskId).select("_id teamId projectId").lean();
  if (!task) return deny(404, "Task not found.", "NOT_FOUND");
  const access = await authorizeTeamAccess(toIdString(task.teamId), authUser, { permission });
  if (access.error) return access.status === 404 ? deny(404, "Task not found.", "NOT_FOUND") : access;
  return { ...access, task };
}

/** Verify every id belongs to the team (all-or-nothing, for bulk operations). */
export async function assertTasksInTeam(taskIds, teamId) {
  const ids = [...new Set((taskIds || []).map(String))];
  if (ids.some((id) => !isValidId(id))) return false;
  if (!ids.length) return true;
  const count = await Task.countDocuments({ _id: { $in: ids }, teamId });
  return count === ids.length;
}

/** Load a sprint only if it belongs to the authorized project/team. */
export async function authorizeSprintAccess(sprintId, authUser, { permission = "sprint:manage", lean = false } = {}) {
  if (!isValidId(sprintId)) return deny(400, "Invalid sprint ID.", "INVALID_ID");
  const sq = Sprint.findById(sprintId);
  const sprint = lean ? await sq.lean() : await sq;
  if (!sprint) return deny(404, "Sprint not found.", "NOT_FOUND");
  const access = await authorizeProjectAccess(toIdString(sprint.projectId), authUser, {
    permission,
    allowTeamId: false,
    lean: false,
  });
  if (access.error) return access;
  if (sprint.teamId && !idEquals(sprint.teamId, access.team._id)) {
    return deny(403, "Forbidden: sprint does not belong to this workspace.", "SCOPE_MISMATCH");
  }
  return { ...access, sprint };
}

// ── Socket room revocation (D-28 security portion) ───────────────────────────
/** Remove all of a user's live sockets from a team's private rooms. */
export async function revokeTeamRoomAccess(io, teamId, userId) {
  if (!io || !isValidId(teamId) || !isValidId(userId)) return;
  const tid = toIdString(teamId);
  const rooms = [`team:${tid}`, `chat:team:${tid}`, `project:${tid}`];
  try {
    const projects = await Project.find({ teamId: tid }).select("_id").lean();
    for (const p of projects) rooms.push(`project:${toIdString(p._id)}`);
  } catch {
    /* rooms derived from team id still revoked */
  }
  io.in(`user:${toIdString(userId)}`).socketsLeave(rooms);
}
