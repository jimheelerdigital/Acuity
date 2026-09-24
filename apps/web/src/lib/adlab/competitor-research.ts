/**
 * Competitor ad research (2026-09-24, per Keenan) — the free replacement for
 * Motion. Weekly, scrape the PUBLIC Meta Ad Library (US, active ads, sorted
 * by impressions) for competitors and big adjacent spenders, then distill a
 * per-audience brief the Sunday weekly batch reads.
 *
 * Why scraping, not the official Ad Library API: for non-political ads the
 * API only returns ads delivered in the EU, and our competitors mostly run
 * US-only. The public site shows every active ad with its start date.
 *
 * Longevity is the signal. Meta doesn't publish spend for commercial ads,
 * but an ad that has run 30+ days is almost certainly profitable (nobody
 * keeps paying for a loser), and many live variants of one creative
 * ("N ads use this creative") means it's being scaled.
 *
 * Scraper: Apify "apify/facebook-ads-scraper" — pay-per-result, ~$0.006/ad
 * on the free tier. RESULTS_PER_SOURCE × sources × 2 groups ≈ 320 ads/week
 * (~$8/month). APIFY_TOKEN is prod-only (Vercel-sensitive), so this runs
 * via Inngest. Every failure is SOFT: a dead source is skipped, and the
 * batch simply runs without a competitor section.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";
import type { BatchGroupKey } from "@/lib/adlab/weekly-batch";

const APIFY_BASE = "https://api.apify.com/v2/acts";
const AD_LIBRARY_ACTOR = process.env.APIFY_AD_LIBRARY_ACTOR || "apify~facebook-ads-scraper";
/** Ads pulled per source per week (sorted by impressions, so the top ones). */
const RESULTS_PER_SOURCE = 20;
/** Longevity threshold that marks a proven ad. */
const LONG_RUNNER_DAYS = 30;
export const COMPETITOR_BRIEF_MAX_AGE_DAYS = 14;

// ─── Sources ──────────────────────────────────────────────────────────────

export interface CompetitorSource {
  /** Stored as AdLabCompetitorAd.source */
  id: string;
  /** Ad Library search query. */
  query: string;
  /**
   * Brand sources: keep only ads whose page name matches (the library's
   * keyword search also returns other advertisers mentioning the word).
   * Keyword sources leave this unset — any advertiser is fair game.
   */
  pageMatch?: RegExp;
}

/**
 * Direct competitors plus bigger adjacent spenders targeting the same
 * person — they test far more creative than our direct competitors, so
 * their long-runners carry more signal. Edit freely; the source id is just
 * a label.
 */
export const COMPETITOR_SOURCES: Record<BatchGroupKey, CompetitorSource[]> = {
  women: [
    { id: "page:Rosebud", query: "Rosebud", pageMatch: /rosebud/i },
    { id: "page:Finch", query: "Finch", pageMatch: /finch/i },
    { id: "page:Day One", query: "Day One Journal", pageMatch: /day ?one/i },
    { id: "page:Midi Health", query: "Midi Health", pageMatch: /midi/i },
    { id: "page:Cozi", query: "Cozi", pageMatch: /cozi/i },
    { id: "page:BetterHelp", query: "BetterHelp", pageMatch: /betterhelp/i },
    { id: "keyword:mental load", query: "mental load" },
    { id: "keyword:journaling app", query: "journaling app" },
  ],
  men: [
    { id: "page:Stoic", query: "Stoic app", pageMatch: /stoic/i },
    { id: "page:Opal", query: "Opal screen time", pageMatch: /opal/i },
    { id: "page:Rise", query: "Rise sleep energy", pageMatch: /rise/i },
    { id: "page:Headway", query: "Headway", pageMatch: /headway/i },
    { id: "page:Fabulous", query: "Fabulous habit", pageMatch: /fabulous/i },
    { id: "keyword:habit tracker", query: "habit tracker" },
    { id: "keyword:self discipline", query: "self discipline" },
    { id: "keyword:dopamine detox", query: "dopamine detox" },
  ],
};

function adLibraryUrl(query: string): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "US",
    q: query,
    search_type: "keyword_unordered",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

