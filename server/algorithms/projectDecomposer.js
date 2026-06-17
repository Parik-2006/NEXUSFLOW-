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

function extractFeatures(text) {
  const counts = new Map();
  for (const raw of String(text).toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (STOPWORDS.has(raw) || raw.length < 4) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

const titleCase = (s) =>
  s.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * decomposeProject(title, description) → seed task objects (grouped by category).
 * Deterministic: same input → same backlog.
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

  // Each phase: { category, urgency, impact, hours, tasks: [...] }.
  const phases = [];
  const add = (category, urgency, impact, hours, tasks) =>
    tasks.length && phases.push({ category, urgency, impact, hours, tasks });

  // 1. Planning — always.
  add("Planning", 5, 4, 4, ["Requirement Analysis", "Technology Selection", "Project Architecture Design"]);

  // 2. Research — always (feeds every downstream phase).
  add("Research", 4, 3, 3, ["Domain & Requirement Research", "Technology & Feasibility Study"]);

  // 2. Hardware — only for IoT/device projects, specialised by detected nouns.
  if (active.hardware) {
    const specials = HARDWARE_SPECIALS.filter((h) => h.re.test(text)).map((h) => h.task);
    const tasks = specials.length ? specials : ["Sensor Integration", "Microcontroller Setup", "Actuator Control Wiring"];
    add("Hardware", 4, 4, 6, [...new Set(tasks)].slice(0, 4));
  }

  // 3. Backend — almost always; enrich with top feature.
  const backend = ["Database Schema Design", "REST API Development"];
  if (active.security) backend.push("Authentication & Access Control");
  if (active.payments) backend.push("Payment & Order Service");
  if (/\b(cloud|storage|s3|bucket)\b/i.test(text)) backend.push("Cloud Storage Integration");
  if (topFeatures[0]) backend.push(`${topFeatures[0]} Service Implementation`);
  add("Backend", 4, 5, 6, [...new Set(backend)].slice(0, 5));

  // 4. AI/ML.
  if (active.ai) add("AI / ML", 3, 5, 8, ["Dataset Collection & Labelling", "Model Training & Evaluation", "Prediction Service Integration"]);

  // 5. Realtime / Integration.
  if (active.realtime) add("Integration", 3, 4, 5, ["Realtime Sync Service", "Notification & Alert System"]);

  // 6. Frontend — almost always.
  const frontend = ["Dashboard UI Design"];
  if (active.analytics) frontend.push("Analytics & Reporting Screen");
  frontend.push("Settings & Profile Screens");
  if (topFeatures[1]) frontend.push(`${topFeatures[1]} Management Screen`);
  add("Frontend", 3, 4, 5, [...new Set(frontend)].slice(0, 4));

  // 7. Testing — always.
  add("Testing", 3, 3, 4, ["Integration Testing", "User Acceptance Testing"]);

  // 8. Deployment — always.
  add("Deployment", 2, 3, 3, ["Cloud Deployment & CI/CD", "Monitoring & Alerting Setup"]);

  // Flatten to seed tasks. businessValue/estimatedHours are DERIVED from the
  // phase profile (never project-specific magic numbers) so Knapsack/greedy work.
  // `phaseIndex` lets the caller wire inter-phase dependencies (phase N depends
  // on phase N-1) so the dependency graph and topological roadmap are connected.
  const seeds = [];
  phases.forEach((p, phaseIndex) => {
    for (const title of p.tasks) {
      seeds.push({
        title,
        category: p.category,
        description: `${p.category} deliverable for ${projectTitle || "the project"}.`,
        urgency: p.urgency,
        impact: p.impact,
        estimatedHours: p.hours,
        businessValue: p.impact * 2,
        phaseIndex,
      });
    }
  });
  return seeds;
}
