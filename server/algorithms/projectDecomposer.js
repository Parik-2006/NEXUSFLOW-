/**
 * projectDecomposer.js — Project → structured backlog generator.
 * ============================================================================
 * Turns a free-text project description into a GROUPED, professional backlog
 * (Planning / Hardware / Backend / AI-ML / Frontend / Integration / Testing /
 * Deployment) — work items a real software team would execute. The raw
 * description is NEVER copied as a task; instead we:
 *   1. detect which engineering domains the project needs (keyword signals),
 *   2. extract feature keywords from the text (dynamic, per-project),
 *   3. emit deliverable tasks per active phase, specialised by detected nouns.
 *
 * Output seeds feed the SAME pipeline as every other task (Greedy priorityScore
 * via the Task pre-save hook, Knapsack via businessValue/estimatedHours, etc.).
 * This is the single decomposition implementation — reused by team creation
 * (routes/teams.js) and the AI chat (socket/aiOrchestrator.js).
 */

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","with","that","this","using","build","create",
  "develop","system","platform","app","application","project","must","should","will","can",
  "into","from","over","via","their","they","when","which","while","based","support","provide",
  "user","users","data","real","time","management","powered","track","tracks","tracking",
  "include","includes","including","manage","manages","every","each","also","such","like",
]);

// Domain signal → phase activation.
const SIGNALS = {
  hardware:   /\b(iot|sensor|sensors|esp32|esp8266|arduino|raspberry|microcontroller|hardware|device|devices|mqtt|gpio|actuator|valve|pump|relay|wearable|gateway)\b/i,
  ai:         /\b(ai|ml|machine learning|model|models|prediction|predict|forecast|forecasting|neural|nlp|vision|recommend|recommendation|dataset|training|inference|llm|gpt)\b/i,
  realtime:   /\b(realtime|real-time|live|socket|websocket|stream|streaming|notification|notifications|alert|alerts|messaging|chat|push)\b/i,
  security:   /\b(auth|authentication|login|role|roles|permission|secure|security|hipaa|consent|encryption|audit|access control|rbac)\b/i,
  payments:   /\b(payment|payments|checkout|billing|invoice|subscription|stripe|razorpay|cart|order|orders)\b/i,
  analytics:  /\b(analytics|dashboard|report|reports|reporting|chart|charts|insight|insights|metrics|visualis|visualiz)\b/i,
};

// Specialised hardware task names by detected noun.
const HARDWARE_SPECIALS = [
  { re: /\b(soil|moisture)\b/i,            task: "Soil Moisture Sensor Integration" },
  { re: /\b(temperature|humidity|dht)\b/i, task: "Temperature & Humidity Sensor Integration" },
  { re: /\b(esp32|esp8266|microcontroller)\b/i, task: "ESP32 Microcontroller Setup" },
  { re: /\b(arduino)\b/i,                  task: "Arduino Firmware Setup" },
  { re: /\b(raspberry)\b/i,                task: "Raspberry Pi Gateway Setup" },
  { re: /\b(pump|valve|solenoid)\b/i,      task: "Water Pump / Valve Control" },
  { re: /\b(camera|cctv)\b/i,              task: "Camera Stream Integration" },
  { re: /\b(wearable|heart|spo2|vitals)\b/i, task: "Wearable Device Data Ingestion" },
];

