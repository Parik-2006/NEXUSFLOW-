/**
 * TeamPublicProfileModal.tsx — Clean, Privacy-Safe Public Workspace Overview
 *
 * Exposes:
 * - Project description, domain, methodology, stage, category, expectations
 * - Open roles list with requirements, preferred skills, slots
 * - "Apply for Role" trigger
 *
 * Strictly Omits:
 * - Internal chat, documents, internal tasks, member emails, passwords
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet } from "@/components/feedback";
import { Avatar, Badge, Button } from "@/components/ui";
import { colors, radius, spacing, font } from "@/theme";
import type { DiscoverableTeam, DiscoverableRole } from "./DiscoverTeamsModal";
import ApplyRoleModal from "./ApplyRoleModal";

interface TeamPublicProfileModalProps {
  visible: boolean;
  team: DiscoverableTeam;
  onClose: () => void;
  onApplicationSubmitted?: () => void;
}

export default function TeamPublicProfileModal({
  visible,
  team,
  onClose,
  onApplicationSubmitted,
}: TeamPublicProfileModalProps) {
  const [selectedRole, setSelectedRole] = useState<DiscoverableRole | null>(null);

  const ds = team.discoverySettings || {};
  const openRoles = team.openRoles || [];

  return (
    <>
      <ModalSheet visible={visible} onClose={onClose} title="Public Project Profile">
        <ScrollView
          style={{ maxHeight: 560 }}
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Card */}
          <View style={s.headerCard}>
            <Avatar name={team.name} size={54} image={team.logo} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.teamName}>{team.name}</Text>
              {!!team.projectTitle && (
                <Text style={s.projectTitle}>{team.projectTitle}</Text>
              )}
              <View style={s.headerMetaRow}>
                <View style={s.metaChip}>
                  <Ionicons name="people" size={13} color={colors.primary} />
                  <Text style={s.metaChipText}>{team.memberCount} members</Text>
                </View>
                {!!ds.academicCategory && (
                  <View style={s.metaChip}>
                    <Ionicons name="school-outline" size={13} color={colors.accent} />
                    <Text style={s.metaChipText}>{ds.academicCategory}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Project Description */}
          {!!team.projectDescription && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>PROJECT BRIEF</Text>
              <Text style={s.bodyText}>{team.projectDescription}</Text>
            </View>
          )}

          {/* Project Metadata Grid */}
          <View style={s.metaGrid}>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>DOMAIN</Text>
              <Text style={s.gridValue}>{ds.domain || "General"}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>METHODOLOGY</Text>
              <Text style={s.gridValue}>{ds.methodology || "Agile/Scrum"}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>STAGE</Text>
              <Text style={s.gridValue}>{ds.projectStage || "Planning"}</Text>
            </View>
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>DIFFICULTY</Text>
              <Text style={s.gridValue}>{ds.difficulty || "Intermediate"}</Text>
            </View>
          </View>

          {/* Team Expectations */}
          {!!ds.expectations && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TEAM EXPECTATIONS</Text>
              <View style={s.infoCard}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={s.infoCardText}>{ds.expectations}</Text>
              </View>
            </View>
          )}

          {/* Open Roles & Apply Section */}
          <View style={s.section}>
            <View style={s.rolesHeader}>
              <Text style={s.sectionLabel}>AVAILABLE ROLES ({openRoles.length})</Text>
              <Badge label="Skill Verified" color={colors.accent} />
            </View>

            {openRoles.length === 0 ? (
              <View style={s.noRolesBox}>
                <Text style={s.noRolesText}>
                  This team does not currently have any open roles accepting applications.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: 4 }}>
                {openRoles.map((role) => {
                  const remaining = role.availableSlots - role.filledSlots;
                  return (
                    <View key={role._id} style={s.roleCard}>
                      <View style={s.roleCardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.roleTitle}>{role.roleName}</Text>
                          {!!role.roleDescription && (
                            <Text style={s.roleDesc}>{role.roleDescription}</Text>
                          )}
                        </View>
                        <View style={s.slotsBadge}>
                          <Text style={s.slotsBadgeText}>{remaining} slot{remaining === 1 ? "" : "s"} left</Text>
                        </View>
                      </View>

                      {/* Required Skills */}
                      {role.requiredSkills?.length > 0 && (
                        <View style={{ gap: 4 }}>
                          <Text style={s.skillGroupLabel}>REQUIRED SKILLS (QUIZ VERIFICATION):</Text>
                          <View style={s.skillTagsWrap}>
                            {role.requiredSkills.map((sk) => (
                              <View key={sk} style={s.reqSkillTag}>
                                <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                                <Text style={s.reqSkillText}>{sk}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Preferred Skills */}
                      {role.preferredSkills && role.preferredSkills.length > 0 && (
                        <View style={{ gap: 4 }}>
                          <Text style={s.skillGroupLabel}>PREFERRED SKILLS:</Text>
                          <View style={s.skillTagsWrap}>
                            {role.preferredSkills.map((sk) => (
                              <View key={sk} style={s.prefSkillTag}>
                                <Text style={s.prefSkillText}>{sk}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Role Expectations */}
                      {!!role.expectations && (
                        <Text style={s.roleExpectationsText}>
                          <Text style={{ fontWeight: "700" }}>Expectations: </Text>
                          {role.expectations}
                        </Text>
                      )}

                      {/* Apply Button */}
                      <Button
                        title="Apply for this Role"
                        icon="paper-plane-outline"
                        onPress={() => setSelectedRole(role)}
                        style={{ marginTop: spacing.xs }}
                        small
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </ModalSheet>

      {/* Role Application Modal */}
      {selectedRole && (
        <ApplyRoleModal
          visible={!!selectedRole}
          team={team}
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
          onSuccess={() => {
            setSelectedRole(null);
            onClose();
            onApplicationSubmitted?.();
          }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  teamName: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 2,
  },
  headerMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  bodyText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridItem: {
    width: "48%",
    gap: 2,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  infoCardText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  rolesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noRolesBox: {
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: "center",
  },
  noRolesText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
  roleCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + "33",
    padding: spacing.md,
    gap: spacing.sm,
  },
  roleCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  roleDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  slotsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent + "1a",
    borderWidth: 1,
    borderColor: colors.accent + "55",
  },
  slotsBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
  },
  skillGroupLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  skillTagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  reqSkillTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.success + "15",
    borderWidth: 1,
    borderColor: colors.success + "44",
  },
  reqSkillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  prefSkillTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prefSkillText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  roleExpectationsText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
