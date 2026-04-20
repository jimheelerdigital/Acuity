import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-function unit tests — no jsdom needed, no React rendering.
    environment: "node",
    // Match the project's existing TS module resolution.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