// ─── Scrape ───────────────────────────────────────────────────────────────

/* The actor mirrors the Ad Library's own payload; field names have drifted
   between camelCase and snake_case across actor versions, so every read is
   tolerant. */
type Raw = Record<string, unknown>;
const pick = (o: Raw | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;

function toDate(v: unknown): Date | null {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string" && v) {
    const n = Number(v);
    if (!Number.isNaN(n)) return toDate(n);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface ParsedAd {
  adArchiveId: string;
  pageId: string;
  pageName: string;
  adStartedAt: Date | null;
  bodies: string[];
  titles: string[];
  ctaText?: string;
  linkUrl?: string;
  displayFormat?: string;
  imageUrls: string[];
  videoUrls: string[];
  platforms: string[];
  variantCount?: number;
}

export function parseAdLibraryItem(item: Raw): ParsedAd | null {
  const adArchiveId = str(pick(item, "adArchiveID", "adArchiveId", "ad_archive_id", "adid", "id"));
  if (!adArchiveId) return null;
  const snap = (pick(item, "snapshot") as Raw | undefined) ?? item;
  const cards = (pick(snap, "cards") as Raw[] | undefined) ?? [];

  const bodyOf = (o: Raw | undefined) => {
    const b = pick(o, "body");
    return str(typeof b === "object" && b ? pick(b as Raw, "text", "markup") : b);
  };
  const bodies = [bodyOf(snap), ...cards.map(bodyOf)].filter((x): x is string => !!x);
  const titles = [str(pick(snap, "title")), ...cards.map((c) => str(pick(c, "title")))].filter(
    (x): x is string => !!x
  );
  const images = [
    ...((pick(snap, "images") as Raw[] | undefined) ?? []),
    ...cards,
  ]
    .map((i) => str(pick(i, "originalImageUrl", "original_image_url", "resizedImageUrl", "resized_image_url")))
    .filter((x): x is string => !!x);
  const videos = [...((pick(snap, "videos") as Raw[] | undefined) ?? []), ...cards]
    .map((v) => str(pick(v, "videoHdUrl", "video_hd_url", "videoSdUrl", "video_sd_url")))
    .filter((x): x is string => !!x);
  const platforms = (pick(item, "publisherPlatform", "publisher_platform", "publisherPlatforms") as
    | string[]
    | undefined) ?? [];
  const collation = pick(item, "collationCount", "collation_count");

  return {
    adArchiveId,
    pageId: str(pick(item, "pageID", "pageId", "page_id")) ?? str(pick(snap, "pageId", "page_id")) ?? "unknown",
    pageName: str(pick(item, "pageName", "page_name")) ?? str(pick(snap, "pageName", "page_name")) ?? "unknown",
    adStartedAt: toDate(pick(item, "startDate", "start_date", "startDateFormatted", "adDeliveryStartTime")),
    bodies: [...new Set(bodies)].slice(0, 5),
    titles: [...new Set(titles)].slice(0, 5),
    ctaText: str(pick(snap, "ctaText", "cta_text")),
    linkUrl: str(pick(snap, "linkUrl", "link_url")),
    displayFormat: str(pick(snap, "displayFormat", "display_format")),
    imageUrls: [...new Set(images)].slice(0, 5),
    videoUrls: [...new Set(videos)].slice(0, 3),
    platforms: Array.isArray(platforms) ? platforms.map(String) : [],
    variantCount: typeof collation === "number" ? collation : undefined,
  };
}

/**
 * Scrape one source and upsert its ads. Returns counts; never throws.
 * Ads from this source that weren't seen this time are marked inactive.
 */
export async function scrapeCompetitorSource(
  groupKey: BatchGroupKey,
  source: CompetitorSource
): Promise<{ source: string; fetched: number; kept: number; error?: string }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { source: source.id, fetched: 0, kept: 0, error: "APIFY_TOKEN not set" };

  const scrapeStart = new Date();
  let items: Raw[];
  try {
    const res = await fetch(
      `${APIFY_BASE}/${AD_LIBRARY_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=240`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: adLibraryUrl(source.query) }],
          resultsLimit: RESULTS_PER_SOURCE,
          activeStatus: "active",
          sorting: "total_impressions",
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { source: source.id, fetched: 0, kept: 0, error: `Apify ${res.status}: ${body.slice(0, 200)}` };
    }
    items = (await res.json()) as Raw[];
  } catch (err) {
    return { source: source.id, fetched: 0, kept: 0, error: err instanceof Error ? err.message : String(err) };
  }

  if (items[0]) {
    // Field names drift between actor versions — log the shape once so a
    // parse regression is diagnosable from Inngest logs.
    console.log(`[competitor-research] ${source.id} item keys: ${Object.keys(items[0]).join(",")}`);
  }

  let kept = 0;
  for (const item of items) {
    const ad = parseAdLibraryItem(item);
    if (!ad) continue;
    if (source.pageMatch && !source.pageMatch.test(ad.pageName)) continue;
    const data = {
      groupKey,
      source: source.id,
      pageId: ad.pageId,
      pageName: ad.pageName,
      adStartedAt: ad.adStartedAt,
      lastSeenAt: new Date(),
      isActive: true,
      bodies: ad.bodies as Prisma.InputJsonValue,
      titles: ad.titles as Prisma.InputJsonValue,
      ctaText: ad.ctaText ?? null,
      linkUrl: ad.linkUrl ?? null,
      displayFormat: ad.displayFormat ?? null,
      imageUrls: ad.imageUrls as Prisma.InputJsonValue,
      videoUrls: ad.videoUrls as Prisma.InputJsonValue,
      platforms: ad.platforms as Prisma.InputJsonValue,
      variantCount: ad.variantCount ?? null,
    };
    await prisma.adLabCompetitorAd.upsert({
      where: { adArchiveId: ad.adArchiveId },
      create: { adArchiveId: ad.adArchiveId, ...data },
      update: data,
    });
    kept++;
  }

  // Only retire rows when the scrape actually returned something — an empty
  // response is more likely a scraper hiccup than every ad stopping at once.
  if (items.length > 0) {
    await prisma.adLabCompetitorAd.updateMany({
      where: { groupKey, source: source.id, isActive: true, lastSeenAt: { lt: scrapeStart } },
      data: { isActive: false },
    });
  }

  return { source: source.id, fetched: items.length, kept };
}

