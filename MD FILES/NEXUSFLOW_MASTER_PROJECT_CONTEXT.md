# NEXUSFLOW — Master Project Context & Authoritative Engineering Reference

**Repository:** `p:/DAA OPTIONAL` (Git Branch: `version4.0`)  
**Audit Standard:** Strictly verified against repository source code (`CODE VERIFIED`), scripts, schemas, and configurations. Zero invented claims; zero `.env` or secret leaks.  
**Suite Index:**
- [`NEXUSFLOW_FILE_INDEX.md`](./NEXUSFLOW_FILE_INDEX.md) — Complete `481`-file inventory
- [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md) — Complete `428`-declaration REST + Socket.IO contract manual
- [`NEXUSFLOW_ARCHITECTURE_MAP.md`](./NEXUSFLOW_ARCHITECTURE_MAP.md) — End-to-end Screen→DB flows & `16` Mermaid diagrams
- [`NEXUSFLOW_FEATURE_STATUS.md`](./NEXUSFLOW_FEATURE_STATUS.md) — V1→V4 & `22` Phase 8 intelligence feature status matrix
- [`NEXUSFLOW_TECHNICAL_RISKS.md`](./NEXUSFLOW_TECHNICAL_RISKS.md) — `26` security findings, DAA/AI/DB bugs, test hazards & P0–P3 fixes
- [`NEXUSFLOW_AI_HANDOFF_CONTEXT.md`](./NEXUSFLOW_AI_HANDOFF_CONTEXT.md) — Concise AI & engineer onboarding cheat-sheet

---

## Phase Zero — Repository Identity & Quantitative Footprint

### 1. System Identity & Evolution
NEXUSFLOW (`NexusFlow - A Project Mgmt System`) began as an academic **Design & Analysis of Algorithms (DAA)** team/task optimizer (V1) and grew across four versions into a full-stack project management, GitHub intelligence, multi-methodology lifecycle (`WATERFALL`, `SCRUM`, `KANBAN`, `CLASSIC`, backend `HYBRID`), and project health/learning platform powered deterministically by DAA algorithms alongside the `$0`-cost **OmniRoute** AI cascade.

### 2. Canonical Codebase Inventory (`481` Files)
| Layer / Directory | Verified File Count | Highlights |
| --- | :---: | --- |
| Root / Tooling / `docs/` / Assets / `MD FILES/` | **88** | `package.json`, `5` `docs/*.md`, `2` PDFs, `6` PNGs, `57` `MD FILES/*.md`, root specs/bat/logs (`CODE VERIFIED`) |
| `client/` | **142** | `14` `app/` routes, `96` component files, `11` `hooks/` files (`10` hooks + `mergeSort.test.ts`), `3` `services/`, `5` `utils/`, `context/`, `constants/`, `theme.ts` |
| `server/` | **251** | `6` root JS/JSON, `1` `__tests__/`, `8` `algorithms/`, `2` `config/`, `2` `constants/`, `1` `data/`, `42` `models/`, `13` `routes/`, `103` `scripts/`, `65` `services/`, `4` `socket/`, `4` `utils/` |
| **Total Repository Files** | **481** | Verified in `NEXUSFLOW_FILE_INDEX.md` |

### 3. Technology Stack & Package Dependencies
- **Frontend (`client/package.json`):** Expo `~51.0.0`, Expo Router `~3.5.0`, React `18.2.0`, React Native `0.74.5`, React Native Web `~0.19.10`, TypeScript `~5.3.3`, Three.js `^0.185.1` (`@types/three`), `@xyflow/react ^12.11.2`, `@dagrejs/dagre ^3.0.0`, `gsap ^3.15.0`, `socket.io-client ^4.7.5`, `@expo/vector-icons ^14.0.0`, `expo-secure-store ~13.0.0`.
- **Backend (`server/package.json`):** Node ESM (`"type": "module"`), Express `^4.19.2`, Mongoose `^8.4.0`, Socket.IO `^4.7.5`, `jsonwebtoken ^9.0.2`, `bcryptjs ^3.0.3`, `cors ^2.8.5`, `dotenv ^16.4.5`. *(Notable absence: no `express-rate-limit` in dependencies; `server/utils/rateLimiter.js` exists unused globally.)*

---

## Phase One — Core Runtime Boot, Auth & Identity

### 4. Server Entry & Middleware Order (`server/index.js:43–283`)
1. `cors(...)` allows `[FRONTEND_URL, "http://localhost:8081", "http://localhost:19006", "http://localhost:8082", "http://localhost:3000"]` with `credentials: true` (`L44`).
2. `express.json({ limit: "15mb" })` parses large base64 avatar/attachment JSON bodies globally (`L45`).
3. Direct app routes (`L48–227`, `9` route declarations): root redirect `/`, `/api/auth/signup`, `/api/signup`, `/api/login`, `/api/me`, `/api/users/profile`, `/api/user/profile`.
4. `13` modular routers mounted on `/api` + **dual mount of `projectRoutes` on both `/api` (`L235`) and `/` (`L236`)**, plus router-level `requireAuth` only on `/api/scrum`, `/api/kanban`, `/api/hybrid` (`L239–241`).
5. Socket.IO binds on `http.createServer(app)` (`L244–245`) with a narrower CORS origin list (`[FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"]`, missing `:8082` and `:3000`).
6. If `mongoose.connect(MONGO_URI)` fails (`L279–283`), Express/Socket still bind in degraded `(no DB)` mode rather than failing fast.

