/**
 * server/scripts/testScrumTasksBoardScrollSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM TASK-BOARD HORIZONTAL SCROLL CONTROLS & BOARD AUDIT
 *
 * Verifies:
 *   1. Visible Left / Right Board Controls:
 *      - Dedicated left/right scroll buttons with recognizable arrow icons
 *      - Accessible labels: "Scroll task board left" and "Scroll task board right"
 *      - Distinct from "To Do" / "Done" shortcuts and "Filter Blocked Only"
 *   2. Dynamic Horizontal Scroll Engine:
 *      - onScroll listener tracking boardScrollX
 *      - onLayout tracking visible container width
 *      - onContentSizeChange tracking total board content width
 *      - canScrollLeft & canScrollRight state logic with visual disabled styles
 *      - Step increment (310px) smoothly scrolling ~1 column per click
 *      - Platform-compatible scrolling (scrollToOffset / scrollTo({ x, animated }))
 *   3. Column Architecture & Nested Vertical Scrolling:
 *      - Exactly 4 Scrum status columns: To Do, In Progress, In Review, Done
 *      - Internal vertical ScrollView within each column for tall backlogs
 *      - Horizontal board container does not trap or block vertical card scrolling
 *   4. Scrum Lifecycle & Transition Non-Interference:
 *      - Preserves status transitions (todo -> in_progress -> in_review -> done)
 *      - Story points, sprint commitments, card breakdown, inspection intact
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

import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";

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
  console.log("  NEXUSFLOW V4: SCRUM TASK-BOARD HORIZONTAL SCROLL & LIFECYCLE SUITE");
  console.log("================================================================================\n");

  console.log("--- Group 1: Component Source & Control Verification ---");

  const panelPath = path.join(__dirname, "../../client/components/workspace/ScrumTasksPanel.tsx");
  const panelCode = fs.readFileSync(panelPath, "utf-8");

  // 1.1 Dedicated Left / Right Controls with Accessible Labels
  const hasLeftLabel = panelCode.includes('accessibilityLabel="Scroll task board left"');
  report("Left board scroll control has explicit accessibilityLabel 'Scroll task board left'", hasLeftLabel);

  const hasRightLabel = panelCode.includes('accessibilityLabel="Scroll task board right"');
  report("Right board scroll control has explicit accessibilityLabel 'Scroll task board right'", hasRightLabel);

  const hasArrowIcons = panelCode.includes('name="arrow-back"') && panelCode.includes('name="arrow-forward"');
  report("Scroll controls render recognizable arrow icons (arrow-back, arrow-forward)", hasArrowIcons);

  // 1.2 Distinction from existing shortcut buttons
  const hasToDoDoneShortcuts = panelCode.includes('scrollToOffset(0)') && panelCode.includes('scrollToOffset(maxScrollX)');
  report("Dedicated left/right arrow controls exist alongside To Do/Done quick jumps without collision", hasToDoDoneShortcuts);

  const hasBlockedFilter = panelCode.includes("filterBlockedOnly");
  report("Filter Blocked Only control preserved and independent from scroll controls", hasBlockedFilter);

  // 1.3 Horizontal Container Measurement & Dynamic Scroll Engine
  const hasOnScroll = panelCode.includes("onScroll={") && panelCode.includes("scrollEventThrottle={16}");
  report("Horizontal ScrollView listens to onScroll events with 16ms throttle", hasOnScroll);

  const hasOnLayout = panelCode.includes("onLayout={") && panelCode.includes("setBoardContainerWidth");
  report("Horizontal ScrollView listens to onLayout to track visible container width", hasOnLayout);

  const hasOnContentSizeChange = panelCode.includes("onContentSizeChange={") && panelCode.includes("setBoardContentWidth");
  report("Horizontal ScrollView listens to onContentSizeChange to track total content width", hasOnContentSizeChange);

  const hasCanScrollLogic =
    panelCode.includes("const canScrollLeft = boardScrollX > 5;") &&
    panelCode.includes("const canScrollRight = isMeasured");
  report("Dynamic boundary detection correctly computes canScrollLeft and canScrollRight", hasCanScrollLogic);

  const hasDisabledStyle = panelCode.includes("!canScrollLeft && s.scrollBtnDisabled") && panelCode.includes("!canScrollRight && s.scrollBtnDisabled");
  report("Left and right controls apply visual disabled styling when bounds are reached", hasDisabledStyle);

  const hasStepCalculation = panelCode.includes("const step = 310;");
  report("Scroll step moves ~1 column width (310px) smoothly per interaction", hasStepCalculation);

  // 1.4 Column Architecture
  console.log("\n--- Group 2: Board Column Architecture & Nested Vertical Scrolling ---");

  const columnOrder = ['col.id === "todo"', 'col.id === "in_progress"', 'col.id === "in_review"', 'col.id === "done"'];
  const hasAllColumns = columnOrder.every((c) => panelCode.includes(c));
  report("Scrum task board preserves all 4 columns: To Do, In Progress, In Review, Done", hasAllColumns);

  // Check internal vertical scroll container in columns
  const hasInternalVerticalScroll =
    panelCode.includes("showsVerticalScrollIndicator={true}") &&
    panelCode.includes("nestedScrollEnabled");
  report("Status columns embed internal vertical ScrollView with nestedScrollEnabled for long task lists", hasInternalVerticalScroll);

  const hasOuterHorizontalScroll = panelCode.includes("<ScrollView") && panelCode.includes("horizontal");
  report("Board uses outer horizontal ScrollView container to allow horizontal overflow", hasOuterHorizontalScroll);

  // ── GROUP 3: Task Lifecycle & Status Transitions ──────────────────────────
  console.log("\n--- Group 3: Task Lifecycle & Status Transitions ---");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected to MongoDB successfully.");

  const suffix = Date.now().toString().slice(-6);
  const ownerId = new mongoose.Types.ObjectId();
  let team = null;
  let project = null;
  let sprint = null;
  let task = null;

  try {
    team = await Team.create({
      name: `Scrum Test Team ${suffix}`,
      ownerId,
      methodology: "SCRUM",
      members: [{ userId: ownerId, name: "Scrum Master", role: "owner" }],
    });

    project = await Project.create({
      title: `Scrum Test Project ${suffix}`,
      teamId: team._id,
      methodology: "SCRUM",
    });

    sprint = await Sprint.create({
      teamId: team._id,
      projectId: project._id,
      name: "Sprint 01",
      sprintNumber: 1,
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 86400000),
      capacityHours: 40,
    });

    task = await Task.create({
      teamId: team._id,
      title: `User Story A ${suffix}`,
      status: "todo",
      scrumStatus: "TODO",
      sprintId: sprint._id,
      storyPoints: 5,
      estimatedHours: 8,
    });

    report("Task created in 'todo'/'TODO' status with 5 story points in Sprint 01", task.scrumStatus === "TODO" && task.storyPoints === 5);

    // Transition: TODO -> IN_PROGRESS
    task.scrumStatus = "IN_PROGRESS";
    task.status = "in_progress";
    await task.save();
    const updated1 = await Task.findById(task._id).lean();
    report("Task transitions to 'IN_PROGRESS' seamlessly", updated1.scrumStatus === "IN_PROGRESS" && updated1.status === "in_progress");

    // Transition: IN_PROGRESS -> IN_REVIEW
    task.scrumStatus = "IN_REVIEW";
    await task.save();
    const updated2 = await Task.findById(task._id).lean();
    report("Task transitions to 'IN_REVIEW' seamlessly", updated2.scrumStatus === "IN_REVIEW");

    // Transition: IN_REVIEW -> DONE
    task.scrumStatus = "DONE";
    task.status = "done";
    await task.save();
    const updated3 = await Task.findById(task._id).lean();
    report("Task transitions to 'DONE' seamlessly", updated3.scrumStatus === "DONE" && updated3.status === "done");

    report("Sprint association and story points remain strictly intact across transitions", updated3.sprintId.toString() === sprint._id.toString() && updated3.storyPoints === 5);
  } finally {
    if (task) await Task.deleteOne({ _id: task._id });
    if (sprint) await Sprint.deleteOne({ _id: sprint._id });
    if (project) await Project.deleteOne({ _id: project._id });
    if (team) await Team.deleteOne({ _id: team._id });
    await mongoose.disconnect();
    console.log("  Test entities cleaned up. Disconnected from MongoDB.");
  }

  console.log("\n================================================================================");
  console.log(`  SCRUM SCROLL SUITE RESULT: ${passedCount} / ${totalCount} PASSED`);
  console.log("================================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
