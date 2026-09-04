/**
 * MemberProfileModal.tsx — FIX 3: Professional Team Member Information & Permissions.
 *
 * Displays rich, privacy-respecting profile data:
 * - Email and human-readable roles (team & project)
 * - Verified skill badges with percentage scores and verification timestamps
 * - Account-level profile skills
 * - Workspace skill ratings (1–10)
 *
 * Enforces clear permission boundaries:
 * - Self: Indicates "Your Profile", allows editing ratings and taking verification quiz
 * - Teammate: Explicitly marked "Read-Only Teammate Profile", locked from cross-user editing
 * - Leader Actions: Allows authorized team leaders to remove teammates with reason confirmation
 */

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Badge, Avatar } from "@/components/ui";
import { ModalSheet } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";
import type { TeamMember } from "@/hooks/useTeam";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"] as const;

interface VerifiedSkillBadge {
  skill: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  verified: boolean;
  verifiedAt?: string;
}

interface MemberProfileData {
  userId: string;
  name: string;
  email: string;
  teamRole: string;
  projectRole: string;
  skills: Record<string, number>;
  profileSkills: string[];
  verifiedSkills: VerifiedSkillBadge[];
  isOwner: boolean;
}

interface MemberProfileModalProps {
  visible: boolean;
  onClose: () => void;
  member: TeamMember | null;
  teamId: string;
  isSelf: boolean;
  isLeader: boolean;
  onEditSkills?: () => void;
  onVerifySkill?: () => void;
  onRemoveMember?: (member: TeamMember) => void;
}

