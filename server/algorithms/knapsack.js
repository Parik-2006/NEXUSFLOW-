/**
 * knapsack.js — canonical 0/1 Knapsack for NEXUSFLOW sprint planning (Phase 3, D-26)
 * ============================================================================
 *
 * PROBLEM   maximise Σ value_i·x_i  subject to  Σ effort_i·x_i ≤ capacity,
 *           x_i ∈ {0, 1} (each task at most once).
 *
 * DISCRETISATION (exact for the supported precision)
 *   Effort and capacity are converted to integer units of 1/scale (default
 *   scale = 100 → 0.01 h). Rounding policy:
 *     weightUnits   = ceil(effort · scale)     (never under-counts a task)
 *     capacityUnits = floor(capacity · scale)  (never over-states capacity)
 *   so a selection that fits in units always fits the ORIGINAL capacity.
 *   A tolerance of 1e-9 absorbs binary floating-point noise (2.3·100 =
 *   229.99999999999997 → 230). Inputs with ≤ 2 decimals are represented exactly.
 *
 * INPUT POLICY
 *   • capacity must be finite and ≥ 0 (otherwise status "invalid_capacity")
 *   • effort: missing / non-finite / negative → rejected with a reason
 *   • effort 0 is allowed (consumes no capacity; selected when value > 0)
 *   • value: non-finite / negative → rejected; value 0 is never selected
 *   • duplicate ids: first occurrence kept, later ones rejected
 *
 * ALGORITHM  bottom-up DP over capacity with a decision bit-table for exact
 *   reconstruction.  Time O(n·W), space O(W) values + O(n·W) bytes of
 *   decisions, where W = capacityUnits. This is pseudo-polynomial: polynomial in
 *   the numeric VALUE of W, exponential in its bit length.
 *
 * TIE-BREAKING  items are processed in canonical id order (code-unit). Among
 *   equal-value solutions the DP keeps the one with SMALLER total effort; any
 *   remaining tie keeps the earlier decision (exclusion). Deterministic.
 *
 * WORKLOAD GUARD  if n·(W+1) > maxCells (default 20 000 000) the exact DP is
 *   NOT run; a deterministic approximation is returned instead:
 *   max(greedy by value/effort ratio, best single item) — guaranteed ≥ 50 % of
 *   the optimum — and labelled exact:false.
 */

const EPS = 1e-9;
export const DEFAULT_SCALE = 100;
export const DEFAULT_MAX_CELLS = 20_000_000;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function toUnits(x, scale, mode) {
  const v = x * scale;
  return mode === "ceil" ? Math.ceil(v - EPS) : Math.floor(v + EPS);
}

/**
 * solveKnapsack(items, capacity, options)
 * @param {Array<{id:string, effort:number, value:number, [k:string]:any}>} items
 * @param {number} capacity
 * @param {{scale?:number, maxCells?:number}} options
 */
