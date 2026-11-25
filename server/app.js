/**
 * server/app.js — Express app + Socket.IO wiring (no DB connect, no listen).
 * Imported by index.js for runtime and by the isolated test suite.
 */
import express from "express";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";

import authRoutes    from "./routes/auth.js";         // NEXUSFLOW 3.0 — Google OAuth + forgot password
import chatRoutes   from "./routes/chat.js";           // NEXUSFLOW 3.0 — Chat system
import skillsRoutes from "./routes/skills.js";         // NEXUSFLOW 3.0 — Skill verification + graph
import aiRoutes     from "./routes/ai.js";             // NEXUSFLOW 3.0 — AI quiz generation
import userLookupRoutes from "./routes/userLookup.js"; // NEXUSFLOW 3.0 — Workspace email lookup (Fix 4)
import teamRoutes   from "./routes/teams.js";
import lifecycleRoutes from "./routes/lifecycle.js"; // Phase 2 — Trash / restore / purge
import projectRoutes from "./routes/projects.js";   // NEXUSFLOW 2.0 — Phase 1
import githubRoutes  from "./routes/github.js";      // NEXUSFLOW 3.0 — Phase 11
import discoveryRoutes from "./routes/discovery.js"; // NEXUSFLOW 4.0 — Open Team Discovery & Applications
import scrumRoutes from "./routes/scrum.js";           // NEXUSFLOW 4.0 — Scrum Methodology Engine
import kanbanRoutes from "./routes/kanban.js";         // NEXUSFLOW 4.0 — Kanban Continuous Flow Engine
import hybridRoutes from "./routes/hybrid.js";         // NEXUSFLOW 4.0 — Hybrid Methodology Engine
import workstreams21to25Routes from "./routes/workstreams21to25.js"; // NEXUSFLOW 4.0 — Workstreams 21-25
import { registerTaskHandlers } from "./socket/taskHandlers.js";
import { registerAiOrchestrator } from "./socket/aiOrchestrator.js";
import { registerProjectSyncHandlers } from "./socket/projectSyncHandlers.js"; // NEXUSFLOW 3.0 — Phase 10
import { registerChatHandlers } from "./socket/chatHandlers.js";               // NEXUSFLOW 3.0 — Chat
import User from "./models/User.js";
import Team from "./models/Team.js";
import { sign, verify, verifySession, requireAuth, formatUser } from "./auth.js";
import { validatePassword } from "./utils/passwordPolicy.js";
import { getAuthUserId } from "./utils/identity.js";
import { logger } from "./utils/logger.js";            // NEXUSFLOW 3.0 — Phase 19
import { authLimits, loginFailures, sendRateLimited } from "./utils/rateLimiter.js"; // Phase 2 auth rate limits

export const getFrontendUrl = () => {
  const url = process.env.FRONTEND_URL || "";
  if (!url || url.includes("your-frontend") || url.includes("example.com")) {
    return "http://localhost:8081";
  }
  return url.replace(/\/+$/, "");
};
const FRONTEND_URL = getFrontendUrl();

export const app = express();

