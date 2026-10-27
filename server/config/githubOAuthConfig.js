/**
 * server/config/githubOAuthConfig.js
 * NEXUSFLOW V4 — Centralized Server-Side GitHub OAuth Configuration Helper
 *
 * Implements strict, environment-aware validation:
 *   1. Client ID present
 *   2. Client Secret present
 *   3. Redirect URI present, valid URL, HTTPS in deployed/production, matches mounted route
 *   4. Frontend URL present, valid URL, HTTPS in deployed/production
 *   5. Encryption Key present, valid length (>= 32 bytes/chars)
 *
 * Security Guarantee:
 *   - Never logs or exposes secret strings
 *   - Prevents unsafe production fallbacks to localhost
 *   - Distinguishes development and production constraints safely
 */

export const MOUNTED_CALLBACK_PATH = "/api/github/auth/callback";
export const MIN_ENCRYPTION_KEY_LEN = 32;

/**
 * Determines whether the current process is running in production / deployed environment
 */
export function isProductionEnvironment() {
  const env = (process.env.NODE_ENV || "").toLowerCase();
  const renderEnv = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  return env === "production" || renderEnv;
}

/**
 * Validates a URL string for structure, protocol, and environment rules.
 *
 * @param {string} urlString
 * @param {string} fieldName
 * @param {boolean} isProduction
 * @returns {{ valid: boolean, error?: string, parsed?: URL }}
 */
function validateUrl(urlString, fieldName, isProduction) {
  if (!urlString || typeof urlString !== "string" || !urlString.trim()) {
    return { valid: false, error: `${fieldName} is missing or empty` };
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { valid: false, error: `${fieldName} is not a valid URL` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `${fieldName} must use HTTP or HTTPS protocol` };
  }

  const isLocalHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "0.0.0.0" ||
    parsed.hostname.endsWith(".local");

  if (isProduction) {
    if (parsed.protocol !== "https:") {
      return { valid: false, error: `${fieldName} must use HTTPS in production/deployed environments` };
    }
    if (isLocalHost) {
      return { valid: false, error: `${fieldName} cannot point to localhost in production/deployed environments` };
    }
  }

  return { valid: true, parsed };
}

/**
 * Validates the complete GitHub OAuth and token encryption configuration contract.
 *
 * @param {object} [envOverride] Optional override for testing
 * @returns {{
 *   isConfigured: boolean,
 *   issues: string[],
 *   sanitizedStatus: {
 *     clientIdPresent: boolean,
 *     clientSecretPresent: boolean,
 *     redirectUriConfigured: boolean,
 *     redirectUriValid: boolean,
 *     redirectUriMatchesMountedRoute: boolean,
 *     frontendUrlConfigured: boolean,
 *     frontendUrlValid: boolean,
 *     encryptionKeyConfigured: boolean,
 *     encryptionKeyValid: boolean,
 *     isProduction: boolean
 *   },
 *   config: {
 *     clientId: string,
 *     clientSecret: string,
 *     redirectUri: string,
 *     frontendUrl: string,
 *     encryptionKey: string
 *   } | null
 * }}
 */
