/**
 * Branch and Bound – Optimal Task-Member Assignment Engine
 * =========================================================
 * NexusFlow | server/algorithms/branchAndBound.js
 *
 * Problem modelled as the Assignment Problem (Hungarian / B&B variant):
 *   Given n tasks and m members, find a minimum-cost bijective mapping
 *   task -> member such that total skill-gap cost is minimised.
 *
 * Cost function for assigning task j to member i:
 *   cost(i, j) = Sum_k  max(0, task[j].skillWeights[k] - member[i].skills[k])
 *
 * That is: we pay for each skill dimension where the member falls short of
 * the task demand. A perfect fit costs 0. Over-qualification costs 0 on that
 * dimension (no penalty).
 *
 * When tasks > members, some members handle multiple tasks (best-fit greedy
 * fallback after B&B saturates the square sub-problem).
 * When members > tasks, not all members are assigned (standard surplus).
 *
 * Algorithm outline (B&B on a state-space tree):
 *   Node state  : partial assignment (taskIdx -> memberIdx) for tasks 0..depth-1
 *   Lower bound : costSoFar + sum of row-minimum costs for unassigned tasks
 *                 (admissible: never overestimates the remaining optimum)
 *   Branch      : try each free member for the next unassigned task
 *   Prune       : discard node when lower bound >= current best solution cost
 *
 * Complexity:
 *   Time  – O(n! / pruning) worst-case; O(n^2) to O(n^3) in practice for n<=20.
 *   Space – O(n^2) for the cost matrix + O(n) per stack frame.
 */

const SKILL_KEYS = ["frontend", "backend", "devops", "design", "ml", "testing"];

// ── Skill-demand inference (cost-matrix input only — solver untouched) ────────
//
// BUG FIX: tasks created through the app (socket create, AI decomposition,
// starter tasks) never populate `skillWeights`; the schema defaults every
// dimension to 0. With demand ≡ 0, cost(i,j) = Σ max(0, 0 − supply) = 0 for
// EVERY cell, so the matrix was all zeros and every assignment looked like a
// "perfect fit". Explicit skillWeights (e.g. seeded demo tasks) remain
// authoritative; for all other tasks the demand profile is DERIVED from the
// task's own data — category, title/description keywords, urgency and impact —
// so nothing is hardcoded per task and no schema/API changes are needed.

/** Keyword evidence per skill dimension (matched on title + description). */
const SKILL_HINTS = {
  frontend: /\b(front[- ]?end|ui|screen|page|dashboard|component|client|react|web app)\b/i,
  backend:  /\b(back[- ]?end|api|database|schema|server|service|auth|login|payment|order|storage|rest)\b/i,
  devops:   /\b(devops|deploy(ment)?|ci\/?cd|pipeline|docker|infra(structure)?|monitor(ing)?|alert(ing)?|cloud|provision|hardware|sensor|microcontroller)\b/i,
  design:   /\b(design|ux|wireframe|mock-?up|prototype|figma|branding)\b/i,
  ml:       /\b(ml|machine learning|model|dataset|training|label(l)?ing|prediction|ai)\b/i,
  testing:  /\b(test(s|ing)?|qa|quality|acceptance|bug|regression)\b/i,
};

/** Category → skill dimensions (first entry = primary demand). */
const CATEGORY_SKILLS = {
  frontend: ["frontend", "design"],
  "ui/ux": ["design", "frontend"],
  design: ["design"],
  backend: ["backend"],
  integration: ["backend", "devops"],
  deployment: ["devops"],
  devops: ["devops"],
  hardware: ["devops"],
  "ai / ml": ["ml"],
  ai: ["ml"],
  ml: ["ml"],
  testing: ["testing"],
  qa: ["testing"],
};

/**
 * Derive a task's skill-demand profile from its own attributes.
 *
 * Demand intensity scales with the task's urgency and impact (each 1–5):
 *   primary  = 4 + 0.6·(urgency + impact)  → 5..10  (rounded, capped at 10)
 *   secondary = 50% of primary             (supporting dimensions)
 * A critical Backend task therefore demands backend ≈ 9–10, while a routine
 * one demands ≈ 5–6 — derived, never hardcoded per task.
 *
 * Tasks with no skill evidence at all (e.g. "Planning", "Research") get a
 * light uniform demand across every dimension, so stronger all-round members
 * stay cheaper without favouring any single specialism.
 */
