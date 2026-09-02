import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
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
  label?: string;
  description?: string;
}

interface TeamHealthData {
  score: number;
  grade: string;
  dimensions: {
    workloadBalance?: HealthDimension;
    taskCompletion?: HealthDimension;
    sprintProgress?: HealthDimension;
    skillCoverage?: HealthDimension;
    contribution?: HealthDimension;
    blockedTasks?: HealthDimension;
    githubActivity?: HealthDimension;
  };
  strengths: string[];
  warnings: string[];
  advisories?: string[];
  generatedAt?: string;
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

  const fetchHealth = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/team-health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.health || null);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, token]);

  const handleRefresh = async () => {
    if (!projectId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/team-health/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.health || null);
        toast("Team health score updated", "success");
      }
    } catch (e: any) {
      toast(e.message || "Failed to update health", "error");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Real-time project health synchronization
  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId });

    const handleHealthUpdate = (payload: any) => {
      if (payload.health) {
        setHealth(payload.health);
      } else {
        fetchHealth();
      }
    };

    socket.on("project:health:updated", handleHealthUpdate);
    return () => {
      socket.off("project:health:updated", handleHealthUpdate);
    };
  }, [projectId, token, fetchHealth]);

  if (loading) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (!projectId) {
    return (
      <View style={s.container}>
        <EmptyState
          icon="heart-outline"
          title="No Project Selected"
          message="Team health is calculated across active project tasks, workloads, and contributor metrics."
        />
      </View>
    );
  }

  const score = health?.score ?? 0;
  const grade = health?.grade ?? "C";
  const gradeColor =
    score >= 80 ? colors.success : score >= 60 ? colors.accent : score >= 40 ? colors.warning : colors.danger;

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
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
            <Text style={[font.small, { color: colors.textMuted, marginTop: 2 }]}>
              Multidimensional analysis of team balance, blockers, task completion & contributions.
            </Text>
          </View>
          <Button
            title={refreshing ? "Updating..." : "Recalculate"}
            icon="refresh"
            variant="secondary"
            small
            onPress={handleRefresh}
            disabled={refreshing}
          />
        </View>
      </Card>

      {/* Dimensions Breakdown */}
      {health?.dimensions && (
        <Card style={s.sectionCard}>
          <Text style={[font.h3, { marginBottom: spacing.md }]}>Health Dimensions</Text>
          <View style={s.dimGrid}>
            {Object.entries(health.dimensions).map(([key, dim]) => {
              if (!dim) return null;
              const dimColor =
                dim.score >= 75 ? colors.success : dim.score >= 50 ? colors.warning : colors.danger;
              const title = key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase());
              return (
                <View key={key} style={s.dimItem}>
                  <View style={s.dimHeader}>
                    <Text style={font.body}>{title}</Text>
                    <Text style={[font.body, { fontWeight: "700", color: dimColor }]}>{dim.score}%</Text>
                  </View>
                  <ProgressBar value={dim.score / 100} color={dimColor} height={6} />
                  {!!dim.description && (
                    <Text style={[font.caption, { color: colors.textMuted, marginTop: 4 }]}>{dim.description}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* Strengths & Warnings */}
      <View style={s.advisoryRow}>
        {/* Strengths */}
        <Card style={s.halfCard}>
          <View style={s.cardHeader}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[font.h3, { color: colors.text }]}>Strengths</Text>
          </View>
          {(!health?.strengths || health.strengths.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>No major highlights recorded yet.</Text>
          ) : (
            health.strengths.map((str, i) => (
              <View key={i} style={s.bulletRow}>
                <Ionicons name="arrow-forward" size={14} color={colors.success} style={{ marginTop: 2 }} />
                <Text style={[font.small, { flex: 1, color: colors.text }]}>{str}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Warnings & Advisories */}
        <Card style={s.halfCard}>
          <View style={s.cardHeader}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={[font.h3, { color: colors.text }]}>Advisories</Text>
          </View>
          {(!health?.warnings || health.warnings.length === 0) && (!health?.advisories || health.advisories.length === 0) ? (
            <Text style={[font.small, { color: colors.textMuted }]}>No active warnings or risks detected.</Text>
          ) : (
            <>
              {(health?.warnings || []).map((w, i) => (
                <View key={`w-${i}`} style={s.bulletRow}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>{w}</Text>
                </View>
              ))}
              {(health?.advisories || []).map((a, i) => (
                <View key={`a-${i}`} style={s.bulletRow}>
                  <Ionicons name="information-circle" size={14} color={colors.info} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>{a}</Text>
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
  },
  heroCard: {
    padding: spacing.lg,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 28,
    fontWeight: "700",
  },
  scoreMax: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: -4,
  },
  sectionCard: {
    padding: spacing.lg,
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
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    gap: 6,
  },
  dimHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  advisoryRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  halfCard: {
    flex: 1,
    padding: spacing.lg,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    alignItems: "flex-start",
  },
});
