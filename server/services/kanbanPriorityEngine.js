/**
 * server/services/kanbanPriorityEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — DYNAMIC KANBAN PRIORITY ENGINE (Prompt 8)
 *
 * Deterministic, flow-aware priority calculation combining Cost of Delay,
 * deadline urgency, dependency impact, class of service, and teacher importance.
 *
 * DAA / AI Separation:
 *   - DAA calculates deterministic priority score and factor breakdown.
 *   - AI explains or summarizes, but NEVER alters the score.
 * ============================================================================
 */

/**
 * Calculate deterministic Kanban priority score for a work item
 */
export function calculateKanbanPriority(task, context = {}) {
  if (!task) return context.detailed ? { score: 0, priority: 0, tier: "LOW", factors: {}, explanation: "No task data" } : 0;

  // 1. Business Value Factor (0-100)
  const rawValue = task.businessValue !== undefined ? task.businessValue : (task.impact !== undefined ? task.impact : 3);
  const valueScore = rawValue > 10 ? Math.min(100, Math.max(0, rawValue)) : Math.min(100, Math.max(0, (rawValue / 10) * 100));

  // 2. Deadline Urgency / Cost of Delay (0-100)
  let urgencyScore = 30; // default baseline
  if (task.urgencyScore !== undefined) {
    urgencyScore = Math.min(100, Math.max(0, task.urgencyScore));
  } else if (task.dueDate || task.deadline) {
    const targetDate = new Date(task.dueDate || task.deadline);
    const now = new Date();
    const diffDays = (targetDate.getTime() - now.getTime()) / (1000 * 3600 * 24);

    if (diffDays <= 0) {
      urgencyScore = 100; // overdue
    } else if (diffDays <= 1) {
      urgencyScore = 95;
    } else if (diffDays <= 3) {
      urgencyScore = 80;
    } else if (diffDays <= 7) {
      urgencyScore = 60;
    } else if (diffDays <= 14) {
      urgencyScore = 40;
    } else {
      urgencyScore = 20;
    }
  } else if (task.urgency !== undefined) {
    urgencyScore = task.urgency > 10 ? Math.min(100, task.urgency) : Math.min(100, Math.max(10, (task.urgency / 5) * 100));
  }

  // 3. Dependency Importance / Blocking Potential (0-100)
  const blockingCount = task.blockingPotential || (Array.isArray(task.dependents) ? task.dependents.length : 0);
  const dependencyScore = Math.min(100, blockingCount * 25);

  // 4. Teacher Importance Factor (0-100)
  const rawTeacher = task.teacherImportance !== undefined ? task.teacherImportance : (context.teacherFactor ?? 5);
  const teacherScore = rawTeacher > 10 ? Math.min(100, Math.max(0, rawTeacher)) : Math.min(100, Math.max(0, (rawTeacher / 10) * 100));

  // 5. Technical Uncertainty / De-risking (0-100)
  const uncertaintyRaw = task.technicalUncertainty !== undefined ? task.technicalUncertainty : 3;
  const uncertaintyScore = uncertaintyRaw > 10 ? Math.min(100, uncertaintyRaw) : Math.min(100, (uncertaintyRaw / 10) * 100);

  // 6. Class of Service Weight Multiplier
  const cos = (task.classOfService || "standard").toLowerCase();
  let cosMultiplier = 1.0;
  if (cos === "expedite") cosMultiplier = 1.6;
  else if (cos === "fixed_date") cosMultiplier = 1.35;
  else if (cos === "improvement") cosMultiplier = 0.85;

  // Weighted base combination:
  // Value: 25%, Urgency (Cost of Delay): 30%, Blocking: 20%, Teacher: 15%, Uncertainty: 10%
  const baseScore =
    valueScore * 0.25 +
    urgencyScore * 0.30 +
    dependencyScore * 0.20 +
    teacherScore * 0.15 +
    uncertaintyScore * 0.10;

  // Apply Class of Service scaling and clamp
  const finalScore = Math.min(100, Math.max(5, Math.round(baseScore * cosMultiplier)));

  if (!context.detailed) {
    return finalScore;
  }

  // Tier assignment
  let tier = "LOW";
  if (finalScore >= 80) tier = "CRITICAL";
  else if (finalScore >= 60) tier = "HIGH";
  else if (finalScore >= 40) tier = "MEDIUM";

  // Build transparent factor explanation
  const factorExplanations = [];
  if (cos === "expedite") factorExplanations.push("Expedite class multiplier applied (+60% weight)");
  if (urgencyScore >= 80) factorExplanations.push("High deadline proximity / cost of delay");
  if (dependencyScore >= 50) factorExplanations.push(`Blocks ${blockingCount} downstream work items`);
  if (valueScore >= 75) factorExplanations.push("High business impact");
  if (teacherScore >= 80) factorExplanations.push("Academic / faculty evaluation milestone requirement");

  const explanation = factorExplanations.length > 0
    ? factorExplanations.join("; ") + "."
    : "Standard flow priority ranking based on balanced effort and value.";

  return {
    score: finalScore,
    priority: finalScore,
    tier,
    factors: {
      businessValue: Math.round(valueScore),
      urgency: Math.round(urgencyScore),
      dependencyImpact: Math.round(dependencyScore),
      teacherImportance: Math.round(teacherScore),
      technicalUncertainty: Math.round(uncertaintyScore),
      classOfService: cos,
      cosMultiplier,
    },
    explanation,
  };
}

/**
 * Deterministically rank backlog items for replenishment
 */
export function rankBacklogCandidates(tasks = [], context = {}) {
  const scored = tasks.map((t) => {
    const priority = calculateKanbanPriority(t, context);
    const scoreVal = typeof priority === "number" ? priority : (priority.score || 0);
    return {
      task: t,
      score: scoreVal,
      priority: scoreVal,
      tier: scoreVal >= 80 ? "CRITICAL" : scoreVal >= 60 ? "HIGH" : scoreVal >= 40 ? "MEDIUM" : "LOW",
      factors: typeof priority === "object" ? priority.factors : {},
      explanation: typeof priority === "object" ? priority.explanation : "",
    };
  });

  // Sort descending by score, tie-break by oldest creation date or ID
  scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aTime = new Date(a.task.createdAt || 0).getTime();
    const bTime = new Date(b.task.createdAt || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
  });

  return scored;
}