### 5. Authentication & Session Model (`server/auth.js`, `server/routes/auth.js`)
- **JWT Signing (`server/auth.js:3–19`):** Signs `{ id, email, name }` (`7d` expiry). **Critical defect:** hardcodes fallback secret `"nexusflow-production-jwt-secret-key-2026"` when `JWT_SECRET` is unset.
- **Password Storage (`server/models/User.js`):** Real `bcryptjs` password hashing (`pre` save hook + `User.methods.comparePassword`), `password` has `select: false`.
- **Google OAuth (`server/routes/auth.js:30–95+`):** Uses in-memory `oauthStateStore` (`Map` with `5`-min TTL) rather than persisted `OAuthState`, lacks strict `aud` and `email_verified` enforcement, and redirects JWT in URL query parameter to `FRONTEND_URL`.
- **Password Reset (`PasswordReset.js`, `routes/auth.js:188, 263`):** Security audit flagged missing hardening in token expiry/reuse verification (`[SEC-HIGH-09]`).

### 6. Identity Resolution Pitfalls Across Codebase
- JWT payload uses `id`, **not** `_id` (`auth.js:7`). Handlers referencing `req.user._id` without fallback (`discovery.js`) receive `undefined`.
- `TeamSchema` (`server/models/Team.js:15–26`) uses `ownerId` + `members[].userId` + `members[].role` (`"leader" | "manager" | "member"`). Code checking `team.leaderId` (`scrum.js:680`, `phaseGateService.js:545, 650`) reads a nonexistent property.
- **Critical auth bypass (`[SEC-CRIT-02]`):** `teams.js:87, 118, 2835`, `projects.js:170–180`, `scrum.js:121`, `hybrid.js:70`, `invitationService.js:65`, and `taskHandlers.js:57` still fall back to matching `members[].name === user.name`, exploitable via `PATCH /api/me`.

---

## Phase Two — Data Architecture (`42` Mongoose Models)

### 7. Schema Conventions & Lifecycle Hooks (`42/42` Verified)
- Every model enables `{ timestamps: true }`, uses default Mongoose collection names (`0` custom collection names, `0` altered `strict` flags).
- `1` virtual property: `ProjectMemory.workspaceId`.
- `3` `pre` hooks across the entire suite (`User`, `Project`, `Task`), `0` `post` hooks.
- Custom model helpers: `UserSchema.methods.comparePassword`, `OAuthStateSchema.statics.consumeState`.
- `4` export-guarded hot-reload models (`mongoose.models.X || mongoose.model(...)`): `ProjectLesson`, `Risk`, `ScrumHealthSnapshot`, `ScrumSprintSnapshot`.

### 8. Complete Domain-Clustered Model Inventory (`42` Models)
1. **Core Workspace & Execution (`6`):** `User.js`, `Team.js`, `Project.js`, `Task.js`, `Sprint.js`, `PasswordReset.js`
2. **Collaboration, Access & Discovery (`6`):** `Invitation.js`, `Notification.js`, `ChatMessage.js`, `TeamDeparture.js`, `TeamApplication.js`, `TeamApplicationAudit.js`
3. **GitHub & OAuth Integration (`4`):** `OAuthState.js`, `GitHubCredential.js`, `GitHubIntegration.js`, `RepositoryIndex.js`
4. **AI Copilot & Workspace Context (`6`):** `AIConversation.js`, `AIMessage.js`, `ResearchItem.js`, `ArchitectureComponent.js`, `Resource.js`, `TemporaryContext.js`
5. **Project Memory, Events, Learning & Decisions (`7`):** `ProjectMemory.js`, `ProjectEvent.js`, `ProjectLesson.js`, `LearningInsight.js`, `Decision.js`, `DecisionFeedback.js`, `DecisionRecord.js`
6. **Health, Risk, Warnings & Advisory (`7`):** `TeamHealth.js`, `ScrumHealthSnapshot.js`, `ScrumSprintSnapshot.js`, `Risk.js`, `EarlyWarning.js`, `Opinion.js`, `Recommendation.js`
7. **Capability, Retrospectives & Academic Evaluation (`6`):** `SkillVerification.js`, `CapabilityProfile.js`, `Retrospective.js`, `TeacherReview.js`, `AcademicRubric.js`, `ContributionDispute.js`

