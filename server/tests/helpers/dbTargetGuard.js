/**
 * server/tests/helpers/dbTargetGuard.js
 * NEXUSFLOW Phase 1 (Task 10 / D-13) — refuse any non-disposable database.
 *
 * A test may only ever connect to a LOCAL MongoDB whose database name clearly
 * marks it as a test database. Remote hosts, `mongodb+srv://` (Atlas), and the
 * runtime `MONGO_URI` are rejected before any connection — and therefore
 * before any mutation — happens.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRODUCTION_DB_NAMES = new Set(["nexusflow", "nexusflow-prod", "nexusflow_prod", "production", "prod", "admin"]);

export class UnsafeTestDatabaseError extends Error {
  constructor(reason) {
    super(`[test-db-guard] Refusing database target: ${reason}`);
    this.name = "UnsafeTestDatabaseError";
  }
}

/** Parse a mongodb:// URI into { scheme, hosts[], dbName } without logging it. */
export function parseMongoUri(uri) {
  const m = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]*)(?:\/([^?]*))?/i.exec(String(uri || "").trim());
  if (!m) return null;
  const hosts = m[2]
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]).toLowerCase());
  return { scheme: m[1].toLowerCase(), hosts, dbName: decodeURIComponent(m[3] || "") };
}

/**
 * Throws UnsafeTestDatabaseError unless `uri` is a local, explicitly-test
 * database that is not the runtime MONGO_URI. Never echoes credentials.
 */
export function assertSafeTestUri(uri, { productionUri = process.env.MONGO_URI } = {}) {
  if (!uri) throw new UnsafeTestDatabaseError("no MONGO_URI_TEST configured");
  const parsed = parseMongoUri(uri);
  if (!parsed) throw new UnsafeTestDatabaseError("not a mongodb:// URI");
  if (parsed.scheme !== "mongodb") throw new UnsafeTestDatabaseError("mongodb+srv (Atlas/remote) targets are never allowed for tests");
  if (!parsed.hosts.length || parsed.hosts.some((h) => !LOCAL_HOSTS.has(h))) {
    throw new UnsafeTestDatabaseError("only localhost / 127.0.0.1 / ::1 hosts are allowed for tests");
  }
  const db = parsed.dbName.toLowerCase();
  if (!db) throw new UnsafeTestDatabaseError("the URI must name an explicit test database (e.g. /nexusflow_test)");
  if (PRODUCTION_DB_NAMES.has(db) || !/test/.test(db)) {
    throw new UnsafeTestDatabaseError(`database name "${parsed.dbName}" is not an explicitly disposable test database (must contain "test")`);
  }
  if (productionUri && String(productionUri).trim() === String(uri).trim()) {
    throw new UnsafeTestDatabaseError("MONGO_URI_TEST must differ from the runtime MONGO_URI");
  }
  return parsed;
}
