/**
 * ApplyRoleModal.tsx — V4 Professional Skill-Based Team Application Flow
 *
 * Implements the 10-step professional application flow:
 * 1. Role Overview & Expectations
 * 2. Skills Requirements Checklist
 * 3. Take 5-question skill verification quiz (SkillVerificationModal)
 * 4. Real-time skill-match calculation
 * 5. Professional application message
 * 6. Application preview
 * 7. Submit to leader review queue
 * 8. Status tracking timeline
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Avatar, Badge, Button } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, radius, spacing, font } from "@/theme";
import SkillVerificationModal from "@/components/SkillVerificationModal";
import type { DiscoverableTeam, DiscoverableRole } from "./DiscoverTeamsModal";

interface ApplyRoleModalProps {
  visible: boolean;
  team: DiscoverableTeam;
  role: DiscoverableRole;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ApplyRoleModal({
  visible,
  team,
  role,
  onClose,
  onSuccess,
}: ApplyRoleModalProps) {
  const { user, token, refreshProfile } = useAuth();
  const toast = useToast();

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedApp, setSubmittedApp] = useState<any | null>(null);

  // Skill verification trigger state
  const [quizSkill, setQuizSkill] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<Record<string, { score: number; percentage: number; verified: boolean }>>({});

  // Fetch candidate's current verified badges
  const [verifiedBadges, setVerifiedBadges] = useState<string[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);

  useEffect(() => {
    async function loadUserVerifications() {
      if (!visible || !token) return;
      setLoadingBadges(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/skills/verifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.verifications)) {
          const verified = data.verifications
            .filter((v: any) => v.verified === true)
            .map((v: any) => String(v.skill).toLowerCase().trim());
          setVerifiedBadges(verified);
        }
      } catch (err: any) {
        console.warn("[ApplyRoleModal] Error loading verifications:", err.message);
      } finally {
        setLoadingBadges(false);
      }
    }
    loadUserVerifications();
  }, [visible, token]);

  const userProfileSkills = useMemo(() => {
    return (user?.skills || []).map((s: string) => String(s).toLowerCase().trim());
  }, [user]);

  // Check if a skill is verified or possessed
  const isSkillVerified = (skillName: string) => {
    const s = skillName.toLowerCase().trim();
    return verifiedBadges.includes(s) || (quizResults[s] && quizResults[s].verified);
  };

  const hasSkill = (skillName: string) => {
    const s = skillName.toLowerCase().trim();
    return isSkillVerified(s) || userProfileSkills.includes(s);
  };

  // Compute live skill match
  const skillMatch = useMemo(() => {
    const req = (role.requiredSkills || []).map((s) => s.toLowerCase().trim());
    const pref = (role.preferredSkills || []).map((s) => s.toLowerCase().trim());

    const matchedReq = req.filter(hasSkill);
    const matchedPref = pref.filter(hasSkill);

    let matchPercentage = 100;
    if (req.length > 0 && pref.length > 0) {
      matchPercentage = Math.round((matchedReq.length / req.length) * 70 + (matchedPref.length / pref.length) * 30);
    } else if (req.length > 0) {
      matchPercentage = Math.round((matchedReq.length / req.length) * 100);
    } else if (pref.length > 0) {
      matchPercentage = Math.round((matchedPref.length / pref.length) * 100);
    }

    let label = "Developing";
    if (matchPercentage >= 70) label = "High";
    else if (matchPercentage >= 40) label = "Moderate";

    return {
      matchPercentage,
      matchedReqCount: matchedReq.length,
      totalReqCount: req.length,
      matchedPrefCount: matchedPref.length,
      totalPrefCount: pref.length,
      label,
    };
  }, [role, verifiedBadges, quizResults, userProfileSkills]);

  // Submit Application
  const handleSubmit = async () => {
    if (!message.trim()) {
      toast("Please include a brief message explaining your interest and experience.", "error");
      return;
    }

    // Find the latest completed quiz result if available
    const quizEntries = Object.entries(quizResults);
    const lastQuiz = quizEntries.length > 0 ? {
      skill: quizEntries[0][0],
      score: quizEntries[0][1].score,
      percentage: quizEntries[0][1].percentage,
      verified: quizEntries[0][1].verified,
    } : null;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/discovery/teams/${team._id}/roles/${role._id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: message.trim(),
          quizResult: lastQuiz,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit application.");
      }

      setSubmittedApp(data.application);
      toast("Application submitted for leader review!", "success");
      onSuccess?.();
    } catch (err: any) {
      toast(err.message || "Unable to submit application.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalSheet visible={visible} onClose={onClose} title={submittedApp ? "Application Submitted" : "Role Application"}>
        {submittedApp ? (
          /* Submission Success & Status Timeline */
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.md, alignItems: "center", paddingVertical: spacing.md }}>
            <View style={s.successCircle}>
              <Ionicons name="checkmark-done" size={40} color={colors.success} />
            </View>
            <Text style={font.h3}>Application Submitted!</Text>
            <Text style={s.successSub}>
              Your application for <Text style={{ fontWeight: "700", color: colors.text }}>{role.roleName}</Text> on team <Text style={{ fontWeight: "700", color: colors.text }}>{team.name}</Text> has been sent to the workspace leaders for review.
            </Text>

            {/* Application Timeline */}
            <View style={s.timelineCard}>
              <Text style={s.timelineTitle}>APPLICATION STATUS</Text>
              <View style={s.timelineItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={s.timelineStepDone}>Application Submitted</Text>
                  <Text style={s.timelineStepSub}>Under leader review queue</Text>
                </View>
              </View>
              <View style={s.timelineItem}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.timelineStepActive}>Leader Evaluation</Text>
                  <Text style={s.timelineStepSub}>Leaders will inspect your verified skills & quiz score</Text>
                </View>
              </View>
              <View style={s.timelineItem}>
                <Ionicons name="ellipse-outline" size={18} color={colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text style={s.timelineStepPending}>Team Membership</Text>
                  <Text style={s.timelineStepSub}>Upon acceptance, your account joins the workspace</Text>
                </View>
              </View>
            </View>

            <Button
              title="Done"
              icon="checkmark"
              onPress={onClose}
              style={{ width: "100%", marginTop: spacing.sm }}
            />
          </ScrollView>
        ) : (
          /* Application Form */
          <ScrollView
            style={{ maxHeight: 540 }}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {/* Role Header Card */}
            <View style={s.roleBanner}>
              <View style={{ flex: 1 }}>
                <Text style={s.roleBannerTitle}>{role.roleName}</Text>
                <Text style={s.roleBannerSub}>{team.name} · {role.availableSlots - role.filledSlots} slots left</Text>
              </View>
              <Badge label={`${skillMatch.matchPercentage}% Match`} color={skillMatch.label === "High" ? colors.success : colors.accent} />
            </View>

            {/* Skill Verification Checklist */}
            <View style={s.card}>
              <Text style={s.cardTitle}>REQUIRED SKILLS CHECKLIST</Text>
              <Text style={s.cardSubtitle}>
                Take a 5-question skill verification quiz to demonstrate proficiency to team leaders:
              </Text>

              {role.requiredSkills?.map((skillName) => {
                const verified = isSkillVerified(skillName);
                return (
                  <View key={skillName} style={s.skillRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Ionicons
                        name={verified ? "checkmark-circle" : "shield-outline"}
                        size={18}
                        color={verified ? colors.success : colors.textMuted}
                      />
                      <Text style={[s.skillName, verified && { color: colors.success, fontWeight: "700" }]}>
                        {skillName}
                      </Text>
                      {verified && (
                        <View style={s.verifiedChip}>
                          <Text style={s.verifiedChipText}>Verified</Text>
                        </View>
                      )}
                    </View>

                    {!verified && (
                      <Pressable
                        style={s.takeQuizBtn}
                        onPress={() => setQuizSkill(skillName)}
                      >
                        <Ionicons name="sparkles" size={13} color={colors.primary} />
                        <Text style={s.takeQuizText}>Take Quiz</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Skill Match Summary Card */}
            <View style={s.matchSummaryCard}>
              <View style={s.matchMetric}>
                <Text style={s.matchMetricValue}>{skillMatch.matchPercentage}%</Text>
                <Text style={s.matchMetricLabel}>Skill Match</Text>
              </View>
              <View style={s.matchDivider} />
              <View style={s.matchMetric}>
                <Text style={[s.matchMetricValue, { color: skillMatch.label === "High" ? colors.success : colors.accent }]}>
                  {skillMatch.label}
                </Text>
                <Text style={s.matchMetricLabel}>Compatibility</Text>
              </View>
              <View style={s.matchDivider} />
              <View style={s.matchMetric}>
                <Text style={s.matchMetricValue}>{skillMatch.matchedReqCount}/{skillMatch.totalReqCount}</Text>
                <Text style={s.matchMetricLabel}>Required Skills</Text>
              </View>
            </View>

            {/* Candidate Message Field */}
            <View style={s.card}>
              <Text style={s.cardTitle}>APPLICATION STATEMENT</Text>
              <Text style={s.cardSubtitle}>
                Tell the team leader why you want to join and what you bring to the project:
              </Text>
              <TextInput
                style={s.messageInput}
                placeholder="e.g. I have experience building React components and state management with Redux. I can dedicate 10 hrs/week and look forward to contributing."
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={4}
                value={message}
                onChangeText={setMessage}
              />
            </View>

            {/* Submit Action */}
            <Button
              title="Submit Application for Review"
              icon="send"
              loading={submitting}
              onPress={handleSubmit}
              style={{ marginTop: spacing.xs }}
            />
          </ScrollView>
        )}
      </ModalSheet>

      {/* 5-Question Skill Verification Quiz Modal */}
      {quizSkill && (
        <SkillVerificationModal
          visible={!!quizSkill}
          skill={quizSkill}
          roleLabel={role.roleName}
          onClose={() => setQuizSkill(null)}
          onVerified={(skill, score) => {
            const isPassing = score >= (role.minVerificationScore || 3);
            setQuizResults((prev) => ({
              ...prev,
              [skill.toLowerCase().trim()]: {
                score,
                percentage: Math.round((score / 5) * 100),
                verified: isPassing,
              },
            }));
            if (isPassing) {
              setVerifiedBadges((prev) => [...new Set([...prev, skill.toLowerCase().trim()])]);
            }
            refreshProfile?.();
            setQuizSkill(null);
          }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  roleBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  roleBannerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  roleBannerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 16,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + "55",
  },
  skillName: {
    fontSize: 13,
    color: colors.text,
  },
  verifiedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.success + "1a",
    borderWidth: 1,
    borderColor: colors.success + "55",
  },
  verifiedChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.success,
  },
  takeQuizBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary + "44",
  },
  takeQuizText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  matchSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  matchMetric: {
    alignItems: "center",
    gap: 2,
  },
  matchMetricValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
  },
  matchMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    textTransform: "uppercase",
  },
  matchDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  messageInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    fontSize: 13,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  successCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.success + "1a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  successSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  timelineCard: {
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  timelineStepDone: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  timelineStepActive: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  timelineStepPending: {
    fontSize: 13,
    color: colors.textMuted,
  },
  timelineStepSub: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
});