### 9. Critical Database & Schema Inconsistencies
- **Kanban `$or` Key Overwrite (`server/routes/kanban.js:192, 203, 729`):** Duplicate `$or` literal property silently drops `{ $or: [{ projectId }, { teamId }] }`, querying **all tenants globally**.
- **`ProjectMemory` Validation Drop (`server/services/kanbanReactiveEngine.js:84–102`):** Passes legacy keys (`type: "event"`, `author`, `title`) failing `ProjectMemory` schema rules (`category`, `createdBy`, `scope`), silently caught by `try/catch`.
- **Legacy Migration Enum Bug (`server/scripts/migratePhase1.js:120`):** Sets `currentPhase: "planning"` when `tasksToBackfill === 0`, violating `Project.currentPhase` enum values.
- **Task Scoping Dual Fields (`server/models/Task.js:34–35` & `projects.js:598`):** `Task` defines both `projectId` and `project` alongside `teamId`, forcing repeated `$or` queries across services.

---

## Phase Three — Deterministic DAA Engines & Algorithms

### 10. Authoritative Design Rule: DAA Never Acts as AI Fallback
Across NEXUSFLOW V2–V4, all numerical priorities, health scores, DAG dependency orders, sprint optimizations, risk fingerprints, capability gap scores, and methodology advisories are computed **deterministically** with zero LLM calls (`CODE VERIFIED`). AI/OmniRoute produces qualitative explanations, extractions, and chat advisory only.

### 11. Exact `server/algorithms/` Suite (`8` Modules) + `sortAlgorithms.js` + `boyerMoore.ts`
| Module | Core Algorithm(s) | Documented / Actual Complexity | Key Formula / Caveats (`CODE VERIFIED`) |
| --- | --- | --- | --- |
| `greedyScheduler.js` | **GreedyPriorityScheduler** + custom recursive Merge Sort | `O(1)` score / `O(n log n)` sort | **Default weights:** `0.50` urgency + `0.35` impact + `0.15` `min(depCount, 20)/20`. *(Docs often misstate `0.40/0.35/0.25` or `0.40/0.40/0.20`.)* |
| `taskPriorityEngine.js` | **Task Intelligence 2.0** (7-factor weighted priority) | `O(n log n)` ranking + deterministic tie-breakers | `greedy 0.35`, `deadline 0.20`, `value 0.15`, `risk 0.10`, `depth 0.10`, `skillGap 0.05`, `overload 0.05`. **BUG (`L95`):** double-multiplies `W_GREEDY`, capping `greedyFactor` at **`75/100`**! |
| `taskOptimiser.js` | **GreedySprintRanking** + **0/1 Knapsack DP** + delegates Kahn/BFS + Merge Sort + Boyer-Moore-Horspool | `O(n * W)` DP (`O(n log n)` ROI, `O(n/m)` avg search) | Solves ROI sprint subset selection within capacity `W`; distinct from `greedyScheduler.js` ordering. |
| `graphTraversal.js` | **DFS**, **BFS**, **Kahn's Topological Sort** + cycle detection | `O(V + E)` time, `O(V)` space | Canonical single source of truth shared by REST dependency graph routes, `taskHandlers.js` sockets, and `taskOptimiser.js`. |
| `branchAndBound.js` | **Branch & Bound Bijective Assignment** + greedy surplus fallback | `O(n! / pruning)` worst (`O(n^2–n^3)` typical `n<=20`) | Minimizes skill-gap `Sum max(0, demand - skill)` across `6` skills (`frontend, backend, devops, design, ml, testing`) with title/category skill-demand inference (`L47–60`). |
| `decisionEngine.js` | **Multi-Mode Task Decision Evaluator** | Delegates to `rankTasks` | **BUG (`L374–398`):** resolves mode `weightOverrides` for factor explanations (`L431–439`) **without passing them** to `rankTasks(tasks, engineContext)` (`L398`). |
| `projectDecomposer.js` | **Keyword-Signal Deterministic Backlog Generator** | `O(tokens)` | Detects domain signals (`hardware, ai, realtime, security, payments, analytics`) + feature nouns; single decomposer reused by team creation and socket decomposition. |
| `projectGuidanceEngine.js` | **Student Project Copilot Deterministic Advisor** | Combines Greedy + Knapsack + Kahn + B&B + Merge + Boyer-Moore | Generates domain detection, hardware/software BOM detection (`HARDWARE_RULES`), and Hackathon Mode slicing without LLMs. |
| `sortAlgorithms.js` (`server/utils/`) | **5 Instrumented Comparison Sorts** | Bubble/Selection/Insertion `O(n^2)`; Merge/Quick `O(n log n)` avg | Powers `compareSortAlgorithms()` benchmarking on `dae`/`daa-insights`. *(Contradicts doc claims of `6`/`8`/`9` sorts.)* |
| `client/utils/boyerMoore.ts` & `client/hooks/useTeamTasks.ts` | Client **Boyer-Moore** search + **Merge Sort** | Sub-linear avg / `O(n log n)` | Client-side interactive filtering/sorting paired with `client/hooks/mergeSort.test.ts`. |

