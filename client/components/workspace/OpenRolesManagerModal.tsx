/**
 * OpenRolesManagerModal.tsx — Workspace Leader Open Roles Management
 *
 * Allows authorized workspace leaders to define, view, and close open roles
 * accepting applications from discoverable students.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Button, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, radius, spacing, font } from "@/theme";

interface OpenRoleItem {
  _id: string;
  roleName: string;
  roleDescription?: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  minVerificationScore?: number;
  expectations?: string;
  availableSlots: number;
  filledSlots: number;
  status: string;
}

interface OpenRolesManagerModalProps {
  visible: boolean;
  teamId: string;
  roles: OpenRoleItem[];
  onClose: () => void;
  onRolesUpdated: () => void;
}

const COMMON_SKILLS = ["frontend", "backend", "devops", "design", "ml", "testing"];

export default function OpenRolesManagerModal({
  visible,
  teamId,
  roles = [],
  onClose,
  onRolesUpdated,
}: OpenRolesManagerModalProps) {
  const { token } = useAuth();
  const toast = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedReqSkills, setSelectedReqSkills] = useState<string[]>([]);
  const [selectedPrefSkills, setSelectedPrefSkills] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState("1");
  const [expectations, setExpectations] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleReqSkill = (s: string) => {
    if (selectedReqSkills.includes(s)) {
      setSelectedReqSkills(selectedReqSkills.filter((x) => x !== s));
    } else {
      setSelectedReqSkills([...selectedReqSkills, s]);
      setSelectedPrefSkills(selectedPrefSkills.filter((x) => x !== s));
    }
  };

  const togglePrefSkill = (s: string) => {
    if (selectedPrefSkills.includes(s)) {
      setSelectedPrefSkills(selectedPrefSkills.filter((x) => x !== s));
    } else {
      setSelectedPrefSkills([...selectedPrefSkills, s]);
      setSelectedReqSkills(selectedReqSkills.filter((x) => x !== s));
    }
  };

  const handleCreateRole = async () => {
    if (!roleName.trim()) {
      toast("Role name is required.", "error");
      return;
    }
    const slots = parseInt(availableSlots, 10) || 1;
    if (slots < 1) {
      toast("Available slots must be at least 1.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/open-roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roleName: roleName.trim(),
          roleDescription: roleDescription.trim(),
          requiredSkills: selectedReqSkills,
          preferredSkills: selectedPrefSkills,
          minVerificationScore: 3,
          availableSlots: slots,
          expectations: expectations.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create open role.");

      toast(`Role "${roleName.trim()}" published.`, "success");
      setRoleName("");
      setRoleDescription("");
      setSelectedReqSkills([]);
      setSelectedPrefSkills([]);
      setAvailableSlots("1");
      setExpectations("");
      setShowAddForm(false);
      onRolesUpdated();
    } catch (err: any) {
      toast(err.message || "Failed to publish role.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    setDeletingId(roleId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/open-roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove role.");

      toast("Open role removed.", "info");
      onRolesUpdated();
    } catch (err: any) {
      toast(err.message || "Could not delete role.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Manage Open Roles">
      <ScrollView
        style={{ maxHeight: 540 }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Action */}
        <View style={s.topBar}>
          <Text style={s.sectionLabel}>ACTIVE OPEN ROLES ({roles.length})</Text>
          {!showAddForm && (
            <Pressable style={s.addBtn} onPress={() => setShowAddForm(true)}>
              <Ionicons name="add-circle" size={16} color={colors.primary} />
              <Text style={s.addBtnText}>Add Role</Text>
            </Pressable>
          )}
        </View>

        {/* Add Role Form */}
        {showAddForm && (
          <View style={s.formCard}>
            <Text style={s.formTitle}>Define New Open Role</Text>

            <View style={s.field}>
              <Text style={s.label}>Role Name *</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Frontend Architect, ML Specialist"
                placeholderTextColor={colors.textFaint}
                value={roleName}
                onChangeText={setRoleName}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Description</Text>
              <TextInput
                style={s.input}
                placeholder="Describe key responsibilities in the sprint"
                placeholderTextColor={colors.textFaint}
                value={roleDescription}
                onChangeText={setRoleDescription}
              />
            </View>

            {/* Required Skills Picker */}
            <View style={s.field}>
              <Text style={s.label}>Required Skills (Enforces Quiz Verification)</Text>
              <View style={s.chipsRow}>
                {COMMON_SKILLS.map((sk) => {
                  const active = selectedReqSkills.includes(sk);
                  return (
                    <Pressable
                      key={sk}
                      style={[s.chip, active && s.chipReqActive]}
                      onPress={() => toggleReqSkill(sk)}
                    >
                      <Text style={[s.chipText, active && s.chipTextActive]}>{sk}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Preferred Skills Picker */}
            <View style={s.field}>
              <Text style={s.label}>Preferred Skills (Bonus)</Text>
              <View style={s.chipsRow}>
                {COMMON_SKILLS.map((sk) => {
                  const active = selectedPrefSkills.includes(sk);
                  return (
                    <Pressable
                      key={sk}
                      style={[s.chip, active && s.chipPrefActive]}
                      onPress={() => togglePrefSkill(sk)}
                    >
                      <Text style={[s.chipText, active && s.chipTextActive]}>{sk}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Available Slots</Text>
              <TextInput
                style={s.input}
                placeholder="1"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={availableSlots}
                onChangeText={setAvailableSlots}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Expectations & Commitment</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 8-10 hours weekly, participate in daily standups"
                placeholderTextColor={colors.textFaint}
                value={expectations}
                onChangeText={setExpectations}
              />
            </View>

            <View style={s.formActions}>
              <Button
                title="Cancel"
                variant="secondary"
                small
                onPress={() => setShowAddForm(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Publish Role"
                icon="checkmark"
                loading={saving}
                small
                onPress={handleCreateRole}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        )}

        {/* Existing Roles List */}
        {roles.length === 0 && !showAddForm ? (
          <View style={s.emptyBox}>
            <Ionicons name="briefcase-outline" size={32} color={colors.textFaint} />
            <Text style={s.emptyTitle}>No open roles defined</Text>
            <Text style={s.emptySub}>
              Create open roles to allow prospective students to apply with verified skill badges.
            </Text>
          </View>
        ) : (
          roles.map((r) => (
            <View key={r._id} style={s.roleRow}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={s.roleName}>{r.roleName}</Text>
                  <Badge
                    label={r.status === "open" ? `${r.availableSlots - r.filledSlots} slots` : "Closed"}
                    color={r.status === "open" ? colors.accent : colors.textMuted}
                  />
                </View>
                {!!r.roleDescription && (
                  <Text style={s.roleDesc} numberOfLines={1}>{r.roleDescription}</Text>
                )}
                {r.requiredSkills?.length > 0 && (
                  <Text style={s.skillsSummary} numberOfLines={1}>
                    Required: {r.requiredSkills.join(", ")}
                  </Text>
                )}
              </View>

              <Pressable
                style={s.deleteRoleBtn}
                disabled={deletingId === r._id}
                onPress={() => handleDeleteRole(r._id)}
                hitSlop={8}
              >
                {deletingId === r._id ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                )}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </ModalSheet>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  formCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + "44",
    padding: spacing.md,
    gap: spacing.sm,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 13,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipReqActive: {
    backgroundColor: colors.success + "22",
    borderColor: colors.success,
  },
  chipPrefActive: {
    backgroundColor: colors.accent + "22",
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  emptySub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  roleName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  roleDesc: {
    fontSize: 12,
    color: colors.textMuted,
  },
  skillsSummary: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
  deleteRoleBtn: {
    padding: 6,
    borderRadius: radius.sm,
  },
});
