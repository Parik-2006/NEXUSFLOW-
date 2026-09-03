/**
 * server/routes/ai.js
 * NEXUSFLOW 3.0 — AI quiz generation + submission ($0 OmniRoute only).
 *
 * FIX 5 (Combined Fixes 1–5):
 *  - Each quiz contains EXACTLY 5 MCQ questions.
 *  - Each question has EXACTLY 4 options, exactly 1 correct answer,
 *    and an explanation.
 *  - AI generation is OPTIONAL and validates its output before trusting it.
 *  - On any AI failure (or invalid output) we fall back to a deterministic
 *    5-question bank per skill — never blocks the user.
 *  - Verification threshold is 3 / 5 correct (NOT 80% of score).
 */
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth.js";
import { resolveAuthUser } from "./teams.js";

const router = Router();

// ── Deterministic 5-question bank per skill ─────────────────────────────────
// Each entry MUST have exactly 5 questions. Each question MUST have exactly
// 4 options, exactly 1 correctIndex, and an explanation.
const QUESTION_BANK = {
  JavaScript: [
    { question: "What does Array.prototype.map() return?",
      options: ["The original array", "A new array", "A boolean", "A single value"],
      correctIndex: 1,
      explanation: "map() always returns a new array of the same length as the source." },
    { question: "Which keyword declares a block-scoped variable that can be reassigned?",
      options: ["const", "let", "var", "static"],
      correctIndex: 1,
      explanation: "`let` is block-scoped and reassignable; `const` is block-scoped but immutable." },
    { question: "What is the output of: typeof null?",
      options: ["\"null\"", "\"object\"", "\"undefined\"", "\"boolean\""],
      correctIndex: 1,
      explanation: "This is a long-standing quirk in JavaScript — `typeof null === \"object\"`." },
    { question: "Which method removes the last element from an array?",
      options: ["shift()", "slice()", "splice()", "pop()"],
      correctIndex: 3,
      explanation: "`pop()` removes and returns the last element; `shift()` removes the first." },
    { question: "Which symbol is used to define a template literal?",
      options: ["Single quotes ''", "Double quotes \"\"", "Backticks ``", "Square brackets []"],
      correctIndex: 2,
      explanation: "Template literals use backticks and support interpolation via ${}." },
  ],
  TypeScript: [
    { question: "Which TypeScript syntax defines a string union?",
      options: ["string", "String", "\"a\" | \"b\"", "Union<string, string>"],
      correctIndex: 2,
      explanation: "Union types use the pipe operator: type T = \"a\" | \"b\"." },
    { question: "What does the `readonly` modifier do?",
      options: ["Makes a property optional", "Prevents reassignment after init", "Hides the property at runtime", "Converts to const"],
      correctIndex: 1,
      explanation: "`readonly` prevents writes to a property after it's set." },
    { question: "Which file extension is standard for TypeScript source?",
      options: [".js", ".ts", ".tsx only", ".d.ts"],
      correctIndex: 1,
      explanation: ".ts is the standard extension; .tsx adds JSX support." },
    { question: "How do you declare an array of numbers?",
      options: ["number[]", "Array<number>", "Both number[] and Array<number>", "list<number>"],
      correctIndex: 2,
      explanation: "Both syntaxes are valid and equivalent in TypeScript." },
    { question: "What does `unknown` differ from `any` in?",
      options: ["Nothing — they are identical", "unknown requires a type check before use", "any is stricter", "unknown cannot store values"],
      correctIndex: 1,
      explanation: "`unknown` is the type-safe counterpart of `any` — you must narrow it before use." },
  ],
  Python: [
    { question: "Which keyword defines a function in Python?",
      options: ["function", "def", "func", "define"],
      correctIndex: 1,
      explanation: "Python uses `def` to start a function definition." },
    { question: "Which data type is immutable in Python?",
      options: ["list", "dict", "tuple", "set"],
      correctIndex: 2,
      explanation: "Tuples are immutable sequences." },
    { question: "What is the correct file extension for Python files?",
      options: [".py", ".pt", ".pyt", ".python"],
      correctIndex: 0,
      explanation: ".py is the standard Python source extension." },
    { question: "Which operator performs floor division?",
      options: ["/", "//", "%", "**"],
      correctIndex: 1,
      explanation: "`//` is floor division — divides and rounds toward negative infinity." },
    { question: "How do you start a single-line comment in Python?",
      options: ["//", "#", "/*", "--"],
      correctIndex: 1,
      explanation: "Python uses the hash character # for comments." },
  ],
  Java: [
    { question: "What is the entry point of a Java program?",
      options: ["start()", "main()", "run()", "init()"],
      correctIndex: 1,
      explanation: "public static void main(String[] args) is the standard entry point." },
    { question: "Which keyword is used for inheritance in Java?",
      options: ["inherits", "extends", "implements", "super"],
      correctIndex: 1,
      explanation: "Classes use `extends`; interfaces use `implements`." },
    { question: "What does JVM stand for?",
      options: ["Java Variable Machine", "Java Virtual Machine", "Joint Variable Method", "Java Visual Manager"],
      correctIndex: 1,
      explanation: "JVM = Java Virtual Machine — the runtime that executes bytecode." },
    { question: "Which access modifier makes a member visible everywhere?",
      options: ["private", "protected", "package", "public"],
      correctIndex: 3,
      explanation: "`public` removes all access restrictions." },
    { question: "Which collection is ordered and allows duplicates?",
      options: ["Set", "Map", "List", "Queue"],
      correctIndex: 2,
      explanation: "List preserves insertion order and allows duplicate elements." },
  ],
  React: [
    { question: "Which hook is used for side effects in React?",
      options: ["useState", "useEffect", "useMemo", "useRef"],
      correctIndex: 1,
      explanation: "useEffect runs side effects after render." },
    { question: "How do you pass data from parent to child?",
      options: ["state", "props", "context", "refs"],
      correctIndex: 1,
      explanation: "Props are the canonical parent-to-child data channel." },
    { question: "What is JSX?",
      options: ["A different language", "A syntax extension to JavaScript", "A CSS framework", "A database query language"],
      correctIndex: 1,
      explanation: "JSX is a syntax extension that lets you write HTML-like code inside JavaScript." },
    { question: "What does `useState` return?",
      options: ["A single value", "A pair: current state + setter", "An object", "A promise"],
      correctIndex: 1,
      explanation: "useState returns [value, setValue]." },
    { question: "Which method renders a React component to the DOM?",
      options: ["React.mount()", "ReactDOM.render()", "React.show()", "ReactDOM.createRoot()"],
      correctIndex: 3,
      explanation: "React 18 uses ReactDOM.createRoot().render() to mount a component." },
  ],
  Angular: [
    { question: "Which decorator marks a class as an Angular component?",
      options: ["@Directive", "@Component", "@Injectable", "@NgModule"],
      correctIndex: 1,
      explanation: "@Component is required on a component class." },
    { question: "Which file ends in .spec.ts used for?",
      options: ["Routing config", "Component template", "Unit tests", "Styles"],
      correctIndex: 2,
      explanation: ".spec.ts files contain unit tests, typically run by Karma/Jasmine." },
    { question: "Which CLI command creates a new Angular component?",
      options: ["ng new component", "ng generate component", "ng add component", "ng make component"],
      correctIndex: 1,
      explanation: "ng generate component <name> (alias: ng g c <name>)." },
    { question: "Which binding sends data from component to template?",
      options: ["Event binding ()", "Property binding []", "Two-way [(ngModel)]", "String interpolation {{}}"],
      correctIndex: 3,
      explanation: "String interpolation {{ value }} displays component data in the template." },
    { question: "What is a service in Angular primarily used for?",
      options: ["Rendering templates", "Sharing logic and data", "Defining routes", "Styling components"],
      correctIndex: 1,
      explanation: "Services centralise business logic and data — usually provided via DI." },
  ],
  Vue: [
    { question: "Which Vue directive conditionally renders an element?",
      options: ["v-if", "v-show", "v-for", "v-bind"],
      correctIndex: 0,
      explanation: "v-if removes the element from the DOM; v-show toggles display only." },
    { question: "Which directive binds an attribute reactively?",
      options: ["v-on", "v-model", "v-bind", "v-html"],
      correctIndex: 2,
      explanation: "v-bind (or :) binds a JS expression to an attribute." },
    { question: "How do you define reactive data in a Vue 3 component?",
      options: ["data()", "setup() + ref()", "props", "computed"],
      correctIndex: 1,
      explanation: "Vue 3 composition API uses setup() with ref() / reactive()." },
    { question: "What is the Vue instance lifecycle hook called after mount?",
      options: ["created", "mounted", "updated", "destroyed"],
      correctIndex: 1,
      explanation: "mounted() runs after the component is added to the DOM." },
    { question: "Which two-way binding directive does Vue provide?",
      options: ["v-model", "v-bind", "v-on", "v-if"],
      correctIndex: 0,
      explanation: "v-model creates two-way binding on form inputs." },
  ],
  "Node.js": [
    { question: "What is Node.js?",
      options: ["A database", "A JavaScript runtime", "A frontend framework", "An operating system"],
      correctIndex: 1,
      explanation: "Node.js executes JavaScript outside the browser using V8." },
    { question: "Which module creates an HTTP server in Node.js?",
      options: ["http", "server", "net", "url"],
      correctIndex: 0,
      explanation: "The built-in `http` module exposes createServer()." },
    { question: "What is npm?",
      options: ["Node Project Manager", "Node Package Manager", "New Package Module", "Node Programming Module"],
      correctIndex: 1,
      explanation: "npm is the Node Package Manager — the default package registry." },
    { question: "Which method reads a file asynchronously in modern Node?",
      options: ["fs.readFileSync()", "fs.readFile()", "fs.open()", "fs.read()"],
      correctIndex: 1,
      explanation: "fs.readFile (callback) or fs.promises.readFile (promise) — async vs sync." },
    { question: "Which keyword is used to import an ES module?",
      options: ["require()", "include", "import", "using"],
      correctIndex: 2,
      explanation: "ES modules use `import`; CommonJS uses require()." },
  ],
  SQL: [
    { question: "What does SQL stand for?",
      options: ["Structured Query Language", "Simple Query Language", "Standard Query Logic", "System Query Language"],
      correctIndex: 0,
      explanation: "SQL = Structured Query Language." },
    { question: "Which clause filters rows?",
      options: ["ORDER BY", "WHERE", "GROUP BY", "HAVING"],
      correctIndex: 1,
      explanation: "WHERE filters rows before grouping; HAVING filters groups." },
    { question: "What is a primary key?",
      options: ["A duplicate value", "A unique identifier", "A foreign reference", "A table name"],
      correctIndex: 1,
      explanation: "A primary key uniquely identifies each row." },
    { question: "Which join returns rows present in both tables?",
      options: ["LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN"],
      correctIndex: 2,
      explanation: "INNER JOIN keeps only matching rows from both sides." },
    { question: "Which command removes a table and its data?",
      options: ["DELETE", "TRUNCATE", "DROP", "REMOVE"],
      correctIndex: 2,
      explanation: "DROP TABLE removes the table definition and all data." },
  ],
  Docker: [
    { question: "What is Docker primarily used for?",
      options: ["Version control", "Containerisation", "Monitoring", "Load balancing"],
      correctIndex: 1,
      explanation: "Docker packages applications into portable containers." },
    { question: "Which command lists running containers?",
      options: ["docker ps", "docker list", "docker images", "docker status"],
      correctIndex: 0,
      explanation: "docker ps shows running containers; -a shows all." },
    { question: "Which file describes a Docker image build?",
      options: ["docker.yml", "Dockerfile", "compose.yaml", "image.cfg"],
      correctIndex: 1,
      explanation: "A Dockerfile is the canonical build script." },
    { question: "Which command pulls an image from a registry?",
      options: ["docker fetch", "docker pull", "docker get", "docker download"],
      correctIndex: 1,
      explanation: "`docker pull <image>` fetches from Docker Hub by default." },
    { question: "Which instruction sets the base image in a Dockerfile?",
      options: ["FROM", "BASE", "IMAGE", "INCLUDE"],
      correctIndex: 0,
      explanation: "`FROM image:tag` starts every Dockerfile." },
  ],
  Kubernetes: [
    { question: "What is the smallest deployable unit in Kubernetes?",
      options: ["Container", "Pod", "Node", "Cluster"],
      correctIndex: 1,
      explanation: "A Pod wraps one or more containers that share network and storage." },
    { question: "Which object provides a stable network identity?",
      options: ["Deployment", "Service", "Pod", "ConfigMap"],
      correctIndex: 1,
      explanation: "A Service gives pods a fixed virtual IP and DNS name." },
    { question: "Which command lists pods in the current namespace?",
      options: ["kubectl get pods", "kubectl pods", "kubectl list pods", "kubectl show pods"],
      correctIndex: 0,
      explanation: "`kubectl get pods` (or -A for all namespaces)." },
    { question: "Which controller manages stateless workloads?",
      options: ["StatefulSet", "Deployment", "DaemonSet", "Job"],
      correctIndex: 1,
      explanation: "Deployments manage stateless replicated pods." },
    { question: "What does a ConfigMap store?",
      options: ["Container images", "Non-confidential config data", "TLS certificates only", "Binaries"],
      correctIndex: 1,
      explanation: "ConfigMaps hold non-secret configuration." },
  ],
  AWS: [
    { question: "Which AWS service is object storage?",
      options: ["EBS", "EFS", "S3", "FSx"],
      correctIndex: 2,
      explanation: "Amazon S3 is the object storage service." },
    { question: "Which service runs code without provisioning servers?",
      options: ["EC2", "Lambda", "ECS", "Lightsail"],
      correctIndex: 1,
      explanation: "AWS Lambda runs functions in response to events." },
    { question: "Which database is AWS managed NoSQL key-value?",
      options: ["RDS", "Aurora", "DynamoDB", "Redshift"],
      correctIndex: 2,
      explanation: "DynamoDB is a managed key-value and document database." },
    { question: "Which service delivers content globally with low latency?",
      options: ["Route 53", "CloudFront", "API Gateway", "Direct Connect"],
      correctIndex: 1,
      explanation: "CloudFront is AWS's CDN." },
    { question: "Which tool manages AWS infrastructure as code?",
      options: ["CloudFormation", "CodeDeploy", "CodeBuild", "CodeStar"],
      correctIndex: 0,
      explanation: "CloudFormation (and CDK) define infra as code." },
  ],
  Figma: [
    { question: "Which Figma layer type holds vector shapes?",
      options: ["Frame", "Group", "Vector", "Text"],
      correctIndex: 2,
      explanation: "Vectors hold editable vector path data." },
    { question: "Which view restricts layers you can interact with?",
      options: ["Prototype", "Inspect", "Dev Mode", "Comment"],
      correctIndex: 2,
      explanation: "Dev Mode (formerly Inspect) gives developers read-only specs." },
    { question: "Which feature creates multiple artboards for screen designs?",
      options: ["Components", "Frames", "Variants", "Auto-layout"],
      correctIndex: 1,
      explanation: "Frames (F) are reusable artboards for screens." },
    { question: "What does Auto-layout do?",
      options: ["Locks layers", "Dynamically resizes children", "Exports assets", "Generates code"],
      correctIndex: 1,
      explanation: "Auto-layout arranges children dynamically based on rules." },
    { question: "Which shortcut creates a Frame in Figma?",
      options: ["F", "A", "R", "O"],
      correctIndex: 0,
      explanation: "Press F to create a Frame." },
  ],
  TensorFlow: [
    { question: "What is a Tensor in TensorFlow?",
      options: ["A scalar only", "An n-dimensional array", "A database row", "A graph node"],
      correctIndex: 1,
      explanation: "Tensors are n-dimensional arrays — the core data structure." },
    { question: "Which API is the high-level Keras interface in TF 2.x?",
      options: ["tf.keras", "tf.layers", "tf.estimator", "tf.contrib"],
      correctIndex: 0,
      explanation: "tf.keras is the official high-level API in TF 2.x." },
    { question: "Which loss is standard for binary classification?",
      options: ["MSE", "Binary cross-entropy", "Hinge", "Categorical CE"],
      correctIndex: 1,
      explanation: "Binary cross-entropy pairs with sigmoid output for binary tasks." },
    { question: "Which optimiser adapts learning rates per parameter?",
      options: ["SGD", "Adam", "Adagrad", "RMSProp"],
      correctIndex: 1,
      explanation: "Adam combines momentum and adaptive learning rates." },
    { question: "Which method trains a Keras model?",
      options: ["model.fit()", "model.train()", "model.run()", "model.learn()"],
      correctIndex: 0,
      explanation: "model.fit(x, y, epochs=...) trains the model." },
  ],
  PyTorch: [
    { question: "Which class is the base for all neural networks?",
      options: ["torch.Model", "torch.nn.Module", "torch.Network", "torch.Layer"],
      correctIndex: 1,
      explanation: "torch.nn.Module is the base class for models." },
    { question: "Which method performs one optimiser step?",
      options: ["optimizer.step()", "optimizer.update()", "optimizer.apply()", "optimizer.run()"],
      correctIndex: 0,
      explanation: "optimizer.step() applies the gradients after loss.backward()." },
    { question: "Which call clears previous gradients?",
      options: ["loss.reset()", "optimizer.zero_grad()", "model.zero()", "grad.clear()"],
      correctIndex: 1,
      explanation: "optimizer.zero_grad() (or model.zero_grad()) zeroes grads." },
    { question: "Which library is common for PyTorch image work?",
      options: ["torchvision", "torchaudio", "torchtext", "torcharrow"],
      correctIndex: 0,
      explanation: "torchvision provides datasets, transforms, and models for vision." },
    { question: "Which function moves a tensor to GPU?",
      options: [".to(device)", ".gpu()", ".cuda()", ".device()"],
      correctIndex: 0,
      explanation: "tensor.to('cuda' or device) moves data to GPU." },
  ],
};

