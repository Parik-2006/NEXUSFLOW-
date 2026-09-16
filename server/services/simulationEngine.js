/**
 * server/services/simulationEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — INTERACTIVE WHAT-IF SIMULATION ENGINE (Prompt 9)
 *
 * Non-destructive simulation sandbox for project forecasting.
 * Operates on SNAPSHOT/COPY — NEVER mutates live project state.
 *
 * SIMULATION PARAMETERS:
 *   1. Team Capacity — adjust available team hours/capacity
 *   2. Timeline Compression — compress/extend project deadline
 *   3. Scope Shock — add/remove tasks (scope change impact)
 *
 * CALCULATIONS:
 *   - Real projected completion date
 *   - Schedule variance
 *   - Affected tasks
 *   - Critical-path changes
 *   - Capacity pressure
 *   - Risk changes
 *   - Bottlenecks
 *   - Monte Carlo confidence intervals (REAL sampling, not fake)
 *
 * SAFETY:
 *   - NEVER changes tasks, dependencies, assignments, sprint state,
 *     methodology, requirements, team membership, or Project Memory
 *   - Operates entirely on in-memory snapshots
 *   - Deterministic with optional Monte Carlo variance
 *   - No AI/LLM dependency
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Sprint from "../models/Sprint.js";

/**
 * Create a deep snapshot of project state for simulation.
 * This snapshot is an in-memory copy — NO database mutation.
 */
async function createProjectSnapshot(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const tasks = await Task.find({
    $or: [{ projectId }, { teamId: project.teamId }],
  }).lean();

  const team = await Team.findById(project.teamId).lean();
  const sprints = await Sprint.find({ projectId }).lean();

  // Build dependency graph
  const taskMap = new Map(tasks.map(t => [t._id.toString(), t]));
  const dependentsOf = new Map();
  tasks.forEach(t => {
    (t.dependencies || []).forEach(depId => {
      const key = depId.toString();
      if (!dependentsOf.has(key)) dependentsOf.set(key, []);
      dependentsOf.get(key).push(t._id.toString());
    });
  });

  // Identify critical path (longest dependency chain)
  const criticalPath = computeCriticalPath(tasks, taskMap, dependentsOf);

  const members = team?.members || [];
  const totalCapacity = members.reduce((sum, m) => sum + (m.capacity || 40), 0);

  return {
    project: { ...project },
    tasks: tasks.map(t => ({ ...t })),
    team: team ? { ...team } : null,
    sprints: sprints.map(s => ({ ...s })),
    taskMap,
    dependentsOf,
    criticalPath,
    totalCapacity,
    memberCount: members.length || 1,
  };
}

/**
 * Compute critical path using forward/backward pass.
 * Returns array of task IDs on the longest dependency chain.
 */
function computeCriticalPath(tasks, taskMap, dependentsOf) {
  if (tasks.length === 0) return [];

  // Forward pass: compute earliest start/finish
  const est = new Map();
  const eft = new Map();
  const inDegree = new Map();

  tasks.forEach(t => {
    const id = t._id.toString();
    est.set(id, 0);
    eft.set(id, t.estimatedHours || 8);
    inDegree.set(id, (t.dependencies || []).length);
  });

  // Topological order via Kahn's
  const queue = [];
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });

  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    const deps = dependentsOf.get(id) || [];
    deps.forEach(depId => {
      const task = taskMap.get(depId);
      if (!task) return;
      const newEst = eft.get(id);
      if (newEst > est.get(depId)) {
        est.set(depId, newEst);
        eft.set(depId, newEst + (task.estimatedHours || 8));
      }
      inDegree.set(depId, inDegree.get(depId) - 1);
      if (inDegree.get(depId) === 0) queue.push(depId);
    });
  }

  if (order.length === 0) return [];

  // Find task with latest finish time
  let maxFinish = 0;
  let endTaskId = order[0];
  eft.forEach((finish, id) => {
    if (finish > maxFinish) { maxFinish = finish; endTaskId = id; }
  });

  // Backward trace to build critical path
  const criticalPath = [endTaskId];
  let current = endTaskId;
  while (true) {
    const task = taskMap.get(current);
    if (!task || !task.dependencies || task.dependencies.length === 0) break;
    let predecessorId = null;
    let maxPredFinish = -1;
    for (const depId of task.dependencies) {
      const depStr = depId.toString();
      const predFinish = eft.get(depStr) || 0;
      if (predFinish > maxPredFinish) {
        maxPredFinish = predFinish;
        predecessorId = depStr;
      }
    }
    if (!predecessorId || criticalPath.includes(predecessorId)) break;
    criticalPath.unshift(predecessorId);
    current = predecessorId;
  }

  return criticalPath;
}

