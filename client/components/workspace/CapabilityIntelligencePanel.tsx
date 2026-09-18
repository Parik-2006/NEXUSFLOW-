/**
 * client/components/workspace/CapabilityIntelligencePanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WORKSTREAM 22: CAPABILITY INTELLIGENCE & TEAM ASSIGNMENT UI
 *
 * Visualizes:
 * - Verified vs declared canonical skill coverage
 * - Single-point failure risks (bus factor = 1)
 * - Dynamic Branch & Bound assignment recommendations
 * - Explicit human acceptance controls (Preview -> Accept)
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
import { Card, Button, Badge, EmptyState, ProgressBar } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import { getSocket } from "@/services/socket";

interface CapabilityOverview {
  totalMembers: number;
  coverage: Array<{
    skillId: string;
    name: string;
    category: string;
    verifiedMembers: Array<{ userId: string; name: string; weight: number }>;
    declaredMembers: Array<{ userId: string; name: string; weight: number }>;
  }>;
  singlePointRisks: Array<{
    skillId: string;
    skillName: string;
    soleOwner: { name: string; userId: string };
    riskLevel: string;
    finding: string;
    recommendation: string;
  }>;
  overloadedMembers: Array<{
    userId: string;
    name: string;
    assignedHours: number;
    capacity: number;
    utilizationRate: number;
    finding: string;
  }>;
  uncoveredRequiredSkills: Array<{
    skillId: string;
    name: string;
    finding: string;
    recommendation: string;
  }>;
}

interface AssignmentPreview {
  advisoryOnly: boolean;
  assignments: Array<{
    taskId: string;
    taskTitle: string;
    currentAssigneeId: string | null;
    recommendedMemberId: string;
    recommendedMemberName: string;
    fitCost: number;
    fitScore: number;
    skillEvidence: string;
    capacityImpact: {
      hoursBefore: number;
      hoursAfter: number;
      capacity: number;
    };
    alternatives: Array<{
      userId: string;
      name: string;
      costDifference: number;
      fitScore: number;
    }>;
  }>;
  deterministicFactors: Array<{ name: string; weight: number; rule: string }>;
}

export default function CapabilityIntelligencePanel({ projectId }: { projectId: string }) {
  const { token } = useAuth();
  const toast = useToast();
  const [overview, setOverview] = useState<CapabilityOverview | null>(null);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/capability-overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (e: any) {
      toast(e.message || "Failed to load capability overview", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  const fetchPreview = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setPreviewing(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/assignment/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      }
    } catch (e: any) {
      toast(e.message || "Failed to preview dynamic assignment", "error");
    } finally {
      setPreviewing(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    fetchOverview();
    fetchPreview();
    const socket = getSocket(token);
    if (socket) {
      socket.on("capability.updated", () => {
        fetchOverview();
        fetchPreview();
      });
      socket.on("assignment.accepted", () => {
        fetchOverview();
        fetchPreview();
      });
      return () => {
        socket.off("capability.updated");
        socket.off("assignment.accepted");
      };
    }
  }, [fetchOverview, fetchPreview, token]);

  const handleAcceptAssignment = async (taskId: string, newAssigneeId: string) => {
    try {
      setAcceptingId(taskId);
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/assignment/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId, newAssigneeId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Assignment accepted: ${data.assignedTo}`, "success");
        fetchOverview();
        fetchPreview();
      } else {
        toast(data.error || "Failed to accept assignment", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchOverview} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Capability Intelligence & Team Allocation</Text>
          <Text style={styles.subtitle}>
            Deterministic skill verification and Branch & Bound dynamic workload assignment.
          </Text>
        </View>
        <Button
          title={previewing ? "Solving..." : "Recalculate Fit"}
          variant="secondary"
          icon="refresh-outline"
          disabled={previewing}
          onPress={fetchPreview}
        />
      </View>

      {/* Single Point of Failure Risks */}
      {overview?.singlePointRisks && overview.singlePointRisks.length > 0 && (
        <Card style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={styles.alertTitle}>Single-Point Capability Concentration (Bus Factor = 1)</Text>
          </View>
          {overview.singlePointRisks.map((risk) => (
            <View key={risk.skillId} style={styles.riskItem}>
              <Text style={styles.riskSkill}>{risk.skillName}:</Text>
              <Text style={styles.riskFinding}>{risk.finding}</Text>
              <Text style={styles.riskRec}>Recommendation: {risk.recommendation}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Overloaded Members */}
      {overview?.overloadedMembers && overview.overloadedMembers.length > 0 && (
        <Card style={styles.overloadCard}>
          <View style={styles.alertHeader}>
            <Ionicons name="speedometer-outline" size={18} color={colors.danger} />
            <Text style={[styles.alertTitle, { color: colors.danger }]}>
              Overloaded Team Members ({overview.overloadedMembers.length})
            </Text>
          </View>
          {overview.overloadedMembers.map((m) => (
            <View key={m.userId} style={styles.riskItem}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "700", color: colors.text }}>{m.name}</Text>
                <Text style={{ color: colors.danger, fontWeight: "600" }}>{m.utilizationRate}% Capacity</Text>
              </View>
              <Text style={styles.riskFinding}>{m.finding}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Dynamic Assignment Recommendations (Branch & Bound) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Branch & Bound Dynamic Assignments</Text>
          <Badge label="Deterministic Solver" color={colors.primary} />
        </View>
        <Text style={styles.sectionSubtitle}>
          Optimal task-to-member matching based on verified skills, current capacity, and dependency chains.
        </Text>

        {preview?.assignments && preview.assignments.length > 0 ? (
          preview.assignments.map((a) => {
            const isAccepting = acceptingId === a.taskId;
            return (
              <Card key={a.taskId} style={styles.assignmentCard}>
                <View style={styles.assignRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>{a.taskTitle}</Text>
                    <View style={styles.fitRow}>
                      <Badge label={`Fit Score: ${a.fitScore}%`} color={colors.success} />
                      <Text style={styles.evidenceLabel}>{a.skillEvidence}</Text>
                    </View>
                  </View>

                  <Button
                    title={isAccepting ? "Accepting..." : "Accept Assign"}
                    variant="primary"
                    small
                    disabled={isAccepting}
                    onPress={() => handleAcceptAssignment(a.taskId, a.recommendedMemberId)}
                  />
                </View>

                {/* Candidate & Capacity Impact */}
                <View style={styles.impactBox}>
                  <Text style={styles.impactText}>
                    Recommended: <Text style={{ fontWeight: "700" }}>{a.recommendedMemberName}</Text>
                    {"  "}• Load Impact: {a.capacityImpact.hoursBefore}h → {a.capacityImpact.hoursAfter}h (Cap: {a.capacityImpact.capacity}h)
                  </Text>
                </View>

                {/* Alternatives */}
                {a.alternatives && a.alternatives.length > 0 && (
                  <View style={styles.altRow}>
                    <Text style={styles.altTitle}>Alternative Options: </Text>
                    {a.alternatives.map((alt) => (
                      <Pressable
                        key={alt.userId}
                        style={styles.altChip}
                        onPress={() => handleAcceptAssignment(a.taskId, alt.userId)}
                      >
                        <Text style={styles.altText}>
                          {alt.name} ({alt.fitScore}%)
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="people"
            title="All Open Tasks Assigned"
            message="No unassigned or rebalancing tasks require Branch & Bound reallocation."
          />
        )}
      </View>

      {/* Verified Skill Coverage Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verified Canonical Skills Roster</Text>
        <Text style={styles.sectionSubtitle}>
          Empirical verification (Quizzes + Completed Work) vs Self-declared skills.
        </Text>

        <View style={styles.coverageGrid}>
          {overview?.coverage?.slice(0, 15).map((cov) => (
            <View key={cov.skillId} style={styles.coverageCard}>
              <Text style={styles.covSkillName}>{cov.name}</Text>
              <Text style={styles.covCategory}>{cov.category}</Text>
              <View style={styles.memberTags}>
                {cov.verifiedMembers.map((vm) => (
                  <View key={vm.userId} style={[styles.memberPill, styles.verifiedPill]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.pillText}>{vm.name}</Text>
                  </View>
                ))}
                {cov.declaredMembers.map((dm) => (
                  <View key={dm.userId} style={[styles.memberPill, styles.declaredPill]}>
                    <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.pillTextFaint}>{dm.name} (declared)</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
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
  alertCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    padding: spacing.md,
  },
  overloadCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    padding: spacing.md,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.warning,
  },
  riskItem: {
    marginTop: spacing.xs,
    paddingVertical: 2,
  },
  riskSkill: {
    fontWeight: "700",
    fontSize: 13,
    color: colors.text,
  },
  riskFinding: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  riskRec: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  section: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: 2,
  },
  assignmentCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  assignRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  fitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  evidenceLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  impactBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  impactText: {
    fontSize: 12,
    color: colors.text,
  },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  altTitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  altChip: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  altText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
  },
  coverageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coverageCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  covSkillName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  covCategory: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  memberTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  memberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  verifiedPill: {
    backgroundColor: colors.successSoft,
  },
  declaredPill: {
    backgroundColor: colors.surfaceAlt,
  },
  pillText: {
    fontSize: 10,
    color: colors.success,
    fontWeight: "600",
  },
  pillTextFaint: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