// Category fallback → pick from these when no exact skill match
const CATEGORY_FALLBACK = {
  Frontend: "JavaScript",
  Backend:  "Node.js",
  DevOps:   "Docker",
  Design:   "Figma",
  "AI / ML": "TensorFlow",
  Testing:  "JavaScript",
};

// Normalise input → pick the right bank
function bankForSkill(raw) {
  const skill = String(raw || "").trim();
  if (QUESTION_BANK[skill]) return QUESTION_BANK[skill];
  // Try title-case variations
  const tc = skill
    .split(/[\s/]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  if (QUESTION_BANK[tc]) return QUESTION_BANK[tc];
  // Loose contains
  const key = Object.keys(QUESTION_BANK).find(
    (k) => k.toLowerCase() === skill.toLowerCase()
  );
  if (key) return QUESTION_BANK[key];
  // Category fallback
  for (const [cat, def] of Object.entries(CATEGORY_FALLBACK)) {
    if (skill.toLowerCase().includes(cat.toLowerCase())) return QUESTION_BANK[def];
  }
  // Last resort: JavaScript
  return QUESTION_BANK.JavaScript;
}

// Validate an AI-generated quiz structure
function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== "object") return false;
  const qs = Array.isArray(quiz.questions) ? quiz.questions : null;
  if (!qs || qs.length !== 5) return false;
  for (const q of qs) {
    if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (q.options.some((o) => typeof o !== "string" || !o.trim())) return false;
    if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) return false;
  }
  return true;
}

