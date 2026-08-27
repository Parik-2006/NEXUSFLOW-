import { Router } from "express";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import Task from "../models/Task.js";
import { requireAuth } from "../auth.js";
import { greedySortTasks, computePriorityScore } from "../algorithms/greedyScheduler.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { buildGraph, dfs, bfs, topologicalSort as topoSortGraph } from "../algorithms/graphTraversal.js";
import { compareSortAlgorithms, mergeSortTasks, quickSortTasks } from "../utils/sortAlgorithms.js";
import { decomposeProject, extractFeatures } from "../algorithms/projectDecomposer.js";
import { boyerMooreSearch, mergeSort } from "../algorithms/taskOptimiser.js";
import { decomposeTasksWithContext } from "../services/taskDecomposer.js";
import { buildCompactProjectContext } from "../utils/projectContextBuilder.js";
import { evaluateDecision, listDecisionTypes } from "../algorithms/decisionEngine.js";
import { generateProjectGuidance } from "../algorithms/projectGuidanceEngine.js";

const router = Router();

// Above this size, skip Bubble Sort in the live analytics comparison.
const MAX_COMPARISON_SIZE = 500;

// Knapsack safety: cap sprint capacity so the DP table (W = hours × 10) cannot
// blow up memory. 200h → capacity 2000 columns, comfortably bounded.
const MAX_SPRINT_HOURS = 200;

