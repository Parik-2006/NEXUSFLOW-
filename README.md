# NexusFlow

Real-time team task collaboration app. Expo Router (React Native) client + Node/Express/Socket.io
server backed by MongoDB. Includes JWT auth, hydrate-then-subscribe data flow, optimistic task
updates with rollback, reconnection replay, and a streaming AI orchestrator.

## Architecture

```
client (Expo Router)                 server (Express + Socket.io)
├─ app/(auth)/login                  ├─ index.js            HTTP + socket bootstrap
├─ app/(tabs)/dashboard ─ REST ───►  ├─ routes/teams.js     GET /api/teams (hydrate)
├─ app/(tabs)/profile                ├─ socket/
├─ app/chat/[teamId]   ─ socket ─►   │   ├─ taskHandlers.js task:create/update + broadcast
│                                    │   └─ aiOrchestrator  chat:message → streamed task blocks
├─ context/AuthContext               └─ models/ Team, Task  (Mongoose)
├─ hooks/useTeams, useTeamTasks
└─ services/socket
```

### Data flow: hydrate-then-subscribe
1. Screen mounts → `useTeams` / `useTeamTasks` fetch a REST snapshot (fast first paint).
2. Client joins the socket room (`team:<id>`) and applies live deltas on top of the snapshot.
3. On reconnect, the client **refetches** to catch any updates missed while offline (reconnection replay).

## Quick start
See `RUN.md`.