export function solveKnapsack(items, capacity, { scale = DEFAULT_SCALE, maxCells = DEFAULT_MAX_CELLS } = {}) {
  const t0 = performance.now();
  const rejected = [];
  if (!Number.isFinite(capacity) || capacity < 0) {
    return {
      status: "invalid_capacity", exact: true, selected: [], totalValue: 0, totalEffort: 0,
      capacity, capacityUnits: 0, rejected: (items ?? []).map((it) => ({ id: it?.id, reason: "invalid_capacity" })),
      meta: { algorithm: "0/1 Knapsack (bottom-up DP)", n: 0, W: 0, cells: 0, durationMs: performance.now() - t0 },
    };
  }
  const seen = new Set();
  const valid = [];
  for (const it of items ?? []) {
    const id = it?.id === undefined || it?.id === null ? null : String(it.id);
    if (id === null) { rejected.push({ id: null, reason: "missing_id" }); continue; }
    if (seen.has(id)) { rejected.push({ id, reason: "duplicate_id" }); continue; }
    seen.add(id);
    const effort = it.effort === null || it.effort === undefined || it.effort === "" ? NaN : Number(it.effort);
    const value = Number(it.value);
    if (!Number.isFinite(effort)) { rejected.push({ id, reason: "missing_or_invalid_effort" }); continue; }
    if (effort < 0) { rejected.push({ id, reason: "negative_effort" }); continue; }
    if (!Number.isFinite(value) || value < 0) { rejected.push({ id, reason: "invalid_value" }); continue; }
    valid.push({ ...it, id, effort, value, units: toUnits(effort, scale, "ceil") });
  }
  valid.sort((a, b) => cmp(a.id, b.id));
  const W = toUnits(capacity, scale, "floor");
  const n = valid.length;
  const cells = n * (W + 1);

  const finish = (selectedIdx, exact, extra = {}) => {
    const selected = selectedIdx.map((i) => valid[i]);
    const totalValue = selected.reduce((s, x) => s + x.value, 0);
    const totalUnits = selected.reduce((s, x) => s + x.units, 0);
    const totalEffort = selected.reduce((s, x) => s + x.effort, 0);
    return {
      status: "ok",
      exact,
      selected,
      selectedIds: selected.map((x) => x.id),
      totalValue,
      totalEffort: Math.round(totalEffort * 1e6) / 1e6,
      totalUnits,
      capacity,
      capacityUnits: W,
      capacityLeft: Math.max(0, Math.round((capacity - totalEffort) * 1e6) / 1e6),
      utilizationPct: capacity > 0 ? Math.round((totalEffort / capacity) * 1000) / 10 : 0,
      candidates: valid,
      rejected,
      meta: {
        algorithm: exact ? "0/1 Knapsack (bottom-up DP, exact)" : "Greedy ratio + best single item (approximate, ≥ 50% of optimum)",
        n, W, cells, scale, maxCells,
        complexity: exact ? { time: "O(n·W)", space: "O(W) + O(n·W) bits" } : { time: "O(n log n)", space: "O(n)" },
        durationMs: Math.round((performance.now() - t0) * 1000) / 1000,
        ...extra,
      },
    };
  };

  if (n === 0) return finish([], true);

  if (cells > maxCells) {
    // Deterministic approximation (classic modified greedy, ratio ≥ 1/2).
    const order = valid.map((_, i) => i).sort((a, b) => {
      const A = valid[a], B = valid[b];
      const ra = A.units === 0 ? Infinity : A.value / A.units;
      const rb = B.units === 0 ? Infinity : B.value / B.units;
      if (ra !== rb) return rb - ra;
      return cmp(A.id, B.id);
    });
    let used = 0, val = 0;
    const greedy = [];
    for (const i of order) {
      if (valid[i].value <= 0) continue;
      if (used + valid[i].units <= W) { greedy.push(i); used += valid[i].units; val += valid[i].value; }
    }
    let best = -1;
    for (let i = 0; i < n; i++) if (valid[i].units <= W && valid[i].value > 0 && (best < 0 || valid[i].value > valid[best].value)) best = i;
    const pick = best >= 0 && valid[best].value > val ? [best] : greedy;
    return finish(pick.sort((a, b) => a - b), false, { reason: `workload n·(W+1) = ${cells} exceeds the exact limit of ${maxCells} cells` });
  }

  // Exact DP: dp[w] = best value with capacity w; dw[w] = its total units.
  const dp = new Float64Array(W + 1);
  const dw = new Float64Array(W + 1);
  const take = new Uint8Array(cells); // take[i*(W+1)+w] = 1 if item i taken at capacity w
  for (let i = 0; i < n; i++) {
    const wi = valid[i].units, vi = valid[i].value;
    if (vi <= 0 || wi > W) continue;
    const row = i * (W + 1);
    for (let w = W; w >= wi; w--) {
      const cand = dp[w - wi] + vi;
      const candW = dw[w - wi] + wi;
      if (cand > dp[w] + EPS || (Math.abs(cand - dp[w]) <= EPS && candW < dw[w])) {
        dp[w] = cand;
        dw[w] = candW;
        take[row + w] = 1;
      }
    }
  }
  const sel = [];
  let w = W;
  for (let i = n - 1; i >= 0; i--) {
    if (take[i * (W + 1) + w]) { sel.push(i); w -= valid[i].units; }
  }
  return finish(sel.reverse(), true);
}

/** Exhaustive reference (2^n) — for tests only. */
export function bruteForceKnapsack(items, capacity, { scale = DEFAULT_SCALE } = {}) {
  const W = toUnits(capacity, scale, "floor");
  const list = items.map((it) => ({ ...it, units: toUnits(it.effort, scale, "ceil") }));
  let best = 0;
  for (let mask = 0; mask < 1 << list.length; mask++) {
    let u = 0, v = 0;
    for (let i = 0; i < list.length; i++) if (mask & (1 << i)) { u += list[i].units; v += list[i].value; }
    if (u <= W && v > best) best = v;
  }
  return best;
}
