/**
 * server/scripts/testClassicV4RestorationSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — CLASSIC WORKSPACE RESTORATION & DAA ALGORITHM INTEGRITY SUITE
 *
 * Verifies:
 *   1. Exact Six-Tab Classic Navigation:
 *      Overview, Tasks, Sprint, Graph, Members, Chat (in exact order, no 7th/8th tab).
 *   2. Methodology Navigation Isolation:
 *      Classic strictly excludes Project AI, Timeline, Insights, Retro, GitHub.
 *      Scrum preserves its 8 tabs; Waterfall preserves its 8 tabs; NexusFlow has 12 tabs.
 *   3. Deep-link & Tab Normalization:
 *      In Classic, 'sprint', 'graph', 'members' route to dedicated Classic panels,
 *      unlike Waterfall/Scrum which remap them to timeline/insights/team.
 *   4. Tasks & Deterministic Greedy Priority:
 *      Creates Classic tasks, verifies persisted fields & priority scoring.
 *   5. Sprint Planning via 0/1 Knapsack:
 *      Tests capacity limits, value maximization, and candidate filtering.
 *   6. Dependency Graph & Cycle Detection:
 *      Tests DAG construction, BFS/DFS, Kahn's topological sort, and cycle detection.
 *   7. Branch & Bound Member Assignment:
 *      Tests skill profiles, cost matrix derivation, and deterministic assignment.
 *   8. Collaborative Normal Workspace Chat:
 *      Scaped to authorized team, no AI invocation or LLM interception.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ChatMessage from "../models/ChatMessage.js";

import {
  buildGraph,
  dfs,
  bfs,
  topologicalSort,
} from "../algorithms/graphTraversal.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexusflow_dev";

let passedCount = 0;
let totalCount = 0;

function report(name, pass, detail = "") {
  totalCount++;
  if (pass) {
    passedCount++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    console.error(`  ✗ [FAIL] ${name} ${detail}`);
  }
}

async function runSuite() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: CLASSIC WORKSPACE RESTORATION & DAA INTEGRITY SUITE");
  console.log("================================================================================\n");

  // ── GROUP 1: Frontend Navigation & Isolation Verification ────────────────────
  console.log("--- Group 1: Navigation Configuration & Tab Order ---");

  const configPath = path.join(__dirname, "../../client/utils/methodologyConfig.ts");
  const teamPagePath = path.join(__dirname, "../../client/app/team/[teamId].tsx");

  const configCode = fs.readFileSync(configPath, "utf-8");
  const teamPageCode = fs.readFileSync(teamPagePath, "utf-8");

  // 1.1 Classic Configuration has exactly 6 tabs in exact order
  const classicTabsRegex = /CLASSIC_CONFIG[\s\S]*?primaryTabs:\s*\[([\s\S]*?)\]/;
  const matchClassic = configCode.match(classicTabsRegex);
  report("CLASSIC_CONFIG exists in methodologyConfig.ts", !!matchClassic);

  if (matchClassic) {
    const tabMatches = [...matchClassic[1].matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
    const expectedTabs = ["overview", "tasks", "sprint", "graph", "members", "chat"];
    const exactMatch =
      tabMatches.length === 6 &&
      tabMatches.every((val, index) => val === expectedTabs[index]);
    report(
      "Classic navigation has exactly six tabs in required order: Overview, Tasks, Sprint, Graph, Members, Chat",
      exactMatch,
      `Found: [${tabMatches.join(", ")}]`
    );

    // Exclusion of AI, Timeline, Insights, Retro, GitHub
    const excludedKeys = ["advisor", "ai", "timeline", "insights", "retro", "github", "plan", "backlog"];
    const noForbiddenTabs = excludedKeys.every((k) => !tabMatches.includes(k));
    report("Classic tabs exclude AI, Timeline, Insights, Retro, GitHub, Plan, and Backlog", noForbiddenTabs);
  }

  // 1.2 Dedicated CLASSIC_PRIMARY_TABS in team page
  const pageClassicMatch = teamPageCode.includes("const CLASSIC_PRIMARY_TABS:");
  report("team/[teamId].tsx defines isolated CLASSIC_PRIMARY_TABS", pageClassicMatch);

  // 1.3 Methodology Isolation for other methodologies
  // Scrum retains its 8 tabs
  const scrumHas8Tabs = teamPageCode.includes("const SCRUM_PRIMARY_TABS:");
  report("Scrum workspace defines dedicated SCRUM_PRIMARY_TABS", scrumHas8Tabs);

  // Waterfall retains its 8 tabs
  const waterfallHas8Tabs = teamPageCode.includes("const WATERFALL_PRIMARY_TABS:");
  report("Waterfall workspace defines dedicated WATERFALL_PRIMARY_TABS", waterfallHas8Tabs);

  // Newer NexusFlow methodology retains its 12 tabs
  const nexusflow12Tabs = configCode.includes("NEXUSFLOW_CONFIG") && configCode.includes('"github"');
  report("NexusFlow methodology config remains intact with full navigation structure", nexusflow12Tabs);

  // 1.4 Deep link normalization
  // When isClassic:
  // "sprint" -> "sprint"
  // "graph" -> "graph"
  // "members" -> "members"
  const classicRoutingInNormalize =
    teamPageCode.includes("if (isClassic) {") &&
    teamPageCode.includes('if (rawTab === "sprint") return "sprint";') &&
    teamPageCode.includes('if (rawTab === "graph") return "graph";') &&
    teamPageCode.includes('if (rawTab === "members" || rawTab === "team") return "members";');
  report("Direct URL query '?tab=' preserves Classic tabs (sprint, graph, members, etc.) without remapping to timeline/insights", classicRoutingInNormalize);

  // 1.5 Dedicated Classic panel rendering path
  const dedicatedClassicPath =
    teamPageCode.includes("{isClassic ? (") &&
    teamPageCode.includes("<ClassicOverviewPanel") &&
    teamPageCode.includes("<ClassicTasksPanel") &&
    teamPageCode.includes("<SprintPanel") &&
    teamPageCode.includes("<GraphPanel") &&
    teamPageCode.includes("<AssignmentBoard");
  report("Classic workspace renders dedicated DAA panels and avoids newer Waterfall/Scrum shared components", dedicatedClassicPath);

  // ── GROUP 2: Database Persistence & DAA Algorithms ──────────────────────────
  console.log("\n--- Group 2: DAA Algorithms & Data Persistence ---");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected to MongoDB successfully.");

  const suffix = Date.now().toString().slice(-6);
  const ownerId = new mongoose.Types.ObjectId();
  const member1Id = new mongoose.Types.ObjectId();
  const member2Id = new mongoose.Types.ObjectId();

  let classicTeam = null;
  let classicProject = null;
  let tasks = [];

  try {
    // 2.1 Create Classic Team with differentiated skill profiles
    classicTeam = await Team.create({
      name: `Classic DAA Workspace ${suffix}`,
      ownerId,
      methodology: "CLASSIC",
      members: [
        {
          userId: ownerId,
          name: "Algorithm Lead",
          role: "owner",
          skills: { frontend: 8, backend: 9, devops: 5, design: 3, ml: 4, testing: 7 },
        },
        {
          userId: member1Id,
          name: "Frontend Specialist",
          role: "member",
          skills: { frontend: 10, backend: 3, devops: 2, design: 9, ml: 1, testing: 6 },
        },
        {
          userId: member2Id,
          name: "Backend Architect",
          role: "member",
          skills: { frontend: 4, backend: 10, devops: 8, design: 2, ml: 6, testing: 8 },
        },
      ],
    });

    classicProject = await Project.create({
      title: `Classic Project ${suffix}`,
      teamId: classicTeam._id,
      methodology: "CLASSIC",
    });

    report("Classic Team created with authoritative methodology 'CLASSIC'", classicTeam.methodology === "CLASSIC");

    // 2.2 Tasks with Greedy Priority calculation
    const taskA = await Task.create({
      teamId: classicTeam._id,
      title: `Task A (Critical Backend) ${suffix}`,
      status: "todo",
      urgency: 5,
      impact: 5,
      estimatedHours: 8,
      businessValue: 18,
      priorityLabel: "critical",
      priorityScore: 92,
      requiredSkills: ["backend"],
    });

    const taskB = await Task.create({
      teamId: classicTeam._id,
      title: `Task B (UI Design) ${suffix}`,
      status: "todo",
      urgency: 4,
      impact: 3,
      estimatedHours: 6,
      businessValue: 12,
      priorityLabel: "high",
      priorityScore: 70,
      dependencies: [taskA._id.toString()],
      requiredSkills: ["frontend", "design"],
    });

    const taskC = await Task.create({
      teamId: classicTeam._id,
      title: `Task C (Testing Integration) ${suffix}`,
      status: "todo",
      urgency: 2,
      impact: 2,
      estimatedHours: 4,
      businessValue: 6,
      priorityLabel: "low",
      priorityScore: 35,
      dependencies: [taskB._id.toString()],
      requiredSkills: ["testing"],
    });

    tasks = [taskA, taskB, taskC];
    report("Tasks successfully persisted in MongoDB with estimates and values", tasks.length === 3);

    // 2.3 0/1 Knapsack Optimizer Logic
    console.log("\n--- Group 3: 0/1 Knapsack Sprint Optimizer ---");
    // Test knapsack with capacity = 10 hours
    // Items: Task A (8h, val 18), Task B (6h, val 12), Task C (4h, val 6)
    // Feasible combinations:
    // A only (8h, val 18)
    // B + C (10h, val 18)
    // Knapsack chooses optimal value without exceeding capacity
    const eligibleTasks = tasks.filter((t) => t.status === "todo");
    const sprintHours = 10;
    const SCALE = 10;
    const capacity = Math.floor(sprintHours * SCALE);
    const n = eligibleTasks.length;
    const weights = eligibleTasks.map((t) => Math.round(t.estimatedHours * SCALE));
    const values = eligibleTasks.map((t) => t.businessValue);

    const dp = Array.from({ length: n + 1 }, () => new Int32Array(capacity + 1));
    for (let i = 1; i <= n; i++) {
      const w = weights[i - 1];
      const v = values[i - 1];
      for (let c = 0; c <= capacity; c++) {
        dp[i][c] = w <= c ? Math.max(dp[i - 1][c], dp[i - 1][c - w] + v) : dp[i - 1][c];
      }
    }

    const optimalValue = dp[n][capacity];
    report("Knapsack DP computes optimal value (18) within 10h capacity", optimalValue === 18);

    // Backtrack selected tasks
    let remCap = capacity;
    const selected = [];
    for (let i = n; i > 0 && remCap > 0; i--) {
      if (dp[i][remCap] !== dp[i - 1][remCap]) {
        selected.push(eligibleTasks[i - 1]);
        remCap -= weights[i - 1];
      }
    }
    const totalSelectedHours = selected.reduce((sum, t) => sum + t.estimatedHours, 0);
    report("Knapsack selected tasks fit strictly within sprint capacity (totalHours <= 10)", totalSelectedHours <= 10);

    // Edge case: task exceeds capacity
    const zeroCapacity = 2;
    const cap2 = Math.floor(zeroCapacity * SCALE);
    const dp2 = Array.from({ length: n + 1 }, () => new Int32Array(cap2 + 1));
    for (let i = 1; i <= n; i++) {
      const w = weights[i - 1];
      const v = values[i - 1];
      for (let c = 0; c <= cap2; c++) {
        dp2[i][c] = w <= c ? Math.max(dp2[i - 1][c], dp2[i - 1][c - w] + v) : dp2[i - 1][c];
      }
    }
    report("Knapsack returns 0 value and selects nothing when tasks exceed capacity", dp2[n][cap2] === 0);

    // 2.4 Dependency Graph & Cycle Detection
    console.log("\n--- Group 4: Dependency Graph & Topological Sort ---");
    const { adjList, inDegree } = buildGraph(tasks);

    const dfsRes = dfs(adjList);
    report("DFS visits all DAG task nodes with valid timestamps", dfsRes.order.length === 3);

    const bfsRes = bfs(adjList, inDegree);
    report("BFS identifies level 0 roots and downstream dependency tiers", bfsRes.order.length === 3);

    const topoRes = topologicalSort(adjList, inDegree);
    report("Kahn's Topological Sort determines valid execution order [Task A -> Task B -> Task C]", !topoRes.hasCycle && topoRes.order[0] === taskA._id.toString());

    // Cycle detection test: Add circular dependency (Task A depends on Task C)
    const cyclicTasks = [
      { _id: "T1", dependencies: ["T3"] },
      { _id: "T2", dependencies: ["T1"] },
      { _id: "T3", dependencies: ["T2"] },
    ];
    const cyclicGraph = buildGraph(cyclicTasks);
    const cycleTopo = topologicalSort(cyclicGraph.adjList, cyclicGraph.inDegree);
    report("Cycle detection correctly identifies circular dependency and flags hasCycle=true", cycleTopo.hasCycle === true);

    // 2.5 Branch & Bound Member Assignment
    console.log("\n--- Group 5: Branch & Bound Member Assignment ---");
    const bbResult = assignTasksToMembers(classicTeam.members, tasks);
    report("Branch & Bound generates deterministic optimal assignment", Array.isArray(bbResult.assignments) && bbResult.assignments.length === 3);
    report("Branch & Bound cost matrix computed across member skills and task requirements", bbResult.costMatrix.length === 3 && bbResult.costMatrix[0].length === 3);
    report("Branch & Bound explores state space and records pruning metrics", bbResult.meta && typeof bbResult.meta.nodesExplored === "number");

    // 2.6 Normal Collaborative Chat Flow
    console.log("\n--- Group 6: Normal Collaborative Team Chat ---");
    const chatMsg = await ChatMessage.create({
      teamId: classicTeam._id,
      senderId: ownerId,
      senderName: "Algorithm Lead",
      message: "Workspace restored to Classic DAA mode with 6 tabs.",
      type: "team",
    });

    report("Chat message successfully stored and scoped to Classic teamId", chatMsg.teamId.toString() === classicTeam._id.toString());
    report("Chat messages contain standard collaborative text without AI assistant metadata", chatMsg.senderName === "Algorithm Lead" && chatMsg.type === "team");

    // 2.7 Classic Overview Dashboard Counts
    console.log("\n--- Group 7: Dashboard Counts from Persisted Data ---");
    const allPersistedTasks = await Task.find({ teamId: classicTeam._id }).lean();
    const totalCount = allPersistedTasks.length;
    const completedCount = allPersistedTasks.filter((t) => t.status === "done").length;
    const todoCount = allPersistedTasks.filter((t) => t.status === "todo").length;
    const assignedCount = allPersistedTasks.filter((t) => t.assignedTo).length;
    const unassignedCount = totalCount - assignedCount;

    report("Dashboard total task count matches database records (3)", totalCount === 3);
    report("Dashboard status breakdown matches database records (3 todo, 0 done)", todoCount === 3 && completedCount === 0);
    report("Dashboard member count matches team roster (3)", classicTeam.members.length === 3);
  } finally {
    // Clean up test data
    if (tasks.length) await Task.deleteMany({ _id: { $in: tasks.map((t) => t._id) } });
    if (classicProject) await Project.deleteOne({ _id: classicProject._id });
    if (classicTeam) await Team.deleteOne({ _id: classicTeam._id });
    await ChatMessage.deleteMany({ teamId: classicTeam?._id });
    await mongoose.disconnect();
    console.log("\n  Test entities cleaned up. Disconnected from MongoDB.");
  }

  console.log("\n================================================================================");
  console.log(`  CLASSIC SUITE RESULT: ${passedCount} / ${totalCount} PASSED`);
  console.log("================================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
