import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "nexusflow-production-jwt-secret-key-2026";

export function sign(user) {
  const id = (user._id || user.id)?.toString();
  return jwt.sign({ id, email: user.email, name: user.name }, SECRET, {
    expiresIn: "7d",
  });
}

export function verify(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Format sanitized User object for client responses
export function formatUser(user) {
  if (!user) return null;
  return {
    id: (user._id || user.id)?.toString(),
    _id: (user._id || user.id)?.toString(),
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    bio: user.bio || "",
    role: user.role || "Product Builder",
    experience: user.experience || "Mid-level",
    skills: user.skills || ["Frontend"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Express middleware
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const payload = token && verify(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized: Invalid or missing token" });
  req.user = payload;
  next();
}