### 12. Deterministic Scoring Engines (`server/services/`) & Known Weight Defects
- **`unifiedProjectHealthService.js` + `projectHealth2Service.js`:** Defines `9` dimensions (`delivery`, `schedule`, `capacity`, `dependencies`, `risk`, `skill`, `requirements`, `process`, `quality`), with severity caps (`45`/`48`/`54`) at `L518–524`. **BUG (`L491–500`):** weighted formula excludes `requirementsDim` (`0.00` effective weight).
- **`riskEngine.js`:** Deterministic 12-category scanner (`overdue_tasks`, `approaching_deadline`, `blocked_tasks`, `dependency_cascade`, `unassigned_high_priority`, `member_overload`, `skill_gap`, `sprint_capacity`, `stalled_progress`, `high_priority_unfinished`, `workload_imbalance`, `github_inactivity`) with FNV-1a `fingerprint` (`L33`) deduplication; double-emits deadline & overload findings across category pairs.
- **`kanbanWipService.js` (`L37–38`):** Marks `count >= limit` as BOTH `isSaturated` AND `isOverloaded`, penalizing boards cleanly at their exact WIP limit alongside `kanbanHealthService`.
- **`scrumEngine.js` (`L721`) vs `scrumHealthService.js`:** Two divergent Scrum health computations exist in backend services; `/api/scrum/:projectId/health` invokes `computeScrumHealth`.

---

## Phase Four — AI Architecture & OmniRoute `$0` Policy

