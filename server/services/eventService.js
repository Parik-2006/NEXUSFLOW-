/**
 * server/services/eventService.js
 * ============================================================================
 * EVENT SERVICE — Authoritative recording and querying of project events.
 * ============================================================================
 */

import ProjectEvent from "../models/ProjectEvent.js";

/**
 * Record a structured project event.
 */
export async function recordProjectEvent({
  projectId,
  teamId,
  actorId = null,
  actorName = "System",
  eventType,
  entityType,
  entityId = "",
  title,
  description = "",
  previousValue = null,
  newValue = null,
  metadata = {},
  source = "system",
  correlationId = "",
}) {
  if (!projectId || !teamId || !eventType || !entityType || !title) {
    console.warn("[eventService] Missing required event parameters, skipping recording:", {
      projectId,
      teamId,
      eventType,
      entityType,
    });
    return null;
  }

  try {
    const event = await ProjectEvent.create({
      projectId,
      teamId,
      actorId,
      actorName,
      eventType,
      entityType,
      entityId: String(entityId || ""),
      title,
      description,
      previousValue,
      newValue,
      metadata,
      source,
      correlationId,
      timestamp: new Date(),
    });
    return event;
  } catch (err) {
    console.error("[eventService] Failed to record project event:", err);
    return null;
  }
}

/**
 * Query project events with optional filters and pagination.
 */
export async function getProjectEvents(projectId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    eventType = null,
    entityType = null,
    startDate = null,
    endDate = null,
  } = options;

  const query = { projectId };

  if (eventType) query.eventType = eventType;
  if (entityType) query.entityType = entityType;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const [events, total] = await Promise.all([
    ProjectEvent.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean(),
    ProjectEvent.countDocuments(query),
  ]);

  return { events, total, skip, limit };
}
