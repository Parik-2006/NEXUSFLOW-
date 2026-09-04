import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Button, Badge, Card } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";

export interface ChangeImpactResult {
  sourceChange: {
    type: string;
    entityId?: string;
    payload?: any;
  };
  affectedRequirements: Array<{ reqId: string; title: string; phase?: string }>;
  affectedTasks: Array<{ id: string; title: string; phase?: string; isCritical?: boolean }>;
  affectedDependencies: Array<{ sourceTask: string; dependentTask: string }>;
  affectedMembers: Array<{ userId: string; name: string; task?: string }>;
  affectedSkills: string[];
  scheduleImpact: {
    estimatedDaysAdded: number;
    criticalPathShifted: boolean;
  };
  criticalPathImpact: {
    criticalTasksAffected: number;
    criticalPathShifted: boolean;
  };
  phaseGateImpact?: {
    affectedPhase: string;
    gateBlocked: boolean;
    reason: string;
  } | null;
  healthImpact?: {
    estimatedScoreDelta: number;
    projectedGrade: string;
  };
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  explanation: string;
}

const CHANGE_TYPES = [
  { id: "requirement_added", label: "New Requirement", icon: "add-circle-outline" },
  { id: "requirement_changed", label: "Scope / Spec Change", icon: "create-outline" },
  { id: "task_changed", label: "Task Expansion", icon: "list-outline" },
  { id: "deadline_changed", label: "Deadline Compressed", icon: "calendar-outline" },
];

