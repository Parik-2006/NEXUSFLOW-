/**
 * taskPriorityEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — Task Intelligence 2.0
 *
 * Authoritative, deterministic priority engine. Single source of truth for
 * task priority scoring across the entire application.
 *
 * DESIGN PRINCIPLES:
 *   • Preserve existing V2 Greedy semantics as the anchor factor.
 *   • Extend with additional meaningful factors — do not replace.
 *   • Deterministic: same inputs → same outputs. No randomisation.
 *   • Explainable: machine-readable factor details + human-readable reasons.
 *   • Safe with missing data: optional fields get neutral defaults.
 *   • No AI/LLM dependency for scoring.
 *   • Deterministic tie-breakers: enriched score → greedy score → title → ID.
 *
 * FACTORS (default weights sum to 1.0):
 *   greedy      — V2 Greedy anchor (urgency/impact/dependencyCount)
 *   deadline    — Proximity to due date/deadline
 *   value       — Business value / strategic impact
 *   risk        — Task appears in risk register or is in-progress
 *   depth       — Dependency graph depth (tasks that block others)
 *   skillGap    — Team skill shortage for task requirements
 *   overload    — Assigned member workload pressure
 *
 * USAGE:
 *   const { score, tier, factors, reason } = computeTaskPriority(task, context);
 *   const ranked = rankTasks(tasks, context);
 *
 * ENV OVERRIDES (optional):
 *   PRIORITY_W_GREEDY, PRIORITY_W_DEADLINE, PRIORITY_W_VALUE,
 *   PRIORITY_W_RISK, PRIORITY_W_DEPTH, PRIORITY_W_SKILL_GAP, PRIORITY_W_OVERLOAD
 * ============================================================================
 */

import { computePriorityScore } from "./greedyScheduler.js";

// ---------------------------------------------------------------------------
// Default weights (configurable via env vars, sum to 1.0)
// ---------------------------------------------------------------------------

const W_GREEDY    = parseFloat(process.env.PRIORITY_W_GREEDY    ?? "0.35");
const W_DEADLINE  = parseFloat(process.env.PRIORITY_W_DEADLINE  ?? "0.20");
const W_VALUE     = parseFloat(process.env.PRIORITY_W_VALUE     ?? "0.15");
const W_RISK      = parseFloat(process.env.PRIORITY_W_RISK      ?? "0.10");
const W_DEPTH     = parseFloat(process.env.PRIORITY_W_DEPTH     ?? "0.10");
const W_SKILL_GAP = parseFloat(process.env.PRIORITY_W_SKILL_GAP ?? "0.05");
const W_OVERLOAD  = parseFloat(process.env.PRIORITY_W_OVERLOAD  ?? "0.05");

const WEIGHTS = { greedy: W_GREEDY, deadline: W_DEADLINE, value: W_VALUE, risk: W_RISK, depth: W_DEPTH, skillGap: W_SKILL_GAP, overload: W_OVERLOAD };

