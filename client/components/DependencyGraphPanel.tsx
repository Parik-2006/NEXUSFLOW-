/**
 * DependencyGraphPanel
 *
 * Renders a mobile-friendly dependency visualization panel for a given team.
 * Shows three DAA algorithm outputs:
 *   1. DFS traversal order with discovery/finish timestamps
 *   2. BFS level-annotated traversal (parallelisation tiers)
 *   3. Topological Sort (Kahn's algorithm) – linear execution order
 *
 * Design: dark-card layout consistent with NexusFlow's existing palette.
 * The graph is represented as an interactive node list (SVG-free) because
 * React Native's layout engine does not natively support canvas drawing,
 * and a pure RN approach is most portable across iOS/Android/web.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useDependencyGraph, GraphNode } from "@/hooks/useDependencyGraph";
import { colors } from "@/theme";

// ── Palette (mapped onto the NexusFlow light/cream design system) ──────────────
const C = {
  bg:         colors.bg,
  surface:    colors.surface,
  surfaceAlt: colors.surfaceAlt,
  border:     colors.border,
  accent:     colors.primary,   // algorithm highlight
  dfsColor:   colors.dfs,       // terracotta
  bfsColor:   colors.bfs,       // green
  topoColor:  colors.topo,      // plum
  danger:     colors.danger,
  textPrimary:colors.text,
  textMuted:  colors.textMuted,
  todo:       colors.surfaceAlt,
  inProgress: colors.infoSoft,
  done:       colors.successSoft,
  todoText:   colors.textMuted,
  inProgressText: colors.info,
  doneText:   colors.success,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const statusStyle = (s: string) => ({
  backgroundColor: s === "done" ? C.done : s === "in_progress" ? C.inProgress : C.todo,
});
const statusLabel = (s: string) =>
  s === "done" ? "Done" : s === "in_progress" ? "In Progress" : "To Do";
const statusTextColor = (s: string) =>
  s === "done" ? C.doneText : s === "in_progress" ? C.inProgressText : C.todoText;

type Tab = "dfs" | "bfs" | "topo";

// ── Sub-components ─────────────────────────────────────────────────────────────
function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; color: string }[] = [
    { id: "dfs",  label: "DFS",  color: C.dfsColor },
    { id: "bfs",  label: "BFS",  color: C.bfsColor },
    { id: "topo", label: "Topo Sort", color: C.topoColor },
  ];
  return (
    <View style={s.tabRow}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.id}
          onPress={() => onSelect(t.id)}
          style={[s.tab, active === t.id && { borderBottomColor: t.color, borderBottomWidth: 2 }]}
        >
          <Text style={[s.tabText, active === t.id && { color: t.color }]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NodeBadge({ node, rank, rankLabel, accentColor, extra, nodeMap }: {
  node: GraphNode;
  rank: number;
  rankLabel: string;
  accentColor: string;
  extra?: string;
  nodeMap?: Map<string, GraphNode>;
}) {
  return (
    <View style={s.nodeBadge}>
      <View style={[s.rankBubble, { backgroundColor: accentColor }]}>
        <Text style={s.rankText}>{rank}</Text>
      </View>
      <View style={s.nodeInfo}>
        <Text style={s.nodeTitle} numberOfLines={1}>{node.title}</Text>
        <View style={s.nodeMetaRow}>
          <View style={[s.statusChip, statusStyle(node.status)]}>
            <Text style={[s.statusChipText, { color: statusTextColor(node.status) }]}>
              {statusLabel(node.status)}
            </Text>
          </View>
          <Text style={s.nodeMeta}>P{node.priority}</Text>
          <Text style={s.nodeMeta}>{node.estimatedHours}h</Text>
          {extra ? <Text style={[s.nodeMeta, { color: accentColor }]}>{extra}</Text> : null}
        </View>
        {node.dependencies.length > 0 && (
          <View style={s.depChips}>
            <Text style={s.depHint}>↳ depends on</Text>
            {node.dependencies.map((depId) => {
              const dep = nodeMap?.get(depId);
              return (
                <View key={depId} style={[s.depChip, { borderColor: accentColor }]}>
                  <Text style={[s.depChipText, { color: accentColor }]} numberOfLines={1}>
                    {dep?.title ?? depId}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function DfsPanel({ order, timestamps, nodeMap }: {
  order: string[];
  timestamps: Record<string, { disc: number; fin: number }>;
  nodeMap: Map<string, GraphNode>;
}) {
  return (
    <View>
      <View style={s.algorithmCard}>
        <Text style={[s.algoTitle, { color: C.dfsColor }]}>Depth-First Search</Text>
        <Text style={s.algoDesc}>
          Recursively explores each task branch to its deepest dependency before backtracking.
          Discovery (d) and finish (f) timestamps reveal call-stack depth and back-edge cycles.
        </Text>
        <View style={s.complexityRow}>
          <View style={s.complexityChip}><Text style={s.complexityText}>Time O(V+E)</Text></View>
          <View style={s.complexityChip}><Text style={s.complexityText}>Space O(V)</Text></View>
        </View>
      </View>
      <Text style={s.sectionLabel}>TRAVERSAL ORDER</Text>
      {order.map((id, i) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        const ts = timestamps[id];
        const extra = ts ? `d:${ts.disc} f:${ts.fin}` : "";
        return (
          <NodeBadge key={id} node={node} rank={i + 1} rankLabel="DFS" accentColor={C.dfsColor} extra={extra} nodeMap={nodeMap} />
        );
      })}
    </View>
  );
}

function BfsPanel({ order, levels, nodeMap }: {
  order: string[];
  levels: Record<string, number>;
  nodeMap: Map<string, GraphNode>;
}) {
  const maxLevel = Math.max(0, ...Object.values(levels).filter(l => l >= 0));
  return (
    <View>
      <View style={s.algorithmCard}>
        <Text style={[s.algoTitle, { color: C.bfsColor }]}>Breadth-First Search</Text>
        <Text style={s.algoDesc}>
          Explores tasks level by level from independent source tasks. Each level represents a
          sprint tier: tasks at the same level can be parallelised safely.
        </Text>
        <View style={s.complexityRow}>
          <View style={s.complexityChip}><Text style={s.complexityText}>Time O(V+E)</Text></View>
          <View style={s.complexityChip}><Text style={s.complexityText}>Space O(V)</Text></View>
        </View>
      </View>
      {Array.from({ length: maxLevel + 1 }, (_, lvl) => {
        const tier = order.filter(id => levels[id] === lvl);
        if (!tier.length) return null;
        return (
          <View key={lvl}>
            <View style={s.levelHeader}>
              <View style={[s.levelLine, { backgroundColor: C.bfsColor }]} />
              <Text style={[s.levelLabel, { color: C.bfsColor }]}>Level {lvl} — {tier.length} task{tier.length > 1 ? "s" : ""} can run in parallel</Text>
            </View>
            {tier.map((id, i) => {
              const node = nodeMap.get(id);
              if (!node) return null;
              return <NodeBadge key={id} node={node} rank={i + 1} rankLabel="BFS" accentColor={C.bfsColor} extra={`L${lvl}`} nodeMap={nodeMap} />;
            })}
          </View>
        );
      })}
      {order.filter(id => levels[id] === -1).map((id) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        return <NodeBadge key={id} node={node} rank={0} rankLabel="" accentColor={C.textMuted} extra="isolated" nodeMap={nodeMap} />;
      })}
    </View>
  );
}

function TopoPanel({ order, hasCycle, nodeMap }: {
  order: string[];
  hasCycle: boolean;
  nodeMap: Map<string, GraphNode>;
}) {
  return (
    <View>
      <View style={s.algorithmCard}>
        <Text style={[s.algoTitle, { color: C.topoColor }]}>Topological Sort (Kahn's)</Text>
        <Text style={s.algoDesc}>
          Produces a valid linear execution schedule respecting all task dependencies.
          Uses in-degree tracking: tasks with no remaining prerequisites are queued first.
        </Text>
        <View style={s.complexityRow}>
          <View style={s.complexityChip}><Text style={s.complexityText}>Time O(V+E)</Text></View>
          <View style={s.complexityChip}><Text style={s.complexityText}>Space O(V)</Text></View>
        </View>
      </View>
      {hasCycle && (
        <View style={s.cycleWarning}>
          <Text style={s.cycleText}>⚠ Circular dependency detected — full ordering not possible</Text>
        </View>
      )}
      <Text style={s.sectionLabel}>EXECUTION ORDER</Text>
      {order.map((id, i) => {
        const node = nodeMap.get(id);
        if (!node) return null;
        return (
          <NodeBadge key={id} node={node} rank={i + 1} rankLabel="Step" accentColor={C.topoColor} nodeMap={nodeMap} />
        );
      })}
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DependencyGraphPanel({ teamId }: { teamId: string }) {
  const { graph, loading, error, refetch } = useDependencyGraph(teamId);
  const [activeTab, setActiveTab] = useState<Tab>("topo");

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  if (loading) {
    return (
      <View style={s.loadingBox}>
        <ActivityIndicator color={C.accent} />
        <Text style={s.loadingText}>Computing dependency graph…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.errorBox}>
        <Text style={s.errorText}>Failed to load graph: {error}</Text>
        <TouchableOpacity onPress={refetch} style={s.retryBtn}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!graph.nodes.length) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyTitle}>No tasks yet</Text>
        <Text style={s.emptyDesc}>Create tasks in this team to visualise the dependency graph.</Text>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.panelTitle}>Dependency Graph</Text>
          <Text style={s.panelSub}>{graph.nodes.length} tasks · {graph.edges.length} dependencies</Text>
        </View>
        <TouchableOpacity onPress={refetch} style={s.refreshBtn}>
          <Text style={s.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statChip}>
          <Text style={[s.statVal, { color: C.dfsColor }]}>{graph.dfsResult.order.length}</Text>
          <Text style={s.statLbl}>DFS nodes</Text>
        </View>
        <View style={s.statChip}>
          <Text style={[s.statVal, { color: C.bfsColor }]}>
            {Math.max(0, ...Object.values(graph.bfsResult.levels).filter(l => l >= 0)) + 1}
          </Text>
          <Text style={s.statLbl}>BFS levels</Text>
        </View>
        <View style={s.statChip}>
          <Text style={[s.statVal, { color: C.topoColor }]}>{graph.topoResult.order.length}</Text>
          <Text style={s.statLbl}>Topo steps</Text>
        </View>
        {graph.topoResult.hasCycle && (
          <View style={[s.statChip, { backgroundColor: "#450A0A" }]}>
            <Text style={[s.statVal, { color: C.danger }]}>!</Text>
            <Text style={[s.statLbl, { color: C.danger }]}>Cycle</Text>
          </View>
        )}
      </View>

      <TabBar active={activeTab} onSelect={setActiveTab} />

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === "dfs" && (
          <DfsPanel
            order={graph.dfsResult.order}
            timestamps={graph.dfsResult.timestamps}
            nodeMap={nodeMap}
          />
        )}
        {activeTab === "bfs" && (
          <BfsPanel
            order={graph.bfsResult.order}
            levels={graph.bfsResult.levels}
            nodeMap={nodeMap}
          />
        )}
        {activeTab === "topo" && (
          <TopoPanel
            order={graph.topoResult.order}
            hasCycle={graph.topoResult.hasCycle}
            nodeMap={nodeMap}
          />
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  panel:        { flex: 1, backgroundColor: C.bg },
  loadingBox:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText:  { color: C.textMuted, fontSize: 14 },
  errorBox:     { padding: 24, alignItems: "center", gap: 12 },
  errorText:    { color: C.danger, textAlign: "center" },
  retryBtn:     { backgroundColor: C.surfaceAlt, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText:    { color: C.textPrimary, fontWeight: "600" },
  emptyBox:     { padding: 40, alignItems: "center", gap: 8 },
  emptyTitle:   { color: C.textPrimary, fontSize: 18, fontWeight: "700" },
  emptyDesc:    { color: C.textMuted, textAlign: "center", lineHeight: 20 },

  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  panelTitle:   { color: C.textPrimary, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  panelSub:     { color: C.textMuted, fontSize: 12, marginTop: 2 },
  refreshBtn:   { backgroundColor: C.surfaceAlt, width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  refreshText:  { color: C.textPrimary, fontSize: 18 },

  statsRow:     { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  statChip:     { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: C.border },
  statVal:      { fontSize: 18, fontWeight: "800" },
  statLbl:      { color: C.textMuted, fontSize: 10, marginTop: 1 },

  tabRow:       { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, marginHorizontal: 16, marginBottom: 12 },
  tab:          { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText:      { color: C.textMuted, fontSize: 13, fontWeight: "600" },

  scroll:       { flex: 1, paddingHorizontal: 16 },

  algorithmCard:{ backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  algoTitle:    { fontSize: 14, fontWeight: "800", marginBottom: 4, letterSpacing: 0.2 },
  algoDesc:     { color: C.textMuted, fontSize: 12, lineHeight: 17 },
  complexityRow:{ flexDirection: "row", gap: 8, marginTop: 10 },
  complexityChip:{ backgroundColor: C.surfaceAlt, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  complexityText:{ color: C.textPrimary, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },

  sectionLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 2 },

  nodeBadge:    { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: C.border },
  rankBubble:   { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  rankText:     { color: "#fff", fontSize: 12, fontWeight: "800" },
  nodeInfo:     { flex: 1 },
  nodeTitle:    { color: C.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  nodeMetaRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  nodeMeta:     { color: C.textMuted, fontSize: 11 },
  statusChip:   { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusChipText:{ fontSize: 10, fontWeight: "700" },
  depHint:      { color: C.textMuted, fontSize: 11, marginTop: 4 },
  depChips:     { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 4 },
  depChip:      { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 140 },
  depChipText:  { fontSize: 10, fontWeight: "600" },

  levelHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 },
  levelLine:    { width: 3, height: 14, borderRadius: 2 },
  levelLabel:   { fontSize: 12, fontWeight: "700" },

  cycleWarning: { backgroundColor: "#450A0A", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#7F1D1D" },
  cycleText:    { color: C.danger, fontSize: 13, fontWeight: "600" },
});
