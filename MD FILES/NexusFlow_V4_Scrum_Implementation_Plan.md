# NexusFlow V4.0 — Scrum Methodology Implementation Plan

> **Purpose:** Detailed implementation blueprint for the V4 Scrum project environment.
>
> **Important:** This document is a planning and implementation specification. It does not replace the existing V3 system. Existing V3 functionality must remain safe and reusable.
>
> **Primary rule:** Scrum is a real project execution environment, not a methodology label. Selecting Scrum changes the project's workflow, planning rules, sprint behavior, metrics, AI context, DAA behavior, retrospective context, and visualization.

---

# 0. V4 SAFETY BASELINE

## Objective

Build Scrum on top of the working V3 foundation without breaking production or deleting working V3 files.

## Existing environments

NexusFlow will have five project-entry choices:

1. **NexusFlow** — Classic V3 environment
2. **Waterfall** — V4 sequential phase environment
3. **Scrum** — V4 sprint-based environment
4. **Kanban** — Work in Progress
5. **Hybrid** — Work in Progress

**NexusFlow is NOT a methodology.** It is the existing V3/Classic project environment.

## Hard requirements

- Do not delete existing V3 files.
- Do not rewrite working V3 features unnecessarily.
- Create new Scrum components/services/configuration where practical.
- Reuse existing V3 engines where they already solve the problem.
- Preserve the existing Retrospective behavior.
- Do not silently migrate existing V3 projects to Scrum.
- Do not silently change methodology.
- Keep DAA deterministic and separate from AI.
- AI may explain/recommend; it must not replace deterministic DAA calculations.
- Global Chat, Team Chat, and Project Copilot remain separate.
- Retrospective recommendations must never automatically modify project state.
- Skill verification remains user-owned; teammates cannot manually modify another user's verified skill level.
- All new state changes require authorization and auditability.

## Prompt 0 — Repository Safety

> Before implementing Scrum, inspect the existing V3 project creation, project index, tabs, tasks, teams, skills, DAA, Risk Intelligence, Project Health, Retrospective, Project Brain, Decision Engine, Copilot, Project Memory, notifications, chat, and routing code.
>
> Identify reusable services/components and identify where Scrum-specific adapters/configuration should be introduced.
>
> Do not delete or replace existing V3 files. Prefer additive V4 architecture.
>
> Preserve the Classic NexusFlow environment exactly as a supported project mode.

---

# 1. SCRUM PRODUCT MODEL

## Goal

Introduce Scrum as a first-class methodology in the existing NexusFlow methodology engine.

The conceptual model is:

```text
NexusFlow Core
      ↓
Methodology Engine
      ↓
SCRUM
      ↓
Scrum Configuration
      ↓
Scrum Execution Environment
```

Scrum should control:

- Product Backlog
- User Stories
- Sprint creation
- Sprint Goal
- Sprint Backlog
- Sprint capacity
- Sprint planning
- task execution
- dependencies
- blockers
- sprint progress
- Sprint Review
- current Sprint Retrospective
- learning from previous Sprints
- Scrum-specific AI context
- Scrum-specific DAA planning
- Scrum-specific visualizations.

## Core Scrum states

Use a clear state model.

```text
BACKLOG
   ↓
SELECTED_FOR_SPRINT
   ↓
TODO
   ↓
IN_PROGRESS
   ↓
IN_REVIEW
   ↓
DONE
```

Additional states:

```text
BLOCKED
CARRIED_OVER
CANCELLED
```

Do not allow arbitrary transitions that violate Scrum rules.

## Prompt 1 — Scrum Methodology Engine

> Add Scrum as a methodology configuration in the V4 methodology engine.
>
> Define Scrum-specific lifecycle rules, Sprint entities, Product Backlog behavior, Sprint Backlog behavior, Sprint Goal, capacity rules, task states, dependency behavior, ceremony metadata, retrospective context, and Scrum metrics.
>
> Keep the underlying project/task/team models reusable.
>
> Do not create a completely separate application. Build Scrum as a methodology-specific execution layer over the common NexusFlow core.

---

# 2. SCRUM SETUP WIZARD

## User journey

```text
Create Project
      ↓
Project Name
      ↓
Domain
      ↓
Team
      ↓
Methodology
      ↓
SCRUM
      ↓
Scrum Setup Wizard
      ↓
Create Scrum Project
```

## Setup fields

### Project information

- Project name
- description
- domain
- academic/project category
- teacher/faculty requirements
- deadline
- milestone/demo date

### Scrum configuration

- Sprint duration
- default Sprint length
- preferred Sprint start
- Sprint Goal
- team members
- availability
- working capacity
- Product Owner / Scrum Master / Developers where applicable
- project-specific roles.

### Initial backlog

Allow:

- manual story creation
- requirements import
- teacher requirements
- AI-assisted story suggestions
- V3 project/task migration only when explicitly requested.

## Setup explanation

The UI should explain:

> Scrum organizes work into short, fixed-length Sprints. The team selects valuable work from the Product Backlog, works toward a Sprint Goal, reviews the resulting increment, and improves its process through Retrospective.

## Prompt 2 — Scrum Setup

> Build the Scrum Setup Wizard using the existing project creation architecture.
>
> Add clear explanations for Scrum concepts before the project is created.
>
> Collect Sprint configuration, team capacity, Scrum roles, project requirements, deadline, milestones, and initial backlog information.
>
> Validate invalid configurations before project creation.
>
> Do not create a Sprint automatically unless the user explicitly confirms the initial Sprint plan.

---

# 3. V4 UI/UX DESIGN SYSTEM FOR SCRUM

## Visual direction

The Scrum environment should be a complete visual upgrade.

### Color direction

Use:

- cream
- ivory
- warm white
- beige
- sand
- muted olive
- muted brown
- charcoal
- graphite
- soft neutral borders.

