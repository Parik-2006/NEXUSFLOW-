# NEXUSFLOW — Phase 2 Implementation Report
## Authentication, Database Integrity, Functional Correctness & Dashboard Intelligence

Branch `branch2` (from verified Phase 1 head `origin/branch1` @ `ccdd7c0`) · not merged · not deployed · production database never accessed.

---

## A. Executive summary

All twelve Phase 2 tasks were implemented and verified on isolated infrastructure.

- **Authentication**
  - Password recovery is now real: hashed, user-scoped, single-use tokens; an SMTP abstraction; and revocation of every session.
  - Every authentication route is rate limited, including the legacy aliases.
  - Google sign-in now verifies the ID token cryptographically against Google's keys, uses PKCE, state and nonce, and never puts a JWT in a URL (a one-time exchange code replaces it).
- **Data integrity**
  - Requirement references are restricted to the owning project.
  - Workspaces and projects get a recoverable archive and Trash, with transactional purge driven by an explicit ownership matrix.
- **Correctness**
  - Dashboard and workspace counters come from one scoped aggregation. This replaces drifting stored counters and per-team N+1 queries, and removes a second cross-workspace counting leak (a duplicate `$or` in the Scrum done-count query).
  - The Scrum cycle-check route is no longer shadowed.
- **Dependencies**
  - Server: 8 advisories → **0**.
  - Client: 61 → **58**. The remainder require Expo / React Native majors and are documented as blocked.
- **Legacy tests**
  - All 11 previously failing scripts were investigated.
  - 77 of 81 legacy scripts now pass on isolated databases.
  - The Jest file and the client merge-sort tests now run on Node's built-in runner.

**Bugs found during Phase 2 (beyond the brief):**
- A Phase 1 regression in application acceptance.
- `AIMessage.provider` rejecting `"none"`.
- A socket singleton that reused the previous user's identity after sign-out.
- Client-side counter drift.

**Live services were NOT verified:**
- No real e-mail was sent.
- No live Google login was performed.
- No live AI providers were called.

Each of these is covered by mocked tests.

---

## B. Git baseline

| Item | Value |
|---|---|
| Source | `origin/branch1` @ `ccdd7c0` (verified = local `branch1`) |
| Phase 2 branch | `branch2` (no upstream to main/branch1 until pushed as `origin/branch2`) |
| `main` / `branch1` | unchanged (`69a5f9a` / `ccdd7c0`) |
| Untracked user files | `logo.html`, `logo_files/`: preserved, now git-ignored (§K) |
| Commits | `631750f` privacy · `fb7bf22` auth · `6693f09` requirements · `e814d8f` dependencies · `20c4666` lifecycle · `4e594b2` dashboard · `3271190` scrum routes · `7e108ac` tests · (this report) |

---

## C. Task implementation matrix

