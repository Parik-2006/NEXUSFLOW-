/**
 * server/services/resourceDiscoveryService.js
 * ============================================================================
 * NEXUSFLOW 3.0 — Fix 1: Project-aware dataset & pretrained-model discovery.
 *
 * PURPOSE
 *   Given a project's context (title, description, domain, hardware/software/
 *   AI-ML requirements), return STRUCTURED recommendations of:
 *     - free / open datasets that may help the project
 *     - free / open pretrained AI/ML models that may help the project
 *
 * RULES
 *   - All AI calls go through the existing $0 OmniRoute (Gemini Free Tier or
 *     OpenRouter Free models). No direct OpenAI / paid APIs.
 *   - If AI is unavailable, a deterministic local fallback returns a small
 *     curated set of well-known resources keyed on the project's domain.
 *   - This service NEVER:
 *       * downloads models
 *       * trains models
 *       * creates tasks
 *       * modifies the project
 *       * mutates the real Sprint
 *   - URLs returned by AI are surfaced to the user, but explicitly marked
 *     "needs verification" when the response cannot be independently checked.
 *   - Recommendations are NOT persisted as tasks. They are returned to the
 *     caller for display only.
 * ============================================================================
 */

import { omniRouteGenerate } from "./omniRoute.js";

const SAFE_PROTOCOLS = ["https://", "http://"];

function isLikelyUrl(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (v.length > 500) return false;
  return SAFE_PROTOCOLS.some((p) => v.toLowerCase().startsWith(p));
}

function sanitizeAccess(value) {
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase();
  if (v.includes("free") || v.includes("open")) return "free";
  if (v.includes("account") || v.includes("signup") || v.includes("sign-up") || v.includes("register")) return "requires_account";
  if (v.includes("paid") || v.includes("commercial") || v.includes("subscription")) return "paid";
  return "unknown";
}

function sanitizeString(value, fallback = "", max = 500) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function sanitizeNumber(value, fallback = 0, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeDatasets(items, project) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of items.slice(0, 25)) {
    if (!raw || typeof raw !== "object") continue;
    const name = sanitizeString(raw.name, "", 200);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const description = sanitizeString(raw.description || raw.summary, "", 500);
    const matchesProject = sanitizeString(raw.matchesProject || raw.whyItMatches || raw.relevance, "", 500);
    const dataContains = sanitizeString(raw.dataContains || raw.contains || raw.data, "", 500);
    const usefulness = sanitizeNumber(raw.usefulness ?? raw.relevanceScore ?? raw.score, 50);
    const platform = sanitizeString(raw.platform || raw.source || "", "", 120);
    const url = isLikelyUrl(raw.url || raw.datasetUrl || raw.link) ? (raw.url || raw.datasetUrl || raw.link).trim() : "";
    const downloadUrl = isLikelyUrl(raw.downloadUrl || raw.accessUrl) ? (raw.downloadUrl || raw.accessUrl).trim() : "";

    out.push({
      kind: "dataset",
      name,
      description,
      whyMatches: matchesProject,
      dataContains,
      usefulness,
      source: platform,
      url,
      downloadUrl,
      access: sanitizeAccess(raw.access || raw.accessStatus || (downloadUrl ? "free" : "unknown")),
      verified: Boolean(url),
      projectId: project?._id?.toString?.() || null,
    });
  }
  return out;
}

