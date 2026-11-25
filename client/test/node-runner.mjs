// Phase 2 (Task 11): client unit tests on Node's built-in test runner.
// Pure-logic tests only (no React Native). Provides Jest-style globals via
// the shared minimal shim instead of adding Jest.
//   npm test  →  node --test --experimental-transform-types --import ./test/node-runner.mjs "hooks/*.test.ts"
import { register } from "node:module";
register("./ts-resolve-hooks.mjs", import.meta.url);
await import("../../server/tests/helpers/jestCompat.js");