| # | Task | Root cause | Implementation (key files) | Tests | Status | Limitations |
|---|---|---|---|---|---|---|
| 1 | Password recovery (D-11) | Fresh token marked used by an `$ne: new ObjectId()` filter; validation picked the newest token globally; no mailer; no reset UI | 256-bit token, SHA-256 hash, unique index, user scope, 20-minute TTL, older tokens invalidated, atomic consume, password policy, generic response sent before lookup, `User.tokenVersion` session revocation (REST + socket), `utils/mailer.js` (nodemailer, free SMTP), `/reset-password` screen. Files: `routes/auth.js`, `models/PasswordReset.js`, `auth.js`, `app/(auth)/reset-password.tsx` | `phase2.passwordReset.test.js` (10) | RESOLVED (implementation); live SMTP **not verified** | Consuming the token and changing the password are not one transaction: a crash between them burns the token (the user requests a new one) |
| 2 | Auth rate limiting (D-11, D-29) | Limiter existed but was unused; no account-level control | `utils/rateLimiter.js`: bounded sliding window, `Retry-After`, per-IP (login on every alias, signup, forgot, reset, OAuth) and per-account (failed logins, forgot) keyed by e-mail even when no account exists; `TRUST_PROXY` hops | `phase2.rateLimit.test.js` (10) | RESOLVED (instance-local) | In-memory: limits are per instance and reset on restart (documented; Redis deliberately not used) |
| 3 | Google OAuth (D-12, D-29) | `tokeninfo` without audience or `email_verified` checks; JWT in redirect URL; client accepted `?token=`; in-memory state; e-mail auto-linking | Persistent single-use `OAuthState` (PKCE S256, nonce, HttpOnly browser-binding cookie); ID token verified against Google JWKS (RS256, iss, aud, exp, nonce, email_verified); identity keyed by `sub`; 2-minute one-time `AuthExchangeCode` + client verifier exchanged by POST; sanitized redirects; client callback rewritten. Files: `services/googleOAuth.js`, `routes/auth.js`, `models/AuthExchangeCode.js`, `context/AuthContext.tsx`, `app/index.tsx`, `login.tsx` | `phase2.googleOAuth.test.js` (22, Google mocked) | RESOLVED (implementation); live Google **not verified** | Google sign-in on native (non-web) builds shows "available in the web app" (needs `expo-crypto` / AuthSession, Phase 4) |
| 4 | Requirement isolation (new) | Requirement PATCH mass-assigned `req.body`; dependencies were unchecked | `services/requirementReferenceService.js`: same-project dependencies, same-workspace/project `taskIds`, all-or-nothing validation, field allowlist, sanitized extraction, dangling references stripped on delete, read-only audit + CLI | `phase2.requirements.test.js` (8) | RESOLVED | Audit CLI not run against any real DB |
| 5 | Dependency advisories | Outdated in-range versions | Server: express 4.22.3, mongoose 8.24.11, socket.io 4.8.3, nodemailer 10.6.1. Client: targeted socket.io-client chain update | Full suites + build after the upgrade | Server RESOLVED (0); client PARTIALLY (58 blocked by majors) | See §H |
| 6 | Transactional cascade (D-16, D-17) | Non-atomic `Promise.all` deletes; missing models; `teamId` vs `data.teamId` notification bug | `services/lifecycleService.js` ownership matrix (43 models classified); purge in one transaction, refused without replica-set support; notifications fixed; events after commit | `phase2.lifecycle.test.js` (13, incl. injected rollback) | RESOLVED | Very large workspaces may exceed transaction size limits (no batched purge yet) |
| 7 | Recoverable deletion | Immediate hard delete | `utils/archivePlugin.js` (Team, Project, Task) hides archived documents from all ordinary queries; DELETE archives; `/api/trash` list/restore/purge; opt-in, lock-protected expiry job; Profile "Recently deleted" panel | Lifecycle tests + browser check | RESOLVED | Restore does not revive cancelled invitations; archiving a workspace's only project lets the client initialize a fresh one |
| 8 | Counters (D-18, D-35) | Stored counters drifted; N+1 queries; client adjusted counts locally; Scrum done-count `$or` overwrite leaked across workspaces | `services/taskStatsService.js`: one aggregation, normalized states, exclusions, no double counting; used by `GET /teams` and `/teams/:id`; client refetches | `phase2.dashboard.test.js` (6) | RESOLVED | Stored `taskCount`/`doneCount` remain in DB for compatibility but are overwritten in responses |
| 9 | Real dashboard (D-19) | Fabricated / derived tiles | `GET /api/dashboard/summary`; `useDashboardSummary` (unavailable ≠ 0, retry, stale-response guard, debounced socket refresh, membership-checked rooms); socket bound to token; `sprint:started` emitted | Dashboard tests + browser check (320–1440 px) | RESOLVED | "Plans ready" counts finalized Waterfall/Scrum plans; whether plan text came from an AI provider is not persisted (labelled truthfully) |
| 10 | Scrum route shadowing | `POST /dependencies/:id` captured `check-cycle` | ObjectId constraints on `:id/:projectId/:sprintId/:taskId` (135 params); hardened cycle-check (ids, self-dependency, same-project tasks); automated shadowing detector | `phase2.scrumRoutes.test.js` (7) | RESOLVED | Invalid-format ids on Scrum routes now return 404 (previously 400) |
| 11 | Legacy tests and runners | Production-data assumptions, cwd paths, outdated expectations, an app enum bug | See §I; Jest shim; client runner | 77/81 legacy pass; Jest 51/51; client 12/12 | RESOLVED except where blocked (§I) | Live AI / Kanban-gate checks remain opt-in |
| 12 | Logo / privacy | Saved ChatGPT page untracked but not ignored | Root-anchored `.gitignore` rules for `/logo.html`, `/logo_files/` | `git check-ignore`; history scan | RESOLVED | — |

