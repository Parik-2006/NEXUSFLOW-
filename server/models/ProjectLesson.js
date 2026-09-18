/**
 * server/models/ProjectLesson.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 21: PROJECT LEARNING LOOP MODEL
 *
 * Evidence-based learning model extracting reusable lessons from completed
 * project activity.
 *
 * Lifecycle: CANDIDATE -> REVIEWED -> VALIDATED -> APPLIED -> ARCHIVED
 *
 * Invariant: Applying a lesson does NOT silently change project state.
 * ============================================================================
 */

import mongoose from "mongoose";

const ProjectLessonSchema = new mongoose.Schema(
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
    sourceEventIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProjectEvent",
      },
    ],
    sourceReferences: [
      {
        entityType: { type: String, default: "task" },
        entityId: { type: String },
        title: { type: String },
        metricValue: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    methodology: {
      type: String,
      enum: ["CLASSIC", "WATERFALL", "SCRUM", "KANBAN", "HYBRID"],
      default: "CLASSIC",
    },
    domain: {
      type: String,
      default: "General Software",
    },
    category: {
      type: String,
      enum: [
        "estimation",
        "dependency",
        "scope",
        "wip_flow",
        "conformance",
        "skill_gap",
        "bottleneck",
        "quality",
        "review",
        "other",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    evidenceMetrics: {
      sampleSize: { type: Number, default: 0 },
      plannedVsActualRatio: { type: Number, default: 1.0 },
      varianceHours: { type: Number, default: 0 },
      blockerCount: { type: Number, default: 0 },
      deviationCount: { type: Number, default: 0 },
      customMetrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    observedPattern: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.7,
    },
    status: {
      type: String,
      enum: ["CANDIDATE", "REVIEWED", "VALIDATED", "APPLIED", "ARCHIVED"],
      default: "CANDIDATE",
      index: true,
    },
    recommendation: {
      type: String,
      default: "",
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    validatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    validationMetadata: {
      validatedAt: { type: Date },
      validatedBy: { type: String },
      notes: { type: String, default: "" },
      rejectionReason: { type: String, default: "" },
    },
    applicabilityConditions: {
      methodologies: [{ type: String }],
      domains: [{ type: String }],
      minTeamSize: { type: Number, default: 1 },
      tags: [{ type: String }],
    },
    reusableTags: [
      {
        type: String,
        trim: true,
      },
    ],
    appliedProjects: [
      {
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
        appliedAt: { type: Date, default: Date.now },
        appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        notes: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

// Indexes
ProjectLessonSchema.index({ projectId: 1, status: 1, createdAt: -1 });
ProjectLessonSchema.index({ status: 1, reusableTags: 1 });
ProjectLessonSchema.index({ domain: 1, methodology: 1 });
ProjectLessonSchema.index({ projectId: 1, category: 1, title: 1 });

export default mongoose.model("ProjectLesson", ProjectLessonSchema);
