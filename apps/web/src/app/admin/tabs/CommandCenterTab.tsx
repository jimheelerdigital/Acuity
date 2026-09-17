"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import MetricCard from "../components/MetricCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonChart } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";
import { formatDollarsRounded } from "@/lib/pricing";

/**
 * Command Center — the admin home screen (2026-09-17 revamp).
 * Glanceable: business vitals up top (reusing the overview metrics
 * API), then the two research feeds that drive the content factory
 * (Reddit audience pulse + competitor outliers) side by side with the
 * top-performing content leaderboard. Deep dives live in their own
 * tabs; everything here links out.
 */

// Minimal slice of the overview payload — the full shape lives in
// OverviewTab; the Command Center only reads the hero numbers.
interface OverviewSlice {
  signups: number;
  prevSignups: number;
  wau?: number;
  conversionRate: number;
  prevConversionRate: number;
  aiSpendCents: number;
  signupsOverTime: { date: string; count: number }[];
  revenue?: {
    mrrCents: number;
    churnRate: number;
    trialUsers: number;
    margin?: { grossMarginPct: number };
  };
  redFlags?: {
    flags: {
      id: string;
      severity: string;
      category: string;
      title: string;
    }[];
  };
}

interface PulseTheme {
  theme: string;
  why?: string;
  angle?: string;
  phrases?: string[];
}

interface TrendsSummary {
  digests: {
    id: string;
    brand: string;
    date: string;
    themes: PulseTheme[];
  }[];
  topContent: {
    id: string;
    headline: string;
    lane: string | null;
    format: string;
    generatedFor: string;
    views: number | null;
    likes: number | null;
    saves: number | null;
    instagramUrl: string | null;
    tiktokUrl: string | null;
  }[];
  outliers: {
    id: string;
    url: string;
    caption: string | null;
    views: number;
    outlierScore: number;
    brief: { hook?: string; format?: string } | null;
    account: { handle: string; platform: string; brand: string };
  }[];
  accountCounts: { active: number; paused: number };
}

const BRAND_LABELS: Record<string, string> = {
  ripple: "Ripple",
  bwk: "BWK",
};

