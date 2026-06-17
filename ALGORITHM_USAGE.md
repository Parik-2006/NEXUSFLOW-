# NexusFlow — Algorithm Usage (DAA)

Every Design & Analysis of Algorithms technique implemented in NexusFlow, with
purpose, input, output, complexity, where it runs in the app, and the
real-world benefit. Complexities are taken directly from the source headers.

| # | Algorithm | Family | Source file |
|---|-----------|--------|-------------|
| 1 | Greedy Scheduling | Greedy | `server/algorithms/greedyScheduler.js` |
| 2 | DFS | Graph traversal | `server/algorithms/graphTraversal.js` |
| 3 | BFS | Graph traversal | `server/algorithms/graphTraversal.js` |
| 4 | Topological Sort (Kahn) | Graph / DAG | `server/algorithms/graphTraversal.js` |
| 5 | 0/1 Knapsack | Dynamic programming | `server/algorithms/taskOptimiser.js` |
| 6 | Branch & Bound | Optimisation / state-space search | `server/algorithms/branchAndBound.js` |
| 7 | Merge Sort | Divide & conquer (stable sort) | `server/algorithms/taskOptimiser.js` |
| 8 | Boyer-Moore-Horspool | String matching | `server/algorithms/taskOptimiser.js` + `client/utils/boyerMoore.ts` |

---

## 1. Greedy Scheduling — Priority Scheduler

- **Purpose:** Decide the *order* tasks should be worked. Produces a single
  composite priority score so the backlog self-sorts.
- **Input:** Per task — `urgency` (1–5), `impact` (1–5), `dependencyCount`
  (fan-in, capped at 20).
- **Output:** `priorityScore` ∈ [0, 100]; `greedySortTasks` returns a new array
  in descending score order (FIFO tie-break on `createdAt`).
- **Time:** `computePriorityScore` O(1); `greedySortTasks` O(n log n).
- **Space:** O(n) (output array).
- **Where used:** `Task.pre('save')` / `pre('findOneAndUpdate')` auto-compute
  the score on every write; `routes/teams.js` uses `greedySortTasks` for the
  scheduled-tasks endpoint. Score formula weights: urgency 0.50, impact 0.35,
  dependency fan-in 0.15.
- **Real-world benefit:** Removes manual triage — high-urgency, high-impact,
  heavily-depended-on tasks bubble to the top automatically and consistently.

---

## 2. DFS — Depth-First Search

- **Purpose:** Explore the dependency graph depth-first to expose discovery /
  finish ordering and reachability.
- **Input:** Adjacency list built from tasks' `dependencies` (`buildGraph`).
- **Output:** `{ order, timestamps }` — post-order traversal plus per-node
  discovery/finish times.
- **Time:** O(V + E).  **Space:** O(V) (recursion / visited set).
- **Where used:** `GET /api/teams/:teamId/dependency-graph` (DFS section of the
  graph response consumed by the Graph tab).
- **Real-world benefit:** Reveals deep dependency chains and the structure of
  the work graph, the basis for safe execution ordering.

---

## 3. BFS — Breadth-First Search (dependency levels)

- **Purpose:** Group tasks into **execution waves / tiers** — every task in a
  wave depends only on earlier waves, so a wave can run in parallel.
- **Input:** Adjacency list + in-degree map (`buildGraph`).
- **Output:** `{ order, levels }`; `bfsDependencyLevels` regroups into waves
  (`waves[0]` runs first). Nodes inside a cycle get level `-1`.
- **Time:** O(V + E).  **Space:** O(V) (queue + level map).
- **Where used:** dependency-graph endpoint (parallel tiers) and **Phase 1** of
  the recommendation engine to find the dependency-free *ready set*.
- **Real-world benefit:** Shows what can be parallelised *now*, maximising team
  throughput instead of serialising independent work.

---

## 4. Topological Sort — Kahn's Algorithm

- **Purpose:** Produce a dependency-safe linear execution order and detect
  circular dependencies.
- **Input:** Adjacency list + in-degree map.
- **Output:** `{ order, hasCycle }`. The ready set is `sort()`-ed each step so
  the ordering is **fully deterministic** across every screen.
- **Time:** O(V + E + V log V) (deterministic tie-break sort).  **Space:** O(V).
- **Where used:** the single canonical topo sort for the whole app —
  dependency-graph API, `…/tasks/execution-order`, socket
  `recomputeAndBroadcast` (writes `topoOrder`), and **Phase 5** of the
  recommendation engine. `taskOptimiser` and `taskHandlers` both delegate here.
