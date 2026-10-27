/**
 * server/services/retrospectiveService.js
 * ============================================================================
 * NEXUSFLOW V4 — DATABASE-DRIVEN SCRUM RETROSPECTIVE & AI REFLECTION ENGINE
 *
 * Implements:
 *   1. Evidence-based analysis grounded in authoritative MongoDB records
 *   2. Lifecycle separation: PLANNING vs ACTIVE (Interim) vs REVIEW/COMPLETED
 *   3. Root Cause Analysis distinguishing Verified vs Unknown vs AI Hypotheses
 *   4. Zero-cost OmniRoute AI reflection with robust deterministic fallback
 *   5. Idempotent persistence keyed by { projectId, sprintId }
 * ============================================================================
 */

import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Sprint from "../models/Sprint.js";
import Retrospective from "../models/Retrospective.js";
import { resolveProjectAndTeam } from "./teamHealth.js";
import { omniRouteGenerate } from "./omniRoute.js";
import { logger } from "../utils/logger.js";

/**
 * Builds evidence-based, lifecycle-aware retrospective analysis from actual records.
 * Supports both options object { sprint, tasks, team, previousActions } and legacy (taskStats, memberContributions, sprintName).
 */
export function buildDeterministicAnalysis(optsOrStats, legacyMemberContribs = [], legacySprintName = "Sprint Retrospective") {
  // Legacy invocation compatibility
  if (optsOrStats && optsOrStats.total !== undefined && optsOrStats.completed !== undefined) {
    const taskStats = optsOrStats;
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

    if (legacyMemberContribs.length > 0) {
      const activeMembers = legacyMemberContribs.filter((m) => m.tasksCompleted > 0);
      if (activeMembers.length > 0) {
        const topContributor = activeMembers.reduce((a, b) => (a.tasksCompleted > b.tasksCompleted ? a : b));
        wentWell.push(`${topContributor.userName} led team delivery with ${topContributor.tasksCompleted} completed task(s)`);
      }
    }

    recommendations.push("Calibrate effort estimation against actual hours to refine future sprint scope");

    return {
      wentWell,
      wentPoorly,
      bottlenecks,
      rootCauses: bottlenecks.map((b) => `[VERIFIED CAUSE] ${b}`),
      risks: blocked > 2 ? ["Multiple unresolved task dependencies risk rolling into subsequent sprints"] : [],
      recommendations,
      suggestedImprovements: [
        "Define clear acceptance criteria before moving tasks into In Progress",
        "Conduct mid-sprint check-ins to rebalance task allocation",
      ],
      summary: `${legacySprintName} closed with ${completionRate}% completion (${completed}/${total} tasks completed, ${inProgress} in progress, ${blocked} blocked).`,
    };
  }

  // Enhanced V4 lifecycle-aware invocation
  const { sprint, tasks = [], team = {}, previousActions = [] } = optsOrStats || {};
  const sprintStatus = (sprint?.status || "PLANNING").toUpperCase();
  const sprintName = sprint?.name || "Selected Sprint";
  const sprintGoal = sprint?.goal || "";

  const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done");
  const inProgress = tasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.status === "in_progress");
  const blocked = tasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
  const unassigned = tasks.filter((t) => !t.assignedTo);
  const unestimated = tasks.filter((t) => !t.storyPoints || t.storyPoints === 0);
  const missingAC = tasks.filter((t) => !t.acceptanceCriteria || t.acceptanceCriteria.length === 0);

  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const completedPoints = completed.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const wentWell = [];
  const wentPoorly = [];
  const rootCauses = [];
  const recommendations = [];
  const bottlenecks = [];

  // ── LIFECYCLE 1: PLANNING SPRINT ──────────────────────────────────────────
  if (sprintStatus === "PLANNING") {
    if (tasks.length > 0) {
      wentWell.push(`Sprint scope planned: ${tasks.length} user stories (${totalPoints} story points) committed to sprint backlog.`);
      if (unestimated.length === 0) {
        wentWell.push("All committed user stories have completed story point estimations.");
      }
      if (sprintGoal) {
        wentWell.push(`Sprint Goal established: "${sprintGoal}".`);
      }
    } else {
      wentWell.push("Sprint container established and ready for backlog story commitment.");
    }

    if (unestimated.length > 0) {
      wentPoorly.push(`${unestimated.length} committed story/stories missing story point estimates (${unestimated.map((t) => `"${t.title}"`).slice(0, 3).join(", ")}).`);
    }
    if (missingAC.length > 0) {
      wentPoorly.push(`${missingAC.length} story/stories lack documented Acceptance Criteria.`);
    }
    if (tasks.length === 0) {
      wentPoorly.push("No stories committed to sprint backlog yet. Add items before sprint start.");
    }

    rootCauses.push(`[PLANNING] Sprint "${sprintName}" is in PLANNING phase. Execution root-cause analysis will begin once sprint execution starts.`);

    if (unestimated.length > 0 || missingAC.length > 0) {
      recommendations.push("Refine Acceptance Criteria and finalize story point estimates before starting the sprint.");
    }
    if (tasks.length > 0) {
      recommendations.push(`Review team capacity before starting sprint to ensure ${totalPoints} points are achievable.`);
    }

    return {
      wentWell,
      wentPoorly,
      bottlenecks: [],
      rootCauses,
      risks: unestimated.length > 0 ? ["Unestimated stories introduce uncertainty into sprint capacity planning"] : [],
      recommendations,
      suggestedImprovements: ["Conduct backlog refinement ceremony to verify Definition of Ready"],
      summary: `Sprint "${sprintName}" is in PLANNING. ${tasks.length} stories committed (${totalPoints} story points). Pre-execution assessment completed.`,
    };
  }

  // ── LIFECYCLE 2: ACTIVE SPRINT (IN-FLIGHT REVIEW) ─────────────────────────
  if (sprintStatus === "ACTIVE") {
    if (completed.length > 0) {
      wentWell.push(`Completed ${completed.length} story/stories (${completedPoints} pts) during active execution: ${completed.map((t) => `"${t.title}"`).slice(0, 3).join(", ")}.`);
    }
    if (inProgress.length > 0) {
      wentWell.push(`${inProgress.length} story/stories actively in development (${inProgress.map((t) => `"${t.title}"`).slice(0, 2).join(", ")}).`);
    }
    if (completed.length === 0 && tasks.length > 0) {
      wentWell.push(`Sprint is in active execution. Development work is underway across committed stories.`);
    }

    if (blocked.length > 0) {
      blocked.forEach((b) => {
        const reason = b.blockedReason ? `Reason: ${b.blockedReason}` : "Reason unknown: no blocker explanation recorded";
        wentPoorly.push(`[BLOCKED] "${b.title}" — ${reason}.`);
        bottlenecks.push(`Blocked story: "${b.title}" (${reason})`);

        if (b.blockedReason) {
          rootCauses.push(`[VERIFIED CAUSE] "${b.title}": ${b.blockedReason}`);
        } else if (b.dependencies?.length > 0) {
          rootCauses.push(`[LIKELY FACTOR] "${b.title}": impeded by unfinished prerequisite dependency.`);
        } else {
          rootCauses.push(`[UNKNOWN CAUSE] "${b.title}": flagged as blocked, but blocker rationale was not documented in the task record.`);
        }
      });
    }

    if (unassigned.length > 0) {
      wentPoorly.push(`${unassigned.length} committed story/stories currently unassigned (${unassigned.map((t) => `"${t.title}"`).slice(0, 2).join(", ")}).`);
      rootCauses.push(`[LIKELY FACTOR] Unassigned work: ${unassigned.length} stories lack dedicated owners, risking delay.`);
    }

    if (blocked.length === 0) {
      rootCauses.push(`[VERIFIED CAUSE] No active blockers or impasses flagged for this sprint.`);
    }

    if (blocked.length > 0) {
      recommendations.push(`Clear impasses for ${blocked.map((t) => `"${t.title}"`).slice(0, 2).join(", ")} in next Daily Scrum.`);
    }
    if (unassigned.length > 0) {
      recommendations.push("Assign remaining sprint tasks to available team members according to capacity.");
    }
    recommendations.push(`Maintain progress toward Sprint Goal: "${sprintGoal || sprintName}".`);

    return {
      wentWell,
      wentPoorly,
      bottlenecks,
      rootCauses,
      risks: blocked.length > 0 ? [`${blocked.length} blocked story/stories threaten sprint burndown`] : [],
      recommendations,
      suggestedImprovements: ["Review Daily Scrum impediments daily to maintain sprint momentum"],
      summary: `Sprint "${sprintName}" is ACTIVE (In-Flight Observations). ${completed.length}/${tasks.length} stories done (${completedPoints}/${totalPoints} pts), ${inProgress.length} in progress, ${blocked.length} blocked.`,
    };
  }

  // ── LIFECYCLE 3: REVIEW / COMPLETED SPRINT (FORMAL RETROSPECTIVE) ─────────
  if (completed.length > 0) {
    wentWell.push(`Delivered ${completed.length} of ${tasks.length} stories (${completedPoints} of ${totalPoints} story points completed, ${completionRate}%).`);
    if (completionRate >= 80) {
      wentWell.push(`Sprint Goal achieved with strong delivery velocity.`);
    }
  } else if (tasks.length === 0) {
    wentWell.push("Sprint closed with zero committed items.");
  }

  const incomplete = tasks.filter((t) => t.scrumStatus !== "DONE" && t.status !== "done");
  if (incomplete.length > 0) {
    const carryOverPoints = incomplete.reduce((s, t) => s + (t.storyPoints || 0), 0);
    wentPoorly.push(`${incomplete.length} story/stories incomplete at sprint close (${carryOverPoints} pts to carry forward): ${incomplete.map((t) => `"${t.title}"`).slice(0, 3).join(", ")}.`);

    incomplete.forEach((t) => {
      if (t.blockedReason) {
        rootCauses.push(`[VERIFIED CAUSE] "${t.title}": ${t.blockedReason}`);
      } else if (t.dependencies?.length > 0) {
        rootCauses.push(`[LIKELY FACTOR] "${t.title}": delayed by dependency chain.`);
      } else {
        rootCauses.push(`[UNKNOWN CAUSE] "${t.title}": incomplete at sprint close without explicit blocker recorded.`);
      }
    });
  }

  if (blocked.length > 0) {
    bottlenecks.push(`${blocked.length} story/stories encountered blockers during execution.`);
  }

  if (incomplete.length > 0) {
    recommendations.push(`Re-estimate and carry forward unfinished stories (${incomplete.map((t) => `"${t.title}"`).slice(0, 2).join(", ")}) into next sprint planning.`);
  }
  recommendations.push("Calibrate velocity metrics against actual completed points to tune subsequent sprint capacity.");

  return {
    wentWell,
    wentPoorly,
    bottlenecks,
    rootCauses: rootCauses.length > 0 ? rootCauses : [`[VERIFIED CAUSE] All ${completed.length} committed stories delivered successfully.`],
    risks: incomplete.length > 0 ? [`${incomplete.length} incomplete story/stories carried forward into upcoming sprint`] : [],
    recommendations,
    suggestedImprovements: ["Review Definition of Done with team to ensure zero defect carry-over"],
    summary: `Sprint "${sprintName}" completed with ${completionRate}% delivery (${completed.length}/${tasks.length} stories completed, ${completedPoints}/${totalPoints} points).`,
  };
}

