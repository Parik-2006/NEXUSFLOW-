/**
 * server/services/githubService.js — GitHub REST API service (Phase 4)
 * ============================================================================
 * • Tokens are AES-256-GCM envelopes bound to their owning user
 *   (githubTokenCrypto.js). Every API helper takes a CREDENTIAL REFERENCE
 *   { encryptedToken, userId } — the owner id is the authenticated context, so
 *   a token copied onto another user's record cannot be decrypted.
 * • One request helper: bounded timeout, GitHub-aware error classification
 *   (revoked token, permission, rate limit incl. secondary limits, not found,
 *   empty repository, transient), bounded Link-header pagination, strict
 *   owner/repo/branch validation (no path injection), injectable fetch.
 */
import { logger } from "../utils/logger.js";
import { encryptGitHubToken, decryptGitHubToken, TokenCryptoError } from "./githubTokenCrypto.js";

export const githubDeps = { fetch: (...a) => fetch(...a), now: () => Date.now() };
const API = "https://api.github.com";
const TIMEOUT_MS = 10_000;
const MAX_PAGES = 5;

export class GitHubApiError extends Error {
  constructor(kind, message, { status = null, resetAt = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.kind = kind; // AUTH_REVOKED | FORBIDDEN | RATE_LIMITED | NOT_FOUND | EMPTY_REPOSITORY | INVALID_REQUEST | TRANSIENT | CREDENTIAL
    this.status = status;
    this.resetAt = resetAt;
    this.retryAfterMs = retryAfterMs;
  }
}

const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const REF_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9._\/-]{1,200}$/;
export function assertRepoCoords(owner, repo) {
  if (!NAME_RE.test(String(owner || "")) || !NAME_RE.test(String(repo || "")) || owner === "." || owner === ".." || repo === "." || repo === "..") {
    throw new GitHubApiError("INVALID_REQUEST", "Invalid repository owner or name.");
  }
}
function assertRef(ref) {
  if (!REF_RE.test(String(ref || ""))) throw new GitHubApiError("INVALID_REQUEST", "Invalid branch or ref.");
}

/** Encrypt a freshly obtained OAuth token for its owner. */
export function encryptToken(plaintext, { userId } = {}) {
  return encryptGitHubToken(plaintext, { userId });
}

/** Decrypt a credential reference; never logs or returns key material. */
export function decryptToken(cred) {
  if (!cred || typeof cred !== "object" || !cred.encryptedToken) throw new GitHubApiError("CREDENTIAL", "GitHub account not connected.");
  try {
    return decryptGitHubToken(cred.encryptedToken, { userId: cred.userId });
  } catch (e) {
    const code = e instanceof TokenCryptoError ? e.code : "UNKNOWN";
    logger.warn("github:credential_unusable", { code });
    throw new GitHubApiError("CREDENTIAL", code === "KEY_MISSING" || code === "KEY_INVALID"
      ? "GitHub integration is not configured on this server." : "GitHub authorization must be reconnected.");
  }
}

function getHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "NexusFlow-Platform",
    ...extra,
  };
}

function classify(res, body) {
  const h = (k) => res.headers?.get?.(k);
  const remaining = h("x-ratelimit-remaining");
  const reset = Number(h("x-ratelimit-reset"));
  const retryAfter = Number(h("retry-after"));
  const msg = String(body?.message || "").toLowerCase();
  if (res.status === 401) return new GitHubApiError("AUTH_REVOKED", "GitHub authorization expired or was revoked.", { status: 401 });
  if ((res.status === 403 || res.status === 429) && (remaining === "0" || Number.isFinite(retryAfter) || /rate limit/.test(msg))) {
    return new GitHubApiError("RATE_LIMITED", "GitHub API rate limit reached.", {
      status: res.status,
      resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null,
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : null,
    });
  }
  if (res.status === 403) return new GitHubApiError("FORBIDDEN", "GitHub denied access to this resource.", { status: 403 });
  if (res.status === 404) return new GitHubApiError("NOT_FOUND", "Repository or resource not found, or not accessible with this GitHub account.", { status: 404 });
  if (res.status === 409) return new GitHubApiError("EMPTY_REPOSITORY", "The repository is empty.", { status: 409 });
  if (res.status === 422 || res.status === 400) return new GitHubApiError("INVALID_REQUEST", "GitHub rejected the request.", { status: res.status });
  return new GitHubApiError("TRANSIENT", `GitHub API temporarily unavailable (HTTP ${res.status}).`, { status: res.status });
}

