/**
 * server/algorithms/decisionEngine.js
 * ============================================================================
 * NEXUSFLOW 2.0 — Phase 5: Decision & Recommendation Engine
 *
 * ARCHITECTURE PRINCIPLE:
 *   AI proposes options and explains qualitative trade-offs.
 *   This engine calculates ALL numerical scores deterministically.
 *   The student always understands WHY a recommendation was made.
 *
 * EXISTING DAA INTEGRATION:
 *   TYPE B (task-priority) → greedySortTasks() / computePriorityScore()
 *   TYPE C (sprint)        → knapsackSprint() / computeRecommendation()
 *   TYPE D (assignment)    → assignTasksToMembers() / buildCostMatrix()
 *   TYPE E (architecture)  → topologicalSort() for dependency ordering
 *   TYPE A/E/F (scored)    → mergeSort() for option ranking
 *   All search/dedup       → boyerMooreSearch()
 *
 * PIPELINE:
 *   PROJECT CONTEXT
 *        ↓
 *   CANDIDATE OPTIONS
 *        ↓
 *   FACTOR NORMALIZATION
 *        ↓
 *   DETERMINISTIC SCORING  (this file)
 *        ↓
 *   DAA ALGORITHM EXECUTION  (existing files)
 *        ↓
 *   TRADE-OFF ANALYSIS
 *        ↓
 *   RECOMMENDATION + EXPLANATION
 *        ↓
 *   USER (who makes the final choice)
 *
 * ============================================================================
 */

import { computePriorityScore, greedySortTasks } from "./greedyScheduler.js";
import {
  knapsackSprint,
  boyerMooreSearch,
  mergeSort,
  topologicalSort,
  greedySprintRanking,
} from "./taskOptimiser.js";
import { assignTasksToMembers, buildCostMatrix } from "./branchAndBound.js";

// ─────────────────────────────────────────────────────────────────────────────
// Decision Type Registry
// ─────────────────────────────────────────────────────────────────────────────

export const DECISION_TYPES = {
  technology:     "technology",
  "task-priority":"task-priority",
  sprint:         "sprint",
  assignment:     "assignment",
  architecture:   "architecture",
  "ai-ml":        "ai-ml",
};

// ─────────────────────────────────────────────────────────────────────────────
// Factor Definitions — explicit, auditable weights per decision type.
// Each entry: { factor, label, defaultWeight, description }
// ─────────────────────────────────────────────────────────────────────────────
export const FACTOR_DEFINITIONS = {
  technology: [
    { factor: "skillFit",      label: "Team Skill Match",    defaultWeight: 0.30, description: "How well the team's existing skills match this technology" },
    { factor: "effortFit",     label: "Development Speed",   defaultWeight: 0.25, description: "Expected implementation speed given project timeline" },
    { factor: "deadlineFit",   label: "Deadline Alignment",  defaultWeight: 0.25, description: "Likelihood of delivering within project deadline" },
    { factor: "complexityFit", label: "Complexity Match",    defaultWeight: 0.20, description: "How well the technology's complexity matches project needs" },
  ],
  architecture: [
    { factor: "scalabilityFit", label: "Scalability",        defaultWeight: 0.30, description: "Ability to scale with project growth" },
    { factor: "complexityFit",  label: "Implementation Fit", defaultWeight: 0.25, description: "Implementation complexity vs team capacity" },
    { factor: "effortFit",      label: "Development Speed",  defaultWeight: 0.25, description: "Expected setup and integration speed" },
    { factor: "deadlineFit",    label: "Deadline Alignment", defaultWeight: 0.20, description: "Feasibility within project timeline" },
  ],
  "ai-ml": [
    { factor: "skillFit",       label: "Team Skill Match",    defaultWeight: 0.30, description: "Team's ML/AI capability match" },
    { factor: "complexityFit",  label: "Implementation Fit",  defaultWeight: 0.25, description: "Approach complexity vs time/resources" },
    { factor: "effortFit",      label: "Development Speed",   defaultWeight: 0.25, description: "Speed to working prototype" },
    { factor: "deadlineFit",    label: "Deadline Alignment",  defaultWeight: 0.20, description: "Feasibility within project timeline" },
  ],
};

