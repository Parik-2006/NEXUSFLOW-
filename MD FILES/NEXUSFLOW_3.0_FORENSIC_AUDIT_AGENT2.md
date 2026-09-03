# NexusFlow 3.0 — Forensic Audit Report (Agent 2)

**Repository:** `P:\DAA OPTIONAL`
**Audit Date:** 2026-09-01
**Branch Audited:** `agent2` (commit `ea89602`, "AGENT2 DONE")
**Working Tree Status:** Clean (0 modifications)
**Constraint:** Read-only forensic inspection — no files modified, no commits made.

---

## 1. Executive Summary

Agent 2 was tasked with delivering NexusFlow 3.0 Phases 10–20 (Project Intelligence domain) on top of the V2 baseline, while preserving Agent 1's work in the User/Team/Real-Time domain (Phases 1–9). The audit reveals that Agent 2 delivered substantial backend infrastructure but **failed to integrate with or preserve Agent 1's Phase 1–9 identity & collaboration work**.

| Severity | Count | Category |
|----------|-------|----------|
| **CRITICAL** | 3 | $0 cost policy violations, broken Google OAuth, Invitation expiry removed |
| **HIGH** | 4 | Direct OpenAI bypass, model/contract mismatch, `aiRes.text` bug, missing env vars |
| **MEDIUM** | 6 | Cross-contamination gaps, deleted Agent 1 files, documentation drift |
| **LOW** | 3 | Test runner gaps, no lint scripts, 0-test-scripts-in-package.json |

### Bottom Line

Agent 2's branch delivers working Phase 10–17 backend services, but:
- **Breaks Google OAuth** — User model and AuthContext are unchanged from V2; Agent 1's `googleId`/`authProvider` fields are absent, yet `routes/auth.js` queries and writes them
- **Violates the $0 LLM cost policy** — 5 code sites call OpenAI `gpt-4o-mini` directly, bypassing OmniRoute's fail-closed guardrails
- **Deletes 8 Agent 1-only files** including UI panels for features Agent 2's backends serve
- **Removes invitation expiry** that Agent 1 added and the SHARED CONTRACT requires

---

## 2. Repository & Git State

### Branches

| Branch | Commit | Subject |
|--------|--------|---------|
| `version2.0` | `ac2907f` | Revise README — V2 baseline |
| `agent1` | `7926089` | agent2 part1 — Phase 1–9 |
| `agent2` | `ea89602` | AGENT2 DONE — Phases 10–20 (HEAD) |
| `main` | `74281f3` | Merge of version2.0 |

### Agent 2 Commit History (5 commits)

```
ea89602  AGENT2 DONE
a5dc178  docs: add detailed NexusFlow 3.0 Agent 2 implementation report
46f801f  feat(chat,auth,skills): add socket chatHandlers, auth routes, skill verification and tests
d4cbf3b  feat: NexusFlow 3.0 — Phases 10-20 complete (Agent 2)
```

**Agent 2 branched from V2** (`ac2907f`/`version2.0`) and made 4 feature commits plus 1 final commit. Agent 1 branched independently from V2 (1 commit: `7926089`). The branches share no common ancestor beyond V2 — they diverged and never merged.

---

## 3. File Inventory Matrix

### Agent 1 Only Files (deleted by Agent 2)

| File | Agent 1 | Agent 2 |
|------|---------|---------|
| `server/NEXUSFLOW_V3_AGENT2_INTEGRATION.md` | Added | **Deleted** |
| `client/app/(auth)/forgot-password.tsx` | Added | **Deleted** |
| `client/components/workspace/GitHubPanel.tsx` | Added | **Deleted** |
| `client/components/workspace/RetroPanel.tsx` | Added | **Deleted** |
| `client/components/workspace/RiskPanel.tsx` | Added | **Deleted** |
| `client/components/workspace/TeamHealthPanel.tsx` | Added | **Deleted** |
| `server/scripts/testCopilotPrivacy.js` | Added | **Deleted** |
| `server/scripts/testProductionHardening.js` | Added | **Deleted** |

### Agent 2 Only Files (new)

| File | Agent 1 | Agent 2 |
|------|---------|---------|
| `NEXUSFLOW_V3_AGENT2_IMPLEMENTATION.md` | — | Added |
| `NEXUSFLOW_V3_SHARED_CONTRACT.md` | — | Added |
| `server/routes/ai.js` | — | Added |
| `client/app/global-chat.tsx` | — | Added |
| `client/app/skill-graph.tsx` | — | Added |
| `client/app/skill-verification.tsx` | — | Added |
| `server/scripts/testNexusflowV3.js` | — | Added |
| `server/services/projectIntelligence.js` | — | Added |
| `server/services/taskDecomposer.js` | — | Added |
| `server/services/projectToolsService.js` | — | Added |

