/**
 * server/scripts/migrations/phase2RequirementReferenceAudit.js
 * NEXUSFLOW Phase 2 (Task 4) — READ-ONLY requirement reference integrity audit.
 *
 * Reports, per project: invalid task ids, orphaned task references, references
 * to another project of the same workspace, references to another workspace,
 * duplicate references, unknown and self dependencies. Output contains counts
 * and ids only — never titles or content of other workspaces' records.
 * Performs no writes. Not executed during Phase 2.
 *
 * Usage: node scripts/migrations/phase2RequirementReferenceAudit.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { auditRequirementReferences } from "../../services/requirementReferenceService.js";

async function main() {
  dotenv.config();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set.");
  await mongoose.connect(process.env.MONGO_URI);
  const report = await auditRequirementReferences();
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