---

## D. Audit finding resolution

| Finding | Status | Evidence |
|---|---|---|
| D-11 Password reset broken / no auth rate limit | **RESOLVED** (live SMTP unverified) | 10 reset + 10 rate-limit tests |
| D-12 Google OAuth claims, URL JWT, login CSRF | **RESOLVED** (live Google unverified) | 22 mocked OIDC tests |
| D-16 Team delete orphans / notification no-op | **RESOLVED** | purge test asserts every owned collection is empty; notifications fixed |
| D-17 Project delete orphans / ghost tasks | **RESOLVED** | project purge and sibling-isolation tests |
| D-18 Counter drift | **RESOLVED** | consistency test (concurrent PATCH / delete) |
| D-19 Fabricated dashboard tiles | **RESOLVED** | summary tests + screenshots |
| D-28 Removed members' sockets | Resolved in Phase 1; Phase 2 adds sign-out disconnect, token-bound socket, archive room eviction | lifecycle socket test |
| D-29 In-memory OAuth state / limiter | **PARTIALLY RESOLVED**: OAuth state is persistent (Mongo); the limiter stays instance-local by design ($0) | — |
| D-35 N+1 counts | **RESOLVED** | single aggregation |
| New: requirement cross-workspace refs | **RESOLVED** | requirements tests + audit |
| New: Scrum cycle-check shadowing | **RESOLVED** | shadowing detector (0 shadowed) |
| New: `AIMessage` `"none"` crash | **RESOLVED** | legacy suites |
| New: Scrum done-count cross-tenant `$or` | **RESOLVED** | regression test |
| New: Phase 1 application-accept regression | **RESOLVED** | `testTeamDiscoveryAndApplications` passes |

---

## E. Authentication architecture

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as API
  participant M as SMTP
  U->>A: POST /auth/forgot-password {email}
  A-->>U: 200 generic (sent before lookup)
  A->>A: invalidate user's old tokens, store SHA-256(token), 20 min
  A->>M: reset link /reset-password?token=…
  U->>A: POST /auth/reset-password/validate
  U->>A: POST /auth/reset-password {token,password,confirm}
  A->>A: policy → atomic consume → bcrypt → tokenVersion++ → disconnect sockets
  A-->>U: 200 (no session; sign in again)
```

```mermaid
sequenceDiagram
  participant C as Web client
  participant A as API
  participant G as Google
  C->>C: verifier v, stores it
  C->>A: GET /auth/google?client_challenge=S256(v)
  A->>A: OAuthState{state,nonce,PKCE,bindHash,challenge}; HttpOnly bind cookie
  A->>G: authorize (code_challenge S256, nonce, state)
  G->>A: /auth/google/callback?code&state
  A->>A: consume state atomically + cookie check
  A->>G: token exchange (code_verifier)
  A->>A: verify id_token via JWKS (RS256, iss, aud, exp, nonce, email_verified)
  A-->>C: redirect /?auth_code=one-time (no JWT)
  C->>A: POST /auth/exchange {code, v}
  A-->>C: {token, user} (code consumed; reuse → 400)
