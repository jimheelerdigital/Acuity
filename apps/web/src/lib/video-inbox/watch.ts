/**
 * Video inbox (2026-10-29, per Keenan: "set up a system where I just send
 * you instagram/youtube/tiktok videos where you can pull them yourself and
 * look at what they do"). One video, four steps, each its own Inngest step
 * (inngest/functions/video-inbox.ts):
 *
 *   1. fetchSource     — Apify pulls the IG/TikTok post (video file, slides,
 *                        subtitles, numbers); YouTube needs only its link.
 *   2. watchVideo      — Gemini watches it with sound and writes detailed
 *                        notes. Without Gemini (no key / no credits), IG and
 *                        TikTok fall back to frames + subtitles through Claude.
 *   3. writeBreakdown  — Claude turns the notes into the breakdown we keep:
 *                        hook, first seconds, structure, why it worked, how
 *                        we'd use it, transferable lessons, tags.
 *   4. emailBreakdown  — the breakdown goes to Keenan.
 *
 * The weekly distill (playbook.ts) turns the library into lessons.
 */

import { runApifyActor } from "@/lib/content-factory/competitor-mimic";
import {
  cleanSubtitles,
  download,
  toJpeg,
  urlsFrom,
  videoFrames,
} from "@/lib/content-factory/competitor-media";
import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
  messageText,
} from "@/lib/content-factory/claude-client";
import { escapeHtml } from "@/lib/escape-html";

export type VideoPlatform = "youtube" | "instagram" | "tiktok";
export type VideoBrand = "ripple" | "bwk" | "mythicals" | "general";
export const VIDEO_BRANDS: VideoBrand[] = ["ripple", "bwk", "mythicals", "general"];

/** Same link sent again within this window returns the earlier breakdown. */
const DEDUPE_MS = 30 * 24 * 3600 * 1000;

export const BRAND_CONTEXT: Record<Exclude<VideoBrand, "general">, string> = {
  ripple:
    "Ripple (@ripplevoice): an AI life optimizer (habit tracker, voice journal, insight tool) for women about 40 to 50 carrying a heavy mental load. The content niche is the load in her head: over-functioning, holding everything for everyone, and the escape and relief from it. Never claims to treat or replace therapy.",
  bwk: "Build with Key (BWK, @bwk.motivation): men's motivation and self-improvement. Luxury aspiration (the car, the view, the life he is working toward), discipline, covers written as commands.",
  mythicals:
    "Legendary Mythicals: an epic fantasy account. Colossal mythical beasts, dragons, legendary weapons, armor and armored heroes, always animated. Main format: 'which would you choose?' pick-one posts. Grows its own audience; it does not sell Ripple.",
};

// ─── Links ─────────────────────────────────────────────────────────────────

/**
 * A shared link → canonical URL + platform, or null when it isn't a video
 * link we can watch. TikTok short links (vm./vt.tiktok.com) are resolved.
 */
