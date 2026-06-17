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

export async function recomputeAndBroadcast(io, teamId) {
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
  socket.on("task:create", async (payload, ack) => {
    try {
      const {
        teamId, title, urgency = 1, impact = 1, dependencies = [],
        description, estimatedHours, businessValue, deadline, startDate, dueDate,
        priorityLabel, source = "manual", category, reminderAt, status, assignedTo,
      } = payload ?? {};

      const task = await Task.create({
        teamId,
        title,
        urgency,
        impact,
        dependencyCount: dependencies.length,
        dependencies,
        createdBy: socket.data.user?.id,
        source,
        ...(status          !== undefined ? { status } : {}),
        ...(description     !== undefined ? { description } : {}),
        ...(estimatedHours  !== undefined ? { estimatedHours } : {}),
        ...(businessValue   !== undefined ? { businessValue } : {}),
        ...(deadline        !== undefined ? { deadline } : {}),
        ...(startDate       !== undefined ? { startDate } : {}),
        ...(dueDate         !== undefined ? { dueDate } : {}),
        ...(priorityLabel   !== undefined ? { priorityLabel } : {}),
        ...(category        !== undefined ? { category } : {}),
        ...(reminderAt      !== undefined ? { reminderAt } : {}),
        ...(assignedTo      !== undefined ? { assignedTo } : {}),
        ...(status === "done" ? { completedAt: new Date() } : {}),
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

  // ── task:delete ──────────────────────────────────────────────────────────────
  socket.on("task:delete", async ({ teamId, taskId }, ack) => {
    try {
      const task = await Task.findOneAndDelete({ _id: taskId, teamId });
      if (!task) return ack?.({ ok: false, error: "not_found" });

      await Task.updateMany({ teamId, dependencies: taskId }, { $pull: { dependencies: taskId } });
      const dec = { taskCount: -1 };
      if (task.status === "done") dec.doneCount = -1;
      await Team.updateOne({ _id: teamId }, { $inc: dec });

      io.to(`team:${teamId}`).emit("task:deleted", { taskId });
      ack?.({ ok: true, taskId });

      await recomputeAndBroadcast(io, teamId);
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // ── task:update ────────────────────────────────────────────────────────────
  socket.on("task:update", async ({ teamId, taskId, status, prevStatus, urgency, impact, fields }, ack) => {
    try {
      let updatePayload = {};
      if (status !== undefined) updatePayload.status = status;

      // Generic task-management fields (Edit Task modal). `status` is allowed
      // here too so the edit form can change status; doneCount is reconciled below.
      const ALLOWED = ["title", "description", "progress", "deadline", "startDate", "dueDate",
                       "priorityLabel", "estimatedHours", "businessValue", "assignedTo",
                       "category", "reminderAt", "status"];
      if (fields && typeof fields === "object") {
        for (const k of ALLOWED) if (fields[k] !== undefined) updatePayload[k] = fields[k];
      }

      const priorityChanging = urgency !== undefined || impact !== undefined;
      if (priorityChanging) {
        const existing = await Task.findById(taskId).select("urgency impact dependencyCount").lean();
        if (!existing) return ack?.({ ok: false, error: "not_found" });
        updatePayload.urgency         = urgency ?? existing.urgency;
        updatePayload.impact          = impact  ?? existing.impact;
        updatePayload.dependencyCount = existing.dependencyCount;
      }

      // Effective status transition (status may arrive top-level OR via fields).
      const newStatus = updatePayload.status;
      let effPrev = prevStatus;
      if (newStatus !== undefined && effPrev === undefined) {
        const cur = await Task.findById(taskId).select("status").lean();
        effPrev = cur?.status;
      }

      // Stamp/clear completedAt for accurate deadline-success tracking.
      if (newStatus !== undefined) {
        if (newStatus === "done" && effPrev !== "done") updatePayload.completedAt = new Date();
        else if (newStatus !== "done" && effPrev === "done") updatePayload.completedAt = null;
      }

      const task = await Task.findByIdAndUpdate(taskId, updatePayload, {
        new: true, runValidators: true, context: "query",
      }).lean();
      if (!task) return ack?.({ ok: false, error: "not_found" });

      if (newStatus !== undefined) {
        const wasDone = effPrev === "done";
        const isDone  = newStatus === "done";
        if (!wasDone && isDone) await Team.updateOne({ _id: teamId }, { $inc: { doneCount: 1 } });
        if (wasDone && !isDone) await Team.updateOne({ _id: teamId }, { $inc: { doneCount: -1 } });
      }

      io.to(`team:${teamId}`).emit("task:updated", { ...task, prevStatus: effPrev });
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
