/**
 * client/constants/waterfallGuideData.ts
 * ============================================================================
 * NEXUSFLOW V4 — CANONICAL WATERFALL WORKSPACE GUIDE DATA
 *
 * Single source of truth for the beginner-friendly step-by-step Waterfall tutorial
 * rendered in both:
 *   1. Documentation -> Methodologies tab
 *   2. In-workspace contextual guide modal accessible from Overview & Plan
 *
 * Covers:
 *   - 6 Canonical Waterfall Phases
 *   - 8 Main Workspace Tabs (Overview, Plan, Tasks, Timeline, Team, Insights, Project AI, Chat)
 *   - 5 Insights Sub-tabs (Project Health, Learning Loop, Capability, Risk Radar, Dependency DAG)
 *   - Natural progression sequence: Overview -> Plan -> Tasks -> Timeline -> Team -> Insights
 * ============================================================================
 */

export interface WaterfallPhaseGuide {
  number: number;
  id: string;
  name: string;
  summary: string;
  deliverables: string[];
  keyActions: string[];
}

export interface InsightsSubTabGuide {
  key: string;
  name: string;
  icon: string;
  purpose: string;
  whatItShows: string;
  recommendedAction: string;
}

export interface WaterfallTabGuide {
  tabKey: string;
  tabName: string;
  navKey: string; // Internal tab identifier used by onNavigate
  icon: string;
  order: number;
  purpose: string;
  whenToUse: string;
  steps: string[];
  whatComesNext: string;
  keyConcepts?: { term: string; explanation: string }[];
  subTabs?: InsightsSubTabGuide[];
}

// ── 1. THE SIX CANONICAL WATERFALL PHASES ────────────────────────────────────
export const WATERFALL_PHASES: WaterfallPhaseGuide[] = [
  {
    number: 1,
    id: "requirements",
    name: "1. Requirements",
    summary: "Capture teacher/client requirements, formulate SRS specifications, and achieve stakeholder approval.",
    deliverables: ["Software Requirements Specification (SRS)", "User Personas", "Approved Requirements Baseline"],
    keyActions: [
      "Review source artifacts and problem statements in Section 1.",
      "Review and verify structured requirements (REQ-01, REQ-02, ...).",
      "Resolve any conflicting scope requirements before finalizing the plan.",
    ],
  },
  {
    number: 2,
    id: "design",
    name: "2. System Design",
    summary: "Establish system architecture, database schemas, component boundaries, and API contracts.",
    deliverables: ["Architecture Component Diagrams", "Entity-Relationship Diagrams", "API Endpoint Contracts"],
    keyActions: [
      "Consult Project AI for architectural tradeoff analysis and decisions.",
      "Decompose components into high-level Work Breakdown Structure (WBS).",
      "Define dependency relationships between architectural layers.",
    ],
  },
  {
    number: 3,
    id: "implementation",
    name: "3. Implementation",
    summary: "Develop code, write unit tests, and build functional deliverables according to approved specifications.",
    deliverables: ["Source Code Modules", "Unit Tests", "Pull Request Reviews"],
    keyActions: [
      "Pick up ready tasks based on DAA Greedy priority rankings.",
      "Ensure prerequisites are complete before starting dependent tasks.",
      "Track status transitions: To Do -> In Progress -> Done.",
    ],
  },
  {
    number: 4,
    id: "testing",
    name: "4. Verification / Testing",
    summary: "Execute QA testing, integration tests, security scans, and acceptance criteria verification.",
    deliverables: ["Test Execution Report", "Bug Triage Register", "Requirement Verification Matrix"],
    keyActions: [
      "Verify each completed task against its source requirement acceptance criteria.",
      "Run regression test suites and validate bug fixes.",
      "Confirm phase gate testing criteria are satisfied before deployment.",
    ],
  },
  {
    number: 5,
    id: "deployment",
    name: "5. Deployment",
    summary: "Stage production builds, configure cloud environments, and deliver the working release.",
    deliverables: ["Staging Deployment", "Production Hosting", "Release Notes"],
    keyActions: [
      "Verify deployment infrastructure dependencies are resolved.",
      "Deploy approved release candidate to staging and production.",
      "Run smoke tests to confirm operational readiness.",
    ],
  },
  {
    number: 6,
    id: "maintenance",
    name: "6. Maintenance & Review",
    summary: "Deliver final capstone presentation, document institutional lessons, and conduct final retrospective.",
    deliverables: ["Capstone Presentation Deck", "Project Retrospective", "Project Brain Documentation"],
    keyActions: [
      "Review final project health and delivery metrics in Insights.",
      "Synthesize validated lessons in the Learning Loop.",
      "Archive final deliverables and submit project audit report.",
    ],
  },
];

