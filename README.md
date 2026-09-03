# 🚀 NexusFlow V3.0

> **AI-Powered Agile Project Management & Student Project Operating System**
>
> A real-time project workspace that combines AI-assisted planning, DAA-based optimization, verified team skills, collaboration, GitHub-aware execution, project intelligence, risk detection, team health, and continuous learning.

<p align="center">
  <strong>Plan smarter • Collaborate in real time • Execute with evidence • Learn continuously</strong>
</p>

---

## 📌 Overview

**NexusFlow V3.0** is an intelligent project-management platform designed for student software/project teams.

Version 3.0 evolves the earlier project-management foundation into a shared, real-time project operating system. It connects:

- 👤 Identity and secure authentication
- 👥 Team formation and verified skills
- 📋 Projects, tasks, subtasks and sprints
- 🧠 AI-assisted project understanding and planning
- 📊 Deterministic DAA algorithms for optimization
- ❤️ Team Health and workload intelligence
- ⚠️ Risk Intelligence
- 🔄 AI sprint retrospectives and learning
- 💬 Global Chat and private Team Chat
- 🔗 GitHub project/development activity
- 🔔 Notifications and realtime activity
- 🧩 Project decisions, opinions and recommendations
- 📚 AI/dataset resource discovery
- 🛡️ Role-aware authorization and secure collaboration

### Core principle

> **AI assists. Deterministic algorithms optimize. Evidence grounds. Users decide. Real-time events synchronize.**

---

# 🌟 What's New in V3.0

NexusFlow V3.0 adds the human, collaboration, trust and execution layer around the project intelligence already established in the earlier version.

### V2 → V3 evolution

```text
V2.0

IDEA
  ↓
UNDERSTAND
  ↓
RESEARCH
  ↓
RECOMMEND
  ↓
DECIDE
  ↓
ARCHITECT
  ↓
PLAN
  ↓
OPTIMIZE
  ↓
EXECUTE


V3.0

IDEA
  ↓
UNDERSTAND
  ↓
RESEARCH
  ↓
RECOMMEND
  ↓
DECIDE
  ↓
FORM THE TEAM
  ↓
VERIFY SKILLS
  ↓
ARCHITECT
  ↓
PLAN
  ↓
OPTIMIZE
  ↓
EXECUTE TOGETHER
  ↓
CHAT / COLLABORATE
  ↓
OBSERVE ACTIVITY
  ↓
DETECT RISKS
  ↓
LEARN FROM SPRINTS
  ↓
REPLAN
  ↓
CONTINUOUS IMPROVEMENT
```

V3.0 therefore understands not only the **project**, but also:

```text
PROJECT
   +
TEAM
   +
PEOPLE
   +
VERIFIED SKILLS
   +
COMMUNICATION
   +
EXECUTION
   +
GITHUB ACTIVITY
   +
TEAM HEALTH
   +
HISTORICAL LEARNING
```

---

# 🖼️ V3.0 Architecture

<p align="center">
  <img src="images/architecture-version3.0.png" width="100%" alt="NexusFlow V3.0 System Architecture">
</p>

### Architecture layers

```text
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT — VERCEL                           │
│ React Native + Expo + TypeScript + React Native Web          │
│ Dashboard • Projects • Tasks • Sprints • AI • Chat • Graphs  │
└──────────────────────────────┬───────────────────────────────┘
                               │
                         HTTPS / REST
                               │
                         WebSocket / Socket.IO
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    BACKEND — RENDER                          │
│ Node.js + Express                                            │
│ Auth • Users • Teams • Projects • Tasks • Sprints             │
│ Skills • Chat • Notifications • Risk • Health • Retro        │
│ GitHub • AI • Decisions • Analytics                           │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                │                               │
        ┌───────▼────────┐              ┌───────▼──────────┐
        │    MongoDB     │              │   Socket.IO      │
        │ Users          │              │ Realtime Events  │
        │ Teams          │              │ Tasks            │
        │ Projects       │              │ Sprints          │
        │ Tasks          │              │ Chat             │
        │ Skills         │              │ Presence         │
        │ Risks          │              │ Notifications    │
        │ Decisions      │              └──────────────────┘
        │ Retros         │
        └────────────────┘
                │
        ┌───────▼─────────────────────────────────────────────┐
        │                  AI ORCHESTRATION                   │
        │ OmniRoute                                           │
        │ Gemini Free → OpenRouter Free → Deterministic      │
        │ Fallback                                            │
        └─────────────────────────────────────────────────────┘
```

