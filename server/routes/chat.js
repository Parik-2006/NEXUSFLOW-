import { Router } from "express";
import mongoose from "mongoose";
import ChatMessage from "../models/ChatMessage.js";
import Team from "../models/Team.js";
import { requireAuth } from "../auth.js";
import { resolveAuthUser } from "./teams.js";

const router = Router();

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
      io.to(`team:${teamId}`).emit("chat:team:new", chatMsg);
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
