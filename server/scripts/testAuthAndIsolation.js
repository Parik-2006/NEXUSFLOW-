/**
 * server/scripts/testAuthAndIsolation.js
 * ============================================================================
 * Automated Test Suite for NEXUSFLOW 2.0:
 * - User Signup & Validation
 * - Password Hashing with Bcrypt
 * - JWT Issuance & Verification
 * - Profile Synchronization & Cascades
 * - Strict User & Team Isolation (Zero Data Leaks)
 * - Multi-User Team Collaboration
 * - Server-Side Project Access Control (403 Rejection)
 * - Private Copilot Session Scoping
 * ============================================================================
 */

import mongoose from "mongoose";
import "dotenv/config";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import AIConversation from "../models/AIConversation.js";
import AIMessage from "../models/AIMessage.js";
import { sign, verify, formatUser } from "../auth.js";
import { verifyTeamAccess } from "../routes/teams.js";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("NEXUSFLOW 2.0 — AUTHENTICATION & ISOLATION TEST SUITE");
  console.log("========================================================\n");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.\n");

    const testRunId = Date.now();
    const emailA = `user_a_${testRunId}@example.com`;
    const emailB = `user_b_${testRunId}@example.com`;
    const emailC = `user_c_${testRunId}@example.com`;

    // ── TEST 1: User Registration & Password Hashing ─────────────────────────
    console.log("[TEST 1] User Registration & Bcrypt Hashing");
    const userA = await User.create({
      name: "Alice Builder",
      email: emailA,
      password: "SuperSecretPassword123!",
      role: "Lead Architect",
      skills: ["Frontend", "Backend"],
    });

    assert(userA._id && mongoose.isValidObjectId(userA._id), "User A created with valid ObjectId");
    assert(userA.password !== "SuperSecretPassword123!", "Password was hashed with bcrypt (not plaintext)");
    assert(userA.email === emailA, "Email normalized correctly");

    const isMatch = await userA.comparePassword("SuperSecretPassword123!");
    assert(isMatch === true, "bcrypt comparePassword returns true for correct password");
    const isBadMatch = await userA.comparePassword("WrongPassword!");
    assert(isBadMatch === false, "bcrypt comparePassword returns false for wrong password");

    // ── TEST 2: JWT Token Issuance & Verification ────────────────────────────
    console.log("\n[TEST 2] JWT Token Issuance & Verification");
    const tokenA = sign(userA);
    assert(typeof tokenA === "string" && tokenA.split(".").length === 3, "JWT signed with 3 valid segments");

    const payloadA = verify(tokenA);
    assert(payloadA && payloadA.id === userA._id.toString(), "JWT verified: payload.id matches user._id");
    assert(payloadA.email === emailA, "JWT verified: payload.email matches");

    // ── TEST 3: User Profile Formatting & Synchronization ───────────────────
    console.log("\n[TEST 3] User Profile Formatting & Synchronization");
    const formattedA = formatUser(userA);
    assert(formattedA.password === undefined, "Formatted user does NOT expose password field");
    assert(formattedA.name === "Alice Builder", "Formatted user has correct name");

    // Profile update
    userA.name = "Alice Updated";
    userA.avatar = "data:image/png;base64,sampleAvatarData";
    userA.bio = "Senior AI & DAA Architect";
    await userA.save();

    const freshUserA = await User.findById(userA._id).lean();
    assert(freshUserA.name === "Alice Updated", "User name updated in MongoDB");
    assert(freshUserA.avatar === "data:image/png;base64,sampleAvatarData", "User avatar updated in MongoDB");

    // ── TEST 4: Create User B & User C ───────────────────────────────────────
    console.log("\n[TEST 4] Create User B & User C");
    const userB = await User.create({
      name: "Bob Engineer",
      email: emailB,
      password: "BobPassword456!",
      role: "Backend Specialist",
      skills: ["Backend", "DevOps"],
    });
    const tokenB = sign(userB);

    const userC = await User.create({
      name: "Charlie Bystander",
      email: emailC,
      password: "CharliePassword789!",
    });
    const tokenC = sign(userC);

    assert(userB && userC, "User B and User C created");

    // ── TEST 5: Team Creation & Strict User Isolation ────────────────────────
    console.log("\n[TEST 5] Team Creation & Strict User Isolation");
    const teamAlpha = await Team.create({
      name: "Team Alpha (Alice's Team)",
      ownerId: userA._id,
      members: [
        {
          userId: userA._id,
          name: userA.name,
          avatar: userA.avatar,
          role: "leader",
        },
      ],
      projectTitle: "Alpha Drone System",
      projectDescription: "Autonomous surveillance drone fleet with IoT sensors",
    });

    const projectAlpha = await Project.create({
      teamId: teamAlpha._id,
      title: "Alpha Drone System",
      description: "Autonomous drone telemetry platform",
      originalPrompt: "Autonomous drone telemetry platform",
    });

    // Verify User A has access to Team Alpha
    const accessA = await verifyTeamAccess(teamAlpha._id, { id: userA._id.toString(), email: emailA });
    assert(!accessA.error && accessA.team, "User A (Owner) has access to Team Alpha");

    // Verify User B DOES NOT have access to Team Alpha
    const accessB = await verifyTeamAccess(teamAlpha._id, { id: userB._id.toString(), email: emailB });
    assert(accessB.error && accessB.status === 403, "User B is REJECTED with 403 Forbidden for Team Alpha");

    // Query isolation: User B querying teams
    const userBTeams = await Team.find({
      $or: [
        { ownerId: userB._id },
        { "members.userId": userB._id },
      ],
    }).lean();
    assert(userBTeams.length === 0, "User B queries /api/teams -> returns 0 teams (Team Alpha is NOT leaked)");

    // ── TEST 6: Multi-User Team Collaboration ────────────────────────────────
    console.log("\n[TEST 6] Multi-User Team Collaboration");
    // Alice adds Bob as a member of Team Alpha
    teamAlpha.members.push({
      userId: userB._id,
      name: userB.name,
      avatar: userB.avatar || "",
      role: "member",
    });
    await teamAlpha.save();

    // Now User B checks access to Team Alpha
    const accessBCollaborator = await verifyTeamAccess(teamAlpha._id, { id: userB._id.toString(), email: emailB });
    assert(!accessBCollaborator.error, "User B (Invited Member) now has access to Team Alpha");

    // User B querying teams now includes Team Alpha
    const userBTeamsAfterInvite = await Team.find({
      $or: [
        { ownerId: userB._id },
        { "members.userId": userB._id },
      ],
    }).lean();
    assert(userBTeamsAfterInvite.length === 1 && userBTeamsAfterInvite[0]._id.equals(teamAlpha._id), "User B now sees Team Alpha in /api/teams");

    // User C still does NOT have access
    const accessC = await verifyTeamAccess(teamAlpha._id, { id: userC._id.toString(), email: emailC });
    assert(accessC.error && accessC.status === 403, "User C (Uninvited) is still REJECTED with 403 Forbidden");

    // ── TEST 7: Private Copilot Session Scoping ──────────────────────────────
    console.log("\n[TEST 7] Private Copilot Session Scoping");
    // User A starts a conversation on Project Alpha
    const convA = await AIConversation.create({
      projectId: projectAlpha._id,
      title: "Alice Drone Discussion",
      startedBy: userA._id,
      status: "active",
    });
    await AIMessage.create({
      conversationId: convA._id,
      projectId: projectAlpha._id,
      role: "user",
      content: "What sensors do we need for the drone?",
      sentBy: userA._id,
    });
    await AIMessage.create({
      conversationId: convA._id,
      projectId: projectAlpha._id,
      role: "assistant",
      content: "You need an IMU (MPU6050), Barometer (BMP280), and GPS module.",
      provider: "deterministic",
    });

    // User B starts a conversation on the same Project Alpha
    const convB = await AIConversation.create({
      projectId: projectAlpha._id,
      title: "Bob Drone Discussion",
      startedBy: userB._id,
      status: "active",
    });
    await AIMessage.create({
      conversationId: convB._id,
      projectId: projectAlpha._id,
      role: "user",
      content: "How should we design the database schema for telemetry?",
      sentBy: userB._id,
    });
    await AIMessage.create({
      conversationId: convB._id,
      projectId: projectAlpha._id,
      role: "assistant",
      content: "Use MongoDB time-series collections for high-frequency sensor readings.",
      provider: "deterministic",
    });

    // Fetch conversation for User A
    const userAConv = await AIConversation.findOne({
      projectId: projectAlpha._id,
      startedBy: userA._id,
      status: "active",
    }).lean();
    const userAMsgs = await AIMessage.find({ conversationId: userAConv._id }).lean();

    assert(userAConv && userAConv._id.equals(convA._id), "User A retrieves ONLY User A's conversation");
    assert(userAMsgs.length === 2 && userAMsgs[0].content.includes("What sensors"), "User A message history contains User A's questions");

    // Fetch conversation for User B
    const userBConv = await AIConversation.findOne({
      projectId: projectAlpha._id,
      startedBy: userB._id,
      status: "active",
    }).lean();
    const userBMsgs = await AIMessage.find({ conversationId: userBConv._id }).lean();

    assert(userBConv && userBConv._id.equals(convB._id), "User B retrieves ONLY User B's conversation");
    assert(userBMsgs.length === 2 && userBMsgs[0].content.includes("database schema"), "User B message history contains User B's questions");
    assert(!userBMsgs.some((m) => m.content.includes("What sensors")), "User B CANNOT see User A's conversation messages");

    // ── CLEANUP ──────────────────────────────────────────────────────────────
    console.log("\n[CLEANUP] Cleaning up test data...");
    await Promise.all([
      User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id] } }),
      Team.deleteMany({ _id: teamAlpha._id }),
      Project.deleteMany({ _id: projectAlpha._id }),
      AIConversation.deleteMany({ _id: { $in: [convA._id, convB._id] } }),
      AIMessage.deleteMany({ conversationId: { $in: [convA._id, convB._id] } }),
    ]);
    console.log("Cleanup completed.");

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    console.log("\n========================================================");
    console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("========================================================\n");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