/** ghRequest(token, path, opts) → { data, res } ; throws GitHubApiError. */
async function ghRequest(token, path, { signal, accept, etag, allowNotModified = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), TIMEOUT_MS);
  const onAbort = () => ctl.abort(signal.reason);
  signal?.addEventListener?.("abort", onAbort, { once: true });
  try {
    const headers = getHeaders(token, { ...(accept ? { Accept: accept } : {}), ...(etag ? { "If-None-Match": etag } : {}) });
    let res;
    try {
      res = await githubDeps.fetch(path.startsWith("http") ? path : `${API}${path}`, { headers, signal: ctl.signal });
    } catch {
      throw new GitHubApiError("TRANSIENT", "Network error contacting GitHub.");
    }
    if (res.status === 304 && allowNotModified) return { data: null, res, notModified: true };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw classify(res, body);
    }
    return { data: await res.json().catch(() => null), res };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

function nextLink(res) {
  const link = res.headers?.get?.("link") || "";
  const m = link.split(",").map((s) => s.trim()).find((s) => /rel="next"/.test(s));
  const url = m && m.match(/<([^>]+)>/)?.[1];
  return url && url.startsWith(`${API}/`) ? url : null; // never follow links off api.github.com
}

async function paginate(token, path, { maxPages = MAX_PAGES, signal } = {}) {
  const out = [];
  let url = path, pages = 0, truncated = false;
  while (url) {
    const { data, res } = await ghRequest(token, url, { signal });
    if (Array.isArray(data)) out.push(...data);
    pages += 1;
    url = nextLink(res);
    if (url && pages >= maxPages) { truncated = true; break; }
  }
  return { items: out, pages, truncated };
}

/** fetchUserRepos(cred) — accessible repositories (bounded pagination). */
export async function fetchUserRepos(cred, { signal } = {}) {
  const token = decryptToken(cred);
  const { items } = await paginate(token, "/user/repos?per_page=100&sort=updated", { signal });
  return items.map((r) => ({
    id: String(r.id), name: r.name, fullName: r.full_name, owner: r.owner?.login || "",
    defaultBranch: r.default_branch || "main", visibility: r.private ? "private" : "public",
    htmlUrl: r.html_url, description: r.description || "", updatedAt: r.updated_at, permissions: r.permissions || {},
  }));
}

