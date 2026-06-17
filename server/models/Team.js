import mongoose from "mongoose";

const SkillProfileSchema = new mongoose.Schema(
  {
    frontend: { type: Number, default: 5, min: 0, max: 10 },
    backend:  { type: Number, default: 5, min: 0, max: 10 },
    devops:   { type: Number, default: 5, min: 0, max: 10 },
    design:   { type: Number, default: 5, min: 0, max: 10 },
    ml:       { type: Number, default: 5, min: 0, max: 10 },
    testing:  { type: Number, default: 5, min: 0, max: 10 },
  },
  { _id: false }
);

const TeamMemberSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:         { type: String, default: "" },   // human-readable label for assignment board / chips
    skills:       { type: SkillProfileSchema, default: () => ({}) },
    capacity:     { type: Number, default: 40, min: 1 },
    assignedLoad: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const TeamSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true },
    members:   { type: [TeamMemberSchema], default: [] },
    taskCount: { type: Number, default: 0 },
    doneCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Team", TeamSchema);