function deriveSkillDemand(task) {
  const urgency = Number(task.urgency) || 1;
  const impact  = Number(task.impact)  || 1;
  const primary   = Math.min(10, Math.round(4 + 0.6 * (urgency + impact)));
  const secondary = Math.max(1, Math.round(primary * 0.5));

  // Ordered evidence: category mapping first (primary), then keyword hits.
  const ordered = [];
  const seen = new Set();
  const push = (k) => { if (!seen.has(k)) { seen.add(k); ordered.push(k); } };

  const cat = String(task.category ?? "").toLowerCase().trim();
  (CATEGORY_SKILLS[cat] ?? []).forEach(push);

  const text = `${task.title ?? ""} ${task.description ?? ""}`;
  for (const key of SKILL_KEYS) if (SKILL_HINTS[key].test(text)) push(key);

  const demand = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0]));
  if (ordered.length === 0) {
    const light = Math.max(1, Math.round(primary * 0.4));
    for (const key of SKILL_KEYS) demand[key] = light;
    return demand;
  }
  ordered.forEach((key, i) => { demand[key] = i === 0 ? primary : secondary; });
  return demand;
}

/**
 * Effective demand profile for a task: explicit skillWeights win when any
 * dimension is positive; otherwise infer from category/keywords/priority.
 */
function effectiveDemand(task) {
  const explicit = task.skillWeights ?? {};
  const hasExplicit = SKILL_KEYS.some((key) => (explicit?.[key] ?? 0) > 0);
  return hasExplicit ? explicit : deriveSkillDemand(task);
}

/**
 * Build an (nMembers x nTasks) cost matrix.
 *
 * matrix[memberIdx][taskIdx] = skill-gap cost of assigning that task to that member.
 *
 *   cost(i, j) = Σ_k max(0, demand_j[k] − supply_i[k])
 *
 * cost = 0  ⇔ the member meets or exceeds EVERY demanded dimension (true
 * perfect fit). A member short by s points on a demanded skill pays exactly s.
 */
export function buildCostMatrix(members, tasks) {
  const demands = tasks.map(effectiveDemand); // derive once per task, not per cell
  return members.map((member) =>
    demands.map((demand) =>
      SKILL_KEYS.reduce((acc, key) => {
        const supply = member.skills?.[key] ?? 5;
        return acc + Math.max(0, (demand?.[key] ?? 0) - supply);
      }, 0)
    )
  );
}

/**
 * Admissible lower bound at a B&B node.
 *
 * For each task not yet assigned (index >= depth), take the minimum cost
 * across all members still available. This sum added to costSoFar can never
 * exceed the true optimal remaining cost, making it admissible.
 */
function computeLowerBound(costMatrix, usedMembers, depth, nTasks, costSoFar) {
  const nMembers = costMatrix.length;
  let bound = costSoFar;

  for (let t = depth; t < nTasks; t++) {
    let minCost = Infinity;
    for (let m = 0; m < nMembers; m++) {
      if (!usedMembers[m] && costMatrix[m][t] < minCost) {
        minCost = costMatrix[m][t];
      }
    }
    // Fallback when all members are used (surplus tasks): use global column min.
    if (minCost === Infinity) {
      for (let m = 0; m < nMembers; m++) {
        if (costMatrix[m][t] < minCost) minCost = costMatrix[m][t];
      }
    }
    bound += minCost;
  }
  return bound;
}

/**
 * Core solver: iterative DFS with explicit stack to avoid call-stack overflow.
 */
