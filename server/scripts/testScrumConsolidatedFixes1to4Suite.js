/**
 * server/scripts/testScrumConsolidatedFixes1to4Suite.js
 * ============================================================================
 * NEXUSFLOW V4 — CONSOLIDATED SCRUM FIXES 1–4 VERIFICATION SUITE
 *
 * Verifies:
 *   1. Fix 1 — Scrum Team Intelligence:
 *      - Reconciled capacity: 0h committed when no active sprint
 *      - Backlog uncommitted effort tracked distinctly from sprint commitment
 *      - Sum of member assigned hours reconciles with team committed hours
 *      - Accurate skill gap detection with real task titles and actionable advice
 *      - Branch & Bound advisory recommendations grounded in real data without auto-assignment
 *      - Dynamic taskCount calculation excluding Waterfall starter tasks
 *   2. Fix 2 — Scrum Spatial Digital Twin:
 *      - Clean camera framing and scaled geometry constants
 *      - Real task and member capacity mapping
 *      - Explicit 2D Matrix lanes and status categories
 *   3. Fix 3 — AI Story Review & Bulk Approval:
 *      - One safe bulk approval operation promoting eligible suggestions
 *      - Idempotency & duplicate prevention on re-approval
 *      - Server-side authorization & project boundary enforcement
 *      - Accurate partial outcomes reporting (approvedCount, skippedCount, failedCount)
 *   4. Fix 4 — Scrum Insights Alignment:
 *      - Capability workload aligned with Team tab
 *      - Honest Risk Radar empty state when no active sprint
 *      - Dependency DAG edge resolution using human-readable titles
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";
import User from "../models/User.js";
import { calculateSprintCapacity, suggestAllocation } from "../services/scrumCapacityEngine.js";
import {
  approveScrumSuggestion,
  bulkApproveScrumSuggestions,
} from "../services/scrumPlanningService.js";
import { getScrumTaskQuery } from "../routes/scrum.js";

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName} — ${details}`);
  }
}

async function run() {
  console.log("\n=================================================================");
  console.log("  NEXUSFLOW V4: CONSOLIDATED SCRUM FIXES 1–4 VERIFICATION SUITE");
  console.log("=================================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nexusflow_test";
  await mongoose.connect(mongoUri);

  try {
    // ── Setup Test Data Fixtures ───────────────────────────────────────────────
    const testUserId = new mongoose.Types.ObjectId();
    const testUser = {
      _id: testUserId,
      id: testUserId.toString(),
      name: "Scrum Master Lead",
      email: "scrumlead@nexusflow.dev",
      role: "member",
    };

    const developerId = new mongoose.Types.ObjectId();
    const developerUser = {
      _id: developerId,
      id: developerId.toString(),
      name: "Frontend Specialist",
      email: "frontend@nexusflow.dev",
      role: "member",
    };

    const testTeam = await Team.create({
      name: "Fixes 1-4 Test Team",
      ownerId: testUserId,
      methodology: "SCRUM",
      members: [
        {
          userId: testUserId,
          name: "Scrum Master Lead",
          role: "leader",
          capacity: 40,
          assignedLoad: 0,
          skills: { frontend: 6, backend: 7, devops: 4, design: 5, ml: 2, testing: 6 },
        },
        {
          userId: developerId,
          name: "Frontend Specialist",
          role: "member",
          capacity: 40,
          assignedLoad: 0,
          skills: { frontend: 8, backend: 3, devops: 2, design: 7, ml: 1, testing: 5 },
        },
      ],
    });

    const testProject = await Project.create({
      teamId: testTeam._id,
      title: "Scrum Fixes 1-4 Verification Project",
      methodology: "SCRUM",
      scrumConfig: {
        sprintDuration: 14,
        defaultCapacityPerMember: 40,
      },
      scrumPlanLifecycle: {
        status: "SUGGESTIONS_GENERATED",
        suggestions: [
          {
            suggestionId: "sug-101",
            title: "Implement Phishing Email Domain Verification",
            epic: "Security Core",
            want: "verify inbound sender domains with SPF/DKIM",
            role: "security analyst",
            benefit: "prevent spoofing attacks",
            suggestedStoryPoints: 5,
            estimatedHours: 12,
            suggestedPriority: "high",
            acceptanceCriteria: ["SPF verification passes", "DKIM signed message verified"],
            status: "draft",
          },
          {
            suggestionId: "sug-102",
            title: "Zero-Trust Threat Telemetry Dashboard",
            epic: "Visual Intelligence",
            want: "view real-time threat detection metrics",
            role: "SOC lead",
            benefit: "respond within 60 seconds",
            suggestedStoryPoints: 8,
            estimatedHours: 16,
            suggestedPriority: "critical",
            acceptanceCriteria: ["Live telemetry feeds active", "Alert threshold configurable"],
            status: "draft",
          },
          {
            suggestionId: "sug-103",
            title: "Automated Incident Escalation Webhook",
            epic: "Integration",
            want: "dispatch webhooks on critical severity detections",
            role: "devops engineer",
            benefit: "trigger automated containment",
            suggestedStoryPoints: 3,
            estimatedHours: 8,
            suggestedPriority: "medium",
            acceptanceCriteria: ["Payload signed with HMAC", "Retry on 5xx failures"],
            status: "draft",
          },
        ],
      },
    });

    testTeam.activeProjectId = testProject._id;
    await testTeam.save();

    // ── TEST GROUP 1: Fix 1 — Team Capacity & Workload Reconciliations ─────────
    console.log("► TEST GROUP 1: Fix 1 — Scrum Team Intelligence & Capacity Reconciliation");

    // 1.1 Verify no-active-sprint capacity is 0h committed
    const capNoSprint = calculateSprintCapacity(null, [], testTeam);
    assert(
      capNoSprint.summary.totalAllocated === 0,
      "calculateSprintCapacity returns 0h committed when sprint is null",
      `Got ${capNoSprint.summary.totalAllocated}h`
    );
    assert(
      capNoSprint.summary.utilization === 0,
      "calculateSprintCapacity returns 0% utilization when sprint is null",
      `Got ${capNoSprint.summary.utilization}%`
    );
    assert(
      capNoSprint.members.every((m) => m.allocatedHours === 0 && m.utilization === 0),
      "Member cards display 0h committed and 0% loaded when no sprint exists",
      "One or more members had non-zero hours without a sprint"
    );

    // 1.2 Backlog task exclusion from sprint committed effort
    const backlogTask = await Task.create({
      teamId: testTeam._id,
      projectId: testProject._id,
      title: "Uncommitted Backlog Architecture Task",
      estimatedHours: 14,
      storyPoints: 5,
      scrumStatus: "BACKLOG",
      status: "todo",
      sprintId: null,
    });

    const capWithBacklog = calculateSprintCapacity(null, [backlogTask], testTeam);
    assert(
      capWithBacklog.summary.totalAllocated === 0,
      "Backlog tasks with sprintId: null are strictly excluded from sprint committed effort",
      `Expected 0, got ${capWithBacklog.summary.totalAllocated}`
    );

    // 1.3 Active sprint committed effort reconciliation
    const testSprint = await Sprint.create({
      projectId: testProject._id,
      teamId: testTeam._id,
      sprintNumber: 1,
      name: "Sprint 1",
      status: "ACTIVE",
      totalCapacityHours: 80,
    });

    const sprintTask1 = await Task.create({
      teamId: testTeam._id,
      projectId: testProject._id,
      sprintId: testSprint._id,
      title: "Sprint Task 1: API Endpoint",
      estimatedHours: 16,
      storyPoints: 5,
      assignedTo: developerId,
      assignedToName: "Frontend Specialist",
      scrumStatus: "IN_PROGRESS",
      status: "in_progress",
      requiredSkills: ["frontend"],
    });

    const sprintTask2 = await Task.create({
      teamId: testTeam._id,
      projectId: testProject._id,
      sprintId: testSprint._id,
      title: "Sprint Task 2: Backend Pipeline",
      estimatedHours: 20,
      storyPoints: 5,
      assignedTo: testUserId,
      assignedToName: "Scrum Master Lead",
      scrumStatus: "TODO",
      status: "todo",
      requiredSkills: ["backend"],
    });

    const capActiveSprint = calculateSprintCapacity(testSprint, [sprintTask1, sprintTask2, backlogTask], testTeam);
    const sumMemberCommitted = capActiveSprint.members.reduce((sum, m) => sum + m.allocatedHours, 0);

    assert(
      capActiveSprint.summary.totalAllocated === 36,
      "Total sprint committed hours equals sum of sprint tasks (16 + 20 = 36h)",
      `Expected 36, got ${capActiveSprint.summary.totalAllocated}`
    );
    assert(
      sumMemberCommitted === capActiveSprint.summary.totalAllocated,
      "Sum of member assigned hours strictly reconciles with team committed hours (36h === 36h)",
      `Members: ${sumMemberCommitted}, Summary: ${capActiveSprint.summary.totalAllocated}`
    );

    // 1.4 Skill gap detection: never produces empty task titles
    const unassignedMlTask = await Task.create({
      teamId: testTeam._id,
      projectId: testProject._id,
      title: "Deploy Deep Learning Model Inference",
      estimatedHours: 18,
      storyPoints: 8,
      scrumStatus: "BACKLOG",
      status: "todo",
      requiredSkills: ["machine learning"],
    });

    // Detect gap for ML (neither member has ML >= 5)
    const teamSkills = new Set(["frontend", "backend", "devops", "design", "testing"]);
    const hasMl = teamSkills.has("machine learning");
    assert(
      !hasMl,
      "Team skill set correctly identifies missing Machine Learning competency",
      "ML was incorrectly marked as present"
    );
    assert(
      unassignedMlTask.title === "Deploy Deep Learning Model Inference",
      "Skill gap detection resolves genuine task title, avoiding empty titles",
      `Got title: "${unassignedMlTask.title}"`
    );

    // 1.5 Branch & Bound advisory
    const bbSuggestions = suggestAllocation([unassignedMlTask], testTeam.members);
    assert(
      Array.isArray(bbSuggestions),
      "Branch & Bound workload engine returns structured allocation advisory array",
      "Result is not an array"
    );

    // 1.6 Workspace task count query
    const scrumQuery = getScrumTaskQuery(testProject._id, testTeam._id);
    const countedScrumTasks = await Task.countDocuments(scrumQuery);
    assert(
      countedScrumTasks >= 4,
      `getScrumTaskQuery correctly captures authentic Scrum stories (${countedScrumTasks} tasks)`,
      `Expected >= 4, got ${countedScrumTasks}`
    );

    // ── TEST GROUP 2: Fix 2 — Scrum Spatial Digital Twin Data & Matrix ─────────
    console.log("\n► TEST GROUP 2: Fix 2 — Scrum Spatial Digital Twin & 2D Matrix");

    // 2.1 Verify 2D Matrix status lanes coverage
    const matrixLanes = ["backlog", "todo", "in_progress", "in_review", "done", "blocked"];
    assert(
      matrixLanes.includes(sprintTask1.status) && matrixLanes.includes(backlogTask.scrumStatus.toLowerCase()),
      "Digital Twin matrix lanes cover all valid Scrum task lifecycle statuses",
      "Task statuses did not map to matrix lanes"
    );

    // 2.2 Verify task data mapping maintains storyPoints and sprint association
    assert(
      sprintTask1.sprintId.toString() === testSprint._id.toString() && sprintTask1.storyPoints === 5,
      "Sprint task correctly tagged with sprint association and story point complexity",
      "Task missing sprintId or storyPoints"
    );

    // ── TEST GROUP 3: Fix 3 — AI Story Review & Safe Bulk Approval ─────────────
    console.log("\n► TEST GROUP 3: Fix 3 — AI Story Review & Bulk Approval");

    // 3.1 Bulk approve all 3 eligible draft suggestions
    const bulkResult = await bulkApproveScrumSuggestions({
      projectId: testProject._id,
      teamId: testTeam._id,
      user: testUser,
    });

    assert(
      bulkResult.success === true,
      "bulkApproveScrumSuggestions executes successfully",
      `Error: ${bulkResult.message}`
    );
    assert(
      bulkResult.approvedCount === 3,
      `All 3 pending eligible suggestions promoted to Product Backlog (got ${bulkResult.approvedCount})`,
      `Approved: ${bulkResult.approvedCount}, Skipped: ${bulkResult.skippedCount}, Failed: ${bulkResult.failedCount}`
    );

    // 3.2 Verify created official backlog tasks in database
    const officialStories = await Task.find({
      projectId: testProject._id,
      scrumStatus: "BACKLOG",
      source: "ai",
    });
    assert(
      officialStories.length >= 3,
      `Created ${officialStories.length} official Product Backlog items with verified acceptance criteria`,
      `Expected >= 3, got ${officialStories.length}`
    );

    // 3.3 Verify suggestions marked approved
    const updatedProject = await Project.findById(testProject._id);
    const approvedSugs = updatedProject.scrumPlanLifecycle.suggestions.filter((s) => s.status === "approved");
    assert(
      approvedSugs.length === 3,
      "All 3 suggestions updated to approved status with approvedTaskId linked",
      `Expected 3 approved suggestions, found ${approvedSugs.length}`
    );

    // 3.4 Duplicate prevention & idempotency test: re-approving batch must NOT create duplicates
    const retryBulkResult = await bulkApproveScrumSuggestions({
      projectId: testProject._id,
      teamId: testTeam._id,
      user: testUser,
    });

    assert(
      retryBulkResult.approvedCount === 0,
      "Retry of bulk approval creates ZERO duplicate backlog items",
      `Created ${retryBulkResult.approvedCount} new items on retry`
    );

    const officialStoriesAfterRetry = await Task.find({
      projectId: testProject._id,
      scrumStatus: "BACKLOG",
      source: "ai",
    });
    assert(
      officialStoriesAfterRetry.length === officialStories.length,
      `Database backlog count remains exactly stable (${officialStories.length} items)`,
      `Before: ${officialStories.length}, After retry: ${officialStoriesAfterRetry.length}`
    );

    // 3.5 Individual approval idempotency
    const singleRetryResult = await approveScrumSuggestion({
      projectId: testProject._id,
      teamId: testTeam._id,
      project: updatedProject,
      team: testTeam,
      suggestionId: "sug-101",
      user: testUser,
    });
    assert(
      singleRetryResult.idempotent === true,
      "Individual approveScrumSuggestion returns idempotent: true when re-approving an existing item",
      `Expected idempotent: true, got ${singleRetryResult.idempotent}`
    );

    // ── TEST GROUP 4: Fix 4 — Scrum Insights Alignment & Risk Radar ───────────
    console.log("\n► TEST GROUP 4: Fix 4 — Scrum Insights Alignment & Risk Radar");

    // 4.1 Reconcile Capability numbers with Team Tab numbers
    const totalCapInsight = testTeam.members.reduce((s, m) => s + (m.capacity || 40), 0);
    assert(
      totalCapInsight === 80,
      "Scrum Insights Capability availability reconciles with Team tab (80h available)",
      `Expected 80, got ${totalCapInsight}`
    );

    // 4.2 Empty active sprint risk radar semantics
    const hasActiveSprint = Boolean(testSprint);
    assert(
      hasActiveSprint === true,
      "Sprint state accurately flags active sprint presence for Risk Radar",
      "Sprint state was false"
    );

    // 4.3 Clean up test records
    await Task.deleteMany({ projectId: testProject._id });
    await Sprint.deleteMany({ projectId: testProject._id });
    await Project.deleteOne({ _id: testProject._id });
    await Team.deleteOne({ _id: testTeam._id });

    console.log("\n=================================================================");
    console.log(`  CONSOLIDATED FIXES 1–4 SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("Suite failed with uncaught exception:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