export async function parseVideoUrl(raw: string): Promise<{ url: string; platform: VideoPlatform } | null> {
  const found = raw.match(/https?:\/\/[^\s<>"']+/)?.[0];
  if (!found) return null;
  let u: URL;
  try {
    u = new URL(found);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? { url: `https://www.youtube.com/watch?v=${id}`, platform: "youtube" } : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const shorts = u.pathname.match(/^\/(shorts|live)\/([\w-]+)/);
    if (shorts) return { url: `https://www.youtube.com/shorts/${shorts[2]}`, platform: "youtube" };
    const v = u.searchParams.get("v");
    return v ? { url: `https://www.youtube.com/watch?v=${v}`, platform: "youtube" } : null;
  }
  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
    if (!m) return null;
    return { url: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`, platform: "instagram" };
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com" || (host === "tiktok.com" && /^\/t\//.test(u.pathname))) {
    try {
      const res = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(15_000) });
      return parseVideoUrl(res.url === u.toString() ? "" : res.url);
    } catch {
      return null;
    }
  }
  if (host === "tiktok.com") {
    const m = u.pathname.match(/^\/@([\w.-]+)\/(video|photo)\/(\d+)/);
    return m ? { url: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}`, platform: "tiktok" } : null;
  }
  return null;
}

/** Save a shared link to the library. Same link within 30 days → the existing row. */
export async function enqueueVideo(input: {
  url: string;
  platform: VideoPlatform;
  note?: string | null;
  brand?: VideoBrand | null;
}): Promise<{ id: string; duplicate: boolean; status: string }> {
  const { prisma } = await import("@/lib/prisma");
  const note = input.note?.trim().slice(0, 2000) || null;
  const existing = await prisma.videoLesson.findFirst({
    where: { url: input.url, createdAt: { gte: new Date(Date.now() - DEDUPE_MS) }, status: { not: "FAILED" } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    // A second note on the same video still counts: append it.
    if (note && !existing.note?.includes(note)) {
      await prisma.videoLesson.update({
        where: { id: existing.id },
        data: { note: existing.note ? `${existing.note}\n${note}` : note },
      });
    }
    return { id: existing.id, duplicate: true, status: existing.status };
  }
  const row = await prisma.videoLesson.create({
    data: { url: input.url, platform: input.platform, note, brand: input.brand ?? null },
  });
  return { id: row.id, duplicate: false, status: row.status };
}

// ─── 1. Fetch ──────────────────────────────────────────────────────────────

export interface VideoSource {
  /** Downloadable video file (Apify copy or CDN link), when there is one. */
  videoUrl: string | null;
  /** Slide images for photo posts and carousels. */
  slideUrls: string[];
  transcript: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function fetchSource(id: string): Promise<VideoSource> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.videoLesson.findUniqueOrThrow({ where: { id } });
  await prisma.videoLesson.update({ where: { id }, data: { status: "WATCHING", error: null } });

  if (row.platform === "youtube") {
    // Title + channel from oEmbed (no key). Gemini fetches the video itself.
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(row.url)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) {
        const o = (await r.json()) as { title?: string; author_name?: string };
        await prisma.videoLesson.update({
          where: { id },
          data: { caption: o.title ?? null, author: o.author_name ?? null },
        });
      }
    } catch {
      /* the title is nice to have */
    }
    return { videoUrl: null, slideUrls: [], transcript: "" };
  }

  if (row.platform === "tiktok") {
    const items = await runApifyActor("clockworks~tiktok-scraper", {
      postURLs: [row.url],
      resultsPerPage: 1,
      shouldDownloadVideos: true,
      shouldDownloadSlideshowImages: true,
      downloadSubtitlesOptions: "DOWNLOAD_SUBTITLES",
      shouldDownloadCovers: false,
    });
    const it = items[0];
    if (!it || it.error) throw new Error(`TikTok post not found (${str(it?.error) || "no result"})`);
    const meta = (it.videoMeta ?? {}) as Record<string, unknown>;
    const author = (it.authorMeta ?? {}) as Record<string, unknown>;
    let transcript = "";
    const subs = Array.isArray(meta.subtitleLinks) ? (meta.subtitleLinks as Record<string, unknown>[]) : [];
    const sub = subs.find((s) => /^en/i.test(str(s.language))) ?? subs[0];
    const subUrl = sub ? urlsFrom(sub)[0] : undefined;
    if (subUrl) {
      const b = await download(subUrl, 2 * 1024 * 1024);
      if (b) transcript = cleanSubtitles(b.toString("utf8"));
    }
    await prisma.videoLesson.update({
      where: { id },
      data: {
        author: str(author.name) || str(author.nickName) || null,
        caption: str(it.text).slice(0, 4000) || null,
        views: num(it.playCount),
        likes: num(it.diggCount),
        comments: num(it.commentCount),
      },
    });
    return {
      videoUrl: urlsFrom(it.mediaUrls)[0] ?? (str(meta.downloadAddr) || null),
      slideUrls: urlsFrom(it.slideshowImageLinks ?? (it.imagePost as Record<string, unknown> | undefined)?.images).slice(0, 12),
      transcript,
    };
  }

  const items = await runApifyActor("apify~instagram-scraper", {
    directUrls: [row.url],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  });
  const it = items[0];
  if (!it || it.error) throw new Error(`Instagram post not found (${str(it?.error) || str(it?.errorDescription) || "no result"})`);
  await prisma.videoLesson.update({
    where: { id },
    data: {
      author: str(it.ownerUsername) || null,
      caption: str(it.caption).slice(0, 4000) || null,
      views: num(it.videoPlayCount) ?? num(it.videoViewCount) ?? num(it.playCount),
      likes: num(it.likesCount),
      comments: num(it.commentsCount),
    },
  });
  const children = Array.isArray(it.childPosts) ? (it.childPosts as Record<string, unknown>[]) : [];
  const slideUrls = children.length
    ? children.map((c) => str(c.displayUrl)).filter(Boolean)
    : [...(Array.isArray(it.images) ? (it.images as unknown[]).map(str) : []), str(it.displayUrl)].filter(Boolean);
  return { videoUrl: str(it.videoUrl) || null, slideUrls: [...new Set(slideUrls)].slice(0, 12), transcript: "" };
}

// ─── 2. Watch ──────────────────────────────────────────────────────────────

const WATCH_PROMPT = `You are watching a short-form social video so that a content strategist who cannot see it can learn exactly what it does and why it works. Your notes are the only thing they will have.

Report, in this order:
1. FIRST 3 SECONDS, beat by beat: the very first frame (what is in it, framing, motion), any text on screen word for word, the first words spoken or sung, sounds, and what changes by second 3.
2. ON-SCREEN TEXT: every caption, title and overlay, word for word, with rough timing.
3. SPOKEN WORDS: a close transcript of what is said (or "no speech"), and the voice: who, tone, pace.
4. VISUALS: shot by shot (or slide by slide): what is shown, camera movement, cuts, roughly how many cuts in total, style (filmed, AI, animated, screen recording, talking head, slideshow).
5. AUDIO: music (mood, tempo, whether it is a trending-style sound), sound effects, silence.
6. STRUCTURE: setup, middle, payoff, how it ends, any call to action (comment, follow, save, link).
7. LENGTH and PACING: rough total length and where the energy rises or drops.

Rules: describe only what is in THIS video. Prefer the exact words on screen over a paraphrase. If something is unreadable, write UNREADABLE rather than guessing. Timestamps are rough markers only.`;

export interface WatchResult {
  seenVia: "gemini" | "frames" | "slides" | "text";
  notes: string;
  /** Why Gemini wasn't used, when it wasn't. */
  geminiProblem?: string;
}

export async function watchVideo(id: string, src: VideoSource): Promise<WatchResult> {
  const { prisma } = await import("@/lib/prisma");
  const { watchYouTube, watchVideoFile, GeminiUnavailable } = await import("./gemini");
  const row = await prisma.videoLesson.findUniqueOrThrow({ where: { id } });

  let geminiProblem: string | undefined;
  let video: Buffer | null = null;
  if (row.platform === "youtube" || src.videoUrl) {
    try {
      let watched;
      if (row.platform === "youtube") {
        watched = await watchYouTube(row.url, WATCH_PROMPT);
      } else {
        video = await download(src.videoUrl!);
        if (!video) throw new Error("couldn't download the video file (over 80MB or link expired)");
        watched = await watchVideoFile(video, "video/mp4", WATCH_PROMPT);
      }
      const result: WatchResult = { seenVia: "gemini", notes: watched.text };
      await prisma.videoLesson.update({ where: { id }, data: { seenVia: "gemini", watchNotes: result.notes } });
      return result;
    } catch (e) {
      geminiProblem = e instanceof Error ? e.message.slice(0, 400) : String(e);
      if (row.platform === "youtube") {
        throw new Error(
          e instanceof GeminiUnavailable
            ? `YouTube videos need Gemini, and Gemini is unavailable: ${geminiProblem}`
            : `Gemini couldn't watch this YouTube video: ${geminiProblem}`
        );
      }
    }
  }

  // Fallback: frames (or slides) + subtitles, described by Claude.
  let images: Buffer[] = [];
  let seenVia: WatchResult["seenVia"] = "text";
  if (src.videoUrl) {
    video = video ?? (await download(src.videoUrl));
    if (video) images = await videoFrames(video);
    if (images.length) seenVia = "frames";
  }
  if (!images.length && src.slideUrls.length) {
    for (const u of src.slideUrls) {
      const b = await download(u, 15 * 1024 * 1024);
      const j = b ? await toJpeg(b) : null;
      if (j) images.push(j);
    }
    if (images.length) seenVia = "slides";
  }
  const what =
    seenVia === "frames"
      ? `The ${images.length} images are frames from the video, one every 2 seconds from the start, in order (so you only see roughly the first ${images.length * 2} seconds).`
      : seenVia === "slides"
        ? `The ${images.length} images are the post's slides, in order.`
        : "No images could be fetched; work from the caption and transcript.";
  const res = await contentAnthropic.messages.create({
    max_tokens: 2500,
    effort: "low",
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data: img.toString("base64") },
          })),
          {
            type: "text" as const,
            text: [
              WATCH_PROMPT,
              "",
              `You can't play the video. ${what}`,
              src.transcript ? `Subtitles (spoken words): ${src.transcript}` : "No subtitles available.",
              row.caption ? `Post caption: ${row.caption.slice(0, 1500)}` : "",
              "Say plainly what you could not see or hear.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
  });
  await logClaude("video-inbox-watch", res.usage);
  const notes = messageText(res).trim();
  await prisma.videoLesson.update({ where: { id }, data: { seenVia, watchNotes: notes } });
  return { seenVia, notes, geminiProblem };
}

