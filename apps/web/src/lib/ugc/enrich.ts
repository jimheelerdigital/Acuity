/**
 * Enrichment for UGC outreach, in two stages to save money.
 *
 * Cheap (every candidate): follower count, days since last post, business
 * email from the bio or the link-in-bio page, a portfolio link, whether
 * they say "UGC" or list rates, stated credentials. Instagram needs one
 * batched profile scrape; TikTok hashtag items already carry most of it.
 * Link-in-bio pages are fetched directly (free).
 *
 * Expensive (top FINAL_SCORE_LIMIT only, after the rough score): average
 * views on the last 10 videos and captions + transcripts of the 5 most
 * recent. TikTok transcripts come from its own subtitles; Instagram reels
 * go through Whisper (skipped above MAX_TRANSCRIBE_BYTES).
 */
import { runApifyCapped } from "@/lib/ugc/apify";
import {
  MAX_FOLLOWERS,
  MAX_TRANSCRIBE_BYTES,
  WHISPER_PRICE_PER_MINUTE,
} from "@/lib/ugc/config";
import type { Candidate, CandidateVideo } from "@/lib/ugc/sources/types";

const IG_PROFILE_ACTOR = process.env.APIFY_IG_ACTOR || "apify~instagram-profile-scraper";
const IG_POSTS_ACTOR = "apify~instagram-scraper";
const TIKTOK_PROFILE_ACTOR = "clockworks~tiktok-profile-scraper";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

// ─── Text signals (pure, tested) ───────────────────────────────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL_RE = /(example\.com|sentry|wixpress|\.png|\.jpg|noreply|no-reply|@2x)/i;

export function findEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const hits = (text.match(EMAIL_RE) ?? []).filter((e) => !JUNK_EMAIL_RE.test(e));
  return hits[0]?.toLowerCase() ?? null;
}

export function mentionsUgc(text: string): boolean {
  return /\bugc\b|user[- ]generated|content creator for brands|brand (deals|collabs?)|work with me/i.test(text);
}

export function listsRates(text: string): boolean {
  return /\brates?\b|rate card|pricing|packages?\b|\$\s?\d{2,4}/i.test(text);
}

const CREDENTIAL_RE =
  /\b(LCSW|LMFT|LPC|LPCC|LMHC|LCPC|MSW|PsyD|Ph\.?D|RN|NBC-HWC|ICF|ACC|PCC|licensed (therapist|counselor)|therapist|psychotherapist|counsell?or|social worker|life coach|certified coach|health coach|psychologist)\b/gi;

export function findCredentials(text: string): string | null {
  const hits = Array.from(new Set((text.match(CREDENTIAL_RE) ?? []).map((h) => h.trim())));
  return hits.length ? hits.slice(0, 4).join(", ") : null;
}

