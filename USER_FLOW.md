# NexusFlow — User Flow

End-to-end journey of a user through NexusFlow, from first sign-in to
analytics. Each stage lists **what the user does**, **what the app does**, and
**which algorithm (if any) is triggered**.

> Screenshot placeholders are marked `📷 [screenshot: …]`. Drop PNGs into
> `docs/img/` and replace the placeholder with `![alt](img/<file>.png)`.

---

## 0. Entry point

`/` → redirects to `/(auth)/login` (see `client/app/index.tsx`). Signed-in
users are forwarded to the dashboard by `AuthGate`.

📷 [screenshot: splash → login redirect]

---

## 1. Login

**Screen:** `client/app/(auth)/login.tsx`

- User enters any email + password (live demo — a workspace is created
  instantly; no real password check).
- `AuthContext.signIn()` stores the session token and user profile.
- On success the router lands on `/(tabs)/dashboard`.

**Algorithm:** none.

📷 [screenshot: login split-pane — brand panel + auth card]

---

## 2. Profile setup

**Screen:** `client/app/(tabs)/profile.tsx`

- Instagram-style identity card: cover band, overlapping avatar, role.
- User taps **Edit** → `ModalSheet` to set **role**, **bio**, **experience**,
  and **skills** (Frontend / Backend / DevOps / Design / AI-ML / Testing / …).
- Saved locally per-email via `utils/storage.ts` (`nf_profile_<email>`).
- Skills entered here are the conceptual basis for the **Branch & Bound**
  assignment cost matrix (member skill supply).

**Algorithm:** none directly, but skill data feeds Branch & Bound later.

📷 [screenshot: profile identity card + edit sheet]

---

## 3. Create a team (workspace)

**Screen:** `client/components/CreateTeamModal.tsx` (4-step wizard)

1. **Project** — team name, project title, project description.
2. **Your role** — Team Leader / Project Manager / Team Member.
3. **Members** — add teammates + their primary skill.
4. **AI plan** — preview of the starter backlog derived from the description.

On submit → `POST /api/teams` (`server/routes/teams.js`). The creator is added
as the first member; supplied starter tasks are created one-by-one so the
`Task` pre-save hook computes each `priorityScore`.

**Algorithm:** **Greedy Priority Scheduler** fires in the `Task` pre-save hook
(`computePriorityScore`) for every created task.

📷 [screenshot: 4-step create-team wizard]

---

## 4. Add members & skills

**Screens:** create-team step 3, and the workspace **Members** tab
(`components/workspace/AssignmentBoard.tsx`).

- `POST /api/teams/:teamId/members` adds a member.
- `PATCH /api/teams/:teamId/members/:userId/skills` sets a per-skill 0–10
  profile.
- Skill profiles populate the **supply** side of the Branch & Bound cost
  matrix. If every member is left at the default skill value, the assignment
  engine emits a visible warning instead of assigning blindly.

**Algorithm:** prepares input for **Branch & Bound**.

📷 [screenshot: members tab with skill chips]

---

## 5. AI task generation

**Screen:** workspace **Chat** tab (`components/workspace/ChatPanel.tsx`)
→ socket `chat:message` handled in `server/socket/aiOrchestrator.js`.

- User types `@ai <project brief>` in chat.
- The orchestrator streams task titles (OpenAI `gpt-4o-mini` if
  `OPENAI_API_KEY` is set; otherwise a deterministic mock streamer).
- Each generated title is keyword-scored for urgency/impact
  (`estimatePriority`), persisted as a `Task`, and broadcast via
  `task:created`.
- Newly created tasks immediately trigger **auto-assignment** (Branch & Bound).

**Algorithms:** **Greedy Scheduler** (priority score per task) → **Branch &
Bound** (auto-assignment of the new tasks).

📷 [screenshot: AI chat streaming tasks into the backlog]

---

## 6. Dependency management

**Screen:** workspace **Graph** tab (`components/workspace/GraphPanel.tsx`)
and Tasks tab dependency controls.

