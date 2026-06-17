# MERGE_PLAN.md
> Phase 4 — Ordered Integration Plan
> Generated: 2026-06-14 | Engineer: Principal Architect Review
> Status: AWAITING APPROVAL before any file is touched

---

## Execution Order

The dependency chain requires strict ordering. Steps 1-7 may be applied automatically (SAFE).
Step 8 requires explicit approval (REVIEW_REQUIRED).

---

### STEP 1 — CREATE `server/algorithms/greedyScheduler.js`
| Field | Value |
|-------|-------|
| **Action** | CREATE new file |
| **Target** | `server/algorithms/greedyScheduler.js` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/server/algorithms/greedyScheduler.js` |
| **Reason** | Core algorithm module. Three downstream files import from this path. Must exist before any of them are modified or the server will fail to start. |
| **Expected impact** | Zero — file does not yet exist in NexusFlow. No existing code broken. |
| **Dependencies** | None (first step). Requires creating `server/algorithms/` directory. |
| **Classification** | SAFE |

---

### STEP 2 — REPLACE `server/models/Task.js`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 14 lines, update 206 lines) |
| **Target** | `server/models/Task.js` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/server/models/Task.js` |
| **Reason** | Adds urgency, impact, dependencyCount, priorityScore schema fields with safe defaults. Adds pre-save and pre-findOneAndUpdate hooks that auto-compute priorityScore. Adds compound index for efficient greedy sort queries. |
| **Expected impact** | Existing MongoDB documents gain new fields with schema defaults on next read. No data loss. New tasks will have priorityScore computed automatically. |
| **Dependencies** | STEP 1 (imports `computePriorityScore` from `algorithms/greedyScheduler.js`) |
| **Classification** | SAFE |

---

### STEP 3 — REPLACE `server/routes/teams.js`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 21 lines, update 149 lines) |
| **Target** | `server/routes/teams.js` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/server/routes/teams.js` |
| **Reason** | Changes GET /tasks sort to priorityScore DESC (greedy order). Adds try/catch to GET /teams (was unhandled). Adds GET /tasks/scheduled endpoint for viva demo. Adds PATCH /tasks/:taskId/priority for REST priority adjustment. |
| **Expected impact** | GET /tasks response order changes. Client `useTeamTasks` re-sorts client-side anyway so visual order is unaffected. New endpoints do not conflict with existing routes. |
| **Dependencies** | STEP 1 (imports `greedySortTasks`), STEP 2 (Task model must have priorityScore field) |
| **Classification** | SAFE |

---

### STEP 4 — REPLACE `server/socket/taskHandlers.js`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 43 lines, update 185 lines) |
| **Target** | `server/socket/taskHandlers.js` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/server/socket/taskHandlers.js` |
| **Reason** | Extends task:create/task:update to accept urgency/impact (optional, backward-compatible). Adds task:recompute_team event for bulk priority refresh. Broadcasts full task objects including priorityScore so client can re-sort without REST round-trip. |
| **Expected impact** | Existing clients that don't send urgency/impact continue to work (defaults to 1, 1). The ack payload for task:update now includes `task` object in addition to `ok` — the original client only checked `ack?.ok`, so additive. |
| **Dependencies** | STEP 1 (imports `computePriorityScore`), STEP 2 (Task model has new fields) |
| **Classification** | SAFE |

---

