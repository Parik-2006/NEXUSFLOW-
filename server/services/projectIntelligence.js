/**
 * server/services/projectIntelligence.js
 * ============================================================================
 * PROJECT INTELLIGENCE SERVICE — Central intelligence pipeline for NEXUSFLOW 2.0.
 *
 * Transforms raw user ideas into structured project understanding, AI recommendations,
 * candidate decisions, research topics, system architecture components, and project-aware
 * conversational advisory.
 *
 * CORE CAPABILITIES:
 * 1. buildProjectContext(projectId)
 *    Aggregates Project metadata, extracted context, team members/skills,
 *    accepted decisions, recommendations, architecture, and tasks into a
 *    controlled, concise context object.
 *
 * 2. analyzeProject(projectId, options)
 *    Routes through OmniRoute ($0 AI policy) with strict structured JSON output to extract:
 *      - Problem statement, target users, constraints, goals
 *      - Hardware, software, AI/ML, integrations, deployment requirements
 *      - Recommended technologies, libraries, frameworks
 *      - Candidate decisions for the student to consider
 *      - Recommended research topics (no fabricated URLs/papers)
 *      - Architectural layers and their dependencies
 *
 * 3. persistAnalysisResults(projectId, structuredData)
 *    Safely updates ProjectContext and persists sub-documents using duplicate
 *    prevention logic. AI suggestions are saved as 'pending' or 'proposed' and
 *    never overwrite user-accepted decisions.
 *
 * 4. chatWithProjectAdvisor({ projectId, conversationId, message, user })
 *    Project-scoped multi-turn conversational AI. Retains conversation history
 *    in AIConversation and AIMessage models with context snapshots.
 * ============================================================================
 */

import mongoose from "mongoose";
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

import {
  detectProjectDomain,
  detectHardware,
  evaluateAiMlNeed,
  buildRecommendedStack,
  buildPhasedRoadmap,
  buildResearchTopics,
  sliceHackathonRoadmap,
  analyzeSkillGaps,
  calculateReadinessScore,
  determineNextAction,
  generateProjectGuidance,
} from "../algorithms/projectGuidanceEngine.js";

// AI Orchestrator with 3-tier fallback (Gemini Free -> OpenRouter Free -> Deterministic)
import {
  orchestrateCopilotChat,
  orchestrateProjectAnalysis,
  extractMemoryUpdates,
} from "./aiOrchestrator.js";

// ── 1. Build Project Context ──────────────────────────────────────────────────
/**
 * Assembles a comprehensive yet concise snapshot of current project facts.
 * Distinguishes between verified user facts, accepted decisions, and backlog state.
 */
export async function buildProjectContext(projectId) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error("Invalid project ID");
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found");
  }

  // Load team details
  const team = await Team.findById(project.teamId).lean();

  // Load associated artifacts in parallel
  const [
    decisions,
    recommendations,
    architecture,
    researchItems,
    resources,
    tasks,
  ] = await Promise.all([
    Decision.find({ projectId }).lean(),
    Recommendation.find({ projectId }).lean(),
    ArchitectureComponent.find({ projectId }).lean(),
    ResearchItem.find({ projectId }).lean(),
    Resource.find({ projectId }).lean(),
    Task.find({ $or: [{ projectId }, { teamId: project.teamId }] }).limit(50).lean(),
  ]);

  const acceptedDecisions = decisions.filter((d) => d.status === "accepted");
  const proposedDecisions = decisions.filter((d) => d.status === "proposed");
  const acceptedRecs = recommendations.filter((r) => r.status === "accepted" || r.status === "applied");

  return {
    projectId: project._id.toString(),
    teamId: project.teamId.toString(),
    teamName: team?.name || "Workspace Team",
    teamMembers: (team?.members || []).map((m) => ({
      name: m.name,
      role: m.role,
      skills: m.skills || {},
    })),
    title: project.title,
    description: project.description,
    originalPrompt: project.originalPrompt || project.description,
    domain: project.domain || "General Software",
    projectType: project.projectType || "Application",
    academicContext: project.academicContext || "",
    currentPhase: project.currentPhase || "idea",
    status: project.status || "ideation",
    teamSize: project.teamSize || (team?.members?.length || 1),
    sprintWeeks: project.sprintWeeks || 4,

    // Embedded Structured Context
    context: {
      problemStatement: project.context?.problemStatement || "",
      targetUsers: project.context?.targetUsers || [],
      goals: project.context?.goals || [],
      constraints: project.context?.constraints || [],
      expectedOutputs: project.context?.expectedOutputs || [],
      hardwareRequirements: project.context?.hardwareRequirements || [],
      softwareRequirements: project.context?.softwareRequirements || [],
      aiMlRequirements: project.context?.aiMlRequirements || [],
      integrations: project.context?.integrations || [],
      deploymentRequirements: project.context?.deploymentRequirements || [],
      preferredStack: project.context?.preferredStack || [],
      budgetUsd: project.context?.budgetUsd ?? null,
      estimatedDurationDays: project.context?.estimatedDurationDays ?? null,
    },

    // Existing Artifacts
    acceptedDecisions: acceptedDecisions.map((d) => ({
      title: d.title,
      decision: d.decision,
      reasoning: d.reasoning,
      category: d.category,
    })),
    proposedDecisionsCount: proposedDecisions.length,
    acceptedRecommendations: acceptedRecs.map((r) => ({
      item: r.recommendedItem,
      type: r.recommendationType,
      reason: r.reason,
    })),
    architectureComponents: architecture.map((a) => ({
      id: a._id.toString(),
      type: a.componentType,
      name: a.name,
      technology: a.technology,
      status: a.status,
    })),
    researchTopicsCount: researchItems.length,
    resourcesCount: resources.length,
    taskStats: {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      todo: tasks.filter((t) => t.status === "todo").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      sampleTitles: tasks.slice(0, 8).map((t) => t.title),
    },
  };
}

