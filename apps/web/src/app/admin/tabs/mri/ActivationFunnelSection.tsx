"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import MetricCard from "../../components/MetricCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { ActivationResponse, ActivationStep } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

// Drop% between funnel steps drives the bar color: red = heavy leak,
// amber = soft, green = healthy. Matches the rest of the MRI palette.
function dropColor(pctOfPrev: number | null): string {
  if (pctOfPrev == null) return "bg-[#8E6FE6]";
  const drop = 100 - pctOfPrev;
  if (drop > 25) return "bg-red-500";
  if (drop >= 10) return "bg-amber-500";
  return "bg-green-500";
}

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default function ActivationFunnelSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<ActivationResponse | null>(null);
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
    const url = `/api/admin/mri?section=activation&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as ActivationResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load activation funnel",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, start, end]);

  const steps: ActivationStep[] = data?.steps ?? [];
  const ttfe = data?.timeToFirstEntry ?? null;
  const histogram = data?.timeToFirstEntry?.histogram ?? [];

  // Funnel bars are scaled against the first (top-of-funnel) step.
  const topCount = steps.length > 0 ? Math.max(steps[0]?.count ?? 0, 1) : 1;
  const histMax = histogram.length > 0
    ? Math.max(...histogram.map((h) => h.count), 1)
    : 1;

  return (
    <div ref={containerRef} className="space-y-4">
      <ChartCard title="Activation Funnel">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : steps.length === 0 ? (
          <p className="text-sm text-white/40">No activation data in this range.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => {
              const widthPct = Math.max((s.count / topCount) * 100, 1.5);
              return (
                <div key={`${i}-${s.label}`}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-white/80">{s.label}</span>
                    <span className="flex items-baseline gap-3 tabular-nums">
                      <span className="font-medium text-white">{s.count}</span>
                      {s.pctOfPrev != null && (
                        <span
                          className={`text-xs ${
                            100 - s.pctOfPrev > 25
                              ? "text-red-400"
                              : 100 - s.pctOfPrev >= 10
                                ? "text-amber-400"
                                : "text-green-400"
                          }`}
                        >
                          {s.pctOfPrev.toFixed(1)}% of prev
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full transition-all ${dropColor(
                        s.pctOfPrev,
                      )}`}
                      style={{ width: `${Math.min(widthPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Time-to-first-entry stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Median to 1st Entry" value={fmtHours(ttfe?.median ?? null)} />
        <MetricCard label="P25 to 1st Entry" value={fmtHours(ttfe?.p25 ?? null)} />
        <MetricCard label="P75 to 1st Entry" value={fmtHours(ttfe?.p75 ?? null)} />
        <MetricCard label="P90 to 1st Entry" value={fmtHours(ttfe?.p90 ?? null)} />
      </div>

      <ChartCard title="Time to First Entry">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : histogram.length === 0 ? (
          <p className="text-sm text-white/40">
            No first-entry timing data in this range.
          </p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: 160 }}>
            {histogram.map((h, i) => {
              const heightPct = Math.max((h.count / histMax) * 100, 2);
              return (
                <div
                  key={`${i}-${h.bucket}`}
                  className="flex flex-1 flex-col items-center justify-end"
                >
                  <span className="mb-1 text-xs tabular-nums text-white/60">
                    {h.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-[#8E6FE6]/70 transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="mt-2 text-center text-[10px] leading-tight text-white/40">
                    {h.bucket}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
