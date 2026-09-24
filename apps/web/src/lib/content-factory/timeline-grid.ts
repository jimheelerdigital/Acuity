/**
 * Content Factory — "The Timeline" grid template (2026-09-16, per
 * Keenan: "I wanted it to be an entirely new lane like the pictures
 * that I'd send and this looks nothing like them").
 *
 * Modeled slide-for-slide on the claritiyouneeded viral reference
 * (15.8K likes / 10.9K saves, 6 screenshots in hand):
 *   1. COVER — single dark photo, punchy caps headline
 *      ("4 MONTHS TO GET YOUR SH*T TOGETHER").
 *   2..N-1. PHASE GRIDS — each phase of the span is a 2×3 photo
 *      collage: six real photos, each carrying a 2-4 word action label
 *      ("Fix your sleep", "Train consistently"), with an italic-serif
 *      caps title band straddling the horizontal seam
 *      ("MONTH 01" / "GET YOURSELF TOGETHER").
 *   N. CLOSER — single dark photo with the sober two-sentence reframe
 *      ("Four months won't transform your entire life. But four months
 *      of serious decisions can change the direction of it.").
 *
 * RENDERING: the grid is composed HERE with sharp (six individually
 * generated cell photos, cover-cropped into exact cells, labels and
 * band overlaid deterministically) — never asked of gpt-image-2, whose
 * collage geometry and baked text can't be trusted. Grid slides are
 * SQUARE (1080×1080) like the reference; cover/closer stay 9:16
 * through the existing moody compose path.
 *
 * COST: cells render at 1024×1024 quality "medium" (~4¢) — they
 * display at 360×540, so "high" (~25¢) would be waste. A 4-phase post
 * is 24 cells (~$1) + cover/closer at high (~50¢) — in the same range
 * as a moody pick-list post.
 */

import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { ensureFontFile } from "./compose";
import { HUMAN_VOICE_RULES, humanizePass } from "./humanizer";
import { withHeadlineRetry } from "./headline-history";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
// Same Sonnet pricing constants as moody-carousel.ts.
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// ─── Spec ───────────────────────────────────────────────────────────────────

export interface GridLaneSpec {
  /** Theme block injected into the topic prompt (span rotation etc.). */
  theme: string;
  /** Grid slides per post (phases of the span). Reference has 4. */
  minPhases: number;
  maxPhases: number;
}

/** Parse a ContentLane.spec for template "grid-timeline". Null = unusable. */
export function parseGridLaneSpec(raw: unknown): GridLaneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.theme !== "string" || s.theme.trim().length < 40) return null;
  const clamp = (v: unknown, dflt: number) =>
    typeof v === "number" && v >= 2 && v <= 5 ? Math.floor(v) : dflt;
  return {
    theme: s.theme.trim(),
    minPhases: clamp(s.minPhases, 3),
    maxPhases: clamp(s.maxPhases, 4),
  };
}

// ─── Topic generation ───────────────────────────────────────────────────────

export interface TimelinePhase {
  /** Phase header, e.g. "MONTH 01" / "MONTHS 4-6" / "YEAR 2". */
  header: string;
  /** Band theme line, e.g. "GET YOURSELF TOGETHER". */
  bandTitle: string;
  /** Exactly 6 grid cells. */
  cells: { label: string; scene: string }[];
}

export interface TimelineGridTopic {
  slug: string;
  /** Caps cover headline. */
  title: string;
  coverScene: string;
  /** Two-sentence sober reframe for the last slide. */
  closer: string;
  closerScene: string;
  phases: TimelinePhase[];
}

const VOICE_LINE =
  "VOICE: blunt, sober, masculine self-improvement. Short imperatives. Zero hype, zero hashtag-speak, no exclamation points.";

