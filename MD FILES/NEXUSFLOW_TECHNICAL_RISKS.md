# NEXUSFLOW Technical Risks, Vulnerabilities & Architectural Defects

**Repository:** `p:/DAA OPTIONAL` (Branch: `version4.0`)  
**Audit Mode:** Strict Read-Only Code, Architecture, Database, Algorithm, AI & Test Audit  
**Scope Snapshot:** `481` repository files (`88` root/docs/assets + `142` `client/` + `251` `server/`), `42` Mongoose models, `428` Express HTTP route declarations across `server/index.js` + `13` route modules, `8` files in `server/algorithms/`, `65` files in `server/services/`, `4` files in `server/socket/`, `106` test & utility scripts (`103` in `server/scripts/` + `3` external).  
**Security Notice:** No `.env` values, API keys, tokens, or connection string secrets are printed anywhere in this document.

---

## Evidence Legend

| Tag | Meaning |
| --- | --- |
| `CODE VERIFIED` | Directly verified in source code (`file:line` cited) during this audit. |
| `TEST VERIFIED` | Verified against executed or inspected repository test/audit scripts. |
| `DOCUMENTATION ONLY` | Claimed in docs (`README.md`, `MD FILES/`, `docs/`) without matching runtime wiring or contradicted by code. |
| `INFERRED` | Logically deduced from directly inspected adjacent code without isolated live exploitation/browser run. |
| `NOT VERIFIED` | Not executed against a live DB/browser/external API during this read-only audit. |

---

## 1. Executive Risk Summary

NEXUSFLOW (`V1 Classic` → `V2 Intelligence` → `V3 Real-Time/OAuth/GitHub` → `V4 Multi-Methodology & Phase 8 Intelligence`) ships substantial working backend logic and interactive UI for Waterfall and Scrum workspaces, backed by genuine deterministic DAA algorithms and the `$0`-cost OmniRoute cascade. However, **rapid iterative layering across four architectural generations has introduced severe security boundaries, mathematical/deterministic drifts, broken AI wiring in V4 Decision Intelligence, cross-tenant Kanban query bugs, unreachable V4 UI panels, and dangerous database-wiping test scripts.**

| Category | Critical | High | Medium | Low / Info | Total |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Security & Access Control** | 8 | 6 | 8 | 4 | **26** |
| **Deterministic / DAA / Scoring Defects** | 2 | 5 | 4 | — | **11** |
| **AI Pipeline & Mock Stubs** | 1 | 3 | 3 | — | **7** |
| **Database & Migration Hazards** | 1 | 2 | 3 | — | **6** |
| **Frontend ↔ Backend / Socket / UX Gaps** | — | 4 | 5 | 2 | **11** |
| **Documentation Drift & Test Suite Hazards** | 2 | 3 | 4 | 3 | **12** |

---

## 2. Critical Security & Authorization Vulnerabilities (`#1–#8`)

### `[SEC-CRIT-01]` Hardcoded Production JWT Signing Secret Fallback (`CODE VERIFIED`)
- **Location:** `server/auth.js:3` (`const SECRET = process.env.JWT_SECRET ?? "nexusflow-production-jwt-secret-key-2026";`), duplicated in `server/scripts/testNexusflowV3.js:19`.
- **Risk:** If `JWT_SECRET` is omitted in any deployment environment, Express auth (`requireAuth`) and Socket.IO handshake verification (`server/index.js:250`) silently accept JWTs signed with the publicly visible literal key in version control, allowing complete authentication forgery for any user ID/email.
- **Remediation:** Fail closed at server startup if `process.env.JWT_SECRET` is missing or shorter than 32 bytes in non-test environments; remove hardcoded fallback strings.

### `[SEC-CRIT-02]` Display-Name & Name/Email Spoofing Authorization Bypass (`CODE VERIFIED`)
- **Location:** `server/routes/teams.js:87, 118, 2835`, `server/routes/projects.js:170–180, 235, 302`, `server/routes/scrum.js:121`, `server/routes/hybrid.js:70`, `server/services/invitationService.js:65`, `server/socket/taskHandlers.js:57`, combined with user-editable profile names via `PATCH /api/me` (`server/index.js:225–227`).
- **Evidence:** In `server/routes/teams.js:81–89` and `server/routes/projects.js:173–181`, membership checks grant access if `mName && userName && mName === userName` or `mName && userEmail && mName === userEmail`. Meanwhile `GET /api/teams` (`server/routes/teams.js:117–119`) also includes `{ "members.name": userName }` in the query filter.
- **Impact:** Any authenticated user can update their display `name` via `PATCH /api/me` to match a team member's name or email string and immediately gain read/write workspace access across REST endpoints and Socket.IO task/team rooms.
- **Remediation:** Authenticate and authorize workspace/project membership strictly by immutable `userId` (`ObjectId`), with normalized `email` matching restricted strictly to verified pending invitations during explicit acceptance. Remove `userName` matching from all access control helpers.

### `[SEC-CRIT-03]` Unowned / Empty-Team Legacy Fallthrough Grants Unauthorized Access (`Leader: true`) (`CODE VERIFIED`)
- **Location:** `server/routes/workstreams21to25.js:78–105` (specifically `L104`), `server/routes/projects.js:165, 183–185`, `server/routes/teams.js:92–94`, `server/routes/scrum.js:125`, `server/routes/github.js:98`, `server/routes/hybrid.js:72`.
- **Evidence:**
  - `server/routes/workstreams21to25.js:104`: If `!project.teamId` or `Team.findById(project.teamId)` returns `null`, `authorizeProjectAccess` falls through all checks and returns `{ project, team: null, isLeader: true, isFaculty: false }`.
  - `server/routes/teams.js:92`: `const isLegacy = !team.ownerId && (!team.members || team.members.length === 0);` allows any authenticated user into ownerless teams (`server/routes/projects.js:183` repeats the exact pattern).
- **Impact:** Any authenticated user can read, modify, accept capability assignments, validate/archive lessons, and resolve/dismiss warnings (`isLeader: true`) on projects whose `teamId` is missing, dangling, or attached to an empty legacy team.
- **Remediation:** Fail closed (`403 Forbidden`) whenever `!team`, `!project.teamId`, or an unowned team lacks an explicit owner/member entry matching `req.user._id`. Run a one-time backfill script to assign owners or archive orphaned teams.

