import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    title: { type: String, required: true },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // DAA: Greedy task prioritization input — higher value = more urgent/important.
    priority: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model("Task", TaskSchema);
