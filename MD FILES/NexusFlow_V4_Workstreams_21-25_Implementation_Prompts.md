# NexusFlow V4 — Workstreams 21–25
## Detailed Implementation Agent Prompts + Master Execution Prompt

This document defines the next V4 implementation layer after Workstreams 16–20.

### Scope
21. Project Learning Loop
22. Capability Intelligence + Dynamic Team Assignment
23. Explainable Decision Intelligence
24. Project Health 2.0 + Early Warning System
25. Unified V4 UI/UX + Browser Verification

---

# 0. GLOBAL EXECUTION RULES

Before changing code, inspect the complete repository and all existing V3/V4 architecture.

Inspect, at minimum:
- V3/V4 architecture and current project shell
- Classic, Waterfall, Scrum, Kanban and Hybrid implementations
- methodology engine
- DAA algorithms and Task Priority 2.0
- Reactive Greedy
- Traceability
- Project Memory and Temporary Context
- Process Mining and Workflow Conformance
- Teacher Review, Academic Evaluation and Fair Contribution
- Copilot Attachments and Multimodal Copilot
- Domain Intelligence and Domain × Methodology resolver
- Local AI abstraction
- Project Health, risks, dependencies, notifications
- ProjectEvent and Socket.IO
- authentication, authorization and project isolation
- frontend routing and current design system

## Non-negotiable rules

1. Preserve existing V3 production behavior.
2. Preserve Classic, Waterfall, Scrum, Kanban and Hybrid.
3. Do not duplicate existing models/services/routes when an equivalent already exists.
4. DAA remains deterministic, reproducible and explainable.
5. AI remains advisory/explanatory.
6. AI must never silently mutate deterministic project state.
7. Never silently reassign users, change deadlines, change methodology, change dependencies, change priority, close blockers or modify grades.
8. Never automatically grade students or decide contribution disputes.
9. Simulations are non-destructive until explicitly accepted.
10. Temporary context never becomes Project Memory without explicit promotion.
11. Every endpoint requires authentication, authorization and project/team isolation.
12. Reuse ProjectEvent for auditable state changes.
13. Preserve the existing free AI cascade: Gemini → Groq → OpenRouter :free → graceful failure.
14. Local AI remains optional and disabled by default unless explicitly configured.
15. Do not select/deploy a local model merely to claim completion.
16. Never fabricate lessons, metrics, capability evidence, health signals, academic results or contribution conclusions.
17. Historical evidence must remain distinguishable from current state.
18. Every derived metric needs a deterministic definition and documented missing-data behavior.
19. Every recommendation must expose its evidence/factors.
20. Execute the entire cycle: INSPECT → DESIGN → IMPLEMENT → TEST → FIX → RETEST → INTEGRATE → REGRESSION → SECURITY → DATABASE → API → SOCKET.IO → BUILD → BROWSER VERIFY → REPORT.

Do not stop after writing source code.

---

# WORKSTREAM 21 — PROJECT LEARNING LOOP

## Purpose

Create an evidence-based learning layer that extracts reusable lessons from completed project activity.

The system may learn from:
- planned vs actual duration
- completed tasks
- sprints/releases
- Waterfall phases
- Kanban flow
- Hybrid transitions
- retrospectives
- risks and blockers
- dependencies
- process deviations
- conformance results
- teacher/faculty feedback
- academic evaluation evidence
- contribution evidence
- approved human decisions
- useful what-if outcomes
- historical completed projects

Separate:
RAW EVIDENCE → DERIVED OBSERVATION → LESSON CANDIDATE → VALIDATED LESSON → APPLIED LESSON.

AI may summarize evidence but cannot manufacture a lesson.

## 21.1 Data model

Inspect Project, ProjectEvent, ProjectMemory, Task, Sprint, Requirement, Risk, Review, AcademicEvaluation and ContributionDispute models.

Create only missing structures.

A lesson should support:
- projectId
- source event/evidence references
- methodology
- domain
- category
- title
- description
- evidence
- evidence metrics
- observed pattern
- confidence
- status
- creator/validator
- validation metadata
- applicability conditions
- reusable tags
- timestamps

## 21.2 Lifecycle

Implement:
CANDIDATE → REVIEWED → VALIDATED → APPLIED → ARCHIVED