Avoid:

- neon cyan
- neon purple
- neon pink
- excessive blue/purple AI gradients
- excessive glow
- overly saturated dashboards.

## Cards

Use:

- soft glass cards
- restrained glassmorphism
- subtle morphism/neumorphism
- layered surfaces
- soft shadows
- low-contrast borders
- depth through spacing and elevation.

## Tailwind CSS

Tailwind is the primary styling system.

Example design vocabulary:

```text
bg-stone-50
bg-amber-50
bg-neutral-950
text-stone-900
text-stone-600
border-stone-200/70
rounded-2xl
rounded-3xl
shadow-sm
shadow-xl
backdrop-blur
```

Do not blindly copy these exact classes everywhere. Build reusable design tokens/components.

## Bootstrap JS

Use Bootstrap JS only when it provides useful interaction primitives.

Do not allow Bootstrap and Tailwind to fight over layout.

Tailwind = primary layout/design system.

Bootstrap JS = selective interactive behavior where useful.

## Three.js

Use Three.js only where spatial visualization provides actual value.

Possible Scrum visualizations:

- Sprint Flow Map
- Product Backlog landscape
- dependency network
- team capacity visualization
- Sprint health visualization
- project digital twin
- Sprint-to-Sprint history.

## GSAP

Use GSAP for:

- page entrance
- tab transitions
- card reveal
- backlog movement
- Sprint start animation
- task state transitions
- dependency highlighting
- retrospective insight reveal
- meaningful data-change animation.

### Core V4 animation principle

```text
Data changes
      ↓
Visual state changes
      ↓
Animation
      ↓
User understands what changed
```

## Prompt 3 — Scrum Visual System

> Redesign the Scrum environment using a premium cream/ivory/neutral visual language.
>
> Use Tailwind CSS as the primary styling system.
>
> Use restrained glassmorphism, soft morphism, layered cards, premium typography, subtle shadows, smooth transitions, and responsive layouts.
>
> Avoid neon colors and excessive AI-style gradients/glows.
>
> Use Three.js only for meaningful project/sprint/dependency/team visualizations.
>
> Use GSAP for purposeful transitions and state-change animations.
>
> Support desktop, tablet, and mobile layouts.
>
> Add reduced-motion support and keyboard-accessible interactions.

---

# 4. SCRUM NAVIGATION / TABS

The Scrum environment will contain **8 primary tabs**:

1. Overview
2. Plan
3. Tasks
4. Timeline
5. Team
6. Insights
7. Retrospective
8. Project AI

This keeps the high-level environment consistent with the Waterfall environment while changing the content and behavior inside each tab.

## Navigation rule

```text
NexusFlow Classic
→ existing V3 index + existing V3 tabs

Waterfall
→ V4 Waterfall environment

Scrum
→ V4 Scrum environment

Kanban
→ Work in Progress

Hybrid
→ Work in Progress
```

---

# 5. OVERVIEW TAB

## Purpose

The Overview tab is the live home of the current Scrum project.

Example:

**AI-Based Student Performance Prediction System**

```text
Sprint 03
Goal:
Build and integrate the student prediction API

Day 5 / 10

Sprint Progress
72%

Completed       8
In Progress     3
Blocked         1
Remaining       4
```

## Overview sections

- current Sprint
- Sprint Goal
- Sprint progress
- Sprint health
- capacity utilization
- workload
- blocked work
- dependency alerts
- risks
- deadline status
- Product Backlog summary
- upcoming Scrum events
- recent project activity.

## Dynamic behavior

If a task changes:

```text
Task changes
↓
DAA recalculation
↓
Sprint metrics update
↓
Health changes if necessary
↓
Overview visualizes the change
```

## Prompt 4 — Scrum Overview

> Build a live Scrum Overview dashboard.
>
> Show the current Sprint, Sprint Goal, progress, completed/in-progress/blocked work, remaining estimated work, capacity utilization, workload, dependencies, risks, deadline status, backlog summary, and upcoming Scrum events.
>
> The dashboard must refresh from current database state.
>
> Do not use hardcoded demo metrics.
>
> Connect visual indicators to real project state and animate meaningful state changes with GSAP.

---

# 6. PLAN TAB

## Purpose

Plan is the central Scrum planning environment.

It contains:

### Product Backlog

Each Product Backlog Item can contain:

- ID
- title
- user story
- description
- acceptance criteria
- business value
- priority
- effort/story points
- estimated hours
- dependencies
- required skills
- risk
- milestone
- teacher importance
- technical uncertainty
- expected value.

## Example

```text
US-04
As a teacher,
I want student prediction results
so that I can identify students needing support.
```

## Backlog states

```text
BACKLOG
SELECTED
IN SPRINT
DONE
CANCELLED
```

## Sprint Planning

User selects:

**Create Sprint**

Then:

- Sprint name
- Sprint duration
- Sprint Goal
- team
- available capacity
- candidate backlog items.

DAA analyzes candidate work.

## DAA must consider

- priority
- business value
- effort
- deadline pressure
- dependencies
- blocking potential
- risk
- expected value
- technical uncertainty
- teacher importance
- milestone importance
- team capacity
- skill availability
- critical path
- existing workload
- Sprint constraints.

## Important

DAA recommends what can fit.

The user/team retains control over final Sprint selection.

## Prompt 5 — Product Backlog + Sprint Planning

> Build the Scrum Plan tab around the Product Backlog and Sprint Planning workflow.
>
> Allow users to create, edit, prioritize, filter, inspect, and organize Product Backlog Items.
>
> Add Sprint creation with Sprint Goal, duration, team capacity, and candidate work.
>
> Connect the planning process to the existing deterministic DAA engine.
>
> DAA must calculate explainable planning scores using priority, value, effort, dependencies, risk, deadlines, capacity, skills, workload, and other configured factors.
>
> The UI must show why an item is recommended or not recommended.
>
> Never allow AI to replace the DAA calculation.

