import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { assignTasksToMembers } from "../algorithms/branchAndBound.js";
import { computeRecommendation, boyerMooreSearch } from "../algorithms/taskOptimiser.js";
import { decomposeProject } from "../algorithms/projectDecomposer.js";
import { recomputeAndBroadcast } from "./taskHandlers.js";

// Map existing schema fields → the {value, effort, priority} shape the
// recommendation engine expects.
//
// PERSISTENCE RATIONALE (Task 7 review):
//   businessValue / estimatedHours / storyPoints / priorityScore ALREADY exist
//   on the Task schema (all optional, migration-safe defaults). We therefore
//   keep value/effort *derived at request time* rather than adding redundant
//   columns — the source fields are the single source of truth, and deriving
//   avoids a migration + keeps older documents fully compatible.
//
// Field resolution (derive sensible defaults so heuristic mode rarely fires):
//   value  : businessValue → priorityScore → urgency×impact → 1
//   effort : estimatedHours → storyPoints → priority-tier estimate → 3
// A task is only flagged "heuristic" when NO real signal exists at all
// (no value AND a zero priorityScore, or no effort/points), so the banner
// stays quiet whenever the greedy scheduler has already scored the task.
function normalizeForOptimiser(t) {
  const hasValue  = Number.isFinite(t.businessValue) && t.businessValue > 0;
  const hasEffort = Number.isFinite(t.estimatedHours) && t.estimatedHours > 0;
  const hasPoints = Number.isFinite(t.storyPoints) && t.storyPoints > 0;

  const priorityScore = Number.isFinite(t.priorityScore) ? t.priorityScore : 0;
  const urgency = Number.isFinite(t.urgency) ? t.urgency : 1;
  const impact  = Number.isFinite(t.impact)  ? t.impact  : 1;

  // Derive value: prefer real businessValue; else use the greedy priorityScore
  // (already a meaningful 0–100 signal); else fall back to urgency×impact.
  const derivedValue = priorityScore > 0 ? priorityScore : Math.max(1, urgency * impact);
  // Derive effort: prefer real hours; else story points; else a priority-tier
  // estimate (higher-priority work tends to be chunkier) bounded to 1–8h.
  const derivedEffort = hasPoints ? t.storyPoints : Math.min(8, Math.max(1, Math.round(priorityScore / 20) || 3));

  return {
    _id         : t._id,
    title       : t.title,
    status      : t.status,
    dependencies: t.dependencies ?? [],
    priority    : priorityScore,
    value       : hasValue  ? t.businessValue  : derivedValue,
    effort      : hasEffort ? t.estimatedHours : derivedEffort,
    // "Real signal" = an explicit value, OR a non-zero greedy score we can trust.
    _valueIsReal : hasValue || priorityScore > 0,
    _effortIsReal: hasEffort || hasPoints,
  };
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const URGENCY_KEYWORDS = ["fix", "bug", "block", "critical", "asap", "urgent", "broken", "hotfix", "incident"];
const IMPACT_KEYWORDS  = ["release", "deploy", "ship", "launch", "production", "customer", "demo", "revenue"];

function estimatePriority(title) {
  const lower      = title.toLowerCase();
  const isUrgent   = URGENCY_KEYWORDS.some((kw) => lower.includes(kw));
  const isImpactful = IMPACT_KEYWORDS.some((kw) => lower.includes(kw));
  if (isUrgent && isImpactful) return { urgency: 5, impact: 5 };
  if (isUrgent)   return { urgency: 4, impact: 2 };
  if (isImpactful) return { urgency: 2, impact: 4 };
  return { urgency: 2, impact: 2 };
}

// ── Feature 1: Actionable task-title normaliser ──────────────────────────────
// Converts requirement-style sentences ("The system continuously monitors soil
// moisture…") into short, Jira/Trello-style engineering tasks ("Implement Soil
// Moisture Monitoring Module"). Deterministic + dependency-free so it cleans
// BOTH the mock backlog and any sloppy lines that slip past the OpenAI prompt.
// Pure string work — does NOT touch the Greedy urgency/impact estimation.
const titleCase = (str) =>
  str.split(/\s+/).filter(Boolean)
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");

const VERB_TO_NOUN = {
  monitor: "Monitoring", monitors: "Monitoring", monitoring: "Monitoring",
  track: "Tracking", tracks: "Tracking", tracking: "Tracking",
  manage: "Management", manages: "Management", managing: "Management",
  store: "Storage", stores: "Storage", storing: "Storage",
  analyze: "Analytics", analyse: "Analytics", analyzing: "Analytics",
  report: "Reporting", reports: "Reporting", reporting: "Reporting",
  notify: "Notifications", notifies: "Notifications",
  schedule: "Scheduling", schedules: "Scheduling",
  search: "Search", searches: "Search",
  recommend: "Recommendations", recommends: "Recommendations",
  assign: "Assignment", assigns: "Assignment",
  visualize: "Visualization", visualise: "Visualization",
  authenticate: "Authentication", display: "Display", displays: "Display",
};

export function toActionableTitle(raw) {
  let s = String(raw || "").trim()
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/["'`]/g, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (!s) return "";

  // Strip requirement-style subjects / modal prefixes.
  s = s
    .replace(/^the\s+system\s+(should|must|will|can|shall)?\s*(continuously|automatically|securely)?\s*/i, "")
    .replace(/^(users?|farmers?|admins?|members?|customers?|operators?|the user|the app|the platform)\s+(can|should|must|will|are able to|need to|shall)\s+/i, "")
    .replace(/^it\s+(should|must|will|can)\s+/i, "")
    .replace(/^(ability to|able to|support for|provides?|allows?|enables?)\s+/i, "")
    .replace(/^(continuously|automatically|securely|easily)\s+/i, "")
    .trim();

  // Keep only the first clause so titles stay short.
  s = s.split(/[,;:]| so that | which | in order to /i)[0].trim();
  s = s.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  if (!s) return "";

  // Already action-oriented → just normalise casing.
  const ACTION = /^(implement|build|develop|create|design|add|integrate|set ?up|configure|write|test|deploy|refactor|fix|optimi[sz]e|enable|support|migrate|automate|define|plan|document|review|research|prepare|scope|setup)\b/i;
  if (ACTION.test(s)) return titleCase(s);

  // Leading verb → gerund noun phrase: "monitor soil moisture" →
  // "Implement Soil Moisture Monitoring Module".
  const parts = s.split(/\s+/);
  const noun  = VERB_TO_NOUN[parts[0].toLowerCase()];
  if (noun && parts.length > 1) {
    return `Implement ${titleCase(parts.slice(1).join(" "))} ${noun} Module`.replace(/\s+/g, " ").trim();
  }

  // Fallback: prepend a verb + domain suffix.
  let suffix = "Module", verb = "Implement";
  if (/dashboard|view|screen|interface/i.test(raw)) { suffix = "Dashboard"; verb = "Develop"; }
  else if (/report|analytic|chart/i.test(raw)) suffix = "Reporting";
  else if (/login|auth|sign|password|account/i.test(raw)) suffix = "Authentication";
  else if (/notif|alert|remind|email/i.test(raw)) suffix = "Notifications";
  const hasNoun = /module|feature|system|service|api|engine|pipeline/i.test(s);
  return `${verb} ${titleCase(s)}${hasNoun ? "" : " " + suffix}`.replace(/\s+/g, " ").trim();
}

export function registerAiOrchestrator(io, socket) {
  socket.on("chat:message", async ({ teamId, text }) => {
    const human = {
      _id      : `m_${Date.now()}`,
      text,
      userId   : socket.data.user?.id   ?? "anon",
      name     : socket.data.user?.name ?? "Member",
      createdAt: new Date().toISOString(),
    };
    io.to(`team:${teamId}`).emit("chat:message", human);

    if (!/^\s*@ai\b/i.test(text)) return;
    const prompt = text.replace(/^\s*@ai\b/i, "").trim();

    // Sprint planning shortcut: @ai plan sprint <hours>
    const sprintMatch = /^plan sprint\s+([\d.]+)/i.exec(prompt);
    if (sprintMatch) {
      await handleSprintOptimize(io, socket, teamId, parseFloat(sprintMatch[1]));
      return;
    }

    let newTaskIds;
    if (OPENAI_KEY) {
      newTaskIds = await streamFromOpenAI(io, socket, teamId, prompt);
    } else {
      newTaskIds = await streamMock(io, socket, teamId, prompt);
    }

    if (newTaskIds && newTaskIds.length > 0) {
      await runAutoAssignment(io, teamId, newTaskIds);
    }
  });

  // Manual assignment trigger from client.
  socket.on("tasks:assign", async ({ teamId, taskIds }) => {
    await runAutoAssignment(io, teamId, taskIds ?? []);
  });

  // ── DAA Recommendation Engine (BFS → Greedy → Knapsack → MergeSort → Topo) ──
  socket.on("recommend:request", async ({ teamId, sprintCapacity = 20 }, ack) => {
    try {
      const raw = await Task.find({ teamId }).lean();
      if (raw.length === 0) {
        const empty = {
          recommendedTasks: [],
          sprintStats     : { capacity: sprintCapacity, effortUsed: 0, capacityLeft: sprintCapacity, totalValue: 0, utilizationPct: 0, taskCount: 0, candidateCount: 0 },
          algorithmSummary: {},
          hasCycle        : false,
          generatedAt     : new Date().toISOString(),
        };
        socket.emit("recommend:result", empty);
        return ack?.({ ok: true });
      }

      const normalized = raw.map(normalizeForOptimiser);

      // Heuristic detection: count tasks lacking real business value / effort.
      const considered    = normalized.filter((t) => t.status !== "done");
      const missingValue  = considered.filter((t) => !t._valueIsReal).length;
      const missingEffort = considered.filter((t) => !t._effortIsReal).length;

      const result = computeRecommendation(normalized, sprintCapacity);
      // Only flag heuristic when tasks have NO usable signal at all (neither an
      // explicit value/effort nor a non-zero greedy priorityScore).
      const usedFallback = missingValue > 0 || missingEffort > 0;
      result.heuristic = {
        usedFallback,
        missingValue,
        missingEffort,
        totalConsidered: considered.length,
        message: usedFallback
          ? `Heuristic mode: ${missingValue} task(s) have no value signal and `
            + `${missingEffort} have no effort estimate. Set businessValue / `
            + `estimatedHours (or assign a priority) for an optimal sprint plan.`
          : null,
      };

      // Persist computed topoOrder (best-effort, non-blocking).
      const ops = result.recommendedTasks
        .filter((t) => t.topoOrder != null)
        .map((t) => ({ updateOne: { filter: { _id: t.taskId }, update: { $set: { topoOrder: t.topoOrder } } } }));
      if (ops.length) Task.bulkWrite(ops, { ordered: false }).catch(() => {});

      socket.emit("recommend:result", result);
      ack?.({ ok: true });
    } catch (err) {
      console.error("[recommend:request] error:", err.message);
      socket.emit("recommend:error", { message: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── Boyer-Moore-Horspool task title search ──────────────────────────────────
  socket.on("task:search", async ({ teamId, query }, ack) => {
    try {
      const allTasks = await Task.find({ teamId }).lean();
      const matched  = boyerMooreSearch(allTasks, query);
      socket.emit("task:searchResult", {
        tasks       : matched,
        query,
        algorithm   : "Boyer-Moore-Horspool",
        complexity  : { time: "O(n/m) average", space: "O(σ)" },
        totalScanned: allTasks.length,
        matchCount  : matched.length,
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });
}

// Knapsack safety: cap sprint capacity so the DP table (W = hours × 10) stays
// bounded (mirrors MAX_SPRINT_HOURS in routes/teams.js).
const MAX_SPRINT_HOURS = 200;

// ── 0/1 Knapsack Sprint Optimizer ─────────────────────────────────────────────
async function handleSprintOptimize(io, socket, teamId, sprintHours) {
  try {
    if (sprintHours > MAX_SPRINT_HOURS) {
      io.to(`team:${teamId}`).emit("chat:stream", {
        id: `ai_sp_warn_${Date.now()}`,
        text: `⚠ Capacity capped at ${MAX_SPRINT_HOURS}h (requested ${sprintHours}h) for safe Knapsack sizing.`,
      });
      sprintHours = MAX_SPRINT_HOURS;
    }

    const eligible = await Task.find({
      teamId,
      status        : "todo",
      estimatedHours: { $ne: null, $gt: 0 },
      businessValue : { $ne: null, $gt: 0 },
    }).lean();

    if (!eligible.length) {
      io.to(`team:${teamId}`).emit("chat:stream", {
        id: `ai_sp_${Date.now()}`, text: "No tasks with estimatedHours and businessValue set.",
      });
      return;
    }

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
          const alt = dp[i - 1][w - wi] + vi;
          if (alt > dp[i][w]) dp[i][w] = alt;
        }
      }
    }

    const selected = [];
    let w = capacity;
    for (let i = n; i >= 1; i--) {
      if (dp[i][w] !== dp[i - 1][w]) { selected.push(i - 1); w -= weights[i - 1]; }
    }

    const selectedTasks = selected.map((idx) => eligible[idx]);
    const totalHours    = selectedTasks.reduce((s, t) => s + t.estimatedHours, 0);
    const totalValue    = dp[n][capacity];
    const utilizationPct = Math.round((totalHours / sprintHours) * 100);

    io.to(`team:${teamId}`).emit("sprint:plan", {
      selectedTasks,
      totalValue,
      totalHours   : Math.round(totalHours * 100) / 100,
      sprintCapacity: sprintHours,
      utilizationPct,
      algorithm    : "0/1 Knapsack (bottom-up DP)",
      complexity   : { time: "O(n * W)", space: "O(n * W)" },
    });

    // Summary in chat stream.
    io.to(`team:${teamId}`).emit("chat:stream", {
      id  : `ai_sp_${Date.now()}`,
      text: `Sprint plan: ${selectedTasks.length} tasks, ${totalHours}h / ${sprintHours}h (${utilizationPct}% utilisation, value=${totalValue}).`,
    });
  } catch (err) {
    console.error("[Knapsack] Sprint optimize failed:", err.message);
    io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_sp_err_${Date.now()}`, text: "Sprint optimization failed." });
  }
}

// ── Branch and Bound auto-assignment ──────────────────────────────────────────
async function runAutoAssignment(io, teamId, taskIds) {
  try {
    const team = await Team.findById(teamId).lean();
    if (!team || !team.members?.length) {
      io.to(`team:${teamId}`).emit("assign:warning", {
        message: "Assignment engine requires team members. Add members to enable Branch & Bound.",
      });
      return;
    }

    // B&B needs differentiated skills. If every member is at the default (5),
    // the cost matrix is uniform and assignment is meaningless — warn visibly
    // instead of silently doing nothing.
    const hasSkillData = team.members.some((m) =>
      Object.values(m.skills ?? {}).some((v) => v !== 5)
    );
    if (!hasSkillData) {
      io.to(`team:${teamId}`).emit("assign:warning", {
        message: "Assignment engine requires skill profiles. Set member skills so Branch & Bound can compute a cost matrix.",
      });
      return;
    }

    const taskQuery = { teamId, status: { $ne: "done" } };
    if (taskIds.length > 0) taskQuery._id = { $in: taskIds };

    const tasks = await Task.find(taskQuery).lean();
    if (!tasks.length) return;

    const { assignments, totalCost, meta } = assignTasksToMembers(team.members, tasks);
    if (!assignments.length) return;

    await Task.bulkWrite(assignments.map(({ taskId, memberId, cost }) => ({
      updateOne: { filter: { _id: taskId }, update: { $set: { assignedTo: memberId, assignmentCost: cost } } },
    })));

    for (const { taskId, memberId, cost } of assignments) {
      io.to(`team:${teamId}`).emit("task:assigned", { taskId, memberId, cost, totalCost, meta });
    }
  } catch (err) {
    console.error("[B&B] Auto-assignment failed:", err.message);
    io.to(`team:${teamId}`).emit("assign:error", {
      message: "Auto-assignment encountered an error. Manual assignment is still available.",
    });
  }
}

// ── Mock streamer ──────────────────────────────────────────────────────────────
async function streamMock(io, socket, teamId, prompt) {
  // A reasonably detailed prompt is treated as a PROJECT DESCRIPTION and run
  // through the shared decomposer to produce a grouped, professional backlog
  // (Planning / Backend / Frontend / Testing / …). Short prompts fall back to a
  // generic feature breakdown. The description is never copied verbatim.
  const isDescription = prompt.trim().length >= 60;
  const seeds = isDescription
    ? decomposeProject("", prompt)
    : [
        { title: "Define project scope and acceptance criteria", category: "Planning", urgency: 4, impact: 3, estimatedHours: 4, businessValue: 6 },
        { title: "Implement core data service and API layer", category: "Backend", urgency: 4, impact: 5, estimatedHours: 6, businessValue: 10 },
        { title: "Develop primary user dashboard", category: "Frontend", urgency: 3, impact: 4, estimatedHours: 5, businessValue: 8 },
        { title: "Build automated test suite and CI pipeline", category: "Testing", urgency: 3, impact: 3, estimatedHours: 4, businessValue: 6 },
      ];

  io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}_0`, text: `Decomposing project into ${seeds.length} tasks across ${new Set(seeds.map((s) => s.category)).size} phases…` });

  const newTaskIds = [];
  let lastCategory = "";
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    if (s.category !== lastCategory) {
      lastCategory = s.category;
      await delay(180);
      io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}_c${i}`, text: `\n${s.category}` });
    }
    await delay(120);
    io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}_t${i}`, text: `• ${s.title}` });
    const task = await Task.create({
      teamId, title: s.title, category: s.category,
      urgency: s.urgency, impact: s.impact,
      estimatedHours: s.estimatedHours, businessValue: s.businessValue,
      description: s.description ?? "", dependencyCount: 0, source: "ai",
    });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    io.to(`team:${teamId}`).emit("task:created", task.toObject());
    newTaskIds.push(task._id);
  }

  // Wire inter-phase dependencies (phase N depends on the first task of phase
  // N-1) so the dependency graph is connected and the topological roadmap is
  // meaningful. Reuses the canonical recompute (Kahn's) + broadcast.
  await wirePhaseDependencies(teamId, seeds, newTaskIds);
  if (seeds.some((s) => (s.phaseIndex ?? 0) > 0)) await recomputeAndBroadcast(io, teamId);

  return newTaskIds;
}

// Set each task's dependency to the first task of the previous phase.
async function wirePhaseDependencies(teamId, seeds, taskIds) {
  const byPhase = new Map();
  seeds.forEach((s, i) => {
    const p = s.phaseIndex ?? 0;
    if (!byPhase.has(p)) byPhase.set(p, []);
    byPhase.get(p).push(taskIds[i]);
  });
  const bulk = [];
  seeds.forEach((s, i) => {
    const p = s.phaseIndex ?? 0;
    if (p > 0 && byPhase.has(p - 1)) {
      const prev = byPhase.get(p - 1)[0];
      bulk.push({ updateOne: { filter: { _id: taskIds[i] }, update: { $set: { dependencies: [prev], dependencyCount: 1 } } } });
    }
  });
  if (bulk.length) await Task.bulkWrite(bulk, { ordered: false });
}

// ── Real OpenAI streaming ──────────────────────────────────────────────────────
async function streamFromOpenAI(io, socket, teamId, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body   : JSON.stringify({
      model: "gpt-4o-mini", stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a senior engineering lead breaking a project description into a backlog. " +
            "Output ONLY a plain list of short, action-oriented engineering task titles, one per line, no numbering or prose. " +
            "Each title MUST start with an imperative verb (Implement, Build, Develop, Design, Integrate, Configure, Set up, Test, Deploy) " +
            "and read like a Jira/Trello card (3–7 words). " +
            "Convert requirements into tasks: 'The system monitors soil moisture' -> 'Implement Soil Moisture Monitoring Module'; " +
            "'Farmers can view field conditions' -> 'Develop Field Conditions Dashboard'. " +
            "Never output a requirement sentence, user story, or acceptance criteria — only buildable engineering tasks.",
        },
        { role: "user",   content: prompt },
      ],
    }),
  });

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", acc = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
        if (delta) { acc += delta; io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}`, text: delta }); }
      } catch { /* keep-alive */ }
    }
  }

  const newTaskIds = [];
  const rawTitles = acc.split("\n").map((s) => toActionableTitle(s)).filter(Boolean);
  for (const title of rawTitles) {
    const { urgency, impact } = estimatePriority(title);
    const task = await Task.create({ teamId, title, urgency, impact, dependencyCount: 0, source: "ai" });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    io.to(`team:${teamId}`).emit("task:created", task.toObject());
    newTaskIds.push(task._id);
  }
  return newTaskIds;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
