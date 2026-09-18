/**
 * client/components/workspace/ProjectHealth2Panel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 24: PROJECT HEALTH 2.0 & EARLY WARNING SYSTEM UI
 *
 * 9 Deterministic Health Dimensions + Early Warning Lifecycle:
 * - Schedule, Workload, Dependencies, Risk, Requirements, Process, Capacity, Delivery, Quality
 * - Early Warnings with deduplicated fingerprints
 * - Actions: Acknowledge, Resolve, Dismiss (with authorized reason)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/feedback";
import { Card, Button, Badge, ProgressBar } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

interface HealthDimension {
  key: string;
  name: string;
  score: number;
  status: "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";
  explanation: string;
  signals: any;
}

interface EarlyWarningItem {
  _id: string;
  category: string;
  triggerClass: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  evidence: any;
  recommendedAction: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
}

interface Health2Data {
  overallScore: number;
  grade: string;
  status: "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";
  dimensions: HealthDimension[];
  activeWarnings: EarlyWarningItem[];
}

export default function ProjectHealth2Panel({ projectId }: { projectId: string }) {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Health2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveReason, setResolveReason] = useState("");

  const fetchHealth = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/health-v2`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e: any) {
      toast(e.message || "Failed to load project health", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    fetchHealth();
    const socket = getSocket(token);
    if (socket) {
      socket.on("health.updated", () => fetchHealth());
      socket.on("warning.opened", () => fetchHealth());
      socket.on("warning.acknowledged", () => fetchHealth());
      socket.on("warning.resolved", () => fetchHealth());
      return () => {
        socket.off("health.updated");
        socket.off("warning.opened");
        socket.off("warning.acknowledged");
        socket.off("warning.resolved");
      };
    }
  }, [fetchHealth, token]);

  const handleAcknowledge = async (warningId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/warnings/${warningId}/acknowledge`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast("Warning acknowledged", "success");
        fetchHealth();
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const handleResolve = async (warningId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/warnings/${warningId}/resolve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: resolveReason || "Manually verified resolved" }),
      });
      if (res.ok) {
        toast("Warning marked as resolved", "success");
        setResolvingId(null);
        setResolveReason("");
        fetchHealth();
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const gradeColor =
    data?.grade === "A"
      ? colors.success
      : data?.grade === "B"
      ? colors.info
      : data?.grade === "C"
      ? colors.warning
      : colors.danger;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHealth} />}
    >
      {/* Overview Score Card */}
      <Card style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <View>
            <Text style={styles.healthLabel}>Project Health 2.0</Text>
            <Text style={styles.healthSub}>Deterministic Multi-Dimension Engine</Text>
          </View>
          <View style={styles.gradeBadge}>
            <Text style={[styles.gradeText, { color: gradeColor }]}>{data?.grade || "-"}</Text>
            <Text style={styles.scoreNumber}>{data?.overallScore ?? 0}/100</Text>
          </View>
        </View>
      </Card>

      {/* Active Early Warnings Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Early Warning Radar</Text>
          <Badge
            label={`${data?.activeWarnings?.filter((w) => w.status !== "RESOLVED").length || 0} Active`}
            color={
              (data?.activeWarnings?.filter((w) => w.status !== "RESOLVED").length || 0) > 0
                ? colors.warning
                : colors.success
            }
          />
        </View>
        <Text style={styles.sectionSubtitle}>
          Proactive deterministic hazard detection across deadlines, dependencies, and capacity limits.
        </Text>

        {data?.activeWarnings?.filter((w) => w.status !== "RESOLVED").map((w) => {
          const sevColor =
            w.severity === "CRITICAL"
              ? colors.danger
              : w.severity === "HIGH"
              ? colors.warning
              : colors.info;

          return (
            <Card key={w._id} style={styles.warningCard}>
              <View style={styles.warnHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                  <Badge label={w.severity} color={sevColor} />
                  <Badge label={w.category} color={colors.primary} />
                  {w.status === "ACKNOWLEDGED" && <Badge label="ACKNOWLEDGED" color={colors.info} />}
                </View>
                <Text style={styles.seenText}>Occurrences: {w.occurrenceCount}</Text>
              </View>

              <Text style={styles.warnTitle}>{w.title}</Text>
              <Text style={styles.warnMsg}>{w.message}</Text>

              {/* Recommended Action */}
              <View style={styles.recBox}>
                <Ionicons name="bulb-outline" size={14} color={colors.accentDark} />
                <Text style={styles.recText}>{w.recommendedAction}</Text>
              </View>

              {/* Warning Controls */}
              <View style={styles.warnActions}>
                {w.status === "OPEN" && (
                  <Button
                    title="Acknowledge"
                    variant="secondary"
                    small
                    onPress={() => handleAcknowledge(w._id)}
                  />
                )}
                {resolvingId === w._id ? (
                  <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
                    <TextInput
                      style={styles.resInput}
                      placeholder="Resolution notes..."
                      value={resolveReason}
                      onChangeText={setResolveReason}
                    />
                    <Button
                      title="Confirm"
                      variant="primary"
                      small
                      onPress={() => handleResolve(w._id)}
                    />
                  </View>
                ) : (
                  <Button
                    title="Resolve Warning"
                    variant="primary"
                    small
                    onPress={() => setResolvingId(w._id)}
                  />
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* 9 Deterministic Dimensions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Deterministic Health Dimensions</Text>
        <Text style={styles.sectionSubtitle}>
          Continuous real-time verification across 9 functional pillars.
        </Text>

        <View style={styles.dimensionsList}>
          {data?.dimensions?.map((dim) => {
            const barColor =
              dim.status === "HEALTHY"
                ? colors.success
                : dim.status === "NEEDS_ATTENTION"
                ? colors.warning
                : colors.danger;

            return (
              <Card key={dim.key} style={styles.dimCard}>
                <View style={styles.dimHeader}>
                  <Text style={styles.dimName}>{dim.name}</Text>
                  <Text style={[styles.dimScore, { color: barColor }]}>{dim.score}/100</Text>
                </View>
                <ProgressBar value={dim.score / 100} color={barColor} />
                <Text style={styles.dimExplanation}>{dim.explanation}</Text>
              </Card>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  scoreCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  healthLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  healthSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  gradeBadge: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  gradeText: {
    fontSize: 28,
    fontWeight: "800",
  },
  scoreNumber: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  warningCard: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
  },
  warnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  seenText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  warnTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
  },
  warnMsg: {
    fontSize: 12,
    color: colors.text,
    marginTop: 2,
    lineHeight: 16,
  },
  recBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.accentSoft,
    padding: spacing.xs,
    borderRadius: radius.sm,
    gap: 4,
    marginTop: spacing.xs,
  },
  recText: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  warnActions: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
    justifyContent: "flex-end",
  },
  resInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    fontSize: 11,
    backgroundColor: colors.surface,
  },
  dimensionsList: {
    gap: spacing.xs,
  },
  dimCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.sm,
  },
  dimHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dimName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  dimScore: {
    fontSize: 13,
    fontWeight: "700",
  },
  dimExplanation: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
});
