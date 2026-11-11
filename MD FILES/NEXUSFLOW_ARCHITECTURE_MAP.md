# NEXUSFLOW Complete System Architecture Map & Visual Diagrams

**Repository:** `p:/DAA OPTIONAL` (Branch: `version4.0`)  
**Scope Snapshot:** `481` repository files (`88` root/docs/assets + `142` `client/` + `251` `server/`), `42` Mongoose models, `428` Express HTTP route declarations (`server/index.js` + `13` route modules), `8` files in `server/algorithms/`, `65` files in `server/services/`, `4` files in `server/socket/`, `106` test/utility scripts (`103` `server/scripts/` + `3` external).  
**Evidence Rule:** Components, endpoints, sockets, services, and data models documented below reflect actual inspected source code (`CODE VERIFIED`). Dead/unwired components and bypassed checks are explicitly marked `[UNWIRED]` / `[BYPASSED]`.

---

## 1. Layered Architectural Overview

NEXUSFLOW is an Expo / React Native Web client (`client/`) paired with an Express + Socket.IO + MongoDB/Mongoose backend (`server/`). Across four releases (`V1` → `V2` → `V3` → `V4`), it evolved from a single-workspace DAA academic showcase into a multi-methodology project intelligence platform supporting **Waterfall**, **Scrum**, **Kanban**, **Classic (V1/V3 alias)**, and backend **Hybrid** configs, powered deterministically by DAA engines and advisories via the `$0`-cost **OmniRoute** cascade.

### Core Runtime Layers
1. **Presentation & Routing (`client/app/`, `client/components/`)**: `14` Expo Router screens dispatch into `client/app/team/[teamId].tsx`, which selects tabs and panels from `team.methodology`. `12` V4 workspace panel components have zero imports across `client/`.
2. **Client State & Transport (`client/hooks/`, `client/services/`, `client/utils/`)**: `10` React hooks (`useTeam`, `useTeams`, `useTeamTasks`, `useChat`, `useDependencyGraph`, `useInvitations`, `useRecommendation`, `useReminders`, `useTaskAnalytics`, `useWaterfallPlanLifecycle`), `client/utils/api.ts`, `client/services/scrumApiService.ts`, `kanbanApiService.ts`, `socket.ts`, and `client/utils/boyerMoore.ts`.
3. **Express HTTP Gateway & Socket.IO (`server/index.js`, `server/routes/`, `server/socket/`)**: `428` route declarations across `server/index.js` (`9`) and `13` routers (`projects.js` dual-mounted on `/api` and `/`), plus `4` Socket.IO room/event handlers (`taskHandlers.js`, `aiOrchestrator.js`, `projectSyncHandlers.js`, `chatHandlers.js`).
4. **Deterministic & AI Computation (`server/algorithms/`, `server/services/`, `server/utils/`)**: `8` core DAA modules (`greedyScheduler.js`, `taskPriorityEngine.js`, `graphTraversal.js`, `branchAndBound.js`, `taskOptimiser.js`, `decisionEngine.js`, `projectDecomposer.js`, `projectGuidanceEngine.js`), `sortAlgorithms.js` (`5` sorts), deterministic methodology engines (`phaseGateService.js`, `scrumEngine.js`, `kanbanEngine.js`, `hybridEngine.js`, `riskEngine.js`, `unifiedProjectHealthService.js`, `projectHealth2Service.js`), and `$0` LLM gateway (`omniRoute.js`).
5. **Persistence (`server/models/`)**: `42` Mongoose schemas with `timestamps: true`, `3` `pre` hooks (`User`, `Project`, `Task`), `0` `post` hooks, and `4` export-guarded models (`ProjectLesson`, `Risk`, `ScrumHealthSnapshot`, `ScrumSprintSnapshot`).

---

## 2. Diagram 1 — System Context & Deployment Topology (`CODE VERIFIED`)

```mermaid
flowchart LR
    U["End User (Web Browser / Expo Client)"] -->|"HTTPS REST API (JSON / JWT)"| EXP["Express App (server/index.js :4000)"]
    U -->|"WebSocket + JWT Handshake"| SIO["Socket.IO Server (io)"]
    EXP -->|"HTTP / OAuth Redirects"| GOOG["Google OAuth2 API"]
    EXP -->|"HTTPS REST + AES Token"| GH["GitHub REST API"]
    EXP -->|"Mongoose ODM"| MDB[("MongoDB (42 Collections)")]
    EXP -->|"Tier 1 Free"| GEM["Google Gemini Free (5 Models)"]
    GEM -.->|"Quota / 429 Fallback"| GROQ["Groq Free Tier (8 Models)"]
    GROQ -.->|"Quota / Error Fallback"| OR["OpenRouter (openrouter/free)"]
    OR -.->|"All Providers Exhausted"| FALL["Graceful Unavailable ($0.00)"]
    EXP -->|"SSE / Broadcast Helper"| SIO
    SIO -->|"team:* / project:* / chat:* / user:*"| U
```

