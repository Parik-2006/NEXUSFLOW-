/**
 * RecommendationPanel.tsx
 * =======================
 * Self-contained UI panel that surfaces the DAA recommendation engine.
 *
 * Layout
 * ──────
 *  [Sprint capacity stepper]  [Analyse Sprint button]
 *  ─────────────────────────────────────────────────
 *  Algorithm badge row  (BFS · Greedy · Knapsack · MergeSort · Topo)
 *  Sprint stats bar     (effort gauge + value + utilisation %)
 *  ─────────────────────────────────────────────────
 *  Recommended task cards  (topoOrder · ratio · reason)
 *  ─────────────────────────────────────────────────
 *  [Search bar — Boyer-Moore-Horspool]
 *  Search result list
 *
 * Props
 * ──────
 *  teamId: string   — passed straight to the hook
 */

import {
  View, Text, Pressable, TextInput, FlatList,
  ActivityIndicator, StyleSheet, ScrollView,
} from "react-native";
import { useState } from "react";
import { useRecommendation, type RecommendedTask } from "@/hooks/useRecommendation";

const ALGO_COLORS: Record<string, string> = {
  bfs        : "#6366f1",
  greedy     : "#f59e0b",
  knapsack   : "#10b981",
  mergeSort  : "#3b82f6",
  topological: "#8b5cf6",
};

