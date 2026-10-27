/**
 * client/components/ScrumGuideModal.tsx
 * ============================================================================
 * NEXUSFLOW V4 — SCRUM STEP-BY-STEP WORKFLOW GUIDE MODAL
 *
 * Explains the complete end-to-end Scrum lifecycle:
 * 1. Project setup and knowledge
 * 2. AI analysis and story generation
 * 3. Review and approval of stories
 * 4. Product Backlog refinement
 * 5. Sprint Planning
 * 6. Daily Scrum and task execution
 * 7. Sprint Review
 * 8. Sprint Retrospective
 * 9. Learning from previous sprints and planning the next sprint
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/theme";

interface ScrumGuideModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateTab?: (tabKey: string, section?: string) => void;
}

const SCRUM_STEPS = [
  {
    step: 1,
    title: "1. Project Setup & Knowledge Base",
    tagline: "Upload project proposals, SRS, architecture specs, or READMEs",
    desc: "Start in Overview → Project Setup & Plan. Upload relevant project documentation to build your team's knowledge base. If you don't have files, you can still describe your project or create stories manually.",
    tabTarget: "overview",
    sectionTarget: "plan",
    icon: "folder-open-outline" as const,
    color: "#4F46E5",
  },
  {
    step: 2,
    title: "2. AI Analysis & Story Generation",
    tagline: "Run zero-cost OmniRoute analysis to identify scope & draft stories",
    desc: "Run 'Analyze Project' to extract functional requirements, stakeholders, technical constraints, and unresolved questions. Then select 'Generate Scrum Plan' to produce schema-validated INVEST user story suggestions.",
    tabTarget: "overview",
    sectionTarget: "plan",
    icon: "sparkles-outline" as const,
    color: "#6366F1",
  },
  {
    step: 3,
    title: "3. Review & Human Approval",
    tagline: "Review AI suggestions before anything enters the official backlog",
    desc: "Inspect each story suggestion, edit descriptions, adjust acceptance criteria, and approve or reject. Approval enforces strict server-side validation, duplicate prevention, and cycle checks. Only approved items enter the official Product Backlog.",
    tabTarget: "overview",
    sectionTarget: "plan",
    icon: "checkmark-done-circle-outline" as const,
    color: "#059669",
  },
  {
    step: 4,
    title: "4. Product Backlog Refinement",
    tagline: "Prioritize stories with DAA dynamic scoring and team judgment",
    desc: "Refine user stories, story points, and dependencies. The DAA Priority Engine provides transparent factor explanations (business value, urgency, technical uncertainty). The Product Owner retains full authority over backlog ordering.",
    tabTarget: "overview",
    sectionTarget: "plan",
    icon: "list-circle-outline" as const,
    color: "#D97706",
  },
  {
    step: 5,
    title: "5. Sprint Planning",
    tagline: "Commit to a Sprint Goal within validated team capacity",
    desc: "In Sprint Planning, define your Sprint Goal, set start and end dates, and select eligible stories from the backlog. The system calculates team capacity and warns if proposed workload exceeds available capacity.",
    tabTarget: "overview",
    sectionTarget: "plan",
    icon: "calendar-outline" as const,
    color: "#2563eb",
  },
  {
    step: 6,
    title: "6. Daily Scrum & Task Execution",
    tagline: "Track sprint progress, resolve blockers, and record daily check-ins",
    desc: "Switch to Tasks to execute sprint work across To Do, In Progress, Review, and Done. Break stories down into tasks, flag blockers with reasons, and record Daily Scrum standup notes directly in the workspace.",
    tabTarget: "tasks",
    sectionTarget: null,
    icon: "checkbox-outline" as const,
    color: "#7C3AED",
  },
  {
    step: 7,
    title: "7. Sprint Review",
    tagline: "Inspect the increment and collect stakeholder feedback",
    desc: "At the end of the sprint, open Retrospective → Sprint Review. Record demonstrated work, accepted versus rejected stories, demo notes, and stakeholder feedback. New requirements become reviewable backlog suggestions.",
    tabTarget: "retro",
    sectionTarget: "review",
    icon: "eye-outline" as const,
    color: "#0D9488",
  },
  {
    step: 8,
    title: "8. Sprint Retrospective",
    tagline: "Reflect on team processes and agree on actionable improvements",
    desc: "Document what went well, what did not go well, root causes, and concrete improvement actions with assigned owners and due dates. Retrospectives are preserved by sprint for historical comparison.",
    tabTarget: "retro",
    sectionTarget: "retro",
    icon: "refresh-circle-outline" as const,
    color: "#DC2626",
  },
  {
    step: 9,
    title: "9. Learning Loop & Next Sprint",
    tagline: "Track improvement actions in Insights and launch the next increment",
    desc: "Inspect Insights → Learning Loop to verify whether recorded improvement actions were completed and whether blockers improved. Return unfinished work to the backlog and begin planning the next sprint.",
    tabTarget: "insights",
    sectionTarget: "learning",
    icon: "trending-up-outline" as const,
    color: "#0284C7",
  },
];

export default function ScrumGuideModal({ visible, onClose, onNavigateTab }: ScrumGuideModalProps) {
  const [selectedStep, setSelectedStep] = useState<number>(1);

  const active = SCRUM_STEPS.find((s) => s.step === selectedStep) || SCRUM_STEPS[0];

  const handleNavigate = (tab: string, section?: string | null) => {
    onClose();
    if (onNavigateTab) {
      onNavigateTab(tab, section || undefined);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={s.badgeIcon}>
                <Ionicons name="rocket" size={20} color="#4F46E5" />
              </View>
              <View>
                <Text style={s.headerTitle}>NexusFlow Scrum Guide</Text>
                <Text style={s.headerSub}>End-to-end workflow from project setup to continuous delivery</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Stepper Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stepperRow}>
            {SCRUM_STEPS.map((step) => {
              const isCurrent = step.step === selectedStep;
              return (
                <Pressable
                  key={step.step}
                  onPress={() => setSelectedStep(step.step)}
                  style={[s.stepTab, isCurrent && { backgroundColor: step.color + "18", borderColor: step.color }]}
                >
                  <Text style={[s.stepTabNum, isCurrent && { color: step.color }]}>{step.step}</Text>
                  <Text style={[s.stepTabLabel, isCurrent && { color: step.color, fontWeight: "700" }]}>
                    {step.title.replace(/^\d+\.\s*/, "")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Active Step Content */}
          <View style={s.stepContentWrap}>
            <View style={s.stepHeader}>
              <View style={[s.stepCircle, { backgroundColor: active.color + "20", borderColor: active.color }]}>
                <Ionicons name={active.icon} size={24} color={active.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{active.title}</Text>
                <Text style={s.stepTagline}>{active.tagline}</Text>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: spacing.md }}>
              <Text style={s.stepDesc}>{active.desc}</Text>

              <View style={s.infoBox}>
                <Ionicons name="bulb-outline" size={16} color="#4F46E5" style={{ marginTop: 2 }} />
                <Text style={s.infoBoxTxt}>
                  {active.step === 1 && "Supported formats: PDF, DOCX, Markdown, TXT, CSV, architecture specs. Large files are safely handled without Base64 document bloat."}
                  {active.step === 2 && "OmniRoute uses verified $0 zero-cost Gemini/Groq tiers. No paid AI APIs are ever called."}
                  {active.step === 3 && "Suggestions are strictly separated from the official backlog. Server validation ensures zero duplicates and no cycle dependencies."}
                  {active.step === 4 && "Deterministic DAA scoring balances business value, urgency, and technical uncertainty without random LLM drift."}
                  {active.step === 5 && "Sprint creation requires a goal and valid dates. Workload warnings prevent overcommitting beyond team capacity."}
                  {active.step === 6 && "Task statuses strictly validate transitions. Unfinished stories are safely returned to the backlog at sprint completion."}
                  {active.step === 7 && "Sprint Review inspects the completed increment. Feedback flows into reviewable suggestions rather than modifying history."}
                  {active.step === 8 && "Retrospectives record actionable improvements with accountable owners and due dates."}
                  {active.step === 9 && "Insights → Learning Loop tracks whether retrospective actions correlated with measurable sprint performance."}
                </Text>
              </View>
            </ScrollView>

            {/* Footer Navigation */}
            <View style={s.footerRow}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {selectedStep > 1 && (
                  <Pressable onPress={() => setSelectedStep(selectedStep - 1)} style={s.prevBtn}>
                    <Ionicons name="arrow-back" size={14} color={colors.text} />
                    <Text style={s.prevBtnTxt}>Previous</Text>
                  </Pressable>
                )}
                {selectedStep < SCRUM_STEPS.length && (
                  <Pressable onPress={() => setSelectedStep(selectedStep + 1)} style={s.nextBtn}>
                    <Text style={s.nextBtnTxt}>Next Step</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={() => handleNavigate(active.tabTarget, active.sectionTarget)}
                style={[s.jumpBtn, { backgroundColor: active.color }]}
              >
                <Text style={s.jumpBtnTxt}>Go to this Step</Text>
                <Ionicons name="open-outline" size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 780,
    height: "85%",
    maxHeight: 620,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stepTabNum: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  stepTabLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepContentWrap: {
    flex: 1,
    padding: spacing.lg,
    display: "flex",
    flexDirection: "column",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  stepTagline: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  infoBoxTxt: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  prevBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prevBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: "#4F46E5",
  },
  nextBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  jumpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  jumpBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
