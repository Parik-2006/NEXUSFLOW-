# NexusFlow V4.0 --- Waterfall Complete Implementation Plan

## Purpose

This is a **new implementation plan** for the complete V4 redesign. It
uses the existing V3.0 implementation as the reference and foundation.

**Do not delete V3 files or remove working V3 functionality.** Add V4
behavior through new components, services, configuration, adapters,
routes, models, and reusable UI where practical.

The first fully implemented methodology is **Waterfall**. Keep **Scrum,
Kanban, and Hybrid** visible in the methodology selector, but show them
as **Work in Progress** until their environments are implemented.

------------------------------------------------------------------------

# 1. V4 Vision

NexusFlow V4 =

**V3 engines + methodology-aware execution + domain-aware intelligence +
richer project context + reactive DAA + improved AI + premium UI/UX +
meaningful 3D visualization.**

The user sees a simple application while the system handles the
complexity underneath.

### Core rule

> **Complexity stays inside NexusFlow; simplicity stays in the user's
> navigation.**

Each methodology should expose only **6--7 primary tabs**.

------------------------------------------------------------------------

# 2. Waterfall Primary Navigation

Waterfall has exactly **7 primary tabs**:

1.  **Overview**
2.  **Plan**
3.  **Tasks**
4.  **Timeline**
5.  **Team**
6.  **Insights**
7.  **Project AI**

The user should not see 12--15 tabs. Extra functionality belongs inside
sections, drawers, modals, cards, contextual views, or internal subtabs.

------------------------------------------------------------------------

# 3. Waterfall Example Project

Use one consistent example while implementing and testing:

**AI-Based Student Performance Prediction System**

Team:

-   Rahul --- ML Engineer
-   Ananya --- Backend Developer
-   Kiran --- Frontend Developer
-   Arjun --- Database Developer

Teacher requirements:

-   student data
-   database
-   ML prediction
-   web interface
-   testing
-   documentation
-   final demo

Typical Waterfall flow:

``` text
Requirements
    ↓
Design
    ↓
Implementation
    ↓
Testing
    ↓
Deployment
    ↓
Maintenance
```

------------------------------------------------------------------------

# 4. V4 Technology and Visual Direction

Preserve the existing core architecture:

-   React Native
-   Expo Router
-   TypeScript
-   React Native Web
-   Node.js
-   Express
-   Socket.IO
-   MongoDB / Mongoose
-   JWT
-   OmniRoute

Use:

-   Tailwind CSS as the primary web styling direction where applicable
-   selective Bootstrap JS
-   Three.js
-   GSAP / ScrollTrigger-style animation
-   modern CSS
-   responsive design
-   accessibility
-   reduced-motion support

## Completely new visual language

The redesign must **not** look like a typical neon AI SaaS dashboard.

Use:

-   cream
-   ivory
-   warm white
-   beige
-   sand
-   muted olive
-   muted brown
-   charcoal
-   graphite
-   subtle neutral accents

Use:

-   creamy surfaces
-   premium typography
-   soft glass cards
-   restrained glassmorphism
-   subtle morphism / neumorphism
-   soft shadows
-   layered depth
-   elegant charts
-   quiet hover states
-   restrained gradients
-   purposeful animation

Avoid:

-   neon cyan
-   neon purple
-   neon pink
-   excessive AI-style gradients
-   glowing cards everywhere
-   excessive blur
-   decorative 3D with no purpose

------------------------------------------------------------------------

# 5. Complete User Journey

``` text
Create Project
      ↓
Select Waterfall
      ↓
Enter project details
      ↓
Add teacher/client requirements
      ↓
Upload project context
      ↓
Project AI understands material
      ↓
Requirements prepared
      ↓
DAA calculates priority
      ↓
Dependencies identified
      ↓
Topological ordering
      ↓
Tasks generated
      ↓
Tasks prioritized and sorted
      ↓
Team assignment recommended
      ↓
Timeline generated
      ↓
User reviews and approves
      ↓
Execution
      ↓
Reactive DAA / intelligence
      ↓
Insights
      ↓
Project AI assistance
      ↓
Phase gates
      ↓
Testing
      ↓
Deployment
      ↓
Project completion
```

------------------------------------------------------------------------

# PHASE 0 --- V3 SAFETY BASELINE

## What we do

Before changing the application, inspect and protect the working V3
baseline.

Preserve:

-   authentication
-   Google OAuth
-   password reset
-   invitations
-   Global Chat
-   Team Chat
-   skill verification
-   Skill Graph
-   Team Health
-   Risk Intelligence
-   Project Brain
-   Decision Engine
-   AI Resources
-   Retrospective
-   Learning Loop
-   GitHub
-   Project Sync
-   OmniRoute
-   existing DAA engines
-   dependency engine
-   task engine

## Why

V4 is an evolution, not a destructive rewrite.

## Prompt 01 --- Baseline Audit

``` text
Work on NexusFlow V4 using the existing V3.0 codebase as the baseline.

Do not delete existing V3 files.
Do not remove working V3 functionality.
Do not migrate the backend/database architecture.

Inspect and document:
1. project creation
2. project model
3. task model
4. team/member model
5. skill system
6. dependency system
7. DAA services
8. Project AI
9. Decision Engine
10. Project Brain
11. Team Health
12. Risk Intelligence
13. timeline/sprint logic
14. chat
15. GitHub/project sync
16. current navigation

Identify safe extension points for V4.

Create a V4 architecture plan using shared components and methodology configuration.

Do not implement the whole V4 feature set yet.

Run regression checks proving that the V3 baseline still works.
```

------------------------------------------------------------------------

# PHASE 1 --- METHODOLOGY ENGINE

