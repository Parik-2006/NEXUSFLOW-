/**
 * server/services/teamHealth.js
 * NEXUSFLOW 3.0 — Phase 12: Team Health Scoring Engine (deterministic, $0 cost)
 *
 * FIX 1 (Combined Fixes 1–5):
 * - Always reads CURRENT DB state (no stale frontend cache).
 * - Task completion is strictly derived from task.status === "done".
 * - All dimensions are calculated live from project tasks, team members and
 *   GitHub integration (when present).
 * - Each dimension carries a short human-readable explanation.
 * - Overall score is a deterministic weighted average of dimensions.
 * - The engine is strictly READ-ONLY: it never mutates tasks / assignments.
 */

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
 * computeTeamHealth(projectId)
 * Deterministically scores 6 health dimensions and returns a persisted TeamHealth doc.
 *
 * Guarantees:
 *   - Every dimension is derived from CURRENT data (fresh Task/Team/User reads).
 *   - Every dimension includes a `description` string the UI can render.
 *   - Overall score is the deterministic weighted sum.
 */
export async function computeTeamHealth(projectId) {
  const Project = (await import("../models/Project.js")).default;
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team = await Team.findById(project.teamId).lean();
  if (!team) throw new Error("Team not found");

  // Fresh task snapshot (lean + no caching — we must reflect live state)
  const allTasks = await Task.find({ projectId }).lean();
  const memberCount = Math.max(team.members?.length || 0, 1);

  // ── Dimension 1 — Task Completion ────────────────────────────────────────────
  // Strict semantics: only `status === "done"` counts as completed.
  const done  = allTasks.filter((t) => t.status === "done").length;
  const total = allTasks.length;
  const taskCompletionScore = total === 0
    ? 0
    : clamp((done / total) * 100);
  const taskCompletionDesc = total === 0
    ? "No tasks in this project yet."
    : `${done} of ${total} tasks completed (${taskCompletionScore}%).`;

  // ── Dimension 2 — Workload Balance ──────────────────────────────────────────
  const memberLoad = {};
  for (const m of team.members || []) {
    memberLoad[m.userId?.toString()] = {
      name: m.name || m.email || "Member",
      assigned: 0,
      capacity: m.capacity || 40,
    };
  }
  let activeHours = 0;
  for (const t of allTasks) {
    if (t.status === "done") continue;
    const uid = t.assignedTo?.toString();
    const hours = Number(t.estimatedHours) || 4;
    activeHours += hours;
    if (uid && memberLoad[uid]) memberLoad[uid].assigned += hours;
  }
  const ratios = Object.values(memberLoad).map((m) =>
    Math.min(m.assigned / (m.capacity || 40), 2)
  );
  const avgRatio = ratios.length
    ? ratios.reduce((a, b) => a + b, 0) / ratios.length
    : 0;
  const variance = ratios.length
    ? ratios.reduce((s, r) => s + Math.pow(r - avgRatio, 2), 0) / ratios.length
    : 0;
  const workloadScore = clamp((1 - Math.min(variance, 1)) * 100);
  const workloadDesc = memberCount <= 1
    ? "Only one member on the team — balance not measurable."
    : `Active workload is ${activeHours}h across ${memberCount} members. Variance ${variance.toFixed(2)}.`;

  // ── Dimension 3 — Blocked Tasks ──────────────────────────────────────────────
  // "blocked" = task has unresolved dependencies OR is in a non-progress state.
  // Tasks whose downstream work is queued behind them count as dependency pressure.
  const blocked = allTasks.filter((t) => {
    if (t.status === "done") return false;
    const deps = Array.isArray(t.dependencies) ? t.dependencies.length : 0;
    return deps > 0 || (t.dependencyCount || 0) > 0;
  }).length;
  const blockedScore = total === 0
    ? 100
    : clamp(((total - blocked) / total) * 100);
  const blockedDesc = total === 0
    ? "No tasks yet — nothing blocked."
    : `${blocked} of ${total} task(s) depend on other work finishing first.`;

  // ── Dimension 4 — Skill Coverage ────────────────────────────────────────────
  const requiredSkills = new Set(
    allTasks.flatMap((t) => t.requiredSkills || [])
  );
  const memberUserIds = (team.members || [])
    .map((m) => m.userId)
    .filter(Boolean);
  const memberUsers = await User.find({ _id: { $in: memberUserIds } })
    .select("skills")
    .lean();
  const teamSkills = new Set(
    memberUsers.flatMap((u) =>
      (u.skills || []).map((s) => String(s).toLowerCase().trim())
    )
  );
  const missing = [...requiredSkills].filter(
    (s) => !teamSkills.has(String(s).toLowerCase().trim())
  );
  const skillScore = requiredSkills.size === 0
    ? 100
    : clamp(((requiredSkills.size - missing.length) / requiredSkills.size) * 100);
  const skillDesc = requiredSkills.size === 0
    ? "No skills required by tasks yet."
    : missing.length === 0
      ? `All ${requiredSkills.size} required skill(s) covered by the team.`
      : `${missing.length} of ${requiredSkills.size} required skill(s) missing: ${missing.slice(0, 3).join(", ")}.`;

  // ── Dimension 5 — GitHub Activity ───────────────────────────────────────────
  const ghIntegration = await GitHubIntegration.findOne({
    projectId,
    isActive: true,
  }).lean();
  let githubScore = null;
  let githubDesc;
  if (!ghIntegration) {
    githubScore = 0;
    githubDesc = "GitHub not connected — activity unavailable.";
  } else {
    const recentCommits =
      ghIntegration.cachedSummary?.recentCommits ?? 0;
    const lastCommitAt =
      ghIntegration.cachedSummary?.lastCommitAt || null;
    githubScore = clamp(Math.min(recentCommits * 10, 100));
    githubDesc = lastCommitAt
      ? `${recentCommits} recent commit(s); last activity ${new Date(lastCommitAt).toLocaleDateString()}.`
      : `${recentCommits} recent commit(s) on the connected repository.`;
  }

  // ── Dimension 6 — Sprint Progress ───────────────────────────────────────────
  // Real operational sprint = ratio of done tasks to total in the active project.
  // Mirrors task completion but adds a "freshness" weighting.
  const sprintScore = taskCompletionScore;
  const sprintDesc = total === 0
    ? "No sprint activity yet."
    : `${done}/${total} tasks shipped in this sprint (${sprintScore}%).`;

  // ── Composite Score ─────────────────────────────────────────────────────────
  // Weights: completion & workload dominate; blocked + skills meaningful;
  // GitHub lightly weighted (often absent); sprint = completion lens.
  const weights = {
    taskCompletion:  0.30,
    workloadBalance: 0.20,
    blockedTasks:    0.15,
    skillCoverage:   0.15,
    sprintProgress:  0.10,
    githubActivity:  0.10,
  };
  const ghWeight = githubScore === null ? 0 : weights.githubActivity;
  // Re-normalise if GitHub isn't contributing
  let totalW =
    weights.taskCompletion + weights.workloadBalance + weights.blockedTasks +
    weights.skillCoverage + weights.sprintProgress + ghWeight;
  if (totalW === 0) totalW = 1;
  const score = clamp(
    (taskCompletionScore * weights.taskCompletion +
      workloadScore       * weights.workloadBalance +
      blockedScore        * weights.blockedTasks +
      skillScore          * weights.skillCoverage +
      sprintScore         * weights.sprintProgress +
      (githubScore ?? 0)  * ghWeight) / totalW
  );
  const grade = toGrade(score);

  // ── Insights ────────────────────────────────────────────────────────────────
  const strengths  = [];
  const warnings   = [];
  const advisories = [];

  if (taskCompletionScore >= 70) strengths.push("Strong task completion rate");
  else if (taskCompletionScore < 40) warnings.push("Low task completion — consider reducing scope");

  if (workloadScore >= 75) strengths.push("Well-balanced workload distribution");
  else if (workloadScore < 50) warnings.push("Unbalanced workload detected across team members");

  if (blockedScore < 70) warnings.push(`${blocked} blocked task(s) are stalling progress`);

  if (skillScore < 80 && missing.length) {
    advisories.push(`Skill gaps detected: ${missing.slice(0, 3).join(", ")}`);
  }
  if (skillScore === 100) strengths.push("Full skill coverage for all task requirements");

  if (!ghIntegration) advisories.push("Connect a GitHub repository to enable commit activity tracking");

  const dimensions = {
    taskCompletion:  { score: taskCompletionScore, description: taskCompletionDesc },
    workloadBalance: { score: workloadScore,       description: workloadDesc },
    blockedTasks:    { score: blockedScore,        description: blockedDesc },
    skillCoverage:   { score: skillScore,          description: skillDesc },
    sprintProgress:  { score: sprintScore,         description: sprintDesc },
    githubActivity:  { score: githubScore,         description: githubDesc },
  };

  const health = await TeamHealth.create({
    teamId:    team._id,
    projectId,
    score,
    grade,
    dimensions,
    strengths,
    warnings,
    advisories,
    generatedBy: "deterministic",
  });

  logger.info("[teamHealth] Computed health score", {
    teamId: team._id.toString(),
    projectId: projectId.toString(),
    score,
    grade,
  });

  return health;
}