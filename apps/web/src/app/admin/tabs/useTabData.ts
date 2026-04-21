"use client";

import { useEffect, useState } from "react";

export function useTabData<T>(
  tab: string,
  start: string,
  end: string
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/metrics?tab=${tab}&start=${start}&end=${end}`
        );
        if (!res.ok) {
          if (!cancelled) setError(`Failed (${res.status})`);
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, start, end]);

  return { data, loading, error };
}
