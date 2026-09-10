# NexusFlow V4.0 --- Kanban Methodology Implementation Plan

> **Purpose:** Detailed implementation blueprint for the V4 Kanban
> project environment.
>
> **Important:** This is a planning and implementation specification. It
> does not replace V3, NexusFlow Classic, Waterfall, or Scrum.
>
> **Primary rule:** Kanban is a real continuous-flow project execution
> environment, not a methodology label. Selecting Kanban changes
> workflow, WIP policies, replenishment, prioritization, flow metrics,
> DAA behavior, AI context, memory, notifications, and visualization.

------------------------------------------------------------------------

# 0. V4 SAFETY BASELINE

## Objective

Build Kanban on the existing NexusFlow Core/common V4 infrastructure
without breaking existing environments.

## Existing environments

1.  **NexusFlow** --- Classic V3 environment
2.  **Waterfall** --- V4 sequential phase environment
3.  **Scrum** --- V4 sprint-based environment
4.  **Kanban** --- V4 continuous-flow environment
5.  **Hybrid** --- Work in Progress

**NexusFlow is NOT a methodology.** It is the existing V3/Classic
project environment.

## Hard requirements

-   Do not delete existing V3 files.
-   Do not rewrite working V3 features unnecessarily.
-   Do not silently migrate existing projects.
-   Do not silently change methodology.
-   Reuse common V4 engines where appropriate.
-   Kanban must not inherit Scrum sprint commitments as mandatory
    workflow.
-   Kanban must not inherit Waterfall phase gates as mandatory workflow.
-   DAA remains deterministic and separate from AI.
-   AI may explain, summarize, interpret, and recommend, but cannot
    replace deterministic calculations.
-   Global Chat, Team Chat, and Project Copilot remain separate.
-   Recommendations must never silently modify project state.
-   Verified skills remain user-owned.
-   All mutations require authorization and auditability.
-   Existing Waterfall and Scrum projects must remain functional.

## Prompt 0 --- Repository Safety and Architecture Audit

> Before implementing Kanban, inspect the complete existing V3/V4
> architecture: project creation, methodology engine, projects, tasks,
> teams, skills, DAA, priority engine, dependency engine, Risk
> Intelligence, Project Health, Project Brain, Decision Engine, Project
> Memory, notifications, chat, Copilot, traceability, Three.js, GSAP,
> Waterfall, and Scrum.
>
> Identify reusable common services and exact places for Kanban-specific
> adapters/configuration.
>
> Do not delete or replace working V3, Waterfall, or Scrum
> functionality. Preserve NexusFlow Classic as a supported environment.

------------------------------------------------------------------------

# 1. KANBAN PRODUCT MODEL

## Goal

Introduce Kanban as a first-class methodology-specific execution
environment.

``` text
NexusFlow Core
      ↓
Methodology Engine
      ↓
KANBAN
      ↓
Kanban Configuration
      ↓
Continuous Flow Execution Environment
```

Kanban controls: - workflow columns - WIP limits - pull/replenishment -
work item classes - flow policies - blockers - dependencies - aging
work - cycle time - lead time - throughput - flow efficiency -
cumulative flow - bottlenecks - service-level expectations - capacity
signals - delivery forecasting - flow-based DAA - Kanban AI context -
Kanban visualizations.

## Core flow

``` text
Demand → Replenishment → Ready → Pull → Execute → Review → Done → Continuous Replenishment
```

Kanban must not become a disguised Sprint system.

## Prompt 1 --- Kanban Methodology Engine

> Add Kanban to the V4 methodology engine.
>
> Define Kanban workflow rules, WIP limits, pull policies,
> replenishment, work item classes, service policies, flow metrics,
> blockers, dependency behavior, forecasting context, and
> Kanban-specific AI/DAA behavior.
>
> Keep project/task/team/skill/requirement/memory/event models reusable.
> Build a methodology-specific execution layer over the common core.

------------------------------------------------------------------------

# 2. KANBAN SETUP WIZARD

## User journey

``` text
Create Project → Name → Domain → Team → Methodology → KANBAN → Setup Wizard → Create
```

## Project fields

-   project name
-   description
-   domain
-   academic/project category
-   teacher/faculty requirements
-   deadline
-   milestone/demo date
-   team members
-   availability
-   verified skills
-   project roles.

## Kanban configuration

-   workflow columns
-   WIP limits per column
-   hard/advisory WIP mode
-   default work-item class
-   replenishment cadence
-   expedite policy
-   service-level expectation
-   blocker policy
-   review/QA policy
-   Definition of Ready
-   Definition of Done
-   priority policy
-   work item types
-   estimation method
-   aging thresholds.

## Default workflow

``` text
BACKLOG → READY → IN PROGRESS → IN REVIEW → DONE
```

Optional:

``` text
BLOCKED / EXPEDITE / WAITING
```

## Prompt 2 --- Kanban Setup

> Build the Kanban Setup Wizard using the existing project creation
> architecture.
>
> Explain continuous flow, pull, WIP limits, replenishment, blockers,
> and service classes.
>
> Allow configuration of workflow columns, WIP limits, work item
> classes, replenishment rules, service-level expectations, Definitions
> of Ready/Done, team capacity, and project requirements.
>
> Validate invalid workflows and WIP configurations. Do not create
> artificial Sprint objects for Kanban.

------------------------------------------------------------------------

# 3. KANBAN UI/UX DESIGN SYSTEM

Use the V4 premium language: - cream, ivory, warm white, beige, sand -
muted olive/brown - charcoal/graphite - soft neutral borders -
restrained glass cards - layered surfaces - subtle morphism - soft
shadows - premium typography.

Avoid neon colors, excessive glow, and generic AI gradients.

Tailwind is primary. Bootstrap JS is selective only.

## Meaningful Three.js options

-   Flow River
-   WIP landscape
-   dependency network
-   bottleneck topology
-   team capability map
-   cumulative-flow environment
-   project digital twin.

## GSAP

Use for purposeful: - card movement - WIP changes - blocker
transitions - pull events - bottleneck highlighting - replenishment -
flow metric changes - insight reveals.

## Prompt 3 --- Kanban Visual System

