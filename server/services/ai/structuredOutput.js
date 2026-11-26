/**
 * server/services/ai/structuredOutput.js — NEXUSFLOW Phase 4 (Task 6)
 * Strict validation of model output before it can become application data.
 *
 * Pipeline: size check → JSON parse (no eval, fence stripping only) →
 * structural safety (no "$"/"." keys, no prototype keys, bounded depth) →
 * schema (allowed keys, types, bounds) → caller's workspace-scoped reference
 * checks → deterministic DAA computation → preview / approved persistence.
 * Invalid items are rejected with reasons; nothing is "repaired" by guessing.
 */

export class StructuredOutputError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "StructuredOutputError";
    this.code = code;
    this.details = details;
  }
}

const FORBIDDEN_KEY = /^\$|\.|^__proto__$|^constructor$|^prototype$/;

export function assertSafeStructure(value, { maxDepth = 6, maxKeys = 4000 } = {}) {
  let keys = 0;
  const walk = (v, depth) => {
    if (depth > maxDepth) throw new StructuredOutputError("TOO_DEEP", "AI output nesting is too deep.");
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) {
        if (++keys > maxKeys) throw new StructuredOutputError("TOO_LARGE", "AI output has too many fields.");
        if (FORBIDDEN_KEY.test(k)) throw new StructuredOutputError("UNSAFE_KEY", `AI output contains a forbidden key "${k.slice(0, 40)}".`);
        walk(v[k], depth + 1);
      }
    } else if (typeof v === "number" && !Number.isFinite(v)) {
      throw new StructuredOutputError("NON_FINITE", "AI output contains a non-finite number.");
    }
  };
  walk(value, 0);
  return value;
}

/** parseModelJson(text) — strict JSON parse of a model response (no eval). */
export function parseModelJson(text, { maxChars = 100_000 } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new StructuredOutputError("EMPTY", "AI output is empty.");
  if (text.length > maxChars) throw new StructuredOutputError("TOO_LARGE", "AI output exceeds the size limit.");
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Deterministic extraction of a single top-level JSON object/array if prose surrounds it.
  if (!/^[\[{]/.test(t)) {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  let parsed;
  try { parsed = JSON.parse(t); } catch { throw new StructuredOutputError("MALFORMED_JSON", "AI output is not valid JSON."); }
  return assertSafeStructure(parsed);
}

const isStr = (v, max, min = 1) => typeof v === "string" && v.trim().length >= min && v.length <= max;
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export const TASK_LIMITS = Object.freeze({ maxTasks: 30, title: 120, description: 2000, reason: 500, list: 10, listItem: 120, maxHours: 400 });
const TASK_KEYS = new Set(["title", "description", "category", "phase", "urgency", "impact", "estimatedHours", "businessValue", "skillWeights", "dependsOnTitles", "reason", "acceptanceCriteria", "requiredSkills", "priority"]);
const SKILL_KEYS = ["frontend", "backend", "devops", "design", "ml", "testing"];
const CATEGORIES = ["Planning", "Research", "Hardware", "Backend", "AI / ML", "Frontend", "Integration", "Testing", "Deployment", "Security", "General"];
const PHASES = ["requirements", "design", "implementation", "testing", "deployment", "maintenance"];

/**
 * validateTaskDecomposition(data) → { tasks, rejected:[{index, reasons}] }
 * Items with unexpected fields (e.g. role, assignee, teamId, _id), invalid
 * numbers, negative/oversized effort or oversized strings are REJECTED.
 */
export function validateTaskDecomposition(data, limits = TASK_LIMITS) {
  assertSafeStructure(data);
  const list = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : null;
  if (!list) throw new StructuredOutputError("MISSING_TASKS", "AI output has no task list.");
  if (list.length > limits.maxTasks * 2) throw new StructuredOutputError("TOO_MANY", `AI output lists ${list.length} tasks (max ${limits.maxTasks}).`);
  const tasks = [], rejected = [], seen = new Set();
  list.forEach((t, index) => {
    const reasons = [];
    if (!t || typeof t !== "object" || Array.isArray(t)) { rejected.push({ index, reasons: ["not an object"] }); return; }
    const extra = Object.keys(t).filter((k) => !TASK_KEYS.has(k));
    if (extra.length) reasons.push(`unexpected field(s): ${extra.slice(0, 5).join(", ")}`);
    if (!isStr(t.title, limits.title)) reasons.push("title missing or too long");
    if (t.description !== undefined && !(typeof t.description === "string" && t.description.length <= limits.description)) reasons.push("description invalid");
    if (t.reason !== undefined && !(typeof t.reason === "string" && t.reason.length <= limits.reason)) reasons.push("reason invalid");
    const urgency = t.urgency === undefined ? 3 : num(t.urgency);
    const impact = t.impact === undefined ? 3 : num(t.impact);
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) reasons.push("urgency must be an integer 1–5");
    if (!Number.isInteger(impact) || impact < 1 || impact > 5) reasons.push("impact must be an integer 1–5");
    let estimatedHours = null;
    if (t.estimatedHours !== undefined && t.estimatedHours !== null) {
      estimatedHours = num(t.estimatedHours);
      if (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > limits.maxHours) reasons.push("estimatedHours must be > 0 and ≤ 400");
    }
    let businessValue = null;
    if (t.businessValue !== undefined && t.businessValue !== null) {
      businessValue = num(t.businessValue);
      if (!Number.isFinite(businessValue) || businessValue < 0 || businessValue > 20) reasons.push("businessValue must be 0–20");
    }
    let category = "General";
    if (t.category !== undefined) {
      const m = typeof t.category === "string" && CATEGORIES.find((c) => c.toLowerCase() === t.category.trim().toLowerCase());
      if (!m) reasons.push("unknown category"); else category = m;
    }
    let phase;
    if (t.phase !== undefined) {
      if (typeof t.phase !== "string" || !PHASES.includes(t.phase.toLowerCase())) reasons.push("unknown phase"); else phase = t.phase.toLowerCase();
    }
    const strList = (v, field) => {
      if (v === undefined) return [];
      if (!Array.isArray(v) || v.length > limits.list || v.some((x) => !isStr(x, limits.listItem))) { reasons.push(`${field} invalid`); return []; }
      return v.map((x) => x.trim());
    };
    const dependsOnTitles = strList(t.dependsOnTitles, "dependsOnTitles");
    const acceptanceCriteria = strList(t.acceptanceCriteria, "acceptanceCriteria");
    const requiredSkills = strList(t.requiredSkills, "requiredSkills");
    let skillWeights = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0]));
    if (t.skillWeights !== undefined) {
      const sw = t.skillWeights;
      if (!sw || typeof sw !== "object" || Array.isArray(sw) || Object.keys(sw).some((k) => !SKILL_KEYS.includes(k))) reasons.push("skillWeights invalid");
      else for (const k of SKILL_KEYS) {
        if (sw[k] === undefined) continue;
        const v = num(sw[k]);
        if (!Number.isFinite(v) || v < 0 || v > 10) reasons.push(`skillWeights.${k} must be 0–10`); else skillWeights[k] = v;
      }
    }
    const title = isStr(t.title, limits.title) ? t.title.trim().replace(/\s+/g, " ") : "";
    const norm = title.toLowerCase();
    if (title && seen.has(norm)) reasons.push("duplicate title");
    if (tasks.length >= limits.maxTasks) reasons.push("task limit reached");
    if (reasons.length) { rejected.push({ index, reasons }); return; }
    seen.add(norm);
    tasks.push({
      title, description: (t.description || "").trim(), category, ...(phase ? { phase } : {}),
      urgency, impact, estimatedHours, businessValue, skillWeights,
      dependsOnTitles, acceptanceCriteria, requiredSkills, reason: (t.reason || "").trim(),
    });
  });
  // Dependencies may only reference titles in this batch or caller-supplied existing titles (checked by caller).
  return { tasks, rejected };
}

