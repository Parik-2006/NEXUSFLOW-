/**
 * server/services/scrumHealthService.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM PROJECT HEALTH COMPUTATION & PERSISTENCE SERVICE
 *
 * Deterministic Scrum health evaluation matching Waterfall Project Health's
 * depth, explainability, indicator structure, warnings, and persistence.
 *
 * Distinguishes pre-sprint Project Planning Health from Active Sprint Delivery
 * Health, avoiding misleading N/A states while preserving honest data boundaries.
 * ============================================================================
 */

import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import Sprint from "../models/Sprint.js";
import Project from "../models/Project.js";
import ScrumHealthSnapshot from "../models/ScrumHealthSnapshot.js";
import { resolveProjectAndTeam } from "./teamHealth.js";
import { scanScrumRisks, isTaskDone, isTaskCancelled } from "./scrumRiskEngine.js";
import { logger } from "../utils/logger.js";

const OVERLOAD_RATIO = 1.15;

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function scoreToGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function scoreToStatus(score) {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "NEEDS_ATTENTION";
  return "CRITICAL";
}

/**
 * computeScrumHealth(id, io, calculatedBy)
 * Computes canonical Scrum project health and persists a snapshot to MongoDB.
 */
export async function computeScrumHealth(id, io = null, calculatedBy = null) {
  const { project, team, projectId, teamId } = await resolveProjectAndTeam(id);
  const now = Date.now();

  // Fresh Scrum task query
  const allTasks = await Task.find({
    $or: [
      { projectId },
      { teamId, methodology: { $in: ["SCRUM", "scrum", null] } },
    ],
    $and: [
      {
        $or: [
          { phase: null },
          { phase: { $exists: false } },
          { scrumStatus: { $ne: null } },
          { sprintId: { $ne: null } },
        ],
      },
    ],
  }).lean();

  const sprints = await Sprint.find({ projectId }).sort({ sprintNumber: 1 }).lean();
  const activeSprint = sprints.find((s) => s.status === "ACTIVE") || null;
  const planningSprints = sprints.filter((s) => s.status === "PLANNING");

  // Reconcile risks automatically
  let riskResult;
  try {
    riskResult = await scanScrumRisks(projectId, io);
  } catch (err) {
    logger.warn("[scrumHealthService] Risk scan fallback", { error: err.message });
    const existing = await Risk.find({ projectId, methodology: "SCRUM" }).lean();
    riskResult = {
      risks: existing,
      counts: {
        open: existing.filter((r) => r.status === "open").length,
        acknowledged: existing.filter((r) => r.status === "acknowledged").length,
        resolved: existing.filter((r) => r.status === "resolved").length,
        all: existing.length,
      },
    };
  }

  const openRisks = (riskResult.risks || []).filter((r) => r.status === "open");
  const criticalRisks = openRisks.filter((r) => r.severity === "critical");
  const highRisks = openRisks.filter((r) => r.severity === "high");

  const totalTasks = allTasks.length;
  const activeTasks = allTasks.filter((t) => !isTaskDone(t) && !isTaskCancelled(t));
  const doneTasks = allTasks.filter((t) => isTaskDone(t));

  const hours = (t) => Number(t.estimatedHours) || (Number(t.storyPoints) ? Number(t.storyPoints) * 3 : 4);
  const points = (t) => Number(t.storyPoints) || 0;

  // ── 1. Backlog Readiness Evaluation ──────────────────────────────────────────
  // Official backlog items: all tasks in backlog or in planning sprints
  const backlogItems = allTasks.filter(
    (t) => !isTaskCancelled(t) && (!t.sprintId || planningSprints.some((s) => s._id.toString() === t.sprintId?.toString()) || t.scrumStatus === "BACKLOG")
  );

  const estimatedBacklog = backlogItems.filter((t) => points(t) > 0 || Number(t.estimatedHours) > 0);
  const specBacklog = backlogItems.filter(
    (t) => (t.userStory && t.userStory.trim().length > 0) || (Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0)
  );
  const conflicts = project.scrumPlanLifecycle?.conflicts || [];
  const unresolvedConflicts = conflicts.filter((c) => c.status !== "resolved");

  let backlogReadinessScore = 0;
  if (backlogItems.length > 0) {
    const estRatio = estimatedBacklog.length / backlogItems.length;
    const specRatio = specBacklog.length / backlogItems.length;
    const conflictPenalty = Math.min(30, unresolvedConflicts.length * 15);
    backlogReadinessScore = clamp((estRatio * 50 + specRatio * 50) - conflictPenalty);
  }

  // ── 2. Sprint Delivery Evaluation ────────────────────────────────────────────
  let sprintDelivery = {
    hasActiveSprint: false,
    sprintId: null,
    sprintNumber: null,
    sprintName: "",
    sprintStatus: "NO_ACTIVE_SPRINT",
    score: null,
    committedPoints: 0,
    completedPoints: 0,
    committedTasks: 0,
    completedTasks: 0,
    blockedTasks: 0,
    overdueTasks: 0,
    status: "unavailable",
  };

  const sprintTasks = activeSprint
    ? allTasks.filter((t) => t.sprintId?.toString() === activeSprint._id.toString() && !isTaskCancelled(t))
    : [];

  if (activeSprint && sprintTasks.length > 0) {
    const sDone = sprintTasks.filter((t) => isTaskDone(t));
    const sBlocked = sprintTasks.filter(
      (t) => t.isBlocked === true || String(t.scrumStatus || "").toUpperCase() === "BLOCKED" || String(t.status || "").toLowerCase() === "blocked"
    );
    const sOverdue = sprintTasks.filter((t) => {
      const due = t.dueDate || t.deadline;
      return due && new Date(due).getTime() < now && !isTaskDone(t);
    });

    const sCommittedPts = sprintTasks.reduce((s, t) => s + points(t), 0) || activeSprint.plannedStoryPoints || 1;
    const sDonePts = sDone.reduce((s, t) => s + points(t), 0);

    const goalCompletionRate = clamp((sDonePts / sCommittedPts) * 100);
    const blockedRatio = sBlocked.length / sprintTasks.length;
    const deliveryScore = clamp(goalCompletionRate - blockedRatio * 40);

    sprintDelivery = {
      hasActiveSprint: true,
      activeSprintId: activeSprint._id,
      sprintId: activeSprint._id,
      sprintNumber: activeSprint.sprintNumber || 1,
      sprintName: activeSprint.name || `Sprint ${activeSprint.sprintNumber || 1}`,
      sprintStatus: "ACTIVE",
      score: deliveryScore,
      goalCompletionRate,
      committedPoints: sCommittedPts,
      completedPoints: sDonePts,
      committedTasks: sprintTasks.length,
      completedTasks: sDone.length,
      blockedTasks: sBlocked.length,
      blockedTasksCount: sBlocked.length,
      overdueTasks: sOverdue.length,
      status: scoreToStatus(deliveryScore),
    };
  }

  // ── 3. Team Capacity & Alignment ─────────────────────────────────────────────
  const members = team?.members || [];
  const totalCapacity = members.reduce((sum, m) => sum + (Number(m.capacity) || 40), 0) || 40;

  // If active sprint exists, measure against sprint tasks; otherwise measure against planning/active tasks
  const tasksForCapacity = activeSprint ? sprintTasks : activeTasks;
  const totalCommittedHours = tasksForCapacity.reduce((s, t) => s + hours(t), 0);
  const capacityUtilization = Math.round((totalCommittedHours / totalCapacity) * 100);

  let capacityScore = 100;
  if (capacityUtilization > 100) {
    // Penalize overages
    capacityScore = clamp(100 - (capacityUtilization - 100) * 1.5);
  } else if (capacityUtilization < 30 && tasksForCapacity.length > 0) {
    // Under-commitment
    capacityScore = clamp(70 + capacityUtilization);
  }

  // Member overload checks
  const memberLoads = {};
  for (const m of members) {
    const uid = (m.userId?._id || m.userId)?.toString();
    if (uid) memberLoads[uid] = { name: m.name, assigned: 0, cap: Number(m.capacity) || 40 };
  }
  for (const t of tasksForCapacity) {
    const uid = (t.assignedTo?._id || t.assignedTo)?.toString();
    if (uid && memberLoads[uid]) memberLoads[uid].assigned += hours(t);
  }
  const overloadedCount = Object.values(memberLoads).filter((m) => m.assigned > m.cap * OVERLOAD_RATIO).length;
  if (overloadedCount > 0) {
    capacityScore = Math.min(capacityScore, 100 - overloadedCount * 20);
  }

  // ── 4. Dependency Flow & Integrity ───────────────────────────────────────────
  const blockedTasksList = activeTasks.filter((t) => {
    const isExplicitlyBlocked =
      t.isBlocked === true ||
      String(t.scrumStatus || "").toUpperCase() === "BLOCKED" ||
      String(t.status || "").toLowerCase() === "blocked";
    const hasUnfinishedPrereqs = (t.dependencies || []).some((dep) => {
      const depId = String(dep?._id || dep);
      const u = allTasks.find((x) => String(x._id) === depId);
      return u && !isTaskDone(u);
    });
    return isExplicitlyBlocked || hasUnfinishedPrereqs;
  });

  const dependencyScore = activeTasks.length > 0
    ? clamp(100 - (blockedTasksList.length / activeTasks.length) * 100)
    : 100;

  // ── 5. Carry-over Risk ───────────────────────────────────────────────────────
  let carryOverScore = 90;
  if (activeSprint) {
    const incompleteSprintTasks = sprintTasks.filter((t) => !isTaskDone(t));
    if (incompleteSprintTasks.length > 0) {
      const blockedRatio = blockedTasksList.length / incompleteSprintTasks.length;
      carryOverScore = clamp(100 - (incompleteSprintTasks.length / (sprintTasks.length || 1)) * 30 - blockedRatio * 40);
    }
  } else {
    // In planning mode, carry-over risk reflects dependency blockers on backlog
    carryOverScore = blockedTasksList.length === 0 ? 95 : clamp(100 - blockedTasksList.length * 15);
  }

  // ── 6. Assignment Coverage ───────────────────────────────────────────────────
  const unassignedTasks = tasksForCapacity.filter((t) => (!t.assignedTo || String(t.assignedTo).trim() === "") && !t.assignedName);
  const assignmentCoverageScore = tasksForCapacity.length > 0
    ? clamp(((tasksForCapacity.length - unassignedTasks.length) / tasksForCapacity.length) * 100)
    : 100;

  // ── 7. Overall Scrum Project Health Score ────────────────────────────────────
  let overallScore = 0;
  let assessmentScope = "PROJECT_PLANNING";

  if (activeSprint && sprintTasks.length > 0) {
    assessmentScope = "ACTIVE_SPRINT";
    overallScore = clamp(
      (sprintDelivery.score || 0) * 0.30 +
      capacityScore * 0.20 +
      dependencyScore * 0.15 +
      carryOverScore * 0.15 +
      assignmentCoverageScore * 0.10 +
      backlogReadinessScore * 0.10
    );
  } else {
    assessmentScope = "PROJECT_PLANNING";
    // Pre-sprint planning health: grounded in backlog readiness, capacity feasibility, and dependency integrity
    overallScore = clamp(
      backlogReadinessScore * 0.40 +
      capacityScore * 0.25 +
      dependencyScore * 0.15 +
      assignmentCoverageScore * 0.10 +
      carryOverScore * 0.10
    );
  }

  // Risk deductions: open critical or high risks apply a deterministic safety cap
  const criticalImpairments = [];
  if (criticalRisks.length > 0) {
    criticalImpairments.push(`${criticalRisks.length} critical risk finding(s) detected in Risk Radar`);
    overallScore = Math.min(overallScore, 65);
  }
  if (capacityScore <= 20) {
    criticalImpairments.push("Severe capacity deficit: planned commitments exceed team capacity by >50%");
    overallScore = Math.min(overallScore, 48);
  }
  if (unresolvedConflicts.length > 0) {
    criticalImpairments.push(`${unresolvedConflicts.length} unresolved material scope contradiction(s) in source artifacts`);
    overallScore = Math.min(overallScore, 58);
  }

  const grade = scoreToGrade(overallScore);
  const status = assessmentScope === "PROJECT_PLANNING"
    ? (overallScore >= 80 ? "PLANNING_READY" : overallScore >= 55 ? "PLANNING_ATTENTION" : "PLANNING_BLOCKED")
    : scoreToStatus(overallScore);

  // Summary message
  let summary = "";
  if (assessmentScope === "ACTIVE_SPRINT") {
    if (overallScore >= 80) {
      summary = `Active sprint delivery is on track (${sprintDelivery.completedPoints}/${sprintDelivery.committedPoints} pts done). Capacity and dependencies remain balanced.`;
    } else if (overallScore >= 60) {
      summary = `Active sprint execution requires attention on ${criticalImpairments[0] || "task blockers and member capacity limits"}.`;
    } else {
      summary = `Active sprint requires immediate team intervention: delivery bottlenecks or capacity overruns threaten sprint goal.`;
    }
  } else {
    if (overallScore >= 75) {
      summary = `Product backlog is well-structured (${backlogReadinessScore}% readiness) with estimates and acceptance criteria. Ready for sprint commitment.`;
    } else {
      summary = `Backlog planning requires refinement: ${criticalImpairments[0] || "unestimated stories or missing acceptance criteria must be completed"}.`;
    }
  }

  // ── Core Health Indicators ───────────────────────────────────────────────────
  const indicators = [
    {
      key: "sprint_goal_trajectory",
      name: "Sprint Goal Trajectory",
      score: activeSprint && sprintDelivery.goalCompletionRate !== undefined ? sprintDelivery.goalCompletionRate : null,
      status: activeSprint
        ? (sprintDelivery.score >= 75 ? "healthy" : sprintDelivery.score >= 50 ? "attention" : "warning")
        : "unavailable",
      desc: activeSprint
        ? `${sprintDelivery.completedPoints} of ${sprintDelivery.committedPoints} story points completed in ${sprintDelivery.sprintName}`
        : "Sprint delivery metrics will track once an active sprint is running.",
      denominator: activeSprint ? `${sprintDelivery.committedPoints} pts` : "N/A",
      unit: "%",
      isAvailable: Boolean(activeSprint),
    },
    {
      key: "capacity_alignment",
      name: "Capacity Alignment",
      score: capacityScore,
      status: capacityScore >= 80 ? "healthy" : capacityScore >= 60 ? "attention" : "critical",
      desc: `${totalCommittedHours}h committed / ${totalCapacity}h total team capacity (${capacityUtilization}% utilization)`,
      denominator: `${totalCapacity}h`,
      unit: "%",
      isAvailable: true,
    },
    {
      key: "dependency_flow",
      name: "Dependency Flow",
      score: dependencyScore,
      status: dependencyScore >= 80 ? "healthy" : dependencyScore >= 60 ? "attention" : "warning",
      desc: blockedTasksList.length === 0
        ? "All active Scrum tasks are unblocked by prerequisites."
        : `${blockedTasksList.length} task(s) currently blocked by unfinished prerequisites.`,
      denominator: `${activeTasks.length} active tasks`,
      unit: "%",
      isAvailable: true,
    },
    {
      key: "carry_over_risk",
      name: "Carry-over Risk",
      score: carryOverScore,
      status: carryOverScore >= 75 ? "healthy" : carryOverScore >= 50 ? "attention" : "warning",
      desc: carryOverScore >= 75
        ? "Low likelihood of incomplete work rolling over into future sprints."
        : "Blocked or unestimated work increases story carry-over likelihood.",
      denominator: "Scope ratio",
      unit: "%",
      isAvailable: true,
    },
    {
      key: "backlog_readiness",
      name: "Backlog Readiness",
      score: backlogReadinessScore,
      status: backlogReadinessScore >= 80 ? "healthy" : backlogReadinessScore >= 60 ? "attention" : "warning",
      desc: `${estimatedBacklog.length} of ${backlogItems.length} backlog items estimated; ${specBacklog.length} with acceptance criteria.`,
      denominator: `${backlogItems.length} backlog items`,
      unit: "%",
      isAvailable: true,
    },
    {
      key: "assignment_coverage",
      name: "Assignment Coverage",
      score: assignmentCoverageScore,
      status: assignmentCoverageScore >= 80 ? "healthy" : assignmentCoverageScore >= 50 ? "attention" : "warning",
      desc: unassignedTasks.length === 0
        ? "All current workload cards have an assigned team member."
        : `${unassignedTasks.length} work item(s) currently unassigned without an owner.`,
      denominator: `${tasksForCapacity.length} items`,
      unit: "%",
      isAvailable: true,
    },
    {
      key: "critical_risks",
      name: "Unresolved Critical Risks",
      score: Math.max(0, 100 - (criticalRisks.length * 30 + highRisks.length * 15)),
      status: criticalRisks.length === 0 && highRisks.length === 0 ? "healthy" : criticalRisks.length > 0 ? "critical" : "warning",
      desc: openRisks.length === 0
        ? "Zero open risk findings currently detected in Risk Radar."
        : `${openRisks.length} open risk(s) in Risk Radar (${criticalRisks.length} critical, ${highRisks.length} high).`,
      denominator: `${openRisks.length} open risks`,
      unit: "%",
      isAvailable: true,
    },
  ];

  // ── Critical Warnings & Advisories ───────────────────────────────────────────
  const warnings = [];

  if (capacityScore <= 40) {
    warnings.push({
      _id: "warn_scrum_capacity",
      category: "CAPACITY",
      severity: "CRITICAL",
      title: "Committed Work Exceeds Team Capacity",
      message: `Total workload (${totalCommittedHours}h) exceeds available sprint capacity (${totalCapacity}h) by ${Math.round(totalCommittedHours - totalCapacity)}h.`,
      evidence: { committedHours: totalCommittedHours, totalCapacity, utilization: capacityUtilization },
      recommendedAction: "Defer lower-priority backlog stories to subsequent sprints or adjust team availability.",
    });
  }

  if (blockedTasksList.length > 0) {
    warnings.push({
      _id: "warn_scrum_blocked",
      code: "BLOCKED_SPRINT_WORK",
      category: "DEPENDENCY",
      severity: blockedTasksList.length >= 2 ? "HIGH" : "MEDIUM",
      title: `${blockedTasksList.length} Task(s) Blocked by Prerequisites`,
      message: `${blockedTasksList.length} Scrum task(s) cannot proceed until upstream dependencies are completed.`,
      evidence: {
        count: blockedTasksList.length,
        tasks: blockedTasksList.slice(0, 3).map((t) => t.title),
      },
      recommendedAction: "Swarm on clearing prerequisite tasks in the active sprint.",
    });
  }

  if (unassignedTasks.length > 0 && activeSprint) {
    warnings.push({
      _id: "warn_scrum_unassigned",
      code: "UNASSIGNED_SPRINT_WORK",
      category: "OWNERSHIP",
      severity: "MEDIUM",
      title: `${unassignedTasks.length} Committed Sprint Task(s) Unassigned`,
      message: "Sprint commitment includes tasks without a designated owner.",
      evidence: { count: unassignedTasks.length, sample: unassignedTasks.slice(0, 3).map((t) => t.title) },
      recommendedAction: "Assign owners during Daily Scrum to avoid sprint goal delivery drift.",
    });
  }

  if (unresolvedConflicts.length > 0) {
    warnings.push({
      _id: "warn_scrum_conflicts",
      code: "REQUIREMENTS_CONFLICT",
      category: "REQUIREMENTS",
      severity: "HIGH",
      title: `${unresolvedConflicts.length} Unresolved Requirements Contradiction(s)`,
      message: "Contradictions between source documents remain unresolved in the plan lifecycle.",
      evidence: { conflicts: unresolvedConflicts.map((c) => c.title) },
      recommendedAction: "Reconcile contradictory statements in Project Setup & Plan.",
    });
  }

  // ── Persist Snapshot to MongoDB (Append to preserve history) ──────────────────
  const snapshotData = {
    projectId,
    teamId,
    methodology: "SCRUM",
    sprintId: activeSprint?._id || (planningSprints[0]?._id || null),
    assessmentScope,
    overallScore,
    grade,
    status,
    summary,
    backlogReadiness: {
      score: backlogReadinessScore,
      totalItems: backlogItems.length,
      estimatedCount: estimatedBacklog.length,
      specifiedCount: specBacklog.length,
      criteriaCount: specBacklog.length,
      conflictsCount: unresolvedConflicts.length,
      status: scoreToStatus(backlogReadinessScore),
    },
    sprintDelivery,
    indicators,
    warnings,
    criticalFactors: criticalImpairments,
    riskSummary: {
      total: riskResult.counts.all,
      open: riskResult.counts.open,
      acknowledged: riskResult.counts.acknowledged,
      resolved: riskResult.counts.resolved,
      criticalCount: criticalRisks.length,
      highCount: highRisks.length,
    },
    workloadAndCapacity: {
      totalCommittedHours,
      totalTeamCapacity: totalCapacity,
      utilizationRate: capacityUtilization,
      overloadedCount,
      unassignedCount: unassignedTasks.length,
    },
    calculationVersion: "4.0",
    calculatedBy,
    calculatedAt: new Date(),
  };

  const persistedSnapshot = await ScrumHealthSnapshot.create(snapshotData);

  const payload = {
    ...snapshotData,
    _id: persistedSnapshot._id,
  };

  if (io && typeof io.to === "function") {
    io.to(`project:${projectId}`).emit("scrum:health:updated", payload);
    io.to(`team:${teamId}`).emit("scrum:health:updated", payload);
  }

  logger.info("[scrumHealthService] Scrum health calculated & persisted", {
    projectId: projectId.toString(),
    scope: assessmentScope,
    overallScore,
    grade,
  });

  return payload;
}

export async function getLatestScrumHealth(projectId) {
  return await ScrumHealthSnapshot.findOne({ projectId }).sort({ calculatedAt: -1, createdAt: -1 });
}

export const calculateScrumHealth = async (id, teamId, options = {}) => {
  return computeScrumHealth(id, options.io || null, options.userId || null);
};

export const recalculateScrumHealth = async (id, teamId, userId = null, io = null) => {
  return computeScrumHealth(id, io, userId);
};

export default {
  computeScrumHealth,
  calculateScrumHealth,
  recalculateScrumHealth,
  getLatestScrumHealth,
  scoreToGrade,
  scoreToStatus,
};