### 13. Strict `$0`-Cost OmniRoute Cascade (`server/services/omniRoute.js`)
Enforces zero API billing via `validateZeroCostRoute(provider, model)` (`ZeroCostViolationError` fail-closed guard):
1. **Tier 1 — Google Gemini Free (`FREE_GEMINI_MODELS`, `5` models):** `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-flash-8b`.
2. **Tier 2 — Groq Free Tier (`FREE_GROQ_MODELS`, `8` models):** `qwen/qwen3.8-27b`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gemma2-9b-it`, `mixtral-8x7b-32768`, `llama-3.1-70b-versatile`.
3. **Tier 3 — OpenRouter Free (`FREE_OPENROUTER_FALLBACK_MODELS`, `1` entry + `:free` suffix):** `openrouter/free`.
4. **Exhaustion (`provider: "none"`):** Returns `$0.00` graceful unavailable response — never falls back to DAA for AI prose.

### 14. AI Stubs, Fallbacks & Context Builders
- **`[AI-CRIT-01]` Mock Stub Leak in Production WS 23:** `decisionIntelligenceService.js:28, 278` calls `executeAiQuery()` from `aiProviderAbstraction.js`, which returns synthetic placeholder strings (`[Gemini Response] Advisory analysis for: ...`) rather than calling `omniRoute.js`.
- **REST Copilot 500 & Socket `streamMock()`:** REST Copilot surfaces HTTP `500` on `provider: "none"`, while Socket `@ai` chat paths (`aiOrchestrator.js`) still invoke `streamMock()`.
- **Deterministic Services Mislabelled "AI":** `requirementService.js`, `academicResearchService.js`, `multimodalCopilotService.js` (scaffolding only), and Scrum decomposition at `scrum.js:3439` run deterministically without LLMs.
- **`7` Overlapping Context Builders:** `workspaceContextService.js`, `aiContextBuilder` / `projectContextBuilder.js`, `projectMemoryContext.js`, etc. assemble workspace prompts without strict prompt-injection delimiters (`[SEC-LOW-25]`) and with `TemporaryContext` TTL/cross-user scoping gaps (`[AI-HIGH-04]`).

---

## Phase Five — API Surface (`428` Declarations) & Real-Time Sockets

### 15. Express Router Architecture (`server/index.js` + `13` Route Modules)
- **Exact Declaration Count:** **`428`** route handlers (`9` in `index.js`, `2` `ai.js`, `5` `auth.js`, `8` `chat.js`, `12` `discovery.js`, `12` `github.js`, `6` `hybrid.js`, `44` `kanban.js`, `140` `projects.js`, `121` `scrum.js`, `6` `skills.js`, `41` `teams.js`, `1` `userLookup.js`, `21` `workstreams21to25.js`).
- **Dual-Mount Behavior:** `projects.js` is mounted on `/api` (`L235`) AND `/` (`L236`), doubling effective URL entry points and causing `/api/api/...` prefix bugs on nested memory routes (`L3590–3875`).
- Full route-by-route catalog, payloads, auth gaps, and `12` FE↔BE mismatches live in [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md).

### 16. Socket.IO Real-Time Transport (`server/socket/` — `4` Modules)
- **Rooms:** Auto-joined `user:${id}`, `user:${email}`, `chat:global`; on-demand verified rooms `team:${teamId}`, `chat:team:${teamId}`, `project:${projectId}` + `project:${activeProjectId}`.
- **Modules:** `taskHandlers.js` (`278` lines — tasks + Kahn recompute + Waterfall phase gate check + risk/health notify), `aiOrchestrator.js` (`504` lines — `ai:decompose/assign/recommend/chat` + Boyer-Moore `task:search`), `projectSyncHandlers.js` (`95` lines — `project:*:updated` broadcasters), `chatHandlers.js` (`108` lines — global & team chat).
- **Orphan Emits:** Some REST handlers emit to bare `${teamId}` instead of `team:${teamId}`, silently dropping client updates.

---

## Phase Six — Client Application Architecture (`142` Files)

### 17. Screens & Navigation (`client/app/` — `14` Files)
- `(auth)/`: `login.tsx`, `signup.tsx`, `forgot-password.tsx`
- `(tabs)/`: `_layout.tsx`, `dashboard.tsx` (teams, discovery, invites), `profile.tsx`
- Workspace & standalone pages: `_layout.tsx`, `index.tsx`, `team/[teamId].tsx`, `global-chat.tsx`, `daa-insights.tsx`, `docs.tsx` (`5/12` sections active), `skill-graph.tsx`, `skill-verification.tsx`.

### 18. Workspace Shell Switchboard (`client/app/team/[teamId].tsx`)
- **Waterfall (`WATERFALL_PRIMARY_TABS` — `8` tabs):** `overview`, `advisor`, `team`, `tasks`, `timeline`, `insights`, `chat`, `github`.
- **Scrum (`SCRUM_PRIMARY_TABS` — `8` tabs):** `overview`, `advisor`, `team`, `tasks`, `insights`, `retro`, `chat`, `github`.
- **Kanban (`KANBAN_PRIMARY_TABS` — `9` tabs):** `overview`, `tasks` (`Board`), `plan` (`Backlog`), `timeline` (`Flow`), `team`, `insights`, `policies`, `advisor`, `chat`.
- **Classic (`CLASSIC_PRIMARY_TABS` — `6` tabs):** `overview`, `tasks`, `sprint`, `graph`, `members`, `chat`. `NEXUSFLOW` / `V3` strings force `isClassic = true` (`L161`).
- **Hybrid / Unknown (`L305`):** Renders `MethodologyWipBanner` + Waterfall panel set. (Notice `L305` `!isKanban` hides the banner for Kanban.)

### 19. Client Hooks (`10`) & Service Wrappers (`3` + `5` Utils)
- **Hooks (`client/hooks/`):** `useTeam`, `useTeams`, `useTeamTasks`, `useChat`, `useDependencyGraph`, `useInvitations`, `useRecommendation`, `useReminders`, `useTaskAnalytics`, `useWaterfallPlanLifecycle`.
- **Transport & Helpers:** `client/utils/api.ts`, `client/services/scrumApiService.ts`, `kanbanApiService.ts`, `socket.ts`, `client/utils/{boyerMoore.ts, markdownParser.ts, methodologyConfig.ts, storage.ts}`.

---

## Phase Seven — Methodologies & Lifecycle State Machines

### 20. Methodology Registry & Environment Gating (`server/config/methodologyAvailability.js`)
- Always available in production: `WATERFALL`, `CLASSIC`, `NEXUSFLOW`.
- `SCRUM`: Controlled by `METHODOLOGY_RELEASE_CHANNEL` (`development` vs `production`), `SCRUM_PRODUCTION_ENABLED="true"`, or `ENABLE_EXPERIMENTAL_METHODOLOGIES="true"`.
- `KANBAN` & `HYBRID`: Blocked in production (`NODE_ENV=production` / `channel=production`), requiring `ENABLE_EXPERIMENTAL_METHODOLOGIES="true"` in dev.
- Historical projects under Scrum/Kanban/Hybrid remain readable for existing teams.

### 21. Waterfall Lifecycle & Phase Gating (`phaseGateService.js`, `OverviewPanel.tsx`)
- 6 sequential phases (`requirements`, `design`, `implementation`, `testing`, `deployment`, `maintenance`).
- Artifact upload / requirement extraction → Plan finalization → Phase gate approval → Execution unlock (`assertWaterfallTaskExecutable` enforced across REST & `taskHandlers.js` sockets).
- `WaterfallInsightsPanel.tsx` renders `5` subtabs (`Project Health` via `UnifiedProjectHealthPanel`, `Learning Loop` via `ProjectLearningPanel`, `Capability` via `CapabilityIntelligencePanel`, `Risk Radar` via `RiskPanel`, `Dependency DAG` via `GraphPanel`).

### 22. Scrum Lifecycle & V4 Fixes (`scrum.js`, `scrumEngine.js`, `ScrumInsightsPanel.tsx`)
- Story generation/backlog -> Sprint creation -> Capacity check (`scrumCapacityEngine.js`) -> Sprint execution (`ScrumTasksPanel.tsx` with universal page/board scrolling) -> Sprint completion safety (`409` block if incomplete To Do / In Progress / In Review / Blocked tasks remain) -> Retrospective (`ScrumRetroPanel.tsx`) & snapshots (`ScrumSprintSnapshot`, `ScrumHealthSnapshot`).
- `ScrumInsightsPanel.tsx` renders `5` subtabs (`health`, `analytics`, `capability` [with bulk-accept], `risks`, `dag`) despite its top header comment saying `6`.

### 23. Kanban Continuous Flow (`kanban.js`, `kanbanEngine.js`) & Hybrid Engine (`hybridEngine.js`)
- Kanban models configurable workflow columns (`backlog`, `ready`, `in_progress`, `in_review`, `testing`, `done`), DoR/DoD, pull moves with optional override, WIP limits (`kanbanWipService.js`), cycle/lead time, bottlenecks, & Monte Carlo forecasting (`kanbanForecastService.js`).
- Hybrid defines `4` validated templates (`waterfall_planning_scrum_execution`, `waterfall_governance_kanban_execution`, `scrum_planning_kanban_execution`, `waterfall_planning_kanban_execution`) on the backend (`hybridEngine.js`), without dedicated Hybrid frontend panels yet.

### 24. Project Templates (`server/data/projectTemplates.js` — `7` Templates)
`ai-irrigation` (`IoT`, `WATERFALL`), `project-management` (`Web Application`, `SCRUM`), `phishshield` (`Cybersecurity`, `WATERFALL`), `kavach` (`IoT`, `WATERFALL`), `ecommerce` (`Web Application`, `SCRUM`), `hospital-mgmt` (`Web Application`, `WATERFALL`), `ai-learning` (`AI`, `SCRUM`).

---

## Phase Eight — V4 Intelligence & Workstreams 11–25 Audit

### 25. End-to-End Wired V4 Subsystems
- **Mounted & Operational (`COMPLETE`):** `CapabilityIntelligencePanel` (`WS 22`), `ProjectLearningPanel` (`WS 21`), `UnifiedProjectHealthPanel` (health consolidation in `WaterfallInsightsPanel`), plus Scrum Insight capabilities/analytics.
- **Classic V1 Restoration:** `ClassicGuideBanner` + `ClassicGuideModal` on `ClassicOverviewPanel` + 4-tab `ClassicTasksPanel` (`All`, `Priority`, `Deadline`, `Progress`).

### 26. Unmounted UI Components (`12` Zero-Import Panels) & Backend-Only Intelligence
- `AcademicEvaluationPanel`, `ConformancePanel`, `CopilotAttachmentBar`, `DecisionExplanationDrawer`, `DigitalTwinCore`, `DomainIntelligencePanel`, `FairContributionPanel`, `ProcessMiningPanel`, `ProjectEventTimeline`, `ProjectHealth2Panel`, `SimulationModal`, `TeacherReviewPortal` all exist as files in `client/components/workspace/` with **zero imports**.
- `ScrumPlanPanel` (`[teamId].tsx:32`) and `ScrumTimelinePanel`/`RetroPanel`/`SprintPanel`/`RecommendationPanel`/`AnalyticsPanel`/`TeamHealthPanel` are unreached at runtime via `normalizeTab()`.
- **Workstream 25 (Competitive Benchmarking):** `ABSENT` — `workstreams21to25.js` explicitly ends at WS 24 (`Project Health 2.0`); `academicResearchService.js` queries OpenAlex/Crossref literature only.

---

## Phase Nine — GitHub OAuth & Workspace Memory Integration

### 27. GitHub Integration Security Model (`server/routes/github.js`, `githubService.js`, `repositoryIndexingService.js`)
- Decouples per-user `GitHubCredential` (AES-256-CBC encrypted access token) from per-workspace single active `GitHubIntegration` + `RepositoryIndex`.
- Uses Mongo-persisted `OAuthState.consumeState(state)` for atomic single-use CSRF & replay defense (unlike Google OAuth's in-memory `Map` in `routes/auth.js`).
- Enforces membership via `github.js:verifyProjectAccess` cleanly avoiding silent `Project` creation, **but** falls back open if `team` is null (`L98`) and stores up to `1,500`-char code snippets in `RepositoryIndex` that may index sensitive auth files.

### 28. Persistent vs Temporary Context Separation (`ProjectMemory` vs `TemporaryContext`)
- `ProjectMemory` (`19` canonical categories in `projectMemoryContext.js`, expanded from `11` in Fix 5 to include `CODE_INTELLIGENCE` alongside `architecture`, `requirement`, `decision`, `risk`, etc.; `scope: persistent | temporary`) cleanly isolates persisted institutional knowledge from ad-hoc chat attachments.
- `TemporaryContext` suffers from cross-user scoping and TTL enforcement weaknesses (`[AI-HIGH-04]`).

---

## Phase Ten — Discovery, Team Formation & Academic Ecosystem

### 29. Open Team Discovery & Role Applications (`discovery.js`, `applicationService.js`)
- Teams opt into discovery via `Team.discoverySettings` (`domain`, `openRoles`, etc.).
- Public search (`discovery.js:53–83`) applies raw regex strings (ReDoS exposure `[SEC-MED-16]`); role application audit trail tracked in `TeamApplication` + `TeamApplicationAudit`.

### 30. Academic Portal Backends (Prompts 13–15)
- `teacherReviewService.js`, `academicEvaluationService.js`, and `fairContributionService.js` (`0.40` taskWorkload + `0.25` requirementCoverage + etc.) are implemented with `TeacherReview`, `AcademicRubric`, and `ContributionDispute` models — **currently unmounted in client UI** and **missing strict faculty role enforcement** on `projects.js:4161–4412` (`[SEC-CRIT-08]`).

---

## Phase Eleven — Security Posture Audit (`26` Findings Summary)

### 31. Top Critical Attack Vectors (`#1–#8`)
1. Hardcoded JWT secret fallback (`server/auth.js:3`).
2. Display-name membership spoofing across `teams.js`, `projects.js`, `scrum.js`, `hybrid.js`, `invitationService.js`, `taskHandlers.js` + `PATCH /api/me`.
3. Ownerless/empty-team fallthrough (`workstreams21to25.js:104` sets `isLeader: true`, `teams.js:92`, `projects.js:183`).
4. `18` project intelligence routes (`projects.js:2803–3195`) omit `findProject`.
5. `scrum.js:1374–1396, 2281–2282` (`sprints/:id/items`, `analytics`) omit `verifyProjectAccess`.
6. `workstreams21to25.js` unguarded routes (`/lessons/reusable`, `/members/:userId/capability`, `/decisions/:id/ai-summary`), `applyLesson` missing `isLeader`, and child-ID IDORs lacking parent project verification.
7. Cross-project Task IDORs (`PATCH /tasks/:id/priority` `teams.js:2707`, `DELETE .../dependencies/:depId` `teams.js:2353`, `kanban.js:181,392,476,522`, socket `task:update` & `task:search`).
8. Member role self-promotion (`teams.js:1831`) and student authoring/grading of faculty reviews/rubrics/disputes (`projects.js:4161–4412`).