### STEP 5 — REPLACE `server/socket/aiOrchestrator.js`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 109 lines, update 178 lines) |
| **Target** | `server/socket/aiOrchestrator.js` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/server/socket/aiOrchestrator.js` |
| **Reason** | Adds `estimatePriority()` heuristic so AI-generated tasks receive urgency/impact values based on keyword scan. Tasks proposed by @ai commands will immediately appear with non-zero priorityScore in the greedy queue. |
| **Expected impact** | AI-created tasks previously had score 0 (all at bottom of greedy list). Now they receive scores based on keywords. Streaming logic and room broadcast unchanged. |
| **Dependencies** | STEP 2 (Task model accepts urgency/impact) |
| **Classification** | SAFE |

---

### STEP 6 — REPLACE `client/hooks/useTeamTasks.ts`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 89 lines, update 217 lines) |
| **Target** | `client/hooks/useTeamTasks.ts` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/client/hooks/useTeamTasks.ts` |
| **Reason** | Extends Task type with greedy scheduler fields. Adds client-side greedySortTasks() for immediate optimistic re-sort. Adds setTaskPriority() for inline priority adjustment. Adds task:priority_refreshed listener for bulk server recalculations. |
| **Expected impact** | `Task` type gains required fields (urgency, impact, dependencyCount, priorityScore) — existing server always returns these with the new schema. Return value adds `setTaskPriority` — no existing callers break (they ignore unknown return fields). |
| **Dependencies** | Server STEPs 2-4 ideally deployed first (client will work in degraded mode if server hasn't updated yet — new fields simply default to 0) |
| **Classification** | SAFE |

---

### STEP 7 — REPLACE `client/components/TaskCard.tsx`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — original 45 lines, update 191 lines) |
| **Target** | `client/components/TaskCard.tsx` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/client/components/TaskCard.tsx` |
| **Reason** | Adds visual PriorityBadge showing tier (CRITICAL/HIGH/MEDIUM/LOW) and score. Adds optional onSetPriority prop for inline urgency cycling. Existing task + onCycle usage unchanged. |
| **Expected impact** | Every task card gains a priority row below the title. Visual change only — functional behavior (status cycling) is identical. Screens that don't pass onSetPriority get a non-interactive badge. |
| **Dependencies** | STEP 6 (Task type must include priorityScore, urgency, impact, dependencyCount) |
| **Classification** | SAFE |

---

### STEP 8 — REPLACE `client/app/chat/[teamId].tsx`
| Field | Value |
|-------|-------|
| **Action** | REPLACE (full file — complete UI rewrite) |
| **Target** | `client/app/chat/[teamId].tsx` |
| **Source** | `update/nexusflow-greedy-patches/nexusflow-patches/client/app/chat/[teamId].tsx` |
| **Reason** | Integrates task list into the chat screen (core DAA feature). Replaces GiftedChat with custom FlatList UI. Wires TaskCard priority badge. Adds "+ Task" button. |
| **Expected impact** | Chat screen is completely visually overhauled. GiftedChat library no longer imported (can be removed from package.json). room:join/room:leave lifecycle moves to useTeamTasks hook. |
| **Dependencies** | STEPs 6 and 7. Server steps 2-5 must be deployed for tasks to carry priorityScore. |
| **Classification** | REVIEW_REQUIRED — awaiting explicit approval |
| **Confirmation required** | YES — confirm before applying |

---

## Dependency Graph

```
STEP 1: greedyScheduler.js (NEW)
   ├─→ STEP 2: Task.js (imports computePriorityScore)
   │      ├─→ STEP 3: routes/teams.js (imports greedySortTasks + uses Task model)
   │      ├─→ STEP 4: taskHandlers.js (imports computePriorityScore + uses Task model)
   │      └─→ STEP 5: aiOrchestrator.js (uses Task model with new fields)
   └─→ STEP 3: routes/teams.js (imports greedySortTasks)

STEP 6: useTeamTasks.ts (client, independent of server deployment timing)
   └─→ STEP 7: TaskCard.tsx (consumes extended Task type)
          └─→ STEP 8: chat/[teamId].tsx (uses TaskCard + useTeamTasks)
```

---

## What Will NOT Be Changed

- `server/index.js` — imports are already correct (`teamRoutes`, `registerTaskHandlers`, `registerAiOrchestrator`). No changes needed.
- `server/auth.js` — untouched by update.
- `server/models/Team.js` — untouched by update.
- `client/package.json` — **NOTE:** `react-native-gifted-chat` may be removable after Step 8 if no other screen uses it. This is flagged but not automatically changed.
- All other client files — untouched.

---

## Rollback Plan

If any step fails:
- STEP 1-5 (server): Revert individual files from git or from the NexusFlow originals above. Server restart required.
- STEP 6-8 (client): Revert individual files. Expo hot-reload will pick up changes immediately in dev.
- The only cross-layer dependency: if server Task.js is deployed but client TaskCard is not updated, users will see tasks without priority badges (degraded but not broken). The reverse (client updated, server not) causes `priorityScore` to be `undefined` → defaults to 0 in all display logic (safe).
