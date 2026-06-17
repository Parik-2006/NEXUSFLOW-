# NexusFlow — Task Management Upgrade

This document covers the productization upgrade to the task-management
experience: a complete CRUD task system, four task views, the workspace
health score, AI-vs-manual provenance, the AI-backlog reset, and the consistent
priority colour system. Everything here is wired end-to-end
(UI → hook → REST/socket → MongoDB → DAA algorithms).

> Screenshot placeholders are marked `📷 [screenshot: …]`. Drop PNGs into
> `docs/img/` and replace the placeholder.

---

## 1. What changed

| Area | Before | After |
|------|--------|-------|
| Tasks tab | Single list + sort chips | Four views: **All / Priority / Deadline / Progress** |
| Task CRUD | Create + status cycle only | **Create / Edit / Delete / Duplicate**, all persisted + broadcast |
| Task fields | title, urgency, impact, hours, value | + **description, startDate, dueDate, priorityLabel, assignee, source** |
| Priority colour | Brown/amber tiers | **Critical = Red, High = Orange, Medium = Yellow, Low = Green** |
| Provenance | implicit `createdBy` | explicit **AI / Manual** badge (`source`) |
| Backlog | no reset | **Restore AI Backlog** (snapshot in `team.aiGeneratedTasks`) |
| Health | none | **Workspace Health Score** (deterministic /100 with breakdown) |

---

## 2. Data model

`server/models/Task.js`
- `startDate`, `dueDate` — user-set dates for the Deadline view (legacy `deadline`
  is still honoured as a fallback).
- `source` — `"ai" | "manual"` → drives the AI/Manual badge.
- `priorityLabel` — `"critical" | "high" | "medium" | "low" | null`. When set it
  overrides the Greedy-derived tier; when null the tier is derived from
  `priorityScore`.

`server/models/Team.js`
- `projectTitle`, `projectDescription` — captured from the create wizard.
- `aiGeneratedTasks` — snapshot of the original starter backlog so it can be
  restored later.

---

## 3. The four views (`client/components/workspace/TasksPanel.tsx`)

1. **All Tasks** (default) — Merge-Sort ordered (Priority/Deadline/Progress
   comparators), Boyer-Moore search, rich cards showing priority, status,
   due-date countdown, source badge, effort, business value, dependency count
   and assignee. Each card exposes **Edit / Duplicate / Delete**.
2. **Priority** — grouped sections **CRITICAL / HIGH / MEDIUM / LOW** with the
   Red/Orange/Yellow/Green palette; empty tiers are hidden.
3. **Deadline** — grouped **Overdue / Due today / Due this week / Later /
   No due date** with human countdowns (`2 days left`, `Due today`,
   `5d overdue`).
4. **Progress** — a **Kanban** board (To do / In progress / Completed). Tapping
   a card advances its status; the change persists over the socket immediately.

📷 [screenshot: tasks — four-view tab bar]
📷 [screenshot: priority view grouped by tier]
📷 [screenshot: progress kanban]

---

## 4. CRUD wiring (auto-recomputation)

| Action | Transport | Server effect | Algorithm recompute |
|--------|-----------|---------------|---------------------|
| Create | socket `task:create` | insert, `taskCount++` | Greedy score (pre-save); Topo if deps |
| Edit | socket `task:update {fields}` / REST `PATCH` | `$set` allowed fields | Greedy score when urgency/impact change |
| Delete | socket `task:delete` / REST `DELETE` | delete, pull dangling deps, fix counters | Topo execution-order rebuilt + broadcast |
| Duplicate | REST `POST …/duplicate` | clone (optional deps), `taskCount++` | socket `task:created` broadcast |
| Restore backlog | REST `POST …/restore-backlog` | delete all, rebuild from snapshot | Greedy scores recomputed on insert |

All mutations broadcast to `team:<id>` so every connected client updates with no
manual refresh.

---

## 5. Workspace Health Score

`GET /api/teams/:teamId/health` → deterministic 0–100 score
(`computeHealthScore` in `server/routes/teams.js`). Pure function → identical
input always yields identical score.

| Factor | Weight |
|--------|--------|
| Completed tasks | 35 |
| On-time tasks (not overdue) | 20 |
| Unblocked tasks (deps satisfied) | 20 |
| Critical load under control | 15 |
| Sprint utilization (WIP balance) | 10 |

Grades: A ≥ 85, B ≥ 70, C ≥ 50, D ≥ 30, else F. Rendered in the Overview tab
with a per-factor breakdown and the overdue/blocked/critical/WIP counts.

📷 [screenshot: workspace health card]

---

## 6. Priority colour system

`client/theme.ts` → `PRIORITY_META` + helpers:
- `priorityKeyFromScore(score)` maps Greedy score → tier key.
- `taskPriorityKey(task)` resolves a task's tier (explicit `priorityLabel` wins,
  else score-derived).
- `priorityTier(score)` retained for back-compat.

Colours: Critical `#DC2626`, High `#EA580C`, Medium `#CA8A04`, Low `#16A34A`
(muted, no neon — consistent across task cards, the priority view and the
kanban chips).

---

## 7. DAA mapping (unchanged engines, now more visible)

| Algorithm | Where it now shows up |
|-----------|----------------------|
| Greedy Priority Scheduling | priority score + All-Tasks "Priority" ordering |
| Merge Sort | All-Tasks comparator modes |
| Boyer-Moore | instant task search across views |
| Topological Sort (Kahn) | execution order rebuilt on create/delete/dep change |
| DFS cycle check | guards dependency creation |
| BFS levels | dependency graph tiers |
| 0/1 Knapsack | sprint plan |
| Branch & Bound | assignee recommendation |

No algorithm was duplicated — all task mutations reuse the canonical
implementations in `server/algorithms/*` and `server/utils/sortAlgorithms.js`.

---

## 8. Mentor demo flow

1. Create a workspace; paste an example description (Examples button) — note the
   350–1000 char counter and AI-plan preview.
2. Open the workspace → **Overview**: show the Workspace Health Score + factor
   breakdown.
3. **Tasks → All**: create a task with priority, dates, effort/value, assignee.
   Point out the **Manual** badge vs the **AI** starter tasks.
4. **Tasks → Priority**: show Red/Orange/Yellow/Green grouping.
5. **Tasks → Deadline**: set a due date in the past → it lands in **Overdue**.
6. **Tasks → Progress**: tap a card across the Kanban; watch health update.
7. Delete a task → execution order + health recompute live.
8. **Overview → Restore AI Backlog**: rebuild the original AI plan.

---

## 9. Viva questions

- *Why is the health score a pure function?* → determinism, testability, and
  UI/server parity (same tasks → same score).
- *How does priority resolve when both `priorityLabel` and `priorityScore`
  exist?* → explicit label wins (`taskPriorityKey`).
- *What recomputes when a task is deleted?* → dangling dependencies are pulled,
  counters fixed, and Kahn's topological order is rebuilt and broadcast.
- *Why keep Merge Sort on both client and server?* → different runtimes
  (RN bundle vs Node) and different comparator keys; no shared module boundary.
- *Where does the AI/Manual badge come from?* → the `source` field, set to
  `"ai"` for wizard/chat-generated tasks and `"manual"` for user-created ones.
