/**
 * client/components/ScrumGuideBanner.tsx
 * ============================================================================
 * NEXUSFLOW V4 — UNOBTRUSIVE SCRUM WORKFLOW BANNER
 *
 * "New to Scrum? Follow the workflow from project setup and backlog planning
 *  to sprint execution, review and continuous improvement."
 *
 * Dismissible, persistent state, opens ScrumGuideModal.
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/theme";
import ScrumGuideModal from "./ScrumGuideModal";

interface Props {
  onNavigateTab?: (tabKey: string, section?: string) => void;
  style?: any;
}

export default function ScrumGuideBanner({ onNavigateTab, style }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <View style={[s.minimizedRow, style]}>
        <Pressable onPress={() => setModalVisible(true)} style={s.reopenBtn}>
          <Ionicons name="rocket-outline" size={13} color="#4F46E5" />
          <Text style={s.reopenTxt}>Scrum Guide</Text>
        </Pressable>
        <ScrumGuideModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onNavigateTab={onNavigateTab}
        />
      </View>
    );
  }

  return (
    <View style={[s.banner, style]}>
      <View style={s.bannerLeft}>
        <View style={s.iconWrap}>
          <Ionicons name="rocket" size={16} color="#4F46E5" />
        </View>
        <View style={s.textCol}>
          <Text style={s.title}>New to Scrum?</Text>
          <Text style={s.desc}>
            Follow the workflow from project setup and backlog planning to sprint execution, review and continuous improvement.
          </Text>
        </View>
      </View>

      <View style={s.bannerRight}>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={s.openGuideBtn}
          accessibilityLabel="Open Scrum Step-by-Step Guide"
        >
          <Text style={s.openGuideBtnTxt}>Open Guide</Text>
          <Ionicons name="arrow-forward" size={12} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          style={s.dismissBtn}
          accessibilityLabel="Dismiss guide banner"
        >
          <Ionicons name="close" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrumGuideModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onNavigateTab={onNavigateTab}
      />
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  bannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 260,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#312E81",
  },
  desc: {
    fontSize: 11,
    color: "#4338CA",
    marginTop: 1,
    lineHeight: 15,
  },
  bannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  openGuideBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  openGuideBtnTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  minimizedRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.xs,
  },
  reopenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  reopenTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4F46E5",
  },
});
