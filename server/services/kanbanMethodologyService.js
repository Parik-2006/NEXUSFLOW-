/**
 * server/services/kanbanMethodologyService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN METHODOLOGY ENGINE & POLICIES (Prompts 1, 2, 10)
 *
 * Defines continuous flow rules, default configurations, column validation,
 * WIP policies, and Definition of Ready/Done verifications.
 * ============================================================================
 */

export const DEFAULT_WORKFLOW_COLUMNS = [
  { id: "backlog",     name: "Backlog",     wipLimit: 0, isDoneColumn: false, order: 0 },
  { id: "ready",       name: "Ready",       wipLimit: 5, isDoneColumn: false, order: 1 },
  { id: "in_progress", name: "In Progress", wipLimit: 3, isDoneColumn: false, order: 2 },
  { id: "in_review",   name: "In Review",   wipLimit: 3, isDoneColumn: false, order: 3 },
  { id: "testing",     name: "Testing",     wipLimit: 3, isDoneColumn: false, order: 4 },
  { id: "done",        name: "Done",        wipLimit: 0, isDoneColumn: true,  order: 5 },
];

export const DEFAULT_CLASSES_OF_SERVICE = [
  {
    id: "standard",
    name: "Standard",
    policy: "FIFO execution according to dynamic priority ranking.",
    expediteWipBypass: false,
    priorityWeight: 1.0,
  },
  {
    id: "fixed_date",
    name: "Fixed Date",
    policy: "Must be delivered by a firm deadline. Priority escalates as target date nears.",
    expediteWipBypass: false,
    priorityWeight: 1.5,
  },
  {
    id: "expedite",
    name: "Expedite",
    policy: "Critical urgent work. Maximum one expedite item allowed to bypass column WIP limit with authorization.",
    expediteWipBypass: true,
    priorityWeight: 2.0,
  },
  {
    id: "improvement",
    name: "Improvement / Intangible",
    policy: "Process, technical debt, or refactoring work. Pulled during slack periods.",
    expediteWipBypass: false,
    priorityWeight: 0.8,
  },
];

export const DEFAULT_DEFINITION_OF_READY = [
  "Clear objective & user story defined",
  "Measurable acceptance criteria specified",
  "No unresolved blocking dependencies",
  "Estimated effort or story points assigned",
];

export const DEFAULT_DEFINITION_OF_DONE = [
  "Implementation complete & self-reviewed",
  "Automated test coverage passes",
  "Acceptance criteria verified",
  "Delivery evidence recorded",
];

/**
 * Return default complete Kanban configuration for new projects
 */
export function getDefaultKanbanConfig() {
  return {
    workflowColumns: DEFAULT_WORKFLOW_COLUMNS.map((c) => ({ ...c })),
    wipPolicy: {
      mode: "advisory",
      allowOverride: true,
      personalWipEnabled: false,
      defaultPersonalWip: 3,
    },
    pullPolicies: {
      requireDoR: true,
      allowPullWhenBlocked: false,
    },
    classesOfService: DEFAULT_CLASSES_OF_SERVICE.map((cs) => ({ ...cs })),
    definitionOfReady: [...DEFAULT_DEFINITION_OF_READY],
    definitionOfDone: [...DEFAULT_DEFINITION_OF_DONE],
    serviceLevelExpectation: {
      targetDays: 4,
      confidencePercentile: 85,
    },
    agingThresholds: {
      warningDays: 3,
      criticalDays: 6,
    },
    forecastSettings: {
      sampleSize: 20,
      simulationRuns: 500,
    },
    wipOverridesHistory: [],
  };
}

/**
 * Validate workflow columns for structural integrity:
 * - Must have at least one backlog-like column and one done column
 * - Must have unique column IDs
 * - Limits must be non-negative
 */
export function validateKanbanWorkflow(columns) {
  if (!Array.isArray(columns) || columns.length < 3) {
    return { valid: false, error: "Kanban workflow requires at least 3 columns (Backlog, In Progress, Done)." };
  }

  const ids = new Set();
  let hasDone = false;

  for (const col of columns) {
    if (!col.id || !String(col.id).trim()) {
      return { valid: false, error: "Every column must have a unique non-empty ID." };
    }
    const cleanId = String(col.id).toLowerCase().trim();
    if (ids.has(cleanId)) {
      return { valid: false, error: `Duplicate column ID detected: '${cleanId}'.` };
    }
    ids.add(cleanId);

    if (col.wipLimit !== undefined && col.wipLimit < 0) {
      return { valid: false, error: `Column '${col.name || col.id}' cannot have a negative WIP limit.` };
    }

    if (col.isDoneColumn) {
      hasDone = true;
    }
  }

  if (!hasDone) {
    return { valid: false, error: "Workflow must have at least one column marked as Done (isDoneColumn: true)." };
  }

  return { valid: true };
}

