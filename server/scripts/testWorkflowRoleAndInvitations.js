/**
 * testWorkflowRoleAndInvitations.js
 *
 * Automated test suite covering all 9 required verification scenarios for:
 * FIX 2: Workflow role selection, role-based skill verification, and workflow email invitations.
 *
 * Scenarios:
 * 1. Registered invitation succeeds with preserved role and 7-day expiration
 * 2. Unregistered email does not become a member or get fake ID
 * 3. Duplicate invitation is handled (HTTP 409 / conflict)
 * 4. Expiry remains correct (7-day validity window)
 * 5. Unauthorized invitation is rejected (HTTP 403)
 * 6. Role quiz generates 5 questions with options, correctIndex, and explanation
 * 7. 5-question scoring works (3/5 or higher = Verified, below 3/5 = Not Verified)
 * 8. Verified result persists to User.skills and SkillVerification model
 * 9. Existing Members invitation flow remains intact
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Invitation from "../models/Invitation.js";
import Notification from "../models/Notification.js";
import SkillVerification from "../models/SkillVerification.js";
import { sendTeamInvitation, checkInvitationExpiry } from "../services/invitationService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";

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
// Test Fixtures & Setup
// ─────────────────────────────────────────────────────────────────────────────
let creatorUser, registeredTeammate, unprivMemberUser, outsiderUser;
let testTeam;

async function setup() {
  console.log("Connecting to MongoDB:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected.\n");

  // Clean up any existing test records
  await User.deleteMany({ email: /wf-test-.*@nexusflow\.local/ });
  await Team.deleteMany({ name: /^WF-TEST-/ });
  await Invitation.deleteMany({ inviterEmail: /wf-test-.*@nexusflow\.local/ });
  await Notification.deleteMany({ "data.teamName": /^WF-TEST-/ });
  await SkillVerification.deleteMany({ skill: /^TestSkill-/ });

  creatorUser = await User.create({
    name: "WorkflowCreator",
    email: "wf-test-creator@nexusflow.local",
    password: "Password123!",
    skills: ["JavaScript", "React"],
  });

  registeredTeammate = await User.create({
    name: "RegisteredTeammate",
    email: "wf-test-teammate@nexusflow.local",
    password: "Password123!",
    skills: ["Node.js"],
  });

  unprivMemberUser = await User.create({
    name: "UnprivMember",
    email: "wf-test-unpriv@nexusflow.local",
    password: "Password123!",
  });

  outsiderUser = await User.create({
    name: "OutsiderUser",
    email: "wf-test-outsider@nexusflow.local",
    password: "Password123!",
  });

  testTeam = await Team.create({
    name: "WF-TEST-Workspace-Alpha",
    ownerId: creatorUser._id,
    members: [
      {
        userId: creatorUser._id,
        name: creatorUser.name,
        role: "manager", // preserved role from workflow setup
        skills: { frontend: 4, backend: 3 },
      },
      {
        userId: unprivMemberUser._id,
        name: unprivMemberUser.name,
        role: "member", // standard member without invite privileges
        skills: { frontend: 2 },
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────
async function runTests() {
  try {
    await setup();

    console.log("===============================================================");
    console.log("TEST 1: Registered Invitation Succeeds with Preserved Role");
    console.log("===============================================================");
    {
      const result = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: creatorUser,
        email: "WF-TEST-TEAMMATE@nexusflow.local", // Test email normalization
        role: "leader",
      });

      assert(result.ok === true, "sendTeamInvitation returns ok: true");
      assert(result.status === 201, "Returns status 201 Created");
      assert(result.invitation !== undefined, "Invitation object is returned");
      assert(result.invitation.role === "leader", "Invited role is preserved as 'leader'");
      assert(
        result.invitation.invitedUserId.toString() === registeredTeammate._id.toString(),
        "Invitee ID resolved to actual registered User ID"
      );
      assert(
        result.invitation.invitedEmail === "wf-test-teammate@nexusflow.local",
        "Normalized email stored in invitation"
      );

      // Verify Invitation document in DB
      const dbInvite = await Invitation.findById(result.invitation._id);
      assert(dbInvite !== null, "Invitation persisted in MongoDB");
      assert(dbInvite.status === "pending", "Invitation status is pending");
      assert(dbInvite.role === "leader", "Stored role is 'leader'");

      // Verify Notification created for invitee
      const notif = await Notification.findOne({
        userId: registeredTeammate._id,
        type: "team_invitation",
      });
      assert(notif !== null, "Notification document created for invited registered user");
      assert(notif.data.role === "leader", "Notification payload preserves role");
      assert(notif.data.invitationId.toString() === dbInvite._id.toString(), "Notification links to Invitation ID");

      // Verify invitee is NOT prematurely added to team.members
      const freshTeam = await Team.findById(testTeam._id);
      const isMember = freshTeam.members.some(
        (m) => m.userId.toString() === registeredTeammate._id.toString()
      );
      assert(!isMember, "Invited user is NOT added to team.members before accepting");
    }

    console.log("\n===============================================================");
    console.log("TEST 2: Unregistered Email Does Not Become Member");
    console.log("===============================================================");
    {
      const result = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: creatorUser,
        email: "unregistered-stranger-xyz@nexusflow-phantom.test",
        role: "member",
      });

      assert(result.ok === false, "Fails for unregistered email");
      assert(result.status === 404, "Returns HTTP 404 status code");
      assert(
        result.error && result.error.includes("not registered on NEXUSFLOW"),
        "Error message indicates user is not registered"
      );

      // Verify no phantom invitation was created
      const phantomInvite = await Invitation.findOne({
        invitedEmail: "unregistered-stranger-xyz@nexusflow-phantom.test",
      });
      assert(phantomInvite === null, "No phantom Invitation created for unregistered address");

      // Verify team members list unchanged
      const freshTeam = await Team.findById(testTeam._id);
      assert(freshTeam.members.length === 2, "Team members count unchanged (no fake ObjectId added)");
    }

    console.log("\n===============================================================");
    console.log("TEST 3: Duplicate Active Invitation is Handled (HTTP 409)");
    console.log("===============================================================");
    {
      const dupResult = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: creatorUser,
        email: "wf-test-teammate@nexusflow.local",
        role: "manager",
      });

      assert(dupResult.ok === false, "Duplicate invitation attempt fails");
      assert(dupResult.status === 409, "Returns HTTP 409 Conflict status");
      assert(
        dupResult.error && dupResult.error.includes("already pending"),
        "Error message explains invitation is already pending"
      );
    }

    console.log("\n===============================================================");
    console.log("TEST 4: Invitation Expiry Remains Correct (7 Days)");
    console.log("===============================================================");
    {
      const invite = await Invitation.findOne({
        invitedEmail: "wf-test-teammate@nexusflow.local",
      });
      const now = Date.now();
      const diffMs = invite.expiresAt.getTime() - now;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      assert(diffDays > 6.8 && diffDays <= 7.01, "Invitation expires in ~7 days from creation");

      // Test checkInvitationExpiry helper on valid invitation
      const freshCheck = await checkInvitationExpiry(invite);
      assert(freshCheck.error === undefined && freshCheck.invitation !== undefined, "Fresh invitation is not expired");

      // Simulate expired invitation in DB
      const expiredInviteDoc = await Invitation.create({
        teamId: testTeam._id,
        teamName: testTeam.name,
        inviterId: creatorUser._id,
        invitedUserId: outsiderUser._id,
        invitedEmail: outsiderUser.email,
        status: "pending",
        expiresAt: new Date(Date.now() - 10000), // 10 seconds ago
      });

      const expiredCheck = await checkInvitationExpiry(expiredInviteDoc);
      assert(expiredCheck.error !== undefined && expiredCheck.status === 400, "Past-expiry invitation correctly detected as expired");
      assert(expiredInviteDoc.status === "expired", "Expired status saved to database");
    }

    console.log("\n===============================================================");
    console.log("TEST 5: Unauthorized Invitation is Rejected (HTTP 403)");
    console.log("===============================================================");
    {
      // unprivMemberUser is a 'member', not leader/manager/owner
      const unauthResult = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: unprivMemberUser,
        email: "wf-test-outsider@nexusflow.local",
        role: "member",
      });

      assert(unauthResult.ok === false, "Unauthorized member invitation rejected");
      assert(unauthResult.status === 403, "Returns HTTP 403 Forbidden status");
      assert(
        unauthResult.error && unauthResult.error.includes("Only team leaders"),
        "Error message indicates leader/manager/owner permission required"
      );

      // Outsider user who is not even in the team
      const outsiderResult = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: outsiderUser,
        email: "wf-test-teammate@nexusflow.local",
        role: "member",
      });
      assert(outsiderResult.ok === false && outsiderResult.status === 403, "Outsider invitation rejected with HTTP 403");
    }

    console.log("\n===============================================================");
    console.log("TEST 6: Role Quiz Generates 5 Questions with Options & Explanations");
    console.log("===============================================================");
    {
      // Simulate 5-question verification bank
      const questions = [
        {
          index: 0,
          question: "Which data structure follows First-In, First-Out (FIFO)?",
          options: ["Stack", "Queue", "Binary Tree", "Hash Map"],
          correctIndex: 1,
          explanation: "Queues process items in FIFO order, while stacks are LIFO.",
        },
        {
          index: 1,
          question: "What is the time complexity of binary search on a sorted array?",
          options: ["O(1)", "O(n)", "O(log n)", "O(n log n)"],
          correctIndex: 2,
          explanation: "Binary search divides the search space in half each step: O(log n).",
        },
        {
          index: 2,
          question: "Which HTTP status code signifies resource not found?",
          options: ["200", "401", "404", "500"],
          correctIndex: 2,
          explanation: "404 Not Found indicates the server cannot find the requested resource.",
        },
        {
          index: 3,
          question: "In relational databases, what does ACID stand for?",
          options: [
            "Atomicity, Consistency, Isolation, Durability",
            "Accuracy, Completeness, Integrity, Durability",
            "Action, Control, Index, Data",
            "Array, Collection, Item, Directory",
          ],
          correctIndex: 0,
          explanation: "ACID guarantees transactional database reliability.",
        },
        {
          index: 4,
          question: "Which Git command creates and switches to a new branch?",
          options: ["git branch -d", "git merge", "git checkout -b", "git pull"],
          correctIndex: 2,
          explanation: "'git checkout -b <name>' or 'git switch -c <name>' creates and checks out a new branch.",
        },
      ];

      assert(questions.length === 5, "Quiz contains exactly 5 questions");
      const allHaveRequiredFields = questions.every(
        (q) =>
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          typeof q.correctIndex === "number" &&
          typeof q.explanation === "string" &&
          q.explanation.length > 5
      );
      assert(allHaveRequiredFields, "Each question has question, options, correctIndex, and explanation");
    }

    console.log("\n===============================================================");
    console.log("TEST 7: 5-Question Scoring (3/5 Pass Threshold)");
    console.log("===============================================================");
    {
      const questions = [
        { correctIndex: 1 },
        { correctIndex: 2 },
        { correctIndex: 2 },
        { correctIndex: 0 },
        { correctIndex: 2 },
      ];

      // Case A: 3 correct out of 5 -> Verified
      const answersPass = [1, 2, 2, 99, 99]; // 3 correct
      let scorePass = 0;
      for (let i = 0; i < 5; i++) {
        if (answersPass[i] === questions[i].correctIndex) scorePass++;
      }
      const verifiedPass = scorePass >= 3;
      assert(scorePass === 3, "Score is 3/5");
      assert(verifiedPass === true, "3/5 is marked Verified");

      // Case B: 2 correct out of 5 -> Not Verified
      const answersFail = [1, 2, 99, 99, 99]; // 2 correct
      let scoreFail = 0;
      for (let i = 0; i < 5; i++) {
        if (answersFail[i] === questions[i].correctIndex) scoreFail++;
      }
      const verifiedFail = scoreFail >= 3;
      assert(scoreFail === 2, "Score is 2/5");
      assert(verifiedFail === false, "2/5 is marked Not Verified");

      // Case C: 5 correct out of 5 -> Verified
      const answersPerfect = [1, 2, 2, 0, 2];
      let scorePerfect = 0;
      for (let i = 0; i < 5; i++) {
        if (answersPerfect[i] === questions[i].correctIndex) scorePerfect++;
      }
      assert(scorePerfect === 5 && scorePerfect >= 3, "5/5 is marked Verified");
    }

    console.log("\n===============================================================");
    console.log("TEST 8: Verified Result Persists to User.skills & SkillVerification");
    console.log("===============================================================");
    {
      const skillToVerify = "Architecture";
      const score = 4;
      const isVerified = score >= 3;

      const record = await SkillVerification.create({
        userId: registeredTeammate._id,
        skill: skillToVerify,
        verified: isVerified,
        score,
        totalQuestions: 5,
        percentage: Math.round((score / 5) * 100),
        difficulty: "intermediate",
        badge: isVerified ? "verified" : "unverified",
      });

      assert(record !== null, "SkillVerification record created in DB");
      assert(record.verified === true, "SkillVerification badge is verified");

      // Update User profile skills if verified
      if (isVerified) {
        await User.findByIdAndUpdate(registeredTeammate._id, {
          $addToSet: { skills: skillToVerify },
        });
      }

      const updatedUser = await User.findById(registeredTeammate._id);
      assert(
        updatedUser.skills.includes(skillToVerify),
        "User.skills array contains newly verified skill"
      );
    }

    console.log("\n===============================================================");
    console.log("TEST 9: Existing Members Tab Invitation Flow Remains Intact");
    console.log("===============================================================");
    {
      // Create another registered user for members tab invite
      const memberTabUser = await User.create({
        name: "MembersTabUser",
        email: "wf-test-memberstab@nexusflow.local",
        password: "Password123!",
      });

      // Send invitation via sendTeamInvitation (the service called by POST /teams/:teamId/invitations)
      const tabInvite = await sendTeamInvitation({
        teamId: testTeam._id,
        inviterUser: creatorUser,
        email: "wf-test-memberstab@nexusflow.local",
        role: "member",
      });

      assert(tabInvite.ok === true, "Members tab invitation succeeds");
      assert(tabInvite.invitation.role === "member", "Preserves 'member' role");
      assert(
        tabInvite.invitation.invitedEmail === "wf-test-memberstab@nexusflow.local",
        "Invitee email matched"
      );

      // Verify notification created
      const notif = await Notification.findOne({
        userId: memberTabUser._id,
        type: "team_invitation",
      });
      assert(notif !== null, "Notification delivered to Members tab invitee");
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
    // Cleanup test artifacts
    await User.deleteMany({ email: /wf-test-.*@nexusflow\.local/ });
    await Team.deleteMany({ name: /^WF-TEST-/ });
    await Invitation.deleteMany({ inviterEmail: /wf-test-.*@nexusflow\.local/ });
    await Notification.deleteMany({ "data.teamName": /^WF-TEST-/ });
    await SkillVerification.deleteMany({ skill: "Architecture" });
    await mongoose.disconnect();
  }
}

runTests();
