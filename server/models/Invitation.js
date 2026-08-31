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
      enum: ["pending", "accepted", "rejected", "canceled"],
      default: "pending",
      index: true,
    },
    role: { type: String, default: "member" },
  },
  { timestamps: true }
);

export default mongoose.model("Invitation", InvitationSchema);
