/**
 * Content Factory — "Paper guide" template (2026-09-25, per Keenan: "create a
 * new lane for BWK/Ripple that sends me similar photo carousels like this.
 * practical reset guides to reset your brain, get further ahead, etc").
 *
 * Modeled on the anastasiyadc "Reset your life" viral carousel (9.4K likes,
 * 8.7K saves, 1.9K shares on 8 slides): plain book-serif text set on a
 * textured paper background. No photos, so no image-model cost.
 *   1. COVER — one big sentence-case promise ("1 weekend can reset your
 *      entire 2026").
 *   2..N. STEPS — BOLD CAPS header ("FRIDAY NIGHT"), a short subline with a
 *      time box ("Brain cleanse (2 hrs)"), then a few plain lines and
 *      "•" bullets. The last step is the recurring habit that keeps it.
 *
 * Saves are the point of this format: the copy must be specific and
 * practical enough to come back to.
 *
 * Ripple lane = cream paper, dark type (women 40-50). BWK lane = charcoal
 * paper, cream type (men, discipline voice).
 *
 * Fonts: Tinos (OFL, metric-compatible with Times New Roman) in
 * public/fonts, resolved like compose.ts ensureFontFile (local, then CDN).
 */
import * as fs from "fs";
import * as path from "path";

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

import { HUMAN_VOICE_RULES } from "./humanizer";
import { withHeadlineRetry } from "./headline-history";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// ─── Spec ───────────────────────────────────────────────────────────────────

export interface PaperLaneSpec {
  audience: "women" | "men";
  /** Angle rotation + voice notes injected into the topic prompt. */
  theme: string;
  paper: "cream" | "charcoal";
  minSlides: number;
  maxSlides: number;
}

/** Parse a ContentLane.spec for template "paper-guide". Null = unusable. */
export function parsePaperLaneSpec(raw: unknown): PaperLaneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.audience !== "women" && s.audience !== "men") return null;
  if (typeof s.theme !== "string" || s.theme.trim().length < 40) return null;
  const clamp = (v: unknown, d: number) => (typeof v === "number" && v >= 3 && v <= 9 ? Math.floor(v) : d);
  return {
    audience: s.audience,
    theme: s.theme.trim(),
    paper: s.paper === "charcoal" ? "charcoal" : "cream",
    minSlides: clamp(s.minSlides, 5),
    maxSlides: clamp(s.maxSlides, 7),
  };
}

// ─── Topic ──────────────────────────────────────────────────────────────────

export interface PaperGuideSlide {
  header: string;
  sub: string;
  /** Lines; "" is a blank line, "• …" a bullet. */
  body: string[];
}

export interface PaperGuideTopic {
  slug: string;
  title: string;
  slides: PaperGuideSlide[];
}

const SYSTEM = `You write "reset guide" photo carousels: plain serif text on a paper background, no images. The reference post that went viral (8.7K saves) read like this:

COVER: "1 weekend can reset your entire 2026"
FRIDAY NIGHT / Brain cleanse (2 hrs) / Grab a notebook. Set a timer. / Write everything you want this year: • Career moves • Relationships to repair • Skills to learn • Places to visit • Money goals / No organizing. No filtering.
SATURDAY MORNING / Social media audit (30 minutes) / Look at who you follow. Ask: "Does this make me grow... or distracted?" / Unfollow the ones that don't support who you want to become.
SATURDAY NIGHT / Systems > motivation / Stop waiting to feel inspired. Build tiny repeatable systems. / Replace "I want to" with "I do this every week."
THE SUNDAY RESET / 15 mins weekly / Every Sunday evening: • What worked? • What didn't? • What's tomorrow's one focus? / Set a recurring alarm. Small resets prevent big drifts.

What makes it work, and what every post must do:
- The cover is ONE plain sentence-case promise with a concrete number or span ("1 weekend…", "7 days to…", "The 20-minute Sunday reset", "3 habits that…"). No clickbait, no ALL CAPS, max 9 words.
- Each step: a HEADER that is a time block or a step name (1-3 words, will be set in caps), a SUB line naming the action with a time box in parentheses, then 2-6 short lines. Bullets start with "• ". Use "" for a blank line between groups.
- Practical and specific enough to save and actually do: real actions, real questions to ask yourself, real time boxes. No vague advice ("believe in yourself"), no fluff, no hashtags, no emojis.
- Short words, short lines. Max ~50 words per step.
- The LAST step is the small recurring habit that keeps the reset going, ending on a one-line takeaway.
- Never mention any app, brand, or product. Never say "journal", "journaling", or "brain dump". Writing things down or saying them out loud is fine.
- No invented statistics, no medical or therapy claims.

Return ONLY JSON: {"title": string, "slug": "kebab-case-slug", "slides": [{"header": string, "sub": string, "body": string[]}]}`;

