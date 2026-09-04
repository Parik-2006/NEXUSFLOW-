import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Button, Badge, Card, ProgressBar } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";

export interface PhaseGateCheck {
  id: string;
  label: string;
  passed: boolean;
  details: string;
  required: boolean;
}

export interface PhaseGateData {
  canAdvance: boolean;
  currentPhase: string;
  currentPhaseLabel: string;
  targetPhase: string | null;
  targetPhaseLabel: string | null;
  status: "READY" | "BLOCKED" | "APPROVAL_REQUIRED" | "OVERRIDDEN" | "COMPLETED";
  completion: number;
  checks: PhaseGateCheck[];
  blockers: string[];
  warnings: string[];
  requiresApproval: boolean;
  isOverridden: boolean;
  overrideRecord?: {
    reason: string;
    overriddenAt: string;
  } | null;
  history?: Array<{
    action: string;
    fromPhase: string;
    toPhase?: string;
    actorName?: string;
    reason?: string;
    timestamp: string;
  }>;
}

export default function PhaseGateModal({
  visible,
  onClose,
  projectId,
  onPhaseAdvanced,
}: {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  onPhaseAdvanced?: (newPhase: string) => void;
}) {
  const { token, user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [gateData, setGateData] = useState<PhaseGateData | null>(null);

  // Override prompt state
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const fetchGate = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/phase-gates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.gate) {
        setGateData(data.gate);
      }
    } catch (err) {
      console.error("Failed to fetch phase gate:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchGate();
      setShowOverrideInput(false);
      setOverrideReason("");
    }
  }, [visible, projectId]);

  const handleAdvance = async () => {
    if (!gateData?.canAdvance) return;
    setAdvancing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/phase-gates/advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to advance phase");
      }
      toast(`Project advanced to ${data.toPhase} phase!`, "success");
      onPhaseAdvanced?.(data.toPhase);
      onClose();
    } catch (err: any) {
      toast(err.message || "Failed to advance phase", "error");
    } finally {
      setAdvancing(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      toast("Please enter an explicit override reason (at least 5 characters)", "info");
      return;
    }
    setSubmittingOverride(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/phase-gates/override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phase: gateData?.currentPhase,
          reason: overrideReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Override failed");
      }
      toast("Leader override recorded in project audit log", "success");
      setShowOverrideInput(false);
      fetchGate();
    } catch (err: any) {
      toast(err.message || "Override failed", "error");
    } finally {
      setSubmittingOverride(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "READY":
        return <Badge label="READY TO ADVANCE" color={colors.success} />;
      case "OVERRIDDEN":
        return <Badge label="LEADER OVERRIDDEN" color={colors.warning} />;
      case "COMPLETED":
        return <Badge label="PROJECT COMPLETED" color={colors.primary} />;
      case "APPROVAL_REQUIRED":
        return <Badge label="APPROVAL REQUIRED" color={colors.accent} />;
      default:
        return <Badge label="GATE BLOCKED" color={colors.danger} />;
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Waterfall Phase Gate Control">
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>Evaluating gate prerequisites...</Text>
        </View>
      ) : !gateData ? (
        <View style={s.center}>
          <Text style={s.errorText}>Unable to load phase gate status.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Header Card */}
          <View style={s.headerCard}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.phaseLabel}>CURRENT LIFECYCLE GATE</Text>
                <Text style={s.phaseTitle}>{gateData.currentPhaseLabel}</Text>
              </View>
              {getStatusBadge(gateData.status)}
            </View>

            {gateData.targetPhaseLabel && (
              <View style={s.targetRow}>
                <Ionicons name="arrow-forward-outline" size={14} color={colors.textMuted} />
                <Text style={s.targetText}>Next Phase: {gateData.targetPhaseLabel}</Text>
              </View>
            )}

            <View style={{ marginTop: spacing.sm }}>
              <View style={s.rowBetween}>
                <Text style={s.progressLabel}>Gate Readiness</Text>
                <Text style={s.progressVal}>{gateData.completion}%</Text>
              </View>
              <ProgressBar
                value={gateData.completion / 100}
                color={gateData.canAdvance ? colors.success : colors.warning}
              />
            </View>
          </View>

          {/* Blockers alert if blocked */}
          {gateData.blockers.length > 0 && !gateData.isOverridden && (
            <View style={s.blockerBox}>
              <View style={s.boxHeader}>
                <Ionicons name="close-circle" size={18} color={colors.danger} />
                <Text style={s.blockerTitle}>Blocking Conditions ({gateData.blockers.length})</Text>
              </View>
              {gateData.blockers.map((b, idx) => (
                <Text key={idx} style={s.blockerItem}>• {b}</Text>
              ))}
            </View>
          )}

          {/* Override notice if active */}
          {gateData.isOverridden && (
            <View style={s.overrideNoticeBox}>
              <Ionicons name="shield-checkmark" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={s.overrideNoticeTitle}>Gate Overridden by Leader</Text>
                <Text style={s.overrideNoticeText}>"{gateData.overrideRecord?.reason}"</Text>
              </View>
            </View>
          )}

          {/* Prerequisite Checks List */}
          <View style={s.checksSection}>
            <Text style={s.sectionTitle}>Prerequisite Gate Checks</Text>
            {gateData.checks.map((c) => (
              <View key={c.id} style={s.checkRow}>
                <Ionicons
                  name={c.passed ? "checkmark-circle" : c.required ? "close-circle" : "alert-circle"}
                  size={18}
                  color={c.passed ? colors.success : c.required ? colors.danger : colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.checkLabel, !c.passed && c.required && s.checkRequiredFailed]}>
                    {c.label} {c.required && <Text style={{ color: colors.danger }}>*</Text>}
                  </Text>
                  <Text style={s.checkDetails}>{c.details}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={s.actionBlock}>
            {gateData.canAdvance && gateData.targetPhase && (
              <Button
                title={advancing ? "Advancing Phase..." : `Advance to ${gateData.targetPhaseLabel} →`}
                onPress={handleAdvance}
                disabled={advancing}
                loading={advancing}
                style={{ backgroundColor: colors.success }}
              />
            )}

            {/* Leader Override Trigger */}
            {!gateData.canAdvance && !showOverrideInput && (
              <Button
                title="Leader Override (Require Reason)"
                variant="secondary"
                onPress={() => setShowOverrideInput(true)}
              />
            )}

            {/* Override Input Form */}
            {showOverrideInput && (
              <View style={s.overrideForm}>
                <Text style={s.overrideInputTitle}>Leader Gate Override Justification</Text>
                <Text style={s.overrideInputSub}>
                  Overrides are permanently recorded in the project audit history.
                </Text>
                <TextInput
                  style={s.overrideInput}
                  value={overrideReason}
                  onChangeText={setOverrideReason}
                  placeholder="e.g. Teacher approved moving to implementation while remaining non-critical requirements are finalized..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <View style={s.overrideBtnRow}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => setShowOverrideInput(false)}
                  />
                  <Button
                    title={submittingOverride ? "Recording..." : "Confirm Override"}
                    onPress={handleOverride}
                    disabled={submittingOverride}
                    loading={submittingOverride}
                    style={{ backgroundColor: colors.warning }}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Audit History */}
          {(gateData.history || []).length > 0 && (
            <View style={s.historySection}>
              <Text style={s.sectionTitle}>Gate Transition History</Text>
              {(gateData.history || []).slice(0, 5).map((h, i) => (
                <View key={i} style={s.historyItem}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyAction}>
                      {h.action} ({h.fromPhase} {h.toPhase ? `→ ${h.toPhase}` : ""})
                    </Text>
                    <Text style={s.historyMeta}>
                      By {h.actorName || "Leader"} · {new Date(h.timestamp).toLocaleDateString()}
                      {h.reason ? ` · "${h.reason}"` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  center: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  targetText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  progressVal: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  blockerBox: {
    backgroundColor: colors.danger + "12",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger + "33",
    gap: 4,
  },
  boxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  blockerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
  },
  blockerItem: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  overrideNoticeBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.warning + "14",
    borderWidth: 1,
    borderColor: colors.warning + "44",
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  overrideNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.warning,
  },
  overrideNoticeText: {
    fontSize: 12,
    color: colors.text,
    fontStyle: "italic",
    marginTop: 2,
  },
  checksSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  checkRequiredFailed: {
    color: colors.danger,
  },
  checkDetails: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  actionBlock: {
    gap: 8,
    marginTop: spacing.xs,
  },
  overrideForm: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning + "66",
    gap: 8,
  },
  overrideInputTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.warning,
  },
  overrideInputSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  overrideInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    minHeight: 60,
    textAlignVertical: "top",
  },
  overrideBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  historySection: {
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 4,
  },
  historyAction: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  historyMeta: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
