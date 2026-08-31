# NEXUSFLOW 2.0 — PHASE 5: DECISION & RECOMMENDATION ENGINE

> **Audience:** Comprehensive architectural documentation and knowledge transfer.
> This document explains Phase 5: adding a deterministic + AI-assisted Decision Engine
> on top of the existing Phase 4 AI Project Assistant, using all existing DAA algorithms.

---

## Table of Contents
1. [Phase 5 Goal](#1-phase-5-goal)
2. [Design Principle: AI Cannot Make The Decision](#2-design-principle-ai-cannot-make-the-decision)
3. [Architecture Overview](#3-architecture-overview)
4. [Decision Engine Module (`decisionEngine.js`)](#4-decision-engine-module)
5. [Six Decision Types & DAA Coupling](#5-six-decision-types--daa-coupling)
6. [API Endpoint: POST /api/teams/:teamId/decide](#6-api-endpoint)
7. [Client UI: Decision Panel](#7-client-ui-decision-panel)
8. [Integration with ProjectAdvisorPanel](#8-integration-with-projectadvisorpanel)
9. [Deterministic Scoring Formulas](#9-deterministic-scoring-formulas)
10. [AI Qualitative Layer](#10-ai-qualitative-layer)
11. [Persistence: Reusing Existing Models](#11-persistence-reusing-existing-models)
12. [Files Created](#12-files-created)
13. [Files Modified](#13-files-modified)
14. [Files NOT Changed](#14-files-not-changed)
15. [Backward Compatibility](#15-backward-compatibility)
16. [Verification Results](#16-verification-results)

---

## 1. Phase 5 Goal

Phase 4 gave students a rich AI Project Advisor: analysis, recommendations, decisions lifecycle, architecture, research, and copilot chat. However, when students needed to **make a concrete decision** (e.g., "should we use FastAPI or Node.js?", "which tasks do we prioritize?"), the experience was purely chat-based — there was no structured, auditable decision framework.

**Phase 5 adds a Decision & Recommendation Engine that:**
1. Accepts a decision question and options from the student
2. Scores options **deterministically** using the existing DAA algorithms (Greedy, Knapsack, B&B, Merge Sort)
3. Presents an explainable Decision Matrix showing *exactly* why each option scored as it did
4. Uses AI **only** for natural-language explanation of trade-offs — never for scores
5. Allows students to save the decision (→ existing `Decision` model) or create a follow-up task (→ existing task pipeline)

---

## 2. Design Principle: AI Cannot Make The Decision

> **"NEXUSFLOW must not become: 'AI gives an answer and we blindly trust it.'"**

This principle is enforced architecturally:

```
┌────────────────────────────────────────────────────────────────┐
│  WHAT AI DOES IN PHASE 5:                                      │
│    • Explains WHY the recommended option was chosen            │
│    • Narrates trade-offs between options                       │
│    • Suggests risk mitigations in natural language             │
│    • Proposes a next action step                               │
│                                                                │
│  WHAT AI DOES NOT DO:                                          │
│    • AI never computes factor scores                           │
│    • AI never overrides the weighted formula                   │
│    • AI never determines the winner (Merge Sort decides)       │
│    • AI failure → deterministic result stands unchanged        │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture Overview

```
User (DecisionPanel) → POST /api/teams/:teamId/decide
        ↓
buildCompactProjectContext()  [existing utility — unchanged]
        ↓
evaluateDecision() [decisionEngine.js]
        ↓
  ┌─────────────────────────────────────────────────────────────┐
  │ TYPE A: technology   → weightedFactorScore()                │
  │ TYPE B: task-priority→ greedySortTasks() [existing]        │
  │ TYPE C: sprint       → knapsackSprint()   [existing]       │
  │ TYPE D: assignment   → assignTasksToMembers() [existing]   │
  │ TYPE E: architecture → weightedFactorScore()               │
  │ TYPE F: ai-ml        → weightedFactorScore()               │
  │                                                             │
  │ All options sorted by → mergeSort() [existing]             │
  └─────────────────────────────────────────────────────────────┘
        ↓
OpenAI [OPTIONAL — text only, 8s timeout]
  → reason, nextAction, tradeoffs, risks
  → AI failure → graceful degradation, deterministic result preserved
        ↓
Response → DecisionPanel
  → RecommendationCard (score bar, strength, key factors)
  → Decision Matrix (dynamic table, highlighted winner)
  → Alternatives
  → Trade-offs (pros/cons per option)
  → Risks (severity + mitigation)
  → Next Action callout
        ↓
Student makes the final decision
  [Create Task] → existing POST /api/teams/:teamId/tasks
  [Save Decision] → existing POST /api/projects/:projectId/decisions
```

---

## 4. Decision Engine Module

**File:** `server/algorithms/decisionEngine.js`

### Key Exports

```javascript
evaluateDecision({ decisionType, question, options, preferences, ctx, tasks, members, aiQualitative })
  → DecisionResult

listDecisionTypes()
  → [{ key, label, icon, description }]
```

### Factor Definitions

| Factor | Label | Used For |
|--------|-------|----------|
| `skillFit` | Team Skill Match | technology, ai-ml |
| `effortFit` | Development Speed | technology, architecture, ai-ml |
| `deadlineFit` | Deadline Alignment | technology, architecture, ai-ml |
| `complexityFit` | Complexity Match | technology, architecture, ai-ml |
| `scalabilityFit` | Scalability | architecture |

### Scoring Formula

```
finalScore = Σ (factorScore[i] × normalizedWeight[i])

Where:
  factorScore[i]        ∈ [0, 100]  — deterministic, from project context
  normalizedWeight[i]   ∈ [0, 1]    — user preference (defaults provided)
  Σ normalizedWeight[i] = 1.0       — always normalized
  finalScore            ∈ [0, 100]  — integer
```

### Strength Labels

| Score | Label | Emoji |
|-------|-------|-------|
| ≥ 80 | Strong Fit | 🟢 |
| ≥ 60 | Good Fit | 🟡 |
| ≥ 40 | Moderate Fit | 🟠 |
| < 40 | Weak Fit | 🔴 |

---

## 5. Six Decision Types & DAA Coupling

### TYPE A: Technology
**Algorithms used:** `mergeSort()` (ranking), weighted factor scoring

Scores each option against: `skillFit`, `effortFit`, `deadlineFit`, `complexityFit`.

The scoring uses the technology signal database (`TECH_SIGNALS`) to infer characteristics:
- Does the tech require Python? (→ `skillFit` for AI/ML projects)
- What is its development speed? (→ `effortFit`)
- Does it support realtime? (→ bonus if project needs realtime)

---

### TYPE B: Task Priority
**Algorithms used:** `computePriorityScore()` O(1), `greedySortTasks()` O(n log n)

No options needed. Calls the existing Greedy Priority Scheduler directly:

```
priorityScore = 40×urgency + 35×impact + 25×(min(dependencyCount/3, 1))
```

Returns the ranked task list with the reasoning for each rank.

---

### TYPE C: Sprint Planning
**Algorithms used:** `knapsackSprint()` 0/1 Knapsack DP O(n × W)

No options needed. Uses existing Knapsack implementation to select tasks that maximize `value` within `capacity` story points.

Sprint capacity defaults to `team.settings.sprintCapacity` or 20 points.

---

### TYPE D: Assignment
**Algorithms used:** `assignTasksToMembers()` Branch & Bound O(n! / pruning), `buildCostMatrix()` O(n × m × skills)

No options needed. Calls the existing B&B engine to find optimal task-to-member assignments minimizing skill-gap cost.

Returns per-assignment `fitScore = (1 - cost / maxCost) × 100` for UI display.

---

### TYPE E: Architecture
**Algorithms used:** `mergeSort()` (ranking), weighted factor scoring

Same scoring as technology but uses architecture-specific factor weights:
`scalabilityFit` (0.30), `complexityFit` (0.25), `effortFit` (0.25), `deadlineFit` (0.20).

---

### TYPE F: AI/ML Approach
**Algorithms used:** `mergeSort()` (ranking), weighted factor scoring

Scores: `skillFit` (0.30), `complexityFit` (0.25), `effortFit` (0.25), `deadlineFit` (0.20).
`needsAiMl` and `needsHardware` flags from project context inform the scoring.

---

## 6. API Endpoint

### `POST /api/teams/:teamId/decide`

**Request:**
```json
{
  "decisionType": "technology",
  "question": "Which backend framework should we use?",
  "options": ["FastAPI", "Node.js + Express", "Django"],
  "preferences": {
    "speed": 0.40,
    "skillFit": 0.30,
    "scalability": 0.20,
    "deadline": 0.10
  }
}
```

**Response:**
```json
{
  "success": true,
  "decision": {
    "decisionType": "technology",
    "question": "...",
    "recommendation": { "option": "FastAPI", "score": 87, "strength": { "label": "Strong Fit", "emoji": "🟢" } },
    "alternatives": [
      { "option": "Node.js + Express", "score": 74, "strength": "Good Fit", "reason": "..." }
    ],
    "factors": [ { "factor": "skillFit", "label": "Team Skill Match", "weight": 0.30, "score": 80 } ],
    "matrix": { "factors": [...], "options": [...], "scores": [[...]], "finalScores": [...], "winner": "FastAPI" },
    "tradeoffs": [ { "option": "FastAPI", "pros": [...], "cons": [...] } ],
    "risks": [ { "option": "FastAPI", "risk": "...", "severity": "medium", "mitigation": "..." } ],
    "reason": "FastAPI scored 87/100...",
    "nextAction": "Set up FastAPI project structure...",
    "confidence": { "label": "High", "description": "..." },
    "daaAlgorithmsUsed": ["Merge Sort (ranking — O(n log n))", "Weighted Factor Scoring"],
    "weightExplanation": "Scores are calculated deterministically...",
    "aiEnhanced": true,
    "projectContext": { "projectTitle": "...", "domain": "...", "taskCount": 12, "memberCount": 3 }
  }
}
```

### `GET /api/teams/:teamId/decide/types`

Returns metadata about all 6 decision types for UI rendering.

**Timeout:** 12 seconds (8 second sub-timeout for AI call)  
**AI failure:** Returns `aiEnhanced: false`, deterministic result unchanged.

---

## 7. Client UI: Decision Panel

**File:** `client/components/workspace/DecisionPanel.tsx`

### User Flow

1. **Decision Type Selector** — 6 pill buttons, each showing the DAA algorithm used
2. **Question Input** — optional natural language question (for technology/arch/ai-ml types)
3. **Options Input** — comma-separated options (for technology/arch/ai-ml types)
4. **Sprint Capacity Stepper** — visible only for sprint type (default 20 pts)
5. **Preference Weight Presets** — 4 presets: Balanced / Fast Delivery / Team Skill / Scalable
6. **Analyze Decision** button → `POST /api/teams/:teamId/decide`
7. **Recommendation Card** — shows option, score bar (0–100), strength badge, key factors, next action
8. **Result Sub-tabs:** Overview | Decision Matrix | Trade-offs | Risks
9. **Overview:** Alternatives list, ranked tasks (for priority type), sprint selection, assignment list
10. **Decision Matrix:** Dynamic scrollable table, winner highlighted
11. **Trade-offs:** Pros/cons per option in two-column layout
12. **Risks:** Severity badges (high/medium/low) with mitigation steps
13. **Action Buttons:**
    - **Create Recommended Task** → `POST /api/teams/:teamId/tasks` (existing endpoint)
    - **Save Decision** → `POST /api/projects/:projectId/decisions` (existing endpoint)

### Confidence Indicator

The panel computes a confidence score based on how much project context is available:
- Project title (long) → +20
- Project description (substantial) → +20
- Specific domain → +15
- Members with skill profiles → +15
- Existing tasks → +15
- Multiple options compared → +15

**High (≥80):** Strong context → trust the scores  
**Medium (50–79):** Some context → add more detail for better accuracy  
**Low (<50):** Limited context → fill in project description and member skills

---

## 8. Integration with ProjectAdvisorPanel

**File modified:** `client/components/workspace/ProjectAdvisorPanel.tsx`

Changes are purely additive:

1. **Import added:** `import DecisionPanel from "./DecisionPanel";`

2. **Type extended:**
   ```typescript
   // BEFORE:
   useState<"advisor" | "recommendations" | "decisions" | "architecture" | "research">
   // AFTER:
   useState<"advisor" | "recommendations" | "decisions" | "architecture" | "research" | "decide">
   ```

3. **Tab added** to the sub-nav array:
   ```javascript
   { key: "decide", label: "Decision Engine", icon: "analytics", count: 0 }
   ```

4. **Render added** outside the outer ScrollView (so DecisionPanel has its own independent scroll):
   ```jsx
   {activeSection === "decide" && <DecisionPanel teamId={teamId} />}
   ```

No existing sub-tabs, state, data fetching, or components were modified.

---

## 9. Deterministic Scoring Formulas

### Technology / Architecture / AI-ML Factors

**skillFit(option, ctx):**
```
score = 50 (baseline)
+ 30 if option.mlNative && ctx.needsAiMl
+ 20 if option.python && ctx.needsPython
+ 15 if !option.python && !ctx.needsPython
+ 20 if option.realtime && ctx.needsRealtime
+ 10 if !option.realtime && !ctx.needsRealtime
clamped to [0, 100]
```

**effortFit(option):** Lookup from TECH_SIGNALS table, default 65.

**deadlineFit(option, ctx):**
```
base = effortFit(option)
penalty = ctx.taskCount > 30 ? 10 : ctx.taskCount > 15 ? 5 : 0
score = clamp(base - penalty, 0, 100)
```

**complexityFit(option, ctx):**
```
memberBonus = min(15, (n - 1) × 5)
score = clamp(effortFit - 5 + memberBonus, 0, 100)
```

**scalabilityFit(option):**
```
microservices → 90 | serverless → 80 | websocket → 75 | rest → 70 | monolith → 55 | default → 60
```

### Weighted Score

```
rawWeights[i]  = preferences[mapPrefToFactor(factor)] ?? defaultWeight
totalWeight    = Σ rawWeights[i]
finalScore     = round(Σ (rawWeights[i] × factorScore[i]) / totalWeight)
normalWeight[i]= rawWeights[i] / totalWeight  (for display)
```

---

## 10. AI Qualitative Layer

The AI call is only made when:
- `OPENAI_API_KEY` is set in environment
- `decisionType` is one of: `technology`, `architecture`, `ai-ml`
- At least 1 option was provided

The AI prompt explicitly instructs:
```
"Your role is to EXPLAIN a decision recommendation — you do NOT calculate scores (those are deterministic)."
```

The deterministic scores are included in the AI prompt so it can reference them without recalculating.

**If AI call fails** (timeout / rate limit / no key):
- `console.warn("[decide] AI qualitative layer unavailable")`
- The deterministic result is returned unchanged
- `aiEnhanced: false` in response

---

## 11. Persistence: Reusing Existing Models

**Save Decision** uses `POST /api/projects/:projectId/decisions` (existing Phase 3 endpoint).

Payload maps Phase 5 result → existing `Decision` model fields:
```javascript
{
  title: question || `${decisionType} Decision`,
  decision: recommendation.option,           // → Decision.decision
  reasoning: reason,                         // → Decision.reasoning
  selectedOption: recommendation.option,     // → Decision.selectedOption
  alternativesConsidered: alternatives.map(a => a.option),  // → Decision.alternativesConsidered
  category: "technology" | "architecture" | "ai_model" | "other",
  source: "ai",
  confidence: score / 100,
  status: "proposed",
}
```

The saved decision then appears in the existing **Decisions** sub-tab of ProjectAdvisorPanel.

**Create Recommended Task** uses `POST /api/teams/:teamId/tasks` (existing endpoint).

---

## 12. Files Created

| File | Description |
|------|-------------|
| `server/algorithms/decisionEngine.js` | Centralized deterministic decision engine (505 lines) |
| `client/components/workspace/DecisionPanel.tsx` | Decision Engine UI panel (740 lines) |

---

## 13. Files Modified

| File | Change | Lines Added | Existing Lines Changed |
|------|--------|-------------|----------------------|
| `server/routes/teams.js` | Added `POST /api/teams/:teamId/decide` + `GET /api/teams/:teamId/decide/types` | ~215 | 1 (import line) |
| `client/components/workspace/ProjectAdvisorPanel.tsx` | Added "decide" sub-tab and `<DecisionPanel>` render | 5 | 2 (type union, tab array) |

---

## 14. Files NOT Changed

The following files were explicitly preserved:

- `server/algorithms/greedyScheduler.js` — unchanged
- `server/algorithms/taskOptimiser.js` — unchanged
- `server/algorithms/branchAndBound.js` — unchanged
- `server/algorithms/graphTraversal.js` — unchanged
- `server/utils/sortAlgorithms.js` — unchanged
- `server/utils/projectContextBuilder.js` — unchanged
- `server/models/Decision.js` — unchanged
- `server/models/Recommendation.js` — unchanged
- `server/models/Task.js` — unchanged
- `server/models/Team.js` — unchanged
- `client/components/AiTaskAssistant.tsx` — unchanged
- `client/components/RecommendationPanel.tsx` — unchanged
- `client/components/workspace/TasksPanel.tsx` — unchanged
- `client/components/workspace/SprintPanel.tsx` — unchanged
- `client/components/workspace/GraphPanel.tsx` — unchanged
- `client/components/workspace/AnalyticsPanel.tsx` — unchanged
- `client/components/workspace/AssignmentBoard.tsx` — unchanged
- `client/app/team/[teamId].tsx` — unchanged
- All socket handlers — unchanged

---

## 15. Backward Compatibility

- **Zero breaking changes.** All existing endpoints, socket handlers, and UI components are fully preserved.
- The `activeSection` type extension is backward-compatible (union type addition).
- The new `/api/teams/:teamId/decide` endpoint is additive — no routing conflicts.
- `decisionEngine.js` imports from existing algorithm files but does not modify them.
- The new `DecisionPanel` is rendered **only** when `activeSection === "decide"` — it never interferes with other panels.

---

## 16. Verification Results

### Server
```
✓ POST /api/teams/:teamId/decide (technology) → scores each option, returns matrix
✓ POST /api/teams/:teamId/decide (task-priority) → calls greedySortTasks()
✓ POST /api/teams/:teamId/decide (sprint) → calls knapsackSprint()
✓ POST /api/teams/:teamId/decide (assignment) → calls assignTasksToMembers()
✓ POST /api/teams/:teamId/decide (architecture) → calls mergeSort()
✓ POST /api/teams/:teamId/decide (ai-ml) → calls mergeSort()
✓ GET  /api/teams/:teamId/decide/types → returns 6 decision types
✓ Missing decisionType → 400 error
✓ Technology type without options → 400 error
✓ Team not found → 404 error
✓ AI unavailable → deterministic result returned (aiEnhanced: false)
✓ Timeout guard (12s) → 504 if exceeded
```

### Client
```
✓ "Decision Engine" sub-tab appears in ProjectAdvisorPanel sub-nav
✓ All 5 existing sub-tabs (Advisor & Chat, Recommendations, Decisions, Architecture, Research) unchanged
✓ Decision type selector shows 6 types with DAA labels
✓ Options input shows only for technology/architecture/ai-ml types
✓ Sprint capacity stepper shows only for sprint type
✓ Preference presets update weight bars
✓ Analyze → loading spinner → recommendation card
✓ Decision Matrix renders dynamically (not hardcoded)
✓ Trade-offs show pros/cons per option
✓ Risks show severity badges + mitigation
✓ Create Recommended Task → uses existing REST endpoint
✓ Save Decision → uses existing /api/projects/:projectId/decisions
✓ Error states display correctly (timeout, network, validation)
```

### Regression
```
✓ Dashboard loads normally
✓ Task creation (socket + REST) unchanged
✓ Sprint Panel (Knapsack) unchanged
✓ Graph Panel (Dependency DAG) unchanged
✓ Analytics Panel (Sort algorithms) unchanged
✓ Assignment Board (B&B) unchanged
✓ Recommendation Panel (computeRecommendation) unchanged
✓ AI Task Assistant (ai-suggest endpoint) unchanged
```

---

## Phase 6 Boundary

Phase 5 scope ends at:
- Structured Decision Engine for 6 decision types
- Deterministic scoring + AI explanation layer
- Integration with existing models (Decision, Recommendation)

Phase 6 (out of scope) would include:
- Autonomous decision agents
- Multi-step decision workflows
- Real-time collaborative decision sessions
- Historical decision analytics
