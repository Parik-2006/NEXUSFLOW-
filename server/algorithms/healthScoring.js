/**
 * healthScoring.js — shared project-health scoring contract (Phase 3, D-24)
 * ============================================================================
 *
 *   Health = Σ_{d ∈ A} w'_d · s_d,    w'_d = w_d / Σ_{e ∈ A} w_e
 *
 * where A is the set of dimensions that are APPLICABLE to the methodology and
 * AVAILABLE (backed by evidence). Every dimension that contributes is shown
 * with its effective weight w'_d; dimensions that are inapplicable or lack
 * evidence are listed with the reason and contribute 0 — missing data is never
 * scored as 100 (perfect) or 50 (average).
 *
 * Confidence = Σ_{d ∈ A} w_d / Σ_{d applicable} w_d (share of the intended
 * weighting that is evidence-backed): high ≥ 0.8, medium ≥ 0.5, low > 0,
 * insufficient = 0 (overall score is then null).
 *
 * Severity caps are applied after weighting and reported separately
 * (uncappedScore, appliedCaps) so the cap is never hidden.
 */

export const UNIFIED_HEALTH_WEIGHTS = Object.freeze({
  delivery: 0.16,
  schedule: 0.13,
  capacity: 0.13,
  dependencies: 0.12,
  risk: 0.11,
  skill: 0.09,
  requirements: 0.10,
  process: 0.08,
  quality: 0.08,
});

const clamp = (n) => Math.max(0, Math.min(100, n));

/**
 * combineHealthDimensions(dims, baseWeights)
 * @param dims [{ key, score:number|null, applicable:boolean, available:boolean, unavailableReason? }]
 */
export function combineHealthDimensions(dims, baseWeights = UNIFIED_HEALTH_WEIGHTS) {
  const used = [];
  const excluded = [];
  let applicableWeight = 0;
  for (const d of dims) {
    const w = baseWeights[d.key] ?? 0;
    if (!d.applicable) { excluded.push({ key: d.key, reason: d.unavailableReason || "not applicable to this methodology" }); continue; }
    applicableWeight += w;
    if (!d.available || d.score === null || d.score === undefined || !Number.isFinite(d.score)) {
      excluded.push({ key: d.key, reason: d.unavailableReason || "insufficient evidence" });
      continue;
    }
    if (w > 0) used.push({ key: d.key, w, score: clamp(d.score) });
  }
  const usedWeight = used.reduce((s, x) => s + x.w, 0);
  const effectiveWeights = {};
  const contributions = {};
  let raw = null;
  if (usedWeight > 0) {
    raw = 0;
    for (const x of used) {
      const ew = x.w / usedWeight;
      effectiveWeights[x.key] = Math.round(ew * 10000) / 10000;
      contributions[x.key] = Math.round(ew * x.score * 100) / 100;
      raw += ew * x.score;
    }
  }
  for (const d of dims) if (!(d.key in effectiveWeights)) effectiveWeights[d.key] = 0;
  const coverage = applicableWeight > 0 ? usedWeight / applicableWeight : 0;
  const confidence = coverage === 0 ? "insufficient" : coverage >= 0.8 ? "high" : coverage >= 0.5 ? "medium" : "low";
  return {
    score: raw === null ? null : Math.round(raw + 1e-9),
    rawScore: raw === null ? null : Math.round(raw * 100) / 100,
    effectiveWeights,
    contributions,
    excluded,
    evidenceCoverage: Math.round(coverage * 1000) / 1000,
    confidence,
  };
}

/** applyCaps(score, caps[{ cap, reason }]) → { score, uncappedScore, appliedCaps } */
export function applyCaps(score, caps) {
  if (score === null) return { score: null, uncappedScore: null, appliedCaps: [] };
  let s = score;
  const applied = [];
  for (const c of caps) {
    if (s > c.cap) { applied.push(c); s = c.cap; }
  }
  return { score: s, uncappedScore: score, appliedCaps: applied };
}

const isDoneTask = (t) => {
  const s = String(t.status || "").toLowerCase();
  return s === "done" || t.scrumStatus === "DONE" || t.kanbanStatus === "DONE" || t.workflowColumn === "done";
};

/**
 * Requirements baseline. Applicable for WATERFALL / HYBRID, or whenever the
 * project records requirements. Available only with ≥ 1 non-rejected
 * requirement. Score = share of non-rejected requirements that are baselined
 * (approved, in_progress or verified).
 */
export function requirementsDimension(requirements = [], methodology = "") {
  const m = String(methodology).toUpperCase();
  const active = requirements.filter((r) => r?.status !== "rejected");
  const baselined = active.filter((r) => ["approved", "in_progress", "verified"].includes(r.status));
  const applicable = m === "WATERFALL" || m === "HYBRID" || requirements.length > 0;
  const available = active.length > 0;
  return {
    applicable,
    available,
    score: available ? clamp((baselined.length / active.length) * 100) : null,
    signals: { totalRequirements: requirements.length, activeRequirements: active.length, baselinedRequirements: baselined.length, rejectedRequirements: requirements.length - active.length },
    unavailableReason: available ? undefined : applicable ? "no requirements recorded yet" : "not applicable to this methodology",
  };
}

/**
 * Quality evidence (no fabricated defects or coverage). Sub-signals:
 *   dod  — completed tasks carrying acceptance criteria / completed tasks,
 *          counted only when the project uses acceptance criteria at all
 *   ver  — verified requirements / implemented requirements (all linked
 *          tasks done), counted only when ≥ 1 requirement is implemented
 * Score = mean of available sub-signals. No sub-signal → unavailable.
 */
export function qualityDimension(tasks = [], requirements = []) {
  const done = tasks.filter(isDoneTask);
  const usesAC = tasks.some((t) => Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0);
  const doneWithAC = done.filter((t) => Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0);
  const doneIds = new Set(done.map((t) => String(t._id)));
  const implemented = requirements.filter((r) => r?.status !== "rejected" && Array.isArray(r.taskIds) && r.taskIds.length > 0 && r.taskIds.every((id) => doneIds.has(String(id))));
  const verified = implemented.filter((r) => r.status === "verified");
  const subs = [];
  if (usesAC && done.length > 0) subs.push({ key: "definitionOfDone", value: doneWithAC.length / done.length });
  if (implemented.length > 0) subs.push({ key: "requirementVerification", value: verified.length / implemented.length });
  const available = subs.length > 0;
  return {
    applicable: true,
    available,
    score: available ? clamp((subs.reduce((s, x) => s + x.value, 0) / subs.length) * 100) : null,
    signals: {
      completedTasks: done.length,
      completedWithAcceptanceCriteria: doneWithAC.length,
      implementedRequirements: implemented.length,
      verifiedRequirements: verified.length,
      subSignals: subs.map((x) => ({ key: x.key, value: Math.round(x.value * 1000) / 10 })),
    },
    unavailableReason: available ? undefined : "no quality evidence recorded (no acceptance criteria on completed work and no implemented requirements to verify)",
  };
}

export { isDoneTask };