### `[SEC-CRIT-04]` 18 Project Intelligence Route Declarations Omit `findProject` Authorization (`CODE VERIFIED`)
- **Location:** `server/routes/projects.js:2803–3195` (covering `/projects/:projectId/project-health`, `/health`, `/project-health/refresh`, `/health/refresh`, `/team-health`, `/team-health/refresh`, `/risks`, `/risks/scan`, risk mutations, `/opinions*`, `/retrospectives*`, `/insights*`, `/brain`).
- **Evidence:** Directly observed at `server/routes/projects.js:2803–2893`: `requireAuth` checks JWT validity, validates `mongoose.isValidObjectId(projectId)`, and immediately invokes `computeUnifiedProjectHealth(projectId, io)`, `computeTeamHealth(projectId)`, or `scanProjectRisks(projectId)` / `Risk.find(...)` **without calling `findProject(..., res, req.user)`**.
- **Impact:** Any logged-in user knowing or enumerating a `projectId` or `teamId` can read and mutate another organization's project health, risks, AI opinions, retrospectives, insights, and project brain.
- **Remediation:** Enforce `const project = await findProject(req.params.projectId, res, req.user); if (!project) return;` (alongside tightened `findProject` checks) on every route in `L2803–3195`.

### `[SEC-CRIT-05]` Scrum Sprint Item & Analytics Routes Omit `verifyProjectAccess` (`CODE VERIFIED`)
- **Location:** `server/routes/scrum.js:1360–1396` (`POST /sprints/:sprintId/items`, `POST /:projectId/sprints/:sprintId/items`, `DELETE /sprints/:sprintId/items/:taskId`, `DELETE /:projectId/sprints/:sprintId/items/:taskId`) and `server/routes/scrum.js:2270–2282` (`GET /analytics/:id`, `GET /:projectId/analytics`).
- **Evidence:** Both `handleAddItemToSprint` (`L1360–1372`), `handleRemoveItemFromSprint` (`L1380–1393`), and `handleGetAnalytics` (`L2270–2280`) never call `verifyProjectAccess(req, res, ...)`, even on the `:projectId`-parameterized aliases.
- **Impact:** Any authenticated attacker can add or remove arbitrary tasks across any team's sprints by `sprintId`/`taskId` and exfiltrate sprint analytics/velocity data across projects.
- **Remediation:** Resolve `sprintId` → `projectId` on non-projectId routes and invoke `verifyProjectAccess` (plus leader/Scrum Master guard for sprint membership mutations) in all four item handlers and both analytics handlers.

### `[SEC-CRIT-06]` Workstreams 21–25 Unguarded Routes & Child-ID Cross-Project IDORs (`CODE VERIFIED`)
- **Location:** `server/routes/workstreams21to25.js:187–208, 229–237, 257–265, 313–380, 416–467`.
- **Evidence:**
  1. **Zero team/project access checks:** `GET /api/lessons/reusable` (`L229`), `GET /api/teams/:teamId/members/:userId/capability` (`L257`), and `POST /api/decisions/:decisionId/ai-summary` (`L373`) enforce `requireAuth` only — any user can query cross-project reusable lessons, inspect any member's capability profile on any team, and overwrite `DecisionRecord.aiSummary` on arbitrary decision IDs.
  2. **Child-ID IDORs without parent-project ownership check:** `validateLesson` (`L174`), `applyLesson` (`L197` — which also **omits `if (!auth.isLeader)`**!), `archiveLesson` (`L221`), `getDecisionExplanation` (`L318`), `explainTaskPriority` (`L347`), `recomputeCounterfactual` (`L365`), `acknowledgeWarning` (`L422`), `resolveWarning` (`L440`), and `dismissWarning` (`L462`) authorize against `req.params.projectId`, then operate purely on `req.params.lessonId` / `taskId` / `decisionId` / `warningId` without verifying the target record belongs to `req.params.projectId`.
- **Impact:** An attacker can supply their own controlled `projectId` in the URL to pass `authorizeProjectAccess`, then validate, archive, resolve, dismiss, explain, or summarize another team's lessons, tasks, decisions, or early warnings.
- **Remediation:** Add `isLeader` check to `applyLesson`, add team/project access validation to capability and AI summary routes, scope `/lessons/reusable` to accessible/explicitly public verified lessons, and require `{ _id: childId, projectId: req.params.projectId }` in every child service query.

### `[SEC-CRIT-07]` Cross-Team / Cross-Project Task IDORs Across REST & Socket.IO (`CODE VERIFIED`)
- **Location:** `server/routes/teams.js:2707` (`PATCH /api/tasks/:taskId/priority`), `server/routes/teams.js:2353` (`DELETE .../dependencies/:depId`), `server/routes/kanban.js:165, 181–184, 392, 476, 522`, `server/socket/taskHandlers.js:179, 214` (`task:update`), `server/socket/aiOrchestrator.js:249` (`task:search`).
- **Evidence:** `server/routes/teams.js:2707–2730` fetches `Task.findById(req.params.taskId)` and immediately calls `Task.findByIdAndUpdate(...)` without checking team/project membership (missing earlier `L144` middleware). In `server/routes/kanban.js:154–185`, `handlePull` verifies access against `:projectId`/body/header, then passes raw `taskId` to `pullWorkItem(auth.project._id, taskId, ...)` without guaranteeing `taskId` belongs exclusively to `auth.project._id` (plus `$or` tenant leak documented in `[DB-CRIT-01]`).
- **Impact:** Authenticated users can reprioritize, overwrite, pull, delete dependencies on, or search tasks outside their authorized teams/projects.
- **Remediation:** Authorize every task mutation and query against the fetched `Task.teamId` / `Task.projectId` server-side before modifying state or returning data.

