/**
 * server/tests/helpers/visualDemoServer.js
 * Local-only visual verification harness (Phase 1 / Task 11).
 *
 * Starts the real API on :4000 against a throw-away in-memory MongoDB with one
 * seeded demo user + workspace, and serves a static Expo web export on :8081.
 * Never touches MONGO_URI / production. Prints a demo JWT for the
 * `/?google=1&token=` session handoff so the dashboard can be screenshotted.
 *
 * Usage: node tests/helpers/visualDemoServer.js <path-to-expo-web-export>
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { prepareProcessEnv, blockExternalNetwork } from "./testEnv.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { assertSafeTestUri } from "./dbTargetGuard.js";

const distDir = path.resolve(process.argv[2] || "dist");
prepareProcessEnv();
blockExternalNetwork();

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replSet.getUri("nexusflow_visual_test");
assertSafeTestUri(uri, { productionUri: "" });
await mongoose.connect(uri);

const { server } = await import("../../app.js");
const { createUser, createWorkspace } = await import("./fixtures.js");
const demo = await createUser("Parik Demo");
const W = await createWorkspace("Demo", { owner: demo, methodology: "WATERFALL" });
// Phase 2 visual states: active sprint, finalized plan, archived project (Trash),
// and a valid password-reset token for the /reset-password screen.
{
  const { default: Sprint } = await import("../../models/Sprint.js");
  const { default: Project } = await import("../../models/Project.js");
  const { default: PasswordReset } = await import("../../models/PasswordReset.js");
  const { archiveProject } = await import("../../services/lifecycleService.js");
  const { randomToken, sha256hex } = await import("../../services/googleOAuth.js");
  await Sprint.updateOne({ _id: W.sprintId }, { $set: { status: "ACTIVE" } });
  await Project.updateOne({ _id: W.projectId }, { $set: { "waterfallPlanLifecycle.status": "PLAN_FINALIZED" } });
  const old = await Project.create({ teamId: W.teamId, title: "Old Prototype" });
  await archiveProject({ projectId: old._id, actorId: demo.user._id });
  const resetToken = randomToken(32);
  await PasswordReset.create({ userId: demo.user._id, tokenHash: sha256hex(resetToken), expiresAt: new Date(Date.now() + 20 * 60000) });
  console.log(`RESET_TOKEN=${resetToken}`);
}
server.listen(4000, "127.0.0.1", () => console.log("API on :4000"));

const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json", ".css": "text/css", ".ico": "image/x-icon" };
http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(distDir, urlPath);
    if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distDir, "index.html"); // SPA fallback
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8081, "127.0.0.1", () => {
    console.log("WEB on :8081");
    console.log(`DEMO_TOKEN=${demo.token}`);
  });