function normalizeModels(items, project) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of items.slice(0, 25)) {
    if (!raw || typeof raw !== "object") continue;
    const name = sanitizeString(raw.name || raw.modelName, "", 200);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const modelUrl = isLikelyUrl(raw.url || raw.modelUrl || raw.link) ? (raw.url || raw.modelUrl || raw.link).trim() : "";
    const downloadUrl = isLikelyUrl(raw.downloadUrl || raw.accessUrl) ? (raw.downloadUrl || raw.accessUrl).trim() : "";

    out.push({
      kind: "model",
      name,
      modelType: sanitizeString(raw.modelType || raw.type || "", "", 120),
      description: sanitizeString(raw.description || raw.summary, "", 500),
      whatItDoes: sanitizeString(raw.whatItDoes || raw.function, "", 500),
      whyFits: sanitizeString(raw.whyFits || raw.whyRelevant || raw.relevance, "", 500),
      inputType: sanitizeString(raw.inputType || raw.input || "", "", 120),
      outputType: sanitizeString(raw.outputType || raw.output || "", "", 120),
      framework: sanitizeString(raw.framework || raw.platform || "", "", 120),
      license: sanitizeString(raw.license || raw.access || "", "", 120),
      url: modelUrl,
      downloadUrl,
      access: sanitizeAccess(raw.access || raw.accessStatus || (raw.license || "").toLowerCase().includes("apache") || (raw.license || "").toLowerCase().includes("mit") ? "free" : "unknown"),
      verified: Boolean(modelUrl),
      usefulness: sanitizeNumber(raw.usefulness ?? raw.relevanceScore ?? raw.score, 50),
      projectId: project?._id?.toString?.() || null,
    });
  }
  return out;
}

function buildProjectSnapshot(project, team) {
  const ctx = project?.context || {};
  const reqs = [
    ...(ctx.hardwareRequirements || []),
    ...(ctx.softwareRequirements || []),
    ...(ctx.aiMlRequirements || []),
    ...(ctx.integrations || []),
    ...(ctx.deploymentRequirements || []),
  ].filter(Boolean);
  return {
    title: project?.title || team?.projectTitle || team?.name || "Project",
    description: project?.description || team?.projectDescription || "",
    domain: project?.domain || team?.domain || "",
    projectType: project?.projectType || "",
    needs: reqs.slice(0, 30),
    goals: (ctx.goals || []).slice(0, 10),
    constraints: (ctx.constraints || []).slice(0, 10),
    preferredStack: (ctx.preferredStack || []).slice(0, 20),
  };
}

function buildPrompt(snapshot) {
  return [
    `Project Title: ${snapshot.title}`,
    `Domain: ${snapshot.domain || "General Software"}`,
    `Project Type: ${snapshot.projectType || "n/a"}`,
    `Description: ${(snapshot.description || "n/a").slice(0, 800)}`,
    `Needs (hardware/software/AI-ML/integrations): ${snapshot.needs.join("; ") || "n/a"}`,
    `Preferred Stack: ${snapshot.preferredStack.join("; ") || "n/a"}`,
    `Goals: ${snapshot.goals.join("; ") || "n/a"}`,
    `Constraints: ${snapshot.constraints.join("; ") || "n/a"}`,
  ].join("\n");
}

function buildSystemPrompt() {
  return `You are a research librarian for the NEXUSFLOW student project platform.

STRICT RULES:
1. Recommend ONLY free/open datasets and free/open pretrained AI/ML models that you actually know exist.
2. Prefer reputable sources: Kaggle, UCI Machine Learning Repository, government / open-data portals, university research datasets, Hugging Face datasets, TensorFlow Hub, PyTorch Hub, official repositories.
3. DO NOT fabricate URLs. If you are not certain about a URL, set url="" and downloadUrl="" and let the platform mark it as "needs verification".
4. NEVER recommend paid datasets or paid models as the primary option. If you mention a paid source, mark access="paid".
5. Tailor suggestions to the project context provided by the user. If the project is hardware/IoT, suggest sensor / time-series / anomaly detection datasets. If it is computer-vision, suggest image datasets and CV models. If NLP, suggest text datasets and language models.
6. Do NOT include any commentary, markdown, or prose outside the JSON.
7. If you do not know any matching resource, return empty arrays.

Return ONLY this JSON shape:
{
  "datasets": [
    {
      "name": "Dataset Name",
      "description": "One-sentence description",
      "matchesProject": "Why it matches this project",
      "dataContains": "What kind of data it contains",
      "usefulness": 1-100,
      "platform": "Kaggle | UCI | Hugging Face | Government | University | Other",
      "url": "https://... (only if you are confident)",
      "downloadUrl": "https://... (only if you are confident)",
      "access": "free | requires_account | paid | unknown"
    }
  ],
  "models": [
    {
      "name": "Model Name",
      "modelType": "Classification | Time-series | Object Detection | NLP | Embedding | Other",
      "description": "One-sentence description",
      "whatItDoes": "What the model does",
      "whyFits": "Why it may fit this project",
      "inputType": "Sensor | Image | Text | Tabular | Time-series | Other",
      "outputType": "Prediction | Classification | Score | Other",
      "framework": "PyTorch | TensorFlow | Hugging Face | Other",
      "license": "Apache-2.0 | MIT | Other / Unknown",
      "url": "https://... (only if you are confident)",
      "downloadUrl": "https://... (only if you are confident)",
      "access": "free | requires_account | paid | unknown"
    }
  ]
}`;
}