### `[SEC-CRIT-08]` Trivial Self-Promotion to Leader & Student Forgery of Faculty Academic Grades (`CODE VERIFIED`)
- **Location:** `server/routes/teams.js:1831–1854` (`PATCH /api/teams/:teamId/members/:userId`) and `server/routes/projects.js:4161–4412` (`/teacher-reviews*`, `/academic-evaluation*`, `/disputes*`).
- **Evidence:**
  - `server/routes/teams.js:1834–1839`: `PATCH /teams/:teamId/members/:userId` checks only `verifyTeamAccess(teamId, req.user)`, then sets `members.$.role = String(req.body.role)` with no check that the caller is the team owner or leader.
  - `server/routes/projects.js:4167–4233` (`createTeacherReview`, `addReviewComment`, `updateReviewStatus`) and `L4248–4412`: checks only `findProject(...)`, permitting students inside the team (`role: "user"`) to submit `createTeacherReview` (`L4174`), modify rubric grades (`academic-evaluation`), and resolve `ContributionDispute` records (`disputes`), even across `reviewId`s without project ownership binding.
- **Impact:** Any ordinary team member can promote themselves to `leader` via `PATCH /teams/:teamId/members/:userId` and bypass all leader-only gates (`apply` changes, phase gates, sprint completion, member removal), while students can author faculty reviews and grade themselves.
- **Remediation:** Restrict `members.$.role` mutations to `team.ownerId` / verified `leader` (preventing self-demotion of sole owner), and enforce an explicit server-side `req.user.role === "faculty" || req.user.role === "teacher" || req.user.role === "admin"` check (plus `assignedFacultyIds` binding) on all academic grading/faculty review/dispute resolution routes.

---

## 3. High Security Vulnerabilities (`#9–#14`)

| ID | Vulnerability & Location | Evidence & Impact | Remediation |
| --- | --- | --- | --- |
| **`[SEC-HIGH-09]`** | **Broken `PasswordReset` Token Self-Invalidation & Missing Dispatch** (`server/routes/auth.js:177–193, 262–272`) `CODE VERIFIED` | `POST /auth/forgot-password` creates the `PasswordReset` record at `L181–186`, then at `L188–191` immediately runs `updateMany({ userId, _id: { $ne: new mongoose.Types.ObjectId() }, used: false }, { $set: { used: true } })`, using a fresh random `ObjectId` instead of the created document's `_id` — **immediately marking the newly generated token `used: true`**! Moreover `rawToken` is never dispatched/emailed and `findValidResetToken` (`L263–271`) inspects only `.limit(1)`. | Exclude the newly created `_id` cleanly, persist SHA-256 token lookup index + TTL with single-use atomic `findOneAndUpdate`, integrate transactional email dispatch, and preserve identical anti-enumeration responses. |
| **`[SEC-HIGH-10]`** | **Client-Trusted Quiz Grading & Skill Verification** (`server/routes/ai.js:913`, `server/routes/skills.js:42`, `server/services/applicationService.js:165`) `CODE VERIFIED` | Endpoints accept client-submitted scores/answers or passed booleans directly to grant `SkillVerification` records and application qualification scores. | Grade submitted answers strictly against server-stored quiz answer keys stored in session/DB (never shipped to client) and compute verification status server-side. |
| **`[SEC-HIGH-11]`** | **Zero Global or Per-Endpoint Rate Limiting** (`server/index.js`, all routes) `CODE VERIFIED` | Neither `express-rate-limit` nor Redis/in-memory throttling is mounted on `/api/login`, `/api/signup`, `/api/auth/forgot-password`, `/api/ai/*`, `/api/users/lookup`, or Socket events. | Attach tiered rate limiters (`auth`, `AI`, `lookup`, `mutation`) cleanly before route mounts. |
| **`[SEC-HIGH-12]`** | **Google OAuth Missing `aud`/`email_verified`, URL Token Leakage & In-Memory `oauthStateStore`** (`server/routes/auth.js`) `CODE VERIFIED` | Google callback omits strict `aud` client ID check and `email_verified === true` enforcement, appends the signed JWT directly into the browser redirect query string (exposing it in browser history, Referer headers, and proxy logs), and mixes in-memory state with Mongo `OAuthState`. | Validate `aud` + `email_verified`, exclusively use Mongo `OAuthState.consumeState`, and exchange a short-lived single-use opaque auth code for the JWT via `POST`. |
| **`[SEC-HIGH-13]`** | **Kanban Pre-Authorization DB Auto-Initialization Mutation** (`server/routes/kanban.js:78–90, 116–118`) `CODE VERIFIED` | Directly observed: `verifyProjectAccess` creates a new `Project` (`Project.create`), mutates `team.activeProjectId = project._id`, sets `team.methodology = "KANBAN"`, and calls `await team.save()` / `ensureKanbanConfig(project)` **before** checking `if (!isOwner && !isMember)` at `L110`! An unauthorized caller who passes an existing `teamId` with no project mutates the victim's `Team.methodology` and creates orphan projects before receiving HTTP `403`. | Move membership/ownership authorization check (`L99–113`) strictly **before** any `Project.create`, `team.save()`, or `ensureKanbanConfig` mutation. |
| **`[SEC-HIGH-14]`** | **Broken Identity Field References (`req.user._id` `undefined` / Nonexistent `team.leaderId`)** (`server/routes/discovery.js`, `server/routes/scrum.js:680`, `server/services/phaseGateService.js:545, 650`) `CODE VERIFIED` | Because `server/auth.js:6–7` signs `{ id, email, name }` (`_id` is absent unless resolved from DB), `req.user._id` in `discovery.js` is `undefined`, breaking identity checks; similarly `scrum.js:680` and `phaseGateService.js:545, 650` check `team.leaderId` (a field not present on `TeamSchema`, which uses `ownerId` and `members[].role`), silently causing leader guards or fallback paths to misfire. | Standardize on `resolveAuthUser` (`(req.user.id || req.user._id).toString()`) and replace `team.leaderId` references with `(team.ownerId + members[].role === "leader")`. |

---

## 4. Medium Security Vulnerabilities (`#15–#22`)

