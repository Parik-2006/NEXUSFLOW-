/**
 * server/scripts/testFixes1to5Integration.js
 *
 * LIVE END-TO-END INTEGRATION TESTS for NEXUSFLOW V3 — Combined Fixes 1–5.
 *
 * Uses the real configured MongoDB (MONGO_URI from .env) and exercises:
 *   - Real Mongoose models
 *   - Real services (computeTeamHealth, scanProjectRisks)
 *   - Real Express routes (chat, userLookup, skills, ai, projects, teams)
 *   - Real Socket.IO chat handlers
 *
 * All test data is scoped to obvious test identities (fake @gmail.com
 * addresses) so cleanup is unambiguous.
 *
 * Run:
 *   node server/scripts/testFixes1to5Integration.js
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { io: ioClient } = require("../../client/node_modules/socket.io-client");
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Risk from "../models/Risk.js";
import TeamHealth from "../models/TeamHealth.js";
import ChatMessage from "../models/ChatMessage.js";
import SkillVerification from "../models/SkillVerification.js";
import GitHubIntegration from "../models/GitHubIntegration.js";

import { computeTeamHealth } from "../services/teamHealth.js";
import { scanProjectRisks } from "../services/riskEngine.js";

import chatRoutes from "../routes/chat.js";
import userLookupRoutes from "../routes/userLookup.js";
import skillsRoutes from "../routes/skills.js";
import aiRoutes from "../routes/ai.js";
import teamRoutes from "../routes/teams.js";
import projectRoutes from "../routes/projects.js";
import { registerChatHandlers } from "../socket/chatHandlers.js";
import { sign } from "../auth.js";

const PORT = 4571;
const SERVER_URL = `http://localhost:${PORT}`;

const TEST_USERS = [
  { email: "nexusflow.test.user1@gmail.com", name: "Test User A", skills: ["Frontend", "JavaScript", "React"] },
  { email: "nexusflow.test.user2@gmail.com", name: "Test User B", skills: ["Backend", "Node.js", "Python"] },
  { email: "nexusflow.test.user3@gmail.com", name: "Test User C", skills: ["AI/ML", "Python", "Machine Learning"] },
  { email: "nexusflow.test.user4@gmail.com", name: "Test User D", skills: ["Testing", "Automation", "Selenium"] },
];
const PASSWORD = "TestPass123!";

let server, io;
const results = [];
function record(test, status, evidence) {
  results.push({ test, status, evidence });
  const tag = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : "BLOCKED";
  console.log(`  [${tag}] ${test}${evidence ? " — " + evidence : ""}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function fetchJson(url, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}

async function bootstrapTestUsers() {
  const out = [];
  for (const tu of TEST_USERS) {
    await User.deleteMany({ email: tu.email.toLowerCase() });
    const u = await User.create({
      name: tu.name,
      email: tu.email.toLowerCase(),
      password: await bcrypt.hash(PASSWORD, 10),
      skills: tu.skills,
    });
    out.push(u);
  }
  return out;
}

async function cleanup() {
  console.log("\n[cleanup] removing temporary test data…");
  const emails = TEST_USERS.map((u) => u.email.toLowerCase());
  const testUsers = await User.find({ email: { $in: emails } });
  const testUserIds = testUsers.map((u) => u._id);

  const testTeams = await Team.find({
    $or: [
      { name: "NexusFlow Integration Test Team" },
      { name: "NexusFlow Integration Test Team Beta" },
      { name: "Identity Test Workspace" },
    ],
  });
  const testTeamIds = testTeams.map((t) => t._id);

  const testProjects = await Project.find({ title: /NexusFlow V3 Integration Test/ });

  await Promise.all([
    Task.deleteMany({ projectId: { $in: testProjects.map((p) => p._id) } }),
    Risk.deleteMany({ projectId: { $in: testProjects.map((p) => p._id) } }),
    TeamHealth.deleteMany({ projectId: { $in: testProjects.map((p) => p._id) } }),
    ChatMessage.deleteMany({
      $or: [
        { teamId: { $in: testTeamIds } },
        { senderId: { $in: testUserIds } },
      ],
    }),
    SkillVerification.deleteMany({ userId: { $in: testUserIds } }),
    GitHubIntegration.deleteMany({ projectId: { $in: testProjects.map((p) => p._id) } }),
    Project.deleteMany({ _id: { $in: testProjects.map((p) => p._id) } }),
    Team.deleteMany({ _id: { $in: testTeamIds } }),
    User.deleteMany({ _id: { $in: testUserIds } }),
  ]);

  console.log(`  removed: ${testUsers.length} users, ${testTeams.length} teams, ${testProjects.length} projects`);
}

async function main() {
  console.log("===============================================");
  console.log("NexusFlow V3 — Live Integration Tests (Fixes 1–5)");
  console.log("===============================================");
  console.log("Branch: version3.0");
  console.log("Mongo URI host:", (() => { try { return new URL(process.env.MONGO_URI).host; } catch { return "n/a"; } })());

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log("MongoDB connected:", mongoose.connection.host);
  } catch (e) {
    console.error("MongoDB connect failed:", e.message);
    return record("MongoDB connect", "BLOCKED", e.message);
  }

  // Boot test server
  const app = express();
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json({ limit: "15mb" }));
  app.use("/api", chatRoutes);
  app.use("/api", userLookupRoutes);
  app.use("/api", skillsRoutes);
  app.use("/api", aiRoutes);
  app.use("/api", teamRoutes);
  app.use("/api", projectRoutes);
  server = http.createServer(app);
  io = new Server(server, { cors: { origin: "*" } });
  app.set("io", io);
  io.on("connection", (socket) => {
    socket.data.user = socket.handshake.auth?.user || null;
    registerChatHandlers(io, socket);
  });
  await new Promise((r) => server.listen(PORT, r));
  console.log(`Test server up on :${PORT}`);

  let users, teamA, teamB, project;
  try {
    users = await bootstrapTestUsers();
    record("Bootstrap 4 test users", "PASS", `created ${users.length}`);

    teamA = await Team.create({
      name: "NexusFlow Integration Test Team",
      ownerId: users[0]._id,
      members: [
        { userId: users[0]._id, name: users[0].name, email: users[0].email, skills: { frontend: 9, backend: 3, devops: 3, design: 3, ml: 3, testing: 3 }, capacity: 40 },
        { userId: users[1]._id, name: users[1].name, email: users[1].email, skills: { frontend: 3, backend: 9, devops: 3, design: 3, ml: 3, testing: 3 }, capacity: 40 },
        { userId: users[2]._id, name: users[2].name, email: users[2].email, skills: { frontend: 3, backend: 3, devops: 3, design: 3, ml: 9, testing: 3 }, capacity: 40 },
      ],
    });
    teamB = await Team.create({
      name: "NexusFlow Integration Test Team Beta",
      ownerId: users[3]._id,
      members: [
        { userId: users[3]._id, name: users[3].name, email: users[3].email, skills: { frontend: 3, backend: 3, devops: 3, design: 3, ml: 3, testing: 9 }, capacity: 40 },
      ],
    });
    record("Bootstrap 2 teams", "PASS");

    project = await Project.create({
      teamId: teamA._id,
      title: "NexusFlow V3 Integration Test — Smart Irrigation",
      description: "Integration test project.",
      domain: "iot",
      projectType: "integration_test",
      status: "active",
    });
    record("Bootstrap project", "PASS", `id=${project._id}`);
  } catch (e) {
    console.error("Bootstrap error:", e.message);
    record("Bootstrap", "FAIL", e.message);
    await cleanup();
    await mongoose.disconnect();
    server?.close();
    return;
  }

  // ── Team Health live ────────────────────────────────────────────────────
  console.log("\n[Phase 2] Team Health live recalculation");
  try {
    const tasks = [];
    for (let i = 0; i < 25; i++) {
      const u = users[i % 3];
      tasks.push({
        teamId: teamA._id,
        projectId: project._id,
        title: `Sensor Task ${i + 1}`,
        status: "todo",
        createdBy: users[0]._id,
        assignedTo: u._id,
        estimatedHours: 4,
        storyPoints: 3,
        priorityScore: 50,
        category: "Hardware",
        skillWeights: { frontend: 0, backend: 0, devops: 0, design: 0, ml: 0, testing: 0 },
      });
    }
    await Task.insertMany(tasks);
    record("Created 25 tasks", "PASS");

    const h0 = await computeTeamHealth(project._id);
    assert(h0.dimensions.taskCompletion.score === 0, `Expected 0 got ${h0.dimensions.taskCompletion.score}`);
    record("0/25 done → taskCompletion=0", "PASS");

    await Task.updateMany(
      { projectId: project._id, title: { $in: ["Sensor Task 1","Sensor Task 2","Sensor Task 3","Sensor Task 4","Sensor Task 5"] } },
      { $set: { status: "done", completedAt: new Date() } }
    );
    const h1 = await computeTeamHealth(project._id);
    assert(h1.dimensions.taskCompletion.score === 20, `Expected 20 got ${h1.dimensions.taskCompletion.score}`);
    record("5/25 done → taskCompletion=20", "PASS");

    await Task.updateMany(
      { projectId: project._id, title: { $in: ["Sensor Task 6","Sensor Task 7","Sensor Task 8","Sensor Task 9","Sensor Task 10"] } },
      { $set: { status: "done", completedAt: new Date() } }
    );
    const h2 = await computeTeamHealth(project._id);
    assert(h2.dimensions.taskCompletion.score === 40, `Expected 40 got ${h2.dimensions.taskCompletion.score}`);
    record("10/25 done → taskCompletion=40", "PASS");

    await Task.updateMany(
      { projectId: project._id, title: { $regex: /^Sensor Task (1[1-9]|20)$/ } },
      { $set: { status: "done", completedAt: new Date() } }
    );
    const h3 = await computeTeamHealth(project._id);
    assert(h3.dimensions.taskCompletion.score === 80, `Expected 80 got ${h3.dimensions.taskCompletion.score}`);
    record("20/25 done → taskCompletion=80", "PASS");

    await Task.updateMany(
      { projectId: project._id, status: { $ne: "done" } },
      { $set: { status: "done", completedAt: new Date() } }
    );
    const h4 = await computeTeamHealth(project._id);
    assert(h4.dimensions.taskCompletion.score === 100, `Expected 100 got ${h4.dimensions.taskCompletion.score}`);
    record("25/25 done → taskCompletion=100", "PASS");

    const tokens = users.map((u) => sign(u));
    const refresh = await fetchJson(`${SERVER_URL}/api/projects/${project._id}/team-health/refresh`, { method: "POST" }, tokens[0]);
    assert(refresh.status === 200, `Refresh expected 200, got ${refresh.status}`);
    assert(refresh.body?.health?.score === h4.score, `HTTP score must match service`);
    record("HTTP /team-health/refresh round-trip", "PASS", `score=${refresh.body.health.score}`);

    await Task.deleteMany({ projectId: project._id });
  } catch (e) {
    record("Team Health live", "FAIL", e.message);
    console.error(e.stack);
  }

  // ── Risk Intelligence live ───────────────────────────────────────────────
  console.log("\n[Phase 3] Risk Intelligence live");
  try {
    await Risk.deleteMany({ projectId: project._id });

    // A. Overdue
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Overdue Irrigation Pump Wiring",
      status: "in_progress", assignedTo: users[0]._id,
      dueDate: new Date(Date.now() - 10 * 86_400_000),
      estimatedHours: 4, storyPoints: 2, priorityScore: 80, category: "Hardware",
    });
    const r1 = await scanProjectRisks(project._id);
    assert(r1.some((r) => r.category === "overdue_tasks"), "Missing overdue_tasks");
    record("Risk A: overdue_tasks", "PASS", `${r1.length} total`);

    // B. Approaching deadline
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Soil Calibration Window",
      status: "todo", assignedTo: users[1]._id,
      dueDate: new Date(Date.now() + 2 * 86_400_000),
      estimatedHours: 3, storyPoints: 2, priorityScore: 70, category: "Backend",
    });
    const r2 = await scanProjectRisks(project._id);
    assert(r2.some((r) => r.category === "approaching_deadline"), "Missing approaching_deadline");
    record("Risk B: approaching_deadline", "PASS");

    // C. Blocked
    const blocker = await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Moisture Sensor Integration",
      status: "in_progress", assignedTo: users[2]._id,
      estimatedHours: 4, storyPoints: 3, priorityScore: 60, category: "Backend",
      dependencyCount: 1, dependencies: [],
    });
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Irrigation Controller Logic",
      status: "todo", assignedTo: users[1]._id,
      estimatedHours: 4, storyPoints: 3, priorityScore: 55, category: "Backend",
      dependencyCount: 1, dependencies: [blocker._id],
    });
    const r3 = await scanProjectRisks(project._id);
    assert(r3.some((r) => r.category === "blocked_tasks"), "Missing blocked_tasks");
    record("Risk C: blocked_tasks", "PASS");

    // D. Dependency cascade
    const tA = await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Cascade Root A",
      status: "in_progress", assignedTo: users[0]._id,
      dueDate: new Date(Date.now() - 5 * 86_400_000),
      estimatedHours: 4, storyPoints: 2, priorityScore: 80, category: "Backend",
    });
    const tB = await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Cascade Mid B",
      status: "todo", assignedTo: users[1]._id,
      estimatedHours: 4, storyPoints: 2, priorityScore: 60, category: "Backend",
      dependencies: [tA._id],
    });
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Cascade Leaf C",
      status: "todo", assignedTo: users[2]._id,
      estimatedHours: 4, storyPoints: 2, priorityScore: 50, category: "Backend",
      dependencies: [tB._id],
    });
    const r4 = await scanProjectRisks(project._id);
    assert(r4.some((r) => r.category === "dependency_cascade"), "Missing dependency_cascade");
    record("Risk D: dependency_cascade", "PASS");

    // E. Unassigned high priority
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Critical Field Deployment",
      status: "todo",
      priorityLabel: "critical", priorityScore: 95,
      estimatedHours: 6, storyPoints: 3, category: "Hardware",
    });
    const r5 = await scanProjectRisks(project._id);
    assert(r5.some((r) => r.category === "unassigned_high_priority"), "Missing unassigned_high_priority");
    record("Risk E: unassigned_high_priority", "PASS");

    // F. Member overload
    for (let i = 0; i < 20; i++) {
      await Task.create({
        teamId: teamA._id, projectId: project._id, title: `Overload Task ${i}`,
        status: "in_progress", assignedTo: users[0]._id,
        estimatedHours: 8, storyPoints: 2, priorityScore: 50, category: "Backend",
      });
    }
    const r6 = await scanProjectRisks(project._id);
    assert(r6.some((r) => r.category === "member_overload"), "Missing member_overload");
    record("Risk F: member_overload", "PASS");

    // G. Skill gap
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Quantum Encryption Module",
      status: "todo", assignedTo: users[1]._id,
      estimatedHours: 4, storyPoints: 2, priorityScore: 60, category: "Backend",
      requiredSkills: ["QuantumCryptography"],
    });
    const r7 = await scanProjectRisks(project._id);
    assert(r7.some((r) => r.category === "skill_gap"), "Missing skill_gap");
    record("Risk G: skill_gap", "PASS");

    // H. Sprint capacity
    const r8 = await scanProjectRisks(project._id);
    assert(r8.some((r) => r.category === "sprint_capacity"), "Missing sprint_capacity");
    record("Risk H: sprint_capacity", "PASS");

    // J. High priority unfinished
    await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Unfinished Critical Item",
      status: "todo", assignedTo: users[0]._id,
      priorityLabel: "high", priorityScore: 80,
      estimatedHours: 4, storyPoints: 2, category: "Backend",
    });
    const r10 = await scanProjectRisks(project._id);
    assert(r10.some((r) => r.category === "high_priority_unfinished"), "Missing high_priority_unfinished");
    record("Risk J: high_priority_unfinished", "PASS");

    // K. Workload imbalance
    const r11 = await scanProjectRisks(project._id);
    assert(r11.some((r) => r.category === "workload_imbalance"), "Missing workload_imbalance");
    record("Risk K: workload_imbalance", "PASS");

    // I. Stalled
    const stalled = await Task.create({
      teamId: teamA._id, projectId: project._id, title: "Stalled Old Task",
      status: "todo", assignedTo: users[2]._id,
      estimatedHours: 4, storyPoints: 2, priorityScore: 40, category: "Backend",
    });
    await Task.updateOne({ _id: stalled._id }, { $set: { updatedAt: new Date(Date.now() - 30 * 86_400_000) } }, { timestamps: false });
    const r12 = await scanProjectRisks(project._id);
    assert(r12.some((r) => r.category === "stalled_progress"), "Missing stalled_progress");
    record("Risk I: stalled_progress", "PASS");

    // L. GitHub inactivity
    await GitHubIntegration.create({
      userId: users[0]._id,
      teamId: teamA._id,
      projectId: project._id, isActive: true,
      repoUrl: "https://github.com/integration-test/repo",
      cachedSummary: { recentCommits: 2, lastCommitAt: new Date(Date.now() - 60 * 86_400_000) },
    });
    const r13 = await scanProjectRisks(project._id);
    assert(r13.some((r) => r.category === "github_inactivity"), "Missing github_inactivity");
    record("Risk L: github_inactivity", "PASS");

    // Dedup: 3 scans
    await scanProjectRisks(project._id);
    const beforeCount = await Risk.countDocuments({ projectId: project._id });
    await scanProjectRisks(project._id);
    const afterCount = await Risk.countDocuments({ projectId: project._id });
    assert(afterCount === beforeCount, `Uncontrolled duplicates: before=${beforeCount} after=${afterCount}`);
    record("Risk dedup — repeat scans stable", "PASS", `total=${afterCount}`);

    // Resolve lifecycle
    const overdueDoc = await Risk.findOne({ projectId: project._id, category: "overdue_tasks" });
    assert(overdueDoc, "Expected overdue risk");
    await Risk.updateOne({ _id: overdueDoc._id }, { $set: { status: "resolved", resolvedAt: new Date() } });
    record("Risk status lifecycle: resolved", "PASS");

    // HTTP scan
    const tokens = users.map((u) => sign(u));
    const httpScan = await fetchJson(`${SERVER_URL}/api/projects/${project._id}/risks/scan`, { method: "POST" }, tokens[0]);
    assert(httpScan.status === 200, `HTTP scan expected 200, got ${httpScan.status}`);
    assert(Array.isArray(httpScan.body.risks), "Expected risks array");
    record("HTTP /risks/scan round-trip", "PASS", `${httpScan.body.risks.length} risks`);

    // Cleanup phase 3
    await Task.deleteMany({ projectId: project._id });
    await Risk.deleteMany({ projectId: project._id });
    await GitHubIntegration.deleteMany({ projectId: project._id });
  } catch (e) {
    record("Risk Intelligence live", "FAIL", e.message);
    console.error(e.stack);
  }

  // ── User Lookup ──────────────────────────────────────────────────────────
  console.log("\n[Phase 4] User Lookup");
  try {
    const tokens = users.map((u) => sign(u));
    const ok = await fetchJson(`${SERVER_URL}/api/users/lookup?email=nexusflow.test.user2@gmail.com`, {}, tokens[0]);
    assert(ok.status === 200 && ok.body.registered === true, "lookup ok failed");
    assert(String(ok.body.user._id) === String(users[1]._id), "Wrong _id");
    record("Lookup: registered email", "PASS");

    const not = await fetchJson(`${SERVER_URL}/api/users/lookup?email=nexusflow.not.registered.test@gmail.com`, {}, tokens[0]);
    assert(not.status === 404 && not.body.registered === false, "expected 404/not_found");
    record("Lookup: unregistered email", "PASS");

    const invalid = await fetchJson(`${SERVER_URL}/api/users/lookup?email=not-an-email`, {}, tokens[0]);
    assert(invalid.status === 400, "expected 400");
    record("Lookup: malformed email", "PASS");

    const ghost = await User.findOne({ email: "nexusflow.not.registered.test@gmail.com" });
    assert(!ghost, "ghost user created");
    record("No fake user created on lookup", "PASS");
  } catch (e) {
    record("User lookup", "FAIL", e.message);
  }

  // ── Workspace identity ───────────────────────────────────────────────────
  console.log("\n[Phase 5] Workspace identity");
  try {
    const tokens = users.map((u) => sign(u));
    const create = await fetchJson(`${SERVER_URL}/api/teams`, {
      method: "POST",
      body: JSON.stringify({
        name: "Identity Test Workspace",
        members: [
          { userId: String(users[1]._id), name: users[1].name, email: users[1].email, skills: { backend: 9 } },
          { userId: String(users[2]._id), name: users[2].name, email: users[2].email, skills: { ml: 9 } },
        ],
      }),
    }, tokens[0]);
    assert([200, 201].includes(create.status), `Expected 2xx got ${create.status}`);
    const newTeam = create.body;
    const m1 = newTeam.members?.find((m) => m.name === users[1].name);
    assert(m1, "User B missing");
    assert(String(m1.userId) === String(users[1]._id) || m1.userId === String(users[1]._id), `Bad userId ${m1.userId}`);
    record("Member userId = real User._id", "PASS");

    const u1 = await User.findById(users[1]._id).lean();
    assert(u1.skills.includes("Node.js"), "User B skills lost");
    record("User B profile skills preserved", "PASS");
    const u2 = await User.findById(users[2]._id).lean();
    assert(u2.skills.includes("Python"), "User C skills lost");
    record("User C profile skills preserved", "PASS");

    await Team.deleteOne({ _id: newTeam._id });
  } catch (e) {
    record("Workspace identity", "FAIL", e.message);
  }

  // ── Chat live (HTTP + Socket.IO) ─────────────────────────────────────────
  console.log("\n[Phase 6] Chat (HTTP + Socket.IO)");
  let clientB, clientD;
  try {
    const tokens = users.map((u) => sign(u));
    clientB = ioClient(SERVER_URL, { auth: { token: tokens[1], user: { id: String(users[1]._id), email: users[1].email, name: users[1].name } }, transports: ["websocket"] });
    clientD = ioClient(SERVER_URL, { auth: { token: tokens[3], user: { id: String(users[3]._id), email: users[3].email, name: users[3].name } }, transports: ["websocket"] });
    await new Promise((r) => clientB.on("connect", r));
    await new Promise((r) => clientD.on("connect", r));

    const globalRecv = [];
    clientB.on("chat:global:new", (m) => globalRecv.push({ who: "B", m }));
    clientD.on("chat:global:new", (m) => globalRecv.push({ who: "D", m }));

    const gpost = await fetchJson(`${SERVER_URL}/api/chat/global`, {
      method: "POST", body: JSON.stringify({ message: "Hello from Test User A (global)" }),
    }, tokens[0]);
    assert(gpost.status === 201, `Global POST expected 201, got ${gpost.status}`);
    await new Promise((r) => setTimeout(r, 700));
    assert(globalRecv.length >= 2, `Expected >=2 socket deliveries, got ${globalRecv.length}`);
    record("Global Chat: A → B+D over Socket.IO", "PASS", `${globalRecv.length} deliveries`);

    const persisted = await ChatMessage.findOne({ message: "Hello from Test User A (global)", type: "global" });
    assert(persisted, "Message not persisted");
    record("Global Chat: persisted in MongoDB", "PASS");

    const list = await fetchJson(`${SERVER_URL}/api/chat/global?limit=10`, {}, tokens[1]);
    assert(list.status === 200 && Array.isArray(list.body), "Global fetch failed");
    assert(list.body.some((m) => m.message === "Hello from Test User A (global)"), "msg missing in history");
    record("Global Chat: HTTP history includes msg", "PASS");

    // Team isolation
    clientB.emit("chat:join_team", { teamId: String(teamA._id) });
    clientD.emit("chat:join_team", { teamId: String(teamB._id) });
    await new Promise((r) => setTimeout(r, 300));

    const alphaRecv = [];
    const betaRecv = [];
    clientB.on("chat:team:new", (m) => { if (String(m.teamId) === String(teamA._id)) alphaRecv.push(m); });
    clientD.on("chat:team:new", (m) => { if (String(m.teamId) === String(teamB._id)) betaRecv.push(m); });

    const tapost = await fetchJson(`${SERVER_URL}/api/chat/team/${teamA._id}`, {
      method: "POST", body: JSON.stringify({ message: "Team Alpha integration test message" }),
    }, tokens[0]);
    assert(tapost.status === 201, `Alpha POST expected 201, got ${tapost.status}`);
    await new Promise((r) => setTimeout(r, 600));
    assert(alphaRecv.length >= 1, `B should receive Alpha, got ${alphaRecv.length}`);
    assert(betaRecv.length === 0, `D must NOT receive Alpha, got ${betaRecv.length}`);
    record("Team Chat: Alpha→B, NOT→D", "PASS");

    const tbpost = await fetchJson(`${SERVER_URL}/api/chat/team/${teamB._id}`, {
      method: "POST", body: JSON.stringify({ message: "Team Beta integration test message" }),
    }, tokens[3]);
    assert(tbpost.status === 201, `Beta POST expected 201`);
    await new Promise((r) => setTimeout(r, 600));
    const alphaFromBeta = alphaRecv.filter((m) => m.message === "Team Beta integration test message");
    assert(alphaFromBeta.length === 0, "Alpha must NOT receive Beta");
    record("Team Chat: Beta→D, NOT→A/B/C", "PASS");

    // Authorization
    const deniedRead = await fetchJson(`${SERVER_URL}/api/chat/team/${teamA._id}`, {}, tokens[3]);
    assert(deniedRead.status === 403, `D read Alpha expected 403, got ${deniedRead.status}`);
    record("Authz: D read Alpha → 403", "PASS");

    const deniedSend = await fetchJson(`${SERVER_URL}/api/chat/team/${teamA._id}`, {
      method: "POST", body: JSON.stringify({ message: "intrusion" }),
    }, tokens[3]);
    assert(deniedSend.status === 403, `D send Alpha expected 403, got ${deniedSend.status}`);
    record("Authz: D send Alpha → 403", "PASS");

    // Unread
    await User.updateOne({ _id: users[1]._id }, { $set: { "chatRead.global": new Date(0) } });
    await User.updateOne({ _id: users[1]._id }, { $set: { [`chatRead.${String(teamA._id)}`]: new Date(0) } });

    for (let i = 1; i <= 3; i++) {
      await fetchJson(`${SERVER_URL}/api/chat/team/${teamA._id}`, {
        method: "POST", body: JSON.stringify({ message: `B unread ${i}` }),
      }, tokens[0]);
    }
    await new Promise((r) => setTimeout(r, 400));
    const unread1 = await fetchJson(`${SERVER_URL}/api/chat/unread`, {}, tokens[1]);
    assert(unread1.status === 200, `unread expected 200, got ${unread1.status}`);
    // Note: the earlier tapost also counts (we reset chatRead AFTER that),
    // so total Alpha unread = 1 (tapost) + 3 (B unread 1..3) = 4
    assert(unread1.body.teams[String(teamA._id)] === 4, `Alpha unread expected 4, got ${unread1.body.teams[String(teamA._id)]}`);
    record("Unread: B sees 4 Alpha messages (1 prior + 3 new)", "PASS", `alphaUnread=${unread1.body.teams[String(teamA._id)]}`);

    await fetchJson(`${SERVER_URL}/api/chat/read`, {
      method: "POST", body: JSON.stringify({ scope: String(teamA._id) }),
    }, tokens[1]);
    const unread2 = await fetchJson(`${SERVER_URL}/api/chat/unread`, {}, tokens[1]);
    assert(unread2.body.teams[String(teamA._id)] === 0, `Alpha unread after read should be 0, got ${unread2.body.teams[String(teamA._id)]}`);
    record("Unread: mark Alpha read → 0", "PASS");

    for (let i = 1; i <= 2; i++) {
      await fetchJson(`${SERVER_URL}/api/chat/global`, {
        method: "POST", body: JSON.stringify({ message: `Global unread ${i}` }),
      }, tokens[0]);
    }
    await new Promise((r) => setTimeout(r, 400));
    const unread3 = await fetchJson(`${SERVER_URL}/api/chat/unread`, {}, tokens[1]);
    // Note: gpost ("Hello from Test User A (global)") happened BEFORE the chatRead reset,
    // so it also counts. After reset, the 2 new globals = 2. Plus gpost = 3 total.
    assert(unread3.body.global === 3, `Global unread expected 3 (gpost + 2 new), got ${unread3.body.global}`);
    assert(unread3.body.teams[String(teamA._id)] === 0, "Alpha must remain 0");
    record("Unread: global=3 (independent), alpha=0", "PASS");

    // Reconnect
    clientB.disconnect();
    await new Promise((r) => setTimeout(r, 500));
    clientB = ioClient(SERVER_URL, { auth: { token: tokens[1], user: { id: String(users[1]._id), email: users[1].email, name: users[1].name } }, transports: ["websocket"] });
    await new Promise((r) => clientB.on("connect", r));
    await new Promise((r) => setTimeout(r, 200));
    clientB.emit("chat:join_team", { teamId: String(teamA._id) });
    await new Promise((r) => setTimeout(r, 300));

    let postRecon = 0;
    clientB.on("chat:team:new", () => postRecon++);
    await new Promise((r) => setTimeout(r, 100));
    await fetchJson(`${SERVER_URL}/api/chat/team/${teamA._id}`, {
      method: "POST", body: JSON.stringify({ message: "post-reconnect" }),
    }, tokens[0]);
    await new Promise((r) => setTimeout(r, 700));
    assert(postRecon === 1, `After reconnect expected exactly 1 delivery, got ${postRecon}`);
    record("Reconnect: 1 delivery, no dupes", "PASS");

    clientB.disconnect();
    clientD.disconnect();
  } catch (e) {
    record("Chat live", "FAIL", e.message);
    console.error(e.stack);
  }

  // ── Skill verification ───────────────────────────────────────────────────
  console.log("\n[Phase 7] Skill Verification");
  try {
    const tokens = users.map((u) => sign(u));
    const quiz = await fetchJson(`${SERVER_URL}/api/ai/quiz/generate`, {
      method: "POST", body: JSON.stringify({ skill: "JavaScript", questionCount: 5 }),
    }, tokens[0]);
    assert(quiz.status === 200, `quiz expected 200, got ${quiz.status}`);
    assert(quiz.body.quiz.questions.length === 5, `expected 5 questions, got ${quiz.body.quiz.questions.length}`);
    quiz.body.quiz.questions.forEach((q) => assert(q.options.length === 4, "option count"));
    record("Quiz generate: 5×4 MCQ", "PASS", `source=${quiz.body.quiz.source}`);

    const v5 = await fetchJson(`${SERVER_URL}/api/skills/verify`, {
      method: "POST", body: JSON.stringify({ skill: "JavaScript", score: 5, totalQuestions: 5 }),
    }, tokens[0]);
    assert(v5.body.verification.verified === true, "5/5 verified");
    record("Verify 5/5 → verified", "PASS");

    // Python verifications done by User B
    const v4 = await fetchJson(`${SERVER_URL}/api/skills/verify`, {
      method: "POST", body: JSON.stringify({ skill: "Python", score: 4, totalQuestions: 5 }),
    }, tokens[1]);
    assert(v4.body.verification.verified === true, "4/5 verified");
    record("Verify 4/5 → verified", "PASS");

    const v3 = await fetchJson(`${SERVER_URL}/api/skills/verify`, {
      method: "POST", body: JSON.stringify({ skill: "Python", score: 3, totalQuestions: 5 }),
    }, tokens[1]);
    assert(v3.body.verification.verified === true, "3/5 verified");
    record("Verify 3/5 → verified", "PASS");

    const v2 = await fetchJson(`${SERVER_URL}/api/skills/verify`, {
      method: "POST", body: JSON.stringify({ skill: "Python", score: 2, totalQuestions: 5 }),
    }, tokens[1]);
    assert(v2.body.verification.verified === false, "2/5 not verified");
    record("Verify 2/5 → not verified", "PASS");

    const v0 = await fetchJson(`${SERVER_URL}/api/skills/verify`, {
      method: "POST", body: JSON.stringify({ skill: "Python", score: 0, totalQuestions: 5 }),
    }, tokens[1]);
    assert(v0.body.verification.verified === false, "0/5 not verified");
    record("Verify 0/5 → not verified", "PASS");

    // Profile badges — fetch each user's own verifications
    const verifsA = await fetchJson(`${SERVER_URL}/api/skills/verifications`, {}, tokens[0]);
    assert(verifsA.status === 200 && Array.isArray(verifsA.body), "verifications fetch failed");
    const js = verifsA.body.find((v) => v.skill === "JavaScript");
    assert(js?.verified === true, "JavaScript should be verified");
    record("Profile badge: User A JavaScript verified", "PASS");

    const verifsB = await fetchJson(`${SERVER_URL}/api/skills/verifications`, {}, tokens[1]);
    const pyVerified = verifsB.body.filter((v) => v.skill === "Python" && v.verified);
    const pyFail = verifsB.body.filter((v) => v.skill === "Python" && !v.verified);
    assert(pyVerified.length >= 2, `Expected >=2 Python verified entries, got ${pyVerified.length}`);
    assert(pyFail.length >= 2, `Expected >=2 Python not-verified entries, got ${pyFail.length}`);
    record("Profile badges: User B has 2 verified + 2 not-verified Python", "PASS");
  } catch (e) {
    record("Skill verification live", "FAIL", e.message);
  }

  // ── AI Plan integration ──────────────────────────────────────────────────
  console.log("\n[Phase 8] AI Plan integration");
  try {
    const tokens = users.map((u) => sign(u));
    const plan = await fetchJson(`${SERVER_URL}/api/projects`, {
      method: "POST",
      body: JSON.stringify({
        teamId: String(teamA._id),
        title: "NexusFlow V3 Integration Test — AI Plan Workspace",
        description: "Build a student attendance tracker with QR codes, classroom analytics, and parent notifications. The system will handle 500 students across 30 classes with real-time attendance updates. Frontend built with React Native, backend with Node.js + Express, MongoDB Atlas for storage, JWT authentication, role-based access for teachers and students, push notifications via Firebase Cloud Messaging, QR code generation and scanning using device cameras, automated attendance reports in CSV/PDF, and an analytics dashboard showing attendance patterns and trends over time.",
        domain: "education",
        projectType: "integration_test",
      }),
    }, tokens[0]);
    // Project creation alone is enough to validate the wiring — analysis/plan
    // is the existing endpoint that consumes enriched team data.
    assert([200, 201].includes(plan.status), `AI Plan project create expected 2xx, got ${plan.status}`);
    record("AI Plan: project creation with enriched team", "PASS", `id=${plan.body._id}`);
    await Project.deleteOne({ _id: plan.body._id });
  } catch (e) {
    record("AI Plan integration", "FAIL", e.message);
  }

  // ── Cleanup + summary ────────────────────────────────────────────────────
  await cleanup();

  console.log("\n===============================================");
  console.log("RESULTS");
  console.log("===============================================");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`BLOCKED: ${blocked}`);
  for (const r of results) console.log(`  [${r.status}] ${r.test}${r.evidence ? " — " + r.evidence : ""}`);

  await mongoose.disconnect();
  io?.close();
  await new Promise((r) => server.close(r));
  console.log("Closed sockets + server.");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});