// ── 2. Validate Structured AI Analyzer Output ────────────────────────────────
export function validateAnalyzerOutput(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Analyzer output must be a valid JSON object");
  }

  const clean = {
    projectSummary: typeof data.projectSummary === "string" ? data.projectSummary.trim() : "",
    problemStatement: typeof data.problemStatement === "string" ? data.problemStatement.trim() : "",
    targetUsers: Array.isArray(data.targetUsers) ? data.targetUsers.map(String).filter(Boolean) : [],
    domain: typeof data.domain === "string" ? data.domain.trim() : "General Software",
    projectType: typeof data.projectType === "string" ? data.projectType.trim() : "Application",
    goals: Array.isArray(data.goals) ? data.goals.map(String).filter(Boolean) : [],
    constraints: Array.isArray(data.constraints) ? data.constraints.map(String).filter(Boolean) : [],
    expectedOutputs: Array.isArray(data.expectedOutputs) ? data.expectedOutputs.map(String).filter(Boolean) : [],
    hardwareRequirements: Array.isArray(data.hardwareRequirements) ? data.hardwareRequirements.map(String).filter(Boolean) : [],
    softwareRequirements: Array.isArray(data.softwareRequirements) ? data.softwareRequirements.map(String).filter(Boolean) : [],
    aiMlRequirements: Array.isArray(data.aiMlRequirements) ? data.aiMlRequirements.map(String).filter(Boolean) : [],
    integrations: Array.isArray(data.integrations) ? data.integrations.map(String).filter(Boolean) : [],
    deploymentRequirements: Array.isArray(data.deploymentRequirements) ? data.deploymentRequirements.map(String).filter(Boolean) : [],
    securityConsiderations: Array.isArray(data.securityConsiderations) ? data.securityConsiderations.map(String).filter(Boolean) : [],
    preferredStack: Array.isArray(data.preferredStack) ? data.preferredStack.map(String).filter(Boolean) : [],
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.map(String).filter(Boolean) : [],

    recommendations: Array.isArray(data.recommendations) ? data.recommendations.map((r) => {
      const validTypes = ["technology", "framework", "library", "ai_model", "hardware", "database", "api", "dataset", "architecture", "tool", "cloud_service", "best_practice", "learning_resource"];
      let rType = String(r.recommendationType || "technology").toLowerCase().trim();
      if (!validTypes.includes(rType)) {
        if (rType.includes("hard") || rType.includes("sensor") || rType.includes("mcu")) rType = "hardware";
        else if (rType.includes("db") || rType.includes("data") || rType.includes("mongo") || rType.includes("sql")) rType = "database";
        else if (rType.includes("ai") || rType.includes("ml") || rType.includes("model")) rType = "ai_model";
        else if (rType.includes("back") || rType.includes("front") || rType.includes("frame") || rType.includes("lib")) rType = "framework";
        else if (rType.includes("cloud") || rType.includes("host") || rType.includes("deploy")) rType = "cloud_service";
        else if (rType.includes("arch")) rType = "architecture";
        else rType = "technology";
      }
      return {
        recommendationType: rType,
        recommendedItem: String(r.recommendedItem || r.item || "").trim(),
        category: typeof r.category === "string" ? r.category.trim() : "",
        reason: typeof r.reason === "string" ? r.reason.trim() : "",
        confidence: typeof r.confidence === "number" ? Math.min(Math.max(r.confidence, 0), 1) : 0.85,
        alternatives: Array.isArray(r.alternatives) ? r.alternatives.map(String) : [],
      };
    }).filter((r) => Boolean(r.recommendedItem)) : [],

    decisionCandidates: Array.isArray(data.decisionCandidates) ? data.decisionCandidates.map((d) => ({
      title: String(d.title || "").trim(),
      decision: String(d.decision || d.question || "").trim(),
      reasoning: typeof d.reasoning === "string" ? d.reasoning.trim() : "",
      alternativesConsidered: Array.isArray(d.alternativesConsidered || d.options) ? (d.alternativesConsidered || d.options).map(String) : [],
      selectedOption: typeof d.selectedOption === "string" ? d.selectedOption.trim() : "",
      category: typeof d.category === "string" ? d.category : "technology",
      confidence: typeof d.confidence === "number" ? Math.min(Math.max(d.confidence, 0), 1) : 0.8,
    })).filter((d) => Boolean(d.title && d.decision)) : [],

    researchTopics: Array.isArray(data.researchTopics) ? data.researchTopics.map((rt) => ({
      title: typeof rt === "string" ? rt.trim() : String(rt.title || "").trim(),
      abstract: typeof rt === "object" && typeof rt.abstract === "string" ? rt.abstract : "",
      topics: typeof rt === "object" && Array.isArray(rt.topics) ? rt.topics.map(String) : [],
      relevance: typeof rt === "object" && typeof rt.relevance === "number" ? Math.min(Math.max(rt.relevance, 1), 5) : 4,
      notes: typeof rt === "object" && typeof rt.notes === "string" ? rt.notes : "Suggested research area for project investigation.",
    })).filter((rt) => Boolean(rt.title)) : [],

    architectureComponents: Array.isArray(data.architectureComponents) ? data.architectureComponents.map((c) => ({
      componentType: typeof c.componentType === "string" ? c.componentType : "backend",
      name: String(c.name || "").trim(),
      description: typeof c.description === "string" ? c.description.trim() : "",
      technology: typeof c.technology === "string" ? c.technology.trim() : "",
      supportingTools: Array.isArray(c.supportingTools) ? c.supportingTools.map(String) : [],
      dependsOnIndices: Array.isArray(c.dependsOnIndices) ? c.dependsOnIndices.map(Number) : [],
      dependsOnNames: Array.isArray(c.dependsOnNames) ? c.dependsOnNames.map(String) : [],
    })).filter((c) => Boolean(c.name)) : [],

    risks: Array.isArray(data.risks) ? data.risks.map(String).filter(Boolean) : [],
  };

  return clean;
}

// ── 3. Heuristic / Deterministic Fallback Analyzer ───────────────────────────
/**
 * When OpenAI API key is unavailable or the external API call fails,
 * this function provides a deterministic, domain-aware analysis fallback.
 */