### Both Agents Independently Modified (Shared Files)

| File | Agent 1 | Agent 2 | Reconciled? |
|------|---------|---------|-------------|
| `server/models/User.js` | +`googleId`, `+authProvider` | == V2 (no changes) | ❌ Agent 2 overwrote Agent 1's additions |
| `server/.env.example` | +GOOGLE_*, +ENCRYPTION_KEY, +GITHUB_* | +GITHUB_*, +ENCRYPTION_KEY (no GOOGLE_*) | ❌ Agent 2 dropped Google vars |
| `server/models/Invitation.js` | +`expiresAt`, +`"expired"`/`"canceled"` | == V2 | ❌ Agent 2 reverted to V2 |
| `server/routes/teams.js` | V2 + AI suggestions, rate limiter, logger | Full rewrite (Phase 12-17 + OpenAI bypass) | ❌ Complete overwrite |
| `server/routes/auth.js` | V2 + Google OAuth routes | New file (Agent 2's own version) | ❌ Agent 1's version lost |
| `server/models/AIConversation.js` | +userId scoping | +userId + attemptId | ❌ Agent 2 overwrote |
| `server/index.js` | Auth + invitation wiring | Full Phase 10-20 wiring | ❌ Agent 2 overwrote |
| `client/context/AuthContext.tsx` | +signInWithGoogle, +forgotPassword | == V2 | ❌ Agent 2 reverted |
| `client/hooks/useChat.ts` | Added by Agent 1 | Modified by Agent 2 | ⚠️ Agent 2 version only |
| `server/services/*` (6 files) | Phase 12-17 | Full phase 12-17 rewrite | ❌ Agent 2 overwrote |
| `server/socket/*` (2 files) | Phase 10, 18 | Full rewrite | ❌ Agent 2 overwrote |
| `server/utils/*` (2 files) | logger, rateLimiter | Modified | ❌ Agent 2 overwrote |
| `server/models/*` (9 files) | Phase 8, 12-18, PasswordReset | Full rewrite | ❌ Agent 2 overwrote |

---

## 4. Critical Defects

### CRITICAL-1: Google OAuth Broken — Model/Route Mismatch

**Severity:** CRITICAL
**Files:** `server/models/User.js:1-3`, `server/routes/auth.js:1-95`, `server/.env.example:1-18`

Agent 2's `routes/auth.js` implements Google OAuth (lines 16-95) that performs:

1. **Line 70:** `User.findOne({ $or: [{ googleId }, { email }] })` — queries the `googleId` field
2. **Line 77:** `User.findByIdAndUpdate(user._id, { $set: { googleId, authProvider: "google" } })` — writes `googleId` and `authProvider`
3. **Line 84-85:** `User.create({ ..., googleId, authProvider: "google" })` — creates user with these fields

However, Agent 2's `User.js` is **byte-for-byte identical to V2** — it has **no `googleId` or `authProvider` fields**:

```javascript
// Agent 2 User.js == V2 User.js (confirmed via git show)
// Fields: name, email, password, avatar, bio, role, experience, skills
// Missing: googleId, authProvider  ← Agent 1 ADDED these
```

Mongoose strict mode **silently strips** unknown fields on `create()` and `findByIdAndUpdate()`. This means:
- Google OAuth users are created **without** `googleId` stored in the database
- Subsequent logins cannot find the user by `googleId` (always falls through to email-only match)
- The `googleId && user.googleId !== googleId` conflict check (line 73) will always be falsy, because `user.googleId` is always undefined
- `authProvider: "google"` is silently dropped — every Google user appears as `authProvider: "local"` (the default)

Additionally, `.env.example` **does not include** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI`. The auth route (lines 10-12) reads these from env, and the `/auth/google` init route (line 17) returns HTTP 500: `"Google OAuth is not configured on the server."` when they are absent.

**Agent 1's version** (confirmed via `git show agent1:server/models/User.js`) has both fields:
```javascript
googleId: { type: String, default: "", index: true },
authProvider: { type: String, enum: ["local", "google"], default: "local" },
```

And Agent 1's `.env.example` has the Google OAuth variables:
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

**Root cause:** Agent 2 created its own `routes/auth.js` (new file vs V2) and wrote Google OAuth code, but did not add the corresponding model fields or env vars. Agent 2 was supposed to consume Agent 1's auth work, but instead re-implemented it incompletely.

---

### CRITICAL-2: $0 LLM Cost Policy Violations — Direct OpenAI Calls Bypassing OmniRoute

**Severity:** CRITICAL
**Files:** `server/routes/teams.js` (3 call sites), `server/services/projectIntelligence.js`, `server/services/taskDecomposer.js`

The SHARED CONTRACT §14.2 and the `testOmniRouteZeroCostPolicy.js` test suite both mandate that **all** AI calls go through `omniRouteGenerate()` with `validateZeroCostRoute()` enforcement. However, the codebase contains **5 direct OpenAI API call sites** that bypass OmniRoute entirely:

| # | File:Line | Function | Model | Env Var | Policy Compliant? |
|---|-----------|----------|-------|---------|-------------------|
| 1 | `routes/teams.js:762-777` | `callOpenAiStructured()` | `gpt-4o-mini` | `OPENAI_API_KEY` (alias: `OPENAI_KEY_FOR_SUGGEST`) | ❌ |
| 2 | `routes/teams.js:1294-1340` | `POST /decide` endpoint | `gpt-4o-mini` | `OPENAI_KEY_DECIDE` | ❌ |
| 3 | `routes/teams.js:1464-1495` | `POST /project-guidance` endpoint | `gpt-4o-mini` | `OPENAI_KEY_GUIDANCE` | ❌ |
| 4 | `projectIntelligence.js:69-270` | `analyzeProject()` | `gpt-4o-mini` | `OPENAI_API_KEY` | ❌ |
| 5 | `taskDecomposer.js:492+` | `decomposeTasksWithContext()` | `gpt-4o-mini` | `OPENAI_API_KEY` | ❌ |

Each call site is guarded by `if (OPENAI_KEY)`, falling back to deterministic mode when the key is absent. This makes them **safe-by-accident** in default deployment (`.env.example` does not include `OPENAI_API_KEY`), but:

1. The code paths exist and are wired into active endpoints (`/decide`, `/project-guidance`, task suggestions)
2. The `testOmniRouteZeroCostPolicy.js` suite (13 tests) only validates `omniRoute.js` and `orchestrateCopilotChat()` — it does **NOT** test these 5 bypass routes
3. If anyone populates `OPENAI_API_KEY` in production, **paid OpenAI calls will execute**, violating the documented $0 policy

**OmniRoute itself is correctly implemented** (`server/services/omniRoute.js`):**
- Tier 1: Gemini Free Tier (`gemini-2.5-flash`)
- Tier 2: OpenRouter `:free` models (`openrouter/free`)
- Tier 3: Deterministic heuristic fallback
- `validateZeroCostRoute()` throws `ZeroCostViolationError` for any non-free provider
- `testOmniRouteZeroCostPolicy.js` validates all 13 policy rules

**The copilot chat path is clean** — `aiOrchestrator.js` → `orchestrateCopilotChat()` → `omniRouteGenerate()` correctly enforces the $0 policy.

**Recommendation:** Replace all 5 OpenAI call sites with `omniRouteGenerate()` + `validateZeroCostRoute()`. The `taskDecomposer.js` and `projectIntelligence.js` AI paths should be routed through `aiOrchestrator.js` (which already uses OmniRoute).

---

### CRITICAL-3: Invitation Expiry Removed — Contract Violation

**Severity:** CRITICAL
**File:** `server/models/Invitation.js`

Agent 2's `Invitation.js` has **no `expiresAt` field** and uses status enum `["pending", "accepted", "rejected"]` — identical to V2. Agent 1 added `expiresAt` with a 7-day default and TTL index, plus `"expired"` and `"canceled"` status values. The SHARED CONTRACT §5 explicitly requires:

> `expiresAt: Date (default: now + 7 days, indexed with TTL)`
> Statuses: `pending`, `accepted`, `rejected`, `expired`, `canceled`

Without expiry:
- Invitations remain pending indefinitely
- `testInvitationFlow.js` Section 5 (line 369) tests legacy email-as-id JWT resolution but **cannot test expiry** since the field doesn't exist
- The 7-day invitation TTL cleanup relies on MongoDB TTL index which is absent

---

## 5. High-Severity Defects

### HIGH-1: `projectToolsService.js` — Property Mismatch (`aiRes.text` vs `aiRes.content`)

**Severity:** HIGH
**File:** `server/services/projectToolsService.js:265`

The tool recommendation service calls `omniRouteGenerate()` which returns `{ content, provider, tokensUsed, ... }`, but then checks `aiRes.text`:

```javascript
// Line 265 — BUG: omniRoute returns { content }, not { text }
if (aiRes && aiRes.text) {
    const match = aiRes.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
```

`aiRes.text` is always `undefined`, so the AI-generated tool recommendation path is **silently skipped** and only deterministic fallback runs. The `testMasterCorrections.js` Section 4 (line 304) calls `getProjectToolRecommendations(projectA)` but only validates that it returns an array — it does not verify whether AI enrichment produced output.

### HIGH-2: `.env.example` Missing Google OAuth Variables

**Severity:** HIGH
**File:** `server/.env.example`

Agent 2's `.env.example` (confirmed at `P:\DAA OPTIONAL\server\.env.example`):

```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/nexusflow
JWT_SECRET=dev-secret-change-me

GEMINI_API_KEY=
OPENROUTER_API_KEY=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:4000/api/github/auth/callback

ENCRYPTION_KEY=nexusflow3_aes256_encryption_key_2026_safe

FRONTEND_URL=https://nexusflow-eta.vercel.app
```

**Missing** (present in Agent 1's version): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

Without these, `routes/auth.js` line 17 returns HTTP 500 on `/auth/google` init. Google OAuth is non-functional in any deployment using Agent 2's `.env.example`.

### HIGH-3: `resolveAuthUser` Not Exported

**Severity:** HIGH
**File:** `server/routes/teams.js:44`

The SHARED CONTRACT §14.3 states:
> `server/routes/teams.js` — `verifyTeamAccess`, `resolveAuthUser`

`verifyTeamAccess` is exported (line 61: `export async function`), but `resolveAuthUser` is a **local function** (line 44: `async function resolveAuthUser(reqUser)` — no `export`). It is used throughout `teams.js` (lines 271, 385, 412, 510, 560, 585, 1612, 1739, 2296) but cannot be imported by other modules.

`server/auth.js` exports only: `sign`, `verify`, `formatUser`, `requireAuth` — all confirmed via grep. There is **no** `resolveAuthUser` in `auth.js`.

**Workaround:** `testInvitationFlow.js` (line 38) defines its own inline copy labeled "inline mirror of the server helper for unit-level testing."

### HIGH-4: `package.json` Has No `test`, `lint`, or `typecheck` Scripts

**Severity:** HIGH
**File:** `server/package.json`

```json
"scripts": {
  "dev": "node --watch index.js",
  "start": "node index.js",
  "seed:demo": "node scripts/seedDemo.js"
}
```

13 test scripts exist in `server/scripts/` but none are wired to npm. There is no linting or type-checking configured.

---

## 6. Medium-Severity Findings

### MEDIUM-1: Deleted Client UI Panels

Agent 2 implemented server-side services for GitHub integration (Phase 11), Retrospectives (Phase 15), Risk (Phase 13), and Team Health (Phase 12) — but **deleted the client-side panels** that Agent 1 created:

| Backend Endpoint | Deleted Frontend Panel |
|---|---|
| `GET /api/projects/:projectId/github/summary` | `GitHubPanel.tsx` |
| `GET /api/projects/:projectId/risks` | `RiskPanel.tsx` |
| `GET /api/projects/:projectId/team-health` | `TeamHealthPanel.tsx` |
| `GET /api/projects/:projectId/retrospectives` | `RetroPanel.tsx` |

Backend endpoints exist but no frontend consumes them.

### MEDIUM-2: Both Agents Independently Rewrote Shared Services (Unresolved Conflicts)

Both agents modified the same Phase 12-17 service files. The agent1→agent2 diff shows all as `M` (modified), meaning Agent 2's version completely replaced Agent 1's. Without a git merge, one agent's implementation was lost:

```
server/services/teamHealth.js        — both modified (Agent 2 overwrote)
server/services/riskEngine.js        — both modified (Agent 2 overwrote)
server/services/retrospectiveService.js — both modified (Agent 2 overwrote)
server/services/learningService.js   — both modified (Agent 2 overwrote)
server/services/projectBrain.js      — both modified (Agent 2 overwrote)
server/services/githubService.js     — both modified (Agent 2 overwrote)
```

### MEDIUM-3: `NEXUSFLOW_V3_AGENT2_INTEGRATION.md` Deleted

Agent 1's integration coordination document was deleted and replaced by Agent 2's implementation report. No reconciliation between the two.

### MEDIUM-4: `ai.js` Uses Fallback Questions Only (No AI Generation)

**File:** `server/routes/ai.js`

The skill verification quiz endpoint (`POST /api/ai/quiz/generate`) uses `FALLBACK_QUESTIONS` only — it does not call `omniRouteGenerate()`. The SHARED CONTRACT §16 requires "Gemini-generated quizzes via OmniRoute." The `testNexusflowV3.js` test (line 333) validates the endpoint returns questions but does not verify AI generation.

### MEDIUM-5: `formatUser()` Omits `authProvider` and `googleId` (Cosmetic)

**File:** `server/auth.js:22-37`

The `formatUser()` function (used for all `/api/me` responses) does not include `googleId` or `authProvider` in the sanitized output. The SHARED CONTRACT §2 User Format Response explicitly lists only `{ id, _id, name, email, avatar, bio, role, experience, skills, createdAt, updatedAt }` — so this is **actually compliant** with the contract. However, if Google OAuth were fixed, the client would have no way to distinguish Google-authenticated users from local users.

### MEDIUM-6: Socket.IO Chat Rooms Use Prefix `chat:` Instead of Contract-Specified `team:`

**File:** `server/socket/chatHandlers.js`

The SHARED CONTRACT §7.6 specifies chat events as:
| Event | Target Room |
|-------|-------------|
| `chat:global:new` | Global (all) |
| `chat:team:new` | `team:{teamId}` |
| `chat:typing` | `team:{teamId}` |

Agent 2's `chatHandlers.js` uses room prefixes `chat:global` and `chat:team:${teamId}` for socket room joins, which differ from the contract's `team:{teamId}` pattern. This creates a **separate room namespace** that is inconsistent with the team room strategy used by `projectSyncHandlers.js` (which correctly uses `project:{projectId}`).

---

## 7. AI $0 Cost Policy — Detailed Audit

### 7.1 Clean Call Sites (Compliant)

| Path | Uses OmniRoute? | Test Coverage |
|---|---|---|
| `aiOrchestrator.js` → `orchestrateCopilotChat()` | ✅ `omniRouteGenerate()` | ✅ `testOmniRouteZeroCostPolicy.js` TEST 13 |
| `retrospectiveService.js` → `omniRouteGenerate()` | ✅ | ✅ `testRetrospective.js` |
| `academicResearchService.js` → `omniRouteGenerate()` | ✅ | ✅ `testMasterCorrections.js` Section 5 |
| `omniRoute.js` core engine | ✅ | ✅ `testOmniRouteZeroCostPolicy.js` (13 tests) |

### 7.2 Violating Call Sites (Non-Compliant)

| File:Line | Function/Route | Provider Bypassed | Guard |
|---|---|---|---|
| `routes/teams.js:762` | `callOpenAiStructured()` | OpenAI `gpt-4o-mini` | `if (OPENAI_KEY_FOR_SUGGEST)` |
| `routes/teams.js:1294` | `POST /api/teams/:id/decide` | OpenAI `gpt-4o-mini` | `if (OPENAI_KEY_DECIDE && ...)` |
| `routes/teams.js:1464` | `POST /api/teams/:id/project-guidance` | OpenAI `gpt-4o-mini` | `if (OPENAI_KEY_GUIDANCE && ...)` |
| `services/projectIntelligence.js:69` | `analyzeProject()` | OpenAI `gpt-4o-mini` | `if (!OPENAI_KEY)` → heuristic fallback |
| `services/taskDecomposer.js:492` | `decomposeTasksWithContext()` | OpenAI `gpt-4o-mini` | `if (OPENAI_KEY)` |

### 7.3 Policy Test Coverage Gap

`testOmniRouteZeroCostPolicy.js` (232 lines, 13 assertions) validates:
- ✅ OpenRouter `:free` models allowed at $0.00
- ✅ Paid OpenRouter models blocked with `ZeroCostViolationError`
- ✅ OpenRouter models without `:free` suffix blocked
- ✅ Gemini Free Tier models allowed at $0.00
- ✅ Unverified/paid Gemini models blocked
- ✅ Paid providers (OpenAI, Anthropic, Claude, Together, Groq, Cohere) blocked
- ✅ Unrestricted `auto` routing blocked
- ✅ Deterministic engine produces structured guidance at $0.00
- ✅ No paid OpenAI keys in server environment
- ✅ Copilot multi-intent responses restricted to free providers only

**NOT tested:** The 5 OpenAI bypass call sites in `teams.js`, `projectIntelligence.js`, and `taskDecomposer.js`.

---

## 8. Test Coverage Verification

### 8.1 Agent 2 Test Suite (13 scripts, 140+ assertions)

| Test Script | Focus | Assertions | Verified |
|---|---|---|---|
| `testPhase10Sync.js` | Real-time project sync, socket rooms, `verifyProjectAccess` | 25 | ✅ File exists |
| `testTeamHealth.js` | 5-dimension health scoring | 12 | ✅ File exists |
| `testRiskEngine.js` | 7 risk detectors | 16 | ✅ File exists |
| `testOpinionSystem.js` | Poll/vote/consensus→decision | 8 | ✅ File exists |
| `testRetrospective.js` | AI + deterministic retrospective | 11 | ✅ File exists |
| `testLearningLoop.js` | 4 pattern analyzers | 16 | ✅ File exists |
| `testProjectBrain.js` | 7-source context aggregation | 12 | ✅ File exists |
| `testNexusflowV3.js` | Phases 1-9 (auth, teams, chat, skills) | ~40 | ✅ 411 lines read |
| `testOmniRouteZeroCostPolicy.js` | $0 cost policy enforcement | 13 | ✅ 232 lines read |
| `testAuthAndIsolation.js` | Auth, JWT, isolation, copilot scoping | ~20 | ✅ 282 lines read |
| `testInvitationFlow.js` | Invitation lifecycle, ObjectId safety | 24 | ✅ 511 lines read |
| `testMasterRefactorFixes.js` | Header/avatar, skill matrix, leave/delete | ~25 | ✅ 300 lines read |
| `testMasterCorrections.js` | Master integration: copilot, tools, research, $0 | ~40 | ✅ 538 lines read |
| **TOTAL** | | **~237** | |

The implementation report claims 100/100 for the 7 Phase 10-17 suites, which is consistent with the file inventory. The additional test scripts (`testNexusflowV3.js`, `testOmniRouteZeroCostPolicy.js`, `testAuthAndIsolation.js`, `testInvitationFlow.js`, `testMasterRefactorFixes.js`, `testMasterCorrections.js`) are V2-era or cross-cutting tests.

### 8.2 Agent 1 Tests (Deleted)

| Test Script | Focus | Status |
|---|---|---|
| `testCopilotPrivacy.js` | Per-user copilot conversation scoping | ❌ Deleted |
| `testProductionHardening.js` | Logger sanitization, rate limiter | ❌ Deleted |

### 8.3 Test Gaps

- No test for **Google OAuth** flow (deleted `forgot-password.tsx` + no Google OAuth test)
- No test for **invitation expiry** (`expiresAt` absent from model)
- No test for **`invitation:received`/`invitation:updated`** socket events (contract-specified, not implemented)
- No test for **`team:member_left`** notification on leave (contract-specified)
- `testOmniRouteZeroCostPolicy.js` does not cover the 5 OpenAI bypass call sites

---

## 9. Dependency & Package Analysis

### 9.1 `server/package.json` Dependencies

```json
{
  "bcryptjs": "^3.0.3",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "jsonwebtoken": "^9.0.2",
  "mongoose": "^8.4.0",
  "socket.io": "^4.7.5"
}
```

**Notable:** No `@google/genai` or `google-generative-ai` SDK — `omniRoute.js` uses native `fetch()`. No `openai` SDK — bypassed routes also use `fetch()`. No ESLint/Prettier. No testing framework.

### 9.2 Scripts

```json
"scripts": {
  "dev": "node --watch index.js",
  "start": "node index.js",
  "seed:demo": "node scripts/seedDemo.js"
}
```
- No `test`, `lint`, or `typecheck` scripts.

### 9.3 Environment Variables

**`server/.env.example` (Agent 2 working copy):**
```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/nexusflow
JWT_SECRET=dev-secret-change-me
GEMINI_API_KEY=
OPENROUTER_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:4000/api/github/auth/callback
ENCRYPTION_KEY=nexusflow3_aes256_encryption_key_2026_safe
FRONTEND_URL=https://nexusflow-eta.vercel.app
```

**V2 baseline** had only: `PORT`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`.

**Agent 1** had all of the above PLUS: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

**Agent 2 is missing:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

---

## 10. Integration Risk Assessment

### 10.1 Git Merge State (agent1 ↔ agent2)

Agent 1 and Agent 2 diverged from the same V2 base and were never merged. Merging `agent1` into `agent2` would produce conflicts in **31 files** (every shared file). Key conflict categories:

| Conflict Type | Files | Risk |
|---|---|---|
| Field additions (Agent 1 has, Agent 2 lost) | `User.js`, `Invitation.js`, `.env.example` | Data model regression |
| Route file overwrites | `routes/teams.js`, `routes/auth.js` | API behavior conflicts |
| Service rewrites | 6 service files | Logic conflicts |
| Client file overwrites | 8+ files | UI regression |
| Socket handler rewrites | `chatHandlers.js`, `projectSyncHandlers.js` | Real-time event conflicts |

### 10.2 Phase Boundary Violations

The SHARED CONTRACT §14.1 establishes a clear division:
- **Agent 1:** User/Team/Real-Time domain (Phases 1-9)
- **Agent 2:** Project Intelligence domain (Phases 10-20)

Agent 2's `routes/auth.js` (Google OAuth + password reset) and `routes/skills.js` (skill verification) **cross into Agent 1's territory** (Phases 1, 7-8) without preserving Agent 1's implementation. Agent 2's `projectGuidanceEngine.js` and `decisionEngine.js` correctly stay in Phase 5 territory (shared V2 baseline).

### 10.3 What Works Today (Agent 2, unpushed/merged)

If you run Agent 2's code as-is (without merging Agent 1):

| Feature | Status | Notes |
|---|---|---|
| Phase 10: Project sync socket rooms | ✅ Works | `projectSyncHandlers.js`, `verifyProjectAccess` |
| Phase 11: GitHub OAuth & analytics | ✅ Works (server-side) | But `GitHubPanel.tsx` UI deleted |
| Phase 12: Team health score | ✅ Works | But `TeamHealthPanel.tsx` UI deleted |
| Phase 13: Risk engine | ✅ Works | But `RiskPanel.tsx` UI deleted |
| Phase 14: Opinion polling | ✅ Works | Endpoints in `projects.js` |
| Phase 15: Retrospective engine | ✅ Works | But `RetroPanel.tsx` UI deleted |
| Phase 16: Learning loop | ✅ Works | `learningService.js` |
| Phase 17: Project brain RAG | ✅ Works | `projectBrain.js` |
| Phase 18: Real-time chat | ✅ Works | Socket + REST + `global-chat.tsx` |
| Phase 19: Production hardening | ✅ Works | Logger + rate limiter |
| Phase 8: Skill verification | ⚠️ Partial | `ai.js` uses fallback questions, no AI generation |
| Google OAuth | ❌ **Broken** | Model fields + env vars missing |
| Invitation expiry | ❌ **Missing** | `expiresAt` field absent |
| Invitation notifications | ❌ **Missing** | Socket events not emitted |
| $0 cost policy | ⚠️ **Conditional** | OmniRoute compliant; 5 OpenAI bypass routes safe-by-accident (key absent from .env.example) |

---

## 11. Recommendations

### Immediate (CRITICAL)

1. **Fix Google OAuth** — Add `googleId` and `authProvider` fields to `User.js`, add Google OAuth env vars to `.env.example`, restore `signInWithGoogle`/`forgotPassword`/`resetPassword` to `AuthContext.tsx`, restore `forgot-password.tsx`. Merge Agent 1's `User.js` and `AuthContext.tsx` into Agent 2.

2. **Remove all direct OpenAI calls** — Refactor `callOpenAiStructured()` (teams.js:762), `/decide` AI enrichment (teams.js:1294), `/project-guidance` AI enrichment (teams.js:1464), `analyzeProject()` (projectIntelligence.js:69), and `decomposeTasksWithContext()` (taskDecomposer.js:492) to use `omniRouteGenerate()` + `validateZeroCostRoute()`.

3. **Restore invitation expiry** — Add `expiresAt` field with TTL index and `"expired"`/`"canceled"` status enum values to `Invitation.js`, matching Agent 1's implementation.

### High Priority

4. **Export `resolveAuthUser` from `teams.js`** — Add `export` keyword to the local function so other modules can import it (SHARED CONTRACT §14.3 requires it as a shared utility).

5. **Add npm test script** — Wire all test scripts to a single `npm test` entry point or individual `npm run test:xxx` scripts. Add `npm run lint` with ESLint.

6. **Fix `projectToolsService.js`** — Change `aiRes.text` to `aiRes.content` to match OmniRoute's return shape.

### Medium Priority

7. **Restore deleted UI panels** — Re-add `GitHubPanel.tsx`, `RetroPanel.tsx`, `RiskPanel.tsx`, `TeamHealthPanel.tsx`, `forgot-password.tsx` from the Agent 1 branch, or confirm they are intentionally out of scope.

8. **Restore deleted test scripts** — Re-add `testCopilotPrivacy.js` and `testProductionHardening.js` from Agent 1, or merge their assertions into existing test suites.

9. **Add OpenAI bypass coverage to test suite** — Extend `testOmniRouteZeroCostPolicy.js` (or create a new `testCostPolicyBypassRoutes.js`) to verify that `OPENAI_API_KEY`-guarded routes in `teams.js`, `projectIntelligence.js`, and `taskDecomposer.js` do not make paid calls.

10. **Resolve Phase 12-17 service conflicts** — Decide which agent's implementation of each shared service is canonical. Currently Agent 2's version is active and Agent 1's is overwritten.

---

## 12. File Reference Index

| File | Lines | Key Content |
|------|-------|-------------|
| `server/routes/auth.js` | 230 | Google OAuth (broken: depends on missing model fields), forgot/reset password |
| `server/routes/teams.js` | 2416+ | Team CRUD, invitations, B&B assignment, OpenAI bypass (3 call sites), health score |
| `server/routes/projects.js` | — | Phase 12-17 project endpoints |
| `server/routes/skills.js` | — | Skill graph, gaps, verification |
| `server/routes/chat.js` | — | Global/team chat REST endpoints |
| `server/routes/ai.js` | — | Quiz generate/submit (fallback questions only) |
| `server/routes/github.js` | — | GitHub OAuth, repo summary |
| `server/services/omniRoute.js` | — | $0 fail-closed 3-tier engine |
| `server/services/aiOrchestrator.js` | — | Copilot orchestration (uses OmniRoute) |
| `server/services/projectIntelligence.js` | 1400+ | OpenAI bypass (analyzeProject) |
| `server/services/taskDecomposer.js` | — | OpenAI bypass (decomposeTasksWithContext) |
| `server/services/projectToolsService.js` | — | Bug: `aiRes.text` instead of `aiRes.content` |
| `server/models/User.js` | 55 | Missing `googleId`/`authProvider` (Agent 1 added) |
| `server/models/Invitation.js` | — | Missing `expiresAt` (Agent 1 added) |
| `server/.env.example` | 18 | Missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI |
| `server/auth.js` | 48 | sign, verify, formatUser, requireAuth (no resolveAuthUser) |
| `server/index.js` | — | Wires all routes + sockets |
| `server/socket/chatHandlers.js` | — | chat:global, chat:team, chat:typing events |
| `server/socket/projectSyncHandlers.js` | — | 8 broadcasters, verifyProjectAccess |
| `server/utils/logger.js` | — | Sanitizing logger (redacts JWTs, keys, passwords) |
| `server/utils/rateLimiter.js` | — | Sliding-window rate limiter |
| `server/algorithms/branchAndBound.js` | 324 | B&B assignment with skill-gap cost matrix |
| `server/algorithms/taskOptimiser.js` | 356 | Greedy, Knapsack, TopoSort, MergeSort, BMH |
| `server/algorithms/graphTraversal.js` | 145 | DFS, BFS, Kahn's TopoSort (canonical) |
| `server/algorithms/decisionEngine.js` | 835 | Phase 5 decision engine (all DAA algorithms) |
| `server/algorithms/projectGuidanceEngine.js` | 794 | Project guidance (domain HW/AI detection, phases, skills) |
| `server/models/Project.js` | 247 | Project entity with embedded ProjectContext |
| `server/models/Task.js` | 124 | Task with DAA fields + priorityScore pre-save hook |
| `NEXUSFLOW_V3_SHARED_CONTRACT.md` | 648 | 16-section API contract (Agent 2 authored) |
| `NEXUSFLOW_V3_AGENT2_IMPLEMENTATION.md` | 327 | Agent 2's implementation report (100/100 claimed) |
| `server/scripts/testOmniRouteZeroCostPolicy.js` | 232 | 13 assertion $0 cost policy test suite |
| `server/scripts/testNexusflowV3.js` | 411 | 40 assertion Phases 1-9 test suite |
| `server/scripts/testInvitationFlow.js` | 511 | 24 assertion invitation/notification test suite |
| `server/scripts/testMasterCorrections.js` | 538 | ~40 assertion master integration test suite |
| `server/scripts/testMasterRefactorFixes.js` | 300 | ~25 assertion FIX 1-4 test suite |

---

*Report compiled from static code analysis, git history inspection, and cross-branch comparison. No files were modified during this audit.*
