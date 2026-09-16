/**
 * server/services/hybridEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — HYBRID METHODOLOGY EXECUTION ENGINE (Prompt 6)
 *
 * First-class methodology engine for Hybrid projects. Allows explicit
 * configuration of which methodology controls each project concern:
 *   - Planning (WATERFALL | SCRUM | KANBAN)
 *   - Execution (WATERFALL | SCRUM | KANBAN)
 *   - Governance (WATERFALL | SCRUM | KANBAN)
 *   - Backlog, Phase, WIP, Review, Delivery, Milestone, Dependency behaviors
 *
 * SAFETY RULES:
 *   - All validation is server-side — never trust frontend methodology controls
 *   - Only technically coherent combinations are permitted
 *   - Delegates to existing engines (scrumEngine, kanbanEngine, phaseGateService)
 *   - Purely deterministic — NO AI/LLM dependency
 *   - Never silently modifies project state
 *
 * DAA / AI SEPARATION:
 *   This engine performs DETERMINISTIC calculations only.
 *   No AI/LLM calls. No probabilistic behavior.
 * ============================================================================
 */

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { recordProjectEvent } from "./eventService.js";

// ── Predefined coherent combination templates ─────────────────────────────────
export const HYBRID_TEMPLATES = {
  waterfall_planning_scrum_execution: {
    name: "Waterfall Planning + Scrum Execution",
    description: "Sequential phase planning with iterative sprint-based execution",
    planningMethodology: "WATERFALL",
    executionMethodology: "SCRUM",
    governanceMethodology: "WATERFALL",
    backlogBehavior: "sprint_based",
    phaseBehavior: "sequential_gates",
    wipBehavior: "sprint_capacity",
    reviewBehavior: "sprint_review",
    deliveryBehavior: "incremental",
    milestoneBehavior: "phase_milestones",
    dependencyBehavior: "flexible",
  },
  waterfall_governance_kanban_execution: {
    name: "Waterfall Governance + Kanban Execution",
    description: "Phase-gated governance with continuous flow execution",
    planningMethodology: "WATERFALL",
    executionMethodology: "KANBAN",
    governanceMethodology: "WATERFALL",
    backlogBehavior: "continuous_flow",
    phaseBehavior: "sequential_gates",
    wipBehavior: "kanban_wip",
    reviewBehavior: "phase_gate_review",
    deliveryBehavior: "continuous",
    milestoneBehavior: "phase_milestones",
    dependencyBehavior: "flow_based",
  },
  scrum_planning_kanban_execution: {
    name: "Scrum Planning + Kanban Execution",
    description: "Sprint-based planning with continuous flow task execution",
    planningMethodology: "SCRUM",
    executionMethodology: "KANBAN",
    governanceMethodology: "SCRUM",
    backlogBehavior: "continuous_flow",
    phaseBehavior: "iterative",
    wipBehavior: "kanban_wip",
    reviewBehavior: "sprint_review",
    deliveryBehavior: "continuous",
    milestoneBehavior: "sprint_milestones",
    dependencyBehavior: "flow_based",
  },
  waterfall_planning_kanban_execution: {
    name: "Waterfall Planning + Kanban Execution",
    description: "Sequential phase planning with WIP-limited continuous execution",
    planningMethodology: "WATERFALL",
    executionMethodology: "KANBAN",
    governanceMethodology: "WATERFALL",
    backlogBehavior: "continuous_flow",
    phaseBehavior: "sequential_gates",
    wipBehavior: "kanban_wip",
    reviewBehavior: "phase_gate_review",
    deliveryBehavior: "continuous",
    milestoneBehavior: "phase_milestones",
    dependencyBehavior: "flow_based",
  },
  scrum_planning_waterfall_governance: {
    name: "Scrum Planning + Waterfall Governance",
    description: "Iterative sprint planning with formal phase-gate governance",
    planningMethodology: "SCRUM",
    executionMethodology: "SCRUM",
    governanceMethodology: "WATERFALL",
    backlogBehavior: "sprint_based",
    phaseBehavior: "sequential_gates",
    wipBehavior: "sprint_capacity",
    reviewBehavior: "sprint_review",
    deliveryBehavior: "incremental",
    milestoneBehavior: "phase_milestones",
    dependencyBehavior: "sprint_scoped",
  },
};

// ── Coherence validation rules ────────────────────────────────────────────────
const INCOHERENT_COMBINATIONS = [
  // Kanban planning + Waterfall execution doesn't make sense — flow planning with sequential execution
  { planningMethodology: "KANBAN", executionMethodology: "WATERFALL", reason: "Continuous flow planning is incompatible with sequential waterfall execution." },
  // Scrum execution requires sprint-based or continuous backlog, not phase-based
  { executionMethodology: "SCRUM", backlogBehavior: "phase_based", reason: "Scrum execution requires sprint-based or continuous backlog, not phase-based." },
  // Kanban execution with sprint_capacity WIP is contradictory
  { executionMethodology: "KANBAN", wipBehavior: "sprint_capacity", reason: "Kanban execution uses WIP limits, not sprint capacity constraints." },
  // Waterfall execution with kanban_wip is contradictory
  { executionMethodology: "WATERFALL", wipBehavior: "kanban_wip", reason: "Waterfall execution uses phase capacity, not Kanban WIP limits." },
  // Continuous delivery with sequential_gates phase behavior needs governance alignment
  { deliveryBehavior: "big_bang", phaseBehavior: "continuous", reason: "Big-bang delivery contradicts continuous phase behavior." },
];