export async function generatePaperGuideTopic(
  spec: PaperLaneSpec,
  recentHeadlines: string[],
  feedback?: string | null
): Promise<PaperGuideTopic> {
  return withHeadlineRetry({
    label: "paper-guide-topic",
    generate: (extra) => generateOnce(spec, recentHeadlines, feedback, extra),
    headlineOf: (t) => t.title,
  });
}

async function generateOnce(
  spec: PaperLaneSpec,
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<PaperGuideTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const avoid = recentHeadlines.length
    ? `\n\nRECENT COVERS (do not repeat the angle or the structure of the last few):\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";
  const fb = feedback ? `\n\nENGAGEMENT FEEDBACK:\n${feedback}` : "";
  const today = new Date().toISOString().slice(0, 10);
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2500,
    system: `${SYSTEM}\n\n${HUMAN_VOICE_RULES}`,
    messages: [
      {
        role: "user",
        content: `Today is ${today}.\n\n${spec.theme}\n\nWrite today's guide with between ${spec.minSlides} and ${spec.maxSlides} steps.${avoid}${fb}${extra}`,
      },
    ],
  });
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  await prisma.claudeCallLog.create({
    data: {
      purpose: "paper-guide-topic",
      model: CLAUDE_MODEL,
      tokensIn,
      tokensOut,
      costCents: Math.ceil((tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100),
      durationMs: Date.now() - start,
      success: true,
    },
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()) as Partial<PaperGuideTopic>;
  const title = (parsed.title ?? "").trim();
  const slides = (parsed.slides ?? [])
    .filter((s) => typeof s?.header === "string" && typeof s?.sub === "string" && Array.isArray(s?.body))
    .map((s) => ({
      header: s.header.trim().toUpperCase(),
      sub: s.sub.trim(),
      body: s.body.map((l) => String(l ?? "").trim()).slice(0, 12),
    }))
    .filter((s) => s.header && s.sub && s.body.some((l) => l))
    .slice(0, spec.maxSlides);
  if (!title || slides.length < spec.minSlides) {
    throw new Error(`paper-guide topic unusable: title="${title}" slides=${slides.length}`);
  }
  const slug = (parsed.slug ?? title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return { slug, title, slides };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const PALETTE = {
  cream: { base: [233, 229, 220], ink: "#1c1b19", sub: "#1c1b19", grain: 18 },
  charcoal: { base: [36, 35, 33], ink: "#f1ede4", sub: "#e6e1d6", grain: 14 },
} as const;

async function ensureTinos(variant: "Regular" | "Bold"): Promise<string | null> {
  const filename = `Tinos-${variant}.ttf`;
  const tmpPath = `/tmp/${filename}`;
  if (fs.existsSync(tmpPath)) return tmpPath;
  for (const p of [
    path.join(process.cwd(), "public", "fonts", filename),
    path.join(process.cwd(), ".next", "server", "public", "fonts", filename),
    path.join(process.cwd(), ".next", "standalone", "public", "fonts", filename),
  ]) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, tmpPath);
      return tmpPath;
    }
  }
  try {
    const res = await fetch(`https://goripple.io/fonts/${filename}`);
    if (res.ok) {
      fs.writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()));
      return tmpPath;
    }
  } catch {
    // fall through
  }
  return null;
}