## What we do

Add a reusable methodology layer.

A project stores:

``` text
methodology = WATERFALL
domain = AI
```

This creates an:

> **AI + Waterfall project environment**

The underlying project/task/member data remains reusable.

## Why

We should not build four separate applications.

## Prompt 02 --- Methodology Engine

``` text
Implement a V4 methodology engine.

Supported values:
- SCRUM
- KANBAN
- WATERFALL
- HYBRID

Waterfall is the only fully implemented methodology in this phase.

Scrum, Kanban, and Hybrid must remain selectable but display a polished Work in Progress experience.

Create reusable methodology configuration that controls:
- navigation
- workflow states
- planning rules
- task behavior
- dependency behavior
- scheduling
- health metrics
- AI context
- DAA behavior
- methodology-specific UI

Do not duplicate the entire application into separate methodology pages.

Use shared components plus methodology-specific configuration and behavior.

Ensure existing V3 projects remain safe.
```

------------------------------------------------------------------------

# PHASE 2 --- V4 UI/UX DESIGN SYSTEM

## What we do

Completely redesign the interface.

The application should feel like a premium professional workspace.

Create reusable components for:

-   navigation
-   cards
-   buttons
-   inputs
-   tables
-   charts
-   dialogs
-   tabs
-   badges
-   loading states
-   empty states
-   errors
-   success states

## Prompt 03 --- UI/UX Redesign

``` text
Completely redesign the NexusFlow V4 interface while preserving existing business functionality.

Use:
- Tailwind CSS
- selective Bootstrap JS
- modern CSS
- Three.js where visualization genuinely improves understanding
- GSAP-style animation for purposeful transitions

Visual direction:
- creamy
- ivory
- warm white
- beige
- sand
- muted olive
- charcoal
- graphite

Use premium typography, soft glass cards, restrained glassmorphism, subtle morphism, soft shadows, layered depth and elegant charts.

Do NOT use:
- neon AI colors
- excessive cyan/purple/pink
- generic futuristic AI dashboard styling
- excessive glow
- decorative animation everywhere

Make it responsive and accessible.

Support reduced motion.

Do not rewrite V3 business logic in this phase.
Do not remove V3 features.
```

------------------------------------------------------------------------

# PHASE 3 --- PROJECT CREATION

## What we do

Simple creation flow:

``` text
Project Name
Description
Domain
Team
Methodology
Deadline
Teacher/Client Requirements
```

Methodology selector:

``` text
Scrum
Kanban
Waterfall
Hybrid
```

Waterfall enters the implemented environment.

Scrum/Kanban/Hybrid show their WIP state.

## Prompt 04 --- Project Creation

``` text
Redesign the project creation flow for V4.

Collect:
- project name
- description
- domain
- team
- methodology
- deadline
- teacher/client requirements

Show four methodology choices:
- Scrum
- Kanban
- Waterfall
- Hybrid

Waterfall enters the functional Waterfall environment.

Scrum, Kanban, and Hybrid must show polished Work in Progress previews without fake functionality.

Do not break existing project creation or V3 projects.
```

------------------------------------------------------------------------

# PHASE 4 --- TAB 1: OVERVIEW

## User question

> **How is my project doing?**

Show:

-   project name
-   domain
-   methodology
-   deadline
-   current phase
-   overall progress
-   schedule health
-   requirements health
-   team health
-   dependency health
-   risk level
-   milestone progress

Use charts and analytics.

## Three.js

Show a real project visualization:

``` text
Requirements
      ↓
Design
      ↓
Implementation
      ↓
Testing
      ↓
Deployment
```

Nodes can represent phases, milestones, critical tasks, dependencies,
and risks.

## Prompt 05 --- Overview

``` text
Implement the Waterfall Overview tab.

Show:
- project summary
- current phase
- overall progress
- deadline
- project health
- schedule health
- requirements health
- team health
- dependency health
- risk level
- milestone progress

Use the V4 creamy design system.

Add professional charts.

Add a Three.js visualization of:
Requirements → Design → Implementation → Testing → Deployment.

Use real project data.

Allow users to click nodes to inspect details.

Update the visualization when meaningful project state changes.

Use subtle transitions only where they help explain a state change.

Do not use neon colors.
Do not use fake data when real data exists.
```

------------------------------------------------------------------------

# PHASE 5 --- TAB 2: PLAN / PROJECT UNDERSTANDING

## User question

> **What are we building?**

This is the major V4 redesign.

The user uploads material that explains the project.

Accepted project context may include:

-   PDF
-   DOC/DOCX where supported
-   Markdown `.md`
-   TXT
-   PNG/JPG/WebP diagrams
-   workflow diagrams
-   architecture diagrams
-   ER diagrams
-   teacher requirements
-   project specifications
-   planning documents
-   documentation
-   other supported project files

The upload UI should clearly tell users what each file should contain.

### Persistent Project Context

Long-term project knowledge.

### Temporary Chat Context

Used for one conversation/request.

Project AI reads the material and extracts:

-   goals
-   requirements
-   phases
-   deliverables
-   constraints
-   dependencies
-   skills
-   important dates
-   teacher requirements

Then shows a draft for user approval.

## Prompt 06 --- Plan / Context

``` text
Implement the Waterfall Plan tab as the Project Understanding + Requirements workspace.

Create a professional upload area.

Explain accepted file types and recommended content.

Support project artifacts such as:
- requirements documents
- teacher instructions
- workflow images
- architecture diagrams
- ER diagrams
- Markdown project explanations
- specifications
- planning documents
- supported project files

Separate:
1. Persistent Project Context
2. Temporary Chat Context

Persistent artifacts become part of the project's knowledge base.

Use Project AI to analyze uploaded artifacts and extract draft:
- project goals
- requirements
- phases
- deliverables
- constraints
- dependencies
- required skills
- important dates
- teacher requirements

Show extracted information for human review.

Allow:
- approve
- edit
- delete
- manually add
- regenerate

Do not silently commit destructive changes.
```