---

# 7. DYNAMIC PRIORITY ENGINE

## Goal

Fix the V3 issue where tasks can receive overly similar priority numbers.

Scrum needs a richer and reactive priority system.

## Priority factors

Use configurable weighted factors such as:

- business impact
- urgency
- deadline pressure
- dependency importance
- blocking potential
- risk
- effort
- expected value
- technical uncertainty
- teacher importance
- milestone importance
- capacity
- skill availability
- critical path
- workload.

## Dynamic recalculation

Recalculate when:

- criticality changes
- business value changes
- assigned teammate changes
- estimated hours change
- urgency changes
- deadline changes
- dependency changes
- blocking potential changes
- risk changes
- impact changes
- effort changes
- expected value changes
- technical uncertainty changes
- teacher importance changes
- milestone importance changes
- capacity changes
- skill availability changes
- workload changes
- critical path changes.

## Scrum-specific effect

When priority changes:

```text
Priority recalculated
↓
Backlog ranking changes
↓
Sprint candidate set may change
↓
Capacity checked
↓
Sprint recommendation updated
```

If the Sprint is already active, do not silently remove committed work.

Follow Scrum-safe replanning rules.

## Prompt 6 — Dynamic Scrum Priority

> Upgrade the existing deterministic priority system for Scrum.
>
> Implement reactive recalculation when any configured priority/planning factor changes.
>
> Preserve explainability: show the contribution of important factors to the result.
>
> Re-rank eligible Product Backlog Items after recalculation.
>
> Do not rewrite completed historical work.
>
> Do not automatically remove an active Sprint item because its priority changed. Flag the planning impact and require an explicit user/team decision.

---

# 8. SPRINT BACKLOG

## Sprint Backlog contains

- selected Product Backlog Items
- tasks/subtasks
- Sprint Goal
- owners
- estimates
- dependencies
- risks
- capacity allocation
- status.

## Sprint example

```text
Sprint 03

Goal:
Build and integrate prediction API

US-04 Prediction API
 ├── Database schema
 ├── API contract
 ├── Backend implementation
 ├── ML integration
 └── API testing
```

## Relationship

```text
Product Backlog Item
        ↓
Sprint Backlog Item
        ↓
Task
        ↓
Execution
```

Maintain traceability.

---

# 9. TASKS TAB

## Purpose

Tasks show actual Sprint execution.

Task information:

- task ID
- parent story
- Sprint
- assignee
- status
- priority
- estimate
- actual effort
- required skills
- dependencies
- blockers
- due date
- risk
- milestone
- activity history.

## Task states

```text
TODO
IN_PROGRESS
IN_REVIEW
DONE
BLOCKED
CARRIED_OVER
```

## Dynamic task behavior

If a task becomes blocked:

- dependency state updates
- Sprint health updates
- DAA recalculates eligible planning impact
- risk intelligence evaluates impact
- Overview updates
- Project AI receives updated context.

## Prompt 7 — Scrum Tasks

> Build the Scrum Tasks tab using the existing V3 task infrastructure where possible.
>
> Add Sprint-aware task context.
>
> Every task must know its Product Backlog Item, Sprint, assignee, dependencies, skills, estimate, actual effort, status, risk, and history.
>
> Preserve task history.
>
> Prevent invalid state transitions.
>
> When a task changes, publish the appropriate project event so DAA, risk, health, memory, and UI can react.

---

# 10. DEPENDENCY ENGINE

## Scrum dependency model

Dependencies can exist:

- between stories
- between tasks
- between Sprint items
- across Sprints.

Example:

```text
Database Schema
      ↓
Backend API
      ↓
ML Integration
      ↓
Prediction Testing
```

## DAA

Use deterministic graph analysis:

- dependency traversal
- topological sorting
- cycle detection
- critical path
- blocking impact.

## Edge case: circular dependency

Example:

```text
A → B
B → C
C → A
```

Reject or flag it.

Do not allow the project to pretend that the dependency graph is valid.

## Edge case: dependency crosses Sprint

If Sprint 3 contains:

> Backend API

and it depends on a Sprint 4 task:

> Database migration

flag:

**Invalid/High-Risk Sprint Dependency**

The system should recommend resolving the dependency or replanning.

## Prompt 8 — Scrum Dependency Engine

> Extend the dependency engine for Scrum.
>
> Support story/task dependencies across Product Backlog and Sprints.
>
> Detect cycles using deterministic graph algorithms.
>
> Calculate dependency impact, blocking chains, and critical paths.
>
> Identify cross-Sprint dependencies that can threaten the Sprint Goal.
>
> Never let AI invent dependency relationships without explicit project evidence.

---

# 11. TIMELINE TAB

## Scrum timeline

The Timeline is Sprint-centric.

Example:

```text
Sprint 1
|----------------|

Sprint 2
        |----------------|

Sprint 3
                |----------------|

Sprint 4
                        |----------------|
```

Show:

- Sprint dates
- Sprint Goals
- milestones
- major stories
- dependencies
- deadlines
- risks
- Sprint progress.

## Historical timeline

Past Sprints should remain visible.

This creates:

```text
Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4
```

with actual project history.

## Prompt 9 — Scrum Timeline

> Build a Sprint-oriented Timeline.
>
> Visualize Sprint dates, Sprint Goals, milestones, stories, dependencies, risks, deadlines, and actual progress.
>
> Preserve historical Sprints.
>
> Allow users to inspect why schedule or Sprint planning changed.
>
> Use subtle GSAP transitions for changes and optional Three.js visualization for high-level project history.

---

# 12. TEAM TAB

## Scrum team intelligence

Show:

- Scrum role
- verified skills
- assigned stories
- assigned tasks
- Sprint capacity
- allocated hours
- remaining capacity
- workload
- blockers
- availability
- skill gaps
- contribution history.

