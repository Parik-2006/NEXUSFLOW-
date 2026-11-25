import mongoose from "mongoose";

/**
 * NEXUSFLOW Phase 2 (Task 3) — one-time login exchange codes.
 *
 * After a verified Google callback the browser is redirected with a short
 * random code (never a JWT). The frontend POSTs it, together with the PKCE-
 * style verifier it generated before starting the login, to
 * /api/auth/exchange. The code is consumed atomically (single use), expires
 * after ~2 minutes, and only the SHA-256 hashes of code and challenge are
 * stored.
 */
const AuthExchangeCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    clientChallenge: { type: String, required: true }, // base64url(SHA-256(verifier))
    redirectPath: { type: String, default: "/" },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model("AuthExchangeCode", AuthExchangeCodeSchema);