/**
 * generateRetrospective:
 * Executes AI Reflection via OmniRoute with real selected-sprint context,
 * falling back to evidence-based deterministic analysis if needed, and idempotently
 * saves/updates the Retrospective record in MongoDB.
 */
export async function generateRetrospective({
  projectId: id,
  teamId: givenTeamId,
  sprint = null,
  sprintName: givenSprintName = null,
  period = null,
  sprintId = null,
  sprintNumber = null,
}) {
  const { project, team, projectId, teamId } = await resolveProjectAndTeam(id || givenTeamId);

  // Resolve target sprint record
  let targetSprint = sprint;
  if (!targetSprint && sprintId) {
    targetSprint = await Sprint.findById(sprintId).lean();
  }
  if (!targetSprint) {
    targetSprint = await Sprint.findOne({ projectId }).sort({ sprintNumber: -1 }).lean();
  }

  const resolvedSprintId = targetSprint ? targetSprint._id : sprintId || null;
  const resolvedSprintNumber = targetSprint ? targetSprint.sprintNumber : sprintNumber || 1;
  const resolvedSprintName = targetSprint ? targetSprint.name : givenSprintName || `Sprint ${resolvedSprintNumber}`;
  const sprintStatus = targetSprint ? targetSprint.status : "PLANNING";

  // Query ONLY tasks committed to this specific sprint
  let tasks = [];
  if (resolvedSprintId) {
    tasks = await Task.find({ sprintId: resolvedSprintId }).lean();
  } else {
    // V3/Waterfall legacy fallback
    tasks = await Task.find({
      $or: [{ projectId }, { teamId }],
    }).lean();
  }

  // Authoritative task statistics from MongoDB records
  const completed = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done").length;
  const inProgress = tasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.status === "in_progress").length;
  const blockedTasks = tasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked");
  const blocked = blockedTasks.length;
  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const completedPoints = tasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done").reduce((s, t) => s + (t.storyPoints || 0), 0);

  const taskStats = { total, completed, inProgress, blocked, completionRate };

  // Member contributions derived from authoritative task assignments
  const memberContributions = (team.members || []).map((m) => {
    const uid = (m.userId?._id || m.userId)?.toString();
    const memberTasks = tasks.filter((t) => (t.assignedTo?._id || t.assignedTo)?.toString() === uid);
    return {
      userId: m.userId,
      userName: m.name || "Member",
      tasksCompleted: memberTasks.filter((t) => t.scrumStatus === "DONE" || t.status === "done").length,
      tasksInProgress: memberTasks.filter((t) => t.scrumStatus === "IN_PROGRESS" || t.status === "in_progress").length,
      tasksBlocked: memberTasks.filter((t) => t.scrumStatus === "BLOCKED" || t.status === "blocked").length,
      totalHoursLogged: memberTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0),
    };
  });

  // Try AI generation via OmniRoute with selected sprint evidence
  let analysis = null;
  let generatedBy = "deterministic";

  try {
    const taskSummaries = tasks.map((t) => ({
      title: t.title,
      status: t.scrumStatus || t.status,
      points: t.storyPoints || 0,
      blockedReason: t.blockedReason || null,
      hasDependencies: Boolean(t.dependencies?.length > 0),
    }));

    const prompt = `You are an expert Agile Scrum coach conducting an evidence-based retrospective reflection.

CRITICAL METHODOLOGY CONSTRAINTS:
1. SPRINT LIFECYCLE: "${sprintStatus}".
   - If "PLANNING": Execution has not begun. Do NOT report 0% completion as a failure. Focus on backlog readiness, Acceptance Criteria, and point estimation.
   - If "ACTIVE": Sprint is actively executing. Do NOT report unfinished work as a delivery failure. Focus on in-flight progress, active blockers, and emerging impediments.
   - If "REVIEW" or "COMPLETED": Evaluate delivered vs carry-over work, impediments, and goal achievement.
2. EVIDENCE GROUNDING: Use ONLY the provided real tasks. Never fabricate completed tasks, unrecorded blockers, or fictitious team members.
3. ROOT CAUSE RIGOR:
   - If a task has a recorded blockedReason, label as "[VERIFIED CAUSE]".
   - If a task has dependencies, label as "[LIKELY FACTOR]".
   - If a task is blocked/delayed with NO reason recorded, label as "[UNKNOWN CAUSE]: Reason was not documented in task record".
   - If suggesting an AI hypothesis, label as "[AI HYPOTHESIS]".

SPRINT CONTEXT:
- Sprint: "${resolvedSprintName}" (Number: ${resolvedSprintNumber}, Status: ${sprintStatus})
- Sprint Goal: "${targetSprint?.goal || "Deliver committed sprint backlog"}"
- Tasks Summary: ${JSON.stringify(taskSummaries)}
- Statistics: Total: ${total} stories (${totalPoints} pts), Completed: ${completed} (${completedPoints} pts, ${completionRate}%), In Progress: ${inProgress}, Blocked: ${blocked}.
- Team Members: ${team.members?.length || 0} members.

Return ONLY valid JSON matching this exact structure:
{
  "wentWell": ["..."],
  "wentPoorly": ["..."],
  "bottlenecks": ["..."],
  "rootCauses": ["..."],
  "risks": ["..."],
  "recommendations": ["..."],
  "suggestedImprovements": ["..."],
  "summary": "..."
}`;

    const result = await omniRouteGenerate({ prompt, maxTokens: 850, temperature: 0.3 });
    const jsonMatch = result?.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.wentWell) && Array.isArray(parsed.wentPoorly)) {
        analysis = {
          wentWell: parsed.wentWell,
          wentPoorly: parsed.wentPoorly,
          bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks : [],
          rootCauses: Array.isArray(parsed.rootCauses) ? parsed.rootCauses : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          suggestedImprovements: Array.isArray(parsed.suggestedImprovements) ? parsed.suggestedImprovements : [],
          summary: parsed.summary || "",
        };
        generatedBy = "ai";
        logger.info("[AI] retrospective_ai_success", { provider: result.provider || "gemini", sprintName: resolvedSprintName, category: "ai" });
      }
    }
  } catch (err) {
    logger.warn("[retrospective] AI reflection unavailable or failed, falling back to evidence-based deterministic engine", { error: err.message });
  }

  // Fallback to deterministic evidence-based analysis
  if (!analysis) {
    analysis = buildDeterministicAnalysis({
      sprint: targetSprint,
      tasks,
      team,
    });
    generatedBy = "deterministic";
  }

  // Idempotently update or create the Retrospective record for this sprint
  let retro = null;
  if (resolvedSprintId) {
    retro = await Retrospective.findOne({ projectId, sprintId: resolvedSprintId });
  }

  if (retro) {
    // Preserve existing action items and team feedback while updating analysis
    retro.analysis = analysis;
    retro.taskStats = taskStats;
    retro.memberContributions = memberContributions;
    retro.generatedBy = generatedBy;
    retro.sprintName = resolvedSprintName;
    retro.sprintNumber = resolvedSprintNumber;
    retro.period = period || retro.period;
    retro.revision = (retro.revision || 1) + 1;
    retro.lifecycleState = sprintStatus === "ACTIVE" ? "INTERIM" : sprintStatus === "PLANNING" ? "DRAFT" : "FORMAL";
    await retro.save();
  } else {
    retro = await Retrospective.create({
      projectId,
      teamId,
      sprintName: resolvedSprintName,
      sprintId: resolvedSprintId,
      sprintNumber: resolvedSprintNumber,
      period: period || {
        start: targetSprint?.startDate || new Date(),
        end: targetSprint?.endDate || new Date(),
      },
      taskStats,
      memberContributions,
      analysis,
      actionItems: [],
      revision: 1,
      lifecycleState: sprintStatus === "ACTIVE" ? "INTERIM" : sprintStatus === "PLANNING" ? "DRAFT" : "FORMAL",
      generatedBy,
    });
  }

  logger.info("[retrospective] Persisted retrospective record", {
    projectId: projectId.toString(),
    sprintId: resolvedSprintId?.toString(),
    sprintName: retro.sprintName,
    completionRate,
    generatedBy,
    revision: retro.revision,
  });

  return retro;
}
