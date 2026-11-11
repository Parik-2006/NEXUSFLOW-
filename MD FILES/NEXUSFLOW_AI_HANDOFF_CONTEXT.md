# NEXUSFLOW — AI & Engineer Quick-Start Handoff Context

**Repository:** `p:/DAA OPTIONAL` (Current Branch: `version4.0` — production branch: `main`)  
**Read This First** before making any architectural claims, security changes, algorithm edits, or test executions in NEXUSFLOW. Every fact below is verified directly against source code (`CODE VERIFIED`).

---

## 1. Repository at a Glance

- **Stack:** Expo `~51` / React Native Web + Three.js + React Flow client (`client/`) paired with Node ESM Express + Socket.IO + Mongoose (`server/`).
- **Scale:** **`481` total files** (`88` root/docs/assets, `142` `client/`, `251` `server/`), **`42` Mongoose models**, **`428` Express HTTP route declarations**, **`8` core DAA algorithm modules** (`server/algorithms/`) + `5` benchmark sorts (`server/utils/sortAlgorithms.js`), **`65` services** (`server/services/`), **`4` Socket.IO modules**, and **`106` scripts** (`103` in `server/scripts/` + `3` external).
- **Authoritative Companion Docs:**
  - Deep architecture & `16` Mermaid diagrams → [`NEXUSFLOW_ARCHITECTURE_MAP.md`](./NEXUSFLOW_ARCHITECTURE_MAP.md)
  - 40-section master technical reference → [`NEXUSFLOW_MASTER_PROJECT_CONTEXT.md`](./NEXUSFLOW_MASTER_PROJECT_CONTEXT.md)
  - All `26` security findings & bugs → [`NEXUSFLOW_TECHNICAL_RISKS.md`](./NEXUSFLOW_TECHNICAL_RISKS.md)
  - All `428` REST routes & Socket events → [`NEXUSFLOW_API_AND_SOCKET_REFERENCE.md`](./NEXUSFLOW_API_AND_SOCKET_REFERENCE.md)
  - V1→V4 & `22` Phase 8 feature matrix → [`NEXUSFLOW_FEATURE_STATUS.md`](./NEXUSFLOW_FEATURE_STATUS.md)
  - Full `481`-file catalog → [`NEXUSFLOW_FILE_INDEX.md`](./NEXUSFLOW_FILE_INDEX.md)

---

## 2. Truth-vs-Docs Cheat Sheet (Do NOT Trust Stale Roadmaps)

| Area | Common Misconception in Older Docs | Ground Truth in Code (`CODE VERIFIED`) |
| --- | --- | --- |
| **LLM Cost & Providers** | Uses OpenAI GPT or paid fallbacks everywhere | Strictly **`$0` OmniRoute 3-tier cascade**: Gemini (`5` free models) → Groq (`8` free models) → OpenRouter (`openrouter/free`), failing closed via `ZeroCostViolationError`. |
| **DAA vs AI Boundary** | AI computes scores or replaces algorithms | **False.** All priority, health, risk, sprint, and assignment scores are deterministic DAA/rule math. DAA is **never** an AI text fallback. |
| **Greedy Weights** | `0.40 / 0.35 / 0.25` or `0.40 / 0.40 / 0.20` | `greedyScheduler.js:78–85` uses **`0.50` urgency / `0.35` impact / `0.15` deps**. (`taskPriorityEngine.js:95` accidentally double-multiplies `0.35`, capping its greedy factor at `75/100`!) |
| **Sort Count** | `6`, `8`, or `9` sorts | `server/utils/sortAlgorithms.js` benchmarks **`5` sorts** (`Bubble`, `Merge`, `Selection`, `Insertion`, `Quick`). |
| **Workspace Tab Counts** | `Classic` / `NEXUSFLOW` has 12 tabs | `[teamId].tsx` renders **`6`** (`Classic`, incl. `NEXUSFLOW`/`V3` alias at `L161`), **`8`** (`Waterfall`), **`8`** (`Scrum`), **`9`** (`Kanban`). |
| **Workstreams 11–25 Status** | Either "0% done" (`Part2_Status`) or "100% live" (roadmap) | Backend engines exist across `server/services/` & `projects.js`/`workstreams21to25.js`, **but `12` workspace UI components have `0` imports**! Only `Capability Intelligence`, `Project Learning Loop`, and unified `Project Health 2.0` are mounted inside `WaterfallInsightsPanel.tsx`. `WS 25 Benchmarking` is `ABSENT`. |
| **Hybrid UI** | Hybrid has its own methodology UI | Backend `hybridEngine.js` (`4` templates) + `routes/hybrid.js` exist, **but** `[teamId].tsx` falls through to Waterfall panels + `MethodologyWipBanner`. |

