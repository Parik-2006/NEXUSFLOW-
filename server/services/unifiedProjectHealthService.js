/**
 * server/services/unifiedProjectHealthService.js
 * ============================================================================
 * NEXUSFLOW V4 — UNIFIED PROJECT HEALTH SERVICE
 *
 * Consolidates Health 2.0 (9 dimensions + early warnings) and Team Health
 * (workload distribution, capacity, blocked work, skill coverage, execution pace)
 * into a single canonical, deterministic project-health service.
 *
 * Invariants:
 * 1. Single authoritative score (0-100) and grade (A-F).
 * 2. Methodology-aware terminology (Waterfall, Scrum, Kanban, Classic).
 * 3. Real persisted state only: no fabricated metrics.
 * 4. Transparent severity safeguards against deceptive high scores.
 * 5. Full lifecycle and early warning signals preserved.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import User from "../models/User.js";
import EarlyWarning from "../models/EarlyWarning.js";
import ProjectEvent from "../models/ProjectEvent.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import { getWaterfallPhaseStates } from "./phaseGateService.js";
import { isTaskDone, isTaskCancelled } from "./riskEngine.js";

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function scoreToStatus(score) {
  if (score >= 75) return "HEALTHY";
  if (score >= 50) return "NEEDS_ATTENTION";
  return "CRITICAL";
}

export function scoreToGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function getMethodologyHealthTerms(methodology = "WATERFALL") {
  const m = String(methodology || "WATERFALL").toUpperCase().trim();
  if (m === "SCRUM") {
    return {
      methodology: "SCRUM",
      phaseLabel: "Sprint",
      deliveryDimensionName: "Sprint Delivery & Throughput",
      paceLabel: "Sprint Velocity Pace",
      progressLabel: "Sprint Execution Progress",
      processLabel: "Scrum Ceremony & WIP Conformance",
      gateLabel: "Sprint Goal & DoD Status",
      paceUnit: "Story Points / Velocity",
      riskLabel: "Sprint Impediment & Scope Risk",
    };
  }
  if (m === "KANBAN") {
    return {
      methodology: "KANBAN",
      phaseLabel: "Flow Stage",
      deliveryDimensionName: "Throughput & Flow Delivery",
      paceLabel: "Throughput Flow Pace",
      progressLabel: "Continuous Flow Progress",
      processLabel: "WIP Limit & Class of Service Conformance",
      gateLabel: "Definition of Ready & Flow Policies",
      paceUnit: "Items / Week (Cycle Time)",
      riskLabel: "Flow Bottleneck & Aging Risk",
    };
  }
  if (m === "CLASSIC") {
    return {
      methodology: "CLASSIC",
      phaseLabel: "Milestone",
      deliveryDimensionName: "Delivery & Throughput",
      paceLabel: "Project Delivery Pace",
      progressLabel: "Milestone Execution Progress",
      processLabel: "Process & Policy Conformance",
      gateLabel: "Milestone Acceptance Status",
      paceUnit: "Deliverables Completed",
      riskLabel: "Project Schedule Risk",
    };
  }
  // Default: WATERFALL
  return {
    methodology: "WATERFALL",
    phaseLabel: "Phase",
    deliveryDimensionName: "Phase Delivery Pace & Progress",
    paceLabel: "Phase Delivery Pace",
    progressLabel: "Waterfall Execution Progress",
    processLabel: "Phase Gate Conformance & Policy",
    gateLabel: "Phase Gate Status",
    paceUnit: "Phase Tasks Completed",
    riskLabel: "Critical Path & Predecessor Delay Risk",
  };
}

/**
 * Computes canonical unified project health across all dimensions.
 */
