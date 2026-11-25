/**
 * Phase 1 (Task 5) — legacy member identity audit utility (in-memory DB only).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestEnvironment } from "../helpers/testEnv.js";
import { createUser } from "../helpers/fixtures.js";

let env, Team, audit;
before(async () => {
  env = await startTestEnvironment();
  ({ default: Team } = await import("../../models/Team.js"));
  ({ auditMemberIdentities: audit } = await import("../../scripts/migrations/phase1MemberIdentityAudit.js"));
});
after(async () => env?.stop());

test("dry run reports without writing; apply only flags unlinked placeholders", async () => {
  const owner = await createUser("Mig Owner");
  const legacyId = new mongoose.Types.ObjectId();
  const t = await Team.create({
    name: "Legacy Members",
    ownerId: owner.user._id,
    members: [
      { userId: owner.user._id, name: "Mig Owner", role: "leader" },
      { userId: legacyId, name: "Name Only Person", role: "member" },
    ],
  });
  const ownerless = await Team.create({ name: "Ownerless", members: [] });

  const before = JSON.stringify(await Team.findById(t._id).lean());
  const dry = await audit({ apply: false });
  assert.equal(dry.applied, false);
  assert.ok(dry.toFlag.some((x) => x.userId === String(legacyId)));
  assert.ok(dry.ownerless.some((x) => x.teamId === String(ownerless._id)));
  assert.equal(JSON.stringify(await Team.findById(t._id).lean()), before, "dry run must not write");

  await audit({ apply: true });
  const after = await Team.findById(t._id).lean();
  const legacy = after.members.find((m) => String(m.userId) === String(legacyId));
  const real = after.members.find((m) => String(m.userId) === owner.id);
  assert.equal(legacy.placeholder, true);
  assert.equal(real.placeholder, false);
  assert.equal(String(after.ownerId), owner.id, "ownership is never changed");
  assert.equal((await Team.findById(ownerless._id).lean()).ownerId, undefined, "no owner is guessed");
});
