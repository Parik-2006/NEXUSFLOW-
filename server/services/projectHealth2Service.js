/**
 * server/services/projectHealth2Service.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 24: PROJECT HEALTH 2.0 & EARLY WARNING SYSTEM
 *
 * Deterministic multi-dimensional health scoring engine with early warning
 * signals, deduplicated fingerprints, and full lifecycle management.
 *
 * 9 Deterministic Dimensions:
 * 1. Schedule
 * 2. Workload
 * 3. Dependencies
 * 4. Risk
 * 5. Requirements
 * 6. Process
 * 7. Team Capacity
 * 8. Delivery
 * 9. Quality/Evidence
 *
 * Invariants:
 * 1. Documented deterministic definitions and missing-data behavior.
 * 2. Warnings are deduplicated via stable fingerprints to prevent spam.
 * 3. Advisory only: warnings NEVER silently reassign, change deadlines or mutate state.
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import EarlyWarning from "../models/EarlyWarning.js";
import ProjectEvent from "../models/ProjectEvent.js";
import Requirement from "../models/Task.js"; // In V4 requirements are linked to tasks
import { logger } from "../utils/logger.js";

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function scoreToStatus(score) {
  if (score >= 75) return "HEALTHY";
  if (score >= 50) return "NEEDS_ATTENTION";
  return "CRITICAL";
}

function scoreToGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Evaluate deterministic health across all 9 dimensions and trigger early warnings.
 */
