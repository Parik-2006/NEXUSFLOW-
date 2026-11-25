/**
 * server/utils/identity.js
 * NEXUSFLOW Phase 1 — Canonical identity normalization.
 *
 * All authorization decisions must use the immutable MongoDB user _id taken
 * from a verified JWT. Display names and emails are NEVER identity.
 */

import mongoose from "mongoose";

/** True when `v` is a 24-hex ObjectId string or an ObjectId instance. */
export function isValidId(v) {
  if (!v) return false;
  if (v instanceof mongoose.Types.ObjectId) return true;
  return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v);
}

/**
 * Convert an ObjectId, a populated Mongoose document ({ _id }), or a string to
 * a canonical lowercase id string. Returns "" for anything unusable.
 */
export function toIdString(v) {
  if (!v) return "";
  if (typeof v === "string") return isValidId(v) ? v.toLowerCase() : "";
  if (v instanceof mongoose.Types.ObjectId) return v.toHexString();
  if (typeof v === "object") {
    if (v._id && v._id !== v) return toIdString(v._id);
    if (typeof v.toHexString === "function") return v.toHexString();
  }
  return "";
}

/** Strict id equality across ObjectId / populated / string forms. */
export function idEquals(a, b) {
  const sa = toIdString(a);
  return sa !== "" && sa === toIdString(b);
}

/**
 * The authenticated user's id from a verified JWT payload (req.user /
 * socket.data.user). Returns a valid id string or null. There is deliberately
 * NO email or name fallback: legacy tokens without an ObjectId `id` claim are
 * rejected at verification time (see auth.js).
 */
export function getAuthUserId(authUser) {
  if (!authUser) return null;
  const id = toIdString(authUser.id) || toIdString(authUser._id);
  return id || null;
}
