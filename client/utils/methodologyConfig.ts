/**
 * client/utils/methodologyConfig.ts
 * ============================================================================
 * NEXUSFLOW V4 METHODOLOGY ENGINE CONFIGURATION
 *
 * Core rule:
 * Complexity stays inside NexusFlow; simplicity stays in the user's navigation.
 *
 * Each methodology defines:
 *   - navigation: exactly 6–7 primary tabs
 *   - status: "ACTIVE" | "WIP"
 *   - workflowStates: sequential phases or board columns
 *   - planningRules: phase gates, sprint boundaries, or WIP limits
 *   - taskBehavior: WBS, phase assignment, DAA priority
 *   - dependencyBehavior: DAG topological sorting, phase barriers
 *   - scheduling: Gantt CPM vs Sprint Knapsack vs Kanban flow
 *   - healthMetrics: methodology-tailored composite indicators
 *   - aiContext: prompt role and guidance domain
 *   - uiTheme: colors, icons, terminology
 * ============================================================================
 */

export type MethodologyType = "WATERFALL" | "SCRUM" | "KANBAN" | "HYBRID" | "CLASSIC" | "NEXUSFLOW";

export type MethodologyStatus = "ACTIVE" | "WIP";

export interface MethodologyTab {
  key: string;
  label: string;
  icon: string;
  description: string;
  badge?: string;
  subTabs?: { key: string; label: string; icon?: string }[];
}

export interface WipDetails {
  targetRelease: string;
  headline: string;
  description: string;
  previewFeatures: string[];
  recommendedMethodology: MethodologyType;
}

export interface MethodologyConfig {
  id: MethodologyType;
  name: string;
  tagline: string;
  status: MethodologyStatus;
  primaryTabs: MethodologyTab[];
  workflowStates: { id: string; label: string; order: number; description: string }[];
  planningRules: {
    sequentialPhases: boolean;
    enforcePhaseGates: boolean;
    planningUnit: string;
    gateReviewRequired: boolean;
  };
  taskBehavior: {
    supportsWbs: boolean;
    requiresPhase: boolean;
    priorityAlgorithm: string;
    defaultGroupBy: "phase" | "status" | "priority" | "assignee";
  };
  dependencyBehavior: {
    enforceDag: boolean;
    phaseGateBarriers: boolean;
    allowCrossPhaseDependencies: boolean;
  };
  scheduling: {
    engineName: string;
    defaultView: "gantt" | "sprint" | "board" | "roadmap";
    supportsCriticalPath: boolean;
    supportsMilestones: boolean;
  };
  healthMetrics: {
    primaryMetricLabel: string;
    components: string[];
  };
  aiContext: {
    systemRole: string;
    focusAreas: string[];
  };
  wipDetails?: WipDetails;
}

