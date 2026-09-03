/**
 * server/routes/userLookup.js
 * NEXUSFLOW 3.0 — User lookup endpoints (workspace creation / invitations)
 *
 * FIX 4 (Combined Fixes 1–5):
 *  - Lookup a user by email (registered NexusFlow users only).
 *  - Returns minimal info so private data isn't leaked.
 *  - Rejects when the email is not registered.
 */
import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { requireAuth } from "../auth.js";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── GET /api/users/lookup?email=… ─────────────────────────────────────────────
// Returns { registered: true, user: { _id, name, email, avatar, skills } } if
// the email belongs to a registered NexusFlow user. Otherwise 404 with
// { registered: false }.
router.get("/users/lookup", requireAuth, async (req, res) => {
  try {
    const email = String(req.query.email || "").toLowerCase().trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        registered: false,
        error: "Please enter a valid email address.",
      });
    }

    const user = await User.findOne({ email })
      .select("_id name email avatar skills role")
      .lean();
    if (!user) {
      return res.status(404).json({
        registered: false,
        error: "This email is not registered on NexusFlow.",
      });
    }
    res.json({
      registered: true,
      user: {
        _id: String(user._id),
        name: user.name || "",
        email: user.email,
        avatar: user.avatar || "",
        skills: Array.isArray(user.skills) ? user.skills : [],
        role: user.role || "",
      },
    });
  } catch (e) {
    res.status(500).json({
      registered: false,
      error: "We couldn't check this email right now. Please try again.",
    });
  }
});

export default router;