> Build the Kanban environment using the premium cream/ivory/neutral V4
> visual language.
>
> Use Tailwind as the primary design system, reusable
> cards/columns/metrics/policy controls, meaningful Three.js
> visualizations, and GSAP for purposeful state changes.
>
> Support desktop/tablet/mobile, reduced motion, and keyboard
> accessibility.

------------------------------------------------------------------------

# 4. KANBAN NAVIGATION / TABS

Eight primary tabs: 1. Overview 2. Board 3. Backlog 4. Flow 5. Team 6.
Insights 7. Policies 8. Project AI

## Prompt 4 --- Kanban Navigation

> Create the eight-tab Kanban environment and keep it isolated from
> Scrum and Waterfall workflow behavior.
>
> Preserve methodology-aware routing and existing project access
> control.

------------------------------------------------------------------------

# 5. OVERVIEW TAB

## Purpose

Live operational view of the Kanban system.

Example:

``` text
Flow Health: GOOD
WIP: 7 / 10
Blocked: 1
Aging: 2
Throughput: 8 items / 7 days
Median Cycle Time: 2.8 days
SLE: 4 days
```

Show: - WIP and utilization - throughput - cycle/lead time - flow
efficiency - blocked work - aging - bottlenecks - dependencies - risk -
deadlines - backlog - recent delivery - replenishment - service-level
signals - recent activity.

## Prompt 5 --- Kanban Overview

> Build a live Overview from real database state.
>
> Show WIP, WIP limits, throughput, cycle time, lead time, flow
> efficiency, blockers, aging, bottlenecks, dependencies, risks,
> deadlines, backlog state, service-level signals, and activity.
>
> No hardcoded metrics. Connect changes to real events and meaningful
> GSAP transitions.

------------------------------------------------------------------------

# 6. BOARD TAB --- CORE EXECUTION

## Default board

``` text
BACKLOG | READY | IN PROGRESS | IN REVIEW | DONE
```

## Work item card

-   ID/title/type
-   priority
-   class of service
-   assignee
-   skills
-   estimate
-   age
-   due date
-   risk
-   dependency count
-   blocker
-   parent requirement/story
-   current state.

## Pull behavior

A user pulls work only when destination policy permits.

Example:

``` text
IN PROGRESS = 4/4
Attempt another pull
→ block or warn according to policy
→ explain WIP limit
→ show alternatives
```

Blocked work updates history, aging, flow efficiency, dependency impact,
health, and notifications.

## Prompt 6 --- Kanban Board

> Build the real Kanban execution board with configurable columns,
> pull/move behavior, WIP limits, classes of service, blockers,
> dependencies, assignees, skills, estimates, due dates, risks, and
> history.
>
> Enforce or warn on WIP limits according to policy.
>
> Prevent invalid transitions. Every meaningful state change must
> generate an auditable event.

------------------------------------------------------------------------

# 7. BACKLOG + REPLENISHMENT

Kanban continuously replenishes the Ready queue.

Work-item fields: - ID/title/user story - description/acceptance
criteria - business value - priority - effort/hours - skills -
dependencies - risk - milestone - teacher importance - technical
uncertainty - expected value - class of service - due date - readiness.

Flow:

``` text
Backlog → DAA candidate analysis → Ready candidates → Replenishment decision → READY
```

User/team retains final control.

## Prompt 7 --- Backlog + Replenishment

> Build Kanban Backlog and Replenishment.
>
> Allow create/edit/prioritize/filter/inspect/refine work items.
>
> Use deterministic DAA to recommend Ready candidates based on value,
> urgency, risk, dependencies, WIP, skills, deadlines, and class of
> service.
>
> Replenishment remains user-controlled. Do not create Sprint
> commitments.

------------------------------------------------------------------------

# 8. DYNAMIC PRIORITY ENGINE

Factors: - business impact - urgency - deadline pressure - dependency
importance - blocking potential - risk - effort - expected value -
technical uncertainty - teacher importance - milestone importance -
capacity - skill availability - critical path - workload - class of
service.

Priority must be explainable, not just a number.

## Prompt 8 --- Dynamic Kanban Priority

> Extend deterministic priority for continuous-flow Kanban.
>
> Recalculate when configured planning factors change.
>
> Rank eligible backlog/Ready items using explainable scoring, including
> class-of-service and service-level considerations.
>
> Never let AI replace the calculation and do not silently disrupt
> active work.

------------------------------------------------------------------------

# 9. WIP LIMIT ENGINE

Each active column can have: - WIP limit - current count - utilization -
available slots - hard/advisory policy - exception policy.

Example:

``` text
IN PROGRESS 4/4
WIP LIMIT REACHED
```

When saturated, recommend: - swarm existing work - resolve blockers -
review aging - adjust capacity - authorized override - do not silently
exceed policy.

## Prompt 9 --- WIP Limit Engine

> Implement configurable column-level WIP limits with hard/advisory
> modes.
>
> Calculate current WIP, slots, utilization, overload, and bottleneck
> signals deterministically.
>
> Prevent or warn on invalid pulls according to policy.
>
> Record authorized WIP overrides with actor, timestamp, reason, and
> old/new state.

------------------------------------------------------------------------

# 10. FLOW POLICY ENGINE

Support: - Definition of Ready - Definition of Done - pull policy -
blocker policy - aging thresholds - service classes - override policy.

Policies must be visible.

## Prompt 10 --- Kanban Policy Engine

> Build an explicit policy engine for Ready/Done criteria, pull rules,
> WIP, blockers, aging, service classes, and overrides.
>
> Policies must be visible and explainable. Validate eligibility before
> movement.
>
> Do not hide methodology rules in UI-only logic.

------------------------------------------------------------------------

# 11. CLASSES OF SERVICE

Support configurable: 1. Standard 2. Fixed Date 3. Expedite 4.
Improvement/Intangible

Each may define: - priority treatment - WIP behavior - due-date
handling - escalation - reporting.

Expedite must be rare, visible, authorized, and auditable.

## Prompt 11 --- Classes of Service

> Implement configurable Kanban Classes of Service.
>
> Support Standard, Fixed Date, Expedite, and Improvement/Intangible.
>
> Make expedite work explicitly visible and auditable. Do not allow an
> expedite label to bypass every WIP/security rule automatically.

