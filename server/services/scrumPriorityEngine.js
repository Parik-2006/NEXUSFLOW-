/**
 * server/services/scrumPriorityEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM DYNAMIC PRIORITY ENGINE
 *
 * Extends the existing V4 taskPriorityEngine with Scrum-specific weighted
 * factors for backlog prioritization and Sprint planning.
 *
 * DETERMINISTIC — same inputs → same outputs. No AI. No randomization.
 *
 * FACTORS (configurable weights):
 *   businessValue      — strategic/business importance
 *   urgency            — time sensitivity
 *   deadlinePressure   — proximity to deadline
 *   dependencyImportance — how many items depend on this
 *   blockingPotential  — downstream blocking impact
 *   risk               — project/technical risk
 *   effort             — story points / estimated hours
 *   expectedValue      — expected outcome value
 *   technicalUncertainty — implementation uncertainty
 *   teacherImportance  — academic/teacher priority
 *   milestoneImportance — milestone criticality
 *   capacityFit        — how well it fits available capacity
 *   skillAvailability  — team has required skills
 *   criticalPath       — is on critical path
 *   workloadBalance    — contributes to balanced workload
 *
 * USAGE:
 *   const ranked = rankBacklog(backlogItems, context);
 *   const { score, factors, explanation } = calculateScrumPriority(item, context);
 * ============================================================================
 */

import { computePriorityScore } from "../algorithms/greedyScheduler.js";

// ── Default Scrum Priority Weights (sum to 1.0) ──────────────────────────────
const DEFAULT_WEIGHTS = {
  businessValue:       0.15,
  urgency:             0.12,
  deadlinePressure:    0.10,
  dependencyImportance:0.10,
  blockingPotential:   0.08,
  risk:                0.08,
  effort:              0.05,
  expectedValue:       0.08,
  technicalUncertainty:0.05,
  teacherImportance:   0.07,
  milestoneImportance: 0.05,
  skillAvailability:   0.04,
  criticalPath:        0.03,
};

function clamp(n, lo, hi) {
  return Math.min(Math.max(Number(n) || lo, lo), hi);
}

function safeNum(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Calculate Scrum-specific priority score for a single item.
 *
 * @param {Object} item - Task/backlog item
 * @param {Object} context - Project context (sprint, team, dependencies, etc.)
 * @returns {{ score, tier, factors, explanation }}
 */
export function calculateScrumPriority(item, context = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(context.weights || {}) };
  const factors = {};
  const explanationParts = [];

  // ── Business Value (0-100) ────────────────────────────────────────────
  const bv = safeNum(item.businessValue, 5);
  factors.businessValue = clamp((bv / 10) * 100, 0, 100);
  if (bv >= 8) explanationParts.push(`High business value (${bv}/10)`);

  // ── Urgency (0-100) ───────────────────────────────────────────────────
  const urg = safeNum(item.urgency, 1);
  factors.urgency = clamp((urg / 5) * 100, 0, 100);
  if (urg >= 4) explanationParts.push(`Urgent (${urg}/5)`);

  // ── Deadline Pressure (0-100) ──────────────────────────────────────────
  const deadline = item.deadline || item.dueDate;
  if (deadline) {
    const daysUntil = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 0) {
      factors.deadlinePressure = 100;
      explanationParts.push("Past deadline");
    } else if (daysUntil <= 3) {
      factors.deadlinePressure = 90;
      explanationParts.push(`Deadline in ${Math.ceil(daysUntil)} day(s)`);
    } else if (daysUntil <= 7) {
      factors.deadlinePressure = 70;
    } else if (daysUntil <= 14) {
      factors.deadlinePressure = 40;
    } else {
      factors.deadlinePressure = Math.max(0, 30 - daysUntil);
    }
  } else {
    factors.deadlinePressure = 20; // neutral
  }

  // ── Dependency Importance (0-100) ──────────────────────────────────────
  const depCount = safeNum(item.dependencyCount, (item.dependencies || []).length);
  const blockingCount = safeNum(item.blockingPotential, 0);
  factors.dependencyImportance = clamp(depCount * 15 + blockingCount * 20, 0, 100);
  if (blockingCount >= 3) explanationParts.push(`Blocks ${blockingCount} items`);

  // ── Blocking Potential (0-100) ─────────────────────────────────────────
  factors.blockingPotential = clamp(safeNum(item.blockingPotential, 0) * 20, 0, 100);

  // ── Risk (0-100) ──────────────────────────────────────────────────────
  const techUncertainty = safeNum(item.technicalUncertainty, 5);
  factors.risk = clamp(techUncertainty * 10, 0, 100);
  if (techUncertainty >= 8) explanationParts.push(`High technical uncertainty (${techUncertainty}/10)`);

  // ── Effort (inverse — lower effort items may be quicker wins) ──────────
  const effort = safeNum(item.estimatedHours, safeNum(item.storyPoints, 3) * 4);
  factors.effort = clamp(100 - (effort / 40) * 100, 0, 100);

  // ── Expected Value (0-100) ─────────────────────────────────────────────
  factors.expectedValue = clamp(safeNum(item.expectedValue, 5) * 10, 0, 100);

  // ── Technical Uncertainty (0-100) ──────────────────────────────────────
  factors.technicalUncertainty = clamp(techUncertainty * 10, 0, 100);

  // ── Teacher Importance (0-100) ─────────────────────────────────────────
  const ti = safeNum(item.teacherImportance, 5);
  factors.teacherImportance = clamp(ti * 10, 0, 100);
  if (ti >= 8) explanationParts.push(`Teacher priority (${ti}/10)`);

  // ── Milestone Importance (0-100) ──────────────────────────────────────
  factors.milestoneImportance = clamp(safeNum(item.milestoneImportance, 5) * 10, 0, 100);

  // ── Skill Availability (0-100) ─────────────────────────────────────────
  const requiredSkills = item.requiredSkills || [];
  const teamSkills = context.teamSkills || [];
  if (requiredSkills.length > 0 && teamSkills.length > 0) {
    const matched = requiredSkills.filter((s) =>
      teamSkills.some((ts) => ts.toLowerCase() === s.toLowerCase())
    ).length;
    factors.skillAvailability = clamp((matched / requiredSkills.length) * 100, 0, 100);
    if (matched < requiredSkills.length) {
      explanationParts.push(`Skill gap: ${requiredSkills.length - matched} missing`);
    }
  } else {
    factors.skillAvailability = 80; // neutral
  }

  // ── Critical Path (0-100) ──────────────────────────────────────────────
  const onCriticalPath = context.criticalPathIds?.includes(item._id?.toString());
  factors.criticalPath = onCriticalPath ? 100 : 0;
  if (onCriticalPath) explanationParts.push("On critical path");

  // ── Weighted Score ────────────────────────────────────────────────────
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (factors[key] || 0) * weight;
  }
  score = clamp(Math.round(score), 0, 100);

  // ── Tier Assignment ────────────────────────────────────────────────────
  const tier = score >= 80 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";

  return {
    score,
    tier,
    factors,
    explanation: explanationParts.length > 0
      ? explanationParts.join(". ") + "."
      : `Priority score: ${score}/100 (${tier})`,
  };
}

