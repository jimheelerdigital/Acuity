/**
 * Content Factory — VOICED daily videos (2026-09-30, per Keenan: "if you
 * sent videos with a script (1 per lane) I could do the voiceover myself?"
 * → "one script of each, which I'll record and send the file back to you
 * to build the video off of" → visuals: "AI - higgsfield generated content
 * that matches the script").
 *
 * Daily loop, one Ripple + one BWK video:
 *   1. 12:00 UTC — Sonnet writes a 20-35s spoken script per brand (5-7
 *      lines, each with a matching people-free scene + one calm motion).
 *      Emailed to Keenan (BWK first) with pacing marks and an upload link.
 *   2. In the background: gpt-image-2 photo + Higgsfield clip per line.
 *   3. Keenan records on his phone and uploads on the no-login page
 *      /voiced/<date>/<brand>?t=<token>.
 *   4. The build: his voice normalized → Whisper word timings → clips cut
 *      to his lines, captions timed to his words, music ducked under him.
 *      Emailed back with an Approve link.
 *   5. Approve → a CarouselPost in lane "voiced-<brand>" with the finished
 *      video at reels/<postId>.mp4 → the normal publisher posts it to that
 *      brand's IG + FB at the next open slot.
 *
 * All state lives in the content-factory bucket under voiced/<date>/<brand>/
 * (no schema change): script.json, state.json, clips.json, shot-N.jpg,
 * clip-N.mp4, recording-<ts>.<ext>, voice.m4a, timeline.json, seg-N.mp4.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type VoicedBrand = "ripple" | "bwk";
export const VOICED_BRANDS: VoicedBrand[] = ["bwk", "ripple"];
const BUCKET = "content-factory";

export function isVoicedBrand(b: unknown): b is VoicedBrand {
  return b === "ripple" || b === "bwk";
}

export function voicedLane(brand: VoicedBrand): string {
  return `voiced-${brand}`;
}

export function voicedDir(date: string, brand: VoicedBrand): string {
  return `voiced/${date}/${brand}`;
}

/** Deterministic post id, so approving twice can't double-post. */
export function voicedPostId(date: string, brand: VoicedBrand): string {
  return `voiced-${date}-${brand}`;
}

export function voicedVideoPath(date: string, brand: VoicedBrand): string {
  return `reels/voiced-${date}-${brand}.mp4`;
}

export function publicUrl(p: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
}

const BASE_URL = () => (process.env.VOICED_BASE_URL || "https://goripple.io").replace(/\/$/, "");

// ── Token (no-login links) ─────────────────────────────────────────────

export function voicedToken(date: string, brand: VoicedBrand): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET not set — voiced links can't be signed");
  return createHmac("sha256", secret).update(`voiced:${date}:${brand}`).digest("hex").slice(0, 32);
}

export function checkVoicedToken(date: string, brand: VoicedBrand, token: unknown): boolean {
  if (typeof token !== "string" || token.length !== 32) return false;
  try {
    const want = Buffer.from(voicedToken(date, brand));
    const got = Buffer.from(token);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

export function isVoicedDate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export function voicedPageUrl(date: string, brand: VoicedBrand): string {
  return `${BASE_URL()}/voiced/${date}/${brand}?t=${voicedToken(date, brand)}`;
}

// ── Storage JSON ───────────────────────────────────────────────────────

export async function readJson<T>(p: string): Promise<T | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data } = await supabase.storage.from(BUCKET).download(p);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(p: string, body: unknown): Promise<void> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(p, Buffer.from(JSON.stringify(body, null, 1)), { contentType: "application/json", upsert: true });
  if (error) throw new Error(`Storage write failed (${p}): ${error.message}`);
}

