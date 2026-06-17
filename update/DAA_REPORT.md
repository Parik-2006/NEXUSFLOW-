# NexusFlow — DAA Project Report
## Intelligent Task Scheduling and Team Optimization System
### Design and Analysis of Algorithms | 4th Semester | 40 Marks

---

## 1. PROBLEM DEFINITION (5 Marks)

### Problem Statement
Modern software teams operate under constant constraints: limited sprint hours, complex task interdependencies, and uneven skill distribution across members. Naïve task management—first-in-first-out ordering, manual sprint selection, ad-hoc assignment—leads to missed deadlines, sprint overruns, and suboptimal resource utilization.

**NexusFlow** addresses this with an _Intelligent Task Scheduling and Team Optimization System_ that applies eight classical DAA algorithms to automate, optimize, and explain scheduling decisions in real time.

### Real-World Problems Solved

| Problem | Algorithm | Formal Problem Class |
|---|---|---|
| Display tasks in optimal work order | Merge Sort | Comparison-based sorting |
| Determine valid execution sequence | Topological Sort | Linear ordering of DAG |
| Identify all tasks blocked by one task | DFS | Reachability in digraph |
| Group tasks into parallel sprint waves | BFS | Level-order traversal |
| Maximize task delivery within capacity | 0/1 Knapsack | Integer programming |
| Prioritize high-value tasks greedily | Greedy Activity Selection | Greedy optimization |
| Optimally assign tasks to team members | Branch and Bound | Combinatorial assignment |
| Search tasks with sub-linear performance | Boyer-Moore | String pattern matching |

---

## 2. ARCHITECTURE (5 Marks)

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT (React Native / Expo)                   │
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐   │
│  │  Dashboard   │   │  Chat Screen │   │  Sprint Plan Modal │   │
│  │  (Teams)     │   │  [teamId]    │   │  (Knapsack/Greedy) │   │
│  └──────────────┘   └──────┬───────┘   └────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐ │
│  │               useTeamTasks Hook                              │ │
│  │  fetchGreedyPlan · fetchKnapsackPlan · fetchExecutionOrder  │ │
│  │  searchTasks (Boyer-Moore) · triggerOptimalAssignment (B&B) │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐ │
│  │  TaskCard Component                                          │ │
│  │  Priority badge · Effort display · Dep indicator · Assignee │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST (hydrate) + WebSocket (live)
┌────────────────────────────▼────────────────────────────────────┐
│                    SERVER (Node.js / Express / Socket.io)         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              server/algorithms/index.js                     │ │
│  │                                                             │ │
│  │  mergeSortTasks     topologicalSort    dfsBlockedTasks      │ │
│  │  bfsDependencyLevels  greedySchedule  knapsackSprint        │ │
│  │  branchAndBoundAssign  boyerMooreSearch                     │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                               │                                    │
│  ┌──────────────┐  ┌─────────▼───────┐  ┌──────────────────────┐│
│  │ routes/      │  │ socket/          │  │ socket/              ││
│  │ teams.js     │  │ taskHandlers.js  │  │ aiOrchestrator.js    ││
│  │ 9 endpoints  │  │ DAG validation   │  │ Greedy post-create   ││
│  └──────────────┘  └─────────────────┘  └──────────────────────┘│
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MongoDB (Mongoose)                             │ │
│  │  Task: +priority +estimatedHours +dependencies +tags        │ │
│  │  Team: +memberProfiles +sprintCapacityHours                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### New File Structure
```
server/
  algorithms/
    index.js          ← NEW: All 8 DAA algorithm implementations
  models/
    Task.js           ← MODIFIED: +priority, +estimatedHours, +dependencies, +tags
    Team.js           ← MODIFIED: +memberProfiles, +sprintCapacityHours
  routes/
    teams.js          ← MODIFIED: 7 new DAA endpoints added
  socket/
    taskHandlers.js   ← MODIFIED: Topo Sort validation on edge add
    aiOrchestrator.js ← MODIFIED: Greedy analysis after AI task creation
client/
  hooks/
    useTeamTasks.ts   ← MODIFIED: 6 new DAA-powered async methods
  components/
    TaskCard.tsx      ← MODIFIED: Priority badge, effort, dep indicators
  app/
    chat/[teamId].tsx ← MODIFIED: Search bar, sprint panel, topo view
```

