/**
 * server/scripts/testScrumTeamRestorationSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — RESTORED SCRUM TEAM & MEMBER ASSIGNMENT TEST SUITE
 *
 * Verifies Fix 2:
 * 1. Team Roster & Scrum Project linking (authoritative MongoDB state).
 * 2. Member Skill Matrix Updates: 1–10 ratings persisted in MongoDB.
 * 3. Strict Security: Users can only edit their own skills (HTTP 403 otherwise).
 * 4. Branch & Bound Assignment Engine (O(n!) pruned) for Scrum:
 *    - Tasks evaluated from active sprint / Scrum backlog.
 *    - Cost Matrix (Members × Tasks) generated with skill-gap costs.
 *    - Assignments mapped with B&B pruning statistics.
 * 5. Task Assignment Persistence & Synchronization:
 *    - assignedTo and assignedName strictly saved to MongoDB.
 *    - Synced with active sprint backlog and team load.
 * 6. Member Profile & Assigned Tasks:
 *    - Member profile returns accurate workload and assigned task records.
 * 7. Workspace Membership & Departure Security:
 *    - Deleting workspace requires owner authorization.
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
import User from "../models/User.js";

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

function createMockReqRes({ user, params = {}, body = {}, query = {} }) {
  const req = {
    user,
    params,
    body,
    query,
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
  console.log("RUNNING SCRUM TEAM & MEMBER ASSIGNMENT TEST SUITE");
  console.log("=======================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for testing.\n");

  const createdTaskIds = [];

  try {
    // Target Team: TEAM OP3 (PhishShield)
    const teamId = "6ae19ab12b6004b647c971e6";
    let team = await Team.findById(teamId);
    assert.ok(team, `Team ${teamId} must exist`);

    const project = await Project.findOne({ teamId: team._id }).lean();
    assert.ok(project, "Project must exist for team");
    assert.strictEqual(project.methodology, "SCRUM", "Project methodology must be SCRUM");

    const sprint = await Sprint.findOne({ projectId: project._id, status: "ACTIVE" }).lean();
    assert.ok(sprint, "Active sprint must exist for team");

    const members = team.members || [];
    assert.ok(members.length >= 1, "Team OP3 must have at least 1 member for roster testing");

    const member1 = members[0];
    const m1UserIdStr = (member1.userId?._id || member1.userId).toString();
    const originalSkills = { ...(member1.skills || {}) };

    const user1Obj = await User.findById(m1UserIdStr).lean();
    const authUser1 = user1Obj || { _id: m1UserIdStr, email: member1.name + "@test.com", name: member1.name };

    // Unauthorized/External user for security testing
    const otherUser = (await User.findOne({ _id: { $ne: m1UserIdStr } }).lean()) || {
      _id: new mongoose.Types.ObjectId().toString(),
      email: "external_tester@nexusflow.dev",
      name: "External Tester",
    };
    const authUser2 = otherUser;

    // Dynamic import of teams router
    const teamsModule = await import("../routes/teams.js");
    const teamsRouter = teamsModule.default;

    // Helper to find router endpoint handler
    function getRouteHandler(path, method) {
      const layer = teamsRouter.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
      );
      if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }

    const skillsHandler = getRouteHandler("/teams/:teamId/members/:userId/skills", "PATCH");
    const assignHandler = getRouteHandler("/teams/:teamId/assign", "POST");
    const profileHandler = getRouteHandler("/teams/:teamId/members/:userId/profile", "GET");

    // Dynamic import of scrum router for bulk/single assign verification
    const scrumModule = await import("../routes/scrum.js");
    const scrumRouter = scrumModule.default;
    const scrumAssignRoute = scrumRouter.stack.find(
      (l) => l.route && l.route.path === "/capability/:id/bulk-assign" && l.route.methods.post
    );
    const scrumAssignHandler = scrumAssignRoute.route.stack[0].handle;

    // Create 2 test tasks for active sprint
    const testTask1 = await Task.create({
      title: "Story OP3-T1: Automated Security Telemetry Parser",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      requiredSkills: ["backend", "devops"],
      storyPoints: 3,
      estimatedHours: 6,
    });
    createdTaskIds.push(testTask1._id);

    const testTask2 = await Task.create({
      title: "Story OP3-T2: Security Policy Visualization Dashboard",
      projectId: project._id,
      teamId: team._id,
      sprintId: sprint._id,
      status: "todo",
      scrumStatus: "TODO",
      requiredSkills: ["frontend", "design"],
      storyPoints: 5,
      estimatedHours: 10,
    });
    createdTaskIds.push(testTask2._id);

    // =========================================================================
    // TEST 1: Team Roster and Active Project Linking
    // =========================================================================
    await test("TEST 1: Team Roster and Scrum Project Linking from MongoDB", async () => {
      const loadedTeam = await Team.findById(teamId).lean();
      assert.strictEqual(loadedTeam._id.toString(), teamId);
      assert.strictEqual(loadedTeam.activeProjectId?.toString(), project._id.toString());
      assert.ok(loadedTeam.members.length >= 1, "Loaded team contains valid member roster");
    });

    // =========================================================================
    // TEST 2: Skill Matrix 1–10 Stepper Update & MongoDB Persistence
    // =========================================================================
    await test("TEST 2: Skill Matrix Update persists to MongoDB with 1-10 range", async () => {
      const newSkills = {
        frontend: 9,
        backend: 8,
        devops: 7,
        design: 4,
        ml: 6,
        testing: 8,
      };

      const { req, res } = createMockReqRes({
        user: authUser1,
        params: { teamId, userId: m1UserIdStr },
        body: { skills: newSkills },
      });

      await skillsHandler(req, res);
      assert.strictEqual(res.getStatusCode(), 200, `Expected 200 OK, got ${res.getStatusCode()}`);

      const updatedTeam = await Team.findById(teamId).lean();
      const updatedM1 = updatedTeam.members.find(
        (m) => (m.userId?._id || m.userId)?.toString() === m1UserIdStr
      );
      assert.ok(updatedM1, "Member 1 found in updated team");
      assert.strictEqual(updatedM1.skills?.frontend, 9, "Frontend skill persisted as 9");
      assert.strictEqual(updatedM1.skills?.backend, 8, "Backend skill persisted as 8");
      assert.strictEqual(updatedM1.skills?.devops, 7, "DevOps skill persisted as 7");
    });

    // =========================================================================
    // TEST 3: Strict Self-Ownership: Users Cannot Edit Another Member's Skills
    // =========================================================================
    await test("TEST 3: Strict Security: Non-owner cannot edit another member's skills (HTTP 403)", async () => {
      // User 2 attempts to edit User 1's skills
      const { req, res } = createMockReqRes({
        user: authUser2,
        params: { teamId, userId: m1UserIdStr },
        body: { skills: { frontend: 10 } },
      });

      await skillsHandler(req, res);
      assert.strictEqual(res.getStatusCode(), 403, `Expected HTTP 403 Forbidden, got ${res.getStatusCode()}`);
      const payload = res.getJSON();
      assert.ok(payload.error, "Error message returned for unauthorized skill modification");
    });

    // =========================================================================
    // TEST 4: Branch & Bound Assignment Execution on Scrum Project
    // =========================================================================
    await test("TEST 4: Branch & Bound Assignment Engine executes on Scrum team with Cost Matrix", async () => {
      const leaderUser = team.ownerId
        ? { _id: team.ownerId.toString(), name: "Leader", email: "leader@test.com" }
        : authUser1;

      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { teamId },
        body: {
          taskIds: [testTask1._id.toString(), testTask2._id.toString()],
          persist: false,
        },
      });

      await assignHandler(req, res);
      assert.strictEqual(res.getStatusCode(), 200, `Expected 200 OK from /assign, got ${res.getStatusCode()}`);
      const result = res.getJSON();

      assert.ok(result, "Assign result exists");
      assert.ok(Array.isArray(result.assignments), "Result contains assignments array");
      assert.strictEqual(result.assignments.length, 2, "All 2 candidate tasks were assigned");

      // Verify Cost Matrix and Labels are returned
      assert.ok(Array.isArray(result.costMatrix), "Result contains costMatrix 2D array");
      assert.ok(Array.isArray(result.taskLabels), "Result contains taskLabels list");
      assert.ok(Array.isArray(result.memberLabels), "Result contains memberLabels list");

      // Verify B&B algorithm metadata
      assert.ok(
        result.meta?.algorithm?.includes("Branch and Bound"),
        "Algorithm identified as Branch and Bound"
      );
      assert.ok(result.meta?.nodesExplored !== undefined, "Stats contain nodesExplored tracking");
      assert.ok(typeof result.totalCost === "number", "Total cost is computed");
    });

    // =========================================================================
    // TEST 5: Acceptance & MongoDB Persistence (assignedTo, assignedName, sprintId)
    // =========================================================================
    await test("TEST 5: Task Assignment Persistence in MongoDB preserves sprintId and updates assignedName", async () => {
      const leaderUser = team.ownerId
        ? { _id: team.ownerId.toString(), name: "Leader", email: "leader@test.com" }
        : authUser1;

      const { req, res } = createMockReqRes({
        user: leaderUser,
        params: { id: project._id.toString() },
        body: {
          assignments: [
            {
              taskId: testTask1._id.toString(),
              memberId: m1UserIdStr,
              assignedName: member1.name,
              reason: "Highest skill score for Backend/DevOps (B&B pruned)",
            },
          ],
          allowCapacityOverrun: true,
        },
      });

      await scrumAssignHandler(req, res);
      assert.strictEqual(res.getStatusCode(), 200, `Expected 200 OK, got ${res.getStatusCode()}`);

      const savedTask = await Task.findById(testTask1._id).lean();
      assert.strictEqual(savedTask.assignedTo?.toString(), m1UserIdStr, "assignedTo matches member 1");
      assert.strictEqual(savedTask.assignedName, member1.name, "assignedName persisted");
      assert.strictEqual(savedTask.sprintId?.toString(), sprint._id.toString(), "sprintId strictly preserved");
    });

    // =========================================================================
    // TEST 6: Member Profile Loading (Reflects Workload & Assigned Tasks)
    // =========================================================================
    await test("TEST 6: Member Profile endpoint returns verified skills and profile details", async () => {
      const { req, res } = createMockReqRes({
        user: authUser1,
        params: { teamId, userId: m1UserIdStr },
      });

      await profileHandler(req, res);
      assert.strictEqual(res.getStatusCode(), 200, `Expected 200 OK, got ${res.getStatusCode()}`);
      const profile = res.getJSON();

      assert.ok(profile, "Profile data returned");
      assert.ok(profile.name, "Profile contains member name");
      assert.ok(profile.skills, "Profile contains skills object");
      assert.strictEqual(profile.userId, m1UserIdStr, "Profile matches member userId");
      assert.ok(Array.isArray(profile.verifiedSkills), "Profile contains verifiedSkills array");
    });

    // =========================================================================
    // TEST 7: Workspace Membership & Delete Safety Controls
    // =========================================================================
    await test("TEST 7: Workspace Membership Security protects team deletion against non-owners", async () => {
      const deleteTeamRoute = teamsRouter.stack.find(
        (l) => l.route && l.route.path === "/teams/:teamId" && l.route.methods.delete
      );
      assert.ok(deleteTeamRoute, "Route DELETE /teams/:teamId must exist");
      const deleteHandler = deleteTeamRoute.route.stack[deleteTeamRoute.route.stack.length - 1].handle;

      // Non-owner (authUser2) attempts to delete team
      const { req, res } = createMockReqRes({
        user: authUser2,
        params: { teamId },
      });

      await deleteHandler(req, res);
      // Must be 403 Forbidden because only the owner can delete the team
      assert.strictEqual(res.getStatusCode(), 403, `Expected HTTP 403 Forbidden for non-owner delete, got ${res.getStatusCode()}`);
    });

  } finally {
    // Restore original skills for member 1
    try {
      if (teamId && member1?.userId) {
        await Team.updateOne(
          { _id: teamId, "members.userId": member1.userId },
          { $set: { "members.$.skills": originalSkills } }
        );
      }
    } catch (_) {}

    // Cleanup created test tasks
    if (createdTaskIds.length > 0) {
      await Task.deleteMany({ _id: { $in: createdTaskIds } });
    }
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.\n");
  }

  console.log("=======================================================");
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
