/**
 * server/scripts/testCopilotAttachments.js
 * ============================================================================
 * NEXUSFLOW V4 — COPILOT ATTACHMENTS & TEMPORARY CONTEXT TESTS (Workstream 16)
 * ============================================================================
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import ProjectMemory from "../models/ProjectMemory.js";
import TemporaryContext from "../models/TemporaryContext.js";
import {
  ingestAttachment,
  getProjectTemporaryContexts,
  promoteAttachmentToMemory,
  deleteTemporaryContext,
  buildAugmentedCopilotContext,
} from "../services/copilotAttachmentService.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
let passed = 0, failed = 0;

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
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — COPILOT ATTACHMENTS & TEMPORARY CONTEXT TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let userA, userB, teamA, projectA, projectB;

  try {
    userA = await User.create({
      name: `Alice ${ts}`,
      email: `alice_${ts}@test.dev`,
      password: "Password123!",
    });

    userB = await User.create({
      name: `Bob ${ts}`,
      email: `bob_${ts}@test.dev`,
      password: "Password123!",
    });

    teamA = await Team.create({
      name: `Team A ${ts}`,
      ownerId: userA._id,
      members: [{ userId: userA._id, name: userA.name, role: "leader" }],
    });

    projectA = await Project.create({
      teamId: teamA._id,
      title: "Project Alpha",
      methodology: "SCRUM",
      domain: "Software Engineering",
    });

    projectB = await Project.create({
      teamId: teamA._id,
      title: "Project Beta",
      methodology: "KANBAN",
      domain: "Cybersecurity",
    });

    // ── Test 1: Ingest Valid Markdown Attachment
    console.log("[TEST 1] Ingest valid text/markdown attachment into temporary context");
    const mdContent = "# Architecture Specification\n\n- Component A: Microservice\n- Component B: PostgreSQL";
    const attachment1 = await ingestAttachment({
      projectId: projectA._id,
      userId: userA._id,
      filename: "spec.md",
      mimeType: "text/markdown",
      content: mdContent,
    });

    assert(attachment1.processingState === "ready", "Attachment is in ready state");
    assert(attachment1.fileType === "markdown", "Identified file type as markdown");
    assert(attachment1.extractedText === mdContent, "Extracted text preserved faithfully");
    assert(attachment1.isPromotedToMemory === false, "Initialized with isPromotedToMemory=false");

    // ── Test 2: Invariant Check — No Automatic Persistent Memory
    console.log("\n[TEST 2] Strict memory boundary invariant: TemporaryContext != ProjectMemory");
    const memories = await ProjectMemory.find({ projectId: projectA._id });
    assert(memories.length === 0, "No ProjectMemory records were created automatically upon attachment");

    // ── Test 3: Unsupported File Capability Response
    console.log("\n[TEST 3] Graceful handling of unsupported file types");
    const badFile = await ingestAttachment({
      projectId: projectA._id,
      userId: userA._id,
      filename: "firmware.bin",
      mimeType: "application/octet-stream",
      content: "01010101",
    });
    assert(badFile.processingState === "unsupported", "Marked processingState as unsupported");
    assert(badFile.errorMessage.includes("Unsupported file type"), "Clear capability error message provided");

    // ── Test 4: Query Active Temporary Contexts
    console.log("\n[TEST 4] Query active temporary contexts for user & project");
    const tempContexts = await getProjectTemporaryContexts(projectA._id, userA._id);
    assert(tempContexts.length === 1, "Returns exactly 1 active temporary context for User A in Project A");
    assert(tempContexts[0].sourceIdentifier === "spec.md", "Correct source identifier returned");

    // ── Test 5: Explicit Promotion to Persistent Memory ("Save to Project Memory")
    console.log("\n[TEST 5] Explicit user promotion to persistent ProjectMemory");
    const promoted = await promoteAttachmentToMemory(
      attachment1._id,
      userA._id,
      { category: "ARCHITECTURE_DECISION", title: "Promoted Architecture Spec" },
      userA.name
    );
    assert(promoted != null, "Memory record created upon explicit promotion");
    assert(promoted.category === "ARCHITECTURE_DECISION", "Correct memory category assigned");
    assert(promoted.scope === "persistent", "Scope set to persistent");

    const refreshedAttach = await TemporaryContext.findById(attachment1._id);
    assert(refreshedAttach.isPromotedToMemory === true, "Temporary context marked as promoted");
    assert(refreshedAttach.promotedMemoryId.toString() === promoted._id.toString(), "Linked to promoted memory ID");

    // ── Test 6: Cross-User and Cross-Project Security Isolation
    console.log("\n[TEST 6] Security isolation — User B cannot promote or delete User A attachment");
    try {
      await promoteAttachmentToMemory(attachment1._id, userB._id, { title: "Hacked Spec" });
      assert(false, "User B should not be able to promote User A attachment");
    } catch (e) {
      assert(true, "Unauthorized promotion attempt rejected");
    }

    try {
      await deleteTemporaryContext(attachment1._id, userB._id);
      assert(false, "User B should not be able to delete User A attachment");
    } catch (e) {
      assert(true, "Unauthorized deletion attempt rejected");
    }

    // User B querying Project A returns zero temporary contexts
    const userBContexts = await getProjectTemporaryContexts(projectA._id, userB._id);
    assert(userBContexts.length === 0, "User B cannot see User A temporary contexts");

    // User A querying Project B returns zero temporary contexts
    const projectBContexts = await getProjectTemporaryContexts(projectB._id, userA._id);
    assert(projectBContexts.length === 0, "Project B has zero temporary contexts from Project A");

    // ── Test 7: Context Builder with Token Limits
    console.log("\n[TEST 7] Build augmented Copilot context within token budget");
    const contextBuild = await buildAugmentedCopilotContext({
      projectId: projectA._id,
      userId: userA._id,
      maxTokens: 2000,
    });
    assert(contextBuild != null, "Copilot context successfully built");
    assert(contextBuild.formattedContext.includes("Architecture Specification"), "Temporary context injected into prompt");
    assert(contextBuild.formattedContext.includes("NEXUSFLOW PROJECT CONTEXT"), "Base project context injected into prompt");
    assert(contextBuild.tokenBudget === 2000, "Token budget enforced");

  } finally {
    console.log("\n[CLEANUP] Cleaning up test records...");
    if (userA) await User.findByIdAndDelete(userA._id);
    if (userB) await User.findByIdAndDelete(userB._id);
    if (teamA) await Team.findByIdAndDelete(teamA._id);
    if (projectA) {
      await Project.findByIdAndDelete(projectA._id);
      await TemporaryContext.deleteMany({ projectId: projectA._id });
      await ProjectMemory.deleteMany({ projectId: projectA._id });
    }
    if (projectB) {
      await Project.findByIdAndDelete(projectB._id);
      await TemporaryContext.deleteMany({ projectId: projectB._id });
    }
    await mongoose.disconnect();
    console.log("Database connection closed cleanly.");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`COPILOT ATTACHMENTS RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
