# NexusFlow — DAA Integration

Every algorithm in NexusFlow solves a concrete product problem and is reachable
through a normal user action. None of them live on an academic-only screen; the
only place they're *described* is the optional **DAA Insights** demo screen.

## At a glance

| Algorithm | Product problem solved | Reached via | Time | Space |
|---|---|---|---|---|
| Greedy Scheduler | Task prioritization | Tasks tab — priority scores | O(n log n) | O(n) |
| 0/1 Knapsack | Sprint planning | Sprint tab — optimizer | O(n·W) | O(n·W) |
| Depth-First Search | Cycle detection | Adding a dependency / Graph | O(V+E) | O(V) |
| Breadth-First Search | Dependency levels | Graph + AI readiness | O(V+E) | O(V) |
| Topological Sort | Execution order | Graph — execution order | O(V+E) | O(V) |
| Branch & Bound | Task assignment | Members tab — Run Assignment | O(n!) pruned | O(n²) |
| Merge Sort | Task ordering | Tasks sort modes; analytics | O(n log n) | O(n) |
| Boyer-Moore | Task search | Tasks/AI search boxes | O(n/m) avg | O(σ) |

## How each one contributes

### Greedy Scheduler — *what to do first*
Combines urgency, impact and dependency pressure into a single 0–100 score, then
orders the backlog descending. Implemented client-side in
`hooks/useTeamTasks.ts` (comparator) and server-side in
`server/algorithms/greedyScheduler.js`. The user just sees a ranked list.

### 0/1 Knapsack — *what fits in this sprint*
Given a capacity (hours) and tasks with effort (weight) and business value, it
selects the maximum-value subset that fits. Run from the **Sprint** tab; the API
is `POST /api/teams/:id/sprint-optimize`
(`server/algorithms/taskOptimiser.js`). The user sees the chosen tasks and a
utilisation gauge.

### DFS — *don't let work deadlock*
Before a dependency is accepted, DFS checks whether it would create a cycle. If
so, the edge is rejected and the user is told why. Lives in
`server/algorithms/graphTraversal.js`.

### BFS — *what can run in parallel*
Computes each task's distance from the dependency roots, grouping work into
"waves." Feeds the dependency graph layout and AI readiness logic.

### Topological Sort — *a safe execution order*
Produces a linear ordering in which no task precedes its prerequisites. Surfaced
as the Graph's "execution order" and used by the AI recommender to sequence a
sprint. Requires an acyclic graph (guaranteed by DFS).

### Branch & Bound — *the right person for the task*
Builds a member × task cost matrix from skills and searches for the
minimum-cost assignment, pruning branches that can't beat the current best.
Reached from the **Members** tab; returns the assignment plus explored/pruned
node counts. See `server/algorithms/branchAndBound.js`.

### Merge Sort — *stable, predictable ordering*
A stable Θ(n log n) sort with pluggable comparators (priority, deadline,
progress). Used for the Tasks tab sort modes and as the baseline in the
analytics comparison (`server/utils/sortAlgorithms.js`,
`hooks/useTeamTasks.ts`).

### Boyer-Moore — *instant task search*
Sublinear-average substring search over task titles, with the matched span
highlighted in results. Used by the Tasks tab and the AI panel search.
Client implementation in `utils/boyerMoore.ts`.

## Design rule

> A user should be able to benefit from every algorithm **without knowing it
> exists.** Algorithm names appear only in the DAA Insights demo screen and in
> small "powered by" complexity badges — never as the primary UI.

See also: [ProductVision.md](ProductVision.md) · [UserFlow.md](UserFlow.md) ·
[Architecture.md](Architecture.md)