export default function MemberProfileModal({
  visible,
  onClose,
  member,
  teamId,
  isSelf,
  isLeader,
  onEditSkills,
  onVerifySkill,
  onRemoveMember,
}: MemberProfileModalProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<MemberProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !member || !teamId) {
      setProfile(null);
      setError(null);
      return;
    }

    const mId = member.userId || (member as any)._id;
    if (!mId) return;

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}/api/teams/${teamId}/members/${mId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load member profile");
        if (active) {
          setProfile(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Unable to fetch member profile");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible, member, teamId, token]);

  if (!member) return null;

  const displayName = profile?.name || member.name || "Team Member";
  const displayEmail = profile?.email || "";
  const displayRole = profile?.teamRole || member.role || "member";
  const roleLabel =
    displayRole === "leader"
      ? "Team Leader"
      : displayRole === "manager"
      ? "Project Manager"
      : "Team Member";

  const skillValues = profile?.skills || member.skills || {};
  const verifiedSkills = profile?.verifiedSkills || [];
  const profileSkills = profile?.profileSkills || [];
  const isOwner = profile?.isOwner ?? false;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={isSelf ? "Your Workspace Profile" : "Member Profile"}
    >
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {/* Header with Avatar, Name, Email, and Role */}
        <View style={s.headCard}>
          <Avatar name={displayName} size={54} image={member.avatar} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <Text style={font.h3}>{displayName}</Text>
              {isSelf && (
                <Badge label="You" color={colors.primary} bg={colors.primarySoft} />
              )}
              <Badge
                label={roleLabel}
                color={displayRole === "leader" ? colors.primary : colors.accentDark}
                bg={displayRole === "leader" ? colors.primarySoft : colors.accentSoft}
              />
            </View>

            {displayEmail ? (
              <View style={s.emailRow}>
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <Text style={s.emailTxt} numberOfLines={1}>{displayEmail}</Text>
              </View>
            ) : null}

            <Text style={s.profileHint}>
              {isSelf
                ? "Manage your skill profile and verified badges."
                : "Teammate profile details (read-only)."}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.loadingTxt}>Loading profile & verified badges…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        ) : null}

        {/* Section 1: Verified Skills & Badges */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="shield-checkmark" size={16} color={colors.success} />
              <Text style={s.sectionTitle}>VERIFIED SKILLS & BADGES</Text>
            </View>
            {isSelf && onVerifySkill && (
              <Pressable onPress={onVerifySkill} hitSlop={6} style={s.actionBtn}>
                <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                <Text style={s.actionBtnTxt}>Take Quiz</Text>
              </Pressable>
            )}
          </View>

          {verifiedSkills.length > 0 ? (
            <View style={s.badgeGrid}>
              {verifiedSkills.map((v) => (
                <View key={v.skill} style={s.verifiedBadgeCard}>
                  <View style={s.badgeIconCircle}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.badgeSkillName}>{v.skill}</Text>
                    <Text style={s.badgeSub}>
                      {v.percentage}% · Score {v.score}/{v.totalQuestions}
                    </Text>
                  </View>
                  <Badge label="Verified" color={colors.success} bg={colors.successSoft} />
                </View>
              ))}
            </View>
          ) : (
            <View style={s.emptyNotice}>
              <Ionicons name="school-outline" size={18} color={colors.textFaint} />
              <Text style={s.emptyNoticeTxt}>
                {isSelf
                  ? "You haven't verified any skills yet. Take a 5-question quiz to earn a verified badge!"
                  : "No verified skills recorded yet for this teammate."}
              </Text>
            </View>
          )}
        </View>

        {/* Section 2: Account Profile Skills (if any) */}
        {profileSkills.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>PROFILE SKILLS</Text>
            <View style={s.chipRow}>
              {profileSkills.map((sk) => (
                <View key={sk} style={s.profileChip}>
                  <Text style={s.profileChipTxt}>{sk}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Section 3: Workspace Skill Ratings (1–10) */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name={isSelf ? "options-outline" : "lock-closed-outline"}
                size={16}
                color={colors.textMuted}
              />
              <Text style={s.sectionTitle}>
                {isSelf ? "YOUR SKILL RATINGS (1–10)" : "SKILL RATINGS (READ-ONLY)"}
              </Text>
            </View>
            {isSelf && onEditSkills && (
              <Pressable onPress={onEditSkills} hitSlop={6} style={s.actionBtn}>
                <Ionicons name="pencil" size={13} color={colors.primary} />
                <Text style={s.actionBtnTxt}>Edit Ratings</Text>
              </Pressable>
            )}
          </View>

          <View style={{ gap: 8 }}>
            {SKILLS.map((k) => {
              const val = skillValues[k] ?? 5;
              const label =
                k === "ml"
                  ? "ML / AI"
                  : k === "devops"
                  ? "DevOps / Ops"
                  : k === "design"
                  ? "Design / UX"
                  : k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <View key={k} style={s.skillRow}>
                  <Text style={s.skillLabel}>{label}</Text>
                  <View style={s.skillBarTrack}>
                    <View style={[s.skillBarFill, { width: `${val * 10}%` }]} />
                  </View>
                  <Text style={s.skillVal}>{val}/10</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Section 4: Leader Actions (Removal) */}
        {isLeader && !isSelf && !isOwner && onRemoveMember && (
          <View style={s.dangerCard}>
            <View style={s.dangerHead}>
              <Ionicons name="shield-outline" size={16} color={colors.danger} />
              <Text style={s.dangerTitle}>Leader Management Actions</Text>
            </View>
            <Text style={s.dangerTxt}>
              As workspace leader, you can remove this member from the team. Tasks assigned to them will be unassigned, and an audit record will be logged.
            </Text>
            <Button
              title="Remove from Workspace"
              variant="danger"
              icon="trash-outline"
              small
              onPress={() => onRemoveMember(member)}
              style={{ marginTop: 4 }}
            />
          </View>
        )}

        <Button
          title="Close"
          variant="secondary"
          onPress={onClose}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.lg },

  headCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emailTxt: { fontSize: 13, color: colors.textMuted },
  profileHint: { fontSize: 11, color: colors.textFaint, marginTop: 2 },

  loadingBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
  loadingTxt: { fontSize: 12, color: colors.textMuted },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
  },
  errorTxt: { fontSize: 12, color: colors.danger, flex: 1 },

  section: { gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.6,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtnTxt: { fontSize: 12, fontWeight: "700", color: colors.primary },

  badgeGrid: { gap: 8 },
  verifiedBadgeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.success,
  },
  badgeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSkillName: { fontSize: 13, fontWeight: "700", color: colors.text },
  badgeSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  emptyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyNoticeTxt: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  profileChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileChipTxt: { fontSize: 12, fontWeight: "600", color: colors.text },

  skillRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  skillLabel: { width: 90, fontSize: 12, fontWeight: "600", color: colors.textMuted },
  skillBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  skillBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.branch },
  skillVal: { width: 36, fontSize: 12, fontWeight: "700", color: colors.text, textAlign: "right" },

  dangerCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: 8,
  },
  dangerHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dangerTitle: { fontSize: 12, fontWeight: "800", color: colors.danger },
  dangerTxt: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
