/**
 * AssignmentBoard — Branch & Bound optimal task→member assignment.
 *   • Member roster with editable skill profiles (required for a meaningful cost matrix)
 *   • Add / edit / delete members
 *   • Run B&B → member-to-task mapping cards + cost matrix + pruning stats
 *   • FIX 2: Strict skill ownership (edit only own skills) + Teammate Profile view
 *   • FIX 3: Leave Team (normal members) + Delete Team with exact-name confirmation (owner only)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTeam, type AssignResult } from "@/hooks/useTeam";
import { useAuth } from "@/context/AuthContext";
import type { TeamMember } from "@/hooks/useTeams";
import { Card, Button, Badge, Avatar, EmptyState, Field, Stepper } from "@/components/ui";
import { ModalSheet, useToast, useConfirm } from "@/components/feedback";
import SkillMatrix, { type SkillMatrixMember } from "@/components/workspace/SkillMatrix";
import MemberProfileModal from "@/components/workspace/MemberProfileModal";
import SkillVerificationModal from "@/components/SkillVerificationModal";
import OpenRolesManagerModal from "@/components/workspace/OpenRolesManagerModal";
import LeaderApplicationsPanel from "@/components/workspace/LeaderApplicationsPanel";
import { WhyButton, AlgoExplainSheet, type AlgoEntry } from "@/components/AlgoExplain";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font, avatarColor } from "@/theme";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"] as const;
const SHORT: Record<string, string> = { frontend: "FE", backend: "BE", devops: "Ops", design: "UX", ml: "ML", testing: "QA" };

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

export default function AssignmentBoard({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const {
    team, members, loading,
    addMember, deleteMember, updateMember,
    updateMemberSkills, runAssignment, inviteMemberByEmail,
    leaveTeam, deleteTeam, refetch,
  } = useTeam(teamId);

  const toast = useToast();
  const confirm = useConfirm();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Skill Matrix Editing State (Fix 2: Current user's own skills only)
  const [editingSkillsMember, setEditingSkillsMember] = useState<TeamMember | null>(null);
  const [skillDraft, setSkillDraft] = useState<Record<string, number>>({});
  const [savingSkills, setSavingSkills] = useState(false);

  // Teammate Profile View State (Fix 3: Professional Member Profile Modal)
  const [viewingProfileMember, setViewingProfileMember] = useState<TeamMember | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Leader Member Removal State (Fix 3: Require reason & confirmation)
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removeReasonCategory, setRemoveReasonCategory] = useState("inactive");
  const [removeExplanation, setRemoveExplanation] = useState("");
  const [removingMember, setRemovingMember] = useState(false);

  // Leave Team State (Fix 3)
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveReason, setLeaveReason] = useState("project_completed");
  const [leaveExplanation, setLeaveExplanation] = useState("");
  const [leaving, setLeaving] = useState(false);

  // Delete Team State (Fix 3: Owner only)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Open Roles & Applications State (Fix 4: Open Discovery & Role Applications)
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showAppsModal, setShowAppsModal] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(Boolean(team?.isDiscoverable));
  const [togglingDiscoverable, setTogglingDiscoverable] = useState(false);

  useEffect(() => {
    if (team?.isDiscoverable !== undefined) {
      setIsDiscoverable(Boolean(team.isDiscoverable));
    }
  }, [team?.isDiscoverable]);

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
      toast(nextVal ? "Workspace is now discoverable to students!" : "Workspace is now private.", "success");
      refetch();
    } catch (err: any) {
      toast(err.message || "Failed to update discovery.", "error");
    } finally {
      setTogglingDiscoverable(false);
    }
  };

  const currentUserId = (user?._id || user?.id)?.toString();
  const currentUserName = (user?.name || "").toLowerCase().trim();
  const currentUserEmail = (user?.email || "").toLowerCase().trim();

  // Find authenticated user's member object
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

  // Is current user the workspace owner or authorized leader?
  const isOwner = Boolean(
    team?.ownerId && currentUserId && team.ownerId.toString() === currentUserId
  );
  const isLeader = Boolean(
    isOwner ||
    (myMember && ["owner", "leader", "team leader", "manager", "project manager"].includes((myMember.role || "").toLowerCase()))
  );

  const openSkillEdit = (m: TeamMember) => {
    const currentSkills: Record<string, number> = {};
    for (const k of SKILLS) {
      currentSkills[k] = m.skills?.[k] ?? 5;
    }
    setSkillDraft(currentSkills);
    setEditingSkillsMember(m);
  };

  // FIX 2E: Save Ratings ONLY saves skill ratings to MongoDB.
  // It does NOT automatically trigger Branch & Bound / Run Assignment.
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
    toast(`Your skill ratings have been saved!`, "success");
    setEditingSkillsMember(null);
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
  };

  const openAdd = () => {
    setShowAdd(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setEditName(m.name ?? "");
  };

  const onInviteTeammate = async () => {
    if (!inviteEmail.trim()) { toast("Email address is required", "error"); return; }
    setInviting(true);
    const { error, message } = await inviteMemberByEmail(inviteEmail.trim(), inviteRole);
    setInviting(false);
    if (error) { toast(error, "error"); return; }
    toast(message || `Invitation sent to ${inviteEmail.trim()}`, "success");
    setInviteEmail(""); setInviteRole("member"); setShowAdd(false);
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
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) { toast("Name required", "error"); return; }
    const { error } = await updateMember(editing.userId, { name: editName.trim() });
    if (error) { toast(error, "error"); return; }
    toast("Member updated", "success");
    setEditing(null);
  };

  // Group assignments by member
  const byMember = new Map<string, { name: string; tasks: { title: string; cost: number }[] }>();
  for (const a of result?.assignments ?? []) {
    if (!byMember.has(a.memberId)) byMember.set(a.memberId, { name: a.memberName, tasks: [] });
    byMember.get(a.memberId)!.tasks.push({ title: a.taskTitle, cost: a.cost });
  }

  if (loading) return <EmptyState icon="hourglass-outline" title="Loading roster…" />;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}>
      {/* Header Banner */}
      <Card style={{ gap: spacing.sm }}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: colors.branch + "1a" }]}><Ionicons name="people" size={20} color={colors.branch} /></View>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>Member Assignment</Text>
            <Text style={s.sub}>Branch & Bound · minimises skill-gap cost</Text>
          </View>
          <Badge label="O(n!) pruned" color={colors.branch} />
        </View>
        <Text style={s.hint}>Give members differentiated skills so the cost matrix is meaningful, then run the engine.</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button title="Invite Teammate" icon="person-add" variant="secondary" onPress={() => setShowAdd(true)} style={{ flex: 1 }} small />
          <Button title="Run Assignment" icon="git-branch" onPress={() => run()} loading={running} style={{ flex: 1 }} small disabled={members.length === 0} />
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

      {/* Low-resource warnings */}
      {members.length === 1 && (
        <View style={s.warnBar}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <Text style={s.warnTxt}>Only one team member available. Assignment quality may be poor.</Text>
        </View>
      )}

      {/* Roster with editable skills */}
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

          return (
            <RosterCard
              key={m.userId || (m as any)._id}
              member={m}
              isSelf={isSelf}
              isLeader={isLeader}
              teamOwnerId={team?.ownerId?.toString()}
              open={expanded === (m.userId || (m as any)._id)}
              removing={removingId === (m.userId || (m as any)._id)}
              onToggle={() => setExpanded(expanded === (m.userId || (m as any)._id) ? null : (m.userId || (m as any)._id))}
              onViewProfile={() => setViewingProfileMember(m)}
              onEdit={() => { setEditing(m); setEditName(m.name ?? ""); }}
              onDelete={() => onDeleteMember(m)}
            />
          );
        })
      )}

      {/* Skill Matrix (Feature 5 + Fix 2) */}
      {members.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>SKILL MATRIX (1–10 RATINGS)</Text>
              <Text style={s.hint}>1 = Beginner · 10 = Expert. Minimizes skill-gap cost for tasks demanding that skill.</Text>
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

      {/* Assignment result */}
      {result && members.length > 0 && (
        <FadeIn key={resultVersion}>
          <View style={s.resultHead}>
            <Text style={s.sectionLabel}>ASSIGNMENT RESULT</Text>
            <WhyButton color={colors.branch} onPress={() => setExplain([{
              algo: "branch",
              input: `${members.length} members × ${result.assignments.length} tasks · skill-gap cost matrix`,
              output: `Min-cost assignment · total skill gap ${result.totalCost}`,
              reason: `Branch & Bound explored ${result.meta?.nodesExplored ?? "?"} states and pruned ${result.meta?.nodesPruned ?? "?"} (${result.meta?.pruningRatio ?? "?"}) using an admissible lower bound. Each task goes to the member with the lowest skill gap.`,
            }])} />
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
              <Card key={id} style={{ gap: spacing.sm, marginTop: spacing.md }}>
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
                  m.tasks.map((t, idx) => (
                    <View key={t.title + idx} style={s.assignBlock}>
                      <View style={s.assignRow}>
                        <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                        <Text style={s.assignTitle}>{t.title}</Text>
                        <Badge label={t.cost === 0 ? "Perfect fit" : `Gap ${t.cost}`} color={t.cost === 0 ? colors.success : colors.warning} />
                      </View>
                      <Text style={s.assignReason}>Skill gap {t.cost} vs requirement demand</Text>
                    </View>
                  ))
                )}
              </Card>
            );
          })}

          {/* Full cost matrix */}
          {result.costMatrix && result.memberLabels && result.taskLabels && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text style={s.sectionLabel}>COST MATRIX (MEMBERS × TASKS)</Text>
              <Text style={s.hint}>Rows = tasks · Cols = members. Cell = skill-gap penalty (0 = ideal).</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={s.matrixRow}>
                    <View style={[s.matrixCell, s.matrixHeadCell, { width: 140 }]}><Text style={s.matrixHeadTxt}>Task \ Member</Text></View>
                    {result.memberLabels.map((lbl, ci) => (
                      <View key={lbl + ci} style={[s.matrixCell, s.matrixHeadCell]}><Text style={s.matrixHeadTxt} numberOfLines={1}>{lbl}</Text></View>
                    ))}
                  </View>
                  {result.taskLabels.map((tLbl, ri) => (
                    <View key={tLbl + ri} style={s.matrixRow}>
                      <View style={[s.matrixCell, { width: 140, alignItems: "flex-start", paddingLeft: 6 }]}>
                        <Text style={s.matrixTxt} numberOfLines={1}>{tLbl}</Text>
                      </View>
                      {result.costMatrix[ri]?.map((c, ci) => (
                        <View key={ci} style={[s.matrixCell, c === 0 && { backgroundColor: colors.successSoft }]}>
                          <Text style={[s.matrixTxt, c === 0 && { color: colors.success }]}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </Card>
          )}
        </FadeIn>
      )}

      {/* FIX 3: Workspace Membership Management (Leave Team / Delete Team) */}
      <Card style={{ gap: spacing.sm, marginTop: spacing.lg, borderColor: colors.border }}>
        <Text style={s.sectionLabel}>WORKSPACE MEMBERSHIP</Text>
        {isOwner ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Team Leader</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>You own this workspace.</Text>
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
            <Text style={s.hint}>You are a member of this workspace. If you leave, you will lose access to all tasks and project information.</Text>
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

      {/* Edit My Skills ModalSheet (Fix 2: Self-only, no teammate switcher) */}
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
            const label = k === "ml" ? "ML / AI" : k === "devops" ? "DevOps / Ops" : k === "design" ? "Design / UX" : k.charAt(0).toUpperCase() + k.slice(1);
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
          <Button title="Cancel" variant="secondary" onPress={() => setEditingSkillsMember(null)} style={{ flex: 1 }} />
          <Button title="Save Ratings" icon="checkmark" loading={savingSkills} onPress={handleSaveSkills} style={{ flex: 1 }} />
        </View>
      </ModalSheet>

      {/* Member Profile Modal (Fix 3: Professional Member Profile & Verified Badges) */}
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

      {/* Skill Verification Quiz Modal from Profile */}
      <SkillVerificationModal
        visible={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        skill="JavaScript"
        onVerified={(skill) => {
          toast(`${skill} is now verified on your profile!`, "success");
        }}
      />

      {/* Leader Member Removal Modal (Fix 3: Required reason & audit record) */}
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
              {"\n"}Any tasks assigned to them will be unassigned, and a departure audit record will be logged.
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
              placeholder="e.g. Inactive on sprint tasks for 2 weeks"
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

      {/* FIX 3: Leave Team ModalSheet */}
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

      {/* FIX 3: Delete Team ModalSheet (Owner Only + Exact Name Confirmation) */}
      <ModalSheet
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workspace"
      >
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "700", lineHeight: 18 }}>
            ⚠️ This permanently deletes this workspace and all associated tasks, sprints, and project data. This action cannot be undone.
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
        <Text style={s.hint}>Enter the email address of a registered NEXUSFLOW user. They will receive an invitation notification to join this workspace.</Text>
        <Field label="Teammate Email Address" value={inviteEmail} onChangeText={setInviteEmail} placeholder="teammate@example.com" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginTop: spacing.sm, marginBottom: 6 }}>Workspace Role</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.sm }}>
          {[
            { key: "member", label: "Team Member" },
            { key: "manager", label: "Project Manager" },
            { key: "leader", label: "Team Leader" },
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

      {/* FIX 4: Open Roles Manager Modal */}
      {isLeader && teamId && (
        <OpenRolesManagerModal
          visible={showRolesModal}
          teamId={teamId}
          roles={team?.openRoles || []}
          onClose={() => setShowRolesModal(false)}
          onRolesUpdated={() => refetch()}
        />
      )}

      {/* FIX 4: Leader Applications Review Panel */}
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

// ── Roster card with view profile and edit / delete actions ─────────────────
function RosterCard({
  member: m,
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

  return (
    <Animated.View style={{ opacity: anim, transform: [{ scaleY: anim }] }}>
      <Card style={{ gap: open ? spacing.sm : 0 }}>
        <View style={s.memberHead}>
          <Pressable style={[s.memberHead, { flex: 1 }]} onPress={onViewProfile}>
            <Avatar name={m.name || "Member"} size={36} image={m.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={s.memberName}>
                {m.name || "Member"} {isSelf && <Text style={s.selfBadge}>(You)</Text>}
              </Text>
              <Text style={s.memberSub}>Top skill: {top.k} ({top.v}/10)</Text>
            </View>
          </Pressable>

          {/* Edit ratings button: strictly self-only */}
          {isSelf && (
            <Pressable onPress={onEdit} hitSlop={6} style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.primarySoft }]}>
              {({ hovered, pressed }: any) => <Ionicons name="pencil-outline" size={15} color={hovered || pressed ? colors.primary : colors.textFaint} />}
            </Pressable>
          )}

          {/* Remove member button: strictly authorized leader, non-self, and not owner */}
          {isLeader && !isSelf && mUserId !== teamOwnerId && (
            <Pressable onPress={onDelete} hitSlop={6} style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.dangerSoft }]}>
              {({ hovered, pressed }: any) => <Ionicons name="trash-outline" size={15} color={hovered || pressed ? colors.danger : colors.textFaint} />}
            </Pressable>
          )}

          <Pressable onPress={onToggle} hitSlop={6} style={s.iconBtn}>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
          </Pressable>
        </View>

        {open && (
          <View style={{ gap: 8, marginTop: 4 }}>
            {SKILLS.map((k) => {
              const v = m.skills?.[k] ?? 5;
              return (
                <View key={k} style={s.skillRow}>
                  <Text style={s.skillName}>{k}</Text>
                  <View style={s.skillBarTrack}>
                    <View style={[s.skillBarFill, { width: `${v * 10}%`, backgroundColor: avatarColor(m.name || k) }]} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, width: 36, textAlign: "right" }}>{v}/10</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: false }).start();
  }, [anim]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], gap: spacing.md }}>
      {children}
    </Animated.View>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[s.metricVal, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textFaint, marginTop: 4 },
  warnBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning + "55",
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12,
  },
  warnTxt: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.warning, lineHeight: 16 },
  memberHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  memberName: { fontSize: 15, fontWeight: "700", color: colors.text },
  selfBadge: { fontSize: 12, fontWeight: "600", color: colors.primary },
  memberSub: { fontSize: 12, color: colors.textMuted },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  skillRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  skillName: { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 64, textTransform: "capitalize" },
  skillBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  skillBarFill: { height: "100%", borderRadius: 4 },
  statRow: { flexDirection: "row" },
  metricVal: { fontSize: 18, fontWeight: "800" },
  metricLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  assignBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 2 },
  assignRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  assignTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  assignReason: { fontSize: 11, color: colors.textMuted, lineHeight: 15, paddingLeft: 22 },
  matrixRow: { flexDirection: "row" },
  matrixCell: { width: 56, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: colors.border },
  matrixHeadCell: { backgroundColor: colors.surfaceAlt },
  matrixHeadTxt: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  matrixTxt: { fontSize: 12, fontWeight: "700", color: colors.text },
  skillEditRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  skillEditLabel: { fontSize: 13, fontWeight: "700", color: colors.text, textTransform: "capitalize" },
  skillRatingText: { fontSize: 11, fontWeight: "700", color: colors.branch },
  reasonOption: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  reasonOptionSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  reasonText: { fontSize: 13, color: colors.textMuted },
});
