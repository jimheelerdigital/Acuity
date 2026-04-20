// No-op replacement for the `server-only` package under Vitest.
// Next.js uses `server-only` as a build-time guard to ensure a module
// isn't imported by client components; in the test environment we want
// those modules importable directly.
export {};
