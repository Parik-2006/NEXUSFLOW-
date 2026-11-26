/**
 * server/services/lifecycleService.js
 * NEXUSFLOW Phase 2 (Tasks 6 & 7) — recoverable archive, restore and
 * transactional purge for workspaces (Team) and projects.
 *
 *   ACTIVE ──archive──▶ ARCHIVED ──restore (within recovery window)──▶ ACTIVE
 *                          └──purge (manual, or automatic after purgeAfter)──▶ gone
 *
 * - Archive/restore never delete data; archived Team/Project/Task documents are
 *   hidden from all ordinary queries by utils/archivePlugin.js.
 * - Purge deletes every workspace/project-owned record inside ONE MongoDB
 *   transaction (replica set / Atlas). Without transaction support it refuses
 *   (no unsafe non-atomic fallback).
 * - Callers authorize first; events are emitted by callers AFTER commit.
 * - User-owned records (User, GitHubCredential, SkillVerification,
 *   PasswordReset, AuthExchangeCode) are never touched.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Ownership matrix (see Phase 2 report §F) ─────────────────────────────────
export const OWNERSHIP = Object.freeze({
  // Deleted by teamId when a workspace is purged.
  teamScoped: [
    "CapabilityProfile", "ChatMessage", "ContributionDispute", "DecisionFeedback", "DecisionRecord", "EarlyWarning",
    "GitHubIntegration", "Invitation", "LearningInsight", "OAuthState", "Opinion", "ProjectEvent", "ProjectLesson",
    "ProjectMemory", "RepositoryIndex", "Retrospective", "Risk", "ScrumHealthSnapshot", "ScrumSprintSnapshot",
    "Sprint", "Task", "TeacherReview", "TeamApplication", "TeamApplicationAudit", "TeamDeparture", "TeamHealth",
  ],
  // Deleted by projectId when a project (or its workspace) is purged.
  projectScoped: [
    "AIConversation", "AIMessage", "AcademicRubric", "ArchitectureComponent", "CapabilityProfile", "ContributionDispute",
    "Decision", "DecisionFeedback", "DecisionRecord", "EarlyWarning", "GitHubIntegration", "LearningInsight",
    "OAuthState", "Opinion", "ProjectEvent", "ProjectLesson", "ProjectMemory", "Recommendation", "RepositoryIndex",
    "ResearchItem", "Resource", "Retrospective", "Risk", "ScrumHealthSnapshot", "ScrumSprintSnapshot", "Sprint",
    "Task", "TeacherReview", "TeamHealth", "TemporaryContext",
  ],
  // Never deleted by workspace/project lifecycle operations.
  userOwned: ["User", "GitHubCredential", "SkillVerification", "PasswordReset", "AuthExchangeCode", "Notification"],
});
const ACTIONABLE_NOTIFICATION_TYPES = ["team_invitation", "application_submitted"];

export class LifecycleError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Test seam: a function called inside purge transactions just before commit. */
export const lifecycleTestHooks = { beforeCommit: null };

export function recoveryDays() {
  const n = Number.parseInt(process.env.LIFECYCLE_RECOVERY_DAYS ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 7;
}

let modelsLoaded = false;
async function loadAllModels() {
  if (modelsLoaded) return;
  const dir = path.join(here, "..", "models");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    await import(`../models/${f}`);
  }
  modelsLoaded = true;
}
const M = (name) => mongoose.models[name];

let txSupport = null;
export async function assertTransactionsSupported() {
  if (txSupport === null) {
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      txSupport = Boolean(hello.setName || hello.msg === "isdbgrid");
    } catch {
      txSupport = false;
    }
  }
  if (!txSupport) {
    throw new LifecycleError(503, "Permanent deletion requires a MongoDB replica set (transactions). Nothing was deleted.", "TRANSACTIONS_UNSUPPORTED");
  }
}

/** Phase 3: derived task-graph fields are recomputed AFTER a successful commit
 *  (Task hooks skip session-bound writes to avoid pre-commit reads and locks). */
async function recomputeGraphAfterCommit(teamId) {
  if (!teamId) return;
  const { recomputeForTeams } = await import("./taskGraphService.js");
  await recomputeForTeams([teamId]);
}

