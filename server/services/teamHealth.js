/**
 * server/services/teamHealth.js
 * NEXUSFLOW 3.0 — Phase 12: Team Health Scoring Engine (deterministic, $0 cost)
 *
 * FIX 1 (Combined Fixes 1–5):
 * - Always reads CURRENT DB state (no stale frontend cache).
 * - Task completion is strictly derived from task.status === "done".
 * - Resolves both projectId and teamId seamlessly.
 * - All dimensions are calculated live from project tasks, team members and
 *   GitHub integration (when present).
 * - Each dimension carries a short human-readable explanation.
 * - Overall score is a deterministic weighted average of dimensions.
 * - The engine is strictly READ-ONLY on tasks: it never mutates tasks / assignments.
 */

import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import TeamHealth from "../models/TeamHealth.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import User from "../models/User.js";
import { logger } from "../utils/logger.js";

function toGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * resolveProjectAndTeam(id)
 * Resolves Project and Team records given either a Project ID or Team ID.
 * Auto-creates/links a default Project for the Team if none exists yet.
 */
export async function resolveProjectAndTeam(id) {
  if (!id) throw new Error("Project or Team ID is required");
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid ID format");
  }

  const Project = (await import("../models/Project.js")).default;
  let project = await Project.findById(id).lean();
  let team = null;

  if (project) {
    team = await Team.findById(project.teamId).lean();
  } else {
    // id may be a teamId
    team = await Team.findById(id).lean();
    if (team) {
      if (team.activeProjectId) {
        project = await Project.findById(team.activeProjectId).lean();
      }
      if (!project) {
        const newProj = await Project.create({
          teamId: team._id,
          title: team.projectTitle || team.name || "Default Project",
          description: team.projectDescription || "",
        });
        await Team.updateOne({ _id: team._id }, { $set: { activeProjectId: newProj._id } });
        project = newProj.toObject();
      }
    }
  }

  if (!team && project?.teamId) {
    team = await Team.findById(project.teamId).lean();
  }

  if (!project || !team) {
    throw new Error("Project or Team not found");
  }

  return { project, team, projectId: project._id, teamId: team._id };
}

/**
 * computeTeamHealth(id)
 * Deterministically scores health dimensions and returns a persisted TeamHealth snapshot.
 */
