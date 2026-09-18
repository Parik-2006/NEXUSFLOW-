/**
 * server/scripts/testWorkstreams21to25ApiSuite.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAMS 21–25 REST API & AUTHORIZATION TEST SUITE
 *
 * Verifies all new HTTP endpoints with JWT auth, role authorization,
 * project isolation, and IDOR prevention.
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import http from "http";
import express from "express";
import cors from "cors";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ProjectLesson from "../models/ProjectLesson.js";
import EarlyWarning from "../models/EarlyWarning.js";
import DecisionRecord from "../models/DecisionRecord.js";
import CapabilityProfile from "../models/CapabilityProfile.js";
import { sign } from "../auth.js";
import workstreams21to25Routes from "../routes/workstreams21to25.js";

const PORT = 4055;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";

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

async function runApiSuite() {
  console.log("\n" + "=".repeat(70));
  console.log("   NEXUSFLOW V4: WORKSTREAMS 21–25 REST API & SECURITY SUITE");
  console.log("=".repeat(70) + "\n");

  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected to MongoDB.");

  // Spin up test server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", workstreams21to25Routes);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(PORT, res));
  console.log(`[HTTP] Test server listening on port ${PORT}.\n`);

  const ts = Date.now();
  let userLeader, userMember, userIntruder;
  let teamA, projectA, teamB, projectB;
  let tokenLeader, tokenMember, tokenIntruder;

  try {
    // ── Setup Users & Tokens ─────────────────────────────────────────────────
    userLeader = await User.create({
      name: `Leader ${ts}`,
      email: `lead_${ts}@api.com`,
      password: "Password123!",
      role: "member",
    });

    userMember = await User.create({
      name: `Member ${ts}`,
      email: `mem_${ts}@api.com`,
      password: "Password123!",
      role: "member",
    });

    userIntruder = await User.create({
      name: `Intruder ${ts}`,
      email: `int_${ts}@api.com`,
      password: "Password123!",
      role: "member",
    });

    teamA = await Team.create({
      name: `Team A ${ts}`,
      ownerId: userLeader._id,
      members: [
        { userId: userLeader._id, name: userLeader.name, role: "leader" },
        { userId: userMember._id, name: userMember.name, role: "member" },
      ],
    });

    teamB = await Team.create({
      name: `Team B ${ts}`,
      ownerId: userIntruder._id,
      members: [{ userId: userIntruder._id, name: userIntruder.name, role: "leader" }],
    });

    projectA = await Project.create({
      teamId: teamA._id,
      title: "Project Alpha",
      methodology: "SCRUM",
    });

    projectB = await Project.create({
      teamId: teamB._id,
      title: "Project Beta",
      methodology: "WATERFALL",
    });

    tokenLeader = sign(userLeader);
    tokenMember = sign(userMember);
    tokenIntruder = sign(userIntruder);

    // Seed tasks in Project A
    const t1 = await Task.create({
      projectId: projectA._id,
      teamId: teamA._id,
      title: "Task Alpha 1",
      status: "done",
      category: "Backend",
      estimatedHours: 5,
      actualHours: 15,
      assignedTo: userLeader._id,
    });

    const t2 = await Task.create({
      projectId: projectA._id,
      teamId: teamA._id,
      title: "Task Alpha 2",
      status: "done",
      category: "Backend",
      estimatedHours: 5,
      actualHours: 16,
      assignedTo: userLeader._id,
    });

    const openTask = await Task.create({
      projectId: projectA._id,
      teamId: teamA._id,
      title: "Open Backend Architecture Task",
      status: "todo",
      category: "Backend",
      estimatedHours: 8,
    });

    const BASE = `http://localhost:${PORT}/api`;

    // =========================================================================
    // API TEST 1: WORKSTREAM 21 — LESSONS ENDPOINTS
    // =========================================================================
    console.log("[API 1] Testing Workstream 21 Endpoints...");

    // POST /api/projects/:projectId/lessons/generate
    const genRes = await fetch(`${BASE}/projects/${projectA._id}/lessons/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenLeader}` },
    });
    assert(genRes.status === 201, "POST /lessons/generate returns 201 Created");
    const genData = await genRes.json();
    assert(genData.success === true && genData.count >= 1, "Generated lesson candidate returned");
    const lessonCandidate = genData.candidates[0];

    // GET /api/projects/:projectId/lessons
    const getRes = await fetch(`${BASE}/projects/${projectA._id}/lessons`, {
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(getRes.status === 200, "GET /lessons accessible to team member");
    const getData = await getRes.json();
    assert(getData.lessons.length >= 1, "Returns project lessons list");

    // Security check: Unauthorized member cannot validate lesson
    const unauthValRes = await fetch(`${BASE}/projects/${projectA._id}/lessons/${lessonCandidate._id}/validate`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenMember}`,
      },
      body: JSON.stringify({ approved: true }),
    });
    assert(unauthValRes.status === 403, "SECURITY: Team member (non-leader) cannot validate lesson (403 Forbidden)");

    // Leader validates lesson
    const valRes = await fetch(`${BASE}/projects/${projectA._id}/lessons/${lessonCandidate._id}/validate`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenLeader}`,
      },
      body: JSON.stringify({ approved: true, notes: "Approved by lead" }),
    });
    assert(valRes.status === 200, "Leader successfully validates lesson (200 OK)");

    // Apply lesson
    const applyRes = await fetch(`${BASE}/projects/${projectA._id}/lessons/${lessonCandidate._id}/apply`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenLeader}`,
      },
      body: JSON.stringify({ notes: "Applied to next sprint" }),
    });
    assert(applyRes.status === 200, "PATCH /lessons/:id/apply succeeds");

    // Reusable lessons endpoint
    const reRes = await fetch(`${BASE}/lessons/reusable`, {
      headers: { Authorization: `Bearer ${tokenLeader}` },
    });
    assert(reRes.status === 200, "GET /lessons/reusable returns 200 OK");

    // =========================================================================
    // API TEST 2: WORKSTREAM 22 — CAPABILITY & ASSIGNMENT ENDPOINTS
    // =========================================================================
    console.log("\n[API 2] Testing Workstream 22 Endpoints...");

    // GET /api/projects/:projectId/capability-overview
    const capRes = await fetch(`${BASE}/projects/${projectA._id}/capability-overview`, {
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(capRes.status === 200, "GET /capability-overview returns 200 OK");
    const capData = await capRes.json();
    assert(Array.isArray(capData.coverage), "Returns capability coverage array");

    // GET /api/projects/:projectId/assignment/preview
    const prevRes = await fetch(`${BASE}/projects/${projectA._id}/assignment/preview`, {
      headers: { Authorization: `Bearer ${tokenLeader}` },
    });
    assert(prevRes.status === 200, "GET /assignment/preview returns 200 OK");
    const prevData = await prevRes.json();
    assert(prevData.advisoryOnly === true, "AdvisoryOnly flag exposed in API response");

    // POST /api/projects/:projectId/assignment/accept
    const accRes = await fetch(`${BASE}/projects/${projectA._id}/assignment/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenLeader}`,
      },
      body: JSON.stringify({ taskId: openTask._id, newAssigneeId: userLeader._id }),
    });
    assert(accRes.status === 200, "POST /assignment/accept returns 200 OK for leader");

    // Security check: non-leader cannot accept assignment
    const unauthAccRes = await fetch(`${BASE}/projects/${projectA._id}/assignment/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenMember}`,
      },
      body: JSON.stringify({ taskId: openTask._id, newAssigneeId: userMember._id }),
    });
    assert(unauthAccRes.status === 403, "SECURITY: Team member cannot accept assignment changes (403 Forbidden)");

    // =========================================================================
    // API TEST 3: WORKSTREAM 23 — EXPLAINABLE DECISIONS ENDPOINTS
    // =========================================================================
    console.log("\n[API 3] Testing Workstream 23 Endpoints...");

    // POST /api/projects/:projectId/decisions/explain/task-priority/:taskId
    const prioRes = await fetch(`${BASE}/projects/${projectA._id}/decisions/explain/task-priority/${openTask._id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(prioRes.status === 200, "POST /decisions/explain/task-priority returns 200 OK");
    const prioData = await prioRes.json();
    assert(prioData.decisionId != null, "Returns generated decisionId");

    // POST /api/projects/:projectId/decisions/explain/counterfactual
    const cfRes = await fetch(`${BASE}/projects/${projectA._id}/decisions/explain/counterfactual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenMember}`,
      },
      body: JSON.stringify({ decisionId: prioData.decisionId, parameter: "urgency", modifiedValue: 5 }),
    });
    assert(cfRes.status === 200, "POST /decisions/explain/counterfactual returns 200 OK");

    // =========================================================================
    // API TEST 4: WORKSTREAM 24 — HEALTH 2.0 & EARLY WARNING ENDPOINTS
    // =========================================================================
    console.log("\n[API 4] Testing Workstream 24 Endpoints...");

    // GET /api/projects/:projectId/health-v2
    const h2Res = await fetch(`${BASE}/projects/${projectA._id}/health-v2`, {
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(h2Res.status === 200, "GET /health-v2 returns 200 OK");
    const h2Data = await h2Res.json();
    assert(h2Data.dimensions.length === 9, "Returns all 9 health dimensions over HTTP API");

    // GET /api/projects/:projectId/warnings
    const warnRes = await fetch(`${BASE}/projects/${projectA._id}/warnings`, {
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(warnRes.status === 200, "GET /warnings returns 200 OK");

    // Seed test warning to test acknowledge and resolve
    const testWarn = await EarlyWarning.create({
      projectId: projectA._id,
      teamId: teamA._id,
      fingerprint: `${projectA._id}:SCHEDULE:CRITICAL_PATH_DELAY:test`,
      category: "SCHEDULE",
      triggerClass: "CRITICAL_PATH_DELAY",
      severity: "HIGH",
      title: "API Test Warning",
      message: "Test message",
      status: "OPEN",
    });

    // PATCH /api/projects/:projectId/warnings/:warningId/acknowledge
    const ackRes = await fetch(`${BASE}/projects/${projectA._id}/warnings/${testWarn._id}/acknowledge`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenMember}` },
    });
    assert(ackRes.status === 200, "PATCH /warnings/:id/acknowledge returns 200 OK");

    // PATCH /api/projects/:projectId/warnings/:warningId/resolve
    const resRes = await fetch(`${BASE}/projects/${projectA._id}/warnings/${testWarn._id}/resolve`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenLeader}`,
      },
      body: JSON.stringify({ reason: "Resolved through test" }),
    });
    assert(resRes.status === 200, "PATCH /warnings/:id/resolve returns 200 OK");

    // =========================================================================
    // API TEST 5: SECURITY & IDOR ISOLATION
    // =========================================================================
    console.log("\n[API 5] Testing Security Isolation & IDOR Protection...");

    // Intruder attempts to view Project A's health
    const idorHealthRes = await fetch(`${BASE}/projects/${projectA._id}/health-v2`, {
      headers: { Authorization: `Bearer ${tokenIntruder}` },
    });
    assert(idorHealthRes.status === 403, "IDOR GUARD: Intruder from Project B blocked from Project A health (403 Forbidden)");

    // Intruder attempts to view Project A's lessons
    const idorLessonsRes = await fetch(`${BASE}/projects/${projectA._id}/lessons`, {
      headers: { Authorization: `Bearer ${tokenIntruder}` },
    });
    assert(idorLessonsRes.status === 403, "IDOR GUARD: Intruder from Project B blocked from Project A lessons (403 Forbidden)");

    // Intruder attempts to accept assignment in Project A
    const idorAssignRes = await fetch(`${BASE}/projects/${projectA._id}/assignment/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenIntruder}`,
      },
      body: JSON.stringify({ taskId: openTask._id, newAssigneeId: userIntruder._id }),
    });
    assert(idorAssignRes.status === 403, "IDOR GUARD: Intruder from Project B blocked from accepting assignments in Project A (403 Forbidden)");

    // Request without token
    const noAuthRes = await fetch(`${BASE}/projects/${projectA._id}/health-v2`);
    assert(noAuthRes.status === 401, "AUTH GUARD: Unauthenticated request rejected (401 Unauthorized)");

  } finally {
    console.log("\n[CLEANUP] Stopping HTTP test server and cleaning database records...");
    await new Promise((r) => server.close(r));
    if (userLeader) await User.findByIdAndDelete(userLeader._id);
    if (userMember) await User.findByIdAndDelete(userMember._id);
    if (userIntruder) await User.findByIdAndDelete(userIntruder._id);
    if (teamA) await Team.findByIdAndDelete(teamA._id);
    if (teamB) await Team.findByIdAndDelete(teamB._id);
    if (projectA) {
      await Project.findByIdAndDelete(projectA._id);
      await Task.deleteMany({ projectId: projectA._id });
      await ProjectLesson.deleteMany({ projectId: projectA._id });
      await EarlyWarning.deleteMany({ projectId: projectA._id });
      await DecisionRecord.deleteMany({ projectId: projectA._id });
      await CapabilityProfile.deleteMany({ projectId: projectA._id });
    }
    if (projectB) {
      await Project.findByIdAndDelete(projectB._id);
      await Task.deleteMany({ projectId: projectB._id });
    }
    await mongoose.disconnect();
    console.log("[DB] Disconnected cleanly.\n");
  }

  console.log("=".repeat(70));
  console.log(`API & SECURITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(70) + "\n");

  if (failed > 0) process.exit(1);
}

runApiSuite().catch((err) => {
  console.error("Fatal API test error:", err);
  process.exit(1);
});
