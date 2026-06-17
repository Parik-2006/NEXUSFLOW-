/**
 * theme.ts — NexusFlow design tokens
 * Single source of truth for colors, spacing, radius, typography and shadows.
 *
 * Premium "warm editorial" palette — cream surfaces, deep slate primary,
 * sage accent, soft warm shadows. Inspired by Linear spacing, Notion
 * cleanliness and Apple-level restraint. Light mode only. No neon, no
 * bright gradients.
 */
import { Platform } from "react-native";

export const colors = {
  // Brand
  primary:      "#2F4F4F", // deep slate / pine
  primaryDark:  "#243d3d",
  primarySoft:  "#EAF0EE", // soft pine tint for icon wells / pills
  primaryBorder:"#C9D8D4",

  // Accent (sage) — used for AI / success-adjacent highlights
  accent:       "#7D8F69",
  accentDark:   "#67784F",
  accentSoft:   "#EEF1E8",
  accentBorder: "#D2DAC4",

  // Surfaces
  bg:          "#FAF8F4", // warm cream canvas
  surface:     "#FFFFFF",
  surfaceAlt:  "#F4F1EA", // warm neutral inset
  overlay:     "rgba(31, 41, 55, 0.40)",

  // Text
  text:        "#1F2937",
  textMuted:   "#6B7280",
  textFaint:   "#9CA3AF",
  textInverse: "#FFFFFF",

  // Lines
  border:      "#E7E2D9",
  borderStrong:"#D8D1C4",

  // Semantic (muted, warm-leaning)
  success:     "#5C8A5A",
  successSoft: "#EEF3EC",
  warning:     "#C18A3E",
  warningSoft: "#FAF2E6",
  danger:      "#B4564B",
  dangerSoft:  "#F8ECEA",
  info:        "#5B7C8C",
  infoSoft:    "#ECF1F3",

  // Algorithm accents — distinct but muted/warm, never neon.
  greedy:      "#C18A3E", // amber
  knapsack:    "#7D8F69", // sage
  dfs:         "#B4564B", // terracotta
  bfs:         "#5C8A5A", // green
  topo:        "#8A7BA8", // muted plum
  branch:      "#B07A8C", // dusty rose
  merge:       "#5B7C8C", // slate blue
  boyer:       "#5F9090", // teal
};

// Priority tiers — consistent Critical=Red / High=Orange / Medium=Yellow /
// Low=Green semantics across task cards, the graph, sprint, recommendations and
// analytics. Muted/desaturated so they stay within the warm editorial system.
export const PRIORITY_META = {
  critical: { label: "CRITICAL", color: "#DC2626", bg: "#FCEBEA" },
  high:     { label: "HIGH",     color: "#EA580C", bg: "#FBEFE4" },
  medium:   { label: "MEDIUM",   color: "#CA8A04", bg: "#FAF4DF" },
  low:      { label: "LOW",      color: "#16A34A", bg: "#E9F5EC" },
} as const;

export type PriorityKey = keyof typeof PRIORITY_META;

// Map a Greedy score (0–100) to a tier key.
export const priorityKeyFromScore = (score: number): PriorityKey =>
  score >= 80 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";

// Resolve a task's tier: explicit priorityLabel wins, else derive from score.
export const taskPriorityKey = (t: { priorityScore?: number; priorityLabel?: string | null }): PriorityKey =>
  (t.priorityLabel as PriorityKey) && PRIORITY_META[t.priorityLabel as PriorityKey]
    ? (t.priorityLabel as PriorityKey)
    : priorityKeyFromScore(t.priorityScore ?? 0);

// Back-compat: priorityTier(score) → { label, color, bg }
export const priorityTier = (score: number) => PRIORITY_META[priorityKeyFromScore(score)];

// ── Feature 3: Deadline Intelligence ─────────────────────────────────────────
// Colour bands by days-remaining: Green >7 · Orange 3–7 · Red 0–2 · DarkRed overdue.
export const deadlineColors = {
  safe:    "#16A34A", // green
  soon:    "#EA580C", // orange
  urgent:  "#DC2626", // red
  overdue: "#7F1D1D", // dark red
} as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export type DeadlineMeta = {
  hasDate: boolean;
  daysRemaining: number | null;
  overdue: boolean;
  band: keyof typeof deadlineColors | "none";
  color: string;
  text: string;          // human countdown ("12 days left", "Overdue by 3 days")
};

