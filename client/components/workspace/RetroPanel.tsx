import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, SkeletonCard, EmptyState, ProgressBar, Avatar } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

const API = API_BASE_URL;

interface MemberContribution {
  userId?: string;
  userName?: string;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksBlocked: number;
  totalHoursLogged?: number;
}

interface RetrospectiveItem {
  _id: string;
  sprintName: string;
  period?: { start?: string; end?: string };
  taskStats: {
    total: number;
    completed: number;
    inProgress?: number;
    incomplete?: number;
    blocked: number;
    completionRate: number;
  };
  memberContributions?: MemberContribution[];
  analysis: {
    wentWell: string[];
    wentPoorly: string[];
    bottlenecks: string[];
    risks?: string[];
    recommendations: string[];
    suggestedImprovements?: string[];
    summary: string;
  };
  generatedBy: "ai" | "deterministic";
  createdAt?: string;
  updatedAt?: string;
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
  const [selectedRetroId, setSelectedRetroId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetId = projectId || teamId;
  const currentUserId = (user?._id || user?.id)?.toString();

  const fetchRetros = useCallback(async (isSilent = false) => {
    if (!targetId || !token) {
      setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/retrospectives`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.retrospectives || [];
        setRetros(list);
        if (list.length > 0 && !selectedRetroId) {
          setSelectedRetroId(list[0]._id);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}: Failed to load retrospectives`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load retrospectives.");
    } finally {
      setLoading(false);
    }
  }, [targetId, token, selectedRetroId]);

  const handleGenerate = async () => {
    if (!targetId || !token) return;
    setGenerating(true);
    setError(null);
    try {
      const sprintNumber = retros.length + 1;
      const res = await fetch(`${API}/api/projects/${targetId}/retrospectives`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sprintName: `Sprint #${sprintNumber} Retrospective`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.retrospective) {
          setRetros((prev) => [data.retrospective, ...prev.filter((r) => r._id !== data.retrospective._id)]);
          setSelectedRetroId(data.retrospective._id);
          toast("Sprint retrospective generated successfully", "success");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Generation failed");
      }
    } catch (e: any) {
      toast(e.message || "Failed to generate retrospective", "error");
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAcknowledge = async (retroId: string) => {
    if (!targetId || !token) return;
    try {
      const res = await fetch(`${API}/api/projects/${targetId}/retrospectives/${retroId}/acknowledge`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRetros((prev) => prev.map((r) => (r._id === retroId ? data.retrospective : r)));
        toast("Retrospective acknowledged by team member", "success");
      }
    } catch (e: any) {
      toast(e.message || "Failed to acknowledge retrospective", "error");
    }
  };

  useEffect(() => {
    fetchRetros();
  }, [fetchRetros]);

  // Real-time retrospective updates
  useEffect(() => {
    if (!targetId || !token) return;
    const socket = getSocket(token);
    socket.emit("room:join:project", { projectId: targetId });

    const handleRetroUpdate = (payload: any) => {
      if (payload?.retrospective) {
        setRetros((prev) => [payload.retrospective, ...prev.filter((r) => r._id !== payload.retrospective._id)]);
        setSelectedRetroId((cur) => cur || payload.retrospective._id);
      } else {
        fetchRetros(true);
      }
    };

    socket.on("project:retrospective:updated", handleRetroUpdate);
    socket.on("reconnect", () => fetchRetros(true));

    return () => {
      socket.off("project:retrospective:updated", handleRetroUpdate);
      socket.off("reconnect", () => {});
    };
  }, [targetId, token, fetchRetros]);

  if (loading && retros.length === 0 && !error) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (error && retros.length === 0) {
    return (
      <View style={s.container}>
        <EmptyState
          icon="alert-circle-outline"
          title="Unable to Load Retrospectives"
          message={error}
          actionLabel="Retry"
          actionIcon="refresh"
          onAction={() => fetchRetros(false)}
        />
      </View>
    );
  }

  const activeRetro = retros.find((r) => r._id === selectedRetroId) || retros[0] || null;
  const isAcknowledged = activeRetro?.acknowledgedBy?.some((uid) => uid.toString() === currentUserId);
  const completionRate = activeRetro?.taskStats?.completionRate ?? 0;
  const compColor = completionRate >= 70 ? colors.success : completionRate >= 45 ? colors.warning : colors.danger;

  return (
    <ScrollView
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={generating} onRefresh={handleGenerate} tintColor={colors.primary} />}
    >
      {/* Header Action Bar */}
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text style={font.h2}>AI Sprint Retrospective</Text>
          <Text style={[font.small, { color: colors.textMuted, marginTop: 4, lineHeight: 18 }]}>
            Automated sprint retrospective analyzing velocity, bottlenecks, team contributions, and actionable recommendations.
          </Text>
        </View>
        <Button
          title={generating ? "Analyzing Sprint..." : "Generate Retrospective"}
          icon="sparkles"
          variant="primary"
          onPress={handleGenerate}
          disabled={generating}
        />
      </View>

      {!activeRetro ? (
        <Card style={s.emptyCard}>
          <Ionicons name="clipboard-outline" size={48} color={colors.primary} />
          <Text style={[font.h3, { marginTop: spacing.sm, textAlign: "center" }]}>No Retrospectives Generated Yet</Text>
          <Text style={[font.small, { color: colors.textMuted, textAlign: "center", maxWidth: 440, marginTop: 4, lineHeight: 18 }]}>
            Generate an end-of-sprint analysis to evaluate task completion velocity, identify blockers, and review recommendations for upcoming sprints.
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <Button title="Generate First Retrospective" icon="sparkles" onPress={handleGenerate} disabled={generating} />
          </View>
        </Card>
      ) : (
        <>
          {/* History Pill Selector (if multiple retros exist) */}
          {retros.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.historyRow}>
              {retros.map((r, idx) => {
                const isSel = r._id === activeRetro._id;
                return (
                  <Pressable
                    key={r._id}
                    onPress={() => setSelectedRetroId(r._id)}
                    style={[s.historyPill, isSel && s.historyPillActive]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={isSel ? colors.primary : colors.textMuted} />
                    <Text style={[font.small, isSel ? { fontWeight: "700", color: colors.primary } : { color: colors.text }]}>
                      {r.sprintName || `Sprint #${retros.length - idx}`}
                    </Text>
                    <Badge
                      label={`${r.taskStats?.completionRate || 0}%`}
                      color={(r.taskStats?.completionRate || 0) >= 70 ? colors.success : colors.warning}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Active Retro Stats Card */}
          <Card style={s.card}>
            <View style={s.retroHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                  <Text style={font.h2}>{activeRetro.sprintName}</Text>
                  <Badge label={`${completionRate}% Completed`} color={compColor} />
                  <Badge label={`Engine: ${activeRetro.generatedBy || "deterministic"}`} color={colors.primary} bg={colors.primarySoft} />
                </View>
                {!!activeRetro.createdAt && (
                  <Text style={[font.caption, { color: colors.textMuted, marginTop: 4 }]}>
                    Generated {new Date(activeRetro.createdAt).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar value={completionRate / 100} color={compColor} height={8} />
            </View>

            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.primary }]}>{activeRetro.taskStats?.total || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted, fontWeight: "600" }]}>Total Tasks</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.success }]}>{activeRetro.taskStats?.completed || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted, fontWeight: "600" }]}>Completed</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.warning }]}>
                  {activeRetro.taskStats?.inProgress ?? ((activeRetro.taskStats?.total || 0) - (activeRetro.taskStats?.completed || 0))}
                </Text>
                <Text style={[font.caption, { color: colors.textMuted, fontWeight: "600" }]}>In Progress / Open</Text>
              </View>
              <View style={s.statBox}>
                <Text style={[font.h2, { color: colors.danger }]}>{activeRetro.taskStats?.blocked || 0}</Text>
                <Text style={[font.caption, { color: colors.textMuted, fontWeight: "600" }]}>Blocked</Text>
              </View>
            </View>
          </Card>