export async function computeTeamHealth(id) {
  const { project, team, projectId, teamId } = await resolveProjectAndTeam(id);

  // Fresh task snapshot (lean + no caching — we must reflect live state)
  const allTasks = await Task.find({
    $or: [{ projectId }, { teamId }]
  }).lean();

  const memberCount = Math.max(team.members?.length || 0, 1);
  const now = Date.now();
  const done = allTasks.filter((t) => t.status === "done").length;
  const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
  const todo = allTasks.filter((t) => t.status === "todo" || !t.status).length;
  const total = allTasks.length;

  // Overdue tasks
  const overdueTasks = allTasks.filter((t) => {
    if (t.status === "done") return false;
    const due = t.dueDate || t.deadline;
    return due && new Date(due).getTime() < now;
  });
  const overdueCount = overdueTasks.length;

  // Approaching deadline tasks (next 5 days)
  const approachingTasks = allTasks.filter((t) => {
    if (t.status === "done") return false;
    const due = t.dueDate || t.deadline;
    if (!due) return false;
    const daysLeft = (new Date(due).getTime() - now) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 5;
  });

  // ── Dimension 1 — Task Completion ────────────────────────────────────────────
  const taskCompletionScore = total === 0 ? 0 : clamp((done / total) * 100);
  const taskCompletionDesc = total === 0
    ? "No tasks created yet. Add tasks to start tracking completion."
    : `${done} of ${total} tasks completed (${taskCompletionScore}%). ${inProgress} in progress, ${todo} to do.`;

  // ── Dimension 2 — Workload Balance ──────────────────────────────────────────
  const memberLoad = {};
  for (const m of team.members || []) {
    const uid = (m.userId?._id || m.userId)?.toString();
    if (uid) {
      memberLoad[uid] = {
        name: m.name || "Member",
        activeCount: 0,
        assignedHours: 0,
        capacity: m.capacity || 40,
      };
    }
  }
  let totalActiveHours = 0;
  for (const t of allTasks) {
    if (t.status === "done") continue;
    const uid = (t.assignedTo?._id || t.assignedTo)?.toString();
    const hours = Number(t.estimatedHours) || 4;
    totalActiveHours += hours;
    if (uid && memberLoad[uid]) {
      memberLoad[uid].assignedHours += hours;
      memberLoad[uid].activeCount += 1;
    }
  }

  const memberEntries = Object.values(memberLoad);
  const ratios = memberEntries.map((m) => Math.min(m.assignedHours / (m.capacity || 40), 2));
  const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  const variance = ratios.length ? ratios.reduce((s, r) => s + Math.pow(r - avgRatio, 2), 0) / ratios.length : 0;
  const workloadScore = memberEntries.length <= 1 ? 100 : clamp((1 - Math.min(variance, 1)) * 100);

  let workloadDesc = "";
  if (memberEntries.length <= 1) {
    workloadDesc = `Single member workspace (${totalActiveHours}h active load).`;
  } else {
    const topLoad = memberEntries.slice().sort((a, b) => b.activeCount - a.activeCount);
    const highest = topLoad[0];
    const lowest = topLoad[topLoad.length - 1];
    if (highest && lowest && highest.activeCount !== lowest.activeCount) {
      workloadDesc = `${highest.name} has ${highest.activeCount} active task(s) (${highest.assignedHours}h) while ${lowest.name} has ${lowest.activeCount} (${lowest.assignedHours}h).`;
    } else {
      workloadDesc = `Team workload is balanced across ${memberCount} members (${totalActiveHours}h total active load).`;
    }
  }

  // ── Dimension 3 — Blocked Tasks ──────────────────────────────────────────────
  const blockedTasks = allTasks.filter((t) => {
    if (t.status === "done") return false;
    const deps = Array.isArray(t.dependencies) ? t.dependencies.length : 0;
    return deps > 0 || (t.dependencyCount || 0) > 0;
  });
  const blockedCount = blockedTasks.length;
  const blockedScore = total === 0 ? 100 : clamp(((total - blockedCount) / total) * 100);
  const blockedDesc = total === 0
    ? "No tasks yet — nothing blocked."
    : blockedCount === 0
      ? "No tasks are currently blocked by dependencies."
      : `${blockedCount} of ${total} task(s) have unresolved upstream dependencies.`;

  // ── Dimension 4 — Skill Coverage ────────────────────────────────────────────
  const requiredSkills = new Set(allTasks.flatMap((t) => t.requiredSkills || []));
  const memberUserIds = (team.members || []).map((m) => m.userId).filter(Boolean);
  const memberUsers = await User.find({ _id: { $in: memberUserIds } }).select("skills").lean();
  const teamSkills = new Set(memberUsers.flatMap((u) => (u.skills || []).map((s) => String(s).toLowerCase().trim())));
  const missing = [...requiredSkills].filter((s) => !teamSkills.has(String(s).toLowerCase().trim()));
  const skillScore = requiredSkills.size === 0 ? 100 : clamp(((requiredSkills.size - missing.length) / requiredSkills.size) * 100);
  const skillDesc = requiredSkills.size === 0
    ? "All general skills covered across the team."
    : missing.length === 0
      ? `All ${requiredSkills.size} required skill(s) are covered by the team.`
      : `${missing.length} of ${requiredSkills.size} required skill(s) missing: ${missing.slice(0, 3).join(", ")}.`;

  // ── Dimension 5 — GitHub Activity ───────────────────────────────────────────
  const ghIntegration = await GitHubIntegration.findOne({ projectId, isActive: true }).lean();
  let githubScore = null;
  let githubDesc;
  if (!ghIntegration) {
    githubScore = 0;
    githubDesc = "GitHub repository not connected.";
  } else {
    const recentCommits = ghIntegration.cachedSummary?.recentCommits ?? 0;
    const lastCommitAt = ghIntegration.cachedSummary?.lastCommitAt || null;
    githubScore = clamp(Math.min(recentCommits * 10, 100));
    githubDesc = lastCommitAt
      ? `${recentCommits} recent commit(s); last active ${new Date(lastCommitAt).toLocaleDateString()}.`
      : `${recentCommits} recent commit(s) on connected repository.`;
  }

  // ── Dimension 6 — Sprint Progress ───────────────────────────────────────────
  const sprintScore = taskCompletionScore;
  const sprintDesc = total === 0
    ? "No active sprint tasks."
    : `${done}/${total} tasks completed (${sprintScore}%). ${overdueCount > 0 ? `${overdueCount} task(s) overdue.` : "Deadlines on schedule."}`;

  // ── Composite Score ─────────────────────────────────────────────────────────
  const weights = {
    taskCompletion:  0.30,
    workloadBalance: 0.20,
    blockedTasks:    0.15,
    skillCoverage:   0.15,
    sprintProgress:  0.10,
    githubActivity:  0.10,
  };
  const ghWeight = githubScore === null || !ghIntegration ? 0 : weights.githubActivity;
  let totalW = weights.taskCompletion + weights.workloadBalance + weights.blockedTasks + weights.skillCoverage + weights.sprintProgress + ghWeight;
  if (totalW === 0) totalW = 1;

  let score = clamp(
    (taskCompletionScore * weights.taskCompletion +
      workloadScore       * weights.workloadBalance +
      blockedScore        * weights.blockedTasks +
      skillScore          * weights.skillCoverage +
      sprintScore         * weights.sprintProgress +
      (githubScore ?? 0)  * ghWeight) / totalW
  );

  if (overdueCount > 0) {
    score = Math.max(0, score - Math.min(overdueCount * 5, 25));
  }

  const grade = toGrade(score);

  // ── Insights ────────────────────────────────────────────────────────────────
  const strengths  = [];
  const warnings   = [];
  const advisories = [];

  if (done > 0 && taskCompletionScore >= 60) strengths.push(`${done} of ${total} tasks (${taskCompletionScore}%) completed successfully`);
  else if (total > 0 && taskCompletionScore < 30) warnings.push(`Low task completion rate (${taskCompletionScore}%) — sprint pace is behind`);

  if (workloadScore >= 75 && memberEntries.length > 1) strengths.push("Balanced workload distribution across team members");
  else if (workloadScore < 55 && memberEntries.length > 1) warnings.push("Team workload is currently unbalanced across members");

  if (blockedCount > 0) warnings.push(`${blockedCount} task(s) blocked by upstream dependencies`);
  if (overdueCount > 0) warnings.push(`${overdueCount} task(s) are overdue and require attention`);
  if (approachingTasks.length > 0 && overdueCount === 0) advisories.push(`${approachingTasks.length} task(s) due within the next 5 days`);

  if (skillScore < 80 && missing.length) advisories.push(`Skill gaps identified: ${missing.slice(0, 3).join(", ")}`);
  if (skillScore === 100 && requiredSkills.size > 0) strengths.push("Full skill coverage across all project requirements");

  if (!ghIntegration) advisories.push("Connect GitHub to track team repository commits & pull requests");

  const dimensions = {
    taskCompletion:  { score: taskCompletionScore, description: taskCompletionDesc, details: taskCompletionDesc },
    workloadBalance: { score: workloadScore,       description: workloadDesc,       details: workloadDesc },
    blockedTasks:    { score: blockedScore,        description: blockedDesc,        details: blockedDesc },
    skillCoverage:   { score: skillScore,          description: skillDesc,          details: skillDesc },
    sprintProgress:  { score: sprintScore,         description: sprintDesc,         details: sprintDesc },
    githubActivity:  { score: githubScore,         description: githubDesc,         details: githubDesc },
  };

  const health = await TeamHealth.findOneAndUpdate(
    { projectId },
    {
      $set: {
        teamId,
        projectId,
        score,
        grade,
        dimensions,
        strengths,
        warnings,
        advisories,
        generatedBy: "deterministic",
        updatedAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  logger.info("[teamHealth] Computed health score", {
    teamId: team._id.toString(),
    projectId: projectId.toString(),
    score,
    grade,
  });

  return health;
}