// Tier thresholds (0–100)
const TIER_CRITICAL = 80;
const TIER_HIGH     = 55;
const TIER_MEDIUM   = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(Math.max(Number(n) || lo, lo), hi);
}

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function safeDate(iso) {
  if (iso === null || iso === undefined) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function tierOf(score) {
  if (score >= TIER_CRITICAL) return "critical";
  if (score >= TIER_HIGH) return "high";
  if (score >= TIER_MEDIUM) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Factor calculators
// ---------------------------------------------------------------------------

function greedyFactor(task) {
  const urgency = clamp(task.urgency ?? 1, 1, 5);
  const impact = clamp(task.impact ?? 1, 1, 5);
  const deps = clamp(task.dependencyCount ?? 0, 0, 20);
  const u = (urgency - 1) / 4;
  const i = (impact - 1) / 4;
  const d = deps / 20;
  const raw = W_GREEDY * u + W_GREEDY * i + (WEIGHTS.greedy * 0.15) * d; // preserve V2 weights within factor
  const score = Math.round(raw * 100);
  const contribution = Math.round(WEIGHTS.greedy * score);
  return {
    score,
    weight: WEIGHTS.greedy,
    contribution,
    reason: `V2 Greedy anchor: urgency ${urgency}/5, impact ${impact}/5, ${deps} dependent task${deps !== 1 ? "s" : ""}.`,
  };
}

function deadlineFactor(task, now) {
  const due = safeDate(task.dueDate || task.deadline);
  if (due === null) {
    return { score: 50, weight: WEIGHTS.deadline, contribution: Math.round(WEIGHTS.deadline * 50), reason: "No due date set — neutral deadline score." };
  }
  const days = (due - now) / 86_400_000;
  let score;
  if (days <= 0) score = 100;
  else if (days <= 1) score = 92;
  else if (days <= 3) score = 80;
  else if (days <= 7) score = 65;
  else if (days <= 14) score = 50;
  else if (days <= 30) score = 35;
  else score = 20;

  const contribution = Math.round(WEIGHTS.deadline * score);
  return {
    score,
    weight: WEIGHTS.deadline,
    contribution,
    reason: days <= 0 ? "Overdue — highest deadline pressure." : days <= 1 ? "Due within 24 hours." : days <= 3 ? "Due within 3 days." : days <= 7 ? "Due within 1 week." : "Due in >1 week — lower pressure.",
  };
}

function valueFactor(task) {
  const v = safeNumber(task.businessValue, 0);
  let score;
  if (v <= 0) score = 50;
  else if (v >= 9) score = 100;
  else if (v >= 7) score = 85;
  else if (v >= 5) score = 70;
  else if (v >= 3) score = 55;
  else score = 35;

  const contribution = Math.round(WEIGHTS.value * score);
  return {
    score,
    weight: WEIGHTS.value,
    contribution,
    reason: v <= 0 ? "No business value set — neutral." : `Business value ${v}/10.`,
  };
}

function riskFactor(task, ctx) {
  const id = task._id?.toString?.();
  const inRisk = ctx?.riskTaskIds && id && (ctx.riskTaskIds instanceof Set ? ctx.riskTaskIds.has(id) : Array.isArray(ctx.riskTaskIds) && ctx.riskTaskIds.includes(id));
  const status = String(task.status || "").toLowerCase();
  let score = 40;
  if (inRisk) score = 90;
  else if (status === "in_progress") score = 75;
  else if (status === "done") score = 20;

  const contribution = Math.round(WEIGHTS.risk * score);
  return {
    score,
    weight: WEIGHTS.risk,
    contribution,
    reason: inRisk ? "Task is registered in project risk intelligence." : status === "in_progress" ? "Task is already in progress — completion reduces risk." : status === "done" ? "Task is complete — no residual risk." : "No active risk signal for this task.",
  };
}

function depthFactor(task, ctx) {
  if (!ctx?.allTasks || !task._id) {
    return { score: 50, weight: WEIGHTS.depth, contribution: Math.round(WEIGHTS.depth * 50), reason: "No dependency graph available — neutral depth score." };
  }
  const tid = task._id.toString();
  let depth = 0;
  for (const t of ctx.allTasks) {
    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    for (const dep of deps) {
      const depId = typeof dep === "object" ? (dep)?._id?.toString?.() : String(dep);
      if (depId === tid) depth++;
    }
  }
  const capped = Math.min(depth, 20);
  const score = Math.round((capped / 20) * 100);
  const contribution = Math.round(WEIGHTS.depth * score);
  return {
    score,
    weight: WEIGHTS.depth,
    contribution,
    reason: depth === 0 ? "No other tasks depend on this — leaf node." : `${depth} task${depth !== 1 ? "s" : ""} depend on this — blocking factor.`,
  };
}

function skillGapFactor(task, ctx) {
  const required = (task.requiredSkills || []).filter(Boolean);
  if (!required.length || !ctx?.teamSkills) {
    return { score: 50, weight: WEIGHTS.skillGap, contribution: Math.round(WEIGHTS.skillGap * 50), reason: required.length ? "No team skill data available — neutral." : "No required skills declared — neutral." };
  }
  const teamSkillSet = new Set();
  for (const memberSkills of Object.values(ctx.teamSkills)) {
    for (const s of Object.keys(memberSkills || {})) teamSkillSet.add(String(s).toLowerCase());
  }
  const missing = required.filter((s) => !teamSkillSet.has(String(s).toLowerCase()));
  const ratio = missing.length / required.length;
  const score = Math.round((1 - ratio) * 100);
  const contribution = Math.round(WEIGHTS.skillGap * score);
  return {
    score,
    weight: WEIGHTS.skillGap,
    contribution,
    reason: missing.length === 0 ? "All required skills are present in the team." : `${missing.length} of ${required.length} required skill${required.length !== 1 ? "s" : ""} missing from team profile.`,
  };
}

function overloadFactor(task, ctx) {
  const assigneeId = task.assignedTo?.toString?.();
  if (!assigneeId || !ctx?.memberWorkload) {
    return { score: 50, weight: WEIGHTS.overload, contribution: Math.round(WEIGHTS.overload * 50), reason: "No assignment or workload data — neutral overload score." };
  }
  const wl = ctx.memberWorkload[assigneeId];
  if (!wl) {
    return { score: 50, weight: WEIGHTS.overload, contribution: Math.round(WEIGHTS.overload * 50), reason: "Assignee workload not tracked — neutral." };
  }
  const load = safeNumber(wl.load, 0);
  const cap = safeNumber(wl.capacity, 40);
  const ratio = cap > 0 ? load / cap : 0;
  let score;
  if (ratio <= 0.5) score = 100;
  else if (ratio <= 0.75) score = 75;
  else if (ratio <= 1.0) score = 50;
  else score = 25;

  const contribution = Math.round(WEIGHTS.overload * score);
  return {
    score,
    weight: WEIGHTS.overload,
    contribution,
    reason: ratio <= 0.5 ? "Assignee is under-utilised — can absorb more work." : ratio <= 0.75 ? "Assignee has moderate workload." : ratio <= 1.0 ? "Assignee is near capacity." : "Assignee is overloaded — new task adds pressure.",
  };
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function computeTaskPriority(task, context) {
  const now = context?.now ?? Date.now();
  const manualOverride = Boolean(task.priorityLabel && task.priorityLabel.trim() !== "");

  const factors = {
    greedy:    greedyFactor(task),
    deadline:  deadlineFactor(task, now),
    value:     valueFactor(task),
    risk:      riskFactor(task, context),
    depth:     depthFactor(task, context),
    skillGap:  skillGapFactor(task, context),
    overload:  overloadFactor(task, context),
  };

  const weightedSum = Object.values(factors).reduce((sum, f) => sum + f.contribution, 0);
  const totalWeight = Object.values(factors).reduce((sum, f) => sum + f.weight, 0);
  const score = totalWeight > 0 ? Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight))) : 50;

  const tier = tierOf(score);

  // Human-readable reason — top contributing factors
  const sortedFactors = Object.entries(factors)
    .sort((a, b) => b[1].contribution - a[1].contribution)
    .slice(0, 3);

  const reason = sortedFactors
    .map(([key, f]) => `${f.reason} (${key}: ${f.score}/100)`)
    .join("; ") + ".";

  const deterministicTieBreak = "Tie-break: enriched score → V2 greedy → title → ID.";

  return {
    score,
    tier,
    factors,
    reason,
    deterministicTieBreak,
    manualOverride,
  };
}