          {/* Narrative Summary */}
          {!!activeRetro.analysis?.summary && (
            <Card style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={font.h3}>Sprint Summary</Text>
              </View>
              <Text style={[font.body, { color: colors.text, marginTop: spacing.xs, lineHeight: 22 }]}>
                {activeRetro.analysis.summary}
              </Text>
            </Card>
          )}

          {/* What Went Well & What Could Be Improved */}
          <View style={s.twoCol}>
            {/* What Went Well */}
            <Card style={s.halfCard}>
              <View style={s.sectionHeader}>
                <Ionicons name="thumbs-up" size={18} color={colors.success} />
                <Text style={[font.h3, { color: colors.text }]}>What Went Well</Text>
              </View>
              {(activeRetro.analysis?.wentWell || []).length === 0 ? (
                <Text style={[font.small, { color: colors.textMuted }]}>No positive highlights logged for this sprint.</Text>
              ) : (
                (activeRetro.analysis?.wentWell || []).map((item, i) => (
                  <View key={i} style={s.bulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginTop: 2 }} />
                    <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{item}</Text>
                  </View>
                ))
              )}
            </Card>

            {/* What Could Be Improved */}
            <Card style={s.halfCard}>
              <View style={s.sectionHeader}>
                <Ionicons name="thumbs-down" size={18} color={colors.danger} />
                <Text style={[font.h3, { color: colors.text }]}>What Could Be Improved</Text>
              </View>
              {(activeRetro.analysis?.wentPoorly || []).length === 0 ? (
                <Text style={[font.small, { color: colors.textMuted }]}>No major delivery impediments logged.</Text>
              ) : (
                (activeRetro.analysis?.wentPoorly || []).map((item, i) => (
                  <View key={i} style={s.bulletRow}>
                    <Ionicons name="alert-circle" size={16} color={colors.danger} style={{ marginTop: 2 }} />
                    <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{item}</Text>
                  </View>
                ))
              )}
            </Card>
          </View>

          {/* Bottlenecks (if any) */}
          {!!activeRetro.analysis?.bottlenecks && activeRetro.analysis.bottlenecks.length > 0 && (
            <Card style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="git-merge" size={18} color={colors.warning} />
                <Text style={font.h3}>Identified Bottlenecks</Text>
              </View>
              {activeRetro.analysis.bottlenecks.map((item, i) => (
                <View key={i} style={s.bulletRow}>
                  <Ionicons name="warning" size={15} color={colors.warning} style={{ marginTop: 2 }} />
                  <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{item}</Text>
                </View>
              ))}
            </Card>
          )}

          {/* Recommendations for Next Sprint */}
          <Card style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="bulb" size={18} color={colors.accentDark} />
              <Text style={font.h3}>Actionable Recommendations for Next Sprint</Text>
            </View>
            {(
              activeRetro.analysis?.recommendations ||
              activeRetro.analysis?.suggestedImprovements ||
              []
            ).map((item, i) => (
              <View key={i} style={s.bulletRow}>
                <Ionicons name="arrow-forward-circle" size={16} color={colors.accentDark} style={{ marginTop: 2 }} />
                <Text style={[font.small, { flex: 1, color: colors.text, lineHeight: 18 }]}>{item}</Text>
              </View>
            ))}

            <View style={{ marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
              <Text style={[font.caption, { color: colors.textMuted }]}>
                {isAcknowledged ? "Acknowledged by you" : "Review recommendations with your team"}
              </Text>
              <Button
                title={isAcknowledged ? "Acknowledged" : "Acknowledge Retrospective"}
                variant={isAcknowledged ? "ghost" : "secondary"}
                small
                icon="checkmark-done"
                onPress={() => handleAcknowledge(activeRetro._id)}
                disabled={isAcknowledged}
              />
            </View>
          </Card>

          {/* Team Observations / Contributions */}
          {!!activeRetro.memberContributions && activeRetro.memberContributions.length > 0 && (
            <Card style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="people" size={18} color={colors.primary} />
                <Text style={font.h3}>Team Member Contributions</Text>
              </View>
              <View style={s.contribTable}>
                {activeRetro.memberContributions.map((m, i) => (
                  <View key={m.userId || i} style={s.contribRow}>
                    <Avatar name={m.userName || "Member"} size={32} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[font.body, { fontWeight: "700" }]}>{m.userName || "Member"}</Text>
                      <Text style={[font.caption, { color: colors.textMuted }]}>
                        {m.tasksCompleted} completed · {m.tasksInProgress} in progress {m.tasksBlocked > 0 ? `· ${m.tasksBlocked} blocked` : ""}
                      </Text>
                    </View>
                    <Badge label={`${m.tasksCompleted} Done`} color={m.tasksCompleted > 0 ? colors.success : colors.textMuted} />
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
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
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  statBox: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyRow: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  historyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyPillActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  twoCol: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  halfCard: {
    flex: 1,
    minWidth: 280,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: "flex-start",
  },
  contribTable: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  contribRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emptyCard: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
