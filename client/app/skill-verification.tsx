import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Badge } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

const SKILLS = ["Frontend", "Backend", "Python", "Java", "JavaScript", "React", "Node.js", "SQL", "Machine Learning", "DevOps", "Testing", "Design"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

export default function SkillVerification() {
  const { user, token } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const startQuiz = async () => {
    if (!selectedSkill) {
      toast("Please select a skill to verify", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skill: selectedSkill, difficulty, questionCount: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate quiz");
      setResult({ type: "quiz", data });
    } catch (e: any) {
      toast(e.message || "Failed to start quiz", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={font.h3}>Skill Verification</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={font.h3}>Verify Your Skills</Text>
          <Text style={s.sub}>Select a skill and pass an AI-generated quiz to earn a verified badge. You need 80% or higher to verify.</Text>
        </Card>

        <Text style={s.label}>Select Skill</Text>
        <View style={s.skillGrid}>
          {SKILLS.map((sk) => (
            <Pressable
              key={sk}
              style={[s.skillChip, selectedSkill === sk && s.skillChipSelected]}
              onPress={() => setSelectedSkill(sk)}
            >
              <Text style={[s.skillChipText, selectedSkill === sk && s.skillChipTextSelected]}>{sk}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[s.label, { marginTop: spacing.md }]}>Difficulty</Text>
        <View style={s.diffRow}>
          {DIFFICULTIES.map((d) => (
            <Pressable
              key={d}
              style={[s.diffChip, difficulty === d && s.diffChipSelected]}
              onPress={() => setDifficulty(d)}
            >
              <Text style={[s.diffChipText, difficulty === d && s.diffChipTextSelected]}>{d}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          title={loading ? "Generating Quiz..." : "Start Verification Quiz"}
          icon="school-outline"
          onPress={startQuiz}
          loading={loading}
          style={{ marginTop: spacing.lg }}
          disabled={!selectedSkill}
        />

        {result && (
          <Card style={{ marginTop: spacing.lg, gap: spacing.sm, borderColor: colors.success + "44" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={[font.h3, { color: colors.success }]}>Verified!</Text>
            </View>
            <Text style={s.sub}>You scored {result.data?.percentage ?? 0}% on {selectedSkill}.</Text>
            <Badge label="Verified" color={colors.success} bg={colors.successSoft} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  scroll: { padding: spacing.lg, paddingBottom: 80 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 8 },
  skillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  skillChipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  skillChipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  skillChipTextSelected: { color: colors.primary, fontWeight: "700" },
  diffRow: { flexDirection: "row", gap: 8 },
  diffChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  diffChipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  diffChipText: { fontSize: 13, fontWeight: "600", color: colors.textMuted, textTransform: "capitalize" },
  diffChipTextSelected: { color: colors.accent, fontWeight: "700" },
});
