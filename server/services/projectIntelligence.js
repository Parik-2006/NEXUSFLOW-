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
 *    Queries OpenAI (gpt-4o-mini) with strict structured JSON output to extract:
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

const OPENAI_KEY = process.env.OPENAI_API_KEY;

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

    recommendations: Array.isArray(data.recommendations) ? data.recommendations.map((r) => ({
      recommendationType: typeof r.recommendationType === "string" ? r.recommendationType : "technology",
      recommendedItem: String(r.recommendedItem || r.item || "").trim(),
      category: typeof r.category === "string" ? r.category.trim() : "",
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      confidence: typeof r.confidence === "number" ? Math.min(Math.max(r.confidence, 0), 1) : 0.85,
      alternatives: Array.isArray(r.alternatives) ? r.alternatives.map(String) : [],
    })).filter((r) => Boolean(r.recommendedItem)) : [],

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

// ── 4. Analyze Project with OpenAI / Heuristic ─────────────────────────────────
export async function analyzeProject(projectId, options = {}) {
  const context = await buildProjectContext(projectId);

  if (!OPENAI_KEY) {
    // Graceful fallback when OpenAI key is not configured
    const heuristicData = generateHeuristicAnalysis(context);
    return persistAnalysisResults(projectId, heuristicData, { source: "heuristic" });
  }

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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[projectIntelligence] OpenAI API returned ${res.status}: ${errBody}. Falling back to heuristic.`);
      const fallback = generateHeuristicAnalysis(context);
      return persistAnalysisResults(projectId, fallback, { source: "heuristic" });
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Empty response from AI analyzer");
    }

    const parsed = JSON.parse(rawContent);
    const validated = validateAnalyzerOutput(parsed);
    return persistAnalysisResults(projectId, validated, { source: "ai" });
  } catch (err) {
    console.error("[projectIntelligence] OpenAI analysis error:", err.message);
    const fallback = generateHeuristicAnalysis(context);
    return persistAnalysisResults(projectId, fallback, { source: "heuristic", error: err.message });
  }
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

// ── 6. Project-Aware AI Chat Advisor ──────────────────────────────────────────
export async function chatWithProjectAdvisor({ projectId, conversationId, message, user }) {
  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    throw new Error("Valid projectId is required");
  }
  if (!message || !String(message).trim()) {
    throw new Error("Message content is required");
  }

  const projectContext = await buildProjectContext(projectId);

  // 1. Get or create AIConversation
  let conversation;
  if (conversationId && mongoose.isValidObjectId(conversationId)) {
    conversation = await AIConversation.findOne({ _id: conversationId, projectId });
  }

  if (!conversation) {
    const convTitle = message.slice(0, 45).trim() || "Project Advisory";
    conversation = await AIConversation.create({
      projectId,
      title: convTitle,
      topic: "general_assistance",
      status: "active",
      startedBy: mongoose.isValidObjectId(user?.id) ? user.id : null,
    });
  }

  // 2. Save user message to AIMessage
  const userMsgDoc = await AIMessage.create({
    conversationId: conversation._id,
    projectId,
    role: "user",
    content: String(message).trim(),
    contextSnapshot: {
      phase: projectContext.currentPhase,
      domain: projectContext.domain,
      decisionsCount: projectContext.acceptedDecisions.length,
    },
    sentBy: mongoose.isValidObjectId(user?.id) ? user.id : null,
  });

  // 3. Fetch recent conversation history (last 8 messages for context)
  const history = await AIMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const chronologicalHistory = history.reverse();

  // 4. Build Project-Aware System Prompt
  const advisorSystemPrompt = `You are the NEXUSFLOW 2.0 Project Advisor & Copilot.
You have complete knowledge of the student's project and team state:

PROJECT OVERVIEW:
- Title: ${projectContext.title}
- Domain: ${projectContext.domain}
- Type: ${projectContext.projectType}
- Original Prompt: ${projectContext.originalPrompt}
- Problem Statement: ${projectContext.context.problemStatement || "Not yet defined"}
- Target Users: ${projectContext.context.targetUsers.join(", ") || "General"}
- Hardware Requirements: ${projectContext.context.hardwareRequirements.join(", ") || "None"}
- Software Requirements: ${projectContext.context.softwareRequirements.join(", ") || "None"}
- AI/ML Requirements: ${projectContext.context.aiMlRequirements.join(", ") || "None"}
- Integrations: ${projectContext.context.integrations.join(", ") || "None"}

CONFIRMED ARCHITECTURAL DECISIONS (ACCEPTED BY TEAM):
${projectContext.acceptedDecisions.length > 0 ? projectContext.acceptedDecisions.map((d) => `• [${d.category}] ${d.title}: ${d.decision} (Reason: ${d.reasoning})`).join("\n") : "• No accepted decisions recorded yet."}

EXISTING ARCHITECTURE COMPONENTS:
${projectContext.architectureComponents.length > 0 ? projectContext.architectureComponents.map((c) => `• [${c.type}] ${c.name} (${c.technology})`).join("\n") : "• Architecture not yet generated."}

ACCEPTED RECOMMENDATIONS:
${projectContext.acceptedRecommendations.length > 0 ? projectContext.acceptedRecommendations.map((r) => `• ${r.item} (${r.type})`).join("\n") : "• None accepted yet."}

BACKLOG STATE:
- Total Tasks: ${projectContext.taskStats.total} (${projectContext.taskStats.done} completed, ${projectContext.taskStats.inProgress} in progress)
- Sample Tasks: ${projectContext.taskStats.sampleTitles.join("; ") || "None"}

INSTRUCTIONS:
- Answer questions directly, thoughtfully, and specifically for THIS project.
- Always respect and refer to confirmed decisions when answering.
- If recommending technologies, explain WHY in relation to the project constraints and hardware/software requirements.
- Never hallucinate unrelated e-commerce/payment systems unless the project specifically involves them.
- Format responses cleanly with markdown.`;

  let replyText = "";
  let tokensUsed = { prompt: null, completion: null, total: null };

  if (OPENAI_KEY) {
    try {
      const messagesForOpenAI = [
        { role: "system", content: advisorSystemPrompt },
        ...chronologicalHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messagesForOpenAI,
          temperature: 0.5,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        replyText = json.choices?.[0]?.message?.content || "I am analyzing your project context.";
        if (json.usage) {
          tokensUsed = {
            prompt: json.usage.prompt_tokens,
            completion: json.usage.completion_tokens,
            total: json.usage.total_tokens,
          };
        }
      } else {
        replyText = `Based on ${projectContext.title} (${projectContext.domain}), consider exploring our recommended stack: ${projectContext.context.preferredStack.join(", ") || "Node.js, React, and MongoDB"}.`;
      }
    } catch (err) {
      replyText = `Based on your project "${projectContext.title}", I recommend focusing on ${projectContext.domain} components and establishing your core architecture.`;
    }
  } else {
    // Deterministic fallback response when OpenAI key is not present
    replyText = `As your Project Advisor for "${projectContext.title}" (${projectContext.domain}):
• **Current Phase**: ${projectContext.currentPhase}
• **Key Technologies**: ${projectContext.context.preferredStack.join(", ") || "Node.js, Express, MongoDB"}
• **Recommended Next Step**: Review pending decisions and confirm your component architecture in the Advisor tab.`;
  }

  // 5. Save assistant reply
  const assistantMsgDoc = await AIMessage.create({
    conversationId: conversation._id,
    projectId,
    role: "assistant",
    content: replyText,
    contextSnapshot: {
      phase: projectContext.currentPhase,
      domain: projectContext.domain,
    },
    tokensUsed,
  });

  // 6. Update message count
  await AIConversation.updateOne(
    { _id: conversation._id },
    { $inc: { messageCount: 2 } }
  );

  return {
    conversationId: conversation._id,
    userMessage: userMsgDoc,
    assistantMessage: assistantMsgDoc,
  };
}
