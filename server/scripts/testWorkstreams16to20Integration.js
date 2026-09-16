/**
 * server/scripts/testWorkstreams16to20Integration.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAMS 16–20 CROSS-WORKSTREAM INTEGRATION SUITE
 *
 * Verifies the complete end-to-end intelligence pipelines:
 *
 * Pipeline A:
 * Attachment -> Temporary Context -> Project Context -> Domain Context
 * -> Methodology Context -> Copilot Context -> Multimodal AI
 *
 * Pipeline B:
 * Domain + Methodology -> Environment Resolver -> Process Intelligence
 * -> Academic Intelligence -> Project AI
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
import Task from "../models/Task.js";
import ProjectEvent from "../models/ProjectEvent.js";

import {
  ingestAttachment,
  getProjectTemporaryContexts,
  promoteAttachmentToMemory,
  buildAugmentedCopilotContext,
} from "../services/copilotAttachmentService.js";
import { answerMultimodalQuery } from "../services/multimodalCopilotService.js";
import { resolveEnvironment } from "../services/domainMethodologyResolver.js";
import { analyzeProjectProcess } from "../services/processMiningEngine.js";
import {
  upsertAcademicRubric,
  getAcademicEvaluation,
} from "../services/academicEvaluationService.js";

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

async function runIntegrationSuite() {
  console.log("\n" + "=".repeat(60));
  console.log("NEXUSFLOW V4 — WORKSTREAMS 16–20 CROSS-WORKSTREAM INTEGRATION");
  console.log("=".repeat(60) + "\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.\n");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  const ts = Date.now();
  let user, team, project, otherProject;

  try {
    // ── Setup: Project with Domain and Methodology ──────────────────────────
    console.log("[SETUP] Creating test user, team, and projects...");
    user = await User.create({
      name: `Integrator ${ts}`,
      email: `integ_${ts}@nexusflow.dev`,
      password: "Password123!",
    });

    team = await Team.create({
      name: `Intelligence Team ${ts}`,
      ownerId: user._id,
      members: [{ userId: user._id, name: user.name, role: "leader" }],
    });

    project = await Project.create({
      teamId: team._id,
      title: "Zero-Trust Mesh Gateway",
      domain: "Cybersecurity",
      subdomain: "Network Defense",
      methodology: "KANBAN",
      assignedFacultyIds: [user._id],
    });

    otherProject = await Project.create({
      teamId: team._id,
      title: "Isolated Agricultural App",
      domain: "IoT / Embedded",
      methodology: "WATERFALL",
    });

    // =========================================================================
    // PIPELINE A: ATTACHMENT -> TEMP CONTEXT -> DOMAIN/METHODOLOGY -> COPILOT
    // =========================================================================
    console.log("\n[PIPELINE A.1] Attachment Ingestion & Temporary Context Creation");
    const threatModelDoc = `
# Zero Trust Network Gateway - Threat Model
REQ-01: All mTLS certs must rotate every 24 hours.
REQ-02: Enforce cryptographic nonces on all packet payloads.
Entity: MeshProxy
Entity: CertAuthority
Risk: Denial of service via handshake exhaustion
Constraint: Handshake latency under 15ms
    `;

    const attachment = await ingestAttachment({
      projectId: project._id,
      userId: user._id,
      filename: "threat_model.md",
      mimeType: "text/markdown",
      content: threatModelDoc,
    });

    assert(attachment.processingState === "ready", "Attachment ingested into TemporaryContext");
    assert(attachment.extractedText.includes("Threat Model"), "Extracted text content faithfully stored");

    // Invariant Check: Zero automatic persistent memory
    const automaticMemories = await ProjectMemory.find({ projectId: project._id });
    assert(automaticMemories.length === 0, "INVARIANT: Attachment is NOT automatically saved to ProjectMemory");

    console.log("\n[PIPELINE A.2] Domain × Methodology Context Assembly");
    const environment = resolveEnvironment({
      domain: project.domain,
      subdomain: project.subdomain,
      methodology: project.methodology,
    });
    assert(environment.environmentKey === "Cybersecurity × KANBAN", "Environment resolved to Cybersecurity × KANBAN");
    assert(environment.recommendedMetrics.includes("CVSS Remediation Speed (hours)"), "Contains specialized cybersecurity metrics");

    console.log("\n[PIPELINE A.3] Augmented Copilot Context Construction");
    const copilotContext = await buildAugmentedCopilotContext({
      projectId: project._id,
      userId: user._id,
      maxTokens: 3000,
    });
    assert(copilotContext != null, "Augmented Copilot context built");
    assert(copilotContext.formattedContext.includes("threat_model.md"), "Temporary attachment injected into prompt context");
    assert(copilotContext.formattedContext.includes("Cybersecurity"), "Domain context injected into prompt context");

    console.log("\n[PIPELINE A.4] Multimodal Copilot Q&A over Attachment");
    const aiAnswer = await answerMultimodalQuery({
      projectId: project._id,
      userId: user._id,
      query: "What requirements and risks are in our threat model?",
      attachmentIds: [attachment._id],
    });
    assert(aiAnswer.success === true, "Multimodal Copilot answered query");
    assert(aiAnswer.answer.includes("Found 2 requirements"), "Answer extracts factual requirements from attachment");
    assert(aiAnswer.advisoryOnly === true, "Maintains advisoryOnly invariant");

    // =========================================================================
    // PIPELINE B: DOMAIN + METHODOLOGY -> RESOLVER -> PROCESS INTEL -> ACADEMIC
    // =========================================================================
    console.log("\n[PIPELINE B.1] Process Intelligence on Project Execution History");
    const task1 = await Task.create({
      projectId: project._id,
      teamId: team._id,
      title: "Implement mTLS Handshake",
      status: "done",
      estimatedHours: 16,
      assignedTo: user._id,
    });

    await ProjectEvent.create({
      projectId: project._id,
      teamId: team._id,
      actorId: user._id,
      eventType: "TASK_STATUS_CHANGED",
      entityType: "task",
      entityId: task1._id.toString(),
      title: "mTLS Task Complete",
      previousValue: "IN_PROGRESS",
      newValue: "DONE",
      createdAt: new Date(),
    });

    const processIntel = await analyzeProjectProcess(project._id);
    assert(processIntel.status === "SUFFICIENT_EVIDENCE", "Process Mining executed on domain project");
    assert(processIntel.throughput.completedTasks === 1, "Accurately recorded completed work");

    console.log("\n[PIPELINE B.2] Academic Intelligence with Domain-Tailored Criteria");
    const rubric = await upsertAcademicRubric(
      project._id,
      {
        course: "Cyber Defense Capstone",
        semester: "Fall 2026",
        criteria: environment.tailoredAcademicCriteria,
      },
      user._id,
      user.name
    );
    assert(rubric.criteria.length > 0, "Configured academic rubric with domain-tailored criteria");
    assert(rubric.criteria.some(c => c.title.includes("Cybersecurity")), "Criteria reflect domain deliverables");

    const academicEval = await getAcademicEvaluation(project._id);
    assert(academicEval.noAutomaticGrading === true, "Strict academic human-control invariant maintained");

    // =========================================================================
    // PROMOTION & ISOLATION SAFETY VERIFICATION
    // =========================================================================
    console.log("\n[PROMOTION] Explicit User Action: Promote Attachment to Project Memory");
    const savedMemory = await promoteAttachmentToMemory(
      attachment._id,
      user._id,
      { category: "ARCHITECTURE_DECISION", title: "Approved Threat Model v1" },
      user.name
    );
    assert(savedMemory != null, "Memory record created upon explicit promotion");
    assert(savedMemory.title === "Approved Threat Model v1", "Title matches user promotion input");

    const activeMemories = await ProjectMemory.find({ projectId: project._id });
    assert(activeMemories.length === 1, "Exactly 1 persistent memory record exists after user action");

    console.log("\n[ISOLATION] Verify Unrelated Project Cannot Access Attachments or Memory");
    const otherContexts = await getProjectTemporaryContexts(otherProject._id, user._id);
    assert(otherContexts.length === 0, "Other project receives zero temporary contexts from Project A");

  } finally {
    console.log("\n[CLEANUP] Cleaning up integration test records...");
    if (user) await User.findByIdAndDelete(user._id);
    if (team) await Team.findByIdAndDelete(team._id);
    if (project) {
      await Project.findByIdAndDelete(project._id);
      await TemporaryContext.deleteMany({ projectId: project._id });
      await ProjectMemory.deleteMany({ projectId: project._id });
      await Task.deleteMany({ projectId: project._id });
      await ProjectEvent.deleteMany({ projectId: project._id });
    }
    if (otherProject) {
      await Project.findByIdAndDelete(otherProject._id);
      await TemporaryContext.deleteMany({ projectId: otherProject._id });
    }
    await mongoose.disconnect();
    console.log("Database connection closed cleanly.");
  }

  console.log("\n" + "=".repeat(60));
  console.log(`CROSS-WORKSTREAM INTEGRATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60) + "\n");
}

runIntegrationSuite().catch(err => {
  console.error("Fatal integration test error:", err);
  process.exit(1);
});
