# NexusFlow — Improvements V2

This document covers the V2 UX + algorithm-visibility upgrade. Every change is
**additive** and **local-only**: no existing DAA algorithm was removed,
duplicated, or weakened, and the MongoDB schema, REST routes and socket events
were reused wherever possible. The goal of V2 is to make the algorithms
**visible and explainable** for mentor evaluation while polishing the UX.

> Screenshot placeholders are marked `📷 [screenshot: …]`. Drop PNGs into
> `docs/img/` and replace the placeholder.

---

## At a glance

| # | Feature | Layer | DAA tie-in |
|---|---------|-------|-----------|
| 1 | Actionable AI task titles | server | feeds Greedy Scheduler (unchanged) |
| 2 | Drag-and-drop Kanban | client | status model unchanged |
| 3 | Deadline intelligence | client | EDF / urgency ranking |
| 4 | Reminder system | client | derived from live task state |
| 5 | Skill matrix | client | evidence for Branch & Bound |
| 6 | Assignment explanation | client | Branch & Bound transparency |
| 7 | Priority breakdown | client | Greedy score made visible |
| 8 | Graph improvements | client | DFS / BFS / Topo unchanged |
| 9 | Algorithm explanation mode | client | all algorithms |
| 10 | Health score labels | client | weighted heuristic |
| 11 | AI pipeline visualization | client | BFS→Greedy→Knapsack→Merge→Topo |
| 12 | Date-picker UX | client | deadline inputs |

---

## 1. Actionable AI task generation
`server/socket/aiOrchestrator.js`

- New pure helper **`toActionableTitle()`** converts requirement-style sentences
  into short, Jira/Trello-style engineering tasks:
  - *"The system continuously monitors soil moisture…"* → **"Implement Soil
    Moisture Monitoring Module"**
  - *"Farmers can view field conditions"* → **"Develop Field Conditions
    Dashboard"**
- Applied to **both** the OpenAI path and the offline mock path, plus a hardened
  OpenAI system prompt that demands imperative, 3–7 word titles.
- The offline mock now emits a realistic professional backlog so the demo looks
  good with **no OpenAI key**.
- **Greedy Scheduler untouched:** `estimatePriority()` still derives
  urgency/impact and the pre-save hook still computes `priorityScore`.

📷 [screenshot: AI chat generating action-oriented tasks]

## 2. Drag-and-drop Kanban
`client/components/workspace/KanbanBoard.tsx` (new), wired into `TasksPanel`

- TO DO · IN PROGRESS · DONE columns with **real drag-and-drop** built on core
  `PanResponder` + `Animated` (no new dependency; works on web + native).
- Dropping a card persists the new status immediately
  (`onMove → setStatus → socket task:update → MongoDB → broadcast`).
- Smooth lift/scale animation, drop-target highlight, and a **tap-to-advance**
  fallback. Status model and all algorithms unchanged.

📷 [screenshot: kanban mid-drag]

## 3. Deadline intelligence
`client/theme.ts` (`deadlineMeta`, `deadlineScore`, `deadlineColors`),
`client/components/workspace/TasksPanel.tsx`, `client/components/TaskCard.tsx`

- Per-task: Start, Due, **Days Remaining**, overdue status, Business Value,
  Priority, Progress.
- **Deadline Score = Business Value ÷ Days Remaining** (overdue → boosted to the
  top). Each deadline bucket is ranked by this score.
- Colour bands: **Green** >7d · **Orange** 3–7d · **Red** 0–2d · **Dark Red**
  overdue — unified across cards and the deadline view.
- Countdowns: "12 days left", "Due today", "Overdue by 3 days".

📷 [screenshot: deadline intelligence cards]

## 4. Reminder system
`client/hooks/useReminders.ts` (new), `client/components/NotificationCenter.tsx`
(new), header in `client/app/team/[teamId].tsx`

- Derives alerts from live task state (same socket stream, no new backend):
  overdue tasks (critical), approaching deadlines ≤2d (warning), and Branch &
  Bound `assign:warning` (blocked assignment).
- **Notification center** bell with unread badge in the workspace header +
  **toast** when overdue work is first detected.

📷 [screenshot: notification center open]

## 5. Team member skill matrix
`client/components/workspace/SkillMatrix.tsx` (new), in `AssignmentBoard`

- Visual member × skill bar matrix with per-member top-skill highlight.
- Framed explicitly as the **evidence layer for Branch & Bound** (tall bar =
  low skill-gap cost).

📷 [screenshot: skill matrix]

## 6. Assignment explanation panel
`client/components/workspace/AssignmentBoard.tsx`

- Each assignment now shows a plain-English **reason** ("Perfect fit — cost 0" /
  "Lowest skill gap available · strongest in backend (9/10)").
- The result header gains a **"Why?"** button → explanation sheet showing
  Branch & Bound's input, output, nodes explored/pruned and complexity.

📷 [screenshot: assignment explanation]

## 7. Priority tab — Greedy made visible
`client/theme.ts` (`greedyBreakdown`), `TasksPanel`

- Priority view keeps the CRITICAL/HIGH/MEDIUM/LOW grouping and adds a per-task
  **Greedy score breakdown bar**: Urgency, Impact, Dependency-weight
  contributions and the final 0–100 score (mirrors the server formula
  `0.50·U + 0.35·I + 0.15·D`).
- A **"Why?"** chip explains the Greedy Priority Scheduler.

📷 [screenshot: greedy breakdown bars]

## 8. Graph tab improvements
`client/components/DependencyGraphPanel.tsx`

