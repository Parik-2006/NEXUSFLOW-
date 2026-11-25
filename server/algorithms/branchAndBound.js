/**
 * Branch and Bound — capacity-constrained task → member assignment (Phase 3, D-33)
 * ============================================================================
 * NexusFlow | server/algorithms/branchAndBound.js
 *
 * COST (unchanged, genuinely implemented factor)
 *   cost(i, j) = Σ_k max(0, demand_j[k] − supply_i[k])   over 6 skill keys
 *   demand = task.skillWeights when set, else derived from category / text /
 *   urgency / impact (deriveSkillDemand); supply = member.skills (missing → 5).
 *
 * HARD CONSTRAINTS
 *   • only registered members (with a userId) are assignable; members whose
 *     hour capacity is ≤ 0 (capacity − existing load) are unavailable
 *   • hour capacity: Σ estimatedHours of tasks given to member i ≤
 *     member.capacity (default 40) − existingLoadHours[i]. Tasks without an
 *     estimate consume 0 h (documented limitation).
 *   • balance cap: at most ⌈nTasks / nAvailableMembers⌉ tasks per member
 *     (generalises the former 1:1 square problem + greedy overflow).
 *
 * OBJECTIVE (lexicographic)  1) maximise the number of assigned tasks,
 *   2) minimise total skill-gap cost. Implemented as  cost + BIG·unassigned
 *   with BIG > any achievable total cost.
 *
 * EXACT SEARCH  depth-first Branch and Bound over ALL tasks (no input-order
 *   subset), canonical ordering:
 *     members by userId; tasks by decreasing regret (2nd-best − best cost),
 *     then id; branches tried cheapest member first, "leave unassigned" last.
 *   Incumbent initialised with the greedy solution. Lower bound for a node:
 *     costSoFar + Σ_remaining min_{currently feasible m} cost(m, t)  (BIG if none)
 *   — admissible because feasibility only shrinks as the search deepens, so a
 *   pruned branch (bound ≥ incumbent) can never contain a better solution.
 *   Worst case O(mⁿ); pruning does NOT make it polynomial.
 *
 * SAFEGUARDS  exact search only when nTasks ≤ maxExactTasks (16) and it
 *   finishes within maxNodes (200 000) nodes. Otherwise the best solution
 *   found (greedy + local improvement, or the B&B incumbent) is returned with
 *   exact:false, the termination reason and an admissible lower bound.
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

// ── Solver ────────────────────────────────────────────────────────────────────

export const ASSIGNMENT_LIMITS = Object.freeze({ maxExactTasks: 16, maxNodes: 200_000, maxTasks: 2000 });
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const num = (v, d) => (v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

function taskHours(t) {
  const h = Number(t?.estimatedHours);
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** Shared problem preparation (used by the solver and the exhaustive reference). */
export function prepareAssignmentProblem(members, tasks, options = {}) {
  const load = options.existingLoadHours ?? {};
  const unavailable = [];
  const avail = [];
  members.forEach((m, inputIndex) => {
    const userId = m?.userId ? String(m.userId?._id ?? m.userId) : null;
    if (!userId || m?.placeholder === true) { unavailable.push({ name: m?.name ?? "Member", reason: "placeholder member (not a registered user)" }); return; }
    const hourCap = num(m.capacity, 40) - num(load[userId], 0);
    if (!(hourCap > 0)) { unavailable.push({ memberId: userId, name: m.name, reason: "no remaining hour capacity" }); return; }
    avail.push({ m, inputIndex, userId, hourCap });
  });
  avail.sort((a, b) => cmpStr(a.userId, b.userId));
  const taskList = tasks.map((t, inputIndex) => ({ t, inputIndex, id: String(t._id), hours: taskHours(t) }));
  const fullMatrix = buildCostMatrix(members, tasks); // input order, for display
  const cost = avail.map((a) => taskList.map((tk) => fullMatrix[a.inputIndex][tk.inputIndex]));
  const balanceCap = avail.length ? Math.max(1, Math.ceil(taskList.length / avail.length)) : 0;
  const capOverride = options.maxTasksPerMember;
  return {
    avail, unavailable, taskList, cost, fullMatrix,
    maxPerMember: Number.isInteger(capOverride) && capOverride > 0 ? capOverride : balanceCap,
  };
}

/** BIG exceeds any achievable total cost, making the objective lexicographic. */
function bigFor(cost, nT) {
  let mx = 0;
  for (const row of cost) for (const c of row) if (c > mx) mx = c;
  return (mx + 1) * Math.max(1, nT) + 1;
}

