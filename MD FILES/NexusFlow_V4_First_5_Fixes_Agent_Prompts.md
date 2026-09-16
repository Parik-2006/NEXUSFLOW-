# NexusFlow V4.0 — First 5 Fixes
## Implementation Prompts for Antigravity / Coding Agent

**Purpose:** Five implementation prompts derived from the current V4 Part 2 audit. Execute them one by one, in order.

**Execution rule:** For every fix, inspect the existing code first, implement the change, run focused tests, fix failures, rerun, then run relevant regression tests. Do not rebuild already-working Classic, Waterfall, Scrum, or Kanban functionality.

---

# FIX 1 — Immediate Foundation Bugs

## Objective
Fix the four concrete defects identified by the V4 Part 2 audit:
1. Add `groq` to the `AIMessage` provider enum.
2. Align risk-engine category strings with the canonical test vocabulary.
3. Expand the canonical skill taxonomy.
4. Fix duplicate task creation in task decomposition.

## Agent Prompt

```text
You are implementing FIX 1 for NexusFlow V4.

First inspect the complete existing codebase and relevant tests. Do NOT redesign working modules and do NOT rebuild Waterfall, Scrum, Kanban, Classic, DAA, Project Memory, or Traceability.

Implement all four fixes:

1. AIMessage provider enum
- Inspect models/AIMessage.js.
- Add "groq" to the provider enum while preserving valid existing providers.
- Check all AIMessage reads/writes for consistency.
- Preserve the intended AI cascade:
  Gemini -> Groq -> OpenRouter -> graceful AI failure.
- Never use DAA as an AI fallback.

2. Risk category mismatch
- Inspect server/riskEngine.js and the relevant tests.
- Identify the exact category mismatch.
- Align implementation with the canonical vocabulary already used by NexusFlow.
- Do not weaken tests merely to make them pass.
- Preserve risk calculation semantics.

3. Canonical skill taxonomy
- Inspect server/routes/skills.js, skill models, routes, UI and tests.
- Expand the canonical taxonomy to cover the V4 roadmap's broad software, database, cloud, AI/ML, cybersecurity, blockchain/Web3, design/UI/UX and related technical categories.
- Preserve existing canonical IDs/names where possible.
- Prevent duplicate canonical skills.
- Roles may recommend skills but must not hard-whitelist them.
- Preserve self-only skill verification permissions.
- Add tests for completeness and uniqueness.

4. Task decomposition deduplication
- Inspect server/taskDecomposer.js and all callers.
- Reproduce the duplicate-task issue.
- Make repeated decomposition requests idempotent for the same logical decomposition.
- Prevent duplicate TODO/PLANNED tasks while preserving legitimate distinct tasks.
- Preserve dependencies, project ownership and history/audit behavior.
- Do not disable decomposition.

Testing:
- Run focused tests for all four fixes.
- Run Risk, Skill, Task Decomposition, Task Intelligence and AI/Project Intelligence regressions.
- Run relevant V4 regression suites.
- Run frontend TypeScript checks.
- Fix root causes and rerun failures.

Final report:
- Files changed
- Changes for each fix
- Tests and PASS/FAIL counts
- Remaining issues
- Confirmation DAA remains independent of AI
- Confirmation existing methodologies remain intact
```

## Definition of Done
- `AIMessage.provider` accepts `groq`.
- Risk categories are consistent.
- Canonical skills are expanded and deduplicated.
- Task decomposition is idempotent.
- DAA and existing methodology environments remain intact.
- Tests are executed and failures are fixed.

---

# FIX 2 — Task Intelligence 2.0 Hardening

## Objective
Make Task Intelligence 2.0 the centralized deterministic and explainable source for canonical task priority.

## Agent Prompt

