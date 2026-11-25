/**
 * server/scripts/migrations/phase1MemberIdentityAudit.js
 * NEXUSFLOW Phase 1 (Task 5) — legacy member identity audit / migration.
 *
 * DRY-RUN BY DEFAULT. Classifies every workspace member:
 *   - linked:       members[].userId belongs to a registered User
 *   - placeholder:  userId matches no User (legacy name-only member). These can
 *                   never authenticate. With --apply they are flagged
 *                   `placeholder: true` (idempotent; does NOT change access).
 *   - duplicate:    the same userId appears more than once in one team
 * and reports owner-less teams (which Phase 1 makes inaccessible) WITHOUT
 * guessing an owner — ownership must be restored by a human decision.
 *
 * It never links a placeholder to an account by name and never changes
 * ownerId, roles, or memberships.
 *
 * Usage:
 *   node scripts/migrations/phase1MemberIdentityAudit.js                # dry run
 *   node scripts/migrations/phase1MemberIdentityAudit.js --apply \
 *        --confirm-db=<database name>                                    # apply flags
 * The target is process.env.MONGO_URI; --apply additionally requires
 * --confirm-db to equal that URI's database name. Not executed in Phase 1.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import Team from "../../models/Team.js";
import User from "../../models/User.js";
import { parseMongoUri } from "../../tests/helpers/dbTargetGuard.js";

export async function auditMemberIdentities({ apply = false } = {}) {
  const teams = await Team.find({}).select("_id name ownerId members").lean();
  const allIds = [...new Set(teams.flatMap((t) => (t.members || []).map((m) => String(m.userId))).filter(Boolean))];
  const existing = new Set((await User.find({ _id: { $in: allIds } }).select("_id").lean()).map((u) => String(u._id)));

  const report = { teams: teams.length, linked: 0, placeholders: 0, alreadyFlagged: 0, duplicates: [], ownerless: [], toFlag: [] };
  for (const t of teams) {
    if (!t.ownerId) report.ownerless.push({ teamId: String(t._id), name: t.name, members: (t.members || []).length });
    const seen = new Set();
    for (const m of t.members || []) {
      const uid = String(m.userId || "");
      if (seen.has(uid)) report.duplicates.push({ teamId: String(t._id), userId: uid });
      seen.add(uid);
      if (existing.has(uid)) {
        report.linked++;
      } else {
        report.placeholders++;
        if (m.placeholder) report.alreadyFlagged++;
        else report.toFlag.push({ teamId: String(t._id), userId: uid, name: m.name || "" });
      }
    }
  }

  if (apply) {
    for (const item of report.toFlag) {
      await Team.updateOne(
        { _id: item.teamId },
        { $set: { "members.$[m].placeholder": true } },
        { arrayFilters: [{ "m.userId": new mongoose.Types.ObjectId(item.userId) }] }
      );
    }
  }
  return { ...report, applied: apply };
}

async function main() {
  dotenv.config();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");
  const dbName = parseMongoUri(uri)?.dbName || "";
  if (apply) {
    const confirm = (args.find((a) => a.startsWith("--confirm-db=")) || "").split("=")[1];
    if (!confirm || confirm !== dbName) {
      console.error(`Refusing --apply: pass --confirm-db=${dbName || "<db name>"} to confirm the target database.`);
      process.exit(2);
    }
  }
  await mongoose.connect(uri);
  const r = await auditMemberIdentities({ apply });
  console.log(JSON.stringify({ ...r, toFlag: r.toFlag.length, sampleToFlag: r.toFlag.slice(0, 20) }, null, 2));
  await mongoose.disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