export function generateHeuristicAnalysis(projectContext) {
  const text = `${projectContext.title} ${projectContext.originalPrompt} ${projectContext.description}`.toLowerCase();

  const isIoT = /\b(iot|sensor|sensors|esp32|arduino|raspberry|hardware|relay|moisture|temperature|irrigation|valve|pump)\b/i.test(text);
  const isAI = /\b(ai|ml|machine learning|prediction|predict|vision|detection|model|dataset|neural|nlp|llm|deep learning)\b/i.test(text);
  const isWeb = /\b(web|dashboard|react|frontend|portal|saas|admin|ecommerce|platform)\b/i.test(text);
  const isMobile = /\b(mobile|react native|flutter|android|ios|app)\b/i.test(text);
  const isRealtime = /\b(realtime|real-time|socket|live|stream|notification|chat|alert)\b/i.test(text);

  const domain = isIoT ? "Internet of Things (IoT)" : isAI ? "AI / Machine Learning" : isMobile ? "Mobile Application" : "Web & Cloud Application";
  const projectType = isIoT ? "Smart IoT Monitoring & Automation" : isAI ? "Intelligent AI-driven System" : "Cloud Platform";

  const hardware = [];
  if (isIoT) {
    if (/soil|moisture/i.test(text)) hardware.push("Soil Moisture Sensor (Capacitive/Analog)");
    if (/temp|humidity|dht/i.test(text)) hardware.push("DHT22 Temperature & Humidity Sensor");
    if (/pump|valve|relay|water/i.test(text)) hardware.push("5V Relay Module & 12V Water Solenoid Valve");
    hardware.push("ESP32 Microcontroller (Wi-Fi + BLE)");
  }

  const software = [
    "Node.js / Express REST API",
    isMobile ? "React Native (Expo) Mobile App" : "React.js Web Application",
    "MongoDB Document Database",
  ];
  if (isRealtime) software.push("Socket.io Real-time Event Service");

  const aiMl = [];
  if (isAI || isIoT) {
    aiMl.push("Lightweight Regression / Time-series Prediction Model (Scikit-Learn / TensorFlow Lite)");
  }

  const integrations = [];
  if (/weather/i.test(text) || isIoT) integrations.push("OpenWeatherMap API");
  if (/sms|alert|notif/i.test(text)) integrations.push("Twilio / Firebase Cloud Messaging");

  const recommendations = [
    {
      recommendationType: "database",
      recommendedItem: "MongoDB",
      category: "Database",
      reason: "Flexible document model enables seamless iteration on dynamic project schemas without complex migrations.",
      confidence: 0.9,
      alternatives: ["PostgreSQL", "Firebase Firestore"],
    },
    {
      recommendationType: "backend",
      recommendedItem: "Node.js & Express",
      category: "Backend Framework",
      reason: "Non-blocking event loop ideal for asynchronous REST endpoints and real-time socket updates.",
      confidence: 0.9,
      alternatives: ["FastAPI (Python)", "Spring Boot"],
    },
  ];

  if (isIoT) {
    recommendations.push({
      recommendationType: "hardware",
      recommendedItem: "ESP32",
      category: "Microcontroller",
      reason: "Built-in Wi-Fi and Bluetooth with low power consumption make ESP32 the industry standard for IoT prototypes.",
      confidence: 0.95,
      alternatives: ["Raspberry Pi Pico W", "Arduino Uno WiFi"],
    });
  }

  if (isAI) {
    recommendations.push({
      recommendationType: "ai_model",
      recommendedItem: "TensorFlow Lite / ONNX Runtime",
      category: "Machine Learning",
      reason: "Enables fast, low-latency inference suitable for embedded edge devices or lightweight microservices.",
      confidence: 0.85,
      alternatives: ["PyTorch Mobile", "Scikit-Learn"],
    });
  }

  const decisionCandidates = [
    {
      title: "Primary Communication Protocol",
      decision: isIoT ? "Select Wi-Fi HTTP vs MQTT for device communication" : "Select REST API vs GraphQL for client-server communication",
      reasoning: "Determines device power efficiency, bandwidth utilization, and real-time responsiveness.",
      alternativesConsidered: isIoT ? ["MQTT Broker (Mosquitto)", "HTTP REST POST", "WebSockets"] : ["REST API", "GraphQL", "gRPC"],
      selectedOption: isIoT ? "MQTT Broker (Mosquitto)" : "REST API",
      category: "architecture",
      confidence: 0.85,
    },
    {
      title: "Data Ingestion & Storage Architecture",
      decision: "Store raw time-series telemetry in MongoDB collections with TTL indexing",
      reasoning: "Prevents unbounded storage growth while preserving historical trend metrics for analytical queries.",
      alternativesConsidered: ["MongoDB Timeseries Collections", "InfluxDB", "PostgreSQL TimescaleDB"],
      selectedOption: "MongoDB Timeseries Collections",
      category: "database",
      confidence: 0.8,
    },
  ];

  const researchTopics = [
    {
      title: isIoT ? "Sensor Calibration and Telemetry Noise Filtering Techniques" : "System Scalability and Real-time State Synchronization",
      abstract: "Investigation into signal smoothing algorithms (e.g., Moving Average, Kalman Filter) for reliable sensor data.",
      topics: isIoT ? ["Sensor Calibration", "Kalman Filter", "IoT Telemetry"] : ["State Synchronization", "Architecture"],
      relevance: 5,
      notes: "Crucial for preventing erratic triggers caused by sensor noise.",
    },
    {
      title: "Edge vs Cloud AI Model Inference Tradeoffs",
      abstract: "Comparative analysis of executing ML inference on microcontroller hardware versus centralized cloud workers.",
      topics: ["Edge Computing", "Inference Latency", "TFLite"],
      relevance: 4,
      notes: "Directly impacts device battery life and network bandwidth requirements.",
    },
  ];

  const architectureComponents = [
    {
      componentType: isIoT ? "hardware" : "frontend",
      name: isIoT ? "IoT Edge Sensor Node" : "User Client Application",
      description: isIoT ? "Reads physical telemetry and securely transmits data over Wi-Fi." : "Interactive interface for users.",
      technology: isIoT ? "ESP32 (C++ / Arduino framework)" : "React Native / React.js",
      supportingTools: isIoT ? ["Arduino IDE", "PlatformIO"] : ["Expo", "TailwindCSS"],
      dependsOnIndices: [],
    },
    {
      componentType: "backend",
      name: "Core API & Telemetry Gateway",
      description: "Handles authentication, ingests data payloads, and exposes REST/WebSocket endpoints.",
      technology: "Node.js + Express",
      supportingTools: ["Mongoose", "Socket.io"],
      dependsOnIndices: [0],
    },
    {
      componentType: "database",
      name: "Document & Telemetry Store",
      description: "Persists user accounts, system configuration, and historical records.",
      technology: "MongoDB",
      supportingTools: ["Mongoose ODM"],
      dependsOnIndices: [1],
    },
    {
      componentType: isMobile ? "frontend" : "frontend",
      name: "Monitoring & Control Dashboard",
      description: "Visualizes live telemetry, system health, and allows manual overrides.",
      technology: "React Native / Expo",
      supportingTools: ["Victory Native / SVG Charts"],
      dependsOnIndices: [1],
    },
  ];

  return validateAnalyzerOutput({
    projectSummary: `Comprehensive solution for ${projectContext.title}: ${projectContext.description || projectContext.originalPrompt}`,
    problemStatement: projectContext.context.problemStatement || `Addressing efficiency and automation challenges in ${projectContext.title}.`,
    targetUsers: projectContext.context.targetUsers.length > 0 ? projectContext.context.targetUsers : ["End Users", "System Administrators", "Field Operators"],
    domain,
    projectType,
    goals: ["Deliver reliable end-to-end functionality", "Ensure real-time visibility", "Provide modular, maintainable architecture"],
    constraints: ["Limited compute/budget constraints", "Rapid prototype timeline"],
    expectedOutputs: ["Functional hardware/software prototype", "Interactive dashboard", "REST API & Database"],
    hardwareRequirements: hardware,
    softwareRequirements: software,
    aiMlRequirements: aiMl,
    integrations,
    deploymentRequirements: ["Cloud Hosting (Render / Vercel)", "MongoDB Atlas Database"],
    securityConsiderations: ["JWT-based API authentication", "Environment variables for sensitive credentials"],
    preferredStack: [isIoT ? "ESP32" : "React", "Node.js", "Express", "MongoDB"],
    assumptions: ["Standard Wi-Fi connectivity is available", "Standard 5V power supply accessible"],
    recommendations,
    decisionCandidates,
    researchTopics,
    architectureComponents,
    risks: [
      "Network dropouts during telemetry transmission",
      "Sensor drift or environmental calibration errors",
    ],
  });
}