---

## 3. Diagram 2 — Authentication, JWT & Google OAuth Flow (`CODE VERIFIED`)

```mermaid
sequenceDiagram
    participant C as "Client ((auth)/login.tsx)"
    participant E as "Express (index.js / auth.js)"
    participant G as "Google OAuth2"
    participant DB as "MongoDB (User / PasswordReset)"

    C->>E: "POST /api/login or /api/signup"
    E->>DB: "User.findOne / User.create (bcrypt pre-save)"
    DB-->>E: "User Doc"
    E->>E: "sign({ id, email, name }) (7d JWT)"
    E-->>C: "{ token, user: formatUser(user) }"

    Note over C,G: "Google OAuth Flow"
    C->>E: "GET /api/auth/google"
    E->>E: "oauthStateStore.set(state, ts) [in-memory]"
    E-->>C: "302 accounts.google.com/o/oauth2/v2/auth"
    C->>G: "User Approves Consent"
    G-->>E: "GET /api/auth/google/callback?code=...&state=..."
    E->>E: "validateOAuthState(state)"
    E->>G: "POST oauth2.googleapis.com/token + userinfo"
    E->>DB: "Find or Create User (no aud/email_verified gate)"
    E-->>C: "302 FRONTEND_URL/?token=JWT"
```

---

## 4. Diagram 3 — Express Request & Authorization Pipeline (`CODE VERIFIED`)

`server/index.js:44–242` mounts global CORS, `15mb` JSON parser, auth handlers, and `13` routers—without global `express-rate-limit` (`server/utils/rateLimiter.js` is not globally attached).

```mermaid
flowchart TD
    REQ["Incoming HTTP Request"] --> CORS["CORS Middleware (index.js:44)"]
    CORS --> JSONP["express.json limit 15mb (index.js:45)"]
    JSONP --> ROUTER{"Route Prefix Dispatch (index.js:229-242)"}

    ROUTER -->|"/api/scrum, /api/kanban, /api/hybrid"| RA1["Router-Level requireAuth"]
    ROUTER -->|"/api (auth, chat, skills, ai, userLookup, teams, projects, github, discovery, workstreams21to25)"| RA2["Per-Route requireAuth"]
    ROUTER -->|"Dual Mount / (projectRoutes)"| RA2

    RA1 --> PCHK{"Project / Team Access Helper"}
    RA2 --> PCHK

    PCHK -->|"teams.js / projects.js / scrum.js"| LEG["Check ownerId / members.userId / name spoof / empty-team isLegacy"]
    PCHK -->|"workstreams21to25.js:104"| WS_LEAK["Missing team falls through as isLeader: true"]
    PCHK -->|"kanban.js:78-113"| KAN_PRE["Creates Project + mutates Team BEFORE membership check"]
    PCHK -->|"projects.js:2803-3195 & scrum.js:1374,2281"| BYPASS["No findProject / verifyProjectAccess call (IDOR)"]
```

---

## 5. End-to-End Screen-to-Database Request & Data Flows (`CODE VERIFIED`)