async function inTransaction(work) {
  await assertTransactionsSupported();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
      if (lifecycleTestHooks.beforeCommit) await lifecycleTestHooks.beforeCommit();
    });
    return result;
  } finally {
    await session.endSession();
  }
}

const withArchived = { includeArchived: true };

// ── Workspace ────────────────────────────────────────────────────────────────
export async function archiveWorkspace({ teamId, actorId }) {
  await loadAllModels();
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + recoveryDays() * 86400000);
  const op = crypto.randomUUID();
  const r = await M("Team").updateOne(
    { _id: teamId, archivedAt: null },
    { $set: { archivedAt: now, archivedBy: actorId, purgeAfter, archiveOperationId: op } }
  );
  if (!r.modifiedCount) return { alreadyArchived: true };
  logger.warn("lifecycle:workspace_archived", { teamId: String(teamId), actorId: String(actorId) });
  return { archivedAt: now, purgeAfter, operationId: op };
}

export async function restoreWorkspace({ teamId, actorId }) {
  await loadAllModels();
  const team = await M("Team").findOne({ _id: teamId }).setOptions(withArchived).lean();
  if (!team || !team.archivedAt) throw new LifecycleError(404, "Archived workspace not found.", "NOT_FOUND");
  if (team.purgeAfter && team.purgeAfter <= new Date()) {
    throw new LifecycleError(410, "The recovery window for this workspace has ended.", "RECOVERY_EXPIRED");
  }
  const r = await M("Team").updateOne(
    { _id: teamId, archivedAt: { $ne: null } },
    { $set: { archivedAt: null, archivedBy: null, purgeAfter: null, archiveOperationId: null } }
  ).setOptions(withArchived);
  if (!r.modifiedCount) return { alreadyActive: true };
  logger.info("lifecycle:workspace_restored", { teamId: String(teamId), actorId: String(actorId) });
  return { restored: true };
}

export async function purgeWorkspace({ teamId, actorId, requireArchived = true }) {
  await loadAllModels();
  const result = await inTransaction(async (session) => {
    const team = await M("Team").findOne({ _id: teamId }).setOptions(withArchived).session(session).lean();
    if (!team) return { alreadyPurged: true };
    if (requireArchived && !team.archivedAt) throw new LifecycleError(409, "Archive the workspace before deleting it permanently.", "NOT_ARCHIVED");
    const projectIds = (await M("Project").find({ teamId }).setOptions(withArchived).session(session).select("_id").lean()).map((p) => p._id);
    const counts = {};
    for (const name of OWNERSHIP.projectScoped) {
      if (!projectIds.length) break;
      const res = await M(name).deleteMany({ projectId: { $in: projectIds } }, { session }).setOptions(withArchived);
      counts[name] = (counts[name] || 0) + res.deletedCount;
    }
    for (const name of OWNERSHIP.teamScoped) {
      const res = await M(name).deleteMany({ teamId }, { session }).setOptions(withArchived);
      counts[name] = (counts[name] || 0) + res.deletedCount;
    }
    counts.Project = (await M("Project").deleteMany({ teamId }, { session }).setOptions(withArchived)).deletedCount;
    // Notifications are user-owned: drop only actionable ones (invites /
    // application prompts for a workspace that no longer exists) and detach
    // the rest (correct path is data.teamId).
    counts.NotificationDeleted = (await M("Notification").deleteMany(
      { "data.teamId": teamId, type: { $in: ACTIONABLE_NOTIFICATION_TYPES } }, { session }
    )).deletedCount;
    await M("Notification").updateMany(
      { "data.teamId": teamId },
      { $unset: { "data.teamId": "", "data.invitationId": "", "data.applicationId": "" } },
      { session }
    );
    await M("Team").deleteOne({ _id: teamId }, { session }).setOptions(withArchived);
    return { purged: true, projectIds: projectIds.map(String), counts };
  });
  if (result.purged) logger.warn("lifecycle:workspace_purged", { teamId: String(teamId), actorId: String(actorId || "system") });
  return result;
}

