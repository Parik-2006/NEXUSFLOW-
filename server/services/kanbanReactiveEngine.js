/**
 * server/services/kanbanReactiveEngine.js
 * ============================================================================
 * NEXUSFLOW V4 — REACTIVE KANBAN ENGINE & EVENT LOG (Prompts 25, 27, 42)
 *
 * Event-driven reactivity, ProjectMemory/ProjectEvent logging, and Socket.IO
 * broadcasting for Kanban continuous flow mutations.
 * ============================================================================
 */

import Project from "../models/Project.js";
import ProjectEvent from "../models/ProjectEvent.js";
import ProjectMemory from "../models/ProjectMemory.js";
import { logger } from "../utils/logger.js";

/**
 * Handle a reactive Kanban mutation:
 * 1. Increment Project.derivedVersion for cache invalidation
 * 2. Record structured audit event in ProjectEvent & ProjectMemory
 * 3. Broadcast authorized event to Socket.IO rooms (if io is available)
 */
export async function handleKanbanMutation({
  eventType,
  projectId,
  teamId,
  actor = {},
  taskId = null,
  taskTitle = "",
  fromState = "",
  toState = "",
  metadata = {},
  io = null,
}) {
  try {
    const now = new Date();

    // 1. Invalidate cache / bump derivedVersion
    if (projectId) {
      await Project.findByIdAndUpdate(projectId, {
        $inc: { derivedVersion: 1 },
        $set: { lastCalculatedAt: now },
      });
    }

    // 2. Persist to ProjectEvent
    const eventPayload = {
      projectId: projectId || null,
      teamId: teamId || null,
      eventType: `KANBAN_${eventType}`,
      title: `${eventType.replace(/_/g, " ")}: ${taskTitle || fromState + " -> " + toState}`,
      description: metadata.description || `Kanban state transition from ${fromState} to ${toState}`,
      actorId: actor._id || actor.id || null,
      actorName: actor.name || "Member",
      actorRole: actor.role || "member",
      targetEntity: "task",
      targetId: taskId ? String(taskId) : null,
      metadata: {
        fromState,
        toState,
        ...metadata,
      },
      timestamp: now,
    };

    let savedEvent = null;
    try {
      savedEvent = await ProjectEvent.create(eventPayload);
    } catch (eErr) {
      logger.warn(`[Kanban Reactive] Could not save ProjectEvent: ${eErr.message}`);
    }

    // 3. Persist to ProjectMemory (meaningful historical knowledge)
    const isSignificantEvent = [
      "ITEM_PULLED",
      "ITEM_BLOCKED",
      "ITEM_UNBLOCKED",
      "WIP_EXCEEDED",
      "DELIVERY_COMPLETED",
      "POLICY_CHANGED",
    ].includes(eventType);

    if (isSignificantEvent && projectId) {
      try {
        await ProjectMemory.create({
          projectId,
          teamId,
          type: "event",
          title: `[Kanban Flow] ${eventType.replace(/_/g, " ")}`,
          content: `${actor.name || "Member"} moved '${taskTitle || taskId}' (${fromState} -> ${toState}). Context: ${metadata.reason || metadata.description || "Flow execution"}.`,
          author: actor._id || actor.id || null,
          metadata: {
            eventType,
            taskId,
            fromState,
            toState,
            timestamp: now,
          },
        });
      } catch (mErr) {
        // ProjectMemory schema might vary slightly, log and ignore non-blocking
        logger.warn(`[Kanban Reactive] Could not save ProjectMemory: ${mErr.message}`);
      }
    }

    // 4. Broadcast via Socket.IO
    if (io) {
      const socketPayload = {
        type: `KANBAN_${eventType}`,
        projectId: String(projectId),
        teamId: String(teamId),
        taskId: taskId ? String(taskId) : null,
        actor: {
          id: actor._id || actor.id,
          name: actor.name || "Member",
        },
        fromState,
        toState,
        metadata,
        timestamp: now,
      };

      if (projectId) io.to(`project:${projectId}`).emit("kanban:event", socketPayload);
      if (teamId) io.to(`team:${teamId}`).emit("kanban:event", socketPayload);
      // Legacy room broadcast
      if (teamId) io.to(String(teamId)).emit("kanban:event", socketPayload);
    }

    return { success: true, event: savedEvent };
  } catch (err) {
    logger.error(`[Kanban Reactive Engine Error]: ${err.message}`);
    return { success: false, error: err.message };
  }
}
