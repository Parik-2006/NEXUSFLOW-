import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export type SortMetrics = {
  timeMs: number;
  comparisons: number;
  swaps: number;
  complexity: string;
};

export type TaskAnalytics = {
  n: number;
  bubbleSort?: SortMetrics;
  mergeSort?: SortMetrics;
  skippedBubbleSort?: boolean;
  reason?: string;
};

/**
 * useTaskAnalytics — fetches Bubble Sort vs Merge Sort execution metrics
 * for a team's task list (Task Analytics Engine).
 */
export function useTaskAnalytics(teamId: string | undefined) {
  const { token } = useAuth();
  const [analytics, setAnalytics] = useState<TaskAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!teamId) return;
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/teams/${teamId}/tasks/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnalytics(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [teamId, token]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