// ── 4. Analyze Project with OmniRoute / Heuristic Fallback ────────────────────
export async function analyzeProject(projectId, options = {}) {
  const context = await buildProjectContext(projectId);

  const systemPrompt = `You are a Principal Software Architect and Project Intelligence Advisor in NEXUSFLOW 2.0.
Your task is to perform an in-depth, project-aware architectural analysis for a student or engineering team project.

Analyze the given project context and output a STRICT JSON object containing:
1. "projectSummary": (string) Crisp 2-sentence summary of what the project builds and accomplishes.
2. "problemStatement": (string) The exact core problem being solved.
3. "targetUsers": (array of strings) Who will use or operate this system.
4. "domain": (string) e.g., "Internet of Things (IoT)", "Healthcare AI", "FinTech Web", "Robotics".
5. "projectType": (string) Specific project category.
6. "goals": (array of strings) Key engineering and business objectives.
7. "constraints": (array of strings) Technical, budget, hardware, or timeline constraints.
8. "expectedOutputs": (array of strings) Deliverables (e.g., "Mobile App", "Firmware", "REST API").
9. "hardwareRequirements": (array of strings) Specific physical components (e.g., "ESP32", "DHT22"). If not a hardware project, leave empty [].
10. "softwareRequirements": (array of strings) Software libraries, backend frameworks, UI toolkits.
11. "aiMlRequirements": (array of strings) Specific AI/ML capabilities, models, or data pipelines needed.
12. "integrations": (array of strings) External APIs (e.g., "OpenWeatherMap", "Stripe", "Twilio").
13. "deploymentRequirements": (array of strings) Hosting targets (e.g., "Vercel", "Render", "AWS EC2").
14. "securityConsiderations": (array of strings) Auth, privacy, encryption requirements.
15. "preferredStack": (array of strings) Recommended tech stack list.
16. "assumptions": (array of strings) Technical assumptions made.
17. "recommendations": (array of objects)
    Each object: {
      "recommendationType": "technology"|"framework"|"library"|"ai_model"|"hardware"|"database"|"api"|"cloud_service"|"tool",
      "recommendedItem": (string, e.g. "MongoDB", "ESP32", "PyTorch"),
      "category": (string),
      "reason": (string, specific justification for THIS project),
      "confidence": (number between 0.1 and 1.0),
      "alternatives": (array of strings)
    }
18. "decisionCandidates": (array of objects) Architectural choices the team MUST decide on.
    Each object: {
      "title": (string, e.g. "Database Engine Selection"),
      "decision": (string, what needs to be chosen or the proposed decision),
      "reasoning": (string, why this choice matters),
      "alternativesConsidered": (array of strings),
      "selectedOption": (string, the AI suggested choice),
      "category": "technology"|"architecture"|"hardware"|"ai_model"|"database"|"deployment"|"security"|"process",
      "confidence": (number between 0.1 and 1.0)
    }
19. "researchTopics": (array of objects) Real technical investigation topics for the team. DO NOT fabricate URLs or fake citations.
    Each object: {
      "title": (string),
      "abstract": (string),
      "topics": (array of strings),
      "relevance": (number 1-5),
      "notes": (string)
    }
20. "architectureComponents": (array of objects) Architectural layers/tiers.
    Each object: {
      "componentType": "frontend"|"backend"|"database"|"ai_ml"|"hardware"|"iot_gateway"|"auth"|"external_api"|"monitoring"|"deployment",
      "name": (string, e.g., "React Native Mobile App"),
      "description": (string),
      "technology": (string, e.g., "React Native + Expo"),
      "supportingTools": (array of strings),
      "dependsOnIndices": (array of integers referencing index in this architectureComponents array)
    }
21. "risks": (array of strings) Major technical or project failure risks.

Rules:
- NEVER suggest unrelated technologies (e.g. no shopping cart or Stripe for an irrigation or robotics project).
- Ground all suggestions strictly in the project's domain, hardware, software, and objectives.
- Return ONLY the JSON object.`;

  const userPrompt = `PROJECT CONTEXT:
${JSON.stringify(context, null, 2)}

Provide comprehensive project intelligence analysis in JSON format.`;

  try {
    const aiResult = await orchestrateProjectAnalysis({
      projectContext: context,
      systemPrompt,
      userPrompt,
    });

    if (aiResult && aiResult.data) {
      const validated = validateAnalyzerOutput(aiResult.data);
      return persistAnalysisResults(projectId, validated, { source: aiResult.provider || "ai" });
    }
  } catch (err) {
    console.warn("[projectIntelligence] Orchestrated AI analysis failed, falling back to heuristic:", err.message);
  }

  const fallback = generateHeuristicAnalysis(context);
  return persistAnalysisResults(projectId, fallback, { source: "heuristic" });
}

// ── 5. Persist Analysis Results with Duplicate Prevention ─────────────────────
export async function persistAnalysisResults(projectId, structuredData, meta = {}) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error("Project not found during persistence");
  }

  // 1. Update Project Context
  project.domain = structuredData.domain || project.domain || "General";
  project.projectType = structuredData.projectType || project.projectType || "";
  if (project.currentPhase === "idea") {
    project.currentPhase = "understanding";
  }

  project.context = {
    problemStatement: structuredData.problemStatement || project.context?.problemStatement || "",
    targetUsers: structuredData.targetUsers.length > 0 ? structuredData.targetUsers : (project.context?.targetUsers || []),
    goals: structuredData.goals.length > 0 ? structuredData.goals : (project.context?.goals || []),
    constraints: structuredData.constraints.length > 0 ? structuredData.constraints : (project.context?.constraints || []),
    expectedOutputs: structuredData.expectedOutputs.length > 0 ? structuredData.expectedOutputs : (project.context?.expectedOutputs || []),
    hardwareRequirements: structuredData.hardwareRequirements.length > 0 ? structuredData.hardwareRequirements : (project.context?.hardwareRequirements || []),
    softwareRequirements: structuredData.softwareRequirements.length > 0 ? structuredData.softwareRequirements : (project.context?.softwareRequirements || []),
    aiMlRequirements: structuredData.aiMlRequirements.length > 0 ? structuredData.aiMlRequirements : (project.context?.aiMlRequirements || []),
    integrations: structuredData.integrations.length > 0 ? structuredData.integrations : (project.context?.integrations || []),
    deploymentRequirements: structuredData.deploymentRequirements.length > 0 ? structuredData.deploymentRequirements : (project.context?.deploymentRequirements || []),
    securityConsiderations: structuredData.securityConsiderations.length > 0 ? structuredData.securityConsiderations : (project.context?.securityConsiderations || []),
    preferredStack: structuredData.preferredStack.length > 0 ? structuredData.preferredStack : (project.context?.preferredStack || []),
    assumptions: structuredData.assumptions.length > 0 ? structuredData.assumptions : (project.context?.assumptions || []),
    extractedBy: meta.source === "ai" ? "ai" : "hybrid",
    extractionConfidence: meta.source === "ai" ? 0.9 : 0.8,
  };

  await project.save();

  // 2. Persist Recommendations with Duplicate Prevention
  const existingRecs = await Recommendation.find({ projectId }).lean();
  const existingRecSet = new Set(
    existingRecs.map((r) => `${r.recommendationType.toLowerCase()}::${r.recommendedItem.toLowerCase().trim()}`)
  );

  const newRecDocs = [];
  for (const rec of structuredData.recommendations) {
    const key = `${rec.recommendationType.toLowerCase()}::${rec.recommendedItem.toLowerCase().trim()}`;
    if (!existingRecSet.has(key)) {
      existingRecSet.add(key);
      newRecDocs.push({
        projectId,
        recommendationType: rec.recommendationType,
        recommendedItem: rec.recommendedItem,
        category: rec.category,
        reason: rec.reason,
        confidence: rec.confidence,
        source: meta.source === "ai" ? "ai_advisor" : "system",
        alternatives: rec.alternatives,
        status: "pending",
      });
    }
  }

  if (newRecDocs.length > 0) {
    await Recommendation.insertMany(newRecDocs);
  }

  // 3. Persist Candidate Decisions with Duplicate Prevention (AI does NOT auto-accept)
  const existingDecisions = await Decision.find({ projectId }).lean();
  const existingDecisionTitles = new Set(
    existingDecisions.map((d) => d.title.toLowerCase().trim())
  );

  const newDecisionDocs = [];
  for (const dec of structuredData.decisionCandidates) {
    const titleKey = dec.title.toLowerCase().trim();
    if (!existingDecisionTitles.has(titleKey)) {
      existingDecisionTitles.add(titleKey);
      newDecisionDocs.push({
        projectId,
        title: dec.title,
        decision: dec.decision,
        reasoning: dec.reasoning,
        alternativesConsidered: dec.alternativesConsidered,
        selectedOption: dec.selectedOption,
        category: dec.category,
        source: meta.source === "ai" ? "ai" : "manual",
        confidence: dec.confidence,
        status: "proposed", // Always proposed; user decides acceptance
      });
    }
  }

  if (newDecisionDocs.length > 0) {
    await Decision.insertMany(newDecisionDocs);
  }

  // 4. Persist Research Topics with Duplicate Prevention
  const existingResearch = await ResearchItem.find({ projectId }).lean();
  const existingResearchTitles = new Set(
    existingResearch.map((r) => r.title.toLowerCase().trim())
  );

  const newResearchDocs = [];
  for (const res of structuredData.researchTopics) {
    const titleKey = res.title.toLowerCase().trim();
    if (!existingResearchTitles.has(titleKey)) {
      existingResearchTitles.add(titleKey);
      newResearchDocs.push({
        projectId,
        title: res.title,
        abstract: res.abstract || "",
        topics: res.topics || [],
        relevance: res.relevance || 4,
        notes: res.notes || "",
        source: "documentation",
        status: "found",
      });
    }
  }

  if (newResearchDocs.length > 0) {
    await ResearchItem.insertMany(newResearchDocs);
  }

  // 5. Persist Architecture Components with Duplicate Prevention
  const existingComps = await ArchitectureComponent.find({ projectId }).lean();
  const existingCompKeys = new Set(
    existingComps.map((c) => `${c.componentType.toLowerCase()}::${c.name.toLowerCase().trim()}`)
  );

  const createdComponentMap = new Map(); // index -> created doc
  for (let i = 0; i < structuredData.architectureComponents.length; i++) {
    const comp = structuredData.architectureComponents[i];
    const key = `${comp.componentType.toLowerCase()}::${comp.name.toLowerCase().trim()}`;
    if (!existingCompKeys.has(key)) {
      existingCompKeys.add(key);
      const created = await ArchitectureComponent.create({
        projectId,
        componentType: comp.componentType,
        name: comp.name,
        description: comp.description,
        technology: comp.technology,
        supportingTools: comp.supportingTools,
        dependsOn: [],
        status: "planned",
      });
      createdComponentMap.set(i, created);
    }
  }

  // Wire architecture dependencies
  for (let i = 0; i < structuredData.architectureComponents.length; i++) {
    const comp = structuredData.architectureComponents[i];
    const createdTarget = createdComponentMap.get(i);
    if (createdTarget && Array.isArray(comp.dependsOnIndices) && comp.dependsOnIndices.length > 0) {
      const depIds = comp.dependsOnIndices
        .map((depIdx) => createdComponentMap.get(depIdx)?._id)
        .filter(Boolean);
      if (depIds.length > 0) {
        await ArchitectureComponent.updateOne(
          { _id: createdTarget._id },
          { $set: { dependsOn: depIds } }
        );
      }
    }
  }

  return {
    success: true,
    projectId,
    source: meta.source || "ai",
    summary: structuredData.projectSummary,
    counts: {
      newRecommendations: newRecDocs.length,
      newDecisions: newDecisionDocs.length,
      newResearchTopics: newResearchDocs.length,
      newArchitectureComponents: createdComponentMap.size,
    },
    data: structuredData,
  };
}

