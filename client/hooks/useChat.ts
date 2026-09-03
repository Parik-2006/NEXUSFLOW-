/**
 * useChat.ts — State and Realtime Socket Hook for NEXUSFLOW Global & Team Chat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/services/socket";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;
const PAGE_SIZE = 60;

export interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  teamId?: string;
  message: string;
  type: "global" | "team";
  replyTo?: string;
  editedAt?: string;
  deletedAt?: string;
  status: string;
  createdAt: string;
}

export interface UnreadCounts {
  global: number;
  teams: Record<string, number>;
  total: number;
}

export interface UseChatResult {
  activeScope: string; // "global" | teamId
  setActiveScope: (scope: string) => void;
  messages: ChatMessage[];
  loading: boolean;
  unreadCounts: UnreadCounts;
  sendMessage: (text: string, scopeOverride?: string) => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markAsRead: (scope: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChat(initialScope: string = "global"): UseChatResult {
  const { token, user } = useAuth();
  const [activeScope, setActiveScope] = useState<string>(initialScope || "global");
  const [messagesByScope, setMessagesByScope] = useState<Record<string, ChatMessage[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({
    global: 0,
    teams: {},
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const currentUserId = (user?._id || user?.id)?.toString();
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;

  const isTeam = activeScope !== "global";
  const currentMessages = messagesByScope[activeScope] || [];

  // ── 1. Fetch unread counts ─────────────────────────────────────────────────
  const fetchUnreadCounts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/chat/unread`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts({
          global: data.global || 0,
          teams: data.teams || {},
          total: data.total || 0,
        });
      }
    } catch {}
  }, [token]);

  // ── 2. Mark conversation as read ──────────────────────────────────────────
  const markAsRead = useCallback(
    async (scope: string) => {
      if (!token || !scope) return;
      try {
        await fetch(`${API}/api/chat/read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ scope }),
        });

        // Optimistically zero out unread count for this scope
        setUnreadCounts((prev) => {
          if (scope === "global") {
            const diff = prev.global;
            return {
              ...prev,
              global: 0,
              total: Math.max(0, prev.total - diff),
            };
          } else {
            const diff = prev.teams[scope] || 0;
            const updatedTeams = { ...prev.teams, [scope]: 0 };
            return {
              ...prev,
              teams: updatedTeams,
              total: Math.max(0, prev.total - diff),
            };
          }
        });
      } catch {}
    },
    [token]
  );

  // ── 3. Fetch conversation messages ────────────────────────────────────────
  const fetchMessagesForScope = useCallback(
    async (scope: string, isSilent = false) => {
      if (!token || !scope) return;
      if (!isSilent) setLoading(true);
      try {
        const isTeamScope = scope !== "global";
        const endpoint = isTeamScope ? `/api/chat/team/${scope}` : "/api/chat/global";
        const res = await fetch(`${API}${endpoint}?limit=${PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const arr: ChatMessage[] = Array.isArray(data) ? data : [];
          setMessagesByScope((prev) => ({
            ...prev,
            [scope]: arr,
          }));
        }
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Refresh current scope
  const refresh = useCallback(async () => {
    await Promise.all([
      fetchMessagesForScope(activeScopeRef.current),
      fetchUnreadCounts(),
    ]);
  }, [fetchMessagesForScope, fetchUnreadCounts]);

  // ── 4. Scope Change Effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    // If not loaded yet, fetch
    if (!messagesByScope[activeScope]) {
      fetchMessagesForScope(activeScope);
    }
    // Mark as read immediately upon switching
    markAsRead(activeScope);
  }, [token, activeScope, fetchMessagesForScope, markAsRead, messagesByScope]);

  // Initial unread fetch
  useEffect(() => {
    if (token) {
      fetchUnreadCounts();
    }
  }, [token, fetchUnreadCounts]);

  // ── 5. Socket.IO Realtime Listeners ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    const onGlobalMsg = (msg: ChatMessage) => {
      setMessagesByScope((prev) => {
        const existing = prev["global"] || [];
        if (existing.some((m) => m._id === msg._id)) return prev;
        return { ...prev, global: [...existing, msg] };
      });

      const currentActive = activeScopeRef.current;
      const isFromMe = msg.senderId === currentUserId;

      if (currentActive === "global") {
        if (!isFromMe) markAsRead("global");
      } else if (!isFromMe) {
        setUnreadCounts((prev) => ({
          ...prev,
          global: prev.global + 1,
          total: prev.total + 1,
        }));
      }
    };

    const onTeamMsg = (msg: ChatMessage) => {
      const tid = msg.teamId;
      if (!tid) return;

      setMessagesByScope((prev) => {
        const existing = prev[tid] || [];
        if (existing.some((m) => m._id === msg._id)) return prev;
        return { ...prev, [tid]: [...existing, msg] };
      });

      const currentActive = activeScopeRef.current;
      const isFromMe = msg.senderId === currentUserId;

      if (currentActive === tid) {
        if (!isFromMe) markAsRead(tid);
      } else if (!isFromMe) {
        setUnreadCounts((prev) => ({
          ...prev,
          teams: { ...prev.teams, [tid]: (prev.teams[tid] || 0) + 1 },
          total: prev.total + 1,
        }));
      }
    };

    socket.on("chat:global:new", onGlobalMsg);
    socket.on("chat:team:new", onTeamMsg);
    socket.on("reconnect", refresh);

    return () => {
      socket.off("chat:global:new", onGlobalMsg);
      socket.off("chat:team:new", onTeamMsg);
      socket.off("reconnect", refresh);
    };
  }, [token, currentUserId, markAsRead, refresh]);

  // ── 6. Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, scopeOverride?: string) => {
      if (!token || !text.trim()) return;
      const targetScope = scopeOverride || activeScopeRef.current;
      const isTargetTeam = targetScope !== "global";
      const body = isTargetTeam
        ? { teamId: targetScope, message: text.trim() }
        : { message: text.trim() };
      const endpoint = isTargetTeam
        ? `/api/chat/team/${targetScope}`
        : "/api/chat/global";

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send message");
      }

      const createdMsg: ChatMessage = await res.json();
      setMessagesByScope((prev) => {
        const existing = prev[targetScope] || [];
        if (existing.some((m) => m._id === createdMsg._id)) return prev;
        return { ...prev, [targetScope]: [...existing, createdMsg] };
      });
    },
    [token]
  );

  // ── 7. Edit message ────────────────────────────────────────────────────────
  const editMessage = useCallback(
    async (messageId: string, text: string) => {
      if (!token || !text.trim()) return;
      const res = await fetch(`${API}/api/chat/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessagesByScope((prev) => {
          const targetScope = activeScopeRef.current;
          const existing = prev[targetScope] || [];
          return {
            ...prev,
            [targetScope]: existing.map((m) =>
              m._id === messageId ? { ...m, message: updated.message, editedAt: updated.editedAt } : m
            ),
          };
        });
      }
    },
    [token]
  );

  // ── 8. Delete message ──────────────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!token) return;
      const res = await fetch(`${API}/api/chat/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessagesByScope((prev) => {
          const targetScope = activeScopeRef.current;
          const existing = prev[targetScope] || [];
          return {
            ...prev,
            [targetScope]: existing.filter((m) => m._id !== messageId),
          };
        });
      }
    },
    [token]
  );

  return {
    activeScope,
    setActiveScope,
    messages: currentMessages,
    loading: loading && currentMessages.length === 0,
    unreadCounts,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    refresh,
  };
}
