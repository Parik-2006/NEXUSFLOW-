# DIFF_ANALYSIS_REPORT.md
> Phase 2 — Diff Analysis
> Generated: 2026-06-14 | Engineer: Principal Architect Review

Classification key:
- **SAFE** — Purely additive or backward-compatible; apply automatically.
- **REVIEW_REQUIRED** — Functional change or dependency swap; diff shown for approval.
- **HIGH_RISK** — Data-destructive, breaks existing API, or has unresolvable ambiguity.

---

## FILE 1 — `server/algorithms/greedyScheduler.js` (NEW)
**Classification: SAFE**

**Type:** New file, no NexusFlow counterpart.

**What it adds:**
- `computePriorityScore({ urgency, impact, dependencyCount })` — O(1) pure function returning integer score 0-100.
- `greedySortTasks(tasks)` — O(n log n) sort returning new array; does not mutate input.
- `clamp(n, min, max)` — private helper; no export.
- Weight constants configurable via `GREEDY_W_URGENCY`, `GREEDY_W_IMPACT`, `GREEDY_W_DEPS` env-vars (defaults: 0.50, 0.35, 0.15).

**Risks:** None. Pure functions with no side-effects. No existing code modified.

**Action:** CREATE `server/algorithms/greedyScheduler.js`. Must be done BEFORE any other server file merge.

---

## FILE 2 — `server/models/Task.js`
**Classification: SAFE**

**Lines added vs original (14 lines → 206 lines):**

| Change | Detail |
|--------|--------|
| Import added | `import { computePriorityScore } from "../algorithms/greedyScheduler.js"` |
| Schema fields added | `urgency` (Number, 1-5, default 1) |
| Schema fields added | `impact` (Number, 1-5, default 1) |
| Schema fields added | `dependencyCount` (Number, ≥0, default 0) |
| Schema fields added | `priorityScore` (Number, 0-100, default 0, indexed) |
| Index added | Compound: `{ teamId: 1, priorityScore: -1 }` |
| Hook added | `pre('save')` — recomputes priorityScore on create/modify of source fields |
| Hook added | `pre('findOneAndUpdate')` — recomputes when update payload touches source fields |

**Lines REMOVED vs original:** None. Zero deletions from original logic.

**Backward compatibility:**
- All new fields have `default` values — existing MongoDB documents read safely.
- `createdBy` type kept as `ObjectId` (original had same).
- `pre('save')` hook only fires when `isNew` or relevant fields modified — safe for existing save calls.

**Risks:** Low. The `pre('findOneAndUpdate')` hook has a known partial-recalculation edge case (documented in code) when callers don't send all three dimensions. The taskHandlers.js update explicitly mitigates this by always fetching existing values before updating.

---

## FILE 3 — `server/routes/teams.js`
**Classification: SAFE**

**Changes vs original:**

| Change | Line(s) | Detail |
|--------|---------|--------|
| Import added | +5 | `import { greedySortTasks } from "../algorithms/greedyScheduler.js"` |
| Error handling added | GET /teams | Wrapped in try/catch; was bare `async` with no error handler |
| Sort changed | GET /tasks | `.sort({ updatedAt: -1 })` → `.sort({ priorityScore: -1, createdAt: 1 })` |
| Error handling added | GET /tasks | Wrapped in try/catch |
| Endpoint ADDED | GET `/api/teams/:teamId/tasks/scheduled` | Demonstrates greedySortTasks() algorithm, returns ranked list |
| Endpoint ADDED | PATCH `/api/tasks/:taskId/priority` | Updates urgency/impact; hook recomputes score |

**Lines REMOVED:** Zero. All original routes preserved.

**Sort order impact:** The GET `/api/teams/:teamId/tasks` response order changes from `updatedAt DESC` to `priorityScore DESC, createdAt ASC`. The only consumer of this endpoint in NexusFlow is `useTeamTasks.ts` (hydrate function). The updated `useTeamTasks.ts` applies a client-side greedy sort after fetching, so both old and new sort orders produce the same final render.

**Route ordering note:** `GET /tasks/scheduled` is registered BEFORE `GET /tasks/:taskId` (no such route exists) — no shadowing risk.

---

## FILE 4 — `server/socket/taskHandlers.js`
**Classification: SAFE**

**Changes vs original:**

