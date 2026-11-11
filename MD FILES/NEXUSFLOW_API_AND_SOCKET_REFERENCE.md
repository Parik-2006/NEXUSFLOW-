# NEXUSFLOW — Complete REST API & Socket.IO Reference (`428` Express Route Declarations + Real-Time Event Protocol)

> **Evidence Scope:** Directly verified against `server/index.js`, all `13` Express routers in `server/routes/*.js`, `server/socket/*.js`, `server/services/*.js`, `client/hooks/*.ts`, `client/services/*.ts`, and all mounted/orphaned UI panels (`CODE VERIFIED`).  
> **Route Accounting:** Total `496` Express method/socket-get calls reported by AST/regex scan minus `68` `app.get("io")` lookups = **`428` HTTP `app.<method>` / `router.<method>` route declarations** across `server/index.js` (`9`) and `13` route modules (`419`). Because `server/routes/projects.js` (`140` handlers) is dual-mounted at both `/api` and `/`, those routes respond on two URL prefixes.

---

## 1. Express Mount, Middleware & Rate-Limiting Architecture (`server/index.js`)

### 1.1 Router Mount Table (`server/index.js:44–242`)
| Line | Mount / Middleware | Module | Router-Level Auth | Effective Base Path(s) |
|---|---|---|---|---|
| `L44` | `cors(...)` | `cors` | — | Origins: `[FRONTEND_URL, :8081, :19006, :8082, :3000]`, `credentials: true` |
| `L45` | `express.json({ limit: "15mb" })` | Express JSON parser | — | Global 15MB payload limit (supports base64 avatars/logos & JSON attachments) |
| `L48–227` | Direct HTTP Handlers | `server/index.js` | Mixed (`L146–227` `requireAuth`) | `/`, `/api/auth/{signup,login}`, `/api/{signup,login}`, `/api/me`, `/api/user{,s}/profile` |
| `L229` | `app.use("/api", authRoutes)` | `server/routes/auth.js` | Per-route (None; token/OAuth state) | `/api/auth/*` |
| `L230` | `app.use("/api", chatRoutes)` | `server/routes/chat.js` | Per-route `requireAuth` | `/api/chat/*` |
| `L231` | `app.use("/api", skillsRoutes)` | `server/routes/skills.js` | Per-route (`canonical`/`taxonomy` public) | `/api/skills/*` |
| `L232` | `app.use("/api", aiRoutes)` | `server/routes/ai.js` | Per-route `requireAuth` | `/api/ai/quiz/*` |
| `L233` | `app.use("/api", userLookupRoutes)` | `server/routes/userLookup.js` | Per-route `requireAuth` | `/api/users/lookup` |
| `L234` | `app.use("/api", teamRoutes)` | `server/routes/teams.js` | `L144` `router.use("/teams/:teamId", requireAuth, verifyTeamAccess)` | `/api/teams*`, `/api/invitations*`, `/api/notifications*`, **`/api/tasks/:taskId/priority` (misses L144!)** |
| `L235` | `app.use("/api", projectRoutes)` | `server/routes/projects.js` | Per-route `requireAuth` (**18 endpoints omit `findProject`!**) | `/api/projects/*`, `/api/methodologies*`, `/api/faculty/*`, `/api/ai/local-models`, **`/api/:projectId/memory*` (mis-prefixed!)** |
| `L236` | `app.use(projectRoutes)` | `server/routes/projects.js` | Same (**Dual-Mounted!**) | Same paths mounted at `/` (e.g. `/projects/*`, `/methodologies`, `/:projectId/memory*`) |
| `L237` | `app.use("/api", githubRoutes)` | `server/routes/github.js` | Per-route (`config` & OAuth callback public) | `/api/github/*`, `/api/projects/:projectId/{github,context}/*` |
| `L238` | `app.use("/api", discoveryRoutes)` | `server/routes/discovery.js` | Per-route (public GETs + authed writes) | `/api/discovery/*`, `/api/teams/:teamId/{discovery,open-roles,applications}*`, `/api/my-applications`, `/api/applications/*` |
| `L239` | `app.use("/api/scrum", requireAuth, scrumRoutes)` | `server/routes/scrum.js` | **Router-level `requireAuth`** | `/api/scrum/*` (3 routes omit `verifyProjectAccess`!) |
| `L240` | `app.use("/api/kanban", requireAuth, kanbanRoutes)` | `server/routes/kanban.js` | **Router-level `requireAuth`** | `/api/kanban/*` |
| `L241` | `app.use("/api/hybrid", requireAuth, hybridRoutes)` | `server/routes/hybrid.js` | **Router-level `requireAuth`** | `/api/hybrid/*` |
| `L242` | `app.use("/api", workstreams21to25Routes)` | `server/routes/workstreams21to25.js` | Per-route `requireAuth` | `/api/projects/:projectId/*`, `/api/lessons/reusable`, `/api/teams/:teamId/members/:userId/capability`, `/api/decisions/:decisionId/ai-summary` |

### 1.2 Route Declaration Count Reconciliation (`428` Total)
| File | Declarations | Notes |
|---|---:|---|
| `server/index.js` | `9` | `/`, `/api/auth/signup`, `/api/signup`, `/api/auth/login`, `/api/login`, `GET /api/me`, `PATCH /api/me`, `/api/users/profile`, `/api/user/profile` |
| `server/routes/ai.js` | `2` | Quiz generate & submit |
| `server/routes/auth.js` | `5` | Google OAuth & Forgot/Reset Password |
| `server/routes/chat.js` | `8` | Global & team chat + unread/read + edit/delete |
| `server/routes/discovery.js` | `12` | Team discovery, open roles & applications |
| `server/routes/github.js` | `12` | GitHub OAuth, repo sync/tree & workspace context AI |
| `server/routes/hybrid.js` | `6` | Hybrid config & template validation (`0` client callers) |
| `server/routes/kanban.js` | `44` | Dual-pattern routes (`/op/:id` & `/:projectId/op`) |
| `server/routes/projects.js` | `140` | Waterfall, Project AI Copilot, WS 11–20, Health/Risks/Retro/Brain, mis-prefixed Memory |
| `server/routes/scrum.js` | `121` | Dual-pattern routes (`/op/:id` & `/:projectId/op`) + bulk-assign aliases |
| `server/routes/skills.js` | `6` | Taxonomy, skill verification & team skill graph/gaps |
| `server/routes/teams.js` | `41` | Workspaces, members, tasks, DAA engines, invites, notifications |
| `server/routes/userLookup.js` | `1` | Authenticated email user lookup |
| `server/routes/workstreams21to25.js` | `21` | WS 21–24 Learning, Capability, Decision Explainability, Health v2 & Early Warnings |
| **Total** | **`428`** | **Exact match to source code** |

### 1.3 Rate Limiting & Auth Middleware Gaps
- `server/utils/rateLimiter.js` defines `createRateLimiter` (`L11`), `aiRateLimiter` (`15 req/min`), and `githubRateLimiter` (`20 req/min`) backed by an unbounded in-memory `Map`. `createRateLimiter` is imported unused at `server/index.js:30` — **zero HTTP routes and zero Socket.IO handlers have rate limiting attached**.
- `requireAuth` (`server/auth.js:40–47`) reads only `Authorization: Bearer <token>` and does **not** accept the `nf_jwt` cookie set by Google OAuth.
- JWT `sign()` (`server/auth.js:7`) encodes `{ id, email, name }` — **`_id` and `role` are NOT included in the JWT**, breaking every `req.user._id` check in `discovery.js` and `req.user?.role` checks in `projects.js:4150` / `scrum.js:125`.

---

## 2. Core Auth, User, Chat, Skills, Discovery, GitHub, Hybrid & Workstreams 21–25 Endpoints

