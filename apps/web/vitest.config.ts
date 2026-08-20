import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws by design when imported outside a server
      // component / route. Vitest runs in Node, not Next.js, so we
      // short-circuit it to a no-op module for the test environment.
      "server-only": path.resolve(__dirname, "test/shims/server-only.ts"),
      // Mirror the tsconfig `@/*` → `src/*` alias.
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Pure-function unit tests — no jsdom needed, no React rendering.
    environment: "node",
    env: {
      // DeletedUser tombstones are HMAC'd, and lib/deleted-user-hash throws
      // when the key is absent — deliberately, so a missing key is a loud
      // deploy error rather than a silent fallback that would disable the
      // trial-farming guard. Tests therefore need a key present.
      //
      // A fixed test value, NOT the production secret: these tests assert
      // lookup SEMANTICS (that a candidate hashes to whatever the tombstone
      // stored), which any stable key satisfies. The real key must never
      // appear in the repo.
      DELETED_USER_EMAIL_HMAC_KEY: "test-only-hmac-key-not-a-secret",
    },
    // Match the project's existing TS module resolution.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
