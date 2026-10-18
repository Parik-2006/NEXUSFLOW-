/**
 * client/components/WaterfallGuideBanner.tsx
 * ============================================================================
 * NEXUSFLOW V4 — UNOBTRUSIVE WATERFALL GUIDE ENTRY POINT
 *
 * Provides a clean, elegant, non-intrusive entry point:
 * "New to Waterfall? Open the step-by-step guide"
 *
 * Does not block users or force modals, can be dismissed per session or opened anytime.
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/theme";
import WaterfallGuideModal from "@/components/WaterfallGuideModal";

interface Props {
  onNavigateTab?: (tabKey: string) => void;
  style?: any;
}

export default function WaterfallGuideBanner({ onNavigateTab, style }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <View style={[s.minimizedRow, style]}>
        <Pressable onPress={() => setModalVisible(true)} style={s.reopenBtn}>
          <Ionicons name="compass-outline" size={13} color="#0d9488" />
          <Text style={s.reopenTxt}>Waterfall Guide</Text>
        </Pressable>
        <WaterfallGuideModal
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
          <Ionicons name="compass" size={16} color="#0d9488" />
        </View>
        <View style={s.textCol}>
          <Text style={s.title}>New to Waterfall?</Text>
          <Text style={s.desc}>Open the step-by-step guide to all 7 tabs & 6 phases</Text>
        </View>
      </View>

      <View style={s.bannerRight}>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={s.openGuideBtn}
          accessibilityLabel="Open Waterfall Step-by-Step Guide"
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

      <WaterfallGuideModal
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
    backgroundColor: "#F4F9F8",
    borderWidth: 1,
    borderColor: "#D3E9E5",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  bannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 220,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E2F2EE",
    justifyContent: "center",
    alignItems: "center",
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f766e",
  },
  desc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
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
    backgroundColor: "#0d9488",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  openGuideBtnTxt: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  dismissBtn: {
    padding: 4,
  },
  minimizedRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 2,
  },
  reopenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F4F9F8",
    borderWidth: 1,
    borderColor: "#D3E9E5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  reopenTxt: {
    fontSize: 11,
    color: "#0d9488",
    fontWeight: "600",
  },
});
