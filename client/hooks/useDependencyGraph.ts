import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export type GraphNode = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: number;
  estimatedHours: number;
  dependencies: string[];
};

export type GraphEdge = { from: string; to: string };

export type DfsResult = {
  order: string[];
  timestamps: Record<string, { disc: number; fin: number }>;
};

export type BfsResult = {
  order: string[];
  levels: Record<string, number>;
};

export type TopoResult = {
  order: string[];
  hasCycle: boolean;
};

export type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  dfsResult: DfsResult;
  bfsResult: BfsResult;
  topoResult: TopoResult;
};

const EMPTY_GRAPH: DependencyGraph = {
  nodes: [],
  edges: [],
  dfsResult:  { order: [], timestamps: {} },
  bfsResult:  { order: [], levels: {} },
  topoResult: { order: [], hasCycle: false },
};

export function useDependencyGraph(teamId: string | null) {
  const { token } = useAuth();
  const [graph,   setGraph]   = useState<DependencyGraph>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!teamId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/dependency-graph`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DependencyGraph = await res.json();
      setGraph(data);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [teamId, token]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { graph, loading, error, refetch: fetch_ };
}