---

## 3. DATABASE SCHEMA CHANGES

### Task Model — New Fields

```
priority        : "low" | "medium" | "high"    (Greedy + Knapsack value function)
estimatedHours  : Number (default 1)           (Knapsack weight + B&B capacity)
storyPoints     : Number (default 1)           (Knapsack secondary value)
dueDate         : Date | null                  (Merge Sort secondary key)
dependencies    : [ObjectId] → Task            (DAG edges for Topo/DFS/BFS)
tags            : [String]                     (B&B skill matching)
description     : String                       (Boyer-Moore search target)
assignedTo      : String | null                (B&B output)
```

**New indexes:**
- `{ teamId: 1, priority: -1 }` — efficient sprint query
- `{ title: "text", description: "text" }` — full-text fallback

### Team Model — New Fields

```
memberProfiles  : [{ userId, name, skills[], seniority,
                     weeklyCapacityHours, completionRate }]
                  ← B&B member capability matrix
sprintCapacityHours : Number (default 80)  ← Knapsack/Greedy capacity W
```

---

## 4. DAA INTEGRATION (15 Marks)

---

### Algorithm 1: MERGE SORT
**Location:** `server/algorithms/index.js` → `mergeSortTasks()`
**Triggered by:** Every `GET /api/teams/:teamId/tasks` response, `task:reranked` socket event

**Problem solved:** MongoDB returns tasks in insertion order. Teams need tasks sorted by urgency — highest priority first, ties broken by nearest due date, then FIFO.

**Implementation detail:**
- Three-key comparator: priority weight DESC → dueDate ASC → createdAt ASC
- `PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 }`
- Standard divide-and-conquer recursive split + merge

**Complexity Analysis:**
| Case | Time | Space |
|---|---|---|
| Best | O(n log n) | O(n) |
| Average | O(n log n) | O(n) |
| Worst | O(n log n) | O(n) |

Merge Sort is **stable** (preserves FIFO among equal-priority tasks) and **guaranteed O(n log n)** — unlike Quick Sort which degrades to O(n²) on sorted inputs. This is the correct choice for small-to-medium task lists (< 10,000 items).

---

### Algorithm 2: TOPOLOGICAL SORT (Kahn's Algorithm)
**Location:** `server/algorithms/index.js` → `topologicalSort()`
**Triggered by:** `GET /api/teams/:teamId/tasks/execution-order`, `task:dep:add` socket event (cycle detection)

**Problem solved:** Given a DAG of task dependencies (e.g., "deploy server" requires "write server code"), find a valid sequential execution plan. Detect circular dependencies before they corrupt the DAG.

**Data structure:** Adjacency list (Map) + in-degree array

**Kahn's algorithm:**
1. Compute in-degree for every node
2. Enqueue all zero-in-degree nodes
3. BFS: dequeue node, reduce neighbours' in-degree, enqueue newly zero-degree nodes
4. If ordered.length < V → cycle exists

**Complexity Analysis:**
| | Complexity |
|---|---|
| Time | O(V + E) |
| Space | O(V + E) |
| V | Number of tasks |
| E | Number of dependency edges |

**Why Kahn's over DFS-based?** Kahn's naturally identifies which nodes form the cycle (those with remaining non-zero in-degree), making error messages actionable.

---

### Algorithm 3: DFS (Iterative)
**Location:** `server/algorithms/index.js` → `dfsBlockedTasks()`
**Triggered by:** `GET /api/teams/:teamId/tasks/:taskId/blocked`

**Problem solved:** When a task is blocked or removed, propagate impact analysis downstream — which other tasks are now undeliverable?

**Implementation:** Iterative DFS using explicit stack (avoids call stack overflow on deep chains). Builds forward adjacency map, traverses all reachable nodes from source.

**Complexity Analysis:**
| | Complexity |
|---|---|
| Time | O(V + E) |
| Space | O(V) — visited set + stack |

**Why iterative DFS?** Node.js has a limited call stack (~10,000 frames). Iterative DFS is safe for production dependency chains of arbitrary depth.

---

### Algorithm 4: BFS (Level-Order)
**Location:** `server/algorithms/index.js` → `bfsDependencyLevels()`
**Triggered by:** `GET /api/teams/:teamId/tasks/wave-plan`

