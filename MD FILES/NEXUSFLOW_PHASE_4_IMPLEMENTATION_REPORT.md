# NEXUSFLOW — Phase 4 Implementation Report
## Intelligent AI Routing, Zero-Cost Enforcement, GitHub Security, Integration Reliability & Backend Resilience

Branch `branch4` (from verified `origin/branch3` @ `1944769`) · not merged · not deployed · production database never accessed · no live AI / GitHub / Google / SMTP calls · no paid API requests.

---

## A. Executive summary

All fifteen Phase 4 tasks were implemented and verified on isolated infrastructure. The work also surfaced several defects beyond the original audit.

### Defects found and fixed beyond the audit

- **Fabricated AI output.** `aiProviderAbstraction` never called a provider. It returned invented text such as `"[Gemini Response] Advisory analysis for: …"` with invented token counts, and `decisionIntelligenceService` persisted that text as the AI summary of every decision record.
- **Cross-member GitHub token use.** Connecting a repository fell back to *any* integration token of the project, i.e. another member's GitHub token. Separately, the OAuth callback overwrote another member's integration token with the current user's token.
- **Deterministic output mislabelled as AI.** Fallback plans and tasks were saved with `source: "ai"`.
- **Unbounded AI task creation.** The socket `@ai` path created tasks directly from unvalidated model text, with no count limit.
- **No working database lifecycle.** The server kept serving without a database, and had no health endpoint (D-14).

### What Phase 4 delivers

- **Model registry.** A verified provider/model registry: retired and unverified models can never be routed.
- **Zero-cost routing.** Routing is fail-closed and checked before any network call.
- **Bounded execution.** A 25 s global deadline (configurable 5–120 s), at most 4 attempts, cancellation, error-class-aware failover, and per-provider/per-model circuit breakers. The old configured chain could take about 194 s.
- **Usage limits.** Per-user and per-workspace AI rate limits and concurrency caps.
- **Caching and integrity.** A scoped cache with request coalescing; strict structured-output validation; secret redaction and delimiting of untrusted content; idempotent conversations with truthful provenance.
- **GitHub credentials.** AES-256-GCM encryption bound to the token owner, plus a safe migration from the legacy format.
- **GitHub synchronisation.** Incremental, bounded and secret-excluding.
- **Backend lifecycle.** Liveness and readiness endpoints, prompt 503s during database outages, bounded startup retries and graceful shutdown.
- **Native sign-in.** Native Google sign-in support (code complete, verified with simulations only).
- **Phase 3 follow-ups.** All remaining Phase 3 integration gaps are resolved.

### What was not verified

- Live provider connectivity and live Google/GitHub OAuth.
- Native-device sign-in.
- Multi-server behaviour.

---

## B. Git baseline

| Item | Value |
|---|---|
| Source | `origin/branch3` @ `1944769` (verified). `origin/branch2` = `c11b5b2`, `origin/branch1` = `ccdd7c0`, `origin/main` = `69a5f9a`, all unchanged |
| Branch | `branch4`. The auto-set upstream to `origin/branch3` was removed immediately, so no push can land on branch3 |
| Baseline | unit 99, Jest-compatible 51, security 144, integration 39, logic suites: all PASS. The run completed before any Phase 4 edit (verified by timestamps) |
| Commits | see §O; pushed with `git push -u origin branch4` |

---

## C. Task implementation matrix

