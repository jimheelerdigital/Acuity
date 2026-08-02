"use client";

import { useCallback, useEffect, useState } from "react";

interface PrunerRun {
  id: string;
  runDate: string;
  postId: string;
  postUrl: string | null;
  postSlug: string | null;
  daysSincePublish: number;
  coverageState: string | null;
  impressions: number;
  clicks: number;
  recommendedAction: string;
  wouldTrimAt: string | null;
  actualActionTaken: string | null;
  isDryRun: boolean;
  runStatus: string;
}

const ACTION_COLORS: Record<string, string> = {
  trim: "bg-acuity-bad-soft text-acuity-bad",
  improve: "bg-acuity-warn-soft text-acuity-warn",
  consolidate: "bg-acuity-secondary-soft text-acuity-secondary",
  keep: "bg-acuity-good-soft text-acuity-good",
  unknown: "bg-gray-500/20 text-acuity-text-ter",
  none: "bg-gray-500/20 text-acuity-text-ter",
};

export default function BlogPrunerLogPage() {
  const [runs, setRuns] = useState<PrunerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "would_trim">("all");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "would_trim" ? "?filter=would_trim" : "";
      const res = await fetch(`/api/admin/blog-pruner-log${params}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Blog Pruner Log</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                filter === "all"
                  ? "bg-acuity-bg-inset text-white"
                  : "text-acuity-text-ter hover:text-acuity-text-sec"
              }`}
            >
              All Evaluations
            </button>
            <button
              onClick={() => setFilter("would_trim")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                filter === "would_trim"
                  ? "bg-acuity-bad-soft text-acuity-bad"
                  : "text-acuity-text-ter hover:text-acuity-text-sec"
              }`}
            >
              Would Trim (Dry Run)
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-acuity-text-ter text-center py-12">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="text-acuity-text-ter text-center py-12">
            <p className="text-lg">No pruner runs in the last 30 days</p>
            <p className="text-sm mt-2">
              The pruner runs daily at 03:00 UTC. Check that BLOG_PRUNER_DRY_RUN
              is set and GSC credentials are configured.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-acuity-line text-acuity-text-ter">
                  <th className="text-left py-3 px-2">Run Date</th>
                  <th className="text-left py-3 px-2">Post</th>
                  <th className="text-right py-3 px-2">Days</th>
                  <th className="text-left py-3 px-2">Coverage State</th>
                  <th className="text-right py-3 px-2">Imp.</th>
                  <th className="text-right py-3 px-2">Clicks</th>
                  <th className="text-left py-3 px-2">Recommendation</th>
                  <th className="text-left py-3 px-2">Action Taken</th>
                  <th className="text-left py-3 px-2">Mode</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-acuity-line hover:bg-acuity-bg-inset"
                  >
                    <td className="py-2 px-2 text-acuity-text-sec">
                      {new Date(run.runDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-2 px-2 max-w-[200px] truncate">
                      {run.postSlug ?? run.postId}
                    </td>
                    <td className="py-2 px-2 text-right text-acuity-text-sec">
                      {run.daysSincePublish}
                    </td>
                    <td className="py-2 px-2">
                      <span className="text-xs font-mono text-acuity-text-ter">
                        {run.coverageState ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-acuity-text-sec">
                      {run.impressions}
                    </td>
                    <td className="py-2 px-2 text-right text-acuity-text-sec">
                      {run.clicks}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          ACTION_COLORS[run.recommendedAction] ?? ACTION_COLORS.unknown
                        }`}
                      >
                        {run.recommendedAction}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-acuity-text-ter text-xs">
                      {run.actualActionTaken ?? (run.isDryRun ? "—" : "pending")}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={`text-xs ${
                          run.isDryRun ? "text-acuity-warn" : "text-acuity-good"
                        }`}
                      >
                        {run.isDryRun ? "dry run" : "live"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 p-4 rounded-lg bg-acuity-bg-inset text-acuity-text-ter text-xs">
          <p>
            <strong>BLOG_PRUNER_DRY_RUN</strong> is currently{" "}
            <span className="text-acuity-warn">defaulting to true</span> (safe
            mode). Set to &quot;false&quot; in Vercel env vars after reviewing
            dry-run results to enable live trimming.
          </p>
          <p className="mt-1">
            Dry-run flip date: <strong>2026-05-18</strong> (14 days from deploy).
          </p>
        </div>
      </div>
    </div>
  );
}