// ─── 3. Breakdown ──────────────────────────────────────────────────────────

export interface Breakdown {
  brand: VideoBrand;
  summary: string;
  hook: string;
  firstSeconds: string;
  onScreenText: string;
  structure: string;
  pacing: string;
  audio: string;
  whyItWorked: string;
  howWeUseIt: string;
  /** 1–3 transferable mechanics, each one sentence. */
  lessons: string[];
  tags: string[];
  /** Keenan's note turned into a standing rule ("love this" / "never do this"), else null. */
  keenanRule: string | null;
}

const BREAKDOWN_SYSTEM = `You break down social videos for a small team that runs three accounts:
${Object.entries(BRAND_CONTEXT)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

You get detailed notes from someone who watched the video, its numbers, and sometimes a note from Keenan (the founder) saying why he saved it. Your job is to pull out the MECHANIC: what makes people stop, keep watching and respond. The topic and the creator's wording belong to them; the shape of the hook, the structure, the pacing and the reason it worked are what transfer.

Write plainly, like a sharp colleague. Be specific to THIS video: "opens on a close-up of a woman's hand dropping her keys, text 'nobody asks who carries the house'" beats "strong visual hook". If the notes say something couldn't be seen, don't invent it.

Return ONLY JSON:
{
  "brand": "ripple" | "bwk" | "mythicals" | "general",   // which of our accounts this is most useful for; Keenan's pick wins if he gave one
  "summary": "one sentence: what the video is",
  "hook": "the hook mechanic in one or two sentences",
  "firstSeconds": "what happens in the first 3 seconds and why it holds",
  "onScreenText": "the key on-screen text, word for word where it matters",
  "structure": "the beats from start to end, including the ending / call to action",
  "pacing": "length, cut rhythm, where energy rises or drops",
  "audio": "voice, music, sound, and the role each plays",
  "whyItWorked": "why this audience responded; tie it to the numbers when they're given",
  "howWeUseIt": "how the chosen account would run the same mechanic in its own voice and subject. Concrete: a sample cover line or opening",
  "lessons": ["1 to 3 transferable lessons, one sentence each, phrased as rules a writer can follow"],
  "tags": ["3 to 8 short kebab-case tags like hook:question, format:list, format:talking-head, open:pov, audio:voiceover, cta:comment-number"],
  "keenanRule": "if Keenan's note says he loves something or never wants something, his rule in one sentence in his own words; otherwise null"
}`;