Example:

```text
Rahul
ML Engineer

Capacity: 30h
Allocated: 26h
Remaining: 4h

ML: Verified
Python: Verified
LLM: Verified
```

## Skill permissions

A user can increase/decrease their own verified skill only through the verification workflow.

No teammate should manually edit another user's verified skill.

## Team planning

DAA can use:

- available capacity
- workload
- required skills
- verified skills
- task estimates
- dependencies.

But recommendations should not silently assign people.

## Prompt 10 — Scrum Team

> Build Sprint-aware team planning using existing V3 team and skill infrastructure.
>
> Show member roles, verified skills, Sprint assignments, workload, capacity, blockers, and skill availability.
>
> Use deterministic capacity/skill calculations for recommendations.
>
> Preserve user-owned skill verification permissions.
>
> Do not allow teammates to manually modify another user's verified skill state.

---

# 13. TEAM CAPACITY + LOAD BALANCING

## Example

```text
Rahul       28/30h
Ananya      30/30h
Kiran       18/30h
Arjun       12/30h
```

If a new 10-hour task requires Backend:

Ananya is already full.

The system can recommend:

- move another compatible task
- assign to another verified capable member
- reduce Sprint scope
- split the task
- delay the item.

It must explain the reason.

## Branch and Bound

The existing deterministic Branch and Bound idea can be used where appropriate for team/task allocation optimization.

It should consider:

- capacity
- skills
- task dependencies
- workload
- task value
- Sprint Goal
- critical path.

## Prompt 11 — Capacity Optimization

> Extend deterministic allocation logic for Scrum Sprint planning.
>
> Consider capacity, skills, workload, task dependencies, task value, Sprint Goal importance, and critical path.
>
> Produce explainable recommendations.
>
> Never silently reassign teammates or change Sprint commitments.

---

# 14. INSIGHTS TAB

## Purpose

Scrum Insights should explain current project health.

## Sprint metrics

- planned work
- completed work
- remaining work
- carried-over work
- blocked work
- estimated hours
- actual hours
- capacity utilization
- task aging
- dependency delay
- risk level
- Sprint Goal progress.

## Team metrics

- workload balance
- capacity utilization
- skill availability
- blockers
- contribution patterns.

## Product metrics

- backlog size
- high-priority items
- stale items
- dependency-heavy items
- requirement coverage.

## Trend metrics

Across completed Sprints:

- planned vs completed
- carry-over trend
- blocker trend
- estimation accuracy
- cycle time
- risk trend.

## Prompt 12 — Scrum Insights

> Build Scrum Insights from real project events and current database state.
>
> Provide current Sprint metrics and historical Sprint trends.
>
> Explain anomalies rather than presenting unexplained numbers.
>
> Keep deterministic calculations separate from AI-generated interpretation.

---

# 15. RETROSPECTIVE TAB

## CRITICAL REQUIREMENT

**Retrospective must retain the existing V3 Retrospective behavior.**

It should analyze the **current Sprint**, just as the current V3 Retrospective analyzes current project/task data.

Do not turn it into a generic feedback form.

## Current Sprint analysis

When the user opens Retrospective:

```text
Current Sprint
      ↓
Collect current Sprint data
      ↓
Analyze
      ↓
Generate observations
      ↓
Generate recommendations
```

## Analyze

- current Sprint tasks
- completed tasks
- incomplete tasks
- in-progress tasks
- blocked tasks
- planned vs actual work
- delays
- dependencies
- priority changes
- workload
- team contribution signals
- risks
- estimation accuracy
- carry-over risk
- Sprint Goal progress
- project events/history.

## Example

```text
Sprint 04

Planned: 12 tasks
Completed: 8
In Progress: 2
Blocked: 1
TODO: 1

Progress: 67%
```

Retrospective can produce:

### What is going well

> Backend and database work are progressing within estimated capacity.

### What needs attention

> Two high-dependency tasks are creating downstream pressure on integration.

### Why

> The dependency chain was not fully resolved before Sprint commitment.

### Recommendation

> Validate dependency chains during the next Sprint Planning session.

## Current Sprint ≠ Previous Sprint

During an active Sprint:

**Retrospective analyzes the current Sprint state.**

After Sprint completion:

**The same Retrospective system can analyze the final Sprint state and preserve the result as historical learning.**

## Learning Loop

```text
Current Sprint
      ↓
Retrospective
      ↓
Recommendation
      ↓
Project Memory
      ↓
Learning Loop
      ↓
Future Sprint Planning
```

## No automatic modification

Retrospective can recommend:

- reduce Sprint scope
- clarify dependencies
- improve estimates
- improve task breakdown
- rebalance workload
- verify missing skills
- review blocked work.

It must NOT automatically:

- change task priority
- reassign users
- delete tasks
- change Sprint Goal
- close a Sprint
- modify verified skills.

## Prompt 13 — Scrum Retrospective

> Reuse the existing V3 Retrospective engine and UI behavior wherever possible.
>
> Make the Retrospective explicitly Sprint-aware.
>
> When opened during an active Sprint, analyze the CURRENT Sprint using actual current database state.
>
> Analyze tasks, progress, blockers, dependencies, workload, priorities, risks, estimates, carry-over, Sprint Goal progress, and relevant project events.
>
> Present observations and recommendations in the same useful style as the existing V3 Retrospective.
>
> Do not turn this into a simple feedback form.
>
> After Sprint completion, preserve the final analysis as historical project learning.
>
> Recommendations must never automatically modify project state.

---

# 16. SPRINT REVIEW

## Purpose

Sprint Review represents inspection of the completed increment.

It can be represented inside Overview/Plan/Retrospective workflow without necessarily becoming another primary tab.

## Review information

