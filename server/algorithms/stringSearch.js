/**
 * stringSearch.js — Boyer–Moore–Horspool task search (Phase 3, D-32)
 * ============================================================================
 *
 * VARIANT  Boyer–Moore–HORSPOOL: right-to-left window comparison with the
 *   bad-character shift taken from the text character aligned with the LAST
 *   pattern position. (It is not full Boyer–Moore: there is no good-suffix
 *   rule.) The client (client/utils/boyerMoore.ts) implements the SAME variant
 *   and normalisation; both are checked against one shared fixture.
 *
 * SHIFT TABLE  a Map keyed by UTF-16 code unit → shift ∈ [1, m]. No fixed-width
 *   integer array, so patterns of any supported length (≤ MAX_QUERY_LENGTH)
 *   cannot overflow, and non-ASCII characters (Kannada, accented letters,
 *   emoji surrogate halves) get correct shifts. Every shift is ≥ 1, so the
 *   window always advances — the search terminates.
 *   (Before Phase 3 the server used Uint8Array(128).fill(m): m = 256 wrapped to
 *   a shift of 0 — an infinite loop — and non-ASCII characters always shifted
 *   by m, skipping real matches.)
 *
 * NORMALISATION  normalizeForSearch(s) = NFC(lowercase(NFC(s)))
 *   (locale-independent). Queries are additionally trimmed. Matching operates
 *   on UTF-16 code units of the normalised strings. It is NOT grapheme-aware:
 *   a query can match inside a longer grapheme cluster (e.g. a base letter
 *   followed by a combining mark that has no precomposed NFC form).
 *
 * COMPLEXITY  preprocessing O(m); search O(n·m) worst case, typically sub-linear
 *   (≈ n/m comparisons) on natural-language text. Space O(min(m, σ)).
 */

export const MAX_QUERY_LENGTH = 512;

export function normalizeForSearch(s) {
  // NFC → lower-case → NFC (lower-casing can itself produce decomposed sequences).
  return String(s ?? "").normalize("NFC").toLowerCase().normalize("NFC");
}

export function normalizeQuery(q) {
  return normalizeForSearch(q).trim();
}

export function buildShiftTable(pattern) {
  const m = pattern.length;
  const table = new Map();
  for (let i = 0; i < m - 1; i++) table.set(pattern.charCodeAt(i), m - 1 - i);
  return table;
}

/**
 * horspoolIndexOf(text, pattern, { stats }) — first index of pattern in text
 * (exact code-unit match, no normalisation), or -1. Empty pattern → 0.
 */
export function horspoolIndexOf(text, pattern, opts = {}) {
  const n = text.length;
  const m = pattern.length;
  if (m === 0) return 0;
  if (m > n) return -1;
  const table = opts.table ?? buildShiftTable(pattern);
  const stats = opts.stats;
  let i = m - 1; // index in text aligned with the last pattern character
  while (i < n) {
    let k = 0;
    while (k < m && pattern.charCodeAt(m - 1 - k) === text.charCodeAt(i - k)) {
      k++;
    }
    if (stats) stats.comparisons += k < m ? k + 1 : k;
    if (k === m) return i - m + 1;
    const shift = table.get(text.charCodeAt(i)) ?? m;
    i += shift;
    if (stats) stats.shifts++;
  }
  return -1;
}

/** All (possibly overlapping) match positions. */
export function horspoolAllMatches(text, pattern) {
  const out = [];
  if (pattern.length === 0) return out;
  const table = buildShiftTable(pattern);
  let from = 0;
  while (from <= text.length - pattern.length) {
    const idx = horspoolIndexOf(text.slice(from), pattern, { table });
    if (idx < 0) break;
    out.push(from + idx);
    from += idx + 1;
  }
  return out;
}

/** Case-insensitive, NFC-normalised containment test. */
export function searchContains(text, query) {
  const q = normalizeQuery(query);
  if (q.length === 0) return true;
  return horspoolIndexOf(normalizeForSearch(text), q) !== -1;
}

/**
 * validateSearchQuery(q) → { ok, query, error }
 * Rejects non-strings and queries longer than MAX_QUERY_LENGTH (after trim).
 */
export function validateSearchQuery(q) {
  if (typeof q !== "string") return { ok: false, error: "query must be a string" };
  const query = normalizeQuery(q);
  if (query.length > MAX_QUERY_LENGTH) return { ok: false, error: `query exceeds ${MAX_QUERY_LENGTH} characters` };
  return { ok: true, query };
}
