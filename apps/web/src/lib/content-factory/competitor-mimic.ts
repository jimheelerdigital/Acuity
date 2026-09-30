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

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import { copyObjectives } from "./copy-objectives";

const anthropic = contentAnthropic;
const CLAUDE_MODEL = CONTENT_MODEL;
/** Briefs stay usable for 9 days: the scrape runs weekly, plus slack for a missed run. */
const BRIEF_FRESH_MS = 9 * 24 * 3600 * 1000;
const INPUT_COST_PER_TOKEN = CONTENT_INPUT_COST_PER_TOKEN;
const OUTPUT_COST_PER_TOKEN = CONTENT_OUTPUT_COST_PER_TOKEN;

const APIFY_BASE = "https://api.apify.com/v2/acts";
/** Posts pulled per account per scrape. Cut 20→10 on 2026-09-21 for Apify plan limits. */
const POSTS_PER_ACCOUNT = 10;
/** views ÷ median ≥ this ⇒ outlier. */
const OUTLIER_MULTIPLE = 3;
/** Absolute views floor so tiny accounts don't flag 3× of nothing. */
const OUTLIER_MIN_VIEWS = 10_000;
/** Max new briefs written per run (cost guard). */
const MAX_BRIEFS_PER_RUN = 8;
/** Candidates Jev screens before the MAX_BRIEFS_PER_RUN cut (Jev #5). */
const TRIAGE_POOL = 40;

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
 * (Also used by hashtag-trends.ts for the hashtag top-video feed.)
 */
export async function runApifyActor(
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

/**
 * 2026-09-28 (Sonnet 5.5 rewrite): opens with the brand's copyObjectives
 * (which replaced the old one-line BRAND_VOICE_BRIEF in the user message)
 * and asks for the transferable mechanic, with why it earned comments,
 * saves or sends, rather than a summary of the post.
 */
function briefSystem(brand: "ripple" | "bwk"): string {
  return `${copyObjectives(brand)}

YOUR JOB TODAY: creative strategy for the account above. You get one post from another account in a nearby niche that far outperformed that account's usual numbers. Work out the mechanic that made it work, so our writers can run the same play with our own subject, our own words and our own voice.

The mechanic is the part that transfers: the shape of the hook, how the post is structured from first line to last, and the reason people stopped, kept going, and then commented, saved or sent it. The topic and the wording do not transfer; they belong to that creator. If the caption is thin, reason from what is there and from the numbers (a high comment count usually means the post asked for recognition or an opinion).

Fields:
- "hook": the opening mechanic in one sentence, described as a shape ("opens by naming a private habit the reader thinks only she has"), never their words.
- "format": the structure in one sentence (how many beats, what each one does, how it ends).
- "whyItWorks": one sentence on what the audience got from it that made them engage: recognition, a usable detail, a line worth sending, a question they wanted to answer.
- "howWeApply": one or two sentences running the same mechanic on a subject that belongs to our reader, in our voice. For Ripple that means naming what she carries, as a mirror, never advice. For Build With Key it means a concrete standard or command. Be specific enough that a writer could start from it.
- "phrases": 2-4 short fragments in our audience's everyday vocabulary tied to the feeling (a few words each), never lines from the post.

These briefs feed public posts, so no field may mention the creator, any platform, "viral", "trend" or "competitor".

Return {"hook":"...","format":"...","whyItWorks":"...","howWeApply":"...","phrases":["..."]}. Return only the JSON object.`;
}

/**
 * Write mimic briefs for un-briefed outliers (cost-capped per run).
 * Returns the number of briefs written.
 */
export async function writeMimicBriefs(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  // briefAt null ⇔ no brief written yet (set together, so one filter).
  // Jev #5 (2026-09-30): pull a wider pool, let Jev drop ad/product/
  // giveaway posts and rank the rest by how learnable the format is for
  // our brand, then brief the best MAX_BRIEFS_PER_RUN. Jev off/failed ⇒
  // the first MAX_BRIEFS_PER_RUN by outlierScore, exactly as before.
  // Dropped promo posts stay un-briefed and are simply re-screened (and
  // dropped again) next run — cheap, and no schema change needed.
  const pool = await prisma.competitorPost.findMany({
    where: { isOutlier: true, briefAt: null },
    orderBy: { outlierScore: "desc" },
    take: TRIAGE_POOL,
    include: { account: true },
  });
  let pending = pool.slice(0, MAX_BRIEFS_PER_RUN);
  try {
    const { triageCompetitorPosts } = await import("./research-triage");
    const t = await triageCompetitorPosts(
      pool.map((p) => ({
        id: p.id,
        brand: p.account.brand === "bwk" ? ("bwk" as const) : ("ripple" as const),
        platform: p.account.platform,
        handle: p.account.handle,
        niche: p.account.niche,
        caption: p.caption,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        outlierScore: p.outlierScore,
      })),
      MAX_BRIEFS_PER_RUN
    );
    if (t) {
      const byId = new Map(pool.map((p) => [p.id, p]));
      pending = t.ids.map((id) => byId.get(id)!).filter(Boolean);
    }
  } catch (e) {
    console.warn("[competitor-mimic] triage failed — using outlier order", e);
  }

  let written = 0;
  for (const post of pending) {
    const brand = post.account.brand === "bwk" ? "bwk" : "ripple";
    const userMsg = [
      `OUTLIER POST (${post.account.platform}, niche: ${post.account.niche ?? "unspecified"}):`,
      `Performance: ${post.views.toLocaleString()} views (${post.outlierScore}x their baseline), ${post.likes.toLocaleString()} likes, ${post.comments.toLocaleString()} comments.`,
      `Caption/text: ${post.caption?.slice(0, 1500) || "(no caption — visual-only post)"}`,
    ].join("\n");

    const start = Date.now();
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 900,
        system: briefSystem(brand),
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
        lastJsonText(text)
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
  const briefs = (await recentBriefs(brand, BRIEF_FRESH_MS / (24 * 3600 * 1000))).slice(0, 3);
  if (briefs.length === 0) return "";
  return [
    "",
    "WHAT'S WINNING WITH THIS AUDIENCE RIGHT NOW: mechanics from posts in nearby niches that far outperformed their usual numbers.",
    ...briefs.map(
      (b) =>
        `- Hook: ${b.brief.hook} Format: ${b.brief.format} Why: ${b.brief.whyItWorks}`
    ),
    "If one of these fits this lane naturally, borrow its mechanic (the hook shape, the structure, the thing that earned the comment or save) and apply it to our own subject in our own words. The lane's own format, theme and voice rules come first; skip these rather than force one. Never reuse another creator's wording, and never mention research, creators or trends in the copy.",
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
  const cutoff = new Date(Date.now() - BRIEF_FRESH_MS);
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