// Strength label thresholds
const STRENGTH_THRESHOLDS = [
  { min: 80, label: "Strong Fit",   emoji: "🟢" },
  { min: 60, label: "Good Fit",     emoji: "🟡" },
  { min: 40, label: "Moderate Fit", emoji: "🟠" },
  { min:  0, label: "Weak Fit",     emoji: "🔴" },
];

function strengthLabel(score) {
  return STRENGTH_THRESHOLDS.find((t) => score >= t.min) || STRENGTH_THRESHOLDS[3];
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain signal → factor score helpers
// These translate project context signals into 0–100 factor scores.
// Deterministic. No AI involved.
// ─────────────────────────────────────────────────────────────────────────────

const TECH_SIGNALS = {
  // Technology → inferred characteristics
  "node.js": { backend: true,  python: false, mlNative: false, realtime: true,  effort: 75 },
  "express":  { backend: true,  python: false, mlNative: false, realtime: true,  effort: 80 },
  "fastapi":  { backend: true,  python: true,  mlNative: true,  realtime: false, effort: 70 },
  "django":   { backend: true,  python: true,  mlNative: true,  realtime: false, effort: 60 },
  "flask":    { backend: true,  python: true,  mlNative: true,  realtime: false, effort: 75 },
  "react":    { backend: false, python: false, mlNative: false, realtime: true,  effort: 80 },
  "react native": { backend: false, python: false, mlNative: false, realtime: false, effort: 70 },
  "flutter":  { backend: false, python: false, mlNative: false, realtime: false, effort: 65 },
  "mongodb":  { backend: true,  python: false, mlNative: false, realtime: false, effort: 80 },
  "postgresql": { backend: true, python: false, mlNative: false, realtime: false, effort: 70 },
  "firebase": { backend: true,  python: false, mlNative: false, realtime: true,  effort: 85 },
  "tensorflow": { backend: false, python: true, mlNative: true, realtime: false, effort: 55 },
  "pytorch":   { backend: false, python: true, mlNative: true,  realtime: false, effort: 55 },
  "scikit-learn": { backend: false, python: true, mlNative: true, realtime: false, effort: 75 },
  "esp32":    { backend: false, python: false, mlNative: false, realtime: true,  effort: 60 },
  "arduino":  { backend: false, python: false, mlNative: false, realtime: false, effort: 70 },
  "rest":     { backend: true,  python: false, mlNative: false, realtime: false, effort: 85 },
  "websocket":{ backend: true,  python: false, mlNative: false, realtime: true,  effort: 70 },
  "graphql":  { backend: true,  python: false, mlNative: false, realtime: false, effort: 65 },
  "microservices": { backend: true, python: false, mlNative: false, realtime: false, effort: 45 },
  "monolith": { backend: true,  python: false, mlNative: false, realtime: false, effort: 80 },
};

/**
 * Derive a factor score for a given option against project context.
 * All scores are deterministic integer 0–100.
 *
 * @param {string} option     - Technology/architecture option string
 * @param {string} factor     - Factor key from FACTOR_DEFINITIONS
 * @param {object} ctx        - buildCompactProjectContext() result
 * @param {object} preferences - User weight overrides
 * @returns {number} score 0–100
 */
function scoreOptionFactor(option, factor, ctx) {
  const key = option.toLowerCase().trim();
  const signals = TECH_SIGNALS[key] || {};

  // Member skill levels (aggregate: sum / (n * 10) → 0–1)
  const members = ctx.members || [];
  const n = members.length || 1;

  // Detect if project needs Python (for ML/AI decisions)
  const needsPython = ctx.needsAiMl || /python/i.test(ctx.projectDescription || "");
  const needsRealtime = ctx.needsRealtime;
  const needsHardware = ctx.needsHardware;

  switch (factor) {
    case "skillFit": {
      // Does this tech match the domain requirements the team likely needs?
      let score = 50; // neutral baseline
      if (signals.mlNative && ctx.needsAiMl) score += 30;
      if (signals.python && needsPython) score += 20;
      if (!signals.python && !needsPython) score += 15;
      if (signals.realtime && needsRealtime) score += 20;
      if (!signals.realtime && !needsRealtime) score += 10;
      return Math.min(100, Math.max(0, score));
    }

    case "effortFit": {
      // How fast is it to develop with this technology?
      return signals.effort || 65;
    }

    case "deadlineFit": {
      // Deadline fit = effortFit adjusted for project complexity
      const taskCount = ctx.taskCount || 0;
      const complexityPenalty = taskCount > 30 ? 10 : taskCount > 15 ? 5 : 0;
      const base = signals.effort || 65;
      return Math.min(100, Math.max(0, base - complexityPenalty));
    }

    case "complexityFit": {
      // Lower complexity = better fit for student teams
      const effort = signals.effort || 65;
      // Invert: high effort = high complexity = lower fit for quick projects
      // But if team has more members, complexity is less penalizing
      const memberBonus = Math.min(15, (n - 1) * 5);
      return Math.min(100, Math.max(0, effort - 5 + memberBonus));
    }

    case "scalabilityFit": {
      // Architecture scalability
      if (/microservice/i.test(key)) return 90;
      if (/monolith/i.test(key)) return 55;
      if (/serverless/i.test(key)) return 80;
      if (/websocket/i.test(key)) return 75;
      if (/rest/i.test(key)) return 70;
      return 60;
    }

    default:
      return 60;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weighted score calculator — the core deterministic engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate a weighted final score for one option across all factors.
 *
 * Formula: finalScore = Σ (factorScore[i] × normalizedWeight[i])
 *
 * Weights from preferences override defaults.
 * All weights are normalized so they always sum to 1.0.
 *
 * @returns {{ finalScore, factorBreakdown }}
 */
function computeWeightedScore(option, factors, ctx, preferences) {
  const factorBreakdown = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const fd of factors) {
    // Preference override: map preference keys to factor keys
    const prefKey = mapPrefToFactor(fd.factor, preferences);
    const rawWeight = prefKey !== null ? prefKey : fd.defaultWeight;
    totalWeight += rawWeight;

    const score = scoreOptionFactor(option, fd.factor, ctx);
    factorBreakdown.push({
      factor: fd.factor,
      label: fd.label,
      score,
      rawWeight,
    });
    weightedSum += rawWeight * score;
  }

  // Normalize weights so they sum to exactly 1.0
  const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
  const normalizedBreakdown = factorBreakdown.map((fb) => ({
    ...fb,
    weight: parseFloat((fb.rawWeight / totalWeight).toFixed(3)),
  }));

  return { finalScore, factorBreakdown: normalizedBreakdown };
}

/**
 * Map user preferences to factor weight overrides.
 * Returns null if no matching preference.
 */
function mapPrefToFactor(factor, preferences) {
  if (!preferences || typeof preferences !== "object") return null;
  const MAP = {
    skillFit:       ["skillFit", "skill", "team"],
    effortFit:      ["speed", "effort", "effortFit", "fast"],
    deadlineFit:    ["deadline", "time", "delivery", "deadlineFit"],
    complexityFit:  ["complexity", "simplicity", "complexityFit"],
    scalabilityFit: ["scalability", "scale", "scalabilityFit"],
  };
  const candidates = MAP[factor] || [factor];
  for (const c of candidates) {
    if (preferences[c] !== undefined) {
      const v = parseFloat(preferences[c]);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE A/E/F: Technology / Architecture / AI-ML scored evaluation
// ─────────────────────────────────────────────────────────────────────────────

function evaluateScoredOptions(decisionType, options, ctx, preferences, aiQualitative) {
  const factors = FACTOR_DEFINITIONS[decisionType] || FACTOR_DEFINITIONS.technology;

  // Score each option deterministically
  const scoredOptions = options.map((option) => {
    const { finalScore, factorBreakdown } = computeWeightedScore(option, factors, ctx, preferences);
    return { option, score: finalScore, factorBreakdown };
  });

  // Use existing Merge Sort to rank by score (deterministic, O(n log n))
  const mergeSortInput = scoredOptions.map((o) => ({
    ...o,
    // Merge sort needs these fields for the existing comparator
    priorityScore: o.score,
    status: "todo",
    priority: o.score,
    effort: 1,
    title: o.option,
    createdAt: new Date(),
  }));
  const sorted = mergeSort(mergeSortInput);

  const ranked = sorted.map(({ option, score, factorBreakdown }) => ({
    option, score, factorBreakdown,
    strength: strengthLabel(score),
  }));

  const [best, ...rest] = ranked;

  // Build decision matrix
  const matrix = buildDecisionMatrix(factors, ranked);

  // Trade-offs: pull from AI qualitative if available, else deterministic
  const tradeoffs = buildTradeoffs(ranked, ctx, decisionType, aiQualitative);

  // Risks: deterministic + AI narrative
  const risks = buildRisks(ranked, ctx, decisionType, aiQualitative);

  // Which factors swung the result
  const keyFactors = best.factorBreakdown
    .filter((fb) => fb.score >= 75)
    .map((fb) => fb.label)
    .slice(0, 3);

  // Confidence based on how much context we have
  const confidence = computeConfidence(ctx, options.length);

  const reason = aiQualitative?.reason ||
    `${best.option} scored ${best.score}/100 based on ${keyFactors.join(", ") || "factor analysis"}. ` +
    `It best matches the project's ${ctx.domain || "technical"} requirements.`;

  const nextAction = aiQualitative?.nextAction ||
    `Start with ${best.option}: set up the project structure, define interfaces, and validate with a small prototype before full implementation.`;

  return {
    recommendation: { option: best.option, score: best.score, strength: best.strength },
    alternatives: rest.map((o) => ({
      option: o.option,
      score: o.score,
      strength: o.strength,
      reason: aiQualitative?.alternativeReasons?.[o.option] ||
        `${o.option} scored ${o.score}/100. ` +
        (o.score >= 60 ? "A viable alternative if team constraints change." : "Consider only if primary option is unavailable."),
    })),
    factors: matrix.factors,
    matrix,
    tradeoffs,
    risks,
    reason,
    nextAction,
    confidence,
    keyFactors,
    daaAlgorithmsUsed: ["Merge Sort (option ranking — O(n log n))", "Weighted Factor Scoring (deterministic)"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE B: Task Priority — uses existing Greedy Scheduler + Merge Sort
// ─────────────────────────────────────────────────────────────────────────────

function evaluateTaskPriority(tasks, ctx, aiQualitative) {
  if (!tasks || tasks.length === 0) {
    return { error: "No tasks available for priority analysis." };
  }

  // Use existing greedySortTasks() — authoritative for priority
  const sorted = greedySortTasks(tasks);

  // Top recommended tasks
  const topTasks = sorted.slice(0, 10).map((t, idx) => ({
    rank: idx + 1,
    taskId: t._id?.toString(),
    title: t.title,
    priorityScore: t.priorityScore || 0,
    urgency: t.urgency || 1,
    impact: t.impact || 1,
    dependencyCount: t.dependencyCount || 0,
    status: t.status,
    strength: strengthLabel(t.priorityScore || 0),
    reason: `Greedy score ${t.priorityScore || 0}/100 — urgency×${t.urgency}, impact×${t.impact}, dependency-fanin ${t.dependencyCount}.`,
  }));

  const top = topTasks[0];
  const reason = aiQualitative?.reason ||
    (top ? `"${top.title}" is recommended first with a Greedy priority score of ${top.priorityScore}/100.` : "No tasks to rank.");

  return {
    recommendation: top ? { option: top.title, score: top.priorityScore, strength: top.strength } : null,
    rankedTasks: topTasks,
    alternatives: topTasks.slice(1, 4).map((t) => ({
      option: t.title, score: t.priorityScore, strength: t.strength,
      reason: t.reason,
    })),
    factors: [
      { factor: "urgency",     label: "Urgency",           weight: 0.50, description: "Deadline pressure and blocking severity" },
      { factor: "impact",      label: "Business Impact",   weight: 0.35, description: "Strategic value of completing this task" },
      { factor: "dependency",  label: "Dependency Fan-in", weight: 0.15, description: "Number of tasks that depend on this one" },
    ],
    tradeoffs: [],
    risks: [],
    reason,
    nextAction: aiQualitative?.nextAction || (top ? `Start with "${top.title}" — it has the highest weighted priority score.` : "Add tasks to enable priority analysis."),
    confidence: computeConfidence(ctx, tasks.length),
    keyFactors: ["Urgency (50%)", "Business Impact (35%)", "Dependency Fan-in (15%)"],
    daaAlgorithmsUsed: [
      "Greedy Priority Scheduler — computePriorityScore() O(1) per task",
      "Merge Sort — greedySortTasks() O(n log n)",
    ],
    matrix: {
      factors: ["Urgency", "Impact", "Dep. Count", "Priority Score"],
      options: topTasks.slice(0, 5).map((t) => t.title),
      scores: topTasks.slice(0, 5).map((t) => [t.urgency * 20, t.impact * 20, Math.min(100, t.dependencyCount * 10), t.priorityScore]),
      finalScores: topTasks.slice(0, 5).map((t) => t.priorityScore),
      weights: [0.50, 0.35, 0.15, 1.0],
      winner: top?.title,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE C: Sprint — uses existing 0/1 Knapsack via computeRecommendation()
// ─────────────────────────────────────────────────────────────────────────────

function evaluateSprint(tasks, capacity, ctx, aiQualitative) {
  if (!tasks || tasks.length === 0) {
    return { error: "No tasks available for sprint planning." };
  }

  // Normalize tasks for knapsack (same logic as aiOrchestrator.js)
  const normalizedTasks = tasks
    .filter((t) => t.status !== "done")
    .map((t) => {
      const hasValue = Number.isFinite(t.businessValue) && t.businessValue > 0;
      const hasEffort = Number.isFinite(t.estimatedHours) && t.estimatedHours > 0;
      const priorityScore = Number.isFinite(t.priorityScore) ? t.priorityScore : 0;
      const urgency = Number.isFinite(t.urgency) ? t.urgency : 1;
      const impact = Number.isFinite(t.impact) ? t.impact : 1;
      return {
        _id: t._id,
        title: t.title,
        status: t.status,
        dependencies: t.dependencies ?? [],
        priority: priorityScore,
        value: hasValue ? t.businessValue : (priorityScore > 0 ? priorityScore : Math.max(1, urgency * impact)),
        effort: hasEffort ? t.estimatedHours : Math.min(8, Math.max(1, Math.round(priorityScore / 20) || 3)),
      };
    });

  // Use existing knapsack — authoritative sprint selection
  const { selectedTasks, totalValue, effortUsed, capacityLeft } =
    knapsackSprint(normalizedTasks, capacity);

  // Tasks not selected
  const selectedIds = new Set(selectedTasks.map((t) => t._id?.toString()));
  const rejectedTasks = normalizedTasks.filter((t) => !selectedIds.has(t._id?.toString()));

  const reason = aiQualitative?.reason ||
    `0/1 Knapsack selected ${selectedTasks.length} tasks maximizing business value (${totalValue}) within ${capacity} story-point capacity.`;

  return {
    recommendation: {
      option: `${selectedTasks.length} tasks selected`,
      score: Math.round((effortUsed / capacity) * 100),
      strength: strengthLabel(Math.round((totalValue / Math.max(1, totalValue + rejectedTasks.reduce((s, t) => s + t.value, 0))) * 100)),
    },
    sprintSelection: {
      selected: selectedTasks.map((t) => ({
        taskId: t._id?.toString(),
        title: t.title,
        effort: t.effort,
        value: t.value,
        reason: `Value/Effort ratio: ${(t.value / t.effort).toFixed(2)} — included by Knapsack DP.`,
      })),
      rejected: rejectedTasks.map((t) => ({
        taskId: t._id?.toString(),
        title: t.title,
        effort: t.effort,
        value: t.value,
        reason: `Excluded — would exceed capacity or provide lower marginal value.`,
      })),
      capacity,
      effortUsed,
      capacityLeft,
      totalValue,
      utilizationPct: Math.round((effortUsed / capacity) * 100),
    },
    alternatives: [],
    factors: [
      { factor: "businessValue", label: "Business Value", weight: 0.60, description: "Value delivered by completing the task" },
      { factor: "effort",        label: "Story Points",   weight: 0.40, description: "Effort cost against sprint capacity" },
    ],
    tradeoffs: [
      {
        option: "Selected Sprint",
        pros: [`Maximizes value within ${capacity} pts`, `${selectedTasks.length} tasks chosen optimally`],
        cons: rejectedTasks.length > 0 ? [`${rejectedTasks.length} tasks deferred`] : ["All tasks fit in sprint"],
      },
    ],
    risks: rejectedTasks.length > 0 ? [{
      option: "Deferred Tasks",
      risk: `${rejectedTasks.length} tasks did not fit in this sprint.`,
      severity: rejectedTasks.length > 5 ? "high" : "medium",
      mitigation: "Consider increasing capacity or breaking large tasks into smaller story points.",
    }] : [],
    reason,
    nextAction: aiQualitative?.nextAction ||
      `Begin the sprint with: ${selectedTasks.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}.`,
    confidence: computeConfidence(ctx, tasks.length),
    keyFactors: ["Business Value", "Sprint Capacity (Knapsack DP)"],
    daaAlgorithmsUsed: [
      "0/1 Knapsack DP — knapsackSprint() O(n × W)",
      "Greedy Sprint Ranking — greedySprintRanking() O(n log n)",
    ],
    matrix: {
      factors: ["Value", "Effort", "V/E Ratio", "Status"],
      options: [...selectedTasks, ...rejectedTasks].slice(0, 6).map((t) => t.title),
      scores: [...selectedTasks.map((t) => [t.value, t.effort, parseFloat((t.value / t.effort).toFixed(1)), 1]),
               ...rejectedTasks.map((t) => [t.value, t.effort, parseFloat((t.value / t.effort).toFixed(1)), 0])].slice(0, 6),
      finalScores: [...selectedTasks.map((t) => 1), ...rejectedTasks.map(() => 0)].slice(0, 6),
      weights: [0.6, 0.4, 1.0, 1.0],
      winner: selectedTasks[0]?.title,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE D: Assignment — uses existing Branch & Bound
// ─────────────────────────────────────────────────────────────────────────────

function evaluateAssignment(tasks, members, ctx, aiQualitative) {
  if (!tasks || tasks.length === 0) return { error: "No tasks for assignment." };
  if (!members || members.length === 0) return { error: "No members for assignment." };

  // Use existing assignTasksToMembers() — authoritative
  const { assignments, totalCost, costMatrix, meta } = assignTasksToMembers(members, tasks);

  const memberMap = Object.fromEntries(members.map((m) => [m.userId?.toString(), m]));
  const taskMap = Object.fromEntries(tasks.map((t) => [t._id?.toString(), t]));

  const enrichedAssignments = assignments.map(({ taskId, memberId, cost }) => {
    const member = memberMap[memberId];
    const task = taskMap[taskId];
    const maxCost = 60; // theoretical max cost with all-skill-gap
    const fitScore = Math.max(0, Math.round((1 - cost / Math.max(maxCost, 1)) * 100));
    return {
      taskId,
      taskTitle: task?.title || taskId,
      memberId,
      memberName: member?.name || memberId,
      cost,
      fitScore,
      strength: strengthLabel(fitScore),
      reason: cost === 0
        ? `Perfect skill match — ${member?.name} meets all skill requirements.`
        : `Skill gap cost: ${cost} (lower = better fit). ${member?.name} is the closest available match.`,
    };
  });

  const reason = aiQualitative?.reason ||
    `Branch & Bound found optimal assignments with total skill-gap cost ${totalCost}. ` +
    `Lower cost = better skill match. ` +
    `${meta.nodesPruned || 0} branches pruned (${meta.pruningRatio || "N/A"} efficiency).`;

  return {
    recommendation: {
      option: `${assignments.length} optimal assignments`,
      score: Math.max(0, Math.round((1 - totalCost / Math.max(assignments.length * 10, 1)) * 100)),
      strength: strengthLabel(totalCost === 0 ? 100 : Math.max(0, 100 - totalCost * 5)),
    },
    assignments: enrichedAssignments,
    alternatives: [],
    factors: [
      { factor: "skillMatch", label: "Skill Match",     weight: 0.70, description: "How well member skills satisfy task requirements" },
      { factor: "workload",   label: "Workload Balance", weight: 0.30, description: "Even distribution of tasks across members" },
    ],
    tradeoffs: [
      {
        option: "B&B Optimal Assignment",
        pros: ["Minimizes total skill-gap cost", "Guarantees global optimum for available members", "Considers all skill dimensions"],
        cons: ["Does not account for member preferences", "Does not model task sequencing"],
      },
    ],
    risks: totalCost > assignments.length * 5 ? [{
      option: "Assignment",
      risk: "High skill-gap cost indicates members may need upskilling for assigned tasks.",
      severity: totalCost > assignments.length * 10 ? "high" : "medium",
      mitigation: "Consider pairing members on high-cost assignments or scheduling knowledge transfer sessions.",
    }] : [],
    reason,
    nextAction: aiQualitative?.nextAction ||
      "Review assignments in the Members tab and apply if satisfied. Members can be trained on skill gaps before sprint begins.",
    confidence: computeConfidence(ctx, tasks.length),
    keyFactors: ["Skill-Gap Cost Matrix", "Branch & Bound Optimality"],
    daaAlgorithmsUsed: [
      "Branch & Bound — assignTasksToMembers() O(n! / pruning) practical O(n²–n³)",
      "Cost Matrix — buildCostMatrix() O(n × m × skills)",
    ],
    meta,
    matrix: {
      factors: members.map((m) => m.name || "Member"),
      options: tasks.slice(0, 6).map((t) => t.title),
      scores: tasks.slice(0, 6).map((t, tIdx) =>
        members.map((m, mIdx) => costMatrix[mIdx]?.[tIdx] || 0)
      ),
      finalScores: enrichedAssignments.slice(0, 6).map((a) => a.fitScore),
      weights: members.map(() => 1),
      winner: enrichedAssignments[0]?.taskTitle,
      note: "Matrix shows skill-gap cost (lower = better). Highlighted = assigned.",
    },
    costMatrix,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade-off builder — deterministic + optional AI narrative
// ─────────────────────────────────────────────────────────────────────────────

function buildTradeoffs(ranked, ctx, decisionType, aiQualitative) {
  return ranked.map((item) => {
    const pros = [];
    const cons = [];

    // Derive pros/cons from factor breakdown
    for (const fb of (item.factorBreakdown || [])) {
      if (fb.score >= 75) {
        pros.push(`${fb.label}: ${fb.score}/100`);
      } else if (fb.score < 55) {
        cons.push(`${fb.label}: ${fb.score}/100 — may need attention`);
      }
    }

    // Fallback pro/con from AI if available
    const aiTradeoff = aiQualitative?.tradeoffs?.[item.option];
    if (aiTradeoff?.pros) pros.push(...aiTradeoff.pros.slice(0, 2));
    if (aiTradeoff?.cons) cons.push(...aiTradeoff.cons.slice(0, 2));

    return {
      option: item.option,
      score: item.score,
      pros: pros.length > 0 ? pros : [`Score: ${item.score}/100`],
      cons: cons.length > 0 ? cons : ["Based on available project context"],
      note: "Based on available project context.",
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk builder
// ─────────────────────────────────────────────────────────────────────────────

function buildRisks(ranked, ctx, decisionType, aiQualitative) {
  const risks = [];
  const [best, ...rest] = ranked;

  // AI risks take priority if available
  if (aiQualitative?.risks) {
    return aiQualitative.risks.map((r) => ({
      option: r.option || best?.option,
      risk: r.risk,
      severity: r.severity || "medium",
      mitigation: r.mitigation || "Needs verification.",
    }));
  }

  // Deterministic risk inference
  if (best) {
    const lowFactors = (best.factorBreakdown || []).filter((fb) => fb.score < 50);
    for (const lf of lowFactors.slice(0, 2)) {
      risks.push({
        option: best.option,
        risk: `Low ${lf.label} score (${lf.score}/100) may indicate implementation challenges.`,
        severity: lf.score < 35 ? "high" : "medium",
        mitigation: `Assess team readiness for ${lf.label.toLowerCase()} before committing. Consider a proof-of-concept first.`,
      });
    }
  }

  if (rest.length === 0) {
    risks.push({
      option: "General",
      risk: "Only one option evaluated. Consider comparing against at least 2 alternatives.",
      severity: "low",
      mitigation: "Add alternative options to get a fuller comparison.",
    });
  }

  return risks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision Matrix builder
// ─────────────────────────────────────────────────────────────────────────────

function buildDecisionMatrix(factors, ranked) {
  return {
    factors: factors.map((fd) => ({
      factor: fd.factor,
      label: fd.label,
      weight: fd.defaultWeight,
      description: fd.description,
    })),
    options: ranked.map((r) => r.option),
    scores: ranked.map((r) =>
      factors.map((fd) => {
        const fb = (r.factorBreakdown || []).find((f) => f.factor === fd.factor);
        return fb?.score || 0;
      })
    ),
    finalScores: ranked.map((r) => r.score),
    weights: factors.map((fd) => fd.defaultWeight),
    winner: ranked[0]?.option,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence calculator
// ─────────────────────────────────────────────────────────────────────────────

function computeConfidence(ctx, optionsCount) {
  let score = 0;
  if (ctx.projectTitle && ctx.projectTitle.length > 5) score += 20;
  if (ctx.projectDescription && ctx.projectDescription.length > 30) score += 20;
  if (ctx.domain && ctx.domain !== "General Software") score += 15;
  if (ctx.members && ctx.members.length > 0) score += 15;
  if (ctx.taskCount > 0) score += 15;
  if (optionsCount >= 2) score += 15;

  if (score >= 80) return { label: "High", description: "Strong project context available." };
  if (score >= 50) return { label: "Medium", description: "Moderate project context. More detail improves accuracy." };
  return { label: "Low", description: "Limited project context. Add project description and member skills for better recommendations." };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API: Main engine entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * evaluateDecision
 * ----------------
 * Main entry point for the Decision Engine.
 *
 * @param {object} params
 * @param {string} params.decisionType  - "technology" | "task-priority" | "sprint" | "assignment" | "architecture" | "ai-ml"
 * @param {string} params.question      - User's question (optional for task/sprint types)
 * @param {string[]} params.options     - Options to evaluate (required for tech/arch/ai-ml; ignored for task/sprint/assignment)
 * @param {object} params.preferences   - User weight overrides (optional)
 * @param {object} params.ctx           - buildCompactProjectContext() result
 * @param {Task[]} params.tasks         - Team tasks (for task-priority / sprint / assignment)
 * @param {Member[]} params.members     - Team members (for assignment)
 * @param {object|null} params.aiQualitative - AI-generated qualitative content (optional, from caller)
 * @returns {object} Decision result
 */
export function evaluateDecision({
  decisionType,
  question = "",
  options = [],
  preferences = {},
  ctx,
  tasks = [],
  members = [],
  aiQualitative = null,
}) {
  const type = DECISION_TYPES[decisionType];
  if (!type) {
    return {
      error: `Unknown decision type: "${decisionType}". Valid types: ${Object.keys(DECISION_TYPES).join(", ")}.`,
    };
  }

  const base = {
    decisionType: type,
    question,
    projectContext: {
      projectTitle: ctx.projectTitle,
      domain: ctx.domain,
      taskCount: ctx.taskCount,
      memberCount: (ctx.members || []).length,
    },
    generatedAt: new Date().toISOString(),
  };

  try {
    let result;

    switch (type) {
      case "task-priority":
        result = evaluateTaskPriority(tasks, ctx, aiQualitative);
        break;

      case "sprint":
        const sprintCapacity = preferences?.capacity || ctx.sprintCapacity || 20;
        result = evaluateSprint(tasks, sprintCapacity, ctx, aiQualitative);
        break;

      case "assignment":
        result = evaluateAssignment(tasks, members, ctx, aiQualitative);
        break;

      case "technology":
      case "architecture":
      case "ai-ml":
        if (!options || options.length === 0) {
          return { ...base, error: "At least one option is required for this decision type." };
        }
        result = evaluateScoredOptions(type, options, ctx, preferences, aiQualitative);
        break;

      default:
        result = { error: `Unhandled decision type: ${type}` };
    }

    if (result.error) return { ...base, ...result };

    return {
      ...base,
      ...result,
      // Always include the weight explanation for auditability
      weightExplanation: `Scores are calculated deterministically from project context. AI (if available) only explains qualitative trade-offs — it does NOT calculate these scores.`,
    };
  } catch (err) {
    return {
      ...base,
      error: `Decision engine error: ${err.message}`,
    };
  }
}

/**
 * listDecisionTypes
 * -----------------
 * Returns metadata about all supported decision types for UI rendering.
 */
export function listDecisionTypes() {
  return [
    { key: "technology",    label: "Technology",    icon: "hardware-chip-outline",   description: "Compare technology or framework options" },
    { key: "task-priority", label: "Task Priority", icon: "list-outline",            description: "Determine which tasks to tackle first (Greedy)" },
    { key: "sprint",        label: "Sprint Plan",   icon: "rocket-outline",          description: "Optimize sprint selection (0/1 Knapsack)" },
    { key: "assignment",    label: "Assignment",    icon: "people-outline",          description: "Assign tasks to members (Branch & Bound)" },
    { key: "architecture",  label: "Architecture",  icon: "layers-outline",          description: "Compare architectural approach options" },
    { key: "ai-ml",         label: "AI/ML Approach",icon: "brain-outline",          description: "Choose AI/ML strategy for your project" },
  ];
}