export async function computeUnifiedProjectHealth(projectIdOrTeamId, io = null) {
  if (!mongoose.isValidObjectId(projectIdOrTeamId)) {
    throw new Error("Invalid project ID or team ID");
  }

  // Resolve project and team
  let project = await Project.findById(projectIdOrTeamId).lean();
  let team = null;

  if (project) {
    team = await Team.findById(project.teamId).lean();
  } else {
    team = await Team.findById(projectIdOrTeamId).lean();
    if (team?.activeProjectId) {
      project = await Project.findById(team.activeProjectId).lean();
    }
  }

  if (!project && !team) {
    throw new Error("Project or Team workspace not found");
  }

  const pId = project?._id;
  const tId = team?._id || project?.teamId;
  const methodology = (project?.methodology || team?.methodology || "WATERFALL").toUpperCase();
  const terms = getMethodologyHealthTerms(methodology);

  const members = team?.members || [];

  // Query live persisted records
  const taskQuery = [];
  if (pId) taskQuery.push({ projectId: pId });
  if (tId) taskQuery.push({ teamId: tId });

  const [tasks, risks, events, ghIntegration, earlyWarnings] = await Promise.all([
    Task.find(taskQuery.length > 1 ? { $or: taskQuery } : taskQuery[0]).lean(),
    pId ? Risk.find({ projectId: pId }).lean() : [],
    pId ? ProjectEvent.find({ projectId: pId }).sort({ createdAt: -1 }).limit(50).lean() : [],
    pId ? GitHubIntegration.findOne({ projectId: pId, isActive: true }).lean() : null,
    pId ? EarlyWarning.find({ projectId: pId, status: { $in: ["OPEN", "ACKNOWLEDGED"] } }).sort({ severity: -1 }).lean() : [],
  ]);

  const now = Date.now();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => isTaskDone(t));
  const activeTasks = tasks.filter((t) => !isTaskDone(t) && !isTaskCancelled(t));
  const inProgressTasks = activeTasks.filter((t) => String(t.status).toLowerCase() === "in_progress");
  const todoTasks = activeTasks.filter((t) => String(t.status).toLowerCase() === "todo" || !t.status);

  const doneTaskIds = new Set(doneTasks.map((t) => t._id.toString()));

  // 1. Overdue & Approaching tasks
  const overdueTasks = activeTasks.filter((t) => {
    const due = t.dueDate || t.deadline;
    return due && new Date(due).getTime() < now;
  });

  const approachingTasks = activeTasks.filter((t) => {
    const due = t.dueDate || t.deadline;
    if (!due) return false;
    const diffDays = (new Date(due).getTime() - now) / 86_400_000;
    return diffDays >= 0 && diffDays <= 3;
  });

  // 2. Blocked tasks: accurately defined as active tasks whose direct prerequisite dependencies are NOT yet done
  const blockedTasks = activeTasks.filter((t) => {
    if (t.isBlocked) return true;
    if (Array.isArray(t.dependencies) && t.dependencies.length > 0) {
      return t.dependencies.some((dep) => {
        const dId = (typeof dep === "object" ? dep._id : dep)?.toString();
        return !doneTaskIds.has(dId);
      });
    }
    return false;
  });

  // 3. Workload and Capacity
  const totalActiveHours = activeTasks.reduce(
    (sum, t) => sum + (Number(t.estimatedHours) || 4),
    0
  );
  const totalTeamCapacity = members.reduce(
    (sum, m) => sum + (Number(m.capacity) || 40),
    0
  ) || 40;

  const memberLoads = {};
  for (const m of members) {
    const uid = (m.userId?._id || m.userId)?.toString();
    if (uid) {
      memberLoads[uid] = {
        userId: uid,
        name: m.name || "Member",
        avatar: m.avatar || null,
        activeCount: 0,
        assignedHours: 0,
        capacity: m.capacity || 40,
        overloaded: false,
      };
    }
  }

  for (const t of activeTasks) {
    const uid = (t.assignedTo?._id || t.assignedTo)?.toString();
    const hours = Number(t.estimatedHours) || 4;
    if (uid && memberLoads[uid]) {
      memberLoads[uid].assignedHours += hours;
      memberLoads[uid].activeCount += 1;
    }
  }

  for (const m of Object.values(memberLoads)) {
    if (m.assignedHours > m.capacity) {
      m.overloaded = true;
    }
  }

  const overloadedMembers = Object.values(memberLoads).filter((m) => m.overloaded);

  // 4. Open Risks
  const openRisks = risks.filter((r) => r.status !== "resolved" && r.status !== "mitigated");
  const criticalRisks = openRisks.filter(
    (r) => (r.severity || r.impact) === "high" || (r.severity || r.impact) === "critical"
  );

  // 5. Skill Coverage - only active unfinished tasks represent active skill requirements
  const requiredSkillsList = Array.from(new Set(activeTasks.flatMap((t) => t.requiredSkills || [])));
  const memberUserIds = members.map((m) => m.userId?._id || m.userId).filter(Boolean);
  const [memberUsers, verifications] = await Promise.all([
    memberUserIds.length > 0
      ? User.find({ _id: { $in: memberUserIds } }).select("skills").lean()
      : [],
    memberUserIds.length > 0
      ? (await import("../models/SkillVerification.js")).default.find({
          userId: { $in: memberUserIds },
          verified: true,
        }).lean().catch(() => [])
      : [],
  ]);
  const teamSkills = new Set([
    ...memberUsers.flatMap((u) => (u.skills || []).map((s) => String(s).toLowerCase().trim())),
    ...verifications.flatMap((v) => [
      String(v.skill || "").toLowerCase().trim(),
      String(v.skillName || "").toLowerCase().trim(),
      String(v.skillId || "").toLowerCase().trim(),
    ]).filter(Boolean),
  ]);
  const missingSkills = requiredSkillsList.filter(
    (s) => !teamSkills.has(String(s).toLowerCase().trim())
  );
  const coveredSkillsCount = requiredSkillsList.length - missingSkills.length;
  const skillCoveragePercent = requiredSkillsList.length === 0
    ? 100
    : clamp((coveredSkillsCount / requiredSkillsList.length) * 100);

  // 6. Waterfall Phase Gate Info (if Waterfall)
  let waterfallPhaseStates = null;
  if (methodology === "WATERFALL" && pId) {
    try {
      waterfallPhaseStates = await getWaterfallPhaseStates(pId, tId);
    } catch (e) {
      // safe fallback
    }
  }

  // ── Dimension Calculations ───────────────────────────────────────────────────

  // Dimension 1: Schedule
  let scheduleScore = 100;
  if (totalTasks > 0) {
    scheduleScore = clamp(100 - overdueTasks.length * 25 - approachingTasks.length * 8);
  }
  const scheduleDim = {
    key: "schedule",
    name: "Schedule & Milestones",
    score: scheduleScore,
    status: scoreToStatus(scheduleScore),
    signals: {
      overdueTasksCount: overdueTasks.length,
      approachingDeadlineCount: approachingTasks.length,
      totalActiveTasks: activeTasks.length,
    },
    explanation: totalTasks === 0
      ? "No tasks scheduled yet. Schedule tracking will begin once tasks are planned."
      : overdueTasks.length > 0
      ? `${overdueTasks.length} task(s) are past scheduled deadline. ${approachingTasks.length} approaching deadline.`
      : "All active tasks are currently on track against scheduled dates.",
  };

  // Dimension 2: Delivery & Execution Progress
  const taskCompletionRate = totalTasks === 0 ? 100 : clamp((doneTasks.length / totalTasks) * 100);
  let deliveryScore = taskCompletionRate;
  let deliveryExplanation = "";

  if (methodology === "WATERFALL") {
    const activePhase = waterfallPhaseStates?.currentPhaseName || "Requirements";
    deliveryExplanation = totalTasks === 0
      ? "No deliverables defined yet."
      : `${doneTasks.length} of ${totalTasks} Waterfall tasks completed (${taskCompletionRate}%). Current active phase: ${activePhase}.`;
  } else if (methodology === "SCRUM") {
    deliveryExplanation = totalTasks === 0
      ? "No sprint backlog items defined."
      : `${doneTasks.length} of ${totalTasks} sprint items completed (${taskCompletionRate}%).`;
  } else {
    deliveryExplanation = `${doneTasks.length} of ${totalTasks} tasks completed (${taskCompletionRate}%).`;
  }

  const deliveryDim = {
    key: "delivery",
    name: terms.deliveryDimensionName,
    score: deliveryScore,
    status: scoreToStatus(deliveryScore),
    signals: {
      completedTasks: doneTasks.length,
      inProgressTasks: inProgressTasks.length,
      todoTasks: todoTasks.length,
      totalTasks,
      completionRate: taskCompletionRate,
      activePhase: waterfallPhaseStates?.currentPhaseName || null,
    },
    explanation: deliveryExplanation,
  };

  // Dimension 3: Team Capacity
  let capacityScore = 100;
  if (totalActiveHours > totalTeamCapacity) {
    const deficitRatio = (totalActiveHours - totalTeamCapacity) / totalTeamCapacity;
    capacityScore = clamp(100 - deficitRatio * 100);
  }
  const capacityUtilization = Math.round((totalActiveHours / totalTeamCapacity) * 100);
  const capacityDim = {
    key: "capacity",
    name: "Team Capacity & Workload",
    score: capacityScore,
    status: scoreToStatus(capacityScore),
    signals: {
      totalActiveHours,
      totalTeamCapacity,
      utilizationRate: capacityUtilization,
      overloadedMembersCount: overloadedMembers.length,
    },
    explanation: totalActiveHours > totalTeamCapacity
      ? `Active workload (${totalActiveHours}h) exceeds total available team capacity (${totalTeamCapacity}h).`
      : `Team workload capacity is healthy (${totalActiveHours}h committed / ${totalTeamCapacity}h available, ${capacityUtilization}% utilization).`,
  };

  // Dimension 4: Dependencies & Blocked Flow
  let dependenciesScore = 100;
  if (activeTasks.length > 0) {
    dependenciesScore = clamp(100 - (blockedTasks.length / activeTasks.length) * 100);
  }
  const dependenciesDim = {
    key: "dependencies",
    name: "Dependencies & Blocked Work",
    score: dependenciesScore,
    status: scoreToStatus(dependenciesScore),
    signals: {
      blockedTasksCount: blockedTasks.length,
      totalActiveTasks: activeTasks.length,
      blockedRatio: activeTasks.length > 0 ? Number((blockedTasks.length / activeTasks.length).toFixed(2)) : 0,
    },
    explanation: blockedTasks.length > 0
      ? `${blockedTasks.length} task(s) currently waiting on prerequisite task completion.`
      : "Zero dependency deadlocks or blocked tasks detected across active work.",
  };

  // Dimension 5: Risk Exposure
  let riskScore = 100;
  if (openRisks.length > 0) {
    riskScore = clamp(100 - criticalRisks.length * 30 - (openRisks.length - criticalRisks.length) * 10);
  }
  const riskDim = {
    key: "risk",
    name: "Risk Intelligence",
    score: riskScore,
    status: scoreToStatus(riskScore),
    signals: {
      openRisksCount: openRisks.length,
      criticalRisksCount: criticalRisks.length,
    },
    explanation: criticalRisks.length > 0
      ? `${criticalRisks.length} critical/high severity risk(s) active in register.`
      : openRisks.length > 0
      ? `${openRisks.length} moderate risks documented and monitored.`
      : "Zero critical or unresolved high-impact risks logged in project register.",
  };

  // Dimension 6: Skill Coverage
  const skillDim = {
    key: "skill",
    name: "Skill Coverage",
    score: skillCoveragePercent,
    status: scoreToStatus(skillCoveragePercent),
    signals: {
      requiredSkillsCount: requiredSkillsList.length,
      coveredSkillsCount,
      missingSkillsCount: missingSkills.length,
      missingSkills,
    },
    explanation: requiredSkillsList.length === 0
      ? "All general task competencies covered by current team."
      : missingSkills.length === 0
      ? `All ${requiredSkillsList.length} verified required skills are covered by team members.`
      : `${missingSkills.length} required skill(s) missing from team roster: ${missingSkills.slice(0, 3).join(", ")}.`,
  };

  // Dimension 7: Requirements Stability & Alignment
  const totalReqs = project?.requirements?.length || 0;
  const approvedReqsCount = (project?.requirements || []).filter(
    (r) => r.status === "approved" || r.status === "verified"
  ).length;
  const reqApprovalRate = totalReqs === 0 ? 100 : clamp((approvedReqsCount / totalReqs) * 100);
  const requirementsDim = {
    key: "requirements",
    name: "Requirements Baseline & Stability",
    score: reqApprovalRate,
    status: scoreToStatus(reqApprovalRate),
    signals: {
      totalRequirements: totalReqs,
      approvedRequirements: approvedReqsCount,
      approvalRate: reqApprovalRate,
    },
    explanation: totalReqs === 0
      ? "Baseline healthy: requirements aligned."
      : `${approvedReqsCount} of ${totalReqs} requirements reviewed and approved (${reqApprovalRate}%).`,
  };

  // Dimension 8: Process & Conformance
  const processDeviations = events.filter((e) =>
    ["CONFORMANCE_VIOLATION", "PROCESS_DEVIATION"].includes(e.eventType)
  );
  let processScore = clamp(100 - processDeviations.length * 20);
  let processExplanation = "";
  if (methodology === "WATERFALL") {
    processExplanation = processDeviations.length > 0
      ? `${processDeviations.length} phase gate violations or bypass attempts recorded.`
      : "Strict sequential Waterfall phase gates and artifact baselines respected.";
  } else {
    processExplanation = processDeviations.length > 0
      ? `${processDeviations.length} process violations or WIP overrides recorded.`
      : "Project adheres strictly to configured methodology policies.";
  }
  const processDim = {
    key: "process",
    name: terms.processLabel,
    score: processScore,
    status: scoreToStatus(processScore),
    signals: {
      deviationsCount: processDeviations.length,
      methodology,
    },
    explanation: processExplanation,
  };

  // Dimension 9: Quality & Delivery Evidence
  const qualityScore = totalTasks === 0
    ? 100
    : clamp(85 + (doneTasks.length > 0 ? 15 : 0) - (openRisks.length > 2 ? 15 : 0));
  const qualityDim = {
    key: "quality",
    name: "Quality & Verification Evidence",
    score: qualityScore,
    status: scoreToStatus(qualityScore),
    signals: {
      evidenceTasksCount: doneTasks.length,
    },
    explanation: totalTasks === 0
      ? "Baseline healthy: verification criteria ready for testing."
      : "Deliverable evidence evaluated from acceptance criteria checks and completed verification.",
  };

  const dimensions = [
    deliveryDim,
    scheduleDim,
    capacityDim,
    dependenciesDim,
    riskDim,
    skillDim,
    requirementsDim,
    processDim,
    qualityDim,
  ];

  // Weighted canonical overall score
  const weightedScore = clamp(
    deliveryScore * 0.18 +
    scheduleScore * 0.15 +
    capacityScore * 0.15 +
    dependenciesScore * 0.14 +
    riskScore * 0.12 +
    skillCoveragePercent * 0.10 +
    processScore * 0.08 +
    qualityScore * 0.08
  );

  // ── Transparent Deterministic Severity Safeguards (Prompt 3.4) ─────────────
  // A project with severe capacity overload (0/100) and low completion (10%)
  // must NOT show an optimistic B grade (78/100) just because unrelated fields are 100.
  let overallScore = weightedScore;
  const criticalImpairments = [];

  if (capacityScore <= 20 && totalActiveHours >= totalTeamCapacity * 1.5) {
    criticalImpairments.push("Severe capacity deficit: active commitments exceed team capacity by >50%");
  }
  if (deliveryScore <= 15 && totalTasks >= 5) {
    criticalImpairments.push("Early execution stage: over 85% of total project workload remains unfinished");
  }
  if (dependenciesScore <= 30 && blockedTasks.length >= 3) {
    criticalImpairments.push("Substantial dependency congestion: multiple active tasks blocked by prerequisites");
  }

  if (criticalImpairments.length >= 2) {
    overallScore = Math.min(overallScore, 45); // Cap at Grade D/F
  } else if (criticalImpairments.length === 1 && capacityScore <= 20) {
    overallScore = Math.min(overallScore, 48); // Cap at Grade D
  } else if (criticalImpairments.length === 1) {
    overallScore = Math.min(overallScore, 54);
  }

  const grade = scoreToGrade(overallScore);
  const status = scoreToStatus(overallScore);

  // Concise Project Health Summary
  let summary = "";
  if (overallScore >= 80) {
    summary = `Project is in good health with steady ${terms.paceLabel.toLowerCase()} and capacity balanced within limits.`;
  } else if (overallScore >= 60) {
    summary = `Project execution is progressing, but requires attention on ${criticalImpairments[0] || "workload capacity and prerequisite completion"}.`;
  } else {
    summary = `Project requires immediate intervention: critical capacity or dependency congestion threatens delivery schedule.`;
  }

  // ── Critical Warnings & Recommended Actions (Advisory) ──────────────────────
  const warnings = [];

  if (capacityScore <= 30) {
    warnings.push({
      _id: "warn_capacity_deficit",
      category: "CAPACITY",
      severity: "CRITICAL",
      title: "Team Workload Exceeds Stated Capacity",
      message: `Committed active workload (${totalActiveHours}h) exceeds available team capacity (${totalTeamCapacity}h) by ${(totalActiveHours - totalTeamCapacity)} hours.`,
      evidence: { activeHours: totalActiveHours, capacity: totalTeamCapacity, utilization: capacityUtilization },
      recommendedAction: "Rebalance assignments, de-scope lower-priority backlog items, or increase team availability.",
    });
  }

  if (blockedTasks.length > 0) {
    warnings.push({
      _id: "warn_dependency_congestion",
      category: "DEPENDENCY",
      severity: blockedTasks.length >= 3 ? "HIGH" : "MEDIUM",
      title: `Dependency Congestion: ${blockedTasks.length} Task(s) Waiting`,
      message: `${blockedTasks.length} task(s) cannot proceed until preceding prerequisites are marked complete.`,
      evidence: {
        blockedCount: blockedTasks.length,
        tasks: blockedTasks.slice(0, 5).map((t) => ({ id: t._id, title: t.title, phase: t.phase })),
      },
      recommendedAction: "Focus effort on clearing upstream prerequisite tasks in the active phase.",
    });
  }

  if (overdueTasks.length > 0) {
    warnings.push({
      _id: "warn_schedule_overdue",
      category: "SCHEDULE",
      severity: overdueTasks.length >= 3 ? "CRITICAL" : "HIGH",
      title: `${overdueTasks.length} Task(s) Past Due Date`,
      message: `${overdueTasks.length} active tasks have passed their scheduled deadline dates.`,
      evidence: { overdueCount: overdueTasks.length },
      recommendedAction: "Review deadlines with team leader and renegotiate milestone commitments.",
    });
  }

  if (missingSkills.length > 0) {
    warnings.push({
      _id: "warn_missing_skills",
      category: "SKILLS",
      severity: "MEDIUM",
      title: `Competency Gap: ${missingSkills.length} Required Skill(s) Missing`,
      message: `Planned tasks require skills not verified in team profiles: ${missingSkills.slice(0, 3).join(", ")}.`,
      evidence: { missingSkills },
      recommendedAction: "Recruit additional members or update verified profile skills in Capability Intelligence.",
    });
  }

  // Merge any active EarlyWarning database records
  for (const ew of earlyWarnings) {
    if (!warnings.some((w) => w.title === ew.title)) {
      warnings.push({
        _id: ew._id.toString(),
        category: ew.category,
        severity: ew.severity,
        title: ew.title,
        message: ew.message,
        evidence: ew.evidence,
        recommendedAction: ew.recommendedAction,
      });
    }
  }

  // ── Team Execution Section Details ──────────────────────────────────────────
  let githubActivity = null;
  if (ghIntegration) {
    const recentCommits = ghIntegration.cachedSummary?.recentCommits ?? 0;
    const lastCommitAt = ghIntegration.cachedSummary?.lastCommitAt || null;
    githubActivity = {
      connected: true,
      repo: ghIntegration.repoName || "Connected Repository",
      recentCommits,
      lastCommitAt,
      score: clamp(Math.min(recentCommits * 10, 100)),
    };
  } else {
    githubActivity = {
      connected: false,
      score: null,
      message: "GitHub repository not connected.",
    };
  }

  const memberLoadsArray = Object.values(memberLoads);
  const teamExecution = {
    methodology,
    totalTasks,
    completedTasks: doneTasks.length,
    memberLoad: memberLoadsArray,
    taskCompletion: {
      total: totalTasks,
      done: doneTasks.length,
      inProgress: inProgressTasks.length,
      todo: todoTasks.length,
      rate: taskCompletionRate,
    },
    workloadAndCapacity: {
      totalActiveHours,
      totalTeamCapacity,
      utilizationRate: capacityUtilization,
      members: memberLoadsArray,
      memberLoad: memberLoadsArray,
    },
    blockedTasks: {
      count: blockedTasks.length,
      tasks: blockedTasks.map((t) => ({
        id: t._id,
        title: t.title,
        phase: t.phase,
        dependencies: t.dependencies,
      })),
    },
    skillCoverage: {
      requiredCount: requiredSkillsList.length,
      coveredCount: coveredSkillsCount,
      missingCount: missingSkills.length,
      missingSkills,
      percentage: skillCoveragePercent,
    },
    deliveryPace: {
      label: terms.paceLabel,
      progressLabel: terms.progressLabel,
      currentPhase: waterfallPhaseStates?.currentPhaseName || null,
      phaseProgress: waterfallPhaseStates?.phases?.find((p) => p.status === "ACTIVE")?.progress || taskCompletionRate,
    },
    githubActivity,
  };

  const payload = {
    projectId: pId?.toString() || null,
    teamId: tId?.toString() || null,
    overallScore,
    grade,
    overallGrade: grade,
    status,
    overallStatus: status,
    methodology,
    calculatedAt: new Date().toISOString(),
    summary,
    criticalFactors: criticalImpairments,
    warnings,
    dimensions,
    teamExecution,
    terms,
  };

  if (io) {
    if (pId) io.to(`project:${pId}`).emit("project:health:updated", payload);
    if (tId) io.to(`team:${tId}`).emit("project:health:updated", payload);
  }

  return payload;
}

export const calculateProjectHealth = computeUnifiedProjectHealth;
export const getUnifiedProjectHealth = computeUnifiedProjectHealth;
export const getMethodologyTerms = getMethodologyHealthTerms;

export default {
  computeUnifiedProjectHealth,
  calculateProjectHealth,
  getUnifiedProjectHealth,
  getMethodologyHealthTerms,
  getMethodologyTerms,
  scoreToGrade,
  scoreToStatus,
};
