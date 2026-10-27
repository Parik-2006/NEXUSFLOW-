import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB Atlas.");

  const Team = mongoose.model("Team", new mongoose.Schema({}, { strict: false }));
  const Task = mongoose.model("Task", new mongoose.Schema({}, { strict: false }));
  const Project = mongoose.model("Project", new mongoose.Schema({}, { strict: false }));
  const Sprint = mongoose.model("Sprint", new mongoose.Schema({}, { strict: false }));

  const teams = await Team.find({}).lean();
  console.log(`Total teams: ${teams.length}`);

  for (const t of teams) {
    const projects = await Project.find({ teamId: t._id }).lean();
    const tasks = await Task.find({ teamId: t._id }).lean();
    const sprints = await Sprint.find({ teamId: t._id }).lean();
    console.log(`\nTeam: "${t.name}" (id: ${t._id}) | Methodology: ${t.methodology}`);
    console.log(`  Projects: ${projects.length} | Sprints: ${sprints.length} | Tasks: ${tasks.length}`);
    if (tasks.length > 0) {
      console.log(`  Sample tasks (${Math.min(5, tasks.length)} of ${tasks.length}):`);
      tasks.slice(0, 10).forEach((x) => {
        console.log(`    - "${x.title}" | status: ${x.status} | scrumStatus: ${x.scrumStatus} | phase: ${x.phase} | source: ${x.source} | sprintId: ${x.sprintId} | createdAt: ${x.createdAt}`);
      });
    }

    if (t.methodology === "SCRUM" && projects.length > 0) {
      const scrumTasks = await Task.find({
        $or: [{ projectId: projects[0]._id }, { teamId: t._id }],
        $and: [
          {
            $or: [
              { scrumStatus: { $in: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "SELECTED_FOR_SPRINT", "CARRIED_OVER"] } },
              { sprintId: { $ne: null } },
              { source: { $in: ["approved_suggestion", "user_story", "scrum_planning", "manual"] } },
              { userStory: { $exists: true, $ne: "" } },
            ],
          },
          { scrumStatus: { $ne: "CANCELLED" } },
          {
            $nor: [
              {
                scrumStatus: null,
                sprintId: null,
                phase: { $in: ["requirements", "design", "testing", "deployment", "maintenance"] },
                userStory: { $in: [null, ""] },
              },
            ],
          },
        ],
      }).lean();
      console.log(`  ==> Scrum filtered backlog tasks count: ${scrumTasks.length}`);
    }
  }

  await mongoose.disconnect();
}

inspect().catch(console.error);