export async function uploadFile(p: string, buf: Buffer, contentType: string): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage.from(BUCKET).upload(p, buf, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed (${p}): ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// ── Types ──────────────────────────────────────────────────────────────

export interface VoicedLine {
  /** Clean spoken text (captions/alignment). */
  text: string;
  /** Same words with pacing marks for Keenan: / short pause, // long pause, *word* emphasis. */
  read: string;
  /** People-free photo scene that shows this line. */
  scene: string;
  /** One calm, realistic movement for the clip. */
  motion: string;
}

export interface VoicedScript {
  date: string;
  brand: VoicedBrand;
  title: string;
  lines: VoicedLine[];
  caption: string;
  hashtags: string[];
  model: string;
  createdAt: string;
}

export type VoicedStatus = "scripted" | "recorded" | "building" | "built" | "approved" | "failed";

export interface VoicedState {
  status: VoicedStatus;
  recordingPath?: string;
  recordedAt?: string;
  videoUrl?: string;
  seconds?: number;
  builtAt?: string;
  postId?: string;
  approvedAt?: string;
  error?: string;
  updatedAt: string;
}

export interface VoicedClips {
  status: "pending" | "done";
  shots: { imageUrl: string | null; clipUrl: string | null; model?: string }[];
  updatedAt: string;
}

export const readScript = (date: string, brand: VoicedBrand) =>
  readJson<VoicedScript>(`${voicedDir(date, brand)}/script.json`);
export const readState = (date: string, brand: VoicedBrand) =>
  readJson<VoicedState>(`${voicedDir(date, brand)}/state.json`);
export const readClips = (date: string, brand: VoicedBrand) =>
  readJson<VoicedClips>(`${voicedDir(date, brand)}/clips.json`);

export async function writeState(date: string, brand: VoicedBrand, patch: Partial<VoicedState>): Promise<VoicedState> {
  const prev = (await readState(date, brand)) ?? { status: "scripted" as VoicedStatus, updatedAt: "" };
  const next: VoicedState = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await writeJson(`${voicedDir(date, brand)}/state.json`, next);
  return next;
}

// ── Script writing ─────────────────────────────────────────────────────

function voicedRules(brand: VoicedBrand): string {
  const ripple = brand === "ripple";
  return `THIS IS A SHORT SPOKEN VIDEO SCRIPT, not a carousel. The account owner reads it aloud in their own voice on a phone, one take. Under each line the viewer sees one cinematic, people-free shot that shows what that line is about, with the spoken words as captions.

WRITE FOR THE EAR:
- 55-90 words in total, 5-7 lines. Each line is one breath: 6-16 words, one sentence (two very short ones at most).
- Line 1 is the hook: at most 10 words, and it names ${ripple ? "her situation in plain words so she feels seen in the first second" : "the exact thing this video is about, as a calm order or a hard truth"}. It must make complete sense on its own.
- ONE idea for the whole script. Every line moves it forward; the last line lands it (${ripple ? "a line of recognition or a small permission she can feel, never a lecture or a list of tips" : "a plain order he can act on today, never hype"}).
- Speak to the viewer as "you". The reader of the script could be any adult, so never claim a personal life for the speaker ("as a mom", "my kids", "my wife", "when I was your age").
- Words that sound natural spoken aloud: contractions, short words, no parentheses, no symbols, no hashtags, no numbers written as digits (spell them out), no em or en dashes.
${ripple ? '- Ripple rules: never preachy, clinical or medical; never "brain dump"; never tie anything to a fixed time of day ("nightly", "before bed").' : "- BWK rules: calm and certain, no hype words, no bro-slang, nothing toxic, no emojis."}

FOR EACH LINE ALSO WRITE:
- "read": the SAME words with pacing marks for the speaker: "/" a short pause, "//" a longer pause, and *asterisks* around the one word to lean on (at most one per line). Do not change any words.
- "scene": one sentence describing a REAL photograph that shows what this line is about. No people, no faces, no hands, no text, signs or screens with words. ${ripple ? "Warm, dim, intimate feminine photography: a quiet home after dark, candlelight, lamplight, rain on glass, gardens at blue hour." : "Dark, dramatic, luxurious photography: dark-luxury architecture under a dramatic sky, alpha wildlife, empty training spaces, night city from above, storm light."} Each line gets a different setting, and the shots should feel like one film.
- "motion": ONE calm, realistic movement that already belongs in that scene, at natural speed, with a slow steady camera (steam rising from a cup as the camera slowly pushes in; rain running down the window glass; a curtain lifting in a light breeze; storm clouds rolling over the tower). No people appearing, nothing fast.

Also write:
- "title": an internal 3-6 word label for the topic.
- "caption": the Instagram caption, 2-4 short sentences in the same voice, ending with a question that invites a comment. No hashtags in it.
- "hashtags": 3-5 relevant hashtags.

Return ONLY JSON: {"title": "...", "lines": [{"text": "...", "read": "...", "scene": "...", "motion": "..."}], "caption": "...", "hashtags": ["#..."]}`;
}

async function recentVoicedTitles(brand: VoicedBrand, before: string): Promise<string[]> {
  const titles: string[] = [];
  const day = Date.parse(`${before}T00:00:00Z`);
  for (let i = 1; i <= 21; i++) {
    const d = new Date(day - i * 86_400_000).toISOString().slice(0, 10);
    const s = await readScript(d, brand).catch(() => null);
    if (s) titles.push(`${s.title}: "${s.lines[0]?.text ?? ""}"`);
  }
  return titles;
}

async function writeScriptOnce(date: string, brand: VoicedBrand, feedback: string): Promise<VoicedScript> {
  const { contentAnthropic, CONTENT_MODEL, CONTENT_INPUT_COST_PER_TOKEN, CONTENT_OUTPUT_COST_PER_TOKEN, messageText, lastJsonText } =
    await import("./claude-client");
  const { copyObjectives } = await import("./copy-objectives");
  const { HUMAN_VOICE_RULES } = await import("./humanizer");
  const { prisma } = await import("@/lib/prisma");

  let pulse = "";
  try {
    const { getAudiencePulse } = await import("./reddit-trends");
    pulse = (await getAudiencePulse(brand)) ?? "";
  } catch {
    pulse = "";
  }
  const recent = await recentVoicedTitles(brand, date);
  const user = [
    `Write today's spoken video script for ${brand === "ripple" ? "Ripple" : "Build With Key"}.`,
    recent.length ? `Recent scripts (pick a different idea and a different hook):\n${recent.map((t) => `- ${t}`).join("\n")}` : "",
    feedback,
  ]
    .filter(Boolean)
    .join("\n\n");
  const start = Date.now();
  const res = await contentAnthropic.messages.create({
    max_tokens: 3000,
    system: `${copyObjectives(brand)}\n\n${voicedRules(brand)}${pulse}\n\n${HUMAN_VOICE_RULES}`,
    messages: [{ role: "user", content: user }],
  });
  const tokensIn = res.usage.input_tokens;
  const tokensOut = res.usage.output_tokens;
  await prisma.claudeCallLog
    .create({
      data: {
        purpose: `voiced-script-${brand}`,
        model: CONTENT_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil((tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN) * 100),
        durationMs: Date.now() - start,
        success: true,
      },
    })
    .catch(() => {});
  const parsed = JSON.parse(lastJsonText(messageText(res))) as Partial<VoicedScript> & { lines?: Partial<VoicedLine>[] };
  const lines = (parsed.lines ?? [])
    .filter((l) => typeof l?.text === "string" && typeof l?.scene === "string")
    .map((l) => ({
      text: l.text!.trim(),
      read: (typeof l.read === "string" && l.read.trim() ? l.read : l.text!).trim(),
      scene: l.scene!.trim(),
      motion: (typeof l.motion === "string" ? l.motion : "the light shifts slowly as the camera gently pushes in").trim(),
    }));
  const words = lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  if (lines.length < 4 || lines.length > 8 || words < 40 || words > 110) {
    throw new Error(`voiced script unusable: ${lines.length} lines, ${words} words`);
  }
  return {
    date,
    brand,
    title: (parsed.title ?? lines[0].text).trim(),
    lines,
    caption: (parsed.caption ?? "").trim(),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.filter((h) => typeof h === "string").slice(0, 5) : [],
    model: CONTENT_MODEL,
    createdAt: new Date().toISOString(),
  };
}

/**
 * The day's script for a brand. The Jev copy check (sense + banned
 * phrases; it no longer rewrites) runs on the spoken lines; a flagged
 * script is rewritten once with the problem named.
 */
export async function writeVoicedScript(date: string, brand: VoicedBrand): Promise<VoicedScript> {
  const { humanizePass, copyFlagFor, stripDashes } = await import("./humanizer");
  const check = async (s: VoicedScript) => {
    const checked = await humanizePass({
      purpose: `humanize:voiced-${brand}`,
      voice: brand === "ripple" ? "VOICE: warm, plain, spoken, on her side" : "VOICE: calm, certain, austere, spoken",
      payload: { lines: s.lines.map((l) => l.text) },
    });
    s.lines = s.lines.map((l, i) => ({
      ...l,
      text: checked.lines?.[i] ?? l.text,
      read: stripDashes(l.read),
    }));
    s.caption = stripDashes(s.caption);
    return copyFlagFor(s.lines[0].text);
  };
  const first = await writeScriptOnce(date, brand, "");
  const flag = await check(first);
  if (!flag) return first;
  try {
    const second = await writeScriptOnce(date, brand, flag);
    await check(second);
    return second;
  } catch {
    return first;
  }
}

/** Image prompt for a shot, in the brand's locked photo realism rules. */
export async function shotImagePrompt(brand: VoicedBrand, scene: string): Promise<string> {
  const { buildMoodyImagePrompt } = await import("./moody-carousel");
  return `${buildMoodyImagePrompt(brand === "bwk" ? "men" : "women", scene, "dark")}\nVertical 9:16 composition. No people, no faces, no hands, no text anywhere in the image.`;
}

/** Higgsfield prompt: the scene as real footage doing its one calm movement. */
export function shotMotionPrompt(scene: string, motion: string): string {
  return [
    "Cinematic real-world footage, shot on a real camera.",
    `Scene: ${scene.slice(0, 300)}`,
    `Motion: ${motion}`,
    "Keep the movement realistic and measured, at natural real-world speed. The camera moves slowly and steadily (a gentle push-in or a slight drift). Nothing frantic, no morphing.",
    "Keep the scene's design, colors and lighting exactly as in the image. No people or hands appear, no text, no new objects, no scene cuts.",
  ].join(" ");
}

// ── Emails ─────────────────────────────────────────────────────────────

const FROM = () => process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>';
const TO = () => process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com";
const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pacing marks → email HTML: pauses shown as spaced bars, emphasis bold. */
function readHtml(read: string): string {
  return esc(read)
    .replace(/\*([^*]+)\*/g, '<strong style="color:#FFB08A;">$1</strong>')
    .replace(/\s*\/\/\s*/g, ' <span style="color:#F97E4E;">//</span> ')
    .replace(/(^|[^/<])\s*\/\s*(?!\/)/g, '$1 <span style="color:#F97E4E;">/</span> ');
}

const BRAND_LABEL: Record<VoicedBrand, string> = { bwk: "BUILD WITH KEY", ripple: "RIPPLE" };

function shell(inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;color:#EEE;">${inner}</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:block;text-align:center;background:#F97E4E;color:#111;font-weight:700;font-size:18px;text-decoration:none;padding:16px;border-radius:12px;margin:20px 0;">${esc(label)}</a>`;
}

export async function sendScriptEmail(script: VoicedScript): Promise<void> {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const url = voicedPageUrl(script.date, script.brand);
  const lines = script.lines
    .map(
      (l, i) =>
        `<p style="font-size:22px;line-height:1.55;margin:0 0 18px;color:#FFF;"><span style="font-size:12px;color:#666;font-family:monospace;margin-right:8px;">${i + 1}</span>${readHtml(l.read)}</p>`
    )
    .join("");
  const words = script.lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  const html = shell(`
<p style="font-size:11px;letter-spacing:1.4px;color:#888;margin:0 0 6px;font-family:monospace;">[VOICED · ${BRAND_LABEL[script.brand]}] ${esc(script.date)}</p>
<h1 style="font-size:20px;margin:0 0 16px;color:#FFF;">Today's script: record it and upload</h1>
<div style="background:#1A1A1A;border-radius:12px;padding:20px 18px;margin:0 0 16px;">${lines}</div>
<p style="font-size:14px;color:#AAA;line-height:1.6;margin:0 0 6px;"><strong style="color:#DDD;">How to read it:</strong> a quiet room, phone about a hand away, at your natural pace. One take is fine: small stumbles and ad-libs are OK, the video follows what you actually say. About ${Math.round(words / 2.6)} seconds.</p>
<p style="font-size:13px;color:#888;margin:0 0 4px;"><span style="color:#F97E4E;">/</span> short pause &nbsp; <span style="color:#F97E4E;">//</span> longer pause &nbsp; <strong style="color:#FFB08A;">bold</strong> = lean on that word</p>
${button(url, "Upload your recording")}
<p style="font-size:12px;color:#666;">Any audio file works (Voice Memos m4a, mp3, wav). The video is built and emailed back for approval; nothing posts until you approve it.</p>`);
  await sendEmailOrThrow({
    from: FROM(),
    to: TO(),
    subject: `[VOICED · ${BRAND_LABEL[script.brand]}] Record today's script: "${script.lines[0].text}"`,
    html,
    text: `${BRAND_LABEL[script.brand]} voiced script, ${script.date}\n\n${script.lines.map((l) => l.read).join("\n\n")}\n\nUpload your recording: ${url}`,
  } as Parameters<typeof sendEmailOrThrow>[0]);
}

export async function sendBuiltEmail(script: VoicedScript, state: VoicedState, video: Buffer | null): Promise<void> {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const url = voicedPageUrl(script.date, script.brand);
  const attach = video && video.length <= MAX_ATTACHMENT_BYTES;
  const html = shell(`
<p style="font-size:11px;letter-spacing:1.4px;color:#888;margin:0 0 6px;font-family:monospace;">[VOICED · ${BRAND_LABEL[script.brand]}] ${esc(script.date)}</p>
<h1 style="font-size:20px;margin:0 0 12px;color:#FFF;">Your video is ready</h1>
<p style="font-size:15px;color:#CCC;line-height:1.6;margin:0 0 8px;">"${esc(script.lines[0].text)}" · ${state.seconds ? `${state.seconds.toFixed(0)}s` : ""}</p>
<p style="font-size:14px;color:#AAA;margin:0 0 4px;">${attach ? "📎 The video is attached." : `<a href="${esc(state.videoUrl ?? "")}" style="color:#F97E4E;">Watch the video</a>`}</p>
${button(url, "Review and approve")}
<p style="font-size:13px;color:#888;line-height:1.6;">Approving posts it to ${script.brand === "bwk" ? "Build With Key's" : "Ripple's"} Instagram and Facebook at the next open slot. Want another take? Upload a new recording on the same page and it rebuilds.</p>
<div style="background:#1A1A1A;border-radius:12px;padding:14px 16px;margin:16px 0 0;">
<p style="font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#666;margin:0 0 8px;font-family:monospace;">Caption</p>
<pre style="white-space:pre-wrap;font-size:14px;color:#DDD;font-family:-apple-system,sans-serif;margin:0;line-height:1.5;">${esc(`${script.caption}\n\n${script.hashtags.join(" ")}`)}</pre></div>`);
  const payload: Record<string, unknown> = {
    from: FROM(),
    to: TO(),
    subject: `[VOICED · ${BRAND_LABEL[script.brand]}] Ready to approve: "${script.lines[0].text}"`,
    html,
    text: `Your ${BRAND_LABEL[script.brand]} voiced video is ready.\nReview and approve: ${url}\nVideo: ${state.videoUrl}`,
  };
  if (attach) payload.attachments = [{ filename: `voiced-${script.brand}-${script.date}.mp4`, content: video!.toString("base64") }];
  await sendEmailOrThrow(payload as unknown as Parameters<typeof sendEmailOrThrow>[0]);
}

export async function sendFailureEmail(date: string, brand: VoicedBrand, stage: string, error: string): Promise<void> {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  let link = "";
  try {
    link = voicedPageUrl(date, brand);
  } catch {
    link = "";
  }
  await sendEmailOrThrow({
    from: FROM(),
    to: TO(),
    subject: `[VOICED · ${BRAND_LABEL[brand]}] ${stage} failed (${date})`,
    html: shell(`<h1 style="font-size:18px;color:#FFF;">Voiced video: ${esc(stage)} failed</h1>
<pre style="white-space:pre-wrap;font-size:13px;color:#E06C75;background:#1A1A1A;border-radius:12px;padding:14px;">${esc(error.slice(0, 2000))}</pre>
${link ? `<p style="font-size:14px;color:#AAA;">You can re-upload the recording to retry the build: <a href="${esc(link)}" style="color:#F97E4E;">open the page</a>.</p>` : ""}`),
    text: `Voiced ${brand} ${date}: ${stage} failed\n\n${error.slice(0, 2000)}\n\n${link}`,
  } as Parameters<typeof sendEmailOrThrow>[0]);
}

// ── Approve → publish ──────────────────────────────────────────────────

/**
 * Hand an approved video to the normal publisher: the video goes to
 * reels/<postId>.mp4 with a "done" build marker FIRST, then the post row is
 * created (lane voiced-<brand>, already emailed, caption final), so the
 * publisher's scan can never see the post before its video exists.
 * Idempotent on the deterministic post id.
 */
export async function approveVoiced(date: string, brand: VoicedBrand): Promise<{ postId: string; already: boolean }> {
  const { prisma } = await import("@/lib/prisma");
  const postId = voicedPostId(date, brand);
  const existing = await prisma.carouselPost.findUnique({ where: { id: postId }, select: { id: true } });
  if (existing) return { postId, already: true };

  const [script, state, clips] = await Promise.all([readScript(date, brand), readState(date, brand), readClips(date, brand)]);
  if (!script || !state || state.status !== "built" || !state.videoUrl) {
    throw new Error("There's no finished video to approve yet.");
  }
  const { reelPath, writeVideoMarker } = await import("./post-video");
  const video = await downloadUrl(state.videoUrl);
  const url = await uploadFile(reelPath(postId), video, "video/mp4");
  await writeVideoMarker(postId, { status: "done", url, source: "higgsfield", liveSlides: script.lines.length, totalSlides: script.lines.length });

  const coverImage = clips?.shots.find((s) => s.imageUrl)?.imageUrl ?? `https://goripple.io/cta-slide-${brand}.jpg`;
  const caption = `${script.caption}\n\n${script.hashtags.join(" ")}`.trim();
  const now = new Date();
  await prisma.carouselPost.create({
    data: {
      id: postId,
      topicSlug: voicedLane(brand),
      headline: script.lines[0].text,
      caption,
      hashtags: script.hashtags,
      generatedFor: new Date(`${date}T00:00:00Z`),
      lane: voicedLane(brand),
      status: "DRAFT",
      format: "PHOTO",
      emailedAt: now,
      captionWrittenAt: now,
      reelTransition: "voiced",
      slides: {
        create: [
          {
            order: 0,
            kind: "COVER",
            overlayText: script.lines[0].text,
            imagePrompt: `VOICED: ${script.lines[0].scene}`,
            imageUrl: coverImage,
          },
        ],
      },
    },
  });
  await writeState(date, brand, { status: "approved", postId, approvedAt: now.toISOString() });
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/social.publish", data: {} });
  return { postId, already: false };
}
