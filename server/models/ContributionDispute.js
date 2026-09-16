/**
 * server/models/ContributionDispute.js
 * ============================================================================
 * NEXUSFLOW V4 — CONTRIBUTION DISPUTE MODEL (Prompt 15)
 *
 * Allows students and team members to dispute attribution, flag missing
 * work, or request review of uncaptured contributions.
 * ============================================================================
 */

import mongoose from "mongoose";

const ContributionDisputeSchema = new mongoose.Schema(
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
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      default: "Student",
    },
    disputeCategory: {
      type: String,
      enum: ["MISSING_ACTIVITY", "INCORRECT_ASSIGNMENT", "EVIDENCE_UNATTRIBUTED", "GITHUB_MISMATCH", "OTHER"],
      default: "MISSING_ACTIVITY",
    },
    description: {
      type: String,
      required: true,
    },
    evidenceUrls: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["PENDING", "UNDER_REVIEW", "RESOLVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    resolutionNotes: {
      type: String,
      default: "",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ContributionDispute", ContributionDisputeSchema);