const paperCache = new Map<string, Buffer>();

/** Textured paper: flat tone + fine grain + soft uneven light, like a photographed page. */
async function paperBackground(paper: "cream" | "charcoal", W: number, H: number): Promise<Buffer> {
  const key = `${paper}:${W}x${H}`;
  const hit = paperCache.get(key);
  if (hit) return hit;
  const pal = PALETTE[paper];
  const noise = Buffer.alloc(W * H);
  for (let i = 0; i < noise.length; i++) noise[i] = 128 + Math.round((Math.random() - 0.5) * 2 * pal.grain);
  const grain = await sharp(noise, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer();
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Soft light from the upper left, falling off to the right edge.
      const light = 1.04 - 0.1 * (x / W) - 0.05 * Math.abs(y / H - 0.4);
      const g = grain[i] - 128;
      for (let c = 0; c < 3; c++) {
        rgb[i * 3 + c] = Math.max(0, Math.min(255, Math.round(pal.base[c] * light + g)));
      }
    }
  }
  const out = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  paperCache.set(key, out);
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function textBlock(markup: string, fontfile: string | null, width: number): Promise<{ buf: Buffer; w: number; h: number }> {
  // font names the family for Pango; fontfile registers the bundled TTF on
  // Lambda (fontconfig). macOS Pango (CoreText) ignores fontfile and needs
  // the face installed, like Poppins is for local dev.
  const opts: Record<string, unknown> = { text: markup, width, rgba: true, align: "left", spacing: 0, font: "Tinos" };
  if (fontfile) opts.fontfile = fontfile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await sharp({ text: opts } as any).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width ?? width, h: m.height ?? 0 };
}

/**
 * One slide. W×H lets the same layout render the 9:16 slide and the native
 * 4:5 feed rendition (served for ?ar=4x5 as "<name>-feed.jpg").
 */
export async function renderPaperSlide(opts: {
  paper: "cream" | "charcoal";
  W: number;
  H: number;
  cover?: string;
  slide?: PaperGuideSlide;
}): Promise<Buffer> {
  const { W, H } = opts;
  const pal = PALETTE[opts.paper];
  const [regular, bold] = await Promise.all([ensureTinos("Regular"), ensureTinos("Bold")]);
  const bg = await paperBackground(opts.paper, W, H);
  const left = Math.round(W * 0.085);
  const textW = Math.round(W * 0.84);
  const layers: { input: Buffer; top: number; left: number }[] = [];

  if (opts.cover) {
    const size = Math.round(W * 0.078);
    const block = await textBlock(`<span font_desc="Tinos ${size}" foreground="${pal.ink}" line_height="1.15">${esc(opts.cover)}</span>`, regular, textW);
    layers.push({ input: block.buf, top: Math.round(H * 0.44 - block.h / 2), left });
  } else if (opts.slide) {
    const s = opts.slide;
    const headSize = Math.round(W * 0.047);
    const bodySize = Math.round(W * 0.043);
    const head = await textBlock(
      `<span font_desc="Tinos Bold ${headSize}" foreground="${pal.ink}" letter_spacing="${Math.round(headSize * 25)}">${esc(s.header)}</span>`,
      bold,
      textW
    );
    const lines = [s.sub, "", ...s.body].map((l) => esc(l)).join("\n");
    const body = await textBlock(`<span font_desc="Tinos ${bodySize}" foreground="${pal.sub}" line_height="1.3">${lines}</span>`, regular, textW);
    const gap = Math.round(bodySize * 0.15);
    const total = head.h + gap + body.h;
    const top = Math.max(Math.round(H * 0.12), Math.round(H * 0.46 - total / 2));
    layers.push({ input: head.buf, top, left });
    layers.push({ input: body.buf, top: top + head.h + gap, left });
  }

  return sharp(bg).composite(layers).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}
