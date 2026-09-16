# NEXUSFLOW V4.0 — NEXT 5 IMPLEMENTATION AGENT PROMPTS

## Purpose

The first five V4 foundation fixes are now completed:

1. Role → Skill Selection + Quiz
2. Task Intelligence 2.0
3. Reactive Greedy + Planning Re-Merge
4. Requirement → Task → Dependency → Test → Evidence Traceability
5. Project Memory + Persistent Context

This document defines the **next five implementation workstreams**:

- Hybrid methodology engine
- Methodology recommendation
- Adaptive methodology drift monitoring
- Interactive What-If Simulation
- Digital Twin unification

The current audit identifies Hybrid as WIP, methodology recommendation/adaptive intelligence as missing, and simulation/digital-twin capabilities as partial. fileciteturn77file0L25-L30 The roadmap places Hybrid + recommendation/adaptive work before interactive simulation and digital-twin unification. fileciteturn77file4L432-L449

---

# GLOBAL EXECUTION RULES

These rules apply to **all five prompts**.

### 1. Read before changing

Before implementation:

- inspect the complete active codebase;
- inspect existing V3/V4 methodology architecture;
- inspect Classic, Waterfall, Scrum and Kanban implementations;
- inspect existing DAA engines;
- inspect Project Memory;
- inspect Reactive Planning;
- inspect Project Health;
- inspect Socket.IO events;
- inspect Three.js canvases;
- inspect existing tests;
- inspect current database schemas and routes.

Do not assume that a feature is missing merely because the roadmap says so. Verify the actual code first.

### 2. Preserve existing environments

Do NOT break:

- NexusFlow Classic / V3
- Waterfall V4
- Scrum V4
- Kanban V4
- authentication
- authorization
- tenant/project isolation
- chat
- notifications
- Project Memory
- traceability
- DAA
- AI routing

Existing functionality must remain regression-safe.

### 3. Architecture principle

Use:

```text
NexusFlow Core
      ↓
Methodology Engine
      ↓
Methodology-specific configuration / engine
      ↓
Shared UI + methodology-specific behavior
```

Do NOT create five disconnected applications.

### 4. DAA / AI separation

DAA remains deterministic and explainable.

AI must never become the source of deterministic:

- priority
- scheduling
- dependency validity
- WIP enforcement
- methodology state
- capacity calculations
- simulation truth

AI may explain, summarize, recommend or assist.

### 5. Human control

Recommendations must never silently mutate project state.

Simulation must never mutate live project state.

Adaptive methodology detection may recommend a change, but must not silently switch methodology.

### 6. Testing requirement

For every implementation:

```text
Implement
→ run focused tests
→ diagnose failures
→ fix
→ rerun focused tests
→ run regression
→ run security/isolation tests
→ run TypeScript/syntax checks
→ perform live HTTP/API verification
→ perform browser verification where possible
→ report actual numbers
```

Never report a test as PASS unless it actually ran and passed.

---

# PROMPT 6 — HYBRID METHODOLOGY ENGINE

## Objective

Implement **Hybrid Methodology** as a real first-class execution environment.

The current audit states that Hybrid is currently WIP: it exists as an enum/UI indication but does not have an execution engine. fileciteturn77file0L29-L30

Hybrid must not simply copy Scrum or Waterfall.

It should allow a project to intentionally combine methodology behaviors while preserving explicit rules and auditability.

## Required implementation

### A. Hybrid methodology configuration

Create the required Hybrid methodology configuration/engine.

Support explicit configuration such as:

```text
Project
 ├── Planning model
 ├── Execution model
 ├── Dependency model
 ├── Review model
 ├── Delivery model
 └── Governance model
```

The exact configuration must be based on the existing architecture after inspection.

Do not invent duplicate project/task models if existing models can be reused.

### B. Hybrid modes

Support clearly defined combinations using existing methodology capabilities.

Examples may include:

```text
Waterfall Planning
        +
Scrum Execution
```

or

```text
Waterfall Governance
        +
Kanban Execution
```

Do not allow arbitrary contradictory combinations.

### C. State ownership

Define which methodology owns:

- planning
- sprint/cycle behavior
- backlog behavior
- phase gates
- dependencies
- WIP
- reviews
- milestones
- delivery

Store the configuration explicitly.

### D. Hybrid UI

Create/update:

```text
HybridPanel.tsx
```

