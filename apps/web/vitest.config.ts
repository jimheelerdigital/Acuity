import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws by design when imported outside a server
      // component / route. Vitest runs in Node, not Next.js, so we
      // short-circuit it to a no-op module for the test environment.
      "server-only": path.resolve(__dirname, "test/shims/server-only.ts"),
    },
  },
  test: {
    // Pure-function unit tests — no jsdom needed, no React rendering.
    environment: "node",
    // Match the project's existing TS module resolution.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
