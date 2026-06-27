/**
 * TeamMenu.tsx — three-dot (⋮) team management menu for the dashboard team card.
 * ---------------------------------------------------------------------------------
 * A single ModalSheet whose content is driven by `mode`. Actions:
 *   Edit name · Edit description · Change logo · Generate more AI tasks ·
 *   Add manual task (→ workspace) · Manage members · Team settings · Delete.
 *
 * Reuses existing primitives (ModalSheet, Field, Button, Chip, Avatar, Stepper,
 * ImageUploader) and the existing team/member/decompose APIs via the callbacks
 * passed from useTeams — no duplicated logic.
 */
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Team } from "@/hooks/useTeams";
import { ModalSheet, useToast } from "@/components/feedback";
import { Field, Button, Chip, Avatar, Stepper } from "@/components/ui";
import ImageUploader from "@/components/ImageUploader";
import { colors, spacing } from "@/theme";

type Mode = null | "menu" | "name" | "desc" | "logo" | "generate" | "members" | "settings";

const SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"];
const ROLES = ["leader", "manager", "member"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const GEN_PRESETS = ["Testing", "Frontend", "Backend", "AI/ML", "Deployment"];

export default function TeamMenu({
  team, onUpdate, onGenerate, onAddMember, onRemoveMember, onUpdateMember, onDelete, onNavigate,
}: {
  team: Team;
  onUpdate: (patch: any) => Promise<{ error?: string }>;
  onGenerate: (prompt: string) => Promise<{ error?: string; added?: number }>;
  onAddMember: (name: string, skills?: Record<string, number>) => Promise<{ error?: string }>;
  onRemoveMember: (userId: string) => Promise<{ error?: string }>;
  onUpdateMember: (userId: string, fields: { name?: string; role?: string }) => Promise<{ error?: string }>;
  onDelete: () => void;
  onNavigate: (tab: string) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);

  // Drafts
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.projectDescription ?? "");
  const [logo, setLogo] = useState<string | null>(team.logo || null);
  const [prompt, setPrompt] = useState("");
  const [mName, setMName] = useState("");
  const [mSkill, setMSkill] = useState("frontend");
  const [settings, setSettings] = useState({
    sprintCapacity: team.settings?.sprintCapacity ?? 40,
    defaultPriority: team.settings?.defaultPriority ?? "medium",
    defaultReminder: team.settings?.defaultReminder ?? "",
    themeColor: team.settings?.themeColor ?? "",
    aiPreferences: team.settings?.aiPreferences ?? "",
  });

  const open = (m: Mode) => {
    // Re-seed drafts from current team each time a sub-modal opens.
    if (m === "name") setName(team.name);
    if (m === "desc") setDesc(team.projectDescription ?? "");
    if (m === "logo") setLogo(team.logo || null);
    if (m === "generate") setPrompt("");
    if (m === "settings") setSettings({
      sprintCapacity: team.settings?.sprintCapacity ?? 40,
      defaultPriority: team.settings?.defaultPriority ?? "medium",
      defaultReminder: team.settings?.defaultReminder ?? "",
      themeColor: team.settings?.themeColor ?? "",
      aiPreferences: team.settings?.aiPreferences ?? "",
    });
    setMode(m);
  };

  const run = async (fn: () => Promise<{ error?: string }>, okMsg: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast(error, "error"); return false; }
    toast(okMsg, "success");
    return true;
  };

  const skillObject = (primary: string) => {
    const o: Record<string, number> = {};
    for (const k of SKILLS) o[k] = k === primary ? 9 : 3;
    return o;
  };

  const ACTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: "create-outline", label: "Edit team name", onPress: () => open("name") },
    { icon: "document-text-outline", label: "Edit description", onPress: () => open("desc") },
    { icon: "image-outline", label: "Change team logo", onPress: () => open("logo") },
    { icon: "sparkles-outline", label: "Generate more AI tasks", onPress: () => open("generate") },
    { icon: "add-circle-outline", label: "Add manual task", onPress: () => { setMode(null); onNavigate("tasks"); } },
    { icon: "people-outline", label: "Manage members", onPress: () => open("members") },
    { icon: "settings-outline", label: "Team settings", onPress: () => open("settings") },
    { icon: "trash-outline", label: "Delete team", danger: true, onPress: () => { setMode(null); onDelete(); } },
  ];

  const title = mode === "menu" ? "Team actions"
    : mode === "name" ? "Edit team name"
    : mode === "desc" ? "Edit description"
    : mode === "logo" ? "Change team logo"
    : mode === "generate" ? "Generate more AI tasks"
    : mode === "members" ? "Manage members"
    : mode === "settings" ? "Team settings" : "";

  return (
    <>
      <Pressable onPress={() => setMode("menu")} hitSlop={8} style={s.dotBtn}>
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
      </Pressable>

      <ModalSheet visible={mode !== null} onClose={() => setMode(null)} title={title}>
        {mode === "menu" && (
          <View style={{ gap: 2 }}>
            {ACTIONS.map((a) => (
              <Pressable key={a.label} style={s.actionRow} onPress={a.onPress}>
                <View style={[s.actionIcon, a.danger && { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name={a.icon} size={18} color={a.danger ? colors.danger : colors.primary} />
                </View>
                <Text style={[s.actionLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            ))}
          </View>
        )}

        {mode === "name" && (
          <>
            <Field label="Team name" value={name} onChangeText={setName} icon="people-outline" />
            <Button title="Save name" icon="checkmark" loading={busy}
              onPress={async () => { if (!name.trim()) return toast("Name required", "error"); if (await run(() => onUpdate({ name: name.trim() }), "Team renamed")) setMode(null); }} />
          </>
        )}

        {mode === "desc" && (
          <>
            <Field label="Project description" value={desc} onChangeText={setDesc} multiline />
            <Text style={s.note}>Updating the description does not change existing tasks.</Text>
            <Button title="Save description" icon="checkmark" loading={busy}
              onPress={async () => { if (await run(() => onUpdate({ projectDescription: desc.trim() }), "Description updated")) setMode(null); }} />
          </>
        )}

        {mode === "logo" && (
          <>
            <ImageUploader label="Team logo" value={logo} onChange={setLogo} shape="square" size={88} />
            <Button title="Save logo" icon="checkmark" loading={busy}
              onPress={async () => { if (await run(() => onUpdate({ logo: logo ?? "" }), "Logo updated")) setMode(null); }} />
          </>
        )}

        {mode === "generate" && (
          <>
            <Text style={s.note}>Reuses the AI decomposer to append new tasks. Existing tasks are never deleted or overwritten.</Text>
            <View style={s.chipRow}>
              {GEN_PRESETS.map((p) => (
                <Chip key={p} label={p} active={prompt.toLowerCase().includes(p.toLowerCase().replace("/ml", ""))} color={colors.accentDark} onPress={() => setPrompt(`Generate ${p} tasks`)} />
              ))}
            </View>
            <Field label="What should AI add?" placeholder="e.g. Generate testing tasks" value={prompt} onChangeText={setPrompt} icon="sparkles-outline" />
            <Button title="Generate & append" icon="add" loading={busy}
              onPress={async () => {
                setBusy(true);
                const { error, added } = await onGenerate(prompt.trim());
                setBusy(false);
                if (error) return toast(error, "error");
                toast(`Added ${added ?? 0} task${added !== 1 ? "s" : ""}`, "success");
                setMode(null);
              }} />
          </>
        )}

        {mode === "members" && (
          <>
            <Text style={s.sectionLabel}>MEMBERS ({team.members?.length ?? 0})</Text>
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
              {(team.members ?? []).map((m) => {
                const top = SKILLS.map((k) => ({ k, v: m.skills?.[k] ?? 5 })).sort((a, b) => b.v - a.v)[0];
                return (
                  <View key={m.userId} style={s.memberRow}>
                    <Avatar name={m.name || "Member"} size={34} image={m.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{m.name || "Member"}</Text>
                      <Text style={s.memberSub}>{m.role ?? "member"} · top: {top.k} ({top.v}/10)</Text>
                      <View style={s.roleRow}>
                        {ROLES.map((r) => (
                          <Chip key={r} label={r} active={(m.role ?? "member") === r} color={colors.primary}
                            onPress={() => run(() => onUpdateMember(m.userId, { role: r }), "Role updated")} />
                        ))}
                      </View>
                    </View>
                    <Pressable hitSlop={8} onPress={() => run(() => onRemoveMember(m.userId), "Member removed")}>
                      <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={s.sectionLabel}>INVITE MEMBER</Text>
            <Field label="Name" placeholder="e.g. Dana" value={mName} onChangeText={setMName} icon="person-add-outline" />
            <View style={s.chipRow}>
              {SKILLS.map((k) => <Chip key={k} label={k} active={mSkill === k} color={colors.accentDark} onPress={() => setMSkill(k)} />)}
            </View>
            <Button title="Add member" icon="person-add" loading={busy}
              onPress={async () => { if (!mName.trim()) return toast("Name required", "error"); if (await run(() => onAddMember(mName.trim(), skillObject(mSkill)), "Member added")) setMName(""); }} />
          </>
        )}

        {mode === "settings" && (
          <>
            <View style={s.settingRow}>
              <Text style={s.settingLabel}>Sprint capacity (h)</Text>
              <Stepper value={settings.sprintCapacity} onChange={(v) => setSettings((x) => ({ ...x, sprintCapacity: v }))} min={1} max={400} step={5} />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.settingLabel}>Default priority</Text>
              <View style={s.chipRow}>
                {PRIORITIES.map((p) => <Chip key={p} label={p} active={settings.defaultPriority === p} color={colors.primary} onPress={() => setSettings((x) => ({ ...x, defaultPriority: p }))} />)}
              </View>
            </View>
            <Field label="Default reminder" placeholder="e.g. 1 day before due" value={settings.defaultReminder} onChangeText={(v) => setSettings((x) => ({ ...x, defaultReminder: v }))} icon="notifications-outline" />
            <Field label="Theme color (hex)" placeholder="#2F4F4F" value={settings.themeColor} onChangeText={(v) => setSettings((x) => ({ ...x, themeColor: v }))} icon="color-palette-outline" />
            <Field label="AI generation preferences" placeholder="e.g. favour backend & testing tasks" value={settings.aiPreferences} onChangeText={(v) => setSettings((x) => ({ ...x, aiPreferences: v }))} multiline />
            <Button title="Save settings" icon="checkmark" loading={busy}
              onPress={async () => { if (await run(() => onUpdate({ settings }), "Settings saved")) setMode(null); }} />
          </>
        )}

        {mode && mode !== "menu" && (
          <Button title="Back" icon="chevron-back" variant="ghost" onPress={() => setMode("menu")} />
        )}
      </ModalSheet>
    </>
  );
}

const s = StyleSheet.create({
  dotBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },

  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 11, paddingHorizontal: 4 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },

  note: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: colors.textFaint, marginTop: 4 },

  memberRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.text },
  memberSub: { fontSize: 11, color: colors.textMuted, marginTop: 1, textTransform: "capitalize" },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },

  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
});
