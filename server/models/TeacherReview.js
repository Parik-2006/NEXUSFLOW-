/**
 * server/models/TeacherReview.js
 * ============================================================================
 * NEXUSFLOW V4 — TEACHER REVIEW & AUDIT MODEL (Prompt 13)
 *
 * Captures formal academic faculty reviews, comments, and private notes
 * for student projects, requirements, tasks, and deliverables.
 *
 * PRIVACY INVARIANT:
 *   Comments with isPrivateNote=true are strictly teacher-only and must NEVER
 *   be returned to students under any circumstances.
 * ============================================================================
 */

import mongoose from "mongoose";

const ReviewCommentSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: {
      type: String,
      default: "User",
    },
    authorRole: {
      type: String,
      enum: ["teacher", "faculty", "student", "leader", "member"],
      default: "teacher",
    },
    text: {
      type: String,
      required: true,
    },
    isPrivateNote: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const ReviewAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    actorName: {
      type: String,
      default: "System",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const TeacherReviewSchema = new mongoose.Schema(
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
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacherName: {
      type: String,
      default: "Faculty Reviewer",
    },
    targetType: {
      type: String,
      enum: ["project", "requirement", "task", "deliverable", "milestone", "evidence"],
      required: true,
    },
    targetId: {
      type: String,
      default: "",
    },
    targetTitle: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_REVIEW", "FEEDBACK", "STUDENT_RESPONSE", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
    comments: [ReviewCommentSchema],
    auditLog: [ReviewAuditLogSchema],
  },
  { timestamps: true }
);

TeacherReviewSchema.index({ projectId: 1, status: 1 });
TeacherReviewSchema.index({ teacherId: 1, createdAt: -1 });

export default mongoose.model("TeacherReview", TeacherReviewSchema);