------------------------------------------------------------------------

# 12. FLOW METRICS ENGINE

Calculate from actual timestamps: - throughput - cycle time - lead
time - age - blocked time - waiting time - active time - flow
efficiency - WIP - arrival rate - completion rate - service-level
attainment.

Do not fabricate values where timestamps are missing.

## Prompt 12 --- Flow Metrics Engine

> Build a deterministic Flow Metrics Engine using actual event
> timestamps.
>
> Calculate throughput, cycle time, lead time, age, waiting, blocked and
> active time, flow efficiency, WIP, arrival/completion rate, and
> service-level attainment.
>
> Distinguish unavailable data from zero. Preserve historical metrics
> where required.

------------------------------------------------------------------------

# 13. AGING WORK INTELLIGENCE

Detect: - age beyond configured threshold - age beyond historical
percentile - age beyond SLE - long blocker duration - unusually long
review.

Example:

``` text
T-17
Age: 6.2 days
Typical: 2.9 days
Status: AGING
```

## Prompt 13 --- Aging Work

> Implement deterministic aging detection using configured thresholds
> and historical evidence where available.
>
> Highlight aging work on Board, Overview, and Insights.
>
> Explain why it is aging. Do not automatically reprioritize or reassign
> it.

------------------------------------------------------------------------

# 14. SLE + FLOW FORECASTING

Support: - service-level expectation - historical cycle-time
distribution - percentile forecasts - expected completion window -
evidence-based risk signals.

Example:

``` text
50th percentile: 2.6d
85th percentile: 4.1d
95th percentile: 6.3d
Current age: 4.5d
Signal: beyond normal flow range
```

Forecasts are not guarantees.

## Prompt 14 --- SLE and Forecasting

> Build deterministic Kanban SLE/forecasting using actual completed-item
> history.
>
> Use percentile evidence where enough data exists.
>
> Clearly indicate insufficient history and never present forecasts as
> guarantees.
>
> Keep AI interpretation separate.

------------------------------------------------------------------------

# 15. DEPENDENCY ENGINE

Support: - requirement → work item - work item → work item -
cross-team - external - technical - academic.

Analyze: - cycles - chains - dependency depth - blocked descendants -
critical path - cross-team waiting.

## Prompt 15 --- Kanban Dependencies

> Extend the common dependency engine for Kanban.
>
> Detect cycles, chains, blocking impact, cross-team dependencies, and
> critical-path pressure.
>
> Highlight dependencies preventing work from being pulled.
>
> AI must not invent dependencies without evidence.

------------------------------------------------------------------------

# 16. BLOCKER MANAGEMENT

Blocker fields: - blocker ID - work item - category - description -
owner - created/resolved timestamps - severity - affected items -
dependencies - resolution notes.

Lifecycle:

``` text
OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED
```

## Prompt 16 --- Blocker Intelligence

> Implement first-class blocker lifecycle and persistence.
>
> Update aging, flow metrics, dependencies, risk, health, and relevant
> notifications.
>
> Preserve blocker history after resolution.

------------------------------------------------------------------------

# 17. BOTTLENECK DETECTION

Signals: - WIP saturation - queue growth - cycle-time increase - aging
concentration - blocker concentration - downstream starvation - upstream
accumulation - throughput imbalance.

## Prompt 17 --- Bottleneck Engine

> Build deterministic bottleneck detection using WIP saturation, queue
> growth, aging, cycle time, blockers, and throughput imbalance.
>
> Identify constrained stages and explain the evidence.
>
> Recommendations only; never automatically change WIP limits or move
> work.

------------------------------------------------------------------------

# 18. WAITING + FLOW EFFICIENCY

Break flow time into: - active work - waiting - blocked - review -
external.

Example:

``` text
Total: 5d
Active: 2.1d
Waiting: 1.4d
Blocked: 0.9d
Review: 0.6d
```

## Prompt 18 --- Waiting Analysis

> Build deterministic waiting-time and flow-efficiency analysis from
> event timestamps.
>
> Separate active, waiting, blocked, review, and external time where
> supported.
>
> Never treat missing timestamps as zero.

------------------------------------------------------------------------

# 19. TEAM INTELLIGENCE

Show: - role - verified skills - assigned work - active WIP - completed
work - workload - capacity - blockers - aging work - review load -
contribution history - skill gaps - availability.

DAA may recommend capability-compatible work but must not silently
assign it.

## Prompt 19 --- Kanban Team

> Build Kanban-aware team intelligence using existing team and skill
> infrastructure.
>
> Show active WIP, completed flow, workload, blockers, review load,
> availability, skills, gaps, and history.
>
> Use deterministic calculations for recommendations and preserve
> user-owned skill verification.

------------------------------------------------------------------------

# 20. PERSONAL WIP LIMITS

Optional per-user WIP policies.

``` text
Personal WIP limit = 2
Current = 2
New pull → warn/block according to policy
```

Blocked/external waiting work should not be treated as normal overload.

## Prompt 20 --- Personal WIP

> Implement optional per-user WIP policies.
>
> Compare active work with configured limits. Support advisory/hard
> modes and authorized overrides.
>
> Do not punish blocked/external waiting work.

------------------------------------------------------------------------

# 21. BACKLOG QUALITY / REFINEMENT

Detect: - vague descriptions - missing acceptance criteria - missing
dependencies - missing skills - missing evidence - oversized items -
stale items - duplicate work - unclear ownership.

DAA gives readiness signals. AI suggests refinements. User decides.

## Prompt 21 --- Replenishment Quality

> Build backlog-quality and replenishment-readiness analysis.
>
> Detect missing information, oversized/stale work, unresolved
> dependencies, missing skills, and incomplete acceptance criteria.
>
> Never automatically rewrite requirements.

------------------------------------------------------------------------

# 22. INSIGHTS TAB

Current: - throughput - cycle/lead time - WIP - aging - blocked time -
flow efficiency - arrival/completion - SLE attainment - bottlenecks.

Trends: - throughput - cycle time - WIP - aging - blockers - flow
efficiency - SLE - bottlenecks.

## Prompt 22 --- Kanban Insights

