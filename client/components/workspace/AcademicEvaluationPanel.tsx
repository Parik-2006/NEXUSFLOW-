/**
 * client/components/workspace/AcademicEvaluationPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — ACADEMIC EVALUATION PANEL (Prompt 14)
 *
 * Visualizes configurable academic rubric criteria, objective evidence coverage,
 * missing evidence gaps, and teacher-controlled evaluation status.
 *
 * SAFETY INVARIANT:
 *   NO AUTOMATIC GRADING. All scores and marks are teacher-controlled.
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

interface AcademicEvaluationPanelProps {
  projectId: string;
  token: string;
  apiBase: string;
}

interface RubricCriterion {
  criterionId: string;
  title: string;
  description: string;
  weight: number;
  reviewedStatus: "PENDING" | "SATISFIED" | "NEEDS_REVISION";
  evidenceCoverageScore: number;
  teacherScore?: number;
  teacherFeedback?: string;
  itemsTotal: number;
  itemsMet: number;
}

interface EvaluationData {
  course: string;
  semester: string;
  status: string;
  criteria: RubricCriterion[];
  overallCoverageScore: number;
  missingEvidenceGaps: Array<{ criterionTitle: string; title: string; reason: string }>;
  overallEvaluation?: { teacherRemarks?: string; evaluatorName?: string; evaluatedAt?: string };
}

export default function AcademicEvaluationPanel({
  projectId,
  token,
  apiBase,
}: AcademicEvaluationPanelProps) {
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/academic-evaluation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load academic evaluation");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Academic Evaluation & Rubrics</Text>
          <Text style={styles.subtitle}>
            {data?.course || "Capstone Project"} • {data?.semester || "Final Year"}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchEvaluation}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Human Control Guarantee Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          🛡️ <Text style={{ fontWeight: "700" }}>Faculty Controlled:</Text> Evidence coverage is calculated deterministically. Final academic marks and remarks are entered strictly by authorized faculty.
        </Text>
      </View>

      {loading && <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 24 }} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {data && (
        <>
          {/* Top Score Summary */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View>
                <Text style={styles.scoreValue}>{data.overallCoverageScore}%</Text>
                <Text style={styles.scoreLabel}>Objective Evidence Coverage</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{data.status.replace(/_/g, " ")}</Text>
              </View>
            </View>

            {data.overallEvaluation?.teacherRemarks ? (
              <View style={styles.remarksBox}>
                <Text style={styles.remarksTitle}>Faculty Remarks ({data.overallEvaluation.evaluatorName || "Teacher"}):</Text>
                <Text style={styles.remarksText}>{data.overallEvaluation.teacherRemarks}</Text>
              </View>
            ) : null}
          </View>

          {/* Rubric Criteria List */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Evaluation Rubric Criteria</Text>
            {data.criteria.map(crit => (
              <View key={crit.criterionId} style={styles.criterionCard}>
                <View style={styles.critHeader}>
                  <View>
                    <Text style={styles.critTitle}>{crit.title}</Text>
                    <Text style={styles.critWeight}>Weight: {crit.weight}% of evaluation</Text>
                  </View>
                  <View style={[styles.critBadge, getStatusStyle(crit.reviewedStatus)]}>
                    <Text style={styles.critBadgeText}>{crit.reviewedStatus}</Text>
                  </View>
                </View>
                <Text style={styles.critDesc}>{crit.description}</Text>

                {/* Coverage progress */}
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>
                    Evidence Coverage: {crit.evidenceCoverageScore}% ({crit.itemsMet}/{crit.itemsTotal} items verified)
                  </Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${crit.evidenceCoverageScore}%` }]} />
                  </View>
                </View>

                {crit.teacherFeedback ? (
                  <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackLabel}>Faculty Feedback:</Text>
                    <Text style={styles.feedbackText}>{crit.teacherFeedback}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {/* Missing Evidence Gaps */}
          {data.missingEvidenceGaps.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚠️ Evidence Gaps Requiring Attention</Text>
              {data.missingEvidenceGaps.map((gap, idx) => (
                <View key={idx} style={styles.gapCard}>
                  <Text style={styles.gapTitle}>{gap.title} ({gap.criterionTitle})</Text>
                  <Text style={styles.gapReason}>{gap.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function getStatusStyle(status: string) {
  if (status === "SATISFIED") return { backgroundColor: "#065f46" };
  if (status === "NEEDS_REVISION") return { backgroundColor: "#991b1b" };
  return { backgroundColor: "#334155" };
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
  bannerText: { color: "#94a3b8", fontSize: 12, lineHeight: 16 },
  errorText: { color: "#ef4444", marginBottom: 12 },
  scoreCard: { backgroundColor: "#1e293b", padding: 18, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreValue: { fontSize: 32, fontWeight: "800", color: "#38bdf8" },
  scoreLabel: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  statusBadge: { backgroundColor: "#334155", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: "#f8fafc", fontSize: 11, fontWeight: "700" },
  remarksBox: { marginTop: 14, padding: 10, backgroundColor: "#0f172a", borderRadius: 6 },
  remarksTitle: { color: "#60a5fa", fontSize: 12, fontWeight: "600" },
  remarksText: { color: "#e2e8f0", fontSize: 13, marginTop: 4 },
  section: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#f1f5f9", marginBottom: 14 },
  criterionCard: { backgroundColor: "#0f172a", padding: 14, borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  critHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  critTitle: { color: "#f8fafc", fontSize: 14, fontWeight: "700" },
  critWeight: { color: "#94a3b8", fontSize: 11, marginTop: 2 },
  critBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  critBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  critDesc: { color: "#cbd5e1", fontSize: 12, marginTop: 6 },
  progressRow: { marginTop: 10 },
  progressLabel: { color: "#94a3b8", fontSize: 11, marginBottom: 4 },
  progressBarBg: { height: 6, backgroundColor: "#334155", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#3b82f6", borderRadius: 3 },
  feedbackBox: { marginTop: 8, padding: 8, backgroundColor: "#1e293b", borderRadius: 4 },
  feedbackLabel: { color: "#f59e0b", fontSize: 11, fontWeight: "600" },
  feedbackText: { color: "#e2e8f0", fontSize: 12, marginTop: 2 },
  gapCard: { backgroundColor: "#0f172a", padding: 10, borderRadius: 6, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  gapTitle: { color: "#f8fafc", fontSize: 12, fontWeight: "600" },
  gapReason: { color: "#ef4444", fontSize: 11, marginTop: 2 },
});
