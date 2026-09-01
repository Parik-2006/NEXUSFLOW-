/**
 * server/services/teamHealth.js
 * NEXUSFLOW 3.0 — Phase 12: Team Health Scoring Engine (deterministic, $0 cost)
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
 */
export async function computeTeamHealth(projectId) {
  // Load team via project
  const Project = (await import("../models/Project.js")).default;
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team = await Team.findById(project.teamId).lean();
  if (!team) throw new Error("Team not found");

  const allTasks = await Task.find({ projectId }).lean();
  const memberCount = team.members?.length || 1;

  // ── Dimension: Task Completion ──────────────────────────────────────────────
  const done    = allTasks.filter((t) => t.status === "done").length;
  const total   = allTasks.length || 1;
  const taskCompletionScore = clamp((done / total) * 100);

  // ── Dimension: Workload Balance ────────────────────────────────────────────
  const memberLoad = {};
  for (const m of team.members || []) {
    memberLoad[m.userId?.toString()] = { assigned: 0, capacity: m.capacity || 40 };
  }
  for (const t of allTasks.filter((t) => t.status !== "done")) {
    const uid = t.assignedTo?.toString();
    if (uid && memberLoad[uid]) memberLoad[uid].assigned += (t.estimatedHours || 4);
  }
  const ratios = Object.values(memberLoad).map((m) => Math.min(m.assigned / (m.capacity || 40), 2));
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const variance = ratios.reduce((s, r) => s + Math.pow(r - avgRatio, 2), 0) / (ratios.length || 1);
  const workloadScore = clamp((1 - Math.min(variance, 1)) * 100);

  // ── Dimension: Blocked Tasks ────────────────────────────────────────────────
  const blocked     = allTasks.filter((t) => t.status === "blocked").length;
  const blockedScore = clamp(((total - blocked) / total) * 100);

  // ── Dimension: Skill Coverage ──────────────────────────────────────────────
  const requiredSkills = new Set(allTasks.flatMap((t) => t.requiredSkills || []));
  // Fetch skills from User docs since Team member subdoc doesn't store them
  const memberUserIds = (team.members || []).map((m) => m.userId).filter(Boolean);
  const memberUsers   = await User.find({ _id: { $in: memberUserIds } }).select("skills").lean();
  const teamSkills    = new Set(memberUsers.flatMap((u) => u.skills || []));
  const missing       = [...requiredSkills].filter((s) => !teamSkills.has(s));
  const skillScore    = requiredSkills.size === 0
    ? 100
    : clamp(((requiredSkills.size - missing.length) / requiredSkills.size) * 100);

  // ── Dimension: GitHub Activity ─────────────────────────────────────────────
  const ghIntegration = await GitHubIntegration.findOne({ projectId, isActive: true }).lean();
  const githubScore   = ghIntegration?.cachedSummary?.recentCommits > 0 ? 80 : 50;

  // ── Composite Score ─────────────────────────────────────────────────────────
  const weights = { taskCompletion: 0.30, workloadBalance: 0.25, blockedTasks: 0.20, skillCoverage: 0.15, githubActivity: 0.10 };
  const score = clamp(
    taskCompletionScore * weights.taskCompletion +
    workloadScore       * weights.workloadBalance +
    blockedScore        * weights.blockedTasks +
    skillScore          * weights.skillCoverage +
    githubScore         * weights.githubActivity
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

  if (skillScore < 80) advisories.push(`Skill gaps detected: ${missing.slice(0, 3).join(", ")}`);
  if (skillScore === 100) strengths.push("Full skill coverage for all task requirements");

  if (!ghIntegration) advisories.push("Connect a GitHub repository to enable commit activity tracking");

  const health = await TeamHealth.create({
    teamId:    team._id,
    projectId,
    score,
    grade,
    dimensions: {
      taskCompletion:  { score: taskCompletionScore },
      workloadBalance: { score: workloadScore },
      blockedTasks:    { score: blockedScore },
      skillCoverage:   { score: skillScore },
      githubActivity:  { score: githubScore },
    },
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