### 32. Additional High/Medium Exposure Highlights
- Kanban `$or` key overwrite (`kanban.js:192, 203, 729`) + pre-auth `Project.create` (`kanban.js:78–113`).
- Zero HTTP/Socket rate limiting (`rateLimiter.js` exists unattached); global `15mb` JSON parser (`index.js:45`).
- Client-trusted quiz grading (`/ai/quiz/submit`, `/skills/verify`).

---

## Phase Twelve — Known Logic, UI/UX & Contract Bugs

### 33. High-Impact Algorithmic & Persistence Defects
1. `taskPriorityEngine.js:95` caps `greedyFactor` at `75/100`.
2. `decisionEngine.js:398` omits `weightOverrides` from `rankTasks(...)`.
3. `unifiedProjectHealthService.js:491` gives `requirementsDim` `0.00` weight.
4. `kanbanWipService.js:37–38` counts `count === limit` as overloaded/violated.
5. `kanbanReactiveEngine.js:84` fails `ProjectMemory` schema rules silently.
6. `decisionIntelligenceService.js:28, 278` calls fake `aiProviderAbstraction.js` stub.
7. `migratePhase1.js:120` writes invalid `"planning"` `currentPhase` enum.

### 34. Frontend & Real-Time Discrepancies
- `[teamId].tsx:305` hides WIP banner for Kanban while showing it for Hybrid/unknown states.
- `12` FE↔BE endpoint/field shape mismatches documented in [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md).
- `client/app/docs.tsx` exposes `5/12` `SectionKey` pages.
- Bare `${teamId}` orphan Socket emits miss `team:${teamId}` listeners.