export function validateGitHubOAuthConfig(envOverride = null) {
  const env = envOverride || process.env;
  const isProd = envOverride
    ? envOverride.NODE_ENV === "production"
    : isProductionEnvironment();

  const clientId = (env.GITHUB_CLIENT_ID || "").trim();
  const clientSecret = (env.GITHUB_CLIENT_SECRET || "").trim();
  const rawRedirectUri = (env.GITHUB_REDIRECT_URI || "").trim();
  const rawFrontendUrl = (env.FRONTEND_URL || "").trim();
  const encryptionKey = (env.ENCRYPTION_KEY || "").trim();

  const issues = [];

  // 1. Client ID
  const clientIdPresent = Boolean(clientId);
  if (!clientIdPresent) {
    issues.push("GITHUB_CLIENT_ID is missing");
  }

  // 2. Client Secret
  const clientSecretPresent = Boolean(clientSecret);
  if (!clientSecretPresent) {
    issues.push("GITHUB_CLIENT_SECRET is missing");
  }

  // 3. Redirect URI
  let redirectUriConfigured = Boolean(rawRedirectUri);
  let redirectUriValid = false;
  let redirectUriMatchesMountedRoute = false;
  let effectiveRedirectUri = "";

  if (redirectUriConfigured) {
    const rCheck = validateUrl(rawRedirectUri, "GITHUB_REDIRECT_URI", isProd);
    if (!rCheck.valid) {
      issues.push(rCheck.error);
    } else {
      redirectUriValid = true;
      const parsedPath = rCheck.parsed.pathname.replace(/\/+$/, "");
      if (parsedPath === MOUNTED_CALLBACK_PATH) {
        redirectUriMatchesMountedRoute = true;
        effectiveRedirectUri = rCheck.parsed.origin + parsedPath;
      } else {
        issues.push(
          `GITHUB_REDIRECT_URI pathname ('${rCheck.parsed.pathname}') must match mounted backend route ('${MOUNTED_CALLBACK_PATH}')`
        );
      }
    }
  } else {
    if (isProd) {
      issues.push("GITHUB_REDIRECT_URI must be explicitly configured in production/deployed environments");
    } else {
      // Local development fallback
      effectiveRedirectUri = `http://localhost:${env.PORT || 4000}${MOUNTED_CALLBACK_PATH}`;
      redirectUriConfigured = true;
      redirectUriValid = true;
      redirectUriMatchesMountedRoute = true;
    }
  }

  // 4. Frontend URL
  let frontendUrlConfigured = Boolean(rawFrontendUrl);
  let frontendUrlValid = false;
  let effectiveFrontendUrl = "";

  if (frontendUrlConfigured) {
    const fCheck = validateUrl(rawFrontendUrl, "FRONTEND_URL", isProd);
    if (!fCheck.valid) {
      issues.push(fCheck.error);
    } else {
      frontendUrlValid = true;
      effectiveFrontendUrl = rawFrontendUrl.replace(/\/+$/, "");
    }
  } else {
    if (isProd) {
      issues.push("FRONTEND_URL must be explicitly configured in production/deployed environments");
    } else {
      effectiveFrontendUrl = "http://localhost:8081";
      frontendUrlConfigured = true;
      frontendUrlValid = true;
    }
  }

  // 5. Encryption Key
  const encryptionKeyConfigured = Boolean(encryptionKey);
  let encryptionKeyValid = false;
  let effectiveEncryptionKey = "";

  if (encryptionKeyConfigured) {
    if (encryptionKey.length < MIN_ENCRYPTION_KEY_LEN) {
      issues.push(`ENCRYPTION_KEY must be at least ${MIN_ENCRYPTION_KEY_LEN} characters long`);
    } else {
      encryptionKeyValid = true;
      effectiveEncryptionKey = encryptionKey;
    }
  } else {
    if (isProd) {
      issues.push("ENCRYPTION_KEY must be explicitly configured in production/deployed environments");
    } else {
      // Development safe fallback
      effectiveEncryptionKey = "nexusflow3_default_dev_key_32char";
      encryptionKeyValid = true;
    }
  }

  const isConfigured =
    clientIdPresent &&
    clientSecretPresent &&
    redirectUriValid &&
    redirectUriMatchesMountedRoute &&
    frontendUrlValid &&
    encryptionKeyValid &&
    issues.length === 0;

  return {
    isConfigured,
    issues,
    sanitizedStatus: {
      clientIdPresent,
      clientSecretPresent,
      redirectUriConfigured,
      redirectUriValid,
      redirectUriMatchesMountedRoute,
      frontendUrlConfigured,
      frontendUrlValid,
      encryptionKeyConfigured,
      encryptionKeyValid,
      isProduction: isProd,
    },
    config: isConfigured
      ? {
          clientId,
          clientSecret,
          redirectUri: effectiveRedirectUri,
          frontendUrl: effectiveFrontendUrl,
          encryptionKey: effectiveEncryptionKey,
        }
      : null,
  };
}

/**
 * Retrieves the validated GitHub OAuth configuration or throws a sanitized error.
 *
 * @param {object} [envOverride]
 * @returns {{ clientId: string, clientSecret: string, redirectUri: string, frontendUrl: string, encryptionKey: string }}
 */
export function getGitHubOAuthConfig(envOverride = null) {
  const result = validateGitHubOAuthConfig(envOverride);
  if (!result.isConfigured || !result.config) {
    const errorMsg = result.issues.length > 0
      ? `GitHub OAuth misconfigured: ${result.issues.join("; ")}`
      : "GitHub OAuth is not fully configured.";
    const err = new Error(errorMsg);
    err.sanitizedIssues = result.issues;
    err.sanitizedStatus = result.sanitizedStatus;
    throw err;
  }
  return result.config;
}
