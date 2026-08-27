/**
 * server/utils/projectContextBuilder.js
 * ============================================================================
 * PHASE 4 — Compact Project Context Builder for /ai-suggest endpoint.
 *
 * Builds a token-efficient, team-aware context object from Team + Task models.
 * Does NOT require a Project model document — works for any team regardless of
 * whether they have created a formal Project via the /api/projects endpoint.
 *
 * This is intentionally SEPARATE from the heavy buildProjectContext() in
 * services/projectIntelligence.js which requires the full Project/Decision/
 * ArchitectureComponent/Recommendation/ResearchItem model chain.
 *
 * Philosophy:
 *   AI proposes. Existing DAA evaluates. Keep context lean.
 *   Only include information the AI actually needs. Prevent huge prompts.
 * ============================================================================
 */

import Team from "../models/Team.js";
import Task from "../models/Task.js";

// Domain signal detection (mirrors keyword signals in projectDecomposer.js)
const DOMAIN_SIGNALS = [
  { re: /\b(iot|sensor|sensors|esp32|arduino|raspberry|microcontroller|hardware|gpio|mqtt|valve|pump)\b/i, domain: "IoT / Hardware" },
  { re: /\b(machine learning|ml|ai|neural|nlp|vision|prediction|recommendation|model|dataset|training|inference|llm|gpt)\b/i, domain: "AI / Machine Learning" },
  { re: /\b(mobile|react native|flutter|android|ios|app)\b/i, domain: "Mobile Application" },
  { re: /\b(blockchain|web3|smart contract|nft|defi|ethereum|solidity)\b/i, domain: "Blockchain / Web3" },
  { re: /\b(healthcare|medical|patient|hospital|clinical|ehr|diagnosis)\b/i, domain: "Healthcare" },
  { re: /\b(ecommerce|e-commerce|shopping|cart|payment|checkout|inventory|product)\b/i, domain: "E-Commerce" },
  { re: /\b(education|learning|student|course|quiz|lms|classroom|tutor)\b/i, domain: "Education / EdTech" },
  { re: /\b(finance|banking|fintech|trading|stock|portfolio|investment|budget)\b/i, domain: "Finance / FinTech" },
  { re: /\b(social|community|forum|feed|post|follow|message|chat)\b/i, domain: "Social Platform" },
  { re: /\b(agriculture|farm|crop|irrigation|soil|harvest|weather)\b/i, domain: "AgriTech" },
];

function detectDomain(text) {
  for (const { re, domain } of DOMAIN_SIGNALS) {
    if (re.test(text)) return domain;
  }
  return "General Software";
}

const HARDWARE_RE = /\b(iot|sensor|esp32|esp8266|arduino|raspberry|microcontroller|gpio|mqtt|actuator|valve|pump|relay|wearable|camera|gps|rfid|hardware|device)\b/i;
const AI_ML_RE    = /\b(ai|ml|machine learning|model|prediction|neural|nlp|vision|recommend|dataset|training|inference|llm|gpt|classification|regression|clustering)\b/i;
const REALTIME_RE = /\b(realtime|real-time|live|socket|websocket|stream|notification|alert|messaging|chat|push)\b/i;

/**
 * buildCompactProjectContext(teamId)
 *
 * Returns a compact context object for use in AI prompt construction.
 * Caps existing tasks at 20 and members at 10 to prevent prompt bloat.
 *
 * @param {string} teamId  MongoDB ObjectId string
 * @returns {Promise<object>} ProjectContext
 */
export async function buildCompactProjectContext(teamId) {
  const [team, allTasks] = await Promise.all([
    Team.findById(teamId).lean(),
    Task.find({ teamId })
      .select("_id title category status urgency impact estimatedHours businessValue dependencies")
      .lean(),
  ]);

  if (!team) throw new Error("team_not_found");

  const projectTitle       = team.projectTitle || team.name;
  const projectDescription = team.projectDescription || "";
  const combinedText       = `${projectTitle} ${projectDescription}`;

  const domain        = detectDomain(combinedText);
  const needsHardware = HARDWARE_RE.test(combinedText);
  const needsAiMl     = AI_ML_RE.test(combinedText);
  const needsRealtime = REALTIME_RE.test(combinedText);

  // Unique categories present in the existing backlog
  const categories = [...new Set(allTasks.map((t) => t.category).filter(Boolean))];

  // Compact task list (cap at 20, most recently created appear last by default)
  const compactTasks = allTasks.slice(-20).map((t) => ({
    id:       t._id.toString(),
    title:    t.title,
    category: t.category || "General",
    status:   t.status,
  }));

  // Compact member list (cap at 10, name + role only — no skill details needed for AI suggest)
  const members = (team.members || []).slice(0, 10).map((m) => ({
    name: m.name || "Member",
    role: m.role || "member",
  }));

  return {
    teamName:           team.name,
    projectTitle,
    projectDescription,
    domain,
    needsHardware,
    needsAiMl,
    needsRealtime,
    taskCount:          allTasks.length,
    doneCount:          team.doneCount || 0,
    existingTasks:      compactTasks,
    categories,
    members,
    // Raw tasks retained for Boyer-Moore dedup in the calling route
    _rawTasks:          allTasks,
  };
}
