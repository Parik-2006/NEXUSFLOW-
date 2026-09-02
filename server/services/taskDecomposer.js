/**
 * server/services/taskDecomposer.js
 * ============================================================================
 * AI-ENHANCED TASK DECOMPOSER WITH PROJECT CONTEXT — NEXUSFLOW 2.0 (Phase 3).
 *
 * Bridges the Project Intelligence layer with the Task collection and the
 * deterministic DAA algorithmic pipeline (Greedy, TopoSort, Knapsack, Branch & Bound).
 *
 * CAPABILITIES:
 * 1. buildTaskGenerationContext(projectId, teamId, options)
 *    Extracts confirmed project facts, accepted decisions, system architecture,
 *    recommendations, research topics, team skills, and existing tasks.
 *
 * 2. decomposeTasksWithContext(options)
 *    Routes through OmniRoute ($0 AI policy) with strict structured JSON or executes the
 *    deterministic heuristic decomposer fallback. Supports modes:
 *      - "project": Full project implementation backlog
 *      - "related": Task related to a specific existing task or topic
 *      - "missing_phases": Tasks for unrepresented development phases
 *      - "subtasks": Break down a task into concrete subtasks
 *      - "architecture": Transform ArchitectureComponents into implementation work
 *      - "research": Transform ResearchItems into investigation spike tasks
 *
 * 3. validateDecomposedTasks(data)
 *    Validates structured tasks, ensuring proper category, effort, value,
 *    urgency, impact, and skill weights.
 *
 * 4. resolveTaskDependencies(generatedTasks, existingTasks)
 *    Resolves string dependency titles to valid MongoDB ObjectIds safely,
 *    preventing self-cycles and invalid references.
 *
 * 5. persistGeneratedTasks(teamId, projectId, rawTasks, options)
 *    Deduplicates against existing tasks using Boyer-Moore and normalized title
 *    matching. Persists new tasks with both teamId and projectId, triggers
 *    the Task pre-save hook for Greedy priorityScore, and computes TopoSort order.
 * ============================================================================
 */

import mongoose from "mongoose";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Decision from "../models/Decision.js";
import ArchitectureComponent from "../models/ArchitectureComponent.js";
import Recommendation from "../models/Recommendation.js";
import ResearchItem from "../models/ResearchItem.js";
import Resource from "../models/Resource.js";
import { buildProjectContext } from "./projectIntelligence.js";
import { computePriorityScore } from "../algorithms/greedyScheduler.js";
import { buildGraph, topologicalSort as topoSortGraph } from "../algorithms/graphTraversal.js";
import { boyerMooreSearch } from "../algorithms/taskOptimiser.js";
import { omniRouteGenerate } from "./omniRoute.js";

// ── 1. Build Task Generation Context ──────────────────────────────────────────
export async function buildTaskGenerationContext(projectId, teamId, options = {}) {
  let projectContext = null;

  if (projectId && mongoose.isValidObjectId(projectId)) {
    projectContext = await buildProjectContext(projectId);
  } else if (teamId && mongoose.isValidObjectId(teamId)) {
    const team = await Team.findById(teamId).lean();
    if (team?.activeProjectId) {
      projectContext = await buildProjectContext(team.activeProjectId);
    } else if (team) {
      projectContext = {
        projectId: null,
        teamId: team._id.toString(),
        teamName: team.name,
        teamMembers: (team.members || []).map((m) => ({
          name: m.name,
          role: m.role,
          skills: m.skills || {},
        })),
        title: team.projectTitle || team.name,
        description: team.projectDescription || "",
        originalPrompt: team.projectDescription || "",
        domain: "General Software",
        projectType: "Application",
        currentPhase: "planning",
        context: {},
        acceptedDecisions: [],
        acceptedRecommendations: [],
        architectureComponents: [],
        taskStats: { total: 0, sampleTitles: [] },
      };
    }
  }

  if (!projectContext) {
    throw new Error("Unable to build task context: valid projectId or teamId is required");
  }

  // Load existing tasks to detect existing categories and prevent duplicates
  const query = projectContext.projectId
    ? { $or: [{ projectId: projectContext.projectId }, { teamId: projectContext.teamId }] }
    : { teamId: projectContext.teamId };

  const existingTasks = await Task.find(query)
    .select("_id title category status urgency impact estimatedHours businessValue dependencies")
    .lean();

  const existingCategories = [...new Set(existingTasks.map((t) => t.category).filter(Boolean))];

  return {
    ...projectContext,
    existingTasks: existingTasks.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      category: t.category,
      status: t.status,
    })),
    existingCategories,
    focusedTaskId: options.taskId || null,
    targetPhase: options.phase || null,
    mode: options.mode || "project",
  };
}

