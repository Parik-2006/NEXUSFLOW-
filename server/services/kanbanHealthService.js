/**
 * server/services/kanbanHealthService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN PROJECT HEALTH ENGINE (Prompt 32)
 *
 * Deterministic composite health score combining Flow, WIP, Dependency,
 * Blocker, Team Workload, and SLE attainment signals.
 * ============================================================================
 */

/**
 * Calculate comprehensive Kanban Project Health
 */
export function calculateKanbanHealth({
  flowMetrics = {},
  columnWip = {},
  bottlenecks = {},
  blockerData = {},
  dependencyData = {},
  personalWip = [],
} = {}) {
  // 1. Flow Health (Efficiency & Movement) — weight: 20%
  const efficiency = flowMetrics.flowEfficiency?.percentage ?? 80;
  const flowScore = Math.min(100, Math.max(10, efficiency));

  // 2. WIP Health (Adherence & Saturation) — weight: 20%
  let wipViolations = 0;
  let totalColumns = 0;
  for (const c of Object.values(columnWip)) {
    if (!c.isDoneColumn && c.limit > 0) {
      totalColumns++;
      if (c.isOverloaded) wipViolations += 2;
      else if (c.isSaturated) wipViolations += 0.5;
    }
  }
  const wipScore = Math.min(100, Math.max(10, Math.round(100 - (wipViolations * 20))));

  // 3. Blocker Health — weight: 20%
  const activeBlockers = blockerData.totalActive ?? 0;
  let blockerPenalty = 0;
  if (Array.isArray(blockerData.active)) {
    for (const b of blockerData.active) {
      if (b.severity === "critical") blockerPenalty += 25;
      else if (b.severity === "high") blockerPenalty += 15;
      else blockerPenalty += 8;
    }
  } else {
    blockerPenalty = activeBlockers * 15;
  }
  const blockerScore = Math.min(100, Math.max(5, 100 - blockerPenalty));

  // 4. Dependency Health — weight: 15%
  const blockedFromPull = dependencyData.blockedFromPullCount ?? 0;
  const depScore = Math.min(100, Math.max(15, 100 - (blockedFromPull * 15)));

  // 5. Team Workload Health — weight: 15%
  let overloadedMembers = 0;
  if (Array.isArray(personalWip) && personalWip.length > 0) {
    for (const m of personalWip) {
      if (m.isOverloaded) overloadedMembers++;
    }
    var teamScore = Math.min(100, Math.max(20, 100 - (overloadedMembers * 30)));
  } else {
    var teamScore = 90; // baseline if solo or no personal WIP
  }

  // 6. SLE Health — weight: 10%
  const sleAttainment = flowMetrics.sle?.attainmentRate ?? 90;
  const sleScore = Math.min(100, Math.max(10, sleAttainment));

  // Composite Weighted Calculation
  const overall = Math.round(
    flowScore * 0.20 +
    wipScore * 0.20 +
    blockerScore * 0.20 +
    depScore * 0.15 +
    teamScore * 0.15 +
    sleScore * 0.10
  );

  let grade = "NEEDS_ATTENTION";
  let status = "Needs Attention";
  if (overall >= 85) {
    grade = "EXCELLENT";
    status = "Flowing smoothly";
  } else if (overall >= 70) {
    grade = "GOOD";
    status = "Stable continuous flow";
  } else if (overall < 50) {
    grade = "CRITICAL";
    status = "Severe flow impediment";
  }

  // Identify top primary drag factor
  const factors = [
    { name: "Flow Efficiency", score: flowScore },
    { name: "WIP Discipline", score: wipScore },
    { name: "Blocker Resolution", score: blockerScore },
    { name: "Dependency Health", score: depScore },
    { name: "Team Workload", score: teamScore },
    { name: "SLE Attainment", score: sleScore },
  ];
  factors.sort((a, b) => a.score - b.score);
  const primaryDrag = factors[0];

  return {
    overall,
    grade,
    status,
    primaryDrag: primaryDrag.score < 75 ? primaryDrag.name : null,
    subScores: {
      flow: flowScore,
      wip: wipScore,
      blockers: blockerScore,
      dependencies: depScore,
      team: teamScore,
      sle: sleScore,
    },
    lastCalculatedAt: new Date(),
  };
}
