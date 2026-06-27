/**
 * AiTaskAssistant.tsx — "✨ Generate With AI" panel inside the Create Task modal.
 * ---------------------------------------------------------------------------------
 * Team-aware AI assistance with three modes (Related task / Missing phase /
 * Subtasks). Calls the server /ai-suggest endpoint (which reuses Greedy,
 * decomposer, Boyer-Moore, Merge Sort, topological reasoning), auto-fills the
 * task form via onApply, and shows a "Why AI suggested this" explanation panel.
 * The manual creation flow is untouched — this only pre-fills the form.
 */
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@/hooks/useTeamTasks";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, PRIORITY_META } from "@/theme";

type Mode = "related" | "missing-phase" | "subtasks";
const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "related", label: "Related task", icon: "git-branch-outline" },
  { key: "missing-phase", label: "Missing phase", icon: "layers-outline" },
  { key: "subtasks", label: "Subtasks", icon: "list-outline" },
];

type Suggest = (mode: string, taskId?: string) => Promise<{ error?: string; task?: any; explanation?: any }>;

export default function AiTaskAssistant({
  tasks, suggest, onApply,
}: {
  tasks: Task[];
  suggest: Suggest;
  onApply: (task: any) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("related");
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState<any | null>(null);

  const generate = async () => {
    if (mode === "subtasks" && !parentId) { toast("Pick a task to break down", "error"); return; }
    setBusy(true);
    const { error, task, explanation } = await suggest(mode, mode === "subtasks" ? (parentId ?? undefined) : undefined);
    setBusy(false);
    if (error || !task) { toast(error ?? "No suggestion available", "error"); return; }
    onApply(task);
    setExplain(explanation);
    toast("Form filled — review & save", "success");
  };

  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => setOpen((o) => !o)}>
        <Ionicons name="sparkles" size={16} color={colors.accentDark} />
        <Text style={s.headerTxt}>Generate With AI</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.accentDark} />
      </Pressable>

      {open && (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.hint}>Team-aware — suggestions stay within this project. Greedy priority, decomposer & Boyer-Moore power the picks.</Text>

          <View style={s.modeRow}>
            {MODES.map((m) => {
              const on = mode === m.key;
              return (
                <Pressable key={m.key} onPress={() => setMode(m.key)} style={[s.mode, on && s.modeOn]}>
                  <Ionicons name={m.icon} size={14} color={on ? "#fff" : colors.accentDark} />
                  <Text style={[s.modeTxt, on && { color: "#fff" }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

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

          <Pressable style={[s.genBtn, busy && { opacity: 0.6 }]} onPress={generate} disabled={busy}>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={s.genTxt}>{busy ? "Generating…" : "Generate & fill form"}</Text>
          </Pressable>

          {/* Why AI suggested this */}
          {explain && (
            <View style={s.explain}>
              <Text style={s.explainHead}>Why AI suggested this</Text>
              {explain.keywords?.length > 0 && (
                <View style={s.kwRow}>
                  {explain.keywords.map((k: string) => <View key={k} style={s.kw}><Text style={s.kwTxt}>{k}</Text></View>)}
                </View>
              )}
              {explain.missingPhase ? <Row label="Missing phase" value={explain.missingPhase} /> : null}
              <Row label="Priority" value={String(explain.priority ?? "").toUpperCase()} color={PRIORITY_META[(explain.priority as keyof typeof PRIORITY_META)]?.color} />
              <View style={s.statRow}>
                <Stat label="Greedy" value={`${explain.greedyScore}`} />
                <Stat label="Value" value={`${explain.businessValue}/20`} />
                <Stat label="Effort" value={`${explain.effort}h`} />
              </View>
              <Text style={s.reason}>{explain.dependencyReasoning}</Text>
              {explain.alternatives?.length > 0 && (
                <Text style={s.alts}>Alternatives: {explain.alternatives.join(" · ")}</Text>
              )}
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

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.accentSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.sm, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerTxt: { flex: 1, fontSize: 13, fontWeight: "800", color: colors.accentDark },
  hint: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },

  modeRow: { flexDirection: "row", gap: 6 },
  mode: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface },
  modeOn: { backgroundColor: colors.accentDark, borderColor: colors.accentDark },
  modeTxt: { fontSize: 11, fontWeight: "700", color: colors.accentDark },

  pickLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  picker: { maxHeight: 130, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickRowOn: { backgroundColor: colors.accentSoft },
  pickTxt: { flex: 1, fontSize: 12.5, color: colors.text, fontWeight: "500" },

  genBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.accentDark, borderRadius: radius.sm, paddingVertical: 11 },
  genTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  explain: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 6 },
  explainHead: { fontSize: 12, fontWeight: "800", color: colors.text },
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
});