or the architecture-equivalent component.

The UI must explain:

- selected planning model
- selected execution model
- active rules
- current state
- methodology boundaries
- why a particular workflow rule applies

### E. Backend enforcement

Implement server-side validation.

Frontend controls must NOT be trusted.

Reject invalid state transitions server-side.

### F. Realtime

Integrate Hybrid state changes with Socket.IO where appropriate.

### G. Isolation

A Hybrid project must not affect:

- Scrum projects
- Kanban projects
- Waterfall projects
- Classic projects

### H. DAA integration

Existing deterministic engines must receive explicit Hybrid configuration.

Do not create an AI-driven planner.

## Tests

Create/extend a dedicated Hybrid suite.

Test at minimum:

- Hybrid project creation
- configuration persistence
- valid methodology combinations
- invalid combinations
- state transitions
- permissions
- isolation
- realtime events
- refresh persistence
- DAA compatibility
- Classic regression
- Waterfall regression
- Scrum regression
- Kanban regression

## Definition of Done

Hybrid is DONE only when:

- backend engine exists;
- frontend environment exists;
- configuration persists;
- rules are enforced server-side;
- realtime works;
- tests pass;
- regression passes;
- browser flow is verified;
- no fake WIP banner remains for functional Hybrid.

---

# PROMPT 7 — METHODOLOGY RECOMMENDATION ENGINE

## Objective

Implement a deterministic/explainable **Methodology Advisor** that helps users choose a methodology during project creation.

The roadmap explicitly calls for `methodologyAdvisor.js` and recommendation during workspace creation. fileciteturn77file4L432-L437

The advisor must recommend — never automatically select — a methodology.

## Required implementation

### A. Advisor inputs

Inspect the existing project creation fields and use appropriate signals such as:

- project type
- domain
- deadline
- requirement stability
- expected change frequency
- team size
- dependency complexity
- phase/gate requirements
- delivery frequency
- academic requirements
- work-in-progress characteristics
- governance requirements

Do not duplicate fields unnecessarily.

### B. Methodology candidates

Support the currently functional environments:

```text
Classic
Waterfall
Scrum
Kanban
Hybrid
```

Only recommend Hybrid when the Hybrid engine from Prompt 6 is actually available.

### C. Explainable recommendation

Return something conceptually like:

```text
Recommendation
Methodology: Scrum

Reasons:
+ requirements likely to evolve
+ iterative delivery expected
+ regular review useful

Considerations:
- fixed external milestone exists
```

Do not return a hidden score without explanation.

### D. No forced choice

The user must remain able to select another methodology.

Store appropriate recommendation metadata, such as:

```text
recommendedMethodology
recommendationReasons
selectedMethodology
```

Do not treat recommendation as authorization.

### E. Deterministic behavior

The recommendation engine must produce stable results for the same inputs.

AI may optionally provide natural-language explanation, but AI must not determine the underlying recommendation.

### F. AI separation

If AI is used:

```text
Deterministic Advisor
        ↓
Recommendation
        ↓
Optional AI explanation
```

NOT:

```text
AI
 ↓
Methodology selection
```

## Tests

Test:

- stable recommendations
- all methodology candidates
- incomplete inputs
- conflicting signals
- academic projects
- deadline-driven projects
- iterative projects
- WIP-oriented projects
- Hybrid recommendation only when supported
- user overriding recommendation
- authorization
- project isolation
- AI unavailable
- DAA independence

## Definition of Done

The advisor is DONE only when:

- backend advisor exists;
- project creation integrates it;
- recommendation is explainable;
- user remains in control;
- deterministic tests pass;
- AI failure does not break it;
- browser flow is verified.

---

# PROMPT 8 — ADAPTIVE METHODOLOGY DRIFT MONITORING

## Objective

Implement **Adaptive Methodology Intelligence** that detects when actual project behavior significantly differs from the configured methodology.

The roadmap calls for adaptive methodology drift monitoring. fileciteturn77file4L432-L437

This is a monitoring/recommendation system, NOT automatic methodology switching.

## Required implementation

### A. Observe actual behavior

Use existing project event/state data where available.

Potential signals include:

- repeated state transitions
- blocked work
- WIP violations
- repeated carry-over
- sprint spillover
- phase delays
- dependency behavior
- backlog churn
- cycle-time changes
- milestone variance
- methodology rule exceptions

