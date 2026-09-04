/**
 * LeaderApplicationsPanel.tsx — Professional Team Applications Review Panel
 *
 * Provides workspace leaders with an interface to review prospective candidate
 * applications, inspect verified badges & quiz results, evaluate skill match,
 * and Accept (creating team membership) or Reject (with optional reason).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast, useConfirm } from "@/components/feedback";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, radius, spacing, font } from "@/theme";

export interface ApplicationCandidate {
  _id: string;
  teamId: string;
  roleId: string;
  roleName: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  status: "DRAFT" | "QUIZ_PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  message: string;
  quizScore: number;
  quizTotal: number;
  quizPercentage: number;
  verifiedSkills: {
    skill: string;
    score: number;
    percentage: number;
    verified: boolean;
  }[];
  skillMatch: {
    score: number;
    matchPercentage: number;
    matchedSkills: string[];
    missingSkills: string[];
    compatibilityLabel: string;
  };
  reviewerName?: string;
  reviewReason?: string;
  createdAt: string;
}

interface LeaderApplicationsPanelProps {
  visible: boolean;
  teamId: string;
  onClose: () => void;
  onMemberAdded?: () => void;
}

export default function LeaderApplicationsPanel({
  visible,
  teamId,
  onClose,
  onMemberAdded,
}: LeaderApplicationsPanelProps) {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [applications, setApplications] = useState<ApplicationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "reviewed">("pending");

  // Rejection modal state
  const [rejectingApp, setRejectingApp] = useState<ApplicationCandidate | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/applications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load applications.");
      setApplications(data.applications || []);
    } catch (err: any) {
      toast(err.message || "Failed to load applications.", "error");
    } finally {
      setLoading(false);
    }
  }, [visible, teamId, token]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleAccept = async (app: ApplicationCandidate) => {
    const ok = await confirm({
      title: `Accept ${app.applicantName}?`,
      message: `This will add ${app.applicantName} to your workspace as an active team member for the "${app.roleName}" role.`,
      confirmLabel: "Accept Candidate",
    });
    if (!ok) return;

    setActionLoading(app._id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/${app._id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept application.");

      toast(`${app.applicantName} is now an active member!`, "success");
      onMemberAdded?.();
      fetchApplications();
    } catch (err: any) {
      toast(err.message || "Error accepting candidate.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingApp) return;
    setActionLoading(rejectingApp._id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/${rejectingApp._id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject application.");

      toast("Application rejected.", "info");
      setRejectingApp(null);
      setRejectionReason("");
      fetchApplications();
    } catch (err: any) {
      toast(err.message || "Error rejecting application.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const pendingApps = applications.filter((a) => ["SUBMITTED", "UNDER_REVIEW"].includes(a.status));
  const reviewedApps = applications.filter((a) => ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(a.status));
  const displayedApps = activeTab === "pending" ? pendingApps : reviewedApps;

  return (
    <>
      <ModalSheet visible={visible} onClose={onClose} title="Candidate Applications">
        {/* Tab Switcher */}
        <View style={s.tabRow}>
          <Pressable
            style={[s.tabBtn, activeTab === "pending" && s.tabBtnActive]}
            onPress={() => setActiveTab("pending")}
          >
            <Text style={[s.tabText, activeTab === "pending" && s.tabTextActive]}>
              Pending Review ({pendingApps.length})
            </Text>
          </Pressable>
          <Pressable
            style={[s.tabBtn, activeTab === "reviewed" && s.tabBtnActive]}
            onPress={() => setActiveTab("reviewed")}
          >
            <Text style={[s.tabText, activeTab === "reviewed" && s.tabTextActive]}>
              History ({reviewedApps.length})
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 10, color: colors.textMuted, fontSize: 13 }}>
              Loading applications…
            </Text>
          </View>
        ) : displayedApps.length === 0 ? (
          <EmptyState
            icon="documents-outline"
            title={activeTab === "pending" ? "No pending applications" : "No past applications"}
            message={
              activeTab === "pending"
                ? "Prospective candidates who apply for your open roles will appear here."
                : "Accepted or rejected applications will be logged here."
            }
          />
        ) : (
          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {displayedApps.map((app) => {
              const matchPct = app.skillMatch?.matchPercentage || 0;
              const isPending = ["SUBMITTED", "UNDER_REVIEW"].includes(app.status);

              return (
                <View key={app._id} style={s.card}>
                  {/* Candidate Header */}
                  <View style={s.candidateHeader}>
                    <Avatar name={app.applicantName} size={42} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.candidateName} numberOfLines={1}>{app.applicantName}</Text>
                      <Text style={s.candidateEmail} numberOfLines={1}>{app.applicantEmail}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <Ionicons name="briefcase-outline" size={13} color={colors.accent} />
                        <Text style={s.appliedRoleText}>{app.roleName}</Text>
                      </View>
                    </View>

                    {/* Status / Match Badge */}
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Badge
                        label={`${matchPct}% Match`}
                        color={matchPct >= 70 ? colors.success : colors.accent}
                      />
                      <Text style={s.dateText}>
                        {new Date(app.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  {/* Quiz Result & Verified Badges */}
                  <View style={s.statsBox}>
                    <View style={s.statCol}>
                      <Text style={s.statVal}>
                        {app.quizScore > 0 ? `${app.quizScore}/${app.quizTotal}` : "Profile Verified"}
                      </Text>
                      <Text style={s.statLbl}>Quiz Score</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statCol}>
                      <Text style={[s.statVal, { color: matchPct >= 70 ? colors.success : colors.accent }]}>
                        {app.skillMatch?.compatibilityLabel || "Developing"}
                      </Text>
                      <Text style={s.statLbl}>Compatibility</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statCol}>
                      <Text style={s.statVal}>
                        {app.verifiedSkills?.length || 0}
                      </Text>
                      <Text style={s.statLbl}>Verified Badges</Text>
                    </View>
                  </View>

                  {/* Verified Skill Badges Display */}
                  {app.verifiedSkills?.length > 0 && (
                    <View style={s.verifiedSkillsWrap}>
                      {app.verifiedSkills.map((v, i) => (
                        <View key={i} style={s.badgeChip}>
                          <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                          <Text style={s.badgeChipText}>{v.skill} ({v.percentage}%)</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Candidate Message */}
                  {!!app.message && (
                    <View style={s.messageBox}>
                      <Text style={s.messageLabel}>APPLICANT STATEMENT:</Text>
                      <Text style={s.messageText}>{app.message}</Text>
                    </View>
                  )}

                  {/* History Review Reason */}
                  {app.reviewReason && (
                    <View style={s.reasonBox}>
                      <Text style={s.reasonLabel}>REJECTION REASON:</Text>
                      <Text style={s.reasonText}>{app.reviewReason}</Text>
                    </View>
                  )}

                  {/* Action Buttons (Pending Only) */}
                  {isPending && (
                    <View style={s.actionRow}>
                      <Button
                        title="Reject"
                        variant="secondary"
                        small
                        disabled={actionLoading === app._id}
                        onPress={() => setRejectingApp(app)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Accept into Team"
                        icon="checkmark-circle"
                        small
                        loading={actionLoading === app._id}
                        onPress={() => handleAccept(app)}
                        style={{ flex: 2 }}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </ModalSheet>

      {/* Rejection Reason Modal */}
      {rejectingApp && (
        <ModalSheet
          visible={!!rejectingApp}
          onClose={() => {
            setRejectingApp(null);
            setRejectionReason("");
          }}
          title="Reject Application"
        >
          <View style={{ gap: spacing.md }}>
            <Text style={s.rejectPrompt}>
              Optionally provide feedback or a reason for not accepting {rejectingApp.applicantName} for the "{rejectingApp.roleName}" role:
            </Text>

            <TextInput
              style={s.reasonInput}
              placeholder="e.g. Position filled, need more backend experience, etc."
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
              <Button
                title="Cancel"
                variant="secondary"
                small
                onPress={() => {
                  setRejectingApp(null);
                  setRejectionReason("");
                }}
                style={{ flex: 1 }}
              />
              <Button
                title="Confirm Rejection"
                variant="danger"
                icon="close-circle"
                small
                loading={actionLoading === rejectingApp._id}
                onPress={handleReject}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </ModalSheet>
      )}
    </>
  );
}

const s = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  candidateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  candidateEmail: {
    fontSize: 11,
    color: colors.textMuted,
  },
  appliedRoleText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  dateText: {
    fontSize: 10,
    color: colors.textFaint,
  },
  statsBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  statCol: {
    alignItems: "center",
    gap: 2,
  },
  statVal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  statLbl: {
    fontSize: 10,
    color: colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  verifiedSkillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.success + "15",
    borderWidth: 1,
    borderColor: colors.success + "44",
  },
  badgeChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.success,
  },
  messageBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  messageLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  reasonBox: {
    backgroundColor: colors.danger + "15",
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.danger,
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 12,
    color: colors.danger,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
  },
  rejectPrompt: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  reasonInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    fontSize: 13,
    color: colors.text,
    minHeight: 70,
    textAlignVertical: "top",
  },
});