```text
You are implementing FIX 2 for NexusFlow V4.

Inspect the existing Task Intelligence implementation, especially:
- server/algorithms/taskPriorityEngine.js
- task models/routes/controllers
- planning/scheduling code
- priority tests
- UI consumers.

Do not replace deterministic priority with AI.

Requirements:

1. Centralize task priority in one canonical engine. Remove duplicated formulas from routes/controllers/frontend where practical.

2. Support the roadmap factors where data exists:
- criticality
- business value / impact
- urgency
- deadline pressure
- dependency count
- blocking potential
- risk
- effort
- expected value
- technical uncertainty
- teacher importance
- milestone importance
- team capacity
- skill availability
- critical path
- workload
- methodology constraints

Do not invent fake values when data is unavailable.

3. Determinism:
- Same task/project/team state produces the same result.
- No LLM call is required.
- No randomness.

4. Explainability:
Return factor-level contribution/explanation data so users can understand the priority.

5. Methodology awareness:
Respect Waterfall, Scrum and Kanban semantics through the methodology engine/configuration layer. Do not copy one methodology's rules into another.

6. Reactive compatibility:
Allow reactive planning to consume the canonical priority engine without creating a second planner.

7. Preserve existing API contracts where possible.

Testing:
- Run the full Task Intelligence suite.
- Test repeatability.
- Test factor explanations.
- Test missing deadlines, no dependencies, zero effort, high risk, blocked tasks, critical-path tasks and unavailable skills/capacity.
- Run Waterfall/Scrum/Kanban regression tests.
- Run TypeScript checks.
- Fix and rerun all failures.

Final report:
- Files changed
- Factors implemented
- Priority/explanation behavior
- Tests/PASS/FAIL
- Confirmation AI does not determine canonical priority
- Regression result
```

## Definition of Done
- One canonical deterministic priority engine.
- Priority is explainable factor-by-factor.
- AI is not the source of canonical priority.
- Methodology constraints remain respected.
- Reactive planning can consume the engine.
- Existing methodology suites pass.

---

# FIX 3 — Reactive Greedy + Planning Re-Merge

## Objective
Ensure meaningful project-state changes trigger safe recalculation without destroying completed or active work.

## Agent Prompt

```text
You are implementing FIX 3 for NexusFlow V4.

Inspect:
- reactive planning engine
- greedy scheduler/planner
- task mutation routes
- dependency logic
- team capacity
- planning/version fields
- Socket.IO events
- Waterfall/Scrum/Kanban planning flows
- reactive tests.

Do not create a second planning architecture.

Implement/harden the existing reactive planning + greedy re-merge system.

1. Meaningful triggers
Handle existing planner inputs such as:
- task creation/deletion
- priority change
- status change
- dependency change
- effort change
- deadline change
- risk/criticality change
- team/capacity change
- skill availability change
- methodology state change
- milestone/phase changes.

Do not recalculate on irrelevant UI changes.

2. Versioning
Preserve or implement clear stateVersion, greedyVersion and planningVersion (or the existing equivalent).

3. Recalculation
On a meaningful trigger:
- invalidate affected derived results
- recalculate priority where needed
- recalculate allocation/planning
- regenerate affected plan data
- emit appropriate realtime updates.

4. Safe re-merge:
- DONE tasks remain DONE.
- IN PROGRESS tasks remain unless explicit replanning changes them.
- TODO/PLANNED tasks may be re-merged.
- Preserve history/audit records.
- Never silently move completed work backward.

5. Methodology isolation:
- Waterfall keeps phase gates/phase semantics.
- Scrum keeps sprint semantics.
- Kanban keeps WIP/policy/flow semantics.
- Classic remains stable.
- Do not force one methodology's planning rules into another.

6. Stale-result safety:
A late planner result must not overwrite newer state. Use version checks or equivalent protection.

7. Realtime:
Emit relevant state/planning events without duplicate socket listeners.

Testing:
- Run all reactive planning tests.
- Test each important trigger.
- Test DONE and IN PROGRESS preservation.
- Test TODO/PLANNED re-merge.
- Test stale-version rejection.
- Test rapid/concurrent mutations.
- Test Socket.IO behavior where covered.
- Run Waterfall/Scrum/Kanban regression suites.
- Run TypeScript checks.
- Fix and rerun.

Final report:
- Trigger matrix
- Versioning behavior
- Preservation rules
- Recalculation behavior
- Realtime behavior
- PASS/FAIL counts
- Remaining edge cases
```

