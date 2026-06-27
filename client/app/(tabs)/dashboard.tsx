import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTeams } from "@/hooks/useTeams";
import { useAuth } from "@/context/AuthContext";
import {
  Card, Button, StatCard, SkeletonCard, FAB, ProgressBar, AvatarStack, Badge, Avatar, EmptyState,
} from "@/components/ui";
import { useToast, useConfirm } from "@/components/feedback";
import CreateTeamModal from "@/components/CreateTeamModal";
import JoinTeamModal from "@/components/JoinTeamModal";
import TeamMenu from "@/components/TeamMenu";
import FloatingBackground from "@/components/FloatingBackground";
import { getItem } from "@/utils/storage";
import { colors, radius, spacing, font, layout } from "@/theme";

const QUICK = [
  { tab: "tasks", icon: "list-outline", label: "Tasks", color: colors.greedy },
  { tab: "sprint", icon: "rocket-outline", label: "Sprint", color: colors.knapsack },
  { tab: "graph", icon: "git-network-outline", label: "Graph", color: colors.topo },
  { tab: "chat", icon: "chatbubbles-outline", label: "Chat", color: colors.primary },
] as const;

const ONBOARD = [
  { icon: "people-outline", title: "Create a workspace", desc: "Name your team and the project you're tackling." },
  { icon: "person-add-outline", title: "Invite your team", desc: "Add members with their skills so work routes correctly." },
  { icon: "document-text-outline", title: "Describe the project", desc: "Write a short brief — what you're building and why." },
  { icon: "sparkles-outline", title: "Let AI plan it", desc: "NexusFlow drafts tasks, effort and your first sprint." },
] as const;