- Sprint Goal
- completed stories
- incomplete stories
- demo-ready work
- acceptance criteria
- requirement coverage
- stakeholder/teacher feedback
- accepted/rejected work
- follow-up backlog items.

## Example

```text
Sprint Goal:
Complete prediction API integration

Goal status:
PARTIALLY ACHIEVED

Completed:
8/10 tasks

Follow-up:
2 items returned to Product Backlog
```

## Prompt 14 — Sprint Review

> Add a Sprint Review workflow that evaluates the Sprint Goal and completed increment.
>
> Show completed work, incomplete work, acceptance criteria, requirement coverage, teacher/stakeholder feedback, and follow-up backlog items.
>
> Preserve the distinction between Sprint Review and Retrospective:
>
> Sprint Review = inspect the product/increment.
>
> Retrospective = inspect the team's process and current Sprint behavior.

---

# 17. SPRINT LIFECYCLE

## Complete lifecycle

```text
PRODUCT BACKLOG
      ↓
BACKLOG REFINEMENT
      ↓
SPRINT PLANNING
      ↓
SPRINT START
      ↓
DAILY EXECUTION
      ↓
DAILY SCRUM / PROGRESS
      ↓
RISK + DEPENDENCY MONITORING
      ↓
DYNAMIC DAA RECALCULATION
      ↓
SPRINT REVIEW
      ↓
RETROSPECTIVE
      ↓
LEARNING LOOP
      ↓
NEXT SPRINT
```

## Prompt 15 — Sprint Lifecycle

> Implement the Scrum lifecycle as a stateful workflow.
>
> Prevent invalid lifecycle transitions.
>
> Preserve event history for Sprint creation, planning, start, task movement, blockers, replanning, review, Retrospective, completion, and carry-over.
>
> Make every transition auditable.

---

# 18. BACKLOG REFINEMENT

## Purpose

Prepare future Product Backlog Items before Sprint Planning.

Refinement can include:

- clarify story
- acceptance criteria
- split oversized story
- identify dependencies
- identify required skills
- estimate effort
- identify risk
- identify missing requirements.

AI can help explain or suggest.

DAA can calculate deterministic values.

## Example

A story is too large:

```text
Build complete ML platform
```

Recommendation:

```text
Split into:

1. Data ingestion
2. Feature engineering
3. Model training
4. Prediction API
5. Evaluation
```

The user decides whether to apply the suggestion.

---

# 19. REACTIVE SPRINT PLANNING

## Major V4 behavior

DAA must not be a one-time Sprint Planning calculator.

It must react to meaningful changes.

## Example

Sprint 3 initially:

```text
Capacity: 100h
Selected work: 92h
```

Then:

> Database task estimate changes from 8h → 20h.

System:

```text
Task estimate changed
↓
DAA recalculates
↓
Sprint load = 104h
↓
Capacity exceeded
↓
Sprint risk increases
↓
Affected dependent tasks identified
↓
Recommendation generated
```

The user decides whether to:

- remove an item
- split an item
- reduce scope
- extend work only where methodology rules allow
- move work back to Product Backlog
- accept the risk.

## History preservation

- DONE work remains historical.
- IN_PROGRESS work should generally remain unless explicit replanning is confirmed.
- TODO/PLANNED work is eligible for replanning.
- Historical Sprint decisions must not be rewritten.

## Prompt 16 — Reactive Sprint Engine

> Make Sprint planning reactive.
>
> Recalculate when task estimates, priority, dependencies, assignments, workload, capacity, risk, deadlines, skills, critical path, or other configured planning factors change.
>
> Detect when current Sprint commitments no longer fit capacity.
>
> Preserve DONE history and avoid silently rewriting IN_PROGRESS work.
>
> Mark eligible TODO/PLANNED work as replannable.
>
> Require explicit user/team confirmation before changing Sprint commitments.

---

# 20. EDGE CASES

## Edge Case 1 — User adds urgent task during Sprint

Do not automatically insert it.

Show:

> Urgent work detected.

Analyze:

- value
- urgency
- effort
- dependencies
- capacity
- Sprint Goal impact.

Recommend options.

---

## Edge Case 2 — Sprint capacity exceeded

Show:

> Sprint capacity exceeded by 14 hours.

Explain which items contribute to the overload.

---

## Edge Case 3 — Task becomes blocked

Update:

- task
- dependency graph
- Sprint health
- risk
- DAA
- Overview
- Project Memory.

---

## Edge Case 4 — Assignee unavailable

Recalculate capacity.

Find compatible verified skills.

Recommend alternatives.

Do not silently reassign.

---

## Edge Case 5 — Priority changes during Sprint

Recalculate backlog priority.

Do not automatically remove an active Sprint item.

---

## Edge Case 6 — Dependency added after Sprint starts

Analyze:

- cycle
- blocking
- critical path
- Sprint Goal
- schedule impact.

---

## Edge Case 7 — Circular dependency

Reject/flag.

---

## Edge Case 8 — Story too large

Recommend splitting.

---

## Edge Case 9 — Sprint Goal becomes impossible

Explain why.

Possible causes:

- blocked critical task
- capacity loss
- dependency failure
- excessive scope
- external deadline.

Do not automatically close or rewrite Sprint.

---

## Edge Case 10 — Sprint finishes with incomplete work

Move incomplete work back to Product Backlog or explicit next-Sprint planning state according to user/team decision.

Preserve history that it was carried over.

---

## Edge Case 11 — User deletes a task

Do not destroy historical references if the task participated in Sprint history.

Prefer archival/soft deletion where required.

---

## Edge Case 12 — Skill verification changes

Recalculate skill availability.

Do not modify another user's verified skill manually.

---

## Edge Case 13 — Teacher changes a requirement

Trace:

```text
Requirement
↓
Story
↓
Task
↓
Dependency
↓
Sprint
↓
Capacity
↓
Risk
```

