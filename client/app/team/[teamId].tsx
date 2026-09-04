import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTeam } from "@/hooks/useTeam";
import { useInvitations } from "@/hooks/useInvitations";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarStack } from "@/components/ui";
import NotificationCenter from "@/components/NotificationCenter";
import FloatingBackground from "@/components/FloatingBackground";
import OverviewPanel from "@/components/workspace/OverviewPanel";
import PlanPanel from "@/components/workspace/PlanPanel";
import TasksPanel from "@/components/workspace/TasksPanel";
import WaterfallTimelinePanel from "@/components/workspace/WaterfallTimelinePanel";
import AssignmentBoard from "@/components/workspace/AssignmentBoard";
import WaterfallInsightsPanel from "@/components/workspace/WaterfallInsightsPanel";
import ProjectAdvisorPanel from "@/components/workspace/ProjectAdvisorPanel";
import ChatPanel from "@/components/workspace/ChatPanel";
import SprintPanel from "@/components/workspace/SprintPanel";
import GraphPanel from "@/components/workspace/GraphPanel";
import AnalyticsPanel from "@/components/workspace/AnalyticsPanel";
import GitHubPanel from "@/components/workspace/GitHubPanel";
import RiskPanel from "@/components/workspace/RiskPanel";
import RetroPanel from "@/components/workspace/RetroPanel";
import TeamHealthPanel from "@/components/workspace/TeamHealthPanel";
import MethodologyWipBanner from "@/components/MethodologyWipBanner";
import { colors, spacing, radius, font } from "@/theme";

type TabKey =
  | "overview"
  | "plan"
  | "tasks"
  | "timeline"
  | "team"
  | "insights"
  | "advisor"
  | "chat"
  | "sprint"
  | "members"
  | "graph"
  | "analytics"
  | "health"
  | "risks"
  | "github"
  | "retro";

const PRIMARY_TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "overview",  label: "Overview",   icon: "grid",                color: colors.primary },
  { key: "plan",      label: "Plan",       icon: "document-text",       color: "#4F46E5" },
  { key: "tasks",     label: "Tasks",      icon: "list",                color: colors.greedy },
  { key: "timeline",  label: "Timeline",   icon: "calendar",            color: colors.topo },
  { key: "team",      label: "Team",       icon: "people",              color: colors.branch },
  { key: "insights",  label: "Insights",   icon: "analytics",           color: colors.merge },
  { key: "advisor",   label: "Project AI", icon: "sparkles",            color: colors.accent },
  { key: "chat",      label: "Chat",       icon: "chatbubbles",         color: colors.info },
];

function normalizeTab(rawTab?: string): TabKey {
  if (!rawTab) return "overview";
  if (rawTab === "sprint") return "timeline";
  if (rawTab === "members") return "team";
  if (["graph", "analytics", "health", "risks", "retro"].includes(rawTab)) return "insights";
  if (PRIMARY_TABS.some((t) => t.key === rawTab)) return rawTab as TabKey;
  return "overview";
}

