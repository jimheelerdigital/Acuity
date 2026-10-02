/**
 * Competitor discovery (2026-10-01, per Keenan: "i just don't know what to
 * even look for. why don't you do the research?" → "just do them all").
 *
 * The profile scrape only ever looked inside accounts someone typed in.
 * This adds:
 *   1. KEYWORD SEARCH — each run searches TikTok for the phrases each
 *      audience actually uses (research 2026-10-01, PROGRESS) and stores
 *      the results under DISCOVERED accounts. A post is a standout when
 *      its views beat the creator's follower count by OVERPERFORM_RATIO —
 *      the format did the work, not the creator's reach.
 *   2. RED FLAGS — hustle funnels, course/discount sellers and #nofap-type
 *      tags never get stored (research: these dominate the broad tags).
 *   3. AUTO-PROMOTE — a discovered creator with 2+ standouts becomes an
 *      ACTIVE tracked account (scraped every run from then on).
 *   4. AUTO-PAUSE — a tracked account with plenty of posts and no standout
 *      in 60 days is PAUSED, reason in `notes`.
 *
 * Statuses: ACTIVE (scraped), DISCOVERED (seen in search, not scraped),
 * PAUSED. No schema change: `status` is a free string.
 */

import { runApifyActor } from "./competitor-mimic";

export type ResearchBrand = "ripple" | "bwk";

/** Search phrases per brand (research 2026-10-01). Edit freely. */
export const SEARCH_KEYWORDS: Record<ResearchBrand, string[]> = {
  ripple: [
    "mental load",
    "default parent",
    "invisible labor",
    "weaponized incompetence",
    "mom rage",
    "overstimulated mom",
    "lost myself in motherhood",
    "nobody asks how mom is",
    "mental load of motherhood",
    "honest motherhood",
    "gen x women",
    "women in their 40s",
  ],
  bwk: [
    "lock in",
    "winter arc",
    "self discipline",
    "becoming the best version of myself",
    "self improvement for men",
    "rules I live by",
    "habits that changed my life",
    "stoic quotes",
    "rebuilding myself",
    "discipline over motivation",
  ],
};

/** Search results kept per phrase. */
const RESULTS_PER_KEYWORD = 30;
/** views ÷ followers ≥ this ⇒ standout (the format outran the audience). */
const OVERPERFORM_RATIO = 2;
/** Absolute floor so a 300-follower account's 1k views doesn't count. */
const DISCOVERY_MIN_VIEWS = 50_000;
/** Only recent posts: older hits say little about what works now. */
const MAX_AGE_DAYS = 30;
/** Standouts needed before a discovered creator is tracked. */
const PROMOTE_AFTER = 2;

/**
 * Captions and bios that mean "selling, not content", or topics the
 * research said to keep out. Matched case-insensitively.
 */
const RED_FLAGS: RegExp[] = [
  /\bDM\s+(me\s+)?["'“‘]?[A-Z]{3,}\b/, // "DM START", "DM 'ADAPT'"
  /\bdm\s+me\b/i,
  /check\s+(my|the)\s+link/i,
  /link\s+in\s+(my\s+)?bio/i,
  /\bcourse\b/i,
  /discount\s+code|use\s+code\b|\bcode\s+[A-Z0-9]{3,}\b/i,
  /want\s+a\s+page\s+like\s+this/i,
  /(system|guide|blueprint|method)\s+(is\s+)?in\s+my\s+(profile|bio)/i,
  /faceless\s+page/i,
  /#?(nofap|semenretention|redpill|looksmax\w*)/i,
  /\b(crypto|forex|dropshipping|passive\s+income)\b/i,
  /tiktok\s*shop/i,
];

export function isRedFlag(...texts: (string | null | undefined)[]): boolean {
  const t = texts.filter(Boolean).join("\n");
  return RED_FLAGS.some((r) => r.test(t));
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Search one phrase and store standouts under DISCOVERED accounts.
 * Returns { stored, standouts }. Soft on failure.
 */
export async function discoverKeyword(
  brand: ResearchBrand,
  keyword: string
): Promise<{ results: number; stored: number; standouts: number }> {
  const { prisma } = await import("@/lib/prisma");
  if (!process.env.APIFY_TOKEN) return { results: 0, stored: 0, standouts: 0 };
  let items: Record<string, unknown>[];
  try {
    items = await runApifyActor("clockworks~tiktok-scraper", {
      searchQueries: [keyword],
      searchSection: "/video",
      // Most-liked from the past month: big recent hits; the follower
      // ratio below keeps the ones where the FORMAT did the work.
      videoSearchSorting: "MOST_LIKED",
      videoSearchDateFilter: "PAST_MONTH",
      resultsPerPage: RESULTS_PER_KEYWORD,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });
  } catch (e) {
    console.warn(`[competitor-discovery] search failed "${keyword}":`, e instanceof Error ? e.message.slice(0, 200) : e);
    return { results: 0, stored: 0, standouts: 0 };
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  let stored = 0;
  let standouts = 0;
  for (const it of items) {
    const id = str(it.id);
    const author = (it.authorMeta ?? {}) as Record<string, unknown>;
    const handle = str(author.name).replace(/^@/, "").toLowerCase();
    if (!id || !handle) continue;
    const ts = str(it.createTimeISO);
    const postedAt = ts ? new Date(ts) : null;
    if (postedAt && postedAt.getTime() < cutoff) continue;
    const caption = str(it.text).slice(0, 2000);
    const bio = str(author.signature);
    if (isRedFlag(caption, bio)) continue;

    const views = num(it.playCount);
    const followers = num(author.fans);
    const ratio = followers > 0 ? views / followers : 0;
    const isOutlier = ratio >= OVERPERFORM_RATIO && views >= DISCOVERY_MIN_VIEWS;

    const existing = await prisma.competitorAccount.findUnique({
      where: { platform_handle: { platform: "tiktok", handle } },
    });
    // Never resurrect a PAUSED account or move one to another brand.
    if (existing && (existing.status === "PAUSED" || existing.brand !== brand)) continue;
    const account =
      existing ??
      (await prisma.competitorAccount.create({
        data: {
          handle,
          platform: "tiktok",
          brand,
          niche: `search: ${keyword}`,
          status: "DISCOVERED",
          notes: `Found by keyword search "${keyword}" (${followers.toLocaleString()} followers).`,
        },
      }));

    const meta = (it.videoMeta ?? {}) as Record<string, unknown>;
    const url = str(it.webVideoUrl) || `https://www.tiktok.com/@${handle}/video/${id}`;
    await prisma.competitorPost.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId: id } },
      update: {
        views,
        likes: num(it.diggCount),
        comments: num(it.commentCount),
        shares: num(it.shareCount),
        scrapedAt: new Date(),
        // Tracked accounts score against their own median in scrapeAccount;
        // only discovered ones keep the follower ratio.
        ...(account.status === "DISCOVERED" ? { outlierScore: Math.round(ratio * 100) / 100, isOutlier } : {}),
      },
      create: {
        accountId: account.id,
        externalId: id,
        url,
        caption: caption || null,
        views,
        likes: num(it.diggCount),
        comments: num(it.commentCount),
        shares: num(it.shareCount),
        thumbnailUrl: str(meta.coverUrl) || null,
        postedAt,
        outlierScore: Math.round(ratio * 100) / 100,
        isOutlier: account.status === "DISCOVERED" ? isOutlier : false,
      },
    });
    stored++;
    if (isOutlier) standouts++;
  }
  console.log(`[competitor-discovery] ${brand} "${keyword}": ${items.length} results, ${stored} stored, ${standouts} standouts`);
  return { results: items.length, stored, standouts };
}