### 2.1 `server/index.js` (`9` Declarations)
| Method | Exact Path(s) | Auth | Object-Level AuthZ | Params / Body | Services / Models | Socket / Notes |
|---|---|---|---|---|---|---|
| `GET` | `/` (`L48`) | None | N/A | `?query` forwarded | `getFrontendUrl()` | Redirects to `${FRONTEND_URL}/?${query}` (open query param forwarding). |
| `POST` | `/api/auth/signup` (`L105`), `/api/signup` (`L106`) | None | N/A | `{ name, email, password, confirmPassword }` | `User`, `sign()`, `formatUser()` | Alias pair; requires `password.length >= 6` & confirmation match. |
| `POST` | `/api/auth/login` (`L142`), `/api/login` (`L143`) | None | N/A | `{ email, password }` | `User` (`+password`), `comparePassword`, `sign()` | Strictly passworded (`400` if omitted; legacy passwordless docs are wrong). |
| `GET` | `/api/me` (`L146`) | `requireAuth` | Self (`req.user.id`/`email`) | — | `User`, `formatUser` | Falls back to echoing `req.user` on DB miss. |
| `PATCH` | `/api/me` (`L225`), `/api/users/profile` (`L226`), `/api/user/profile` (`L227`) | `requireAuth` | Self (`req.user.id`) | `{ name, avatar, bio, role, experience, skills }` | `User`, `Team.updateMany` (`name`/`avatar`) | **High risk:** unvalidated 15MB `avatar` & self-editable `role`/`name` (enables display-name spoofing). |

### 2.2 `server/routes/auth.js` (`5` Declarations, mounted at `/api`)
| Method | Exact Path | Auth | AuthZ / State Check | Params / Body | Models / External | Defects / Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/auth/google` (`L63`) | None | CSPRNG 32-char `state` (`oauthStateStore` `Map`, 5m TTL) | — | Google OAuth authorize redirect | In-memory Map fails multi-instance; modulo bias `256 % 62`. |
| `GET` | `/api/auth/google/callback` (`L82`) | None | Validates state in `oauthStateStore` | `?code, ?state, ?error` | Google `token` + `tokeninfo`, `User`, `sign()` | **Omits `payload.aud` & `email_verified` checks**; sets `nf_jwt` cookie AND exposes JWT in `?token=...` redirect URL. |
| `POST` | `/api/auth/forgot-password` (`L163`) | None | Generic `200` | `{ email }` | `User`, `PasswordReset` | **Broken `L188`:** `$ne: new ObjectId()` marks newly created token `used: true`; no email sender. |
| `POST` | `/api/auth/reset-password` (`L200`) | None | `findValidResetToken` | `{ token, password, confirmPassword }` | `PasswordReset`, `User`, `sign()` | **Broken `L263`:** queries global `.limit(1)` latest unused reset across all users! |
| `GET` | `/api/auth/reset-password/validate` (`L243`) | None | `findValidResetToken` | `?token` | `PasswordReset` | Uses same broken global `.limit(1)` lookup. Returns `{ valid }`. |

### 2.3 `server/routes/chat.js` (`8` Declarations, mounted at `/api`)
| Method | Exact Path | Auth | Object-Level AuthZ | Params / Body | Models / Socket Emits | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/chat/unread` (`L38`) | `requireAuth` | User's teams (`ownerId` / `members.userId`) | — | `User.chatRead`, `Team`, `ChatMessage` | Properly scoped. |
| `POST` | `/api/chat/read` (`L66`) | `requireAuth` | Team membership if `scope !== "global"` | `{ scope }` | `Team`, `User` | Marks channel read timestamp. |
| `GET` | `/api/chat/global` (`L99`) | `requireAuth` | Any authenticated user | `?limit` (<=100), `?before` | `ChatMessage` | Validated ObjectId cursor. |
| `POST` | `/api/chat/global` (`L118`) | `requireAuth` | `resolveAuthUser` | `{ message, replyTo }` | Emits `chat:global:new` to `chat:global` | No max-length validation; `replyTo` unscoped. |
| `GET` | `/api/chat/team/:teamId` (`L147`) | `requireAuth` | Team member/owner (`ownerId`/`members.userId`) | `:teamId`, `?limit`, `?before` | `Team`, `ChatMessage` | Strong membership check. |
| `POST` | `/api/chat/team/:teamId` (`L185`) | `requireAuth` | Team member/owner | `:teamId`, `{ message, replyTo }` | Emits `chat:team:new` to `chat:team:${teamId}` | **Client bug:** `useChat.ts` never emits `chat:join_team`. |
| `PATCH` | `/api/chat/:messageId` (`L236`) | `requireAuth` | Sender (`senderId: authUser._id`) | `:messageId`, `{ message }` | `ChatMessage` (no Socket emit) | Dead in UI (`useChat.editMessage` unused). |
| `DELETE` | `/api/chat/:messageId` (`L268`) | `requireAuth` | Sender (`senderId: authUser._id`) | `:messageId` | Soft deletes `deletedAt` (no Socket emit) | Dead in UI (`useChat.deleteMessage` unused). |

### 2.4 `server/routes/skills.js` (`6`), `server/routes/ai.js` (`2`), `server/routes/userLookup.js` (`1`)
| Router & Line | Method | Exact Path | Auth | AuthZ / Trust Notes |
|---|---|---|---|---|
| `skills.js:35,36` | `GET` | `/api/skills/canonical`, `/api/skills/taxonomy` | **None** | Public skill catalog alias pair (`?category, ?role`). |
| `skills.js:42` | `POST` | `/api/skills/verify` | `requireAuth` | Self `userId` match; **CRITICAL TRUST FLAW:** accepts client `score`/`totalQuestions` unverified. |
| `skills.js:109` | `GET` | `/api/skills/verifications` | `requireAuth` | Returns caller's `SkillVerification[]` bare JSON array (`ApplyRoleModal.tsx` expects `{ verifications }` -> bug). |
| `skills.js:126` | `GET` | `/api/skills/team/:teamId/graph` | `requireAuth` | Team member/owner; returns `{ teamId, teamName, members, coverage }` (`ChatPanel.tsx:103` expects array -> bug). |
| `skills.js:208` | `GET` | `/api/skills/team/:teamId/gaps` | `requireAuth` | Team member/owner; computes member verified skill coverage vs project tasks. |
| `ai.js:827` | `POST` | `/api/ai/quiz/generate` | `requireAuth` | `omniRouteGenerate` + `quizQuestionBanks.js` fallback; **returns `correctIndex` to client**; no `aiRateLimiter`. |
| `ai.js:893` | `POST` | `/api/ai/quiz/submit` | `requireAuth` | **CRITICAL TRUST FLAW (`L913–914`):** grades quiz using client-submitted `questions[i].correctIndex`! |
| `userLookup.js:23` | `GET` | `/api/users/lookup` | `requireAuth` | Unthrottled email lookup returning `{ _id, name, email, avatar, skills, role }` (enumeration risk). |

### 2.5 `server/routes/discovery.js` (`12` Declarations, mounted at `/api`)
| Line | Method | Exact Path | Auth | AuthZ & Verified Defects |
|---|---|---|---|---|
| `L37` | `GET` | `/api/discovery/teams` | **None** | `isDiscoverable: true` only; **ReDoS (`L53–83`)** passing unescaped query inputs into `new RegExp(...)`. |
| `L140` | `GET` | `/api/discovery/teams/:teamId` | **None** | `team.isDiscoverable === true` only (strips emails). |
| `L203` | `PATCH` | `/api/teams/:teamId/discovery` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** -> always `403`; also raw spreads `...req.body.discoverySettings` (`L224`). |
| `L244` | `POST` | `/api/teams/:teamId/open-roles` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** -> always `403`. |
| `L299` | `PATCH` | `/api/teams/:teamId/open-roles/:roleId` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** + omits ObjectId validation. |
| `L339` | `DELETE` | `/api/teams/:teamId/open-roles/:roleId` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** + omits ObjectId validation. |
| `L369` | `POST` | `/api/discovery/teams/:teamId/roles/:roleId/apply` | `requireAuth` | Works (`user._id || user.id`); trusts client `quizResult.score` against `minVerificationScore`. |
| `L397` | `GET` | `/api/my-applications` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** -> queries `{ applicantId: undefined }`. |
| `L413` | `POST` | `/api/applications/:applicationId/withdraw` | `requireAuth` | Works (`applicationService.withdrawApplication`). |
| `L440` | `GET` | `/api/teams/:teamId/applications` | `requireAuth` | **BROKEN (`req.user._id` is `undefined`)** -> always `403`. |
| `L468` | `POST` | `/api/applications/:applicationId/accept` | `requireAuth` | Works (leader check in `applicationService.acceptApplication`). |
| `L491` | `POST` | `/api/applications/:applicationId/reject` | `requireAuth` | Works (leader check in `applicationService.rejectApplication`). |

