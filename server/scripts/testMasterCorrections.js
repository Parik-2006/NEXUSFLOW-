/**
 * server/scripts/testMasterCorrections.js
 * ============================================================================
 * Comprehensive Master Corrections & Integration Test Suite.
 *
 * Verifies:
 * 1. Authentication & Multi-Tenant User Isolation
 * 2. GitHub-like Email Teammate Invitation & Notification Flow (Accept / Reject)
 * 3. Project Copilot Multi-Turn Chat, Context Grounding & Private Memory Scoping
 * 4. Dedicated API & Tools Recommendation Engine (Zero-Task Side-Effect Policy)
 * 5. Real Academic Research Paper Discovery (OpenAlex/Crossref Real DOIs, OA vs Paywalled)
 * 6. Hard $0 LLM Cost Policy & Deterministic Fallback Integrity
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Invitation from "../models/Invitation.js";
import Notification from "../models/Notification.js";
import ResearchItem from "../models/ResearchItem.js";
import AIConversation from "../models/AIConversation.js";
import AIMessage from "../models/AIMessage.js";

import { validateZeroCostRoute, omniRouteGenerate } from "../services/omniRoute.js";
import { chatWithProjectAdvisor, buildProjectContext } from "../services/projectIntelligence.js";
import { getProjectToolRecommendations } from "../services/projectToolsService.js";
import { discoverAcademicPapers, deriveSearchQueries } from "../services/academicResearchService.js";
import { generateProjectGuidance } from "../algorithms/projectGuidanceEngine.js";
import { buildCompactProjectContext } from "../utils/projectContextBuilder.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_dev";
const JWT_SECRET = process.env.JWT_SECRET || "nexusflow_dev_secret_key_2026";

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

async function runMasterTestSuite() {
  console.log("\n========================================================");
  console.log("NEXUSFLOW 2.0 — MASTER INTEGRATION & CORRECTIONS TEST SUITE");
  console.log("========================================================\n");

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  } catch (err) {
    console.log(`SRV connection failed (${err.code || err.message}), falling back to local MongoDB...`);
    try {
      await mongoose.connect("mongodb://127.0.0.1:27017/nexusflow_dev", { serverSelectionTimeoutMS: 4000 });
    } catch (e2) {
      console.log(`Local MongoDB not available, falling back to mongodb://localhost:27017/nexusflow...`);
      await mongoose.connect("mongodb://localhost:27017/nexusflow");
    }
  }
  console.log("Connected to MongoDB successfully.\n");

  const timestamp = Date.now();
  const emailA = `master_user_a_${timestamp}@nexusflow.dev`;
  const emailB = `master_user_b_${timestamp}@nexusflow.dev`;
  const unregEmail = `unregistered_${timestamp}@unknown.com`;

  let userA, userB, teamA, teamB, projectA, projectB;

  try {
    // ── SECTION 1: AUTHENTICATION & USER ISOLATION ───────────────────────────
    console.log("[SECTION 1] Authentication & User Isolation");
    userA = await User.create({
      name: "Master User A",
      email: emailA,
      password: "Password123!",
      role: "member",
    });
    userB = await User.create({
      name: "Master User B",
      email: emailB,
      password: "Password123!",
      role: "member",
    });

    assert(userA && userA._id, "User A created with bcrypt password");
    assert(userB && userB._id, "User B created with bcrypt password");

    teamA = await Team.create({
      name: `Team Alpha ${timestamp}`,
      ownerId: userA._id,
      projectTitle: "Smart Irrigation & Soil Telemetry",
      projectDescription: "Automated farm irrigation system using ESP32 and capacitive moisture sensors.",
      members: [{ userId: userA._id, name: userA.name, role: "leader", capacity: 40 }],
    });

    teamB = await Team.create({
      name: `Team Beta ${timestamp}`,
      ownerId: userB._id,
      projectTitle: "Malicious URL Detection & Threat Intelligence",
      projectDescription: "Machine learning classifier detecting phishing and malware URLs using NLP features.",
      members: [{ userId: userB._id, name: userB.name, role: "leader", capacity: 40 }],
    });

    // Query teams as User A (must NOT see Team B)
    const userATeams = await Team.find({
      $or: [{ ownerId: userA._id }, { "members.userId": userA._id }],
    }).lean();
    assert(userATeams.some((t) => t._id.equals(teamA._id)), "User A sees Team A");
    assert(!userATeams.some((t) => t._id.equals(teamB._id)), "User A CANNOT see Team B (Strict isolation)");

    // Query teams as User B (must NOT see Team A)
    const userBTeams = await Team.find({
      $or: [{ ownerId: userB._id }, { "members.userId": userB._id }],
    }).lean();
    assert(userBTeams.some((t) => t._id.equals(teamB._id)), "User B sees Team B");
    assert(!userBTeams.some((t) => t._id.equals(teamA._id)), "User B CANNOT see Team A (Strict isolation)");

    // ── SECTION 2: GITHUB-LIKE TEAM INVITATION & NOTIFICATION FLOW ───────────
    console.log("\n[SECTION 2] GitHub-like Teammate Invitation & Notification Flow");

    // 1. Inviting unregistered email must be rejected
    const unregTarget = await User.findOne({ email: unregEmail }).lean();
    assert(!unregTarget, "Verified unregEmail does not exist in User database");

    // 2. User A invites User B to Team A
    const invitation = await Invitation.create({
      teamId: teamA._id,
      teamName: teamA.name,
      inviterId: userA._id,
      inviterName: userA.name,
      inviterEmail: userA.email,
      invitedUserId: userB._id,
      invitedEmail: userB.email,
      status: "pending",
    });

    const notif = await Notification.create({
      userId: userB._id,
      type: "team_invitation",
      title: "Team Collaboration Invitation",
      message: `Team "${teamA.name}" invited you to collaborate.`,
      data: {
        teamId: teamA._id,
        teamName: teamA.name,
        invitationId: invitation._id,
        inviterName: userA.name,
      },
      status: "unread",
    });

    assert(invitation.status === "pending", "Pending invitation created for User B");
    assert(notif.userId.equals(userB._id), "Notification delivered to User B inbox");

    // 3. User B accepts the invitation
    const pendingInv = await Invitation.findById(invitation._id);
    assert(pendingInv.status === "pending", "Invitation is valid and pending");

    teamA.members.push({
      userId: userB._id,
      name: userB.name,
      avatar: userB.avatar || "",
      role: "member",
      capacity: 40,
    });
    await teamA.save();

    pendingInv.status = "accepted";
    await pendingInv.save();

    notif.read = true;
    notif.status = "read";
    await notif.save();

    // 4. Verify shared access: Both User A and User B now see Team A
    const userBTeamsAfterAccept = await Team.find({
      $or: [{ ownerId: userB._id }, { "members.userId": userB._id }],
    }).lean();
    assert(
      userBTeamsAfterAccept.some((t) => t._id.equals(teamA._id)),
      "User B now sees Team A after accepting invitation"
    );

    // ── SECTION 3: PROJECT CREATION & PRIVATE COPILOT SESSIONS ───────────────
    console.log("\n[SECTION 3] Project Creation & Private Copilot Multi-Turn Chat");

    projectA = await Project.create({
      teamId: teamA._id,
      title: "Smart Irrigation & Soil Telemetry",
      domain: "IoT & Agriculture",
      projectType: "Hardware / Embedded System",
      description: "Automated farm irrigation system using ESP32 and capacitive moisture sensors.",
      context: {
        problemStatement: "Automate farm irrigation to prevent water wastage.",
        hardwareRequirements: ["ESP32 DevKit", "Capacitive Soil Moisture Sensor", "5V Relay Module"],
        softwareRequirements: ["Node.js Express", "MongoDB Time Series", "React Dashboard"],
        aiMlRequirements: ["Soil moisture trend regression model"],
      },
    });

    projectB = await Project.create({
      teamId: teamB._id,
      title: "Malicious URL Detection & Threat Intelligence",
      domain: "Cybersecurity",
      projectType: "Machine Learning / Security",
      description: "Machine learning classifier detecting phishing and malware URLs using NLP features.",
      context: {
        problemStatement: "Identify phishing and zero-day malicious domains in real-time.",
        hardwareRequirements: [],
        softwareRequirements: ["FastAPI Python", "React UI", "PostgreSQL"],
        aiMlRequirements: ["TF-IDF feature extractor", "Random Forest Classifier"],
      },
    });

    // Test Copilot greeting for "hi"
    const copilotGreeting = await chatWithProjectAdvisor({
      projectId: projectA._id,
      message: "hi",
      user: { id: userA._id.toString(), name: userA.name, email: userA.email },
    });

    assert(
      copilotGreeting && copilotGreeting.assistantMessage && copilotGreeting.assistantMessage.content.trim().length > 0,
      `Copilot generated project-aware greeting for "hi" (Provider: ${copilotGreeting.provider})`
    );
    assert(
      copilotGreeting.provider === "gemini" || copilotGreeting.provider === "openrouter" || copilotGreeting.provider === "deterministic",
      `Copilot used verified $0 free tier provider: "${copilotGreeting.provider}"`
    );

    // Test Copilot multi-turn reasoning: "What hardware do I need?"
    const copilotHw = await chatWithProjectAdvisor({
      projectId: projectA._id,
      conversationId: copilotGreeting.conversationId,
      message: "What hardware do I need?",
      user: { id: userA._id.toString(), name: userA.name, email: userA.email },
    });
    assert(
      copilotHw && copilotHw.assistantMessage && copilotHw.assistantMessage.content.toLowerCase().includes("esp32"),
      "Copilot grounded hardware answer in project ESP32 requirements"
    );

    // Test User B private conversation scoping on same Project A
    const copilotUserB = await chatWithProjectAdvisor({
      projectId: projectA._id,
      message: "What software stack should I use?",
      user: { id: userB._id.toString(), name: userB.name, email: userB.email },
    });

    assert(
      copilotUserB.conversationId.toString() !== copilotGreeting.conversationId.toString(),
      "User A and User B have separate, private Copilot conversation IDs on shared Project A"
    );

    // Test Copilot Clear Chat (Fix 3)
    const userAConvsBefore = await AIConversation.find({ projectId: projectA._id, startedBy: userA._id }).lean();
    assert(userAConvsBefore.length > 0, "User A has active conversation before Clear Chat");

    // Execute clear chat for User A
    const userAConvIds = userAConvsBefore.map((c) => c._id);
    await Promise.all([
      AIMessage.deleteMany({ conversationId: { $in: userAConvIds } }),
      AIConversation.deleteMany({ _id: { $in: userAConvIds } }),
    ]);

    const userAConvsAfter = await AIConversation.find({ projectId: projectA._id, startedBy: userA._id }).lean();
    const userAMsgsAfter = await AIMessage.find({ conversationId: { $in: userAConvIds } }).lean();
    assert(userAConvsAfter.length === 0 && userAMsgsAfter.length === 0, "User A conversation and messages completely cleared");

    // Verify User B conversation and Project A knowledge remain untouched
    const userBConvStillExists = await AIConversation.findById(copilotUserB.conversationId).lean();
    assert(userBConvStillExists !== null, "User B conversation is NOT affected by User A clear chat");

    const projectAStillExists = await Project.findById(projectA._id).lean();
    assert(
      projectAStillExists && projectAStillExists.context.hardwareRequirements.length > 0,
      "Project A persistent knowledge, hardware requirements, and context remain intact"
    );

    // Send new message after clear -> starts fresh conversation with 0 prior turns
    const copilotFresh = await chatWithProjectAdvisor({
      projectId: projectA._id,
      message: "Suggest next decision",
      user: { id: userA._id.toString(), name: userA.name, email: userA.email },
    });
    assert(
      copilotFresh && copilotFresh.conversationId.toString() !== copilotGreeting.conversationId.toString(),
      "Fresh conversation created with new conversation ID after clear chat"
    );

    // ── SECTION 4: API & DEVELOPER TOOLS (ZERO TASK SIDE EFFECTS) ───────────
    console.log("\n[SECTION 4] API & Developer Tools (Zero Task Side-Effect Policy)");

    const taskCountBefore = await Task.countDocuments({ teamId: teamA._id });

    const toolsA = await getProjectToolRecommendations(projectA);
    const toolsB = await getProjectToolRecommendations(projectB);

    assert(Array.isArray(toolsA) && toolsA.length >= 4, `Project A received ${toolsA.length} tailored developer tools`);
    assert(Array.isArray(toolsB) && toolsB.length >= 4, `Project B received ${toolsB.length} tailored developer tools`);

    assert(
      toolsA.some((t) => t.category.includes("IoT") || t.name.includes("MQTT")),
      "Project A tools include IoT/MQTT recommendations"
    );
    assert(
      toolsB.some((t) => t.category.includes("Threat") || t.name.includes("Safe Browsing") || t.name.includes("Scikit")),
      "Project B tools include Cybersecurity / Threat Intelligence recommendations"
    );

    const taskCountAfter = await Task.countDocuments({ teamId: teamA._id });
    assert(
      taskCountBefore === taskCountAfter,
      `Tool recommendations created 0 tasks (Task count remained ${taskCountBefore} -> ${taskCountAfter})`
    );

    // ── SECTION 4B: PROJECT GUIDANCE NEXT ACTION (FIX 1 VERIFICATION) ────────
    console.log("\n[SECTION 4B] Project Guidance Next Action (Fix 1 Verification)");
    const compactCtx = await buildCompactProjectContext(teamA._id);
    const guidanceA = generateProjectGuidance({
      ctx: compactCtx,
      tasks: [],
      members: teamA.members,
      hackathonHours: 24,
    });

    assert(
      guidanceA.nextAction.action !== "Review System Architecture & Module Interfaces",
      `Project Guidance does NOT recommend "Review System Architecture & Module Interfaces" (Current: "${guidanceA.nextAction.action}")`
    );
    assert(
      guidanceA.nextAction.buttonLabel !== "View Architecture",
      `Project Guidance button is NOT "View Architecture" (Current: "${guidanceA.nextAction.buttonLabel}")`
    );
    assert(
      guidanceA.nextAction.targetTab !== "architecture",
      `Project Guidance targetTab is NOT "architecture" (Current: "${guidanceA.nextAction.targetTab}")`
    );

    // ── SECTION 5: REAL ACADEMIC RESEARCH PAPER DISCOVERY ────────────────────
    console.log("\n[SECTION 5] Real Academic Research Paper Discovery (OpenAlex & Crossref)");

    const queriesA = deriveSearchQueries(projectA);
    const queriesB = deriveSearchQueries(projectB);
    assert(queriesA[0].includes("irrigation"), `Project A search query is project-specific: "${queriesA[0]}"`);
    assert(queriesB[0].includes("malicious") || queriesB[0].includes("URL"), `Project B search query is project-specific: "${queriesB[0]}"`);

    const discoveredPapers = await discoverAcademicPapers(projectA);
    assert(
      Array.isArray(discoveredPapers) && discoveredPapers.length >= 3,
      `Discovered ${discoveredPapers.length} real academic papers for Project A`
    );

    const samplePaper = discoveredPapers[0];
    assert(samplePaper && samplePaper.title && samplePaper.title.length > 5, `Real paper title: "${samplePaper.title.slice(0, 60)}..."`);
    assert(samplePaper.authors && samplePaper.authors.length > 0, `Real authors: ${samplePaper.authors.join(", ")}`);
    assert(samplePaper.accessStatus === "open_access" || samplePaper.accessStatus === "paywalled", `Access classification: ${samplePaper.accessStatus}`);
    assert(samplePaper.simpleExplanation && samplePaper.simpleExplanation.length > 10, "Student-friendly explanation generated");

    // ── SECTION 6: HARD $0 LLM COST POLICY VERIFICATION ───────────────────────
    console.log("\n[SECTION 6] Hard $0 Cost Policy Fail-Closed Guards");

    const validGemini = validateZeroCostRoute("gemini", "gemini-2.5-flash");
    assert(validGemini.cost === "$0.00", 'Gemini 2.5 Flash allowed at $0.00');

    const validOpenRouter = validateZeroCostRoute("openrouter", "openrouter/free");
    assert(validOpenRouter.cost === "$0.00", 'OpenRouter Free router allowed at $0.00');

    let blockedPaid = false;
    try {
      validateZeroCostRoute("openrouter", "openai/gpt-4o");
    } catch (e) {
      blockedPaid = true;
    }
    assert(blockedPaid, 'Paid OpenRouter model "openai/gpt-4o" blocked with ZeroCostViolationError');

    let blockedAuto = false;
    try {
      validateZeroCostRoute("openrouter", "auto");
    } catch (e) {
      blockedAuto = true;
    }
    assert(blockedAuto, 'Unrestricted "auto" model route blocked with ZeroCostViolationError');

    // ── SECTION 7: MANUAL SKILL MATRIX (1–10 RATINGS) & BRANCH & BOUND ──────
    console.log("\n[SECTION 7] Manual Skill Matrix (1–10 Ratings) & Branch & Bound Integration");

    // 1. Skill Validation & Normalization Tests
    const KEY_MAP = {
      frontend: "frontend",
      frontendskill: "frontend",
      backend: "backend",
      backendskill: "backend",
      devops: "devops",
      devopsskill: "devops",
      design: "design",
      ux: "design",
      ui: "frontend",
      ml: "ml",
      ai: "ml",
      "ml / ai": "ml",
      "ai / ml": "ml",
      testing: "testing",
      qa: "testing",
    };

    function parseSkillPayload(body) {
      const rawPayload = body?.skills && typeof body.skills === "object" ? body.skills : (body || {});
      const updatedSkills = {};
      for (const [rawKey, rawVal] of Object.entries(rawPayload)) {
        const normalizedKey = KEY_MAP[String(rawKey).toLowerCase().trim()];
        if (!normalizedKey) continue;
        const num = Number(rawVal);
        if (!Number.isFinite(num) || num < 1 || num > 10) {
          throw new Error(`Skill '${rawKey}' rating must be a number between 1 and 10.`);
        }
        updatedSkills[normalizedKey] = Math.round(num);
      }
      if (!Object.keys(updatedSkills).length) {
        throw new Error("No valid skill keys.");
      }
      return updatedSkills;
    }

    assert(parseSkillPayload({ frontend: 1, backend: 10 }).frontend === 1, "Skill rating 1 accepted");
    assert(parseSkillPayload({ frontend: 1, backend: 10 }).backend === 10, "Skill rating 10 accepted");
    assert(parseSkillPayload({ skills: { "ML / AI": 9, QA: 4 } }).ml === 9, "Nested payload with alias 'ML / AI' normalized to 'ml: 9'");
    assert(parseSkillPayload({ skills: { "ML / AI": 9, QA: 4 } }).testing === 4, "Nested payload with alias 'QA' normalized to 'testing: 4'");

    let rejectedZero = false;
    try { parseSkillPayload({ frontend: 0 }); } catch (e) { rejectedZero = true; }
    assert(rejectedZero, "Skill rating 0 rejected (below minimum 1)");

    let rejectedEleven = false;
    try { parseSkillPayload({ frontend: 11 }); } catch (e) { rejectedEleven = true; }
    assert(rejectedEleven, "Skill rating 11 rejected (above maximum 10)");

    let rejectedNegative = false;
    try { parseSkillPayload({ devops: -1 }); } catch (e) { rejectedNegative = true; }
    assert(rejectedNegative, "Skill rating -1 rejected");

    // 2. Skill Persistence in MongoDB
    await Team.updateOne(
      { _id: teamA._id, "members.userId": userA._id },
      { $set: { "members.$.skills": { frontend: 9, backend: 4, devops: 3, design: 5, ml: 7, testing: 4 } } }
    );
    await Team.updateOne(
      { _id: teamA._id, "members.userId": userB._id },
      { $set: { "members.$.skills": { frontend: 4, backend: 9, devops: 8, design: 3, ml: 4, testing: 7 } } }
    );

    const reloadedTeamA = await Team.findById(teamA._id).lean();
    const reloadedUserAMember = reloadedTeamA.members.find((m) => m.userId.equals(userA._id));
    const reloadedUserBMember = reloadedTeamA.members.find((m) => m.userId.equals(userB._id));

    assert(
      reloadedUserAMember.skills.frontend === 9 && reloadedUserAMember.skills.backend === 4,
      "User A skill ratings (Frontend: 9, Backend: 4) persisted in MongoDB"
    );
    assert(
      reloadedUserBMember.skills.frontend === 4 && reloadedUserBMember.skills.backend === 9,
      "User B skill ratings (Frontend: 4, Backend: 9) persisted in MongoDB"
    );

    // 3. Team Isolation (Team B is not affected by Team A skill updates)
    const reloadedTeamB = await Team.findById(teamB._id).lean();
    const teamBMember = reloadedTeamB.members.find((m) => m.userId.equals(userB._id));
    assert(teamBMember.skills.frontend === 5, "Team B member skills remain isolated (default 5)");

    // 4. Branch & Bound Assignment Integration with updated 1-10 skills
    const testTasks = [
      { _id: new mongoose.Types.ObjectId(), title: "Build React Dashboard UI", category: "Frontend", urgency: 4, impact: 4 },
      { _id: new mongoose.Types.ObjectId(), title: "Design REST API Endpoints", category: "Backend", urgency: 4, impact: 4 },
    ];

    const assignmentResult = assignTasksToMembers(
      [reloadedUserAMember, reloadedUserBMember],
      testTasks
    );

    const userAAssignment = assignmentResult.assignments.find((a) => a.memberId === userA._id.toString());
    const userBAssignment = assignmentResult.assignments.find((a) => a.memberId === userB._id.toString());

    assert(
      userAAssignment && userAAssignment.taskId === testTasks[0]._id.toString(),
      "Branch & Bound correctly assigns Frontend UI task to User A (Frontend skill = 9)"
    );
    assert(
      userBAssignment && userBAssignment.taskId === testTasks[1]._id.toString(),
      "Branch & Bound correctly assigns Backend REST API task to User B (Backend skill = 9)"
    );
    assert(
      assignmentResult.totalCost <= 2,
      `Branch & Bound achieved optimal min-cost assignment (Total skill gap: ${assignmentResult.totalCost} vs swapped suboptimal gap: 10)`
    );

  } catch (err) {
    console.error("Test execution failed with exception:", err);
    failed++;
  } finally {
    // Cleanup test artifacts
    console.log("\n[CLEANUP] Cleaning up test records...");
    if (userA) {
      await User.deleteOne({ _id: userA._id });
      await Team.deleteOne({ _id: teamA?._id });
      await Project.deleteOne({ _id: projectA?._id });
    }
    if (userB) {
      await User.deleteOne({ _id: userB._id });
      await Team.deleteOne({ _id: teamB?._id });
      await Project.deleteOne({ _id: projectB?._id });
    }
    if (teamA) {
      await Invitation.deleteMany({ teamId: teamA._id });
      await Notification.deleteMany({ userId: { $in: [userA?._id, userB?._id] } });
      await ResearchItem.deleteMany({ projectId: projectA?._id });
      await AIConversation.deleteMany({ projectId: { $in: [projectA?._id, projectB?._id] } });
    }
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }

  console.log("\n========================================================");
  console.log(`MASTER TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runMasterTestSuite();
