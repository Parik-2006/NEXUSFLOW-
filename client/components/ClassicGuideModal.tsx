/**
 * client/components/ClassicGuideModal.tsx
 * ============================================================================
 * NEXUSFLOW V1 — DAA PROJECT MANAGEMENT GUIDE MODAL
 *
 * Comprehensive interactive tutorial explaining the original 6 MERN-stack tabs
 * and classical algorithms (0/1 Knapsack, Kahn's Topological Sort, DFS/BFS,
 * Greedy Scheduler, EDF, Branch & Bound, Boyer-Moore, Merge Sort).
 *
 * Strictly isolated to NexusFlow Classic — zero AI story or ceremony intrusions.
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/theme";
import { CLASSIC_GUIDE_STEPS, DAA_ALGORITHMS, type ClassicGuideStep } from "@/constants/classicGuideData";

interface ClassicGuideModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateTab?: (tabKey: string) => void;
}

export default function ClassicGuideModal({
  visible,
  onClose,
  onNavigateTab,
}: ClassicGuideModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showAlgorithms, setShowAlgorithms] = useState(false);

  const step: ClassicGuideStep = CLASSIC_GUIDE_STEPS[currentStepIndex];

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < CLASSIC_GUIDE_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleJumpToTab = () => {
    if (onNavigateTab) {
      onNavigateTab(step.tabTarget);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.modalContainer}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="hardware-chip-outline" size={22} color={colors.primary} />
                <Text style={s.headerTitle}>NexusFlow V1 — DAA Project Management Guide</Text>
              </View>
              <Text style={s.headerSub}>
                Original MERN-stack project management system powered by classical Design and Analysis of Algorithms.
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={s.closeBtn}
              accessibilityLabel="Close Classic Guide"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Toggle between Step-by-Step and Algorithms Glossary */}
          <View style={s.navToggleRow}>
            <Pressable
              onPress={() => setShowAlgorithms(false)}
              style={[s.toggleBtn, !showAlgorithms && s.toggleBtnActive]}
            >
              <Ionicons
                name="layers-outline"
                size={14}
                color={!showAlgorithms ? colors.primary : colors.textSecondary}
              />
              <Text style={[s.toggleBtnTxt, !showAlgorithms && s.toggleBtnTxtActive]}>
                6-Tab System Guide
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowAlgorithms(true)}
              style={[s.toggleBtn, showAlgorithms && s.toggleBtnActive]}
            >
              <Ionicons
                name="code-slash-outline"
                size={14}
                color={showAlgorithms ? colors.primary : colors.textSecondary}
              />
              <Text style={[s.toggleBtnTxt, showAlgorithms && s.toggleBtnTxtActive]}>
                Algorithms Behind NexusFlow V1
              </Text>
            </Pressable>
          </View>

          {/* Main Scrollable Body */}
          <ScrollView style={s.scrollBody} contentContainerStyle={s.scrollContent}>
            {!showAlgorithms ? (
              <>
                {/* Step Selector Pills */}
                <View style={s.stepPillsRow}>
                  {CLASSIC_GUIDE_STEPS.map((st, idx) => {
                    const isCurrent = idx === currentStepIndex;
                    return (
                      <Pressable
                        key={st.step}
                        onPress={() => setCurrentStepIndex(idx)}
                        style={[s.stepPill, isCurrent && { borderColor: st.color, backgroundColor: st.color + "12" }]}
                      >
                        <Text style={[s.stepPillNum, isCurrent && { color: st.color, fontWeight: "800" }]}>
                          Step {st.step}
                        </Text>
                        <Text style={[s.stepPillLabel, isCurrent && { color: st.color, fontWeight: "700" }]} numberOfLines={1}>
                          {st.title.split(". ")[1]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Active Step Card */}
                <View style={[s.stepHeroCard, { borderLeftColor: step.color }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[s.stepIconBox, { backgroundColor: step.color + "18" }]}>
                      <Ionicons name={step.icon as any} size={22} color={step.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.stepHeroTitle}>{step.title}</Text>
                      <Text style={s.stepHeroTagline}>{step.tagline}</Text>
                    </View>
                  </View>

                  <Text style={s.stepHeroDesc}>{step.desc}</Text>

                  {/* Mathematical Formulation (for 0/1 Knapsack) */}
                  {step.formulation && (
                    <View style={s.formulationBox}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <Ionicons name="calculator-outline" size={14} color="#6B21A8" />
                        <Text style={s.formulationHead}>0/1 Knapsack Formulation</Text>
                      </View>
                      <Text style={s.formulationCode}>{step.formulation}</Text>
                    </View>
                  )}

                  {/* Highlights Bullet List */}
                  <View style={s.highlightsSection}>
                    <Text style={s.highlightsTitle}>Key Capabilities & Workflows:</Text>
                    <View style={{ gap: 6 }}>
                      {step.highlights.map((h, i) => (
                        <View key={i} style={s.highlightItem}>
                          <Ionicons name="checkmark-circle" size={15} color={step.color} style={{ marginTop: 2 }} />
                          <Text style={s.highlightTxt}>{h}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Algorithm Integration Card */}
                  {step.algorithmName && (
                    <View style={s.algoCallout}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="hardware-chip-outline" size={14} color={step.color} />
                        <Text style={[s.algoCalloutTitle, { color: step.color }]}>
                          Algorithmic Foundation: {step.algorithmName}
                        </Text>
                      </View>
                      <Text style={s.algoCalloutTxt}>{step.algorithmSummary}</Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              /* Dedicated Algorithms Glossary */
              <View style={{ gap: 12 }}>
                <View style={s.algoIntroBox}>
                  <Text style={s.algoIntroHead}>Algorithms Behind NexusFlow V1</Text>
                  <Text style={s.algoIntroTxt}>
                    NexusFlow Classic manages complex planning, execution sequencing, and resource distribution using classical polynomial-time algorithms, dynamic programming, and pruned state-space search.
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {DAA_ALGORITHMS.map((algo) => (
                    <View key={algo.name} style={s.algoCard}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <Text style={s.algoCardName}>{algo.name}</Text>
                        <View style={s.complexityBadge}>
                          <Text style={s.complexityTxt}>{algo.complexity}</Text>
                        </View>
                      </View>

                      <View style={s.algoAppRow}>
                        <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.primary} />
                        <Text style={s.algoAppTxt}>
                          <Text style={{ fontWeight: "700", color: colors.text }}>Application: </Text>
                          {algo.originalApplication}
                        </Text>
                      </View>

                      <Text style={s.algoCardDesc}>{algo.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Controls */}
          <View style={s.footer}>
            {!showAlgorithms ? (
              <>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Pressable
                    onPress={handlePrev}
                    disabled={currentStepIndex === 0}
                    style={[s.navBtn, currentStepIndex === 0 && s.navBtnDisabled]}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={currentStepIndex === 0 ? colors.textMuted : colors.text}
                    />
                    <Text style={[s.navBtnTxt, currentStepIndex === 0 && { color: colors.textMuted }]}>
                      Previous
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleNext}
                    disabled={currentStepIndex === CLASSIC_GUIDE_STEPS.length - 1}
                    style={[s.navBtn, currentStepIndex === CLASSIC_GUIDE_STEPS.length - 1 && s.navBtnDisabled]}
                  >
                    <Text style={[s.navBtnTxt, currentStepIndex === CLASSIC_GUIDE_STEPS.length - 1 && { color: colors.textMuted }]}>
                      Next
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={currentStepIndex === CLASSIC_GUIDE_STEPS.length - 1 ? colors.textMuted : colors.text}
                    />
                  </Pressable>

                  <Text style={s.stepCounter}>
                    Step {currentStepIndex + 1} of {CLASSIC_GUIDE_STEPS.length}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={handleJumpToTab}
                    style={[s.jumpBtn, { backgroundColor: step.color }]}
                  >
                    <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                    <Text style={s.jumpBtnTxt}>
                      Open {step.title.split(". ")[1]} Tab
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={s.stepCounter}>9 Classical Algorithms Documented</Text>
                <Pressable onPress={() => setShowAlgorithms(false)} style={s.navBtn}>
                  <Ionicons name="arrow-back" size={15} color={colors.text} />
                  <Text style={s.navBtnTxt}>Return to 6 Steps</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 820,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#ffffff",
    gap: 12,
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSub: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  navToggleRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 10,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  toggleBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  toggleBtnTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  toggleBtnTxtActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  scrollBody: {
    maxHeight: 520,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  stepPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  stepPillNum: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
  },
  stepPillLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#334155",
  },
  stepHeroCard: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 4,
    gap: 12,
  },
  stepIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  stepHeroTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  stepHeroTagline: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  stepHeroDesc: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 19,
  },
  formulationBox: {
    padding: 12,
    backgroundColor: "#FAF5FF",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    gap: 4,
  },
  formulationHead: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#6B21A8",
  },
  formulationCode: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#581C87",
    lineHeight: 18,
  },
  highlightsSection: {
    gap: 8,
  },
  highlightsTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  highlightTxt: {
    fontSize: 12.5,
    color: "#334155",
    flex: 1,
    lineHeight: 17,
  },
  algoCallout: {
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  algoCalloutTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  algoCalloutTxt: {
    fontSize: 11.5,
    color: "#64748b",
    lineHeight: 16,
  },
  algoIntroBox: {
    padding: 14,
    backgroundColor: "#EFF6FF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    gap: 4,
  },
  algoIntroHead: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E40AF",
  },
  algoIntroTxt: {
    fontSize: 12.5,
    color: "#1E3A8A",
    lineHeight: 18,
  },
  algoCard: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  algoCardName: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  complexityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
  complexityTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    fontFamily: "monospace",
  },
  algoAppRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  algoAppTxt: {
    fontSize: 12,
    color: "#334155",
    flex: 1,
    lineHeight: 16,
  },
  algoCardDesc: {
    fontSize: 11.5,
    color: "#64748b",
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    backgroundColor: "#ffffff",
    flexWrap: "wrap",
    gap: 10,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navBtnTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
  stepCounter: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748b",
    marginLeft: 4,
  },
  jumpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  jumpBtnTxt: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#ffffff",
  },
});