- Nodes are **coloured by priority tier**, with an explicit **status dot**, a
  priority chip, and a **legend**.
- DFS / BFS / Topological Sort outputs and complexity badges are unchanged —
  the portable, SVG-free node-list design is preserved (scroll = pan).

📷 [screenshot: dependency graph with priority colours]

## 9. Algorithm explanation mode ("Why is this recommended?")
`client/components/AlgoExplain.tsx` (new)

- Reusable **`WhyButton`** + **`AlgoExplainSheet`** with a single client-side
  algorithm registry (`ALGO_INFO`).
- Every explanation shows **Algorithm · Input · Output · Reason · Complexity**.
- Wired into Priority (Greedy) and Assignment (Branch & Bound); the
  Recommendation tab already had an algorithm accordion (kept) and now also has
  the pipeline view (#11).

📷 [screenshot: explanation sheet]

## 10. Workspace health score
`client/theme.ts` (`healthLabel`), `OverviewPanel`

- The deterministic /100 score now shows a prominent qualitative verdict:
  **Excellent ≥95 · Healthy ≥80 · Needs Attention ≥60 · At Risk <60** with a
  matching progress-bar colour. Server `computeHealthScore` is unchanged.

📷 [screenshot: health verdict]

## 11. AI recommendation pipeline visualization
`client/components/RecommendationPanel.tsx`

- New vertical **pipeline** rendering the exact, unchanged order
  **Ready Tasks (BFS) → Priority Ranking (Greedy) → Sprint Selection (Knapsack)
  → Sorted Results (Merge Sort) → Execution Order (Topological Sort)** with each
  stage's **intermediate output** taken straight from the server
  `algorithmSummary`.

📷 [screenshot: pipeline view]

## 12. Deadline input UX
`client/components/DatePicker.tsx` (new), used in the task form

- On **web** renders a real native `<input type="date">` (calendar UI,
  validation, mobile-web friendly); on **native** falls back to a validated text
  field. Due date is bounded by the chosen start date. **Schema unchanged**
  (still stored as ISO Date).

---

## Files changed / added

**Server (backend):**
- `server/socket/aiOrchestrator.js` — `toActionableTitle()`, hardened OpenAI
  prompt, professional mock backlog.

**Client (frontend) — new:**
- `client/components/AlgoExplain.tsx`
- `client/components/DatePicker.tsx`
- `client/components/NotificationCenter.tsx`
- `client/components/workspace/KanbanBoard.tsx`
- `client/components/workspace/SkillMatrix.tsx`
- `client/hooks/useReminders.ts`

**Client (frontend) — modified:**
- `client/theme.ts` — deadline intelligence, greedy breakdown, health labels.
- `client/components/TaskCard.tsx` — unified deadline colours.
- `client/components/RecommendationPanel.tsx` — pipeline view.
- `client/components/DependencyGraphPanel.tsx` — priority colours + legend.
- `client/components/workspace/TasksPanel.tsx` — kanban, deadline cards, greedy
  breakdown, date picker, Why buttons.
- `client/components/workspace/AssignmentBoard.tsx` — skill matrix + explanations.
- `client/components/workspace/OverviewPanel.tsx` — health verdict label.
- `client/app/team/[teamId].tsx` — notification center in header.

---

## Algorithm impact summary

Every DAA engine is **preserved and now more visible** — none were modified
in their logic:

| Algorithm | Where it's surfaced in V2 |
|-----------|---------------------------|
| Greedy Priority Scheduler | priority breakdown bars + Why sheet |
| Greedy Sprint Ranking | recommendation pipeline (stage 2) |
| 0/1 Knapsack | recommendation pipeline (stage 3) |
| Merge Sort | recommendation pipeline (stage 4) |
| Topological Sort (Kahn) | graph tab + pipeline (stage 5) |
| DFS (cycle check) | graph tab |
| BFS (levels) | graph tab + pipeline (stage 1) |
| Boyer-Moore-Horspool | task search (unchanged) |
| Branch & Bound | skill matrix + assignment explanations + Why sheet |

---

## Mentor-demo additions

1. **AI tab** — generate a backlog: titles now read like real engineering tasks.
2. **Tasks → Priority** — tap **Why?**; show the Greedy score breakdown bars.
3. **Tasks → Deadline** — show Deadline Score ranking + colour bands; set a past
   due date → it goes Dark Red and a reminder/toast fires.
4. **Tasks → Progress** — drag a card across the Kanban; status persists live.
5. **Members** — show the **Skill Matrix**, run assignment, tap **Why?** to show
   Branch & Bound nodes explored/pruned, then read the per-task reason.
6. **AI Rec** — run a sprint; walk the **pipeline** stage by stage.
7. **Header bell** — open the notification center to show reminders.
8. **Overview** — point at the health verdict (Excellent/Healthy/…).

---

## Remaining risks / notes

- **Untested locally** (per your instruction — local-only, no run). All changes
  are additive and dependency-free, but please smoke-test before pushing.
- **Kanban drag** uses `PanResponder` drop-detection via `measureInWindow` and
  equal-width columns; verify drop targeting on very narrow screens. Tap-to-
  advance remains as a reliable fallback.
- **Date picker** uses a real DOM `<input type="date">` on web only; native uses
  the validated text field (no native date module added).
- **Reminders** currently cover overdue / approaching deadlines / blocked
  assignment. Dependency-cycle and sprint-overflow alerts are still surfaced in
  the Graph and Sprint tabs respectively; they can be funneled into the
  notification center later via `useReminders` if desired.
- **No new npm dependencies** were added, so `npm install` is not required.
