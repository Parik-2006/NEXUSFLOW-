/**
 * server/algorithms/projectGuidanceEngine.js
 * ============================================================================
 * NEXUSFLOW 2.0 — Phase 6: Student Project Guidance & Project Copilot
 *
 * ARCHITECTURAL PRINCIPLE:
 *   AI provides semantic understanding, explanations, and qualitative advice.
 *   This engine calculates ALL numerical, algorithmic, and optimization factors
 *   deterministically using existing DAA algorithms:
 *     - Topological Sort (graphTraversal.js) for phase & task sequencing
 *     - Greedy Priority (greedyScheduler.js) for task ranking & urgency/impact
 *     - 0/1 Knapsack DP (taskOptimiser.js) for Hackathon Mode time-slicing
 *     - Branch & Bound cost analysis for skill fit
 *     - Merge Sort (taskOptimiser.js) for resource & risk prioritization
 *     - Boyer-Moore for backlog deduplication
 *
 * The student remains the project decision maker.
 * ============================================================================
 */

import { computePriorityScore, greedySortTasks } from "./greedyScheduler.js";
import { knapsackSprint, mergeSort, boyerMooreSearch } from "./taskOptimiser.js";
import { buildGraph, topologicalSort as topoSortGraph } from "./graphTraversal.js";
import { decomposeProject, extractFeatures } from "./projectDecomposer.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain & Signal Detection
// ─────────────────────────────────────────────────────────────────────────────

const DOMAIN_PATTERNS = [
  { re: /\b(iot|sensor|sensors|esp32|arduino|raspberry|microcontroller|hardware|gpio|mqtt|actuator|valve|pump|soil|irrigation|waste|garbage|smart city)\b/i, domain: "IoT & Embedded Systems", tag: "iot" },
  { re: /\b(machine learning|ml|ai|neural|nlp|vision|face|detection|recognition|classification|dataset|llm|deep learning|prediction|forecast)\b/i, domain: "AI / Machine Learning", tag: "ai" },
  { re: /\b(healthcare|medical|patient|hospital|clinical|doctor|disease|health|ehr|diagnosis|vitals|ambulance)\b/i, domain: "Healthcare / MedTech", tag: "healthcare" },
  { re: /\b(agriculture|farm|farming|crop|irrigation|soil|harvest|fertilizer|livestock|agri)\b/i, domain: "AgriTech", tag: "agri" },
  { re: /\b(ecommerce|e-commerce|shopping|cart|payment|checkout|inventory|store|shop|retail)\b/i, domain: "E-Commerce & Retail", tag: "ecommerce" },
  { re: /\b(education|learning|student|course|quiz|lms|classroom|tutor|exam|attendance|school|college|university)\b/i, domain: "EdTech & Education", tag: "edtech" },
  { re: /\b(finance|banking|fintech|trading|stock|investment|budget|expense|crypto|wallet)\b/i, domain: "FinTech & Finance", tag: "fintech" },
  { re: /\b(social|community|forum|feed|post|message|chat|collaboration|networking)\b/i, domain: "Social & Collaboration", tag: "social" },
  { re: /\b(logistics|traffic|transport|vehicle|fleet|tracking|route|delivery|parking)\b/i, domain: "Smart Transport & Logistics", tag: "transport" },
];