// Try the (optional) AI path. Never throws or blocks.
async function tryGenerateAI(skill, difficulty) {
  try {
    const { omniRouteGenerate } = await import("../services/omniRoute.js");
    const result = await omniRouteGenerate({
      prompt:
        `Generate exactly 5 multiple-choice questions for ${skill} at ${difficulty} level. ` +
        `Return strict JSON: { "questions": [ { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0-3 } ] }`,
      model: "gemini-1.5-flash",
      maxOutputTokens: 1500,
      timeoutMs: 12000,
      responseMimeType: "application/json",
    });
    let parsed = null;
    if (typeof result?.text === "string") {
      try { parsed = JSON.parse(result.text); } catch {}
    }
    parsed = parsed || result?.json || result?.data;
    if (validateQuiz(parsed)) return parsed;
  } catch {
    // swallow — fallback below
  }
  return null;
}

// ── POST /api/ai/quiz/generate ─────────────────────────────────────────────────
router.post("/ai/quiz/generate", requireAuth, async (req, res) => {
  try {
    const { skill, difficulty = "intermediate" } = req.body ?? {};
    if (!skill || !String(skill).trim()) {
      return res.status(400).json({ error: "Skill is required." });
    }
    const skillKey = String(skill).trim();

    // 1. Try AI (optional)
    const ai = await tryGenerateAI(skillKey, difficulty);
    if (ai) {
      const quiz = {
        skill: skillKey,
        difficulty,
        questionCount: 5,
        questions: ai.questions.map((q, i) => ({
          index: i,
          question: q.question,
          options: q.options,
        })),
        source: "ai",
      };
      return res.json({ success: true, quiz });
    }

    // 2. Deterministic fallback (always works)
    const bank = bankForSkill(skillKey);
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    const quiz = {
      skill: skillKey,
      difficulty,
      questionCount: 5,
      questions: shuffled.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options,
      })),
      source: "fallback",
    };
    res.json({ success: true, quiz });
  } catch (e) {
    res.status(500).json({ error: "We couldn't generate your quiz right now. Please try again." });
  }
});