------------------------------------------------------------------------

# PHASE 6 --- REQUIREMENTS + DYNAMIC PRIORITY

## User question

> **What must the project contain?**

Requirements should support:

-   title
-   description
-   business value
-   academic value
-   criticality
-   estimated hours
-   due date
-   dependencies
-   required skills
-   teacher importance
-   milestone
-   risk
-   impact
-   acceptance criteria
-   optional manual assignment

## DAA priority

Preserve the V3 priority concept and make it more versatile.

Potential factors:

-   business value
-   academic value
-   criticality
-   urgency
-   deadline pressure
-   dependency impact
-   blocking potential
-   risk
-   impact
-   effort
-   expected value
-   technical uncertainty
-   teacher importance
-   milestone importance
-   capacity
-   skill availability
-   critical-path impact

If an input changes:

``` text
Input changed
    ↓
DAA recalculates
    ↓
Score changes
    ↓
Rank changes
```

## Prompt 07 --- Requirement Engine

``` text
Implement the Waterfall requirement system using existing V3 task and priority behavior as the reference.

Requirements must support:
- create
- edit
- delete
- description
- business value
- academic value
- criticality
- estimated hours
- due date
- dependencies
- required skills
- teacher importance
- milestone
- risk
- impact
- acceptance criteria
- optional manual assignment

Reuse and improve the deterministic priority engine.

Priority must dynamically recalculate whenever a relevant input changes.

Show:
- score
- rank
- major contributing factors
- simple explanation of why the score changed

DAA calculates the score.
AI may explain the score.

Do not let the LLM invent deterministic scores.

Preserve history and human decisions.
```

------------------------------------------------------------------------

# PHASE 7 --- TAB 3: TASKS

## User question

> **What actual work needs to happen?**

Approved requirements become tasks.

Example:

``` text
REQ-003 Performance Prediction
        ↓
Design ML Architecture
        ↓
Prepare Dataset
        ↓
Train Model
        ↓
Evaluate Model
        ↓
Integrate Prediction API
        ↓
Test Prediction
```

Each task shows:

-   requirement
-   phase
-   priority
-   score
-   estimated hours
-   due date
-   assigned member
-   required skills
-   dependencies
-   status
-   risk
-   criticality

## Dynamic recalculation

Relevant changes invalidate stale results.

Examples:

-   estimate changes
-   criticality changes
-   business value changes
-   deadline changes
-   dependency changes
-   assignment changes
-   capacity changes
-   skill availability changes

History rule:

``` text
DONE
→ preserve

IN PROGRESS
→ preserve unless explicit replanning

TODO / PLANNED
→ eligible for re-ranking
```

## Prompt 08 --- Task Engine

``` text
Implement the Waterfall Tasks tab.

Generate draft tasks from approved requirements.

Each task must support:
- requirement link
- phase
- title
- description
- priority score
- rank
- estimated hours
- due date
- status
- required skills
- assigned member
- dependencies
- criticality
- risk
- acceptance criteria

Allow manual task creation and editing.

Implement reactive DAA recalculation.

Relevant changes must invalidate stale derived calculations.

Use versioning or equivalent invalidation metadata where appropriate.

Do not rewrite completed history.

Show users when recalculation changes:
- score
- rank
- ordering
- critical path
- schedule impact
- assignment recommendation

Allow manual override with clear indication.
```

------------------------------------------------------------------------

# PHASE 8 --- DEPENDENCY ENGINE + TOPOLOGICAL SORT

## What we do

**Keep the existing V3 dependency engine.**

Waterfall needs it heavily.

Preserve:

-   dependency graph
-   cycle detection
-   topological sorting
-   valid execution ordering
-   critical path analysis

Example:

``` text
Database Schema
      ↓
Data Import
      ↓
Feature Engineering
      ↓
ML Training
      ↓
Prediction API
      ↓
Testing
```

### Boyer--Moore

Keep Boyer--Moore where it genuinely helps with fast text/keyword
search:

-   requirements
-   tasks
-   project memory
-   supported document content
-   project search

Do not force an algorithm into a feature merely to show an algorithm.

## Prompt 09 --- Dependency Engine

``` text
Preserve and integrate the existing NexusFlow dependency engine.

For Waterfall:
- maintain dependency graph
- detect circular dependencies
- run topological sort
- determine valid task ordering
- calculate dependency impact
- support critical path analysis

Integrate dependency results with:
- Tasks
- Timeline
- Insights
- Project AI
- Three.js visualization

If a dependency creates a cycle, block it and clearly explain why.

When dependencies change:
- invalidate affected derived results
- rerun topological ordering
- recalculate critical path
- update timeline impact
- update risks

Use Boyer-Moore for suitable text-search workloads where it genuinely improves performance.

Do not add algorithms only for demonstration.
```

------------------------------------------------------------------------

# PHASE 9 --- TAB 4: TIMELINE

## User question

> **When should everything happen?**

Create a professional Waterfall Gantt-style timeline.

Show:

-   phases
-   tasks
-   milestones
-   dependencies
-   due dates
-   progress
-   critical path
-   delays

The timeline must react to meaningful project changes.

## Prompt 10 --- Timeline

