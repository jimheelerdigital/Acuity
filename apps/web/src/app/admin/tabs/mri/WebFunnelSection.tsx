"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { WebFunnelResponse } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

// A funnel step as it arrives from getWebOnboardingFunnel: {label, count}.
type FunnelStep = WebFunnelResponse["steps"][number];

// The funnel payload has no in-app-browser split in its declared shape, but if
// a future query adds one we render it side-by-side. Narrow defensively without
// widening the contract: optional, validated at runtime.
type BrowserSplit = {
  inApp?: FunnelStep[];
  regular?: FunnelStep[];
};

// Drop% between two adjacent steps drives the bar color: red = heavy leak
// (>25%), amber = soft (10–25%), green = healthy (<10%). Matches the rest of
// the MRI palette.
function dropColor(dropPct: number | null): string {
  if (dropPct == null) return "bg-[#8E6FE6]";
  if (dropPct > 25) return "bg-red-500";
  if (dropPct >= 10) return "bg-amber-500";
  return "bg-green-500";
}

function dropTextColor(dropPct: number): string {
  if (dropPct > 25) return "text-red-400";
  if (dropPct >= 10) return "text-amber-400";
  return "text-green-400";
}

// Drop% from the previous step (null for the first step or when prev is 0).
function computeDrop(steps: FunnelStep[], i: number): number | null {
  if (i === 0) return null;
  const prev = steps[i - 1]?.count ?? 0;
  const curr = steps[i]?.count ?? 0;
  if (prev <= 0) return null;
  return Math.round(((prev - curr) / prev) * 1000) / 10;
}

function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  // Bars are scaled against the top-of-funnel step (the largest cohort).
  const topCount = Math.max(steps[0]?.count ?? 0, 1);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const drop = computeDrop(steps, i);
        const widthPct = Math.max((s.count / topCount) * 100, 1.5);
        return (
          <div key={`${i}-${s.label}`}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-white/80">
                <span className="mr-2 tabular-nums text-white/30">{i + 1}.</span>
                {s.label}
              </span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="font-medium text-white">{s.count}</span>
                {drop != null && (
                  <span className={`text-xs ${dropTextColor(drop)}`}>
                    -{drop.toFixed(1)}% drop
                  </span>
                )}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all ${dropColor(drop)}`}
                style={{ width: `${Math.min(widthPct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WebFunnelSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<WebFunnelResponse | null>(null);
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
    const url = `/api/admin/mri?section=web-funnel&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as WebFunnelResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load web funnel",
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

  const steps: FunnelStep[] = data?.steps ?? [];

  // In-app vs regular browser split, only if the payload carries it.
  const split = (data as (WebFunnelResponse & { browserSplit?: BrowserSplit }) | null)
    ?.browserSplit;
  const inAppSteps: FunnelStep[] = split?.inApp ?? [];
  const regularSteps: FunnelStep[] = split?.regular ?? [];
  const hasSplit = inAppSteps.length > 0 || regularSteps.length > 0;

  return (
    <div ref={containerRef} className="space-y-4">
      <ChartCard title="Web Funnel">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : steps.length === 0 ? (
          <p className="text-sm text-white/40">No web funnel data in this range.</p>
        ) : (
          <FunnelBars steps={steps} />
        )}
      </ChartCard>

      {hasSplit && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="In-App Browser">
            {inAppSteps.length === 0 ? (
              <p className="text-sm text-white/40">No in-app-browser sessions.</p>
            ) : (
              <FunnelBars steps={inAppSteps} />
            )}
          </ChartCard>
          <ChartCard title="Regular Browser">
            {regularSteps.length === 0 ? (
              <p className="text-sm text-white/40">No regular-browser sessions.</p>
            ) : (
              <FunnelBars steps={regularSteps} />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