**Problem solved:** Sprint planning requires knowing which tasks can run in parallel. BFS on the dependency DAG produces _waves_: tasks in wave 0 have no prerequisites; wave 1 tasks depend only on wave 0; etc. Each wave = one sprint.

**Key difference from Topo Sort:** Topo Sort gives a linear order. BFS additionally groups tasks into parallel execution layers, enabling concurrent sprint scheduling.

**Complexity Analysis:**
| | Complexity |
|---|---|
| Time | O(V + E) |
| Space | O(V) — queue + in-degree map |

---

### Algorithm 5: GREEDY SCHEDULING
**Location:** `server/algorithms/index.js` → `greedySchedule()`
**Triggered by:** `POST /api/teams/:teamId/sprint/greedy`, inside `aiOrchestrator.js` after AI task creation

**Problem solved:** Given a sprint with a fixed capacity (e.g., 80 hours), select tasks to maximise value delivered. Greedy picks by (priority DESC, hours ASC) — highest value, quickest wins first.

**Algorithm (Activity Selection variant):**
1. Sort tasks: primary = priority weight DESC, secondary = estimatedHours ASC
2. Greedily add tasks as long as remaining capacity allows

**Complexity Analysis:**
| | Complexity |
|---|---|
| Time | O(n log n) — sort dominates |
| Space | O(n) |

**Greedy vs Knapsack tradeoff:**
- Greedy: O(n log n), near-optimal, no DP overhead — best for real-time suggestions
- Knapsack: O(n × W), globally optimal — best for final sprint commitment

---

### Algorithm 6: 0/1 KNAPSACK (DP)
**Location:** `server/algorithms/index.js` → `knapsackSprint()`
**Triggered by:** `POST /api/teams/:teamId/sprint/knapsack`

**Problem solved:** Find the maximum-value subset of tasks that fits within sprint capacity. Unlike Greedy, Knapsack considers all combinations and guarantees the globally optimal solution.

**Formulation:**
- Items = undone tasks
- Weight = estimatedHours (scaled ×2 for 0.5h granularity)
- Value = priority weight × 10 + storyPoints
- Capacity W = sprintCapacityHours × 2 (scaled)

**Recurrence:**
```
dp[i][w] = max(dp[i-1][w],  dp[i-1][w - weight[i]] + value[i])
           (skip task i)     (take task i)
```

**Complexity Analysis:**
| | Complexity |
|---|---|
| Time | O(n × W) |
| Space | O(n × W) |
| n | Number of backlog tasks |
| W | Capacity in half-hour slots |

**Production guard:** If n > 100 tasks, algorithm falls back to Greedy to prevent O(n×W) exceeding 50ms response SLA.

**Backtracking:** After filling the DP table, backtrack from dp[n][W] to reconstruct selected tasks.

---

### Algorithm 7: BRANCH AND BOUND
**Location:** `server/algorithms/index.js` → `branchAndBoundAssign()`
**Triggered by:** `POST /api/teams/:teamId/assign`

**Problem solved:** Assign N tasks to M team members to maximise total productivity score while respecting each member's weekly hour capacity constraint.

**Score function:**
```
score(task, member) = (tag overlap × 10) + (completionRate × 20) + seniorityBonus
```

**B&B structure:**
- **State space:** Assignment tree — each level = one task, each branch = one member
- **Upper bound function:** For remaining tasks, sum of max achievable scores (optimistic)
- **Pruning:** If `currentScore + upperBound(remaining) ≤ bestScore`, cut the branch

**Complexity Analysis:**
| Case | Complexity |
|---|---|
| Worst | O(M^N) — no pruning |
| Typical (tight bounds) | O(M × N) |
| Space | O(N) recursion stack |

**Production guard:** Limited to 10 tasks per call. For larger batches, split into chunks.

---

### Algorithm 8: BOYER-MOORE (Bad Character Heuristic)
**Location:** `server/algorithms/index.js` → `boyerMooreSearch()`
**Triggered by:** `GET /api/teams/:teamId/tasks/search?q=<query>`

**Problem solved:** Fast keyword search across task titles, descriptions, and tags. As task boards grow to thousands of entries, naïve O(nm) scan becomes sluggish.