---

## 3. Twelve Critical Gotchas Before Editing a Single Line

1. **NEVER Run `npm run test:all` Against a Shared/Live MongoDB:** `server/scripts/testNexusflowV3.js:30–38` deletes **every document in every MongoDB collection** (`coll.deleteMany({})`). Always isolate or use the offline `Cat C` test scripts below.
2. **Watch Out for Display-Name Auth Spoofing & Empty-Team Fallthrough:** `teams.js:87`, `projects.js:170–180`, `workstreams21to25.js:104` (`isLeader: true` on missing team), and `kanban.js:78–113` (creates `Project` & mutates `Team` *before* checking access) have open security flaws (`[SEC-CRIT-02,03]`, `[SEC-HIGH-13]`). Never propagate `members[].name` matching or `!team` fallthroughs into new routes.
3. **Audit Missing Access Guards on Existing Routers:** `projects.js:2803–3195` (`18` intelligence routes), `scrum.js:1374, 1395, 2281` (sprint items & analytics), `workstreams21to25.js` (missing guards + `applyLesson` missing `isLeader` + child IDORs), and `projects.js:4161–4412` (faculty-only checks missing) lack authorization checks (`[SEC-CRIT-04..08]`).
4. **Watch Out for Kanban's `$or` Key Overwrite Bug:** `server/routes/kanban.js:192, 203, 729` puts two `$or:` keys inside the same JS object literal—silently dropping the `{ projectId, teamId }` filter and querying tasks **across all tenants**. Always use `$and: [...]`.
5. **Do Not Use `team.leaderId` or Assume `req.user._id` Exists:** `TeamSchema` uses `ownerId` + `members[].role` (not `leaderId`!). JWTs sign `{ id, email, name }` (`server/auth.js:6–7`), so always resolve `(req.user?.id || req.user?._id)?.toString()`.
6. **Do Not Wire AI Calls Through `aiProviderAbstraction.js`:** `decisionIntelligenceService.js:28, 278` imports `executeAiQuery` from `aiProviderAbstraction.js`, which currently returns hardcoded mock strings (`[Gemini Response] Advisory analysis for...`). Real AI features must call `omniRoute.js` directly.
7. **Remember `projects.js` Dual Mount (`/` and `/api`):** `server/index.js:235–236` mounts `projects.js` twice; nested routes prefixed with `/api` inside `projects.js` (`L3590–3875`) accidentally register at `/api/api/...`. Also check `L432` vs `L3918` (`methodology-select` shadowing).
8. **Respect Task Scoring & Health Formula Bugs Before Modifying Rankings:**
   - `taskPriorityEngine.js:95` double-multiplies `W_GREEDY`, capping the V2 greedy anchor factor at `75/100`.
   - `decisionEngine.js:398` omits mode `weightOverrides` when calling `rankTasks(...)`.
   - `unifiedProjectHealthService.js:491` leaves `requirementsDim` at `0.00` weight in the weighted total.
   - `kanbanWipService.js:37–38` marks `count === limit` as overloaded (`>=`), double-counted by `kanbanHealthService`.
9. **Scrum Safety Invariant (`409` Completion Gate):** Never silently clear `sprintId` or hide incomplete sprint tasks when completing a sprint; keep `Scrum` lifecycle and `Waterfall` 6-phase gates strictly separated. (`scrumEngine.js:721` vs `scrumHealthService.js` differ — check both before editing Scrum health!)
10. **Kanban Reactive `ProjectMemory` Failure & Classic `isClassic` Alias:** `kanbanReactiveEngine.js:84` fails `ProjectMemory.create` validation silently due to mismatched field names; `[teamId].tsx:305` `!isKanban` hides `MethodologyWipBanner` on Kanban; `[teamId].tsx:161` forces `NEXUSFLOW`/`V3` onto `Classic`.
11. **Dual-Check Socket Room Prefixes & CORS:** Canonical rooms are `team:${teamId}`, `chat:team:${teamId}`, `project:${projectId}` (`projects.js` still has orphan emits to bare `${teamId}`). Also Socket.IO CORS (`server/index.js:245`) omits ports `8082` and `3000` allowed by Express CORS (`L44`).
12. **Zero UI Tests & Stale Zero-Cost Test:** `testOmniRouteZeroCostPolicy.js:115` still marks `"groq"` forbidden even though Groq Free Tier (`8` models) is Tier 2 of `omniRoute.js`. Meanwhile `client/` has no Playwright/RTL suite — always verify UI flows with TypeScript + actual browser/manual checks.

