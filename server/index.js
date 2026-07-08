import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";

import teamRoutes from "./routes/teams.js";
import { registerTaskHandlers } from "./socket/taskHandlers.js";
import { registerAiOrchestrator } from "./socket/aiOrchestrator.js";
import { sign, verify, requireAuth } from "./auth.js";

const PORT = process.env.PORT ?? 4000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://nexusflow-eta.vercel.app";

const app = express();
app.use(cors({ origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"], credentials: true }));
app.use(express.json());

// --- Dev auth: issues a JWT for any credentials (replace with real auth). ---
app.post("/api/login", (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "email required" });
  const user = { id: email, email, name: email.split("@")[0] };
  res.json({ token: sign(user), user });
});

app.get("/api/me", requireAuth, (req, res) => res.json(req.user));
app.use("/api", teamRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"] } });

// Socket auth middleware: validate handshake token.
io.use((socket, next) => {
  const payload = verify(socket.handshake.auth?.token);
  if (!payload) return next(new Error("unauthorized"));
  socket.data.user = payload;
  next();
});

io.on("connection", (socket) => {
  registerTaskHandlers(io, socket);
  registerAiOrchestrator(io, socket);
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`NexusFlow server on :${PORT}`));
  })
  .catch((err) => {
    console.error("Mongo connection failed:", err.message);
    // Still start the HTTP/socket server so the app boots in dev.
    server.listen(PORT, () => console.log(`NexusFlow server on :${PORT} (no DB)`));
  });
