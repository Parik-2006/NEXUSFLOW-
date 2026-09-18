/**
 * client/components/workspace/DecisionExplanationDrawer.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 23: EXPLAINABLE DECISION DRAWER
 *
 * Universal structured explanation component for deterministic DAA decisions:
 * - WHAT happened
 * - WHY
 * - WHICH factors mattered
 * - WHAT evidence supports it
 * - WHAT constraints existed
 * - WHAT alternatives existed
 * - WHAT would change it (Counterfactual exploration)
 * ============================================================================
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Card, Button, Badge } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";

interface DecisionExplanation {
  decisionId: string;
  decisionType: string;
  subjectType: string;
  subjectId: string;
  result: any;
  classification: "DETERMINISTIC" | "ADVISORY";
  source: string;
  factors: Array<{
    name: string;
    weight: number;
    contribution: number;
    explanation: string;
  }>;
  evidence: Array<{
    type: string;
    description: string;
  }>;
  constraints: Array<{
    name: string;
    satisfied: boolean;
    actual: string;
    threshold: string;
    impact: string;
  }>;
  alternatives: Array<{
    option: string;
    score: number;
    costDifference: number;
    reasonNotChosen: string;
  }>;
  counterfactuals: Array<{
    parameter: string;
    originalValue: any;
    modifiedValue: any;
    delta: string;
  }>;
  explanation: {
    what: string;
    why: string;
    factorsSummary: string;
    evidenceSummary: string;
    constraintsSummary: string;
    alternativesSummary: string;
    whatWouldChange: string;
  };
  aiSummary?: string | null;
}

export default function DecisionExplanationDrawer({
  visible,
  onClose,
  decisionId,
  projectId,
}: {
  visible: boolean;
  onClose: () => void;
  decisionId: string;
  projectId: string;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<DecisionExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [cfParam, setCfParam] = useState("urgency");
  const [cfVal, setCfVal] = useState("5");
  const [cfResult, setCfResult] = useState<string | null>(null);

  useEffect(() => {
    if (visible && decisionId) {
      loadDecision();
    } else {
      setData(null);
      setCfResult(null);
    }
  }, [visible, decisionId]);

  const loadDecision = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/decisions/explain/${decisionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e: any) {
      toast(e.message || "Failed to load explanation", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAiSummary = async () => {
    if (!decisionId) return;
    try {
      setAiSummarizing(true);
      const res = await fetch(`${API_BASE_URL}/api/decisions/${decisionId}/ai-summary`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.aiSummary) {
        setData((prev) => (prev ? { ...prev, aiSummary: json.aiSummary } : null));
        toast("Executive AI summary generated", "success");
      }
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setAiSummarizing(false);
    }
  };

  const handleCounterfactual = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/decisions/explain/counterfactual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decisionId, parameter: cfParam, modifiedValue: cfVal }),
      });
      const json = await res.json();
      if (res.ok) {
        setCfResult(json.deltaExplanation || "Counterfactual recomputed.");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.drawerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <Badge
                  label={data?.classification || "DETERMINISTIC"}
                  color={data?.classification === "DETERMINISTIC" ? colors.primary : colors.accent}
                />
                <Text style={styles.sourceText}>Source: {data?.source || "DAA Engine"}</Text>
              </View>
              <Text style={styles.headerTitle}>Decision Intelligence Breakdown</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Retrieving deterministic decision tree...</Text>
            </View>
          ) : !data ? (
            <View style={styles.loadingBox}>
              <Text style={styles.errorText}>No decision explanation found.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollContent}>
              {/* Section 1: Decision Result */}
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>1. The Decision (What)</Text>
                <Text style={styles.whatText}>{data.explanation?.what || JSON.stringify(data.result)}</Text>
              </Card>

              {/* Section 2: Why */}
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>2. Underlying Rationale (Why)</Text>
                <Text style={styles.bodyText}>{data.explanation?.why}</Text>
              </Card>

              {/* Section 3: Factor Contributions */}
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>3. Deterministic Factors & Weights</Text>
                {data.factors?.map((f, i) => (
                  <View key={i} style={styles.factorRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.factorName}>{f.name}</Text>
                      <Text style={styles.factorExplanation}>{f.explanation}</Text>
                    </View>
                    <Badge label={`+${f.contribution} pts`} color={colors.primary} />
                  </View>
                ))}
              </Card>

              {/* Section 4: Constraints */}
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>4. Constraints & Guardrails</Text>
                {data.constraints?.map((c, i) => (
                  <View key={i} style={styles.constraintRow}>
                    <Ionicons
                      name={c.satisfied ? "checkmark-circle" : "alert-circle"}
                      size={16}
                      color={c.satisfied ? colors.success : colors.danger}
                    />
                    <View style={{ flex: 1, marginLeft: spacing.xs }}>
                      <Text style={styles.constraintName}>{c.name}</Text>
                      <Text style={styles.constraintDetail}>{c.impact}</Text>
                    </View>
                  </View>
                ))}
              </Card>

              {/* Section 5: Alternatives */}
              {data.alternatives && data.alternatives.length > 0 && (
                <Card style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>5. Alternatives Evaluated</Text>
                  {data.alternatives.map((alt, i) => (
                    <View key={i} style={styles.altItem}>
                      <Text style={styles.altOption}>{alt.option}</Text>
                      <Text style={styles.altReason}>{alt.reasonNotChosen}</Text>
                    </View>
                  ))}
                </Card>
              )}

              {/* Section 6: Counterfactual Exploration */}
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>6. What Would Change It? (Counterfactual)</Text>
                <Text style={styles.bodyText}>{data.explanation?.whatWouldChange}</Text>

                <View style={styles.cfForm}>
                  <Text style={styles.cfLabel}>Recompute under modified value:</Text>
                  <View style={styles.cfInputs}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={cfParam}
                      onChangeText={setCfParam}
                      placeholder="Parameter"
                    />
                    <TextInput
                      style={[styles.input, { width: 70 }]}
                      value={cfVal}
                      onChangeText={setCfVal}
                      placeholder="Value"
                    />
                    <Button title="Recompute" variant="secondary" small onPress={handleCounterfactual} />
                  </View>
                  {cfResult && (
                    <View style={styles.cfResultBox}>
                      <Ionicons name="git-commit-outline" size={14} color={colors.primary} />
                      <Text style={styles.cfResultText}>{cfResult}</Text>
                    </View>
                  )}
                </View>
              </Card>

              {/* Section 7: Optional AI Summary */}
              <Card style={{ ...styles.sectionCard, ...styles.aiCard } as any}>
                <View style={styles.aiHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="sparkles" size={16} color={colors.accentDark} />
                    <Text style={styles.aiHeading}>AI Executive Summary</Text>
                  </View>
                  {!data.aiSummary && (
                    <Button
                      title={aiSummarizing ? "Synthesizing..." : "Summarize"}
                      small
                      variant="secondary"
                      disabled={aiSummarizing}
                      onPress={handleAiSummary}
                    />
                  )}
                </View>
                <Text style={styles.aiSummaryText}>
                  {data.aiSummary || "Advisory AI summary is available on-demand using zero-cost cascade."}
                </Text>
              </Card>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  drawerContainer: {
    height: "85%",
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 4,
  },
  sourceText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
  scrollContent: {
    flex: 1,
    marginTop: spacing.md,
  },
  sectionCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  whatText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  factorName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  factorExplanation: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  constraintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  constraintName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  constraintDetail: {
    fontSize: 11,
    color: colors.textMuted,
  },
  altItem: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  altOption: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  altReason: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cfForm: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  cfLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  cfInputs: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  cfResultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.xs,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  cfResultText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "500",
  },
  aiCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  aiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  aiHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentDark,
  },
  aiSummaryText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
