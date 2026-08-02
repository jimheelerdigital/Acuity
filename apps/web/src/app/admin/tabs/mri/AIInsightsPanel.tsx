"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Insight } from "@/lib/mri/types";

/** Shape of an AdminInsight row as returned by /api/admin/mri/insights. */
interface InsightRow {
  id: string;
  generatedAt: string;
  insights: Insight[];
  summary: string;
  modelUsed: string;
  costCents: number;
  rangeUsed: string;
  generatedBy: string | null;
}

const SEVERITY: Record<
  Insight["severity"],
  { icon: string; border: string; label: string }
> = {
  critical: { icon: "🚨", border: "var(--acuity-bad)", label: "Critical" },
  warning: { icon: "⚠️", border: "var(--acuity-warn)", label: "Warning" },
  info: { icon: "ℹ️", border: "var(--acuity-secondary)", label: "Info" },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  return `${Math.round(hr / 24)} day${Math.round(hr / 24) === 1 ? "" : "s"} ago`;
}

export default function AIInsightsPanel() {
  const [row, setRow] = useState<InsightRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const seededRef = useRef(false);

  const loadLatest = useCallback(async (): Promise<InsightRow | null> => {
    const res = await fetch("/api/admin/mri/insights");
    if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);
    return (await res.json()) as InsightRow | null;
  }, []);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mri/insights?regenerate=true");
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { retryAfter?: number } | null;
        setRetryAfter(body?.retryAfter ?? 300);
        return;
      }
      if (!res.ok) throw new Error(`Regenerate failed (${res.status})`);
      setRow((await res.json()) as InsightRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }, []);

  // Initial load. If no insight exists yet, seed one + poll every 10s.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const latest = await loadLatest();
        if (cancelled) return;
        if (latest) {
          setRow(latest);
          setLoading(false);
          return;
        }
        // None yet — seed one (fire-and-forget) and poll until it lands.
        setLoading(false);
        if (!seededRef.current) {
          seededRef.current = true;
          void fetch("/api/admin/mri/insights?regenerate=true").catch(() => {});
        }
        poll = setInterval(async () => {
          try {
            const r = await loadLatest();
            if (!cancelled && r) {
              setRow(r);
              if (poll) clearInterval(poll);
            }
          } catch {
            /* keep polling */
          }
        }, 10000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load insights");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, [loadLatest]);

  // Count down the rate-limit timer.
  useEffect(() => {
    if (retryAfter == null || retryAfter <= 0) return;
    const t = setInterval(() => {
      setRetryAfter((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [retryAfter]);

  const stale = row ? Date.now() - new Date(row.generatedAt).getTime() > 6 * 3600_000 : false;

  return (
    <div
      className="rounded-acuity-lg border p-5"
      style={{ borderColor: "var(--acuity-primary-soft)", background: "var(--acuity-card-bg)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-acuity-text">🧠 AI Insights</span>
          {row && (
            <span className="text-xs text-acuity-text-ter">
              Generated {relativeTime(row.generatedAt)} · ${(row.costCents / 100).toFixed(2)} ·{" "}
              {row.modelUsed}
            </span>
          )}
          {stale && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--acuity-warn-soft)", color: "var(--acuity-warn)" }}
            >
              Stale
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={regenerating || retryAfter != null}
          className="rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          style={{ background: "var(--acuity-primary)", color: "var(--acuity-text)" }}
        >
          {regenerating
            ? "Generating…"
            : retryAfter != null
              ? `Wait ${retryAfter}s`
              : "Regenerate"}
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--acuity-bad)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-acuity-text-ter">Loading insights…</p>
      ) : !row ? (
        <p className="text-sm text-acuity-text-ter">
          Generating first insight… this can take ~30–60s. The panel updates automatically.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm leading-relaxed text-acuity-text-sec">{row.summary}</p>
          <div className="flex flex-col gap-3">
            {row.insights.map((ins, i) => {
              const sev = SEVERITY[ins.severity] ?? SEVERITY.info;
              return (
                <div
                  key={i}
                  className="rounded-lg p-4"
                  style={{
                    borderLeft: `3px solid ${sev.border}`,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span>{sev.icon}</span>
                    <span className="text-sm font-semibold text-acuity-text">{ins.title}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                      {ins.category}
                      {ins.affectedUserCount != null
                        ? ` · ${ins.affectedUserCount} users`
                        : ""}
                    </span>
                  </div>
                  <p className="text-xs text-acuity-text-ter">{ins.evidence}</p>
                  <p className="mt-2 text-xs text-acuity-text-sec">
                    <span className="font-medium text-acuity-text-ter">Action: </span>
                    {ins.recommendedAction}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
