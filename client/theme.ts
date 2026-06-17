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

// Priority tiers (Greedy Scheduler 0–100 score)
export const priorityTier = (score: number) => {
  if (score >= 80) return { label: "CRITICAL", color: "#B4564B", bg: "#F8ECEA" };
  if (score >= 55) return { label: "HIGH",     color: "#C18A3E", bg: "#FAF2E6" };
  if (score >= 30) return { label: "MEDIUM",   color: "#A98C4A", bg: "#F7F2E6" };
  return              { label: "LOW",      color: "#6B7280", bg: "#F1EFEA" };
};

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
