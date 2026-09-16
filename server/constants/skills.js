/**
 * server/constants/skills.js
 * ============================================================================
 * CANONICAL SKILL TAXONOMY — NEXUSFLOW V4.0
 *
 * Rules:
 * 1. ROLE != SKILL WHITELIST: A role recommends skills, but the user is free
 *    to select and verify ANY canonical skill.
 * 2. Uniqueness: Each skill has a unique canonical ID and name.
 * 3. Canonical categories:
 *    - Software Development
 *    - Database
 *    - Cloud & Infrastructure
 *    - AI / Machine Learning
 *    - Cybersecurity
 *    - Blockchain & Web3
 *    - UI/UX & Design
 *    - Testing & Quality
 *    - Requirements & Process
 * ============================================================================
 */

export const SKILL_CATEGORIES = Object.freeze([
  "Software Development",
  "Database",
  "Cloud",
  "AI/ML",
  "Cybersecurity",
  "Blockchain/Web3",
  "UI/UX",
  "Design",
  "Testing",
  "Requirements & Process",
]);

export const CANONICAL_SKILLS = Object.freeze([
  // ── Software Development ──
  { id: "frontend", name: "Frontend", category: "Software Development", recommendedRoles: ["member"] },
  { id: "backend", name: "Backend", category: "Software Development", recommendedRoles: ["member", "leader"] },
  { id: "fullstack", name: "Full Stack", category: "Software Development", recommendedRoles: ["member", "leader"] },
  { id: "javascript", name: "JavaScript", category: "Software Development", recommendedRoles: ["member", "leader"] },
  { id: "typescript", name: "TypeScript", category: "Software Development", recommendedRoles: ["member", "leader"] },
  { id: "react", name: "React", category: "Software Development", recommendedRoles: ["member"] },
  { id: "nodejs", name: "Node.js", category: "Software Development", recommendedRoles: ["member", "leader"] },
  { id: "python", name: "Python", category: "Software Development", recommendedRoles: ["member"] },
  { id: "java", name: "Java", category: "Software Development", recommendedRoles: ["member"] },
  { id: "cpp", name: "C++", category: "Software Development", recommendedRoles: ["member"] },
  { id: "angular", name: "Angular", category: "Software Development", recommendedRoles: ["member"] },
  { id: "vue", name: "Vue", category: "Software Development", recommendedRoles: ["member"] },

  // ── Database ──
  { id: "sql", name: "SQL", category: "Database", recommendedRoles: ["manager", "member"] },
  { id: "postgresql", name: "PostgreSQL", category: "Database", recommendedRoles: ["member"] },
  { id: "mongodb", name: "MongoDB", category: "Database", recommendedRoles: ["member"] },
  { id: "database_design", name: "Database Design", category: "Database", recommendedRoles: ["leader", "member"] },

  // ── Cloud & Infrastructure ──
  { id: "devops", name: "DevOps", category: "Cloud", recommendedRoles: ["leader"] },
  { id: "docker", name: "Docker", category: "Cloud", recommendedRoles: ["leader", "manager"] },
  { id: "kubernetes", name: "Kubernetes", category: "Cloud", recommendedRoles: ["leader"] },
  { id: "cicd", name: "CI/CD", category: "Cloud", recommendedRoles: ["leader"] },
  { id: "aws", name: "AWS", category: "Cloud", recommendedRoles: ["leader"] },
  { id: "azure", name: "Azure", category: "Cloud", recommendedRoles: ["leader"] },

  // ── AI / Machine Learning ──
  { id: "ml", name: "AI/ML", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "deep_learning", name: "Deep Learning", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "generative_ai", name: "Generative AI", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "llms", name: "LLMs", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "rag", name: "RAG", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "ai_agents", name: "AI Agents", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "prompt_engineering", name: "Prompt Engineering", category: "AI/ML", recommendedRoles: ["member", "manager"] },
  { id: "llmops", name: "LLMOps", category: "AI/ML", recommendedRoles: ["leader", "member"] },
  { id: "context_engineering", name: "Context Engineering", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "multimodal_ai", name: "Multimodal AI", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "model_evaluation", name: "Model Evaluation", category: "AI/ML", recommendedRoles: ["manager", "member"] },
  { id: "tensorflow", name: "TensorFlow", category: "AI/ML", recommendedRoles: ["member"] },
  { id: "pytorch", name: "PyTorch", category: "AI/ML", recommendedRoles: ["member"] },

  // ── Cybersecurity ──
  { id: "cybersecurity", name: "Cybersecurity", category: "Cybersecurity", recommendedRoles: ["leader", "member"] },
  { id: "network_security", name: "Network Security", category: "Cybersecurity", recommendedRoles: ["leader"] },
  { id: "secure_coding", name: "Secure Coding", category: "Cybersecurity", recommendedRoles: ["leader", "member"] },
  { id: "authentication", name: "Authentication", category: "Cybersecurity", recommendedRoles: ["leader", "member"] },
  { id: "cryptography", name: "Cryptography", category: "Cybersecurity", recommendedRoles: ["member"] },

  // ── Blockchain / Web3 ──
  { id: "blockchain", name: "Blockchain", category: "Blockchain/Web3", recommendedRoles: ["member"] },
  { id: "web3", name: "Web3", category: "Blockchain/Web3", recommendedRoles: ["member"] },
  { id: "smart_contracts", name: "Smart Contracts", category: "Blockchain/Web3", recommendedRoles: ["member"] },

  // ── UI/UX & Design ──
  { id: "design", name: "Design", category: "Design", recommendedRoles: ["member"] },
  { id: "ui_ux", name: "UI/UX", category: "UI/UX", recommendedRoles: ["member"] },
  { id: "figma", name: "Figma", category: "Design", recommendedRoles: ["member"] },

  // ── Testing & Quality ──
  { id: "testing", name: "Testing", category: "Testing", recommendedRoles: ["manager", "leader"] },
  { id: "automation", name: "Automation", category: "Testing", recommendedRoles: ["manager", "member"] },

  // ── Requirements & Process ──
  { id: "requirements_engineering", name: "Requirements Engineering", category: "Requirements & Process", recommendedRoles: ["manager", "leader"] },
  { id: "documentation", name: "Documentation", category: "Requirements & Process", recommendedRoles: ["manager", "member"] },
]);

export const CANONICAL_SKILL_IDS = Object.freeze(CANONICAL_SKILLS.map((s) => s.id));

export const CANONICAL_SKILL_NAMES = Object.freeze(CANONICAL_SKILLS.map((s) => s.name));

const ID_MAP = new Map(CANONICAL_SKILLS.map((s) => [s.id.toLowerCase(), s]));
const NAME_MAP = new Map(CANONICAL_SKILLS.map((s) => [s.name.toLowerCase(), s]));

/**
 * Normalise any skill string to its canonical skill object, or null if unknown
 */
export function findCanonicalSkill(query) {
  if (!query || typeof query !== "string") return null;
  const q = query.trim().toLowerCase();
  return ID_MAP.get(q) || NAME_MAP.get(q) || null;
}

/**
 * Returns recommended skills for a given role (recommendations only, not restrictions)
 */
export function getRecommendedSkillsForRole(role) {
  if (!role || typeof role !== "string") return [];
  const r = role.trim().toLowerCase();
  return CANONICAL_SKILLS.filter((s) => s.recommendedRoles.includes(r));
}

/**
 * Returns skills grouped by category
 */
export function getSkillsByCategory(category) {
  if (!category || typeof category !== "string") return [];
  const cat = category.trim().toLowerCase();
  return CANONICAL_SKILLS.filter((s) => s.category.toLowerCase() === cat);
}
