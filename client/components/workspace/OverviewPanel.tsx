/**
 * OverviewPanel — workspace "command center" landing tab.
 * Summarises progress, status breakdown and team, with quick jumps into the
 * other tabs. Read-only; pulls from useTeam + useTeamTasks.
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTeam } from "@/hooks/useTeam";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import { Card, ProgressBar, AvatarStack, Badge, EmptyState, SkeletonCard } from "@/components/ui";
import { colors, spacing, radius, font } from "@/theme";

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
  const { rawTasks, loading } = useTeamTasks(teamId);

  const stats = useMemo(() => {
    const todo = rawTasks.filter((t) => t.status === "todo").length;
    const inProgress = rawTasks.filter((t) => t.status === "in_progress").length;
    const done = rawTasks.filter((t) => t.status === "done").length;
    const total = rawTasks.length;
    const ratio = total ? done / total : 0;
    return { todo, inProgress, done, total, ratio };
  }, [rawTasks]);

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
        </>
      )}
    </ScrollView>
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
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.textFaint, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: "47%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  tileDesc: { fontSize: 12, color: colors.textMuted },
});
