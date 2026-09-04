/**
 * testMemberPermissionsAndProfiles.js
 *
 * Automated test suite covering all 8 required verification scenarios for:
 * FIX 3: Member & Skill Permissions + Professional Team Member Information.
 *
 * Scenarios:
 * 1. User can verify/update own skill through quiz
 * 2. User cannot edit teammate verified skill (cross-user verify rejected with 403)
 * 3. Ordinary member cannot remove teammate (rejected with 403)
 * 4. Leader can remove authorized member (unassigns tasks)
 * 5. Unauthorized API requests are rejected (outsider 403, unauthenticated 401, owner removal 400)
 * 6. Member profile displays correct User data (email, roles, verified badges; no private leaks)
 * 7. No cross-user skill mutation (teammate ratings PATCH rejected with 403)
 * 8. Notification and audit behavior remain correct (Notification + TeamDeparture audit record)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import express from "express";
import http from "node:http";
import Notification from "../models/Notification.js";
import TeamDeparture from "../models/TeamDeparture.js";
import SkillVerification from "../models/SkillVerification.js";
import skillsRoutes from "../routes/skills.js";
import teamRoutes from "../routes/teams.js";
import { sign } from "../auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";

let server;
let BASE_URL;
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

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────
let leaderUser, memberUser, targetMemberUser, outsiderUser;
let leaderToken, memberToken, targetMemberToken, outsiderToken;
let testTeam, assignedTask;

async function setup() {
  console.log("Connecting to MongoDB:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected.\n");

  const app = express();
  app.use(express.json());
  app.use("/api", skillsRoutes);
  app.use("/api", teamRoutes);

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      BASE_URL = `http://localhost:${port}`;
      console.log(`Test Express server listening on ${BASE_URL}\n`);
      resolve();
    });
  });

  // Clean up any test fixtures from previous runs
  await User.deleteMany({ email: /fix3-test-.*@nexusflow\.local/ });
  await Team.deleteMany({ name: /^FIX3-TEST-/ });
  await Task.deleteMany({ title: /^FIX3-TEST-Task/ });
  await Notification.deleteMany({ "data.teamName": /^FIX3-TEST-/ });
  await TeamDeparture.deleteMany({ explanation: /FIX3-TEST-/ });
  await SkillVerification.deleteMany({ skill: /^FIX3-Skill-/ });

  // 1. Leader / Workspace Owner
  leaderUser = await User.create({
    name: "Fix3Leader",
    email: "fix3-test-leader@nexusflow.local",
    password: "Password123!",
    skills: ["Architecture", "JavaScript"],
  });
  leaderToken = sign({ id: leaderUser._id, email: leaderUser.email, name: leaderUser.name });

  // 2. Ordinary Team Member
  memberUser = await User.create({
    name: "Fix3Member",
    email: "fix3-test-member@nexusflow.local",
    password: "Password123!",
    skills: ["React"],
  });
  memberToken = sign({ id: memberUser._id, email: memberUser.email, name: memberUser.name });

  // 3. Target Team Member to be inspected and removed
  targetMemberUser = await User.create({
    name: "Fix3Target",
    email: "fix3-test-target@nexusflow.local",
    password: "Password123!",
    skills: ["Node.js"],
  });
  targetMemberToken = sign({ id: targetMemberUser._id, email: targetMemberUser.email, name: targetMemberUser.name });

  // 4. Outsider User (not in team)
  outsiderUser = await User.create({
    name: "Fix3Outsider",
    email: "fix3-test-outsider@nexusflow.local",
    password: "Password123!",
  });
  outsiderToken = sign({ id: outsiderUser._id, email: outsiderUser.email, name: outsiderUser.name });

  // Create workspace with leader, member, and target
  testTeam = await Team.create({
    name: "FIX3-TEST-Workspace",
    ownerId: leaderUser._id,
    members: [
      {
        userId: leaderUser._id,
        name: leaderUser.name,
        role: "leader",
        skills: { frontend: 8, backend: 8, devops: 7, design: 5, ml: 4, testing: 6 },
      },
      {
        userId: memberUser._id,
        name: memberUser.name,
        role: "member",
        skills: { frontend: 6, backend: 5, devops: 5, design: 4, ml: 4, testing: 5 },
      },
      {
        userId: targetMemberUser._id,
        name: targetMemberUser.name,
        role: "member",
        skills: { frontend: 4, backend: 7, devops: 6, design: 3, ml: 3, testing: 5 },
      },
    ],
  });

  // Create a task assigned to targetMemberUser
  assignedTask = await Task.create({
    teamId: testTeam._id,
    title: "FIX3-TEST-Task-TargetAssigned",
    description: "Task currently assigned to target teammate",
    assignedTo: targetMemberUser._id.toString(),
    status: "in_progress",
    urgency: 2,
    impact: 2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────
async function runTests() {
  try {
    await setup();

    console.log("===============================================================");
    console.log("TEST 1: User Can Verify and Update Own Skill Through Quiz");
    console.log("===============================================================");
    {
      const res = await fetch(`${BASE_URL}/api/skills/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          skill: "FIX3-Skill-TypeScript",
          score: 4,
          totalQuestions: 5,
          difficulty: "intermediate",
        }),
      });

      const data = await res.json();
      assert(res.status === 201, "POST /api/skills/verify returns 201 Created");
      assert(data.success === true, "Verification payload indicates success");
      assert(data.verification.verified === true, "Score 4/5 marked verified");
      assert(data.verification.percentage === 80, "Percentage calculated as 80%");

      // Verify User document updated
      const freshUser = await User.findById(memberUser._id);
      assert(
        freshUser.skills.includes("FIX3-Skill-TypeScript"),
        "User.skills contains newly verified skill"
      );
    }

    console.log("\n===============================================================");
    console.log("TEST 2: User Cannot Edit Teammate's Verified Skill (Cross-User Block)");
    console.log("===============================================================");
    {
      // memberUser attempts to forge a verified badge for targetMemberUser
      const res = await fetch(`${BASE_URL}/api/skills/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          userId: targetMemberUser._id.toString(), // cross-user target!
          skill: "FIX3-Skill-ForgedPython",
          score: 5,
          totalQuestions: 5,
          difficulty: "intermediate",
        }),
      });

      const data = await res.json();
      assert(res.status === 403, "Cross-user verification attempt rejected with 403 Forbidden");
      assert(
        data.error && data.error.includes("cannot submit skill verification for another user"),
        "Error message explains cross-user verification is forbidden"
      );

      // Verify targetMemberUser skills were NOT forged
      const freshTarget = await User.findById(targetMemberUser._id);
      assert(
        !freshTarget.skills.includes("FIX3-Skill-ForgedPython"),
        "Target user profile does NOT contain the forged skill"
      );

      const dbForgedVerify = await SkillVerification.findOne({
        userId: targetMemberUser._id,
        skill: "FIX3-Skill-ForgedPython",
      });
      assert(dbForgedVerify === null, "No forged SkillVerification document was created in DB");
    }

    console.log("\n===============================================================");
    console.log("TEST 3: Ordinary Member Cannot Remove Teammate (HTTP 403)");
    console.log("===============================================================");
    {
      // memberUser (ordinary member) attempts to remove targetMemberUser
      const res = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${targetMemberUser._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          reason: "Unauthorized removal attempt by ordinary member",
        }),
      });

      const data = await res.json();
      assert(res.status === 403, "Ordinary member removal attempt rejected with 403 Forbidden");
      assert(
        data.error && data.error.includes("Only authorized team leaders can remove members"),
        "Error message indicates leader authorization is required"
      );

      // Verify targetMemberUser is still in team
      const freshTeam = await Team.findById(testTeam._id);
      const isStillMember = freshTeam.members.some(
        (m) => m.userId.toString() === targetMemberUser._id.toString()
      );
      assert(isStillMember, "Target member remains in team");
    }

    console.log("\n===============================================================");
    console.log("TEST 4: Leader Can Remove Authorized Member (Unassigns Tasks)");
    console.log("===============================================================");
    {
      const removalReason = "Inactive on sprint tasks for 2 weeks";
      const res = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${targetMemberUser._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leaderToken}`,
        },
        body: JSON.stringify({
          reason: removalReason,
        }),
      });

      const data = await res.json();
      assert(res.status === 200, "Leader removal returns 200 OK");

      // Verify target is removed from team.members
      const freshTeam = await Team.findById(testTeam._id);
      const isMember = freshTeam.members.some(
        (m) => m.userId.toString() === targetMemberUser._id.toString()
      );
      assert(!isMember, "Target member has been removed from team.members");

      // Verify task assignment was cleared
      const freshTask = await Task.findById(assignedTask._id);
      assert(freshTask.assignedTo === null, "Task previously assigned to removed member is now unassigned (null)");
    }

    console.log("\n===============================================================");
    console.log("TEST 5: Unauthorized API Requests Are Rejected");
    console.log("===============================================================");
    {
      // A. Unauthenticated request
      const unauthRes = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${memberUser._id}/profile`);
      assert(unauthRes.status === 401, "Unauthenticated profile request rejected with 401 Unauthorized");

      // B. Outsider request to team profile
      const outsiderRes = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${memberUser._id}/profile`, {
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });
      assert(outsiderRes.status === 403, "Outsider profile request rejected with 403 Forbidden");

      // C. Attempting to remove team owner
      const removeOwnerRes = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${leaderUser._id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leaderToken}`,
        },
        body: JSON.stringify({ reason: "Cannot remove owner" }),
      });
      assert(removeOwnerRes.status === 400, "Attempting to remove workspace owner rejected with 400 Bad Request");
    }

    console.log("\n===============================================================");
    console.log("TEST 6: Member Profile Displays Correct User Data Without Leaks");
    console.log("===============================================================");
    {
      // First ensure leader has a verified skill in DB
      await SkillVerification.create({
        userId: leaderUser._id,
        skill: "FIX3-Skill-Architecture",
        score: 5,
        totalQuestions: 5,
        percentage: 100,
        verified: true,
      });

      const res = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${leaderUser._id}/profile`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      const data = await res.json();
      assert(res.status === 200, "GET /members/:userId/profile returns 200 OK");
      assert(data.userId === leaderUser._id.toString(), "Returns correct userId");
      assert(data.name === leaderUser.name, "Returns correct name");
      assert(data.email === leaderUser.email, "Returns correct email");
      assert(data.teamRole === "leader", "Returns team role 'leader'");
      assert(data.projectRole === "Team Leader", "Returns project role 'Team Leader'");
      assert(typeof data.skills === "object", "Returns workspace skills object");
      assert(Array.isArray(data.verifiedSkills), "Returns verifiedSkills array");
      assert(
        data.verifiedSkills.some((v) => v.skill === "FIX3-Skill-Architecture"),
        "Verified badges include 'FIX3-Skill-Architecture'"
      );

      // Privacy verification: no password or auth credentials leaked
      assert(data.password === undefined, "Password field is omitted");
      assert(data.tokens === undefined, "Tokens field is omitted");
      assert(data.googleId === undefined, "googleId is omitted");
    }

    console.log("\n===============================================================");
    console.log("TEST 7: No Cross-User Skill Mutation (Teammate Ratings Read-Only)");
    console.log("===============================================================");
    {
      // memberUser attempts to edit leaderUser's skill ratings
      const res = await fetch(`${BASE_URL}/api/teams/${testTeam._id}/members/${leaderUser._id}/skills`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          skills: { frontend: 1, backend: 1 },
        }),
      });

      const data = await res.json();
      assert(res.status === 403, "Cross-user skills rating PATCH rejected with 403 Forbidden");
      assert(
        data.error && data.error.includes("Teammate skills are read-only"),
        "Error message specifies teammate skills are read-only"
      );

      // Verify leader's ratings were not changed
      const freshTeam = await Team.findById(testTeam._id);
      const leaderMember = freshTeam.members.find(
        (m) => m.userId.toString() === leaderUser._id.toString()
      );
      assert(leaderMember.skills.frontend === 8, "Leader frontend skill remains 8 (unmutated)");
      assert(leaderMember.skills.backend === 8, "Leader backend skill remains 8 (unmutated)");
    }

    console.log("\n===============================================================");
    console.log("TEST 8: Notification & TeamDeparture Audit Behavior Remain Correct");
    console.log("===============================================================");
    {
      // Verify Notification was sent to removed user (from Test 4)
      const notif = await Notification.findOne({
        userId: targetMemberUser._id,
        type: "member_left",
      });
      assert(notif !== null, "Notification created for removed member");
      assert(
        notif.message && notif.message.includes("Inactive on sprint tasks for 2 weeks"),
        "Notification includes the captured removal reason"
      );

      // Verify TeamDeparture audit record was logged
      const departure = await TeamDeparture.findOne({
        userId: targetMemberUser._id,
        teamId: testTeam._id,
      });
      assert(departure !== null, "TeamDeparture audit record created in MongoDB");
      assert(
        departure.reason === "Inactive on sprint tasks for 2 weeks",
        "Audit record stores exact captured reason"
      );
      assert(
        departure.explanation && departure.explanation.includes("by leader"),
        "Audit explanation indicates removal was performed by leader"
      );
      assert(departure.timestamp instanceof Date, "Audit record has valid timestamp");
    }

    console.log("\n===============================================================");
    console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
    console.log("===============================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error("Test execution failed:", e);
    process.exit(1);
  } finally {
    // Cleanup fixtures
    await User.deleteMany({ email: /fix3-test-.*@nexusflow\.local/ });
    await Team.deleteMany({ name: /^FIX3-TEST-/ });
    await Task.deleteMany({ title: /^FIX3-TEST-Task/ });
    await Notification.deleteMany({ "data.teamName": /^FIX3-TEST-/ });
    await TeamDeparture.deleteMany({ explanation: /FIX3-TEST-/ });
    await SkillVerification.deleteMany({ skill: /^FIX3-Skill-/ });
    if (server) {
      await new Promise((res) => server.close(res));
    }
    await mongoose.disconnect();
  }
}

runTests();
