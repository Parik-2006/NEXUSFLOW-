/**
 * server/socket/chatHandlers.js
 * NEXUSFLOW 3.0 — Real-Time Chat Handlers
 */

import ChatMessage from "../models/ChatMessage.js";
import Team from "../models/Team.js";
import User from "../models/User.js";

export function registerChatHandlers(io, socket) {
  const userId = socket.data?.user?.id || socket.data?.user?._id;

  // Join global chat room automatically
  socket.join("chat:global");

  // Handle joining team chat room
  socket.on("chat:join_team", async ({ teamId }) => {
    try {
      if (!teamId || !userId) return;
      const team = await Team.findById(teamId).lean();
      if (!team) return;

      const isMember =
        team.members?.some(
          (m) => (m.userId?.toString?.() || m.userId?.toString?.()) === userId.toString()
        ) || team.ownerId?.toString() === userId.toString();

      if (isMember) {
        socket.join(`chat:team:${teamId}`);
      }
    } catch (e) {
      console.error("[chatHandlers] join_team error:", e.message);
    }
  });

  // Handle sending a global message via socket
  socket.on("chat:global:send", async ({ message, replyTo }, callback) => {
    try {
      if (!userId || !message || !String(message).trim()) {
        if (typeof callback === "function") callback({ error: "Invalid message" });
        return;
      }

      const user = await User.findById(userId).select("name email avatar").lean();
      const chatMsg = await ChatMessage.create({
        senderId: userId,
        senderName: user?.name || user?.email || "Unknown",
        message: String(message).trim(),
        type: "global",
        replyTo: replyTo || null,
        status: "sent",
      });

      io.to("chat:global").emit("chat:global:new", chatMsg);
      if (typeof callback === "function") callback({ success: true, data: chatMsg });
    } catch (e) {
      if (typeof callback === "function") callback({ error: e.message });
    }
  });

  // Handle sending a team message via socket
  socket.on("chat:team:send", async ({ teamId, message, replyTo }, callback) => {
    try {
      if (!userId || !teamId || !message || !String(message).trim()) {
        if (typeof callback === "function") callback({ error: "Invalid message" });
        return;
      }

      const team = await Team.findById(teamId).lean();
      if (!team) {
        if (typeof callback === "function") callback({ error: "Team not found" });
        return;
      }

      const isMember =
        team.members?.some(
          (m) => (m.userId?.toString?.() || m.userId?.toString?.()) === userId.toString()
        ) || team.ownerId?.toString() === userId.toString();

      if (!isMember) {
        if (typeof callback === "function") callback({ error: "Not a team member" });
        return;
      }

      const user = await User.findById(userId).select("name email avatar").lean();
      const chatMsg = await ChatMessage.create({
        senderId: userId,
        senderName: user?.name || user?.email || "Unknown",
        teamId,
        message: String(message).trim(),
        type: "team",
        replyTo: replyTo || null,
        status: "sent",
      });

      io.to(`chat:team:${teamId}`).emit("chat:team:new", chatMsg);
      if (typeof callback === "function") callback({ success: true, data: chatMsg });
    } catch (e) {
      if (typeof callback === "function") callback({ error: e.message });
    }
  });
}
