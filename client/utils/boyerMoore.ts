/**
 * Boyer–Moore–Horspool String Search  |  client/utils/boyerMoore.ts
 * ==================================================================
 * Phase 3 (D-32): the previous client copy used a 256-entry Int16Array, so any
 * non-ASCII mismatch character was treated as "absent" and could skip real
 * matches (Kannada, accented text, emoji). This version is the SAME variant,
 * shift table (Map keyed by UTF-16 code unit) and normalisation
 * (NFC → lower-case → NFC, query trimmed) as the server
 * (server/algorithms/stringSearch.js); both are tested against
 * server/tests/fixtures/searchCases.json.
 *
 * Variant     : Horspool (bad-character rule on the last window character);
 *               no good-suffix rule — not full Boyer–Moore.
 * Matching    : UTF-16 code units of normalised strings; not grapheme-aware.
 * Complexity  : preprocessing O(m); search O(n·m) worst, ≈ n/m typical;
 *               space O(min(m, σ)).
 */

// RUNTIME-SEPARATION NOTE (Task 5): a Boyer-Moore-Horspool search also exists
// on the server (server/algorithms/taskOptimiser.js → boyerMooreSearch) for the
// socket `task:search` path. The two are intentionally NOT shared: this file is
// bundled into the React Native client, that one runs in Node — there is no
// shared module boundary between them, and their return shapes differ
// (client returns {task, matchedFields} for highlighting; server filters docs).

/** Maximum supported query length (shared with the server). */
export const MAX_QUERY_LENGTH = 512;

/** NFC → lower-case → NFC, identical to server/algorithms/stringSearch.js. */
export function normalizeForSearch(s: string): string {
  return String(s ?? "").normalize("NFC").toLowerCase().normalize("NFC");
}

export function normalizeQuery(q: string): string {
  return normalizeForSearch(q).trim();
}

/**
 * buildShiftTable — Horspool bad-character table keyed by UTF-16 code unit.
 * A Map (not a fixed 256-entry typed array) so non-ASCII characters (Kannada,
 * accented letters, emoji surrogate halves) get their real shift and long
 * patterns cannot overflow. Every shift is in [1, m].   Time O(m)  Space O(min(m, σ))
 */
export function buildShiftTable(pattern: string): Map<number, number> {
  const m = pattern.length;
  const table = new Map<number, number>();
  for (let i = 0; i < m - 1; i++) table.set(pattern.charCodeAt(i), m - 1 - i);
  return table;
}

/**
 * boyerMooreSearch — Boyer–Moore–HORSPOOL (Phase 3, same variant as the server).
 * Returns the index of the first occurrence of `pattern` in `text` (exact
 * code-unit comparison; normalise first for case-insensitive search), or -1.
 * Empty pattern → 0.   Time O(n·m) worst, ≈ n/m typical.
 */
export function boyerMooreSearch(text: string, pattern: string, table?: Map<number, number>): number {
  const n = text.length;
  const m = pattern.length;
  if (m === 0) return 0;
  if (m > n) return -1;
  const shiftTable = table ?? buildShiftTable(pattern);
  let i = m - 1;
  while (i < n) {
    let k = 0;
    while (k < m && pattern.charCodeAt(m - 1 - k) === text.charCodeAt(i - k)) k++;
    if (k === m) return i - m + 1;
    i += shiftTable.get(text.charCodeAt(i)) ?? m;
  }
  return -1;
}

/**
 * boyerMooreContains
 * ------------------
 * Convenience wrapper: returns true if `pattern` occurs anywhere in `text`.
 * Performs case-insensitive matching by normalising both to lowercase.
 *
 * This is what task search uses for each field check.
 */
export function boyerMooreContains(text: string, pattern: string, table?: Map<number, number>): boolean {
  const q = normalizeQuery(pattern ?? "");
  if (!q) return true; // empty query matches everything
  return boyerMooreSearch(normalizeForSearch(text ?? ""), q, table) !== -1;
}

/** -----------------------------------------------------------------------
 *  SearchResult — a decorated Task returned by searchTasks
 *  -----------------------------------------------------------------------
 *  `matchedFields` tells the UI which fields hit so highlights can be
 *  rendered differently (title match is more relevant than description match).
 */
export type SearchResult<T> = {
  task: T;
  matchedFields: Array<"title" | "description">;
};

/**
 * searchTasks
 * -----------
 * The main entry-point used by useTeamTasks and the chat screen.
 *
 * Searches both `title` and `description` fields of every task using
 * Boyer-Moore.  Returns only matching tasks, preserving the original
 * array order (which is already sorted by Merge Sort / Greedy in the hook).
 *
 * Comparison with naïve approach:
 *   Naïve  (String.prototype.includes) : O(n * (|title| + |desc|)) per keystroke
 *   Boyer-Moore                        : O(n * (|title|/m + |desc|/m)) average
 *   For m ≥ 3 on typical task titles this is a 3-5× reduction in comparisons.
 *
 * @param tasks   - full task list (generic; must have title: string)
 * @param query   - user's search string
 * @returns       filtered array of SearchResult<T>
 *
 * Time  : O(n · (|title| / m + |desc| / m))  average
 * Space : O(σ + k)  — one bad-char table (256 shorts) + k results
 */
export function searchTasks<T extends { title: string; description?: string }>(
  tasks: T[],
  query: string
): SearchResult<T>[] {
  if (!query.trim()) {
    // Empty query — return all tasks (no filtering cost)
    return tasks.map((task) => ({ task, matchedFields: [] }));
  }

  const normalisedQuery = normalizeQuery(query).slice(0, MAX_QUERY_LENGTH);

  // Build the Horspool shift table ONCE for this query and reuse it for every
  // task field — O(m) preprocessing amortised over all n tasks.
  const table = buildShiftTable(normalisedQuery);

  const results: SearchResult<T>[] = [];

  for (const task of tasks) {
    const matchedFields: Array<"title" | "description"> = [];

    if (boyerMooreContains(task.title, normalisedQuery, table)) {
      matchedFields.push("title");
    }

    if (
      task.description &&
      boyerMooreContains(task.description, normalisedQuery, table)
    ) {
      matchedFields.push("description");
    }

    if (matchedFields.length > 0) {
      results.push({ task, matchedFields });
    }
  }

  return results;
}

/** -----------------------------------------------------------------------
 *  Benchmarking utility (used in dev / academic demonstrations only)
 *  -----------------------------------------------------------------------
 *  Compares wall-clock time for BM vs naïve Array.filter + includes.
 *  Call this from a test harness or debug screen to generate complexity data.
 */
export function benchmarkSearchMethods(
  tasks: Array<{ title: string; description?: string }>,
  query: string
): { bmMs: number; naiveMs: number; speedupFactor: number } {
  const ITERATIONS = 100;

  // Boyer-Moore
  const bmStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    searchTasks(tasks, query);
  }
  const bmMs = (performance.now() - bmStart) / ITERATIONS;

  // Naïve
  const naiveStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const q = query.toLowerCase();
    tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
  }
  const naiveMs = (performance.now() - naiveStart) / ITERATIONS;

  return {
    bmMs,
    naiveMs,
    speedupFactor: naiveMs / bmMs,
  };
}
