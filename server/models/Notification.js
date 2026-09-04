import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "team_invitation",
        "invitation_accepted",
        "invitation_rejected",
        "member_left",
        "task_assigned",
        "general",
        "application_submitted",
        "application_accepted",
        "application_rejected",
        "application_withdrawn",
      ],
      default: "team_invitation",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: {
      teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
      teamName: { type: String },
      invitationId: { type: mongoose.Schema.Types.ObjectId, ref: "Invitation" },
      applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "TeamApplication" },
      inviterName: { type: String },
      applicantName: { type: String },
      role: { type: String, default: "member" },
      reason: { type: String },
    },
    read: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["unread", "read", "archived"],
      default: "unread",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", NotificationSchema);
