/**
 * Version comparison, pure (no React Native imports) so bundled content
 * (lib/whats-new-content.ts) and the web-side vitest suite can use it.
 * Moved here from lib/version-check.ts, which re-exports it.
 */

/**
 * Strip pre-release / build-metadata suffixes and parse into a
 * fixed-length [major, minor, patch] tuple. Any segment that
 * doesn't parse becomes 0 — defensive against malformed config or
 * `Constants.expoConfig.version` returning something unexpected.
 */
export function parseVersion(raw: string): [number, number, number] {
  const cleaned = raw.split(/[-+]/, 1)[0] ?? raw;
  const parts = cleaned.split(".");
  const [major, minor, patch] = [0, 1, 2].map((i) => {
    const n = Number.parseInt(parts[i] ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [major, minor, patch];
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersion(a: string, b: string): -1 | 0 | 1 {
  const [aM, am, ap] = parseVersion(a);
  const [bM, bm, bp] = parseVersion(b);
  if (aM !== bM) return aM < bM ? -1 : 1;
  if (am !== bm) return am < bm ? -1 : 1;
  if (ap !== bp) return ap < bp ? -1 : 1;
  return 0;
}