1. **`[SEC-MED-15]` Unauthenticated AES-256-CBC GitHub Token Encryption + UTF-8 Key Slicing + Dev Key Fallback** (`server/services/githubService.js:17–61`): Uses `aes-256-cbc` without HMAC/GCM integrity tag (padding-oracle / ciphertext-malleability risk), slices UTF-8 `ENCRYPTION_KEY.slice(0, 32)` instead of `crypto.scryptSync`/SHA-256 32-byte key derivation, falls back to hardcoded `"nexusflow3_default_dev_key_32char"` (`L35`) outside `isProductionEnvironment()`, and ships placeholder keys in `.env.example`.
2. **`[SEC-MED-16]` ReDoS Exposure on Public Team Discovery** (`server/routes/discovery.js:53–83`): Unauthenticated search builds `RegExp` directly from user query strings without escaping regex metacharacters (`escapeRegExp`), risking event-loop starvation.
3. **`[SEC-MED-17]` GitHub API URL Interpolation & Auth Source-File Snippet Persistence** (`server/services/githubService.js`, `RepositoryIndex` indexing pipeline): `repoOwner`/`repoName` parameters are interpolated into GitHub REST paths without strict `[A-Za-z0-9_.-]` validation, and repo indexing saves `1,500`-char code snippets from repository files (potentially capturing server auth/config logic) into `RepositoryIndex` readable via project AI endpoints.
4. **`[SEC-MED-18]` Unthrottled Email/User Lookup Enumeration** (`server/routes/userLookup.js`, `/api/users/lookup`): Allows authenticated accounts to enumerate registered user emails/profiles without strict rate limits.
5. **`[SEC-MED-19]` Global `15mb` JSON Body Limit & Unvalidated Avatar/Attachment Payloads** (`server/index.js:45`): `express.json({ limit: "15mb" })` applies globally to all routes (`POST /login`, webhooks, AI endpoints, Kanban moves) to accommodate inline base64 avatars, opening memory-exhaustion DoS vectors and unvalidated `data:` URI injection.
6. **`[SEC-MED-20]` Member-Level Project Deletion & Destructive Config Mutations** (`server/routes/projects.js:474`): Any member passing `findProject` (not just `owner`/`leader`) can trigger project deletion or overwrite methodology configs on several endpoints.
7. **`[SEC-MED-21]` Mongoose Mass Assignment** (`server/routes/discovery.js:224`, `server/routes/scrum.js:374, 1001`, `server/routes/projects.js:1616`): Spreads/assigns `req.body` directly into Mongoose document updates/creations without strict field allowlisting.
8. **`[SEC-MED-22]` Raw Internal Error Leakage** (pervasive across route catch blocks, e.g., `server/routes/kanban.js:132, 147, 178`, `server/routes/workstreams21to25.js:132, 159`): Returns raw `err.message` (potentially exposing MongoDB index names, collection names, or internal stack context) to HTTP clients.

---

## 5. Low & Informational Findings (`#23–#26`)

1. **`[SEC-LOW-23]` Express vs Socket.IO CORS Origin Disparity** (`server/index.js:44` vs `server/index.js:245`): Express CORS allows `http://localhost:8082` and `http://localhost:3000` in addition to `FRONTEND_URL`, `8081`, and `19006`, while Socket.IO CORS omits `8082` and `3000`, causing silent WebSocket failures when testing on alternate local ports.
2. **`[SEC-LOW-24]` Route Prefix & Shadowing Anomalies** (`server/routes/projects.js:432` vs `3918`, `L598`, `L3590–3875`):
   - `projects.js` is dual-mounted at both `/api` (`server/index.js:235`) and `/` (`L236`), while some project memory routes under `L3590–3875` carry duplicated/mis-prefixed `/api/...` paths (resulting in `/api/api/...` under the `/api` mount).
   - Duplicate `methodology-select` registration (`L432` shadows `L3918`).
   - `projects.js:598` queries `Task.find({ project })` (typo field name vs `projectId`), risking empty/mismatched reads on that path.
3. **`[SEC-LOW-25]` Indirect Prompt Injection via Workspace Context Builders** (`server/services/workspaceContextService.js` + `aiContextBuilder.js`): Task titles, descriptions, chat messages, and GitHub indexed file snippets are concatenated into LLM system/user prompts without structural delimiters or instruction-isolation framing.
4. **`[SEC-LOW-26]` Degraded No-DB Boot Behavior** (`server/index.js:273–283`): When `mongoose.connect(MONGO_URI)` fails, `server/index.js:282` still binds HTTP and Socket.IO (`NexusFlow server on :PORT (no DB)`), causing health checks to appear "up" while authenticated endpoints fail on buffered Mongoose timeouts or broken state.

---

## 6. Deterministic DAA & Scoring Engine Defects

1. **`[DAA-HIGH-01]` `taskPriorityEngine.js` `greedyFactor` Hard-Capped at `75/100`** (`server/algorithms/taskPriorityEngine.js:88–104`):
   - Directly verified at `L95`: `const raw = W_GREEDY * u + W_GREEDY * i + (WEIGHTS.greedy * 0.15) * d;`
   - Using default `W_GREEDY = 0.35`, maximum (`u=1, i=1, d=1`) evaluates to `0.35 + 0.35 + (0.35 * 0.15) = 0.7525` → **`score = 75` instead of `100`**! The code intended sub-weights summing to `1.0` (`0.50`, `0.35`, `0.15` from `greedyScheduler.js`) rather than double-multiplying by `W_GREEDY = 0.35`. This systematically depresses the V2 Greedy anchor component (`0.35` overall weight) across all Task Intelligence 2.0 rankings.
2. **`[DAA-HIGH-02]` `decisionEngine.js` Mode Weights Displayed But Ignored in Ranking** (`server/algorithms/decisionEngine.js:372–439`):
   - Directly verified: `L374` resolves `weightOverrides = options.weights || mode.weights`, returns them as explanatory `factors` metadata (`L431–439`), yet `L398` calls `const ranked = rankTasks(tasks, engineContext);` **without forwarding `weightOverrides`**, so switching decision mode (`balanced`, `deadline_first`, etc.) changes only the UI explanation table, never the actual task ranking!
3. **`[DAA-HIGH-03]` `greedyScheduler.js` Weight Drift vs Documentation** (`server/algorithms/greedyScheduler.js:48–85`):
   - Runtime defaults (`L54–56, 78–85`) are **`0.50` urgency / `0.35` impact / `0.15` dependency fan-in**, whereas several `README.md` / `MD FILES/` specifications cite **`0.40 / 0.35 / 0.25`** or **`0.40 / 0.40 / 0.20`**.