export function rankTasks(tasks, context) {
  const now = context?.now ?? Date.now();
  const computed = tasks.map((t) => ({
    task: t,
    priorityResult: computeTaskPriority(t, { ...context, now }),
  }));

  computed.sort((a, b) => {
    const sa = a.priorityResult.score;
    const sb = b.priorityResult.score;
    if (sb !== sa) return sb - sa;

    const ga = safeNumber(a.task.priorityScore, computePriorityScore({ urgency: a.task.urgency, impact: a.task.impact, dependencyCount: a.task.dependencyCount }));
    const gb = safeNumber(b.task.priorityScore, computePriorityScore({ urgency: b.task.urgency, impact: b.task.impact, dependencyCount: b.task.dependencyCount }));
    if (gb !== ga) return gb - ga;

    const ta = String(a.task.title || "").toLowerCase();
    const tb = String(b.task.title || "").toLowerCase();
    if (ta !== tb) return ta.localeCompare(tb);

    const ia = String(a.task._id || "");
    const ib = String(b.task._id || "");
    return ia.localeCompare(ib);
  });

  return computed.map((c, idx) => ({
    ...c.task,
    priorityResult: c.priorityResult,
    rank: idx + 1,
  }));
}

export { WEIGHTS as DEFAULT_WEIGHTS, TIER_CRITICAL, TIER_HIGH, TIER_MEDIUM };
