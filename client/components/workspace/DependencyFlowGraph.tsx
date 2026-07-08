/**
 * DependencyFlowGraph (native fallback) — layered DAG view for iOS/Android.
 * ------------------------------------------------------------------------------
 * The interactive React Flow canvas is DOM-only, so on native we render the
 * same DAG as BFS layers (Kahn levels): every row is a dependency level and
 * arrows point from prerequisites (above) to dependents (below).
 * Metro picks DependencyFlowGraph.web.tsx on web; this file everywhere else.
 */
import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, PRIORITY_META, priorityKeyFromScore, type PriorityKey } from "@/theme";
import type { GraphNode, GraphEdge } from "@/hooks/useDependencyGraph";

const tierOf = (n: GraphNode) => {
  const key: PriorityKey =
    n.priorityLabel && PRIORITY_META[n.priorityLabel as PriorityKey]
      ? (n.priorityLabel as PriorityKey)
      : priorityKeyFromScore(n.priority ?? 0);
  return PRIORITY_META[key];
};

// Kahn longest-path layering — O(V + E). Level k = all tasks whose deepest
// prerequisite chain has length k, so edges always point downwards.
function computeLevels(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[][] {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => {
    adj.get(e.from)?.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  });
  const level = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      level.set(next, Math.max(level.get(next) ?? 0, (level.get(id) ?? 0) + 1));
      indeg.set(next, (indeg.get(next) ?? 1) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  const maxLevel = Math.max(0, ...level.values());
  const rows: GraphNode[][] = Array.from({ length: maxLevel + 1 }, () => []);
  nodes.forEach((n) => rows[level.get(n.id) ?? 0].push(n));
  return rows.filter((r) => r.length > 0);
}

export default function DependencyFlowGraph({ nodes, edges, height = 480 }: {
  nodes: GraphNode[]; edges: GraphEdge[]; height?: number;
}) {
  const rows = useMemo(() => computeLevels(nodes, edges), [nodes, edges]);

  return (
    <ScrollView style={{ height }} contentContainerStyle={s.wrap} nestedScrollEnabled>
      {rows.map((row, i) => (
        <View key={i}>
          <View style={s.row}>
            {row.map((n) => {
              const tier = tierOf(n);
              return (
                <View key={n.id} style={[s.node, { borderLeftColor: tier.color }]}>
                  <Text style={s.nodeTitle} numberOfLines={2}>{n.title}</Text>
                  <View style={[s.tier, { backgroundColor: tier.bg }]}>
                    <Text style={[s.tierTxt, { color: tier.color }]}>{tier.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {i < rows.length - 1 && (
            <View style={s.arrow}>
              <Ionicons name="arrow-down" size={16} color={colors.primary} />
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  node: {
    width: 170, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: 10, gap: 6,
  },
  nodeTitle: { fontSize: 12.5, fontWeight: "700", color: colors.text, lineHeight: 16 },
  tier: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  tierTxt: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.4 },
  arrow: { alignItems: "center", paddingVertical: 6 },
});
