/**
 * OverviewPanel — workspace "command center" landing tab.
 * Summarises progress, status breakdown and team, with quick jumps into the
 * other tabs. Read-only; pulls from useTeam + useTeamTasks.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeam } from "@/hooks/useTeam";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import { useReminders } from "@/hooks/useReminders";
import { useAuth } from "@/context/AuthContext";
import { Card, ProgressBar, AvatarStack, Badge, EmptyState, SkeletonCard, Button } from "@/components/ui";
import { useToast, useConfirm } from "@/components/feedback";
import { PieChart, type Datum } from "@/components/charts";
import { colors, spacing, radius, font, healthLabel, deadlineMeta, taskPriorityKey, PRIORITY_META, type PriorityKey } from "@/theme";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

type Health = {
  score: number; grade: string; total: number;
  counts?: { done: number; inProgress: number; overdue: number; assigned: number; active: number; depTotal: number; depDone: number; plannedHours: number; sprintCapacity: number };
  factors: { key: string; label: string; weight: number; pct: number }[];
  summary: string;
};

const gradeColor = (g: string) => g === "A+" || g === "A" ? colors.success : g === "B" ? colors.accent : g === "C" ? colors.warning : colors.danger;

type Nav = (tab: string) => void;

const JUMPS: { tab: string; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string }[] = [
  { tab: "tasks", icon: "list", label: "Tasks", desc: "Prioritised backlog", color: colors.greedy },
  { tab: "sprint", icon: "rocket", label: "Sprint planning", desc: "Optimise capacity", color: colors.knapsack },
  { tab: "graph", icon: "git-network", label: "Dependency graph", desc: "Execution order", color: colors.topo },
  { tab: "members", icon: "people", label: "Team members", desc: "Roster & assignment", color: colors.branch },
  { tab: "analytics", icon: "stats-chart", label: "Analytics", desc: "Sort performance", color: colors.merge },
  { tab: "chat", icon: "chatbubbles", label: "Chat & AI", desc: "Plan with AI", color: colors.primary },
];

export default function OverviewPanel({ teamId, onNavigate }: { teamId: string; onNavigate: Nav }) {
  const { team } = useTeam(teamId);
  const { rawTasks, loading, restoreBacklog } = useTeamTasks(teamId);
  const { upcoming, reminderStates } = useReminders(teamId);
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [health, setHealth] = useState<Health | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/health`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHealth(await res.json());
    } catch { /* non-fatal */ }
  }, [teamId, token]);

  // Recompute health whenever ANY health input changes (status, assignment,
  // due date, dependencies, effort) — keeps the score live, never stale.
  const healthSig = rawTasks
    .map((t) => `${t.status}:${t.assignedTo ?? ""}:${t.dueDate ?? t.deadline ?? ""}:${t.dependencies?.length ?? 0}:${t.estimatedHours ?? ""}`)
    .join("|");
  useEffect(() => { fetchHealth(); }, [fetchHealth, healthSig]);

  const canRestore = (team?.aiGeneratedTasks?.length ?? 0) > 0;
  const onRestore = async () => {
    const ok = await confirm({ title: "Restore AI backlog?", message: "This removes all current tasks and rebuilds the original AI-generated backlog. Members, profiles and settings are kept.", confirmLabel: "Restore", destructive: true });
    if (!ok) return;
    setRestoring(true);
    const { error, restored } = await restoreBacklog();
    setRestoring(false);
    toast(error ?? `Restored ${restored} AI tasks`, error ? "error" : "success");
    if (!error) fetchHealth();
  };

  const stats = useMemo(() => {
    const todo = rawTasks.filter((t) => t.status === "todo").length;
    const inProgress = rawTasks.filter((t) => t.status === "in_progress").length;
    const done = rawTasks.filter((t) => t.status === "done").length;
    const total = rawTasks.length;
    const ratio = total ? done / total : 0;
    return { todo, inProgress, done, total, ratio };
  }, [rawTasks]);

  // Upcoming deadlines (Today / Tomorrow / Next 7 days) + overdue, from live data.
  const deadlines = useMemo(() => {
    let overdue = 0, today = 0, tomorrow = 0, week = 0;
    for (const t of rawTasks) {
      if (t.status === "done") continue;
      const m = deadlineMeta(t.dueDate ?? t.deadline);
      if (!m.hasDate || m.daysRemaining == null) continue;
      if (m.overdue) overdue++;
      else if (m.daysRemaining === 0) today++;
      else if (m.daysRemaining === 1) tomorrow++;
      else if (m.daysRemaining <= 7) week++;
    }
    return { overdue, today, tomorrow, week };
  }, [rawTasks]);

  // Priority distribution (Greedy tiers) for the donut.
  const priorityData = useMemo<Datum[]>(() => {
    const order: PriorityKey[] = ["critical", "high", "medium", "low"];
    const counts: Record<string, number> = {};
    for (const t of rawTasks) { const k = taskPriorityKey(t); counts[k] = (counts[k] ?? 0) + 1; }
    return order.filter((k) => counts[k]).map((k) => ({ label: PRIORITY_META[k].label, value: counts[k], color: PRIORITY_META[k].color }));
  }, [rawTasks]);

  // Live team activity.
  const activity = useMemo(() => ({
    created: rawTasks.length,
    completed: rawTasks.filter((t) => t.status === "done").length,
    assigned: rawTasks.filter((t) => t.assignedTo).length,
  }), [rawTasks]);

  const names = (team?.members ?? []).map((m) => m.name || "Member");

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          {/* Progress */}
          <Card style={{ gap: spacing.md }}>
            <View style={s.rowBetween}>
              <View>
                <Text style={font.h3}>Project progress</Text>
                <Text style={s.sub}>{stats.done} of {stats.total} tasks complete</Text>
              </View>
              <Text style={s.bigPct}>{Math.round(stats.ratio * 100)}%</Text>
            </View>
            <ProgressBar value={stats.ratio} color={stats.ratio === 1 ? colors.success : colors.accent} height={10} />
            <View style={s.statusRow}>
              <Status label="To do" count={stats.todo} color={colors.textMuted} />
              <Status label="In progress" count={stats.inProgress} color={colors.info} />
              <Status label="Done" count={stats.done} color={colors.success} />
            </View>
          </Card>

          {/* Deadlines & overdue */}
          {(deadlines.overdue + deadlines.today + deadlines.tomorrow + deadlines.week) > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={font.h3}>Upcoming deadlines</Text>
              <View style={s.tileRow}>
                <MiniTile label="Overdue" value={deadlines.overdue} color={colors.danger} bad />
                <MiniTile label="Today" value={deadlines.today} color={colors.warning} />
                <MiniTile label="Tomorrow" value={deadlines.tomorrow} color={colors.info} />
                <MiniTile label="Next 7d" value={deadlines.week} color={colors.success} />
              </View>
            </Card>
          )}

          {/* Team activity (live) */}
          <Card style={{ gap: spacing.sm }}>
            <Text style={font.h3}>Team activity</Text>
            <View style={s.tileRow}>
              <MiniTile label="Created" value={activity.created} color={colors.primary} />
              <MiniTile label="Completed" value={activity.completed} color={colors.success} />
              <MiniTile label="Assigned" value={activity.assigned} color={colors.branch} />
            </View>
          </Card>

          {/* Priority distribution */}
          {priorityData.length > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={font.h3}>Priority distribution</Text>
              <Text style={s.sub}>Greedy scheduler tiers across the backlog</Text>
              <PieChart data={priorityData} />
            </Card>
          )}

          {/* Workspace Health Score */}
          {health && health.total > 0 && (
            <Card style={{ gap: spacing.md }}>
              <View style={s.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>Workspace health</Text>
                  <Text style={[s.healthVerdict, { color: healthLabel(health.score).color }]}>{healthLabel(health.score).label}</Text>
                  <Text style={s.sub}>Deterministic score from 5 weighted factors</Text>
                </View>
                <View style={[s.gradeBadge, { backgroundColor: gradeColor(health.grade) + "1a" }]}>
                  <Text style={[s.gradeScore, { color: gradeColor(health.grade) }]}>{health.score}</Text>
                  <Text style={[s.gradeLetter, { color: gradeColor(health.grade) }]}>grade {health.grade}</Text>
                </View>
              </View>
              <ProgressBar value={health.score / 100} color={healthLabel(health.score).color} height={10} />
              {health.counts && (
                <View style={s.healthChips}>
                  <HealthChip label="overdue" value={health.counts.overdue} bad />
                  <HealthChip label="assigned" value={`${health.counts.assigned}/${health.total}`} />
                  <HealthChip label="deps done" value={`${health.counts.depDone}/${health.counts.depTotal}`} />
                  <HealthChip label="in progress" value={health.counts.inProgress} />
                </View>
              )}
              <Text style={s.factorsHead}>Why this score</Text>
              <View style={{ gap: 8 }}>
                {health.factors.map((f) => (
                  <View key={f.key} style={s.factorRow}>
                    <Text style={s.factorLabel}>{f.label}</Text>
                    <View style={s.factorTrack}>
                      <View style={[s.factorFill, { width: `${f.pct}%`, backgroundColor: healthLabel(f.pct >= 100 ? 100 : f.pct).color }]} />
                    </View>
                    <Text style={s.factorPct}>{f.pct}%</Text>
                  </View>
                ))}
              </View>
              <View style={s.healthFooter}>
                <View style={s.healthFooterRow}>
                  <Text style={s.healthFooterKey}>Final Health Score</Text>
                  <Text style={s.healthFooterVal}>{health.score}/100</Text>
                </View>
                <View style={s.healthFooterRow}>
                  <Text style={s.healthFooterKey}>Grade</Text>
                  <Text style={[s.healthFooterVal, { color: gradeColor(health.grade) }]}>{health.grade} · {healthLabel(health.score).label}</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Reminders (states + upcoming list) */}
          {(reminderStates.upcoming + reminderStates.today + reminderStates.missed) > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={font.h3}>Reminders</Text>
              <View style={s.tileRow}>
                <MiniTile label="Upcoming" value={reminderStates.upcoming} color={colors.info} />
                <MiniTile label="Due Today" value={reminderStates.today} color={colors.warning} />
                <MiniTile label="Missed" value={reminderStates.missed} color={colors.danger} bad />
              </View>
              {upcoming.slice(0, 3).map((r) => (
                <View key={r.taskId} style={s.reminderRow}>
                  <Ionicons name="notifications-outline" size={16} color={colors.info} />
                  <Text style={s.reminderTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={[s.reminderWhen, { color: colors.info }]}>{new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              ))}
            </Card>
          )}

          {/* Team */}
          <Card style={{ gap: spacing.sm }}>
            <View style={s.rowBetween}>
              <Text style={font.h3}>Team</Text>
              <Badge label={`${names.length} member${names.length !== 1 ? "s" : ""}`} color={colors.primary} bg={colors.primarySoft} />
            </View>
            {names.length > 0 ? (
              <View style={s.rowBetween}>
                <AvatarStack names={names} max={6} />
                <Pressable onPress={() => onNavigate("members")}><Text style={s.link}>Manage →</Text></Pressable>
              </View>
            ) : (
              <Text style={s.sub}>No members yet — add teammates from the Members tab.</Text>
            )}
          </Card>

          {/* Quick jumps */}
          {stats.total === 0 ? (
            <EmptyState icon="sparkles-outline" title="Start with AI" message="Generate a prioritised task plan from your project description." actionLabel="Open AI chat" actionIcon="chatbubbles" onAction={() => onNavigate("chat")} />
          ) : null}

          <Text style={s.sectionLabel}>JUMP TO</Text>
          <View style={s.grid}>
            {JUMPS.map((j) => (
              <Pressable key={j.tab} style={s.tile} onPress={() => onNavigate(j.tab)}>
                <View style={[s.tileIcon, { backgroundColor: j.color + "1a" }]}><Ionicons name={j.icon} size={18} color={j.color} /></View>
                <Text style={s.tileLabel}>{j.label}</Text>
                <Text style={s.tileDesc}>{j.desc}</Text>
              </Pressable>
            ))}
          </View>

          {/* Workspace settings */}
          {canRestore && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={font.h3}>Workspace settings</Text>
              <Text style={s.sub}>Restore the original AI-generated backlog. Removes manual tasks; keeps members, profiles and settings.</Text>
              <Button title="Restore AI Backlog" icon="refresh" variant="secondary" onPress={onRestore} loading={restoring} style={{ marginTop: 4 }} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function HealthChip({ label, value, bad }: { label: string; value: number | string; bad?: boolean }) {
  const danger = bad && typeof value === "number" && value > 0;
  return (
    <View style={[s.healthChip, danger && { backgroundColor: colors.dangerSoft }]}>
      <Text style={[s.healthChipVal, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={s.healthChipLbl}>{label}</Text>
    </View>
  );
}

function MiniTile({ label, value, color, bad }: { label: string; value: number; color: string; bad?: boolean }) {
  const danger = bad && value > 0;
  return (
    <View style={[s.miniTile, danger && { backgroundColor: colors.dangerSoft }]}>
      <Text style={[s.miniTileVal, { color }]}>{value}</Text>
      <Text style={s.miniTileLbl}>{label}</Text>
    </View>
  );
}

function Status({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={s.statusItem}>
      <View style={[s.statusDot, { backgroundColor: color }]} />
      <Text style={s.statusCount}>{count}</Text>
      <Text style={s.statusLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  bigPct: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -1 },
  statusRow: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  statusItem: { flex: 1, alignItems: "center", gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusCount: { fontSize: 18, fontWeight: "800", color: colors.text },
  statusLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  link: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  healthVerdict: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  tileRow: { flexDirection: "row", gap: spacing.sm },
  miniTile: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 10, gap: 2 },
  miniTileVal: { fontSize: 20, fontWeight: "800" },
  miniTileLbl: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  reminderWhen: { fontSize: 11, fontWeight: "700", color: colors.accentDark },
  gradeBadge: { alignItems: "center", borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 6, minWidth: 70 },
  gradeScore: { fontSize: 26, fontWeight: "800", letterSpacing: -1 },
  gradeLetter: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, marginTop: -2 },
  healthChips: { flexDirection: "row", gap: spacing.sm },
  healthChip: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8 },
  healthChipVal: { fontSize: 16, fontWeight: "800", color: colors.text },
  healthChipLbl: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  factorsHead: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: colors.textFaint, marginTop: 2 },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  factorLabel: { width: 120, fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  factorTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  factorFill: { height: "100%", borderRadius: 4 },
  factorPct: { width: 40, fontSize: 12, color: colors.text, fontWeight: "800", textAlign: "right" },
  healthFooter: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  healthFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  healthFooterKey: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  healthFooterVal: { fontSize: 14, fontWeight: "800", color: colors.text },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textFaint, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: "47%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  tileDesc: { fontSize: 12, color: colors.textMuted },
});
