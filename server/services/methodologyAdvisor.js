/**
 * server/services/methodologyAdvisor.js
 * ============================================================================
 * NEXUSFLOW V4 — DETERMINISTIC METHODOLOGY RECOMMENDATION ENGINE (Prompt 7)
 *
 * Analyzes project signals to recommend the best methodology:
 *   CLASSIC, WATERFALL, SCRUM, KANBAN, or HYBRID
 *
 * CORE PRINCIPLES:
 *   - DETERMINISTIC: Same inputs → same recommendation (reproducible)
 *   - EXPLAINABLE: Every recommendation includes structured reasoning
 *   - NON-FORCING: Recommendation ≠ selection — user always overrides
 *   - NO LLM DEPENDENCY: Core logic is pure algorithmic scoring
 *   - AI may OPTIONALLY explain the result (graceful failure = still works)
 *
 * SCORING APPROACH:
 *   Each methodology receives a weighted score based on project signals.
 *   The highest-scoring methodology is recommended.
 *   Ties are broken by a preference order: SCRUM > KANBAN > WATERFALL > HYBRID > CLASSIC
 * ============================================================================
 */

import Project from "../models/Project.js";
import { recordProjectEvent } from "./eventService.js";

// ── Signal extraction and normalization ───────────────────────────────────────

/**
 * Extract recommendation signals from project data.
 * Uses existing project fields — no field duplication.
 */
export function extractSignals(project, overrides = {}) {
  const ctx = project.context || {};
  const teamSize = overrides.teamSize ?? project.teamSize ?? 3;
  const estimatedDuration = overrides.estimatedDuration ?? ctx.estimatedDurationDays ?? 60;
  const constraints = ctx.constraints || [];
  const goals = ctx.goals || [];
  const domain = (overrides.domain ?? project.domain ?? "").toLowerCase();
  const projectType = (overrides.projectType ?? project.projectType ?? "").toLowerCase();
  const academicContext = (overrides.academicContext ?? project.academicContext ?? "").toLowerCase();

  return {
    // Requirement stability: high = stable, low = volatile
    requirementStability: overrides.requirementStability ?? (
      constraints.some(c => /fixed|stable|defined|clear|frozen/i.test(c)) ? "high" :
      constraints.some(c => /evolv|chang|agile|iterative|flexible/i.test(c)) ? "low" : "medium"
    ),

    // Expected change frequency
    changeFrequency: overrides.changeFrequency ?? (
      goals.some(g => /iterative|prototype|mvp|experiment/i.test(g)) ? "high" :
      goals.some(g => /fixed|waterfall|sequential|phase/i.test(g)) ? "low" : "medium"
    ),

    // Team size
    teamSize,
    teamSizeCategory: teamSize <= 2 ? "small" : teamSize <= 6 ? "medium" : "large",

    // Dependency complexity
    dependencyComplexity: overrides.dependencyComplexity ?? (
      (ctx.hardwareRequirements?.length > 2 || ctx.integrations?.length > 3) ? "high" :
      (ctx.hardwareRequirements?.length > 0 || ctx.integrations?.length > 1) ? "medium" : "low"
    ),

    // Timeline
    estimatedDuration,
    timelinePressure: estimatedDuration <= 14 ? "extreme" : estimatedDuration <= 30 ? "high" : estimatedDuration <= 90 ? "medium" : "low",

    // Milestone requirements
    hasMilestones: overrides.hasMilestones ?? constraints.some(c => /milestone|gate|review|phase|deliverable/i.test(c)),

    // Delivery frequency
    deliveryFrequency: overrides.deliveryFrequency ?? (
      goals.some(g => /continuous|daily|deploy|release/i.test(g)) ? "continuous" :
      goals.some(g => /sprint|iteration|cycle|bi-weekly|weekly/i.test(g)) ? "iterative" : "single"
    ),

    // Governance requirements
    hasGovernance: overrides.hasGovernance ?? (
      constraints.some(c => /compliance|audit|governance|regulation|approval|sign.?off/i.test(c)) ||
      academicContext.includes("final year") ||
      academicContext.includes("capstone")
    ),

    // Academic context
    isAcademic: overrides.isAcademic ?? (academicContext.length > 0),
    isFinalYear: overrides.isFinalYear ?? (
      academicContext.includes("final") || academicContext.includes("capstone") || academicContext.includes("thesis")
    ),

    // WIP characteristics
    wipCharacteristics: overrides.wipCharacteristics ?? (
      domain.includes("support") || domain.includes("maintenance") || domain.includes("devops") ? "continuous" :
      domain.includes("research") || projectType.includes("experiment") ? "exploratory" : "project"
    ),

    // Domain hints
    domain,
    projectType,
    academicContext,
  };
}

