# NEXUSFLOW — Complete Repository File Index (`481` In-Scope Files)

> **Evidence Scope:** Exhaustive static enumeration performed on branch `version4.0` via `classify_files.cjs` and metadata catalog `catalog_481.tsv` (`CODE VERIFIED`).  
> **Exclusions (Repository Hygiene):** `.git/`, `client/.expo/`, `client/dist/`, `client/node_modules/`, and `server/node_modules/` are excluded. Secrets inside `.env` files were **never read** (`ENV_OR_SECRET_SKIPPED`). Binary `.pdf` and `.png` files were cataloged by size without binary parsing (`BINARY_ASSET`).

---

## 1. Directory & File Count Summary

| Directory / Group | Count | Primary Role |
|---|---:|---|
| `(root)` | 14 | Docs, specs, Git ignore, Windows `.bat` launchers, legacy root server logs |
| `.claude/` | 1 | Claude Code local permission whitelist |
| `.kilo/` | 2 | Kilo agent-manager worktree metadata & ignore |
| `scripts/` | 1 | Expo Metro bundler HTTP smoke script |
| `docs/` | 5 | V1/V2 baseline architecture, DAA, Vision, UserFlow & Mentor Demo docs |
| `documents/` | 2 | Binary academic DAA PDFs (Poster & Report) |
| `images/` | 6 | Architecture & Workflow PNG diagrams (V1, V2, V3) |
| `MD FILES/` | 57 | Phase 0–6 docs, V3 integration/forensics, V4 plans, prompts & audit reports |
| `client/` (root configs/env/lock) | 10 | Expo config, Babel, TSConfig, package manifests, `.env` / `.env.example` |
| `client/app/` | 14 | Expo Router file-based screens, layouts & workspace shell `[teamId].tsx` |
| `client/components/` | 95 | 28 shared/top-level/discovery/chat/guide components + 67 `workspace/` panels & canvases |
| `client/constants/` | 3 | Static guide data & project templates |
| `client/context/` | 1 | Global JWT/OAuth `AuthContext.tsx` |
| `client/hooks/` | 11 | 10 stateful API/Socket hooks + 1 unwired `mergeSort.test.ts` |
| `client/services/` | 3 | Socket singleton, `scrumApiService.ts`, `kanbanApiService.ts` |
| `client/utils/` | 5 | API URL resolver, Boyer-Moore search, Markdown XSS sanitizer, Methodology config, Storage |
| `server/` (root configs/env/entry/lock) | 6 | Express + Socket.IO entrypoint `index.js`, JWT `auth.js`, package manifests, `.env*` |
| `server/__tests__/` | 1 | Broken/unrunnable Jest-style TS-in-JS test file |
| `server/algorithms/` | 8 | Deterministic DAA engines (Greedy, Knapsack, Graph/Topo, B&B, Decision, Decomposer, Guidance, Priority 2.0) |
| `server/config/` | 2 | Methodology availability/release gating & GitHub OAuth environment validator |
| `server/constants/` | 2 | Canonical skill taxonomy & fallback quiz question pools |
| `server/data/` | 1 | 7 seeded Waterfall/Scrum project templates |
| `server/models/` | 42 | All Mongoose schemas (`timestamps: true` on 42/42, default pluralized collections) |
| `server/routes/` | 13 | Express REST routers (`428` route declarations across `index.js` + 13 routers) |
| `server/scripts/` | 103 | `9` non-test utilities/seeders/migrations + `94` standalone Node test/audit suites |
| `server/services/` | 65 | AI/OmniRoute, GitHub, Waterfall, Scrum, Kanban, Hybrid, Methodology, Workstream 11–25 services |
| `server/socket/` | 4 | Socket.IO handlers (`aiOrchestrator`, `chatHandlers`, `projectSyncHandlers`, `taskHandlers`) |
| `server/utils/` | 4 | Secret-redacting logger, compact context builder, unused rate limiter, 5 comparison sorts |
| **TOTAL IN-SCOPE FILES** | **481** | **100% enumerated & classified** |

### Status Legend
- `ACTIVE`: Compiled/imported and reachable in live runtime UI or active backend execution paths.
- `PARTIAL`: Implemented in backend or UI but gated, half-wired, or missing full FE↔BE / Socket integration.
- `ORPHANED`: Source exists in repo with zero live callers, unreachable routing, or dead code paths.
- `TEST` / `UTILITY`: Automated verification suite or one-off inspection/migration/seed script.
- `DOCS` / `CONFIG` / `BINARY` / `ENV (SECRET)`: Documentation, build/runtime config, binary assets, or redacted `.env` files.

---

## 2. Root, Tooling, Scripts & Documentation (`88` Files)

### 2.1 Root, `.claude/`, `.kilo/` & `scripts/` (`18` Files)
| Path | Bytes | Lines | Status | Primary Purpose / Notes |
|---|---:|---:|---|---|
| `.gitignore` | 51 | 7 | `CONFIG` | Root ignore rules (`node_modules/`). **Gap:** does not ignore `.env` at root; reliance placed on subfolder `.gitignore`s. |
| `.claude/settings.local.json` | 3981 | 55 | `CONFIG` | Local Claude Code command allowlist from prior cleanup/dev sessions. |
| `.kilo/.gitignore` | 107 | 8 | `CONFIG` | Ignores `node_modules` inside `.kilo/`. |
| `.kilo/agent-manager.json` | 536 | 22 | `CONFIG` | Historical Kilo agent worktree metadata (`sparkling-felidae`). |
| `README.md` | 4201 | 123 | `DOCS` | V3-era project README; cites 8 DAA algorithms & 2-tier OmniRoute (omits Groq & V4 methodologies). |
| `RUN.md` | 831 | 28 | `DOCS` | Outdated local/prod run guide referencing `OPENAI_API_KEY` and passwordless login. |
| `setup.bat` | 622 | 28 | `CONFIG` | Windows installer running `npm install` in `server/` and `client/`. |
| `start.bat` | 2292 | 62 | `CONFIG` | Windows dual launcher (`server` on `:4000` + `client` Expo Metro on `:8081`). |
| `scripts/testMetroBundle.js` | 1489 | 38 | `TEST` | Smoke test fetching `http://localhost:8081` and verifying Metro `entry.bundle` HTTP 200 JS delivery. |
| `version4.0.md` | 57148 | 2700 | `DOCS` | Master V4 brainstorming & architectural exploration plan ("living scope document"). |
| `NexusFlow_V4_Part_2_Remaining_Architecture_Roadmap.md` | 35456 | 1770 | `DOCS` | Active V4 Part-2 roadmap (duplicate identical-byte copy exists inside `MD FILES/`). |
| `NexusFlow_V4_Classic_Guide_and_Scrum_Analytics_Audit.md` | 16232 | 224 | `DOCS` | Oct 31, 2026 audit: Classic V1 Guide modal/banner & DB-backed Scrum analytics. |
| `NexusFlow_V4_Classic_Restoration_and_Scrum_Scroll_Audit.md` | 16219 | 184 | `DOCS` | Oct 29, 2026 audit: 6-tab Classic workspace restoration & Scrum horizontal scroll buttons. |
| `NexusFlow_V4_Scrum_Production_Release_and_Deployment_Audit.md` | 13387 | 229 | `DOCS` | Oct 27, 2026 audit: `SCRUM_PRODUCTION_ENABLED` flag & Render/Vercel sync state. |
| `full_spec.txt` | 47943 | 1052 | `DOCS` | Full prompt specification for Scrum Fixes 1–5 (intentionally untracked prior to releases). |
| `temp_user_req.txt` | 4137 | 61 | `DOCS` | Truncated copy of V4 Scrum user prompt (`full_spec.txt`). |
| `server.out.log` | 157 | — | `CONFIG` | Stale Sept 2026 JSON startup log line from local server test. |
| `server.err.log` | 0 | — | `CONFIG` | Empty 0-byte root error log file. |

### 2.2 `docs/`, `documents/` & `images/` (`13` Files)
| Path | Bytes | Lines | Status | Primary Purpose / Notes |
|---|---:|---:|---|---|
| `docs/Architecture.md` | 4223 | 87 | `DOCS` | V1/V2 architecture overview (outdated: cites 8-tab workspace & email-only dev login). |
| `docs/DAAIntegration.md` | 3623 | 74 | `DOCS` | Design rationale for 8 embedded DAA algorithms behind UX workflows. |
| `docs/MENTOR_DEMO_GUIDE.md` | 7585 | 167 | `DOCS` | 10-step evaluator walkthrough (outdated: references `OPENAI_API_KEY` & any-email login). |
| `docs/ProductVision.md` | 2604 | 59 | `DOCS` | Product positioning document comparing NexusFlow against Linear/Jira/Asana. |
| `docs/UserFlow.md` | 3555 | 81 | `DOCS` | V1/V2 end-to-end user flow doc (8 workspace tabs, dev login). |
| `documents/DAA POSTER.pdf` | 779923 | — | `BINARY` | Academic DAA course poster PDF. |
| `documents/DAA REPORT.pdf` | 1906503 | — | `BINARY` | Academic DAA project report PDF. |
| `images/architecture.png` | 1476274 | — | `BINARY` | V1 system architecture diagram. |
| `images/architecture-version2.0.png` | 1504636 | — | `BINARY` | V2 system architecture diagram. |
| `images/architecture-version3.0.png` | 1689870 | — | `BINARY` | V3 system architecture diagram (embedded in `README.md`). |
| `images/workflow.png` | 1534575 | — | `BINARY` | V1 workflow diagram. |
| `images/workflow-version2.0.png` | 1665104 | — | `BINARY` | V2 workflow diagram. |
| `images/workflow-version3.0.png` | 1512523 | — | `BINARY` | V3 workflow diagram (embedded in `README.md`). |

