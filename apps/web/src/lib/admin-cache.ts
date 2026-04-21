/**
 * Simple in-memory TTL cache for admin dashboard metrics.
 * Not persistent — resets on redeploy. No external dependencies.
 */

interface CacheEntry<T> {
  value: T;
  computedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Returns cached value if it was computed within `ttlMs` milliseconds.
 * Otherwise calls `computeFn`, caches the result, and returns it.
 *
 * Pass `ttlMs = Infinity` for static content that never expires.
 * Pass `ttlMs = 0` to skip caching entirely.
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  computeFn: () => Promise<T>
): Promise<{ data: T; cached: boolean; computedAt: number }> {
  if (ttlMs > 0) {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() - entry.computedAt < ttlMs) {
      return { data: entry.value, cached: true, computedAt: entry.computedAt };
    }
  }

  const value = await computeFn();
  const computedAt = Date.now();

  if (ttlMs > 0) {
    cache.set(key, { value, computedAt });
  }

  return { data: value, cached: false, computedAt };
}

/**
 * Invalidate a specific cache key (used by the Refresh button).
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all keys matching a prefix (e.g. "tab:overview" clears
 * all date-range variants for the overview tab).
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