/**
 * Promote discovered creators with PROMOTE_AFTER+ standouts; pause tracked
 * accounts that stopped producing them. Returns counts.
 */
export async function promoteAndPause(): Promise<{ promoted: string[]; paused: string[] }> {
  const { prisma } = await import("@/lib/prisma");
  const today = new Date().toISOString().slice(0, 10);
  const promoted: string[] = [];
  const paused: string[] = [];

  const discovered = await prisma.competitorAccount.findMany({
    where: { status: "DISCOVERED" },
    select: { id: true, handle: true, notes: true, _count: { select: { posts: { where: { isOutlier: true } } } } },
  });
  for (const a of discovered) {
    if (a._count.posts < PROMOTE_AFTER) continue;
    await prisma.competitorAccount.update({
      where: { id: a.id },
      data: {
        status: "ACTIVE",
        notes: `${a.notes ?? ""}\n${today}: auto-tracked after ${a._count.posts} standout posts in keyword search.`.trim(),
      },
    });
    promoted.push(a.handle);
  }

  // Pause: tracked ≥ 30 days, ≥ 30 stored posts, no standout posted in 60 days.
  const active = await prisma.competitorAccount.findMany({
    where: { status: "ACTIVE", createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    select: { id: true, handle: true, notes: true, _count: { select: { posts: true } } },
  });
  const recent = new Date(Date.now() - 60 * 86_400_000);
  for (const a of active) {
    if (a._count.posts < 30) continue;
    const hits = await prisma.competitorPost.count({
      where: { accountId: a.id, isOutlier: true, postedAt: { gte: recent } },
    });
    if (hits > 0) continue;
    await prisma.competitorAccount.update({
      where: { id: a.id },
      data: {
        status: "PAUSED",
        notes: `${a.notes ?? ""}\n${today}: auto-paused, no standout post in 60 days.`.trim(),
      },
    });
    paused.push(a.handle);
  }
  // Handles that return nothing (wrong or renamed handle) stop costing a run.
  const empty = await prisma.competitorAccount.findMany({
    where: { status: "ACTIVE", lastScrapedAt: { not: null }, posts: { none: {} } },
    select: { id: true, handle: true, notes: true },
  });
  for (const a of empty) {
    await prisma.competitorAccount.update({
      where: { id: a.id },
      data: { status: "PAUSED", notes: `${a.notes ?? ""}\n${today}: auto-paused, the scrape returned no posts (handle may be wrong).`.trim() },
    });
    paused.push(a.handle);
  }

  // Source credit: accounts whose briefs led to weak posts for US (3+ posts).
  const { readResearchLearning } = await import("./research-learning");
  const learning = await readResearchLearning().catch(() => null);
  for (const [key, stat] of Object.entries(learning?.sources ?? {})) {
    if (!key.startsWith("account:") || stat.label !== "weak") continue;
    const handle = key.slice(8);
    const acct = await prisma.competitorAccount.findFirst({ where: { handle, status: { not: "PAUSED" } } });
    if (!acct) continue;
    await prisma.competitorAccount.update({
      where: { id: acct.id },
      data: {
        status: "PAUSED",
        notes: `${acct.notes ?? ""}\n${today}: auto-paused, posts we built from its briefs scored weak (${stat.n} posts, avg ${stat.mean}).`.trim(),
      },
    });
    paused.push(handle);
  }

  if (promoted.length || paused.length) {
    console.log(`[competitor-discovery] promoted ${promoted.join(", ") || "none"}; paused ${paused.join(", ") || "none"}`);
  }
  return { promoted, paused };
}
