import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTeam } from "@/hooks/useTeam";
import { Avatar, AvatarStack } from "@/components/ui";
import OverviewPanel from "@/components/workspace/OverviewPanel";
import TasksPanel from "@/components/workspace/TasksPanel";
import SprintPanel from "@/components/workspace/SprintPanel";
import AssignmentBoard from "@/components/workspace/AssignmentBoard";
import GraphPanel from "@/components/workspace/GraphPanel";
import AnalyticsPanel from "@/components/workspace/AnalyticsPanel";
import ChatPanel from "@/components/workspace/ChatPanel";
import RecommendationPanel from "@/components/RecommendationPanel";
import { colors, spacing, radius, font } from "@/theme";

type TabKey = "overview" | "tasks" | "chat" | "sprint" | "graph" | "members" | "analytics" | "recommend";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "overview",  label: "Overview",  icon: "grid",                color: colors.primary },
  { key: "tasks",     label: "Tasks",     icon: "list",                color: colors.greedy },
  { key: "chat",      label: "Chat",      icon: "chatbubbles",         color: colors.primary },
  { key: "sprint",    label: "Sprint",    icon: "rocket",              color: colors.knapsack },
  { key: "graph",     label: "Graph",     icon: "git-network",         color: colors.topo },
  { key: "members",   label: "Members",   icon: "people",              color: colors.branch },
  { key: "analytics", label: "Analytics", icon: "stats-chart",         color: colors.merge },
  { key: "recommend", label: "AI Rec",    icon: "sparkles",            color: colors.accent },
];

export default function Workspace() {
  const { teamId, tab } = useLocalSearchParams<{ teamId: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { team } = useTeam(teamId);
  const [active, setActive] = useState<TabKey>((tab as TabKey) && TABS.some((t) => t.key === tab) ? (tab as TabKey) : "overview");

  const names = (team?.members ?? []).map((m) => m.name || "Member");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Avatar name={team?.name ?? "Team"} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3} numberOfLines={1}>{team?.name ?? "Workspace"}</Text>
          <Text style={s.headerSub}>{team?.members?.length ?? 0} members · {team?.taskCount ?? 0} tasks</Text>
        </View>
        {names.length > 0 && <AvatarStack names={names} max={3} />}
      </View>

      {/* Tab bar */}
      <View style={s.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <Pressable key={t.key} onPress={() => setActive(t.key)} style={[s.tab, on && { backgroundColor: t.color + "16", borderColor: t.color + "44" }]}>
                <Ionicons name={t.icon} size={16} color={on ? t.color : colors.textFaint} />
                <Text style={[s.tabLabel, on && { color: t.color }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Panel */}
      <View style={{ flex: 1 }}>
        {teamId && active === "overview" && <OverviewPanel teamId={teamId} onNavigate={(t) => setActive(t as TabKey)} />}
        {teamId && active === "tasks" && <TasksPanel teamId={teamId} onGenerateAI={() => setActive("chat")} />}
        {teamId && active === "sprint" && <SprintPanel teamId={teamId} />}
        {teamId && active === "members" && <AssignmentBoard teamId={teamId} />}
        {teamId && active === "graph" && <GraphPanel teamId={teamId} />}
        {teamId && active === "analytics" && <AnalyticsPanel teamId={teamId} />}
        {teamId && active === "recommend" && <RecommendationPanel teamId={teamId} />}
        {teamId && active === "chat" && <ChatPanel teamId={teamId} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  tabBarWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: "transparent", backgroundColor: colors.surfaceAlt },
  tabLabel: { fontSize: 13, fontWeight: "700", color: colors.textFaint },
});