// ── 2. Structured Task Output Validation ──────────────────────────────────────
export function validateDecomposedTasks(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Task decomposition output must be a valid JSON object");
  }

  const rawList = Array.isArray(data.tasks) ? data.tasks : Array.isArray(data) ? data : [];
  if (rawList.length === 0) {
    return [];
  }

  const validCategories = [
    "Planning",
    "Research",
    "Hardware",
    "Backend",
    "AI / ML",
    "Frontend",
    "Integration",
    "Testing",
    "Deployment",
    "Security",
    "General",
  ];

  return rawList
    .filter((t) => t && typeof t === "object" && typeof t.title === "string" && t.title.trim().length > 0)
    .map((t) => {
      // Normalize category
      let category = typeof t.category === "string" ? t.category.trim() : "General";
      const matchedCat = validCategories.find((c) => c.toLowerCase() === category.toLowerCase());
      if (matchedCat) category = matchedCat;

      const urgency = Math.min(Math.max(Number(t.urgency) || 2, 1), 5);
      const impact = Math.min(Math.max(Number(t.impact) || 2, 1), 5);
      const estimatedHours = Number.isFinite(Number(t.estimatedHours)) && Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 4;
      const businessValue = Number.isFinite(Number(t.businessValue)) && Number(t.businessValue) > 0 ? Number(t.businessValue) : impact * 2;

      // Normalize skill weights
      const rawSkills = t.skillWeights && typeof t.skillWeights === "object" ? t.skillWeights : {};
      const skillWeights = {
        frontend: Math.min(Math.max(Number(rawSkills.frontend) || 0, 0), 10),
        backend: Math.min(Math.max(Number(rawSkills.backend) || 0, 0), 10),
        devops: Math.min(Math.max(Number(rawSkills.devops) || 0, 0), 10),
        design: Math.min(Math.max(Number(rawSkills.design) || 0, 0), 10),
        ml: Math.min(Math.max(Number(rawSkills.ml) || 0, 0), 10),
        testing: Math.min(Math.max(Number(rawSkills.testing) || 0, 0), 10),
      };

      // Default skill weights by category if not explicitly provided
      if (Object.values(skillWeights).every((v) => v === 0)) {
        if (category === "Frontend") skillWeights.frontend = 7;
        else if (category === "Backend") skillWeights.backend = 8;
        else if (category === "AI / ML") skillWeights.ml = 8;
        else if (category === "Deployment") skillWeights.devops = 8;
        else if (category === "Testing") skillWeights.testing = 8;
        else if (category === "Hardware") { skillWeights.backend = 6; skillWeights.devops = 4; }
      }

      const dependsOnTitles = Array.isArray(t.dependsOnTitles)
        ? t.dependsOnTitles.map(String).filter(Boolean)
        : Array.isArray(t.dependencies)
        ? t.dependencies.map(String).filter(Boolean)
        : [];

      return {
        title: t.title.trim(),
        description: typeof t.description === "string" ? t.description.trim() : "",
        category,
        urgency,
        impact,
        estimatedHours,
        businessValue,
        skillWeights,
        dependsOnTitles,
        reason: typeof t.reason === "string" ? t.reason.trim() : `Generated for ${category} phase based on project context.`,
      };
    });
}