export default function Dashboard() {
  const { teams, loading, error, refetch, createTeam, deleteTeam, joinTeam, updateTeam, generateTasks, addMember, removeMember, updateMember } = useTeams();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [myImage, setMyImage] = useState<string | null>(null);
  useEffect(() => {
    getItem(`nf_profile_${user?.email ?? "anon"}`).then((raw) => {
      if (raw) try { setMyImage(JSON.parse(raw).image ?? null); } catch {}
    });
  }, [user?.email]);

  const stats = useMemo(() => {
    const totalTasks = teams.reduce((s, t) => s + (t.taskCount ?? 0), 0);
    const totalDone = teams.reduce((s, t) => s + (t.doneCount ?? 0), 0);
    const members = teams.reduce((s, t) => s + (t.members?.length ?? 0), 0);
    const openTasks = totalTasks - totalDone;
    const completion = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;
    return { totalTasks, totalDone, members, openTasks, completion };
  }, [teams]);

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const open = (teamId: string, tab?: string) =>
    router.push(`/team/${teamId}${tab ? `?tab=${tab}` : ""}` as any);

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({ title: `Delete "${name}"?`, message: "This permanently removes the team and all its tasks.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    const { error } = await deleteTeam(id);
    toast(error ?? "Team deleted", error ? "error" : "success");
  };

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FloatingBackground />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.greeting}>{greeting},</Text>
              <Text style={font.h1}>{user?.name ?? "there"}</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/profile" as any)} hitSlop={8}>
              <Avatar name={user?.name ?? "User"} size={46} image={myImage} />
            </Pressable>
          </View>

          {/* Command-center stats */}
          <View style={s.statsGrid}>
            <StatCard icon="people" label="Teams" value={teams.length} color={colors.primary} />
            <StatCard icon="list" label="Open tasks" value={stats.openTasks} color={colors.greedy} />
            <StatCard icon="person" label="Members" value={stats.members} color={colors.branch} />
          </View>
          <View style={s.statsGrid}>
            <StatCard icon="checkmark-done" label="Completion" value={`${stats.completion}%`} color={colors.success} sub={`${stats.totalDone}/${stats.totalTasks} done`} />
            <StatCard icon="rocket" label="Sprint" value={stats.openTasks > 0 ? "Active" : "Idle"} color={colors.knapsack} />
            <StatCard icon="sparkles" label="AI plans" value={teams.length} color={colors.accent} sub="ready" />
          </View>

          {/* Actions */}
          <View style={s.actions}>
            <Button title="New workspace" icon="add" onPress={() => setShowCreate(true)} style={{ flex: 1 }} />
            <Button title="Join team" icon="enter-outline" variant="secondary" onPress={() => setShowJoin(true)} style={{ flex: 1 }} />
          </View>

          {/* Teams */}
          <View style={s.sectionHead}>
            <Text style={font.h2}>Your workspaces</Text>
            {teams.length > 0 && <Badge label={`${teams.length}`} color={colors.primary} bg={colors.primarySoft} />}
          </View>

          {loading ? (
            <View style={{ gap: spacing.md }}><SkeletonCard /><SkeletonCard /></View>
          ) : error ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't load your workspaces" message="Check that the NexusFlow backend is running on port 4000, then retry." actionLabel="Retry" actionIcon="refresh" onAction={refetch} />
          ) : teams.length === 0 ? (
            <Card style={{ gap: spacing.lg, padding: spacing.xl }}>
              <View style={s.onboardHead}>
                <View style={s.onboardIcon}><Ionicons name="rocket" size={26} color={colors.primary} /></View>
                <Text style={[font.h2, { textAlign: "center" }]}>Create your first workspace</Text>
                <Text style={s.onboardSub}>NexusFlow turns a project brief into a planned, prioritised backlog in seconds. Here's how it works:</Text>
              </View>
              <View style={{ gap: spacing.md }}>
                {ONBOARD.map((step, i) => (
                  <View key={step.title} style={s.step}>
                    <View style={s.stepNum}><Text style={s.stepNumTxt}>{i + 1}</Text></View>
                    <View style={s.stepIcon}><Ionicons name={step.icon as any} size={18} color={colors.accentDark} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.stepTitle}>{step.title}</Text>
                      <Text style={s.stepDesc}>{step.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Button title="Create your first workspace" icon="add" onPress={() => setShowCreate(true)} />
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {teams.map((team) => {
                const ratio = team.taskCount ? team.doneCount / team.taskCount : 0;
                const names = (team.members ?? []).map((m) => m.name || "Member");
                const memberImages = (team.members ?? []).map((m) => m.avatar || null);
                return (
                  <Card key={team._id} style={{ gap: spacing.md }}>
                    <Pressable onPress={() => open(team._id)} style={s.cardTop}>
                      <Avatar name={team.name} size={42} image={team.logo} />
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3} numberOfLines={1}>{team.name}</Text>
                        <Text style={s.cardSub}>{team.doneCount}/{team.taskCount} tasks · {names.length} member{names.length !== 1 ? "s" : ""}</Text>
                      </View>
                      {names.length > 0 && <AvatarStack names={names} images={memberImages} />}
                      <TeamMenu
                        team={team}
                        onUpdate={(patch) => updateTeam(team._id, patch)}
                        onGenerate={(prompt) => generateTasks(team._id, prompt)}
                        onAddMember={(name, skills) => addMember(team._id, name, skills)}
                        onRemoveMember={(uid) => removeMember(team._id, uid)}
                        onUpdateMember={(uid, fields) => updateMember(team._id, uid, fields)}
                        onDelete={() => onDelete(team._id, team.name)}
                        onNavigate={(tab) => open(team._id, tab)}
                      />
                      <Pressable onPress={() => onDelete(team._id, team.name)} hitSlop={8} style={s.trash}>
                        <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                      </Pressable>
                    </Pressable>

                    <View style={{ gap: 5 }}>
                      <ProgressBar value={ratio} color={ratio === 1 ? colors.success : colors.accent} />
                      <Text style={s.pct}>{Math.round(ratio * 100)}% complete</Text>
                    </View>

                    <View style={s.quickRow}>
                      {QUICK.map((q) => (
                        <Pressable key={q.tab} style={s.quick} onPress={() => open(team._id, q.tab)}>
                          <Ionicons name={q.icon as any} size={18} color={q.color} />
                          <Text style={s.quickLabel}>{q.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <FAB icon="add" label="New" onPress={() => setShowCreate(true)} />

      <CreateTeamModal visible={showCreate} onClose={() => setShowCreate(false)} onCreate={createTeam} />
      <JoinTeamModal visible={showJoin} onClose={() => setShowJoin(false)} teams={teams} defaultName={user?.name ?? ""} onJoin={joinTeam} />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, alignItems: "center" },
  container: { width: "100%", maxWidth: layout.maxWidth, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  greeting: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  trash: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  pct: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  quickRow: { flexDirection: "row", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  quick: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  quickLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  // Onboarding empty state
  onboardHead: { alignItems: "center", gap: 6 },
  onboardIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  onboardSub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 20, maxWidth: 420 },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  stepIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  stepDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1, lineHeight: 17 },
});
