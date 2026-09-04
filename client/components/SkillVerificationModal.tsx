import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

export type SkillQuestion = {
  index: number;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
};

type QuizStep = "loading" | "question" | "submitting" | "result";

interface SkillVerificationModalProps {
  visible: boolean;
  skill: string;
  roleLabel?: string;
  onClose: () => void;
  onVerified?: (skill: string, score: number) => void;
}

export default function SkillVerificationModal({
  visible,
  skill,
  roleLabel = "Role",
  onClose,
  onVerified,
}: SkillVerificationModalProps) {
  const { token, refreshProfile } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<QuizStep>("loading");
  const [questions, setQuestions] = useState<SkillQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [score, setScore] = useState(0);
  const [verified, setVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const resetState = () => {
    setStep("loading");
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setScore(0);
    setVerified(false);
    setErrorMessage("");
  };

  const loadQuiz = async () => {
    if (!skill) return;
    resetState();
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skill: skill.trim(),
          difficulty: "intermediate",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.quiz?.questions) {
        throw new Error(data.error || "Failed to generate verification quiz.");
      }

      const qs: SkillQuestion[] = (data.quiz.questions || []).slice(0, 5);
      if (qs.length !== 5) {
        throw new Error("Verification quiz requires exactly 5 questions.");
      }

      setQuestions(qs);
      setUserAnswers(new Array(5).fill(null));
      setStep("question");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load quiz.");
      toast(err.message || "Unable to start quiz right now", "error");
    }
  };

  useEffect(() => {
    if (visible && skill) {
      loadQuiz();
    }
  }, [visible, skill]);

  const handleSelectOption = (optionIndex: number) => {
    // Lock answer once selected for immediate feedback
    if (selectedAnswer !== null) return;

    setSelectedAnswer(optionIndex);
    const nextAnswers = [...userAnswers];
    nextAnswers[currentIndex] = optionIndex;
    setUserAnswers(nextAnswers);
  };

  const handleNext = () => {
    if (currentIndex < 4) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    setStep("submitting");

    // Calculate final score
    let finalScore = 0;
    for (let i = 0; i < 5; i++) {
      const q = questions[i];
      const ans = userAnswers[i];
      if (typeof q?.correctIndex === "number" && ans === q.correctIndex) {
        finalScore++;
      }
    }

    const isVerified = finalScore >= 3;
    setScore(finalScore);
    setVerified(isVerified);

    try {
      // 1. Submit quiz to /api/ai/quiz/submit
      await fetch(`${API_BASE_URL}/api/ai/quiz/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skill,
          answers: userAnswers,
          questions,
          difficulty: "intermediate",
        }),
      });

      // 2. Persist verification to /api/skills/verify
      await fetch(`${API_BASE_URL}/api/skills/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skill,
          score: finalScore,
          totalQuestions: 5,
          difficulty: "intermediate",
          questions: questions.map((q, i) => ({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            userAnswer: userAnswers[i],
          })),
        }),
      });

      if (isVerified) {
        if (refreshProfile) await refreshProfile();
        if (onVerified) onVerified(skill, finalScore);
      }
    } catch {
      // UX remains non-blocking even if network hiccup occurs
    }

    setStep("result");
  };

  if (!visible) return null;

  const currentQ = questions[currentIndex];
  const isAnswered = selectedAnswer !== null;
  const isCorrect = isAnswered && selectedAnswer === currentQ?.correctIndex;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.modalCard}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <View style={s.tagRow}>
                <View style={s.tag}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.accentDark} />
                  <Text style={s.tagTxt}>Skill Verification</Text>
                </View>
                <Text style={s.roleSubtitle}>for {roleLabel}</Text>
              </View>
              <Text style={s.title}>{skill} Quiz</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Loading State */}
          {step === "loading" && (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={s.loadingTxt}>Generating 5 verified questions for {skill}…</Text>
              <Text style={s.loadingSub}>Analyzing role-required capabilities</Text>
            </View>
          )}

          {/* Error State */}
          {step === "loading" && errorMessage ? (
            <View style={s.centerBox}>
              <Ionicons name="alert-circle" size={44} color={colors.danger} />
              <Text style={[s.loadingTxt, { color: colors.danger }]}>{errorMessage}</Text>
              <Button title="Retry" onPress={loadQuiz} style={{ marginTop: spacing.md }} />
            </View>
          ) : null}

          {/* Question Step */}
          {step === "question" && currentQ && (
            <ScrollView contentContainerStyle={s.contentScroll} keyboardShouldPersistTaps="handled">
              {/* Progress Bar */}
              <View style={s.progressContainer}>
                <View style={s.progressLabelRow}>
                  <Text style={s.progressLabel}>Question {currentIndex + 1} of 5</Text>
                  <Text style={s.progressSub}>Need 3/5 to verify</Text>
                </View>
                <View style={s.progressBarTrack}>
                  <View
                    style={[
                      s.progressBarFill,
                      { width: `${((currentIndex + 1) / 5) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Question text */}
              <Text style={s.questionText}>{currentQ.question}</Text>

              {/* Options */}
              <View style={s.optionsList}>
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedAnswer === idx;
                  const isAnswerCorrect = currentQ.correctIndex === idx;

                  let rowStyle: any = s.optionRow;
                  let textStyle: any = s.optionText;
                  let iconName = "radio-button-off-outline";
                  let iconColor = colors.textFaint;

                  if (isAnswered) {
                    if (isAnswerCorrect) {
                      rowStyle = [s.optionRow, s.optionRowCorrect];
                      textStyle = [s.optionText, s.optionTextCorrect];
                      iconName = "checkmark-circle";
                      iconColor = colors.success;
                    } else if (isSelected && !isAnswerCorrect) {
                      rowStyle = [s.optionRow, s.optionRowWrong];
                      textStyle = [s.optionText, s.optionTextWrong];
                      iconName = "close-circle";
                      iconColor = colors.danger;
                    }
                  } else if (isSelected) {
                    rowStyle = [s.optionRow, s.optionRowSelected];
                    iconName = "radio-button-on";
                    iconColor = colors.primary;
                  }

                  return (
                    <Pressable
                      key={idx}
                      style={rowStyle}
                      onPress={() => handleSelectOption(idx)}
                      disabled={isAnswered}
                    >
                      <Ionicons name={iconName as any} size={20} color={iconColor} />
                      <Text style={textStyle}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Immediate Feedback Card */}
              {isAnswered && (
                <View
                  style={[
                    s.feedbackCard,
                    isCorrect ? s.feedbackCardCorrect : s.feedbackCardWrong,
                  ]}
                >
                  <View style={s.feedbackHeader}>
                    <Ionicons
                      name={isCorrect ? "checkmark-circle" : "alert-circle"}
                      size={18}
                      color={isCorrect ? colors.success : colors.danger}
                    />
                    <Text
                      style={[
                        s.feedbackTitle,
                        { color: isCorrect ? colors.success : colors.danger },
                      ]}
                    >
                      {isCorrect ? "Correct!" : "Incorrect"}
                    </Text>
                  </View>
                  {currentQ.explanation ? (
                    <Text style={s.explanationText}>{currentQ.explanation}</Text>
                  ) : null}
                </View>
              )}

              {/* Action Button */}
              {isAnswered && (
                <Button
                  title={currentIndex < 4 ? "Next Question" : "Complete & Score Quiz"}
                  icon={currentIndex < 4 ? "arrow-forward" : "shield-checkmark"}
                  onPress={handleNext}
                  style={{ marginTop: spacing.md }}
                />
              )}
            </ScrollView>
          )}

          {/* Submitting State */}
          {step === "submitting" && (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={s.loadingTxt}>Scoring verification quiz…</Text>
            </View>
          )}

          {/* Result Step */}
          {step === "result" && (
            <View style={s.resultBox}>
              <View
                style={[
                  s.resultIconCircle,
                  verified ? s.resultCircleSuccess : s.resultCircleFail,
                ]}
              >
                <Ionicons
                  name={verified ? "ribbon" : "refresh"}
                  size={42}
                  color={verified ? colors.success : colors.warning}
                />
              </View>

              <Text style={s.resultTitle}>
                {verified ? "Skill Verified!" : "Verification Incomplete"}
              </Text>

              <Text style={s.resultSubtitle}>
                You scored <Text style={s.scoreHighlight}>{score} / 5</Text> on {skill}.
              </Text>

              <View style={s.resultDescCard}>
                <Ionicons
                  name={verified ? "shield-checkmark-outline" : "information-circle-outline"}
                  size={18}
                  color={verified ? colors.success : colors.accentDark}
                />
                <Text style={s.resultDescText}>
                  {verified
                    ? `Your ${skill} capability is now verified on your profile. The project assignment and scheduling engines will recognize this verified skill.`
                    : "A minimum score of 3 out of 5 is required to earn the Verified badge for this role. You can review the material and try again anytime."}
                </Text>
              </View>

              <View style={s.resultBtnRow}>
                {verified ? (
                  <Button
                    title="Continue to Workflow"
                    icon="checkmark"
                    onPress={onClose}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <>
                    <Button
                      title="Close"
                      variant="secondary"
                      onPress={onClose}
                      style={{ flex: 1 }}
                    />
                    <Button
                      title="Try Again"
                      icon="refresh"
                      onPress={loadQuiz}
                      style={{ flex: 1 }}
                    />
                  </>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 25, 0.75)",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roleSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  centerBox: {
    padding: spacing.xl * 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  loadingSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  contentScroll: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  progressContainer: {
    gap: 6,
    marginBottom: spacing.xs,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  progressSub: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 24,
  },
  optionsList: {
    gap: 10,
    marginTop: 4,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionRowCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  optionRowWrong: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
    lineHeight: 20,
  },
  optionTextCorrect: {
    color: colors.success,
    fontWeight: "700",
  },
  optionTextWrong: {
    color: colors.danger,
    fontWeight: "700",
  },
  feedbackCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
    marginTop: 4,
  },
  feedbackCardCorrect: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  feedbackCardWrong: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  explanationText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  resultBox: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  resultIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCircleSuccess: {
    backgroundColor: colors.successSoft,
    borderWidth: 2,
    borderColor: colors.success,
  },
  resultCircleFail: {
    backgroundColor: colors.warningSoft,
    borderWidth: 2,
    borderColor: colors.warning,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  resultSubtitle: {
    fontSize: 15,
    color: colors.textMuted,
  },
  scoreHighlight: {
    fontWeight: "800",
    color: colors.text,
  },
  resultDescCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  resultDescText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  resultBtnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
});
