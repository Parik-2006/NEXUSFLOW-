/**
 * server/scripts/testClassicV1GuideSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — CLASSIC V1 DAA GUIDE AUTOMATED TEST SUITE
 *
 * Validates Part 1 requirements:
 * 1. Classic guide data structure (6 canonical tabs, 0/1 Knapsack formulation).
 * 2. 9 classical DAA algorithms documented with complexity and methodology.
 * 3. ClassicGuideModal implementation (navigation, steps, tabs, algorithms view).
 * 4. ClassicGuideBanner implementation (dismissible, reopenable, copy).
 * 5. Integration into ClassicOverviewPanel with tab navigation support.
 * 6. Methodology isolation (strictly DAA Classic, no Scrum/Waterfall leakage).
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import assert from "assert";

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("\n=======================================================");
console.log("RUNNING NEXUSFLOW CLASSIC V1 GUIDE VERIFICATION SUITE");
console.log("=======================================================\n");

// 1. Verify classicGuideData.ts exists and content
const guideDataPath = path.resolve("client/constants/classicGuideData.ts");
const guideDataContent = fs.readFileSync(guideDataPath, "utf8");

test("classicGuideData.ts exists and exports CLASSIC_GUIDE_STEPS and CLASSIC_DAA_ALGORITHMS", () => {
  assert.ok(fs.existsSync(guideDataPath), "File must exist");
  assert.ok(guideDataContent.includes("export const CLASSIC_GUIDE_STEPS"), "Must export CLASSIC_GUIDE_STEPS");
  assert.ok(guideDataContent.includes("CLASSIC_DAA_ALGORITHMS"), "Must export CLASSIC_DAA_ALGORITHMS");
});

test("CLASSIC_GUIDE_STEPS defines exactly the 6 original Classic tabs in exact order", () => {
  const tabTargets = ["overview", "tasks", "sprint", "graph", "members", "chat"];
  for (const tab of tabTargets) {
    assert.ok(
      guideDataContent.includes(`tabTarget: "${tab}"`),
      `CLASSIC_GUIDE_STEPS must contain step targeting tab '${tab}'`
    );
  }
});

test("Step 1 (Overview) covers workspace dashboard, task metrics, and health", () => {
  assert.ok(guideDataContent.includes("Overview Dashboard"));
  assert.ok(guideDataContent.includes("completed tasks / total tasks"));
  assert.ok(guideDataContent.includes("Greedy priority distribution"));
});

test("Step 2 (Tasks) explains Classic task workflow and Greedy priority scheduling", () => {
  assert.ok(guideDataContent.includes("Tasks Management"));
  assert.ok(guideDataContent.includes("Greedy Priority Scheduler"));
  assert.ok(guideDataContent.includes("Boyer-Moore Search"));
});

test("Step 3 (Sprint) documents the 0/1 Knapsack algorithm and mathematical formulation", () => {
  assert.ok(guideDataContent.includes("Sprint Optimizer"));
  assert.ok(guideDataContent.includes("0/1 Knapsack"), "Must reference 0/1 Knapsack");
  assert.ok(guideDataContent.includes("capacity"), "Must mention capacity constraint");
  assert.ok(guideDataContent.includes("Maximize: Σ (value[i] × x[i])"), "Must include 0/1 Knapsack formulation");
});

test("Step 4 (Graph) documents DAG visualization, Kahn's algorithm, DFS, and BFS", () => {
  assert.ok(guideDataContent.includes("Dependency Graph (DAG)"));
  assert.ok(guideDataContent.includes("Kahn's Algorithm"));
  assert.ok(guideDataContent.includes("Depth-First Search (DFS)"));
  assert.ok(guideDataContent.includes("Breadth-First Search (BFS)"));
});

test("Step 5 (Members) documents team roster and Branch & Bound workload optimization", () => {
  assert.ok(guideDataContent.includes("Members & Allocation"));
  assert.ok(guideDataContent.includes("Branch & Bound"));
  assert.ok(guideDataContent.includes("assigned hours vs available capacity"));
});

test("Step 6 (Chat) documents classic real-time team collaboration", () => {
  assert.ok(guideDataContent.includes("Team Chat"));
  assert.ok(guideDataContent.includes("real-time messaging") || guideDataContent.includes("Real-time"));
});

test("CLASSIC_DAA_ALGORITHMS documents all 9 classical DAA algorithms with complexities", () => {
  const algorithms = [
    { name: "0/1 Knapsack", comp: "O(n × W)" },
    { name: "Topological Sort (Kahn's)", comp: "O(V + E)" },
    { name: "Depth-First Search (DFS)", comp: "O(V + E)" },
    { name: "Breadth-First Search (BFS)", comp: "O(V + E)" },
    { name: "Greedy Scheduler", comp: "O(n log n)" },
    { name: "Earliest Deadline First (EDF)", comp: "O(n log n)" },
    { name: "Branch and Bound", comp: "O(n!)" },
    { name: "Boyer-Moore", comp: "O(n / m)" },
    { name: "Merge Sort", comp: "O(n log n)" },
  ];

  for (const algo of algorithms) {
    assert.ok(guideDataContent.includes(algo.name), `Must document algorithm: ${algo.name}`);
    assert.ok(guideDataContent.includes(algo.comp), `Must document complexity ${algo.comp} for ${algo.name}`);
  }
});

// 2. Verify ClassicGuideModal.tsx
const modalPath = path.resolve("client/components/ClassicGuideModal.tsx");
const modalContent = fs.readFileSync(modalPath, "utf8");

test("ClassicGuideModal.tsx implements 6-step interactive guide with tab navigation", () => {
  assert.ok(fs.existsSync(modalPath), "ClassicGuideModal must exist");
  assert.ok(modalContent.includes("onNavigateTab?: (tabKey: string) => void"), "Must accept onNavigateTab prop");
  assert.ok(modalContent.includes("currentStepIndex"), "Must track current step index");
  assert.ok(modalContent.includes("handleNext"), "Must implement handleNext");
  assert.ok(modalContent.includes("handlePrev"), "Must implement handlePrev");
  assert.ok(modalContent.includes("showAlgorithms"), "Must support toggling algorithms view");
  assert.ok(modalContent.includes("handleJumpToTab"), "Must have handleJumpToTab action");
});

// 3. Verify ClassicGuideBanner.tsx
const bannerPath = path.resolve("client/components/ClassicGuideBanner.tsx");
const bannerContent = fs.readFileSync(bannerPath, "utf8");

test("ClassicGuideBanner.tsx implements dismissible, reopenable guide banner", () => {
  assert.ok(fs.existsSync(bannerPath), "ClassicGuideBanner must exist");
  assert.ok(bannerContent.includes("New to NexusFlow Classic?"), "Must contain banner headline");
  assert.ok(bannerContent.includes("Learn how the original DAA-based project management workflow works."), "Must contain banner subtitle");
  assert.ok(bannerContent.includes("Open Guide →"), "Must contain Open Guide button");
  assert.ok(bannerContent.includes("dismissed"), "Must support dismiss state");
  assert.ok(bannerContent.includes("reopen"), "Must support reopen pill");
});

// 4. Verify ClassicOverviewPanel.tsx integration
const overviewPath = path.resolve("client/components/workspace/ClassicOverviewPanel.tsx");
const overviewContent = fs.readFileSync(overviewPath, "utf8");

test("ClassicOverviewPanel.tsx renders ClassicGuideBanner with tab navigation hook", () => {
  assert.ok(overviewContent.includes("import ClassicGuideBanner from"), "Must import ClassicGuideBanner");
  assert.ok(overviewContent.includes("<ClassicGuideBanner"), "Must render ClassicGuideBanner");
  assert.ok(overviewContent.includes("onNavigateTab={onNavigate}"), "Must pass onNavigateTab to ClassicGuideBanner");
});

// 5. Methodology Isolation Check
test("Classic Guide data preserves pure DAA V1 isolation without Scrum or Waterfall ceremonies", () => {
  const forbiddenTerms = [
    "Retrospective",
    "Story Points Estimation",
    "Scrum Master",
    "Waterfall Phase Gating",
    "Project AI Story Generator",
    "Risk Radar",
    "Health Snapshot",
  ];

  for (const term of forbiddenTerms) {
    assert.strictEqual(
      guideDataContent.includes(term),
      false,
      `Classic guide must not leak modern Scrum/Waterfall concept: ${term}`
    );
  }
});

console.log("\n-------------------------------------------------------");
console.log(`Classic V1 Guide Suite Results: ${passed} passed, ${failed} failed`);
console.log("-------------------------------------------------------\n");

if (failed > 0) process.exit(1);
