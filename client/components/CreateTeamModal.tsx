/**
 * CreateTeamModal — guided 4-step "New workspace" wizard.
 *   1. Project information   (team name, project title, description)
 *   2. Your role             (Team Leader / Project Manager / Team Member)
 *   3. Team members          (add members + skill category)
 *   4. AI planning           (preview of the auto-generated starter backlog)
 *
 * Skill data feeds the Branch & Bound assignment engine; the description is
 * turned into a starter task plan (refinable later via the AI chat).
 */
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Field, Button, Avatar, Chip, Badge } from "@/components/ui";
import { colors, radius, spacing, font } from "@/theme";
import type { NewTeamInput } from "@/hooks/useTeams";

// Display label → internal skill key consumed by Branch & Bound.
const SKILLS: { label: string; key: string }[] = [
  { label: "Frontend", key: "frontend" },
  { label: "Backend", key: "backend" },
  { label: "DevOps", key: "devops" },
  { label: "Design", key: "design" },
  { label: "AI/ML", key: "ml" },
  { label: "Testing", key: "testing" },
];

const ROLES = [
  { key: "leader", label: "Team Leader", icon: "flag-outline", desc: "Owns delivery, sets priorities and unblocks the team." },
  { key: "manager", label: "Project Manager", icon: "briefcase-outline", desc: "Plans sprints, tracks scope and coordinates stakeholders." },
  { key: "member", label: "Team Member", icon: "person-outline", desc: "Picks up assigned work and ships tasks to done." },
] as const;

const STEPS = ["Project", "Your role", "Members", "AI plan"];

type DraftMember = { name: string; skillKey: string; skillLabel: string };

