/**
 * server/services/projectToolsService.js
 * ============================================================================
 * Project-Aware API & Tools Recommendation Engine.
 *
 * Provides tailored developer tools, APIs, SDKs, libraries, and pretrained models
 * for students based on their specific project context (domain, hardware, AI/ML,
 * integrations, and architecture).
 *
 * STRICT POLICY:
 * - Information & decision support ONLY.
 * - ZERO task side effects (does NOT create tasks, modify Kanban, or affect sprints).
 * - Categorized by: 🟢 FREE, 🟢 FREE TIER, 🟡 LIMITED, 🔴 PAID.
 * ============================================================================
 */

import { omniRouteGenerate } from "./omniRoute.js";

// Domain-specific baseline tool registries with official documentation URLs
const BASELINE_TOOLS_REGISTRY = {
  iot: [
    {
      name: "Google Gemini API (Free Tier)",
      category: "LLM / AI Reasoning",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "High-speed multimodal LLM for intelligent telemetry interpretation and automated decision suggestions.",
      whyRelevant: "Allows edge/sensor readings to be analyzed and summarized for user alerts without high computational cost.",
      howToUse: "Call Google AI Studio v1beta generateContent endpoint server-side using your Gemini Free Tier API key.",
      advantages: ["15 RPM Free Tier", "Fast inference speed", "Native JSON structured outputs"],
      limitations: "Rate limited to 15 RPM / 1M TPM on free tier; avoid high-frequency per-second calls.",
      alternatives: "OpenRouter Free / Local Heuristic Rules",
      docUrl: "https://ai.google.dev/gemini-api/docs",
    },
    {
      name: "MQTT (Eclipse Mosquitto / EMQX)",
      category: "IoT / Communication Protocol",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "Lightweight publish-subscribe network protocol designed for low-power microcontroller telemetry.",
      whyRelevant: "Ideal for streaming soil sensor / hardware readings from ESP32 to your backend server with minimal network overhead.",
      howToUse: "Use PubSubClient on ESP32 firmware and mqtt npm package in Express/Node.js backend.",
      advantages: ["Extremely low packet overhead", "QoS delivery levels", "Supports low-bandwidth networks"],
      limitations: "Requires running an MQTT broker instance or using a public test broker.",
      alternatives: "HTTP REST / WebSockets / CoAP",
      docUrl: "https://mosquitto.org/documentation/",
    },
    {
      name: "MongoDB Time Series Collections",
      category: "Database / Storage",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "Optimized document storage for sensor time-series data with automatic bucketing and compression.",
      whyRelevant: "Stores timestamped moisture, temperature, and pump status readings efficiently for historical charting.",
      howToUse: "Create a Mongoose collection with timeseries: { timeField: 'timestamp', metaField: 'metadata', granularity: 'minutes' }.",
      advantages: ["512MB free on MongoDB Atlas M0", "Efficient range queries", "Built-in TTL data expiration"],
      limitations: "Free Atlas cluster cannot scale past 512MB storage without upgrading.",
      alternatives: "PostgreSQL with TimescaleDB / InfluxDB",
      docUrl: "https://www.mongodb.com/docs/manual/core/timeseries-collections/",
    },
    {
      name: "Chart.js / Recharts",
      category: "Frontend / Data Visualization",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "Lightweight, responsive charting library for rendering line, bar, and area metrics in web apps.",
      whyRelevant: "Visualizes real-time and historical telemetry curves directly in the student dashboard.",
      howToUse: "npm install react-chartjs-2 chart.js and bind to sensor time-series API endpoints.",
      advantages: ["100% open source", "Zero cost", "Highly customizable animations"],
      limitations: "Rendering 10,000+ data points simultaneously requires data downsampling.",
      alternatives: "Apache ECharts / D3.js",
      docUrl: "https://www.chartjs.org/docs/latest/",
    },
    {
      name: "OpenWeatherMap API",
      category: "External Weather Telemetry",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "Provides current weather and 5-day rain/temperature forecasts for any geographic coordinate.",
      whyRelevant: "Prevents unnecessary irrigation cycles when upcoming rainfall is predicted.",
      howToUse: "Fetch https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={KEY} before triggering relay.",
      advantages: ["1,000 free API calls per day", "Global weather coverage", "Rich precipitation forecasts"],
      limitations: "Paid subscription required if polling more than 60 calls/minute.",
      alternatives: "Open-Meteo (100% free, no API key needed) / WeatherAPI",
      docUrl: "https://openweathermap.org/api",
    },
    {
      name: "AWS IoT Core / Azure IoT Hub",
      category: "Cloud IoT Platform",
      status: "PAID",
      badgeLabel: "🔴 PAID",
      whatItDoes: "Enterprise managed cloud gateway for connecting millions of concurrent IoT devices securely.",
      whyRelevant: "Optional enterprise platform for massive fleet deployments with fleet provisioning.",
      howToUse: "Configure X.509 device certificates on microcontrollers and connect over TLS port 8883.",
      advantages: ["Enterprise SLA", "Managed device shadows", "Deep AWS/Azure ecosystem integration"],
      limitations: "Complex certificate setup; charges per message and device connectivity hour.",
      alternatives: "Self-hosted Mosquitto / EMQX Cloud Free Tier",
      docUrl: "https://aws.amazon.com/iot-core/",
    },
  ],
  cybersecurity: [
    {
      name: "Google Safe Browsing API",
      category: "Threat Intelligence",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "Checks URLs against Google's constantly updated lists of suspected phishing and malware resources.",
      whyRelevant: "Provides an authoritative ground-truth benchmark for evaluating malicious URL classification.",
      howToUse: "Submit URL hashes or batch lookups via POST https://safebrowsing.googleapis.com/v4/threatMatches:find.",
      advantages: ["Free 10,000 lookups per day", "High precision on known threats", "Low false-positive rate"],
      limitations: "Cannot detect brand-new zero-day malicious domains not yet indexed by Google.",
      alternatives: "VirusTotal API / URLhaus API / PhishTank",
      docUrl: "https://developers.google.com/safe-browsing/v4",
    },
    {
      name: "URLhaus & PhishTank Feeds",
      category: "Open Threat Feeds",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "Community-driven databases and feeds of active malware distribution and phishing URLs.",
      whyRelevant: "Supplies labeled training samples and live blacklists for your detection pipeline.",
      howToUse: "Download daily CSV/JSON dumps from https://urlhaus.abuse.ch/api/ for offline ML training.",
      advantages: ["100% Free and public", "Updated hourly by security researchers", "Includes verified payload metadata"],
      limitations: "Community submissions require automated validation to remove dead URLs.",
      alternatives: "OpenPhish / AbuseIPDB",
      docUrl: "https://urlhaus.abuse.ch/api/",
    },
    {
      name: "Scikit-Learn (Python)",
      category: "Machine Learning / NLP Feature Extraction",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "Open-source Python machine learning library with TF-IDF, Random Forest, and SVM classifiers.",
      whyRelevant: "Extracts lexical features (entropy, token count, suspicious TLDs, n-grams) from URLs for classification.",
      howToUse: "Use TfidfVectorizer and RandomForestClassifier, export model with joblib, and serve via FastAPI/Flask.",
      advantages: ["Fast CPU inference", "Extensive documentation", "Low memory footprint"],
      limitations: "Requires Python runtime service if your main backend is Node.js.",
      alternatives: "XGBoost / LightGBM / ONNX.js",
      docUrl: "https://scikit-learn.org/stable/",
    },
    {
      name: "VirusTotal API",
      category: "Multi-Engine Threat Scanner",
      status: "LIMITED",
      badgeLabel: "🟡 LIMITED",
      whatItDoes: "Aggregates scans from 70+ antivirus scanners and domain blocklists.",
      whyRelevant: "Multi-engine validation to cross-verify model classifications.",
      howToUse: "GET https://www.virustotal.com/api/v3/urls/{id} with your API key.",
      advantages: ["Industry standard", "Deep threat analysis", "Behavioral sandbox reports"],
      limitations: "Public API key is strictly limited to 4 requests/minute and 500 requests/day.",
      alternatives: "URLScan.io / Hybrid Analysis",
      docUrl: "https://developers.virustotal.com/reference/overview",
    },
  ],
  general: [
    {
      name: "Google Gemini API (Free Tier)",
      category: "LLM / AI Reasoning",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "Multi-purpose LLM for automated text analysis, decision reasoning, and conversational assistance.",
      whyRelevant: "Powers Project Copilot and technical brief extraction at zero financial cost.",
      howToUse: "Integrate through server/services/omniRoute.js using standard REST endpoints.",
      advantages: ["15 RPM Free Tier", "Fast response latency", "Rich structured output"],
      limitations: "Rate limit on free tier requires caching and deterministic fallback.",
      alternatives: "OpenRouter Free / Hugging Face Inference API",
      docUrl: "https://ai.google.dev/gemini-api/docs",
    },
    {
      name: "MongoDB Atlas M0 Free Tier",
      category: "Database / Document Storage",
      status: "FREE TIER",
      badgeLabel: "🟢 FREE TIER",
      whatItDoes: "Cloud-hosted NoSQL document database with flexible JSON schemas.",
      whyRelevant: "Stores project documents, user accounts, tasks, and recommendations with zero setup friction.",
      howToUse: "Connect via Mongoose using the connection URI in server/.env.",
      advantages: ["Free forever 512MB tier", "Automated backups", "Native JSON format"],
      limitations: "Capped at 512MB storage and 100 simultaneous connections.",
      alternatives: "Supabase (PostgreSQL) / Firebase Firestore",
      docUrl: "https://www.mongodb.com/docs/atlas/",
    },
    {
      name: "Postman / Thunder Client",
      category: "Developer Tool / API Testing",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "Desktop and VS Code tools for building, testing, and debugging REST & WebSocket APIs.",
      whyRelevant: "Allows team members to verify backend endpoint responses and auth headers before building UI.",
      howToUse: "Import team route collections and set Authorization: Bearer {{token}} headers.",
      advantages: ["Visual request builder", "Environment variables support", "Automated test script assertions"],
      limitations: "Team collaboration features require a free account.",
      alternatives: "Insomnia / Hoppscotch",
      docUrl: "https://www.postman.com/downloads/",
    },
    {
      name: "Zod / Joi Validation",
      category: "Schema Validation & Type Safety",
      status: "FREE",
      badgeLabel: "🟢 FREE",
      whatItDoes: "TypeScript-first schema declaration and validation library with static type inference.",
      whyRelevant: "Validates incoming HTTP request payloads and AI outputs to prevent runtime crashes.",
      howToUse: "Define const schema = z.object({...}) and call schema.safeParse(req.body).",
      advantages: ["Zero dependencies", "Pure TypeScript typing", "Detailed error messages"],
      limitations: "Requires defining schemas in code.",
      alternatives: "Yup / Validator.js",
      docUrl: "https://zod.dev/",
    },
  ],
};

