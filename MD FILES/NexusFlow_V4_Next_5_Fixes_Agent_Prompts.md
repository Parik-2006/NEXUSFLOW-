# NexusFlow V4.0 --- Next 5 Fixes

## Agent Implementation Prompts + Fix Descriptions

> **Scope:** These are the next five V4 implementation fixes.
>
> **Explicitly excluded:** Local/pretrained AI, Scrum, Kanban,
> Waterfall, and Hybrid methodology work. Those remain separate.
>
> **Important:** Agents must inspect the existing implementation first,
> extend working V3/V4 systems, and avoid creating parallel
> architectures.

------------------------------------------------------------------------

# FIX 1 --- Role → Skill Selection + Skill Verification Quiz

## Description

Correct the current role/skill UX.

**Role must NOT be a hardcoded skill whitelist.** A role should
recommend skills, while the user chooses the skills they actually want
to verify.

Target flow:

``` text
Select Role
   ↓
Show Recommended Skills
   ↓
User Selects Any Canonical Skill(s)
   ↓
5 Questions Per Selected Skill
   ↓
Immediate Correct/Wrong + Explanation
   ↓
3/5+ = Verified
   ↓
Persist Skill + Badge
```

### Agent Prompt

Implement **V4 Fix 1: Role → Skill Selection + Skill Verification Quiz
Correction**.

1.  Audit the existing role selector, skill selector, canonical skill
    constants/taxonomy, quiz routes, quiz bank, SkillVerification
    persistence, profile badges, workflow role flow, and
    team/application quiz flow.
2.  Reuse the existing quiz infrastructure. Do **not** create a second
    quiz system.
3.  Separate role recommendations from skill eligibility:
    -   `recommendedSkills[]` is acceptable.
    -   `allowedSkills[]` / hardcoded role whitelist is not.
4.  A user must be able to select any valid canonical skill, including:
    -   Front-End, Back-End, Full Stack
    -   JavaScript, TypeScript, React, Node.js, Python, Java, C++
    -   SQL, PostgreSQL, MongoDB, Database Design
    -   Docker, Kubernetes, CI/CD, AWS, Azure
    -   Testing, Automation, UI/UX
    -   AI/ML, Deep Learning, Generative AI, LLMs, RAG, AI Agents
    -   Prompt Engineering, LLMOps, Context Engineering, Multimodal AI,
        Model Evaluation
    -   Cyber Security, Network Security, Secure Coding, Authentication,
        Cryptography
    -   Blockchain, Web3, Smart Contracts
    -   Requirements Engineering, Documentation
5.  For every selected skill, run exactly 5 questions.
6.  Give immediate Correct/Wrong feedback and an explanation.
7.  Preserve `3/5 or higher = Verified`.
8.  Persist verification and badges.
9.  Preserve self-only skill modification security. A teammate cannot
    manually modify another user's verified skills.
10. Run focused tests, existing Fix 2--5 regressions, TypeScript, and
    build checks.

### Acceptance Criteria

-   [ ] Role recommends but does not restrict skills.
-   [ ] User can select multiple canonical skills.
-   [ ] Quiz runs only for selected skills.
-   [ ] Exactly 5 questions per selected skill.
-   [ ] 3/5 threshold preserved.
-   [ ] Results persist.
-   [ ] Existing application/workflow quiz infrastructure is reused.
-   [ ] Permissions remain secure.
-   [ ] TypeScript/build/regression tests pass.

------------------------------------------------------------------------

# FIX 2 --- Task Intelligence 2.0 / Explainable Priority

## Description

Upgrade task prioritization into one centralized deterministic scoring
engine.

Potential factors:

-   criticality
-   impact
-   urgency
-   deadline pressure
-   dependencies
-   blocking potential
-   risk
-   estimated effort
-   expected value
-   technical uncertainty
-   teacher/faculty importance
-   milestone importance
-   capacity
-   skill availability
-   critical-path position
-   workload

The result must explain **why** a task received its rank.

Example:

``` text
Priority #1
Score: 94

+ Blocks 4 tasks
+ Deadline approaching
+ Critical path
+ High impact
- High effort
```