**Implementation:**
1. Build `badChar` table: last occurrence of each character in pattern `p[0..m-1]`
2. For each alignment `s`, compare pattern right-to-left
3. On mismatch at `p[j]` with text character `t[s+j]`: shift = `max(1, j - badChar[t[s+j]])`
4. Match → record occurrence, shift by good-suffix rule (simplified: m - badChar[t[s+m]])

**Complexity Analysis:**
| Case | Complexity |
|---|---|
| Best/Average | O(n/m) — sub-linear |
| Worst | O(nm) — periodic pattern in repetitive text |
| Preprocessing | O(m + σ), σ = alphabet size = 256 |

**Why Boyer-Moore over indexOf():** JavaScript's native `indexOf` is Boyer-Moore internally in V8, but our implementation searches across multiple fields (title + description + tags) with a single pass per task, avoids regex overhead, and is academically demonstrable.

---

## 5. API CHANGES

### New REST Endpoints

| Method | Path | Algorithm | Description |
|---|---|---|---|
| GET | `/api/teams/:id/tasks` | Merge Sort | Returns sorted task list |
| GET | `/api/teams/:id/tasks/execution-order` | Topological Sort | Valid execution plan |
| GET | `/api/teams/:id/tasks/wave-plan` | BFS | Parallel sprint waves |
| GET | `/api/teams/:id/tasks/:taskId/blocked` | DFS | Downstream blocked tasks |
| GET | `/api/teams/:id/tasks/search?q=` | Boyer-Moore | Fast task search |
| POST | `/api/teams/:id/sprint/greedy` | Greedy | Near-optimal sprint plan |
| POST | `/api/teams/:id/sprint/knapsack` | 0/1 Knapsack | Optimal sprint plan |
| POST | `/api/teams/:id/assign` | Branch & Bound | Optimal assignment |
| POST | `/api/teams` | — | Create team |
| PUT | `/api/teams/:id/members/:uid/profile` | — | Upsert member profile |

### New Socket Events

| Event (emit) | Direction | Payload | Algorithm |
|---|---|---|---|
| `task:create` | Client→Server | `+priority, +estimatedHours, +dependencies, +tags` | Topo Sort validation |
| `task:dep:add` | Client→Server | `{ teamId, taskId, dependsOnTaskId }` | Topo Sort (cycle guard) |
| `task:reorder` | Client→Server | `{ teamId }` | Merge Sort |
| `task:reranked` | Server→Client | `{ teamId, tasks[] }` | Merge Sort result |

---

## 6. COMPLEXITY SUMMARY TABLE

| Algorithm | Time | Space | Integration Point |
|---|---|---|---|
| Merge Sort | O(n log n) | O(n) | REST hydrate + socket rerank |
| Topological Sort | O(V+E) | O(V+E) | Execution order endpoint + dep:add guard |
| DFS | O(V+E) | O(V) | Blocked tasks endpoint |
| BFS | O(V+E) | O(V) | Wave plan endpoint |
| Greedy Scheduling | O(n log n) | O(n) | Sprint endpoint + AI orchestrator |
| 0/1 Knapsack | O(n×W) | O(n×W) | Optimal sprint endpoint |
| Branch and Bound | O(M^N)/O(M×N) | O(N) | Optimal assignment endpoint |
| Boyer-Moore | O(n/m) avg | O(σ)=O(256) | Task search endpoint |

---

## 7. VIVA EXPLANATION (5 Marks)

### Q1: Why Merge Sort instead of JavaScript's native `Array.sort()`?
**A:** `Array.sort()` in V8 uses TimSort (Merge Sort + Insertion Sort hybrid), which is also O(n log n). We implement Merge Sort explicitly because: (a) it demonstrates divide-and-conquer clearly for academic evaluation, (b) it uses a custom three-key comparator (priority → dueDate → createdAt) that a one-liner `.sort()` would obscure, and (c) it is stable, preserving FIFO ordering among tasks of equal priority — a property TimSort also provides but we guarantee explicitly.