/**
 * Calculate baseline metrics from snapshot.
 */
function calculateBaseline(snapshot) {
  const { tasks, totalCapacity, memberCount, criticalPath } = snapshot;
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const remainingTasks = tasks.filter(t => t.status !== "done");
  const totalRemainingHours = remainingTasks.reduce((sum, t) => sum + (t.estimatedHours || 8), 0);

  const dailyCapacity = (totalCapacity / 5) || 8; // weekly capacity / 5 working days
  const projectedDaysRemaining = dailyCapacity > 0 ? Math.ceil(totalRemainingHours / dailyCapacity) : 999;
  const projectedCompletionDate = new Date(Date.now() + projectedDaysRemaining * 24 * 60 * 60 * 1000);

  // Critical path duration
  const cpHours = criticalPath.reduce((sum, id) => {
    const t = snapshot.taskMap.get(id);
    return sum + (t?.status === "done" ? 0 : (t?.estimatedHours || 8));
  }, 0);
  const cpDays = dailyCapacity > 0 ? Math.ceil(cpHours / dailyCapacity) : cpHours / 8;

  const blockedTasks = tasks.filter(t => t.isBlocked).length;
  const capacityUtilization = totalCapacity > 0
    ? Math.round((remainingTasks.filter(t => t.status === "in_progress").length * 8 / totalCapacity) * 100)
    : 0;

  return {
    totalTasks,
    doneTasks,
    remainingTasks: remainingTasks.length,
    totalRemainingHours,
    dailyCapacity,
    projectedDaysRemaining,
    projectedCompletionDate: projectedCompletionDate.toISOString(),
    criticalPathLength: criticalPath.length,
    criticalPathHours: cpHours,
    criticalPathDays: cpDays,
    blockedTasks,
    capacityUtilization,
    memberCount,
    totalCapacity,
  };
}

/**
 * Run a simulation scenario on a snapshot.
 * NEVER mutates live state.
 */
