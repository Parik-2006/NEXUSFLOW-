/**
 * server/models/CapabilityProfile.js
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 22: CAPABILITY INTELLIGENCE MODEL
 *
 * Deterministic capability profile for team members combining:
 * 1. Canonical skill taxonomy
 * 2. Verified quizzes
 * 3. Explicit skill verifications
 * 4. Completed relevant task evidence
 * 5. Workload and capacity constraints
 *
 * Invariant: Self-declared skills never equal verified evidence.
 * ============================================================================
 */

import mongoose from "mongoose";

const SkillEvidenceSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: [
        "quiz",
        "explicit_verification",
        "completed_task",
        "project_history",
        "self_declared",
      ],
      required: true,
    },
    referenceId: { type: String },
    description: { type: String, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CanonicalSkillEntrySchema = new mongoose.Schema(
  {
    skillId: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: "Software Development" },
    verificationStatus: {
      type: String,
      enum: ["unverified", "verified", "self_declared"],
      default: "self_declared",
    },
    quizScore: { type: Number, default: 0 },
    quizTotal: { type: Number, default: 0 },
    quizPassed: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    weight: { type: Number, min: 0, max: 1, default: 0.4 },
    evidenceSources: [SkillEvidenceSchema],
    completedTasksCount: { type: Number, default: 0 },
    lastDemonstratedAt: { type: Date },
  },
  { _id: false }
);

const CapabilityProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    canonicalSkills: [CanonicalSkillEntrySchema],
    capacityWeeklyHours: {
      type: Number,
      default: 40,
      min: 0,
    },
    activeAssignedHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    activeAssignedTasks: {
      type: Number,
      default: 0,
      min: 0,
    },
    availabilityRatio: {
      type: Number,
      default: 1.0,
      min: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    methodologyStrengths: [
      {
        methodology: { type: String },
        score: { type: Number, default: 50 },
      },
    ],
  },
  { timestamps: true }
);

// Compound Indexes
CapabilityProfileSchema.index({ userId: 1, teamId: 1 }, { unique: true });
CapabilityProfileSchema.index({ teamId: 1, "canonicalSkills.skillId": 1 });
CapabilityProfileSchema.index({ projectId: 1, userId: 1 });

export default mongoose.model("CapabilityProfile", CapabilityProfileSchema);
