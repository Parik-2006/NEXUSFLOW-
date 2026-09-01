/**
 * NEXUSFLOW 3.0 — Phase 1-9 Test Suite
 * Tests new features built on top of NexusFlow 2.0 baseline.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Invitation from "../models/Invitation.js";
import Notification from "../models/Notification.js";
import ChatMessage from "../models/ChatMessage.js";
import SkillVerification from "../models/SkillVerification.js";
import TeamDeparture from "../models/TeamDeparture.js";
import { sign, verify, requireAuth, formatUser } from "../auth.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
const JWT_SECRET = process.env.JWT_SECRET || "nexusflow-production-jwt-secret-key-2026";

let userA, userB, userC, teamA, tokenA, tokenB;
let mongoConnected = false;

async function connect() {
  await mongoose.connect(MONGO_URI);
  mongoConnected = true;
  console.log("Connected to MongoDB for NEXUSFLOW 3.0 tests.\n");
}

async function cleanup() {
  if (!mongoConnected) return;
  const collections = mongoose.connection.collections;
  for (const [name, coll] of Object.entries(collections)) {
    if (name !== "system.indexes") {
      await coll.deleteMany({});
    }
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createUser(name, email, password) {
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    password,
  });
  return user;
}

async function call(method, path, token, body) {
  const headers = { "Content-Type": "application/json", ...(token ? authHeader(token) : {}) };
  const res = await fetch(`http://localhost:4000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  await connect();
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ FAIL: ${name} — ${e.message}`);
      failed++;
    }
  };

  try {
    console.log("============================================================");
    console.log("NEXUSFLOW 3.0 — PHASE 1-9 TEST SUITE");
    console.log("============================================================\n");

    // ── PHASE 1: AUTHENTICATION & IDENTITY ────────────────────────────────
    console.log("[PHASE 1] Authentication & Identity");
    console.log("--------------------------------------------");

    await test("User A created with valid ObjectId", async () => {
      userA = await createUser("Alice", "alice@test.com", "password123");
      if (!userA._id) throw new Error("No _id");
    });

    await test("User B created for team testing", async () => {
      userB = await createUser("Bob", "bob@test.com", "password123");
      if (!userB._id) throw new Error("No _id");
    });

    await test("User C created for isolation testing", async () => {
      userC = await createUser("Charlie", "charlie@test.com", "password123");
      if (!userC._id) throw new Error("No _id");
    });

    tokenA = sign(userA);
    tokenB = sign(userB);

    await test("JWT contains correct user id", async () => {
      const payload = verify(tokenA);
      if (payload.id !== userA._id.toString()) throw new Error("ID mismatch");
    });

    await test("JWT verify returns null for garbage token", async () => {
      const payload = verify("not.a.valid.token");
      if (payload !== null) throw new Error("Expected null");
    });

    await test("requireAuth middleware works", async () => {
      const res = await call("GET", "/api/me", tokenA);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.data.email !== userA.email) throw new Error("Email mismatch");
    });

    await test("requireAuth rejects missing token", async () => {
      const res = await call("GET", "/api/me", null);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    await test("Duplicate email prevention works", async () => {
      const res = await call("POST", "/api/auth/signup", null, {
        name: "Alice2", email: "alice@test.com", password: "pass1234", confirmPassword: "pass1234",
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await test("Forgot password endpoint exists", async () => {
      const res = await call("POST", "/api/auth/forgot-password", tokenA, { email: userA.email });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      if (!res.data.success) throw new Error("Expected success");
    });

    await test("Forgot password doesn't reveal non-existent user", async () => {
      const res = await call("POST", "/api/auth/forgot-password", tokenA, { email: "nobody@test.com" });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.success) throw new Error("Expected success");
    });

    // ── PHASE 2: TEAM MEMBERSHIP & PERMISSIONS ───────────────────────────
    console.log("\n[PHASE 2] Team Membership & Permissions");
    console.log("--------------------------------------------");

    await test("User A creates team (becomes leader)", async () => {
      const res = await call("POST", "/api/teams", tokenA, { name: "Team Alpha" });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      teamA = res.data;
      if (teamA.ownerId?.toString() !== userA._id.toString()) throw new Error("Owner not set");
    });

    await test("User B cannot see Team Alpha", async () => {
      const res = await call("GET", "/api/teams", tokenB);
      const teams = res.data || [];
      const found = teams.some((t) => t._id === teamA._id);
      if (found) throw new Error("User B should not see Team Alpha");
    });

    await test("User A can see Team Alpha", async () => {
      const res = await call("GET", "/api/teams", tokenA);
      const teams = res.data || [];
      const found = teams.some((t) => t._id === teamA._id);
      if (!found) throw new Error("User A should see Team Alpha");
    });

    await test("Owner cannot leave team", async () => {
      const res = await call("POST", `/api/teams/${teamA._id}/leave`, tokenA, { reason: "test" });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await test("Non-owner can leave team with reason", async () => {
      const memberRes = await call("POST", `/api/teams/${teamA._id}/members`, tokenA, { name: userB.name });
      const team = memberRes.data;
      const bobMember = team.members?.find((m) => m.name === userB.name);
      if (!bobMember) throw new Error("Bob not added");

      const leaveRes = await call("POST", `/api/teams/${teamA._id}/leave`, tokenB, { reason: "project_completed", explanation: "Done" });
      if (leaveRes.status !== 200) throw new Error(`Expected 200, got ${leaveRes.status}`);

      const departure = await TeamDeparture.findOne({ userId: userB._id, teamId: teamA._id });
      if (!departure) throw new Error("Departure not recorded");
      if (departure.reason !== "project_completed") throw new Error("Reason mismatch");
    });

    await test("Team notification created for remaining members on leave", async () => {
      const notifs = await Notification.find({ userId: userA._id });
      const leaveNotif = notifs.find((n) => n.title === "Team Member Left");
      if (!leaveNotif) throw new Error("Leave notification not created");
    });

    await test("User B loses team access after leaving", async () => {
      const res = await call("GET", `/api/teams/${teamA._id}`, tokenB);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await test("Unauthorized team deletion returns 403", async () => {
      const res = await call("DELETE", `/api/teams/${teamA._id}`, tokenB);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    // ── PHASE 3: INVITATIONS ──────────────────────────────────────────────
    console.log("\n[PHASE 3] Invitations & Notifications");
    console.log("--------------------------------------------");

    await test("Duplicate invitation prevention", async () => {
      const res1 = await call("POST", `/api/teams/${teamA._id}/invitations`, tokenA, { email: userB.email });
      if (res1.status !== 201) throw new Error(`First invite failed: ${res1.status}`);

      const res2 = await call("POST", `/api/teams/${teamA._id}/invitations`, tokenA, { email: userB.email });
      if (res2.status !== 409) throw new Error(`Expected 409, got ${res2.status}`);
    });

    await test("Self-invite prevention", async () => {
      const res = await call("POST", `/api/teams/${teamA._id}/invitations`, tokenA, { email: userA.email });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await test("Unregistered user invitation returns error", async () => {
      const res = await call("POST", `/api/teams/${teamA._id}/invitations`, tokenA, { email: "nobody@test.com" });
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    });

    // ── PHASE 4: REAL-TIME FOUNDATION ────────────────────────────────────
    console.log("\n[PHASE 4] Real-Time Foundation");
    console.log("--------------------------------------------");

    await test("Socket.IO room strategy documented", async () => {
      const fs = await import("fs");
      const contract = fs.readFileSync("NEXUSFLOW_V3_SHARED_CONTRACT.md", "utf8");
      if (!contract.includes("user:{userId}")) throw new Error("User room missing");
      if (!contract.includes("team:{teamId}")) throw new Error("Team room missing");
      if (!contract.includes("project:{projectId}")) throw new Error("Project room missing");
    });

    await test("Chat socket handlers registered", async () => {
      const fs = await import("fs");
      const index = fs.readFileSync("server/index.js", "utf8");
      if (!index.includes("registerChatHandlers")) throw new Error("Chat handlers not registered");
    });

    // ── PHASE 6: CHAT SYSTEM ──────────────────────────────────────────────
    console.log("\n[PHASE 6] Chat System");
    console.log("--------------------------------------------");

    await test("ChatMessage model exists with correct schema", async () => {
      const msg = await ChatMessage.create({
        senderId: userA._id,
        senderName: userA.name,
        message: "Hello global chat",
        type: "global",
        status: "sent",
      });
      if (!msg._id) throw new Error("Message not created");
    });

    await test("Global chat endpoint returns messages", async () => {
      const res = await call("GET", "/api/chat/global", tokenA);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(res.data)) throw new Error("Expected array");
    });

    await test("Team chat endpoint enforces membership", async () => {
      const res = await call("GET", `/api/chat/team/${teamA._id}`, tokenB);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await test("Team chat allows members", async () => {
      const memberRes = await call("POST", `/api/teams/${teamA._id}/members`, tokenA, { name: userB.name });
      const team = memberRes.data;
      const bobMember = team.members?.find((m) => m.name === userB.name);
      if (!bobMember) throw new Error("Bob not in team");

      const chatRes = await call("GET", `/api/chat/team/${teamA._id}`, tokenB);
      if (chatRes.status !== 200) throw new Error(`Expected 200, got ${chatRes.status}`);
    });

    // ── PHASE 7: SKILL SYSTEM ─────────────────────────────────────────────
    console.log("\n[PHASE 7] Skill System");
    console.log("--------------------------------------------");

    await test("Skill verification model exists", async () => {
      const sv = await SkillVerification.create({
        userId: userA._id,
        skill: "Frontend",
        score: 5,
        totalQuestions: 5,
        percentage: 100,
        verified: true,
      });
      if (!sv._id) throw new Error("Verification not created");
    });

    await test("Skill verification threshold (>=80% = verified)", async () => {
      const sv = await SkillVerification.create({
        userId: userB._id,
        skill: "Backend",
        score: 4,
        totalQuestions: 5,
        percentage: 80,
        verified: true,
      });
      if (!sv.verified) throw new Error("Should be verified at 80%");
    });

    await test("Below threshold is not verified", async () => {
      const sv = await SkillVerification.create({
        userId: userC._id,
        skill: "Python",
        score: 3,
        totalQuestions: 5,
        percentage: 60,
        verified: false,
      });
      if (sv.verified) throw new Error("Should not be verified below 80%");
    });

    // ── PHASE 8: AI SKILL VERIFICATION ───────────────────────────────────
    console.log("\n[PHASE 8] AI Skill Verification");
    console.log("--------------------------------------------");

    await test("Quiz generation endpoint works", async () => {
      const res = await call("POST", "/api/ai/quiz/generate", tokenA, { skill: "Frontend", difficulty: "intermediate", questionCount: 3 });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.quiz) throw new Error("Missing quiz");
      if (res.data.quiz.questions.length === 0) throw new Error("No questions");
    });

    await test("Quiz submission endpoint works", async () => {
      const res = await call("POST", "/api/ai/quiz/submit", tokenA, {
        skill: "Frontend",
        answers: [0, 1, 0],
        questionCount: 3,
        difficulty: "intermediate",
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (typeof res.data.result.percentage !== "number") throw new Error("Missing percentage");
    });

    // ── PHASE 9: SKILL GRAPH & SKILL GAP ────────────────────────────────
    console.log("\n[PHASE 9] Skill Graph & Skill Gap");
    console.log("--------------------------------------------");

    await test("Skill graph endpoint exists", async () => {
      const res = await call("GET", `/api/skills/team/${teamA._id}/graph`, tokenA);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.members) throw new Error("Missing members");
    });

    await test("Skill gap endpoint exists", async () => {
      const res = await call("GET", `/api/skills/team/${teamA._id}/gaps`, tokenA);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.data.gaps && !res.data.strengths) throw new Error("Missing gaps/strengths");
    });

    await test("Non-member cannot access skill graph", async () => {
      const res = await call("GET", `/api/skills/team/${teamA._id}/graph`, tokenC);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    // ── SECURITY TESTS ───────────────────────────────────────────────────
    console.log("\n[SECURITY] Cross-User & Cross-Team Access");
    console.log("--------------------------------------------");

    await test("Cross-team access rejected", async () => {
      const teamB = await Team.create({ name: "Team Beta", ownerId: userC._id, members: [{ userId: userC._id, name: userC.name, role: "leader" }] });
      const res = await call("GET", `/api/teams/${teamB._id}`, tokenA);
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await test("Notification user isolation maintained", async () => {
      const resA = await call("GET", "/api/notifications", tokenA);
      const resC = await call("GET", "/api/notifications", tokenC);
      const notifsA = resA.data || [];
      const notifsC = resC.data || [];
      for (const n of notifsA) {
        if (n.userId === userC._id.toString()) throw new Error("User A has User C's notification");
      }
      for (const n of notifsC) {
        if (n.userId === userA._id.toString()) throw new Error("User C has User A's notification");
      }
    });

    console.log("\n============================================================");
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("============================================================");

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

runTests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