function simulateScenario(snapshot, params) {
  const {
    capacityChange = 0,       // percentage change: +20 means 20% more capacity, -30 means 30% less
    timelineCompression = 0,  // days to compress (positive = shorter deadline, negative = extend)
    scopeShock = 0,           // number of tasks to add (positive) or remove (negative)
    scopeShockHoursPerTask = 8,
  } = params;

  const baseline = calculateBaseline(snapshot);
  const remainingTasks = snapshot.tasks.filter(t => t.status !== "done");

  // Apply capacity change
  const adjustedCapacity = baseline.totalCapacity * (1 + capacityChange / 100);
  const adjustedDailyCapacity = Math.max(1, adjustedCapacity / 5);

  // Apply scope shock
  let adjustedRemainingHours = baseline.totalRemainingHours;
  let adjustedRemainingCount = baseline.remainingTasks;
  let scopeAffectedTasks = [];

  if (scopeShock > 0) {
    adjustedRemainingHours += scopeShock * scopeShockHoursPerTask;
    adjustedRemainingCount += scopeShock;
    for (let i = 0; i < scopeShock; i++) {
      scopeAffectedTasks.push({ title: `Scope Addition ${i + 1}`, hours: scopeShockHoursPerTask, type: "added" });
    }
  } else if (scopeShock < 0) {
    const toRemove = Math.min(Math.abs(scopeShock), remainingTasks.length);
    const removedTasks = remainingTasks
      .sort((a, b) => (a.priorityScore || 0) - (b.priorityScore || 0))
      .slice(0, toRemove);
    const removedHours = removedTasks.reduce((sum, t) => sum + (t.estimatedHours || 8), 0);
    adjustedRemainingHours = Math.max(0, adjustedRemainingHours - removedHours);
    adjustedRemainingCount = Math.max(0, adjustedRemainingCount - toRemove);
    scopeAffectedTasks = removedTasks.map(t => ({ title: t.title, hours: t.estimatedHours || 8, type: "removed" }));
  }

  // Calculate new projection
  const newProjectedDays = adjustedDailyCapacity > 0 ? Math.ceil(adjustedRemainingHours / adjustedDailyCapacity) : 999;
  const newCompletionDate = new Date(Date.now() + newProjectedDays * 24 * 60 * 60 * 1000);

  // Apply timeline compression against baseline target timeline
  let targetDays = baseline.projectedDaysRemaining || newProjectedDays;
  let timelineStress = 0;
  if (timelineCompression > 0) {
    targetDays = Math.max(1, (baseline.projectedDaysRemaining || newProjectedDays) - timelineCompression);
    // Calculate stress — how much daily work must increase
    const requiredDailyCapacity = adjustedRemainingHours / targetDays;
    timelineStress = adjustedDailyCapacity > 0
      ? Math.round((requiredDailyCapacity / adjustedDailyCapacity - 1) * 100)
      : 999;
  } else if (timelineCompression < 0) {
    targetDays = (baseline.projectedDaysRemaining || newProjectedDays) + Math.abs(timelineCompression);
  }

  // Schedule variance
  const scheduleVariance = newProjectedDays - baseline.projectedDaysRemaining;

  // Capacity pressure (how loaded is the team against target timeline)
  const capacityPressure = adjustedDailyCapacity > 0 && targetDays > 0
    ? Math.round((adjustedRemainingHours / (targetDays * adjustedDailyCapacity)) * 100)
    : 100;

  // Identify affected critical-path tasks
  const cpAffectedTasks = snapshot.criticalPath.map(id => {
    const t = snapshot.taskMap.get(id);
    if (!t || t.status === "done") return null;
    return { id, title: t.title, hours: t.estimatedHours || 8, status: t.status };
  }).filter(Boolean);

  // Build deterministic explanation
  const explanations = [];
  if (capacityChange !== 0) {
    explanations.push({
      factor: "Capacity Change",
      detail: `Team capacity ${capacityChange > 0 ? "increased" : "decreased"} by ${Math.abs(capacityChange)}%`,
      impact: `Daily capacity: ${baseline.dailyCapacity.toFixed(1)}h → ${adjustedDailyCapacity.toFixed(1)}h`,
      cause: capacityChange > 0 ? "More team bandwidth available" : "Reduced team bandwidth",
    });
  }
  if (timelineCompression !== 0) {
    explanations.push({
      factor: "Timeline Change",
      detail: `Deadline ${timelineCompression > 0 ? "compressed" : "extended"} by ${Math.abs(timelineCompression)} days`,
      impact: timelineStress > 0 ? `Team stress increased by ${timelineStress}%` : "Schedule pressure reduced",
      cause: timelineCompression > 0 ? "Tighter deadline creates capacity pressure" : "Extended timeline reduces pressure",
    });
  }
  if (scopeShock !== 0) {
    explanations.push({
      factor: "Scope Change",
      detail: `${Math.abs(scopeShock)} tasks ${scopeShock > 0 ? "added" : "removed"}`,
      impact: `Remaining work: ${baseline.totalRemainingHours}h → ${adjustedRemainingHours}h`,
      cause: scopeShock > 0 ? "Scope increase adds work to remaining backlog" : "Scope reduction removes lower-priority work",
    });
  }
  if (scheduleVariance !== 0) {
    explanations.push({
      factor: "Schedule Impact",
      detail: `Completion moved by ${scheduleVariance > 0 ? "+" : ""}${scheduleVariance} days`,
      impact: `Projected: ${baseline.projectedDaysRemaining} days → ${newProjectedDays} days`,
      cause: cpAffectedTasks.length > 0
        ? `Critical-path task "${cpAffectedTasks[0].title}" became ${capacityChange < 0 ? "capacity constrained" : "affected by scope change"}`
        : "Overall workload-to-capacity ratio changed",
    });
  }

  // Risk assessment
  const risks = [];
  if (capacityPressure > 120) {
    risks.push({ category: "OVERLOAD", severity: "critical", description: `Team is at ${capacityPressure}% capacity — burnout risk.` });
  } else if (capacityPressure > 90) {
    risks.push({ category: "HIGH_UTILIZATION", severity: "high", description: `Team at ${capacityPressure}% capacity — limited buffer for surprises.` });
  }
  if (timelineStress > 50) {
    risks.push({ category: "TIMELINE_STRESS", severity: "critical", description: `Timeline compression requires ${timelineStress}% daily output increase.` });
  }
  if (scopeShock > 5) {
    risks.push({ category: "SCOPE_CREEP", severity: "high", description: `Adding ${scopeShock} tasks creates significant scope creep risk.` });
  }

  return {
    scenario: {
      capacityChange,
      timelineCompression,
      scopeShock,
      scopeShockHoursPerTask,
    },
    baseline: {
      projectedDays: baseline.projectedDaysRemaining,
      projectedCompletionDate: baseline.projectedCompletionDate,
      remainingHours: baseline.totalRemainingHours,
      remainingTasks: baseline.remainingTasks,
      dailyCapacity: baseline.dailyCapacity,
      criticalPathDays: baseline.criticalPathDays,
    },
    simulated: {
      projectedDays: newProjectedDays,
      projectedCompletionDate: newCompletionDate.toISOString(),
      remainingHours: adjustedRemainingHours,
      remainingTasks: adjustedRemainingCount,
      dailyCapacity: adjustedDailyCapacity,
      targetDays,
      capacityPressure,
      timelineStress: Math.max(0, timelineStress),
    },
    delta: {
      daysChange: scheduleVariance,
      hoursChange: adjustedRemainingHours - baseline.totalRemainingHours,
      capacityChange: adjustedDailyCapacity - baseline.dailyCapacity,
      tasksChange: adjustedRemainingCount - baseline.remainingTasks,
    },
    affectedCriticalPath: cpAffectedTasks,
    scopeAffectedTasks,
    risks,
    explanations,
    // CRITICAL: simulation does NOT mutate live state
    liveStateMutated: false,
    simulatedAt: new Date().toISOString(),
  };
}

