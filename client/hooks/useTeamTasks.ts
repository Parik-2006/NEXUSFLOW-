/**
 * client/hooks/useTeamTasks.ts  (DAA-enhanced)
 * ------------------------------------------------------------------------------
 * Ordering engine: Merge Sort (stable, Θ(n log n) all-cases) with a pluggable
 * comparator selected by SortMode. comparePriority reproduces the Greedy
 * Scheduler order (priorityScore DESC). Topological Sort (executionOrder/edges)
 * and Branch & Bound assignment (task:assigned) features are preserved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/context/AuthContext";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Task = {
  _id: string;
  teamId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  updatedAt?: string;
  createdAt?: string;
  // Greedy Scheduler
  urgency?: number;
  impact?: number;
  dependencyCount?: number;
  priorityScore?: number;
  rank?: number;
  // Merge Sort secondary keys
  deadline?: string;
  startDate?: string | null;
  dueDate?: string | null;
  progress?: number;
  // Topological Sort / DAG
  dependencies?: string[];
  topoOrder?: number | null;
  // Knapsack
  estimatedHours?: number | null;
  businessValue?: number | null;
  // Branch & Bound
  assignedTo?: string | null;
  assignmentCost?: number | null;
  // Provenance / display
  source?: "ai" | "manual";
  priorityLabel?: "critical" | "high" | "medium" | "low" | null;
  category?: string;
  reminderAt?: string | null;
};

export type TaskFields = Partial<
  Pick<Task, "title" | "description" | "progress" | "deadline" | "startDate" | "dueDate"
    | "priorityLabel" | "estimatedHours" | "businessValue" | "assignedTo" | "category" | "reminderAt" | "status">
>;

export type DependencyEdge = { from: string; to: string };

// ── SortMode (exported for dashboard sort-picker) ──────────────────────────────

export enum SortMode {
  PRIORITY = "priority",  // priorityScore DESC, deadline ASC (greedy order)
  DEADLINE = "deadline",  // deadline ASC, priorityScore DESC (EDF)
  PROGRESS = "progress",  // progress ASC (surfaces lagging tasks)
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                        MERGE SORT — DAA Core                            ║
// ║  T(n) = 2T(n/2) + Θ(n) → Θ(n log n) all cases. Stable. Non-mutating.   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// RUNTIME-SEPARATION NOTE (Task 5): a Merge Sort also exists on the server
// (server/algorithms/taskOptimiser.js → mergeSort) and in the analytics engine
// (server/utils/sortAlgorithms.js). They are intentionally NOT shared: this
// module is bundled into the React Native client while those run in Node, so
// there is no shared import boundary. They also sort by different keys
// (here: priorityScore/deadline/progress; server: status→priority→effort→title).

function merge<T>(arr: T[], left: number, mid: number, right: number, comparator: (a: T, b: T) => number): void {
  const tmp: T[] = arr.slice(left, right + 1);
  const splitPoint = mid - left + 1;
  let i = 0, j = splitPoint, k = left;
  while (i < splitPoint && j < tmp.length) {
    if (comparator(tmp[i], tmp[j]) <= 0) arr[k++] = tmp[i++];
    else arr[k++] = tmp[j++];
  }
  while (i < splitPoint) arr[k++] = tmp[i++];
  while (j < tmp.length) arr[k++] = tmp[j++];
}

function mergeSortRecurse<T>(arr: T[], left: number, right: number, comparator: (a: T, b: T) => number): void {
  if (left >= right) return;
  const mid = Math.floor((left + right) / 2);
  mergeSortRecurse(arr, left, mid, comparator);
  mergeSortRecurse(arr, mid + 1, right, comparator);
  merge(arr, left, mid, right, comparator);
}

export function mergeSort<T>(items: readonly T[], comparator: (a: T, b: T) => number): T[] {
  if (items.length <= 1) return [...items];
  const copy = [...items];
  mergeSortRecurse(copy, 0, copy.length - 1, comparator);
  return copy;
}

// ── Comparators ────────────────────────────────────────────────────────────────

const num = (v: number | undefined, fallback: number): number =>
  v !== undefined && Number.isFinite(v) ? v : fallback;

const epoch = (iso: string | undefined): number =>
  iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER;

export function comparePriority(a: Task, b: Task): number {
  const scoreDiff = num(b.priorityScore, 0) - num(a.priorityScore, 0);
  if (scoreDiff !== 0) return scoreDiff;
  return epoch(a.deadline) - epoch(b.deadline);
}

export function compareDeadline(a: Task, b: Task): number {
  const deadlineDiff = epoch(a.deadline) - epoch(b.deadline);
  if (deadlineDiff !== 0) return deadlineDiff;
  return num(b.priorityScore, 0) - num(a.priorityScore, 0);
}

export function compareProgress(a: Task, b: Task): number {
  const progressDiff = num(a.progress, 0) - num(b.progress, 0);
  if (progressDiff !== 0) return progressDiff;
  return num(b.priorityScore, 0) - num(a.priorityScore, 0);
}

const COMPARATOR: Record<SortMode, (a: Task, b: Task) => number> = {
  [SortMode.PRIORITY]: comparePriority,
  [SortMode.DEADLINE]: compareDeadline,
  [SortMode.PROGRESS]: compareProgress,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTeamTasks(teamId: string) {
  const { token } = useAuth();
  const [rawTasks, setRawTasks]             = useState<Task[]>([]);
  const [loading, setLoading]               = useState(true);
  const [sortMode, setSortMode]             = useState<SortMode>(SortMode.PRIORITY);
  const [executionOrder, setExecutionOrder] = useState<Task[]>([]);
  const [edges, setEdges]                   = useState<DependencyEdge[]>([]);
  const [assignWarning, setAssignWarning]   = useState<string | null>(null);
  const lastSync = useRef<string | null>(null);

  // Merge-sorted view derived from rawTasks + sortMode.
  const tasks = useMemo<Task[]>(() => mergeSort(rawTasks, COMPARATOR[sortMode]), [rawTasks, sortMode]);

  // ── REST hydrate ───────────────────────────────────────────────────────────
  const hydrate = useCallback(async () => {
    const res = await fetch(`${API}/api/teams/${teamId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: Task[] = await res.json();
      setRawTasks(data);
      lastSync.current = new Date().toISOString();
    }
    setLoading(false);
  }, [teamId, token]);

  // ── Fetch execution order (Topo Sort) ──────────────────────────────────────
  const applyTopo = useCallback((ordered: Task[]) => {
    setExecutionOrder(ordered);
    setEdges(ordered.flatMap((t) => (t.dependencies ?? []).map((d) => ({ from: d, to: t._id }))));
    setRawTasks((prev) => {
      const topoMap = new Map<string, number>();
      ordered.forEach((t, i) => topoMap.set(t._id, i));
      return prev.map((t) => ({ ...t, topoOrder: topoMap.get(t._id) ?? t.topoOrder }));
    });
  }, []);

  const fetchExecutionOrder = useCallback(async () => {
    const res = await fetch(`${API}/api/teams/${teamId}/tasks/execution-order`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setExecutionOrder(data.tasks ?? []);
      setEdges(data.edges ?? []);
      setRawTasks((prev) => {
        const topoMap = new Map<string, number>();
        (data.tasks ?? []).forEach((t: Task, i: number) => topoMap.set(t._id, i));
        return prev.map((t) => ({ ...t, topoOrder: topoMap.get(t._id) ?? t.topoOrder }));
      });
    }
  }, [teamId, token]);

  useEffect(() => { hydrate(); }, [hydrate]);

  // ── Socket subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket(token);
    socket.emit("room:join", { teamId });

    const onCreated = (task: Task) =>
      setRawTasks((prev) => (prev.some((t) => t._id === task._id) ? prev : [task, ...prev]));

    const onUpdated = (task: Task) =>
      setRawTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, ...task } : t)));

    const onDeleted = ({ taskId }: { taskId: string }) =>
      setRawTasks((prev) => prev.filter((t) => t._id !== taskId));

    const onPriorityRefreshed = ({ teamId: rt }: { teamId: string; count: number }) => {
      if (rt === teamId) hydrate();
    };

    const onExecutionOrder = ({ tasks: ordered }: { tasks: Task[]; edges: DependencyEdge[] }) =>
      applyTopo(ordered);

    const onTaskAssigned = ({ taskId, memberId, cost }: { taskId: string; memberId: string; cost: number }) => {
      setAssignWarning(null); // a successful assignment clears any prior warning
      setRawTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, assignedTo: memberId, assignmentCost: cost } : t))
      );
    };

    // Branch & Bound cannot run (no members / all-default skills).
    const onAssignWarning = ({ message }: { message: string }) => setAssignWarning(message);

    socket.on("task:created",            onCreated);
    socket.on("task:updated",            onUpdated);
    socket.on("task:deleted",            onDeleted);
    socket.on("task:priority_refreshed", onPriorityRefreshed);
    socket.on("task:execution-order",    onExecutionOrder);
    socket.on("task:assigned",           onTaskAssigned);
    socket.on("assign:warning",          onAssignWarning);
    socket.on("reconnect",               hydrate);

    return () => {
      socket.emit("room:leave", { teamId });
      socket.off("task:created",            onCreated);
      socket.off("task:updated",            onUpdated);
      socket.off("task:deleted",            onDeleted);
      socket.off("task:priority_refreshed", onPriorityRefreshed);
      socket.off("task:execution-order",    onExecutionOrder);
      socket.off("task:assigned",           onTaskAssigned);
      socket.off("assign:warning",          onAssignWarning);
      socket.off("reconnect",               hydrate);
    };
  }, [teamId, token, hydrate, applyTopo]);

  // ── setStatus ──────────────────────────────────────────────────────────────
  const setStatus = useCallback(
    (taskId: string, status: Task["status"]) => {
      const socket = getSocket(token);
      let prevStatus: Task["status"] | undefined;

      setRawTasks((prev) =>
        prev.map((t) => {
          if (t._id === taskId) { prevStatus = t.status; return { ...t, status }; }
          return t;
        })
      );

      socket.emit("task:update", { teamId, taskId, status, prevStatus }, (ack: { ok: boolean }) => {
        if (!ack?.ok && prevStatus) {
          setRawTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: prevStatus! } : t)));
        }
      });
    },
    [teamId, token]
  );

  // ── setTaskPriority (Greedy) ───────────────────────────────────────────────
  const setTaskPriority = useCallback(
    (taskId: string, urgency: number, impact: number) => {
      const socket = getSocket(token);
      let snapshot: Task | undefined;

      setRawTasks((prev) =>
        prev.map((t) => {
          if (t._id === taskId) {
            snapshot = { ...t };
            const u = (Math.min(Math.max(urgency, 1), 5) - 1) / 4;
            const i = (Math.min(Math.max(impact,  1), 5) - 1) / 4;
            const d = Math.min(t.dependencyCount ?? 0, 20) / 20;
            const estimatedScore = Math.round((0.5 * u + 0.35 * i + 0.15 * d) * 100);
            return { ...t, urgency, impact, priorityScore: estimatedScore };
          }
          return t;
        })
      );

      socket.emit(
        "task:update",
        { teamId, taskId, status: snapshot?.status ?? "todo", prevStatus: snapshot?.status, urgency, impact },
        (ack: { ok: boolean; task?: Task }) => {
          if (ack?.ok && ack.task) {
            setRawTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...ack.task } : t)));
          } else if (!ack?.ok && snapshot) {
            setRawTasks((prev) => prev.map((t) => (t._id === taskId ? snapshot! : t)));
          }
        }
      );
    },
    [teamId, token]
  );

  // ── createTask (full-field socket create) ───────────────────────────────────
  type CreateOpts = {
    urgency?: number; impact?: number; estimatedHours?: number; businessValue?: number;
    description?: string; deadline?: string | null; startDate?: string | null;
    dueDate?: string | null; priorityLabel?: Task["priorityLabel"];
    reminderAt?: string | null; status?: Task["status"]; assignedTo?: string | null;
  };
  const createTask = useCallback(
    (title: string, opts?: CreateOpts) =>
      new Promise<{ error?: string }>((resolve) => {
        const socket = getSocket(token);
        socket.emit(
          "task:create",
          {
            teamId, title, source: "manual",
            urgency: opts?.urgency ?? 1, impact: opts?.impact ?? 1,
            estimatedHours: opts?.estimatedHours, businessValue: opts?.businessValue,
            description: opts?.description, deadline: opts?.deadline,
            startDate: opts?.startDate, dueDate: opts?.dueDate, priorityLabel: opts?.priorityLabel,
            reminderAt: opts?.reminderAt, status: opts?.status, assignedTo: opts?.assignedTo,
          },
          (ack: { ok: boolean; task?: Task; error?: string }) =>
            resolve(ack?.ok ? {} : { error: ack?.error ?? "Failed to create task" })
        );
      }),
    [teamId, token]
  );

  // ── updateTask (general edit via socket task:update + optimistic merge) ──────
  const updateTask = useCallback(
    (taskId: string, fields: TaskFields) =>
      new Promise<{ error?: string }>((resolve) => {
        const socket = getSocket(token);
        setRawTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...fields } : t)));
        socket.emit("task:update", { teamId, taskId, fields }, (ack: { ok: boolean; task?: Task; error?: string }) => {
          if (ack?.ok && ack.task) setRawTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...ack.task } : t)));
          resolve(ack?.ok ? {} : { error: ack?.error ?? "Failed to update task" });
        });
      }),
    [teamId, token]
  );

  // ── deleteTask (socket delete; server recomputes + broadcasts) ───────────────
  const deleteTask = useCallback(
    (taskId: string) =>
      new Promise<{ error?: string }>((resolve) => {
        const socket = getSocket(token);
        socket.emit("task:delete", { teamId, taskId }, (ack: { ok: boolean; error?: string }) => {
          if (ack?.ok) setRawTasks((prev) => prev.filter((t) => t._id !== taskId));
          resolve(ack?.ok ? {} : { error: ack?.error ?? "Failed to delete task" });
        });
      }),
    [teamId, token]
  );

  // ── duplicateTask (REST clone; socket task:created broadcasts the copy) ──────
  const duplicateTask = useCallback(
    async (taskId: string, cloneDependencies = false): Promise<{ error?: string }> => {
      const res = await fetch(`${API}/api/teams/${teamId}/tasks/${taskId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cloneDependencies }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Failed to duplicate task" };
      setRawTasks((prev) => (prev.some((t) => t._id === data._id) ? prev : [data, ...prev]));
      return {};
    },
    [teamId, token]
  );

  // ── restoreBacklog (Restore AI Backlog) ─────────────────────────────────────
  const restoreBacklog = useCallback(async (): Promise<{ error?: string; restored?: number }> => {
    const res = await fetch(`${API}/api/teams/${teamId}/restore-backlog`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Failed to restore backlog" };
    setRawTasks(data.tasks ?? []);
    return { restored: data.restored };
  }, [teamId, token]);

  // ── addDependency / removeDependency (Topo Sort) ───────────────────────────
  const addDependency = useCallback(
    async (taskId: string, dependsOn: string): Promise<{ error?: string }> => {
      const res = await fetch(`${API}/api/teams/${teamId}/tasks/${taskId}/dependencies`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({ dependsOn }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? data.message ?? "Failed to add dependency" };
      if (data.executionOrder) applyTopo(data.executionOrder);
      return {};
    },
    [teamId, token, applyTopo]
  );

  const removeDependency = useCallback(
    async (taskId: string, depId: string): Promise<{ error?: string }> => {
      const res = await fetch(`${API}/api/teams/${teamId}/tasks/${taskId}/dependencies/${depId}`, {
        method : "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error ?? "Failed to remove dependency" };
      if (data.executionOrder) applyTopo(data.executionOrder);
      return {};
    },
    [teamId, token, applyTopo]
  );

  return {
    tasks,
    rawTasks,
    loading,
    sortMode,
    setSortMode,
    executionOrder,
    edges,
    assignWarning,
    setStatus,
    setTaskPriority,
    createTask,
    updateTask,
    deleteTask,
    duplicateTask,
    restoreBacklog,
    addDependency,
    removeDependency,
    fetchExecutionOrder,
    refetch: hydrate,
  };
}
