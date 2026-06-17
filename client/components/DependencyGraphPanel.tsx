/**
 * DependencyGraphPanel — redesigned dependency visualization.
 * ---------------------------------------------------------------------------------
 * Two surfaces, both generated dynamically from the live task DAG:
 *   1. Execution Roadmap — the Topological Sort (Kahn's) order rendered as a
 *      vertical Task ↓ Task ↓ Task plan, coloured by priority + status.
 *   2. Dependency Graph — an actual node-link diagram laid out by BFS levels,
 *      with zoom, pan, node-click and dependency highlighting.
 *
 * DFS and BFS still run on the server (powering the layout + cycle detection) but
 * are no longer surfaced as separate tabs — the canonical algorithms are reused,
 * not duplicated.
 */
import React, { useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, PanResponder, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDependencyGraph, GraphNode } from "@/hooks/useDependencyGraph";
import { colors, radius, PRIORITY_META, priorityKeyFromScore, statusMeta, deadlineMeta } from "@/theme";

const NODE_W = 140, NODE_H = 58, COL_GAP = 64, ROW_GAP = 20;

const statusColor = (s: string) => statusMeta[s as keyof typeof statusMeta]?.color ?? colors.textMuted;
const tierOf = (score: number) => PRIORITY_META[priorityKeyFromScore(score ?? 0)];

