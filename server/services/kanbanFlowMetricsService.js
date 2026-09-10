/**
 * server/services/kanbanFlowMetricsService.js
 * ============================================================================
 * NEXUSFLOW V4 — FLOW METRICS ENGINE & WAITING ANALYSIS (Prompts 12, 18)
 *
 * Calculates throughput, cycle time, lead time, flow efficiency, active vs waiting,
 * blocked duration, and SLE attainment from actual persistent timestamps.
 * ============================================================================
 */

/**
 * Compute all deterministic flow metrics for a Kanban project
 */
export function calculateFlowMetrics(tasks = [], options = {}) {
  const sleTargetDays = options.sleTargetDays || 4;
  const now = new Date();

  // Partition tasks into completed and active
  const completedTasks = tasks.filter((t) => {
    return t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
  });

  const activeTasks = tasks.filter((t) => {
    const isDone = t.kanbanStatus === "DONE" || t.status === "done" || t.workflowColumn === "done";
    const isBacklog = (!t.kanbanStatus || t.kanbanStatus === "BACKLOG") && (!t.workflowColumn || t.workflowColumn === "backlog");
    return !isDone && !isBacklog;
  });

  const backlogTasks = tasks.filter((t) => {
    return (!t.kanbanStatus || t.kanbanStatus === "BACKLOG") && (!t.workflowColumn || t.workflowColumn === "backlog");
  });

  // 1. Throughput Calculation (completed items over last 7d, 14d, 30d)
  const ms7d = 7 * 24 * 3600 * 1000;
  const ms14d = 14 * 24 * 3600 * 1000;
  const ms30d = 30 * 24 * 3600 * 1000;

  let throughput7d = 0;
  let throughput14d = 0;
  let throughput30d = 0;

  const cycleTimesDays = [];
  const leadTimesDays = [];
  let withinSleCount = 0;

  // Aggregate time buckets across completed work
  let totalActiveMs = 0;
  let totalWaitingMs = 0;
  let totalBlockedMs = 0;
  let totalReviewMs = 0;

  for (const t of completedTasks) {
    const doneTime = t.doneAt ? new Date(t.doneAt).getTime() : new Date(t.updatedAt || t.completedAt || now).getTime();
    const createdTime = new Date(t.createdAt || now).getTime();
    const startTime = t.readyAt ? new Date(t.readyAt).getTime() : t.activeStartedAt ? new Date(t.activeStartedAt).getTime() : createdTime;

    const ageSinceDone = now.getTime() - doneTime;
    if (ageSinceDone <= ms7d) throughput7d++;
    if (ageSinceDone <= ms14d) throughput14d++;
    if (ageSinceDone <= ms30d) throughput30d++;

    // Cycle time in days (Ready/Active -> Done)
    const cycleMs = Math.max(0, doneTime - startTime);
    const cycleDays = parseFloat((cycleMs / (24 * 3600 * 1000)).toFixed(2));
    cycleTimesDays.push(cycleDays);

    // Lead time in days (Created -> Done)
    const leadMs = Math.max(0, doneTime - createdTime);
    const leadDays = parseFloat((leadMs / (24 * 3600 * 1000)).toFixed(2));
    leadTimesDays.push(leadDays);

    // SLE Attainment
    if (cycleDays <= sleTargetDays) {
      withinSleCount++;
    }

    // Time breakdowns
    const blockedMs = t.totalBlockedDurationMs || 0;
    const reviewMs = t.totalReviewDurationMs || (t.reviewStartedAt ? Math.max(0, doneTime - new Date(t.reviewStartedAt).getTime()) : 0);
    const activeMs = t.totalActiveDurationMs || Math.max(0, cycleMs - blockedMs - reviewMs);
    const waitingMs = t.totalWaitingDurationMs || 0;

    totalActiveMs += activeMs;
    totalWaitingMs += waitingMs;
    totalBlockedMs += blockedMs;
    totalReviewMs += reviewMs;
  }

  // Medians and Averages
  const hasHistory = completedTasks.length > 0;
  const sortedCycles = [...cycleTimesDays].sort((a, b) => a - b);
  const medianCycleTime = hasHistory
    ? sortedCycles[Math.floor(sortedCycles.length / 2)]
    : null;
  const averageCycleTime = hasHistory
    ? parseFloat((cycleTimesDays.reduce((a, b) => a + b, 0) / cycleTimesDays.length).toFixed(2))
    : null;

  const sortedLeads = [...leadTimesDays].sort((a, b) => a - b);
  const medianLeadTime = hasHistory
    ? sortedLeads[Math.floor(sortedLeads.length / 2)]
    : null;

  // Flow Efficiency Ratio
  const totalFlowMs = totalActiveMs + totalWaitingMs + totalBlockedMs + totalReviewMs;
  let flowEfficiency = 100;
  if (totalFlowMs > 0) {
    flowEfficiency = Math.min(100, Math.max(5, Math.round((totalActiveMs / totalFlowMs) * 100)));
  }

  // SLE Attainment Rate
  const sleAttainmentRate = hasHistory
    ? Math.round((withinSleCount / completedTasks.length) * 100)
    : 100;

  // Active WIP items analysis (current age & blocked states)
  const activeWipAging = activeTasks.map((t) => {
    const started = t.activeStartedAt || t.readyAt || t.createdAt;
    const ageMs = now.getTime() - new Date(started).getTime();
    const ageDays = parseFloat((ageMs / (24 * 3600 * 1000)).toFixed(2));
    return {
      taskId: t._id,
      title: t.title,
      column: t.workflowColumn || t.kanbanStatus || "in_progress",
      ageDays,
      isAging: ageDays > (options.agingWarningDays || 3),
      isCriticalAging: ageDays > (options.agingCriticalDays || 6),
      isBlocked: Boolean(t.isBlocked || (Array.isArray(t.blockers) && t.blockers.some((b) => b.status !== "RESOLVED"))),
    };
  });

  return {
    hasHistory,
    totalCompleted: completedTasks.length,
    activeWipCount: activeTasks.length,
    backlogCount: backlogTasks.length,
    throughput: {
      itemsLast7Days: throughput7d,
      itemsLast14Days: throughput14d,
      itemsLast30Days: throughput30d,
      last7Days: throughput7d,
      last14Days: throughput14d,
      last30Days: throughput30d,
      perWeek: parseFloat((throughput14d / 2).toFixed(1)),
      total: completedTasks.length,
      averageWeekly: parseFloat((throughput14d / 2).toFixed(1)),
    },
    cycleTime: {
      medianDays: medianCycleTime,
      averageDays: averageCycleTime,
      samples: cycleTimesDays.length,
    },
    leadTime: {
      medianDays: medianLeadTime,
      samples: leadTimesDays.length,
    },
    flowEfficiency: {
      percentage: flowEfficiency,
      activeHours: parseFloat((totalActiveMs / 3600000).toFixed(1)),
      waitingHours: parseFloat((totalWaitingMs / 3600000).toFixed(1)),
      blockedHours: parseFloat((totalBlockedMs / 3600000).toFixed(1)),
      reviewHours: parseFloat((totalReviewMs / 3600000).toFixed(1)),
    },
    sle: {
      targetDays: sleTargetDays,
      attainmentRate: sleAttainmentRate,
      withinTargetCount: withinSleCount,
      totalEvaluated: completedTasks.length,
    },
    activeWipAging,
  };
}
