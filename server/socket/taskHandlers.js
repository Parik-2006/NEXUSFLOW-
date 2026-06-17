import Team from "../models/Team.js";
import Task from "../models/Task.js";
import { computePriorityScore } from "../algorithms/greedyScheduler.js";
import { buildGraph, topologicalSort as topoSortGraph } from "../algorithms/graphTraversal.js";

// Topological order of task ids — delegates to the CANONICAL Kahn's sort in
// graphTraversal.js so socket recompute matches the REST execution-order and
// dependency-graph APIs exactly. (No stale local copy.)
function topologicalSort(tasks) {
  const { adjList, inDegree } = buildGraph(tasks);
  return topoSortGraph(adjList, inDegree).order;
}

async function recomputeAndBroadcast(io, teamId) {
  const tasks = await Task.find({ teamId }).lean();
  const order = topologicalSort(tasks);
  const bulk  = order.map((id, idx) => ({
    updateOne: { filter: { _id: id }, update: { $set: { topoOrder: idx } } },
  }));
  if (bulk.length) await Task.bulkWrite(bulk);
  const updated = await Task.find({ teamId }).sort({ topoOrder: 1 }).lean();
  const edges   = updated.flatMap((t) =>
    (t.dependencies ?? []).map((d) => ({ from: d.toString(), to: t._id.toString() }))
  );
  io.to(`team:${teamId}`).emit("task:execution-order", { tasks: updated, edges });
}

export function registerTaskHandlers(io, socket) {
  socket.on("room:join",  ({ teamId }) => socket.join(`team:${teamId}`));
  socket.on("room:leave", ({ teamId }) => socket.leave(`team:${teamId}`));

  // ── task:create ────────────────────────────────────────────────────────────
  socket.on("task:create", async ({ teamId, title, urgency = 1, impact = 1, dependencies = [] }, ack) => {
    try {
      const task = await Task.create({
        teamId,
        title,
        urgency,
        impact,
        dependencyCount: dependencies.length,
        dependencies,
        createdBy: socket.data.user?.id,
      });

      await Team.updateOne({ _id: teamId }, { $inc: { taskCount: 1 } });

      const taskObj = task.toObject();
      io.to(`team:${teamId}`).emit("task:created", taskObj);
      ack?.({ ok: true, task: taskObj });

      if (dependencies.length > 0) {
        await recomputeAndBroadcast(io, teamId);
      }
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // ── task:update ────────────────────────────────────────────────────────────
  socket.on("task:update", async ({ teamId, taskId, status, prevStatus, urgency, impact }, ack) => {
    try {
      let updatePayload = { status };

      const priorityChanging = urgency !== undefined || impact !== undefined;
      if (priorityChanging) {
        const existing = await Task.findById(taskId).select("urgency impact dependencyCount").lean();
        if (!existing) return ack?.({ ok: false, error: "not_found" });
        updatePayload.urgency         = urgency ?? existing.urgency;
        updatePayload.impact          = impact  ?? existing.impact;
        updatePayload.dependencyCount = existing.dependencyCount;
      }

      const task = await Task.findByIdAndUpdate(taskId, updatePayload, {
        new: true, runValidators: true, context: "query",
      }).lean();
      if (!task) return ack?.({ ok: false, error: "not_found" });

      const wasDone = prevStatus === "done";
      const isDone  = status === "done";
      if (!wasDone && isDone) await Team.updateOne({ _id: teamId }, { $inc: { doneCount: 1 } });
      if (wasDone && !isDone) await Team.updateOne({ _id: teamId }, { $inc: { doneCount: -1 } });

      io.to(`team:${teamId}`).emit("task:updated", { ...task, prevStatus });
      ack?.({ ok: true, task });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // ── task:recompute_team (Greedy bulk refresh) ───────────────────────────────
  socket.on("task:recompute_team", async ({ teamId }, ack) => {
    try {
      const tasks = await Task.find({ teamId, status: { $ne: "done" } })
        .select("urgency impact dependencyCount").lean();
      let updated = 0;
      for (const t of tasks) {
        const newScore = computePriorityScore({ urgency: t.urgency, impact: t.impact, dependencyCount: t.dependencyCount });
        await Task.findByIdAndUpdate(t._id, { $set: { priorityScore: newScore } });
        updated++;
      }
      io.to(`team:${teamId}`).emit("task:priority_refreshed", { teamId, count: updated });
      ack?.({ ok: true, updated });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // ── task:get-execution-order (Topo Sort) ────────────────────────────────────
  socket.on("task:get-execution-order", async ({ teamId }, ack) => {
    try {
      await recomputeAndBroadcast(io, teamId);
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });
}