``` text
Implement the Waterfall Timeline tab.

Create a polished Gantt-style timeline.

Show:
- phases
- tasks
- milestones
- dependencies
- due dates
- progress
- critical path
- delays

Use actual project data.

Timeline calculations must consider:
- task duration
- dependencies
- topological ordering
- critical path
- team capacity
- deadlines
- Waterfall rules

When a relevant task/dependency/estimate/deadline changes:
- recalculate affected schedule
- update timeline
- show impact clearly
- preserve completed history

Keep the timeline readable and responsive.
```

------------------------------------------------------------------------

# PHASE 10 --- TAB 5: TEAM + BRANCH & BOUND

## User question

> **Who should do the work?**

Preserve the V3 Members experience.

Show:

-   name
-   email
-   role
-   verified skills
-   workload
-   capacity
-   assigned work
-   contribution

Users can add registered users.

## Branch & Bound

Use Branch & Bound with pruning where appropriate.

Consider:

-   required skills
-   verified member skills
-   workload
-   capacity
-   task effort
-   dependencies
-   criticality
-   role
-   project constraints

Invalid or inferior branches can be pruned.

Users can override recommendations.

## Skill permissions

A user controls their own skill verification.

Teammates cannot manually inflate verified skills.

Only authorized team leaders can remove members.

## Prompt 11 --- Team

``` text
Implement the Waterfall Team tab using the existing V3 Members functionality as the baseline.

Preserve:
- registered-user team addition
- roles
- profile information
- verified skills
- notifications
- authorization

Improve with:
- workload
- capacity
- assigned hours
- phase allocation
- contribution analytics
- skill coverage
- skill gaps

Implement DAA-powered assignment recommendations using Branch & Bound with pruning where appropriate.

Consider:
- skill match
- workload
- capacity
- task effort
- dependencies
- role
- criticality
- project constraints

Prune invalid assignments.

Explain why an assignment is recommended.

Allow manual override.

Do not automatically modify verified skills.

Only the authorized team leader can remove members.
Require confirmation and record an audit event.
```

------------------------------------------------------------------------

# PHASE 11 --- TAB 6: INSIGHTS

## User question

> **What is happening behind the scenes?**

Bring V3 intelligence together.

Show:

### Project Health

-   overall health
-   schedule health
-   requirements health
-   dependency health
-   team health
-   testing/quality health

### Risk Intelligence

-   high/medium/low risks
-   reason
-   affected tasks
-   affected phase
-   potential impact

### Dependency Intelligence

-   graph
-   blocked tasks
-   critical dependencies
-   critical path

### Team Intelligence

-   workload
-   capacity
-   skill gaps
-   single-person dependencies

### Change Impact

``` text
Requirement change
      ↓
Design impact
      ↓
Task impact
      ↓
Skill impact
      ↓
Dependency impact
      ↓
Schedule impact
      ↓
Testing impact
```

## Prompt 12 --- Insights

``` text
Implement the Waterfall Insights tab as the unified project intelligence dashboard.

Integrate existing V3:
- Project Health
- Team Health
- Risk Intelligence
- Dependency Intelligence
- Learning Loop
- contribution analytics

Add Waterfall-aware intelligence for:
- phase health
- phase gate readiness
- schedule risk
- requirement coverage
- critical path
- dependency impact
- change impact
- team capacity
- skill gaps
- testing readiness

Use simple explanations.

Example:
"Database Schema is delayed by 5 days and blocks Data Import and ML Training. The current projection may move testing by approximately 4 days."

Do not show unexplained AI-generated numbers.

Where a value comes from DAA or deterministic analysis, make the source clear.

Use restrained charts and visualization.
```

------------------------------------------------------------------------

# PHASE 12 --- TAB 7: PROJECT AI

## User question

> **Ask NexusFlow.**

Preserve V3 Project AI functionality.

Internal sections can include:

-   Copilot
-   Decision Engine
-   AI Resources
-   Project Brain
-   Recommendations
-   Guidance
-   History

## Copilot context

Copilot understands:

-   project
-   domain
-   Waterfall methodology
-   current phase
-   requirements
-   tasks
-   dependencies
-   timeline
-   team
-   skills
-   risks
-   documents
-   teacher feedback
-   project memory
-   project events

## Attachments

The `+` button supports project/context artifacts.

Separate:

**Persistent Project Context**\
Long-term project knowledge.

**Temporary Chat Context**\
Context used for one conversation.

## AI architecture

``` text
Project AI
    ↓
OmniRoute
    ↓
Available free AI
    ↓
Local AI Core
    ↓
Deterministic fallback
```

The local pretrained model is an **AI layer**, not a DAA replacement.

## Prompt 13 --- Project AI

``` text
Redesign the Project AI tab while preserving functional V3 Project AI capabilities.

Keep internal sections for:
- Copilot
- Decision Engine
- AI Resources
- Project Brain
- Recommendations
- Guidance
- History

Make all AI behavior Waterfall-aware.

Copilot context must include:
- project
- domain
- methodology
- current phase
- requirements
- tasks
- dependencies
- timeline
- team
- skills
- risks
- documents
- teacher feedback
- project memory
- project events

Implement a "+" attachment control.

Support:
- PDFs
- images
- Markdown
- architecture diagrams
- workflow diagrams
- ER diagrams
- specifications
- project documentation
- supported code/project files

Separate persistent Project Context from temporary Chat Context.

Preserve OmniRoute.

Keep AI and DAA strictly separated:
- DAA calculates
- AI understands, explains, summarizes, recommends, and reasons over project context

AI must not silently mutate project state.

Major project changes require user approval.
```

------------------------------------------------------------------------

# PHASE 13 --- WATERFALL PHASE GATES

## What we do

Waterfall must actually behave like Waterfall.

Default phases:

``` text
Requirements
     ↓
Design
     ↓
Implementation
     ↓
Testing
     ↓
Deployment
     ↓
Maintenance
```

