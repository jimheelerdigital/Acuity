/**
 * "Is it actually getting better?" block for the Monday performance email
 * (2026-10-02, fix #3 of the 30-day hands-off list).
 *
 * The scoreboard scores each post against the account's OWN recent median
 * (1.00 = typical), so it can't show the account improving: a great month
 * and a bad month both average ~1.00. This compares absolute per-post
 * Instagram numbers window over window instead.
 *
 * Windows end 48h ago so every post in them has had time to collect its
 * numbers (same maturity rule as the scoreboard). Verdict per window: the
 * average of current/previous ratios for views, saves, shares and follows;
 * ≥ +10% improving, ≤ -10% declining, else flat; under MIN_POSTS posts in
 * either window → "not enough posts yet".
 *
 * Two declining weeks in a row for a brand puts it in the email subject.
 * Last week's verdicts: health/trend-last.json in the content-factory bucket.
 */

import { readJson, writeJson, type LoopBrand } from "./performance-loop";

const BRANDS: LoopBrand[] = ["ripple", "bwk", "mythicals"];
const BRAND_NAME: Record<LoopBrand, string> = {
  ripple: "Ripple",
  bwk: "Build With Key",
  mythicals: "Legendary Mythicals",
};
const METRICS = ["views", "saves", "shares", "follows"] as const;
type Metric = (typeof METRICS)[number];
const MATURE_MS = 48 * 3_600_000;
const MIN_POSTS = 3;
const BAND = 0.1;
const LAST_PATH = "health/trend-last.json";

export type Verdict = "improving" | "flat" | "declining" | "not enough posts yet";

interface WindowStats {
  posts: number;
  avg: Record<Metric, number>;
  followsTotal: number;
}

export interface BrandTrend {
  brand: LoopBrand;
  week: { cur: WindowStats; prev: WindowStats; verdict: Verdict; change: number | null };
  month: { cur: WindowStats; prev: WindowStats; verdict: Verdict; change: number | null };
  /** Share of gated posts held by the publish gate in the last 7 days (null = brand not gated). */
  heldShare: number | null;
}

