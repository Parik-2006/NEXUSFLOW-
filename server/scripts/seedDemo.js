/**
 * seedDemo.js  —  DEV / DEMO ONLY
 * ================================================================
 * Lightweight demo dataset generator. Creates one team whose data makes every
 * DAA feature produce a visible, non-trivial result on stage:
 *
 *   • Tasks with urgency/impact      → Greedy priorityScore (0–100)
 *   • Tasks with businessValue+hours → 0/1 Knapsack sprint plan
 *   • Tasks with a dependency chain  → DFS / BFS / Topological Sort + a graph
 *   • A deliberate parallel branch   → BFS shows >1 task per level
 *   • Members with DIFFERENT skills  → Branch & Bound cost matrix is meaningful
 *
 * Usage:
 *   node server/scripts/seedDemo.js
 *   (respects MONGO_URI; defaults to mongodb://localhost:27017/nexusflow)
 *
 * Safe to re-run: it removes the previous "DAA Demo Team" + its tasks first.
 * It NEVER touches other teams' data.
 */

import "dotenv/config";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";
const TEAM_NAME = "DAA Demo Team";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`[seed] connected to ${MONGO_URI}`);

  // ── Clean slate (demo team only) ──────────────────────────────────────────
  const existing = await Team.find({ name: TEAM_NAME }).lean();
  for (const t of existing) {
    await Task.deleteMany({ teamId: t._id });
    await Team.deleteOne({ _id: t._id });
  }

  // ── Team with skill-profiled members (varied → B&B is meaningful) ─────────
  const oid = () => new mongoose.Types.ObjectId();
  const frontendDev = oid(), backendDev = oid(), devopsEng = oid();

  const team = await Team.create({
    name: TEAM_NAME,
    members: [
      { userId: frontendDev, name: "Ava (Frontend)", skills: { frontend: 9, backend: 3, devops: 2, design: 7, ml: 1, testing: 5 } },
      { userId: backendDev,  name: "Ben (Backend)",  skills: { frontend: 2, backend: 9, devops: 6, design: 1, ml: 4, testing: 6 } },
      { userId: devopsEng,   name: "Cleo (DevOps)",  skills: { frontend: 1, backend: 5, devops: 9, design: 1, ml: 2, testing: 7 } },
    ],
  });
  console.log(`[seed] team ${team._id} with ${team.members.length} members`);

  // ── Tasks: urgency/impact drive Greedy; value/hours drive Knapsack ────────
  // skillWeights drive Branch & Bound; dependencies drive DFS/BFS/Topo.
  const defs = [
    { key: "design",  title: "Design auth UI",          urgency: 3, impact: 4, businessValue: 8,  estimatedHours: 4, storyPoints: 3, skillWeights: { frontend: 8, design: 7 } },
    { key: "api",     title: "Build login API",         urgency: 5, impact: 5, businessValue: 10, estimatedHours: 6, storyPoints: 5, skillWeights: { backend: 9, testing: 5 } },
    { key: "infra",   title: "Provision CI pipeline",   urgency: 2, impact: 3, businessValue: 5,  estimatedHours: 3, storyPoints: 3, skillWeights: { devops: 9 } },
    { key: "ui",      title: "Wire login screen",       urgency: 4, impact: 4, businessValue: 7,  estimatedHours: 5, storyPoints: 4, skillWeights: { frontend: 9 } },
    { key: "tests",   title: "Add auth integration tests", urgency: 3, impact: 3, businessValue: 6, estimatedHours: 4, storyPoints: 3, skillWeights: { testing: 8, backend: 5 } },
    { key: "deploy",  title: "Deploy to staging",       urgency: 4, impact: 5, businessValue: 9,  estimatedHours: 2, storyPoints: 2, skillWeights: { devops: 8 } },
  ];

  const created = {};
  for (const d of defs) {
    const task = await Task.create({
      teamId: team._id,
      title: d.title,
      urgency: d.urgency,
      impact: d.impact,
      businessValue: d.businessValue,
      estimatedHours: d.estimatedHours,
      storyPoints: d.storyPoints,
      skillWeights: d.skillWeights,
      // priorityScore is auto-computed by the pre-save hook.
    });
    created[d.key] = task;
  }

  // ── Dependency DAG (drives Topo order + BFS levels + graph view) ──────────
  //   design ─┐
  //           ├─► api ─► tests ─► deploy
  //   infra ──┘            ▲
  //              ui ───────┘
  // (api depends on design+infra; tests depends on api+ui; deploy depends on tests)
  const edges = [
    ["api",    ["design", "infra"]],
    ["ui",     ["design"]],
    ["tests",  ["api", "ui"]],
    ["deploy", ["tests"]],
  ];
  for (const [child, parents] of edges) {
    const deps = parents.map((p) => created[p]._id);
    await Task.updateOne(
      { _id: created[child]._id },
      { $set: { dependencies: deps, dependencyCount: deps.length } }
    );
  }
  // Recompute priorityScore for tasks whose dependencyCount changed.
  for (const [child] of edges) {
    const t = await Task.findById(created[child]._id);
    await t.save(); // pre-save hook recomputes priorityScore with new depCount
  }

  console.log(`[seed] ${defs.length} tasks created with dependency DAG`);
  console.log(`[seed] DONE. Team id: ${team._id}`);
  console.log("[seed] Tip: open this team in the app — Greedy order, Graph (DFS/BFS/Topo),");
  console.log("[seed]      Sprint Optimizer, Recommend, and @ai task creation all show results.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