// ── 1. WATERFALL CONFIGURATION (ACTIVE & FULLY IMPLEMENTED) ───────────────────
export const WATERFALL_CONFIG: MethodologyConfig = {
  id: "WATERFALL",
  name: "Waterfall",
  tagline: "Sequential, phase-gated engineering and predictable delivery",
  status: "ACTIVE",
  primaryTabs: [
    {
      key: "overview",
      label: "Overview",
      icon: "grid",
      description: "Project summary, phase gate health, and milestone status",
      subTabs: [
        { key: "summary", label: "Executive Summary" },
        { key: "gates", label: "Phase Gate Status" },
        { key: "team_pulse", label: "Team Pulse" },
      ],
    },
    {
      key: "plan",
      label: "Plan",
      icon: "document-text",
      description: "Requirements, WBS decomposition, System Architecture, Guidance",
      subTabs: [
        { key: "requirements", label: "Requirements & SRS" },
        { key: "wbs", label: "Work Breakdown (WBS)" },
        { key: "architecture", label: "System Architecture" },
        { key: "guidance", label: "Next Best Actions" },
      ],
    },
    {
      key: "tasks",
      label: "Tasks",
      icon: "list",
      description: "Greedy-prioritized tasks, phase groupings, and execution board",
      subTabs: [
        { key: "list", label: "Greedy Task List" },
        { key: "by_phase", label: "Phase Hierarchy" },
        { key: "board", label: "Phase Kanban" },
      ],
    },
    {
      key: "timeline",
      label: "Timeline",
      icon: "calendar",
      description: "Interactive Gantt chart, CPM critical path, and milestones",
      subTabs: [
        { key: "gantt", label: "Gantt Schedule" },
        { key: "critical_path", label: "Critical Path Analysis" },
        { key: "milestones", label: "Milestones & Gates" },
      ],
    },
    {
      key: "team",
      label: "Team",
      icon: "people",
      description: "Team roster, role assignments, Branch & Bound workload, Skill Matrix",
      subTabs: [
        { key: "roster", label: "Team Roster & Roles" },
        { key: "assignment", label: "Branch & Bound Assignment" },
        { key: "skills", label: "Verified Skill Matrix" },
      ],
    },
    {
      key: "insights",
      label: "Insights",
      icon: "analytics",
      description: "Team Health, Risk Intelligence, Sorting Analytics, Retrospective",
      subTabs: [
        { key: "health", label: "Team Health" },
        { key: "risks", label: "Risk Intelligence" },
        { key: "analytics", label: "Algorithm Benchmarks" },
        { key: "retro", label: "Retrospective & Loop" },
      ],
    },
    {
      key: "advisor",
      label: "Project AI",
      icon: "sparkles",
      description: "Copilot reasoning, Decision Engine, Academic Papers, Dev Tools",
      subTabs: [
        { key: "copilot", label: "Project Copilot" },
        { key: "decisions", label: "Architectural Decisions" },
        { key: "research", label: "Academic Research" },
        { key: "tools", label: "Developer Tools" },
      ],
    },
  ],
  workflowStates: [
    { id: "requirements", label: "1. Requirements", order: 1, description: "Capture teacher/client requirements & SRS specifications" },
    { id: "design", label: "2. System Design", order: 2, description: "Architectural components, database schemas, and API contracts" },
    { id: "implementation", label: "3. Implementation", order: 3, description: "Task development, coding, and code reviews" },
    { id: "testing", label: "4. Verification & QA", order: 4, description: "Unit tests, integration tests, and defect validation" },
    { id: "deployment", label: "5. Deployment", order: 5, description: "Production staging, hosting, and release delivery" },
    { id: "maintenance", label: "6. Maintenance & Review", order: 6, description: "Final presentation, documentation, and retrospective" },
  ],
  planningRules: {
    sequentialPhases: true,
    enforcePhaseGates: true,
    planningUnit: "Phase",
    gateReviewRequired: true,
  },
  taskBehavior: {
    supportsWbs: true,
    requiresPhase: true,
    priorityAlgorithm: "Greedy DAA Score (Urgency × 0.4 + Impact × 0.35 + Dependency × 0.25)",
    defaultGroupBy: "phase",
  },
  dependencyBehavior: {
    enforceDag: true,
    phaseGateBarriers: true,
    allowCrossPhaseDependencies: false,
  },
  scheduling: {
    engineName: "Critical Path Method (CPM) + Topological Sort",
    defaultView: "gantt",
    supportsCriticalPath: true,
    supportsMilestones: true,
  },
  healthMetrics: {
    primaryMetricLabel: "Phase Schedule Integrity",
    components: [
      "Phase Gate Completion Rate",
      "Critical Path Slippage",
      "Blocked Dependency Ratio",
      "Workload Balance (Branch & Bound)",
    ],
  },
  aiContext: {
    systemRole: "Waterfall Systems Engineering Copilot",
    focusAreas: [
      "Software Requirements Specifications (SRS)",
      "Phase Gate Review Preparation",
      "Architectural Tradeoff Decisions",
      "Critical Path Risk Prevention",
    ],
  },
};