export function deadlineMeta(iso?: string | null): DeadlineMeta {
  if (!iso) return { hasDate: false, daysRemaining: null, overdue: false, band: "none", color: colors.textFaint, text: "No due date" };
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { hasDate: false, daysRemaining: null, overdue: false, band: "none", color: colors.textFaint, text: "No due date" };
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
  if (days < 0)  return { hasDate: true, daysRemaining: days, overdue: true,  band: "overdue", color: deadlineColors.overdue, text: `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""}` };
  if (days <= 2) return { hasDate: true, daysRemaining: days, overdue: false, band: "urgent",  color: deadlineColors.urgent,  text: days === 0 ? "Due today" : `${days} day${days !== 1 ? "s" : ""} left` };
  if (days <= 7) return { hasDate: true, daysRemaining: days, overdue: false, band: "soon",    color: deadlineColors.soon,    text: `${days} days left` };
  return            { hasDate: true, daysRemaining: days, overdue: false, band: "safe",    color: deadlineColors.safe,    text: `${days} days left` };
}

// Deadline Score = BusinessValue / DaysRemaining (urgency-weighted ROI).
// Overdue tasks return a capped-high score; no due date → 0 (cannot rank).
export function deadlineScore(businessValue?: number | null, daysRemaining?: number | null): number {
  const v = Number.isFinite(businessValue as number) && (businessValue as number) > 0 ? (businessValue as number) : 1;
  if (daysRemaining == null) return 0;
  if (daysRemaining <= 0) return Math.round(v * 10) / 10 + 100; // overdue → most urgent
  return Math.round((v / daysRemaining) * 100) / 100;
}

// ── Feature 7: Greedy Scheduler score breakdown (mirrors server formula) ──────
// priorityScore = round((0.5·u + 0.35·i + 0.15·d) · 100), normalised inputs.
export function greedyBreakdown(t: { urgency?: number; impact?: number; dependencyCount?: number; priorityScore?: number }) {
  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
  const urgency = clamp(t.urgency ?? 1, 1, 5);
  const impact  = clamp(t.impact ?? 1, 1, 5);
  const deps    = clamp(t.dependencyCount ?? 0, 0, 20);
  const u = (urgency - 1) / 4, i = (impact - 1) / 4, d = deps / 20;
  const uPts = Math.round(0.5 * u * 100);
  const iPts = Math.round(0.35 * i * 100);
  const dPts = Math.round(0.15 * d * 100);
  const score = t.priorityScore ?? Math.round((0.5 * u + 0.35 * i + 0.15 * d) * 100);
  return { urgency, impact, deps, uPts, iPts, dPts, score };
}

// ── Feature 10: Workspace Health grade labels ─────────────────────────────────
export function healthLabel(score: number): { label: string; color: string } {
  if (score >= 95) return { label: "Excellent", color: colors.success };
  if (score >= 80) return { label: "Healthy", color: colors.accent };
  if (score >= 60) return { label: "Needs Attention", color: colors.warning };
  return { label: "At Risk", color: colors.danger };
}

export const statusMeta = {
  todo:        { label: "To do",       color: "#6B7280", bg: "#F1EFEA" },
  in_progress: { label: "In progress", color: "#5B7C8C", bg: "#ECF1F3" },
  done:        { label: "Done",        color: "#5C8A5A", bg: "#EEF3EC" },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

// Max content width so the web layout reads like a real SaaS app, not a
// stretched mobile screen. Use on the outermost scroll content container.
export const layout = { maxWidth: 920, narrow: 460 };

export const font = {
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6, color: colors.text },
  h2: { fontSize: 21, fontWeight: "800" as const, letterSpacing: -0.4, color: colors.text },
  h3: { fontSize: 16, fontWeight: "700" as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 14, fontWeight: "500" as const, color: colors.text },
  small: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
  tiny: { fontSize: 11, fontWeight: "600" as const, color: colors.textFaint },
};

export const shadow = {
  sm: Platform.select({
    web: { boxShadow: "0 1px 2px rgba(47,79,79,0.05)" } as any,
    default: { shadowColor: "#2F4F4F", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  }),
  md: Platform.select({
    web: { boxShadow: "0 4px 16px rgba(47,79,79,0.07)" } as any,
    default: { shadowColor: "#2F4F4F", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  }),
  lg: Platform.select({
    web: { boxShadow: "0 16px 40px rgba(47,79,79,0.12)" } as any,
    default: { shadowColor: "#2F4F4F", shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  }),
};

// Deterministic avatar color from a name/id — warm, muted set (no neon).
const AVATAR_COLORS = ["#2F4F4F", "#7D8F69", "#C18A3E", "#5C8A5A", "#5B7C8C", "#8A7BA8", "#5F9090", "#B07A8C"];
export const avatarColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
export const initials = (name: string) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
