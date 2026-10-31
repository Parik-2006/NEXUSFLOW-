/**
 * ClassicMembersPanel.tsx ? Branch & Bound Optimal Task-Member Assignment.
 *   ? Member roster with editable skill profiles (required for a meaningful cost matrix)
 *   ? Add / edit / delete members ? deletion animates out, then automatically
 *     re-runs Branch & Bound so the cost matrix, assignments and pruning stats
 *     recompute live (demonstrates B&B adapting to resource constraints).
 *   ? Run B&B ? member-to-task mapping cards + cost matrix + pruning stats
 * Deterministic DAA Branch & Bound with no AI assistant or Waterfall phases.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeam, type AssignResult } from "@/hooks/useTeam";
import type { TeamMember } from "@/hooks/useTeams";
import { Card, Button, Badge, Avatar, EmptyState, Field, Stepper } from "@/components/ui";
import { ModalSheet, useToast, useConfirm } from "@/components/feedback";
import SkillMatrix from "@/components/workspace/SkillMatrix";
import { WhyButton, AlgoExplainSheet, type AlgoEntry } from "@/components/AlgoExplain";
import { colors, spacing, radius, font, avatarColor } from "@/theme";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"];

export default function ClassicMembersPanel({ teamId }: { teamId: string }) {
  const {
    members,
    loading,
    addMember,
    deleteMember,
    updateMember,
    setMemberSkill,
    runAssignment,
  } = useTeam(teamId);
  const toast = useToast();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
  const [running, setRunning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("frontend");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);

  // Member lookup for assignment explanations
  const memberById = (id: string) => members.find((m) => m.userId === id);
  const topSkillOf = (id: string) => {
    const m = memberById(id);
    if (!m) return null;
    return SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort(
      (a, b) => b.v - a.v
    )[0];
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
    if (!opts?.silent) toast("Assignment computed", "success");
  };

  const onAddMember = async () => {
    if (!name.trim()) {
      toast("Name required", "error");
      return;
    }
    const skills: Record<string, number> = {};
    for (const k of SKILLS) skills[k] = k === primary ? 9 : 3;
    const { error } = await addMember(name.trim(), skills);
    if (error) {
      toast(error, "error");
      return;
    }
    toast("Member added", "success");
    setName("");
    setShowAdd(false);
  };

  const onDeleteMember = async (m: TeamMember) => {
    const ok = await confirm({
      title: "Delete Member?",
      message:
        "Deleting this member will remove them from the assignment engine.\nAll assignments and the cost matrix will be recalculated.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(m.userId);
    await new Promise((r) => setTimeout(r, 280));
    const { error } = await deleteMember(m.userId);
    setRemovingId(null);
    if (error) {
      toast(error, "error");
      return;
    }
    if (expanded === m.userId) setExpanded(null);

    const remaining = members.length - 1;
    if (remaining === 0) {
      setResult(null);
      toast("Member deleted ? no team members available.", "info");
      return;
    }
    toast(`${m.name || "Member"} deleted ? recomputing optimal assignment...`, "info");
    await run({ silent: true });
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      toast("Name required", "error");
      return;
    }
    const { error } = await updateMember(editing.userId, {
      name: editName.trim(),
    });
    if (error) {
      toast(error, "error");
      return;
    }
    toast("Member updated", "success");
    setEditing(null);
  };

  // group assignments by member
  const byMember = new Map<
    string,
    { name: string; tasks: { title: string; cost: number }[] }
  >();
  for (const a of result?.assignments ?? []) {
    if (!byMember.has(a.memberId))
      byMember.set(a.memberId, { name: a.memberName, tasks: [] });
    byMember.get(a.memberId)!.tasks.push({ title: a.taskTitle, cost: a.cost });
  }

  if (loading)
    return <EmptyState icon="hourglass-outline" title="Loading roster..." />;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.lg,
        gap: spacing.md,
        paddingBottom: 80,
      }}
    >
      <Card style={{ gap: spacing.sm }}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: colors.branch + "1a" }]}>
            <Ionicons name="people" size={20} color={colors.branch} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>Member Assignment</Text>
            <Text style={s.sub}>Branch & Bound ? minimises skill-gap cost</Text>
          </View>
          <Badge label="O(n!) pruned" color={colors.branch} />
        </View>
        <Text style={s.hint}>
          Give members differentiated skills so the cost matrix is meaningful,
          then run the engine.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            title="Add member"
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
      </Card>

      {/* Low-resource warnings */}
      {members.length === 1 && (
        <View style={s.warnBar}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <Text style={s.warnTxt}>
            Only one team member available. Assignment quality may be poor.
          </Text>
        </View>
      )}

      {/* Roster with editable skills */}
      <Text style={s.sectionLabel}>ROSTER ({members.length})</Text>
      {members.length === 0 ? (
        <EmptyState
          icon="person-add-outline"
          title="No team members available."
          message="Add members with distinct skills before running Branch & Bound."
          actionLabel="Add member"
          actionIcon="person-add"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        members.map((m) => (
          <RosterCard
            key={m.userId}
            member={m}
            open={expanded === m.userId}
            removing={removingId === m.userId}
            onToggle={() =>
              setExpanded(expanded === m.userId ? null : m.userId)
            }
            onEdit={() => {
              setEditing(m);
              setEditName(m.name ?? "");
            }}
            onDelete={() => onDeleteMember(m)}
            onSkill={(k, v) => setMemberSkill(m.userId, k, v)}
          />
        ))
      )}

      {/* Skill Matrix */}
      {members.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={s.sectionLabel}>SKILL MATRIX</Text>
          <Text style={s.hint}>
            Taller bars = stronger skill ? lower skill-gap cost for tasks
            demanding that skill.
          </Text>
          <SkillMatrix members={members} />
        </Card>
      )}

      {/* Assignment result */}
      {result && members.length > 0 && (
        <FadeIn key={resultVersion}>
          <View style={s.resultHead}>
            <Text style={s.sectionLabel}>ASSIGNMENT RESULT</Text>
            <WhyButton
              color={colors.branch}
              onPress={() =>
                setExplain([
                  {
                    algo: "branch",
                    input: `${members.length} members ? ${result.assignments.length} tasks ? skill-gap cost matrix`,
                    output: `Min-cost assignment ? total skill gap ${result.totalCost}`,
                    reason: `Branch & Bound explored ${result.meta?.nodesExplored ?? "?"} states and pruned ${result.meta?.nodesPruned ?? "?"} (${result.meta?.pruningRatio ?? "?"}) using an admissible lower bound. Each task goes to the member with the lowest skill gap.`,
                  },
                ])
              }
            />
          </View>
          <Card style={s.statRow}>
            <Metric
              label="Total cost"
              value={result.totalCost}
              color={colors.branch}
            />
            <Metric
              label="Explored"
              value={result.meta?.nodesExplored ?? "?"}
              color={colors.info}
            />
            <Metric
              label="Pruned"
              value={result.meta?.nodesPruned ?? "?"}
              color={colors.success}
            />
            <Metric
              label="Prune %"
              value={result.meta?.pruningRatio ?? "?"}
              color={colors.greedy}
            />
          </Card>

          {[...byMember.entries()].map(([id, m]) => {
            const top = topSkillOf(id);
            return (
              <Card key={id} style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <View style={s.memberHead}>
                  <Avatar
                    name={m.name}
                    size={32}
                    image={memberById(id)?.avatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{m.name}</Text>
                    {top ? (
                      <Text style={s.memberSub}>
                        Top skill: {top.k} ({top.v}/10)
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={`${m.tasks.length} task${m.tasks.length !== 1 ? "s" : ""}`}
                    color={colors.primary}
                  />
                </View>
                {m.tasks.map((t, i) => (
                  <View key={i} style={s.assignBlock}>
                    <View style={s.assignRow}>
                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color={colors.textFaint}
                      />
                      <Text style={s.assignTitle}>{t.title}</Text>
                      <Badge
                        label={`gap ${t.cost}`}
                        color={t.cost === 0 ? colors.success : colors.warning}
                      />
                    </View>
                    <Text style={s.assignReason}>
                      {t.cost === 0
                        ? `Perfect fit ? ${m.name}'s skills meet every demand (assignment cost 0).`
                        : `Lowest skill gap available (cost ${t.cost})${top ? ` ? strongest in ${top.k} (${top.v}/10)` : ""}.`}
                    </Text>
                  </View>
                ))}
              </Card>
            );
          })}

          {/* Cost matrix */}
          {result.costMatrix && result.costMatrix.length > 0 && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text style={s.sectionLabel}>COST MATRIX (SKILL GAPS)</Text>
              <Text style={s.hint}>
                Rows = members, columns = tasks. Lower number = better fit.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.matrixWrap}>
                  <View style={s.matrixRow}>
                    <Text style={[s.matrixCell, s.matrixHead, { width: 110 }]}>
                      Member
                    </Text>
                    {result.taskLabels?.map((th: string, i: number) => (
                      <Text
                        key={i}
                        style={[s.matrixCell, s.matrixHead, { width: 90 }]}
                        numberOfLines={1}
                      >
                        {th}
                      </Text>
                    ))}
                  </View>
                  {result.costMatrix.map((row, ri) => (
                    <View key={ri} style={s.matrixRow}>
                      <Text
                        style={[s.matrixCell, { width: 110, fontWeight: "600" }]}
                        numberOfLines={1}
                      >
                        {result.memberLabels?.[ri] ?? `Member ${ri + 1}`}
                      </Text>
                      {row.map((c, ci) => (
                        <Text
                          key={ci}
                          style={[
                            s.matrixCell,
                            {
                              width: 90,
                              color: c === 0 ? colors.success : colors.text,
                            },
                          ]}
                        >
                          {c}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </Card>
          )}
        </FadeIn>
      )}

      {/* Add Member modal */}
      <ModalSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Team Member"
      >
        <Field
          label="Name"
          placeholder="e.g. Alice"
          value={name}
          onChangeText={setName}
        />
        <View style={{ gap: 8 }}>
          <Text style={s.formLabel}>Primary skill (sets to 9/10)</Text>
          <View style={s.chipRow}>
            {SKILLS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setPrimary(k)}
                style={[s.chip, primary === k && s.chipOn]}
              >
                <Text style={[s.chipTxt, primary === k && s.chipTxtOn]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Button title="Add to Roster" icon="checkmark" onPress={onAddMember} />
      </ModalSheet>

      {/* Edit Member modal */}
      <ModalSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Member"
      >
        <Field
          label="Name"
          value={editName}
          onChangeText={setEditName}
        />
        <Button title="Save changes" icon="checkmark" onPress={onSaveEdit} />
      </ModalSheet>

      {/* Algo Explanation */}
      <AlgoExplainSheet visible={!!explain} entries={explain || []} onClose={() => setExplain(null)} />
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <View style={s.metric}>
      <Text style={[s.metricVal, { color }]}>{value}</Text>
      <Text style={s.metricLbl}>{label}</Text>
    </View>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [anim]);
  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

function RosterCard({
  member,
  open,
  removing,
  onToggle,
  onEdit,
  onDelete,
  onSkill,
}: {
  member: TeamMember;
  open: boolean;
  removing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSkill: (k: string, v: number) => void;
}) {
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (removing) {
      Animated.timing(fade, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [removing, fade]);

  return (
    <Animated.View style={{ opacity: fade }}>
      <Card style={{ gap: spacing.sm }}>
        <View style={s.memberHead}>
          <Avatar
            name={member.name || "Member"}
            size={36}
            image={member.avatar}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.memberName}>{member.name || "Member"}</Text>
            <Text style={s.memberSub}>{member.role || "Member"}</Text>
          </View>
          <Pressable onPress={onEdit} hitSlop={8} style={s.iconBtn}>
            <Ionicons name="pencil" size={16} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={s.iconBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
          <Pressable onPress={onToggle} hitSlop={8} style={s.iconBtn}>
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        {open && (
          <View style={s.skillList}>
            <Text style={s.skillTitle}>Skill Ratings (1?10)</Text>
            {SKILLS.map((k) => (
              <View key={k} style={s.skillRow}>
                <Text style={s.skillLabel}>{k}</Text>
                <Stepper
                  value={member.skills?.[k] ?? 5}
                  onChange={(v) => onSkill(k, v)}
                  min={1}
                  max={10}
                />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sub: { fontSize: 12, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  warnBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.sm,
    backgroundColor: colors.warning + "18",
    borderRadius: radius.sm,
  },
  warnTxt: { fontSize: 12, color: colors.warning, flex: 1 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  memberHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.text },
  memberSub: { fontSize: 12, color: colors.textMuted },
  iconBtn: { padding: 4 },
  skillList: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  skillTitle: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skillLabel: { fontSize: 13, color: colors.text, textTransform: "capitalize" },
  resultHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  statRow: { flexDirection: "row", gap: spacing.sm },
  metric: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    gap: 2,
  },
  metricVal: { fontSize: 18, fontWeight: "800" },
  metricLbl: { fontSize: 11, color: colors.textMuted },
  assignBlock: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    gap: 4,
  },
  assignRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  assignTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  assignReason: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  matrixWrap: { gap: 4, paddingVertical: spacing.xs },
  matrixRow: { flexDirection: "row", alignItems: "center" },
  matrixCell: { fontSize: 12, color: colors.text, paddingHorizontal: 6, paddingVertical: 4 },
  matrixHead: { fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", fontSize: 11 },
  formLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.branch,
    backgroundColor: colors.branch + "18",
  },
  chipTxt: { fontSize: 12, color: colors.textMuted, textTransform: "capitalize" },
  chipTxtOn: { color: colors.branch, fontWeight: "700" },
});