- **Real-world benefit:** Guarantees engineers never start a task before its
  prerequisites; circular-dependency mistakes are caught and flagged.

---

## 5. 0/1 Knapsack — Sprint Capacity Planning

- **Purpose:** Select the subset of candidate tasks that **maximises total
  business value** without exceeding the sprint's story-point / hours budget.
- **Input:** Candidate tasks (each with `value` and `effort`/`estimatedHours`)
  and an integer `capacity` (W).
- **Output:** `{ selectedTasks, totalValue, effortUsed, capacityLeft }` — exact
  optimal subset recovered by DP backtracking.
- **Time:** O(n × W).  **Space:** O(n × W) (full table kept for backtrack).
- **Where used:** `POST /api/teams/:teamId/sprint-optimize`, socket
  `@ai plan sprint <hours>` → `handleSprintOptimize` (emits `sprint:plan`), and
  **Phase 3** of the recommendation engine. Capacity capped at 200h for a
  bounded DP table.
- **Real-world benefit:** Builds the highest-value sprint that actually fits
  capacity — no overcommitment, no wasted slack.

---

## 6. Branch & Bound — Optimal Task↔Member Assignment

- **Purpose:** Solve the Assignment Problem — map tasks to members at minimum
  total **skill-gap cost** (a member pays only where their skills fall short of
  the task's demand; over-qualification is free).
- **Input:** `members` (with `skills`) and `tasks` (with `skillWeights`); builds
  an m×n cost matrix.
- **Output:** `{ assignments[{taskId, memberId, cost}], totalCost, costMatrix,
  meta }` where `meta` includes `nodesExplored`, `nodesPruned`, `pruningRatio`.
- **Time:** O(n! / pruning) worst case; practical O(n²–n³) for n ≤ 20.
  **Space:** O(n²) cost matrix + O(n) stack depth.
- **Where used:** `POST /api/teams/:teamId/assign`, socket `tasks:assign`, and
  automatic post-AI-generation assignment (`runAutoAssignment`). Guards: warns
  if no members or undifferentiated skills. Overflow tasks (tasks > members)
  fall back to load-balanced greedy best-fit.
- **Real-world benefit:** Routes work to the best-fit person automatically,
  cutting context-switching and skill mismatch — with an admissible lower bound
  that prunes the search so it stays fast.

---

## 7. Merge Sort — Stable Multi-Key Task Sort

- **Purpose:** Deterministic, stable ordering of tasks for display by multiple
  keys at once.
- **Input:** Task array; comparator keys in order: status weight
  (todo→in_progress→done) → priority (desc) → effort (asc) → title (alpha).
- **Output:** New stably-sorted array (equal-key items keep prior order).
- **Time:** O(n log n) all cases (not adaptive).  **Space:** O(n) merge buffer.
- **Where used:** **Phase 4** of the recommendation engine for display order,
  and benchmarked against Bubble Sort in the **Analytics** tab
  (`…/tasks/analytics`).
- **Real-world benefit:** Predictable, stable board ordering; doubles as the
  O(n log n) baseline that visibly beats O(n²) Bubble Sort for students/mentors.

---

## 8. Boyer-Moore-Horspool — Sub-linear Task Search

- **Purpose:** Fast substring search over task titles using a bad-character
  shift table.
- **Input:** Task array + search `pattern`.
- **Output:** Filtered tasks whose title contains the pattern (server), or
  `{task, matchedFields}` for highlighting (client variant).
- **Time:** O(n/m) average (sub-linear), O(n×m) worst.  **Space:** O(σ) shift
  table (σ = 128 ASCII).
- **Where used:** socket `task:search` → `task:searchResult` (server,
  `taskOptimiser.js`) powering the recommendation-panel search; and
  `client/utils/boyerMoore.ts` for the instant chat/search box. The two copies
  intentionally differ by runtime and I/O contract.
- **Real-world benefit:** Instant search across large backlogs without scanning
  every character — responsive even as task counts grow.

---

## Notes on intentional "duplicates"

- **Two Greedy algorithms** exist by design: `GreedyPriorityScheduler`
  (urgency/impact/fan-in ordering) and `GreedySprintRanking` (value/effort ROI,
  feeds Knapsack). Different inputs, objectives, outputs.
- **Topo Sort / BFS** have one canonical implementation in `graphTraversal.js`;
  `taskOptimiser.js` delegates to it.
- **Merge Sort / Boyer-Moore** have separate server and client copies because
  they run in different runtimes (Node ESM vs React Native) with different
  comparators / return shapes.
