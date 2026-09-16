/**
 * server/models/TemporaryContext.js
 * ============================================================================
 * NEXUSFLOW V4 — TEMPORARY CONTEXT & COPILOT ATTACHMENTS (Workstream 16)
 *
 * Stores ephemeral context and document attachments for AI Copilot sessions.
 *
 * STRICT INVARIANT:
 *   ATTACHMENT -> TEMPORARY CONTEXT
 *   NOT AUTOMATIC PERSISTENT MEMORY!
 *
 * Ephemeral context expires after a configured TTL (default 24h) unless
 * explicitly saved to ProjectMemory by user action ("Save to Project Memory").
 * ============================================================================
 */

import mongoose from "mongoose";

const TemporaryContextSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIConversation",
      default: null,
      index: true,
    },
    sourceIdentifier: {
      type: String,
      required: true,
      maxlength: 255,
    },
    fileType: {
      type: String,
      enum: [
        "pdf",
        "docx",
        "doc",
        "markdown",
        "txt",
        "csv",
        "json",
        "code",
        "image_png",
        "image_jpeg",
        "image_webp",
        "diagram",
        "unsupported",
      ],
      default: "txt",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "text/plain",
    },
    extractedText: {
      type: String,
      default: "",
    },
    structuredMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    processingState: {
      type: String,
      enum: ["processing", "ready", "failed", "unsupported"],
      default: "ready",
      index: true,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    isPromotedToMemory: {
      type: Boolean,
      default: false,
    },
    promotedMemoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectMemory",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      index: { expires: "1s" }, // MongoDB TTL auto-cleanup
    },
  },
  {
    timestamps: true,
  }
);

TemporaryContextSchema.index({ projectId: 1, userId: 1, createdAt: -1 });

export default mongoose.model("TemporaryContext", TemporaryContextSchema);
