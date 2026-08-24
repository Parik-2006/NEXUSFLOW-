# NEXUSFLOW 2.0 — PHASE 2: PROJECT INTELLIGENCE & AI PROJECT ADVISOR

> **Audience:** This document is designed for in-depth architectural study and knowledge transfer.
> It explains the conceptual paradigm shift, data pipelines, schema persistence, prompt engineering,
> duplicate prevention mechanisms, DAA algorithm co-existence, and API contracts implemented in Phase 2.

---

## Table of Contents
1. [Phase 2 Goal](#1-phase-2-goal)
2. [What Project Intelligence Means](#2-what-project-intelligence-means)
3. [Before Phase 2 Architecture (NEXUSFLOW 1.x)](#3-before-phase-2-architecture)
4. [After Phase 2 Architecture (NEXUSFLOW 2.0)](#4-after-phase-2-architecture)
5. [AI Context Pipeline](#5-ai-context-pipeline)
6. [Project Context Construction](#6-project-context-construction)
7. [AI Prompt Construction](#7-ai-prompt-construction)
8. [Structured AI Output](#8-structured-ai-output)
9. [Recommendation Flow](#9-recommendation-flow)
10. [Decision Flow](#10-decision-flow)
11. [Research Flow](#11-research-flow)
12. [Architecture Flow](#12-architecture-flow)
13. [AI Conversation Flow](#13-ai-conversation-flow)
14. [Database Persistence Flow](#14-database-persistence-flow)
15. [API Flow](#15-api-flow)
16. [Frontend Flow](#16-frontend-flow)
17. [Authentication & Authorization](#17-authentication--authorization)
18. [Duplicate Prevention](#18-duplicate-prevention)
19. [Error Handling & Fallback Strategy](#19-error-handling--fallback-strategy)
20. [Existing DAA Integration](#20-existing-daa-integration)
21. [Files Created](#21-files-created)
22. [Files Modified](#22-files-modified)
23. [APIs Created & Modified](#23-apis-created--modified)
24. [Verification & Test Results](#24-verification--test-results)
25. [Known Risks & Mitigations](#25-known-risks--mitigations)
26. [What Belongs to Phase 3+](#26-what-belongs-to-phase-3)
27. [Key Concepts to Learn](#27-key-concepts-to-learn)

---

## 1. Phase 2 Goal

In NEXUSFLOW 1.x, the relationship between the user and the AI was purely transactional:
$$\text{User Project Description} \longrightarrow \text{AI Task Decomposition} \longrightarrow \text{Flat Task Backlog}$$

This had major limitations:
- The AI had **no memory** of why tasks were created.
- The AI was **context-blind** (treating IoT projects the same as web apps).
- The system could not recommend technologies, suggest architectural components, track technical decisions, or guide research directions.

**Phase 2 Goal:**
Transform NEXUSFLOW into a **Project-Aware Intelligent Advisor**:
$$\text{User Idea / Prompt} \longrightarrow \text{Project Intelligence Engine} \longrightarrow \begin{cases} \text{Structured Project Understanding} \\ \text{Domain-Specific Recommendations} \\ \text{Candidate Architectural Decisions} \\ \text{Component Architecture Model} \\ \text{Feasibility Research Topics} \\ \text{Project-Scoped Copilot Advisory} \end{cases}$$

---

## 2. What Project Intelligence Means

Project Intelligence is the system's ability to maintain a **living, structured semantic model** of the project being built.

Instead of treating the project as two isolated text strings (`projectTitle`, `projectDescription`), Project Intelligence understands:
- **Domain & Classification:** Is this IoT, Robotics, FinTech, Machine Learning, or Web SaaS?
- **Core Problem Statement & Target Audience:** Who uses it and what exact friction is being solved?
- **Multi-Tier Constraints:** Microcontroller memory limits, battery capacity, cloud latency, or budget.
- **Hardware vs. Software vs. AI Requirements:** ESP32 sensors, Node.js gateways, PyTorch models, or third-party APIs.
- **State of Decisions:** What technologies have been confirmed versus what is still under evaluation.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PROJECT INTELLIGENCE                            │
├────────────────────────────────┬───────────────────────────────────────┤
│ Grounded Facts (User/Team)     │ AI Suggestions (Pending Confirmation) │
├────────────────────────────────┼───────────────────────────────────────┤
│ • Original Prompt / Title      │ • Technology Recommendations          │
│ • Team Members & Skill Matrix  │ • Candidate Decisions                 │
│ • Accepted Decisions           │ • Proposed Component Architecture     │
│ • Active Backlog Tasks         │ • Recommended Research Topics         │
│ • Defined Budget / Constraints │ • Contextual Chat Advice              │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 3. Before Phase 2 Architecture

```
User types "@ai generate tasks"
               │
               ▼
   socket/aiOrchestrator.js
               │
               ▼
   Reads Team.projectDescription (String)
               │
               ▼
   OpenAI / projectDecomposer.js (Deterministic regex)
               │
               ▼
   Creates Tasks directly in MongoDB (Flat list with teamId)
               │
               ▼
   Runs Greedy / Knapsack / Topo algorithms
```
*Limitations:* Zero context persistence, ephemeral chat, no architectural model, no decision tracking.

---

## 4. After Phase 2 Architecture

```
                          ┌───────────────────────────┐
                          │   USER PROJECT PROMPT     │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │  Project Context Builder  │
                          │(Project, Team, Decisions, │
                          │ Architecture, Backlog)    │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │ AI Project Analyzer       │
                          │ (OpenAI gpt-4o-mini       │
                          │  + Heuristic Fallback)    │
                          └─────────────┬─────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  ▼                     ▼                     ▼
     ┌───────────────────────┐ ┌────────────────┐ ┌───────────────────────┐
     │   Recommendations     │ │   Decisions    │ │ Architecture / Topics │
     │  (status: "pending")  │ │(status:"prop") │ │ (Component DAG / Res) │
     └────────────┬──────────┘ └────────┬───────┘ └───────────┬───────────┘
                  │                     │                     │
                  └─────────────────────┼─────────────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │ Duplicate-Safe Persistor  │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │   MongoDB Phase 1 Models  │
                          │ (Project, Decision, etc.) │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │ Project-Aware Copilot Chat│
                          │ (Multi-turn Context-Aware)│
                          └───────────────────────────┘
```

---

## 5. AI Context Pipeline

The pipeline follows a strict unidirectional data flow:

```
[REST / Socket Trigger]
         │
         ▼
[buildProjectContext(projectId)]
   ├── Loads Project (Title, Prompt, Context)
   ├── Loads Team (Roster, Skills)
   ├── Loads Accepted Decisions (Filters out rejected/superseded)
   ├── Loads Architecture Components
   └── Loads Backlog Stats (Done, In-Progress, Todo)
         │
         ▼
[Project Context Payload]
         │
         ▼
[AI Analyzer (System + User Prompt)] ──(Failure)──► [Heuristic Fallback Engine]
         │                                                      │
         ├──────────────────────◄───────────────────────────────┘
         ▼
[validateAnalyzerOutput(rawJSON)]
         │
         ▼
[persistAnalysisResults(projectId, validatedData)]
   ├── Updates Project.context
   ├── Inserts new Recommendations (Deduplicated)
   ├── Inserts new Candidate Decisions (status: "proposed")
   ├── Inserts Research Topics (Deduplicated)
   └── Inserts Architecture Components & Wires Dependencies
         │
         ▼
[Client Response / UI Update]
```

---

## 6. Project Context Construction

The `buildProjectContext(projectId)` function in [`server/services/projectIntelligence.js`](file:///p:/DAA%20OPTIONAL/server/services/projectIntelligence.js) gathers facts across collections into a unified object:

```javascript
{
  projectId: "66ca12...",
  teamId: "66ca10...",
  teamName: "AgriTech Innovators",
  teamMembers: [
    { name: "Alice", role: "Hardware Lead", skills: { frontend: 4, backend: 8, devops: 6, ml: 9 } }
  ],
  title: "AI Smart Irrigation System",
  domain: "Internet of Things (IoT)",
  projectType: "Smart Agriculture",
  currentPhase: "understanding",
  context: {
    problemStatement: "Excessive water wastage due to uncalibrated timer-based watering.",
    targetUsers: ["Small-scale Farmers", "Commercial Greenhouses"],
    hardwareRequirements: ["ESP32", "Capacitive Moisture Sensor", "12V Solenoid Valve"],
    softwareRequirements: ["Node.js Express API", "React Native App"],
    aiMlRequirements: ["LSTM Evapotranspiration Predictor"]
  },
  acceptedDecisions: [
    { title: "Database Choice", decision: "Use MongoDB", reasoning: "Dynamic time-series schema" }
  ],
  architectureComponents: [
    { type: "hardware", name: "ESP32 Sensor Node", technology: "C++ / FreeRTOS" }
  ],
  taskStats: { total: 24, done: 6, inProgress: 4, sampleTitles: [...] }
}
```

---

## 7. AI Prompt Construction

The prompt establishes an authoritative role:

- **Role:** Principal Software Architect and Project Intelligence Advisor in NEXUSFLOW 2.0.
- **Constraints Injected:**
  - Strict JSON-only response mode (`response_format: { type: "json_object" }`).
  - No generic or unrelated technologies (e.g. no Stripe/e-commerce checkout for an agricultural IoT or robotics project).
  - Ground all hardware, software, and AI recommendations strictly in the extracted domain.
  - Never fabricate paper URLs or citations.

---

## 8. Structured AI Output

The output is validated against 21 distinct fields before writing to MongoDB:

```json
{
  "projectSummary": "IoT-enabled precision irrigation platform utilizing capacitive soil sensors and edge machine learning.",
  "problemStatement": "Farmers experience significant crop yield losses and water waste due to lack of predictive soil moisture telemetry.",
  "targetUsers": ["Smallholder Farmers", "Agronomists"],
  "domain": "Internet of Things (IoT)",
  "projectType": "Smart Agriculture",
  "goals": ["Automate valve actuation based on moisture thresholds", "Provide mobile telemetry dashboard"],
  "constraints": ["ESP32 memory constraints", "2.4GHz Wi-Fi field range"],
  "expectedOutputs": ["ESP32 Firmware", "Node.js REST Gateway", "React Native Dashboard"],
  "hardwareRequirements": ["ESP32 Dev Module", "Capacitive Soil Moisture Sensor v1.2", "5V Relay"],
  "softwareRequirements": ["Node.js", "Express", "React Native", "Socket.io"],
  "aiMlRequirements": ["Time-Series Moisture Depletion Model (TensorFlow Lite)"],
  "integrations": ["OpenWeatherMap API"],
  "deploymentRequirements": ["Render", "MongoDB Atlas"],
  "securityConsiderations": ["JWT Auth", "Environment secret management"],
  "preferredStack": ["Node.js", "React Native", "MongoDB", "ESP32 C++"],
  "assumptions": ["Stable 5V DC power source available at sensor node"],
  "recommendations": [ ... ],
  "decisionCandidates": [ ... ],
  "researchTopics": [ ... ],
  "architectureComponents": [ ... ],
  "risks": [ ... ]
}
```

---

## 9. Recommendation Flow

1. AI produces recommendation objects with `recommendationType`, `recommendedItem`, `category`, `reason`, `confidence`, and `alternatives`.
2. Persistor checks if a recommendation with the same type and item name already exists in this project.
3. If new, it is saved with `status: "pending"`.
4. The user can review the recommendation in the **Project AI** tab and click **Accept** or **Reject**.
5. Accepting a recommendation triggers `PATCH /api/projects/:projectId/recommendations/:recId` setting `status: "accepted"`.

---

## 10. Decision Flow

1. AI identifies key architectural questions and proposes candidate solutions (e.g. "MQTT vs HTTP REST for Telemetry").
2. The decision is saved to `Decision` collection with `status: "proposed"`.
3. **CRITICAL ARCHITECTURAL RULE:** The AI is **never** permitted to mark a decision as `accepted`.
4. Only the student/team can confirm a decision.
5. Once confirmed by the user, the decision status transitions to `accepted`.
6. Future AI context runs will load this confirmed decision as an immutable ground fact.

---

## 11. Research Flow

1. AI suggests focused technical topics (e.g., "Capacitive sensor calibration curves under varying salinity").
2. Stored in `ResearchItem` collection with `source: "documentation"` and `status: "found"`.
3. **Integrity Rule:** The system does NOT generate fake DOI URLs or hallucinated academic authors.
4. Students can record their own study notes on the topic directly in the database.

---

## 12. Architecture Flow

1. AI generates structured component definitions (`hardware`, `backend`, `database`, `frontend`, `ai_ml`).
2. Components define high-level system tiers (e.g., "ESP32 Sensor Node" $\longrightarrow$ "IoT Telemetry Gateway" $\longrightarrow$ "Document Database").
3. Persistor creates `ArchitectureComponent` documents and wires `dependsOn` ObjectIds based on the generated dependency indices.
4. **Distinction:** This is the **System Architecture Graph**, distinct from the **Task Execution DAG** managed by Topological Sort.

---

## 13. AI Conversation Flow

1. Student opens the **Project Copilot** tab and asks a question (e.g., *"What microcontroller should I choose and why?"*).
2. Client sends `POST /api/projects/:projectId/ai/chat`.
3. Server loads current project facts, accepted decisions, and the last 10 turns of message history.
4. Prompt injected with project context answers specifically for THIS project.
5. User turn is saved to `AIMessage` (`role: "user"`).
6. Assistant reply is saved to `AIMessage` (`role: "assistant"`).
7. `AIConversation.messageCount` is atomically incremented.

---

## 14. Database Persistence Flow

```
┌─────────────────────────────────────────────────────────────┐
│                 persistAnalysisResults()                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
Project.context         Recommendation             Decision
(Atomic $set of        (Dedup by Type+Item,   (Dedup by Title,
 structured fields)      status: "pending")    status: "proposed")
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
  ResearchItem                               ArchitectureComponent
(Dedup by Title,                           (Dedup by Type+Name,
 status: "found")                           wires dependsOn ObjectIds)
```

---

## 15. API Flow

```
Frontend (React Native / Web)
      │
      ├── POST /api/projects/:id/analyze ──────► Express router ──► analyzeProject()
      │                                                                  │
      │                                                                  ▼
      │                                                         OpenAI / Heuristic
      │                                                                  │
      │                                                                  ▼
      │                                                       persistAnalysisResults()
      │
      ├── GET  /api/projects/:id/intelligence ─► Express router ──► buildProjectContext()
      │
      └── POST /api/projects/:id/ai/chat ──────► Express router ──► chatWithProjectAdvisor()
                                                                         │
                                                                         ▼
                                                                AIConversation / AIMessage
```

---

## 16. Frontend Flow

The frontend integrates Phase 2 through [`ProjectAdvisorPanel.tsx`](file:///p:/DAA%20OPTIONAL/client/components/workspace/ProjectAdvisorPanel.tsx):
- **Workspace Navigation:** New `Project AI` tab (`advisor`) with spark icon.
- **Top Summary Card:** Project domain, lifecycle phase, and quick hardware/software/AI matrix.
- **Action Triggers:** "Analyze AI" button with loading spinners.
- **Interactive Sub-tabs:**
  - **Advisor & Chat:** Multi-turn Copilot with quick starter prompts.
  - **Recommendations:** Filterable cards with "Accept" / "Reject" actions.
  - **Decisions:** Architectural choices board with "Confirm Decision" action.
  - **Architecture:** System components view with technology pills.
  - **Research:** Technical investigation topics list.

---

## 17. Authentication & Authorization

All Project Intelligence endpoints enforce JWT verification via `requireAuth`:
- `req.user` decoded from Bearer token.
- `findProject(projectId, res, req.user)` validates that:
  1. `projectId` is a valid MongoDB ObjectId.
  2. The `Project` document exists.
  3. The requesting user belongs to the project's owning `Team` (or has authorized workspace access).
  4. Cross-project data leakage is blocked (403 Forbidden for unauthorized requests).

---

## 18. Duplicate Prevention

When a user clicks "Analyze AI" multiple times:
- **Recommendations:** Deduplicated by composite key `recommendationType.toLowerCase() + "::" + recommendedItem.toLowerCase().trim()`.
- **Decisions:** Deduplicated by `title.toLowerCase().trim()`.
- **Research Items:** Deduplicated by `title.toLowerCase().trim()`.
- **Architecture Components:** Deduplicated by `componentType.toLowerCase() + "::" + name.toLowerCase().trim()`.

Re-running analysis refreshes context without creating duplicate cards.

---

## 19. Error Handling & Fallback Strategy

- **OpenAI Unreachable / Key Missing:**
  - Automatically activates `generateHeuristicAnalysis(context)`.
  - Inferred domain signals (IoT, AI, Mobile, Web) generate grounded recommendations deterministically.
  - Clearly tags records with `source: "heuristic"` or `source: "system"`.
  - Database is never left in a corrupted or half-written state.
- **Malformed JSON from AI:**
  - `validateAnalyzerOutput()` sanitizes and fills missing default fields.
  - Rejects non-object payloads cleanly before database execution.

---

## 20. Existing DAA Integration

Phase 2 preserves 100% of existing algorithms:
- **Greedy Priority Scheduler:** Continues computing `priorityScore` via Task pre-save hook.
- **0/1 Knapsack Sprint Optimizer:** Operates on `estimatedHours` and `businessValue`.
- **Topological Sort:** Operates on `Task.dependencies` DAG.
- **Branch & Bound Assignment:** Matches `Task.skillWeights` against `Team.members.skills`.
- **Boyer-Moore-Horspool:** Runs fast substring search on task titles.

---

## 21. Files Created

| File | Purpose |
|---|---|
| [`server/services/projectIntelligence.js`](file:///p:/DAA%20OPTIONAL/server/services/projectIntelligence.js) | Central Project Intelligence service (Context building, OpenAI Analyzer, Heuristic fallback, Duplicate-safe persistence, Copilot Chat). |
| [`server/scripts/testPhase2ProjectIntelligence.js`](file:///p:/DAA%20OPTIONAL/server/scripts/testPhase2ProjectIntelligence.js) | Comprehensive 14-point test suite for static validation and live MongoDB integration. |
| [`client/components/workspace/ProjectAdvisorPanel.tsx`](file:///p:/DAA%20OPTIONAL/client/components/workspace/ProjectAdvisorPanel.tsx) | React Native/Expo frontend interface for Project Intelligence, AI Advisor, Decisions, and Copilot Chat. |
| [`PHASE_2_PROJECT_INTELLIGENCE.md`](file:///p:/DAA%20OPTIONAL/PHASE_2_PROJECT_INTELLIGENCE.md) | This comprehensive architectural education document. |

---

## 22. Files Modified

| File | Modifications |
|---|---|
| [`server/routes/projects.js`](file:///p:/DAA%20OPTIONAL/server/routes/projects.js) | Added `POST /projects/:id/analyze`, `GET /projects/:id/intelligence`, `POST /projects/:id/ai/chat`, and enhanced team authorization check in `findProject`. |
| [`client/app/team/[teamId].tsx`](file:///p:/DAA%20OPTIONAL/client/app/team/%5BteamId%5D.tsx) | Integrated `ProjectAdvisorPanel` into workspace tab navigation under the `advisor` ("Project AI") tab. |

---

## 23. APIs Created & Modified

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/projects/:projectId/analyze` | POST | `requireAuth` | Runs OpenAI/heuristic project intelligence analysis and updates context/recommendations/decisions. |
| `/api/projects/:projectId/intelligence` | GET | `requireAuth` | Returns full aggregated project intelligence snapshot. |
| `/api/projects/:projectId/ai/chat` | POST | `requireAuth` | Project-scoped conversational AI copilot with message history persistence. |
| `/api/projects/:projectId/recommendations/:id` | PATCH | `requireAuth` | Updates recommendation status (`accepted` / `rejected`). |
| `/api/projects/:projectId/decisions/:id` | PATCH | `requireAuth` | Updates decision status (`accepted` / `rejected`). |

---

## 24. Verification & Test Results

### Phase 1 Regression Test
Command: `node server/scripts/testPhase1DataFoundation.js`
- **Result:** **29 Passed, 0 Failed.**

### Phase 2 Test Suite
Command: `node server/scripts/testPhase2ProjectIntelligence.js`
- **Result:** **14 Passed, 0 Failed.**

```
[ 1. Structured AI Output Validation ]
  ✓ Structured output validator accepts complete valid payload
  ✓ Structured output validator sanitizes and normalizes partial payload safely
  ✓ Invalid non-object payload is rejected by validator

[ 2. Deterministic Heuristic Engine ]
  ✓ Heuristic analyzer correctly infers IoT & ML domains and components

[ 3. Existing DAA Priority & Task System Integrity ]
  ✓ computePriorityScore computes predictable priority scores

[ 4. Live MongoDB Project Intelligence Tests ]
  ✓ Task priorityScore pre-save hook works on task instances
  ✓ Connect to MongoDB for Phase 2 Integration Tests
  ✓ Setup Test Team, Member, and Project
  ✓ buildProjectContext aggregates all project artifacts
  ✓ analyzeProject runs and persists structured intelligence with fallback support
  ✓ Duplicate recommendations, decisions, and components are prevented on re-analysis
  ✓ Decisions remain in proposed state (AI does not auto-accept)
  ✓ chatWithProjectAdvisor generates project-scoped advisory response and persists turn
  ✓ Cleanup Phase 2 integration test artifacts
```

### Syntax Validation
Command: `node --check` across all server files
- **Result:** All files validated with exit code 0.

---

## 25. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OpenAI rate limits or token exhaustion | Heuristic fallback engine activates automatically; non-blocking error responses prevent UI freezes. |
| AI hallucinating unneeded dependencies (e.g. Stripe on IoT) | System prompt strictly penalizes irrelevant domains; structured schema enforces domain relevance. |
| Re-running analysis overwriting student decisions | Status checks ensure `accepted` decisions are never overwritten or reset to `proposed`. |
| Unbounded chat message growth | AIMessages query limits recent context window to last 10 turns. |

---

## 26. What Belongs to Phase 3+

The following capabilities are deliberately reserved for subsequent phases:
- **Phase 3:** AI-Enhanced Task Decomposition with Project Context Injection.
- **Phase 4:** Retrieval-Augmented Generation (RAG), Vector Embeddings (`embeddingVector`), and Document Ingestion.
- **Phase 5:** Knowledge Graph Representation of Component & Decision dependencies.
- **Phase 6:** Autonomous Multi-Agent Execution & Tool Calling.

---

## 27. Key Concepts to Learn

1. **Context Ingestion vs. Fine-Tuning:**
   Instead of retraining the model, we construct dynamic, accurate prompt context containing confirmed project facts and decisions.
2. **Deterministic Fallbacks in Production AI:**
   Always provide a rule-based or heuristic pipeline so the software continues functioning even if third-party LLM APIs suffer outages.
3. **Structured Response Contracts:**
   Using JSON schema validation prevents unpredictable free-form text from corrupting database operations.
4. **Separation of Concerns between DAGs:**
   The **System Architecture Graph** (how components interact) is distinct from the **Project Task DAG** (the topological sequence of engineering work).

---

*NEXUSFLOW 2.0 — Phase 2: Project Intelligence & AI Project Advisor*
