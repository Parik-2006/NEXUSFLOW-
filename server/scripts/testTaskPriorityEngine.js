/**
 * server/scripts/testTaskPriorityEngine.js
 * ============================================================================
 * V4 Fix 2: Task Intelligence 2.0 — Centralized Priority Engine Tests
 *
 * Covers:
 *   • High impact
 *   • Urgency
 *   • Deadlines (overdue, due soon, due later, missing)
 *   • Dependencies / blockers (dependency depth / fan-in)
 *   • Risk (in risk register, in_progress, done)
 *   • Skill shortage
 *   • Overload
 *   • Missing optional values
 *   • Deterministic tie-breakers
 *   • Repeatability
 *   • Manual override preservation
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ override: true });

import { computeTaskPriority, rankTasks, DEFAULT_WEIGHTS, TIER_CRITICAL, TIER_HIGH, TIER_MEDIUM } from "../algorithms/taskPriorityEngine.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function task(overrides = {}) {
  return {
    _id: overrides._id || "t1",
    title: overrides.title || "Test Task",
    urgency: overrides.urgency ?? 3,
    impact: overrides.impact ?? 3,
    dependencyCount: overrides.dependencyCount ?? 0,
    priorityScore: overrides.priorityScore,
    dueDate: overrides.dueDate ?? null,
    deadline: overrides.deadline ?? null,
    businessValue: overrides.businessValue ?? null,
    status: overrides.status ?? "todo",
    createdAt: overrides.createdAt ?? new Date(),
    assignedTo: overrides.assignedTo ?? null,
    requiredSkills: overrides.requiredSkills ?? [],
    dependencies: overrides.dependencies ?? [],
    priorityLabel: overrides.priorityLabel ?? null,
    estimatedHours: overrides.estimatedHours ?? null,
    storyPoints: overrides.storyPoints ?? 1,
  };
}

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected.\n");
  } catch (e) {
    console.log("MongoDB not available — running pure algorithm tests only.\n");
  }

  // ── 1. High impact boosts score ──────────────────────────────────────────
  {
    const base = computeTaskPriority(task({ urgency: 3, impact: 3, businessValue: 5 }));
    const high = computeTaskPriority(task({ urgency: 3, impact: 5, businessValue: 5 }));
    assert(high.score > base.score, `High impact (${high.score}) > base (${base.score})`);
    assert(high.factors.greedy.score > base.factors.greedy.score, "Greedy factor score increases with urgency/impact");
  }

  // ── 2. Urgency boosts score ──────────────────────────────────────────────
  {
    const base = computeTaskPriority(task({ urgency: 1, impact: 3 }));
    const urgent = computeTaskPriority(task({ urgency: 5, impact: 3 }));
    assert(urgent.score > base.score, `Urgent (${urgent.score}) > base (${base.score})`);
    assert(urgent.factors.greedy.score > base.factors.greedy.score, "Greedy factor score increases with urgency");
  }

  // ── 3. Deadline proximity ────────────────────────────────────────────────
  {
    const now = Date.now();
    const overdue = computeTaskPriority(task({ dueDate: new Date(now - 86_400_000).toISOString() }), { now });
    const tomorrow = computeTaskPriority(task({ dueDate: new Date(now + 86_400_000).toISOString() }), { now });
    const nextWeek = computeTaskPriority(task({ dueDate: new Date(now + 7 * 86_400_000).toISOString() }), { now });
    const noDate = computeTaskPriority(task({ dueDate: null, deadline: null }), { now });
    assert(overdue.factors.deadline.score >= tomorrow.factors.deadline.score, "Overdue >= tomorrow");
    assert(tomorrow.factors.deadline.score >= nextWeek.factors.deadline.score, "Tomorrow >= next week");
    assert(noDate.factors.deadline.score === 50, `Missing due date → neutral 50 (got ${noDate.factors.deadline.score})`);
  }

  // ── 4. Dependencies / blockers (dependency depth) ───────────────────────
  {
    const leaf = computeTaskPriority(task({ _id: "a", dependencies: [] }), {
      allTasks: [
        task({ _id: "a", dependencies: [] }),
        task({ _id: "b", dependencies: ["a"] }),
        task({ _id: "c", dependencies: ["a"] }),
      ],
    });
    const blocker = computeTaskPriority(task({ _id: "a", dependencies: [] }), {
      allTasks: [
        task({ _id: "a", dependencies: [] }),
        task({ _id: "b", dependencies: ["a"] }),
        task({ _id: "c", dependencies: ["a"] }),
      ],
    });
    // Both compute the same task "a" but depth factor should reflect 2 dependents
    assert(blocker.factors.depth.score > 0, `Blocker depth score > 0 (got ${blocker.factors.depth.score})`);
    assert(blocker.factors.depth.reason.includes("2"), "Depth reason mentions 2 dependents");
  }

  // ── 5. Risk ─────────────────────────────────────────────────────────────
  {
    const safe = computeTaskPriority(task({ status: "todo" }), { riskTaskIds: new Set() });
    const risky = computeTaskPriority(task({ status: "todo" }), { riskTaskIds: new Set(["t1"]) });
    const inProgress = computeTaskPriority(task({ status: "in_progress" }));
    const done = computeTaskPriority(task({ status: "done" }));
    assert(risky.factors.risk.score > safe.factors.risk.score, "Risk-registered task scores higher risk factor");
    assert(inProgress.factors.risk.score > safe.factors.risk.score, "In-progress task scores higher risk factor");
    assert(done.factors.risk.score < safe.factors.risk.score, "Done task scores lower risk factor");
  }

  // ── 6. Skill shortage ───────────────────────────────────────────────────
  {
    const noSkills = computeTaskPriority(task({ requiredSkills: ["React", "Node.js"] }));
    const covered = computeTaskPriority(task({ requiredSkills: ["React"] }), {
      teamSkills: { u1: { react: 8, node: 7 } },
    });
    assert(noSkills.factors.skillGap.score === 50, "No team skills → neutral 50");
    assert(covered.factors.skillGap.score > noSkills.factors.skillGap.score, "Covered skills score higher than missing-skills neutral");
  }

  // ── 7. Overload ─────────────────────────────────────────────────────────
  {
    const unassigned = computeTaskPriority(task({ assignedTo: null }));
    const light = computeTaskPriority(task({ assignedTo: "u1" }), {
      memberWorkload: { u1: { load: 10, capacity: 40 } },
    });
    const heavy = computeTaskPriority(task({ assignedTo: "u1" }), {
      memberWorkload: { u1: { load: 50, capacity: 40 } },
    });
    assert(unassigned.factors.overload.score === 50, "Unassigned → neutral 50");
    assert(light.factors.overload.score > heavy.factors.overload.score, "Light workload scores higher than heavy");
  }

  // ── 8. Missing values safe defaults ─────────────────────────────────────
  {
    const empty = computeTaskPriority({});
    assert(empty.score >= 0 && empty.score <= 100, `Empty task produces valid score: ${empty.score}`);
    assert(empty.tier === "low" || empty.tier === "medium" || empty.tier === "high" || empty.tier === "critical", "Valid tier");
    Object.values(empty.factors).forEach((f) => {
      assert(f.score >= 0 && f.score <= 100, `Factor score in range: ${f.score}`);
      assert(f.weight > 0, `Factor weight positive: ${f.weight}`);
      assert(f.contribution >= 0, `Factor contribution non-negative: ${f.contribution}`);
    });
  }

  // ── 9. Deterministic tie-breakers ───────────────────────────────────────
  {
    const tasks = [
      task({ _id: "z", title: "B", urgency: 3, impact: 3 }),
      task({ _id: "a", title: "A", urgency: 3, impact: 3 }),
      task({ _id: "m", title: "A", urgency: 3, impact: 3 }),
    ];
    const ranked1 = rankTasks(tasks);
    const ranked2 = rankTasks(tasks);
    assert(ranked1[0]._id === ranked2[0]._id, "Tie-break is deterministic across runs");
    assert(ranked1[0]._id === "a", "Tie-break: ID 'a' before 'm' before 'z'");
    assert(ranked1[1]._id === "m", "Tie-break: ID 'm' before 'z'");
    assert(ranked1[2]._id === "z", "Tie-break: ID 'z' last");
  }

  // ── 10. Repeatability ───────────────────────────────────────────────────
  {
    const t = task({ urgency: 4, impact: 5, dependencyCount: 3, businessValue: 8, dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const r1 = computeTaskPriority(t);
    const r2 = computeTaskPriority(t);
    assert(r1.score === r2.score, `Repeatable score: ${r1.score}`);
    assert(r1.factors.deadline.contribution === r2.factors.deadline.contribution, "Repeatable deadline contribution");
  }

  // ── 11. Manual override flag ────────────────────────────────────────────
  {
    const manual = computeTaskPriority(task({ priorityLabel: "critical" }));
    const auto = computeTaskPriority(task({ priorityLabel: null }));
    assert(manual.manualOverride === true, "Manual override flagged");
    assert(auto.manualOverride === false, "No label → not manual override");
  }

  // ── 12. rankTasks ordering ───────────────────────────────────────────────
  {
    const tasks = [
      task({ _id: "1", title: "Low", urgency: 1, impact: 1, priorityScore: 10 }),
      task({ _id: "2", title: "High", urgency: 5, impact: 5, priorityScore: 90 }),
      task({ _id: "3", title: "Mid", urgency: 3, impact: 3, priorityScore: 50 }),
    ];
    const ranked = rankTasks(tasks);
    assert(ranked[0]._id === "2", "Highest priority ranks first");
    assert(ranked[1]._id === "3", "Mid priority ranks second");
    assert(ranked[2]._id === "1", "Lowest priority ranks last");
    assert(ranked[0].rank === 1 && ranked[1].rank === 2 && ranked[2].rank === 3, "Ranks are 1,2,3");
  }

  // ── 13. Factor weights sum and stability ────────────────────────────────
  {
    const total = Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0);
    assert(Math.abs(total - 1.0) < 0.001, `Default weights sum to ~1.0 (got ${total})`);
  }

  // ── 14. Tier thresholds ─────────────────────────────────────────────────
  {
    const allTasks = Array.from({ length: 20 }, (_, i) => task({ _id: `d${i}`, dependencies: ["x"] }));
    const critical = computeTaskPriority(task({ _id: "x", urgency: 5, impact: 5, dependencyCount: 20, businessValue: 10, dueDate: new Date(Date.now() - 86400000).toISOString(), status: "todo", requiredSkills: [], assignedTo: null }), { riskTaskIds: new Set(["x"]), allTasks, memberWorkload: {}, teamSkills: {} });
    assert(critical.tier === "critical", `Critical task scores ${critical.score} → critical (need >= 80)`);
    
    const low = computeTaskPriority(task({ _id: "y", urgency: 1, impact: 1, dependencyCount: 0, businessValue: 0, status: "done", requiredSkills: [], assignedTo: "u1" }), { memberWorkload: { u1: { load: 100, capacity: 40 } }, allTasks: [], teamSkills: { u1: {} } });
    assert(low.tier === "low", `Low task scores ${low.score} → low (need < 30)`);
  }

  await mongoose.disconnect();
  console.log(`\nTaskPriorityEngine: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("test error:", e);
  process.exit(1);
});
