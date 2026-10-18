import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow";

async function main() {
  await mongoose.connect(MONGO_URI);
  const projectId = new mongoose.Types.ObjectId("6acfb3838ff9ff02f57b70e1");
  const teamId = new mongoose.Types.ObjectId("6acfb3838ff9ff02f57b70df");

  const Task = (await import("../models/Task.js")).default;
  const ProjectLesson = (await import("../models/ProjectLesson.js")).default;
  const Risk = (await import("../models/Risk.js")).default;
  const Project = (await import("../models/Project.js")).default;
  const Team = (await import("../models/Team.js")).default;

  const tasks = await Task.find({ projectId }).lean();
  console.log("=== TASKS ===");
  console.log("Total tasks:", tasks.length);
  const doneTasks = tasks.filter(t => t.status === "done");
  console.log("Done tasks:", doneTasks.map(t => ({
    id: t._id,
    title: t.title,
    phase: t.phase,
    assignedTo: t.assignedTo,
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours,
    category: t.category,
    dependencies: t.dependencies
  })));

  const unassignedTasks = tasks.filter(t => !t.assignedTo);
  console.log("Unassigned tasks count:", unassignedTasks.length);

  const lessons = await ProjectLesson.find({ projectId }).lean();
  console.log("\n=== LESSONS ===");
  console.log("Existing lessons count:", lessons.length);
  console.log(lessons.map(l => ({ id: l._id, title: l.title, status: l.status, category: l.category })));

  const risks = await Risk.find({ projectId }).lean();
  console.log("\n=== RISKS ===");
  console.log("Existing risks count:", risks.length);
  console.log(risks.map(r => ({ id: r._id, title: r.title, status: r.status, severity: r.severity || r.impact })));

  const { collectLearningEvidence, generateLessonCandidates } = await import("../services/projectLearningService.js");
  const evidence = await collectLearningEvidence(projectId);
  console.log("\n=== LEARNING EVIDENCE ===");
  console.log(JSON.stringify(evidence, null, 2));

  console.log("\n=== GENERATING LESSONS ===");
  const candidates = await generateLessonCandidates(projectId);
  console.log("Candidates generated count:", candidates.length);
  console.log(JSON.stringify(candidates, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
