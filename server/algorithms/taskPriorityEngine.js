/**
 * taskPriorityEngine.js — NEXUSFLOW Task Intelligence 2.0 (Phase 3 corrected)
 * ============================================================================
 * Authoritative, deterministic multi-factor task priority.
 *
 * SCORE CONTRACT
 *   Every factor produces a normalised score s_k ∈ [0, 100].
 *   Weights w_k are validated (finite, ≥ 0, Σ > 0) and normalised to Σ w_k = 1.
 *       rawScore = Σ_k w_k · s_k           (∈ [0, 100], never rounded per factor)
 *       score    = round(rawScore)          (integer shown in the UI and used to rank)
 *   With every factor at 100 the score is exactly 100; with every factor at 0 it
 *   is 0. Each weight is applied exactly once. (Audit D-22: the greedy factor
 *   previously applied its weight twice and capped at 75.)
 *
 * FACTORS
 *   greedy    computePriorityComponents(urgency, impact, direct dependents)·100
 *   deadline  step function of days to due date (no date → neutral 50)
 *   value     step function of businessValue 0..10 (unset → neutral 50)
 *   risk      in risk register 90 · in progress 75 · done 20 · otherwise 40
 *   depth     DOWNSTREAM REACH: unique tasks transitively waiting on this one,
 *             min(reach, 20)/20·100 (no graph → neutral 50)
 *   skillGap  share of required skills present in the team (no data → 50)
 *   overload  assignee load/capacity buckets (no data → 50)
 *
 * ELIGIBILITY (hard constraints — never overridden by score)
 *   • unfinished prerequisites inside the supplied task set
 *   • Waterfall: task phase is not the active phase (context.waterfallPhase)
 *   • Kanban:   pull blocked by a full WIP column (context.wipBlocked) for
 *               tasks that have not started
 *   rankTasks orders all ELIGIBLE tasks before ineligible ones; within each
 *   group: score desc → greedy raw desc → title (code-unit) → id (code-unit).
 *
 * Complexity: rankTasks is O(V + E) for graph metrics + O(n log n) sort
 * (+ O(V·(V+E)) for downstream reach, bounded to graphs of ≤ 2000 tasks).
 */

import { computePriorityComponents, resolveWeights, ROUNDING_EPS } from "./greedyScheduler.js";
import { dependencyMetrics } from "./graphTraversal.js";

export const FACTOR_KEYS = ["greedy", "deadline", "value", "risk", "depth", "skillGap", "overload"];

const BASE_DEFAULT_WEIGHTS = Object.freeze({
  greedy: 0.35, deadline: 0.20, value: 0.15, risk: 0.10, depth: 0.10, skillGap: 0.05, overload: 0.05,
});

const envResolved = resolveWeights(
  {
    greedy: process.env.PRIORITY_W_GREEDY ?? BASE_DEFAULT_WEIGHTS.greedy,
    deadline: process.env.PRIORITY_W_DEADLINE ?? BASE_DEFAULT_WEIGHTS.deadline,
    value: process.env.PRIORITY_W_VALUE ?? BASE_DEFAULT_WEIGHTS.value,
    risk: process.env.PRIORITY_W_RISK ?? BASE_DEFAULT_WEIGHTS.risk,
    depth: process.env.PRIORITY_W_DEPTH ?? BASE_DEFAULT_WEIGHTS.depth,
    skillGap: process.env.PRIORITY_W_SKILL_GAP ?? BASE_DEFAULT_WEIGHTS.skillGap,
    overload: process.env.PRIORITY_W_OVERLOAD ?? BASE_DEFAULT_WEIGHTS.overload,
  },
  BASE_DEFAULT_WEIGHTS
);
if (!envResolved.valid) console.warn(`[taskPriorityEngine] invalid PRIORITY_W_* configuration (${envResolved.errors.join("; ")}) — using defaults.`);

/** Effective default weights (validated and normalised to sum 1). */
const WEIGHTS = Object.freeze(envResolved.weights);

const TIER_CRITICAL = 80;
const TIER_HIGH = 55;
const TIER_MEDIUM = 30;
const DEPTH_CAP = 20;