/**
 * Rank an entire Product Backlog using Scrum priority factors.
 * Returns items sorted by priority score (descending).
 *
 * @param {Array} items - Backlog items
 * @param {Object} context - Project/team context
 * @returns {Array} Ranked items with priority data
 */
export function rankBacklog(items, context = {}) {
  const ranked = items.map((item) => {
    const priority = calculateScrumPriority(item, context);
    return {
      ...item,
      scrumPriority: priority,
      _priorityScore: priority.score,
    };
  });

  // Sort by priority score descending, with deterministic tie-breaking
  ranked.sort((a, b) => {
    if (b._priorityScore !== a._priorityScore) return b._priorityScore - a._priorityScore;
    // Tie-break: greedy score → business value → title → ID
    const greedyA = safeNum(a.priorityScore, 0);
    const greedyB = safeNum(b.priorityScore, 0);
    if (greedyB !== greedyA) return greedyB - greedyA;
    const bvA = safeNum(a.businessValue, 0);
    const bvB = safeNum(b.businessValue, 0);
    if (bvB !== bvA) return bvB - bvA;
    const titleA = (a.title || "").toLowerCase();
    const titleB = (b.title || "").toLowerCase();
    if (titleA !== titleB) return titleA < titleB ? -1 : 1;
    return String(a._id || "") < String(b._id || "") ? -1 : 1;
  });

  return ranked;
}

/**
 * Score Sprint planning candidates — which backlog items should enter the Sprint.
 * Returns items with planning recommendation data.
 *
 * @param {Array} candidates - Potential Sprint items
 * @param {Object} sprintContext - Sprint capacity, team, etc.
 * @returns {{ recommended, overflow, analysis }}
 */
export function scorePlanningCandidates(candidates, sprintContext = {}) {
  const { totalCapacity = 100, teamSkills = [], criticalPathIds = [] } = sprintContext;

  const ranked = rankBacklog(candidates, { teamSkills, criticalPathIds });

  const recommended = [];
  const overflow = [];
  let usedCapacity = 0;

  for (const item of ranked) {
    const hours = safeNum(item.estimatedHours, safeNum(item.storyPoints, 1) * 4);

    if (usedCapacity + hours <= totalCapacity) {
      recommended.push({
        ...item,
        planningRecommendation: "INCLUDE",
        reason: `Fits capacity (${usedCapacity + hours}/${totalCapacity}h). Priority: ${item.scrumPriority.tier}.`,
      });
      usedCapacity += hours;
    } else {
      overflow.push({
        ...item,
        planningRecommendation: "DEFER",
        reason: `Would exceed capacity (${usedCapacity + hours}/${totalCapacity}h).`,
      });
    }
  }

  return {
    recommended,
    overflow,
    analysis: {
      totalCandidates: candidates.length,
      recommendedCount: recommended.length,
      overflowCount: overflow.length,
      usedCapacity,
      totalCapacity,
      utilizationPercent: Math.round((usedCapacity / totalCapacity) * 100),
    },
  };
}