| # | Task | Original problem (verified in code) | Implementation | Key files | Tests | Status | Limitations |
|---|---|---|---|---|---|---|---|
| 1 | Provider/model audit (D-27) | Whitelist contained retired models (gemini-1.5-*, 2.0-flash, gemma2, mixtral, llama-3.1-70b) | `services/ai/modelRegistry.js`: per-model status, free eligibility, capabilities, limits, sources, verification date; operators can only narrow the list or add valid `:free` variants | registry, omniRoute | registry tests | DONE | Live `/models` endpoints not queried; documentation is internally inconsistent in places (§D) |
| 2 | Zero-cost enforcement | Any `:free` suffix accepted; `openrouter/free` trusted; Gemini key in the URL | Fail-closed `assertZeroCostRoute` before any `fetch`; client model overrides checked; billable tool fields refused; OpenRouter `allow_fallbacks:false` and served-model check; key sent in the `x-goog-api-key` header | routingPrimitives, omniRoute | 10 policy tests (fetch never called) | DONE | Provider-side billing cannot be enforced by code (§F) |
| 3 | Failover and circuit breakers | 13 sequential attempts; every error treated alike | Error classes with model/provider/request scope; per-provider and per-model breakers (HEALTHY / DEGRADED / RATE_LIMITED / CIRCUIT_OPEN / HALF_OPEN / DISABLED; single half-open probe) | routingPrimitives, omniRoute | 8 tests, fake clock | DONE | Breaker state is per instance |
| 4 | Deadlines and cancellation (D-27) | Worst case ≈ 194 s | Global deadline (default 25 s, bounded 5–120 s); each attempt ≤ remaining budget; AbortSignal from client disconnect (request context) and socket disconnect; late responses discarded; client deadline 32 s with Cancel | omniRoute, requestContext, aiRequest.ts | 5 server + 5 client tests | DONE | Cancelled requests may still count against provider quota |
| 5 | AI rate limits and quotas | None | Per-user / expensive / workspace windows; user and workspace concurrency; bounded maps; checked before any provider call; metadata-only `AIUsageEvent` (30-day TTL) | routingPrimitives, AIUsageEvent | 3 tests | DONE | Instance-local counters |
| 6 | Structured output | Lenient parsing, unbounded tasks | `structuredOutput.js`: no eval, forbidden-key / depth / size checks, strict task and quiz schemas, workspace-scoped dependency titles, ≤ 25 chat titles | taskDecomposer, socket aiOrchestrator, ai.js | 5 unit + 3 integration tests | DONE | — |
| 7 | Context isolation / injection | Raw repository / memory text in prompts | Authorization before context building (existing guards); `contextGuard.js` secret redaction on every outbound prompt; `<untrusted>` delimiting with escape neutralisation; mutations only through validated, authorized paths | contextGuard, workspaceContextService, aiOrchestrator | 3 unit + adversarial integration tests | DONE | Redaction is best-effort; no claim of immunity to prompt injection |
| 8 | Cache and deduplication | None | Scoped key (workspace epoch, project, scope, operation, template, context revision, input); coalescing; LRU + TTL; invalidation on membership / archive / project change (model plugin) and repository disconnect; failures never cached | ScopedAiCache, aiCacheInvalidationPlugin | 3 unit + 1 integration test | DONE | Instance-local cache |
| 9 | Conversations and memory | Duplicates on retry; misleading provenance | `clientRequestId` idempotency (unique partial index), `replyTo` linking, persisted status and real model, untrusted memory, cancellation-safe | AIMessage, projectIntelligence, ProjectAdvisorPanel | 3 integration tests | DONE | No summarisation of long history (bounded to 12 messages) |
| 10 | AES-256-GCM (D-30) | AES-CBC without integrity; fixed development fallback key | `githubTokenCrypto.js` (§H); owner-bound AAD; key ring with rotation; dry-run migration | crypto, migration, githubService, routes | 7 crypto + 2 migration tests | DONE | Environment-managed keys (no KMS) |
| 11 | GitHub sync and indexing | Cross-member token fallback; full re-download on every sync; raw errors | Own-credential rule; timeouts, error classification, bounded pagination, owner/repo validation; atomic sync claim; incremental sync (unchanged = 1 request, was 7); exclusions; redacted previews; truthful states | githubService, routes/github, repositoryIndexingService, GitHubPanel | 12 tests | DONE | No webhook (none existed, none added) |
| 12 | Liveness / readiness (D-14) | No health endpoint | `/health/live`, `/health/ready`, `/health` (sanitised; AI and GitHub optional) | appLifecycle, app.js | 3 tests | DONE | — |
| 13 | DB outage and shutdown (D-14) | Served without a database; requests hung on Mongoose buffering | Early bind with health-only service; bounded startup attempts then exit; `bufferCommands` off; 503 guard; sanitised error handler; graceful shutdown; correlation IDs | index.js, appLifecycle | 3 tests (real disconnect and reconnect) | DONE | `index.js` startup and signal handling tested via unit functions, not by killing a live process |
| 14 | Native Google sign-in | Web only | `platform=native` → server-configured deep link only; expo-crypto verifier in SecureStore; expo-web-browser auth session; strict callback parser; deep-link screen | auth.js, AuthContext, googleNativeAuth.ts | 5 server + 5 client tests (simulated) | IMPLEMENTED, device UNVERIFIED | Needs a development build and Google iOS/Android client IDs |
| 15 | Phase 3 gaps | — | See §L | several | 3 unit + 2 integration tests; legacy reclassification | DONE | — |

