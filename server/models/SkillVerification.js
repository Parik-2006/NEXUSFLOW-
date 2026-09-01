import mongoose from "mongoose";

const SkillVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    skill: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "intermediate",
    },
    attemptId: {
      type: String,
      default: "",
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    questions: [
      {
        question: String,
        options: [String],
        correctIndex: Number,
        userAnswer: Number,
      },
    ],
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

SkillVerificationSchema.index({ userId: 1, skill: 1, createdAt: -1 });

export default mongoose.model("SkillVerification", SkillVerificationSchema);
