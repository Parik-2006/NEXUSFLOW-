/**
 * server/services/retrospectiveService.js
 * NEXUSFLOW 3.0 — Phase 15: AI Sprint Retrospective Generator
 * Uses OmniRoute (Gemini free tier) with deterministic fallback — $0 cost.
 */

import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Retrospective from "../models/Retrospective.js";
import { omniRouteGenerate } from "./omniRoute.js";
import { logger } from "../utils/logger.js";

function buildDeterministicAnalysis(taskStats, memberContributions, sprintName) {
  const { completionRate, blocked, total } = taskStats;

  const wentWell = [];
  const wentPoorly = [];
  const recommendations = [];
  const bottlenecks = [];

  if (completionRate >= 70) {
    wentWell.push(`Strong sprint delivery — ${completionRate}% tasks completed`);
    wentWell.push("Team maintained consistent pace throughout the sprint");
  } else {
    wentPoorly.push(`Completion rate was only ${completionRate}% — below the 70% target`);
  }

  if (blocked > 0) {
    bottlenecks.push(`${blocked} tasks were blocked during the sprint`);
    recommendations.push("Introduce daily blocker-clearance standups to reduce blocked task time");
  }

  if (memberContributions.length > 0) {
    const topContributor = memberContributions.reduce((a, b) =>
      a.tasksCompleted > b.tasksCompleted ? a : b
    );
    if (topContributor.tasksCompleted > 0) {
      wentWell.push(`${topContributor.userName} led with ${topContributor.tasksCompleted} task(s) completed`);
    }
  }

  const noContrib = memberContributions.filter((m) => m.tasksCompleted === 0 && m.tasksInProgress === 0);
  if (noContrib.length > 0) {
    wentPoorly.push(`${noContrib.map((m) => m.userName).join(", ")} had no task activity this sprint`);
    recommendations.push("Ensure all team members have at least one assigned task per sprint");
  }

  recommendations.push("Review task estimates against actuals to improve future accuracy");
  if (total > 0 && completionRate < 50) {
    recommendations.push("Consider reducing sprint scope — commit to fewer, higher-impact tasks");
  }

  return {
    wentWell,
    wentPoorly,
    bottlenecks,
    risks: blocked > 2 ? ["Blocked tasks risk becoming sprint carry-overs"] : [],
    recommendations,
    suggestedImprovements: ["Add explicit acceptance criteria to each task before sprint start"],
    summary: `${sprintName} achieved ${completionRate}% completion. ${
      completionRate >= 70 ? "On track." : "Below target — review sprint scope and blockers."
    }`,
  };
}

/**
 * generateRetrospective({ projectId, teamId, sprintName, period })
 */
export async function generateRetrospective({ projectId, teamId, sprintName, period }) {
  const team  = await Team.findById(teamId).lean();
  if (!team) throw new Error("Team not found");

  // Build task filter for sprint period
  const taskFilter = { projectId };
  if (period?.start && period?.end) {
    taskFilter.createdAt = { $gte: new Date(period.start), $lte: new Date(period.end) };
  }
  const tasks = await Task.find(taskFilter).lean();

  // Task stats
  const completed  = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const blocked    = tasks.filter((t) => t.status === "blocked").length;
  const total      = tasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const taskStats = { total, completed, inProgress, blocked, completionRate };

  // Member contributions
  const memberContributions = (team.members || []).map((m) => {
    const uid = m.userId?.toString();
    const memberTasks = tasks.filter((t) => t.assignedTo?.toString() === uid);
    return {
      userId:           m.userId,
      userName:         m.name,
      tasksCompleted:   memberTasks.filter((t) => t.status === "done").length,
      tasksInProgress:  memberTasks.filter((t) => t.status === "in_progress").length,
      tasksBlocked:     memberTasks.filter((t) => t.status === "blocked").length,
      totalHoursLogged: memberTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0),
    };
  });

  // Try AI generation
  let analysis;
  let generatedBy = "deterministic";

  try {
    const prompt = `You are an expert Agile coach. Generate a concise sprint retrospective analysis.

Sprint: "${sprintName}"
Task Completion: ${completionRate}% (${completed}/${total} tasks)
Blocked Tasks: ${blocked}
Team Size: ${team.members?.length || 0}
Member Performance: ${JSON.stringify(memberContributions.map((m) => ({
  name: m.userName,
  done: m.tasksCompleted,
  inProgress: m.tasksInProgress,
})))}

Return ONLY valid JSON with this exact structure:
{
  "wentWell": ["..."],
  "wentPoorly": ["..."],
  "bottlenecks": ["..."],
  "risks": ["..."],
  "recommendations": ["..."],
  "suggestedImprovements": ["..."],
  "summary": "..."
}`;

    const result = await omniRouteGenerate({ prompt, maxTokens: 800, temperature: 0.4 });
    const jsonMatch = result?.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
      generatedBy = "ai";
      logger.info("[AI] retrospective_ai_success", { provider: result.provider || "gemini", sprintName, category: "ai" });
    }
  } catch (err) {
    logger.warn("[retrospective] AI failed, using deterministic fallback", { error: err.message });
  }

  if (!analysis) {
    analysis = buildDeterministicAnalysis(taskStats, memberContributions, sprintName);
  }

  const retro = await Retrospective.create({
    projectId,
    teamId,
    sprintName,
    period,
    taskStats,
    memberContributions,
    analysis,
    generatedBy,
  });

  logger.info("[retrospective] Generated retrospective", {
    projectId: projectId.toString(),
    sprintName,
    completionRate,
    generatedBy,
  });

  return retro;
}