### 2.6 `server/routes/github.js` (`12` Declarations, mounted at `/api`)
| Line | Method | Exact Path(s) | Auth | AuthZ & Notes |
|---|---|---|---|---|
| `L115` | `GET` | `/api/github/config` | **None** | Reports OAuth config readiness & issue hints without secret values. |
| `L130` | `GET` | `/api/github/auth/init` | `requireAuth` | Optional `verifyProjectAccess`; creates Mongo `OAuthState` (256-bit CSRF token, 10m TTL). |
| `L185` | `GET` | `/api/github/auth/callback` | None (OAuth state) | Atomic `consumeState()` on success; **bugs:** `?error=` skips atomic consume (`L190`), `/(tabs)/dashboard&github_auth=` missing `?` (`L273`), leaks `err.message` (`L276`). |
| `L281` | `GET` | `/api/github/user/repos` | `requireAuth` | Self (`GitHubCredential`/`GitHubIntegration` AES-256-CBC decrypt + Octokit user repos); no `githubRateLimiter`. |
| `L321` | `POST` | `/api/projects/:projectId/github/connect` | `requireAuth` | `verifyProjectAccess` (any member; **!team fallthrough L98**); path-interpolation risk on `repoOwner`/`repoName`. |
| `L419` | `GET` | `/api/projects/:projectId/github/status` | `requireAuth` | `verifyProjectAccess`; strips `encryptedToken`. |
| `L468` | `GET` | `/api/projects/:projectId/github/summary` | `requireAuth` | `verifyProjectAccess`; 5-min repo cache. |
| `L512` | `POST` | `/api/projects/:projectId/github/sync`, `/refresh` | `requireAuth` | `verifyProjectAccess`; triggers `indexRepositoryForProject` + `ProjectMemory` (`CODE_INTELLIGENCE`). |
| `L540` | `DELETE` | `/api/projects/:projectId/github` | `requireAuth` | `verifyProjectAccess` (any member can disconnect); clears `encryptedToken`. |
| `L580` | `GET` | `/api/projects/:projectId/github/tree` | `requireAuth` | `verifyProjectAccess`; serves `RepositoryIndex` incl. 1500-char `contentSnippet` of project auth files. |
| `L609` | `POST` | `/api/projects/:projectId/context/query` | `requireAuth` | `verifyProjectAccess`; calls `answerWorkspaceQuery` (**leaks cross-user `TemporaryContext`; dead catch fallback**). |
| `L637` | `GET` | `/api/projects/:projectId/context/snapshot` | `requireAuth` | `verifyProjectAccess`; returns assembled 12KB bounded workspace context. |

### 2.7 `server/routes/hybrid.js` (`6` Declarations, mounted at `/api/hybrid` w/ router `requireAuth`)
*Zero frontend API calls exist in `client/` for any Hybrid route. `verifyProjectAccess` checks `m.name === userEmail` (`L70`) and skips membership checks if `!team` (`L72`).*
- `L94`: `GET /api/hybrid/templates` — returns `HYBRID_TEMPLATES` (`5` presets).
- `L100`: `GET /api/hybrid/overview/:id` — returns Hybrid state + unresolved execution rules.
- `L114`: `GET /api/hybrid/config/:id` — returns normalized `project.hybridConfig`.
- `L129`: `POST /api/hybrid/configure/:id` — validates & persists `hybridConfig`; emits `hybrid:configured` to `team:${teamId}`.
- `L169`: `POST /api/hybrid/validate` — stateless coherence validator (`5` rules).
- `L181`: `POST /api/hybrid/apply-template/:id` — applies preset template (`isTeamLeader`); emits `hybrid:configured` to `team:${teamId}`.

### 2.8 `server/routes/workstreams21to25.js` (`21` Declarations, mounted at `/api`)
*CRITICAL AuthZ Flaw: `authorizeProjectAccess` (`L104`) falls through with `{ isLeader: true }` if `!project.teamId` or `Team.findById` is `null`!*
| Line | Method | Exact Path(s) | AuthZ & Verified Bugs | Socket Events (`projectSyncHandlers`) |
|---|---|---|---|---|
| `L112,137,150` | `GET,GET,POST` | `/api/projects/:projectId/lessons`, `/lessons/evidence`, `/lessons/generate` | `authorizeProjectAccess` | `lesson.created` -> `project:${id}` |
| `L164,187,211` | `PATCH` | `/api/projects/:projectId/lessons/:lessonId/{validate,apply,archive}` | **`validate`/`archive` + `isLeader`; `/apply` misses `isLeader`!** **All 3 IDOR:** `ProjectLesson.findById(lessonId)` skips `projectId` match! | `lesson.{validated,applied,archived}` -> `project:${id}` |
| `L229` | `GET` | `/api/lessons/reusable` | **NONE** — dumps validated/applied lessons across *all* projects globally. | — |
| `L244` | `GET` | `/api/projects/:projectId/capability-overview` | `authorizeProjectAccess` (`CapabilityIntelligencePanel`) | — |
| `L257` | `GET` | `/api/teams/:teamId/members/:userId/capability` | **NONE** — unverified `:teamId` membership (IDOR). | — |
| `L268,281` | `GET,POST` | `/api/projects/:projectId/assignment/{preview,accept}` | `authorizeProjectAccess` (`/accept` requires `isLeader`) | `assignment.accepted`, `capability.updated`, `task:*`, `project:{health,risk}:updated` |
| `L313,328,341,355` | `GET,GET,POST,POST` | `/api/projects/:projectId/decisions/explain/{:decisionId,type/:decisionType,task-priority/:taskId,counterfactual}` | **All orphaned UI (`DecisionExplanationDrawer`)**; **`L313,341,355` have cross-project IDOR** (no `projectId` filter in service lookups!). | `decision.updated` (`L341`) |
| `L373` | `POST` | `/api/decisions/:decisionId/ai-summary` | **NONE (Critical IDOR + calls fake stub `aiProviderAbstraction.executeAiQuery`)!** | — |
| `L387` | `GET` | `/api/projects/:projectId/health-v2`, `/health2` | `authorizeProjectAccess` (error fallback for `UnifiedProjectHealthPanel`) | `health.updated`, `warning.{opened,resolved}` |
| `L401` | `GET` | `/api/projects/:projectId/warnings` | `authorizeProjectAccess` (`ProjectHealth2Panel` orphaned) | — |
| `L416,430,448` | `PATCH` | `/api/projects/:projectId/warnings/:warningId/{acknowledge,resolve,dismiss}` | `resolve`/`dismiss` + `isLeader`; **All 3 cross-project IDOR** (`EarlyWarning.findById` omits `projectId`). | `warning.{acknowledged,resolved}` |

---

## 3. Team & Kanban Routers (`teams.js` & `kanban.js`)

