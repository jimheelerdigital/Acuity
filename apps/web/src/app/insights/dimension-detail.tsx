"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoodIcon } from "@/components/mood-icon";

import { RecordSheet } from "@/components/record-sheet";

type DimensionDetail = {
  dimension: {
    key: string;
    name: string;
    enum: string;
    icon: string;
    color: string;
  };
  score: number;
  baseline: number;
  change: number;
  trajectory: { date: string; score: number }[];
  whatsDriving: string;
  topThemes: { theme: string; count: number; sentiment: string }[];
  recentEntries: {
    id: string;
    createdAt: string;
    mood: string | null;
    excerpt: string;
  }[];
  relatedGoals: {
    id: string;
    title: string;
    status: string;
    progress: number;
  }[];
  reflectionPrompt: string;
};

/**
 * Modal drill-down for a single Life Matrix dimension. Opens when the
 * user clicks a dimension's score card on /insights. Click-outside or
 * Escape dismisses. Fetches from /api/lifemap/dimension/[key], which
 * is cached server-side for an hour — so repeated opens of the same
 * dimension are instant.
 */
export function DimensionDetailModal({
  dimensionKey,
  onClose,
}: {
  dimensionKey: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DimensionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/lifemap/dimension/${encodeURIComponent(dimensionKey)}`
        );
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json = (await res.json()) as DimensionDetail;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't load this dimension right now."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dimensionKey]);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 dark:border-white/5 bg-white/95 dark:bg-[#1E1E2E]/95 backdrop-blur px-5 py-3">
          <div className="flex items-center gap-2">
            {data && (
              <>
                <span
                  className="block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: data.dimension.color }}
                />
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {data.dimension.name}
                </h2>
              </>
            )}
            {loading && !data && (
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                Loading…
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && !data && (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
          </div>
        )}
        {error && (
          <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {error}
          </div>
        )}
        {data && (
          <div className="px-5 py-5 space-y-5">
            {/* Score hero */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-zinc-900 dark:text-zinc-50">
                  {data.score}
                </span>
                <span className="text-base text-zinc-400 dark:text-zinc-500">
                  /100
                </span>
                <span
                  className={`ml-2 text-sm font-medium ${
                    data.change > 0
                      ? "text-emerald-600"
                      : data.change < 0
                        ? "text-red-500"
                        : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {data.change > 0 ? "+" : ""}
                  {data.change} vs baseline
                </span>
              </div>
            </div>

            {/* Trajectory sparkline */}
            {data.trajectory.length > 1 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Last 30 days
                </p>
                <Sparkline
                  points={data.trajectory.map((p) => p.score)}
                  color={data.dimension.color}
                />
              </div>
            )}

            {/* What's driving this */}
            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: data.dimension.color + "15" }}
            >
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: data.dimension.color }}
              >
                What's driving this
              </p>
              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                {data.whatsDriving}
              </p>
            </div>

            {/* Two-column grid: themes + entries | goals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Top themes + Recent entries */}
              <div className="space-y-5">
                {data.topThemes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Top themes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topThemes.map((t) => (
                        <span
                          key={t.theme}
                          className="rounded-full px-3 py-1 text-xs text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5"
                          style={{
                            backgroundColor:
                              t.sentiment === "POSITIVE"
                                ? "rgba(34,197,94,0.14)"
                                : t.sentiment === "NEGATIVE"
                                  ? "rgba(239,68,68,0.14)"
                                  : "rgba(161,161,170,0.14)",
                          }}
                        >
                          {t.theme}
                          {t.count > 0 && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              {t.count}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.recentEntries.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Recent entries
                    </p>
                    <ul className="space-y-2">
                      {data.recentEntries.map((e) => {
                        const when = new Date(e.createdAt);
                        const day = when.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                        return (
                          <li
                            key={e.id}
                            className="rounded-xl border border-zinc-200 dark:border-white/10 p-3"
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <MoodIcon
                                mood={e.mood ?? "NEUTRAL"}
                                size={14}
                                className="text-zinc-500 dark:text-zinc-400"
                              />
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                {day}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                              {e.excerpt || "(no summary yet)"}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {/* Related goals */}
              {data.relatedGoals.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Goals in this area
                  </p>
                  <ul className="space-y-2">
                    {data.relatedGoals.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-xl border border-zinc-200 dark:border-white/10 p-3"
                      >
                        <Link
                          href={`/goals/${g.id}`}
                          onClick={onClose}
                          className="block hover:text-violet-600 dark:hover:text-violet-400"
                        >
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            {g.title}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${g.progress}%`,
                                  backgroundColor: data.dimension.color,
                                }}
                              />
                            </div>
                            <span className="tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500">
                              {g.progress}%
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Reflection prompt */}
            <div className="rounded-2xl border border-violet-500/30 bg-violet-50 dark:bg-violet-950/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                Worth reflecting on
              </p>
              <p className="mb-3 text-base leading-relaxed text-zinc-900 dark:text-zinc-50">
                {data.reflectionPrompt}
              </p>
              {/* Opens the universal RecordSheet modal layered over
                  this one. Entry is tagged with dimensionContext so
                  the extraction prompt knows which area to anchor. */}
              <button
                type="button"
                onClick={() => setRecordOpen(true)}
                className="inline-block rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Record about this
              </button>
            </div>
          </div>
        )}
      </div>

      {data && (
        <RecordSheet
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          context={{
            type: "dimension",
            id: data.dimension.key,
            label: data.dimension.name,
            description: data.reflectionPrompt,
          }}
          onRecordComplete={() => {
            // Close the dimension modal too so the user lands back on
            // /insights; when they reopen the dimension a minute later
            // their new entry will already appear in "Recent entries".
            onClose();
          }}
        />
      )}
    </div>
  );
}

/**
 * Minimal SVG-free sparkline matching the mobile implementation. Bars
 * rather than a path — simpler, no recharts dependency here, good
 * enough for a glanceable trend inside a modal.
 */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);

  return (
    <div className="flex h-12 items-end gap-0.5">
      {points.map((score, i) => {
        const normalized = (score - min) / range;
        const height = 8 + normalized * 40;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height,
              backgroundColor: color,
              opacity: 0.35 + normalized * 0.65,
            }}
          />
        );
      })}
    </div>
  );
}
