import mongoose from "mongoose";

const PasswordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

PasswordResetSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model("PasswordReset", PasswordResetSchema);