export async function writeBreakdown(id: string): Promise<Breakdown> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.videoLesson.findUniqueOrThrow({ where: { id } });
  const numbers = [
    row.views != null ? `${row.views.toLocaleString()} views` : "",
    row.likes != null ? `${row.likes.toLocaleString()} likes` : "",
    row.comments != null ? `${row.comments.toLocaleString()} comments` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const userMsg = [
    `Platform: ${row.platform}. Link: ${row.url}`,
    row.author ? `Creator: ${row.author}` : "",
    numbers ? `Numbers: ${numbers}` : "Numbers: not available",
    row.caption ? `Caption / title: ${row.caption.slice(0, 1500)}` : "",
    row.brand ? `Keenan filed it under: ${row.brand}` : "",
    row.note ? `Keenan's note: ${row.note}` : "Keenan's note: none",
    `How it was seen: ${row.seenVia === "gemini" ? "watched in full with sound" : row.seenVia === "frames" ? "frames from the first seconds plus subtitles only" : row.seenVia === "slides" ? "its slides" : "text only"}`,
    "",
    "WATCH NOTES:",
    row.watchNotes ?? "(none)",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await contentAnthropic.messages.create({
    model: CONTENT_MODEL,
    max_tokens: 2500,
    effort: "medium",
    system: BREAKDOWN_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  await logClaude("video-inbox-breakdown", res.usage);
  const parsed = JSON.parse(lastJsonText(messageText(res))) as Partial<Breakdown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const brand = (row.brand as VideoBrand | null) ?? (VIDEO_BRANDS.includes(parsed.brand as VideoBrand) ? (parsed.brand as VideoBrand) : "general");
  const breakdown: Breakdown = {
    brand,
    summary: s(parsed.summary),
    hook: s(parsed.hook),
    firstSeconds: s(parsed.firstSeconds),
    onScreenText: s(parsed.onScreenText),
    structure: s(parsed.structure),
    pacing: s(parsed.pacing),
    audio: s(parsed.audio),
    whyItWorked: s(parsed.whyItWorked),
    howWeUseIt: s(parsed.howWeUseIt),
    lessons: (Array.isArray(parsed.lessons) ? parsed.lessons : []).map(s).filter(Boolean).slice(0, 3),
    tags: (Array.isArray(parsed.tags) ? parsed.tags : [])
      .map((t) => s(t).toLowerCase().replace(/[^a-z0-9:-]+/g, "-"))
      .filter(Boolean)
      .slice(0, 8),
    keenanRule: s(parsed.keenanRule) || null,
  };
  if (!breakdown.hook || !breakdown.whyItWorked) throw new Error("breakdown came back without a hook or why-it-worked");

  await prisma.videoLesson.update({
    where: { id },
    data: {
      brand: breakdown.brand,
      breakdown: breakdown as unknown as object,
      tags: breakdown.tags,
      status: "DONE",
      watchedAt: new Date(),
    },
  });
  // Keenan's own rule outranks the data: locked + approved straight away.
  if (breakdown.keenanRule && breakdown.brand !== "general") {
    await prisma.playbookLesson.create({
      data: {
        brand: breakdown.brand,
        lesson: breakdown.keenanRule,
        status: "APPROVED",
        locked: true,
        strength: 10,
        videoIds: [id],
        decidedAt: new Date(),
      },
    });
  }
  return breakdown;
}

export async function markFailed(id: string, error: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  await prisma.videoLesson.update({ where: { id }, data: { status: "FAILED", error: error.slice(0, 1000) } });
}

// ─── 4. Email ──────────────────────────────────────────────────────────────

export const KEENAN = "keenan@heelerdigital.com";
const BRAND_LABEL: Record<VideoBrand, string> = { ripple: "Ripple", bwk: "BWK", mythicals: "Mythicals", general: "General" };

export async function emailBreakdown(id: string, geminiProblem?: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const row = await prisma.videoLesson.findUniqueOrThrow({ where: { id } });

  if (row.status === "FAILED") {
    await sendEmailOrThrow({
      from: "hello@goripple.io",
      to: [KEENAN],
      replyTo: KEENAN,
      subject: `Video inbox: couldn't watch that ${row.platform} video`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;padding:20px;color:#1a1a1a">
        <p><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a></p>
        <p>${escapeHtml(row.error ?? "Unknown problem")}</p>
        <p style="color:#666;font-size:13px">Private or deleted posts can't be pulled. If it's public, send it again later or paste it to Claude.</p></div>`,
    });
    return;
  }

  const b = row.breakdown as unknown as Breakdown;
  const numbers = [
    row.views != null ? `${row.views.toLocaleString()} views` : "",
    row.likes != null ? `${row.likes.toLocaleString()} likes` : "",
    row.comments != null ? `${row.comments.toLocaleString()} comments` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const field = (label: string, v: string) =>
    v ? `<div style="margin:12px 0"><div style="font-size:12px;font-weight:700;color:#C4451C;text-transform:uppercase;letter-spacing:.04em">${label}</div><div style="margin-top:3px">${escapeHtml(v)}</div></div>` : "";
  const seen =
    row.seenVia === "gemini"
      ? "Watched in full with sound."
      : row.seenVia === "frames"
        ? `Read from frames and captions only${geminiProblem ? ` (Gemini unavailable: ${geminiProblem.slice(0, 160)})` : ""}.`
        : row.seenVia === "slides"
          ? "Read from the slides."
          : "Read from the caption only.";
  await sendEmailOrThrow({
    from: "hello@goripple.io",
    to: [KEENAN],
    replyTo: KEENAN,
    subject: `Video breakdown (${BRAND_LABEL[b.brand]}): ${b.summary.slice(0, 80)}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;font-size:14px;line-height:1.5">
      <div style="font-size:13px;color:#666"><a href="${escapeHtml(row.url)}">${escapeHtml(row.author ? `@${row.author.replace(/^@/, "")}` : row.url)}</a>${numbers ? ` · ${numbers}` : ""}</div>
      <h2 style="margin:6px 0 2px;font-size:18px">${escapeHtml(b.summary)}</h2>
      ${row.note ? `<div style="color:#666;font-size:13px">Your note: ${escapeHtml(row.note)}</div>` : ""}
      ${field("Hook", b.hook)}
      ${field("First 3 seconds", b.firstSeconds)}
      ${field("On-screen text", b.onScreenText)}
      ${field("Structure", b.structure)}
      ${field("Pacing", b.pacing)}
      ${field("Sound", b.audio)}
      ${field("Why it worked", b.whyItWorked)}
      ${field(`How ${BRAND_LABEL[b.brand]} could use it`, b.howWeUseIt)}
      ${b.lessons.length ? `<div style="margin:16px 0;padding:12px 14px;background:#FFF4EF;border-radius:10px"><strong>Lessons</strong><ul style="margin:6px 0 0;padding-left:18px">${b.lessons.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><div style="font-size:12px;color:#666;margin-top:6px">These go into Sunday's playbook update for your yes or no.</div></div>` : ""}
      ${b.keenanRule ? `<div style="margin:12px 0;padding:12px 14px;background:#F2FBF5;border-radius:10px"><strong>Saved as your rule:</strong> ${escapeHtml(b.keenanRule)}</div>` : ""}
      <div style="color:#999;font-size:12px;margin-top:18px">${escapeHtml(seen)} Tags: ${escapeHtml(b.tags.join(", "))}</div>
    </div>`,
  });
}

// ─── Shared ────────────────────────────────────────────────────────────────

export async function logClaude(purpose: string, usage: { input_tokens: number; output_tokens: number }): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  await prisma.claudeCallLog
    .create({
      data: {
        purpose,
        model: CONTENT_MODEL,
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
        costCents: Math.ceil(
          (usage.input_tokens * CONTENT_INPUT_COST_PER_TOKEN + usage.output_tokens * CONTENT_OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: 0,
        success: true,
      },
    })
    .catch(() => {});
}