- Add a dependency: `POST /api/teams/:teamId/tasks/:taskId/dependencies`.
- Remove: `DELETE /…/dependencies/:depId`.
- The dependency graph endpoint `GET /api/teams/:teamId/dependency-graph`
  returns DFS order, BFS levels, and a topological order, plus a cycle flag.
- On any dependency change, sockets recompute `topoOrder` for the whole team
  and broadcast `task:execution-order`.

**Algorithms:** **DFS**, **BFS**, **Topological Sort (Kahn's)**.

📷 [screenshot: dependency graph with execution-order tiers]

---

## 7. Sprint planning

**Screen:** workspace **Sprint** tab (`components/workspace/SprintPanel.tsx`)
or `@ai plan sprint <hours>` in chat.

- REST: `POST /api/teams/:teamId/sprint-optimize` with a capacity.
- Socket: `@ai plan sprint 40` → `handleSprintOptimize`.
- A **0/1 Knapsack** DP selects the subset of todo tasks that maximises total
  business value within the story-point / hours budget. Result is emitted as
  `sprint:plan` (selected tasks, total value, utilisation %).

**Algorithm:** **0/1 Knapsack (bottom-up DP)**.

📷 [screenshot: sprint plan with utilisation gauge]

---

## 8. Task assignment

**Screen:** workspace **Members** tab → **Assign** (or automatic after AI
generation). Socket `tasks:assign` / REST `POST /api/teams/:teamId/assign`.

- **Branch & Bound** builds a member×task skill-gap cost matrix and finds the
  minimum-cost bijective assignment (with greedy best-fit overflow when there
  are more tasks than members).
- Each task is updated with `assignedTo` + `assignmentCost`; clients receive
  `task:assigned` with pruning metadata (nodes explored/pruned).

**Algorithm:** **Branch & Bound (Assignment Problem)**.

📷 [screenshot: assignment board with cost + pruning stats]

---

## 9. Recommendations (combined engine)

**Screen:** workspace **AI Rec** tab (`components/RecommendationPanel.tsx`)
→ socket `recommend:request`.

- Runs the full pipeline: **BFS** (ready set) → **Greedy** (value/effort
  ranking) → **Knapsack** (capacity selection) → **Merge Sort** (stable
  display order) → **Topological Sort** (execution labels).
- Includes a **Boyer-Moore-Horspool** search box (`task:search`) for instant
  title filtering.

**Algorithms:** BFS, Greedy, Knapsack, Merge Sort, Topological Sort,
Boyer-Moore.

📷 [screenshot: recommendation panel with algorithm badges]

---

## 10. Analytics

**Screen:** workspace **Analytics** tab
(`components/workspace/AnalyticsPanel.tsx`)
→ `GET /api/teams/:teamId/tasks/analytics`.

- Live comparison of **Bubble Sort O(n²)** vs **Merge Sort O(n log n)** over
  the team's current task set (operation counts + timing).
- Bubble Sort is skipped above `MAX_COMPARISON_SIZE` (500) to keep the
  comparison safe.

**Algorithms:** **Merge Sort** vs **Bubble Sort** (educational benchmark).

📷 [screenshot: analytics comparison card]

---

## Flow summary

```
Login → Profile setup → Create team → Add members & skills
   → AI task generation (Greedy + B&B)
   → Dependency management (DFS / BFS / Topo)
   → Sprint planning (Knapsack)
   → Task assignment (Branch & Bound)
   → Recommendations (BFS→Greedy→Knapsack→MergeSort→Topo + Boyer-Moore)
   → Analytics (Merge vs Bubble)
```

---

## Task management (productized)

The **Tasks** tab is a full task-management surface with four views —
**All Tasks / Priority / Deadline / Progress (Kanban)** — plus
Create / Edit / Delete / Duplicate, AI-vs-Manual badges, due-date countdowns,
and a deterministic **Workspace Health Score** on the Overview tab.
Original AI backlogs can be restored from **Overview → Restore AI Backlog**.
See **[TASK_MANAGEMENT_UPGRADE.md](TASK_MANAGEMENT_UPGRADE.md)** for the full
breakdown, DAA mapping, demo flow and viva questions.