### 2.3 Historical Specs, Prompts & Audit Reports in `MD FILES/` (`57` Files)
| Path | Bytes | Lines | Era / Category | Purpose & Verification Caveats |
|---|---:|---:|---|---|
| `MD FILES/PHASE_0_AUDIT.md` | 119156 | 2149 | V1→V2 | Pre-V2 codebase audit (notes OpenAI mock & dev auth). |
| `MD FILES/NEXUSFLOW_V2.0_ARCHITECTURE_PLAN_UPDATED.md` | 48152 | 2201 | V2 | V2 architecture blueprint for AI Project Intelligence Platform. |
| `MD FILES/PHASE_1_DATABASE_ARCHITECTURE.md` | 35298 | 775 | V2 | Additive 8-model Phase 1 schema (`Project`, `Decision`, `AIMessage`, etc.). |
| `MD FILES/PHASE_1_MIGRATION_PLAN.md` | 12641 | 348 | V2 | Zero-downtime DB migration runbook (`migratePhase1.js`). |
| `MD FILES/PHASE_2_PROJECT_INTELLIGENCE.md` | 28498 | 542 | V2 | AI Project Advisor & structured analyzer spec. |
| `MD FILES/PHASE_3_AI_TASK_DECOMPOSITION.md` | 26630 | 534 | V2 | AI task generation + DAA scheduling spec. |
| `MD FILES/PHASE_4_AI_PROJECT_ASSISTANT.md` | 21719 | 405 | V2 | Team-aware copilot & subtask assistant spec. |
| `MD FILES/PHASE_5_DECISION_RECOMMENDATION.md` | 21283 | 542 | V2 | Decision Matrix & "AI Cannot Make The Decision" principle. |
| `MD FILES/PHASE_6_STUDENT_PROJECT_GUIDANCE.md` | 15807 | 314 | V2 | Deterministic 14-stage `project-guidance` & 24h Hackathon Knapsack spec. |
| `MD FILES/MANUAL_TESTING_PHASE_6.md` | 8750 | 209 | V2 | 17-scenario manual browser/simulator QA guide. |
| `MD FILES/MANUAL_TESTING_PHASE_6_RESULTS.md` | 8400 | 171 | V2 | Aug 27, 2026 localhost test report (prerelease OpenAI era). |
| `MD FILES/NEXUSFLOW_V3.0_ARCHITECTURE_PLAN.md` | 78844 | 4069 | V3 | V3 "Student Project OS" architecture (OAuth, Skills, GitHub, OmniRoute). |
| `MD FILES/NEXUSFLOW_V3_SHARED_CONTRACT.md` | 21901 | 649 | V3 | Multi-agent interface contract (`Agent 1` vs `Agent 2`). |
| `MD FILES/NEXUSFLOW_V3_AGENT2_IMPLEMENTATION.md` | 19154 | 328 | V3 | Agent 2 implementation report (claims superseded by forensic audit). |
| `MD FILES/NEXUSFLOW_3.0_FORENSIC_AUDIT_AGENT2.md` | 32412 | 589 | V3 | Sept 1, 2026 forensic audit exposing OAuth, bypass, & deletion defects. |
| `MD FILES/NEXUSFLOW_V3_INTEGRATION_MATRIX.md` | 6007 | 157 | V3 | Branch diff matrix across V2, Agent 1, and Agent 2. |
| `MD FILES/NEXUSFLOW_V3_INTEGRATION.md` | 27942 | 471 | V3 | Merge reconciliation report on `v3.0-integration`. |
| `MD FILES/NexusFlow_V4_Waterfall_Implementation_Plan(2).md` | 51633 | 2528 | V4 Plan | Waterfall methodology blueprint. |
| `MD FILES/NexusFlow_V4_Scrum_Implementation_Plan.md` | 49057 | 2571 | V4 Plan | Scrum methodology blueprint. |
| `MD FILES/NexusFlow_V4_Kanban_Implementation_Plan.md` | 54126 | 1851 | V4 Plan | Kanban methodology blueprint (note CFD missing in actual code). |
| `MD FILES/NexusFlow_V4_Part_2_Remaining_Architecture_Roadmap.md` | 35456 | 1770 | V4 Plan | Duplicate copy of root Part-2 roadmap. |
| `MD FILES/NexusFlow_V4_First_5_Fixes_Agent_Prompts.md` | 16640 | 539 | V4 Prompts | Implementation prompt batch #1 (foundation fixes 1–5). |
| `MD FILES/NexusFlow_V4_Next_5_Fixes_Agent_Prompts.md` | 16842 | 593 | V4 Prompts | Prompt batch #2. |
| `MD FILES/NexusFlow_V4_Next_5_Implementation_Agent_Prompts.md` | 23661 | 1265 | V4 Prompts | Workstreams 6–10 prompt batch. |
| `MD FILES/version4.0_5-fixes.md` | 20287 | 673 | V4 Prompts | Parallel 5-fix batch & DAA/AI separation rules. |
| `MD FILES/LOCAL_AI_RESEARCH_FOUNDATION.md` | 3532 | 58 | V4 Research | Local LLM evaluation framing (`Ollama`/`llama.cpp` research only). |
| `MD FILES/NexusFlow_V4_Workstreams_11-15_Implementation_Prompts.md` | 13574 | 573 | V4 Prompts | Prompts for Process Mining, Conformance, Teacher Review, Academic Eval, Fair Contribution. |
| `MD FILES/NexusFlow_V4_Workstreams_16-20_Implementation_Prompts.md` | 13169 | 520 | V4 Prompts | Prompts for Attachments, Multimodal, Domain, Domain×Methodology, Local AI Core. |
| `MD FILES/NexusFlow_V4_Workstreams_21-25_Implementation_Prompts.md` | 26896 | 1102 | V4 Prompts | Prompts for Learning Loop, Capability, Explainable Decisions, Health 2.0, Adaptive Methodology. |
| `MD FILES/NexusFlow_V4_Workstreams_26-30_Implementation_Prompts.md` | 25841 | 1221 | V4 Prompts | Prompts for Security, DB/Indexes, API+Socket Contracts, DAA/AI Boundary, Release Audit. |
| `MD FILES/NexusFlow_V4_Part2_Current_Implementation_Status.md` | 45771 | 570 | V4 Audit | Sept 2026 Workstreams 1–30 empirical gap audit. |
| `MD FILES/NexusFlow_V4_Workstreams_11-15_Execution_Report.md` | 21273 | 550 | V4 Audit | WS 11–15 execution report (browser verification blocked; UI panels left unimported). |
| `MD FILES/NexusFlow_V4_Workstreams_16-20_Execution_Report.md` | 19477 | 501 | V4 Audit | WS 16–20 execution report (UI panels left unimported in workspace shell). |
| `MD FILES/ARTIFACT_SAVE_DELETE_FIX_REPORT.md` | 14598 | 319 | V4 Waterfall | Oct 13, 2026 `.lean()` fix in `findProject` & artifact deletion. |
| `MD FILES/WATERFALL_ARTIFACT_PLAN_GATING_IMPLEMENTATION.md` | 18780 | 319 | V4 Waterfall | Oct 13, 2026 deterministic artifact parser & plan gating report. |
| `MD FILES/waterfall_artifact_approval_finalization_audit.md` | 24167 | 293 | V4 Waterfall | Oct 14, 2026 bulk artifact approval & plan finalization fix. |
| `MD FILES/waterfall_bulk_requirement_approval_audit.md` | 16047 | 225 | V4 Waterfall | Oct 14, 2026 bulk requirement approval & edit invalidation fix. |
| `MD FILES/waterfall_duplicate_react_key_fix_report.md` | 11251 | 165 | V4 Waterfall | Fixes duplicate empty React keys across Waterfall plan/task/timeline panels. |
| `MD FILES/NexusFlow_V4_Waterfall_Three_Fixes_Final_Audit.md` | 40516 | 566 | V4 Waterfall | Oct 17, 2026 phase DAG deadlock & unified health fixes. |
| `MD FILES/NexusFlow_V4_Four_Fixes_Integrated_Final_Audit.md` | 25819 | 264 | V4 Waterfall | Learning loop, capability accept, risk radar, & bulk convert audit. |
| `MD FILES/NexusFlow_V4_Final_Two_Fixes_Audit.md` | 14188 | 166 | V4 Waterfall | Oct 18, 2026 convert-all button & stale risk auto-resolve audit. |
| `MD FILES/NexusFlow_V4_Waterfall_Workspace_Redesign_Artifact_Gating_Audit.md` | 23664 | 268 | V4 Waterfall | Oct 18, 2026 7-tab Waterfall redesign & starter task removal. |
| `MD FILES/NexusFlow_V4_Documentation_Methodology_Release_Safety_Audit.md` | 18743 | 256 | V4 Release | Oct 18, 2026 `/docs` 5-section pruning & Scrum/Kanban/Hybrid gating. |
| `MD FILES/NexusFlow_V4_Git_Release_and_Branch_Synchronization_Audit.md` | 11515 | 210 | V4 Git | Oct 18, 2026 `version4.0` -> `main` release sync (`e6c16d9`). |
| `MD FILES/NexusFlow_V4_GitHub_Workspace_Memory_Documentation_Audit.md` | 16472 | 225 | V4 GitHub | Oct 20, 2026 `RepositoryIndex`, `workspaceContextService`, & 19-cat `ProjectMemory`. |
| `MD FILES/NexusFlow_V4_GitHub_Workspace_Tab_and_Memory_Audit.md` | 18026 | 302 | V4 GitHub | Oct 20, 2026 adds 8th Waterfall `github` tab (`d36ec2c`). |
| `MD FILES/NexusFlow_V4_GitHub_OAuth_Backend_Hardening_Audit.md` | 18813 | 251 | V4 GitHub | Oct 21, 2026 persistent `OAuthState`, `GitHubCredential`, & prod URL guards. |
| `MD FILES/NexusFlow_V4_Waterfall_Protection_Regression_Audit.md` | 18585 | 264 | V4 Waterfall | Oct 21, 2026 Waterfall regression isolation check. |
| `MD FILES/NexusFlow_V4_Scrum_Development_Enablement_Audit.md` | 15980 | 248 | V4 Scrum | Oct 21, 2026 dev-only Scrum unlock & `scrum.js` IDOR hardening. |
| `MD FILES/NexusFlow_V4_Scrum_Redesign_Audit_Report.md` | 18869 | 274 | V4 Scrum | Oct 21, 2026 8-tab Scrum UI & capacity/story lifecycle redesign. |
| `MD FILES/NexusFlow_V4_Scrum_RealData_Insights_Graph_Audit.md` | 16707 | 221 | V4 Scrum | Oct 21, 2026 `getScrumTaskQuery`, 5 Insights subtabs, & `@xyflow/react` DAG. |
| `MD FILES/NexusFlow_V4_Scrum_Fixes_1_to_4_Audit.md` | 21529 | 241 | V4 Scrum | Oct 23, 2026 `SELECTED_FOR_SPRINT`, shared `HealthScoreGauge`, `DELETE sprint`. |
| `MD FILES/NexusFlow_V4_Scrum_Sprint_Generation_DAG_Fix_Audit.md` | 17471 | 188 | V4 Scrum | Oct 23, 2026 sprint commit payload & incremental story dedup fix. |
| `MD FILES/NexusFlow_V4_Scrum_Fix_5_Finalization_Audit.md` | 8370 | 104 | V4 Scrum | Oct 2026 Scrum Gate-1 plan finalization & readiness checks. |
| `MD FILES/NexusFlow_V4_Scrum_Health_Risk_Persistence_Audit.md` | 16674 | 222 | V4 Scrum | Oct 23, 2026 `PROJECT_PLANNING` vs `ACTIVE_SPRINT` health & Scrum Risk DB persistence. |
| `MD FILES/NexusFlow_V4_Scrum_Delete_Sprint_and_Retrospective_Audit.md` | 11260 | 129 | V4 Scrum | Oct 27, 2026 `Delete Sprint` visibility & `(projectId, sprintId)` retro scoping. |
| `MD FILES/NexusFlow_V4_Version4_Main_Synchronization_Report.md` | 7346 | 124 | V4 Git | Oct 27, 2026 `version4.0` -> `main` synchronization report. |

---

## 3. Frontend (`client/` — `142` Files)