---

# 🔄 V3.0 User Journey & Workflow

<p align="center">
  <img src="images/workflow-version3.0.png" width="100%" alt="NexusFlow V3.0 User Journey and Workflow">
</p>

The typical journey through NexusFlow V3.0 is:

```text
1. AUTHENTICATE
      ↓
2. OPEN DASHBOARD
      ↓
3. CREATE / JOIN WORKSPACE
      ↓
4. FORM TEAM + INVITE MEMBERS
      ↓
5. VERIFY SKILLS
      ↓
6. CREATE PROJECT
      ↓
7. ADD DETAILED PROJECT DESCRIPTION
      ↓
8. AI UNDERSTANDS PROJECT
      ↓
9. GENERATE / PLAN TASKS
      ↓
10. PRIORITIZE WORK
      ↓
11. OPTIMIZE SPRINT
      ↓
12. MANAGE DEPENDENCIES
      ↓
13. ASSIGN WORK
      ↓
14. COLLABORATE THROUGH CHAT
      ↓
15. TRACK REAL EXECUTION
      ↓
16. MONITOR TEAM HEALTH
      ↓
17. DETECT RISKS
      ↓
18. REVIEW RETROSPECTIVE
      ↓
19. LEARN FROM EXECUTION
      ↓
20. REPLAN & IMPROVE
      ↓
21. DELIVER PROJECT
```

---

# 🧩 Core V3.0 Features

## 🔐 Authentication & Identity

- Email/password authentication
- Google OAuth
- GitHub OAuth/integration support
- Forgot-password flow
- Secure JWT-based sessions
- HTTP-only cookie handling for OAuth callback/session flow
- Role-aware authorization
- User profiles
- Profile skills
- Identity consistency across team/project workflows

---

## 👥 Workspace & Team Management

NexusFlow separates workspace/team management from individual user identity.

Capabilities include:

- Create a workspace/team
- Join a team through invitation
- Invite registered users
- Real-time invitation notifications
- Accept/reject invitations
- View team members
- View member profiles
- Leader/member role separation
- Leave-team workflow
- Member removal workflow
- Team departure notifications
- Team skill visibility
- Team-level collaboration

All protected team operations are authorized on the backend.

---

# 🧠 Verified Skills

V3.0 introduces a verification layer instead of relying only on self-declared skills.

### Flow

```text
Skill Category
      ↓
Specific Skill Selection
      ↓
5-Question Verification Quiz
      ↓
Immediate Correct / Wrong Feedback
      ↓
Explanation
      ↓
Score
      ↓
3/5 or Higher → VERIFIED
Below 3/5     → NOT VERIFIED
      ↓
Persistent Profile Badge
```

Features include:

- Broad skill categories
- Specific skill selection
- Multiple skill selection
- Five-question quizzes
- Immediate explanations
- Verification threshold
- Persistent verified badges
- Attempt history/infrastructure
- Team skill graph
- Skill-gap detection
- Skill recommendations

AI quiz generation can use the existing free AI orchestration path, with deterministic fallback behavior when AI is unavailable.

---

# 📋 Project Management

NexusFlow provides a complete project execution workspace.

### Project capabilities

- Project creation
- Project editing
- Detailed project description
- Large project specifications
- Goals and technology stack
- Project context
- Task decomposition
- Task management
- Subtasks
- Priorities
- Status tracking
- Due dates
- Required skills
- Dependency relationships
- Sprint planning
- Shared project state

---

# 📝 Large Project Descriptions

A project can contain a detailed specification rather than a short summary.

The description is intended to capture:

- Problem statement
- Project goals
- Target users
- Functional requirements
- Non-functional requirements
- Technology stack
- Architecture requirements
- Database requirements
- API requirements
- UI requirements
- AI/ML requirements
- Dataset requirements
- Security requirements
- Testing requirements
- Deployment requirements
- Milestones
- Deliverables
- Constraints
- Dependencies
- Acceptance criteria
- Examples
- Edge cases
- Future scope

The project-description workflow is designed to support **1000+ lines of project specification** without intentionally truncating the original project context.

When model context limits require special handling, the original project description remains the source of truth and the AI layer can use structured/chunked analysis rather than silently discarding project information.

---

# 🤖 AI Project Intelligence

NexusFlow does not treat AI as a simple chatbot.

