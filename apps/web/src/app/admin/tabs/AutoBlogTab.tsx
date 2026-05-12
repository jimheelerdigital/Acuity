"use client";

import { useCallback, useEffect, useState } from "react";

interface TopicQueueStats {
  queued: number;
  inProgress: number;
  published: number;
  skipped: number;
}

interface RecentPost {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  publishedAt: string | null;
  distributedUrl: string | null;
  impressions: number;
  clicks: number;
  lastGscSyncAt: string | null;
  targetKeyword: string | null;
  createdAt: string;
}

interface PruneLogEntry {
  id: string;
  contentPieceId: string;
  prunedAt: string;
  reason: string;
  impressions: number;
  clicks: number;
  redirectedToSlug: string | null;
}

interface IndexingHealth {
  lastSuccess: { createdAt: string; url: string } | null;
  recentFailures: number;
}

interface AutoBlogData {
  topicQueue: TopicQueueStats;
  recentPosts: RecentPost[];
  pruneLogs: PruneLogEntry[];
  indexingHealth: IndexingHealth;
  stats: { totalPublished: number; totalPruned: number };
}

const STATUS_COLORS: Record<string, string> = {
  AUTO_PUBLISHED: "bg-emerald-500/20 text-emerald-400",
  PRUNED_DAY7: "bg-red-500/20 text-red-400",
  PRUNED_DAY30: "bg-orange-500/20 text-orange-400",
  PRUNED_DAY90: "bg-amber-500/20 text-amber-400",
  GENERATION_FAILED: "bg-red-500/20 text-red-300",
};