### 3.1 Client Configs, Routes, Constants, Context, Hooks, Services & Utils (`47` Files)
| Path | Bytes | Lines | Status | Exports / Purpose |
|---|---:|---:|---|---|
| `client/.env` | 42 | 2 | `ENV (SECRET)` | Local client env config (**unread** per security policy). |
| `client/.env.example` | 57 | 2 | `CONFIG` | Sets template `EXPO_PUBLIC_API_URL=https://nexusflow-nxeg.onrender.com`. |
| `client/.gitignore` | 151 | 6 | `CONFIG` | Expo/Node/env ignore rules. |
| `client/app.json` | 287 | 13 | `CONFIG` | Expo app metadata (`slug: "nexusflow"`, `scheme: "nexusflow"`, `typedRoutes: true`). |
| `client/babel.config.js` | 191 | 10 | `CONFIG` | `babel-preset-expo` + `@babel/plugin-transform-class-static-block`. |
| `client/expo-env.d.ts` | 110 | 3 | `CONFIG` | Expo TypeScript ambient references. |
| `client/package.json` | 1118 | 42 | `CONFIG` | Expo ~51.0, Expo Router ~3.5, React 18.2, RN 0.74.5, `@xyflow/react`, `three`, `socket.io-client`. **No test script.** |
| `client/package-lock.json` | 607675 | 15474 | `CONFIG` | Client npm dependency lockfile. |
| `client/theme.ts` | 11340 | 230 | `ACTIVE` | Light-only warm editorial tokens (`colors`, `PRIORITY_META`, `greedyBreakdown`, `healthLabel`, `shadow`, `glass`). |
| `client/tsconfig.json` | 343 | 23 | `CONFIG` | Strict TS config (`"strict": true`, `@/*` alias). |
| `client/app/_layout.tsx` | 1088 | 28 | `ACTIVE` | `RootLayout`: `SafeAreaProvider > AuthProvider > FeedbackProvider > AuthGate > Stack`. |
| `client/app/index.tsx` | 1466 | 49 | `ACTIVE` | OAuth query-param interceptor (`?token=` / `?google=1`) & initial auth redirect. |
| `client/app/(auth)/login.tsx` | 10485 | 222 | `ACTIVE` | Email/password sign-in (`POST /api/auth/login`) & Google OAuth launch. |
| `client/app/(auth)/signup.tsx` | 8948 | 194 | `ACTIVE` | User registration screen (`POST /api/auth/signup`). |
| `client/app/(auth)/forgot-password.tsx` | 4635 | 104 | `ACTIVE` | Password reset request screen (`POST /api/auth/forgot-password`; paired `(auth)/reset-password.tsx` **missing**). |
| `client/app/(tabs)/_layout.tsx` | 916 | 27 | `ACTIVE` | Two-tab bottom navigator (`dashboard`, `profile`). |
| `client/app/(tabs)/dashboard.tsx` | 16927 | 322 | `ACTIVE` | Portfolio dashboard, stats, team cards, create/join/discover modals, quick tab jumps. |
| `client/app/(tabs)/profile.tsx` | 19797 | 444 | `ACTIVE` | User profile editor, avatar upload, verified skill badges, nav to skill-verify / global-chat / docs / daa-insights. |
| `client/app/daa-insights.tsx` | 10604 | 227 | `ACTIVE` | Static reference cards for 8 DAA algorithms (reached from `profile.tsx`). |
| `client/app/docs.tsx` | 94969 | 1901 | `PARTIAL` | In-app docs viewer (`v2.0` badge). Declares `12` `SectionKey`s, renders only `5` in nav bar (`7` orphaned), and mixes `7`/`8` Waterfall tab counts. |
| `client/app/global-chat.tsx` | 1531 | 52 | `ACTIVE` | Standalone wrapper rendering `<ChatPanel standalone />` (reached from `profile.tsx`). |
| `client/app/skill-graph.tsx` | 5700 | 135 | `ORPHANED` | Zero routes/links in `client/`; sends broken `Authorization: Bearer ${user}` instead of `token`. |
| `client/app/skill-verification.tsx` | 19469 | 464 | `ACTIVE` | Standalone 5-MCQ skill verification quiz flow (`POST /api/ai/quiz/*`, `POST /api/skills/verify`). |
| `client/app/team/[teamId].tsx` | 26087 | 638 | `ACTIVE` | Methodology workspace router shell (`WATERFALL` 8 tabs, `SCRUM` 8 tabs, `KANBAN` 9 tabs, `CLASSIC/NEXUSFLOW` 6 tabs; `HYBRID` falls through). |
| `client/constants/classicGuideData.ts` | 10488 | 199 | `ACTIVE` | 6-tab Classic walkthrough steps & 9 DAA algorithm cards (`CLASSIC_DAA_ALGORITHMS` export unused). |
| `client/constants/projectTemplates.ts` | 23033 | 285 | `ACTIVE` | Client mirror of 7 domain templates (4 Waterfall, 3 Scrum). |
| `client/constants/waterfallGuideData.ts` | 18748 | 365 | `ACTIVE` | Waterfall 6-phase guide data; `L211` states outdated `0.40/0.35/0.25` priority weights. |
| `client/context/AuthContext.tsx` | 6537 | 204 | `ACTIVE` | Global JWT (`nf_jwt`) & user state (`signOut` fails to disconnect socket; `resetPassword` uncalled). |
| `client/hooks/mergeSort.test.ts` | 5904 | 163 | `TEST` | 10 Jest cases for `useTeamTasks.ts` comparators; unrunnable (no Jest installed). |
| `client/hooks/useChat.ts` | 11320 | 333 | `PARTIAL` | REST+Socket chat hook; listens for `chat:team:new` but never emits `chat:join_team`; `editMessage`/`deleteMessage` unused. |
| `client/hooks/useDependencyGraph.ts` | 3106 | 101 | `ACTIVE` | Fetches `/dependency-graph`, joins `room:join { teamId }` (missing `room:leave`), debounces refetch on task events. |
| `client/hooks/useInvitations.ts` | 5090 | 150 | `ACTIVE` | Polls `/api/invitations` (15s) + accept/reject + listens `invitation:received/updated`. |
| `client/hooks/useRecommendation.ts` | 4487 | 156 | `ORPHANED` | Socket RPC (`recommend:request`, `task:search`); consumed only by unreachable `RecommendationPanel.tsx`. |
| `client/hooks/useReminders.ts` | 4658 | 105 | `ACTIVE` | Memoized deadline & warning bucketing over `useTeamTasks` (`NotificationCenter` & `ClassicOverviewPanel`). |
| `client/hooks/useTaskAnalytics.ts` | 1796 | 66 | `ORPHANED` | Fetches `GET /api/teams/:teamId/tasks/analytics`; consumed only by unreachable `AnalyticsPanel.tsx`. |
| `client/hooks/useTeam.ts` | 13670 | 350 | `ACTIVE` | Core team CRUD, member skills, B&B `/assign`, inline `/sprint-optimize`; listens for non-emitted `team:updated`. |
| `client/hooks/useTeams.ts` | 10471 | 262 | `ACTIVE` | Multi-team list, create/update/delete, `/generate-tasks`; `joinTeam` & `recomputeProgress` exports unused. |
| `client/hooks/useTeamTasks.ts` | 26069 | 589 | `ACTIVE` | Deterministic MergeSort + normalized task store + REST/Socket CRUD (`fetchExecutionOrder`, `removeDependency` unused). |
| `client/hooks/useWaterfallPlanLifecycle.ts` | 4997 | 161 | `ACTIVE` | Waterfall `/plan` lifecycle fetcher & listener (`waterfall:*` events; omits `room:join`). |
| `client/services/kanbanApiService.ts` | 11830 | 287 | `PARTIAL` | 20 Kanban REST wrappers (`13` used in Kanban tabs, `7` unused incl. `health`, `change-impact`, `events`, `copilot-context`). |
| `client/services/scrumApiService.ts` | 26360 | 716 | `ACTIVE` | 42 Scrum REST wrappers + 2 artifact approval helpers powering all Scrum panels. |
| `client/services/socket.ts` | 694 | 28 | `PARTIAL` | Singleton `Socket.IO` client; `disconnectSocket` uncalled & `getSocket(token)` ignores changed tokens when connected. |
| `client/utils/api.ts` | 1303 | 38 | `ACTIVE` | Resolves `API_BASE_URL` (overrides `.env` `onrender.com` URL back to `http://localhost:4000` on localhost web). |
| `client/utils/boyerMoore.ts` | 8767 | 237 | `ACTIVE` | Exact Boyer-Moore bad-character search (`searchTasks` rebuilds table per item despite building once at `L173`). |
| `client/utils/markdownParser.ts` | 10249 | 305 | `ACTIVE` | AST Markdown parser with URL protocol allowlist (`http/https/mailto`) & HTML/script tag stripping. |
| `client/utils/methodologyConfig.ts` | 28830 | 676 | `PARTIAL` | Methodology metadata & `normalizeMethodologyId`; `SCRUM_CONFIG` & `KANBAN_CONFIG` tab lists diverge from `[teamId].tsx`. |
| `client/utils/storage.ts` | 1097 | 43 | `ACTIVE` | Cross-platform JWT persistence (`localStorage` on web, `expo-secure-store` on native). |

### 3.2 Frontend Non-Workspace Components (`client/components/`, `28` Files)
| Path | Bytes | Lines | Status | Primary Role / Mount Site |
|---|---:|---:|---|---|
| `client/components/AiTaskAssistant.tsx` | 20169 | 362 | `ACTIVE` | Inline AI task/subtask/missing-phase assistant inside `TasksPanel.tsx`. |
| `client/components/AlgoExplain.tsx` | 6218 | 115 | `ACTIVE` | `WhyButton` & `AlgoExplainSheet` tooltips across Classic/Waterfall views. |
| `client/components/AuthGate.tsx` | 854 | 27 | `ACTIVE` | Route protection guard redirecting between `(auth)` and `(tabs)` in `_layout.tsx`. |
| `client/components/charts.tsx` | 3986 | 96 | `ACTIVE` | Pure RN/Web `BarChart` (`AnalyticsPanel` unreachable) & `PieChart` (`ClassicOverviewPanel`, `OverviewPanel`). |
| `client/components/chat/SafeMarkdownMessage.tsx` | 12586 | 468 | `ACTIVE` | Safe Markdown + code-block copy renderer used by `ChatPanel` & `ProjectAdvisorPanel`. |
| `client/components/ClassicGuideBanner.tsx` | 4313 | 165 | `ACTIVE` | Dismissible Classic V1 walkthrough banner in `ClassicOverviewPanel`. |
| `client/components/ClassicGuideModal.tsx` | 19204 | 609 | `ACTIVE` | Interactive 6-tab & 9-DAA algorithm modal for Classic workspaces. |
| `client/components/CreateTeamModal.tsx` | 66197 | 1295 | `ACTIVE` | 4-step workspace wizard (`/api/methodologies/availability`, `/api/users/lookup`, 1000-char desc, templates). |
| `client/components/DatePicker.tsx` | 2125 | 63 | `ACTIVE` | Cross-platform HTML5 / validated text date & time picker. |
| `client/components/DependencyGraphPanel.tsx` | 6792 | 131 | `ACTIVE` | Topological Sort (`executionOrder`) wave card viewer in `GraphPanel` & `ScrumInsightsPanel`. |
| `client/components/discovery/ApplyRoleModal.tsx` | 18300 | 540 | `PARTIAL` | Role application modal; **bug:** expects `{ verifications }` instead of array from `/api/skills/verifications`. |
| `client/components/discovery/DiscoverTeamsModal.tsx` | 17740 | 562 | `ACTIVE` | Public team directory modal (`GET /api/discovery/teams`) with filters & search. |
| `client/components/discovery/TeamPublicProfileModal.tsx` | 12806 | 415 | `ACTIVE` | Public team overview & open-roles inspector opened from `DiscoverTeamsModal`. |
| `client/components/feedback.tsx` | 8765 | 142 | `ACTIVE` | `FeedbackProvider`, `useToast`, `useConfirm`, & `ModalSheet` bottom/center dialog primitive. |
| `client/components/FloatingBackground.tsx` | 2450 | 55 | `ACTIVE` | Subtle decorative parallax circle backdrop on auth, dashboard, profile, & docs screens. |
| `client/components/ImageUploader.tsx` | 5199 | 118 | `ACTIVE` | Web canvas base64 data-URL image crop/resizer (no-op note on native). |
| `client/components/JoinTeamModal.tsx` | 6976 | 218 | `ACTIVE` | Pending invitations modal on `dashboard.tsx` with fallback link to team discovery. |
| `client/components/MethodologyWipBanner.tsx` | 7906 | 289 | `PARTIAL` | WIP methodology banner in `[teamId].tsx` (hidden for Kanban due to `!isKanban` check). |
| `client/components/NotificationCenter.tsx` | 10764 | 249 | `ACTIVE` | In-app notifications & deadline alarm drawer (polls `/api/notifications`; never calls `/read`). |
| `client/components/RecommendationPanel.tsx` | 21140 | 413 | `ORPHANED` | Knapsack recommendation & Boyer-Moore search panel; mounted only inside unreachable `SprintPanel.tsx`. |
| `client/components/ScrumGuideBanner.tsx` | 4845 | 180 | `ACTIVE` | Dismissible Scrum guide CTA banner inside `ScrumOverviewPanel.tsx`. |
| `client/components/ScrumGuideModal.tsx` | 15636 | 426 | `ACTIVE` | Interactive Scrum workflow guide modal with deep tab navigation. |
| `client/components/SkillVerificationModal.tsx` | 20169 | 675 | `ACTIVE` | 5-question AI quiz modal; **bugs:** fires `onVerified` on fail/error & overlaps loading spinner/error. |
| `client/components/TaskCard.tsx` | 11901 | 277 | `ACTIVE` | Reusable task row/card with greedy priority breakdown, cycle status, & kebab menu. |
| `client/components/TeamMenu.tsx` | 14162 | 263 | `ACTIVE` | Dashboard workspace ellipsis menu (owner-gates Delete only; leaves settings/members visible to members). |
| `client/components/ui.tsx` | 21295 | 418 | `ACTIVE` | Core design primitives (`Card`, `Button`, `Badge`, `Pill`, `StatCard`, `Avatar`, `FAB`, `ProgressBar`, etc.). |
| `client/components/WaterfallGuideBanner.tsx` | 4572 | 170 | `ACTIVE` | Dismissible Waterfall guide CTA banner in `OverviewPanel.tsx` & `PlanPanel.tsx`. |
| `client/components/WaterfallGuideModal.tsx` | 26102 | 866 | `ACTIVE` | Interactive 3-mode Waterfall guide modal (`tabs`, `phases`, `sequence`) with `/docs` jump. |