// ── 2. STEP-BY-STEP WATERFALL WORKSPACE TABS GUIDE ──────────────────────────
export const WATERFALL_TAB_GUIDES: WaterfallTabGuide[] = [
  {
    tabKey: "overview",
    tabName: "Overview",
    navKey: "overview",
    icon: "grid-outline",
    order: 1,
    purpose: "Understand the current project situation, overall progress, and immediate priorities at a glance.",
    whenToUse: "Every time you open the project or when evaluating milestone progress.",
    steps: [
      "Check the Executive Summary card to see the current active phase, domain, and completion percentage.",
      "Review the Multi-Dimension Health Matrix to identify if schedule, capacity, or risks need attention.",
      "Inspect the 3D Waterfall Phase Cascade to see which phase gates have passed and which is active.",
      "Click any quick-jump card to jump directly to the workspace tab that requires action.",
    ],
    whatComesNext: "Move to the Plan tab to review requirements and finalize the baseline.",
    keyConcepts: [
      {
        term: "Phase Gate",
        explanation: "A formal review checkpoint between sequential phases. A phase gate ensures deliverables meet quality criteria before the next phase can begin.",
      },
    ],
  },
  {
    tabKey: "plan",
    tabName: "Plan",
    navKey: "plan",
    icon: "document-text-outline",
    order: 2,
    purpose: "Review source artifacts, resolve scope conflicts, approve requirements, and convert them into actionable tasks.",
    whenToUse: "At project kickoff and during requirements/architecture phase reviews.",
    steps: [
      "Inspect uploaded source artifacts, teacher briefs, and problem statements in Section 1.",
      "Review System Architecture and resolve any detected blockers or scope conflicts in Section 2.",
      "Review structured requirements (SRS) in Section 3 and approve each requirement.",
      "Check the Plan Readiness gauge (must reach 100%) and click 'Finalize Plan'.",
      "Click 'Convert All to Tasks' to generate prioritized active tasks linked directly to approved requirements.",
    ],
    whatComesNext: "Open the Tasks tab to view the generated tasks and manage daily execution.",
    keyConcepts: [
      {
        term: "Plan Readiness",
        explanation: "A deterministic check evaluating whether source artifacts, architecture, and requirements are fully reviewed, conflict-free, and approved.",
      },
      {
        term: "Traceability Link",
        explanation: "Every generated task permanently records which approved requirement (e.g. REQ-01) created it, guaranteeing complete specification coverage.",
      },
    ],
  },
  {
    tabKey: "tasks",
    tabName: "Tasks",
    navKey: "tasks",
    icon: "list-outline",
    order: 3,
    purpose: "Track, prioritize, and execute engineering tasks organized by phase and DAA priority.",
    whenToUse: "During active development to pick up work, update progress, and check dependencies.",
    steps: [
      "Review generated tasks sorted by DAA Greedy priority score (Urgency × 0.4 + Impact × 0.35 + Dependency × 0.25).",
      "Check task dependency badges to see whether a task is 'Ready to Start' or 'Blocked by Prerequisite'.",
      "Use phase hierarchy filtering or switch to Phase Kanban view to organize work by phase.",
      "Update task status (To Do -> In Progress -> Done) as you complete deliverables.",
    ],
    whatComesNext: "Open Timeline to see how tasks map across calendar dates and milestones.",
    keyConcepts: [
      {
        term: "DAA Greedy Priority",
        explanation: "An algorithmic score [0-100] prioritizing tasks that maximize project impact, unblock downstream prerequisites earliest, and address impending deadlines.",
      },
      {
        term: "Dependency Blocker",
        explanation: "A task is blocked if any of its upstream prerequisite tasks remain incomplete. Completing the prerequisite immediately unblocks downstream work.",
      },
    ],
  },
  {
    tabKey: "timeline",
    tabName: "Timeline",
    navKey: "timeline",
    icon: "calendar-outline",
    order: 4,
    purpose: "Visualize the planned schedule, task date sequences, and Critical Path Method (CPM) milestones.",
    whenToUse: "When planning milestone dates, tracking schedule slippage, or analyzing critical dependencies.",
    steps: [
      "Inspect the interactive Gantt chart schedule across project weeks.",
      "Review the Critical Path to identify tasks with zero schedule slack where any delay pushes back the final deadline.",
      "Verify task sequence respects Waterfall phase boundaries (e.g. design finishes before implementation).",
      "Track target milestone dates against your team's hard project deadline.",
    ],
    whatComesNext: "Open the Team tab to balance member workloads and assign tasks.",
    keyConcepts: [
      {
        term: "Critical Path Method (CPM)",
        explanation: "The longest sequence of dependent tasks that determines the shortest possible project duration. Tasks on this path have zero slack.",
      },
    ],
  },
  {
    tabKey: "team",
    tabName: "Team",
    navKey: "team",
    icon: "people-outline",
    order: 5,
    purpose: "Manage team member profiles, verified skills, and algorithmic workload balancing.",
    whenToUse: "When onboarding teammates, matching tasks to skills, and preventing member burnout.",
    steps: [
      "Review team members, assigned roles, and weekly hour capacities (default 30-40h).",
      "Inspect the Verified Skill Matrix to confirm technical competencies match project needs.",
      "Run the DAA Branch & Bound assignment engine to compute optimal task assignments based on skill fit and capacity.",
      "Accept recommended assignments or manually reassign tasks to resolve workload overload warnings.",
    ],
    whatComesNext: "Open Insights to evaluate deep project health, risks, and learning loops.",
    keyConcepts: [
      {
        term: "Branch & Bound Assignment",
        explanation: "An optimization algorithm that explores assignment combinations and prunes sub-optimal branches to match tasks to members with the highest skill synergy and lowest overload.",
      },
      {
        term: "Verified Skill",
        explanation: "A technical competency confirmed through assessment or verification, ensuring capability intelligence only relies on proven qualifications.",
      },
    ],
  },
  {
    tabKey: "insights",
    tabName: "Insights",
    navKey: "insights",
    icon: "analytics-outline",
    order: 6,
    purpose: "Access deep analytical intelligence across 5 specialized sub-tabs to ensure project quality and delivery.",
    whenToUse: "During phase gate reviews, weekly retrospectives, and when diagnosing delivery bottlenecks.",
    steps: [
      "Review Project Health composite grade across 8 weighted dimensions.",
      "Inspect Risk Radar for open risks and follow recommended mitigations.",
      "Check Capability Intelligence to identify any missing team competencies.",
      "Trace the Dependency DAG to detect dependency bottlenecks or circular loops.",
      "Review the Learning Loop to capture validated lessons from completed project execution.",
    ],
    whatComesNext: "Consult Project AI for architectural guidance or collaborate in Chat.",
    subTabs: [
      {
        key: "health",
        name: "Project Health",
        icon: "heart-outline",
        purpose: "Evaluates comprehensive project health [0-100] and letter grade (A+ through F).",
        whatItShows: "8 weighted dimensions: Delivery, Schedule, Capacity, Dependencies, Risks, Skills, Requirements, and Process Conformance.",
        recommendedAction: "Review critical warnings at the top of the report and take corrective action on overloaded members or overdue tasks.",
      },
      {
        key: "learning",
        name: "Learning Loop",
        icon: "school-outline",
        purpose: "Extracts empirical, evidence-backed lessons from completed tasks and execution patterns.",
        whatItShows: "Observed execution patterns, statistical confidence scores, and actionable advisory recommendations.",
        recommendedAction: "Validate high-confidence lesson candidates, apply them to active workflows, and archive obsolete findings.",
      },
      {
        key: "capability",
        name: "Capability Intelligence",
        icon: "ribbon-outline",
        purpose: "Analyzes team skill coverage against active task requirements.",
        whatItShows: "Verified competency coverage, missing skill gaps, and Branch & Bound assignment recommendations.",
        recommendedAction: "Accept recommended task assignments with one click or verify skills to clear competency gap warnings.",
      },
      {
        key: "risks",
        name: "Risk Radar",
        icon: "shield-checkmark-outline",
        purpose: "Scans for 11 categories of project risk including blocked tasks, overload, and deadline proximity.",
        whatItShows: "Active risks filtered by Open, Acknowledged, Resolved, and All, complete with evidence and recommendation.",
        recommendedAction: "Acknowledge active risks to indicate review, resolve underlying task conditions, or apply recommended fixes.",
      },
      {
        key: "dag",
        name: "Dependency DAG",
        icon: "git-network-outline",
        purpose: "Renders the topological directed acyclic graph (DAG) of task prerequisite relationships.",
        whatItShows: "Upstream prerequisite linkages, critical path sequence, and cycle-free topological ordering.",
        recommendedAction: "Verify prerequisites flow cleanly across phases and confirm no circular dependency loops exist.",
      },
    ],
  },
  {
    tabKey: "advisor",
    tabName: "Project AI",
    navKey: "advisor",
    icon: "sparkles-outline",
    order: 7,
    purpose: "Consult AI assistance grounded in your actual project brief, artifacts, and engineering context.",
    whenToUse: "When drafting technical specifications, deciding between architectural options, or researching academic algorithms.",
    steps: [
      "Ask the Project Copilot questions about implementation details, design patterns, or testing strategies.",
      "Record architectural tradeoffs in the Decision Engine with alternatives and evaluated pros/cons.",
      "Explore academic research papers relevant to your project domain.",
      "Use developer tools to inspect API schemas and data contract recommendations.",
    ],
    whatComesNext: "Coordinate implementation updates with teammates in Chat.",
  },
  {
    tabKey: "chat",
    tabName: "Chat",
    navKey: "chat",
    icon: "chatbubbles-outline",
    order: 8,
    purpose: "Real-time communication channels for project teammates and team leaders.",
    whenToUse: "Daily collaboration, coordinating deliverables, and discussing phase gate milestones.",
    steps: [
      "Discuss active phase deliverables and unblock team members in shared channels.",
      "Post updates when critical prerequisite tasks are completed.",
      "Coordinate phase gate review sign-offs with your team lead or capstone supervisor.",
    ],
    whatComesNext: "Return to Overview to monitor updated project progress and health scores.",
  },
];

// ── 3. NATURAL WORKFLOW SEQUENCE SUMMARY ────────────────────────────────────
export const WATERFALL_WORKFLOW_SEQUENCE = [
  { step: 1, tab: "Overview", label: "Inspect Current State", desc: "Understand project health, active phase, and immediate milestones." },
  { step: 2, tab: "Plan", label: "Finalize Requirements", desc: "Review artifacts, resolve scope conflicts, approve SRS, and convert to tasks." },
  { step: 3, tab: "Tasks", label: "Execute Daily Work", desc: "Pick up Greedy-ranked tasks, complete prerequisites, and update statuses." },
  { step: 4, tab: "Timeline", label: "Track Schedule & CPM", desc: "Ensure dates align with phase gates and zero-slack critical path." },
  { step: 5, tab: "Team", label: "Balance Capacity", desc: "Verify skills and apply Branch & Bound optimal workload assignments." },
  { step: 6, tab: "Insights", label: "Audit Health & Risks", desc: "Review composite health, resolve risks, and capture validated lessons." },
  { step: 7, tab: "Execution & Review", label: "Verify & Deliver", desc: "Pass phase gates sequentially to complete capstone delivery." },
];