// ── 2. SCRUM CONFIGURATION (WORK IN PROGRESS) ─────────────────────────────────
export const SCRUM_CONFIG: MethodologyConfig = {
  id: "SCRUM",
  name: "Scrum",
  tagline: "Time-boxed iterations, sprint backlog burndown, and team velocity",
  status: "WIP",
  primaryTabs: [
    { key: "overview", label: "Sprint Overview", icon: "rocket", description: "Sprint goals, burndown summary, and daily standup" },
    { key: "backlog", label: "Product Backlog", icon: "layers", description: "User stories, story points, and sprint candidate pool" },
    { key: "sprint_board", label: "Sprint Board", icon: "grid", description: "Active sprint cards by To Do, In Progress, Review, Done" },
    { key: "velocity", label: "Velocity & Burndown", icon: "trending-up", description: "Sprint burndown charts and story point throughput" },
    { key: "team", label: "Scrum Team", icon: "people", description: "Scrum Master, Product Owner, Dev team capacity and load" },
    { key: "insights", label: "Ceremonies & Retro", icon: "clipboard", description: "Sprint Retrospective, demo notes, and improvement items" },
    { key: "advisor", label: "Scrum AI Copilot", icon: "sparkles", description: "Story point estimation assistant and backlog groomer" },
  ],
  workflowStates: [
    { id: "backlog", label: "Product Backlog", order: 1, description: "Prioritized user stories" },
    { id: "sprint_ready", label: "Sprint Ready", order: 2, description: "Estimated and groomed" },
    { id: "in_progress", label: "In Sprint", order: 3, description: "Active development" },
    { id: "in_review", label: "Code Review", order: 4, description: "Peer review & QA" },
    { id: "done", label: "Done", order: 5, description: "Definition of Done satisfied" },
  ],
  planningRules: {
    sequentialPhases: false,
    enforcePhaseGates: false,
    planningUnit: "Sprint (1-4 Weeks)",
    gateReviewRequired: false,
  },
  taskBehavior: {
    supportsWbs: false,
    requiresPhase: false,
    priorityAlgorithm: "0/1 Knapsack Value-to-Effort Optimizer",
    defaultGroupBy: "status",
  },
  dependencyBehavior: {
    enforceDag: true,
    phaseGateBarriers: false,
    allowCrossPhaseDependencies: true,
  },
  scheduling: {
    engineName: "0/1 Knapsack Dynamic Programming Sprint Planner",
    defaultView: "sprint",
    supportsCriticalPath: false,
    supportsMilestones: true,
  },
  healthMetrics: {
    primaryMetricLabel: "Sprint Velocity & Commitment Ratio",
    components: ["Burndown Adherence", "Story Point Completion", "Carryover Ratio"],
  },
  aiContext: {
    systemRole: "Agile Scrum Master AI",
    focusAreas: ["User Story Decomposition", "Story Point Estimation", "Sprint Goal Formulation"],
  },
  wipDetails: {
    targetRelease: "NexusFlow V4.1",
    headline: "Scrum Iterative Environment Under Construction",
    description:
      "NexusFlow V4 is establishing the complete Waterfall methodology first. The dedicated Scrum environment with sprint velocity tracking, burndown projections, and ceremony workflows is arriving in V4.1.",
    previewFeatures: [
      "Dynamic 2-week and 4-week Sprint Cadences",
      "0/1 Knapsack Sprint Capacity Optimization",
      "Realtime Burndown & Burnup Projections",
      "Integrated Sprint Ceremonies & Backlog Refinement",
    ],
    recommendedMethodology: "WATERFALL",
  },
};

