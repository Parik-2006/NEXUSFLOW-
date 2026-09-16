/**
 * client/components/workspace/ConformancePanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WORKFLOW CONFORMANCE PANEL (Prompt 12)
 *
 * Visualizes methodology conformance, deviations from expected process,
 * rule violations, and concrete historical event evidence.
 *
 * SAFETY: Read-only — analysis never modifies project state.
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

interface ConformancePanelProps {
  projectId: string;
  token: string;
  apiBase: string;
}

interface DeviationItem {
  deviationType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  taskId?: string;
  taskTitle?: string;
  columnName?: string;
  ruleViolated: string;
  expectedPath: string;
  actualPath: string;
  evidenceEventId: string;
  timestamp: string;
  actor: string;
}

interface ConformanceData {
  methodology: string;
  conformanceScore: number;
  status: "CONFORMANT" | "DEVIATIONS_DETECTED" | "NON_CONFORMANT" | "INSUFFICIENT_EVIDENCE";
  deviationCount: number;
  deviations: DeviationItem[];
  expectedWorkflow: string;
  mutatesState: boolean;
  analyzedAt: string;
}

export default function ConformancePanel({ projectId, token, apiBase }: ConformancePanelProps) {
  const [data, setData] = useState<ConformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConformance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/workflow-conformance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load conformance analysis");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchConformance();
  }, [fetchConformance]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Workflow Conformance Engine</Text>
          <Text style={styles.subtitle}>Methodology Model: {data?.methodology || "Detecting..."}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchConformance} disabled={loading}>
          <Text style={styles.refreshBtnText}>{loading ? "Checking..." : "Verify Conformance"}</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 32 }} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {data && (
        <>
          {/* Conformance Summary Card */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View>
                <Text style={styles.scoreValue}>{data.conformanceScore}%</Text>
                <Text style={styles.scoreLabel}>Workflow Conformance Score</Text>
              </View>
              <View style={[styles.statusBadge, getStatusStyle(data.status)]}>
                <Text style={styles.statusBadgeText}>{data.status.replace(/_/g, " ")}</Text>
              </View>
            </View>
            <Text style={styles.workflowDescription}>
              <Text style={{ fontWeight: "700" }}>Expected Workflow:</Text> {data.expectedWorkflow}
            </Text>
          </View>

          {/* Deviations List */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Detected Process Deviations ({data.deviationCount})
            </Text>

            {data.deviations.length === 0 ? (
              <Text style={styles.successText}>
                ✅ Zero workflow deviations detected. Execution strictly matches configured methodology.
              </Text>
            ) : (
              data.deviations.map((d, idx) => (
                <View key={idx} style={styles.deviationCard}>
                  <View style={styles.devHeader}>
                    <Text style={styles.devType}>{d.deviationType.replace(/_/g, " ")}</Text>
                    <Text style={[styles.badge, getSeverityBadge(d.severity)]}>{d.severity}</Text>
                  </View>
                  <Text style={styles.devTarget}>
                    Target: {d.taskTitle || d.columnName || "General Workflow"}
                  </Text>
                  <Text style={styles.devRule}>{d.ruleViolated}</Text>

                  <View style={styles.pathComparison}>
                    <Text style={styles.pathText}>
                      <Text style={{ color: "#10b981", fontWeight: "600" }}>Expected: </Text>
                      {d.expectedPath}
                    </Text>
                    <Text style={styles.pathText}>
                      <Text style={{ color: "#ef4444", fontWeight: "600" }}>Observed: </Text>
                      {d.actualPath}
                    </Text>
                  </View>

                  <Text style={styles.evidenceText}>
                    Event ID: {d.evidenceEventId} • Actor: {d.actor}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function getStatusStyle(status: string) {
  if (status === "CONFORMANT") return { backgroundColor: "#065f46" };
  if (status === "DEVIATIONS_DETECTED") return { backgroundColor: "#92400e" };
  return { backgroundColor: "#991b1b" };
}

function getSeverityBadge(sev: string) {
  if (sev === "CRITICAL" || sev === "HIGH") return { backgroundColor: "#ef444422", color: "#ef4444" };
  if (sev === "MEDIUM") return { backgroundColor: "#f59e0b22", color: "#f59e0b" };
  return { backgroundColor: "#3b82f622", color: "#60a5fa" };
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
  scoreCard: { backgroundColor: "#1e293b", padding: 18, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreValue: { fontSize: 32, fontWeight: "800", color: "#38bdf8" },
  scoreLabel: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  statusBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  workflowDescription: { color: "#cbd5e1", fontSize: 13, marginTop: 12, lineHeight: 18 },
  section: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#f1f5f9", marginBottom: 14 },
  successText: { color: "#10b981", fontSize: 14, paddingVertical: 8 },
  deviationCard: { backgroundColor: "#0f172a", padding: 14, borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  devHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devType: { color: "#f8fafc", fontWeight: "700", fontSize: 13 },
  badge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  devTarget: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  devRule: { color: "#e2e8f0", fontSize: 13, marginTop: 6 },
  pathComparison: { backgroundColor: "#1e293b", padding: 8, borderRadius: 4, marginVertical: 8 },
  pathText: { fontSize: 12, color: "#cbd5e1", marginVertical: 2 },
  evidenceText: { color: "#64748b", fontSize: 11, marginTop: 4 },
});
