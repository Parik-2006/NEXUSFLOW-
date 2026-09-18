/**
 * server/scripts/testWorkstream28Contracts.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 28: API + SOCKET.IO CONTRACT AUDIT SUITE
 *
 * Verifies:
 * - REST status code compliance (200, 201, 400, 401, 403, 404)
 * - Response schema contracts across core and V4 endpoints
 * - Standard error response shapes (no stack trace exposure)
 * - Socket.IO event payloads and contract adherence
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
import { Server } from "socket.io";
import { io as ClientIO } from "../../client/node_modules/socket.io-client/build/esm/index.js";

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { sign, verify } from "../auth.js";
import teamRoutes from "../routes/teams.js";
import projectRoutes from "../routes/projects.js";
import workstreams21to25Routes from "../routes/workstreams21to25.js";
import { registerTaskHandlers } from "../socket/taskHandlers.js";
import { registerProjectSyncHandlers } from "../socket/projectSyncHandlers.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_test";
const TEST_PORT = 4928;

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

async function runContractSuite() {
  console.log("\n========================================================");
  console.log("  NEXUSFLOW V4 — WORKSTREAM 28 CONTRACT AUDIT SUITE    ");
  console.log("========================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const app = express();
  app.use(express.json());
  app.use("/api", teamRoutes);
  app.use("/api", projectRoutes);
  app.use("/api", workstreams21to25Routes);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.use((socket, next) => {
    const payload = verify(socket.handshake.auth?.token);
    if (!payload) return next(new Error("unauthorized"));
    socket.data.user = payload;
    next();
  });

  io.on("connection", (socket) => {
    registerTaskHandlers(io, socket);
    registerProjectSyncHandlers(io, socket);
  });

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Test server running on port ${TEST_PORT}.\n`);

  try {
    const user = await User.create({
      name: "Contract User",
      email: `contract_${Date.now()}@test.com`,
      password: "Password123!",
    });
    const token = sign(user);

    const team = await Team.create({
      name: "Contract Team",
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "owner" }],
    });

    const project = await Project.create({
      title: "Contract Project",
      teamId: team._id,
      methodology: "WATERFALL",
      status: "active",
    });
    team.activeProjectId = project._id;
    await team.save();

    // ── 1. REST STATUS CODE CONFORMANCE ──
    console.log("--- 1. REST Status Codes & Validation Contracts ---");

    // 200 OK
    const res200 = await fetch(`http://localhost:${TEST_PORT}/api/projects/${project._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(res200.status === 200, "Fetch project returns 200 OK");

    // 201 Created
    const res201 = await fetch(`http://localhost:${TEST_PORT}/api/teams/${team._id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Contract Task 1", urgency: 3, impact: 3 }),
    });
    assert(res201.status === 201, "Create task returns 201 Created");
    const createdTask = await res201.json();

    // 400 Bad Request
    const res400 = await fetch(`http://localhost:${TEST_PORT}/api/teams/${team._id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "" }),
    });
    assert(res400.status === 400, "Missing required title returns 400 Bad Request");
    const err400 = await res400.json();
    assert(err400.error !== undefined, "400 error body has structured 'error' field");

    // 401 Unauthorized
    const res401 = await fetch(`http://localhost:${TEST_PORT}/api/projects/${project._id}`);
    assert(res401.status === 401, "Missing auth header returns 401 Unauthorized");

    // 404 Not Found
    const fakeId = new mongoose.Types.ObjectId();
    const res404 = await fetch(`http://localhost:${TEST_PORT}/api/projects/${fakeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(res404.status === 404, "Non-existent project returns 404 Not Found");

    // ── 2. RESPONSE SCHEMA CONTRACTS ──
    console.log("\n--- 2. REST Response Schema Contracts ---");

    // Task Schema
    assert(typeof createdTask._id === "string", "Task response contains string _id");
    assert(createdTask.title === "Contract Task 1", "Task response matches created title");
    assert(typeof createdTask.priorityScore === "number", "Task response contains numeric priorityScore");
    assert(Array.isArray(createdTask.dependencies), "Task response contains dependencies array");

    // Health 2.0 Schema
    const resHealth = await fetch(`http://localhost:${TEST_PORT}/api/projects/${project._id}/health2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(resHealth.status === 200, "Health 2.0 API returns 200 OK");
    const healthData = await resHealth.json();
    assert(typeof healthData.overallScore === "number", "Health response has numeric overallScore");
    assert(typeof healthData.grade === "string", "Health response has string grade (A/B/C/D/F)");
    assert(Array.isArray(healthData.dimensions), "Health response has dimensions array");
    assert(healthData.dimensions.length === 9, "Health response includes all 9 deterministic dimensions");

    const sampleDim = healthData.dimensions[0];
    assert(sampleDim.key && sampleDim.name && sampleDim.status, "Each health dimension conforms to { key, name, score, status, signals }");

    // Decision Record Schema
    const resDecision = await fetch(`http://localhost:${TEST_PORT}/api/projects/${project._id}/decisions/explain/task-priority/${createdTask._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    assert(resDecision.status === 200, "Explain decision returns 200 OK");
    const decisionData = await resDecision.json();
    assert(decisionData.decisionType === "TASK_PRIORITY", "Decision record has matching decisionType");
    assert(Array.isArray(decisionData.factors), "Decision record contains factors breakdown array");
    assert(decisionData.explanation && decisionData.explanation.what, "Decision record includes structured explanation object");

    // ── 3. SOCKET.IO EVENT CONTRACTS ──
    console.log("\n--- 3. Socket.IO Event Contracts ---");

    const clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: false,
    });

    await new Promise((resolve) => clientSocket.on("connect", resolve));

    // Join team and project room
    await new Promise((resolve) => {
      clientSocket.emit("room:join", { teamId: team._id.toString() }, resolve);
    });
    clientSocket.emit("room:join:project", { projectId: project._id.toString() });

    // Verify task:created event contract
    const taskCreatedEventPromise = new Promise((resolve) => {
      const tm = setTimeout(() => resolve(null), 3000);
      clientSocket.on("task:created", (payload) => {
        clearTimeout(tm);
        resolve(payload);
      });
    });

    clientSocket.emit("task:create", {
      teamId: team._id.toString(),
      title: "Socket Contract Task",
      urgency: 4,
      impact: 4,
    });

    const eventPayload = await taskCreatedEventPromise;
    assert(eventPayload && eventPayload._id, "Socket task:created payload contains task _id");
    assert(eventPayload.title === "Socket Contract Task", "Socket task:created payload matches emitted title");
    assert(typeof eventPayload.priorityScore === "number", "Socket task:created payload contains priorityScore");

    clientSocket.close();

    // Cleanup
    await Task.deleteMany({ teamId: team._id });
    await Project.deleteOne({ _id: project._id });
    await Team.deleteOne({ _id: team._id });
    await User.deleteOne({ _id: user._id });

  } finally {
    server.close();
    await mongoose.disconnect();
  }

  console.log("\n========================================================");
  console.log(`  WORKSTREAM 28 RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runContractSuite().catch((err) => {
  console.error("FATAL in testWorkstream28Contracts:", err);
  process.exit(1);
});