// ── 3. KANBAN CONFIGURATION (WORK IN PROGRESS) ────────────────────────────────
export const KANBAN_CONFIG: MethodologyConfig = {
  id: "KANBAN",
  name: "Kanban",
  tagline: "Continuous flow, explicit WIP limits, and cycle-time optimization",
  status: "WIP",
  primaryTabs: [
    { key: "overview", label: "Flow Overview", icon: "pulse", description: "Lead time, cycle time, and throughput summary" },
    { key: "board", label: "Kanban Board", icon: "grid", description: "Swimlanes, WIP-limited columns, and pull queues" },
    { key: "cfd", label: "Cumulative Flow", icon: "analytics", description: "CFD diagram diagnosing bottlenecks and wait states" },
    { key: "wip_limits", label: "WIP Policies", icon: "shield", description: "Column thresholds and bottleneck warnings" },
    { key: "team", label: "Flow Team", icon: "people", description: "Member availability and pull capacity" },
    { key: "insights", label: "Cycle Time Insights", icon: "speedometer", description: "Little's Law throughput analytics" },
    { key: "advisor", label: "Kanban AI Advisor", icon: "sparkles", description: "Bottleneck identification and flow optimization" },
  ],
  workflowStates: [
    { id: "ready", label: "Ready to Pull", order: 1, description: "Prioritized work queue" },
    { id: "analyzing", label: "Analyzing", order: 2, description: "Specification and scoping" },
    { id: "implementing", label: "Developing", order: 3, description: "Active work in progress" },
    { id: "verifying", label: "Verifying", order: 4, description: "Quality validation" },
    { id: "done", label: "Delivered", order: 5, description: "Shipped to users" },
  ],
  planningRules: {
    sequentialPhases: false,
    enforcePhaseGates: false,
    planningUnit: "Continuous Flow",
    gateReviewRequired: false,
  },
  taskBehavior: {
    supportsWbs: false,
    requiresPhase: false,
    priorityAlgorithm: "Cost of Delay / Pull Demand",
    defaultGroupBy: "status",
  },
  dependencyBehavior: {
    enforceDag: true,
    phaseGateBarriers: false,
    allowCrossPhaseDependencies: true,
  },
  scheduling: {
    engineName: "Little's Law Flow Analysis (WIP = Throughput × Cycle Time)",
    defaultView: "board",
    supportsCriticalPath: false,
    supportsMilestones: false,
  },
  healthMetrics: {
    primaryMetricLabel: "Flow Efficiency & WIP Limit Adherence",
    components: ["Average Cycle Time", "WIP Breach Frequency", "Queue Wait Time"],
  },
  aiContext: {
    systemRole: "Continuous Flow Optimization AI",
    focusAreas: ["Bottleneck Detection", "WIP Limit Calibration", "Queue Starvation Prevention"],
  },
  wipDetails: {
    targetRelease: "NexusFlow V4.1",
    headline: "Kanban Continuous Flow Environment Under Construction",
    description:
      "NexusFlow V4 is prioritizing the Waterfall engineering environment. The dedicated Kanban pull-based workspace with strict WIP limits and Cumulative Flow Diagrams is coming in V4.1.",
    previewFeatures: [
      "Configurable Per-Column WIP Limits",
      "Interactive Cumulative Flow Diagram (CFD)",
      "Little's Law Cycle Time & Lead Time Calculators",
      "Automated Bottleneck Alerts & Flow Leveling",
    ],
    recommendedMethodology: "WATERFALL",
  },
};

