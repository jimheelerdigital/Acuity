"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Meta {
  cached: boolean;
  computedAt: number;
  durationMs: number;
}

export function useTabData<T>(
  tab: string,
  start: string,
  end: string,
  extraParams?: Record<string, string>,
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  meta: Meta | null;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Stable serialization of extraParams — avoids JSON.stringify in dep array
  const extraStr = extraParams ? Object.keys(extraParams).sort().map((k) => `${k}=${extraParams[k]}`).join("&") : "";
  const prevExtraRef = useRef(extraStr);
  const [stableExtra, setStableExtra] = useState(extraStr);
  if (extraStr !== prevExtraRef.current) {
    prevExtraRef.current = extraStr;
    setStableExtra(extraStr);
  }

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const isRefresh = refreshKey > 0;

    (async () => {
      try {
        const extra = extraParams ? Object.entries(extraParams).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("") : "";
        const url = `/api/admin/metrics?tab=${tab}&start=${start}&end=${end}${isRefresh ? "&refresh=true" : ""}${extra}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) setError(`Failed (${res.status})`);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          const { _meta, ...rest } = json;
          setData(rest as T);
          setMeta(_meta ?? null);
        }
      } catch {
        if (!cancelled) setError("Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, start, end, refreshKey, stableExtra]);

  return { data, loading, error, meta, refresh };
}