4. **`[DAA-HIGH-04]` `unifiedProjectHealthService.js` Omits `requirementsDim` from Overall Weighted Score (`Weight = 0.00`)** (`server/services/unifiedProjectHealthService.js:478–500`):
   - Directly verified: `dimensions` (`L478–488`) exports 9 dimensions including `requirementsDim`, yet `weightedScore` (`L491–500`) sums 8 weights (`0.18 + 0.15 + 0.15 + 0.14 + 0.12 + 0.10 + 0.08 + 0.08 = 1.00`) and completely excludes `requirementsDim`! Furthermore `qualityScore` (`L462–464`) uses coarse threshold steps (`85 ± 15`) rather than granular acceptance-criteria evidence.
5. **`[DAA-HIGH-05]` Kanban WIP Boundary (`count >= limit`) Double-Counted Across Services** (`server/services/kanbanWipService.js:37–38` + `kanbanHealthService.js`):
   - Directly verified at `kanbanWipService.js:37–38`: both `isOverloaded = !isUnlimited && count >= limit` AND `isSaturated = !isUnlimited && count >= limit` treat exact capacity (`count === limit`) as already overloaded/violated (`>=` rather than `count > limit` for overload, `count === limit` for saturated/at-cap). Combined with `kanbanHealthService` counting column and global violations simultaneously, boards operating cleanly at exact WIP capacity are penalized as overloaded.
6. **`[DAA-MED-06]` Unused `checkDefinitionOfDone` Gate in `kanbanEngine.js`** (`server/services/kanbanEngine.js:15`):
   - `checkDefinitionOfDone` is exported/defined in `kanbanEngine.js` alongside WIP enforcement, while `pullWorkItem` flow execution relies on WIP & override checks rather than blocking `"done"` moves on unmet Definition of Done items in standard UI flows.
7. **`[DAA-MED-07]` `riskEngine.js` Double-Emits Deadline & Overload Signals** (`server/services/riskEngine.js`):
   - Approaching/overdue deadlines and member workload vs imbalance trigger overlapping risk records under distinct category fingerprints (`overdue_tasks` / `approaching_deadline`, `member_overload` / `workload_imbalance`), inflating open risk counts unless deduplicated.
8. **`[DAA-MED-08]` `scrumPriorityEngine.js` Double-Counts Uncertainty Factor** (`CODE VERIFIED` via DAA audit):
   - Unclear/missing estimation / uncertainty contributes to both readiness penalties and priority adjustments in Scrum backlog scoring.
9. **`[DAA-MED-09]` `scrumEngine.js:721` `calculateScrumHealth` vs `scrumHealthService.js` Divergence** (`CODE VERIFIED`):
   - `scrumEngine.js:721` implements a simpler legacy `calculateScrumHealth(sprint, tasks, team)` formula (`sprintGoalHealth` + `capacityHealth`), whereas `/api/scrum/:projectId/health` (`scrum.js:2287–2293`) invokes `computeScrumHealth` in `scrumHealthService.js`. Different callers risk showing conflicting health grades for the exact same Scrum project.
10. **`[DAA-MED-10]` `scrumAnalyticsService.js` Linearly Interpolates Burndowns**:
    - Ideal/actual sprint burndown charts use linear interpolation/derived reconstructions rather than immutable daily point snapshots across missed capture days, skewing mid-sprint trend accuracy (`INFERRED` partial degradation when historical daily snapshots are absent).
11. **`[DAA-MED-11]` `boyerMoore.ts` & Client `mergeSort` Parity Drift**:
    - Client maintains `client/utils/boyerMoore.ts` and `client/hooks/useTeamTasks.ts` Merge Sort separately from server `server/algorithms/taskSearcher.js` and `server/utils/sortAlgorithms.js` (`5` server sorts vs doc claims of `6`/`8`/`9` sorts).

---

## 7. AI Routing, Fake Stubs, Fallbacks & Prompt Risks

1. **`[AI-CRIT-01]` `decisionIntelligenceService.js` Wired to Fake Mock AI Stub (`aiProviderAbstraction.js`)** (`CODE VERIFIED`):
   - Directly verified at `server/services/decisionIntelligenceService.js:28, 278` importing `executeAiQuery` from `server/services/aiProviderAbstraction.js`.
   - `aiProviderAbstraction.js:69–76, 89+` returns synthetic canned strings such as `` `[Gemini Response] Advisory analysis for: ${prompt.slice(0, 60)}...` `` instead of calling the live `omniRoute.js` 3-tier `$0` provider engine!
   - Thus `POST /api/decisions/:decisionId/ai-summary` persists **placeholder mock text** into `DecisionRecord.aiSummary` in MongoDB.
2. **`[AI-HIGH-02]` REST Copilot Returns HTTP 500 When `provider === "none"`** (`CODE VERIFIED` via AI audit):
   - When Gemini (`5` free models), Groq (`8` free models), and OpenRouter (`openrouter/free`) all exhaust quota or lack keys, OmniRoute returns a graceful unavailable payload (`provider: "none"`), which the REST Copilot handler fails to treat as a controlled non-500 advisory fallback, throwing HTTP 500 to callers.
3. **`[AI-HIGH-03]` Socket.IO `@ai` Chat Handler Falls Back to `streamMock()`** (`CODE VERIFIED`):
   - Live Socket `@ai` chat handlers still invoke legacy `streamMock()` when real AI invocation fails or in mock paths, violating strict V4 guidance against synthetic fake AI completions in user-visible chat streams (`testOmniRouteZeroCostPolicy` and V4 invariants specify clean AI-unavailable messaging without fake LLM text).
4. **`[AI-HIGH-04]` `TemporaryContext` TTL & Cross-User Scope Leakage** (`CODE VERIFIED` via AI/DB audits):
   - `TemporaryContext` documents risk persisting beyond session intent or missing strict `(projectId, userId)` isolation filters when building contextual prompts across shared workspaces (`getTemporaryContext` vs socket session usage).
