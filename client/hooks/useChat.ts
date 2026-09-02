/**
 * useChat.ts — Chat state hook for NEXUSFLOW global + team chat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/services/socket";
import { API_BASE_URL } from "@/utils/api";

const API = API_BASE_URL;
const PAGE_SIZE = 50;

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

export interface UseChatResult {
  messages: ChatMessage[];
  loading: boolean;
  sendMessage: (text: string, teamId?: string) => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChat(teamId?: string): UseChatResult {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const beforeRef = useRef<string | null>(null);

  const isTeam = Boolean(teamId);
  const endpoint = isTeam ? `/api/chat/team/${teamId}` : "/api/chat/global";

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const url = beforeRef.current
        ? `${API}${endpoint}?before=${encodeURIComponent(beforeRef.current)}&limit=${PAGE_SIZE}`
        : `${API}${endpoint}?limit=${PAGE_SIZE}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        if (beforeRef.current) {
          setMessages((prev) => [...prev, ...arr]);
        } else {
          setMessages(arr);
        }
        beforeRef.current = arr.length > 0 ? arr[0]._id : null;
      }
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, [token, endpoint]);

  useEffect(() => {
    if (!token) return;
    setMessages([]);
    beforeRef.current = null;
    refresh();
  }, [token, teamId]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onGlobal = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    const onTeam = (msg: ChatMessage) => {
      if (teamId && msg.teamId === teamId) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on("chat:global:new", onGlobal);
    socket.on("chat:team:new", onTeam);
    socket.on("reconnect", refresh);

    if (teamId) {
      socket.emit("chat:join_team", { teamId });
    }

    return () => {
      if (teamId) {
        socket.emit("chat:leave_team", { teamId });
      }
      socket.off("chat:global:new", onGlobal);
      socket.off("chat:team:new", onTeam);
      socket.off("reconnect", refresh);
    };
  }, [token, teamId, refresh]);

  const sendMessage = useCallback(async (text: string) => {
    if (!token || !text.trim()) return;
    const body = isTeam
      ? { teamId, message: text.trim() }
      : { message: text.trim() };
    const endpoint = isTeam ? `/api/chat/team/${teamId}` : "/api/chat/global";
    await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }, [token, teamId]);

  const editMessage = useCallback(async (messageId: string, text: string) => {
    if (!token) return;
    await fetch(`${API}/api/chat/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text.trim() }),
    });
    setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, message: text.trim(), editedAt: new Date().toISOString() } : m));
  }, [token]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    await fetch(`${API}/api/chat/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m));
  }, [token]);

  return { messages, loading, sendMessage, editMessage, deleteMessage, refresh };
}
