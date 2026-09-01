/**
 * server/services/githubService.js
 * NEXUSFLOW 3.0 — Phase 11: GitHub REST API Service with AES-256-CBC token encryption
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
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(ciphertext) {
  const [ivHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * fetchRepoSummary(encryptedToken, repoOwner, repoName)
 * Fetches open issues, PRs, recent commits, and top contributors from GitHub REST API.
 */
export async function fetchRepoSummary(encryptedToken, repoOwner, repoName) {
  const token = decryptToken(encryptedToken);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const base = `https://api.github.com/repos/${repoOwner}/${repoName}`;

  const [issuesRes, prsRes, commitsRes, contribRes] = await Promise.allSettled([
    fetch(`${base}/issues?state=open&per_page=5`, { headers }),
    fetch(`${base}/pulls?state=open&per_page=5`, { headers }),
    fetch(`${base}/commits?per_page=10`, { headers }),
    fetch(`${base}/contributors?per_page=10&anon=false`, { headers }),
  ]);

  const get = async (r) => {
    if (r.status === "fulfilled" && r.value.ok) return r.value.json();
    return [];
  };

  const [issues, prs, commits, contribs] = await Promise.all([
    get(issuesRes), get(prsRes), get(commitsRes), get(contribRes),
  ]);

  return {
    openIssues:    Array.isArray(issues) ? issues.length : 0,
    openPRs:       Array.isArray(prs)    ? prs.length    : 0,
    recentCommits: Array.isArray(commits) ? commits.length : 0,
    contributors:  Array.isArray(contribs)
      ? contribs.slice(0, 10).map((c) => ({ login: c.login, contributions: c.contributions }))
      : [],
    lastFetchedAt: new Date(),
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
