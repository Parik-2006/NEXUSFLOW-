/**
 * client/components/workspace/CopilotAttachmentBar.tsx
 * ============================================================================
 * NEXUSFLOW V4 — COPILOT ATTACHMENT & TEMPORARY CONTEXT BAR (Workstream 16)
 *
 * Visualizes ephemeral session attachments and enforces the strict invariant:
 * Attachment -> Temporary Context (NOT automatic persistent memory).
 * Allows users to explicitly promote an attachment to Project Memory.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";

interface TemporaryContextItem {
  _id: string;
  sourceIdentifier: string;
  fileType: string;
  fileSize: number;
  processingState: "processing" | "ready" | "failed" | "unsupported";
  isPromotedToMemory: boolean;
  createdAt: string;
  errorMessage?: string;
}

interface CopilotAttachmentBarProps {
  projectId: string;
  token: string;
  apiBase: string;
  onSelectAttachment?: (attachment: TemporaryContextItem) => void;
}

export default function CopilotAttachmentBar({
  projectId,
  token,
  apiBase,
  onSelectAttachment,
}: CopilotAttachmentBarProps) {
  const [contexts, setContexts] = useState<TemporaryContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const fetchContexts = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/projects/${projectId}/temporary-contexts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setContexts(json.contexts || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  const handlePromoteToMemory = async (item: TemporaryContextItem) => {
    try {
      setPromotingId(item._id);
      const res = await fetch(
        `${apiBase}/api/projects/${projectId}/temporary-contexts/${item._id}/promote`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: "IMPORTANT_ARTIFACT",
            title: `Promoted: ${item.sourceIdentifier}`,
          }),
        }
      );
      if (res.ok) {
        setContexts((prev) =>
          prev.map((c) => (c._id === item._id ? { ...c, isPromotedToMemory: true } : c))
        );
      }
    } catch {
      // Error handling
    } finally {
      setPromotingId(null);
    }
  };

  const handleDeleteContext = async (contextId: string) => {
    try {
      const res = await fetch(
        `${apiBase}/api/projects/${projectId}/temporary-contexts/${contextId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        setContexts((prev) => prev.filter((c) => c._id !== contextId));
      }
    } catch {
      // Error handling
    }
  };

  if (contexts.length === 0 && !loading) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Active Temporary Context ({contexts.length})</Text>
          <View style={styles.ephemeralBadge}>
            <Text style={styles.ephemeralBadgeText}>Ephemeral • 24h TTL</Text>
          </View>
        </View>
        <Text style={styles.headerSubtext}>
          These attachments provide session context to Copilot without modifying persistent memory.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#38bdf8" style={{ marginVertical: 8 }} />
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={contexts}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const isImage = item.fileType.startsWith("image_");
            return (
              <View style={styles.attachmentCard}>
                <TouchableOpacity
                  onPress={() => onSelectAttachment && onSelectAttachment(item)}
                  style={styles.cardContent}
                >
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {isImage ? "VISION" : item.fileType.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.filename} numberOfLines={1}>
                    {item.sourceIdentifier}
                  </Text>
                  <Text style={styles.filesize}>
                    {Math.round(item.fileSize / 1024)} KB
                  </Text>
                </TouchableOpacity>

                <View style={styles.actionsRow}>
                  {item.isPromotedToMemory ? (
                    <View style={styles.savedBadge}>
                      <Text style={styles.savedBadgeText}>✓ Saved to Memory</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.promoteBtn}
                      onPress={() => handlePromoteToMemory(item)}
                      disabled={promotingId === item._id}
                    >
                      {promotingId === item._id ? (
                        <ActivityIndicator size="small" color="#0284c7" />
                      ) : (
                        <Text style={styles.promoteBtnText}>Save to Memory</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteContext(item._id)}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#090d16",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    padding: 12,
  },
  header: {
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f8fafc",
  },
  ephemeralBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  ephemeralBadgeText: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "600",
  },
  headerSubtext: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  attachmentCard: {
    backgroundColor: "#131b2e",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
    width: 170,
  },
  cardContent: {
    marginBottom: 8,
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#0369a1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#e0f2fe",
  },
  filename: {
    fontSize: 12,
    fontWeight: "600",
    color: "#f1f5f9",
  },
  filesize: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    paddingTop: 6,
  },
  promoteBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  promoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
  },
  savedBadge: {
    backgroundColor: "#064e3b",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  savedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#6ee7b7",
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "700",
  },
});