---

## Phase Thirteen — Verification & Test Infrastructure (`106` Scripts)

### 35. Script Inventory & Classification (`103` `server/scripts/` + `3` External)
- **`9` Non-Test Utilities / Seeders / Migrations:** e.g., `seedDemo.js`, `migratePhase1.js` (dry-run vs mutating), inspection tools.
- **`12` Pure Offline `Cat C` Unit/FS Suites (Safe on Any Machine):** Zero DB, zero HTTP, zero live LLM (`testClassicV1GuideSuite.js`, `testDomainMethodology.js`, `testFixes1to5Logic.js`, `testGitHubWorkspaceMemoryAndDocsV4.js`, `testLocalAICore.js`, `testManualQaFixes.js`, `testManualQaFixes2456.js`, `testPhase6Fixes.js`, `testReactKeyDeduplication.js`, `testScrumV4FullSuite.js`, `testTaskPriorityEngine.js`, `testWorkspaceDescriptionFix.js`).
- **Other Categories (`94` server test/audit scripts total):** DB-dependent unit/integration suites (`Cat A/B`), HTTP server suites (`Cat D`), static policy audits (`Cat E`), and `62` legacy/ad-hoc V3/V4 scripts (`Cat F`), plus external `server/__tests__/manualQaFixes.test.js`, `client/hooks/mergeSort.test.ts`, and `scripts/testMetroBundle.js`.

### 36. Hazardous & Stale Test Warnings (`CRITICAL`)
- **`server/scripts/testNexusflowV3.js:30–38` (inside `npm run test:all`!)** calls `coll.deleteMany({})` across **every MongoDB collection**! NEVER run `npm run test:all` against a real or shared database.
- `testFixes5Memory.js` wipes `ProjectMemory`; `testArtifactSaveDeletePersistence.js` alters `PhishShield` `ownerId`/`members`.
- `testChatMarkdownAndPresentation.js:35` embeds a hardcoded fallback MongoDB Atlas URI *(value omitted — remove immediately)*.
- `testOmniRouteZeroCostPolicy.js:115` still forbids `"groq"`, failing against Tier 2 `FREE_GROQ_MODELS` in `omniRoute.js:50`.
- Zero Playwright / Cypress / React Testing Library automated frontend UI test suites exist (`NOT VERIFIED` in browser runtime).