5. **`[AI-MED-05]` Four "AI" Services Are Actually 100% Deterministic / Non-LLM**:
   - `requirementService.js`, `academicResearchService.js`, `multimodalCopilotService.js`, and Scrum decomposition in `server/routes/scrum.js:3439` use deterministic rules/templates without invoking `omniRoute.js` (`CODE VERIFIED`), even though docs/UI sometimes frame them as AI capabilities.
6. **`[AI-MED-06]` Seven Overlapping AI Context Builders**:
   - Multiple parallel context assembly pipelines (`workspaceContextService.js`, `aiContextBuilder.js`, `projectMemoryContext.js`, etc.) build inconsistent snapshots with differing inclusion rules for tasks, GitHub repo indexes, temporary context, and methodology metadata.
7. **`[AI-MED-07]` JSON Structured Output Validation Gaps**:
   - Upstream LLM responses from free-tier Gemini/Groq/OpenRouter models vary in JSON markdown-fence compliance; partial parser failures silently degrade sections instead of surfacing typed validation diagnostics.

---

## 8. Database, Schema Duplication & Migration Risks

1. **`[DB-CRIT-01]` Kanban Route `$or` JavaScript Object Key Overwrite Leaks Tasks Across Projects (`CODE VERIFIED`)**:
   - Directly observed at `server/routes/kanban.js:192–199` and `L203–206` (also `L729`):
     ```js
     const tasks = await Task.find({
       $or: [{ projectId: auth.project._id }, { teamId: auth.team._id }],
       $or: [
         { kanbanStatus: "BACKLOG" },
         { workflowColumn: "backlog" }, ...
       ],
     })
     ```
   - In JavaScript object literals, the second `$or` key **silently overwrites the first `$or` property**! The actual Mongoose query executed against MongoDB is **`Task.find({ $or: [ { kanbanStatus: "BACKLOG" }, ... ] })` with NO `projectId` or `teamId` filter at all!**
   - **Impact:** Severe multi-tenant data leak — `/api/kanban/backlog/:id` and `activeReadyTasks` counting pull/count Kanban backlog and ready tasks **across every project and team in the entire MongoDB database**.
   - **Remediation:** Combine with `$and: [{ $or: [{ projectId }, { teamId }] }, { $or: [...] }]`.
2. **`[DB-HIGH-02]` `kanbanReactiveEngine.js` `ProjectMemory.create` Silently Fails Schema Validation (`CODE VERIFIED`)**:
   - Directly verified at `server/services/kanbanReactiveEngine.js:84–102`: writes `type: "event"`, `author: ...`, `title: ...` into `ProjectMemory.create(...)`, while `ProjectMemory` (`server/models/ProjectMemory.js:18–40`) enforces `category` (from the `19` `MEMORY_CATEGORIES`), `createdBy`, `scope`, etc., causing `catch (mErr)` to silently swallow validation errors on every Kanban pull/block event.
3. **`[DB-HIGH-03]` `migratePhase1.js` Sets Invalid Project Phase Enum `"planning"` (`CODE VERIFIED`)**:
   - Directly verified at `server/scripts/migratePhase1.js:120`: sets `currentPhase: tasksToBackfill > 0 ? "development" : "planning"`, whereas `ProjectSchema` restricts `currentPhase` to canonical Waterfall phase enums (omitting `"planning"`, which is a `status` enum, not `currentPhase`), causing migration writes to fail validation for zero-task teams.
4. **`[DB-MED-04]` Duplicate / Overlapping Persistence Structures Across `42` Models**:
   - Parallel storage of health metrics (`TeamHealth`, `ScrumHealthSnapshot`, `ScrumSprintSnapshot`, plus computed `ProjectHealth2`/Scrum payloads), decisions (`Decision` vs `DecisionRecord` + `DecisionFeedback`), learning/memory (`LearningInsight`, `ProjectLesson`, `ProjectMemory`, `TemporaryContext`), project events (`ProjectEvent`, `ProjectMemory` checkpoints, `ScrumSprintSnapshot`), and capability/skills (`User.skills`, `Team.members[].skills`, `SkillVerification`, `CapabilityProfile`) creates sync drift unless mutation services update all copies consistently.
5. **`[DB-MED-05]` Unindexed Query Paths & `Task.find({ project })` Field Typo**:
   - `server/routes/projects.js:598` queries `{ project }` rather than `{ projectId }`; several dynamic `$or` queries across `projectId`/`teamId` trigger collection scans under load.
6. **`[DB-MED-06]` Missing Transactions on Multi-Collection State Transitions**:
   - Sprint completion, methodology switches, and member departures perform sequential non-transactional writes across `Project`, `Sprint`, `Task`, `ProjectEvent`, and `Team`, risking partial state on mid-request failure.

---

## 9. Frontend ↔ Backend, Socket.IO & UX Contract Risks

