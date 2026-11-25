/**
 * TrashPanel — Phase 2 (Task 7): "Recently deleted" workspaces and projects.
 * Lists archived items the user may manage (owner: workspaces; owner/leader:
 * projects), with Restore and typed-name Permanent delete.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Button, Badge } from "@/components/ui";
import { useConfirm, useToast } from "@/components/feedback";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, spacing, radius, font } from "@/theme";

type TrashItem = {
  type: "workspace" | "project";
  id: string;
  name: string;
  workspaceName?: string;
  archivedAt: string;
  purgeAfter: string | null;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function TrashPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [recoveryDays, setRecoveryDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trash`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load recently deleted items.");
      setItems(data.items || []);
      setRecoveryDays(data.recoveryDays ?? null);
    } catch (e: any) {
      setItems(null);
      setError(e?.message || "Could not load recently deleted items.");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const path = (i: TrashItem) => `${API_BASE_URL}/api/trash/${i.type === "workspace" ? "workspaces" : "projects"}/${i.id}`;

  const restore = async (i: TrashItem) => {
    setBusyId(i.id);
    try {
      const res = await fetch(`${path(i)}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Restore failed.");
      toast(`"${i.name}" restored`, "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Restore failed.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (i: TrashItem) => {
    const ok = await confirm({
      title: `Delete "${i.name}" forever?`,
      message: `This permanently deletes the ${i.type} and all of its data. This cannot be undone.`,
      confirmLabel: "Delete forever",
      destructive: true,
      requireTypedText: i.name,
    });
    if (!ok) return;
    setBusyId(i.id);
    try {
      const res = await fetch(path(i), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmName: i.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Permanent delete failed.");
      toast(`"${i.name}" permanently deleted`, "info");
      await load();
    } catch (e: any) {
      toast(e?.message || "Permanent delete failed.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={st.head}>
        <Ionicons name="trash-outline" size={18} color={colors.primary} />
        <Text style={font.h3}>Recently deleted</Text>
      </View>
      <Text style={st.sub}>
        Deleted workspaces and projects can be restored{recoveryDays ? ` for ${recoveryDays} days` : ""} before they are removed.
      </Text>

      {error ? (
        <View style={st.errorRow} accessibilityRole="alert">
          <Text style={st.errorTxt}>{error}</Text>
          <Pressable onPress={load} hitSlop={8} accessibilityRole="button"><Text style={st.retry}>Retry</Text></Pressable>
        </View>
      ) : items === null ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading recently deleted items" />
      ) : items.length === 0 ? (
        <Text style={st.empty}>Nothing here — deleted workspaces and projects will appear in this list.</Text>
      ) : (
        items.map((i) => (
          <View key={`${i.type}:${i.id}`} style={st.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={st.name} numberOfLines={1}>{i.name}</Text>
                <Badge label={i.type === "workspace" ? "Workspace" : "Project"} color={colors.primary} bg={colors.primarySoft} />
              </View>
              <Text style={st.meta}>
                {i.type === "project" && i.workspaceName ? `${i.workspaceName} · ` : ""}Deleted {fmt(i.archivedAt)} · restorable until {fmt(i.purgeAfter)}
              </Text>
            </View>
            <View style={st.actions}>
              <Button title="Restore" icon="refresh" small onPress={() => restore(i)} loading={busyId === i.id} />
              <Button title="Delete" icon="trash" small variant="danger" onPress={() => purge(i)} disabled={busyId === i.id} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  sub: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap" },
  name: { fontSize: 14, fontWeight: "700", color: colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorTxt: { flex: 1, fontSize: 12.5, color: colors.danger, fontWeight: "600" },
  retry: { fontSize: 12.5, fontWeight: "800", color: colors.primary },
});