---

## D. Provider and model inventory

Verified 2026-11-26 against official documentation. These are documentation checks, not live calls.

| Provider | Model | Status | Free eligibility | Enabled / routable | Notes |
|---|---|---|---|---|---|
| Gemini | gemini-2.5-flash | CONDITIONALLY AVAILABLE | Free tier listed on pricing page | yes | Release notes restrict 2.5 models to projects that used them before; the free tier ends if billing is linked |
| Gemini | gemini-2.5-flash-lite | CONDITIONALLY AVAILABLE | Free tier listed | yes | Same condition |
| Gemini | gemini-3.1-flash-lite | FREE ELIGIBILITY UNVERIFIED | — | no | Named as a replacement on the deprecations page |
| Gemini | gemini-2.0-flash | VERIFIED RETIRED (2026-06-01) | — | no | |
| Gemini | gemini-1.5-flash, -8b | VERIFIED RETIRED (2025-09-29) | — | no | |
| Groq | openai/gpt-oss-20b | VERIFIED AVAILABLE | Base / free plan limits | yes | Published limit figures conflict between pages |
| Groq | openai/gpt-oss-120b | VERIFIED AVAILABLE | Base / free plan limits | yes | Recommended Llama 3.3 replacement |
| Groq | qwen/qwen3.8-27b | UNVERIFIED | — | no | Official pages disagree on the ID (3.6 vs 3.8) |
| Groq | llama-3.3-70b-versatile, llama-3.1-8b-instant | VERIFIED RETIRED | — | no | Deprecation date 2026-08-16 has passed. The models page still lists 3.1-8b (conflict noted) |
| Groq | gemma2-9b-it, mixtral-8x7b-32768, llama-3.1-70b-versatile | VERIFIED RETIRED | — | no | |
| OpenRouter | openrouter/free | UNVERIFIED | — | no | No official pricing or selection documentation found |
| OpenRouter | `<vendor/model>:free` (operator-approved) | CONDITIONALLY AVAILABLE | `:free` variants documented as zero-priced, no credit purchase; 20 RPM / 50 RPD | only if listed in `OPENROUTER_FREE_MODELS` | Suffix never stripped |

**Sources:**

- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) · [Gemini release notes](https://ai.google.dev/gemini-api/docs/changelog)
- [Groq models](https://console.groq.com/docs/models) · [Groq deprecations](https://console.groq.com/docs/deprecations) · [Groq rate limits](https://console.groq.com/docs/rate-limits)
- [OpenRouter model variants](https://openrouter.ai/docs/guides/routing/model-variants/overview) · [OpenRouter free models](https://openrouter.ai/collections/free-models)

**Capabilities.** Routed capabilities: chat, json, decomposition, planning, code, research, classification, explanation, plus long_context on gemini-2.5-flash and the gpt-oss models. Web search or grounding is never enabled: billable tool fields are refused by the policy.

---

## E. OmniRoute architecture

```mermaid
flowchart LR
  A[Authenticated route / socket<br/>workspace authorization] --> B[Context build<br/>untrusted delimiting]
  B --> C[Secret redaction<br/>input bound]
  C --> D{Usage limits<br/>user / workspace / concurrency}
  D -- limited --> X1[rate_limited<br/>no provider call]
  D --> E{Scoped cache<br/>+ coalescing}
  E -- hit --> R[result: source=cache]
  E --> F[Capability-aware candidates<br/>verified registry]
  F --> G{Zero-cost assertion<br/>before fetch}
  G -- violation --> X2[policy_rejected]
  G --> H{Circuit breakers<br/>provider + model}
  H --> I[Attempt: timeout = min(model timeout, remaining deadline)<br/>AbortSignal]
  I -- ok --> V[Structured validation<br/>business rules · DAA] --> R2[persist / preview<br/>source=provider]
  I -- error --> J[Classify: request / provider / model scope]
  J -- next eligible --> H
  J -- deadline / cancel / exhausted --> X3[truthful unavailable status<br/>deterministic features continue]
```

**Error classification and failover:**

- 401 → AUTH (provider disabled).
- 403 → PERMISSION (provider skipped).
- 402 or billing wording → POLICY (provider skipped).
- 404 or decommissioned → MODEL_UNAVAILABLE (model disabled).
- 429 with quota wording → QUOTA_EXHAUSTED (whole provider skipped, honouring Retry-After). Otherwise RATE_LIMIT (model only).
- 400 / 413 / 422 → INVALID_REQUEST (stop; never retried unchanged).
- 5xx and network errors → TRANSIENT (next model). Timeouts → next model.
- Each model is attempted at most once per request.

**Circuit breakers:**

- 3 failures open the circuit for 60 s (configurable).
- Rate-limited circuits stay open until Retry-After (or 10× the cooldown for quota).
- Half-open allows exactly one probe at a time (no request storm).
- No health-check inference calls are ever made.

**State:** breaker, limiter and cache state is instance-local (§Q).

---

## F. Zero-cost policy

**Enforced in code:**

- Only registry entries with `enabled ∧ freeEligible ∧ status ∈ {VERIFIED_AVAILABLE, CONDITIONALLY_AVAILABLE}` are routable.
- Unknown, paid, retired, unverified and client-supplied unsafe models are rejected before `fetch`; tests assert zero network calls.
- Billable request fields (tools, grounding, web search, plugins) are refused.
- OpenRouter is called with `provider.allow_fallbacks=false`, and a response served by a different model is refused.
- No paid provider is configured anywhere, and no automatic paid fallback exists.
- If AI is unavailable, the app returns a truthful unavailable status; deterministic features continue and are labelled `deterministic`.

**Requires operator configuration (cannot be enforced by code):**

- **Gemini.** Keep the AI Studio project without a linked billing account; linking billing makes all usage billable.
- **Groq.** Stay on the free/base plan; do not add a payment method.
- **OpenRouter.** Use only `:free` variants; consider a zero credit balance. Note that buying credits changes rate limits.

**No universal zero-charge guarantee is claimed.**

---

## G. AI security

- **Context authorization.** Existing Phase 1 route and socket guards run before any context is assembled. Cached private output is served only after the route re-authorizes, and cache keys are workspace-scoped and epoch-invalidated.
- **Sensitive-data minimisation.** Every outbound prompt is secret-redacted: private keys, GitHub / AWS / Google / OpenAI-style / Groq / Slack tokens, JWTs, connection strings, bcrypt hashes and `*_SECRET=`-style assignments. Repository indexing excludes sensitive files and redacts previews. This is pattern-based and not perfect.
- **Prompt-injection boundaries.** Retrieved content (README, code, chat, memory, research) is wrapped in `<untrusted>` blocks with delimiter neutralisation and trusted rules. The real boundary is enforced outside the model:
  - Outputs only become data through strict schemas.
  - Roles, permissions, assignees and foreign IDs are rejected.
  - Mutations happen only through authorized handlers.
  - Adversarial tests confirm no role change, cross-workspace task, or `$` operator was persisted.
- **No AI tool or agent framework.** None was introduced; the model cannot call application actions.

---

## H. Cryptographic design (GitHub tokens)

- **Algorithm.** AES-256-GCM (Node `crypto`), 12-byte CSPRNG nonce per encryption, 16-byte tag. The tag is verified before any plaintext is released.
- **Envelope.** `nf1.a256gcm.<keyId>.<iv>.<ciphertext>.<tag>` (base64url fields).
- **Associated data.** `nexusflow:github-token:nf1:user:<ownerUserId>`. A ciphertext decrypts only for its owner. Copies between the same owner's credential and integration records remain valid; a copy on another user's record fails authentication (tested).
- **Keys.**
  - `GITHUB_TOKEN_ENCRYPTION_KEY` must be exactly 32 bytes; `GITHUB_TOKEN_ENCRYPTION_KEY_ID` identifies it.
  - Never generated at startup, never derived from `JWT_SECRET`, no development fallback.
  - If the key is missing, GitHub credential operations fail safely; the rest of the app is unaffected.
- **Rotation.** Set a new key and id, and list the old key in `GITHUB_TOKEN_PREVIOUS_KEYS` (decrypt-only).
- **Legacy migration** (`scripts/migrations/phase4GitHubTokenMigration.js`):
  - Dry run by default.
  - Legacy CBC values are decrypted only with an explicit `GITHUB_TOKEN_LEGACY_KEY`.
  - Each value is re-encrypted for its owner, verified by a round trip, and replaced with compare-and-swap (concurrent changes are skipped).
  - Idempotent.
  - Unrecoverable values are marked `reconnectRequired` / `reconnect_required`.
  - No plaintext appears in reports or logs.
  - Records encrypted with the old development default key need that value as `GITHUB_TOKEN_LEGACY_KEY`.
  - CBC had no integrity protection, so migration cannot prove old values were untampered.
- **Limitations.** Keys live in environment variables (no KMS or HSM). Key exposure equals token exposure.

---

## I. GitHub integration

- **Authorization.**
  - Only the requesting user's own credential (or own integration) is ever used.
  - The OAuth refresh updates only the same user's integration.
  - Disconnection removes the token copy and invalidates the workspace AI cache.
  - Project routes keep the Phase 1 membership checks; cross-workspace access is rejected with no GitHub call made (tested).
- **API reliability.**
  - 10 s timeouts.
  - 401 → `reconnect_required`.
  - 403 / 429 with remaining 0 or Retry-After → `rate_limited`, with reset time.
  - 404 not found; 409 empty repository.
  - Bounded `Link` pagination (5 pages, api.github.com only).
  - Owner, repository and ref validation.
  - Sanitised error codes to clients.
- **Incremental sync.**
  - An atomic claim (`syncInProgressSince`) rejects duplicate syncs with 409.
  - Unchanged commit → 1 request (previously 7).
  - The tree is read at the exact commit SHA.
  - Manual sync is incremental unless `force: true`.
- **Indexing bounds and exclusions.**
  - Limits: 250 indexed files, 20,000 tree entries, 1 MB per file, 12-level depth, 5 previews of ≤ 60 KB each.
  - Excluded: `.env*`, keys and certificates, credentials and service-account files, `node_modules` / `vendor` / `dist` / `build` and similar, binaries and media, lockfiles.
  - Exclusion counts are recorded per reason; sensitive paths are never stored.
  - Repository code is never executed and dependencies are never installed.
- **Q&A.** Grounded in indexed, redacted, delimited context with file paths and commit identity from the index. Results carry `source` / `status` / `model`; deterministic context summaries are labelled.
- **Webhooks.** None existed; none were added.

---

## J. Backend reliability

- **Startup.**
  1. Validate authentication configuration.
  2. Disable command buffering.
  3. Import the app.
  4. Bind the port: only `/health/*` succeeds, other API routes return 503.
  5. Connect to MongoDB with bounded attempts (`MONGO_CONNECT_ATTEMPTS`, default 5; exponential backoff; `serverSelectionTimeoutMS`).
  6. If the connection never succeeds: log a sanitised message and exit with code 1, so the host restarts the service.
  7. Start the purge scheduler, then mark readiness.
- **Runtime outages.**
  - The MongoDB driver reconnects itself; no second reconnection loop is created.
  - The guard returns 503 `DATABASE_UNAVAILABLE` with Retry-After immediately (tested under 2 s with a real disconnect, then recovery).
  - Liveness stays 200 throughout.
- **Shutdown.**
  - On SIGTERM/SIGINT, readiness reports not ready and new API work receives 503 `SHUTTING_DOWN`.
  - Sockets close, the HTTP server drains in-flight requests, timers and the AI sweeper are cleared, and MongoDB disconnects.
  - A bounded deadline (`SHUTDOWN_TIMEOUT_MS`, default 10 s) applies.
- **Errors.** A final sanitised handler (no stack traces; database errors map to 503). Malformed JSON → 400 `INVALID_JSON`. `X-Request-Id` correlation on every response.
- **Logs.** Logs carry request IDs and categories; prompts, tokens and keys are never logged.

---

## K. Google compatibility

| Area | State |
|---|---|
| Web flow | Unchanged from Phase 2; regression-tested |
| Native code | Implemented: server `platform=native` destination, expo-crypto verifier, expo-web-browser auth session, deep-link screen, auth-gate exception |
| Native simulated tests | Server: valid code, single-use, wrong verifier, cancellation, binding mismatch, replay, scheme validation. Client: callback parser (foreign scheme/host/path, JWT in URL, malformed code) |
| Native device tested | **NO** |
| Configuration required | Google Cloud iOS and Android OAuth clients (bundle id / package name + SHA-1), the `nexusflow` scheme, a development build (Expo Go is unsuitable for native Google OAuth), and `GOOGLE_NATIVE_REDIRECT_SCHEME` |
| Blocked | Device verification needs the operator's Google Cloud configuration and a development build |
| Dependencies | `expo-crypto ~13.0.2` and `expo-web-browser ~13.0.3` via `expo install` (SDK 51 pinned). React Native unchanged at 0.74.5 |

---

## L. Phase 3 remaining issues

| Item | Resolution |
|---|---|
| Kanban WIP | Mandatory ("hard") WIP saturation of the pull column is passed into decision eligibility via `wipPullConstraint`; advisory mode never blocks. Integration-tested on an isolated Kanban fixture |
| Unknown effort | `resolveTaskEffort`: a genuine 0 h stays 0. A missing estimate uses a disclosed assumption (default 4 h, flagged `effortAssumed`, counted in `meta.assumedEffortTasks`) or is excluded (`unknownEffortPolicy: "exclude"`) |
| Assignment fairness | The ⌈n/m⌉ cap is now opt-in (`balanced: true`, `maxTasksPerMember`, or env). The default hard constraint is hour capacity only. Exactness verified against exhaustive search with and without the cap (80 seeded instances plus a constructed case where fairness changes the optimum) |
| Knapsack ≥ ½ guarantee | Verified for the implemented formulation (non-negative values, non-negative integer-unit weights, best feasible single item compared, discretised objective) on 400 forced-approximation brute-force instances: worst observed ratio ≥ 0.5 |
| Task-graph backfill | Reviewed: dry-run default, workspace scoping and idempotency confirmed; per-workspace failure isolation added. Deployment sequence in §P. `--apply` was never run |
| Responsive header | The fixed-width centre brand label overlapped the workspace title on phones; it now renders only at ≥ 768 px, and the avatar stack at ≥ 420 px (desktop unchanged). Browser verification in §O |
| Health visual check | §O |
| Legacy AI tests | `runLegacyIsolated --mock-ai` (conversational mock only; structured requests behave as unavailable). Both scripts PASS **with a mocked provider**. Live connectivity is NOT verified; `scripts/aiLiveSmokeTest.js` is an opt-in single-request smoke test (not run) |
| Kanban legacy test | `--with-server --experimental-methodologies` (isolated development channel only; production gates and `.env` untouched) plus the current 1000-character description rule → PASS |
| Multi-process derived counts | Stale-revision detection: a pass re-runs (≤ 3) when the graph signature changed mid-pass. Tested by simulating another process's write between read and write. Full distributed coordination remains Phase 5; multi-server consistency is not claimed |

---

## M. Measurements

All figures below are **mocked or synthetic; none are live.**

**AI routing (mocked providers; injected responses — `benchmarks/results/phase4-ai-routing.json`):**

| Scenario | Provider attempts | Elapsed | Result |
|---|---|---|---|
| Healthy first model | 1 | 6 ms | gemini-2.5-flash |
| First model 503 | 2 | 5 ms | gemini-2.5-flash-lite |
| Provider-wide quota exhausted | 2 | 1 ms | Groq (second Gemini model skipped) |
| Permanent 401 | 2 | < 1 ms | Groq |
| Every attempt hangs (deadline scaled to 2 s) | 1 | 2008 ms | deadline; no further attempts |
| After repeated Gemini failures (circuits open) | 1 | 1 ms | Groq directly |
| 10 identical concurrent requests | 1 | 62 ms | coalesced |
| Repeat after completion | 0 | 1 ms | cache hit |
| Pre-Phase-4 configured worst case | — | ≈ 194 s (theoretical, from code: 5×12 s + 8×15 s + 14 s) | — |

**GitHub synchronisation (mocked GitHub API, synthetic repository):**
- Initial index: 9 requests.
- Unchanged commit: 1 request (previously 7).
- Updated commit: 9 requests.
- 400-file repository: bounded at 250 indexed files, with a reported overflow count.

Live provider and GitHub latencies were **not measured**.

---

## N. Forensic findings

| Finding | Status | Evidence |
|---|---|---|
| D-14 health endpoint / DB fail-fast | **RESOLVED** | Health and outage integration tests |
| D-27 OmniRoute latency budget and retired models | **RESOLVED** (code); live verification BLOCKED | Routing tests and measurements |
| D-29 instance-local state | **PARTIALLY RESOLVED**: OAuth state persistent (Phase 2); limiter, breakers and cache instance-local by design ($0); graph recompute gains stale-revision detection | — |
| D-30 GitHub token encryption | **RESOLVED** | Crypto and migration tests |
| D-34 | Not directly addressed in Phase 4 | — |
| New: fabricated AI responses persisted | **RESOLVED** | Abstraction now routes through OmniRoute |
| New: cross-member GitHub token use | **RESOLVED** | Ownership tests |
| New: deterministic output labelled "ai" | **RESOLVED** | `source: deterministic` |

---

## O. Testing results

Every run used isolated in-memory MongoDB replica sets. No production database was contacted, and no live AI, GitHub, Google or SMTP calls were made.

**Server and client suites:**

| Suite | Result |
|---|---|
| Server unit (`node:test`, incl. Phase 4 AI routing 39, DAA 47) | 141 / 141 PASS |
| Server Jest-compatible | 51 / 51 PASS |
| Server security (incl. Phase 4 GitHub 19, native Google 5; route coverage) | 168 / 168 PASS |
| Server integration (incl. Phase 4 AI/backend 15) | 54 / 54 PASS |
| Logic suites (TaskPriorityEngine 54, 11-case suite, Local AI core 30, Domain × Methodology 17, 8-case summary) | all PASS |
| `scripts/testOmniRouteZeroCostPolicy.js` | 33 / 33 PASS |
| Client Jest (incl. native callback parser, AI request states) | 27 / 27 PASS |
| Client `tsc --noEmit` | 0 errors |
| Client `expo export --platform web` | success |
| `node --check` on all changed server modules | clean |

**Legacy scripts:**

| Run | Result |
|---|---|
| Isolated | 81 scripts: 64 PASS, 2 FAIL, 15 BLOCKED. The 2 failures are `testMasterCorrections` and `testNexusflowAiHub`, which need a real AI answer; with no key they now receive a truthful "unavailable" instead of fabricated text |
| `--mock-ai` | `testMasterCorrections` and `testNexusflowAiHub` both PASS. This uses a **mocked provider and is not live connectivity** |
| `--with-server` (15 scripts) | 14 PASS. `auditKanbanEndToEnd` needs the experimental methodology channel |
| `auditKanbanEndToEnd --with-server --experimental-methodologies` | PASS (development channel set for the harness only) |
| `testWorkstream29DaaAiBoundary` | PASS without AI and with `--mock-ai`, after a justified expectation change |

**Audits:** `npm audit --omit=dev` finds 0 vulnerabilities in the server. The client reports 58 (2 critical, 31 high, 17 moderate, 8 low), all in the Expo SDK 51 / React Native 0.74 toolchain. Fixing them requires the major Expo upgrade deferred to Phase 5. Phase 4 added no new vulnerable dependency.

**Expectation changes (each justified inline in the test file):**
- `testLocalAICore` and `testWorkstream29DaaAiBoundary` previously passed only because the abstraction fabricated provider text. They now assert the truthful outcome: `AI_UNAVAILABLE`, no claimed provider, no vision capability without a verified free route, and a local stub that refuses rather than inventing output.
- `testMasterCorrections` and `testOmniRouteZeroCostPolicy`: `openrouter/free` and unapproved `:free` IDs are now blocked.
- The two GitHub legacy suites now use the AES-256-GCM contract.
- The Phase 3 DAA tests now expect the disclosed 4 h assumption for unknown effort and the opt-in fairness cap.

**Browser verification** (Chromium via CDP against a fresh web export and isolated demo server):

- **Workspace header at 320, 375, 768, 1024 and 1440 px.** No horizontal overflow at any width.
  - Verification found a second defect: on web, `flex: 0` gave the right header region a 0% basis, so it collapsed and the bell and avatar overlapped the methodology badge at 375 px. Fixed with an auto basis and re-verified with DOM box measurements; the badge now stays within its column at all five widths.
  - At 320 px a long workspace name truncates with an ellipsis.
  - The desktop layout, logo and cream/teal palette are unchanged.
- **Project Health panel (Task 15.7).** Grade and score render, and dimensions without data are labelled as excluded. Verification found the summary sentence listed healthy dimensions as needing attention ("Team Capacity & Workload (100%)"); it now names only dimensions below the healthy threshold (re-verified).
- **Not verified in a browser:** the Advisor and GitHub panels against live services, which would need provider keys and GitHub OAuth.

---

## P. Migration and deployment preparation (manual; nothing executed)

1. **GitHub encryption.**
   - Generate `GITHUB_TOKEN_ENCRYPTION_KEY` (32 random bytes) and set `GITHUB_TOKEN_ENCRYPTION_KEY_ID`.
   - Set `GITHUB_TOKEN_LEGACY_KEY` to the old `ENCRYPTION_KEY` value (or the old development default if that was in use).
   - Back up the database.
   - Run `node scripts/migrations/phase4GitHubTokenMigration.js` (dry run) and review it.
   - Run with `--apply` and re-run the dry run, expecting 0 legacy values.
   - Remove `GITHUB_TOKEN_LEGACY_KEY` and `ENCRYPTION_KEY`.
   - Users whose tokens are marked for reconnection must re-authorize GitHub.
2. **Task graph (Phase 3).** Run `node scripts/migrations/phase3TaskGraphBackfill.js` as a dry run, review, then `--apply`.
3. **Google.** Keep the web OAuth settings. For native sign-in, create iOS and Android OAuth clients and use a development build.
4. **SMTP.** Configure the `SMTP_*` settings (Phase 2).
5. **AI providers.** Free-tier keys only, with no billing linked (§F). Optional: `OPENROUTER_FREE_MODELS`, `AI_*` limits.
6. **Health.** Point the host's health check at `/health` (or `/health/ready`). A DB-less startup now exits non-zero after bounded attempts.
7. **Rollback.**
   - Reverting the code requires reverting tokens to CBC, which is impossible without the old code and key. Keep the pre-migration backup.
   - AI and health changes are stateless.
   - `AIUsageEvent` is additive (TTL).

---

## Q. Remaining Phase 5 work

- Expo / React Native major upgrade and the remaining client advisories.
- GitHub Actions CI.
- Distributed coordination (shared breaker, limiter and cache state; graph recompute leases) when running more than one server.
- Architecture modularisation (large route files).
- Repository and documentation cleanup.
- Deployment verification, including live provider / OAuth / SMTP smoke tests run by the operator.
- Performance hardening.
- KMS-backed key management (optional).
- Long-history summarisation for conversations.
- Webhook-driven GitHub sync (optional).

---

## R. Engineering assessment (evidence-based)

| Area | Score | Reason |
|---|---|---|
| Architecture | 7/10 | Clear AI pipeline modules, lifecycle utilities and crypto module; large route files remain |
| Security | 7.5/10 | Cross-member token flaw and fabricated AI output fixed; authenticated encryption; fail-closed AI policy |
| Authentication | 7/10 | Native code ready but device unverified; web flows unchanged |
| Database integrity | 7.5/10 | Idempotent messages, stale-revision detection, safe migrations |
| DAA correctness | 8.5/10 | Gaps closed and exhaustively verified |
| AI reliability | 7/10 | Bounded, classified, breaker-protected; live providers unverified |
| AI cost-policy enforcement | 8/10 | Fail-closed before network; provider billing still depends on the operator |
| AI response security | 7/10 | Strict schemas and authorization outside the model; redaction is heuristic |
| GitHub integration | 7.5/10 | Ownership, incremental, bounded; no live verification |
| Cryptographic security | 8/10 | AES-256-GCM with AAD and rotation; environment-managed keys |
| Backend reliability | 7/10 | Health, readiness, fail-fast, graceful shutdown; single-instance assumptions |
| Testing | 8/10 | Extensive isolated suites; no CI |
| Scalability | 4.5/10 | Instance-local AI state |
| Frontend UX | 7/10 | Truthful AI and GitHub states, responsive header |
| Production readiness | 5.5/10 | **Not production-ready**: live services, native devices and multi-instance behaviour unverified |
