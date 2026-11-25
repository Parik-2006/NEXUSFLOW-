# NEXUSFLOW — Phase 1 Implementation Report
## Security Hardening, Foundation Corrections & Brand Integration

Branch: `branch1` (created from `origin/main` @ `69a5f9a`) · Not merged · Not deployed · Production database not accessed.

---

## 1. Executive summary

Phase 1 replaces NEXUSFLOW's scattered, partly name-based authorization with one central, **read-only, fail-closed, user-id-only** access-control layer, and routes every team, project, task, sprint and socket operation through it.

- **JWT handling.** The hardcoded JWT fallback is gone. The server now refuses to start with a missing, weak or placeholder secret, and tokens are pinned to HS256.
- **Cross-workspace isolation.** Reads and writes are blocked over both REST and Socket.IO. This includes a newly found live leak: a duplicate-`$or` Kanban query that returned every workspace's backlog.
- **Roles.** Owner, leader, manager and member roles are enforced on the server, with no self-promotion and an explicit ownership-transfer flow.
- **Membership.** Joining requires an invitation or application, and acceptance is atomic.
- **Destructive actions.** They are permission-gated, require the typed resource name, and are logged.
- **No writes before authorization.** GET requests no longer create projects, and legacy workspaces are initialized through an explicit, idempotent, race-safe POST.
- **Testing.** It is now isolated:
  - New suites run on an in-memory MongoDB with the network blocked.
  - All 81 legacy database scripts are guarded so they can never reach `MONGO_URI`.
- **Branding.** The official logo is on the login, signup, password-recovery and dashboard screens.

**Verification:**
- 139 `node:test` tests: 51 unit, 74 security, 14 integration. All pass.
- 142 legacy logic assertions: all pass.
- Route-coverage matrix: 568 route/prefix combinations with no authorization violation.
- Client `tsc`: 0 errors.
- Expo web production export: passes.

---

## 2. Git baseline