// ── Scoring matrix ────────────────────────────────────────────────────────────

/**
 * Score each methodology based on extracted signals.
 * Returns { methodology: score, ... } with deterministic scoring.
 */
export function scoreMethodologies(signals) {
  const scores = {
    CLASSIC: 0,
    WATERFALL: 0,
    SCRUM: 0,
    KANBAN: 0,
    HYBRID: 0,
  };

  const reasons = {
    CLASSIC: [],
    WATERFALL: [],
    SCRUM: [],
    KANBAN: [],
    HYBRID: [],
  };

  // ── Requirement Stability ──────────────────────────────────────────
  if (signals.requirementStability === "high") {
    scores.WATERFALL += 15;
    reasons.WATERFALL.push("Requirements are stable — sequential planning is efficient.");
  } else if (signals.requirementStability === "low") {
    scores.SCRUM += 12;
    scores.KANBAN += 8;
    reasons.SCRUM.push("Requirements likely to evolve — iterative sprints enable adaptation.");
    reasons.KANBAN.push("Volatile requirements benefit from continuous flow flexibility.");
  } else {
    scores.SCRUM += 6;
    scores.WATERFALL += 4;
    scores.HYBRID += 5;
    reasons.HYBRID.push("Moderate requirement stability may benefit from hybrid approach.");
  }

  // ── Change Frequency ───────────────────────────────────────────────
  if (signals.changeFrequency === "high") {
    scores.SCRUM += 12;
    scores.KANBAN += 10;
    reasons.SCRUM.push("High change frequency aligns with sprint-based re-planning.");
    reasons.KANBAN.push("Frequent changes suit continuous flow reprioritization.");
  } else if (signals.changeFrequency === "low") {
    scores.WATERFALL += 12;
    reasons.WATERFALL.push("Low change frequency suits sequential phase execution.");
  }

  // ── Team Size ──────────────────────────────────────────────────────
  if (signals.teamSizeCategory === "small") {
    scores.KANBAN += 8;
    scores.CLASSIC += 10;
    reasons.KANBAN.push("Small teams benefit from Kanban's lightweight process.");
    reasons.CLASSIC.push("Very small teams may prefer minimal process overhead.");
  } else if (signals.teamSizeCategory === "medium") {
    scores.SCRUM += 8;
    reasons.SCRUM.push("Medium teams align well with Scrum ceremonies and roles.");
  } else {
    scores.WATERFALL += 6;
    scores.HYBRID += 5;
    reasons.WATERFALL.push("Larger teams benefit from structured phase-based coordination.");
  }

  // ── Dependency Complexity ──────────────────────────────────────────
  if (signals.dependencyComplexity === "high") {
    scores.WATERFALL += 10;
    scores.HYBRID += 8;
    reasons.WATERFALL.push("Complex dependencies benefit from upfront phase planning.");
    reasons.HYBRID.push("Complex dependencies may need waterfall planning with agile execution.");
  } else if (signals.dependencyComplexity === "low") {
    scores.KANBAN += 6;
    scores.SCRUM += 4;
    reasons.KANBAN.push("Low dependency complexity suits flow-based execution.");
  }

  // ── Timeline Pressure ──────────────────────────────────────────────
  if (signals.timelinePressure === "extreme") {
    scores.KANBAN += 10;
    scores.CLASSIC += 6;
    reasons.KANBAN.push("Extreme time pressure — Kanban minimizes ceremony overhead.");
    reasons.CLASSIC.push("Very tight timelines may benefit from minimal process.");
  } else if (signals.timelinePressure === "high") {
    scores.SCRUM += 6;
    scores.KANBAN += 5;
    reasons.SCRUM.push("Tight timeline with short sprints enables fast iteration.");
  } else if (signals.timelinePressure === "low") {
    scores.WATERFALL += 6;
    reasons.WATERFALL.push("Longer timeline allows thorough phase-based planning.");
  }

  // ── Milestones ─────────────────────────────────────────────────────
  if (signals.hasMilestones) {
    scores.WATERFALL += 10;
    scores.HYBRID += 8;
    reasons.WATERFALL.push("Milestone requirements align with phase gates.");
    reasons.HYBRID.push("Milestones can be served by waterfall governance with agile execution.");
  }

  // ── Delivery Frequency ─────────────────────────────────────────────
  if (signals.deliveryFrequency === "continuous") {
    scores.KANBAN += 12;
    reasons.KANBAN.push("Continuous delivery aligns with Kanban flow.");
  } else if (signals.deliveryFrequency === "iterative") {
    scores.SCRUM += 10;
    reasons.SCRUM.push("Iterative delivery maps naturally to sprint increments.");
  } else {
    scores.WATERFALL += 6;
    reasons.WATERFALL.push("Single delivery aligns with sequential phase completion.");
  }

  // ── Governance ─────────────────────────────────────────────────────
  if (signals.hasGovernance) {
    scores.WATERFALL += 10;
    scores.HYBRID += 8;
    reasons.WATERFALL.push("Governance requirements suit formal phase gate reviews.");
    reasons.HYBRID.push("Governance can use waterfall gates while execution uses agile methods.");
  }

  // ── Academic Context ───────────────────────────────────────────────
  if (signals.isFinalYear) {
    scores.WATERFALL += 8;
    scores.HYBRID += 6;
    reasons.WATERFALL.push("Final year projects typically require phase-based documentation and milestones.");
    reasons.HYBRID.push("Academic projects benefit from waterfall governance with iterative development.");
  } else if (signals.isAcademic) {
    scores.SCRUM += 4;
    reasons.SCRUM.push("Academic context with iterative learning aligns with sprint reviews.");
  }

  // ── WIP Characteristics ────────────────────────────────────────────
  if (signals.wipCharacteristics === "continuous") {
    scores.KANBAN += 10;
    reasons.KANBAN.push("Continuous work-in-progress pattern suits Kanban flow.");
  } else if (signals.wipCharacteristics === "exploratory") {
    scores.SCRUM += 5;
    scores.KANBAN += 5;
    reasons.SCRUM.push("Exploratory work benefits from sprint-bounded experiments.");
  }

  // ── Hybrid bonus for mixed signals ─────────────────────────────────
  const topScores = Object.values(scores).sort((a, b) => b - a);
  if (topScores[0] > 0 && topScores[1] > 0 && (topScores[0] - topScores[1]) <= 8) {
    scores.HYBRID += 6;
    reasons.HYBRID.push("Close scores between methodologies suggest a hybrid approach may capture benefits of both.");
  }

  return { scores, reasons };
}