/** Validate and normalise a weight override against the factor contract. */
export function resolvePriorityWeights(override) {
  if (!override || typeof override !== "object") return { weights: WEIGHTS, valid: true, errors: [], source: "default" };
  const r = resolveWeights(override, WEIGHTS);
  return { ...r, source: r.valid ? "override" : "default (invalid override rejected)" };
}

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function safeDate(iso) {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function tierOf(score) {
  if (score >= TIER_CRITICAL) return "critical";
  if (score >= TIER_HIGH) return "high";
  if (score >= TIER_MEDIUM) return "medium";
  return "low";
}

const idOf = (x) => (x && typeof x === "object" ? String(x._id ?? x) : String(x));
const isDone = (t) => {
  const s = String(t.status || "").toLowerCase();
  return s === "done" || t.scrumStatus === "DONE" || t.kanbanStatus === "DONE" || t.workflowColumn === "done";
};

// ---------------------------------------------------------------------------
// Factor calculators — each returns a score in [0, 100] (unrounded allowed)
// ---------------------------------------------------------------------------

function greedyFactor(task, ctx) {
  const dependents = ctx.metrics?.get(idOf(task))?.dependents ?? safeNumber(task.dependentCount, 0);
  const c = computePriorityComponents({ urgency: task.urgency, impact: task.impact, dependentCount: dependents });
  return {
    score: c.raw * 100,
    raw: c.raw,
    detail: { ...c.inputs, normalized: c.normalized, weights: c.weights },
    reason: `Greedy anchor: urgency ${c.inputs.urgency}/5, impact ${c.inputs.impact}/5, unblocks ${c.inputs.dependentCount} task${c.inputs.dependentCount !== 1 ? "s" : ""} directly.`,
  };
}

function deadlineFactor(task, now) {
  const due = safeDate(task.dueDate || task.deadline);
  if (due === null) return { score: 50, neutral: true, reason: "No due date set — neutral deadline score." };
  const days = (due - now) / 86_400_000;
  let score;
  if (days <= 0) score = 100;
  else if (days <= 1) score = 92;
  else if (days <= 3) score = 80;
  else if (days <= 7) score = 65;
  else if (days <= 14) score = 50;
  else if (days <= 30) score = 35;
  else score = 20;
  return {
    score,
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
  return { score, neutral: v <= 0, reason: v <= 0 ? "No business value set — neutral." : `Business value ${v}/10.` };
}

function riskFactor(task, ctx) {
  const id = task._id?.toString?.();
  const r = ctx?.riskTaskIds;
  const inRisk = Boolean(r && id && (r instanceof Set ? r.has(id) : Array.isArray(r) && r.includes(id)));
  const status = String(task.status || "").toLowerCase();
  let score = 40;
  if (inRisk) score = 90;
  else if (status === "in_progress") score = 75;
  else if (status === "done") score = 20;
  return {
    score,
    reason: inRisk ? "Task is registered in project risk intelligence." : status === "in_progress" ? "Task is already in progress — completion reduces risk." : status === "done" ? "Task is complete — no residual risk." : "No active risk signal for this task.",
  };
}

function depthFactor(task, ctx) {
  const m = ctx.metrics?.get(idOf(task));
  if (!m || m.downstreamReach === null || m.downstreamReach === undefined) {
    return { score: 50, neutral: true, reason: "No dependency graph available — neutral downstream score." };
  }
  const reach = m.downstreamReach;
  return {
    score: (Math.min(reach, DEPTH_CAP) / DEPTH_CAP) * 100,
    detail: { downstreamReach: reach, directDependents: m.dependents },
    reason: reach === 0 ? "No other tasks wait on this — leaf node." : `${reach} task${reach !== 1 ? "s" : ""} transitively wait on this (${m.dependents} directly).`,
  };
}

function skillGapFactor(task, ctx) {
  const required = (task.requiredSkills || []).filter(Boolean);
  if (!required.length || !ctx?.teamSkills) {
    return { score: 50, neutral: true, reason: required.length ? "No team skill data available — neutral." : "No required skills declared — neutral." };
  }
  const teamSkillSet = new Set();
  for (const memberSkills of Object.values(ctx.teamSkills)) {
    for (const s of Object.keys(memberSkills || {})) teamSkillSet.add(String(s).toLowerCase());
  }
  const missing = required.filter((s) => !teamSkillSet.has(String(s).toLowerCase()));
  return {
    score: (1 - missing.length / required.length) * 100,
    reason: missing.length === 0 ? "All required skills are present in the team." : `${missing.length} of ${required.length} required skill${required.length !== 1 ? "s" : ""} missing from team profile.`,
  };
}

function overloadFactor(task, ctx) {
  const assigneeId = task.assignedTo?.toString?.();
  if (!assigneeId || !ctx?.memberWorkload) return { score: 50, neutral: true, reason: "No assignment or workload data — neutral overload score." };
  const wl = ctx.memberWorkload[assigneeId];
  if (!wl) return { score: 50, neutral: true, reason: "Assignee workload not tracked — neutral." };
  const load = safeNumber(wl.load, 0);
  const cap = safeNumber(wl.capacity, 40);
  const ratio = cap > 0 ? load / cap : 0;
  let score;
  if (ratio <= 0.5) score = 100;
  else if (ratio <= 0.75) score = 75;
  else if (ratio <= 1.0) score = 50;
  else score = 25;
  return {
    score,
    reason: ratio <= 0.5 ? "Assignee is under-utilised — can absorb more work." : ratio <= 0.75 ? "Assignee has moderate workload." : ratio <= 1.0 ? "Assignee is near capacity." : "Assignee is overloaded — new task adds pressure.",
  };
}

// ---------------------------------------------------------------------------
// Eligibility (hard constraints)
// ---------------------------------------------------------------------------

export function evaluateEligibility(task, ctx = {}) {
  const constraints = [];
  if (isDone(task)) return { eligible: true, constraints, note: "completed" };
  const byId = ctx.taskById;
  if (byId) {
    const open = [];
    for (const dep of task.dependencies ?? []) {
      const d = byId.get(idOf(dep));
      if (d && idOf(d) !== idOf(task) && !isDone(d)) open.push(idOf(d));
    }
    const unique = [...new Set(open)];
    if (unique.length) constraints.push({ type: "unfinished_prerequisites", count: unique.length, taskIds: unique, message: `Waiting on ${unique.length} unfinished prerequisite task${unique.length !== 1 ? "s" : ""}.` });
  }
  if (ctx.waterfallPhase && task.phase && String(task.phase).toLowerCase() !== String(ctx.waterfallPhase).toLowerCase()) {
    constraints.push({ type: "phase_gate", phase: task.phase, activePhase: ctx.waterfallPhase, message: `Waterfall phase gate: task belongs to "${task.phase}", active phase is "${ctx.waterfallPhase}".` });
  }
  const notStarted = !["in_progress"].includes(String(task.status || "").toLowerCase()) && !["IN_PROGRESS", "REVIEW", "IN_REVIEW", "TESTING"].includes(task.kanbanStatus);
  if (ctx.wipBlocked && notStarted) {
    constraints.push({ type: "wip_limit", message: "Kanban WIP limit reached — new work cannot be pulled until a slot frees up." });
  }
  return { eligible: constraints.length === 0, constraints };
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

function prepareContext(context = {}) {
  if (context.__prepared) return context;
  const ctx = { ...context, __prepared: true };
  const resolved = resolvePriorityWeights(context.weights);
  ctx.effectiveWeights = resolved.weights;
  ctx.weightSource = resolved.source;
  ctx.weightErrors = resolved.errors;
  if (Array.isArray(context.allTasks) && context.allTasks.length) {
    const active = context.allTasks.filter((t) => !t.archivedAt);
    const { metrics } = dependencyMetrics(active, { withReach: true });
    ctx.metrics = metrics;
    ctx.taskById = new Map(active.map((t) => [idOf(t), t]));
  }
  return ctx;
}

export function computeTaskPriority(task, context) {
  const ctx = prepareContext(context);
  const now = ctx.now ?? Date.now();
  const manualOverride = Boolean(task.priorityLabel && String(task.priorityLabel).trim() !== "");
  const w = ctx.effectiveWeights;

  const rawFactors = {
    greedy: greedyFactor(task, ctx),
    deadline: deadlineFactor(task, now),
    value: valueFactor(task),
    risk: riskFactor(task, ctx),
    depth: depthFactor(task, ctx),
    skillGap: skillGapFactor(task, ctx),
    overload: overloadFactor(task, ctx),
  };

  let rawScore = 0;
  const factors = {};
  for (const key of FACTOR_KEYS) {
    const f = rawFactors[key];
    const s = Math.min(100, Math.max(0, Number.isFinite(f.score) ? f.score : 0));
    const contribution = w[key] * s;
    rawScore += contribution;
    factors[key] = {
      ...f,
      score: Math.round(s * 100) / 100,
      weight: w[key],
      contribution: Math.round(contribution * 100) / 100,
    };
  }
  rawScore = Math.min(100, Math.max(0, rawScore));
  const score = Math.min(100, Math.round(rawScore + ROUNDING_EPS));
  const eligibility = evaluateEligibility(task, ctx);

  const top = Object.entries(factors).sort((a, b) => b[1].contribution - a[1].contribution || cmpStr(a[0], b[0])).slice(0, 3);
  const reason = top.map(([key, f]) => `${f.reason} (${key}: ${Math.round(f.score)}/100)`).join("; ") + ".";

  return {
    score,
    rawScore: Math.round(rawScore * 1000) / 1000,
    tier: tierOf(score),
    factors,
    weights: { ...w },
    weightSource: ctx.weightSource,
    eligible: eligibility.eligible,
    constraints: eligibility.constraints,
    reason,
    deterministicTieBreak: "Tie-break: eligible first → score → greedy raw → title (code-unit) → ID (code-unit).",
    manualOverride,
  };
}

export function rankTasks(tasks, context = {}) {
  const ctx = prepareContext({ allTasks: tasks, ...context, now: context?.now ?? Date.now() });
  const computed = tasks.map((t) => ({ task: t, priorityResult: computeTaskPriority(t, ctx) }));
  computed.sort((a, b) => {
    const pa = a.priorityResult, pb = b.priorityResult;
    if (pa.eligible !== pb.eligible) return pa.eligible ? -1 : 1;
    if (pb.score !== pa.score) return pb.score - pa.score;
    const ga = pa.factors.greedy.raw, gb = pb.factors.greedy.raw;
    if (gb !== ga) return gb - ga;
    const ta = String(a.task.title || "").toLowerCase(), tb = String(b.task.title || "").toLowerCase();
    if (ta !== tb) return cmpStr(ta, tb);
    return cmpStr(String(a.task._id || ""), String(b.task._id || ""));
  });
  return computed.map((c, idx) => ({ ...c.task, priorityResult: c.priorityResult, rank: idx + 1 }));
}

export { WEIGHTS as DEFAULT_WEIGHTS, TIER_CRITICAL, TIER_HIGH, TIER_MEDIUM };
