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
    algorithmSummary: "Tasks are sorted using Merge Sort O(n log n) across deadline and priority keys, while search uses Boyer–Moore–Horspool (O(m) preprocessing, O(n·m) worst case, ≈ n/m comparisons on typical text).",
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
      "Compute the optimal task selection via dynamic programming O(n × W), W = capacity in 0.01 h units (pseudo-polynomial)",
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
      "Longest-prerequisite execution waves (every prerequisite in an earlier wave); BFS for reachability",
      "Interactive SVG visualization of upstream and downstream task nodes",
    ],
    algorithmName: "Kahn's Algorithm (Topological Sort) & DFS / BFS",
    algorithmSummary: "Ensures execution order satisfies all prerequisites in O(E + V log V) time (deterministic min-heap), flagging circular dependencies before scheduling.",
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
    algorithmSummary: "Explores the member-to-task assignment space (worst case O(mⁿ)) with an admissible lower bound, respecting member hour capacity; proven optimal up to 16 tasks, otherwise labelled approximate.",
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
    complexity: "O(n × W) Time · O(W) + n·W bits Space (W = capacity in 0.01 h)",
    originalApplication: "Sprint Optimizer — selects optimal task combination maximizing business value within sprint hour capacity.",
    description: "Bottom-up dynamic programming over capacity; fractional hours are counted in 0.01 h units (task hours rounded up, capacity down) so the plan never exceeds capacity.",
  },
  {
    name: "Topological Sort (Kahn's)",
    complexity: "O(E + V log V) Time · O(V + E) Space",
    originalApplication: "Dependency Graph — computes a linear ordering of tasks consistent with all prerequisite constraints.",
    description: "Maintains in-degree counts and a min-heap of ready tasks (smallest id first), so the order is deterministic; a FIFO queue variant runs in O(V + E).",
  },
  {
    name: "Depth-First Search (DFS)",
    complexity: "O(V + E) Time · O(V) Space",
    originalApplication: "Cycle Detection & Reachability — detects circular prerequisite deadlocks before execution.",
    description: "Iterative depth-first traversal (no recursion-depth limit) recording discovery/finish times; cycle members are identified with strongly connected components.",
  },
  {
    name: "Breadth-First Search (BFS)",
    complexity: "O(V + E) Time · O(V) Space",
    originalApplication: "Reachability — shortest hop distance from tasks without prerequisites.",
    description: "Level-by-level queue traversal. Its levels are NOT execution waves: waves use the longest prerequisite chain so every prerequisite lands in an earlier wave.",
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
    complexity: "O(mⁿ) Worst case · exact ≤ 16 tasks",
    originalApplication: "Optimal Member Assignment — allocates tasks to members minimizing skill mismatch cost.",
    description: "Constructs a state-space tree of member assignments, maintaining upper and lower bounds to prune provably suboptimal permutations.",
  },
  {
    name: "Boyer–Moore–Horspool",
    complexity: "≈ O(n / m) Typical · O(n·m) Worst",
    originalApplication: "Task Search — enables instant pattern matching across task titles, descriptions, and assignees.",
    description: "Horspool variant: right-to-left window comparison with a bad-character shift table (no good-suffix rule), NFC + lower-case normalised.",
  },
  {
    name: "Merge Sort",
    complexity: "O(n log n) Time · O(n) Space",
    originalApplication: "Multi-Key Task Ordering — stable sorting across priority, deadline, created timestamp, and hours.",
    description: "Divide-and-conquer sorting algorithm guaranteeing stable ordering without degrading under adversarial task inputs.",
  },
];

export const CLASSIC_DAA_ALGORITHMS = DAA_ALGORITHMS;
