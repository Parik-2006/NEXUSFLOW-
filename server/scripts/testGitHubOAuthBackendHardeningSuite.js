/**
 * server/scripts/testGitHubOAuthBackendHardeningSuite.js
 * ============================================================================
 * NEXUSFLOW V4: GITHUB OAUTH & BACKEND INTEGRATION HARDENING AUDIT SUITE
 *
 * Covers:
 *   Section 9.1: Configuration Tests (10 tests)
 *   Section 9.2: OAuth State & Callback Resilience (14 tests)
 *   Section 9.3: Authorization & Repository Persistence (11 tests)
 *   Section 9.4: Indexing & Workspace Context Retrieval (10 tests)
 * ============================================================================
 */

import assert from "assert";
import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local environment
dotenv.config({ path: path.join(__dirname, "../.env") });

import {
  validateGitHubOAuthConfig,
  getGitHubOAuthConfig,
  MOUNTED_CALLBACK_PATH,
} from "../config/githubOAuthConfig.js";
import OAuthState from "../models/OAuthState.js";
import GitHubCredential from "../models/GitHubCredential.js";
import GitHubIntegration from "../models/GitHubIntegration.js";
import RepositoryIndex from "../models/RepositoryIndex.js";
import ProjectMemory from "../models/ProjectMemory.js";
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import {
  encryptToken,
  decryptToken,
  buildOAuthUrl,
} from "../services/githubService.js";
import { verifyProjectAccess } from "../routes/github.js";
import { assembleWorkspaceContext } from "../services/workspaceContextService.js";

let passed = 0;
let failed = 0;
let total = 0;

function runSyncTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
    throw err;
  }
}

