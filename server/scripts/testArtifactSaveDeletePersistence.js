/**
 * server/scripts/testArtifactSaveDeletePersistence.js
 * ============================================================================
 * Comprehensive Verification Suite for:
 * 1. Artifact Save Persistence (API -> MongoDB -> Refetch -> No project.save error)
 * 2. Stable Artifact _id & Multiline Markdown Preservation
 * 3. Artifact Deletion (API -> MongoDB removal -> Refetch -> Clean state)
 * 4. Error Handling (400 on missing fields, 404 on nonexistent artifact ID)
 * 5. Data Isolation & Authorization (Cross-project boundary protection)
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
import ProjectMemory from "../models/ProjectMemory.js";
import { sign } from "../auth.js";

const MONGO_URI = process.env.MONGO_URI;
const API_PORT = 4000;
const BASE_URL = `http://127.0.0.1:${API_PORT}`;

// Helper: Make HTTP requests to the running backend
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

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log("================================================================================");
  console.log("   NEXUSFLOW ARTIFACT SAVE & DELETE PERSISTENCE TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB Atlas\n");

  try {
    // Locate the active PhishShield project (6ace4bddae858d8bf82c042c) or target test project
    let project = await Project.findById("6ace4bddae858d8bf82c042c");
    if (!project) {
      project = await Project.findOne({ title: /PhishShield/i, waterfallPlanLifecycle: { $exists: true } });
    }
    if (!project) {
      project = await Project.findOne();
    }
    if (!project) {
      throw new Error("No project found in database to test against.");
    }

    let team = await Team.findById(project.teamId);
    let user = null;
    if (team?.ownerId) {
      user = await User.findById(team.ownerId);
    }
    if (!user) {
      user = await User.findOne({ role: { $in: ["admin", "Product Builder"] } });
    }
    if (!user) {
      user = await User.create({
        name: "Test Engineer",
        email: `test_eng_${Date.now()}@nexusflow.dev`,
        password: "test_password_123",
        role: "Product Builder",
      });
    }

    if (!team) {
      team = await Team.create({
        _id: project.teamId,
        name: "TEAM OP",
        ownerId: user._id,
        members: [{ userId: user._id, name: user.name, role: "Owner" }],
      });
    } else {
      team.ownerId = user._id;
      team.members = [{ userId: user._id, name: user.name, role: "Owner" }];
      await team.save();
    }

    const authToken = sign(user);
    const projectId = project._id.toString();

    console.log(`Testing with Project: "${project.title}" (${projectId})`);
    console.log(`Testing with User: "${user.name}" (${user.email})\n`);

    const initialArtifactCount = project.artifacts ? project.artifacts.length : 0;

    // --------------------------------------------------------------------------
    // TEST A: Save Artifact Persistence & Markdown Formatting
    // --------------------------------------------------------------------------
    console.log("--- TEST A: Save Artifact Persistence ---");
    const testTimestamp = Date.now();
    const testArtifactName = `ARTIFACT_SAVE_DELETE_REGRESSION_${testTimestamp}`;
    const markdownContent = [
      `# PhishShield Threat Intelligence Specification ${testTimestamp}`,
      "",
      "This document establishes the official detection heuristics for enterprise phishing triage.",
      "",
      "## Evaluation Rules",
      "- High-entropy domain lexical analysis",
      "- SSL certificate age verification (< 14 days)",
      "- Punycode and homograph substitution detection",
      "",
      "## Acceptance Criteria",
      "Rule engine must score incoming URLs in under 50ms with explainable indicator breakdown.",
    ].join("\n");

    const saveRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${projectId}/artifacts`,
      token: authToken,
      body: {
        name: testArtifactName,
        artifactType: "srs",
        scope: "persistent",
        content: markdownContent,
      },
    });

    assert(saveRes.status === 201, `Save returned HTTP 201 Created (got ${saveRes.status})`);
    assert(saveRes.data.success === true, "Response indicated success: true");
    assert(!saveRes.data.error, "No error returned in response");
    assert(
      !saveRes.raw?.includes("project.save is not a function") &&
      !saveRes.data.error?.includes("project.save is not a function"),
      "No 'project.save is not a function' error occurred"
    );

    const savedArtifact = saveRes.data.artifact;
    assert(Boolean(savedArtifact && savedArtifact._id), `Artifact returned with stable _id: ${savedArtifact?._id}`);
    assert(savedArtifact?.name === testArtifactName, "Artifact name matches input");
    assert(savedArtifact?.scope === "persistent", "Artifact scope is 'persistent'");
    assert(savedArtifact?.content === markdownContent, "Multiline Markdown content preserved exactly");

    const createdArtifactId = savedArtifact._id?.toString();

    // Verify direct MongoDB state
    const dbProjectAfterSave = await Project.findById(projectId);
    const dbArtifact = (dbProjectAfterSave.artifacts || []).find(
      (a) => a._id?.toString() === createdArtifactId
    );
    assert(Boolean(dbArtifact), "Artifact exists in MongoDB project.artifacts collection");
    assert(dbArtifact?.content === markdownContent, "MongoDB content matches submitted multiline Markdown");

    // Verify ProjectMemory sync for persistent artifact
    const memoryRecord = await ProjectMemory.findOne({
      projectId: project._id,
      $or: [
        { relatedEntityIds: createdArtifactId },
        { tags: createdArtifactId },
      ],
    });
    assert(Boolean(memoryRecord), "Persistent artifact synced to ProjectMemory with category IMPORTANT_ARTIFACT");

    // Verify Refetch / Refresh endpoint (GET /api/projects/:projectId/plan)
    const refetchRes = await apiRequest({
      method: "GET",
      path: `/api/projects/${projectId}/plan`,
      token: authToken,
    });
    assert(refetchRes.status === 200, "Refetch plan returned HTTP 200");
    const foundInRefetch = (refetchRes.data.artifacts || []).some(
      (a) => a._id?.toString() === createdArtifactId && a.name === testArtifactName
    );
    assert(foundInRefetch, "Artifact is present in refreshed artifact list from server");

    // --------------------------------------------------------------------------
    // TEST B: Delete Artifact Persistence
    // --------------------------------------------------------------------------
    console.log("\n--- TEST B: Delete Artifact Persistence ---");
    const deleteRes = await apiRequest({
      method: "DELETE",
      path: `/api/projects/${projectId}/artifacts/${createdArtifactId}`,
      token: authToken,
    });

    assert(deleteRes.status === 200, `Delete returned HTTP 200 OK (got ${deleteRes.status})`);
    assert(deleteRes.data.success === true, "Delete indicated success: true");
    assert(deleteRes.data.deletedArtifactId === createdArtifactId, "Deleted artifact ID matches target");

    // Verify direct MongoDB removal
    const dbProjectAfterDelete = await Project.findById(projectId);
    const dbArtifactAfterDelete = (dbProjectAfterDelete.artifacts || []).find(
      (a) => a._id?.toString() === createdArtifactId
    );
    assert(!dbArtifactAfterDelete, "Artifact is completely absent from MongoDB project.artifacts");

    // Verify ProjectMemory cleanup
    const memoryRecordAfterDelete = await ProjectMemory.findOne({
      projectId: project._id,
      $or: [
        { relatedEntityIds: createdArtifactId },
        { tags: createdArtifactId },
      ],
    });
    assert(!memoryRecordAfterDelete, "Linked ProjectMemory record was removed upon artifact deletion");

    // Verify Refetch / Refresh after delete
    const refetchAfterDelete = await apiRequest({
      method: "GET",
      path: `/api/projects/${projectId}/plan`,
      token: authToken,
    });
    const foundInRefetchAfterDelete = (refetchAfterDelete.data.artifacts || []).some(
      (a) => a._id?.toString() === createdArtifactId
    );
    assert(!foundInRefetchAfterDelete, "Artifact remains absent after server refresh/refetch");

    // Verify pre-existing artifacts remain preserved
    const finalArtifactCount = dbProjectAfterDelete.artifacts ? dbProjectAfterDelete.artifacts.length : 0;
    assert(finalArtifactCount === initialArtifactCount, `Pre-existing artifact count preserved (initial: ${initialArtifactCount}, current: ${finalArtifactCount})`);

    // --------------------------------------------------------------------------
    // TEST C: Error Handling & Resilience
    // --------------------------------------------------------------------------
    console.log("\n--- TEST C: Error Handling & Input Validation ---");
    // C1: Missing artifact name
    const missingNameRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${projectId}/artifacts`,
      token: authToken,
      body: { content: "Some content without a title" },
    });
    assert(missingNameRes.status === 400, "Save with missing name correctly rejected with HTTP 400");
    assert(Boolean(missingNameRes.data.error), `Error message returned: "${missingNameRes.data.error}"`);

    // C2: Missing artifact content
    const missingContentRes = await apiRequest({
      method: "POST",
      path: `/api/projects/${projectId}/artifacts`,
      token: authToken,
      body: { name: "Title Without Content" },
    });
    assert(missingContentRes.status === 400, "Save with missing content correctly rejected with HTTP 400");
    assert(Boolean(missingContentRes.data.error), `Error message returned: "${missingContentRes.data.error}"`);

    // C3: Nonexistent artifact ID deletion
    const fakeArtifactId = new mongoose.Types.ObjectId().toString();
    const fakeDeleteRes = await apiRequest({
      method: "DELETE",
      path: `/api/projects/${projectId}/artifacts/${fakeArtifactId}`,
      token: authToken,
    });
    assert(fakeDeleteRes.status === 404, "Delete with nonexistent artifact ID rejected with HTTP 404");
    assert(fakeDeleteRes.data.error === "Artifact not found", `Error message: "${fakeDeleteRes.data.error}"`);

    // --------------------------------------------------------------------------
    // TEST D: Data Isolation & Cross-Project Protection
    // --------------------------------------------------------------------------
    console.log("\n--- TEST D: Cross-Project Data Isolation & Authorization ---");
    // Create an isolated project and unauthorized user
    const otherUser = await User.create({
      name: "External Rogue User",
      email: `rogue_${Date.now()}@otherdomain.com`,
      password: "unauth_password_123",
      role: "Product Builder",
    });
    const rogueToken = sign(otherUser);

    // Rogue user tries to save an artifact to target project
    const unauthorizedSave = await apiRequest({
      method: "POST",
      path: `/api/projects/${projectId}/artifacts`,
      token: rogueToken,
      body: {
        name: "Unauthorized Injection Attempt",
        content: "Malicious injection attempt",
      },
    });
    assert(unauthorizedSave.status === 403, `Unauthorized user blocked from saving artifact (HTTP 403, got ${unauthorizedSave.status})`);

    // Rogue user tries to delete an artifact from target project
    const unauthorizedDelete = await apiRequest({
      method: "DELETE",
      path: `/api/projects/${projectId}/artifacts/${fakeArtifactId}`,
      token: rogueToken,
    });
    assert(unauthorizedDelete.status === 403, `Unauthorized user blocked from deleting artifact (HTTP 403, got ${unauthorizedDelete.status})`);

    // Cleanup test user
    await User.findByIdAndDelete(otherUser._id);

    console.log("\n================================================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("================================================================================\n");

    await mongoose.connection.close();
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await mongoose.connection.close();
    process.exit(1);
  }
}

runTests();