/** Plain-text title lines (chat @ai flow) → bounded, de-duplicated titles. */
export function validateTitleLines(text, { maxTasks = 25, maxLen = 120 } = {}) {
  if (typeof text !== "string") throw new StructuredOutputError("EMPTY", "AI output is empty.");
  if (text.length > 20_000) throw new StructuredOutputError("TOO_LARGE", "AI output exceeds the size limit.");
  const out = [], seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line || line.length > maxLen || /[{}$<>`]/.test(line)) continue;
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= maxTasks) break;
  }
  return out;
}

/** Quiz: exactly 5 questions, 4 non-empty distinct options, correctIndex 0–3. */
export function validateQuizOutput(data) {
  assertSafeStructure(data);
  const qs = data?.questions;
  if (!Array.isArray(qs) || qs.length !== 5) throw new StructuredOutputError("QUIZ_SHAPE", "Quiz must contain exactly 5 questions.");
  const seen = new Set();
  return {
    questions: qs.map((q, i) => {
      const extra = q && typeof q === "object" ? Object.keys(q).filter((k) => !["question", "options", "correctIndex", "explanation"].includes(k)) : [];
      if (!q || typeof q !== "object" || extra.length) throw new StructuredOutputError("QUIZ_FIELDS", `Question ${i + 1} has unexpected fields.`);
      if (!isStr(q.question, 400)) throw new StructuredOutputError("QUIZ_QUESTION", `Question ${i + 1} text invalid.`);
      const key = q.question.trim().toLowerCase();
      if (seen.has(key)) throw new StructuredOutputError("QUIZ_DUPLICATE", "Duplicate quiz question.");
      seen.add(key);
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !isStr(o, 200)) || new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) {
        throw new StructuredOutputError("QUIZ_OPTIONS", `Question ${i + 1} must have 4 distinct options.`);
      }
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) throw new StructuredOutputError("QUIZ_ANSWER", `Question ${i + 1} has an invalid answer index.`);
      if (q.explanation !== undefined && !(typeof q.explanation === "string" && q.explanation.length <= 600)) throw new StructuredOutputError("QUIZ_EXPLANATION", "Explanation invalid.");
      return { question: q.question.trim(), options: q.options.map((o) => o.trim()), correctIndex: q.correctIndex, explanation: (q.explanation || "").trim() };
    }),
  };
}
