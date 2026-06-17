/**
 * AlgoExplain.tsx — Feature 9: "Why is this recommended?" explanation mode.
 * ---------------------------------------------------------------------------------
 * A reusable, dependency-free explanation surface used across the workspace so
 * mentors can see exactly which DAA algorithm produced each recommendation,
 * with its Input, Output, Complexity and a plain-English reason.
 *
 *   <WhyButton onPress={…} />                      // the trigger chip
 *   <AlgoExplainSheet visible … entries={[…]} />   // the explanation modal
 *
 * `ALGO_INFO` is the single client-side registry of algorithm metadata
 * (mirrors the server's algorithmSummary) so labels/complexity stay consistent.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet } from "@/components/feedback";
import { colors, spacing, radius } from "@/theme";

export type AlgoKey =
  | "greedy" | "greedyRoi" | "knapsack" | "topo" | "dfs" | "bfs"
  | "merge" | "boyer" | "branch";

export const ALGO_INFO: Record<AlgoKey, { name: string; color: string; time: string; space: string; family: string }> = {
  greedy:    { name: "Greedy Priority Scheduler", color: colors.greedy,   time: "O(n log n)", space: "O(n)",     family: "Greedy" },
  greedyRoi: { name: "Greedy Sprint Ranking (value/effort)", color: colors.greedy, time: "O(n log n)", space: "O(n)", family: "Greedy" },
  knapsack:  { name: "0/1 Knapsack (DP)",         color: colors.knapsack, time: "O(n·W)",     space: "O(n·W)",   family: "Dynamic Programming" },
  topo:      { name: "Topological Sort (Kahn)",   color: colors.topo,     time: "O(V+E)",     space: "O(V)",     family: "Graph" },
  dfs:       { name: "Depth-First Search (cycle check)", color: colors.dfs, time: "O(V+E)",    space: "O(V)",     family: "Graph" },
  bfs:       { name: "Breadth-First Search (levels)",    color: colors.bfs, time: "O(V+E)",    space: "O(V)",     family: "Graph" },
  merge:     { name: "Merge Sort (stable)",       color: colors.merge,    time: "O(n log n)", space: "O(n)",     family: "Divide & Conquer" },
  boyer:     { name: "Boyer-Moore-Horspool",      color: colors.boyer,    time: "O(n/m) avg", space: "O(σ)",     family: "String Matching" },
  branch:    { name: "Branch & Bound (assignment)", color: colors.branch, time: "O(n!) pruned", space: "O(n²)",  family: "Branch & Bound" },
};

export type AlgoEntry = {
  algo: AlgoKey;
  input: string;
  output: string;
  reason: string;
};

// ── Trigger chip ─────────────────────────────────────────────────────────────
export function WhyButton({ onPress, label = "Why?", color = colors.primary }: { onPress: () => void; label?: string; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.why, { borderColor: color + "55" }]} hitSlop={6}>
      <Ionicons name="help-circle-outline" size={13} color={color} />
      <Text style={[styles.whyTxt, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ── Explanation sheet ────────────────────────────────────────────────────────
export function AlgoExplainSheet({
  visible, onClose, title = "Why is this recommended?", entries,
}: {
  visible: boolean; onClose: () => void; title?: string; entries: AlgoEntry[];
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose} title={title}>
      {entries.map((e, idx) => {
        const info = ALGO_INFO[e.algo];
        return (
          <View key={idx} style={[styles.card, { borderLeftColor: info.color }]}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: info.color }]} />
              <Text style={styles.algoName}>{info.name}</Text>
              <View style={[styles.familyTag, { backgroundColor: info.color + "1a" }]}>
                <Text style={[styles.familyTxt, { color: info.color }]}>{info.family}</Text>
              </View>
            </View>
            <Row label="Input"  value={e.input} />
            <Row label="Output" value={e.output} />
            <Row label="Reason" value={e.reason} strong />
            <View style={styles.complexity}>
              <Text style={styles.complexityTxt}>Time {info.time}</Text>
              <Text style={styles.complexityDivider}>·</Text>
              <Text style={styles.complexityTxt}>Space {info.space}</Text>
            </View>
          </View>
        );
      })}
    </ModalSheet>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { color: colors.text, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  why: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  whyTxt: { fontSize: 11, fontWeight: "700" },

  card: { borderLeftWidth: 3, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 6, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  algoName: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  familyTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  familyTxt: { fontSize: 10, fontWeight: "700" },

  row: { flexDirection: "row", gap: 8 },
  rowLabel: { width: 56, fontSize: 12, fontWeight: "700", color: colors.textFaint },
  rowValue: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  complexity: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  complexityTxt: { fontSize: 11, fontWeight: "700", color: colors.primary },
  complexityDivider: { color: colors.textFaint },
});
