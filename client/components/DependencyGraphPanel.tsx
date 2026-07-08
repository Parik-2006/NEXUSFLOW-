/**
 * DependencyGraphPanel — Execution Roadmap (Topological Sort / Kahn's).
 * ---------------------------------------------------------------------------------
 * Presentational: receives the dependency graph (already fetched by GraphPanel
 * via useDependencyGraph) and renders the ordered Step → Task roadmap with
 * priority, status, assignee, deadline and "Depends on" details, plus a cycle
 * warning when the DAG is broken. No fetching, no ScrollView — the parent
 * page owns both. If no dependencies exist yet, shows "No execution order
 * available." instead of fake steps.
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DependencyGraph } from "@/hooks/useDependencyGraph";
import { colors, radius, PRIORITY_META, priorityKeyFromScore, statusMeta, deadlineMeta } from "@/theme";

const statusColor = (s: string) => statusMeta[s as keyof typeof statusMeta]?.color ?? colors.textMuted;
const statusLabel = (s: string) => statusMeta[s as keyof typeof statusMeta]?.label ?? s;
const tierOf = (score: number) => PRIORITY_META[priorityKeyFromScore(score ?? 0)];

export default function DependencyGraphPanel({ graph }: { graph: DependencyGraph }) {
  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  // No dependencies ⇒ Kahn's has nothing meaningful to sequence.
  if (graph.edges.length === 0) {
    return (
      <View style={s.emptyBox}>
        <Ionicons name="list-outline" size={22} color={colors.textFaint} />
        <Text style={s.emptyTitle}>No execution order available.</Text>
        <Text style={s.emptySub}>Add dependencies between tasks and Topological Sort will generate the roadmap.</Text>
      </View>
    );
  }

  const topoOrder = graph.topoResult.order;

  return (
    <View style={{ gap: 12 }}>
      {graph.topoResult.hasCycle && (
        <View style={s.cycle}>
          <Ionicons name="warning" size={16} color={colors.danger} />
          <Text style={s.cycleTxt}>Circular dependency detected — execution order is partial until the cycle is resolved.</Text>
        </View>
      )}

      <View style={s.roadmap}>
        {topoOrder.map((id, i) => {
          const node = nodeMap.get(id);
          if (!node) return null;
          const tier = tierOf(node.priority);
          const due = node.dueDate ? deadlineMeta(node.dueDate) : null;
          const deps = node.dependencies.map((d) => nodeMap.get(d)?.title).filter(Boolean) as string[];
          return (
            <View key={id}>
              <View style={[s.roadCard, { borderLeftColor: tier.color }]}>
                <View style={[s.step, { backgroundColor: colors.topo }]}>
                  <Text style={s.stepLabel}>STEP</Text>
                  <Text style={s.stepNum}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <View style={s.titleRow}>
                    <Text style={s.title} numberOfLines={2}>{node.title}</Text>
                    <View style={[s.tier, { backgroundColor: tier.bg }]}><Text style={[s.tierTxt, { color: tier.color }]}>{tier.label}</Text></View>
                  </View>
                  <View style={s.metaRow}>
                    <View style={s.metaItem}>
                      <View style={[s.statusDot, { backgroundColor: statusColor(node.status) }]} />
                      <Text style={s.metaTxt}>{statusLabel(node.status)}</Text>
                    </View>
                    <View style={s.metaItem}>
                      <Ionicons name="person-outline" size={12} color={colors.textFaint} />
                      <Text style={s.metaTxt}>{node.assignee ?? "Unassigned"}</Text>
                    </View>
                    {due ? (
                      <View style={s.metaItem}>
                        <Ionicons name="calendar-outline" size={12} color={due.color} />
                        <Text style={[s.metaTxt, { color: due.color, fontWeight: "700" }]}>{due.text}</Text>
                      </View>
                    ) : null}
                  </View>
                  {deps.length > 0 && (
                    <Text style={s.deps} numberOfLines={2}>↳ Depends on: {deps.join(", ")}</Text>
                  )}
                </View>
              </View>
              {i < topoOrder.length - 1 && (
                <View style={s.connectorWrap}>
                  <View style={s.connector} />
                  <Ionicons name="chevron-down" size={14} color={colors.borderStrong} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  emptyBox: {
    alignItems: "center", gap: 6, padding: 28, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  emptySub: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 17 },

  cycle: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.danger + "55" },
  cycleTxt: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600", lineHeight: 17 },

  roadmap: { gap: 0 },
  roadCard: { flexDirection: "row", gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: 12 },
  step: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: "#ffffffcc", fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  stepNum: { color: "#fff", fontSize: 20, fontWeight: "800", lineHeight: 22 },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, fontSize: 14.5, fontWeight: "700", color: colors.text },
  tier: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  tierTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  deps: { fontSize: 11, color: colors.topo, fontWeight: "600", lineHeight: 15 },

  connectorWrap: { alignItems: "center", paddingVertical: 2, marginLeft: 23 },
  connector: { width: 2, height: 10, backgroundColor: colors.borderStrong },
});