| Flow | Frontend Screen & Component | Client Hook / API | Server Route / Socket | Service / Algorithm | Primary Mongoose Models |
| --- | --- | --- | --- | --- | --- |
| **Workspace Shell Load** | `app/team/[teamId].tsx` | `useTeam` → `api.ts` | `GET /api/teams/:id` (`teams.js`) | `verifyTeamAccess`, task counts | `Team`, `Project`, `Task` |
| **Waterfall Overview & Phases** | `OverviewPanel.tsx`, `WaterfallPhaseCanvas.tsx`, `PhaseGateModal.tsx` | `useWaterfallPlanLifecycle` | `/api/projects/:id/overview`, `/phases/*`, `/phase-gate` (`projects.js`) | `phaseGateService.js`, `changeImpactService.js`, `eventService.js` | `Project`, `Task`, `Decision`, `ProjectEvent` |
| **Waterfall Plan & Decompose** | `PlanPanel.tsx` | `useWaterfallPlanLifecycle` | `POST /api/projects/:id/plan/*` (`projects.js`) | `omniRoute.js` (if LLM), `taskDecomposer.js`, `projectDecomposer.js` | `Project`, `Task`, `ProjectMemory` |
| **Waterfall Insights** | `WaterfallInsightsPanel.tsx` (`5` subtabs) | `useTeamTasks`, `api.ts` | `/health-v2`, `/lessons*`, `/capability-overview`, `/risks`, `/decisions/explain/*` (`workstreams21to25.js`, `projects.js`) | `projectHealth2Service.js`, `projectLearningService.js`, `capabilityIntelligenceService.js`, `riskEngine.js` | `TeamHealth`, `EarlyWarning`, `ProjectLesson`, `CapabilityProfile`, `Risk`, `DecisionRecord` |
| **Project AI & Guidance** | `ProjectAdvisorPanel.tsx`, `GuidancePanel.tsx`, `DecisionPanel.tsx` | `api.ts`, `socket.ts` | `POST /api/ai/*`, `/api/projects/:id/chat`, `task:decompose` | `omniRoute.js`, `workspaceContextService.js`, `decisionEngine.js`, `projectGuidanceEngine.js` | `AIConversation`, `AIMessage`, `Decision`, `Recommendation`, `TemporaryContext` |
| **Scrum Sprint Lifecycle** | `ScrumOverviewPanel`, `ScrumSetupPlanPanel`, `ScrumTasksPanel`, `ScrumInsightsPanel`, `ScrumRetroPanel` | `scrumApiService.ts` | `/api/scrum/*` (`scrum.js`) | `scrumEngine.js`, `scrumPlanningService.js`, `scrumHealthService.js`, `scrumAnalyticsService.js`, `scrumCapacityEngine.js`, `retrospectiveService.js` | `Sprint`, `Task`, `ScrumHealthSnapshot`, `ScrumSprintSnapshot`, `Retrospective` |
| **Kanban Flow & Policies** | `KanbanOverviewPanel`, `KanbanBoardPanel`, `KanbanBacklogPanel`, `KanbanFlowPanel`, `KanbanTeamPanel`, `KanbanInsightsPanel`, `KanbanPoliciesPanel` | `kanbanApiService.ts` | `/api/kanban/*` (`kanban.js`) | `kanbanEngine.js`, `kanbanWipService.js`, `kanbanFlowMetricsService.js`, `kanbanBottleneckService.js`, `kanbanForecastService.js`, `kanbanHealthService.js` | `Project.kanbanConfig`, `Task`, `ProjectEvent`, `ProjectMemory` (buggy schema) |
| **Classic V1 DAA Workspace** | `ClassicOverviewPanel`, `ClassicTasksPanel`, `ClassicSprintPanel`, `GraphPanel`, `ClassicMembersPanel`, `ChatPanel` | `useTeamTasks`, `useRecommendation`, `useDependencyGraph`, `useChat` | `/api/teams/:id/tasks*`, `/recommend`, `/assign`, `/chats*`, socket `task:*` | `greedyScheduler.js`, `sortAlgorithms.js`, `taskOptimiser.js` (0/1 Knapsack), `graphTraversal.js` (Kahn's), `branchAndBound.js` | `Team`, `Task`, `ChatMessage` |
| **GitHub OAuth & Repo AI** | `GitHubPanel.tsx` | `api.ts` | `/api/github/*` (`github.js`) | `githubService.js` (AES-256-CBC), `repositoryIndexingService.js`, `workspaceContextService.js`, `omniRoute.js` | `OAuthState`, `GitHubCredential`, `GitHubIntegration`, `RepositoryIndex`, `Project` |
| **Team Discovery & Apply** | `DiscoverTeamsModal.tsx`, `ApplyRoleModal.tsx`, `LeaderApplicationsPanel.tsx` | `api.ts`, `useInvitations` | `/api/discovery/*` (`discovery.js`), `/api/invitations/*` (`teams.js`) | `applicationService.js`, `invitationService.js` | `Team`, `TeamApplication`, `TeamApplicationAudit`, `Invitation`, `Notification` |

---

## 6. Diagram 4 — GitHub OAuth & Repository Intelligence Sequence (`CODE VERIFIED`)

```mermaid
sequenceDiagram
    participant UI as "GitHubPanel.tsx"
    participant API as "github.js Router"
    participant DB as "Mongo (OAuthState / GitHubCredential / GitHubIntegration / RepositoryIndex)"
    participant GH as "GitHub REST API"
    participant LLM as "omniRoute.js + workspaceContextService.js"

    UI->>API: "GET /api/github/oauth/url"
    API->>DB: "OAuthState.create({ state, userId, teamId })"
    API-->>UI: "https://github.com/login/oauth/authorize"
    GH-->>API: "GET /api/github/oauth/callback?code&state"
    API->>DB: "OAuthState.consumeState(state)"
    API->>GH: "POST login/oauth/access_token + GET /user"
    API->>DB: "Upsert GitHubCredential (encryptToken AES-256-CBC)"
    UI->>API: "POST /api/github/projects/:id/connect { owner, repo }"
    API->>GH: "validateRepoAccess + fetchRepoSummary"
    API->>DB: "Save GitHubIntegration + indexRepositoryForProject -> RepositoryIndex"
    UI->>API: "POST /api/github/projects/:id/ask { query }"
    API->>LLM: "assembleWorkspaceContext + answerWorkspaceQuery -> omniRouteGenerate"
    LLM-->>API: "Grounded Answer"
    API-->>UI: "200 Response"
```

---

## 7. Diagram 5 — Socket.IO Room & Broadcast Topology (`CODE VERIFIED`)

Client (`client/services/socket.ts`) connects using WebSocket transport with handshake JWT (`socket.handshake.auth.token`). On connect (`server/index.js:256–268`), the server automatically joins `user:${userId}` and `user:${email}` + `chat:global`.

```mermaid
flowchart LR
    SOCK["Socket Connect + JWT Verify (index.js:249-268)"] --> AUTO1["Auto Join user:id & user:email"]
    SOCK --> AUTO2["Auto Join chat:global (chatHandlers.js:13)"]

    JOIN1["Emit room:join (taskHandlers.js:57)"] -->|"verifyTeamAccess"| RT["Room team:teamId"]
    JOIN2["Emit chat:join_team (chatHandlers.js:15)"] -->|"verify team owner/member"| RCT["Room chat:team:teamId + team:teamId"]
    JOIN3["Emit room:join:project (projectSyncHandlers.js:47)"] -->|"verifyProjectAccess"| RP["Room project:projectId + activeProjectId"]

    REST["REST Mutations (projects.js, scrum.js, kanban.js, workstreams21to25.js)"] -->|"Canonical Helpers"| RP
    REST -->|"Canonical Team Emits"| RT
    REST -.->|"Orphan Emits without team: prefix (projects.js)"| ORPH["Missed room bare teamId"]

    S_IN["Inbound task:create / task:update / ai:decompose / task:search"] -->|"recomputeAndBroadcast / aiOrchestrator"| RT
```

**Verified Socket Handler Groups:**
- `server/socket/taskHandlers.js`: `room:join`, `room:leave`, `task:create`, `task:update`, `task:delete`, `task:reorder`, deadline/phase notifications, emits `task:execution-order` & `project:health:updated` / `project:risk:updated`.
- `server/socket/aiOrchestrator.js`: `ai:decompose`, `ai:assign`, `ai:recommend`, `ai:chat`, `task:search` (uses `streamMock()` fallback in `@ai` chat paths).
- `server/socket/projectSyncHandlers.js`: `room:join:project`, `room:leave:project`; exports `broadcastDecisionUpdate`, `broadcastResearchUpdate`, `broadcastArchitectureUpdate`, `broadcastGuidanceUpdate`, `broadcastOpinionUpdate`, `broadcastRiskUpdate`, `broadcastHealthUpdate`, etc.
- `server/socket/chatHandlers.js`: `chat:join_team`, `chat:leave_team`, `chat:global:send`, `chat:team:send` (`chat:global:new`, `chat:team:new`).

---

## 8. Diagram 6 — Workspace Shell Methodology Router (`client/app/team/[teamId].tsx`) (`CODE VERIFIED`)

`client/app/team/[teamId].tsx:155–206, 304–526` resolves `team.methodology` and dynamically swaps navigation tabs and content panels. Notice `NEXUSFLOW` / `V3` alias into `isClassic`, `KANBAN` omits its WIP banner (`L305` negates `!isKanban`), and unmapped `HYBRID` falls through to Waterfall panels while showing `MethodologyWipBanner`.

```mermaid
flowchart TD
    TID["Route team/teamId.tsx"] --> MCHK{"team.methodology (L155-161)"}

    MCHK -->|"CLASSIC / Classic / V3 / v3 / NEXUSFLOW"| CLS["6 Tabs: CLASSIC_PRIMARY_TABS (L111)"]
    MCHK -->|"KANBAN / Kanban"| KAN["9 Tabs: KANBAN_PRIMARY_TABS (L99)"]
    MCHK -->|"SCRUM / Scrum"| SCR["8 Tabs: SCRUM_PRIMARY_TABS (L88)"]
    MCHK -->|"WATERFALL / Default"| WAT["8 Tabs: WATERFALL_PRIMARY_TABS (L77)"]
    MCHK -->|"HYBRID / Unknown"| HYB["Falls back to Waterfall Tabs + MethodologyWipBanner (L305)"]

    CLS --> CP["ClassicOverviewPanel, ClassicTasksPanel, ClassicSprintPanel, GraphPanel, ClassicMembersPanel, ChatPanel"]
    KAN --> KP["KanbanOverview, KanbanBoard, KanbanBacklog, KanbanFlow, KanbanTeam, KanbanInsights, KanbanPolicies, ProjectAdvisor, Chat"]
    SCR --> SP["ScrumOverview, ProjectAdvisor, ScrumTeam, ScrumTasks, ScrumInsights, ScrumRetro, ChatPanel, GitHubPanel"]
    WAT --> WP["OverviewPanel, ProjectAdvisor, AssignmentBoard, TasksPanel, WaterfallTimeline, WaterfallInsights, ChatPanel, GitHubPanel"]

    UNR["Unreachable via normalizeTab (L120): ScrumPlanPanel, ScrumTimelinePanel, RetroPanel, SprintPanel, RecommendationPanel, AnalyticsPanel, TeamHealthPanel"]
    ZERO["12 Zero-Import Components in workspace/: AcademicEvaluation, Conformance, CopilotAttachmentBar, DecisionExplanationDrawer, DigitalTwinCore, DomainIntelligence, FairContribution, ProcessMining, ProjectEventTimeline, ProjectHealth2, SimulationModal, TeacherReviewPortal"]
```

---

## 9. Diagram 7 — Waterfall Plan-to-Tasks & 6-Phase Gate State Machine (`CODE VERIFIED`)

Waterfall phase progression (`projects.js` + `phaseGateService.js` + `taskHandlers.js` + `OverviewPanel` / `WaterfallPhaseCanvas` / `PhaseGateModal` / `ChangeImpactModal`) enforces sequential phase gates before downstream tasks can execute.

```mermaid
stateDiagram-v2
    [*] --> Phase1_Initiation: "Project Created (WATERFALL)"
    Phase1_Initiation --> Phase2_Requirements: "Gate Approved (Leader/Owner)"
    Phase2_Requirements --> Phase3_Design: "Requirements Locked + Gate Approved"
    Phase3_Design --> Phase4_Development: "Architecture / Plan Approved -> Tasks Generated"
    Phase4_Development --> Phase5_Testing: "Implementation Verified + Gate Approved"
    Phase5_Testing --> Phase6_Deployment: "QA & Acceptance Signoff"
    Phase6_Deployment --> [*]

    Phase3_Design --> ChangeImpactReview: "Scope Change Requested (ChangeImpactModal)"
    ChangeImpactReview --> Phase3_Design: "Approved Impact Propagated"
```

---

## 10. Diagram 8 — Scrum Sprint Lifecycle & Completion Safety FSM (`CODE VERIFIED`)

Scrum execution (`scrum.js` + `scrumEngine.js` + `ScrumOverviewPanel` / `ScrumTasksPanel` / `ScrumInsightsPanel`) enforces V4 sprint completion safety (`HTTP 409` warning when incomplete tasks remain in To Do / In Progress / In Review / Blocked rather than silently stripping `sprintId`).

```mermaid
stateDiagram-v2
    [*] --> Backlog: "Decompose / Add Backlog Stories"
    Backlog --> SprintPlanning: "Create Sprint + scrumCapacityEngine Check"
    SprintPlanning --> ActiveSprint: "Start Sprint"
    ActiveSprint --> ActiveSprint: "Move Tasks (To Do -> In Progress -> In Review / Blocked -> Done)"
    ActiveSprint --> CompletionValidation: "Leader Clicks Complete Sprint"
    CompletionValidation --> ActiveSprint: "HTTP 409 Blocked if unfinished tasks exist (Preserve Tasks)"
    CompletionValidation --> SprintCompleted: "All Sprint Tasks Done OR Explicit Resolution"
    SprintCompleted --> RetrospectiveAndSnapshot: "Save ScrumSprintSnapshot + ScrumHealthSnapshot"
    RetrospectiveAndSnapshot --> Backlog: "Next Sprint"
```

---

## 11. Diagram 9 — Kanban Continuous Flow & WIP Policy Pipeline (`CODE VERIFIED`)

Kanban execution (`kanban.js` + `kanbanEngine.js` + `kanbanWipService.js` + `kanbanReactiveEngine.js`) enforces continuous pull limits across configurable `Project.kanbanConfig.workflowColumns`. Note: `kanbanWipService.js:37–38` currently flags `count >= limit` as overloaded, and `kanban.js:192, 203` contains a duplicate `$or` key overwrite leaking cross-project backlog queries.

```mermaid
flowchart LR
    BL["Kanban Backlog (/api/kanban/backlog)"] -->|"evaluateReplenishmentCandidates + DOR"| RDY["Ready Column"]
    RDY -->|"POST /api/kanban/pull"| WIP{"validatePullWip (kanbanWipService.js)"}
    WIP -->|"Under WIP or Authorized Override"| IP["In Progress / In Review / Testing"]
    WIP -->|"WIP Saturated / Overloaded (count >= limit)"| BLK["Blocked Move (400 Violation unless Override)"]
    IP -->|"Pull to Done Column"| DONE["Done (Cycle/Lead Time Captured)"]
    IP -->|"Flagged Blocker"| BLKR["kanbanBlockerService -> Risk"]
    DONE --> MET["kanbanFlowMetricsService + kanbanForecastService + kanbanHealthService"]
    IP -->|"handleKanbanMutation (kanbanReactiveEngine.js)"| EVT["ProjectEvent (Saved) + Socket KANBAN_* + ProjectMemory (Schema Err Ignored)"]
```

---

## 12. Diagram 10 — Classic V1 DAA Engine Pipeline (`CODE VERIFIED`)

Classic workspaces (`CLASSIC_PRIMARY_TABS` + `/api/teams/*` + `taskHandlers.js` + `aiOrchestrator.js`) showcase five foundational DAA algorithms deterministically with zero LLM dependency:

```mermaid
flowchart TD
    IN["Task & Team Inputs (urgency, impact, deps, estHours, skills)"] --> GS["Greedy Priority Scheduler (greedyScheduler.js: 0.50 U + 0.35 I + 0.15 D)"]
    GS --> SORT["Custom DAA Sorts (sortAlgorithms.js: 5 Sorts - Bubble/Merge/Selection/Insertion/Quick)"]
    IN --> DAG["Kahn's Topological Sort + Cycle Detection (graphTraversal.js: O(V+E))"]
    GS --> KS["0/1 Knapsack Sprint Optimizer (taskOptimiser.js: O(n*W) DP)"]
    IN --> BB["Branch & Bound Member Assignment (branchAndBound.js: Skill Fit - Workload Penalty)"]
    IN --> BM["Boyer-Moore Bad-Character Search (taskOptimiser.js & client/utils/boyerMoore.ts)"]

    SORT --> UI1["ClassicTasksPanel (All / Priority / Deadline / Progress)"]
    KS --> UI2["ClassicSprintPanel & daa-insights.tsx"]
    DAG --> UI3["GraphPanel & Execution Order"]
    BB --> UI4["ClassicMembersPanel & AssignmentBoard"]
```

---

## 13. Diagram 11 — Hybrid Engine Backend vs Frontend Execution Gap (`CODE VERIFIED`)

```mermaid
flowchart LR
    API["POST /api/hybrid/* (hybrid.js)"] --> ENG["hybridEngine.js (4 Coherent Templates)"]
    ENG --> TPL1["Waterfall Plan + Scrum Execution"]
    ENG --> TPL2["Waterfall Gov + Kanban Execution"]
    ENG --> TPL3["Scrum Plan + Kanban Execution"]
    ENG --> TPL4["Waterfall Plan + Kanban Execution"]

    UI["Client team/[teamId].tsx:155-161"] -->|"No isHybrid Branch"| FALL["Renders Waterfall Panels + MethodologyWipBanner (L305)"]
```

---

## 14. Diagram 12 — AI Cascade (`omniRoute.js`), Mock Stub & Socket Fallback (`CODE VERIFIED`)

```mermaid
flowchart TD
    C1["REST Project AI / Copilot / Repo Ask"] --> OMN["omniRoute.js ($0 Fail-Closed Cascade)"]
    OMN --> T1["Tier 1: FREE_GEMINI_MODELS (5 Models)"]
    T1 -->|"Quota / Error"| T2["Tier 2: FREE_GROQ_MODELS (8 Models)"]
    T2 -->|"Quota / Error"| T3["Tier 3: FREE_OPENROUTER_FALLBACK_MODELS (openrouter/free)"]
    T3 -->|"All Exhausted"| NONE["provider: 'none' ($0.00 Graceful Unavail -> Copilot Bug HTTP 500)"]

    C2["WS 23 POST /decisions/:id/ai-summary (workstreams21to25.js:373)"] --> STUB["decisionIntelligenceService.js:278 -> aiProviderAbstraction.js STUB (Fake Gemini Text)"]
    C3["Socket @ai Chat (aiOrchestrator.js)"] -->|"Fallback Path"| SM["streamMock() Synthetic Reply"]
    C4["Requirements / Academic Research / Multimodal / Scrum Decompose (scrum.js:3439)"] --> DET["100% Deterministic Logic (No LLM Call)"]
```

---

## 15. Diagram 13 — 42-Model MongoDB ER Map by Domain Cluster (`CODE VERIFIED`)

```mermaid
erDiagram
    USER ||--o{ TEAM : owns
    USER ||--o{ SKILL_VERIFICATION : verifies
    USER ||--o{ GITHUB_CREDENTIAL : authorizes
    USER ||--o{ PASSWORD_RESET : requests
    TEAM ||--o{ PROJECT : hosts
    TEAM ||--o{ INVITATION : sends
    TEAM ||--o{ TEAM_APPLICATION : receives
    TEAM ||--o{ CHAT_MESSAGE : discusses
    TEAM ||--o{ TEAM_DEPARTURE : records
    PROJECT ||--o{ TASK : contains
    PROJECT ||--o{ SPRINT : plans
    SPRINT ||--o{ TASK : scopes
    TASK ||--o{ TASK : depends_on

    PROJECT ||--o{ RESEARCH_ITEM : gathers
    PROJECT ||--o{ ARCHITECTURE_COMPONENT : defines
    PROJECT ||--o{ RESOURCE : stores
    PROJECT ||--o{ AI_CONVERSATION : opens
    AI_CONVERSATION ||--o{ AI_MESSAGE : logs
    PROJECT ||--o{ TEMPORARY_CONTEXT : buffers

    PROJECT ||--o{ GITHUB_INTEGRATION : binds
    PROJECT ||--o{ REPOSITORY_INDEX : indexes
    OAUTH_STATE }o--|| USER : csrf_binds

    PROJECT ||--o{ DECISION : tracks
    DECISION ||--o{ DECISION_FEEDBACK : receives
    PROJECT ||--o{ DECISION_RECORD : explains
    PROJECT ||--o{ RECOMMENDATION : stores
    PROJECT ||--o{ OPINION : records
    PROJECT ||--o{ RISK : monitors
    PROJECT ||--o{ EARLY_WARNING : alerts
    PROJECT ||--o{ PROJECT_MEMORY : remembers
    PROJECT ||--o{ PROJECT_EVENT : emits
    PROJECT ||--o{ PROJECT_LESSON : learns
    PROJECT ||--o{ LEARNING_INSIGHT : extracts

    PROJECT ||--o{ TEAM_HEALTH : snapshots
    PROJECT ||--o{ SCRUM_HEALTH_SNAPSHOT : snapshots
    PROJECT ||--o{ SCRUM_SPRINT_SNAPSHOT : snapshots
    PROJECT ||--o{ CAPABILITY_PROFILE : profiles
    PROJECT ||--o{ RETROSPECTIVE : reviews
    PROJECT ||--o{ TEACHER_REVIEW : evaluates
    PROJECT ||--o{ ACADEMIC_RUBRIC : grades
    PROJECT ||--o{ CONTRIBUTION_DISPUTE : arbitrates
    TEAM_APPLICATION ||--o{ TEAM_APPLICATION_AUDIT : audits
    USER ||--o{ NOTIFICATION : notified_via
```

---

## 16. Diagram 14 — Health 2.0, Early Warnings, Risk & Learning Closed Loop (`CODE VERIFIED`)

```mermaid
flowchart LR
    STATE["Live Project State (Tasks, Sprints, Members, Deps)"] --> PH2["projectHealth2Service.js + unifiedProjectHealthService.js"]
    STATE --> RSK["riskEngine.js / scrumRiskEngine.js"]
    PH2 --> EW["EarlyWarning Model + Warnings REST (/warnings/*)"]
    STATE --> LR["projectLearningService.js (Evidence -> Candidate -> Validated -> Applied)"]
    STATE --> CAP["capabilityIntelligenceService.js (Gap Analysis + Dynamic Reassignment)"]
    CAP -->|"Leader Accept (assign + ProjectEvent)"| STATE
    EW -->|"Acknowledge / Resolve / Dismiss + Reason"| STATE
    RSK -->|"Risk Status Update"| STATE
    PH2 -->|"Socket projectSyncHandlers"| UI["WaterfallInsightsPanel & ScrumInsightsPanel"]
    RSK -->|"Socket projectSyncHandlers"| UI
    CAP -->|"Socket projectSyncHandlers"| UI
```

*(Note: In `unifiedProjectHealthService.js:491`, `requirementsDim` currently contributes `0.00` weight to the composite score despite appearing in the 9-dimension array.)*

---

## 17. Diagram 15 — Workstreams 11–25: Backend Services vs Mounted/Orphaned UI (`CODE VERIFIED`)

```mermaid
flowchart LR
    subgraph Mounted_V4_UI ["Mounted in Workspace Shell (client/app/team/[teamId].tsx)"]
        U1["CapabilityIntelligencePanel (via WaterfallInsightsPanel)"]
        U2["ProjectLearningPanel (via WaterfallInsightsPanel)"]
        U3["UnifiedProjectHealthPanel (via WaterfallInsightsPanel)"]
    end

    subgraph Zero_Import_UI ["12 Zero-Import Workspace Components"]
        Z1["AcademicEvaluationPanel & TeacherReviewPortal & FairContributionPanel"]
        Z2["DomainIntelligencePanel & DigitalTwinCore & SimulationModal"]
        Z3["ConformancePanel & ProcessMiningPanel & ProjectEventTimeline"]
        Z4["ProjectHealth2Panel & DecisionExplanationDrawer & CopilotAttachmentBar"]
    end

    subgraph Active_Backend ["Backend Routes & Services (projects.js / workstreams21to25.js)"]
        B1["capabilityIntelligenceService.js"] --> U1
        B2["projectLearningService.js"] --> U2
        B3["unifiedProjectHealthService.js"] --> U3
        B4["academicEvaluationService, teacherReviewService, fairContributionService"] -.->|"Unwired in Router"| Z1
        B5["domainMethodologyResolver, domainIntelligenceService, digitalTwinService, simulationEngine"] -.->|"Unwired in Router"| Z2
        B6["workflowConformanceEngine, processMiningEngine, eventService"] -.->|"Unwired in Router"| Z3
        B7["projectHealth2Service, decisionIntelligenceService, copilotAttachmentService"] -.->|"Unwired in Router"| Z4
    end
```

---

## 18. Diagram 16 — Trust Boundaries & Critical Attack Surface Map (`CODE VERIFIED`)

```mermaid
flowchart TD
    EXT["Untrusted Internet / Logged-in Attacker"] -->|"No Rate Limit + 15MB JSON"| GW["Express + Socket Gateway"]

    GW -->|"Forged JWT if JWT_SECRET unset"| F1["CRIT-01: server/auth.js:3"]
    GW -->|"PATCH /api/me Name = Victim Name"| F2["CRIT-02: teams.js / projects.js Display-Name Spoof"]
    GW -->|"Target Empty Team / No project.teamId"| F3["CRIT-03: workstreams21to25.js:104 isLeader=true Fallthrough"]
    GW -->|"Enumerate projectId on 18 Intel Routes"| F4["CRIT-04: projects.js:2803-3195 Missing findProject"]
    GW -->|"Call POST/DELETE sprint items or GET analytics"| F5["CRIT-05: scrum.js:1374,1395,2281 Missing verifyProjectAccess"]
    GW -->|"Pass Controlled projectId + Victim childId"| F6["CRIT-06: workstreams21to25.js Child IDORs + applyLesson"]
    GW -->|"GET /api/kanban/backlog/:myProjectId"| F7["DB-CRIT-01: kanban.js:192,203 $or Key Overwrite Leaks All Tenants"]
    GW -->|"PATCH /api/teams/:id/members/:me role='leader'"| F8["CRIT-08: teams.js:1831 Self-Promote & Student Faculty Forgery"]
```

---

## 19. Cross-References

- Security vulnerabilities & defect remediations: [`NEXUSFLOW_TECHNICAL_RISKS.md`](./NEXUSFLOW_TECHNICAL_RISKS.md)
- Methodology & Phase 8 feature completion audit: [`NEXUSFLOW_FEATURE_STATUS.md`](./NEXUSFLOW_FEATURE_STATUS.md)
- Complete 428-endpoint REST & Socket reference: [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md)
- Complete 481-file repository inventory: [`NEXUSFLOW_FILE_INDEX.md`](./NEXUSFLOW_FILE_INDEX.md)
