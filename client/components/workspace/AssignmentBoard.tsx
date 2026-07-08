/**
 * AssignmentBoard — Branch & Bound optimal task→member assignment.
 *   • Member roster with editable skill profiles (required for a meaningful cost matrix)
 *   • Add / edit / delete members — deletion animates out, then automatically
 *     re-runs Branch & Bound so the cost matrix, assignments and pruning stats
 *     recompute live (demonstrates B&B adapting to resource constraints).
 *   • Run B&B → member-to-task mapping cards + cost matrix + pruning stats
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

export default function AssignmentBoard({ teamId }: { teamId: string }) {
  const { members, loading, addMember, deleteMember, updateMember, setMemberSkill, runAssignment } = useTeam(teamId);
  const toast = useToast();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);
  const [resultVersion, setResultVersion] = useState(0); // keys the fade-in of fresh results
  const [running, setRunning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("frontend");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [explain, setExplain] = useState<AlgoEntry[] | null>(null);

  // Member lookup for assignment explanations (top skill / fit reasoning).
  const memberById = (id: string) => members.find((m) => m.userId === id);
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
      // A failed recompute means the old result (matrix, stats) is stale — drop it.
      setResult(null);
      toast(error, opts?.silent ? "info" : "error");
      return;
    }
    setResult(r!);
    setResultVersion((v) => v + 1);
    if (!opts?.silent) toast("Assignment computed", "success");
  };

  const onAddMember = async () => {
    if (!name.trim()) { toast("Name required", "error"); return; }
    const skills: Record<string, number> = {};
    for (const k of SKILLS) skills[k] = k === primary ? 9 : 3;
    const { error } = await addMember(name.trim(), skills);
    if (error) { toast(error, "error"); return; }
    toast("Member added", "success");
    setName(""); setShowAdd(false);
  };

  // Delete flow: confirm → fade/collapse the card → DELETE member →
  // automatically re-run Branch & Bound (no "Run Assignment" click needed).
  const onDeleteMember = async (m: TeamMember) => {
    const ok = await confirm({
      title: "Delete Member?",
      message: "Deleting this member will remove them from the assignment engine.\nAll assignments and the cost matrix will be recalculated.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(m.userId);                       // triggers exit animation
    await new Promise((r) => setTimeout(r, 280));  // let the fade/collapse play
    const { error } = await deleteMember(m.userId);
    setRemovingId(null);
    if (error) { toast(error, "error"); return; }
    if (expanded === m.userId) setExpanded(null);

    const remaining = members.length - 1;
    if (remaining === 0) {
      setResult(null); // hide assignment panel entirely
      toast("Member deleted — no team members available.", "info");
      return;
    }
    toast(`${m.name || "Member"} deleted — recomputing optimal assignment…`, "info");
    await run({ silent: true }); // B&B recomputes: matrix rows, stats, gaps all update live
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) { toast("Name required", "error"); return; }
    const { error } = await updateMember(editing.userId, { name: editName.trim() });
    if (error) { toast(error, "error"); return; }
    toast("Member updated", "success");
    setEditing(null);
  };

  // group assignments by member
  const byMember = new Map<string, { name: string; tasks: { title: string; cost: number }[] }>();
  for (const a of result?.assignments ?? []) {
    if (!byMember.has(a.memberId)) byMember.set(a.memberId, { name: a.memberName, tasks: [] });
    byMember.get(a.memberId)!.tasks.push({ title: a.taskTitle, cost: a.cost });
  }

  if (loading) return <EmptyState icon="hourglass-outline" title="Loading roster…" />;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}>
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
          <Button title="Add member" icon="person-add" variant="secondary" onPress={() => setShowAdd(true)} style={{ flex: 1 }} small />
          <Button title="Run Assignment" icon="git-branch" onPress={() => run()} loading={running} style={{ flex: 1 }} small disabled={members.length === 0} />
        </View>
      </Card>

      {/* Low-resource warnings for the B&B demo */}
      {members.length === 1 && (
        <View style={s.warnBar}>
          <Ionicons name="warning-outline" size={15} color={colors.warning} />
          <Text style={s.warnTxt}>Only one team member available. Assignment quality may be poor.</Text>
        </View>
      )}

      {/* Roster with editable skills */}
      <Text style={s.sectionLabel}>ROSTER ({members.length})</Text>
      {members.length === 0 ? (
        <EmptyState icon="person-add-outline" title="No team members available." message="Add members with distinct skills before running Branch & Bound." actionLabel="Add member" actionIcon="person-add" onAction={() => setShowAdd(true)} />
      ) : members.map((m) => (
        <RosterCard
          key={m.userId}
          member={m}
          open={expanded === m.userId}
          removing={removingId === m.userId}
          onToggle={() => setExpanded(expanded === m.userId ? null : m.userId)}
          onEdit={() => { setEditing(m); setEditName(m.name ?? ""); }}
          onDelete={() => onDeleteMember(m)}
          onSkill={(k, v) => setMemberSkill(m.userId, k, v)}
        />
      ))}

      {/* Skill Matrix (Feature 5) — evidence for Branch & Bound */}
      {members.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={s.sectionLabel}>SKILL MATRIX</Text>
          <Text style={s.hint}>Taller bars = stronger skill → lower skill-gap cost for tasks demanding that skill.</Text>
          <SkillMatrix members={members} />
        </Card>
      )}

      {/* Assignment result — hidden entirely when no members exist */}
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
                  <Badge label={`${m.tasks.length} task${m.tasks.length !== 1 ? "s" : ""}`} color={colors.primary} />
                </View>
                {m.tasks.map((t, i) => (
                  <View key={i} style={s.assignBlock}>
                    <View style={s.assignRow}>
                      <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
                      <Text style={s.assignTitle}>{t.title}</Text>
                      <Badge label={`gap ${t.cost}`} color={t.cost === 0 ? colors.success : colors.warning} />
                    </View>
                    <Text style={s.assignReason}>
                      {t.cost === 0
                        ? `Perfect fit — ${m.name}'s skills meet every demand (assignment cost 0).`
                        : `Lowest skill gap available (cost ${t.cost})${top ? ` · strongest in ${top.k} (${top.v}/10)` : ""}.`}
                    </Text>
                  </View>
                ))}
              </Card>
            );
          })}

          {/* Cost matrix */}
          {result.costMatrix?.length > 0 && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text style={s.sectionLabel}>COST MATRIX (member × task · {result.memberLabels.length} × {result.taskLabels.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={s.matrixRow}>
                    <View style={[s.matrixCell, s.matrixHeadCell]} />
                    {result.taskLabels.map((tl, j) => (
                      <View key={j} style={[s.matrixCell, s.matrixHeadCell]}><Text style={s.matrixHeadTxt} numberOfLines={1}>{tl.slice(0, 8)}</Text></View>
                    ))}
                  </View>
                  {result.costMatrix.map((row, i) => (
                    <View key={i} style={s.matrixRow}>
                      <View style={[s.matrixCell, s.matrixHeadCell]}><Text style={s.matrixHeadTxt} numberOfLines={1}>{result.memberLabels[i]?.slice(0, 8)}</Text></View>
                      {row.map((c, j) => (
                        <View key={j} style={[s.matrixCell, { backgroundColor: c === 0 ? colors.successSoft : c <= 3 ? colors.warningSoft : colors.dangerSoft }]}>
                          <Text style={s.matrixTxt}>{c}</Text>
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

      <ModalSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Add Member">
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Dana" />
        <Text style={s.skillPickLabel}>Primary skill</Text>
        <View style={s.chipRow}>
          {SKILLS.map((k) => (
            <Pressable key={k} onPress={() => setPrimary(k)} style={[s.chip, primary === k && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[s.chipTxt, primary === k && { color: "#fff" }]}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Add member" icon="person-add" onPress={onAddMember} style={{ marginTop: spacing.sm }} />
      </ModalSheet>

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)} title="Edit Member">
        <Field label="Name" value={editName} onChangeText={setEditName} placeholder="Member name" />
        <Button title="Save changes" icon="checkmark" onPress={onSaveEdit} style={{ marginTop: spacing.sm }} />
      </ModalSheet>

      <AlgoExplainSheet visible={!!explain} onClose={() => setExplain(null)} title="Why this assignment?" entries={explain ?? []} />
    </ScrollView>
  );
}

// ── Roster card with edit / delete actions and exit animation ─────────────────
function RosterCard({ member: m, open, removing, onToggle, onEdit, onDelete, onSkill }: {
  member: TeamMember; open: boolean; removing: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
  onSkill: (skill: string, value: number) => void;
}) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Fade out + collapse when this member is being deleted.
    if (removing) Animated.timing(anim, { toValue: 0, duration: 260, useNativeDriver: false }).start();
  }, [removing, anim]);
  const top = SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort((a, b) => b.v - a.v)[0];

  return (
    <Animated.View style={{ opacity: anim, transform: [{ scaleY: anim }] }}>
      <Card style={{ gap: open ? spacing.sm : 0 }}>
        <View style={s.memberHead}>
          <Pressable style={[s.memberHead, { flex: 1 }]} onPress={onToggle}>
            <Avatar name={m.name || "Member"} size={36} image={m.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={s.memberName}>{m.name || "Member"}</Text>
              <Text style={s.memberSub}>Top skill: {top.k} ({top.v}/10)</Text>
            </View>
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={6} style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.primarySoft }]}>
            {({ hovered, pressed }: any) => <Ionicons name="pencil-outline" size={15} color={hovered || pressed ? colors.primary : colors.textFaint} />}
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={6} style={({ hovered, pressed }: any) => [s.iconBtn, (hovered || pressed) && { backgroundColor: colors.dangerSoft }]}>
            {({ hovered, pressed }: any) => <Ionicons name="trash-outline" size={15} color={hovered || pressed ? colors.danger : colors.textFaint} />}
          </Pressable>
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
                  <Stepper value={v} onChange={(nv) => onSkill(k, nv)} min={0} max={10} />
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

// ── Gentle entrance for freshly recomputed results ────────────────────────────
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
  skillPickLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipTxt: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "capitalize" },
});
