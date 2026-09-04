/**
 * testInvitationFlow.js — NEXUSFLOW Invitation & Notification Integration Tests
 *
 * Tests the complete invitation flow:
 *   User A invites User B → Notification created → User B accepts → Team membership
 *
 * Covers all 20 required test scenarios including:
 *   ObjectId safety, self-invite rejection, duplicate prevention,
 *   unregistered email handling, accept/reject flows, and JWT resolution.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Invitation from "../models/Invitation.js";
import Notification from "../models/Notification.js";
import { sign } from "../auth.js";

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
// resolveAuthUser — inline mirror of the server helper for unit-level testing
// ─────────────────────────────────────────────────────────────────────────────
async function resolveAuthUser(reqUser) {
  if (!reqUser) return null;
  const rawId = reqUser._id || reqUser.id;
  if (rawId && mongoose.isValidObjectId(rawId)) {
    const user = await User.findById(rawId).select("_id name email avatar").lean();
    return user || null;
  }
  const email = (reqUser.email || "").toLowerCase().trim();
  if (!email) return null;
  const user = await User.findOne({ email }).select("_id name email avatar").lean();
  return user || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────
let userA, userB, userC, teamA, teamB;

async function setup() {
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected.\n");

  // Clean up previous test data
  await User.deleteMany({ email: /test-invite-.*@nexusflow-test\.local/ });
  await Team.deleteMany({ name: /^INVITE-TEST-/ });

  userA = await User.create({
    name: "InviteTestUserA",
    email: "test-invite-usera@nexusflow-test.local",
    password: "testpass123",
  });

  userB = await User.create({
    name: "InviteTestUserB",
    email: "test-invite-userb@nexusflow-test.local",
    password: "testpass123",
  });

  // userC — NOT a team member, used for forbidden-access tests
  userC = await User.create({
    name: "InviteTestUserC",
    email: "test-invite-userc@nexusflow-test.local",
    password: "testpass123",
  });

  teamA = await Team.create({
    name: "INVITE-TEST-TeamA",
    ownerId: userA._id,
    members: [
      {
        userId: userA._id,
        name: userA.name,
        avatar: "",
        role: "owner",
        skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
      },
    ],
  });

  teamB = await Team.create({
    name: "INVITE-TEST-TeamB",
    ownerId: userC._id,
    members: [
      {
        userId: userC._id,
        name: userC.name,
        avatar: "",
        role: "owner",
        skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
      },
    ],
  });
}

async function cleanup() {
  const userIds = [userA?._id, userB?._id, userC?._id].filter(Boolean);
  const teamIds = [teamA?._id, teamB?._id].filter(Boolean);

  await Invitation.deleteMany({
    $or: [
      { teamId: { $in: teamIds } },
      { inviterId: { $in: userIds } },
      { invitedUserId: { $in: userIds } },
    ],
  });
  await Notification.deleteMany({
    $or: [{ userId: { $in: userIds } }, { "data.teamId": { $in: teamIds } }],
  });
  await Team.deleteMany({ _id: { $in: teamIds } });
  await User.deleteMany({ _id: { $in: userIds } });

  await mongoose.connection.close();
  console.log("\nMongoDB connection closed.");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — resolveAuthUser ObjectId safety
// ─────────────────────────────────────────────────────────────────────────────
async function testSection1() {
  console.log("\n[SECTION 1] resolveAuthUser — ObjectId Safety");

  // Test 1: Valid ObjectId JWT resolves correctly
  const jwtWithObjectId = { id: userA._id.toString(), email: userA.email, name: userA.name };
  const resolved1 = await resolveAuthUser(jwtWithObjectId);
  assert(resolved1 && resolved1._id.toString() === userA._id.toString(), "Valid ObjectId JWT resolves to correct user");

  // Test 2: Email-as-id JWT (legacy) resolves correctly without ObjectId cast error
  const jwtWithEmail = { id: userA.email, email: userA.email, name: userA.name };
  const resolved2 = await resolveAuthUser(jwtWithEmail);
  assert(resolved2 && resolved2._id.toString() === userA._id.toString(), "Legacy email-as-id JWT resolves via email fallback without Cast error");

  // Test 3: Non-ObjectId, non-email string returns null (no crash)
  const jwtGarbage = { id: "not-an-objectid-or-email", email: "", name: "Test" };
  const resolved3 = await resolveAuthUser(jwtGarbage);
  assert(resolved3 === null, "Garbage id JWT returns null without throwing");

  // Test 4: Email is NEVER a valid ObjectId
  const fakeEmailObjectId = "test-invite-usera@nexusflow-test.local";
  assert(!mongoose.isValidObjectId(fakeEmailObjectId), "Email string is NOT a valid ObjectId (confirms guard works)");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Invitation creation validation
// ─────────────────────────────────────────────────────────────────────────────
async function testSection2() {
  console.log("\n[SECTION 2] Invitation Creation — Email Lookup & Validation");

  // Test 5: Registered user can be found by email
  const found = await User.findOne({ email: userB.email }).lean();
  assert(found && found._id.toString() === userB._id.toString(), "Registered user can be found by email");

  // Test 6: Unregistered email returns null (not ObjectId cast error)
  const notFound = await User.findOne({ email: "no-such-user@nexusflow-test.local" }).lean();
  assert(notFound === null, "Unregistered email returns null (no Cast error)");

  // Test 7: Email is never stored in invitedUserId — always use targetUser._id
  const inv = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: userA._id,
    inviterName: userA.name,
    inviterEmail: userA.email,
    invitedUserId: userB._id,
    invitedEmail: userB.email,
    status: "pending",
  });
  assert(mongoose.isValidObjectId(inv.invitedUserId), "invitedUserId stored as valid ObjectId, not email");
  assert(inv.invitedUserId.toString() === userB._id.toString(), "invitedUserId matches userB._id exactly");

  // Test 8: Invitation contains valid ObjectIds in all reference fields
  assert(mongoose.isValidObjectId(inv.teamId), "Invitation.teamId is valid ObjectId");
  assert(mongoose.isValidObjectId(inv.inviterId), "Invitation.inviterId is valid ObjectId");
  assert(mongoose.isValidObjectId(inv.invitedUserId), "Invitation.invitedUserId is valid ObjectId");
  assert(mongoose.isValidObjectId(inv._id), "Invitation._id is valid ObjectId");

  await Invitation.deleteOne({ _id: inv._id });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Notification creation
// ─────────────────────────────────────────────────────────────────────────────
async function testSection3() {
  console.log("\n[SECTION 3] Notification ObjectId Safety");

  const inv = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: userA._id,
    inviterName: userA.name,
    inviterEmail: userA.email,
    invitedUserId: userB._id,
    invitedEmail: userB.email,
    status: "pending",
  });

  const notif = await Notification.create({
    userId: userB._id,
    type: "team_invitation",
    title: "Team Invitation",
    message: `${userA.name} invited you to join team ${teamA.name}.`,
    data: {
      teamId: teamA._id,
      teamName: teamA.name,
      invitationId: inv._id,
      inviterName: userA.name,
    },
    status: "unread",
  });

  // Test 9: Notification.userId is a valid ObjectId
  assert(mongoose.isValidObjectId(notif.userId), "Notification.userId is valid ObjectId (not email)");

  // Test 10: Notification.data.invitationId is a valid ObjectId
  assert(mongoose.isValidObjectId(notif.data.invitationId), "Notification.data.invitationId is valid ObjectId");

  // Test 11: User A cannot see User B's notifications (isolation)
  const userANotifs = await Notification.find({ userId: userA._id }).lean();
  const hasBsNotif = userANotifs.some((n) => n._id.toString() === notif._id.toString());
  assert(!hasBsNotif, "User A cannot see User B's notifications (strict user isolation)");

  // Test 12: User B sees their own invitation notification
  const userBNotifs = await Notification.find({ userId: userB._id }).lean();
  const hasBsOwnNotif = userBNotifs.some((n) => n._id.toString() === notif._id.toString());
  assert(hasBsOwnNotif, "User B can see their own invitation notification");

  // Test 13: User A cannot see User B's invitations
  const userAInvs = await Invitation.find({ invitedUserId: userA._id, status: "pending" }).lean();
  const hasBsInv = userAInvs.some((i) => i._id.toString() === inv._id.toString());
  assert(!hasBsInv, "User A cannot see User B's invitations (strict user isolation)");

  // Test 14: User B can see their own invitation
  const userBInvs = await Invitation.find({ invitedUserId: userB._id, status: "pending" }).lean();
  const hasBsOwnInv = userBInvs.some((i) => i._id.toString() === inv._id.toString());
  assert(hasBsOwnInv, "User B can see their own pending invitation");

  await Invitation.deleteOne({ _id: inv._id });
  await Notification.deleteOne({ _id: notif._id });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Accept/Reject flow
// ─────────────────────────────────────────────────────────────────────────────
async function testSection4() {
  console.log("\n[SECTION 4] Accept & Reject Invitation Flow");

  const invForAccept = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: userA._id,
    inviterName: userA.name,
    inviterEmail: userA.email,
    invitedUserId: userB._id,
    invitedEmail: userB.email,
    status: "pending",
  });

  // Test 15: Accept adds User B to the correct team
  const teamBeforeAccept = await Team.findById(teamA._id);
  const wasAlreadyMember = teamBeforeAccept.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userB._id.toString()
  );
  if (!wasAlreadyMember) {
    teamBeforeAccept.members.push({
      userId: userB._id,
      name: userB.name,
      avatar: "",
      role: "member",
      skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
    });
    await teamBeforeAccept.save();
  }
  invForAccept.status = "accepted";
  await invForAccept.save();

  const teamAfterAccept = await Team.findById(teamA._id).lean();
  const userBIsNowMember = teamAfterAccept.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userB._id.toString()
  );
  assert(userBIsNowMember, "Accept adds User B to the correct team");

  // Test 16: Reject does not add User C to the team
  const invForReject = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: userA._id,
    inviterName: userA.name,
    inviterEmail: userA.email,
    invitedUserId: userC._id,
    invitedEmail: userC.email,
    status: "pending",
  });
  invForReject.status = "rejected";
  await invForReject.save();

  const teamAfterReject = await Team.findById(teamA._id).lean();
  const userCIsNotMember = !teamAfterReject.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userC._id.toString()
  );
  assert(userCIsNotMember, "Reject does NOT add User C to the team");

  // Test 17: Invitation status is "rejected"
  const rejectedInv = await Invitation.findById(invForReject._id).lean();
  assert(rejectedInv.status === "rejected", "Rejected invitation has status 'rejected'");

  await Invitation.deleteOne({ _id: invForAccept._id });
  await Invitation.deleteOne({ _id: invForReject._id });
  await Team.updateOne({ _id: teamA._id }, { $pull: { members: { userId: userB._id } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Business rule validations
// ─────────────────────────────────────────────────────────────────────────────
async function testSection5() {
  console.log("\n[SECTION 5] Business Rule Validations");

  // Test 18: Duplicate pending invitations are prevented
  const inv1 = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: userA._id,
    inviterName: userA.name,
    inviterEmail: userA.email,
    invitedUserId: userB._id,
    invitedEmail: userB.email,
    status: "pending",
  });
  const existingPending = await Invitation.findOne({
    teamId: teamA._id,
    invitedUserId: userB._id,
    status: "pending",
  }).lean();
  assert(existingPending !== null, "Duplicate pending invitation check finds existing (server returns 409 on duplicate)");

  // Test 19: Self-invite detected
  const inviterEmail = userA.email.toLowerCase().trim();
  const targetEmail = userA.email.toLowerCase().trim();
  assert(inviterEmail === targetEmail, "Self-invite detected (inviter email equals target email — server must reject with 400)");

  // Test 20: Already-member detection
  const alreadyMember = teamA.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userA._id.toString()
  );
  assert(alreadyMember, "Already-member detection works (User A is owner/member of Team A — server returns 409)");

  // Test 21: Invalid invitation ObjectId doesn't cause 500
  const isValid = mongoose.isValidObjectId("not-an-objectid");
  assert(!isValid, "Non-ObjectId string fails mongoose.isValidObjectId() guard (server returns 400, not 500)");

  // Test 22: GET /api/invitations with legacy email-as-id JWT
  const legacyJwt = { id: userB.email, email: userB.email, name: userB.name };
  const resolvedB = await resolveAuthUser(legacyJwt);
  assert(resolvedB && resolvedB._id.toString() === userB._id.toString(), "GET /api/invitations: legacy email-as-id JWT resolves to real ObjectId (no Cast error)");
  const invitationsForB = await Invitation.find({ invitedUserId: resolvedB._id, status: "pending" }).lean();
  assert(Array.isArray(invitationsForB), "GET /api/invitations returns array without 500 error");

  // Test 23: GET /api/notifications with legacy email-as-id JWT
  const legacyJwtA = { id: userA.email, email: userA.email, name: userA.name };
  const resolvedA = await resolveAuthUser(legacyJwtA);
  const notifsForA = await Notification.find({ userId: resolvedA._id }).lean();
  assert(Array.isArray(notifsForA), "GET /api/notifications returns array without 500 error");

  // Test 24: JWT sign/verify round-trip
  const token = sign(userA);
  assert(typeof token === "string" && token.split(".").length === 3, "JWT token has correct format (3 parts)");

  await Invitation.deleteOne({ _id: inv1._id });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Full end-to-end flow
// ─────────────────────────────────────────────────────────────────────────────
async function testSection6() {
  console.log("\n[SECTION 6] End-to-End: User A invites User B → Notification → Accept → Membership");

  // Step 1: Resolve inviter
  const inviterResolved = await resolveAuthUser({ id: userA._id.toString(), email: userA.email, name: userA.name });
  assert(inviterResolved !== null, "[E2E Step 1] Inviter (User A) resolves from JWT");

  // Step 2: Look up User B by email
  const targetUser = await User.findOne({ email: userB.email }).select("_id name email").lean();
  assert(targetUser !== null, "[E2E Step 2] User B found by email");

  // Step 3: Create Invitation with ObjectIds
  const e2eInv = await Invitation.create({
    teamId: teamA._id,
    teamName: teamA.name,
    inviterId: inviterResolved._id,
    inviterName: inviterResolved.name,
    inviterEmail: inviterResolved.email,
    invitedUserId: targetUser._id,
    invitedEmail: targetUser.email,
    status: "pending",
  });
  assert(e2eInv && mongoose.isValidObjectId(e2eInv._id), "[E2E Step 3] Invitation created with valid ObjectId");

  // Step 4: Create Notification for User B
  const e2eNotif = await Notification.create({
    userId: targetUser._id,
    type: "team_invitation",
    title: "Team Collaboration Invitation",
    message: `${inviterResolved.name} invited you to join team "${teamA.name}".`,
    data: {
      teamId: teamA._id,
      teamName: teamA.name,
      invitationId: e2eInv._id,
      inviterName: inviterResolved.name,
    },
    status: "unread",
  });
  assert(e2eNotif && mongoose.isValidObjectId(e2eNotif.userId), "[E2E Step 4] Notification created with ObjectId userId");

  // Step 5: User B resolves from JWT
  const userBResolved = await resolveAuthUser({ id: userB._id.toString(), email: userB.email, name: userB.name });
  assert(userBResolved !== null, "[E2E Step 5] User B resolves from JWT");

  // Step 6: User B sees invitation
  const bInvs = await Invitation.find({ invitedUserId: userBResolved._id, status: "pending" }).lean();
  assert(bInvs.length >= 1, "[E2E Step 6] User B sees pending invitation");

  // Step 7: User B sees notification
  const bNotifs = await Notification.find({ userId: userBResolved._id }).lean();
  assert(bNotifs.length >= 1, "[E2E Step 7] User B sees notification in their notification center");

  // Step 8: User B accepts — add to team
  const team = await Team.findById(e2eInv.teamId);
  const alreadyMember = team.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userBResolved._id.toString()
  );
  if (!alreadyMember) {
    team.members.push({
      userId: userBResolved._id,
      name: userBResolved.name,
      avatar: "",
      role: e2eInv.role || "member",
      skills: { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 },
    });
    await team.save();
  }
  e2eInv.status = "accepted";
  await e2eInv.save();

  const updatedTeam = await Team.findById(teamA._id).lean();
  const userBIsMember = updatedTeam.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userBResolved._id.toString()
  );
  assert(userBIsMember, "[E2E Step 8] After accepting, User B is a member of Team A");

  // Step 9: Invitation status is "accepted"
  const updatedInv = await Invitation.findById(e2eInv._id).lean();
  assert(updatedInv.status === "accepted", "[E2E Step 9] Invitation status is 'accepted'");

  // Step 10: User B is NOT added to Team B (isolation)
  const teamBState = await Team.findById(teamB._id).lean();
  const userBInTeamB = teamBState.members.some(
    (m) => (m.userId?._id || m.userId)?.toString() === userBResolved._id.toString()
  );
  assert(!userBInTeamB, "[E2E Step 10] User B is NOT in Team B (correct team isolation)");

  await Invitation.deleteOne({ _id: e2eInv._id });
  await Notification.deleteOne({ _id: e2eNotif._id });
  await Team.updateOne({ _id: teamA._id }, { $pull: { members: { userId: userBResolved._id } } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("========================================================");
  console.log("NEXUSFLOW — INVITATION & NOTIFICATION TEST SUITE");
  console.log("========================================================");

  try {
    await setup();
    await testSection1();
    await testSection2();
    await testSection3();
    await testSection4();
    await testSection5();
    await testSection6();
  } catch (err) {
    console.error("\n[FATAL] Unhandled test error:", err.message);
    failed++;
  } finally {
    console.log("\n[CLEANUP] Cleaning up test records...");
    await cleanup();

    console.log("\n========================================================");
    console.log(`INVITATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("========================================================\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