Allow authorized rejection where evidence is insufficient.

## 21.3 Deterministic evidence extraction

Detect meaningful repeated patterns such as:
- repeated estimation variance
- repeated dependency blockers
- recurring scope changes
- repeated WIP overflow
- recurring conformance issues
- repeated skill gaps
- recurring bottlenecks
- requirement coverage problems
- repeated review feedback

Do not generalize from one anomalous event.

## 21.4 Service

Create/reuse a service responsible for:
- collectLearningEvidence(projectId)
- generateLessonCandidates(projectId)
- validateLesson(lessonId, actor)
- applyLesson(lessonId, targetProject)
- archiveLesson(lessonId)
- getProjectLessons(projectId)
- getReusableLessons(projectId/domain/methodology)

Applying a lesson only creates an advisory recommendation unless a human explicitly accepts a permitted change.

## 21.5 UI

Add a Project Learning/Lessons area inside Insights or another appropriate existing tab.

Show:
- lesson
- evidence
- confidence
- source events
- validation status
- applicability
- recommendation
- authorized validation/archive actions

Example:
“Three similar tasks took longer than planned because they depended on API integration.”
Evidence should show the actual supporting task count and planned/actual values.

## 21.6 Tests

Test evidence extraction, deterministic generation, duplicates, lifecycle, applicability, project/methodology isolation, insufficient evidence, malformed data, permissions, archived lessons and no-automatic-mutation behavior.

---

# WORKSTREAM 22 — CAPABILITY INTELLIGENCE + DYNAMIC TEAM ASSIGNMENT

## Purpose

Create one capability layer combining:
- canonical skills
- verified skills
- role recommendations
- quiz results
- demonstrated work
- completed relevant tasks
- project history
- workload
- capacity
- dependencies
- availability
- methodology context

The key question is:
“What capability evidence exists, who has capacity, and what constraints affect assignment?”

Do not turn this into an opaque ranking of people.

## 22.1 Capability model

Reuse the existing canonical skill taxonomy.

Support:
- userId
- canonical skill
- verification status
- quiz result
- evidence references
- relevant completed task count
- relevant project evidence
- recency
- confidence
- capacity
- workload
- methodology context

Self-declared skills must not be treated as equivalent to verified evidence.

## 22.2 Evidence weighting

Document a deterministic evidence model.

Possible sources:
1. verified quiz
2. explicitly verified skill
3. relevant completed task evidence
4. relevant project evidence
5. self-declared skill

Do not infer skills from unrelated work.

## 22.3 Capability gaps

Detect:
- required skill with no available member
- insufficient verified evidence
- capability concentrated in one member
- overloaded capable members
- missing backup capability
- methodology-specific capability gaps

Output advisory findings without demeaning labels.

## 22.4 Dynamic assignment

Integrate with the existing deterministic Branch & Bound assignment engine.

Inputs can include:
- task priority
- effort
- required skills
- dependencies
- capacity
- availability
- workload
- methodology constraints
- critical path
- urgency

The engine must remain deterministic.

## 22.5 Assignment explanation

Return:
- candidate set
- deterministic factors
- constraint violations
- exclusions and reasons
- capacity impact
- skill evidence
- alternatives

## 22.6 Human acceptance

Assignment changes require explicit authorized action:
Preview → Accept/Reject → Recalculate.

Acceptance must create an auditable ProjectEvent.

## 22.7 UI

Create a Capability/Team Intelligence panel containing:
- capability coverage
- capacity/workload
- gaps
- single-point capability risk
- assignment recommendations
- explanation drawer

Use neutral visuals rather than simplistic good/bad labels for individuals.

## 22.8 Tests

Test canonical skill resolution, evidence, quiz integration, capacity, gaps, Branch & Bound determinism, alternatives, explicit acceptance, authorization, project/team isolation, zero capacity, dependency constraints and no-silent-reassignment.

---

# WORKSTREAM 23 — EXPLAINABLE DECISION INTELLIGENCE

## Purpose

Create one consistent explanation layer for deterministic and advisory decisions.

Every important decision should answer:
WHAT happened → WHY → WHICH factors mattered → WHAT evidence supports it → WHAT would change it.