> Build Insights from real event history and database state.
>
> Provide current flow metrics and historical trends, explain anomalies,
> and keep deterministic calculation separate from AI interpretation.
>
> Never fabricate metrics.

------------------------------------------------------------------------

# 23. CONTINUOUS DELIVERY REVIEW

Kanban has continuous delivery rather than Sprint Review.

Show: - completed work - acceptance criteria - requirement coverage -
evidence - teacher/stakeholder feedback - delivery date -
defects/follow-ups.

## Prompt 23 --- Continuous Delivery Review

> Implement a Kanban delivery/review workflow for completed work.
>
> Show completed items, acceptance criteria, evidence, requirement
> coverage, feedback, and follow-up work.
>
> Do not introduce mandatory Sprint Review behavior.

------------------------------------------------------------------------

# 24. CONTINUOUS IMPROVEMENT

Analyze: - bottlenecks - WIP violations - aging - blocker causes -
waiting - review delays - service-class behavior - throughput changes -
cycle-time changes - policy violations - requirement quality -
dependency problems.

Recommendations: - reduce WIP - improve review capacity - clarify
Ready/Done - resolve recurring blockers - improve dependencies - refine
service policies - split oversized items.

## Prompt 24 --- Continuous Improvement

> Build Kanban continuous-improvement analysis using current and
> historical flow data.
>
> Identify bottlenecks, recurring blockers, excessive WIP, aging,
> waiting, review delays, and policy problems.
>
> Generate evidence-backed recommendations. Recommendations must never
> automatically modify project state.

------------------------------------------------------------------------

# 25. REACTIVE FLOW ENGINE

Meaningful triggers: - status - WIP limit - estimate - assignment -
dependency - blocker - priority - requirement - availability - skill
verification - deadline - class of service - workflow policy.

``` text
Event
 ↓
Persist
 ↓
Invalidate affected calculations
 ↓
Recalculate deterministic outputs
 ↓
Update health/risk
 ↓
Update recommendations
 ↓
Notify
 ↓
Update UI
```

## Prompt 25 --- Reactive Kanban Engine

> Implement event-driven Kanban reactivity.
>
> Recalculate affected deterministic outputs when meaningful state
> changes occur.
>
> Preserve historical versions/events and expose stale/updated status
> where recalculation is asynchronous.
>
> Never automatically move or reassign work merely because a score
> changed.

------------------------------------------------------------------------

# 26. CHANGE IMPACT INTELLIGENCE

Trace:

``` text
Requirement → Work Item → Dependency → Team/Skill → WIP → Risk → Deadline → Forecast
```

Example:

``` text
Requirement changed
↓
Affected work found
↓
+12h effort
↓
Dependency chain affected
↓
WIP pressure increases
↓
Forecast changes
↓
Risk increases
```

## Prompt 26 --- Kanban Change Impact

> Implement deterministic change-impact analysis.
>
> Trace requirement, story/task, dependency, skill, WIP, risk, deadline,
> and flow forecast effects.
>
> Show the propagation chain and affected work.
>
> Do not automatically rewrite the board/backlog.

------------------------------------------------------------------------

# 27. PROJECT MEMORY + EVENT LOG

Record meaningful events: - work item created - priority/class changed -
item Ready - item pulled - WIP limit changed - blocker
created/resolved - dependency added - status changed - assignment
changed - estimate changed - policy changed - WIP override - delivery
completed - requirement changed - recommendation accepted/rejected.

Example:

``` text
TASK_PULLED
Task: T-017
From: READY
To: IN_PROGRESS
WIP: 3 → 4
WIP Limit: 4
Actor: user
Timestamp: ...
```

## Prompt 27 --- Kanban Event System

> Extend Project Memory/Event Log with Kanban events.
>
> Record meaningful changes with timestamp, actor, previous state, new
> state, policy/context, and relevant project information.
>
> Do not record meaningless UI noise.

------------------------------------------------------------------------

# 28. PROJECT AI / COPILOT

Copilot context: - project - methodology = Kanban - workflow/policies -
WIP limits/current WIP - backlog/Ready queue - active work - blockers -
dependencies - team/skills/workload - risks/deadlines - flow metrics -
memory/events - requirements/teacher input - Project Context.

DAA: - WIP - priority - dependency impact - metrics - aging -
bottlenecks - forecasts - readiness.

AI: - explanation - summary - interpretation - recommendation - natural
language.

## Prompt 28 --- Kanban Copilot

> Make Project Copilot Kanban-aware using structured real project
> context.
>
> Treat deterministic DAA/flow outputs as trusted facts.
>
> Do not let AI invent state.
>
> Preserve separation between Project Copilot, Team Chat, and Global
> Chat.

------------------------------------------------------------------------

# 29. PROJECT CONTEXT / ATTACHMENTS

Support: - PDF - images - Markdown - requirements - architecture
diagrams - ER diagrams - workflow diagrams - specifications - plans -
code/files - teacher documents.

Separate: \### Persistent Project Context Long-lived knowledge.

### Temporary Chat Context

Conversation-only context.

Do not automatically persist every chat/upload.

## Prompt 29 --- Kanban Project Context

> Integrate V4 Project Context into Kanban.
>
> Allow relevant project documents and distinguish persistent knowledge
> from temporary Copilot context.
>
> Make selected context available through structured retrieval.
>
> Do not automatically persist every conversation or attachment.

------------------------------------------------------------------------

# 30. THREE.JS KANBAN DIGITAL TWIN

Spatial model:

``` text
PROJECT
 ├── BACKLOG
 ├── FLOW
 │    ├── READY
 │    ├── IN PROGRESS
 │    ├── REVIEW
 │    └── DONE
 └── TEAM
```

Objects: - project - backlog - workflow columns - work items -
dependencies - blockers - team members - WIP boundaries - bottlenecks -
milestones - risks.

Interactions: - column → WIP/policy - work item → relationships -
dependency → chain - member → work/capacity - blocker → affected work.

## Prompt 30 --- Three.js Digital Twin

> Build reusable Three.js Kanban visualization based on actual project
> state.
>
> Do not create decorative 3D unrelated to data.
>
> Provide interactive relationships and an accessible non-3D
> alternative.
>
> Keep rendering performant.