// ── Main recommendation function ──────────────────────────────────────────────

/**
 * Generate a deterministic methodology recommendation.
 * Same inputs → same output. No LLM dependency.
 */
export function generateRecommendation(project, overrides = {}) {
  const signals = extractSignals(project, overrides);
  const { scores, reasons } = scoreMethodologies(signals);

  // Rank methodologies by score, break ties with preference order
  const preferenceOrder = ["SCRUM", "KANBAN", "WATERFALL", "HYBRID", "CLASSIC"];
  const ranked = Object.entries(scores)
    .sort(([aKey, aScore], [bKey, bScore]) => {
      if (bScore !== aScore) return bScore - aScore;
      return preferenceOrder.indexOf(aKey) - preferenceOrder.indexOf(bKey);
    });

  const recommended = ranked[0][0];
  const topScore = ranked[0][1];
  const maxPossible = Math.max(1, Object.values(scores).reduce((a, b) => a + b, 0));
  const confidence = Math.min(100, Math.round((topScore / maxPossible) * 100 * 2));

  // Build considerations (reasons from non-recommended methodologies that scored well)
  const considerations = [];
  for (const [methodology, score] of ranked.slice(1)) {
    if (score > 0 && reasons[methodology].length > 0) {
      considerations.push({
        methodology,
        score,
        reasons: reasons[methodology].slice(0, 2),
      });
    }
  }

  return {
    recommendation: recommended,
    score: topScore,
    confidence: Math.min(confidence, 95), // cap at 95% — never claim certainty
    reasons: reasons[recommended],
    considerations,
    allScores: Object.fromEntries(ranked),
    signals,
    isHybridAvailable: true,
    generatedAt: new Date().toISOString(),
    deterministic: true,
  };
}

