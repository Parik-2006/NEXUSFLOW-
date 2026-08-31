# MANUAL TESTING GUIDE — PHASE 6: STUDENT PROJECT GUIDANCE

> **Status:** Automated validation complete; manual validation pending.
> This document provides step-by-step instructions to verify Phase 6 in the browser and mobile simulator.

---

## Test Environment Setup

1. Start MongoDB:
   ```bash
   mongod
   ```
2. Start Server:
   ```bash
   cd server
   npm run dev
   ```
3. Start Client:
   ```bash
   cd client
   npx expo start
   ```
4. Open the web app at `http://localhost:8081` (or mobile Expo Go app).

---

## 17 Step-by-Step Manual Test Scenarios

### TEST 1 — Basic Project Guidance Navigation
1. Log in to NEXUSFLOW.
2. Select any team workspace from the Dashboard.
3. Click the **Project AI** tab on the workspace navigation bar.
4. Verify that the sub-navigation bar now displays:
   - `Advisor & Chat`
   - `Project Guidance` *(NEW)*
   - `Recommendations`
   - `Decisions`
   - `Architecture`
   - `Research`
   - `Decision Engine`
5. Click **Project Guidance**.
6. **Expected:** The Guidance dashboard renders with the Hero Readiness Meter, Next Action card, and sub-tabs.

---

### TEST 2 — Context Grounding & No Random Suggestions
1. Set project title to: `"Smart Irrigation System using IoT and ML"`
2. Set project description to: `"Automated soil moisture monitoring using ESP32 and predictive ML to schedule irrigation."`
3. Click **Refresh** in Project Guidance.
4. **Expected:**
   - Domain is identified as `IoT & Embedded Systems` / `AgriTech`.
   - Technologies mention ESP32, soil moisture sensors, and Python/Node.js.
   - Core modules mention sensors, water valves, and ML forecasting.
   - **Verification:** System does NOT suggest unrelated e-commerce, shopping carts, or hotel booking features.

---

### TEST 3 — Hardware Project Detection
1. Create a project with title: `"IoT Waste Management System with Ultrasonic Sensors"`
2. Open **Project Guidance** → Click the **Tech & Hardware** sub-tab.
3. **Expected:**
   - Hardware status shows: **Hardware Required** (with amber badge).
   - Component list includes `HC-SR04 Ultrasonic Distance Sensor`, `ESP32 Microcontroller`, `Breadboard & Jumper Wires`.
   - Each hardware item has category and purpose clearly described.

---

### TEST 4 — Non-Hardware Software Project Detection
1. Create a project with title: `"Student Attendance Web Application"`
2. Open **Project Guidance** → Click the **Tech & Hardware** sub-tab.
3. **Expected:**
   - Hardware status displays: **Hardware Not Required**.
   - Explanation clearly states: *"Hardware does not appear necessary based on the current project description. This project can be built entirely with software."*
   - No microcontrollers or sensors are listed.

---

### TEST 5 — AI/ML Project Detection
1. Create a project with title: `"AI-Powered Video Interview Assistant"`
2. Open **Project Guidance** → Click the **Tech & Hardware** sub-tab.
3. **Expected:**
   - AI/ML status displays: **AI/ML Required**.
   - AI Category identifies `Computer Vision` or `Natural Language Processing`.
   - Dataset guidance indicates **Required: YES** with data collection and preprocessing notes.
   - Suggested techniques include baseline ML algorithms.

---

### TEST 6 — Simple CRUD / Non-AI Project
1. Create a project with title: `"College Event Management Website"`
2. Open **Project Guidance** → Click the **Tech & Hardware** sub-tab.
3. **Expected:**
   - AI/ML status displays: **AI/ML Not Required**.
   - Hardware status displays: **Hardware Not Required**.
   - Stack recommends standard React + Express + MongoDB/PostgreSQL without forcing AI models.

---

### TEST 7 — Hackathon Mode Slicer (24-Hour Sprint)
1. Open **Project Guidance** → Click the **Hackathon Mode** tab.
2. Select **24 Hours** from the time budget selector.
3. **Expected:**
   - 0/1 Knapsack DP calculates total effort used (e.g. 24h).
   - Core MVP tasks are listed under *"Selected for 24h Demo"*.
   - Non-critical / nice-to-have features are moved to the deferred list.
4. Change budget to **12 Hours** and verify task allocation immediately recalculates.

---

### TEST 8 — Decision Engine Bridge
1. Open **Project Guidance** → Click **Tech & Hardware**.
2. Review the recommendation for Backend/Database.
3. Switch to the **Decision Engine** sub-tab.
4. Compare `Node.js + Express` vs `FastAPI` for your project.
5. **Expected:** Phase 5 Decision Engine scores the options deterministically and outputs a Decision Matrix.

