/**
 * server/scripts/migrations/phase3TaskGraphBackfill.js
 * NEXUSFLOW Phase 3 (D-20 / D-21 / D-22) — derived task-graph field backfill.
 *
 * DRY RUN BY DEFAULT: reports, per workspace, how many active tasks would change
 * dependencyCount (prerequisites), dependentCount (dependents, new field) or
 * priorityScore (corrected greedy formula). Counts and ids only; no writes.
 *
 *   node scripts/migrations/phase3TaskGraphBackfill.js            # dry run
 *   node scripts/migrations/phase3TaskGraphBackfill.js --apply    # writes
 *
 * Not executed against any real database during Phase 3. Run the dry run
 * first, review it, back up, then apply during a maintenance window.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";

async function main() {
  dotenv.config();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set.");
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  await import("../../models/Task.js");
  const svc = await import("../../services/taskGraphService.js");
  const plan = await svc.planTaskGraphBackfill();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", plan }, null, 2));
  if (apply) console.log(JSON.stringify({ applied: await svc.applyTaskGraphBackfill() }, null, 2));
  await mongoose.disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
