/**
 * server/utils/archivePlugin.js
 * NEXUSFLOW Phase 2 (Task 7) — recoverable archive ("soft delete") support.
 *
 * Adds archivedAt / archivedBy / purgeAfter / archiveOperationId and query
 * middleware that HIDES archived documents from every ordinary query
 * (find, findOne/findById/exists, counts, updates, deletes and aggregations).
 * Only lifecycle code opts in with `.setOptions({ includeArchived: true })`
 * (or aggregate option { includeArchived: true }).
 *
 * Old documents without the field match `archivedAt: null`, so no migration
 * is required.
 */
import mongoose from "mongoose";

const QUERY_OPS = [
  "find", "findOne", "countDocuments", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace",
  "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "distinct",
];

export function archivePlugin(schema) {
  schema.add({
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    purgeAfter: { type: Date, default: null },
    archiveOperationId: { type: String, default: null },
  });
  schema.index({ archivedAt: 1, purgeAfter: 1 });

  schema.pre(QUERY_OPS, function hideArchived() {
    if (this.getOptions()?.includeArchived) return;
    const filter = this.getFilter() || {};
    if (Object.prototype.hasOwnProperty.call(filter, "archivedAt")) return;
    this.where({ archivedAt: null });
  });

  schema.pre("aggregate", function hideArchivedInAggregate() {
    if (this.options?.includeArchived) return;
    const first = this.pipeline()[0];
    if (first && ("$geoNear" in first || "$search" in first || "$vectorSearch" in first)) return;
    this.pipeline().unshift({ $match: { archivedAt: null } });
  });
}