---

## Phase Fourteen — Documentation Integrity & Drift Log

### 37. Systematic Doc-vs-Code Discrepancies (`7` Critical Drifts)
1. **Passwordless vs Bcrypt Auth:** Older docs claim passwordless/trivial auth; codebase uses `bcryptjs` + JWT + Google OAuth.
2. **AI Stack:** Docs describe OpenAI/paid fallbacks or pervasive live AI; codebase enforces `$0` OmniRoute (`Gemini -> Groq -> OpenRouter`), yet leaks a mock stub in WS 23, `streamMock()` in Socket chat, and uses pure deterministic algorithms in 4 "AI" modules.
3. **DAA Weights & Sorts:** Docs cite `6`/`8`/`9` sorts and `0.40/0.35/0.25` weights; code runs `5` server sorts and `0.50/0.35/0.15` (`greedyScheduler.js`).
4. **Workspace Tabs:** `methodologyAvailability.js:162` & `methodologyConfig.ts` cite `12` tabs for Classic/`NEXUSFLOW`; `[teamId].tsx` mounts `6` (`isClassic`), `8` (Waterfall/Scrum), `9` (Kanban).
5. **Workstreams 11–25 Coverage:** `MD FILES/NexusFlow_V4_Part2_Current_Implementation_Status.md` is stale (pre-WS 11–24 backend completion), whereas post-WS roadmap docs assume full UI wiring when `12` panels have zero imports.
6. **Duplicate Roadmap Doc:** `NexusFlow_V4_Part_2_Remaining_Architecture_Roadmap.md` exists identically in root and `MD FILES/`.
7. **In-App `/docs` Page:** Only `5/12` documented sections are selectable in `client/app/docs.tsx:58`.

---

## Phase Fifteen — Developer Workflows, Safe Operation & Quick Index

### 38. Safe Local Verification Commands
- **Frontend TypeScript Check (Safe, Offline):**
  `node client/node_modules/typescript/bin/tsc --noEmit -p client/tsconfig.json --skipLibCheck`
- **Safe Pure-Offline Server Unit Suites (`12` scripts, Zero DB/Network):** Run `node server/scripts/<name>.js` exclusively from the `Cat C` whitelist above (starting with `testScrumV4FullSuite.js`, `testTaskPriorityEngine.js`, `testDomainMethodology.js`, `testClassicV1GuideSuite.js`).
- **Forbidden Commands on Shared/Live Environments:** `npm run test:all` (runs `testNexusflowV3.js` full DB wipe), `seedDemo.js`, `migratePhase1.js` without `--dry-run`, `testFixes5Memory.js`, `testArtifactSaveDeletePersistence.js`.

### 39. Architectural Decision Rules for Future Changes
1. Preserve strict separation between **deterministic DAA engines** and **advisory `$0` OmniRoute AI**.
2. Isolate every methodology cleanly (**Waterfall**, **Scrum**, **Kanban**, **Classic**, **Hybrid**) — do not leak Waterfall phase gates into Scrum or alter Classic's V1 DAA workflow.
3. Enforce authorization against immutable `userId` (`ObjectId`) and parent `projectId`/`teamId` **before** any DB reads/writes.
4. Keep `$0` financial safety invariant intact — never introduce paid LLM endpoints or bypass `validateZeroCostRoute`.

### 40. Companion Documentation Index
| Document | Primary Purpose |
| --- | --- |
| [`NEXUSFLOW_MASTER_PROJECT_CONTEXT.md`](./NEXUSFLOW_MASTER_PROJECT_CONTEXT.md) | 40-section canonical architecture & engineering bible (this document) |
| [`NEXUSFLOW_FILE_INDEX.md`](./NEXUSFLOW_FILE_INDEX.md) | Complete index of all `481` files with exports & roles |
| [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md) | All `428` Express routes, Socket.IO rooms/events & `12` FE↔BE mismatches |
| [`NEXUSFLOW_ARCHITECTURE_MAP.md`](./NEXUSFLOW_ARCHITECTURE_MAP.md) | Screen→DB data flows + `16` Mermaid diagrams |
| [`NEXUSFLOW_FEATURE_STATUS.md`](./NEXUSFLOW_FEATURE_STATUS.md) | Evidence-tagged matrix across V1–V4 & `22` Phase 8 features |
| [`NEXUSFLOW_TECHNICAL_RISKS.md`](./NEXUSFLOW_TECHNICAL_RISKS.md) | `26` security vulnerabilities, DAA/AI/DB defects, test hazards & P0–P3 plan |
| [`NEXUSFLOW_AI_HANDOFF_CONTEXT.md`](./NEXUSFLOW_AI_HANDOFF_CONTEXT.md) | High-signal quick-start brief & critical gotchas for future sessions |
