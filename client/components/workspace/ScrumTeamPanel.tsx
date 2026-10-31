/**
 * client/components/workspace/ScrumTeamPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM TEAM & CAPACITY INTELLIGENCE
 *
 * FIX 2 RESTORATION:
 *   1. Scrum Roles Roster (Scrum Master, Product Owner, Developers)
 *   2. Waterfall-Quality Member Profile with Verified Skill Badges
 *   3. Authoritative Skill Rating Editor with Stepper (1-10) saving to MongoDB
 *   4. Skill Verification Quiz Modal Integration
 *   5. Feature 5: SkillMatrix Visual Competency Board
 *   6. Deterministic Capacity & Workload Balance
 *   7. Branch & Bound Assignment Suggestions (Advisory only)
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useToast, ModalSheet } from "@/components/feedback";
import { Card, SkeletonCard, ProgressBar, Badge, Button, Stepper } from "@/components/ui";
import MemberProfileModal from "@/components/workspace/MemberProfileModal";
import SkillVerificationModal from "@/components/SkillVerificationModal";
import SkillMatrix, { type SkillMatrixMember } from "@/components/workspace/SkillMatrix";
import { fetchScrumCapacity } from "@/services/scrumApiService";
import { colors, spacing, radius, font } from "@/theme";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"] as const;
const SHORT: Record<string, string> = {
  frontend: "FE",
  backend: "BE",
  devops: "Ops",
  design: "UX",
  ml: "ML",
  testing: "QA",
};

interface ScrumTeamPanelProps {
  teamId: string;
}

export default function ScrumTeamPanel({ teamId }: ScrumTeamPanelProps) {
  const { user, token } = useAuth();
  const toast = useToast();
  const { team, updateMemberSkills, refetch } = useTeam(teamId);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] = useState<any>(null);

  // Skill Editor & Quiz States (Fix 2: Persisted Member Skill Management)
  const [editingSkillsMember, setEditingSkillsMember] = useState<any>(null);
  const [skillDraft, setSkillDraft] = useState<Record<string, number>>({});
  const [savingSkills, setSavingSkills] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizSkill, setQuizSkill] = useState("frontend");

  const loadData = useCallback(async () => {
    try {
      const res = await fetchScrumCapacity(teamId, token);
      setData(res);
    } catch (err: any) {
      toast(err.message || "Failed to load Scrum team capacity", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, token, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    if (refetch) refetch();
  };

  const members = data?.members || [];
  const capacity = data?.capacity || {
    totalCapacityHours: members.reduce((sum: number, m: any) => sum + (m.capacityHours || m.capacity || 40), 0),
    totalCommittedHours: 0,
    utilizationPct: 0,
    overloadCount: 0,
    backlogHours: 0,
    backlogStoryCount: 0,
    activeSprintName: null,
  };
  const skillGaps = data?.skillGaps || [];
  const suggestions = data?.balancingSuggestions || [];

  const currentUserId = (user?._id || user?.id)?.toString();
  const currentUserEmail = (user?.email || "").toLowerCase().trim();
  const currentUserName = (user?.name || "").toLowerCase().trim();

  const isLeader = Boolean(
    user && team && (
      ((team as any)?.leaderId && (team as any).leaderId.toString() === currentUserId) ||
      user.role === "leader" ||
      user.role === "admin"
    )
  );

  // SkillMatrix member mapper
  const matrixMembers: SkillMatrixMember[] = useMemo(() => {
    return members.map((m: any) => ({
      userId: m.userId || m.id || "",
      name: m.name || "Member",
      avatar: m.avatar || null,
      skills: m.skills || {},
    }));
  }, [members]);

  const openSkillEdit = (m: any) => {
    const currentSkills: Record<string, number> = {};
    for (const k of SKILLS) {
      currentSkills[k] = m.skills?.[k] ?? 5;
    }
    setSkillDraft(currentSkills);
    setEditingSkillsMember(m);
  };

  // Authoritative Save Ratings directly persisting to MongoDB via PATCH /api/teams/:teamId/members/:userId/skills
  const handleSaveSkills = async () => {
    if (!editingSkillsMember) return;
    const targetUserId = editingSkillsMember.userId || (editingSkillsMember as any)._id || "";
    if (!targetUserId) {
      toast("Unable to identify team member.", "error");
      return;
    }
    setSavingSkills(true);
    const { error } = await updateMemberSkills(targetUserId, skillDraft);
    setSavingSkills(false);
    if (error) {
      toast(error, "error");
      return;
    }
    toast("Your skill ratings have been saved!", "success");
    setEditingSkillsMember(null);
    await loadData();
    if (refetch) refetch();
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. Capacity Hero Card ──────────────────────────────────────────── */}
      <View style={s.heroCard}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={s.heroTitle}>Sprint Capacity & Load Intelligence</Text>
            {capacity.activeSprintName ? (
              <Badge label={`Sprint: ${capacity.activeSprintName}`} variant="primary" size="sm" />
            ) : (
              <Badge label="Planning (No Active Sprint)" variant="neutral" size="sm" />
            )}
          </View>
          <Text style={s.heroSub}>
            Deterministic workload distribution across {members.length} team members.
            {!capacity.activeSprintName && " Sprint committed effort is 0h until a sprint is started."}
          </Text>
        </View>

        <View style={s.heroStats}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{capacity.totalCapacityHours}h</Text>
            <Text style={s.statLbl}>Available</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{capacity.totalCommittedHours}h</Text>
            <Text style={s.statLbl}>Sprint Committed</Text>
          </View>
          <View style={s.statBox}>
            <Text
              style={[
                s.statNum,
                capacity.utilizationPct > 100 && { color: "#dc2626" },
              ]}
            >
              {capacity.utilizationPct}%
            </Text>
            <Text style={s.statLbl}>Utilization</Text>
          </View>
        </View>
      </View>

      {/* ── Backlog Work Summary (Uncommitted) ──────────────────────────────── */}
      {!capacity.activeSprintName && (capacity.backlogHours > 0 || capacity.backlogStoryCount > 0) && (
        <View style={s.backlogMetaCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="file-tray-full-outline" size={16} color={colors.primary} />
            <Text style={s.backlogMetaTitle}>Candidate Product Backlog Scope</Text>
          </View>
          <Text style={s.backlogMetaTxt}>
            {capacity.backlogHours} estimated hours across {capacity.backlogStoryCount} stories currently in Product Backlog awaiting sprint selection.
          </Text>
        </View>
      )}

      {/* ── 2. Team Member Roster & Capacity Bars ──────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Ionicons name="people" size={16} color={colors.primary} />
          <Text style={s.cardTitle}>Scrum Roles & Individual Load</Text>
          <Text style={s.cardSubRight}>Tap member to view profile & skills</Text>
        </View>

        <View style={s.memberList}>
          {members.map((m: any, mIdx: number) => {
            const isOverloaded = (m.utilizationPct || 0) > 100;
            const memberSkills = Array.isArray(m.verifiedSkills) && m.verifiedSkills.length > 0
              ? m.verifiedSkills
              : Array.isArray(m.skills)
                ? m.skills
                : typeof m.skills === "object" && m.skills !== null
                  ? Object.entries(m.skills).filter(([, v]) => (v as number) >= 5).map(([k]) => k.toUpperCase())
                  : ["DEVELOPER"];

            return (
              <Pressable
                key={m.id || m.userId || mIdx}
                onPress={() => setSelectedProfileMember(m)}
                style={s.memberItem}
              >
                <View style={s.memberTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>
                        {(m.name || "U").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.memberName}>{m.name}</Text>
                      <Text style={s.memberRole}>{m.role || "Developer"}</Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={[
                        s.memberHours,
                        isOverloaded && { color: "#dc2626" },
                      ]}
                    >
                      {m.committedHours || m.allocatedHours || 0}h / {m.capacityHours || 40}h
                    </Text>
                    <Text style={s.memberPct}>{m.utilizationPct || 0}% loaded</Text>
                  </View>
                </View>

                {/* Capacity progress bar */}
                <ProgressBar
                  value={m.utilizationPct || 0}
                  color={isOverloaded ? "#dc2626" : colors.primary}
                  height={6}
                />

                {/* Member Verified Skills */}
                <View style={s.skillRow}>
                  <Text style={s.skillHead}>Verified Skills:</Text>
                  {memberSkills.map((sk: string) => (
                    <View key={sk} style={s.skillChip}>
                      <Text style={s.skillTxt}>{sk}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── 3. Visual Skill Matrix Board (Fix 2 Parity) ─────────────────────── */}
      <View style={{ marginTop: 4 }}>
        <SkillMatrix
          members={matrixMembers}
          currentUserId={currentUserId}
          onEditMember={(m: SkillMatrixMember) => {
            const fullMem = members.find((cand: any) => (cand.userId || cand.id) === m.userId) || m;
            openSkillEdit(fullMem);
          }}
          onViewMemberProfile={(m: SkillMatrixMember) => {
            const fullMem = members.find((cand: any) => (cand.userId || cand.id) === m.userId) || m;
            setSelectedProfileMember(fullMem);
          }}
        />
      </View>

      {/* ── 4. Skill Gap Analysis (Prompt 11 & Fix 2) ───────────────────────── */}
      {skillGaps.length > 0 ? (
        <View style={s.warnCard}>
          <View style={s.warnHead}>
            <Ionicons name="alert-circle" size={18} color="#b45309" />
            <Text style={s.warnTitle}>Sprint Skill Gaps Detected</Text>
          </View>
          <Text style={s.warnSub}>
            Some candidate backlog items require competencies not currently verified on this team:
          </Text>
          <View style={{ gap: 8, marginTop: 6 }}>
            {skillGaps.map((gap: any, i: number) => (
              <View key={i} style={s.gapRow}>
                <Ionicons name="chevron-forward" size={14} color="#b45309" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.gapTxt}>
                    <Text style={{ fontWeight: "700" }}>{gap.skill}</Text>
                    {gap.taskTitle && String(gap.taskTitle).trim() ? ` — needed for "${String(gap.taskTitle).trim()}"` : ""}
                  </Text>
                  {gap.missingCapability && (
                    <Text style={s.gapDetail}>{gap.missingCapability} ({gap.basis || "Requirement"})</Text>
                  )}
                  {gap.action && (
                    <Text style={s.gapAction}>Action: {gap.action}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={s.safeSkillCard}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" />
          <Text style={s.safeSkillTxt}>
            All candidate tasks align with currently verified team skill profiles.
          </Text>
        </View>
      )}

      {/* ── 5. Branch & Bound Balancing Advisory ───────────────────────────── */}
      {suggestions.length > 0 && (
        <View style={s.adviseCard}>
          <View style={s.adviseHead}>
            <Ionicons name="git-branch" size={16} color="#4f46e5" />
            <Text style={s.adviseTitle}>Branch & Bound Workload Advisory</Text>
          </View>
          <Text style={s.adviseDesc}>
            Algorithmic recommendations to balance hours and avoid bottlenecks. (Non-automatic).
          </Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {suggestions.map((sug: any, i: number) => (
              <View key={i} style={s.sugItem}>
                <Ionicons name="bulb-outline" size={16} color="#4f46e5" />
                <Text style={s.sugTxt}>{sug.message || sug.reason}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Member Profile Modal (Fix 2: Professional Profile & Quiz Navigation) ── */}
      <MemberProfileModal
        visible={!!selectedProfileMember}
        onClose={() => setSelectedProfileMember(null)}
        member={selectedProfileMember}
        teamId={teamId}
        isSelf={Boolean(
          selectedProfileMember && (
            (selectedProfileMember.userId && currentUserId && selectedProfileMember.userId === currentUserId) ||
            (currentUserEmail && selectedProfileMember.name && selectedProfileMember.name.toLowerCase().trim() === currentUserEmail) ||
            (currentUserName && selectedProfileMember.name && selectedProfileMember.name.toLowerCase().trim() === currentUserName)
          )
        )}
        isLeader={isLeader}
        onEditSkills={() => {
          if (selectedProfileMember) {
            openSkillEdit(selectedProfileMember);
            setSelectedProfileMember(null);
          }
        }}
        onVerifySkill={(sk?: string) => {
          if (sk) setQuizSkill(sk);
          setShowQuizModal(true);
        }}
      />

      {/* ── Edit Skills Modal (Fix 2: Persisted Skill Rating Editor) ── */}
      <ModalSheet
        visible={!!editingSkillsMember}
        onClose={() => setEditingSkillsMember(null)}
        title={`Edit Skills — ${editingSkillsMember?.name || "Member"}`}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Update individual competency ratings (1–10). Ratings directly drive capacity balance and Branch & Bound sprint recommendations.
          </Text>

          <View style={{ gap: spacing.sm }}>
            {SKILLS.map((k) => {
              const val = skillDraft[k] ?? 5;
              const label = k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 }}>
                  <View style={{ width: 95 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{SHORT[k] || k} · {val}/10</Text>
                  </View>
                  <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ width: `${val * 10}%`, height: "100%", backgroundColor: colors.branch }} />
                  </View>
                  <Stepper
                    value={val}
                    min={1}
                    max={10}
                    onChange={(nv) => setSkillDraft((prev) => ({ ...prev, [k]: Math.max(1, Math.min(10, nv)) }))}
                  />
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setEditingSkillsMember(null)}
              style={{ flex: 1 }}
            />
            <Button
              title="Save Ratings"
              icon="checkmark"
              loading={savingSkills}
              onPress={handleSaveSkills}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </ModalSheet>

      {/* ── Skill Verification Modal (Take Quiz) ── */}
      <SkillVerificationModal
        visible={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        skill={quizSkill}
        onVerified={(verifiedSkill?: string) => {
          toast(`${verifiedSkill || quizSkill} is now verified on your profile!`, "success");
          setShowQuizModal(false);
          loadData();
          if (refetch) refetch();
        }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 100,
  },
  loadingWrap: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: spacing.md,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1c1917",
  },
  heroSub: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  heroStats: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#f5f5f4",
    paddingTop: spacing.sm,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statNum: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  statLbl: {
    fontSize: 11,
    color: "#78716c",
    marginTop: 2,
  },
  backlogMetaCard: {
    backgroundColor: "#f8fafc",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 4,
  },
  backlogMetaTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  backlogMetaTxt: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#1c1917",
    flex: 1,
  },
  cardSubRight: {
    fontSize: 11,
    color: colors.textMuted,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberItem: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "#f5f5f4",
    gap: 8,
  },
  memberTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  memberName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberRole: {
    fontSize: 11,
    color: "#78716c",
  },
  memberHours: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1c1917",
  },
  memberPct: {
    fontSize: 10.5,
    color: "#78716c",
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  skillHead: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#78716c",
    marginRight: 4,
  },
  skillChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  skillTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803d",
  },
  warnCard: {
    backgroundColor: "#fffbeb",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: spacing.md,
    gap: 6,
  },
  warnHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warnTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#b45309",
  },
  warnSub: {
    fontSize: 12,
    color: "#92400e",
  },
  gapRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 2,
  },
  gapTxt: {
    fontSize: 12.5,
    color: "#78350f",
  },
  gapDetail: {
    fontSize: 11,
    color: "#b45309",
  },
  gapAction: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  safeSkillCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  safeSkillTxt: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#15803d",
    flex: 1,
  },
  adviseCard: {
    backgroundColor: "#f5f3ff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    padding: spacing.md,
    gap: 6,
  },
  adviseHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adviseTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#4f46e5",
  },
  adviseDesc: {
    fontSize: 11.5,
    color: "#6366f1",
  },
  sugItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  sugTxt: {
    fontSize: 12,
    color: "#312e81",
    flex: 1,
    lineHeight: 16,
  },
});