export function solveAssignment(members, tasks, options = {}) {
  const t0 = performance.now();
  const limits = { ...ASSIGNMENT_LIMITS, ...(options.limits ?? {}) };
  const P = prepareAssignmentProblem(members, tasks, options);
  const { avail, taskList, cost, maxPerMember } = P;
  const nM = avail.length, nT = taskList.length;
  const BIG = bigFor(cost, nT);

  // Canonical task search order: regret desc, then id (input order irrelevant).
  const regret = taskList.map((_, j) => {
    const col = cost.map((r) => r[j]).sort((x, y) => x - y);
    return col.length > 1 ? col[1] - col[0] : 0;
  });
  const order = taskList.map((_, j) => j).sort((a, b) => regret[b] - regret[a] || cmpStr(taskList[a].id, taskList[b].id));
  const memberOrderFor = order.map((j) => avail.map((_, i) => i).sort((x, y) => cost[x][j] - cost[y][j] || x - y));

  const count = new Array(nM).fill(0);
  const hours = new Array(nM).fill(0);
  const feasible = (i, j) => count[i] < maxPerMember && hours[i] + taskList[j].hours <= avail[i].hourCap + 1e-9;
  const reset = () => { count.fill(0); hours.fill(0); };

  // Greedy incumbent (also the start point of the large-instance heuristic).
  reset();
  let best = { asg: new Array(nT).fill(-1), obj: 0 };
  for (let k = 0; k < nT; k++) {
    const j = order[k];
    const i = memberOrderFor[k].find((x) => feasible(x, j));
    if (i === undefined) { best.obj += BIG; continue; }
    best.asg[j] = i; count[i]++; hours[i] += taskList[j].hours; best.obj += cost[i][j];
  }

  let nodesExplored = 0, nodesPruned = 0, terminationReason = "search_complete", exact = false;

  const lowerBound = (k, soFar) => {
    let lb = soFar;
    for (let q = k; q < nT; q++) {
      const j = order[q];
      let mn = BIG;
      for (let i = 0; i < nM; i++) if (cost[i][j] < mn && feasible(i, j)) mn = cost[i][j];
      lb += mn;
    }
    return lb;
  };

  if (nT === 0 || nM === 0) {
    exact = true;
  } else if (nT <= limits.maxExactTasks) {
    reset();
    const cur = new Array(nT).fill(-1);
    let aborted = false;
    const dfs = (k, soFar) => {
      nodesExplored++;
      if (nodesExplored > limits.maxNodes) { aborted = true; return; }
      if (k === nT) {
        if (soFar < best.obj) best = { asg: [...cur], obj: soFar };
        return;
      }
      const j = order[k];
      for (const i of memberOrderFor[k]) {
        if (!feasible(i, j)) continue;
        count[i]++; hours[i] += taskList[j].hours; cur[j] = i;
        const next = soFar + cost[i][j];
        if (lowerBound(k + 1, next) >= best.obj) nodesPruned++;
        else dfs(k + 1, next);
        count[i]--; hours[i] -= taskList[j].hours; cur[j] = -1;
        if (aborted) return;
      }
      // Branch: leave this task unassigned (explored last).
      const next = soFar + BIG;
      if (lowerBound(k + 1, next) >= best.obj) nodesPruned++;
      else dfs(k + 1, next);
    };
    dfs(0, 0);
    exact = !aborted;
    if (aborted) terminationReason = "node_budget_exhausted";
  } else {
    terminationReason = `task_count_exceeds_exact_limit (${nT} > ${limits.maxExactTasks})`;
    // Deterministic local improvement: single-task moves that lower the
    // objective, repeated until a full pass makes no change (bounded rounds).
    reset();
    best.asg.forEach((i, j) => { if (i >= 0) { count[i]++; hours[i] += taskList[j].hours; } });
    let improved = true, rounds = 0;
    while (improved && rounds++ < 50) {
      improved = false;
      for (const j of order) {
        const curI = best.asg[j];
        const curC = curI >= 0 ? cost[curI][j] : BIG;
        if (curI >= 0) { count[curI]--; hours[curI] -= taskList[j].hours; }
        let bi = curI, bc = curC;
        for (let i = 0; i < nM; i++) if (cost[i][j] < bc && feasible(i, j)) { bi = i; bc = cost[i][j]; }
        if (bi >= 0) { count[bi]++; hours[bi] += taskList[j].hours; }
        if (bi !== curI) { best.asg[j] = bi; best.obj += bc - curC; improved = true; }
      }
    }
  }

  // Admissible global lower bound (capacity-relaxed column minima) for reporting.
  reset();
  const globalLB = nM ? lowerBound(0, 0) : nT * BIG;

  const memberHours = new Array(nM).fill(0);
  const memberTasks = new Array(nM).fill(0);
  best.asg.forEach((i, j) => { if (i >= 0) { memberHours[i] += taskList[j].hours; memberTasks[i]++; } });

  const assignments = [];
  const unassigned = [];
  let totalCost = 0;
  taskList.forEach((tk, j) => {
    const i = best.asg[j];
    if (i < 0) {
      const anyHours = avail.some((a) => tk.hours <= a.hourCap + 1e-9);
      unassigned.push({
        taskId: tk.id,
        reason: nM === 0 ? "no available registered members"
          : !anyHours ? `needs ${tk.hours} h but no member has that much remaining capacity`
          : "every member able to take it reached the per-member task limit or hour capacity",
      });
      return;
    }
    totalCost += cost[i][j];
    const a = avail[i];
    const demand = effectiveDemand(tk.t);
    const supply = (k) => a.m.skills?.[k] ?? 5;
    const gaps = SKILL_KEYS.filter((k) => (demand?.[k] ?? 0) > supply(k)).map((k) => ({ skill: k, required: demand[k], has: supply(k) }));
    const matched = SKILL_KEYS.filter((k) => (demand?.[k] ?? 0) > 0 && demand[k] <= supply(k));
    assignments.push({
      taskId: tk.id,
      memberId: a.userId,
      cost: cost[i][j],
      explanation: {
        matchedSkills: matched,
        skillGaps: gaps,
        memberHoursAfter: Math.round(memberHours[i] * 100) / 100,
        memberHourCapacity: a.hourCap,
        memberTaskCount: memberTasks[i],
        reason: gaps.length === 0
          ? `${a.m.name ?? "Member"} meets every derived skill requirement (cost 0).`
          : `Lowest-cost feasible choice in the ${exact ? "optimal" : "best found"} plan; skill gaps: ${gaps.map((g) => `${g.skill} ${g.has}/${g.required}`).join(", ")}.`,
      },
    });
  });
  // Keep output in the caller's task order.
  const pos = new Map(taskList.map((tk) => [tk.id, tk.inputIndex]));
  assignments.sort((x, y) => pos.get(x.taskId) - pos.get(y.taskId));

  const totalHourCap = avail.reduce((s, a) => s + a.hourCap, 0);
  const usedHours = memberHours.reduce((s, h) => s + h, 0);
  return {
    assignments,
    unassigned,
    totalCost,
    costMatrix: P.fullMatrix,
    meta: {
      algorithm: exact ? "Branch and Bound (exact, capacity-constrained assignment)" : "Branch and Bound incumbent / greedy + local improvement (approximate)",
      exact,
      objective: { assigned: assignments.length, unassigned: unassigned.length, totalCost },
      lowerBound: { unassigned: Math.floor(globalLB / BIG), cost: globalLB % BIG },
      nodesExplored,
      nodesPruned,
      pruningRatio: nodesExplored + nodesPruned > 0 ? ((nodesPruned / (nodesExplored + nodesPruned)) * 100).toFixed(1) + "%" : "N/A",
      terminationReason,
      limits,
      maxTasksPerMember: maxPerMember,
      availableMembers: nM,
      unavailableMembers: P.unavailable,
      capacityUtilizationPct: totalHourCap > 0 ? Math.round((usedHours / totalHourCap) * 1000) / 10 : 0,
      durationMs: Math.round((performance.now() - t0) * 1000) / 1000,
      complexity: {
        time: "O(m^n) worst case (exponential; pruning reduces work, not the bound)",
        space: "O(m·n) cost matrix + O(n) recursion depth",
      },
    },
  };
}

