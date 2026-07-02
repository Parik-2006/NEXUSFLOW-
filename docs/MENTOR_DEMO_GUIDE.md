# NexusFlow — Mentor / Demo Guide

A precise, repeatable demo sequence for evaluation. Each step lists **what to
click**, **what data to create**, **which algorithm is triggered**, and the
**expected output**. A viva Q&A bank follows.

> Run the app first: `start.bat` (boots the server on its port and the Expo
> client). If you have no `OPENAI_API_KEY`, the AI uses a deterministic mock —
> the demo still works fully offline.

---

## Pre-flight (1 min)

1. Launch with `start.bat`.
2. Confirm the server is up and MongoDB is connected (server console).
3. Open the client (web build is easiest to project).

---

## Demo sequence

### Step 1 — Sign in
- **Click:** Sign in with any email (`demo@nexusflow.app`) + any password.
- **Algorithm:** none.
- **Expected:** Lands on the dashboard (command-center stats, all zeros).

### Step 2 — Set up your profile
- **Click:** Profile tab → **Edit**.
- **Create:** Role `Tech Lead`, add skills **Backend + DevOps**, save.
- **Algorithm:** none (skills feed Branch & Bound later).
- **Expected:** Identity card shows role + skill badges.

### Step 3 — Create a workspace
- **Click:** **New workspace** → walk the 4 steps.
- **Create:**
  - Team: `Web Platform Squad`
  - Project: `Authentication revamp`
  - Description: `Build login API. Add OAuth. Write tests. Deploy to staging.`
  - Role: **Team Leader**
  - Members: `Alice` (Backend), `Bob` (Frontend), `Carol` (DevOps)
- **Algorithm:** **Greedy Scheduler** (priority score per starter task on save).
- **Expected:** Workspace appears; starter tasks created with priority scores.

### Step 4 — Generate tasks with AI
- **Click:** Open the team → **Chat** tab.
- **Type:** `@ai Build a secure authentication system with OAuth and tests`
- **Algorithm:** AI → task titles, then **Greedy** (scoring) → **Branch &
  Bound** (auto-assignment).
- **Expected:** Titles stream in; each becomes a task; tasks get auto-assigned
  to Alice/Bob/Carol with a cost + pruning stats (`task:assigned`).

### Step 5 — Wire dependencies
- **Click:** **Graph** tab → add dependencies (e.g. "Add OAuth" depends on
  "Build login API"; "Deploy to staging" depends on "Write tests").
- **Algorithm:** **DFS**, **BFS**, **Topological Sort**.
- **Expected:** Execution-order tiers update live; if you create a cycle, a
  **circular dependency** warning appears.

### Step 6 — Plan a sprint (Knapsack)
- **Click:** **Sprint** tab, set capacity (e.g. `16` hours) → optimise.
  - *(Alt: type `@ai plan sprint 16` in chat.)*
- **Create (if prompted):** set `estimatedHours` + `businessValue` on a few
  tasks so they're eligible.
- **Algorithm:** **0/1 Knapsack DP**.
- **Expected:** `sprint:plan` — selected subset, total value, utilisation %
  (e.g. "3 tasks, 14h / 16h, 88% utilisation, value=27").

### Step 7 — Assignment review (Branch & Bound)
- **Click:** **Members** tab → review assignments / **Assign**.
- **Algorithm:** **Branch & Bound (Assignment Problem)**.
- **Expected:** Each task mapped to lowest skill-gap-cost member; panel shows
  total cost and pruning ratio (nodes pruned / explored).

### Step 8 — Recommendations (full pipeline)
- **Click:** **AI Rec** tab → set sprint capacity → analyse.
- **Algorithm:** **BFS → Greedy → Knapsack → Merge Sort → Topo** (+ search).
- **Expected:** Ranked recommended tasks each with value/effort ratio, topo
  execution order #, and a human-readable reason; algorithm badges + complexity
  shown.

### Step 9 — Search (Boyer-Moore)
- **Click:** Search box in the AI Rec panel → type `oauth`.
- **Algorithm:** **Boyer-Moore-Horspool**.
- **Expected:** Instant matches with `O(n/m)` complexity + scanned/match count.

