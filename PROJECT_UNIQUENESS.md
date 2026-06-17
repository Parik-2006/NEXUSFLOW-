# NexusFlow — Project Uniqueness

Why NexusFlow exists, why existing tools fall short, and how it combines AI with
classic Design & Analysis of Algorithms (DAA) to plan projects optimally.

---

## 1. Problem statement

Teams waste enormous effort on the *meta-work* of project management:
- Manually triaging and re-prioritising backlogs.
- Guessing which tasks fit into a sprint.
- Hand-assigning work without a real model of who's best suited.
- Tracking dependencies in their heads (and starting work out of order).

These are not opinion problems — they are **well-defined optimisation
problems** (scheduling, ordering, packing, assignment) that humans solve poorly
and inconsistently, while standard tools leave them entirely manual.

---

## 2. Why existing tools are insufficient

| Tool | Gap |
|------|-----|
| **Jira / Trello / Asana** | Boards and tickets, but prioritisation, sprint scope, and assignment are 100% manual. No optimisation engine. |
| **AI add-ons / copilots** | Generate text or summarise tickets, but don't *compute* an optimal, dependency-safe, capacity-bounded plan. Output is suggestive, not provably optimal. |
| **Spreadsheets** | Can model capacity, but no dependency graph, no real-time collaboration, no automation. |

The common gap: **no tool turns a plain brief into an optimal, explainable
plan** — prioritised, ordered by dependencies, packed to capacity, and assigned
by skill — automatically and in real time.

---

## 3. How NexusFlow solves it

NexusFlow treats project planning as a pipeline of solved CS problems and runs
each with the right algorithm:

1. **Prioritise** — Greedy scheduler scores every task (urgency/impact/fan-in).
2. **Order** — DFS/BFS/Topological Sort give a dependency-safe, parallel-aware
   execution order and catch cycles.
3. **Pack** — 0/1 Knapsack selects the maximum-value sprint within capacity.
4. **Assign** — Branch & Bound maps tasks to best-fit members at minimum
   skill-gap cost.
5. **Present** — Merge Sort gives stable display order; Boyer-Moore powers
   instant search.

All of it streams live to every teammate over Socket.IO, and every result is
annotated with its inputs, outputs, and complexity — so the plan is
**transparent and reproducible**, not a black box.

---

## 4. How AI + DAA work together

- **AI (the language layer):** converts a natural-language brief
  (`@ai Build a secure auth system…`) into discrete task titles, with
  keyword-based urgency/impact seeding. OpenAI `gpt-4o-mini` when available; a
  deterministic mock otherwise.
- **DAA (the decision layer):** takes those tasks and computes the *optimal,
  explainable* plan. The recommendation engine chains five algorithms
  (BFS → Greedy → Knapsack → Merge Sort → Topo) into one result.

This separation is the core idea: **AI handles ambiguity; algorithms handle
optimality.** The LLM never decides priority, scope, or assignment — so outputs
are deterministic, defensible, and free of hallucinated planning decisions.

---

## 5. Innovation points

- **DAA-as-a-product:** eight classic algorithms aren't a demo aside — they are
  the actual planning engine behind every screen.
- **Explainable optimisation:** each recommendation ships with complexity, input
  stats, output stats, and a human-readable reason (viva- and audit-ready).
- **Single source of truth per algorithm:** one canonical Kahn's topo sort /
  BFS shared by REST, sockets, and the engine — identical output everywhere.
- **Admissible-bound Branch & Bound** for assignment, with live pruning metrics
  (nodes explored vs pruned) surfaced in the UI.
- **Real-time, room-scoped collaboration:** every plan, assignment, and task
  update broadcasts instantly to the whole team.
- **Offline-capable AI:** deterministic mock streamer means the full pipeline
  works with no API key — robust for demos and air-gapped evaluation.
- **Migration-safe data model:** optimiser inputs are derived at request time
  from existing fields, so the schema stays backward-compatible.

---

## 6. Future scope

- **Multi-resource scheduling:** extend Greedy/Knapsack to multiple parallel
  workers and calendar deadlines (EDF + weighted interval scheduling).
- **Critical-path analysis (CPM/PERT):** longest-path over the DAG for accurate
  delivery-date forecasting.
- **Hungarian algorithm** as an O(n³) exact alternative to Branch & Bound for
  large assignment instances.
- **Learned skill profiles:** infer member skills from completed-task history
  instead of manual entry, improving assignment cost accuracy over time.
- **Sprint simulation / what-if:** compare multiple capacity scenarios side by
  side before committing.
- **Persistent recommendations & analytics history** for retrospective metrics
  (velocity, utilisation trends).
- **Role-based permissions** to turn the demo roles into enforced access
  control.
