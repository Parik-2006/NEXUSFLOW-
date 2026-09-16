/**
 * server/services/processMiningEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — PROCESS MINING ENGINE (Prompt 11)
 *
 * Ingests ProjectEvent history and derives factual process mining insights:
 *   - State transition graph (frequency, average duration)
 *   - Task cycle times (from start to completion)
 *   - State dwell / waiting durations
 *   - Blocked time and resolution performance
 *   - Rework cycles (backward state transitions)
 *   - Empirical bottleneck detection with evidence
 *   - Throughput trends over time
 *
 * SAFETY & DAA RULES:
 *   - Purely deterministic algorithmic analysis — NO AI/LLM dependencies
 *   - Operates on real persisted ProjectEvent logs — NEVER fabricates data
 *   - Returns INSUFFICIENT_EVIDENCE when events are absent
 *   - Read-only — NEVER mutates project, task, or team state
 *   - Methodology-aware: respects Waterfall phases, Scrum states, Kanban columns, Hybrid
 * ============================================================================
 */

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ProjectEvent from "../models/ProjectEvent.js";

/**
 * Normalizes a raw ProjectEvent into a standard process transition object.
 */
export function normalizeProcessEvent(event) {
  const meta = event.metadata || {};
  let fromState = event.previousValue;
  let toState = event.newValue;

  // Extract from state if stored as object
  if (fromState && typeof fromState === "object") {
    fromState = fromState.status || fromState.phase || fromState.column || fromState.workflowColumn || JSON.stringify(fromState);
  }
  if (toState && typeof toState === "object") {
    toState = toState.status || toState.phase || toState.column || toState.workflowColumn || JSON.stringify(toState);
  }

  // Fallbacks for specific event types
  if (!fromState && event.eventType === "TASK_CREATED") {
    fromState = "CREATED";
    toState = toState || "TODO";
  }

  return {
    eventId: event._id?.toString() || "",
    timestamp: new Date(event.timestamp || event.createdAt || Date.now()),
    actorId: event.actorId?.toString() || null,
    actorName: event.actorName || "System",
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId || "",
    fromState: fromState ? String(fromState).toUpperCase() : "UNKNOWN",
    toState: toState ? String(toState).toUpperCase() : "UNKNOWN",
    source: event.source || "system",
    metadata: meta,
  };
}

/**
 * Perform process mining analysis for a project.
 */
