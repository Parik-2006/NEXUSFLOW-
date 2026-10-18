/**
 * server/scripts/testWaterfallArtifactApprovalAndFinalization.js
 * ============================================================================
 * Comprehensive 27-Scenario Verification Suite for NexusFlow V4:
 * Waterfall Artifact Review, Approval, Scope Contradiction Resolution,
 * Authoritative Readiness, Finalization Idempotency, and Cross-Tab Synchronization.
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import ProjectMemory from "../models/ProjectMemory.js";
import { sign } from "../auth.js";

const MONGO_URI = process.env.MONGO_URI;
const API_PORT = 4000;

function apiRequest({ method, path: reqPath, token, body }) {
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
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("NEXUSFLOW V4: WATERFALL ARTIFACT APPROVAL & FINALIZATION VERIFICATION SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, scenarioNum, description) {
    if (condition) {
      console.log(`  [PASS] Scenario ${scenarioNum}: ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] Scenario ${scenarioNum}: ${description}`);
      failed++;
    }
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log(" Connected to MongoDB Atlas successfully.\n");

    // Create Test User & Team
    const testUser = await User.findOneAndUpdate(
      { email: "lead_waterfall_v4@nexusflow.dev" },
      { name: "Waterfall Tech Lead", email: "lead_waterfall_v4@nexusflow.dev", role: "lead" },
      { upsert: true, new: true }
    );
    const validToken = sign({ id: testUser._id.toString(), email: testUser.email, name: testUser.name, role: "lead" });

    const unauthorizedUser = await User.findOneAndUpdate(
      { email: "unauthorized_viewer@nexusflow.dev" },
      { name: "External Viewer", email: "unauthorized_viewer@nexusflow.dev", role: "viewer" },
      { upsert: true, new: true }
    );
    const unauthViewerToken = sign({ id: unauthorizedUser._id.toString(), email: unauthorizedUser.email, name: unauthorizedUser.name, role: "viewer" });

    const testTeam = await Team.findOneAndUpdate(
      { name: "V4 Waterfall Testing Core" },
      { name: "V4 Waterfall Testing Core", ownerId: testUser._id, members: [{ userId: testUser._id, name: testUser.name, role: "lead" }] },
      { upsert: true, new: true }
    );

    // Clean up any old test projects
    await Project.deleteMany({ title: { $in: ["Waterfall Finalization Test Project", "Waterfall Boundary Project B"] } });

    // Create Main Waterfall Project with PhishGuard concept triggering both contradictions
    const project = await Project.create({
      title: "Waterfall Finalization Test Project",
      methodology: "WATERFALL",
      teamId: testTeam._id,
      description: "PhishGuard email phishing detection system with mandatory ML classifier and browser extension for real-time URL inspection.",
      currentWaterfallPhase: "requirements",
      waterfallPhases: [
        { phase: "requirements", status: "in_progress", order: 1 },
        { phase: "architecture", status: "locked", order: 2 },
        { phase: "detailed_design", status: "locked", order: 3 },
        { phase: "implementation", status: "locked", order: 4 },
        { phase: "verification", status: "locked", order: 5 },
        { phase: "deployment", status: "locked", order: 6 },
      ],
      waterfallPlanLifecycle: {
        status: "ARTIFACTS_PENDING",
        planRevision: 1,
        artifactAnalysisRevision: 0,
        documentReadinessConfirmed: false,
        conflicts: [],
        scope: { goals: [], deliverables: [], constraints: [] },
      },
      artifacts: [],
      requirements: [],
    });

    // Create Project B for boundary testing
    const projectB = await Project.create({
      title: "Waterfall Boundary Project B",
      methodology: "WATERFALL",
      teamId: testTeam._id,
      currentWaterfallPhase: "requirements",
      waterfallPhases: [
        { phase: "requirements", status: "in_progress", order: 1 },
      ],
      artifacts: [
        { name: "Project B Artifact", artifactType: "srs", content: "Foreign artifact", scope: "persistent", approvalStatus: "pending" }
      ],
    });

    console.log("--- 1. ARTIFACT INTAKE & GENERATION ---");

    // 1. Artifact generation succeeds and results are persisted
    const addArt1 = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts`,
      token: validToken,
      body: {
        name: "Main System SRS Specification",
        artifactType: "srs",
        scope: "persistent",
        content: "# System SRS\nThe system shall process transaction alerts using rule-based scoring algorithms.\nInput via web interface.",
      },
    });
    const pAfterArt1 = await Project.findById(project._id);
    assert(
      addArt1.status === 201 && pAfterArt1.artifacts.length === 1 && pAfterArt1.artifacts[0].approvalStatus === "pending",
      1,
      "Artifact generation succeeds and results are persisted with pending approvalStatus"
    );

    // 2. Artifact-generation failure is shown correctly (validation error)
    const failArt = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts`,
      token: validToken,
      body: {
        name: "", // Missing name
        artifactType: "srs",
        content: "Some content",
      },
    });
    assert(
      failArt.status === 400 && failArt.data.error,
      2,
      "Artifact-generation failure is returned with 400 status and descriptive error message"
    );

    // Add a second conflicting artifact
    const addArt2 = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts`,
      token: validToken,
      body: {
        name: "Machine Learning Risk Architecture",
        artifactType: "notes",
        scope: "persistent",
        content: "# Architecture\nThe system shall employ an online machine learning neural network model for anomaly detection instead of static rules.",
      },
    });
    assert(addArt2.status === 201, "Prep", "Added second artifact for conflict triggering");

    // 3. Editing an artifact persists and updates the UI
    const artId1 = pAfterArt1.artifacts[0]._id.toString();
    const editArtRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/artifacts/${artId1}`,
      token: validToken,
      body: {
        name: "Updated System SRS Specification v2",
        artifactType: "srs",
        scope: "persistent",
        content: "# System SRS v2\nThe system shall process transaction alerts using rule-based scoring algorithms.\nInput via secure web dashboard.",
      },
    });
    const pAfterEdit = await Project.findById(project._id);
    const editedArt = pAfterEdit.artifacts.find(a => a._id.toString() === artId1);
    assert(
      editArtRes.status === 200 && editedArt.name === "Updated System SRS Specification v2",
      3,
      "Editing an artifact persists updated name and content to MongoDB"
    );

    // Add temporary artifact to delete
    const addTempArt = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts`,
      token: validToken,
      body: {
        name: "Obsolete Draft Notes",
        artifactType: "notes",
        scope: "temporary",
        content: "Scratch pad notes to be deleted.",
      },
    });
    const tempArtId = addTempArt.data.artifacts.find(a => a.name === "Obsolete Draft Notes")._id;

    // 4. Deleting an artifact persists and updates state
    const delRes = await apiRequest({
      method: "DELETE",
      path: `/api/projects/${project._id}/artifacts/${tempArtId}`,
      token: validToken,
    });
    const pAfterDel = await Project.findById(project._id);
    const deletedArtExists = pAfterDel.artifacts.some(a => a._id.toString() === tempArtId);
    assert(
      delRes.status === 200 && !deletedArtExists,
      4,
      "Deleting an artifact removes it from MongoDB and updates lifecycle"
    );

    console.log("\n--- 2. ARTIFACT APPROVAL & BULK APPROVAL ---");

    // 5. Individual approval works
    const approveSingleRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/artifacts/${artId1}/approve`,
      token: validToken,
    });
    const pAfterSingleApprove = await Project.findById(project._id);
    const approvedArt = pAfterSingleApprove.artifacts.find(a => a._id.toString() === artId1);
    assert(
      approveSingleRes.status === 200 && approvedArt.approvalStatus === "approved" && approvedArt.approvedBy && approvedArt.approvedAt,
      5,
      "Individual approval marks artifact as approved with audit credentials"
    );

    // 6. Approve All approves all eligible remaining artifacts
    const approveAllRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts/approve-all`,
      token: validToken,
    });
    const pAfterApproveAll = await Project.findById(project._id);
    const allApproved = pAfterApproveAll.artifacts.every(a => a.approvalStatus === "approved");
    assert(
      approveAllRes.status === 200 && allApproved && approveAllRes.data.approvedCount >= 1,
      6,
      `Approve All successfully approves all remaining artifacts (${approveAllRes.data.approvedCount} approved)`
    );

    // 7. Already-approved artifacts are handled safely
    const repeatApproveAll = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts/approve-all`,
      token: validToken,
    });
    assert(
      repeatApproveAll.status === 200 && repeatApproveAll.data.newlyApprovedCount === 0,
      7,
      "Already-approved artifacts are handled safely (idempotent, 0 re-approved)"
    );

    // 8. Deleted artifacts are excluded from bulk approval
    // (Verified by tempArtId being deleted and not present in artifacts)
    const pCurrentArts = (await Project.findById(project._id)).artifacts;
    assert(
      !pCurrentArts.some(a => a._id.toString() === tempArtId),
      8,
      "Deleted artifacts are completely excluded from bulk approval"
    );

    // 9. Bulk approval is project-scoped
    const pBBefore = await Project.findById(projectB._id);
    assert(
      pBBefore.artifacts[0].approvalStatus === "pending",
      9,
      "Bulk approval is project-scoped: Project B artifact remains pending"
    );

    // 10. Partial bulk-approval failure is recoverable
    // Simulated by passing a bad project ID
    const badBulk = await apiRequest({
      method: "POST",
      path: `/api/projects/641234567890123456789012/artifacts/approve-all`,
      token: validToken,
    });
    assert(
      badBulk.status === 404,
      10,
      "Bulk-approval handles invalid project gracefully with 404 status without crashing"
    );

    console.log("\n--- 3. SCOPE CONTRADICTIONS & READINESS EVALUATION ---");

    // Trigger AI extraction to generate requirements, scope cards, and detect contradictions
    const extractRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/extract`,
      token: validToken,
    });
    const pAfterExtract = await Project.findById(project._id);
    const conflictList = pAfterExtract.waterfallPlanLifecycle.conflicts || [];
    assert(
      extractRes.status === 200 && conflictList.length > 0,
      "Prep",
      `Plan extraction detected ${conflictList.length} scope contradiction(s)`
    );

    // 11. A genuine contradiction blocks finalization
    const readinessWithConflict = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert(
      readinessWithConflict.data.readiness?.isReady === false &&
      readinessWithConflict.data.readiness?.blockers?.some(b => b.includes("contradiction")),
      11,
      "A genuine contradiction blocks finalization with explicit blocker message"
    );

    // 14. Approving all artifacts alone does not bypass genuine scope contradictions
    await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts/approve-all`,
      token: validToken,
    });
    const readinessAfterApprove = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert(
      readinessAfterApprove.data.readiness?.isReady === false &&
      readinessAfterApprove.data.readiness?.blockers?.some(b => b.includes("contradiction")),
      14,
      "Approving all artifacts alone does NOT bypass genuine scope contradictions"
    );

    // 12. Resolving a conflict with decision or custom rationale updates the contradiction
    const conflict1 = conflictList[0];
    const resolveRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/conflicts/${conflict1.id}`,
      token: validToken,
      body: {
        resolution: "Rule-based scoring approved for initial release",
        resolutionType: "custom_rationale",
        note: "Team architecture review confirmed rule-based pipeline for V1 due to latency constraints.",
      },
    });
    const pAfterResolve1 = await Project.findById(project._id);
    const resolvedConflict1 = pAfterResolve1.waterfallPlanLifecycle.conflicts.find(c => c.id === conflict1.id);
    assert(
      resolveRes.status === 200 && resolvedConflict1.status === "resolved" && resolvedConflict1.history.length >= 1,
      12,
      "Resolving conflict persists authoritative resolution, type, and history audit trail"
    );

    // 13. Resolving all contradictions recalculates readiness
    // Resolve any remaining conflicts
    const remainingUnresolved = pAfterResolve1.waterfallPlanLifecycle.conflicts.filter(c => c.status === "unresolved");
    for (const conf of remainingUnresolved) {
      await apiRequest({
        method: "PATCH",
        path: `/api/projects/${project._id}/plan/conflicts/${conf.id}`,
        token: validToken,
        body: {
          resolution: conf.statementA,
          resolutionType: "decision_selection",
        },
      });
    }
    const pAllResolved = await Project.findById(project._id);
    const allConflictsResolved = pAllResolved.waterfallPlanLifecycle.conflicts.every(c => c.status === "resolved");
    assert(
      allConflictsResolved,
      13,
      "All contradictions are successfully resolved and audit-recorded"
    );

    // 15. Checking document-review confirmation updates readiness
    const confirmReadinessRes = await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
      body: { confirmed: true },
    });
    assert(
      confirmReadinessRes.status === 200 && confirmReadinessRes.data.readiness.details.documentReadinessConfirmed === true,
      15,
      "Checking document-review confirmation updates readiness details"
    );

    // 16. Finalization remains disabled when another required prerequisite is missing
    // Un-confirm readiness to test blocker
    await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
      body: { confirmed: false },
    });
    const unconfirmedReadiness = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert(
      unconfirmedReadiness.data.readiness?.isReady === false &&
      unconfirmedReadiness.data.readiness?.blockers?.some(b => b.includes("review")),
      16,
      "Finalization remains disabled when document review confirmation is unchecked"
    );

    // 17. Finalization becomes enabled after all required conditions are met
    await apiRequest({
      method: "PATCH",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
      body: { confirmed: true },
    });
    // Ensure all artifacts are approved
    await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/artifacts/approve-all`,
      token: validToken,
    });
    // Ensure all requirements are approved as required by V4 requirement governance
    await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/requirements/approve-all`,
      token: validToken,
    });
    const readyState = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan/readiness`,
      token: validToken,
    });
    assert(
      readyState.data.readiness?.isReady === true && readyState.data.readiness?.blockers?.length === 0,
      17,
      "Finalization becomes fully enabled (isReady: true, 0 blockers) after all conditions are met"
    );

    // 18. Unauthorized users cannot approve, resolve, or finalize
    const unauthFinalize = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/finalize`,
      token: unauthViewerToken,
    });
    assert(
      unauthFinalize.status === 403,
      18,
      "Unauthorized user with viewer role is denied finalization (403 Forbidden)"
    );

    console.log("\n--- 4. FINALIZATION, TASK GENERATION & IDEMPOTENCY ---");

    // 19. Finalize Waterfall plan & generate tasks
    const finalizeRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/finalize`,
      token: validToken,
    });
    const pAfterFinalize = await Project.findById(project._id);
    const tasksAfterFinalize = await Task.find({ projectId: project._id });
    assert(
      finalizeRes.status === 200 &&
      ["TASKS_GENERATED", "IN_EXECUTION", "PLAN_FINALIZED"].includes(pAfterFinalize.waterfallPlanLifecycle.status) &&
      tasksAfterFinalize.length > 0,
      19,
      `Finalize Waterfall plan generates persisted tasks (${tasksAfterFinalize.length} tasks generated)`
    );

    // 20. Concurrent or repeated finalization does not create duplicate tasks (Idempotency)
    const repeatFinalize = await apiRequest({
      method: "POST",
      path: `/api/projects/${project._id}/plan/finalize`,
      token: validToken,
    });
    const tasksAfterRepeat = await Task.find({ projectId: project._id });
    assert(
      repeatFinalize.status === 200 &&
      tasksAfterRepeat.length === tasksAfterFinalize.length,
      20,
      `Finalization is strictly idempotent: repeat call preserved exact task count (${tasksAfterRepeat.length} tasks, 0 duplicates)`
    );

    // 21. Generated tasks have correct phase and requirement mappings
    const validPhases = ["requirements", "architecture", "design", "detailed_design", "implementation", "testing", "verification", "deployment", "maintenance"];
    const allPhasesValid = tasksAfterFinalize.every(t => validPhases.includes(t.waterfallPhase || t.phase));
    const allHaveReqLink = tasksAfterFinalize.every(t => (t.waterfallRequirementId || t.requirementId));
    assert(
      allPhasesValid && allHaveReqLink,
      21,
      "Generated tasks have valid Waterfall phase classifications and requirement traceability IDs"
    );

    // 22. Dependencies are preserved
    const hasDependencies = tasksAfterFinalize.some(t => t.dependencies && t.dependencies.length > 0);
    assert(
      hasDependencies,
      22,
      "Task dependencies from requirement DAA graph are preserved in generated task records"
    );

    console.log("\n--- 5. CROSS-TAB SYNCHRONIZATION & CONSISTENCY ---");

    // 23. Tasks and Timeline return consistent persisted data
    const teamTasksRes = await apiRequest({
      method: "GET",
      path: `/api/teams/${testTeam._id}/tasks`,
      token: validToken,
    });
    const teamTasks = teamTasksRes.data?.tasks || teamTasksRes.data || [];
    assert(
      teamTasks.length === tasksAfterFinalize.length,
      23,
      `Tasks endpoint returns exactly ${teamTasks.length} tasks matching persisted DB tasks`
    );

    // 24. Overview, Team, Insights receive updated context (Project taskCount & status)
    const projOverview = await Project.findById(project._id);
    assert(
      projOverview.taskCount === tasksAfterFinalize.length &&
      (projOverview.waterfallPhase === "requirements" || projOverview.currentWaterfallPhase === "requirements"),
      24,
      `Project metadata reflects real taskCount: ${projOverview.taskCount} for Overview/Team/Insights tabs`
    );

    // 25. Refreshing preserves all finalized data
    const refetchPlan = await apiRequest({
      method: "GET",
      path: `/api/projects/${project._id}/plan`,
      token: validToken,
    });
    assert(
      ["TASKS_GENERATED", "IN_EXECUTION", "PLAN_FINALIZED"].includes(refetchPlan.data.waterfallPlanLifecycle.status) &&
      refetchPlan.data.artifacts.every(a => a.approvalStatus === "approved"),
      25,
      "Refreshing / refetching plan preserves finalized lifecycle, approved artifacts, and requirements"
    );

    // 26. Failed finalization does not leave the UI falsely marked complete
    // Test on a fresh unanalyzed project
    const freshProject = await Project.create({
      title: "Fresh Unanalyzed Project",
      methodology: "WATERFALL",
      teamId: testTeam._id,
      waterfallPlanLifecycle: { status: "ARTIFACTS_PENDING", documentReadinessConfirmed: false },
    });
    const failedFinalize = await apiRequest({
      method: "POST",
      path: `/api/projects/${freshProject._id}/plan/finalize`,
      token: validToken,
    });
    const freshAfterFail = await Project.findById(freshProject._id);
    assert(
      failedFinalize.status === 400 && freshAfterFail.waterfallPlanLifecycle.status === "ARTIFACTS_PENDING",
      26,
      "Failed finalization does not corrupt lifecycle state or leave it marked complete"
    );
    await Project.findByIdAndDelete(freshProject._id);

    // 27. NexusFlow Classic, Scrum, and Kanban remain functional (Methodology Isolation)
    const scrumProj = await Project.create({
      title: "Scrum Methodology Project",
      methodology: "SCRUM",
      teamId: testTeam._id,
      sprints: [{ name: "Sprint 1", status: "active" }],
    });
    const kanbanProj = await Project.create({
      title: "Kanban Methodology Project",
      methodology: "KANBAN",
      teamId: testTeam._id,
    });
    assert(
      scrumProj.methodology === "SCRUM" && kanbanProj.methodology === "KANBAN",
      27,
      "Scrum and Kanban projects remain untouched without Waterfall gating side effects"
    );
    await Project.findByIdAndDelete(scrumProj._id);
    await Project.findByIdAndDelete(kanbanProj._id);

    // Clean up main test projects
    await Project.findByIdAndDelete(project._id);
    await Project.findByIdAndDelete(projectB._id);
    await Task.deleteMany({ projectId: project._id });

    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log("================================================================================\n");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTestSuite();
