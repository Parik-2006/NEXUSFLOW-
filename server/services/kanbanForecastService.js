/**
 * server/services/kanbanForecastService.js
 * ============================================================================
 * NEXUSFLOW V4 — SLE & FLOW FORECASTING ENGINE (Prompt 14)
 *
 * Empirical percentile forecasting (50th, 85th, 95th) from actual completed
 * task history. Identifies flow risks without presenting forecasts as certainty.
 * ============================================================================
 */

/**
 * Calculate empirical percentile from a sorted array of numbers
 */
function getPercentile(sortedArray, percentile) {
  if (!sortedArray || sortedArray.length === 0) return null;
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return parseFloat((sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight).toFixed(2));
}

/**
 * Generate empirical cycle time distribution & forecast for active work
 */
export function calculateFlowForecast(tasks = [], options = {}) {
  const defaultSleDays = options.sleTargetDays || 4;
  const now = new Date();

  // Completed items with valid cycle times
  const completedTasks = tasks.filter((t) => {
    return t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
  });

  const cycleTimesDays = [];
  for (const t of completedTasks) {
    const doneTime = t.doneAt ? new Date(t.doneAt).getTime() : new Date(t.updatedAt || now).getTime();
    const startTime = t.readyAt ? new Date(t.readyAt).getTime() : t.activeStartedAt ? new Date(t.activeStartedAt).getTime() : new Date(t.createdAt || now).getTime();
    const days = Math.max(0.1, parseFloat(((doneTime - startTime) / (24 * 3600 * 1000)).toFixed(2)));
    cycleTimesDays.push(days);
  }

  const sortedCycles = [...cycleTimesDays].sort((a, b) => a - b);
  const sampleSize = sortedCycles.length;
  const hasSufficientHistory = sampleSize >= 5;

  let p50 = null;
  let p85 = null;
  let p95 = null;

  if (sampleSize > 0) {
    p50 = getPercentile(sortedCycles, 50);
    p85 = getPercentile(sortedCycles, 85);
    p95 = getPercentile(sortedCycles, 95);
  } else {
    // Default baseline heuristics if no completed items yet
    p50 = defaultSleDays * 0.65;
    p85 = defaultSleDays;
    p95 = defaultSleDays * 1.5;
  }

  // Active items analysis against percentiles
  const activeTasks = tasks.filter((t) => {
    const isDone = t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
    const isBacklog = (!t.kanbanStatus || t.kanbanStatus === "BACKLOG") && (!t.workflowColumn || t.workflowColumn === "backlog");
    return !isDone && !isBacklog;
  });

  const itemForecasts = activeTasks.map((t) => {
    const start = t.activeStartedAt || t.readyAt || t.createdAt || now;
    const ageDays = parseFloat(((now.getTime() - new Date(start).getTime()) / (24 * 3600 * 1000)).toFixed(2));

    let riskSignal = "NORMAL";
    let riskExplanation = "Age is within expected flow tolerance.";

    if (p95 && ageDays > p95) {
      riskSignal = "CRITICAL_OUTLIER";
      riskExplanation = `Current age (${ageDays}d) exceeds 95th percentile (${p95}d). High risk of delay or unmanaged impediment.`;
    } else if (p85 && ageDays > p85) {
      riskSignal = "ELEVATED_RISK";
      riskExplanation = `Current age (${ageDays}d) exceeds 85th percentile SLE baseline (${p85}d). Expedited review or swarming recommended.`;
    } else if (p50 && ageDays > p50) {
      riskSignal = "WATCH";
      riskExplanation = `Current age (${ageDays}d) is beyond the 50th percentile median (${p50}d).`;
    }

    return {
      taskId: t._id,
      title: t.title,
      column: t.workflowColumn || t.kanbanStatus || "in_progress",
      classOfService: t.classOfService || "standard",
      currentAgeDays: ageDays,
      expectedCompletionWindowDays: {
        median: p50 ? Math.max(0.1, parseFloat((p50 - ageDays).toFixed(1))) : null,
        p85Confidence: p85 ? Math.max(0.1, parseFloat((p85 - ageDays).toFixed(1))) : null,
      },
      riskSignal,
      riskExplanation,
    };
  });

  return {
    sampleSize,
    hasSufficientHistory,
    disclaimer: "Empirical flow forecasts represent probabilistic historical percentiles, not fixed contractual commitments.",
    percentiles: {
      p50Days: p50,
      p85Days: p85,
      p95Days: p95,
      sleTargetDays: defaultSleDays,
    },
    activeItemsCount: activeTasks.length,
    itemForecasts,
    highRiskItemCount: itemForecasts.filter((i) => i.riskSignal === "ELEVATED_RISK" || i.riskSignal === "CRITICAL_OUTLIER").length,
  };
}
