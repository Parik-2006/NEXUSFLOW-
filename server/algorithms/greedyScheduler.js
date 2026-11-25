/**
 * greedyScheduler.js
 * ------------------
 * Greedy Priority Scheduling Engine for NexusFlow.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALGORITHM IDENTITY:  GreedyPriorityScheduler                           ║
 * ║  ──────────────────────────────────────────────────────────────────────  ║
 * ║  Problem solved : "In what ORDER should we work tasks?" (prioritisation) ║
 * ║  Greedy key     : composite weight of urgency + impact + dependency fan-in║
 * ║  Output         : priorityScore (0–100) → descending task ordering        ║
 * ║                                                                          ║
 * ║  ⚠ DO NOT CONFUSE with GreedySprintRanking (taskOptimiser.js), which     ║
 * ║    solves a DIFFERENT problem: "Which tasks give the best ROI per        ║
 * ║    story-point?" using a value/effort ratio. Different inputs, different  ║
 * ║    objective, different output. They are complementary, not duplicates.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ACADEMIC CONTEXT (DAA – 4th Semester)
 * ======================================
 * Algorithm family : Greedy Algorithm
 * Problem class    : Task Scheduling / Priority Queue Construction
 * Strategy         : At each step, greedily assign the maximum local
 *                    weight across three dimensions (urgency, impact,
 *                    dependency count) to produce a globally ordered
 *                    execution queue without look-ahead.
 *
 * WHY GREEDY WORKS HERE
 * ---------------------
 * Classic greedy scheduling (Earliest-Deadline-First, Weighted Job
 * Scheduling) proves optimal when tasks are independent and the
 * objective is to maximise total weighted throughput.  Our priority
 * score is a composite weight; ordering by it descending is provably
 * optimal for maximising the sum of completed-task weights under a
 * single-resource model (see: Graham, 1969 – "Bounds on Multiprocessing
 * Timing Anomalies").
 *
 * TIME COMPLEXITY
 * ---------------
 * computePriorityScore : O(1)   – constant arithmetic, no loops.
 * greedySortTasks      : O(n log n) – dominated by our hand-written
 *                        recursive Merge Sort (Divide & Conquer).
 *                        NO built-in Array.sort() is used anywhere.
 * Space                : O(n)   – merge buffers + O(log n) recursion stack.
 *
 * SCORE FORMULA — see "Constants & weight configuration" below (Phase 3).
 */

// --------------------------------------------------------------------------
// Constants & weight configuration (Phase 3 — validated, applied exactly once)
// --------------------------------------------------------------------------
//
// INPUT DOMAINS
//   urgency        integer-like in [1, 5]   (missing / non-finite → 1, the minimum)
//   impact         integer-like in [1, 5]   (missing / non-finite → 1)
//   dependentCount ≥ 0 — number of DIRECT DEPENDENTS (tasks this task unblocks,
//                  i.e. out-degree under the A → B "A before B" convention).
//                  Values above DEP_CAP saturate at 1.0. (Before Phase 3 the
//                  stored prerequisite count was used here — audit D-21.)
//
// NORMALISATION   u = (urgency − 1)/4,  i = (impact − 1)/4,  d = min(dep, CAP)/CAP
// SCORE           priorityScore = round(100 · (w_u·u + w_i·i + w_d·d)),  Σw = 1
//                 ⇒ every score is an integer in [0, 100]; all-max inputs give 100.

/** Maximum dependent count used for normalisation (saturation point). */
export const DEP_CAP = 20;

/** Scale the final score to a 0–100 integer for easy UI display. */
const SCALE = 100;

/** Rounding tolerance (half-up rounding robust to float noise). */
export const ROUNDING_EPS = 1e-9;

export const DEFAULT_GREEDY_WEIGHTS = Object.freeze({ urgency: 0.5, impact: 0.35, dependents: 0.15 });

/**
 * resolveWeights(raw, defaults) — shared weight contract.
 * Every weight must be a finite number ≥ 0 and their sum must be > 0; the set
 * is then normalised to sum to exactly 1. Unknown keys are ignored, missing
 * keys take the default. Returns { weights, valid, errors }.
 */
export function resolveWeights(raw, defaults) {
  const errors = [];
  const out = {};
  for (const key of Object.keys(defaults)) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, key) ? Number(raw[key]) : defaults[key];
    if (!Number.isFinite(v) || v < 0) { errors.push(`${key} must be a finite number ≥ 0`); out[key] = defaults[key]; }
    else out[key] = v;
  }
  let sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (!(sum > 0)) { errors.push("weights must not all be zero"); Object.assign(out, defaults); sum = Object.values(out).reduce((a, b) => a + b, 0); }
  if (errors.length) {
    // Invalid configuration never mixes with valid values: fall back entirely.
    const dSum = Object.values(defaults).reduce((a, b) => a + b, 0);
    return { weights: Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, v / dSum])), valid: false, errors };
  }
  return { weights: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v / sum])), valid: true, errors };
}