/**
 * Validate a hybrid configuration for coherence.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateHybridConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config) {
    return { valid: false, errors: ["Hybrid configuration is required."], warnings: [] };
  }

  const validMethodologies = ["WATERFALL", "SCRUM", "KANBAN"];
  const requiredFields = ["planningMethodology", "executionMethodology", "governanceMethodology"];

  // Validate required methodology fields exist
  for (const field of requiredFields) {
    if (!config[field] || !validMethodologies.includes(config[field])) {
      errors.push(`${field} must be one of: ${validMethodologies.join(", ")}. Got: "${config[field]}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Check for known incoherent combinations
  for (const rule of INCOHERENT_COMBINATIONS) {
    let matches = true;
    for (const [key, value] of Object.entries(rule)) {
      if (key === "reason") continue;
      if (config[key] !== value) { matches = false; break; }
    }
    if (matches) {
      errors.push(rule.reason);
    }
  }

  // Generate advisory warnings
  if (config.planningMethodology !== config.governanceMethodology) {
    warnings.push("Planning and governance use different methodologies — ensure team understands dual reporting rules.");
  }
  if (config.executionMethodology === "KANBAN" && config.reviewBehavior === "sprint_review") {
    warnings.push("Kanban execution with sprint reviews may cause mismatched cadence. Consider continuous_review.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Get the default hybrid configuration.
 */
export function getDefaultHybridConfig() {
  return { ...HYBRID_TEMPLATES.waterfall_planning_scrum_execution, templateName: "waterfall_planning_scrum_execution" };
}

/**
 * Initialize or update hybrid configuration on a project.
 * Server-side validation — never trust frontend.
 */
export async function configureHybrid({ projectId, config, userId, userName = "System" }) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  // Validate coherence
  const validation = validateHybridConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  // Determine template name
  let templateName = "custom";
  for (const [key, template] of Object.entries(HYBRID_TEMPLATES)) {
    let match = true;
    for (const field of ["planningMethodology", "executionMethodology", "governanceMethodology"]) {
      if (template[field] !== config[field]) { match = false; break; }
    }
    if (match) { templateName = key; break; }
  }

  const previousConfig = project.hybridConfig ? { ...project.hybridConfig.toObject?.() || project.hybridConfig } : null;

  // Apply configuration
  project.methodology = "HYBRID";
  project.hybridConfig = {
    planningMethodology: config.planningMethodology,
    executionMethodology: config.executionMethodology,
    governanceMethodology: config.governanceMethodology,
    backlogBehavior: config.backlogBehavior || "sprint_based",
    phaseBehavior: config.phaseBehavior || "sequential_gates",
    wipBehavior: config.wipBehavior || "sprint_capacity",
    reviewBehavior: config.reviewBehavior || "sprint_review",
    deliveryBehavior: config.deliveryBehavior || "incremental",
    milestoneBehavior: config.milestoneBehavior || "phase_milestones",
    dependencyBehavior: config.dependencyBehavior || "flexible",
    templateName,
    validatedAt: new Date(),
    configuredBy: userId || null,
  };

  // If execution is SCRUM, ensure scrumConfig exists
  if (config.executionMethodology === "SCRUM" && !project.scrumConfig) {
    project.scrumConfig = {
      sprintDuration: 14,
      defaultSprintLength: 14,
      preferredStartDay: "monday",
      defaultCapacityPerMember: 30,
      workingDaysPerWeek: 5,
      definitionOfDone: ["Code complete", "Tests passing", "Code reviewed", "Documentation updated"],
      estimationUnit: "both",
      velocityHistory: [],
    };
  }

  // If execution is KANBAN, ensure kanbanConfig exists
  if (config.executionMethodology === "KANBAN" && !project.kanbanConfig) {
    const { getDefaultKanbanConfig } = await import("./kanbanMethodologyService.js");
    project.kanbanConfig = getDefaultKanbanConfig();
  }

  await project.save();

  // Record event
  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId: userId,
    actorName: userName,
    eventType: "HYBRID_CONFIGURED",
    entityType: "hybrid_config",
    entityId: projectId.toString(),
    title: `Hybrid methodology configured: ${templateName.replace(/_/g, " ")}`,
    description: `Planning: ${config.planningMethodology}, Execution: ${config.executionMethodology}, Governance: ${config.governanceMethodology}`,
    previousValue: previousConfig,
    newValue: project.hybridConfig.toObject?.() || project.hybridConfig,
    source: "hybrid_engine",
  });

  return {
    success: true,
    config: project.hybridConfig.toObject?.() || project.hybridConfig,
    templateName,
    warnings: validation.warnings,
  };
}

