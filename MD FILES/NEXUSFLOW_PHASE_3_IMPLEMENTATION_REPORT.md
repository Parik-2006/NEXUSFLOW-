# NEXUSFLOW — Phase 3 Implementation Report
## DAA Algorithm Correctness, Optimization, Explainable Intelligence & Benchmarking

Branch `branch3` (created from verified `origin/branch2` @ `c11b5b2`) · not merged · not deployed · production database never accessed · no paid AI calls.

---

## A. Executive summary

Every forensic DAA finding (D-20 to D-26, D-31 to D-33) was reproduced in the code before it was changed. Each fix is verified against an independent reference: brute force, exhaustive enumeration, exact integer arithmetic, `String.prototype.indexOf`, or stated invariants. Fixes are integrated through REST, Socket.IO, Mongoose middleware and the frontend, not only in the algorithm modules.

**Highlights, each checked against the frozen pre-Phase-3 code on identical seeded data:**

- **Greedy cap.** The greedy factor capped at 75 because its weight was applied twice. Each weight is now applied exactly once, all-maximum inputs give exactly 100, and the score equals an exact integer reference on all 525 grid points. 27 of those points had been mis-rounded by binary float error.
- **Dependency inversion.** Tasks *waiting* on prerequisites were rewarded instead of tasks that *unblock* work. Counts are now derived from the persisted graph (`dependencyCount` = prerequisites, new `dependentCount` = dependents).
- **Partial updates.** A partial priority update reset untouched factors to their defaults. Priority is now recomputed atomically from the persisted document with an aggregation-pipeline update; concurrent updates converge.
- **Decision modes.** Mode weights were displayed but never used. They now drive the ranking, and hard constraints are applied by a separate eligibility layer that no score can override.
- **Execution waves.** BFS "waves" violated dependency order (6,900 of 14,045 edges at V = 5,000). Longest-prerequisite waves violate 0.
- **Kahn sort.** The heap-based sort is about 19× faster at V = 5,000 (10.1 ms vs 189.3 ms) and produces an identical order.
- **Fractional knapsack.** Fractional hours broke the DP: the old code selected 6 of 500 tasks where the exact optimum takes 124. Rounding can no longer exceed capacity (the old `Math.round` let 2 × 2.54 h fill 5 h).
- **Branch and Bound.** It is no longer input-order dependent and is bounded. Capacity constraints are enforced, placeholder members no longer crash it, and every result is labelled exact or approximate. It matches exhaustive search on 150 seeded instances.
- **Search hang (security-relevant).** A 256-character query made the server's Horspool shift table wrap to 0, an infinite loop reachable through socket `task:search`. Non-ASCII text (Kannada, accents, emoji) could also miss real matches. Client and server now share one variant, one normalisation and one fixture.
- **Health scoring.**
  - The requirements dimension is now actually weighted.
  - Quality is evidence-based instead of a near-constant.
  - Missing evidence is reported as missing, never as 100.
  - Severity caps are shown, together with the uncapped score.
- **Benchmarks.** A reproducible benchmark harness was added, and DAA Insights now shows measured (synthetic) results, a correct Execution Waves card, and the guarantee for each algorithm.
- **Intermittent GitHub suite.** Root cause found and fixed: an asynchronous unique-index build race on fresh in-memory databases.

---

## B. Git baseline

| Item | Value |
|---|---|
| Source | `origin/branch2` @ `c11b5b2` (verified; `origin/branch1` = `ccdd7c0`, `origin/main` = `69a5f9a`, all unchanged) |
| Branch | `branch3`. The auto-set upstream to `origin/branch2` was removed immediately so that no push could target branch2. Pushed with `git push -u origin branch3`. |
| Baseline tests (before any change) | unit 51, Jest-compat 51, security 144, integration 20, logic suites all PASS (= Phase 2 results) |
| Code commits | `c5faf0e`, `f9b387b`, `cfbd761`, `a269be5`, `00e1b96`, `f215a86`, `b81400a`, `986c6da` (+ this report) |
| Diff vs branch2 (code) | 46 files, +7,809 / −1,048 (18 added, 28 modified) |

---

## C. Algorithm inventory

