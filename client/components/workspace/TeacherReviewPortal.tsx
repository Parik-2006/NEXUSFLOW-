/**
 * client/components/workspace/TeacherReviewPortal.tsx
 * ============================================================================
 * NEXUSFLOW V4 — TEACHER REVIEW & FACULTY PORTAL (Prompt 13)
 *
 * Dedicated academic portal for faculty reviews, comment threads, student responses,
 * and private notes.
 *
 * PRIVACY INVARIANT:
 *   Private notes are strictly isolated and never visible to students.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface TeacherReviewPortalProps {
  projectId: string;
  token: string;
  apiBase: string;
  isFaculty?: boolean;
}

interface ReviewComment {
  _id: string;
  authorName: string;
  authorRole: string;
  text: string;
  isPrivateNote?: boolean;
  createdAt: string;
}

interface TeacherReviewItem {
  _id: string;
  targetType: string;
  targetTitle: string;
  teacherName: string;
  status: "OPEN" | "IN_REVIEW" | "FEEDBACK" | "STUDENT_RESPONSE" | "RESOLVED";
  comments: ReviewComment[];
  createdAt: string;
}

export default function TeacherReviewPortal({
  projectId,
  token,
  apiBase,
  isFaculty = false,
}: TeacherReviewPortalProps) {
  const [reviews, setReviews] = useState<TeacherReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New review form
  const [targetType, setTargetType] = useState("deliverable");
  const [targetTitle, setTargetTitle] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/teacher-reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      setReviews(json.reviews || []);
    } catch (err: any) {
      setError(err.message || "Failed to load faculty reviews");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiBase]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleCreateReview = async () => {
    if (!targetTitle || !commentText) return;
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/teacher-reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType,
          targetTitle,
          initialComment: commentText,
          isPrivateNote: isPrivate,
        }),
      });
      if (res.ok) {
        setTargetTitle("");
        setCommentText("");
        setIsPrivate(false);
        fetchReviews();
      }
    } catch (err: any) {
      setError(err.message || "Failed to create review");
    }
  };

  const handleAddComment = async (reviewId: string) => {
    if (!replyText) return;
    try {
      const res = await fetch(`${apiBase}/api/projects/${projectId}/teacher-reviews/${reviewId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: replyText,
          isPrivateNote: isFaculty && isPrivate,
        }),
      });
      if (res.ok) {
        setReplyText("");
        fetchReviews();
      }
    } catch (err: any) {
      setError(err.message || "Failed to add comment");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Faculty Review Portal</Text>
          <Text style={styles.subtitle}>
            Role: {isFaculty ? "Faculty Evaluator" : "Student View"} • Reviews: {reviews.length}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchReviews}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Teacher Action Form */}
      {isFaculty && (
        <View style={styles.createCard}>
          <Text style={styles.cardTitle}>Open New Faculty Review</Text>
          <TextInput
            style={styles.input}
            placeholder="Target deliverable / milestone / task title"
            placeholderTextColor="#64748b"
            value={targetTitle}
            onChangeText={setTargetTitle}
          />
          <TextInput
            style={[styles.input, { height: 60 }]}
            placeholder="Feedback / review notes"
            placeholderTextColor="#64748b"
            multiline
            value={commentText}
            onChangeText={setCommentText}
          />
          <View style={styles.checkboxRow}>
            <TouchableOpacity onPress={() => setIsPrivate(!isPrivate)} style={styles.checkboxBtn}>
              <Text style={styles.checkboxText}>{isPrivate ? "☑ Private Faculty Note" : "☐ Public Feedback"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={handleCreateReview}>
            <Text style={styles.submitBtnText}>Submit Review</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 24 }} />}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {/* Review Thread List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Review Records</Text>
        {reviews.length === 0 ? (
          <Text style={styles.mutedText}>No formal faculty reviews opened yet.</Text>
        ) : (
          reviews.map(r => (
            <View key={r._id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View>
                  <Text style={styles.reviewTarget}>{r.targetTitle}</Text>
                  <Text style={styles.reviewMeta}>
                    Type: {r.targetType.toUpperCase()} • Reviewer: {r.teacherName}
                  </Text>
                </View>
                <View style={[styles.statusBadge, getStatusStyle(r.status)]}>
                  <Text style={styles.statusText}>{r.status}</Text>
                </View>
              </View>

              {/* Comments */}
              <View style={styles.commentsList}>
                {r.comments.map(c => (
                  <View
                    key={c._id}
                    style={[styles.commentBubble, c.isPrivateNote ? styles.privateBubble : styles.publicBubble]}
                  >
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{c.authorName} ({c.authorRole})</Text>
                      {c.isPrivateNote && <Text style={styles.privateBadge}>🔒 PRIVATE NOTE</Text>}
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                ))}
              </View>

              {/* Reply Box */}
              <View style={styles.replyRow}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Reply to review..."
                  placeholderTextColor="#64748b"
                  value={selectedReviewId === r._id ? replyText : ""}
                  onFocus={() => setSelectedReviewId(r._id)}
                  onChangeText={setReplyText}
                />
                <TouchableOpacity
                  style={styles.replyBtn}
                  onPress={() => handleAddComment(r._id)}
                >
                  <Text style={styles.replyBtnText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function getStatusStyle(status: string) {
  if (status === "RESOLVED") return { backgroundColor: "#065f46" };
  if (status === "FEEDBACK") return { backgroundColor: "#92400e" };
  if (status === "STUDENT_RESPONSE") return { backgroundColor: "#1e3a8a" };
  return { backgroundColor: "#334155" };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  refreshBtn: { backgroundColor: "#334155", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  refreshBtnText: { color: "#e2e8f0", fontSize: 12 },
  createCard: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#334155" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#f8fafc", marginBottom: 12 },
  input: { backgroundColor: "#0f172a", color: "#f8fafc", padding: 10, borderRadius: 6, marginBottom: 10, fontSize: 13, borderWidth: 1, borderColor: "#334155" },
  checkboxRow: { marginBottom: 12 },
  checkboxBtn: { paddingVertical: 4 },
  checkboxText: { color: "#f59e0b", fontSize: 13, fontWeight: "600" },
  submitBtn: { backgroundColor: "#6366f1", padding: 10, borderRadius: 6, alignItems: "center" },
  submitBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  section: { backgroundColor: "#1e293b", padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#334155" },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#f1f5f9", marginBottom: 12 },
  mutedText: { color: "#64748b", fontSize: 13 },
  errorText: { color: "#ef4444", marginBottom: 12 },
  reviewCard: { backgroundColor: "#0f172a", padding: 14, borderRadius: 6, marginBottom: 16, borderWidth: 1, borderColor: "#334155" },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  reviewTarget: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
  reviewMeta: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  commentsList: { marginVertical: 8 },
  commentBubble: { padding: 10, borderRadius: 6, marginBottom: 8 },
  publicBubble: { backgroundColor: "#1e293b" },
  privateBubble: { backgroundColor: "#451a03", borderWidth: 1, borderColor: "#b45309" },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  commentAuthor: { color: "#94a3b8", fontSize: 11, fontWeight: "600" },
  privateBadge: { color: "#fbbf24", fontSize: 10, fontWeight: "800" },
  commentText: { color: "#e2e8f0", fontSize: 13 },
  replyRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  replyInput: { flex: 1, backgroundColor: "#1e293b", color: "#f8fafc", padding: 8, borderRadius: 6, fontSize: 12 },
  replyBtn: { backgroundColor: "#3b82f6", paddingHorizontal: 14, justifyContent: "center", borderRadius: 6 },
  replyBtnText: { color: "#fff", fontWeight: "600", fontSize: 12 },
});
