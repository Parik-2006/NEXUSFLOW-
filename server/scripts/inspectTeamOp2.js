import mongoose from "mongoose";
import Sprint from "../models/Sprint.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import Risk from "../models/Risk.js";

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  const team = await Team.findById("6adb09192c3a6d88072f8709").lean();
  console.log("TEAM:", team.name, "members:", team.members?.length);
  const proj = await Project.findOne({ teamId: team._id }).lean();
  console.log("PROJECT:", proj._id, proj.name, "status:", proj.status);

  const sprints = await Sprint.find({ projectId: proj._id }).lean();
  console.log(`SPRINTS (${sprints.length}):`);
  for (const s of sprints) {
    console.log(` - Sprint ${s.sprintNumber} (${s._id}): status=${s.status}, name="${s.name}", plannedTasks=${s.plannedTaskCount}, plannedPts=${s.plannedStoryPoints}`);
  }

  const tasks = await Task.find({ projectId: proj._id }).lean();
  console.log(`TASKS (${tasks.length}):`);
  for (const t of tasks) {
    console.log(` - Task (${t._id}): "${t.title}" | sprintId=${t.sprintId} | scrumStatus=${t.scrumStatus} | assignedTo=${t.assignedTo} | pts=${t.storyPoints} | hrs=${t.estimatedHours}`);
  }

  const risks = await Risk.find({ $or: [{ projectId: proj._id }, { teamId: team._id }] }).lean();
  console.log(`RISKS (${risks.length}):`);
  for (const r of risks) {
    console.log(` - Risk (${r._id}): "${r.title}" | status=${r.status} | severity=${r.severity} | category=${r.category}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