### 3.3 Frontend Workspace Panels & 2D/3D Canvases (`client/components/workspace/`, `67` Files)
| Path | Bytes | Lines | Status | Mount / Usage Notes |
|---|---:|---:|---|---|
| `client/components/workspace/AcademicEvaluationPanel.tsx` | 10292 | 229 | `ORPHANED` | **0 imports** across `client/`. Targets `GET /academic-evaluation`. |
| `client/components/workspace/AnalyticsPanel.tsx` | 23231 | 460 | `ORPHANED` | Imported in `[teamId].tsx:522` but unreachable via `normalizeTab("analytics") -> "insights"`. |
| `client/components/workspace/AssignmentBoard.tsx` | 45860 | 1026 | `ACTIVE` | Team & Member Management tab (`Waterfall` `team` tab); **bug L637:** hardcoded `skill="JavaScript"`. |
| `client/components/workspace/CapabilityIntelligencePanel.tsx` | 17901 | 558 | `ACTIVE` | Mounted in `WaterfallInsightsPanel` (`capability` subtab); previews & accepts B&B assignments. |
| `client/components/workspace/ChangeImpactModal.tsx` | 14714 | 480 | `ACTIVE` | Mounted in `OverviewPanel.tsx:937` (`POST /change-impact/simulate`). |
| `client/components/workspace/ChatPanel.tsx` | 23627 | 696 | `ACTIVE` | Global & team Markdown chat (`all` modern methodologies + `global-chat`); **bug L103:** team skill graph array mismatch. |
| `client/components/workspace/ClassicMembersPanel.tsx` | 21984 | 638 | `ACTIVE` | Classic `members` tab; lacks `isLeader`/`isSelf` client guards on member & skill edits. |
| `client/components/workspace/ClassicOverviewPanel.tsx` | 20520 | 516 | `ACTIVE` | Classic `overview` tab with V1 `ClassicGuideBanner`, deadline reminders, & PieChart. |
| `client/components/workspace/ClassicSprintPanel.tsx` | 9907 | 290 | `ACTIVE` | Classic `sprint` tab (`POST /teams/:teamId/sprint-optimize`). |
| `client/components/workspace/ClassicTasksPanel.tsx` | 33439 | 996 | `ACTIVE` | Classic `tasks` 4-view tab (`all/priority/deadline/progress`, Boyer-Moore search, KanbanBoard); `L350` vs `L382` weight conflict. |
| `client/components/workspace/ConformancePanel.tsx` | 8566 | 200 | `ORPHANED` | **0 imports** across `client/`. Targets `GET /workflow-conformance`. |
| `client/components/workspace/CopilotAttachmentBar.tsx` | 8706 | 310 | `ORPHANED` | **0 imports** across `client/`. Targets `/temporary-contexts*` (lacks `/attachments` upload UI). |
| `client/components/workspace/DecisionExplanationDrawer.tsx` | 15628 | 507 | `ORPHANED` | **0 imports** across `client/`. Targets `/decisions/explain*` & `/decisions/:id/ai-summary` (stub-backed!). |
| `client/components/workspace/DecisionPanel.tsx` | 67819 | 1574 | `ACTIVE` | Decision Matrix (`ProjectAdvisorPanel` `decide` subtab); `POST /teams/:id/decide`, `/decision-feedback`. |
| `client/components/workspace/DependencyFlowGraph.tsx` | 4062 | 93 | `ACTIVE` | Native fallback topological wave graph (paired with `.web.tsx`). |
| `client/components/workspace/DependencyFlowGraph.web.tsx` | 6449 | 177 | `ACTIVE` | Web interactive `@xyflow/react` + `@dagrejs/dagre` dependency DAG in `GraphPanel` & `ScrumInsightsPanel`. |
| `client/components/workspace/DigitalTwinCore.tsx` | 23943 | 540 | `ORPHANED` | **0 imports** across `client/`. Unified digital twin viewer targeting `GET /digital-twin`. |
| `client/components/workspace/DomainIntelligencePanel.tsx` | 11388 | 430 | `ORPHANED` | **0 imports** across `client/`. Targets `GET /resolved-environment`. |
| `client/components/workspace/FairContributionPanel.tsx` | 12620 | 289 | `ORPHANED` | **0 imports** across `client/`. Targets `/contribution-analysis*` & `/contribution-disputes`. |
| `client/components/workspace/GitHubPanel.tsx` | 61575 | 1592 | `ACTIVE` | Dedicated `github` tab (6 sub-tabs: connect, commits, PRs/issues, tree, workspace AI query/snapshot). |
| `client/components/workspace/GraphPanel.tsx` | 13617 | 267 | `ACTIVE` | Mounted in Classic `graph` tab and Waterfall `Insights -> dag` subtab (`addDependency` supported). |
| `client/components/workspace/GuidancePanel.tsx` | 41373 | 851 | `ACTIVE` | 14-stage deterministic Project Guidance inside `ProjectAdvisorPanel` (`guidance` subtab). |
| `client/components/workspace/HealthScoreGauge.tsx` | 9744 | 325 | `ACTIVE` | SVG health arc gauge rendered by `ScrumInsightsPanel.tsx:499`. |
| `client/components/workspace/KanbanBacklogPanel.tsx` | 9732 | 308 | `PARTIAL` | Kanban `plan` ("Backlog") tab (`replenish` batch action); `onNavigateBoard` prop unused. |
| `client/components/workspace/KanbanBoard.tsx` | 10738 | 264 | `ACTIVE` | Generic 3-column PanResponder drag board used by Classic & Waterfall (`TasksPanel`), NOT Kanban methodology. |
| `client/components/workspace/KanbanBoardPanel.tsx` | 20035 | 628 | `PARTIAL` | Kanban `tasks` ("Board") tab; forward-only pull, zero sockets, unused `blockerCategory`/`blockerSeverity`. |
| `client/components/workspace/KanbanDigitalTwinCanvas.tsx` | 2589 | 97 | `PARTIAL` | Native 2D column-occupancy fallback for `KanbanOverviewPanel`. |
| `client/components/workspace/KanbanDigitalTwinCanvas.web.tsx` | 10432 | 336 | `PARTIAL` | Web Three.js 3D flow visualization + 2D toggle in `KanbanOverviewPanel`. |
| `client/components/workspace/KanbanFlowPanel.tsx` | 9482 | 290 | `PARTIAL` | Kanban `timeline` ("Flow") tab; metrics/SLE/aging percentiles (no CFD diagram). |
| `client/components/workspace/KanbanInsightsPanel.tsx` | 7878 | 262 | `PARTIAL` | Kanban `insights` tab (`continuous-improvement` & `continuous-delivery`). |
| `client/components/workspace/KanbanOverviewPanel.tsx` | 13472 | 419 | `PARTIAL` | Kanban `overview` tab (`fetchKanbanOverview` + 3D canvas). |
| `client/components/workspace/KanbanPoliciesPanel.tsx` | 13432 | 436 | `PARTIAL` | Kanban `policies` tab (edits WIP mode/SLE; DoR/DoD/Classes read-only; no `isLeader` gate). |
| `client/components/workspace/KanbanTeamPanel.tsx` | 6597 | 224 | `PARTIAL` | Kanban `team` tab displaying personal WIP utilization & verified skills. |
| `client/components/workspace/LeaderApplicationsPanel.tsx` | 17244 | 529 | `ACTIVE` | Leader role-application review modal mounted in `AssignmentBoard` & `ScrumTeamPanel`. |
| `client/components/workspace/MemberProfileModal.tsx` | 14952 | 432 | `ACTIVE` | Member capability/assignment drawer (`AssignmentBoard` & `ScrumTeamPanel`). |
| `client/components/workspace/OpenRolesManagerModal.tsx` | 14387 | 468 | `ACTIVE` | Open-role creator/manager modal for discoverable teams. |
| `client/components/workspace/OverviewPanel.tsx` | 56229 | 1490 | `ACTIVE` | Waterfall `overview` tab (embeds `PlanPanel`, `WaterfallPhaseCanvas`, `PhaseGateModal`, `ChangeImpactModal`). |
| `client/components/workspace/PhaseGateModal.tsx` | 16265 | 531 | `ACTIVE` | Waterfall phase gate inspection, leader advance, & reason-logged override modal. |
| `client/components/workspace/PlanPanel.tsx` | 144929 | 4018 | `ACTIVE` | Waterfall artifact upload, conflict resolution, readiness, requirements CRUD, & finalization panel. |
| `client/components/workspace/ProcessMiningPanel.tsx` | 10117 | 221 | `ORPHANED` | **0 imports** across `client/`. Targets `GET /process-mining`. |
| `client/components/workspace/ProjectAdvisorPanel.tsx` | 88594 | 2318 | `ACTIVE` | Project AI advisor hub (`brief`, `guidance`, `copilot`, `decisions`, `architecture`, `research`, `tools`, `resources`, `decide`). |
| `client/components/workspace/ProjectEventTimeline.tsx` | 8556 | 284 | `ORPHANED` | **0 imports** across `client/`. Targets `GET /events`. |
| `client/components/workspace/ProjectHealth2Panel.tsx` | 13219 | 439 | `ORPHANED` | **0 imports** across `client/` (superseded by `UnifiedProjectHealthPanel`; no `room:join:project`). |
| `client/components/workspace/ProjectLearningPanel.tsx` | 23583 | 703 | `ACTIVE` | Mounted in `WaterfallInsightsPanel` (`learning` subtab); full lesson generate/validate/apply/archive flow. |
| `client/components/workspace/RetroPanel.tsx` | 20900 | 536 | `ORPHANED` | Unreachable in `[teamId].tsx:503` (blocked by `!isScrum` vs `normalizeTab("retro") -> "insights"`). |
| `client/components/workspace/RiskPanel.tsx` | 16931 | 477 | `ACTIVE` | Mounted in `WaterfallInsightsPanel` (`risks` subtab); risk radar + scan + status filter/acknowledge/resolve. |
| `client/components/workspace/ScrumDigitalTwinCanvas.tsx` | 6460 | 225 | `ACTIVE` | Native 2D fallback sprint topology canvas in `ScrumOverviewPanel`. |
| `client/components/workspace/ScrumDigitalTwinCanvas.web.tsx` | 32024 | 903 | `ACTIVE` | Web Three.js 3D sprint topology canvas in `ScrumOverviewPanel`. |
| `client/components/workspace/ScrumInsightsPanel.tsx` | 125939 | 3145 | `ACTIVE` | Scrum `insights` 5-subtab panel; **bug:** `Accept All Eligible Assignments` sets `showBulkModal(true)` with no `<ModalSheet>`. |
| `client/components/workspace/ScrumOverviewPanel.tsx` | 33358 | 1029 | `ACTIVE` | Scrum `overview` tab (`ScrumGuideBanner`, `ScrumSetupPlanPanel`, `ScrumDigitalTwinCanvas`). |
| `client/components/workspace/ScrumPlanPanel.tsx` | 27350 | 862 | `ORPHANED` | Imported in `[teamId].tsx:32` and **never rendered** (replaced by `ScrumSetupPlanPanel`). |
| `client/components/workspace/ScrumRetroPanel.tsx` | 46344 | 1218 | `ACTIVE` | Scrum `retro` tab (Sprint Review + AI/deterministic Retrospective + Action Item CRUD). |
| `client/components/workspace/ScrumSetupPlanPanel.tsx` | 121754 | 2887 | `ACTIVE` | Scrum artifact ingestion, AI story suggestions, bulk approve, conflict resolution, & plan finalize panel. |
| `client/components/workspace/ScrumTasksPanel.tsx` | 89264 | 2403 | `ACTIVE` | Scrum `tasks` board, sprint create/start/complete-safety/delete, daily standup, & subtask decomposition. |
| `client/components/workspace/ScrumTeamPanel.tsx` | 51698 | 1272 | `ACTIVE` | Scrum `team` tab: member capacity, verified skills, B&B assign, open roles, & applications. |
| `client/components/workspace/ScrumTimelinePanel.tsx` | 15644 | 521 | `ORPHANED` | Rendered conditionally at `[teamId].tsx:459` (`timeline` + `isScrum`) but unreachable via `normalizeTab`. |
| `client/components/workspace/SimulationModal.tsx` | 15793 | 323 | `ORPHANED` | **0 imports** across `client/`. Targets `POST /simulation/run`. |
| `client/components/workspace/SkillMatrix.tsx` | 5613 | 135 | `ACTIVE` | 6-axis member skill heatmap table (`AssignmentBoard` & `ClassicMembersPanel`). |
| `client/components/workspace/SprintPanel.tsx` | 10217 | 236 | `ORPHANED` | Unreachable in `[teamId].tsx:518` via `normalizeTab`; sole host of `RecommendationPanel`. |
| `client/components/workspace/TasksPanel.tsx` | 45333 | 886 | `ACTIVE` | Waterfall `tasks` 4-view tab (`all/priority/deadline/progress`, Phase Lock banners, `KanbanBoard`, `AiTaskAssistant`). |
| `client/components/workspace/TeacherReviewPortal.tsx` | 11810 | 294 | `ORPHANED` | **0 imports** across `client/`. Targets `GET/POST /teacher-reviews` & comments. |
| `client/components/workspace/TeamHealthPanel.tsx` | 13010 | 379 | `ORPHANED` | Unreachable in `[teamId].tsx:523` (superseded by `UnifiedProjectHealthPanel`). |
| `client/components/workspace/UnifiedProjectHealthPanel.tsx` | 33712 | 914 | `PARTIAL` | Mounted in `WaterfallInsightsPanel` (`health`); lacks `room:join:project` & `handleAcknowledge` is local-only! |
| `client/components/workspace/WaterfallInsightsPanel.tsx` | 12595 | 388 | `ACTIVE` | Waterfall `insights` 5-subtab shell (`health`, `learning`, `capability`, `risks`, `dag`). |
| `client/components/workspace/WaterfallPhaseCanvas.tsx` | 7399 | 261 | `ACTIVE` | Native 2D Waterfall 6-phase pipeline visualization in `OverviewPanel`. |
| `client/components/workspace/WaterfallPhaseCanvas.web.tsx` | 16015 | 495 | `ACTIVE` | Web Three.js 3D interactive 6-phase pipeline canvas in `OverviewPanel`. |
| `client/components/workspace/WaterfallTimelinePanel.tsx` | 34347 | 964 | `ACTIVE` | Waterfall `timeline` phase roadmap & lock-state progression view. |


---

## 4. Backend (`server/` — `251` Files)