------------------------------------------------------------------------

# 31. GSAP DATA-DRIVEN FLOW ANIMATION

Example:

``` text
READY → IN_PROGRESS
```

Animate: 1. card movement 2. WIP counter 3. utilization 4. metric update
5. affected dependency state.

## Prompt 31 --- GSAP Kanban Interactions

> Implement purposeful GSAP animations for work movement, WIP changes,
> blockers, bottlenecks, pull events, flow metrics, and insight reveals.
>
> No continuous decorative animation. Respect reduced-motion
> preferences.

------------------------------------------------------------------------

# 32. KANBAN PROJECT HEALTH

Calculate: - Flow Health - WIP Health - Throughput Health - Cycle-Time
Health - Dependency Health - Blocker Health - Team Workload Health -
Backlog Health - Deadline Health - Service-Level Health.

Example:

``` text
KANBAN PROJECT HEALTH
Flow 84%
WIP 62%
Dependencies 71%
Blockers 58%
Team 82%
SLE 76%
Overall 73% — NEEDS ATTENTION
```

## Prompt 32 --- Kanban Health

> Build deterministic Kanban project health from flow, WIP, dependency,
> blocker, team, backlog, deadline, and service-level signals.
>
> Show important factor contributions and keep calculation separate from
> AI interpretation.

------------------------------------------------------------------------

# 33. KANBAN LEARNING LOOP

``` text
Completed flow history
↓
Cycle time / throughput / blockers
↓
Project Memory
↓
Learning Loop
↓
Future replenishment recommendations
```

History is evidence, not certainty.

## Prompt 33 --- Kanban Learning Loop

> Build a learning loop from historical flow evidence.
>
> Use completed work, cycle time, throughput, blockers, aging, WIP
> behavior, and policy outcomes as evidence for future recommendations.
>
> Never automatically change project policies from historical data.

------------------------------------------------------------------------

# 34. NOTIFICATIONS

Useful: - assignment - pull - blocked/unblocked - dependency blocked -
WIP reached/exceeded - aging - SLE risk - bottleneck - fixed-date risk -
expedite - review waiting - teacher requirement change - team changes.

## Prompt 34 --- Kanban Notifications

> Implement event-driven Kanban notifications using existing
> notification infrastructure.
>
> Notify only relevant users, support deduplication/severity/read state,
> and avoid repetitive alerts.

------------------------------------------------------------------------

# 35. PROFESSIONAL CHAT

Keep separate: - Global Chat - Team Chat - Project Copilot.

Support: - headings - bullets - numbered lists - tables - code blocks -
inline code - emphasis - links - structured AI responses.

## Prompt 35 --- Kanban Chat

> Preserve separate human chats and Copilot.
>
> Ensure safe professional Markdown rendering and preserve chat
> persistence, isolation, unread state, and authorization.

------------------------------------------------------------------------

# 36. ACCESS CONTROL

Validate: - authentication - project/team membership - methodology
access - board movement - backlog modification - WIP policy
modification - workflow modification - class-of-service permission -
override permission - requirement access - teacher/reviewer access -
Copilot access.

## Prompt 36 --- Kanban Access Control

> Implement server-side methodology-aware authorization.
>
> Verify board movement, backlog changes, workflow/WIP policy changes,
> overrides, methodology changes, teacher access, attachments, events,
> and Copilot isolation.
>
> UI hiding is not security. Audit sensitive changes.

------------------------------------------------------------------------

# 37. REQUIREMENT → WORK ITEM → DEPENDENCY → TEST → EVIDENCE

``` text
Requirement
 ↓
Story / Work Item
 ↓
Task
 ↓
Dependency
 ↓
Test
 ↓
Evidence
 ↓
Delivery
```

Coverage: - uncovered - partial - covered - verified.

## Prompt 37 --- Kanban Traceability

> Integrate V4 traceability into Kanban.
>
> Preserve Requirement → Story/Work Item → Task → Dependency → Test →
> Evidence → Delivery relationships.
>
> Show coverage gaps and never fabricate evidence.

------------------------------------------------------------------------

# 38. EDGE CASE HARDENING

Test at minimum: 1. WIP limit reached. 2. Urgent work arrives. 3. Work
becomes blocked. 4. Assignee unavailable. 5. Priority changes. 6.
Dependency added after work starts. 7. Circular dependency. 8. Oversized
work item. 9. SLE breach. 10. Bottleneck emerges. 11. Requirement
changes. 12. Workflow column removal. 13. WIP policy changes. 14. Work
item deletion/archive. 15. Skill verification changes. 16. Network
disconnect/reconnect.

Rules: - preserve history - no silent reassignment - no silent
reprioritization of active work - no duplicate events - no destructive
historical deletion.

## Prompt 38 --- Edge-Case Hardening

> Test and harden every Kanban edge case above.
>
> Do not silently mutate work, users, WIP policies, or methodology
> state.
>
> Preserve history/auditability and keep recommendations advisory unless
> explicit deterministic enforcement is specified.

------------------------------------------------------------------------

# 39. PERFORMANCE / EVENT ARCHITECTURE

Avoid: - constant Three.js rerenders - continuous GSAP loops - repeated
full-project queries - repeated AI calls - full-project recalculation
for tiny changes.

Use: - event-driven refresh - selective invalidation - memoization -
debouncing - safe caching - indexed queries - pagination - incremental
visualization.

## Prompt 39 --- Kanban Performance

> Optimize Kanban using event-driven updates, selective invalidation,
> memoization, debouncing, safe caching, indexed queries, pagination,
> and incremental visualization.
>
> Preserve correctness. Do not invoke AI on every state change.

------------------------------------------------------------------------

# 40. BACKEND / SERVICE INFRASTRUCTURE

Recommended service boundaries:

``` text
kanbanMethodologyService
kanbanWorkflowService
kanbanBoardService
kanbanWipService
kanbanPolicyService
kanbanFlowMetricsService
kanbanForecastService
kanbanBlockerService
kanbanBottleneckService
kanbanReplenishmentService
kanbanHealthService
kanbanChangeImpactService
kanbanEventService
```

Services should cover: - methodology/config - workflow transitions -
WIP - policies - board/backlog - replenishment - metrics - forecasting -
blockers - bottlenecks - health - change impact - events.

