/**
 * DiscoverTeamsModal.tsx — V4 Open Team Discovery & Public Workspaces
 *
 * Allows students to browse, search, and filter discoverable workspaces
 * looking for teammates and collaborators.
 *
 * Privacy Guarantees:
 * - Only discoverable teams appear.
 * - Private member data, internal chat, documents, and emails are never displayed.
 * - Discoverability != Membership (Students must apply for open roles).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalSheet, useToast } from "@/components/feedback";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import { colors, radius, spacing, font } from "@/theme";
import TeamPublicProfileModal from "./TeamPublicProfileModal";

export interface DiscoverableRole {
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

export interface DiscoverableTeam {
  _id: string;
  name: string;
  logo?: string;
  projectTitle: string;
  projectDescription: string;
  discoverySettings?: {
    domain?: string;
    methodology?: string;
    projectStage?: string;
    academicCategory?: string;
    difficulty?: string;
    expectations?: string;
    generalInfo?: string;
  };
  openRoles: DiscoverableRole[];
  memberCount: number;
  taskCount: number;
  doneCount: number;
  createdAt: string;
}

interface DiscoverTeamsModalProps {
  visible: boolean;
  onClose: () => void;
  onApplicationSubmitted?: () => void;
}

const DOMAINS = ["All", "Web Development", "AI/ML", "Mobile Apps", "FinTech", "Cybersecurity", "HealthTech"];
const METHODOLOGIES = ["All", "Agile/Scrum", "Kanban", "Waterfall"];
const CATEGORIES = ["All", "Capstone", "Hackathon", "Course Project", "Research", "Independent"];

export default function DiscoverTeamsModal({
  visible,
  onClose,
  onApplicationSubmitted,
}: DiscoverTeamsModalProps) {
  const { token } = useAuth();
  const toast = useToast();

  const [teams, setTeams] = useState<DiscoverableTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("All");
  const [selectedMethodology, setSelectedMethodology] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [onlyWithOpenRoles, setOnlyWithOpenRoles] = useState(true);

  // Detail modal state
  const [selectedTeam, setSelectedTeam] = useState<DiscoverableTeam | null>(null);

  const fetchDiscoverableTeams = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (selectedDomain !== "All") params.append("domain", selectedDomain);
      if (selectedMethodology !== "All") params.append("methodology", selectedMethodology);
      if (selectedCategory !== "All") params.append("academicCategory", selectedCategory);
      if (onlyWithOpenRoles) params.append("hasOpenRoles", "true");

      const res = await fetch(`${API_BASE_URL}/api/discovery/teams?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load open teams.");
      setTeams(data.teams || []);
    } catch (err: any) {
      console.warn("[DiscoverTeamsModal] Error fetching teams:", err.message);
      toast(err.message || "Failed to load discoverable teams", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [visible, search, selectedDomain, selectedMethodology, selectedCategory, onlyWithOpenRoles, token]);

  useEffect(() => {
    fetchDiscoverableTeams();
  }, [fetchDiscoverableTeams]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDiscoverableTeams();
  };

  return (
    <>
      <ModalSheet visible={visible} onClose={onClose} title="Explore Open Teams">
        {/* Search Bar */}
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search projects, skills, or roles…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {/* Domain Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {DOMAINS.map((d) => {
            const active = selectedDomain === d;
            return (
              <Pressable
                key={d}
                style={[s.filterChip, active && s.filterChipActive]}
                onPress={() => setSelectedDomain(d)}
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{d}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sub-Filters: Open Roles Toggle & Category Filter */}
        <View style={s.secondaryFilterRow}>
          <Pressable
            style={[s.toggleBtn, onlyWithOpenRoles && s.toggleBtnActive]}
            onPress={() => setOnlyWithOpenRoles(!onlyWithOpenRoles)}
          >
            <Ionicons
              name={onlyWithOpenRoles ? "checkmark-circle" : "ellipse-outline"}
              size={15}
              color={onlyWithOpenRoles ? colors.primary : colors.textMuted}
            />
            <Text style={[s.toggleBtnText, onlyWithOpenRoles && s.toggleBtnTextActive]}>
              Has Open Roles
            </Text>
          </Pressable>

          {/* Category Quick Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CATEGORIES.filter((c) => c !== "All").map((cat) => {
              const active = selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  style={[s.subChip, active && s.subChipActive]}
                  onPress={() => setSelectedCategory(active ? "All" : cat)}
                >
                  <Text style={[s.subChipText, active && s.subChipTextActive]}>{cat}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Teams List */}
        {loading && !refreshing ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 10, color: colors.textMuted, fontSize: 13 }}>
              Finding open teams…
            </Text>
          </View>
        ) : teams.length === 0 ? (
          <EmptyState
            icon="compass-outline"
            title="No discoverable teams found"
            message="Try adjusting your search query or filters. Teams must be made discoverable by their leaders."
          />
        ) : (
          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {teams.map((team) => {
              const openRolesCount = (team.openRoles || []).length;
              return (
                <Pressable
                  key={team._id}
                  style={({ pressed }: any) => [s.teamCard, pressed && { opacity: 0.9 }]}
                  onPress={() => setSelectedTeam(team)}
                >
                  <View style={s.cardHeader}>
                    <Avatar name={team.name} size={42} image={team.logo} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.teamName} numberOfLines={1}>{team.name}</Text>
                      {!!team.projectTitle && (
                        <Text style={s.projectTitle} numberOfLines={1}>{team.projectTitle}</Text>
                      )}
                    </View>
                    <View style={s.memberBadge}>
                      <Ionicons name="people" size={13} color={colors.primary} />
                      <Text style={s.memberBadgeText}>{team.memberCount} members</Text>
                    </View>
                  </View>

                  {/* Project Brief */}
                  {!!team.projectDescription && (
                    <Text style={s.projectDesc} numberOfLines={2}>
                      {team.projectDescription}
                    </Text>
                  )}

                  {/* Metadata Tags */}
                  <View style={s.tagRow}>
                    {!!team.discoverySettings?.domain && (
                      <View style={s.tag}>
                        <Text style={s.tagText}>{team.discoverySettings.domain}</Text>
                      </View>
                    )}
                    {!!team.discoverySettings?.methodology && (
                      <View style={s.tag}>
                        <Text style={s.tagText}>{team.discoverySettings.methodology}</Text>
                      </View>
                    )}
                    {!!team.discoverySettings?.academicCategory && (
                      <View style={s.tag}>
                        <Text style={s.tagText}>{team.discoverySettings.academicCategory}</Text>
                      </View>
                    )}
                  </View>

                  {/* Open Roles Section */}
                  {openRolesCount > 0 ? (
                    <View style={s.rolesContainer}>
                      <Text style={s.rolesTitle}>
                        OPEN ROLES ({openRolesCount}):
                      </Text>
                      <View style={s.roleChipsWrap}>
                        {team.openRoles.slice(0, 3).map((r) => (
                          <View key={r._id} style={s.roleChip}>
                            <Ionicons name="briefcase-outline" size={12} color={colors.accent} />
                            <Text style={s.roleChipText} numberOfLines={1}>
                              {r.roleName}
                            </Text>
                            <Text style={s.roleSlotsText}>
                              ({r.availableSlots - r.filledSlots} left)
                            </Text>
                          </View>
                        ))}
                        {openRolesCount > 3 && (
                          <View style={s.moreRolesBadge}>
                            <Text style={s.moreRolesText}>+{openRolesCount - 3} more</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : (
                    <Text style={s.noRolesText}>No active open roles at this time.</Text>
                  )}

                  {/* Action Bar */}
                  <View style={s.cardFooter}>
                    <Text style={s.viewDetailsLink}>View Details & Apply</Text>
                    <Ionicons name="arrow-forward" size={15} color={colors.primary} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </ModalSheet>

      {/* Team Public Profile Detail Modal */}
      {selectedTeam && (
        <TeamPublicProfileModal
          visible={!!selectedTeam}
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
          onApplicationSubmitted={() => {
            setSelectedTeam(null);
            onApplicationSubmitted?.();
          }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  secondaryFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  toggleBtnTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  subChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subChipActive: {
    backgroundColor: colors.accent + "22",
    borderColor: colors.accent,
  },
  subChipText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  subChipTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  teamCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  teamName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  projectTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 1,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  projectDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  rolesContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 6,
  },
  rolesTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 0.6,
  },
  roleChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent + "18",
    borderWidth: 1,
    borderColor: colors.accent + "44",
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    maxWidth: 120,
  },
  roleSlotsText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  moreRolesBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  moreRolesText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  noRolesText: {
    fontSize: 11,
    fontStyle: "italic",
    color: colors.textFaint,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  viewDetailsLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
});
