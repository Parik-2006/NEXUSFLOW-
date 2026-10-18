import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  const Project = mongoose.model("Project", new mongoose.Schema({}, { strict: false }));
  const Task = mongoose.model("Task", new mongoose.Schema({}, { strict: false }));
  const Team = mongoose.model("Team", new mongoose.Schema({}, { strict: false }));

  const p = await Project.findById("6acfb3838ff9ff02f57b70e1").lean();
  console.log("=== PROJECT ===");
  console.log({
    _id: p._id,
    name: p.name,
    teamId: p.teamId,
    waterfallPhase: p.waterfallPhase,
    lifecycle: p.waterfallPlanLifecycle,
    requirementsCount: p.requirements?.length,
  });
  console.log("\n=== TEAM ===");
  const team = await Team.findById(p.teamId).lean();
  console.log({
    _id: team?._id,
    name: team?.name,
    taskCount: team?.taskCount,
    settings: team?.settings,
    membersCount: team?.members?.length,
    members: team?.members?.map(m => ({ userId: m.userId, name: m.name, role: m.role, capacity: m.capacity })),
  });
  console.log("\n=== REQUIREMENTS ===");
  for (const r of (p.requirements || [])) {
    console.log({
      reqId: r.reqId,
      title: r.title,
      phase: r.phase,
      status: r.status,
      dependencies: r.dependencies,
    });
  }

  const tasks = await Task.find({
    $or: [{ projectId: p._id }, { teamId: p.teamId }]
  }).sort({ executionOrder: 1, createdAt: 1 }).lean();

  console.log(`\n=== TASKS (Total: ${tasks.length}) ===`);
  for (const t of tasks) {
    console.log({
      _id: t._id,
      title: t.title,
      phase: t.phase,
      status: t.status,
      executionOrder: t.executionOrder,
      requirementId: t.requirementId,
      dependencies: t.dependencies,
    });
  }

  process.exit(0);
}

inspect().catch(err => { console.error(err); process.exit(1); });