export async function evaluateProjectHealth2(projectId, io = null) {
  if (!mongoose.isValidObjectId(projectId)) throw new Error("Invalid project ID");

  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const team = await Team.findById(project.teamId).lean();
  const members = team?.members || [];

  const [tasks, risks, events] = await Promise.all([
    Task.find({ projectId }).lean(),
    Risk.find({ projectId }).lean(),
    ProjectEvent.find({ projectId }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  const now = Date.now();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done");
  const activeTasks = tasks.filter((t) => t.status !== "done");

  // Overdue & Approaching tasks
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

  // Blocked tasks
  const blockedTasks = activeTasks.filter(
    (t) => t.isBlocked || (Array.isArray(t.dependencies) && t.dependencies.length > 0 && t.status === "in_progress")
  );

  // Active hours & capacity
  const totalActiveHours = activeTasks.reduce(
    (sum, t) => sum + (Number(t.estimatedHours) || 4),
    0
  );
  const totalTeamCapacity = members.reduce(
    (sum, m) => sum + (Number(m.capacity) || 40),
    0
  ) || 40;

  // Member loads
  const memberLoads = {};
  for (const m of members) {
    const uid = (m.userId?._id || m.userId)?.toString();
    if (uid) memberLoads[uid] = { name: m.name, assignedHours: 0, capacity: m.capacity || 40 };
  }
  for (const t of activeTasks) {
    const uid = (t.assignedTo?._id || t.assignedTo)?.toString();
    if (uid && memberLoads[uid]) {
      memberLoads[uid].assignedHours += Number(t.estimatedHours) || 4;
    }
  }

  const overloadedMembers = Object.values(memberLoads).filter(
    (m) => m.assignedHours > m.capacity
  );

  // Open risks
  const openRisks = risks.filter((r) => r.status !== "resolved" && r.status !== "mitigated");
  const criticalRisks = openRisks.filter((r) => (r.severity || r.impact) === "high" || (r.severity || r.impact) === "critical");

  // Deviations / Conformance
  const processDeviations = events.filter((e) =>
    ["CONFORMANCE_VIOLATION", "PROCESS_DEVIATION"].includes(e.eventType)
  );

  // ── Dimension Calculations ───────────────────────────────────────────────────

  // 1. Schedule Dimension
  let scheduleScore = 100;
  if (totalTasks > 0) {
    scheduleScore = clamp(100 - overdueTasks.length * 25 - approachingTasks.length * 8);
  }
  const scheduleDim = {
    key: "schedule",
    name: "Schedule",
    score: scheduleScore,
    status: scoreToStatus(scheduleScore),
    signals: {
      overdueTasksCount: overdueTasks.length,
      approachingDeadlineCount: approachingTasks.length,
      totalActiveTasks: activeTasks.length,
    },
    explanation: totalTasks === 0
      ? "No tasks created yet. Schedule tracking will begin once tasks are scheduled."
      : overdueTasks.length > 0
      ? `${overdueTasks.length} task(s) are overdue. ${approachingTasks.length} approaching deadline.`
      : "All active tasks are currently on track against scheduled dates.",
  };

  // 2. Workload Dimension
  let workloadScore = 100;
  if (members.length > 0) {
    workloadScore = clamp(100 - overloadedMembers.length * 25);
  }
  const workloadDim = {
    key: "workload",
    name: "Workload",
    score: workloadScore,
    status: scoreToStatus(workloadScore),
    signals: {
      overloadedMembersCount: overloadedMembers.length,
      totalActiveHours,
      totalTeamCapacity,
    },
    explanation: overloadedMembers.length > 0
      ? `${overloadedMembers.length} member(s) exceed weekly capacity limits.`
      : "Team member workload is distributed within allocated capacities.",
  };

  // 3. Dependencies Dimension
  let dependenciesScore = 100;
  if (activeTasks.length > 0) {
    dependenciesScore = clamp(100 - blockedTasks.length * 25);
  }
  const dependenciesDim = {
    key: "dependencies",
    name: "Dependencies",
    score: dependenciesScore,
    status: scoreToStatus(dependenciesScore),
    signals: {
      blockedTasksCount: blockedTasks.length,
    },
    explanation: blockedTasks.length > 0
      ? `${blockedTasks.length} task(s) are blocked awaiting prerequisite completion.`
      : "No dependency deadlocks or blocked tasks detected.",
  };

  // 4. Risk Dimension
  let riskScore = 100;
  if (openRisks.length > 0) {
    riskScore = clamp(100 - criticalRisks.length * 30 - (openRisks.length - criticalRisks.length) * 10);
  }
  const riskDim = {
    key: "risk",
    name: "Risk",
    score: riskScore,
    status: scoreToStatus(riskScore),
    signals: {
      openRisksCount: openRisks.length,
      criticalRisksCount: criticalRisks.length,
    },
    explanation: criticalRisks.length > 0
      ? `${criticalRisks.length} high/critical severity risks are currently active.`
      : openRisks.length > 0
      ? `${openRisks.length} moderate risks logged in project register.`
      : "No critical or high probability risks open.",
  };

  // 5. Requirements Dimension
  const tasksWithCategory = tasks.filter((t) => t.category && t.category !== "general").length;
  const reqCoverageRatio = totalTasks > 0 ? tasksWithCategory / totalTasks : 1;
  const reqScore = clamp(reqCoverageRatio * 100);
  const requirementsDim = {
    key: "requirements",
    name: "Requirements",
    score: reqScore,
    status: scoreToStatus(reqScore),
    signals: {
      categorizedTasks: tasksWithCategory,
      totalTasks,
      coverageRatio: Number(reqCoverageRatio.toFixed(2)),
    },
    explanation: totalTasks === 0
      ? "Baseline healthy. Link requirements to tasks to track coverage."
      : `${Math.round(reqCoverageRatio * 100)}% of tasks have clear functional categorization and requirement linkage.`,
  };

  // 6. Process Dimension
  const processScore = clamp(100 - processDeviations.length * 20);
  const processDim = {
    key: "process",
    name: "Process & Conformance",
    score: processScore,
    status: scoreToStatus(processScore),
    signals: {
      deviationsCount: processDeviations.length,
      methodology: project.methodology || "CLASSIC",
    },
    explanation: processDeviations.length > 0
      ? `${processDeviations.length} process violations or gate bypass attempts recorded.`
      : "Project adheres strictly to configured methodology policies and phase gates.",
  };

  // 7. Team Capacity Dimension
  let capacityScore = 100;
  if (totalActiveHours > totalTeamCapacity) {
    const deficitRatio = (totalActiveHours - totalTeamCapacity) / totalTeamCapacity;
    capacityScore = clamp(100 - deficitRatio * 100);
  }
  const capacityDim = {
    key: "capacity",
    name: "Team Capacity",
    score: capacityScore,
    status: scoreToStatus(capacityScore),
    signals: {
      totalActiveHours,
      totalTeamCapacity,
      utilizationRate: Math.round((totalActiveHours / totalTeamCapacity) * 100),
    },
    explanation: totalActiveHours > totalTeamCapacity
      ? `Project active commitments (${totalActiveHours}h) exceed total team capacity (${totalTeamCapacity}h).`
      : `Team capacity healthy (${totalActiveHours}h committed / ${totalTeamCapacity}h available).`,
  };

  // 8. Delivery Dimension
  const deliveryScore = totalTasks === 0 ? 100 : clamp((doneTasks.length / totalTasks) * 100);
  const deliveryDim = {
    key: "delivery",
    name: "Delivery & Throughput",
    score: deliveryScore,
    status: scoreToStatus(deliveryScore),
    signals: {
      completedTasks: doneTasks.length,
      totalTasks,
      completionRate: totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 100,
    },
    explanation: totalTasks === 0
      ? "No tasks delivered yet."
      : `${doneTasks.length} of ${totalTasks} tasks completed (${deliveryScore}%).`,
  };

  // 9. Quality / Evidence Dimension
  const qualityScore = totalTasks === 0
    ? 100
    : clamp(85 + (doneTasks.length > 0 ? 15 : 0) - (openRisks.length > 2 ? 15 : 0));
  const qualityDim = {
    key: "quality",
    name: "Quality & Evidence",
    score: qualityScore,
    status: scoreToStatus(qualityScore),
    signals: {
      evidenceBackedTasks: doneTasks.length,
    },
    explanation: totalTasks === 0
      ? "Baseline healthy: no quality defects or failed deliverables recorded."
      : "Quality indicators evaluated from verification pass rates and completed deliverables.",
  };

  const dimensions = [
    scheduleDim,
    workloadDim,
    dependenciesDim,
    riskDim,
    requirementsDim,
    processDim,
    capacityDim,
    deliveryDim,
    qualityDim,
  ];

  // Weighted overall calculation
  const overallScore = clamp(
    scheduleScore * 0.18 +
    dependenciesScore * 0.15 +
    workloadScore * 0.12 +
    capacityScore * 0.12 +
    riskScore * 0.12 +
    deliveryScore * 0.11 +
    processScore * 0.08 +
    requirementsDim.score * 0.06 +
    qualityScore * 0.06
  );

  const grade = scoreToGrade(overallScore);

  // ── Early Warning Triggers & Deduplication ───────────────────────────────────
  const generatedWarnings = [];

  // Trigger 1: Critical Path / Overdue Delay
  if (overdueTasks.length > 0) {
    generatedWarnings.push({
      category: "SCHEDULE",
      triggerClass: "CRITICAL_PATH_DELAY",
      severity: overdueTasks.length >= 3 ? "CRITICAL" : "HIGH",
      title: `${overdueTasks.length} Task(s) Past Due Date`,
      message: `Tasks have breached their scheduled completion dates, threatening milestone delivery.`,
      evidence: {
        overdueCount: overdueTasks.length,
        tasks: overdueTasks.map((t) => ({ id: t._id.toString(), title: t.title, due: t.dueDate || t.deadline })),
      },
      recommendedAction: "Review task impediments, renegotiate due dates, or rebalance workload.",
      relatedEntities: overdueTasks.map((t) => ({ entityType: "task", entityId: t._id.toString(), title: t.title })),
      subjectId: "overdue_tasks",
    });
  }

  // Trigger 2: Dependency Blockage
  if (blockedTasks.length > 0) {
    generatedWarnings.push({
      category: "DEPENDENCY",
      triggerClass: "DEPENDENCY_BLOCKAGE",
      severity: "HIGH",
      title: `Dependency Blockage Detected (${blockedTasks.length} tasks)`,
      message: `${blockedTasks.length} task(s) are blocked by prerequisite tasks and cannot proceed.`,
      evidence: { blockedCount: blockedTasks.length },
      recommendedAction: "Expedite prerequisite blockers or temporarily decouple dependencies.",
      relatedEntities: blockedTasks.map((t) => ({ entityType: "task", entityId: t._id.toString(), title: t.title })),
      subjectId: "blocked_dependencies",
    });
  }

  // Trigger 3: Capacity Deficit
  if (totalActiveHours > totalTeamCapacity * 1.15) {
    generatedWarnings.push({
      category: "CAPACITY",
      triggerClass: "INSUFFICIENT_CAPACITY",
      severity: "MEDIUM",
      title: "Active Workload Exceeds Team Capacity",
      message: `Committed work (${totalActiveHours}h) exceeds available team capacity (${totalTeamCapacity}h) by ${Math.round(((totalActiveHours - totalTeamCapacity) / totalTeamCapacity) * 100)}%.`,
      evidence: { totalActiveHours, totalTeamCapacity },
      recommendedAction: "Defer lower priority backlog tasks or extend sprint/phase horizon.",
      relatedEntities: [],
      subjectId: "team_capacity",
    });
  }

  // Trigger 4: Overloaded Team Members
  if (overloadedMembers.length > 0) {
    generatedWarnings.push({
      category: "WORKLOAD",
      triggerClass: "MEMBER_OVERLOAD",
      severity: "MEDIUM",
      title: `Workload Imbalance: ${overloadedMembers.length} Member(s) Overloaded`,
      message: `${overloadedMembers.map((m) => m.name).join(", ")} assigned beyond weekly capacity.`,
      evidence: { overloadedMembers },
      recommendedAction: "Use Dynamic Team Assignment to rebalance tasks to available members.",
      relatedEntities: [],
      subjectId: "member_overload",
    });
  }

  // Trigger 5: Critical Risks
  if (criticalRisks.length > 0) {
    generatedWarnings.push({
      category: "RISK",
      triggerClass: "CRITICAL_RISK_EXPOSURE",
      severity: "CRITICAL",
      title: `Critical Risk Exposure (${criticalRisks.length} unmitigated)`,
      message: `Active high-severity risks threaten project objectives without complete mitigation plans.`,
      evidence: { criticalRisksCount: criticalRisks.length },
      recommendedAction: "Convene risk review meeting to establish preventive and contingency controls.",
      relatedEntities: criticalRisks.map((r) => ({ entityType: "risk", entityId: r._id.toString(), title: r.title })),
      subjectId: "critical_risks",
    });
  }

  // Save/Deduplicate Early Warnings
  const activeWarnings = [];
  for (const w of generatedWarnings) {
    const fingerprint = `${projectId.toString()}:${w.category}:${w.triggerClass}:${w.subjectId}`;

    let warningRecord = await EarlyWarning.findOne({
      fingerprint,
      status: { $in: ["OPEN", "ACKNOWLEDGED"] },
    });

    if (warningRecord) {
      warningRecord.lastSeen = new Date();
      warningRecord.occurrenceCount += 1;
      warningRecord.severity = w.severity;
      warningRecord.evidence = w.evidence;
      await warningRecord.save();
      activeWarnings.push(warningRecord);
    } else {
      warningRecord = await EarlyWarning.create({
        projectId: project._id,
        teamId: project.teamId,
        fingerprint,
        category: w.category,
        triggerClass: w.triggerClass,
        severity: w.severity,
        title: w.title,
        message: w.message,
        evidence: w.evidence,
        recommendedAction: w.recommendedAction,
        relatedEntities: w.relatedEntities,
        status: "OPEN",
      });
      activeWarnings.push(warningRecord);

      if (io) {
        io.to(`project:${projectId.toString()}`).emit("warning.opened", { warning: warningRecord });
      }
    }
  }

  // Auto-resolve warnings whose conditions no longer exist
  const existingOpenWarnings = await EarlyWarning.find({
    projectId,
    status: { $in: ["OPEN", "ACKNOWLEDGED"] },
  });

  for (const existing of existingOpenWarnings) {
    const stillActive = generatedWarnings.some(
      (w) => `${projectId.toString()}:${w.category}:${w.triggerClass}:${w.subjectId}` === existing.fingerprint
    );

    if (!stillActive) {
      existing.status = "RESOLVED";
      existing.resolvedBy = {
        name: "Deterministic Health Engine",
        at: new Date(),
        reason: "Condition resolved by verifiable project state changes.",
      };
      await existing.save();

      if (io) {
        io.to(`project:${projectId.toString()}`).emit("warning.resolved", { warning: existing });
      }
    }
  }

  const healthReport = {
    projectId: project._id.toString(),
    methodology: project.methodology || "CLASSIC",
    domain: project.domain || "General Software",
    overallScore,
    grade,
    status: scoreToStatus(overallScore),
    dimensions,
    activeWarnings,
    evaluatedAt: new Date(),
  };

  if (io) {
    io.to(`project:${projectId.toString()}`).emit("health.updated", { health: healthReport });
  }

  return healthReport;
}

/**
 * Acknowledge an early warning.
 */
export async function acknowledgeWarning(warningId, actor, io = null) {
  if (!mongoose.isValidObjectId(warningId)) throw new Error("Invalid warning ID");

  const warning = await EarlyWarning.findById(warningId);
  if (!warning) throw new Error("Warning not found");

  warning.status = "ACKNOWLEDGED";
  warning.acknowledgedBy = {
    userId: actor?._id || null,
    name: actor?.name || "Authorized User",
    at: new Date(),
  };
  await warning.save();

  if (io) {
    io.to(`project:${warning.projectId.toString()}`).emit("warning.acknowledged", { warning });
  }

  return warning;
}

/**
 * Manually resolve an early warning with reason.
 */
export async function resolveWarning(warningId, actor, reason = "", io = null) {
  if (!mongoose.isValidObjectId(warningId)) throw new Error("Invalid warning ID");

  const warning = await EarlyWarning.findById(warningId);
  if (!warning) throw new Error("Warning not found");

  warning.status = "RESOLVED";
  warning.resolvedBy = {
    userId: actor?._id || null,
    name: actor?.name || "Authorized User",
    at: new Date(),
    reason: reason || "Resolved by project lead.",
  };
  await warning.save();

  if (io) {
    io.to(`project:${warning.projectId.toString()}`).emit("warning.resolved", { warning });
  }

  return warning;
}

/**
 * Dismiss an early warning with authorized reason.
 */
export async function dismissWarning(warningId, actor, reason = "", io = null) {
  if (!mongoose.isValidObjectId(warningId)) throw new Error("Invalid warning ID");

  const warning = await EarlyWarning.findById(warningId);
  if (!warning) throw new Error("Warning not found");

  warning.status = "DISMISSED";
  warning.dismissedBy = {
    userId: actor?._id || null,
    name: actor?.name || "Authorized User",
    at: new Date(),
    reason: reason || "Dismissed with verified business justification.",
  };
  await warning.save();

  return warning;
}

/**
 * Fetch project warnings with status filters.
 */
export async function getProjectWarnings(projectId, { status } = {}) {
  if (!mongoose.isValidObjectId(projectId)) throw new Error("Invalid project ID");

  const query = { projectId };
  if (status) query.status = status;

  return EarlyWarning.find(query).sort({ severity: 1, lastSeen: -1 }).lean();
}