/**
 * Get current hybrid state — active rules and execution context.
 */
export async function getHybridState(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found.");
  if (project.methodology !== "HYBRID") {
    return { isHybrid: false, methodology: project.methodology };
  }

  const config = project.hybridConfig || getDefaultHybridConfig();
  const tasks = await Task.find({ $or: [{ projectId }, { teamId: project.teamId }] }).lean();
  const team = await Team.findById(project.teamId).lean();

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const blockedTasks = tasks.filter(t => t.isBlocked).length;

  // Derive active rules based on config
  const activeRules = [];

  // Planning rules
  if (config.planningMethodology === "WATERFALL") {
    activeRules.push({ area: "Planning", rule: "Sequential phase-based planning", source: "Waterfall", reason: "Planning methodology is set to Waterfall — tasks should be organized by phases." });
  } else if (config.planningMethodology === "SCRUM") {
    activeRules.push({ area: "Planning", rule: "Sprint-based iterative planning", source: "Scrum", reason: "Planning methodology is set to Scrum — work is planned in time-boxed sprints." });
  } else if (config.planningMethodology === "KANBAN") {
    activeRules.push({ area: "Planning", rule: "Just-in-time continuous planning", source: "Kanban", reason: "Planning methodology is set to Kanban — work is pulled as capacity allows." });
  }

  // Execution rules
  if (config.executionMethodology === "SCRUM") {
    activeRules.push({ area: "Execution", rule: "Sprint-bounded task execution", source: "Scrum", reason: "Tasks are executed within sprint time-boxes with daily standup cadence." });
  } else if (config.executionMethodology === "KANBAN") {
    activeRules.push({ area: "Execution", rule: "Continuous flow with WIP limits", source: "Kanban", reason: "Tasks flow through columns with WIP limits controlling concurrency." });
  } else if (config.executionMethodology === "WATERFALL") {
    activeRules.push({ area: "Execution", rule: "Phase-sequential execution", source: "Waterfall", reason: "Tasks execute within the current waterfall phase before the gate review." });
  }

  // Governance rules
  if (config.governanceMethodology === "WATERFALL") {
    activeRules.push({ area: "Governance", rule: "Phase gate reviews required", source: "Waterfall", reason: "Progress is gated at phase boundaries — review required to advance." });
  } else if (config.governanceMethodology === "SCRUM") {
    activeRules.push({ area: "Governance", rule: "Sprint review governance", source: "Scrum", reason: "Governance is applied at sprint review ceremonies." });
  }

  // WIP rules
  if (config.wipBehavior === "kanban_wip") {
    activeRules.push({ area: "WIP", rule: "Column WIP limits enforced", source: "Kanban", reason: "Work-in-progress limits constrain concurrent tasks per column." });
  } else if (config.wipBehavior === "sprint_capacity") {
    activeRules.push({ area: "WIP", rule: "Sprint capacity limits", source: "Scrum", reason: "Sprint capacity constrains how much work enters a sprint." });
  }

  return {
    isHybrid: true,
    config,
    templateName: config.templateName || "custom",
    activeRules,
    executionState: {
      waterfallPhase: project.waterfallPhase,
      currentSprintId: project.currentSprintId,
      totalTasks,
      doneTasks,
      inProgressTasks,
      blockedTasks,
      progress: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    },
    methodologyBoundaries: {
      planning: config.planningMethodology,
      execution: config.executionMethodology,
      governance: config.governanceMethodology,
    },
    teamSize: team?.members?.length || 0,
  };
}

/**
 * Get applicable workflow rules for a task based on the hybrid configuration.
 * DAA engines receive this to determine scheduling/priority rules.
 */
export function getHybridTaskRules(hybridConfig, task) {
  if (!hybridConfig) return { rules: [], executionModel: "WATERFALL" };

  const rules = [];
  const exec = hybridConfig.executionMethodology;

  if (exec === "SCRUM") {
    rules.push("Task must belong to a sprint for execution");
    rules.push("Sprint capacity limits apply");
    if (task?.scrumStatus) rules.push(`Current scrum status: ${task.scrumStatus}`);
  } else if (exec === "KANBAN") {
    rules.push("Task moves through workflow columns");
    rules.push("WIP limits enforced per column");
    if (task?.workflowColumn) rules.push(`Current column: ${task.workflowColumn}`);
  } else {
    rules.push("Task executes within current waterfall phase");
    rules.push("Phase gate approval required to proceed");
    if (task?.phase) rules.push(`Current phase: ${task.phase}`);
  }

  if (hybridConfig.phaseBehavior === "sequential_gates") {
    rules.push("Phase gate reviews required for governance advancement");
  }

  return { rules, executionModel: exec };
}

/**
 * List available hybrid templates.
 */
export function listHybridTemplates() {
  return Object.entries(HYBRID_TEMPLATES).map(([key, template]) => ({
    id: key,
    name: template.name,
    description: template.description,
    planningMethodology: template.planningMethodology,
    executionMethodology: template.executionMethodology,
    governanceMethodology: template.governanceMethodology,
  }));
}