| Algorithm | Location | Purpose | Input → Output | Consumers |
|---|---|---|---|---|
| Greedy priority | `algorithms/greedyScheduler.js` | Base priority score | urgency, impact, direct dependents → 0–100 | Task model hooks, `taskGraphService`, Task Intelligence, Scrum/Kanban engines, AI autofill |
| Merge sort (×2) | `greedyScheduler.js`, `taskOptimiser.js`, `client/utils/taskSort.ts` | Stable ordering | tasks + comparator → sorted copy | priority lists, sprint display, client task lists |
| Task Intelligence | `algorithms/taskPriorityEngine.js` | 7-factor ranking + eligibility | tasks + context → ranked tasks with explanations | decision engine, requirement service |
| Decision engine | `algorithms/decisionEngine.js` | Mode-weighted decisions | tasks / members / preferences → recommendation + matrix | `POST /teams/:id/decisions` |
| Graph (DFS, BFS, Kahn, waves, SCC) | `algorithms/graphTraversal.js` | Dependency analysis | tasks → adjacency, order, waves, cycles | graph / execution-order routes, socket topo, Scrum dependency engine, task decomposer |
| Dependency maintenance | `services/taskGraphService.js` | Derived counts + atomic priority | team → persisted counts / scores | Task model hooks, bulk writers |
| 0/1 Knapsack | `algorithms/knapsack.js` (+ `knapsackSprint` wrapper) | Sprint selection | items, capacity → optimal subset | sprint-optimize (REST + socket), recommendation, decision engine, guidance engine |
| Branch and Bound | `algorithms/branchAndBound.js` | Task → member assignment | members, tasks, load → assignments + reasons | `/teams/:id/assign`, socket auto-assign, decision engine |
| Horspool search | `algorithms/stringSearch.js`, `client/utils/boyerMoore.ts` | Task search | text, query → match | socket `task:search`, AI dedup, task decomposer, client task panels |
| Health scoring | `algorithms/healthScoring.js` | Evidence-weighted health | dimensions → score, confidence, caps | unified health, health-v2 |

---

## D. Task-by-task implementation

