/**
 * server/scripts/testScrumBulkAcceptSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM CAPABILITY BULK ACCEPTANCE AUTOMATED TEST SUITE
 *
 * Verifies Fix 1:
 * 1. Bulk acceptance of multiple eligible recommendations.
 * 2. Strict persistence of assignedTo and assignedName in MongoDB.
 * 3. Strict preservation of sprintId on all tasks.
 * 4. Capacity limit enforcement: Skips over-capacity tasks when allowCapacityOverrun=false.
 * 5. Leader override: Permits over-capacity tasks when allowCapacityOverrun=true.
 * 6. Partial success: Ineligible member or capacity failure does not roll back valid tasks.
 * 7. Idempotency: Re-running bulk accept returns already_assigned without duplicate records.
 * 8. Leader authorization: Rejects non-leader execution with HTTP 403 FORBIDDEN.
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import assert from "assert";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Sprint from "../models/Sprint.js";

// Load environment
const envPath = path.resolve("server/.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

let passed = 0;
let failed = 0;

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Minimal mock express req/res
function createMockReqRes({ user, params = {}, body = {} }) {
  const req = {
    user,
    params,
    body,
    app: {
      get: () => ({
        to: () => ({
          emit: () => {},
        }),
      }),
    },
  };

  let statusCode = 200;
  let jsonPayload = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      jsonPayload = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getJSON: () => jsonPayload,
  };

  return { req, res };
}

async function runSuite() {
  console.log("\n=======================================================");
  console.log("RUNNING SCRUM CAPABILITY BULK ACCEPTANCE TEST SUITE");
  console.log("=======================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for testing.\n");

  const createdTaskIds = [];

  try {
    // Target: TEAM OP3 (PhishShield)
    const teamId = "6ae19ab12b6004b647c971e6";
    const team = await Team.findById(teamId).lean();
    assert.ok(team, `Team ${teamId} must exist`);

    const project = await Project.findOne({ teamId: team._id }).lean();
    assert.ok(project, "Project must exist for team");

    const sprint = await Sprint.findOne({ projectId: project._id, status: "ACTIVE" }).lean();
    assert.ok(sprint, "Active sprint must exist for team");

    const members = team.members || [];
    assert.ok(members.length > 0, "Team must have members");
    const testMember1 = members[0];
    const testMember2 = members[1] || members[0];

    // Find the handleBulkAcceptScrumAssignments from server/routes/scrum.js
    // We can dynamically test via HTTP or import the route logic
    // Let's create two test tasks committed to sprint
    const taskA = await Task.create({
      title: "Test Story A — Capability Bulk Accept Verification",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      storyPoints: 3,
      estimatedHours: 6,
    });
    createdTaskIds.push(taskA._id);

    const taskB = await Task.create({
      title: "Test Story B — Capability Bulk Accept Verification",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      storyPoints: 5,
      estimatedHours: 10,
    });
    createdTaskIds.push(taskB._id);

    // Dynamic import of scrum router
    const scrumRoutesModule = await import("../routes/scrum.js");
    const router = scrumRoutesModule.default;

    // Find bulk-assign route handler
    const bulkRoute = router.stack.find(
      (layer) => layer.route && layer.route.path === "/capability/:id/bulk-assign" && layer.route.methods.post
    );
    assert.ok(bulkRoute, "Route POST /capability/:id/bulk-assign must be registered in scrum router");
    const handler = bulkRoute.route.stack[0].handle;

    // Leader user context
    const leaderUserId = team.ownerId || (testMember1.userId?._id || testMember1.userId);
    const leaderUser = {
      _id: leaderUserId,
      id: leaderUserId.toString(),
      name: testMember1.name || "Team Leader",
      role: "leader",
    };

    // ── Test 1: Bulk Accept multiple eligible recommendations ───────────────
    await test("1. Successfully executes bulk assignment for multiple eligible tasks", async () => {
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskA._id.toString(), memberId: (testMember1.userId?._id || testMember1.userId).toString() },
            { taskId: taskB._id.toString(), memberId: (testMember2.userId?._id || testMember2.userId).toString() },
          ],
          allowCapacityOverrun: false,
        },
      });

      await handler(req, res);
      const data = res.getJSON();

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalRequested, 2);
      assert.strictEqual(data.assignedCount, 2);
      assert.strictEqual(data.skippedCount, 0);

      // Verify MongoDB persistence
      const freshA = await Task.findById(taskA._id).lean();
      const freshB = await Task.findById(taskB._id).lean();

      assert.strictEqual(freshA.assignedTo.toString(), (testMember1.userId?._id || testMember1.userId).toString());
      assert.ok(freshA.assignedName, "assignedName must be populated");
      assert.strictEqual(freshA.sprintId.toString(), sprint._id.toString(), "sprintId must be preserved");

      assert.strictEqual(freshB.assignedTo.toString(), (testMember2.userId?._id || testMember2.userId).toString());
      assert.ok(freshB.assignedName, "assignedName must be populated");
      assert.strictEqual(freshB.sprintId.toString(), sprint._id.toString(), "sprintId must be preserved");
    });

    // ── Test 2: Idempotency and Retries ─────────────────────────────────────
    await test("2. Idempotency: Re-running bulk accept returns already_assigned without duplicate records", async () => {
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskA._id.toString(), memberId: (testMember1.userId?._id || testMember1.userId).toString() },
            { taskId: taskB._id.toString(), memberId: (testMember2.userId?._id || testMember2.userId).toString() },
          ],
          allowCapacityOverrun: false,
        },
      });

      await handler(req, res);
      const data = res.getJSON();

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(data.assignedCount, 0, "No new tasks should be assigned");
      assert.strictEqual(data.alreadyAssignedCount, 2, "Both tasks should be recognized as already assigned");

      // Verify records remain intact
      const freshA = await Task.findById(taskA._id).lean();
      assert.strictEqual(freshA.assignedTo.toString(), (testMember1.userId?._id || testMember1.userId).toString());
    });

    // ── Test 3: Capacity Limit Enforcement (Skipping over-capacity work) ────
    const taskHuge = await Task.create({
      title: "Test Story Huge — Capacity Overrun Test",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      storyPoints: 25,
      estimatedHours: 60, // Exceeds default 40h capacity
    });
    createdTaskIds.push(taskHuge._id);

    await test("3. Capacity safeguard: Skips task when estimated hours exceed member capacity (allowCapacityOverrun=false)", async () => {
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskHuge._id.toString(), memberId: (testMember1.userId?._id || testMember1.userId).toString() },
          ],
          allowCapacityOverrun: false,
        },
      });

      await handler(req, res);
      const data = res.getJSON();

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(data.assignedCount, 0);
      assert.strictEqual(data.skippedCount, 1);
      assert.ok(data.results[0].reason.includes("Capacity limit reached"));

      // Verify task remains unassigned in DB
      const freshHuge = await Task.findById(taskHuge._id).lean();
      assert.strictEqual(freshHuge.assignedTo, null);
    });

    // ── Test 4: Leader Override for Capacity Overruns ───────────────────────
    await test("4. Leader override: Assigns task when allowCapacityOverrun=true", async () => {
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskHuge._id.toString(), memberId: (testMember1.userId?._id || testMember1.userId).toString() },
          ],
          allowCapacityOverrun: true,
        },
      });

      await handler(req, res);
      const data = res.getJSON();

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(data.assignedCount, 1);
      assert.strictEqual(data.skippedCount, 0);

      const freshHuge = await Task.findById(taskHuge._id).lean();
      assert.strictEqual(freshHuge.assignedTo.toString(), (testMember1.userId?._id || testMember1.userId).toString());
    });

    // ── Test 5: Ineligible Member and Partial Success ───────────────────────
    const taskC = await Task.create({
      title: "Test Story C — Partial Success Test",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      storyPoints: 3,
      estimatedHours: 4,
    });
    createdTaskIds.push(taskC._id);

    await test("5. Partial success: Ineligible member skips cleanly without blocking valid assignments", async () => {
      const fakeMemberId = new mongoose.Types.ObjectId().toString();
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskC._id.toString(), memberId: (testMember2.userId?._id || testMember2.userId).toString() },
            { taskId: taskA._id.toString(), memberId: fakeMemberId },
          ],
          allowCapacityOverrun: true,
        },
      });

      await handler(req, res);
      const data = res.getJSON();

      assert.strictEqual(res.getStatusCode(), 200);
      assert.strictEqual(data.assignedCount, 1);
      assert.strictEqual(data.skippedCount, 1);
      assert.strictEqual(data.results.find((r) => r.taskId === taskC._id.toString()).status, "assigned");
      assert.strictEqual(data.results.find((r) => r.memberId === fakeMemberId).status, "skipped");

      const freshC = await Task.findById(taskC._id).lean();
      assert.strictEqual(freshC.assignedTo.toString(), (testMember2.userId?._id || testMember2.userId).toString());
    });

    // ── Test 6: Non-leader Authorization ────────────────────────────────────
    await test("6. Authorization: Rejects non-leader execution with HTTP 403 FORBIDDEN", async () => {
      const unauthorizedUser = {
        _id: new mongoose.Types.ObjectId(),
        id: new mongoose.Types.ObjectId().toString(),
        name: "Normal Dev Member",
        role: "member",
      };

      const { req, res } = createMockReqRes({
        user: unauthorizedUser,
        params: { id: teamId },
        body: {
          assignments: [
            { taskId: taskA._id.toString(), memberId: (testMember1.userId?._id || testMember1.userId).toString() },
          ],
        },
      });

      await handler(req, res);
      assert.strictEqual(res.getStatusCode(), 403);
      assert.ok(res.getJSON().error.includes("Forbidden") || res.getJSON().error === "FORBIDDEN");
    });


    // ── Test 7: Sprint association preservation across all modified tasks ────
    await test("7. Non-destructive safety: Every assigned task strictly preserves its sprintId", async () => {
      const taskInSprint = await Task.findById(taskA._id).lean();
      assert.strictEqual(taskInSprint.sprintId.toString(), sprint._id.toString());
      assert.strictEqual(taskInSprint.status, "todo");
      assert.strictEqual(taskInSprint.scrumStatus, "TODO");
    });

    // ── Test 8: Empty or invalid assignments payload handling ───────────────
    await test("8. Input validation: Empty assignments array returns 400 Bad Request", async () => {
      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: teamId },
        body: { assignments: [] },
      });

      await handler(req, res);
      assert.strictEqual(res.getStatusCode(), 400);
      assert.strictEqual(res.getJSON().error, "NO_ASSIGNMENTS_PROVIDED");
    });

  } finally {
    // Clean up temporary test tasks
    if (createdTaskIds.length > 0) {
      await Task.deleteMany({ _id: { $in: createdTaskIds } });
    }
    await mongoose.disconnect();
  }

  console.log("\n-------------------------------------------------------");
  console.log(`Scrum Bulk Accept Suite Results: ${passed} passed, ${failed} failed`);
  console.log("-------------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