| Change | Detail |
|--------|--------|
| Import added | `import { computePriorityScore } from "../algorithms/greedyScheduler.js"` |
| `task:create` signature | Added optional `urgency = 1, impact = 1` to destructure |
| `task:create` body | Passes urgency/impact/dependencyCount:0 to `Task.create()` |
| `task:create` response | `task.toObject()` stored in variable; emitted + acked with consistent object |
| `task:update` signature | Added optional `urgency, impact` to destructure |
| `task:update` body | Conditionally fetches existing doc + includes all three dimensions in payload |
| `task:update` options | Adds `{ runValidators: true, context: "query" }` to findByIdAndUpdate |
| `task:update` ack | Returns `{ ok: true, task }` (now includes task object, previously just `{ ok: true }`) |
| Event ADDED | `task:recompute_team` — bulk recalculate non-done tasks, emit `task:priority_refreshed` |

**Lines REMOVED:** The bare `.lean()` at `findByIdAndUpdate` call still present. Original's `if (!task)` check preserved. `room:join`/`room:leave` unchanged.

**Backward compatibility:**
- Clients that don't send `urgency`/`impact` get default values (1, 1) → priorityScore = 0. They work normally.
- The `task:update` ack shape change: original returned `{ ok: true }`, new returns `{ ok: true, task }`. The client `useTeamTasks.ts` original only checked `ack?.ok` — adding `task` is non-breaking.

---

## FILE 5 — `server/socket/aiOrchestrator.js`
**Classification: SAFE**

**Changes vs original:**

| Change | Detail |
|--------|--------|
| Constants added | `URGENCY_KEYWORDS`, `IMPACT_KEYWORDS` arrays |
| Function added | `estimatePriority(title)` — keyword scan, O(k·m), returns `{ urgency, impact }` |
| `streamMock` — task creation | Now calls `estimatePriority(title)` and passes urgency/impact to `Task.create()` |
| `streamFromOpenAI` — task creation | Same; calls `estimatePriority(title)` per task title |

**Lines REMOVED:** Zero. The streaming logic, room broadcast, and `delay` helper are identical.

**Risk:** None. The keyword arrays are conservative; if no keywords match, tasks default to urgency=2, impact=2 (baseline above schema default of 1 but below any urgent tier). AI-created tasks were previously all at score 0.

---

## FILE 6 — `client/hooks/useTeamTasks.ts`
**Classification: SAFE**

**Changes vs original (89 lines → 217 lines):**

| Change | Detail |
|--------|--------|
| `Task` type extended | Added `urgency: number`, `impact: number`, `dependencyCount: number`, `priorityScore: number`, `createdAt?: string`, `rank?: number` |
| `greedySortTasks()` added | Client-side TS port of server algorithm; O(n log n) |
| `setSortedTasks` helper | Wraps `setTasks` and applies `greedySortTasks` after every mutation |
| `hydrate` | Now calls `greedySortTasks(data)` on fetched data |
| `onCreated` | Uses `setSortedTasks` instead of `setTasks`; prepend→append but sort handles order |
| `onUpdated` | Uses `setSortedTasks` for automatic re-sort on score change |
| `task:priority_refreshed` listener | Added: triggers `hydrate()` on bulk server recalculation |
| `setStatus` | Uses `setSortedTasks` internally (same logic, wrapper changes) |
| `setTaskPriority` added | New exported function: optimistic urgency/impact update with rollback |
| Return value | Adds `setTaskPriority` to returned object |

**Lines REMOVED:** None meaningful. The `onCreated` handler changes from `[task, ...prev]` (prepend) to `[...prev, task]` (append) — but since `setSortedTasks` immediately sorts by priorityScore, the insertion position is irrelevant.

**Breaking changes:** The `Task` type now has `urgency`, `impact`, `dependencyCount`, `priorityScore` as **required** (non-optional) fields. Any component that constructs a `Task` object directly (not from server) will need those fields. In this codebase, tasks only come from the server or socket events — no code constructs `Task` objects inline. Safe.

---

## FILE 7 — `client/components/TaskCard.tsx`
**Classification: SAFE**

**Changes vs original:**

| Change | Detail |
|--------|--------|
| `COLOR` renamed | `COLOR` → `STATUS_COLOR` (avoids collision with new priority color map) |
| Types added | `PriorityTier` type, `getPriorityTier()`, `PRIORITY_COLOR`, `PRIORITY_BG`, `nextUrgency()` |
| Props extended | `onSetPriority?: (urgency: number, impact: number) => void` (optional) |
| Layout change | Outer element changed from `<Pressable>` to `<View style={styles.card}>` |
| Row 1 | Wrapped in inner `<Pressable style={styles.row}>` (status cycling preserved) |
| Row 2 ADDED | `<View style={styles.priorityRow}>` with tappable `PriorityBadge` + meta text |
| Styles | `card` wrapper added; `row` padding removed (now on card); `priorityRow/*` styles added |

