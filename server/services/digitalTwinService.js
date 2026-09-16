/**
 * server/services/digitalTwinService.js
 * ============================================================================
 * NEXUSFLOW V4 — UNIFIED DIGITAL TWIN DATA SERVICE (Prompt 10)
 *
 * Provides a unified project state model for Digital Twin visualization.
 * Methodology-specific adapters transform project data into a common
 * visualization-ready format consumed by Three.js scene components.
 *
 * ARCHITECTURE:
 *   DigitalTwinCore
 *         ↓
 *   Project State Adapter
 *         ↓
 *   Methodology Adapter (Waterfall | Scrum | Kanban | Hybrid | Classic)
 *         ↓
 *   Domain Adapter
 *         ↓
 *   Three.js Scene Data
 *
 * This service produces DATA — rendering is handled by client-side
 * Three.js components (existing and new).
 *
 * SAFETY:
 *   - Read-only — NEVER modifies project state
 *   - Respects authorization (caller must verify access)
 *   - Deterministic output for same project state
 *   - No AI/LLM dependency
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Sprint from "../models/Sprint.js";
import Risk from "../models/Risk.js";

// ── Common Project State Adapter ──────────────────────────────────────────────

/**
 * Build the common project state model for visualization.
 * This is methodology-agnostic — captures universal project attributes.
 */