const DOMAIN_FALLBACK = {
  "iot / hardware": {
    datasets: [
      {
        name: "UCI Soil Moisture / Agricultural Sensor datasets",
        description: "UCI Machine Learning Repository hosts several soil, irrigation, and sensor datasets from academic research.",
        matchesProject: "Sensor data is core to IoT / hardware projects like yours.",
        dataContains: "Time-series sensor readings (soil moisture, temperature, humidity, etc.).",
        usefulness: 78,
        platform: "UCI",
        url: "https://archive.ics.uci.edu/",
        downloadUrl: "",
        access: "free",
      },
      {
        name: "Kaggle Irrigation & Smart Agriculture Datasets",
        description: "Kaggle hosts many public smart agriculture, irrigation, and weather datasets contributed by the community.",
        matchesProject: "Aggregated public datasets for irrigation and crop yield experiments.",
        dataContains: "Tabular and time-series data about crops, weather, irrigation, yield.",
        usefulness: 72,
        platform: "Kaggle",
        url: "https://www.kaggle.com/datasets?search=irrigation",
        downloadUrl: "",
        access: "free",
      },
    ],
    models: [
      {
        name: "Hugging Face Time-Series Transformers",
        description: "Pretrained transformer models for time-series forecasting and anomaly detection on Hugging Face.",
        modelType: "Time-series",
        whatItDoes: "Forecasts sensor values and detects anomalies in streaming data.",
        whyFits: "Useful for IoT sensor pipelines and predictive maintenance.",
        inputType: "Sensor",
        outputType: "Prediction",
        framework: "Hugging Face",
        license: "Apache-2.0 / Model-specific",
        url: "https://huggingface.co/models?pipeline_tag=time-series-forecasting",
        downloadUrl: "",
        access: "free",
      },
    ],
  },
  "ai / machine learning": {
    datasets: [
      {
        name: "Hugging Face Datasets Hub",
        description: "Curated collection of open datasets across NLP, vision, audio, and tabular domains.",
        matchesProject: "Project requires AI/ML — HF Hub is the canonical open source.",
        dataContains: "Text, image, audio, tabular datasets.",
        usefulness: 85,
        platform: "Hugging Face",
        url: "https://huggingface.co/datasets",
        downloadUrl: "",
        access: "free",
      },
      {
        name: "UCI Machine Learning Repository",
        description: "Classic academic datasets for benchmarking ML models.",
        matchesProject: "Strong baseline for any ML experimentation.",
        dataContains: "Tabular data across many domains.",
        usefulness: 70,
        platform: "UCI",
        url: "https://archive.ics.uci.edu/",
        downloadUrl: "",
        access: "free",
      },
    ],
    models: [
      {
        name: "Hugging Face Pretrained Models",
        description: "Catalog of free pretrained models for vision, NLP, audio, and multimodal tasks.",
        modelType: "Other",
        whatItDoes: "Provides state-of-the-art pretrained weights for many tasks.",
        whyFits: "Fastest way to integrate a baseline model into the project.",
        inputType: "Other",
        outputType: "Prediction",
        framework: "Hugging Face",
        license: "Model-specific",
        url: "https://huggingface.co/models",
        downloadUrl: "",
        access: "free",
      },
      {
        name: "PyTorch / TensorFlow Hub Models",
        description: "Official model hubs from PyTorch and TensorFlow with free pretrained checkpoints.",
        modelType: "Other",
        whatItDoes: "Provides ready-to-use pretrained models.",
        whyFits: "Stable, well-documented baseline models.",
        inputType: "Other",
        outputType: "Prediction",
        framework: "PyTorch / TensorFlow",
        license: "Model-specific",
        url: "https://pytorch.org/hub/",
        downloadUrl: "",
        access: "free",
      },
    ],
  },
  "general software": {
    datasets: [
      {
        name: "Kaggle Public Datasets",
        description: "Curated public datasets across many domains.",
        matchesProject: "Useful for prototyping and demonstrations.",
        dataContains: "Tabular, text, image datasets.",
        usefulness: 60,
        platform: "Kaggle",
        url: "https://www.kaggle.com/datasets",
        downloadUrl: "",
        access: "free",
      },
    ],
    models: [
      {
        name: "Hugging Face Pretrained Models",
        description: "Pretrained models for many tasks.",
        modelType: "Other",
        whatItDoes: "Provides ready-to-use baselines.",
        whyFits: "Convenient if the project later integrates NLP or vision.",
        inputType: "Other",
        outputType: "Prediction",
        framework: "Hugging Face",
        license: "Model-specific",
        url: "https://huggingface.co/models",
        downloadUrl: "",
        access: "free",
      },
    ],
  },
};

