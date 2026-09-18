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

  const fetchLessons = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLessons(data.lessons || []);
      }
    } catch (e: any) {
      toast(e.message || "Failed to load project lessons", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);  useEffect(() => {
    fetchLessons();
    const socket = getSocket(token);
    if (socket) {
      socket.on("lesson.created", () => fetchLessons());
      socket.on("lesson.validated", () => fetchLessons());
      socket.on("lesson.applied", () => fetchLessons());
      socket.on("lesson.archived", () => fetchLessons());
      return () => {
        socket.off("lesson.created");
        socket.off("lesson.validated");
        socket.off("lesson.applied");
        socket.off("lesson.archived");
      };
    }
  }, [fetchLessons, token]);

  const handleGenerate = async () => {
    if (!projectId || !token) return;
    try {
      setGenerating(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/lessons/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Extracted ${data.count || 0} evidence-backed lesson candidate(s)`, "success");
        fetchLessons();
      } else {
        toast(data.error || "Failed to extract lesson candidates", "error");
      }
    } catch (e: any) {
      toast(e.message || "Network error", "error");
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
        toast(approved ? "Lesson validated with empirical evidence" : "Lesson rejected", "success");
        fetchLessons();
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
        fetchLessons();
      } else {
        toast(data.error || "Application failed", "error");
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
            Extracts empirical lessons from completed tasks, schedules, and dependencies.
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

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {["ALL", "CANDIDATE", "VALIDATED", "APPLIED", "ARCHIVED"].map((s) => (
          <Pressable
            key={s}
            onPress={() => setFilterStatus(s)}
            style={[styles.tabBtn, filterStatus === s && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, filterStatus === s && styles.tabTextActive]}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Lesson List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="No Lessons Found"
          message="Click 'Generate Lessons' to analyze project execution history and identify recurring patterns."
        />
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

          return (
            <Card key={l._id} style={styles.lessonCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.badgeRow}>
                    <Badge label={l.status} color={statusColor} />
                    <Badge label={l.category.toUpperCase()} color={colors.primary} />
                    <Text style={styles.confidenceText}>
                      Confidence: {Math.round((l.confidence || 0.7) * 100)}%
                    </Text>
                  </View>
                  <Text style={styles.lessonTitle}>{l.title}</Text>
                </View>
              </View>

              <Text style={styles.descriptionText}>{l.description}</Text>

              {/* Observed Pattern */}
              <View style={styles.patternBox}>
                <Text style={styles.patternLabel}>Observed Pattern:</Text>
                <Text style={styles.patternText}>{l.observedPattern}</Text>
              </View>

              {/* Empirical Evidence */}
              <View style={styles.evidenceBox}>
                <Text style={styles.evidenceTitle}>Empirical Evidence:</Text>
                <View style={styles.metricsRow}>
                  {l.evidenceMetrics?.sampleSize !== undefined && (
                    <View style={styles.metricItem}>
                      <Text style={styles.metricVal}>{l.evidenceMetrics.sampleSize}</Text>
                      <Text style={styles.metricLbl}>Sample Tasks</Text>
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
                        {l.evidenceMetrics.varianceHours > 0 ? `+${l.evidenceMetrics.varianceHours}` : l.evidenceMetrics.varianceHours}h
                      </Text>
                      <Text style={styles.metricLbl}>Hours Variance</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Recommendation */}
              {!!l.recommendation && (
                <View style={styles.recBox}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.accentDark} />
                  <Text style={styles.recText}>
                    <Text style={{ fontWeight: "700" }}>Advisory Action: </Text>
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
                  <Button
                    title="Apply to Planning"
                    variant="primary"
                    small
                    icon="arrow-forward-circle-outline"
                    onPress={() => handleApply(l._id)}
                  />
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
});
