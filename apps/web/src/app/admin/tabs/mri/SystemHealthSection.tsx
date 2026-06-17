"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import { SkeletonMetric } from "../../components/SkeletonCard";
import type { SystemHealthResponse } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

function fmtPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Stat card matching the dark admin theme. Red border when the metric is in a
// danger state so a glance at the row tells Jimmy what to fix.
function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-[#13131F] flex flex-col justify-between min-h-[120px] ${
        danger ? "ring-1 ring-red-500/60" : ""
      }`}
      style={{ padding: 22 }}
    >
      <p
        className="font-medium uppercase text-white/45"
        style={{ fontSize: 11, letterSpacing: "1.6px" }}
      >
        {label}
      </p>
      <div>
        <p
          className={`mt-3 font-medium ${danger ? "text-red-400" : "text-white"}`}
          style={{ fontSize: 32, letterSpacing: "-1px", lineHeight: 1.1 }}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
      </div>
    </div>
  );
}

export default function SystemHealthSection(_props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<SystemHealthResponse | null>(null);
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

  // system-health is current-state and ignores start/end. Poll every 60s once
  // the section is in view so Jimmy sees breakages without reloading.
  useEffect(() => {
    if (!inView) return;
    let cancelled = false;

    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      fetch("/api/admin/mri?section=system-health")
        .then(async (res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return (await res.json()) as SystemHealthResponse;
        })
        .then((json) => {
          if (cancelled) return;
          setData(json);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err instanceof Error ? err.message : "Failed to load system health",
          );
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    };

    load(true);
    const interval = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [inView]);

  const entryRate = data?.entrySuccessRate ?? 0;
  const aiRate = data?.aiCallSuccessRate ?? 0;
  const pipelineErrors = data?.pipelineErrorsLastHour ?? 0;
  const pastDue = data?.activePastDue ?? 0;

  return (
    <div ref={containerRef}>
      <ChartCard title="System Health">
        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonMetric key={i} />
            ))}
          </div>
        ) : error && !data ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label="Entry Success (24h)"
                value={fmtPct(entryRate)}
                sub={`${data?.entriesComplete24h ?? 0}/${data?.entriesTotal24h ?? 0} complete`}
                danger={entryRate < 90}
              />
              <StatCard
                label="AI Success (24h)"
                value={fmtPct(aiRate)}
                sub={`${data?.aiCallsSuccess24h ?? 0}/${data?.aiCallsTotal24h ?? 0} calls`}
                danger={aiRate < 90}
              />
              <StatCard
                label="Pipeline Errors (1h)"
                value={pipelineErrors}
                sub="Failed generation jobs"
                danger={pipelineErrors > 0}
              />
              <StatCard
                label="Active PAST_DUE"
                value={pastDue}
                sub="Users with failed payment"
                danger={pastDue > 0}
              />
              <StatCard
                label="Last Signup"
                value={fmtRelative(data?.lastSuccessfulSignup ?? null)}
                sub={
                  data?.lastSuccessfulSignup
                    ? new Date(data.lastSuccessfulSignup).toLocaleString()
                    : "no signups yet"
                }
              />
            </div>
            {error && (
              <p className="mt-3 text-xs text-red-400">
                Refresh failed: {error}
              </p>
            )}
          </>
        )}
      </ChartCard>
    </div>
  );
}