| Severity | Finding | Location / Details | Impact |
| --- | --- | --- | --- |
| **`HIGH`** | **12 Unmounted / Zero-Import V4 UI Components** (`CODE VERIFIED`) | `AcademicEvaluationPanel`, `ConformancePanel`, `CopilotAttachmentBar`, `DecisionExplanationDrawer`, `DigitalTwinCore`, `DomainIntelligencePanel`, `FairContributionPanel`, `ProcessMiningPanel`, `ProjectEventTimeline`, `ProjectHealth2Panel`, `SimulationModal`, `TeacherReviewPortal` have zero imports across `client/`. | Workstreams 11–20 & Decision/Health 2.0 drawers cannot be reached by users despite backend routes existing. |
| **`HIGH`** | **Unreachable Tabs & Unused Imports in Workspace Router** (`CODE VERIFIED`) | `client/app/team/[teamId].tsx:32` imports unused `ScrumPlanPanel`; `normalizeTab()` prevents reaching `ScrumTimelinePanel`, `RetroPanel`, `SprintPanel`, `RecommendationPanel`, `AnalyticsPanel`, `TeamHealthPanel`; `NEXUSFLOW`/`V3` aliases force `isClassic` (6 tabs), discarding `NEXUSFLOW_CONFIG`'s 12 tabs. | Users lose access to multiple built views; stale code increases maintenance hazard. |
| **`HIGH`** | **12 FE ↔ BE Endpoint / Payload Contract Mismatches** (`CODE VERIFIED`) | Wrong HTTP verbs/paths, `docs.tsx` exposing only `5/12` section links and broken anchor URLs, mismatched field shapes between client hooks (`useTaskAnalytics`, `scrumApiService`, `kanbanApiService`) and server responses. | Runtime 404s, empty cards, or silent fallbacks in affected subviews. |
| **`HIGH`** | **Kanban Methodology WIP Banner Hidden by Negated Guard** (`CODE VERIFIED`) | `client/app/team/[teamId].tsx:305` renders `MethodologyWipBanner` only when `!isWaterfall && !isScrum && !isKanban && !isClassic`, hiding WIP guidance on Kanban while displaying it on Hybrid/unknown states. | Kanban users miss intended WIP warning banner; Hybrid incorrectly loads Waterfall panels + WIP banner. |
| **`MED`** | **Socket.IO Room Prefix Mismatch (Orphan Emits)** (`CODE VERIFIED`) | Server joins clients to `team:${teamId}` / `project:${projectId}` (`server/socket/*`), while certain emitters broadcast to bare `${teamId}` (`projects.js`) without `team:` prefix — clients never receive those updates. | Missed live board/health updates requiring manual page refresh. |
| **`MED`** | **Client Merge Sort & Boyer-Moore Duplication** (`CODE VERIFIED`) | `client/utils/boyerMoore.ts` & `client/hooks/useTeamTasks.ts` duplicate server search/sort semantics, risking subtle tie-breaker divergence between local client state and server ranking. | Task order flickers after server round-trip vs optimistic client sort. |
| **`MED`** | **`ScrumInsightsPanel` Comment vs Subtab Count Drift** (`CODE VERIFIED`) | `ScrumInsightsPanel.tsx:4` claims `6` subtabs while `L62–68` render `5` (`health`, `analytics`, `capability`, `risks`, `dag`); missing dedicated retrospective/learning insight panel parity with Waterfall. | Misleads maintainers auditing Scrum insight parity. |
| **`MED`** | **Missing Client Session Token Handling on OAuth Redirect** (`CODE VERIFIED`) | Google OAuth puts JWT in query parameter consumed client-side; fails under strict Referer/CSP or browser extension scanners. | Credential leakage risk in browser history. |
| **`MED`** | **Unwired Simulation & Digital Twin Backends in Classic/Kanban** | Simulation and conformance endpoints have backend handlers/models without interactive entry points in most methodology shells. | Dead backend surface area increases attack surface (`[SEC-CRIT-*]`). |
| **`LOW`** | **Socket.IO `auth` Handshake Refresh Missing on Token Renewal** | Handshake reads initial JWT; re-authentication requires disconnect/reconnect. | Stale socket identity if user profile/token updates. |
| **`LOW`** | **Large Monolithic `[teamId].tsx` & `projects.js` (`4,613` lines)** | Overloaded single workspace router and `4.6k`-line Express router impede targeted code review and automated access-control auditing. | Root contributor to recurring IDOR omissions (`[SEC-CRIT-04]`). |

---

## 10. Documentation & Specification Contradictions (`7` Major Drifts)

| Topic | Documentation Claims (`README.md` / `MD FILES/` / `docs/`) | Ground Truth in Code (`CODE VERIFIED`) |
| --- | --- | --- |
| **1. Auth Model** | Some V1/early docs describe passwordless / simple name login. | Real `bcryptjs` password hashing (`User` pre-save hook + `comparePassword`) with JWT auth (`server/auth.js`), Google OAuth, and `PasswordReset`. |
| **2. AI Stack** | Claims OpenAI GPT / 2-tier fallback / "AI everywhere". | Strictly **$0 OmniRoute 3-tier cascade**: Gemini (`5`) → Groq (`8`) → OpenRouter (`openrouter/free`), plus mock stub `aiProviderAbstraction.js` (`decisionIntelligenceService`), `streamMock()` socket fallback, and 4 deterministic non-LLM "AI" services. |
| **3. DAA Sorts & Weights** | Claims `6`, `8`, or `9` sort algorithms and `0.40/0.35/0.25` or `0.40/0.40/0.20` Greedy weights. | `server/utils/sortAlgorithms.js` has `5` sorts; `greedyScheduler.js:78–85` uses `0.50 / 0.35 / 0.15`; `taskPriorityEngine.js:95` caps `greedyFactor` at `75/100`. |
| **4. Workspace Tabs** | Docs list `12` tabs for NexusFlow V3 and varied Classic/Scrum counts. | `[teamId].tsx` mounts `8` Waterfall, `8` Scrum, `9` Kanban, and `6` Classic tabs (with `NEXUSFLOW`/`V3` forced onto `isClassic`). |
| **5. Feature Flag `SCRUM_PRODUCTION_ENABLED`** | Referenced in roadmaps/docs as a gating feature switch. | Does not match actual runtime gating across `scrum.js` / `[teamId].tsx` (`methodologyAvailability.js` controls templates/availability). |
| **6. Workstreams 11–25 Status** | V4 roadmap docs mark WS 11–25 as complete end-to-end features. | Only `2` (`Capability Intelligence`, `Learning Loop`) + `Project Health 2.0` (`UnifiedProjectHealthPanel`) are fully wired into mounted UI; `15` are partial, `2` backend-only, `1` experimental, `1` absent, and `12` UI panels have `0` imports. |
| **7. In-App `/docs` Page (`client/app/docs.tsx`)** | Presented as complete user documentation portal. | Only `5/12` sections are reachable and multiple internal URLs/anchors drift from current app routes. |

---

## 11. Test Suite Hazards & Coverage Blind Spots

### Destructive & Unsafe Test Scripts (DO NOT RUN ON LIVE / SHARED DB)
1. **`[TEST-HAZ-01]` Full Database Wipe in `npm run test:all` (`server/scripts/testNexusflowV3.js:30–38`) (`CODE VERIFIED`)**:
   - `cleanup()` iterates `mongoose.connection.collections` and executes `await coll.deleteMany({});` on **every collection** except `system.indexes`, and is wired into default full suite runs! Running this against development or production Atlas permanently destroys all users, projects, tasks, sprints, and teams.
