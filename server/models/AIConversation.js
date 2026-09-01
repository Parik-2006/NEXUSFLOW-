/**
 * server/models/AIConversation.js
 * ============================================================================
 * AI CONVERSATION — Represents a single project-aware chat session between
 * a student (or team) and the AI Project Copilot.
 *
 * WHY THIS MODEL EXISTS:
 * The existing ChatPanel already lets users type "@ai <prompt>" to get a
 * streaming response. But this conversation is EPHEMERAL — when the page
 * reloads, all messages are gone.
 *
 * More critically: the current @ai chat is CONTEXT-FREE. Every message is
 * treated as a completely isolated request. The AI doesn't know:
 *   - "This user is building a smart irrigation system"
 *   - "We already decided to use MongoDB"
 *   - "We have 3 team members with an ML specialist"
 *   - "We're currently in the Research phase"
 *
 * AIConversation and AIMessage together provide:
 *   1. PERSISTENCE: Conversations survive page reloads
 *   2. PROJECT SCOPING: Each conversation is linked to a specific project,
 *      so context (ProjectContext, Decisions, etc.) can be injected into prompts
 *   3. MULTI-TURN SUPPORT: Enables the AI to reference what was said earlier
 *      in the conversation ("you mentioned soil moisture sensors earlier...")
 *   4. AUDIT TRAIL: Full record of AI interactions for debugging/review
 *
 * WHY CONVERSATION + MESSAGE (two collections, not one):
 * An AIConversation is the "session" (metadata, participants, project link).
 * An AIMessage is a single turn within that session.
 *
 * If we embedded messages in the conversation document:
 *   - A long conversation (100+ messages) could hit the 16MB BSON limit
 *   - Fetching message history would load ALL messages, not just recent ones
 *   - We couldn't paginate efficiently
 *
 * Separate AIMessage collection allows:
 *   - `messages.find({conversationId, createdAt: {$gte: lastRead}})` — fetch only new
 *   - Pagination: last 20 messages = easy index query
 *   - Individual message updates (edit, delete, flag)
 *
 * WHY NOT EMBED IN PROJECT:
 * A project can have many conversations (one per session, or one per topic).
 * Embedding would bloat the Project document.
 *
 * NOTE (Phase 1 scope):
 * This model provides persistence scaffolding ONLY. The existing @ai streaming
 * is NOT wired to persist via this model in Phase 1. Wiring the chatbot to
 * this model is Phase 2 work. Phase 1 just ensures the database can hold it.
 * ============================================================================
 */

import mongoose from "mongoose";

const AIConversationSchema = new mongoose.Schema(
  {
    // ── Ownership ────────────────────────────────────────────────────────────
    projectId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Project",
      required: true,
      index:    true,
    },

    // ── Conversation Identity ─────────────────────────────────────────────────
    // Human-readable title for this conversation (auto-generated or user-set)
    // e.g. "Architecture Discussion", "Sprint Planning Session", "Initial Onboarding"
    title: { type: String, default: "New Conversation" },

    // What triggered or is the purpose of this conversation?
    topic: {
      type:    String,
      enum:    [
        "project_onboarding",     // First conversation when project is created
        "architecture_planning",  // Discussing system architecture
        "technology_selection",   // Choosing technologies
        "task_generation",        // Generating tasks from prompt
        "sprint_planning",        // Planning a sprint (replaces @ai plan sprint X)
        "research_query",         // Asking about papers, benchmarks, approaches
        "general_assistance",     // Freeform Q&A
        "risk_analysis",          // Identifying project risks
        "code_review",            // Reviewing code or architecture decisions
      ],
      default: "general_assistance",
    },

    // ── Conversation State ────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["active", "archived"],
      default: "active",
    },

    // Denormalized count of messages in this conversation (for dashboard display)
    // Incremented when AIMessage documents are created for this conversation
    messageCount: { type: Number, default: 0, min: 0 },

    // ── Authorship ───────────────────────────────────────────────────────────
    startedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ── Phase 10: Per-User Privacy Scoping ───────────────────────────────────
    // Copilot conversations are PRIVATE per user. Indexed for efficient
    // per-user queries so that User B never sees User A's chat history.
    userId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "User",
      index: true,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// All conversations for a project, newest first
AIConversationSchema.index({ projectId: 1, createdAt: -1 });

// Only active conversations for a project
AIConversationSchema.index({ projectId: 1, status: 1 });

// Phase 10: Per-user private Copilot query index
// Allows efficient: AIConversation.find({ projectId, userId }) — O(log n)
AIConversationSchema.index({ projectId: 1, userId: 1, createdAt: -1 });

export default mongoose.model("AIConversation", AIConversationSchema);