export default function DependencyGraphPanel({ teamId }: { teamId: string }) {
  const { graph, loading, error, refetch } = useDependencyGraph(teamId);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.primary} /><Text style={s.muted}>Computing roadmap…</Text></View>;
  }
  if (error) {
    return <View style={s.center}><Text style={{ color: colors.danger }}>Failed to load graph: {error}</Text><Pressable onPress={refetch} style={s.retry}><Text style={s.retryTxt}>Retry</Text></Pressable></View>;
  }
  if (!graph.nodes.length) {
    return <View style={s.center}><Text style={s.emptyTitle}>No tasks yet</Text><Text style={s.muted}>Create tasks to visualise the dependency roadmap.</Text></View>;
  }

  const topoOrder = graph.topoResult.order;

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {graph.topoResult.hasCycle && (
        <View style={s.cycle}><Ionicons name="warning" size={16} color={colors.danger} /><Text style={s.cycleTxt}>Circular dependency detected — execution order is partial until the cycle is resolved.</Text></View>
      )}

      {/* ── Execution Roadmap (Topological Sort) ── */}
      <View style={s.sectionHead}>
        <View style={[s.sectionIcon, { backgroundColor: colors.topo + "1a" }]}><Ionicons name="map" size={16} color={colors.topo} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>Execution Roadmap</Text>
          <Text style={s.sectionSub}>Topological Sort (Kahn's) · O(V+E) · {topoOrder.length} steps</Text>
        </View>
      </View>

      <View style={s.roadmap}>
        {topoOrder.map((id, i) => {
          const node = nodeMap.get(id);
          if (!node) return null;
          const tier = tierOf(node.priority);
          return (
            <View key={id}>
              <View style={[s.roadCard, { borderLeftColor: tier.color }]}>
                <View style={[s.roadStep, { backgroundColor: colors.topo }]}><Text style={s.roadStepTxt}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.roadTitle} numberOfLines={1}>{node.title}</Text>
                  <View style={s.roadMeta}>
                    <View style={[s.statusDot, { backgroundColor: statusColor(node.status) }]} />
                    <Text style={s.roadMetaTxt}>{statusMeta[node.status as keyof typeof statusMeta]?.label ?? node.status}</Text>
                    <View style={[s.tierChip, { backgroundColor: tier.bg }]}><Text style={[s.tierChipTxt, { color: tier.color }]}>{tier.label}</Text></View>
                    {node.dependencies.length > 0 && <Text style={s.roadDeps}>↳ {node.dependencies.length} dep{node.dependencies.length !== 1 ? "s" : ""}</Text>}
                  </View>
                </View>
              </View>
              {i < topoOrder.length - 1 && <View style={s.roadConnector} />}
            </View>
          );
        })}
      </View>

      {/* ── Node-link Dependency Graph ── */}
      <View style={s.sectionHead}>
        <View style={[s.sectionIcon, { backgroundColor: colors.primary + "1a" }]}><Ionicons name="git-network" size={16} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>Dependency Graph</Text>
          <Text style={s.sectionSub}>{graph.nodes.length} nodes · {graph.edges.length} edges · pinch-free zoom & pan</Text>
        </View>
      </View>
      <GraphCanvas nodes={graph.nodes} edges={graph.edges} levels={graph.bfsResult.levels} nodeMap={nodeMap} />

      {/* Legend */}
      <View style={s.legend}>
        <Text style={s.legendLabel}>Priority:</Text>
        {(["critical", "high", "medium", "low"] as const).map((k) => (
          <View key={k} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: PRIORITY_META[k].color }]} /><Text style={s.legendTxt}>{PRIORITY_META[k].label}</Text></View>
        ))}
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Pannable / zoomable node-link canvas ──────────────────────────────────────
function GraphCanvas({ nodes, edges, levels, nodeMap }: {
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
  levels: Record<string, number>;
  nodeMap: Map<string, GraphNode>;
}) {
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;

  // Layout: column = BFS level, row = index within level.
  const { pos, width, height } = useMemo(() => {
    const maxLevel = Math.max(0, ...Object.values(levels).filter((l) => l >= 0));
    const colOf = (id: string) => { const l = levels[id]; return l < 0 || l === undefined ? maxLevel + 1 : l; };
    const rowCounter: Record<number, number> = {};
    const pos: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      const col = colOf(n.id);
      const row = rowCounter[col] ?? 0;
      rowCounter[col] = row + 1;
      pos[n.id] = { x: col * (NODE_W + COL_GAP), y: row * (NODE_H + ROW_GAP) };
    }
    const cols = (maxLevel + 2);
    const maxRows = Math.max(1, ...Object.values(rowCounter));
    return { pos, width: cols * (NODE_W + COL_GAP), height: maxRows * (NODE_H + ROW_GAP) + 8 };
  }, [nodes, levels]);

  // Highlight set when a node is selected (itself + direct deps + dependents).
  const connected = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of edges) {
      if (e.to === selected) set.add(e.from);
      if (e.from === selected) set.add(e.to);
    }
    return set;
  }, [selected, edges]);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => { pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value }); pan.setValue({ x: 0, y: 0 }); },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => pan.flattenOffset(),
      onPanResponderTerminate: () => pan.flattenOffset(),
    })
  ).current;

  const center = (id: string) => ({ x: pos[id].x + NODE_W / 2, y: pos[id].y + NODE_H / 2 });

  return (
    <View style={s.canvasWrap}>
      {/* Zoom controls */}
      <View style={s.zoomBar}>
        <Pressable style={s.zoomBtn} onPress={() => setScale((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
        <Text style={s.zoomTxt}>{Math.round(scale * 100)}%</Text>
        <Pressable style={s.zoomBtn} onPress={() => setScale((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
        <Pressable style={s.zoomBtn} onPress={() => { setScale(1); pan.setValue({ x: 0, y: 0 }); setSelected(null); }}><Ionicons name="refresh" size={16} color={colors.text} /></Pressable>
      </View>

      <View style={s.viewport} {...responder.panHandlers}>
        <Animated.View style={[{ width, height }, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }]}>
          {/* Edges */}
          {edges.map((e, i) => {
            if (!pos[e.from] || !pos[e.to]) return null;
            const a = center(e.from), b = center(e.to);
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const active = selected && (e.from === selected || e.to === selected);
            const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
            // Center the line at the edge midpoint and rotate around its own
            // centre — no transformOrigin needed (works on native + web).
            return (
              <View key={i} style={{
                position: "absolute", left: midX - len / 2, top: midY - 1, width: len, height: 2,
                backgroundColor: active ? colors.primary : colors.borderStrong,
                opacity: selected && !active ? 0.25 : 1,
                transform: [{ rotateZ: `${angle}deg` }],
              }} />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const p = pos[n.id];
            const tier = tierOf(n.priority);
            const dim = connected ? !connected.has(n.id) : false;
            const isSel = selected === n.id;
            return (
              <Pressable
                key={n.id}
                onPress={() => setSelected(isSel ? null : n.id)}
                style={[
                  s.node,
                  { left: p.x, top: p.y, width: NODE_W, height: NODE_H, borderLeftColor: tier.color },
                  isSel && s.nodeSelected,
                  dim && { opacity: 0.3 },
                ]}
              >
                <View style={s.nodeTop}>
                  <View style={[s.statusDot, { backgroundColor: statusColor(n.status) }]} />
                  <Text style={s.nodeTitle} numberOfLines={2}>{n.title}</Text>
                </View>
                <View style={[s.nodeTier, { backgroundColor: tier.bg }]}><Text style={[s.nodeTierTxt, { color: tier.color }]}>{tier.label} · P{n.priority}</Text></View>
              </Pressable>
            );
          })}
        </Animated.View>
      </View>

      {selected && nodeMap.get(selected) && (() => {
        const n = nodeMap.get(selected)!;
        const tier = tierOf(n.priority);
        const due = n.dueDate ? deadlineMeta(n.dueDate) : null;
        const prereqs = n.dependencies.map((d) => nodeMap.get(d)?.title).filter(Boolean);
        const dependents = edges.filter((e) => e.from === selected).map((e) => nodeMap.get(e.to)?.title).filter(Boolean);
        return (
          <View style={s.detail}>
            <Text style={s.detailTitle}>{n.title}</Text>
            <View style={s.detailRow}><Text style={s.detailKey}>Priority</Text><View style={[s.tierChip, { backgroundColor: tier.bg }]}><Text style={[s.tierChipTxt, { color: tier.color }]}>{tier.label} · {n.priority}</Text></View></View>
            <View style={s.detailRow}><Text style={s.detailKey}>Status</Text><Text style={s.detailVal}>{statusMeta[n.status as keyof typeof statusMeta]?.label ?? n.status}</Text></View>
            <View style={s.detailRow}><Text style={s.detailKey}>Assignee</Text><Text style={s.detailVal}>{n.assignee ?? "Unassigned"}</Text></View>
            <View style={s.detailRow}><Text style={s.detailKey}>Deadline</Text><Text style={[s.detailVal, due && { color: due.color, fontWeight: "700" }]}>{due ? due.text : "—"}</Text></View>
            <View style={s.detailRow}><Text style={s.detailKey}>Depends on</Text><Text style={s.detailVal}>{prereqs.length ? prereqs.join(", ") : "none"}</Text></View>
            <View style={s.detailRow}><Text style={s.detailKey}>Required by</Text><Text style={s.detailVal}>{dependents.length ? dependents.join(", ") : "none"}</Text></View>
            <Text style={s.detailHint}>Tap the node again to clear selection</Text>
          </View>
        );
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  muted: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  retry: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  retryTxt: { color: colors.text, fontWeight: "700" },

  cycle: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.danger + "55" },
  cycleTxt: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: "600", lineHeight: 17 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  roadmap: { gap: 0 },
  roadCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, padding: 10 },
  roadStep: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  roadStepTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  roadTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  roadMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  roadMetaTxt: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  roadDeps: { fontSize: 11, color: colors.topo, fontWeight: "700" },
  roadConnector: { width: 2, height: 12, backgroundColor: colors.borderStrong, marginLeft: 22, marginVertical: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tierChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  tierChipTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },

  canvasWrap: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  zoomBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  zoomBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  zoomTxt: { fontSize: 12, fontWeight: "800", color: colors.text, minWidth: 44, textAlign: "center" },
  viewport: { height: 320, overflow: "hidden" },

  node: { position: "absolute", backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, padding: 8, gap: 4, justifyContent: "space-between" },
  nodeSelected: { borderColor: colors.primary, borderWidth: 1.5, borderLeftWidth: 4 },
  nodeTop: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  nodeTitle: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.text },
  nodeTier: { alignSelf: "flex-start", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  nodeTierTxt: { fontSize: 8.5, fontWeight: "800" },

  detail: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: 4 },
  detailTitle: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailKey: { width: 84, fontSize: 11, fontWeight: "700", color: colors.textFaint },
  detailVal: { flex: 1, fontSize: 11, color: colors.text, fontWeight: "600" },
  detailHint: { fontSize: 10, color: colors.textFaint, marginTop: 2, fontStyle: "italic" },

  legend: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  legendLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendTxt: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
});