/**
 * Generates project-specific developer tools & API recommendations dynamically.
 * Prioritizes: 🟢 FREE -> 🟢 FREE TIER -> 🟡 LIMITED -> 🔴 PAID.
 * STRICTLY READ-ONLY / INFORMATION SUPPORT ONLY.
 */
export async function getProjectToolRecommendations(project) {
  if (!project) return BASELINE_TOOLS_REGISTRY.general;

  const domain = (project.domain || "").toLowerCase();
  const title = (project.title || "").toLowerCase();
  const desc = (project.description || "").toLowerCase();
  const fullText = `${domain} ${title} ${desc}`;

  let selectedTools = [];

  if (fullText.includes("iot") || fullText.includes("irrigat") || fullText.includes("sensor") || fullText.includes("hardware") || fullText.includes("farm") || fullText.includes("soil")) {
    selectedTools = [...BASELINE_TOOLS_REGISTRY.iot];
  } else if (fullText.includes("cyber") || fullText.includes("phish") || fullText.includes("malicious") || fullText.includes("url") || fullText.includes("security") || fullText.includes("threat")) {
    selectedTools = [...BASELINE_TOOLS_REGISTRY.cybersecurity];
  } else {
    selectedTools = [...BASELINE_TOOLS_REGISTRY.general];
  }

  // Attempt dynamic enhancement via OmniRoute if free LLM is available
  try {
    const prompt = `Analyze this student project and suggest 2 additional tailored developer tools or APIs (must include 1 free/free-tier and 1 alternative):
Project Title: ${project.title}
Domain: ${project.domain || "General"}
Description: ${project.description || "N/A"}

Respond in valid JSON array format:
[
  {
    "name": "Tool Name",
    "category": "Category",
    "status": "FREE" | "FREE TIER" | "LIMITED" | "PAID",
    "badgeLabel": "🟢 FREE" | "🟢 FREE TIER" | "🟡 LIMITED" | "🔴 PAID",
    "whatItDoes": "What it does...",
    "whyRelevant": "Why relevant for this project...",
    "howToUse": "How to integrate...",
    "advantages": ["Pro 1", "Pro 2"],
    "limitations": "Free tier caps...",
    "alternatives": "Alternative...",
    "docUrl": "https://..."
  }
]`;

    const aiRes = await omniRouteGenerate({
      prompt,
      systemInstruction: "You are an expert developer tools advisor for student software projects. Suggest only real, verified tools and official documentation URLs. Never fabricate fake URLs.",
      temperature: 0.2,
      maxTokens: 1000,
    });

    if (aiRes && aiRes.text) {
      const match = aiRes.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const names = new Set(selectedTools.map((t) => t.name.toLowerCase()));
          for (const item of parsed) {
            if (item.name && !names.has(item.name.toLowerCase())) {
              selectedTools.push({
                name: item.name,
                category: item.category || "Developer Tool",
                status: item.status || "FREE TIER",
                badgeLabel: item.status === "FREE" ? "🟢 FREE" : item.status === "FREE TIER" ? "🟢 FREE TIER" : item.status === "PAID" ? "🔴 PAID" : "🟡 LIMITED",
                whatItDoes: item.whatItDoes || "Development utility.",
                whyRelevant: item.whyRelevant || `Recommended for ${project.title}.`,
                howToUse: item.howToUse || "Follow official documentation.",
                advantages: Array.isArray(item.advantages) ? item.advantages : ["Fast integration"],
                limitations: item.limitations || "Subject to standard API quotas.",
                alternatives: item.alternatives || "Open-source alternatives",
                docUrl: item.docUrl || "https://developer.mozilla.org",
              });
            }
          }
        }
      }
    }
  } catch (err) {
    // Fail silently to baseline tools — zero cost and zero crashes
  }

  // Sort order: FREE -> FREE TIER -> LIMITED -> PAID
  const order = { "FREE": 1, "FREE TIER": 2, "LIMITED": 3, "PAID": 4 };
  return selectedTools.sort((a, b) => (order[a.status] || 5) - (order[b.status] || 5));
}
