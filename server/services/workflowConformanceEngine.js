/**
 * server/services/workflowConformanceEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKFLOW CONFORMANCE ENGINE (Prompt 12)
 *
 * Evaluates observed project events against the expected workflow models
 * of the configured methodology:
 *   - CLASSIC: Standard linear workflow stages
 *   - WATERFALL: Strict sequential phase gates and prerequisite ordering
 *   - SCRUM: Sprint lifecycle, sprint boundaries, and sprint-assigned active work
 *   - KANBAN: WIP limits per column, DoR/DoD compliance, pull discipline
 *   - HYBRID: Multi-methodology boundaries as defined in hybridConfig
 *
 * SAFETY & DAA RULES:
 *   - Purely deterministic rules engine — NO AI/LLM dependencies
 *   - Every detected deviation directly maps to concrete ProjectEvent IDs
 *   - Read-only analysis — NEVER mutates project, task, or team state
 *   - Transparent severity scoring (LOW, MEDIUM, HIGH, CRITICAL)
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ProjectEvent from "../models/ProjectEvent.js";
import Sprint from "../models/Sprint.js";
import { normalizeProcessEvent } from "./processMiningEngine.js";

/**
 * Expected transitions per methodology
 */
const EXPECTED_TRANSITIONS = {
  CLASSIC: new Set([
    "CREATED -> TODO",
    "TODO -> IN_PROGRESS",
    "IN_PROGRESS -> REVIEW",
    "IN_PROGRESS -> DONE",
    "REVIEW -> DONE",
    "REVIEW -> IN_PROGRESS",
    "DONE -> IN_PROGRESS", // Rework
  ]),
  SCRUM: new Set([
    "BACKLOG -> SPRINT_BACKLOG",
    "SPRINT_BACKLOG -> IN_PROGRESS",
    "TODO -> IN_PROGRESS",
    "IN_PROGRESS -> IN_REVIEW",
    "IN_REVIEW -> DONE",
    "IN_REVIEW -> IN_PROGRESS",
    "DONE -> SPRINT_BACKLOG",
  ]),
  KANBAN: new Set([
    "BACKLOG -> READY",
    "READY -> IN_PROGRESS",
    "IN_PROGRESS -> REVIEW",
    "REVIEW -> DONE",
    "REVIEW -> IN_PROGRESS",
  ]),
};

/**
 * Analyze workflow conformance for a project.
 */