// ── GET /api/teams ────────────────────────────────────────────────────────────
router.get("/teams", requireAuth, async (_req, res) => {
  try {
    const teams = await Team.find().lean();
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId ────────────────────────────────────────────────────
// Single team (with members) for the workspace / assignment board.
router.get("/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams ───────────────────────────────────────────────────────────
// Create a team. Body: { name, members?: [{ name, skills? }], tasks?: [{title,...}] }
// The creator is always added as the first member so they appear in the roster.
router.post("/teams", requireAuth, async (req, res) => {
  try {
    const { name, members = [], tasks = [], projectTitle = "", projectDescription = "", logo = "", creatorImage = "" } = req.body ?? {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Team name is required." });

    const oid = () => new mongoose.Types.ObjectId();
    const creator = {
      userId: oid(),
      name: req.user?.name || req.user?.email || "You",
      avatar: typeof creatorImage === "string" ? creatorImage : "",
      skills: normalizeSkills(req.body.creatorSkills),
    };
    const extraMembers = (Array.isArray(members) ? members : [])
      .filter((m) => m && (m.name?.trim()))
      .map((m) => ({ userId: oid(), name: m.name.trim(), avatar: typeof m.avatar === "string" ? m.avatar : "", skills: normalizeSkills(m.skills) }));

    // Build the starter backlog. When a project description exists we DECOMPOSE
    // it into a grouped, professional backlog (Planning / Backend / Frontend / …)
    // — the description is never copied verbatim. Explicit client `tasks` are
    // only used as a fallback when no description is provided.
    const desc = String(projectDescription).trim();
    const generated = desc ? decomposeProject(String(projectTitle).trim(), desc) : [];
    const sourceTasks = generated.length ? generated : (Array.isArray(tasks) ? tasks : []);

    const seeds = sourceTasks
      .filter((t) => t && t.title?.trim())
      .map((t) => ({
        title: t.title.trim(),
        description: (t.description ?? "").trim(),
        category: t.category ?? "General",
        urgency: clampInt(t.urgency, 1, 5, 2),
        impact: clampInt(t.impact, 1, 5, 2),
        businessValue: numOrNull(t.businessValue),
        estimatedHours: numOrNull(t.estimatedHours),
        priorityLabel: t.priorityLabel ?? null,
      }));

    const team = await Team.create({
      name: name.trim(),
      logo: typeof logo === "string" ? logo : "",
      projectTitle: String(projectTitle).trim(),
      projectDescription: String(projectDescription).trim(),
      members: [creator, ...extraMembers],
      aiGeneratedTasks: seeds,
    });

    // Create the initial AI/starter tasks (source = "ai") + wire phase deps.
    if (seeds.length) {
      const count = await createSeededTasks(team._id, seeds);
      await Team.updateOne({ _id: team._id }, { $set: { taskCount: count } });
    }

    const fresh = await Team.findById(team._id).lean();
    res.status(201).json(fresh);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/members ───────────────────────────────────────────
// Add a member. Body: { name, skills? }
router.post("/teams/:teamId/members", requireAuth, async (req, res) => {
  try {
    const { name, skills, avatar = "" } = req.body ?? {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Member name is required." });
    const member = {
      userId: new mongoose.Types.ObjectId(),
      name: name.trim(),
      avatar: typeof avatar === "string" ? avatar : "",
      skills: normalizeSkills(skills),
    };
    const team = await Team.findByIdAndUpdate(
      req.params.teamId,
      { $push: { members: member } },
      { new: true, lean: true }
    );
    if (!team) return res.status(404).json({ error: "team_not_found" });
    res.status(201).json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId ──────────────────────────────────────────────────
// Update team name / logo / title / description / settings. Additive, no breaking
// changes; persists instantly so all live views (which re-fetch the team) update.
router.patch("/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const update = {};
    const top = ["name", "logo", "projectTitle", "projectDescription"];
    for (const k of top) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.name !== undefined && !String(update.name).trim())
      return res.status(400).json({ error: "Team name cannot be empty." });
    if (update.name !== undefined) update.name = String(update.name).trim();

    if (req.body.settings && typeof req.body.settings === "object") {
      const SET = ["sprintCapacity", "defaultReminder", "aiPreferences", "defaultPriority", "themeColor"];
      for (const sk of SET) if (req.body.settings[sk] !== undefined) update[`settings.${sk}`] = req.body.settings[sk];
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: "No valid fields to update." });

    const team = await Team.findByIdAndUpdate(req.params.teamId, { $set: update }, { new: true, lean: true });
    if (!team) return res.status(404).json({ error: "team_not_found" });
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/generate-tasks ────────────────────────────────────
// Append more AI tasks via the EXISTING decomposer (no new decomposition logic).
// Optionally targets a single phase when the prompt names one. Append-only:
// never deletes or overwrites existing tasks.
const PHASE_MATCH = [
  { re: /\b(test|qa|quality)\b/i, cat: "Testing" },
  { re: /\b(deploy|devops|ci\/?cd|release|monitor)\b/i, cat: "Deployment" },
  { re: /\b(front|ui|ux|dashboard|screen)\b/i, cat: "Frontend" },
  { re: /\b(back|api|database|server|service)\b/i, cat: "Backend" },
  { re: /\b(ai|ml|model|machine learning|prediction)\b/i, cat: "AI / ML" },
  { re: /\b(plan|requirement|scope)\b/i, cat: "Planning" },
  { re: /\b(research|feasibility)\b/i, cat: "Research" },
  { re: /\b(hardware|iot|sensor|device)\b/i, cat: "Hardware" },
  { re: /\b(integrat|realtime|notification|alert)\b/i, cat: "Integration" },
];
router.post("/teams/:teamId/generate-tasks", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { prompt = "" } = req.body ?? {};
    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });

    // NEXUSFLOW 2.0: If team has an active project, use project-aware task decomposition
    if (team.activeProjectId) {
      const match = PHASE_MATCH.find((p) => p.re.test(prompt));
      const mode = match ? "missing_phases" : "project";
      const result = await decomposeTasksWithContext({
        projectId: team.activeProjectId,
        teamId,
        mode,
        prompt: String(prompt).trim(),
        phase: match?.cat,
        user: req.user,
      });
      return res.json(result);
    }

    // Legacy fallback when no active project exists
    const text = String(prompt).trim() || team.projectDescription || team.projectTitle || team.name;
    let seeds = decomposeProject(team.projectTitle || team.name, text);

    // Targeted phase generation when the prompt names a phase.
    const match = PHASE_MATCH.find((p) => p.re.test(prompt));
    if (match) {
      const filtered = seeds.filter((s) => s.category === match.cat).map((s) => ({ ...s, phaseIndex: 0 }));
      if (filtered.length) seeds = filtered;
    }
    if (!seeds.length) return res.json({ added: 0, tasks: [] });

    const added = await createSeededTasks(teamId, seeds);     // APPEND (no delete) + wire + topo
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: added } });

    const tasks = await Task.find({ teamId }).sort({ priorityScore: -1, createdAt: 1 }).lean();
    res.json({ added, tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/ai-suggest ────────────────────────────────────────
// PHASE 4 — Team-aware AI Project Assistant.
//
// Reuses existing DAA building blocks (NO new algorithms created):
//   • projectDecomposer  → deterministic project-related candidate pool
//   • computePriorityScore (Greedy) → priority scoring
//   • boyerMooreSearch   → duplicate detection against existing backlog
//   • mergeSort          → candidate ranking
//   • Topological reasoning → dependency awareness
//   • buildCompactProjectContext → lean team-aware context object
//
// When OPENAI_API_KEY is present: uses OpenAI gpt-4o-mini with structured JSON
//   output for genuinely project-specific suggestions in all modes.
// When no key: falls back to the existing deterministic decomposer path.
//
// Modes:
//   "related"      → A new task genuinely related to this project
//   "missing-phase"→ Identify an important missing project phase
//   "subtasks"     → Break a specific existing task into subtasks
//   "project-plan" → Structured project plan: tech stack, research, risks, effort
//   "architecture" → Architecture-level implementation tasks
//   "research"     → Research spike tasks for the project domain
//
// Returns an autofill payload + explanation.
// Does NOT persist — the existing task:create socket / REST pipeline saves the task.

const OPENAI_KEY_FOR_SUGGEST = process.env.OPENAI_API_KEY;

const SUBTASKS = {
  Planning:    ["Define success metrics", "Create project timeline", "Risk assessment"],
  Research:    ["Competitive analysis", "Technology spike", "Feasibility report"],
  Backend:     ["Create Express server & routing", "Design database schema", "JWT authentication", "API request validation", "Error handling & logging"],
  Frontend:    ["Build component library", "Implement primary screens", "Wire API integration", "Responsive & accessibility pass"],
  "AI / ML":   ["Collect & clean dataset", "Feature engineering", "Train baseline model", "Evaluate & tune model", "Deploy inference endpoint"],
  Hardware:    ["Wire sensors", "Flash firmware", "Calibrate readings", "Power management"],
  Integration: ["Define event contracts", "Implement realtime channel", "Notification delivery"],
  Testing:     ["Write unit tests", "Build integration test suite", "Set up CI", "Manual QA pass"],
  Deployment:  ["Containerize app", "Configure CI/CD pipeline", "Provision cloud hosting", "Monitoring & alerts"],
  Security:    ["JWT validation audit", "Input sanitization", "Role-based access control", "Penetration test checklist"],
  General:     ["Break down requirements", "Implement core logic", "Add tests", "Write documentation"],
};

const tierFromScore = (s) => (s >= 80 ? "critical" : s >= 55 ? "high" : s >= 30 ? "medium" : "low");

// Build an autofill task payload with Greedy priorityScore + derived dates.
// AI proposes values; Greedy computePriorityScore computes the final score.
function buildTaskPayload(seed, depCount = 0) {
  const greedy = computePriorityScore({ urgency: seed.urgency, impact: seed.impact, dependencyCount: depCount });
  const dueInDays = Math.max(2, Math.round((seed.estimatedHours || 4) / 2));
  const start    = new Date();
  const due      = new Date(Date.now() + dueInDays * 86_400_000);
  const reminder = new Date(due.getTime() - 86_400_000);
  reminder.setHours(9, 0, 0, 0);
  return {
    task: {
      title:          seed.title,
      description:    seed.description || "",
      category:       seed.category,
      priorityLabel:  tierFromScore(greedy),
      urgency:        seed.urgency,
      impact:         seed.impact,
      estimatedHours: seed.estimatedHours,
      businessValue:  seed.businessValue,
      startDate:      start.toISOString(),
      dueDate:        due.toISOString(),
      reminderAt:     reminder.toISOString(),
    },
    greedy,
  };
}

// ── OpenAI helper: call with timeout and structured JSON response ────────────
async function callOpenAiStructured(systemPrompt, userMessage, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      signal:  controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY_FOR_SUGGEST}` },
      body: JSON.stringify({
        model:           "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature:     0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw  = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Build the compact system prompt shared across most modes ─────────────────
function buildBaseSystemPrompt(ctx, mode) {
  const taskLines = ctx.existingTasks.length > 0
    ? ctx.existingTasks.map((t) => `  • [${t.category}] ${t.title} (${t.status})`).join("\n")
    : "  (none yet)";
  const memberLines = ctx.members.length > 0
    ? ctx.members.map((m) => `  • ${m.name} (${m.role})`).join("\n")
    : "  (none listed)";

  return `You are an expert Technical Project Advisor embedded in NEXUSFLOW — a student hackathon project management platform.

PROJECT CONTEXT:
  Team: ${ctx.teamName}
  Project Title: ${ctx.projectTitle}
  Description: ${ctx.projectDescription || "(not provided)"}
  Domain: ${ctx.domain}
  Requires Hardware/IoT: ${ctx.needsHardware}
  Requires AI/ML: ${ctx.needsAiMl}
  Requires Realtime: ${ctx.needsRealtime}
  Existing Task Count: ${ctx.taskCount} (${ctx.doneCount} done)
  Current Categories: ${ctx.categories.join(", ") || "none"}

EXISTING BACKLOG (DO NOT DUPLICATE):
${taskLines}

TEAM MEMBERS:
${memberLines}

MODE: ${mode}

CRITICAL RULES:
1. Ground ALL suggestions specifically in this project ("${ctx.projectTitle}").
2. NEVER suggest tasks unrelated to the project domain (e.g., do not suggest payment/e-commerce tasks for an IoT irrigation project).
3. Return ONLY a valid JSON object. No prose, no markdown fences.
4. AI proposes — keep urgency/impact/estimatedHours as reasonable estimates only.`;
}

router.post("/teams/:teamId/ai-suggest", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { mode = "related", taskId } = req.body ?? {};

    // --- Security: verify team exists and belongs to authenticated scope ---
    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });

    // Build compact context (works without a formal Project document)
    const ctx = await buildCompactProjectContext(teamId);
    const tasks  = ctx._rawTasks;
    const seeds  = decomposeProject(ctx.projectTitle, ctx.projectDescription); // deterministic base
    const keywords = extractFeatures(`${ctx.projectTitle} ${ctx.projectDescription}`).slice(0, 6);
    const existingCats = new Set(ctx.categories);

    let chosen, missingPhase = null, dependencyReasoning = "", alternatives = [];
    let plan = null; // only populated for project-plan mode

    // ════════════════════════════════════════════════════════════════════════
    // MODE: project-plan  (NEW in Phase 4)
    // Returns a structured project plan + one representative task to pre-fill
    // ════════════════════════════════════════════════════════════════════════
    if (mode === "project-plan") {
      let aiResult = null;

      if (OPENAI_KEY_FOR_SUGGEST) {
        const sysPrompt = buildBaseSystemPrompt(ctx, "project-plan") + `

Return a JSON object with this exact shape:
{
  "plan": {
    "summary": "One paragraph describing the project.",
    "domain": "Domain/category of the project",
    "coreGoal": "The primary goal in one sentence.",
    "technicalAreas": ["area1", "area2"],
    "recommendations": {
      "frontend": ["Technology / framework suggestion with brief reason"],
      "backend":  ["Technology / framework suggestion with brief reason"],
      "database": ["Database suggestion with brief reason"],
      "aiMl":     ["AI/ML framework/model suggestion — only if project needs AI"],
      "hardware": ["Hardware component suggestion — only if project needs hardware"],
      "apis":     ["External API/service suggestion — only if relevant"],
      "tools":    ["Dev tool/platform suggestion"]
    },
    "researchTopics": [
      { "topic": "Topic title", "why": "Why the student should research this" }
    ],
    "risks": [
      { "risk": "Risk description", "mitigation": "How to mitigate" }
    ],
    "nextSteps": ["Ordered list of immediate next actions"],
    "estimatedEffort": "e.g. 4–6 weeks for a 2-person team",
    "missingPhases": ["Phase names missing from the existing backlog"]
  },
  "task": {
    "title": "Most important immediate task title (imperative, 3–7 words)",
    "description": "What needs to be done and why",
    "category": "Planning",
    "urgency": 5,
    "impact": 4,
    "estimatedHours": 4,
    "businessValue": 8,
    "reason": "Why this is the most critical first task",
    "dependsOn": []
  }
}`;
        aiResult = await callOpenAiStructured(
          sysPrompt,
          `Generate a structured project plan for: "${ctx.projectTitle}" — ${ctx.projectDescription || "(no description provided)"}`
        );
      }

      // Heuristic fallback for project-plan
      if (!aiResult || !aiResult.plan) {
        const missingPhasesList = [];
        const wantedPhases = [...new Set(seeds.map((s) => s.category))];
        for (const p of wantedPhases) {
          if (!existingCats.has(p)) missingPhasesList.push(p);
        }
        aiResult = {
          plan: {
            summary: `${ctx.projectTitle} is a ${ctx.domain} project. ${ctx.projectDescription ? ctx.projectDescription.slice(0, 200) : ""}`,
            domain: ctx.domain,
            coreGoal: `Build and deploy ${ctx.projectTitle}.`,
            technicalAreas: [...new Set(seeds.map((s) => s.category))],
            recommendations: {
              frontend:  ["React / React Native — component-based UI"],
              backend:   ["Node.js + Express — familiar JS stack"],
              database:  ["MongoDB — flexible schema for rapid iteration"],
              aiMl:      ctx.needsAiMl  ? ["scikit-learn / TensorFlow Lite — lightweight inference"] : [],
              hardware:  ctx.needsHardware ? ["ESP32 — WiFi-capable microcontroller for IoT"] : [],
              apis:      [],
              tools:     ["Git + GitHub — version control", "Postman — API testing"],
            },
            researchTopics: [
              { topic: `${ctx.domain} architecture patterns`, why: "Understand best practices before coding" },
              { topic: "MVP scoping for hackathon projects", why: "Focus on core features under time pressure" },
            ],
            risks: [
              { risk: "Scope creep", mitigation: "Define MVP features and freeze scope early" },
              { risk: "Integration failures between components", mitigation: "Test interfaces incrementally" },
            ],
            nextSteps: [
              "Finalize project requirements and technology decisions",
              "Set up development environment and repository",
              "Build the core backend API first",
              "Iterate on frontend once data layer is stable",
            ],
            estimatedEffort: "4–6 weeks for a 2–3 person team",
            missingPhases: missingPhasesList,
          },
          task: {
            title: seeds[0]?.title || "Define Project Requirements & Architecture",
            description: seeds[0]?.description || "Establish technical specifications before implementation begins.",
            category: seeds[0]?.category || "Planning",
            urgency: 5, impact: 4, estimatedHours: 4, businessValue: 8,
            reason: "Planning tasks must be completed before any implementation begins.",
            dependsOn: [],
          },
        };
      }

      plan = aiResult.plan;
      const taskSeed = aiResult.task || seeds[0] || { title: "Define Project Requirements", category: "Planning", urgency: 4, impact: 4, estimatedHours: 4, businessValue: 8 };
      chosen = buildTaskPayload(taskSeed, 0);
      // Merge AI reason into the task description
      if (aiResult.task?.reason && !chosen.task.description) {
        chosen.task.description = aiResult.task.reason;
      }
      dependencyReasoning = aiResult.task?.reason || "Foundation task for the project.";
      alternatives = (plan.nextSteps || []).slice(0, 3);
      missingPhase = (plan.missingPhases || [])[0] || null;
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE: missing-phase
    // ════════════════════════════════════════════════════════════════════════
    else if (mode === "missing-phase") {
      let aiResult = null;

      if (OPENAI_KEY_FOR_SUGGEST) {
        const sysPrompt = buildBaseSystemPrompt(ctx, "missing-phase") + `

Analyze the existing backlog and identify the MOST IMPORTANT missing project phase.

Return a JSON object:
{
  "missingPhase": "Phase name (e.g. Testing, Deployment, AI / ML, Hardware)",
  "why": "One sentence explaining why this phase is critical for the project.",
  "task": {
    "title": "First task for the missing phase (imperative, 3–7 words)",
    "description": "What needs to be done in this task",
    "category": "<same as missingPhase>",
    "urgency": 3,
    "impact": 4,
    "estimatedHours": 5,
    "businessValue": 8,
    "reason": "Why this task addresses the gap",
    "dependsOn": ["Title of an existing task this depends on, if any"]
  },
  "alternatives": ["Other task titles for this phase"]
}`;
        aiResult = await callOpenAiStructured(
          sysPrompt,
          `Identify missing phase for "${ctx.projectTitle}". Current categories: ${ctx.categories.join(", ") || "none"}.`
        );
      }

      // Deterministic fallback (existing logic)
      if (!aiResult || !aiResult.task) {
        const wanted = [...new Set(seeds.map((s) => s.category))];
        missingPhase = wanted.find((c) => !existingCats.has(c)) ?? null;
        const pool  = missingPhase ? seeds.filter((s) => s.category === missingPhase) : seeds;
        const fresh = pool.filter((s) => boyerMooreSearch(tasks, s.title).length === 0);
        chosen = buildTaskPayload(fresh[0] ?? pool[0], 0);
        dependencyReasoning = missingPhase
          ? `Phase "${missingPhase}" is missing from the roadmap; it should follow the existing phases.`
          : "All standard phases already exist — suggested the highest-value remaining task.";
        alternatives = pool.slice(1, 4).map((s) => s.title);
      } else {
        missingPhase = aiResult.missingPhase || null;
        chosen = buildTaskPayload(aiResult.task, aiResult.task.dependsOn?.length > 0 ? 1 : 0);
        if (aiResult.task.reason) chosen.task.description = chosen.task.description || aiResult.task.reason;
        dependencyReasoning = aiResult.why
          ? `Phase "${missingPhase}" is missing. ${aiResult.why}`
          : `Phase "${missingPhase}" is missing from the roadmap.`;
        alternatives = Array.isArray(aiResult.alternatives) ? aiResult.alternatives.slice(0, 4) : [];
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE: subtasks
    // ════════════════════════════════════════════════════════════════════════
    else if (mode === "subtasks") {
      const parent = tasks.find((t) => t._id.toString() === String(taskId));
      let aiResult = null;

      if (OPENAI_KEY_FOR_SUGGEST && parent) {
        const sysPrompt = buildBaseSystemPrompt(ctx, "subtasks") + `

Break the following task into concrete, specific subtasks for this project.
Parent task: "${parent.title}" (Category: ${parent.category || "General"})

Return a JSON object:
{
  "subtasks": [
    {
      "title": "Subtask title (imperative, 3–7 words)",
      "description": "What specifically needs to happen",
      "category": "${parent.category || "General"}",
      "urgency": 3,
      "impact": 4,
      "estimatedHours": 3,
      "businessValue": 6,
      "reason": "Why this subtask is needed",
      "dependsOn": ["Previous subtask title if sequential"]
    }
  ]
}`;
        aiResult = await callOpenAiStructured(
          sysPrompt,
          `Break down: "${parent.title}" into subtasks for project "${ctx.projectTitle}".`
        );
      }

      if (!aiResult || !Array.isArray(aiResult.subtasks) || aiResult.subtasks.length === 0) {
        // Deterministic fallback using SUBTASKS map
        const cat = parent?.category && SUBTASKS[parent.category] ? parent.category : "General";
        const subs = SUBTASKS[cat];
        const existingLower = tasks.map((t) => (t.title || "").toLowerCase());
        const freshTitle = subs.find((t) => !existingLower.some((e) => e.includes(t.toLowerCase()))) ?? subs[0];
        const seed = {
          title:          parent ? `${parent.title}: ${freshTitle}` : freshTitle,
          description:    `Subtask of ${parent?.title ?? "the selected task"}.`,
          category:       cat,
          urgency:        parent?.urgency ?? 3,
          impact:         parent?.impact  ?? 3,
          estimatedHours: Math.max(1, Math.round((parent?.estimatedHours ?? 4) / 2)),
          businessValue:  parent?.businessValue ?? 6,
        };
        chosen = buildTaskPayload(seed, parent ? 1 : 0);
        dependencyReasoning = parent
          ? `Subtask of "${parent.title}" — Topological Sort places it after its parent.`
          : "Standalone subtask.";
        alternatives = subs.slice(1, 5).map((t) => (parent ? `${parent.title}: ${t}` : t));
      } else {
        // Pick the first fresh subtask from OpenAI response
        const existingLower = tasks.map((t) => (t.title || "").toLowerCase());
        const freshSub = aiResult.subtasks.find(
          (s) => !existingLower.some((e) => e.includes((s.title || "").toLowerCase()))
        ) || aiResult.subtasks[0];

        const seed = {
          title:          freshSub.title,
          description:    freshSub.description || `Subtask of ${parent?.title}.`,
          category:       freshSub.category || parent?.category || "General",
          urgency:        Math.min(5, Math.max(1, Number(freshSub.urgency) || 3)),
          impact:         Math.min(5, Math.max(1, Number(freshSub.impact)  || 3)),
          estimatedHours: Math.max(1, Number(freshSub.estimatedHours) || 3),
          businessValue:  Math.max(1, Number(freshSub.businessValue)   || 6),
        };
        chosen = buildTaskPayload(seed, (freshSub.dependsOn?.length || 0) > 0 ? 1 : 0);
        if (freshSub.reason) chosen.task.description = chosen.task.description || freshSub.reason;
        dependencyReasoning = parent
          ? `Subtask of "${parent.title}" (${ctx.projectTitle}) — Topological Sort places it after its parent.`
          : "Subtask suggested for this project.";
        alternatives = aiResult.subtasks.slice(1, 5).map((s) => s.title).filter(Boolean);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODE: related  (default)
    // ════════════════════════════════════════════════════════════════════════
    else {
      let aiResult = null;

      if (OPENAI_KEY_FOR_SUGGEST) {
        const sysPrompt = buildBaseSystemPrompt(ctx, "related") + `

Suggest ONE new task that is genuinely related to this specific project and not already in the backlog.

Return a JSON object:
{
  "task": {
    "title": "Task title (imperative, 3–7 words)",
    "description": "What needs to be done and why — specific to this project",
    "category": "Backend|Frontend|Planning|Research|Hardware|AI / ML|Integration|Testing|Deployment|Security",
    "urgency": 3,
    "impact": 4,
    "estimatedHours": 5,
    "businessValue": 8,
    "reason": "Why this task is important for THIS specific project",
    "dependsOn": ["Existing task title this depends on, if applicable"]
  },
  "alternatives": ["Other possible related task titles"]
}`;
        aiResult = await callOpenAiStructured(
          sysPrompt,
          `Suggest a related task for "${ctx.projectTitle}" (${ctx.domain}). Existing: ${ctx.existingTasks.slice(0, 10).map((t) => t.title).join(", ")}.`
        );
      }

      if (!aiResult || !aiResult.task) {
        // Deterministic fallback: Boyer-Moore dedup + Merge Sort ranking
        const fresh  = seeds.filter((s) => boyerMooreSearch(tasks, s.title).length === 0);
        const pool   = fresh.length ? fresh : seeds;
        const ranked = mergeSort(pool.map((s) => ({
          ...s, status: "todo", effort: s.estimatedHours,
          priority: computePriorityScore({ urgency: s.urgency, impact: s.impact, dependencyCount: 0 }),
        })));
        const pick = ranked[0];
        chosen = buildTaskPayload(pick, 0);
        dependencyReasoning = (pick.phaseIndex ?? 0) > 0
          ? `Belongs to the "${pick.category}" phase, which usually follows earlier phases.`
          : `Independent ${pick.category} task — no prerequisites.`;
        alternatives = ranked.slice(1, 4).map((s) => s.title);
      } else {
        // Validate AI suggestion against existing backlog using Boyer-Moore
        const bmHit = boyerMooreSearch(tasks, aiResult.task.title);
        const seed  = bmHit.length > 0
          ? // Duplicate detected — fall back to deterministic result
            (() => { const r = mergeSort(seeds.filter((s) => boyerMooreSearch(tasks, s.title).length === 0)); return r[0] || seeds[0]; })()
          : {
              title:          aiResult.task.title,
              description:    aiResult.task.description || "",
              category:       aiResult.task.category    || "General",
              urgency:        Math.min(5, Math.max(1, Number(aiResult.task.urgency)        || 3)),
              impact:         Math.min(5, Math.max(1, Number(aiResult.task.impact)         || 3)),
              estimatedHours: Math.max(1,              Number(aiResult.task.estimatedHours) || 5),
              businessValue:  Math.max(1,              Number(aiResult.task.businessValue)  || 8),
            };

        chosen = buildTaskPayload(seed, (aiResult.task.dependsOn?.length || 0) > 0 ? 1 : 0);
        if (aiResult.task.reason) chosen.task.description = chosen.task.description || aiResult.task.reason;
        dependencyReasoning = aiResult.task.reason
          ? `${aiResult.task.reason}${aiResult.task.dependsOn?.length ? " Depends on: " + aiResult.task.dependsOn.join(", ") + "." : ""}`
          : `Related ${chosen.task.category} task for ${ctx.projectTitle}.`;
        alternatives = Array.isArray(aiResult.alternatives) ? aiResult.alternatives.slice(0, 4) : [];
      }
    }

    res.json({
      task: chosen.task,
      ...(plan ? { plan } : {}),
      explanation: {
        mode,
        keywords,
        missingPhase,
        greedyScore:         chosen.greedy,
        businessValue:       chosen.task.businessValue,
        effort:              chosen.task.estimatedHours,
        priority:            chosen.task.priorityLabel,
        dependencyReasoning,
        alternatives,
        // Phase 4 additions:
        projectTitle:        ctx.projectTitle,
        domain:              ctx.domain,
        reason:              chosen.task.description,
      },
    });
  } catch (e) {
    console.error("[ai-suggest] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/decide ────────────────────────────────────────────
// Phase 5: Decision & Recommendation Engine
//
// Centralized decision endpoint that evaluates options using existing DAA
// algorithms (Greedy, Knapsack, Branch & Bound, Merge Sort, Topo Sort).
// AI (OpenAI) is ONLY called for qualitative text explanation — it does NOT
// calculate any scores. All numerical scores are deterministic.
//
// Decision Types:
//   technology    → weighted factor scoring + Merge Sort ranking
//   task-priority → greedySortTasks() + computePriorityScore()
//   sprint        → knapsackSprint() via computeRecommendation()
//   assignment    → assignTasksToMembers() via Branch & Bound
//   architecture  → weighted factor scoring + Merge Sort ranking
//   ai-ml         → weighted factor scoring + Merge Sort ranking
//
// Body: { decisionType, question?, options?, preferences? }
// Response: { success, decision: { recommendation, alternatives, factors, matrix,
//              tradeoffs, risks, reason, nextAction, confidence, daaAlgorithmsUsed } }
router.post("/teams/:teamId/decide", requireAuth, async (req, res) => {
  const TIMEOUT_MS = 12000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: "Decision engine timed out. Try again or simplify the request.",
      });
    }
  }, TIMEOUT_MS);

  try {
    const { teamId } = req.params;
    const {
      decisionType,
      question = "",
      options = [],
      preferences = {},
    } = req.body ?? {};

    // ── Validate inputs ────────────────────────────────────────────────────
    if (!decisionType) {
      clearTimeout(timer);
      return res.status(400).json({
        success: false,
        error: `decisionType is required. Valid types: ${listDecisionTypes().map((t) => t.key).join(", ")}.`,
      });
    }

    // ── Build compact project context (existing utility) ───────────────────
    let ctx;
    try {
      ctx = await buildCompactProjectContext(teamId);
    } catch (ctxErr) {
      clearTimeout(timer);
      return res.status(404).json({ success: false, error: ctxErr.message === "team_not_found" ? "Team not found." : ctxErr.message });
    }

    // ── Load tasks + members for DAA algorithms ────────────────────────────
    const [allTasks, team] = await Promise.all([
      Task.find({ teamId }).lean(),
      Team.findById(teamId).lean(),
    ]);
    const members = team?.members ?? [];

    // Attach sprint capacity from team settings if not in preferences
    if (!preferences.capacity && team?.settings?.sprintCapacity) {
      preferences.capacity = team.settings.sprintCapacity;
    }

    // ── Deterministic engine evaluation ───────────────────────────────────
    // This runs BEFORE the AI call so the page can degrade gracefully
    // if OpenAI is unavailable.
    const engineResult = evaluateDecision({
      decisionType,
      question,
      options: Array.isArray(options) ? options : [],
      preferences,
      ctx,
      tasks: allTasks,
      members,
      aiQualitative: null, // filled in below if OpenAI is available
    });

    if (engineResult.error) {
      clearTimeout(timer);
      return res.status(400).json({ success: false, error: engineResult.error });
    }

    // ── AI qualitative layer (optional — only for explanation text) ────────
    // AI DOES NOT override scores. It only provides:
    //   - reason (natural-language explanation)
    //   - nextAction
    //   - tradeoff prose per option
    //   - risk narrative
    // If AI fails, the deterministic result stands as-is.
    const OPENAI_KEY_DECIDE = process.env.OPENAI_API_KEY;

    if (OPENAI_KEY_DECIDE && ["technology", "architecture", "ai-ml"].includes(decisionType) && options.length > 0) {
      try {
        const needsTypes = ["technology", "architecture", "ai-ml"];
        if (needsTypes.includes(decisionType)) {
          const systemPrompt = `You are a project advisor for NEXUSFLOW, a student project management tool.
Your role is to EXPLAIN a decision recommendation — you do NOT calculate scores (those are deterministic).

Project: "${ctx.projectTitle}" (${ctx.domain})
Description: ${ctx.projectDescription ? ctx.projectDescription.slice(0, 200) : "(none provided)"}
Team size: ${members.length} members
Existing tasks: ${ctx.taskCount}

Decision: ${question || `Which ${decisionType} option best fits this project?`}
Options being compared: ${options.join(" vs ")}
Deterministic scores: ${engineResult.alternatives
  ? [engineResult.recommendation?.option, ...engineResult.alternatives.map((a) => a.option)]
      .map((o, i) => `${o}: ${i === 0 ? engineResult.recommendation?.score : engineResult.alternatives?.[i - 1]?.score}`)
      .join(", ")
  : "N/A"}

Return a JSON object:
{
  "reason": "2-3 sentence explanation of WHY the top option was recommended. Mention the project domain. Do NOT invent capabilities or benchmarks. If unsure, say 'Needs verification'.",
  "nextAction": "One concrete next step the team should take.",
  "tradeoffs": {
    "<OptionName>": { "pros": ["benefit1", "benefit2"], "cons": ["concern1"] }
  },
  "risks": [
    { "option": "<OptionName>", "risk": "specific risk", "severity": "low|medium|high", "mitigation": "mitigation step" }
  ],
  "alternativeReasons": {
    "<AlternativeOptionName>": "One sentence about when this alternative makes sense."
  }
}`;

          const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_KEY_DECIDE}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Explain the decision recommendation for the ${decisionType} choice.` },
              ],
              temperature: 0.3,
              max_tokens: 600,
              response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const aiContent = aiData.choices?.[0]?.message?.content;
            if (aiContent) {
              const aiQualitative = JSON.parse(aiContent);
              // Re-run engine with AI qualitative content to enrich explanations
              if (!timedOut) {
                const enrichedResult = evaluateDecision({
                  decisionType, question,
                  options: Array.isArray(options) ? options : [],
                  preferences, ctx, tasks: allTasks, members,
                  aiQualitative,
                });
                if (!enrichedResult.error) {
                  clearTimeout(timer);
                  if (!res.headersSent) {
                    return res.json({
                      success: true,
                      decision: { ...enrichedResult, aiEnhanced: true },
                    });
                  }
                  return;
                }
              }
            }
          }
        }
      } catch (aiErr) {
        // AI failure is non-fatal — deterministic result stands
        console.warn("[decide] AI qualitative layer unavailable:", aiErr.message);
      }
    }

    // ── Return deterministic result (AI unavailable or not needed) ─────────
    clearTimeout(timer);
    if (!res.headersSent) {
      res.json({
        success: true,
        decision: { ...engineResult, aiEnhanced: false },
      });
    }
  } catch (e) {
    clearTimeout(timer);
    console.error("[decide] error:", e.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
});

// ── GET /api/teams/:teamId/decide/types ───────────────────────────────────────
// Returns metadata about supported decision types for UI rendering.
router.get("/teams/:teamId/decide/types", requireAuth, (_req, res) => {
  res.json({ types: listDecisionTypes() });
});

// ── POST /api/teams/:teamId/project-guidance ─────────────────────────────────
// Phase 6: Student Project Guidance & Project Copilot
//
// Centralized guidance endpoint answering:
// "I have this project idea. What exactly do I need to do?"
//
// Combines deterministic domain inference, hardware & AI/ML detection,
// TopoSort phase dependency ordering, 0/1 Knapsack Hackathon Mode slicing,
// team skill gap analysis, explainable readiness score, and next action advice.
//
// AI (OpenAI) only provides qualitative semantic summaries; all scores,
// algorithms, and optimization remain deterministic.
router.post("/teams/:teamId/project-guidance", requireAuth, async (req, res) => {
  const TIMEOUT_MS = 12000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: "Project guidance engine timed out. Try again or check server logs.",
      });
    }
  }, TIMEOUT_MS);

  try {
    const { teamId } = req.params;
    const { hackathonHours = 24 } = req.body ?? {};

    // 1. Build compact project context
    let ctx;
    try {
      ctx = await buildCompactProjectContext(teamId);
    } catch (ctxErr) {
      clearTimeout(timer);
      return res.status(404).json({
        success: false,
        error: ctxErr.message === "team_not_found" ? "Team not found." : ctxErr.message,
      });
    }

    // 2. Fetch tasks and team members
    const [allTasks, team] = await Promise.all([
      Task.find({ teamId }).lean(),
      Team.findById(teamId).lean(),
    ]);
    const members = team?.members ?? [];

    // 3. Generate deterministic guidance baseline
    const baselineGuidance = generateProjectGuidance({
      ctx,
      tasks: allTasks,
      members,
      hackathonHours: Number(hackathonHours) || 24,
      aiNarrative: null,
    });

    // 4. Optional AI Qualitative Enrichment (gpt-4o-mini)
    const OPENAI_KEY_GUIDANCE = process.env.OPENAI_API_KEY;
    if (OPENAI_KEY_GUIDANCE && ctx.projectTitle) {
      try {
        const systemPrompt = `You are a Project Advisor in NEXUSFLOW helping a student understand their project.
Project Title: "${ctx.projectTitle}"
Description: ${ctx.projectDescription || "(none provided)"}
Domain: ${ctx.domain}

Provide a concise JSON object summarizing project understanding:
{
  "summary": "One or two clear sentences describing what this project is and its purpose.",
  "problemStatement": "One sentence stating the exact problem this project solves.",
  "targetUsers": ["User group 1", "User group 2"]
}
Do NOT invent fake features or mention technologies not relevant to this project. Return ONLY valid JSON.`;

        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_KEY_GUIDANCE}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Explain the project scope and problem for: ${ctx.projectTitle}` },
            ],
            temperature: 0.3,
            max_tokens: 350,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const aiContent = aiData.choices?.[0]?.message?.content;
          if (aiContent && !timedOut) {
            const aiNarrative = JSON.parse(aiContent);
            const enriched = generateProjectGuidance({
              ctx,
              tasks: allTasks,
              members,
              hackathonHours: Number(hackathonHours) || 24,
              aiNarrative,
            });

            clearTimeout(timer);
            if (!res.headersSent) {
              return res.json({
                success: true,
                guidance: { ...enriched, aiEnhanced: true },
              });
            }
            return;
          }
        }
      } catch (aiErr) {
        console.warn("[project-guidance] AI qualitative layer skipped/failed:", aiErr.message);
      }
    }

    // 5. Return deterministic guidance if AI unavailable or completed
    clearTimeout(timer);
    if (!res.headersSent) {
      res.json({
        success: true,
        guidance: { ...baselineGuidance, aiEnhanced: false },
      });
    }
  } catch (err) {
    clearTimeout(timer);
    console.error("[project-guidance] Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// ── DELETE /api/teams/:teamId/members/:userId ─────────────────────────────────
// Remove a member; unassign any tasks they held.
router.delete("/teams/:teamId/members/:userId", requireAuth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const team = await Team.findByIdAndUpdate(teamId, { $pull: { members: { userId } } }, { new: true, lean: true });
    if (!team) return res.status(404).json({ error: "team_not_found" });
    await Task.updateMany({ teamId, assignedTo: userId }, { $set: { assignedTo: null, assignmentCost: null } });
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId/members/:userId ──────────────────────────────────
// Update a member's name / role.
router.patch("/teams/:teamId/members/:userId", requireAuth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const set = {};
    if (req.body.name !== undefined) set["members.$.name"] = String(req.body.name);
    if (req.body.role !== undefined) set["members.$.role"] = String(req.body.role);
    if (!Object.keys(set).length) return res.status(400).json({ error: "No valid member fields." });
    const result = await Team.updateOne({ _id: teamId, "members.userId": userId }, { $set: set });
    if (!result.matchedCount) return res.status(404).json({ error: "Team or member not found." });
    const team = await Team.findById(teamId).lean();
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId ─────────────────────────────────────────────────
// Remove a team and all of its tasks.
router.delete("/teams/:teamId", requireAuth, async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.teamId);
    if (!team) return res.status(404).json({ error: "team_not_found" });
    await Task.deleteMany({ teamId: req.params.teamId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks ──────────────────────────────────────────────
// Returns tasks sorted by priorityScore DESC (Greedy Scheduler order).
router.get("/teams/:teamId/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ teamId: req.params.teamId })
      .sort({ priorityScore: -1, createdAt: 1 })
      .lean();
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/scheduled ────────────────────────────────────
// Greedy Scheduler demo — returns ranked list with explicit algorithm metadata.
router.get("/teams/:teamId/tasks/scheduled", requireAuth, async (req, res) => {
  try {
    const raw    = await Task.find({ teamId: req.params.teamId }).lean();
    const sorted = greedySortTasks(raw);
    const ranked = sorted.map((t, i) => ({ ...t, rank: i + 1 }));
    res.json({
      algorithm : "Greedy Priority Scheduling",
      complexity: { time: "O(n log n)", space: "O(n)" },
      taskCount : ranked.length,
      tasks     : ranked,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/analytics ────────────────────────────────────
// Task Analytics Engine — Bubble Sort O(n^2) vs Merge Sort O(n log n) metrics
// (time, comparisons, swaps) over the team's current task set.
router.get("/teams/:teamId/tasks/analytics", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ teamId: req.params.teamId }).lean();

    if (tasks.length > MAX_COMPARISON_SIZE) {
      const merge = mergeSortTasks(tasks);
      const quick = quickSortTasks(tasks);
      return res.json({
        n: tasks.length,
        skippedBubbleSort: true,
        reason: `n exceeds ${MAX_COMPARISON_SIZE}; O(n²) sorts skipped for performance`,
        algorithms: [
          { key: "merge", name: "Merge Sort", complexity: "O(n log n)", comparisons: merge.comparisons, swaps: merge.swaps, timeMs: 0 },
          { key: "quick", name: "Quick Sort", complexity: "O(n log n)", comparisons: quick.comparisons, swaps: quick.swaps, timeMs: 0 },
        ],
        mergeSort: { complexity: "O(n log n)" },
        sorted: merge.sorted,
      });
    }

    res.json(compareSortAlgorithms(tasks));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/tasks/execution-order ──────────────────────────────
// Topological Sort (Kahn's BFS) — returns tasks in dependency execution order.
// Also returns edge list for client-side DAG rendering.
// Time: O(V + E)
router.get("/teams/:teamId/tasks/execution-order", requireAuth, async (req, res) => {
  try {
    let tasks = await Task.find({ teamId: req.params.teamId }).lean();
    const needsCompute = tasks.some((t) => t.topoOrder === null || t.topoOrder === undefined);
    if (needsCompute) {
      const order = topologicalSort(tasks);
      const bulk  = order.map((id, idx) => ({
        updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
      }));
      if (bulk.length) await Task.bulkWrite(bulk);
      tasks = await Task.find({ teamId: req.params.teamId }).lean();
    }
    tasks.sort((a, b) => (a.topoOrder ?? 0) - (b.topoOrder ?? 0));
    const edges = buildEdgeList(tasks);
    res.json({ tasks, edges, algorithm: "Kahn's BFS Topological Sort", complexity: { time: "O(V+E)", space: "O(V+E)" } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/dependency-graph ───────────────────────────────────
// Full DFS + BFS + Topological Sort over the task dependency DAG.
// Powers the DependencyGraphPanel visualization. Time: O(V + E)
router.get("/teams/:teamId/dependency-graph", requireAuth, async (req, res) => {
  try {
    const [tasks, team] = await Promise.all([
      Task.find({ teamId: req.params.teamId }).lean(),
      Team.findById(req.params.teamId).lean(),
    ]);
    const memberName = Object.fromEntries((team?.members ?? []).map((m) => [m.userId.toString(), m.name]));

    const { adjList, inDegree, nodeMap } = buildGraph(tasks);
    const dfsResult  = dfs(adjList);
    const bfsResult  = bfs(adjList, inDegree);
    const topoResult = topoSortGraph(adjList, inDegree);

    const nodes = tasks.map((t) => ({
      id            : t._id.toString(),
      title         : t.title,
      status        : t.status,
      priority      : t.priorityScore ?? 0,
      priorityLabel : t.priorityLabel ?? null,
      estimatedHours: t.estimatedHours ?? 0,
      assignee      : t.assignedTo ? (memberName[t.assignedTo.toString()] ?? "Member") : null,
      dueDate       : t.dueDate ?? t.deadline ?? null,
      dependencies  : (t.dependencies ?? []).map((d) => d.toString()),
    }));
    const edges = buildEdgeList(tasks);

    res.json({ nodes, edges, dfsResult, bfsResult, topoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/tasks/:taskId/dependencies ────────────────────────
// Add a dependency edge. Runs DFS cycle check before persisting.
// Time: O(V + E)
router.post("/teams/:teamId/tasks/:taskId/dependencies", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const { dependsOn }      = req.body;
    if (!dependsOn) return res.status(400).json({ error: "dependsOn required" });
    if (taskId === dependsOn) return res.status(400).json({ error: "self_dependency_not_allowed" });

    const tasks = await Task.find({ teamId }).lean();
    if (!tasks.length) return res.status(404).json({ error: "team_not_found" });

    const target = tasks.find((t) => t._id.toString() === taskId);
    if (!target) return res.status(404).json({ error: "task_not_found" });
    const dep    = tasks.find((t) => t._id.toString() === dependsOn);
    if (!dep)    return res.status(404).json({ error: "dependency_task_not_found" });

    if (target.dependencies?.some((d) => d.toString() === dependsOn))
      return res.status(409).json({ error: "dependency_already_exists" });

    const adj = buildAdjacencyList(tasks);
    adj[dependsOn] = adj[dependsOn] ?? [];
    adj[dependsOn].push(taskId);

    if (hasCycle(adj, tasks.map((t) => t._id.toString())))
      return res.status(422).json({ error: "cycle_detected", message: "Adding this dependency would create a circular chain." });

    await Task.updateOne({ _id: taskId }, { $addToSet: { dependencies: dependsOn } });

    const updated = await Task.find({ teamId }).lean();
    const order   = topologicalSort(updated);
    const bulk    = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);

    const result = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ executionOrder: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId/tasks/:taskId/dependencies/:depId ───────────────
router.delete("/teams/:teamId/tasks/:taskId/dependencies/:depId", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId, depId } = req.params;
    await Task.updateOne({ _id: taskId }, { $pull: { dependencies: depId } });
    const tasks = await Task.find({ teamId }).lean();
    const order = topologicalSort(tasks);
    const bulk  = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);
    const result = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ executionOrder: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/sprint-optimize ───────────────────────────────────
// 0/1 Knapsack Sprint Optimizer. Body: { sprintHours: number }
// Time: O(n * W)  Space: O(n * W)
//
// SAFETY: the DP table is (n+1) × (W+1) with W = sprintHours × SCALE. To keep
// the table bounded we clamp sprintHours to MAX_SPRINT_HOURS and report a
// `warning` so the UI can tell the user the value was capped.
router.post("/teams/:teamId/sprint-optimize", requireAuth, async (req, res) => {
  try {
    let { sprintHours } = req.body;
    if (!sprintHours || typeof sprintHours !== "number" || sprintHours <= 0)
      return res.status(400).json({ error: "sprintHours must be a positive number." });

    let capacityWarning = null;
    if (sprintHours > MAX_SPRINT_HOURS) {
      capacityWarning = `Capacity capped at ${MAX_SPRINT_HOURS}h (requested ${sprintHours}h) to keep the Knapsack DP table within safe memory limits.`;
      sprintHours = MAX_SPRINT_HOURS;
    }

    // Fetch ALL backlog tasks (every status) so we can explain — per task — why it
    // is or isn't a Knapsack candidate, instead of silently filtering in the query.
    const allTasks = await Task.find({ teamId: req.params.teamId })
      .select("title status estimatedHours businessValue")
      .lean();

    // ── Eligibility classification (with human-readable reasons) ──────────────
    // A task is a Knapsack candidate iff: status==="todo" AND estimatedHours>0
    // AND businessValue>0. Anything else is reported with the exact reason.
    const eligible = [];
    const ineligible = [];
    for (const t of allTasks) {
      const reasons = [];
      if (t.status === "done")        reasons.push("Already completed");
      else if (t.status === "in_progress") reasons.push("In progress (only backlog/To-Do tasks are planned)");
      if (!(t.estimatedHours > 0))    reasons.push("Missing estimated hours (weight)");
      if (!(t.businessValue > 0))     reasons.push("Missing business value");

      if (reasons.length === 0) eligible.push(t);
      else ineligible.push({
        _id: String(t._id), title: t.title, status: t.status,
        estimatedHours: t.estimatedHours ?? null, businessValue: t.businessValue ?? null,
        reason: reasons.join(" · "),
      });
    }

    if (eligible.length === 0)
      return res.json({
        selectedTasks: [], eligible: [], ineligible,
        totalValue: 0, totalHours: 0, sprintCapacity: sprintHours,
        utilizationPct: 0, algorithm: "0/1 Knapsack (bottom-up DP)",
        warning: capacityWarning,
        message: allTasks.length === 0
          ? "No tasks yet. Add backlog tasks with estimated hours and business value."
          : "No eligible tasks. Each task below needs status To-Do plus estimated hours and business value.",
      });

    // ── 0/1 Knapsack DP (weights scaled ×10 so fractional hours stay integral) ─
    const SCALE    = 10;
    const capacity = Math.floor(sprintHours * SCALE);
    const n        = eligible.length;
    const weights  = eligible.map((t) => Math.round(t.estimatedHours * SCALE));
    const values   = eligible.map((t) => t.businessValue);

    const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      const wi = weights[i - 1], vi = values[i - 1];
      for (let w = 0; w <= capacity; w++) {
        dp[i][w] = dp[i - 1][w];
        if (wi <= w) {
          const withItem = dp[i - 1][w - wi] + vi;
          if (withItem > dp[i][w]) dp[i][w] = withItem;
        }
      }
    }

    const selectedIdx = new Set();
    let w = capacity;
    for (let i = n; i >= 1; i--) {
      if (dp[i][w] !== dp[i - 1][w]) { selectedIdx.add(i - 1); w -= weights[i - 1]; }
    }

    const selectedTasks = [];
    const eligibleReport = eligible.map((t, idx) => {
      const picked = selectedIdx.has(idx);
      const ratio  = +(t.businessValue / t.estimatedHours).toFixed(2);
      const row = {
        _id: String(t._id), title: t.title, status: t.status,
        estimatedHours: t.estimatedHours, businessValue: t.businessValue,
        ratio, selected: picked,
        reason: picked
          ? `Selected — value ${t.businessValue} for ${t.estimatedHours}h (ratio ${ratio}) fits the optimal subset`
          : (weights[idx] > capacity
              ? `Not selected — ${t.estimatedHours}h alone exceeds the ${sprintHours}h capacity`
              : `Not selected — a higher-value combination used the remaining capacity`),
      };
      if (picked) selectedTasks.push(t);
      return row;
    });

    const totalHours = selectedTasks.reduce((s, t) => s + t.estimatedHours, 0);

    res.json({
      selectedTasks,
      eligible      : eligibleReport,
      ineligible,
      totalValue    : dp[n][capacity],
      totalHours    : Math.round(totalHours * 100) / 100,
      totalEligible : eligible.length,
      sprintCapacity: sprintHours,
      utilizationPct: Math.round((totalHours / sprintHours) * 100),
      algorithm     : "0/1 Knapsack (bottom-up DP)",
      complexity    : { time: "O(n * W)", space: "O(n * W)" },
      warning       : capacityWarning,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId/tasks/:taskId ────────────────────────────────────
// General task field updater (DAA inputs + task-management fields).
router.patch("/teams/:teamId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const allowed = [
      "estimatedHours", "businessValue", "status", "title", "description",
      "assignedTo", "urgency", "impact", "progress",
      "deadline", "startDate", "dueDate", "priorityLabel", "storyPoints",
      "category", "reminderAt",
    ];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // Keep completedAt accurate when status changes via REST.
    if (update.status === "done") update.completedAt = new Date();
    else if (update.status !== undefined) update.completedAt = null;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, teamId: req.params.teamId },
      { $set: update },
      { new: true, lean: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DELETE /api/teams/:teamId/tasks/:taskId ───────────────────────────────────
// Remove a task. Cleans up dangling dependency references, fixes counters, and
// recomputes the topological execution order (broadcast over sockets by client).
router.delete("/teams/:teamId/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const task = await Task.findOneAndDelete({ _id: taskId, teamId });
    if (!task) return res.status(404).json({ error: "Task not found." });

    // Drop this task from any other task's dependency list.
    await Task.updateMany({ teamId, dependencies: taskId }, { $pull: { dependencies: taskId } });

    // Fix team counters.
    const dec = { taskCount: -1 };
    if (task.status === "done") dec.doneCount = -1;
    await Team.updateOne({ _id: teamId }, { $inc: dec });

    // Recompute execution order over what remains.
    const remaining = await Task.find({ teamId }).lean();
    const order = topologicalSort(remaining);
    const bulk  = order.map((id, idx) => ({
      updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
    }));
    if (bulk.length) await Task.bulkWrite(bulk);

    const executionOrder = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
    res.json({ ok: true, deletedId: taskId, executionOrder });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/tasks/:taskId/duplicate ───────────────────────────
// Clone a task. Body: { cloneDependencies?: boolean }
router.post("/teams/:teamId/tasks/:taskId/duplicate", requireAuth, async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const { cloneDependencies = false } = req.body ?? {};
    const src = await Task.findOne({ _id: taskId, teamId }).lean();
    if (!src) return res.status(404).json({ error: "Task not found." });

    const copy = await Task.create({
      teamId,
      title: `${src.title} (copy)`,
      description: src.description,
      status: "todo",
      urgency: src.urgency,
      impact: src.impact,
      estimatedHours: src.estimatedHours,
      businessValue: src.businessValue,
      storyPoints: src.storyPoints,
      deadline: src.deadline,
      startDate: src.startDate,
      dueDate: src.dueDate,
      priorityLabel: src.priorityLabel,
      category: src.category,
      reminderAt: src.reminderAt,
      skillWeights: src.skillWeights,
      source: src.source,
      dependencies: cloneDependencies ? (src.dependencies ?? []) : [],
      dependencyCount: cloneDependencies ? (src.dependencies?.length ?? 0) : 0,
      ...(mongoose.isValidObjectId(req.user?.id) ? { createdBy: req.user.id } : {}),
    });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    res.status(201).json(copy.toObject());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/restore-backlog ───────────────────────────────────
// Restore the original AI-generated backlog: removes all current tasks and
// recreates them from team.aiGeneratedTasks. Keeps members, profiles, settings.
router.post("/teams/:teamId/restore-backlog", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "team_not_found" });
    const seeds = team.aiGeneratedTasks ?? [];
    if (!seeds.length) return res.status(409).json({ error: "No AI backlog snapshot to restore." });

    await Task.deleteMany({ teamId });
    const restoredCount = await createSeededTasks(teamId, seeds);
    await Team.updateOne({ _id: teamId }, { $set: { taskCount: restoredCount, doneCount: 0 } });

    const tasks = await Task.find({ teamId }).sort({ priorityScore: -1 }).lean();
    res.json({ ok: true, restored: seeds.length, tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/teams/:teamId/health ─────────────────────────────────────────────
// Deterministic Workspace Health Score (0–100) with an explainable breakdown.
router.get("/teams/:teamId/health", requireAuth, async (req, res) => {
  try {
    const [tasks, team] = await Promise.all([
      Task.find({ teamId: req.params.teamId }).lean(),
      Team.findById(req.params.teamId).lean(),
    ]);
    res.json(computeHealthScore(tasks, team?.members ?? []));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/tasks/:taskId/priority ─────────────────────────────────────────
// Greedy Scheduler: update urgency/impact, hook recomputes priorityScore.
router.patch("/tasks/:taskId/priority", requireAuth, async (req, res) => {
  try {
    const { urgency, impact } = req.body ?? {};
    if (urgency === undefined && impact === undefined)
      return res.status(400).json({ error: "Provide urgency and/or impact." });

    const existing = await Task.findById(req.params.taskId).select("urgency impact dependencyCount").lean();
    if (!existing) return res.status(404).json({ error: "Task not found." });

    const task = await Task.findByIdAndUpdate(req.params.taskId, {
      urgency        : urgency ?? existing.urgency,
      impact         : impact  ?? existing.impact,
      dependencyCount: existing.dependencyCount,
    }, { new: true, runValidators: true, context: "query" }).lean();

    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PATCH /api/teams/:teamId/members/:userId/skills ───────────────────────────
// Branch & Bound: update a member's skill profile.
router.patch("/teams/:teamId/members/:userId/skills", requireAuth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const VALID = ["frontend", "backend", "devops", "design", "ml", "testing"];
    const setOps = {};
    for (const key of VALID) {
      if (req.body[key] !== undefined) {
        const val = Number(req.body[key]);
        if (val < 0 || val > 10) return res.status(400).json({ error: `${key} must be 0-10.` });
        setOps[`members.$.skills.${key}`] = val;
      }
    }
    if (!Object.keys(setOps).length) return res.status(400).json({ error: "No valid skill keys." });
    const result = await Team.updateOne({ _id: teamId, "members.userId": userId }, { $set: setOps });
    if (!result.matchedCount) return res.status(404).json({ error: "Team or member not found." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/teams/:teamId/assign ────────────────────────────────────────────
// Branch & Bound: optimal task-member assignment.
// Body: { taskIds?: string[], persist?: boolean }
router.post("/teams/:teamId/assign", requireAuth, async (req, res) => {
  try {
    const { teamId }                  = req.params;
    const { taskIds, persist = true } = req.body ?? {};

    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "Team not found." });
    const members = team.members ?? [];
    if (!members.length) return res.status(400).json({ error: "Team has no members with skill profiles." });

    // B&B needs differentiated skills; a uniform default matrix is meaningless.
    const hasSkillData = members.some((m) => Object.values(m.skills ?? {}).some((v) => v !== 5));
    if (!hasSkillData)
      return res.status(409).json({ error: "Assignment engine requires skill profiles. Set member skills (not all default 5) so Branch & Bound can compute a cost matrix." });

    const taskQuery = { teamId, status: { $ne: "done" } };
    if (Array.isArray(taskIds) && taskIds.length) taskQuery._id = { $in: taskIds };
    const tasks = await Task.find(taskQuery).lean();
    if (!tasks.length) return res.status(400).json({ error: "No eligible tasks." });

    const { assignments, totalCost, costMatrix, meta } = assignTasksToMembers(members, tasks);

    if (persist && assignments.length) {
      await Task.bulkWrite(assignments.map(({ taskId, memberId, cost }) => ({
        updateOne: { filter: { _id: taskId }, update: { $set: { assignedTo: memberId, assignmentCost: cost } } },
      })));
    }

    const memberMap = Object.fromEntries(members.map((m) => [m.userId.toString(), m]));
    const taskMap   = Object.fromEntries(tasks.map((t)  => [t._id.toString(), t]));
    const enriched  = assignments.map(({ taskId, memberId, cost }) => ({
      taskId, taskTitle: taskMap[taskId]?.title ?? taskId,
      memberId, memberName: memberMap[memberId]?.name ?? memberId, cost,
    }));

    res.json({ assignments: enriched, totalCost, costMatrix,
      memberLabels: members.map((m) => m.name ?? m.userId.toString()),
      taskLabels  : tasks.map((t) => t.title), meta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Input helpers ─────────────────────────────────────────────────────────────

const SKILL_KEYS = ["frontend", "backend", "devops", "design", "ml", "testing"];

// Clamp a skill object to valid 0–10 ints; missing keys default to 5 (neutral).
function normalizeSkills(skills) {
  const out = {};
  for (const key of SKILL_KEYS) {
    const v = Number(skills?.[key]);
    out[key] = Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v))) : 5;
  }
  return out;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Pure algorithm helpers ────────────────────────────────────────────────────

function buildAdjacencyList(tasks) {
  const adj = {};
  for (const t of tasks) {
    const id = t._id.toString();
    adj[id] = adj[id] ?? [];
    for (const dep of t.dependencies ?? []) {
      const depId = dep.toString();
      adj[depId] = adj[depId] ?? [];
      adj[depId].push(id);
    }
  }
  return adj;
}

// DFS 3-colour cycle detection. Time: O(V + E)
function hasCycle(adj, nodes) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = {};
  for (const n of nodes) colour[n] = WHITE;
  function visit(u) {
    colour[u] = GRAY;
    for (const v of adj[u] ?? []) {
      if (colour[v] === GRAY) return true;
      if (colour[v] === WHITE && visit(v)) return true;
    }
    colour[u] = BLACK;
    return false;
  }
  for (const n of nodes) {
    if (colour[n] === WHITE && visit(n)) return true;
  }
  return false;
}

// Topological order of task ids. Delegates to the CANONICAL Kahn's sort in
// graphTraversal.js so this route returns ordering identical to the
// /dependency-graph API and the socket recompute. (No stale local copy.)
function topologicalSort(tasks) {
  const { adjList, inDegree } = buildGraph(tasks);
  return topoSortGraph(adjList, inDegree).order;
}

// Create starter tasks AND wire inter-phase dependencies (phase N depends on the
// first task of phase N-1) so the dependency graph is connected and the
// topological roadmap is meaningful. Recomputes topoOrder afterwards.
async function createSeededTasks(teamId, seeds) {
  const created = [];
  for (const d of seeds) {
    const { phaseIndex = 0, ...fields } = d;
    const t = await Task.create({ teamId, source: "ai", ...fields });
    created.push({ id: t._id, phaseIndex });
  }

  const byPhase = new Map();
  for (const c of created) {
    if (!byPhase.has(c.phaseIndex)) byPhase.set(c.phaseIndex, []);
    byPhase.get(c.phaseIndex).push(c.id);
  }

  const depBulk = [];
  for (const c of created) {
    if (c.phaseIndex > 0 && byPhase.has(c.phaseIndex - 1)) {
      const prev = byPhase.get(c.phaseIndex - 1)[0];
      depBulk.push({ updateOne: { filter: { _id: c.id }, update: { $set: { dependencies: [prev], dependencyCount: 1 } } } });
    }
  }
  if (depBulk.length) await Task.bulkWrite(depBulk, { ordered: false });

  const all = await Task.find({ teamId }).lean();
  const order = topologicalSort(all);
  const topoBulk = order.map((id, idx) => ({ updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } } }));
  if (topoBulk.length) await Task.bulkWrite(topoBulk, { ordered: false });

  return created.length;
}

// ── Workspace Health Score ────────────────────────────────────────────────────
// Deterministic 0–100 score from five weighted factors. Pure function so the
// same task set always yields the same score (safe for tests + UI parity).
export function computeHealthScore(tasks, members = []) {
  const total = tasks.length;
  if (total === 0) {
    return { score: 100, grade: "A+", total: 0, factors: [], counts: {}, summary: "No tasks yet — start by generating a backlog." };
  }

  const doneTasks = tasks.filter((t) => t.status === "done");
  const doneIds   = new Set(doneTasks.map((t) => t._id.toString()));
  const active    = tasks.filter((t) => t.status !== "done");
  const inProg    = tasks.filter((t) => t.status === "in_progress").length;
  const done      = doneTasks.length;
  const now       = Date.now();

  // 1. Completion Rate.
  const completionRate = done / total;

  // 2. Deadline Performance = completed-before-deadline / completed.
  //    (updatedAt is the completion proxy; a completed task with no due date
  //     can't be late, so it counts as on-time.)
  let onTimeDone = 0;
  for (const t of doneTasks) {
    const due = t.dueDate ?? t.deadline;
    if (!due) { onTimeDone++; continue; }
    // Prefer the accurate completedAt timestamp; fall back to updatedAt for legacy docs.
    const finishedAt = t.completedAt ? new Date(t.completedAt).getTime()
      : t.updatedAt ? new Date(t.updatedAt).getTime() : now;
    if (finishedAt <= new Date(due).getTime()) onTimeDone++;
  }
  const deadlinePerformance = done ? onTimeDone / done : 1;

  // 3. Dependency Completion = completed dependency edges / total edges.
  let depEdges = 0, depSatisfied = 0;
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      depEdges++;
      if (doneIds.has(dep.toString())) depSatisfied++;
    }
  }
  const dependencyCompletion = depEdges ? depSatisfied / depEdges : 1;

  // 4. Assignment Coverage = assigned tasks / total tasks.
  const assigned = tasks.filter((t) => t.assignedTo).length;
  const assignmentCoverage = assigned / total;

  // 5. Sprint Utilization = planned active hours / team capacity (real values).
  const sprintCapacity = members.reduce((s, m) => s + (Number(m.capacity) || 40), 0) || 40;
  const plannedHours   = active.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
  const sprintUtilization = Math.min(1, plannedHours / sprintCapacity);

  const overdue = active.filter((t) => { const d = t.dueDate ?? t.deadline; return d && new Date(d).getTime() < now; }).length;

  const parts = [
    { key: "completion",  weight: 30, value: completionRate,        label: "Completion Rate" },
    { key: "deadline",    weight: 20, value: deadlinePerformance,   label: "Deadline Success" },
    { key: "dependency",  weight: 20, value: dependencyCompletion,  label: "Dependencies" },
    { key: "assignment",  weight: 15, value: assignmentCoverage,    label: "Assignments" },
    { key: "utilization", weight: 15, value: sprintUtilization,     label: "Sprint Utilization" },
  ];

  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D";

  return {
    score,
    grade,
    total,
    counts: {
      done, inProgress: inProg, overdue, assigned, active: active.length,
      depTotal: depEdges, depDone: depSatisfied,
      plannedHours, sprintCapacity,
    },
    factors: parts.map((p) => ({ key: p.key, label: p.label, weight: p.weight, pct: Math.round(p.value * 100) })),
    summary: `Health ${score}/100 (grade ${grade}). ${done}/${total} done · ${onTimeDone}/${done} on-time · ${depSatisfied}/${depEdges} deps · ${assigned}/${total} assigned · ${plannedHours}/${sprintCapacity}h.`,
  };
}

function buildEdgeList(tasks) {
  const edges = [];
  for (const t of tasks) {
    for (const depId of t.dependencies ?? []) {
      edges.push({ from: depId.toString(), to: t._id.toString() });
    }
  }
  return edges;
}

export default router;