const SYSTEM = `You write photo-carousel roadmap posts for a men's discipline account (Build With Key).
${VOICE_LINE}

FORMAT — the post is a span-of-time roadmap:
- "title": the cover headline. Punchy, ALL CAPS register (you write it in normal case, it renders uppercase), 4-9 words naming the span and the mission as a direct COMMAND to the reader (2026-09-24, per Keenan: commanding covers get the best engagement), shape: "Give yourself [span] to [mission]" or "[Verb] for [span] straight" (e.g. "Give yourself 4 months to get your sh*t together"; the example is the SHAPE only, never reuse its words). Never a question, never a statement about someone else. Mild censored profanity (sh*t) is allowed sparingly, never required.
- "phases": one entry per sequential phase of the span, in order, no gaps.
  - "header": the phase window, e.g. "MONTH 01", "MONTHS 4-6", "YEAR 2".
  - "bandTitle": that phase's mission in 3-5 words, caps register, following a consistent family across the post (reference: "GET YOURSELF TOGETHER" / "GET YOUR MIND TOGETHER" / "GET YOUR MONEY TOGETHER" / "GET YOUR FUTURE TOGETHER"). Invent your own family each post, do not copy that one.
  - "cells": EXACTLY 6 per phase. Each cell is one concrete action for that phase:
    - "label": 2-4 word imperative a man can actually do ("Fix your sleep", "Audit your spending", "Learn sales"). Plain words, no punctuation except a hyphen.
    - "scene": one sentence describing the photo behind that label. Dark, moody, real-life setting that matches the action. ONE anonymous person is allowed (from behind, hands only, silhouette, face never visible) when the action needs a human; otherwise an evocative object/place shot.
- "coverScene": one sentence, the cover photo. Dark aspirational workspace/city/discipline setting.
- "closer": EXACTLY two sentences in the register of "Four months won't transform your entire life. But four months of serious decisions can change the direction of it." Sober, anti-hype, no guarantees; the second sentence lands the quiet counterpunch. Sentence case, not caps.
- "closerScene": one sentence, the closing photo. A lone man at work late (from behind or face obscured) or an empty disciplined space.

The whole post must read like a roadmap a man saves to walk himself through the span. Specific and lived-in, never generic motivation.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "closer": "...",
  "closerScene": "...",
  "phases": [
    { "header": "...", "bandTitle": "...", "cells": [ { "label": "...", "scene": "..." } ] }
  ]
}`;

/** Cross-lane headline dedupe (2026-09-23): recent-headlines block on
 *  the request, one retry with feedback on an exact repeat title. */
export async function generateTimelineGridTopic(
  spec: GridLaneSpec,
  recentHeadlines: string[],
  feedback?: string | null
): Promise<TimelineGridTopic> {
  return withHeadlineRetry({
    label: "timeline-grid-topic",
    generate: (extra) =>
      generateTimelineGridTopicOnce(spec, recentHeadlines, feedback, extra),
    headlineOf: (t) => t.title,
  });
}