## Definition of Done
- Meaningful changes trigger correct recalculation.
- Stale results cannot overwrite newer state.
- DONE work is preserved.
- IN PROGRESS work is preserved unless explicitly replanned.
- TODO/PLANNED work can be re-merged.
- Methodologies remain isolated and functional.
- Realtime updates work correctly.

---

# FIX 4 — Requirement → Task → Dependency → Test → Evidence Traceability

## Objective
Strengthen the traceability chain so requirements can be followed through implementation and verification.

## Agent Prompt

```text
You are implementing FIX 4 for NexusFlow V4.

Inspect the existing:
- requirement model/routes
- task model/routes
- dependency logic
- test/evidence structures
- traceability services/routes
- project history/events
- frontend traceability UI
- traceability tests.

Do not replace working architecture.

Goal:
Requirement -> Task(s) -> Dependency -> Test/Verification -> Evidence -> Coverage/State

Requirements:

1. Preserve existing requirement fields such as source, mandatory/optional status, priority, coverageState, taskIds and evidence references.

2. Requirements and tasks must be project-isolated.

3. Dependency relationships must be represented without duplicate records and must respect methodology-specific semantics.

4. A task existing is NOT proof that a requirement is verified.

5. Evidence must be explicit and real. Never fabricate evidence.

6. Preserve canonical coverage states and logically valid transitions.

7. Harden existing APIs for:
- requirement coverage
- evidence
- traceability state
- requirement/task relationships
- task/requirement relationships.

8. Preserve audit/history.

9. Ensure the UI reflects actual backend state and does not use hardcoded/fake graphs.

Testing:
- Run the complete traceability suite.
- Test full-chain creation.
- Test partial coverage.
- Test missing evidence.
- Test invalid cross-project links.
- Test duplicate links.
- Test evidence/state transitions.
- Test authorization/isolation.
- Run Master Corrections/security regressions.
- Run TypeScript checks.
- Fix and rerun failures.

Final report:
- Traceability model/flow
- APIs changed
- UI changes
- Security/isolation checks
- PASS/FAIL counts
- Example verified test chain
- Remaining limitations
```

## Definition of Done
- Requirement → Task → Dependency → Test → Evidence is traceable.
- Coverage reflects actual evidence.
- No fabricated verification.
- Cross-project access is blocked.
- Duplicate links are prevented/handled.
- History remains intact.
- Tests pass.

---

# FIX 5 — Project Memory + Persistent Context

## Objective
Strengthen Project Memory and Context while keeping permanent memory separate from temporary Copilot context.

## Agent Prompt

