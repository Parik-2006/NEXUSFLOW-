/**
 * AIUsageEvent — Phase 4 (Task 5) usage accounting. METADATA ONLY: never
 * prompts, responses, repository content or keys. Auto-expires after 30 days.
 * Token counts are provider-reported when `tokens.reported` is true.
 */
import mongoose from "mongoose";

const AIUsageEventSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, maxlength: 64 },
    operation: { type: String, maxlength: 48 },
    provider: { type: String, maxlength: 24 },
    model: { type: String, maxlength: 120 },
    outcome: { type: String, maxlength: 32 },
    durationMs: { type: Number, min: 0 },
    attempt: { type: Number, min: 0 },
    tokens: {
      prompt: { type: Number, default: null },
      completion: { type: Number, default: null },
      total: { type: Number, default: null },
      reported: { type: Boolean, default: false },
    },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
AIUsageEventSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 86400 });

export default mongoose.models.AIUsageEvent || mongoose.model("AIUsageEvent", AIUsageEventSchema);