### Agent Prompt

Implement **V4 Fix 2: Task Intelligence 2.0**.

1.  Audit the existing Greedy scheduler, priority calculations, Task
    model, dependency/critical-path logic, sprint allocation, Decision
    Engine priority UI, and tests.
2.  Preserve the existing DAA/Greedy semantics; extend rather than
    replace them.
3.  Create one authoritative deterministic priority engine. Do not
    scatter formulas across frontend/backend.
4.  Normalize the result into a stable score/rank.
5.  Provide machine-readable factor details and human-readable reasons.
6.  Handle missing optional values safely without inventing data.
7.  Use deterministic tie-breakers; never randomize.
8.  Preserve any distinction between human/manual priority and
    calculated priority where the current architecture supports it.
9.  The actual score must not depend on an LLM.
10. Add tests for high impact, urgency, deadlines, dependencies,
    blockers, critical path, risk, skill shortage, overload, effort,
    missing values, ties, and repeatability.
11. Run all relevant regressions and TypeScript/build checks.

### Acceptance Criteria

-   [ ] One centralized scoring engine.
-   [ ] Multiple meaningful factors.
-   [ ] Deterministic and stable.
-   [ ] Explainable.
-   [ ] Safe with missing data.
-   [ ] Existing DAA/Greedy behavior preserved.
-   [ ] No AI dependency for scoring.
-   [ ] Tests pass.

------------------------------------------------------------------------

# FIX 3 --- Reactive Greedy Recalculation + Planning Re-Merge

## Description

Derived planning results must not become silently stale after meaningful
project changes.

Target:

``` text
Relevant State Change
       ↓
Detect Affected Data
       ↓
Invalidate Stale Result
       ↓
Recalculate Greedy
       ↓
Recalculate Planning
       ↓
Re-merge / Rebalance
       ↓
Synchronize UI
```

Completed work must not be rewritten merely because a new ranking
exists.

### Agent Prompt

Implement **V4 Fix 3: Reactive Greedy Recalculation + Planning
Re-Merge**.

1.  Audit all authoritative task mutation paths:
    -   create/update
    -   status
    -   deadline
    -   dependencies
    -   assignment
    -   effort
    -   required skills
    -   risk
    -   capacity/workload
    -   sprint/planning changes
2.  Define meaningful recalculation triggers for the factors used by Fix
    2.
3.  Add derived-state invalidation/versioning.

Example:

``` text
Task State Version: 27
Greedy Result Version: 27
Planning Result Version: 27

Task changes → State Version 28
Greedy = STALE
Planning = STALE
```

4.  Recalculate authoritative derived state server-side.
5.  Reconsider sprint allocation where applicable.
6.  Preserve:
    -   DONE/history
    -   completed sprint history
    -   IN PROGRESS where practical
7.  Allow TODO/PLANNED work to be re-ranked/reallocated.
8.  Never automatically delete work, change methodology, alter verified
    skills, remove members, override teacher requirements, or perform
    destructive restructuring.
9.  Synchronize changes through existing Socket.IO without duplicate
    broadcasts.
10. Protect against rapid concurrent updates using appropriate version
    checks/coalescing/stale-result rejection.
11. Test deadline changes, dependencies, factor changes, assignment,
    capacity, skill requirements, rapid updates, stale versions, DONE
    preservation, IN PROGRESS preservation, TODO re-ranking, sprint
    re-merge, sockets, and duplicate-event prevention.

### Acceptance Criteria

-   [ ] Relevant changes trigger recalculation.
-   [ ] Stale derived state is detectable.
-   [ ] Greedy results refresh.
-   [ ] Planning can re-merge/rebalance.
-   [ ] DONE history is protected.
-   [ ] IN PROGRESS is protected where practical.
-   [ ] No destructive automatic restructuring.
-   [ ] Socket/UI synchronization works.
-   [ ] Concurrency behavior is tested.

------------------------------------------------------------------------

# FIX 4 --- Requirement → Task → Dependency → Test → Evidence Traceability

## Description

Connect academic/project requirements to actual implementation and
evidence.

