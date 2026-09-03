import { Router } from "express";
import mongoose from "mongoose";
import SkillVerification from "../models/SkillVerification.js";
import Team from "../models/Team.js";
import { requireAuth } from "../auth.js";
import { resolveAuthUser } from "./teams.js";

const router = Router();

// ── POST /api/skills/verify ────────────────────────────────────────────────────
// FIX 5F: Verification threshold = score >= 3 of totalQuestions AND
// totalQuestions must be 5. Backwards-compatible: if totalQuestions is not 5
// (legacy), keep the legacy 80% rule.
router.post("/skills/verify", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { skill, score, totalQuestions, difficulty, questions, attemptId } = req.body ?? {};

    if (!skill || !String(skill).trim()) {
      return res.status(400).json({ error: "Skill is required." });
    }
    if (typeof score !== "number" || score < 0) {
      return res.status(400).json({ error: "Score must be a non-negative number." });
    }
    const total = Number(totalQuestions) || 0;
    if (total < 1) {
      return res.status(400).json({ error: "totalQuestions must be at least 1." });
    }

    // FIX 5F — strict 3-of-5 threshold for 5-question quizzes.
    const verified = total === 5 ? score >= 3 : score / total >= 0.8;
    const percentage = Math.round((score / total) * 100);

    const verification = await SkillVerification.create({
      userId: authUser._id,
      skill: String(skill).trim(),
      score,
      totalQuestions: total,
      percentage,
      difficulty: ["beginner", "intermediate", "advanced"].includes(difficulty) ? difficulty : "intermediate",
      attemptId: attemptId || `verify_${Date.now()}_${authUser._id.toString()}`,
      verified,
      questions: Array.isArray(questions) ? questions.slice(0, 20) : [],
    });

    res.status(201).json({
      success: true,
      verification: {
        _id: verification._id,
        skill: verification.skill,
        score: verification.score,
        totalQuestions: verification.totalQuestions,
        percentage: verification.percentage,
        verified: verification.verified,
        difficulty: verification.difficulty,
        attemptId: verification.attemptId,
        createdAt: verification.createdAt,
      },
    });
  } catch (e) {
    console.error("[POST /skills/verify] Error:", e.message);
    res.status(500).json({ error: "We couldn't save your verification. Please try again." });
  }
});

// ── GET /api/skills/verifications ─────────────────────────────────────────────
router.get("/skills/verifications", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const verifications = await SkillVerification.find({ userId: authUser._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(verifications);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/skills/team/:teamId/graph ────────────────────────────────────────
router.get("/skills/team/:teamId/graph", requireAuth, async (req, res) => {
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

    const verifications = await SkillVerification.find({
      userId: { $in: team.members.map((m) => m.userId) },
    }).lean();

    const verificationMap = new Map();
    for (const v of verifications) {
      const key = `${v.userId.toString()}_${v.skill.toLowerCase().trim()}`;
      if (!verificationMap.has(key) || new Date(v.createdAt) > new Date(verificationMap.get(key).createdAt)) {
        verificationMap.set(key, v);
      }
    }

    const skillGraph = team.members.map((m) => {
      const userIdStr = m.userId?.toString?.() || m.userId?.toString?.() || "";
      const memberSkills = m.skills || { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 };
      const graph = {};
      for (const [skill, level] of Object.entries(memberSkills)) {
        const vKey = `${userIdStr}_${skill.toLowerCase().trim()}`;
        const v = verificationMap.get(vKey);
        graph[skill] = { level: typeof level === "number" ? level : 5, verified: Boolean(v?.verified) };
      }
      return {
        userId: userIdStr,
        name: m.name || "Member",
        role: m.role || "member",
        avatar: m.avatar || "",
        skills: graph,
      };
    });

    const allSkills = ["frontend", "backend", "devops", "design", "ml", "testing"];
    const teamCoverage = {};
    for (const skill of allSkills) {
      const levels = skillGraph.map((m) => m.skills[skill]?.level ?? 0);
      const verifiedCount = skillGraph.filter((m) => m.skills[skill]?.verified).length;
      const avgLevel = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
      const coverage = levels.filter((l) => l >= 7).length;
      teamCoverage[skill] = { avgLevel, coverage, verifiedCount, totalMembers: skillGraph.length };
    }

    res.json({
      teamId: team._id.toString(),
      teamName: team.name,
      members: skillGraph,
      coverage: teamCoverage,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/skills/team/:teamId/gaps ─────────────────────────────────────────
router.get("/skills/team/:teamId/gaps", requireAuth, async (req, res) => {
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

    const allSkills = ["frontend", "backend", "devops", "design", "ml", "testing"];
    const skillGraph = team.members.map((m) => {
      const memberSkills = m.skills || { frontend: 5, backend: 5, devops: 5, design: 5, ml: 5, testing: 5 };
      return Object.fromEntries(
        Object.entries(memberSkills).map(([k, v]) => [k.toLowerCase().trim(), typeof v === "number" ? v : 5])
      );
    });

    const gaps = [];
    const strengths = [];

    for (const skill of allSkills) {
      const levels = skillGraph.map((m) => m[skill] ?? 5);
      const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
      const max = Math.max(...levels);
      const min = Math.min(...levels);

      if (avg < 5) {
        gaps.push({
          skill,
          severity: avg < 3 ? "critical" : "warning",
          message: `${skill.charAt(0).toUpperCase() + skill.slice(1)} coverage is weak (avg ${avg.toFixed(1)}/10).`,
          recommendation: `Consider recruiting or upskilling team members in ${skill}.`,
        });
      } else if (avg >= 8) {
        strengths.push({
          skill,
          message: `${skill.charAt(0).toUpperCase() + skill.slice(1)} expertise is strong (avg ${avg.toFixed(1)}/10).`,
        });
      }

      if (min < 4 && max >= 7) {
        gaps.push({
          skill,
          severity: "info",
          message: `${skill.charAt(0).toUpperCase() + skill.slice(1)} skill exists but has not been verified by all members.`,
          recommendation: "Encourage members to complete skill verification quizzes.",
        });
      }
    }

    res.json({
      teamId: team._id.toString(),
      teamName: team.name,
      gaps,
      strengths,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
