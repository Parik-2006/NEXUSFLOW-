import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { requireAuth } from "../auth.js";

const router = Router();

const FALLBACK_QUESTIONS = {
  Frontend: [
    { question: "What does HTML stand for?", options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Language", "Home Tool Markup Language"], correctIndex: 0 },
    { question: "Which CSS property controls text size?", options: ["text-style", "font-size", "text-size", "font-style"], correctIndex: 1 },
    { question: "What is the DOM?", options: ["Data Object Model", "Document Object Model", "Digital Output Module", "Document Oriented Model"], correctIndex: 1 },
  ],
  Backend: [
    { question: "What does API stand for?", options: ["Application Programming Interface", "Advanced Protocol Integration", "Automated Program Interaction", "Application Process Integration"], correctIndex: 0 },
    { question: "What is a REST API?", options: ["Remote Execution Service", "Representational State Transfer", "Runtime Execution Service Transfer", "Remote State Transfer"], correctIndex: 1 },
    { question: "Which HTTP method is typically used to update a resource?", options: ["GET", "POST", "PUT", "DELETE"], correctIndex: 2 },
  ],
  Python: [
    { question: "Which keyword defines a function in Python?", options: ["function", "def", "func", "define"], correctIndex: 1 },
    { question: "What is the correct file extension for Python files?", options: [".py", ".pt", ".pyt", ".python"], correctIndex: 0 },
    { question: "Which data type is immutable in Python?", options: ["List", "Dictionary", "Tuple", "Set"], correctIndex: 2 },
  ],
  JavaScript: [
    { question: "Which symbol is used for comments in JavaScript?", options: ["<!-- -->", "//", "#", "/* */"], correctIndex: 1 },
    { question: "What does 'NaN' stand for?", options: ["Not a Null", "Not a Number", "New and Null", "None and None"], correctIndex: 1 },
    { question: "Which method converts a JSON string to an object?", options: ["JSON.stringify()", "JSON.parse()", "JSON.toObject()", "JSON.convert()"], correctIndex: 1 },
  ],
  React: [
    { question: "What hook is used for side effects in React?", options: ["useState", "useContext", "useEffect", "useReducer"], correctIndex: 2 },
    { question: "How do you pass data to a child component?", options: ["State", "Props", "Context", "Hooks"], correctIndex: 1 },
    { question: "What is JSX?", options: ["JavaScript XML", "Java Syntax Extension", "JSON XML", "JavaScript Extra"], correctIndex: 0 },
  ],
  "Node.js": [
    { question: "What is Node.js?", options: ["A database", "A JavaScript runtime", "A frontend framework", "An operating system"], correctIndex: 1 },
    { question: "Which module is used to create an HTTP server in Node.js?", options: ["http", "server", "net", "url"], correctIndex: 0 },
    { question: "What is npm?", options: ["Node Project Manager", "Node Package Manager", "New Package Module", "Node Programming Module"], correctIndex: 1 },
  ],
  SQL: [
    { question: "What does SQL stand for?", options: ["Structured Query Language", "Simple Query Language", "Standard Query Logic", "System Query Language"], correctIndex: 0 },
    { question: "Which SQL clause filters results?", options: ["ORDER BY", "WHERE", "GROUP BY", "HAVING"], correctIndex: 1 },
    { question: "What is a primary key?", options: ["A duplicate value", "A unique identifier", "A foreign reference", "A table name"], correctIndex: 1 },
  ],
  "Machine Learning": [
    { question: "What is supervised learning?", options: ["Learning without labels", "Learning with labeled data", "Learning by reinforcement", "Learning from raw data"], correctIndex: 1 },
    { question: "Which algorithm is used for classification?", options: ["Linear Regression", "K-Means", "Logistic Regression", "PCA"], correctIndex: 2 },
    { question: "What is overfitting?", options: ["Model performs well on all data", "Model learns training data too well", "Model is too simple", "Model has no bias"], correctIndex: 1 },
  ],
  DevOps: [
    { question: "What does CI/CD stand for?", options: ["Continuous Integration/Continuous Deployment", "Code Integration/Code Deployment", "Continuous Improvement/Continuous Development", "Computer Integration/Computer Deployment"], correctIndex: 0 },
    { question: "What is Docker?", options: ["A programming language", "A containerization platform", "A database", "An OS"], correctIndex: 1 },
    { question: "What is Kubernetes?", options: ["A programming language", "A container orchestration platform", "A database", "A CI tool"], correctIndex: 1 },
  ],
  Testing: [
    { question: "What is unit testing?", options: ["Testing the whole system", "Testing individual components", "Testing the UI", "Testing performance"], correctIndex: 1 },
    { question: "What does TDD stand for?", options: ["Test Driven Development", "Test Data Design", "Technical Development Document", "Total Design Definition"], correctIndex: 0 },
    { question: "What is a test case?", options: ["A bug report", "A set of conditions to test", "A test suite", "A test plan"], correctIndex: 1 },
  ],
  Design: [
    { question: "What is a wireframe?", options: ["A finished design", "A low-fidelity layout", "A color palette", "A typography scale"], correctIndex: 1 },
    { question: "What does UX stand for?", options: ["User Experience", "User Exchange", "Universal Experience", "User Extension"], correctIndex: 0 },
    { question: "What is a prototype?", options: ["Final product", "An early sample for testing", "A bug", "A database"], correctIndex: 1 },
  ],
  Java: [
    { question: "What is the entry point of a Java program?", options: ["main() method", "start() method", "run() method", "init() method"], correctIndex: 0 },
    { question: "Which keyword is used for inheritance in Java?", options: ["implements", "inherits", "extends", "super"], correctIndex: 2 },
    { question: "What is JVM?", options: ["Java Variable Machine", "Java Virtual Machine", "Joint Variable Method", "Java Visual Manager"], correctIndex: 1 },
  ],
};

// ── POST /api/ai/quiz/generate ─────────────────────────────────────────────────
router.post("/ai/quiz/generate", requireAuth, async (req, res) => {
  try {
    const { skill, difficulty = "intermediate", questionCount = 5 } = req.body ?? {};

    if (!skill || !String(skill).trim()) {
      return res.status(400).json({ error: "Skill is required." });
    }
    const skillKey = String(skill).trim();
    const count = Math.min(Math.max(Number(questionCount) || 5, 1), 20);

    let questions = FALLBACK_QUESTIONS[skillKey] || FALLBACK_QUESTIONS["Frontend"] || [];
    const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, count);

    const quiz = {
      skill: skillKey,
      difficulty,
      questionCount: shuffled.length,
      questions: shuffled.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options,
      })),
      source: "fallback",
    };

    res.json({ success: true, quiz });
  } catch (e) {
    console.error("[Quiz Generate] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ai/quiz/submit ──────────────────────────────────────────────────
router.post("/ai/quiz/submit", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { skill, answers, questionCount, difficulty } = req.body ?? {};
    if (!skill || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Skill and answers array are required." });
    }

    const skillKey = String(skill).trim();
    const fallback = FALLBACK_QUESTIONS[skillKey] || FALLBACK_QUESTIONS["Frontend"] || [];
    const correctCount = answers.filter((a, i) => a === (fallback[i]?.correctIndex ?? -1)).length;
    const total = Math.max(answers.length, questionCount || answers.length);
    const percentage = Math.round((correctCount / total) * 100);
    const verified = percentage >= 80;

    res.json({
      success: true,
      result: {
        skill: skillKey,
        score: correctCount,
        totalQuestions: total,
        percentage,
        verified,
        difficulty: difficulty || "intermediate",
      },
    });
  } catch (e) {
    console.error("[Quiz Submit] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Helper ─────────────────────────────────────────────────────────────────────
async function resolveAuthUser(reqUser) {
  if (!reqUser) return null;
  const rawId = reqUser._id || reqUser.id;
  if (rawId && mongoose.isValidObjectId(rawId)) {
    const user = await User.findById(rawId).select("_id name email avatar").lean();
    return user || null;
  }
  const email = (reqUser.email || "").toLowerCase().trim();
  if (!email) return null;
  const user = await User.findOne({ email }).select("_id name email avatar").lean();
  return user || null;
}

export default router;
