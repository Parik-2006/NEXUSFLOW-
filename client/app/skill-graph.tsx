import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Badge, Avatar } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

export default function SkillGraph() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [graph, setGraph] = useState<any>(null);
  const [gaps, setGaps] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/skills/team/${teamId}/graph`, {
      headers: { Authorization: `Bearer ${user}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(setGraph)
      .catch(() => toast("Failed to load skill graph", "error"))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    fetch(`${API_BASE_URL}/api/skills/team/${teamId}/gaps`, {
      headers: { Authorization: `Bearer ${user}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(setGaps)
      .catch(() => {});
  }, [teamId]);

  if (loading) {
    return (
      <View style={s.root}>
        <Text style={s.loading}>Loading skill graph...</Text>
      </View>
    );
  }

  if (!graph) {
    return (
      <View style={s.root}>
        <Card style={{ alignItems: "center", padding: spacing.xxl }}>
          <Ionicons name="git-network-outline" size={48} color={colors.textFaint} />
          <Text style={[font.h3, { marginTop: spacing.md }]}>No Team Selected</Text>
          <Text style={s.sub}>Select a team to view the skill graph and gap analysis.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={font.h3}>Team Skill Graph</Text>
          <Text style={s.sub}>{graph.teamName} — {graph.members.length} members</Text>
        </Card>

        {gaps?.gaps?.length > 0 && (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md, borderColor: colors.warning + "44" }}>
            <Text style={[font.h3, { color: colors.warning }]}>Skill Gaps</Text>
            {gaps.gaps.map((g: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Ionicons name={g.severity === "critical" ? "warning" : "information-circle"} size={16} color={g.severity === "critical" ? colors.danger : colors.info} />
                <View style={{ flex: 1 }}>
                  <Text style={s.gapMsg}>{g.message}</Text>
                  <Text style={s.gapRec}>{g.recommendation}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {gaps?.strengths?.length > 0 && (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md, borderColor: colors.success + "44" }}>
            <Text style={[font.h3, { color: colors.success }]}>Team Strengths</Text>
            {gaps.strengths.map((s: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={s.gapMsg}>{s.message}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: spacing.md }}>
          <Text style={font.h3}>Member Skills</Text>
          {graph.members.map((m: any) => (
            <View key={m.userId} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar name={m.name} size={32} image={m.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={s.memberName}>{m.name}</Text>
                  <Text style={s.memberRole}>{m.role}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {Object.entries(m.skills).map(([skill, data]: [string, any]) => (
                  <Badge
                    key={skill}
                    label={`${skill} ${data.level}/10${data.verified ? " ✓" : ""}`}
                    color={data.verified ? colors.success : colors.textFaint}
                    bg={data.verified ? colors.successSoft : colors.surfaceAlt}
                  />
                ))}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 80 },
  loading: { textAlign: "center", marginTop: spacing.xxl, color: colors.textMuted },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  memberName: { fontSize: 14, fontWeight: "700", color: colors.text },
  memberRole: { fontSize: 12, color: colors.textMuted, textTransform: "capitalize" },
  gapMsg: { fontSize: 13, color: colors.text, lineHeight: 18 },
  gapRec: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
