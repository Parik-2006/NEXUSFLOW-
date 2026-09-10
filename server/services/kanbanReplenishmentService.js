/**
 * server/services/kanbanReplenishmentService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN REPLENISHMENT & QUALITY ENGINE (Prompts 7, 21)
 *
 * Deterministic candidate ranking, Definition of Ready validation, and quality
 * analysis for continuous backlog replenishment.
 * ============================================================================
 */

import { calculateKanbanPriority, rankBacklogCandidates } from "./kanbanPriorityEngine.js";
import { checkDefinitionOfReady } from "./kanbanMethodologyService.js";

/**
 * Inspect a backlog task for refinement quality issues
 */
export function analyzeBacklogQuality(task) {
  const issues = [];
  let qualityScore = 100;

  // 1. Description length & detail
  const desc = task.description || task.userStory || "";
  if (!desc.trim()) {
    issues.push("Missing description or user story.");
    qualityScore -= 35;
  } else if (desc.trim().length < 20) {
    issues.push("Description is very brief / vague.");
    qualityScore -= 15;
  }

  // 2. Acceptance criteria
  if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
    issues.push("Missing measurable acceptance criteria.");
    qualityScore -= 25;
  }

  // 3. Estimation / sizing
  const hours = task.estimatedHours;
  const points = task.storyPoints;
  if (!hours && !points) {
    issues.push("Effort is unestimated.");
    qualityScore -= 15;
  } else if ((hours && hours > 40) || (points && points > 13)) {
    issues.push("Item appears oversized (>40h / >13pts). Consider splitting into smaller continuous-flow work items.");
    qualityScore -= 20;
  }

  // 4. Staleness check (>30 days since creation without progress)
  if (task.createdAt) {
    const ageDays = (Date.now() - new Date(task.createdAt).getTime()) / (24 * 3600 * 1000);
    if (ageDays > 30) {
      issues.push(`Item has been in backlog for ${Math.round(ageDays)} days without progress.`);
      qualityScore -= 10;
    }
  }

  const finalScore = Math.max(0, qualityScore);
  let status = "READY_FOR_REPLENISHMENT";
  if (finalScore < 50) status = "NEEDS_REFINEMENT";
  else if (finalScore < 80) status = "ACCEPTABLE";

  return {
    taskId: task._id,
    title: task.title,
    qualityScore: finalScore,
    status,
    issues,
  };
}

/**
 * Score and recommend candidates for replenishment into Ready
 */
export function evaluateReplenishmentCandidates(backlogTasks = [], readySlotCount = 5, context = {}) {
  const candidates = [];

  for (const t of backlogTasks) {
    const priority = calculateKanbanPriority(t, context);
    const dor = checkDefinitionOfReady(t, context.definitionOfReady);
    const quality = analyzeBacklogQuality(t);

    // Check if item has unresolved dependencies
    const hasUnresolvedDeps = Boolean(
      Array.isArray(t.dependencies) &&
      t.dependencies.some((d) => {
        const dObj = d?._id ? d : null;
        if (!dObj) return false;
        return dObj.kanbanStatus !== "DONE" && dObj.status !== "done";
      })
    );

    const isRecommended = dor.isReady && !hasUnresolvedDeps;

    candidates.push({
      taskId: t._id,
      task: t,
      title: t.title,
      priorityScore: priority.score,
      tier: priority.tier,
      classOfService: t.classOfService || "standard",
      dorScore: dor.score,
      isDoRReady: dor.isReady,
      qualityScore: quality.qualityScore,
      qualityStatus: quality.status,
      hasUnresolvedDependencies: hasUnresolvedDeps,
      isRecommended,
      reason: isRecommended
        ? "Satisfies Definition of Ready with high dynamic flow priority."
        : !dor.isReady
        ? `Missing DoR criteria: ${dor.missingCriteria.join(", ")}`
        : "Blocked by unresolved prerequisites.",
    });
  }

  // Sort candidates: recommended first, then descending by priority score
  candidates.sort((a, b) => {
    if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  });

  const recommendedSubset = candidates.filter((c) => c.isRecommended).slice(0, Math.max(1, readySlotCount));

  return {
    totalBacklog: backlogTasks.length,
    availableReadySlots: readySlotCount,
    allCandidates: candidates,
    recommendedForReplenish: recommendedSubset,
  };
}