const envGreedy = resolveWeights(
  {
    urgency: process.env.GREEDY_W_URGENCY ?? DEFAULT_GREEDY_WEIGHTS.urgency,
    impact: process.env.GREEDY_W_IMPACT ?? DEFAULT_GREEDY_WEIGHTS.impact,
    dependents: process.env.GREEDY_W_DEPS ?? DEFAULT_GREEDY_WEIGHTS.dependents,
  },
  DEFAULT_GREEDY_WEIGHTS
);
if (!envGreedy.valid) console.warn(`[greedyScheduler] invalid GREEDY_W_* configuration (${envGreedy.errors.join("; ")}) — using defaults.`);

/** Effective (validated, normalised) greedy weights. */
export const GREEDY_WEIGHTS = Object.freeze(envGreedy.weights);

// --------------------------------------------------------------------------
// Core algorithm
// --------------------------------------------------------------------------

/**
 * computePriorityComponents — the un-rounded greedy evaluation with its
 * explanation. Pure and deterministic. O(1).
 * @returns {{ raw: number (0..1), score: number (0..100 integer),
 *             normalized: {urgency, impact, dependents}, inputs, weights }}
 */
export function computePriorityComponents({ urgency, impact, dependentCount } = {}, weights = GREEDY_WEIGHTS) {
  const U = clampOrDefault(urgency, 1, 5, 1);
  const I = clampOrDefault(impact, 1, 5, 1);
  const D = clampOrDefault(dependentCount, 0, Infinity, 0);
  const normalized = { urgency: (U - 1) / 4, impact: (I - 1) / 4, dependents: Math.min(D, DEP_CAP) / DEP_CAP };
  const raw = weights.urgency * normalized.urgency + weights.impact * normalized.impact + weights.dependents * normalized.dependents;
  // ROUNDING_EPS absorbs binary floating-point error at exact .5 boundaries
  // (e.g. 32.5 evaluates to 32.49999999999999); verified against an exact
  // integer reference for every input on the domain grid.
  return { raw, score: Math.round(raw * SCALE + ROUNDING_EPS), normalized, inputs: { urgency: U, impact: I, dependentCount: D }, weights };
}

/**
 * computePriorityScore — integer greedy priority in [0, 100]. O(1).
 * @param {{urgency?:number, impact?:number, dependentCount?:number}} params
 */
export function computePriorityScore(params = {}) {
  return computePriorityComponents(params).score;
}

// --------------------------------------------------------------------------
// MERGE SORT — Divide & Conquer sorting stage
// --------------------------------------------------------------------------
/**
 * ═══════════════════════════════════════════════════════════════
 * ALGORITHM IDENTITY : Merge Sort
 * Problem Solved     : Sorting tasks after priority calculation
 * Algorithm Family   : Divide and Conquer
 * Input              : Array of task objects (with priorityScore, createdAt)
 * Output             : Tasks sorted by descending priorityScore
 * Time Complexity    : O(n log n)  (best, average AND worst case)
 * Space Complexity   : O(n)
 * Stable             : Yes
 * ═══════════════════════════════════════════════════════════════
 *
 * HOW MERGE SORT WORKS (Divide & Conquer paradigm)
 * ------------------------------------------------
 *          [ unsorted array of n tasks ]
 *                      │
 *                   DIVIDE          split at the midpoint  → O(1)
 *                   ↓     ↓
 *        [ left half ]  [ right half ]
 *              │              │
 *           CONQUER        CONQUER    recursively sort each half
 *              │              │       (recursion bottoms out at n ≤ 1,
 *              ↓              ↓        a 1-element array is already sorted)
 *        [ sorted left ] [ sorted right ]
 *                   ↓     ↓
 *                   COMBINE           merge two sorted halves → O(n)
 *                      │
 *          [ fully sorted array ]
 *
 * Repeat until completely sorted. The recursion tree has ⌈log₂ n⌉
 * levels (the array is halved each time) and every level does O(n)
 * total merge work ⇒ O(n log n) overall.
 *
 * RECURRENCE RELATION (formal DAA proof)
 * --------------------------------------
 *   T(n) = 2·T(n/2) + O(n)
 * By the Master Theorem, case 2 (a = 2, b = 2, f(n) = Θ(n) = Θ(n^log₂2)):
 *   T(n) = Θ(n log n)
 *
 * WHY MERGE SORT WAS CHOSEN
 * -------------------------
 * 1. GUARANTEED O(n log n) — unlike Quick Sort, there is no O(n²)
 *    worst case; scheduling latency stays predictable at any n.
 * 2. STABLE — equal-score tasks keep their relative order, which is
 *    exactly what our FIFO (older-first) tie-breaker needs.
 * 3. TEXTBOOK DIVIDE & CONQUER — pairs pedagogically with the Greedy
 *    stage above: Greedy computes the key (priorityScore), Merge Sort
 *    orders by that key. Two DAA paradigms cooperating in one pipeline.
 */

/**
 * compareTasks
 * ------------
 * Purpose : Total ordering used by the merge step. Encodes EXACTLY the
 *           same rule as the previous Array.sort comparator:
 *             1. Higher priorityScore first (descending).
 *             2. On a tie, older createdAt first (FIFO fairness).
 * Input   : Two task objects a, b.
 * Output  : Negative ⇒ a comes before b; positive ⇒ b comes before a;
 *           zero ⇒ equivalent (merge then keeps a first ⇒ stability).
 * Time    : O(1) — a subtraction and, only on ties, two Date parses.
 * Space   : O(1).
 */
