/**
 * server/services/kanbanBlockerService.js
 * ============================================================================
 * NEXUSFLOW V4 — KANBAN BLOCKER INTELLIGENCE & LIFECYCLE (Prompt 16)
 *
 * First-class blocker lifecycle: OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED.
 * Preserves historical resolution data and accumulates blocked duration metrics.
 * ============================================================================
 */

import crypto from "crypto";

/**
 * Add a new blocker to a work item
 */
export function addBlockerToTask(task, blockerData, user = {}) {
  if (!task.blockers) task.blockers = [];

  const blockerId = `BLK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const now = new Date();

  const newBlocker = {
    blockerId,
    title: blockerData.title || "Impediment",
    description: blockerData.description || "",
    category: blockerData.category || "technical",
    severity: blockerData.severity || "medium",
    status: "OPEN",
    createdBy: user._id || user.id || null,
    createdByName: user.name || "Member",
    createdAt: now,
    resolvedAt: null,
    resolutionNotes: "",
  };

  task.blockers.push(newBlocker);
  task.isBlocked = true;
  if (!task.blockedAt) task.blockedAt = now;

  return newBlocker;
}

/**
 * Update the lifecycle status of an existing blocker
 */
export function updateTaskBlocker(task, blockerId, updates = {}, user = {}) {
  if (!task.blockers || task.blockers.length === 0) {
    throw new Error("Task has no active blockers.");
  }

  const blocker = task.blockers.find((b) => b.blockerId === blockerId);
  if (!blocker) {
    throw new Error(`Blocker '${blockerId}' not found on task.`);
  }

  const validStatuses = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];
  if (updates.status && !validStatuses.includes(updates.status)) {
    throw new Error(`Invalid blocker status '${updates.status}'. Allowed: ${validStatuses.join(", ")}`);
  }

  const now = new Date();

  if (updates.status) blocker.status = updates.status;
  if (updates.severity) blocker.severity = updates.severity;
  if (updates.category) blocker.category = updates.category;
  if (updates.resolutionNotes) blocker.resolutionNotes = updates.resolutionNotes;

  // If resolving the blocker
  if (updates.status === "RESOLVED") {
    blocker.resolvedAt = now;
    if (!blocker.resolutionNotes && updates.resolutionNotes) {
      blocker.resolutionNotes = updates.resolutionNotes;
    }

    // Check if all blockers on task are resolved
    const stillBlocked = task.blockers.some((b) => b.status !== "RESOLVED");
    if (!stillBlocked) {
      task.isBlocked = false;
      if (task.blockedAt) {
        const duration = Math.max(0, now.getTime() - new Date(task.blockedAt).getTime());
        task.totalBlockedDurationMs = (task.totalBlockedDurationMs || 0) + duration;
        task.blockedAt = null;
      }
    }
  }

  return blocker;
}

/**
 * Aggregate all active and historical blockers across a project's tasks
 */
export function aggregateProjectBlockers(tasks = []) {
  const active = [];
  const resolved = [];

  for (const t of tasks) {
    for (const b of (t.blockers || [])) {
      const entry = {
        ...b.toObject ? b.toObject() : b,
        taskId: t._id,
        taskTitle: t.title,
        column: t.workflowColumn || t.kanbanStatus || "in_progress",
        assignee: t.assignedTo,
      };
      if (b.status === "RESOLVED") {
        resolved.push(entry);
      } else {
        active.push(entry);
      }
    }
  }

  // Sort active by critical severity first, then newest
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  active.sort((a, b) => {
    const sDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (sDiff !== 0) return sDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    totalActive: active.length,
    totalResolved: resolved.length,
    active,
    resolved: resolved.slice(0, 20),
  };
}