// ── 6. Question Intent Classification & Project-Aware Copilot ─────────────────

const INTENT_PATTERNS = [
  {
    intent: "hardware",
    regex: /\b(hardware|sensor|sensors|esp32|esp8266|arduino|raspberry|microcontroller|gpio|pin|pins|relay|pump|pumps|valve|valves|breadboard|actuator|actuators|wire|wires|circuit|solenoid|components|ic|module|modules|power supply|soldering)\b/i,
  },
  {
    intent: "ai_ml",
    regex: /\b(ai|ml|machine learning|deep learning|neural network|nlp|natural language|computer vision|yolo|opencv|classifier|classification|regression|regressor|predict|prediction|predictive|forecast|forecasting|scikit|tensorflow|pytorch|model|models|inference|training model)\b/i,
  },
  {
    intent: "dataset",
    regex: /\b(dataset|datasets|data set|data sets|data collection|collect data|collecting data|training data|samples|label|labels|labeling|annotation|csv|kaggle|uci|preprocessing|data cleaning|feature engineering|features)\b/i,
  },
  {
    intent: "hackathon",
    regex: /\b(hackathon|24 hours|12 hours|48 hours|36 hours|demo|demo day|pitch|time limit|deadline|timeline|finish in|quick build|time budget|sprint budget|hours budget)\b/i,
  },
  {
    intent: "next_decision",
    regex: /\b(suggest next decision|next decision|what decision|architectural decision|decision to make|decide next|which choice|decision recommendation|tradeoff|compare options)\b/i,
  },
  {
    intent: "roadmap",
    regex: /\b(what should i do next|what to do next|what to build first|what should i build first|where to start|where should i start|starting point|roadmap|phases|phase|milestone|milestones|next step|first step|execution sequence|sequence of work)\b/i,
  },
  {
    intent: "software_stack",
    regex: /\b(software stack|tech stack|technology stack|technologies|database|mongodb|postgres|postgresql|sql|nosql|node|nodejs|express|fastapi|python|react|react native|expo|framework|frameworks|library|libraries|tools|backend stack|frontend stack|orm|mongoose)\b/i,
  },
  {
    intent: "research",
    regex: /\b(research|research papers|paper|papers|literature|investigate|investigation|study|feasibility|prior art|topics to research|research topic|research topics|academic)\b/i,
  },
  {
    intent: "architecture",
    regex: /\b(architecture|system architecture|system design|components|layers|tiers|gateway|iot gateway|communication protocol|mqtt|websocket|websockets|socket\.io|rest api design|data flow|tier)\b/i,
  },
  {
    intent: "dependency",
    regex: /\b(depend|depends|dependency|dependencies|prerequisite|prerequisites|blocker|blockers|blocked|topological|order of tasks|task order|dag|which task first)\b/i,
  },
  {
    intent: "priority",
    regex: /\b(priority|priorities|highest priority|high priority|urgency|impact|greedy priority|most important task|top task|priority score)\b/i,
  },
  {
    intent: "task",
    regex: /\b(task|tasks|backlog|to-do|todo|work items|what tasks|create task|task list)\b/i,
  },
  {
    intent: "team",
    regex: /\b(team|member|members|skill|skills|skill gap|skill gaps|gaps|who should do|assignment|assignee|workload|learning prerequisite)\b/i,
  },
  {
    intent: "mvp",
    regex: /\b(mvp|minimum viable product|core scope|core mvp|essential features|must have|baseline prototype)\b/i,
  },
  {
    intent: "advanced_features",
    regex: /\b(advanced|post-mvp|future scope|enhancement|enhancements|future features|nice to have|version 2|v2)\b/i,
  },
  {
    intent: "deployment",
    regex: /\b(deploy|deployment|hosting|host|render|vercel|cloud|aws|docker|ci\/cd|github actions|production server|deploying)\b/i,
  },
  {
    intent: "testing",
    regex: /\b(test|testing|unit test|unit tests|integration test|hardware test|validation|benchmark|qa|quality assurance|how to test)\b/i,
  },
];

export function classifyQuestionIntent(message, history = []) {
  const text = String(message || "").trim();
  if (!text) return "general_project_question";

  for (const item of INTENT_PATTERNS) {
    if (item.regex.test(text)) {
      return item.intent;
    }
  }

  // Check recent conversation context if the message is short or contextual
  if (text.length < 35 && history.length > 0) {
    const recent = history.slice(-2).map((m) => m.content).join(" ");
    if (/\b(sensor|pin|gpio|hardware|esp32|relay|pump)\b/i.test(recent)) return "hardware";
    if (/\b(model|dataset|training|accuracy|ai|ml)\b/i.test(recent)) return "ai_ml";
    if (/\b(mongo|postgres|database|backend|react)\b/i.test(recent)) return "software_stack";
    if (/\b(task|sprint|priority|hours)\b/i.test(recent)) return "task";
  }

  return "general_project_question";
}

/**
 * Generates a deterministic, project-grounded, high-quality answer
 * adhering to the 4-part structure: Direct Answer, Reasoning, Recommended Action, Next Step.
 */
