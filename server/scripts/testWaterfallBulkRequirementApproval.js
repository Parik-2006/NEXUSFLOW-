/**
 * testWaterfallBulkRequirementApproval.js
 * -----------------------------------------------------------------------------
 * Verification Suite for NEXUSFLOW V4:
 * Waterfall Bulk Requirement Approval, Edit/Delete Persistence, and Task Generation.
 */

import mongoose from "mongoose";
import http from "http";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { sign } from "../auth.js";

const MONGO_URI = process.env.MONGO_URI;
const API_PORT = 4000;

let passedCount = 0;
let failedCount = 0;

function pass(testName, detail = "") {
  console.log(`  [PASS] ${testName}${detail ? ` (${detail})` : ""}`);
  passedCount++;
}

function fail(testName, error) {
  console.error(`  [FAIL] ${testName}: ${error.message || error}`);
  failedCount++;
}

function apiRequest({ method = "GET", path: reqPath, token = null, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "127.0.0.1",
      port: API_PORT,
      path: reqPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch (e) {
          data = raw;
        }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runSuite() {
  console.log("================================================================================");
  console.log("NEXUSFLOW V4: WATERFALL BULK REQUIREMENT APPROVAL & TASK SYNC TEST SUITE");
  console.log("================================================================================");

  const MONGO_URI = process.env.MONGO_URI;
  await mongoose.connect(MONGO_URI);
  console.log(" Connected to MongoDB successfully.\n");

  const runId = Date.now();
  const testUser = await User.create({
    name: "Requirements Admin",
    email: `reqadmin_${runId}@example.com`,
    password: "Password123!",
    role: "admin",
  });
  const validToken = sign({ id: testUser._id.toString(), email: testUser.email, name: testUser.name, role: "admin" });

  const viewerUser = await User.create({
    name: "Viewer Member",
    email: `reqviewer_${runId}@example.com`,
    password: "Password123!",
    role: "viewer",
  });
  const viewerToken = sign({ id: viewerUser._id.toString(), email: viewerUser.email, name: viewerUser.name, role: "viewer" });

  const testTeam = await Team.create({
    name: `Waterfall Requirements Team ${runId}`,
    ownerId: testUser._id,
    members: [
      { userId: testUser._id, role: "lead", name: testUser.name },
      { userId: viewerUser._id, role: "member", name: viewerUser.name },
    ],
  });

  // Create Project with 21 Waterfall requirements across 5 phases
  const phases = ["requirements", "design", "implementation", "testing", "deployment"];
  const initialRequirements = [];
  for (let i = 1; i <= 21; i++) {
    const p = phases[(i - 1) % phases.length];
    initialRequirements.push({
      reqId: `REQ-${String(i).padStart(2, "0")}`,
      title: `System Specification Requirement ${i}`,
      description: `Detailed acceptance and functional requirements criteria for requirement ${i}.`,
      phase: p,
      academicValue: 8,
      criticality: 7,
      businessValue: 7,
      estimatedHours: 10 + (i % 8),
      status: "draft",
      requiredSkills: ["Engineering", "DAA"],
      dependencies: i > 1 ? [`REQ-${String(i - 1).padStart(2, "0")}`] : [],
      priorityScore: 50 + (i % 40),
    });
  }

  const project = await Project.create({
    title: `PhishGuard Waterfall Requirements ${runId}`,
    teamId: testTeam._id,
    methodology: "WATERFALL",
    waterfallPhase: "requirements",
    artifacts: [
      {
        name: "Authoritative SRS Specification v1",
        artifactType: "srs",
        scope: "persistent",
        content: "# System SRS\nAuthoritative specification defining security rules and data pipeline.",
        approvalStatus: "approved",
      },
    ],
    requirements: initialRequirements,
    waterfallPlanLifecycle: {
      status: "PLAN_REVIEW_REQUIRED",
      artifactAnalysisRevision: 1,
      documentReadinessConfirmed: false,
      conflicts: [],
    },
  });

  // Project B for isolation check
  const projectB = await Project.create({
    title: `Project B Isolation ${runId}`,
    teamId: testTeam._id,
    methodology: "WATERFALL",
    requirements: [
      { reqId: "REQ-B1", title: "Project B Draft Requirement", status: "draft", phase: "requirements" },
    ],
  });

  try {
    console.log("--- 1. INITIAL REQUIREMENTS STATE & READINESS CHECK ---");

    // Test 1: Verify 21 requirements present in draft status
    const initialP = await Project.findById(project._id);
    assert.strictEqual(initialP.requirements.length, 21, "Expected 21 initial requirements");
    const allDraft = initialP.requirements.every(r => r.status === "draft");
    assert(allDraft, "All initial requirements should be in draft status");
    pass("Test 1: Project initialized with 21 draft requirements across phases");

    // Test 2: Unapproved requirements block finalization in calculateWaterfallReadiness
    const rRes = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert(rRes.status === 200, "Expected 200 from readiness endpoint");
    assert.strictEqual(rRes.data.readiness?.isReady, false, "Expected isReady to be false");
    const reqBlocker = rRes.data.readiness?.blockers?.find(b => b.includes("requirement(s) before finalization"));
    assert(reqBlocker, "Expected blocker mentioning unapproved requirements");
    pass("Test 2: Unapproved requirements correctly block plan finalization", reqBlocker);

    console.log("\n--- 2. BULK REQUIREMENT APPROVAL (APPROVE ALL) ---");

    // Test 3: Bulk approval endpoint approves all 21 remaining requirements
    const bulkRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/requirements/approve-all`,
      token: validToken,
    });
    assert.strictEqual(bulkRes.status, 200, "Bulk approval should return 200");
    assert.strictEqual(bulkRes.data.totalCount, 21, "Total count should be 21");
    assert.strictEqual(bulkRes.data.newlyApprovedCount, 21, "Newly approved count should be 21");
    assert.strictEqual(bulkRes.data.previouslyApproved, 0, "Previously approved count should be 0");

    const pAfterBulk = await Project.findById(project._id);
    const allApproved = pAfterBulk.requirements.every(r => r.status === "approved" && r.approvedAt && r.approvedBy);
    assert(allApproved, "All requirements must be persisted with status approved and audit metadata");
    pass("Test 3: Bulk approve endpoint approved all 21 requirements with audit metadata");

    // Test 4: Idempotent bulk approval handles already-approved requirements safely
    const repeatBulk = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/requirements/approve-all`,
      token: validToken,
    });
    assert.strictEqual(repeatBulk.status, 200);
    assert.strictEqual(repeatBulk.data.newlyApprovedCount, 0, "Repeat approve should have 0 newly approved");
    assert.strictEqual(repeatBulk.data.previouslyApproved, 21, "Previously approved count should be 21");
    pass("Test 4: Repeat bulk approval is idempotent and does not corrupt records");

    // Test 5: Project isolation: Project B requirements remain in draft
    const pBAfter = await Project.findById(projectB._id);
    assert.strictEqual(pBAfter.requirements[0].status, "draft", "Project B requirement must remain in draft");
    pass("Test 5: Project isolation strictly preserved (Project B unaffected)");

    console.log("\n--- 3. EDITING, DELETING & APPROVAL INVALIDATION ---");

    // Test 6: Editing a requirement resets its status to 'draft' and invalidates approval
    const reqToEdit = pAfterBulk.requirements[0];
    const editRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/requirements/${reqToEdit.reqId}`,
      token: validToken,
      body: {
        title: "Edited Requirement: Hardware Sensor Calibration Module",
        description: "Updated acceptance criteria requiring sensor latency under 50ms.",
        estimatedHours: 24,
      },
    });
    assert.strictEqual(editRes.status, 200);
    const pAfterEdit = await Project.findById(project._id);
    const edited = pAfterEdit.requirements.find(r => r.reqId === reqToEdit.reqId);
    assert.strictEqual(edited.status, "draft", "Edited requirement status must reset to draft");
    assert.strictEqual(edited.approvedAt, null, "approvedAt must be reset to null");
    assert.strictEqual(edited.title, "Edited Requirement: Hardware Sensor Calibration Module");
    assert.strictEqual(edited.estimatedHours, 24);
    pass("Test 6: Editing an approved requirement resets its status to draft and invalidates approval");

    // Test 7: Unapproved edited requirement re-blocks finalization
    const rResAfterEdit = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert.strictEqual(rResAfterEdit.data.readiness?.isReady, false);
    const editBlocker = rResAfterEdit.data.readiness?.blockers?.find(b => b.includes("1 requirement(s)"));
    assert(editBlocker, "Must block finalization with 1 unapproved requirement");
    pass("Test 7: Unapproved edited requirement dynamically re-blocks finalization", editBlocker);

    // Test 8: Deleting an unwanted requirement removes it from MongoDB and updates counts
    const reqToDelete = pAfterBulk.requirements[20]; // 21st requirement
    const delRes = await apiRequest({
      method: "DELETE",
      path: `/api/projects/${project._id}/requirements/${reqToDelete.reqId}`,
      token: validToken,
    });
    assert.strictEqual(delRes.status, 200);
    const pAfterDel = await Project.findById(project._id);
    assert.strictEqual(pAfterDel.requirements.length, 20, "Expected 20 requirements after deletion");
    assert(!pAfterDel.requirements.some(r => r.reqId === reqToDelete.reqId), "Deleted requirement must be removed");
    pass("Test 8: Deleted requirement is completely removed from project requirements (21 -> 20)");

    // Test 9: Mixed approval: bulk approve remaining 1 draft requirement (19 approved, 1 draft)
    const mixedBulk = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/requirements/approve-all`,
      token: validToken,
    });
    assert.strictEqual(mixedBulk.status, 200);
    assert.strictEqual(mixedBulk.data.totalCount, 20);
    assert.strictEqual(mixedBulk.data.previouslyApproved, 19);
    assert.strictEqual(mixedBulk.data.newlyApprovedCount, 1);
    const pAfterMixed = await Project.findById(project._id);
    const all20Approved = pAfterMixed.requirements.every(r => r.status === "approved");
    assert(all20Approved, "All 20 remaining requirements must now be approved");
    pass("Test 9: Bulk approve on mixed state successfully approved only remaining draft requirement");

    console.log("\n--- 4. SCOPE CONTRADICTIONS REMAIN INDEPENDENT ---");

    // Test 10: Scope contradiction continues to block finalization even when all requirements are approved
    await Project.findByIdAndUpdate(project._id, {
      $set: {
        "waterfallPlanLifecycle.conflicts": [
          {
            id: "CONF-01",
            title: "Database vs In-Memory contradiction",
            reason: "Brief states SQL DB but notes state Redis cache",
            sourceA: "SRS",
            sourceB: "Notes",
            statementA: "Store transactions in PostgreSQL",
            statementB: "Store all state in Redis",
            status: "unresolved",
          },
        ],
        "waterfallPlanLifecycle.documentReadinessConfirmed": true,
      },
    });

    const conflictReadiness = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert.strictEqual(conflictReadiness.data.readiness?.isReady, false);
    const conflictBlocker = conflictReadiness.data.readiness?.blockers?.find(b => b.includes("scope contradiction"));
    assert(conflictBlocker, "Scope contradiction must block finalization");
    pass("Test 10: Approving all requirements does NOT bypass scope contradictions", conflictBlocker);

    // Resolve conflict
    const resolveRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/conflicts/CONF-01`,
      token: validToken,
      body: {
        resolution: "Use PostgreSQL for durable persistence with Redis cache layer",
        resolutionType: "custom_rationale",
      },
    });
    assert.strictEqual(resolveRes.status, 200, "Conflict resolution must return 200");
    pass("Test 10b: Scope contradiction resolved cleanly");

    // Explicit document readiness confirmation
    const confirmRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
      body: { confirmed: true },
    });
    assert.strictEqual(confirmRes.status, 200);

    // Readiness confirmation check
    const readyFinal = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    if (!readyFinal.data.readiness?.isReady) {
      console.error("  [DEBUG BLOCKERS]", readyFinal.data.readiness?.blockers);
    }
    assert.strictEqual(readyFinal.data.readiness?.isReady, true, "Readiness must now be ready for finalization");
    pass("Test 11: Readiness isReady becomes true when all requirements, artifacts, and conflicts resolved");

    console.log("\n--- 5. FINALIZATION USING EXACT APPROVED REQUIREMENTS ---");

    // Test 12: Finalize Waterfall plan generates tasks from the 20 approved requirements
    const finalizeRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/finalize`,
      token: validToken,
    });
    assert.strictEqual(finalizeRes.status, 200, "Finalization must succeed");

    const tasks = await Task.find({ projectId: project._id }).sort({ executionOrder: 1 });
    assert.strictEqual(tasks.length, 20, "Generated tasks must match the exact 20 approved requirements");
    pass("Test 12: Exactly 20 tasks generated matching the 20 approved requirements");

    // Test 13: Edited requirement content reflected in generated task
    const editedTask = tasks.find(t => t.requirementId === reqToEdit.reqId);
    assert(editedTask, "Task for edited requirement must exist");
    assert(editedTask.title.includes("Hardware Sensor Calibration Module"), "Task title must reflect edited requirement");
    assert.strictEqual(editedTask.estimatedHours, 24, "Task estimatedHours must reflect edited requirement");
    pass("Test 13: Edited requirement content (title, estimatedHours) reflected in generated task");

    // Test 14: Deleted requirement did NOT generate a task
    const deletedTask = tasks.find(t => t.requirementId === reqToDelete.reqId);
    assert(!deletedTask, "Deleted requirement must NOT generate any task");
    pass("Test 14: Deleted requirement did not generate any task");

    // Test 15: Requirement-to-task traceability IDs preserved
    const allHaveTraceability = tasks.every(t => t.requirementId && t.requirementId.startsWith("REQ-"));
    assert(allHaveTraceability, "All tasks must have requirementId traceability");
    pass("Test 15: All 20 generated tasks maintain requirement traceability IDs");

    // Test 16: Finalization idempotency: repeated finalization does not duplicate tasks
    const repeatFinalize = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/finalize`,
      token: validToken,
    });
    assert.strictEqual(repeatFinalize.status, 200);
    const tasksAfterRepeat = await Task.find({ projectId: project._id });
    assert.strictEqual(tasksAfterRepeat.length, 20, "Task count must remain exactly 20 on repeat finalization");
    pass("Test 16: Repeat finalization is strictly idempotent (0 duplicate tasks created)");

    console.log("================================================================================");
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
    console.log("================================================================================");

    if (failedCount > 0) process.exit(1);
  } finally {
    // Cleanup
    await Task.deleteMany({ projectId: { $in: [project._id, projectB._id] } });
    await Project.deleteMany({ _id: { $in: [project._id, projectB._id] } });
    await Team.deleteOne({ _id: testTeam._id });
    await User.deleteMany({ _id: { $in: [testUser._id, viewerUser._id] } });
    await mongoose.disconnect();
  }
}

runSuite().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
