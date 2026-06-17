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

/**
 * Build an (nMembers x nTasks) cost matrix.
 *
 * matrix[memberIdx][taskIdx] = skill-gap cost of assigning that task to that member.
 */
export function buildCostMatrix(members, tasks) {
  return members.map((member) =>
    tasks.map((task) =>
      SKILL_KEYS.reduce((acc, key) => {
        const demand = task.skillWeights?.[key] ?? 0;
        const supply = member.skills?.[key] ?? 5;
        return acc + Math.max(0, demand - supply);
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