export function extractFeatures(text) {
  const counts = new Map();
  for (const raw of String(text).toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (STOPWORDS.has(raw) || raw.length < 4) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

const titleCase = (s) =>
  s.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function mapCategoryOrTitleToWaterfallPhase(category = "", title = "") {
  const c = String(category || "").toLowerCase();
  const t = String(title || "").toLowerCase();

  // 1. Requirements
  if (
    t.includes("requirement") ||
    t.includes("srs") ||
    t.includes("feasibility") ||
    t.includes("scope") ||
    t.includes("stakeholder") ||
    c.includes("requirement") ||
    c === "planning" && (t.includes("analysis") || t.includes("research") || t.includes("study") || t.includes("requirement")) ||
    c === "research"
  ) {
    return "requirements";
  }

  // 2. System Design
  if (
    t.includes("architecture") ||
    t.includes("schema") ||
    t.includes("design") ||
    t.includes("specification") ||
    t.includes("uml") ||
    t.includes("wireframe") ||
    t.includes("selection") ||
    c.includes("design") ||
    c.includes("architecture")
  ) {
    return "design";
  }

  // 4. Verification / Testing
  if (
    t.includes("test") ||
    t.includes("verification") ||
    t.includes("qa") ||
    t.includes("audit") ||
    t.includes("benchmark") ||
    c.includes("test") ||
    c.includes("qa") ||
    c.includes("verification")
  ) {
    return "testing";
  }

  // 5. Deployment
  if (
    t.includes("deploy") ||
    t.includes("ci/cd") ||
    t.includes("release") ||
    t.includes("docker") ||
    t.includes("kubernetes") ||
    t.includes("staging") ||
    t.includes("cloud infrastructure") ||
    c.includes("deployment") ||
    c.includes("devops")
  ) {
    return "deployment";
  }

  // 6. Maintenance
  if (
    t.includes("monitoring") ||
    t.includes("alerting") ||
    t.includes("maintenance") ||
    t.includes("performance tuning") ||
    t.includes("logging") ||
    t.includes("runbook") ||
    t.includes("review") ||
    c.includes("maintenance")
  ) {
    return "maintenance";
  }

  // 3. Implementation (Default for development/engineering tasks)
  return "implementation";
}

/**
 * decomposeProject(title, description) → seed task objects (grouped by category and Waterfall phase).
 * Deterministic: same input → same backlog distributed across all 6 Waterfall phases.
 */
export function decomposeProject(projectTitle = "", description = "") {
  const text = `${projectTitle} ${description}`.trim();
  if (!text) return [];

  const active = {
    hardware:  SIGNALS.hardware.test(text),
    ai:        SIGNALS.ai.test(text),
    realtime:  SIGNALS.realtime.test(text),
    security:  SIGNALS.security.test(text),
    payments:  SIGNALS.payments.test(text),
    analytics: SIGNALS.analytics.test(text),
  };
  const features = extractFeatures(text);
  const topFeatures = features.slice(0, 3).map(titleCase);

  // Each phase definition: { phase, category, urgency, impact, hours, tasks: [...] }
  const stages = [];
  const addStage = (phase, category, urgency, impact, hours, tasks) => {
    if (tasks && tasks.length) {
      stages.push({ phase, category, urgency, impact, hours, tasks: [...new Set(tasks)] });
    }
  };

  // ── 1. REQUIREMENTS (always) ──
  addStage("requirements", "Requirements", 5, 5, 4, [
    "Requirement Analysis & Scope Definition",
    "Domain & Requirement Research",
    "Feasibility Study & Stakeholder Specifications",
  ]);

  // ── 2. SYSTEM DESIGN (always) ──
  addStage("design", "Design", 4, 5, 5, [
    "Project Architecture & System Design",
    "Database Schema & Entity Relationship Design",
    "Technology Selection & Interface Contracts",
  ]);

  // ── 3. IMPLEMENTATION ──
  // Hardware (for IoT/device projects)
  if (active.hardware) {
    const specials = HARDWARE_SPECIALS.filter((h) => h.re.test(text)).map((h) => h.task);
    const hwTasks = specials.length ? specials : ["Sensor Integration", "Microcontroller Setup", "Actuator Control Wiring"];
    addStage("implementation", "Hardware", 4, 4, 6, hwTasks.slice(0, 4));
  }

  // Backend
  const backendTasks = ["REST API Development"];
  if (active.security) backendTasks.push("Authentication & Access Control");
  if (active.payments) backendTasks.push("Payment & Order Service");
  if (/\b(cloud|storage|s3|bucket)\b/i.test(text)) backendTasks.push("Cloud Storage Integration");
  if (topFeatures[0]) backendTasks.push(`${topFeatures[0]} Service Implementation`);
  addStage("implementation", "Backend", 4, 5, 6, backendTasks);

  // AI / ML
  if (active.ai) {
    addStage("implementation", "AI / ML", 3, 5, 8, [
      "Dataset Collection & Labelling",
      "Model Training & Evaluation",
      "Prediction Service Integration",
    ]);
  }

  // Realtime / Integration
  if (active.realtime) {
    addStage("implementation", "Integration", 3, 4, 5, [
      "Realtime Sync Service",
      "Notification & Alert System",
    ]);
  }

  // Frontend
  const frontendTasks = ["Dashboard UI Development"];
  if (active.analytics) frontendTasks.push("Analytics & Reporting Screen");
  frontendTasks.push("Settings & Profile Screens");
  if (topFeatures[1]) frontendTasks.push(`${topFeatures[1]} Management Screen`);
  addStage("implementation", "Frontend", 3, 4, 5, frontendTasks);

  // ── 4. VERIFICATION / TESTING (always) ──
  addStage("testing", "Testing", 4, 4, 4, [
    "Unit & Component Testing",
    "Integration Testing",
    "Security & Quality Assurance Verification",
  ]);

  // ── 5. DEPLOYMENT (always) ──
  addStage("deployment", "Deployment", 3, 4, 4, [
    "Cloud Infrastructure & CI/CD Pipeline",
    "Staging Environment Setup & Deployment",
  ]);

  // ── 6. MAINTENANCE (always) ──
  addStage("maintenance", "Maintenance", 2, 3, 3, [
    "Production Monitoring & Alerting Setup",
    "Performance Optimization & Maintenance Review",
  ]);

  // Flatten to seed tasks with explicit phase metadata
  const phaseOrderMap = {
    requirements: 0,
    design: 1,
    implementation: 2,
    testing: 3,
    deployment: 4,
    maintenance: 5,
  };

  const seeds = [];
  stages.forEach((st) => {
    const phaseIdx = phaseOrderMap[st.phase] ?? 0;
    for (const title of st.tasks) {
      seeds.push({
        title,
        category: st.category,
        phase: st.phase,
        phaseIndex: phaseIdx,
        description: `${st.category} deliverable for ${projectTitle || "the project"} (${st.phase} phase).`,
        urgency: st.urgency,
        impact: st.impact,
        estimatedHours: st.hours,
        businessValue: st.impact * 2,
      });
    }
  });

  return seeds;
}