// ── 3. Heuristic / Deterministic Fallback Decomposer ───────────────────────────
export function generateHeuristicProjectTasks(context, options = {}) {
  const mode = options.mode || "project";
  const tasks = [];

  const text = `${context.title} ${context.originalPrompt} ${context.description}`.toLowerCase();
  const isIoT = context.domain?.toLowerCase().includes("iot") || /\b(iot|sensor|esp32|arduino|hardware|moisture)\b/i.test(text);
  const isAI = context.domain?.toLowerCase().includes("ai") || /\b(ai|ml|machine learning|prediction|vision|model)\b/i.test(text);
  const isMobile = /\b(mobile|react native|flutter|app)\b/i.test(text);

  // Extract accepted decisions to guide technologies
  const dbDecision = context.acceptedDecisions?.find((d) => d.category === "database" || /database|mongo|postgres/i.test(d.title + d.decision));
  const dbTech = dbDecision ? (dbDecision.selectedOption || "MongoDB") : "MongoDB";

  const archComps = context.architectureComponents || [];

  if (mode === "subtasks" && options.focusedTask) {
    const parent = options.focusedTask;
    tasks.push(
      {
        title: `Scope and define requirements for ${parent.title}`,
        description: `Establish specifications and acceptance criteria.`,
        category: parent.category || "Planning",
        urgency: 4,
        impact: 4,
        estimatedHours: 3,
        businessValue: 6,
        dependsOnTitles: [],
        reason: `Initial requirement analysis for ${parent.title}.`,
      },
      {
        title: `Implement core module logic for ${parent.title}`,
        description: `Write the core functional implementation.`,
        category: parent.category || "Backend",
        urgency: 4,
        impact: 5,
        estimatedHours: 6,
        businessValue: 10,
        dependsOnTitles: [`Scope and define requirements for ${parent.title}`],
        reason: `Core functional deliverable for ${parent.title}.`,
      },
      {
        title: `Write unit and integration tests for ${parent.title}`,
        description: `Ensure test coverage and validation.`,
        category: "Testing",
        urgency: 3,
        impact: 3,
        estimatedHours: 4,
        businessValue: 6,
        dependsOnTitles: [`Implement core module logic for ${parent.title}`],
        reason: `Quality assurance verification for ${parent.title}.`,
      }
    );
    return validateDecomposedTasks({ tasks });
  }

  if (mode === "architecture" && archComps.length > 0) {
    for (let i = 0; i < archComps.length; i++) {
      const c = archComps[i];
      let cat = "Backend";
      if (c.type === "hardware") cat = "Hardware";
      else if (c.type === "frontend") cat = "Frontend";
      else if (c.type === "ai_ml") cat = "AI / ML";
      else if (c.type === "database") cat = "Backend";

      tasks.push({
        title: `Implement and configure ${c.name} (${c.technology || "Module"})`,
        description: c.description || `Build and integrate the ${c.name} architecture tier.`,
        category: cat,
        urgency: 4,
        impact: 4,
        estimatedHours: 6,
        businessValue: 8,
        dependsOnTitles: i > 0 ? [`Implement and configure ${archComps[i - 1].name} (${archComps[i - 1].technology || "Module"})`] : [],
        reason: `Derived directly from architecture component: ${c.name}.`,
      });
    }
    return validateDecomposedTasks({ tasks });
  }

  if (mode === "research") {
    tasks.push(
      {
        title: `Conduct feasibility research on ${context.domain} technical architecture`,
        description: `Investigate baseline specifications and protocols.`,
        category: "Research",
        urgency: 4,
        impact: 3,
        estimatedHours: 4,
        businessValue: 6,
        dependsOnTitles: [],
        reason: `Feasibility study for ${context.title}.`,
      },
      {
        title: `Evaluate hardware and cloud API integration tradeoffs`,
        description: `Document latency, bandwidth, and cost comparisons.`,
        category: "Research",
        urgency: 3,
        impact: 3,
        estimatedHours: 4,
        businessValue: 6,
        dependsOnTitles: [],
        reason: `Research evaluation for project integrations.`,
      }
    );
    return validateDecomposedTasks({ tasks });
  }

  if (mode === "missing_phases") {
    const existing = new Set(context.existingCategories || []);
    if (!existing.has("Testing")) {
      tasks.push({
        title: "Build Automated End-to-End Test Suite",
        description: "Create integration tests covering core API and hardware ingestion pipelines.",
        category: "Testing",
        urgency: 4,
        impact: 4,
        estimatedHours: 5,
        businessValue: 8,
        dependsOnTitles: [],
        reason: "Detected missing Testing phase in current backlog.",
      });
    }
    if (!existing.has("Deployment")) {
      tasks.push({
        title: "Configure CI/CD Pipeline and Cloud Deployment",
        description: "Set up automated deployment to Render and configure production environment secrets.",
        category: "Deployment",
        urgency: 3,
        impact: 4,
        estimatedHours: 4,
        businessValue: 7,
        dependsOnTitles: [],
        reason: "Detected missing Deployment phase in current backlog.",
      });
    }
    if (tasks.length === 0) {
      tasks.push({
        title: "Conduct Security Audit and Access Control Review",
        description: "Verify JWT authentication and input validation across all endpoints.",
        category: "Security",
        urgency: 3,
        impact: 4,
        estimatedHours: 4,
        businessValue: 6,
        dependsOnTitles: [],
        reason: "All primary phases present; added Security verification phase.",
      });
    }
    return validateDecomposedTasks({ tasks });
  }

  // Default "project" full backlog mode:
  // Phase 1: Planning & Setup
  tasks.push({
    title: `Define ${context.title} Technical Specifications & API Contracts`,
    description: `Finalize data models, interface endpoints, and communication payloads.`,
    category: "Planning",
    urgency: 5,
    impact: 4,
    estimatedHours: 4,
    businessValue: 8,
    dependsOnTitles: [],
    reason: "Foundational planning task required before implementation.",
  });

  // Phase 2: Hardware / Core Data (if IoT)
  if (isIoT) {
    tasks.push(
      {
        title: "Configure ESP32 Toolchain and Sensor Wiring",
        description: "Wire capacitive sensors and configure PlatformIO/Arduino firmware environment.",
        category: "Hardware",
        urgency: 5,
        impact: 5,
        estimatedHours: 6,
        businessValue: 10,
        dependsOnTitles: [`Define ${context.title} Technical Specifications & API Contracts`],
        reason: "Hardware foundation required for physical telemetry.",
      },
      {
        title: "Implement Sensor Telemetry Transmission over Wi-Fi/MQTT",
        description: "Package sensor ADC readings into JSON payloads and publish to gateway.",
        category: "Hardware",
        urgency: 4,
        impact: 4,
        estimatedHours: 5,
        businessValue: 8,
        dependsOnTitles: ["Configure ESP32 Toolchain and Sensor Wiring"],
        reason: "Enables hardware-to-backend communication.",
      }
    );
  }

  // Phase 3: Backend & Database (incorporating accepted decisions!)
  tasks.push(
    {
      title: `Design ${dbTech} Schema for Telemetry and User State`,
      description: `Create Mongoose models with appropriate indexes matching ${dbTech} best practices.`,
      category: "Backend",
      urgency: 4,
      impact: 5,
      estimatedHours: 5,
      businessValue: 10,
      dependsOnTitles: [`Define ${context.title} Technical Specifications & API Contracts`],
      reason: `Aligned with accepted database decision (${dbTech}).`,
    },
    {
      title: "Develop REST Ingestion and Analytics Endpoints",
      description: "Build Node.js/Express routes with authentication and validation.",
      category: "Backend",
      urgency: 4,
      impact: 5,
      estimatedHours: 6,
      businessValue: 10,
      dependsOnTitles: [`Design ${dbTech} Schema for Telemetry and User State`],
      reason: "Core API layer for client interaction.",
    }
  );

  // Phase 4: AI / ML (if AI project)
  if (isAI || isIoT) {
    tasks.push({
      title: "Develop and Train Predictive Analytics Model",
      description: "Preprocess historical data and train lightweight time-series forecasting model.",
      category: "AI / ML",
      urgency: 3,
      impact: 5,
      estimatedHours: 8,
      businessValue: 10,
      dependsOnTitles: ["Develop REST Ingestion and Analytics Endpoints"],
      reason: "Delivers intelligent predictive capabilities.",
    });
  }

  // Phase 5: Frontend
  tasks.push({
    title: isMobile ? "Build Mobile Dashboard with Real-Time Telemetry Cards" : "Build Web Dashboard with Interactive Charts",
    description: "Implement responsive UI components showing live status and historical graphs.",
    category: "Frontend",
    urgency: 3,
    impact: 4,
    estimatedHours: 6,
    businessValue: 8,
    dependsOnTitles: ["Develop REST Ingestion and Analytics Endpoints"],
    reason: "Provides user visibility into system operations.",
  });

  // Phase 6: Testing & Deployment
  tasks.push(
    {
      title: "Implement End-to-End Pipeline Tests",
      description: "Validate full flow from data ingestion to dashboard visualization.",
      category: "Testing",
      urgency: 3,
      impact: 3,
      estimatedHours: 4,
      businessValue: 6,
      dependsOnTitles: [isMobile ? "Build Mobile Dashboard with Real-Time Telemetry Cards" : "Build Web Dashboard with Interactive Charts"],
      reason: "Ensures system reliability and integration stability.",
    },
    {
      title: "Deploy Backend API to Cloud and Set Up Monitoring",
      description: "Deploy to Render/Vercel with health check monitoring and error logging.",
      category: "Deployment",
      urgency: 2,
      impact: 4,
      estimatedHours: 3,
      businessValue: 7,
      dependsOnTitles: ["Implement End-to-End Pipeline Tests"],
      reason: "Prepares system for production operation.",
    }
  );

  return validateDecomposedTasks({ tasks });
}

