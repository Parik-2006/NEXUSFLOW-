/**
 * client/constants/classicGuideData.ts
 * ============================================================================
 * NEXUSFLOW V1 — DAA PROJECT MANAGEMENT GUIDE DATA
 *
 * Ground truth documentation of the original MERN-stack project management
 * system powered by classical Design and Analysis of Algorithms (DAA).
 * Covers the 6 original tabs and the 8 classical algorithms.
 * ============================================================================
 */

export interface ClassicGuideStep {
  step: number;
  title: string;
  tagline: string;
  desc: string;
  tabTarget: "overview" | "tasks" | "sprint" | "graph" | "members" | "chat";
  icon: string;
  color: string;
  highlights: string[];
  algorithmName?: string;
  algorithmSummary?: string;
  formulation?: string;
}

export interface DaaAlgorithmInfo {
  name: string;
  complexity: string;
  originalApplication: string;
  description: string;
}

export const CLASSIC_GUIDE_STEPS: ClassicGuideStep[] = [
  {
    step: 1,
    title: "1. Overview Dashboard",
    tagline: "High-level project telemetry and progress monitoring",
    desc: "The Overview tab serves as the central command center for your Classic workspace. It continuously computes real-time project statistics from persisted tasks, including completion ratios, pending workloads, deadline urgency, and priority distribution.",
    tabTarget: "overview",
    icon: "speedometer-outline",
    color: "#2563EB",
    highlights: [
      "Project progress percentage (completed tasks / total tasks)",
      "Status breakdown (To Do, In Progress, Done)",
      "Upcoming deadlines calendar (overdue, today, next 7 days)",
      "Greedy priority distribution pie chart",
      "Workspace health score derived from deadlines and dependencies",
      "Direct navigation jumps to all workspace subsystems",
    ],
  },
  {
    step: 2,
    title: "2. Tasks Management",
    tagline: "Classical task management with Boyer-Moore pattern search",
    desc: "The Tasks tab provides full lifecycle task management without modern phase gates or AI-generated story approvals. Tasks feature estimated hours, business values, deadlines, priorities, assignees, and prerequisite dependencies.",
    tabTarget: "tasks",
    icon: "list-outline",
    color: "#0284C7",
    highlights: [
      "All Tasks: Full table listing with create, edit, delete, and assignment controls",
      "Boyer-Moore Search: Sub-linear string pattern matching for instant task discovery",
      "Priority View: Greedy Priority Scheduler ordering tasks by business value density",
      "Deadline View: Earliest Deadline First (EDF) urgency ranking and countdowns",
      "Progress View: Kanban swimlanes for manual status transitions",
    ],
    algorithmName: "Boyer-Moore & Merge Sort",
    algorithmSummary: "Tasks are sorted using Merge Sort O(n log n) across deadline and priority keys, while search leverages Boyer-Moore preprocessing O(m + n).",
  },
  {
    step: 3,
    title: "3. Sprint Optimizer",
    tagline: "Value maximization under capacity constraints via 0/1 Knapsack",
    desc: "The Classic Sprint Optimizer does not use manual ceremony estimation. Instead, it formulates sprint planning as an exact 0/1 Knapsack problem: selecting the subset of backlog tasks that maximizes total business value without exceeding configured team capacity.",
    tabTarget: "sprint",
    icon: "cube-outline",
    color: "#7C3AED",
    highlights: [
      "Input task business values and estimated completion hours",
      "Configure team sprint hour capacity (e.g. 40h)",
      "Compute optimal task selection matrix via dynamic programming O(n × C)",
      "Inspect detailed selection breakdown (Selected vs Excluded items)",
      "View value-per-hour density metrics and residual capacity",
    ],
    algorithmName: "0/1 Knapsack (Dynamic Programming)",
    algorithmSummary: "Computes the global maximum value subset satisfying sum(hours[i] * x[i]) <= capacity, where x[i] ∈ {0, 1}.",
    formulation: "Maximize: Σ (value[i] × x[i])\nSubject to: Σ (hours[i] × x[i]) ≤ sprintCapacity\nwhere x[i] ∈ {0, 1}",
  },
  {
    step: 4,
    title: "4. Dependency Graph (DAG)",
    tagline: "Directed Acyclic Graph traversal and Topological Ordering",
    desc: "The Graph tab visualizes task prerequisite relationships as a Directed Acyclic Graph (DAG). It guarantees that tasks are executed in a mathematically valid sequence, preventing deadlocks and highlighting critical paths.",
    tabTarget: "graph",
    icon: "git-network-outline",
    color: "#0D9488",
    highlights: [
      "Directed edges representing prerequisite-to-dependent relationships",
      "Topological Sort via Kahn's Algorithm (in-degree reduction) for execution ordering",
      "Depth-First Search (DFS) for cycle and circular dependency detection",
      "Breadth-First Search (BFS) for level-wise execution tiers and dependency depth",
      "Interactive SVG visualization of upstream and downstream task nodes",
    ],
    algorithmName: "Kahn's Algorithm (Topological Sort) & DFS / BFS",
    algorithmSummary: "Ensures execution order satisfies all prerequisites in O(V + E) time, flagging illegal circular dependencies before scheduling.",
  },
  {
    step: 5,
    title: "5. Members & Allocation",
    tagline: "Skill matrices and Branch & Bound optimal task assignment",
    desc: "The Members tab manages team roster profiles, competency ratings across 6 engineering skills, and availability. When tasks need distribution, the Branch and Bound assignment engine finds the optimal member-task mapping minimizing skill-gap penalties.",
    tabTarget: "members",
    icon: "people-outline",
    color: "#EA580C",
    highlights: [
      "Manage team member profiles and role designations",
      "Individual 1–10 skill ratings: Frontend, Backend, DevOps, Design, ML, Testing",
      "SkillMatrix visual competency board comparing member strengths",
      "Workload capacity tracking (assigned hours vs available capacity)",
      "Branch and Bound state-space search for minimum-cost task assignment",
    ],
    algorithmName: "Branch & Bound Assignment",
    algorithmSummary: "Explores the member-to-task assignment space with cost-bounding heuristics O(n!), pruning suboptimal branches to minimize misfit penalties.",
  },
  {
    step: 6,
    title: "6. Team Chat",
    tagline: "Real-time asynchronous workspace communication",
    desc: "The Chat tab provides direct team communication for coordinating implementation details, blockers, and handoffs. It represents the original peer-to-peer workspace messaging without AI bots or synthetic agents.",
    tabTarget: "chat",
    icon: "chatbubbles-outline",
    color: "#6366F1",
    highlights: [
      "Workspace-isolated real-time messaging",
      "Persistent chat history stored in MongoDB",
      "Instant task status updates and team announcements",
      "Pure team collaboration without automated AI intrusions",
    ],
  },
];

