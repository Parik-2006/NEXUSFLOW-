import Task from "../models/Task.js";
import Team from "../models/Team.js";
import { computeRecommendation, boyerMooreSearch } from "../algorithms/taskOptimiser.js";

/**
 * aiOrchestrator.js  —  Enhanced with DAA-powered Intelligent Task Recommendation
 * ==================================================================================
 * Existing behaviour (chat:message / @ai chat) is FULLY PRESERVED.
 *
 * New socket events added:
 *
 *   recommend:request  { teamId, sprintCapacity? }
 *     →  recommend:result  { recommendedTasks, sprintStats, algorithmSummary, … }
 *
 *   task:search  { teamId, query }
 *     →  task:searchResult  { tasks, query, algorithm, complexity }
 *
 * Both new events are additive and do not alter existing API contracts.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export function registerAiOrchestrator(io, socket) {
  // ── EXISTING: chat message handler (unchanged) ───────────────────────────
  socket.on("chat:message", async ({ teamId, text }) => {
    const human = {
      _id      : `m_${Date.now()}`,
      text,
      userId   : socket.data.user?.id ?? "anon",
      name     : socket.data.user?.name ?? "Member",
      createdAt: new Date().toISOString(),
    };
    io.to(`team:${teamId}`).emit("chat:message", human);

    if (!/^\s*@ai\b/i.test(text)) return;
    const prompt = text.replace(/^\s*@ai\b/i, "").trim();

    if (OPENAI_KEY) {
      await streamFromOpenAI(io, socket, teamId, prompt);
    } else {
      await streamMock(io, socket, teamId, prompt);
    }
  });

  // ── NEW: DAA Recommendation Engine ──────────────────────────────────────
  /**
   * Event  : recommend:request
   * Payload: { teamId: string, sprintCapacity?: number }
   *
   * Fetches all tasks for the team, runs the full 5-phase DAA pipeline
   * (BFS → Greedy → Knapsack → MergeSort → TopologicalSort), and emits
   * the result back to the requesting socket only.
   *
   * Pipeline complexity  (n = todo tasks, W = sprintCapacity):
   *   Time : O(n × W)   — dominated by 0/1 Knapsack DP
   *   Space: O(n × W)   — DP table
   */
  socket.on("recommend:request", async ({ teamId, sprintCapacity = 20 }, ack) => {
    try {
      // Populate dependencies so the graph algorithms have ObjectId arrays.
      const allTasks = await Task.find({ teamId })
        .populate("dependencies", "_id title status effort value priority")
        .lean();

      if (allTasks.length === 0) {
        const empty = {
          recommendedTasks: [],
          sprintStats      : { capacity: sprintCapacity, effortUsed: 0, totalValue: 0, taskCount: 0, candidateCount: 0 },
          algorithmSummary : {},
          hasCycle         : false,
          generatedAt      : new Date().toISOString(),
        };
        socket.emit("recommend:result", empty);
        ack?.({ ok: true });
        return;
      }

      const result = computeRecommendation(allTasks, sprintCapacity);

      // Persist computed topoOrder back to each task (non-blocking best-effort).
      _persistTopoOrders(result.recommendedTasks).catch(() => {});

      socket.emit("recommend:result", result);
      ack?.({ ok: true });
    } catch (err) {
      console.error("[recommend:request] error:", err.message);
      socket.emit("recommend:error", { message: err.message });
      ack?.({ ok: false, error: err.message });
    }
  });

  // ── NEW: Boyer-Moore-Horspool Search ────────────────────────────────────
  /**
   * Event  : task:search
   * Payload: { teamId: string, query: string }
   *
   * Runs Boyer-Moore-Horspool on in-memory task titles — O(n/m) average,
   * dramatically faster than a regex scan on large backlogs.
   *
   * Time : O(n/m) average,  O(n × m) worst   (m = pattern length)
   * Space: O(σ) = O(128)    shift table only
   */
  socket.on("task:search", async ({ teamId, query }, ack) => {
    try {
      const allTasks = await Task.find({ teamId }).lean();
      const matched  = boyerMooreSearch(allTasks, query);

      socket.emit("task:searchResult", {
        tasks    : matched,
        query,
        algorithm: "Boyer-Moore-Horspool",
        complexity: { time: "O(n/m) average", space: "O(σ)" },
        totalScanned: allTasks.length,
        matchCount  : matched.length,
      });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Persist topoOrder field back to MongoDB for each recommended task. */
async function _persistTopoOrders(recommendedTasks) {
  const ops = recommendedTasks
    .filter((t) => t.topoOrder != null)
    .map((t) => ({
      updateOne: {
        filter: { _id: t.taskId },
        update: { $set: { topoOrder: t.topoOrder } },
      },
    }));
  if (ops.length > 0) {
    const { default: Task } = await import("../models/Task.js");
    await Task.bulkWrite(ops, { ordered: false });
  }
}

// ─── Existing private helpers (UNCHANGED) ────────────────────────────────────

async function streamMock(io, socket, teamId, prompt) {
  const blocks = [
    `Planning: "${prompt}"`,
    "1. Define scope and acceptance criteria",
    "2. Implement core slice",
    "3. Add tests and wire CI",
  ];
  for (let i = 0; i < blocks.length; i++) {
    await delay(250);
    io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}_${i}`, text: blocks[i] });
  }
  for (const title of blocks.slice(1)) {
    const task = await Task.create({ teamId, title, createdBy: "ai" });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    io.to(`team:${teamId}`).emit("task:created", task.toObject());
  }
}

async function streamFromOpenAI(io, socket, teamId, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization  : `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model   : "gpt-4o-mini",
      stream  : true,
      messages: [
        { role: "system", content: "Break the user's request into short, actionable task titles, one per line." },
        { role: "user",   content: prompt },
      ],
    }),
  });

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let acc       = "";

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
        if (delta) {
          acc += delta;
          io.to(`team:${teamId}`).emit("chat:stream", { id: `ai_${Date.now()}`, text: delta });
        }
      } catch { /* ignore keep-alive lines */ }
    }
  }

  for (const title of acc.split("\n").map((s) => s.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean)) {
    const task = await Task.create({ teamId, title, createdBy: "ai" });
    await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });
    io.to(`team:${teamId}`).emit("task:created", task.toObject());
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