const ALGO_LABELS: Record<string, string> = {
  bfs        : "BFS  O(V+E)",
  greedy     : "Greedy  O(n log n)",
  knapsack   : "Knapsack  O(nW)",
  mergeSort  : "MergeSort  O(n log n)",
  topological: "Topo Sort  O(V+E)",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function RecommendationPanel({ teamId }: { teamId: string }) {
  const [capacity,     setCapacity]     = useState(20);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [showAlgoInfo, setShowAlgoInfo] = useState(false);

  const {
    result, loading, error,
    requestRecommendation,
    searchResult, searchLoading, search,
  } = useRecommendation(teamId);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Text style={styles.heading}>⚡ Intelligent Sprint Recommender</Text>
      <Text style={styles.sub}>
        BFS → Greedy → 0/1 Knapsack → Merge Sort → Topological Sort
      </Text>

      {/* ── Capacity control + trigger ─────────────────────────────────── */}
      <View style={styles.row}>
        <View style={styles.capacityBox}>
          <Text style={styles.capacityLabel}>Sprint Capacity</Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setCapacity((c) => Math.max(1, c - 5))}
            >
              <Text style={styles.stepTxt}>−</Text>
            </Pressable>
            <Text style={styles.capValue}>{capacity} pts</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setCapacity((c) => Math.min(100, c + 5))}
            >
              <Text style={styles.stepTxt}>+</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.analyseBtn, loading && styles.btnDisabled]}
          onPress={() => requestRecommendation(capacity)}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.analyseTxt}>Analyse Sprint</Text>}
        </Pressable>
      </View>

      {error && <Text style={styles.error}>⚠ {error}</Text>}

      {/* ── Algorithm badge row ────────────────────────────────────────── */}
      {result && (
        <View>
          <Pressable onPress={() => setShowAlgoInfo((v) => !v)}>
            <View style={styles.badgeRow}>
              {Object.entries(ALGO_LABELS).map(([key, label]) => (
                <View key={key} style={[styles.badge, { backgroundColor: ALGO_COLORS[key] + "22" }]}>
                  <Text style={[styles.badgeTxt, { color: ALGO_COLORS[key] }]}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.toggleHint}>{showAlgoInfo ? "▲ hide details" : "▼ show algorithm details"}</Text>
          </Pressable>

          {/* ── Algorithm accordion ──────────────────────────────────── */}
          {showAlgoInfo && Object.entries(result.algorithmSummary).map(([key, meta]) => (
            <View key={key} style={[styles.algoCard, { borderLeftColor: ALGO_COLORS[key] ?? "#999" }]}>
              <Text style={styles.algoName}>{meta.name}</Text>
              <Text style={styles.algoDesc}>{meta.description}</Text>
              <View style={styles.algoStats}>
                <Text style={styles.algoStat}>↳ In: {meta.inputStats}</Text>
                <Text style={styles.algoStat}>↳ Out: {meta.outputStats}</Text>
                <Text style={styles.algoComplexity}>
                  Time {meta.complexity.time}  ·  Space {meta.complexity.space}
                </Text>
              </View>
            </View>
          ))}

          {/* ── Sprint stats gauge ───────────────────────────────────── */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <Stat label="Tasks"    value={String(result.sprintStats.taskCount)} color="#6366f1" />
              <Stat label="Value"    value={String(result.sprintStats.totalValue)} color="#10b981" />
              <Stat label="Effort"   value={`${result.sprintStats.effortUsed}/${result.sprintStats.capacity}`} color="#f59e0b" />
              <Stat label="Used"     value={`${result.sprintStats.utilizationPct}%`} color="#3b82f6" />
            </View>
            {/* Effort gauge bar */}
            <View style={styles.gaugeTrack}>
              <View
                style={[
                  styles.gaugeFill,
                  { width: `${Math.min(result.sprintStats.utilizationPct, 100)}%` as any,
                    backgroundColor: result.sprintStats.utilizationPct > 90 ? "#ef4444" : "#10b981" }
                ]}
              />
            </View>
            <Text style={styles.gaugeLabel}>
              Sprint utilisation — {result.sprintStats.effortUsed} of {result.sprintStats.capacity} story-points allocated
            </Text>
          </View>

          {result.hasCycle && (
            <View style={styles.cycleWarn}>
              <Text style={styles.cycleWarnTxt}>
                ⚠ Circular dependency detected in task graph. Topological execution order is unavailable.
                Review task dependencies to resolve the cycle.
              </Text>
            </View>
          )}

          {/* ── Recommended task cards ────────────────────────────────── */}
          <Text style={styles.sectionHead}>
            Recommended Tasks  ({result.recommendedTasks.length})
          </Text>
          {result.recommendedTasks.length === 0
            ? <Text style={styles.empty}>No ready tasks found. Complete existing work or add dependencies.</Text>
            : result.recommendedTasks.map((t, idx) => (
                <TaskRecommendationCard key={t.taskId} task={t} rank={idx + 1} />
              ))
          }
        </View>
      )}

      {/* ── Boyer-Moore-Horspool search ────────────────────────────────── */}
      <View style={styles.searchSection}>
        <Text style={styles.sectionHead}>🔍 Task Search  <Text style={styles.algoBadgeInline}>Boyer-Moore-Horspool  O(n/m)</Text></Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search task titles…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={() => searchQuery.trim() && search(searchQuery.trim())}
          />
          <Pressable
            style={[styles.searchBtn, searchLoading && styles.btnDisabled]}
            onPress={() => searchQuery.trim() && search(searchQuery.trim())}
            disabled={searchLoading}
          >
            {searchLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.searchBtnTxt}>Search</Text>}
          </Pressable>
        </View>

        {searchResult && (
          <View>
            <Text style={styles.searchMeta}>
              {searchResult.matchCount} match{searchResult.matchCount !== 1 ? "es" : ""} in {searchResult.totalScanned} tasks
              · Algorithm: {searchResult.algorithm}
              · {searchResult.complexity.time}
            </Text>
            {searchResult.tasks.map((t: any) => (
              <View key={t._id} style={styles.searchResultRow}>
                <View style={[styles.dot, { backgroundColor: STATUS_COLOR[t.status as string] ?? "#9ca3af" }]} />
                <Text style={styles.searchResultTitle}>{t.title}</Text>
                <Text style={styles.searchResultStatus}>{t.status}</Text>
              </View>
            ))}
            {searchResult.matchCount === 0 && (
              <Text style={styles.empty}>No tasks matched "{searchResult.query}".</Text>
            )}
          </View>
        )}
      </View>

    </ScrollView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TaskRecommendationCard({ task, rank }: { task: RecommendedTask; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable style={styles.taskCard} onPress={() => setExpanded((v) => !v)}>
      <View style={styles.taskCardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankTxt}>#{rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.taskMeta}>
            <Pill label={`Topo #${task.topoOrder ?? "?"}`} color="#8b5cf6" />
            <Pill label={`Ratio ${task.ratio}`}            color="#f59e0b" />
            <Pill label={`P${task.priority}`}              color="#6366f1" />
            <Pill label={`${task.effort}pts`}              color="#3b82f6" />
            <Pill label={`V${task.value}`}                 color="#10b981" />
          </View>
        </View>
      </View>
      {expanded && (
        <Text style={styles.taskReason}>{task.reason}</Text>
      )}
    </Pressable>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + "22" }]}>
      <Text style={[styles.pillTxt, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  todo       : "#9ca3af",
  in_progress: "#f59e0b",
  done       : "#10b981",
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root   : { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  heading: { fontSize: 20, fontWeight: "800", color: "#111827" },
  sub    : { fontSize: 12, color: "#6b7280", marginBottom: 4 },

  row         : { flexDirection: "row", alignItems: "center", gap: 12 },
  capacityBox : { flex: 1 },
  capacityLabel: { fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: "600" },
  stepper     : { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn     : { backgroundColor: "#e5e7eb", borderRadius: 8, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stepTxt     : { fontSize: 18, fontWeight: "700", color: "#374151" },
  capValue    : { fontSize: 16, fontWeight: "700", color: "#111827", minWidth: 60, textAlign: "center" },

  analyseBtn : { backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", minWidth: 140 },
  btnDisabled: { opacity: 0.5 },
  analyseTxt : { color: "#fff", fontWeight: "700", fontSize: 14 },

  error: { color: "#ef4444", fontSize: 13, padding: 8, backgroundColor: "#fee2e2", borderRadius: 8 },

  badgeRow  : { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  badge     : { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt  : { fontSize: 11, fontWeight: "700" },
  toggleHint: { fontSize: 11, color: "#6b7280", marginTop: 4, marginBottom: 2 },

  algoCard      : { borderLeftWidth: 3, backgroundColor: "#fff", padding: 12, borderRadius: 8, marginVertical: 4 },
  algoName      : { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  algoDesc      : { fontSize: 12, color: "#4b5563", lineHeight: 18 },
  algoStats     : { marginTop: 6, gap: 2 },
  algoStat      : { fontSize: 11, color: "#6b7280" },
  algoComplexity: { fontSize: 11, color: "#6366f1", fontWeight: "600", marginTop: 2 },

  statsCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 },
  statsRow : { flexDirection: "row", justifyContent: "space-between" },
  statItem : { alignItems: "center", flex: 1 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2 },

  gaugeTrack : { height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  gaugeFill  : { height: 8, borderRadius: 4 },
  gaugeLabel : { fontSize: 11, color: "#6b7280", textAlign: "center" },

  cycleWarn   : { backgroundColor: "#fef3c7", borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  cycleWarnTxt: { fontSize: 12, color: "#92400e", lineHeight: 18 },

  sectionHead    : { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 8, marginBottom: 6 },
  algoBadgeInline: { fontSize: 11, color: "#6366f1", fontWeight: "600" },
  empty          : { textAlign: "center", color: "#9ca3af", fontSize: 13, paddingVertical: 16 },

  taskCard      : { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 6 },
  taskCardHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  rankBadge     : { backgroundColor: "#6366f1", borderRadius: 8, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  rankTxt       : { color: "#fff", fontSize: 12, fontWeight: "800" },
  taskTitle     : { fontSize: 14, fontWeight: "700", color: "#111827", flex: 1 },
  taskMeta      : { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  taskReason    : { fontSize: 12, color: "#4b5563", marginTop: 8, lineHeight: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  pill          : { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt       : { fontSize: 10, fontWeight: "700" },

  searchSection: { marginTop: 8 },
  searchRow    : { flexDirection: "row", gap: 8 },
  searchInput  : { flex: 1, backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: "#e5e7eb", color: "#111827" },
  searchBtn    : { backgroundColor: "#6366f1", paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchBtnTxt : { color: "#fff", fontWeight: "700", fontSize: 14 },
  searchMeta   : { fontSize: 11, color: "#6b7280", marginTop: 6, marginBottom: 4 },
  searchResultRow  : { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: "#fff", borderRadius: 8, marginBottom: 4 },
  searchResultTitle: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" },
  searchResultStatus: { fontSize: 11, color: "#6b7280" },

  dot: { width: 8, height: 8, borderRadius: 4 },
});
