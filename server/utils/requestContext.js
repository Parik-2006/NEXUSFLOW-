/**
 * Request context (Phase 4): correlation id + client-disconnect AbortSignal,
 * carried via AsyncLocalStorage so deep services (OmniRoute) can read the
 * authenticated user / workspace scope and stop work when the client leaves.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export const requestContext = new AsyncLocalStorage();

const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function requestContextMiddleware(req, res, next) {
  const ctl = new AbortController();
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("close", () => {
    if (!res.writableFinished) ctl.abort(new DOMException("client disconnected", "AbortError"));
  });
  requestContext.run({ req, signal: ctl.signal, requestId }, next);
}

/** Current AI scope (empty outside an HTTP request). */
export function currentAiScope() {
  const s = requestContext.getStore();
  if (!s) return {};
  const req = s.req;
  const userId = req.user?._id ?? req.user?.id;
  const teamId = req.params?.teamId ?? req.teamAccess?.team?._id ?? req.projectAccess?.team?._id;
  return {
    userId: userId ? String(userId) : undefined,
    teamId: teamId ? String(teamId) : undefined,
    projectId: req.params?.projectId ? String(req.params.projectId) : undefined,
    signal: s.signal,
    requestId: s.requestId,
  };
}

export function currentRequestId() {
  return requestContext.getStore()?.requestId;
}