async function buildCommonState(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const [tasks, team, risks] = await Promise.all([
    Task.find({ $or: [{ projectId }, { teamId: project.teamId }] })
      .populate("assignedTo", "name email avatar")
      .populate("dependencies", "title status")
      .lean(),
    Team.findById(project.teamId).lean(),
    Risk.find({ projectId }).lean().catch(() => []),
  ]);

  const members = team?.members || [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const blockedTasks = tasks.filter(t => t.isBlocked).length;
  const todoTasks = tasks.filter(t => t.status === "todo").length;

  // Build dependency edges
  const edges = [];
  tasks.forEach(t => {
    (t.dependencies || []).forEach(dep => {
      const depId = typeof dep === "object" ? (dep._id || dep).toString() : dep.toString();
      edges.push({
        from: depId,
        to: t._id.toString(),
        fromTitle: typeof dep === "object" ? dep.title : null,
        toTitle: t.title,
      });
    });
  });

  // Identify critical path nodes (tasks with dependencies AND dependents, or high priority)
  const dependentCounts = new Map();
  edges.forEach(e => {
    dependentCounts.set(e.from, (dependentCounts.get(e.from) || 0) + 1);
  });

  const criticalPathIds = new Set();
  tasks.forEach(t => {
    const id = t._id.toString();
    const hasDeps = (t.dependencies || []).length > 0;
    const hasDependents = (dependentCounts.get(id) || 0) > 0;
    const isHighPriority = t.priorityLabel === "critical" || t.priorityLabel === "high";
    if ((hasDeps && hasDependents) || isHighPriority) {
      criticalPathIds.add(id);
    }
  });

  // Requirements mapping
  const requirements = (project.requirements || []).map(r => ({
    id: r.reqId || r._id?.toString(),
    title: r.title,
    priority: r.priority,
    coverageState: r.coverageState,
    taskCount: (r.taskIds || []).length,
    mandatory: r.mandatory,
  }));

  // Health score (simple calculation)
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const healthScore = Math.max(0, Math.min(100,
    progress * 0.4 +
    (1 - (blockedTasks / Math.max(1, totalTasks))) * 30 +
    (totalTasks > 0 ? 30 : 0)
  ));

  return {
    project: {
      id: project._id.toString(),
      title: project.title,
      methodology: project.methodology,
      status: project.status,
      domain: project.domain,
    },
    tasks: tasks.map(t => ({
      id: t._id.toString(),
      title: t.title,
      status: t.status,
      phase: t.phase,
      assignedTo: t.assignedTo ? { id: t.assignedTo._id?.toString(), name: t.assignedTo.name } : null,
      priority: t.priorityLabel,
      priorityScore: t.priorityScore,
      estimatedHours: t.estimatedHours,
      storyPoints: t.storyPoints,
      isBlocked: t.isBlocked || false,
      isCriticalPath: criticalPathIds.has(t._id.toString()),
      progress: t.progress || 0,
      // Methodology-specific fields included for adapters
      scrumStatus: t.scrumStatus,
      kanbanStatus: t.kanbanStatus,
      workflowColumn: t.workflowColumn,
      sprintId: t.sprintId?.toString() || null,
    })),
    edges,
    members: members.map(m => ({
      id: (m.userId?._id || m.userId)?.toString(),
      name: m.name,
      role: m.role,
      capacity: m.capacity || 40,
      assignedLoad: m.assignedLoad || 0,
      skills: m.skills,
    })),
    requirements,
    risks: risks.map(r => ({
      id: r._id?.toString(),
      title: r.title || r.description,
      severity: r.severity,
      probability: r.probability,
      status: r.status,
      category: r.category,
    })),
    metrics: {
      totalTasks,
      doneTasks,
      inProgressTasks,
      blockedTasks,
      todoTasks,
      progress,
      healthScore,
      criticalPathCount: criticalPathIds.size,
      dependencyCount: edges.length,
      memberCount: members.length,
      riskCount: risks.length,
      requirementCount: requirements.length,
    },
    criticalPathIds: Array.from(criticalPathIds),
  };
}

// ── Methodology Adapters ──────────────────────────────────────────────────────

/**
 * Waterfall adapter: phases, gates, WBS, dependencies, critical path, milestones.
 */
function adaptWaterfall(commonState, project) {
  const phases = ["requirements", "design", "implementation", "testing", "deployment", "maintenance"];
  const currentPhase = project.waterfallPhase || "requirements";
  const currentPhaseIdx = phases.indexOf(currentPhase);

  // Group tasks by phase
  const phaseData = phases.map((phase, idx) => {
    const phaseTasks = commonState.tasks.filter(t => (t.phase || "requirements") === phase);
    const done = phaseTasks.filter(t => t.status === "done").length;
    return {
      name: phase,
      displayName: phase.charAt(0).toUpperCase() + phase.slice(1),
      index: idx,
      isCurrent: phase === currentPhase,
      isCompleted: idx < currentPhaseIdx,
      isFuture: idx > currentPhaseIdx,
      taskCount: phaseTasks.length,
      completedTasks: done,
      progress: phaseTasks.length > 0 ? Math.round((done / phaseTasks.length) * 100) : 0,
      tasks: phaseTasks.map(t => t.id),
    };
  });

  // Milestones from phase transitions
  const milestones = (project.phaseGateHistory || []).map(h => ({
    phase: h.fromPhase,
    action: h.action,
    timestamp: h.timestamp,
    actor: h.actorName,
  }));

  return {
    type: "waterfall",
    phases: phaseData,
    currentPhase,
    currentPhaseIndex: currentPhaseIdx,
    milestones,
    gateHistory: project.phaseGateHistory || [],
  };
}

/**
 * Scrum adapter: backlog, sprint, stories, sprint progress, blockers, capacity.
 */
async function adaptScrum(commonState, project) {
  const sprints = await Sprint.find({ projectId: project._id }).sort({ createdAt: -1 }).lean();
  const activeSprint = sprints.find(s => s.status === "ACTIVE");

  const sprintData = sprints.map(s => ({
    id: s._id.toString(),
    name: s.name || `Sprint ${s.sprintNumber}`,
    status: s.status,
    startDate: s.startDate,
    endDate: s.endDate,
    goal: s.goal,
    isActive: s.status === "ACTIVE",
  }));

  // Sprint-specific task grouping
  const backlogTasks = commonState.tasks.filter(t => !t.sprintId);
  const sprintTasks = activeSprint
    ? commonState.tasks.filter(t => t.sprintId === activeSprint._id.toString())
    : [];

  const sprintProgress = sprintTasks.length > 0
    ? Math.round((sprintTasks.filter(t => t.status === "done").length / sprintTasks.length) * 100)
    : 0;

  return {
    type: "scrum",
    sprints: sprintData,
    activeSprint: activeSprint ? {
      id: activeSprint._id.toString(),
      name: activeSprint.name || `Sprint ${activeSprint.sprintNumber}`,
      goal: activeSprint.goal,
      progress: sprintProgress,
      taskCount: sprintTasks.length,
      doneCount: sprintTasks.filter(t => t.status === "done").length,
    } : null,
    backlogCount: backlogTasks.length,
    scrumConfig: project.scrumConfig,
    velocityHistory: project.scrumConfig?.velocityHistory || [],
  };
}

/**
 * Kanban adapter: columns, WIP, flow, blockers, aging, bottlenecks.
 */
function adaptKanban(commonState, project) {
  const config = project.kanbanConfig;
  if (!config || !config.workflowColumns) {
    return { type: "kanban", columns: [], wipStatus: {} };
  }

  const columns = config.workflowColumns.map(col => {
    const colTasks = commonState.tasks.filter(t => t.workflowColumn === col.id);
    const wipUsed = colTasks.filter(t => t.status !== "done").length;
    const isOverWip = col.wipLimit > 0 && wipUsed > col.wipLimit;

    return {
      id: col.id,
      name: col.name,
      wipLimit: col.wipLimit,
      wipUsed,
      isOverWip,
      wipUtilization: col.wipLimit > 0 ? Math.round((wipUsed / col.wipLimit) * 100) : 0,
      isDoneColumn: col.isDoneColumn,
      order: col.order,
      taskCount: colTasks.length,
      tasks: colTasks.map(t => t.id),
    };
  }).sort((a, b) => a.order - b.order);

  // Detect bottlenecks (columns at or over WIP limit)
  const bottlenecks = columns.filter(c => c.isOverWip).map(c => ({
    column: c.name,
    wipUsed: c.wipUsed,
    wipLimit: c.wipLimit,
    overflow: c.wipUsed - c.wipLimit,
  }));

  return {
    type: "kanban",
    columns,
    bottlenecks,
    classesOfService: config.classesOfService || [],
    agingThresholds: config.agingThresholds,
  };
}

/**
 * Hybrid adapter: configured methodology layers, clear boundaries.
 */
async function adaptHybrid(commonState, project) {
  const hConfig = project.hybridConfig;
  if (!hConfig) {
    return { type: "hybrid", layers: [], config: null };
  }

  const layers = [];

  // Planning layer
  if (hConfig.planningMethodology === "WATERFALL") {
    layers.push({ concern: "Planning", methodology: "WATERFALL", adapter: adaptWaterfall(commonState, project) });
  }

  // Execution layer
  if (hConfig.executionMethodology === "SCRUM") {
    layers.push({ concern: "Execution", methodology: "SCRUM", adapter: await adaptScrum(commonState, project) });
  } else if (hConfig.executionMethodology === "KANBAN") {
    layers.push({ concern: "Execution", methodology: "KANBAN", adapter: adaptKanban(commonState, project) });
  }

  // Governance layer
  if (hConfig.governanceMethodology === "WATERFALL" && hConfig.planningMethodology !== "WATERFALL") {
    layers.push({ concern: "Governance", methodology: "WATERFALL", adapter: adaptWaterfall(commonState, project) });
  }

  return {
    type: "hybrid",
    config: hConfig,
    templateName: hConfig.templateName,
    layers,
    boundaries: {
      planning: hConfig.planningMethodology,
      execution: hConfig.executionMethodology,
      governance: hConfig.governanceMethodology,
    },
  };
}

/**
 * Classic adapter: preserves existing V3 behavior.
 */
function adaptClassic(commonState) {
  // Group by category
  const categories = {};
  commonState.tasks.forEach(t => {
    const cat = t.phase || "General";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t.id);
  });

  return {
    type: "classic",
    categories: Object.entries(categories).map(([name, taskIds]) => ({ name, taskCount: taskIds.length, tasks: taskIds })),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get full Digital Twin state for a project.
 * Returns common state + methodology-specific adapter data.
 */
export async function getDigitalTwinState(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");

  const commonState = await buildCommonState(projectId);
  let methodologyAdapter;

  switch (project.methodology) {
    case "WATERFALL":
      methodologyAdapter = adaptWaterfall(commonState, project);
      break;
    case "SCRUM":
      methodologyAdapter = await adaptScrum(commonState, project);
      break;
    case "KANBAN":
      methodologyAdapter = adaptKanban(commonState, project);
      break;
    case "HYBRID":
      methodologyAdapter = await adaptHybrid(commonState, project);
      break;
    case "CLASSIC":
    case "NEXUSFLOW":
    default:
      methodologyAdapter = adaptClassic(commonState);
      break;
  }

  return {
    ...commonState,
    methodologyAdapter,
    generatedAt: new Date().toISOString(),
    readOnly: true, // Digital Twin NEVER modifies state
  };
}

/**
 * Get a lightweight update payload for Socket.IO incremental updates.
 * Returns only changed metrics + task statuses (not full scene rebuild).
 */
export async function getDigitalTwinDelta(projectId) {
  const project = await Project.findById(projectId).select("methodology teamId title status derivedVersion").lean();
  if (!project) return null;

  const tasks = await Task.find({ $or: [{ projectId }, { teamId: project.teamId }] })
    .select("_id title status isBlocked progress phase workflowColumn scrumStatus kanbanStatus sprintId priorityScore")
    .lean();

  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const blocked = tasks.filter(t => t.isBlocked).length;

  return {
    projectId: projectId.toString(),
    methodology: project.methodology,
    version: project.derivedVersion,
    tasks: tasks.map(t => ({
      id: t._id.toString(),
      status: t.status,
      isBlocked: t.isBlocked || false,
      progress: t.progress || 0,
      column: t.workflowColumn,
      scrumStatus: t.scrumStatus,
      priorityScore: t.priorityScore,
    })),
    metrics: {
      total,
      done,
      inProgress: tasks.filter(t => t.status === "in_progress").length,
      blocked,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    timestamp: new Date().toISOString(),
  };
}