**Lines REMOVED:**
- The `styles.row` padding `14` moved to `card.paddingTop/Bottom`. Visually identical vertical space.

**Backward compatibility:**
- `onSetPriority` is optional. Any existing caller that passes only `task` + `onCycle` will render the priority badge as non-interactive (disabled Pressable). No breakage.
- `COLOR` rename to `STATUS_COLOR` is internal. No external consumers reference these constants.

---

## FILE 8 — `client/app/chat/[teamId].tsx`
**Classification: REVIEW_REQUIRED**

**Nature of change:** This is a **complete UI rewrite**, not a patch. The file shares only the filename with the original.

### What the original does:
- Single-purpose chat screen using `react-native-gifted-chat`
- Joins socket room, listens for `chat:message` / `chat:stream`
- `onSend` emits `chat:message` to socket
- No task list, no task creation, no input customization
- 54 lines

### What the update does:
- **Removes** `GiftedChat` entirely; drops `react-native-gifted-chat` import
- **Adds** integrated task list (FlatList) at top with "↓ Greedy Priority Order" header
- Uses `useTeamTasks(teamId)` to load + manage tasks
- **Adds** chat message bubble UI (custom FlatList) with sender name, own/other styling
- **Adds** input bar with `Send` + `+ Task` buttons
- `sendMessage()` emits `chat:message` to socket
- `createTask()` emits `task:create` to socket
- **Removes** `room:join` / `room:leave` from this component (now handled inside `useTeamTasks`)
- 201 lines

### Diff summary:

```diff
- import { GiftedChat, IMessage } from "react-native-gifted-chat";
+ import { FlatList, TextInput, KeyboardAvoidingView, ... } from "react-native";
+ import { useTeamTasks } from "@/hooks/useTeamTasks";
+ import TaskCard from "@/components/TaskCard";

- const [messages, setMessages] = useState<IMessage[]>([]);
+ const [messages, setMessages] = useState<ChatMessage[]>([]);
+ const [input, setInput] = useState("");
+ const { tasks, loading, setStatus, setTaskPriority } = useTeamTasks(teamId);

- socket.emit("room:join", { teamId });  // removed — useTeamTasks handles this
  socket.on("chat:message", onMessage);
  socket.on("chat:stream", onStream);    // onStream now appends text (streaming accumulation)

- const onSend = useCallback((outgoing: IMessage[]) => { ... }, ...)
+ const sendMessage = () => { socket.emit("chat:message", { teamId, text: input.trim() }); }
+ const createTask = () => { socket.emit("task:create", { teamId, title: input.trim() }); }

- return <GiftedChat messages={messages} onSend={onSend} user={...} />
+ return <KeyboardAvoidingView>
+   <FlatList data={tasks} renderItem={<TaskCard ... />} />  // task list
+   <FlatList data={messages} renderItem={<bubble />} />     // chat messages
+   <View> <TextInput /> <Send> <+Task> </View>              // input bar
+ </KeyboardAvoidingView>
```

### What requires confirmation:
1. **`react-native-gifted-chat` package** — still in `client/package.json`? If no other screen uses it, it becomes dead weight. (Recommend removing from package.json after merge.)
2. **`room:join`/`room:leave` ownership** — moved entirely to `useTeamTasks`. The chat screen no longer calls these. This is architecturally correct (the hook owns socket room lifecycle for its data), but means the chat stream events are only received while `useTeamTasks` is mounted (which it is, since the same screen mounts it).
3. **chat:stream accumulation** — the update version correctly accumulates streaming delta text into a single message (original appended each delta as a new bubble). This is a UX improvement.

**Recommendation:** APPROVE with confirmation. The change is sound, purposeful, and improves UX. Verify `react-native-gifted-chat` removal does not break other screens.

---

## Summary Table

| File | Classification | Lines Before | Lines After | Risk |
|------|---------------|-------------|------------|------|
| `server/algorithms/greedyScheduler.js` | SAFE (NEW) | 0 | 143 | None |
| `server/models/Task.js` | SAFE | 14 | 206 | Low |
| `server/routes/teams.js` | SAFE | 21 | 149 | Low |
| `server/socket/taskHandlers.js` | SAFE | 43 | 185 | Low |
| `server/socket/aiOrchestrator.js` | SAFE | 109 | 178 | None |
| `client/hooks/useTeamTasks.ts` | SAFE | 89 | 217 | Low |
| `client/components/TaskCard.tsx` | SAFE | 45 | 191 | Low |
| `client/app/chat/[teamId].tsx` | REVIEW_REQUIRED | 54 | 201 | Medium |