| Item | Value |
|---|---|
| Original branch | `version4.0` @ `b0b59d3` (same tree as `origin/main`) |
| Baseline | `origin/main` @ `69a5f9a` (Merge PR #5) |
| Implementation branch | `branch1` (new; no upstream to `main`; pushed as `origin/branch1`) |
| Uncommitted user files | `logo.html`, `logo_files/`: preserved untracked, see §8 |
| Final commits | listed in the final summary of the implementing session / `git log origin/main..branch1` |

---

## 3. Task-by-task status

### Task 1: JWT authentication hardening (D-1) · RESOLVED
- **Root cause:** `JWT_SECRET ?? "<literal>"` in `server/auth.js`.
- **Implementation:**
  - `validateJwtSecret()` requires ≥32 bytes and rejects known defaults, placeholder patterns, and secrets with fewer than 10 distinct characters.
  - `assertAuthConfig()` runs in `index.js` before the app is even imported; an invalid config exits with code 1.
  - Sign and verify use `algorithms: ["HS256"]`. A valid ObjectId `id` claim is required, so legacy email-as-id tokens are rejected and those users log in again.
  - If the secret becomes invalid at runtime, `verify()` returns null (fails closed).
  - REST `requireAuth` and the Socket.IO handshake share `verify()`.
  - `.env.example` documents the requirements and contains no secret.
- **Files:** `server/auth.js`, `server/index.js`, new `server/app.js` (the app is now importable without connecting or listening), `server/.env.example`.
- **Tests (`tests/unit/auth.test.js`, 20 tests):**
  - Rejected: missing, empty, weak, placeholder and low-entropy secrets; expired tokens; invalid signatures; HS512; `alg:none`; missing `id` claim; legacy email-id tokens; malformed tokens.
  - Accepted: a valid round-trip.
  - Startup really refuses for missing, weak and placeholder secrets (tested by spawning the process).
- **Limitations:** no token revocation or rotation (Phase 2+). Existing sessions signed with the current strong secret remain valid.

### Task 2: Centralized team/project authorization (D-2, D-5, D-6) · RESOLVED
- **Root cause:** about 8 duplicated helpers with name/email matching, an owner-less `isLegacy` bypass, fail-open handling of missing or orphaned teams, and about 18 project-intelligence routes with no membership check.
- **New files:**
  - `utils/identity.js`: canonical id normalization (ObjectId, string, or populated reference); no name or email fallback.
  - `services/accessControlService.js`: `getMembership`, `isTeamMember`, `isTeamLeader`, `hasPermission`, `authorizeTeamAccess`, `authorizeProjectAccess`, `authorizeTaskAccess`, `authorizeSprintAccess`, `findScopedTask`, `assertTasksInTeam`, `initializeWorkspaceProject`, `revokeTeamRoomAccess`, and the permission matrix.
  - `middleware/authorization.js`: `requireTeamAccess`, `requireProjectAccess`, `requirePermission`.
- **Router-level guards:**
  - `router.use("/teams/:teamId", …)` in `teams.js` also covers the discovery, workstreams and skills routes under that prefix.
  - `router.use("/projects/:projectId", …)` in `projects.js` covers the `/api` and root dual mount, plus the github and workstreams routes under that prefix. Assigned faculty are read-only there, except on the teacher-review and academic routes.
- **Helpers rewritten to delegate centrally:** `teams.verifyTeamAccess`, `projects.findProject`, `scrum/kanban/hybrid/github` `verifyProjectAccess`, `workstreams.authorizeProjectAccess` (previously returned `isLeader:true` when the team was missing), `invitationService`, `applicationService`, `discovery`, `scrumPlanningService`, `phaseGateService`.
- **Verification:** `tests/security/routeCoverage.test.js` enumerates every registered route (568 route × prefix combinations, 508 workspace-scoped). As an outsider, every scoped route returns 401/403/404 and workspace A is unchanged byte for byte. See §5.

### Task 3: Cross-workspace task isolation (D-3) · RESOLVED (for all identified and swept paths)
- **Scoping strategy:**
  - `Task.teamId` is required, so the team is the tenant boundary. Every task read and write is bound to `{_id, teamId: authorizedTeam}`.
  - Project-bound tasks must also match the project.
  - Classic team-only tasks (`projectId: null`) are supported.
- **Fixed sites:**
  - REST `PATCH /teams/:t/tasks/:id` (scoped read; assignee must be a member).
  - `PATCH /tasks/:id/priority` (previously unauthenticated in scope).
  - Dependency add/remove (both ends inside the team).
  - Task recalculation and the `/assign` bulk write.
  - Socket `task:update` (every lookup and the update scoped) and `task:create` (dependency and assignee validation).
  - Socket `tasks:assign` (all-or-nothing id check).
  - Scrum sprint item add/remove (previously no authorization at all): sprint authorized via its own project, task must be in the same team and project, plus engine-level `assertTaskBelongsToSprintScope`.
  - Scrum task-addressed handlers (task team must equal the authorized team).
  - Scrum analytics (no authorization before).
  - Scrum backlog create/update (`dependencies` validated).
  - Kanban task and blocker update/create (scoped load, dependency and assignee validation) and the `pullWorkItem` engine query.
  - Workstreams lesson, decision, warning and task child records bound to the authorized project; `/decisions/:id/ai-summary` (no authorization before).
- **New leak found and fixed:** `kanban.js` had three query literals with duplicate `$or` keys. JavaScript keeps only the last key, so the tenant filter was silently dropped and *every workspace's* backlog, ready count and done list was returned. These are now explicit `$and`. Defense in depth: Kanban board and digital-twin `populate("dependencies")` match only the same team.
- **Tests:**
  - Cross-workspace read, update, delete, priority, dependency edge, assignee, sprint assignment both directions, sprint removal, Kanban update, analytics, Kanban backlog leak, and Scrum foreign dependency.
  - An automated sweep where a member of B uses B's containers with A's child ids across every route: no A content is exposed and A is unchanged.

### Task 4: Socket.IO hardening (D-4, D-28 security portion) · RESOLVED
- **Handshake:** JWT required, using the same `verify()`.
- **Payload safety:** a payload-normalizing `socket.use` middleware means missing or primitive payloads can no longer reject async handlers (Node 24 exits on unhandled rejections, so this was a crash risk).
- **Identity:** only from `socket.data.user`; payload identity fields are ignored (tested).
- **Rooms and events:**
  - `room:join` and `chat:join_team` use id-only membership.
  - `task:search` requires membership, validates the payload, caps the query at 200 characters, and scopes results.
  - Acks return structured errors without internals.
- **Revocation:**
  - Member removal and leaving call `io.in("user:<id>").socketsLeave([...team, chat, every project room])`, which covers every concurrent session.
  - Team deletion empties its rooms.
  - On reconnect, a removed user's `room:join` is rejected (tested with two simultaneous sessions plus a reconnect).
- **Tests:** missing/invalid token, unauthorized join, unauthorized and oversized search, cross-workspace mutation, spoofed identity, empty payloads, authorized broadcast, removal during an active connection, valid reconnect.

### Task 5: Immutable user-ID identity (D-5, D-6) · RESOLVED
- **Name/email matching removed** in `teams` (list, guard, leave, skills), `projects` (list, create, `findProject`), `scrum`, `hybrid`, `kanban`, `invitationService`, `applicationService.resolveUser`, `scrumPlanningService` (×2), `/api/me`, and profile updates.
- **Placeholders:** the new `members[].placeholder` flag (default false). Placeholders keep a random id that maps to no account, can be assigned work, and can never authenticate or be linked by name.
- **Migration:** `scripts/migrations/phase1MemberIdentityAudit.js`.
  - Dry run by default.
  - `--apply` requires `--confirm-db=<db>` and only sets `placeholder:true` on members whose id matches no User.
  - It reports owner-less teams and duplicates and **never guesses ownership**.
  - Tested in memory. **Not executed against any real database.**
- **Tests:** identical display names, rename plus re-login impersonation, placeholder names, missing owner/team, orphaned project, populated and unpopulated references.

### Task 6: Roles and privilege escalation (D-7, D-15) · RESOLVED
- **Model:** the access role is derived from `ownerId` (owner) or the existing role label (leader / manager / member). Functional labels such as "Frontend Developer" map to member and are unchanged in data. Only privileged labels confer rights, and assigning them is itself gated. See §6.
- **Rules:**
  - No one can change their own role.
  - Non-owners may only manage members ranked strictly below them.
  - A granted role cannot exceed the granter's role.
  - The owner's entry is protected.
  - Ownership changes only via `POST /teams/:id/transfer-ownership`: owner-only, target must be a real member, atomic compare-and-set on `ownerId`, and the previous owner stays a leader.
  - Owners cannot leave without transferring.
- **D-15:** Scrum sprint completion, sprint deletion, bulk assignment and Waterfall phase approval/override now use `hasPermission`. This drops the nonexistent `team.leaderId` / `project.ownerId` fields and the untrusted token `role` claims. An owner whose label is "Product Designer" can now complete sprints (tested).

### Task 7: Secure invitation-based membership (D-8) · RESOLVED
- **`POST /teams/:id/members`:**
  - Never links an account.
  - An email-like name returns 409 `INVITATION_REQUIRED`.
  - Otherwise it creates a placeholder; privileged roles are rejected; manager rank or above is required.
- **Team creation:** caller-supplied member `userId`s that belong to real users are converted to invitations; the rest become placeholders.
- **Invitations:**
  - Creation requires `member:invite` and a role cap.
  - Acceptance atomically consumes `pending → accepted`, adds the member with an `$ne` guard (no duplicates under concurrency, tested with 3 parallel accepts), and re-caps the granted role to what the inviter can currently grant.
  - Accepting another user's invitation returns 403; reuse is rejected.
  - New cancel endpoint: `DELETE /teams/:id/invitations/:invId`.
- **Applications:** the claim is atomic, membership uses the `$ne` guard, and review uses the central `application:review` permission.

### Task 8: Destructive-operation protection (D-9) · RESOLVED (Phase 1 scope)
- **Workspace delete:** owner-only plus `confirmName` exactly equal to the workspace name (400 `CONFIRMATION_REQUIRED` otherwise).
- **Project delete:** owner or leader plus typed title.
- **Other gates:** AI-backlog restore (wipes tasks) is leader-only; member removal uses the rank rule; sprint delete needs manager rank or above.
- **Logging:** all are logged via the redacting `logger` (`security:*` events). No GET performs a destructive action.
- **Client:**
  - The shared confirm dialog gained `requireTypedText`; Confirm stays disabled until the exact name is typed.
  - The dashboard uses it, and the workspace screens now send the typed name.
- **Not done (Phase 2):** full cascade deletion and recovery. Existing orphan behavior (D-16, D-17) is unchanged and not made worse.

### Task 9: No database writes before authorization (D-2, D-10) · RESOLVED
- **Read-only helpers:** Kanban `verifyProjectAccess` (previously created a project and flipped `team.methodology` before auth), the Scrum helper, and `teamHealth.resolveProjectAndTeam` (previously created projects on GET).
- **GET on an uninitialized workspace** returns 409 `PROJECT_NOT_INITIALIZED`. Initialization happens via:
  - the explicit `POST /teams/:id/initialize-project` (member, methodology taken from the team), or
  - an authorized non-GET Scrum/Kanban request.
- **`initializeWorkspaceProject`:** compare-and-set on `activeProjectId`. The pointer is never unset, so a losing racer deletes only its own unreferenced project.
- **Client:** `useTeam` calls the init POST once for legacy teams.
- **Tests:**
  - A full-database snapshot is identical before and after 8 unauthorized requests.
  - Authorized GETs create nothing.
  - 4 parallel initializations produce exactly 1 project.

### Task 10: Isolated testing infrastructure (D-13) · RESOLVED
- **`tests/helpers/dbTargetGuard.js`:** only `mongodb://` on localhost, 127.0.0.1 or ::1; the database name must contain "test" and must not be a production name; it must differ from `MONGO_URI`; `mongodb+srv` is never allowed.
- **`tests/helpers/testEnv.js`:** in-memory replica set (`mongodb-memory-server`, free, dev-only), random JWT secret, blank AI/OAuth keys, all non-local `fetch` blocked, real app on a random port.
- **`scripts/_testDbGuard.js`:** injected as the first import of all **81** DB-touching legacy test/audit scripts.
  - It wraps `mongoose.connect/createConnection` to force a validated `MONGO_URI_TEST`; it exits with code 2 before connecting otherwise.
  - It blocks calls to a live local API (`fetch` and `http/https`) unless `NEXUSFLOW_TEST_SERVER=1`.
- **Commands:**
  - `npm test` = `test:phase1` = `test:unit`, `test:security`, `test:integration`, `test:logic`.
  - The old suite is `test:legacy` (guarded).
  - `tests/helpers/runLegacyIsolated.js` runs every legacy script against a fresh in-memory DB.
- **Fixtures:** owners and members of workspaces A and B, a manager, a removed member, a placeholder, an outsider, multiple projects, tasks and sprints.

### Task 11: NEXUSFLOW logo integration · RESOLVED
See §8.

---

## 4. Security findings resolution

| Finding | Status | Evidence |
|---|---|---|
| D-1 JWT fallback secret | **RESOLVED** | auth.test.js (20) incl. real startup refusal |
| D-2 Unguarded project intelligence routes | **RESOLVED** | router guard + coverage matrix (508 scoped routes, 0 violations) |
| D-3 Cross-workspace task writes | **RESOLVED** (identified and swept paths) | task-isolation tests + B-container/A-child sweep; Kanban `$or` leak fixed |
| D-4 Unauthenticated socket `task:search` | **RESOLVED** | socket tests |
| D-5 Display-name identity | **RESOLVED** | impersonation tests; all name/email matching removed |
| D-6 Ownerless/orphan fail-open | **RESOLVED** | legacy-team / orphan-project tests |
| D-7 Self-promotion | **RESOLVED** | role tests |
| D-8 Direct account linking | **RESOLVED** | membership tests |
| D-9 Member project deletion | **RESOLVED** | destructive tests |
| D-10 Kanban write before auth | **RESOLVED** | DB snapshot test |
| D-13 Tests against production DB | **RESOLVED** | guard unit tests; 81 scripts guarded |
| D-15 Nonexistent leader fields | **RESOLVED** | owner-without-leader-label sprint test |
| D-28 Removed member keeps socket rooms | **RESOLVED** (security portion) | multi-session revocation test |

Historical "Kanban `$or` key overwrite leaks tenants" (FEATURE_STATUS): **RESOLVED** (3 sites).

---

## 5. Authorization coverage matrix

| Route family | Guard | Requirement |
|---|---|---|
| `/api/teams/:teamId/**` (teams, discovery, workstreams, skills) | `teams.js` router guard → `authorizeTeamAccess` | member; per-route permission (team:update leader, member:* manager, team:delete owner, …) |
| `/api/projects/:projectId/**` and `/projects/:projectId/**` (projects, github, workstreams) | `projects.js` router guard → `authorizeProjectAccess` (project or team id) | member; faculty read-only except reviews/academic; deletes leader+ |
| `/api/scrum/**` | `verifyProjectAccess` (central), `authorizeSprintAccess`, `authorizeSprintTaskOperation` | member; complete leader+; delete/bulk manager+ |
| `/api/kanban/**` | central `verifyProjectAccess` + `loadScopedTask` | member; no pre-auth writes |
| `/api/hybrid/**` | central `verifyProjectAccess`, `isTeamLeader` | member; configure leader+ |
| `/api/tasks/:taskId/priority` | `authorizeTaskAccess` (team from task) | member of the task's team |
| `/api/invitations/*`, `/api/applications/*` | recipient id / `application:review` | recipient only / manager+ |
| `/api/decisions/:id/ai-summary`, `/api/lessons/reusable` | parent project auth / caller's own teams only | member |
| User-scoped (`/api/teams`, `/api/projects`, `/api/me`, notifications, chat global) | id-only filters | authenticated |
| Public (`/api/methodologies`, discovery list, skill taxonomy, hybrid templates) | none | public by design |
| Socket rooms `team:*`, `chat:team:*`, `project:*`; `user:*` | id-only membership at join, revoked on removal | member / self |

The machine-generated per-route matrix is written to `server/tests/.artifacts/route-coverage.json` on every run (git-ignored).

---

## 6. Role-permission matrix

| Action | Owner | Leader | Manager | Member |
|---|:-:|:-:|:-:|:-:|
| Read workspace, write tasks, chat, create/plan/start sprints | ✓ | ✓ | ✓ | ✓ |
| Invite / add placeholder / remove lower-ranked members / review applications / bulk assign / delete sprint | ✓ | ✓ | ✓ | ✗ |
| Assign roles (≤ own rank, only to lower-ranked members, never self) | ✓ (up to leader) | ✓ (≤ leader) | ✓ (≤ manager) | ✗ |
| Rename / settings, complete sprint, approve/override phase gates, delete project, restore AI backlog | ✓ | ✓ | ✗ | ✗ |
| Transfer ownership, delete workspace | ✓ | ✗ | ✗ | ✗ |

Role labels map as follows:
- Leader: `leader, lead, team leader/lead, scrum master, owner*, admin`
- Manager: `manager, project manager, product owner`
- Anything else (functional labels such as "Frontend Developer"): member

\*A label can never confer ownership; ownership is `Team.ownerId` only.

---

## 7. Database safety

- New tests run only on an in-memory replica set validated by `assertSafeTestUri` before connecting. `process.env.MONGO_URI` is blanked inside tests.
- Legacy scripts are forced onto `MONGO_URI_TEST`, which must be local, test-named and different from `MONGO_URI`. Otherwise they exit with code 2 before any connection. Verified for unset, Atlas `+srv`, and production-named targets.
- Live-API scripts are blocked unless explicitly confirmed.
- No migration, seed or legacy script was run against Atlas. **The production database was neither accessed nor modified.**
- The 8 operational scripts (`seedDemo`, `migratePhase1`, `inspect*`, `recover*/reconcile*`) are intentionally unguarded operations tools. Document and review them before use (Phase 5).

---

## 8. Logo integration

- **Source:** the upload in the project root was a saved ChatGPT web page (`logo.html` + `logo_files/`), not an image.
  - The page's generated images were `blob:` URLs and were not saved.
  - Two embedded PNGs were found. One is unrelated ("ArthaSense AI"). The other is the NEXUSFLOW mark (1254×1254, RGBA, transparent background, 1.6 MB).
  - `logo.html` / `logo_files/` contain account identifiers and other conversation content, so they were **left untracked and untouched** and are not committed.
- **Assets:**
  - `client/assets/branding/nexusflow-logo.png`: the original, byte-identical.
  - `client/assets/branding/nexusflow-logo-512.png`: optimized LANCZOS derivative, 280 KB, alpha preserved. This is the only one bundled.
- **Component:** `client/components/branding/NexusFlowLogo.tsx` reserves a square box (no layout shift), uses `resizeMode="contain"`, has a transparent background, and is labeled as an accessible image.
- **Screens:**
  - Login and signup: the logo replaces the icon plus "NexusFlow" text (the wordmark is in the image). 190 px on desktop; centered at min(150, 40 vw) on narrow screens.
  - Forgot password: 112 px above the card.
  - Dashboard: 76/64/52 px in a top bar (logo left; Docs, notifications and avatar right), with the greeting kept beneath.
  - No splash screen, animation, extra background, or theme change.
- **Verification:**
  - Expo web production export bundles the asset.
  - Headless Chrome with exact device emulation: login 390/1440, signup 390/1024, forgot 390, and dashboard 320/390/768/1440 all show `scrollWidth == viewport` (no horizontal overflow), 0 broken images, and the logo loaded at the expected size.
  - Screenshots were reviewed visually.
  - Google login markup is unchanged.

---

## 9. Test results (actual commands)

| Command | Result |
|---|---|
| `npm run test:unit` | **PASS** 51/51 |
| `npm run test:security` | **PASS** 74/74 (incl. 2 whole-route-table sweeps) |
| `npm run test:integration` | **PASS** 14/14 (signup/login/session, workspace lifecycle, invites, roles, tasks, knapsack, Waterfall gates, intelligence, chat, notifications, GitHub status, leave/delete, Scrum, Kanban, Hybrid, migration utility) |
| `npm run test:logic` | **PASS**: TaskPriorityEngine 54, ScrumV4 11, Fixes1to5Logic 22, LocalAICore 30, DomainMethodology 17, ReactKeyDedup 8 |
| `client: npx tsc --noEmit` | **PASS** 0 errors |
| `client: npx expo export --platform web` | **PASS** |
| `node --check` on all server JS | **PASS** except pre-existing `__tests__/manualQaFixes.test.js` (Jest syntax; untouched) |
| Real server boot (strong secret) | **PASS**: public route 200, `/api/teams` 401 |
| Legacy suite via `runLegacyIsolated.js` (in-memory DB) | 81 scripts: **56 PASS, 11 FAIL, 14 BLOCKED** (see below) |
| `npm audit --omit=dev` | 8 advisories in **pre-existing** production dependencies (not changed in Phase 1) → Phase 5 |
| Secret scan of the diff | **PASS**: no keys or credentials; no `.env` committed |

**Legacy failures.** None is caused by Phase 1; each was inspected:
- 3 Scrum suites assert a hard-coded production team id.
- 3 expect pre-seeded data (`testArtifactSaveDeletePersistence`, `testPhase1DataFoundation`).
- 4 use cwd-relative `client/` paths or a removed `callGemini` export.
- 2 (`testMasterCorrections`, `testPhase2ProjectIntelligence`) hit a pre-existing bug: `AIMessage.provider` rejects `"none"` when no AI key is configured.

**Blocked:** 14 scripts drive a live API server and are correctly blocked by the guard.

**Not run:** `client/hooks/mergeSort.test.ts` (no client test runner); Jest file (Jest not installed); live AI/GitHub/Google providers (deliberately; zero-cost policy).

---

## 10. Breaking changes and migration requirements

1. **`JWT_SECRET`** must be ≥32 random bytes in every environment (including Render), or the server exits. Existing tokens signed with the same strong secret stay valid; legacy email-id tokens require re-login.
2. **Identity is id-only.** Users who reached a team only through a matching display name or email (no `members.userId` entry) lose access and must be invited. Owner-less, member-less teams are no longer accessible. Run the dry-run audit to list them.
3. **API changes:**
   - `DELETE /api/teams/:id` requires body `{confirmName}`; `DELETE /api/projects/:id` requires `{confirmName}` plus leader rank or above.
   - `POST /teams/:id/members` creates placeholders only (409 for emails).
   - Role changes follow §6.
   - GET on an uninitialized Scrum/Kanban workspace returns 409 `PROJECT_NOT_INITIALIZED` (the client auto-initializes via `POST /teams/:id/initialize-project`).
   - New endpoints: `transfer-ownership`, `initialize-project`, invitation cancel.
4. **Optional migration:** `node scripts/migrations/phase1MemberIdentityAudit.js` (dry run), then `--apply --confirm-db=<db>` after review. **Not executed.**
5. **Dev dependencies:** `mongodb-memory-server`, `socket.io-client` (free; tests only).

---

## 11. Remaining work (Phases 2–5, not implemented)

- **Phase 2:**
  - Password reset is still broken (D-11: token marked used on creation, no mailer, no reset screen) and login has no rate limiting.
  - Google OAuth still lacks `email_verified`/`aud` checks and sends the JWT in the URL (D-12).
  - Cascade deletion and recovery (D-16, D-17).
  - Counter drift and dashboard statistics (D-18, D-19).
  - `/health` endpoint and DB fail-fast (D-14).
  - Requirement `taskIds` accept foreign ids as references (no content exposure observed).
  - Route-order bug: `POST /api/scrum/dependencies/check-cycle` is shadowed by `/dependencies/:id`.
  - `AIMessage.provider` enum lacks `"none"`.
- **Phase 3:**
  - DAA correctness: D-20 to D-27 (greedy cap, ignored mode weights, health weights, BFS waves, fractional knapsack, OmniRoute latency and stale models).
  - Teacher-review faculty role guard.
- **Phase 4/5:**
  - AES-GCM for GitHub tokens (D-30); in-memory OAuth state and rate limiter (D-29).
  - Monolithic route files and 554 `any`s.
  - Production dependency advisories.
  - CI workflow.
  - Repaired legacy scripts.
  - RUN.md rewrite.
  - Operational-script safeguards.
  - Token revocation.