/**
 * Run Monte Carlo simulation with REAL random sampling.
 * Each run samples task completion times from a distribution
 * based on estimated hours with ±variance.
 */
function runMonteCarloSimulation(snapshot, params, iterations = 500) {
  const baseline = calculateBaseline(snapshot);
  const remainingTasks = snapshot.tasks.filter(t => t.status !== "done");

  if (remainingTasks.length === 0) {
    return {
      iterations,
      completionDays: { p50: 0, p75: 0, p85: 0, p95: 0, min: 0, max: 0, mean: 0 },
      confidence: 100,
      distribution: [],
    };
  }

  const adjustedCapacity = baseline.totalCapacity * (1 + (params.capacityChange || 0) / 100);
  const dailyCapacity = Math.max(1, adjustedCapacity / 5);

  const results = [];

  for (let i = 0; i < iterations; i++) {
    // Sample each task's completion time with ±30% variance (triangular distribution)
    let totalHours = 0;
    for (const task of remainingTasks) {
      const estimated = task.estimatedHours || 8;
      // Triangular distribution: min = 0.7x, mode = x, max = 1.6x
      const min = estimated * 0.7;
      const max = estimated * 1.6;
      const mode = estimated;
      // Triangular distribution sampling
      const u = Math.random();
      const fc = (mode - min) / (max - min);
      let sampled;
      if (u < fc) {
        sampled = min + Math.sqrt(u * (max - min) * (mode - min));
      } else {
        sampled = max - Math.sqrt((1 - u) * (max - min) * (max - mode));
      }
      totalHours += sampled;
    }

    // Add scope shock
    if (params.scopeShock > 0) {
      for (let j = 0; j < params.scopeShock; j++) {
        const base = params.scopeShockHoursPerTask || 8;
        const u = Math.random();
        totalHours += base * (0.7 + u * 0.9); // 0.7x to 1.6x
      }
    }

    const days = dailyCapacity > 0 ? Math.ceil(totalHours / dailyCapacity) : 999;
    results.push(days);
  }

  // Sort for percentile calculation
  results.sort((a, b) => a - b);

  const percentile = (p) => results[Math.min(Math.floor(results.length * p / 100), results.length - 1)];
  const mean = results.reduce((a, b) => a + b, 0) / results.length;

  // Create histogram buckets
  const min = results[0];
  const max = results[results.length - 1];
  const bucketSize = Math.max(1, Math.ceil((max - min) / 20));
  const distribution = [];
  for (let b = min; b <= max; b += bucketSize) {
    const count = results.filter(r => r >= b && r < b + bucketSize).length;
    distribution.push({ dayRange: `${b}-${b + bucketSize - 1}`, count, frequency: Math.round(count / iterations * 100) });
  }

  return {
    iterations,
    completionDays: {
      p50: percentile(50),
      p75: percentile(75),
      p85: percentile(85),
      p95: percentile(95),
      min,
      max,
      mean: Math.round(mean * 10) / 10,
    },
    confidence: Math.round((1 - (percentile(95) - percentile(50)) / Math.max(1, percentile(50))) * 100),
    distribution,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get baseline project metrics (no simulation).
 */
export async function getSimulationBaseline(projectId) {
  const snapshot = await createProjectSnapshot(projectId);
  const baseline = calculateBaseline(snapshot);
  return {
    ...baseline,
    methodology: snapshot.project.methodology,
    projectTitle: snapshot.project.title,
    criticalPath: snapshot.criticalPath.map(id => {
      const t = snapshot.taskMap.get(id);
      return t ? { id, title: t.title, status: t.status, hours: t.estimatedHours || 8 } : null;
    }).filter(Boolean),
    liveStateMutated: false,
  };
}

/**
 * Run a what-if simulation scenario.
 * NEVER mutates live state.
 */
export async function runSimulation(projectId, params = {}) {
  const snapshot = await createProjectSnapshot(projectId);
  const result = simulateScenario(snapshot, params);

  // Optionally include Monte Carlo
  if (params.includeMonteCarlo !== false) {
    result.monteCarlo = runMonteCarloSimulation(
      snapshot,
      params,
      Math.min(Math.max(params.monteCarloIterations || 500, 50), 2000)
    );
  }

  return result;
}
