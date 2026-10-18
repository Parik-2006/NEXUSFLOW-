import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { generateWaterfallTasksFromPlan } from "../services/requirementService.js";
import { getWaterfallPhaseStates } from "../services/phaseGateService.js";

async function repair() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB Atlas");

  const project = await Project.findById("6acfb3838ff9ff02f57b70e1").lean();
  if (!project) throw new Error("Project 6acfb3838ff9ff02f57b70e1 not found");

  console.log(`Regenerating tasks for project "${project.name}" (${project._id})...`);
  const tasks = await generateWaterfallTasksFromPlan({
    project,
    teamId: project.teamId,
  });

  console.log(`Generated/Reconciled ${tasks.length} tasks.`);

  // Inspect tasks and their dependencies
  const refreshedTasks = await Task.find({
    $or: [{ projectId: project._id }, { teamId: project.teamId }]
  }).sort({ executionOrder: 1 }).lean();

  console.log("\n=== RECONCILED TASKS ===");
  for (const t of refreshedTasks) {
    console.log({
      order: t.executionOrder,
      reqId: t.requirementId,
      title: t.title,
      phase: t.phase,
      status: t.status,
      depsCount: t.dependencies?.length || 0,
      deps: t.dependencies,
    });
  }

  // Check phase states
  const states = await getWaterfallPhaseStates(project._id, project.teamId);
  console.log("\n=== WATERFALL PHASE STATES ===");
  console.log(states.phases.map(p => ({
    name: p.name,
    status: p.status,
    progress: p.progress,
    completed: p.completedTasks,
    total: p.totalTasks,
    lockedReason: p.lockedReason,
  })));

  process.exit(0);
}

repair().catch(err => {
  console.error("Repair failed:", err);
  process.exit(1);
});
