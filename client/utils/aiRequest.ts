/**
 * Client AI request helper (Phase 4, Tasks 4 / 9).
 * • bounded client deadline (slightly above the server's 25 s AI deadline)
 * • user cancellation via AbortController
 * • idempotency key reused on retry (server de-duplicates the message)
 * • truthful, human-readable statuses — a timeout or outage is never shown
 *   as an AI-generated answer
 */
export type AiClientStatus = "ok" | "timeout" | "canceled" | "network" | "http_error";

export const CLIENT_AI_DEADLINE_MS = 32_000;

export function newClientRequestId(): string {
  const rnd = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `cr-${rnd}`.slice(0, 64);
}

export async function aiFetch(
  url: string,
  { token, body, signal, timeoutMs = CLIENT_AI_DEADLINE_MS, fetchImpl = fetch }: { token: string; body: unknown; signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<{ status: AiClientStatus; httpStatus?: number; data?: any }> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "http_error", httpStatus: res.status, data };
    return { status: "ok", httpStatus: res.status, data };
  } catch {
    if (timedOut) return { status: "timeout" };
    if (signal?.aborted) return { status: "canceled" };
    return { status: "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Human-readable text for a client status or a server AI status. */
export function describeAiStatus(status: string, retryAfterMs?: number | null): string {
  const wait = retryAfterMs && retryAfterMs > 0 ? ` Try again in about ${Math.ceil(retryAfterMs / 1000)} s.` : " Please try again shortly.";
  switch (status) {
    case "timeout": case "deadline": return "The AI request took too long and was stopped. No answer was generated.";
    case "canceled": return "Request canceled.";
    case "network": return "Unable to reach the NEXUSFLOW server. Check your connection and retry.";
    case "rate_limited": return `AI request limit reached.${wait}`;
    case "quota_exhausted": return `The free AI provider quota is currently exhausted.${wait}`;
    case "unavailable": return "AI is temporarily unavailable. Project management features keep working.";
    case "policy_rejected": return "This AI request is not permitted under the zero-cost policy.";
    case "invalid_output": return "The AI response was invalid and was discarded.";
    default: return "The AI request failed. Please retry.";
  }
}
