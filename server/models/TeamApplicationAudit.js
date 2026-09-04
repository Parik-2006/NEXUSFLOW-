import mongoose from "mongoose";

const TeamApplicationAuditSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamApplication",
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "CREATED",
        "SUBMITTED",
        "STATUS_UPDATED",
        "ACCEPTED",
        "REJECTED",
        "WITHDRAWN",
      ],
      required: true,
    },
    previousStatus: {
      type: String,
      default: "",
    },
    newStatus: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TeamApplicationAudit", TeamApplicationAuditSchema);