function stats(rows: { views: number | null; saves: number | null; shares: number | null; follows: number | null }[]): WindowStats {
  const avg = {} as Record<Metric, number>;
  for (const m of METRICS) {
    const xs = rows.map((r) => r[m]).filter((x): x is number => typeof x === "number");
    avg[m] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  return { posts: rows.length, avg, followsTotal: rows.reduce((s, r) => s + (r.follows ?? 0), 0) };
}

function verdictOf(cur: WindowStats, prev: WindowStats): { verdict: Verdict; change: number | null } {
  if (cur.posts < MIN_POSTS || prev.posts < MIN_POSTS) return { verdict: "not enough posts yet", change: null };
  // +1 smoothing so a metric at zero (follows, shares) can't explode the ratio.
  const ratios = METRICS.map((m) => (cur.avg[m] + 1) / (prev.avg[m] + 1));
  const change = ratios.reduce((a, b) => a + b, 0) / ratios.length - 1;
  return { verdict: change >= BAND ? "improving" : change <= -BAND ? "declining" : "flat", change };
}

async function heldShare(brand: LoopBrand): Promise<number | null> {
  if (brand === "mythicals") return null;
  const { readGateMarker } = await import("./publish-gate");
  let n = 0, held = 0;
  for (let d = 1; d <= 7; d++) {
    const date = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    const m = await readGateMarker(brand, date).catch(() => null);
    if (!m) continue;
    n += m.rows.length;
    held += m.rows.filter((r) => r.held).length;
  }
  return n ? held / n : null;
}

export async function computeTrends(now = Date.now()): Promise<BrandTrend[]> {
  const { prisma } = await import("@/lib/prisma");
  const end = now - MATURE_MS;
  const day = 86_400_000;
  const rows = await prisma.socialPublish.findMany({
    where: {
      status: "POSTED",
      platform: "instagram",
      accountKey: { in: BRANDS },
      postedAt: { gte: new Date(end - 60 * day), lt: new Date(end) },
    },
    select: { accountKey: true, postedAt: true, views: true, saves: true, shares: true, follows: true },
  });
  const inWin = (brand: LoopBrand, fromDaysAgo: number, toDaysAgo: number) =>
    rows.filter(
      (r) =>
        r.accountKey === brand &&
        r.postedAt!.getTime() >= end - fromDaysAgo * day &&
        r.postedAt!.getTime() < end - toDaysAgo * day
    );
  const out: BrandTrend[] = [];
  for (const brand of BRANDS) {
    const wCur = stats(inWin(brand, 7, 0)), wPrev = stats(inWin(brand, 14, 7));
    const mCur = stats(inWin(brand, 30, 0)), mPrev = stats(inWin(brand, 60, 30));
    out.push({
      brand,
      week: { cur: wCur, prev: wPrev, ...verdictOf(wCur, wPrev) },
      month: { cur: mCur, prev: mPrev, ...verdictOf(mCur, mPrev) },
      heldShare: await heldShare(brand),
    });
  }
  return out;
}

/** Brands declining this week AND last week. Records this week's verdicts. */
export async function twoWeekDecliners(trends: BrandTrend[]): Promise<LoopBrand[]> {
  const last = (await readJson<Record<string, Verdict>>(LAST_PATH).catch(() => null)) ?? {};
  const out = trends.filter((t) => t.week.verdict === "declining" && last[t.brand] === "declining").map((t) => t.brand);
  await writeJson(LAST_PATH, Object.fromEntries(trends.map((t) => [t.brand, t.week.verdict]))).catch(() => undefined);
  return out;
}

export function trendSubjectPrefix(decliners: LoopBrand[]): string {
  return decliners.length ? `⚠️ ${decliners.map((b) => BRAND_NAME[b]).join(" + ")} declining 2 weeks running · ` : "";
}

const COLOR: Record<Verdict, string> = {
  improving: "#15803d",
  flat: "#6b7280",
  declining: "#b91c1c",
  "not enough posts yet": "#9aa1ad",
};

export function trendHtml(trends: BrandTrend[]): string {
  const n = (x: number) => (x >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(1));
  const pct = (c: number | null) => (c == null ? "" : ` (${c >= 0 ? "+" : ""}${Math.round(c * 100)}%)`);
  const line = (label: string, w: BrandTrend["week"]) =>
    `<tr><td style="padding:3px 8px">${label}</td>
<td style="padding:3px 8px;font-weight:700;color:${COLOR[w.verdict]}">${w.verdict.toUpperCase()}${pct(w.change)}</td>
<td style="padding:3px 8px;color:#555">${w.cur.posts} posts: ${n(w.cur.avg.views)} views, ${n(w.cur.avg.saves)} saves, ${n(w.cur.avg.shares)} shares, ${n(w.cur.avg.follows)} follows per post · ${w.cur.followsTotal} follows total
<br/><span style="color:#9aa1ad">before: ${w.prev.posts} posts, ${n(w.prev.avg.views)} views, ${n(w.prev.avg.saves)} saves, ${n(w.prev.avg.shares)} shares, ${n(w.prev.avg.follows)} follows per post</span></td></tr>`;
  const sections = trends
    .map(
      (t) => `<p style="margin:12px 0 2px;font-weight:700">${BRAND_NAME[t.brand]}</p>
<table style="border-collapse:collapse;font-size:13px">${line("Last 7 days vs the 7 before", t.week)}${line("Last 30 days vs the 30 before", t.month)}</table>
${t.heldShare == null ? "" : `<p style="margin:2px 8px;font-size:12px;color:#555">Publish gate held ${Math.round(t.heldShare * 100)}% of gated posts in the last 7 days.</p>`}`
    )
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:760px;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin:0 0 18px">
<h2 style="font-size:17px;margin:0 0 4px">Is it getting better?</h2>
<p style="margin:0;color:#555;font-size:13px">Real Instagram numbers per post, compared with the period before (posts at least 2 days old). Improving / declining = average change of ±10% or more across views, saves, shares and follows.</p>
${sections}</div>`;
}
