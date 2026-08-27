/**
 * AiTaskAssistant.tsx — "✨ Generate With AI" panel inside the Create Task modal.
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 4: Team-aware AI Project Copilot with 5 modes:
 *   • Related task   — a new task specific to this project
 *   • Missing phase  — detects a gap in the current backlog
 *   • Subtasks       — breaks down an existing task
 *   • Project Plan   — structured tech/research/risk plan (NEW)
 *   • Architecture   — architecture-level tasks
 *   • Research       — research spike tasks
 *
 * Calls POST /api/teams/:teamId/ai-suggest (which reuses Greedy, decomposer,
 * Boyer-Moore, Merge Sort, topological reasoning).
 * AI proposes → Greedy/Topo/Branch&Bound still own the final evaluation.
 * Does NOT persist — onApply pre-fills the form, user saves manually.
 */
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@/hooks/useTeamTasks";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, PRIORITY_META } from "@/theme";

type Mode = "related" | "missing-phase" | "subtasks" | "project-plan" | "architecture" | "research";
const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "related",       label: "Related",        icon: "git-branch-outline" },
  { key: "missing-phase", label: "Missing phase",   icon: "layers-outline" },
  { key: "subtasks",      label: "Subtasks",        icon: "list-outline" },
  { key: "project-plan",  label: "Project Plan",    icon: "map-outline" },
  { key: "architecture",  label: "Architecture",    icon: "hardware-chip-outline" },
  { key: "research",      label: "Research",         icon: "book-outline" },
];

type Suggest = (mode: string, taskId?: string) => Promise<{ error?: string; task?: any; explanation?: any; plan?: any }>;