Cover:
- Task Priority 2.0
- Branch & Bound assignment
- Reactive Greedy
- methodology recommendation
- adaptive methodology
- risk
- dependencies
- conformance
- health
- capability gaps
- what-if simulation
- Digital Twin
- learning loop

## 23.1 Decision record

Create/reuse a generic decision explanation structure supporting:
- decisionId
- projectId
- decisionType
- subjectType
- subjectId
- result
- factors and values
- evidence references
- constraints
- alternatives
- counterfactuals
- explanation
- deterministic/advisory classification
- timestamp
- source

Never store secrets or unnecessary raw AI responses.

## 23.2 Deterministic explanations

Expose actual factors from the underlying engine.

Example:
“Priority increased because urgency, dependency blocking and milestone importance increased.”

Do not invent factor contributions. If the engine lacks a trace, extend it to produce one.

## 23.3 Assignment explanation

Example:
“Candidate A satisfies the required skills and has available capacity. Candidate B has the skill but would exceed capacity.”

Only report facts present in the engine result.

## 23.4 Reactive planning

Explain:
- trigger
- old plan version
- new plan version
- eligible tasks
- protected tasks
- stale tasks
- dependency changes
- recommendation

Respect existing protection for DONE and IN PROGRESS tasks.

## 23.5 AI summaries

Pipeline:
DETERMINISTIC DATA → STRUCTURED EXPLANATION → OPTIONAL AI SUMMARY.

Never:
AI → authoritative project state.

## 23.6 Counterfactuals

Only show “what would change” when the underlying deterministic engine can recompute it.

Do not fabricate counterfactuals.

## 23.7 UI

Create a reusable Explanation Drawer/Modal for:
priority, assignment, reactive planning, health, methodology, simulation, conformance, capability and learning.

Sections:
1. Decision
2. Why
3. Evidence
4. Constraints
5. Alternatives
6. What would change
7. Source
8. Timestamp

## 23.8 Tests

Test deterministic reproducibility, factor integrity, source linkage, missing evidence, stale decisions, counterfactual recomputation, AI failure, access control, isolation and old decision records.

---

# WORKSTREAM 24 — PROJECT HEALTH 2.0 + EARLY WARNING SYSTEM

## Purpose

Create a unified structured health layer from existing deterministic signals.

Do not reduce the project to one unexplained score.

Potential signals:
- schedule variance
- deadline pressure
- dependency health
- blockers
- WIP
- flow efficiency
- aging
- throughput
- SLE
- critical path
- risk
- capacity/workload
- requirement coverage
- traceability
- process conformance
- methodology drift
- relevant evaluation/evidence signals

## 24.1 Health dimensions

Use explicit dimensions such as:
- Schedule
- Workload
- Dependencies
- Risk
- Requirements
- Process
- Team Capacity
- Delivery
- Quality/Evidence

Each dimension must identify its source signals.

## 24.2 Health calculation

Implement a deterministic engine:

Health Dimension → Signals → Evidence → Status → Explanation.

For every signal define:
- formula
- source
- time window
- thresholds
- missing-data behavior

Avoid undocumented magic constants.

## 24.3 Early warnings

Support warnings for meaningful conditions:
- critical-path delay
- deadline pressure
- dependency blockage
- repeated WIP violation
- severe aging
- insufficient capacity
- requirement coverage gap
- conformance degradation
- methodology drift
- single-point capability risk
- recurring estimation variance

Each warning supports:
- severity
- category
- trigger
- evidence
- firstSeen
- lastSeen
- status
- recommended human action
- related entities

## 24.4 Warning lifecycle

Use:
OPEN → ACKNOWLEDGED → RESOLVED

Optionally support authorized DISMISSED with reason.

Resolution must be based on deterministic state, not AI text.

## 24.5 Deduplication

Use stable warning fingerprints such as:
project + category + subject + trigger class.

Do not spam identical warnings.

## 24.6 Recommendations

Recommendations are advisory:
- review dependency
- inspect critical-path tasks
- run capacity review
- review WIP
- verify requirement coverage
- schedule milestone review

Never automatically modify project state.

## 24.7 UI

Upgrade Project Health/Insights with:
- dimensions
- active warnings
- trends
- evidence
- affected tasks
- explanation
- recommended action
- history
- acknowledge/resolve controls

