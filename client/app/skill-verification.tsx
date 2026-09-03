import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Badge } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

const SKILLS = [
  "Frontend", "Backend", "JavaScript", "TypeScript", "Python", "Java",
  "React", "Angular", "Vue", "Node.js", "SQL", "Docker", "Kubernetes",
  "AWS", "Figma", "TensorFlow", "PyTorch", "DevOps", "Testing", "Design",
];

type QuizQuestion = {
  index: number;
  question: string;
  options: string[];
};

type QuizState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "active"; skill: string; questions: QuizQuestion[]; answers: (number | null)[]; current: number; source: string }
  | { kind: "submitting"; skill: string; answers: (number | null)[]; questions: QuizQuestion[] }
  | { kind: "result"; skill: string; score: number; total: number; verified: boolean; source: string };

export default function SkillVerification() {
  const { user, token } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [state, setState] = useState<QuizState>({ kind: "idle" });
  const [recent, setRecent] = useState<{ skill: string; verified: boolean; score: number; total: number }[]>([]);

  // Load user's prior verifications for badge display
  const refreshVerifications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/skills/verifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const arr = await res.json();
        // Latest per skill
        const map = new Map<string, { skill: string; verified: boolean; score: number; total: number }>();
        for (const v of Array.isArray(arr) ? arr : []) {
          const k = v.skill;
          const cur = map.get(k);
          if (!cur || new Date(v.createdAt) > new Date((cur as any).createdAt ?? 0)) {
            map.set(k, {
              skill: k,
              verified: v.verified,
              score: v.score,
              total: v.totalQuestions,
            });
          }
        }
        setRecent(Array.from(map.values()));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => { if (token) refreshVerifications(); }, [token]);

  const startQuiz = async () => {
    if (!selectedSkill) {
      toast("Please select a skill to verify", "error");
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skill: selectedSkill, questionCount: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate quiz");
      const qs: QuizQuestion[] = (data.quiz?.questions || []).slice(0, 5).map((q: any) => ({
        index: q.index,
        question: q.question,
        options: q.options,
      }));
      if (qs.length !== 5) throw new Error("Quiz must contain 5 questions.");
      setState({
        kind: "active",
        skill: selectedSkill,
        questions: qs,
        answers: new Array(5).fill(null),
        current: 0,
        source: data.quiz?.source || "fallback",
      });
    } catch (e: any) {
      setState({ kind: "idle" });
      toast(e.message || "Failed to start quiz", "error");
    }
  };

  const answerCurrent = (idx: number) => {
    if (state.kind !== "active") return;
    const next = [...state.answers];
    next[state.current] = idx;
    setState({ ...state, answers: next });
  };

  const submitQuiz = async () => {
    if (state.kind !== "active") return;
    setState({ kind: "submitting", skill: state.skill, answers: state.answers, questions: state.questions });
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          skill: state.skill,
          answers: state.answers,
          totalQuestions: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit quiz");
      const r = data.result;
      // Persist to MongoDB via /api/skills/verify
      try {
        await fetch(`${API_BASE_URL}/api/skills/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            skill: state.skill,
            score: r.score,
            totalQuestions: r.total,
            difficulty: "intermediate",
          }),
        });
      } catch {
        // not fatal for the UX
      }
      setState({
        kind: "result",
        skill: state.skill,
        score: r.score,
        total: r.total,
        verified: r.verified,
        source: state.source,
      });
      refreshVerifications();
    } catch (e: any) {
      setState({ kind: "idle" });
      toast(e.message || "Failed to submit quiz", "error");
    }
  };

  const closeQuiz = () => setState({ kind: "idle" });

  const verifiedSkills = useMemo(() => recent.filter((r) => r.verified).map((r) => r.skill), [recent]);

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
          <Text style={s.sub}>
            Pick a skill, answer 5 questions. Score 3 or more correct to earn a Verified badge.
          </Text>
        </Card>

        {verifiedSkills.length > 0 && (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={font.h3}>Your verified badges</Text>
            <View style={s.badgeRow}>
              {verifiedSkills.map((sk) => (
                <View key={sk} style={s.verifyChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={s.verifyChipTxt}>{sk}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Text style={s.label}>Select Skill</Text>
        <View style={s.skillGrid}>
          {SKILLS.map((sk) => {
            const isVerified = verifiedSkills.includes(sk);
            return (
              <Pressable
                key={sk}
                style={[
                  s.skillChip,
                  selectedSkill === sk && s.skillChipSelected,
                  isVerified && { borderColor: colors.success },
                ]}
                onPress={() => setSelectedSkill(sk)}
              >
                <Text style={[s.skillChipText, selectedSkill === sk && s.skillChipTextSelected]}>
                  {sk}{isVerified ? " ✓" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button
          title={state.kind === "loading" ? "Generating Quiz..." : "Start Verification Quiz"}
          icon="school-outline"
          onPress={startQuiz}
          loading={state.kind === "loading"}
          style={{ marginTop: spacing.lg }}
          disabled={!selectedSkill || state.kind === "loading" || state.kind === "submitting"}
        />
      </ScrollView>

      {/* Quiz modal — appears immediately, no navigation away */}
      <Modal
        visible={state.kind === "active" || state.kind === "submitting" || state.kind === "result"}
        transparent
        animationType="fade"
        onRequestClose={closeQuiz}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {state.kind === "active" && (
              <ActiveQuiz
                quiz={state}
                onAnswer={answerCurrent}
                onNext={() => setState({ ...state, current: Math.min(state.current + 1, 4) })}
                onPrev={() => setState({ ...state, current: Math.max(state.current - 1, 0) })}
                onSubmit={submitQuiz}
                onClose={closeQuiz}
              />
            )}
            {state.kind === "submitting" && (
              <View style={{ padding: spacing.lg, alignItems: "center", gap: spacing.md }}>
                <Text style={font.h3}>Scoring your answers…</Text>
              </View>
            )}
            {state.kind === "result" && (
              <ResultView
                state={state}
                onClose={closeQuiz}
                onRetry={() => { setSelectedSkill(state.skill); setState({ kind: "idle" }); startQuiz(); }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActiveQuiz({
  quiz,
  onAnswer,
  onNext,
  onPrev,
  onSubmit,
  onClose,
}: {
  quiz: Extract<QuizState, { kind: "active" }>;
  onAnswer: (i: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const q = quiz.questions[quiz.current];
  const selected = quiz.answers[quiz.current];
  const isLast = quiz.current === 4;

  return (
    <View style={{ padding: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={font.h3}>{quiz.skill} Verification</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
      <Text style={[s.sub, { marginTop: 4 }]}>Question {quiz.current + 1} of 5</Text>

      <View style={{ height: 6, backgroundColor: colors.surfaceAlt, borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
        <View style={{ width: `${((quiz.current + 1) / 5) * 100}%`, height: 6, backgroundColor: colors.primary }} />
      </View>

      <Text style={[font.body, { marginTop: spacing.md, fontWeight: "700" }]}>{q.question}</Text>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {q.options.map((opt, i) => {
          const on = selected === i;
          return (
            <Pressable
              key={i}
              onPress={() => onAnswer(i)}
              style={[s.optionRow, on && s.optionRowOn]}
            >
              <View style={[s.optionDot, on && { borderColor: colors.primary }]}>
                {on ? <View style={s.optionDotInner} /> : null}
              </View>
              <Text style={[s.optionTxt, on && { fontWeight: "700", color: colors.primary }]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
        <Button title="Back" variant="secondary" onPress={onPrev} disabled={quiz.current === 0} style={{ flex: 1 }} />
        {!isLast ? (
          <Button title="Next" onPress={onNext} disabled={selected === null} style={{ flex: 1 }} />
        ) : (
          <Button title="Submit" icon="checkmark" onPress={onSubmit} disabled={quiz.answers.some((a) => a === null)} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

function ResultView({
  state,
  onClose,
  onRetry,
}: {
  state: Extract<QuizState, { kind: "result" }>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const passed = state.verified;
  return (
    <View style={{ padding: spacing.lg, alignItems: "center", gap: spacing.md }}>
      <Ionicons
        name={passed ? "checkmark-circle" : "close-circle"}
        size={56}
        color={passed ? colors.success : colors.warning}
      />
      <Text style={font.h2}>{passed ? "Verified!" : "Not Verified"}</Text>
      <Text style={s.sub}>
        You scored {state.score} out of {state.total} on {state.skill}.
      </Text>
      <Text style={s.sub}>
        {passed
          ? `${state.skill} is now verified on your profile.`
          : `You need at least 3 out of 5 to be verified. Try again.`}
      </Text>
      {passed ? (
        <View style={s.verifyChip}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={s.verifyChipTxt}>{state.skill} ✓ Verified</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" }}>
        <Button title="Close" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Try again" onPress={onRetry} style={{ flex: 1 }} />
      </View>
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
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  verifyChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success },
  verifyChipTxt: { fontSize: 12, fontWeight: "700", color: colors.success },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 0, overflow: "hidden", maxHeight: "90%" },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  optionDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  optionTxt: { flex: 1, fontSize: 14, color: colors.text },
});