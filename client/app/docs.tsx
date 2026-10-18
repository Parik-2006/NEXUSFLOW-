import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Badge, Chip } from "@/components/ui";
import FloatingBackground from "@/components/FloatingBackground";
import { colors, spacing, radius, font, layout, shadow } from "@/theme";
import {
  WATERFALL_PHASES,
  WATERFALL_TAB_GUIDES,
  WATERFALL_WORKFLOW_SEQUENCE,
  WaterfallTabGuide,
} from "@/constants/waterfallGuideData";
import {
  getMethodologyConfig,
  ALL_METHODOLOGIES,
  isMethodologyAllowedForNewProjects,
  MethodologyType,
} from "@/utils/methodologyConfig";

type SectionKey =
  | "getting-started"
  | "methodologies"
  | "project-management"
  | "project-ai"
  | "ai-system"
  | "daa"
  | "analytics-audit"
  | "auth"
  | "security"
  | "architecture"
  | "lld"
  | "jwt";

interface DocSection {
  key: SectionKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}

const SECTIONS: DocSection[] = [
  { key: "getting-started", title: "Getting Started", subtitle: "Core concepts, signup, login & workspace setup", icon: "rocket-outline", badge: "Start Here" },
  { key: "methodologies", title: "Methodologies", subtitle: "Waterfall, Classic, Scrum, Kanban & Hybrid guide", icon: "git-branch-outline", badge: "Guide & Phases" },
  { key: "project-management", title: "Project Management", subtitle: "Teams, projects, backlogs, sprints & roles", icon: "grid-outline" },
  { key: "project-ai", title: "Project AI Hub", subtitle: "Briefs, AI guidance, Copilot, research, APIs & tools", icon: "sparkles-outline", badge: "AI 2.0" },
  { key: "daa", title: "DAA Algorithms", subtitle: "Boyer-Moore, Greedy, 0/1 Knapsack, Merge Sort, Topo Sort, B&B", icon: "school-outline", badge: "Core Algorithms" },
];

