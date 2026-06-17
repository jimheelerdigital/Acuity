"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { TrialResponse, TrialBucket } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

function conversionPct(b: TrialBucket): number | null {
  if (b.users <= 0) return null;
  return (b.convertedPaid / b.users) * 100;
}

// Conversion% is the headline column. Color it like the rest of the MRI:
// green = healthy, amber = soft, red = leaking.
function conversionColor(pct: number | null): string {
  if (pct == null) return "text-white/30";
  if (pct >= 30) return "text-green-400";
  if (pct >= 15) return "text-amber-400";
  return "text-red-400";
}

export default function TrialFunnelSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<TrialResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy gate: only fetch once this section scrolls into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/admin/mri?section=trial&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as TrialResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trial funnel");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, start, end]);

  const buckets = data?.buckets ?? [];

  return (
    <div ref={containerRef}>
      <ChartCard title="Trial → Paid Funnel">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : buckets.length === 0 ? (
          <p className="text-sm text-white/40">No trial cohorts in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="pb-3 pr-4 font-medium">Cohort</th>
                  <th className="pb-3 pr-4 text-right font-medium">Users</th>
                  <th className="pb-3 pr-4 text-right font-medium">Activated</th>
                  <th className="pb-3 pr-4 text-right font-medium">Paid</th>
                  <th className="pb-3 pr-4 text-right font-medium">Dropped&nbsp;Free</th>
                  <th className="pb-3 pr-4 text-right font-medium">Payment&nbsp;Failed</th>
                  <th className="pb-3 text-right font-medium">Conversion %</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => {
                  const pct = conversionPct(b);
                  return (
                    <tr
                      key={b.bucket}
                      className="border-t border-white/5 text-white/80"
                    >
                      <td className="py-3 pr-4 font-medium text-white">
                        {b.bucket}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {b.users}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {b.activated}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-green-400">
                        {b.convertedPaid}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-white/50">
                        {b.droppedToFree}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-red-400">
                        {b.paymentFailed}
                      </td>
                      <td
                        className={`py-3 text-right font-semibold tabular-nums ${conversionColor(
                          pct,
                        )}`}
                      >
                        {pct == null ? "—" : `${pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