Do not invent telemetry that does not exist without adding the required event model.

### B. Expected vs actual

Create an explainable comparison:

```text
Configured Methodology
        ↓
Expected Behavior
        ↓
Observed Project Behavior
        ↓
Drift Detection
        ↓
Recommendation
```

### C. Drift levels

Use clear states, for example:

```text
NORMAL
WATCH
DRIFT
SIGNIFICANT_DRIFT
```

Use the existing architecture's naming conventions if different.

### D. Explanation

Every detected drift must identify:

- what changed;
- expected behavior;
- observed behavior;
- evidence;
- affected area;
- confidence;
- suggested action.

### E. No automatic switching

Never:

- convert Scrum → Kanban automatically;
- convert Waterfall → Hybrid automatically;
- rewrite tasks automatically;
- change sprint rules automatically;
- modify methodology configuration automatically.

The user must explicitly approve any methodology change.

### F. AI role

AI can explain the detected drift in natural language.

It must not determine the underlying drift state.

## Tests

Test:

- normal project
- artificial drift
- repeated violations
- false-positive prevention
- methodology-specific behavior
- event ordering
- stale events
- project isolation
- authorization
- recommendation without mutation
- AI unavailable
- Classic regression
- Waterfall regression
- Scrum regression
- Kanban regression
- Hybrid regression

## Definition of Done

Adaptive intelligence is DONE only when:

- actual project telemetry is used;
- drift is measurable;
- evidence is shown;
- recommendations are explainable;
- no automatic methodology switching occurs;
- tests pass;
- browser verification confirms the UI;
- live project state remains unchanged by detection.

---

# PROMPT 9 — INTERACTIVE WHAT-IF SIMULATION SANDBOX

## Objective

Upgrade the existing change-impact capability into a real **interactive What-If Simulation Sandbox**.

The roadmap explicitly specifies a `SimulationModal.tsx` with sliders for team capacity, timeline compression and scope shock, connected to the change-impact service, while keeping simulations non-mutating. fileciteturn77file4L403-L405

## Required implementation

### A. Simulation UI

Create:

```text
client/components/workspace/SimulationModal.tsx
```

or the architecture-equivalent.

Provide controls for at least:

- team capacity
- timeline compression
- scope shock

Add additional parameters only when supported by the existing planning engine.

### B. Non-destructive execution

Simulation must run against a snapshot/copy of project state.

Never mutate:

- tasks
- dependencies
- assignments
- sprint state
- methodology
- requirements
- team membership
- project memory

### C. Forecast outputs

Show meaningful results such as:

- projected completion date
- schedule variance
- affected tasks
- critical-path changes
- capacity pressure
- risk changes
- bottlenecks
- confidence/uncertainty

Do not display fake Monte Carlo statistics.

If Monte Carlo is used, implement actual sampling and calculations.

### D. Compare baseline vs scenario

Show:

```text
CURRENT PLAN
      vs
SIMULATED PLAN
```

Highlight only differences supported by actual calculations.

### E. Scenario lifecycle

Support:

```text
Create Scenario
→ Adjust Parameters
→ Run Simulation
→ Inspect Result
→ Reset
→ Close
```

Saving scenarios is optional unless already supported by the architecture.

### F. Real-time

Do not require server mutation for every slider movement.

Use an efficient debounce/request strategy where appropriate.

### G. Explainability

For every significant result, provide the underlying deterministic reason.

Example:

```text
Completion moved by 4 days

Cause:
Critical-path task T-17 is now capacity constrained.

Evidence:
Available team capacity decreased from X to Y.
```

## Tests

Test:

- baseline simulation
- capacity increase
- capacity decrease
- timeline compression
- scope shock
- combined changes
- invalid values
- reset
- no live-state mutation
- deterministic repeatability where applicable
- authorization
- project isolation
- API errors
- AI unavailable
- performance
- browser interaction

## Definition of Done

Simulation is DONE only when:

- UI exists;
- real calculations execute;
- baseline comparison works;
- live state is untouched;
- results are explainable;
- tests pass;
- browser verification succeeds.

---

# PROMPT 10 — UNIFIED DIGITAL TWIN

## Objective

Unify the existing methodology-specific Three.js visualizations into a reusable **NexusFlow Digital Twin layer**.

The roadmap identifies Digital Twin as partially implemented because specialized 3D canvases exist but a unified global layer is missing. fileciteturn77file0L42-L75

