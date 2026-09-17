/**
 * Content Factory — Competitor mimic pipeline (2026-09-17, per Keenan:
 * "a section where I can put in social media handles performing super
 * well in similar niches/areas that we can mimic... fully automated,
 * auto scrape if possible" + "we're going to also use the content of
 * others to generate two new lanes and posts daily from this").
 *
 * FLOW (daily 3:30 UTC cron, before the 4 UTC Reddit digest and the
 * hour-5 lane dispatch):
 *   1. Scrape every ACTIVE CompetitorAccount's recent posts via Apify
 *      (TikTok: clockworks~tiktok-profile-scraper, IG: apify~instagram-scraper).
 *   2. Upsert CompetitorPost rows; recompute per-account outlier scores
 *      (views ÷ account median views).
 *   3. Claude writes a "mimic brief" for each new outlier — hook
 *      mechanic, format, why it works, how WE would do it in our voice.
 *   4. Briefs feed three places: the admin Trends dashboard, the
 *      "WHAT'S WINNING" inspiration block appended to every lane's
 *      audience pulse, and the two mimic-mandate lanes ("muse" /
 *      "muse-men") which build their whole daily post from the top brief.
 *
 * ACCESS: requires APIFY_TOKEN in env. Every failure here is SOFT — no
 * token / no accounts / scrape failure just means lanes generate
 * without the competitor signal, exactly like the Reddit pulse.
 *
 * MIMIC ≠ COPY: briefs extract the mechanic (hook shape, format,
 * emotional beat), never verbatim copy, and downstream prompts forbid
 * mentioning any creator, platform, or "trend".
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const APIFY_BASE = "https://api.apify.com/v2/acts";
/** Posts pulled per account per scrape. */
const POSTS_PER_ACCOUNT = 20;
/** views ÷ median ≥ this ⇒ outlier. */
const OUTLIER_MULTIPLE = 3;
/** Absolute views floor so tiny accounts don't flag 3× of nothing. */
const OUTLIER_MIN_VIEWS = 10_000;
/** Max new briefs written per run (cost guard). */
const MAX_BRIEFS_PER_RUN = 8;

export interface MimicBrief {
  /** The hook mechanic in one sentence ("opens on a contradiction..."). */
  hook: string;
  /** The structural format ("7-slide listicle, each slide one rule"). */
  format: string;
  /** Why the audience responded. */
  whyItWorks: string;
  /** How OUR brand would run the same mechanic in our voice. */
  howWeApply: string;
  /** Audience-vocabulary words tied to the emotion (never copied lines). */
  phrases: string[];
}

interface ScrapedPost {
  externalId: string;
  url: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  thumbnailUrl: string | null;
  postedAt: Date | null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Run an Apify actor synchronously and return its dataset items.
 * Throws on any HTTP/config failure — callers treat all throws as soft.
 */
async function runApifyActor(
  actorId: string,
  input: object
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  const url = `${APIFY_BASE}/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=240`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    // Apify sync runs can take minutes for a profile scrape.
    signal: AbortSignal.timeout(250_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${actorId} → ${res.status}: ${body.slice(0, 200)}`);
  }
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

/** TikTok profile scrape → normalized posts. */
async function scrapeTikTok(handle: string): Promise<ScrapedPost[]> {
  const items = await runApifyActor("clockworks~tiktok-profile-scraper", {
    profiles: [handle],
    resultsPerPage: POSTS_PER_ACCOUNT,
    profileScrapeSections: ["videos"],
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });
  return items
    .map((it): ScrapedPost | null => {
      const id = str(it.id);
      if (!id) return null;
      const meta = (it.videoMeta ?? {}) as Record<string, unknown>;
      const ts = str(it.createTimeISO);
      return {
        externalId: id,
        url: str(it.webVideoUrl) || `https://www.tiktok.com/@${handle}/video/${id}`,
        caption: str(it.text).slice(0, 2000),
        views: num(it.playCount),
        likes: num(it.diggCount),
        comments: num(it.commentCount),
        shares: num(it.shareCount),
        thumbnailUrl: str(meta.coverUrl) || null,
        postedAt: ts ? new Date(ts) : null,
      };
    })
    .filter((p): p is ScrapedPost => p !== null);
}

/** Instagram profile scrape → normalized posts. */
async function scrapeInstagram(handle: string): Promise<ScrapedPost[]> {
  const items = await runApifyActor("apify~instagram-scraper", {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "posts",
    resultsLimit: POSTS_PER_ACCOUNT,
    addParentData: false,
  });
  return items
    .map((it): ScrapedPost | null => {
      const id = str(it.id) || str(it.shortCode);
      if (!id) return null;
      const ts = str(it.timestamp);
      return {
        externalId: id,
        url: str(it.url) || `https://www.instagram.com/p/${str(it.shortCode)}/`,
        caption: str(it.caption).slice(0, 2000),
        // Reels report plays; static posts have no view count — fall back
        // to likes so the outlier math still has a signal.
        views: num(it.videoPlayCount) || num(it.videoViewCount) || num(it.likesCount),
        likes: num(it.likesCount),
        comments: num(it.commentsCount),
        shares: 0,
        thumbnailUrl: str(it.displayUrl) || null,
        postedAt: ts ? new Date(ts) : null,
      };
    })
    .filter((p): p is ScrapedPost => p !== null);
}