export default function CreateTeamModal({ visible, onClose, onCreate }: {
  visible: boolean; onClose: () => void;
  onCreate: (input: NewTeamInput) => Promise<{ error?: string }>;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState<string>("leader");
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [mName, setMName] = useState("");
  const [mSkill, setMSkill] = useState(SKILLS[0]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep(0); setName(""); setProjectTitle(""); setDescription("");
    setRole("leader"); setMembers([]); setMName(""); setMSkill(SKILLS[0]);
  };
  const close = () => { reset(); onClose(); };

  const addMember = () => {
    if (!mName.trim()) return;
    setMembers((prev) => [...prev, { name: mName.trim(), skillKey: mSkill.key, skillLabel: mSkill.label }]);
    setMName("");
  };

  const skillObject = (primary: string) => {
    const o: Record<string, number> = {};
    for (const sk of SKILLS) o[sk.key] = sk.key === primary ? 9 : 3;
    return o;
  };

  // Derive a starter backlog from the project description (one task per line/sentence).
  const previewTasks = useMemo(() => {
    const base = projectTitle ? [`Plan & scope: ${projectTitle}`] : [];
    const lines = description.split(/[\n.]/).map((l) => l.trim()).filter((l) => l.length > 4).slice(0, 6);
    return [...base, ...lines].map((title, i) => ({
      title,
      urgency: i === 0 ? 4 : 2 + (i % 3),
      impact: 2 + (i % 4),
    }));
  }, [projectTitle, description]);

  const next = () => {
    if (step === 0 && !name.trim()) { toast("Team name is required", "error"); return; }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    if (!name.trim()) { toast("Team name is required", "error"); return; }
    setBusy(true);
    const input: NewTeamInput = {
      name: name.trim(),
      members: members.map((m) => ({ name: m.name, skills: skillObject(m.skillKey) })),
      tasks: description.trim() ? previewTasks : [],
    };
    const { error } = await onCreate(input);
    setBusy(false);
    if (error) { toast(error, "error"); return; }
    toast("Workspace created", "success");
    close();
  };

  return (
    <ModalSheet visible={visible} onClose={close} title="New workspace">
      {/* Progress */}
      <View style={s.progress}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.progressItem}>
            <View style={[s.dot, i <= step && s.dotActive, i < step && s.dotDone]}>
              {i < step ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text style={[s.dotTxt, i <= step && { color: "#fff" }]}>{i + 1}</Text>}
            </View>
            <Text style={[s.progressLabel, i === step && { color: colors.text, fontWeight: "800" }]}>{label}</Text>
            {i < STEPS.length - 1 && <View style={[s.bar, i < step && { backgroundColor: colors.primary }]} />}
          </View>
        ))}
      </View>

      {/* Step 1 — Project information */}
      {step === 0 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>Tell us what you're building. You can change any of this later.</Text>
          <Field label="Team name" placeholder="e.g. Web Platform Squad" value={name} onChangeText={setName} icon="people-outline" />
          <Field label="Project title" placeholder="e.g. Authentication revamp" value={projectTitle} onChangeText={setProjectTitle} icon="rocket-outline" />
          <Field
            label="Project description"
            placeholder="Describe the project — goals, scope, key features. NexusFlow turns this into your starter backlog."
            value={description} onChangeText={setDescription} multiline
            hint="The richer your description, the better the AI plan."
          />
        </View>
      )}

      {/* Step 2 — Role selection */}
      {step === 1 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>How will you be working in this workspace?</Text>
          {ROLES.map((r) => {
            const on = role === r.key;
            return (
              <Pressable key={r.key} onPress={() => setRole(r.key)} style={[s.roleCard, on && s.roleCardOn]}>
                <View style={[s.roleIcon, on && { backgroundColor: colors.primary }]}>
                  <Ionicons name={r.icon as any} size={18} color={on ? "#fff" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.roleLabel}>{r.label}</Text>
                  <Text style={s.roleDesc}>{r.desc}</Text>
                </View>
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.primary : colors.textFaint} />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Step 3 — Team members */}
      {step === 2 && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.stepHint}>Add teammates and their main skill. Skill data helps NexusFlow assign work optimally.</Text>
          <View style={s.memberAdd}>
            <View style={{ flex: 1 }}><Field placeholder="Member name" value={mName} onChangeText={setMName} icon="person-outline" /></View>
            <Pressable style={s.addBtn} onPress={addMember}><Ionicons name="add" size={22} color="#fff" /></Pressable>
          </View>
          <View style={s.skillRow}>
            {SKILLS.map((sk) => <Chip key={sk.key} label={sk.label} active={mSkill.key === sk.key} color={colors.accentDark} onPress={() => setMSkill(sk)} />)}
          </View>

          {members.length > 0 ? (
            <View style={{ gap: 8 }}>
              {members.map((m, i) => (
                <View key={i} style={s.memberRow}>
                  <Avatar name={m.name} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{m.name}</Text>
                    <Text style={s.memberSkill}>{m.skillLabel}</Text>
                  </View>
                  <Pressable onPress={() => setMembers((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.note}>You'll be added automatically. Varied skills make the assignment engine more effective — but you can add members later too.</Text>
          )}
        </View>
      )}

      {/* Step 4 — AI planning */}
      {step === 3 && (
        <View style={{ gap: spacing.md }}>
          <View style={s.aiBanner}>
            <View style={s.aiIcon}><Ionicons name="sparkles" size={18} color={colors.accentDark} /></View>
            <Text style={s.aiTxt}>NexusFlow will analyse your project and generate this starter task structure. You can refine, re-prioritise and expand it anytime.</Text>
          </View>

          <View style={s.summaryRow}>
            <Badge label={`${members.length + 1} member${members.length ? "s" : ""}`} color={colors.primary} bg={colors.primarySoft} />
            <Badge label={`${previewTasks.length} starter task${previewTasks.length !== 1 ? "s" : ""}`} color={colors.accentDark} bg={colors.accentSoft} />
            <Badge label={ROLES.find((r) => r.key === role)?.label ?? "Member"} color={colors.merge} />
          </View>

          {previewTasks.length === 0 ? (
            <Text style={s.note}>No description provided — your workspace will start with an empty backlog. Add a description in step 1 to auto-generate tasks.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={s.previewLabel}>Preview</Text>
              {previewTasks.map((t, i) => (
                <View key={i} style={s.previewRow}>
                  <View style={s.previewNum}><Text style={s.previewNumTxt}>{i + 1}</Text></View>
                  <Text style={s.previewTitle} numberOfLines={2}>{t.title}</Text>
                  <View style={[s.previewDot, { backgroundColor: t.urgency >= 4 ? colors.danger : colors.warning }]} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Footer nav */}
      <View style={s.footer}>
        {step > 0 && <Button title="Back" icon="chevron-back" variant="secondary" onPress={back} style={{ flex: 1 }} />}
        {step < STEPS.length - 1 ? (
          <Button title="Continue" icon="chevron-forward" onPress={next} style={{ flex: 1 }} />
        ) : (
          <Button title="Create workspace" icon="rocket" onPress={submit} loading={busy} style={{ flex: 1 }} />
        )}
      </View>
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  progress: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  progressItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotTxt: { fontSize: 12, fontWeight: "800", color: colors.textFaint },
  progressLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginLeft: 6 },
  bar: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 6 },

  stepHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  roleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  roleLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  roleDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },

  memberAdd: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  skillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.text },
  memberSkill: { fontSize: 11, color: colors.textMuted },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },

  aiBanner: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.accentBorder },
  aiIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  aiTxt: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  previewLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border },
  previewNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  previewNumTxt: { fontSize: 11, fontWeight: "800", color: colors.primary },
  previewTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  previewDot: { width: 8, height: 8, borderRadius: 4 },

  footer: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
