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
 * SCORE FORMULA
 * -------------
 *   priorityScore = w_u * urgency
 *                 + w_i * impact
 *                 + w_d * min(dependencyCount, DEP_CAP) / DEP_CAP
 *
 * Weights (tunable via env-vars, defaults match academic literature on
 * weighted scheduling):
 *   w_u = 0.50  (urgency dominates – deadline pressure)
 *   w_i = 0.35  (business impact)
 *   w_d = 0.15  (structural fan-in: tasks many others depend on bubble up)
 *
 * All three components are normalised to [0, 1] before weighting so the
 * final score always lies in [0, 100].
 *
 * INPUT VALIDATION
 * ----------------
 * Every raw value is clamped with Math.min/max before arithmetic so that
 * malformed documents (e.g. urgency: 999) cannot corrupt the ordering.
 */

// --------------------------------------------------------------------------
// Constants & weight configuration
// --------------------------------------------------------------------------

/** Maximum dependency count used for normalisation (cap to avoid runaway). */
const DEP_CAP = 20;

/** Scale the final score to a 0–100 integer for easy UI display. */
const SCALE = 100;

/** Weight for urgency dimension (0-based, sum of all weights = 1.0). */
const W_URGENCY = parseFloat(process.env.GREEDY_W_URGENCY ?? "0.50");

/** Weight for impact dimension. */
const W_IMPACT = parseFloat(process.env.GREEDY_W_IMPACT ?? "0.35");

/** Weight for dependency-count dimension. */
const W_DEPS = parseFloat(process.env.GREEDY_W_DEPS ?? "0.15");

// --------------------------------------------------------------------------
// Core algorithm
// --------------------------------------------------------------------------

/**
 * computePriorityScore
 * --------------------
 * Pure function – no side effects, deterministic, safe to call in
 * pre-save hooks, API handlers, and unit tests alike.
 *
 * @param {object} params
 * @param {number} params.urgency         Raw urgency [1..5]  (1 = low, 5 = critical)
 * @param {number} params.impact          Raw impact  [1..5]  (1 = minor, 5 = strategic)
 * @param {number} params.dependencyCount Number of tasks that list this task
 *                                        as a prerequisite (fan-in count).
 * @returns {number} Integer priority score in [0, 100].
 *
 * Complexity: O(1) – six arithmetic operations, three clamps.
 */
export function computePriorityScore({ urgency = 1, impact = 1, dependencyCount = 0 }) {
  // Normalise each dimension to [0, 1].
  const u = (clamp(urgency, 1, 5) - 1) / 4;          // maps [1..5] → [0..1]
  const i = (clamp(impact, 1, 5) - 1) / 4;           // maps [1..5] → [0..1]
  const d = clamp(dependencyCount, 0, DEP_CAP) / DEP_CAP; // maps [0..cap] → [0..1]

  const raw = W_URGENCY * u + W_IMPACT * i + W_DEPS * d;
  return Math.round(raw * SCALE);
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
  return new Date(a.createdAt) - new Date(b.createdAt);
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

/** Clamp n to [min, max]. */
function clamp(n, min, max) {
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}