### Step 10 — Analytics (Merge vs Bubble)
- **Click:** **Analytics** tab.
- **Algorithm:** **Merge Sort O(n log n)** vs **Bubble Sort O(n²)**.
- **Expected:** Comparison card — operation counts + timing showing Merge Sort
  winning as task count grows.

---

## One-line "wow" script

> "I describe a project in chat. The AI splits it into tasks (Greedy scores
> them), I draw dependencies (DFS/BFS/Topo order them safely), Knapsack packs
> the best-value sprint into my capacity, Branch & Bound assigns each task to
> the best-fit teammate, and everything updates live over sockets — with every
> algorithm's complexity shown on screen."

---

## Viva questions & answers

**Q1. Which greedy algorithms are used and why two?**
A. `GreedyPriorityScheduler` orders tasks by a weighted urgency/impact/fan-in
score (prioritisation). `GreedySprintRanking` ranks by value/effort ratio (ROI)
to feed the Knapsack selection. Different inputs/objectives/outputs —
complementary, not duplicates.

**Q2. Why Topological Sort and how do you detect cycles?**
A. We use Kahn's algorithm on the dependency DAG. If the produced order is
shorter than the number of nodes, a cycle exists (`hasCycle`). It's O(V+E) and
made deterministic by sorting the ready set each step.

**Q3. Difference between DFS and BFS here?**
A. DFS gives discovery/finish ordering and deep-chain structure. BFS groups
tasks into parallel-execution waves (level = earliest tier it can run in). Both
O(V+E).

**Q4. Why 0/1 Knapsack and not fractional?**
A. A task can't be half-included in a sprint — it's all-or-nothing, so 0/1 DP is
correct. Time O(n×W), space O(n×W); we backtrack the table to recover the exact
selected subset and cap capacity to bound the table.

**Q5. Explain Branch & Bound assignment and the bound.**
A. It's the Assignment Problem: minimise total skill-gap cost. The lower bound
at each node is cost-so-far plus the sum of row-minimum costs of unassigned
tasks — admissible (never overestimates), so pruning is safe. Worst case
O(n!), but pruning gives practical O(n²–n³) for n ≤ 20.

**Q6. Why Merge Sort over quicksort/built-in?**
A. We need a **stable** multi-key sort (status→priority→effort→title) so equal
keys keep their prior order; Merge Sort is stable and O(n log n) in all cases.
It's also the fair O(n log n) baseline benchmarked against Bubble Sort.

**Q7. How is Boyer-Moore sub-linear?**
A. The bad-character (Horspool) shift table lets the window skip ahead by up to
the pattern length on a mismatch, so on typical text it inspects ~O(n/m)
characters instead of every one. Worst case O(n×m).

**Q8. Where does the AI stop and the algorithms start?**
A. The LLM only converts natural language into task titles. All
prioritisation, ordering, sprint packing, and assignment are deterministic DAA
algorithms — so results are explainable and reproducible, not "black box".

**Q9. How is real-time collaboration achieved?**
A. Socket.IO rooms keyed `team:<id>`. Every create/update/assign/plan
broadcasts to the room, so all teammates see live updates. REST handles CRUD;
sockets handle live events and the AI stream.

**Q10. How do you keep algorithm results consistent across screens?**
A. One canonical implementation per algorithm (e.g. Kahn's topo sort in
`graphTraversal.js`) that REST, sockets, and the recommendation engine all
delegate to — identical output for identical input everywhere.

**Q11. What are the space/time complexities, at a glance?**
A. Greedy O(n log n)/O(n); DFS/BFS/Topo O(V+E)/O(V); Knapsack O(n·W)/O(n·W);
Branch & Bound O(n!) worst, practical O(n²–n³) / O(n²); Merge Sort O(n log
n)/O(n); Boyer-Moore O(n/m) avg / O(σ).

**Q12. What happens with no OpenAI key?**
A. A deterministic mock streamer produces a sensible task plan, so the entire
demo — including assignment, sprint, recommendation — works offline.
