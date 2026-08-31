# NEXUSFLOW 2.0 — PHASE 4: TEAM-AWARE AI PROJECT ASSISTANT & COPILOT FOUNDATION

> **Audience:** Comprehensive architectural documentation and knowledge transfer.
> This document explains Phase 4: transforming task generation into a **Team-Aware AI Project Assistant**,
> integrating project-plan / missing-phase / subtasks modes, resolving the socket infinite-loading bug,
> and maintaining strict deterministic authority across all DAA algorithmic pipelines.

---

## Table of Contents
1. [Phase 4 Goal](#1-phase-4-goal)
2. [Problem in Previous Architecture](#2-problem-in-previous-architecture)
3. [Root Cause Analysis & Fix: Task Creation Infinite-Loading Bug](#3-root-cause-analysis--fix-task-creation-infinite-loading-bug)
4. [Before Phase 4 Architecture](#4-before-phase-4-architecture)
5. [After Phase 4 Architecture](#5-after-phase-4-architecture)
6. [Compact Project Context Builder Engine](#6-compact-project-context-builder-engine)
7. [Assistant Modes & Reasoning Capabilities](#7-assistant-modes--reasoning-capabilities)
   - [Mode 1: Related Tasks](#mode-1-related-tasks)
   - [Mode 2: Missing Phase Detection](#mode-2-missing-phase-detection)
   - [Mode 3: Task Breakdown (Subtasks)](#mode-3-task-breakdown-subtasks)
   - [Mode 4: Project Plan Generation (New)](#mode-4-project-plan-generation-new)
   - [Mode 5: Architecture & Research Modes](#mode-5-architecture--research-modes)
8. [Structured Output Contract & OpenAI Integration](#8-structured-output-contract--openai-integration)
9. [Deterministic DAA Algorithmic Authority](#9-deterministic-daa-algorithmic-authority)
   - [Greedy Priority Scoring](#greedy-priority-scoring)
   - [Boyer-Moore Duplicate Prevention](#boyer-moore-duplicate-prevention)
   - [Merge Sort Candidate Ranking](#merge-sort-candidate-ranking)
   - [Topological Sort & Dependency Reasoning](#topological-sort--dependency-reasoning)
10. [Client UI & UX Enhancements (AiTaskAssistant & TasksPanel)](#10-client-ui--ux-enhancements-aitaskassistant--taskspanel)
11. [Error Handling, Timeout Guards & Fallback Strategy](#11-error-handling-timeout-guards--fallback-strategy)
12. [Security, Scope Isolation & Data Safety](#12-security-scope-isolation--data-safety)
13. [Backward Compatibility & Non-Breaking Design](#13-backward-compatibility--non-breaking-design)
14. [Files Created](#14-files-created)
15. [Files Modified](#15-files-modified)
16. [Verification & Verification Results](#16-verification--verification-results)
17. [Phase 5 Boundary & Future Scope](#17-phase-5-boundary--future-scope)
18. [Key Engineering Takeaways](#18-key-engineering-takeaways)

---

## 1. Phase 4 Goal

While Phase 3 established server-side task decomposition for formal `Project` entities, students working in team workspaces frequently create individual tasks or seek project guidance on the fly from the **Create Task** modal.

**Phase 4 Core Objectives:**
1. **Transform AI Task Suggestion into an Intelligent Project Copilot:** Allow students to request domain-relevant tasks, identify unrepresented phases, break tasks down into subtasks, or generate an entire structured project blueprint (tech recommendations, research topics, risks, next steps).
2. **Fix the Task Creation Infinite-Loading Defect:** Eliminate the unhandled socket acknowledgment stall that permanently locked the UI in a loading state.
3. **Bridge Team Context with Zero Database Overhead:** Create a compact context builder that works instantly with standard `Team` and `Task` collections without requiring complex multi-model joins.
4. **Preserve Algorithmic Authority:** Maintain the strict separation of concerns where LLMs propose values and explain reasoning, while deterministic DAA algorithms (Greedy, TopoSort, Boyer-Moore, Merge Sort, Knapsack) evaluate, score, and sort.

---

## 2. Problem in Previous Architecture

Prior to Phase 4:
1. **The Infinite-Loading Trap:** When a student submitted a task form, if the client socket was disconnected or reconnecting, the `socket.emit("task:create", ...)` acknowledgment callback would never be invoked by Socket.IO. The client promise remained pending indefinitely, keeping `setBusy(true)` locked and freezing the modal.
2. **Generic, Context-Deaf Suggestions:** The existing `/ai-suggest` endpoint relied solely on hardcoded regex-based decompositions from `projectDecomposer.js` and did not utilize OpenAI or rich context. A team working on an IoT irrigation system would receive generic web development templates.
3. **Missing High-Level Planning View:** Students starting a project had no quick way to obtain technology stack recommendations, research spike suggestions, risk mitigations, and execution phases from within their task workspace.
4. **Weak Dependency Suggestions:** Subtask and related task suggestions provided minimal rationale regarding why a task belonged before or after other tasks in the Topological Sort graph.

---

## 3. Root Cause Analysis & Fix: Task Creation Infinite-Loading Bug

### The Defect Mechanism

In `client/hooks/useTeamTasks.ts`:
```typescript
// BEFORE:
const createTask = useCallback(
  (title: string, opts?: CreateOpts) =>
    new Promise<{ error?: string }>((resolve) => {
      const socket = getSocket(token);
      socket.emit("task:create", payload, (ack) => {
        resolve(ack?.ok ? {} : { error: ack?.error });
      });
    }),
  [teamId, token]
);
```

1. `getSocket(token)` returns a singleton Socket.IO instance.
2. If the connection drops or is in the middle of a transport reconnect, `socket.emit()` places the packet in a client-side buffer.
3. Because the packet has not reached the server, the server never returns an `ack`.
4. The client `Promise` never settles (`resolve` is never called).
5. In `TasksPanel.tsx`, `handleSubmit` awaits `createTask()`. Because the promise never settles, the `finally { setBusy(false); }` block is never reached, leaving the UI permanently frozen on "Creating...".

### The Fix

We wrap the socket emit inside `Promise.race()` with a 15-second timeout guard:

```typescript
// AFTER (Phase 4):
const createTask = useCallback(
  (title: string, opts?: CreateOpts) => {
    const socket = getSocket(token);

    const ackPromise = new Promise<{ error?: string }>((resolve) => {
      socket.emit("task:create", payload, (ack: { ok: boolean; task?: Task; error?: string }) =>
        resolve(ack?.ok ? {} : { error: ack?.error ?? "Failed to create task" })
      );
    });

    const timeoutPromise = new Promise<{ error?: string }>((resolve) =>
      setTimeout(() => resolve({ error: "Network timeout — check your connection and try again" }), 15_000)
    );

    return Promise.race([ackPromise, timeoutPromise]);
  },
  [teamId, token]
);
```

**Result:** If a network failure or dropped socket occurs, the timeout promise resolves after 15 seconds, returning a clear error toast to the user and immediately resetting the `busy` state.

---

## 4. Before Phase 4 Architecture

```
TasksPanel.tsx (Create Task Modal)
       │
       ▼
AiTaskAssistant.tsx (3 Static Modes: Related / Missing / Subtasks)
       │
       ▼ (REST POST /api/teams/:teamId/ai-suggest)
teams.js (Regex keyword matching only, NO OpenAI integration)
       │
       ▼
Static Seed List (Hardcoded categories & titles)
       │
       ▼
Form Autofill ──(Submit)──> useTeamTasks.ts (socket.emit with NO timeout guard)
                                 │
                         [Hang on Disconnect]
```

---

## 5. After Phase 4 Architecture

```
TasksPanel.tsx (Create Task Modal)
       │
       ▼
AiTaskAssistant.tsx (6 Modes: Related, Missing Phase, Subtasks, Project Plan, Architecture, Research)
       │
       ▼ (REST POST /api/teams/:teamId/ai-suggest)
teams.js ───► buildCompactProjectContext (Extracts domain, hardware/AI signals, existing tasks)
       │
       ├──► If OPENAI_API_KEY: Query gpt-4o-mini with structured JSON contract
       │
       └──► Fallback: Deterministic DAA Decomposer + Boyer-Moore + Merge Sort
       │
       ▼
Autofill Payload + Plan Breakdown + DAA Score Rationale
       │
       ▼ (Apply & Save)
useTeamTasks.ts (Promise.race 15s Timeout Guard)
       │
       ├──► Socket.IO "task:create"
       ▼
Task.pre('save') ──► computePriorityScore() [Greedy DAA] ──► TopoSort DAG Update
```

---

## 6. Compact Project Context Builder Engine

**File:** `server/utils/projectContextBuilder.js`

To avoid requiring an active `Project` entity for teams operating on legacy workspaces, Phase 4 introduced `buildCompactProjectContext(teamId)`.

### Capabilities:
- **Domain Signal Recognition:** Scans project title and description against regex classifiers for 10 core domains:
  - IoT / Hardware (`esp32`, `arduino`, `sensor`, `microcontroller`, `mqtt`)
  - AI / Machine Learning (`model`, `dataset`, `vision`, `nlp`, `prediction`)
  - Mobile (`react native`, `flutter`, `ios`, `android`)
  - Healthcare, FinTech, Blockchain, AgriTech, EdTech, E-Commerce, Social
- **Hardware & Realtime Need Detection:** Accurately flags `needsHardware`, `needsAiMl`, and `needsRealtime`.
- **Token Efficiency & Memory Safety:** Caches and limits the recent task slice to the last 20 tasks (`_id`, `title`, `category`, `status`), preventing prompt bloating and high API latencies.

```javascript
export async function buildCompactProjectContext(teamId) {
  const [team, allTasks] = await Promise.all([
    Team.findById(teamId).lean(),
    Task.find({ teamId })
      .select("_id title category status urgency impact estimatedHours businessValue dependencies")
      .lean(),
  ]);

  const domain = detectDomain(`${team.projectTitle} ${team.projectDescription}`);
  // ... builds compact token-efficient payload
  return { teamName: team.name, projectTitle, projectDescription, domain, needsHardware, needsAiMl, needsRealtime, existingTasks, categories, members, _rawTasks: allTasks };
}
```

---

## 7. Assistant Modes & Reasoning Capabilities

### Mode 1: Related Tasks
- **Goal:** Suggest a fresh, actionable task specific to the project that is not yet in the backlog.
- **Workflow:**
  1. AI analyzes domain and existing backlog.
  2. Proposes a high-impact engineering task.
  3. Validated via **Boyer-Moore pattern matching** against existing task titles to prevent duplicate proposals.
  4. Pre-fills form fields (Title, Description, Category, Estimated Hours, Business Value, Urgency, Impact).

### Mode 2: Missing Phase Detection
- **Goal:** Identify critical phases of the software/hardware lifecycle missing from the current task list.
- **Workflow:**
  1. Compares active task categories against standard phases (`Planning`, `Research`, `Hardware`, `Backend`, `AI / ML`, `Frontend`, `Integration`, `Testing`, `Deployment`, `Security`).
  2. Suggests the first critical task for the missing phase (e.g. "Build Automated End-to-End Test Suite" if Testing is omitted).
  3. Provides human-readable reasoning explaining why that phase is needed next.

### Mode 3: Task Breakdown (Subtasks)
- **Goal:** Decompose a complex parent task into 3–5 smaller, sequential steps.
- **Workflow:**
  1. User selects a parent task from the UI picker.
  2. AI generates sequential subtasks with dependency references.
  3. Topological sort places child tasks after the parent in execution order.

### Mode 4: Project Plan Generation (New)
- **Goal:** Provide an end-to-end technical blueprint for students starting a project or hackathon.
- **Payload Returned:**
  - **Summary & Core Goal:** Clear articulation of the system scope.
  - **Tech Stack Recommendations:** Categorized guidance for Frontend, Backend, Database, AI/ML, Hardware, APIs, and Tools.
  - **Research Topics:** Specific investigation spikes with reasons why they matter.
  - **Risks & Mitigations:** Proactive architectural risk identification.
  - **Next Steps:** Prioritized immediate milestones.
  - **Effort & Missing Phases:** Estimated team timeline and detected roadmap gaps.

### Mode 5: Architecture & Research Modes
- Provides quick suggestions tailored specifically for system design tiers and technical spike investigations.

---

## 8. Structured Output Contract & OpenAI Integration

When `OPENAI_API_KEY` is configured in the environment, `callOpenAiStructured()` sends requests to OpenAI with `response_format: { type: "json_object" }` using `gpt-4o-mini`.

### JSON Contract (Project Plan Mode Example):
```json
{
  "plan": {
    "summary": "Smart agriculture telemetry platform monitoring soil moisture and automated irrigation.",
    "domain": "IoT / AgriTech",
    "coreGoal": "Automate soil telemetry ingestion and valve actuation via ESP32 microcontrollers.",
    "technicalAreas": ["Hardware", "Backend", "AI / ML", "Frontend"],
    "recommendations": {
      "frontend": ["React Native for field mobile monitoring"],
      "backend": ["Node.js + Express with MQTT broker integration"],
      "database": ["MongoDB for time-series sensor document storage"],
      "hardware": ["ESP32 with capacitive soil moisture sensors"]
    },
    "researchTopics": [
      { "topic": "Capacitive vs Resistive sensor longevity", "why": "Prevents corrosion in high-moisture environments" }
    ],
    "risks": [
      { "risk": "Wi-Fi packet loss in rural fields", "mitigation": "Buffer readings on SD card locally before batch sync" }
    ],
    "nextSteps": [
      "Flash ESP32 firmware with MQTT client",
      "Set up Express sensor ingestion endpoint"
    ],
    "estimatedEffort": "3–4 weeks for a 2-person team",
    "missingPhases": ["Testing", "Deployment"]
  },
  "task": {
    "title": "Configure ESP32 MQTT Telemetry Gateway",
    "description": "Wire soil moisture sensors and configure MQTT publish intervals.",
    "category": "Hardware",
    "urgency": 5,
    "impact": 5,
    "estimatedHours": 6,
    "businessValue": 10,
    "reason": "Hardware telemetry layer is the foundation for all downstream data pipelines.",
    "dependsOn": []
  }
}
```

---

## 9. Deterministic DAA Algorithmic Authority

A core architectural principle of NEXUSFLOW is that **LLMs never replace deterministic algorithms**.

$$\text{LLM Suggestion (Urgency, Impact, Effort)} \longrightarrow \text{Task.pre('save')} \longrightarrow \text{computePriorityScore()} \longrightarrow \text{Topological Sort / Knapsack}$$

### Greedy Priority Scoring
- When the AI suggests a task, it proposes raw parameters: $\text{urgency} \in [1,5]$, $\text{impact} \in [1,5]$, $\text{dependencyCount} \ge 0$.
- The priority score is **strictly calculated** by `computePriorityScore` in `greedyScheduler.js`:
$$\text{PriorityScore} = \text{round}\left(0.45 \cdot (\text{urgency} \cdot 20) + 0.40 \cdot (\text{impact} \cdot 20) + 0.15 \cdot \max(0, 100 - 15 \cdot \text{dependencyCount})\right)$$

### Boyer-Moore Duplicate Prevention
- AI candidate titles are tested against the entire active backlog using `boyerMooreSearch` (`server/algorithms/taskOptimiser.js`).
- If an exact or substring match is found, the duplicate candidate is rejected and a fresh heuristic seed is selected instead.

### Merge Sort Candidate Ranking
- Candidate tasks in fallback heuristic mode are sorted using `mergeSort` (`server/algorithms/taskOptimiser.js`) based on their computed priority scores ($O(n \log n)$).

### Topological Sort & Dependency Reasoning
- Parent-child subtask relationships are wired into `dependencies`.
- Kahn's algorithm (`topologicalSort` in `graphTraversal.js`) recomputes `topoOrder` for the dependency DAG ($O(V + E)$).

---

## 10. Client UI & UX Enhancements (AiTaskAssistant & TasksPanel)

### AiTaskAssistant.tsx
- **Mode Bar:** Clean selector for Related, Missing Phase, Subtasks, Project Plan, Architecture, and Research.
- **Dynamic Hints:** Live guidance explaining the heuristic and domain context evaluated by each mode.
- **Rich Explanation Card:**
  - Context badges showing active Project Title and Domain.
  - Keyword chips.
  - Live DAA stats: Greedy Priority Score, Business Value ($/20$), Effort ($h$).
  - Dependency placement reasoning.
- **Project Plan Card:**
  - Collapsible summary and core goal.
  - Grouped tech stack recommendations.
  - Structured research items.
  - Highlighted risks and mitigations.
  - Actionable next steps list with time estimates.

---

## 11. Error Handling, Timeout Guards & Fallback Strategy

| Layer | Failure Scenario | Fallback Mechanism |
| :--- | :--- | :--- |
| **Client Socket** | Network disconnected during task creation | 15-second `Promise.race()` timeout resolves with user error; resets `setBusy(false)`. |
| **OpenAI API** | Missing `OPENAI_API_KEY` | Seamlessly executes `decomposeProject()` + `SUBTASKS` deterministic seed generator. |
| **OpenAI API** | Rate limit, 500 error, or timeout ($>20\text{s}$) | `AbortController` triggers; catches exception and falls back to deterministic heuristic output. |
| **Boyer-Moore** | AI generates duplicate of existing task | Detects match; falls back to highest-priority unassigned backlog seed. |

---

## 12. Security, Scope Isolation & Data Safety

1. **Authentication Required:** `POST /api/teams/:teamId/ai-suggest` enforces `requireAuth` middleware.
2. **Team Scope Enforcement:** Context construction is strictly scoped by `teamId`. Tasks from other teams are never accessed or leaked into LLM prompts.
3. **No Unintended Persistence:** `/ai-suggest` is a read-only suggestion endpoint. It never mutates MongoDB. The user retains full control to edit fields before saving.

---

## 13. Backward Compatibility & Non-Breaking Design

- **Migration-Free:** Utilizes existing `Team` and `Task` fields without requiring schema modifications.
- **Works Without Phase 1 `Project` Docs:** Legacy teams without a `projectId` continue to function seamlessly via `buildCompactProjectContext`.
- **Pure Additive Changes:** The manual task creation flow and existing DAA tabs (Sprint Knapsack, Dependency Graph, Analytics, Members) remain 100% operational.

---

## 14. Files Created

| File | Purpose |
| :--- | :--- |
| [`server/utils/projectContextBuilder.js`](file:///p:/DAA%20OPTIONAL/server/utils/projectContextBuilder.js) | Lightweight, token-efficient team context builder for AI suggestion endpoints. |
| [`PHASE_4_AI_PROJECT_ASSISTANT.md`](file:///p:/DAA%20OPTIONAL/PHASE_4_AI_PROJECT_ASSISTANT.md) | Comprehensive technical documentation and knowledge transfer record for Phase 4. |

---

## 15. Files Modified

| File | Changes Made |
| :--- | :--- |
| [`client/hooks/useTeamTasks.ts`](file:///p:/DAA%20OPTIONAL/client/hooks/useTeamTasks.ts) | Fixed infinite-loading bug with 15s `Promise.race()` timeout guard in `createTask()`. Extended `aiSuggest()` to return `plan` and rich explanation properties. |
| [`server/routes/teams.js`](file:///p:/DAA%20OPTIONAL/server/routes/teams.js) | Overhauled `POST /teams/:teamId/ai-suggest` to support `project-plan` mode, OpenAI `gpt-4o-mini` structured output, domain-aware prompts, and timeout-protected execution. |
| [`client/components/AiTaskAssistant.tsx`](file:///p:/DAA%20OPTIONAL/client/components/AiTaskAssistant.tsx) | Added Project Plan mode, dynamic mode hints, structured plan view rendering, context badges, and fixed theme token references (`warningSoft`). |

---

## 16. Verification & Verification Results

### Automated & Syntax Verification:
- `server/routes/teams.js` verified via Node.js ESM import: **PASSED (Exit 0)**
- `server/utils/projectContextBuilder.js` verified via Node.js ESM import: **PASSED (Exit 0)**
- Client TypeScript types and token alignments checked: **PASSED**

### Functional Verifications:
1. **Infinite Loading Resolution:** Triggering task creation with simulated socket latency or disconnection cleanly times out after 15 seconds without freezing the UI.
2. **AI Suggestion Modes:** All 6 modes (`related`, `missing-phase`, `subtasks`, `project-plan`, `architecture`, `research`) return valid task structures and rich explanations.
3. **Plan View Display:** Project Plan mode outputs structured tech stacks, research topics, risks, and next steps inside `AiTaskAssistant.tsx`.
4. **DAA Pipeline Integrity:** Pre-filled tasks automatically calculate valid Greedy priority scores and integrate cleanly with Kahn's Topological Sort.

---

## 17. Phase 5 Boundary & Future Scope

The following items are intentionally reserved for **Phase 5 (Decision & Recommendation Engine)** and were not touched in Phase 4:
- Automated decision trade-off analysis engine
- Automatic recommendation application to live architecture graphs
- Interactive decision matrix voting across team members
- Persistent AI conversation threading inside task cards

---

## 18. Key Engineering Takeaways

1. **Defensive Async Socket Handling:** Never assume a socket `ack` callback will execute. In distributed and mobile-friendly applications, always race remote acknowledgments against an explicit client-side timeout.
2. **AI Proposes, Algorithms Decide:** Keep LLMs in the role of assistants and drafters. Core scoring, scheduling, sorting, and cycle detection must remain deterministic and auditable.
3. **Compact Context Over Heavy Queries:** Tailor context builders to the specific endpoint. A lean, specialized context builder is faster, cheaper, and less prone to prompt drift than overloading a monolithic service.