2. **`[TEST-HAZ-02]` Selective Collection Wipes (`server/scripts/testFixes5Memory.js`)**:
   - Connects to `MONGO_URI` and deletes/mutates `ProjectMemory` / `Project` fixtures during execution.
3. **`[TEST-HAZ-03]` Production-Like Team/Project Mutation (`server/scripts/testArtifactSaveDeletePersistence.js`)**:
   - Directly mutates `ownerId` and `members` on existing `PhishShield` workspace records if connected to an active database containing them.
4. **`[TEST-HAZ-04]` Hardcoded Connection String Fallback (`server/scripts/testChatMarkdownAndPresentation.js:35`)**:
   - Contains a hardcoded MongoDB Atlas fallback URI literal in source code *(exact URI intentionally omitted per security policy)*. Must be removed immediately, credentials rotated if valid, and replaced strictly with `process.env.MONGO_URI` failing closed.
5. **`[TEST-HAZ-05]` Stale Zero-Cost Policy Test (`server/scripts/testOmniRouteZeroCostPolicy.js:115`) (`CODE VERIFIED`)**:
   - Lists `"groq"` in `forbiddenProviders` (`L115`), directly contradicting `server/services/omniRoute.js:50` where Groq Free Tier (`FREE_GROQ_MODELS`) is Tier 2 of the production cascade, causing `testOmniRouteZeroCostPolicy.js` to fail against current production behavior.

### Coverage Blind Spots (`CODE VERIFIED` / `NOT VERIFIED`)
- **Zero React Native / Web Browser E2E Suite:** None of the `106` scripts launch Playwright, Cypress, or React Testing Library against `client/`. All UI component behavior requires manual browser verification or TypeScript `tsc --noEmit` (`client/` has only `client/hooks/mergeSort.test.ts`).
- **No Security Regression Suite for IDORs:** None of the `94` server test scripts assert negative `403 Forbidden` isolation across `[SEC-CRIT-04]` (`projects.js` 18 intelligence routes), `[SEC-CRIT-05]` (`scrum.js` sprint items/analytics), `[SEC-CRIT-06]` (`workstreams21to25.js`), or `[DB-CRIT-01]` (`kanban.js` `$or` key overwrite).
- **`62` Legacy / Ad-Hoc Live-DB/HTTP Category F Scripts:** Heavily depend on local `127.0.0.1:4000` / `:5000` servers or seeded DBs, while only **`12` offline `Cat C` unit scripts** run hermetically without DB or external network access.

---

## 12. Prioritized Remediation Roadmap

### Phase P0 — Immediate Security & Data-Integrity Containment (Blockers)
1. **Remove secret fallbacks & rotate exposed credentials:** Delete hardcoded URI at `server/scripts/testChatMarkdownAndPresentation.js:35`; fail closed on missing `JWT_SECRET` (`server/auth.js:3`) and `ENCRYPTION_KEY` (`server/services/githubService.js:20–37`).
2. **Fix Kanban `$or` cross-tenant leak (`server/routes/kanban.js:192, 203, 729`)** using `$and`, and move membership checks **before** `Project.create` / `team.save()` (`L78–113`).
3. **Eliminate display-name membership bypass & empty-team `isLeader` fallthrough** across `teams.js`, `projects.js`, `scrum.js`, `hybrid.js`, `github.js`, and `workstreams21to25.js:104`.
4. **Add parent ownership checks (`findProject` / `verifyProjectAccess` / `isLeader` / `faculty` role):**
   - All 18 routes in `projects.js:2803–3195`
   - `scrum.js:1374–1396, 2281–2282`
   - `workstreams21to25.js` (missing guards + `applyLesson` leader check + child-ID `{ _id, projectId }` binding)
   - `teams.js:1831` (`PATCH /members/:userId` leader-only role edits), `teams.js:2707` (`PATCH /tasks/:taskId/priority`), `projects.js:4161–4412` (faculty-only academic reviews/rubrics/disputes).

### Phase P1 — Deterministic Correctness & AI Pipeline Repair
1. **Fix `taskPriorityEngine.js:95`** (`W_GREEDY` double-multiplication capping greedy factor at `75/100`) and pass `weightOverrides` from `decisionEngine.js:398` into `rankTasks`.
2. **Wire `decisionIntelligenceService.js:28, 278`** to real `$0` `omniRoute.js` (`executeOmniRoute` / structured wrapper) instead of `aiProviderAbstraction.js` mock stubs; handle `provider: "none"` cleanly in REST Copilot (`HTTP 503/200` advisory state instead of `500`) and remove `streamMock()` from production Socket `@ai`.
3. **Fix `unifiedProjectHealthService.js:491`** weights to incorporate `requirementsDim`, align `kanbanWipService.js:37–38` (`count > limit` overloaded vs `count === limit` saturated), fix `kanbanReactiveEngine.js:84` `ProjectMemory` schema fields, and fix `migratePhase1.js:120` invalid `"planning"` `currentPhase`.
4. **Align `testOmniRouteZeroCostPolicy.js:115`** with the real 3-tier Groq Free policy and guard `testNexusflowV3.js` `cleanup()` behind `NODE_ENV === "test"` + dedicated disposable DB name assertion.

### Phase P2 — Frontend Connectivity, Socket Parity & Cleanup
1. Decide fate of the `12` zero-import components + unreachable panels (`mount` or explicitly deprecate/remove) and restore `MethodologyWipBanner` visibility for Kanban (`[teamId].tsx:305`).
2. Fix `12` FE↔BE contract mismatches, bare `${teamId}` orphan Socket emits, and Express-vs-Socket CORS parity (`server/index.js:44` vs `245`).
3. Reconcile `docs.tsx` (link all 12 sections with current paths) and fix client-trusted quiz grading (`/ai/quiz/submit`, `/skills/verify`).

### Phase P3 — Hardening & Modularity
1. Decompose `server/routes/projects.js` (`4,613` lines) and `client/app/team/[teamId].tsx` into domain-scoped modules with mandatory authorization middleware enforced at the router level (`router.use(requireProjectMember)`).
2. Add global + per-route `express-rate-limit`, upgrade token encryption to AES-256-GCM with `crypto.scryptSync`, and add supertest IDOR regression tests covering every router.