### 3.1 `server/routes/teams.js` (`41` Declarations, mounted at `/api`; `L144` `router.use("/teams/:teamId", requireAuth, verifyTeamAccess)`)
*`verifyTeamAccess` (`L71–99`) allows display-name spoofing (`mName === userName` at `L87`) and empty/unowned team bypass (`L88`).*
| Line | Method | Exact Path | AuthZ / Scope & Socket Events | Verified Notes / Bugs |
|---|---|---|---|---|
| `L103` | `GET` | `/api/teams` | Filters by `ownerId`, `members.userId`, OR `members.name: userName` (`L118`) | Name-matching cross-team leakage. |
| `L159` | `GET` | `/api/teams/:teamId` | `verifyTeamAccess` | Hydrates workspace + tasks + active project. |
| `L211` | `POST` | `/api/teams` | Authenticated creator | Enforces >=1000-char project description; optional AI/BAA decomposer. |
| `L401` | `POST` | `/api/teams/:teamId/members` | `verifyTeamAccess` (**any member**); emits `member:added` to `team:${id}` | Looks up by email OR `name` (`L416`) -> wrong-user hazard. |
| `L452` | `POST` | `/api/teams/:teamId/invitations` | `verifyTeamAccess` + `invitationService` (name check `L65`); emits `invitation:received` to `user:*` | — |
| `L485` | `GET` | `/api/invitations` | Self (`inviteeId` / `inviteeEmail`) | Polled every 15s by `useInvitations`. |
| `L512,609` | `POST` | `/api/invitations/:invitationId/{accept,reject}` | Invitee; emits `member:added` & `invitation:updated` | Mutates team + notifications. |
| `L663,684` | `GET,PATCH` | `/api/notifications`, `/api/notifications/:id/read` | Self (`userId`) | `PATCH .../read` is never called by `NotificationCenter.tsx`! |
| `L712` | `PATCH` | `/api/teams/:teamId` | `verifyTeamAccess` (no leader check!) | Does NOT emit `team:updated` (`useTeam.ts:162` listens in vain). |
| `L753,923` | `POST` | `/api/teams/:teamId/generate-tasks`, `/ai-suggest` | `verifyTeamAccess`; no `aiRateLimiter` | `L875` `JSON.parse` fails on Markdown fences; `L1120` undefined prompt. |
| `L1301,1506,1522` | `POST,GET,POST` | `/api/teams/:teamId/decide`, `/decide/types`, `/project-guidance` | `verifyTeamAccess`; no `aiRateLimiter`; 12s route timers ignored by `omniRouteGenerate` | `DecisionPanel` & `GuidancePanel`. |
| `L1634` | `GET` | `/api/teams/:teamId/members/:userId/profile` | `verifyTeamAccess` | `MemberProfileModal`. |
| `L1713` | `DELETE` | `/api/teams/:teamId/members/:userId` | `verifyTeamAccess` + owner/leader; emits `member:removed`, `team:member_left` | Unassigns tasks & logs `TeamDeparture`. |
| `L1831` | `PATCH` | `/api/teams/:teamId/members/:userId` | `verifyTeamAccess` (**NO leader/self check!**); emits `member:updated` | **Privilege escalation:** any member can set `role: "leader"`. |
| `L1859,2735` | `PATCH` | `/api/teams/:teamId/members/{me,:userId}/skills` | `verifyTeamAccess` + self (`L2773` compares `name` if IDs absent); emits `member:skills_updated` | Skill ratings & capacity. |
| `L1914` | `POST` | `/api/teams/:teamId/leave` | `verifyTeamAccess`; blocks `ownerId`; emits `team:member_left`, `member:removed` | — |
| `L2059` | `DELETE` | `/api/teams/:teamId` | Strict `ownerId`; emits `team:deleted` | Cascades team/project cleanup. |
| `L2139,2191` | `POST,GET` | `/api/teams/:teamId/tasks` | `verifyTeamAccess`; `POST` emits `task:created` | Classic & Waterfall task CRUD. |
| `L2204` | `GET` | `/api/teams/:teamId/tasks/scheduled` | `verifyTeamAccess` | **0 UI callers.** Greedy schedule preview. |
| `L2223` | `GET` | `/api/teams/:teamId/tasks/analytics` | `verifyTeamAccess` | `sortAlgorithms.js` Bubble vs Merge benchmark (**`AnalyticsPanel` unreachable**). |
| `L2253,2276` | `GET` | `/api/teams/:teamId/tasks/execution-order`, `/dependency-graph` | `verifyTeamAccess` | Kahn topological order & adjacency DAG. |
| `L2311,2353` | `POST,DELETE` | `/api/teams/:teamId/tasks/:taskId/dependencies`, `/:depId` | `verifyTeamAccess`; **BUG `L2353`:** `Task.updateOne({ _id: taskId })` omits `teamId` (cross-team IDOR)! | `removeDependency` unused in UI. |
| `L2377` | `POST` | `/api/teams/:teamId/sprint-optimize` | `verifyTeamAccess` | Inline duplicated 0/1 Knapsack DP (`×10` scaled hours, max `200`). |
| `L2491,2580,2632` | `PATCH,DELETE,POST` | `/api/teams/:teamId/tasks/:taskId`, `/duplicate` | `verifyTeamAccess`; enforces Waterfall phase gates (`L2511`); emits `task:*`, `waterfall:phase:updated`, health/risk | Scoped by `{ _id: taskId, teamId }`. |
| `L2671,2692` | `POST,GET` | `/api/teams/:teamId/restore-backlog`, `/health` | `verifyTeamAccess` | Classic `OverviewPanel` & `ClassicOverviewPanel` health check. |
| `L2707` | `PATCH` | **`/api/tasks/:taskId/priority`** | **`requireAuth` ONLY — skips `L144` `/teams/:teamId` middleware!** | **CRITICAL CROSS-TEAM IDOR:** Any user can reprioritize any task! |
| `L2879,3168` | `POST,GET` | `/api/teams/:teamId/assign`, `/waterfall/state` | `verifyTeamAccess` | Branch & Bound auto-assign & Waterfall phase states. |
| `L3188` | `POST` | `/api/teams/:teamId/tasks/:taskId/recalculate` | Declared **after `export default router;` (`L3181`)**; `L3205` misses `task.teamId === teamId`; stubs planning result; doesn't persist `greedyVersion`; **0 UI callers**! | Dead/stub endpoint. |

