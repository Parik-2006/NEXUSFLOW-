/**
 * client/components/workspace/FairContributionPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — FAIR CONTRIBUTION ANALYSIS PANEL (Prompt 15)
 *
 * Visualizes multidimensional, evidence-based team contribution metrics.
 *
 * SAFETY INVARIANT:
 *   Non-punitive: no public ranking/punishment. Strictly evidence-based.
 *   Provides dispute resolution workflow.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface FairContributionPanelProps {
  projectId: string;
  token: string;
  apiBase: string;
  isLeaderOrFaculty?: boolean;
}

interface MemberContribution {
  memberId: string;
  name: string;
  role: string;
  compositeScore: number;
  completedTasksCount: number;
  completedWorkloadHours: number;
  coveredRequirementsCount: number;
  evidenceCount: number;
  activeDaysCount: number;
  factualSummary: string;
  dimensionalShares: {
    taskWorkload: number;
    requirementCoverage: number;
    evidenceContribution: number;
    processConsistency: number;
  };
}

interface ContributionData {
  weights: { taskWorkload: number; requirementCoverage: number; evidenceContribution: number; processConsistency: number };
  formulaExplanation: string;
  members: MemberContribution[];
  disputes: Array<{ id: string; studentName: string; category: string; description: string; status: string }>;
}

export default function FairContributionPanel({
  projectId,
  token,
  apiBase,
  isLeaderOrFaculty = false,
}: FairContributionPanelProps) {
  const [data, setData] = useState<ContributionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dispute form
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeCategory, setDisputeCategory] = useState("MISSING_ACTIVITY");

  const fetchContribution = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = isLeaderOrFaculty ? "contribution-analysis" : "contribution-analysis/me";
      const res = await fetch(`${apiBase}/api/projects/${projectId}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (!isLeaderOrFaculty && json.student) {
        setData({
          weights: json.weights,
          formulaExplanation: json.formulaExplanation,
          members: [json.student],
          disputes: json.disputes || [],
        });
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load contribution analysis");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase, isLeaderOrFaculty]);

  useEffect(() => {
    fetchContribution();
  }, [fetchContribution]);

  const handleSubmitDispute = async () => {
    if (!disputeDesc) return;
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/contribution-disputes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          disputeCategory,
          description: disputeDesc,
        }),
      });
      if (res.ok) {
        setDisputeDesc("");
        setShowDisputeForm(false);
        fetchContribution();
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit dispute");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Fair Contribution Intelligence</Text>
          <Text style={styles.subtitle}>
            {isLeaderOrFaculty ? "Team Overview (Leaders & Faculty)" : "Personal Evidence Summary"}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchContribution}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Transparent Formula Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Transparent Evidence Model:</Text>
        <Text style={styles.bannerText}>
          {data?.formulaExplanation || "40% Workload Hours + 25% Requirement Scope + 20% Verified Evidence + 15% Process Consistency"}
        </Text>
      </View>

      {loading && <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 24 }} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {/* Member Cards */}
      {data && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isLeaderOrFaculty ? "Team Members Contribution Records" : "My Contribution Record"}
            </Text>

            {data.members.map(m => (
              <View key={m.memberId} style={styles.memberCard}>
                <View style={styles.memberHeader}>
                  <View>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <Text style={styles.memberRole}>Role: {m.role}</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scorePillText}>Score: {m.compositeScore}</Text>
                  </View>
                </View>

                <Text style={styles.summaryText}>{m.factualSummary}</Text>

                {/* Dimensional Breakdown Badges */}
                <View style={styles.dimensionsRow}>
                  <View style={styles.dimensionBadge}>
                    <Text style={styles.dimLabel}>Workload</Text>
                    <Text style={styles.dimValue}>{m.completedWorkloadHours}h ({m.dimensionalShares.taskWorkload}%)</Text>
                  </View>
                  <View style={styles.dimensionBadge}>
                    <Text style={styles.dimLabel}>Scope</Text>
                    <Text style={styles.dimValue}>{m.coveredRequirementsCount} reqs ({m.dimensionalShares.requirementCoverage}%)</Text>
                  </View>
                  <View style={styles.dimensionBadge}>
                    <Text style={styles.dimLabel}>Evidence</Text>
                    <Text style={styles.dimValue}>{m.evidenceCount} items ({m.dimensionalShares.evidenceContribution}%)</Text>
                  </View>
                  <View style={styles.dimensionBadge}>
                    <Text style={styles.dimLabel}>Consistency</Text>
                    <Text style={styles.dimValue}>{m.activeDaysCount} days ({m.dimensionalShares.processConsistency}%)</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Dispute Flow */}
          <View style={styles.section}>
            <View style={styles.disputeHeader}>
              <Text style={styles.sectionTitle}>Attribution Disputes & Reviews</Text>
              <TouchableOpacity
                style={styles.disputeBtn}
                onPress={() => setShowDisputeForm(!showDisputeForm)}
              >
                <Text style={styles.disputeBtnText}>
                  {showDisputeForm ? "Cancel" : "Flag Missing Activity"}
                </Text>
              </TouchableOpacity>
            </View>

            {showDisputeForm && (
              <View style={styles.disputeForm}>
                <Text style={styles.formTitle}>Report Unattributed Activity / Discrepancy</Text>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  placeholder="Describe missing task, evidence artifact, or attribution discrepancy..."
                  placeholderTextColor="#64748b"
                  multiline
                  value={disputeDesc}
                  onChangeText={setDisputeDesc}
                />
                <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitDispute}>
                  <Text style={styles.submitBtnText}>Submit Dispute for Review</Text>
                </TouchableOpacity>
              </View>
            )}

            {data.disputes.length === 0 ? (
              <Text style={styles.mutedText}>No active attribution disputes filed.</Text>
            ) : (
              data.disputes.map(d => (
                <View key={d.id} style={styles.disputeCard}>
                  <View style={styles.disputeRow}>
                    <Text style={styles.disputeCategory}>{d.category}</Text>
                    <Text style={styles.disputeStatus}>{d.status}</Text>
                  </View>
                  <Text style={styles.disputeDesc}>{d.description}</Text>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  refreshBtn: { backgroundColor: "#334155", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  refreshBtnText: { color: "#e2e8f0", fontSize: 12 },
  banner: { backgroundColor: "#1e293b", padding: 12, borderRadius: 6, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  bannerTitle: { color: "#60a5fa", fontSize: 12, fontWeight: "700" },
  bannerText: { color: "#cbd5e1", fontSize: 12, marginTop: 2 },
  errorText: { color: "#ef4444", marginBottom: 12 },
  section: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#f1f5f9", marginBottom: 12 },
  mutedText: { color: "#64748b", fontSize: 13 },
  memberCard: { backgroundColor: "#0f172a", padding: 14, borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  memberHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  memberName: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
  memberRole: { color: "#94a3b8", fontSize: 12 },
  scorePill: { backgroundColor: "#1e3a8a", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  scorePillText: { color: "#60a5fa", fontSize: 12, fontWeight: "700" },
  summaryText: { color: "#cbd5e1", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  dimensionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dimensionBadge: { backgroundColor: "#1e293b", padding: 8, borderRadius: 4, minWidth: 100, flex: 1 },
  dimLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "600" },
  dimValue: { color: "#f8fafc", fontSize: 12, fontWeight: "700", marginTop: 2 },
  disputeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  disputeBtn: { backgroundColor: "#475569", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  disputeBtnText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  disputeForm: { backgroundColor: "#0f172a", padding: 12, borderRadius: 6, marginBottom: 14, borderWidth: 1, borderColor: "#334155" },
  formTitle: { color: "#f8fafc", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "#1e293b", color: "#f8fafc", padding: 8, borderRadius: 4, fontSize: 12, marginBottom: 8 },
  submitBtn: { backgroundColor: "#3b82f6", padding: 8, borderRadius: 4, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  disputeCard: { backgroundColor: "#0f172a", padding: 10, borderRadius: 4, marginBottom: 8 },
  disputeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  disputeCategory: { color: "#f59e0b", fontSize: 12, fontWeight: "700" },
  disputeStatus: { color: "#94a3b8", fontSize: 11 },
  disputeDesc: { color: "#cbd5e1", fontSize: 12 },
});
