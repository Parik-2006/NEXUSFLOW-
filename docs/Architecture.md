# NexusFlow — Architecture

## Overview

NexusFlow is a monorepo with two deployables:

```
P:\DAA OPTIONAL
├── client/   Expo (SDK 51) + expo-router app — runs on web and native
├── server/   Express + Socket.io + Mongoose (MongoDB) API, ES modules
└── docs/      Product & engineering documentation
```

Launch both with `start.bat` (pins `PORT=4000` for the server; the client points
at it via `EXPO_PUBLIC_API_URL`).

## Client

- **Framework:** React Native via Expo, rendered on web with `react-native-web`.
- **Routing:** `expo-router` (file-based) under `client/app/`.
  - `(auth)/login` — sign in
  - `(tabs)/dashboard`, `(tabs)/profile` — main tabbed app
  - `team/[teamId]` — the workspace (Overview/Tasks/Chat/Sprint/Graph/Members/
    Analytics/AI Rec)
  - `daa-insights` — demo/education reference (outside the normal flow)
- **Design system (single source of truth):**
  - `client/theme.ts` — colors, spacing, radius, typography, shadows, layout
    widths. Premium warm/cream palette (primary `#2F4F4F`, accent `#7D8F69`,
    canvas `#FAF8F4`).
  - `client/components/ui.tsx` — Card, Button, Field, Badge, StatCard, Avatar,
    EmptyState, Skeleton, FAB, SearchBar, ProgressBar, Chip, Stepper, etc.
  - `client/components/feedback.tsx` — toasts, confirm dialog, ModalSheet.
- **State & data:** React hooks per concern —
  `useTeams`, `useTeam`, `useTeamTasks`, `useRecommendation`,
  `useTaskAnalytics`, `useDependencyGraph`. `context/AuthContext.tsx` holds the
  session; `services/socket.ts` manages the websocket.
- **Storage shim:** `utils/storage.ts` — SecureStore on native, `localStorage`
  on web (used for JWT and locally-saved profile data).

## Server

- **HTTP:** `server/index.js` — Express. Dev auth at `POST /api/login` issues a
  JWT for any email; `requireAuth` guards the rest.
- **REST:** `server/routes/teams.js` — teams, members, tasks, dependencies,
  assignment and sprint optimisation endpoints.
- **Realtime:** Socket.io — `socket/taskHandlers.js` (task create/update,
  priority refresh, execution order, assignment) and `socket/aiOrchestrator.js`
  (AI planning workflow). Rooms are per team (`room:join` / `room:leave`).
- **Algorithms:** `server/algorithms/*` and `server/utils/sortAlgorithms.js`
  (greedy scheduler, knapsack/task optimiser, graph traversal for DFS/BFS/topo,
  branch & bound, merge/bubble sort comparison).
- **Models:** `server/models/Team.js`, `server/models/Task.js` (Mongoose). The
  server still boots without MongoDB so the app runs in dev.

## Data flow

```
                 REST (hydrate)            Socket.io (live deltas)
Client hooks  ───────────────►  Express  ◄───────────────────────  Client hooks
   useTeam*                       routes        task:created/updated
                                    │           task:execution-order
                                    ▼           task:assigned
                            Algorithms + Mongoose
                                    │
                                    ▼
                                 MongoDB
```

1. A screen mounts → its hook hydrates over REST.
2. User actions (create task, change status, add dependency, run optimiser) go
   over the socket or REST.
3. The server runs the relevant algorithm, persists, and **broadcasts** the delta
   to everyone in the team room.
4. Hooks apply deltas optimistically and reconcile on the socket `reconnect`
   event, keeping every client — and the dashboard stats — consistent.

## Environment notes (web)

- `client/package.json` pins `expo-font`, `expo-constants`, `expo-linking` to SDK
  51 via `overrides` — required so `@expo/vector-icons` / `expo-router` don't
  crash web with `registerWebModule is not a function`. Do not remove.
- Verify changes: `cd client && npx tsc --noEmit` and
  `npx expo export --platform web` (exit 0 ⇒ all routes compile).

See also: [ProductVision.md](ProductVision.md) · [UserFlow.md](UserFlow.md) ·
[DAAIntegration.md](DAAIntegration.md)