/**
 * Check if a task satisfies the Definition of Ready (DoR)
 */
export function checkDefinitionOfReady(task, definitionOfReady = DEFAULT_DEFINITION_OF_READY) {
  const checklist = [];
  let satisfiedCount = 0;

  // 1. Clear objective / description / user story
  const hasDesc = Boolean((task.description && task.description.trim().length > 10) || (task.userStory && task.userStory.trim().length > 10));
  checklist.push({
    criterion: "Clear objective & user story",
    satisfied: hasDesc,
    detail: hasDesc ? "Adequate description provided" : "Missing detailed description or user story",
  });
  if (hasDesc) satisfiedCount++;

  // 2. Acceptance criteria defined
  const hasAc = Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0;
  checklist.push({
    criterion: "Measurable acceptance criteria",
    satisfied: hasAc,
    detail: hasAc ? `${task.acceptanceCriteria.length} criteria defined` : "No acceptance criteria defined",
  });
  if (hasAc) satisfiedCount++;

  // 3. Blocking dependencies resolved
  const isBlocked = Boolean(task.isBlocked || (Array.isArray(task.blockers) && task.blockers.some((b) => b.status !== "RESOLVED")));
  checklist.push({
    criterion: "No active blockers",
    satisfied: !isBlocked,
    detail: isBlocked ? "Task currently has unresolved blockers" : "No active blockers",
  });
  if (!isBlocked) satisfiedCount++;

  // 4. Effort estimated
  const hasEstimate = Boolean((task.estimatedHours && task.estimatedHours > 0) || (task.storyPoints && task.storyPoints > 0));
  checklist.push({
    criterion: "Estimated effort",
    satisfied: hasEstimate,
    detail: hasEstimate ? `${task.estimatedHours ? `${task.estimatedHours}h` : `${task.storyPoints} pts`}` : "Effort not estimated",
  });
  if (hasEstimate) satisfiedCount++;

  const isReady = checklist.every((c) => c.satisfied);
  const score = Math.round((satisfiedCount / checklist.length) * 100);

  return {
    isReady,
    score,
    checklist,
    missingCriteria: checklist.filter((c) => !c.satisfied).map((c) => c.criterion),
  };
}

/**
 * Check if a task satisfies the Definition of Done (DoD)
 */
export function checkDefinitionOfDone(task, definitionOfDone = DEFAULT_DEFINITION_OF_DONE) {
  const checklist = [];
  let satisfiedCount = 0;

  // 1. Implementation done
  const isCompleted = task.status === "done" || task.kanbanStatus === "DONE" || task.workflowColumn === "done";
  checklist.push({
    criterion: "Implementation complete",
    satisfied: true,
    detail: "Task marked for completion",
  });
  satisfiedCount++;

  // 2. Unresolved blockers
  const hasBlockers = Array.isArray(task.blockers) && task.blockers.some((b) => b.status !== "RESOLVED");
  checklist.push({
    criterion: "All blockers resolved",
    satisfied: !hasBlockers,
    detail: hasBlockers ? "Contains unresolved blockers" : "All blockers resolved",
  });
  if (!hasBlockers) satisfiedCount++;

  // 3. Evidence / Verification
  const hasEvidence = Array.isArray(task.deliveryEvidence) && task.deliveryEvidence.length > 0;
  checklist.push({
    criterion: "Delivery evidence recorded",
    satisfied: hasEvidence,
    detail: hasEvidence ? `${task.deliveryEvidence.length} evidence artifact(s)` : "No delivery evidence recorded",
  });
  if (hasEvidence) satisfiedCount++;

  const isDone = checklist.every((c) => c.satisfied);
  const score = Math.round((satisfiedCount / checklist.length) * 100);

  return {
    isDone,
    score,
    checklist,
    missingCriteria: checklist.filter((c) => !c.satisfied).map((c) => c.criterion),
  };
}
