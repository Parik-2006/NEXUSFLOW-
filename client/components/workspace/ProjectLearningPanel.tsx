/**
 * client/components/workspace/ProjectLearningPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 21: PROJECT LEARNING LOOP UI
 *
 * Evidence-based learning loop displaying:
 * - Lesson candidates, validated lessons, and applied lessons
 * - Empirical evidence metrics (sample sizes, actual vs planned duration ratios)
 * - Validation & archive lifecycle controls
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
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

interface ProjectLesson {
  _id: string;
  category: string;
  title: string;
  description: string;
  observedPattern: string;
  confidence: number;
  status: "CANDIDATE" | "REVIEWED" | "VALIDATED" | "APPLIED" | "ARCHIVED";
  recommendation: string;
  evidence?: any;
  evidenceMetrics?: {
    sampleSize?: number;
    plannedVsActualRatio?: number;
    varianceHours?: number;
    blockerCount?: number;
  };
  validationMetadata?: {
    validatedAt?: string;
    validatedBy?: string;
    notes?: string;
    rejectionReason?: string;
  };
  reusableTags?: string[];
}

export default function ProjectLearningPanel({ projectId }: { projectId: string }) {
  const { token } = useAuth();
  const toast = useToast();
  const [lessons, setLessons] = useState<ProjectLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [validationNotes, setValidationNotes] = useState<{ [id: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    all: number;
    candidate: number;
    validated: number;
    applied: number;
    archived: number;
  }>({
    all: 0,
    candidate: 0,
    validated: 0,
    applied: 0,
    archived: 0,
  });

  const fetchLessons = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons?status=${filterStatus}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLessons(data.lessons || []);
        if (data.counts) {
          setCounts(data.counts);
        } else {
          const lList = data.lessons || [];
          setCounts({
            all: lList.length,
            candidate: lList.filter((l: any) => l.status === "CANDIDATE").length,
            validated: lList.filter((l: any) => l.status === "VALIDATED").length,
            applied: lList.filter((l: any) => l.status === "APPLIED").length,
            archived: lList.filter((l: any) => l.status === "ARCHIVED").length,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load project lessons");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load project lessons");
      toast(e.message || "Failed to load project lessons", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, filterStatus]);

  useEffect(() => {
    fetchLessons();
    const socket = getSocket(token);
    if (socket) {
      socket.emit("room:join:project", { projectId });
      const handleRefresh = () => fetchLessons();
      socket.on("lesson.created", handleRefresh);
      socket.on("lesson.validated", handleRefresh);
      socket.on("lesson.applied", handleRefresh);
      socket.on("lesson.archived", handleRefresh);
      return () => {
        socket.off("lesson.created", handleRefresh);
        socket.off("lesson.validated", handleRefresh);
        socket.off("lesson.applied", handleRefresh);
        socket.off("lesson.archived", handleRefresh);
      };
    }
  }, [fetchLessons, token, projectId]);

  const handleGenerate = async () => {
    if (!projectId || !token || generating) return;
    try {
      setGenerating(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.count ?? data.candidates?.length ?? 0;
        toast(`Extracted ${count} evidence-backed lesson candidate(s)`, "success");
        await fetchLessons();
      } else {
        toast(data.error || "Failed to extract lesson candidates", "error");
      }
    } catch (e: any) {
      toast(e.message || "Network error generating lessons", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async (lessonId: string, approved: boolean) => {
    try {
      const notes = validationNotes[lessonId] || "";
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons/${lessonId}/validate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved, notes }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(approved ? "Lesson validated with empirical evidence" : "Lesson rejected / archived", "success");
        await fetchLessons();
      } else {
        toast(data.error || "Validation failed", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const handleApply = async (lessonId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons/${lessonId}/apply`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: "Applied advisory guide to current project" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Lesson applied as advisory project guide", "success");
        await fetchLessons();
      } else {
        toast(data.error || "Application failed", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const handleArchive = async (lessonId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons/${lessonId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "Archived from project learning review" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Lesson archived.", "info");
        await fetchLessons();
      } else {
        toast(data.error || "Failed to archive lesson", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const filtered = lessons.filter((l) =>
    filterStatus === "ALL" ? true : l.status === filterStatus
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLessons} />}
    >
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Project Learning Loop</Text>
          <Text style={styles.subtitle}>
            Extracts empirical lessons from completed tasks, schedules, dependencies, and capability patterns.
          </Text>
        </View>
        <Button
          title={generating ? "Analyzing..." : "Generate Lessons"}
          variant="primary"
          icon="bulb-outline"
          disabled={generating}
          onPress={handleGenerate}
        />
      </View>

      {/* Analyzing Banner */}
      {generating && (
        <View style={styles.generatingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.generatingText}>
            Analyzing project execution history (tasks, dependencies, capacities, risks)...
          </Text>
        </View>
      )}

      {/* Filter Tabs with Live Authoritative Counts */}
      <View style={styles.filterRow}>
        {(["ALL", "CANDIDATE", "VALIDATED", "APPLIED", "ARCHIVED"] as const).map((s) => {
          const count = counts[s.toLowerCase() as keyof typeof counts] ?? 0;
          return (
            <Pressable
              key={s}
              onPress={() => setFilterStatus(s)}
              style={[styles.tabBtn, filterStatus === s && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, filterStatus === s && styles.tabTextActive]}>
                {s} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Error state with retry */}
      {error && (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
          <View style={{ flex: 1, marginLeft: spacing.xs }}>
            <Text style={{ fontWeight: "700", color: colors.danger }}>Analysis Error</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{error}</Text>
          </View>
          <Button title="Retry" variant="secondary" small onPress={() => fetchLessons()} />
        </Card>
      )}

      {/* Lesson List / Empty States */}
      {filtered.length === 0 ? (
        counts.all === 0 ? (
          <EmptyState
            icon="school-outline"
            title="No Execution Lessons Recorded Yet"
            message="NexusFlow analyzes completed task hours, prerequisite cascades, unassigned critical work, and skill gaps to extract evidence-backed lessons. Click 'Generate Lessons' above to run the deterministic analysis."
            actionLabel="Generate Lessons"
            actionIcon="bulb-outline"
            onAction={handleGenerate}
          />
        ) : (
          <EmptyState
            icon="file-tray-outline"
            title={`No ${filterStatus.charAt(0) + filterStatus.slice(1).toLowerCase()} Lessons`}
            message={`No lessons currently found in "${filterStatus}" status. Switch filters or generate new candidate lessons.`}
          />
        )
      ) : (
        filtered.map((l) => {
          const ratio = l.evidenceMetrics?.plannedVsActualRatio;
          const statusColor =
            l.status === "VALIDATED"
              ? colors.success
              : l.status === "APPLIED"
              ? colors.info
              : l.status === "CANDIDATE"
              ? colors.warning
              : colors.textMuted;

          const confidencePct = Math.round((l.confidence || 0.7) * 100);

          return (
            <Card key={l._id} style={styles.lessonCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.badgeRow}>
                    <Badge label={l.status} color={statusColor} />
                    <Badge label={(l.category || "GENERAL").toUpperCase()} color={colors.primary} />
                    <Text style={styles.confidenceText}>Confidence: {confidencePct}%</Text>
                  </View>
                  <Text style={styles.lessonTitle}>{l.title}</Text>
                </View>
              </View>

              {/* Confidence Progress Bar */}
              <View style={styles.confidenceBarBg}>
                <View
                  style={[
                    styles.confidenceBarFill,
                    {
                      width: `${confidencePct}%`,
                      backgroundColor:
                        confidencePct >= 80 ? colors.success : confidencePct >= 60 ? colors.warning : colors.danger,
                    },
                  ]}
                />
              </View>

              <Text style={styles.descriptionText}>{l.description}</Text>

              {/* Observed Pattern */}
              <View style={styles.patternBox}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="analytics-outline" size={14} color={colors.primary} />
                  <Text style={styles.patternLabel}>Observed Fact & Pattern:</Text>
                </View>
                <Text style={styles.patternText}>{l.observedPattern}</Text>
              </View>

              {/* Empirical Evidence */}
              <View style={styles.evidenceBox}>
                <Text style={styles.evidenceTitle}>Empirical Project Evidence:</Text>
                <View style={styles.metricsRow}>
                  {l.evidenceMetrics?.sampleSize !== undefined && (
                    <View style={styles.metricItem}>
                      <Text style={styles.metricVal}>{l.evidenceMetrics.sampleSize}</Text>
                      <Text style={styles.metricLbl}>Sample Size</Text>
                    </View>
                  )}
                  {ratio !== undefined && (
                    <View style={styles.metricItem}>
                      <Text style={styles.metricVal}>{Math.round(ratio * 100)}%</Text>
                      <Text style={styles.metricLbl}>Actual vs Plan</Text>
                    </View>
                  )}
                  {l.evidenceMetrics?.varianceHours !== undefined && (
                    <View style={styles.metricItem}>
                      <Text style={styles.metricVal}>
                        {l.evidenceMetrics.varianceHours > 0
                          ? `+${l.evidenceMetrics.varianceHours}`
                          : l.evidenceMetrics.varianceHours}h
                      </Text>
                      <Text style={styles.metricLbl}>Variance Hours</Text>
                    </View>
                  )}
                  {l.evidenceMetrics?.blockerCount !== undefined && l.evidenceMetrics.blockerCount > 0 && (
                    <View style={styles.metricItem}>
                      <Text style={[styles.metricVal, { color: colors.warning }]}>
                        {l.evidenceMetrics.blockerCount}
                      </Text>
                      <Text style={styles.metricLbl}>Blocker Tasks</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Recommendation */}
              {!!l.recommendation && (
                <View style={styles.recBox}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                  <Text style={styles.recText}>
                    <Text style={{ fontWeight: "700", color: colors.primary }}>Advisory Action: </Text>
                    {l.recommendation}
                  </Text>
                </View>
              )}

              {/* Action Controls */}
              {l.status === "CANDIDATE" && (
                <View style={styles.actionRow}>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Validation notes or review remarks..."
                    placeholderTextColor={colors.textFaint}
                    value={validationNotes[l._id] || ""}
                    onChangeText={(txt) => setValidationNotes({ ...validationNotes, [l._id]: txt })}
                  />
                  <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
                    <Button
                      title="Validate Lesson"
                      variant="primary"
                      small
                      icon="checkmark-circle-outline"
                      onPress={() => handleValidate(l._id, true)}
                    />
                    <Button
                      title="Reject"
                      variant="secondary"
                      small
                      icon="close-circle-outline"
                      onPress={() => handleValidate(l._id, false)}
                    />
                  </View>
                </View>
              )}

              {l.status === "VALIDATED" && (
                <View style={styles.applyRow}>
                  <Text style={styles.validatedNotice}>
                    Verified by {l.validationMetadata?.validatedBy || "Lead"}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.xs }}>
                    <Button
                      title="Apply Recommendation"
                      variant="primary"
                      small
                      icon="arrow-forward-circle-outline"
                      onPress={() => handleApply(l._id)}
                    />
                    <Button
                      title="Archive"
                      variant="ghost"
                      small
                      icon="archive-outline"
                      onPress={() => handleArchive(l._id)}
                    />
                  </View>
                </View>
              )}

              {l.status === "APPLIED" && (
                <View style={styles.applyRow}>
                  <Badge label="Applied (Advisory Planning)" color={colors.info} />
                  <Button
                    title="Archive"
                    variant="ghost"
                    small
                    icon="archive-outline"
                    onPress={() => handleArchive(l._id)}
                  />
                </View>
              )}

              {l.status === "ARCHIVED" && (
                <View style={styles.applyRow}>
                  <Badge label="Archived" color={colors.textMuted} />
                  {!!l.validationMetadata?.rejectionReason && (
                    <Text style={[styles.validatedNotice, { fontStyle: "italic" }]}>
                      {l.validationMetadata.rejectionReason}
                    </Text>
                  )}
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tabBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  lessonCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  descriptionText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  patternBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  patternLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  patternText: {
    fontSize: 13,
    color: colors.text,
    marginTop: 2,
  },
  evidenceBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  evidenceTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metricItem: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  metricLbl: {
    fontSize: 10,
    color: colors.textMuted,
  },
  recBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.accentSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  recText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  actionRow: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  applyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  validatedNotice: {
    fontSize: 11,
    color: colors.success,
    fontWeight: "600",
  },
  generatingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  generatingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.danger + "15",
    borderColor: colors.danger + "44",
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
  },
  confidenceBarBg: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  confidenceBarFill: {
    height: 4,
    borderRadius: 2,
  },
});
