import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";

import teamRoutes    from "./routes/teams.js";
import projectRoutes from "./routes/projects.js";   // NEXUSFLOW 2.0 — Phase 1
import { registerTaskHandlers } from "./socket/taskHandlers.js";
import { registerAiOrchestrator } from "./socket/aiOrchestrator.js";
import User from "./models/User.js";
import Team from "./models/Team.js";
import { sign, verify, requireAuth, formatUser } from "./auth.js";

const PORT = process.env.PORT ?? 4000;
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusflow";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://nexusflow-eta.vercel.app";

const app = express();
app.use(cors({ origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006", "http://localhost:8082", "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "15mb" })); // Support avatar uploads

// ── AUTHENTICATION ROUTES ────────────────────────────────────────────────────

// Helper for email regex validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup & POST /api/signup
const handleSignup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body ?? {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }
    if (!email || !EMAIL_REGEX.test(String(email).trim())) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    // Create user (password is automatically hashed via UserSchema pre-save hook)
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: String(password),
    });

    const token = sign(user);
    res.status(201).json({
      success: true,
      token,
      user: formatUser(user),
      message: "Account created successfully.",
    });
  } catch (err) {
    console.error("[SIGNUP] Error:", err.message);
    res.status(500).json({ error: "Failed to create account. Please try again." });
  }
};

app.post("/api/auth/signup", handleSignup);
app.post("/api/signup", handleSignup);

// POST /api/auth/login & POST /api/login
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      // Return 401 for bad credentials
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isMatch = await user.comparePassword(String(password));
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = sign(user);
    res.json({
      success: true,
      token,
      user: formatUser(user),
    });
  } catch (err) {
    console.error("[LOGIN] Error:", err.message);
    res.status(500).json({ error: "Login failed. Please check your credentials." });
  }
};

app.post("/api/auth/login", handleLogin);
app.post("/api/login", handleLogin);

// GET /api/me — Returns fresh user profile for authenticated session
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    if (mongoose.isValidObjectId(req.user.id)) {
      const user = await User.findById(req.user.id).lean();
      if (user) {
        return res.json(formatUser(user));
      }
    }
    // Fallback if ID is legacy email or user not in DB
    const fallbackUser = await User.findOne({ email: req.user.email }).lean();
    if (fallbackUser) {
      return res.json(formatUser(fallbackUser));
    }
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/me & PATCH /api/users/profile & PATCH /api/user/profile — Updates user profile & synchronizes
const handleUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!mongoose.isValidObjectId(userId)) {
      // Find by email if legacy
      const existingUser = await User.findOne({ email: req.user.email });
      if (!existingUser) return res.status(404).json({ error: "User not found" });
    }

    const allowed = ["name", "avatar", "bio", "role", "experience", "skills"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({ error: "Name cannot be empty." });
    }

    const filter = mongoose.isValidObjectId(userId) ? { _id: userId } : { email: req.user.email };
    const updatedUser = await User.findOneAndUpdate(
      filter,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Synchronize user name & avatar across team rosters where this user is a member
    if (updates.name || updates.avatar !== undefined) {
      try {
        const teamUpdates = {};
        if (updates.name) teamUpdates["members.$[elem].name"] = updates.name.trim();
        if (updates.avatar !== undefined) teamUpdates["members.$[elem].avatar"] = updates.avatar;

        await Team.updateMany(
          { "members.userId": updatedUser._id },
          { $set: teamUpdates },
          { arrayFilters: [{ "elem.userId": updatedUser._id }] }
        );
      } catch (syncErr) {
        console.warn("[Profile Sync] Warning: could not cascade to Team members:", syncErr.message);
      }
    }

    res.json({
      success: true,
      user: formatUser(updatedUser),
    });
  } catch (err) {
    console.error("[UPDATE PROFILE] Error:", err.message);
    res.status(500).json({ error: err.message || "Failed to update profile." });
  }
};

app.patch("/api/me", requireAuth, handleUpdateProfile);
app.patch("/api/users/profile", requireAuth, handleUpdateProfile);
app.patch("/api/user/profile", requireAuth, handleUpdateProfile);

app.use("/api", teamRoutes);
app.use("/api", projectRoutes);   // NEXUSFLOW 2.0 — Phase 1 project routes

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"] } });
app.set("io", io);

// Socket auth middleware: validate handshake token.
io.use((socket, next) => {
  const payload = verify(socket.handshake.auth?.token);
  if (!payload) return next(new Error("unauthorized"));
  socket.data.user = payload;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.user?.id || socket.data.user?._id;
  if (userId) {
    socket.join(`user:${userId}`);
  }
  if (socket.data.user?.email) {
    socket.join(`user:${socket.data.user.email.toLowerCase().trim()}`);
  }
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
