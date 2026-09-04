/**
 * testTeamDiscoveryAndApplications.js
 *
 * Automated test suite covering all requirements for:
 * FIX 4: Open Team Discovery & Professional Skill-Based Team Applications.
 *
 * Scenarios:
 * 1. Only discoverable teams appear in /api/discovery/teams
 * 2. Private teams are hidden from discovery
 * 3. Public discovery never leaks private member data, chats, or passwords
 * 4. Applicant cannot directly join (discoverability != membership)
 * 5. Role quiz works and verifies required skills (3/5 threshold)
 * 6. Candidate submits professional role application (status: SUBMITTED, skill match computed)
 * 7. Duplicate active application for same user/role is blocked (HTTP 409)
 * 8. Leader-only acceptance/rejection enforced server-side (HTTP 403 for ordinary members)
 * 9. Accepted application creates actual User membership with registered User ID
 * 10. Rejected application does not create membership and captures reason
 * 11. Candidate can withdraw an active application (status: WITHDRAWN)
 * 12. Notifications and TeamApplicationAudit records are properly created
 * 13. Existing direct invitation path continues to work (coexistence)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import express from "express";
import http from "node:http";

import User from "../models/User.js";
import Team from "../models/Team.js";
import Notification from "../models/Notification.js";
import SkillVerification from "../models/SkillVerification.js";
import TeamApplication from "../models/TeamApplication.js";
import TeamApplicationAudit from "../models/TeamApplicationAudit.js";
import Invitation from "../models/Invitation.js";

import skillsRoutes from "../routes/skills.js";
import teamRoutes from "../routes/teams.js";
import discoveryRoutes from "../routes/discovery.js";
import { sendTeamInvitation } from "../services/invitationService.js";
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
let leaderUser, candidateUser, ordinaryUser, rejectedCandidateUser, withdrawCandidateUser;
let leaderToken, candidateToken, ordinaryToken, rejectedCandidateToken, withdrawCandidateToken;
let publicTeam, privateTeam, openRoleId1, openRoleId2;

async function setup() {
  console.log("Connecting to MongoDB:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected.\n");

  const app = express();
  app.use(express.json());
  app.use("/api", skillsRoutes);
  app.use("/api", teamRoutes);
  app.use("/api", discoveryRoutes);

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
  await User.deleteMany({ email: /fix4-test-.*@nexusflow\.local/ });
  await Team.deleteMany({ name: /^FIX4-TEST-/ });
  await Notification.deleteMany({ "data.teamName": /^FIX4-TEST-/ });
  await SkillVerification.deleteMany({ skill: /^FIX4-Skill-/ });
  await TeamApplication.deleteMany({ teamName: /^FIX4-TEST-/ });
  await TeamApplicationAudit.deleteMany({ "metadata.roleName": /^FIX4-Role-/ });
  await Invitation.deleteMany({ teamName: /^FIX4-TEST-/ });

  // 1. Leader / Team Owner
  leaderUser = await User.create({
    name: "FIX4 Leader",
    email: "fix4-test-leader@nexusflow.local",
    password: "Password123!",
  });
  leaderToken = sign(leaderUser);

  // 2. Candidate User 1 (Applies and gets accepted)
  candidateUser = await User.create({
    name: "FIX4 Candidate A",
    email: "fix4-test-cand-a@nexusflow.local",
    password: "Password123!",
    skills: ["frontend"],
  });
  candidateToken = sign(candidateUser);

  // 3. Ordinary Member User (Non-leader on the team)
  ordinaryUser = await User.create({
    name: "FIX4 Ordinary Member",
    email: "fix4-test-ordinary@nexusflow.local",
    password: "Password123!",
  });
  ordinaryToken = sign(ordinaryUser);

  // 4. Candidate User 2 (Gets rejected)
  rejectedCandidateUser = await User.create({
    name: "FIX4 Candidate B",
    email: "fix4-test-cand-b@nexusflow.local",
    password: "Password123!",
  });
  rejectedCandidateToken = sign(rejectedCandidateUser);

  // 5. Candidate User 3 (Withdraws application)
  withdrawCandidateUser = await User.create({
    name: "FIX4 Candidate C",
    email: "fix4-test-cand-c@nexusflow.local",
    password: "Password123!",
  });
  withdrawCandidateToken = sign(withdrawCandidateUser);

  // Create Public Discoverable Team with Open Roles
  openRoleId1 = new mongoose.Types.ObjectId();
  openRoleId2 = new mongoose.Types.ObjectId();

  publicTeam = await Team.create({
    name: "FIX4-TEST-PublicWorkspace",
    ownerId: leaderUser._id,
    projectTitle: "V4 Autonomous Platform",
    projectDescription: "An open platform for collaborative engineering.",
    isDiscoverable: true,
    discoverySettings: {
      domain: "Web Development",
      methodology: "Agile/Scrum",
      projectStage: "development",
      academicCategory: "Capstone",
      difficulty: "Intermediate",
      expectations: "Commit 10 hours weekly and participate in standups.",
      generalInfo: "Open to passionate junior engineers.",
    },
    openRoles: [
      {
        _id: openRoleId1,
        roleName: "FIX4-Role-FrontendArchitect",
        roleDescription: "Architecting React UI and design system",
        requiredSkills: ["frontend", "fix4-skill-react"],
        preferredSkills: ["design"],
        minVerificationScore: 3,
        expectations: "Solid component design principles",
        availableSlots: 1,
        filledSlots: 0,
        status: "open",
      },
      {
        _id: openRoleId2,
        roleName: "FIX4-Role-BackendEngineer",
        roleDescription: "Node.js and MongoDB distributed API services",
        requiredSkills: ["backend", "fix4-skill-node"],
        preferredSkills: ["devops"],
        minVerificationScore: 3,
        availableSlots: 2,
        filledSlots: 0,
        status: "open",
      },
    ],
    members: [
      {
        userId: leaderUser._id,
        name: leaderUser.name,
        role: "leader",
        skills: { frontend: 8, backend: 8, devops: 6, design: 5, ml: 4, testing: 7 },
      },
      {
        userId: ordinaryUser._id,
        name: ordinaryUser.name,
        role: "member",
        skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
      },
    ],
  });

  // Create Private Team (NOT discoverable)
  privateTeam = await Team.create({
    name: "FIX4-TEST-PrivateSecretTeam",
    ownerId: leaderUser._id,
    projectTitle: "Secret Stealth Project",
    projectDescription: "Highly confidential internal project.",
    isDiscoverable: false,
    members: [
      {
        userId: leaderUser._id,
        name: leaderUser.name,
        role: "leader",
      },
    ],
  });
}

async function runTests() {
  await setup();

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1 & 2: Discoverable Teams Appear, Private Teams Are Hidden
  // ───────────────────────────────────────────────────────────────────────────
  console.log("===============================================================");
  console.log("TEST 1 & 2: Discoverable Teams Appear and Private Teams Are Hidden");
  console.log("===============================================================");
  {
    const res = await fetch(`${BASE_URL}/api/discovery/teams?search=FIX4-TEST`);
    const data = await res.json();

    assert(res.status === 200, "GET /api/discovery/teams returns 200 OK");
    assert(data.success === true, "Response reports success: true");

    const teamNames = (data.teams || []).map((t) => t.name);
    assert(teamNames.includes(publicTeam.name), "Discoverable public team is present in results");
    assert(!teamNames.includes(privateTeam.name), "Private team (isDiscoverable: false) is hidden from results");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Zero Privacy Leaks in Discovery
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 3: Public Discovery Never Leaks Private Data");
  console.log("===============================================================");
  {
    const res = await fetch(`${BASE_URL}/api/discovery/teams/${publicTeam._id}`);
    const data = await res.json();

    assert(res.status === 200, "GET /api/discovery/teams/:teamId returns 200 OK");
    const t = data.team;
    assert(t.name === publicTeam.name, "Returns team name");
    assert(t.projectTitle === publicTeam.projectTitle, "Returns project title");
    assert(t.projectDescription === publicTeam.projectDescription, "Returns project description");
    assert(t.discoverySettings.domain === "Web Development", "Returns public discovery domain");
    assert(Array.isArray(t.openRoles) && t.openRoles.length === 2, "Returns open roles list");
    assert(typeof t.memberCount === "number" && t.memberCount === 2, "Returns member count instead of member details");

    // Privacy assertions:
    assert(!t.members, "Team members array is not exposed");
    assert(!t.ownerId, "Owner ID is not exposed");
    assert(!JSON.stringify(data).includes("fix4-test-leader@nexusflow.local"), "Leader email is not leaked");
    assert(!JSON.stringify(data).includes("Password123!"), "No passwords or hashes leaked");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Discoverability != Membership (Applicant Cannot Directly Join)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 4: Discoverability != Membership (No Direct Self-Joining)");
  console.log("===============================================================");
  {
    // Check candidate membership before applying
    const freshTeamBefore = await Team.findById(publicTeam._id).lean();
    const isMemberBefore = freshTeamBefore.members.some((m) => m.userId.equals(candidateUser._id));
    assert(!isMemberBefore, "Candidate is NOT a member of the public team initially");

    // Attempting direct member addition without leader auth should fail
    const directJoinRes = await fetch(`${BASE_URL}/api/teams/${publicTeam._id}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({ userId: candidateUser._id.toString() }),
    });
    assert(directJoinRes.status === 403 || directJoinRes.status === 400, "Direct self-join request rejected with HTTP 403/400");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Role Skill Quiz Works & Verifies Skill (>= 3/5)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 5: Role Skill Quiz Works & Verifies Skill (3/5 Pass)");
  console.log("===============================================================");
  {
    const verifyRes = await fetch(`${BASE_URL}/api/skills/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        skill: "fix4-skill-react",
        score: 4,
        totalQuestions: 5,
      }),
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 201, "Skill verification returns 201 Created");
    assert(verifyData.verification?.verified === true, "Score 4/5 marked as verified");

    // Candidate should now have verified badge in DB
    const badge = await SkillVerification.findOne({
      userId: candidateUser._id,
      skill: "fix4-skill-react",
      verified: true,
    });
    assert(Boolean(badge), "SkillVerification record persisted in MongoDB");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Candidate Submits Application (Status: SUBMITTED, Match Computed)
  // ───────────────────────────────────────────────────────────────────────────
  let submittedAppId;
  console.log("\n===============================================================");
  console.log("TEST 6: Candidate Submits Application (Skill Match Computed)");
  console.log("===============================================================");
  {
    const applyRes = await fetch(`${BASE_URL}/api/discovery/teams/${publicTeam._id}/roles/${openRoleId1}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        message: "I have 2 years of React experience and would love to architect this UI.",
        quizResult: {
          skill: "fix4-skill-react",
          score: 4,
          totalQuestions: 5,
          percentage: 80,
          verified: true,
        },
      }),
    });
    const applyData = await applyRes.json();

    assert(applyRes.status === 201, "POST /apply returns 201 Created");
    assert(applyData.success === true, "Application submission succeeded");
    assert(applyData.application.status === "SUBMITTED", "Application status is 'SUBMITTED'");
    assert(applyData.application.roleName === "FIX4-Role-FrontendArchitect", "Application requested role is preserved");
    assert(applyData.application.skillMatch.matchPercentage > 0, "Skill match percentage computed");
    assert(applyData.application.skillMatch.compatibilityLabel === "High", "Compatibility label is 'High'");

    submittedAppId = applyData.application._id;

    // Verify candidate is STILL not a member! (Discoverability != membership)
    const freshTeam = await Team.findById(publicTeam._id).lean();
    const stillNotMember = !freshTeam.members.some((m) => m.userId.equals(candidateUser._id));
    assert(stillNotMember, "Candidate is STILL not a team member after submitting application");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Duplicate Active Application Is Blocked (HTTP 409)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 7: Duplicate Active Application Blocked (HTTP 409)");
  console.log("===============================================================");
  {
    const dupRes = await fetch(`${BASE_URL}/api/discovery/teams/${publicTeam._id}/roles/${openRoleId1}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        message: "Attempting duplicate application",
      }),
    });
    const dupData = await dupRes.json();

    assert(dupRes.status === 409, "Duplicate active application returns HTTP 409 Conflict");
    assert(dupData.error.includes("active application"), "Error message indicates active application exists");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Ordinary Member Cannot Accept or Reject Applications (HTTP 403)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 8: Ordinary Member Cannot Accept or Reject (HTTP 403)");
  console.log("===============================================================");
  {
    const unauthAcceptRes = await fetch(`${BASE_URL}/api/applications/${submittedAppId}/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ordinaryToken}`,
      },
    });
    assert(unauthAcceptRes.status === 403, "Ordinary member accept attempt returns HTTP 403 Forbidden");

    const unauthRejectRes = await fetch(`${BASE_URL}/api/applications/${submittedAppId}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ordinaryToken}`,
      },
      body: JSON.stringify({ reason: "Unauth rejection" }),
    });
    assert(unauthRejectRes.status === 403, "Ordinary member reject attempt returns HTTP 403 Forbidden");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Leader Accepts Application -> Actual Registered User Membership
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 9: Leader Accepts Application -> Real User ID Membership");
  console.log("===============================================================");
  {
    const acceptRes = await fetch(`${BASE_URL}/api/applications/${submittedAppId}/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderToken}`,
      },
    });
    const acceptData = await acceptRes.json();

    assert(acceptRes.status === 200, "POST /applications/:id/accept returns 200 OK");
    assert(acceptData.application.status === "ACCEPTED", "Application status updated to 'ACCEPTED'");
    assert(acceptData.application.reviewerId === leaderUser._id.toString(), "Reviewer ID recorded as leader");

    // Verify candidate is now an actual member of the team
    const updatedTeam = await Team.findById(publicTeam._id).lean();
    const candidateMember = updatedTeam.members.find((m) => m.userId.equals(candidateUser._id));
    assert(Boolean(candidateMember), "Candidate is now present in team.members");
    assert(candidateMember.name === candidateUser.name, "Member name matches registered user name");
    assert(candidateMember.userId.toString() === candidateUser._id.toString(), "Member uses actual registered User ID");

    // Verify open role slot was updated
    const updatedRole = updatedTeam.openRoles.find((r) => r._id.equals(openRoleId1));
    assert(updatedRole.filledSlots === 1, "Role filledSlots incremented to 1");
    assert(updatedRole.status === "closed", "Role status changed to 'closed' since availableSlots = 1");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Rejection Does Not Create Membership & Captures Reason
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 10: Rejection Does Not Create Membership & Captures Reason");
  console.log("===============================================================");
  {
    // Candidate B applies for Role 2
    const applyResB = await fetch(`${BASE_URL}/api/discovery/teams/${publicTeam._id}/roles/${openRoleId2}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rejectedCandidateToken}`,
      },
      body: JSON.stringify({
        message: "Applying for backend engineer",
      }),
    });
    const applyDataB = await applyResB.json();
    assert(applyResB.status === 201, "Candidate B application submitted");
    const appBId = applyDataB.application._id;

    // Leader rejects Candidate B with reason
    const rejectRes = await fetch(`${BASE_URL}/api/applications/${appBId}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({
        reason: "Need senior Node.js experience for this sprint.",
      }),
    });
    const rejectData = await rejectRes.json();

    assert(rejectRes.status === 200, "POST /applications/:id/reject returns 200 OK");
    assert(rejectData.application.status === "REJECTED", "Application status updated to 'REJECTED'");
    assert(rejectData.application.reviewReason.includes("senior Node.js"), "Review reason captured in application");

    // Verify Candidate B was NOT added as a member
    const teamAfterReject = await Team.findById(publicTeam._id).lean();
    const candidateBInTeam = teamAfterReject.members.some((m) => m.userId.equals(rejectedCandidateUser._id));
    assert(!candidateBInTeam, "Rejected candidate was NOT added to team.members");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Candidate Can Withdraw an Active Application
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 11: Candidate Can Withdraw Active Application");
  console.log("===============================================================");
  {
    // Candidate C applies for Role 2
    const applyResC = await fetch(`${BASE_URL}/api/discovery/teams/${publicTeam._id}/roles/${openRoleId2}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${withdrawCandidateToken}`,
      },
      body: JSON.stringify({ message: "Applying then withdrawing" }),
    });
    const applyDataC = await applyResC.json();
    const appCId = applyDataC.application._id;

    // Other user cannot withdraw Candidate C's application
    const unauthWithdraw = await fetch(`${BASE_URL}/api/applications/${appCId}/withdraw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ordinaryToken}`,
      },
    });
    assert(unauthWithdraw.status === 403, "Non-owner withdrawal attempt rejected with 403 Forbidden");

    // Candidate C withdraws own application
    const withdrawRes = await fetch(`${BASE_URL}/api/applications/${appCId}/withdraw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${withdrawCandidateToken}`,
      },
    });
    const withdrawData = await withdrawRes.json();

    assert(withdrawRes.status === 200, "Withdrawal returns 200 OK");
    assert(withdrawData.application.status === "WITHDRAWN", "Application status updated to 'WITHDRAWN'");
    assert(Boolean(withdrawData.application.withdrawnAt), "withdrawnAt timestamp is populated");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Notifications and TeamApplicationAudit Records
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 12: Notifications & TeamApplicationAudit Records");
  console.log("===============================================================");
  {
    // 1. Check Acceptance Notification for Candidate A
    const acceptNotif = await Notification.findOne({
      userId: candidateUser._id,
      type: "application_accepted",
    }).lean();
    assert(Boolean(acceptNotif), "Acceptance notification delivered to Candidate A");
    assert(acceptNotif.data.teamName === publicTeam.name, "Notification payload preserves teamName");

    // 2. Check Rejection Notification for Candidate B
    const rejectNotif = await Notification.findOne({
      userId: rejectedCandidateUser._id,
      type: "application_rejected",
    }).lean();
    assert(Boolean(rejectNotif), "Rejection notification delivered to Candidate B");
    assert(rejectNotif.data.reason.includes("senior Node.js"), "Rejection notification includes reason");

    // 3. Check TeamApplicationAudit Records
    const auditAccepted = await TeamApplicationAudit.findOne({
      applicationId: submittedAppId,
      action: "ACCEPTED",
    }).lean();
    assert(Boolean(auditAccepted), "TeamApplicationAudit 'ACCEPTED' record created");
    assert(auditAccepted.actorId.equals(leaderUser._id), "Audit records leader as the actor");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 13: Direct Invitation Path (PATH A) Still Works (Coexistence)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================");
  console.log("TEST 13: Direct Invitation Flow Coexists and Remains Intact");
  console.log("===============================================================");
  {
    const freshInvitee = await User.create({
      name: "FIX4 Direct Invitee",
      email: "fix4-test-invitee@nexusflow.local",
      password: "Password123!",
    });

    const invResult = await sendTeamInvitation({
      teamId: publicTeam._id.toString(),
      inviterUser: leaderUser,
      invitedEmail: freshInvitee.email,
      role: "member",
    });

    assert(invResult.ok === true, "sendTeamInvitation returns ok: true");
    assert(invResult.status === 201, "Invitation created with HTTP 201");
    assert(invResult.invitation.invitedUserId.equals(freshInvitee._id), "Direct invitee ID matches registered User ID");

    const invNotification = await Notification.findOne({
      userId: freshInvitee._id,
      type: "team_invitation",
    });
    assert(Boolean(invNotification), "Invitation notification created for directly invited user");
  }

  console.log("\n===============================================================");
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("===============================================================\n");

  await mongoose.disconnect();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  if (server) server.close();
  process.exit(1);
});
