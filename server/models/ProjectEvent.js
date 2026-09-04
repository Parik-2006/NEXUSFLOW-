/**
 * server/models/ProjectEvent.js
 * ============================================================================
 * PROJECT EVENT — Structured event history and audit log for NexusFlow V4.
 *
 * Captures meaningful state transitions and milestones:
 *   - PROJECT_CREATED
 *   - REQUIREMENT_CREATED, REQUIREMENT_UPDATED, REQUIREMENT_APPROVED
 *   - TASK_CREATED, TASK_UPDATED, TASK_STATUS_CHANGED, TASK_PRIORITY_CHANGED
 *   - DEPENDENCY_ADDED, DEPENDENCY_REMOVED
 *   - PHASE_STARTED, PHASE_COMPLETED, PHASE_GATE_BLOCKED, PHASE_GATE_APPROVED, PHASE_GATE_OVERRIDDEN
 *   - ASSIGNMENT_CHANGED, TEAM_MEMBER_ADDED, TEAM_MEMBER_REMOVED
 *   - DEADLINE_CHANGED, CHANGE_IMPACT_DETECTED
 *   - DAA_RECALCULATED, CRITICAL_PATH_CHANGED, HEALTH_RECALCULATED, RISK_DETECTED
 *   - DECISION_SAVED, USER_OVERRIDE
 *
 * NOTE: The event model represents what happened (history/audit/digital twin).
 * Current project/task/team models remain the single authoritative source of truth.
 * ============================================================================
 */

import mongoose from "mongoose";

const ProjectEventSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: {
      type: String,
      default: "System Engine",
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: [
        "project",
        "requirement",
        "task",
        "dependency",
        "member",
        "phase_gate",
        "impact",
        "health",
        "risk",
        "decision",
        "artifact",
      ],
      required: true,
    },
    entityId: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    source: {
      type: String,
      enum: ["user", "system", "reactive_engine", "daa_engine", "phase_gate_engine", "change_impact_engine"],
      default: "system",
    },
    correlationId: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

ProjectEventSchema.index({ projectId: 1, timestamp: -1 });
ProjectEventSchema.index({ projectId: 1, eventType: 1 });

export default mongoose.model("ProjectEvent", ProjectEventSchema);