Target:

``` text
Teacher Requirement
       ↓
Project Requirement
       ↓
Epic / Feature
       ↓
Task
       ↓
Implementation
       ↓
Testing
       ↓
Evidence / Deliverable
```

This should make it possible to identify uncovered requirements,
implemented-but-untested requirements, and evidence gaps.

### Agent Prompt

Implement **V4 Fix 4: Requirement Traceability**.

1.  Audit Project, Task, existing teacher/client requirements, Project
    Brain, GitHub/commit data, tests, milestones, artifacts,
    documentation, and existing Waterfall requirement support.
2.  Reuse existing structures where possible.
3.  Create a project-scoped requirement representation containing at
    minimum:
    -   id
    -   projectId
    -   title
    -   description
    -   source
    -   mandatory
    -   priority
    -   status
4.  Support sources such as teacher/faculty, client, team, and project.
5.  Link requirements to Epics/Features/Tasks using IDs/references
    rather than duplicating entire objects.
6.  Support implementation evidence, test evidence, and
    artifact/deliverable evidence.
7.  Provide meaningful coverage states such as:
    -   NOT_STARTED
    -   PLANNED
    -   IN_PROGRESS
    -   IMPLEMENTED
    -   TESTED
    -   EVIDENCE_ATTACHED
    -   COMPLETED
8.  Do not mark a requirement complete merely because a task exists.
9.  Calculate:
    -   total requirements
    -   covered
    -   implemented
    -   tested
    -   evidence-backed
    -   uncovered
10. UI must allow navigation from requirement → task → dependency →
    implementation/test/evidence.
11. If a linked task is removed or changed, expose the resulting
    coverage impact.
12. Enforce project isolation and authorization.
13. Preserve compatibility with the existing Waterfall implementation.
14. Add focused tests plus regression/TypeScript/build checks.

### Acceptance Criteria

-   [ ] Requirements are traceable first-class project data.
-   [ ] Teacher/faculty requirements supported.
-   [ ] Requirement → task links work.
-   [ ] Implementation/test/evidence links work.
-   [ ] Coverage is measurable.
-   [ ] Gaps are visible.
-   [ ] No false automatic completion.
-   [ ] Authorization/project isolation enforced.
-   [ ] Waterfall compatibility preserved.

------------------------------------------------------------------------

# FIX 5 --- Project Memory + Persistent Context Foundation

## Description

Build the structured foundation for long-term project memory.

NexusFlow must distinguish:

``` text
PROJECT MEMORY
       vs.
PERSISTENT PROJECT CONTEXT
       vs.
TEMPORARY CHAT CONTEXT
```

Do not save every chat message or attachment permanently.

**This fix must NOT implement or select the Local/Pretrained AI model.**

### Agent Prompt

Implement **V4 Fix 5: Project Memory + Persistent Context Foundation**.

1.  Audit Project Brain, decisions, Decision Feedback,
    retrospective/learning data, teacher requirements, artifacts,
    methodology history, risk history, milestones, task events, Copilot
    storage, and current AI context assembly.
2.  Reuse existing infrastructure where appropriate.
3.  Define structured memory categories such as:
    -   DECISION
    -   TEACHER_FEEDBACK
    -   REQUIREMENT
    -   ARCHITECTURE_DECISION
    -   METHODOLOGY_EVENT
    -   MAJOR_CHANGE
    -   RISK_LESSON
    -   LESSON_LEARNED
    -   MILESTONE
    -   IMPORTANT_ARTIFACT
    -   PROJECT_NOTE
4.  Each memory item should retain project, type, content/summary,
    source, creator, timestamps, importance, and optional references to
    tasks/requirements/decisions/artifacts.
5.  Create controlled **Persistent Project Context** for intentionally
    approved project knowledge:
    -   requirements
    -   architecture
    -   ER diagrams
    -   project plans
    -   faculty specifications
    -   approved decisions
6.  Keep **Temporary Chat Context** separate:
    -   useful for the current Copilot conversation
    -   not automatically promoted to permanent memory