function compareTasks(a, b) {
  // Primary key: priorityScore DESCENDING (b − a, missing score → 0).
  const scoreDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  // Tie-break: createdAt ASCENDING — older task first (FIFO fairness).
  const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime();
  const ca = Number.isFinite(ta) ? ta : Infinity, cb = Number.isFinite(tb) ? tb : Infinity;
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0; // equal keys: Merge Sort stability keeps input order
}

/**
 * merge  (the COMBINE step of Divide & Conquer)
 * ---------------------------------------------
 * Purpose : Merge two ALREADY-SORTED arrays into one sorted array.
 *           This is where the actual ordering work of Merge Sort
 *           happens — the recursion only splits; merge sorts.
 * Input   : left, right — two arrays, each sorted by compareTasks.
 * Output  : New sorted array of length left.length + right.length.
 * Time    : O(n) — every element is inspected exactly once; the two
 *           pointers i and j only ever move forward.
 * Space   : O(n) — one output buffer holding all merged elements.
 *
 * Stability guarantee: the `<= 0` test takes the LEFT element when the
 * comparator says "equivalent". Since every left element originally
 * appeared BEFORE every right element, equal-key tasks never swap
 * relative order — this is what makes Merge Sort stable.
 */
function merge(left, right) {
  const result = [];
  let i = 0; // read pointer into left
  let j = 0; // read pointer into right

  // Walk both arrays simultaneously, always emitting the element that
  // must come first under compareTasks. Each iteration advances exactly
  // one pointer, so the loop runs left.length + right.length times.
  while (i < left.length && j < right.length) {
    if (compareTasks(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }

  // One side is now exhausted; the survivors of the other side are
  // already sorted and all belong at the end — append them verbatim.
  while (i < left.length) {
    result.push(left[i]);
    i += 1;
  }
  while (j < right.length) {
    result.push(right[j]);
    j += 1;
  }

  return result;
}

/**
 * mergeSort  (the DIVIDE + CONQUER steps)
 * ---------------------------------------
 * Purpose : Recursively sort an array of tasks by compareTasks using
 *           the classic top-down Merge Sort. NO Array.sort() anywhere.
 * Input   : tasks — array of task objects (not mutated).
 * Output  : New sorted array (descending priorityScore, FIFO on ties).
 * Time    : O(n log n) — recurrence T(n) = 2T(n/2) + O(n); the array
 *           halves per level ⇒ log₂ n levels × O(n) merge work each.
 * Space   : O(n) merge buffers + O(log n) recursion stack ⇒ O(n).
 */
function mergeSort(tasks) {
  // BASE CASE: an array of 0 or 1 elements is sorted by definition.
  // This is where the divide-and-conquer recursion terminates.
  if (tasks.length <= 1) return tasks;

  // DIVIDE: split at the midpoint into two roughly equal halves. O(1)
  // to compute the index; slice copies are counted in the O(n) space.
  const mid = Math.floor(tasks.length / 2);
  const leftHalf = tasks.slice(0, mid);
  const rightHalf = tasks.slice(mid);

  // CONQUER: recursively sort each half independently.
  // COMBINE: merge the two sorted halves into one sorted whole.
  return merge(mergeSort(leftHalf), mergeSort(rightHalf));
}

/**
 * greedySortTasks
 * ---------------
 * Given an array of task objects (each with a `priorityScore` field),
 * returns a **new array** sorted in descending priority order using the
 * hand-written Merge Sort above (Divide & Conquer) — Array.sort() is
 * deliberately NOT used, so the DAA algorithm is genuinely executed.
 *
 * Greedy rationale: processing the highest-score task first at every
 * scheduling step maximises the total weight of work completed before
 * any deadline, which is the greedy exchange argument for weighted
 * scheduling (if swapping two adjacent tasks improves total weight, the
 * current order is not optimal; ordering by score descending is the
 * fixed point of all such swaps).
 *
 * Tie-breaking: equal priority scores are ordered by `createdAt`
 * ascending (FIFO) to give older tasks precedence – fair and
 * predictable for sprint planning. Merge Sort's stability preserves
 * this even among tasks with identical scores AND identical timestamps.
 *
 * @param {Array<{priorityScore: number, createdAt: Date|string}>} tasks
 * @returns {Array} New array – original is not mutated.
 *
 * Complexity: O(n log n) time, O(n) space (Merge Sort).
 */
export function greedySortTasks(tasks) {
  // Spread-copy so the caller's array is never mutated, then delegate
  // the ordering entirely to our Divide & Conquer Merge Sort.
  return mergeSort([...tasks]);
}

// --------------------------------------------------------------------------
// Helper
// --------------------------------------------------------------------------

/** Clamp n to [min, max]; missing / non-numeric / non-finite → fallback. */
function clampOrDefault(n, min, max, fallback) {
  if (n === null || n === undefined || n === "") return fallback;
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