### 3.2 `server/routes/kanban.js` (`44` Declarations, mounted at `/api/kanban` w/ router `requireAuth`)
*Every operation exposes dual path aliases (`/op/:id` and `/:projectId/op` = 2–4 Express route registrations each). **CRITICAL FLAWS:** `verifyProjectAccess` (`L78–113`) creates a `KANBAN` `Project` & overwrites `team.activeProjectId`/`methodology` BEFORE membership validation, and `handleBacklog`/`handleContinuousDelivery` (`L192–206, L729–732`) overwrite `$or` project isolation!*
| Line(s) | Method | Exact Alias Pair(s) | Client Helper (`kanbanApiService.ts`) & Notes |
|---|---|---|---|
| `L135–136` | `GET` | `/api/kanban/overview/:id`, `/:projectId/overview` | `fetchKanbanOverview` (active; **GET side-effect creates Project before authZ!**) |
| `L150–151` | `GET` | `/api/kanban/board/:id`, `/:projectId/board` | `fetchKanbanBoard` (active) |
| `L181–184` | `POST` | `/api/kanban/pull`, `/:projectId/pull`, `/move`, `/:projectId/move` | `pullKanbanItem`; **`checkDefinitionOfDone` dead (`kanbanEngine.js:15`)**; **cross-project `Task.findById(taskId)` IDOR** |
| `L226–227` | `GET` | `/api/kanban/backlog/:id`, `/:projectId/backlog` | `fetchKanbanBacklog`; **duplicate `$or` overwrite leaks cross-tenant backlog!** |
| `L254–255` | `POST` | `/api/kanban/backlog/replenish`, `/:projectId/backlog/replenish` | `replenishKanbanBacklog` (active) |
| `L334–335` | `POST` | `/api/kanban/tasks`, `/:projectId/tasks` | `createKanbanTask` (active; hardcodes `"backlog"` in UI) |
| `L392–393` | `PATCH` | `/api/kanban/tasks/:taskId`, `/:projectId/tasks/:taskId` | `updateKanbanTask` (**0 UI callers; cross-project IDOR**) |
| `L418–421` | `GET` | `/api/kanban/flow-metrics/:id`, `/:projectId/flow-metrics`, `/flow/:id`, `/:projectId/flow` | `fetchKanbanFlowMetrics` (`KanbanFlowPanel`; **no CFD data**) |
| `L437–438` | `GET` | `/api/kanban/blockers/:id`, `/:projectId/blockers` | `fetchKanbanBlockers` (**0 UI callers**) |
| `L476–477` | `POST` | `/api/kanban/blockers`, `/:projectId/blockers` | `createKanbanBlocker` (**cross-project IDOR**) |
| `L522–523` | `PATCH` | `/api/kanban/blockers/:blockerId`, `/:projectId/blockers/:blockerId` | `updateKanbanBlocker` (**0 UI callers; cross-project IDOR**) |
| `L546–547` | `GET` | `/api/kanban/team/:id`, `/:projectId/team` | `fetchKanbanTeam` (active) |
| `L565–566` | `GET` | `/api/kanban/policies/:id`, `/:projectId/policies` | `fetchKanbanPolicies` (active) |
| `L626–627` | `PUT` | `/api/kanban/policies/:id`, `/:projectId/policies` | `updateKanbanPolicies` (leader-enforced; no UI `isLeader` gate) |
| `L660–661` | `GET` | `/api/kanban/health/:id`, `/:projectId/health` | `fetchKanbanHealth` (**0 UI callers; 2x WIP violation bug**) |
| `L720–721` | `GET` | `/api/kanban/continuous-improvement/:id`, `/:projectId/continuous-improvement` | `fetchKanbanContinuousImprovement` (active) |
| `L744–745` | `GET` | `/api/kanban/continuous-delivery/:id`, `/:projectId/continuous-delivery` | `fetchKanbanContinuousDelivery` (**duplicate `$or` tenant leak!**) |
| `L772–773` | `POST` | `/api/kanban/change-impact/:id`, `/:projectId/change-impact` | `simulateKanbanChangeImpact` (**0 UI callers**) |
| `L794–795` | `GET` | `/api/kanban/events/:id`, `/:projectId/events` | `fetchKanbanEvents` (**0 UI callers**) |
| `L836–837` | `GET` | `/api/kanban/copilot-context/:id`, `/:projectId/copilot-context` | `fetchKanbanCopilotContext` (**0 UI callers**) |

### 3.3 `server/routes/scrum.js` (`121` Declarations, mounted at `/api/scrum` w/ router `requireAuth`)
*Supports dual conventions (`/op/:id` and `/:projectId/op`, up to `5` aliases per action). **`verifyProjectAccess` (`L73–159`) vulnerabilities:** (1) `mName === userName` display-name spoofing (`L121`), (2) unowned/empty team bypass (`L125`), (3) GET side-effect creating `Project` (`L137–151`). Zero Scrum UI panels register Socket listeners for Scrum events (`scrum:*`, `sprint:*`, `project:risk:updated`).*