/**
 * Scrape one account, upsert its posts, recompute outlier flags.
 * Returns the number of posts stored; records the error on the account
 * row on failure (and returns 0) so the dashboard can surface it.
 */
export async function scrapeAccount(accountId: string): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const account = await prisma.competitorAccount.findUniqueOrThrow({
    where: { id: accountId },
  });

  let posts: ScrapedPost[];
  try {
    posts =
      account.platform === "tiktok"
        ? await scrapeTikTok(account.handle)
        : await scrapeInstagram(account.handle);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    console.warn(`[competitor-mimic] scrape failed @${account.handle}:`, msg);
    await prisma.competitorAccount.update({
      where: { id: account.id },
      data: { scrapeError: msg },
    });
    return 0;
  }

  for (const p of posts) {
    await prisma.competitorPost.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId: p.externalId } },
      update: {
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        scrapedAt: new Date(),
      },
      create: {
        accountId: account.id,
        externalId: p.externalId,
        url: p.url,
        caption: p.caption || null,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        thumbnailUrl: p.thumbnailUrl,
        postedAt: p.postedAt,
      },
    });
  }

  // Outlier pass: views ÷ account median across everything we've stored.
  const all = await prisma.competitorPost.findMany({
    where: { accountId: account.id },
    select: { id: true, views: true },
  });
  const sorted = all.map((p) => p.views).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  for (const p of all) {
    const score = median > 0 ? p.views / median : 0;
    await prisma.competitorPost.update({
      where: { id: p.id },
      data: {
        outlierScore: Math.round(score * 100) / 100,
        isOutlier: score >= OUTLIER_MULTIPLE && p.views >= OUTLIER_MIN_VIEWS,
      },
    });
  }

  await prisma.competitorAccount.update({
    where: { id: account.id },
    data: { lastScrapedAt: new Date(), scrapeError: null },
  });
  console.log(`[competitor-mimic] @${account.handle}: ${posts.length} posts, median ${median}`);
  return posts.length;
}

const BRIEF_SYSTEM = `You are a creative strategist for a content studio. You are given a competitor's OUTLIER post — one that massively outperformed their baseline — plus a brief on OUR audience and brand voice.

Extract the transferable mechanic so our studio can run the same play in OUR voice. Never copy their words; extract WHY it worked.

RULES:
- "hook": the opening mechanic in one sentence (the shape, not their words).
- "format": the structural format in one sentence.
- "whyItWorks": the psychological reason the audience responded, one sentence.
- "howWeApply": one or two sentences — the same mechanic translated into OUR brand's register and subject matter.
- "phrases": 2-4 short audience-vocabulary words/fragments tied to the emotion (never lines from the post).
- Never mention the creator, any platform, "viral", "trend", or "competitor" in any field — downstream copy must not reveal the source.

OUTPUT (strict JSON, no markdown): {"hook":"...","format":"...","whyItWorks":"...","howWeApply":"...","phrases":["..."]}`;

const BRAND_VOICE_BRIEF: Record<"ripple" | "bwk", string> = {
  ripple:
    "OUR BRAND (Ripple): quiet, reflective content for women ~40-50 carrying a heavy mental load. Emotional, personal, never preachy.",
  bwk: "OUR BRAND (BWK): stark, disciplined content for young men building self-respect. Command register, no fluff.",
};

/**
 * Write mimic briefs for un-briefed outliers (cost-capped per run).
 * Returns the number of briefs written.
 */
