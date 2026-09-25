/**
 * Content Factory — "Paper guide" template (2026-09-25, per Keenan: "create a
 * new lane for BWK/Ripple that sends me similar photo carousels like this.
 * practical reset guides to reset your brain, get further ahead, etc").
 *
 * Modeled on the anastasiyadc "Reset your life" viral carousel (9.4K likes,
 * 8.7K saves, 1.9K shares on 8 slides): plain book-serif text set on a
 * textured paper background. No per-post image-model cost.
 *   1. COVER — one big sentence-case promise ("1 weekend can reset your
 *      entire 2026").
 *   2..N. STEPS — BOLD CAPS header ("FRIDAY NIGHT"), a short subline with a
 *      time box ("Brain cleanse (2 hrs)"), then a few plain lines and
 *      "•" bullets. The last step is the recurring habit that keeps it.
 *
 * Saves are the point of this format: the copy must be specific and
 * practical enough to come back to.
 *
 * Both lanes are black type on a real photographed sheet (public/paper,
 * Nano Banana Pro textures, 2026-09-25): Ripple warm sheets ("cream"), BWK
 * cool grey sheets (spec value "charcoal", kept for the seeded rows).
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
- Short words, short lines, like the reference. Max ~40 words per step and at most 7 body lines. Each line fits on one line of the page: max ~36 characters, including the SUB line (keep the time box short: "(20 min)", "(2 hrs)"). Split a longer thought into two lines instead of one long line.
- American English and US dollars ($), never £ or British spellings.
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

// Ink is the same near-black on every sheet: the look is text TYPED onto a
// real photographed page (2026-09-25, per Keenan: "they need to look like
// they're both TYPED onto paper in the normal typing font"). Ripple gets warm
// sheets, BWK cool grey ones.
const INK = "#141413";
const PAPERS = {
  cream: ["cream-1.jpg", "cream-2.jpg"],
  charcoal: ["stone-1.jpg", "stone-2.jpg"],
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

/** Loads a bundled paper photo (public/paper), falling back to the CDN copy. */
async function loadPaperPhoto(file: string): Promise<Buffer> {
  const hit = paperCache.get(file);
  if (hit) return hit;
  let buf: Buffer | null = null;
  for (const p of [
    path.join(process.cwd(), "public", "paper", file),
    path.join(process.cwd(), ".next", "server", "public", "paper", file),
    path.join(process.cwd(), ".next", "standalone", "public", "paper", file),
  ]) {
    if (fs.existsSync(p)) {
      buf = fs.readFileSync(p);
      break;
    }
  }
  if (!buf) {
    const res = await fetch(`https://goripple.io/paper/${file}`);
    if (!res.ok) throw new Error(`Paper texture missing: ${file} (${res.status})`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  paperCache.set(file, buf);
  return buf;
}

/** One sheet per post (seeded), so every slide of a carousel is the same page. */
function pickPaper(paper: "cream" | "charcoal", seed: string): string {
  const list = PAPERS[paper];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
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
  /** Same seed for every slide of a post → same sheet of paper. */
  seed?: string;
  cover?: string;
  slide?: PaperGuideSlide;
}): Promise<Buffer> {
  const { W, H } = opts;
  const [regular, bold] = await Promise.all([ensureTinos("Regular"), ensureTinos("Bold")]);
  const bg = await sharp(await loadPaperPhoto(pickPaper(opts.paper, opts.seed ?? opts.cover ?? opts.slide?.header ?? "")))
    .resize(W, H, { fit: "cover" })
    .toBuffer();
  // Proportions measured off the reference: text starts ~9% in, body type
  // ~4.4% of the width, tight 1.2 leading, header the same size in bold
  // caps with slight tracking, the subline directly under it.
  const left = Math.round(W * 0.09);
  const textW = Math.round(W * 0.8);
  const size = Math.round(W * 0.046);
  // Header and body are separate blocks because sharp registers one
  // fontfile per text render (Lambda needs Bold and Regular each).
  const blocks: { buf: Buffer; h: number; dy: number }[] = [];
  if (opts.cover) {
    const c = await textBlock(`<span font_desc="Tinos ${Math.round(W * 0.078)}" foreground="${INK}" line_height="1.15">${esc(opts.cover)}</span>`, regular, textW);
    blocks.push({ buf: c.buf, h: c.h, dy: 0 });
  } else if (opts.slide) {
    const s = opts.slide;
    const head = await textBlock(
      `<span font_desc="Tinos Bold ${size}" foreground="${INK}" letter_spacing="${Math.round(size * 1024 * 0.06)}">${esc(s.header.toUpperCase())}</span>`,
      bold,
      textW
    );
    const rest = [s.sub, "", ...s.body].map((l) => esc(l)).join("\n");
    const body = await textBlock(`<span font_desc="Tinos ${size}" foreground="${INK}" line_height="1.2">${rest}</span>`, regular, textW);
    blocks.push({ buf: head.buf, h: head.h, dy: 0 });
    blocks.push({ buf: body.buf, h: body.h, dy: head.h + Math.round(size * 0.3) });
  }
  const total = blocks.reduce((m, b) => Math.max(m, b.dy + b.h), 0);
  const top = Math.max(Math.round(H * 0.1), Math.round(H * 0.47 - total / 2));
  // Ink, not a sticker: multiply lets the paper's grain and light show
  // through the letters, and a hair of blur takes off the digital edge.
  const layers = await Promise.all(
    blocks.map(async (b) => ({ input: await sharp(b.buf).blur(0.4).png().toBuffer(), top: top + b.dy, left, blend: "multiply" as const }))
  );
  return sharp(bg)
    .composite(layers)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
