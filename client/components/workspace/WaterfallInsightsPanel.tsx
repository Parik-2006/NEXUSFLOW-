import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UnifiedProjectHealthPanel from "@/components/workspace/UnifiedProjectHealthPanel";
import RiskPanel from "@/components/workspace/RiskPanel";
import GraphPanel from "@/components/workspace/GraphPanel";
import ProjectLearningPanel from "@/components/workspace/ProjectLearningPanel";
import CapabilityIntelligencePanel from "@/components/workspace/CapabilityIntelligencePanel";
import { colors, spacing, radius, font } from "@/theme";

type InsightSubTab = "health" | "learning" | "capability" | "risks" | "dag";

interface InsightTabOption {
  key: InsightSubTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const SUB_TABS: InsightTabOption[] = [
  { key: "health",    label: "Project Health",icon: "shield-checkmark-outline", color: colors.primary },
  { key: "learning",  label: "Learning Loop", icon: "school-outline",           color: colors.greedy },
  { key: "capability",label: "Capability",    icon: "people-outline",           color: colors.branch },
  { key: "risks",     label: "Risk Radar",    icon: "alert-circle-outline",     color: colors.warning },
  { key: "dag",       label: "Dependency DAG",icon: "git-network-outline",       color: colors.topo },
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
          <UnifiedProjectHealthPanel projectId={projectId || teamId} teamId={teamId} />
        )}
        {activeSubTab === "learning" && (
          <ProjectLearningPanel projectId={projectId || teamId} />
        )}
        {activeSubTab === "capability" && (
          <CapabilityIntelligencePanel projectId={projectId || teamId} />
        )}
        {activeSubTab === "risks" && (
          <RiskPanel teamId={teamId} projectId={projectId} />
        )}
        {activeSubTab === "dag" && <GraphPanel teamId={teamId} />}
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
