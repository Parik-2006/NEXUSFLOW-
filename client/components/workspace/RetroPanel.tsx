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

interface RetrospectiveItem {
  _id: string;
  sprintName: string;
  period?: { start?: string; end?: string };
  taskStats: {
    total: number;
    completed: number;
    incomplete: number;
    blocked: number;
    completionRate: number;
  };
  memberContributions?: Array<{
    userId?: string;
    name: string;
    tasksAssigned: number;
    tasksCompleted: number;
  }>;
  analysis: {
    wentWell: string[];
    wentPoorly: string[];
    bottlenecks: string[];
    risks: string[];
    recommendations: string[];
    suggestedImprovements: string[];
    summary: string;
  };
  generatedBy: "ai" | "deterministic";
  generatedAt?: string;
  acknowledgedBy?: string[];
}

export default function RetroPanel({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId?: string;
}) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [retros, setRetros] = useState<RetrospectiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchRetros = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/retrospectives`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRetros(data.retrospectives || []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  const handleGenerate = async () => {
    if (!projectId) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/retrospectives`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sprintName: `Sprint Retrospective #${retros.length + 1}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.retrospective) {
          setRetros((prev) => [data.retrospective, ...prev]);
          toast("Sprint retrospective generated", "success");
        }
      }
    } catch (e: any) {
      toast(e.message || "Failed to generate retrospective", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleAcknowledge = async (retroId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/retrospectives/${retroId}/acknowledge`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRetros((prev) => prev.map((r) => (r._id === retroId ? data.retrospective : r)));
        toast("Retrospective acknowledged", "success");
      }
    } catch (e: any) {
      toast(e.message || "Failed to acknowledge", "error");
    }
  };

  useEffect(() => {
    fetchRetros();
  }, [fetchRetros]);

  // Real-time retrospective updates
  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId });

    const handleRetroUpdate = (payload: any) => {
      if (payload.retrospective) {
        setRetros((prev) => [payload.retrospective, ...prev.filter((r) => r._id !== payload.retrospective._id)]);
      } else {
        fetchRetros();
      }
    };

    socket.on("project:retrospective:updated", handleRetroUpdate);
    return () => {
      socket.off("project:retrospective:updated", handleRetroUpdate);
    };
  }, [projectId, token, fetchRetros]);

  if (loading) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  const latestRetro = retros[0] || null;
  const currentUserId = user?.id || user?._id;
  const isAcknowledged = latestRetro?.acknowledgedBy?.some((uid) => uid.toString() === currentUserId?.toString());

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={generating} onRefresh={handleGenerate} tintColor={colors.primary} />}
    >
      {/* Header action bar */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={font.h2}>AI Sprint Retrospective</Text>
          <Text style={[font.small, { color: colors.textMuted }]}>
            End-of-sprint analysis analyzing completion velocity, bottlenecks, and recommendations.
          </Text>
        </View>
        <Button
          title={generating ? "Analyzing..." : "Generate Retrospective"}
          icon="sparkles"
          variant="primary"
          onPress={handleGenerate}
          disabled={generating}
        />
      </View>

      {!latestRetro ? (
        <EmptyState
          icon="clipboard-outline"
          title="No Retrospectives Generated"
          message="Generate an AI retrospective at the conclusion of a sprint to evaluate execution health."
        />
      ) : (
        <>
          {/* Latest Retro Stats Card */}
          <Card style={s.card}>
            <View style={s.retroHeader}>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{latestRetro.sprintName}</Text>
                {!!latestRetro.generatedAt && (
                  <Text style={[font.caption, { color: colors.textMuted }]}>
                    Generated {new Date(latestRetro.generatedAt).toLocaleDateString()} via {latestRetro.generatedBy} engine
                  </Text>
                )}
              </View>
              <Badge
                label={`${latestRetro.taskStats?.completionRate || 0}% Completion`}
                color={(latestRetro.taskStats?.completionRate || 0) >= 70 ? colors.success : colors.warning}
              />
            </View>

            <ProgressBar
              value={(latestRetro.taskStats?.completionRate || 0) / 100}
              color={(latestRetro.taskStats?.completionRate || 0) >= 70 ? colors.success : colors.warning}
              height={8}
            />

            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.primary }]}>{latestRetro.taskStats?.total || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted }]}>Planned</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.success }]}>{latestRetro.taskStats?.completed || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted }]}>Done</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.warning }]}>{latestRetro.taskStats?.incomplete || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted }]}>Incomplete</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.danger }]}>{latestRetro.taskStats?.blocked || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted }]}>Blocked</Text>
              </View>
            </View>
          </Card>

          {/* Narrative Summary */}
          {!!latestRetro.analysis?.summary && (
            <Card style={s.card}>
              <Text style={font.h3}>Sprint Summary</Text>
              <Text style={[font.small, { color: colors.text, marginTop: spacing.xs }]}>
                {latestRetro.analysis.summary}
              </Text>
            </Card>
          )}

          {/* Detailed Breakdown Columns */}
          <View style={s.twoCol}>
            {/* What Went Well */}
            <Card style={s.halfCard}>
              <View style={s.sectionHeader}>
                <Ionicons name="thumbs-up" size={18} color={colors.success} />
                <Text style={font.h3}>What Went Well</Text>
              </View>
              {(latestRetro.analysis?.wentWell || []).map((item, i) => (
                <View key={i} style={s.bulletRow}>
                  <Ionicons name="checkmark" size={14} color={colors.success} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>{item}</Text>
                </View>
              ))}
            </Card>

            {/* What Went Poorly */}
            <Card style={s.halfCard}>
              <View style={s.sectionHeader}>
                <Ionicons name="thumbs-down" size={18} color={colors.danger} />
                <Text style={font.h3}>What Went Poorly</Text>
              </View>
              {(latestRetro.analysis?.wentPoorly || []).map((item, i) => (
                <View key={i} style={s.bulletRow}>
                  <Ionicons name="close" size={14} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>{item}</Text>
                </View>
              ))}
            </Card>
          </View>

          {/* Recommendations & Improvements */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="bulb" size={18} color={colors.accentDark} />
              <Text style={font.h3}>Recommended Improvements for Next Sprint</Text>
            </View>
            {(latestRetro.analysis?.suggestedImprovements || latestRetro.analysis?.recommendations || []).map(
              (item, i) => (
                <View key={i} style={s.bulletRow}>
                  <Ionicons name="arrow-forward" size={14} color={colors.accentDark} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>{item}</Text>
                </View>
              )
            )}

            {!isAcknowledged && (
              <View style={{ marginTop: spacing.md, alignItems: "flex-end" }}>
                <Button
                  title="Acknowledge Retrospective"
                  variant="secondary"
                  small
                  icon="checkmark-done"
                  onPress={() => handleAcknowledge(latestRetro._id)}
                />
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  retroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
  },
  halfCard: {
    flex: 1,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    alignItems: "flex-start",
  },
});
