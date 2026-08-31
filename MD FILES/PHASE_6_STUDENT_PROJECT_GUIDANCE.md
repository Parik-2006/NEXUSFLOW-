# NEXUSFLOW 2.0 — PHASE 6: STUDENT PROJECT GUIDANCE & PROJECT COPILOT

> **Audience:** Comprehensive architectural specification, design principles, and technical documentation.
> This document explains Phase 6: Student Project Guidance, its deterministic DAA algorithmic foundations,
> and its integration with Phase 4 (AI Advisor) and Phase 5 (Decision Engine).

---

## Table of Contents
1. [Objective & Vision](#1-objective--vision)
2. [Problem Statement](#2-problem-statement)
3. [Architecture Overview & Flow](#3-architecture-overview--flow)
4. [Coupling with Existing Phase 4 & Phase 5 Foundations](#4-coupling-with-existing-phase-4--phase-5-foundations)
5. [DAA Algorithmic Engine Coupling](#5-daa-algorithmic-engine-coupling)
6. [Project Understanding & Domain Inference](#6-project-understanding--domain-inference)
7. [Hardware & Sensor Detection](#7-hardware--sensor-detection)
8. [AI/ML Guidance & Dataset Strategy](#8-aiml-guidance--dataset-strategy)
9. [External API & Services Guidance](#9-external-api--services-guidance)
10. [Technology Stack & Resource Matrix](#10-technology-stack--resource-matrix)
11. [Project Phases & Topological Dependency Roadmap](#11-project-phases--topological-dependency-roadmap)
12. [Hackathon Mode & 0/1 Knapsack Slicing](#12-hackathon-mode--01-knapsack-slicing)
13. [Learning Roadmap & Prerequisites](#13-learning-roadmap--prerequisites)
14. [Research Topics (Zero Fake Citations)](#14-research-topics-zero-fake-citations)
15. [Complexity & Risk Detection](#15-complexity--risk-detection)
16. [Team Skill Gap Analysis](#16-team-skill-gap-analysis)
17. [Deterministic Project Readiness Score (0–100%)](#17-deterministic-project-readiness-score-0100)
18. [Next Action Engine](#18-next-action-engine)
19. [API Design (`POST /api/teams/:teamId/project-guidance`)](#19-api-design)
20. [Client UI: Guidance Panel](#20-client-ui-guidance-panel)
21. [Security, Performance & Fallback Strategy](#21-security-performance--fallback-strategy)
22. [Phase 7 Boundary](#22-phase-7-boundary)

---

## 1. Objective & Vision

Phase 6 implements the **Student Project Guidance & Project Copilot** layer in NEXUSFLOW 2.0.
Its core purpose is to answer a student's fundamental question:
> *"I have this project idea. What exactly do I need to do?"*

The system acts as a **Project Mentor + Planner + Technical Guide**:
- It gives practical, step-by-step clarity on technical feasibility, hardware needs, software architecture, datasets, prerequisites, and development sequencing.
- It is **not** an autonomous coding agent that blindly writes code.
- **AI** provides semantic project interpretation and qualitative narrative.
- **DAA Algorithms** deterministically optimize task priority, dependency ordering, and hackathon time allocation.
- The **student** makes all final engineering decisions.

---

## 2. Problem Statement

Student teams building capstone projects or hackathon prototypes frequently suffer from:
1. **Scope Overload / Overengineering**: Adding AI, blockchain, or complex microservices when a simple CRUD REST app is sufficient.
2. **Missing Prerequisites**: Attempting model training or hardware communication without understanding basic pinouts or data preprocessing.
3. **Unrealistic Time Allocation**: Lacking a structured way to determine what fits in a 24h/48h hackathon.
4. **Uncertain Hardware & Dataset Needs**: Not knowing if they need physical microcontrollers or where to source validation data.
5. **Team Skill Mismatch**: Assigning complex ML or firmware tasks to members without identifying prerequisites.

Phase 6 solves these issues through a structured, transparent guidance dashboard.

---

## 3. Architecture Overview & Flow

```
                         STUDENT PROJECT IDEA / BACKLOG
                                       ↓
                        buildCompactProjectContext(teamId)
                                       ↓
                      projectGuidanceEngine.generateGuidance()
        ┌──────────────────────────────┼──────────────────────────────┐
        ↓                              ↓                              ↓
  PROJECT UNDERSTANDING       RESOURCE & TECH MATRIX         TEAM SKILL GAPS
  • Domain Classification     • Hardware Detection           • Member Skill Profiles
  • Core Problem & Modules    • AI/ML & Dataset Need         • Critical Gaps Identified
  • Complexity & Risks        • APIs & Cloud Services        • Learning Prerequisites
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       ↓
                           ROADMAP & PHASE DECOMPOSITION
                                       ↓
         ┌──────────────────────────────────────────────────────────┐
         │                EXISTING DAA ENGINE COUPLING              │
         │  • Topological Sort → Phase & Task Dependency Roadmap    │
         │  • Greedy Scheduler → Deterministic Priority Scoring     │
         │  • 0/1 Knapsack DP  → Hackathon Mode (6h/12h/24h/48h)    │
         │  • Branch & Bound   → Skill Cost Feasibility             │
         │  • Boyer-Moore      → Backlog Deduplication              │
         └──────────────────────────────────────────────────────────┘
                                       ↓
                         PROJECT READINESS SCORE (0–100%)
                        + DETERMINISTIC NEXT ACTION ENGINE
                                       ↓
                               STUDENT DECISION
        ┌──────────────────────────────┴──────────────────────────────┐
        ↓                                                             ↓
[Save/Adopt Guidance Decisions]                              [Create Action Task]
  → Phase 5 Decision Engine /                                  → Existing Task Pipeline
    Existing Decision Model                                      (POST /teams/:id/tasks)
```

---

## 4. Coupling with Existing Phase 4 & Phase 5 Foundations

Phase 6 does not replace or duplicate any Phase 4 or Phase 5 components:
- **Reuses `buildCompactProjectContext(teamId)`**: Maintains a lean context footprint and avoids prompt bloat.
- **Reuses Phase 4 Task Generation Pipeline**: Tasks created via Guidance panel flow through `POST /api/teams/:teamId/tasks` and socket event `task:create`, triggering the `Task` pre-save hook.
- **Reuses Phase 5 Decision Engine**: When guidance identifies ambiguous technology alternatives, it directs the student to the **Decision Engine** (`POST /api/teams/:teamId/decide`).

---

## 5. DAA Algorithmic Engine Coupling

| DAA Algorithm | Source File | Guidance Engine Responsibility |
|---------------|-------------|---------------------------------|
| **Topological Sort** | `graphTraversal.js` | Authoritative DAG sequencing of engineering phases (`Planning -> Research -> Hardware -> AI/ML -> Backend -> Frontend -> Testing -> Deployment`). |
| **0/1 Knapsack DP** | `taskOptimiser.js` | Hackathon Mode budget optimizer ($O(n \times W)$) maximizing business value within 6h, 12h, 24h, 36h, 48h constraints. |
| **Greedy Priority** | `greedyScheduler.js` | Computes priority score ($O(1)$) using urgency, impact, and dependency fan-in. |
| **Branch & Bound** | `branchAndBound.js` | Evaluates team member skill-gap cost matrix. |
| **Merge Sort** | `taskOptimiser.js` | Authoritative $O(n \log n)$ stable ranking for tasks, risks, and resource candidates. |
| **Boyer-Moore** | `taskOptimiser.js` | Fast sub-linear string search preventing duplicate task creation. |

---

## 6. Project Understanding & Domain Inference

Analyzes project title and description to detect domain:
- `IoT & Embedded Systems`
- `AI / Machine Learning`
- `Healthcare / MedTech`
- `AgriTech`
- `E-Commerce & Retail`
- `EdTech & Education`
- `FinTech & Finance`
- `Social & Collaboration`
- `Smart Transport & Logistics`
- `Web & Software Application`

Outputs:
- **Summary**: Clear executive statement of the project purpose.
- **Problem Statement**: Explicit definition of what problem is being solved.
- **Target Users**: Stakeholder groups.
- **Core Architecture Modules**: Structural breakdown (Edge Sensors, Backend API, Database, ML Engine, Client Dashboard).

---

## 7. Hardware & Sensor Detection

The engine scans for physical interaction requirements:
- **Hardware Not Required**: If the project is pure software (e.g. Student Attendance web app), the system explicitly states:
  > *"Hardware does not appear necessary based on the current project description. This project can be built entirely with software."*
- **Hardware Required**: For IoT / embedded systems, identifies specific components:
  - Microcontrollers: ESP32 DevKit V1, Arduino Uno/Nano, Raspberry Pi 4/5
  - Sensors: Soil Moisture, DHT22, HC-SR04 Ultrasonic, ESP32-CAM, MAX30102 Pulse Oximeter, NEO-6M GPS, MQ-135 Gas
  - Actuators: 5V Relays, 12V Solenoid Valves, Servo Motors
  - Prototyping: Breadboard, Jumper wires, 5V/2A regulated power supply

---

## 8. AI/ML Guidance & Dataset Strategy

Evaluates whether machine learning is genuinely required:
- **NOT_NECESSARY**: For CRUD systems, explicitly advises against overengineering with unnecessary ML.
- **REQUIRED**: Specifies category (Computer Vision, NLP, Time-Series & Regression, Supervised Classification).
- **Dataset Guidance**:
  - **Data Type**: e.g., labeled image dataset, temporal sensor readings.
  - **Collection Strategy**: Practical sampling (100–500 validation samples) or verified public datasets (Kaggle/UCI).
  - **Preprocessing**: Feature scaling, missing value imputation, noise filtering, 80/20 train-test split.
  - **No Fake Datasets**: Explicitly marks *"Dataset source requires research & validation before model training."*

---

## 9. External API & Services Guidance

Detects standard external service needs:
- Weather APIs (OpenWeatherMap)
- Mapping & Geolocation (Google Maps / Mapbox)
- Telephony & SMS (Twilio / Fast2SMS)
- Payments (Stripe / Razorpay test mode)
- Email Services (SendGrid / Resend)
- Cloud Storage (Cloudinary / AWS S3)

---

## 10. Technology Stack & Resource Matrix

Provides a structured stack recommendation:
- **Frontend**: React.js / React Native (Expo)
- **Backend**: Node.js & Express REST API / Socket.io
- **Database**: MongoDB / PostgreSQL
- **AI/ML**: Python (FastAPI + Scikit-Learn / PyTorch)
- **Deployment**: Render / Vercel + GitHub Actions
- **Tools**: Git & GitHub, Postman

Each item is flagged with `REQUIRED`, `OPTIONAL`, or `FUTURE_ENHANCEMENT`.

---

## 11. Project Phases & Topological Dependency Roadmap

Generates only relevant engineering phases in topological sequence:
1. `Planning`
2. `Research`
3. `Hardware` *(only if hardware detected)*
4. `Data Collection & AI/ML` *(only if AI/ML detected)*
5. `Backend API`
6. `Integration`
7. `Frontend UI`
8. `Testing`
9. `Deployment`

Emits tasks per phase with estimated effort (hours) and Greedy priority scores.

---

## 12. Hackathon Mode & 0/1 Knapsack Slicing

Students can select time budgets: **6h, 12h, 24h, 36h, 48h**.
- The engine executes 0/1 Knapsack DP where $W = \text{hoursBudget}$.
- Maximizes business value while guaranteeing tasks fit within available time.
- Divides backlog into **Selected MVP Tasks** vs **Deferred Tasks**.

---

## 13. Learning Roadmap & Prerequisites

Organized into 3 practical milestones:
- **Stage 1 (Before Starting)**: Fundamental prerequisites (Git workflows, REST JSON contracts, GPIO pinouts, Python/Pandas).
- **Stage 2 (During Development)**: Implementation skills (sensor calibration, model evaluation metrics, component UI).
- **Stage 3 (Advanced Optimization)**: Production polish (power optimization, quantization, CI/CD).

---

## 14. Research Topics (Zero Fake Citations)

Suggests practical engineering research areas (e.g., *"Sensor Noise Filtering & Debouncing Algorithms"*, *"Benchmark Architectures for Low-Resource Environments"*). Does not fabricate author names, DOIs, or URLs.

---

## 15. Complexity & Risk Detection

- **Complexity Score**: Scored as `LOW`, `MEDIUM`, `HIGH`, or `VERY_HIGH` based on hardware presence, ML integration, API dependencies, and task volume.
- **Risk Mitigation Matrix**: Identifies root causes and actionable mitigations (e.g. sensor noise, dataset overfitting, API rate limits).

---

## 16. Team Skill Gap Analysis

Compares project domain requirements against member skill profiles on a 0–10 scale:
- Frontend, Backend, DevOps, Design, ML, Testing.
- Identifies critical gaps (e.g., ML required $\ge 7.0$, team average $= 4.0$).
- Proposes pairing and tutorial prerequisites.

---

## 17. Deterministic Project Readiness Score (0–100%)

Calculated across 5 auditable factors (20 pts each):
1. **Project Definition**: Title, description, and problem statement completeness.
2. **Tech & Resource Clarity**: Hardware and software stack specificity.
3. **Task & Phase Coverage**: Backlog granularity and phase representation.
4. **Team Skill Alignment**: Skill coverage against project demands.
5. **Risk Awareness**: Identified mitigations.

**Tiers:** `Ready to Build` ($\ge 80\%$), `Almost Ready` ($60\text{--}79\%$), `Needs Planning` ($40\text{--}59\%$), `Not Enough Information` ($< 40\%$).

---

## 18. Next Action Engine

Evaluates unblocked dependencies, readiness gaps, and highest greedy priority to provide a single clear answer to *"What should I do next?"* with a 1-click `Create Task` button.

---

## 19. API Design

### `POST /api/teams/:teamId/project-guidance`
- **Auth**: Bearer JWT (`requireAuth`).
- **Body**: `{ "hackathonHours": 24 }`
- **Response**: `{ "success": true, "guidance": { ... }, "aiEnhanced": boolean }`
- **Timeout Safety**: 12-second controller timeout with graceful fallback.

---

## 20. Client UI: Guidance Panel

Located at: `client/components/workspace/GuidancePanel.tsx`
Integrated into: `ProjectAdvisorPanel.tsx` as the `guidance` sub-tab.
Features:
- Hero Readiness Meter & Complexity badge
- Prominent Next Action card with 1-click action trigger
- Interactive Hackathon time budget selector (6h–48h)
- 6 organized tabs: Overview, Tech & Hardware, Roadmap, Hackathon Mode, Learning & Research, Skill Gaps & Risks

---

## 21. Security, Performance & Fallback Strategy

- All OpenAI API calls are server-side only with 8-second sub-timeouts.
- If OpenAI is unavailable or errors, the deterministic guidance engine returns full results with `aiEnhanced: false`.
- Team scoping enforces that users can only fetch guidance for teams they belong to.

---

## 22. Phase 7 Boundary

Phase 6 strictly excludes:
- ❌ Vector databases / embeddings
- ❌ Research paper scraping / full PDF RAG
- ❌ Autonomous multi-agent execution
- ❌ Autonomous code writing / commits
- ❌ External live API execution
