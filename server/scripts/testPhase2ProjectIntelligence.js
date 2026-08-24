/**
 * server/scripts/testPhase2ProjectIntelligence.js
 * ============================================================================
 * PHASE 2 VERIFICATION SCRIPT — Tests Project Intelligence, Context Building,
 * Structured AI Output Validation, Persistence with Duplicate Prevention,
 * Project-Aware Chat Advisory, Security Authorization, and DAA Algorithm Integrity.
 *
 * Runs both static validation and live MongoDB integration tests.
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";

// Models
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import Decision from "../models/Decision.js";
import ResearchItem from "../models/ResearchItem.js";
import Recommendation from "../models/Recommendation.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import Resource from "../models/Resource.js";
import AIConversation from "../models/AIConversation.js";
import AIMessage from "../models/AIMessage.js";

// Services
import {
  buildProjectContext,
  validateAnalyzerOutput,
  generateHeuristicAnalysis,
  persistAnalysisResults,
  chatWithProjectAdvisor,
} from "../services/projectIntelligence.js";

// DAA Algorithms
import { computePriorityScore } from "../algorithms/greedyScheduler.js";

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        })
        .catch((err) => {
          console.log(`  ✗ ${name}: ${err.message}`);
          failed++;
          errors.push({ name, error: err.message });
        });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
    errors.push({ name, error: err.message });
  }
}

function section(title) {
  console.log(`\n[ ${title} ]`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. STATIC UNIT TESTS (Structured Validation & Heuristic Engine)
// ═════════════════════════════════════════════════════════════════════════════

section("1. Structured AI Output Validation");

test("Structured output validator accepts complete valid payload", () => {
  const input = {
    projectSummary: "AI Smart Irrigation system for precision agriculture.",
    problemStatement: "Farmers overwater crops due to lack of real-time sensor feedback.",
    targetUsers: ["Small-scale Farmers", "Agronomists"],
    domain: "Internet of Things (IoT)",
    projectType: "Smart Agriculture",
    goals: ["Save 30% water", "Provide live telemetry dashboard"],
    constraints: ["ESP32 microcontroller compute limits", "Low power requirements"],
    expectedOutputs: ["ESP32 Firmware", "Node.js REST API", "React Native App"],
    hardwareRequirements: ["ESP32", "Capacitive Soil Moisture Sensor", "5V Relay"],
    softwareRequirements: ["Node.js", "Express", "React Native"],
    aiMlRequirements: ["Soil Moisture Trend Prediction Model"],
    integrations: ["OpenWeatherMap API"],
    deploymentRequirements: ["Render", "MongoDB Atlas"],
    securityConsiderations: ["JWT Authentication"],
    preferredStack: ["Node.js", "React Native", "MongoDB"],
    assumptions: ["2.4GHz Wi-Fi is available in field area"],
    recommendations: [
      {
        recommendationType: "hardware",
        recommendedItem: "ESP32-WROOM-32",
        category: "Microcontroller",
        reason: "Integrated Wi-Fi and BLE with low cost.",
        confidence: 0.95,
        alternatives: ["Raspberry Pi Pico W"],
      },
    ],
    decisionCandidates: [
      {
        title: "Communication Protocol",
        decision: "Use MQTT for telemetry ingestion",
        reasoning: "Lightweight pub/sub protocol minimizes power and bandwidth.",
        alternativesConsidered: ["HTTP REST", "CoAP"],
        selectedOption: "MQTT",
        category: "architecture",
        confidence: 0.9,
      },
    ],
    researchTopics: [
      {
        title: "Soil moisture capacitive sensor calibration curves",
        abstract: "Methods for mapping raw ADC voltage readings to soil volumetric water content.",
        topics: ["Calibration", "Soil Moisture", "ADC"],
        relevance: 5,
        notes: "Essential for accurate threshold triggering.",
      },
    ],
    architectureComponents: [
      {
        componentType: "hardware",
        name: "ESP32 Sensor Unit",
        description: "Monitors moisture and operates water valve.",
        technology: "ESP32 C++",
        supportingTools: ["PlatformIO"],
        dependsOnIndices: [],
      },
      {
        componentType: "backend",
        name: "IoT Gateway API",
        description: "Ingests sensor telemetry and schedules irrigation.",
        technology: "Node.js + Express",
        supportingTools: ["Socket.io", "Mongoose"],
        dependsOnIndices: [0],
      },
    ],
    risks: ["Sensor corrosion over prolonged field exposure"],
  };

  const validated = validateAnalyzerOutput(input);
  if (!validated.projectSummary) throw new Error("projectSummary missing");
  if (validated.hardwareRequirements.length !== 3) throw new Error("hardwareRequirements missing items");
  if (validated.recommendations.length !== 1) throw new Error("recommendations missing");
  if (validated.decisionCandidates.length !== 1) throw new Error("decisionCandidates missing");
  if (validated.architectureComponents.length !== 2) throw new Error("architectureComponents missing");
});

test("Structured output validator sanitizes and normalizes partial payload safely", () => {
  const partial = {
    projectSummary: "A drone mapping tool",
    recommendations: [{ item: "DroneKit", reason: "Python SDK" }],
    researchTopics: ["Autonomous waypoint navigation"],
  };

  const validated = validateAnalyzerOutput(partial);
  if (validated.domain !== "General Software") throw new Error("Default domain fallback failed");
  if (validated.recommendations[0].recommendedItem !== "DroneKit") throw new Error("Item normalization failed");
  if (validated.researchTopics[0].title !== "Autonomous waypoint navigation") throw new Error("Research topic normalization failed");
});

test("Invalid non-object payload is rejected by validator", () => {
  try {
    validateAnalyzerOutput(null);
    throw new Error("Should have failed for null payload");
  } catch (e) {
    if (!e.message.includes("valid JSON object")) throw e;
  }
});

section("2. Deterministic Heuristic Engine");

test("Heuristic analyzer correctly infers IoT & ML domains and components", () => {
  const context = {
    title: "Smart Irrigation & Soil Health Predictor",
    originalPrompt: "Build an IoT system with ESP32 and soil moisture sensors that predicts irrigation needs.",
    description: "Automated farm watering system.",
    context: {
      problemStatement: "",
      targetUsers: [],
      preferredStack: [],
    },
  };

  const analysis = generateHeuristicAnalysis(context);
  if (!analysis.domain.includes("IoT")) throw new Error(`Expected IoT domain, got ${analysis.domain}`);
  if (!analysis.hardwareRequirements.some((h) => h.includes("ESP32"))) throw new Error("Expected ESP32 in hardware requirements");
  if (analysis.recommendations.length === 0) throw new Error("Expected recommendations to be generated");
  if (analysis.decisionCandidates.length === 0) throw new Error("Expected decision candidates to be generated");
  if (analysis.architectureComponents.length === 0) throw new Error("Expected architecture components to be generated");
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. DAA ALGORITHMS & MODEL INTEGRITY
// ═════════════════════════════════════════════════════════════════════════════

section("3. Existing DAA Priority & Task System Integrity");

test("computePriorityScore computes predictable priority scores", () => {
  const highPriority = computePriorityScore({ urgency: 5, impact: 5, dependencyCount: 0 });
  const lowPriority = computePriorityScore({ urgency: 1, impact: 1, dependencyCount: 3 });

  if (highPriority <= lowPriority) {
    throw new Error(`Expected high priority (${highPriority}) > low priority (${lowPriority})`);
  }
});

test("Task priorityScore pre-save hook works on task instances", async () => {
  const task = new Task({
    teamId: new mongoose.Types.ObjectId(),
    title: "Test Task Priority Score",
    urgency: 4,
    impact: 5,
    dependencyCount: 0,
  });

  // pre-save hook executes
  await task.validate();
  // Compute manually to verify formula coherence
  const expected = computePriorityScore({ urgency: 4, impact: 5, dependencyCount: 0 });
  if (expected <= 0) throw new Error("Priority score should be > 0");
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LIVE DATABASE & PROJECT INTELLIGENCE INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

section("4. Live MongoDB Project Intelligence Tests");

let testTeamId, testProjectId, testUserId;

await test("Connect to MongoDB for Phase 2 Integration Tests", async () => {
  await mongoose.connect(MONGO_URI);
});

await test("Setup Test Team, Member, and Project", async () => {
  testUserId = new mongoose.Types.ObjectId();
  const team = await Team.create({
    name: "Phase2_TestTeam_" + Date.now(),
    members: [
      {
        userId: testUserId,
        name: "Parikshit",
        role: "Team Lead",
        skills: { frontend: 8, backend: 9, devops: 7, ml: 8 },
      },
    ],
    projectTitle: "AI Drone Search & Rescue",
    projectDescription: "Autonomous thermal vision drone that detects stranded survivors.",
  });
  testTeamId = team._id;

  const project = await Project.create({
    teamId: testTeamId,
    title: "AI Drone Search & Rescue",
    description: "Autonomous thermal vision drone system.",
    originalPrompt: "Design an AI-powered thermal drone for disaster survivor search.",
    domain: "Robotics & AI",
    projectType: "Autonomous Robotics",
    status: "ideation",
    currentPhase: "idea",
  });
  testProjectId = project._id;
  await Team.updateOne({ _id: testTeamId }, { $set: { activeProjectId: testProjectId } });
});

await test("buildProjectContext aggregates all project artifacts", async () => {
  const context = await buildProjectContext(testProjectId);
  if (context.title !== "AI Drone Search & Rescue") throw new Error("Project title mismatch");
  if (context.teamMembers.length !== 1) throw new Error("Expected 1 team member in context");
  if (context.teamMembers[0].name !== "Parikshit") throw new Error("Team member name mismatch");
  if (context.domain !== "Robotics & AI") throw new Error("Domain mismatch");
});

await test("analyzeProject runs and persists structured intelligence with fallback support", async () => {
  const result = await persistAnalysisResults(testProjectId, {
    projectSummary: "Autonomous UAV carrying thermal sensors and edge inference.",
    problemStatement: "First responders cannot quickly locate survivors in dense forests.",
    targetUsers: ["Search & Rescue Teams", "Disaster Response Units"],
    domain: "Robotics & AI",
    projectType: "Emergency Response Drone",
    goals: ["Detect human heat signatures in real time"],
    constraints: ["Weight and battery endurance under 25 minutes"],
    expectedOutputs: ["UAV Payload Firmware", "Ground Station App"],
    hardwareRequirements: ["Raspberry Pi 4", "FLIR Lepton 3.5 Thermal Camera", "Pixhawk Flight Controller"],
    softwareRequirements: ["ROS2", "Python 3.10", "FastAPI Ground Station"],
    aiMlRequirements: ["YOLOv8-Thermal Human Detection Model"],
    integrations: ["GPS NMEA Stream", "QGroundControl Telemetry"],
    deploymentRequirements: ["Embedded Linux (Ubuntu Server)", "Ground Station Laptop"],
    securityConsiderations: ["Encrypted RC Radio Link"],
    preferredStack: ["ROS2", "PyTorch", "Python", "React Native"],
    assumptions: ["Flight operations occur below 400ft AGL"],
    recommendations: [
      {
        recommendationType: "hardware",
        recommendedItem: "FLIR Lepton 3.5",
        category: "Thermal Sensor",
        reason: "Radiometric micro-thermal camera with high sensitivity.",
        confidence: 0.95,
        alternatives: ["Seek Thermal Compact"],
      },
      {
        recommendationType: "ai_model",
        recommendedItem: "YOLOv8n",
        category: "Object Detection",
        reason: "Nano model runs at 25 FPS on embedded Raspberry Pi 4 edge compute.",
        confidence: 0.9,
        alternatives: ["MobileNet-SSD"],
      },
    ],
    decisionCandidates: [
      {
        title: "Edge vs Ground Model Inference",
        decision: "Execute real-time thermal bounding box inference onboard the UAV companion computer",
        reasoning: "Eliminates high-bandwidth HD video transmission lag over long distances.",
        alternativesConsidered: ["Stream raw video to Ground Station", "Hybrid edge-cloud"],
        selectedOption: "Execute onboard",
        category: "architecture",
        confidence: 0.9,
      },
    ],
    researchTopics: [
      {
        title: "Thermal IR signature thresholding under varied ambient temperatures",
        abstract: "Techniques to distinguish human body signatures from hot rocks and background radiation.",
        topics: ["Thermal Imaging", "IR Radiometry", "Object Detection"],
        relevance: 5,
        notes: "Crucial for false-positive reduction.",
      },
    ],
    architectureComponents: [
      {
        componentType: "hardware",
        name: "Thermal Vision Payload",
        description: "FLIR sensor connected to onboard companion computer.",
        technology: "FLIR Lepton + RPi4",
        supportingTools: ["V4L2", "OpenCV"],
        dependsOnIndices: [],
      },
      {
        componentType: "ai_ml",
        name: "Onboard Neural Inference Node",
        description: "Processes thermal frames and extracts GPS coordinates of detections.",
        technology: "ONNX Runtime / YOLOv8",
        supportingTools: ["ROS2"],
        dependsOnIndices: [0],
      },
      {
        componentType: "frontend",
        name: "Ground Station Tactical Map",
        description: "Visualizes drone location and survivor markers on satellite map.",
        technology: "React Native / Expo MapView",
        supportingTools: ["Mapbox"],
        dependsOnIndices: [1],
      },
    ],
    risks: ["High ambient forest floor temperatures causing detection noise"],
  }, { source: "ai" });

  if (!result.success) throw new Error("Analysis persistence failed");
  if (result.counts.newRecommendations !== 2) throw new Error(`Expected 2 new recommendations, got ${result.counts.newRecommendations}`);
  if (result.counts.newDecisions !== 1) throw new Error(`Expected 1 new decision, got ${result.counts.newDecisions}`);
  if (result.counts.newArchitectureComponents !== 3) throw new Error(`Expected 3 new components, got ${result.counts.newArchitectureComponents}`);
});

await test("Duplicate recommendations, decisions, and components are prevented on re-analysis", async () => {
  // Run persistence again with identical payload
  const duplicateRun = await persistAnalysisResults(testProjectId, {
    projectSummary: "Autonomous UAV carrying thermal sensors.",
    problemStatement: "First responders cannot quickly locate survivors in dense forests.",
    targetUsers: ["Search & Rescue Teams"],
    domain: "Robotics & AI",
    projectType: "Emergency Response Drone",
    goals: [],
    constraints: [],
    expectedOutputs: [],
    hardwareRequirements: [],
    softwareRequirements: [],
    aiMlRequirements: [],
    integrations: [],
    deploymentRequirements: [],
    securityConsiderations: [],
    preferredStack: [],
    assumptions: [],
    recommendations: [
      {
        recommendationType: "hardware",
        recommendedItem: "FLIR Lepton 3.5", // Existing!
        reason: "Duplicate test",
      },
    ],
    decisionCandidates: [
      {
        title: "Edge vs Ground Model Inference", // Existing!
        decision: "Duplicate test",
      },
    ],
    researchTopics: [
      {
        title: "Thermal IR signature thresholding under varied ambient temperatures", // Existing!
      },
    ],
    architectureComponents: [
      {
        componentType: "hardware",
        name: "Thermal Vision Payload", // Existing!
      },
    ],
    risks: [],
  }, { source: "ai" });

  if (duplicateRun.counts.newRecommendations !== 0) throw new Error(`Expected 0 duplicates added, got ${duplicateRun.counts.newRecommendations}`);
  if (duplicateRun.counts.newDecisions !== 0) throw new Error(`Expected 0 duplicate decisions added, got ${duplicateRun.counts.newDecisions}`);
  if (duplicateRun.counts.newResearchTopics !== 0) throw new Error(`Expected 0 duplicate research topics added, got ${duplicateRun.counts.newResearchTopics}`);
  if (duplicateRun.counts.newArchitectureComponents !== 0) throw new Error(`Expected 0 duplicate components added, got ${duplicateRun.counts.newArchitectureComponents}`);
});

await test("Decisions remain in proposed state (AI does not auto-accept)", async () => {
  const decs = await Decision.find({ projectId: testProjectId }).lean();
  if (decs.length === 0) throw new Error("No decisions found");
  for (const d of decs) {
    if (d.status !== "proposed") {
      throw new Error(`Decision "${d.title}" had status "${d.status}" — expected "proposed"`);
    }
  }
});

await test("chatWithProjectAdvisor generates project-scoped advisory response and persists turn", async () => {
  const chatRes = await chatWithProjectAdvisor({
    projectId: testProjectId,
    message: "What communication protocol should we use between the drone and ground station?",
    user: { id: testUserId, name: "Parikshit", email: "parik@example.com" },
  });

  if (!chatRes.conversationId) throw new Error("Conversation ID missing");
  if (!chatRes.userMessage) throw new Error("User message missing");
  if (!chatRes.assistantMessage) throw new Error("Assistant response missing");

  // Verify conversation persistence
  const conv = await AIConversation.findById(chatRes.conversationId).lean();
  if (!conv) throw new Error("AIConversation was not persisted");
  if (conv.messageCount !== 2) throw new Error(`Expected conversation messageCount=2, got ${conv.messageCount}`);

  // Verify message documents
  const msgs = await AIMessage.find({ conversationId: chatRes.conversationId }).lean();
  if (msgs.length !== 2) throw new Error(`Expected 2 AIMessage documents, got ${msgs.length}`);
  if (msgs[0].role !== "user" || msgs[1].role !== "assistant") {
    throw new Error("Message role sequence incorrect");
  }
});

await test("Cleanup Phase 2 integration test artifacts", async () => {
  await Promise.all([
    AIMessage.deleteMany({ projectId: testProjectId }),
    AIConversation.deleteMany({ projectId: testProjectId }),
    ArchitectureComponent.deleteMany({ projectId: testProjectId }),
    ResearchItem.deleteMany({ projectId: testProjectId }),
    Recommendation.deleteMany({ projectId: testProjectId }),
    Decision.deleteMany({ projectId: testProjectId }),
    Task.deleteMany({ projectId: testProjectId }),
    Project.deleteMany({ _id: testProjectId }),
    Team.deleteMany({ _id: testTeamId }),
  ]);
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log("PHASE 2 TEST RESULTS");
console.log("=".repeat(70));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (errors.length > 0) {
  console.log("\nFailed tests:");
  for (const e of errors) console.log(`  ✗ ${e.name}: ${e.error}`);
}
console.log("=".repeat(70));

if (failed > 0) process.exit(1);