/** fetchRepoSummary(cred, owner, repo) — issues, PRs, commits, contributors, branches. */
export async function fetchRepoSummary(cred, repoOwner, repoName, { signal } = {}) {
  assertRepoCoords(repoOwner, repoName);
  const token = decryptToken(cred);
  const base = `/repos/${repoOwner}/${repoName}`;
  const { data: repoData } = await ghRequest(token, base, { signal }); // repo errors (401/404/rate limit) propagate
  const soft = async (p) => {
    try { return (await ghRequest(token, `${base}${p}`, { signal })).data; } catch (e) { if (e.kind === "RATE_LIMITED" || e.kind === "AUTH_REVOKED") throw e; return null; }
  };
  const [issuesData, prsData, commitsData, contribData, branchesData] = await Promise.all([
    soft("/issues?state=open&per_page=15"), soft("/pulls?state=open&per_page=15"), soft("/commits?per_page=15"),
    soft("/contributors?per_page=15&anon=false"), soft("/branches?per_page=20"),
  ]);
  const rawIssues = Array.isArray(issuesData) ? issuesData : [];
  const pureIssues = rawIssues.filter((i) => !i.pull_request);
  const rawPRs = Array.isArray(prsData) ? prsData : [];
  const rawCommits = Array.isArray(commitsData) ? commitsData : [];
  const rawContribs = Array.isArray(contribData) ? contribData : [];
  const rawBranches = Array.isArray(branchesData) ? branchesData : [];
  const now = githubDeps.now();
  const fourteenDaysAgo = now - 14 * 86400000;
  return {
    repoFullName: `${repoOwner}/${repoName}`,
    repoUrl: repoData?.html_url || `https://github.com/${repoOwner}/${repoName}`,
    defaultBranch: repoData?.default_branch || "main",
    visibility: repoData?.private ? "private" : "public",
    openIssues: pureIssues.length,
    openPRs: rawPRs.length,
    recentCommits: rawCommits.length,
    recentWeekCommitCount: rawCommits.filter((c) => new Date(c.commit?.author?.date || 0).getTime() > now - 7 * 86400000).length,
    contributors: rawContribs.slice(0, 15).map((c) => ({ login: c.login, contributions: c.contributions, avatarUrl: c.avatar_url, profileUrl: c.html_url })),
    recentCommitsList: rawCommits.slice(0, 10).map((c) => ({
      sha: (c.sha || "").slice(0, 7), message: c.commit?.message?.split("\n")[0] || "",
      author: c.commit?.author?.name || c.author?.login || "Unknown",
      date: c.commit?.author?.date ? new Date(c.commit.author.date) : null, url: c.html_url || "",
    })),
    pullRequestsList: rawPRs.slice(0, 10).map((p) => ({
      number: p.number, title: p.title, state: p.state, author: p.user?.login || "", url: p.html_url || "",
      draft: Boolean(p.draft), updatedAt: p.updated_at ? new Date(p.updated_at) : null,
    })),
    stalePRs: rawPRs.filter((p) => new Date(p.updated_at).getTime() < fourteenDaysAgo).map((p) => ({ number: p.number, title: p.title, updatedAt: p.updated_at })),
    openIssuesList: pureIssues.slice(0, 10).map((i) => ({ number: i.number, title: i.title, url: i.html_url, labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)) })),
    branches: rawBranches.map((b) => b.name),
    lastCommitAt: rawCommits[0]?.commit?.author?.date ? new Date(rawCommits[0].commit.author.date) : null,
    lastFetchedAt: new Date(now),
  };
}

/** fetchLatestCommit(cred, owner, repo, branch) */
export async function fetchLatestCommit(cred, repoOwner, repoName, branch = "main", { signal } = {}) {
  assertRepoCoords(repoOwner, repoName);
  assertRef(branch);
  const token = decryptToken(cred);
  const { data } = await ghRequest(token, `/repos/${repoOwner}/${repoName}/commits/${encodeURIComponent(branch)}`, { signal });
  return {
    sha: data.sha, message: data.commit?.message || "",
    author: data.commit?.author?.name || data.author?.login || "Unknown",
    date: data.commit?.author?.date ? new Date(data.commit.author.date) : new Date(),
    url: data.html_url,
  };
}

/** fetchRepoTree(cred, owner, repo, ref) — recursive tree for a commit SHA or branch. */
export async function fetchRepoTree(cred, repoOwner, repoName, ref = "main", { signal } = {}) {
  assertRepoCoords(repoOwner, repoName);
  assertRef(ref);
  const token = decryptToken(cred);
  const { data } = await ghRequest(token, `/repos/${repoOwner}/${repoName}/git/trees/${encodeURIComponent(ref)}?recursive=1`, { signal });
  return { sha: data.sha, truncated: Boolean(data.truncated), tree: Array.isArray(data.tree) ? data.tree : [] };
}