export async function writeMimicBriefs(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  // briefAt null ⇔ no brief written yet (set together, so one filter).
  const pending = await prisma.competitorPost.findMany({
    where: { isOutlier: true, briefAt: null },
    orderBy: { outlierScore: "desc" },
    take: MAX_BRIEFS_PER_RUN,
    include: { account: true },
  });

  let written = 0;
  for (const post of pending) {
    const brand = post.account.brand === "bwk" ? "bwk" : "ripple";
    const userMsg = [
      BRAND_VOICE_BRIEF[brand],
      "",
      `OUTLIER POST (${post.account.platform}, niche: ${post.account.niche ?? "unspecified"}):`,
      `Performance: ${post.views.toLocaleString()} views (${post.outlierScore}x their baseline), ${post.likes.toLocaleString()} likes, ${post.comments.toLocaleString()} comments.`,
      `Caption/text: ${post.caption?.slice(0, 1500) || "(no caption — visual-only post)"}`,
    ].join("\n");

    const start = Date.now();
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system: BRIEF_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });
      await prisma.claudeCallLog.create({
        data: {
          purpose: "competitor-mimic-brief",
          model: CLAUDE_MODEL,
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          costCents: Math.ceil(
            (response.usage.input_tokens * INPUT_COST_PER_TOKEN +
              response.usage.output_tokens * OUTPUT_COST_PER_TOKEN) *
              100
          ),
          durationMs: Date.now() - start,
          success: true,
        },
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(
        text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      ) as Partial<MimicBrief>;
      if (
        typeof parsed.hook !== "string" ||
        typeof parsed.format !== "string" ||
        typeof parsed.whyItWorks !== "string" ||
        typeof parsed.howWeApply !== "string"
      ) {
        console.warn(`[competitor-mimic] brief parse missing fields for ${post.id}`);
        continue;
      }
      const brief: MimicBrief = {
        hook: parsed.hook.trim(),
        format: parsed.format.trim(),
        whyItWorks: parsed.whyItWorks.trim(),
        howWeApply: parsed.howWeApply.trim(),
        phrases: Array.isArray(parsed.phrases)
          ? parsed.phrases.filter((p): p is string => typeof p === "string").slice(0, 4)
          : [],
      };
      await prisma.competitorPost.update({
        where: { id: post.id },
        data: { brief: brief as unknown as object, briefAt: new Date() },
      });
      written++;
    } catch (e) {
      console.warn(`[competitor-mimic] brief failed for ${post.id}:`, e);
      await prisma.claudeCallLog
        .create({
          data: {
            purpose: "competitor-mimic-brief",
            model: CLAUDE_MODEL,
            tokensIn: 0,
            tokensOut: 0,
            costCents: 0,
            durationMs: Date.now() - start,
            success: false,
            errorMessage:
              e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
          },
        })
        .catch(() => {});
    }
  }
  return written;
}

/** Scrape every ACTIVE account (all brands). Returns accounts scraped. */
export async function scrapeAllAccounts(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  if (!process.env.APIFY_TOKEN) {
    console.warn("[competitor-mimic] APIFY_TOKEN not set — skipping scrape");
    return 0;
  }
  const accounts = await prisma.competitorAccount.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  let ok = 0;
  for (const a of accounts) {
    if ((await scrapeAccount(a.id)) > 0) ok++;
  }
  return ok;
}

interface BriefedPost {
  id: string;
  outlierScore: number;
  brief: MimicBrief;
}

/** Recent briefed outliers for a brand, strongest first. */
async function recentBriefs(
  brand: "ripple" | "bwk",
  days: number
): Promise<BriefedPost[]> {
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.competitorPost.findMany({
    where: {
      isOutlier: true,
      briefAt: { gte: cutoff },
      account: { brand, status: "ACTIVE" },
    },
    orderBy: { outlierScore: "desc" },
    take: 10,
    select: { id: true, outlierScore: true, brief: true },
  });
  return rows
    .filter((r) => r.brief && typeof r.brief === "object")
    .map((r) => ({
      id: r.id,
      outlierScore: r.outlierScore,
      brief: r.brief as unknown as MimicBrief,
    }));
}

/**
 * "WHAT'S WINNING" inspiration block appended to lane system prompts
 * alongside the Reddit audience pulse. Returns "" when no briefs exist
 * so callers can concatenate unconditionally. Influence only.
 */
export async function getMimicSignal(brand: "ripple" | "bwk"): Promise<string> {
  const briefs = (await recentBriefs(brand, 7)).slice(0, 3);
  if (briefs.length === 0) return "";
  return [
    "",
    "WHAT'S WINNING WITH THIS AUDIENCE RIGHT NOW (from live creative research):",
    ...briefs.map(
      (b) =>
        `- Hook: ${b.brief.hook} Format: ${b.brief.format} Why: ${b.brief.whyItWorks}`
    ),
    "Borrow a MECHANIC (hook shape, format, emotional beat) if it fits naturally — the lane's own format, theme, and voice rules always come first. Never copy wording, never mention research, creators, or trends.",
  ].join("\n");
}

/**
 * Strongest fresh brief for the mimic-mandate lanes. Prefers briefs no
 * mandate lane has used yet, then least-recently-used; marks the pick
 * as used so tomorrow rotates. Null = no briefs (lane falls back to
 * generating from its standing spec theme alone).
 */
export async function getTopMimicBrief(
  brand: "ripple" | "bwk"
): Promise<MimicBrief | null> {
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const row = await prisma.competitorPost.findFirst({
    where: {
      isOutlier: true,
      briefAt: { gte: cutoff },
      account: { brand, status: "ACTIVE" },
    },
    orderBy: [{ mandatedAt: { sort: "asc", nulls: "first" } }, { outlierScore: "desc" }],
    select: { id: true, brief: true },
  });
  if (!row?.brief || typeof row.brief !== "object") return null;
  await prisma.competitorPost.update({
    where: { id: row.id },
    data: { mandatedAt: new Date() },
  });
  return row.brief as unknown as MimicBrief;
}
