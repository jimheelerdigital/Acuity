/**
 * Social metrics dashboard (2026-09-24, per Keenan: "fix the metrics
 * dashboard to pull all of the proper metrics").
 *
 * One page for every number the nightly refresh (carousel-metrics-refresh)
 * collects: IG (views, reach, likes, comments, saves, shares, profile
 * visits, follows), FB (reactions, comments, shares), and TikTok for both
 * accounts (views, likes, comments, shares, saves — public counts via
 * Apify, verified identical to TikTok's own video page). Server-rendered
 * straight from the DB; the admin layout gates access.
 */

import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { RefreshButtons } from "./refresh-buttons";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

interface Nums {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}
const zero = (): Nums => ({ views: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
const add = (a: Nums, b: Partial<Record<keyof Nums, number | null>>) => {
  for (const k of Object.keys(a) as (keyof Nums)[]) a[k] += b[k] ?? 0;
};
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface AccountCard {
  label: string;
  posts: number;
  totals: Nums;
  medianViews: number;
  last7Views: number;
  prior7Views: number;
  extra?: { reach: number; profileVisits: number; follows: number };
  refreshedAt: Date | null;
}

async function loadData() {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since90 = new Date(now - 90 * DAY);

  const publishes = await prisma.socialPublish.findMany({
    where: { status: "POSTED", postedAt: { gte: since90 }, platform: { in: ["instagram", "facebook"] } },
    select: {
      platform: true,
      accountKey: true,
      postedAt: true,
      permalink: true,
      views: true,
      likes: true,
      comments: true,
      shares: true,
      saves: true,
      reach: true,
      profileVisits: true,
      follows: true,
      metricsAt: true,
      metricsError: true,
      carouselPost: { select: { headline: true, lane: true } },
    },
  });
  const videos = await prisma.tikTokVideo.findMany({ orderBy: { views: "desc" } });

  const card = (label: string, rows: Array<Partial<Record<keyof Nums, number | null>> & { postedAt: Date | null; metricsAt?: Date | null; lastScrapedAt?: Date }>): AccountCard => {
    const totals = zero();
    rows.forEach((r) => add(totals, r));
    const views = (from: number, to: number) =>
      rows
        .filter((r) => r.postedAt && r.postedAt.getTime() >= now - from * DAY && r.postedAt.getTime() < now - to * DAY)
        .reduce((n, r) => n + (r.views ?? 0), 0);
    const refreshed = rows
      .map((r) => r.metricsAt ?? r.lastScrapedAt ?? null)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      label,
      posts: rows.length,
      totals,
      medianViews: median(rows.map((r) => r.views ?? 0)),
      last7Views: views(7, 0),
      prior7Views: views(14, 7),
      refreshedAt: refreshed,
    };
  };

  const ig = publishes.filter((p) => p.platform === "instagram");
  const igCard = card("Instagram · Ripple", ig);
  igCard.extra = {
    reach: ig.reduce((n, r) => n + (r.reach ?? 0), 0),
    profileVisits: ig.reduce((n, r) => n + (r.profileVisits ?? 0), 0),
    follows: ig.reduce((n, r) => n + (r.follows ?? 0), 0),
  };
  const cards: AccountCard[] = [
    igCard,
    card("Facebook · Ripple", publishes.filter((p) => p.platform === "facebook")),
    card("TikTok · @getripple", videos.filter((v) => v.accountKey === "ripple")),
    card("TikTok · @buildwithkey", videos.filter((v) => v.accountKey === "bwk")),
  ];

  // Per-lane, last 30 days, every platform (matched TikTok rows included)
  const lanePosts = await prisma.carouselPost.findMany({
    where: { generatedFor: { gte: since30 }, socialPublishes: { some: { metricsAt: { not: null } } } },
    select: {
      lane: true,
      socialPublishes: {
        where: { metricsAt: { not: null } },
        select: { views: true, likes: true, comments: true, shares: true, saves: true },
      },
    },
  });
  const laneMap = new Map<string, { posts: number; totals: Nums }>();
  for (const p of lanePosts) {
    const key = p.lane ?? "(none)";
    const entry = laneMap.get(key) ?? { posts: 0, totals: zero() };
    entry.posts++;
    p.socialPublishes.forEach((r) => add(entry.totals, r));
    laneMap.set(key, entry);
  }
  const lanes = [...laneMap.entries()]
    .map(([lane, v]) => ({ lane, ...v }))
    .sort((a, b) => (b.totals.shares + b.totals.saves) / b.posts - (a.totals.shares + a.totals.saves) / a.posts);

  const topPosts = publishes
    .filter((p) => p.postedAt && p.postedAt.getTime() >= since30.getTime())
    .map((p) => ({ ...p, score: (p.shares ?? 0) * 3 + (p.saves ?? 0) * 3 + (p.comments ?? 0) * 2 + (p.likes ?? 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const metricErrors = publishes.filter((p) => p.metricsError).slice(0, 5);

  return { cards, lanes, topPosts, videos, metricErrors };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-acuity-text-ter">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function SocialMetricsPage() {
  const { cards, lanes, topPosts, videos, metricErrors } = await loadData();

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social metrics</h1>
            <p className="text-sm text-acuity-text-ter">
              Refreshed nightly (3:00 UTC). TikTok: latest 40 videos daily, full history Sundays. Last 90 days for IG/FB.
            </p>
          </div>
          <RefreshButtons />
        </div>

        {metricErrors.length > 0 && (
          <div className="rounded-lg border border-acuity-line bg-acuity-bad-soft p-4 text-sm">
            <p className="font-semibold text-acuity-bad mb-1">Metrics errors on recent rows</p>
            {metricErrors.map((e, i) => (
              <p key={i} className="text-acuity-text-sec">
                {e.platform}: {e.metricsError}
              </p>
            ))}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const t = c.totals;
            const eng = t.likes + t.comments + t.shares + t.saves;
            return (
              <div key={c.label} className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-3">
                <div>
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-[11px] text-acuity-text-ter">
                    {c.posts} posts · refreshed {c.refreshedAt ? c.refreshedAt.toISOString().slice(0, 16).replace("T", " ") : "never"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Views" value={fmt(t.views)} />
                  <Stat label="Median" value={fmt(c.medianViews)} />
                  <Stat label="Eng. rate" value={pct(eng, t.views)} />
                  <Stat label="Likes" value={fmt(t.likes)} />
                  <Stat label="Comments" value={fmt(t.comments)} />
                  <Stat label="Shares" value={fmt(t.shares)} />
                  <Stat label="Saves" value={fmt(t.saves)} />
                  <Stat label="Views 7d" value={fmt(c.last7Views)} />
                  <Stat label="Prior 7d" value={fmt(c.prior7Views)} />
                  {c.extra && (
                    <>
                      <Stat label="Reach" value={fmt(c.extra.reach)} />
                      <Stat label="Profile visits" value={fmt(c.extra.profileVisits)} />
                      <Stat label="Follows" value={fmt(c.extra.follows)} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Lanes · last 30 days (per-post averages, all platforms)</h2>
          <p className="text-xs text-acuity-text-ter mb-3">
            Sorted by shares + saves per post — the signals platforms reward most. TikTok counts once its videos are matched to a post by caption.
          </p>
          <div className="overflow-x-auto rounded-lg border border-acuity-line">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-acuity-bg-inset text-acuity-text-ter text-xs">
                <tr>
                  {["Lane", "Posts", "Views", "Likes", "Comments", "Shares", "Saves"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lanes.map((l) => (
                  <tr key={l.lane} className="border-t border-acuity-line">
                    <td className="px-3 py-2">{l.lane}</td>
                    <td className="px-3 py-2">{l.posts}</td>
                    {(["views", "likes", "comments", "shares", "saves"] as const).map((k) => (
                      <td key={k} className="px-3 py-2">{(l.totals[k] / l.posts).toFixed(1)}</td>
                    ))}
                  </tr>
                ))}
                {lanes.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-acuity-text-ter">No measured posts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Top IG/FB posts · last 30 days</h2>
          <div className="overflow-x-auto rounded-lg border border-acuity-line">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-acuity-bg-inset text-acuity-text-ter text-xs">
                <tr>
                  {["Post", "Lane", "Platform", "Views", "Likes", "Comments", "Shares", "Saves"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p, i) => (
                  <tr key={i} className="border-t border-acuity-line">
                    <td className="px-3 py-2 max-w-xs truncate">
                      {p.permalink ? (
                        <Link href={p.permalink} target="_blank" className="hover:underline">{p.carouselPost.headline}</Link>
                      ) : (
                        p.carouselPost.headline
                      )}
                    </td>
                    <td className="px-3 py-2">{p.carouselPost.lane}</td>
                    <td className="px-3 py-2">{p.platform}</td>
                    <td className="px-3 py-2">{fmt(p.views)}</td>
                    <td className="px-3 py-2">{fmt(p.likes)}</td>
                    <td className="px-3 py-2">{fmt(p.comments)}</td>
                    <td className="px-3 py-2">{fmt(p.shares)}</td>
                    <td className="px-3 py-2">{fmt(p.saves)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {(["bwk", "ripple"] as const).map((acct) => {
          const rows = videos.filter((v) => v.accountKey === acct);
          return (
            <section key={acct}>
              <h2 className="text-lg font-semibold mb-2">
                TikTok · @{acct === "bwk" ? "buildwithkey" : "getripple"} · {rows.length} videos (by views)
              </h2>
              <div className="overflow-x-auto rounded-lg border border-acuity-line max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="sticky top-0 bg-acuity-bg-inset text-acuity-text-ter text-xs">
                    <tr>
                      {["Posted", "Caption", "Views", "Likes", "Comments", "Shares", "Saves", "Matched"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => (
                      <tr key={v.videoId} className="border-t border-acuity-line">
                        <td className="px-3 py-2 whitespace-nowrap">{v.postedAt?.toISOString().slice(0, 10) ?? "—"}</td>
                        <td className="px-3 py-2 max-w-sm truncate">
                          <Link href={v.url} target="_blank" className="hover:underline">
                            {v.caption?.trim() || "(no caption)"}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{fmt(v.views)}</td>
                        <td className="px-3 py-2">{fmt(v.likes)}</td>
                        <td className="px-3 py-2">{fmt(v.comments)}</td>
                        <td className="px-3 py-2">{fmt(v.shares)}</td>
                        <td className="px-3 py-2">{fmt(v.saves)}</td>
                        <td className="px-3 py-2">{v.carouselPostId ? "✓" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