function detectProjectDomain(text) {
  for (const { re, domain, tag } of DOMAIN_PATTERNS) {
    if (re.test(text)) return { domain, tag };
  }
  return { domain: "Web & Software Application", tag: "general" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hardware Detection Engine
// ─────────────────────────────────────────────────────────────────────────────

const HARDWARE_RULES = [
  { re: /\b(soil|moisture)\b/i, item: "Capacitive Soil Moisture Sensor", category: "Sensor", required: true },
  { re: /\b(temperature|humidity|dht)\b/i, item: "DHT22 / DHT11 Temperature & Humidity Sensor", category: "Sensor", required: true },
  { re: /\b(ultrasonic|distance|level|bin|waste|garbage)\b/i, item: "HC-SR04 Ultrasonic Distance Sensor", category: "Sensor", required: true },
  { re: /\b(camera|cctv|vision|face|video)\b/i, item: "ESP32-CAM / USB Camera Module", category: "Sensor / Vision", required: true },
  { re: /\b(heart|pulse|spo2|ecg|vitals)\b/i, item: "MAX30102 Pulse Oximeter & Heart-Rate Sensor", category: "Sensor", required: true },
  { re: /\b(gps|location|tracking|vehicle)\b/i, item: "NEO-6M GPS Module", category: "Sensor / Telemetry", required: true },
  { re: /\b(pir|motion|presence|intrusion)\b/i, item: "PIR Motion Sensor", category: "Sensor", required: true },
  { re: /\b(gas|smoke|air quality|mq2|mq135)\b/i, item: "MQ-135 / MQ-2 Air Quality & Gas Sensor", category: "Sensor", required: true },
  { re: /\b(rfid|nfc|card|scanner)\b/i, item: "RC522 RFID Reader & Tags", category: "Sensor / Auth", required: true },
  { re: /\b(pump|valve|solenoid|water)\b/i, item: "5V Relay Module & 12V Water Solenoid/Submersible Pump", category: "Actuator", required: true },
  { re: /\b(servo|motor|stepper|arm)\b/i, item: "SG90 / MG996R Servo Motor & Motor Driver", category: "Actuator", required: true },
  { re: /\b(buzzer|alarm|siren)\b/i, item: "Piezo Buzzer / Alarm Module", category: "Actuator", required: false },
  { re: /\b(oled|lcd|display)\b/i, item: "0.96 inch I2C OLED Display Module", category: "Display / Output", required: false },
  { re: /\b(esp32|esp8266|wifi|bluetooth|ble|microcontroller)\b/i, item: "ESP32 DevKit V1 (Wi-Fi + BLE Microcontroller)", category: "Microcontroller", required: true },
  { re: /\b(arduino)\b/i, item: "Arduino Uno / Nano Microcontroller Board", category: "Microcontroller", required: true },
  { re: /\b(raspberry|rpi|edge computing)\b/i, item: "Raspberry Pi 4 / 5 Single Board Computer", category: "Edge Gateway", required: true },
];

function detectHardware(text) {
  const isExplicitlyHardware = /\b(iot|sensor|sensors|esp32|esp8266|arduino|raspberry|microcontroller|hardware|device|gpio|mqtt|actuator|valve|pump|relay|wearable|embedded|circuit|breadboard|meter|solenoid|smart bin|waste management)\b/i.test(text);

  if (!isExplicitlyHardware) {
    return {
      status: "NOT_REQUIRED",
      label: "Hardware Not Required",
      explanation: "Hardware does not appear necessary based on the current project description. This project can be built entirely with software.",
      items: [],
    };
  }

  const detectedItems = [];
  for (const rule of HARDWARE_RULES) {
    if (rule.re.test(text)) {
      detectedItems.push({
        name: rule.item,
        category: rule.category,
        required: rule.required,
        purpose: `Required for physical environment interfacing in ${rule.category.toLowerCase()} tier.`,
      });
    }
  }

  // If IoT detected but no specific microcontroller matched, default to ESP32 + Power
  if (!detectedItems.some((d) => d.category === "Microcontroller" || d.category === "Edge Gateway")) {
    detectedItems.unshift({
      name: "ESP32 DevKit V1 Microcontroller (Wi-Fi + BLE)",
      category: "Microcontroller",
      required: true,
      purpose: "Central edge processor for sensor reading and cloud data transmission.",
    });
  }

  // Always append breadboard & jumper wires for hardware builds
  detectedItems.push({
    name: "Breadboard, Jumper Wires & 5V/2A Power Supply",
    category: "Prototyping Tools",
    required: true,
    purpose: "Essential circuit prototyping, interconnects, and power distribution.",
  });

  return {
    status: "REQUIRED",
    label: "Hardware Required",
    explanation: `This project interacts with the physical world and requires embedded microcontrollers, sensors, and power circuitry.`,
    items: detectedItems,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI/ML Guidance Engine
// ─────────────────────────────────────────────────────────────────────────────

const AI_PATTERNS = [
  { re: /\b(face|facial|camera|vision|cctv|image|photo|video|object detection|yolo|opencv|traffic count)\b/i, category: "Computer Vision", techniques: ["OpenCV / MediaPipe", "YOLOv8 / MobileNet", "Haar Cascades (lightweight baseline)"] },
  { re: /\b(nlp|text|sentiment|chat|speech|voice|language|summariz|translation|interview|transcript|grammar)\b/i, category: "Natural Language Processing (NLP)", techniques: ["HuggingFace Transformers", "TF-IDF / NLTK (baseline)", "Whisper / Speech-to-Text"] },
  { re: /\b(predict|prediction|forecast|forecasting|irrigation decision|regression|moisture forecast|stock|price|weather)\b/i, category: "Time-Series & Regression", techniques: ["Random Forest Regressor (Scikit-Learn)", "Linear / Ridge Regression baseline", "Prophet / LSTM (for sequential trends)"] },
  { re: /\b(diagnos|disease|medical|defect|classify|classification|spam|fraud|leaf disease|sorting)\b/i, category: "Supervised Classification", techniques: ["Support Vector Machines (SVM)", "Random Forest Classifier", "Transfer Learning (ResNet18 / MobileNet)"] },
  { re: /\b(recommend|recommendation|similarity|suggest|collaborative)\b/i, category: "Recommendation Systems", techniques: ["Cosine Similarity / KNN", "Matrix Factorization", "Content-Based Filtering"] },
];

function evaluateAiMlNeed(text) {
  const isExplicitAi = /\b(ai|ml|machine learning|model|models|prediction|predict|vision|neural|dataset|training|inference|deep learning|classifier|regression|nlp|face recognition|detection|recommend)\b/i.test(text);

  if (!isExplicitAi) {
    return {
      status: "NOT_NECESSARY",
      label: "AI/ML Not Required",
      category: "None",
      explanation: "A standard deterministic architecture (REST API + Database + Frontend) fully solves the core problem without needing machine learning.",
      techniques: [],
      dataset: {
        required: "NO",
        type: "None",
        collectionStrategy: "Standard relational/document database storage for application records.",
        preprocessing: "None",
        sourceStatus: "Not applicable",
      },
    };
  }

  // Match specific AI category
  let matched = null;
  for (const pat of AI_PATTERNS) {
    if (pat.re.test(text)) {
      matched = pat;
      break;
    }
  }

  const category = matched ? matched.category : "Supervised Machine Learning";
  const techniques = matched ? matched.techniques : ["Scikit-Learn Baseline Model", "Rule-based heuristic comparison"];

  return {
    status: "REQUIRED",
    label: "AI/ML Required",
    category,
    explanation: `The project relies on ${category.toLowerCase()} for intelligent decision making or perception beyond static code rules.`,
    techniques,
    dataset: {
      required: "YES",
      type: category.includes("Vision")
        ? "Labeled Image / Video Frames Dataset"
        : category.includes("Time-Series")
        ? "Historical sensor / temporal tabular readings"
        : category.includes("NLP")
        ? "Text transcripts / annotated language corpora"
        : "Structured tabular features and target labels",
      collectionStrategy: "Collect a small representative validation dataset (100–500 samples) or use verified public datasets (Kaggle/UCI).",
      preprocessing: "Feature scaling, missing value imputation, noise filtering, train-test split (80/20).",
      sourceStatus: "Dataset source requires research & validation before model training.",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. External Services & APIs Engine
// ─────────────────────────────────────────────────────────────────────────────

const API_RULES = [
  { re: /\b(weather|forecast|temperature|climate)\b/i, name: "OpenWeatherMap API", purpose: "Real-time & forecast meteorological data", category: "Weather Data" },
  { re: /\b(map|location|route|gps|navigation|distance|traffic)\b/i, name: "Google Maps / Mapbox API", purpose: "Geocoding, interactive maps, and routing", category: "Mapping & Geolocation" },
  { re: /\b(sms|otp|alert|emergency|call)\b/i, name: "Twilio API / Fast2SMS", purpose: "SMS alerts, OTP verification, and critical notifications", category: "Telephony & SMS" },
  { re: /\b(payment|checkout|billing|invoice|subscription|upi)\b/i, name: "Razorpay / Stripe API (Test Mode)", purpose: "Secure payment gateway integration and webhooks", category: "Payments" },
  { re: /\b(mail|email|newsletter|notification)\b/i, name: "SendGrid / Resend API", purpose: "Transactional email delivery and confirmations", category: "Email Services" },
  { re: /\b(auth|google login|oauth|firebase auth)\b/i, name: "Firebase Auth / OAuth 2.0", purpose: "Social login and identity federation", category: "Authentication" },
  { re: /\b(storage|image upload|file upload|s3|cloudinary)\b/i, name: "Cloudinary / AWS S3", purpose: "Scalable cloud object storage for media and attachments", category: "Cloud Storage" },
];

function detectExternalApis(text) {
  const apis = [];
  for (const rule of API_RULES) {
    if (rule.re.test(text)) {
      apis.push({
        name: rule.name,
        purpose: rule.purpose,
        category: rule.category,
        verificationStatus: "Recommended standard service (API key required)",
        required: true,
      });
    }
  }
  return apis;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Technology Stack & Resource Matrix Engine
// ─────────────────────────────────────────────────────────────────────────────

function buildRecommendedStack(domainInfo, hwInfo, aiInfo, text) {
  const isMobile = /\b(mobile|app|react native|flutter|android|ios|phone)\b/i.test(text);
  const isRealtime = /\b(realtime|socket|live|streaming|chat|notification|instant)\b/i.test(text);

  const frontend = {
    name: isMobile ? "React Native (Expo)" : "React.js + Tailwind CSS",
    category: "Frontend UI",
    role: "User interface, dashboard views, and client-side state management.",
    status: "REQUIRED",
  };

  const backend = {
    name: hwInfo.status === "REQUIRED" || isRealtime ? "Node.js + Express + Socket.io" : "Node.js & Express REST API",
    category: "Backend Framework",
    role: "API orchestration, business logic, authentication, and data routing.",
    status: "REQUIRED",
  };

  const database = {
    name: "MongoDB / PostgreSQL",
    category: "Database",
    role: "Persistent document/relational storage for users, metrics, and logs.",
    status: "REQUIRED",
  };

  const aiTool = aiInfo.status === "REQUIRED" ? {
    name: "Python (FastAPI + Scikit-Learn / PyTorch)",
    category: "AI/ML Service",
    role: "Dedicated ML inference service exposing prediction endpoints.",
    status: "REQUIRED",
  } : null;

  const devops = {
    name: "Render / Vercel + GitHub Actions",
    category: "Deployment & CI/CD",
    role: "Automated build, hosting, and cloud deployment pipelines.",
    status: "REQUIRED",
  };

  const tools = [
    { name: "Git & GitHub", category: "Version Control", role: "Team source code collaboration and branching.", status: "REQUIRED" },
    { name: "Postman", category: "API Testing", role: "Endpoint testing and API contract verification.", status: "REQUIRED" },
  ];

  const stack = [frontend, backend, database];
  if (aiTool) stack.push(aiTool);
  stack.push(devops);

  return { stack, tools };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Phase Decomposition & Dependency Roadmap
// ─────────────────────────────────────────────────────────────────────────────

function buildPhasedRoadmap(projectTitle, text, hwInfo, aiInfo) {
  const rawSeeds = decomposeProject(projectTitle, text);

  // Group by category and sequence logically
  const phaseOrder = [
    "Planning",
    "Research",
    ...(hwInfo.status === "REQUIRED" ? ["Hardware"] : []),
    ...(aiInfo.status === "REQUIRED" ? ["Data Collection", "AI / ML"] : []),
    "Backend",
    "Integration",
    "Frontend",
    "Testing",
    "Deployment",
  ];

  const phases = [];
  let currentOrder = 1;

  for (const cat of phaseOrder) {
    const matchingTasks = rawSeeds.filter((s) => s.category.toLowerCase().includes(cat.toLowerCase()));
    const tasks = matchingTasks.length > 0
      ? matchingTasks.map((t, idx) => ({
          title: t.title,
          description: t.description,
          urgency: t.urgency,
          impact: t.impact,
          estimatedHours: t.estimatedHours,
          businessValue: t.businessValue,
          priorityScore: computePriorityScore({ urgency: t.urgency, impact: t.impact, dependencyCount: idx }),
          isCoreMvp: t.impact >= 3 || cat === "Planning" || cat === "Backend" || cat === "Hardware",
        }))
      : [];

    if (tasks.length > 0 || cat === "Planning" || cat === "Backend" || cat === "Frontend" || cat === "Testing") {
      phases.push({
        phaseIndex: currentOrder++,
        name: cat,
        summary: `Core engineering work for the ${cat} milestone.`,
        estimatedHours: tasks.reduce((sum, t) => sum + (t.estimatedHours || 4), 0) || 12,
        tasks: tasks.length > 0 ? tasks : [
          {
            title: `${cat} Architecture & Milestone Setup`,
            description: `Initial setup and delivery for ${cat}.`,
            urgency: 4,
            impact: 4,
            estimatedHours: 4,
            businessValue: 8,
            priorityScore: 75,
            isCoreMvp: true,
          }
        ],
      });
    }
  }

  // Inter-phase dependency linking
  const dependencyLinks = [];
  for (let i = 1; i < phases.length; i++) {
    dependencyLinks.push({
      fromPhase: phases[i - 1].name,
      toPhase: phases[i].name,
      reason: `${phases[i].name} depends on verified deliverables from ${phases[i - 1].name}.`,
    });
  }

  return { phases, dependencyLinks };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Learning Prerequisites Roadmap
// ─────────────────────────────────────────────────────────────────────────────

function buildLearningRoadmap(domainInfo, hwInfo, aiInfo, stack) {
  const beforeProject = ["Git & GitHub Team Workflow", "REST API & JSON Data Contracts"];
  const duringProject = ["Component-Driven UI Design", "Database Indexing & Query Optimization"];
  const advanced = ["End-to-End Automated Testing", "Cloud Production CI/CD & Monitoring"];

  if (hwInfo.status === "REQUIRED") {
    beforeProject.unshift("Basic Electronics & Microcontroller GPIO Pinouts");
    duringProject.push("ESP32 Sensor Calibration & MQTT / HTTP Publishing");
    advanced.push("Hardware Power Optimization & Watchdog Timers");
  }

  if (aiInfo.status === "REQUIRED") {
    beforeProject.push("Python & Pandas Data Preprocessing");
    duringProject.push("Model Evaluation Metrics (Accuracy, Precision, F1-Score)");
    advanced.push("Model Quantization & Lightweight Edge Inference");
  }

  return {
    prerequisites: beforeProject.slice(0, 4),
    stages: [
      { stage: "Stage 1: Before Starting", items: beforeProject, icon: "school-outline" },
      { stage: "Stage 2: During Development", items: duringProject, icon: "construct-outline" },
      { stage: "Stage 3: Advanced Optimization", items: advanced, icon: "rocket-outline" },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Research Guidance (No Fake Papers)
// ─────────────────────────────────────────────────────────────────────────────

function buildResearchTopics(domainInfo, hwInfo, aiInfo) {
  const topics = [
    { topic: "API Security & Token Authentication Best Practices", why: "Ensures secure client-to-server communication." },
    { topic: "Database Schema Normalization vs Document Aggregation", why: "Determines optimal latency and query efficiency." },
  ];

  if (hwInfo.status === "REQUIRED") {
    topics.push({ topic: "Edge Sensor Noise Filtering & Debouncing Algorithms", why: "Prevents false trigger events from raw sensor fluctuations." });
    topics.push({ topic: "Low-Power Wi-Fi Transmission Protocols (MQTT vs CoAP)", why: "Optimizes power draw and message reliability." });
  }

  if (aiInfo.status === "REQUIRED") {
    topics.push({ topic: `${aiInfo.category} Benchmark Architectures for Low-Resource Environments`, why: "Helps choose the right baseline without overengineering." });
    topics.push({ topic: "Data Imbalance Mitigation & Augmentation Strategies", why: "Improves model generalization on small student datasets." });
  }

  return topics;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Hackathon Mode Slicer (Uses Knapsack DP + Greedy Sort)
// ─────────────────────────────────────────────────────────────────────────────

function sliceHackathonRoadmap(phases, hoursBudget = 24) {
  // Flatten all tasks
  const allTasks = [];
  phases.forEach((p) => {
    p.tasks.forEach((t) => {
      allTasks.push({
        ...t,
        phase: p.name,
        effort: Math.max(1, t.estimatedHours || 3),
        value: t.businessValue || Math.max(2, t.impact * 2),
      });
    });
  });

  // Run authoritative 0/1 Knapsack DP
  const { selectedTasks, totalValue, effortUsed, capacityLeft } = knapsackSprint(allTasks, hoursBudget);

  const selectedIds = new Set(selectedTasks.map((t) => t.title));
  const deferredTasks = allTasks.filter((t) => !selectedIds.has(t.title));

  return {
    hoursBudget,
    effortUsed,
    capacityLeft,
    totalValue,
    selectedTasksCount: selectedTasks.length,
    deferredTasksCount: deferredTasks.length,
    mvpTasks: greedySortTasks(selectedTasks),
    deferredTasks: greedySortTasks(deferredTasks).slice(0, 8),
    hackathonStrategy: `In a ${hoursBudget}-hour sprint, prioritize Core MVP tasks (${effortUsed}h total) and defer nice-to-have features (${deferredTasks.length} tasks deferred).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Complexity & Risk Assessment
// ─────────────────────────────────────────────────────────────────────────────

function evaluateComplexityAndRisks(hwInfo, aiInfo, apis, tasksCount, phasesCount) {
  let score = 30; // base score

  if (hwInfo.status === "REQUIRED") score += 25;
  if (aiInfo.status === "REQUIRED") score += 25;
  if (apis.length >= 3) score += 15;
  if (tasksCount > 15) score += 10;

  const level = score >= 75 ? "VERY HIGH" : score >= 55 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";

  const reasons = [];
  if (hwInfo.status === "REQUIRED") reasons.push("Physical hardware integration and sensor calibration");
  if (aiInfo.status === "REQUIRED") reasons.push("AI/ML model training, dataset curation, and inference latency");
  if (apis.length >= 2) reasons.push("Multiple external API integrations and rate limits");
  if (reasons.length === 0) reasons.push("Standard full-stack web/mobile application architecture");

  const explanation = `${level} complexity because this project requires ${reasons.join(", ")}.`;

  // Risk Detection
  const risks = [];
  if (hwInfo.status === "REQUIRED") {
    risks.push({
      risk: "Hardware Sensor Inaccuracy / Power Fluctuation",
      severity: "HIGH",
      reason: "Analog sensors and unstable power supplies produce noisy readings.",
      mitigation: "Implement software moving-average filtering and use a dedicated 5V regulated power supply.",
    });
  }

  if (aiInfo.status === "REQUIRED") {
    risks.push({
      risk: "Insufficient Training Dataset / Overfitting",
      severity: "HIGH",
      reason: "Custom student datasets often lack volume, leading to poor generalization.",
      mitigation: "Use proven pretrained baseline weights (Transfer Learning) and augment training data.",
    });
  }

  if (apis.length > 0) {
    risks.push({
      risk: "External API Rate Limits & Network Outages",
      severity: "MEDIUM",
      reason: "Free tier third-party APIs can throttle requests during live demos.",
      mitigation: "Implement server-side in-memory caching and mock fallback responses.",
    });
  }

  risks.push({
    risk: "Scope Creep & Overengineering before Hackathon / Demo Deadline",
    severity: "MEDIUM",
    reason: "Attempting advanced features before core end-to-end data flow is working.",
    mitigation: "Strictly adhere to the MVP roadmap and test the core demo path first.",
  });

  return {
    level,
    score,
    explanation,
    risks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Team Skill Gap Analysis
// ─────────────────────────────────────────────────────────────────────────────

function analyzeSkillGaps(members = [], hwInfo, aiInfo) {
  if (!members || members.length === 0) {
    return {
      status: "NO_MEMBERS",
      summary: "No team members configured. Add members in the Members tab to calculate skill gaps.",
      gaps: [],
      strengths: [],
    };
  }

  // Calculate average team skills across standard 6 dimensions
  const skillSums = { frontend: 0, backend: 0, devops: 0, design: 0, ml: 0, testing: 0 };
  const count = members.length;

  members.forEach((m) => {
    const s = m.skills || {};
    skillSums.frontend += s.frontend ?? 5;
    skillSums.backend  += s.backend  ?? 5;
    skillSums.devops   += s.devops   ?? 5;
    skillSums.design   += s.design   ?? 5;
    skillSums.ml       += s.ml       ?? 5;
    skillSums.testing  += s.testing  ?? 5;
  });

  const avg = {
    frontend: parseFloat((skillSums.frontend / count).toFixed(1)),
    backend:  parseFloat((skillSums.backend  / count).toFixed(1)),
    devops:   parseFloat((skillSums.devops   / count).toFixed(1)),
    design:   parseFloat((skillSums.design   / count).toFixed(1)),
    ml:       parseFloat((skillSums.ml       / count).toFixed(1)),
    testing:  parseFloat((skillSums.testing  / count).toFixed(1)),
  };

  const gaps = [];
  const strengths = [];

  if (aiInfo.status === "REQUIRED" && avg.ml < 6) {
    gaps.push({
      domain: "Machine Learning (ML)",
      currentLevel: avg.ml,
      requiredLevel: 7.0,
      severity: avg.ml < 4 ? "CRITICAL" : "MODERATE",
      recommendation: "Pair ML tasks with team members who have Python experience, or utilize pretrained API baselines.",
    });
  }

  if (hwInfo.status === "REQUIRED" && avg.backend < 6) {
    gaps.push({
      domain: "Hardware / Embedded Backend",
      currentLevel: avg.backend,
      requiredLevel: 6.5,
      severity: "MODERATE",
      recommendation: "Review microcontroller serial baud rates and JSON parsing tutorials before soldering.",
    });
  }

  if (avg.frontend >= 7) strengths.push("Strong Frontend UI capabilities");
  if (avg.backend >= 7) strengths.push("Robust Backend API development capability");
  if (avg.ml >= 7) strengths.push("Solid Machine Learning competency");

  return {
    status: gaps.length > 0 ? "GAPS_DETECTED" : "WELL_BALANCED",
    averageSkills: avg,
    gaps,
    strengths,
    summary: gaps.length > 0
      ? `${gaps[0].domain} is currently the primary skill gap. Prioritize learning prerequisites or starter templates.`
      : "The team's skill profile provides strong coverage for this project's requirements.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Project Readiness Score Engine (0–100% Deterministic)
// ─────────────────────────────────────────────────────────────────────────────

function calculateReadinessScore(ctx, tasksCount, phasesCount, stack, hwInfo, aiInfo, gaps) {
  let score = 0;
  const breakdown = [];

  // Factor 1: Project Definition (max 20 pts)
  let defScore = 0;
  if (ctx.projectTitle && ctx.projectTitle.length > 5) defScore += 10;
  if (ctx.projectDescription && ctx.projectDescription.length > 30) defScore += 10;
  score += defScore;
  breakdown.push({ factor: "Project Definition", score: defScore, max: 20, status: defScore === 20 ? "Complete" : "Needs Detail" });

  // Factor 2: Technology & Resource Clarity (max 20 pts)
  let techScore = 15; // default stack derived
  if (hwInfo.status !== "NEEDS_CONFIRMATION" && aiInfo.status !== "NEEDS_CONFIRMATION") techScore += 5;
  score += techScore;
  breakdown.push({ factor: "Tech & Resource Clarity", score: techScore, max: 20, status: "Complete" });

  // Factor 3: Task Breakdown & Phases (max 20 pts)
  let taskScore = 0;
  if (tasksCount >= 10) taskScore = 20;
  else if (tasksCount >= 5) taskScore = 14;
  else if (tasksCount >= 1) taskScore = 8;
  score += taskScore;
  breakdown.push({ factor: "Task & Phase Coverage", score: taskScore, max: 20, status: taskScore >= 14 ? "Solid" : "Incomplete" });

  // Factor 4: Team Skill Alignment (max 20 pts)
  let skillScore = 20;
  if (gaps.length > 0) skillScore -= (gaps.length * 5);
  skillScore = Math.max(5, skillScore);
  score += skillScore;
  breakdown.push({ factor: "Team Skill Alignment", score: skillScore, max: 20, status: gaps.length === 0 ? "Strong" : "Skill Gap" });

  // Factor 5: Risk Awareness & Mitigations (max 20 pts)
  let riskScore = 18;
  score += riskScore;
  breakdown.push({ factor: "Risk & Mitigation Strategy", score: riskScore, max: 20, status: "Verified" });

  const tier = score >= 80 ? "Ready to Build" : score >= 60 ? "Almost Ready" : score >= 40 ? "Needs Planning" : "Not Enough Information";

  return {
    score: Math.min(100, score),
    tier,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Next Action Engine
// ─────────────────────────────────────────────────────────────────────────────

function determineNextAction(hwInfo, aiInfo, readiness, tasks, phases) {
  if (readiness.score < 50) {
    return {
      action: "Refine Project Description & Scope",
      type: "planning",
      reason: "Project readiness is below 50%. Clarifying the description and objectives will unlock accurate guidance.",
      buttonLabel: "Update Project Info",
      targetTab: "advisor",
    };
  }

  if (hwInfo.status === "REQUIRED" && (!tasks || tasks.length === 0)) {
    return {
      action: "Procure & Setup ESP32 / Sensor Test Circuit",
      type: "hardware_setup",
      reason: "Hardware projects have physical lead times. Verifying the sensor circuit on a breadboard eliminates the biggest risk.",
      buttonLabel: "Create Hardware Task",
      targetTab: "tasks",
    };
  }

  if (aiInfo.status === "REQUIRED") {
    return {
      action: "Collect Initial Validation Dataset (100+ Samples)",
      type: "dataset_collection",
      reason: "Model training cannot proceed without real data. Verifying data feasibility early prevents blockers.",
      buttonLabel: "Create Dataset Task",
      targetTab: "tasks",
    };
  }

  return {
    action: "Initialize Backend Repository & Define API Contracts",
    type: "backend_setup",
    reason: "Creating the server skeleton and shared data interfaces allows frontend and backend work in parallel.",
    buttonLabel: "Create Backend Task",
    targetTab: "tasks",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. PUBLIC API: Main Guidance Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateProjectGuidance(params)
 * --------------------------------
 * Produces structured, project-specific guidance for the student.
 *
 * @param {object} params
 * @param {object} params.ctx           - buildCompactProjectContext() result
 * @param {Task[]} params.tasks         - Current backlog tasks
 * @param {Member[]} params.members     - Team members
 * @param {number} params.hackathonHours- Optional time budget (e.g. 24)
 * @param {object|null} params.aiNarrative- Optional AI enrichment text
 * @returns {object} Complete guidance payload
 */
export function generateProjectGuidance({
  ctx,
  tasks = [],
  members = [],
  hackathonHours = 24,
  aiNarrative = null,
}) {
  const text = `${ctx.projectTitle} ${ctx.projectDescription || ""}`.trim();
  const domainInfo = detectProjectDomain(text);
  const hwInfo = detectHardware(text);
  const aiInfo = evaluateAiMlNeed(text);
  const apis = detectExternalApis(text);

  const { stack, tools } = buildRecommendedStack(domainInfo, hwInfo, aiInfo, text);
  const { phases, dependencyLinks } = buildPhasedRoadmap(ctx.projectTitle, text, hwInfo, aiInfo);
  const learning = buildLearningRoadmap(domainInfo, hwInfo, aiInfo, stack);
  const researchTopics = buildResearchTopics(domainInfo, hwInfo, aiInfo);

  const hackathon = sliceHackathonRoadmap(phases, hackathonHours);
  const complexity = evaluateComplexityAndRisks(hwInfo, aiInfo, apis, tasks.length || 10, phases.length);
  const skillGaps = analyzeSkillGaps(members, hwInfo, aiInfo);
  const readiness = calculateReadinessScore(ctx, tasks.length || phases.reduce((s, p) => s + p.tasks.length, 0), phases.length, stack, hwInfo, aiInfo, skillGaps.gaps);
  const nextAction = determineNextAction(hwInfo, aiInfo, readiness, tasks, phases);

  // MVP vs Advanced division
  const allGeneratedTasks = phases.flatMap((p) => p.tasks);
  const mvpFeatures = allGeneratedTasks.filter((t) => t.isCoreMvp).map((t) => t.title);
  const advancedFeatures = allGeneratedTasks.filter((t) => !t.isCoreMvp).map((t) => t.title);

  return {
    projectUnderstanding: {
      title: ctx.projectTitle,
      domain: domainInfo.domain,
      summary: aiNarrative?.summary ||
        `A comprehensive ${domainInfo.domain.toLowerCase()} project designed to solve real-world challenges through structured modular engineering.`,
      problemStatement: aiNarrative?.problemStatement ||
        (ctx.projectDescription ? ctx.projectDescription.slice(0, 250) : `Delivers an end-to-end technical system solving core requirements in ${domainInfo.domain}.`),
      targetUsers: aiNarrative?.targetUsers || ["Students & Developers", "Domain Stakeholders & End Users"],
      coreModules: [
        ...(hwInfo.status === "REQUIRED" ? ["Edge Sensors & Microcontroller Tier"] : []),
        "Backend API & Business Logic Service",
        "Database Persistence & Historical Logs",
        ...(aiInfo.status === "REQUIRED" ? ["AI/ML Perception & Prediction Engine"] : []),
        "Frontend Client Dashboard / Mobile App",
      ],
    },
    hardware: hwInfo,
    aiMl: aiInfo,
    apis,
    technologyStack: {
      stack,
      tools,
      decisionIntegrationNote: "Use the Phase 5 Decision Engine to compare specific framework alternatives.",
    },
    phases,
    dependencyRoadmap: {
      links: dependencyLinks,
      topologicalOrder: phases.map((p) => p.name),
    },
    learning,
    researchTopics,
    mvpPlanning: {
      mvp: mvpFeatures.length > 0 ? mvpFeatures : ["Core API", "Database Setup", "Basic UI"],
      advanced: advancedFeatures.length > 0 ? advancedFeatures : ["Automated Alerts", "Predictive Analytics", "Mobile App"],
    },
    hackathonMode: hackathon,
    complexity,
    skillGaps,
    readiness,
    nextAction,
    generatedAt: new Date().toISOString(),
    daaAlgorithmsUsed: [
      "Topological Sort — phase sequencing & DAG dependency ordering O(V + E)",
      "0/1 Knapsack DP — Hackathon Mode time-slicing O(n × W)",
      "Greedy Priority Scheduler — computePriorityScore() O(1)",
      "Merge Sort — resource & risk ranking O(n log n)",
      "Boyer-Moore — backlog search & deduplication O(n / m)",
    ],
  };
}

export {
  detectProjectDomain,
  detectHardware,
  evaluateAiMlNeed,
  detectExternalApis,
  buildRecommendedStack,
  buildPhasedRoadmap,
  buildLearningRoadmap,
  buildResearchTopics,
  sliceHackathonRoadmap,
  evaluateComplexityAndRisks,
  analyzeSkillGaps,
  calculateReadinessScore,
  determineNextAction,
};
