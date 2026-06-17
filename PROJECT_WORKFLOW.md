# NexusFlow — Project Workflow

How NexusFlow operates as a real-world, AI-assisted project-management
platform: roles, the end-to-end workflow, the automation pipeline, the
real-time socket layer, the database flow, and AI orchestration.

---

## 1. What NexusFlow is

NexusFlow is a collaborative workspace where a team turns a plain-language
**project brief** into a **planned, prioritised, assigned and scheduled
backlog** automatically. Instead of a human manually triaging every ticket,
classic **Design & Analysis of Algorithms (DAA)** techniques do the heavy
lifting — prioritisation, dependency ordering, sprint packing, and optimal
assignment — while an AI layer converts natural language into tasks.

**Stack**
- **Client:** React Native + Expo Router (web + mobile), TypeScript.
- **Server:** Node.js (ESM) + Express, Socket.IO, MongoDB via Mongoose.
- **AI:** OpenAI `gpt-4o-mini` streaming (optional) with a deterministic mock
  fallback when no API key is present.

---

## 2. Team roles

Selected during the create-team wizard (`CreateTeamModal.tsx`). Roles are
organisational labels; permissions are intentionally light for the demo.

| Role | Responsibility |
|------|----------------|
| **Team Leader** | Owns delivery, sets priorities, unblocks the team. |
| **Project Manager** | Plans sprints, tracks scope, coordinates stakeholders. |
| **Team Member** | Picks up assigned work and ships tasks to done. |

Every member carries a **skill profile** (frontend, backend, devops, design,
ml, testing — each 0–10). These profiles are the *supply* side of the Branch &
Bound assignment cost matrix.

---

## 3. End-to-end workflow

```
Brief → AI task generation → Greedy prioritisation → Dependency graph
      → Sprint packing (Knapsack) → Optimal assignment (Branch & Bound)
      → Live board updates → Analytics
```

1. **Capture** — describe the project (create-team wizard or `@ai` in chat).
2. **Generate** — AI breaks the brief into task titles.
3. **Score** — each task gets a Greedy `priorityScore` (0–100) on save.
4. **Relate** — users wire dependencies; the DAG is validated for cycles.
5. **Pack** — Knapsack selects the highest-value subset for the sprint budget.
6. **Assign** — Branch & Bound maps tasks to the best-fit members.
7. **Track** — sockets stream every change to all clients in the team room.
8. **Reflect** — analytics benchmark sort performance over the live task set.

---

## 4. Automation pipeline

The recommendation engine (`server/algorithms/taskOptimiser.js
→ computeRecommendation`) chains five algorithms into one explainable result:

```
Phase 1  BFS              → ready set (deps complete)
Phase 2  Greedy ranking   → value/effort ROI order
Phase 3  0/1 Knapsack DP  → optimal subset within capacity
Phase 4  Merge Sort       → stable multi-key display order
Phase 5  Topological Sort → global execution-order labels
```

Separately, task lifecycle automation runs in the socket layer:
- **On task create with deps** → recompute `topoOrder` for the whole team.
- **On AI task generation** → auto-run Branch & Bound assignment.
- **On `@ai plan sprint <h>`** → run Knapsack and emit `sprint:plan`.

Safety bounds: sprint capacity is capped at `MAX_SPRINT_HOURS = 200` so the
Knapsack DP table stays bounded; Bubble Sort in analytics is skipped above
`MAX_COMPARISON_SIZE = 500`.

---

## 5. Real-time socket layer

Socket.IO rooms are keyed `team:<teamId>`. Clients `room:join` on entering a
workspace.

**Handlers**
- `server/socket/taskHandlers.js` — `task:create`, `task:update`,
  dependency-driven `recomputeAndBroadcast` → `task:execution-order`.
- `server/socket/aiOrchestrator.js` — `chat:message` (AI), `tasks:assign`,
  `recommend:request` → `recommend:result`, `task:search` →
  `task:searchResult`.

**Representative events**

| Event (server→client) | Meaning |
|-----------------------|---------|
| `chat:message` / `chat:stream` | Human + streamed AI chat. |
| `task:created` / `task:assigned` | New task / B&B assignment result. |
| `task:execution-order` | Recomputed topo order + edges. |
| `sprint:plan` | Knapsack sprint result. |
| `recommend:result` | Full recommendation payload. |
| `task:searchResult` | Boyer-Moore search matches. |
| `assign:warning` / `assign:error` | B&B guardrails. |

Because everything broadcasts to the room, every connected teammate sees task
creation, assignment, and sprint plans update live.

---

## 6. Database flow (MongoDB / Mongoose)

**Models:** `server/models/Team.js`, `server/models/Task.js`.

`Team` holds an embedded `members[]` array (each with `userId`, `name`,
`skills`). `Task` carries fields purpose-built for each algorithm:

| Field group | Fields | Used by |
|-------------|--------|---------|
| Greedy inputs | `urgency`, `impact`, `dependencyCount` | Greedy Scheduler |
| Greedy output | `priorityScore` (0–100) | sort / display |
| DAG | `dependencies[]`, `topoOrder` | DFS / BFS / Topo |
| Knapsack | `estimatedHours`, `businessValue`, `storyPoints` | Knapsack |
| Branch & Bound | `skillWeights`, `assignedTo`, `assignmentCost` | B&B |
| Merge Sort keys | `status`, `priority`, `deadline`, `progress` | Merge Sort |

**Hooks:** `Task.pre('save')` and `pre('findOneAndUpdate')` recompute
`priorityScore` whenever urgency/impact/dependencyCount change — so the Greedy
score is always consistent with the stored inputs (single source of truth).

**Indexes:** `{teamId, priorityScore:-1}` (greedy sort) and
`{teamId, topoOrder:1}` (execution order) keep reads cheap.

Derived values (`value`/`effort` for the optimiser) are computed **at request
time** from existing fields rather than duplicated — migration-safe and keeps
old documents compatible.

---

## 7. AI orchestration

`server/socket/aiOrchestrator.js`:

1. A chat message starting with `@ai` is treated as a planning prompt.
2. `@ai plan sprint <hours>` short-circuits to the Knapsack optimiser.
3. Otherwise the prompt is streamed to OpenAI (`gpt-4o-mini`, `stream:true`)
   which returns one task title per line; without a key, a deterministic mock
   streamer produces a sensible 3-step plan so demos work offline.
4. Each title is keyword-scored (`estimatePriority` → urgency/impact),
   persisted as a `Task` (triggering the Greedy hook), and broadcast.
5. Freshly created tasks are handed to **Branch & Bound** for auto-assignment,
   guarded by checks that members exist and have differentiated skills.

**AI + DAA division of labour:** the LLM handles *language → tasks*; the DAA
algorithms handle *tasks → an optimal, explainable plan*. Every algorithmic
result ships with its complexity and input/output stats so the reasoning is
transparent (and viva-ready).

---

## 8. Request/REST surface (selected)

From `server/routes/teams.js`:

- `GET/POST /api/teams`, `GET/DELETE /api/teams/:id`
- `POST /api/teams/:id/members`, `PATCH …/members/:userId/skills`
- `GET /api/teams/:id/tasks`, `…/tasks/scheduled`, `…/tasks/analytics`,
  `…/tasks/execution-order`
- `GET /api/teams/:id/dependency-graph`
- `POST/DELETE …/tasks/:taskId/dependencies[/:depId]`
- `POST /api/teams/:id/sprint-optimize`
- `POST /api/teams/:id/assign`
- `PATCH …/tasks/:taskId`, `PATCH /api/tasks/:taskId/priority`

All protected by `requireAuth`.
