/**
 * server/services/githubService.js
 * NEXUSFLOW V4 — GitHub REST API Service with AES-256-CBC token encryption
 *
 * Implements:
 *   - Secure token encryption / decryption
 *   - Rich repository summary fetching (commits, PRs, issues, contributors, branches)
 *   - Accessible user repositories listing
 *   - Git tree retrieval and bounded file inspection
 *   - Incremental commit delta comparison
 */

import crypto from "crypto";
import { logger } from "../utils/logger.js";

const ALGO   = "aes-256-cbc";
const KEY_LEN = 32;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || "nexusflow3_default_dev_key_32char";
  return Buffer.from(raw.padEnd(KEY_LEN, "_").slice(0, KEY_LEN));
}

export function encryptToken(plaintext) {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(ciphertext) {
  if (!ciphertext) return "";
  const [ivHex, encHex] = ciphertext.split(":");
  if (!ivHex || !encHex) return "";
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "NexusFlow-Platform-v4",
  };
}

/**
 * fetchUserRepos(encryptedToken)
 * Fetches all accessible repositories for the authenticated GitHub user.
 */
export async function fetchUserRepos(encryptedToken) {
  const token = decryptToken(encryptedToken);
  if (!token) throw new Error("Invalid or missing GitHub access token");

  const headers = getHeaders(token);
  const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `Failed to fetch user repositories (HTTP ${res.status})`);
  }

  const repos = await res.json();
  if (!Array.isArray(repos)) return [];

  return repos.map((r) => ({
    id:            String(r.id),
    name:          r.name,
    fullName:      r.full_name,
    owner:         r.owner?.login || "",
    defaultBranch: r.default_branch || "main",
    visibility:    r.private ? "private" : "public",
    htmlUrl:       r.html_url,
    description:   r.description || "",
    updatedAt:     r.updated_at,
    permissions:   r.permissions || {},
  }));
}

/**
 * fetchRepoSummary(encryptedToken, repoOwner, repoName)
 * Fetches open issues, PRs, recent commits, and top contributors from GitHub REST API.
 */
export async function fetchRepoSummary(encryptedToken, repoOwner, repoName) {
  const token = decryptToken(encryptedToken);
  const headers = getHeaders(token);
  const base = `https://api.github.com/repos/${repoOwner}/${repoName}`;

  const [repoRes, issuesRes, prsRes, commitsRes, contribRes, branchesRes] = await Promise.allSettled([
    fetch(`${base}`, { headers }),
    fetch(`${base}/issues?state=open&per_page=15`, { headers }),
    fetch(`${base}/pulls?state=open&per_page=15`, { headers }),
    fetch(`${base}/commits?per_page=15`, { headers }),
    fetch(`${base}/contributors?per_page=15&anon=false`, { headers }),
    fetch(`${base}/branches?per_page=20`, { headers }),
  ]);

  const getJson = async (r) => {
    if (r.status === "fulfilled" && r.value.ok) return r.value.json();
    return null;
  };

  const [repoData, issuesData, prsData, commitsData, contribData, branchesData] = await Promise.all([
    getJson(repoRes),
    getJson(issuesRes),
    getJson(prsRes),
    getJson(commitsRes),
    getJson(contribRes),
    getJson(branchesRes),
  ]);

  // Distinguish pure issues from PRs (GitHub returns PRs in /issues endpoint)
  const rawIssues = Array.isArray(issuesData) ? issuesData : [];
  const pureIssues = rawIssues.filter((i) => !i.pull_request);

  const rawPRs = Array.isArray(prsData) ? prsData : [];
  const rawCommits = Array.isArray(commitsData) ? commitsData : [];
  const rawContribs = Array.isArray(contribData) ? contribData : [];
  const rawBranches = Array.isArray(branchesData) ? branchesData : [];

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const stalePRs = rawPRs.filter((p) => new Date(p.updated_at).getTime() < fourteenDaysAgo).map((p) => ({
    number:    p.number,
    title:     p.title,
    updatedAt: p.updated_at,
  }));

  const lastCommitDate = rawCommits[0]?.commit?.author?.date
    ? new Date(rawCommits[0].commit.author.date)
    : null;

  return {
    repoFullName: `${repoOwner}/${repoName}`,
    repoUrl:      repoData?.html_url || `https://github.com/${repoOwner}/${repoName}`,
    defaultBranch:repoData?.default_branch || "main",
    visibility:   repoData?.private ? "private" : "public",
    openIssues:   pureIssues.length,
    openPRs:      rawPRs.length,
    recentCommits:rawCommits.length,
    recentWeekCommitCount: rawCommits.filter((c) => {
      const d = new Date(c.commit?.author?.date || 0).getTime();
      return d > (Date.now() - 7 * 24 * 60 * 60 * 1000);
    }).length,
    contributors: rawContribs.slice(0, 15).map((c) => ({
      login: c.login,
      contributions: c.contributions,
      avatarUrl: c.avatar_url,
      profileUrl: c.html_url,
    })),
    recentCommitsList: rawCommits.slice(0, 10).map((c) => ({
      sha:     (c.sha || "").slice(0, 7),
      message: c.commit?.message?.split("\n")[0] || "",
      author:  c.commit?.author?.name || c.author?.login || "Unknown",
      date:    c.commit?.author?.date ? new Date(c.commit.author.date) : null,
      url:     c.html_url || "",
    })),
    pullRequestsList: rawPRs.slice(0, 10).map((p) => ({
      number:    p.number,
      title:     p.title,
      state:     p.state,
      author:    p.user?.login || "",
      url:       p.html_url || "",
      draft:     Boolean(p.draft),
      updatedAt: p.updated_at ? new Date(p.updated_at) : null,
    })),
    stalePRs,
    openIssuesList: pureIssues.slice(0, 10).map((i) => ({
      number: i.number,
      title:  i.title,
      url:    i.html_url,
      labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)),
    })),
    branches: rawBranches.map((b) => b.name),
    lastCommitAt: lastCommitDate,
    lastFetchedAt: new Date(),
  };
}