```

**Sessions.** JWTs carry `tv` (the user's `tokenVersion`). `requireAuth` and the socket handshake verify signature, `id`, the user's existence, and the version. A reset increments the version, revoking every older session and disconnecting live sockets. Tokens issued before Phase 2 are treated as version 0, so existing sessions survive deployment.

**Rate limits.** Configurable via `RATE_LIMIT_*`.

| Limit | Default |
|---|---|
| Login, per IP | 30 / 15 min |
| Failed logins, per account | 5 / 15 min |
| Signup, per IP | 5 / h |
| Forgot password, per IP | 10 / h |
| Forgot password, per account | 3 / h |
| Reset, per IP | 10 / 15 min |
| OAuth, per IP | 20 / 15 min |

**Account linking policy.**
- Google identity is matched by `sub`.
- An existing password account with the same e-mail is linked only when Google is authoritative for that address (gmail.com, or a Workspace domain asserted by the `hd` claim). Otherwise the user must sign in with their password.
- An e-mail already bound to a different Google subject is rejected.

---

## F. Database lifecycle

**Ownership matrix** (`OWNERSHIP` in `lifecycleService.js`):

| Class | Models | Workspace purge | Project purge |
|---|---|---|---|
| Workspace-owned (`teamId`) | CapabilityProfile, ChatMessage, ContributionDispute, DecisionFeedback, DecisionRecord, EarlyWarning, GitHubIntegration, Invitation, LearningInsight, OAuthState, Opinion, ProjectEvent, ProjectLesson, ProjectMemory, RepositoryIndex, Retrospective, Risk, ScrumHealthSnapshot, ScrumSprintSnapshot, Sprint, Task, TeacherReview, TeamApplication, TeamApplicationAudit, TeamDeparture, TeamHealth | deleted | the ones carrying `projectId` are deleted by it |
| Project-owned (`projectId`) | AIConversation, AIMessage, AcademicRubric, ArchitectureComponent, Decision, Recommendation, ResearchItem, Resource, TemporaryContext + the above | deleted | deleted |
| User-owned | User, GitHubCredential, SkillVerification, PasswordReset, AuthExchangeCode | kept | kept |
| Notification (user-owned) | actionable (`team_invitation`, `application_submitted`) deleted; others detached (`data.teamId` unset) | — | — |

**Behaviour:**
- **Archive:** sets `archivedAt`, `archivedBy`, `purgeAfter` (+`LIFECYCLE_RECOVERY_DAYS`, default 7) and `archiveOperationId`. The plugin hides the document everywhere.
- **Project archive:** also tags its tasks with the operation id, so restore brings back exactly those, and re-points `activeProjectId`.
- **Restore:** allowed until `purgeAfter` (410 afterwards). A project can only be restored while its workspace is active.
- **Purge:** single transaction, archived resources only, typed name required; owner for workspaces, leader for projects.
- **Expiry job:** opt-in (`LIFECYCLE_AUTO_PURGE=true`) and lease-locked (one runner at a time); it never runs by default.
- **Migration:** none is required (missing `archivedAt` = active).

**Rollback considerations:**
- Reverting the code un-hides archived documents (they would reappear as active).
- Purge outcomes are irreversible.

---

## G. Dashboard data contract

`GET /api/dashboard/summary` returns:

`workspaceCount, totalTasks, openTasks (= total − done), completedTasks, inProgressTasks, blockedTasks, unassignedTasks, completionPercentage, uniqueMemberCount, placeholderMemberCount, activeSprintCount, aiPlansReady, plansReadyBreakdown{waterfall,scrum}, workspaces[{teamId,…stats}], lastUpdatedAt`

**Eligibility.** A task counts when:
- its workspace is active and accessible;
- it is not archived and not Scrum-CANCELLED;
- it is either team-level (`projectId` null) or belongs to an active project of that workspace;
- for Scrum workspaces, it also meets the canonical Scrum backlog eligibility.

Each task is counted once, in a single aggregation.

**State precedence.** done > blocked > in_progress > open:

| State | Rule |
|---|---|
| done | `status:"done"` / `scrumStatus:DONE` / `kanbanStatus:DONE` / `workflowColumn:"done"` |
| blocked | `scrumStatus` or `kanbanStatus` BLOCKED, or an unresolved blocker |
| in_progress | `status:"in_progress"` / IN_PROGRESS / IN_REVIEW |
| open | anything else |

**Metric definitions:**
- **Completion:** `round(done/total×100)`, or 0 when there are no tasks (the UI shows "no tasks yet").
- **Members:** distinct registered user ids that exist; placeholders are counted separately.
- **Active sprints:** `status:ACTIVE` in active projects.
- **Plans ready:** Waterfall `PLAN_FINALIZED | TASKS_GENERATED | IN_EXECUTION | COMPLETED`, or Scrum `PLAN_FINALIZED | SPRINT_ACTIVE`.

**Real-time behaviour:**
- The client joins only its own workspace rooms (the server re-checks membership).
- Task, member, sprint, plan, archive and restore events trigger one debounced refresh.
- Stale responses are dropped.
- Listeners are cleaned up on unmount.
- A failure shows "—" plus Retry, never 0.

---

## H. Dependency security

| Scope | Before | After |
|---|---|---|
| Server production | 8 (2 critical, 5 high, 1 moderate): mongoose, proxy-addr, body-parser, engine.io, socket.io-adapter, socket.io-parser, ws, qs | **0** |
| Server dev | 8 (same set) | **0** |
| Client (prod + dev) | 61 (2 critical, 34 high, 17 moderate, 8 low) | **58** (2 critical, 31 high, 17 moderate, 8 low) |

**Remaining 58 client advisories: BLOCKED.**
- Their fixes require `expo@58` (from 51), `react-native@0.88` (from 0.74) or `expo-router@58`, which are major upgrades.
- A non-forced `npm audit fix` was tried and **reverted**: it nested `react-native@0.88.1` inside the 0.74 tree (risk to native builds) and cleared only 14.

**Exposure:**
- Most are build/CLI tooling (tar, @xmldom, cacache, postcss, babel presets, fast-xml-parser) and are not shipped to users.
- The shipped web bundle still contains react-navigation's `query-string` / `decode-uri-component` (client-side URL-parsing DoS class, low practical impact).

**Recommended:** a dedicated Expo SDK upgrade in Phase 5.

---

## I. Legacy test resolution

**Previously failing (11):**

| Script | Root cause | Outcome |
|---|---|---|
| testArtifactSaveDeletePersistence | assumed a production project | **FIXED** (synthetic project; passes in live-API mode) |
| testClassicRestorationAndScrumScrollSuite | cwd-relative paths | **FIXED** |
| testMethodologyIsolationSuite | cwd-relative paths | **FIXED** |
| testScrumV4FullExperienceSuite | cwd-relative paths | **FIXED** |
| testPhase1DataFoundation | outdated fixture data (member without `userId`, invalid `currentPhase`) | **FIXED** |
| testPhase2ProjectIntelligence | app bug: `AIMessage.provider` rejected `"none"` | **FIXED** (app fix) |
| testScrumBulkAcceptSuite | hard-coded production team | **REPLACED WITH VALID EQUIVALENT** (deterministic fixture; all assertions kept) |
| testScrumSprintAnalyticsSuite | hard-coded production team | **REPLACED WITH VALID EQUIVALENT** |
| testScrumTeamRestorationSuite | hard-coded production team | **REPLACED WITH VALID EQUIVALENT** |
| testMasterCorrections | `"none"` crash, then 2 checks need a live AI provider | crash **FIXED**; 50/52 pass; 2 **BLOCKED** (live free-tier AI, opt-in) |
| testNexusflowAiHub | imported removed exports, then 1 check needs live AI | import **FIXED**; 22/23 pass; 1 **BLOCKED** (live AI) |

**Previously blocked (14, live-API).** These now run through `runLegacyIsolated --with-server`: the real app runs in-process on an in-memory DB, and per-IP auth limits are lifted only in the harness.
- **13 PASS.** Outdated expectations were updated and explained inline: required 1000-char description; consent-based membership via invitation and acceptance; Trash purge for the cascade assertion; 5-answer quiz; app.js socket wiring; moved contract document.
- **auditKanbanEndToEnd: BLOCKED.** Kanban is gated as unavailable for new projects, and the gate was deliberately not enabled. Kanban behaviour is covered by the isolated suites.

**Final totals:** 77 PASS, 3 BLOCKED (live AI ×2, Kanban gate ×1), 1 intermittent.
- The intermittent one is `testGitHubOAuthBackendHardeningSuite`: one `strictEqual` failure under 4-way parallel load; it passes sequentially, in live mode, and in a second parallel run.

**Runners:**
- `__tests__/manualQaFixes.test.js`: stray TypeScript annotations removed; runs on `node:test` through `tests/helpers/jestCompat.js` → **51/51**.
- `client/hooks/mergeSort.test.ts`: runs on `node:test` → **12/12**.
- No test framework was added.

---

## J. Test results (commands run)

| Command | Result |
|---|---|
| `server: npm test` (= test:phase1) | **PASS**. Unit 51/51 · Jest-compat 51/51 · Security 144/144 · Integration 20/20 · Logic: TaskPriorityEngine 54, ScrumV4 11, Fixes1to5Logic 22, LocalAICore 30, DomainMethodology 17, ReactKeyDedup 8 |
| Phase 2 suites within the above | passwordReset 10 · googleOAuth 22 · rateLimit 10 · requirements 8 · lifecycle 13 · scrumRoutes 7 · dashboard 6 (+ route-coverage sweeps now 571 routes, 0 violations) |
| `node tests/helpers/runLegacyIsolated.js 4` | 81 scripts: 63 PASS, 15 BLOCKED (live-API, by design), 3 FAIL (2 live-AI, 1 intermittent) |
| `runLegacyIsolated.js 1 … --with-server` | 15 scripts: 14 PASS, 1 FAIL (Kanban gate) |
| `client: npx tsc --noEmit` | **PASS** (0 errors) |
| `client: npm test` | **PASS** 12/12 |
| `client: npx expo export --platform web` | **PASS** |
| `npm audit` | server 0 · client 58 (§H) |
| Browser (headless Chrome, exact device emulation) | **PASS**: dashboard 320/375/768/1024/1440, profile/Trash 375/1440, login with OAuth error 375/1440, reset valid and invalid 375/1440. `scrollWidth == viewport` at every width, 0 broken images, logo rendered |
| Secret scan of the Phase 2 diff | **PASS** (synthetic test passwords only; no `.env`, no keys) |
| **NOT RUN** | live SMTP delivery, live Google sign-in, live AI providers, native (iOS/Android) builds |

---

## K. Privacy and branding

- The logo is preserved (`client/assets/branding/`, unchanged). It renders on login, signup, forgot-password, the new reset-password screen and the dashboard.
- `/logo.html` and `/logo_files/` are root-anchored in `.gitignore`. They were never committed (history checked), were left untouched, and their contents were not printed or uploaded.
- The unrelated "ArthaSense" image is not referenced anywhere.

---

## L. Environment configuration (names / placeholders only)

| Area | Variables |
|---|---|
| JWT | `JWT_SECRET` (required, ≥32 random bytes) |
| SMTP | `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PASSWORD_RESET_BASE_URL`, `PASSWORD_RESET_TTL_MINUTES=20` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Rate limits | `TRUST_PROXY` (Render: 1), `RATE_LIMIT_LOGIN_IP_MAX`, `RATE_LIMIT_LOGIN_FAILURES_MAX`, `RATE_LIMIT_SIGNUP_IP_MAX`, `RATE_LIMIT_FORGOT_IP_MAX`, `RATE_LIMIT_FORGOT_ACCOUNT_MAX`, `RATE_LIMIT_RESET_IP_MAX`, `RATE_LIMIT_OAUTH_IP_MAX` |
| Lifecycle | `LIFECYCLE_RECOVERY_DAYS=7`, `LIFECYCLE_AUTO_PURGE=false`, `LIFECYCLE_PURGE_INTERVAL_MINUTES=60` |
| Tests | `MONGO_URI_TEST` (local, name contains "test"; legacy only), `NEXUSFLOW_TEST_SERVER`, `TEST_BASE`, `TEST_PORT` |

---

## M. Deployment and rollback (manual; not performed)

1. Set `JWT_SECRET`, `TRUST_PROXY=1` (Render) and the SMTP variables. Without SMTP, reset requests succeed generically but no e-mail is sent.
2. Google Cloud console:
   - The redirect URI must exactly equal `GOOGLE_REDIRECT_URI`.
   - The frontend must be served from `FRONTEND_URL`.
   - The callback sets an HttpOnly cookie on the API domain.
3. Production MongoDB must be a replica set (Atlas is) for permanent delete; otherwise purge returns 503 and deletes nothing.
4. Keep `LIFECYCLE_AUTO_PURGE` off until operators want automatic expiry.
5. **API changes clients must know:**
   - DELETE now archives; new `/api/trash/*`, `/api/dashboard/summary`, `/api/auth/exchange`.
   - Google returns `?auth_code`/`?auth_error` (never `?token`).
   - The reset endpoint no longer returns a session.
   - Password policy is 8+ characters with letters and digits (signup and reset).
   - Scrum routes reject non-ObjectId ids with 404.
6. **Optional, read-only:** `node scripts/migrations/phase2RequirementReferenceAudit.js` (not run).
7. **Rollback:** reverting returns archived records to view, and stored counters regain authority. Purges cannot be undone.

---

## N. Remaining work (Phases 3–5)

- **Phase 3: DAA correctness**
  - D-20 Task hook defaults.
  - D-21 dependencyCount semantics.
  - D-22 greedy factor cap.
  - D-23 decision-mode weights.
  - D-24 health weights.
  - D-25 BFS waves.
  - D-26 fractional knapsack.
  - D-31 Kahn heap.
  - D-32 Boyer–Moore table.
  - D-33 B&B ordering/cap.
- **Phase 4: AI and integrations**
  - D-27 OmniRoute latency budget and retired models.
  - Native Google sign-in.
  - Provenance tracking for AI-vs-deterministic plans.
  - Teacher-review faculty guard.
- **Phase 4/5: platform**
  - D-30 AES-GCM GitHub tokens.
  - D-14 `/health` and DB fail-fast.
  - Shared/Redis-free distributed rate limiting if scaled out.
  - Batched purge for very large workspaces.
  - CI workflow.
  - Expo SDK major upgrade (client advisories).
  - Monolithic route files.
  - 554 `any` types.
  - RUN.md rewrite.

---

## O. Updated engineering verdict (evidence-based)

| Area | Score | Reason |
|---|---|---|
| Architecture | 6/10 | Central access, lifecycle and stats services; large route files remain |
| Security | 7/10 | Authentication hardened and tested; tenant isolation swept across 571 routes; limits are instance-local; client deps blocked by majors |
| Authentication reliability | 7/10 | Complete flows with mocked verification; live SMTP/Google unverified; native Google pending |
| Database integrity | 7/10 | Transactional purge, archive/restore, scoped references; no batched purge |
| Frontend UX | 7/10 | Honest dashboard, Trash, reset flow, responsive at 320–1440 px |
| Backend reliability | 5/10 | No health endpoint or DB fail-fast yet; OmniRoute latency unaddressed |
| DAA correctness | 5/10 | Phase 3 findings untouched |
| AI reliability | 6/10 | Graceful "none" persistence fixed; routing issues remain |
| Testing | 7/10 | ~280 automated tests plus a 77/81 legacy pass rate on isolated DBs; no CI |
| Scalability | 4/10 | Instance-local limiter, single-instance assumptions |
| Production readiness | 5/10 | Not production-ready: live services unverified, Phase 3–5 items open |