// Phase 2 (Task 2): only trust X-Forwarded-For from known proxy hops, so
// clients cannot spoof their IP to dodge rate limits. TRUST_PROXY = number of
// proxy hops (Render: 1). Default: no proxy trusted (direct connections).
{
  const hops = Number.parseInt(process.env.TRUST_PROXY ?? (process.env.RENDER ? "1" : "0"), 10);
  app.set("trust proxy", Number.isFinite(hops) && hops > 0 ? hops : false);
}
app.use(cors({ origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006", "http://localhost:8082", "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "15mb" })); // Support avatar uploads

// Forward root requests to the Frontend application (handles OAuth redirects & direct visits)
app.get("/", (req, res) => {
  const target = getFrontendUrl();
  const query = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  res.redirect(`${target}/${query}`);
});

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
    const passwordError = validatePassword(typeof password === "string" ? password : "");
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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

app.post("/api/auth/signup", authLimits.signupIp, handleSignup);
app.post("/api/signup", authLimits.signupIp, handleSignup);

// POST /api/auth/login & POST /api/login
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase().slice(0, 254);
    // Per-account failed-attempt limit (temporary; counts failures only). The
    // key is the submitted email whether or not the account exists.
    const failKey = `login-fail:${normalizedEmail}`;
    const wait = loginFailures.check(failKey);
    if (wait > 0) return sendRateLimited(res, wait);

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    const isMatch = user ? await user.comparePassword(String(password)) : false;
    if (!user || !isMatch) {
      loginFailures.hit(failKey);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    loginFailures.reset(failKey);

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

app.post("/api/auth/login", authLimits.loginIp, handleLogin);
app.post("/api/login", authLimits.loginIp, handleLogin);

// GET /api/me — Returns fresh user profile for authenticated session
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    // Identity comes only from the verified token id (no email fallback).
    const user = await User.findById(getAuthUserId(req.user)).lean();
    if (!user) return res.status(401).json({ error: "Unauthorized: account not found" });
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/me & PATCH /api/users/profile & PATCH /api/user/profile — Updates user profile & synchronizes
const handleUpdateProfile = async (req, res) => {
  try {
    const userId = getAuthUserId(req.user);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

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

    const filter = { _id: userId };
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

app.use("/api", authRoutes);       // NEXUSFLOW 3.0 — Google OAuth + forgot password
app.use("/api", chatRoutes);       // NEXUSFLOW 3.0 — Chat system
app.use("/api", skillsRoutes);     // NEXUSFLOW 3.0 — Skills
app.use("/api", aiRoutes);         // NEXUSFLOW 3.0 — AI quiz
app.use("/api", userLookupRoutes); // NEXUSFLOW 3.0 — Workspace email lookup (Fix 4)
app.use("/api", lifecycleRoutes);
app.use("/api", teamRoutes);
app.use("/api", projectRoutes);   // NEXUSFLOW 2.0 — Phase 1 project routes
app.use(projectRoutes);          // Dual-mount contract: supports both /api/projects and /projects
app.use("/api", githubRoutes);    // NEXUSFLOW 3.0 — Phase 11 GitHub integration
app.use("/api", discoveryRoutes); // NEXUSFLOW 4.0 — Discovery & Applications
app.use("/api/scrum", requireAuth, scrumRoutes); // NEXUSFLOW 4.0 — Scrum Methodology
app.use("/api/kanban", requireAuth, kanbanRoutes); // NEXUSFLOW 4.0 — Kanban Continuous Flow
app.use("/api/hybrid", requireAuth, hybridRoutes); // NEXUSFLOW 4.0 — Hybrid Methodology Engine
app.use("/api", workstreams21to25Routes);          // NEXUSFLOW 4.0 — Workstreams 21–25 Learning, Capability, Decisions, Health

export const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: [FRONTEND_URL, "http://localhost:8081", "http://localhost:19006"] } });
app.set("io", io);

// Socket auth middleware: validate handshake token.
io.use(async (socket, next) => {
  // Same session check as REST: signature + current tokenVersion (Phase 2).
  const payload = await verifySession(socket.handshake.auth?.token);
  if (!payload) return next(new Error("unauthorized"));
  socket.data.user = payload;
  next();
});

io.on("connection", (socket) => {
  // Phase 1 (Task 4): normalize event payloads before any handler runs. Many
  // handlers destructure their first argument; a missing/primitive payload
  // would otherwise reject the async handler (and Node exits on unhandled
  // rejections). Identity is never read from payloads — only socket.data.user.
  socket.use((packet, next) => {
    if (packet.length < 2 || typeof packet[1] === "function") packet.splice(1, 0, {});
    else if (packet[1] === null || typeof packet[1] !== "object" || Array.isArray(packet[1])) packet[1] = {};
    next();
  });

  const userId = socket.data.user?.id || socket.data.user?._id;
  if (userId) {
    socket.join(`user:${userId}`);
  }
  if (socket.data.user?.email) {
    socket.join(`user:${socket.data.user.email.toLowerCase().trim()}`);
  }
  registerTaskHandlers(io, socket);
  registerAiOrchestrator(io, socket);
  registerProjectSyncHandlers(io, socket); // NEXUSFLOW 3.0 — Phase 10 project sync
  registerChatHandlers(io, socket);        // NEXUSFLOW 3.0 — Chat system
});