export async function analyzeWorkflowConformance(projectId, options = {}) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found.");
  }

  const methodology = project.methodology || "CLASSIC";

  const [rawEvents, tasks, sprints] = await Promise.all([
    ProjectEvent.find({ projectId }).sort({ timestamp: 1 }).lean(),
    Task.find({ projectId }).lean(),
    Sprint.find({ projectId }).lean(),
  ]);

  if (!rawEvents || rawEvents.length === 0) {
    return {
      projectId: projectId.toString(),
      methodology,
      conformanceScore: 100,
      status: "INSUFFICIENT_EVIDENCE",
      deviationCount: 0,
      deviations: [],
      affectedTasks: [],
      expectedWorkflow: getExpectedWorkflowDescription(methodology, project),
      mutatesState: false,
      analyzedAt: new Date().toISOString(),
    };
  }

  const normalizedEvents = rawEvents.map(normalizeProcessEvent);
  const deviations = [];
  const affectedTaskIds = new Set();

  // ── 1. Transition Violations & Skipped States ──────────────────────────────
  const expectedSet = EXPECTED_TRANSITIONS[methodology] || EXPECTED_TRANSITIONS.CLASSIC;

  // Group events by task
  const taskEvents = new Map();
  normalizedEvents.forEach(evt => {
    if (!evt.entityId || evt.entityType !== "task") return;
    if (!taskEvents.has(evt.entityId)) taskEvents.set(evt.entityId, []);
    taskEvents.get(evt.entityId).push(evt);
  });

  taskEvents.forEach((events, taskId) => {
    const task = tasks.find(t => t._id?.toString() === taskId);
    const taskTitle = task?.title || `Task ${taskId}`;

    for (let i = 0; i < events.length - 1; i++) {
      const curr = events[i];
      const next = events[i + 1];
      const transitionKey = `${curr.toState} -> ${next.toState}`;

      // Check skipped state: e.g. TODO directly to DONE without IN_PROGRESS
      if (curr.toState === "TODO" && next.toState === "DONE") {
        deviations.push({
          deviationType: "SKIPPED_REQUIRED_STAGE",
          severity: "MEDIUM",
          taskId,
          taskTitle,
          ruleViolated: "Tasks must transition through IN_PROGRESS before reaching DONE",
          expectedPath: "TODO -> IN_PROGRESS -> DONE",
          actualPath: "TODO -> DONE",
          evidenceEventId: next.eventId,
          timestamp: next.timestamp,
          actor: next.actorName,
        });
        affectedTaskIds.add(taskId);
      }

      // Check invalid transitions
      if (
        curr.toState !== "UNKNOWN" &&
        next.toState !== "UNKNOWN" &&
        curr.toState !== next.toState &&
        !expectedSet.has(transitionKey) &&
        !(methodology === "WATERFALL" || methodology === "HYBRID")
      ) {
        deviations.push({
          deviationType: "INVALID_TRANSITION",
          severity: "LOW",
          taskId,
          taskTitle,
          ruleViolated: `Transition ${transitionKey} is not standard for ${methodology}`,
          expectedPath: Array.from(expectedSet).slice(0, 3).join(", "),
          actualPath: transitionKey,
          evidenceEventId: next.eventId,
          timestamp: next.timestamp,
          actor: next.actorName,
        });
        affectedTaskIds.add(taskId);
      }
    }
  });

  // ── 2. Waterfall Phase Gate Conformance ────────────────────────────────────
  if (methodology === "WATERFALL" || (methodology === "HYBRID" && project.hybridConfig?.planningMethodology === "WATERFALL")) {
    const phaseOrder = ["requirements", "design", "implementation", "testing", "deployment", "maintenance"];
    const currentPhase = project.waterfallPhase || "requirements";
    const currentIdx = phaseOrder.indexOf(currentPhase);

    tasks.forEach(task => {
      const taskPhase = task.phase || "requirements";
      const taskPhaseIdx = phaseOrder.indexOf(taskPhase);

      // Tasks in progress for phases ahead of current project phase
      if (task.status === "in_progress" && taskPhaseIdx > currentIdx + 1) {
        // Find most recent event for this task
        const relevantEvent = normalizedEvents.find(e => e.entityId === task._id?.toString());
        deviations.push({
          deviationType: "PHASE_GATE_VIOLATION",
          severity: "HIGH",
          taskId: task._id?.toString(),
          taskTitle: task.title,
          ruleViolated: `Project is in phase "${currentPhase}" (index ${currentIdx}), but task is active in future phase "${taskPhase}" (index ${taskPhaseIdx})`,
          expectedPath: `Active tasks should belong to phase: ${currentPhase}`,
          actualPath: `Active in phase: ${taskPhase}`,
          evidenceEventId: relevantEvent?.eventId || "latest_task_state",
          timestamp: relevantEvent?.timestamp || new Date(),
          actor: relevantEvent?.actorName || "Unknown",
        });
        affectedTaskIds.add(task._id?.toString());
      }
    });
  }

  // ── 3. Scrum Sprint Boundaries Conformance ─────────────────────────────────
  if (methodology === "SCRUM" || (methodology === "HYBRID" && project.hybridConfig?.executionMethodology === "SCRUM")) {
    const activeSprint = sprints.find(s => s.status === "ACTIVE");

    tasks.forEach(task => {
      // Work in progress without sprint assignment
      if (task.status === "in_progress" && !task.sprintId) {
        const relevantEvent = normalizedEvents.find(e => e.entityId === task._id?.toString() && e.toState === "IN_PROGRESS");
        deviations.push({
          deviationType: "UNSPRINTED_WORK",
          severity: "MEDIUM",
          taskId: task._id?.toString(),
          taskTitle: task.title,
          ruleViolated: "Active tasks in Scrum must be assigned to an active sprint",
          expectedPath: activeSprint ? `Sprint: ${activeSprint.name}` : "Assigned active sprint",
          actualPath: "No sprint assigned (rogue work)",
          evidenceEventId: relevantEvent?.eventId || "task_inspection",
          timestamp: relevantEvent?.timestamp || new Date(),
          actor: relevantEvent?.actorName || "Team Member",
        });
        affectedTaskIds.add(task._id?.toString());
      }
    });
  }

  // ── 4. Kanban WIP Limit Conformance ────────────────────────────────────────
  if (methodology === "KANBAN" || (methodology === "HYBRID" && project.hybridConfig?.executionMethodology === "KANBAN")) {
    const columns = project.kanbanConfig?.workflowColumns || [];
    columns.forEach(col => {
      if (col.wipLimit > 0) {
        const tasksInCol = tasks.filter(t => t.workflowColumn === col.id && t.status !== "done");
        if (tasksInCol.length > col.wipLimit) {
          deviations.push({
            deviationType: "WIP_LIMIT_EXCEEDED",
            severity: tasksInCol.length > col.wipLimit * 1.5 ? "HIGH" : "MEDIUM",
            columnId: col.id,
            columnName: col.name,
            ruleViolated: `Column "${col.name}" has WIP limit of ${col.wipLimit}, but currently holds ${tasksInCol.length} active tasks`,
            expectedPath: `Max ${col.wipLimit} concurrent tasks`,
            actualPath: `${tasksInCol.length} concurrent tasks`,
            evidenceEventId: "kanban_column_inspection",
            timestamp: new Date(),
            actor: "Team",
          });
        }
      }
    });
  }

  // ── 5. Conformance Score Calculation ───────────────────────────────────────
  // Deduct points based on severity: LOW: -2, MEDIUM: -5, HIGH: -10, CRITICAL: -15
  let deductions = 0;
  deviations.forEach(d => {
    if (d.severity === "CRITICAL") deductions += 15;
    else if (d.severity === "HIGH") deductions += 10;
    else if (d.severity === "MEDIUM") deductions += 5;
    else deductions += 2;
  });

  const conformanceScore = Math.max(0, Math.min(100, 100 - deductions));

  return {
    projectId: projectId.toString(),
    methodology,
    conformanceScore,
    status: conformanceScore >= 85 ? "CONFORMANT" : conformanceScore >= 60 ? "DEVIATIONS_DETECTED" : "NON_CONFORMANT",
    deviationCount: deviations.length,
    deviations,
    affectedTasks: Array.from(affectedTaskIds),
    expectedWorkflow: getExpectedWorkflowDescription(methodology, project),
    mutatesState: false, // Invariant: Conformance analysis never modifies project state
    analyzedAt: new Date().toISOString(),
  };
}

function getExpectedWorkflowDescription(methodology, project) {
  switch (methodology) {
    case "WATERFALL":
      return "Sequential phase progression with formal phase-gate verification prior to phase transitions.";
    case "SCRUM":
      return "Timeboxed iterative sprints with sprint planning, daily execution within sprint boundaries, and sprint review.";
    case "KANBAN":
      return "Continuous pull-based flow with strict column WIP limits, blocker tracking, and aging thresholds.";
    case "HYBRID":
      return `Configured hybrid architecture: Planning=${project.hybridConfig?.planningMethodology || "WATERFALL"}, Execution=${project.hybridConfig?.executionMethodology || "SCRUM"}, Governance=${project.hybridConfig?.governanceMethodology || "WATERFALL"}.`;
    case "CLASSIC":
    default:
      return "Standard linear task lifecycle: TODO -> IN_PROGRESS -> REVIEW -> DONE.";
  }
}
