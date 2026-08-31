/**
 * JoinTeamModal — Invitation-first team joining flow.
 *
 * Replaces the legacy "list all teams and type your name" approach with the
 * correct email-invitation flow:
 *
 *   - Shows all pending invitations for the authenticated user.
 *   - Each invitation has [Accept Invitation] and [Reject] buttons.
 *   - If no pending invitations: clear empty state with instructions.
 *
 * Operates on the SAME Invitation documents as the NotificationCenter bell.
 * No duplicate records are created.
 */
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Avatar, EmptyState, Button } from "@/components/ui";
import { colors, radius, spacing, font } from "@/theme";
import type { PendingInvitation } from "@/hooks/useInvitations";

interface JoinTeamModalProps {
  visible: boolean;
  onClose: () => void;
  invitations: PendingInvitation[];
  onAccept: (invitationId: string) => Promise<{ success?: boolean; teamId?: string; message?: string; error?: string }>;
  onReject: (invitationId: string) => Promise<{ success?: boolean; message?: string; error?: string }>;
  onTeamsRefetch?: () => void;
}

export default function JoinTeamModal({
  visible,
  onClose,
  invitations,
  onAccept,
  onReject,
  onTeamsRefetch,
}: JoinTeamModalProps) {
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAccept = async (inv: PendingInvitation) => {
    setActionLoading(inv._id);
    try {
      const result = await onAccept(inv._id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(result.message || `You joined ${inv.teamName}!`, "success");
      onTeamsRefetch?.();
      // Close modal if no more pending invitations
      if (invitations.length <= 1) onClose();
    } catch (e: any) {
      toast(e.message || "Failed to accept invitation", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (inv: PendingInvitation) => {
    setActionLoading(inv._id);
    try {
      const result = await onReject(inv._id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Invitation declined.", "info");
      if (invitations.length <= 1) onClose();
    } catch (e: any) {
      toast(e.message || "Failed to reject invitation", "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Join a Team">
      {invitations.length === 0 ? (
        <EmptyState
          icon="mail-open-outline"
          title="No pending invitations"
          message={"Ask a teammate to invite you using your registered email address.\n\nThey can go to: Team → Members → Invite Teammate by Email"}
        />
      ) : (
        <>
          <Text style={s.sectionLabel}>PENDING INVITATIONS ({invitations.length})</Text>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
            {invitations.map((inv) => (
              <View key={inv._id} style={s.card}>
                {/* Team Avatar + Name */}
                <View style={s.cardHeader}>
                  <View style={s.teamAvatar}>
                    <Text style={s.teamAvatarText}>
                      {(inv.teamName || "T").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.teamName} numberOfLines={1}>{inv.teamName}</Text>
                    <Text style={s.inviterText} numberOfLines={1}>
                      Invited by{" "}
                      <Text style={{ fontWeight: "700", color: colors.text }}>
                        {inv.inviterName || "a teammate"}
                      </Text>
                    </Text>
                  </View>
                  <View style={s.pendingBadge}>
                    <Text style={s.pendingBadgeText}>Pending</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={s.actions}>
                  <Button
                    title="Reject"
                    variant="secondary"
                    small
                    loading={actionLoading === inv._id}
                    onPress={() => handleReject(inv)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Accept Invitation"
                    icon="checkmark-circle"
                    small
                    loading={actionLoading === inv._id}
                    onPress={() => handleAccept(inv)}
                    style={{ flex: 2 }}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + "33",
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  teamAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  teamAvatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  teamName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  inviterText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent + "22",
    borderWidth: 1,
    borderColor: colors.accent + "55",
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.accent,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
