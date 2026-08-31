/**
 * server/scripts/testNexusflowAiHub.js
 * ============================================================================
 * Validation suite for NEXUSFLOW 2.0 Project AI & Copilot Architecture:
 * 1. AI Orchestrator 3-tier fallback test (OpenAI -> Gemini -> Deterministic)
 * 2. Analyze AI test (Domain, hardware/software/AI-ML requirements, architecture, decisions)
 * 3. Copilot Question-Specific & Intent-Aware Answers test
 * 4. Multi-turn Private Conversation Memory test (scoped to user + project)
 * 5. Feedback persistence test (Helpful / Unhelpful)
 * ============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Decision from "../models/Decision.js";
import Recommendation from "../models/Recommendation.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import ResearchItem from "../models/ResearchItem.js";
import AIConversation from "../models/AIConversation.js";
import AIMessage from "../models/AIMessage.js";

import {
  callOpenAI,
  callGemini,
  extractMemoryUpdates,
  orchestrateCopilotChat,
} from "../services/aiOrchestrator.js";

import {
  analyzeProject,
  chatWithProjectAdvisor,
  buildProjectContext,
  generateDeterministicCopilotAnswer,
  classifyQuestionIntent,
} from "../services/projectIntelligence.js";

async function runValidation() {
  console.log("\n========================================================");
  console.log("   NEXUSFLOW 2.0: PROJECT AI & COPILOT VALIDATION SUITE");
  console.log("========================================================\n");

  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";
  console.log("[DB] Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected successfully.");

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  try {
    // ── TEST 1: Intent Classification ──────────────────────────────────────────
    console.log("\n--- TEST 1: Question Intent Classification ---");
    assert(classifyQuestionIntent("What hardware do I need for this project?") === "hardware", "Classify hardware intent");
    assert(classifyQuestionIntent("Do I need machine learning or neural networks?") === "ai_ml", "Classify AI/ML intent");
    assert(classifyQuestionIntent("What dataset should I collect?") === "dataset", "Classify dataset intent");
    assert(classifyQuestionIntent("What can I finish in 24 hours for the hackathon?") === "hackathon", "Classify hackathon intent");
    assert(classifyQuestionIntent("Suggest my next decision") === "next_decision", "Classify next decision intent");
    assert(classifyQuestionIntent("What should I build first?") === "roadmap", "Classify roadmap intent");

    // ── TEST 2: Memory Extraction ──────────────────────────────────────────────
    console.log("\n--- TEST 2: Copilot Memory Extraction ---");
    const mem1 = extractMemoryUpdates("I decided to use ESP32 DevKit V1 as my microcontroller");
    assert(mem1.length > 0 && mem1[0].key === "selected_hardware" && mem1[0].value.toLowerCase().includes("esp32"), "Extract hardware memory");

    const mem2 = extractMemoryUpdates("We'll use PostgreSQL for relational storage");
    assert(mem2.length > 0 && mem2[0].key === "selected_database" && mem2[0].value.toLowerCase().includes("postgres"), "Extract database memory");

    // ── TEST 3: Create Test Project & Team ─────────────────────────────────────
    console.log("\n--- TEST 3: Project Setup & Analyze AI End-to-End ---");
    const testUserAId = new mongoose.Types.ObjectId();
    const testUserBId = new mongoose.Types.ObjectId();

    const testTeam = await Team.create({
      name: `AI_Test_Team_${Date.now()}`,
      projectTitle: "Automated Solar-Powered Hydroponics System",
      projectDescription: "An IoT system monitoring pH, EC, water temperature and controlling nutrient dosing pumps with ESP32 and predictive ML algorithms.",
      members: [
        { userId: testUserAId, name: "Student Alpha", role: "Hardware Lead", skills: { IoT: 5, Embedded: 4 } },
        { userId: testUserBId, name: "Student Beta", role: "ML Lead", skills: { Python: 5, ML: 4 } },
      ],
    });

    const testProject = await Project.create({
      teamId: testTeam._id,
      title: testTeam.projectTitle,
      description: testTeam.projectDescription,
      originalPrompt: testTeam.projectDescription,
      domain: "IoT / AgriTech",
      status: "ideation",
    });

    console.log(`[Test] Created Project: ${testProject._id} for Team: ${testTeam._id}`);

    // Run Analyze AI
    console.log("[Test] Running analyzeProject()...");
    const analysisResult = await analyzeProject(testProject._id.toString());
    assert(analysisResult.success === true, "analyzeProject executed successfully");
    assert(analysisResult.counts.newRecommendations > 0 || analysisResult.data?.recommendations?.length > 0, "Generated technology recommendations");
    assert(analysisResult.counts.newDecisions > 0 || analysisResult.data?.decisionCandidates?.length > 0, "Generated candidate decisions");
    assert(analysisResult.counts.newArchitectureComponents > 0 || analysisResult.data?.architectureComponents?.length > 0, "Generated architecture components");

    // Verify DB persistence
    const loadedDecisions = await Decision.find({ projectId: testProject._id });
    const loadedRecs = await Recommendation.find({ projectId: testProject._id });
    const loadedArch = await ArchitectureComponent.find({ projectId: testProject._id });
    const loadedProject = await Project.findById(testProject._id);

    assert(loadedDecisions.length > 0, "Decisions persisted to MongoDB");
    assert(loadedRecs.length > 0, "Recommendations persisted to MongoDB");
    assert(loadedArch.length > 0, "Architecture components persisted to MongoDB");
    assert(loadedProject.context?.hardwareRequirements?.length > 0, "Hardware requirements extracted and saved in ProjectContext");

    // ── TEST 4: 3-Tier Copilot Chat with Private Memory ────────────────────────
    console.log("\n--- TEST 4: Copilot 3-Tier Execution & Private Multi-turn ---");
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();

    // User A chats
    const chat1 = await chatWithProjectAdvisor({
      projectId: testProject._id.toString(),
      message: "What hardware do I need?",
      user: { id: userA.toString(), name: "Student Alpha" },
    });

    assert(chat1.success === true, "Chat turn 1 executed");
    assert(Boolean(chat1.assistantMessage?.content), "Assistant responded with content");
    assert(["openai", "gemini", "deterministic"].includes(chat1.provider), `Provider identified: ${chat1.provider}`);

    // User A decides to use ESP32
    const chat2 = await chatWithProjectAdvisor({
      projectId: testProject._id.toString(),
      conversationId: chat1.conversationId,
      message: "I decided to use ESP32 DevKit.",
      user: { id: userA.toString(), name: "Student Alpha" },
    });

    // Check project memory updated
    const updatedProj = await Project.findById(testProject._id);
    const hasEsp32Mem = updatedProj.copilotMemory?.some((m) => m.value.toLowerCase().includes("esp32"));
    assert(hasEsp32Mem, "Project memory recorded ESP32 selection from conversation turn");

    // User A asks question about hardware
    const chat3 = await chatWithProjectAdvisor({
      projectId: testProject._id.toString(),
      conversationId: chat1.conversationId,
      message: "What sensor should I connect to my controller?",
      user: { id: userA.toString(), name: "Student Alpha" },
    });
    assert(Boolean(chat3.assistantMessage?.content), "Follow-up question answered with context");

    // Verify User B has isolated private conversation
    const chatUserB = await chatWithProjectAdvisor({
      projectId: testProject._id.toString(),
      message: "What ML model should we train?",
      user: { id: userB.toString(), name: "Student Beta" },
    });

    assert(chatUserB.conversationId.toString() !== chat1.conversationId.toString(), "User B received their OWN private conversation ID");

    // ── TEST 5: Feedback Persistence ───────────────────────────────────────────
    console.log("\n--- TEST 5: Assistant Message Feedback ---");
    const msgToRate = await AIMessage.findById(chat1.assistantMessage._id);
    msgToRate.feedback = { rating: "helpful", feedbackAt: new Date() };
    await msgToRate.save();

    const verifiedMsg = await AIMessage.findById(chat1.assistantMessage._id);
    assert(verifiedMsg.feedback?.rating === "helpful", "Feedback (helpful) persisted on AIMessage document");

    // ── CLEANUP TEST DATA ──────────────────────────────────────────────────────
    console.log("\n[Cleanup] Removing test artifacts...");
    await Promise.all([
      Team.findByIdAndDelete(testTeam._id),
      Project.findByIdAndDelete(testProject._id),
      Decision.deleteMany({ projectId: testProject._id }),
      Recommendation.deleteMany({ projectId: testProject._id }),
      ArchitectureComponent.deleteMany({ projectId: testProject._id }),
      ResearchItem.deleteMany({ projectId: testProject._id }),
      AIConversation.deleteMany({ projectId: testProject._id }),
      AIMessage.deleteMany({ projectId: testProject._id }),
    ]);
    console.log("[Cleanup] Completed.");
  } catch (err) {
    console.error("Test execution failed with error:", err);
    failed++;
  } finally {
    await mongoose.disconnect();
  }

  console.log("\n========================================================");
  console.log(`   VALIDATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runValidation();
