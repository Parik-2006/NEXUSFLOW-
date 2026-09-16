/**
 * server/services/methodologyDriftService.js
 * ============================================================================
 * NEXUSFLOW V4 — ADAPTIVE METHODOLOGY DRIFT MONITORING (Prompt 8)
 *
 * Detects when actual project behavior significantly differs from the
 * configured methodology. This is NOT automatic methodology switching.
 *
 * DRIFT STATES:
 *   NORMAL           — Behavior matches methodology expectations
 *   WATCH            — Minor deviations detected, monitoring
 *   DRIFT            — Significant behavioral deviation from methodology
 *   SIGNIFICANT_DRIFT — Persistent or severe deviation requiring attention
 *
 * SAFETY:
 *   - NEVER auto-switches methodology
 *   - NEVER modifies project state
 *   - Recommend only — user explicitly approves changes
 *   - AI may explain drift, but does NOT determine drift state
 *   - Purely deterministic analysis
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Sprint from "../models/Sprint.js";
import ProjectEvent from "../models/ProjectEvent.js";
import { recordProjectEvent } from "./eventService.js";

// ── Drift state thresholds ────────────────────────────────────────────────────
const THRESHOLDS = {
  WATCH: 15,             // drift score >= 15 → WATCH
  DRIFT: 35,             // drift score >= 35 → DRIFT
  SIGNIFICANT_DRIFT: 60, // drift score >= 60 → SIGNIFICANT_DRIFT
};

/**
 * Analyze methodology drift for a project.
 * Compares expected behavior (from configured methodology) to observed behavior.
 *
 * Returns a deterministic, explainable drift assessment.
 */
