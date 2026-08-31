# NEXUSFLOW 2.0 — Phase 1: Database Architecture & Data Foundation

> **Audience:** You are studying the architecture as it is being built.
> Every section below explains not just WHAT was created, but WHY it exists,
> WHAT problem it solves, HOW it relates to existing data, and WHAT each field means.

---

## Table of Contents
1. [The Core Problem Phase 1 Solves](#1-the-core-problem-phase-1-solves)
2. [The Entity Relationship Map](#2-the-entity-relationship-map)
3. [Design Principles](#3-design-principles)
4. [Entity Deep-Dives](#4-entity-deep-dives)
   - 4.1 [Project (+ embedded ProjectContext)](#41-project--embedded-projectcontext)
   - 4.2 [Decision](#42-decision)
   - 4.3 [ResearchItem](#43-researchitem)
   - 4.4 [Recommendation](#44-recommendation)
   - 4.5 [ArchitectureComponent](#45-architecturecomponent)
   - 4.6 [Resource](#46-resource)
   - 4.7 [AIConversation](#47-aiconversation)
   - 4.8 [AIMessage](#48-aimessage)
   - 4.9 [Task (modified)](#49-task-modified)
   - 4.10 [Team (modified)](#410-team-modified)
5. [Relationship Decisions: Embedded vs. Referenced](#5-relationship-decisions-embedded-vs-referenced)
6. [Index Strategy](#6-index-strategy)
7. [Backward Compatibility: What Did NOT Change](#7-backward-compatibility-what-did-not-change)
8. [How NEXUSFLOW 1.x Data Flow Changes in 2.0](#8-how-nexusflow-1x-data-flow-changes-in-20)
9. [The Pipeline: Idea to Tasks](#9-the-pipeline-idea-to-tasks)
10. [New REST API Endpoints](#10-new-rest-api-endpoints)

---

## 1. The Core Problem Phase 1 Solves

### What NEXUSFLOW 1.x Knew About a Project

```
Team {
  projectTitle:       "Smart Irrigation System"    ← a string
  projectDescription: "Build an IoT system..."     ← a string
}
```

That's it. Two strings. The **entire concept of "project"** in NEXUSFLOW 1.x was two string fields on a `Team` document.

### Why This Was a Problem

| Limitation | Impact |
|-----------|--------|
| One project per team | A student team that built project A can never cleanly start project B |
| No structured understanding | AI can't answer "what hardware does this project need?" |
| No decision history | AI forgets every architecture decision the moment the page reloads |
| No research storage | Students' research notes live in Slack or are lost entirely |
| No AI memory | Every @ai chat starts with zero context about the project |
| No resource inventory | The system doesn't know the project needs an OpenWeatherMap API key |
| Context-free task generation | Tasks are generated from description strings, not structured requirements |

### What Phase 1 Creates

A **complete data foundation** that gives the system structured, persistent knowledge about:

- **WHAT** the student wants to build (original prompt + extracted context)
- **WHY** certain technologies were chosen (Decision records)
- **WHAT** was researched (ResearchItem records)
- **WHAT** the system recommends (Recommendation records)
- **HOW** the system is architected (ArchitectureComponent records)
- **WHAT** the project needs (Resource inventory)
- **WHAT** was said to the AI (persistent AIConversation + AIMessage records)

---

## 2. The Entity Relationship Map

```
Team (existing)
│
├── activeProjectId ──────────────► Project (NEW)
│                                    │  ├── title
│                                    │  ├── description
│                                    │  ├── originalPrompt  ← most important field
│                                    │  ├── domain / projectType
│                                    │  ├── status / currentPhase
│                                    │  └── context (EMBEDDED ProjectContext)
│                                    │       ├── problemStatement
│                                    │       ├── targetUsers[]
│                                    │       ├── goals[]
│                                    │       ├── constraints[]
│                                    │       ├── hardwareRequirements[]
│                                    │       ├── softwareRequirements[]
│                                    │       ├── aiMlRequirements[]
│                                    │       ├── integrations[]
│                                    │       └── ...
│                                    │
│                             projectId ──────────────────────────┐
│                                    │                             │
│                                    ├──► Decision[]              │
│                                    ├──► ResearchItem[]          │
│                                    ├──► Recommendation[]        │
│                                    ├──► ArchitectureComponent[] │
│                                    ├──► Resource[]              │
│                                    └──► AIConversation[]        │
│                                              │                  │
│                                              └──► AIMessage[]   │
│                                                                  │
└── Tasks[] ──────────────────────────────────────────────────────┘
     (existing)  teamId (unchanged)
                 projectId (NEW, optional, null = legacy task)
```

### Key Relationship Rules
- A **Team** can have MANY **Projects** (one per semester, one per hackathon, etc.)
- `Team.activeProjectId` points to the ONE currently active project
- A **Project** is owned by exactly ONE **Team** (via `teamId`)
- All new entities (Decision, Research, etc.) belong to exactly ONE **Project**
- **Tasks** still belong to a **Team** via `teamId` (unchanged)
- Tasks ALSO have an optional `projectId` to scope them to a specific project

---

## 3. Design Principles

### Principle 1: Additive-Only Changes
> "Do not remove or rename existing fields."

Every change in Phase 1 is an **addition**. No existing fields were deleted. No existing field was renamed. No existing enum was narrowed. The system that ran in NEXUSFLOW 1.x continues to run without any migration.

### Principle 2: Optional New References = Safety Net
`Task.projectId` defaults to `null`. `Team.activeProjectId` defaults to `null`.

This means NEXUSFLOW 1.x code paths that create Tasks or Teams **still work with zero changes**. They just produce documents with `projectId: null` — which is perfectly valid.

### Principle 3: Embed What's Always Together, Reference What Grows
`ProjectContext` is **embedded** in `Project` because they're always read together, it's 1:1, and it needs atomic updates.

Everything else (Decisions, ResearchItems, etc.) is **referenced** because these grow independently and have their own lifecycle.

### Principle 4: Every Field Has a Demonstrated Future Purpose
No "padding" fields were added. Every single field in every schema is explained with:
- Its purpose
- Which phase uses it
- What question it answers

---

## 4. Entity Deep-Dives

### 4.1 Project (+ embedded ProjectContext)

**File:** [`server/models/Project.js`](file:///p:/DAA%20OPTIONAL/server/models/Project.js)

#### What Problem It Solves
Replaces the two-string `(projectTitle, projectDescription)` representation with a **rich, structured, queryable document** that the AI can reason about.

#### Top-Level Fields

| Field | Type | Purpose |
|-------|------|---------|
| `teamId` | ObjectId → Team | Ownership. Required. Indexed. |
| `title` | String | Human-readable project name |
| `description` | String | Full prose description |
| `originalPrompt` | String | **The exact text the student typed.** Source of truth. Never overwritten. Used to re-extract context with better models in future phases. |
| `domain` | String | e.g. "IoT", "Web App", "AI/ML System" — drives which specialist advisors are activated |
| `projectType` | String | e.g. "Smart Agriculture" — sub-classification within domain |
| `academicContext` | String | e.g. "Final Year Project" — affects recommendations (budget constraints, team size) |
| `status` | Enum | Project lifecycle state |
| `currentPhase` | Enum | WHERE in the NEXUSFLOW 2.0 pipeline the team is right now |
| `teamSize` | Number | Number of developers — affects sprint capacity calculations |
| `sprintWeeks` | Number | Total sprint weeks — used by Phase 2+ Sprint Optimizer |
| `taskCount` / `doneCount` | Number | Denormalized counters for dashboard (avoids counting Tasks every load) |
| `context` | Embedded | See below |

#### The `status` Lifecycle

```
ideation → planning → active → completed
                   ↘ on_hold → active
                              ↘ cancelled
```

#### The `currentPhase` Lifecycle (NEXUSFLOW 2.0 Pipeline)

```
idea → understanding → research → decisions → architecture → development → testing → deployment → completed
```

This is different from `status`. `status` tells you if the project is alive.
`currentPhase` tells you WHERE in the AI-assisted pipeline the team is.

#### Embedded ProjectContext Fields

The context stores **structured understanding** extracted from the original natural-language prompt.

| Field | Type | Question It Answers |
|-------|------|---------------------|
| `problemStatement` | String | What specific problem does this project solve? |
| `targetUsers` | String[] | Who will use the product? |
| `goals` | String[] | What are the explicit success criteria? |
| `constraints` | String[] | Budget, timeline, hardware limits? |
| `expectedOutputs` | String[] | What does the team need to deliver? |
| `hardwareRequirements` | String[] | What physical components are needed? |
| `softwareRequirements` | String[] | What software components are needed? |
| `aiMlRequirements` | String[] | What AI/ML capabilities are needed? |
| `integrations` | String[] | What third-party APIs/services are needed? |
| `deploymentRequirements` | String[] | Where does it deploy? |
| `securityConsiderations` | String[] | Privacy and security concerns? |
| `budgetUsd` | Number | Estimated project budget in USD |
| `estimatedDurationDays` | Number | How many days is the project expected to take? |
| `preferredStack` | String[] | What technologies does the team want to use? |
| `assumptions` | String[] | What did the AI assume when extracting context? |
| `extractedBy` | Enum | Was this filled by AI, manually, or hybrid? |
| `extractionConfidence` | Number | 0.0–1.0 confidence in AI extraction quality |

**Why embed context instead of a separate collection?**
ProjectContext only makes sense inside its Project. It is ALWAYS loaded when the Project is loaded (every AI request needs both the project metadata AND the context). Embedding gives one atomic read and write — no join required.

---

### 4.2 Decision

**File:** [`server/models/Decision.js`](file:///p:/DAA%20OPTIONAL/server/models/Decision.js)

#### What Problem It Solves
Records every significant technical and architectural choice made during the project.

Currently, if a student decides "we'll use MongoDB because our sensor data schema evolves frequently", that reasoning is **never recorded**. Phase 2+ requires this to:
- Answer "why did we choose X?" questions
- Feed the Decision Engine (AI proposes, student accepts/rejects)
- Flag risks when a superseded decision has orphaned tasks

#### Key Fields

| Field | Purpose |
|-------|---------|
| `title` | Short label: "Database Technology Selection" |
| `decision` | The actual choice: "Use MongoDB as primary database" |
| `reasoning` | WHY this was chosen — the most important field for AI memory |
| `alternativesConsidered` | What was evaluated before this choice |
| `selectedOption` | The winning option (structured for querying) |
| `category` | technology / architecture / hardware / ai_model / database / deployment / security / process |
| `status` | proposed → accepted → rejected → superseded |
| `supersededBy` | ObjectId → newer Decision that replaced this one |
| `source` | "ai" (system proposed) or "manual" (team decided) |
| `confidence` | 0.0–1.0 — how confident is the system/user in this choice |

#### Decision Lifecycle

```
proposed ──────► accepted ──────► superseded (by newer Decision)
         └─────► rejected
```

---

### 4.3 ResearchItem

**File:** [`server/models/ResearchItem.js`](file:///p:/DAA%20OPTIONAL/server/models/ResearchItem.js)

#### What Problem It Solves
Stores research findings (papers, docs, datasets, benchmarks) with structure, so the system knows WHAT the team read and WHAT they learned.

#### Key Fields

| Field | Purpose |
|-------|---------|
| `title` | Paper/article/docs title |
| `authors` | Who wrote it |
| `url` | Where to find it |
| `source` | paper / documentation / article / dataset / benchmark / api / github / book / video |
| `abstract` | Summary or excerpt |
| `topics` | Keywords: ["LSTM", "soil moisture", "IoT"] |
| `relevance` | 1–5 scale: how relevant to this specific project? |
| `notes` | Student's own notes on what they learned |
| `publishedAt` | Publication date |
| `status` | found → reading → summarized → applied → irrelevant |
| `embeddingVector` | **Phase 4 Placeholder.** Set to `null` in Phase 1. Will be populated by Phase 4's vector embedding pipeline for RAG (Retrieval Augmented Generation). Defined now to avoid schema migration later. |

---

### 4.4 Recommendation

**File:** [`server/models/Recommendation.js`](file:///p:/DAA%20OPTIONAL/server/models/Recommendation.js)

#### What Problem It Solves
Persists AI advisor suggestions so students can review, accept, and apply them. Currently, the existing 5-phase recommendation pipeline (BFS → Greedy → Knapsack → Merge → Topo) produces **task ordering** recommendations that vanish after socket delivery. This model stores **WHAT TO BUILD** recommendations — different problem, different collection.

#### Important Distinction

| Existing System | Phase 1 New |
|----------------|-------------|
| 5-phase DAA pipeline recommends **TASK ORDER** | Recommendation model stores **TECHNOLOGY CHOICES** |
| Runs Greedy/Knapsack/Topo on existing tasks | AI advisor suggests "use React Native" |
| Exists, unchanged, in `server/algorithms/` | New persistent record of suggestions |

#### Key Fields

| Field | Purpose |
|-------|---------|
| `recommendationType` | technology / framework / library / ai_model / hardware / database / api / dataset / architecture / cloud_service / tool / research_paper / process |
| `recommendedItem` | What is being recommended: "PyTorch", "ESP32", "OpenWeatherMap API" |
| `reason` | WHY this is recommended for THIS specific project |
| `confidence` | 0.0–1.0 confidence |
| `source` | ai_advisor / daa_pipeline / user / system |
| `alternatives` | Other options if this doesn't work |
| `relatedTaskId` | Which task triggered this recommendation |
| `status` | pending → accepted → rejected → applied → deferred |
| `rejectionReason` | Why the student said no (for AI learning, Phase 5+) |

---

### 4.5 ArchitectureComponent

**File:** [`server/models/ArchitectureComponent.js`](file:///p:/DAA%20OPTIONAL/server/models/ArchitectureComponent.js)

#### What Problem It Solves
Gives the system a **named, typed, queryable representation** of each layer of the project's technical architecture.

Without this, NEXUSFLOW knows about tasks but not WHICH PART OF THE SYSTEM those tasks belong to. "Implement Soil Moisture API" — is that a backend task? An IoT task? A data pipeline task? With ArchitectureComponent, the task can be scoped to the "Node.js REST API" component.

#### Component Types

| Type | Example |
|------|---------|
| `frontend` | React Native Mobile App |
| `backend` | Node.js + Express REST API |
| `database` | MongoDB Atlas cluster |
| `ai_ml` | PyTorch inference server |
| `hardware` | ESP32 sensor node |
| `iot_gateway` | MQTT broker (Mosquitto) |
| `auth` | JWT authentication service |
| `api_gateway` | Nginx reverse proxy |
| `messaging` | RabbitMQ event bus |
| `storage` | AWS S3 file storage |
| `monitoring` | Grafana + Prometheus |
| `deployment` | GitHub Actions CI/CD |
| `external_api` | OpenWeatherMap |

#### Key Fields

| Field | Purpose |
|-------|---------|
| `componentType` | See table above |
| `name` | Human name: "React Native Mobile App" |
| `description` | What this component does in the system |
| `technology` | Primary tech: "React Native + Expo" |
| `supportingTools` | Libraries: ["Redux", "React Navigation"] |
| `dependsOn` | ObjectId[] → other ArchitectureComponents (component-level DAG) |
| `relatedTaskIds` | ObjectId[] → Tasks that implement this component |
| `configuration` | Free-form Mixed: port, region, settings |
| `status` | planned → in_progress → completed → deprecated |

---

### 4.6 Resource

**File:** [`server/models/Resource.js`](file:///p:/DAA%20OPTIONAL/server/models/Resource.js)

#### What Problem It Solves
A polymorphic inventory of everything the project NEEDS in order to exist (APIs, hardware, AI models, datasets, libraries, tools).

#### Why Polymorphic (One Collection, Not Eight)

Creating `HardwareResource`, `ApiResource`, `DatasetResource`, etc. would cause:
- 8 nearly identical schema files
- Complex queries (impossible to ask "list ALL resources for this project" in one query)
- Foreign key hell when tasks reference resources

Instead, one `resources` collection with a `resourceType` discriminator field. Common fields at the top level. Type-specific fields in a free-form `metadata` field.

#### Resource Types

`api` | `ai_model` | `dataset` | `hardware` | `library` | `cloud_service` | `tool` | `documentation` | `research_paper` | `other`

#### Key Fields

| Field | Purpose |
|-------|---------|
| `resourceType` | The discriminator — what kind of resource? |
| `name` | "OpenWeatherMap API", "ESP32 Dev Board" |
| `description` | What it does for the project |
| `url` | Where to find/buy/access it |
| `accessType` | free / freemium / paid / open_source / purchase / academic |
| `estimatedCostUsd` | Budget planning: how much does this cost? |
| `metadata` | Mixed — type-specific data (API key required? Voltage? Rows in dataset?) |
| `status` | identified → evaluating → obtained → integrated → abandoned |
| `relatedTaskId` | Which task involves setting up this resource? |

---

### 4.7 AIConversation

**File:** [`server/models/AIConversation.js`](file:///p:/DAA%20OPTIONAL/server/models/AIConversation.js)

#### What Problem It Solves
The current @ai chat is EPHEMERAL and CONTEXT-FREE. Every page reload loses the conversation. Every message is isolated — the AI doesn't know the project.

AIConversation provides:
1. **Persistence** — conversations survive page reloads
2. **Project Scoping** — each conversation is linked to a project, so context (ProjectContext, Decisions, etc.) can be injected into prompts
3. **Topic Classification** — the system knows this is an "architecture_planning" conversation vs. a "general_assistance" one
4. **Session Management** — conversations can be archived, found by topic, resumed

#### Key Fields

| Field | Purpose |
|-------|---------|
| `projectId` | Which project is this conversation about? |
| `title` | Human-readable: "Architecture Discussion" |
| `topic` | project_onboarding / architecture_planning / technology_selection / task_generation / sprint_planning / research_query / general_assistance / risk_analysis / code_review |
| `status` | active → archived |
| `messageCount` | Denormalized counter (incremented when AIMessages are created) |

#### Phase 1 Scope Note
In Phase 1, this model creates the **persistence scaffolding** only. The existing @ai socket handler continues working unchanged. Phase 2 will wire the chatbot to store messages via these models.

---

### 4.8 AIMessage

**File:** [`server/models/AIMessage.js`](file:///p:/DAA%20OPTIONAL/server/models/AIMessage.js)

#### What Problem It Solves
Individual turns (messages) within an AIConversation. Stored separately from the conversation header to avoid BSON document size limits and enable efficient pagination.

#### Why Not Embed Messages in AIConversation?

If 100 messages were embedded in the conversation document:
- Document could exceed MongoDB's 16MB BSON limit
- Loading message history requires reading ALL messages (no pagination)
- Individual message operations (delete, flag) require updating a sub-array

#### Key Fields

| Field | Purpose |
|-------|---------|
| `conversationId` | Which conversation this turn belongs to |
| `projectId` | Denormalized for direct project-level message queries |
| `role` | user / assistant / system |
| `content` | The actual message text |
| `contextSnapshot` | WHAT project state was active when this message was processed (for audit/replay) |
| `toolAction` | If this AI response triggered an action (create task, propose decision) |
| `tokensUsed` | {prompt, completion, total} — for cost tracking |

---

### 4.9 Task (modified)

**File:** [`server/models/Task.js`](file:///p:/DAA%20OPTIONAL/server/models/Task.js)

#### What Changed

```js
// ADDED (optional, defaults to null)
projectId: { type: ObjectId, ref: "Project", default: null, index: true }

// ADDED (new compound indexes)
{ projectId: 1, priorityScore: -1 }   // Greedy sort by project
{ projectId: 1, topoOrder: 1 }        // Topo sort by project
```

#### What Did NOT Change

Everything else is 100% unchanged:
- `teamId` (still required, still the primary grouping key)
- `title`, `description`, `status`, `priority`, `effort`, `impact`, `assignedTo`, `tags`
- `dependencies` (still the topoSort DAG input)
- `topoOrder`, `priorityScore` (still computed by algorithms)
- The `pre('save')` hook that auto-computes `priorityScore`
- All existing indexes

#### Why Optional (Not Required)

Making `projectId` required would immediately break:
- Every existing task in the database (they have no projectId → validation fails)
- Every API call that creates tasks (they don't send projectId → request fails)
- Every socket handler that creates tasks (same issue)

The safe approach: `default: null`, validated optional. Legacy tasks continue working. New tasks created for a project get a projectId. The migration script backfills legacy tasks.

---

### 4.10 Team (modified)

**File:** [`server/models/Team.js`](file:///p:/DAA%20OPTIONAL/server/models/Team.js)

#### What Changed

```js
// ADDED (optional, defaults to null)
activeProjectId: { type: ObjectId, ref: "Project", default: null }
```

#### What Did NOT Change

Everything else is 100% unchanged:
- `projectTitle`, `projectDescription` — intentionally preserved as legacy fallback
- `members` (embedded MemberSchema)
- `settings`, `taskCount`, `doneCount`, `aiGeneratedTasks`
- All existing indexes

#### Why Keep `projectTitle` and `projectDescription`?

These fields are read by:
1. The existing project decomposer (`/api/teams/:id/generate-tasks`)
2. The AI orchestrator (`aiOrchestrator.js`)
3. The frontend dashboard

Removing them would require updating all three locations — that's Phase 2+ work, not Phase 1. They serve as the fallback description for teams that haven't created a formal Project yet.

---

## 5. Relationship Decisions: Embedded vs. Referenced

This section explains why some entities are embedded inside their parent and others live in separate collections.

| Entity | Location | Why |
|--------|----------|-----|
| `ProjectContext` | Embedded in `Project` | 1:1 relationship. Always read with Project. Needs atomic updates. No pagination needed. |
| `Decision` | Separate collection | Many per project (20-50+). Has independent lifecycle (proposed → superseded). Needs independent indexes. Will be cross-referenced by tasks. |
| `ResearchItem` | Separate collection | Many per project (50-100+). Future: vector embeddings make each item ~6KB — can't embed. Needs independent indexing by relevance, status. |
| `Recommendation` | Separate collection | Independent lifecycle. Linked to specific tasks. Multiple types. Future: quality tracking. |
| `ArchitectureComponent` | Separate collection | Each component has its own _id (needed for `dependsOn` references between components). Linked to tasks. |
| `Resource` | Separate collection | Polymorphic types. Independent status lifecycle. Cross-referenced by tasks. |
| `AIConversation` | Separate collection | Session header. Messages must be separate from it. |
| `AIMessage` | Separate collection | 1:many from AIConversation. Pagination required. Future: search across messages. |

---

## 6. Index Strategy

### Why Indexes Matter

Without indexes, every query does a **full collection scan** — reads every document to find matches. With 1,000 tasks across 50 teams, that's 1,000 reads for a 20-task result. With indexes, it's ~20 reads.

### New Indexes Added

| Collection | Index | Purpose |
|-----------|-------|---------|
| Project | `{ teamId: 1, createdAt: -1 }` | "All projects for team X, newest first" |
| Project | `{ teamId: 1, status: 1 }` | "All active projects for team X" |
| Task | `{ projectId: 1, priorityScore: -1 }` | Project-scoped Greedy sort |
| Task | `{ projectId: 1, topoOrder: 1 }` | Project-scoped Topo sort |
| Decision | `{ projectId: 1, createdAt: -1 }` | All decisions for project, newest first |
| Decision | `{ projectId: 1, status: 1 }` | Filter by decision status |
| ResearchItem | `{ projectId: 1, relevance: -1 }` | Most relevant research first |
| ResearchItem | `{ projectId: 1, status: 1 }` | Filter by reading status |
| Recommendation | `{ projectId: 1, createdAt: -1 }` | All recommendations for project |
| Recommendation | `{ projectId: 1, status: 1 }` | Filter pending recommendations |
| Recommendation | `{ projectId: 1, recommendationType: 1 }` | Filter by type (hardware, API, etc.) |
| AIConversation | `{ projectId: 1, createdAt: -1 }` | All conversations for project |
| AIMessage | `{ conversationId: 1, createdAt: 1 }` | Chronological message history |
| AIMessage | `{ projectId: 1, createdAt: 1 }` | Project-wide message search |

### Preserved Existing Indexes (Unchanged)

| Collection | Index | Used By |
|-----------|-------|---------|
| Task | `{ teamId: 1, priorityScore: -1 }` | Greedy algorithm |
| Task | `{ teamId: 1, topoOrder: 1 }` | Topo sort |
| Task | `{ teamId: 1 }` | All team task queries |

---

## 7. Backward Compatibility: What Did NOT Change

> [!IMPORTANT]
> Every item in this section is a guarantee. The existing system runs without modification.

### Models: No Breaking Changes
- ✅ `Task.teamId` — still required, still the primary task grouping key
- ✅ `Task.priorityScore` — still computed by pre-save hook
- ✅ `Task.topoOrder` — still set by Topo algorithm
- ✅ `Task.dependencies` — still the DAG input for Topo algorithm
- ✅ `Team.projectTitle` — still readable, still used by decomposer
- ✅ `Team.projectDescription` — still readable, still used by AI orchestrator
- ✅ `Team.members` — unchanged
- ✅ `Team.aiGeneratedTasks` — unchanged
- ✅ All existing indexes — unchanged

### Algorithms: No Changes
- ✅ `server/algorithms/greedy.js` — unchanged
- ✅ `server/algorithms/knapsack.js` — unchanged
- ✅ `server/algorithms/topoSort.js` — unchanged
- ✅ `server/algorithms/branchAndBound.js` — unchanged
- ✅ `server/algorithms/projectDecomposer.js` — unchanged

### Routes: No Changes
- ✅ `server/routes/teams.js` — unchanged (50+ endpoints, all preserved)
- New: `server/routes/projects.js` — additional routes, additive only

### Socket Handlers: No Changes
- ✅ `server/socket/taskHandlers.js` — unchanged
- ✅ `server/socket/aiOrchestrator.js` — unchanged

### Frontend: No Changes
- No frontend changes in Phase 1
- The project routes are available for Phase 2+ frontend work

---

## 8. How NEXUSFLOW 1.x Data Flow Changes in 2.0

### NEXUSFLOW 1.x Task Creation Flow
```
User types @ai generate tasks
    → aiOrchestrator.js reads Team.projectDescription
    → projectDecomposer generates task list
    → Tasks created with { teamId, title, priority... }
    → Socket broadcasts to client
```

### NEXUSFLOW 2.0 Task Creation Flow (Phase 1: Foundation)
```
User types @ai generate tasks
    → aiOrchestrator.js reads Team.projectDescription (unchanged)
    → projectDecomposer generates task list (unchanged)
    → Tasks created with { teamId, projectId (from team.activeProjectId), title, priority... }
    → Socket broadcasts to client (unchanged)
```

The only difference: tasks can now optionally include `projectId`. Everything else is identical.

In Phase 2+, the flow becomes:
```
User enters prompt → Project created → ProjectContext extracted by AI
    → Structured requirements → Recommendations proposed
    → Decisions made → Architecture defined
    → Tasks generated with full project context
    → Sprint Optimizer schedules tasks using projectId-scoped queries
```

---

## 9. The Pipeline: Idea to Tasks

This is the NEXUSFLOW 2.0 pipeline that Phase 1's data foundation enables:

```
Step 1: IDEA
  User enters: "Build an AI irrigation system using ESP32..."
  → Project document created
  → Project.originalPrompt = exact text
  → Project.status = "ideation"

Step 2: UNDERSTANDING (Phase 2+)
  AI extracts structured context from originalPrompt
  → ProjectContext populated:
    hardwareRequirements: ["ESP32", "Soil sensor"]
    aiMlRequirements: ["LSTM model"]
    integrations: ["OpenWeatherMap"]
  → Project.status = "planning"

Step 3: RESEARCH (Phase 2+)
  AI advisor suggests relevant papers, tools, APIs
  → ResearchItem[] created for each suggestion
  → Student reads and marks items as "applied"

Step 4: RECOMMENDATIONS (Phase 2+)
  Specialist AI advisors analyze ProjectContext
  → Recommendation[] created:
    { item: "TensorFlow Lite", reason: "ESP32 compatible edge ML" }
    { item: "MQTT.js", reason: "Lightweight IoT messaging" }

Step 5: DECISIONS (Phase 2+)
  Student reviews and accepts/rejects recommendations
  → Accepted recommendations → Decision documents
    { decision: "Use TFLite", status: "accepted" }

Step 6: ARCHITECTURE (Phase 2+)
  System generates architecture from accepted decisions
  → ArchitectureComponent[] created:
    { type: "hardware", name: "ESP32 Node" }
    { type: "backend", name: "Node.js API" }
    { type: "ai_ml", name: "TFLite Inference Engine" }

Step 7: TASKS (existing + enhanced)
  Tasks generated per component with projectId
  → All existing algorithms run unchanged
  → Greedy/Knapsack/B&B prioritize tasks
  → Topo sort respects dependencies
  → Tasks now have projectId for project-scoped views

Step 8: PROGRESS / LEARNING
  Team works through tasks
  → Project.taskCount / doneCount updated
  → Decision quality tracked (did accepted tech work?)
  → AI conversations stored for context continuity
```

---

## 10. New REST API Endpoints

All endpoints require authentication (JWT via `requireAuth` middleware).

### Project CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects?teamId=` | List projects for a team |
| POST | `/api/projects` | Create project (auto-sets Team.activeProjectId) |
| GET | `/api/projects/:id` | Get single project with embedded context |
| PATCH | `/api/projects/:id` | Update project fields |
| DELETE | `/api/projects/:id` | Delete project + sub-entities (tasks' projectId cleared, not deleted) |
| GET | `/api/projects/:id/summary` | Counts of all sub-entities for dashboard |

### Project Tasks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/tasks` | Project-scoped tasks, Greedy sorted |

### Project Context

| Method | Endpoint | Purpose |
|--------|----------|---------|
| PATCH | `/api/projects/:id/context` | Update embedded ProjectContext fields |

### Decisions

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/decisions` | List (filter ?status= ?category=) |
| POST | `/api/projects/:id/decisions` | Create |
| PATCH | `/api/projects/:id/decisions/:decisionId` | Update |
| DELETE | `/api/projects/:id/decisions/:decisionId` | Delete |

### Research Items

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/research` | List (filter ?status= ?source=) |
| POST | `/api/projects/:id/research` | Add item |
| PATCH | `/api/projects/:id/research/:itemId` | Update |
| DELETE | `/api/projects/:id/research/:itemId` | Delete |

### Recommendations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/recommendations` | List (filter ?status= ?recommendationType=) |
| POST | `/api/projects/:id/recommendations` | Add |
| PATCH | `/api/projects/:id/recommendations/:recId` | Update (accept/reject) |
| DELETE | `/api/projects/:id/recommendations/:recId` | Delete |

### Architecture Components

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/architecture` | List (filter ?componentType= ?status=) |
| POST | `/api/projects/:id/architecture` | Create component |
| PATCH | `/api/projects/:id/architecture/:compId` | Update |
| DELETE | `/api/projects/:id/architecture/:compId` | Delete |

### Resources

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/resources` | List (filter ?resourceType= ?status=) |
| POST | `/api/projects/:id/resources` | Add resource |
| PATCH | `/api/projects/:id/resources/:resourceId` | Update (mark obtained/integrated) |
| DELETE | `/api/projects/:id/resources/:resourceId` | Delete |

### AI Conversations & Messages

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/conversations` | List conversations |
| POST | `/api/projects/:id/conversations` | Start new conversation |
| GET | `/api/projects/:id/conversations/:convId/messages` | Get messages (paginated) |
| POST | `/api/projects/:id/conversations/:convId/messages` | Add message (user/assistant/system) |

---

*Document generated for NEXUSFLOW 2.0 — Phase 1: Database Architecture & Data Foundation*