const PORTFOLIO_RE =
  /https?:\/\/[^\s"'<>]*(portfolio|ugc|media-?kit|canva\.site|notion\.site|behance|my\.flodesk|work-with-me|workwithme|rates|drive\.google)[^\s"'<>]*/gi;

export function findPortfolio(text: string): string | null {
  const m = text.match(PORTFOLIO_RE);
  return m?.[0] ?? null;
}

/** Fill the text-derived fields from everything we know so far. */
export function applyTextSignals(c: Candidate, extraText = ""): Candidate {
  const text = [c.bio, ...(c.sampleCaptions ?? []), extraText].filter(Boolean).join("\n");
  c.email = c.email ?? findEmail(c.bio) ?? findEmail(extraText);
  c.mentionsUgc = Boolean(c.mentionsUgc) || mentionsUgc(text);
  c.listsRates = Boolean(c.listsRates) || listsRates([c.bio, extraText].join("\n"));
  c.credentials = c.credentials ?? findCredentials(text);
  c.portfolioUrl = c.portfolioUrl ?? findPortfolio(extraText) ?? findPortfolio(c.bio ?? "");
  return c;
}

/** Cheap-stage drop reason, or null to keep. */
export function cheapDropReason(c: Candidate): string | null {
  if (c.followers != null && c.followers > MAX_FOLLOWERS) return `over ${MAX_FOLLOWERS} followers`;
  if (c.source !== "manual" && !c.email && !c.portfolioUrl) return "no email and no portfolio link";
  return null;
}

// ─── Link in bio (free) ────────────────────────────────────────────────────

/**
 * Fetch the link-in-bio page and pull an email and portfolio link from it.
 * Linktree/Beacons/Stan pages render their links in the HTML. Never throws.
 */
export async function scanLinkInBio(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const res = await fetch(href, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RippleCreatorResearch/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 400_000);
    // mailto: links first, then hrefs, then visible text.
    const mailtos = Array.from(html.matchAll(/mailto:([^"'?<>\s]+)/gi)).map((m) => decodeURIComponent(m[1]));
    const hrefs = Array.from(html.matchAll(/href="(https?:\/\/[^"]+)"/gi)).map((m) => m[1]);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    return [mailtos.join(" "), hrefs.join(" "), text.replace(/\s+/g, " ").slice(0, 4000), href].join("\n");
  } catch {
    return "";
  }
}

// ─── Cheap stage: Instagram profiles (one Apify run per batch) ─────────────

export async function cheapEnrichInstagram(
  batch: Candidate[],
  maxUsd: number
): Promise<{ costUsd: number }> {
  if (batch.length === 0) return { costUsd: 0 };
  const run = await runApifyCapped(
    IG_PROFILE_ACTOR,
    { usernames: batch.map((c) => c.handle) },
    { maxItems: batch.length, maxUsd }
  );
  const byHandle = new Map(run.items.map((it) => [str(it.username).toLowerCase(), it]));
  for (const c of batch) {
    const it = byHandle.get(c.handle);
    if (!it || it.error) continue;
    c.displayName = c.displayName ?? (str(it.fullName) || null);
    c.bio = str(it.biography) || c.bio || null;
    c.followers = num(it.followersCount) ?? c.followers ?? null;
    const ext = str(it.externalUrl) || str(((it.externalUrls as Record<string, unknown>[] | undefined)?.[0] ?? {}).url);
    c.linkInBio = c.linkInBio ?? (ext || null);
    c.email = c.email ?? (findEmail(str(it.businessEmail) || str(it.publicEmail)) || null);
    const posts = (it.latestPosts as Record<string, unknown>[] | undefined) ?? [];
    const times = posts.map((p) => str(p.timestamp)).filter(Boolean).sort();
    if (times.length) c.lastPostAt = times[times.length - 1];
    c.sampleCaptions = [
      ...(c.sampleCaptions ?? []),
      ...posts.slice(0, 4).map((p) => str(p.caption).slice(0, 300)).filter(Boolean),
    ].slice(0, 6);
  }
  return { costUsd: run.costUsd };
}

/** TikTok manual adds arrive bare; one profile scrape fills them in. */
export async function cheapEnrichTikTok(batch: Candidate[], maxUsd: number): Promise<{ costUsd: number }> {
  const bare = batch.filter((c) => c.followers == null);
  if (bare.length === 0) return { costUsd: 0 };
  const run = await runApifyCapped(
    TIKTOK_PROFILE_ACTOR,
    { profiles: bare.map((c) => c.handle), resultsPerPage: 3, shouldDownloadVideos: false, shouldDownloadCovers: false },
    { maxItems: bare.length * 3, maxUsd }
  );
  for (const it of run.items) {
    const a = (it.authorMeta ?? {}) as Record<string, unknown>;
    const c = bare.find((x) => x.handle === str(a.name).toLowerCase());
    if (!c) continue;
    c.followers = c.followers ?? num(a.fans);
    c.bio = c.bio ?? (str(a.signature) || null);
    c.displayName = c.displayName ?? (str(a.nickName) || null);
    const link = a.bioLink as unknown;
    c.linkInBio = c.linkInBio ?? (typeof link === "string" ? link : str((link as Record<string, unknown> | null)?.link) || null);
    const t = str(it.createTimeISO);
    if (t && (!c.lastPostAt || t > c.lastPostAt)) c.lastPostAt = t;
  }
  return { costUsd: run.costUsd };
}

// ─── Expensive stage ───────────────────────────────────────────────────────

async function transcribeUrl(url: string, durationSec: number | null): Promise<{ text: string | null; costUsd: number }> {
  if (!process.env.OPENAI_API_KEY || !url) return { text: null, costUsd: 0 };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { text: null, costUsd: 0 };
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_TRANSCRIBE_BYTES) return { text: null, costUsd: 0 };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_TRANSCRIBE_BYTES) return { text: null, costUsd: 0 };
    const { default: OpenAI, toFile } = await import("openai");
    const client = new OpenAI();
    const out = await client.audio.transcriptions.create({
      file: await toFile(buf, "clip.mp4", { type: "video/mp4" }),
      model: "whisper-1",
      response_format: "text",
    });
    const minutes = Math.max(1, Math.ceil((durationSec ?? 60) / 60));
    return { text: String(out).trim().slice(0, 1500) || null, costUsd: minutes * WHISPER_PRICE_PER_MINUTE };
  } catch {
    return { text: null, costUsd: 0 };
  }
}

function vttToText(vtt: string): string {
  return vtt
    .split("\n")
    .filter((l) => l && !/^WEBVTT|-->|^\d+$|^NOTE/.test(l.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

/**
 * Last 10 videos → average views; 5 most recent → captions + transcripts.
 * Returns Apify cost and transcription cost separately for the report.
 */
export async function deepEnrichBatch(
  batch: Candidate[],
  maxUsd: number
): Promise<{ apifyUsd: number; modelUsd: number }> {
  let apifyUsd = 0;
  let modelUsd = 0;
  const ig = batch.filter((c) => c.platform === "instagram");
  const tt = batch.filter((c) => c.platform === "tiktok");

  if (ig.length && maxUsd > 0) {
    const run = await runApifyCapped(
      IG_POSTS_ACTOR,
      {
        directUrls: ig.map((c) => `https://www.instagram.com/${c.handle}/`),
        resultsType: "posts",
        resultsLimit: 10,
        addParentData: false,
      },
      { maxItems: ig.length * 10, maxUsd }
    );
    apifyUsd += run.costUsd;
    for (const c of ig) {
      const posts = run.items
        .filter((p) => str(p.ownerUsername).toLowerCase() === c.handle)
        .filter((p) => str(p.type) === "Video" || p.videoUrl)
        .sort((a, b) => str(b.timestamp).localeCompare(str(a.timestamp)))
        .slice(0, 10);
      const views = posts.map((p) => num(p.videoPlayCount) ?? num(p.videoViewCount)).filter((v): v is number => v != null);
      c.avgViews = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null;
      const videos: CandidateVideo[] = [];
      for (const p of posts.slice(0, 5)) {
        const t = await transcribeUrl(str(p.videoUrl), num(p.videoDuration));
        modelUsd += t.costUsd;
        videos.push({
          url: str(p.url) || `https://www.instagram.com/p/${str(p.shortCode)}/`,
          caption: str(p.caption).slice(0, 600) || null,
          transcript: t.text,
          views: num(p.videoPlayCount) ?? num(p.videoViewCount),
          postedAt: str(p.timestamp) || null,
          thumbnailUrl: str(p.displayUrl) || null,
        });
      }
      c.recentVideos = videos;
      if (videos[0]?.postedAt && (!c.lastPostAt || videos[0].postedAt > c.lastPostAt)) c.lastPostAt = videos[0].postedAt;
    }
  }

  if (tt.length && maxUsd - apifyUsd > 0) {
    const run = await runApifyCapped(
      TIKTOK_PROFILE_ACTOR,
      {
        profiles: tt.map((c) => c.handle),
        resultsPerPage: 10,
        profileScrapeSections: ["videos"],
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: true,
      },
      { maxItems: tt.length * 10, maxUsd: maxUsd - apifyUsd }
    );
    apifyUsd += run.costUsd;
    for (const c of tt) {
      const posts = run.items
        .filter((p) => str(((p.authorMeta ?? {}) as Record<string, unknown>).name).toLowerCase() === c.handle)
        .sort((a, b) => str(b.createTimeISO).localeCompare(str(a.createTimeISO)))
        .slice(0, 10);
      const views = posts.map((p) => num(p.playCount)).filter((v): v is number => v != null);
      c.avgViews = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null;
      const videos: CandidateVideo[] = [];
      for (const p of posts.slice(0, 5)) {
        const meta = (p.videoMeta ?? {}) as Record<string, unknown>;
        const subs = (meta.subtitleLinks as Record<string, unknown>[] | undefined) ?? [];
        const en = subs.find((s) => /^en/i.test(str(s.language))) ?? subs[0];
        let transcript: string | null = null;
        const link = en ? str(en.downloadLink) || str(en.tiktokLink) : "";
        if (link) {
          transcript = await fetch(link, { signal: AbortSignal.timeout(10_000) })
            .then((r) => (r.ok ? r.text() : ""))
            .then((t) => vttToText(t) || null)
            .catch(() => null);
        }
        videos.push({
          url: str(p.webVideoUrl),
          caption: str(p.text).slice(0, 600) || null,
          transcript,
          views: num(p.playCount),
          postedAt: str(p.createTimeISO) || null,
          thumbnailUrl: str(meta.coverUrl) || null,
        });
      }
      c.recentVideos = videos;
      if (videos[0]?.postedAt && (!c.lastPostAt || videos[0].postedAt > c.lastPostAt)) c.lastPostAt = videos[0].postedAt;
    }
  }
  return { apifyUsd, modelUsd };
}

export const _test = { vttToText };
