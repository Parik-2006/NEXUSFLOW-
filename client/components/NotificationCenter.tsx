/**
 * NotificationCenter.tsx — Feature 4: dashboard notification center.
 * A header bell with an unread badge that opens a sheet listing live reminders
 * (overdue tasks, approaching deadlines, blocked assignments). Fires a one-time
 * toast when overdue work is first detected.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReminders, type Severity } from "@/hooks/useReminders";
import { ModalSheet, useToast } from "@/components/feedback";
import { EmptyState } from "@/components/ui";
import { colors, spacing, radius } from "@/theme";

const SEV_META: Record<Severity, { color: string; bg: string }> = {
  critical: { color: colors.danger, bg: colors.dangerSoft },
  warning:  { color: colors.warning, bg: colors.warningSoft },
  info:     { color: colors.info, bg: colors.infoSoft },
};

export default function NotificationCenter({ teamId }: { teamId: string }) {
  const { reminders, counts } = useReminders(teamId);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const warned = useRef(false);

  // One-time toast when overdue work first appears.
  useEffect(() => {
    if (!warned.current && counts.critical > 0) {
      warned.current = true;
      toast(`${counts.critical} task${counts.critical !== 1 ? "s" : ""} overdue — review reminders`, "error");
    }
  }, [counts.critical, toast]);

  const badgeColor = counts.critical > 0 ? colors.danger : colors.warning;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={s.bell}>
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        {counts.total > 0 && (
          <View style={[s.badge, { backgroundColor: badgeColor }]}>
            <Text style={s.badgeTxt}>{counts.total > 9 ? "9+" : counts.total}</Text>
          </View>
        )}
      </Pressable>

      <ModalSheet visible={open} onClose={() => setOpen(false)} title="Notifications">
        {reminders.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="All clear" message="No overdue tasks or approaching deadlines." />
        ) : (
          reminders.map((r) => {
            const m = SEV_META[r.severity];
            return (
              <View key={r.id} style={[s.item, { backgroundColor: m.bg }]}>
                <Ionicons name={r.icon as any} size={18} color={m.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.itemTitle, { color: m.color }]}>{r.title}</Text>
                  <Text style={s.itemMsg}>{r.message}</Text>
                </View>
              </View>
            );
          })
        )}
      </ModalSheet>
    </>
  );
}

const s = StyleSheet.create({
  bell: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  badge: { position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff" },

  item: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: spacing.md, borderRadius: radius.md },
  itemTitle: { fontSize: 13, fontWeight: "800" },
  itemMsg: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
});