export default function Documentation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string; tab?: string; guide?: string }>();
  const initialSection = (params.section || params.tab) as SectionKey;
  const [activeSection, setActiveSection] = useState<SectionKey>(
    initialSection && ["getting-started", "methodologies", "project-management", "project-ai", "daa"].includes(initialSection)
      ? initialSection
      : "getting-started"
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FloatingBackground />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={s.logoIcon}>
          <Ionicons name="book" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>NEXUSFLOW Documentation</Text>
          <Text style={s.headerSub}>Production Architecture, AI Systems, DAA & Security</Text>
        </View>
        <Badge label="v2.0" color={colors.primary} bg={colors.primarySoft} />
      </View>

      {/* Navigation Pills */}
      <View style={s.navWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.navBar}>
          {SECTIONS.map((sec) => {
            const on = activeSection === sec.key;
            return (
              <Pressable
                key={sec.key}
                onPress={() => setActiveSection(sec.key)}
                style={[s.navPill, on && s.navPillActive]}
              >
                <Ionicons name={sec.icon} size={15} color={on ? "#fff" : colors.textMuted} />
                <Text style={[s.navPillTxt, on && s.navPillTxtActive]}>{sec.title}</Text>
                {sec.badge && (
                  <View style={[s.miniBadge, on ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[s.miniBadgeTxt, on && { color: "#fff" }]}>{sec.badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content Area */}
      <ScrollView contentContainerStyle={[s.contentScroll, { paddingBottom: 80 }]}>
        <View style={s.container}>
          {activeSection === "getting-started" && (
            <GettingStartedSection onOpenMethodologies={() => setActiveSection("methodologies")} />
          )}
          {activeSection === "methodologies" && (
            <MethodologiesSection initialGuide={params.guide} />
          )}
          {activeSection === "project-management" && <ProjectManagementSection />}
          {activeSection === "project-ai" && <ProjectAISection />}
          {activeSection === "ai-system" && <AIFallbackSection />}
          {activeSection === "daa" && <DAASection />}
          {activeSection === "analytics-audit" && <AnalyticsAuditSection />}
          {activeSection === "auth" && <AuthenticationSection />}
          {activeSection === "jwt" && <JWTStudentSection />}
          {activeSection === "security" && <SecuritySection />}
          {activeSection === "architecture" && <ArchitectureSection />}
          {activeSection === "lld" && <LLDSection />}
        </View>
      </ScrollView>
    </View>
  );
}

// ── 1. GETTING STARTED ────────────────────────────────────────────────────────
function GettingStartedSection({ onOpenMethodologies }: { onOpenMethodologies?: () => void }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>1. What is NEXUSFLOW?</Text>
        <Text style={s.paragraph}>
          <Text style={s.bold}>NEXUSFLOW 2.0</Text> is an enterprise-grade AI project workspace and algorithmic orchestration platform designed for engineering teams, university capstones, and hackathons.
        </Text>
        <Text style={s.paragraph}>
          Instead of treating project management as a dumb to-do list, NEXUSFLOW combines <Text style={s.bold}>Design and Analysis of Algorithms (DAA)</Text> with a multi-tiered <Text style={s.bold}>Project AI Intelligence Engine</Text> to automatically decompose ideas into phased engineering backlogs, plan optimal sprints, calculate dependency critical paths, and match team member skills.
        </Text>
      </Card>

      {/* Methodology Guide Callout */}
      {onOpenMethodologies && (
        <Card style={{ gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.primary, backgroundColor: colors.primarySoft + "30" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="git-branch" size={18} color={colors.primary} />
              <Text style={font.h3}>Choose the Right Methodology</Text>
            </View>
            <Badge label="Waterfall & Classic Active" color={colors.primary} bg={colors.primarySoft} />
          </View>
          <Text style={s.subText}>
            NexusFlow supports tailored engineering methodologies including sequential Waterfall and algorithmic Classic. Explore the full guide and tab breakdown before starting your project.
          </Text>
          <Pressable onPress={onOpenMethodologies} style={[s.methViewBtn, { alignSelf: "flex-start", backgroundColor: colors.primary, marginTop: 4 }]}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Explore Methodologies & Waterfall Guide →</Text>
          </Pressable>
        </Card>
      )}

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Step-by-Step Onboarding</Text>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>1</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Create an Account</Text>
            <Text style={s.stepDesc}>Register with your name, email, and a secure password. Passwords are salted with bcrypt (cost factor 10) and stored in MongoDB.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>2</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Log In</Text>
            <Text style={s.stepDesc}>Sign in to receive a cryptographically signed JWT access token stored in client memory/storage and verified by the backend on every API call.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>3</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Create a Team Workspace</Text>
            <Text style={s.stepDesc}>Use the guided 4-step wizard to name your workspace, choose your role, add teammates with skill profiles, and provide a project brief.</Text>
          </View>
        </View>
        <View style={s.stepRow}>
          <View style={s.stepBadge}><Text style={s.stepBadgeTxt}>4</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Let AI Decompose the Backlog</Text>
            <Text style={s.stepDesc}>NexusFlow analyzes your brief and extracts structured phases (Hardware, Backend, AI/ML, Frontend, Testing, Deployment) with priority scores and dependency links.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 2. METHODOLOGIES SECTION ──────────────────────────────────────────────────
interface MethodologyDocDetail {
  id: MethodologyType;
  name: string;
  tagline: string;
  badge: "ACTIVE" | "IN_PROGRESS";
  badgeLabel: string;
  accentColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  whatIsIt: string;
  whenToUse: string;
  howItWorks: string;
  howItDiffers: string;
  availability: string;
  nextSteps: string;
}

const METHODOLOGY_DOCS: MethodologyDocDetail[] = [
  {
    id: "WATERFALL",
    name: "Waterfall (Phased Engineering & Formal Gates)",
    tagline: "Sequential, milestone-driven development with formal phase gate reviews and requirements approval.",
    badge: "ACTIVE",
    badgeLabel: "Available (Production)",
    accentColor: colors.primary,
    icon: "water-outline",
    whatIsIt: "Waterfall is a disciplined, linear-sequential engineering methodology where project execution flows downstream through structured, chronological phases: Requirements, System Design, Implementation, Testing, Deployment, and Review. Each phase requires clear deliverables and formal stakeholder approval before the team advances to the next stage.",
    whenToUse: "Use Waterfall for engineering capstones, hardware or embedded systems, client deliverables with fixed specifications, regulated environments, or projects where architecture, API contracts, and requirements must be locked before heavy coding begins.",
    howItWorks: "In NexusFlow, Waterfall projects feature an 8-tab workspace (Overview, Plan, Tasks, Timeline, Team, Insights, Project AI, Chat). Planning begins in the Plan tab, where uploaded briefs and SRS requirements must reach 100% Plan Readiness and stakeholder sign-off. Clicking 'Convert All to Tasks' generates prioritized tasks directly traceable to approved requirements, enforcing phase boundaries and critical path scheduling.",
    howItDiffers: "Unlike Scrum or Kanban where scope evolves continuously across sprints, Waterfall locks specifications early to eliminate scope creep. Tasks carry permanent requirement traceability links (REQ-01, REQ-02) and strict dependency DAG boundaries, preventing premature coding before architectural sign-off.",
    availability: "Available for production use. Fully supported with deterministic Plan readiness checks, bulk requirement-to-task conversion, 3D phase cascades, unified health grading, and CPM timeline scheduling.",
    nextSteps: "Switch to the 'Waterfall Step-by-Step Guide' tab above to learn the complete 8-tab workflow, or create a new team workspace and select Waterfall as your project template.",
  },
  {
    id: "CLASSIC",
    name: "Classic (Algorithmic Backlog & Hybrid DAA)",
    tagline: "Dynamic greedy task scoring, 0/1 knapsack sprint packing, and topological dependency ordering.",
    badge: "ACTIVE",
    badgeLabel: "Available (Production)",
    accentColor: colors.knapsack,
    icon: "calculator-outline",
    whatIsIt: "Classic is NexusFlow's foundational algorithmic methodology. It blends traditional software project management with mathematical optimization algorithms (Design and Analysis of Algorithms - DAA) to automate scheduling, priority calculation, and sprint assignment.",
    whenToUse: "Use Classic for fast-moving software projects, hackathons, and flexible development teams that desire algorithmic assistance without the strict sequential phase gates of Waterfall.",
    howItWorks: "Tasks are prioritized dynamically using a multi-factor greedy formula combining Urgency (40%), Impact (35%), and Upstream Blockers (25%). Sprints are populated using 0/1 Knapsack dynamic programming to maximize total business value within team capacity limits, while Kahn's topological sort derives the optimal execution sequence.",
    howItDiffers: "Classic differs from Waterfall by allowing tasks across all categories (Frontend, Backend, AI/ML, Testing) to execute concurrently in flexible sprint batches rather than requiring all requirements and designs to complete upfront.",
    availability: "Available for production use. Fully integrated with NexusFlow's DAA algorithms, sprint planning engines, and team assignment models.",
    nextSteps: "Create a new project workspace and select the Classic methodology to take advantage of automated DAA sprint optimization.",
  },
  {
    id: "SCRUM",
    name: "Scrum (Sprint-Driven Agile Delivery)",
    tagline: "Time-boxed iterative delivery with sprint backlogs, velocity tracking, and agile retrospectives.",
    badge: "IN_PROGRESS",
    badgeLabel: "In Progress (In Development)",
    accentColor: colors.branch,
    icon: "refresh-circle-outline",
    whatIsIt: "Scrum is an agile framework that structures complex product development into fixed-duration iterations (typically 1 to 4 weeks) known as Sprints. Each sprint delivers a potentially shippable increment of product functionality.",
    whenToUse: "Scrum is optimal for projects with rapidly changing requirements, dynamic user feedback loops, and teams that operate on fixed sprint cadences.",
    howItWorks: "Teams maintain a prioritized Product Backlog, commit to a subset of stories during Sprint Planning, hold daily standups, review deliverables in Sprint Reviews, and inspect process improvements in Sprint Retrospectives.",
    howItDiffers: "Unlike Waterfall's milestone-based phase gates, Scrum delivers functional software iteratively every sprint. Unlike Kanban, Scrum strictly time-boxes work into synchronized iterations.",
    availability: "In Progress / In Development. To protect production stability and prevent incomplete agile states, new Scrum project creation is temporarily restricted in production environments. Engine models and sprint services remain fully preserved in codebase.",
    nextSteps: "For active projects, select Waterfall or Classic. If you have existing Scrum projects, their data is preserved and accessible. Development teams can enable experimental access via ENABLE_EXPERIMENTAL_METHODOLOGIES='true'.",
  },
  {
    id: "KANBAN",
    name: "Kanban (Continuous Flow & WIP Limits)",
    tagline: "Visual workflow management with strict Work-In-Progress limits and cycle-time optimization.",
    badge: "IN_PROGRESS",
    badgeLabel: "In Progress (In Development)",
    accentColor: colors.accent,
    icon: "swap-horizontal-outline",
    whatIsIt: "Kanban is a lean workflow management method designed to visualize work, limit Work-In-Progress (WIP), and optimize flow efficiency from start to finish.",
    whenToUse: "Ideal for continuous operations, maintenance teams, DevOps pipelines, customer support escalations, and teams whose work arrives unpredictably.",
    howItWorks: "Tasks flow horizontally across columns on a Kanban board (Backlog → Ready → Doing → Review → Done). Columns enforce explicit WIP limits to prevent multitasking and identify delivery bottlenecks.",
    howItDiffers: "Kanban features neither fixed-duration sprints nor rigid sequential phase gates. Tasks are pulled on-demand whenever downstream capacity becomes available.",
    availability: "In Progress / In Development. New project creation is restricted in production releases while the full interactive column board is being finalized. Underlying data structures remain intact.",
    nextSteps: "For board-style task tracking in active projects, use Waterfall's Phase Kanban view or Classic task boards.",
  },
  {
    id: "HYBRID",
    name: "Hybrid (Waterfall Planning + Agile Sprints)",
    tagline: "Combines upfront architectural rigor and phase gates with iterative, sprint-based coding.",
    badge: "IN_PROGRESS",
    badgeLabel: "In Progress (In Development)",
    accentColor: colors.greedy,
    icon: "git-network-outline",
    whatIsIt: "Hybrid blends the structured planning and governance of Waterfall with the flexible execution velocity of Agile/Scrum. Requirements and architecture are locked early, while implementation proceeds in iterative sprints.",
    whenToUse: "Ideal for enterprise software, hardware-software co-design, capstone projects with fixed academic deadlines, and products requiring both contract stability and agile adaptation.",
    howItWorks: "The project kicks off with formal Waterfall phases for Requirements and High-Level Design. Once the architectural baseline is approved, the implementation phase switches to agile 2-week development sprints.",
    howItDiffers: "Provides the safety and predictability of Waterfall planning while avoiding the risk of late discovery by releasing working software increments through agile sprints.",
    availability: "In Progress / In Development. Engine integration for dual-mode transitions is actively underway. Code and service layers are preserved.",
    nextSteps: "Use Waterfall in NexusFlow V4. Its Plan and Overview tabs provide the structured architecture review and requirements approval needed for hybrid workflows.",
  },
];

function MethodologiesSection({ initialGuide }: { initialGuide?: string }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"all" | "waterfall">(
    initialGuide === "waterfall" ? "waterfall" : "all"
  );
  const [selectedWaterfallTab, setSelectedWaterfallTab] = useState<string>("overview");
  const [expandedMethodology, setExpandedMethodology] = useState<string>("WATERFALL");

  const activeTabGuide =
    WATERFALL_TAB_GUIDES.find((t) => t.tabKey === selectedWaterfallTab) ||
    WATERFALL_TAB_GUIDES[0];

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Top Banner */}
      <Card style={{ gap: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Ionicons name="git-branch" size={24} color={colors.primary} />
              <Text style={font.h2}>Project Methodologies</Text>
            </View>
            <Text style={s.paragraph}>
              NexusFlow adapts to your engineering workflow. Complexity stays inside the platform; simplicity stays in your team's navigation.
            </Text>
          </View>
          <Badge label="Production v2.0" color={colors.primary} bg={colors.primarySoft} />
        </View>

        {/* View Switcher: All Methodologies vs Waterfall Step-by-Step Guide */}
        <View style={s.methViewSwitcher}>
          <Pressable
            onPress={() => setViewMode("all")}
            style={[s.methViewBtn, viewMode === "all" && s.methViewBtnActive]}
          >
            <Ionicons name="grid-outline" size={16} color={viewMode === "all" ? "#fff" : colors.textMuted} />
            <Text style={[s.methViewBtnTxt, viewMode === "all" && s.methViewBtnTxtActive]}>
              All Methodologies
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("waterfall")}
            style={[s.methViewBtn, viewMode === "waterfall" && s.methViewBtnActive]}
          >
            <Ionicons name="water-outline" size={16} color={viewMode === "waterfall" ? "#fff" : colors.textMuted} />
            <Text style={[s.methViewBtnTxt, viewMode === "waterfall" && s.methViewBtnTxtActive]}>
              Waterfall Step-by-Step Guide
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* ── MODE 1: ALL METHODOLOGIES ────────────────────────────────────────── */}
      {viewMode === "all" && (
        <View style={{ gap: spacing.lg }}>
          {/* Production Availability Notice */}
          <Card style={{ gap: spacing.sm, backgroundColor: colors.surfaceAlt }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              <Text style={font.h3}>Production Release Methodology Policy</Text>
            </View>
            <Text style={s.subText}>
              In this release, <Text style={s.bold}>Waterfall</Text> and <Text style={s.bold}>Classic</Text> are fully verified and active for creating new projects. <Text style={s.bold}>Scrum</Text>, <Text style={s.bold}>Kanban</Text>, and <Text style={s.bold}>Hybrid</Text> engines are in active development; creating new projects with them is restricted to guarantee production safety. All existing projects remain fully accessible.
            </Text>
          </Card>

          {/* 5 Methodologies List */}
          {METHODOLOGY_DOCS.map((meth) => {
            const isAvailable = meth.badge === "ACTIVE";
            const isExpanded = expandedMethodology === meth.id;

            return (
              <Card
                key={meth.id}
                style={{
                  ...s.methCard,
                  borderLeftWidth: 4,
                  borderLeftColor: meth.accentColor,
                }}
              >
                {/* Header Row */}
                <Pressable
                  onPress={() => setExpandedMethodology(isExpanded ? "" : meth.id)}
                  style={s.methHeader}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: radius.md,
                        backgroundColor: meth.accentColor + "1A",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={meth.icon} size={20} color={meth.accentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{meth.name}</Text>
                      <Text style={s.subText}>{meth.tagline}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Badge
                      label={meth.badgeLabel}
                      color={isAvailable ? colors.primary : colors.accentDark}
                      bg={isAvailable ? colors.primarySoft : colors.accentSoft}
                    />
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.textMuted}
                    />
                  </View>
                </Pressable>

                {/* 6-Part Standardized Content (Expanded or always shown) */}
                <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
                  {/* 1. What is it? */}
                  <View style={[s.methPartBox, { borderLeftColor: meth.accentColor }]}>
                    <Text style={[s.methPartNum, { color: meth.accentColor }]}>1. What is it?</Text>
                    <Text style={s.methPartBody}>{meth.whatIsIt}</Text>
                  </View>

                  {/* 2. When should I use it? */}
                  <View style={[s.methPartBox, { borderLeftColor: colors.border }]}>
                    <Text style={[s.methPartNum, { color: colors.textMuted }]}>2. When should I use it?</Text>
                    <Text style={s.methPartBody}>{meth.whenToUse}</Text>
                  </View>

                  {/* 3. How does it work in NexusFlow? */}
                  <View style={[s.methPartBox, { borderLeftColor: colors.border }]}>
                    <Text style={[s.methPartNum, { color: colors.textMuted }]}>3. How does it work in NexusFlow?</Text>
                    <Text style={s.methPartBody}>{meth.howItWorks}</Text>
                  </View>

                  {/* 4. How is it different from other methodologies? */}
                  <View style={[s.methPartBox, { borderLeftColor: colors.border }]}>
                    <Text style={[s.methPartNum, { color: colors.textMuted }]}>4. How is it different from the other methodologies?</Text>
                    <Text style={s.methPartBody}>{meth.howItDiffers}</Text>
                  </View>

                  {/* 5. Availability in this release */}
                  <View style={[s.methPartBox, { borderLeftColor: isAvailable ? colors.primary : colors.accent }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <Text style={[s.methPartNum, { color: isAvailable ? colors.primary : colors.accentDark }]}>
                        5. Availability in this release
                      </Text>
                      <Badge
                        label={isAvailable ? "Production Ready" : "In Progress"}
                        color={isAvailable ? colors.primary : colors.accentDark}
                        bg={isAvailable ? colors.primarySoft : colors.accentSoft}
                      />
                    </View>
                    <Text style={s.methPartBody}>{meth.availability}</Text>
                  </View>

                  {/* 6. What should I do next? */}
                  <View style={[s.methPartBox, { borderLeftColor: colors.primary }]}>
                    <Text style={[s.methPartNum, { color: colors.primary }]}>6. What should I do next?</Text>
                    <Text style={s.methPartBody}>{meth.nextSteps}</Text>
                    {meth.id === "WATERFALL" && (
                      <Pressable
                        onPress={() => setViewMode("waterfall")}
                        style={[s.methViewBtn, { alignSelf: "flex-start", backgroundColor: colors.primary, marginTop: 6 }]}
                      >
                        <Ionicons name="book-outline" size={15} color="#fff" />
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Open Waterfall Step-by-Step Guide →</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* ── MODE 2: WATERFALL STEP-BY-STEP GUIDE ───────────────────────────── */}
      {viewMode === "waterfall" && (
        <View style={{ gap: spacing.lg }}>
          {/* Guide Introduction Card */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="water" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.h2}>The Waterfall Engineering Workspace</Text>
                <Text style={s.subText}>A beginner-friendly guide to sequential phase gates, requirements approval, and tab navigation</Text>
              </View>
            </View>
            <Text style={s.paragraph}>
              Waterfall in NexusFlow V4 delivers a modern, disciplined engineering process. Work progresses cleanly through 6 sequential phases, governed by an 8-tab workspace with specialized algorithmic insights.
            </Text>
          </Card>

          {/* Section A: The 6 Canonical Phases */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="git-commit-outline" size={20} color={colors.primary} />
              <Text style={font.h3}>The 6 Canonical Waterfall Phases</Text>
            </View>
            <Text style={s.subText}>
              Every Waterfall project advances through these 6 milestone checkpoints. Downstream work is unlocked once previous deliverables are approved.
            </Text>

            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {WATERFALL_PHASES.map((phase) => (
                <View
                  key={phase.id}
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <Text style={[s.bold, { color: colors.text, fontSize: 14.5 }]}>{phase.name}</Text>
                    <Badge label={`Phase ${phase.number}`} color={colors.primary} bg={colors.primarySoft} />
                  </View>
                  <Text style={s.paragraph}>{phase.summary}</Text>

                  {/* Deliverables */}
                  <View style={{ marginTop: 4 }}>
                    <Text style={[s.bold, { fontSize: 12, color: colors.textMuted, marginBottom: 2 }]}>Key Deliverables:</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {phase.deliverables.map((deliv, idx) => (
                        <Chip key={idx} label={deliv} active={false} />
                      ))}
                    </View>
                  </View>

                  {/* Key Actions */}
                  <View style={{ marginTop: 4 }}>
                    <Text style={[s.bold, { fontSize: 12, color: colors.textMuted, marginBottom: 2 }]}>Key Actions:</Text>
                    {phase.keyActions.map((act, idx) => (
                      <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginVertical: 1 }}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} style={{ marginTop: 2 }} />
                        <Text style={[s.subText, { flex: 1 }]}>{act}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {/* Section B: Natural Workflow Sequence */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="swap-vertical" size={20} color={colors.primary} />
              <Text style={font.h3}>Natural Workflow Sequence</Text>
            </View>
            <Text style={s.subText}>
              Follow this step-by-step progression to manage your Waterfall project from inception to delivery:
            </Text>

            <View style={{ gap: 4, marginTop: spacing.xs }}>
              {WATERFALL_WORKFLOW_SEQUENCE.map((seq) => (
                <View key={seq.step} style={s.sequenceStepCard}>
                  <View style={s.stepCircle}>
                    <Text style={s.stepCircleTxt}>{seq.step}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[s.bold, { fontSize: 14 }]}>{seq.label}</Text>
                      <Badge label={seq.tab} color={colors.primary} bg={colors.primarySoft} />
                    </View>
                    <Text style={[s.subText, { marginTop: 2 }]}>{seq.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {/* Section C: Interactive Tab Inspector (All 8 Workspace Tabs) */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="layers-outline" size={20} color={colors.primary} />
              <Text style={font.h3}>Interactive Workspace Tabs Guide (8 Tabs)</Text>
            </View>
            <Text style={s.subText}>
              Select any workspace tab below to see its exact purpose, when to use it, step-by-step actions, and downstream workflow:
            </Text>

            {/* Tab Selector Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabPillsScroll}>
              {WATERFALL_TAB_GUIDES.map((tab) => {
                const isActive = selectedWaterfallTab === tab.tabKey;
                return (
                  <Pressable
                    key={tab.tabKey}
                    onPress={() => setSelectedWaterfallTab(tab.tabKey)}
                    style={[s.tabPillBtn, isActive && s.tabPillBtnActive]}
                  >
                    <Ionicons
                      name={tab.icon as any}
                      size={15}
                      color={isActive ? "#fff" : colors.textMuted}
                    />
                    <Text style={[s.tabPillTxt, isActive && s.tabPillTxtActive]}>
                      {tab.tabName}
                    </Text>
                    {tab.subTabs && (
                      <View style={{ backgroundColor: isActive ? "rgba(255,255,255,0.3)" : colors.surface, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: isActive ? "#fff" : colors.textMuted }}>5 Sub-tabs</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Selected Tab Detail Card */}
            <View
              style={{
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: colors.border,
                padding: spacing.lg,
                gap: spacing.md,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={activeTabGuide.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={font.h3}>{activeTabGuide.tabName} Tab</Text>
                    <Text style={s.subText}>Tab {activeTabGuide.order} of 8 in Waterfall Workspace</Text>
                  </View>
                </View>
                <Badge label={`Order #${activeTabGuide.order}`} color={colors.primary} bg={colors.primarySoft} />
              </View>

              {/* Purpose */}
              <View style={{ gap: 2 }}>
                <Text style={[s.bold, { fontSize: 13, color: colors.text }]}>Purpose:</Text>
                <Text style={s.paragraph}>{activeTabGuide.purpose}</Text>
              </View>

              {/* When to Use */}
              <View style={{ gap: 2 }}>
                <Text style={[s.bold, { fontSize: 13, color: colors.text }]}>When to Use:</Text>
                <Text style={s.paragraph}>{activeTabGuide.whenToUse}</Text>
              </View>

              {/* Step-by-Step Guidance */}
              <View style={{ gap: 6 }}>
                <Text style={[s.bold, { fontSize: 13, color: colors.text }]}>Step-by-Step Guidance:</Text>
                {activeTabGuide.steps.map((st, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{idx + 1}</Text>
                    </View>
                    <Text style={[s.paragraph, { flex: 1 }]}>{st}</Text>
                  </View>
                ))}
              </View>

              {/* What Comes Next */}
              <View style={{ backgroundColor: colors.primarySoft + "30", padding: spacing.md, borderRadius: radius.md, gap: 4 }}>
                <Text style={[s.bold, { fontSize: 12, color: colors.primary }]}>What Comes Next?</Text>
                <Text style={[s.subText, { color: colors.text }]}>{activeTabGuide.whatComesNext}</Text>
              </View>

              {/* Key Concepts */}
              {activeTabGuide.keyConcepts && activeTabGuide.keyConcepts.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={[s.bold, { fontSize: 13, color: colors.text }]}>Key Concepts & Definitions:</Text>
                  {activeTabGuide.keyConcepts.map((kc, idx) => (
                    <View key={idx} style={{ backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={[s.bold, { fontSize: 12.5, color: colors.primary }]}>{kc.term}</Text>
                      <Text style={[s.subText, { marginTop: 2 }]}>{kc.explanation}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Sub-Tabs Detail if Insights */}
              {activeTabGuide.subTabs && (
                <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="analytics" size={18} color={colors.primary} />
                    <Text style={font.h3}>5 Specialized Insights Sub-Tabs</Text>
                  </View>
                  <Text style={s.subText}>
                    The Insights tab houses 5 deep analytical views. Each provides a distinct angle on project stability, risk exposure, and team execution:
                  </Text>

                  <View style={s.subTabGrid}>
                    {activeTabGuide.subTabs.map((sub) => (
                      <View key={sub.key} style={s.subTabCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Ionicons name={sub.icon as any} size={18} color={colors.primary} />
                            <Text style={[s.bold, { fontSize: 14 }]}>{sub.name}</Text>
                          </View>
                          <Badge label={sub.key.toUpperCase()} color={colors.primary} bg={colors.primarySoft} />
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={[s.bold, { fontSize: 12, color: colors.textMuted }]}>Purpose:</Text>
                          <Text style={s.subText}>{sub.purpose}</Text>
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={[s.bold, { fontSize: 12, color: colors.textMuted }]}>What it Shows:</Text>
                          <Text style={s.subText}>{sub.whatItShows}</Text>
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={[s.bold, { fontSize: 12, color: colors.primary }]}>Recommended Action:</Text>
                          <Text style={[s.subText, { color: colors.text }]}>{sub.recommendedAction}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </Card>
        </View>
      )}
    </View>
  );
}

// ── 3. PROJECT MANAGEMENT ────────────────────────────────────────────────────
function ProjectManagementSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Project Management & Workspaces</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW manages engineering deliverables through hierarchical scopes:
        </Text>
        <View style={s.codeBox}>
          <Text style={s.codeTxt}>User → Team (Workspace) → Project → Tasks → Sprints & AI Artifacts</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Core Capabilities</Text>
        <View style={s.bulletItem}>
          <Ionicons name="list" size={18} color={colors.greedy} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Tasks & Greedy Priority</Text>
            <Text style={s.subText}>Tasks contain estimated hours, business value, urgency (1–5), impact (1–5), and dependency counts. The Greedy Scheduler scores each task from 0 to 100.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="git-network" size={18} color={colors.topo} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Dependency Directed Acyclic Graph (DAG)</Text>
            <Text style={s.subText}>Tasks declare prerequisite blockers. Kahn’s algorithm detects cycles and derives the valid topological execution sequence.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="rocket" size={18} color={colors.knapsack} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Sprint Optimization (0/1 Knapsack)</Text>
            <Text style={s.subText}>Given team sprint capacity (e.g. 40 hours), dynamic programming selects the exact subset of tasks that maximizes total business value.</Text>
          </View>
        </View>
        <View style={s.bulletItem}>
          <Ionicons name="people" size={18} color={colors.branch} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Member Assignment (Branch & Bound)</Text>
            <Text style={s.subText}>Builds a cost matrix matching task skill demands (Frontend, Backend, ML, Hardware, DevOps) with member competencies to optimize workload balance.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 3. PROJECT AI HUB ────────────────────────────────────────────────────────
function ProjectAISection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Project AI Hub (NEXUSFLOW 2.0)</Text>
        <Text style={s.paragraph}>
          The Project AI Hub is the central intelligence command center for your workspace. It bridges the gap between high-level natural language ideas and actionable engineering artifacts.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>7 Specialized Intelligence Tabs</Text>
        
        <View style={s.tabExplain}>
          <Badge label="Brief" color={colors.primary} bg={colors.primarySoft} />
          <Text style={s.bold}>1. Project Brief & Context</Text>
          <Text style={s.subText}>Captures problem statements, target users, goals, hardware/software constraints, budget, and deployment environment.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Guidance" color={colors.accentDark} bg={colors.accentSoft} />
          <Text style={s.bold}>2. Project Guidance & Readiness</Text>
          <Text style={s.subText}>Phase 6 guidance engine calculates a 0–100 Readiness Score, highlights skill gaps, generates a 4-phase engineering roadmap, and recommends 24-hour hackathon time slices.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Copilot" color={colors.accent} bg={colors.accentSoft} />
          <Text style={s.bold}>3. Project Copilot</Text>
          <Text style={s.subText}>Multi-turn conversational advisor aware of your specific project facts, team skills, accepted decisions, and backlog state.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Decisions" color={colors.greedy} bg={colors.greedy + "1A"} />
          <Text style={s.bold}>4. Decisions & AI Recommendations</Text>
          <Text style={s.subText}>Review AI technology suggestions with rationale and trade-offs. Accepted decisions are permanently recorded in project memory.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Architecture" color={colors.topo} bg={colors.topo + "1A"} />
          <Text style={s.bold}>5. System Architecture Components</Text>
          <Text style={s.subText}>Architectural layers (Frontend, API, DB, AI/ML, IoT Gateway) with dependency links.</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Research" color={colors.branch} bg={colors.branch + "1A"} />
          <Text style={s.bold}>6. Research Topics</Text>
          <Text style={s.subText}>Technical feasibility investigations with relevant benchmarks (strictly zero fabricated citations).</Text>
        </View>

        <View style={s.tabExplain}>
          <Badge label="Decide" color={colors.merge} bg={colors.merge + "1A"} />
          <Text style={s.bold}>7. Decision Engine</Text>
          <Text style={s.subText}>Interactive multi-criteria decision analyzer evaluating trade-offs for databases, frameworks, auth, and hosting.</Text>
        </View>
      </Card>
    </View>
  );
}

// ── 4. AI SYSTEM & FALLBACK ──────────────────────────────────────────────────
function AIFallbackSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>OmniRoute — Hard $0 LLM Cost Policy</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW enforces a strict financial safety policy: <Text style={s.bold}>$0.00 Total API Spending</Text>.
          All external intelligence routes through <Text style={s.bold}>OmniRoute</Text> with fail-closed validation,
          guaranteeing zero accidental selection of paid models, paid routes, or paid fallbacks.
        </Text>
        <View style={s.cascadeWrap}>
          <View style={s.cascadeStep}>
            <Text style={s.cascadeStepNum}>Tier 1 ($0 Free Tier)</Text>
            <Text style={s.cascadeStepTitle}>Google Gemini Free Tier (gemini-2.0-flash / gemini-1.5-flash)</Text>
            <Text style={s.cascadeStepDesc}>$0 input / $0 output via Google AI Studio Free Tier. High-speed reasoning with project context injection.</Text>
          </View>
          <Ionicons name="arrow-down" size={20} color={colors.textMuted} style={{ alignSelf: "center" }} />
          <View style={s.cascadeStep}>
            <Text style={s.cascadeStepNum}>Tier 2 ($0 Free Fallback)</Text>
            <Text style={s.cascadeStepTitle}>OpenRouter Free Models (openrouter/free & :free models)</Text>
            <Text style={s.cascadeStepDesc}>Strictly filtered to official $0 models (openrouter/free, meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free). Zero paid fallback allowed.</Text>
          </View>
          <Ionicons name="arrow-down" size={20} color={colors.textMuted} style={{ alignSelf: "center" }} />
          <View style={[s.cascadeStep, { borderColor: colors.primary }]}>
            <Text style={[s.cascadeStepNum, { color: colors.primary }]}>Tier 3 (Local Heuristic Engine — $0 Local CPU)</Text>
            <Text style={s.cascadeStepTitle}>Deterministic Project Guidance Engine</Text>
            <Text style={s.cascadeStepDesc}>Rule-based heuristic engine delivering a 4-part grounded response: Direct Answer, Project Reasoning, Recommended Action, and Next Step. Operates 100% offline with zero external API calls.</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Fail-Closed Safety Guarantee</Text>
        <Text style={s.paragraph}>
          If all free provider quotas are exhausted (e.g. HTTP 429), OmniRoute safely falls closed to the deterministic local engine. It will <Text style={s.bold}>NEVER</Text> switch to a paid model or incur any billing charges.
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Private Conversation Memory</Text>
        <Text style={s.paragraph}>
          Copilot conversations are strictly private per user and project (<Text style={s.bold}>[projectId + user.id]</Text>). When User A asks a question, their conversation history and thumbs up/down feedback are persisted in <Text style={s.bold}>AIConversation</Text> and <Text style={s.bold}>AIMessage</Text> without leaking to User B.
        </Text>
      </Card>
    </View>
  );
}

// ── 5. DAA ALGORITHMS ────────────────────────────────────────────────────────
function DAASection() {
  const algos = [
    {
      name: "Boyer-Moore Pattern Matching",
      complexity: "Best: O(n/m) | Worst: O(n·m)",
      desc: "Fast substring search for task titles and descriptions. Uses Bad Character Rule and Good Suffix Rule to skip character comparisons right-to-left.",
      file: "server/algorithms/taskOptimiser.js",
    },
    {
      name: "Greedy Scheduler Scoring",
      complexity: "O(n log n)",
      desc: "Scores each task based on Urgency (w=0.4), Impact (w=0.4), and Dependency Blocker Factor (w=0.2) into a normalised 0–100 priority score.",
      file: "server/algorithms/greedyScheduler.js",
    },
    {
      name: "0/1 Knapsack Dynamic Programming",
      complexity: "O(n · W) where W is sprint hours",
      desc: "Selects the optimal subset of tasks fitting within total sprint capacity W to maximise aggregate business value without exceeding capacity.",
      file: "server/routes/teams.js",
    },
    {
      name: "Merge Sort (Stable Multi-Key)",
      complexity: "O(n log n) Guaranteed",
      desc: "Sorts backlog tasks across multi-column criteria (Earliest Deadline First, Progress %, Story Points) preserving original relative order for ties.",
      file: "server/utils/sortAlgorithms.js",
    },
    {
      name: "Topological Sort (Kahn's Algorithm)",
      complexity: "O(V + E)",
      desc: "Traverses the task dependency Directed Acyclic Graph (DAG) using in-degrees and BFS to compute the exact sequence tasks must be completed.",
      file: "server/algorithms/graphTraversal.js",
    },
    {
      name: "Branch & Bound Member Assignment",
      complexity: "State Space Tree Pruning",
      desc: "Matches task skill demand vectors against member competency vectors. Evaluates cost bounds and prunes subtrees to find the optimal assignment.",
      file: "server/algorithms/branchAndBound.js",
    },
  ];

  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Design & Analysis of Algorithms (DAA)</Text>
        <Text style={s.paragraph}>
          Every core operation in NEXUSFLOW is powered by formal DAA algorithmic implementations rather than naive heuristics:
        </Text>
      </Card>

      {algos.map((a) => (
        <Card key={a.name} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.h3}>{a.name}</Text>
            <Badge label={a.complexity} color={colors.primary} bg={colors.primarySoft} />
          </View>
          <Text style={s.paragraph}>{a.desc}</Text>
          <Text style={s.fileLink}>Module: {a.file}</Text>
        </Card>
      ))}
    </View>
  );
}

// ── 6. AUTHENTICATION ────────────────────────────────────────────────────────
function AuthenticationSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Production User Authentication</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW 2.0 features full user lifecycle authentication, bcrypt password security, and global profile synchronization:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Authentication Endpoints</Text>
        
        <View style={s.apiRow}>
          <Badge label="POST" color="#fff" bg={colors.primary} />
          <Text style={s.endpoint}>/api/auth/signup</Text>
        </View>
        <Text style={s.subText}>Validates required fields, email format, password strength (min 6 chars), and checks email uniqueness. Hashes password with bcrypt before creating MongoDB User.</Text>

        <View style={s.apiRow}>
          <Badge label="POST" color="#fff" bg={colors.accentDark} />
          <Text style={s.endpoint}>/api/auth/login</Text>
        </View>
        <Text style={s.subText}>Validates credentials using bcrypt compare. Returns 7-day signed JWT access token and user profile.</Text>

        <View style={s.apiRow}>
          <Badge label="GET" color="#fff" bg={colors.greedy} />
          <Text style={s.endpoint}>/api/me</Text>
        </View>
        <Text style={s.subText}>Requires JWT Bearer header. Returns fresh user profile for session restoration on browser refresh.</Text>

        <View style={s.apiRow}>
          <Badge label="PATCH" color="#fff" bg={colors.knapsack} />
          <Text style={s.endpoint}>/api/me</Text>
        </View>
        <Text style={s.subText}>Updates display name, avatar photo, bio, role, and skills. Automatically cascades updated name and avatar to all team rosters where the user is a member.</Text>
      </Card>
    </View>
  );
}

// ── 7. JWT EXPLAINED FOR STUDENTS ────────────────────────────────────────────
function JWTStudentSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>JSON Web Tokens (JWT) Explained</Text>
        <Text style={s.paragraph}>
          A JSON Web Token (JWT) is a compact, URL-safe means of representing claims to be transferred between two parties (your browser and the NexusFlow Express server).
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>The 3 Parts of a JWT</Text>
        <View style={s.jwtBox}>
          <Text style={[s.jwtPart, { color: colors.danger }]}>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</Text>
          <Text style={s.jwtDot}>.</Text>
          <Text style={[s.jwtPart, { color: colors.primary }]}>eyJpZCI6IjY2ZDI...IiwiZW1haWwiOiJhbGV4QGV4YW1wbGUuY29tIn0</Text>
          <Text style={s.jwtDot}>.</Text>
          <Text style={[s.jwtPart, { color: colors.accentDark }]}>TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ</Text>
        </View>
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.danger }]}>1. Header (Red):</Text> Algorithm & Token Type (HMAC-SHA256)</Text>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.primary }]}>2. Payload (Green):</Text> The Claims (User ID, Email, Name, Expiration)</Text>
          <Text style={s.paragraph}><Text style={[s.bold, { color: colors.accentDark }]}>3. Signature (Teal):</Text> Cryptographic seal created using `JWT_SECRET`. Prevents tampering!</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Authentication vs. Authorization</Text>
        <View style={s.diffGrid}>
          <View style={s.diffCard}>
            <Text style={s.diffTitle}>Authentication (AuthN)</Text>
            <Text style={s.diffSub}>"Who are you?"</Text>
            <Text style={s.diffTxt}>Verifying identity via email & password. The backend issues a JWT to prove who you are.</Text>
          </View>
          <View style={s.diffCard}>
            <Text style={s.diffTitle}>Authorization (AuthZ)</Text>
            <Text style={s.diffSub}>"What are you allowed to do?"</Text>
            <Text style={s.diffTxt}>Checking permissions. Example: User A has a valid JWT (AuthN), but is NOT allowed to view Team Beta (AuthZ → 403 Forbidden).</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 8. SECURITY & ISOLATION ──────────────────────────────────────────────────
function SecuritySection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Security & Strict Multi-Tenant Isolation</Text>
        <Text style={s.paragraph}>
          In NEXUSFLOW 2.0, multi-tenant isolation is enforced at the database query layer on every request:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Security Guarantees</Text>
        
        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>No Team Leakage (`GET /api/teams`)</Text>
            <Text style={s.subText}>Query is strictly scoped to `ownerId == user.id || members.userId == user.id`. Users never receive another team's data.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Server-Side Project Access Control</Text>
            <Text style={s.subText}>All project queries check team membership. Changing URL parameters or IDs returns `403 Forbidden`.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Private Copilot Chat Sessions</Text>
            <Text style={s.subText}>Conversations are indexed by `[projectId + user.id]`. User A cannot read or mutate User B's Copilot conversation turns.</Text>
          </View>
        </View>

        <View style={s.secItem}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Bcrypt Password Salting</Text>
            <Text style={s.subText}>Passwords are never stored in plaintext. Mongoose `select: false` prevents accidental leakage in database dumps.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 9. SYSTEM ARCHITECTURE ───────────────────────────────────────────────────
function ArchitectureSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>System Architecture & Data Flow</Text>
        <Text style={s.paragraph}>
          The complete end-to-end architecture connects the client, Express REST API, algorithmic workers, and MongoDB:
        </Text>
        <View style={s.diagramBox}>
          <Text style={s.diagramTxt}>{`
+-------------------------------------------------------------------+
|                        REACT FRONTEND                             |
|  (Expo / React Native Web - AuthProvider, Workspace, Project AI)  |
+-------------------------------------------------------------------+
                                  │
                   HTTPS / JSON + Bearer JWT Header
                                  │
                                  ▼
+-------------------------------------------------------------------+
|                        EXPRESS REST API                           |
|       requireAuth Middleware (JWT Signature & Token Verification) |
|       verifyTeamAccess (Server-Side Authorization & Isolation)    |
+-------------------------------------------------------------------+
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
+-----------------------+                         +-----------------------+
|  REST ROUTE HANDLERS  |                         |    AI ORCHESTRATOR    |
|  • /api/teams         |                         |  (via OmniRoute $0)   |
|  • /api/projects      |                         |  • Tier 1: Gemini Free|
|  • /api/tasks         |                         |  • Tier 2: OpenRouter |
+-----------------------+                         |  • Tier 3: Guidance   |
         │                                        +-----------------------+
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  │
                                  ▼
+-------------------------------------------------------------------+
|                     MONGOOSE ORM & MONGODB                        |
|  Users · Teams · Projects · Tasks · Decisions · AIConversations   |
+-------------------------------------------------------------------+
`}</Text>
        </View>
      </Card>
    </View>
  );
}

// ── ANALYTICS, RETROSPECTIVES & HISTORICAL AUDIT LEDGER ───────────────────────
function AnalyticsAuditSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Analytics, Historical Auditing & Continuous Improvement</Text>
        <Text style={s.paragraph}>
          NEXUSFLOW centralizes enterprise analytics, immutable audit logs, retrospective action items, and unified project health scoring across all methodologies (Waterfall, Scrum, Kanban, and Classic).
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>1. Unified Project Health Intelligence</Text>
        <Text style={s.paragraph}>
          Consolidates technical, process, and team metrics into a single authoritative 0–100 score and A–F grade with zero competing indicators:
        </Text>
        <View style={s.secItem}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>9 Deterministic Health Dimensions</Text>
            <Text style={s.subText}>Schedule adherence, critical-path risk, requirements stability, process conformance, team capacity, delivery throughput, code quality evidence, architecture alignment, and stakeholder alignment.</Text>
          </View>
        </View>
        <View style={s.secItem}>
          <Ionicons name="alert-circle" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Transparent Severity Safeguards</Text>
            <Text style={s.subText}>Distressed projects with severe bottleneck congestion, 0% capacity health, or critical phase blockers are protected by score-capping guards to prevent deceptive 100/100 rollups.</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>2. Historical Event Audit Trail & Memory Ledger</Text>
        <Text style={s.paragraph}>
          All state mutations—including requirement revisions, phase approvals, dependency link edits, task transitions, and finalizations—are immutably logged to the project audit ledger.
        </Text>
        <View style={s.secItem}>
          <Ionicons name="time-outline" size={18} color={colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Audit Compliance & Traceability</Text>
            <Text style={s.subText}>Full traceability from business requirement to task ID to Git commit hash, preventing unverified state bypasses and ensuring academic and enterprise compliance.</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>3. Methodology-Aware Analytics & Retrospectives</Text>
        <Text style={s.paragraph}>
          Metrics adhere to the governance rules of the active project methodology:
        </Text>
        <View style={s.secItem}>
          <Ionicons name="water-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Waterfall Governance</Text>
            <Text style={s.subText}>Phase Gate Status, Critical Path Variance, Upstream Dependency Blocking Chains, and Phase Delivery Pace.</Text>
          </View>
        </View>
        <View style={s.secItem}>
          <Ionicons name="repeat-outline" size={18} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>Scrum & Kanban Flow</Text>
            <Text style={s.subText}>Sprint Burndown, Team Velocity Trends, Sprint Retrospectives, Cumulative Flow Diagrams (CFD), Work-in-Progress (WIP) Limits, and Lead/Cycle Time analytics.</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

// ── 10. LOW LEVEL DESIGN (LLD) ───────────────────────────────────────────────
function LLDSection() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <Text style={font.h2}>Low-Level Design (LLD) Reference</Text>
        <Text style={s.paragraph}>
          Summary of primary modules across the NEXUSFLOW codebase:
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Backend Modules</Text>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/omniRoute.js</Text>
          <Text style={s.subText}>Strict $0 LLM routing engine, fail-closed route validation guard (`validateZeroCostRoute`), Gemini Free Tier & OpenRouter Free invocations.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/aiOrchestrator.js</Text>
          <Text style={s.subText}>Central Copilot and Project Analysis orchestrator delegating exclusively through OmniRoute with zero paid fallback.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/auth.js</Text>
          <Text style={s.subText}>JWT signing, token verification, `requireAuth` middleware, and User formatting.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/index.js</Text>
          <Text style={s.subText}>Express bootstrap, auth routes (`/api/auth/signup`, `/api/auth/login`, `/api/me`), Socket.io server.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/routes/teams.js</Text>
          <Text style={s.subText}>Team CRUD, user isolation, member roster management, DAA analytics, and Knapsack sprint optimizer.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/routes/projects.js</Text>
          <Text style={s.subText}>Project CRUD, Project Intelligence, Copilot chat, Decisions, Recommendations, Architecture components.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>server/services/projectIntelligence.js</Text>
          <Text style={s.subText}>Aggregates context, runs AI analysis, manages private Copilot sessions, and extracts memory updates.</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={font.h3}>Frontend Modules</Text>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/context/AuthContext.tsx</Text>
          <Text style={s.subText}>Global central user state, session restoration, signup, login, and instant profile update dispatch.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/ProjectAdvisorPanel.tsx</Text>
          <Text style={s.subText}>Project AI Hub UI with 7 tabs (Brief, Guidance, Copilot, Decisions, Architecture, Research, Decide).</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/SprintPanel.tsx</Text>
          <Text style={s.subText}>0/1 Knapsack DP Sprint Optimizer UI with capacity dial, value-density ranking, and commit actions.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/GraphPanel.tsx</Text>
          <Text style={s.subText}>Topological sort DAG dependency graph visualization with node statuses and blocker highlights.</Text>
        </View>
        <View style={s.lldRow}>
          <Text style={s.bold}>client/components/workspace/AssignmentBoard.tsx</Text>
          <Text style={s.subText}>Branch & Bound member assignment roster with skill demand matrix and workload distribution.</Text>
        </View>
      </Card>
    </View>
  );
}

// ── Stylesheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  navWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBar: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navPillTxt: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.textMuted,
  },
  navPillTxtActive: {
    color: "#fff",
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
  },

  contentScroll: {
    padding: spacing.lg,
    alignItems: "center",
  },
  container: {
    width: "100%",
    maxWidth: layout.maxWidth,
    gap: spacing.lg,
  },

  paragraph: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "700",
    color: colors.text,
  },
  subText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 2,
  },
  fileLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 4,
  },

  codeBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeTxt: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 13,
    color: colors.primary,
    fontWeight: "700",
  },

  stepRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepBadgeTxt: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  stepTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.text,
  },
  stepDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 2,
  },

  bulletItem: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },

  tabExplain: {
    gap: 3,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  cascadeWrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cascadeStep: {
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 3,
  },
  cascadeStepNum: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  cascadeStepTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  cascadeStepDesc: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
  },

  apiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  endpoint: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.text,
  },

  jwtBox: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  jwtPart: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11.5,
    fontWeight: "700",
  },
  jwtDot: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.textFaint,
    marginHorizontal: 2,
  },

  diffGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: 4,
  },
  diffCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  diffTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: colors.text,
  },
  diffSub: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    fontStyle: "italic",
  },
  diffTxt: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },

  secItem: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: 4,
  },

  diagramBox: {
    backgroundColor: "#111827",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  diagramTxt: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11,
    color: "#E5E7EB",
    lineHeight: 16,
  },

  lldRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },

  // Methodologies & Waterfall Guide Styles
  methViewSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  methViewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  methViewBtnActive: {
    backgroundColor: colors.primary,
  },
  methViewBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  methViewBtnTxtActive: {
    color: "#fff",
    fontWeight: "700",
  },
  methCard: {
    gap: spacing.md,
  },
  methHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  methPartBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    gap: 4,
  },
  methPartNum: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  methPartBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  tabPillsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  tabPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabPillTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  tabPillTxtActive: {
    color: "#fff",
    fontWeight: "700",
  },
  subTabGrid: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  subTabCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  sequenceStepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleTxt: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
});