// ── 4. HYBRID CONFIGURATION (WORK IN PROGRESS) ────────────────────────────────
export const HYBRID_CONFIG: MethodologyConfig = {
  id: "HYBRID",
  name: "Hybrid",
  tagline: "Phase-gated governance combined with agile sprint execution",
  status: "WIP",
  primaryTabs: [
    { key: "overview", label: "Hybrid Roadmap", icon: "map", description: "Phase milestones mapped over agile iterations" },
    { key: "governance", label: "Stage-Gates", icon: "shield-checkmark", description: "High-level stage approval and client sign-off" },
    { key: "iterations", label: "Sprint Cadence", icon: "repeat", description: "Iterative sprints delivering phase goals" },
    { key: "tasks", label: "Hybrid Backlog", icon: "list", description: "Deliverables decomposed into sprint tasks" },
    { key: "team", label: "Cross-Functional Team", icon: "people", description: "Matrix team capacity and roles" },
    { key: "insights", label: "Governance & Velocity", icon: "pie-chart", description: "Milestone variance vs sprint throughput" },
    { key: "advisor", label: "Hybrid Advisor", icon: "sparkles", description: "Stage-gate compliance and sprint alignment" },
  ],
  workflowStates: [
    { id: "concept", label: "Phase 1: Concept & Gates", order: 1, description: "Waterfall requirements sign-off" },
    { id: "iteration_build", label: "Phase 2: Agile Sprints", order: 2, description: "Iterative sprints 1 through N" },
    { id: "system_validation", label: "Phase 3: Integration Gate", order: 3, description: "Stage-gate formal testing" },
    { id: "deployment_release", label: "Phase 4: Release & Handover", order: 4, description: "Final client acceptance" },
  ],
  planningRules: {
    sequentialPhases: true,
    enforcePhaseGates: true,
    planningUnit: "Stage-Gate + Sprint",
    gateReviewRequired: true,
  },
  taskBehavior: {
    supportsWbs: true,
    requiresPhase: true,
    priorityAlgorithm: "Hybrid Critical Path + Knapsack DP",
    defaultGroupBy: "phase",
  },
  dependencyBehavior: {
    enforceDag: true,
    phaseGateBarriers: true,
    allowCrossPhaseDependencies: false,
  },
  scheduling: {
    engineName: "Dual-Engine (Gantt Macro-Schedule + Knapsack Micro-Sprints)",
    defaultView: "roadmap",
    supportsCriticalPath: true,
    supportsMilestones: true,
  },
  healthMetrics: {
    primaryMetricLabel: "Milestone Adherence & Iteration Health",
    components: ["Gate Clearance Rate", "Sprint Delivery Ratio", "Scope Drift Index"],
  },
  aiContext: {
    systemRole: "Hybrid Delivery Governance Copilot",
    focusAreas: ["Stage-Gate Review Checklists", "Sprint-to-Milestone Mapping", "Compliance Tracking"],
  },
  wipDetails: {
    targetRelease: "NexusFlow V4.2",
    headline: "Hybrid Stage-Gate / Agile Environment Under Construction",
    description:
      "NexusFlow V4 is perfecting the Waterfall methodology first. The advanced Hybrid engine marrying Waterfall executive governance with Agile sprint execution is scheduled for V4.2.",
    previewFeatures: [
      "Dual-Timeline Visualization (Macro Milestones + Micro Sprints)",
      "Automated Stage-Gate Compliance Checklists",
      "Sprint-to-Deliverable Traceability Matrix",
      "Executive Progress Dashboards with Agile Burndown",
    ],
    recommendedMethodology: "WATERFALL",
  },
};