Each phase has:

-   status
-   start/end dates
-   owner
-   tasks
-   deliverables
-   dependencies
-   gate conditions

Example:

Testing cannot be treated as ready when required implementation and
integration conditions are incomplete.

## Prompt 14 --- Phase Gates

``` text
Implement Waterfall phase-state behavior.

Default phases:
- Requirements
- Design
- Implementation
- Testing
- Deployment
- Maintenance

Each phase must have:
- status
- start date
- target end date
- owner
- tasks
- deliverables
- dependencies
- gate conditions

Implement configurable phase gates.

A later phase must not silently begin when required conditions are unmet.

When a gate fails:
- explain what is missing
- show affected requirements/tasks/documents
- allow authorized override where appropriate
- record the decision

Preserve historical phase states.
```

------------------------------------------------------------------------

# PHASE 14 --- WATERFALL CHANGE IMPACT ENGINE

## Major differentiator

If the teacher says:

> "Add attendance prediction."

NexusFlow should trace:

``` text
New Requirement
      ↓
Design
      ↓
Tasks
      ↓
Skills
      ↓
Dependencies
      ↓
Critical Path
      ↓
Timeline
      ↓
Milestones
      ↓
Testing
      ↓
Deadline
```

Then show:

``` text
Change Impact: HIGH

+1 requirement
+2 design tasks
+5 implementation tasks
+1 skill requirement
+3 tests
+4 estimated days
```

## Prompt 15 --- Change Impact

``` text
Implement a Waterfall Change Impact Engine.

When a requirement, major task, dependency, deadline, or project constraint changes, trace the affected project graph.

Analyze:
- requirements
- design
- tasks
- dependencies
- team skills
- assignments
- workload
- critical path
- timeline
- milestones
- testing
- deployment
- project deadline

Show a clear impact summary.

Example:
"Adding Attendance Prediction may affect 1 requirement, 2 design tasks, 5 implementation tasks, 3 tests, 1 skill requirement and approximately 4 schedule days."

Do not automatically rewrite the project.

Major restructuring must require user approval.
```

------------------------------------------------------------------------

# PHASE 15 --- REACTIVE INTELLIGENCE / INVALIDATION

## Core V4 behavior

Project intelligence should react to meaningful changes.

``` text
Task updated
     ↓
Find affected systems
     ↓
Invalidate stale calculations
     ↓
Recalculate
     ↓
Update recommendations
     ↓
Update visualization
     ↓
Record event
```

Examples:

-   estimate change → priority + timeline + capacity
-   dependency change → topo sort + critical path + timeline + risk
-   assignment change → workload + capacity + skill coverage
-   requirement change → traceability + priority + tasks + impact
-   deadline change → urgency + priority + timeline + risk
-   member departure → capacity + assignment + risk + team health

## Prompt 16 --- Reactive Engine

``` text
Implement a centralized reactive intelligence/invalidation layer.

When meaningful project state changes, determine which derived systems are affected.

Invalidate stale derived results.

Recalculate only affected systems.

Use versioning or equivalent invalidation metadata where appropriate.

Never display stale optimization results as current.

Update:
- DAA calculations
- risks
- health
- timeline
- assignments
- dependency analysis
- critical path
- Project AI context
- visualizations

Record meaningful changes in the project event log.
```

------------------------------------------------------------------------

# PHASE 16 --- PROJECT MEMORY + EVENT LOG

## What we do

Preserve meaningful project history.

Events can include:

-   requirement created/changed
-   task created/assigned/reassigned
-   priority changed
-   estimate changed
-   dependency added/removed
-   member joined/left
-   risk detected/resolved
-   decision created/accepted/rejected
-   teacher feedback
-   artifact uploaded
-   phase changed
-   gate approved/rejected
-   change impact generated
-   GitHub sync
-   important AI decision

This powers:

-   Project Brain
-   learning loop
-   auditability
-   future process mining
-   contribution analysis
-   digital twin

## Prompt 17 --- Event Model

``` text
Create or extend the V4 project event log.

Record meaningful project events without excessive noise.

Use events to support:
- Project Brain
- audit trail
- analytics
- learning loop
- future process mining
- contribution analysis
- digital twin

Do not store unnecessary sensitive chat content merely for logging.
```

------------------------------------------------------------------------

# PHASE 17 --- THREE.JS PROJECT DIGITAL TWIN

## What we do

Create a visual representation of real project state.

Potential nodes:

-   phases
-   requirements
-   tasks
-   dependencies
-   team
-   skills
-   risks
-   milestones

Potential future capabilities:

-   current-state visualization
-   dependency visualization
-   critical-path visualization
-   what-if simulation
-   project digital twin

## Prompt 18 --- Three.js

``` text
Implement the first NexusFlow V4 Three.js visualization layer.

Do not make Three.js a decorative background.

Use real project data.

Initial Waterfall view:
Requirements → Design → Implementation → Testing → Deployment.

Support:
- phase nodes
- critical task nodes
- dependency edges
- milestone indicators
- risk indicators
- selected-task details

Allow:
- pan
- zoom
- rotate where appropriate
- click-to-inspect
- focus on critical path

Use the creamy premium visual language.

Avoid neon colors.

Make the design reusable for future Scrum, Kanban, Hybrid, digital twin, and what-if features.
```

------------------------------------------------------------------------

# PHASE 18 --- PROFESSIONAL CHAT RENDERING

## What we do

Keep separate:

-   Global Chat
-   Team Chat
-   Project Copilot

Improve message presentation:

-   headings
-   lists
-   tables
-   code blocks
-   inline code
-   links
-   structured callouts
-   recommendation cards

