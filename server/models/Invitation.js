import mongoose from "mongoose";

const InvitationSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    teamName: { type: String, required: true },
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviterName: { type: String, default: "" },
    inviterEmail: { type: String, default: "" },
    invitedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invitedEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired", "canceled"],
      default: "pending",
      index: true,
    },
    role: { type: String, default: "member" },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0, background: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Invitation", InvitationSchema);
