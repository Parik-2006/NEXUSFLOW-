import { Router } from "express";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import { requireAuth } from "../auth.js";
import { mergeSortTasks, compareSortAlgorithms } from "../utils/sortAlgorithms.js";

const router = Router();

// Above this size, skip Bubble Sort in the live comparison (O(n^2) becomes
// too slow to run on every request) — the dashboard will show the last
// cached comparison instead.
const MAX_COMPARISON_SIZE = 500;

// Hydrate: list teams with progress counts.
router.get("/teams", requireAuth, async (_req, res) => {
  const teams = await Team.find().lean();
  res.json(teams);
});

// Hydrate: tasks for a team (snapshot before socket subscribe).
// DAA: tasks are now ordered using Merge Sort (O(n log n)) by priority,
// falling back to recency — replaces the previous Mongo-level sort so the
// ordering logic is explicit, deterministic, and reusable for analytics.
router.get("/teams/:teamId/tasks", requireAuth, async (req, res) => {
  const tasks = await Task.find({ teamId: req.params.teamId }).lean();
  const { sorted } = mergeSortTasks(tasks);
  res.json(sorted);
});

// DAA: Task Analytics Engine — Bubble Sort vs Merge Sort comparison.
// Returns execution metrics (time, comparisons, swaps) for both algorithms
// run over the team's current task set, plus the merge-sorted result.
router.get("/teams/:teamId/tasks/analytics", requireAuth, async (req, res) => {
  const tasks = await Task.find({ teamId: req.params.teamId }).lean();

  if (tasks.length > MAX_COMPARISON_SIZE) {
    const { sorted } = mergeSortTasks(tasks);
    return res.json({
      n: tasks.length,
      skippedBubbleSort: true,
      reason: `n exceeds ${MAX_COMPARISON_SIZE}; Bubble Sort O(n^2) skipped for performance`,
      mergeSort: { complexity: "O(n log n)" },
      sorted,
    });
  }

  const result = compareSortAlgorithms(tasks);
  res.json(result);
});

export default router;