## Prompt 19 --- Chat Rendering

``` text
Improve NexusFlow chat rendering without merging Global Chat, Team Chat, and Project Copilot.

Keep the three systems separate.

Render Markdown professionally:
- headings
- lists
- tables
- code blocks
- inline code
- links
- structured callouts
- recommendation cards

Do not expose raw Markdown syntax where rendered presentation is possible.

Use the V4 creamy design system.
```

------------------------------------------------------------------------

# PHASE 19 --- SCRUM / KANBAN / HYBRID WIP

## What we do now

Do not fully implement these environments yet.

Keep them visible and honest.

Example:

``` text
Scrum
Sprint-based project management
WORK IN PROGRESS

Kanban
Continuous-flow project management
WORK IN PROGRESS

Waterfall
Sequential phase-based project management
AVAILABLE

Hybrid
Combined methodology
WORK IN PROGRESS
```

## Prompt 20 --- WIP Methodologies

``` text
Keep Scrum, Kanban, and Hybrid available in the V4 methodology selector.

For each unfinished methodology:
- show its name
- explain it simply
- show a professional preview
- show Work in Progress
- do not expose broken navigation
- do not claim unfinished functionality is available

Keep the architecture ready for future implementation.

Waterfall is the only fully functional methodology environment in this phase.
```

------------------------------------------------------------------------

# PHASE 20 --- TESTING

## Test all major behavior

### Requirements

-   create
-   edit
-   delete
-   priority
-   dependencies
-   acceptance criteria

### DAA

-   Greedy priority
-   dynamic recalculation
-   ranking
-   Topological Sort
-   cycle detection
-   critical path
-   Branch & Bound
-   pruning

### Timeline

-   schedule
-   delay propagation
-   milestone impact
-   critical path

### Team

-   registered users
-   permissions
-   skills
-   capacity
-   assignment
-   member removal

### AI

-   context
-   attachments
-   Project Brain
-   Decision Engine
-   AI Resources
-   fallback

### Waterfall

-   phase order
-   gates
-   invalid transitions
-   change impact

### Edge cases

-   circular dependency
-   delayed critical task
-   deadline changed
-   estimate changed
-   member leaves
-   skill unavailable
-   requirement changes after implementation begins
-   testing discovers design problem
-   phase gate fails
-   deadline becomes impossible
-   stale DAA result
-   AI unavailable
-   attachment parsing failure

## Prompt 21 --- Testing

``` text
Create comprehensive V4 Waterfall tests.

Test:
- project creation
- methodology selection
- artifact upload
- requirement extraction
- requirement approval
- dynamic priority recalculation
- task generation
- dependency creation
- cycle detection
- topological sort
- critical path
- timeline recalculation
- Branch & Bound assignment
- capacity constraints
- skill constraints
- risk detection
- phase gates
- change impact
- Project AI context
- Project AI attachments
- Project Brain
- Decision Engine
- AI Resources
- permissions
- project history

Include all major edge cases.

Do not modify production data during tests.

Run V3 regression tests after V4 changes.
```

------------------------------------------------------------------------

# PHASE 21 --- FINAL INTEGRATION

## Final connected flow

``` text
Project Context
      ↓
Project AI
      ↓
Requirements
      ↓
Greedy Priority
      ↓
Dependencies
      ↓
Topological Sort
      ↓
Tasks
      ↓
Branch & Bound Assignment
      ↓
Timeline
      ↓
Execution
      ↓
Reactive Intelligence
      ↓
Insights
      ↓
Project AI Explanation
      ↓
Phase Gate
      ↓
Next Phase
```

## Prompt 22 --- Final Integration

``` text
Integrate the completed NexusFlow V4 Waterfall environment.

Verify:
- Plan feeds requirements
- requirements feed tasks
- DAA calculates priority
- dependencies feed Topological Sort
- critical path feeds Timeline
- Branch & Bound uses skills/capacity
- Timeline reacts to changes
- Insights reflect current state
- Project AI understands the project
- Project Brain stores meaningful history
- Waterfall gates control progression
- Change Impact traces project changes
- Three.js reflects real project state
- user overrides remain preserved
- derived calculations cannot silently become stale

Do not create duplicate sources of truth unnecessarily.

Run complete frontend, backend, integration, authorization, and regression tests.
```

------------------------------------------------------------------------

# 6. Final Waterfall UI

The student sees only:

``` text
Overview | Plan | Tasks | Timeline | Team | Insights | Project AI
```

### Overview

**Where are we?**

Project summary, charts, health, 3D visualization.

### Plan

**What are we building?**

Uploads, Project Context, AI extraction, requirements, priority,
approval.

### Tasks

**What work needs to happen?**

Generated/manual tasks, priority, status, dependencies, assignment.

### Timeline

**When should it happen?**

Phases, Gantt, milestones, critical path, delay impact.

### Team

**Who does it?**

Members, roles, skills, workload, capacity, DAA assignment.

### Insights

**What is going wrong / what should we know?**

Health, risks, dependencies, critical path, skill gaps, change impact,
learning.

### Project AI

**Help me understand my project.**

Copilot, Decision Engine, AI Resources, Project Brain, Recommendations,
Guidance, History, attachments.

------------------------------------------------------------------------

# 7. DAA + AI Separation

## DAA

Deterministic calculation:

-   Greedy priority scoring
-   dynamic ranking
-   Topological Sort
-   cycle detection
-   critical path
-   Branch & Bound
-   pruning
-   capacity calculations
-   dependency ordering

## AI

Contextual intelligence:

-   document understanding
-   multimodal understanding
-   natural language
-   explanations
-   summaries
-   recommendations
-   requirement interpretation
-   project reasoning
-   Copilot
-   learning/resource suggestions

