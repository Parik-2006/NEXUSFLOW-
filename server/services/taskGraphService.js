/**
 * taskGraphService.js — authoritative maintenance of dependency-derived task
 * fields and the persisted greedy priority (Phase 3, audit D-20 / D-21).
 *
 * Derived fields (never trusted from clients):
 *   dependencyCount  = number of DISTINCT, ACTIVE (non-archived) prerequisites
 *                      of the task inside its workspace (in-degree)
 *   dependentCount   = number of DISTINCT, ACTIVE tasks in the workspace that
 *                      list this task as a prerequisite (out-degree) — the
 *                      quantity the greedy scheduler rewards
 *   priorityScore    = computePriorityScore(urgency, impact, dependentCount)
 *
 * Concurrency strategy
 *   • priorityScore is recomputed with an aggregation-pipeline update, which
 *     MongoDB evaluates atomically per document against its CURRENT persisted
 *     fields — there is no read-modify-write window, and concurrent partial
 *     updates (e.g. urgency and impact changed by different requests) always
 *     converge to the score of the final document state.
 *   • dependency counts are derived from a workspace-wide aggregation; runs are
 *     serialised per workspace inside this process and a request arriving
 *     during a run schedules exactly one follow-up run, so the last run always
 *     observes the latest graph. (Multi-instance deployments converge on the
 *     next mutation; documented in the Phase 3 report.)
 */
import mongoose from "mongoose";
import { GREEDY_WEIGHTS, DEP_CAP, ROUNDING_EPS } from "../algorithms/greedyScheduler.js";

const Task = () => mongoose.model("Task");

/** Aggregation expression equal to computePriorityScore():
 *  Math.round(y) ≡ floor(y + 0.5) for y ≥ 0, with y = raw·100 + ROUNDING_EPS,
 *  evaluated in the same operation order as the JavaScript implementation. */
export function priorityScoreExpression(weights = GREEDY_WEIGHTS) {
  const clamp = (field, lo, hi, dflt) => ({
    $min: [{ $max: [{ $convert: { input: field, to: "double", onError: dflt, onNull: dflt } }, lo] }, hi],
  });
  const u = { $divide: [{ $subtract: [clamp("$urgency", 1, 5, 1), 1] }, 4] };
  const i = { $divide: [{ $subtract: [clamp("$impact", 1, 5, 1), 1] }, 4] };
  const d = { $divide: [clamp("$dependentCount", 0, DEP_CAP, 0), DEP_CAP] };
  const raw = {
    $add: [
      { $add: [{ $multiply: [weights.urgency, u] }, { $multiply: [weights.impact, i] }] },
      { $multiply: [weights.dependents, d] },
    ],
  };
  return { $floor: { $add: [{ $add: [{ $multiply: [raw, 100] }, ROUNDING_EPS] }, 0.5] } };
}

/** Atomically recompute priorityScore for the given filter (pipeline update). */
export async function recomputePriorityScores(filter) {
  if (!filter) return { modified: 0 };
  const r = await Task().updateMany(filter, [{ $set: { priorityScore: priorityScoreExpression() } }], {
    includeArchived: true,
    __skipPriorityHook: true,
  });
  return { modified: r.modifiedCount ?? 0 };
}

const running = new Map(); // teamId -> { promise, rerun }

async function recomputeOnce(teamId) {
  const T = Task();
  const tid = new mongoose.Types.ObjectId(String(teamId));
  // Active tasks of the workspace (archive plugin hides archived ones).
  const tasks = await T.find({ teamId: tid }).select("_id dependencies dependencyCount dependentCount").lean();
  const ids = new Set(tasks.map((t) => String(t._id)));
  const prereq = new Map();
  const dependents = new Map();
  for (const t of tasks) {
    const self = String(t._id);
    const uniq = new Set();
    for (const d of t.dependencies ?? []) {
      const ds = String(d);
      if (ds !== self && ids.has(ds)) uniq.add(ds);
    }
    prereq.set(self, uniq.size);
    for (const ds of uniq) dependents.set(ds, (dependents.get(ds) ?? 0) + 1);
  }
  const ops = [];
  const changed = [];
  for (const t of tasks) {
    const id = String(t._id);
    const nIn = prereq.get(id) ?? 0;
    const nOut = dependents.get(id) ?? 0;
    if ((t.dependencyCount ?? 0) !== nIn || (t.dependentCount ?? 0) !== nOut || t.dependentCount === undefined) {
      ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { dependencyCount: nIn, dependentCount: nOut } } } });
      changed.push(t._id);
    }
  }
  if (ops.length) await T.bulkWrite(ops, { ordered: false });
  if (changed.length) await recomputePriorityScores({ _id: { $in: changed } });
  return { tasks: tasks.length, updated: changed.length };
}

/**
 * recomputeDependencyMetrics(teamId) — serialised per workspace; resolves when
 * a run that started after this call has completed.
 */
export function recomputeDependencyMetrics(teamId) {
  if (!teamId || !mongoose.isValidObjectId(String(teamId))) return Promise.resolve({ tasks: 0, updated: 0 });
  const key = String(teamId);
  const entry = running.get(key);
  if (entry) {
    if (!entry.rerun) {
      const startNext = () => {
        const next = recomputeOnce(key);
        running.set(key, { promise: next, rerun: null });
        next.catch(() => {}).finally(() => { if (running.get(key)?.promise === next) running.delete(key); });
        return next;
      };
      entry.rerun = entry.promise.then(startNext, startNext);
    }
    return entry.rerun;
  }
  const promise = recomputeOnce(key);
  running.set(key, { promise, rerun: null });
  promise.catch(() => {}).finally(() => { if (running.get(key)?.promise === promise) running.delete(key); });
  return promise;
}

/** Recompute for several workspaces (deduplicated). Never throws. */
export async function recomputeForTeams(teamIds) {
  const uniq = [...new Set((teamIds || []).filter(Boolean).map(String))];
  await Promise.all(uniq.map((t) => recomputeDependencyMetrics(t).catch((e) => {
    console.warn(`[taskGraph] recompute failed for team ${t}: ${e.message}`);
  })));
}