```text
You are implementing FIX 5 for NexusFlow V4.

Inspect the existing:
- ProjectMemory model
- memory routes/services
- context builder
- Project/Team models
- Project AI/Copilot integration
- chat implementation
- event/history data
- memory tests
- authorization logic.

Do not create a second memory system.

1. Persistent memory
Use the existing memory architecture and categories. Preserve project ownership and authorization.

Persistent memory can contain useful project facts such as:
- project decisions
- requirements/context
- architecture information
- methodology information
- important constraints
- other canonical memory categories already defined.

Do NOT automatically persist every chat message.

2. Temporary context
Keep temporary in-chat Copilot context separate from permanent Project Memory.
Temporary context must not silently become permanent memory.

3. Context builder
Provide relevant project context to Copilot without:
- cross-project leakage
- cross-team leakage
- unrelated user data
- accidental global memory.

4. Scope
Enforce project-scoped memory, temporary interaction context and existing authorization rules.

5. Confidence/lifecycle
Preserve existing confidence, lifecycle and index semantics. Prevent stale/archived memory from silently dominating current project truth.

6. Retrieval
Keep context bounded and relevant. Do not dump the entire memory database into every AI request.

7. AI architecture
Project Memory provides context to AI; it does NOT replace DAA.

The AI cascade remains:
Gemini -> Groq -> OpenRouter -> graceful AI failure.

If all AI providers fail:
- Copilot fails gracefully.
- DAA and deterministic project logic continue working.

8. Attachments
Inspect current attachment support. If temporary attachment parsing/multimodal processing is still missing, do not fake it. Implement only what belongs in this fix and document the remaining gap.

9. Security
Test project isolation, unauthorized memory access, member/leader/manager permissions according to existing rules, deletion/archival behavior and stale memory handling.

10. UI
Memory/context controls must represent actual backend state. No mock memory entries.

Testing:
- Run the complete Project Memory suite.
- Test persistent memory lifecycle.
- Test temporary-context isolation.
- Test context-builder project scoping.
- Test unauthorized access.
- Test stale/archived memory.
- Test Copilot context injection.
- Test AI-provider failure without breaking DAA.
- Run traceability/security regressions.
- Run TypeScript checks.
- Fix and rerun failures.

Final report:
- Memory architecture
- Persistent vs temporary behavior
- Context-builder behavior
- Authorization/isolation checks
- AI/DAA separation
- PASS/FAIL counts
- Remaining attachment/multimodal limitation
```

## Definition of Done
- Persistent Project Memory works.
- Temporary context is separate from permanent memory.
- Context is project-scoped and authorization-safe.
- Copilot receives relevant bounded context.
- AI failure does not break DAA.
- No automatic storage of every chat/upload.
- Tests pass.

---

# Execution Order

Execute strictly:

1. FIX 1 — Immediate Foundation Bugs
2. FIX 2 — Task Intelligence 2.0
3. FIX 3 — Reactive Greedy + Planning Re-Merge
4. FIX 4 — Requirement Traceability
5. FIX 5 — Project Memory + Persistent Context

After each fix:
- implement
- test
- diagnose failures
- fix
- retest
- run relevant regression tests
- report result

After all five:
- run the complete available V4 regression set
- run TypeScript checks
- confirm Classic, Waterfall, Scrum and Kanban remain functional
- confirm Hybrid remains WIP if not implemented
- confirm DAA remains deterministic and independent of AI
- provide one final summary.

---

# Architecture Rules

1. **DAA is deterministic.** AI must not silently replace DAA.
2. **AI is advisory/explanatory.** Cascade: Gemini -> Groq -> OpenRouter -> graceful failure.
3. **Hard $0 AI policy.** Preserve free-tier routing.
4. **Do not rebuild completed methodologies.**
5. **Hybrid remains WIP unless explicitly implemented later.**
6. **Human control is preserved.** Recommendations must not silently mutate project state.
7. **History must be preserved.**
8. **Project isolation is mandatory.**
9. **No fake UI or fake metrics.**
10. **Testing is part of implementation.**

---

# Expected Final Agent Report

| Fix | Area | Implementation | Tests | Result |
|---|---|---|---:|---|
| 1 | Foundation bugs | Complete/Partial | X/Y | PASS/FAIL |
| 2 | Task Intelligence 2.0 | Complete/Partial | X/Y | PASS/FAIL |
| 3 | Reactive Planning | Complete/Partial | X/Y | PASS/FAIL |
| 4 | Traceability | Complete/Partial | X/Y | PASS/FAIL |
| 5 | Project Memory | Complete/Partial | X/Y | PASS/FAIL |

Also report:
- Total tests run
- Total PASS
- Total FAIL
- Total BLOCKED
- TypeScript result
- Regression result
- Remaining known issues
- Files changed
- DAA/AI separation confirmation
- Methodology isolation confirmation

**End of implementation prompt document.**