## User

Human approval for important decisions:

-   approve requirements
-   accept plan
-   approve major changes
-   override assignments
-   change major project decisions
-   approve major restructuring

------------------------------------------------------------------------

# 8. Most Important Waterfall Differentiators

1.  **Project documents → executable plan**
2.  **Reactive DAA instead of stale planning**
3.  **Dependency Graph + Topological Sort**
4.  **Critical Path Intelligence**
5.  **Branch & Bound team assignment**
6.  **Waterfall Change Impact Engine**
7.  **Methodology-aware Project AI**
8.  **Domain + Methodology intelligence**
9.  **Persistent Project Memory**
10. **3D project/digital-twin visualization**
11. **Simple seven-tab UX**

------------------------------------------------------------------------

# 9. Implementation Rules

Run **one prompt at a time**.

After each phase:

1.  inspect the changes
2.  run tests
3.  verify V3 behavior
4.  fix regressions
5.  commit the completed phase
6.  continue only after the phase is stable

Never send all implementation prompts to an agent simultaneously.

Use the existing V3 code as the reference. Add new V4
files/components/services wherever possible instead of replacing working
files.

------------------------------------------------------------------------

# 10. Final Waterfall Definition of Done

-   [ ] Waterfall project creation works
-   [ ] 7-tab navigation works
-   [ ] creamy premium UI is implemented
-   [ ] project uploads work
-   [ ] persistent Project Context works
-   [ ] AI extracts requirements
-   [ ] user approves/edits requirements
-   [ ] dynamic priority works
-   [ ] task generation works
-   [ ] dependency graph works
-   [ ] Topological Sort works
-   [ ] cycle detection works
-   [ ] critical path works
-   [ ] Timeline works
-   [ ] registered-user team management works
-   [ ] skill permissions are preserved
-   [ ] Branch & Bound assignment works
-   [ ] capacity is considered
-   [ ] Risk Intelligence works
-   [ ] Project Health works
-   [ ] Change Impact works
-   [ ] Waterfall phase gates work
-   [ ] Project AI works
-   [ ] Project Brain works
-   [ ] Decision Engine works
-   [ ] AI Resources work
-   [ ] Copilot attachments work
-   [ ] reactive recalculation works
-   [ ] event history works
-   [ ] Three.js visualization works
-   [ ] responsive UI works
-   [ ] accessibility works
-   [ ] reduced motion works
-   [ ] Scrum/Kanban/Hybrid WIP states work
-   [ ] V3 regression tests pass
-   [ ] no important V3 functionality is deleted

------------------------------------------------------------------------

# Final Product Principle

The user should be able to think:

> **"I have my project documents. I'll upload them."**

NexusFlow then helps transform them into:

``` text
Project Understanding
        ↓
Requirements
        ↓
Prioritized Work
        ↓
Dependencies
        ↓
Tasks
        ↓
People
        ↓
Timeline
        ↓
Execution
        ↓
Health / Risk
        ↓
AI Assistance
        ↓
Completion
```

> **NexusFlow handles the complexity. The user handles the project.**


---

# PHASE 22 — NEXUSFLOW CLASSIC / V3 INDEX ENTRY

## Important Navigation Requirement

The V4 methodology selector must contain **one additional special option: NexusFlow**.

The selector is therefore:

```text
┌─────────────────────────────────────────────┐
│ Choose Project Environment                  │
│                                             │
│  NexusFlow                                  │
│  Existing NexusFlow V3 workspace            │
│                                             │
│  Waterfall                                  │
│  Sequential phase-based execution            │
│                                             │
│  Scrum                                      │
│  Sprint-based execution                     │
│  WORK IN PROGRESS                           │
│                                             │
│  Kanban                                     │
│  Continuous-flow execution                  │
│  WORK IN PROGRESS                           │
│                                             │
│  Hybrid                                     │
│  Combined execution                         │
│  WORK IN PROGRESS                           │
└─────────────────────────────────────────────┘
```

## What happens when the user clicks NexusFlow?

The **NexusFlow** option is the gateway to the existing V3 experience.

It should open the existing V3 project/index environment with the **current V3 tabs exactly as they already exist**, rather than forcing the user into the new Waterfall environment.

Conceptually:

```text
V4 Project Environment Selector
              ↓
       ┌──────┴──────┐
       ↓             ↓
   NexusFlow      Waterfall
    (V3)             ↓
       ↓          Waterfall
 Existing V3       7 tabs
 tabs/index
```

And eventually:

```text
                  PROJECT ENVIRONMENT
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ↓                 ↓                 ↓
   NEXUSFLOW          WATERFALL        SCRUM / KANBAN
    CLASSIC               │             / HYBRID
        │                  │                 │
        ↓                  ↓                 ↓
 Existing V3          V4 Waterfall       Work in
 project/index        environment        Progress
```

## Why we need this

This is extremely important for backward compatibility.

V3 already has a working project experience with its own tabs, tools, DAA engines, AI modules, collaboration features, and project workflow.

We should **not destroy that experience just because V4 introduces methodology-specific environments**.

Instead:

- **NexusFlow** = existing V3 experience
- **Waterfall** = new V4 methodology environment
- **Scrum** = future V4 environment
- **Kanban** = future V4 environment
- **Hybrid** = future V4 environment

This gives users a safe migration path.

## Existing V3 tabs

When the user selects **NexusFlow**, open the current V3 project/index page and preserve the existing tabs/navigation exactly as implemented.

Do not rename or remove V3 tabs merely because the V4 methodology system exists.

The V3 experience becomes the **Classic NexusFlow environment**.

Future V4 environments are layered alongside it rather than replacing it.

