/**
 * client/components/workspace/ScrumTeamPanel.tsx
 * ============================================================================
 * NEXUSFLOW V4 — RESTORED SCRUM TEAM & MEMBER ASSIGNMENT EXPERIENCE
 *
 * Full Waterfall-style parity adapted for Scrum:
 *   1. Member Assignment header with Branch & Bound algorithm identification & complexity
 *   2. Invite Teammate / Add Member action with email invitations and role selection
 *   3. Run Assignment (Branch & Bound on active sprint / candidate backlog work)
 *   4. Open Roles management & Leader Applications review panel
 *   5. Discovery toggle (Public / Private workspace)
 *   6. Team Roster with real MongoDB members: View, Edit, Expand, Capacity, and Leader Removal
 *   7. Skill Matrix with 1–10 ratings, Edit My Skills modal, and verified badges
 *   8. Assignment Results with B&B pruning stats, member assignment cards, and Accept Assign actions
 *   9. Real-time synchronization with Scrum Insights → Capability via authoritative MongoDB state
 *  10. Cost Matrix (Members × Tasks) with skill-gap penalties
 *  11. Workspace Membership controls (Leave Team for members, Delete Team for owner)
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  TextInput,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTeam, type AssignResult } from "@/hooks/useTeam";
import type { TeamMember } from "@/hooks/useTeams";
import { Card, Button, Badge, Avatar, EmptyState, Field, Stepper, ProgressBar } from "@/components/ui";
import { ModalSheet, useToast, useConfirm } from "@/components/feedback";
import SkillMatrix, { type SkillMatrixMember } from "@/components/workspace/SkillMatrix";
import MemberProfileModal from "@/components/workspace/MemberProfileModal";
import SkillVerificationModal from "@/components/SkillVerificationModal";
import OpenRolesManagerModal from "@/components/workspace/OpenRolesManagerModal";
import LeaderApplicationsPanel from "@/components/workspace/LeaderApplicationsPanel";
import { WhyButton, AlgoExplainSheet, type AlgoEntry } from "@/components/AlgoExplain";
import { fetchScrumCapacity, acceptScrumAssignment } from "@/services/scrumApiService";
import { API_BASE_URL } from "@/utils/api";
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

const LEAVE_REASONS = [
  { id: "project_completed", label: "Project completed" },
  { id: "no_longer_working", label: "No longer working on this project" },
  { id: "team_changed",      label: "Team/project changed" },
  { id: "not_needed",        label: "Don't need access anymore" },
  { id: "technical_issues",  label: "Technical issues" },
  { id: "other",             label: "Other" },
];

const REMOVE_REASONS = [
  { id: "inactive",     label: "Inactive / Non-responsive" },
  { id: "role_change",  label: "Role reassigned or no longer needed" },
  { id: "performance",  label: "Skills mismatch or performance issue" },
  { id: "scope_change", label: "Project scope changed" },
  { id: "other",        label: "Other reason" },
];

export default function ScrumTeamPanel({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const {
    team,
    members,
    loading,
    addMember,
    deleteMember,
    updateMember,
    updateMemberSkills,
    runAssignment,
    inviteMemberByEmail,
    leaveTeam,
    deleteTeam,
    refetch,
  } = useTeam(teamId);

  // Scrum Capacity & Sprint Data
  const [capacityData, setCapacityData] = useState<any>(null);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Assignment & B&B Result State
  const [result, setResult] = useState<AssignResult | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState<string | null>(null);

  // Roster & Navigation State
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);

  // Invitation State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Skill Editor & Quiz States
  const [editingSkillsMember, setEditingSkillsMember] = useState<TeamMember | null>(null);
  const [skillDraft, setSkillDraft] = useState<Record<string, number>>({});
  const [savingSkills, setSavingSkills] = useState(false);
  const [viewingProfileMember, setViewingProfileMember] = useState<TeamMember | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Leader Member Removal State
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removeReasonCategory, setRemoveReasonCategory] = useState("inactive");
  const [removeExplanation, setRemoveExplanation] = useState("");
  const [removingMember, setRemovingMember] = useState(false);

  // Leave Team & Delete Team States
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveReason, setLeaveReason] = useState("project_completed");
  const [leaveExplanation, setLeaveExplanation] = useState("");
  const [leaving, setLeaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Discovery & Open Roles
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showAppsModal, setShowAppsModal] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(Boolean(team?.isDiscoverable));
  const [togglingDiscoverable, setTogglingDiscoverable] = useState(false);

  useEffect(() => {
    if (team?.isDiscoverable !== undefined) {
      setIsDiscoverable(Boolean(team.isDiscoverable));
    }
  }, [team?.isDiscoverable]);

  const loadCapacity = useCallback(async () => {
    try {
      setLoadingCapacity(true);
      const res = await fetchScrumCapacity(teamId, token);
      setCapacityData(res);
    } catch {
      // Graceful fallback
    } finally {
      setLoadingCapacity(false);
      setRefreshing(false);
    }
  }, [teamId, token]);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadCapacity()]);
  };

  const currentUserId = (user?._id || user?.id)?.toString();
  const currentUserName = (user?.name || "").toLowerCase().trim();
  const currentUserEmail = (user?.email || "").toLowerCase().trim();

  const myMember = useMemo(() => {
    return members.find((m) => {
      const mId = (m.userId || (m as any)._id)?.toString();
      const mName = (m.name || "").toLowerCase().trim();
      return (
        (mId && currentUserId && mId === currentUserId) ||
        (currentUserEmail && mName === currentUserEmail) ||
        (currentUserName && mName === currentUserName)
      );
    });
  }, [members, currentUserId, currentUserEmail, currentUserName]);

  const isOwner = Boolean(
    team?.ownerId && currentUserId && team.ownerId.toString() === currentUserId
  );
  const isLeader = Boolean(
    isOwner ||
    user?.role === "leader" ||
    user?.role === "admin" ||
    (myMember && ["owner", "leader", "team leader", "manager", "project manager", "scrum master"].includes((myMember.role || "").toLowerCase()))
  );

  const toggleDiscoverable = async () => {
    if (!teamId) return;
    setTogglingDiscoverable(true);
    try {
      const nextVal = !isDiscoverable;
      const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/discovery`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isDiscoverable: nextVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update discovery settings.");
      setIsDiscoverable(nextVal);
      toast(nextVal ? "Scrum workspace is now discoverable!" : "Scrum workspace is now private.", "success");
      refetch();
    } catch (err: any) {
      toast(err.message || "Failed to update discovery.", "error");
    } finally {
      setTogglingDiscoverable(false);
    }
  };

  const openSkillEdit = (m: TeamMember) => {
    const currentSkills: Record<string, number> = {};
    for (const k of SKILLS) {
      currentSkills[k] = m.skills?.[k] ?? 5;
    }
    setSkillDraft(currentSkills);
    setEditingSkillsMember(m);
  };

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
    await Promise.all([refetch(), loadCapacity()]);
  };

  const run = async (opts?: { silent?: boolean }) => {
    setRunning(true);
    const { result: r, error } = await runAssignment();
    setRunning(false);
    if (error) {
      setResult(null);
      toast(error, opts?.silent ? "info" : "error");
      return;
    }
    setResult(r!);
    setResultVersion((v) => v + 1);
    if (!opts?.silent) toast("Optimal task assignment computed via Branch & Bound!", "success");
    loadCapacity();
  };

  const handleAcceptSingleAssignment = async (taskId: string, memberId: string) => {
    if (acceptingTaskId) return;
    setAcceptingTaskId(taskId);
    try {
      await acceptScrumAssignment(teamId, taskId, memberId, token);
      toast("Assignment accepted and synchronized with Scrum Insights!", "success");
      await Promise.all([refetch(), loadCapacity()]);
    } catch (err: any) {
      toast(err.message || "Failed to accept assignment", "error");
    } finally {
      setAcceptingTaskId(null);
    }
  };

  const onInviteTeammate = async () => {
    if (!inviteEmail.trim()) { toast("Email address is required", "error"); return; }
    setInviting(true);
    const { error, message } = await inviteMemberByEmail(inviteEmail.trim(), inviteRole);
    setInviting(false);
    if (error) { toast(error, "error"); return; }
    toast(message || `Invitation sent to ${inviteEmail.trim()}`, "success");
    setInviteEmail(""); setInviteRole("member"); setShowAdd(false);
    refetch();
  };

  const onDeleteMember = (m: TeamMember) => {
    if (!isLeader) {
      toast("Only team leaders can remove workspace members.", "error");
      return;
    }
    setMemberToRemove(m);
    setRemoveReasonCategory("inactive");
    setRemoveExplanation("");
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    const targetUserId = memberToRemove.userId || (memberToRemove as any)._id;
    if (!targetUserId) {
      toast("Unable to identify team member.", "error");
      return;
    }

    const categoryObj = REMOVE_REASONS.find((r) => r.id === removeReasonCategory);
    const fullReason = removeExplanation.trim()
      ? `${categoryObj?.label || "Leader removal"}: ${removeExplanation.trim()}`
      : categoryObj?.label || "Removed by workspace leader";

    setRemovingMember(true);
    setRemovingId(targetUserId);
    const { error } = await deleteMember(targetUserId, fullReason);
    setRemovingMember(false);
    setRemovingId(null);

    if (error) {
      toast(error, "error");
      return;
    }

    toast(`${memberToRemove.name || "Member"} removed from workspace`, "info");
    if (expanded === targetUserId) setExpanded(null);
    setMemberToRemove(null);
    setViewingProfileMember(null);
    await Promise.all([refetch(), loadCapacity()]);
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) { toast("Name required", "error"); return; }
    const { error } = await updateMember(editing.userId, { name: editName.trim() });
    if (error) { toast(error, "error"); return; }
    toast("Member updated", "success");
    setEditing(null);
    refetch();
  };

  const handleLeaveTeam = async () => {
    setLeaving(true);
    const { error } = await leaveTeam(leaveReason, leaveExplanation);
    setLeaving(false);
    if (error) {
      toast(error, "error");
      return;
    }
    toast("You have left the workspace.", "info");
    setShowLeaveModal(false);
    router.replace("/dashboard");
  };

  const handleDeleteTeam = async () => {
    if (deleteConfirmInput.trim() !== team?.name) {
      toast(`Please type "${team?.name}" to confirm workspace deletion.`, "error");
      return;
    }
    setDeleting(true);
    const { error } = await deleteTeam();
    setDeleting(false);
    if (error) {
      toast(error, "error");
      return;
    }
    toast(`Workspace "${team?.name}" has been permanently deleted.`, "info");
    setShowDeleteModal(false);
    router.replace("/dashboard");
  };

  const memberById = (id: string) => members.find((m) => m.userId === id || (m as any)._id === id);
  const topSkillOf = (id: string) => {
    const m = memberById(id);
    if (!m) return null;
    return SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort((a, b) => b.v - a.v)[0];
  };

  // Group assignments by member
  const byMember = new Map<string, { name: string; tasks: { taskId: string; title: string; cost: number }[] }>();
  for (const a of result?.assignments ?? []) {
    if (!byMember.has(a.memberId)) byMember.set(a.memberId, { name: a.memberName, tasks: [] });
    byMember.get(a.memberId)!.tasks.push({ taskId: a.taskId, title: a.taskTitle, cost: a.cost });
  }

  // Active Sprint context
  const activeSprintName = capacityData?.capacity?.activeSprintName;

  if (loading) return <EmptyState icon="hourglass-outline" title="Loading Scrum roster…" />;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ── 1. Member Assignment Header ───────────────────────────────────────── */}
      <Card style={{ gap: spacing.sm }}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: colors.branch + "1a" }]}>
            <Ionicons name="people" size={20} color={colors.branch} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>Member Assignment</Text>
            <Text style={s.sub}>Branch & Bound · minimises skill-gap cost</Text>
          </View>
          <Badge label="O(n!) pruned" color={colors.branch} />
        </View>

        {activeSprintName ? (
          <View style={s.sprintContextBanner}>
            <Ionicons name="flash-outline" size={15} color="#2563eb" />
            <Text style={s.sprintContextTxt}>
              Active Sprint Scope: <Text style={{ fontWeight: "800" }}>{activeSprintName}</Text> · Optimizing sprint delivery workload
            </Text>
          </View>
        ) : (
          <View style={[s.sprintContextBanner, { backgroundColor: "#f8fafc", borderColor: colors.border }]}>
            <Ionicons name="layers-outline" size={15} color="#64748b" />
            <Text style={[s.sprintContextTxt, { color: "#475569" }]}>
              Product Backlog Scope: Evaluating candidate stories for upcoming sprint planning
            </Text>
          </View>
        )}

        <Text style={s.hint}>
          Give members differentiated skills so the cost matrix is meaningful, then run the engine.
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            title="Invite Teammate"
            icon="person-add"
            variant="secondary"
            onPress={() => setShowAdd(true)}
            style={{ flex: 1 }}
            small
          />
          <Button
            title="Run Assignment"
            icon="git-branch"
            onPress={() => run()}
            loading={running}
            style={{ flex: 1 }}
            small
            disabled={members.length === 0}
          />
        </View>

        {isLeader && (
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
            <Button
              title="Open Roles"
              icon="briefcase-outline"
              variant="ghost"
              onPress={() => setShowRolesModal(true)}
              style={{ flex: 1 }}
              small
            />
            <Button
              title="Applications"
              icon="documents-outline"
              variant="ghost"
              onPress={() => setShowAppsModal(true)}
              style={{ flex: 1 }}
              small
            />
            <Button
              title={isDiscoverable ? "Public" : "Private"}
              icon={isDiscoverable ? "earth" : "lock-closed"}
              variant="ghost"
              loading={togglingDiscoverable}
              onPress={toggleDiscoverable}
              style={{ flex: 1 }}
              small
            />
          </View>
        )}
      </Card>

      {/* Low-resource warning */}
      {members.length === 1 && (
        <View style={s.warnBar}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <Text style={s.warnTxt}>
            Single-person Scrum team: Capacity is strictly grounded in individual availability.
          </Text>
        </View>
      )}

      {/* ── 2. Team Roster ────────────────────────────────────────────────────── */}
      <Text style={s.sectionLabel}>ROSTER ({members.length})</Text>
      {members.length === 0 ? (
        <EmptyState
          icon="person-add-outline"
          title="No team members available."
          message="Invite teammates with distinct skills before running Branch & Bound."
          actionLabel="Invite Teammate"
          actionIcon="person-add"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        members.map((m) => {
          const mUserId = (m.userId || (m as any)._id)?.toString();
          const mName = (m.name || "").toLowerCase().trim();
          const isSelf = Boolean(
            (mUserId && currentUserId && mUserId === currentUserId) ||
            (currentUserEmail && mName === currentUserEmail) ||
            (currentUserName && mName === currentUserName)
          );

          // Find member capacity info from capacityData if available
          const capMember = capacityData?.members?.find(
            (cm: any) => (cm.userId?._id || cm.userId || cm.id)?.toString() === mUserId
          );

          return (
            <ScrumRosterCard
              key={m.userId || (m as any)._id}
              member={m}
              capacityInfo={capMember}
              isSelf={isSelf}
              isLeader={isLeader}
              teamOwnerId={team?.ownerId?.toString()}
              open={expanded === (m.userId || (m as any)._id)}
              removing={removingId === (m.userId || (m as any)._id)}
              onToggle={() =>
                setExpanded(expanded === (m.userId || (m as any)._id) ? null : (m.userId || (m as any)._id))
              }
              onViewProfile={() => setViewingProfileMember(m)}
              onEdit={() => {
                setEditing(m);
                setEditName(m.name ?? "");
              }}
              onDelete={() => onDeleteMember(m)}
            />
          );
        })
      )}

      {/* ── 3. Skill Matrix with 1–10 Ratings ─────────────────────────────────── */}
      {members.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>SKILL MATRIX (1–10 RATINGS)</Text>
              <Text style={s.hint}>
                1 = Beginner · 10 = Expert. Minimizes skill-gap penalty for Scrum stories demanding that skill.
              </Text>
            </View>
            {myMember && (
              <Button
                title="Edit My Skills"
                icon="create-outline"
                variant="secondary"
                small
                onPress={() => openSkillEdit(myMember)}
              />
            )}
          </View>

          <SkillMatrix
            members={members as SkillMatrixMember[]}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onEditMember={(m) => openSkillEdit(m as TeamMember)}
            onViewMemberProfile={(m) => setViewingProfileMember(m as TeamMember)}
          />
        </Card>
      )}

      {/* ── 4. Branch & Bound Assignment Results ──────────────────────────────── */}
      {result && members.length > 0 && (
        <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
          <View style={s.resultHead}>
            <Text style={s.sectionLabel}>ASSIGNMENT RESULT</Text>
            <WhyButton
              color={colors.branch}
              onPress={() =>
                setExplain([
                  {
                    algo: "branch",
                    input: `${members.length} members × ${result.assignments.length} tasks · skill-gap cost matrix`,
                    output: `Min-cost assignment · total skill gap ${result.totalCost}`,
                    reason: `Branch & Bound explored ${result.meta?.nodesExplored ?? "?"} states and pruned ${result.meta?.nodesPruned ?? "?"} (${result.meta?.pruningRatio ?? "?"}) using an admissible lower bound. Each task goes to the member with the lowest skill gap.`,
                  },
                ])
              }
            />
          </View>

          <Card style={s.statRow}>
            <Metric label="Total cost" value={result.totalCost} color={colors.branch} />
            <Metric label="Explored" value={result.meta?.nodesExplored ?? "—"} color={colors.info} />
            <Metric label="Pruned" value={result.meta?.nodesPruned ?? "—"} color={colors.success} />
            <Metric label="Prune %" value={result.meta?.pruningRatio ?? "—"} color={colors.greedy} />
          </Card>

          {[...byMember.entries()].map(([id, m]) => {
            const top = topSkillOf(id);
            return (
              <Card key={id} style={{ gap: spacing.sm }}>
                <View style={s.memberHead}>
                  <Avatar name={m.name} size={32} image={memberById(id)?.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{m.name}</Text>
                    {top ? <Text style={s.memberSub}>Top skill: {top.k} ({top.v}/10)</Text> : null}
                  </View>
                  <Badge label={`${m.tasks.length} task${m.tasks.length === 1 ? "" : "s"}`} color={colors.branch} />
                </View>
                {m.tasks.length === 0 ? (
                  <Text style={s.hint}>No tasks assigned (surplus capacity).</Text>
                ) : (
                  m.tasks.map((t, idx) => {
                    const isAccepting = acceptingTaskId === t.taskId;
                    return (
                      <View key={t.taskId || idx} style={s.assignBlock}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                            <Text style={s.assignTitle}>{t.title}</Text>
                          </View>
                          <Badge
                            label={t.cost === 0 ? "Perfect fit" : `Gap ${t.cost}`}
                            color={t.cost === 0 ? colors.success : colors.warning}
                          />
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <Text style={s.assignReason}>Skill gap {t.cost} vs requirement demand</Text>
                          <Button
                            title={isAccepting ? "Assigning..." : "Accept Assign"}
                            variant="primary"
                            icon="checkmark"
                            small
                            disabled={isAccepting}
                            onPress={() => handleAcceptSingleAssignment(t.taskId, id)}
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>
            );
          })}

          {/* ── 5. Cost Matrix (Members × Tasks) ──────────────────────────────── */}
          {result.costMatrix && result.memberLabels && result.taskLabels && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={s.sectionLabel}>COST MATRIX (MEMBERS × TASKS)</Text>
              <Text style={s.hint}>Rows = tasks · Cols = members. Cell = skill-gap penalty (0 = ideal match).</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={s.matrixRow}>
                    <View style={[s.matrixCell, s.matrixHeadCell, { width: 150 }]}>
                      <Text style={s.matrixHeadTxt}>Task \ Member</Text>
                    </View>
                    {result.memberLabels.map((lbl, ci) => (
                      <View key={lbl + ci} style={[s.matrixCell, s.matrixHeadCell]}>
                        <Text style={s.matrixHeadTxt} numberOfLines={1}>{lbl}</Text>
                      </View>
                    ))}
                  </View>
                  {result.taskLabels.map((tLbl, ri) => (
                    <View key={tLbl + ri} style={s.matrixRow}>
                      <View style={[s.matrixCell, { width: 150, alignItems: "flex-start", paddingLeft: 6 }]}>
                        <Text style={s.matrixTxt} numberOfLines={1}>{tLbl}</Text>
                      </View>
                      {result.costMatrix[ri]?.map((c, ci) => (
                        <View key={ci} style={[s.matrixCell, c === 0 && { backgroundColor: colors.successSoft }]}>
                          <Text style={[s.matrixTxt, c === 0 && { color: colors.success, fontWeight: "700" }]}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </Card>
          )}
        </View>
      )}

      {/* ── 6. Workspace Membership Management ─────────────────────────────────── */}
      <Card style={{ gap: spacing.sm, marginTop: spacing.md, borderColor: colors.border }}>
        <Text style={s.sectionLabel}>WORKSPACE MEMBERSHIP</Text>
        {isOwner ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Scrum Project Owner</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>You own this Scrum workspace.</Text>
              </View>
            </View>
            <Button
              title="Delete Workspace"
              icon="trash-outline"
              variant="secondary"
              onPress={() => {
                setDeleteConfirmInput("");
                setShowDeleteModal(true);
              }}
              style={{ borderColor: colors.danger + "44", marginTop: 4 }}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.hint}>
              You are a member of this workspace. If you leave, you will lose access to all tasks, sprints, and project information.
            </Text>
            <Button
              title="Leave Team"
              icon="exit-outline"
              variant="secondary"
              onPress={() => {
                setLeaveReason("project_completed");
                setLeaveExplanation("");
                setShowLeaveModal(true);
              }}
              style={{ borderColor: colors.danger + "44" }}
            />
          </View>
        )}
      </Card>

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}

      {/* Edit My Skills ModalSheet */}
      <ModalSheet
        visible={!!editingSkillsMember}
        onClose={() => setEditingSkillsMember(null)}
        title="Edit My Skill Ratings"
      >
        <Text style={s.hint}>
          Adjust your personal skill ratings from 1 (Beginner) to 10 (Expert). The Branch & Bound algorithm uses these ratings to calculate optimal task assignments.
        </Text>

        <View style={{ gap: spacing.md, marginVertical: spacing.md }}>
          {SKILLS.map((k) => {
            const val = skillDraft[k] ?? 5;
            const label =
              k === "ml"
                ? "ML / AI"
                : k === "devops"
                ? "DevOps / Ops"
                : k === "design"
                ? "Design / UX"
                : k.charAt(0).toUpperCase() + k.slice(1);
            return (
              <View key={k} style={s.skillEditRow}>
                <View style={{ width: 100 }}>
                  <Text style={s.skillEditLabel}>{label}</Text>
                  <Text style={s.skillRatingText}>{val}/10</Text>
                </View>
                <View style={s.skillBarTrack}>
                  <View style={[s.skillBarFill, { width: `${val * 10}%`, backgroundColor: colors.branch }]} />
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
      </ModalSheet>

      {/* Member Profile Modal */}
      <MemberProfileModal
        visible={!!viewingProfileMember}
        onClose={() => setViewingProfileMember(null)}
        member={viewingProfileMember}
        teamId={teamId}
        isSelf={Boolean(
          viewingProfileMember && (
            (viewingProfileMember.userId && currentUserId && viewingProfileMember.userId === currentUserId) ||
            (currentUserEmail && viewingProfileMember.name && viewingProfileMember.name.toLowerCase().trim() === currentUserEmail) ||
            (currentUserName && viewingProfileMember.name && viewingProfileMember.name.toLowerCase().trim() === currentUserName)
          )
        )}
        isLeader={isLeader}
        onEditSkills={() => {
          if (viewingProfileMember) {
            openSkillEdit(viewingProfileMember);
            setViewingProfileMember(null);
          }
        }}
        onVerifySkill={() => {
          setShowQuizModal(true);
        }}
        onRemoveMember={(m) => {
          onDeleteMember(m);
        }}
      />

      {/* Skill Verification Quiz Modal */}
      <SkillVerificationModal
        visible={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        skill="JavaScript"
        onVerified={(skill) => {
          toast(`${skill} is now verified on your profile!`, "success");
        }}
      />

      {/* Leader Member Removal Modal */}
      <ModalSheet
        visible={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        title="Remove Member from Workspace"
      >
        {memberToRemove && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={memberToRemove.name || "Member"} size={44} image={memberToRemove.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{memberToRemove.name || "Member"}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  Role: {memberToRemove.role || "Team Member"}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>
              Are you sure you want to remove this member from <Text style={{ fontWeight: "700", color: colors.text }}>{team?.name}</Text>?
              {"\n"}Any tasks assigned to them will be safely returned to unassigned backlog.
            </Text>

            <Text style={s.sectionLabel}>REMOVAL REASON (REQUIRED)</Text>
            <View style={{ gap: 6 }}>
              {REMOVE_REASONS.map((r) => {
                const isSelected = removeReasonCategory === r.id;
                return (
                  <Pressable
                    key={r.id}
                    style={[s.reasonOption, isSelected && s.reasonOptionSelected]}
                    onPress={() => setRemoveReasonCategory(r.id)}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={16}
                      color={isSelected ? colors.danger : colors.textMuted}
                    />
                    <Text style={[s.reasonText, isSelected && { color: colors.text, fontWeight: "700" }]}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Field
              label="Optional Note / Explanation"
              value={removeExplanation}
              onChangeText={setRemoveExplanation}
              placeholder="e.g. Inactive on sprint tasks"
            />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setMemberToRemove(null)}
                style={{ flex: 1 }}
              />
              <Button
                title={removingMember ? "Removing…" : "Confirm Removal"}
                variant="danger"
                icon="trash-outline"
                loading={removingMember}
                onPress={handleConfirmRemoveMember}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </ModalSheet>

      {/* Leave Team ModalSheet */}
      <ModalSheet
        visible={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Leave Workspace"
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}>
            Are you sure you want to leave <Text style={{ fontWeight: "700", color: colors.text }}>{team?.name}</Text>?
            {"\n"}You will lose access to all tasks, sprints, graph analytics, and project info.
          </Text>

          <Text style={s.sectionLabel}>WHY ARE YOU LEAVING?</Text>
          <View style={{ gap: 6 }}>
            {LEAVE_REASONS.map((r) => {
              const isSelected = leaveReason === r.id;
              return (
                <Pressable
                  key={r.id}
                  style={[s.reasonOption, isSelected && s.reasonOptionSelected]}
                  onPress={() => setLeaveReason(r.id)}
                >
                  <Ionicons
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    size={16}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                  <Text style={[s.reasonText, isSelected && { color: colors.text, fontWeight: "700" }]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Optional Explanation"
            value={leaveExplanation}
            onChangeText={setLeaveExplanation}
            placeholder="Add any additional context..."
          />

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Button title="Cancel" variant="secondary" onPress={() => setShowLeaveModal(false)} style={{ flex: 1 }} />
            <Button
              title="Leave Team"
              icon="exit-outline"
              loading={leaving}
              onPress={handleLeaveTeam}
              style={{ flex: 1, backgroundColor: colors.danger }}
            />
          </View>
        </View>
      </ModalSheet>

      {/* Delete Team ModalSheet */}
      <ModalSheet
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workspace"
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "700", lineHeight: 18 }}>
            ⚠️ This permanently deletes this Scrum workspace and all associated stories, sprints, and project data. This action cannot be undone.
          </Text>

          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            Type the exact team name <Text style={{ fontWeight: "800", color: colors.text }}>{team?.name}</Text> to confirm:
          </Text>

          <Field
            label="Team Name Confirmation"
            value={deleteConfirmInput}
            onChangeText={setDeleteConfirmInput}
            placeholder={team?.name || "Team name"}
          />

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Button title="Cancel" variant="secondary" onPress={() => setShowDeleteModal(false)} style={{ flex: 1 }} />
            <Button
              title="Delete Team"
              icon="trash"
              loading={deleting}
              disabled={deleteConfirmInput.trim() !== team?.name.trim()}
              onPress={handleDeleteTeam}
              style={{
                flex: 1,
                backgroundColor: deleteConfirmInput.trim() === team?.name.trim() ? colors.danger : colors.dangerSoft,
              }}
            />
          </View>
        </View>
      </ModalSheet>

      {/* Invite Member Sheet */}
      <ModalSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Invite Teammate by Email">
        <Text style={s.hint}>
          Enter the email address of a registered NEXUSFLOW user. They will receive an invitation notification to join this Scrum workspace.
        </Text>
        <Field label="Teammate Email Address" value={inviteEmail} onChangeText={setInviteEmail} placeholder="teammate@example.com" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginTop: spacing.sm, marginBottom: 6 }}>
          Workspace Role
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.sm }}>
          {[
            { key: "member", label: "Developer" },
            { key: "manager", label: "Product Owner" },
            { key: "leader", label: "Scrum Master" },
          ].map((r) => {
            const active = inviteRole === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setInviteRole(r.key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primarySoft : colors.surfaceAlt,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? colors.primary : colors.textMuted }}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button title="Send Team Invitation" icon="mail-outline" loading={inviting} onPress={onInviteTeammate} style={{ marginTop: spacing.sm }} />
      </ModalSheet>

      {/* Edit Member Sheet */}
      <ModalSheet visible={!!editing} onClose={() => setEditing(null)} title="Edit Member">
        <Field label="Name" value={editName} onChangeText={setEditName} placeholder="Member name" />
        <Button title="Save changes" icon="checkmark" onPress={onSaveEdit} style={{ marginTop: spacing.sm }} />
      </ModalSheet>

      {/* Open Roles Manager Modal */}
      {isLeader && teamId && (
        <OpenRolesManagerModal
          visible={showRolesModal}
          teamId={teamId}
          roles={team?.openRoles || []}
          onClose={() => setShowRolesModal(false)}
          onRolesUpdated={() => refetch()}
        />
      )}

      {/* Leader Applications Review Panel */}
      {isLeader && teamId && (
        <LeaderApplicationsPanel
          visible={showAppsModal}
          teamId={teamId}
          onClose={() => setShowAppsModal(false)}
          onMemberAdded={() => refetch()}
        />
      )}

      <AlgoExplainSheet visible={!!explain} onClose={() => setExplain(null)} title="Why this assignment?" entries={explain ?? []} />
    </ScrollView>
  );
}

// ── Scrum Roster Card Component ──────────────────────────────────────────────
function ScrumRosterCard({
  member: m,
  capacityInfo,
  isSelf,
  isLeader,
  teamOwnerId,
  open,
  removing,
  onToggle,
  onViewProfile,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  capacityInfo?: any;
  isSelf: boolean;
  isLeader: boolean;
  teamOwnerId?: string;
  open: boolean;
  removing: boolean;
  onToggle: () => void;
  onViewProfile: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (removing) Animated.timing(anim, { toValue: 0, duration: 260, useNativeDriver: false }).start();
  }, [removing, anim]);

  const top = SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort((a, b) => b.v - a.v)[0];
  const mUserId = (m.userId || (m as any)._id)?.toString();

  const committedHours = capacityInfo?.committedHours ?? 0;
  const memberCap = capacityInfo?.capacityHours ?? (m as any).capacity ?? 40;
  const utilPct = memberCap > 0 ? Math.round((committedHours / memberCap) * 100) : 0;

  return (
    <Animated.View style={{ opacity: anim, transform: [{ scaleY: anim }] }}>
      <Card style={{ gap: open ? spacing.sm : 0 }}>
        <View style={s.memberHead}>
          <Pressable style={[s.memberHead, { flex: 1 }]} onPress={onViewProfile}>
            <Avatar name={m.name || "Member"} size={36} image={m.avatar} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.memberName}>
                  {m.name || "Member"} {isSelf && <Text style={s.selfBadge}>(You)</Text>}
                </Text>
                {m.role && <Badge label={m.role} variant="neutral" size="sm" />}
              </View>
              <Text style={s.memberSub}>
                Top skill: {top.k} ({top.v}/10) · {committedHours}h / {memberCap}h ({utilPct}%)
              </Text>
            </View>
          </Pressable>

          {isSelf && (
            <Pressable
              onPress={onEdit}
              hitSlop={6}
              style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.primarySoft }]}
            >
              {({ hovered, pressed }: any) => (
                <Ionicons name="pencil-outline" size={15} color={hovered || pressed ? colors.primary : colors.textFaint} />
              )}
            </Pressable>
          )}

          {isLeader && !isSelf && mUserId !== teamOwnerId && (
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.dangerSoft }]}
            >
              {({ hovered, pressed }: any) => (
                <Ionicons name="trash-outline" size={15} color={hovered || pressed ? colors.danger : colors.textFaint} />
              )}
            </Pressable>
          )}

          <Pressable onPress={onToggle} hitSlop={6} style={s.iconBtn}>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
          </Pressable>
        </View>

        {open && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <View style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={s.skillName}>Capacity Utilization</Text>
                <Text style={s.skillVal}>{committedHours}h / {memberCap}h ({utilPct}%)</Text>
              </View>
              <ProgressBar
                progress={Math.min(1, utilPct / 100)}
                color={utilPct > 100 ? "#dc2626" : utilPct >= 80 ? "#16a34a" : "#2563eb"}
              />
            </View>

            {SKILLS.map((k) => {
              const v = m.skills?.[k] ?? 5;
              return (
                <View key={k} style={s.skillRow}>
                  <Text style={s.skillName}>{k}</Text>
                  <View style={s.skillBarTrack}>
                    <View style={[s.skillBarFill, { width: `${v * 10}%`, backgroundColor: colors.branch }]} />
                  </View>
                  <Text style={s.skillVal}>{v}/10</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

function Metric({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={s.metric}>
      <Text style={[s.metricVal, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sub: { ...font.caption, color: colors.textMuted },
  hint: { ...font.caption, color: colors.textSecondary },
  sprintContextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  sprintContextTxt: {
    fontSize: 12,
    color: "#1e40af",
  },
  warnBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning + "44",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  warnTxt: { ...font.caption, color: colors.warning, flex: 1 },
  sectionLabel: { ...font.caption, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8 },
  memberHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberName: { ...font.body, fontWeight: "700" as const, color: colors.text },
  memberSub: { ...font.caption, color: colors.textMuted },
  selfBadge: { fontSize: 11, fontWeight: "800", color: colors.primary },
  iconBtn: { padding: 6, borderRadius: radius.sm },
  skillRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skillName: { width: 68, ...font.caption, color: colors.textMuted, textTransform: "capitalize" },
  skillBarTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  skillBarFill: { height: "100%", borderRadius: radius.pill },
  skillVal: { width: 38, ...font.caption, color: colors.text, textAlign: "right" },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statRow: { flexDirection: "row", justifyContent: "space-around" },
  metric: { alignItems: "center", gap: 2 },
  metricVal: { fontSize: 20, fontWeight: "700" },
  metricLabel: { ...font.caption, color: colors.textMuted },
  assignBlock: { padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, gap: 2 },
  assignTitle: { ...font.body, fontWeight: "700" as const, color: colors.text, flex: 1 },
  assignReason: { ...font.caption, color: colors.textMuted },
  matrixRow: { flexDirection: "row" },
  matrixCell: { width: 72, height: 32, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border, borderRightWidth: 1, borderRightColor: colors.border },
  matrixHeadCell: { backgroundColor: colors.surfaceAlt },
  matrixHeadTxt: { ...font.caption, fontWeight: "700", color: colors.textMuted },
  matrixTxt: { ...font.caption, color: colors.text },
  skillEditRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skillEditLabel: { ...font.body, fontWeight: "700" as const, color: colors.text, fontSize: 13 },
  skillRatingText: { ...font.caption, color: colors.textMuted },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  reasonOptionSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  reasonText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
