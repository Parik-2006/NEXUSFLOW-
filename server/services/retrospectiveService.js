/**
 * server/services/retrospectiveService.js
 * NEXUSFLOW 3.0 — Phase 15: AI Sprint Retrospective Generator
 * Uses OmniRoute (Gemini free tier) with deterministic fallback — $0 cost.
 */

import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Retrospective from "../models/Retrospective.js";
import { resolveProjectAndTeam } from "./teamHealth.js";
import { omniRouteGenerate } from "./omniRoute.js";
import { logger } from "../utils/logger.js";

function buildDeterministicAnalysis(taskStats, memberContributions, sprintName) {
  const { completionRate, blocked, total, completed, inProgress } = taskStats;

  const wentWell = [];
  const wentPoorly = [];
  const recommendations = [];
  const bottlenecks = [];

  if (completionRate >= 70) {
    wentWell.push(`Strong sprint delivery — ${completionRate}% tasks completed (${completed}/${total})`);
    wentWell.push("Team maintained consistent execution velocity throughout the sprint");
  } else if (completed > 0) {
    wentWell.push(`Delivered ${completed} functional task(s) during this sprint`);
  } else {
    wentPoorly.push("No tasks reached completion by the end of this sprint cycle");
  }

  if (completionRate < 70 && total > 0) {
    wentPoorly.push(`Completion rate was ${completionRate}% (${completed}/${total}) — below the 70% target`);
  }

  if (blocked > 0) {
    bottlenecks.push(`${blocked} task(s) encountered dependency blockers during execution`);
    recommendations.push("Establish daily blocker-clearing reviews to resolve task dependencies faster");
  }

  if (memberContributions.length > 0) {
    const activeMembers = memberContributions.filter((m) => m.tasksCompleted > 0);
    if (activeMembers.length > 0) {
      const topContributor = activeMembers.reduce((a, b) =>
        a.tasksCompleted > b.tasksCompleted ? a : b
      );
      wentWell.push(`${topContributor.userName} led team delivery with ${topContributor.tasksCompleted} completed task(s)`);
    }

    const noContrib = memberContributions.filter((m) => m.tasksCompleted === 0 && m.tasksInProgress === 0);
    if (noContrib.length > 0 && memberContributions.length > 1) {
      wentPoorly.push(`${noContrib.map((m) => m.userName).join(", ")} had no active task assignments`);
      recommendations.push("Distribute work evenly so all members hold active sprint ownership");
    }
  }

  recommendations.push("Calibrate effort estimation against actual hours to refine future sprint scope");
  if (total > 0 && completionRate < 50) {
    recommendations.push("Refine sprint scope: prioritize fewer high-impact tasks to improve completion velocity");
  }

  return {
    wentWell,
    wentPoorly,
    bottlenecks,
    risks: blocked > 2 ? ["Multiple unresolved task dependencies risk rolling into subsequent sprints"] : [],
    recommendations,
    suggestedImprovements: [
      "Define clear acceptance criteria before moving tasks into In Progress",
      "Conduct mid-sprint check-ins to rebalance task allocation",
    ],
    summary: `${sprintName} closed with ${completionRate}% completion (${completed}/${total} tasks completed, ${inProgress} in progress, ${blocked} blocked). ${
      completionRate >= 70 ? "Sprint objectives met." : "Sprint fell below target — adjust scope and address blockers."
    }`,
  };
}

/**
 * generateRetrospective({ projectId, teamId, sprintName, period })
 */
export async function generateRetrospective({ projectId: id, teamId: givenTeamId, sprintName, period }) {
  const { project, team, projectId, teamId } = await resolveProjectAndTeam(id || givenTeamId);

  // Build task filter for sprint period across both projectId and teamId
  const taskFilter = {
    $or: [{ projectId }, { teamId }],
  };
  if (period?.start && period?.end) {
    taskFilter.createdAt = { $gte: new Date(period.start), $lte: new Date(period.end) };
  }
  const tasks = await Task.find(taskFilter).lean();

  // Task stats
  const completed  = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const blocked    = tasks.filter((t) => t.status !== "done" && ((t.dependencies?.length > 0) || (t.dependencyCount > 0))).length;
  const total      = tasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const taskStats = { total, completed, inProgress, blocked, completionRate };

  // Member contributions
  const memberContributions = (team.members || []).map((m) => {
    const uid = (m.userId?._id || m.userId)?.toString();
    const memberTasks = tasks.filter((t) => (t.assignedTo?._id || t.assignedTo)?.toString() === uid);
    return {
      userId:           m.userId,
      userName:         m.name || "Member",
      tasksCompleted:   memberTasks.filter((t) => t.status === "done").length,
      tasksInProgress:  memberTasks.filter((t) => t.status === "in_progress").length,
      tasksBlocked:     memberTasks.filter((t) => t.status !== "done" && ((t.dependencies?.length > 0) || (t.dependencyCount > 0))).length,
      totalHoursLogged: memberTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0),
    };
  });

  // Try AI generation
  let analysis;
  let generatedBy = "deterministic";

  try {
    const prompt = `You are an expert Agile coach. Generate a concise sprint retrospective analysis.

Sprint: "${sprintName || "Sprint Retrospective"}"
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
    analysis = buildDeterministicAnalysis(taskStats, memberContributions, sprintName || "Sprint Retrospective");
  }

  const retro = await Retrospective.create({
    projectId,
    teamId,
    sprintName: sprintName || `Sprint Retrospective #${Date.now()}`,
    period,
    taskStats,
    memberContributions,
    analysis,
    generatedBy,
  });

  logger.info("[retrospective] Generated retrospective", {
    projectId: projectId.toString(),
    sprintName: retro.sprintName,
    completionRate,
    generatedBy,
  });

  return retro;
}
