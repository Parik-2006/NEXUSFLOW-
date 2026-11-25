/**
 * Phase 1 — Task 10 (D-13): tests can never target a production database.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSafeTestUri, UnsafeTestDatabaseError } from "../helpers/dbTargetGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..", "..");

describe("assertSafeTestUri", () => {
  const reject = (uri, opts) => assert.throws(() => assertSafeTestUri(uri, opts), UnsafeTestDatabaseError);
  test("rejects missing URI", () => reject(""));
  test("rejects Atlas mongodb+srv targets", () => reject("mongodb+srv://user:pw@cluster0.example.mongodb.net/nexusflow_test"));
  test("rejects remote hosts", () => reject("mongodb://db.example.com:27017/nexusflow_test"));
  test("rejects mixed local/remote replica sets", () => reject("mongodb://127.0.0.1:27017,db.example.com:27017/nexusflow_test"));
  test("rejects production database names", () => {
    reject("mongodb://127.0.0.1:27017/nexusflow");
    reject("mongodb://127.0.0.1:27017/admin");
  });
  test("rejects a URI without an explicit database", () => reject("mongodb://127.0.0.1:27017/"));
  test("rejects the runtime MONGO_URI even if it looks local", () => {
    reject("mongodb://127.0.0.1:27017/nexusflow_test", { productionUri: "mongodb://127.0.0.1:27017/nexusflow_test" });
  });
  test("accepts a local disposable test database", () => {
    const p = assertSafeTestUri("mongodb://127.0.0.1:51234/nexusflow_test?replicaSet=testset", { productionUri: "" });
    assert.equal(p.dbName, "nexusflow_test");
  });
});

describe("legacy script guard", () => {
  for (const [label, testUri] of [
    ["no MONGO_URI_TEST", ""],
    ["an Atlas MONGO_URI_TEST", "mongodb+srv://u:p@cluster0.example.mongodb.net/nexusflow_test"],
    ["a production-named MONGO_URI_TEST", "mongodb://127.0.0.1:27017/nexusflow"],
  ]) {
    test(`blocks a legacy DB script with ${label} before connecting`, () => {
      const r = spawnSync(process.execPath, [path.join(serverDir, "scripts", "testInvitationFlow.js")], {
        cwd: serverDir,
        env: { ...process.env, MONGO_URI_TEST: testUri, MONGO_URI: "mongodb+srv://u:p@prod.example.mongodb.net/nexusflow" },
        encoding: "utf8",
        timeout: 60000,
      });
      assert.equal(r.status, 2, `expected guard exit 2, got ${r.status}\n${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /test-db-guard\] BLOCKED/);
    });
  }
});
