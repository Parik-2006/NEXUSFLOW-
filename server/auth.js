import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, {
    expiresIn: "7d",
  });
}

export function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Express middleware
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && verify(token);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  req.user = payload;
  next();
}
