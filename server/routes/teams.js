import { Router } from "express";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import { requireAuth } from "../auth.js";
import { greedySortTasks } from "../algorithms/greedyScheduler.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { buildGraph, dfs, bfs, topologicalSort as topoSortGraph } from "../algorithms/graphTraversal.js";
import { compareSortAlgorithms, mergeSortTasks, quickSortTasks } from "../utils/sortAlgorithms.js";
import { decomposeProject } from "../algorithms/projectDecomposer.js";

const router = Router();

// Above this size, skip Bubble Sort in the live analytics comparison.
const MAX_COMPARISON_SIZE = 500;

// Knapsack safety: cap sprint capacity so the DP table (W = hours × 10) cannot
// blow up memory. 200h → capacity 2000 columns, comfortably bounded.
const MAX_SPRINT_HOURS = 200;

// ── GET /api/teams ────────────────────────────────────────────────────────────
router.get("/teams", requireAuth, async (_req, res) => {
  try {
    const teams = await Team.find().lean();
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId ────────────────────────────────────────────────────
// Single team (with members) for the workspace / assignment board.
router.get("/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams ───────────────────────────────────────────────────────────
// Create a team. Body: { name, members?: [{ name, skills? }], tasks?: [{title,...}] }
// The creator is always added as the first member so they appear in the roster.
router.post("/teams", requireAuth, async (req, res) => {
  try {
    const { name, members = [], tasks = [], projectTitle = "", projectDescription = "" } = req.body ?? {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Team name is required." });

    const oid = () => new mongoose.Types.ObjectId();
    const creator = {
      userId: oid(),
      name: req.user?.name || req.user?.email || "You",
      skills: normalizeSkills(req.body.creatorSkills),
    };
    const extraMembers = (Array.isArray(members) ? members : [])
      .filter((m) => m && (m.name?.trim()))
      .map((m) => ({ userId: oid(), name: m.name.trim(), skills: normalizeSkills(m.skills) }));

    // Build the starter backlog. When a project description exists we DECOMPOSE
    // it into a grouped, professional backlog (Planning / Backend / Frontend / …)
    // — the description is never copied verbatim. Explicit client `tasks` are
    // only used as a fallback when no description is provided.
    const desc = String(projectDescription).trim();
    const generated = desc ? decomposeProject(String(projectTitle).trim(), desc) : [];
    const sourceTasks = generated.length ? generated : (Array.isArray(tasks) ? tasks : []);

    const seeds = sourceTasks
      .filter((t) => t && t.title?.trim())
      .map((t) => ({
        title: t.title.trim(),
        description: (t.description ?? "").trim(),
        category: t.category ?? "General",
        urgency: clampInt(t.urgency, 1, 5, 2),
        impact: clampInt(t.impact, 1, 5, 2),
        businessValue: numOrNull(t.businessValue),
        estimatedHours: numOrNull(t.estimatedHours),
        priorityLabel: t.priorityLabel ?? null,
      }));

    const team = await Team.create({
      name: name.trim(),
      projectTitle: String(projectTitle).trim(),
      projectDescription: String(projectDescription).trim(),
      members: [creator, ...extraMembers],
      aiGeneratedTasks: seeds,
    });

    // Create the initial AI/starter tasks (source = "ai") + wire phase deps.
    if (seeds.length) {
      const count = await createSeededTasks(team._id, seeds);
      await Team.updateOne({ _id: team._id }, { $set: { taskCount: count } });
    }

    const fresh = await Team.findById(team._id).lean();
    res.status(201).json(fresh);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/members ───────────────────────────────────────────
// Add a member. Body: { name, skills? }
router.post("/teams/:teamId/members", requireAuth, async (req, res) => {
  try {
    const { name, skills } = req.body ?? {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Member name is required." });
    const member = {
      userId: new mongoose.Types.ObjectId(),
      name: name.trim(),
      skills: normalizeSkills(skills),
    };
    const team = await Team.findByIdAndUpdate(
      req.params.teamId,
      { $push: { members: member } },
      { new: true, lean: true }
    );
    if (!team) return res.status(404).json({ error: "team_not_found" });
    res.status(201).json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId ─────────────────────────────────────────────────
// Remove a team and all of its tasks.
router.delete("/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.teamId);
    if (!team) return res.status(404).json({ error: "team_not_found" });
    await Task.deleteMany({ teamId: req.params.teamId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks ──────────────────────────────────────────────
// Returns tasks sorted by priorityScore DESC (Greedy Scheduler order).
router.get("/teams/:teamId/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ teamId: req.params.teamId })
      .sort({ priorityScore: -1, createdAt: 1 })
      .lean();
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/scheduled ────────────────────────────────────
// Greedy Scheduler demo — returns ranked list with explicit algorithm metadata.
router.get("/teams/:teamId/tasks/scheduled", requireAuth, async (req, res) => {
  try {
    const raw    = await Task.find({ teamId: req.params.teamId }).lean();
    const sorted = greedySortTasks(raw);
    const ranked = sorted.map((t, i) => ({ ...t, rank: i + 1 }));
    res.json({
      algorithm : "Greedy Priority Scheduling",
      complexity: { time: "O(n log n)", space: "O(n)" },
      taskCount : ranked.length,
      tasks     : ranked,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/analytics ────────────────────────────────────
// Task Analytics Engine — Bubble Sort O(n^2) vs Merge Sort O(n log n) metrics
// (time, comparisons, swaps) over the team's current task set.
router.get("/teams/:teamId/tasks/analytics", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ teamId: req.params.teamId }).lean();

    if (tasks.length > MAX_COMPARISON_SIZE) {
      const merge = mergeSortTasks(tasks);
      const quick = quickSortTasks(tasks);
      return res.json({
        n: tasks.length,
        skippedBubbleSort: true,
        reason: `n exceeds ${MAX_COMPARISON_SIZE}; O(n²) sorts skipped for performance`,
        algorithms: [
          { key: "merge", name: "Merge Sort", complexity: "O(n log n)", comparisons: merge.comparisons, swaps: merge.swaps, timeMs: 0 },
          { key: "quick", name: "Quick Sort", complexity: "O(n log n)", comparisons: quick.comparisons, swaps: quick.swaps, timeMs: 0 },
        ],
        mergeSort: { complexity: "O(n log n)" },
        sorted: merge.sorted,
      });
    }

    res.json(compareSortAlgorithms(tasks));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/execution-order ──────────────────────────────
// Topological Sort (Kahn's BFS) — returns tasks in dependency execution order.
// Also returns edge list for client-side DAG rendering.
// Time: O(V + E)
router.get("/teams/:teamId/tasks/execution-order", requireAuth, async (req, res) => {
  try {
    let tasks = await Task.find({ teamId: req.params.teamId }).lean();
    const needsCompute = tasks.some((t) => t.topoOrder === null || t.topoOrder === undefined);
    if (needsCompute) {
      const order = topologicalSort(tasks);
      const bulk  = order.map((id, idx) => ({
        updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
      }));
      if (bulk.length) await Task.bulkWrite(bulk);
      tasks = await Task.find({ teamId: req.params.teamId }).lean();
    }
    tasks.sort((a, b) => (a.topoOrder ?? 0) - (b.topoOrder ?? 0));
    const edges = buildEdgeList(tasks);
    res.json({ tasks, edges, algorithm: "Kahn's BFS Topological Sort", complexity: { time: "O(V+E)", space: "O(V+E)" } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/dependency-graph ───────────────────────────────────
// Full DFS + BFS + Topological Sort over the task dependency DAG.
// Powers the DependencyGraphPanel visualization. Time: O(V + E)
router.get("/teams/:teamId/dependency-graph", requireAuth, async (req, res) => {
  try {
    const [tasks, team] = await Promise.all([
      Task.find({ teamId: req.params.teamId }).lean(),
      Team.findById(req.params.teamId).lean(),
    ]);
    const memberName = Object.fromEntries((team?.members ?? []).map((m) => [m.userId.toString(), m.name]));

    const { adjList, inDegree, nodeMap } = buildGraph(tasks);
    const dfsResult  = dfs(adjList);
    const bfsResult  = bfs(adjList, inDegree);
    const topoResult = topoSortGraph(adjList, inDegree);

    const nodes = tasks.map((t) => ({
      id            : t._id.toString(),
      title         : t.title,
      status        : t.status,
      priority      : t.priorityScore ?? 0,
      priorityLabel : t.priorityLabel ?? null,
      estimatedHours: t.estimatedHours ?? 0,
      assignee      : t.assignedTo ? (memberName[t.assignedTo.toString()] ?? "Member") : null,
      dueDate       : t.dueDate ?? t.deadline ?? null,
      dependencies  : (t.dependencies ?? []).map((d) => d.toString()),
    }));
    const edges = buildEdgeList(tasks);

    res.json({ nodes, edges, dfsResult, bfsResult, topoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/tasks/:taskId/dependencies ────────────────────────
// Add a dependency edge. Runs DFS cycle check before persisting.
// Time: O(V + E)
router.post("/teams/:teamId/tasks/:taskId/dependencies", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const { dependsOn }      = req.body;
    if (!dependsOn) return res.status(400).json({ error: "dependsOn required" });
    if (taskId === dependsOn) return res.status(400).json({ error: "self_dependency_not_allowed" });

    const tasks = await Task.find({ teamId }).lean();
    if (!tasks.length) return res.status(404).json({ error: "team_not_found" });

    const target = tasks.find((t) => t._id.toString() === taskId);
    if (!target) return res.status(404).json({ error: "task_not_found" });
    const dep    = tasks.find((t) => t._id.toString() === dependsOn);
    if (!dep)    return res.status(404).json({ error: "dependency_task_not_found" });

    if (target.dependencies?.some((d) => d.toString() === dependsOn))
      return res.status(409).json({ error: "dependency_already_exists" });

    const adj = buildAdjacencyList(tasks);
    adj[dependsOn] = adj[dependsOn] ?? [];
    adj[dependsOn].push(taskId);

    if (hasCycle(adj, tasks.map((t) => t._id.toString())))
      return res.status(422).json({ error: "cycle_detected", message: "Adding this dependency would create a circular chain." });

    await Task.updateOne({ _id: taskId }, { $addToSet: { dependencies: dependsOn } });

    const updated = await Task.find({ teamId }).lean();
    const order   = topologicalSort(updated);
    const bulk    = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);

    const result = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ executionOrder: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId/tasks/:taskId/dependencies/:depId ───────────────
router.delete("/teams/:teamId/tasks/:taskId/dependencies/:depId", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId, depId } = req.params;
    await Task.updateOne({ _id: taskId }, { $pull: { dependencies: depId } });
    const tasks = await Task.find({ teamId }).lean();
    const order = topologicalSort(tasks);
    const bulk  = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);
    const result = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ executionOrder: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/sprint-optimize ───────────────────────────────────
// 0/1 Knapsack Sprint Optimizer. Body: { sprintHours: number }
// Time: O(n * W)  Space: O(n * W)
//
// SAFETY: the DP table is (n+1) × (W+1) with W = sprintHours × SCALE. To keep
// the table bounded we clamp sprintHours to MAX_SPRINT_HOURS and report a
// `warning` so the UI can tell the user the value was capped.
router.post("/teams/:teamId/sprint-optimize", requireAuth, async (req, res) => {
  try {
    let { sprintHours } = req.body;
    if (!sprintHours || typeof sprintHours !== "number" || sprintHours <= 0)
      return res.status(400).json({ error: "sprintHours must be a positive number." });

    let capacityWarning = null;
    if (sprintHours > MAX_SPRINT_HOURS) {
      capacityWarning = `Capacity capped at ${MAX_SPRINT_HOURS}h (requested ${sprintHours}h) to keep the Knapsack DP table within safe memory limits.`;
      sprintHours = MAX_SPRINT_HOURS;
    }

    const eligible = await Task.find({
      teamId:         req.params.teamId,
      status:         "todo",
      estimatedHours: { $ne: null, $gt: 0 },
      businessValue:  { $ne: null, $gt: 0 },
    }).lean();

    if (eligible.length === 0)
      return res.json({ selectedTasks: [], totalValue: 0, totalHours: 0,
        message: "No eligible tasks. Set estimatedHours and businessValue on backlog tasks." });

    const SCALE    = 10;
    const capacity = Math.floor(sprintHours * SCALE);
    const n        = eligible.length;
    const weights  = eligible.map((t) => Math.round(t.estimatedHours * SCALE));
    const values   = eligible.map((t) => t.businessValue);

    const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      const wi = weights[i - 1], vi = values[i - 1];
      for (let w = 0; w <= capacity; w++) {
        dp[i][w] = dp[i - 1][w];
        if (wi <= w) {
          const withItem = dp[i - 1][w - wi] + vi;
          if (withItem > dp[i][w]) dp[i][w] = withItem;
        }
      }
    }

    const selected = [];
    let w = capacity;
    for (let i = n; i >= 1; i--) {
      if (dp[i][w] !== dp[i - 1][w]) { selected.push(i - 1); w -= weights[i - 1]; }
    }

    const selectedTasks = selected.map((idx) => eligible[idx]);
    const totalHours    = selectedTasks.reduce((s, t) => s + t.estimatedHours, 0);

    res.json({
      selectedTasks,
      totalValue    : dp[n][capacity],
      totalHours    : Math.round(totalHours * 100) / 100,
      sprintCapacity: sprintHours,
      utilizationPct: Math.round((totalHours / sprintHours) * 100),
      algorithm     : "0/1 Knapsack (bottom-up DP)",
      complexity    : { time: "O(n * W)", space: "O(n * W)" },
      warning       : capacityWarning,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId/tasks/:taskId ────────────────────────────────────
// General task field updater (DAA inputs + task-management fields).
router.patch("/teams/:teamId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const allowed = [
      "estimatedHours", "businessValue", "status", "title", "description",
      "assignedTo", "urgency", "impact", "progress",
      "deadline", "startDate", "dueDate", "priorityLabel", "storyPoints",
      "category", "reminderAt",
    ];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // Keep completedAt accurate when status changes via REST.
    if (update.status === "done") update.completedAt = new Date();
    else if (update.status !== undefined) update.completedAt = null;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, teamId: req.params.teamId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId/tasks/:taskId ───────────────────────────────────
// Remove a task. Cleans up dangling dependency references, fixes counters, and
// recomputes the topological execution order (broadcast over sockets by client).
router.delete("/teams/:teamId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const task = await Task.findOneAndDelete({ _id: taskId, teamId });
    if (!task) return res.status(404).json({ error: "Task not found." });

    // Drop this task from any other task's dependency list.
    await Task.updateMany({ teamId, dependencies: taskId }, { $pull: { dependencies: taskId } });

    // Fix team counters.
    const dec = { taskCount: -1 };
    if (task.status === "done") dec.doneCount = -1;
    await Team.updateOne({ _id: teamId }, { $inc: dec });

    // Recompute execution order over what remains.
    const remaining = await Task.find({ teamId }).lean();
    const order = topologicalSort(remaining);
    const bulk  = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);

    const executionOrder = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ ok: true, deletedId: taskId, executionOrder });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/tasks/:taskId/duplicate ───────────────────────────
// Clone a task. Body: { cloneDependencies?: boolean }
router.post("/teams/:teamId/tasks/:taskId/duplicate", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const { cloneDependencies = false } = req.body ?? {};
    const src = await Task.findOne({ _id: taskId, teamId }).lean();
    if (!src) return res.status(404).json({ error: "Task not found." });

    const copy = await Task.create({
      teamId,
      title: `${src.title} (copy)`,
      description: src.description,
      status: "todo",
      urgency: src.urgency,
      impact: src.impact,
      estimatedHours: src.estimatedHours,
      businessValue: src.businessValue,
      storyPoints: src.storyPoints,
      deadline: src.deadline,
      startDate: src.startDate,
      dueDate: src.dueDate,
      priorityLabel: src.priorityLabel,
      category: src.category,
      reminderAt: src.reminderAt,
      skillWeights: src.skillWeights,
      source: src.source,
      dependencies: cloneDependencies ? (src.dependencies ?? []) : [],
      dependencyCount: cloneDependencies ? (src.dependencies?.length ?? 0) : 0,
      createdBy: req.user?.id,
    });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    res.status(201).json(copy.toObject());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/restore-backlog ───────────────────────────────────
// Restore the original AI-generated backlog: removes all current tasks and
// recreates them from team.aiGeneratedTasks. Keeps members, profiles, settings.
router.post("/teams/:teamId/restore-backlog", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });
    const seeds = team.aiGeneratedTasks ?? [];
    if (!seeds.length) return res.status(409).json({ error: "No AI backlog snapshot to restore." });

    await Task.deleteMany({ teamId });
    const restoredCount = await createSeededTasks(teamId, seeds);
    await Team.updateOne({ _id: teamId }, { $set: { taskCount: restoredCount, doneCount: 0 } });

    const tasks = await Task.find({ teamId }).sort({ priorityScore: -1 }).lean();
    res.json({ ok: true, restored: seeds.length, tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/health ─────────────────────────────────────────────
// Deterministic Workspace Health Score (0–100) with an explainable breakdown.
router.get("/teams/:teamId/health", requireAuth, async (req, res) => {
  try {
    const [tasks, team] = await Promise.all([
      Task.find({ teamId: req.params.teamId }).lean(),
      Team.findById(req.params.teamId).lean(),
    ]);
    res.json(computeHealthScore(tasks, team?.members ?? []));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/tasks/:taskId/priority ─────────────────────────────────────────
// Greedy Scheduler: update urgency/impact, hook recomputes priorityScore.
router.patch("/tasks/:taskId/priority", requireAuth, async (req, res) => {
  try {
    const { urgency, impact } = req.body ?? {};
    if (urgency === undefined && impact === undefined)
      return res.status(400).json({ error: "Provide urgency and/or impact." });

    const existing = await Task.findById(req.params.taskId).select("urgency impact dependencyCount").lean();
    if (!existing) return res.status(404).json({ error: "Task not found." });

    const task = await Task.findByIdAndUpdate(req.params.taskId, {
      urgency        : urgency ?? existing.urgency,
      impact         : impact  ?? existing.impact,
      dependencyCount: existing.dependencyCount,
    }, { new: true, runValidators: true, context: "query" }).lean();

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId/members/:userId/skills ───────────────────────────
// Branch & Bound: update a member's skill profile.
router.patch("/teams/:teamId/members/:userId/skills", requireAuth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const VALID = ["frontend", "backend", "devops", "design", "ml", "testing"];
    const setOps = {};
    for (const key of VALID) {
      if (req.body[key] !== undefined) {
        const val = Number(req.body[key]);
        if (val < 0 || val > 10) return res.status(400).json({ error: `${key} must be 0-10.` });
        setOps[`members.$.skills.${key}`] = val;
      }
    }
    if (!Object.keys(setOps).length) return res.status(400).json({ error: "No valid skill keys." });
    const result = await Team.updateOne({ _id: teamId, "members.userId": userId }, { $set: setOps });
    if (!result.matchedCount) return res.status(404).json({ error: "Team or member not found." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/assign ────────────────────────────────────────────
// Branch & Bound: optimal task-member assignment.
// Body: { taskIds?: string[], persist?: boolean }
router.post("/teams/:teamId/assign", requireAuth, async (req, res) => {
  try {
    const { teamId }                  = req.params;
    const { taskIds, persist = true } = req.body ?? {};

    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "Team not found." });
    const members = team.members ?? [];
    if (!members.length) return res.status(400).json({ error: "Team has no members with skill profiles." });

    // B&B needs differentiated skills; a uniform default matrix is meaningless.
    const hasSkillData = members.some((m) => Object.values(m.skills ?? {}).some((v) => v !== 5));
    if (!hasSkillData)
      return res.status(409).json({ error: "Assignment engine requires skill profiles. Set member skills (not all default 5) so Branch & Bound can compute a cost matrix." });

    const taskQuery = { teamId, status: { $ne: "done" } };
    if (Array.isArray(taskIds) && taskIds.length) taskQuery._id = { $in: taskIds };
    const tasks = await Task.find(taskQuery).lean();
    if (!tasks.length) return res.status(400).json({ error: "No eligible tasks." });

    const { assignments, totalCost, costMatrix, meta } = assignTasksToMembers(members, tasks);

    if (persist && assignments.length) {
      await Task.bulkWrite(assignments.map(({ taskId, memberId, cost }) => ({
        updateOne: { filter: { _id: taskId }, update: { $set: { assignedTo: memberId, assignmentCost: cost } } },
      })));
    }

    const memberMap = Object.fromEntries(members.map((m) => [m.userId.toString(), m]));
    const taskMap   = Object.fromEntries(tasks.map((t)  => [t._id.toString(), t]));
    const enriched  = assignments.map(({ taskId, memberId, cost }) => ({
      taskId, taskTitle: taskMap[taskId]?.title ?? taskId,
      memberId, memberName: memberMap[memberId]?.name ?? memberId, cost,
    }));

    res.json({ assignments: enriched, totalCost, costMatrix,
      memberLabels: members.map((m) => m.name ?? m.userId.toString()),
      taskLabels  : tasks.map((t) => t.title), meta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Input helpers ─────────────────────────────────────────────────────────────

const SKILL_KEYS = ["frontend", "backend", "devops", "design", "ml", "testing"];

// Clamp a skill object to valid 0–10 ints; missing keys default to 5 (neutral).
function normalizeSkills(skills) {
  const out = {};
  for (const key of SKILL_KEYS) {
    const v = Number(skills?.[key]);
    out[key] = Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v))) : 5;
  }
  return out;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Pure algorithm helpers ────────────────────────────────────────────────────

function buildAdjacencyList(tasks) {
  const adj = {};
  for (const t of tasks) {
    const id = t._id.toString();
    adj[id] = adj[id] ?? [];
    for (const dep of t.dependencies ?? []) {
      const depId = dep.toString();
      adj[depId] = adj[depId] ?? [];
      adj[depId].push(id);
    }
  }
  return adj;
}

// DFS 3-colour cycle detection. Time: O(V + E)
function hasCycle(adj, nodes) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = {};
  for (const n of nodes) colour[n] = WHITE;
  function visit(u) {
    colour[u] = GRAY;
    for (const v of adj[u] ?? []) {
      if (colour[v] === GRAY) return true;
      if (colour[v] === WHITE && visit(v)) return true;
    }
    colour[u] = BLACK;
    return false;
  }
  for (const n of nodes) {
    if (colour[n] === WHITE && visit(n)) return true;
  }
  return false;
}

// Topological order of task ids. Delegates to the CANONICAL Kahn's sort in
// graphTraversal.js so this route returns ordering identical to the
// /dependency-graph API and the socket recompute. (No stale local copy.)
function topologicalSort(tasks) {
  const { adjList, inDegree } = buildGraph(tasks);
  return topoSortGraph(adjList, inDegree).order;
}

// Create starter tasks AND wire inter-phase dependencies (phase N depends on the
// first task of phase N-1) so the dependency graph is connected and the
// topological roadmap is meaningful. Recomputes topoOrder afterwards.
async function createSeededTasks(teamId, seeds) {
  const created = [];
  for (const d of seeds) {
    const { phaseIndex = 0, ...fields } = d;
    const t = await Task.create({ teamId, source: "ai", ...fields });
    created.push({ id: t._id, phaseIndex });
  }

  const byPhase = new Map();
  for (const c of created) {
    if (!byPhase.has(c.phaseIndex)) byPhase.set(c.phaseIndex, []);
    byPhase.get(c.phaseIndex).push(c.id);
  }

  const depBulk = [];
  for (const c of created) {
    if (c.phaseIndex > 0 && byPhase.has(c.phaseIndex - 1)) {
      const prev = byPhase.get(c.phaseIndex - 1)[0];
      depBulk.push({ updateOne: { filter: { _id: c.id }, update: { $set: { dependencies: [prev], dependencyCount: 1 } } } });
    }
  }
  if (depBulk.length) await Task.bulkWrite(depBulk, { ordered: false });

  const all = await Task.find({ teamId }).lean();
  const order = topologicalSort(all);
  const topoBulk = order.map((id, idx) => ({ updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } } }));
  if (topoBulk.length) await Task.bulkWrite(topoBulk, { ordered: false });

  return created.length;
}

// ── Workspace Health Score ────────────────────────────────────────────────────
// Deterministic 0–100 score from five weighted factors. Pure function so the
// same task set always yields the same score (safe for tests + UI parity).
export function computeHealthScore(tasks, members = []) {
  const total = tasks.length;
  if (total === 0) {
    return { score: 100, grade: "A+", total: 0, factors: [], counts: {}, summary: "No tasks yet — start by generating a backlog." };
  }

  const doneTasks = tasks.filter((t) => t.status === "done");
  const doneIds   = new Set(doneTasks.map((t) => t._id.toString()));
  const active    = tasks.filter((t) => t.status !== "done");
  const inProg    = tasks.filter((t) => t.status === "in_progress").length;
  const done      = doneTasks.length;
  const now       = Date.now();

  // 1. Completion Rate.
  const completionRate = done / total;

  // 2. Deadline Performance = completed-before-deadline / completed.
  //    (updatedAt is the completion proxy; a completed task with no due date
  //     can't be late, so it counts as on-time.)
  let onTimeDone = 0;
  for (const t of doneTasks) {
    const due = t.dueDate ?? t.deadline;
    if (!due) { onTimeDone++; continue; }
    // Prefer the accurate completedAt timestamp; fall back to updatedAt for legacy docs.
    const finishedAt = t.completedAt ? new Date(t.completedAt).getTime()
      : t.updatedAt ? new Date(t.updatedAt).getTime() : now;
    if (finishedAt <= new Date(due).getTime()) onTimeDone++;
  }
  const deadlinePerformance = done ? onTimeDone / done : 1;

  // 3. Dependency Completion = completed dependency edges / total edges.
  let depEdges = 0, depSatisfied = 0;
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      depEdges++;
      if (doneIds.has(dep.toString())) depSatisfied++;
    }
  }
  const dependencyCompletion = depEdges ? depSatisfied / depEdges : 1;

  // 4. Assignment Coverage = assigned tasks / total tasks.
  const assigned = tasks.filter((t) => t.assignedTo).length;
  const assignmentCoverage = assigned / total;

  // 5. Sprint Utilization = planned active hours / team capacity (real values).
  const sprintCapacity = members.reduce((s, m) => s + (Number(m.capacity) || 40), 0) || 40;
  const plannedHours   = active.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
  const sprintUtilization = Math.min(1, plannedHours / sprintCapacity);

  const overdue = active.filter((t) => { const d = t.dueDate ?? t.deadline; return d && new Date(d).getTime() < now; }).length;

  const parts = [
    { key: "completion",  weight: 30, value: completionRate,        label: "Completion Rate" },
    { key: "deadline",    weight: 20, value: deadlinePerformance,   label: "Deadline Success" },
    { key: "dependency",  weight: 20, value: dependencyCompletion,  label: "Dependencies" },
    { key: "assignment",  weight: 15, value: assignmentCoverage,    label: "Assignments" },
    { key: "utilization", weight: 15, value: sprintUtilization,     label: "Sprint Utilization" },
  ];

  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D";

  return {
    score,
    grade,
    total,
    counts: {
      done, inProgress: inProg, overdue, assigned, active: active.length,
      depTotal: depEdges, depDone: depSatisfied,
      plannedHours, sprintCapacity,
    },
    factors: parts.map((p) => ({ key: p.key, label: p.label, weight: p.weight, pct: Math.round(p.value * 100) })),
    summary: `Health ${score}/100 (grade ${grade}). ${done}/${total} done · ${onTimeDone}/${done} on-time · ${depSatisfied}/${depEdges} deps · ${assigned}/${total} assigned · ${plannedHours}/${sprintCapacity}h.`,
  };
}

function buildEdgeList(tasks) {
  const edges = [];
  for (const t of tasks) {
    for (const depId of t.dependencies ?? []) {
      edges.push({ from: depId.toString(), to: t._id.toString() });
    }
  }
  return edges;
}

export default router;
