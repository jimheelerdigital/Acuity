"use client";

import { useCallback, useEffect, useState } from "react";

import { SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";

/**
 * Top Videos — watch TikTok hashtags per brand and surface the top 3
 * performing recent videos each day, with links, so Keenan can
 * recreate them as talking-head videos (2026-09-17 Trends section).
 * Scraped nightly at 3:30 UTC alongside the competitor scrape.
 */

interface Watch {
  id: string;
  tag: string;
  brand: string;
  status: string;
  lastScrapedAt: string | null;
  scrapeError: string | null;
  _count: { videos: number };
}

interface TopVideo {
  id: string;
  url: string;
  tag: string;
  authorHandle: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string | null;
}

const BRAND_LABELS: Record<string, string> = {
  ripple: "Ripple",
  bwk: "BWK",
};

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function daysAgo(iso: string | null): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

export default function TopVideosTab() {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [top, setTop] = useState<{ ripple: TopVideo[]; bwk: TopVideo[] }>({
    ripple: [],
    bwk: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeQueued, setScrapeQueued] = useState(false);

  const [tag, setTag] = useState("");
  const [brand, setBrand] = useState("bwk");

  const load = useCallback(() => {
    setError(null);
    fetch("/api/admin/trends/hashtags")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
      )
      .then((json) => {
        setWatches(json.watches ?? []);
        setTop(json.top ?? { ripple: [], bwk: [] });
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error && !watches) return <TabError message={error} onRetry={load} />;

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tag.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trends/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, brand }),
      });
      if (res.ok) {
        setTag("");
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const patchWatch = async (id: string, status: string) => {
    setBusy(true);
    try {
      await fetch("/api/admin/trends/hashtags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  const deleteWatch = async (id: string, label: string) => {
    if (!window.confirm(`Stop watching #${label} and drop its videos?`)) return;
    setBusy(true);
    try {
      await fetch("/api/admin/trends/hashtags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  // Same event as the competitor scrape — one nightly function does both.
  const scrapeNow = async () => {
    setScraping(true);
    try {
      const res = await fetch("/api/admin/trends/competitors/scrape", {
        method: "POST",
      });
      if (res.ok) setScrapeQueued(true);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top 3 per brand ─────────────────────────────────────── */}
      {(["bwk", "ripple"] as const).map((b) => (
        <section
          key={b}
          className="neo-glass neo-edge rounded-acuity-lg shadow-acuity-soft"
        >
          <header className="flex items-center justify-between border-b border-acuity-line px-5 py-3.5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
              {BRAND_LABELS[b]} — top 3 to recreate
            </h3>
            <span className="text-[11px] text-acuity-text-quiet">
              by views, recent posts, refreshed nightly
            </span>
          </header>
          <div className="p-5">
            {!watches ? (
              <SkeletonTable />
            ) : top[b].length === 0 ? (
              <p className="py-6 text-center text-sm text-acuity-text-ter">
                {watches.some((w) => w.brand === b)
                  ? "No videos yet — they appear after the next nightly scrape (or hit Scrape now below)."
                  : "No hashtags watched for this brand yet — add one below."}
              </p>
            ) : (
              <ol className="space-y-3">
                {top[b].map((v, i) => (
                  <li
                    key={v.id}
                    className="flex items-start gap-4 rounded-acuity-md border border-acuity-line bg-acuity-bg-inset p-4"
                  >
                    <span className="neo-glow-cyan mt-0.5 shrink-0 font-mono text-[16px] font-bold text-acuity-primary tabular-nums">
                      #{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-acuity-text">
                        {v.caption
                          ? v.caption.length > 160
                            ? `${v.caption.slice(0, 160)}…`
                            : v.caption
                          : "(no caption)"}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                        #{v.tag}
                        {v.authorHandle ? ` · @${v.authorHandle}` : ""} ·{" "}
                        {compact(v.views)} views · {compact(v.likes)} likes ·{" "}
                        {compact(v.shares)} shares
                        {v.postedAt ? ` · ${daysAgo(v.postedAt)}` : ""}
                      </p>
                    </div>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-acuity-md bg-acuity-primary-soft px-3 py-1.5 text-[12px] font-medium text-acuity-primary-hi transition hover:opacity-90"
                    >
                      watch ↗
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ))}

      {/* ── Watch a hashtag ─────────────────────────────────────── */}
      <section className="neo-glass neo-edge rounded-acuity-lg p-5 shadow-acuity-soft">
        <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
          Watch a hashtag
        </h3>
        <form onSubmit={addTag} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">Hashtag</span>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="#selfdiscipline"
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:border-acuity-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">Brand</span>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text focus:border-acuity-primary focus:outline-none"
            >
              <option value="bwk">BWK</option>
              <option value="ripple">Ripple</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !tag.trim()}
            className="rounded-acuity-md bg-acuity-primary-soft px-4 py-2 text-sm font-medium text-acuity-primary-hi transition hover:opacity-90 disabled:opacity-40"
            style={{
              boxShadow:
                "inset 0 0 0 1px color-mix(in oklch, var(--acuity-primary), transparent 55%)",
            }}
          >
            Watch
          </button>
          <button
            type="button"
            onClick={scrapeNow}
            disabled={scraping || scrapeQueued}
            className="rounded-acuity-md border border-acuity-line px-4 py-2 text-sm text-acuity-text-sec transition hover:border-acuity-line-strong hover:text-acuity-text disabled:opacity-50"
          >
            {scrapeQueued
              ? "Scrape queued ✓"
              : scraping
                ? "Queuing…"
                : "Scrape now"}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-acuity-text-quiet">
          TikTok only. Every active hashtag is scraped nightly at 3:30 UTC;
          the panels above rank recent videos by views so the same old
          mega-video doesn&apos;t sit at #1 forever. &ldquo;Scrape now&rdquo;
          also refreshes competitor accounts.
        </p>
      </section>

      {/* ── Watched hashtags ────────────────────────────────────── */}
      <section className="neo-glass rounded-acuity-lg shadow-acuity-soft">
        <header className="border-b border-acuity-line px-5 py-3.5">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
            Watched hashtags
          </h3>
        </header>
        <div className="overflow-x-auto p-5">
          {!watches ? (
            <SkeletonTable />
          ) : watches.length === 0 ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              Nothing watched yet — add a hashtag above.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-acuity-line font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                  <th className="pb-2 pr-4 font-medium">Hashtag</th>
                  <th className="pb-2 pr-4 font-medium">Brand</th>
                  <th className="pb-2 pr-4 text-right font-medium">Videos</th>
                  <th className="pb-2 pr-4 font-medium">Last scrape</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {watches.map((w) => (
                  <tr
                    key={w.id}
                    className={`border-b border-acuity-line last:border-0 ${
                      w.status === "PAUSED" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-acuity-text">
                      #{w.tag}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[11px] text-acuity-secondary-hi">
                        {BRAND_LABELS[w.brand] ?? w.brand}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-acuity-text-sec tabular-nums">
                      {w._count.videos}
                    </td>
                    <td className="py-2.5 pr-4">
                      {w.scrapeError ? (
                        <span
                          className="text-[12px] text-acuity-bad"
                          title={w.scrapeError}
                        >
                          failed
                        </span>
                      ) : w.lastScrapedAt ? (
                        <span className="text-[12px] text-acuity-text-ter">
                          {new Date(w.lastScrapedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-[12px] text-acuity-text-quiet">
                          never
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className="flex gap-3 text-[12px]">
                        <button
                          onClick={() =>
                            patchWatch(
                              w.id,
                              w.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
                            )
                          }
                          disabled={busy}
                          className="text-acuity-primary hover:underline disabled:opacity-50"
                        >
                          {w.status === "ACTIVE" ? "pause" : "resume"}
                        </button>
                        <button
                          onClick={() => deleteWatch(w.id, w.tag)}
                          disabled={busy}
                          className="text-acuity-bad hover:underline disabled:opacity-50"
                        >
                          remove
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