export async function analyzeMethodologyDrift(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const methodology = project.methodology || "WATERFALL";
  const tasks = await Task.find({ $or: [{ projectId }, { teamId: project.teamId }] }).lean();
  const team = await Team.findById(project.teamId).lean();

  // Get recent events (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await ProjectEvent.find({
    projectId,
    timestamp: { $gte: thirtyDaysAgo },
  }).sort({ timestamp: -1 }).lean();

  const indicators = [];
  let driftScore = 0;

  // ── Common metrics ──────────────────────────────────────────────────
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const blockedTasks = tasks.filter(t => t.isBlocked).length;
  const todoTasks = tasks.filter(t => t.status === "todo").length;

  // Blocked ratio
  const blockedRatio = totalTasks > 0 ? blockedTasks / totalTasks : 0;
  if (blockedRatio > 0.3) {
    driftScore += 15;
    indicators.push({
      area: "blocked_work",
      expected: "Less than 30% of tasks blocked",
      observed: `${Math.round(blockedRatio * 100)}% of tasks are blocked`,
      evidence: `${blockedTasks} of ${totalTasks} tasks blocked`,
      severity: "high",
      confidence: 0.85,
      suggestedAction: "Investigate root causes of blockers and consider methodology that handles blocked work better.",
    });
  } else if (blockedRatio > 0.15) {
    driftScore += 7;
    indicators.push({
      area: "blocked_work",
      expected: "Less than 15% of tasks blocked",
      observed: `${Math.round(blockedRatio * 100)}% of tasks are blocked`,
      evidence: `${blockedTasks} of ${totalTasks} tasks blocked`,
      severity: "medium",
      confidence: 0.7,
      suggestedAction: "Monitor blocker trends — may indicate process issue.",
    });
  }

  // ── Methodology-specific drift signals ──────────────────────────────

  if (methodology === "WATERFALL") {
    // Check: Are tasks being worked on out of phase order?
    const currentPhase = project.waterfallPhase || "requirements";
    const phaseOrder = ["requirements", "design", "implementation", "testing", "deployment", "maintenance"];
    const currentIdx = phaseOrder.indexOf(currentPhase);

    const outOfPhaseTasks = tasks.filter(t => {
      const taskPhaseIdx = phaseOrder.indexOf(t.phase || "requirements");
      return t.status === "in_progress" && taskPhaseIdx > currentIdx + 1;
    });

    if (outOfPhaseTasks.length > 0) {
      driftScore += 20;
      indicators.push({
        area: "phase_violation",
        expected: `Tasks should be in phase: ${currentPhase} or earlier`,
        observed: `${outOfPhaseTasks.length} tasks active in future phases`,
        evidence: outOfPhaseTasks.map(t => `"${t.title}" (phase: ${t.phase})`).slice(0, 3).join(", "),
        severity: "high",
        confidence: 0.9,
        suggestedAction: "Consider whether iterative (Scrum) or flow-based (Kanban) execution would better match actual behavior.",
      });
    }

    // Check: Is work being done iteratively (repeated status cycling)?
    const statusChangeEvents = events.filter(e => e.eventType === "TASK_STATUS_CHANGED");
    const taskStatusChanges = new Map();
    statusChangeEvents.forEach(e => {
      const tid = e.entityId;
      taskStatusChanges.set(tid, (taskStatusChanges.get(tid) || 0) + 1);
    });
    const highCyclingTasks = [...taskStatusChanges.values()].filter(c => c > 4).length;

    if (highCyclingTasks > 2) {
      driftScore += 15;
      indicators.push({
        area: "iterative_behavior",
        expected: "Waterfall tasks move linearly through phases",
        observed: `${highCyclingTasks} tasks show iterative status cycling (>4 transitions)`,
        evidence: "Tasks are cycling through statuses repeatedly — suggests iterative workflow",
        severity: "medium",
        confidence: 0.75,
        suggestedAction: "Project shows iterative patterns — Scrum or Hybrid may be more appropriate.",
      });
    }

  } else if (methodology === "SCRUM") {
    // Check: Sprint spillover / carry-over
    const sprints = await Sprint.find({ projectId }).sort({ createdAt: -1 }).limit(5).lean();
    const completedSprints = sprints.filter(s => s.status === "COMPLETED");

    if (completedSprints.length >= 2) {
      const avgCarryOver = completedSprints.reduce((sum, s) => sum + (s.carryOverItems?.length || 0), 0) / completedSprints.length;
      if (avgCarryOver > 3) {
        driftScore += 20;
        indicators.push({
          area: "sprint_spillover",
          expected: "Sprint carry-over should be minimal (< 2 items)",
          observed: `Average ${avgCarryOver.toFixed(1)} items carried over per sprint`,
          evidence: `Across ${completedSprints.length} completed sprints`,
          severity: "high",
          confidence: 0.85,
          suggestedAction: "Chronic sprint spillover suggests capacity mismatch or scope volatility — consider Kanban flow or Hybrid.",
        });
      } else if (avgCarryOver > 1) {
        driftScore += 8;
        indicators.push({
          area: "sprint_spillover",
          expected: "Sprint carry-over should be minimal (< 2 items)",
          observed: `Average ${avgCarryOver.toFixed(1)} items carried over per sprint`,
          evidence: `Across ${completedSprints.length} completed sprints`,
          severity: "medium",
          confidence: 0.7,
          suggestedAction: "Monitor sprint planning accuracy — consider reducing sprint scope.",
        });
      }
    }

    // Check: Are tasks being worked on without sprint assignment?
    const unsprintedActive = tasks.filter(t => t.status === "in_progress" && !t.sprintId).length;
    if (unsprintedActive > 2) {
      driftScore += 15;
      indicators.push({
        area: "unsprint_work",
        expected: "Active tasks should belong to a sprint in Scrum",
        observed: `${unsprintedActive} in-progress tasks have no sprint assignment`,
        evidence: "Work is being done outside sprint boundaries",
        severity: "medium",
        confidence: 0.8,
        suggestedAction: "If work regularly bypasses sprints, consider Kanban or Hybrid methodology.",
      });
    }

  } else if (methodology === "KANBAN") {
    // Check: WIP violations
    const kanbanConfig = project.kanbanConfig;
    if (kanbanConfig?.workflowColumns) {
      for (const col of kanbanConfig.workflowColumns) {
        if (col.wipLimit > 0) {
          const colTasks = tasks.filter(t => t.workflowColumn === col.id && t.status !== "done").length;
          if (colTasks > col.wipLimit * 1.5) {
            driftScore += 12;
            indicators.push({
              area: "wip_violation",
              expected: `Column "${col.name}" WIP limit: ${col.wipLimit}`,
              observed: `${colTasks} items in column (${Math.round((colTasks / col.wipLimit - 1) * 100)}% over limit)`,
              evidence: `Persistent WIP violation in "${col.name}"`,
              severity: "high",
              confidence: 0.9,
              suggestedAction: "Chronic WIP violations suggest need for process discipline or capacity adjustment.",
            });
          }
        }
      }
    }

    // Check: Are tasks aging excessively?
    const agingConfig = kanbanConfig?.agingThresholds || { warningDays: 3, criticalDays: 6 };
    const now = Date.now();
    const criticalAging = tasks.filter(t => {
      if (t.status === "done" || !t.activeStartedAt) return false;
      const ageDays = (now - new Date(t.activeStartedAt).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > agingConfig.criticalDays;
    }).length;

    if (criticalAging > 2) {
      driftScore += 15;
      indicators.push({
        area: "task_aging",
        expected: `Tasks complete within ${agingConfig.criticalDays} days`,
        observed: `${criticalAging} tasks exceed critical aging threshold`,
        evidence: "Multiple tasks stagnating in active columns",
        severity: "high",
        confidence: 0.8,
        suggestedAction: "Consider whether bottleneck is process-related or requires methodology adjustment.",
      });
    }

  } else if (methodology === "HYBRID") {
    // For Hybrid, check if the configured execution methodology is being followed
    const hConfig = project.hybridConfig;
    if (hConfig) {
      if (hConfig.executionMethodology === "SCRUM") {
        const unsprintedActive = tasks.filter(t => t.status === "in_progress" && !t.sprintId).length;
        if (unsprintedActive > 2) {
          driftScore += 12;
          indicators.push({
            area: "hybrid_execution_drift",
            expected: "Hybrid execution configured as SCRUM — tasks should use sprints",
            observed: `${unsprintedActive} in-progress tasks bypass sprint assignment`,
            evidence: "Execution behavior doesn't match configured Scrum execution model",
            severity: "medium",
            confidence: 0.75,
            suggestedAction: "Reconfigure hybrid execution methodology to match actual behavior, or enforce sprint discipline.",
          });
        }
      }
    }
  }

  // ── Backlog churn detection (all methodologies) ─────────────────────
  const taskCreatedEvents = events.filter(e => e.eventType === "TASK_CREATED").length;
  const taskDeletedEvents = events.filter(e => e.eventType === "TASK_DELETED" || e.eventType === "TASK_CANCELLED").length;
  if (taskCreatedEvents > 10 && taskDeletedEvents > taskCreatedEvents * 0.4) {
    driftScore += 10;
    indicators.push({
      area: "backlog_churn",
      expected: "Stable backlog with occasional additions",
      observed: `${taskCreatedEvents} tasks created, ${taskDeletedEvents} deleted/cancelled (${Math.round(taskDeletedEvents / taskCreatedEvents * 100)}% churn)`,
      evidence: "High backlog churn suggests requirement instability",
      severity: "medium",
      confidence: 0.7,
      suggestedAction: "High churn may indicate need for more adaptive methodology (Scrum/Kanban).",
    });
  }

  // ── Determine drift state ──────────────────────────────────────────
  let driftState = "NORMAL";
  if (driftScore >= THRESHOLDS.SIGNIFICANT_DRIFT) driftState = "SIGNIFICANT_DRIFT";
  else if (driftScore >= THRESHOLDS.DRIFT) driftState = "DRIFT";
  else if (driftScore >= THRESHOLDS.WATCH) driftState = "WATCH";

  // ── Generate recommendation (if drifting) ──────────────────────────
  let suggestedMethodology = null;
  let switchReason = null;

  if (driftState === "DRIFT" || driftState === "SIGNIFICANT_DRIFT") {
    // Determine which methodology the behavior most resembles
    const behaviorSignals = {
      iterativeBehavior: indicators.some(i => i.area === "iterative_behavior" || i.area === "sprint_spillover"),
      flowBehavior: indicators.some(i => i.area === "wip_violation" || i.area === "task_aging"),
      phaseViolation: indicators.some(i => i.area === "phase_violation"),
      unsprintedWork: indicators.some(i => i.area === "unsprint_work"),
    };

    if (methodology === "WATERFALL" && (behaviorSignals.iterativeBehavior || behaviorSignals.phaseViolation)) {
      suggestedMethodology = "SCRUM";
      switchReason = "Project shows iterative behavior patterns inconsistent with Waterfall.";
    } else if (methodology === "SCRUM" && behaviorSignals.unsprintedWork) {
      suggestedMethodology = "KANBAN";
      switchReason = "Work frequently bypasses sprint boundaries — continuous flow may be more suitable.";
    } else if (methodology === "SCRUM" && behaviorSignals.flowBehavior) {
      suggestedMethodology = "HYBRID";
      switchReason = "Sprint planning with continuous flow execution may better match actual behavior.";
    } else if (methodology === "KANBAN" && behaviorSignals.flowBehavior) {
      suggestedMethodology = "HYBRID";
      switchReason = "Persistent flow issues may benefit from structured governance overlay.";
    }
  }

  const result = {
    projectId: projectId.toString(),
    methodology,
    driftState,
    driftScore,
    indicators,
    suggestedMethodology,
    switchReason,
    analysisWindow: { from: thirtyDaysAgo.toISOString(), to: new Date().toISOString() },
    eventCount: events.length,
    taskMetrics: { total: totalTasks, done: doneTasks, inProgress: inProgressTasks, blocked: blockedTasks, todo: todoTasks },
    analyzedAt: new Date().toISOString(),
    deterministic: true,
    // CRITICAL: This analysis does NOT modify any project state
    mutatesState: false,
  };

  // Record drift analysis event
  if (driftState !== "NORMAL") {
    await recordProjectEvent({
      projectId,
      teamId: project.teamId,
      eventType: "METHODOLOGY_DRIFT_DETECTED",
      entityType: "methodology_drift",
      entityId: projectId.toString(),
      title: `Methodology drift detected: ${driftState}`,
      description: indicators.map(i => i.area).join(", "),
      newValue: { driftState, driftScore, suggestedMethodology },
      source: "drift_engine",
    });
  }

  return result;
}
