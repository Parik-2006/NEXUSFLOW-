/**
 * useRecommendation.ts
 * ====================
 * React hook that drives the DAA Intelligent Task Recommendation panel.
 *
 * Emits `recommend:request` over the existing Socket.io connection and
 * listens for `recommend:result` / `recommend:error`.
 *
 * Also exposes `search(query)` which runs Boyer-Moore-Horspool on the
 * server and returns matched tasks via `task:searchResult`.
 *
 * No new dependencies — reuses the existing getSocket() service.
 */

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/context/AuthContext";

// ── Types ────────────────────────────────────────────────────────────────────

export type RecommendedTask = {
  taskId    : string;
  title     : string;
  status    : "todo" | "in_progress" | "done";
  priority  : number;
  effort    : number;
  value     : number;
  topoOrder : number | null;
  ratio     : number;
  reason    : string;
};

export type SprintStats = {
  capacity      : number;
  effortUsed    : number;
  capacityLeft  : number;
  totalValue    : number;
  utilizationPct: number;
  taskCount     : number;
  candidateCount: number;
};

export type AlgorithmMeta = {
  name        : string;
  description : string;
  inputStats  : string;
  outputStats : string;
  complexity  : { time: string; space: string };
};

export type RecommendationResult = {
  recommendedTasks  : RecommendedTask[];
  sprintStats       : SprintStats;
  algorithmSummary  : Record<string, AlgorithmMeta>;
  hasCycle          : boolean;
  generatedAt       : string;
};

export type SearchResult = {
  tasks        : any[];
  query        : string;
  algorithm    : string;
  complexity   : { time: string; space: string };
  totalScanned : number;
  matchCount   : number;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRecommendation(teamId: string) {
  const { token } = useAuth();

  const [result,          setResult]         = useState<RecommendationResult | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [searchResult,    setSearchResult]    = useState<SearchResult | null>(null);
  const [searchLoading,   setSearchLoading]   = useState(false);

  // Subscribe to server-push events once on mount.
  useEffect(() => {
    const socket = getSocket(token);

    const onResult = (data: RecommendationResult) => {
      setResult(data);
      setLoading(false);
      setError(null);
    };

    const onError = ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    };

    const onSearch = (data: SearchResult) => {
      setSearchResult(data);
      setSearchLoading(false);
    };

    socket.on("recommend:result", onResult);
    socket.on("recommend:error",  onError);
    socket.on("task:searchResult", onSearch);

    return () => {
      socket.off("recommend:result", onResult);
      socket.off("recommend:error",  onError);
      socket.off("task:searchResult", onSearch);
    };
  }, [token]);

  /**
   * Trigger the full DAA recommendation pipeline.
   * @param sprintCapacity  Story-point budget for the sprint (default 20).
   */
  const requestRecommendation = useCallback(
    (sprintCapacity = 20) => {
      const socket = getSocket(token);
      setLoading(true);
      setError(null);
      socket.emit("recommend:request", { teamId, sprintCapacity });
    },
    [teamId, token]
  );

  /**
   * Boyer-Moore-Horspool title search.
   * @param query  Search pattern string.
   */
  const search = useCallback(
    (query: string) => {
      const socket = getSocket(token);
      setSearchLoading(true);
      socket.emit("task:search", { teamId, query });
    },
    [teamId, token]
  );

  return {
    result,
    loading,
    error,
    requestRecommendation,
    searchResult,
    searchLoading,
    search,
  };
}
