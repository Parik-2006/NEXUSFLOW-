/**
 * server/services/learningService.js
 * NEXUSFLOW 3.0 — Phase 16: Learning Loop Pattern Insight Engine (deterministic, $0)
 */

import Task from "../models/Task.js";
import Retrospective from "../models/Retrospective.js";
import LearningInsight from "../models/LearningInsight.js";
import { logger } from "../utils/logger.js";

/**
 * generateInsights(projectId, teamId)
 * Analyzes historical retrospective and task data to surface recurring patterns.
 */
export async function generateInsights(projectId, teamId) {
  const retros = await Retrospective.find({ projectId }).sort({ createdAt: 1 }).lean();
  const allTasks = await Task.find({ projectId }).lean();
  const insights = [];

  // ── 1. Sprint Velocity Trend ────────────────────────────────────────────────
  if (retros.length >= 2) {
    const rates = retros.map((r) => r.taskStats?.completionRate ?? 0);
    const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
    const trend = rates[rates.length - 1] - rates[0];

    insights.push({
      type: "sprint_velocity",
      insight: `Sprint completion rate has averaged ${Math.round(avg)}% across ${retros.length} sprints.`,
      evidence: { rates, trend: trend > 0 ? "improving" : trend < 0 ? "declining" : "stable" },
      recommendation:
        avg < 70
          ? "Consider reducing sprint scope. Historical data shows the team consistently completes less than planned."
          : "Sprint velocity is healthy. Continue current planning approach.",
      dataPoints: retros.length,
      confidence: Math.min(0.5 + retros.length * 0.1, 0.9),
    });
  }

  // ── 2. Deadline Accuracy by Category ───────────────────────────────────────
  const doneTasks = allTasks.filter((t) => t.status === "done" && t.dueDate && t.updatedAt);
  const categoryBuckets = {};
  for (const t of doneTasks) {
    const cat = t.category || "general";
    if (!categoryBuckets[cat]) categoryBuckets[cat] = { onTime: 0, total: 0 };
    const wasOnTime = new Date(t.updatedAt) <= new Date(t.dueDate);
    categoryBuckets[cat].total++;
    if (wasOnTime) categoryBuckets[cat].onTime++;
  }
  for (const [cat, stats] of Object.entries(categoryBuckets)) {
    if (stats.total >= 3) {
      const rate = stats.onTime / stats.total;
      insights.push({
        type: "deadline_accuracy",
        insight: `${cat.charAt(0).toUpperCase() + cat.slice(1)} tasks are ${rate >= 0.7 ? "mostly completed on time" : `frequently late — only ${Math.round(rate * 100)}% of ${stats.total} tasks completed on time`}.`,
        evidence: { category: cat, onTimeRate: rate, total: stats.total },
        recommendation:
          rate < 0.7
            ? `Add a 20% buffer to estimated hours for ${cat} tasks. Consider reviewing scope before committing.`
            : `Keep the current approach for ${cat} tasks — it's working well.`,
        dataPoints: stats.total,
        confidence: Math.min(0.5 + stats.total * 0.05, 0.9),
      });
    }
  }

  // ── 3. Estimation Accuracy ───────────────────────────────────────────────────
  const tasksWithEstimate = allTasks.filter(
    (t) => t.status === "done" && t.estimatedHours && t.actualHours && t.actualHours > 0
  );
  if (tasksWithEstimate.length >= 3) {
    const ratios = tasksWithEstimate.map((t) => t.actualHours / t.estimatedHours);
    const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    insights.push({
      type: "task_duration",
      insight: `Tasks take approximately ${Math.round(avgRatio * 100)}% longer than estimated on average.`,
      evidence: { avgRatio, sampleSize: tasksWithEstimate.length },
      recommendation:
        avgRatio > 1.2
          ? `Multiply your time estimates by ${avgRatio.toFixed(1)} to get more realistic deadlines. Or reduce hours estimate inputs systematically.`
          : "Estimation accuracy is solid — estimates are within a reasonable range of actuals.",
      dataPoints: tasksWithEstimate.length,
      confidence: Math.min(0.5 + tasksWithEstimate.length * 0.05, 0.9),
    });
  }

  // ── 4. Capacity Over-commitment ──────────────────────────────────────────────
  if (retros.length >= 2) {
    const overCommittedSprints = retros.filter((r) => (r.taskStats?.completionRate ?? 100) < 70).length;
    if (overCommittedSprints >= 1) {
      insights.push({
        type: "capacity_trend",
        insight: `${overCommittedSprints} of ${retros.length} sprints were over-committed (completion < 70%).`,
        evidence: { overCommittedSprints, totalSprints: retros.length },
        recommendation:
          "Use the 0/1 Knapsack optimizer to automatically limit sprint scope to realistic capacity.",
        dataPoints: retros.length,
        confidence: Math.min(0.5 + overCommittedSprints * 0.15, 0.9),
      });
    }
  }

  if (insights.length === 0) return [];

  // Stale any previous insights for this project
  await LearningInsight.updateMany({ projectId }, { $set: { isStale: true } });

  const saved = await LearningInsight.insertMany(
    insights.map((i) => ({ ...i, projectId, teamId }))
  );

  logger.info("[learningService] Insights generated", {
    projectId: projectId.toString(),
    count: saved.length,
  });

  return saved;
}