export function generateDeterministicCopilotAnswer(intent, message, projectContext, history = [], guidance = null) {
  const title = projectContext.title || "Project";
  const domain = projectContext.domain || "General Software";
  const desc = projectContext.description || projectContext.originalPrompt || "";
  const fullText = `${title} ${desc} ${projectContext.context?.problemStatement || ""}`;

  // Use Phase 6 guidance helpers for ground truth
  const domainInfo = detectProjectDomain(fullText);
  const hwInfo = guidance?.hardware || detectHardware(fullText);
  const aiInfo = guidance?.aiMl || evaluateAiMlNeed(fullText);
  const stackInfo = guidance?.technologyStack || buildRecommendedStack(domainInfo, hwInfo, aiInfo, fullText);
  const readiness = guidance?.readiness || calculateReadinessScore(
    { projectTitle: title, projectDescription: desc },
    projectContext.taskStats?.total || 5,
    5,
    stackInfo.stack || [],
    hwInfo,
    aiInfo,
    []
  );
  const nextAction = guidance?.nextAction || determineNextAction(hwInfo, aiInfo, readiness, [], []);

  switch (intent) {
    case "hardware": {
      if (hwInfo.status === "REQUIRED" && hwInfo.items?.length > 0) {
        const itemsList = hwInfo.items.map((i) => `• **${i.name}** (${i.category}): ${i.purpose}`).join("\n");
        const micro = hwInfo.items.find((i) => i.category.includes("Microcontroller") || i.category.includes("Gateway"))?.name || "ESP32 DevKit V1";
        const primarySensor = hwInfo.items.find((i) => i.category.includes("Sensor"))?.name || "Primary Sensor";

        return `For **${title}**, physical hardware is **required** because the system interfaces directly with the real-world environment.

### Recommended Hardware Components:
${itemsList}

**Project Reasoning:**
Your project relies on physical telemetry ingestion. The **${micro}** acts as the central edge processor reading sensor signals and publishing data to your backend over Wi-Fi.

**Recommended Action:**
Start with a benchtop prototype connecting your **${primarySensor}** to the **${micro}**. Validate live readings in the Arduino/PlatformIO Serial Monitor before introducing relays, pumps, or high-voltage circuits.

**Next Step:**
Once sensor telemetry is stable, implement the HTTP POST / MQTT ingestion gateway in your Node.js backend.`;
      } else {
        return `For **${title}**, physical hardware is **not required**.

**Project Reasoning:**
This is a **${domain}** project that operates entirely in software and cloud infrastructure. All data flows between your client interface, backend REST API, and database.

**Recommended Action:**
Focus your effort on core full-stack software architecture: frontend state management, backend endpoint security, and database modeling.

**Next Step:**
Proceed directly to setting up your API endpoints and database models.`;
      }
    }

    case "ai_ml": {
      if (aiInfo.status === "REQUIRED") {
        const techniques = aiInfo.techniques?.length > 0 ? aiInfo.techniques.map((t) => `• ${t}`).join("\n") : "• Scikit-Learn Regression / Classifier baseline";
        return `Yes, Machine Learning is **required/recommended** for **${title}** (${aiInfo.category}).

### Recommended Techniques:
${techniques}

**Project Reasoning:**
${aiInfo.explanation} Static threshold rules alone cannot reliably capture the multi-variable patterns in your ${domain.toLowerCase()} data.

**Recommended Action:**
Start with a lightweight baseline model (e.g., Scikit-Learn / Random Forest) to establish a benchmark accuracy before attempting deep neural networks or complex pipelines.

**Next Step:**
Curate your initial training dataset with relevant features (e.g., sensor telemetry, time-of-day, historical logs).`;
      } else {
        return `For **${title}**, Machine Learning is **not strictly necessary** for your core MVP.

**Project Reasoning:**
The core requirements of this **${domain}** project can be solved deterministically using clean relational/document queries, business rules, and algorithmic logic. Adding an ML model at this stage adds unnecessary complexity without direct architectural value.

**Recommended Action:**
Build and stabilize the core transactional features first. If automated insights or predictions are desired post-launch, implement rule-based scoring before training ML models.

**Next Step:**
Focus on your REST API contracts and database schema.`;
      }
    }

    case "dataset": {
      const ds = aiInfo.dataset || {};
      return `For **${title}**, here is your dataset strategy:

### Dataset Requirements:
• **Required for MVP**: ${ds.required || "YES"}
• **Dataset Type**: ${ds.type || "Structured tabular readings & historical logs"}
• **Collection Strategy**: ${ds.collectionStrategy || "Collect 100–500 representative sample readings or use verified public datasets (Kaggle/UCI)."}
• **Preprocessing Pipeline**: ${ds.preprocessing || "Feature scaling, missing value imputation, noise filtering, and 80/20 train-test split."}

**Project Reasoning:**
High-quality, balanced data is essential to avoid garbage-in/garbage-out model predictions. For a student project or hackathon, a compact, well-cleaned dataset yields faster and more demonstrable results than uncurated massive data.

**Recommended Action:**
Create a standardized CSV / JSON schema representing one telemetry/input event with all mandatory feature fields.

**Next Step:**
Collect 50 sample records (or generate a synthetic seed script) to test your database ingestion and training pipeline.`;
    }

    case "hackathon": {
      const hours = 24;
      const hackathonData = guidance?.hackathonMode || sliceHackathonRoadmap(
        guidance?.phases || buildPhasedRoadmap(title, fullText, hwInfo, aiInfo).phases,
        hours
      );
      const topTasks = hackathonData.mvpTasks?.slice(0, 5).map((t) => `• **${t.title}** (${t.estimatedHours || 3}h) — *${t.phase || "Core"}*`).join("\n") || "• Core Backend API\n• Database Setup\n• Main Dashboard UI";

      return `For a **${hours}-hour Hackathon / Demo Sprint** on **${title}**, our 0/1 Knapsack DP optimizer recommends focusing exclusively on these Core MVP tasks:

### Priority Demo Scope (${hackathonData.effortUsed || 18}h total effort):
${topTasks}

**Project Reasoning:**
In time-constrained sprints, attempting advanced features (like automated SMS alerts, multi-tenant billing, or complex auth) before proving end-to-end data flow will risk leaving your core demo broken.

**Recommended Action:**
Build the "happy path" first: **Sensor/Input → Backend API → Database → Live UI Display**.

**Next Step:**
Defer all non-essential tasks (${hackathonData.deferredTasksCount || 4} tasks deferred) until the core live demonstration path is 100% functional.`;
    }

    case "next_decision": {
      const accepted = projectContext.acceptedDecisions || [];
      const decisionsList = projectContext.proposedDecisionsCount > 0
        ? "You have pending decision candidates in the **Decisions** tab waiting for your review."
        : "Review key technology choices for database indexing, communication protocol, and state management.";

      return `For **${title}**, here is your next architectural decision analysis:

**Top Decision Candidate:**
• **Communication & Ingestion Architecture**: Choose between standard REST POST endpoints versus real-time WebSockets / MQTT broker for data transmission.

**Project Context & Trade-offs:**
${hwInfo.status === "REQUIRED"
  ? "Because hardware telemetry is transmitted frequently, an MQTT broker or lightweight REST POST with keep-alive provides optimal power and bandwidth efficiency."
  : "A standard Node.js Express REST API paired with MongoDB provides the highest developer velocity and easiest testing."}

**Recommended Action:**
Open the **Decisions** tab in Project AI to confirm or customize this architectural choice.

**Next Step:**
Once decided, create the corresponding setup task in your backlog.`;
    }

    case "roadmap":
    case "general_project_question": {
      // If user asks "what should I do next" or "what should I build first"
      const taskDone = projectContext.taskStats?.done || 0;
      const taskTotal = projectContext.taskStats?.total || 0;

      return `As your Project Advisor for **${title}** (${domain}):

### Current Project Status:
• **Phase**: \`${projectContext.currentPhase || "understanding"}\`
• **Readiness Score**: **${readiness.score}%** (${readiness.tier})
• **Backlog Progress**: ${taskDone} of ${taskTotal} tasks completed

### Recommended Next Milestone:
👉 **${nextAction.action}**
*Reason*: ${nextAction.reason}

**Recommended Action:**
${hwInfo.status === "REQUIRED" && taskDone === 0
  ? "1. Setup hardware breadboard test circuit with the microcontroller.\n2. Write serial firmware to verify sensor readings.\n3. Spin up the Node.js backend server."
  : "1. Verify your database connection and basic CRUD endpoints.\n2. Connect frontend views to display live project data.\n3. Write end-to-end test cases."}

**Next Step:**
Click **Decompose Tasks** in the Project Brief tab if you need structured backlog tasks generated automatically.`;
    }

    case "software_stack": {
      const stackList = stackInfo.stack?.map((s) => `• **${s.category}**: ${s.name} — *${s.role}*`).join("\n") || "• Frontend: React.js / React Native\n• Backend: Node.js & Express\n• Database: MongoDB";

      return `For **${title}** (${domain}), here is the recommended technology stack:

### Technology Matrix:
${stackList}

**Project Reasoning:**
This stack provides maximum development speed, asynchronous event handling, and seamless JSON data exchange between client, server, and database layers without rigid schema migration friction.

**Recommended Action:**
Initialize the repository with standard npm/Node.js tooling and ensure environment variables (\`.env\`) are configured for database connection strings.

**Next Step:**
Review the **Decisions** tab if you wish to evaluate alternatives (e.g. PostgreSQL instead of MongoDB).`;
    }

    case "research": {
      const topics = guidance?.researchTopics || buildResearchTopics(domainInfo, hwInfo, aiInfo);
      const list = topics.map((t) => `• **${t.topic}**\n  *Why*: ${t.why}`).join("\n\n");

      return `Here are the key technical research directions for **${title}**:

${list}

**Project Reasoning:**
Investigating these core architectural patterns before writing heavy boilerplate code prevents costly refactoring later in development.

**Recommended Action:**
Conduct a 1-hour timeboxed technical spike testing sample code for the highest-risk topic above.

**Next Step:**
Document your findings in the **Research** tab under Project AI.`;
    }

    case "architecture": {
      const comps = projectContext.architectureComponents || [];
      const compText = comps.length > 0
        ? comps.map((c) => `• **[${c.type.toUpperCase()}] ${c.name}** (${c.technology || "Core Tier"})`).join("\n")
        : (hwInfo.status === "REQUIRED"
            ? "• **[HARDWARE]** Edge Sensor & Microcontroller Node\n• **[BACKEND]** Node.js Ingestion & REST API Gateway\n• **[DATABASE]** MongoDB / Time-Series Store\n• **[FRONTEND]** React Native / Web Management Dashboard"
            : "• **[FRONTEND]** React Client Application\n• **[BACKEND]** Express REST API Service\n• **[DATABASE]** Persistent Document Store");

      return `### System Architecture Overview for **${title}**:

${compText}

**Project Reasoning:**
A decoupled multi-tier architecture ensures that physical/client concerns, business processing logic, and persistent storage can scale and be tested independently.

**Recommended Action:**
Define clean JSON API contracts for request and response payloads between your tiers.

**Next Step:**
Inspect the **Architecture** tab under Project AI for component dependency mappings.`;
    }

    case "dependency":
    case "priority":
    case "task": {
      const sample = projectContext.taskStats?.sampleTitles || [];
      const sampleTxt = sample.length > 0 ? sample.slice(0, 5).map((t, idx) => `${idx + 1}. ${t}`).join("\n") : "No tasks created yet in backlog.";

      return `### Backlog & Task Sequencing for **${title}**:

• **Total Tasks**: ${projectContext.taskStats?.total || 0} (${projectContext.taskStats?.done || 0} completed)
• **Top Priority Sequence (Topological Order)**:
${sampleTxt}

**Project Reasoning:**
Topological sorting ensures prerequisite foundations (like project scaffolding, database schema, and sensor test circuits) are delivered before dependent consumer features (like analytics charts and user notifications).

**Recommended Action:**
Pick the highest-ranked \`todo\` task and assign it to an available team member in the **Tasks** tab.

**Next Step:**
Keep task sizes between 2–6 hours for accurate sprint velocity.`;
    }

    case "team": {
      const members = projectContext.teamMembers || [];
      const memberList = members.length > 0
        ? members.map((m) => `• **${m.name}** (${m.role || "Developer"})`).join("\n")
        : "• No team members added yet.";

      return `### Team & Skill Alignment for **${title}**:

${memberList}

**Project Reasoning:**
Ensuring workload distribution matches each member's skill strengths (frontend, backend, ML, hardware) maximizes velocity and minimizes blockers.

**Recommended Action:**
Ensure team members are configured in the **Members** tab to enable Branch & Bound task assignment optimization.

**Next Step:**
Review any skill gaps highlighted in the **Project Guidance** tab.`;
    }

    case "mvp": {
      const mvpList = guidance?.mvpPlanning?.mvp?.slice(0, 5).map((m) => `• ${m}`).join("\n") || "• Core Data Ingestion API\n• Database Persistence\n• Live Status Dashboard";

      return `### Core MVP Scope for **${title}**:

${mvpList}

**Project Reasoning:**
The MVP must deliver complete end-to-end functionality that proves your core concept without getting bogged down by secondary features.

**Recommended Action:**
Commit to delivering this MVP scope before starting any advanced post-MVP items.`;
    }

    case "advanced_features": {
      const advList = guidance?.mvpPlanning?.advanced?.slice(0, 5).map((m) => `• ${m}`).join("\n") || "• Automated Predictive Insights\n• Push Notifications & SMS Alerts\n• Multi-tenant Role Management";

      return `### Recommended Post-MVP Features for **${title}**:

${advList}

**Project Reasoning:**
These features add polish and enterprise value once your foundational core system is validated and demonstrated.`;
    }

    case "deployment": {
      return `### Deployment & Hosting Strategy for **${title}**:

• **Backend API**: Cloud container hosting on **Render / Railway** with automatic GitHub CI/CD deployments.
• **Database**: **MongoDB Atlas** (Free M0 cluster) or managed cloud database with IP whitelist access.
• **Frontend**: **Vercel / Expo Web** with continuous deployment on branch merges.

**Recommended Action:**
Setup environment variables (\`MONGO_URI\`, \`JWT_SECRET\`, \`PORT\`) in your cloud hosting provider dashboard.`;
    }

    case "testing": {
      return `### Testing Strategy for **${title}**:

• **Backend Tests**: Automated REST API endpoint verification with Jest / Supertest.
• **Hardware Tests**: Serial monitor boundary testing (min/max sensor readings, power disconnection handling).
• **Frontend Tests**: Component rendering and form submission validation.

**Recommended Action:**
Write at least 3 happy-path tests verifying your primary data ingestion endpoint.`;
    }

    default: {
      return `I am your Project Advisor for **${title}** (${domain}).

I can provide project-grounded guidance on:
• **Hardware Requirements & Circuit Setup** (microcontrollers, sensors, actuators)
• **Software Stack & Database Architecture** (Node.js, React, MongoDB)
• **Machine Learning & Dataset Guidance** (models, data collection, preprocessing)
• **Project Roadmap & Phased Tasks** (Topological Sort execution order)
• **Hackathon 24-Hour Time-Slicing** (0/1 Knapsack DP MVP scope)
• **Architectural Decision Analysis & Trade-offs**

What specific technical question would you like to explore for this project?`;
    }
  }
}