export default function AiTaskAssistant({
  tasks, suggest, onApply,
}: {
  tasks: Task[];
  suggest: Suggest;
  onApply: (task: any) => void;
}) {
  const toast = useToast();
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState<Mode>("related");
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [explain, setExplain] = useState<any | null>(null);
  const [plan, setPlan]       = useState<any | null>(null); // populated for project-plan mode

  const generate = async () => {
    if (mode === "subtasks" && !parentId) { toast("Pick a task to break down", "error"); return; }
    setBusy(true);
    setPlan(null);
    const { error, task, explanation, plan: planData } = await suggest(mode, mode === "subtasks" ? (parentId ?? undefined) : undefined);
    setBusy(false);
    if (error || !task) { toast(error ?? "No suggestion available", "error"); return; }
    onApply(task);
    setExplain(explanation);
    if (planData) setPlan(planData);
    toast(mode === "project-plan" ? "Plan generated — review below" : "Form filled — review & save", "success");
  };

  // Mode descriptions shown as hint text
  const MODE_HINTS: Record<Mode, string> = {
    "related":       "Suggests a new task specifically related to your project domain, validated against your existing backlog using Boyer-Moore.",
    "missing-phase": "Identifies a critical development phase (e.g., Testing, Deployment) that is missing from your current backlog.",
    "subtasks":      "Breaks an existing task into concrete subtasks. Topological Sort places them after their parent in execution order.",
    "project-plan":  "Generates a complete project plan: tech stack recommendations, research topics, risks, and immediate next steps.",
    "architecture":  "Suggests tasks based on your project's architecture components and technical layers.",
    "research":      "Generates research spike tasks tailored to your project domain and unresolved technical questions.",
  };
  const currentHint = MODE_HINTS[mode];

  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => setOpen((o) => !o)}>
        <Ionicons name="sparkles" size={16} color={colors.accentDark} />
        <Text style={s.headerTxt}>Generate With AI</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.accentDark} />
      </Pressable>

      {open && (
        <View style={{ gap: spacing.sm }}>
          <View style={s.contextPill}>
            <Ionicons name="shield-checkmark" size={12} color={colors.accentDark} />
            <Text style={s.contextPillText}>Project Context Active — Greedy · Boyer-Moore · Topo</Text>
          </View>

          {/* Mode selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.modeRow}>
            {MODES.map((m) => {
              const on = mode === m.key;
              return (
                <Pressable key={m.key} onPress={() => { setMode(m.key); setExplain(null); setPlan(null); }} style={[s.mode, on && s.modeOn]}>
                  <Ionicons name={m.icon} size={14} color={on ? "#fff" : colors.accentDark} />
                  <Text style={[s.modeTxt, on && { color: "#fff" }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Mode hint */}
          <Text style={s.hint}>{currentHint}</Text>

          {/* Subtask parent picker */}
          {mode === "subtasks" && (
            <View style={{ gap: 4 }}>
              <Text style={s.pickLabel}>Break down which task?</Text>
              {tasks.length === 0 ? (
                <Text style={s.hint}>No tasks yet to break down.</Text>
              ) : (
                <ScrollView style={s.picker} nestedScrollEnabled>
                  {tasks.map((t) => (
                    <Pressable key={t._id} onPress={() => setParentId(t._id)} style={[s.pickRow, parentId === t._id && s.pickRowOn]}>
                      <Ionicons name={parentId === t._id ? "radio-button-on" : "radio-button-off"} size={15} color={parentId === t._id ? colors.accentDark : colors.textFaint} />
                      <Text style={s.pickTxt} numberOfLines={1}>{t.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Generate button */}
          <Pressable style={[s.genBtn, busy && { opacity: 0.6 }]} onPress={generate} disabled={busy}>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={s.genTxt}>{busy ? "Generating…" : mode === "project-plan" ? "Generate Project Plan" : "Generate & fill form"}</Text>
          </Pressable>

          {/* ── Why AI suggested this ─────────────────────────────────── */}
          {explain && (
            <View style={s.explain}>
              <Text style={s.explainHead}>Why AI suggested this</Text>

              {/* Project context pill */}
              {(explain.projectTitle || explain.domain) && (
                <View style={s.ctxRow}>
                  {explain.projectTitle ? <CtxTag label={explain.projectTitle} icon="folder-outline" /> : null}
                  {explain.domain ? <CtxTag label={explain.domain} icon="globe-outline" /> : null}
                </View>
              )}

              {/* Keywords */}
              {explain.keywords?.length > 0 && (
                <View style={s.kwRow}>
                  {explain.keywords.map((k: string) => <View key={k} style={s.kw}><Text style={s.kwTxt}>{k}</Text></View>)}
                </View>
              )}

              {explain.missingPhase ? <Row label="Missing phase" value={explain.missingPhase} /> : null}
              <Row label="Priority" value={String(explain.priority ?? "").toUpperCase()} color={PRIORITY_META[(explain.priority as keyof typeof PRIORITY_META)]?.color} />

              {/* DAA stats */}
              <View style={s.statRow}>
                <Stat label="Greedy" value={`${explain.greedyScore}`} />
                <Stat label="Value" value={`${explain.businessValue}/20`} />
                <Stat label="Effort" value={`${explain.effort}h`} />
              </View>

              {/* Reason / dependency reasoning */}
              {explain.reason && explain.reason !== explain.dependencyReasoning && (
                <Text style={s.reason}>{explain.reason}</Text>
              )}
              <Text style={s.reason}>{explain.dependencyReasoning}</Text>

              {/* Alternatives */}
              {explain.alternatives?.length > 0 && (
                <Text style={s.alts}>Alternatives: {explain.alternatives.join(" · ")}</Text>
              )}
            </View>
          )}

          {/* ── Project Plan (only for project-plan mode) ──────────────── */}
          {plan && (
            <View style={s.planWrap}>
              <View style={s.planHeader}>
                <Ionicons name="map-outline" size={14} color={colors.primary} />
                <Text style={s.planTitle}>Project Plan</Text>
              </View>

              {/* Summary */}
              {plan.summary ? <Text style={s.planSummary}>{plan.summary}</Text> : null}

              {/* Core Goal */}
              {plan.coreGoal ? (
                <View style={s.planSection}>
                  <Text style={s.planSectionHead}>🎯 Core Goal</Text>
                  <Text style={s.planSummary}>{plan.coreGoal}</Text>
                </View>
              ) : null}

              {/* Tech Stack Recommendations */}
              {plan.recommendations && (
                <View style={s.planSection}>
                  <Text style={s.planSectionHead}>⚙️ Tech Stack Recommendations</Text>
                  {([
                    ["Frontend", plan.recommendations.frontend],
                    ["Backend", plan.recommendations.backend],
                    ["Database", plan.recommendations.database],
                    ["AI / ML", plan.recommendations.aiMl],
                    ["Hardware", plan.recommendations.hardware],
                    ["APIs", plan.recommendations.apis],
                    ["Tools", plan.recommendations.tools],
                  ] as [string, string[]][]).filter(([, arr]) => Array.isArray(arr) && arr.length > 0).map(([cat, arr]) => (
                    <View key={cat} style={s.techGroup}>
                      <Text style={s.techCat}>{cat}</Text>
                      {arr.map((item, i) => (
                        <Text key={i} style={s.techItem}>• {item}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              {/* Research Topics */}
              {Array.isArray(plan.researchTopics) && plan.researchTopics.length > 0 && (
                <View style={s.planSection}>
                  <Text style={s.planSectionHead}>🔬 Research Topics</Text>
                  {plan.researchTopics.map((r: { topic: string; why: string }, i: number) => (
                    <View key={i} style={s.researchItem}>
                      <Text style={s.researchTopic}>{r.topic}</Text>
                      {r.why ? <Text style={s.researchWhy}>{r.why}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {/* Risks */}
              {Array.isArray(plan.risks) && plan.risks.length > 0 && (
                <View style={s.planSection}>
                  <Text style={s.planSectionHead}>⚠️ Risks & Mitigations</Text>
                  {plan.risks.map((r: { risk: string; mitigation: string }, i: number) => (
                    <View key={i} style={s.riskItem}>
                      <Text style={s.riskText}>Risk: {r.risk}</Text>
                      {r.mitigation ? <Text style={s.riskMit}>↳ {r.mitigation}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {/* Next Steps */}
              {Array.isArray(plan.nextSteps) && plan.nextSteps.length > 0 && (
                <View style={s.planSection}>
                  <Text style={s.planSectionHead}>📋 Next Steps</Text>
                  {plan.nextSteps.map((step: string, i: number) => (
                    <Text key={i} style={s.techItem}>{i + 1}. {step}</Text>
                  ))}
                </View>
              )}

              {/* Effort + Missing phases */}
              <View style={s.planFooter}>
                {plan.estimatedEffort ? (
                  <View style={s.planFooterTag}>
                    <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                    <Text style={s.planFooterTxt}>{plan.estimatedEffort}</Text>
                  </View>
                ) : null}
                {Array.isArray(plan.missingPhases) && plan.missingPhases.length > 0 ? (
                  <View style={[s.planFooterTag, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="alert-circle-outline" size={11} color={colors.warning} />
                    <Text style={[s.planFooterTxt, { color: colors.warning }]}>Missing: {plan.missingPhases.join(", ")}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={[s.kvValue, color && { color, fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}
function CtxTag({ label, icon }: { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.ctxTag}>
      <Ionicons name={icon} size={10} color={colors.primary} />
      <Text style={s.ctxTagTxt} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.accentSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.sm, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerTxt: { flex: 1, fontSize: 13, fontWeight: "800", color: colors.accentDark },
  hint: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },

  contextPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentBorder, alignSelf: "flex-start" },
  contextPillText: { fontSize: 10, fontWeight: "700", color: colors.accentDark },
  modeRow: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  mode: { minWidth: 80, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface },
  modeOn: { backgroundColor: colors.accentDark, borderColor: colors.accentDark },
  modeTxt: { fontSize: 11, fontWeight: "700", color: colors.accentDark },

  pickLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  picker: { maxHeight: 130, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickRowOn: { backgroundColor: colors.accentSoft },
  pickTxt: { flex: 1, fontSize: 12.5, color: colors.text, fontWeight: "500" },

  genBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.accentDark, borderRadius: radius.sm, paddingVertical: 11 },
  genTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // ── Explanation panel ────────────────────────────────────────────────────
  explain: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 6 },
  explainHead: { fontSize: 12, fontWeight: "800", color: colors.text },
  ctxRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  ctxTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  ctxTagTxt: { fontSize: 10, fontWeight: "700", color: colors.primary, maxWidth: 160 },
  kwRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  kw: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  kwTxt: { fontSize: 10, fontWeight: "700", color: colors.primary },
  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kvLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  kvValue: { fontSize: 12, color: colors.text, fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 6 },
  statVal: { fontSize: 14, fontWeight: "800", color: colors.text },
  statLbl: { fontSize: 9, fontWeight: "700", color: colors.textFaint },
  reason: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  alts: { fontSize: 11, color: colors.accentDark, fontWeight: "600", lineHeight: 15 },

  // ── Project Plan panel ────────────────────────────────────────────────────
  planWrap: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary + "33", padding: spacing.sm, gap: 10 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  planTitle: { fontSize: 13, fontWeight: "800", color: colors.primary },
  planSummary: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  planSection: { gap: 5 },
  planSectionHead: { fontSize: 12, fontWeight: "800", color: colors.text, marginBottom: 2 },
  techGroup: { marginBottom: 5 },
  techCat: { fontSize: 11, fontWeight: "700", color: colors.accentDark, marginBottom: 2 },
  techItem: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  researchItem: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 7, marginBottom: 4 },
  researchTopic: { fontSize: 12, fontWeight: "700", color: colors.text },
  researchWhy: { fontSize: 11, color: colors.textMuted, lineHeight: 15, marginTop: 2 },
  riskItem: { backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: 7, marginBottom: 4 },
  riskText: { fontSize: 11, fontWeight: "700", color: colors.text },
  riskMit: { fontSize: 11, color: colors.textMuted, lineHeight: 15, marginTop: 2 },
  planFooter: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  planFooterTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  planFooterTxt: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
});

