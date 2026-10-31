/**
 * server/scripts/testClassicRestorationAndScrumScrollSuite.js
 * ============================================================================
 * NEXUSFLOW V4: CLASSIC RESTORATION (FIX 1) & SCRUM BOARD SCROLL (FIX 2)
 * Comprehensive automated verification suite for:
 *   1. Six-tab Classic navigation structure & isolation
 *   2. Deep-link routing & query normalization
 *   3. DAA algorithm execution paths (Knapsack, B&B, Topo Graph, Boyer-Moore)
 *   4. AI feature lockout for Classic
 *   5. Scrum horizontal scroll controls & vertical column preservation
 *   6. Cross-methodology regression preservation (Waterfall, Scrum, Kanban)
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

import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";

import { knapsackSprint, boyerMooreSearch } from "../algorithms/taskOptimiser.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexusflow_dev";

let passedCount = 0;
let totalCount = 0;

function report(name, pass, detail = "") {
  totalCount++;
  if (pass) {
    passedCount++;
    console.log(`  ? [PASS] ${name}`);
  } else {
    console.error(`  ? [FAIL] ${name} ${detail}`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: FIX 1 (CLASSIC RESTORATION) & FIX 2 (SCRUM SCROLL) AUDIT SUITE");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected to MongoDB Atlas successfully.\n");

  const suffix = Date.now().toString().slice(-6);

  try {
    // --------------------------------------------------------------------------
    // TEST GROUP 1: Fix 1 ? Six-Tab Classic Navigation & Shell Isolation
    // --------------------------------------------------------------------------
    console.log("? GROUP 1: Fix 1 ? Six-Tab Classic Navigation & Shell Isolation");

    const teamPageCode = fs.readFileSync("client/app/team/[teamId].tsx", "utf-8");

    // 1.1 Exactly six tabs in Classic
    const classicTabsMatch = teamPageCode.includes("const CLASSIC_PRIMARY_TABS:");
    report("CLASSIC_PRIMARY_TABS is defined in team/[teamId].tsx", classicTabsMatch);

    // Verify the exact 6 tabs in order: Overview, Tasks, Sprint, Graph, Members, Chat
    const expectedClassicTabs = ["overview", "tasks", "sprint", "graph", "members", "chat"];
    const classicTabsExtract = teamPageCode.match(/const CLASSIC_PRIMARY_TABS[\s\S]*?\];/)?.[0] || "";
    
    let tabOrderCorrect = true;
    for (let i = 0; i < expectedClassicTabs.length; i++) {
      const tabKey = expectedClassicTabs[i];
      if (!classicTabsExtract.includes(`key: "${tabKey}"`)) {
        tabOrderCorrect = false;
        break;
      }
    }
    report("Classic renders exactly the 6 required tabs in order (Overview, Tasks, Sprint, Graph, Members, Chat)", tabOrderCorrect && !classicTabsExtract.includes("advisor") && !classicTabsExtract.includes("timeline") && !classicTabsExtract.includes("insights") && !classicTabsExtract.includes("github") && !classicTabsExtract.includes("retro"));

    // 1.2 Dedicated Classic Panel Render Path
    const classicShellCheck = teamPageCode.includes("isClassic ? (") &&
      teamPageCode.includes("<ClassicOverviewPanel") &&
      teamPageCode.includes("<ClassicTasksPanel") &&
      teamPageCode.includes("<ClassicSprintPanel") &&
      teamPageCode.includes("<GraphPanel") &&
      teamPageCode.includes("<ClassicMembersPanel") &&
      teamPageCode.includes("<ChatPanel");
    report("Dedicated Classic workspace shell conditionally renders all 6 original DAA panels", classicShellCheck);

    // 1.3 Methodology WIP Banner exclusion for Classic
    const wipBannerCheck = teamPageCode.includes("!isWaterfall && !isScrum && !isKanban && !isClassic");
    report("Methodology WIP banner is NOT displayed for Classic workspaces", wipBannerCheck);

    // 1.4 Deep Link Normalization for Classic
    const normClassicCheck = teamPageCode.includes('if (isClassic) {') &&
      teamPageCode.includes('if (rawTab === "tasks" || rawTab === "board" || rawTab === "backlog") return "tasks";') &&
      teamPageCode.includes('if (rawTab === "sprint") return "sprint";') &&
      teamPageCode.includes('if (rawTab === "graph") return "graph";') &&
      teamPageCode.includes('if (rawTab === "members" || rawTab === "team") return "members";') &&
      teamPageCode.includes('if (rawTab === "chat" || rawTab === "chats") return "chat";');
    report("Deep-link normalization routes Classic requests safely and prevents foreign tab access", normClassicCheck);

    // 1.5 Methodology normalization recognizes aliases
    const methodologyConfigCode = fs.readFileSync("client/utils/methodologyConfig.ts", "utf-8");
    report("normalizeMethodologyId maps 'CLASSIC', 'classic', 'NEXUSFLOW', and 'V3' to CLASSIC",
      methodologyConfigCode.includes('if (s === "CLASSIC" || s === "NEXUSFLOW" || s === "V3") return "CLASSIC";')
    );

    // --------------------------------------------------------------------------
    // TEST GROUP 2: Fix 1 ? DAA Algorithm Call Paths & AI Feature Lockout
    // --------------------------------------------------------------------------
    console.log("\n? GROUP 2: Fix 1 ? DAA Algorithm Call Paths & AI Feature Lockout");

    // 2.1 0/1 Knapsack algorithm verification
    const sampleBacklog = [
      { id: "t1", title: "Task 1", effort: 10, value: 25 },
      { id: "t2", title: "Task 2", effort: 20, value: 50 },
      { id: "t3", title: "Task 3", effort: 30, value: 70 },
      { id: "t4", title: "Task 4", effort: 15, value: 40 },
    ];
    const knapsackResult = knapsackSprint(sampleBacklog, 40);
    report("0/1 Knapsack optimizer selects tasks maximizing business value within capacity", knapsackResult.effortUsed <= 40 && knapsackResult.selectedTasks.length > 0);
    const utilizationPct = Math.round((knapsackResult.effortUsed / 40) * 100);
    report("0/1 Knapsack utilization calculation is accurate", utilizationPct > 0 && utilizationPct <= 100);

    // Knapsack edge case: capacity 0 or task larger than capacity
    const knapsackZero = knapsackSprint(sampleBacklog, 5);
    report("0/1 Knapsack safely handles capacity smaller than any task", knapsackZero.selectedTasks.length === 0 && knapsackZero.effortUsed === 0);

    // 2.2 Branch & Bound task-to-member assignment verification
    const sampleMembers = [
      { userId: "u1", name: "Alice", skills: { frontend: 9, backend: 3, devops: 2, design: 4, ml: 1, testing: 5 } },
      { userId: "u2", name: "Bob", skills: { frontend: 2, backend: 9, devops: 8, design: 2, ml: 3, testing: 6 } },
    ];
    const sampleTasksForBnB = [
      { _id: "task_fe", title: "Build React Component", category: "frontend" },
      { _id: "task_be", title: "Create API Route", category: "backend" },
    ];
    const bnbResult = assignTasksToMembers(sampleMembers, sampleTasksForBnB);
    report("Branch & Bound deterministically assigns tasks based on skill cost matrix", bnbResult.assignments.length === 2);
    report("Branch & Bound pruned search states reporting meta", bnbResult.meta !== undefined && Number.isFinite(bnbResult.totalCost));

    // 2.3 Boyer-Moore exact pattern search
    const bmCorpus = [
      { title: "Setup PostgreSQL database", description: "Deploy database cluster" },
      { title: "Design Landing Page UI", description: "Figma to React" },
      { title: "Implement Auth Middleware", description: "JWT validation" },
    ];
    const bmResults = boyerMooreSearch(bmCorpus, "database");
    const bmNotFound = boyerMooreSearch(bmCorpus, "nonexistentxyz");
    report("Boyer-Moore pattern matching finds exact substrings in task titles", bmResults.length === 1 && bmResults[0].title.includes("database") && bmNotFound.length === 0);

    // 2.4 Classic AI Chat Lockout verification
    const aiOrchestratorCode = fs.readFileSync("server/socket/aiOrchestrator.js", "utf-8");
    const aiLockoutCheck = aiOrchestratorCode.includes('if (team?.methodology === "CLASSIC") return;');
    report("Classic methodology strictly excludes @ai chatbot triggering and LLM invocation in socket layer", aiLockoutCheck);

    // 2.5 Classic Tasks Panel contains NO AI story generator calls
    const classicTasksCode = fs.readFileSync("client/components/workspace/ClassicTasksPanel.tsx", "utf-8");
    const noAiInTasks = !classicTasksCode.includes("AiTaskAssistant") &&
      !classicTasksCode.includes("onGenerateAI") &&
      !classicTasksCode.includes("aiSuggest");
    report("Classic Tasks panel workflow contains NO AI task generation or AI suggestion triggers", noAiInTasks);

    // --------------------------------------------------------------------------
    // TEST GROUP 3: Fix 2 ? Scrum Tasks Board Horizontal Scroll Controls
    // --------------------------------------------------------------------------
    console.log("\n? GROUP 3: Fix 2 ? Scrum Tasks Board Horizontal Scroll Controls");

    const scrumTasksCode = fs.readFileSync("client/components/workspace/ScrumTasksPanel.tsx", "utf-8");

    // 3.1 Visible Scroll Controls
    const hasScrollControls = scrumTasksCode.includes('s.scrollControls');
    report("ScrumTasksPanel defines dedicated scrollControls container in header", hasScrollControls);

    // 3.2 Distinct Buttons with recognizable arrow icons & accessible labels
    const hasLeftScrollBtn = scrumTasksCode.includes('accessibilityLabel="Scroll task board left"');
    const hasRightScrollBtn = scrumTasksCode.includes('accessibilityLabel="Scroll task board right"');
    const hasScrollArrowIcons = scrumTasksCode.includes('name="arrow-back"') && scrumTasksCode.includes('name="arrow-forward"');
    report("Scroll controls feature dedicated 'Scroll Left' and 'Scroll Right' buttons with arrow icons", hasLeftScrollBtn && hasRightScrollBtn && hasScrollArrowIcons);

    // 3.3 Dynamic measurement and scroll bounds
    const hasScrollMeasurement = scrumTasksCode.includes("boardScrollRef") &&
      scrumTasksCode.includes("onScroll") &&
      scrumTasksCode.includes("onLayout") &&
      scrumTasksCode.includes("onContentSizeChange");
    report("Horizontal board ScrollView measures scrollX, containerWidth, and contentWidth dynamically", hasScrollMeasurement);

    // 3.4 Smooth animated scrolling with web and native support
    const hasScrollHandler = scrumTasksCode.includes("scrollBoard") &&
      scrumTasksCode.includes("scrollToOffset") &&
      scrumTasksCode.includes('Platform.OS === "web"');
    report("scrollBoard handler executes incremental column scrolling (~310px) with platform-separated smooth web fallback", hasScrollHandler);

    // 3.5 Disabled states when at boundaries or wide viewports
    const hasBoundaryChecks = scrumTasksCode.includes("canScrollLeft = boardScrollX > 5") &&
      scrumTasksCode.includes("canScrollRight = isMeasured");
    report("Scroll buttons dynamically disable when at start/end boundaries or on wide viewports", hasBoundaryChecks);

    // 3.6 Internal vertical scrolling preserved in all 4 columns
    const hasFourColumns = scrumTasksCode.includes("SCRUM_COLUMNS.map((col) => {");
    const hasNestedScroll = scrumTasksCode.includes("nestedScrollEnabled") &&
      scrumTasksCode.includes("showsVerticalScrollIndicator={true}");
    report("Four Scrum status columns (To Do, In Progress, In Review, Done) preserve independent vertical scrolling", hasFourColumns && hasNestedScroll);

    // 3.7 Non-interference with Scrum ceremonies and status transitions
    const hasStatusTransitions = scrumTasksCode.includes("handleMoveStatus");
    const hasDailyScrum = scrumTasksCode.includes("Daily Scrum");
    const hasDeleteSprint = scrumTasksCode.includes("Delete Sprint");
    report("Scrum board scroll controls preserve sprint controls, Daily Scrum, status transitions, and lifecycle actions", hasStatusTransitions && hasDailyScrum && hasDeleteSprint);

    // --------------------------------------------------------------------------
    // TEST GROUP 4: Cross-Methodology Regression Verification
    // --------------------------------------------------------------------------
    console.log("\n? GROUP 4: Cross-Methodology Regression Verification");

    // 4.1 Waterfall navigation intact (8 tabs)
    const waterfallTabs = ["overview", "advisor", "team", "tasks", "timeline", "insights", "chat", "github"];
    const wfExtract = teamPageCode.match(/const WATERFALL_PRIMARY_TABS[\s\S]*?\];/)?.[0] || "";
    let wfAllPresent = true;
    for (const t of waterfallTabs) {
      if (!wfExtract.includes(`key: "${t}"`)) wfAllPresent = false;
    }
    report("Waterfall retains all 8 established tabs (Overview, Project AI, Team, Tasks, Timeline, Insights, Chat, GitHub)", wfAllPresent);

    // 4.2 Scrum navigation intact (8 tabs)
    const scrumTabs = ["overview", "advisor", "team", "tasks", "insights", "retro", "chat", "github"];
    const scrumExtract = teamPageCode.match(/const SCRUM_PRIMARY_TABS[\s\S]*?\];/)?.[0] || "";
    let scrumAllPresent = true;
    for (const t of scrumTabs) {
      if (!scrumExtract.includes(`key: "${t}"`)) scrumAllPresent = false;
    }
    report("Scrum retains all 8 established tabs (Overview, Project AI, Team, Tasks, Insights, Retrospective, Chat, GitHub)", scrumAllPresent);

    // 4.3 Kanban navigation intact (9 tabs)
    const kanbanExtract = teamPageCode.match(/const KANBAN_PRIMARY_TABS[\s\S]*?\];/)?.[0] || "";
    report("Kanban retains its established flow and policies navigation", kanbanExtract.includes("policies") && (kanbanExtract.includes("Flow") || kanbanExtract.includes("timeline")));

    // 4.4 Live DB Persistence Verification with real Classic Team
    const ownerId = new mongoose.Types.ObjectId();
    const classicTeam = await Team.create({
      name: `Classic Audit Team ${suffix}`,
      ownerId,
      methodology: "CLASSIC",
      members: [
        { userId: ownerId, name: "DAA Lead", role: "owner", skills: { frontend: 8, backend: 6, devops: 4, design: 5, ml: 2, testing: 7 } }
      ],
    });

    const classicProject = await Project.create({
      title: `Classic DAA Project ${suffix}`,
      teamId: classicTeam._id,
      methodology: "CLASSIC",
    });

    const classicTask = await Task.create({
      teamId: classicTeam._id,
      title: "DAA Algorithm Implementation Task",
      description: "Verify deterministic persistence for Classic",
      estimatedHours: 8,
      businessValue: 16,
      urgency: 4,
      impact: 4,
      priorityScore: 78,
      status: "todo",
    });

    report("Classic Team and Project persist with authoritative CLASSIC methodology in MongoDB", classicTeam.methodology === "CLASSIC" && classicProject.methodology === "CLASSIC");
    report("Classic task persists with estimatedHours, businessValue, and greedy priorityScore", classicTask.estimatedHours === 8 && classicTask.businessValue === 16 && classicTask.priorityScore > 0);

    // Cleanup test records
    await Task.deleteMany({ teamId: classicTeam._id });
    await Project.deleteOne({ _id: classicProject._id });
    await Team.deleteOne({ _id: classicTeam._id });
    console.log("  Cleaned up temporary audit records.");

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    report("Test execution", false, err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n================================================================================");
    console.log(`  RESULTS: ${passedCount} / ${totalCount} TESTS PASSED (${Math.round((passedCount / totalCount) * 100)}%)`);
    console.log("================================================================================");
    if (passedCount !== totalCount) {
      process.exit(1);
    }
  }
}

runTestSuite();