| # | Original problem (verified) | Root cause | Correction | Key files | Tests | Status | Remaining limitation |
|---|---|---|---|---|---|---|---|
| 1 (D-22) | Greedy factor maxed at 75 | `W_GREEDY·u + W_GREEDY·i + W_GREEDY·0.15·d` | Factor = `computePriorityComponents()·100`; validated, normalised weights (env and override); unrounded contributions; one final rounding with a 1e-9 half-up tolerance | `greedyScheduler.js`, `taskPriorityEngine.js` | min/max, invalid, monotonic, exact-reference grid, Σw·s = score, custom/invalid weights, baseline 75-cap regression | RESOLVED | — |
| 2 (D-20) | `findOneAndUpdate` hook used defaults for untouched factors; routes read-modify-wrote | Score computed from the update payload | Hook removed; post-write atomic aggregation-pipeline recompute from persisted fields; routes write only the supplied fields; validators on PATCH | `models/Task.js`, `taskGraphService.js`, `routes/teams.js`, `socket/taskHandlers.js` | REST & socket partial updates, deadline/unrelated, invalid input, concurrent convergence, `updateMany`, pipeline ≡ JS on 550 inputs | RESOLVED | — |
| 3 (D-21) | Greedy used prerequisite count; Scrum `$inc` drifted; dangling refs counted | Counter = `dependencies.length` everywhere | `dependencyCount` (in-degree) and `dependentCount` (out-degree) derived per workspace after any dependency, archive, delete, insertMany or bulk change; greedy uses dependents; Scrum and Kanban engines use dependents. Writes inside a MongoDB transaction are skipped by the hooks (a recompute outside the session would read pre-commit state and could wait on the transaction's locks); `lifecycleService` recomputes after a successful commit of archive, restore and purge. Read-only backfill plan + opt-in apply CLI for legacy data | `graphTraversal.js`, `taskGraphService.js`, `lifecycleService.js`, writers in 6 files, `scripts/migrations/phase3TaskGraphBackfill.js` | diamond/chain/duplicate/self/missing/random degree tests; diamond via API incl. archive / restore / delete; Scrum re-add; legacy-shaped data archived and restored through the real transactional Trash routes (the test fails without the fix: the count stayed 1); backfill dry run writes nothing, apply corrects | RESOLVED | Recompute is serialised per process; multiple instances converge on the next mutation |
| 4 (D-23) | Mode weights never reached `rankTasks`; matrix showed other numbers | Overrides only rendered | Weights validated and passed into computation; `balanced` = engine defaults (the ranking users actually saw before); invalid custom weights rejected; matrix uses computed factors; eligibility layer (prerequisites, Waterfall phase, Kanban WIP) | `decisionEngine.js`, `taskPriorityEngine.js`, decision route | mode changes ranking with independent recomputation; defaults; invalid weights; hard constraints | RESOLVED | Modes are user-selected, not methodology-derived. WIP constraint honoured when supplied (no caller supplies it yet). |
| 5 (D-25) | BFS first-discovery levels used as waves | Shortest-hop ≠ longest-prerequisite | `executionWaves()` = longest-path levels over the topological order; cycles yield no schedule; ordinary BFS kept for reachability; iterative DFS | `graphTraversal.js`, `taskOptimiser.js`, graph route, Scrum dependency engine | shortcut, empty, single, chain, diamond, multi-root, disconnected, self/multi cycle, 5,000-node DAG, invariant on 25 seeded DAGs | RESOLVED | — |
| 6 (D-31) | `ready.sort()` on every step | Re-sorting | Deterministic binary min-heap (O(E + V log V)); FIFO variant (O(V + E)); Tarjan SCC separates cycle members from downstream-blocked tasks | `graphTraversal.js` | identical order to baseline on 40 seeded DAGs; dense/empty/cycles | RESOLVED | — |
| 7 (D-26) | Fractional effort → `NaN` index; `Math.round` could exceed capacity; 3 copies | Real-valued indices; no rounding policy | One exact solver in 0.01 h units (effort ceil, capacity floor), input policy, tie-break, workload guard with labelled ≥ ½-optimal approximation; dependency-ready candidates only | `knapsack.js`, `taskOptimiser.js`, sprint-optimize (REST + socket) | 2.5 h / 5 h, 0.5 h, exact match, invalid/duplicate, 2 × 2.54 h, float noise, 300 brute-force instances, large input, approximation label; REST fractional + readiness | RESOLVED | Not a precedence-constrained knapsack (readiness filter only) |
| 8 (D-33) | B&B on the first min(n,m) tasks, greedy overflow, no limits, placeholder crash | Input order + no bounds | All tasks in one solver; canonical ordering; hard capacity + balance cap; lexicographic objective; admissible bound; greedy incumbent; node budget / size limit; exact or approximate label; reasons | `branchAndBound.js`, assign route, socket, decision engine | 150 exhaustive comparisons, constraint invariants, permutation invariance, edge cases, 300-task bound, node budget, explanations; route skips placeholders | RESOLVED | Tasks without an estimate consume 0 h; the ⌈n/m⌉ balance cap is a design constraint |
| 9 (D-32) | m = 256 → shift 0 (hang); non-ASCII skipped; client/server differed | 8-bit table, 128/256 alphabet | Horspool with a `Map` shift table on both sides; NFC → lower → NFC; trimmed queries; 512-character limit; shared fixture | `stringSearch.js`, `taskOptimiser.js`, `client/utils/boyerMoore.ts` | 255/256/257/512, edge cases, Unicode, 2,000 seeded `indexOf` comparisons, 27-case shared fixture (both sides), socket bounds + cross-workspace | RESOLVED | Not grapheme-aware (documented) |
| 10 (D-24) | Requirements weight 0; quality ≈ constant; empty project = 100; scope pulled in other projects | Fixed weights summing to 1 without requirements; formula constant | Shared contract: applicable & evidence-backed dimensions, renormalised weights, confidence, caps reported; evidence-based requirements and quality; scope = this project + workspace-level tasks; dangling prerequisites ignored; health-v2 uses the same primitives; panels show "No data" | `healthScoring.js`, both health services, 2 client panels | empty, requirements, weight sum, recomputation, scope / archived / foreign; legacy invariant updated | RESOLVED | Kanban/Scrum-specific health services keep their own formulas (unchanged) |
| 11 | No reproducible measurements; inaccurate guide claims | — | `npm run bench` (seeded, warm-up, medians, instrumented ops, limits, baseline comparison); DAA Insights cards corrected + waves card + illustrative example + benchmark section; Classic guide corrected | `benchmarks/`, `daa-insights.tsx`, `classicGuideData.ts` | reproducibility, valid metadata, truthful labels, no HTTP / DB surface | RESOLVED | Benchmarks are offline (no live per-project timing route, by design) |
| 12 | — | — | 44 unit + 4 benchmark + 17 integration + 5 client tests; GitHub race fixed | `tests/…`, `scripts/…` | see §K | RESOLVED | Live AI and Kanban-gate legacy checks still blocked |

---

## E. Mathematical formulas

- **Greedy priority.**
  - Normalisation: `u = (clamp(urgency,1,5) − 1)/4`, `i = (clamp(impact,1,5) − 1)/4`, `d = min(dependents, 20)/20`.
  - Score: `score = round(100·(0.50u + 0.35i + 0.15d) + 1e-9)`.
  - Weights are validated (finite, ≥ 0, Σ > 0) and normalised to Σ = 1.
  - Missing or non-finite inputs take the minimum (1, 1, 0).
  - Exactly: `score = ⌊(50(U−1) + 35(I−1) + 3D + 2)/4⌋`.
- **Task Intelligence.**
  - `raw = Σ_k w_k·s_k` with `s_k ∈ [0,100]` and Σw = 1; `score = round(raw)`.
  - Factors: greedy, deadline, value, risk, depth = `min(downstreamReach, 20)/20·100`, skillGap, overload. "No data" values are the documented neutral 50s.
  - Ranking order: eligible tasks first → score → greedy raw → title → id (code-unit comparison).
- **Mode weights** (normalised; `balanced` = engine defaults):
  - `balanced`: greedy .35, deadline .20, value .15, risk .10, depth .10, skillGap .05, overload .05
  - `fast_delivery`: deadline .30
  - `high_impact`: value .30
  - `unblock_dependencies`: depth .25
  - `reduce_risk`: risk .35
- **Dependency levels.** `level(v) = 0` if v has no prerequisites; otherwise `max_{u→v}(level(u) + 1)`. Computed in topological order.
- **Knapsack.** `max Σ v_i x_i` subject to `Σ ⌈100·e_i⌉ x_i ≤ ⌊100·C⌋`, with `x_i ∈ {0,1}`. DP `dp[w] = max(dp[w], dp[w − w_i] + v_i)`. Ties keep the smaller total effort.
- **Assignment.**
  - Cost: `cost(i,j) = Σ_k max(0, demand_jk − skill_ik)`.
  - Objective: minimise `cost + BIG·unassigned`.
  - Constraints: `Σ_j hours_j x_ij ≤ capacity_i − load_i` and `Σ_j x_ij ≤ ⌈n/m⌉`.
  - Lower bound: `costSoFar + Σ_remaining min_{feasible i} cost(i,j)`.
- **Health.**
  - `Health = Σ_{d∈A} (w_d/Σ_{A} w)·s_d`, where A = applicable ∩ evidence-backed dimensions.
  - Base weights: delivery .16, schedule .13, capacity .13, dependencies .12, risk .11, skill .09, requirements .10, process .08, quality .08.
  - Confidence = `Σ_A w / Σ_applicable w`.
  - Caps (45 / 48 / 54) are applied after weighting and reported.
  - Requirements = baselined / non-rejected.
  - Quality = mean of available sub-signals: definition-of-done coverage, and the verification rate of implemented requirements.

---

## F. Complexity analysis

| Algorithm | Previous (verified in original code) | New | Constraints / policy | Exact? |
|---|---|---|---|---|
| Kahn topological sort | O(Σ R log R) re-sort per step, worst O(V² log V) | O(E + V log V) heap; O(V + E) FIFO | deterministic smallest-id | exact |
| Execution waves | O(V + E) but **incorrect** (BFS levels) | O(E + V log V) | cycle → no schedule | exact |
| DFS / BFS | O(V + E), DFS recursive (stack-depth risk) | O(V + E), DFS iterative | — | exact |
| Task Intelligence rank | O(n·E) depth scan + O(n log n) | O(V + E) + O(V·(V+E)) reach (≤ 2,000 tasks, else neutral) + O(n log n) | — | exact |
| 0/1 Knapsack | O(n·C) on raw values (fractional broken) | O(n·W), W = 100·C (pseudo-polynomial, not polynomial in bit length); space O(W) + n·W bytes | exact if n·(W+1) ≤ 20M cells, else greedy/best-single (≥ ½ optimum) | exact within limit |
| Branch and Bound | exponential on min(n,m) tasks, no limit; overflow greedy | O(mⁿ) worst (pruning does not change the bound) | exact if ≤ 16 tasks and ≤ 200k nodes; else incumbent / local search, labelled | exact within limit |
| Horspool | O(n·m) worst; **non-terminating for m ≥ 256** | O(n·m) worst, ≈ n/m typical; O(m) preprocessing; O(min(m,σ)) space | query ≤ 512 | exact (code units) |
| Merge sort | O(n log n) | unchanged | stable | exact |

---

## G. Benchmark results (measured; synthetic seeded data)

**Environment:** Node v24.20.0, Windows 11 (10.0.26300), x64, Intel i5-1345U (12 logical CPUs).
**Method:** seed 20261125; 3 warm-ups, 11 repetitions; median shown (p90/min/max in `server/benchmarks/results/daa-benchmarks.json`). "Before" is the frozen pre-Phase-3 code on the identical dataset.

| Algorithm | Size | Now (median) | Before (median) | Measured operations / correctness |
|---|---|---|---|---|
| Kahn | V=500, E=1,453 | 2.11 ms | 3.72 ms | heap ops 3,844; same order ✔ |
| Kahn | V=2,000, E=5,535 | 4.68 ms | 30.0 ms | heap ops 19,070; same order ✔ |
| Kahn | V=5,000, E=14,045 | 10.08 ms | 189.3 ms | heap ops 53,394; same order ✔ |
| Kahn | V=10,000, E=28,262 | 25.25 ms | not run (quadratic) | heap ops 115,754 |
| Execution waves | V=5,000 | 25.2 ms | — | violations: now 0, old BFS levels 6,900 / 14,045 |
| Execution waves | V=10,000 | 60.9 ms | — | violations: now 0, old 14,210 / 28,262 |
| DFS / BFS | V=10,000 | 31.7 / 10.4 ms | — | edges examined 28,262 (= E) |
| Task Intelligence | n=100 / 500 / 1,000 | 2.64 / 16.5 / 22.3 ms | 1.51 / 19.2 / 78.8 ms | new engine also computes downstream reach |
| Merge sort | n=1k / 10k / 50k | 1.0 / 34.4 / 240.6 ms | (built-in TimSort 1.4 / 25.4 / 256.7 ms) | stable |
| Knapsack (integer) | n=500, C=200 | 0.85 ms | 3.34 ms | 100,500 cells; same optimum ✔ |
| Knapsack (fractional) | n=500, C=200 h | 81.5 ms | — | 10,000,500 cells; selected 124 vs old 6 |
| Knapsack (fractional) | n=200, C=80 h | 13.4 ms | — | selected 51 vs old 4 |
| B&B | 8 tasks × 8 members | 0.34 ms | 0.91 ms | nodes 106 / pruned 351; same cost 7 |
| B&B | 12 tasks × 4 members | 0.25 ms | 0.08 ms | nodes 86; cost 15 vs 7. **Not comparable:** the old overflow ignored capacity and balance |
| Horspool (absent) | 1M chars, m=8 / 64 / 255 | 6.02 / 0.94 / 0.34 ms | 8.07 / 8.36 / 7.90 ms | comparisons 125,000 / 15,625 / 3,921 (native `indexOf` 0.31 / 0.41 / 0.26 ms) |

No improvement percentages beyond these measured medians are claimed. The old implementation is not timed on inputs it cannot process correctly.

---

## H. Forensic finding resolution

| Finding | Status | Evidence |
|---|---|---|
| D-20 partial-update reset | **RESOLVED** | REST/socket/concurrency/`updateMany`/pipeline-parity tests |
| D-21 fan-in confusion | **RESOLVED** | degree tests, diamond via API, Scrum drift test |
| D-22 greedy cap | **RESOLVED** | 100 reachable; exact grid reference; baseline reproduces 75 |
| D-23 mode weights unused | **RESOLVED** | mode-sensitive ranking with independent recomputation |
| D-24 health weighting / quality | **RESOLVED** | health integration tests; legacy invariant updated with justification |
| D-25 BFS waves | **RESOLVED** | invariant tests; benchmark violation counts |
| D-26 fractional knapsack | **RESOLVED** | 300 brute-force comparisons; REST fractional test |
| D-31 Kahn re-sorting | **RESOLVED** | identical order + timings |
| D-32 Boyer–Moore overflow / Unicode | **RESOLVED** | 255–512 tests, shared fixture, socket bound |
| D-33 B&B bias / limits | **RESOLVED** | exhaustive comparison, permutation, bounds |

**Additional fixes, directly related to the above:**
- Search hang via `task:search`.
- Placeholder-member crash in assignment.
- Unbounded socket `sprintCapacity`.
- Health scope leaking other projects' tasks.
- Dangling prerequisites blocking forever (health, recommendation).
- REST PATCH missing validators and racing `stateVersion`.
- Derived-field hooks deferring correctly inside Phase 2 lifecycle transactions (found in final review).
- Health summary now names the weakest evidence-backed dimensions instead of a generic capacity/dependency message.
- `localeCompare` tie-breaks replaced with code-unit comparison (ICU-independent).

---

## I. Methodology integration

- **Classic.**
  - Task Intelligence ranking, merge-sort ordering and search.
  - Dependency graph: waves, Kahn order, cycle diagnostics.
  - Sprint optimizer: exact fractional knapsack over dependency-ready tasks.
  - Branch and Bound assignment.
- **Waterfall.**
  - The decision engine receives the active phase; out-of-phase tasks are ineligible regardless of score.
  - Existing server-side phase-gate enforcement on status changes is untouched.
  - Health applies the requirements dimension.
- **Scrum.**
  - Backlog priority "dependency importance" uses dependents.
  - The dependency analysis exposes real cycle members and blocked-by-cycle tasks, and never presents a partial order as complete.
  - Sprint/assignment paths use the corrected solvers.
  - `$inc` counter drift is removed.
- **Kanban.**
  - The priority engine's blocking count uses `dependentCount`.
  - A WIP constraint is supported by the eligibility layer when supplied.
  - Kanban stays gated for new projects; it was verified only through isolated legacy suites (`testKanbanV4FullSuite` PASS).
- **Hybrid.**
  - Backend unchanged apart from the shared engines (`testHybridV4` PASS).
  - Health treats Hybrid as requirements-applicable.
  - No Hybrid UI was added.

---

## J. Explainability

**Priority results include:**
- `rawScore`, the effective `weights`, `weightSource`, factor `score` / `weight` / `contribution`, the greedy normalised inputs, downstream reach, `eligible` and `constraints[]`.

**Decision results include:**
- `effectiveWeights`, `weightSource`, `weightErrors`, and a matrix built from the computed factors.

**Graph API:** returns `wavesResult`, `graphConvention`, and diagnostics for self-loops and missing references. Kahn also reports heap operations, edges examined, cycles and blocked-by-cycle tasks.

**Knapsack results include:**
- `exact`, `optimality`, `effortUnit`, DP cells, per-task selection reasons, and readiness exclusions.

**Assignment results include:**
- Per task: matched skills, skill gaps, hours after assignment, capacity and task count.
- Unassigned reasons.
- Meta: `exact`, `terminationReason`, nodes explored/pruned, lower bound, capacity utilisation, and unavailable members.

**Health results include:**
- `confidence`, `evidenceCoverage`, `effectiveWeights`, per-dimension `effectiveWeight` / `contribution`, `excludedDimensions`, `uncappedScore` and `appliedCaps`.
- The panels render all of these and show "No data" instead of a fabricated value.

**DAA Insights:**
- Corrected complexity and guarantee cards.
- New Execution Waves card.
- Illustrative BFS-vs-waves example (labelled).
- Measured synthetic benchmark bars (labelled, with environment and method).

---

## K. Testing results (commands actually run on the final code)

| Check | Result |
|---|---|
| `server: npm test` | **PASS**. Unit 99/99 (51 existing + 44 DAA + 4 benchmark), Jest-compat 51/51, Security 144/144, Integration 39/39 (20 + 19 Phase 3), logic: TaskPriorityEngine 54/54, ScrumV4 11/11, LocalAICore 30/30, DomainMethodology 17/17, ReactKeyDedup 8/8, Fixes1to5Logic PASS |
| Final re-run after the transaction / backfill / summary fixes | `npm test` all PASS (above); Phase 3 integration + Phase 2 lifecycle 32/32; targeted legacy 10/10 (TeamHealth, RiskEngine, Workstreams21to25, KanbanV4, ScrumBulkAccept, HybridV4, GitHub suite, Workstream27, DeleteWorkspace live, V3UiFunctional live); client 17/17; tsc 0 |
| Legacy isolated (81 scripts, concurrency 4) | 64 PASS, 2 FAIL (live-AI only), 15 BLOCKED (live-API scripts → run below) |
| Legacy live-API (15 scripts) | 14 PASS, 1 FAIL (Kanban creation gate) |
| Legacy overall | **78 / 81 PASS**; 3 BLOCKED with justification (`testMasterCorrections` 2 checks + `testNexusflowAiHub` 1 check need a live free-tier AI provider; `auditKanbanEndToEnd` needs Kanban enabled for new projects, deliberately not enabled) |
| Intermittent `testGitHubOAuthBackendHardeningSuite` | **FIXED**. 12/12 concurrent self-runs passed (not self-interference); the runner was improved to capture the failing assertion, which then showed the unique-index race; the fix awaits `GitHubIntegration.init()`; PASS in the full parallel run |
| Legacy expectation changes (justified inline) | `testWorkstreams21to25Suite` (empty project must not score 100, per D-24); `testRiskEngine` (fixture uses a real prerequisite because counts are derived, per D-21) |
| Seeded / property tests | seeds 5–500 and 20261125: greedy grid, ranking permutation, sort stability, degrees, waves invariant, Kahn ≡ baseline, knapsack ≡ brute force ×300, B&B ≡ exhaustive ×150, Horspool ≡ `indexOf` ×2,000 (server) + ×1,500 (client) |
| `client: npm test` | **PASS** 17/17 (12 merge sort + 5 search incl. shared fixture) |
| `client: npx tsc --noEmit` | **PASS** (0 errors) |
| `client: npx expo export --platform web` | **PASS** |
| `node --check` on all server algorithm/service/route/socket/model/benchmark files | **PASS** |
| `npm run bench` | **PASS**: 41 measured rows |
| Browser (headless Chrome, device emulation) | **PASS**: DAA Insights at 320/375/768/1024/1440 (no horizontal overflow, 0 broken images); Project Health panel at 375/1440 (3 of 9 dimensions scored, weights 39 + 32 + 29 = 100 %, six "No data / excluded" with reasons, confidence low); dashboard and login logo rendered. Pre-existing and not changed: the workspace header title overlaps at 375 px. The local demo server was later stopped by the environment for low memory, so the grounded-summary fix was verified by tests, not by screenshot. |
| `npm audit --omit=dev` (server) | 0 vulnerabilities |
| Secret scan of the branch3 diff | **PASS** (no keys, URIs, `.env`, logo page or logs) |
| **NOT RUN** | live AI providers, live SMTP/Google, native iOS/Android builds, multi-instance deployment |

**New automated tests in Phase 3:** 72 (48 unit, 19 integration, 5 client).

---

## L. Data and API compatibility

- **Schema.**
  - New `Task.dependentCount` (default 0).
  - `dependencyCount` keeps its name; it is now the derived prerequisite count.
  - Existing production documents keep the old prerequisite-based `dependencyCount` and old-formula `priorityScore` (which list ordering sorts on) until a graph or priority mutation in that workspace triggers a recompute. **A dormant workspace keeps the D-21-biased order indefinitely**, so a backfill is required.
  - `node scripts/migrations/phase3TaskGraphBackfill.js` is a **dry run by default**: per workspace, how many tasks would change counts or scores (ids only, no writes). `--apply` writes. It was tested only against the in-memory replica set and **not run against any real database**. Recommended order: back up, dry run, review, then apply in a maintenance window.
  - Lifecycle transactions: derived fields are recomputed after commit (archive, restore, purge).
- **Greedy API.** `computePriorityScore({ urgency, impact, dependentCount })`. The old `dependencyCount` argument is no longer read.
- **New response fields (additive).**
  - priority `rawScore` / `weights` / `eligible` / `constraints`
  - decision `effectiveWeights` / `weightSource`
  - graph `wavesResult` / `graphConvention`
  - sprint-optimize `exact` / `optimality` / `effortUnit` / `dpCells`
  - assign `unassigned`, `explanation`, extended `meta`
  - health `confidence` / `evidenceCoverage` / `uncappedScore` / `appliedCaps` / `effectiveWeights` / `excludedDimensions` and per-dimension `effectiveWeight` / `contribution`
- **Behaviour changes.**
  - Health `overallScore` and dimension `score` can be `null` (`INSUFFICIENT_DATA` / `NOT_APPLICABLE`).
  - Scrum `topologicalOrder` is `[]` on a cycle (`partialOrder` provided).
  - Sprint optimizers exclude tasks with unfinished prerequisites.
  - Assignment can leave tasks unassigned when capacity is exhausted.
  - Search queries are trimmed and NFC-normalised.
  - Decision `balanced` = engine default weights.
- **Configuration.**
  - Existing `GREEDY_W_*` and `PRIORITY_W_*` are now validated; invalid values fall back to defaults with a warning.
  - New `npm run bench`.
  - No new environment variables are required.

---

## M. Remaining work (Phases 4–5)

- **Phase 4 (AI and integrations).**
  - D-27 OmniRoute latency budget and retired models.
  - Native Google sign-in.
  - AI-vs-deterministic plan provenance.
  - Teacher-review faculty guard.
  - AES-256-GCM GitHub credential migration (D-30).
  - Live free-tier AI checks in legacy suites.
- **Phase 5 (platform).**
  - D-14 `/health` endpoint and DB fail-fast.
  - Distributed coordination for `taskGraphService` and rate limits when scaling out.
  - Batched purge.
  - CI workflow.
  - Expo SDK major upgrade (58 client advisories).
  - Splitting monolithic route files.
  - Strict TypeScript.
- **DAA follow-ups (documented, optional).**
  - Precedence-constrained sprint optimisation.
  - Hungarian algorithm for large exact assignment.
  - Grapheme-aware search.
  - Methodology-derived default modes.
  - Kanban WIP context from the WIP service in the decision route.

---

## N. Updated engineering assessment (evidence-based)

| Area | Score | Reason |
|---|---|---|
| Architecture | 7/10 | Canonical graph, knapsack, search and health modules replace duplicates; routes remain large |
| Security | 7/10 | Search hang and unbounded capacity input closed; Phase 1/2 suites green; client deps still blocked by majors |
| Authentication | 7/10 | Unchanged from Phase 2 (live providers unverified) |
| Database integrity | 7.5/10 | Derived counts + atomic priority recompute; per-process serialisation only |
| DAA correctness | 8.5/10 | All ten findings resolved and reference-verified; documented modelling limits |
| DAA performance | 8/10 | Kahn ~19× at V=5,000; bounded B&B / knapsack workloads; measured |
| Explainability | 8/10 | Factor, weight, constraint, optimality and evidence metadata end-to-end |
| Frontend UX | 7/10 | Honest health "No data", improved DAA Insights; native builds not checked |
| Backend reliability | 5.5/10 | No health endpoint or DB fail-fast yet |
| AI reliability | 6/10 | Unchanged; deterministic results never depend on AI |
| Testing | 8/10 | 331 node:test server tests + logic suites + 17 client; reference and property testing; no CI |
| Scalability | 4.5/10 | In-process recompute serialisation and rate limiting |
| Production readiness | 5/10 | **Not production-ready**: live services unverified, Phase 4–5 items open |
