/**
 * DAA Insights — education / demo mode.
 * A dedicated, self-contained reference screen kept OUT of the normal user
 * workflow (reachable only from Profile). For every algorithm it documents
 * purpose, where it runs in the product, sample input/output, complexity and
 * a tiny inline visualization. Intended for mentors and demos.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Badge } from "@/components/ui";
import { colors, spacing, radius, font, layout } from "@/theme";

type Viz = "bars" | "graph" | "grid" | "search";

type Algo = {
  name: string; tag: string; color: string; viz: Viz;
  purpose: string; where: string; input: string; output: string;
  time: string; space: string;
};

const ALGOS: Algo[] = [
  {
    name: "Greedy Scheduler", tag: "Task Prioritization", color: colors.greedy, viz: "bars",
    purpose: "Rank the backlog so the highest-leverage work surfaces first.",
    where: "Tasks tab — every task's priority score (urgency, impact, dependencies).",
    input: "Tasks with urgency, impact and dependency counts.",
    output: "A 0–100 priority score per task, ordered descending.",
    time: "O(n log n)", space: "O(n)",
  },
  {
    name: "0/1 Knapsack", tag: "Sprint Planning", color: colors.knapsack, viz: "grid",
    purpose: "Pick the set of tasks that maximises delivered value within a capacity.",
    where: "Sprint tab — 'Run Knapsack Optimizer' against a capacity in hours.",
    input: "Tasks with estimated hours (weight) and business value, plus capacity.",
    output: "The highest-value task subset that fits, with utilisation %.",
    time: "O(n·W)", space: "O(n·W)",
  },
  {
    name: "Depth-First Search", tag: "Cycle Detection", color: colors.dfs, viz: "graph",
    purpose: "Detect circular dependencies before they break execution order.",
    where: "Dependency graph + adding a dependency — blocks cycles.",
    input: "The task dependency graph (nodes + directed edges).",
    output: "A boolean 'has cycle', and the offending path when present.",
    time: "O(V + E)", space: "O(V)",
  },
  {
    name: "Breadth-First Search", tag: "Dependency Levels", color: colors.bfs, viz: "graph",
    purpose: "Group tasks into dependency 'waves' that can run in parallel.",
    where: "Dependency graph — level layout; AI recommendation readiness.",
    input: "The dependency DAG and a set of root tasks.",
    output: "Level (distance) per task from the roots.",
    time: "O(V + E)", space: "O(V)",
  },
  {
    name: "Topological Sort", tag: "Execution Order", color: colors.topo, viz: "graph",
    purpose: "Produce a valid order so no task starts before its prerequisites.",
    where: "Dependency graph 'execution order' + AI sprint sequencing.",
    input: "A directed acyclic dependency graph.",
    output: "A linear ordering of tasks respecting all dependencies.",
    time: "O(V + E)", space: "O(V)",
  },
  {
    name: "Branch & Bound", tag: "Task Assignment", color: colors.branch, viz: "grid",
    purpose: "Assign tasks to members at the lowest total skill-gap cost.",
    where: "Members tab — 'Run Assignment' over the skill cost matrix.",
    input: "A member × task cost matrix derived from skills.",
    output: "An optimal assignment with explored/pruned node stats.",
    time: "O(n!) pruned", space: "O(n²)",
  },
  {
    name: "Merge Sort", tag: "Task Ordering", color: colors.merge, viz: "bars",
    purpose: "Stable, predictable ordering of tasks by any comparator.",
    where: "Tasks tab sort modes (Priority / Deadline / Progress); analytics.",
    input: "A task list and a comparator (priority, deadline or progress).",
    output: "A stably sorted task list (Θ(n log n) every time).",
    time: "O(n log n)", space: "O(n)",
  },
  {
    name: "Boyer-Moore", tag: "Task Search", color: colors.boyer, viz: "search",
    purpose: "Fast substring search across task titles as you type.",
    where: "Tasks tab + AI panel search boxes (highlighted matches).",
    input: "A search query and the set of task titles.",
    output: "Matching tasks with the matched span highlighted.",
    time: "O(n/m) avg", space: "O(σ)",
  },
];

export default function DAAInsights() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>DAA Insights</Text>
          <Text style={s.headerSub}>Education & demo mode · {ALGOS.length} algorithms</Text>
        </View>
        <View style={s.demoTag}><Ionicons name="school" size={14} color={colors.primary} /><Text style={s.demoTagTxt}>Demo</Text></View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.container}>
          <Text style={s.intro}>
            NexusFlow uses these algorithms behind ordinary product actions — you
            never see them directly. This reference explains what each one does and
            where it runs.
          </Text>
          {ALGOS.map((a) => <AlgoCard key={a.name} a={a} />)}
        </View>
      </ScrollView>
    </View>
  );
}

function AlgoCard({ a }: { a: Algo }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: a.color }}>
      <Pressable style={s.cardHead} onPress={() => setOpen((v) => !v)}>
        <View style={[s.vizWrap, { backgroundColor: a.color + "14" }]}><Viz kind={a.viz} color={a.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{a.name}</Text>
          <Text style={[s.tag, { color: a.color }]}>{a.tag}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
      </Pressable>

      <Text style={s.purpose}>{a.purpose}</Text>
      <View style={s.complexityRow}>
        <Badge label={`Time ${a.time}`} color={a.color} />
        <Badge label={`Space ${a.space}`} color={colors.textMuted} bg={colors.surfaceAlt} />
      </View>

      {open && (
        <View style={s.detail}>
          <Detail icon="navigate-outline" label="Where it runs" value={a.where} />
          <Detail icon="enter-outline" label="Input" value={a.input} />
          <Detail icon="exit-outline" label="Output" value={a.output} />
        </View>
      )}
    </Card>
  );
}

function Detail({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={s.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// Tiny inline visualizations — purely decorative, illustrate the shape of the data.
function Viz({ kind, color }: { kind: Viz; color: string }) {
  if (kind === "bars") {
    const hs = [10, 18, 26, 14, 22];
    return (
      <View style={s.bars}>
        {hs.map((h, i) => <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: color }} />)}
      </View>
    );
  }
  if (kind === "grid") {
    return (
      <View style={s.gridViz}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={[s.gridCell, { backgroundColor: i % 4 === 0 ? color : color + "44" }]} />
        ))}
      </View>
    );
  }
  if (kind === "search") {
    return <Ionicons name="search" size={22} color={color} />;
  }
  // graph
  return (
    <View style={s.graphViz}>
      <View style={[s.node, { backgroundColor: color, top: 2, left: 12 }]} />
      <View style={[s.node, { backgroundColor: color, top: 20, left: 2 }]} />
      <View style={[s.node, { backgroundColor: color, top: 20, left: 22 }]} />
      <View style={[s.edge, { backgroundColor: color + "66", top: 10, left: 8, transform: [{ rotate: "55deg" }] }]} />
      <View style={[s.edge, { backgroundColor: color + "66", top: 10, left: 20, transform: [{ rotate: "-55deg" }] }]} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  demoTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  demoTagTxt: { fontSize: 11, fontWeight: "700", color: colors.primary },

  scroll: { padding: spacing.lg, alignItems: "center" },
  container: { width: "100%", maxWidth: layout.maxWidth, gap: spacing.md },
  intro: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },

  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  vizWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tag: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  purpose: { fontSize: 13, color: colors.text, lineHeight: 19 },
  complexityRow: { flexDirection: "row", gap: 6 },

  detail: { gap: spacing.sm, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  detailRow: { flexDirection: "row", gap: 8 },
  detailLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { fontSize: 13, color: colors.text, lineHeight: 19, marginTop: 1 },

  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28 },
  gridViz: { width: 28, height: 28, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  gridCell: { width: 7, height: 7, borderRadius: 1.5 },
  graphViz: { width: 32, height: 32 },
  node: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  edge: { position: "absolute", width: 14, height: 2, borderRadius: 1 },
});
