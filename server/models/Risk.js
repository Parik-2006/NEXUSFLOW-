/**
 * server/models/Risk.js
 * NEXUSFLOW 3.0 — Phase 13: Risk Intelligence Engine Model
 */

import mongoose from "mongoose";

const RiskSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team",    required: true, index: true },

    title:       { type: String, required: true },
    explanation: { type: String, default: "" },
    evidence:    { type: String, default: "" },     // Specific data backing this risk
    affectedArea:{ type: String, default: "" },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    category: {
      type: String,
      enum: [
        "deadline",
        "approaching_deadline",
        "overdue_tasks",
        "blocked_tasks",
        "dependency_cascade",
        "unassigned_high_priority",
        "high_priority_unfinished",
        "overload",
        "member_overload",
        "workload_imbalance",
        "missing_skills",
        "skill_gap",
        "sprint_capacity",
        "stalled_progress",
        "single_point_of_failure",
        "stale_tasks",
        "github_inactivity",
        "scope_creep",
        "other",
      ],
      default: "other",
    },

    // Deterministic fingerprint used to dedupe and re-open on rescan.
    fingerprint: { type: String, default: "", index: true },

    status: {
      type: String,
      enum: ["open", "acknowledged", "resolved"],
      default: "open",
    },

    recommendation: { type: String, default: "" },
    resolvedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

RiskSchema.index({ projectId: 1, status: 1, severity: 1 });
RiskSchema.index({ projectId: 1, fingerprint: 1 }, { unique: false });

export default mongoose.model("Risk", RiskSchema);