### 4.1 Server Root, Entrypoint, Configs, Constants, Data & Broken Test Dir (`20` Files)
| Path | Bytes | Lines | Status | Primary Role / Exports / Notes |
|---|---:|---:|---|---|
| `server/.env` | 1549 | 30 | `ENV (SECRET)` | Environment secrets (not read per security rules: `ENV_OR_SECRET_SKIPPED`). |
| `server/.env.example` | 794 | 24 | `CONFIG` | Env template (`PORT`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`; **omits `GROQ_API_KEY`**). |
| `server/auth.js` | 1371 | 49 | `ACTIVE` | Exports `sign`, `verify`, `formatUser`, `requireAuth`; **critical risk:** hardcoded fallback JWT secret `"nexusflow-production-jwt-secret-key-2026"`. |
| `server/index.js` | 11903 | 284 | `ACTIVE` | Express + Socket.IO entrypoint (`4000`), CORS allowlist, Mongo connect, 13 routers, 9 inline auth/health/legacy routes, `getFrontendUrl`. |
| `server/package.json` | 1266 | 23 | `CONFIG` | ESM package manifest (`seed:demo`, `test`, `test:scrum`, `test:all`); no Jest/Vitest/Supertest installed. |
| `server/package-lock.json` | 54487 | 1465 | `CONFIG` | npm dependency lockfile for Express, Mongoose, Socket.IO, Google/GitHub SDKs, bcryptjs, jsonwebtoken. |
| `server/__tests__/manualQaFixes.test.js` | 18986 | 475 | `ORPHANED` | Unrunnable Jest-style file with inline TS syntax in `.js`; duplicated by runnable `server/scripts/testManualQaFixes.js`. |
| `server/algorithms/branchAndBound.js` | 12155 | 325 | `ACTIVE` | Exports `buildCostMatrix`, `assignTasksToMembers`; min-cost member-task assignment + greedy overflow pass. |
| `server/algorithms/decisionEngine.js` | 43364 | 910 | `ACTIVE` | Exports `DECISION_TYPES`, `FACTOR_DEFINITIONS`, `evaluateDecision`, `listDecisionTypes`; **bug:** `L398` ignores mode weights. |
| `server/algorithms/graphTraversal.js` | 3850 | 146 | `ACTIVE` | Exports `buildGraph`, `dfs`, `bfs`, `topologicalSort` (Kahn's sorted queue; actual `O(V^2 log V + E)`). |
| `server/algorithms/greedyScheduler.js` | 14434 | 306 | `ACTIVE` | Exports `computePriorityScore`, `greedySortTasks`; canonical `0.50*u + 0.35*i + 0.15*d` scorer used in `Task.js` hooks. |
| `server/algorithms/projectDecomposer.js` | 10325 | 270 | `ACTIVE` | Exports `extractFeatures`, `mapCategoryOrTitleToWaterfallPhase`, `decomposeProject`; keyword-driven Waterfall seed generator. |
| `server/algorithms/projectGuidanceEngine.js` | 40865 | 795 | `ACTIVE` | Exports `generateProjectGuidance` + 13 helpers (domain, hardware, AI need, roadmap, 0/1 Knapsack sprint slice, readiness). |
| `server/algorithms/taskOptimiser.js` | 18801 | 357 | `ACTIVE` | Exports `greedySprintRanking`, `knapsackSprint`, `topologicalSort`, `bfsDependencyLevels`, `mergeSort`, `boyerMooreSearch`, `computeRecommendation`. |
| `server/algorithms/taskPriorityEngine.js` | 12725 | 317 | `ACTIVE` | Exports `computeTaskPriority`, `rankTasks`, `WEIGHTS`, tiers; **bug `L95`:** caps `greedyFactor` at `75/100`. |
| `server/config/githubOAuthConfig.js` | 8498 | 260 | `ACTIVE` | Exports `MOUNTED_CALLBACK_PATH`, `MIN_ENCRYPTION_KEY_LEN`, `isProductionEnvironment`, `validateGitHubOAuthConfig`, `getGitHubOAuthConfig`. |
| `server/config/methodologyAvailability.js` | 11266 | 287 | `ACTIVE` | Exports `METHODOLOGY_IDS`, `isScrumEnabled`, `areExperimentalMethodologiesEnabled`, `getMethodologyRegistry`, `normalizeMethodologyId`. |
| `server/constants/quizQuestionBanks.js` | 46138 | 611 | `ACTIVE` | Exports `CANONICAL_SKILL_MAP`, `resolveCanonicalSkillId`, `SKILL_QUESTION_POOLS`; offline 15+ skill verification quiz bank. |
| `server/constants/skills.js` | 7715 | 139 | `ACTIVE` | Exports `SKILL_CATEGORIES`, `CANONICAL_SKILLS`, `findCanonicalSkill`, `getRecommendedSkillsForRole`, `getSkillsByCategory`. |
| `server/data/projectTemplates.js` | 22597 | 268 | `ACTIVE` | Exports `PROJECT_TEMPLATES`: `7` seeded templates (`4` Waterfall, `3` Scrum; `0` Kanban, `0` Hybrid). |

### 4.2 Mongoose Database Models (`server/models/`, `42` Files)
*(All `42/42` schemas use `timestamps: true`, `0` custom collection names, `0` overridden `strict` modes; all export default Mongoose model unless noted.)*

| Path | Bytes | Lines | Status | Primary Domain / Key Fields & Behavior Notes |
|---|---:|---:|---|---|
| `server/models/AcademicRubric.js` | 2759 | 108 | `PARTIAL` | Academic rubric criteria & faculty submission (`projectId` ref; backend+orphaned UI). |
| `server/models/AIConversation.js` | 6266 | 129 | `ACTIVE` | Copilot thread container scoped by `(projectId, teamId, scope, memberId)`. |
| `server/models/AIMessage.js` | 6850 | 134 | `ACTIVE` | Individual AI/user message; `provider` enum updated to include `"groq"` alongside gemini/openrouter/deterministic/openai. |
| `server/models/ArchitectureComponent.js` | 6754 | 125 | `ACTIVE` | Project architecture nodes, layers, tech stack & AI metadata (`projectId`). |
| `server/models/CapabilityProfile.js` | 3337 | 122 | `ACTIVE` | Per-member `(projectId, userId)` capability & skill readiness snapshot. |
| `server/models/ChatMessage.js` | 1244 | 58 | `ACTIVE` | Team & global channel chat records (`channel: "global" \| <teamId>`). |
| `server/models/ContributionDispute.js` | 1840 | 73 | `PARTIAL` | Student contribution dispute filings & resolution state (`FairContributionPanel` orphaned). |
| `server/models/Decision.js` | 6745 | 138 | `ACTIVE` | V3/V4 persisted decision options, DAA matrix output, weights & winner (`teamId`, `projectId`). |
| `server/models/DecisionFeedback.js` | 3362 | 85 | `ACTIVE` | User feedback & outcome rating on recorded decisions (`DecisionPanel`). |
| `server/models/DecisionRecord.js` | 4534 | 157 | `PARTIAL` | WS 23 explainable factor breakdown, counterfactual metadata & optional `aiSummary`. |
| `server/models/EarlyWarning.js` | 3548 | 138 | `ACTIVE` | Fingerprinted WS 24 early warnings (`status`: active/acknowledged/resolved/dismissed). |
| `server/models/GitHubCredential.js` | 1369 | 54 | `ACTIVE` | AES-256-CBC encrypted per-user GitHub OAuth access token (one per user). |
| `server/models/GitHubIntegration.js` | 3701 | 82 | `ACTIVE` | Connected GitHub repo binding, branch, & encrypted token/commit cache (`teamId` / `projectId`). |
| `server/models/Invitation.js` | 1241 | 49 | `ACTIVE` | Team email invitations with token, role & TTL expiry. |
| `server/models/LearningInsight.js` | 1161 | 32 | `PARTIAL` | Legacy team learning insights persisted by `learningService.js` (`0` UI callers). |
| `server/models/Notification.js` | 1435 | 50 | `ACTIVE` | User notification inbox (`userId`, `type`, `read`, team/task refs). |
| `server/models/OAuthState.js` | 2424 | 96 | `ACTIVE` | One-time CSRF OAuth state store with TTL + static `consumeState()`. |
| `server/models/Opinion.js` | 2013 | 60 | `ACTIVE` | Team member structured pros/cons/suggestions on project decisions. |
| `server/models/PasswordReset.js` | 781 | 39 | `PARTIAL` | Email reset token & expiry (`auth.js:188` self-invalidation bug). |
| `server/models/Project.js` | 40548 | 785 | `ACTIVE` | Core V2–V4 entity: methodology, waterfall artifacts/requirements/conflicts/phase-gates, scrum/kanban/hybrid configs, `derivedVersion`, `pre` hook. |
| `server/models/ProjectEvent.js` | 4228 | 160 | `ACTIVE` | Immutable project execution event stream (`eventType`, `actorId`, metadata; drives Process Mining/Conformance). |
| `server/models/ProjectLesson.js` | 4285 | 159 | `ACTIVE` | WS 21 learning-loop lesson candidate & validation/application lifecycle. |
| `server/models/ProjectMemory.js` | 5807 | 148 | `PARTIAL` | 19-category memory entries + virtual `workspaceId`; exports `MEMORY_CATEGORIES`, `MEMORY_SCOPE`, `MEMORY_STATUS`. |
| `server/models/Recommendation.js` | 6964 | 140 | `ACTIVE` | Persisted structured recommendations from AI/DAA pipelines (`projectId`). |
| `server/models/RepositoryIndex.js` | 4433 | 113 | `ACTIVE` | Indexed GitHub file tree, key files & architecture signals per project. |
| `server/models/ResearchItem.js` | 7443 | 157 | `ACTIVE` | Project literature/paper/benchmark discovery items (`projectId`). |
| `server/models/Resource.js` | 7648 | 149 | `ACTIVE` | Curated project tools/guides/API resources (`projectId`). |
| `server/models/Retrospective.js` | 4112 | 94 | `ACTIVE` | Sprint/project retrospectives & action items (`projectId`, `sprintId`). |
| `server/models/Risk.js` | 2990 | 90 | `ACTIVE` | Fingerprinted deterministic Waterfall/Scrum risk findings (`methodology`, `fingerprint`, `reopenCount`). |
| `server/models/ScrumHealthSnapshot.js` | 5688 | 144 | `ACTIVE` | Persisted Scrum mode-aware health score & dimension snapshots. |
| `server/models/ScrumSprintSnapshot.js` | 3574 | 98 | `ACTIVE` | Immutable snapshot captured at Scrum sprint completion (burndown/velocity history). |
| `server/models/SkillVerification.js` | 1329 | 67 | `ACTIVE` | Per-user verified skill quiz score, level & verified badge state. |
| `server/models/Sprint.js` | 9909 | 174 | `ACTIVE` | Scrum sprint lifecycle (`PLANNING`, `ACTIVE`, `REVIEW`, `COMPLETED`, `CANCELLED`), capacity, daily check-ins & committed tasks. |
| `server/models/Task.js` | 16548 | 325 | `ACTIVE` | Unified Classic/Waterfall/Scrum/Kanban work item (`priorityScore` `pre` hook, deps, subtasks, `kanbanColumn`, `scrumStatus`, `waterfallPhase`). |
| `server/models/TeacherReview.js` | 2994 | 128 | `PARTIAL` | Faculty review comments & approval status (`TeacherReviewPortal` orphaned). |
| `server/models/Team.js` | 6518 | 140 | `ACTIVE` | Workspace team (`members`, embedded `skills`, `activeProjectId`, `methodology`, `openRoles`, `github` ref). |
| `server/models/TeamApplication.js` | 3120 | 138 | `ACTIVE` | Candidate applications to discoverable team open roles (`skillMatchScore`). |
| `server/models/TeamApplicationAudit.js` | 1255 | 62 | `ACTIVE` | Append-only audit log for application submit/accept/reject/withdraw transitions. |
| `server/models/TeamDeparture.js` | 704 | 36 | `ACTIVE` | Tracks member departures/removals from teams for capacity/audit reconciliation. |
| `server/models/TeamHealth.js` | 1729 | 47 | `PARTIAL` | Legacy 6-dimension team health snapshot (`TeamHealthPanel` unreachable in UI). |
| `server/models/TemporaryContext.js` | 2725 | 112 | `PARTIAL` | Ephemeral 24h TTL attachment context for Copilot (`CopilotAttachmentBar` orphaned). |
| `server/models/User.js` | 1981 | 85 | `ACTIVE` | Auth account schema (bcrypt `pre('save')` hash, `comparePassword`, global `skills`, `lastSeenGlobal`). |

### 4.3 Express Route Modules (`server/routes/`, `13` Files — `419` Declarations + `9` in `index.js` = `428`)
| Path | Bytes | Lines | Handlers | Status | Mount Prefix & Primary Coverage Notes |
|---|---:|---:|---:|---|---|
| `server/routes/ai.js` | 51865 | 953 | 2 | `ACTIVE` | `/api/ai` (`index.js:233`); **note:** comment/naming overlap w/ AI Hub & 5-question quiz generator + fallback bank. |
| `server/routes/auth.js` | 10540 | 296 | 5 | `ACTIVE` | `/api/auth` (`index.js:228`); Google OAuth (`/google`, `/google/callback`), forgot/reset password, token verify. |
| `server/routes/chat.js` | 11534 | 295 | 8 | `ACTIVE` | `/api/chat` (`index.js:231`); global & team channels, Markdown sanitize, unread counts & last-seen. |
| `server/routes/discovery.js` | 19726 | 515 | 12 | `ACTIVE` | `/api/discovery` (`index.js:230`); team discovery, open roles, skill match, apply/accept/reject (**`req.user._id` mismatch bug**). |
| `server/routes/github.js` | 25106 | 663 | 12 | `ACTIVE` | `/api/github` (`index.js:232`); exports `verifyProjectAccess`; encrypted OAuth callback, repos, commits, PRs, repo index, context query. |
| `server/routes/hybrid.js` | 7938 | 221 | 6 | `PARTIAL` | `/api/hybrid` (`index.js:241`, router `requireAuth`); templates, config, overview, validate, apply (**0 client callers**). |
| `server/routes/kanban.js` | 31489 | 840 | 44 | `PARTIAL` | `/api/kanban` (`index.js:240`, router `requireAuth`); board, pull/move, WIP, flow, blockers; **bug:** `$or` duplicate key overwrite + pre-auth GET mutation. |
| `server/routes/projects.js` | 186624 | 4614 | 140 | `ACTIVE` | **Dual-mounted** `/api` (`L235`) AND `/` (`L236`); covers plans, artifacts, Waterfall, AI Copilot, WS 11–20, Health, Risk; mis-prefixed memory routes & shadowed method-select. |
| `server/routes/scrum.js` | 135885 | 3483 | 121 | `ACTIVE` | `/api/scrum` (`index.js:239`, router `requireAuth`); exports `SCRUM_TASK_STATUSES`, `getScrumTaskQuery`; full Scrum + Retro + Analytics + Bulk-Assign. |
| `server/routes/skills.js` | 11454 | 291 | 6 | `ACTIVE` | `/api/skills` (`index.js:229`); canonical catalog, user/member skill verification & graph retrieval. |
| `server/routes/teams.js` | 137851 | 3272 | 41 | `ACTIVE` | `/api/teams` (`index.js:234`); exports `resolveAuthUser`, `verifyTeamAccess`, `computeHealthScore`; teams, tasks, DAA endpoints, invitations, `/recalculate` stub. |
| `server/routes/userLookup.js` | 2022 | 61 | 1 | `ACTIVE` | `/api/users` (`index.js:237`); authenticated user lookup by email/name for invitations & member resolution. |
| `server/routes/workstreams21to25.js` | 17242 | 470 | 21 | `PARTIAL` | `/api` (`index.js:238`); Learning Loop, Capability/Assignment, Decision Explainability, Health v2, Early Warnings. |

### 4.4 Backend Domain, Methodology, AI & Deterministic Services (`server/services/`, `65` Files)
| Path | Bytes | Lines | Status | Primary Role / Key Exports / Caveats |
|---|---:|---:|---|---|
| `server/services/academicEvaluationService.js` | 9945 | 298 | `PARTIAL` | `upsertAcademicRubric`, `getAcademicEvaluation`, `evaluateRubricCriterion`, `submitAcademicEvaluation` (WS 14; UI orphaned). |
| `server/services/academicResearchService.js` | 11403 | 272 | `ACTIVE` | `deriveSearchQueries`, `discoverAcademicPapers`; live paper lookup (`Semantic Scholar`/`arXiv`/fallback guidance). |
| `server/services/aiOrchestrator.js` | 7763 | 204 | `ACTIVE` | Copilot chat, analysis & memory extraction orchestrator wrapping `omniRoute.js` zero-cost tier cascade. |
| `server/services/aiProviderAbstraction.js` | 11518 | 372 | `PARTIAL` | Abstract `AIProvider` + `Gemini`/`Groq`/`OpenRouter`/`LocalModelProvider`; **stub in prod** wired only into `summarizeDecisionWithAI` (`L290`). |
| `server/services/applicationService.js` | 16616 | 509 | `ACTIVE` | `calculateSkillMatch`, `submitApplication`, `acceptApplication`, `rejectApplication`, `withdrawApplication`. |
| `server/services/capabilityIntelligenceService.js` | 21818 | 573 | `ACTIVE` | `buildCapabilityProfile`, `analyzeCapabilityGaps`, `previewDynamicAssignment`, `acceptAssignment` (WS 22; uses B&B). |
| `server/services/changeImpactService.js` | 10587 | 295 | `ACTIVE` | `simulateChangeImpact`: Waterfall downstream dependency, schedule & cost simulation (`ChangeImpactModal`). |
| `server/services/copilotAttachmentService.js` | 8758 | 281 | `PARTIAL` | `ingestAttachment`, `promoteAttachmentToMemory`, `buildAugmentedCopilotContext` (`CopilotAttachmentBar` orphaned). |
| `server/services/decisionIntelligenceService.js` | 11570 | 307 | `PARTIAL` | `recordDecision`, `explainTaskPriority`, `recomputeCounterfactual`, `summarizeDecisionWithAI` (`DecisionExplanationDrawer` orphaned). |
| `server/services/digitalTwinService.js` | 15205 | 450 | `PARTIAL` | `getDigitalTwinState`, `getDigitalTwinDelta`: methodology-aware topology builder (`DigitalTwinCore` orphaned). |
| `server/services/domainIntelligenceService.js` | 11056 | 230 | `PARTIAL` | `CANONICAL_DOMAINS`, `DOMAIN_PROFILES`, `evaluateDomainIntelligence`, `setProjectDomain` (`DomainIntelligencePanel` orphaned). |
| `server/services/domainMethodologyResolver.js` | 5810 | 137 | `PARTIAL` | `resolveEnvironment`: Domain × Methodology conflict & adaptation resolver (`DomainIntelligencePanel` orphaned). |
| `server/services/eventService.js` | 2362 | 98 | `ACTIVE` | `recordProjectEvent`, `getProjectEvents`: append-only `ProjectEvent` writer & query helper. |
| `server/services/fairContributionService.js` | 10624 | 294 | `PARTIAL` | `CONTRIBUTION_WEIGHTS`, `calculateProjectContribution`, `createContributionDispute`, `resolveContributionDispute` (WS 15). |
| `server/services/githubService.js` | 14738 | 408 | `ACTIVE` | AES-256-CBC crypto (`encryptToken`, `decryptToken`), OAuth exchange, Octokit repo/commit/tree/file/compare helpers. |
| `server/services/hybridEngine.js` | 16831 | 390 | `PARTIAL` | `HYBRID_TEMPLATES` (5), `validateHybridConfig`, `configureHybrid`, `getHybridState`, `getHybridTaskRules` (config-only stub). |
| `server/services/invitationService.js` | 7937 | 230 | `ACTIVE` | `checkInvitationExpiry`, `isAuthorizedToInvite`, `sendTeamInvitation`: expiry validation & invite workflows. |
| `server/services/kanbanBlockerService.js` | 4182 | 129 | `PARTIAL` | `addBlockerToTask`, `updateTaskBlocker`, `aggregateProjectBlockers` (`OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED`). |
| `server/services/kanbanBottleneckService.js` | 5022 | 133 | `PARTIAL` | `detectBottlenecks`: WIP saturation, aging, blocker density & downstream starvation detector. |
| `server/services/kanbanChangeImpactService.js` | 4281 | 112 | `PARTIAL` | `assessKanbanChangeImpact`: multi-hop Kanban dependency + WIP impact simulator. |
| `server/services/kanbanDependencyEngine.js` | 4221 | 129 | `PARTIAL` | `wouldCreateCycle`, `analyzeKanbanDependencies`: standalone 2-set DFS cycle detector for Kanban items. |
| `server/services/kanbanEngine.js` | 11841 | 326 | `PARTIAL` | `ensureKanbanConfig`, `getKanbanBoard`, `pullWorkItem`, `moveWorkItem`, `getKanbanOverview`; **bug:** `checkDefinitionOfDone` unused. |
| `server/services/kanbanFlowMetricsService.js` | 6589 | 173 | `PARTIAL` | `calculateFlowMetrics`: cycle/lead time, throughput, flow efficiency, SLE, active aging (**no CFD series**). |
| `server/services/kanbanForecastService.js` | 4704 | 117 | `PARTIAL` | `calculateFlowForecast`: empirical P50/P85/P95 percentiles & aging outlier forecast. |
| `server/services/kanbanHealthService.js` | 3904 | 122 | `PARTIAL` | `calculateKanbanHealth`: **critical bug** iterates mixed index+string-keyed `columnWip` counting WIP violations 2x. |
| `server/services/kanbanMethodologyService.js` | 8239 | 238 | `PARTIAL` | Default Kanban columns, Classes of Service, DoR/DoD validators (`checkDefinitionOfDone` dead in engine). |
| `server/services/kanbanPriorityEngine.js` | 6111 | 148 | `PARTIAL` | `calculateKanbanPriority`, `rankBacklogCandidates`: Class-of-Service weighted backlog ranker. |
| `server/services/kanbanReactiveEngine.js` | 4341 | 134 | `PARTIAL` | `handleKanbanMutation`: **bug `L84-98`** calls `ProjectMemory.create` without `category`, failing validation silently. |
| `server/services/kanbanReplenishmentService.js` | 4444 | 130 | `PARTIAL` | `analyzeBacklogQuality`, `evaluateReplenishmentCandidates`: Kanban pull readiness scoring. |
| `server/services/kanbanWipService.js` | 6992 | 199 | `PARTIAL` | `calculateColumnWip`, `calculatePersonalWip`, `validatePullWip`; **bugs:** `count >= limit` & Array string keys. |
| `server/services/learningService.js` | 5687 | 118 | `PARTIAL` | `generateInsights`: legacy V2/V3 `LearningInsight` generator (`0` UI callers). |
| `server/services/methodologyAdvisor.js` | 16906 | 383 | `PARTIAL` | `extractSignals`, `scoreMethodologies`, `generateRecommendation`, `selectMethodology` (`0` frontend callers). |
| `server/services/methodologyDriftService.js` | 15761 | 341 | `PARTIAL` | `analyzeMethodologyDrift`: computes drift severity across methodologies (`0` frontend callers). |
| `server/services/multimodalCopilotService.js` | 9361 | 273 | `ORPHANED` | Experimental multimodal queries & mocked vision stub (`mockVisionResult`; `0` frontend callers). |
| `server/services/omniRoute.js` | 19266 | 580 | `ACTIVE` | `$0`-only 3-tier LLM router (`FREE_GEMINI_MODELS` -> `FREE_GROQ_MODELS` -> `FREE_OPENROUTER_FALLBACK_MODELS`), `ZeroCostViolationError`. |
| `server/services/phaseGateService.js` | 26688 | 724 | `ACTIVE` | Waterfall 6-phase FSM gate evaluator, `assertWaterfallTaskExecutable`, `advanceProjectPhase`, `overrideProjectPhaseGate`. |
| `server/services/processMiningEngine.js` | 14374 | 342 | `PARTIAL` | `normalizeProcessEvent`, `analyzeProjectProcess`: DFG directly-follows graph & dwell-time miner (`ProcessMiningPanel` orphaned). |
| `server/services/projectBrain.js` | 4829 | 160 | `PARTIAL` | `buildProjectBrainContext`, `serializeBrainForPrompt` (`/brain` route unused in UI; used inside chat helpers). |
| `server/services/projectHealth2Service.js` | 20336 | 579 | `PARTIAL` | `evaluateProjectHealth2`, warning lifecycle (`EarlyWarning` CRUD; WS 24 panel orphaned; UI fallback only). |
| `server/services/projectIntelligence.js` | 66773 | 1379 | `ACTIVE` | V2/V3/V4 Copilot chat, structured project analyzer, decomposition bridge & deterministic advisor answers. |
| `server/services/projectLearningService.js` | 28343 | 704 | `ACTIVE` | `collectLearningEvidence`, `generateLessonCandidates`, validate/apply/archive lifecycle (`ProjectLearningPanel`). |
| `server/services/projectMemoryContext.js` | 9835 | 291 | `PARTIAL` | `getProjectContext*`, `buildMemoryContextForPrompt`: prompt context hydration from `ProjectMemory`. |
| `server/services/projectToolsService.js` | 16352 | 299 | `ACTIVE` | `getProjectToolRecommendations`: curated tool recommendations per project domain/stack (`ProjectAdvisorPanel`). |
| `server/services/reactiveEngine.js` | 6125 | 184 | `ACTIVE` | `handleProjectMutation`: Waterfall `derivedVersion` bump, gate re-eval, `ProjectEvent` & `project:state_recalculated`. |
| `server/services/repositoryIndexingService.js` | 14527 | 415 | `ACTIVE` | `indexRepositoryForProject`, `getRepositoryIntelligence`: indexes connected GitHub tree/files into `RepositoryIndex` & memory. |
| `server/services/requirementService.js` | 66399 | 1659 | `ACTIVE` | Markdown artifact parser, MergeSort prioritization, cycle removal, readiness, & Waterfall task conversion; `detectScopeConflicts` hardcoded. |
| `server/services/resourceDiscoveryService.js` | 17292 | 428 | `ACTIVE` | `discoverProjectResources`: docs/libraries/datasets/videos discovery (`ProjectAdvisorPanel`). |
| `server/services/retrospectiveService.js` | 21466 | 449 | `ACTIVE` | `buildDeterministicAnalysis`, `generateRetrospective`: sprint retrospective generation with deterministic fallback. |
| `server/services/riskEngine.js` | 25640 | 588 | `ACTIVE` | `isTaskDone`, `isTaskCancelled`, `scanProjectRisks`: 12-trigger FNV-1a risk scanner; **bug:** double-emits deadline & overload risks. |
| `server/services/scrumAnalyticsService.js` | 17478 | 433 | `ACTIVE` | `getTaskScrumCategory`, `getScrumSprintAnalytics`; **caveat:** linear interpolated burndown (`L211, 225`) vs real daily snapshots. |
| `server/services/scrumCapacityEngine.js` | 13582 | 343 | `ACTIVE` | `calculateSprintCapacity`, `suggestAllocation` (`0.45*skill + 0.35*cap + 0.20*balance`, default 30h vs 40h inconsistency). |
| `server/services/scrumDependencyEngine.js` | 11023 | 356 | `ACTIVE` | `analyzeScrumDependencies` (longest-path DP), `wouldCreateCycle`, `assessDependencyImpact`. |
| `server/services/scrumEngine.js` | 29853 | 820 | `ACTIVE` | Core Scrum FSM (`create/start/complete/cancelSprint`, completion safety 409, status transitions); unweighted `calculateScrumHealth` conflicts w/ `scrumHealthService`. |
| `server/services/scrumHealthService.js` | 23760 | 555 | `ACTIVE` | `computeScrumHealth`, `getLatestScrumHealth`: mode-weighted Scrum snapshot health persisted to `ScrumHealthSnapshot`. |
| `server/services/scrumPlanningService.js` | 53611 | 1263 | `ACTIVE` | Scrum artifact parse, AI story suggestions, bulk approve, conflict resolve, readiness & backlog finalization (`ScrumSetupPlanPanel`). |
| `server/services/scrumPriorityEngine.js` | 11778 | 263 | `ACTIVE` | `calculateScrumPriority`, `rankBacklog`, `scorePlanningCandidates`: **bug:** 13 vs 15 weights & double-counts `technicalUncertainty`. |
| `server/services/scrumReactiveEngine.js` | 12691 | 364 | `ACTIVE` | `handleScrumMutation`: sprint metric recalculation, `ProjectEvent`, `"sprint:impact"` Socket broadcast. |
| `server/services/scrumRiskEngine.js` | 26667 | 584 | `ACTIVE` | `scanScrumRisks`, `getScrumRisks`, `updateScrumRiskStatus`: 12 Scrum risk triggers (`scrum_` FNV-1a fingerprint, `reopenCount`). |
| `server/services/simulationEngine.js` | 18751 | 495 | `PARTIAL` | `getSimulationBaseline`, `runSimulation`: triangular Monte Carlo What-If simulator (`SimulationModal` orphaned). |
| `server/services/taskDecomposer.js` | 33082 | 827 | `ACTIVE` | AI backlog decomposition -> validation -> Boyer-Moore dedup -> greedy priority & task persistence (`AiTaskAssistant` / Copilot). |
| `server/services/teacherReviewService.js` | 7787 | 286 | `PARTIAL` | `assignFacultyToProject`, `createTeacherReview`, `addReviewComment`, `updateReviewStatus` (`TeacherReviewPortal` orphaned). |
| `server/services/teamHealth.js` | 13852 | 303 | `PARTIAL` | `resolveProjectAndTeam` (auto-creates missing `Project`), `computeTeamHealth` (`TeamHealthPanel` unreachable in UI). |
| `server/services/unifiedProjectHealthService.js` | 26838 | 712 | `ACTIVE` | `computeUnifiedProjectHealth`: 9-dim methodology-aware scorer (**`requirementsDim` weight `0.00`** at `L491-500`) + severity caps. |
| `server/services/workflowConformanceEngine.js` | 11972 | 283 | `PARTIAL` | `analyzeWorkflowConformance`: checks `ProjectEvent` sequence conformance per methodology (`ConformancePanel` orphaned). |
| `server/services/workspaceContextService.js` | 15324 | 371 | `ACTIVE` | `assembleWorkspaceContext`, `answerWorkspaceQuery`; **flaws:** unreachable `temporaryDocs` fallback + leaks private `TemporaryContext`. |

### 4.5 Socket.IO Real-Time Handlers & Server Utilities (`8` Files)
| Path | Bytes | Lines | Status | Primary Role / Exports / Notes |
|---|---:|---:|---|---|
| `server/socket/aiOrchestrator.js` | 23557 | 505 | `ACTIVE` | `registerAiOrchestrator`: `@ai` streaming, `recommend:request`, `task:search` (IDOR gap), `assign:request`; still falls back to `streamMock()`. |
| `server/socket/chatHandlers.js` | 3652 | 109 | `ACTIVE` | `registerChatHandlers`: `chat:send` (no membership check on `teamId`!), `chat:typing` (XSS Markdown sanitize). |
| `server/socket/projectSyncHandlers.js` | 4727 | 96 | `ACTIVE` | `room:join:project`, `room:leave:project` + 13 `broadcast*` helpers; emits to `project:${projectId}`. |
| `server/socket/taskHandlers.js` | 13032 | 279 | `ACTIVE` | `task:create|update|delete|recompute`; missing room auth on `update/delete` (IDOR risk), calls Waterfall gate & `recomputeAndBroadcast`. |
| `server/utils/logger.js` | 1447 | 38 | `ACTIVE` | `logger`: structured JSON stdout/stderr logger with automatic token/API-key/password redaction. |
| `server/utils/projectContextBuilder.js` | 5732 | 131 | `ACTIVE` | `buildCompactProjectContext`, `buildProjectMemoryContext`: shared bounded context serializers for AI prompts. |
| `server/utils/rateLimiter.js` | 1361 | 41 | `ORPHANED` | `createRateLimiter`, `aiRateLimiter`, `githubRateLimiter`: **imported unused** in `server/index.js:30`; zero routes protected. |
| `server/utils/sortAlgorithms.js` | 6171 | 176 | `ACTIVE` | `bubble/merge/selection/insertion/quickSortTasks` + `compareSortAlgorithms` (micro-benchmark; `AnalyticsPanel` UI unreachable). |

### 4.6 Server Scripts, Inspection Tools, Migrations & Test Suites (`server/scripts/`, `103` Files)

#### A. Non-Test Utility, Inspection, Repair & Migration Scripts (`9` Files)
| Path | Bytes | Lines | Status | Safety / Execution Notes |
|---|---:|---:|---|---|
| `server/scripts/findKeys.js` | 617 | 21 | `UTILITY` | Static React `key=` grepper across `client/` (`FS` read-only). |
| `server/scripts/inspectLearningAndCapability.js` | 2653 | 65 | `UTILITY` | Read-only Mongo dump for project `6acfb3838ff9ff02f57b70e1`. |
| `server/scripts/inspectProject.js` | 2143 | 68 | `UTILITY` | Read-only Mongo dump of project `6acfb3838ff9ff02f57b70e1`, team, reqs & tasks. |
| `server/scripts/inspectScrumData.js` | 2834 | 68 | `UTILITY` | Read-only Mongo dump of teams, Scrum filter counts, projects & sprints. |
| `server/scripts/inspectTeamOp2.js` | 1909 | 44 | `UTILITY` | Read-only Mongo dump for `TEAM OP2`. |
| `server/scripts/migratePhase1.js` | 7606 | 168 | `UTILITY` | Idempotent Phase 1 team-to-Project backfill (`DRY_RUN=true` safe; mutates DB otherwise; `"planning"` enum bug). |
| `server/scripts/reconcilePhishShield.js` | 2094 | 67 | `UTILITY` | Mutating repair script regenerating PhishShield Waterfall tasks. |
| `server/scripts/recoverPhishShieldSprint.js` | 4285 | 116 | `UTILITY` | Mutating V4 recovery script restoring PhishShield Sprint 01 & 9 tasks. |
| `server/scripts/seedDemo.js` | 5519 | 119 | `UTILITY` | `npm run seed:demo`; deletes `"DAA Demo Team"` & tasks, inserts sample team/tasks. |

#### B. Standalone Node Test, Audit & Verification Suites (`94` Files)
*(Categories: `A`=Live HTTP `:4000/:5000`, `B`=Ephemeral Express HTTP, `C`=Pure Offline Unit/FS, `D`=No-DB Live LLM, `E`=Offline/RO Mixed, `F`=Direct MongoDB Service/Model/`router.stack`)*

| Path | Bytes | Lines | Cat | Safety / Characteristics |
|---|---:|---:|---|---|
| `server/scripts/auditKanbanEndToEnd.js` | 12112 | 302 | `A` | Hits `:4000`; **NO cleanup (`Cln=False`)** — leaves Kanban records in DB. |
| `server/scripts/runPhase6Validation.js` | 13461 | 213 | `A` | Hits `:4000`; **BROKEN** (passwordless login -> HTTP 400); `Cln=False`; no `process.exit(1)`. |
| `server/scripts/testAcademicEvaluation.js` | 8154 | 225 | `F` | Direct `academicEvaluationService` + Mongo; cleans own docs. |
| `server/scripts/testAdaptiveMethodology.js` | 8024 | 173 | `F` | Direct `methodologyDriftService` + Mongo; cleans own docs. |
| `server/scripts/testArtifactSaveDeletePersistence.js` | 14460 | 351 | `A` | Hits `:4000`; **SEVERE HAZARD:** permanently mutates PhishShield `ownerId`/`members`! |
| `server/scripts/testAuthAndIsolation.js` | 12337 | 283 | `F` | `npm run test:all`; auth & tenant isolation + Mongo. |
| `server/scripts/testCanonicalSkills.js` | 8362 | 198 | `F` | Canonical skill taxonomy + Mongo; cleans own docs. |
| `server/scripts/testChatMarkdownAndPresentation.js` | 26789 | 646 | `B` | Ephemeral Express+Socket; **`Cln=False` & hardcoded Atlas fallback URI at `L35`!** |
| `server/scripts/testClassicRestorationAndScrumScrollSuite.js` | 16694 | 297 | `F` | Classic UI restoration + Scrum scroll checks (Mongo + FS checks). |
| `server/scripts/testClassicV1GuideSuite.js` | 8427 | 178 | `C` | **Safe offline:** exports `CLASSIC_GUIDE_STEPS`; checks `classicGuideData.ts` & Classic panels. |
| `server/scripts/testClassicV4RestorationSuite.js` | 16322 | 370 | `F` | Classic 6-tab restoration verification (Mongo + FS). |
| `server/scripts/testCopilotAttachments.js` | 8644 | 208 | `F` | Direct `copilotAttachmentService` + Mongo; cleans own docs. |
| `server/scripts/testCrossFeaturePipeline.js` | 13324 | 358 | `F` | Direct WS 11–15 service pipeline + Mongo. |
| `server/scripts/testDeleteWorkspace.js` | 4715 | 128 | `A` | Hits `:4000` + Mongo; creates & deletes test workspace cleanly. |
| `server/scripts/testDigitalTwin.js` | 9020 | 236 | `F` | Direct `digitalTwinService` + Mongo; cleans own docs. |
| `server/scripts/testDomainIntelligence.js` | 6840 | 156 | `F` | Direct `domainIntelligenceService` + Mongo; cleans own docs. |
| `server/scripts/testDomainMethodology.js` | 5128 | 122 | `C` | **Safe offline:** pure `domainMethodologyResolver` unit checks. |
| `server/scripts/testFairContribution.js` | 9449 | 264 | `F` | Direct `fairContributionService` + Mongo; cleans own docs. |
| `server/scripts/testFixes1to5.js` | 14951 | 331 | `F` | Early V4 fixes 1–5 service + Mongo checks. |
| `server/scripts/testFixes1to5Integration.js` | 37842 | 756 | `B` | Ephemeral Express (`:4571`) + Socket.IO + Mongo; cleans own docs. |
| `server/scripts/testFixes1to5Logic.js` | 5998 | 131 | `C` | **Safe offline:** pure logic + static FS checks. |
| `server/scripts/testFixes3Versioning.js` | 11494 | 279 | `F` | `derivedVersion`/`stateVersion` persistence + Mongo. |
| `server/scripts/testFixes4Traceability.js` | 12437 | 290 | `F` | Requirement traceability & evidence + Mongo. |
| `server/scripts/testFixes5Memory.js` | 11490 | 291 | `E` | **HAZARD:** runs global `ProjectMemory.deleteMany({})` at `L119, 262` when DB connects! |
| `server/scripts/testFourFixesIntegratedSuite.js` | 25674 | 501 | `F` | Integrated Waterfall fixes + Mongo. |
| `server/scripts/testGitHubOAuthBackendHardeningSuite.js` | 33551 | 798 | `F` | OAuth config/crypto/`verifyProjectAccess`/workspace context + Mongo (0 live HTTP). |
| `server/scripts/testGitHubWorkspaceMemoryAndDocsV4.js` | 16286 | 294 | `C` | **Safe offline:** FS assertions + token crypto/URL checks (no DB/HTTP). |
| `server/scripts/testGroqFallbackIntegration.js` | 24242 | 518 | `D` | Makes live Gemini/Groq/OpenRouter HTTP calls; mutates `process.env` in `try/finally`. |
| `server/scripts/testHybridV4.js` | 7585 | 152 | `F` | Direct `hybridEngine.js` + Mongo (no macro-gate/UI tests). |
| `server/scripts/testInvitationFlow.js` | 24034 | 517 | `F` | `npm run test:all`; invitation expiry & role workflows + Mongo. |
| `server/scripts/testKanbanV4FullSuite.js` | 31781 | 742 | `E` | Offline Kanban services (read-only if Mongo connects; 0 writes). |
| `server/scripts/testLearningLoop.js` | 5223 | 126 | `F` | `npm run test:all`; `learningService` + Mongo. |
| `server/scripts/testLocalAICore.js` | 5630 | 125 | `C` | **Safe offline:** WS 20 local AI abstraction/config unit checks. |
| `server/scripts/testManualQaFixes.js` | 16251 | 320 | `C` | **Safe offline:** runnable Node version of Manual QA Fixes 1–3. |
| `server/scripts/testManualQaFixes2456.js` | 22875 | 421 | `C` | **Safe offline:** unit suite for Manual QA Fixes 2, 4, 5, 6. |
| `server/scripts/testMasterCorrections.js` | 24451 | 539 | `F` | `npm test` & `test:all`; triggers **live LLM calls** + Mongo. |
| `server/scripts/testMasterRefactorFixes.js` | 14625 | 301 | `F` | `npm run test:all`; V2/V3 refactor checks + Mongo. |
| `server/scripts/testMemberPermissionsAndProfiles.js` | 19332 | 458 | `B` | Ephemeral Express (`skills.js`, `teams.js`) + Mongo; cleans own docs. |
| `server/scripts/testMethodologyAdvisor.js` | 7423 | 175 | `F` | Direct `methodologyAdvisor` + Mongo. |
| `server/scripts/testMethodologyAvailabilityAndDocs.js` | 23953 | 467 | `E` | FS/env checks + **read-only** `Project.find().limit(5)`; asserts **7** Waterfall tabs (stale vs 8). |
| `server/scripts/testMethodologyEngine.js` | 5932 | 162 | `F` | Methodology engine transition & gating + Mongo. |
| `server/scripts/testMethodologyIsolationSuite.js` | 10924 | 255 | `F` | Cross-methodology isolation + FS checks + Mongo. |
| `server/scripts/testMultimodalCopilot.js` | 8754 | 207 | `F` | `multimodalCopilotService` (`mockVisionResult`) + Mongo. |
| `server/scripts/testNexusflowAiHub.js` | 11060 | 217 | `F` | `npm run test:all`; triggers **live LLM calls** + Mongo. |
| `server/scripts/testNexusflowV3.js` | 18239 | 412 | `A` | **`test:all` WIPE HAZARD:** `coll.deleteMany({})` across **ALL** DB collections! Wrong port `:5000`. |
| `server/scripts/testOmniRouteZeroCostPolicy.js` | 9788 | 233 | `D` | `test:all`; live LLM calls; **STALE/BROKEN:** forbids `"groq"` at `L115`. |
| `server/scripts/testOpinionSystem.js` | 4733 | 115 | `F` | `npm run test:all`; `Opinion` workflow + Mongo. |
| `server/scripts/testPhase10Sync.js` | 3916 | 106 | `F` | `npm run test:all`; Phase 10 real-time sync + Mongo. |
| `server/scripts/testPhase1DataFoundation.js` | 29208 | 609 | `F` | `npm run test:all`; Phase 1 additive schema + Mongo. |
| `server/scripts/testPhase2ProjectIntelligence.js` | 21891 | 491 | `F` | `npm run test:all`; triggers **live LLM calls** + Mongo. |
| `server/scripts/testPhase3TaskDecomposition.js` | 17844 | 401 | `F` | `npm run test:all`; task decomposition + Mongo. |
| `server/scripts/testPhase6Fixes.js` | 5437 | 113 | `C` | **Safe offline:** `npm run test:all`; deterministic guidance fixes. |
| `server/scripts/testProcessMining.js` | 9327 | 249 | `F` | Direct `processMiningEngine` + Mongo. |
| `server/scripts/testProjectBrain.js` | 6044 | 149 | `F` | `npm run test:all`; `projectBrain` + Mongo. |
| `server/scripts/testReactKeyDeduplication.js` | 5819 | 147 | `C` | **Safe offline:** task normalization & React key stability checks. |
| `server/scripts/testRetrospective.js` | 4413 | 96 | `F` | `npm run test:all`; `retrospectiveService` + Mongo. |
| `server/scripts/testRiskEngine.js` | 5131 | 139 | `F` | `npm run test:all`; `riskEngine` + Mongo. |
| `server/scripts/testScrumBulkAcceptSuite.js` | 15253 | 395 | `F` | `router.stack` mock req/res Scrum bulk-accept + FS + Mongo (bypasses server auth mounts). |
| `server/scripts/testScrumCompletionSafetyAndTeamSuite.js` | 13968 | 301 | `F` | Scrum sprint completion 409 safety & Team restoration + Mongo. |
| `server/scripts/testScrumConsolidatedFixes1to4Suite.js` | 17542 | 450 | `F` | Consolidated Scrum Fixes 1–4 + Mongo. |
| `server/scripts/testScrumFix5FinalizationSuite.js` | 19513 | 404 | `F` | Scrum Fix 5 plan finalization + Mongo. |
| `server/scripts/testScrumFixes1And2Suite.js` | 23369 | 506 | `F` | Scrum Fixes 1 & 2 + Mongo. |
| `server/scripts/testScrumFixes1to4Suite.js` | 19183 | 416 | `F` | Scrum Fixes 1–4 + Mongo. |
| `server/scripts/testScrumFollowUpFixesSuite.js` | 20446 | 447 | `F` | Scrum follow-up fixes (**triggers live LLM calls**) + Mongo. |
| `server/scripts/testScrumHealthAndRiskPersistenceSuite.js` | 26158 | 468 | `F` | `scrumHealthService` & `scrumRiskEngine` persistence + Mongo. |
| `server/scripts/testScrumSprintAnalyticsSuite.js` | 9732 | 214 | `F` | DB-backed Scrum analytics + FS checks + Mongo. |
| `server/scripts/testScrumTasksBoardScrollSuite.js` | 10089 | 216 | `F` | Scrum Tasks board scroll checks + FS + Mongo. |
| `server/scripts/testScrumTeamRestorationSuite.js` | 15787 | 396 | `F` | `router.stack` mock req/res (`teams.js`, `scrum.js`) + FS + Mongo. |
| `server/scripts/testScrumV4FullExperienceSuite.js` | 13142 | 298 | `F` | Full Scrum V4 service flow + FS + Mongo. |
| `server/scripts/testScrumV4FullSuite.js` | 12322 | 274 | `C` | **Safe offline:** `npm run test:scrum`; pure Scrum unit checks. |
| `server/scripts/testScrumV4LifecycleAndSecuritySuite.js` | 18110 | 439 | `F` | Scrum lifecycle + `process.env` offline/release channel checks + Mongo. |
| `server/scripts/testTaskPriorityEngine.js` | 12400 | 228 | `C` | **Safe offline:** 7-factor DAA priority engine unit checks. |
| `server/scripts/testTeacherReview.js` | 8235 | 218 | `F` | Direct `teacherReviewService` + Mongo. |
| `server/scripts/testTeamDiscoveryAndApplications.js` | 31208 | 613 | `B` | Ephemeral Express (`skills`, `teams`, `discovery`) + Mongo; cleans own docs. |
| `server/scripts/testTeamHealth.js` | 4476 | 104 | `F` | `npm run test:all`; `teamHealth` + Mongo. |
| `server/scripts/testV3UiFunctionalIntegration.js` | 16407 | 367 | `A` | Hits `:4000`; **`Cln=False` — leaves 3 users/team/tasks/risks/retro/chats in DB**. |
| `server/scripts/testV4PlanEngine.js` | 4505 | 117 | `F` | V4 plan parser/lifecycle + Mongo. |
| `server/scripts/testV4WaterfallCompletion.js` | 18270 | 392 | `F` | Waterfall end-to-end phase completion + Mongo. |
| `server/scripts/testWaterfallAndRiskReconciliationSuite.js` | 23506 | 546 | `F` | Waterfall health & risk reconciliation + FS + Mongo. |
| `server/scripts/testWaterfallArtifactApprovalAndFinalization.js` | 25461 | 642 | `A` | Hits `127.0.0.1:4000` + Mongo (27 HTTP scenarios); cleans created docs. |
| `server/scripts/testWaterfallBulkRequirementApproval.js` | 18169 | 409 | `A` | Hits `127.0.0.1:4000` + Mongo (16+ scenarios); cleans created docs. |
| `server/scripts/testWaterfallLifecycleAndGating.js` | 14054 | 308 | `F` | Waterfall lifecycle & phase gate enforcement + Mongo. |
| `server/scripts/testWaterfallThreeFixesSuite.js` | 17716 | 416 | `F` | Waterfall 3-fix DAG/Insights/Health suite + FS + Mongo. |
| `server/scripts/testWhatIfSimulation.js` | 8017 | 184 | `F` | Direct Monte Carlo `simulationEngine` + Mongo. |
| `server/scripts/testWorkflowConformance.js` | 10677 | 291 | `F` | Direct `workflowConformanceEngine` + Mongo. |
| `server/scripts/testWorkflowRoleAndInvitations.js` | 19692 | 470 | `F` | Role RBAC & invitations + Mongo. |
| `server/scripts/testWorkspaceDescriptionFix.js` | 13263 | 292 | `C` | **Safe offline:** template validation & `useTeamTasks` guard (no `process.exit`). |
| `server/scripts/testWorkstream26SecurityHardening.js` | 15629 | 376 | `B` | Ephemeral Express (`:4926`) RBAC/IDOR security hardening + Mongo. |
| `server/scripts/testWorkstream27DatabaseAndPerformance.js` | 8835 | 193 | `F` | MongoDB indexes & query perf checks. |
| `server/scripts/testWorkstream28Contracts.js` | 9805 | 243 | `B` | Ephemeral Express+Socket (`:4928`) WS 28 contracts + Mongo. |
| `server/scripts/testWorkstream29DaaAiBoundary.js` | 8104 | 188 | `F` | Deterministic DAA vs AI boundary + Mongo. |
| `server/scripts/testWorkstreams16to20Integration.js` | 10810 | 261 | `F` | Direct WS 16–20 service integration + Mongo. |
| `server/scripts/testWorkstreams21to25ApiSuite.js` | 16520 | 406 | `B` | Ephemeral Express (`:4055`, `workstreams21to25.js`) + Mongo; cleans own docs. |
| `server/scripts/testWorkstreams21to25Suite.js` | 22390 | 494 | `F` | Direct WS 21–25 service integration + Mongo. |

---

## 5. Inventory Parity Check (`481 / 481` Verified)
| Group | File Count | Verification |
|---|---:|---|
| Root / Tooling / `scripts/` / `docs/` / `documents/` / `images/` / `MD FILES/` | `88` | `18 + 13 + 57 = 88` |
| Frontend (`client/` root + `app/` + `components/` + `constants/` + `context/` + `hooks/` + `services/` + `utils/`) | `142` | `47 + 28 + 67 = 142` |
| Backend (`server/` root + `__tests__/` + `algorithms/` + `config/` + `constants/` + `data/` + `models/` + `routes/` + `services/` + `socket/` + `utils/` + `scripts/`) | `251` | `20 + 42 + 13 + 65 + 8 + 103 = 251` |
| **Grand Total** | **`481`** | **100% Parity with `file_inventory_481.json`** |