// ── POST /api/ai/quiz/submit ──────────────────────────────────────────────────
// FIX 5F: Verification threshold = 3 / 5 (NOT 80%).
router.post("/ai/quiz/submit", requireAuth, async (req, res) => {
  try {
    const authUser = await resolveAuthUser(req.user);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const { skill, answers, difficulty, questions } = req.body ?? {};
    if (!skill || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Skill and answers array are required." });
    }
    if (answers.length !== 5) {
      return res.status(400).json({ error: "Quiz must have exactly 5 answers." });
    }
    const skillKey = String(skill).trim();
    const bank = bankForSkill(skillKey);

    // Scoring: prefer validating against the bank (always deterministic).
    // We trust answers[i] only when 0 <= answer <= 3.
    let correct = 0;
    const detail = [];
    for (let i = 0; i < 5; i++) {
      const a = answers[i];
      const expected = bank[i]?.correctIndex ?? -1;
      const ok = typeof a === "number" && a === expected;
      if (ok) correct++;
      detail.push({
        questionIndex: i,
        questionText: bank[i]?.question || (questions && questions[i]?.question) || "",
        userAnswer: a,
        correctIndex: expected,
        correct: ok,
        explanation: bank[i]?.explanation || "",
      });
    }
    const verified = correct >= 3;
    res.json({
      success: true,
      result: {
        skill: skillKey,
        score: correct,
        total: 5,
        verified,
        threshold: 3,
        difficulty: difficulty || "intermediate",
        detail,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "We couldn't score your quiz right now. Please try again." });
  }
});

export default router;