export default function ChangeImpactModal({
  visible,
  onClose,
  projectId,
}: {
  visible: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const { token } = useAuth();
  const toast = useToast();

  const [changeType, setChangeType] = useState("requirement_added");
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("16");
  const [phase, setPhase] = useState("implementation");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ChangeImpactResult | null>(null);

  const handleSimulate = async () => {
    if (!title.trim()) {
      toast("Please enter a proposed change or requirement description", "info");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/change-impact/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          changeType,
          entityId: "REQ-PROPOSED",
          payload: {
            title: title.trim(),
            estimatedHours: parseInt(hours, 10) || 16,
            phase,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to simulate change impact");
      }
      setResult(data.impact);
      toast("Change impact simulation completed", "success");
    } catch (err: any) {
      toast(err.message || "Simulation failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const getSeverityColor = (sev?: string) => {
    switch (sev) {
      case "CRITICAL": return colors.danger;
      case "HIGH": return colors.warning;
      case "MEDIUM": return colors.info;
      default: return colors.success;
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Waterfall Change Impact Engine">
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.subHeader}>
          Trace downstream ripple effects across Requirements → Design → Tasks → Critical Path → Timeline → Phase Gates before committing changes.
        </Text>

        {/* Change Type Pills */}
        <View style={s.pillRow}>
          {CHANGE_TYPES.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setChangeType(t.id)}
              style={[s.typePill, changeType === t.id && s.typePillActive]}
            >
              <Ionicons
                name={t.icon as any}
                size={14}
                color={changeType === t.id ? colors.primary : colors.textMuted}
              />
              <Text style={[s.typeLabel, changeType === t.id && s.typeLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Input fields */}
        <View style={s.inputBlock}>
          <Text style={s.label}>Proposed Change Title / Requirement</Text>
          <TextInput
            style={s.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Add Student Attendance Analytics & Early Warning System"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Estimated Effort (Hours)</Text>
            <TextInput
              style={s.textInput}
              value={hours}
              onChangeText={setHours}
              keyboardType="number-pad"
              placeholder="16"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Target Phase</Text>
            <View style={s.phaseSelectRow}>
              {["requirements", "design", "implementation", "testing"].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPhase(p)}
                  style={[s.phasePill, phase === p && s.phasePillActive]}
                >
                  <Text style={[s.phasePillText, phase === p && s.phasePillTextActive]}>
                    {p.slice(0, 4)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Analyze Button */}
        <Button
          title={analyzing ? "Tracing Dependency Graph..." : "Simulate Change Impact"}
          onPress={handleSimulate}
          disabled={analyzing}
          loading={analyzing}
          style={s.simulateBtn}
        />

        {/* Results Section */}
        {result && (
          <View style={s.resultContainer}>
            <View style={s.resultHeader}>
              <Text style={s.resultTitle}>Impact Assessment</Text>
              <Badge
                label={`${result.severity} IMPACT`}
                color={getSeverityColor(result.severity)}
              />
            </View>

            {/* Explanation card */}
            <View style={s.explanationCard}>
              <Ionicons name="git-network-outline" size={18} color={getSeverityColor(result.severity)} />
              <Text style={s.explanationText}>{result.explanation}</Text>
            </View>

            {/* Metrics Breakdown Grid */}
            <View style={s.metricsGrid}>
              <View style={s.metricCard}>
                <Text style={s.metricNum}>+{result.scheduleImpact.estimatedDaysAdded}d</Text>
                <Text style={s.metricLabel}>Schedule Variance</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={[s.metricNum, result.criticalPathImpact.criticalTasksAffected > 0 && { color: colors.danger }]}>
                  {result.criticalPathImpact.criticalTasksAffected}
                </Text>
                <Text style={s.metricLabel}>Critical Tasks</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={s.metricNum}>{result.affectedTasks.length}</Text>
                <Text style={s.metricLabel}>Downstream Tasks</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={s.metricNum}>{result.affectedMembers.length}</Text>
                <Text style={s.metricLabel}>Team Members</Text>
              </View>
            </View>

            {/* Phase Gate Impact Warning */}
            {result.phaseGateImpact && (
              <View style={s.gateImpactCard}>
                <Ionicons
                  name={result.phaseGateImpact.gateBlocked ? "alert-circle" : "warning-outline"}
                  size={18}
                  color={result.phaseGateImpact.gateBlocked ? colors.danger : colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.gateImpactTitle}>
                    {result.phaseGateImpact.gateBlocked ? "Phase Gate Blocked" : "Phase Gate Milestone Risk"}
                  </Text>
                  <Text style={s.gateImpactDesc}>{result.phaseGateImpact.reason}</Text>
                </View>
              </View>
            )}

            {/* Affected Tasks List */}
            {result.affectedTasks.length > 0 && (
              <View style={s.traceList}>
                <Text style={s.traceListTitle}>Downstream Tasks in Dependency Chain</Text>
                {result.affectedTasks.map((t) => (
                  <View key={t.id} style={s.taskRow}>
                    <Ionicons
                      name={t.isCritical ? "flame" : "arrow-forward-outline"}
                      size={14}
                      color={t.isCritical ? colors.danger : colors.textMuted}
                    />
                    <Text style={[s.taskTitle, t.isCritical && { color: colors.danger, fontWeight: "700" }]} numberOfLines={1}>
                      {t.title}
                    </Text>
                    {t.isCritical && <Badge label="CPM" color={colors.danger} />}
                  </View>
                ))}
              </View>
            )}

            {/* Safety policy notice */}
            <Text style={s.safetyNotice}>
              🛡️ Change Impact is an analytical simulation. NexusFlow will never silently rewrite project requirements or deadlines without explicit team approval.
            </Text>
          </View>
        )}
      </ScrollView>
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  subHeader: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  typePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "16",
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  typeLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  inputBlock: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  phaseSelectRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  phasePill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  phasePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "18",
  },
  phasePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "capitalize",
  },
  phasePillTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  simulateBtn: {
    marginTop: spacing.xs,
  },
  resultContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  explanationCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "flex-start",
  },
  explanationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
  },
  metricNum: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: "center",
  },
  gateImpactCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.danger + "12",
    borderWidth: 1,
    borderColor: colors.danger + "44",
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  gateImpactTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
  },
  gateImpactDesc: {
    fontSize: 11,
    color: colors.text,
    marginTop: 1,
  },
  traceList: {
    gap: 6,
    marginTop: spacing.xs,
  },
  traceListTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  taskTitle: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  safetyNotice: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
});
