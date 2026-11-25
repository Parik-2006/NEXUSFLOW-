import mongoose from "mongoose";

/**
 * NEXUSFLOW Phase 2 — password reset tokens.
 * Only a SHA-256 hash of the 256-bit random token is stored. The hash is
 * unique and indexed, so validation is a direct, user-scoped lookup (never
 * "newest token in the collection"). Expired documents are removed by TTL.
 */
const PasswordResetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    // Legacy field kept optional for old documents.
    email: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PasswordResetSchema.index({ userId: 1, used: 1 });

export default mongoose.model("PasswordReset", PasswordResetSchema);
