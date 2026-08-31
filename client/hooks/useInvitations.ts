/**
 * useInvitations.ts — Shared invitation state hook for NEXUSFLOW.
 *
 * Polls GET /api/invitations every 15 seconds.
 * Provides accept / reject actions.
 *
 * Used by:
 *   - NotificationCenter (bell badge + invitation cards)
 *   - JoinTeamModal (Join Team → pending invitations)
 *
 * Both surfaces operate on the SAME Invitation documents.
 * No duplicate invitation records are created.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";

import { getSocket } from "@/services/socket";

const API = API_BASE_URL;
const POLL_INTERVAL_MS = 15_000;

export interface PendingInvitation {
  _id: string;
  teamId: string;
  teamName: string;
  inviterName: string;
  inviterEmail?: string;
  invitedEmail: string;
  status: "pending" | "accepted" | "rejected" | "canceled";
  createdAt: string;
  // Optional team metadata populated by accept flow
  role?: string;
}

export interface UseInvitationsResult {
  invitations: PendingInvitation[];
  pendingCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<{ success?: boolean; teamId?: string; message?: string; error?: string }>;
  rejectInvitation: (invitationId: string) => Promise<{ success?: boolean; message?: string; error?: string }>;
}

export function useInvitations(): UseInvitationsResult {
  const { token } = useAuth();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations(Array.isArray(data) ? data : []);
      } else {
        // Gracefully handle non-200 (e.g., 401 during logout) without crashing
        setInvitations([]);
      }
    } catch {
      // Network error — keep existing state, don't clear
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refresh();
  }, [token, refresh]);

  // Polling fallback every 15s + Real-time socket events
  useEffect(() => {
    if (!token) return;
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);

    const socket = getSocket(token);
    const onInvReceived = () => { refresh(); };
    const onInvUpdated = () => { refresh(); };

    socket.on("invitation:received", onInvReceived);
    socket.on("invitation:updated", onInvUpdated);
    socket.on("reconnect", refresh);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      socket.off("invitation:received", onInvReceived);
      socket.off("invitation:updated", onInvUpdated);
      socket.off("reconnect", refresh);
    };
  }, [token, refresh]);

  const acceptInvitation = useCallback(
    async (invitationId: string): Promise<{ success?: boolean; teamId?: string; message?: string; error?: string }> => {
      if (!token) return { error: "Not authenticated" };
      try {
        const res = await fetch(`${API}/api/invitations/${invitationId}/accept`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed to accept invitation" };

        // Optimistically remove from pending list
        setInvitations((prev) => prev.filter((inv) => inv._id !== invitationId));
        return { success: true, teamId: data.teamId, message: data.message };
      } catch (e: any) {
        return { error: e.message || "Failed to accept invitation" };
      }
    },
    [token]
  );

  const rejectInvitation = useCallback(
    async (invitationId: string): Promise<{ success?: boolean; message?: string; error?: string }> => {
      if (!token) return { error: "Not authenticated" };
      try {
        const res = await fetch(`${API}/api/invitations/${invitationId}/reject`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed to reject invitation" };

        // Optimistically remove from pending list
        setInvitations((prev) => prev.filter((inv) => inv._id !== invitationId));
        return { success: true, message: data.message };
      } catch (e: any) {
        return { error: e.message || "Failed to reject invitation" };
      }
    },
    [token]
  );

  return {
    invitations,
    pendingCount: invitations.length,
    loading,
    refresh,
    acceptInvitation,
    rejectInvitation,
  };
}