export default function AutoBlogTab() {
  const [data, setData] = useState<AutoBlogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [killingId, setKillingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [regenImageId, setRegenImageId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [fixingYears, setFixingYears] = useState(false);
  const [fixYearsResult, setFixYearsResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auto-blog-data");
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      await fetch("/api/admin/auto-blog/generate-now", { method: "POST" });
      // Refresh after a short delay
      setTimeout(fetchData, 3000);
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  };

  const handleKill = async (pieceId: string) => {
    setKillingId(pieceId);
    try {
      await fetch("/api/admin/auto-blog/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId }),
      });
      fetchData();
    } catch {
      // silent
    } finally {
      setKillingId(null);
    }
  };

  const handleRegenImage = async (pieceId: string) => {
    setRegenImageId(pieceId);
    try {
      const res = await fetch("/api/admin/blog/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Regen failed:", err);
      }
      fetchData();
    } catch {
      // silent
    } finally {
      setRegenImageId(null);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/blog/backfill-images", { method: "POST" });
      const data = await res.json();
      setBackfillResult(data.message || "Done");
      fetchData();
    } catch {
      setBackfillResult("Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const handleFixYears = async () => {
    setFixingYears(true);
    setFixYearsResult(null);
    try {
      const res = await fetch("/api/admin/blog/fix-years", { method: "POST" });
      const data = await res.json();
      if (data.updated > 0) {
        setFixYearsResult(
          `Fixed year references in ${data.updated} of ${data.candidates} candidates (${data.scanned} scanned)`
        );
      } else {
        setFixYearsResult(data.message || "No outdated year references found.");
      }
      fetchData();
    } catch {
      setFixYearsResult("Fix years failed");
    } finally {
      setFixingYears(false);
    }
  };

  const handleRetry = async (pieceId: string) => {
    setRetryingId(pieceId);
    try {
      await fetch("/api/admin/auto-blog/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId }),
      });
      fetchData();
    } catch {
      // silent
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#7C5CFC]" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        Failed to load auto-blog data
      </p>
    );
  }

  const { topicQueue, recentPosts, pruneLogs, indexingHealth, stats } = data;

  return (
    <div className="space-y-8">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Auto Blog</h2>
          <p className="text-sm text-zinc-400">
            {stats.totalPublished} published, {stats.totalPruned} pruned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFixYears}
            disabled={fixingYears}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:text-white hover:border-white/20 disabled:opacity-50"
          >
            {fixingYears ? "Fixing..." : "Fix Year References"}
          </button>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:text-white hover:border-white/20 disabled:opacity-50"
          >
            {backfilling ? "Backfilling..." : "Backfill Missing Images"}
          </button>
          <button
            onClick={handleGenerateNow}
            disabled={generating}
            className="rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Now"}
          </button>
        </div>
      </div>

      {/* Action results */}
      {fixYearsResult && (
        <div className="rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-4 py-2 text-sm text-[#7C5CFC]">
          {fixYearsResult}
        </div>
      )}
      {backfillResult && (
        <div className="rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-4 py-2 text-sm text-[#7C5CFC]">
          {backfillResult}
        </div>
      )}

      {/* Topic Queue */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Topic Queue</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-emerald-400">
              {topicQueue.queued}
            </p>
            <p className="text-xs text-zinc-500">Queued</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-400">
              {topicQueue.inProgress}
            </p>
            <p className="text-xs text-zinc-500">In Progress</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">
              {topicQueue.published}
            </p>
            <p className="text-xs text-zinc-500">Published</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-500">
              {topicQueue.skipped}
            </p>
            <p className="text-xs text-zinc-500">Skipped</p>
          </div>
        </div>
      </div>

      {/* GSC + Indexing Health */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">
          Google API Health
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Last successful index ping</span>
            <span className="text-zinc-200">
              {indexingHealth.lastSuccess
                ? new Date(
                    indexingHealth.lastSuccess.createdAt
                  ).toLocaleDateString()
                : "Never"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">
              Indexing failures (last 7 days)
            </span>
            <span
              className={
                indexingHealth.recentFailures > 0
                  ? "text-red-400"
                  : "text-emerald-400"
              }
            >
              {indexingHealth.recentFailures}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Posts */}
      <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">
          Recent Auto-Blog Posts
        </h3>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-zinc-500">No auto-published posts yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Published</th>
                  <th className="pb-2 pr-4 text-right">Imp</th>
                  <th className="pb-2 pr-4 text-right">Clicks</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-white/5"
                  >
                    <td className="py-2 pr-4">
                      <div className="max-w-xs truncate text-zinc-200">
                        {post.slug ? (
                          <a
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[#7C5CFC] hover:underline"
                          >
                            {post.title}
                          </a>
                        ) : (
                          post.title
                        )}
                      </div>
                      {post.targetKeyword && (
                        <p className="text-xs text-zinc-500">
                          {post.targetKeyword}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {post.impressions.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {post.clicks}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[post.status] ?? "bg-zinc-500/20 text-zinc-400"}`}
                      >
                        {post.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {post.status === "AUTO_PUBLISHED" && (
                          <>
                            <button
                              onClick={() => handleRegenImage(post.id)}
                              disabled={regenImageId === post.id}
                              className="rounded px-2 py-1 text-xs text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 disabled:opacity-50"
                            >
                              {regenImageId === post.id ? "..." : "Regen Image"}
                            </button>
                            <button
                              onClick={() => handleKill(post.id)}
                              disabled={killingId === post.id}
                              className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                            >
                              {killingId === post.id ? "..." : "Kill"}
                            </button>
                          </>
                        )}
                        {post.status === "GENERATION_FAILED" && (
                          <button
                            onClick={() => handleRetry(post.id)}
                            disabled={retryingId === post.id}
                            className="rounded px-2 py-1 text-xs text-amber-400 transition hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            {retryingId === post.id ? "..." : "Retry"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prune Log */}
      {pruneLogs.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Prune Log</h3>
          <div className="space-y-2">
            {pruneLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <div>
                  <span className="text-zinc-300">
                    {log.contentPieceId.slice(0, 8)}...
                  </span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {log.reason} — {log.impressions} imp, {log.clicks} clicks
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(log.prunedAt).toLocaleDateString()}
                  {log.redirectedToSlug && (
                    <span className="ml-2 text-zinc-400">
                      → /blog/{log.redirectedToSlug}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
