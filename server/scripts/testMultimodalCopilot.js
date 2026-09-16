/**
 * server/scripts/testMultimodalCopilot.js
 * ============================================================================
 * NEXUSFLOW V4 — MULTIMODAL COPILOT TEST SUITE (Workstream 17)
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
import TemporaryContext from "../models/TemporaryContext.js";
import {
  checkProviderCapability,
  selectEligibleProvider,
  validateStructuredInsights,
  extractDeterministicDocumentInsights,
  analyzeVisualArtifact,
  answerMultimodalQuery,
} from "../services/multimodalCopilotService.js";

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
  console.log("NEXUSFLOW V4 — MULTIMODAL COPILOT TESTS");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let user, team, project, textAttachment, imgAttachment;

  try {
    user = await User.create({
      name: `Vision Tester ${ts}`,
      email: `vision_${ts}@test.dev`,
      password: "Password123!",
    });

    team = await Team.create({
      name: `Vision Team ${ts}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });

    project = await Project.create({
      teamId: team._id,
      title: "Vision & Document Intel",
      methodology: "SCRUM",
      domain: "AI / Machine Learning",
    });

    // ── Test 1: Provider Capability Detection
    console.log("[TEST 1] Provider modality capability detection");
    assert(checkProviderCapability("gemini", "vision") === true, "Gemini supports vision");
    assert(checkProviderCapability("gemini", "text") === true, "Gemini supports text");
    assert(checkProviderCapability("groq", "vision") === false, "Groq does NOT support vision (whitelisted models are text-only)");
    assert(checkProviderCapability("groq", "text") === true, "Groq supports text");
    assert(checkProviderCapability("unknown_provider", "vision") === false, "Unknown provider returns false");

    // ── Test 2: Routing Invariants Under $0 Policy
    console.log("\n[TEST 2] Capability-based provider selection");
    const textRouting = selectEligibleProvider(["text"]);
    assert(textRouting.provider === "gemini", "Text query selects Gemini as primary");
    assert(textRouting.fallbackChain.length === 2, "Includes fallback chain to Groq and OpenRouter");

    const visionRouting = selectEligibleProvider(["text", "vision"]);
    assert(visionRouting.provider === "gemini", "Vision query selects Gemini");
    assert(visionRouting.supportsVision === true, "Confirmed supportsVision=true");

    // ── Test 3: Structured Schema Validation
    console.log("\n[TEST 3] Schema validation of structured AI insights");
    const validInsights = {
      requirements: ["REQ-1: User auth", "REQ-2: Rate limiting"],
      entities: ["User", "Session", "Token"],
      constraints: ["Max 100ms latency"],
      risks: ["Token hijacking"],
      dependencies: ["Redis"],
    };
    const validationOk = validateStructuredInsights(validInsights);
    assert(validationOk.valid === true, "Valid insights structure passes validation");

    const invalidInsights = {
      requirements: "Not an array", // invalid type
    };
    const validationFail = validateStructuredInsights(invalidInsights);
    assert(validationFail.valid === false, "Malformed insights structure fails validation");
    assert(validationFail.error.includes("must be an array"), "Descriptive validation error returned");

    // ── Test 4: Deterministic Document Information Extraction
    console.log("\n[TEST 4] Deterministic extraction from specifications document");
    const docText = `
# System Architecture Specification
REQ-01: The system must enforce two-factor authentication.
REQ-02: Microservices shall communicate over gRPC.
Entity: UserAccount
Entity: AuditLog
Constraint: Response time under 200ms
Risk: High memory consumption under peak loads
Dependencies: Requires PostgreSQL 15
    `;

    const extracted = extractDeterministicDocumentInsights(docText);
    assert(extracted.requirements.length === 2, `Extracted 2 requirements (got ${extracted.requirements.length})`);
    assert(extracted.entities.length === 2, `Extracted 2 entities (got ${extracted.entities.length})`);
    assert(extracted.constraints.length === 1, `Extracted 1 constraint (got ${extracted.constraints.length})`);
    assert(extracted.risks.length === 1, `Extracted 1 risk (got ${extracted.risks.length})`);
    assert(extracted.dependencies.length === 1, `Extracted 1 dependency (got ${extracted.dependencies.length})`);

    // ── Test 5: Visual Artifact Analysis with Schema Guard
    console.log("\n[TEST 5] Visual artifact analysis & advisory verification");
    imgAttachment = await TemporaryContext.create({
      projectId: project._id,
      userId: user._id,
      sourceIdentifier: "system_architecture.png",
      fileType: "image_png",
      mimeType: "image/png",
      extractedText: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      processingState: "ready",
    });

    const visionAnalysis = await analyzeVisualArtifact({
      projectId: project._id,
      attachmentId: imgAttachment._id,
      diagramType: "architecture_diagram",
    });

    assert(visionAnalysis.status === "ANALYZED", "Visual artifact analyzed successfully");
    assert(visionAnalysis.analysis.identifiedComponents.length > 0, "Identified architectural components");
    assert(visionAnalysis.advisoryOnly === true, "Analysis is strictly marked advisoryOnly=true");

    // ── Test 6: Multimodal Q&A Integration
    console.log("\n[TEST 6] Multimodal Q&A with temporary attachments");
    textAttachment = await TemporaryContext.create({
      projectId: project._id,
      userId: user._id,
      sourceIdentifier: "srs.txt",
      fileType: "txt",
      mimeType: "text/plain",
      extractedText: docText,
      processingState: "ready",
    });

    const qaResult = await answerMultimodalQuery({
      projectId: project._id,
      userId: user._id,
      query: "What requirements are mentioned in this document?",
      attachmentIds: [textAttachment._id, imgAttachment._id],
    });

    assert(qaResult.success === true, "Multimodal query answered");
    assert(qaResult.answer.includes("Found 2 requirements"), "Answer contains factual requirement extraction");
    assert(qaResult.attachmentsConsulted === 2, "Both document and image attachments consulted");
    assert(qaResult.advisoryOnly === true, "Maintains advisoryOnly invariant");

    // ── Test 7: Project Invariant — Zero Live State Mutation
    console.log("\n[TEST 7] Project state remains unmutated after multimodal analysis");
    const refreshedProject = await Project.findById(project._id);
    assert(refreshedProject.methodology === "SCRUM", "Project methodology untouched");
    assert(refreshedProject.domain === "AI / Machine Learning", "Project domain untouched");

  } finally {
    console.log("\n[CLEANUP] Cleaning up test records...");
    if (user) await User.findByIdAndDelete(user._id);
    if (team) await Team.findByIdAndDelete(team._id);
    if (project) {
      await Project.findByIdAndDelete(project._id);
      await TemporaryContext.deleteMany({ projectId: project._id });
    }
    await mongoose.disconnect();
    console.log("Database connection closed cleanly.");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`MULTIMODAL COPILOT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
