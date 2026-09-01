/**
 * server/models/LearningInsight.js
 * NEXUSFLOW 3.0 — Phase 16: Learning Loop Insight Model
 */

import mongoose from "mongoose";

const LearningInsightSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    teamId:    { type: mongoose.Schema.Types.ObjectId, ref: "Team",    required: true },

    type: {
      type: String,
      enum: ["sprint_velocity", "deadline_accuracy", "task_duration", "capacity_trend", "skill_gap", "other"],
      required: true,
    },

    insight:        { type: String, required: true },  // Plain-English finding
    evidence:       { type: mongoose.Schema.Types.Mixed, default: {} }, // Supporting data
    recommendation: { type: String, default: "" },
    dataPoints:     { type: Number, default: 0 },
    confidence:     { type: Number, min: 0, max: 1, default: 0.5 },
    isStale:        { type: Boolean, default: false },
  },
  { timestamps: true }
);

LearningInsightSchema.index({ projectId: 1, type: 1, createdAt: -1 });

export default mongoose.model("LearningInsight", LearningInsightSchema);
