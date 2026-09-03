import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, SkeletonCard, EmptyState, ProgressBar } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

const API = API_BASE_URL;

interface HealthDimension {
  score: number;
  description?: string;
}

interface TeamHealthData {
  _id?: string;
  score: number;
  grade: string;
  dimensions: {
    taskCompletion?: HealthDimension;
    workloadBalance?: HealthDimension;
    blockedTasks?: HealthDimension;
    skillCoverage?: HealthDimension;
    sprintProgress?: HealthDimension;
    githubActivity?: HealthDimension;
    [key: string]: HealthDimension | undefined;
  };
  strengths: string[];
  warnings: string[];
  advisories?: string[];
  updatedAt?: string;
}

export default function TeamHealthPanel({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId?: string;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const [health, setHealth] = useState<TeamHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetId = projectId || teamId;

  const fetchHealth = useCallback(async (isSilent = false) => {
    if (!targetId || !token) {
      setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/team-health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.health || null);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}: Failed to load health data`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load team health.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetId, token]);

  const handleRecalculate = async () => {
    if (!targetId || !token) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/team-health/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.health || null);
        toast("Team health recalculated from live database state", "success");
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Recalculation failed");
      }
    } catch (e: any) {
      toast(e.message || "Unable to recalculate team health", "error");
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Real-time project & team health synchronization
  useEffect(() => {
    if (!targetId || !token) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId: targetId });

    const handleHealthUpdate = (payload: any) => {
      if (payload?.health) {
        setHealth(payload.health);
      } else {
        fetchHealth(true);
      }
    };

    socket.on("project:health:updated", handleHealthUpdate);
    socket.on("reconnect", () => fetchHealth(true));

    return () => {
      socket.off("project:health:updated", handleHealthUpdate);
      socket.off("reconnect", () => {});
    };
  }, [targetId, token, fetchHealth]);

  if (loading && !health) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (error && !health) {
    return (
      <View style={s.container}>
        <EmptyState
          icon="alert-circle-outline"
          title="Unable to Calculate Team Health"
          message={error}
          actionLabel="Retry"
          actionIcon="refresh"
          onAction={() => fetchHealth(false)}
        />
      </View>
    );
  }

  const score = health?.score ?? 0;
  const grade = health?.grade ?? (score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F");
  const gradeColor =
    score >= 80 ? colors.success : score >= 60 ? colors.accent : score >= 40 ? colors.warning : colors.danger;

  const dimensionKeys = [
    { key: "taskCompletion", label: "Task Completion", icon: "checkmark-circle" },
    { key: "workloadBalance", label: "Workload Balance", icon: "people" },
    { key: "blockedTasks", label: "Blocked Tasks & Dependencies", icon: "git-merge" },
    { key: "skillCoverage", label: "Skill Coverage", icon: "ribbon" },
    { key: "sprintProgress", label: "Sprint Delivery Pace", icon: "rocket" },
    { key: "githubActivity", label: "GitHub Integration Activity", icon: "logo-github" },
  ];

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRecalculate} tintColor={colors.primary} />}
    >
      {/* Top Health Hero Card */}
      <Card style={s.heroCard}>
        <View style={s.heroRow}>
          <View style={[s.scoreBadge, { borderColor: gradeColor, backgroundColor: colors.surfaceAlt }]}>
            <Text style={[s.scoreText, { color: gradeColor }]}>{score}</Text>
            <Text style={s.scoreMax}>/100</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Text style={font.h2}>Team Health Score</Text>
              <Badge label={`Grade ${grade}`} color={gradeColor} />
            </View>
            <Text style={[font.small, { color: colors.textMuted, marginTop: 4, lineHeight: 18 }]}>
              Real-time composite score based on task completions, member load balance, blockers, and skill coverage.
            </Text>
            {!!health?.updatedAt && (
              <Text style={[font.caption, { color: colors.textFaint, marginTop: 4 }]}>
                Last recalculated: {new Date(health.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
          </View>
          <Button
            title={refreshing ? "Calculating..." : "Recalculate"}
            icon="refresh"
            variant="primary"
            small
            onPress={handleRecalculate}
            disabled={refreshing}
          />
        </View>
      </Card>

      {/* Dimensions Breakdown */}
      {health?.dimensions && (
        <Card style={s.sectionCard}>
          <View style={s.sectionHeaderRow}>
            <Ionicons name="stats-chart" size={18} color={colors.primary} />
            <Text style={font.h3}>Health Dimensions Breakdown</Text>
          </View>
          <View style={s.dimGrid}>
            {dimensionKeys.map(({ key, label, icon }) => {
              const dim = health.dimensions?.[key];
              if (!dim) return null;
              const dimScore = dim.score ?? 0;
              const dimColor =
                dimScore >= 75 ? colors.success : dimScore >= 50 ? colors.warning : colors.danger;
              return (
                <View key={key} style={s.dimItem}>
                  <View style={s.dimHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={icon as any} size={15} color={colors.textMuted} />
                      <Text style={[font.body, { fontWeight: "600" }]}>{label}</Text>
                    </View>
                    <Text style={[font.body, { fontWeight: "800", color: dimColor }]}>{dimScore}%</Text>
                  </View>
                  <ProgressBar value={dimScore / 100} color={dimColor} height={7} />
                  {!!dim.description && (
                    <Text style={[font.small, { color: colors.textMuted, marginTop: 4, lineHeight: 17 }]}>
                      {dim.description}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* Strengths & Advisories Grid */}
      <View style={s.advisoryRow}>
        {/* Strengths Card */}
        <Card style={s.halfCard}>
          <View style={s.cardHeader}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[font.h3, { color: colors.text }]}>Strengths</Text>
          </View>
          {(!health?.strengths || health.strengths.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              {score > 0 ? "Execution underway. Deliver tasks on schedule to build team strengths." : "No completed tasks recorded yet."}
            </Text>
          ) : (
            health.strengths.map((str, i) => (
              <View key={i} style={s.bulletRow}>
                <Ionicons name="checkmark" size={15} color={colors.success} style={{ marginTop: 2 }} />
                <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{str}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Warnings & Advisories Card */}
        <Card style={s.halfCard}>
          <View style={s.cardHeader}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={[font.h3, { color: colors.text }]}>Advisories & Alerts</Text>
          </View>
          {(!health?.warnings || health.warnings.length === 0) && (!health?.advisories || health.advisories.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>
              No critical risks or workload bottlenecks detected.
            </Text>
          ) : (
            <>
              {(health?.warnings || []).map((w, i) => (
                <View key={`w-${i}`} style={s.bulletRow}>
                  <Ionicons name="alert-circle" size={15} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.danger, fontWeight: "600", lineHeight: 18 }]}>
                    {w}
                  </Text>
                </View>
              ))}
              {(health?.advisories || []).map((a, i) => (
                <View key={`a-${i}`} style={s.bulletRow}>
                  <Ionicons name="information-circle" size={15} color={colors.info} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{a}</Text>
                </View>
              ))}
            </>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 40,
  },
  heroCard: {
    padding: spacing.lg,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  scoreBadge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3.5,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 30,
    fontWeight: "800",
  },
  scoreMax: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -4,
    fontWeight: "600",
  },
  sectionCard: {
    padding: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dimGrid: {
    gap: spacing.md,
  },
  dimItem: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  advisoryRow: {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
  },
  halfCard: {
    flex: 1,
    minWidth: 280,
    padding: spacing.lg,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: "flex-start",
  },
});