## 24.8 Notifications

Integrate with existing notifications and Socket.IO.

Useful events:
- warning opened
- warning severity changed
- warning acknowledged
- warning resolved

Respect notification preferences and access control.

## 24.9 Tests

Test every dimension, missing/empty data, deadlines, dependencies, critical path, capacity, methodology-specific behavior, warning lifecycle, deduplication, notifications, Socket.IO isolation, trends, permissions and no automatic mutation.

---

# WORKSTREAM 25 — UNIFIED V4 UI/UX + BROWSER VERIFICATION

## Purpose

Make all V4 functionality feel like one coherent product while preserving methodology-specific behavior.

Do not rewrite working systems solely for visual novelty.

## 25.1 Design system

Reuse/create shared tokens for:
- cream/neutral backgrounds
- glass surfaces
- typography
- spacing
- radii
- shadows
- icons
- buttons
- badges
- tabs
- cards
- tables
- dialogs/drawers
- tooltips
- forms
- loading/error/empty states

Avoid excessive color and visual noise.

## 25.2 Navigation

Verify:
- Classic
- Waterfall
- Scrum
- Kanban
- Hybrid
- project creation/switching
- tabs
- back navigation
- refresh
- direct URL navigation where supported
- auth redirects

## 25.3 Common project shell

Ensure consistent handling of:
- project header
- methodology
- domain
- health
- notifications
- team access
- Copilot
- context
- memory
- insights
- settings

Keep methodology-specific content distinct.

## 25.4 Responsive verification

Test:
- 1440×900
- 1280×800
- 1024×768
- 768×1024
- 390×844

Verify:
- no horizontal overflow
- usable navigation
- readable tables
- forms
- dialogs/drawers
- board scrolling
- timeline
- chat
- Three.js fallback
- touch-friendly controls

## 25.5 Accessibility

Check:
- keyboard navigation
- visible focus
- semantic controls
- labels
- dialog behavior
- contrast
- reduced motion
- alternative text
- no critical information conveyed only through color

## 25.6 Motion

Use GSAP only when useful.
Support reduced motion.
Do not animate every component.

## 25.7 Three.js

Verify:
- lazy loading where appropriate
- WebGL fallback
- non-blocking initial render
- reasonable CPU usage
- cleanup on unmount
- reduced-motion compatibility

## 25.8 Chat Markdown

Safely render:
- headings
- lists
- code blocks
- inline code
- tables if supported
- links
- malformed Markdown

Test unsafe HTML/script injection attempts.

Never render arbitrary unsanitized HTML.

## 25.9 Loading/error states

Every major screen should handle:
- loading
- empty
- network failure
- unauthorized
- forbidden
- stale data
- server error
- retry

Avoid blank screens.

## 25.10 Real browser journeys

Start the actual frontend/backend and use a real browser.

Test authenticated journeys for:
- login/logout
- project isolation
- Classic
- Waterfall
- Scrum
- Kanban
- Hybrid
- Learning
- Capability
- Decision explanations
- Health 2.0
- Early warnings
- Copilot attachment/context
- multimodal Copilot
- domain/methodology context
- Teacher Review
- Academic Evaluation
- Fair Contribution

Record:
- viewport
- console errors
- network errors
- broken screens
- screenshots where possible
- bugs
- fixes
- retest results

If browser infrastructure is unavailable, report BROWSER BLOCKED. Never fabricate browser results.

---

# MASTER INTEGRATION CHAINS

## Chain A — Learning

Project activity
→ ProjectEvent
→ evidence extraction
→ lesson candidate
→ validation
→ reusable lesson
→ advisory application.

## Chain B — Capability

Canonical skill
→ verification
→ evidence
→ capability profile
→ task skill requirement
→ deterministic assignment
→ explanation
→ explicit human acceptance
→ ProjectEvent.

## Chain C — Decision Intelligence

Deterministic engine
→ structured decision
→ factors
→ evidence
→ explanation
→ optional AI summary
→ UI.

## Chain D — Health

Project state/events
→ health signals
→ dimensions
→ early warning
→ notification
→ acknowledgement
→ resolution
→ history.

## Chain E — Context/AI

