/**
 * client/components/workspace/SimulationModal.tsx
 * ============================================================================
 * NEXUSFLOW V4 — INTERACTIVE WHAT-IF SIMULATION SANDBOX (Prompt 9)
 *
 * Interactive UI for non-destructive project simulation.
 * Parameters: Team Capacity, Timeline Compression, Scope Shock
 * Shows Baseline vs Simulated results with deterministic explanations.
 *
 * SAFETY: Simulation NEVER mutates live project state.
 * ============================================================================
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";

interface SimulationModalProps {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  token: string;
  apiBase: string;
}

interface SimulationResult {
  scenario: { capacityChange: number; timelineCompression: number; scopeShock: number };
  baseline: {
    projectedDays: number;
    projectedCompletionDate: string;
    remainingHours: number;
    remainingTasks: number;
    dailyCapacity: number;
    criticalPathDays: number;
  };
  simulated: {
    projectedDays: number;
    projectedCompletionDate: string;
    remainingHours: number;
    remainingTasks: number;
    dailyCapacity: number;
    capacityPressure: number;
    timelineStress: number;
  };
  delta: { daysChange: number; hoursChange: number; capacityChange: number; tasksChange: number };
  risks: Array<{ category: string; severity: string; description: string }>;
  explanations: Array<{ factor: string; detail: string; impact: string; cause: string }>;
  monteCarlo?: {
    iterations: number;
    completionDays: { p50: number; p75: number; p85: number; p95: number; min: number; max: number; mean: number };
    confidence: number;
  };
  liveStateMutated: boolean;
}

export default function SimulationModal({ visible, onClose, projectId, token, apiBase }: SimulationModalProps) {
  const [capacityChange, setCapacityChange] = useState(0);
  const [timelineCompression, setTimelineCompression] = useState(0);
  const [scopeShock, setScopeShock] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/simulation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          capacityChange,
          timelineCompression,
          scopeShock,
          includeMonteCarlo: true,
          monteCarloIterations: 500,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase, capacityChange, timelineCompression, scopeShock]);

  const resetScenario = useCallback(() => {
    setCapacityChange(0);
    setTimelineCompression(0);
    setScopeShock(0);
    setResult(null);
    setError("");
  }, []);

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>🔬 What-If Simulation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.safetyBanner}>
            <Text style={styles.safetyText}>⚡ Non-destructive — simulation does NOT modify your project</Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Parameters */}
            <Text style={styles.sectionTitle}>Scenario Parameters</Text>

            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Team Capacity Change (%)</Text>
              <TextInput
                style={styles.paramInput}
                value={String(capacityChange)}
                onChangeText={t => setCapacityChange(Number(t) || 0)}
                keyboardType="numeric"
                placeholder="+20 or -30"
              />
              <Text style={styles.paramHint}>
                {capacityChange > 0 ? `+${capacityChange}% more capacity` : capacityChange < 0 ? `${capacityChange}% less capacity` : "No change"}
              </Text>
            </View>

            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Timeline Compression (days)</Text>
              <TextInput
                style={styles.paramInput}
                value={String(timelineCompression)}
                onChangeText={t => setTimelineCompression(Number(t) || 0)}
                keyboardType="numeric"
                placeholder="5 or -10"
              />
              <Text style={styles.paramHint}>
                {timelineCompression > 0 ? `${timelineCompression} days shorter` : timelineCompression < 0 ? `${Math.abs(timelineCompression)} days extended` : "No change"}
              </Text>
            </View>

            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Scope Shock (tasks)</Text>
              <TextInput
                style={styles.paramInput}
                value={String(scopeShock)}
                onChangeText={t => setScopeShock(Number(t) || 0)}
                keyboardType="numeric"
                placeholder="+3 or -2"
              />
              <Text style={styles.paramHint}>
                {scopeShock > 0 ? `+${scopeShock} tasks added` : scopeShock < 0 ? `${Math.abs(scopeShock)} tasks removed` : "No change"}
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.runBtn} onPress={runSimulation} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.runBtnText}>▶ Run Simulation</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetBtn} onPress={resetScenario}>
                <Text style={styles.resetBtnText}>↻ Reset</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>❌ {error}</Text> : null}

            {/* Results */}
            {result && (
              <>
                <Text style={styles.sectionTitle}>Baseline vs Simulated</Text>
                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonCol}>
                    <Text style={styles.compLabel}>CURRENT PLAN</Text>
                    <Text style={styles.compValue}>{result.baseline.projectedDays} days</Text>
                    <Text style={styles.compSub}>{formatDate(result.baseline.projectedCompletionDate)}</Text>
                    <Text style={styles.compSub}>{result.baseline.remainingTasks} tasks remaining</Text>
                    <Text style={styles.compSub}>{result.baseline.remainingHours}h work left</Text>
                  </View>
                  <View style={styles.comparisonArrow}>
                    <Text style={styles.arrowText}>→</Text>
                  </View>
                  <View style={styles.comparisonCol}>
                    <Text style={styles.compLabel}>SIMULATED</Text>
                    <Text style={[styles.compValue, result.delta.daysChange > 0 ? styles.textDanger : result.delta.daysChange < 0 ? styles.textSuccess : null]}>
                      {result.simulated.projectedDays} days
                    </Text>
                    <Text style={styles.compSub}>{formatDate(result.simulated.projectedCompletionDate)}</Text>
                    <Text style={styles.compSub}>{result.simulated.remainingTasks} tasks remaining</Text>
                    <Text style={styles.compSub}>{result.simulated.remainingHours}h work left</Text>
                  </View>
                </View>

                {result.delta.daysChange !== 0 && (
                  <View style={[styles.deltaCard, result.delta.daysChange > 0 ? styles.deltaDanger : styles.deltaSuccess]}>
                    <Text style={styles.deltaText}>
                      {result.delta.daysChange > 0 ? "⬆" : "⬇"} {Math.abs(result.delta.daysChange)} days {result.delta.daysChange > 0 ? "longer" : "shorter"}
                    </Text>
                    <Text style={styles.deltaPressure}>Capacity Pressure: {result.simulated.capacityPressure}%</Text>
                  </View>
                )}

                {/* Explanations */}
                {result.explanations.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Explanations</Text>
                    {result.explanations.map((exp, i) => (
                      <View key={i} style={styles.explanationCard}>
                        <Text style={styles.expFactor}>{exp.factor}</Text>
                        <Text style={styles.expDetail}>{exp.detail}</Text>
                        <Text style={styles.expImpact}>Impact: {exp.impact}</Text>
                        <Text style={styles.expCause}>Cause: {exp.cause}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Risks */}
                {result.risks.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Risk Assessment</Text>
                    {result.risks.map((risk, i) => (
                      <View key={i} style={[styles.riskCard, risk.severity === "critical" ? styles.riskCritical : styles.riskHigh]}>
                        <Text style={styles.riskCategory}>{risk.category}</Text>
                        <Text style={styles.riskDesc}>{risk.description}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Monte Carlo */}
                {result.monteCarlo && (
                  <>
                    <Text style={styles.sectionTitle}>Monte Carlo Forecast ({result.monteCarlo.iterations} runs)</Text>
                    <View style={styles.monteCarloCard}>
                      <Text style={styles.mcLabel}>50th percentile: {result.monteCarlo.completionDays.p50} days</Text>
                      <Text style={styles.mcLabel}>85th percentile: {result.monteCarlo.completionDays.p85} days</Text>
                      <Text style={styles.mcLabel}>95th percentile: {result.monteCarlo.completionDays.p95} days</Text>
                      <Text style={styles.mcLabel}>Range: {result.monteCarlo.completionDays.min}–{result.monteCarlo.completionDays.max} days</Text>
                      <Text style={styles.mcConfidence}>Confidence: {result.monteCarlo.confidence}%</Text>
                    </View>
                  </>
                )}

                <View style={styles.immutableBanner}>
                  <Text style={styles.immutableText}>
                    ✅ Live State Mutated: {result.liveStateMutated ? "YES ⚠️" : "NO — project is unchanged"}
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 16 },
  modal: { backgroundColor: "#1a1a2e", borderRadius: 16, maxHeight: "90%", overflow: "hidden" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#2a2a4a" },
  title: { color: "#e0e0ff", fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 8 },
  closeBtnText: { color: "#888", fontSize: 18 },
  safetyBanner: { backgroundColor: "#1a3a1a", padding: 8, alignItems: "center" },
  safetyText: { color: "#4caf50", fontSize: 12, fontWeight: "600" },
  body: { padding: 16 },
  sectionTitle: { color: "#a0a0ff", fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  paramRow: { marginBottom: 12 },
  paramLabel: { color: "#c0c0e0", fontSize: 13, marginBottom: 4 },
  paramInput: { backgroundColor: "#2a2a4a", color: "#e0e0ff", borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, borderColor: "#3a3a5a" },
  paramHint: { color: "#888", fontSize: 11, marginTop: 2 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 8 },
  runBtn: { flex: 1, backgroundColor: "#4a6cf7", padding: 12, borderRadius: 8, alignItems: "center" },
  runBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  resetBtn: { backgroundColor: "#3a3a5a", padding: 12, borderRadius: 8, alignItems: "center", paddingHorizontal: 20 },
  resetBtnText: { color: "#c0c0e0", fontWeight: "600", fontSize: 14 },
  errorText: { color: "#f44", fontSize: 13, marginVertical: 8 },
  comparisonRow: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  comparisonCol: { flex: 1, backgroundColor: "#2a2a4a", borderRadius: 8, padding: 12 },
  comparisonArrow: { paddingHorizontal: 8 },
  arrowText: { color: "#666", fontSize: 20 },
  compLabel: { color: "#888", fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  compValue: { color: "#e0e0ff", fontSize: 20, fontWeight: "700" },
  compSub: { color: "#999", fontSize: 11, marginTop: 2 },
  textDanger: { color: "#f44" },
  textSuccess: { color: "#4caf50" },
  deltaCard: { borderRadius: 8, padding: 12, marginVertical: 8, alignItems: "center" },
  deltaDanger: { backgroundColor: "rgba(244,67,54,0.15)" },
  deltaSuccess: { backgroundColor: "rgba(76,175,80,0.15)" },
  deltaText: { color: "#e0e0ff", fontSize: 16, fontWeight: "700" },
  deltaPressure: { color: "#999", fontSize: 12, marginTop: 4 },
  explanationCard: { backgroundColor: "#2a2a4a", borderRadius: 8, padding: 10, marginBottom: 8 },
  expFactor: { color: "#a0a0ff", fontSize: 13, fontWeight: "700" },
  expDetail: { color: "#c0c0e0", fontSize: 12, marginTop: 2 },
  expImpact: { color: "#ffab40", fontSize: 11, marginTop: 4 },
  expCause: { color: "#999", fontSize: 11, marginTop: 2 },
  riskCard: { borderRadius: 8, padding: 10, marginBottom: 8 },
  riskCritical: { backgroundColor: "rgba(244,67,54,0.15)", borderLeftWidth: 3, borderLeftColor: "#f44" },
  riskHigh: { backgroundColor: "rgba(255,152,0,0.15)", borderLeftWidth: 3, borderLeftColor: "#ff9800" },
  riskCategory: { color: "#f44", fontSize: 12, fontWeight: "700" },
  riskDesc: { color: "#c0c0e0", fontSize: 12, marginTop: 2 },
  monteCarloCard: { backgroundColor: "#2a2a4a", borderRadius: 8, padding: 12 },
  mcLabel: { color: "#c0c0e0", fontSize: 12, marginBottom: 4 },
  mcConfidence: { color: "#4caf50", fontSize: 13, fontWeight: "700", marginTop: 4 },
  immutableBanner: { backgroundColor: "#1a3a1a", borderRadius: 8, padding: 10, marginTop: 16, marginBottom: 16, alignItems: "center" },
  immutableText: { color: "#4caf50", fontSize: 12, fontWeight: "600" },
});