/**
 * Generate and persist a methodology recommendation for a project.
 */
export async function recommendMethodology(projectId, overrides = {}, userId = null, userName = "System") {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const result = generateRecommendation(project, overrides);

  // Persist recommendation metadata on project
  project.recommendedMethodology = result.recommendation;
  project.recommendationReasons = result.reasons;
  project.recommendationScore = result.score;
  await project.save();

  // Record event
  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId: userId,
    actorName: userName,
    eventType: "METHODOLOGY_RECOMMENDED",
    entityType: "methodology_recommendation",
    entityId: projectId.toString(),
    title: `Methodology recommended: ${result.recommendation}`,
    description: result.reasons.join("; "),
    newValue: { recommendation: result.recommendation, score: result.score, confidence: result.confidence },
    source: "methodology_advisor",
  });

  return result;
}

/**
 * Record user's methodology selection (override or acceptance).
 */
export async function selectMethodology(projectId, selectedMethodology, userId, userName = "User") {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const validMethodologies = ["WATERFALL", "SCRUM", "KANBAN", "HYBRID", "CLASSIC", "NEXUSFLOW"];
  const normalized = String(selectedMethodology).toUpperCase();
  if (!validMethodologies.includes(normalized)) {
    throw new Error(`Invalid methodology: ${selectedMethodology}. Valid: ${validMethodologies.join(", ")}`);
  }

  const previousMethodology = project.methodology;
  const wasOverride = Boolean(project.recommendedMethodology && project.recommendedMethodology !== normalized);
  project.methodology = normalized;
  project.methodologySelectedAt = new Date();
  project.userOverrodeRecommendation = wasOverride;
  await project.save();

  // Record event
  await recordProjectEvent({
    projectId,
    teamId: project.teamId,
    actorId: userId,
    actorName: userName,
    eventType: "METHODOLOGY_SELECTED",
    entityType: "methodology_recommendation",
    entityId: projectId.toString(),
    title: `Methodology selected: ${normalized}`,
    description: previousMethodology !== normalized
      ? `Changed from ${previousMethodology} to ${normalized} (recommended: ${project.recommendedMethodology || "none"})`
      : `Confirmed ${normalized}`,
    previousValue: previousMethodology,
    newValue: normalized,
    source: "user",
  });

  return {
    success: true,
    selectedMethodology: normalized,
    previousMethodology,
    recommendedMethodology: project.recommendedMethodology,
    wasOverride,
  };
}