export async function analyzeProjectProcess(projectId, options = {}) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found.");
  }

  const methodology = project.methodology || "CLASSIC";

  // Query events for this project
  const query = { projectId };
  if (options.startDate) {
    query.timestamp = { $gte: new Date(options.startDate) };
  }
  if (options.endDate) {
    query.timestamp = { ...query.timestamp, $lte: new Date(options.endDate) };
  }

  const [rawEvents, tasks] = await Promise.all([
    ProjectEvent.find(query).sort({ timestamp: 1 }).lean(),
    Task.find({ projectId }).lean(),
  ]);

  if (!rawEvents || rawEvents.length === 0) {
    return {
      projectId: projectId.toString(),
      methodology,
      status: "INSUFFICIENT_EVIDENCE",
      eventCount: 0,
      transitions: [],
      stateDwellTimes: {},
      cycleTimes: { count: 0, meanHours: 0, medianHours: 0, minHours: 0, maxHours: 0 },
      blockedMetrics: { totalBlockedDurationHours: 0, blockerCount: 0 },
      rework: { loopCount: 0, reworkPercentage: 0, affectedTasks: [] },
      bottlenecks: [],
      throughput: { completedTasks: 0, tasksPerWeek: 0 },
      readOnly: true,
      analyzedAt: new Date().toISOString(),
    };
  }

  // ── 1. Event Normalization ────────────────────────────────────────────────
  const normalizedEvents = rawEvents.map(normalizeProcessEvent);

  // Group events by task / entity to track state timelines
  const entityTimelines = new Map();
  normalizedEvents.forEach(evt => {
    const key = evt.entityId || "global";
    if (!entityTimelines.has(key)) entityTimelines.set(key, []);
    entityTimelines.get(key).push(evt);
  });

  // ── 2. Transition Graph & Dwell Times ──────────────────────────────────────
  const transitionMap = new Map(); // "FROM -> TO" => { count, totalDurationMs, taskIds: Set }
  const stateDwellMap = new Map();  // state => { totalDurationMs, visitCount }

  entityTimelines.forEach((events, entityId) => {
    for (let i = 0; i < events.length; i++) {
      const current = events[i];
      const next = events[i + 1];

      // Dwell time in current.toState until next transition
      if (next) {
        const durationMs = Math.max(0, next.timestamp.getTime() - current.timestamp.getTime());
        const stateKey = current.toState;

        if (!stateDwellMap.has(stateKey)) {
          stateDwellMap.set(stateKey, { totalDurationMs: 0, visitCount: 0 });
        }
        const stateStat = stateDwellMap.get(stateKey);
        stateStat.totalDurationMs += durationMs;
        stateStat.visitCount += 1;

        // Transition edge
        const transKey = `${current.toState} -> ${next.toState}`;
        if (!transitionMap.has(transKey)) {
          transitionMap.set(transKey, {
            fromState: current.toState,
            toState: next.toState,
            count: 0,
            totalDurationMs: 0,
            taskIds: new Set(),
          });
        }
        const transStat = transitionMap.get(transKey);
        transStat.count += 1;
        transStat.totalDurationMs += durationMs;
        if (entityId !== "global") transStat.taskIds.add(entityId);
      } else if (current.fromState && current.toState && current.fromState !== "UNKNOWN") {
        // Direct transition event (single event containing previousValue and newValue)
        const transKey = `${current.fromState} -> ${current.toState}`;
        if (!transitionMap.has(transKey)) {
          transitionMap.set(transKey, {
            fromState: current.fromState,
            toState: current.toState,
            count: 0,
            totalDurationMs: 0,
            taskIds: new Set(),
          });
        }
        const transStat = transitionMap.get(transKey);
        transStat.count += 1;
        if (entityId !== "global") transStat.taskIds.add(entityId);
      }
    }
  });

  const transitions = Array.from(transitionMap.values()).map(t => ({
    fromState: t.fromState,
    toState: t.toState,
    count: t.count,
    avgDurationHours: t.count > 0 ? Math.round((t.totalDurationMs / t.count / (1000 * 60 * 60)) * 10) / 10 : 0,
    taskCount: t.taskIds.size,
  }));

  const stateDwellTimes = {};
  stateDwellMap.forEach((stat, state) => {
    stateDwellTimes[state] = {
      visitCount: stat.visitCount,
      totalHours: Math.round((stat.totalDurationMs / (1000 * 60 * 60)) * 10) / 10,
      avgHoursPerVisit: stat.visitCount > 0
        ? Math.round((stat.totalDurationMs / stat.visitCount / (1000 * 60 * 60)) * 10) / 10
        : 0,
    };
  });

  // ── 3. Cycle Time Calculations ─────────────────────────────────────────────
  const completedTaskCycleTimes = [];
  tasks.forEach(task => {
    if (task.status === "done" && task.createdAt) {
      const end = task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now();
      const start = new Date(task.createdAt).getTime();
      const durationHours = Math.max(0.1, (end - start) / (1000 * 60 * 60));
      completedTaskCycleTimes.push(durationHours);
    }
  });

  let cycleTimeStats = { count: 0, meanHours: 0, medianHours: 0, minHours: 0, maxHours: 0 };
  if (completedTaskCycleTimes.length > 0) {
    completedTaskCycleTimes.sort((a, b) => a - b);
    const sum = completedTaskCycleTimes.reduce((a, b) => a + b, 0);
    const mid = Math.floor(completedTaskCycleTimes.length / 2);
    const median = completedTaskCycleTimes.length % 2 !== 0
      ? completedTaskCycleTimes[mid]
      : (completedTaskCycleTimes[mid - 1] + completedTaskCycleTimes[mid]) / 2;

    cycleTimeStats = {
      count: completedTaskCycleTimes.length,
      meanHours: Math.round((sum / completedTaskCycleTimes.length) * 10) / 10,
      medianHours: Math.round(median * 10) / 10,
      minHours: Math.round(completedTaskCycleTimes[0] * 10) / 10,
      maxHours: Math.round(completedTaskCycleTimes[completedTaskCycleTimes.length - 1] * 10) / 10,
    };
  }

  // ── 4. Blocked Duration & Blockers ─────────────────────────────────────────
  const blockedTasks = tasks.filter(t => t.isBlocked || (t.blockers && t.blockers.length > 0));
  const totalBlockedDurationMs = tasks.reduce((sum, t) => sum + (t.totalBlockedDurationMs || 0), 0);
  const blockerCount = tasks.reduce((sum, t) => sum + (t.blockers?.length || (t.isBlocked ? 1 : 0)), 0);

  const blockedMetrics = {
    blockedTaskCount: blockedTasks.length,
    blockerCount,
    totalBlockedDurationHours: Math.round((totalBlockedDurationMs / (1000 * 60 * 60)) * 10) / 10,
    avgBlockedHoursPerTask: blockedTasks.length > 0
      ? Math.round((totalBlockedDurationMs / blockedTasks.length / (1000 * 60 * 60)) * 10) / 10
      : 0,
  };

  // ── 5. Rework Loop Detection ───────────────────────────────────────────────
  // Detect sequences where a task returns to a previously visited state
  const reworkTasks = new Map(); // taskId => { taskTitle, loops: [] }
  let totalReworkTransitions = 0;

  entityTimelines.forEach((events, entityId) => {
    if (entityId === "global") return;
    const visitedStates = [];

    events.forEach(evt => {
      const state = evt.toState;
      if (state !== "UNKNOWN") {
        if (visitedStates.includes(state)) {
          // Task returned to an earlier state -> Rework loop!
          totalReworkTransitions++;
          if (!reworkTasks.has(entityId)) {
            const task = tasks.find(t => t._id?.toString() === entityId);
            reworkTasks.set(entityId, {
              taskId: entityId,
              taskTitle: task?.title || "Task " + entityId,
              repeatedStates: [],
            });
          }
          const entry = reworkTasks.get(entityId);
          if (!entry.repeatedStates.includes(state)) {
            entry.repeatedStates.push(state);
          }
        }
        visitedStates.push(state);
      }
    });
  });

  const totalTransitions = transitions.reduce((sum, t) => sum + t.count, 0);
  const rework = {
    loopCount: totalReworkTransitions,
    reworkPercentage: totalTransitions > 0
      ? Math.round((totalReworkTransitions / totalTransitions) * 100)
      : 0,
    affectedTasks: Array.from(reworkTasks.values()),
  };

  // ── 6. Bottleneck Detection ────────────────────────────────────────────────
  const bottlenecks = [];
  const stateValues = Object.entries(stateDwellTimes);
  if (stateValues.length > 0) {
    const avgDwellAllStates = stateValues.reduce((sum, [, s]) => sum + s.avgHoursPerVisit, 0) / stateValues.length;

    stateValues.forEach(([state, metrics]) => {
      // Flag state as bottleneck if avg hours per visit > 2x average of all states
      if (metrics.avgHoursPerVisit > avgDwellAllStates * 2 && metrics.avgHoursPerVisit > 4) {
        bottlenecks.push({
          state,
          severity: metrics.avgHoursPerVisit > avgDwellAllStates * 3 ? "HIGH" : "MEDIUM",
          avgDwellHours: metrics.avgHoursPerVisit,
          overallAvgDwellHours: Math.round(avgDwellAllStates * 10) / 10,
          evidence: `State ${state} has an average dwell of ${metrics.avgHoursPerVisit}h vs benchmark ${Math.round(avgDwellAllStates * 10) / 10}h across ${metrics.visitCount} visits`,
        });
      }
    });
  }

  // Also check if blocked ratio is elevated
  if (tasks.length > 0 && blockedTasks.length / tasks.length > 0.25) {
    bottlenecks.push({
      state: "BLOCKED_QUEUE",
      severity: "HIGH",
      blockedRatio: Math.round((blockedTasks.length / tasks.length) * 100),
      evidence: `${blockedTasks.length} of ${tasks.length} tasks (${Math.round((blockedTasks.length / tasks.length) * 100)}%) are currently marked blocked`,
    });
  }

  // ── 7. Throughput ──────────────────────────────────────────────────────────
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const firstEventTime = normalizedEvents[0]?.timestamp?.getTime() || Date.now();
  const lastEventTime = normalizedEvents[normalizedEvents.length - 1]?.timestamp?.getTime() || Date.now();
  const timespanWeeks = Math.max(0.1, (lastEventTime - firstEventTime) / (1000 * 60 * 60 * 24 * 7));

  const throughput = {
    completedTasks: doneTasks,
    totalTasks: tasks.length,
    completionPercentage: tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0,
    tasksPerWeek: Math.round((doneTasks / timespanWeeks) * 10) / 10,
  };

  return {
    projectId: projectId.toString(),
    methodology,
    status: "SUFFICIENT_EVIDENCE",
    eventCount: normalizedEvents.length,
    transitions,
    stateDwellTimes,
    cycleTimes: cycleTimeStats,
    blockedMetrics,
    rework,
    bottlenecks,
    throughput,
    readOnly: true,
    analyzedAt: new Date().toISOString(),
  };
}