export default function Workspace() {
  const { teamId, tab } = useLocalSearchParams<{ teamId: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { team, loading: teamLoading, notFound, refetch: refetchTeam } = useTeam(teamId);
  const [active, setActive] = useState<TabKey>(normalizeTab(tab));

  // If the team was deleted (server returns 404) bounce safely to the dashboard.
  useEffect(() => {
    if (teamId && notFound && !teamLoading) {
      router.replace("/(tabs)/dashboard" as any);
    }
  }, [teamId, notFound, teamLoading, router]);

  // Shared invitation state — same hook as dashboard so bell is always in sync
  const { invitations, pendingCount, acceptInvitation, rejectInvitation } = useInvitations();

  const currentUserId = (user?._id || user?.id)?.toString();
  const currentUserEmail = (user?.email || "").toLowerCase().trim();
  const currentUserName = (user?.name || "").toLowerCase().trim();

  // STRICT: AvatarStack must NOT contain the currently authenticated user
  const otherMembers = (team?.members ?? []).filter((m) => {
    const mUserId = (typeof m.userId === "object" ? (m.userId as any)?._id : m.userId)?.toString();
    const mName = (m.name || "").toLowerCase().trim();
    if (mUserId && currentUserId && mUserId === currentUserId) return false;
    if (currentUserEmail && mName === currentUserEmail) return false;
    if (currentUserName && mName === currentUserName) return false;
    return true;
  });
  const otherNames = otherMembers.map((m) => m.name || "Member");
  const otherImages = otherMembers.map((m) => m.avatar || null);

  const methodology = team?.methodology || "WATERFALL";
  const isWaterfall = methodology === "WATERFALL";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FloatingBackground />
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        {/* Left region: Team & Project Info */}
        <View style={s.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Avatar name={team?.name ?? "Team"} size={36} image={team?.logo} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={font.h3} numberOfLines={1}>{team?.name ?? "Workspace"}</Text>
              <View
                style={[
                  s.methodologyBadge,
                  {
                    backgroundColor: (isWaterfall ? colors.primary : colors.warning) + "18",
                    borderColor: (isWaterfall ? colors.primary : colors.warning) + "44",
                  },
                ]}
              >
                <Ionicons
                  name={isWaterfall ? "git-network" : "construct"}
                  size={10}
                  color={isWaterfall ? colors.primary : colors.warning}
                />
                <Text
                  style={[
                    s.methodologyText,
                    { color: isWaterfall ? colors.primary : colors.warning },
                  ]}
                >
                  {methodology}
                </Text>
              </View>
            </View>
            {!!team?.projectTitle && (
              <Text style={s.projectTitle} numberOfLines={1}>{team.projectTitle}</Text>
            )}
            <Text style={s.headerSub} numberOfLines={1}>
              {(team?.members?.length ?? 0) === 1 ? "1 member" : `${team?.members?.length ?? 0} members`} · {(team?.taskCount ?? 0) === 1 ? "1 task" : `${team?.taskCount ?? 0} tasks`}
            </Text>
          </View>
        </View>

        {/* Center region: NexusFlow Product Branding */}
        <View style={s.headerCenter}>
          <Text style={s.brandTitle} numberOfLines={1}>
            NexusFlow - A Project Mgmt System
          </Text>
        </View>

        {/* Right region: Notification & Profile */}
        <View style={s.headerRight}>
          {otherNames.length > 0 && <AvatarStack names={otherNames} images={otherImages} max={3} />}
          {teamId && (
            <NotificationCenter
              teamId={teamId}
              invitations={invitations}
              pendingCount={pendingCount}
              onAccept={acceptInvitation}
              onReject={rejectInvitation}
              onTeamsRefetch={refetchTeam}
            />
          )}
          <Pressable
            onPress={() => router.push("/(tabs)/profile" as any)}
            hitSlop={8}
            style={s.profileBtn}
            accessibilityRole="button"
            accessibilityLabel="User Profile"
          >
            <Avatar name={user?.name ?? "User"} size={34} image={user?.avatar || null} />
          </Pressable>
        </View>
      </View>

      {/* Methodology WIP Banner for non-waterfall projects */}
      {!isWaterfall && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <MethodologyWipBanner methodology={methodology} />
        </View>
      )}

      {/* Tab bar */}
      <View style={s.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
          {PRIMARY_TABS.map((t) => {
            const on = active === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setActive(t.key)}
                style={[
                  s.tab,
                  on && {
                    backgroundColor: t.color + "16",
                    borderColor: t.color + "44",
                  },
                ]}
              >
                <Ionicons name={t.icon} size={16} color={on ? t.color : colors.textFaint} />
                <Text style={[s.tabLabel, on && { color: t.color }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Panel */}
      <View style={{ flex: 1 }}>
        {teamId && active === "overview" && (
          <OverviewPanel teamId={teamId} onNavigate={(t) => setActive(normalizeTab(t))} />
        )}
        {teamId && active === "plan" && (
          <PlanPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />
        )}
        {teamId && active === "tasks" && (
          <TasksPanel teamId={teamId} onGenerateAI={() => setActive("advisor")} />
        )}
        {teamId && active === "timeline" && (
          <WaterfallTimelinePanel teamId={teamId} />
        )}
        {teamId && active === "team" && (
          <AssignmentBoard teamId={teamId} />
        )}
        {teamId && active === "insights" && (
          <WaterfallInsightsPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />
        )}
        {teamId && active === "advisor" && (
          <ProjectAdvisorPanel teamId={teamId} />
        )}
        {teamId && active === "chat" && (
          <ChatPanel teamId={teamId} />
        )}

        {/* Legacy aliases if directly opened */}
        {teamId && active === "sprint" && <SprintPanel teamId={teamId} />}
        {teamId && active === "members" && <AssignmentBoard teamId={teamId} />}
        {teamId && active === "graph" && <GraphPanel teamId={teamId} />}
        {teamId && active === "analytics" && <AnalyticsPanel teamId={teamId} />}
        {teamId && active === "health" && <TeamHealthPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />}
        {teamId && active === "risks" && <RiskPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />}
        {teamId && active === "github" && <GitHubPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />}
        {teamId && active === "retro" && <RetroPanel teamId={teamId} projectId={team?.activeProjectId || teamId} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  headerCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    flexShrink: 0,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flex: 1,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 1,
  },
  headerSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  methodologyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  methodologyText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tabBarWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surfaceAlt,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textFaint,
  },
  profileBtn: {
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
  },
});

