/**
 * client/components/workspace/UnifiedProjectHealthPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — UNIFIED PROJECT HEALTH EXPERIENCE
 *
 * Merges Health 2.0 (9 dimensions + early warnings) and Team Health (workload
 * distribution, capacity, blocked work, skill coverage, execution pace) into
 * a single coherent, authoritative project health dashboard.
 *
 * Hierarchy:
 * - Section A: Overall Project Health (one score 0-100, grade, status, summary, recalculate)
 * - Section B: Critical Warnings and Recommended Actions (deduplicated, advisory)
 * - Section C: Project Health Dimensions (deterministic scorecards & progress bars)
 * - Section D: Team Execution Health (workload by member, blocked tasks, skills, pace, github)
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
  signals?: any;
}

interface WarningItem {
  _id: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  evidence?: any;
  recommendedAction?: string;
  status?: string;
}

interface MemberLoad {
  userId: string;
  name: string;
  avatar?: string | null;
  activeCount: number;
  assignedHours: number;
  capacity: number;
  overloaded: boolean;
}

interface TeamExecutionData {
  methodology: string;
  taskCompletion: {
    total: number;
    done: number;
    inProgress: number;
    todo: number;
    rate: number;
  };
  workloadAndCapacity: {
    totalActiveHours: number;
    totalTeamCapacity: number;
    utilizationRate: number;
    members: MemberLoad[];
  };
  blockedTasks: {
    count: number;
    tasks: Array<{ id: string; title: string; phase?: string; dependencies?: any[] }>;
  };
  skillCoverage: {
    requiredCount: number;
    coveredCount: number;
    missingCount: number;
    missingSkills: string[];
    percentage: number;
  };
  deliveryPace: {
    label: string;
    progressLabel: string;
    currentPhase?: string | null;
    phaseProgress: number;
  };
  githubActivity: {
    connected: boolean;
    repo?: string;
    recentCommits?: number;
    lastCommitAt?: string | null;
    score?: number | null;
    message?: string;
  };
}

interface UnifiedHealthData {
  projectId?: string;
  teamId?: string;
  overallScore: number;
  grade: string;
  status: "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";
  methodology: string;
  calculatedAt: string;
  summary: string;
  criticalFactors: string[];
  warnings: WarningItem[];
  dimensions: HealthDimension[];
  teamExecution: TeamExecutionData;
  terms?: any;
}

const STATUS_COLOR_MAP = {
  HEALTHY: colors.success,
  NEEDS_ATTENTION: colors.warning,
  CRITICAL: colors.danger,
};

const SEVERITY_COLOR_MAP = {
  CRITICAL: "#DC2626",
  HIGH: "#EA580C",
  MEDIUM: "#D97706",
  LOW: "#2563EB",
};

export default function UnifiedProjectHealthPanel({
  projectId,
  teamId,
  onNavigateTab,
}: {
  projectId?: string;
  teamId?: string;
  onNavigateTab?: (tab: string) => void;
}) {
  const { token } = useAuth();
  const toast = useToast();
  const targetId = projectId || teamId;

  const [data, setData] = useState<UnifiedHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState<Set<string>>(new Set());

  const fetchHealth = useCallback(
    async (isSilent = false) => {
      if (!targetId || !token) return;
      if (!isSilent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/projects/${targetId}/health`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          // Fallback to team-health if health route is legacy
          const fallback = await fetch(`${API_BASE_URL}/api/projects/${targetId}/health-v2`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fallback.ok) {
            const fJson = await fallback.json();
            setData(fJson);
          } else {
            throw new Error(`Failed to load project health (status ${res.status})`);
          }
        }
      } catch (e: any) {
        setError(e.message || "Failed to load project health.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [targetId, token]
  );

  const handleRecalculate = async () => {
    if (!targetId || !token) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${targetId}/health/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        toast("Project health recalculated from live persisted database state", "success");
      } else {
        throw new Error("Recalculation failed");
      }
    } catch (e: any) {
      toast(e.message || "Unable to recalculate health", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcknowledge = (wId: string) => {
    setAcknowledgedWarnings((prev) => new Set(prev).add(wId));
    toast("Advisory warning acknowledged", "success");
  };

  useEffect(() => {
    fetchHealth();
    const socket = getSocket(token);
    if (socket) {
      const onHealthUpdate = (payload?: any) => {
        if (payload?.overallScore !== undefined) {
          setData(payload);
        } else {
          fetchHealth(true);
        }
      };
      socket.on("project:health:updated", onHealthUpdate);
      socket.on("waterfall:phase:updated", () => fetchHealth(true));
      socket.on("task:updated", () => fetchHealth(true));
      socket.on("task:created", () => fetchHealth(true));
      socket.on("task:deleted", () => fetchHealth(true));
      return () => {
        socket.off("project:health:updated", onHealthUpdate);
        socket.off("waterfall:phase:updated");
        socket.off("task:updated");
        socket.off("task:created");
        socket.off("task:deleted");
      };
    }
  }, [fetchHealth, token]);

  if (loading && !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          Evaluating deterministic project health...
        </Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
        <Text style={[font.h3, { marginTop: spacing.sm, color: colors.danger }]}>Health Evaluation Failed</Text>
        <Text style={[font.body, { color: colors.textMuted, textAlign: "center", marginHorizontal: spacing.lg, marginVertical: spacing.sm }]}>
          {error}
        </Text>
        <Button title="Try Again" onPress={() => fetchHealth()} variant="primary" />
      </View>
    );
  }

  if (!data) return null;

  const scoreColor = STATUS_COLOR_MAP[data.status] || colors.primary;
  const gradeColor =
    data.grade === "A"
      ? colors.success
      : data.grade === "B"
      ? "#2563EB"
      : data.grade === "C"
      ? colors.warning
      : colors.danger;

  const visibleWarnings = data.warnings.filter((w) => !acknowledgedWarnings.has(w._id));

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRecalculate} tintColor={colors.primary} />}
    >
      {/* ====================================================================== */}
      {/* SECTION A — OVERALL PROJECT HEALTH                                     */}
      {/* ====================================================================== */}
      <View style={s.overallCard}>
        <View style={s.overallHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Text style={s.overallTitle}>Project Health</Text>
              <View style={[s.methodologyBadge, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="git-network-outline" size={11} color={colors.primary} />
                <Text style={s.methodologyTxt}>{data.methodology}</Text>
              </View>
            </View>
            <Text style={s.overallSub}>
              Canonical deterministic health score based on active tasks, workload, and phase gates.
            </Text>
          </View>

          <Pressable
            style={[s.recalcBtn, refreshing && { opacity: 0.7 }]}
            onPress={handleRecalculate}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="sync-outline" size={15} color={colors.primary} />
            )}
            <Text style={s.recalcTxt}>Recalculate</Text>
          </Pressable>
        </View>

        {/* Score & Gauge Section */}
        <View style={s.scoreRow}>
          <View style={[s.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[s.scoreNum, { color: scoreColor }]}>{data.overallScore}</Text>
            <Text style={s.scoreDenom}>/100</Text>
          </View>

          <View style={s.scoreMeta}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[s.gradePill, { backgroundColor: gradeColor + "18", borderColor: gradeColor }]}>
                <Text style={[s.gradeTxt, { color: gradeColor }]}>Grade {data.grade}</Text>
              </View>
              <View style={[s.statusPill, { backgroundColor: scoreColor + "15" }]}>
                <View style={[s.statusDot, { backgroundColor: scoreColor }]} />
                <Text style={[s.statusTxt, { color: scoreColor }]}>{data.status.replace("_", " ")}</Text>
              </View>
            </View>

            <Text style={s.summaryTxt}>{data.summary}</Text>

            <Text style={s.timestampTxt}>
              Last calculated: {new Date(data.calculatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* Critical Alerts Banner if any */}
        {data.criticalFactors && data.criticalFactors.length > 0 && (
          <View style={s.criticalFactorsBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.criticalFactorsTitle}>Primary Contributing Health Constraints</Text>
              {data.criticalFactors.map((cf, idx) => (
                <Text key={idx} style={s.criticalFactorItem}>• {cf}</Text>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* ====================================================================== */}
      {/* SECTION B — CRITICAL WARNINGS AND RECOMMENDED ACTIONS                  */}
      {/* ====================================================================== */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={s.sectionTitle}>Critical Warnings & Advisories</Text>
          </View>
          <Badge label={`${visibleWarnings.length} Active`} color={colors.warning} bg={colors.warningSoft} />
        </View>

        {visibleWarnings.length === 0 ? (
          <View style={s.noWarningsCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
            <Text style={s.noWarningsTxt}>No active early warnings. Project is executing within nominal parameters.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {visibleWarnings.map((w) => {
              const sevColor = SEVERITY_COLOR_MAP[w.severity] || colors.warning;
              return (
                <View key={w._id} style={[s.warningCard, { borderLeftColor: sevColor }]}>
                  <View style={s.warningTop}>
                    <View style={[s.sevBadge, { backgroundColor: sevColor + "15" }]}>
                      <Text style={[s.sevTxt, { color: sevColor }]}>{w.severity}</Text>
                    </View>
                    <Text style={s.warningCategory}>{w.category}</Text>
                    <Pressable
                      style={s.ackBtn}
                      onPress={() => handleAcknowledge(w._id)}
                      hitSlop={6}
                    >
                      <Ionicons name="checkmark" size={12} color={colors.textMuted} />
                      <Text style={s.ackTxt}>Acknowledge</Text>
                    </Pressable>
                  </View>

                  <Text style={s.warningTitle}>{w.title}</Text>
                  <Text style={s.warningMsg}>{w.message}</Text>

                  {w.recommendedAction && (
                    <View style={s.recommendationBox}>
                      <Ionicons name="bulb-outline" size={14} color={colors.primary} />
                      <Text style={s.recommendationTxt}>
                        <Text style={{ fontWeight: "700" }}>Recommended: </Text>
                        {w.recommendedAction}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ====================================================================== */}
      {/* SECTION C — PROJECT HEALTH DIMENSIONS                                  */}
      {/* ====================================================================== */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="layers-outline" size={18} color={colors.primary} />
            <Text style={s.sectionTitle}>Deterministic Health Dimensions</Text>
          </View>
          <Text style={[font.caption, { color: colors.textMuted }]}>8 Evaluated Signals</Text>
        </View>

        <View style={s.dimGrid}>
          {data.dimensions.map((dim) => {
            const dimColor = STATUS_COLOR_MAP[dim.status] || colors.primary;
            return (
              <View key={dim.key} style={s.dimCard}>
                <View style={s.dimHead}>
                  <Text style={s.dimName} numberOfLines={1}>{dim.name}</Text>
                  <View style={[s.dimStatusBadge, { backgroundColor: dimColor + "15" }]}>
                    <Text style={[s.dimStatusTxt, { color: dimColor }]}>{dim.score}%</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={s.dimBarTrack}>
                  <View style={[s.dimBarFill, { width: `${dim.score}%`, backgroundColor: dimColor }]} />
                </View>

                <Text style={s.dimExplanation} numberOfLines={3}>{dim.explanation}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ====================================================================== */}
      {/* SECTION D — TEAM EXECUTION HEALTH                                      */}
      {/* ====================================================================== */}
      {data.teamExecution && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="people-outline" size={18} color={colors.branch} />
              <Text style={s.sectionTitle}>Team Execution Health & Diagnostics</Text>
            </View>
            <Text style={[font.caption, { color: colors.textMuted }]}>Persisted Workload Analysis</Text>
          </View>

          {/* Execution Metric Tiles */}
          <View style={s.execTilesRow}>
            {/* Tile 1: Task Completion */}
            <View style={s.execTile}>
              <Text style={s.execTileLabel}>Task Completion</Text>
              <Text style={s.execTileValue}>
                {data.teamExecution.taskCompletion.done}/{data.teamExecution.taskCompletion.total}
              </Text>
              <Text style={s.execTileSub}>
                {data.teamExecution.taskCompletion.rate}% complete · {data.teamExecution.taskCompletion.todo} to do
              </Text>
            </View>

            {/* Tile 2: Workload & Capacity */}
            <View style={s.execTile}>
              <Text style={s.execTileLabel}>Committed Workload</Text>
              <Text style={[s.execTileValue, data.teamExecution.workloadAndCapacity.utilizationRate > 100 && { color: colors.danger }]}>
                {data.teamExecution.workloadAndCapacity.totalActiveHours}h / {data.teamExecution.workloadAndCapacity.totalTeamCapacity}h
              </Text>
              <Text style={s.execTileSub}>
                {data.teamExecution.workloadAndCapacity.utilizationRate}% team capacity utilized
              </Text>
            </View>

            {/* Tile 3: Blocked Work */}
            <View style={s.execTile}>
              <Text style={s.execTileLabel}>Blocked Tasks</Text>
              <Text style={[s.execTileValue, data.teamExecution.blockedTasks.count > 0 && { color: colors.warning }]}>
                {data.teamExecution.blockedTasks.count}
              </Text>
              <Text style={s.execTileSub}>
                {data.teamExecution.blockedTasks.count === 0 ? "Zero blocked dependencies" : "Waiting on prerequisites"}
              </Text>
            </View>

            {/* Tile 4: Skill Coverage */}
            <View style={s.execTile}>
              <Text style={s.execTileLabel}>Skill Coverage</Text>
              <Text style={[s.execTileValue, data.teamExecution.skillCoverage.percentage < 80 && { color: colors.warning }]}>
                {data.teamExecution.skillCoverage.percentage}%
              </Text>
              <Text style={s.execTileSub}>
                {data.teamExecution.skillCoverage.coveredCount}/{data.teamExecution.skillCoverage.requiredCount} skills covered
              </Text>
            </View>
          </View>

          {/* Member Workload Distribution */}
          <View style={s.subSectionCard}>
            <View style={s.subSectionHead}>
              <Text style={s.subSectionTitle}>Workload Distribution Across Members</Text>
              <Text style={font.caption}>
                {data.teamExecution.workloadAndCapacity.members.length} member(s)
              </Text>
            </View>

            {data.teamExecution.workloadAndCapacity.members.length === 0 ? (
              <Text style={[font.caption, { color: colors.textMuted }]}>No team members assigned.</Text>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {data.teamExecution.workloadAndCapacity.members.map((m) => {
                  const util = Math.round((m.assignedHours / (m.capacity || 40)) * 100);
                  const isOver = m.overloaded || util > 100;
                  return (
                    <View key={m.userId} style={s.memberRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={s.memberName}>{m.name}</Text>
                          {isOver && (
                            <View style={s.overloadBadge}>
                              <Text style={s.overloadTxt}>OVERLOADED</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.memberSub}>
                          {m.activeCount} active task(s) · {m.assignedHours}h assigned / {m.capacity}h limit ({util}%)
                        </Text>
                      </View>

                      <View style={s.memberBarContainer}>
                        <View style={s.memberBarTrack}>
                          <View
                            style={[
                              s.memberBarFill,
                              {
                                width: `${Math.min(util, 100)}%`,
                                backgroundColor: isOver ? colors.danger : colors.primary,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Blocked Tasks Drill-down */}
          {data.teamExecution.blockedTasks.count > 0 && (
            <View style={s.subSectionCard}>
              <View style={s.subSectionHead}>
                <Text style={s.subSectionTitle}>Tasks Awaiting Prerequisite Completion</Text>
                <Badge label={`${data.teamExecution.blockedTasks.count}`} color="#B45309" bg="#FFFBEB" />
              </View>
              <View style={{ gap: 6 }}>
                {data.teamExecution.blockedTasks.tasks.map((bt) => (
                  <View key={bt.id} style={s.blockedItem}>
                    <Ionicons name="hourglass-outline" size={14} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.blockedTitle}>{bt.title}</Text>
                      <Text style={s.blockedPhase}>Phase: {bt.phase || "requirements"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Missing Skills Drill-down if any */}
          {data.teamExecution.skillCoverage.missingCount > 0 && (
            <View style={s.subSectionCard}>
              <View style={s.subSectionHead}>
                <Text style={s.subSectionTitle}>Missing Competencies in Team Roster</Text>
                <Badge label={`${data.teamExecution.skillCoverage.missingCount} Missing`} color={colors.warning} bg={colors.warningSoft} />
              </View>
              <View style={s.chipWrap}>
                {data.teamExecution.skillCoverage.missingSkills.map((sk) => (
                  <View key={sk} style={s.missingSkillChip}>
                    <Ionicons name="alert-circle-outline" size={12} color={colors.warning} />
                    <Text style={s.missingSkillTxt}>{sk}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* GitHub Integration Activity */}
          <View style={s.subSectionCard}>
            <View style={s.subSectionHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="logo-github" size={16} color={colors.text} />
                <Text style={s.subSectionTitle}>Repository Activity</Text>
              </View>
              <Badge
                label={data.teamExecution.githubActivity.connected ? "Connected" : "Unconnected"}
                color={data.teamExecution.githubActivity.connected ? colors.success : colors.textMuted}
                bg={data.teamExecution.githubActivity.connected ? colors.successSoft : colors.surfaceAlt}
              />
            </View>
            <Text style={s.gitInfoTxt}>
              {data.teamExecution.githubActivity.connected
                ? `${data.teamExecution.githubActivity.repo} · ${data.teamExecution.githubActivity.recentCommits} commits recently`
                : "Connect a GitHub repository to track code commits, pull requests, and automated verification."}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },

  // Section A: Overall
  overallCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  overallHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  overallTitle: { ...font.h2, color: colors.text },
  overallSub: { ...font.caption, color: colors.textMuted, marginTop: 2 },
  methodologyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  methodologyTxt: { fontSize: 10, fontWeight: "700", color: colors.primary, letterSpacing: 0.3 },

  recalcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  recalcTxt: { fontSize: 11, fontWeight: "700", color: colors.primary },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  scoreNum: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  scoreDenom: { fontSize: 10, fontWeight: "700", color: colors.textMuted, marginTop: -3 },

  scoreMeta: { flex: 1, gap: 4 },
  gradePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  gradeTxt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  summaryTxt: { ...font.small, color: colors.text, marginTop: 2 },
  timestampTxt: { fontSize: 10, color: colors.textFaint },

  criticalFactorsBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  criticalFactorsTitle: { fontSize: 11.5, fontWeight: "700", color: "#DC2626" },
  criticalFactorItem: { fontSize: 11, color: "#B91C1C", lineHeight: 15 },

  // Sections Common
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...font.h3, color: colors.text },

  // Section B: Warnings
  noWarningsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noWarningsTxt: { ...font.small, color: colors.textMuted, flex: 1 },

  warningCard: {
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    gap: 5,
  },
  warningTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sevBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  sevTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  warningCategory: { fontSize: 10, fontWeight: "700", color: colors.textMuted, flex: 1 },
  ackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ackTxt: { fontSize: 10, fontWeight: "600", color: colors.textMuted },

  warningTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  warningMsg: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
  recommendationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.primarySoft,
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  recommendationTxt: { fontSize: 11, color: colors.primary, flex: 1, lineHeight: 15 },

  // Section C: Dimensions Grid
  dimGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dimCard: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  dimHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  dimName: { fontSize: 12, fontWeight: "700", color: colors.text, flex: 1 },
  dimStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  dimStatusTxt: { fontSize: 10, fontWeight: "800" },
  dimBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    overflow: "hidden",
  },
  dimBarFill: { height: "100%", borderRadius: 2 },
  dimExplanation: { fontSize: 10.5, color: colors.textMuted, lineHeight: 14 },

  // Section D: Team Execution
  execTilesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  execTile: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  execTileLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  execTileValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  execTileSub: { fontSize: 10, color: colors.textFaint },

  subSectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  subSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subSectionTitle: { fontSize: 12.5, fontWeight: "700", color: colors.text },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  memberName: { fontSize: 12, fontWeight: "700", color: colors.text },
  overloadBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "#FEE2E2",
  },
  overloadTxt: { fontSize: 8.5, fontWeight: "800", color: "#DC2626" },
  memberSub: { fontSize: 10.5, color: colors.textMuted },
  memberBarContainer: { width: 60 },
  memberBarTrack: { height: 5, backgroundColor: colors.surfaceAlt, borderRadius: 3, overflow: "hidden" },
  memberBarFill: { height: "100%" },

  blockedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    padding: 6,
    borderRadius: radius.sm,
  },
  blockedTitle: { fontSize: 11.5, fontWeight: "600", color: colors.text },
  blockedPhase: { fontSize: 9.5, color: colors.textMuted },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  missingSkillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missingSkillTxt: { fontSize: 10.5, fontWeight: "600", color: colors.warning },
  gitInfoTxt: { fontSize: 11, color: colors.textMuted },
});