This must NOT replace existing useful visualizations blindly.

## Required architecture

Create a reusable abstraction such as:

```text
DigitalTwinCore
      ↓
Project State Adapter
      ↓
Methodology Adapter
      ↓
Domain Adapter
      ↓
Three.js Scene
```

Use existing architecture names where appropriate.

## A. Common digital-twin model

Represent meaningful project state visually:

- requirements
- tasks
- dependencies
- phases/sprints/columns
- team members
- blockers
- risks
- milestones
- critical path
- health indicators

Do not visualize every database field.

Only expose meaningful project information.

## B. Methodology adapters

### Waterfall

Visualize:

- phases
- gates
- WBS
- dependencies
- critical path
- milestone progression

### Scrum

Visualize:

- backlog/sprint
- stories
- sprint progress
- blockers
- dependencies
- capacity

### Kanban

Visualize:

- columns
- WIP
- flow
- blockers
- aging
- bottlenecks

### Hybrid

Visualize the configured methodology layers without confusing the user.

### Classic

Preserve the existing Classic visualization behavior.

## C. Socket.IO synchronization

The digital twin must update when meaningful project state changes occur.

Do not create excessive rendering/event traffic.

Use appropriate event filtering/throttling.

## D. Interaction

Allow meaningful interactions such as:

- selecting a task;
- inspecting dependency relationships;
- viewing blockers;
- opening project entities;
- focusing critical-path nodes;
- filtering by team/member/methodology state.

Interactions must respect authorization.

## E. 2D fallback

Provide a usable 2D/accessible fallback.

The project must remain functional if:

- WebGL is unavailable;
- reduced motion is enabled;
- rendering fails;
- device performance is insufficient.

## F. Performance

Prevent:

- memory leaks;
- duplicate render loops;
- stale Socket.IO subscriptions;
- unnecessary scene rebuilds;
- unbounded object creation.

Clean up Three.js resources correctly.

## G. Reduced motion

Respect the existing reduced-motion/accessibility behavior.

Do not force animations.

## Tests

Test:

- Classic
- Waterfall
- Scrum
- Kanban
- Hybrid
- project isolation
- realtime synchronization
- task selection
- dependency visualization
- critical-path visualization
- WebGL fallback
- reduced motion
- mount/unmount cleanup
- navigation
- refresh persistence
- authorization

Also run existing methodology regression suites.

## Definition of Done

Digital Twin is DONE only when:

- common core exists;
- methodology adapters work;
- realtime synchronization works;
- interactions work;
- 2D fallback works;
- reduced-motion behavior works;
- no existing methodology visualization is broken;
- browser verification succeeds;
- performance/resource cleanup is verified.

---

# MASTER TESTING REQUIREMENTS FOR PROMPTS 6–10

After all five workstreams are implemented, run a complete verification cycle.

## 1. Focused suites

Create or update:

```text
testHybridV4.js
testMethodologyAdvisor.js
testAdaptiveMethodology.js
testWhatIfSimulation.js
testDigitalTwin.js
```

Use the actual repository naming convention if different.

## 2. Existing regression

Run:

```text
Classic / V3
Waterfall
Scrum
Kanban
Task Intelligence
Reactive Planning
Traceability
Project Memory
Skills / Quiz
Team Capability
Dynamic Assignment
Learning Loop
Explainable Decision Intelligence
Project Health
Risk
Chat
Security / Isolation
AI fallback
```

## 3. AI verification

Confirm:

```text
Gemini
  ↓
Groq
  ↓
OpenRouter
  ↓
Graceful AI failure
```

AI failure must not break:

- DAA
- Hybrid engine
- methodology advisor
- adaptive monitoring
- simulation
- digital twin

## 4. DAA verification

Confirm DAA remains:

```text
Deterministic
Explainable
Reproducible
Independent from AI
```

Do not silently replace deterministic calculations with LLM output.

## 5. Security verification

Test:

- authentication
- authorization
- project isolation
- team isolation
- methodology isolation
- simulation isolation
- digital-twin data isolation
- memory isolation
- traceability isolation
- server-side AI key protection

## 6. Build verification

Run:

- backend syntax checks
- frontend TypeScript
- production/build checks
- route registration checks
- MongoDB connectivity
- Socket.IO checks

## 7. Browser verification

Where graphical browser access is available, verify:

### Classic

- project creation
- dashboard
- existing functionality

### Waterfall

- setup
- overview
- plan
- tasks
- timeline
- team
- insights
- Project AI

### Scrum

- setup
- backlog
- sprint
- board
- timeline
- team
- insights
- retrospective
- Project AI

### Kanban

- setup
- overview
- board
- backlog
- flow
- team
- insights
- improvement
- Project AI

### Hybrid

- creation
- configuration
- execution
- rules
- state transitions

### New intelligence

- methodology recommendation
- adaptive drift
- What-If Simulation
- Digital Twin

Also verify:

- desktop
- tablet
- mobile
- refresh persistence
- console errors
- network errors
- 404/CORS errors
- WebGL fallback
- reduced motion

If browser verification is impossible because the environment has no graphical display, report:

```text
BROWSER VERIFICATION: BLOCKED
Reason: <actual reason>
```

Do NOT convert BLOCKED into PASS.

---

# REQUIRED FINAL AGENT REPORT

The implementation agent MUST finish with a factual report.

## 1. Overall result

```text
NEXT 5 V4 IMPLEMENTATION REPORT

Prompt 6 — Hybrid: PASS/FAIL/BLOCKED
Prompt 7 — Methodology Advisor: PASS/FAIL/BLOCKED
Prompt 8 — Adaptive Methodology: PASS/FAIL/BLOCKED
Prompt 9 — What-If Simulation: PASS/FAIL/BLOCKED
Prompt 10 — Digital Twin: PASS/FAIL/BLOCKED
```

## 2. Actual test totals

```text
TOTAL TESTS: X
PASS: X
FAIL: X
BLOCKED: X
```

Never invent totals.

## 3. Per-feature data

For every prompt report:

```text
Feature:
Focused tests:
PASS:
FAIL:
BLOCKED:
Regression:
Browser:
Security:
Build:
```

## 4. Files changed

List actual:

```text
NEW
MODIFIED
DELETED
```

Do not claim files were changed if they were not.

## 5. Database changes

Report:

- models added
- fields added
- indexes added
- migrations/data backfills if any

## 6. API changes

Report:

- routes
- methods
- request shape
- response shape
- authorization

## 7. Realtime changes

Report:

- Socket.IO events added
- payloads
- listeners
- cleanup behavior

## 8. DAA / AI verification

Explicitly answer:

```text
DAA independent from AI: YES/NO
AI fallback remains Gemini → Groq → OpenRouter → graceful failure: YES/NO
AI failure breaks deterministic planning: YES/NO
```

## 9. Security

Explicitly report:

```text
Authentication:
Authorization:
Project isolation:
Team isolation:
Simulation isolation:
Digital Twin isolation:
AI key protection:
```

## 10. Browser verification

Report actual:

```text
Desktop:
Tablet:
Mobile:
Console:
Network:
WebGL:
Reduced Motion:
```

## 11. Remaining issues

Separate:

```text
REAL PRODUCT BUGS
TEST/ENVIRONMENT LIMITATIONS
DEFERRED FEATURES
```

Do not hide failures.

## 12. Final architecture status

Explain how the new work changes:

```text
Classic
Waterfall
Scrum
Kanban
Hybrid
Methodology Advisor
Adaptive Intelligence
What-If Simulation
Digital Twin
```

## 13. Final verdict

Use only factual wording:

```text
IMPLEMENTED
PARTIALLY IMPLEMENTED
NOT IMPLEMENTED
BLOCKED
```

Do not declare a feature complete merely because source files exist.

---

# END-TO-END PRINCIPLE

The implementation sequence is:

```text
PROMPT 6
Hybrid Methodology
      ↓
PROMPT 7
Methodology Recommendation
      ↓
PROMPT 8
Adaptive Methodology
      ↓
PROMPT 9
What-If Simulation
      ↓
PROMPT 10
Unified Digital Twin
      ↓
FULL REGRESSION
      ↓
BROWSER VERIFICATION
      ↓
ACTUAL DATA REPORT
```

The goal is not merely to add files.

The goal is:

```text
Architecture
→ Implementation
→ Enforcement
→ Testing
→ Regression
→ Browser Verification
→ Evidence
```

**NexusFlow V4 must remain additive, explainable, deterministic where required, non-destructive, secure, and fully backwards compatible with Classic, Waterfall, Scrum, and Kanban.**