---

## 4. Canonical File Lookup Map

| Purpose | Exact Path |
| --- | --- |
| Express + Socket entrypoint & dual mounts | `server/index.js` |
| JWT signing / `requireAuth` | `server/auth.js` |
| Core Mongoose models | `server/models/{User,Team,Project,Task,Sprint,ProjectMemory,ProjectEvent,Risk,DecisionRecord,EarlyWarning,ProjectLesson,CapabilityProfile}.js` |
| Methodology availability & templates | `server/config/methodologyAvailability.js`, `server/data/projectTemplates.js` |
| Deterministic DAA algorithms | `server/algorithms/{greedyScheduler,taskPriorityEngine,taskOptimiser,graphTraversal,branchAndBound,decisionEngine,projectDecomposer,projectGuidanceEngine}.js` |
| Comparison sorts & client Boyer-Moore | `server/utils/sortAlgorithms.js`, `client/utils/boyerMoore.ts` |
| `$0` LLM Gateway | `server/services/omniRoute.js` |
| Waterfall / Scrum / Kanban / Hybrid engines | `server/services/{phaseGateService,scrumEngine,scrumHealthService,scrumAnalyticsService,kanbanEngine,kanbanWipService,hybridEngine}.js` |
| Health 2.0 / Risk / Learning / Capability | `server/services/{unifiedProjectHealthService,projectHealth2Service,riskEngine,projectLearningService,capabilityIntelligenceService}.js`, `server/routes/workstreams21to25.js` |
| Workspace Shell Router | `client/app/team/[teamId].tsx` |
| Methodology config & in-app docs | `client/utils/methodologyConfig.ts`, `client/app/docs.tsx` |
| Client API & Socket wrappers | `client/utils/api.ts`, `client/services/{scrumApiService.ts,kanbanApiService.ts,socket.ts}` |

---

## 5. Safe Local Verification & Forbidden Commands

### Safe Offline Checks (Zero DB Mutations, Zero Paid API Calls)
- **TypeScript Typecheck (`client/`):**
  ```powershell
  node client/node_modules/typescript/bin/tsc --noEmit -p client/tsconfig.json --skipLibCheck
  ```
- **Pure-Offline Unit Suites (`server/scripts/` `Cat C` Whitelist):**
  - `node server/scripts/testClassicV1GuideSuite.js`
  - `node server/scripts/testDomainMethodology.js`
  - `node server/scripts/testFixes1to5Logic.js`
  - `node server/scripts/testGitHubWorkspaceMemoryAndDocsV4.js`
  - `node server/scripts/testLocalAICore.js`
  - `node server/scripts/testManualQaFixes.js`
  - `node server/scripts/testManualQaFixes2456.js`
  - `node server/scripts/testPhase6Fixes.js`
  - `node server/scripts/testReactKeyDeduplication.js`
  - `node server/scripts/testScrumV4FullSuite.js` (`npm run test:scrum`)
  - `node server/scripts/testTaskPriorityEngine.js`
  - `node server/scripts/testWorkspaceDescriptionFix.js`

### Forbidden / Dangerous Without Isolated Disposable DB
- **NEVER run `npm run test:all`** (executes `testNexusflowV3.js` full-DB `deleteMany({})`).
- **DO NOT run without disposable DB:** `testFixes5Memory.js`, `testArtifactSaveDeletePersistence.js`, `seedDemo.js`, `migratePhase1.js` (unless `--dry-run`, and fix `"planning"` enum bug at `L120` first).
- **CLEAN UP SECURITY HAZARD FIRST:** Remove the hardcoded Atlas URI fallback at `server/scripts/testChatMarkdownAndPresentation.js:35`.

