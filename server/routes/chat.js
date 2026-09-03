import { Router } from "express";
import mongoose from "mongoose";
import ChatMessage from "../models/ChatMessage.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { requireAuth } from "../auth.js";
import { resolveAuthUser } from "./teams.js";

const router = Router();

// FIX 3F/3G/3H — Unread count helpers
// We store on the User doc a per-scope "last read" timestamp. Unread = count of
// messages newer than that timestamp that the user did NOT send themselves.
async function getUnreadCount(userId, scope, teamId = null) {
  const user = await User.findById(userId).select("chatRead").lean();
  const cr = user?.chatRead;
  // Mongoose Map hydration vs lean plain-object — handle both.
  let lastRead = null;
  if (cr && typeof cr.get === "function") lastRead = cr.get(scope) || null;
  else if (cr && typeof cr === "object") lastRead = cr[scope] || null;
  const q = { deletedAt: null };
  if (scope === "global") {
    q.type = "global";
  } else if (teamId) {
    q.type = "team";
    q.teamId = new mongoose.Types.ObjectId(teamId);
  } else {
    return 0;
  }
  if (lastRead) q.createdAt = { $gt: new Date(lastRead) };
  // Don't count the user's own messages
  q.senderId = { $ne: new mongoose.Types.ObjectId(userId) };
  return await ChatMessage.countDocuments(q);
}

// ── GET /api/chat/unread ──────────────────────────────────────────────────────
// Returns { global: N, teams: { "<teamId>": N, ... }, total: N }
router.get("/chat/unread", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    const userId = authUser._id;

    const teams = await Team.find({
      $or: [
        { ownerId: userId },
        { "members.userId": userId },
      ],
    }).select("_id").lean();
    const teamIds = teams.map((t) => String(t._id));

    const globalUnread = await getUnreadCount(userId, "global");
    const teamUnreads = {};
    for (const tid of teamIds) {
      teamUnreads[tid] = await getUnreadCount(userId, tid, tid);
    }
    const total = globalUnread + Object.values(teamUnreads).reduce((a, b) => a + b, 0);
    res.json({ global: globalUnread, teams: teamUnreads, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/chat/read ──────────────────────────────────────────────────────
// Body: { scope: "global" | "<teamId>" }
router.post("/chat/read", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    const { scope } = req.body ?? {};
    if (!scope || typeof scope !== "string") {
      return res.status(400).json({ error: "scope is required." });
    }
    // Authorize: if scope is a teamId, ensure membership
    if (scope !== "global") {
      if (!mongoose.isValidObjectId(scope)) {
        return res.status(400).json({ error: "Invalid scope." });
      }
      const team = await Team.findById(scope).lean();
      if (!team) return res.status(404).json({ error: "Team not found." });
      const isMember =
        team.members?.some((m) => String(m.userId) === String(authUser._id)) ||
        String(team.ownerId) === String(authUser._id);
      if (!isMember) {
        return res.status(403).json({ error: "Forbidden: not a team member." });
      }
    }
    await User.updateOne(
      { _id: authUser._id },
      { $set: { [`chatRead.${scope}`]: new Date() } }
    );
    res.json({ success: true, scope, readAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/chat/global ───────────────────────────────────────────────────────
router.get("/chat/global", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before;
    const query = { type: "global", deletedAt: null };
    if (before && mongoose.isValidObjectId(before)) {
      query._id = { $lt: before };
    }
    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/chat/global ──────────────────────────────────────────────────────
router.post("/chat/global", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { message, replyTo } = req.body ?? {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const chatMsg = await ChatMessage.create({
      senderId: authUser._id,
      senderName: authUser.name || authUser.email,
      message: String(message).trim(),
      type: "global",
      replyTo: replyTo || null,
      status: "sent",
    });

    const io = req.app.get("io");
    if (io) io.to("chat:global").emit("chat:global:new", chatMsg);

    res.status(201).json(chatMsg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/chat/team/:teamId ─────────────────────────────────────────────────
router.get("/chat/team/:teamId", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID." });
    }

    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "Team not found." });

    const isMember = team.members?.some(
      (m) => (m.userId?.toString?.() || m.userId?.toString?.()) === authUser._id.toString()
    ) || team.ownerId?.toString() === authUser._id.toString();

    if (!isMember) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this team." });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before;
    const query = { teamId, type: "team", deletedAt: null };
    if (before && mongoose.isValidObjectId(before)) {
      query._id = { $lt: before };
    }
    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/chat/team/:teamId ────────────────────────────────────────────────
router.post("/chat/team/:teamId", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: "Invalid team ID." });
    }

    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const team = await Team.findById(teamId).lean();
    if (!team) return res.status(404).json({ error: "Team not found." });

    const isMember = team.members?.some(
      (m) => (m.userId?.toString?.() || m.userId?.toString?.()) === authUser._id.toString()
    ) || team.ownerId?.toString() === authUser._id.toString();

    if (!isMember) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this team." });
    }

    const { message, replyTo } = req.body ?? {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const chatMsg = await ChatMessage.create({
      senderId: authUser._id,
      senderName: authUser.name || authUser.email,
      teamId,
      message: String(message).trim(),
      type: "team",
      replyTo: replyTo || null,
      status: "sent",
    });

    const io = req.app.get("io");
    if (io) {
      // Broadcast only to the chat-specific room. The legacy `team:<id>`
      // room is also joined by sockets (for non-chat broadcasts), but
      // emitting to BOTH would deliver chat messages twice to listeners.
      io.to(`chat:team:${teamId}`).emit("chat:team:new", chatMsg);
    }

    res.status(201).json(chatMsg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/chat/:messageId ─────────────────────────────────────────────────
router.patch("/chat/:messageId", requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }

    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { message } = req.body ?? {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const chatMsg = await ChatMessage.findOneAndUpdate(
      { _id: messageId, senderId: authUser._id, deletedAt: null },
      { $set: { message: String(message).trim(), editedAt: new Date() } },
      { new: true }
    );

    if (!chatMsg) {
      return res.status(404).json({ error: "Message not found or you are not the sender." });
    }

    res.json(chatMsg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/chat/:messageId ────────────────────────────────────────────────
router.delete("/chat/:messageId", requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }

    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const chatMsg = await ChatMessage.findOneAndUpdate(
      { _id: messageId, senderId: authUser._id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!chatMsg) {
      return res.status(404).json({ error: "Message not found or you are not the sender." });
    }

    res.json({ success: true, message: "Message deleted." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