Attachment
→ TemporaryContext
→ Project Context
→ Domain
→ Methodology
→ Copilot
→ Multimodal AI
→ optional explicit Project Memory promotion.

## Chain F — Academic

Requirement
→ Task
→ Dependency
→ Execution
→ ProjectEvent
→ Process Mining
→ Conformance
→ Evidence
→ Teacher Review
→ Academic Evaluation
→ Contribution Analysis.

---

# SECURITY AUDIT

Perform:
- JWT/authentication checks
- role authorization
- project/team membership
- teacher/faculty authorization
- attachment ownership
- temporary context isolation
- memory isolation
- Socket.IO room isolation
- IDOR testing
- malformed IDs
- cross-project aggregation testing
- unauthorized assignment acceptance
- unauthorized lesson validation
- unauthorized warning resolution
- unauthorized academic actions
- Markdown/HTML safety
- prompt injection through attachments
- prompt injection through memory
- prompt injection through AI output
- secret leakage
- environment variable exposure
- credential leakage in logs
- AI provider response leakage

AI output must never override authorization.

---

# DATABASE AUDIT

Inspect all new collections/models and indexes.

Verify:
- projectId indexes
- userId/teamId indexes
- status indexes
- event type indexes
- timestamp indexes
- TTL indexes where appropriate
- compound indexes for common queries
- duplicate lessons
- duplicate warnings
- stale temporary contexts
- orphaned records
- application-level referential integrity

Do not add unnecessary indexes.

---

# API AUDIT

Every endpoint must have:
- authentication
- authorization
- validation
- predictable status codes
- useful errors
- project isolation
- no sensitive leakage

Expected endpoint categories:
- Learning: list/validate/apply/archive
- Capability: profile/gaps/assignment preview/accept
- Decisions: explanation/recompute where needed
- Health: profile/warnings/acknowledge/resolve

Reuse existing endpoints where appropriate.

---

# SOCKET.IO AUDIT

Use existing authenticated project rooms.

Potential events:
- lesson.created
- lesson.validated
- capability.updated
- assignment.recommended
- assignment.accepted
- decision.updated
- health.updated
- warning.opened
- warning.acknowledged
- warning.resolved

Verify authentication, authorization, room isolation, reconnect behavior, duplicate event handling and stale clients.

---

# AI / DAA AUDIT

AI may summarize:
- lessons
- health
- deterministic assignments
- methodology signals
- capability gaps
- process findings

AI may NOT be the source of truth for deterministic calculations.

DAA remains authoritative for deterministic optimization:
- Task Priority 2.0
- Greedy
- Branch & Bound
- DAG/dependency logic
- critical path
- scheduling
- deterministic flow calculations
- deterministic simulations

Required cascade remains:
Gemini → Groq → OpenRouter :free → graceful failure.

Local AI stays optional unless actual local inference is intentionally configured.

---

# TESTING AND REGRESSION

Create focused tests for all five workstreams.

### 21
Evidence, lesson generation, lifecycle, applicability, duplicates, isolation, permissions, no mutation.

### 22
Skills, evidence, capacity, gaps, assignment, determinism, alternatives, acceptance, isolation.

### 23
Decision records, factor integrity, source linkage, counterfactuals, reproducibility, AI failure, isolation.

### 24
Health dimensions, formulas, thresholds, missing data, warnings, deduplication, lifecycle, notifications, trends, isolation.

### 25
Navigation, rendering, responsiveness, accessibility, Markdown safety, loading/error states, Three.js fallback, reduced motion, authenticated journeys.

Then run all prior suites, including:
- V3 regression
- Waterfall
- Scrum
- Kanban
- Hybrid
- Advisor
- Adaptive
- What-If
- Digital Twin
- Process Mining
- Conformance
- Teacher Review
- Academic Evaluation
- Fair Contribution
- Copilot Attachments
- Multimodal Copilot
- Domain Intelligence
- Domain × Methodology
- Local AI Core
- TypeScript
- backend syntax
- frontend build
- API
- MongoDB
- Socket.IO

Do not report skipped tests as PASS.
Fix failures and rerun them.

---

# FINAL EXECUTION REPORT

Produce:

## Environment
- frontend
- backend
- browser
- viewport sizes
- database
- auth mode

## Workstream Results