export const DAA_ALGORITHMS: DaaAlgorithmInfo[] = [
  {
    name: "0/1 Knapsack",
    complexity: "O(n × W) Time · O(n × W) Space",
    originalApplication: "Sprint Optimizer — selects optimal task combination maximizing business value within sprint hour capacity.",
    description: "Dynamic programming approach using a 2D recurrence table to determine whether to include or exclude each task based on remaining capacity.",
  },
  {
    name: "Topological Sort (Kahn's)",
    complexity: "O(V + E) Time · O(V) Space",
    originalApplication: "Dependency Graph — computes a linear ordering of tasks consistent with all prerequisite constraints.",
    description: "Maintains in-degree counts for all tasks, iteratively dequeuing 0-in-degree vertices and reducing degrees of dependent tasks.",
  },
  {
    name: "Depth-First Search (DFS)",
    complexity: "O(V + E) Time · O(V) Space",
    originalApplication: "Cycle Detection & Reachability — detects circular prerequisite deadlocks before execution.",
    description: "Recursively traverses dependency paths tracking recursion-stack states to identify back-edges and circular dependency loops.",
  },
  {
    name: "Breadth-First Search (BFS)",
    complexity: "O(V + E) Time · O(V) Space",
    originalApplication: "Dependency Leveling — calculates task execution tiers and shortest prerequisite distance.",
    description: "Level-by-level queue traversal establishing dependency depth and identifying parallel execution opportunities.",
  },
  {
    name: "Greedy Scheduler",
    complexity: "O(n log n) Time · O(n) Space",
    originalApplication: "Priority Scheduler — ranks tasks by business value density (value / estimated hours).",
    description: "Locally optimal choice heuristic ordering backlog items by highest immediate return on engineering effort.",
  },
  {
    name: "Earliest Deadline First (EDF)",
    complexity: "O(n log n) Time · O(n) Space",
    originalApplication: "Deadline Urgency Ranking — sorts tasks by calendar due date proximity.",
    description: "Dynamic priority scheduling algorithm prioritizing tasks with nearest impending deadlines to minimize missed milestones.",
  },
  {
    name: "Branch and Bound",
    complexity: "O(n!) Worst · Pruned Average",
    originalApplication: "Optimal Member Assignment — allocates tasks to members minimizing skill mismatch cost.",
    description: "Constructs a state-space tree of member assignments, maintaining upper and lower bounds to prune provably suboptimal permutations.",
  },
  {
    name: "Boyer-Moore",
    complexity: "O(n / m) Best · O(n + m) Worst",
    originalApplication: "Task Search — enables instant pattern matching across task titles, descriptions, and assignees.",
    description: "Sub-linear string search using bad-character and good-suffix shift heuristics to skip unnecessary character comparisons.",
  },
  {
    name: "Merge Sort",
    complexity: "O(n log n) Time · O(n) Space",
    originalApplication: "Multi-Key Task Ordering — stable sorting across priority, deadline, created timestamp, and hours.",
    description: "Divide-and-conquer sorting algorithm guaranteeing stable ordering without degrading under adversarial task inputs.",
  },
];

export const CLASSIC_DAA_ALGORITHMS = DAA_ALGORITHMS;