| Line(s) | Method | Exact Path(s) under `/api/scrum` | AuthZ & Verified Notes | Socket Emits & Client Helper |
|---|---|---|---|---|
| `L209` | `POST` | `/setup` | `verifyProjectAccess` (no leader check); enforces `isScrumEnabled()` | — |
| `L353–354, 374–375` | `GET,PUT` | `/config/:id`, `/:projectId/config` | `verifyProjectAccess` (no leader check); `PUT` spreads raw `req.body` | — |
| `L517–518` | `GET` | `/overview/:id`, `/:projectId/overview` | `verifyProjectAccess`; uses unweighted `scrumEngine.calculateScrumHealth` | `fetchScrumOverview` |
| `L562–563, 591–592` | `GET,POST` | `/sprints/:id`, `/:projectId/sprints` | `verifyProjectAccess`; lists or creates `PLANNING` sprint | `fetchSprints`, sprint create |
| `L636–637` | `PUT` | `/sprints/:sprintId`, `/:projectId/sprints/:sprintId` | `verifyProjectAccess(sprint.projectId)` (ignores `:projectId` match check) | Sprint edit |
| `L662–663` | `POST` | `/sprints/:sprintId/start`, `/:projectId/sprints/:sprintId/start` | `verifyProjectAccess` | `startSprint` |
| `L745–746` | `POST` | `/sprints/:sprintId/complete`, `/:projectId/sprints/:sprintId/complete` | `verifyProjectAccess` + **BUG `L680`:** checks nonexistent `team.leaderId`; **409 safety guard** on unfinished tasks | `project:` & `team:` -> `sprint:completed`; `completeSprint` |
| `L772–773` | `POST` | `/sprints/:sprintId/cancel`, `/:projectId/sprints/:sprintId/cancel` | `verifyProjectAccess` | — |
| `L909–910` | `DELETE` | `/sprints/:sprintId`, `/:projectId/sprints/:sprintId` | Leader/owner (`team.ownerId` at `L807`) + checks `:projectId`; rejects `ACTIVE`/`COMPLETED`/`REVIEW` | `team:` -> `scrum:sprint_deleted`; `deleteSprint` |
| `L964–965, 1001–1002` | `GET,POST` | `/sprints/:sprintId/review`, `/:projectId/sprints/:sprintId/review` | `verifyProjectAccess`; `POST` spreads raw `req.body` into `sprint.review` | `fetchSprintReview`, `submitSprintReview` |
| `L1039–1040, 1095–1096` | `GET,POST` | `/backlog/:id`, `/:projectId/backlog` | `verifyProjectAccess`; `getScrumTaskQuery` + `scrumPriorityEngine` | `fetchScrumBacklog`, `createBacklogItem` |
| `L1155–1156, 1180–1181` | `PUT,DELETE` | `/backlog/task/:taskId`, `/:projectId/backlog/:itemId` | `verifyProjectAccess(task.projectId)` (doesn't verify `:projectId` match) | `updateBacklogItem`, `deleteBacklogItem` |
| `L1237–1239` | `POST` | `/planning/candidates/:id`, `/:projectId/planning/candidates`, `/:projectId/sprints/:sprintId/plan` | `verifyProjectAccess` | `calculatePlanningCandidates` (`ScrumPlanPanel` only!) |
| `L1353–1354` | `POST` | `/planning/commit/:id`, `/:projectId/planning/commit` | `verifyProjectAccess` | `team:` -> `scrum:sprint_committed`; `commitSprintPlan` |
| `L1374–1375` | `POST` | **`/sprints/:sprintId/items`, `/:projectId/sprints/:sprintId/items`** | **NONE — CRITICAL IDOR!** Missing `verifyProjectAccess`! | Any user can add any task to any sprint |
| `L1395–1396` | `DELETE` | **`/sprints/:sprintId/items/:taskId`, `/:projectId/sprints/:sprintId/items/:taskId`** | **NONE — CRITICAL IDOR!** Missing `verifyProjectAccess`! | Any user can remove any task from any sprint |
| `L1440–1441` | `PUT` | `/task/:taskId/status`, `/:projectId/tasks/:taskId/status` | `verifyProjectAccess`; triggers `scrumReactiveEngine` | `project:` -> `sprint:impact`; `updateScrumTaskStatus` |
| `L1602–1606` | `GET` | `/capacity/:id`, `/:projectId/capacity`, `/capability/:id`, `/:projectId/capability`, `/:projectId/sprints/:sprintId/capacity` | `verifyProjectAccess` (`5` aliases) | `fetchScrumCapacity` |
| `L1682–1685` | `POST` | `/capability/:id/assign`, `/:projectId/capability/assign`, `/assignment/accept`, `/:projectId/assignment/accept` | `verifyProjectAccess` (`4` aliases) | `team:` -> `scrum:assignment_updated`; `acceptScrumAssignment` |
| `L1880–1883` | `POST` | `/capability/:id/bulk-assign`, `/:projectId/capability/bulk-assign`, `/assignment/bulk-accept`, `/:projectId/assignment/bulk-accept` | `verifyProjectAccess` + leader check (`4` aliases) | `team:` -> `scrum:bulk_assignment_updated`; **`ScrumInsightsPanel` UI modal broken** |
| `L1985–1986, 2091–2092, 2129–2130` | `GET,POST,DELETE` | `/dependencies/:id`, `/:projectId/dependencies` | `verifyProjectAccess` | `team:` -> `scrum:dependency_updated` on POST |
| `L2149–2151` | `POST` | `/dependencies/check-cycle`, `/dependencies/check-cycle/:id`, `/:projectId/dependencies/check-cycle` | `verifyProjectAccess` (when ID supplied; `3` aliases) | `scrumDependencyEngine` |
| `L2264–2265` | `GET` | `/insights/:id`, `/:projectId/insights` | `verifyProjectAccess` | `fetchScrumInsights` |
| `L2281–2282` | `GET` | **`/analytics/:id`, `/:projectId/analytics`** | **NONE — CRITICAL IDOR!** Missing `verifyProjectAccess`! | `fetchScrumAnalytics` (**linear synthetic burndown**) |
| `L2321–2322, 2361–2362` | `GET,POST` | `/health/:id`, `/:projectId/health`, `/health/:id/refresh`, `/:projectId/health/refresh` | `verifyProjectAccess`; `scrumHealthService` weighted snapshot | `project:` & `team:` -> `scrum:health:updated` |
| `L2388–2389, 2408–2409, 2464–2465` | `GET,POST,PATCH` | `/risks/:id`, `/:projectId/risks`, `/risks/:id/scan`, `/:projectId/risks/scan`, `/risks/:id/:riskId`, `/:projectId/risks/:riskId` | `verifyProjectAccess`; persists `Risk` (`methodology: "SCRUM"`) | `project:` & `team:` -> `project:risk:updated` |
| `L2552–2553` | `GET` | `/timeline/:id`, `/:projectId/timeline` | `verifyProjectAccess` | `fetchScrumTimeline` (`ScrumTimelinePanel` **unreachable**!) |
| `L2670–2672, 2748–2749` | `GET,POST` | `/retrospective/:id`, `/:projectId/retrospective`, `/:projectId/sprints/:sprintId/retrospective` | `verifyProjectAccess`; **no `aiRateLimiter`** on `POST` | `fetchScrumRetrospective`, `generateScrumRetrospective` |
| `L2828–2829` | `GET` | `/copilot/context/:id`, `/:projectId/copilot-context` | `verifyProjectAccess` | Scrum advisor context |
| `L2888–3145` | `GET/POST/PATCH/PUT` | `/plan/:id`, `readiness`, `finalize`, `conflicts`, `analyze`, `generate`, `suggestions/{approve,bulk-approve,reject}`, draft PUT (`20` route lines) | `verifyProjectAccess`; **no `aiRateLimiter`** on `/analyze` & `/generate` | `team:` -> `scrum:plan:finalized` on `L2944–2945` |
| `L3171–3172, 3208–3209` | `GET,POST` | `/sprints/:sprintId/standup`, `/:projectId/sprints/:sprintId/standup` | `verifyProjectAccess`; persists `Sprint.dailyScrumCheckins` | `fetchSprintStandup`, `submitSprintStandup` |
| `L3318–3319, 3364–3365` | `POST,PUT` | `/retrospective/:id/actions`, `/:projectId/retrospective/actions`, `.../:actionId` | `verifyProjectAccess` | `addRetroAction`, `updateRetroAction` |
| `L3432–3433` | `GET` | `/insights/:id/learning-loop`, `/:projectId/insights/learning-loop` | `verifyProjectAccess` | Removed from `ScrumInsightsPanel` subtabs (`scrumApiService` helper remains) |
| `L3479–3480` | `POST` | `/backlog/task/:taskId/decompose`, `/:projectId/backlog/:taskId/decompose` | `verifyProjectAccess`; **creates 3 deterministic template subtasks, NOT LLM!** | `decomposeStory` |

---

## 4. `server/routes/projects.js` (`140` Declarations — Dual-Mounted `/api` AND `/`)

*Every handler below responds on BOTH `/api/...` (`index.js:235`) and `/...` (`index.js:236`). `findProject` / `findProjectDoc` (`L151–193`) inherits display-name spoofing (`mName === userName` at `L179`), skips auth if `!project.teamId` / `!team` (`L165`), and treats `!ownerId && !members.length` as open (`L183`).*

| Line(s) | Method | Exact Path(s) under `/api` (and `/`) | Auth / AuthZ & Verified Findings |
|---|---|---|---|
| `L214–215` | `GET` | `/api/methodologies`, `/api/methodologies/availability` | **Public**; exposes `methodologyAvailability` status map (`CreateTeamModal`). |
| `L223, 260, 361, 373, 474` | `GET,POST,GET,PATCH,DELETE` | `/api/projects`, `/api/projects/:projectId` | `L235,302` match `members.name: userName`; **`L474 DELETE` allows ANY member (not owner/leader)** to delete entire project! |
| **`L432`** | `POST` | `/api/projects/:projectId/methodology-select` | `findProject`; directly updates methodology — **SHADOWS duplicate route at `L3918`!** |
| `L516, 538` | `GET,PATCH` | `/api/projects/:projectId/tasks`, `/context` | `findProject`. |
| **`L575`** | `GET` | `/api/projects/:projectId/plan` | `findProject`; **BUG `L598`:** queries `Task.find({ project: project._id })` missing `projectId`-only generated tasks! |
| `L656,763,854,902,963` | `POST,PATCH,PATCH,POST,DELETE` | `/api/projects/:projectId/artifacts*` (`/`, `/:artifactId`, `/approve`, `/approve-all`) | `findProjectDoc`; emits `waterfall:lifecycle:updated` to `team:${teamId}`. |
| `L1040,1102,1139,1232,1273,1291,1337,1425` | Mixed | `/api/projects/:projectId/plan/{extract,scope,conflicts/:conflictId,conflicts/recalculate,readiness,finalize}`, `/waterfall/state` | `PlanPanel` + `useWaterfallPlanLifecycle`; `finalize` emits `waterfall:plan:finalized` & `waterfall:phase:updated`; `/extract` is deterministic (no LLM!). |
| `L1439,1521,1592,1665,1700,1721` | Mixed | `/api/projects/:projectId/requirements*` (`/`, `/approve-all`, `/:reqId`, `/bulk-convert`, `/:reqId/convert-to-task`) | `L1439` uses `req.params.projectId`; `L1592` spreads `...req.body`; `bulk-convert` emits `tasks:updated` & `project:health:updated`. |
| `L1745–2225` (`24` routes) | `GET,POST,PATCH,DELETE` | `/api/projects/:projectId/{decisions,research,recommendations,architecture,resources}` (+ `/:id`, `/research/discover` `L1860`, `/tools` `L1880`) | `findProject`; `ProjectAdvisorPanel`; `research/discover` uses OpenAlex/Crossref (non-LLM). |
| `L2246–2312` (`4` routes) | `GET,POST` | `/api/projects/:projectId/conversations`, `/:convId/messages` | `findProject` + `conv.projectId` match. |
| `L2363,2417,2433,2451,2485,2517,2546,2592,2624,2662,2717,2744` (`12` routes) | Mixed | `/summary`, `/analyze`, `/intelligence`, `/ai/conversation`, `/ai/chat`, `/ai/messages/:id/feedback`, `/resources/discover`, `/decision-feedback*`, `/tasks/{generate,ai-suggest}` | `findProject`; **no `aiRateLimiter`** on `/analyze`, `/ai/chat`, `/resources/discover`, `/tasks/*`; **BUG:** `/ai/chat` HTTP 500 when OmniRoute returns `provider: "none"`. |
| **`L2803–3184` (`18` route decls / `20` URL aliases)** | Mixed | `/project-health`, `/health`, `/project-health/refresh`, `/health/refresh`, `/team-health*`, `/risks*` (`L2863,2893,2917`), `/opinions*` (`L2965,2977,3004,3036`), `/retrospectives*` (`L3075,3095,3110,3129`), `/insights*` (`L3154,3166`), `/brain` (`L3184`) | **CONFIRMED CRITICAL IDOR BLOCK:** **ZERO calls to `findProject`!** Any logged-in user can read `/brain` RAG memory, tamper decisions/opinions/risks, and trigger retrospective AI (`L3075` lacks `aiRateLimiter`) for ANY project! (`team-health`, `insights`, `brain`, non-Scrum `retrospectives` have unreachable/0 UI callers.) |
| `L3202,3215,3244,3265,3284,3303` (`6` routes) | `GET,POST` | `/phase-gates*` (`/`, `/advance`, `/override`), `/change-impact/simulate`, `/events` | `findProject`; **`ProjectEventTimeline` UI orphaned** (`/events` uncalled in UI); `/override` lacks route-level leader check. |
| `L3333,3411,3468,3522` (`4` routes) | `GET,POST,PATCH,GET` | `/requirements/coverage`, `/:reqId/evidence`, `/:reqId/coverage-state`, `/:reqId/traceability` | **0 UI callers (`BACKEND-ONLY`);** **BUGS `L3455, 3513`:** return `requirements[length - 1]` instead of target req! |
| **`L3590–3861` (`11` routes)** | `GET,POST,PATCH,DELETE` | **BROKEN PATH PREFIX `/:projectId/memory*`:** `/context`, `/summary`, `/persistent`, `/temporary`, `/`, `/:memoryId` (PATCH/DEL), `/archive`, `/restore`, `/context/prompt` | **ROUTING BUG:** Missing `/projects` prefix -> mounted at `/api/:projectId/memory*` & `/:projectId/memory*`; **0 UI callers!** |
| `L3884,3901,3918,3954,3970` (`5` routes) | `GET,POST` | `/methodology-recommendation`, `/methodology-select` (**DEAD** shadowed by `L432`), `/methodology-drift*` | **0 UI callers** for Advisor/Drift. |
| `L3992,4008,4038,4054,4076,4098` (`6` routes) | `GET,POST` | `/simulation/{baseline,run}`, `/digital-twin*`, `/process-mining`, `/workflow-conformance` | `findProject`; **ALL `4` matching UI components (`SimulationModal`, `DigitalTwinCore`, `ProcessMiningPanel`, `ConformancePanel`) are ORPHANED (`0` imports)!** |
| **`L4127–4412` (`11` routes)** | `GET,POST,PATCH` | `/faculty/assigned-projects`, `/teacher-reviews*`, `/academic-evaluation*`, `/contribution-{analysis*,disputes*}` | **ALL `3` UI panels (`TeacherReviewPortal`, `AcademicEvaluationPanel`, `FairContributionPanel`) are ORPHANED!** **CRITICAL AUTHZ:** Students can author Teacher Reviews, modify rubrics/scores as Faculty, and resolve disputes across projects (`teacherReviewService.js:145,195`, `fairContributionService.js:270` skip `projectId` filter)! |
| `L4440,4465,4482,4499,4521` (`5` routes) | `POST,GET,DELETE` | `/attachments`, `/temporary-contexts*`, `/copilot/query` | **`CopilotAttachmentBar` ORPHANED + `0` callers for `/attachments` & `/copilot/query`** (`answerMultimodalQuery` is deterministic regex only, no LLM). |
| `L4543,4559,4575` (`3` routes) | `GET,PATCH,GET` | `/domain-intelligence`, `/domain`, `/resolved-environment` | **`DomainIntelligencePanel` ORPHANED (`0` imports).** |
| `L4596` | `GET` | `/api/ai/local-models`, `/ai/local-models` | Static `LOCAL_MODEL_REGISTRY` (`RESEARCH_AND_INTEGRATION_FOUNDATION`); **0 UI callers**. |

---

## 5. Socket.IO Real-Time Protocol Reference

### 5.1 Transport, Handshake, CORS & Rooms (`server/index.js:244–268`)
- **Initialization (`L245`):** `new Server(server, { cors: { origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"] } })` — omits `:8082`, `:3000`, and `credentials: true` present in Express CORS (`L44`).
- **Auth Middleware (`L249–254`):** Validates JWT strictly from `socket.handshake.auth?.token` via `server/auth.js:verify()` (does not read `nf_jwt` cookie). Sets `socket.data.user = { id, email, name }`.
- **Auto-Joined Rooms:** `user:${userId}`, `user:${email.toLowerCase().trim()}`, and `chat:global` (`chatHandlers.js:12`).
- **Rate Limiting:** **None.**

| Room Pattern | Join Event & Handler | Room Authorization Strength | Status / Vulnerabilities |
|---|---|---|---|
| `user:${userId}`, `user:${email}` | Auto on connect | Signed JWT claim | Safe |
| `chat:global` | Auto on connect | Any authenticated socket | Intentional global feed |
| `chat:team:${teamId}` + `team:${teamId}` | `chat:join_team` (`chatHandlers.js:15–33`) | Strict DB `ownerId` / `members.userId` | Safe (**but `useChat.ts` never emits `chat:join_team`!**) |
| `team:${teamId}` | `room:join` (`taskHandlers.js:57–73`) | `verifyTeamAccess` (**INHERITS `name` spoofing & `!ownerId/!members` bypass!**) | Exploitable via `PATCH /api/me` `{ name }` |
| `project:${projectId}` | `room:join:project` (`projectSyncHandlers.js:47–61`) | Strict `ownerId` / `members.userId` check (fails closed if `!targetTeamId`) | Safe (**but omitted by `UnifiedProjectHealthPanel`, `PlanPanel`, `useWaterfallPlanLifecycle`, `ProjectHealth2Panel`**) |
| **Bare `${teamId}`** | **None (Never Joined!)** | N/A | **Orphan target:** `reactiveEngine.js:162` & `kanbanReactiveEngine.js:125` emit here -> dropped! |

### 5.2 Complete Inbound Client -> Server Socket Event Matrix (`17` Events)
| Event | Server Handler | AuthZ Check | Effects & Emitted Server Events |
|---|---|---|---|
| `chat:join_team` / `chat:leave_team` | `chatHandlers.js:15,35` | Strict DB check (`join`) | Joins/leaves `team:${teamId}` & `chat:team:${teamId}`. (**Uncalled by `useChat.ts`!**) |
| `chat:global:send` | `chatHandlers.js:42` | Socket JWT | Saves `ChatMessage(global)`, emits `chat:global:new` -> `chat:global`. |
| `chat:team:send` | `chatHandlers.js:66` | Strict DB check | Saves `ChatMessage(team)`, emits `chat:team:new` -> `chat:team:${teamId}`. |
| `room:join:project` / `room:leave:project` | `projectSyncHandlers.js:47,63` | Strict DB check (`join`) | Joins/leaves `project:${projectId}` (+ `activeProjectId`). (`RetroPanel`, `RiskPanel`, `TeamHealthPanel` omit `leave`!) |
| `room:join` / `room:leave` | `taskHandlers.js:57,75` | `verifyTeamAccess` (flawed) | Joins/leaves `team:${teamId}`. |
| `task:create` | `taskHandlers.js:80` | `verifyTeamAccess` (flawed) | Inserts `Task`, emits `task:created`, runs `recomputeAndBroadcast` (`task:execution-order`) & health/risk notify. |
| `task:delete` | `taskHandlers.js:134` | `verifyTeamAccess` + `{ _id, teamId }` | Deletes `Task`, emits `task:deleted`, recomputes DAG & health/risk. |
| **`task:update`** | `taskHandlers.js:159` | **`verifyTeamAccess(teamId)` ONLY — NO `teamId` filter on `findByIdAndUpdate`!** | **Cross-team Task IDOR (`L179,214`)!** Enforces `assertWaterfallTaskExecutable`, emits `task:updated`, `waterfall:phase:updated`, `task:execution-order`, health/risk. |
| `task:recompute_team` | `taskHandlers.js:244` | `verifyTeamAccess` | Re-runs `computePriorityScore`, emits `task:priority_refreshed` -> `team:${teamId}`. |
| `task:get-execution-order` | `taskHandlers.js:266` | `verifyTeamAccess` | Broadcasts `task:execution-order` -> `team:${teamId}`. |
| `chat:message` (`@ai`) | `aiOrchestrator.js:142` | `verifyTeamAccess` | Context-free `@ai` stream (`chat:stream`, `streamMock()` fallback on AI fail, `@ai plan sprint` -> `sprint:plan`), persists ephemeral tasks + auto-assigns (`task:created`, `task:assigned`). No rate limit; blocks `CLASSIC`. |
| `tasks:assign` | `aiOrchestrator.js:183` | `verifyTeamAccess` | Branch & Bound assign (`task:assigned` / `assign:warning` / `assign:error`). |
| `recommend:request` | `aiOrchestrator.js:191` | `verifyTeamAccess` | Emits caller-only `recommend:result` / `recommend:error` (`RecommendationPanel` **unreachable**!). |
| **`task:search`** | `aiOrchestrator.js:249` | **NONE — CRITICAL IDOR!** | Runs `boyerMooreSearch` on any `teamId` and emits caller-only `task:searchResult`! |

### 5.3 Outbound Server -> Client Socket Event Map & Client Subscriber Coverage
| Room / Target | Server Events Emitted | Client Subscriber Status |
|---|---|---|
| `user:${userId}`, `user:${email}` | `invitation:received`, `invitation:updated`, `team:member_left` | `useInvitations.ts` subscribes `invitation:{received,updated}`; **`team:member_left` has 0 client listeners**. |
| `chat:global`, `chat:team:${teamId}` | `chat:global:new`, `chat:team:new` | `useChat.ts` subscribes both (**misses `chat:join_team` emit, breaking live team chat!**). |
| `team:${teamId}` | `member:{added,removed,updated,skills_updated}`, `team:deleted`, `task:{created,updated,deleted,assigned,execution-order,priority_refreshed}`, `tasks:updated`, `assign:{warning,error}`, `chat:{message,stream}`, `sprint:plan`, `requirement:coverage:updated`, `waterfall:{lifecycle:updated,plan:finalized,plan:updated,phase:updated,requirements:approved}`, `project:{updated,health:updated,risk:updated}`, `hybrid:configured`, `scrum:{lifecycle:updated,plan:finalized,sprint_committed,assignment_updated,bulk_assignment_updated,dependency_updated,sprint_deleted,health:updated}`, `sprint:completed`, `kanban:event` | Active listeners in `useTeam`, `useTeams`, `useTeamTasks`, `useDependencyGraph`, `useWaterfallPlanLifecycle`, `PlanPanel`, `UnifiedProjectHealthPanel`; **DEAD listener `team:updated` (`useTeam.ts:162`, 0 server emitters)**; **0 listeners in ALL Scrum & Kanban UI panels**. |
| `project:${projectId}` | `project:{decision,research,architecture,guidance,opinion,risk,health,retrospective}:updated`, `lesson.{created,validated,applied,archived}`, `capability.updated`, `assignment.{recommended,accepted}`, `decision.updated`, `health.updated`, `warning.{opened,acknowledged,resolved}`, `sprint:{completed,impact}`, `scrum:health:updated`, `kanban:event`, `waterfall:{phase:updated,plan:updated}` | `ProjectLearningPanel`, `CapabilityIntelligencePanel`, `RiskPanel`, `RetroPanel` (unreachable), `TeamHealthPanel` (unreachable), `UnifiedProjectHealthPanel` (**missing `room:join:project`**), `ProjectHealth2Panel` (orphaned + missing join). |
| **Bare `${teamId}`** | `kanban:event` (`kanbanReactiveEngine.js:125`), `project:state_recalculated` (`reactiveEngine.js:162`) | **0 recipients** (nobody joins bare `${teamId}`). |

---

## 6. Frontend ↔ Backend Contract Mismatches & Broken Flows (`CODE VERIFIED`)
1. **`client/app/skill-graph.tsx:13,23,34` (`401` Guaranteed + Orphaned):** Sends `Authorization: Bearer ${user}` (`[object Object]`) instead of `token` against `/api/skills/team/:id/{graph,gaps}`.
2. **`client/components/discovery/ApplyRoleModal.tsx:69–73` (Shape Mismatch):** Checks `Array.isArray(data.verifications)` on `GET /api/skills/verifications`, whereas `server/routes/skills.js:119` returns a **bare array** -> verified badges never pre-populate in role applications.
3. **`client/components/workspace/ChatPanel.tsx:98–108` (Shape Mismatch):** Expects `GET /api/skills/team/:id/graph` to return an array with `item.verifiedSkills`; `server/routes/skills.js:195–201` returns `{ teamId, teamName, members, coverage }` -> verified badges never render in Chat drawer.
4. **`client/components/workspace/ScrumInsightsPanel.tsx:1344–1356` (Missing Bulk Modal):** `"Accept All Eligible Assignments"` sets `showBulkModal(true)` with no `<ModalSheet visible={showBulkModal}>` in JSX, stranding working backend `POST /api/scrum/capability/:id/bulk-assign`.
5. **`client/components/workspace/OverviewPanel.tsx:932,940` & `WaterfallInsightsPanel.tsx:180–186` (`projectId || teamId` Fallback Mismatch):** Falls back to passing `teamId` into `PhaseGateModal`, `ChangeImpactModal`, `ProjectLearningPanel`, `CapabilityIntelligencePanel`, and `/health-v2`, which call `Project.findById(projectId)` (`404 project_not_found`) whenever `team.activeProjectId` is unset.
6. **`client/components/workspace/UnifiedProjectHealthPanel.tsx:212–215` (Transient Warning Ack):** `handleAcknowledge` only flips React state locally and never calls `PATCH /api/projects/:id/warnings/:warningId/acknowledge`.
7. **`client/components/workspace/AssignmentBoard.tsx:634–640` + `SkillVerificationModal.tsx:184–237`:** `SkillVerificationModal` fires `onVerified` even on fail/error and overlays spinner + error box at `step === "loading"`; `AssignmentBoard` hardcodes `skill="JavaScript"` and ignores actual pass/score.
8. **`client/hooks/useChat.ts` (Missing Room Join):** Listens for `chat:team:new` without emitting `chat:join_team`, preventing real-time delivery of team chat messages.
9. **`client/app/(auth)/reset-password.tsx` Missing:** `AuthContext.resetPassword` targets `POST /api/auth/reset-password` (`server/routes/auth.js:200`), which has no UI screen AND is server-side broken by `PasswordReset.js`/`auth.js:188,263`.
10. **Rest Copilot Tier Exhaustion HTTP 500 (`aiOrchestrator.js:162` -> `projectIntelligence.js:1344` -> `AIMessage.js:103`):** When all 3 OmniRoute tiers fail, `provider: "none"` triggers a Mongoose `AIMessage` enum validation error (`500`) instead of graceful fallback.
11. **`team.leaderId` vs `Team.ownerId` (`Team.js:91`):** `phaseGateService.js:545,650` and `scrum.js:680` inspect nonexistent `team.leaderId`, causing creator-leader checks to depend solely on `members[].role`.
12. **Auth-Switch Socket Reuse (`client/services/socket.ts` + `AuthContext.tsx`):** `signOut()` never calls `disconnectSocket()`, and `getSocket(token)` reuses the prior authenticated socket even after user sign-out/sign-in with a new JWT.