function deterministicFallback(snapshot) {
  const key = (snapshot.domain || "general software").toLowerCase();
  let bucket = DOMAIN_FALLBACK[key];
  if (!bucket) {
    if (key.includes("iot") || key.includes("hardware") || key.includes("agri")) {
      bucket = DOMAIN_FALLBACK["iot / hardware"];
    } else if (key.includes("ai") || key.includes("ml")) {
      bucket = DOMAIN_FALLBACK["ai / machine learning"];
    } else {
      bucket = DOMAIN_FALLBACK["general software"];
    }
  }
  return {
    datasets: bucket.datasets,
    models: bucket.models,
    provider: "deterministic",
    tier: "tier_3_deterministic_local",
  };
}

/**
 * discoverProjectResources
 * ------------------------
 * Main entry point used by the Project AI "AI & Dataset Resources" feature.
 *
 * @param {object} params
 * @param {object} params.project - Project mongoose document or lean object.
 * @param {object} params.team    - Team mongoose document or lean object.
 * @returns {Promise<{datasets: object[], models: object[], provider: string, tier: string, aiEnhanced: boolean}>}
 */
export async function discoverProjectResources({ project, team }) {
  const snapshot = buildProjectSnapshot(project, team);
  const userPrompt = `Suggest resources for the following project.\n${buildPrompt(snapshot)}`;

  let aiResult = null;
  let provider = "deterministic";
  let tier = "tier_3_deterministic_local";
  let aiEnhanced = false;
  try {
    const response = await omniRouteGenerate({
      systemPrompt: buildSystemPrompt(),
      prompt: userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: 1400,
      timeoutMs: 12000,
    });
    if (response && response.content) {
      try {
        aiResult = JSON.parse(response.content);
        provider = response.provider || "deterministic";
        tier = response.tier || tier;
        aiEnhanced = true;
      } catch {
        aiResult = null;
      }
    }
  } catch {
    aiResult = null;
  }

  if (aiResult) {
    return {
      datasets: normalizeDatasets(aiResult.datasets, project),
      models: normalizeModels(aiResult.models, project),
      provider,
      tier,
      aiEnhanced,
    };
  }

  const fallback = deterministicFallback(snapshot);
  return {
    datasets: normalizeDatasets(fallback.datasets, project),
    models: normalizeModels(fallback.models, project),
    provider: fallback.provider,
    tier: fallback.tier,
    aiEnhanced: false,
  };
}