The AI layer can help understand the project and produce actionable project intelligence.

### Project understanding pipeline

```text
Project Description
       ↓
Project Context Extraction
       ↓
Requirements
       ↓
Constraints
       ↓
Technology
       ↓
Dependencies
       ↓
Milestones
       ↓
Risks
       ↓
Acceptance Criteria
       ↓
Actionable Work
       ↓
Task / Plan Recommendations
```

The objective is to generate project-specific work instead of generic tasks.

### Example

Instead of:

```text
"Work on backend"
```

NexusFlow should produce something closer to:

```text
"Implement the REST endpoint for sensor-event ingestion,
validate authenticated requests, persist normalized events
in MongoDB, and add integration tests for authorization
and malformed payloads."
```

The generated work should remain grounded in the project's actual description and constraints.

---

# 🧠 Project AI & Decision Engine

V3.0 includes AI-assisted project intelligence for:

- Project analysis
- Planning
- Recommendations
- Decisions
- Technology evaluation
- AI/ML guidance
- Dataset/resource discovery
- Historical context
- Task planning
- Sprint recommendations

### Decision principle

AI recommendations are advisory.

```text
AI analyzes
    ↓
AI explains
    ↓
AI recommends
    ↓
USER REVIEWS
    ↓
USER DECIDES
    ↓
DECISION IS SAVED
```

AI must not silently perform destructive project changes.

---

# 📚 AI & Dataset Resources

Project AI can surface resources relevant to the project's domain.

Resources can include:

- Kaggle datasets
- Public datasets
- AI/ML resources
- Pretrained model resources
- Documentation
- Relevant learning resources

The resource recommendation layer follows the same zero-cost AI policy and provides deterministic fallback recommendations when AI is unavailable.

---

# ⚙️ DAA Algorithm Integration

NexusFlow is a DAA-focused project: each algorithm solves a real product problem and is reachable through an actual user workflow.

| Algorithm | Product Problem | NexusFlow Usage | Complexity |
|---|---|---|---|
| 🟢 Greedy Scheduler | What should be done first? | Task prioritization | O(n log n) |
| 🟠 0/1 Knapsack | What fits in a sprint? | Sprint optimization | O(n·W) |
| 🔵 DFS | Can this dependency create a cycle? | Dependency validation | O(V+E) |
| 🔷 BFS | What work can run in parallel? | Dependency levels/readiness | O(V+E) |
| 🟣 Topological Sort | What is the safe execution order? | Dependency-aware sequencing | O(V+E) |
| 🔴 Branch & Bound | Who is the best person for the work? | Skill-aware assignment | O(n!) pruned |
| 🟡 Merge Sort | How should the backlog be ordered? | Task sorting/analytics | O(n log n) |
| 🔍 Boyer–Moore | How can tasks be searched efficiently? | Task/AI search | O(n/m) average |

### Design philosophy

> A user should benefit from the algorithms without needing to know that the algorithms exist.

The algorithms power product behavior; the UI should remain understandable to normal users.

More technical DAA documentation is available in `docs/DAAIntegration.md`.

---

# 🚀 Sprint Optimization

Sprint planning uses the **0/1 Knapsack** model.

```text
Available Sprint Capacity
          +
Task Effort
          +
Task Value
          ↓
0/1 Knapsack
          ↓
Maximum-value feasible task subset
          ↓
Sprint Plan
```

The result is a capacity-aware sprint rather than simply selecting the largest number of tasks.

---

# 🔗 Dependency Graph

NexusFlow models task dependencies as a graph.

```text
Task A
  ↓
Task B
  ↓
Task C
```

### Graph intelligence

- DFS prevents dependency cycles
- BFS determines dependency levels/waves
- Topological Sort produces a valid execution order
- Dependency information contributes to planning and readiness

A dependency should not be accepted when it creates an invalid cycle.

---

# 👤 Smart Task Assignment

The assignment engine can use **Branch & Bound** to search for a low-cost team-to-task assignment based on available skills.

Conceptually:

```text
Team Members × Tasks
        ↓
Skill / Assignment Cost Matrix
        ↓
Branch & Bound Search
        ↓
Pruned Search Space
        ↓
Best Assignment
```

This is intended to make task assignment more explainable and algorithmically grounded.

---

# ❤️ Team Health Intelligence

Team Health evaluates the current state of project execution.

Signals can include:

- Task completion
- Task status
- Progress
- Priority
- Due dates
- Workload
- Distribution of work
- Other meaningful execution signals