---

### TEST 9 — Greedy Task Priority Alignment
1. Open **Project Guidance** → Click **Phases & Roadmap**.
2. Inspect individual task priority scores.
3. **Expected:** High-urgency and high-impact tasks (e.g., Planning, Sensor wiring, Database schema) show high Greedy priority scores ($> 70/100$).

---

### TEST 10 — Topological Dependency Sequence
1. Open **Project Guidance** → Click **Phases & Roadmap**.
2. **Expected:** Phases follow topological order:
   - `Planning` $\rightarrow$ `Research` $\rightarrow$ `Hardware` (if applicable) $\rightarrow$ `AI/ML` (if applicable) $\rightarrow$ `Backend` $\rightarrow$ `Frontend` $\rightarrow$ `Testing` $\rightarrow$ `Deployment`.

---

### TEST 11 — Team Skill Gap Detection
1. Go to the **Members** tab.
2. Add a member with:
   - Frontend: 8
   - Backend: 8
   - ML: 3
3. Go to **Project Guidance** for an AI/ML project (`Smart Irrigation` or `AI Interview`).
4. Click **Skill Gaps & Risks**.
5. **Expected:** System flags **Machine Learning (ML)** as a critical/moderate skill gap and suggests pairing/prerequisites.

---

### TEST 12 — Deterministic Project Readiness Score
1. Start with an empty project (title only, no tasks).
2. Note readiness score (e.g. $\sim 40\text{--}50\%$, *"Needs Planning"*).
3. Add a detailed description and create 5 tasks.
4. Refresh **Project Guidance**.
5. **Expected:** Readiness score increases to $\ge 80\%$ (*"Ready to Build"*).

---

### TEST 13 — Next Action Engine & 1-Click Task Creation
1. Open **Project Guidance**.
2. Inspect the **Recommended Next Action** card in the hero area.
3. Click the action button (e.g. **Create Hardware Task** or **Create Backend Task**).
4. **Expected:**
   - Toast notification confirms task creation.
   - Switch to the **Tasks** tab and verify the new task is present in the backlog with auto-calculated Greedy priority.

---

### TEST 14 — AI Failure & Offline Fallback
1. Temporarily disable the internet or remove `OPENAI_API_KEY` in `server/.env`.
2. Click **Refresh** in Project Guidance.
3. **Expected:**
   - The UI does **not** hang on "Loading...".
   - The deterministic guidance engine completes and renders all sections with `aiEnhanced: false`.

---

### TEST 15 — MVP vs Advanced Feature Division
1. Open **Project Guidance** → **Overview** tab.
2. **Expected:** Must-have features are separated under *"Core MVP Scope"*, while post-hackathon items appear under *"Advanced (Post-MVP)"*.

---

### TEST 16 — Research Topics Integrity
1. Open **Project Guidance** → **Learning & Research** tab.
2. Inspect research topics.
3. **Expected:** Topics represent genuine technical spike areas (e.g. *"Sensor Noise Filtering"*, *"Low-Power MQTT"*) without fake academic DOIs or fabricated paper titles.

---

### TEST 17 — Regression Test of Existing Workspace Tabs
Verify that all existing features remain intact:
- [ ] **Dashboard**: Teams list loads and stats display.
- [ ] **Tasks / Kanban**: Drag-and-drop and status updates work.
- [ ] **Sprint Panel**: Knapsack sprint optimizer works.
- [ ] **Graph Panel**: Dependency DAG renders and topological levels work.
- [ ] **Analytics Panel**: Sort algorithm comparisons (Merge, Quick, Bubble) work.
- [ ] **Members / Assignment Board**: Branch & Bound member assignment works.
- [ ] **Decision Engine (Phase 5)**: All 6 decision types work.
- [ ] **Project AI Advisor (Phase 4)**: Chat and recommendations work.

---

## Test Project Matrix

| # | Test Project Name | Expected Domain | Hardware? | AI/ML? | Dataset? |
|---|-------------------|-----------------|-----------|--------|----------|
| 1 | Smart Irrigation System | IoT / AgriTech | **YES** (ESP32, Soil moisture, Relay) | **YES** (Time-Series) | **YES** |
| 2 | AI Interview Assistant | AI / ML | **NO** | **YES** (NLP / Speech) | **YES** |
| 3 | Hospital Management System | Healthcare | **NO** | **NO** | **NO** |
| 4 | E-Commerce Platform | E-Commerce | **NO** | **NO** | **NO** |
| 5 | IoT Waste Management System | IoT / Smart City | **YES** (ESP32, Ultrasonic) | **NO** | **NO** |
