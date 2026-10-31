/**
 * client/components/ClassicGuideBanner.tsx
 * ============================================================================
 * NEXUSFLOW V1 — CLASSIC DAA PROJECT GUIDE BANNER
 *
 * "New to NexusFlow Classic? Learn how the original DAA-based project
 *  management workflow works."
 *
 * Appears exclusively in NexusFlow Classic Overview tab.
 * Dismissible with minimized reopen pill. Opens ClassicGuideModal.
 * ============================================================================
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/theme";
import ClassicGuideModal from "./ClassicGuideModal";

interface Props {
  onNavigateTab?: (tabKey: string) => void;
  style?: any;
}

export default function ClassicGuideBanner({ onNavigateTab, style }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <View style={[s.minimizedRow, style]}>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={s.reopenBtn}
          accessibilityLabel="Open Classic DAA Project Guide"
        >
          <Ionicons name="hardware-chip-outline" size={13} color="#2563EB" />
          <Text style={s.reopenTxt}>Classic DAA Guide</Text>
        </Pressable>
        <ClassicGuideModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onNavigateTab={onNavigateTab}
        />
      </View>
    );
  }

  return (
    <>
      <View style={[s.banner, style]}>
        <View style={s.iconWrap}>
          <Ionicons name="hardware-chip-outline" size={20} color="#2563EB" />
        </View>

        <View style={s.textWrap}>
          <Text style={s.title}>New to NexusFlow Classic?</Text>
          <Text style={s.sub}>
            Learn how the original DAA-based project management workflow works.
          </Text>
        </View>

        <Pressable
          onPress={() => setModalVisible(true)}
          style={s.ctaBtn}
          accessibilityLabel="Open Guide"
        >
          <Text style={s.ctaTxt}>Open Guide →</Text>
        </Pressable>

        <Pressable
          onPress={() => setDismissed(true)}
          style={s.dismissBtn}
          accessibilityLabel="Dismiss guide banner"
        >
          <Ionicons name="close" size={16} color="#94a3b8" />
        </Pressable>
      </View>

      <ClassicGuideModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onNavigateTab={onNavigateTab}
      />
    </>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e3a8a",
  },
  sub: {
    fontSize: 11.5,
    color: "#2563eb",
    marginTop: 1,
  },
  ctaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ctaTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  dismissBtn: {
    padding: 4,
    flexShrink: 0,
  },
  minimizedRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.xs,
  },
  reopenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  reopenTxt: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#2563eb",
  },
});