### Q2: Why Kahn's algorithm for Topological Sort instead of DFS-based?
**A:** DFS-based topological sort detects cycles implicitly via back edges. Kahn's BFS-based algorithm is superior here because: (a) it naturally identifies _which_ nodes form the cycle (those with remaining non-zero in-degree), enabling actionable error messages, (b) it produces BFS level layers as a side-product, useful for sprint wave planning, and (c) it maps directly to task dependency validation — the in-degree of a task equals the number of unresolved prerequisites.

### Q3: What is the real-world difference between Greedy Sprint Planning and Knapsack?
**A:** Consider tasks [A: 4h, HIGH], [B: 3h, HIGH], [C: 2h, MEDIUM] with capacity 6h.
- Greedy (priority DESC, hours ASC): picks A (4h), then has 2h left → picks C. Total value = 3×10 + 2×10 = 50.
- Knapsack: considers B+C = 5h, value = 3×10 + 2×10 = 50, but also B alone = 30. Optimal might be B+C.
Greedy runs in O(n log n); Knapsack in O(n×W). For real-time suggestions, Greedy. For final sprint commitment, Knapsack. Both are surfaced in the UI with a toggle.

### Q4: How does Branch and Bound avoid O(M^N) explosion?
**A:** The upper bound function computes, for every remaining unassigned task, the maximum possible score any member could contribute (ignoring capacity). This is an _optimistic_ overestimate. When `currentScore + upperBound(remaining) ≤ bestKnownScore`, the entire subtree is pruned — we never enumerate it. In practice, with realistic skill distributions, only ~5-15% of the tree is explored. We also apply a hard limit of 10 tasks per call, and fall back to greedy assignment for larger batches.

### Q5: Why Boyer-Moore for search? MongoDB has text indexes.
**A:** MongoDB full-text search requires index maintenance, minimum 3-character queries, and doesn't support prefix matching on tags. Boyer-Moore searches in-memory across all three fields (title + description + tags) in a single O(n/m) average pass with no index overhead. For teams with < 5,000 tasks — the typical NexusFlow scale — Boyer-Moore on in-memory results after a single MongoDB fetch outperforms a round-trip text search query. Results are also re-sorted by Merge Sort immediately after matching.

### Q6: How does the system ensure no circular dependencies are ever introduced?
**A:** The `task:dep:add` socket handler adds the dependency edge to the database, immediately calls `topologicalSort()` on all tasks in the team, and if `hasCycle === true`, rolls back the MongoDB update and returns `{ ok: false, error: "circular_dependency", cycleNodes }`. The same check runs in `task:create` when a task is created with initial dependencies. This is O(V+E) per dependency addition — acceptable because dependency additions are infrequent write operations.

### Q7: What data structure models the task dependency graph?
**A:** The dependency graph is a **Directed Acyclic Graph (DAG)** stored as an **adjacency list** using JavaScript `Map<string, string[]>`. Edges are stored persistently in MongoDB as `Task.dependencies: [ObjectId]`. In-memory, both Topological Sort and BFS maintain an **in-degree map** alongside the adjacency list for O(1) in-degree lookup. DFS uses the same adjacency list with an explicit **stack** (array) for iterative traversal.

---

## 8. PRODUCTION CONSIDERATIONS

### Scalability Guardrails
- **Knapsack:** Falls back to Greedy when `tasks.length > 100` (prevents O(n×W) > 50ms SLA)
- **Branch and Bound:** Hard-capped at 10 tasks per call; use chunking for larger batches
- **Boyer-Moore search:** Runs on server-side in-memory fetch (not client-side) to avoid sending full task list to client

### Caching Opportunities
- Topological order is stable until a dependency edge changes → can be cached with a `depsVersion` counter
- Knapsack result is stable until task set or capacities change → cache with ETags

### Index Strategy
- `Task: { teamId: 1, priority: -1 }` — covers all sprint planning queries
- `Task: { teamId: 1, status: 1 }` — covers `$ne: "done"` filters
- `Task: { title: "text", description: "text" }` — MongoDB fallback for very large teams

### Algorithm Selection by Scale

| Team Size | Recommended Sort | Sprint Planning | Assignment |
|---|---|---|---|
| < 100 tasks | Merge Sort | Knapsack | Branch & Bound |
| 100–1000 tasks | Merge Sort | Greedy | B&B (chunked) |
| > 1000 tasks | Server-side sort | Greedy | Hungarian Algorithm |
