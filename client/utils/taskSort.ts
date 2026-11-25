/**
 * taskSort.ts — pure Merge Sort + comparators for client task lists.
 *
 * Phase 2: extracted verbatim from hooks/useTeamTasks.ts (which re-exports
 * everything here) so the existing unit tests can run under Node's built-in
 * test runner without React Native imports. No behaviour change.
 */
import type { Task } from "../hooks/useTeamTasks";

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

export const COMPARATOR: Record<SortMode, (a: Task, b: Task) => number> = {
  [SortMode.PRIORITY]: comparePriority,
  [SortMode.DEADLINE]: compareDeadline,
  [SortMode.PROGRESS]: compareProgress,
};