Show impact.

---

## Edge Case 14 — Sprint date changes

Recalculate:

- available working time
- capacity
- deadlines
- risk
- milestones.

Preserve the change event.

---

## Edge Case 15 — Network disconnect

Use existing frontend/backend resilience.

Do not create duplicate task events.

---

# 21. PROJECT MEMORY + EVENT LOG

Every important Scrum event should become part of project history.

Examples:

- story created
- priority changed
- Sprint created
- Sprint started
- task assigned
- task status changed
- dependency added
- task blocked
- task completed
- estimate changed
- Sprint replanned
- Sprint reviewed
- Retrospective generated
- recommendation accepted/rejected
- requirement changed.

## Event example

```text
EVENT:
TASK_ESTIMATE_CHANGED

Task:
T-017

Previous:
8h

New:
20h

Reason:
Implementation complexity increased

Impact:
Sprint capacity exceeded
```

This enables future AI and DAA reasoning.

## Prompt 17 — Scrum Event System

> Extend Project Memory/Event Log for Scrum-specific events.
>
> Record meaningful planning and execution changes with timestamp, actor, previous state, new state, and relevant project context.
>
> Do not record meaningless UI noise as project events.
>
> Use events as the source for historical analysis and learning.

---

# 22. PROJECT AI / COPILOT

## Scrum-aware context

Copilot should know:

- project
- methodology = Scrum
- current Sprint
- Sprint Goal
- Product Backlog
- Sprint Backlog
- tasks
- dependencies
- team
- verified skills
- capacity
- risks
- project memory
- requirements
- teacher input
- uploaded Project Context.

## Example question

> Why are we at risk of missing this Sprint?

Copilot should reason from actual data:

```text
3 tasks remain.

2 depend on the blocked API integration task.

Remaining capacity:
11h

Remaining estimated work:
18h

Sprint Goal:
At Risk
```

Then explain the situation naturally.

## DAA/AI separation

DAA:

- calculates capacity
- calculates priority
- calculates dependency impact
- calculates critical path
- calculates deterministic planning scores.

AI:

- explains
- summarizes
- interprets
- recommends
- answers natural-language questions.

## Prompt 18 — Scrum Copilot

> Make Project Copilot Scrum-aware.
>
> Provide current Sprint, Sprint Goal, backlog, task, dependency, team, skill, capacity, risk, event history, project context, and teacher requirements as structured AI context.
>
> Use DAA outputs as trusted deterministic facts.
>
> Do not let AI invent project state.
>
> AI should explain and recommend based on actual project context.
>
> Preserve the separation between Project Copilot, Team Chat, and Global Chat.

---

# 23. COPILOT PROJECT CONTEXT / ATTACHMENTS

Use the V4 Project Context model.

Users may attach:

- PDF
- images
- Markdown
- requirements
- architecture diagrams
- ER diagrams
- workflow diagrams
- specifications
- plans
- code/files
- teacher documents.

Separate:

### Persistent Project Context

Long-lived project knowledge.

### Temporary Chat Context

Context attached only to the current conversation.

This should make Scrum Copilot substantially more useful for academic projects.

---

# 24. THREE.JS SCRUM DIGITAL TWIN

## Goal

Create a meaningful 3D representation of the Scrum project.

Possible structure:

```text
                    PROJECT
                       │
             ┌─────────┴─────────┐
             │                   │
       PRODUCT BACKLOG       TEAM
             │                   │
       ┌─────┴─────┐       capacity/skills
       │           │
    Sprint 1    Sprint 2
       │           │
     Tasks        Tasks
       │
 Dependencies
```

## Visual objects

- Project = central node
- Product Backlog = collection
- Sprint = spatial cluster
- Story = node
- Task = smaller node
- dependency = connection
- team member = linked capability node
- blocker = visual warning state
- milestone = anchor
- risk = contextual indicator.

## Interaction

Click Sprint:

→ highlight its stories/tasks/team/dependencies.

Click task:

→ show its relationships.

Click dependency:

→ highlight source and destination.

Click team member:

→ show assigned work and capacity.

## Prompt 19 — Three.js Scrum Digital Twin

> Build a reusable Three.js Scrum visualization layer.
>
> Visualize the actual project state as a spatial model of Product Backlog, Sprints, stories, tasks, dependencies, team capabilities, risks, and milestones.
>
> Do not create decorative 3D content unrelated to project data.
>
> Interactions must reveal real relationships.
>
> Keep performance reasonable and provide a non-3D accessible alternative.

---

# 25. GSAP DATA-DRIVEN ANIMATION

## Example

Task changes:

```text
TODO → IN_PROGRESS
```

Animation:

1. task card transitions
2. Sprint progress updates
3. relevant graph node moves
4. dependency state updates
5. health indicator updates.

## Example

Task estimate:

```text
8h → 20h
```

Animation:

1. task highlights
2. capacity bar changes
3. Sprint overload indicator appears
4. affected dependent tasks highlight
5. recommendation panel reveals.

## Prompt 20 — GSAP Scrum Interactions

> Implement GSAP animations based on meaningful Scrum state changes.
>
> Animate task state changes, backlog movement, Sprint progress, dependency impact, capacity changes, risk changes, and Retrospective insight presentation.
>
> Keep animations subtle and premium.
>
> Do not animate every component continuously.
>
> Support reduced-motion preferences.

---

# 26. SCRUM + EXISTING V3 FEATURE MAPPING

