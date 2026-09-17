"use client";

import { useCallback, useEffect, useState } from "react";

import { SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";

/**
 * Competitors — manage the accounts the nightly Apify scrape tracks
 * and browse the outlier feed + Claude mimic briefs that feed the
 * content factory's "muse" lanes (2026-09-17 Trends section).
 */

interface Account {
  id: string;
  handle: string;
  platform: string;
  brand: string;
  niche: string | null;
  status: string;
  lastScrapedAt: string | null;
  scrapeError: string | null;
  _count: { posts: number };
}

interface Brief {
  hook?: string;
  format?: string;
  whyItWorks?: string;
  howWeApply?: string;
  phrases?: string[];
}

interface Outlier {
  id: string;
  url: string;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string | null;
  outlierScore: number;
  brief: Brief | null;
  briefAt: string | null;
  mandatedAt: string | null;
  account: { handle: string; platform: string; brand: string };
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

export default function CompetitorsTab() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [outliers, setOutliers] = useState<Outlier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeQueued, setScrapeQueued] = useState(false);
  const [openBrief, setOpenBrief] = useState<string | null>(null);

  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [brand, setBrand] = useState("ripple");
  const [niche, setNiche] = useState("");

  const load = useCallback(() => {
    setError(null);
    fetch("/api/admin/trends/competitors")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
      )
      .then((json) => {
        setAccounts(json.accounts ?? []);
        setOutliers(json.outliers ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error && !accounts) return <TabError message={error} onRetry={load} />;

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trends/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, platform, brand, niche }),
      });
      if (res.ok) {
        setHandle("");
        setNiche("");
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const patchAccount = async (id: string, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/admin/trends/competitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (id: string, label: string) => {
    if (!window.confirm(`Remove @${label} and all its scraped posts?`)) return;
    setBusy(true);
    try {
      await fetch("/api/admin/trends/competitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

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
      {/* ── Add handle ──────────────────────────────────────────── */}
      <section className="neo-glass neo-edge rounded-acuity-lg p-5 shadow-acuity-soft">
        <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
          Track a new account
        </h3>
        <form
          onSubmit={addAccount}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">Handle</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:border-acuity-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text focus:border-acuity-primary focus:outline-none"
            >
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">Brand</span>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text focus:border-acuity-primary focus:outline-none"
            >
              <option value="ripple">Ripple</option>
              <option value="bwk">BWK</option>
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[11px] text-acuity-text-quiet">
              Niche (optional)
            </span>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. midlife women self-care"
              className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:border-acuity-primary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !handle.trim()}
            className="rounded-acuity-md bg-acuity-primary-soft px-4 py-2 text-sm font-medium text-acuity-primary-hi transition hover:opacity-90 disabled:opacity-40"
            style={{
              boxShadow:
                "inset 0 0 0 1px color-mix(in oklch, var(--acuity-primary), transparent 55%)",
            }}
          >
            Track
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
          The pipeline scrapes every active account nightly at 3:30 UTC,
          flags outliers (&ge;3&times; the account&apos;s median views), and writes a
          mimic brief for each new outlier. Briefs feed the muse lanes
          automatically.
        </p>
      </section>

      {/* ── Accounts ────────────────────────────────────────────── */}
      <section className="neo-glass rounded-acuity-lg shadow-acuity-soft">
        <header className="border-b border-acuity-line px-5 py-3.5">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
            Tracked accounts
          </h3>
        </header>
        <div className="overflow-x-auto p-5">
          {!accounts ? (
            <SkeletonTable />
          ) : accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              Nothing tracked yet — add a handle above.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-acuity-line font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                  <th className="pb-2 pr-4 font-medium">Handle</th>
                  <th className="pb-2 pr-4 font-medium">Platform</th>
                  <th className="pb-2 pr-4 font-medium">Brand</th>
                  <th className="pb-2 pr-4 font-medium">Niche</th>
                  <th className="pb-2 pr-4 text-right font-medium">Posts</th>
                  <th className="pb-2 pr-4 font-medium">Last scrape</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-acuity-line last:border-0 ${
                      a.status === "PAUSED" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-acuity-text">
                      @{a.handle}
                    </td>
                    <td className="py-2.5 pr-4 text-acuity-text-sec">
                      {a.platform}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[11px] text-acuity-secondary-hi">
                        {BRAND_LABELS[a.brand] ?? a.brand}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate py-2.5 pr-4 text-acuity-text-ter">
                      {a.niche ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-acuity-text-sec tabular-nums">
                      {a._count.posts}
                    </td>
                    <td className="py-2.5 pr-4">
                      {a.scrapeError ? (
                        <span
                          className="text-[12px] text-acuity-bad"
                          title={a.scrapeError}
                        >
                          failed
                        </span>
                      ) : a.lastScrapedAt ? (
                        <span className="text-[12px] text-acuity-text-ter">
                          {new Date(a.lastScrapedAt).toLocaleDateString()}
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
                            patchAccount(a.id, {
                              status:
                                a.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                            })
                          }
                          disabled={busy}
                          className="text-acuity-primary hover:underline disabled:opacity-50"
                        >
                          {a.status === "ACTIVE" ? "pause" : "resume"}
                        </button>
                        <button
                          onClick={() => deleteAccount(a.id, a.handle)}
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

      {/* ── Outlier feed ────────────────────────────────────────── */}
      <section className="neo-glass rounded-acuity-lg shadow-acuity-soft">
        <header className="border-b border-acuity-line px-5 py-3.5">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
            Outlier feed (30 days)
          </h3>
        </header>
        <div className="p-5">
          {!accounts ? (
            <SkeletonTable />
          ) : outliers.length === 0 ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              No outliers yet. They appear after the first scrape of an
              account with a breakout post.
            </p>
          ) : (
            <ul className="space-y-4">
              {outliers.map((o) => {
                const isOpen = openBrief === o.id;
                return (
                  <li
                    key={o.id}
                    className="rounded-acuity-md border border-acuity-line bg-acuity-bg-inset p-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <span
                        className="neo-glow-cyan mt-0.5 shrink-0 font-mono text-[14px] font-bold text-acuity-primary tabular-nums"
                        title="views ÷ account median"
                      >
                        {o.outlierScore.toFixed(1)}x
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-acuity-text">
                          {o.caption
                            ? o.caption.length > 160
                              ? `${o.caption.slice(0, 160)}…`
                              : o.caption
                            : "(no caption)"}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                          @{o.account.handle} · {o.account.platform} ·{" "}
                          {BRAND_LABELS[o.account.brand] ?? o.account.brand} ·{" "}
                          {compact(o.views)} views · {compact(o.likes)} likes
                          {o.mandatedAt ? " · used by muse lane" : ""}
                        </p>
                      </div>
                      <span className="flex shrink-0 gap-3 text-[12px]">
                        {o.brief && (
                          <button
                            onClick={() =>
                              setOpenBrief(isOpen ? null : o.id)
                            }
                            className="text-acuity-secondary-hi hover:underline"
                          >
                            {isOpen ? "hide brief" : "mimic brief"}
                          </button>
                        )}
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-acuity-primary hover:underline"
                        >
                          open
                        </a>
                      </span>
                    </div>

                    {isOpen && o.brief && (
                      <div className="mt-3 space-y-2 border-t border-acuity-line pt-3 text-[13px]">
                        {o.brief.hook && (
                          <p>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                              Hook{" "}
                            </span>
                            <span className="text-acuity-text">
                              {o.brief.hook}
                            </span>
                          </p>
                        )}
                        {o.brief.format && (
                          <p>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                              Format{" "}
                            </span>
                            <span className="text-acuity-text-sec">
                              {o.brief.format}
                            </span>
                          </p>
                        )}
                        {o.brief.whyItWorks && (
                          <p>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                              Why it works{" "}
                            </span>
                            <span className="text-acuity-text-sec">
                              {o.brief.whyItWorks}
                            </span>
                          </p>
                        )}
                        {o.brief.howWeApply && (
                          <p>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                              How we run it{" "}
                            </span>
                            <span className="text-acuity-text-sec">
                              {o.brief.howWeApply}
                            </span>
                          </p>
                        )}
                        {o.brief.phrases && o.brief.phrases.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {o.brief.phrases.map((p, i) => (
                              <span
                                key={i}
                                className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[11px] text-acuity-secondary-hi"
                              >
                                &ldquo;{p}&rdquo;
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
