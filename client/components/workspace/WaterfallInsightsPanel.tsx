import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TeamHealthPanel from "@/components/workspace/TeamHealthPanel";
import RiskPanel from "@/components/workspace/RiskPanel";
import GraphPanel from "@/components/workspace/GraphPanel";
import RetroPanel from "@/components/workspace/RetroPanel";
import AnalyticsPanel from "@/components/workspace/AnalyticsPanel";
import ProjectEventTimeline from "@/components/workspace/ProjectEventTimeline";
import { colors, spacing, radius, font } from "@/theme";

type InsightSubTab = "health" | "risks" | "dag" | "retro" | "analytics" | "history";

interface InsightTabOption {
  key: InsightSubTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const SUB_TABS: InsightTabOption[] = [
  { key: "health",    label: "Team Health",   icon: "heart-outline",        color: colors.success },
  { key: "risks",     label: "Risk Radar",    icon: "shield-checkmark-outline", color: colors.warning },
  { key: "dag",       label: "Dependency DAG",icon: "git-network-outline",   color: colors.topo },
  { key: "retro",     label: "Retrospectives",icon: "clipboard-outline",    color: colors.info },
  { key: "analytics", label: "Analytics",     icon: "stats-chart-outline",  color: colors.merge },
  { key: "history",   label: "Event History", icon: "time-outline",         color: colors.accent },
];

export default function WaterfallInsightsPanel({
  teamId,
  projectId,
}: {
  teamId: string;
  projectId?: string;
}) {
  const [activeSubTab, setActiveSubTab] = useState<InsightSubTab>("health");

  return (
    <View style={s.container}>
      {/* Sub-navigation bar */}
      <View style={s.navBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.navList}
        >
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveSubTab(tab.key)}
                style={[
                  s.navItem,
                  isActive && {
                    backgroundColor: tab.color + "18",
                    borderColor: tab.color + "44",
                  },
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? tab.color : colors.textMuted}
                />
                <Text
                  style={[
                    s.navLabel,
                    isActive && { color: tab.color, fontWeight: "700" },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content Area */}
      <View style={s.content}>
        {activeSubTab === "health" && (
          <TeamHealthPanel teamId={teamId} projectId={projectId} />
        )}
        {activeSubTab === "risks" && (
          <RiskPanel teamId={teamId} projectId={projectId} />
        )}
        {activeSubTab === "dag" && <GraphPanel teamId={teamId} />}
        {activeSubTab === "retro" && (
          <RetroPanel teamId={teamId} projectId={projectId} />
        )}
        {activeSubTab === "analytics" && <AnalyticsPanel teamId={teamId} />}
        {activeSubTab === "history" && (
          <ProjectEventTimeline projectId={projectId || teamId} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  navBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  navList: {
    gap: 8,
    alignItems: "center",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surfaceAlt,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  content: {
    flex: 1,
  },
});