| V3 Feature | Scrum V4 Behavior |
|---|---|
| Tasks | Sprint-aware tasks |
| Greedy Priority | Dynamic Scrum backlog/Sprint planning |
| Sprint logic | Expanded into full Scrum environment |
| Dependencies | Sprint-aware dependency engine |
| Team Health | Sprint workload/capacity aware |
| Risk Intelligence | Sprint/dependency-aware |
| Project Brain | Scrum-aware project context |
| Decision Engine | Scrum-aware recommendations |
| Project Sync | Preserved |
| GitHub | Preserved |
| Global Chat | Preserved and separate |
| Team Chat | Preserved and separate |
| Skills | Sprint capability intelligence |
| Skill Quiz | Role/skill verification |
| Retrospective | **Current Sprint analysis using existing V3 behavior** |
| Learning Loop | Learns from completed Sprint history |
| Project Health | Scrum-specific health |
| Project Copilot | Scrum-aware |
| Resources | Scrum/project-context aware |
| Project Memory | Scrum event history |

---

# 27. WHAT MUST NOT BE COPIED FROM WATERFALL

Do not import Waterfall concepts into Scrum as mandatory workflow.

Do NOT use:

- Requirements → Design → Implementation → Testing phase gates
- sequential phase locking
- Waterfall change-request workflow as the default
- phase completion gates
- phase-based execution as the main model.

Scrum instead uses:

```text
Product Backlog
↓
Sprint Planning
↓
Sprint
↓
Increment
↓
Review
↓
Retrospective
↓
Next Sprint
```

Some shared concepts remain:

- requirements
- dependencies
- milestones
- risks
- documents
- team skills
- DAA
- AI
- Project Memory
- event history.

---

# 28. SCRUM-SPECIFIC PROJECT HEALTH

Calculate:

- Sprint Goal Health
- Sprint Capacity Health
- Work Completion Health
- Dependency Health
- Risk Health
- Team Workload Health
- Backlog Health
- Deadline Health.

Example:

```text
SCRUM PROJECT HEALTH

Sprint Goal       82%
Capacity          71%
Dependencies     64%
Risk              78%
Team              86%

Overall
81% — AT RISK
```

The system should explain the overall state.

---

# 29. SCRUM LEARNING LOOP

Completed Sprint history becomes future planning context.

Example:

```text
Sprint 1
Planned: 100h
Completed: 72h

        ↓

Retrospective
Capacity was overestimated

        ↓

Project Memory

        ↓

Learning Loop

        ↓

Sprint 2 Planning

        ↓

DAA considers historical execution
```

The system should not blindly assume historical velocity is always correct.

It should treat history as evidence.

---

# 30. UNIQUE NEXUSFLOW SCRUM FEATURES

## 1. Methodology-Aware Project Environment

Scrum changes the actual operating model, not just the label.

## 2. Reactive DAA Sprint Planning

Planning recalculates when meaningful project conditions change.

## 3. Requirement → Story → Task Traceability

Maintain academic/project traceability.

## 4. Skill-Aware Sprint Planning

Verified team skills influence feasibility.

## 5. Current-Sprint Retrospective

Existing V3 Retrospective behavior becomes explicitly Sprint-aware.

## 6. Retrospective → Project Memory → Future Planning

Historical learning feeds future decisions without automatic changes.

## 7. Three.js Project Digital Twin

The visualization reflects actual Scrum relationships.

## 8. Change Impact Intelligence

Changes propagate through:

```text
Requirement
↓
Story
↓
Task
↓
Dependency
↓
Capacity
↓
Risk
↓
Sprint Goal
```

## 9. Teacher-Aware Scrum

Academic requirements can influence planning without overriding deterministic project rules.

## 10. Explainable AI + DAA

DAA calculates.

AI explains.

User decides.

---

# 31. PROFESSIONAL CHAT RENDERING

Keep:

- Global Chat
- Team Chat
- Project Copilot

separate.

Chat messages should support professional Markdown rendering:

- headings
- bullets
- numbered lists
- tables
- code blocks
- inline code
- emphasis
- links
- structured AI responses.

Do not merge Chat and Copilot.

---

# 32. SCRUM ACCESS CONTROL

Validate:

- project membership
- team membership
- Scrum role permissions
- Sprint modification permission
- Product Backlog modification permission
- retrospective access
- teacher/reviewer access where configured.

Examples:

A normal member may:

- view backlog
- work on assigned tasks
- update allowed task state
- contribute Retrospective observations.

Authorized project/team roles may:

- create Sprint
- modify Sprint planning
- manage backlog.

Only authorized users may:

- accept major planning changes
- close Sprint
- modify project methodology.

---

# 33. NOTIFICATIONS

Useful notifications:

- Sprint starting
- task assigned
- task blocked
- dependency blocked
- Sprint capacity exceeded
- Sprint Goal at risk
- review approaching
- Retrospective available
- teammate added/removed
- application/invitation events
- teacher requirement changed.

Do not spam users.

Notifications should be event-driven.

---

# 34. TESTING STRATEGY

## Unit tests

Test:

- Sprint lifecycle
- task transitions
- capacity calculation
- priority calculation
- dependency graph
- cycle detection
- critical path
- carry-over
- permissions
- retrospective current-Sprint filtering.

## Integration tests

Test:

```text
Create Scrum project
→ create backlog
→ create Sprint
→ select stories
→ assign tasks
→ execute tasks
→ block task
→ recalculate DAA
→ update health
→ Retrospective analyzes CURRENT Sprint
→ complete Sprint
→ preserve history
```

## Critical Retrospective test

Create multiple Sprints.

Example:

```text
Sprint 1
10 tasks

Sprint 2
8 tasks

Sprint 3
12 tasks
```

Open Retrospective while Sprint 3 is active.

It must analyze **Sprint 3**, not Sprint 1 or Sprint 2.

Then complete Sprint 3.

The final Retrospective should be preserved as historical information.

---

# 35. PERFORMANCE

Avoid:

- constant Three.js rerenders
- continuous GSAP loops
- unnecessary database queries
- repeated full-project AI calls.

Use:

- memoization
- selective event updates
- debounced recalculation
- cached deterministic calculations where safe
- event-driven refresh
- incremental visualization updates.