// ── Project ──────────────────────────────────────────────────────────────────
async function repointActiveProject(teamId, removedProjectId, session) {
  const team = await M("Team").findOne({ _id: teamId }).setOptions(withArchived).session(session).select("activeProjectId").lean();
  if (!team || String(team.activeProjectId) !== String(removedProjectId)) return;
  const next = await M("Project").findOne({ teamId, _id: { $ne: removedProjectId } }).session(session).sort({ updatedAt: -1 }).select("_id").lean();
  await M("Team").updateOne({ _id: teamId }, { $set: { activeProjectId: next?._id || null } }, { session }).setOptions(withArchived);
}

export async function archiveProject({ projectId, actorId }) {
  await loadAllModels();
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + recoveryDays() * 86400000);
  const op = crypto.randomUUID();
  const archived = await inTransaction(async (session) => {
    const project = await M("Project").findOne({ _id: projectId }).session(session).lean();
    if (!project) return { alreadyArchived: true };
    await M("Project").updateOne({ _id: projectId, archivedAt: null }, { $set: { archivedAt: now, archivedBy: actorId, purgeAfter, archiveOperationId: op } }, { session });
    // Hide the project's tasks from scheduling/counters; tagged with the
    // operation id so restore brings back exactly these tasks.
    const tasks = await M("Task").updateMany({ projectId, archivedAt: null }, { $set: { archivedAt: now, archiveOperationId: op } }, { session });
    await repointActiveProject(project.teamId, projectId, session);
    return { archivedAt: now, purgeAfter, operationId: op, teamId: String(project.teamId), tasksArchived: tasks.modifiedCount };
  });
  await recomputeGraphAfterCommit(archived.teamId);
  return archived;
}

export async function restoreProject({ projectId, actorId }) {
  await loadAllModels();
  const restored = await inTransaction(async (session) => {
    const project = await M("Project").findOne({ _id: projectId }).setOptions(withArchived).session(session).lean();
    if (!project || !project.archivedAt) throw new LifecycleError(404, "Archived project not found.", "NOT_FOUND");
    if (project.purgeAfter && project.purgeAfter <= new Date()) {
      throw new LifecycleError(410, "The recovery window for this project has ended.", "RECOVERY_EXPIRED");
    }
    const team = await M("Team").findOne({ _id: project.teamId }).session(session).lean();
    if (!team) throw new LifecycleError(409, "Restore the parent workspace first.", "PARENT_ARCHIVED");
    await M("Project").updateOne({ _id: projectId }, { $set: { archivedAt: null, archivedBy: null, purgeAfter: null, archiveOperationId: null } }, { session }).setOptions(withArchived);
    const tasks = await M("Task").updateMany(
      { projectId, archiveOperationId: project.archiveOperationId },
      { $set: { archivedAt: null, archiveOperationId: null } },
      { session }
    ).setOptions(withArchived);
    if (!team.activeProjectId) await M("Team").updateOne({ _id: team._id }, { $set: { activeProjectId: projectId } }, { session });
    logger.info("lifecycle:project_restored", { projectId: String(projectId), actorId: String(actorId) });
    return { restored: true, teamId: String(team._id), tasksRestored: tasks.modifiedCount };
  });
  await recomputeGraphAfterCommit(restored.teamId);
  return restored;
}

export async function purgeProject({ projectId, actorId, requireArchived = true }) {
  await loadAllModels();
  const result = await inTransaction(async (session) => {
    const project = await M("Project").findOne({ _id: projectId }).setOptions(withArchived).session(session).lean();
    if (!project) return { alreadyPurged: true };
    if (requireArchived && !project.archivedAt) throw new LifecycleError(409, "Archive the project before deleting it permanently.", "NOT_ARCHIVED");
    const counts = {};
    for (const name of OWNERSHIP.projectScoped) {
      counts[name] = (await M(name).deleteMany({ projectId }, { session }).setOptions(withArchived)).deletedCount;
    }
    await M("Project").deleteOne({ _id: projectId }, { session }).setOptions(withArchived);
    await repointActiveProject(project.teamId, projectId, session);
    return { purged: true, teamId: String(project.teamId), counts };
  });
  if (result.purged) {
    logger.warn("lifecycle:project_purged", { projectId: String(projectId), actorId: String(actorId || "system") });
    await recomputeGraphAfterCommit(result.teamId);
  }
  return result;
}