/**
 * assignTasksToMembers(members, tasks, options) — backwards-compatible entry
 * point. Every task is handled by the same solver (no input-order subset).
 */
export function assignTasksToMembers(members, tasks, options = {}) {
  if (!members?.length || !tasks?.length) {
    return { assignments: [], unassigned: [], totalCost: 0, costMatrix: [], meta: { exact: true, terminationReason: "empty_input", nodesExplored: 0, nodesPruned: 0 } };
  }
  if (tasks.length > ASSIGNMENT_LIMITS.maxTasks) {
    throw Object.assign(new Error(`Too many tasks for assignment (max ${ASSIGNMENT_LIMITS.maxTasks}).`), { statusCode: 413 });
  }
  return solveAssignment(members, tasks, options);
}

/** Exhaustive reference for tests: (m+1)^n enumeration → { assigned, cost }. */
export function exhaustiveAssignment(members, tasks, options = {}) {
  const P = prepareAssignmentProblem(members, tasks, options);
  const { avail, taskList, cost, maxPerMember } = P;
  const nM = avail.length, nT = taskList.length;
  let best = { assigned: -1, cost: Infinity };
  const count = new Array(nM).fill(0), hours = new Array(nM).fill(0);
  const rec = (j, assigned, c) => {
    if (j === nT) {
      if (assigned > best.assigned || (assigned === best.assigned && c < best.cost)) best = { assigned, cost: c };
      return;
    }
    rec(j + 1, assigned, c);
    for (let i = 0; i < nM; i++) {
      if (count[i] < maxPerMember && hours[i] + taskList[j].hours <= avail[i].hourCap + 1e-9) {
        count[i]++; hours[i] += taskList[j].hours;
        rec(j + 1, assigned + 1, c + cost[i][j]);
        count[i]--; hours[i] -= taskList[j].hours;
      }
    }
  };
  rec(0, 0, 0);
  return best;
}
