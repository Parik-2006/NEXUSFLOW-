import mongoose from "mongoose";

const VerifiedSkillSubSchema = new mongoose.Schema(
  {
    skill:          { type: String, required: true },
    score:          { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 5 },
    percentage:     { type: Number, default: 0 },
    verified:       { type: Boolean, default: false },
    verifiedAt:     { type: Date, default: Date.now },
  },
  { _id: false }
);

const SkillMatchSubSchema = new mongoose.Schema(
  {
    score:              { type: Number, default: 0 },
    matchedSkills:      { type: [String], default: [] },
    missingSkills:      { type: [String], default: [] },
    matchPercentage:    { type: Number, default: 0 },
    compatibilityLabel: { type: String, default: "Developing" }, // "High", "Moderate", "Developing"
  },
  { _id: false }
);

const TeamApplicationSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    roleName: {
      type: String,
      required: true,
      trim: true,
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    applicantName: {
      type: String,
      default: "",
      trim: true,
    },
    applicantEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "QUIZ_PENDING",
        "SUBMITTED",
        "UNDER_REVIEW",
        "ACCEPTED",
        "REJECTED",
        "WITHDRAWN",
      ],
      default: "SUBMITTED",
      index: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    quizScore: {
      type: Number,
      default: 0,
    },
    quizTotal: {
      type: Number,
      default: 5,
    },
    quizPercentage: {
      type: Number,
      default: 0,
    },
    verifiedSkills: {
      type: [VerifiedSkillSubSchema],
      default: [],
    },
    skillMatch: {
      type: SkillMatchSubSchema,
      default: () => ({}),
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewerName: {
      type: String,
      default: "",
    },
    reviewReason: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent active duplicate application for the same user, team, and role
TeamApplicationSchema.index(
  { teamId: 1, roleId: 1, applicantId: 1, status: 1 }
);

export default mongoose.model("TeamApplication", TeamApplicationSchema);
