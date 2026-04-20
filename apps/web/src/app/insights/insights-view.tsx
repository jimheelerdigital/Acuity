"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PaywallBanner,
  parsePaywallResponse,
} from "@/components/paywall-redirect";

type Entry = {
  id: string;
  moodScore: number | null;
  mood: string | null;
  createdAt: string;
};

type Report = {
  id: string;
  weekStart: string;
  weekEnd: string;
  narrative: string | null;
  insightBullets: string[];
  moodArc: string | null;
  topThemes: string[];
  tasksOpened: number;
  tasksClosed: number;
  entryCount: number;
  status: string;
  createdAt: string;
};

const MOOD_COLORS: Record<string, string> = {
  GREAT: "#22C55E",
  GOOD: "#86EFAC",
  NEUTRAL: "#A1A1AA",
  LOW: "#FBBF24",
  ROUGH: "#EF4444",
};

export function InsightsView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<
    { message: string; redirect: string } | null
  >(null);

  const fetchData = useCallback(async () => {
    const [entriesRes, reportsRes] = await Promise.all([
      fetch("/api/entries?limit=7"),
      fetch("/api/weekly"),
    ]);

    if (entriesRes.ok) {
      const data = await entriesRes.json();
      setEntries(data.entries ?? []);
    }
    if (reportsRes.ok) {
      const data = await reportsRes.json();
      setReports(data.reports ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    setPaywall(null);
    try {
      const res = await fetch("/api/weekly", { method: "POST" });
      const paywallInfo = await parsePaywallResponse(res);
      if (paywallInfo) {
        setPaywall(paywallInfo);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Failed to generate report"
        );
        return;
      }

      // Two return shapes from /api/weekly:
      //   201 sync  → body is the completed report; refetch and done
      //   202 async → body has { reportId, status: "QUEUED" } — Inngest
      //               is synthesizing. Poll GET /api/weekly until the
      //               matching report has status: COMPLETE.
      // Prior to this commit only the 201 path was handled, so when
      // ENABLE_INNGEST_PIPELINE=1 the button appeared to "do nothing"
      // — generating flipped back to false while the QUEUED report sat
      // invisible behind the `status === "COMPLETE"` filter.
      if (res.status === 202) {
        const body = (await res.json().catch(() => ({}))) as {
          reportId?: string;
        };
        if (body.reportId) {
          await pollUntilComplete(body.reportId);
          return;
        }
      }
      await fetchData();
    } catch {
      setError("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Refetch reports every 5s until the targeted report transitions out
   * of QUEUED/GENERATING into a terminal state. Capped at 3 minutes so
   * a stuck Inngest run doesn't strand the user on a spinner forever.
   */
  const pollUntilComplete = async (reportId: string): Promise<void> => {
    const MAX_WAIT_MS = 3 * 60 * 1000;
    const INTERVAL_MS = 5_000;
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      try {
        const res = await fetch("/api/weekly");
        if (!res.ok) continue;
        const data = (await res.json()) as { reports?: Report[] };
        const report = (data.reports ?? []).find((r) => r.id === reportId);
        setReports(data.reports ?? []);
        // Also refresh entries so the mood-trend section stays live.
        const entriesRes = await fetch("/api/entries?limit=7");
        if (entriesRes.ok) {
          const e = await entriesRes.json();
          setEntries(e.entries ?? []);
        }
        if (!report) return;
        if (report.status === "COMPLETE") return;
        if (report.status === "FAILED") {
          setError("Weekly report generation failed. Try again in a minute.");
          return;
        }
      } catch {
        // transient — keep polling until the wall-clock budget is gone
      }
    }
    setError(
      "Still generating — your report will appear on this page when it's ready."
    );
  };

  const latestReport = reports.find((r) => r.status === "COMPLETE");
  const completedEntries = entries.filter((e) => e.moodScore != null);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  return (
    <>
      {paywall && (
        <PaywallBanner
          message={paywall.message}
          redirect={paywall.redirect}
          onClose={() => setPaywall(null)}
        />
      )}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Insights</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Patterns across your sessions.
        </p>
      </div>

      {/* Mood trend chart */}
      {completedEntries.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Mood trend — last {completedEntries.length} entries
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-5 py-5 shadow-sm">
            <div className="flex items-end gap-2 h-32">
              {completedEntries.map((entry) => {
                const score = entry.moodScore ?? 5;
                const heightPct = (score / 10) * 100;
                const color =
                  MOOD_COLORS[entry.mood ?? "NEUTRAL"] ?? MOOD_COLORS.NEUTRAL;
                const date = new Date(entry.createdAt).toLocaleDateString(
                  "en-US",
                  { weekday: "short" }
                );

                return (
                  <div
                    key={entry.id}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {score}
                    </span>
                    <div className="w-full flex items-end h-20">
                      <div
                        className="w-full rounded-t-md transition-all duration-700"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-8">
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-10 text-center">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              No mood data yet
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Record sessions to see your mood trend.
            </p>
          </div>
        </section>
      )}

      {/* Generate report button */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={generateReport}
          disabled={generating}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-zinc-900/10 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-zinc-300 dark:border-t-zinc-700" />
              Generating — usually under a minute…
            </span>
          ) : (
            "Generate Weekly Report"
          )}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Latest report */}
      {latestReport ? (
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Latest weekly report
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] overflow-hidden shadow-sm">
            {/* Report header */}
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(latestReport.weekStart).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}{" "}
                  —{" "}
                  {new Date(latestReport.weekEnd).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div className="flex gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>{latestReport.entryCount} entries</span>
                  <span>{latestReport.tasksOpened} tasks opened</span>
                  <span>{latestReport.tasksClosed} closed</span>
                </div>
              </div>
            </div>

            {/* Narrative */}
            {latestReport.narrative && (
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/5">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {latestReport.narrative}
                </p>
              </div>
            )}

            {/* Mood arc */}
            {latestReport.moodArc && (
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/5">
                <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-1">
                  Mood arc
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {latestReport.moodArc}
                </p>
              </div>
            )}

            {/* Insights */}
            {latestReport.insightBullets.length > 0 && (
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/5">
                <p className="text-xs font-medium text-violet-600 mb-2">
                  Insights
                </p>
                <ul className="space-y-1.5">
                  {latestReport.insightBullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="text-sm text-zinc-600 dark:text-zinc-300 flex gap-2"
                    >
                      <span className="text-violet-500 shrink-0">-</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top themes */}
            {latestReport.topThemes.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
                  Top themes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {latestReport.topThemes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full bg-zinc-100 dark:bg-white/10 px-2.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section>
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
            <div className="text-3xl mb-3">💡</div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              No weekly report yet
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Record at least 3 sessions, then hit &quot;Generate Weekly
              Report&quot;.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
