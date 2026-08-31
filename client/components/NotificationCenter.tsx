/**
 * NotificationCenter.tsx — NEXUSFLOW Notification & Collaboration Hub.
 *
 * Surfaces:
 * 1. Live Team Invitations (Accept / Reject) — driven by useInvitations hook
 *    passed from the parent screen (Dashboard or Workspace). This ensures both
 *    the dashboard bell and the Join Team modal operate on the SAME invitation
 *    documents without duplication.
 * 2. System Reminders & Deadlines (overdue tasks, approaching deadlines)
 * 3. Server Collaboration Notifications (activity log, acceptance feedback)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReminders, type Severity } from "@/hooks/useReminders";
import { useAuth } from "@/context/AuthContext";
import { ModalSheet, useToast } from "@/components/feedback";
import { EmptyState, Button } from "@/components/ui";
import { colors, spacing, radius } from "@/theme";
import { API_BASE_URL } from "@/utils/api";
import type { PendingInvitation, UseInvitationsResult } from "@/hooks/useInvitations";

const SEV_META: Record<Severity, { color: string; bg: string }> = {
  critical: { color: colors.danger, bg: colors.dangerSoft },
  warning:  { color: colors.warning, bg: colors.warningSoft },
  info:     { color: colors.info, bg: colors.infoSoft },
};

interface ServerNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  teamId?: string;
  /** Shared invitation state from useInvitations hook — passed by the parent screen */
  invitations: PendingInvitation[];
  pendingCount: number;
  onAccept: (invitationId: string) => Promise<{ success?: boolean; teamId?: string; message?: string; error?: string }>;
  onReject: (invitationId: string) => Promise<{ success?: boolean; message?: string; error?: string }>;
  /** Called after a successful accept so the team list refreshes */
  onTeamsRefetch?: () => void;
}

export default function NotificationCenter({
  teamId,
  invitations,
  pendingCount,
  onAccept,
  onReject,
  onTeamsRefetch,
}: NotificationCenterProps) {
  const { token, refreshProfile } = useAuth();
  const { reminders, counts } = useReminders(teamId || "");
  const [open, setOpen] = useState(false);
  const [serverNotifs, setServerNotifs] = useState<ServerNotification[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const toast = useToast();
  const warned = useRef(false);

  // Load server activity notifications (not invitations — those come from useInvitations)
  const loadServerNotifs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServerNotifs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn("[NotificationCenter] Failed to load server notifications:", err);
    }
  }, [token]);

  useEffect(() => {
    loadServerNotifs();
    const interval = setInterval(loadServerNotifs, 15000);
    return () => clearInterval(interval);
  }, [loadServerNotifs]);

  // One-time toast when overdue work first appears
  useEffect(() => {
    if (!warned.current && counts.critical > 0) {
      warned.current = true;
      toast(`${counts.critical} task${counts.critical !== 1 ? "s" : ""} overdue — review reminders`, "error");
    }
  }, [counts.critical, toast]);

  // Accept Invitation
  const handleAccept = async (invId: string) => {
    setActionLoading(invId);
    try {
      const result = await onAccept(invId);
      if (result.error) throw new Error(result.error);
      toast(result.message || "Invitation accepted! You joined the team.", "success");
      await loadServerNotifs();
      await refreshProfile();
      onTeamsRefetch?.();
    } catch (err: any) {
      toast(err.message || "Failed to accept invitation", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Reject Invitation
  const handleReject = async (invId: string) => {
    setActionLoading(invId);
    try {
      const result = await onReject(invId);
      if (result.error) throw new Error(result.error);
      toast("Invitation declined.", "info");
      await loadServerNotifs();
    } catch (err: any) {
      toast(err.message || "Failed to reject invitation", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const totalBadges = counts.total + pendingCount;
  const badgeColor = pendingCount > 0 ? colors.accent : counts.critical > 0 ? colors.danger : colors.warning;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={s.bell} id="notification-bell">
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        {totalBadges > 0 && (
          <View style={[s.badge, { backgroundColor: badgeColor }]}>
            <Text style={s.badgeTxt}>{totalBadges > 9 ? "9+" : totalBadges}</Text>
          </View>
        )}
      </Pressable>

      <ModalSheet visible={open} onClose={() => setOpen(false)} title="Notification Center">
        {/* Section 1: Team Invitations (High Priority) */}
        {invitations.length > 0 && (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={s.sectionHeader}>PENDING TEAM INVITATIONS ({invitations.length})</Text>
            {invitations.map((inv) => (
              <View key={inv._id} style={s.invCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={s.invIcon}>
                    <Ionicons name="mail-unread-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.invTitle}>Team Invitation</Text>
                    <Text style={s.invMsg}>
                      <Text style={{ fontWeight: "700", color: colors.text }}>{inv.inviterName || "A teammate"}</Text>
                      {" invited you to join "}
                      <Text style={{ fontWeight: "700", color: colors.accent }}>{inv.teamName}</Text>
                      .
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, justifyContent: "flex-end" }}>
                  <Button
                    title="Reject"
                    variant="secondary"
                    small
                    loading={actionLoading === inv._id}
                    onPress={() => handleReject(inv._id)}
                  />
                  <Button
                    title="Accept Invitation"
                    icon="checkmark"
                    small
                    loading={actionLoading === inv._id}
                    onPress={() => handleAccept(inv._id)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Section 2: Task Reminders & Deadlines */}
        {reminders.length > 0 && (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={s.sectionHeader}>PROJECT REMINDERS ({reminders.length})</Text>
            {reminders.map((r) => {
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
            })}
          </View>
        )}

        {/* Section 3: Recent Activity Notifications */}
        {serverNotifs.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.sectionHeader}>ACTIVITY LOG</Text>
            {serverNotifs.slice(0, 5).map((n) => (
              <View key={n._id} style={s.logItem}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.logTitle}>{n.title}</Text>
                  <Text style={s.logMsg}>{n.message}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {invitations.length === 0 && reminders.length === 0 && serverNotifs.length === 0 && (
          <EmptyState
            icon="checkmark-done-outline"
            title="All clear"
            message="No pending team invitations, overdue tasks, or alerts."
          />
        )}
      </ModalSheet>
    </>
  );
}

const s = StyleSheet.create({
  bell: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  badge: { position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff" },

  sectionHeader: { fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.8, marginTop: 4 },
  invCard: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.accent + "44", borderRadius: radius.md, padding: spacing.md },
  invIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" },
  invTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  invMsg: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },

  item: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: spacing.md, borderRadius: radius.md },
  itemTitle: { fontSize: 13, fontWeight: "800" },
  itemMsg: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },

  logItem: { flexDirection: "row", gap: 8, padding: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, alignItems: "flex-start" },
  logTitle: { fontSize: 12, fontWeight: "700", color: colors.text },
  logMsg: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