7.  Support appropriate create/update/archive/restore/retrieval
    operations.
8.  Never silently delete historical decisions.
9.  Provide a clean context-assembly boundary such as:

``` text
getProjectContext(projectId)
```

which can later provide:

``` text
project basics
+
requirements
+
important memory
+
approved context
+
current project state
```

10. This context service must NOT call or depend on a Local/Pretrained
    AI model.
11. Enforce project membership authorization and prevent cross-project
    leakage.
12. Add tests for creation, retrieval, archive/restore, project
    isolation, linked requirements/decisions, persistent vs temporary
    context, context assembly, authorization, and no automatic AI call.
13. Run regressions, TypeScript, and build.

### Acceptance Criteria

-   [ ] Structured project memory exists.
-   [ ] Persistent context is separate from temporary chat context.
-   [ ] Context assembly has a clean interface.
-   [ ] Existing Project Brain/decision systems are reused.
-   [ ] No Local AI is selected or implemented.
-   [ ] No automatic permanent storage of every chat/upload.
-   [ ] Project isolation and authorization work.
-   [ ] Tests/build pass.

------------------------------------------------------------------------

# CROSS-FIX INTEGRATION

These fixes should form one connected architecture:

``` text
Role
 ↓
User-selected Skills
 ↓
Verified Team Capability
 ↓
Task Required Skills
 ↓
Task Intelligence / Priority
 ↓
Reactive Planning
 ↓
Requirement Coverage
 ↓
Evidence
 ↓
Project Memory
```

Do not create five unrelated systems.

------------------------------------------------------------------------

# HARD ENGINEERING RULES

1.  **Preserve V3.** Existing authentication, teams, chat, GitHub, DAA,
    OmniRoute, etc. must continue working.
2.  **Extend, don't duplicate.** Reuse current
    models/services/routes/components.
3.  **DAA remains deterministic.** Do not use LLMs for the actual Greedy
    score, dependency calculation, allocation, or mathematical result.
4.  **No Local AI in these fixes.** Do not select, download, configure,
    or integrate a pretrained model.
5.  **No methodology implementation in these fixes.** Do not implement
    Scrum, Kanban, Waterfall, or Hybrid changes.
6.  **Human control.** Derived recommendations may update automatically;
    destructive/major changes require human approval.
7.  **No fake data.** Never fabricate skills, requirements, evidence,
    GitHub activity, or memory.
8.  **Project isolation.** Every API/service must enforce authorization.
9.  **Explainability.** Derived intelligence should explain why it
    produced its result.
10. **Regression first.**

Required workflow:

``` text
Audit
 ↓
Baseline tests
 ↓
Implement
 ↓
Focused tests
 ↓
TypeScript
 ↓
Build
 ↓
Full regression
```

------------------------------------------------------------------------

# REQUIRED AGENT FINAL REPORT

Every agent must report:

## Implementation

-   files created
-   files modified
-   backend changes
-   frontend changes
-   model/database changes
-   API changes
-   Socket.IO changes

## Tests

Report exact commands and actual results:

``` text
Focused tests: PASS/FAIL
Regression: PASS/FAIL
TypeScript: PASS/FAIL
Build: PASS/FAIL
```

Never claim PASS without running the check.

## Safety Confirmation

Confirm:

-   V3 preserved
-   no paid AI introduced
-   no Local/Pretrained AI introduced
-   no methodology work introduced
-   no cross-project leakage
-   no destructive automatic mutation

------------------------------------------------------------------------

# IMPLEMENTATION ORDER

``` text
FIX 1
Skill Selection + Quiz
        ↓
FIX 2
Task Intelligence 2.0
        ↓
FIX 3
Reactive Greedy + Planning Re-Merge
        ↓
FIX 4
Requirement Traceability
        ↓
FIX 5
Project Memory + Context
```

Fix 2 and Fix 3 are tightly coupled.

Fix 4 should consume the existing task/dependency architecture.

Fix 5 should consume the structured project information produced by the
earlier fixes.

------------------------------------------------------------------------

# ⭐ NexusFlow

**Plan smarter. Collaborate better. Execute together.**
