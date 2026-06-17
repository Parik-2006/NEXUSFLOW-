# MERGE_DISCOVERY_REPORT.md
> Phase 1 — Repository Discovery
> Generated: 2026-06-14 | Engineer: Principal Architect Review

---

## 1. Workspace Layout

```
P:/DAA OPTIONAL/
├── client/          ← NexusFlow React Native (Expo) client  [SOURCE OF TRUTH]
├── server/          ← NexusFlow Node/Express/Socket.IO server [SOURCE OF TRUTH]
├── update/          ← DAA enhancement patch set
│   ├── nexusflow-greedy-patches/
│   │   └── nexusflow-patches/   ← CANONICAL patch tree (used for all comparisons)
│   ├── greedyScheduler.js       ← loose copy (identical to patch tree)
│   ├── Task.js                  ← loose copy (identical to patch tree)
│   ├── taskHandlers.js          ← loose copy (identical to patch tree)
│   ├── teams.js                 ← loose copy (identical to patch tree)
│   └── DAA_REPORT_PHASE1.md     ← documentation only, not for integration
└── [README.md, RUN.md]          ← project docs
```

**Note:** The loose files in `update/` root (`Task.js`, `taskHandlers.js`, `teams.js`, `greedyScheduler.js`) are byte-for-byte identical to their counterparts in `update/nexusflow-greedy-patches/nexusflow-patches/`. They appear to be earlier exports. All diff analysis uses the nested patch tree as the canonical source.

---

## 2. Files ONLY in update/ (to be added to NexusFlow)

| File | Destination in NexusFlow | Notes |
|------|--------------------------|-------|
| `server/algorithms/greedyScheduler.js` | `server/algorithms/greedyScheduler.js` | **NEW FILE** — core algorithm module |

---

## 3. Files ONLY in NexusFlow (not touched by update)

These files exist exclusively in NexusFlow and will **not** be modified by this merge:

**Client:**
- `client/app/(auth)/login.tsx`
- `client/app/(tabs)/_layout.tsx`
- `client/app/(tabs)/dashboard.tsx`
- `client/app/(tabs)/profile.tsx`
- `client/app/_layout.tsx`
- `client/components/AuthGate.tsx`
- `client/components/ProgressBar.tsx`
- `client/components/TeamCard.tsx`
- `client/context/AuthContext.tsx`
- `client/hooks/useTeams.ts`
- `client/services/socket.ts`
- `client/package.json`
- `client/tsconfig.json`
- `client/app.json`
- `client/.env.example`

**Server:**
- `server/auth.js`
- `server/index.js`
- `server/models/Team.js`
- `server/package.json`
- `server/.env.example`

**Root:**
- `README.md`
- `RUN.md`

---

## 4. Files Modified in BOTH Locations

| NexusFlow file | Update counterpart | Change magnitude |
|---|---|---|
| `server/models/Task.js` | `nexusflow-patches/server/models/Task.js` | Schema additions + hooks |
| `server/routes/teams.js` | `nexusflow-patches/server/routes/teams.js` | New endpoints + sort change |
| `server/socket/taskHandlers.js` | `nexusflow-patches/server/socket/taskHandlers.js` | Extended events |
| `server/socket/aiOrchestrator.js` | `nexusflow-patches/server/socket/aiOrchestrator.js` | Priority heuristics added |
| `client/app/chat/[teamId].tsx` | `nexusflow-patches/client/app/chat/[teamId].tsx` | **COMPLETE REWRITE** |
| `client/components/TaskCard.tsx` | `nexusflow-patches/client/components/TaskCard.tsx` | Additive priority UI |
| `client/hooks/useTeamTasks.ts` | `nexusflow-patches/client/hooks/useTeamTasks.ts` | Extended type + new fn |

---

## 5. New Directories Introduced

| Directory | Purpose |
|-----------|---------|
| `server/algorithms/` | Algorithm module container — holds `greedyScheduler.js` and is designed as the future home for Topological Sort, etc. |

---

## 6. Potential Conflicts

| Conflict | File | Severity | Description |
|----------|------|----------|-------------|
| **UI library swap** | `client/app/chat/[teamId].tsx` | HIGH | Original uses `react-native-gifted-chat`. Update replaces with custom FlatList UI. `GiftedChat` import will be dropped. |
| **Sort order change** | `server/routes/teams.js` | LOW | GET `/api/teams/:teamId/tasks` changes sort from `updatedAt DESC` to `priorityScore DESC`. Any client relying on update-time order will see different ordering. |
| **Schema migration** | `server/models/Task.js` | LOW | New fields (urgency, impact, dependencyCount, priorityScore) with safe defaults. Existing MongoDB documents will read `undefined` for new fields until accessed — Mongoose defaults handle this at read time. |
| **Import path** | `server/models/Task.js`, `server/routes/teams.js`, `server/socket/taskHandlers.js` | BLOCKING if not resolved first | All three files import from `../algorithms/greedyScheduler.js`. This directory does not yet exist in NexusFlow. **Must create the algorithms/ directory and file FIRST.** |
| **Duplicate loose files** | `update/` root | NONE | `update/Task.js`, `update/taskHandlers.js`, `update/teams.js`, `update/greedyScheduler.js` are exact duplicates of patch tree. Will be ignored. |

---

## 7. Summary Counts

| Category | Count |
|----------|-------|
| Files to ADD (new) | 1 |
| Files to MODIFY | 7 |
| Files untouched | 22 |
| New directories | 1 |
| Conflicts detected | 5 (1 HIGH, 1 MEDIUM, 3 LOW) |
| Blocking dependency | 1 (algorithms/ must be created first) |
