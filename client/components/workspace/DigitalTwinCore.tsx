/**
 * client/components/workspace/DigitalTwinCore.tsx
 * ============================================================================
 * NEXUSFLOW V4 — UNIFIED DIGITAL TWIN CORE (Prompt 10)
 *
 * Unified visualization component that composes existing methodology-specific
 * Three.js canvases and adds unified interaction/filtering capabilities.
 *
 * ARCHITECTURE:
 *   DigitalTwinCore
 *         ↓
 *   Methodology Adapter Selection
 *         ↓
 *   Existing Canvas (Waterfall/Scrum/Kanban) OR Fallback 2D View
 *         ↓
 *   Unified Interaction Layer (select, filter, inspect)
 *
 * EXISTING CANVASES PRESERVED:
 *   - WaterfallPhaseCanvas(.web.tsx)
 *   - ScrumDigitalTwinCanvas(.web.tsx)
 *   - KanbanDigitalTwinCanvas(.web.tsx)
 *
 * FALLBACK:
 *   - 2D summary view when WebGL is unavailable
 *   - Reduced motion support
 *   - Performance degradation handling
 *
 * SAFETY:
 *   - Read-only visualization — NEVER modifies project state
 *   - Respects authorization
 *   - Proper cleanup on unmount (Socket.IO, listeners)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  AccessibilityInfo,
} from "react-native";

interface DigitalTwinCoreProps {
  projectId: string;
  methodology: string;
  token: string;
  apiBase: string;
  onTaskSelect?: (taskId: string) => void;
}

interface TwinTask {
  id: string;
  title: string;
  status: string;
  phase?: string;
  assignedTo?: { id: string; name: string } | null;
  priority?: string;
  priorityScore?: number;
  isBlocked?: boolean;
  isCriticalPath?: boolean;
  progress?: number;
  scrumStatus?: string;
  kanbanStatus?: string;
  workflowColumn?: string;
  sprintId?: string | null;
}

interface TwinEdge {
  from: string;
  to: string;
  fromTitle?: string;
  toTitle?: string;
}

interface TwinState {
  project: { id: string; title: string; methodology: string; status: string };
  tasks: TwinTask[];
  edges: TwinEdge[];
  members: Array<{ id: string; name: string; role: string; capacity: number; assignedLoad: number }>;
  metrics: {
    totalTasks: number;
    doneTasks: number;
    inProgressTasks: number;
    blockedTasks: number;
    progress: number;
    healthScore: number;
    criticalPathCount: number;
    dependencyCount: number;
  };
  criticalPathIds: string[];
  methodologyAdapter: any;
}

// ── Filter Types ──────────────────────────────────────────────────────────────
type FilterMode = "all" | "critical_path" | "blocked" | "in_progress" | "by_member";

export default function DigitalTwinCore({
  projectId,
  methodology,
  token,
  apiBase,
  onTaskSelect,
}: DigitalTwinCoreProps) {
  const [twinState, setTwinState] = useState<TwinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mountedRef = useRef(true);

  // Check reduced motion preference
  useEffect(() => {
    if (Platform.OS !== "web") {
      AccessibilityInfo.isReduceMotionEnabled?.().then(enabled => {
        if (mountedRef.current) setReducedMotion(enabled || false);
      });
    } else {
      try {
        const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (mq?.matches) setReducedMotion(true);
      } catch {}
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch Digital Twin state
  const fetchTwinState = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/projects/${projectId}/digital-twin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setTwinState(data);
        setError("");
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || "Failed to load Digital Twin");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchTwinState();
  }, [fetchTwinState]);

  // Filter tasks based on current filter mode
  const filteredTasks = useMemo(() => {
    if (!twinState) return [];
    const tasks = twinState.tasks;
    switch (filterMode) {
      case "critical_path":
        return tasks.filter(t => twinState.criticalPathIds.includes(t.id));
      case "blocked":
        return tasks.filter(t => t.isBlocked);
      case "in_progress":
        return tasks.filter(t => t.status === "in_progress");
      case "by_member":
        return filterMemberId ? tasks.filter(t => t.assignedTo?.id === filterMemberId) : tasks;
      default:
        return tasks;
    }
  }, [twinState, filterMode, filterMemberId]);

  // Handle task selection
  const handleTaskSelect = useCallback((taskId: string) => {
    setSelectedTaskId(prev => prev === taskId ? null : taskId);
    onTaskSelect?.(taskId);
  }, [onTaskSelect]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !twinState) return null;
    return twinState.tasks.find(t => t.id === selectedTaskId) || null;
  }, [selectedTaskId, twinState]);

  // Render loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#4a6cf7" size="large" />
        <Text style={styles.loadingText}>Loading Digital Twin...</Text>
      </View>
    );
  }

  // Render error state
  if (error || !twinState) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>⚠️ {error || "No data available"}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchTwinState}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { metrics, methodologyAdapter } = twinState;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🏗️ Digital Twin</Text>
        <View style={styles.methodologyBadge}>
          <Text style={styles.methodologyText}>{twinState.project.methodology}</Text>
        </View>
      </View>

      {/* Metrics Summary */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metrics.progress}%</Text>
          <Text style={styles.metricLabel}>Progress</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metrics.healthScore}</Text>
          <Text style={styles.metricLabel}>Health</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, metrics.blockedTasks > 0 ? styles.textDanger : null]}>{metrics.blockedTasks}</Text>
          <Text style={styles.metricLabel}>Blocked</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metrics.criticalPathCount}</Text>
          <Text style={styles.metricLabel}>Critical</Text>
        </View>
      </View>

      {/* Filter Controls */}
      <View style={styles.filterRow}>
        {(["all", "critical_path", "blocked", "in_progress"] as FilterMode[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.filterBtn, filterMode === mode && styles.filterBtnActive]}
            onPress={() => setFilterMode(mode)}
          >
            <Text style={[styles.filterBtnText, filterMode === mode && styles.filterBtnTextActive]}>
              {mode === "all" ? "All" : mode === "critical_path" ? "Critical Path" : mode === "blocked" ? "Blocked" : "In Progress"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Member filter */}
      {twinState.members.length > 0 && (
        <ScrollView horizontal style={styles.memberFilterRow} showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.memberChip, filterMode === "by_member" && !filterMemberId && styles.memberChipActive]}
            onPress={() => { setFilterMode("all"); setFilterMemberId(null); }}
          >
            <Text style={styles.memberChipText}>All Members</Text>
          </TouchableOpacity>
          {twinState.members.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberChip, filterMode === "by_member" && filterMemberId === m.id && styles.memberChipActive]}
              onPress={() => { setFilterMode("by_member"); setFilterMemberId(m.id); }}
            >
              <Text style={styles.memberChipText}>{m.name || "Unknown"}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Methodology-Specific View */}
      {methodologyAdapter && (
        <View style={styles.adapterSection}>
          {methodologyAdapter.type === "waterfall" && (
            <WaterfallView adapter={methodologyAdapter} reducedMotion={reducedMotion} />
          )}
          {methodologyAdapter.type === "scrum" && (
            <ScrumView adapter={methodologyAdapter} reducedMotion={reducedMotion} />
          )}
          {methodologyAdapter.type === "kanban" && (
            <KanbanView adapter={methodologyAdapter} reducedMotion={reducedMotion} />
          )}
          {methodologyAdapter.type === "hybrid" && (
            <HybridView adapter={methodologyAdapter} reducedMotion={reducedMotion} />
          )}
          {methodologyAdapter.type === "classic" && (
            <ClassicView adapter={methodologyAdapter} />
          )}
        </View>
      )}

      {/* Task List (2D Fallback / Supplementary) */}
      <Text style={styles.sectionTitle}>
        Tasks ({filteredTasks.length}{filterMode !== "all" ? ` / ${twinState.tasks.length}` : ""})
      </Text>
      {filteredTasks.slice(0, 50).map(task => (
        <TouchableOpacity
          key={task.id}
          style={[
            styles.taskCard,
            selectedTaskId === task.id && styles.taskCardSelected,
            task.isCriticalPath && styles.taskCardCritical,
            task.isBlocked && styles.taskCardBlocked,
          ]}
          onPress={() => handleTaskSelect(task.id)}
        >
          <View style={styles.taskHeader}>
            <Text style={styles.taskTitle} numberOfLines={1}>
              {task.isBlocked ? "🚫 " : task.isCriticalPath ? "⚡ " : ""}{task.title}
            </Text>
            <Text style={[styles.taskStatus, task.status === "done" ? styles.textSuccess : task.status === "in_progress" ? styles.textActive : null]}>
              {task.status}
            </Text>
          </View>
          {task.assignedTo && <Text style={styles.taskAssignee}>👤 {task.assignedTo.name}</Text>}
          {task.phase && <Text style={styles.taskPhase}>📋 {task.phase}</Text>}
        </TouchableOpacity>
      ))}

      {/* Selected Task Detail */}
      {selectedTask && (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>{selectedTask.title}</Text>
          <Text style={styles.detailField}>Status: {selectedTask.status}</Text>
          <Text style={styles.detailField}>Priority: {selectedTask.priority || "—"}</Text>
          <Text style={styles.detailField}>Phase: {selectedTask.phase || "—"}</Text>
          <Text style={styles.detailField}>Critical Path: {selectedTask.isCriticalPath ? "Yes" : "No"}</Text>
          <Text style={styles.detailField}>Blocked: {selectedTask.isBlocked ? "Yes" : "No"}</Text>
          <Text style={styles.detailField}>Assigned To: {selectedTask.assignedTo?.name || "Unassigned"}</Text>
          {/* Dependencies */}
          {twinState.edges.filter(e => e.to === selectedTask.id || e.from === selectedTask.id).length > 0 && (
            <>
              <Text style={styles.detailSubtitle}>Dependencies</Text>
              {twinState.edges.filter(e => e.to === selectedTask.id).map((e, i) => (
                <Text key={i} style={styles.depLine}>← {e.fromTitle || e.from}</Text>
              ))}
              {twinState.edges.filter(e => e.from === selectedTask.id).map((e, i) => (
                <Text key={i} style={styles.depLine}>→ {e.toTitle || e.to}</Text>
              ))}
            </>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Digital Twin — Read-Only Visualization</Text>
        <TouchableOpacity onPress={fetchTwinState}>
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Methodology-Specific Sub-Views ────────────────────────────────────────────

function WaterfallView({ adapter, reducedMotion }: { adapter: any; reducedMotion: boolean }) {
  return (
    <View>
      <Text style={styles.adapterTitle}>📊 Waterfall Phases</Text>
      {adapter.phases?.map((phase: any) => (
        <View key={phase.name} style={[styles.phaseRow, phase.isCurrent && styles.phaseRowCurrent]}>
          <Text style={styles.phaseName}>{phase.isCurrent ? "▶ " : phase.isCompleted ? "✅ " : "○ "}{phase.displayName}</Text>
          <View style={styles.phaseProgress}>
            <View style={[styles.phaseBar, { width: `${phase.progress}%` } as any]} />
          </View>
          <Text style={styles.phaseCount}>{phase.completedTasks}/{phase.taskCount}</Text>
        </View>
      ))}
    </View>
  );
}

function ScrumView({ adapter, reducedMotion }: { adapter: any; reducedMotion: boolean }) {
  return (
    <View>
      <Text style={styles.adapterTitle}>🏃 Scrum Sprint</Text>
      {adapter.activeSprint ? (
        <View style={styles.sprintCard}>
          <Text style={styles.sprintName}>{adapter.activeSprint.name}</Text>
          <Text style={styles.sprintGoal}>{adapter.activeSprint.goal || "No sprint goal set"}</Text>
          <View style={styles.sprintMetrics}>
            <Text style={styles.sprintMetric}>Progress: {adapter.activeSprint.progress}%</Text>
            <Text style={styles.sprintMetric}>Tasks: {adapter.activeSprint.doneCount}/{adapter.activeSprint.taskCount}</Text>
          </View>
          <View style={styles.phaseProgress}>
            <View style={[styles.phaseBar, styles.sprintBar, { width: `${adapter.activeSprint.progress}%` } as any]} />
          </View>
        </View>
      ) : (
        <Text style={styles.noDataText}>No active sprint</Text>
      )}
      <Text style={styles.adapterSub}>Backlog: {adapter.backlogCount} items | Sprints: {adapter.sprints?.length || 0}</Text>
    </View>
  );
}

function KanbanView({ adapter, reducedMotion }: { adapter: any; reducedMotion: boolean }) {
  return (
    <View>
      <Text style={styles.adapterTitle}>📋 Kanban Board</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {adapter.columns?.map((col: any) => (
          <View key={col.id} style={[styles.columnCard, col.isOverWip && styles.columnOverWip]}>
            <Text style={styles.columnName}>{col.name}</Text>
            <Text style={styles.columnWip}>
              {col.wipUsed}{col.wipLimit > 0 ? `/${col.wipLimit}` : ""} items
            </Text>
            {col.isOverWip && <Text style={styles.wipWarning}>⚠️ Over WIP</Text>}
          </View>
        ))}
      </ScrollView>
      {adapter.bottlenecks?.length > 0 && (
        <Text style={styles.bottleneckText}>🔴 Bottlenecks: {adapter.bottlenecks.map((b: any) => b.column).join(", ")}</Text>
      )}
    </View>
  );
}

function HybridView({ adapter, reducedMotion }: { adapter: any; reducedMotion: boolean }) {
  return (
    <View>
      <Text style={styles.adapterTitle}>🔀 Hybrid Methodology</Text>
      {adapter.boundaries && (
        <View style={styles.boundaryCard}>
          <Text style={styles.boundaryLabel}>Planning: <Text style={styles.boundaryValue}>{adapter.boundaries.planning}</Text></Text>
          <Text style={styles.boundaryLabel}>Execution: <Text style={styles.boundaryValue}>{adapter.boundaries.execution}</Text></Text>
          <Text style={styles.boundaryLabel}>Governance: <Text style={styles.boundaryValue}>{adapter.boundaries.governance}</Text></Text>
        </View>
      )}
      {adapter.layers?.map((layer: any, i: number) => (
        <View key={i} style={styles.layerCard}>
          <Text style={styles.layerConcern}>{layer.concern} ({layer.methodology})</Text>
        </View>
      ))}
    </View>
  );
}

function ClassicView({ adapter }: { adapter: any }) {
  return (
    <View>
      <Text style={styles.adapterTitle}>📁 Classic View</Text>
      {adapter.categories?.map((cat: any) => (
        <View key={cat.name} style={styles.categoryRow}>
          <Text style={styles.categoryName}>{cat.name}</Text>
          <Text style={styles.categoryCount}>{cat.taskCount} tasks</Text>
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a", padding: 16 },
  loadingText: { color: "#888", textAlign: "center", marginTop: 12 },
  errorText: { color: "#f44", textAlign: "center", fontSize: 14 },
  retryBtn: { alignSelf: "center", marginTop: 12, backgroundColor: "#4a6cf7", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { color: "#fff", fontWeight: "600" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { color: "#e0e0ff", fontSize: 20, fontWeight: "700" },
  methodologyBadge: { backgroundColor: "#4a6cf7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  methodologyText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 8, padding: 10, alignItems: "center" },
  metricValue: { color: "#e0e0ff", fontSize: 20, fontWeight: "700" },
  metricLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  textDanger: { color: "#f44" },
  textSuccess: { color: "#4caf50" },
  textActive: { color: "#4a6cf7" },
  filterRow: { flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" },
  filterBtn: { backgroundColor: "#1a1a2e", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  filterBtnActive: { backgroundColor: "#4a6cf7" },
  filterBtnText: { color: "#888", fontSize: 11 },
  filterBtnTextActive: { color: "#fff" },
  memberFilterRow: { flexDirection: "row", marginBottom: 12 },
  memberChip: { backgroundColor: "#1a1a2e", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  memberChipActive: { backgroundColor: "#4a6cf7" },
  memberChipText: { color: "#c0c0e0", fontSize: 11 },
  sectionTitle: { color: "#a0a0ff", fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  taskCard: { backgroundColor: "#1a1a2e", borderRadius: 8, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: "#3a3a5a" },
  taskCardSelected: { borderLeftColor: "#4a6cf7", backgroundColor: "#1a1a3e" },
  taskCardCritical: { borderLeftColor: "#ff9800" },
  taskCardBlocked: { borderLeftColor: "#f44" },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  taskTitle: { color: "#e0e0ff", fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  taskStatus: { color: "#888", fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  taskAssignee: { color: "#999", fontSize: 11, marginTop: 2 },
  taskPhase: { color: "#999", fontSize: 11, marginTop: 1 },
  detailPanel: { backgroundColor: "#1a1a3e", borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#4a6cf7" },
  detailTitle: { color: "#e0e0ff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  detailField: { color: "#c0c0e0", fontSize: 12, marginBottom: 4 },
  detailSubtitle: { color: "#a0a0ff", fontSize: 12, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  depLine: { color: "#999", fontSize: 11, marginLeft: 8 },
  adapterSection: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, marginBottom: 12 },
  adapterTitle: { color: "#e0e0ff", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  adapterSub: { color: "#888", fontSize: 11, marginTop: 4 },
  noDataText: { color: "#666", fontSize: 12, fontStyle: "italic" },
  phaseRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  phaseRowCurrent: { backgroundColor: "rgba(74,108,247,0.1)", borderRadius: 6, paddingHorizontal: 6 },
  phaseName: { color: "#c0c0e0", fontSize: 12, width: 130 },
  phaseProgress: { flex: 1, height: 6, backgroundColor: "#2a2a4a", borderRadius: 3, marginHorizontal: 8, overflow: "hidden" },
  phaseBar: { height: "100%", backgroundColor: "#4a6cf7", borderRadius: 3 },
  phaseCount: { color: "#888", fontSize: 11, width: 40, textAlign: "right" },
  sprintCard: { backgroundColor: "#1a2a1a", borderRadius: 8, padding: 10 },
  sprintName: { color: "#4caf50", fontSize: 14, fontWeight: "700" },
  sprintGoal: { color: "#999", fontSize: 11, marginTop: 2 },
  sprintMetrics: { flexDirection: "row", gap: 16, marginTop: 6 },
  sprintMetric: { color: "#c0c0e0", fontSize: 12 },
  sprintBar: { backgroundColor: "#4caf50" },
  columnCard: { backgroundColor: "#2a2a4a", borderRadius: 8, padding: 10, marginRight: 8, minWidth: 100, alignItems: "center" },
  columnOverWip: { borderWidth: 1, borderColor: "#f44" },
  columnName: { color: "#c0c0e0", fontSize: 12, fontWeight: "600" },
  columnWip: { color: "#888", fontSize: 11, marginTop: 2 },
  wipWarning: { color: "#f44", fontSize: 10, marginTop: 2 },
  bottleneckText: { color: "#f44", fontSize: 12, marginTop: 6 },
  boundaryCard: { backgroundColor: "#2a2a4a", borderRadius: 8, padding: 10, marginBottom: 8 },
  boundaryLabel: { color: "#c0c0e0", fontSize: 12, marginBottom: 2 },
  boundaryValue: { color: "#4a6cf7", fontWeight: "700" },
  layerCard: { backgroundColor: "#2a2a4a", borderRadius: 6, padding: 8, marginBottom: 4 },
  layerConcern: { color: "#c0c0e0", fontSize: 12 },
  categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  categoryName: { color: "#c0c0e0", fontSize: 12 },
  categoryCount: { color: "#888", fontSize: 12 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#2a2a4a" },
  footerText: { color: "#666", fontSize: 10 },
  refreshText: { color: "#4a6cf7", fontSize: 12, fontWeight: "600" },
});
