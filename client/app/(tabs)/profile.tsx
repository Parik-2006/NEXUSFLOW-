import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTeams } from "@/hooks/useTeams";
import { Avatar, Button, Card, Field, Chip, Badge, StatCard } from "@/components/ui";
import ImageUploader from "@/components/ImageUploader";
import FloatingBackground from "@/components/FloatingBackground";
import { ModalSheet, useConfirm, useToast } from "@/components/feedback";
import { getItem, setItem } from "@/utils/storage";
import { colors, spacing, radius, font, layout, glass, shadow } from "@/theme";

const SKILL_OPTIONS = ["Frontend", "Backend", "DevOps", "Design", "AI/ML", "Testing", "Product", "QA"];
const EXPERIENCE = ["Junior", "Mid-level", "Senior", "Lead", "Principal"];

type ProfileData = { role: string; bio: string; skills: string[]; experience: string; image: string | null };
const DEFAULTS: ProfileData = { role: "Product Builder", bio: "", skills: ["Frontend"], experience: "Mid-level", image: null };

// Web-only gradient cover; solid fallback on native.
const coverStyle = Platform.OS === "web"
  ? ({ backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)` } as any)
  : { backgroundColor: colors.primary };

export default function Profile() {
  const { user, signOut } = useAuth();
  const { teams } = useTeams();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const key = `nf_profile_${user?.email ?? "anon"}`;
  const [profile, setProfile] = useState<ProfileData>(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileData>(DEFAULTS);

  useEffect(() => {
    getItem(key).then((raw) => { if (raw) try { setProfile({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {} });
  }, [key]);

  const stats = useMemo(() => {
    const totalTasks = teams.reduce((s, t) => s + (t.taskCount ?? 0), 0);
    const totalDone = teams.reduce((s, t) => s + (t.doneCount ?? 0), 0);
    const completion = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;
    return { teams: teams.length, totalTasks, totalDone, completion };
  }, [teams]);

  const openEdit = () => { setDraft(profile); setEditing(true); };
  const save = async () => {
    setProfile(draft);
    await setItem(key, JSON.stringify(draft));
    setEditing(false);
    toast("Profile updated", "success");
  };
  const toggleSkill = (sk: string) =>
    setDraft((d) => ({ ...d, skills: d.skills.includes(sk) ? d.skills.filter((x) => x !== sk) : [...d.skills, sk] }));

  const onSignOut = async () => {
    const ok = await confirm({ title: "Sign out?", message: "You'll need to sign in again to access your workspaces.", confirmLabel: "Sign out", destructive: true });
    if (ok) signOut();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FloatingBackground />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: 60 }]}>
        <View style={s.container}>
          {/* Identity — cover banner + circular photo + glass body */}
          <View style={s.identityCard}>
            <View style={[s.cover, coverStyle]} />
            <View style={[s.glassBody, glass as any]}>
              <View style={s.identityTop}>
                <View style={s.avatarWrap}>
                  <Avatar name={user?.name ?? "User"} size={92} image={profile.image} />
                </View>
                <Button title="Edit" icon="create-outline" variant="secondary" small onPress={openEdit} />
              </View>
              <Text style={font.h2}>{user?.name ?? "User"}</Text>
              <Text style={s.role}>{profile.role}</Text>
              {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : <Text style={s.bioEmpty}>Add a short bio to tell your team what you do.</Text>}
              <View style={s.metaRow}>
                <View style={s.metaItem}><Ionicons name="mail-outline" size={15} color={colors.textMuted} /><Text style={s.metaTxt}>{user?.email ?? "—"}</Text></View>
                <View style={s.metaItem}><Ionicons name="ribbon-outline" size={15} color={colors.textMuted} /><Text style={s.metaTxt}>{profile.experience}</Text></View>
              </View>
            </View>
          </View>

          {/* Statistics */}
          <View style={s.statsGrid}>
            <StatCard icon="people" label="Teams" value={stats.teams} color={colors.primary} />
            <StatCard icon="list" label="Tasks" value={stats.totalTasks} color={colors.greedy} />
            <StatCard icon="checkmark-done" label="Completion" value={`${stats.completion}%`} color={colors.success} />
          </View>

          {/* Skills */}
          <Card style={{ gap: spacing.sm }}>
            <Text style={font.h3}>Skills</Text>
            {profile.skills.length === 0 ? (
              <Text style={s.muted}>No skills added yet.</Text>
            ) : (
              <View style={s.tagRow}>
                {profile.skills.map((sk) => <Badge key={sk} label={sk} color={colors.accentDark} bg={colors.accentSoft} />)}
              </View>
            )}
          </Card>

          {/* Team memberships */}
          <Card style={{ gap: spacing.sm }}>
            <Text style={font.h3}>Team memberships</Text>
            {teams.length === 0 ? (
              <Text style={s.muted}>You're not part of any team yet.</Text>
            ) : (
              teams.map((t) => (
                <Pressable key={t._id} style={s.row} onPress={() => router.push(`/team/${t._id}` as any)}>
                  <Avatar name={t.name} size={34} image={t.logo} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{t.name}</Text>
                    <Text style={s.rowSub}>{t.members?.length ?? 0} members · {t.taskCount} tasks</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </Pressable>
              ))
            )}
          </Card>

          {/* Projects worked on */}
          <Card style={{ gap: spacing.sm }}>
            <Text style={font.h3}>Projects</Text>
            {teams.length === 0 ? (
              <Text style={s.muted}>Projects you contribute to will appear here.</Text>
            ) : (
              <View style={s.tagRow}>
                {teams.map((t) => (
                  <View key={t._id} style={s.projectChip}>
                    <View style={[s.projectDot, { backgroundColor: t.doneCount === t.taskCount && t.taskCount > 0 ? colors.success : colors.accent }]} />
                    <Text style={s.projectTxt}>{t.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Footer actions */}
          <Pressable style={s.linkRow} onPress={() => router.push("/daa-insights" as any)}>
            <View style={[s.linkIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="school-outline" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.linkTitle}>DAA Insights</Text>
              <Text style={s.linkSub}>How the algorithms power NexusFlow — for demos & mentors</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>

          <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={onSignOut} />
        </View>
      </ScrollView>

      <ModalSheet visible={editing} onClose={() => setEditing(false)} title="Edit profile">
        <ImageUploader label="Profile photo" value={draft.image} onChange={(img) => setDraft((d) => ({ ...d, image: img }))} shape="circle" size={88} />
        <Field label="Role" placeholder="e.g. Senior Frontend Engineer" value={draft.role} onChangeText={(v) => setDraft((d) => ({ ...d, role: v }))} icon="briefcase-outline" />
        <Field label="Bio" placeholder="A sentence or two about your work and focus." value={draft.bio} onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))} multiline />
        <View style={{ gap: 8 }}>
          <Text style={s.fieldLabel}>Experience</Text>
          <View style={s.tagRow}>
            {EXPERIENCE.map((e) => <Chip key={e} label={e} active={draft.experience === e} color={colors.primary} onPress={() => setDraft((d) => ({ ...d, experience: e }))} />)}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.fieldLabel}>Skills</Text>
          <View style={s.tagRow}>
            {SKILL_OPTIONS.map((sk) => <Chip key={sk} label={sk} active={draft.skills.includes(sk)} color={colors.accentDark} onPress={() => toggleSkill(sk)} />)}
          </View>
        </View>
        <Button title="Save changes" icon="checkmark" onPress={save} style={{ marginTop: spacing.sm }} />
      </ModalSheet>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, alignItems: "center" },
  container: { width: "100%", maxWidth: layout.narrow + 120, gap: spacing.lg },

  identityCard: { borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...(shadow.md as object) },
  cover: { height: 110 },
  glassBody: { padding: spacing.lg, gap: 6, marginTop: -1 },
  identityTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -64, marginBottom: 6 },
  avatarWrap: { borderWidth: 4, borderColor: colors.surface, borderRadius: 999, backgroundColor: colors.surface, ...(shadow.sm as object) },
  role: { fontSize: 13, color: colors.accentDark, fontWeight: "700", marginTop: 1 },
  bio: { fontSize: 14, color: colors.text, lineHeight: 21, marginTop: 6 },
  bioEmpty: { fontSize: 13, color: colors.textFaint, fontStyle: "italic", marginTop: 6 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTxt: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },

  statsGrid: { flexDirection: "row", gap: spacing.sm },

  muted: { fontSize: 13, color: colors.textMuted },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  projectChip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  projectDot: { width: 8, height: 8, borderRadius: 4 },
  projectTxt: { fontSize: 13, fontWeight: "600", color: colors.text },

  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  linkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  linkSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
});