The score is based on fresh project/task state rather than a static hardcoded value.

Example concept:

```text
Current DB State
      ↓
Task / Workload Signals
      ↓
Team Health Analysis
      ↓
Health Score
      ↓
Explanation / Insights
```

Team Health is intended to help the team understand execution quality, not merely display a decorative percentage.

---

# ⚠️ Risk Intelligence

Risk Intelligence scans project and task state for meaningful risk conditions.

Potential risk categories include:

- Deadline risk
- Overdue work
- Dependency risk
- Blocked work
- Workload imbalance
- Stale work
- Skill coverage gaps
- Sprint capacity pressure
- Execution anomalies
- Other project-specific risk conditions

The system explains risks in simple project/task-specific language.

```text
Project State
     ↓
Risk Scan
     ↓
Risk Categories
     ↓
Impact / Explanation
     ↓
Recommended Mitigation
```

Risk recommendations do not silently mutate project state.

---

# 🔄 AI Retrospective & Learning Loop

After execution, NexusFlow can analyze sprint/project history.

### Retrospective flow

```text
Sprint History
      ↓
Completed / Incomplete Work
      ↓
Execution Patterns
      ↓
Team Feedback
      ↓
AI Retrospective
      ↓
Insights
      ↓
Recommendations
      ↓
Next Sprint Improvements
```

The retrospective is recommendation-oriented.

It should not silently modify:

- Tasks
- Assignments
- Permissions
- Project state
- Team roles

The team decides what to adopt.

---

# 🗳️ Opinions, Consensus & Decisions

NexusFlow supports team opinions and decision records.

```text
Team Question
     ↓
Member Opinions
     ↓
Consensus / Voting
     ↓
AI Synthesis
     ↓
Decision
     ↓
Historical Context
```

Decisions can become part of project history so future project intelligence has more context.

---

# 💬 Global Chat & Team Chat

V3.0 separates human communication into two scopes.

## 🌍 Global Chat

Global Chat is available for registered users as the platform-wide communication space.

```text
Registered Users
      ↓
Global Chat
      ↓
Shared Conversation
```

## 👥 Team Chat

Team Chat is private to the relevant project/team.

```text
Team Members
      ↓
Private Team Room
      ↓
Realtime Messages
```

### Realtime capabilities

- Socket.IO
- Persistent messages
- Team isolation
- Realtime delivery
- Unread counters
- Independent read state
- Mark-as-read
- Reconnect handling
- Presence/activity behavior where supported

A Team Chat message must not leak into another team's conversation.

Global Chat and Team Chat are intentionally separate systems.

---

# 🔔 Notifications

Notifications support important project/team events.

Examples:

- Invitations
- Invitation updates
- Member joins
- Member leaves
- Member removal
- Task assignments
- Task changes
- Sprint events
- Risk events
- Skill verification
- Decisions
- GitHub activity
- Other relevant project events

Unread state is maintained independently where required.

---

# 🔗 GitHub Integration

NexusFlow V3.0 includes GitHub-aware project execution capabilities.

Supported concepts include:

- Repository linking
- GitHub authentication/integration
- Commit activity
- Pull request activity
- Issue activity
- Development activity ingestion
- GitHub-to-task correlation
- Activity timelines
- Stale/inactive work signals

GitHub activity can contribute evidence to project intelligence.

GitHub credentials must be configured in the deployment environment before OAuth/integration functionality can operate.

---

# 🧠 Project Brain & Historical Context

NexusFlow maintains project-aware context for intelligent recommendations.

Project intelligence can use:

```text
Project Details
+
Tasks
+
Sprints
+
Dependencies
+
Decisions
+
Team Skills
+
Risk History
+
Retrospectives
+
Execution Signals
+
GitHub Activity
```

This enables recommendations to become more project-specific over time.

---

# 🛡️ Security & Authorization

Security is enforced at the backend.

Important principles:

- JWT authentication
- Server-side authorization
- Role-aware permissions
- Protected project/team operations
- Ownership checks
- Membership checks
- OAuth state protection
- Secure password-reset flow
- Single-use reset-token invalidation
- HTTP-only session/cookie handling where applicable
- No secrets committed to Git
- No API credentials exposed to the frontend

Frontend permission checks improve UX, but **backend authorization remains authoritative**.

---

# 💰 Zero-Cost AI Policy

NexusFlow V3.0 is designed around a **$0 AI usage policy**.

