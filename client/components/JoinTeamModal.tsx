/**
 * JoinTeamModal — join an existing team by adding yourself as a member.
 * Lists all teams; tapping one adds the current user (enables you in the
 * Branch & Bound roster).
 */
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Field, Avatar, EmptyState } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";
import type { Team } from "@/hooks/useTeams";

export default function JoinTeamModal({ visible, onClose, teams, defaultName, onJoin }: {
  visible: boolean; onClose: () => void; teams: Team[]; defaultName: string;
  onJoin: (teamId: string, name: string) => Promise<{ error?: string }>;
}) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [busyId, setBusyId] = useState<string | null>(null);

  const join = async (team: Team) => {
    if (!name.trim()) { toast("Enter your name first", "error"); return; }
    setBusyId(team._id);
    const { error } = await onJoin(team._id, name.trim());
    setBusyId(null);
    if (error) { toast(error, "error"); return; }
    toast(`Joined ${team.name}`, "success");
    onClose();
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Join a Team">
      <Field label="Your display name" value={name} onChangeText={setName} placeholder="Your name" />
      {teams.length === 0 ? (
        <EmptyState icon="people-outline" title="No teams to join" message="Create the first team to get started." />
      ) : (
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
          {teams.map((team) => (
            <Pressable key={team._id} style={s.row} onPress={() => join(team)} disabled={busyId === team._id}>
              <Avatar name={team.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{team.name}</Text>
                <Text style={s.sub}>{team.members?.length ?? 0} members · {team.taskCount} tasks</Text>
              </View>
              {busyId === team._id
                ? <Ionicons name="hourglass" size={18} color={colors.textMuted} />
                : <Ionicons name="add-circle" size={24} color={colors.primary} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