// ── 7. Project-Aware AI Chat Advisor Main Function ────────────────────────────
export async function chatWithProjectAdvisor({ projectId, conversationId, message, user }) {
  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    throw new Error("Valid projectId is required");
  }
  if (!message || !String(message).trim()) {
    throw new Error("Message content is required");
  }

  const projectContext = await buildProjectContext(projectId);
  const userId = mongoose.isValidObjectId(user?.id) ? user.id : null;

  // 1. Get or create private AIConversation scoped to [projectId + user.id]
  let conversation;
  if (conversationId && mongoose.isValidObjectId(conversationId)) {
    const query = { _id: conversationId, projectId };
    if (userId) query.startedBy = userId;
    conversation = await AIConversation.findOne(query);
  }

  if (!conversation && userId) {
    // Look for existing active conversation for this user and project
    conversation = await AIConversation.findOne({
      projectId,
      startedBy: userId,
      status: "active",
    }).sort({ updatedAt: -1 });
  }

  if (!conversation) {
    const convTitle = message.slice(0, 45).trim() || "Project Copilot";
    conversation = await AIConversation.create({
      projectId,
      title: convTitle,
      topic: "general_assistance",
      status: "active",
      startedBy: userId,
    });
  }

  // 2. Fetch recent conversation history (last 12 messages for context)
  const history = await AIMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();
  const chronologicalHistory = history.reverse();

  // 3. Extract feedback history
  const feedbackHistory = chronologicalHistory
    .filter((m) => m.role === "assistant" && m.feedback?.rating)
    .map((m) => ({
      rating: m.feedback.rating,
      snippet: m.content.slice(0, 150),
    }));

  // 4. Extract and persist memory updates
  const memoryUpdates = extractMemoryUpdates(message);
  if (memoryUpdates.length > 0) {
    try {
      const projDoc = await Project.findById(projectId);
      if (projDoc) {
        if (!Array.isArray(projDoc.copilotMemory)) projDoc.copilotMemory = [];
        for (const update of memoryUpdates) {
          const existingIdx = projDoc.copilotMemory.findIndex((m) => m.key === update.key);
          if (existingIdx >= 0) {
            projDoc.copilotMemory[existingIdx].value = update.value;
            projDoc.copilotMemory[existingIdx].createdAt = new Date();
          } else {
            projDoc.copilotMemory.push(update);
          }
        }
        await projDoc.save();
      }
    } catch (memErr) {
      console.warn("[chatWithProjectAdvisor] Failed to update project memory:", memErr.message);
    }
  }

  const latestProject = await Project.findById(projectId).select("copilotMemory").lean();
  const userMemory = latestProject?.copilotMemory || [];

  // 5. Classify Question Intent
  const detectedIntent = classifyQuestionIntent(message, chronologicalHistory);

  // 6. Save user message to AIMessage
  const userMsgDoc = await AIMessage.create({
    conversationId: conversation._id,
    projectId,
    role: "user",
    content: String(message).trim(),
    contextSnapshot: {
      phase: projectContext.currentPhase,
      domain: projectContext.domain,
      decisionsCount: projectContext.acceptedDecisions.length,
      intent: detectedIntent,
    },
    sentBy: userId,
  });

  // 7. Generate Phase 6 Guidance snapshot for full grounding
  let guidanceSnapshot = null;
  try {
    const fullText = `${projectContext.title} ${projectContext.description || projectContext.originalPrompt || ""}`;
    guidanceSnapshot = generateProjectGuidance({
      ctx: { projectTitle: projectContext.title, projectDescription: projectContext.description || projectContext.originalPrompt },
      tasks: [],
      members: projectContext.teamMembers || [],
      hackathonHours: 24,
      aiNarrative: null,
    });
  } catch (gErr) {
    console.warn("[chatWithProjectAdvisor] Guidance snapshot generation error:", gErr.message);
  }

  // 8. Construct system prompt
  const advisorSystemPrompt = `You are the NEXUSFLOW 2.0 Project Advisor & Copilot.
You have complete knowledge of the student's project, team state, decisions, and backlog:

PROJECT OVERVIEW:
- Title: ${projectContext.title}
- Domain: ${projectContext.domain}
- Type: ${projectContext.projectType}
- Problem Statement: ${projectContext.context.problemStatement || "Not yet defined"}
- Hardware Requirements: ${projectContext.context.hardwareRequirements.join(", ") || (guidanceSnapshot?.hardware?.status === "REQUIRED" ? guidanceSnapshot.hardware.items.map((i) => i.name).join(", ") : "None (Software only)")}
- Software Requirements: ${projectContext.context.softwareRequirements.join(", ") || "Node.js, Express, React, MongoDB"}
- AI/ML Requirements: ${projectContext.context.aiMlRequirements.join(", ") || (guidanceSnapshot?.aiMl?.status === "REQUIRED" ? guidanceSnapshot.aiMl.techniques.join(", ") : "Not necessary for core MVP")}
- Target Users: ${projectContext.context.targetUsers.join(", ") || "General"}

CONFIRMED ARCHITECTURAL DECISIONS (ACCEPTED BY TEAM):
${projectContext.acceptedDecisions.length > 0 ? projectContext.acceptedDecisions.map((d) => `• [${d.category}] ${d.title}: ${d.decision} (Reason: ${d.reasoning})`).join("\n") : "• No accepted decisions recorded yet."}

EXISTING ARCHITECTURE COMPONENTS:
${projectContext.architectureComponents.length > 0 ? projectContext.architectureComponents.map((c) => `• [${c.type}] ${c.name} (${c.technology})`).join("\n") : "• Architecture not yet generated."}

BACKLOG STATE:
- Total Tasks: ${projectContext.taskStats.total} (${projectContext.taskStats.done} completed, ${projectContext.taskStats.inProgress} in progress)
- Sample Tasks: ${projectContext.taskStats.sampleTitles.join("; ") || "None"}

CLASSIFIED QUESTION INTENT:
${detectedIntent.toUpperCase()}

CRITICAL RULES:
1. Answer the user's SPECIFIC question directly. Do NOT output a generic boilerplate answer.
2. If the user asks about hardware, address physical hardware, microcontrollers, and sensors for THIS project. If hardware is not needed, explain why.
3. If the user asks about AI/ML or datasets, explain whether machine learning is required for this project and describe the specific dataset needed.
4. If the user asks what to build first or what to do next, inspect project state and recommend the next concrete milestone.
5. If the user asks for a decision, recommend a specific architectural choice grounded in this project's constraints and current memory.
6. Provide a clear 4-part structure: Direct Answer, Project-Specific Reasoning, Recommended Action, and Next Step.
7. Format cleanly with markdown.`;

  // 9. Run AI Orchestrator with 3-tier fallback (OpenAI -> Gemini -> Deterministic)
  const { replyText, provider, tokensUsed } = await orchestrateCopilotChat({
    projectContext,
    systemPrompt: advisorSystemPrompt,
    conversationHistory: chronologicalHistory,
    userMessage: String(message).trim(),
    userMemory,
    feedbackHistory,
    guidanceSnapshot,
    detectedIntent,
  });

  // 10. Save assistant reply
  const assistantMsgDoc = await AIMessage.create({
    conversationId: conversation._id,
    projectId,
    role: "assistant",
    content: replyText,
    provider: provider || "deterministic",
    contextSnapshot: {
      phase: projectContext.currentPhase,
      domain: projectContext.domain,
      intent: detectedIntent,
    },
    tokensUsed,
  });

  // 11. Update message count and timestamp
  await AIConversation.updateOne(
    { _id: conversation._id },
    { $inc: { messageCount: 2 }, $set: { updatedAt: new Date() } }
  );

  return {
    success: true,
    conversationId: conversation._id,
    intent: detectedIntent,
    provider: provider || "deterministic",
    userMessage: userMsgDoc,
    assistantMessage: assistantMsgDoc,
  };
}

// ── Phase 3 Re-exports ────────────────────────────────────────────────────────
export {
  buildTaskGenerationContext,
  decomposeTasksWithContext,
  validateDecomposedTasks,
  generateHeuristicProjectTasks,
  normalizeTaskTitle,
  persistGeneratedTasks,
} from "./taskDecomposer.js";