## New project behavior

For a new V4 project:

```text
Create Project
      ↓
Choose Environment
      ↓
NexusFlow
   OR
Waterfall
   OR
Scrum
   OR
Kanban
   OR
Hybrid
```

If:

```text
NexusFlow
```

is selected:

```text
Open existing V3 project/index experience
```

If:

```text
Waterfall
```

is selected:

```text
Open V4 Waterfall environment
```

If:

```text
Scrum / Kanban / Hybrid
```

is selected:

```text
Open professional WIP preview
```

until those environments are implemented.

## Existing project compatibility

Existing V3 projects should continue opening through the **NexusFlow Classic** environment unless the user explicitly migrates/chooses a V4 methodology.

Do not automatically convert an existing V3 project to Waterfall.

Do not automatically change its methodology.

Do not silently migrate existing project state.

---

## Prompt 23 — NexusFlow Classic Entry

```text
Add a special "NexusFlow" option to the V4 project environment/methodology selector.

The selector must contain:
1. NexusFlow
2. Waterfall
3. Scrum
4. Kanban
5. Hybrid

"NexusFlow" represents the existing V3 experience.

When the user selects NexusFlow:
- open the existing V3 project/index page
- preserve the existing V3 navigation and tabs
- preserve all existing V3 functionality
- do not rename or remove V3 tabs
- do not force the user into the Waterfall environment
- do not duplicate the existing V3 project UI unnecessarily

When Waterfall is selected:
- open the new V4 Waterfall environment
- use the new seven-tab Waterfall navigation

When Scrum, Kanban, or Hybrid is selected:
- show the professional Work in Progress environment
- do not expose unfinished functionality
- keep the architecture ready for future implementation

Existing V3 projects must remain compatible.

Do not automatically migrate an existing V3 project to Waterfall, Scrum, Kanban, or Hybrid.

Do not silently change project methodology.

Use the existing V3 project/index implementation as the reference and route to it safely.

The goal is:
V3 remains available as "NexusFlow Classic", while V4 methodology environments are added alongside it.
```

---

# 23. FINAL ENVIRONMENT MODEL

After this change, NexusFlow has **five entry choices**:

| Environment | Purpose | Status |
|---|---|---|
| **NexusFlow** | Existing V3 project/index + existing tabs | **Available** |
| **Waterfall** | Full V4 sequential phase environment | **Available / First V4 Environment** |
| **Scrum** | Sprint-based V4 environment | **Work in Progress** |
| **Kanban** | Continuous-flow V4 environment | **Work in Progress** |
| **Hybrid** | Combined V4 environment | **Work in Progress** |

The important distinction is:

> **NexusFlow is not another methodology. It is the Classic V3 project environment.**

That means the architecture should treat it differently from the four methodology environments.

```text
NexusFlow Classic
        │
        └── Existing V3 project/index
            ├── Existing V3 tabs
            ├── Existing V3 DAA
            ├── Existing V3 AI
            ├── Existing V3 collaboration
            └── Existing V3 project features


V4 Methodology Engine
        │
        ├── Waterfall
        ├── Scrum
        ├── Kanban
        └── Hybrid
```

---

# 24. V4 MIGRATION PHILOSOPHY

V4 should therefore **co-exist with V3** rather than immediately replacing it.

The transition is:

```text
                  Existing NexusFlow
                         │
                         ↓
                 NexusFlow Classic
                         │
                  ┌──────┴──────┐
                  ↓             ↓
             Keep V3       Explore V4
                                │
                                ↓
                    Choose project environment
                                │
             ┌──────────┬───────┼──────────┬──────────┐
             ↓          ↓       ↓          ↓          ↓
         NexusFlow  Waterfall Scrum     Kanban     Hybrid
            V3        V4       WIP        WIP        WIP
```

This lets the team build V4 progressively without destroying the proven V3 experience.

---

# 25. UPDATED IMPLEMENTATION ORDER

The complete implementation sequence is now:

```text
PHASE 0
V3 Safety Baseline
        ↓
PHASE 1
Methodology Engine
        ↓
PHASE 2
V4 Design System
        ↓
PHASE 3
Project Creation + Environment Selector
        ↓
PHASE 4
Overview
        ↓
PHASE 5
Plan + Project Context
        ↓
PHASE 6
Requirements + Priority
        ↓
PHASE 7
Tasks
        ↓
PHASE 8
Dependencies + Topological Sort
        ↓
PHASE 9
Timeline
        ↓
PHASE 10
Team + Branch & Bound
        ↓
PHASE 11
Insights
        ↓
PHASE 12
Project AI
        ↓
PHASE 13
Phase Gates
        ↓
PHASE 14
Change Impact
        ↓
PHASE 15
Reactive Intelligence
        ↓
PHASE 16
Project Memory / Events
        ↓
PHASE 17
Three.js
        ↓
PHASE 18
Chat Rendering
        ↓
PHASE 19
Scrum / Kanban / Hybrid WIP
        ↓
PHASE 20
Testing
        ↓
PHASE 21
Final Integration
        ↓
PHASE 22
NexusFlow Classic / V3 Entry Verification
```

---

# Final Navigation Principle

The user must always have a clear choice:

> **"Do I want the existing NexusFlow experience, or do I want a new methodology-specific V4 environment?"**

The answer is visible directly in the environment selector.

**NexusFlow → existing V3 tabs/index**

**Waterfall → new V4 Waterfall environment**

**Scrum → V4 Scrum when implemented**

**Kanban → V4 Kanban when implemented**

**Hybrid → V4 Hybrid when implemented**

This protects V3 while allowing V4 to become a genuinely new generation of NexusFlow.