async function generateTimelineGridTopicOnce(
  spec: GridLaneSpec,
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<TimelineGridTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const purpose = "timeline-grid-topic";

  const avoid =
    recentHeadlines.length > 0
      ? `\n\nRECENT POSTS — spans and missions already used:\n${recentHeadlines
          .map((h) => `- ${h}`)
          .join(
            "\n"
          )}\nPick a DIFFERENT span than the most recent post and a genuinely new mission family — never the same span twice in a row.`
      : "";
  const fb = feedback ? `\n\nENGAGEMENT FEEDBACK:\n${feedback}` : "";

  // Reddit audience pulse (2026-09-17) — soft, angle inspiration only.
  let pulse = "";
  try {
    const { getAudiencePulse } = await import("./reddit-trends");
    pulse = await getAudiencePulse("bwk");
  } catch {
    /* soft — generate without the pulse */
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      system: `${SYSTEM}${pulse}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `${spec.theme}\n\nWrite today's post with between ${spec.minPhases} and ${spec.maxPhases} phases (the span decides: a 4-month span = 4 monthly phases, a 1-year span = 4 quarterly phases, a 6-month span = 3 two-month phases).${avoid}${fb}${extra}`,
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN +
            tokensOut * OUTPUT_COST_PER_TOKEN) *
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
    const jsonStr = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr) as Partial<TimelineGridTopic>;

    const title = (parsed.title ?? "").trim();
    const coverScene = (parsed.coverScene ?? "").trim();
    const closer = (parsed.closer ?? "").trim();
    const closerScene = (parsed.closerScene ?? "").trim();
    const phases = (parsed.phases ?? [])
      .filter(
        (p) =>
          typeof p?.header === "string" &&
          typeof p?.bandTitle === "string" &&
          Array.isArray(p?.cells) &&
          p.cells.filter(
            (c) =>
              typeof c?.label === "string" &&
              c.label.trim() &&
              typeof c?.scene === "string" &&
              c.scene.trim()
          ).length >= 6
      )
      .map((p) => ({
        header: p!.header!.trim().toUpperCase(),
        bandTitle: p!.bandTitle!.trim().toUpperCase(),
        cells: p!
          .cells!.filter((c) => c.label?.trim() && c.scene?.trim())
          .slice(0, 6)
          .map((c) => ({ label: c.label.trim(), scene: c.scene.trim() })),
      }))
      .slice(0, spec.maxPhases);

    if (!title || !coverScene || !closer || !closerScene || phases.length < spec.minPhases) {
      throw new Error(
        `${purpose} unusable: title="${title}", ${phases.length} valid phases`
      );
    }

    // Humanizer gate on the sentences a reader actually reads as prose
    // (title + closer). Cell labels / band titles are 2-5 word
    // imperatives — the gate's rewrites do more harm than good there,
    // so they ship prompt-side-ruled only.
    let gatedTitle = title;
    let gatedCloser = closer;
    try {
      const gated = await humanizePass({
        purpose: `humanize:${purpose}`,
        voice: VOICE_LINE,
        payload: { title, closer },
      });
      if (typeof gated.title === "string" && gated.title.trim())
        gatedTitle = gated.title.trim();
      if (typeof gated.closer === "string" && gated.closer.trim())
        gatedCloser = gated.closer.trim();
    } catch (err) {
      console.warn(
        `[timeline-grid] humanize gate failed — shipping ungated copy:`,
        err
      );
    }

    const slug = `timeline-${gatedTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)}`;

    return {
      slug,
      title: gatedTitle,
      coverScene,
      closer: gatedCloser,
      closerScene,
      phases,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// ─── Image prompts ──────────────────────────────────────────────────────────

/**
 * Prompt for one grid CELL photo. Differs from buildMoodyImagePrompt in
 * two deliberate ways: an anonymous person IS allowed (the reference
 * cells show hands typing, a man training from behind), and there is no
 * center-clear mandate (labels are small and get a darken layer).
 */
export function buildGridCellPrompt(scene: string): string {
  return [
    `A REAL photograph a person actually took with a camera: ${scene}`,
    "Dark, moody, masculine lifestyle photography. Desaturated, low-key color grade — charcoal, slate, warm lamp glow against shadow. Quiet luxury and discipline, editorial quality.",
    "If a person appears, ONE anonymous figure at most: shot from behind, in silhouette, or hands only — the face is NEVER visible. No second person.",
    "Shot on a full-frame camera, TACK-SHARP, true-to-life materials and light — indistinguishable from a real photograph. NOT a 3D render, NOT CGI, NOT illustration, no plastic AI look.",
    "Square 1:1 composition, subject clearly readable at thumbnail size.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

/** Cover / closer photos: reuse the BWK men's moody language but allow
 * the reference's lone anonymous figure on the CLOSER. */
export function buildGridWidePrompt(
  scene: string,
  allowFigure: boolean
): string {
  return [
    `A REAL photograph a person actually took with a camera: ${scene}`,
    "Dark, dominant, moody minimalist photography. Desaturated, near-monochrome color grade — charcoal, slate, black, cold glass, night-city light. Deep shadows, austere, powerful.",
    "The entire frame is DIM and shadowed — dark enough that clean white text placed at the center of the image would be perfectly legible.",
    allowFigure
      ? "ONE anonymous man at most, seen from behind or with his face fully obscured, small in the frame. Never a second person, never a readable face."
      : "NO people anywhere in the frame.",
    "Shot on a full-frame camera, TACK-SHARP, editorial architecture-magazine quality — indistinguishable from a real photograph. NOT a 3D render, NOT CGI, NOT illustration, no plastic AI look.",
    "Vertical 9:16 composition, calm and uncluttered in the middle of the frame.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

// ─── Grid composition ───────────────────────────────────────────────────────

const GRID_W = 1080;
const GRID_H = 1080; // square, like the reference collage slides
const COLS = 3;
const ROWS = 2;
const CELL_W = GRID_W / COLS; // 360
const CELL_H = GRID_H / ROWS; // 540

function escapePango(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wordWrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderText(
  markup: string,
  fontPath: string | null,
  maxWidth: number,
  spacing: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const textOpts: Record<string, unknown> = {
    text: markup,
    width: maxWidth,
    rgba: true,
    align: "centre",
    spacing,
  };
  if (fontPath) textOpts.fontfile = fontPath;
  else textOpts.font = "sans-serif";

  const buffer = await sharp({ text: textOpts } as never)
    .extend({
      top: 8,
      bottom: 8,
      left: 8,
      right: 8,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? maxWidth, height: meta.height ?? 64 };
}

/** Text block with a blurred black drop shadow (the compose.ts idiom). */
async function shadowedText(
  body: string,
  font: string,
  fontSize: number,
  fontPath: string | null,
  maxWidth: number,
  spacing: number,
  letterSpacing = 0
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const ls = letterSpacing > 0 ? ` letter_spacing="${letterSpacing}"` : "";
  const main = await renderText(
    `<span font_desc="${font} ${fontSize}" foreground="#FFFFFF"${ls}>${body}</span>`,
    fontPath,
    maxWidth,
    spacing
  );
  const shadow = await renderText(
    `<span font_desc="${font} ${fontSize}" foreground="#000000"${ls}>${body}</span>`,
    fontPath,
    maxWidth,
    spacing
  );
  const blurred = await sharp(shadow.buffer).blur(7).png().toBuffer();
  const buffer = await sharp({
    create: {
      width: main.width + 8,
      height: main.height + 10,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: blurred, top: 6, left: 5 },
      { input: main.buffer, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? main.width,
    height: meta.height ?? main.height,
  };
}

/**
 * Compose one phase slide: six cell photos in a 2×3 grid, a short white
 * label centered on each cell, and the italic-serif caps title band
 * straddling the horizontal seam. Returns a 1080×1080 JPEG.
 */
export async function composeTimelineGridSlide(
  cells: { buffer: Buffer; label: string }[],
  header: string,
  bandTitle: string
): Promise<Buffer> {
  if (cells.length !== 6) {
    throw new Error(`Grid slide needs exactly 6 cells, got ${cells.length}`);
  }
  const sansPath = await ensureFontFile("Medium");
  const serifPath = await ensureFontFile("QuoteSerif");

  const composites: import("sharp").OverlayOptions[] = [];

  // Photos + a flat darken so white labels always read (the reference
  // cells are dim; gpt output varies, this evens them out).
  for (let i = 0; i < 6; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const photo = await sharp(cells[i].buffer)
      .resize(CELL_W, CELL_H, { fit: "cover", position: "attention" })
      .toBuffer();
    composites.push({ input: photo, top: row * CELL_H, left: col * CELL_W });
  }
  composites.push({
    input: await sharp({
      create: {
        width: GRID_W,
        height: GRID_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0.28 },
      },
    })
      .png()
      .toBuffer(),
    top: 0,
    left: 0,
  });

  // Cell labels — centered in each cell, nudged off the seam rows so
  // the center band never collides with the middle-row labels.
  for (let i = 0; i < 6; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const body = wordWrap(cells[i].label, 13)
      .map(escapePango)
      .join("\n");
    const label = await shadowedText(
      body,
      "Poppins Medium",
      34,
      sansPath,
      CELL_W - 28,
      10
    );
    const cellCenterY =
      row === 0 ? row * CELL_H + CELL_H * 0.42 : row * CELL_H + CELL_H * 0.58;
    composites.push({
      input: label.buffer,
      top: Math.round(cellCenterY - label.height / 2),
      left: Math.round(col * CELL_W + (CELL_W - label.width) / 2),
    });
  }

  // Center band: "MONTH 01" over the mission line, straddling the seam.
  const headerText = await shadowedText(
    escapePango(header.toUpperCase()),
    "Playfair Display Medium Italic",
    52,
    serifPath,
    GRID_W - 80,
    8,
    2048
  );
  const bandText = await shadowedText(
    wordWrap(bandTitle.toUpperCase(), 26).map(escapePango).join("\n"),
    "Playfair Display Medium Italic",
    64,
    serifPath,
    GRID_W - 60,
    10,
    2048
  );
  const bandTotal = headerText.height + bandText.height - 6;
  const bandTop = Math.round(GRID_H / 2 - bandTotal / 2);
  composites.push(
    {
      input: headerText.buffer,
      top: bandTop,
      left: Math.round((GRID_W - headerText.width) / 2),
    },
    {
      input: bandText.buffer,
      top: bandTop + headerText.height - 6,
      left: Math.round((GRID_W - bandText.width) / 2),
    }
  );

  return sharp({
    create: {
      width: GRID_W,
      height: GRID_H,
      channels: 3,
      background: { r: 8, g: 8, b: 8 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}
