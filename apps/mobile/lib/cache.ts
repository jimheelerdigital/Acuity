import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

type Entry<T> = { data: T; fetchedAt: number };

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidate(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export function isStale(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttlMs;
}

async function dedupedGet<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const p = api.get<T>(path).finally(() => {
    inflight.delete(path);
  });
  inflight.set(path, p);
  return p;
}

/**
 * SWR-style resource hook. Returns cached data immediately (no spinner
 * flash when switching tabs back to a screen you've already loaded),
 * then silently revalidates in the background if the cache is older
 * than `ttlMs`. On pull-to-refresh, call `refetch()` to force.
 *
 * Why this matters for perf: the old pattern was `setLoading(true)`
 * → fetch → replace. Every tab switch blanked the UI. With cached
 * + stale-while-revalidate, the UI renders instantly from memory and
 * only quietly updates in place when new data lands.
 */
export function useCachedResource<T>(
  path: string | null,
  opts: { ttlMs?: number; refetchOnFocus?: boolean } = {}
): {
  data: T | undefined;
  loading: boolean;
  refreshing: boolean;
  refetch: () => Promise<void>;
  error: Error | null;
} {
  const { ttlMs = DEFAULT_TTL_MS, refetchOnFocus = true } = opts;
  const [data, setData] = useState<T | undefined>(() =>
    path ? getCached<T>(path) : undefined
  );
  const [loading, setLoading] = useState(() =>
    path ? !cache.has(path) : false
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchOnce = useCallback(
    async (force: boolean) => {
      if (!path) return;
      if (!force && !isStale(path, ttlMs) && cache.has(path)) {
        const cached = getCached<T>(path);
        setData(cached);
        setLoading(false);
        return;
      }
      const hasCached = cache.has(path);
      if (!hasCached) setLoading(true);
      else setRefreshing(true);
      try {
        const next = await dedupedGet<T>(path);
        setCached(path, next);
        if (mountedRef.current) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path, ttlMs]
  );

  useEffect(() => {
    if (!path) return;
    // Seed from cache synchronously on path change.
    const cached = getCached<T>(path);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
    } else {
      setData(undefined);
      setLoading(true);
    }
    fetchOnce(false);
  }, [path, fetchOnce]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) fetchOnce(false);
    }, [fetchOnce, refetchOnFocus])
  );

  const refetch = useCallback(() => fetchOnce(true), [fetchOnce]);

  return { data, loading, refreshing, refetch, error };
}