/** fetchFileContent(cred, owner, repo, path, ref, { maxBytes }) — null when not a small text file. */
export async function fetchFileContent(cred, repoOwner, repoName, filePath, ref = "main", { signal, maxBytes = 60_000 } = {}) {
  assertRepoCoords(repoOwner, repoName);
  assertRef(ref);
  if (typeof filePath !== "string" || !filePath || filePath.includes("..") || filePath.length > 500) return null;
  const token = decryptToken(cred);
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, "/");
  let data;
  try {
    ({ data } = await ghRequest(token, `/repos/${repoOwner}/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`, { signal }));
  } catch (e) {
    if (e.kind === "RATE_LIMITED" || e.kind === "AUTH_REVOKED") throw e;
    return null;
  }
  if (!data || data.type !== "file" || !data.content) return null;
  if (data.size > maxBytes) return null;
  try {
    const buf = Buffer.from(data.content, "base64");
    if (buf.includes(0)) return null; // binary
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/** compareCommits(cred, owner, repo, base, head) — null when unavailable. */
export async function compareCommits(cred, repoOwner, repoName, baseSha, headSha, { signal } = {}) {
  assertRepoCoords(repoOwner, repoName);
  assertRef(baseSha); assertRef(headSha);
  const token = decryptToken(cred);
  let data;
  try {
    ({ data } = await ghRequest(token, `/repos/${repoOwner}/${repoName}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}`, { signal }));
  } catch (e) {
    if (e.kind === "RATE_LIMITED" || e.kind === "AUTH_REVOKED") throw e;
    return null;
  }
  return {
    status: data.status, aheadBy: data.ahead_by || 0, behindBy: data.behind_by || 0, totalCommits: data.total_commits || 0,
    files: (data.files || []).map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes })),
    commits: (data.commits || []).map((c) => ({ sha: c.sha, message: c.commit?.message || "", author: c.commit?.author?.name || "Unknown", date: c.commit?.author?.date ? new Date(c.commit.author.date) : new Date() })),
  };
}

export function buildOAuthUrl(state, clientId, redirectUri) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "repo read:user", state });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  const res = await githubDeps.fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error("GitHub OAuth authorization failed.");
  return data.access_token;
}

/** fetchGitHubUser(credOrPlaintext) — accepts { plaintextToken } right after OAuth. */
export async function fetchGitHubUser(cred, { signal } = {}) {
  const token = cred?.plaintextToken || decryptToken(cred);
  const { data: user } = await ghRequest(token, "/user", { signal });
  return { login: user.login || "", id: String(user.id || ""), avatarUrl: user.avatar_url || "", htmlUrl: user.html_url || "", name: user.name || user.login || "", email: user.email || "" };
}

/** validateRepoAccess(cred, owner, repo) */
export async function validateRepoAccess(cred, repoOwner, repoName, { signal } = {}) {
  assertRepoCoords(repoOwner, repoName);
  const token = decryptToken(cred);
  let repo;
  try {
    ({ data: repo } = await ghRequest(token, `/repos/${repoOwner}/${repoName}`, { signal }));
  } catch (e) {
    if (e.kind === "NOT_FOUND") throw new GitHubApiError("NOT_FOUND", `Repository ${repoOwner}/${repoName} not found or not accessible with your GitHub account.`, { status: 404 });
    if (e.kind === "FORBIDDEN" || e.kind === "AUTH_REVOKED") throw new GitHubApiError(e.kind, `Access denied to repository ${repoOwner}/${repoName}. Please verify GitHub permissions.`, { status: e.status });
    throw e;
  }
  return {
    id: String(repo.id), name: repo.name, fullName: repo.full_name, owner: repo.owner?.login || repoOwner,
    defaultBranch: repo.default_branch || "main", visibility: repo.private ? "private" : "public",
    htmlUrl: repo.html_url || `https://github.com/${repoOwner}/${repoName}`, description: repo.description || "",
    permissions: repo.permissions || {},
  };
}