| Workstream | Focused Tests | Browser | Status |
|---|---:|---|---|
| 21 Learning Loop | X/X | PASS/BLOCKED | ... |
| 22 Capability | X/X | PASS/BLOCKED | ... |
| 23 Explainability | X/X | PASS/BLOCKED | ... |
| 24 Health 2.0 | X/X | PASS/BLOCKED | ... |
| 25 UI/UX | X/X | PASS/BLOCKED | ... |

## Regression
Report actual totals. Do not call overlapping suite totals “unique tests.”

## Bugs Fixed
For each:
- symptom
- root cause
- fix
- retest

## Browser
Report console/network errors, responsive issues, accessibility issues, broken flows and remaining limitations.

## Security
Report major findings and fixes.

## Database
Report models, indexes, TTL and migrations.

## AI/DAA
Explicitly confirm:
- DAA deterministic
- AI advisory
- free cascade preserved
- Local AI status
- no automatic mutation
- no automatic grading
- no automatic contribution judgment

## Final Status
Use only:
PASS / PARTIAL / BLOCKED.

Do not call the release COMPLETE if a material verification stage remains blocked.

---

# MASTER AGENT PROMPT

You are the senior engineer responsible for implementing NexusFlow V4 Workstreams 21–25.

Read this entire document first.

Inspect the complete repository and all existing V3/V4 systems before writing code.

Implement:
1. Project Learning Loop
2. Capability Intelligence + Dynamic Team Assignment
3. Explainable Decision Intelligence
4. Project Health 2.0 + Early Warning System
5. Unified V4 UI/UX + Browser Verification

Execute continuously:
INSPECT → DESIGN → IMPLEMENT → TEST → FIX → RETEST → INTEGRATE → REGRESSION → SECURITY AUDIT → DATABASE AUDIT → API AUDIT → SOCKET.IO AUDIT → BUILD → BROWSER VERIFY → FINAL REPORT.

Preserve Classic, Waterfall, Scrum, Kanban and Hybrid.

Do not replace DAA with AI.
Do not allow AI to directly mutate deterministic state.
Do not automatically reassign users, modify deadlines, priorities, methodology, dependencies or grades.
Do not automatically decide contribution disputes.
Use ProjectEvent for auditable changes.
Reuse canonical skills and Project Memory.
Keep Temporary Context temporary unless explicitly promoted.
Preserve Domain × Methodology.
Preserve Gemini → Groq → OpenRouter :free → graceful failure.
Keep Local AI optional and disabled by default unless explicitly configured.

Implement Workstream 21 using real historical evidence and deterministic extraction.
Implement Workstream 22 using canonical skills, verified evidence, capacity, workload, dependencies and the existing deterministic Branch & Bound engine.
Implement Workstream 23 as a shared structured explanation system with evidence and factors.
Implement Workstream 24 as multiple deterministic health dimensions with documented formulas and deduplicated early-warning lifecycle.
Implement Workstream 25 as a coherent responsive/accessibility-focused UI layer and verify it through real browser journeys.

For every deterministic decision expose actual evidence and factors. Never invent explanations.

Run focused tests and every prior regression suite.
Fix failures and rerun.
Run TypeScript, backend syntax, frontend build, MongoDB, API and Socket.IO checks.
Perform authorization, project isolation, IDOR, prompt-injection and secret-leakage tests.
Perform real browser verification where the environment allows it.
If browser verification is unavailable, mark it BLOCKED rather than fabricating results.

Create a final report listing implementation, files, database changes, APIs, Socket.IO events, focused tests, regression tests, browser results, bugs fixed, security findings, DAA/AI verification, limitations and final PASS/PARTIAL/BLOCKED status.

Do not stop at source-code creation.
Do not claim unexecuted tests passed.
Do not fabricate browser evidence.
Do not claim Local AI deployment unless actual local inference was implemented and verified.

---

# AFTER WORKSTREAMS 21–25

Recommended next stage:

26 — Security & Isolation Hardening
27 — Database / Performance / Index Audit
28 — API + Socket.IO Contract Audit
29 — DAA vs AI Boundary Audit
30 — Full Regression + Browser E2E + Release Documentation

The goal after 21–25 should be stabilization and release hardening rather than continuously adding features.