// ─── Brief ────────────────────────────────────────────────────────────────

export interface CompetitorBrief {
  summary: string;
  hooks: string[];
  patterns: Array<{ pattern: string; evidence: string }>;
  formats: string[];
  offers: string[];
  longRunners: Array<{ pageName: string; daysRunning: number; hook: string; whyItWorks: string }>;
  opportunities: string[];
}

function daysRunning(started: Date | null): number | null {
  return started ? Math.floor((Date.now() - started.getTime()) / 86_400_000) : null;
}

/**
 * Distill the group's active competitor ads into a brief. Long-runners and
 * heavily-varianted ads lead the prompt. One Claude call → stored row.
 */
export async function runCompetitorBrief(
  groupKey: BatchGroupKey
): Promise<{ briefId: string | null; adCount: number; longRunners: number; error?: string }> {
  const ads = await prisma.adLabCompetitorAd.findMany({
    where: { groupKey, isActive: true },
    orderBy: { adStartedAt: "asc" },
  });
  if (ads.length === 0) return { briefId: null, adCount: 0, longRunners: 0, error: "no active competitor ads" };

  const ranked = ads
    .map((a) => ({ a, days: daysRunning(a.adStartedAt) ?? 0 }))
    .sort((x, y) => y.days + (y.a.variantCount ?? 1) * 5 - (x.days + (x.a.variantCount ?? 1) * 5))
    .slice(0, 45);
  const longRunners = ranked.filter((r) => r.days >= LONG_RUNNER_DAYS).length;

  const adLines = ranked
    .map(({ a, days }) => {
      const bodies = ((a.bodies as string[] | null) ?? []).slice(0, 2).map((b) => b.slice(0, 400));
      const titles = ((a.titles as string[] | null) ?? []).slice(0, 2);
      return `- ${a.pageName} [${a.source}] — running ${days}d${days >= LONG_RUNNER_DAYS ? " (PROVEN)" : ""}${a.variantCount && a.variantCount > 1 ? `, ${a.variantCount} live variants` : ""}, ${a.displayFormat ?? "?"}, CTA "${a.ctaText ?? "?"}"
  TITLE: ${titles.join(" / ") || "—"}
  COPY: ${bodies.join(" /// ") || "—"}`;
    })
    .join("\n");

  let brief: CompetitorBrief;
  try {
    const raw = await callAdLabClaude({
      purpose: `competitor-brief-${groupKey}`,
      systemPrompt: `You are a direct-response creative strategist studying competitor Meta ads (US, currently active) for Ripple, a voice-journaling / habit-tracking app on a 7-day free trial. Audience: ${groupKey === "women" ? "women ~40–50 carrying a heavy mental load" : "young men 18–34 focused on discipline and self-respect"}.

Longevity is the performance signal: ads running ${LONG_RUNNER_DAYS}+ days (marked PROVEN) are almost certainly profitable; many live variants means it's being scaled. Weight your conclusions toward those. Newer ads are tests — note them only as emerging.

Extract what makes the proven ads work: hook structures, emotional angles, specificity, proof devices, offer framing (trial, price, guarantee), CTA, format. Describe STRUCTURES, not copy to reuse — we will never copy a competitor's wording or mention them.

Return ONLY JSON: {"summary": string (3-5 sentences), "hooks": string[] (5-8 hook STRUCTURES as fill-in templates, e.g. "Name a tiny specific moment → reveal the hidden cost"), "patterns": [{"pattern": string, "evidence": string (which advertisers / how long running)}], "formats": string[] (visual/format approaches that dominate proven ads), "offers": string[] (how proven ads frame the trial/price/risk reversal), "longRunners": [{"pageName": string, "daysRunning": number, "hook": string (paraphrased gist), "whyItWorks": string}] (up to 6), "opportunities": string[] (3-5 gaps nobody is covering that Ripple could own)}`,
      userPrompt: `${ranked.length} active competitor ads (of ${ads.length}), longest-running first:\n\n${adLines}`,
      maxTokens: 3500,
    });
    brief = JSON.parse(extractJson(raw)) as CompetitorBrief;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[competitor-research] ${groupKey} brief failed: ${msg}`);
    return { briefId: null, adCount: ads.length, longRunners, error: msg };
  }

  const row = await prisma.adLabCompetitorBrief.create({
    data: { groupKey, adCount: ads.length, brief: brief as unknown as Prisma.InputJsonValue },
  });
  return { briefId: row.id, adCount: ads.length, longRunners };
}

export async function getLatestCompetitorBrief(groupKey: BatchGroupKey): Promise<CompetitorBrief | null> {
  const row = await prisma.adLabCompetitorBrief.findFirst({
    where: {
      groupKey,
      date: { gte: new Date(Date.now() - COMPETITOR_BRIEF_MAX_AGE_DAYS * 86_400_000) },
    },
    orderBy: { date: "desc" },
  });
  return row ? (row.brief as unknown as CompetitorBrief) : null;
}

/** Prompt section for the weekly batch; "" when there's no fresh brief. */
export function renderCompetitorBriefForBatch(brief: CompetitorBrief | null): string {
  if (!brief) return "";
  return `WHAT'S WORKING FOR COMPETITORS (proven = running 30+ days in the US Meta Ad Library). Borrow STRUCTURES only — never copy wording, never name or allude to a competitor. Our own performance data above outranks this when they disagree. Our brand rules above ALWAYS override this section: if an idea below implies a recording duration ("3 minutes") or a fixed time of day ("before sleep", "nightly"), keep the insight but drop that framing.
SUMMARY: ${brief.summary}
PROVEN HOOK STRUCTURES:
${brief.hooks.map((h) => `- ${h}`).join("\n")}
PATTERNS:
${brief.patterns.map((p) => `- ${p.pattern} (${p.evidence})`).join("\n")}
OFFER FRAMING THAT RUNS LONG:
${brief.offers.map((o) => `- ${o}`).join("\n")}
GAPS WE COULD OWN:
${brief.opportunities.map((o) => `- ${o}`).join("\n")}`;
}
