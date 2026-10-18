/**
 * client/components/WaterfallGuideModal.tsx
 * ============================================================================
 * NEXUSFLOW V4 — WATERFALL WORKSPACE STEP-BY-STEP TUTORIAL MODAL
 *
 * Lightweight, educational in-workspace guide modal.
 * Does NOT alter tasks, assignments, risk statuses, plan approvals, or project data.
 *
 * Features:
 *   - Overview of the 6 canonical Waterfall phases
 *   - Step-by-step breakdown of all 8 primary workspace tabs
 *   - Detailed breakdown of all 5 Insights sub-tabs
 *   - Direct jump to any tab in the current workspace (via onNavigate)
 *   - Link to open full documentation in /docs
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, font } from "@/theme";
import {
  WATERFALL_PHASES,
  WATERFALL_TAB_GUIDES,
  WATERFALL_WORKFLOW_SEQUENCE,
  WaterfallTabGuide,
} from "@/constants/waterfallGuideData";

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigateTab?: (tabKey: string) => void;
  initialTab?: string;
}

export default function WaterfallGuideModal({
  visible,
  onClose,
  onNavigateTab,
  initialTab,
}: Props) {
  const router = useRouter();
  const [selectedTabKey, setSelectedTabKey] = useState<string>(initialTab || "overview");
  const [viewMode, setViewMode] = useState<"tabs" | "phases" | "sequence">("tabs");

  const activeTabGuide =
    WATERFALL_TAB_GUIDES.find((t) => t.tabKey === selectedTabKey) || WATERFALL_TAB_GUIDES[0];

  const handleJumpToTab = (navKey: string) => {
    onClose();
    if (onNavigateTab) {
      onNavigateTab(navKey);
    }
  };

  const handleOpenDocs = () => {
    onClose();
    router.push("/docs?section=methodologies&guide=waterfall" as any);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalBox}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.iconWrap}>
                <Ionicons name="compass" size={20} color="#fff" />
              </View>
              <View>
                <Text style={font.h3}>Waterfall Workspace Guide</Text>
                <Text style={s.subtitle}>Step-by-step walkthrough of all 7 tabs & 6 phases</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Mode Switcher */}
          <View style={s.modeSwitcher}>
            <Pressable
              onPress={() => setViewMode("tabs")}
              style={[s.modeBtn, viewMode === "tabs" && s.modeBtnActive]}
            >
              <Ionicons
                name="layers-outline"
                size={14}
                color={viewMode === "tabs" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeBtnText, viewMode === "tabs" && s.modeBtnTextActive]}>
                7 Workspace Tabs
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setViewMode("phases")}
              style={[s.modeBtn, viewMode === "phases" && s.modeBtnActive]}
            >
              <Ionicons
                name="git-commit-outline"
                size={14}
                color={viewMode === "phases" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeBtnText, viewMode === "phases" && s.modeBtnTextActive]}>
                6 Waterfall Phases
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setViewMode("sequence")}
              style={[s.modeBtn, viewMode === "sequence" && s.modeBtnActive]}
            >
              <Ionicons
                name="trail-sign-outline"
                size={14}
                color={viewMode === "sequence" ? colors.primary : colors.textMuted}
              />
              <Text style={[s.modeBtnText, viewMode === "sequence" && s.modeBtnTextActive]}>
                Workflow Order
              </Text>
            </Pressable>
          </View>

          {/* Main Content Area */}
          <ScrollView contentContainerStyle={s.contentScroll} showsVerticalScrollIndicator>
            {/* VIEW MODE 1: TABS BREAKDOWN */}
            {viewMode === "tabs" && (
              <View style={{ gap: spacing.md }}>
                {/* Horizontal Tab Selector Pills */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.tabPillsContainer}
                >
                  {WATERFALL_TAB_GUIDES.map((tab) => {
                    const active = tab.tabKey === selectedTabKey;
                    return (
                      <Pressable
                        key={tab.tabKey}
                        onPress={() => setSelectedTabKey(tab.tabKey)}
                        style={[s.tabPill, active && s.tabPillActive]}
                      >
                        <Ionicons
                          name={tab.icon as any}
                          size={15}
                          color={active ? "#fff" : colors.textMuted}
                        />
                        <Text style={[s.tabPillText, active && s.tabPillTextActive]}>
                          {tab.tabName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Active Tab Detailed Guide Card */}
                <View style={s.tabCard}>
                  <View style={s.tabCardHeader}>
                    <View style={s.tabCardTitleRow}>
                      <View style={s.tabBadgeIcon}>
                        <Ionicons name={activeTabGuide.icon as any} size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={font.h2}>{activeTabGuide.tabName} Tab</Text>
                        <Text style={s.purposeTxt}>{activeTabGuide.purpose}</Text>
                      </View>
                    </View>
                    {onNavigateTab && (
                      <Pressable
                        onPress={() => handleJumpToTab(activeTabGuide.navKey)}
                        style={s.jumpBtn}
                      >
                        <Text style={s.jumpBtnText}>Go to {activeTabGuide.tabName}</Text>
                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                      </Pressable>
                    )}
                  </View>

                  {/* When to use */}
                  <View style={s.infoRow}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoLabel}>When to Use</Text>
                      <Text style={s.infoDesc}>{activeTabGuide.whenToUse}</Text>
                    </View>
                  </View>

                  {/* What to do (Numbered steps) */}
                  <View style={s.stepsBlock}>
                    <Text style={s.sectionHeader}>What to Do:</Text>
                    {activeTabGuide.steps.map((st, i) => (
                      <View key={i} style={s.stepItem}>
                        <View style={s.stepNum}>
                          <Text style={s.stepNumTxt}>{i + 1}</Text>
                        </View>
                        <Text style={s.stepTxt}>{st}</Text>
                      </View>
                    ))}
                  </View>

                  {/* What comes next */}
                  <View style={s.nextActionCard}>
                    <Ionicons name="compass-outline" size={16} color="#0d9488" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.nextActionLabel}>What Comes Next</Text>
                      <Text style={s.nextActionTxt}>{activeTabGuide.whatComesNext}</Text>
                    </View>
                  </View>

                  {/* Key Concepts (if present) */}
                  {activeTabGuide.keyConcepts && activeTabGuide.keyConcepts.length > 0 && (
                    <View style={s.conceptsBlock}>
                      <Text style={s.sectionHeader}>Key Concepts to Know:</Text>
                      {activeTabGuide.keyConcepts.map((kc, i) => (
                        <View key={i} style={s.conceptCard}>
                          <Text style={s.conceptTerm}>{kc.term}:</Text>
                          <Text style={s.conceptDef}>{kc.explanation}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Sub-tabs breakdown for Insights */}
                  {activeTabGuide.subTabs && activeTabGuide.subTabs.length > 0 && (
                    <View style={s.subTabsBlock}>
                      <Text style={font.h3}>Insights 5 Sub-Tabs Explained:</Text>
                      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                        {activeTabGuide.subTabs.map((st) => (
                          <View key={st.key} style={s.subTabCard}>
                            <View style={s.subTabHeader}>
                              <Ionicons name={st.icon as any} size={16} color={colors.primary} />
                              <Text style={s.subTabTitle}>{st.name}</Text>
                            </View>
                            <Text style={s.subTabPurpose}>{st.purpose}</Text>
                            <View style={s.subTabDetailRow}>
                              <Text style={s.subTabDetailLabel}>Signals:</Text>
                              <Text style={s.subTabDetailTxt}>{st.whatItShows}</Text>
                            </View>
                            <View style={s.subTabDetailRow}>
                              <Text style={s.subTabDetailLabel}>Action:</Text>
                              <Text style={s.subTabDetailTxt}>{st.recommendedAction}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* VIEW MODE 2: 6 PHASES BREAKDOWN */}
            {viewMode === "phases" && (
              <View style={{ gap: spacing.md }}>
                <Text style={s.leadTxt}>
                  Waterfall is a disciplined, phase-gated engineering methodology. Each phase produces
                  formal deliverables that must be verified before the next phase gate opens.
                </Text>
                {WATERFALL_PHASES.map((p) => (
                  <View key={p.id} style={s.phaseCard}>
                    <View style={s.phaseHeader}>
                      <View style={s.phaseNumberBadge}>
                        <Text style={s.phaseNumberTxt}>{p.number}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3}>{p.name}</Text>
                        <Text style={s.phaseSummary}>{p.summary}</Text>
                      </View>
                    </View>

                    <View style={s.phaseSection}>
                      <Text style={s.phaseSectionLabel}>Key Deliverables:</Text>
                      <View style={s.tagWrap}>
                        {p.deliverables.map((d, i) => (
                          <View key={i} style={s.deliverableTag}>
                            <Ionicons name="checkmark-circle" size={12} color="#0d9488" />
                            <Text style={s.deliverableTagTxt}>{d}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={s.phaseSection}>
                      <Text style={s.phaseSectionLabel}>Actions in NexusFlow:</Text>
                      {p.keyActions.map((ka, i) => (
                        <View key={i} style={s.bulletRow}>
                          <Text style={s.bulletDot}>•</Text>
                          <Text style={s.bulletTxt}>{ka}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* VIEW MODE 3: WORKFLOW ORDER */}
            {viewMode === "sequence" && (
              <View style={{ gap: spacing.md }}>
                <Text style={s.leadTxt}>
                  Follow this natural sequence when working on a Waterfall project in NexusFlow:
                </Text>
                <View style={s.sequenceList}>
                  {WATERFALL_WORKFLOW_SEQUENCE.map((seq) => (
                    <View key={seq.step} style={s.seqCard}>
                      <View style={s.seqStepNum}>
                        <Text style={s.seqStepNumTxt}>{seq.step}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.seqTitleRow}>
                          <Text style={s.seqTabName}>{seq.tab}</Text>
                          <Text style={s.seqLabel}>— {seq.label}</Text>
                        </View>
                        <Text style={s.seqDesc}>{seq.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={s.educationalNote}>
                  <Ionicons name="information-circle-outline" size={18} color="#0d9488" />
                  <Text style={s.educationalNoteTxt}>
                    <Text style={{ fontWeight: "700" }}>Note:</Text> You can navigate to any tab at
                    any time to inspect information. However, task progression remains strictly
                    governed by completed prerequisites and phase gate approvals.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <Pressable onPress={handleOpenDocs} style={s.fullDocsBtn}>
              <Ionicons name="book-outline" size={16} color={colors.primary} />
              <Text style={s.fullDocsBtnTxt}>Open Full Documentation</Text>
            </Pressable>
            <Pressable onPress={onClose} style={s.doneBtn}>
              <Text style={s.doneBtnTxt}>Got it, Close Guide</Text>
            </Pressable>
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
  modalBox: {
    width: "100%",
    maxWidth: 820,
    maxHeight: "92%",
    backgroundColor: "#FDFBF7",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#E5DECE",
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 20px 45px rgba(0,0,0,0.22)" },
      default: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DECE",
    backgroundColor: "#FAF7EE",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: "#0d9488",
    justifyContent: "center",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  modeSwitcher: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: "#FAF7EE",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DECE",
    gap: spacing.xs,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  modeBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  modeBtnText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  modeBtnTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  contentScroll: {
    padding: spacing.lg,
  },
  tabPillsContainer: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F3EDE0",
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  tabPillActive: {
    backgroundColor: "#0d9488",
    borderColor: "#0d9488",
  },
  tabPillText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabPillTextActive: {
    color: "#fff",
  },
  tabCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E5DECE",
    padding: spacing.lg,
    gap: spacing.md,
  },
  tabCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3EDE0",
    paddingBottom: spacing.md,
  },
  tabCardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    flex: 1,
    minWidth: 220,
  },
  tabBadgeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: "#EEF8F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CCEDE6",
  },
  purposeTxt: {
    fontSize: 13,
    color: colors.text,
    marginTop: 4,
    lineHeight: 18,
  },
  jumpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0d9488",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  jumpBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FAF7EE",
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoDesc: {
    fontSize: 13,
    color: colors.text,
    marginTop: 2,
    lineHeight: 18,
  },
  stepsBlock: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FDFBF7",
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#F0E9DA",
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#0d9488",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  stepNumTxt: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  stepTxt: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  nextActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EEF8F6",
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#CCEDE6",
  },
  nextActionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0d9488",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextActionTxt: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "600",
    marginTop: 2,
  },
  conceptsBlock: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3EDE0",
    paddingTop: spacing.md,
  },
  conceptCard: {
    backgroundColor: "#FAF7EE",
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  conceptTerm: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  conceptDef: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  subTabsBlock: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F3EDE0",
    paddingTop: spacing.md,
  },
  subTabCard: {
    backgroundColor: "#FAF7EE",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E5DECE",
    padding: spacing.sm,
    gap: 4,
  },
  subTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subTabTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  subTabPurpose: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
    marginBottom: 2,
  },
  subTabDetailRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  subTabDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    width: 50,
  },
  subTabDetailTxt: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  leadTxt: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  phaseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E5DECE",
    padding: spacing.md,
    gap: spacing.sm,
  },
  phaseHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3EDE0",
    paddingBottom: spacing.sm,
  },
  phaseNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0d9488",
    justifyContent: "center",
    alignItems: "center",
  },
  phaseNumberTxt: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  phaseSummary: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  phaseSection: {
    gap: 4,
  },
  phaseSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    textTransform: "uppercase",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  deliverableTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FAF7EE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  deliverableTagTxt: {
    fontSize: 11,
    color: colors.text,
    fontWeight: "600",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: colors.primary,
    fontWeight: "800",
  },
  bulletTxt: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  sequenceList: {
    gap: 8,
  },
  seqCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E5DECE",
  },
  seqStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0d9488",
    justifyContent: "center",
    alignItems: "center",
  },
  seqStepNumTxt: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  seqTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  seqTabName: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  seqLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0d9488",
  },
  seqDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  educationalNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EEF8F6",
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#CCEDE6",
  },
  educationalNoteTxt: {
    flex: 1,
    fontSize: 12,
    color: "#0f766e",
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "#FAF7EE",
    borderTopWidth: 1,
    borderTopColor: "#E5DECE",
  },
  fullDocsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  fullDocsBtnTxt: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  doneBtn: {
    backgroundColor: "#0d9488",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
  },
  doneBtnTxt: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
});