## Prompt 40 --- Backend Infrastructure

> Implement Kanban backend infrastructure using the existing
> architecture.
>
> Separate methodology rules, workflow transitions, WIP validation,
> policies, metrics, blockers, bottlenecks, replenishment, health,
> change impact, and events into maintainable boundaries.
>
> Reuse common V4 services. Validate all mutations server-side.

------------------------------------------------------------------------

# 41. DATABASE / DATA MODEL

Potential Kanban configuration:

``` text
KanbanConfig
- workflowColumns
- wipPolicies
- pullPolicies
- classesOfService
- definitionOfReady
- definitionOfDone
- agingThresholds
- SLE
- forecastSettings
```

Work metadata:

``` text
classOfService
workflowColumn
readyAt
activeStartedAt
reviewStartedAt
doneAt
blockedAt
blockedDuration
flowMetadata
agingState
```

Persist required historical timestamps. Derive metrics from events where
practical.

## Prompt 41 --- Kanban Data Model

> Extend existing models additively for Kanban configuration and flow
> metadata.
>
> Persist required historical timestamps and policy configuration.
>
> Add indexes for project, methodology, workflow state, timestamps,
> blockers, and event history.
>
> Preserve V3/Waterfall/Scrum compatibility.

------------------------------------------------------------------------

# 42. REALTIME / SOCKETS

Events:

``` text
KANBAN_ITEM_CREATED
KANBAN_ITEM_PULLED
KANBAN_ITEM_MOVED
KANBAN_ITEM_BLOCKED
KANBAN_ITEM_UNBLOCKED
KANBAN_WIP_REACHED
KANBAN_WIP_EXCEEDED
KANBAN_DEPENDENCY_CHANGED
KANBAN_POLICY_CHANGED
KANBAN_PRIORITY_CHANGED
KANBAN_BOTTLENECK_DETECTED
KANBAN_SLE_RISK
KANBAN_DELIVERY_COMPLETED
```

## Prompt 42 --- Kanban Realtime

> Integrate Kanban with existing Socket.IO/project event infrastructure.
>
> Broadcast only authorized project/team events, persist meaningful
> events, prevent duplicates, and ensure
> Board/Overview/Flow/Team/Insights update without full reload.

------------------------------------------------------------------------

# 43. FRONTEND STATE / DATA FLOW

``` text
API / Socket Event
      ↓
Server State
      ↓
Kanban Store / Query Cache
      ↓
Board / Overview / Flow / Team / Insights
      ↓
GSAP / Three.js
```

Server is authoritative for WIP/policy enforcement.

## Prompt 43 --- Kanban Frontend Architecture

> Build Kanban frontend state using the existing React Native + Expo +
> TypeScript architecture.
>
> Keep business rules server-authoritative.
>
> Avoid duplicated DAA/WIP/policy logic in components.
>
> Support realtime, refresh persistence, loading/error/empty states, and
> reconnect handling.

------------------------------------------------------------------------

# 44. V3/V4 FEATURE MAPPING

  Existing Feature    Kanban Behavior
  ------------------- ---------------------------------
  Tasks               Continuous-flow work items
  Priority            Dynamic flow-aware priority
  Sprint logic        Not mandatory
  Dependencies        Flow-aware
  Team Health         WIP/workload/capability aware
  Risk Intelligence   Blocker/dependency/aging aware
  Project Brain       Kanban context
  Decision Engine     Flow recommendations
  Project Sync        Preserved
  GitHub              Preserved
  Global Chat         Preserved/separate
  Team Chat           Preserved/separate
  Skills              Capability-aware pull
  Skill Quiz          Existing verification
  Retrospective       Continuous improvement
  Learning Loop       Historical flow evidence
  Project Health      Kanban health
  Copilot             Kanban-aware
  Resources           Project-context aware
  Project Memory      Flow event history
  Traceability        Requirement → delivery evidence

------------------------------------------------------------------------

# 45. WHAT MUST NOT BE COPIED FROM SCRUM

Do NOT make mandatory: - Sprint creation - Sprint Goal - Sprint
Backlog - fixed Sprint commitment - Sprint Review as core delivery
loop - Sprint Retrospective as core improvement mechanism - Sprint
carry-over - velocity as primary planning metric - Daily Scrum.

Kanban:

``` text
Demand → Replenishment → Ready → Pull → Execute → Review → Done → Continuous Improvement
```

Shared concepts remain: requirements, dependencies, milestones, risks,
skills, DAA, AI, memory, events, traceability, teacher requirements.

------------------------------------------------------------------------

# 46. WHAT MUST NOT BE COPIED FROM WATERFALL

Do NOT make mandatory: - Requirements → Design → Implementation →
Testing gates - sequential phase locking - Waterfall change-request
workflow - phase completion gates - mandatory phase-based execution.

Critical paths/dependencies may be visualized without making execution
sequential.

------------------------------------------------------------------------

# 47. DOMAIN × METHODOLOGY

``` text
Domain × Methodology → Execution Environment
```

Examples: - Software Engineering × Kanban - Academic Research × Kanban -
Cybersecurity × Kanban - Hardware × Kanban - Data Science × Kanban.

Domain can influence templates, evidence, skills, risks, terminology,
and AI context, but explicit Kanban policies remain deterministic.

## Prompt 47 --- Domain-Aware Kanban

> Integrate Kanban with the shared domain-aware V4 architecture.
>
> Allow domain context to influence work-item templates, required
> skills, risks, evidence, terminology, and Copilot context while
> keeping workflow policies explicit and deterministic.

------------------------------------------------------------------------

# 48. ACADEMIC / TEACHER-AWARE KANBAN

Support: - teacher requirements - evaluation criteria - deadlines -
milestones - evidence - requirement coverage - feedback.

``` text
Teacher Requirement → Backlog → Work Item → Evidence → Delivery
```

## Prompt 48 --- Academic Kanban

> Make Kanban suitable for academic projects.
>
> Integrate teacher requirements, evaluation criteria, evidence,
> deadlines, milestones, and traceability.
>
> Teacher importance may influence deterministic priority where
> configured, but cannot silently bypass WIP, authorization,
> dependencies, or safety rules.