function solveBnB(costMatrix, nTasks) {
  const nMembers   = costMatrix.length;
  const n          = Math.min(nMembers, nTasks);

  let bestCost       = Infinity;
  let bestAssignment = new Array(n).fill(-1);
  let nodesExplored  = 0;
  let nodesPruned    = 0;

  // Each stack entry holds the full state needed to resume a branch.
  const stack = [{
    depth:       0,
    assignment:  new Array(n).fill(-1),
    usedMembers: new Array(nMembers).fill(false),
    costSoFar:   0,
  }];

  while (stack.length > 0) {
    const { depth, assignment, usedMembers, costSoFar } = stack.pop();
    nodesExplored++;

    if (depth === n) {
      // Leaf node: complete assignment found.
      if (costSoFar < bestCost) {
        bestCost       = costSoFar;
        bestAssignment = [...assignment];
      }
      continue;
    }

    // Try assigning each available member to the current task (index = depth).
    for (let m = 0; m < nMembers; m++) {
      if (usedMembers[m]) continue;

      const edgeCost  = costMatrix[m][depth];
      const newCost   = costSoFar + edgeCost;

      // Build next state.
      const newUsed   = [...usedMembers];
      newUsed[m]      = true;

      const lb = computeLowerBound(costMatrix, newUsed, depth + 1, n, newCost);

      if (lb >= bestCost) {
        // Prune: this branch cannot improve the current best.
        nodesPruned++;
        continue;
      }

      const newAssign  = [...assignment];
      newAssign[depth] = m;

      stack.push({
        depth:       depth + 1,
        assignment:  newAssign,
        usedMembers: newUsed,
        costSoFar:   newCost,
      });
    }
  }

  return { assignment: bestAssignment, cost: bestCost, nodesExplored, nodesPruned };
}

/**
 * Public API: optimal task-to-member assignment using Branch and Bound.
 *
 * Handles rectangular inputs:
 *   tasks <= members : solve full B&B; optimal assignment for all tasks.
 *   tasks >  members : solve B&B for first `nMembers` tasks (square sub-problem),
 *                      greedy best-fit for overflow tasks.
 *
 * @param {Array}  members  - TeamMember sub-documents (must have .userId, .skills).
 * @param {Array}  tasks    - Task documents (must have ._id, .skillWeights).
 * @returns {{
 *   assignments  : Array<{ taskId, memberId, cost }>,
 *   totalCost    : number,
 *   costMatrix   : number[][],
 *   meta         : object
 * }}
 */
export function assignTasksToMembers(members, tasks) {
  if (!members.length || !tasks.length) {
    return { assignments: [], totalCost: 0, costMatrix: [], meta: {} };
  }

  const costMatrix = buildCostMatrix(members, tasks);
  const nMembers   = members.length;
  const nTasks     = tasks.length;

  const assignments = [];
  let   totalCost   = 0;

  // --- B&B on the square (or under-determined) sub-problem ---
  const bSquareTasks = Math.min(nTasks, nMembers);
  const squareCost   = costMatrix.map((row) => row.slice(0, bSquareTasks));
  const result       = solveBnB(squareCost, bSquareTasks);

  const memberLoad = new Array(nMembers).fill(0);

  for (let t = 0; t < bSquareTasks; t++) {
    const mIdx = result.assignment[t];
    if (mIdx === -1) continue;
    assignments.push({
      taskId:   tasks[t]._id.toString(),
      memberId: members[mIdx].userId.toString(),
      cost:     costMatrix[mIdx][t],
    });
    totalCost += costMatrix[mIdx][t];
    memberLoad[mIdx]++;
  }

  // --- Greedy best-fit for overflow tasks (when tasks > members) ---
  for (let t = nMembers; t < nTasks; t++) {
    let bestM    = 0;
    let bestCost = Infinity;
    for (let m = 0; m < nMembers; m++) {
      // Penalise already-loaded members slightly to balance workload.
      const effective = costMatrix[m][t] + memberLoad[m] * 0.5;
      if (effective < bestCost) { bestCost = effective; bestM = m; }
    }
    assignments.push({
      taskId:   tasks[t]._id.toString(),
      memberId: members[bestM].userId.toString(),
      cost:     costMatrix[bestM][t],
    });
    totalCost += costMatrix[bestM][t];
    memberLoad[bestM]++;
  }

  return {
    assignments,
    totalCost,
    costMatrix,
    meta: {
      nodesExplored : result.nodesExplored,
      nodesPruned   : result.nodesPruned,
      pruningRatio  : result.nodesExplored > 0
        ? ((result.nodesPruned / result.nodesExplored) * 100).toFixed(1) + "%"
        : "N/A",
      algorithm : "Branch and Bound – Assignment Problem",
      complexity: {
        time : "O(n! / pruning)  practical O(n^2 to n^3)  n=members",
        space: "O(n^2) cost matrix + O(n) stack depth",
      },
    },
  };
}