AI calls should be made when useful, not on every UI event.

---

# 36. IMPLEMENTATION ORDER

Recommended sequence:

```text
Phase 0
V3 Safety

↓

Phase 1
Methodology Engine

↓

Phase 2
Scrum UI/UX Design System

↓

Phase 3
Scrum Setup Wizard

↓

Phase 4
Overview

↓

Phase 5
Product Backlog + Plan

↓

Phase 6
Dynamic Priority / DAA

↓

Phase 7
Sprint Backlog + Tasks

↓

Phase 8
Dependencies

↓

Phase 9
Timeline

↓

Phase 10
Team + Capacity

↓

Phase 11
Insights

↓

Phase 12
Retrospective

↓

Phase 13
Sprint Review

↓

Phase 14
Reactive Sprint Planning

↓

Phase 15
Project Memory / Events

↓

Phase 16
Project AI

↓

Phase 17
Three.js Digital Twin

↓

Phase 18
GSAP Data-Driven Animation

↓

Phase 19
Chat Rendering

↓

Phase 20
Testing

↓

Phase 21
Final Integration
```

---

# 37. FINAL SCRUM USER JOURNEY

```text
CREATE PROJECT
      ↓
SELECT SCRUM
      ↓
SCRUM SETUP
      ↓
PROJECT OVERVIEW
      ↓
CREATE / IMPORT REQUIREMENTS
      ↓
CREATE PRODUCT BACKLOG
      ↓
REFINE STORIES
      ↓
PRIORITIZE BACKLOG
      ↓
DAA ANALYSIS
      ↓
SPRINT PLANNING
      ↓
CHECK CAPACITY + SKILLS
      ↓
SET SPRINT GOAL
      ↓
SELECT SPRINT BACKLOG
      ↓
START SPRINT
      ↓
TASK EXECUTION
      ↓
DAILY PROGRESS
      ↓
DEPENDENCY / RISK MONITORING
      ↓
DYNAMIC DAA RECALCULATION
      ↓
SPRINT REVIEW
      ↓
CURRENT SPRINT RETROSPECTIVE
      ↓
PROJECT MEMORY
      ↓
LEARNING LOOP
      ↓
NEXT SPRINT PLANNING
      ↓
REPEAT
```

---

# 38. DEFINITION OF DONE

Scrum V4 is ready when:

- [ ] Scrum can be selected during project creation.
- [ ] Scrum Setup Wizard works.
- [ ] Scrum environment has all 8 tabs.
- [ ] Product Backlog works.
- [ ] User Stories work.
- [ ] Sprint Planning works.
- [ ] Sprint Goal works.
- [ ] Sprint Backlog works.
- [ ] Sprint capacity works.
- [ ] Dynamic priority works.
- [ ] DAA remains deterministic.
- [ ] Dependencies work.
- [ ] Critical path works.
- [ ] Team capacity/skills influence planning.
- [ ] Tasks are Sprint-aware.
- [ ] Timeline is Sprint-aware.
- [ ] Insights use real project state.
- [ ] Retrospective analyzes the CURRENT Sprint.
- [ ] Retrospective retains existing V3 behavior.
- [ ] Retrospective recommendations do not automatically modify project state.
- [ ] Sprint Review works.
- [ ] Carry-over preserves history.
- [ ] Reactive replanning works.
- [ ] Project Memory records Scrum events.
- [ ] Learning Loop uses historical Sprint evidence.
- [ ] Project AI understands Scrum context.
- [ ] Copilot remains separate from Team/Global Chat.
- [ ] Three.js visualization represents real project data.
- [ ] GSAP animations respond to meaningful state changes.
- [ ] Cream/neutral premium UI is consistent.
- [ ] Mobile/tablet/desktop layouts work.
- [ ] Reduced-motion/accessibility support works.
- [ ] Existing V3 Classic NexusFlow remains functional.
- [ ] Waterfall remains functional.
- [ ] Kanban and Hybrid remain available as WIP options.
- [ ] No existing V3 files are deleted unnecessarily.
- [ ] Integration tests pass.

---

# 39. FINAL ARCHITECTURE PRINCIPLE

NexusFlow V4 should not become:

```text
V3
+
Scrum page
+
Waterfall page
+
Kanban page
```

It should become:

```text
                    NEXUSFLOW CORE
                          │
             ┌────────────┴────────────┐
             │                         │
       COMMON DATA / ENGINES      METHODOLOGY ENGINE
             │                         │
       Tasks / Teams / AI              │
       Skills / Risks / DAA            │
       Memory / Events                 │
             │              ┌──────────┼──────────┐
             │              │          │          │
             │           SCRUM     WATERFALL   KANBAN
             │              │          │          │
             │        Sprint Rules  Phase Rules  WIP Rules
             │              │          │          │
             └──────────────┴──────────┴──────────┘
                          │
                 DOMAIN-AWARE CONTEXT
                          │
                    AI + DAA + Memory
                          │
                    VISUALIZATION
                  Three.js + GSAP
```

The same NexusFlow core remains underneath.

The **methodology changes how the project operates**.

---

# 40. THE CENTRAL V4 SCRUM PRINCIPLE

> **Scrum is not a board. Scrum is a continuously learning project execution environment.**

The final NexusFlow Scrum loop is:

```text
PLAN
  ↓
EXECUTE
  ↓
OBSERVE
  ↓
CALCULATE
  ↓
EXPLAIN
  ↓
REVIEW
  ↓
RETROSPECT
  ↓
LEARN
  ↓
PLAN BETTER
```

Where:

**DAA = Calculate**

**AI = Explain / Assist**

**Project Memory = Remember**

**Retrospective = Learn**

**User/Team = Decide**

**Three.js = Visualize**

**GSAP = Communicate change**

This separation is the core of the NexusFlow V4 Scrum implementation.