// ── 4. Main Decomposition Service (OmniRoute / Heuristic Fallback) ─────────────
export async function decomposeTasksWithContext(options = {}) {
  const { projectId, teamId, mode = "project", prompt = "", taskId, phase, previewOnly = false, user } = options;

  let focusedTask = null;
  if (taskId && mongoose.isValidObjectId(taskId)) {
    focusedTask = await Task.findById(taskId).lean();
  }

  const context = await buildTaskGenerationContext(projectId, teamId, { taskId, phase, mode });
  if (focusedTask) {
    context.focusedTask = focusedTask;
  }

  let rawTasks = [];

  try {
    const systemPrompt = `You are a Principal Technical Lead and Task Decomposer in NEXUSFLOW 2.0.
Your responsibility is to break down a project into concrete, actionable engineering tasks.

PROJECT CONTEXT & FACTS:
- Title: ${context.title}
- Domain: ${context.domain}
- Project Type: ${context.projectType}
- Problem Statement: ${context.context.problemStatement || "Not specified"}
- Target Users: ${context.context.targetUsers?.join(", ") || "General Users"}
- Hardware Requirements: ${context.context.hardwareRequirements?.join(", ") || "None"}
- Software Requirements: ${context.context.softwareRequirements?.join(", ") || "Node.js, Express"}
- AI/ML Requirements: ${context.context.aiMlRequirements?.join(", ") || "None"}
- Integrations: ${context.context.integrations?.join(", ") || "None"}

CONFIRMED ARCHITECTURAL DECISIONS (MUST RESPECT):
${context.acceptedDecisions?.length > 0 ? context.acceptedDecisions.map((d) => `• [${d.category}] ${d.title}: ${d.decision}`).join("\n") : "• None"}

ARCHITECTURE TIERS:
${context.architectureComponents?.length > 0 ? context.architectureComponents.map((c) => `• [${c.type}] ${c.name} (${c.technology})`).join("\n") : "• None"}

TEAM SKILL PROFILE:
${context.teamMembers?.map((m) => `• ${m.name} (${m.role}): Backend ${m.skills.backend || 5}, Frontend ${m.skills.frontend || 5}, ML ${m.skills.ml || 5}`).join("\n") || "Standard team"}

EXISTING TASKS (DO NOT DUPLICATE):
${context.existingTasks?.slice(0, 15).map((t) => `• [${t.category}] ${t.title}`).join("\n") || "No tasks yet."}

TASK GENERATION INSTRUCTIONS:
- Mode: "${mode}" ${phase ? `(Target Phase: ${phase})` : ""} ${prompt ? `(Custom Prompt: "${prompt}")` : ""}
- Output a STRICT JSON object: { "tasks": [ ... ] }
- Each task MUST contain:
  1. "title": (string) Crisp, imperative Jira-style title (3-8 words, e.g. "Implement MQTT Telemetry Ingestion Endpoint").
  2. "description": (string) Clear engineering deliverables.
  3. "category": "Planning"|"Research"|"Hardware"|"Backend"|"AI / ML"|"Frontend"|"Integration"|"Testing"|"Deployment"|"Security"
  4. "urgency": (integer 1-5)
  5. "impact": (integer 1-5)
  6. "estimatedHours": (number, 1-16)
  7. "businessValue": (number, 1-20)
  8. "skillWeights": { "frontend": 0-10, "backend": 0-10, "devops": 0-10, "design": 0-10, "ml": 0-10, "testing": 0-10 }
  9. "dependsOnTitles": (array of strings) Referencing other task titles in this batch or existing tasks.
  10. "reason": (string) One sentence explaining why this task is needed given the project context/decisions.

CRITICAL RULES:
- Ground all tasks specifically in the project's domain (${context.domain}).
- Never generate e-commerce/checkout/payment tasks unless the project is specifically an e-commerce platform.
- Respect all accepted decisions (e.g. if MongoDB is accepted, do not generate PostgreSQL tasks).
- Return ONLY the JSON object.`;

      const userMessage = `Generate ${mode} tasks for "${context.title}". ${prompt ? `User instruction: ${prompt}` : ""}`;

      const omniResult = await omniRouteGenerate({
        systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 2500,
      });

      if (omniResult && omniResult.content) {
        let clean = omniResult.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(clean);
        rawTasks = validateDecomposedTasks(parsed);
      } else {
        rawTasks = generateHeuristicProjectTasks(context, { mode, phase, focusedTask });
      }
    } catch (err) {
      console.warn("[taskDecomposer] OmniRoute generation failed, using heuristic fallback:", err.message);
      rawTasks = generateHeuristicProjectTasks(context, { mode, phase, focusedTask });
    }

  if (previewOnly) {
    return {
      success: true,
      mode,
      preview: true,
      taskCount: rawTasks.length,
      tasks: rawTasks,
      contextHighlights: {
        domain: context.domain,
        acceptedDecisionsCount: context.acceptedDecisions?.length || 0,
        architectureComponentsCount: context.architectureComponents?.length || 0,
      },
    };
  }

  // Persist to MongoDB
  return persistGeneratedTasks(context.teamId, context.projectId, rawTasks, { user });
}

