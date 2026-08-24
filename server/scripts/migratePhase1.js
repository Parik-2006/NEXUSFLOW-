/**
 * server/scripts/migratePhase1.js
 * ============================================================================
 * PHASE 1 MIGRATION — Idempotent, safe, non-destructive data foundation script.
 *
 * PURPOSE:
 * Existing NEXUSFLOW databases have Teams and Tasks but NO Projects.
 * This script creates a default Project for each Team that doesn't have one,
 * populating it from Team.projectTitle and Team.projectDescription.
 * It then backfills Task.projectId for all tasks belonging to that team.
 *
 * SAFETY GUARANTEES:
 * 1. Idempotent — running this script multiple times produces the same result.
 *    If a Team already has activeProjectId, it is skipped completely.
 *    If a Task already has projectId set, it is not overwritten.
 * 2. Non-destructive — no documents are deleted or fields removed.
 * 3. Reversible — the rollback is trivial:
 *    db.projects.deleteMany({}) + db.tasks.updateMany({},{$set:{projectId:null}})
 *    + db.teams.updateMany({},{$set:{activeProjectId:null}})
 * 4. Dry-run mode — set DRY_RUN=true env variable to see what WOULD be done
 *    without actually writing to the database.
 *
 * USAGE:
 *   # Normal run (writes to database)
 *   node scripts/migratePhase1.js
 *
 *   # Dry run (no writes, just reports)
 *   DRY_RUN=true node scripts/migratePhase1.js
 *
 * WHAT IT DOES:
 * For each Team WITHOUT an activeProjectId:
 *   1. Creates a Project document using the team's projectTitle/projectDescription.
 *   2. Sets Team.activeProjectId to the new Project._id.
 *   3. Updates all Tasks for that team: set Task.projectId = new Project._id.
 *      (Only tasks that have projectId=null — idempotent)
 *
 * WHAT IT DOES NOT DO:
 *   - Does not delete any Teams, Tasks, or Projects
 *   - Does not change any algorithm logic or pre-save hooks
 *   - Does not modify Team.projectTitle or Team.projectDescription
 *   - Does not modify any existing projectId values on tasks
 *   - Does not run in production without explicit MONGO_URI env variable
 * ============================================================================
 */

import "dotenv/config";
import mongoose from "mongoose";

// Import models to ensure schemas are registered before queries
import Team    from "../models/Team.js";
import Task    from "../models/Task.js";
import Project from "../models/Project.js";
// Import remaining models to register their schemas in Mongoose
import "../models/Decision.js";
import "../models/ResearchItem.js";
import "../models/Recommendation.js";
import "../models/ArchitectureComponent.js";
import "../models/Resource.js";
import "../models/AIConversation.js";
import "../models/AIMessage.js";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";
const DRY_RUN  = process.env.DRY_RUN === "true";

async function runMigration() {
  console.log("=".repeat(70));
  console.log("NEXUSFLOW 2.0 — Phase 1 Database Migration");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE (writing to database)"}`);
  console.log(`Database: ${MONGO_URI}`);
  console.log("=".repeat(70));

  await mongoose.connect(MONGO_URI);
  console.log("✓ MongoDB connected\n");

  // ── Step 1: Find all teams that have NO active project ──────────────────────
  const teamsWithoutProject = await Team.find({ activeProjectId: null }).lean();
  console.log(`Found ${teamsWithoutProject.length} teams without an active project.`);

  if (teamsWithoutProject.length === 0) {
    console.log("\n✓ All teams already have an active project. Migration complete (nothing to do).");
    await mongoose.disconnect();
    return;
  }

  let teamsProcessed = 0;
  let projectsCreated = 0;
  let tasksBackfilled = 0;

  for (const team of teamsWithoutProject) {
    const teamId = team._id.toString();
    const title = team.projectTitle?.trim() || team.name?.trim() || "Unnamed Project";
    const description = team.projectDescription?.trim() || "";

    console.log(`\nProcessing team: "${team.name}" (${teamId})`);
    console.log(`  → Project title: "${title}"`);
    console.log(`  → Project description: "${description.slice(0, 80)}${description.length > 80 ? "…" : ""}"`);

    // ── Step 2: Count tasks that need projectId backfilling ─────────────────
    const tasksToBackfill = await Task.countDocuments({ teamId: team._id, projectId: null });
    console.log(`  → Tasks to backfill: ${tasksToBackfill}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create Project "${title}" for team ${teamId}`);
      console.log(`  [DRY RUN] Would backfill ${tasksToBackfill} tasks with projectId`);
      console.log(`  [DRY RUN] Would set Team.activeProjectId`);
      teamsProcessed++;
      projectsCreated++;
      tasksBackfilled += tasksToBackfill;
      continue;
    }

    // ── Step 3: Create the default Project ──────────────────────────────────
    // Marked as "planning" because the team already has tasks (they're past ideation)
    const project = await Project.create({
      teamId:         team._id,
      title,
      description,
      originalPrompt: description, // The projectDescription IS the original prompt
      status:         tasksToBackfill > 0 ? "active" : "planning",
      currentPhase:   tasksToBackfill > 0 ? "development" : "planning",
    });

    console.log(`  ✓ Created Project: ${project._id}`);
    projectsCreated++;

    // ── Step 4: Backfill Task.projectId ─────────────────────────────────────
    // Only update tasks that don't already have a projectId (idempotent)
    if (tasksToBackfill > 0) {
      const result = await Task.updateMany(
        { teamId: team._id, projectId: null },
        { $set: { projectId: project._id } }
      );
      console.log(`  ✓ Backfilled ${result.modifiedCount} tasks with projectId`);
      tasksBackfilled += result.modifiedCount;
    }

    // ── Step 5: Set Team.activeProjectId ────────────────────────────────────
    await Team.updateOne(
      { _id: team._id },
      { $set: { activeProjectId: project._id } }
    );
    console.log(`  ✓ Updated Team.activeProjectId → ${project._id}`);
    teamsProcessed++;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(70));
  console.log(`Teams processed:   ${teamsProcessed} / ${teamsWithoutProject.length}`);
  console.log(`Projects created:  ${projectsCreated}`);
  console.log(`Tasks backfilled:  ${tasksBackfilled}`);
  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN — No changes were written to the database.");
    console.log("   Run without DRY_RUN=true to apply the migration.");
  } else {
    console.log("\n✓ Migration complete. All data preserved. No documents deleted.");
  }

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error("\n✗ Migration failed:", err.message);
  console.error(err.stack);
  mongoose.disconnect().finally(() => process.exit(1));
});