AI requests are routed through the existing OmniRoute layer.

Conceptually:

```text
AI Request
    ↓
OmniRoute
    ↓
Gemini Free Tier
    ↓
OpenRouter Free Models
    ↓
Deterministic / Local Fallback
```

The system does **not** intentionally fall back to paid providers.

The production codebase is designed to reject routes that violate the zero-cost policy rather than silently introducing billing.

### Important

Free-provider availability is externally controlled. The application can enforce the **no-paid-route policy**, but it cannot guarantee that a third-party free provider will always be available.

---

# 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React Native |
| Web | React Native Web |
| Framework | Expo / Expo Router |
| Language | TypeScript |
| Backend | Node.js |
| API | Express.js |
| Realtime | Socket.IO |
| Database | MongoDB |
| ODM | Mongoose |
| Authentication | JWT |
| OAuth | Google / GitHub |
| AI Routing | OmniRoute |
| Free AI | Gemini Free Tier / OpenRouter Free routes |
| Deployment — Frontend | Vercel |
| Deployment — Backend | Render |
| Database Hosting | MongoDB Atlas |

---

# 📁 High-Level Repository Structure

```text
NEXUSFLOW-/
│
├── client/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── ...
│
├── server/
│   ├── algorithms/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── socket/
│   ├── middleware/
│   └── ...
│
├── docs/
│   ├── Architecture.md
│   ├── ProductVision.md
│   ├── UserFlow.md
│   └── DAAIntegration.md
│
├── MD FILES/
│   ├── NEXUSFLOW_V3.0_ARCHITECTURE_PLAN.md
│   ├── NEXUSFLOW_V3_INTEGRATION.md
│   └── ...
│
├── images/
│   ├── architecture-version3.0.png
│   └── workflow-version3.0.png
│
└── README.md
```

---

# 🌐 Production Deployment

### Frontend

**Vercel**

`https://nexusflow-eta.vercel.app`

### Backend

**Render**

`https://nexusflow-nxeg.onrender.com`

### Database

**MongoDB / MongoDB Atlas**

The production frontend communicates with the Render backend over HTTPS, while Socket.IO provides realtime communication.

---

# 🔑 Production OAuth Configuration

## Google OAuth

Production callback:

```text
https://nexusflow-nxeg.onrender.com/api/auth/google/callback
```

Production frontend origin:

```text
https://nexusflow-eta.vercel.app
```

Google OAuth credentials must be configured in the Render environment.

## GitHub OAuth

Production callback:

```text
https://nexusflow-nxeg.onrender.com/api/github/auth/callback
```

Production homepage:

```text
https://nexusflow-eta.vercel.app
```

GitHub OAuth credentials must be configured in the Render environment.

> Never place OAuth client secrets in this README or commit them to Git.

---

# 🧪 Testing & Quality

NexusFlow V3.0 includes testing around major V3 systems.

Important verification areas include:

- Authentication
- OAuth flows
- Workspace/team operations
- User lookup
- Team membership
- Skill verification
- Quiz scoring
- Team Health
- Risk Intelligence
- Retrospective
- Project intelligence
- AI orchestration
- Zero-cost AI policy
- Chat persistence
- Chat isolation
- Socket.IO realtime delivery
- Unread counters
- Mark-as-read
- Project synchronization
- GitHub integration behavior
- DAA algorithm behavior

The browser UI should also be verified because a backend passing integration tests does not guarantee that the correct component is mounted or that the production UI is wired correctly.

---

# 📊 DAA Complexity Summary

| Algorithm | Time | Space |
|---|---:|---:|
| Greedy Scheduler | O(n log n) | O(n) |
| 0/1 Knapsack | O(n·W) | O(n·W) |
| DFS | O(V+E) | O(V) |
| BFS | O(V+E) | O(V) |
| Topological Sort | O(V+E) | O(V) |
| Branch & Bound | O(n!) worst-case, pruned | O(n²) |
| Merge Sort | O(n log n) | O(n) |
| Boyer–Moore | O(n/m) average* | O(σ) |

\* Actual Boyer–Moore performance depends on the implementation and input characteristics.

---

# 🎯 Product Philosophy

NexusFlow V3.0 follows five principles:

### 1. AI assists

AI analyzes, summarizes, explains and recommends.

### 2. Algorithms optimize

DAA algorithms provide deterministic prioritization, scheduling, graph and assignment behavior.