// ── 5. Duplicate Detection & Persistence Engine ───────────────────────────────
export function normalizeTaskTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/["'`]/g, "")
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function persistGeneratedTasks(teamId, projectId, proposedTasks, options = {}) {
  if (!teamId || !mongoose.isValidObjectId(teamId)) {
    throw new Error("Valid teamId is required for task persistence");
  }

  const existingTasks = await Task.find({ teamId }).lean();
  const existingNormalizedMap = new Map();

  for (const t of existingTasks) {
    existingNormalizedMap.set(normalizeTaskTitle(t.title), t._id);
  }

  const tasksToCreate = [];
  let duplicatesSkipped = 0;

  for (const pTask of proposedTasks) {
    const norm = normalizeTaskTitle(pTask.title);
    if (existingNormalizedMap.has(norm)) {
      duplicatesSkipped++;
      continue;
    }

    // Check Boyer-Moore match against existing titles
    const bmMatches = boyerMooreSearch(existingTasks, pTask.title);
    if (bmMatches.length > 0 && bmMatches[0].title.toLowerCase() === pTask.title.toLowerCase()) {
      duplicatesSkipped++;
      continue;
    }

    existingNormalizedMap.set(norm, null); // mark as reserved
    tasksToCreate.push(pTask);
  }

  if (tasksToCreate.length === 0) {
    const allTasks = await Task.find({ teamId }).sort({ priorityScore: -1, createdAt: 1 }).lean();
    return {
      success: true,
      added: 0,
      duplicatesSkipped,
      tasks: allTasks,
    };
  }

  // 1. First pass: Insert tasks without dependencies to obtain ObjectIds
  const createdDocs = [];
  const titleToIdMap = new Map();

  for (const [normTitle, id] of existingNormalizedMap.entries()) {
    if (id) titleToIdMap.set(normTitle, id);
  }

  for (const pTask of tasksToCreate) {
    const taskDoc = await Task.create({
      teamId,
      projectId: projectId && mongoose.isValidObjectId(projectId) ? projectId : null,
      title: pTask.title,
      description: pTask.description,
      category: pTask.category,
      urgency: pTask.urgency,
      impact: pTask.impact,
      estimatedHours: pTask.estimatedHours,
      businessValue: pTask.businessValue,
      skillWeights: pTask.skillWeights,
      source: "ai",
      status: "todo",
      dependencies: [],
      dependencyCount: 0,
      ...(options.user && mongoose.isValidObjectId(options.user.id) ? { createdBy: options.user.id } : {}),
    });

    createdDocs.push({ doc: taskDoc, dependsOnTitles: pTask.dependsOnTitles });
    titleToIdMap.set(normalizeTaskTitle(pTask.title), taskDoc._id);
  }

  // 2. Second pass: Wire dependencies safely
  const depBulkOps = [];
  for (const { doc, dependsOnTitles } of createdDocs) {
    if (Array.isArray(dependsOnTitles) && dependsOnTitles.length > 0) {
      const resolvedDepIds = [];
      for (const depTitle of dependsOnTitles) {
        const normDep = normalizeTaskTitle(depTitle);
        const depId = titleToIdMap.get(normDep);
        if (depId && depId.toString() !== doc._id.toString()) {
          resolvedDepIds.push(depId);
        }
      }

      if (resolvedDepIds.length > 0) {
        const uniqueDepIds = [...new Set(resolvedDepIds.map((id) => id.toString()))].map((id) => new mongoose.Types.ObjectId(id));
        depBulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                dependencies: uniqueDepIds,
                dependencyCount: uniqueDepIds.length,
              },
            },
          },
        });
      }
    }
  }

  if (depBulkOps.length > 0) {
    await Task.bulkWrite(depBulkOps, { ordered: false });
  }

  // 3. Third pass: Recompute Kahn's Topological Sort order
  const allTeamTasks = await Task.find({ teamId }).lean();
  const { adjList, inDegree } = buildGraph(allTeamTasks);
  const topoResult = topoSortGraph(adjList, inDegree);

  if (topoResult.order && topoResult.order.length > 0) {
    const topoBulkOps = topoResult.order.map((id, idx) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { topoOrder: idx } },
      },
    }));
    if (topoBulkOps.length > 0) {
      await Task.bulkWrite(topoBulkOps, { ordered: false });
    }
  }

  // 4. Update team and project counters
  await Team.updateOne({ _id: teamId }, { $inc: { taskCount: createdDocs.length } });
  if (projectId && mongoose.isValidObjectId(projectId)) {
    await Project.updateOne({ _id: projectId }, { $inc: { taskCount: createdDocs.length } });
  }

  const finalTasks = await Task.find({ teamId }).sort({ priorityScore: -1, createdAt: 1 }).lean();

  return {
    success: true,
    added: createdDocs.length,
    duplicatesSkipped,
    tasks: finalTasks,
  };
}
