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

/** Graph signature: ids + their (sorted) prerequisites. Count writes never change it. */
function graphSignature(tasks) {
  return tasks.map((t) => `${t._id}:${(t.dependencies || []).map(String).sort().join(",")}`).sort().join("|");
}

/** Test hook: runs between the read and the write of a recompute pass. */
export const taskGraphTestHooks = { betweenReadAndWrite: null };

/**
 * Phase 4 (15.10): stale-revision detection. After writing, the graph is
 * re-read; if another writer (possibly another server process) changed it in
 * the meantime the pass is repeated (bounded), so a recompute that started
 * before a concurrent mutation cannot leave stale counts behind.
 */
async function recomputeOnce(teamId) {
  let last;
  for (let pass = 1; pass <= 3; pass++) {
    last = await recomputePass(teamId);
    const after = await Task().find({ teamId: new mongoose.Types.ObjectId(String(teamId)) }).select("_id dependencies").lean();
    if (graphSignature(after) === last.signature) return { tasks: last.tasks, updated: last.updated, passes: pass };
  }
  return { tasks: last.tasks, updated: last.updated, passes: 3, unstable: true };
}

async function recomputePass(teamId) {
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
  if (taskGraphTestHooks.betweenReadAndWrite) await taskGraphTestHooks.betweenReadAndWrite(teamId);
  if (ops.length) await T.bulkWrite(ops, { ordered: false });
  if (changed.length) await recomputePriorityScores({ _id: { $in: changed } });
  return { tasks: tasks.length, updated: changed.length, signature: graphSignature(tasks) };
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

/**
 * planTaskGraphBackfill() — READ-ONLY. For every workspace, reports how many
 * active tasks would change dependencyCount, dependentCount or priorityScore
 * if derived fields were recomputed from the persisted graph (legacy documents
 * written before Phase 3 store the prerequisite count and an old-formula score).
 * Returns counts and ids only. Performs no writes.
 */
export async function planTaskGraphBackfill({ teamIds } = {}) {
  const { computePriorityScore } = await import("../algorithms/greedyScheduler.js");
  const T = Task();
  const teams = teamIds?.length ? teamIds.map(String) : (await T.distinct("teamId")).map(String);
  const report = [];
  const failed = [];
  for (const teamId of teams) {
    let tasks;
    try {
      tasks = await T.find({ teamId }).select("_id dependencies dependencyCount dependentCount priorityScore urgency impact").lean();
    } catch (e) {
      failed.push({ teamId, error: e?.name || "Error" }); // Phase 4: one bad workspace never aborts the report
      continue;
    }
    const ids = new Set(tasks.map((t) => String(t._id)));
    const prereq = new Map(), dependents = new Map();
    for (const t of tasks) {
      const self = String(t._id);
      const uniq = new Set((t.dependencies ?? []).map(String).filter((d) => d !== self && ids.has(d)));
      prereq.set(self, uniq.size);
      for (const d of uniq) dependents.set(d, (dependents.get(d) ?? 0) + 1);
    }
    let countChanges = 0, scoreChanges = 0;
    const sample = [];
    for (const t of tasks) {
      const id = String(t._id);
      const nIn = prereq.get(id) ?? 0, nOut = dependents.get(id) ?? 0;
      const score = computePriorityScore({ urgency: t.urgency, impact: t.impact, dependentCount: nOut });
      const countDiff = (t.dependencyCount ?? null) !== nIn || (t.dependentCount ?? null) !== nOut;
      const scoreDiff = t.priorityScore !== score;
      if (countDiff) countChanges++;
      if (scoreDiff) scoreChanges++;
      if ((countDiff || scoreDiff) && sample.length < 5) sample.push(id);
    }
    report.push({ teamId, activeTasks: tasks.length, countChanges, scoreChanges, sampleTaskIds: sample });
  }
  return {
    workspaces: report.length,
    workspacesNeedingBackfill: report.filter((r) => r.countChanges || r.scoreChanges).length,
    failedWorkspaces: failed,
    tasksWithCountChanges: report.reduce((s, r) => s + r.countChanges, 0),
    tasksWithScoreChanges: report.reduce((s, r) => s + r.scoreChanges, 0),
    perWorkspace: report,
  };
}

/** applyTaskGraphBackfill() — writes derived fields for every workspace (explicit opt-in only). */
export async function applyTaskGraphBackfill({ teamIds } = {}) {
  const T = Task();
  const teams = teamIds?.length ? teamIds.map(String) : (await T.distinct("teamId")).map(String);
  let updated = 0;
  const failed = [];
  for (const teamId of teams) {
    try {
      const r = await recomputeDependencyMetrics(teamId);
      updated += r.updated;
      // Old-formula scores on tasks whose counts were already correct.
      await recomputePriorityScores({ teamId: new mongoose.Types.ObjectId(teamId) });
    } catch (e) {
      failed.push({ teamId, error: e?.name || "Error" }); // continue; re-running is idempotent
    }
  }
  return { workspaces: teams.length, countUpdates: updated, failedWorkspaces: failed };
}