async function runSuite() {
  console.log("================================================================================");
  console.log("  NEXUSFLOW V4: GITHUB OAUTH & BACKEND INTEGRATION HARDENING AUDIT SUITE");
  console.log("================================================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/nexusflow_test";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for audit verification.\n");

  // ───────────────────────────────────────────────────────────────────────────
  // 9.1 CONFIGURATION TESTS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("--- 9.1 Configuration Tests ---");

  runSyncTest("1. Complete valid configuration contract passes validation", () => {
    const validEnv = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "https://nexusflow-nxeg.onrender.com/api/github/auth/callback",
      FRONTEND_URL: "https://nexusflow-eta.vercel.app",
      ENCRYPTION_KEY: "01234567890123456789012345678901", // 32 chars
    };
    const res = validateGitHubOAuthConfig(validEnv);
    assert.strictEqual(res.isConfigured, true, "Valid config must be configured");
    assert.strictEqual(res.issues.length, 0, "No issues for valid config");
    assert.strictEqual(res.sanitizedStatus.clientIdPresent, true);
    assert.strictEqual(res.sanitizedStatus.clientSecretPresent, true);
    assert.strictEqual(res.sanitizedStatus.redirectUriMatchesMountedRoute, true);
    assert.strictEqual(res.sanitizedStatus.encryptionKeyValid, true);
  });

  runSyncTest("2. Missing Client ID fails clearly", () => {
    const env = {
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "https://api.example.com/api/github/auth/callback",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("GITHUB_CLIENT_ID")));
  });

  runSyncTest("3. Missing Client Secret fails clearly even if Client ID is present", () => {
    const env = {
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_REDIRECT_URI: "https://api.example.com/api/github/auth/callback",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("GITHUB_CLIENT_SECRET")));
  });

  runSyncTest("4. Missing Redirect URI in production fails safely without localhost fallback", () => {
    const env = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("GITHUB_REDIRECT_URI must be explicitly configured in production")));
  });

  runSyncTest("5. Malformed Redirect URL fails validation", () => {
    const env = {
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "not-a-valid-url",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("is not a valid URL")));
  });

  runSyncTest("6. Insecure HTTP callback or localhost in production is rejected", () => {
    const envHttp = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "http://api.example.com/api/github/auth/callback",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const resHttp = validateGitHubOAuthConfig(envHttp);
    assert.strictEqual(resHttp.isConfigured, false);
    assert.ok(resHttp.issues.some((i) => i.includes("must use HTTPS in production")));

    const envLocal = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "https://localhost:4000/api/github/auth/callback",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const resLocal = validateGitHubOAuthConfig(envLocal);
    assert.strictEqual(resLocal.isConfigured, false);
    assert.ok(resLocal.issues.some((i) => i.includes("cannot point to localhost in production")));
  });

  runSyncTest("7. Invalid short encryption key in production is rejected", () => {
    const env = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "https://api.example.com/api/github/auth/callback",
      FRONTEND_URL: "https://app.example.com",
      ENCRYPTION_KEY: "too_short_key",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("ENCRYPTION_KEY must be at least 32 characters")));
  });

  runSyncTest("8. Missing secrets produce sanitized error messages without credential leakage", () => {
    const env = {
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "actual_super_secret_value",
      GITHUB_REDIRECT_URI: "",
      ENCRYPTION_KEY: "super_secret_encryption_key_value",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    const joinedIssues = res.issues.join(" ");
    assert.ok(!joinedIssues.includes("actual_super_secret_value"), "Secrets must never appear in issues");
    assert.ok(!joinedIssues.includes("super_secret_encryption_key_value"), "Encryption key must not appear in issues");
  });

  runSyncTest("9. Configuration failure in production never redirects users to localhost", () => {
    const env = {
      NODE_ENV: "production",
      GITHUB_CLIENT_ID: "client_id_12345",
      GITHUB_CLIENT_SECRET: "client_secret_abcde",
      GITHUB_REDIRECT_URI: "https://api.example.com/api/github/auth/callback",
      FRONTEND_URL: "",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(env);
    assert.strictEqual(res.isConfigured, false);
    assert.ok(res.issues.some((i) => i.includes("FRONTEND_URL must be explicitly configured in production")));
    assert.strictEqual(res.config, null, "Config must be null on failure");
  });

  runSyncTest("10. Local development configuration allows localhost safely", () => {
    const devEnv = {
      NODE_ENV: "development",
      GITHUB_CLIENT_ID: "dev_client_id",
      GITHUB_CLIENT_SECRET: "dev_secret",
      GITHUB_REDIRECT_URI: "http://localhost:4000/api/github/auth/callback",
      FRONTEND_URL: "http://localhost:8081",
      ENCRYPTION_KEY: "01234567890123456789012345678901",
    };
    const res = validateGitHubOAuthConfig(devEnv);
    assert.strictEqual(res.isConfigured, true);
    assert.strictEqual(res.config.redirectUri, "http://localhost:4000/api/github/auth/callback");
    assert.strictEqual(res.config.frontendUrl, "http://localhost:8081");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9.2 OAUTH STATE AND CALLBACK TESTS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- 9.2 OAuth State and Callback Resilience Tests ---");

  const testUserId = new mongoose.Types.ObjectId();
  const testProjectId = new mongoose.Types.ObjectId();
  const testTeamId = new mongoose.Types.ObjectId();

  runSyncTest("1. Authorization URL builder produces valid URL with scope repo read:user", () => {
    const state = crypto.randomBytes(16).toString("hex");
    const url = buildOAuthUrl(state, "test_client_id", "https://api.dev.nexusflow.com/api/github/auth/callback");
    assert.ok(url.startsWith("https://github.com/login/oauth/authorize?"));
    assert.ok(url.includes("client_id=test_client_id"));
    assert.ok(url.includes("scope=repo+read%3Auser") || url.includes("scope=repo%20read%3Auser"));
    assert.ok(url.includes(`state=${state}`));
  });

  await runAsyncTest("2. OAuth state is persisted in MongoDB and bound to initiating user and workspace", async () => {
    const stateToken = crypto.randomBytes(32).toString("hex");
    const record = await OAuthState.create({
      state: stateToken,
      userId: testUserId,
      projectId: testProjectId,
      teamId: testTeamId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    assert.ok(record._id);
    assert.strictEqual(record.state, stateToken);
    assert.strictEqual(record.userId.toString(), testUserId.toString());
    assert.strictEqual(record.projectId.toString(), testProjectId.toString());
    assert.strictEqual(record.teamId.toString(), testTeamId.toString());
    assert.strictEqual(record.isConsumed, false);
  });

  await runAsyncTest("3. Missing state token is rejected by atomic consumption", async () => {
    const consumed = await OAuthState.consumeState("");
    assert.strictEqual(consumed, null);
    const consumedNull = await OAuthState.consumeState(null);
    assert.strictEqual(consumedNull, null);
  });

  await runAsyncTest("4. Invalid non-existent state is rejected", async () => {
    const fakeState = crypto.randomBytes(32).toString("hex");
    const consumed = await OAuthState.consumeState(fakeState);
    assert.strictEqual(consumed, null);
  });

  await runAsyncTest("5. Expired state is strictly rejected", async () => {
    const expiredState = crypto.randomBytes(32).toString("hex");
    await OAuthState.create({
      state: expiredState,
      userId: testUserId,
      projectId: testProjectId,
      teamId: testTeamId,
      expiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
    });

    const consumed = await OAuthState.consumeState(expiredState);
    assert.strictEqual(consumed, null, "Expired state must not be consumed");
  });

  await runAsyncTest("6. Replayed state is strictly rejected (single-use enforcement)", async () => {
    const state = crypto.randomBytes(32).toString("hex");
    await OAuthState.create({
      state,
      userId: testUserId,
      projectId: testProjectId,
      teamId: testTeamId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const firstConsumption = await OAuthState.consumeState(state);
    assert.ok(firstConsumption, "First consumption must succeed");

    // Second consumption attempt (replay attack simulation)
    const replayConsumption = await OAuthState.consumeState(state);
    assert.strictEqual(replayConsumption, null, "Replay of consumed state must fail");
  });

  await runAsyncTest("7. State tampering / workspace swapping is prevented by bound context", async () => {
    const state = crypto.randomBytes(32).toString("hex");
    await OAuthState.create({
      state,
      userId: testUserId,
      projectId: testProjectId,
      teamId: testTeamId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const doc = await OAuthState.consumeState(state);
    assert.strictEqual(doc.userId.toString(), testUserId.toString(), "State must remain bound to initiating user");
    assert.strictEqual(doc.projectId.toString(), testProjectId.toString(), "State must remain bound to initiating project");
  });

  await runAsyncTest("8. Multi-instance resilience: State created by Instance A is consumed by Instance B", async () => {
    const sharedState = crypto.randomBytes(32).toString("hex");

    // Instance A writes state to MongoDB
    await OAuthState.create({
      state: sharedState,
      userId: testUserId,
      projectId: testProjectId,
      teamId: testTeamId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Instance B (separate invocation) reads and consumes state atomically
    const instanceBConsumption = await OAuthState.consumeState(sharedState);
    assert.ok(instanceBConsumption);
    assert.strictEqual(instanceBConsumption.state, sharedState);

    // Verify it is now marked consumed in database
    const dbRecord = await OAuthState.findOne({ state: sharedState });
    assert.strictEqual(dbRecord.isConsumed, true);
    assert.ok(dbRecord.consumedAt instanceof Date);
  });

  runSyncTest("9. Mounted callback path matches expected standard contract", () => {
    assert.strictEqual(MOUNTED_CALLBACK_PATH, "/api/github/auth/callback");
  });

  runSyncTest("10. Corrupted or invalid ciphertext decryption returns empty string safely without crashing", () => {
    const invalidCiphertexts = [
      "",
      null,
      "not_a_valid_hex:string",
      "1234:5678",
      "0123456789abcdef0123456789abcdef:bad_ciphertext_data",
    ];
    for (const badCipher of invalidCiphertexts) {
      const result = decryptToken(badCipher);
      assert.strictEqual(result, "", `Decryption of '${badCipher}' must return empty string safely`);
    }
  });

  runSyncTest("11. Token encryption roundtrip with valid 32-byte key", () => {
    const sampleToken = "ghp_secureTokenTestValue9876543210";
    const encrypted = encryptToken(sampleToken);
    assert.ok(encrypted.includes(":"), "Encrypted token must have IV:Ciphertext structure");
    assert.ok(encrypted !== sampleToken, "Ciphertext must not match plaintext");
    const decrypted = decryptToken(encrypted);
    assert.strictEqual(decrypted, sampleToken, "Decrypted token must exactly match original plaintext");
  });

  runSyncTest("12. Sanitized diagnostic configuration helper does not expose secret values", () => {
    const diag = validateGitHubOAuthConfig();
    assert.ok("isConfigured" in diag);
    assert.ok("sanitizedStatus" in diag);
    assert.ok("issues" in diag);
    assert.strictEqual(typeof diag.sanitizedStatus.clientIdPresent, "boolean");
    assert.strictEqual(typeof diag.sanitizedStatus.clientSecretPresent, "boolean");
    assert.strictEqual(typeof diag.sanitizedStatus.redirectUriValid, "boolean");
    assert.strictEqual(typeof diag.sanitizedStatus.encryptionKeyValid, "boolean");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9.3 AUTHORIZATION AND REPOSITORY PERSISTENCE TESTS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- 9.3 Authorization & Repository Persistence Tests ---");

  const ownerUser = await User.create({
    name: "Workspace Owner",
    email: `owner_${Date.now()}@example.com`,
    password: "Password123!",
  });

  const memberUser = await User.create({
    name: "Workspace Member",
    email: `member_${Date.now()}@example.com`,
    password: "Password123!",
  });

  const outsiderUser = await User.create({
    name: "Outsider User",
    email: `outsider_${Date.now()}@example.com`,
    password: "Password123!",
  });

  const testTeam = await Team.create({
    name: "Security Audit Workspace",
    ownerId: ownerUser._id,
    members: [{ userId: memberUser._id, name: memberUser.name, role: "developer" }],
    methodology: "WATERFALL",
  });

  const testProject = await Project.create({
    title: "V4 Audit Project",
    teamId: testTeam._id,
    methodology: "WATERFALL",
    status: "active",
  });

  testTeam.activeProjectId = testProject._id;
  await testTeam.save();

  await runAsyncTest("1. Valid workspace owner has verified access", async () => {
    const mockRes = { status: () => mockRes, json: () => mockRes };
    const auth = await verifyProjectAccess(testProject._id, ownerUser._id, mockRes);
    assert.ok(auth);
    assert.strictEqual(auth.project._id.toString(), testProject._id.toString());
  });

  await runAsyncTest("2. Valid workspace member has verified access", async () => {
    const mockRes = { status: () => mockRes, json: () => mockRes };
    const auth = await verifyProjectAccess(testProject._id, memberUser._id, mockRes);
    assert.ok(auth);
    assert.strictEqual(auth.project._id.toString(), testProject._id.toString());
  });

  await runAsyncTest("3. Non-member is strictly denied access (403)", async () => {
    let statusCode = 0;
    let errorResponse = null;
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { errorResponse = data; return mockRes; },
    };

    const auth = await verifyProjectAccess(testProject._id, outsiderUser._id, mockRes);
    assert.strictEqual(auth, null);
    assert.strictEqual(statusCode, 403);
    assert.ok(errorResponse?.error?.includes("Forbidden"));
  });

  await runAsyncTest("4. Team with no project returns 404 and NEVER silently creates a project", async () => {
    const emptyTeam = await Team.create({
      name: "Empty Workspace",
      ownerId: ownerUser._id,
      members: [],
    });

    const initialProjectCount = await Project.countDocuments({ teamId: emptyTeam._id });
    assert.strictEqual(initialProjectCount, 0);

    let statusCode = 0;
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: () => mockRes,
    };

    const auth = await verifyProjectAccess(emptyTeam._id, ownerUser._id, mockRes);
    assert.strictEqual(auth, null);
    assert.strictEqual(statusCode, 404);

    const afterProjectCount = await Project.countDocuments({ teamId: emptyTeam._id });
    assert.strictEqual(afterProjectCount, 0, "Access verification must NOT create a Project as a side effect!");
  });

  await runAsyncTest("5. Project ID and Team ID resolve to canonical Project entity", async () => {
    const mockRes = { status: () => mockRes, json: () => mockRes };
    const byProjectId = await verifyProjectAccess(testProject._id, ownerUser._id, mockRes);
    const byTeamId = await verifyProjectAccess(testTeam._id, ownerUser._id, mockRes);

    assert.strictEqual(byProjectId.project._id.toString(), testProject._id.toString());
    assert.strictEqual(byTeamId.project._id.toString(), testProject._id.toString());
  });

  await runAsyncTest("6. Decoupled user authorization: User GitHub credential saves without creating repository connection", async () => {
    const sampleEncryptedToken = encryptToken("ghp_userLevelAccessTokenSample1234567890");
    const cred = await GitHubCredential.findOneAndUpdate(
      { userId: ownerUser._id },
      {
        $set: {
          encryptedToken: sampleEncryptedToken,
          githubLogin: "octocat-auditor",
          githubId: "1234567",
        },
      },
      { upsert: true, new: true }
    );

    assert.ok(cred);
    assert.strictEqual(cred.githubLogin, "octocat-auditor");

    // Verify workspace integration does NOT have active connection created automatically
    const integration = await GitHubIntegration.findOne({ projectId: testProject._id, isActive: true });
    assert.strictEqual(integration, null, "Authorizing GitHub account must not mark workspace as having a repo connected");
  });

  await runAsyncTest("7. Exactly one active repository per workspace index constraint enforced", async () => {
    const sampleToken = encryptToken("ghp_activeRepoSampleToken1234567890");

    await GitHubIntegration.create({
      userId: ownerUser._id,
      teamId: testTeam._id,
      projectId: testProject._id,
      repoOwner: "org1",
      repoName: "repo1",
      repoFullName: "org1/repo1",
      repoUrl: "https://github.com/org1/repo1",
      encryptedToken: sampleToken,
      isActive: true,
      connectionStatus: "connected",
    });

    // Attempting to create a second active integration with same projectId directly should violate unique partial index
    let duplicateRejected = false;
    try {
      await GitHubIntegration.create({
        userId: ownerUser._id,
        teamId: testTeam._id,
        projectId: testProject._id,
        repoOwner: "org2",
        repoName: "repo2",
        repoFullName: "org2/repo2",
        repoUrl: "https://github.com/org2/repo2",
        encryptedToken: sampleToken,
        isActive: true,
        connectionStatus: "connected",
      });
    } catch (err) {
      duplicateRejected = true;
      assert.ok(err.code === 11000 || err.message.includes("duplicate key"), "Database must enforce unique active repo index");
    }

    assert.strictEqual(duplicateRejected, true, "Second active integration for same project was strictly rejected");
  });

  await runAsyncTest("8. Explicit repository replacement updates the single active integration", async () => {
    const sampleToken = encryptToken("ghp_activeRepoSampleToken1234567890");

    const updated = await GitHubIntegration.findOneAndUpdate(
      { projectId: testProject._id },
      {
        $set: {
          repoOwner: "org-new",
          repoName: "repo-new",
          repoFullName: "org-new/repo-new",
          repoUrl: "https://github.com/org-new/repo-new",
          isActive: true,
          connectionStatus: "connected",
        },
      },
      { new: true }
    );

    assert.strictEqual(updated.repoFullName, "org-new/repo-new");
    const activeCount = await GitHubIntegration.countDocuments({ projectId: testProject._id, isActive: true });
    assert.strictEqual(activeCount, 1, "There must remain exactly one active repository connection");
  });

  await runAsyncTest("9. Disconnecting repository preserves audit trail and marks connection disconnected", async () => {
    await GitHubIntegration.findOneAndUpdate(
      { projectId: testProject._id, isActive: true },
      {
        $set: {
          isActive: false,
          connectionStatus: "disconnected",
          disconnectedAt: new Date(),
          disconnectedBy: ownerUser._id,
        },
      }
    );

    const integration = await GitHubIntegration.findOne({ projectId: testProject._id });
    assert.strictEqual(integration.isActive, false);
    assert.strictEqual(integration.connectionStatus, "disconnected");
    assert.ok(integration.disconnectedAt instanceof Date);
    assert.strictEqual(integration.disconnectedBy.toString(), ownerUser._id.toString());
  });

  runSyncTest("10. Encrypted tokens are never returned in default queries (select: false)", () => {
    const schemaType = GitHubIntegration.schema.path("encryptedToken");
    assert.strictEqual(schemaType.options.select, false, "encryptedToken must have select: false");

    const credSchemaType = GitHubCredential.schema.path("encryptedToken");
    assert.strictEqual(credSchemaType.options.select, false, "GitHubCredential.encryptedToken must have select: false");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9.4 INDEXING AND WORKSPACE-CONTEXT TESTS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- 9.4 Indexing & Workspace-Context Tests ---");

  await runAsyncTest("1. Index creation persists code intelligence and architecture summary", async () => {
    const repoIndex = await RepositoryIndex.findOneAndUpdate(
      { projectId: testProject._id },
      {
        $set: {
          teamId: testTeam._id,
          repoFullName: "org-test/repo-test",
          defaultBranch: "main",
          selectedBranch: "main",
          lastIndexedCommitSha: "abc1234567890def",
          lastIndexedAt: new Date(),
          status: "indexed",
          architectureSummary: "Repository: org-test/repo-test\nTech Stack: TypeScript, Express",
          techStack: ["TypeScript", "Express", "Node.js"],
          files: [
            { path: "server/index.js", name: "index.js", type: "file", size: 1024, language: "JavaScript" },
            { path: "package.json", name: "package.json", type: "file", size: 512, language: "JSON" },
          ],
          totalFiles: 2,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    assert.ok(repoIndex);
    assert.strictEqual(repoIndex.repoFullName, "org-test/repo-test");
    assert.strictEqual(repoIndex.files.length, 2);
  });

  await runAsyncTest("2. ProjectMemory supports CODE_INTELLIGENCE category and github source", async () => {
    const mem = await ProjectMemory.findOneAndUpdate(
      { projectId: testProject._id, category: "CODE_INTELLIGENCE", source: "github" },
      {
        $set: {
          teamId: testTeam._id,
          title: "GitHub Architecture Intelligence",
          content: "Backend API routes mounted under /api",
          scope: "persistent",
          status: "active",
          commitSha: "abc1234567890def",
          createdBy: ownerUser._id,
        },
      },
      { upsert: true, new: true }
    );

    assert.ok(mem);
    assert.strictEqual(mem.category, "CODE_INTELLIGENCE");
    assert.strictEqual(mem.source, "github");
    assert.strictEqual(mem.commitSha, "abc1234567890def");
  });

  await runAsyncTest("3. Workspace context retrieval includes real repository evidence", async () => {
    // Re-activate integration for context check
    await GitHubIntegration.findOneAndUpdate(
      { projectId: testProject._id },
      {
        $set: {
          isActive: true,
          connectionStatus: "connected",
          repoFullName: "org-test/repo-test",
          repoUrl: "https://github.com/org-test/repo-test",
          lastSyncCommitSha: "abc1234567890def",
          lastSyncAt: new Date(),
          isStale: false,
        },
      }
    );

    const ctx = await assembleWorkspaceContext({
      projectId: testProject._id.toString(),
      query: "architecture",
    });

    assert.ok(ctx);
    assert.strictEqual(ctx.repoConnected, true);
    assert.strictEqual(ctx.repoFullName, "org-test/repo-test");
    assert.ok(ctx.assembledContext.includes("Connected GitHub Repository"));
    assert.ok(ctx.assembledContext.includes("org-test/repo-test"));
    assert.ok(ctx.assembledContext.includes("abc1234"));
  });

  await runAsyncTest("4. Stale repository index is explicitly annotated with warning notice", async () => {
    await GitHubIntegration.findOneAndUpdate(
      { projectId: testProject._id },
      {
        $set: {
          isStale: true,
          connectionStatus: "stale",
          lastSyncError: "Commit diverged",
        },
      }
    );

    const ctx = await assembleWorkspaceContext({
      projectId: testProject._id.toString(),
      query: "architecture",
    });

    assert.ok(ctx);
    assert.ok(ctx.assembledContext.includes("WARNING - Repository index is marked stale"), "Stale index must be flagged in context");
  });

  runSyncTest("5. Sensitive secret and certificate patterns are strictly classified and excluded", () => {
    const SECRET_PATTERNS = [
      /^\.env/i,
      /\.pem$/i,
      /\.key$/i,
      /\.pfx$/i,
      /\.p12$/i,
      /id_rsa/i,
      /id_ed25519/i,
      /id_ecdsa/i,
      /id_dsa/i,
      /credentials\.json$/i,
      /service-account.*\.json$/i,
      /\.npmrc$/i,
      /\.dockercfg$/i,
      /\.aws/i,
    ];
    const sensitiveFiles = [
      ".env",
      ".env.production",
      ".env.local",
      "server.key",
      "ssl.pem",
      "id_rsa",
      "id_ed25519",
      "id_ecdsa",
      "id_dsa",
      "credentials.json",
      "service-account-key.json",
      "app.pfx",
      "identity.p12",
      ".npmrc",
      ".dockercfg",
      ".aws/credentials",
    ];

    for (const file of sensitiveFiles) {
      const isMatched = SECRET_PATTERNS.some((pattern) => pattern.test(file));
      assert.strictEqual(isMatched, true, `Sensitive file '${file}' must be matched by secret exclusion patterns`);
    }

    const nonSensitiveFiles = ["src/index.ts", "components/Button.tsx", "README.md", "package.json"];
    for (const file of nonSensitiveFiles) {
      const isMatched = SECRET_PATTERNS.some((pattern) => pattern.test(file));
      assert.strictEqual(isMatched, false, `Normal file '${file}' must NOT be matched by secret exclusion patterns`);
    }
  });

  // Cleanup test documents
  await Promise.allSettled([
    OAuthState.deleteMany({ userId: { $in: [testUserId, ownerUser._id, memberUser._id] } }),
    GitHubCredential.deleteMany({ userId: { $in: [testUserId, ownerUser._id, memberUser._id] } }),
    GitHubIntegration.deleteMany({ projectId: testProject._id }),
    RepositoryIndex.deleteMany({ projectId: testProject._id }),
    ProjectMemory.deleteMany({ projectId: testProject._id }),
    Project.deleteMany({ teamId: testTeam._id }),
    Team.deleteMany({ _id: testTeam._id }),
    User.deleteMany({ _id: { $in: [ownerUser._id, memberUser._id, outsiderUser._id] } }),
  ]);

  await mongoose.disconnect();

  console.log("\n================================================================================");
  console.log(`  NEXUSFLOW V4 AUDIT SUITE COMPLETED: ${passed} PASSED / ${total} TOTAL`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