function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="neo-glass neo-edge rounded-acuity-lg shadow-acuity-soft">
      <header className="flex items-center justify-between gap-3 border-b border-acuity-line px-5 py-3.5">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
          {title}
        </h3>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TabLink({ tab, label }: { tab: string; label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/admin?tab=${tab}`)}
      className="rounded-acuity-pill border border-acuity-line px-3 py-1 text-[11px] font-medium text-acuity-primary transition hover:border-acuity-line-strong hover:bg-acuity-primary-soft"
    >
      {label} &rarr;
    </button>
  );
}

export default function CommandCenterTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const router = useRouter();
  const { data, loading, error, meta, refresh } = useTabData<OverviewSlice>(
    "overview",
    start,
    end
  );

  const [trends, setTrends] = useState<TrendsSummary | null>(null);
  const [trendsError, setTrendsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/trends/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!cancelled) setTrends(json);
      })
      .catch(() => {
        if (!cancelled) setTrendsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !data) return <TabError message={error} onRetry={refresh} />;

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  const rev = data.revenue;
  const flags = (data.redFlags?.flags ?? []).filter(
    (f) => f.category !== "trial"
  );
  const critical = flags.filter((f) => f.severity === "CRITICAL");
  const sparkline = (data.signupsOverTime ?? []).map((d) => ({ v: d.count }));

  return (
    <div className="space-y-6">
      {/* ── System status strip ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="neo-live-dot" />
          <span className="font-mono text-[11px] uppercase tracking-[1.6px] text-acuity-text-sec">
            {critical.length > 0 ? (
              <span className="text-acuity-bad">
                {critical.length} critical flag{critical.length === 1 ? "" : "s"}
              </span>
            ) : flags.length > 0 ? (
              <span className="text-acuity-warn">
                {flags.length} open flag{flags.length === 1 ? "" : "s"}
              </span>
            ) : (
              "All systems nominal"
            )}
          </span>
          {flags.length > 0 && (
            <button
              onClick={() => router.push("/admin?tab=growth-metrics")}
              className="text-[11px] text-acuity-primary hover:underline"
            >
              view
            </button>
          )}
        </div>
        <RefreshButton
          computedAt={meta?.computedAt ?? null}
          onRefresh={refresh}
          loading={loading}
        />
      </div>

      {/* ── Vitals ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="MRR"
          value={formatDollarsRounded(rev?.mrrCents ?? 0)}
        />
        <MetricCard
          label="New Signups"
          value={data.signups}
          currentValue={data.signups}
          previousValue={data.prevSignups}
          sparklineData={sparkline}
        />
        <MetricCard label="Active Users (Week)" value={data.wau ?? 0} />
        <MetricCard
          label="Trial → Paid"
          value={`${data.conversionRate}%`}
          currentValue={data.conversionRate}
          previousValue={data.prevConversionRate}
        />
        <MetricCard label="Churn" value={`${rev?.churnRate ?? 0}%`} />
        <MetricCard
          label="Claude Spend (MTD)"
          value={`$${(data.aiSpendCents / 100).toFixed(2)}`}
          budgetBar={{ current: data.aiSpendCents, max: 10000 }}
        />
      </div>

      {/* ── Research + performance feeds ────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Audience pulse */}
        <Panel
          title="Audience Pulse"
          action={<TabLink tab="pulse" label="Full pulse" />}
        >
          {trendsError ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              Couldn&apos;t load the pulse feed.
            </p>
          ) : !trends ? (
            <div className="h-40 animate-pulse rounded-acuity-md bg-acuity-bg-inset" />
          ) : trends.digests.length === 0 ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              No digest yet — the nightly scrape runs at 4:00 UTC.
            </p>
          ) : (
            <div className="space-y-5">
              {trends.digests.map((d) => (
                <div key={d.id}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-acuity-primary-hi">
                      {BRAND_LABELS[d.brand] ?? d.brand}
                    </span>
                    <span className="font-mono text-[10px] text-acuity-text-quiet">
                      {new Date(d.date).toLocaleDateString()}
                    </span>
                  </div>
                  <ol className="space-y-1.5">
                    {(d.themes ?? []).slice(0, 3).map((t, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="font-mono text-[11px] text-acuity-text-quiet tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="text-acuity-text">{t.theme}</span>
                          {t.angle && (
                            <span className="text-acuity-text-ter">
                              {" "}
                              — {t.angle}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Competitor feed */}
        <Panel
          title={`Competitor Signal${
            trends
              ? ` · ${trends.accountCounts.active} tracked`
              : ""
          }`}
          action={<TabLink tab="competitors" label="Manage" />}
        >
          {trendsError ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              Couldn&apos;t load the competitor feed.
            </p>
          ) : !trends ? (
            <div className="h-40 animate-pulse rounded-acuity-md bg-acuity-bg-inset" />
          ) : trends.outliers.length === 0 ? (
            <p className="py-6 text-center text-sm text-acuity-text-ter">
              {trends.accountCounts.active === 0
                ? "No accounts tracked yet — add handles in the Competitors tab."
                : "No outliers in the last 14 days."}
            </p>
          ) : (
            <ul className="space-y-3">
              {trends.outliers.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-start gap-3">
                  <span
                    className="neo-glow-cyan mt-0.5 shrink-0 font-mono text-[12px] font-bold text-acuity-primary tabular-nums"
                    title="views ÷ account median"
                  >
                    {o.outlierScore.toFixed(1)}x
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-acuity-text">
                      {o.brief?.hook ?? o.caption ?? "(no caption)"}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                      @{o.account.handle} · {o.account.platform} ·{" "}
                      {compact(o.views)} views
                      {o.brief ? " · briefed" : ""}
                    </p>
                  </div>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[11px] text-acuity-primary hover:underline"
                  >
                    open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Top content leaderboard ─────────────────────────────── */}
      <Panel
        title="Top Content (30 days)"
        action={<TabLink tab="content" label="Content" />}
      >
        {trendsError ? (
          <p className="py-6 text-center text-sm text-acuity-text-ter">
            Couldn&apos;t load the leaderboard.
          </p>
        ) : !trends ? (
          <div className="h-40 animate-pulse rounded-acuity-md bg-acuity-bg-inset" />
        ) : trends.topContent.length === 0 ? (
          <p className="py-6 text-center text-sm text-acuity-text-ter">
            No posted content with metrics yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-acuity-line font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                  <th className="pb-2 pr-4 font-medium">Headline</th>
                  <th className="pb-2 pr-4 font-medium">Lane</th>
                  <th className="pb-2 pr-4 text-right font-medium">Views</th>
                  <th className="pb-2 pr-4 text-right font-medium">Likes</th>
                  <th className="pb-2 pr-4 text-right font-medium">Saves</th>
                  <th className="pb-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {trends.topContent.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-acuity-line last:border-0"
                  >
                    <td className="max-w-[320px] truncate py-2.5 pr-4 text-acuity-text">
                      {p.headline}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[11px] text-acuity-secondary-hi">
                        {p.lane ?? "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-acuity-text tabular-nums">
                      {compact(p.views)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-acuity-text-sec tabular-nums">
                      {compact(p.likes)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-acuity-text-sec tabular-nums">
                      {compact(p.saves)}
                    </td>
                    <td className="py-2.5">
                      <span className="flex gap-2 text-[11px]">
                        {p.instagramUrl && (
                          <a
                            href={p.instagramUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-acuity-primary hover:underline"
                          >
                            IG
                          </a>
                        )}
                        {p.tiktokUrl && (
                          <a
                            href={p.tiktokUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-acuity-primary hover:underline"
                          >
                            TT
                          </a>
                        )}
                        {!p.instagramUrl && !p.tiktokUrl && (
                          <span className="text-acuity-text-quiet">—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
