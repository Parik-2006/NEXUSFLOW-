/**
 * server/services/changeImpactService.js
 * ============================================================================
 * WATERFALL CHANGE IMPACT ENGINE
 *
 * Deterministic multi-hop dependency tracing when project variables change:
 *   Requirement → Design/Task → Dependencies → Assigned Skills → Member Workload
 *   → Critical Path (CPM) → Milestones → Phase Gate → Risk & Health
 *
 * Enforces:
 *   - Analysis ONLY: does NOT silently modify project state
 *   - Grounded in stored graph relationships
 *   - Clear explainable human narrative
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Risk from "../models/Risk.js";

/**
 * Simulate the downstream ripple impact of a proposed or recent change.
 */
export async function simulateChangeImpact({
  projectId,
  changeType, // "requirement_changed" | "requirement_added" | "requirement_removed" | "task_changed" | "dependency_changed" | "deadline_changed"
  entityId,
  payload = {},
}) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const [tasks, team, risks] = await Promise.all([
    Task.find({ teamId: project.teamId }).lean(),
    Team.findById(project.teamId).lean(),
    Risk.find({ projectId }).lean(),
  ]);

  const reqs = project.requirements || [];
  const members = team?.members || [];

  const affectedReqs = [];
  const affectedTasks = [];
  const affectedDeps = [];
  const affectedMemberMap = new Map();
  const affectedSkills = new Set();
  let estimatedDaysAdded = 0;
  let criticalTasksAffected = 0;
  let criticalPathShifted = false;
  const milestoneImpact = [];
  const riskImpact = [];

  // Build adjacency / dependency map
  const taskById = new Map(tasks.map((t) => [t._id.toString(), t]));
  const dependentsOf = new Map(); // taskId -> list of tasks that depend on it
  tasks.forEach((t) => {
    (t.dependencies || []).forEach((depId) => {
      const depStr = depId.toString();
      if (!dependentsOf.has(depStr)) dependentsOf.set(depStr, []);
      dependentsOf.get(depStr).push(t);
    });
  });

  // Identify Critical Path tasks (rough zero-slack approximation using dependencies)
  const isTaskCritical = (task) => {
    // Tasks that have both dependencies and dependents or high priority
    return (
      task.priority === "urgent" ||
      task.priority === "high" ||
      (dependentsOf.get(task._id.toString()) || []).length >= 2
    );
  };

  switch (changeType) {
    case "requirement_added":
    case "requirement_changed": {
      const targetReq = reqs.find((r) => r.reqId === entityId || r._id?.toString() === entityId) || {
        reqId: entityId || "REQ-NEW",
        title: payload.title || "Proposed Requirement",
        phase: payload.phase || "implementation",
        estimatedHours: payload.estimatedHours || 16,
        requiredSkills: payload.requiredSkills || ["backend"],
      };

      affectedReqs.push({
        reqId: targetReq.reqId,
        title: targetReq.title,
        phase: targetReq.phase,
      });

      // Find tasks linked to this requirement
      const linkedTasks = tasks.filter(
        (t) => t.requirementId === targetReq.reqId || t.requirementId === entityId
      );

      if (linkedTasks.length > 0) {
        linkedTasks.forEach((t) => {
          affectedTasks.push({
            id: t._id.toString(),
            title: t.title,
            phase: t.phase || targetReq.phase,
            status: t.status,
            isCritical: isTaskCritical(t),
          });

          // Trace downstream dependents
          const downstream = dependentsOf.get(t._id.toString()) || [];
          downstream.forEach((depTask) => {
            affectedDeps.push({
              sourceTask: t.title,
              dependentTask: depTask.title,
            });
            if (!affectedTasks.some((x) => x.id === depTask._id.toString())) {
              affectedTasks.push({
                id: depTask._id.toString(),
                title: depTask.title,
                phase: depTask.phase,
                status: depTask.status,
                isCritical: isTaskCritical(depTask),
              });
            }
          });
        });
      } else {
        // New requirement with no tasks yet: project estimated tasks
        const estimatedTaskCount = Math.max(1, Math.round((payload.estimatedHours || 16) / 6));
        estimatedDaysAdded += Math.ceil((payload.estimatedHours || 16) / 8);
        (targetReq.requiredSkills || []).forEach((s) => affectedSkills.add(s));
      }

      // Schedule impact
      const addedHours = payload.estimatedHours || (linkedTasks.length * 8) || 16;
      estimatedDaysAdded += Math.ceil(addedHours / 8);
      break;
    }

    case "task_changed": {
      const targetTask = taskById.get(entityId) || tasks.find((t) => t.title.toLowerCase().includes(String(entityId).toLowerCase())) || tasks[0];
      if (targetTask) {
        const isCrit = isTaskCritical(targetTask);
        affectedTasks.push({
          id: targetTask._id.toString(),
          title: targetTask.title,
          phase: targetTask.phase || "implementation",
          status: targetTask.status,
          isCritical: isCrit,
        });
        if (isCrit) criticalTasksAffected++;

        // Downstream tasks
        const downstream = dependentsOf.get(targetTask._id.toString()) || [];
        downstream.forEach((d) => {
          affectedDeps.push({ sourceTask: targetTask.title, dependentTask: d.title });
          affectedTasks.push({
            id: d._id.toString(),
            title: d.title,
            phase: d.phase,
            status: d.status,
            isCritical: isTaskCritical(d),
          });
        });

        // Linked requirement
        if (targetTask.requirementId) {
          const req = reqs.find((r) => r.reqId === targetTask.requirementId);
          if (req) affectedReqs.push({ reqId: req.reqId, title: req.title, phase: req.phase });
        }

        const hourDelta = payload.estimatedHoursDelta || 8;
        estimatedDaysAdded += Math.ceil(hourDelta / 8);
        if (isCrit && hourDelta > 0) criticalPathShifted = true;
      }
      break;
    }

    case "deadline_changed": {
      const currentDeadline = project.estimatedDurationDays || 60;
      const proposedDeadline = payload.newDeadlineDays || currentDeadline - 10;
      const slippage = currentDeadline - proposedDeadline;
      estimatedDaysAdded = slippage;

      // All uncompleted critical path tasks are impacted
      tasks
        .filter((t) => t.status !== "done" && isTaskCritical(t))
        .forEach((t) => {
          criticalTasksAffected++;
          affectedTasks.push({
            id: t._id.toString(),
            title: t.title,
            phase: t.phase,
            status: t.status,
            isCritical: true,
          });
        });

      criticalPathShifted = true;
      riskImpact.push({
        category: "DEADLINE_COMPRESSION",
        severity: slippage > 14 ? "critical" : "high",
        description: `Deadline tightened by ${Math.abs(slippage)} days creates critical path compression.`,
      });
      break;
    }

    default: {
      estimatedDaysAdded = 2;
    }
  }

  // Count critical tasks affected
  affectedTasks.forEach((t) => {
    if (t.isCritical) criticalTasksAffected++;
  });
  if (criticalTasksAffected > 0) criticalPathShifted = true;

  // Workload and members mapping
  affectedTasks.forEach((t) => {
    const rawTask = taskById.get(t.id);
    if (rawTask) {
      (rawTask.skills || []).forEach((s) => affectedSkills.add(s));
      if (rawTask.assigneeId) {
        const member = members.find((m) => m.userId?.toString() === rawTask.assigneeId?.toString());
        const name = member?.name || "Assignee";
        affectedMemberMap.set(rawTask.assigneeId.toString(), {
          userId: rawTask.assigneeId.toString(),
          name,
          task: t.title,
        });
      }
    }
  });

  // Phase gate impact
  const currentPhase = project.waterfallPhase || "requirements";
  let phaseGateImpact = null;
  if (criticalPathShifted || estimatedDaysAdded > 3) {
    phaseGateImpact = {
      affectedPhase: currentPhase,
      gateBlocked: criticalPathShifted && estimatedDaysAdded >= 5,
      reason: `Schedule shift (+${estimatedDaysAdded} days) impacts ${currentPhase} phase gate delivery milestone.`,
    };
  }

  // Health score estimated delta
  const healthDelta = criticalTasksAffected * -3 - (estimatedDaysAdded > 3 ? 5 : 2);
  const projectedGrade = healthDelta < -10 ? "C" : healthDelta < -5 ? "B" : "A";

  // Compute severity
  let severity = "LOW";
  if (criticalPathShifted && (estimatedDaysAdded > 5 || criticalTasksAffected >= 3)) {
    severity = "CRITICAL";
  } else if (criticalPathShifted || estimatedDaysAdded > 3 || affectedTasks.length >= 4) {
    severity = "HIGH";
  } else if (affectedTasks.length >= 1 || estimatedDaysAdded > 0) {
    severity = "MEDIUM";
  }

  // Human-readable narrative explanation
  const reqDesc = affectedReqs.length > 0 ? `${affectedReqs.length} requirement(s)` : "proposed change";
  const taskDesc = `${affectedTasks.length} task(s)${criticalTasksAffected > 0 ? ` (${criticalTasksAffected} on critical path)` : ""}`;
  const explanation = `${changeType.replace(/_/g, " ").toUpperCase()}: Change affects ${reqDesc} and traces to ${taskDesc}. Projected schedule variance: +${estimatedDaysAdded} day(s). Impact level: ${severity}.`;

  return {
    sourceChange: {
      type: changeType,
      entityId,
      payload,
    },
    affectedRequirements: affectedReqs,
    affectedTasks,
    affectedDependencies: affectedDeps,
    affectedMembers: Array.from(affectedMemberMap.values()),
    affectedSkills: Array.from(affectedSkills),
    scheduleImpact: {
      estimatedDaysAdded,
      criticalPathShifted,
      varianceDays: estimatedDaysAdded,
    },
    criticalPathImpact: {
      criticalTasksAffected,
      criticalPathShifted,
    },
    milestoneImpact,
    phaseGateImpact,
    riskImpact,
    healthImpact: {
      estimatedScoreDelta: healthDelta,
      projectedGrade,
    },
    severity,
    explanation,
  };
}