// ── Trash listing ────────────────────────────────────────────────────────────
export async function listTrash(userId, { canManageProject }) {
  await loadAllModels();
  const teams = await M("Team").find({ ownerId: userId, archivedAt: { $ne: null } }).setOptions(withArchived)
    .select("_id name archivedAt purgeAfter methodology").lean();
  const myTeams = await M("Team").find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).lean();
  const manageable = myTeams.filter((t) => canManageProject(t));
  const projects = manageable.length
    ? await M("Project").find({ teamId: { $in: manageable.map((t) => t._id) }, archivedAt: { $ne: null } }).setOptions(withArchived)
      .select("_id title teamId archivedAt purgeAfter methodology").lean()
    : [];
  const teamName = new Map(manageable.map((t) => [String(t._id), t.name]));
  return [
    ...teams.map((t) => ({ type: "workspace", id: String(t._id), name: t.name, archivedAt: t.archivedAt, purgeAfter: t.purgeAfter, methodology: t.methodology })),
    ...projects.map((p) => ({ type: "project", id: String(p._id), name: p.title, workspaceId: String(p.teamId), workspaceName: teamName.get(String(p.teamId)) || "", archivedAt: p.archivedAt, purgeAfter: p.purgeAfter, methodology: p.methodology })),
  ].sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
}

// ── Expired purge job (opt-in) ───────────────────────────────────────────────
const LockSchema = new mongoose.Schema({ _id: String, lockedUntil: Date, owner: String }, { versionKey: false });
const LifecycleLock = mongoose.models.LifecycleLock || mongoose.model("LifecycleLock", LockSchema);

/** Purge workspaces/projects whose recovery window ended. Safe to run concurrently. */
export async function purgeExpired({ now = new Date(), owner = `pid-${process.pid}` } = {}) {
  await loadAllModels();
  const leaseMs = 15 * 60 * 1000;
  let acquired = null;
  try {
    acquired = await LifecycleLock.findOneAndUpdate(
      { _id: "purge-expired", $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: null }] },
      { $set: { lockedUntil: new Date(now.getTime() + leaseMs), owner } },
      { upsert: true, new: true }
    );
  } catch (e) {
    if (e?.code === 11000) return { skipped: "locked" };
    throw e;
  }
  if (!acquired || acquired.owner !== owner) return { skipped: "locked" };
  const done = { workspaces: 0, projects: 0, errors: 0 };
  try {
    const teams = await M("Team").find({ archivedAt: { $ne: null }, purgeAfter: { $lte: now } }).setOptions(withArchived).select("_id").lean();
    for (const t of teams) {
      try { if ((await purgeWorkspace({ teamId: t._id, actorId: null })).purged) done.workspaces++; } catch { done.errors++; }
    }
    const projects = await M("Project").find({ archivedAt: { $ne: null }, purgeAfter: { $lte: now } }).setOptions(withArchived).select("_id").lean();
    for (const p of projects) {
      try { if ((await purgeProject({ projectId: p._id, actorId: null })).purged) done.projects++; } catch { done.errors++; }
    }
  } finally {
    await LifecycleLock.updateOne({ _id: "purge-expired", owner }, { $set: { lockedUntil: new Date(0) } });
  }
  return done;
}

/** Opt-in scheduler (LIFECYCLE_AUTO_PURGE=true). Never enabled by default. */
export function startPurgeScheduler() {
  if (process.env.LIFECYCLE_AUTO_PURGE !== "true") return null;
  const minutes = Math.max(5, Number.parseInt(process.env.LIFECYCLE_PURGE_INTERVAL_MINUTES ?? "60", 10) || 60);
  const timer = setInterval(() => {
    purgeExpired().then((r) => logger.info("lifecycle:purge_expired_run", r)).catch((e) => logger.error("lifecycle:purge_expired_failed", { reason: e.message }));
  }, minutes * 60 * 1000);
  timer.unref?.();
  logger.info("lifecycle:auto_purge_enabled", { intervalMinutes: minutes, recoveryDays: recoveryDays() });
  return timer;
}
