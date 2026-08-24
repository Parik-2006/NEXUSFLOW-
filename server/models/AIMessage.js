/**
 * server/models/AIMessage.js
 * ============================================================================
 * AI MESSAGE — A single turn (one message) within an AIConversation.
 *
 * WHY SEPARATE FROM AIConversation:
 * See AIConversation.js for the full rationale. In summary:
 *   - Avoid 16MB BSON document limit on long conversations
 *   - Efficient pagination (fetch last N messages, not all)
 *   - Independent message-level operations (delete, flag, reference)
 *
 * ROLES:
 * A message has one of three roles (matching the OpenAI API convention):
 *   "user"      — Message from the student/team
 *   "assistant" — Response from the AI (GPT-4o-mini or other provider)
 *   "system"    — System-injected context (not displayed to user)
 *                 e.g., project context injected before each conversation
 *
 * CONTEXT REFERENCES:
 * In Phase 2+ (Project Copilot), the system will inject structured project
 * context into each AI request. The `contextSnapshot` field captures WHAT
 * project context was sent with this message, so:
 *   1. We can replay the exact prompt that produced a response
 *   2. We can audit "did the AI know about Decision X when it said Y?"
 *   3. We can compare responses across context versions
 *
 * TOOL/ACTION METADATA (Phase 2+):
 * When the AI doesn't just respond with text but PERFORMS ACTIONS
 * (creates a task, generates research recommendations, suggests a decision),
 * the `toolAction` field records what was done.
 * This is the foundation for agentic AI in Phase 6+.
 *
 * NOTE (Phase 1 scope):
 * This model is defined for future use. The existing @ai streaming endpoint
 * continues unchanged. No existing code is modified to use AIMessage in
 * Phase 1. Phase 2 will wire the chatbot to persist through these models.
 * ============================================================================
 */

import mongoose from "mongoose";

const AIMessageSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    // Which conversation does this message belong to?
    conversationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "AIConversation",
      required: true,
      index:    true,
    },

    // Denormalized project reference for efficient "all messages in project X" queries
    // Avoids needing to join through AIConversation every time
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Message Content ───────────────────────────────────────────────────────
    // Who sent this message?
    role: {
      type:     String,
      enum:     ["user", "assistant", "system"],
      required: true,
    },

    // The text content of the message
    // For "system" messages, this contains the injected project context
    // For "user" messages, this is what the student typed
    // For "assistant" messages, this is the AI's response
    content: { type: String, required: true, default: "" },

    // ── Context Snapshot (Phase 2+) ───────────────────────────────────────────
    // What project context was available when this message was processed?
    // Stored as a lightweight snapshot (not full document copies, just key signals):
    //   { phase: "research", decisionsCount: 3, hasContext: true }
    // This allows Phase 2+ to reproduce the exact reasoning conditions
    contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Tool / Action Metadata (Phase 6+) ────────────────────────────────────
    // If this assistant message resulted in an action being taken, record it.
    // e.g. { type: "task_created", taskId: "...", title: "Implement Soil API" }
    // e.g. { type: "decision_proposed", decisionId: "...", decision: "Use MongoDB" }
    // NULL for normal conversational messages (the majority)
    toolAction: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Token Usage (for cost tracking, Phase 2+) ────────────────────────────
    // If this was an AI response, how many tokens did it consume?
    // Allows cost estimation: totalTokens × provider_price = cost
    tokensUsed: {
      prompt:     { type: Number, default: null },
      completion: { type: Number, default: null },
      total:      { type: Number, default: null },
    },

    // ── Authorship ────────────────────────────────────────────────────────────
    // For "user" role messages — which user sent this?
    sentBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
  },
  { timestamps: true }  // createdAt = message timestamp, updatedAt for edits
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Chronological message history for a conversation (the most common query)
AIMessageSchema.index({ conversationId: 1, createdAt: 1 });

// All messages in a project (for search / audit, Phase 2+)
AIMessageSchema.index({ projectId: 1, createdAt: 1 });

export default mongoose.model("AIMessage", AIMessageSchema);
