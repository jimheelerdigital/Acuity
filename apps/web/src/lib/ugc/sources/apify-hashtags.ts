/**
 * Apify hashtag discovery for Instagram and TikTok (UGC outreach). Samples
 * recent posts for the UGC, persona and creator-type hashtags in config.ts
 * and returns each post's owner as a candidate. Same actors as
 * niche-research.ts / hashtag-trends.ts, run through runApifyCapped so the
 * run stops at APIFY_SPEND_CAP_PER_RUN or MAX_PROFILES_PER_RUN.
 *
 * TikTok hashtag items carry the author's followers, bio and bio link, so
 * TikTok candidates arrive mostly enriched. Instagram items only carry the
 * owner's handle; enrich.ts fills in the profile.
 */
import { runApifyCapped } from "@/lib/ugc/apify";
import { RESULTS_PER_HASHTAG, allHashtags, type Platform } from "@/lib/ugc/config";
import {
  candidateKey,
  normalizeHandle,
  profileUrlFor,
  type Candidate,
  type SourceAdapter,
} from "@/lib/ugc/sources/types";

const IG_HASHTAG_ACTOR = process.env.APIFY_IG_HASHTAG_ACTOR || "apify~instagram-hashtag-scraper";
const TIKTOK_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

export function parseInstagramHashtagItem(it: Record<string, unknown>, tag: string): Candidate | null {
  const owner = str(it.ownerUsername);
  if (!owner || it.error) return null;
  const handle = normalizeHandle(owner);
  return {
    platform: "instagram",
    handle,
    source: "apify-hashtag",
    displayName: str(it.ownerFullName) || null,
    profileUrl: profileUrlFor("instagram", handle),
    lastPostAt: str(it.timestamp) || null,
    seenIn: [`#${tag}`],
    sampleCaptions: str(it.caption) ? [str(it.caption).slice(0, 300)] : [],
  };
}

export function parseTikTokItem(it: Record<string, unknown>, tag: string): Candidate | null {
  const a = (it.authorMeta ?? {}) as Record<string, unknown>;
  const name = str(a.name);
  if (!name || it.error) return null;
  const handle = normalizeHandle(name);
  const bioLink = a.bioLink as unknown;
  return {
    platform: "tiktok",
    handle,
    source: "apify-hashtag",
    displayName: str(a.nickName) || null,
    profileUrl: profileUrlFor("tiktok", handle),
    bio: str(a.signature) || null,
    followers: num(a.fans),
    linkInBio: typeof bioLink === "string" ? bioLink : str((bioLink as Record<string, unknown> | null)?.link) || null,
    lastPostAt: str(it.createTimeISO) || null,
    seenIn: [`#${tag}`],
    sampleCaptions: str(it.text) ? [str(it.text).slice(0, 300)] : [],
  };
}

/** One hashtag on one platform → candidates + what it cost. */
export async function scrapeHashtag(
  platform: Platform,
  tag: string,
  maxUsd: number,
  maxItems = RESULTS_PER_HASHTAG
): Promise<{ candidates: Candidate[]; costUsd: number }> {
  if (platform === "instagram") {
    const run = await runApifyCapped(
      IG_HASHTAG_ACTOR,
      { hashtags: [tag], resultsLimit: maxItems, resultsType: "posts" },
      { maxItems, maxUsd }
    );
    return {
      candidates: run.items.map((it) => parseInstagramHashtagItem(it, tag)).filter((c): c is Candidate => !!c),
      costUsd: run.costUsd,
    };
  }
  const run = await runApifyCapped(
    TIKTOK_ACTOR,
    {
      hashtags: [tag],
      resultsPerPage: maxItems,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
    },
    { maxItems, maxUsd }
  );
  return {
    candidates: run.items.map((it) => parseTikTokItem(it, tag)).filter((c): c is Candidate => !!c),
    costUsd: run.costUsd,
  };
}

/** Every (platform, hashtag) pair the weekly run walks, in order. */
export function hashtagJobs(platforms: Platform[]): { platform: Platform; tag: string }[] {
  const tags = allHashtags();
  // Interleave platforms so a run cut short by the cap still covers both.
  return tags.flatMap((tag) => platforms.map((platform) => ({ platform, tag })));
}

/** Adapter form, for callers that want the whole source in one go. */
export const apifyHashtagSource: SourceAdapter = {
  name: "apify-hashtag",
  async discover({ max, budget, skip }) {
    const out = new Map<string, Candidate>();
    for (const job of hashtagJobs(["instagram", "tiktok"])) {
      if (out.size >= max || budget.remainingUsd() <= 0) break;
      const r = await scrapeHashtag(job.platform, job.tag, budget.remainingUsd());
      budget.add(r.costUsd);
      for (const c of r.candidates) {
        const key = candidateKey(c);
        if (skip.has(key) || out.has(key)) continue;
        out.set(key, c);
        if (out.size >= max) break;
      }
    }
    return Array.from(out.values());
  },
};