------------------------------------------------------------------------

# 49. SECURITY / ISOLATION AUDIT

Verify: - authentication - project/team membership - methodology
isolation - board/backlog/event/attachment isolation - Copilot context
isolation - unauthorized direct API mutations - unauthorized
WIP/workflow changes.

Use multiple users and projects.

## Prompt 49 --- Kanban Security Audit

> Perform a complete authorization and isolation audit with multiple
> users/projects.
>
> Verify users cannot read or mutate another project's board, backlog,
> events, attachments, flow metrics, or Copilot context.
>
> Test frontend and direct backend access. Fix and retest every failure.

------------------------------------------------------------------------

# 50. AUTOMATED TESTING

## Unit tests

Test: - workflow validation - state transitions - WIP - hard/advisory
policy - pull rules - classes of service - priority - dependency graph -
cycle detection - bottlenecks - aging - cycle/lead time - throughput -
flow efficiency - SLE - blockers - forecasting - permissions - change
impact.

## Integration journey

``` text
Create Kanban Project
→ configure workflow
→ configure WIP
→ create backlog
→ replenish
→ pull
→ execute
→ block
→ dependency impact
→ recalculate flow/DAA
→ update health
→ complete
→ metrics
→ delivery
→ continuous improvement
→ preserve history
```

## Prompt 50 --- Automated Kanban Testing

> Implement comprehensive Kanban unit and integration tests for
> deterministic engines, workflow rules, authorization, events, and the
> full user journey.
>
> Report exact counts and commands. Fix failures and rerun affected
> suites plus regression tests.
>
> Do not count unrelated tests as Kanban coverage.

------------------------------------------------------------------------

# 51. REAL-BROWSER VERIFICATION

Unit tests alone do not prove UX.

Use real browser/Chromium and realistic data.

Verify: - methodology selector - Setup - Board - WIP enforcement -
Backlog/Replenishment - Flow - Team - Insights - Policies - Project AI -
attachments/context - persistence/refresh - Socket.IO updates -
notifications - Markdown - Three.js - 2D fallback - GSAP - reduced
motion - keyboard access - responsive desktop/tablet/mobile -
auth/isolation.

## Prompt 51 --- Full Browser Verification

> Launch the real frontend and backend and use a real Chromium/browser
> session.
>
> Create a realistic Kanban project with multiple users, work items,
> dependencies, blockers, WIP limits, skills, requirements, and
> historical events.
>
> Manually verify every Kanban tab and the full continuous-flow journey.
>
> Verify persisted state, refresh, realtime updates, authorization,
> responsive layouts, accessibility, reduced motion, Three.js, and GSAP.
>
> Record evidence where useful. Fix discovered bugs and retest. Do not
> stop at superficial visual checks.

------------------------------------------------------------------------

# 52. FULL KANBAN USER JOURNEY

``` text
CREATE PROJECT
↓
SELECT KANBAN
↓
KANBAN SETUP
↓
CONFIGURE WORKFLOW
↓
CONFIGURE WIP / POLICIES
↓
OVERVIEW
↓
CREATE / IMPORT REQUIREMENTS
↓
CREATE BACKLOG
↓
REFINE WORK
↓
DAA PRIORITY / READINESS
↓
REPLENISH
↓
READY QUEUE
↓
PULL WORK
↓
EXECUTE
↓
BLOCKER / DEPENDENCY MONITORING
↓
FLOW METRICS
↓
BOTTLENECK / AGING
↓
REVIEW / VALIDATE
↓
DONE / DELIVERY
↓
PROJECT MEMORY
↓
CONTINUOUS IMPROVEMENT
↓
NEXT REPLENISHMENT
↓
REPEAT
```

------------------------------------------------------------------------

# 53. IMPLEMENTATION ORDER

``` text
Phase 0  V3/V4 Safety Audit
Phase 1  Methodology Engine
Phase 2  Kanban Data Model / Configuration
Phase 3  Kanban UI/UX
Phase 4  Setup Wizard
Phase 5  Board + Workflow Engine
Phase 6  WIP + Policy Engine
Phase 7  Backlog + Replenishment
Phase 8  Dynamic Priority / DAA
Phase 9  Dependencies + Blockers
Phase 10 Flow Metrics
Phase 11 Aging + SLE + Forecasting
Phase 12 Bottleneck Intelligence
Phase 13 Team + Personal WIP
Phase 14 Insights + Health
Phase 15 Delivery Review + Continuous Improvement
Phase 16 Reactive Flow Engine
Phase 17 Change Impact
Phase 18 Project Memory / Events
Phase 19 Project AI
Phase 20 Project Context / Attachments
Phase 21 Three.js Digital Twin
Phase 22 GSAP Animation
Phase 23 Chat Rendering
Phase 24 Access Control / Security
Phase 25 Notifications
Phase 26 Traceability / Academic Features
Phase 27 Performance
Phase 28 Automated Testing
Phase 29 Real Browser Verification
Phase 30 Final Integration / Regression
```

------------------------------------------------------------------------

# 54. FINAL INTEGRATION REQUIREMENTS

Before declaring Kanban complete: 1. Run all Kanban unit tests. 2. Run
all Kanban integration tests. 3. Run TypeScript/build/syntax checks. 4.
Run V3 regression. 5. Run Waterfall regression. 6. Run Scrum regression.
7. Verify methodology selector. 8. Verify NexusFlow Classic. 9. Verify
Waterfall. 10. Verify Scrum. 11. Verify Kanban. 12. Verify Hybrid
remains WIP. 13. Verify no unnecessary V3 files were deleted. 14. Verify
real browser. 15. Verify responsive layouts. 16. Verify
accessibility/reduced motion. 17. Verify realtime behavior. 18. Verify
multi-user isolation. 19. Verify no fake metrics.

------------------------------------------------------------------------

# 55. DEFINITION OF DONE

Kanban V4 is ready only when:

-   [ ] Kanban selectable during project creation.
-   [ ] Setup Wizard works.
-   [ ] All 8 tabs work.
-   [ ] Board works.
-   [ ] Workflow columns work.
-   [ ] WIP limits work.
-   [ ] Hard/advisory WIP policies work.
-   [ ] Pull policies work.
-   [ ] Backlog works.
-   [ ] Replenishment works.
-   [ ] Dynamic priority works.
-   [ ] DAA deterministic.
-   [ ] Classes of Service work.
-   [ ] Dependencies work.
-   [ ] Critical path/blocking analysis works.
-   [ ] Blocker lifecycle works.
-   [ ] Aging detection works.
-   [ ] Throughput works.
-   [ ] Cycle time works.
-   [ ] Lead time works.
-   [ ] Flow efficiency works.
-   [ ] SLE/forecasting works where data is sufficient.
-   [ ] Bottleneck detection works.
-   [ ] Team capability/skills influence recommendations.
-   [ ] Personal WIP works where enabled.
-   [ ] Flow history is meaningful.
-   [ ] Insights use real state.
-   [ ] Kanban health is deterministic/explainable.
-   [ ] Continuous-improvement recommendations work.
-   [ ] Recommendations never automatically modify project state.
-   [ ] Reactive recalculation works.
-   [ ] Change Impact works.
-   [ ] Project Memory records events.
-   [ ] Learning Loop uses historical evidence.
-   [ ] Project AI understands Kanban.
-   [ ] Copilot separate from Team/Global Chat.
-   [ ] Project Context/attachments work.
-   [ ] Three.js reflects real project data.
-   [ ] Accessible non-3D fallback works.
-   [ ] GSAP responds to meaningful changes.
-   [ ] Premium neutral UI is consistent.
-   [ ] Mobile/tablet/desktop work.
-   [ ] Reduced-motion/accessibility work.
-   [ ] Notifications are event-driven/non-spammy.
-   [ ] Traceability works.
-   [ ] Academic/teacher requirements work.
-   [ ] Authentication/project isolation verified.
-   [ ] NexusFlow Classic remains functional.
-   [ ] Waterfall remains functional.
-   [ ] Scrum remains functional.
-   [ ] Hybrid remains available as WIP.
-   [ ] No unnecessary existing files deleted.
-   [ ] Automated tests pass.
-   [ ] Real-browser verification passes.
-   [ ] Full Kanban integration journey passes.

------------------------------------------------------------------------

# 56. FINAL AUDIT MATRIX

At the end of implementation produce:

  ------------------------------------------------------------------------------
  Area              Implemented    Automated      Browser   Regression Status
                                      Tested       Tested       Tested 
  --------------- ------------- ------------ ------------ ------------ ---------
  Methodology                                                          
  Engine                                                               

  Setup Wizard                                                         

  Board                                                                

  WIP Engine                                                           

  Policies                                                             

  Backlog                                                              

  Replenishment                                                        

  Priority / DAA                                                       

  Dependencies                                                         

  Blockers                                                             

  Flow Metrics                                                         

  Aging / SLE                                                          

  Bottlenecks                                                          

  Team                                                                 

  Insights                                                             

  Health                                                               

  Continuous                                                           
  Improvement                                                          

  Reactive Engine                                                      

  Change Impact                                                        

  Project Memory                                                       

  Project AI                                                           

  Project Context                                                      

  Three.js                                                             

  GSAP                                                                 

  Chat                                                                 

  Access Control                                                       

  Notifications                                                        

  Traceability                                                         

  Academic                                                             
  Features                                                             

  Performance                                                          

  V3 Regression                                                        

  Waterfall                                                            
  Regression                                                           

  Scrum                                                                
  Regression                                                           
  ------------------------------------------------------------------------------

Do not mark PASS merely because code exists.

------------------------------------------------------------------------

# 57. MASTER EXECUTION PROMPT

> Read the COMPLETE `NexusFlow_V4_Kanban_Implementation_Plan.md` before
> implementing anything.
>
> Execute the implementation sequentially through all prompts and
> supporting requirements in this document.
>
> This is an implementation task, not a high-level planning exercise.
>
> Do not stop for approval between prompts.
>
> Do not restart or reimplement existing V3, Waterfall, or Scrum
> functionality unnecessarily.
>
> Kanban must be a genuine continuous-flow environment, not a renamed
> Scrum board.
>
> Do not introduce mandatory Sprints, Sprint Goals, Sprint Backlogs, or
> Waterfall phase gates into Kanban.
>
> DAA must remain deterministic. AI must remain explanatory/advisory.
> User/team retains final decision authority.
>
> Implement backend, database, APIs, frontend, realtime events, state
> management, UI/UX, WIP/policy engines, flow metrics, blockers,
> dependencies, memory, Copilot, Project Context, Three.js, GSAP,
> notifications, authorization, traceability, and testing.
>
> Use real persisted project state. Do not use fake metrics or hardcoded
> demo behavior.
>
> After implementation: 1. Run Kanban tests. 2. Run integration tests.
> 3. Run TypeScript/build/syntax checks. 4. Run V3 regression. 5. Run
> Waterfall regression. 6. Run Scrum regression. 7. Launch
> frontend/backend. 8. Perform real-browser verification. 9. Test
> desktop/tablet/mobile. 10. Test accessibility/reduced motion. 11. Test
> realtime. 12. Test multiple users/project isolation. 13. Fix every
> discovered bug. 14. Retest after fixes. 15. Produce the final audit
> matrix.
>
> Do not fabricate results. Do not declare COMPLETE unless
> implementation and verification evidence support it.

------------------------------------------------------------------------

# 58. CENTRAL V4 KANBAN PRINCIPLE

> **Kanban is not a board. Kanban is a continuously flowing,
> WIP-controlled, evidence-driven project execution environment.**

``` text
DEMAND
  ↓
REPLENISH
  ↓
PULL
  ↓
EXECUTE
  ↓
OBSERVE
  ↓
CALCULATE
  ↓
EXPLAIN
  ↓
DELIVER
  ↓
LEARN
  ↓
IMPROVE FLOW
  ↓
REPLENISH BETTER
```

Where:

**DAA = Calculate**

**AI = Explain / Assist**

**Project Memory = Remember**

**Flow Analysis = Observe**

**User/Team = Decide**

**Three.js = Visualize**

**GSAP = Communicate Change**

The same NexusFlow Core remains underneath; the methodology changes how
the project operates.
