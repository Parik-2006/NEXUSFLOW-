/**
 * Phase 4 (Task 8): invalidate scoped AI cache entries for a workspace whenever
 * membership, roles or archive state change (Team) or a project is archived /
 * restored / changed (Project). Cached private AI output is therefore never
 * served after a member is removed or a resource is archived.
 */
const WATCH = { Team: ["members", "archivedAt", "ownerId"], Project: ["archivedAt", "teamId", "requirements", "title", "description"] };

function touched(update, fields) {
  if (!update || Array.isArray(update)) return false;
  const keys = new Set();
  for (const [k, v] of Object.entries(update)) {
    if (k.startsWith("$") && v && typeof v === "object") Object.keys(v).forEach((f) => keys.add(f.split(".")[0]));
    else keys.add(k.split(".")[0]);
  }
  return fields.some((f) => keys.has(f));
}

async function invalidate(teamIds) {
  const ids = [...new Set(teamIds.filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    const { aiCache } = await import("../services/omniRoute.js");
    for (const id of ids) aiCache.invalidateWorkspace(id);
  } catch { /* cache is best-effort; never block a write */ }
}

export function aiCacheInvalidationPlugin(schema, { modelName }) {
  const fields = WATCH[modelName] || [];
  const teamOf = (doc) => (modelName === "Team" ? doc?._id : doc?.teamId);
  schema.post("save", async function (doc) {
    if (fields.some((f) => doc.$locals?.aiCacheTouched?.includes(f))) await invalidate([teamOf(doc)]);
  });
  schema.pre("save", function (next) {
    this.$locals.aiCacheTouched = fields.filter((f) => this.isModified(f));
    next();
  });
  for (const op of ["updateOne", "updateMany", "findOneAndUpdate"]) {
    schema.pre(op, async function () {
      if (!touched(this.getUpdate(), fields)) return;
      const docs = await this.model.find(this.getFilter(), { _id: 1, teamId: 1 }, { includeArchived: true }).limit(1000).lean();
      this._aiCacheTeams = docs.map(teamOf);
    });
    schema.post(op, async function () {
      if (this._aiCacheTeams) await invalidate(this._aiCacheTeams);
    });
  }
}