// ── 5. NEXUSFLOW CLASSIC CONFIGURATION (ORIGINAL V3 WORKSPACE) ───────────────
export const CLASSIC_CONFIG: MethodologyConfig = {
  id: "CLASSIC",
  name: "NexusFlow Classic",
  tagline: "Original 12-tab NexusFlow V3 project experience with sprint and kanban workflows",
  status: "ACTIVE",
  primaryTabs: [
    { key: "overview", label: "Overview", icon: "grid", description: "V3 Project Summary" },
    { key: "advisor", label: "Project AI", icon: "sparkles", description: "AI Project Copilot" },
    { key: "tasks", label: "Tasks", icon: "list", description: "Task Backlog & Prioritization" },
    { key: "sprint", label: "Sprint", icon: "rocket", description: "0/1 Knapsack Capacity Optimizer" },
    { key: "graph", label: "Graph", icon: "git-network", description: "Topological Dependency DAG" },
    { key: "members", label: "Members", icon: "people", description: "Branch & Bound Assignment" },
    { key: "analytics", label: "Analytics", icon: "stats-chart", description: "Performance Charts" },
    { key: "health", label: "Health", icon: "heart", description: "Team Health Indicators" },
    { key: "risks", label: "Risks", icon: "shield-checkmark", description: "Automated Risk Scanner" },
    { key: "github", label: "GitHub", icon: "logo-github", description: "Repo Synchronization" },
    { key: "retro", label: "Retro", icon: "clipboard", description: "Sprint Retrospective" },
    { key: "chat", label: "Chat", icon: "chatbubbles", description: "Team Communications" },
  ],
  workflowStates: [
    { id: "todo", label: "To Do", order: 1, description: "Unstarted tasks" },
    { id: "in_progress", label: "In Progress", order: 2, description: "Active work" },
    { id: "blocked", label: "Blocked", order: 3, description: "Impeded work" },
    { id: "done", label: "Done", order: 4, description: "Finished work" },
  ],
  planningRules: {
    sequentialPhases: false,
    enforcePhaseGates: false,
    planningUnit: "Sprint",
    gateReviewRequired: false,
  },
  taskBehavior: {
    supportsWbs: false,
    requiresPhase: false,
    priorityAlgorithm: "Greedy DAA Score",
    defaultGroupBy: "status",
  },
  dependencyBehavior: {
    enforceDag: true,
    phaseGateBarriers: false,
    allowCrossPhaseDependencies: true,
  },
  scheduling: {
    engineName: "Knapsack Sprint Optimizer + Topological Sort",
    defaultView: "board",
    supportsCriticalPath: false,
    supportsMilestones: false,
  },
  healthMetrics: {
    primaryMetricLabel: "Composite Team Health",
    components: ["Task Completion", "Workload Balance", "Blocked Ratio"],
  },
  aiContext: {
    systemRole: "General Project Engineering Copilot",
    focusAreas: ["Sprint Planning", "General Architecture"],
  },
};

// ── REGISTRY & SELECTOR HELPERS ───────────────────────────────────────────────

export const METHODOLOGIES: Record<MethodologyType, MethodologyConfig> = {
  WATERFALL: WATERFALL_CONFIG,
  SCRUM:     SCRUM_CONFIG,
  KANBAN:    KANBAN_CONFIG,
  HYBRID:    HYBRID_CONFIG,
  CLASSIC:   CLASSIC_CONFIG,
  NEXUSFLOW: CLASSIC_CONFIG,
};

export const ALL_METHODOLOGIES: MethodologyConfig[] = [
  WATERFALL_CONFIG,
  CLASSIC_CONFIG,
  SCRUM_CONFIG,
  KANBAN_CONFIG,
  HYBRID_CONFIG,
];

/**
 * Resolves a methodology config from any string representation safely.
 * Defaults cleanly to WATERFALL if invalid or unspecified.
 */
export function getMethodologyConfig(methodology?: string | null): MethodologyConfig {
  if (!methodology) return WATERFALL_CONFIG;
  const upper = String(methodology).toUpperCase().trim();
  if (upper in METHODOLOGIES) {
    return METHODOLOGIES[upper as MethodologyType];
  }
  // Soft matching for common variants
  if (upper.includes("CLASSIC") || upper.includes("NEXUSFLOW") || upper.includes("V3")) return CLASSIC_CONFIG;
  if (upper.includes("WATERFALL")) return WATERFALL_CONFIG;
  if (upper.includes("SCRUM") || upper.includes("AGILE")) return SCRUM_CONFIG;
  if (upper.includes("KANBAN")) return KANBAN_CONFIG;
  if (upper.includes("HYBRID")) return HYBRID_CONFIG;
  return WATERFALL_CONFIG;
}

/**
 * Checks whether a given methodology is currently active / fully supported.
 */
export function isMethodologyActive(methodology?: string | null): boolean {
  return getMethodologyConfig(methodology).status === "ACTIVE";
}
