/**
 * client/components/workspace/ProcessMiningPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — PROCESS MINING PANEL (Prompt 11)
 *
 * Visualizes factual process mining insights derived from ProjectEvent logs:
 *   - State transition graph (frequency, average duration)
 *   - Cycle time statistics (mean, median, min, max)
 *   - Empirical bottlenecks with evidence
 *   - Rework cycles & repeated transitions
 *   - Throughput metrics
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface ProcessMiningPanelProps {
  projectId: string;
  token: string;
  apiBase: string;
}

interface TransitionEdge {
  fromState: string;
  toState: string;
  count: number;
  avgDurationHours: number;
  taskCount: number;
}

interface BottleneckItem {
  state: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  avgDwellHours?: number;
  evidence: string;
}

interface ProcessMiningData {
  status: string;
  eventCount: number;
  methodology: string;
  transitions: TransitionEdge[];
  cycleTimes: { count: number; meanHours: number; medianHours: number; minHours: number; maxHours: number };
  stateDwellTimes: Record<string, { visitCount: number; totalHours: number; avgHoursPerVisit: number }>;
  rework: { loopCount: number; reworkPercentage: number; affectedTasks: Array<{ taskTitle: string; repeatedStates: string[] }> };
  bottlenecks: BottleneckItem[];
  throughput: { completedTasks: number; totalTasks: number; completionPercentage: number; tasksPerWeek: number };
}

export default function ProcessMiningPanel({ projectId, token, apiBase }: ProcessMiningPanelProps) {
  const [data, setData] = useState<ProcessMiningData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProcessMining = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/process-mining`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load process mining data");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchProcessMining();
  }, [fetchProcessMining]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Process Mining & Flow Intelligence</Text>
          <Text style={styles.subtitle}>
            Methodology: {data?.methodology || "Detecting..."} • Events Analyzed: {data?.eventCount || 0}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchProcessMining} disabled={loading}>
          <Text style={styles.refreshBtnText}>{loading ? "Analyzing..." : "Refresh Flow"}</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 32 }} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {data && (
        <>
          {/* Top Metrics Row */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{data.cycleTimes.medianHours}h</Text>
              <Text style={styles.metricLabel}>Median Cycle Time</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{data.rework.reworkPercentage}%</Text>
              <Text style={styles.metricLabel}>Rework Rate ({data.rework.loopCount} loops)</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{data.throughput.tasksPerWeek}/wk</Text>
              <Text style={styles.metricLabel}>Throughput Velocity</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{data.bottlenecks.length}</Text>
              <Text style={styles.metricLabel}>Bottlenecks Detected</Text>
            </View>
          </View>

          {/* Bottlenecks Warning Section */}
          {data.bottlenecks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚠️ Bottleneck Hotspots</Text>
              {data.bottlenecks.map((b, idx) => (
                <View key={idx} style={[styles.bottleneckCard, b.severity === "HIGH" ? styles.borderHigh : styles.borderMed]}>
                  <View style={styles.bottleneckHeader}>
                    <Text style={styles.bottleneckState}>{b.state}</Text>
                    <Text style={[styles.badge, b.severity === "HIGH" ? styles.badgeHigh : styles.badgeMed]}>
                      {b.severity} SEVERITY
                    </Text>
                  </View>
                  <Text style={styles.bottleneckEvidence}>{b.evidence}</Text>
                </View>
              ))}
            </View>
          )}

          {/* State Transition Flow Graph */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Process State Transitions</Text>
            {data.transitions.length === 0 ? (
              <Text style={styles.mutedText}>No state transitions recorded yet.</Text>
            ) : (
              data.transitions.map((t, idx) => (
                <View key={idx} style={styles.transitionRow}>
                  <View style={styles.transitionNode}>
                    <Text style={styles.nodeText}>{t.fromState}</Text>
                  </View>
                  <Text style={styles.arrowText}>➔</Text>
                  <View style={styles.transitionNode}>
                    <Text style={styles.nodeText}>{t.toState}</Text>
                  </View>
                  <View style={styles.transitionStats}>
                    <Text style={styles.statCount}>{t.count} transitions</Text>
                    <Text style={styles.statDuration}>avg {t.avgDurationHours}h</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Rework Loop Details */}
          {data.rework.affectedTasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Detected Rework Loops</Text>
              {data.rework.affectedTasks.map((task, idx) => (
                <View key={idx} style={styles.reworkCard}>
                  <Text style={styles.reworkTitle}>{task.taskTitle}</Text>
                  <Text style={styles.reworkDetail}>
                    Repeated state entries: {task.repeatedStates.join(", ")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  refreshBtn: { backgroundColor: "#6366f1", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  refreshBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  errorText: { color: "#ef4444", marginVertical: 12 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  metricCard: { flex: 1, minWidth: 140, backgroundColor: "#1e293b", padding: 14, borderRadius: 8, borderWidth: 1, borderColor: "#334155" },
  metricValue: { fontSize: 22, fontWeight: "700", color: "#60a5fa" },
  metricLabel: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  section: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#f1f5f9", marginBottom: 12 },
  mutedText: { color: "#64748b", fontSize: 13 },
  bottleneckCard: { backgroundColor: "#0f172a", padding: 12, borderRadius: 6, marginBottom: 10, borderWidth: 1 },
  borderHigh: { borderColor: "#ef4444" },
  borderMed: { borderColor: "#f59e0b" },
  bottleneckHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bottleneckState: { color: "#f8fafc", fontWeight: "600", fontSize: 14 },
  badge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeHigh: { backgroundColor: "#ef444422", color: "#ef4444" },
  badgeMed: { backgroundColor: "#f59e0b22", color: "#f59e0b" },
  bottleneckEvidence: { color: "#cbd5e1", fontSize: 12, marginTop: 6 },
  transitionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  transitionNode: { backgroundColor: "#334155", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  nodeText: { color: "#e2e8f0", fontSize: 12, fontWeight: "600" },
  arrowText: { color: "#94a3b8", marginHorizontal: 8, fontSize: 14 },
  transitionStats: { marginLeft: "auto", alignItems: "flex-end" },
  statCount: { color: "#e2e8f0", fontSize: 12, fontWeight: "600" },
  statDuration: { color: "#94a3b8", fontSize: 11 },
  reworkCard: { backgroundColor: "#0f172a", padding: 10, borderRadius: 6, marginBottom: 8 },
  reworkTitle: { color: "#f8fafc", fontWeight: "600", fontSize: 13 },
  reworkDetail: { color: "#f59e0b", fontSize: 12, marginTop: 2 },
});
