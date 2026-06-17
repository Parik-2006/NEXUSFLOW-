import mongoose from "mongoose";

/**
 * Task schema — extended for DAA algorithm integration.
 *
 * New fields (all optional / default-safe so existing tasks are unaffected):
 *
 *  priority      {Number 1-10}  Greedy scheduling weight. Higher = scheduled first.
 *  effort        {Number 1-10}  Story-point proxy. Used as knapsack "weight".
 *  value         {Number 1-10}  Business value. Used as knapsack "profit".
 *  dependencies  [ObjectId]     Directed edges for Topological Sort / DFS / BFS.
 *  assignedTo    ObjectId       Member assigned via Branch-and-Bound optimiser.
 *  sprintId      String         Groups tasks into a sprint for Knapsack planning.
 *  topoOrder     Number         Computed execution order (Topological Sort result).
 */
const TaskSchema = new mongoose.Schema(
  {
    teamId:       { type: mongoose.Schema.Types.ObjectId, ref: "Team",  required: true, index: true },
    title:        { type: String, required: true },
    status:       { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ── DAA fields ──────────────────────────────────────────────────────────
    priority:     { type: Number, default: 5, min: 1, max: 10 },   // Greedy
    effort:       { type: Number, default: 3, min: 1, max: 10 },   // Knapsack weight
    value:        { type: Number, default: 5, min: 1, max: 10 },   // Knapsack profit
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }], // Topo / DFS / BFS
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },   // B&B assignment
    sprintId:     { type: String,  default: null },                // Sprint grouping
    topoOrder:    { type: Number,  default: null },                // Topo sort result
  },
  { timestamps: true }
);

export default mongoose.model("Task", TaskSchema);