### 3. Evidence grounds

Project state, execution data, team skills and development activity provide context.

### 4. Users decide

Important decisions and destructive changes require user control.

### 5. Real-time events synchronize

Team members should see meaningful shared changes without repeatedly refreshing the browser.

---

# 🔁 End-to-End Intelligence Loop

```text
                  ┌───────────────────┐
                  │   PROJECT IDEA    │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ PROJECT CONTEXT   │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ AI UNDERSTANDING  │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ TASK DECOMPOSITION│
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ DAA OPTIMIZATION  │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ SPRINT + EXECUTION│
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ COLLABORATION     │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ REAL ACTIVITY     │
                  └─────────┬─────────┘
                            ↓
             ┌──────────────┴──────────────┐
             ↓                             ↓
      ┌───────────────┐             ┌───────────────┐
      │ TEAM HEALTH   │             │ RISK ENGINE   │
      └───────┬───────┘             └───────┬───────┘
              └──────────────┬──────────────┘
                             ↓
                  ┌───────────────────┐
                  │ RETROSPECTIVE     │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ LEARNING LOOP     │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │ REPLAN / IMPROVE  │
                  └─────────┬─────────┘
                            │
                            └──────────→ NEXT SPRINT
```

---

# 📚 Documentation

Additional project documentation is available in:

- `docs/`
- `MD FILES/`

Important references include:

- `docs/Architecture.md`
- `docs/ProductVision.md`
- `docs/UserFlow.md`
- `docs/DAAIntegration.md`
- `MD FILES/NEXUSFLOW_V3.0_ARCHITECTURE_PLAN.md`
- `MD FILES/NEXUSFLOW_V3_INTEGRATION.md`

---

# 🎓 Academic Context

NexusFlow was developed for the **Design and Analysis of Algorithms Laboratory (DAA EL)** at **RV College of Engineering**.

The project demonstrates how classical DAA concepts can be integrated into a practical software product instead of being implemented only as isolated academic examples.

The platform connects algorithmic concepts to real product actions:

```text
Greedy
   → Task Prioritization

0/1 Knapsack
   → Sprint Optimization

DFS
   → Dependency Cycle Detection

BFS
   → Dependency Levels

Topological Sort
   → Execution Ordering

Branch & Bound
   → Team Assignment

Merge Sort
   → Task Ordering

Boyer–Moore
   → Task Search
```

---

# 🚀 Getting Started

## 1. Clone the repository

```bash
git clone https://github.com/Parik-2006/NEXUSFLOW-.git
cd NEXUSFLOW-
```

## 2. Install frontend dependencies

```bash
cd client
npm install
```

## 3. Install backend dependencies

```bash
cd ../server
npm install
```

## 4. Configure environment variables

Create the appropriate local environment files using the existing `.env.example` files.

Never commit:

```text
.env
.env.local
production secrets
OAuth client secrets
JWT secrets
MongoDB credentials
AI provider secrets
```

## 5. Start the backend

Use the existing server start command defined by the repository.

## 6. Start the frontend

Use the existing Expo/React Native development command defined by the repository.

---

# ⚠️ Configuration Notes

NexusFlow depends on external services for some functionality.

For local development, configure the required environment variables for:

- MongoDB
- JWT/session security
- Google OAuth
- GitHub OAuth
- Email delivery
- OmniRoute/free AI providers

For production:

- Vercel hosts the frontend.
- Render hosts the backend.
- MongoDB Atlas hosts the database.
- OAuth callback URLs must match the configured production URLs exactly.
- AI routing must remain within the project's zero-cost policy.

---

# 🛡️ Production Safety

The `main` branch represents production.

Development and V3 work should preserve the stable production architecture.

Before production promotion:

```text
Code Review
   ↓
TypeScript Check
   ↓
Server Syntax Check
   ↓
Automated Tests
   ↓
Browser Verification
   ↓
API Verification
   ↓
Security Verification
   ↓
Environment Verification
   ↓
Production Smoke Test
   ↓
Promotion
```

Never promote code merely because it compiles.

---

# 📜 License

This project is developed for **RV College of Engineering** as part of the **Design and Analysis of Algorithms Laboratory (DAA EL)**.

---

# ⭐ NexusFlow V3.0

> **From project idea → intelligent planning → optimized execution → team collaboration → continuous learning.**

<p align="center">
  <strong>Build. Collaborate. Optimize. Learn. Deliver.</strong>
</p>