/**
 * fetchLatestCommit(encryptedToken, repoOwner, repoName, branch)
 */
export async function fetchLatestCommit(encryptedToken, repoOwner, repoName, branch = "main") {
  const token = decryptToken(encryptedToken);
  const headers = getHeaders(token);
  const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/commits/${branch}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch latest commit for branch ${branch}`);
  }

  const data = await res.json();
  return {
    sha:     data.sha,
    message: data.commit?.message || "",
    author:  data.commit?.author?.name || data.author?.login || "Unknown",
    date:    data.commit?.author?.date ? new Date(data.commit.author.date) : new Date(),
    url:     data.html_url,
  };
}

/**
 * fetchRepoTree(encryptedToken, repoOwner, repoName, branch)
 */
export async function fetchRepoTree(encryptedToken, repoOwner, repoName, branch = "main") {
  const token = decryptToken(encryptedToken);
  const headers = getHeaders(token);
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch git tree for ${repoOwner}/${repoName}`);
  }

  const data = await res.json();
  return {
    sha:       data.sha,
    truncated: Boolean(data.truncated),
    tree:      Array.isArray(data.tree) ? data.tree : [],
  };
}

/**
 * fetchFileContent(encryptedToken, repoOwner, repoName, filePath, ref)
 */
export async function fetchFileContent(encryptedToken, repoOwner, repoName, filePath, ref = "main") {
  const token = decryptToken(encryptedToken);
  const headers = getHeaders(token);
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, "/");
  const res = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    { headers }
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (data.type !== "file" || !data.content) return null;

  // Max 60KB
  if (data.size > 60000) {
    return `[File size ${data.size} bytes exceeds preview threshold]`;
  }

  try {
    const decoded = Buffer.from(data.content, "base64").toString("utf8");
    return decoded;
  } catch {
    return null;
  }
}

/**
 * compareCommits(encryptedToken, repoOwner, repoName, baseSha, headSha)
 */
export async function compareCommits(encryptedToken, repoOwner, repoName, baseSha, headSha) {
  const token = decryptToken(encryptedToken);
  const headers = getHeaders(token);
  const res = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/compare/${baseSha}...${headSha}`,
    { headers }
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return {
    status:        data.status,
    aheadBy:       data.ahead_by || 0,
    behindBy:      data.behind_by || 0,
    totalCommits:  data.total_commits || 0,
    files:         (data.files || []).map((f) => ({
      filename:  f.filename,
      status:    f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes:   f.changes,
    })),
    commits:       (data.commits || []).map((c) => ({
      sha:     c.sha,
      message: c.commit?.message || "",
      author:  c.commit?.author?.name || "Unknown",
      date:    c.commit?.author?.date ? new Date(c.commit.author.date) : new Date(),
    })),
  };
}

/**
 * buildOAuthUrl(state, clientId, redirectUri)
 */
export function buildOAuthUrl(state, clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        "repo read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
 */
export async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  return data.access_token;
}
