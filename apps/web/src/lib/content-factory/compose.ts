/**
 * Content Factory — server-side text compositing with sharp.
 *
 * Overlays slide text onto raw generated images using sharp's built-in
 * Pango text renderer (NOT SVG/librsvg, which has no font support in
 * Vercel's Lambda environment). Fonts are loaded via fontfile parameter
 * from the local filesystem or downloaded from the CDN on first use.
 *
 * Output: 1080x1920 JPEG (9:16, TikTok native), quality 90, < 20MB.
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import type { QuoteSurface } from "./moody-carousel";

const OUTPUT_W = 1080;
const OUTPUT_H = 1920; // 9:16 TikTok native
const BURNT_ORANGE = "#F97E4E";
const PADDING_X = 72; // horizontal padding for text

// ─── Font management ────────────────────────────────────────────────────────

/**
 * Ensure a font file is available on disk and return its path.
 * Checks local paths first (local dev), then downloads from the CDN
 * and caches in /tmp/ (Lambda). Returns null if all attempts fail.
 *
 * "QuoteSerif" = Playfair Display Medium Italic — the premium editorial
 * serif used by the quote-loop / questions overlays (2026-08-28 PM, per
 * Keenan: "italicized and fancier... stand out and feel premium").
 */
export async function ensureFontFile(
  variant: "Bold" | "Medium" | "QuoteSerif" = "Bold"
): Promise<string | null> {
  const filename =
    variant === "QuoteSerif"
      ? "PlayfairDisplay-MediumItalic.ttf"
      : `Poppins-${variant}.ttf`;
  const tmpPath = `/tmp/${filename}`;

  if (fs.existsSync(tmpPath)) return tmpPath;

  // Try local paths (works in local dev and some deployment modes)
  const localCandidates = [
    path.join(process.cwd(), "public", "fonts", filename),
    path.join(process.cwd(), ".next", "server", "public", "fonts", filename),
    path.join(process.cwd(), ".next", "standalone", "public", "fonts", filename),
  ];
  for (const p of localCandidates) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, tmpPath);
      console.log(`[compose] Font ${filename} found at ${p}, cached to ${tmpPath}`);
      return tmpPath;
    }
  }

  // Download from CDN (Vercel serves public/ files via CDN)
  try {
    const url = `https://goripple.io/fonts/${filename}`;
    console.log(`[compose] Downloading font ${filename} from CDN…`);
    const res = await fetch(url);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmpPath, buffer);
      console.log(`[compose] Font ${filename} cached to ${tmpPath}`);
      return tmpPath;
    }
    console.warn(`[compose] CDN font download failed: HTTP ${res.status}`);
  } catch (err) {
    console.warn(
      `[compose] CDN font download error: ${err instanceof Error ? err.message : err}`
    );
  }

  return null;
}

// ─── Text helpers ───────────────────────────────────────────────────────────

function escapePango(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wordWrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (
      current.length + word.length + 1 > maxCharsPerLine &&
      current.length > 0
    ) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Render raw Pango markup using sharp's text renderer.
 * Returns the rendered PNG buffer and its dimensions.
 */
async function renderMarkup(
  markup: string,
  fontPath: string | null,
  maxWidth: number,
  lineSpacing: number,
  padding = 0,
  align: "centre" | "left" = "centre"
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const textOpts: Record<string, unknown> = {
    text: markup,
    width: maxWidth,
    rgba: true,
    align,
    spacing: Math.round(lineSpacing),
  };
  if (fontPath) {
    textOpts.fontfile = fontPath;
  } else {
    textOpts.font = "sans-serif";
  }

  let buffer = await sharp({ text: textOpts } as any)
    .png()
    .toBuffer();

  // Add transparent padding so outline offsets don't clip descenders
  if (padding > 0) {
    buffer = await sharp(buffer)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? maxWidth,
    height: meta.height ?? 64,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Rasterize a filled circle (with optional white ring) as a PNG.
 * Drawn from raw pixels — Vercel's Lambda sharp build fails to parse
 * inline SVG (glib XML error seen live 2026-08-11), so no SVG anywhere.
 */
async function circlePng(
  d: number,
  fill: { r: number; g: number; b: number },
  opts?: { ringWidth?: number; alpha?: number }
): Promise<Buffer> {
  const ringW = opts?.ringWidth ?? 0;
  const alpha = opts?.alpha ?? 1;
  const buf = Buffer.alloc(d * d * 4);
  const c = (d - 1) / 2;
  const r = d / 2 - 1.5;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dist = Math.sqrt((x - c) ** 2 + (y - c) ** 2);
      const cov = Math.max(0, Math.min(1, r - dist + 0.5)); // antialiased edge
      if (cov === 0) continue;
      const i = (y * d + x) * 4;
      const inRing = ringW > 0 && dist > r - ringW;
      buf[i] = inRing ? 255 : fill.r;
      buf[i + 1] = inRing ? 255 : fill.g;
      buf[i + 2] = inRing ? 255 : fill.b;
      buf[i + 3] = Math.round(cov * alpha * 255);
    }
  }
  return sharp(buf, { raw: { width: d, height: d, channels: 4 } })
    .png()
    .toBuffer();
}

/** Rasterize a horizontal capsule (fully-rounded bar) as a PNG. */
async function capsulePng(
  w: number,
  h: number,
  fill: { r: number; g: number; b: number },
  alpha = 1
): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 4);
  const r = h / 2 - 0.5;
  const x1 = r;
  const x2 = w - 1 - r;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = Math.max(x1, Math.min(x2, x));
      const dist = Math.sqrt((x - px) ** 2 + (y - cy) ** 2);
      const cov = Math.max(0, Math.min(1, r - dist + 0.5));
      if (cov === 0) continue;
      const i = (y * w + x) * 4;
      buf[i] = fill.r;
      buf[i + 1] = fill.g;
      buf[i + 2] = fill.b;
      buf[i + 3] = Math.round(cov * alpha * 255);
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Build Pango markup for wrapped lines with numeric tokens highlighted
 * in the accent color (e.g. "6 THINGS" → the "6" pops in coral).
 */
function buildLinesMarkup(
  lines: string[],
  fontSize: number,
  baseColor: string,
  accentColor: string
): string {
  const body = lines
    .map((line) =>
      line
        .split(/(\s+)/)
        .map((tok) =>
          /\d/.test(tok) && baseColor !== accentColor
            ? `<span foreground="${accentColor}">${escapePango(tok)}</span>`
            : escapePango(tok)
        )
        .join("")
    )
    .join("\n");
  return `<span font_desc="Poppins Bold ${fontSize}" foreground="${baseColor}">${body}</span>`;
}

// ─── Slide compositing ──────────────────────────────────────────────────────

/**
 * Render a slide's text as a transparent 1080x1920 PNG overlay.
 *
 * Used by the fully animated post (2026-08-10): its artwork is generated
 * WITHOUT baked-in text so the video model can't animate the words, and
 * this exact overlay is composited onto the static JPEG (sharp) AND
 * burned onto the finished MP4 (ffmpeg) — pixel-identical, pixel-frozen.
 *
 * Design (2026-08-11 "eye-popping" pass, requested by Keenan; re-anchored
 * 2026-08-28, per Keenan: the whole text block is CENTERED in the middle
 * of the image, and the cover engagement question is gone):
 *   - UPPERCASE Poppins Bold, big type, the full block vertically
 *     centered in the frame
 *   - Numbers inside the text rendered in the carousel's accent color
 *   - REASON slides get an accent-filled circle badge with the number
 *   - COVER gets a rounded accent underline bar beneath the headline
 *   - Heavy blurred dark shadow so it reads on any artwork
 */
export async function renderSlideTextOverlay(
  text: string,
  kind: "COVER" | "REASON",
  slideNumber?: number,
  accent: string = BURNT_ORANGE,
  /**
   * REASON only (2026-08-16, per Keenan): the supporting "how/why"
   * sentence from the topic engine, rendered smaller under the main text.
   */
  detail?: string
): Promise<Buffer> {
  const fontPath = await ensureFontFile("Bold");
  const display = text.toUpperCase();

  const fontSize = kind === "COVER" ? 64 : 52;
  const maxChars = kind === "COVER" ? 16 : 19;
  const lines = wordWrap(display, maxChars);

  const maxTextW = OUTPUT_W - PADDING_X * 2;
  // Shadow layer (all-dark, blurred, offset) + main layer (white + accent numbers)
  const shadowMarkup = buildLinesMarkup(lines, fontSize, "#111111", "#111111");
  const mainMarkup = buildLinesMarkup(lines, fontSize, "#FFFFFF", accent);
  const shadow = await renderMarkup(shadowMarkup, fontPath, maxTextW, 12, 10);
  const main = await renderMarkup(mainMarkup, fontPath, maxTextW, 12, 10);
  const blurredShadow = await sharp(shadow.buffer).blur(6).png().toBuffer();

  // ── Pre-render every piece so the WHOLE block can be measured and
  // vertically centered (2026-08-28, per Keenan: "centered in the middle
  // of the generation for all posts").
  const BADGE_D = 118;
  const BADGE_GAP = 26;
  let badge: { circle: Buffer; shadow: Buffer; num: { buffer: Buffer; width: number; height: number } } | null = null;
  if (kind === "REASON" && slideNumber) {
    const circle = await circlePng(BADGE_D, hexToRgb(accent), { ringWidth: 5 });
    const numMarkup = `<span font_desc="Poppins Bold 52" foreground="#FFFFFF">${slideNumber}</span>`;
    const num = await renderMarkup(numMarkup, fontPath, BADGE_D, 0, 0);
    const badgeShadow = await sharp(
      await circlePng(BADGE_D, { r: 17, g: 17, b: 17 }, { alpha: 0.65 })
    )
      .blur(6)
      .png()
      .toBuffer();
    badge = { circle, shadow: badgeShadow, num };
  }

  const DETAIL_GAP = 18;
  let detailPiece: { blurred: Buffer; main: { buffer: Buffer; width: number; height: number } } | null = null;
  if (detail && detail.trim()) {
    const mediumPath = await ensureFontFile("Medium");
    const detailLines = wordWrap(detail.trim(), 34);
    const detailBody = detailLines.map((l) => escapePango(l)).join("\n");
    const detailSize = 30;
    const detailMarkupMain = `<span font_desc="Poppins Medium ${detailSize}" foreground="#FFFFFF">${detailBody}</span>`;
    const detailMarkupShadow = `<span font_desc="Poppins Medium ${detailSize}" foreground="#111111">${detailBody}</span>`;
    const dShadow = await renderMarkup(detailMarkupShadow, mediumPath ?? fontPath, maxTextW, 8, 8);
    const dMain = await renderMarkup(detailMarkupMain, mediumPath ?? fontPath, maxTextW, 8, 8);
    const dBlurred = await sharp(dShadow.buffer).blur(5).png().toBuffer();
    detailPiece = { blurred: dBlurred, main: dMain };
  }

  const BAR_W = 180;
  const BAR_H = 14;
  const BAR_GAP = 16;

  const totalH =
    (badge ? BADGE_D + BADGE_GAP : 0) +
    main.height +
    (detailPiece ? DETAIL_GAP + detailPiece.main.height : 0) +
    (kind === "COVER" ? BAR_GAP + BAR_H : 0);

  const composites: sharp.OverlayOptions[] = [];
  let cursorY = Math.round((OUTPUT_H - totalH) / 2);

  // REASON: accent circle badge with the slide number, centered above the text.
  if (badge) {
    const badgeLeft = Math.round((OUTPUT_W - BADGE_D) / 2);
    composites.push(
      { input: badge.shadow, top: cursorY + 5, left: badgeLeft + 4 },
      { input: badge.circle, top: cursorY, left: badgeLeft },
      {
        input: badge.num.buffer,
        top: Math.round(cursorY + (BADGE_D - badge.num.height) / 2),
        left: Math.round(badgeLeft + (BADGE_D - badge.num.width) / 2),
      }
    );
    cursorY += BADGE_D + BADGE_GAP;
  }

  const textLeft = Math.round((OUTPUT_W - main.width) / 2);
  composites.push(
    { input: blurredShadow, top: cursorY + 5, left: textLeft + 4 },
    { input: main.buffer, top: cursorY, left: textLeft }
  );
  cursorY += main.height;

  // Supporting detail line (2026-08-16, per Keenan): a smaller sentence
  // under the main text — the "how/why" beat from the topic engine.
  if (detailPiece) {
    const dLeft = Math.round((OUTPUT_W - detailPiece.main.width) / 2);
    const dTop = cursorY + DETAIL_GAP;
    composites.push(
      { input: detailPiece.blurred, top: dTop + 4, left: dLeft + 3 },
      { input: detailPiece.main.buffer, top: dTop, left: dLeft }
    );
    cursorY = dTop + detailPiece.main.height;
  }

  // COVER: rounded accent bar under the headline for extra pop. The
  // engagement question sub-line is GONE (2026-08-28, per Keenan: "no
  // more question on the cover").
  if (kind === "COVER") {
    const bar = await capsulePng(BAR_W, BAR_H, hexToRgb(accent));
    const barShadow = await sharp(
      await capsulePng(BAR_W, BAR_H, { r: 17, g: 17, b: 17 }, 0.65)
    )
      .blur(5)
      .png()
      .toBuffer();
    const barLeft = Math.round((OUTPUT_W - BAR_W) / 2);
    composites.push(
      { input: barShadow, top: cursorY + BAR_GAP + 4, left: barLeft + 3 },
      { input: bar, top: cursorY + BAR_GAP, left: barLeft }
    );
    cursorY += BAR_GAP + BAR_H;
  }

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** Selfie sticker-text fill colors (per Keenan's 2026-08-25 reference:
 * viral mirror-selfie slideshows use pink/pastel TikTok sticker text
 * with a white outline). Rotated deterministically per post. */
export const SELFIE_TEXT_COLORS = [
  "#FF6FA5", // hot pink (the classic)
  "#FF8FB8", // soft pink
  "#B784F5", // lilac
  "#5EC8F2", // sky blue
] as const;

/** Strip emoji/symbols the Lambda Pango stack can't render (they'd
 * come out as tofu boxes on the burned caption). */
function stripUnrenderable(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Render the burned-on caption for a SELFIE slideshow slide as a
 * transparent 1080x1920 PNG (2026-08-25, per Keenan).
 *
 * Deliberately NOT the branded overlay (uppercase Poppins + accent
 * badges) — a realistic mirror-selfie post must read like text a real
 * person typed over her own photo. Style mimics the viral reference
 * posts: sentence-case colored sticker text with a thick white outline.
 *
 * Placement (per Keenan's 2026-08-25 review of the first example):
 * NEVER over the face. Mirror shots put the block at chest/torso level
 * ("lower"); aesthetic shots have no faces so the upper-middle position
 * stays ("upper").
 */
export async function renderSelfieCaptionOverlay(
  text: string,
  opts?: {
    /** COVER gets bigger type than the step slides. */
    kind?: "COVER" | "REASON";
    /** Smaller supporting line burned below the main text. */
    detail?: string;
    /** Sticker text fill color (defaults to hot pink). */
    color?: string;
    /** "lower" = chest/torso level for mirror selfies (keeps text off
     * the face); "upper" = upper-middle for person-free aesthetic
     * shots. Defaults to "lower" — face-safe is the safe default. */
    placement?: "upper" | "lower";
  }
): Promise<Buffer> {
  const kind = opts?.kind ?? "REASON";
  const fontPath = await ensureFontFile("Bold");
  const color = opts?.color ?? SELFIE_TEXT_COLORS[0];
  const placement = opts?.placement ?? "lower";

  // TikTok-sticker treatment: colored fill with a thick white outline.
  // Pango has no stroke, so the outline is the same text composited at
  // 8 offsets underneath the colored fill (same trick as the shadow
  // layers elsewhere in this file — no SVG, Lambda-safe).
  // Phase 1: render each block and measure it; positions come later so
  // the whole stack can be anchored as one unit.
  type StickerBlock = {
    shadow: Buffer;
    outline: Buffer;
    main: Buffer;
    width: number;
    height: number;
    strokeW: number;
  };
  const renderStickerBlock = async (
    lines: string[],
    fontSize: number,
    fill: string,
    outlineColor = "#FFFFFF"
  ): Promise<StickerBlock> => {
    const body = lines.map((l) => escapePango(l)).join("\n");
    const strokeW = Math.max(3, Math.round(fontSize / 14));
    const pad = strokeW + 6;
    const maxTextW = OUTPUT_W - PADDING_X * 2;
    const outlineMarkup = `<span font_desc="Poppins Bold ${fontSize}" foreground="${outlineColor}">${body}</span>`;
    const fillMarkup = `<span font_desc="Poppins Bold ${fontSize}" foreground="${fill}">${body}</span>`;
    const outline = await renderMarkup(outlineMarkup, fontPath, maxTextW, 10, pad);
    const main = await renderMarkup(fillMarkup, fontPath, maxTextW, 10, pad);
    // Soft drop shadow so the sticker reads on bright mirrors too.
    const shadowMarkup = `<span font_desc="Poppins Bold ${fontSize}" foreground="#333333">${body}</span>`;
    const shadow = await renderMarkup(shadowMarkup, fontPath, maxTextW, 10, pad);
    const blurredShadow = await sharp(shadow.buffer).blur(7).png().toBuffer();
    return {
      shadow: blurredShadow,
      outline: outline.buffer,
      main: main.buffer,
      width: main.width,
      height: main.height,
      strokeW,
    };
  };

  const blocks: StickerBlock[] = [];
  const mainText = stripUnrenderable(text);
  const mainSize = kind === "COVER" ? 58 : 48;
  blocks.push(
    await renderStickerBlock(wordWrap(mainText, kind === "COVER" ? 18 : 22), mainSize, color)
  );

  const detail = opts?.detail ? stripUnrenderable(opts.detail) : "";
  if (detail) {
    // White fill needs a DARK outline — a white-on-white outline smears
    // the small type into an illegible blob (seen on the 2026-08-25
    // example run). Dark outline keeps it crisp at this size.
    blocks.push(await renderStickerBlock(wordWrap(detail, 28), 34, "#FFFFFF", "#2A2A2A"));
  }

  // Phase 2: anchor the whole stack. "upper" sits below the top 15%
  // platform chrome; "lower" centers around 58% of frame height —
  // chest/torso on a mirror selfie, clear of the face (upper ~40%) and
  // the bottom 15% caption/music chrome.
  const GAP = 18;
  const totalH = blocks.reduce((s, b) => s + b.height, 0) + GAP * (blocks.length - 1);
  let cursorY: number;
  if (placement === "upper") {
    cursorY = Math.round(OUTPUT_H * (kind === "COVER" ? 0.2 : 0.22));
  } else {
    cursorY = Math.round(OUTPUT_H * 0.58 - totalH / 2);
    // Clamp: never above 42% (face territory), never past 82% (chrome).
    cursorY = Math.max(Math.round(OUTPUT_H * 0.42), cursorY);
    cursorY = Math.min(Math.round(OUTPUT_H * 0.82) - totalH, cursorY);
  }

  const composites: import("sharp").OverlayOptions[] = [];
  for (const b of blocks) {
    const left = Math.round((OUTPUT_W - b.width) / 2);
    composites.push({ input: b.shadow, top: cursorY + 6, left: left + 4 });
    for (const [dx, dy] of [
      [-b.strokeW, 0], [b.strokeW, 0], [0, -b.strokeW], [0, b.strokeW],
      [-b.strokeW, -b.strokeW], [b.strokeW, -b.strokeW], [-b.strokeW, b.strokeW], [b.strokeW, b.strokeW],
    ]) {
      composites.push({ input: b.outline, top: cursorY + dy, left: left + dx });
    }
    composites.push({ input: b.main, top: cursorY, left });
    cursorY += b.height + GAP;
  }

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Render the MOODY discipline-carousel text as a transparent 1080x1920
 * PNG (2026-08-28, per Keenan — cloned from the "TRUST THE PROCESS"
 * reference): clean white sentence-case type, centered dead-middle of
 * the frame, paragraphs separated by blank lines, a soft blurred shadow
 * for legibility on the dim photography. Deliberately NOT the branded
 * overlay — no accent color, no badge, no bar.
 *
 * COVER: the short title, uppercase, bold, letter-spaced.
 * ITEM: the numbered name ("4. Reset day.") + its paragraphs, all one
 * uniform size like the reference.
 * QUOTE (2026-08-28 PM): one short devastating line in Playfair Display
 * Medium Italic — a premium editorial serif (per Keenan: "italicized and
 * fancier... stand out and feel premium") — used by the quote-loop
 * videos and the hard-questions slides, where a single line carries the
 * frame.
 */
export async function renderMoodyTextOverlay(
  paragraphs: string[],
  // SIGN (2026-08-28 night, per Keenan: "bold, confident lettering", no
  // italics): the single-image sign post — COVER's bold uppercase
  // treatment, sized down and wrapped wider so a full 8-16-word line
  // reads as a block instead of a skinny tower.
  kind: "COVER" | "ITEM" | "QUOTE" | "SIGN",
  // Text tone (2026-08-30, per Keenan: "make the ripple posts be
  // lighter schemes") — Ripple lanes shoot LIGHT airy scenes, so their
  // text renders dark charcoal with a soft light halo; BWK keeps white
  // text on dark scenes.
  tone: "white" | "dark" = "white"
): Promise<Buffer> {
  const fontPath = await ensureFontFile(
    kind === "ITEM" ? "Medium" : kind === "QUOTE" ? "QuoteSerif" : "Bold"
  );

  const fontSize =
    kind === "COVER" ? 72 : kind === "SIGN" ? 60 : kind === "QUOTE" ? 58 : 42;
  const wrapChars =
    kind === "COVER" ? 14 : kind === "SIGN" ? 18 : kind === "QUOTE" ? 22 : 30;
  const font =
    kind === "ITEM"
      ? "Poppins Medium"
      : kind === "QUOTE"
        ? "Playfair Display Medium Italic"
        : "Poppins Bold";

  const uppercase = kind === "COVER" || kind === "SIGN";
  const body = paragraphs
    .map((p) =>
      wordWrap(stripUnrenderable(uppercase ? p.toUpperCase() : p), wrapChars)
        .map((l) => escapePango(l))
        .join("\n")
    )
    .join("\n\n"); // blank line = paragraph gap (Pango honors empty lines)

  const spacing = uppercase ? 16 : kind === "QUOTE" ? 18 : 14;
  const letterSpacing = uppercase ? ` letter_spacing="3072"` : "";
  const mainColor = tone === "dark" ? "#2B2622" : "#FFFFFF";
  const shadowColor = tone === "dark" ? "#FFFFFF" : "#000000";
  const mainMarkup = `<span font_desc="${font} ${fontSize}" foreground="${mainColor}"${letterSpacing}>${body}</span>`;
  const shadowMarkup = `<span font_desc="${font} ${fontSize}" foreground="${shadowColor}"${letterSpacing}>${body}</span>`;

  const maxTextW = OUTPUT_W - PADDING_X * 2;
  const main = await renderMarkup(mainMarkup, fontPath, maxTextW, spacing, 8);
  const shadow = await renderMarkup(shadowMarkup, fontPath, maxTextW, spacing, 8);
  const blurredShadow = await sharp(shadow.buffer).blur(9).png().toBuffer();

  const top = Math.round((OUTPUT_H - main.height) / 2);
  const left = Math.round((OUTPUT_W - main.width) / 2);

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: blurredShadow, top: top + 4, left: left + 2 },
      { input: main.buffer, top, left },
    ])
    .png()
    .toBuffer();
}

/**
 * Render the PHONE-QUOTE note-screen slide as a complete 1080x1920 JPEG
 * (2026-09-03, per Keenan's reference screenshots: "the next slide is a
 * phone screen with a quote about something important").
 *
 * 2026-09-04 REDESIGN, per Keenan ("IT's supposed to look like text
 * written out on a phone screen... not just a blank ass image"): the
 * slide now renders full Notes-app chrome — status bar (time, signal,
 * wifi, battery), a "< Notes" back row with action dots, a small
 * centered date line, and the quote typed LEFT-ALIGNED near the top
 * like a real note. All deterministic (no gpt-image-2 — the quote can
 * never be misspelled). Two variants:
 * - "women" (Ripple): soft light-blue notes screen, near-black text.
 * - "men" (BWK): true iOS-dark notes screen (#1C1C1E), gold accent.
 */
async function renderNotesScreenNative(
  quote: string,
  variant: "women" | "men",
  nativeH: number,
  opts: {
    /** Draw the Dynamic Island cutout (only when the screen is shown as
     * a physical phone in a photo — real screenshots don't include it). */
    withIsland: boolean;
    quoteFontSize: number;
    wrapChars: number;
  }
): Promise<Buffer> {
  const fontMedium = await ensureFontFile("Medium");
  const fontBold = await ensureFontFile("Bold");
  const isWomen = variant === "women";

  const bg = isWomen
    ? { r: 0xd9, g: 0xea, b: 0xf7 }
    : { r: 0x1c, g: 0x1c, b: 0x1e };
  const textColor = isWomen ? "#1C2733" : "#F2F2F0";
  const chrome = isWomen ? "#1C2733" : "#F2F2F0"; // status-bar glyphs
  const accent = isWomen ? "#3D6186" : "#E5B84C"; // back label + actions
  const subtle = isWomen ? "#5C7288" : "#98989E"; // date line

  // ── Status-bar + nav chrome (shapes only — no SVG text, so no
  // system-font dependency in the serverless runtime) ──
  const chromeSvg = `<svg width="${OUTPUT_W}" height="${nativeH}" viewBox="0 0 ${OUTPUT_W} ${nativeH}" xmlns="http://www.w3.org/2000/svg">
  ${opts.withIsland ? `<rect x="415" y="24" width="250" height="76" rx="38" fill="#000000"/>` : ""}
  <!-- signal bars -->
  <rect x="806" y="58" width="10" height="12" rx="3" fill="${chrome}"/>
  <rect x="822" y="52" width="10" height="18" rx="3" fill="${chrome}"/>
  <rect x="838" y="46" width="10" height="24" rx="3" fill="${chrome}"/>
  <rect x="854" y="40" width="10" height="30" rx="3" fill="${chrome}"/>
  <!-- wifi -->
  <path d="M 888 52 A 30 30 0 0 1 928 52" stroke="${chrome}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M 896 61 A 18 18 0 0 1 920 61" stroke="${chrome}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="908" cy="70" r="5" fill="${chrome}"/>
  <!-- battery -->
  <rect x="948" y="42" width="58" height="28" rx="9" stroke="${chrome}" stroke-width="4" fill="none"/>
  <rect x="954" y="48" width="34" height="16" rx="4" fill="${chrome}"/>
  <path d="M 1010 50 Q 1016 56 1010 62" stroke="${chrome}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <!-- back chevron -->
  <path d="M 92 132 L 64 162 L 92 192" stroke="${accent}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- action dots (ellipsis in circle) -->
  <circle cx="1002" cy="162" r="30" stroke="${accent}" stroke-width="5" fill="none"/>
  <circle cx="988" cy="162" r="4.5" fill="${accent}"/>
  <circle cx="1002" cy="162" r="4.5" fill="${accent}"/>
  <circle cx="1016" cy="162" r="4.5" fill="${accent}"/>
</svg>`;

  // ── Text pieces (Pango pipeline, same as every slide) ──
  const timePiece = await renderMarkup(
    `<span font_desc="Poppins Bold 34" foreground="${chrome}">9:41</span>`,
    fontBold,
    200,
    0,
    4,
    "left"
  );
  const notesPiece = await renderMarkup(
    `<span font_desc="Poppins Medium 40" foreground="${accent}">Notes</span>`,
    fontMedium,
    300,
    0,
    4,
    "left"
  );
  const now = new Date();
  const dateLine = `${now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })} at 9:41 PM`;
  const datePiece = await renderMarkup(
    `<span font_desc="Poppins Medium 28" foreground="${subtle}">${escapePango(dateLine)}</span>`,
    fontMedium,
    600,
    0,
    4
  );

  const quoteLines = wordWrap(stripUnrenderable(quote), opts.wrapChars);
  const quoteMarkup = `<span font_desc="Poppins Medium ${opts.quoteFontSize}" foreground="${textColor}">${quoteLines
    .map((l) => escapePango(l))
    .join("\n")}</span>`;
  const quotePiece = await renderMarkup(
    quoteMarkup,
    fontMedium,
    OUTPUT_W - 96 * 2,
    Math.round(opts.quoteFontSize / 2),
    8,
    "left"
  );

  return sharp({
    create: {
      width: OUTPUT_W,
      height: nativeH,
      channels: 3,
      background: bg,
    },
  })
    .composite([
      { input: Buffer.from(chromeSvg), top: 0, left: 0 },
      { input: timePiece.buffer, top: 38, left: 96 },
      { input: notesPiece.buffer, top: 138, left: 110 },
      {
        input: datePiece.buffer,
        top: 268,
        left: Math.round((OUTPUT_W - datePiece.width) / 2),
      },
      { input: quotePiece.buffer, top: 400, left: 96 },
    ])
    .png()
    .toBuffer();
}

export async function renderPhoneQuoteSlide(
  quote: string,
  variant: "women" | "men",
  /**
   * 2026-09-08, per Keenan ("you need to put the quotes onto some sort
   * of screen and bake it into the image"): when a background photo is
   * supplied, the Notes screen renders on a realistic drawn iPhone
   * composited over it — the quote is visibly ON a device inside a
   * photograph, and the text still never touches the image model.
   * Without a background (old posts recomposing, or the background
   * generation failed), falls back to the full-bleed screenshot.
   */
  background?: Buffer
): Promise<Buffer> {
  if (!background) {
    const screen = await renderNotesScreenNative(quote, variant, OUTPUT_H, {
      withIsland: false,
      quoteFontSize: 52,
      wrapChars: 28,
    });
    return sharp(screen).jpeg({ quality: 90 }).toBuffer();
  }

  // ── Phone-in-scene geometry (1080x1920 canvas) ──
  const PHONE_W = 700;
  const PHONE_H = 1466;
  const BEZEL = 22;
  const PHONE_R = 110;
  const SCREEN_W = PHONE_W - BEZEL * 2; // 656
  const SCREEN_H = PHONE_H - BEZEL * 2; // 1422 (≈9:19.5, real iPhone aspect)
  const phoneLeft = Math.round((OUTPUT_W - PHONE_W) / 2);
  const phoneTop = Math.round((OUTPUT_H - PHONE_H) / 2);

  // Render the screen at native 1080-wide resolution (bigger quote type
  // so it stays legible after the downscale), then resize onto the phone.
  const nativeH = Math.round((OUTPUT_W * SCREEN_H) / SCREEN_W);
  const screenNative = await renderNotesScreenNative(quote, variant, nativeH, {
    withIsland: true,
    quoteFontSize: 66,
    wrapChars: 24,
  });
  const screenR = PHONE_R - BEZEL;
  const screenMask = Buffer.from(
    `<svg width="${SCREEN_W}" height="${SCREEN_H}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${SCREEN_W}" height="${SCREEN_H}" rx="${screenR}" fill="#ffffff"/></svg>`
  );
  const screen = await sharp(screenNative)
    .resize(SCREEN_W, SCREEN_H)
    .ensureAlpha()
    .composite([{ input: screenMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Drop shadow + phone body + side buttons — drawn shapes, no fonts.
  const phoneSvg = Buffer.from(`<svg width="${OUTPUT_W}" height="${OUTPUT_H}" viewBox="0 0 ${OUTPUT_W} ${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ps" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="28"/>
    </filter>
  </defs>
  <rect x="${phoneLeft + 6}" y="${phoneTop + 30}" width="${PHONE_W}" height="${PHONE_H}" rx="${PHONE_R}" fill="#000000" opacity="0.55" filter="url(#ps)"/>
  <rect x="${phoneLeft - 6}" y="${phoneTop + 340}" width="6" height="110" rx="3" fill="#2A2A2E"/>
  <rect x="${phoneLeft - 6}" y="${phoneTop + 490}" width="6" height="110" rx="3" fill="#2A2A2E"/>
  <rect x="${phoneLeft + PHONE_W}" y="${phoneTop + 420}" width="6" height="170" rx="3" fill="#2A2A2E"/>
  <rect x="${phoneLeft}" y="${phoneTop}" width="${PHONE_W}" height="${PHONE_H}" rx="${PHONE_R}" fill="#0B0B0D"/>
  <rect x="${phoneLeft + 2}" y="${phoneTop + 2}" width="${PHONE_W - 4}" height="${PHONE_H - 4}" rx="${PHONE_R - 2}" fill="none" stroke="#3A3A3E" stroke-width="3"/>
</svg>`);

  return sharp(background)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([
      { input: phoneSvg, top: 0, left: 0 },
      { input: screen, top: phoneTop + BEZEL, left: phoneLeft + BEZEL },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ─── Quote-surface system (2026-09-08) ──────────────────────────────────────
// Per Keenan (rejecting the drawn-phone mockup as "way too generic... it
// needs to be more built into the environment"): the AI now photographs a
// real scene CONTAINING a blank glowing white screen — a phone in a hand,
// a flip phone, a car dashboard display, a billboard, a sign — and our
// code finds that blank screen and composites the deterministic text onto
// it. The quote text still NEVER touches the image model.

export interface BrightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Find the blank glowing screen in a 1080x1920 scene photo.
 *
 * Downsamples to 270x480 grayscale, thresholds bright pixels, takes the
 * largest connected component, and validates that it's a clean solid
 * rectangle (high bbox fill ratio, sane size). Returns null when no
 * convincing screen exists — callers fall back to the drawn-phone or
 * flat render.
 */
export async function detectBrightRect(
  frame: Buffer
): Promise<BrightRect | null> {
  const DW = 270;
  const DH = 480;
  const T = 228; // luminance threshold — prompt demands a pure-white screen
  const { data } = await sharp(frame)
    .resize(DW, DH, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const seen = new Uint8Array(DW * DH);
  let best: {
    area: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null = null;

  for (let i = 0; i < DW * DH; i++) {
    if (seen[i] || data[i] < T) continue;
    let area = 0;
    let minX = DW,
      maxX = 0,
      minY = DH,
      maxY = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % DW;
      const py = (p / DW) | 0;
      area++;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (px > 0 && !seen[p - 1] && data[p - 1] >= T) {
        seen[p - 1] = 1;
        stack.push(p - 1);
      }
      if (px < DW - 1 && !seen[p + 1] && data[p + 1] >= T) {
        seen[p + 1] = 1;
        stack.push(p + 1);
      }
      if (py > 0 && !seen[p - DW] && data[p - DW] >= T) {
        seen[p - DW] = 1;
        stack.push(p - DW);
      }
      if (py < DH - 1 && !seen[p + DW] && data[p + DW] >= T) {
        seen[p + DW] = 1;
        stack.push(p + DW);
      }
    }
    if (!best || area > best.area) best = { area, minX, maxX, minY, maxY };
  }

  if (!best) return null;
  const bw = best.maxX - best.minX + 1;
  const bh = best.maxY - best.minY + 1;
  // Must be big enough to hold legible text…
  if (best.area < DW * DH * 0.03) return null;
  if (bw < DW * 0.2 || bh < DH * 0.06) return null;
  // …a clean solid rectangle (not a lamp / bloom / diagonal screen)…
  if (best.area / (bw * bh) < 0.82) return null;
  // …and not a blown-out whole frame (failed generation).
  if (bw > DW * 0.96 && bh > DH * 0.96) return null;

  const sx = OUTPUT_W / DW;
  const sy = OUTPUT_H / DH;
  return {
    x: Math.round(best.minX * sx),
    y: Math.round(best.minY * sy),
    w: Math.round(bw * sx),
    h: Math.round(bh * sy),
  };
}

/**
 * Render wrapped quote text, shrinking the font until it fits maxH.
 */
async function fitQuoteText(opts: {
  text: string;
  font: "Bold" | "Medium";
  color: string;
  maxW: number;
  maxH: number;
  startSize: number;
  minSize: number;
  align: "centre" | "left";
  /** Extra line spacing multiplier (letterboard signs breathe more). */
  lineSpacingFactor?: number;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const fontPath = await ensureFontFile(opts.font);
  const family = opts.font === "Bold" ? "Poppins Bold" : "Poppins Medium";
  const lsf = opts.lineSpacingFactor ?? 0.45;
  let last: { buffer: Buffer; width: number; height: number } | null = null;
  for (let size = opts.startSize; size >= opts.minSize; size -= 4) {
    const wrapChars = Math.max(8, Math.floor(opts.maxW / (size * 0.6)));
    const lines = wordWrap(opts.text, wrapChars);
    const markup = `<span font_desc="${family} ${size}" foreground="${opts.color}">${lines
      .map((l) => escapePango(l))
      .join("\n")}</span>`;
    last = await renderMarkup(
      markup,
      fontPath,
      opts.maxW,
      Math.round(size * lsf),
      6,
      opts.align
    );
    if (last.height <= opts.maxH) return last;
  }
  return last!; // smallest size — may slightly overflow, better than throwing
}

/** The "friend" whose message is coming in on phone surfaces. */
const SURFACE_FRIEND: Record<"women" | "men", string> = {
  women: "Jess",
  men: "Marcus",
};

/** Expected h/w of the detected screen per surface — a landscape rect
 * claiming to be a hand-held iPhone means detection grabbed something
 * else, so reject and fall back. minWFrac (2026-09-08, per Keenan
 * "you can't even read it now. it should take up almost the whole
 * page") is the minimum rect width as a fraction of frame width — a
 * screen smaller than this renders unreadable text, so treat it as a
 * detection failure and let the retry/fallback chain fire. */
const SURFACE_ASPECT: Record<
  QuoteSurface,
  { min: number; max: number; minWFrac: number }
> = {
  imessage: { min: 1.3, max: 2.6, minWFrac: 0.5 },
  flip: { min: 0.7, max: 1.8, minWFrac: 0.45 },
  car: { min: 0.25, max: 0.9, minWFrac: 0.6 },
  billboard: { min: 0.2, max: 0.9, minWFrac: 0.6 },
  sign: { min: 0.5, max: 1.6, minWFrac: 0.5 },
  poster: { min: 1.1, max: 2.2, minWFrac: 0.45 },
};

/**
 * Render the deterministic screen content for a surface, sized exactly
 * to the detected rect (w×h at full resolution). Designed at 1080-wide
 * and downscaled so type stays crisp.
 */
export async function renderSurfaceOverlay(
  quote: string,
  variant: "women" | "men",
  surface: QuoteSurface,
  w: number,
  h: number
): Promise<Buffer> {
  const clean = stripUnrenderable(quote);
  const DW = 1080;
  const DH = Math.max(200, Math.round((DW * h) / w));
  const isWomen = variant === "women";
  const friend = SURFACE_FRIEND[variant];
  const fontMedium = await ensureFontFile("Medium");
  let design: Buffer;

  if (surface === "imessage") {
    // An iMessage thread with ONE incoming bubble — "a true text message
    // from a friend coming in" (Keenan, 2026-09-08). Light for women,
    // iOS dark mode for men.
    const bg = isWomen
      ? { r: 0xff, g: 0xff, b: 0xff }
      : { r: 0x00, g: 0x00, b: 0x00 };
    const headerFill = isWomen ? "#F6F6F8" : "#101012";
    const bubbleFill = isWomen ? "#E9E9EB" : "#26262A";
    const textColor = isWomen ? "#0B0B0D" : "#F2F2F0";
    const subtle = isWomen ? "#8E8E93" : "#98989E";
    const s = Math.min(1, DH / 2100); // compact chrome on squat screens
    const headerH = Math.round(340 * s);

    const avatar = await circlePng(Math.round(150 * s), {
      r: 0xa9,
      g: 0xab,
      b: 0xb2,
    });
    const chromeSvg = `<svg width="${DW}" height="${DH}" viewBox="0 0 ${DW} ${DH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${DW}" height="${headerH}" fill="${headerFill}"/>
  <rect x="0" y="${headerH - 2}" width="${DW}" height="2" fill="${isWomen ? "#D8D8DC" : "#2A2A2E"}" opacity="0.8"/>
  <path d="M ${Math.round(70 * s)} ${Math.round(140 * s)} L ${Math.round(38 * s)} ${Math.round(175 * s)} L ${Math.round(70 * s)} ${Math.round(210 * s)}" stroke="#0A84FF" stroke-width="${Math.max(4, Math.round(9 * s))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    const namePiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(20, Math.round(32 * s))}" foreground="${textColor}">${escapePango(friend)}</span>`,
      fontMedium,
      500,
      0,
      4
    );
    const datePiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(16, Math.round(26 * s))}" foreground="${subtle}">Today 9:41 PM</span>`,
      fontMedium,
      500,
      0,
      4
    );
    const placeholderPiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(16, Math.round(28 * s))}" foreground="${subtle}">iMessage</span>`,
      fontMedium,
      400,
      0,
      4,
      "left"
    );
    // Real threads pin the newest message to the BOTTOM, just above the
    // input bar — not floating at the top of an empty screen.
    const inputH = Math.round(88 * s);
    const inputTop = DH - inputH - Math.round(44 * s);
    const padX = 44;
    const padY = 38;
    const quotePiece = await fitQuoteText({
      text: clean,
      font: "Medium",
      color: textColor,
      maxW: Math.round(DW * 0.62),
      maxH: inputTop - headerH - padY * 2 - Math.round(160 * s),
      startSize: 46,
      minSize: 24,
      align: "left",
    });
    const bubbleW = quotePiece.width + padX * 2;
    const bubbleH = quotePiece.height + padY * 2;
    const bubbleTop = inputTop - Math.round(40 * s) - bubbleH;
    const bubbleSvg = `<svg width="${bubbleW}" height="${bubbleH}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${bubbleW}" height="${bubbleH}" rx="44" fill="${bubbleFill}"/></svg>`;
    const plusD = Math.round(72 * s);
    const inputSvg = `<svg width="${DW}" height="${inputH + 20}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${36 + plusD / 2}" cy="${inputH / 2}" r="${plusD / 2}" fill="${bubbleFill}"/>
  <path d="M ${36 + plusD / 2 - plusD * 0.22} ${inputH / 2} h ${plusD * 0.44} M ${36 + plusD / 2} ${inputH / 2 - plusD * 0.22} v ${plusD * 0.44}" stroke="${subtle}" stroke-width="${Math.max(3, Math.round(6 * s))}" stroke-linecap="round"/>
  <rect x="${36 + plusD + 28}" y="0" width="${DW - 36 - plusD - 28 - 36}" height="${inputH}" rx="${inputH / 2}" fill="none" stroke="${isWomen ? "#C7C7CC" : "#3A3A3E"}" stroke-width="3"/>
</svg>`;

    design = await sharp({
      create: { width: DW, height: DH, channels: 3, background: bg },
    })
      .composite([
        { input: Buffer.from(chromeSvg), top: 0, left: 0 },
        {
          input: avatar,
          top: Math.round(60 * s),
          left: Math.round((DW - 150 * s) / 2),
        },
        {
          input: namePiece.buffer,
          top: Math.round(230 * s),
          left: Math.round((DW - namePiece.width) / 2),
        },
        {
          input: datePiece.buffer,
          top: bubbleTop - datePiece.height - Math.round(28 * s),
          left: Math.round((DW - datePiece.width) / 2),
        },
        { input: Buffer.from(bubbleSvg), top: bubbleTop, left: 48 },
        {
          input: quotePiece.buffer,
          top: bubbleTop + padY,
          left: 48 + padX,
        },
        { input: Buffer.from(inputSvg), top: inputTop, left: 0 },
        {
          input: placeholderPiece.buffer,
          top: inputTop + Math.round((inputH - placeholderPiece.height) / 2),
          left: 36 + plusD + 28 + 36,
        },
      ])
      .png()
      .toBuffer();
  } else if (surface === "flip") {
    // Classic backlit-LCD flip-phone SMS. Same look both brands —
    // flip phones don't do dark mode.
    const bg = { r: 0xc6, g: 0xd6, b: 0x9b };
    const stripFill = "#8FA768";
    const textColor = "#222E10";
    const stripH = Math.round(DH * 0.13);
    const stripSvg = `<svg width="${DW}" height="${DH}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${DW}" height="${stripH}" fill="${stripFill}"/></svg>`;
    const headerPiece = await renderMarkup(
      `<span font_desc="Poppins Medium 34" foreground="#1A230C">1 New Message</span>`,
      fontMedium,
      700,
      0,
      4,
      "left"
    );
    const fromPiece = await renderMarkup(
      `<span font_desc="Poppins Medium 32" foreground="${textColor}">From: ${escapePango(friend)}</span>`,
      fontMedium,
      700,
      0,
      4,
      "left"
    );
    const bodyTop = stripH + 110;
    const quotePiece = await fitQuoteText({
      text: clean,
      font: "Medium",
      color: textColor,
      maxW: DW - 96,
      maxH: DH - bodyTop - 50,
      startSize: 46,
      minSize: 24,
      align: "left",
    });
    design = await sharp({
      create: { width: DW, height: DH, channels: 3, background: bg },
    })
      .composite([
        { input: Buffer.from(stripSvg), top: 0, left: 0 },
        {
          input: headerPiece.buffer,
          top: Math.max(8, Math.round((stripH - headerPiece.height) / 2)),
          left: 44,
        },
        { input: fromPiece.buffer, top: stripH + 30, left: 44 },
        { input: quotePiece.buffer, top: bodyTop, left: 48 },
      ])
      .png()
      .toBuffer();
  } else if (surface === "car") {
    // Bluetooth Audio media screen (2026-09-10, cloned from Keenan's
    // car-dash reference: "this is exactly what i'm looking for...
    // where it blends right into the image"). The quote renders as the
    // now-playing track text inside real dash chrome: red "Bluetooth
    // Audio" header, Source button, blue Bluetooth badge, track
    // progress times, RAND / RPT / pause / Sound buttons. Chrome is
    // identical for both audiences — a real car UI has no brand skin;
    // realism IS the blend.
    const bg = { r: 0x07, g: 0x0a, b: 0x10 };
    const s = Math.min(1, DH / 640);
    const px = (n: number) => Math.max(2, Math.round(n * s));
    const headerRed = "#E0524D";
    const chromeGrey = "#9AA3AE";
    const trackWhite = "#EDF1F5";
    const btBlue = "#3F7BD9";

    const headerPiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(18, px(32))}" foreground="${headerRed}">Bluetooth Audio</span>`,
      fontMedium,
      600,
      0,
      4,
      "left"
    );
    const srcW = px(190);
    const srcH = px(62);
    const sourcePiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(15, px(26))}" foreground="${trackWhite}">Source</span>`,
      fontMedium,
      300,
      0,
      4
    );

    // Bottom button row: RAND · RPT · ⏸ · Sound.
    const btnH = px(70);
    const btnY = DH - btnH - px(22);
    const btnDefs = [
      { label: "RAND", w: px(170), x: 44 },
      { label: "RPT", w: px(140), x: 44 + px(170) + px(20) },
      { label: "", w: px(120), x: Math.round(DW / 2 - px(60)) }, // pause
      { label: "Sound", w: px(190), x: DW - 44 - px(190) },
    ];
    const btnLabels = await Promise.all(
      btnDefs.map((b) =>
        b.label
          ? renderMarkup(
              `<span font_desc="Poppins Medium ${Math.max(14, px(24))}" foreground="${chromeGrey}">${b.label}</span>`,
              fontMedium,
              300,
              0,
              4
            )
          : Promise.resolve(null)
      )
    );

    // Bluetooth badge box, left of the track text like the reference.
    const btBox = Math.min(px(190), Math.round(DH * 0.34));
    const btBoxY = Math.round(px(96) + (btnY - px(150) - px(96) - btBox) / 2);
    const c = 44 + btBox / 2;
    const gT = btBoxY + btBox * 0.18;
    const gB = btBoxY + btBox * 0.82;
    const gW = btBox * 0.2;
    const gQ = (gB - gT) * 0.25;

    // Track progress row: elapsed / bar / remaining.
    const progY = btnY - px(76);
    const elapsedPiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(15, px(26))}" foreground="${chromeGrey}">1:52</span>`,
      fontMedium,
      200,
      0,
      4
    );
    const remainPiece = await renderMarkup(
      `<span font_desc="Poppins Medium ${Math.max(15, px(26))}" foreground="${chromeGrey}">-0:42</span>`,
      fontMedium,
      200,
      0,
      4
    );

    const textLeft = 44 + btBox + px(44);
    const textW = DW - textLeft - 44;
    const textTop = px(100);
    const quotePiece = await fitQuoteText({
      text: clean,
      font: "Medium",
      color: trackWhite,
      maxW: textW,
      maxH: progY - textTop - px(16),
      startSize: 44,
      minSize: 22,
      align: "centre",
    });

    const barX = textLeft + elapsedPiece.width + px(24);
    const barW =
      DW - 44 - remainPiece.width - px(24) - barX;
    const chromeSvg = `<svg width="${DW}" height="${DH}" viewBox="0 0 ${DW} ${DH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${DW - 44 - srcW}" y="${px(20)}" width="${srcW}" height="${srcH}" rx="${px(8)}" fill="none" stroke="${chromeGrey}" stroke-width="${Math.max(2, px(3))}"/>
  <rect x="0" y="${px(92)}" width="${DW}" height="${Math.max(2, px(3))}" fill="${chromeGrey}" opacity="0.35"/>
  <rect x="44" y="${btBoxY}" width="${btBox}" height="${btBox}" rx="${px(10)}" fill="#101B30" stroke="${btBlue}" stroke-width="${Math.max(2, px(3))}" stroke-opacity="0.5"/>
  <path d="M ${c} ${gT} L ${c} ${gB} L ${c + gW} ${gB - gQ} L ${c - gW} ${gT + gQ} M ${c} ${gT} L ${c + gW} ${gT + gQ} L ${c - gW} ${gB - gQ}" stroke="${btBlue}" stroke-width="${Math.max(3, px(7))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="${barX}" y="${progY + px(10)}" width="${Math.max(40, barW)}" height="${Math.max(3, px(5))}" rx="${px(2)}" fill="${chromeGrey}" opacity="0.35"/>
  <rect x="${barX}" y="${progY + px(10)}" width="${Math.max(28, Math.round(barW * 0.72))}" height="${Math.max(3, px(5))}" rx="${px(2)}" fill="${trackWhite}"/>
  ${btnDefs
    .map(
      (b) =>
        `<rect x="${b.x}" y="${btnY}" width="${b.w}" height="${btnH}" rx="${px(8)}" fill="none" stroke="${chromeGrey}" stroke-width="${Math.max(2, px(3))}" stroke-opacity="0.8"/>`
    )
    .join("\n  ")}
  <rect x="${btnDefs[2].x + btnDefs[2].w / 2 - px(16)}" y="${btnY + px(18)}" width="${px(10)}" height="${btnH - px(36)}" fill="${trackWhite}"/>
  <rect x="${btnDefs[2].x + btnDefs[2].w / 2 + px(6)}" y="${btnY + px(18)}" width="${px(10)}" height="${btnH - px(36)}" fill="${trackWhite}"/>
</svg>`;

    const composites: { input: Buffer; top: number; left: number }[] = [
      { input: Buffer.from(chromeSvg), top: 0, left: 0 },
      { input: headerPiece.buffer, top: px(26), left: 44 },
      {
        input: sourcePiece.buffer,
        top: px(20) + Math.round((srcH - sourcePiece.height) / 2),
        left: DW - 44 - srcW + Math.round((srcW - sourcePiece.width) / 2),
      },
      {
        input: quotePiece.buffer,
        top: textTop + Math.max(0, Math.round((progY - textTop - px(16) - quotePiece.height) / 2)),
        left: textLeft + Math.round((textW - quotePiece.width) / 2),
      },
      { input: elapsedPiece.buffer, top: progY, left: textLeft },
      {
        input: remainPiece.buffer,
        top: progY,
        left: DW - 44 - remainPiece.width,
      },
    ];
    btnDefs.forEach((b, i) => {
      const lbl = btnLabels[i];
      if (lbl) {
        composites.push({
          input: lbl.buffer,
          top: btnY + Math.round((btnH - lbl.height) / 2),
          left: b.x + Math.round((b.w - lbl.width) / 2),
        });
      }
    });

    design = await sharp({
      create: { width: DW, height: DH, channels: 3, background: bg },
    })
      .composite(composites)
      .png()
      .toBuffer();
  } else {
    // billboard / sign — big centered type on a bright face. Signs are
    // letterboards, so they read in caps with airy line spacing.
    const isSign = surface === "sign";
    const bg = { r: 0xf4, g: 0xf1, b: 0xe9 };
    const text = isSign ? clean.toUpperCase() : clean;
    const quotePiece = await fitQuoteText({
      text,
      font: "Bold",
      color: "#17181A",
      maxW: DW - 160,
      maxH: DH - 140,
      startSize: isSign ? 56 : 64,
      minSize: 26,
      align: "centre",
      lineSpacingFactor: isSign ? 0.8 : 0.45,
    });
    design = await sharp({
      create: { width: DW, height: DH, channels: 3, background: bg },
    })
      .composite([
        {
          input: quotePiece.buffer,
          top: Math.max(40, Math.round((DH - quotePiece.height) / 2)),
          left: Math.round((DW - quotePiece.width) / 2),
        },
      ])
      .png()
      .toBuffer();
  }

  // Downscale onto the detected rect; round the corners for device
  // screens so the photo's own screen corners still peek through as glow.
  const rx =
    surface === "imessage"
      ? Math.round(w * 0.12)
      : surface === "flip" || surface === "car"
        ? Math.round(Math.min(w, h) * 0.05)
        : 0;
  const resized = sharp(design).resize(w, h, { fit: "fill" });
  if (rx > 0) {
    const mask = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="#ffffff"/></svg>`
    );
    return resized
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  }
  return resized.png().toBuffer();
}

/**
 * Full quote-surface pipeline: normalize the AI scene to 1080x1920,
 * find the blank glowing screen, validate its shape for the surface,
 * and composite the deterministic screen content onto it.
 *
 * Returns null when no usable screen is found (caller falls back to
 * the drawn-phone render, then flat).
 */
/**
 * Finish a baked quote slide (2026-09-11): the quote text is generated
 * INTO the image by gpt-image-2, so no compositing is needed — just
 * cover-resize to the slide canvas.
 */
export async function finalizeBakedQuoteSlide(scene: Buffer): Promise<Buffer> {
  return sharp(scene)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function composeQuoteSurfaceSlide(
  quote: string,
  variant: "women" | "men",
  surface: QuoteSurface,
  scene: Buffer
): Promise<{ jpeg: Buffer; rect: BrightRect } | null> {
  const frame = await sharp(scene)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const rect = await detectBrightRect(frame);
  if (!rect) return null;

  const aspect = rect.h / rect.w;
  const bounds = SURFACE_ASPECT[surface];
  if (aspect < bounds.min || aspect > bounds.max) return null;
  // Too small to read at feed size — reject so the scene regenerates.
  if (rect.w < OUTPUT_W * bounds.minWFrac) return null;

  // Slight overscan so threshold fuzz at the screen edge is covered.
  const ox = Math.round(rect.w * 0.02);
  const oy = Math.round(rect.h * 0.02);
  const x = Math.max(0, rect.x - ox);
  const y = Math.max(0, rect.y - oy);
  const w = Math.min(OUTPUT_W - x, rect.w + ox * 2);
  const h = Math.min(OUTPUT_H - y, rect.h + oy * 2);

  // Photographic blending (2026-09-09, per Keenan: "it needs to
  // completely blend in like it's part of the picture"). An opaque
  // paste throws away the natural lighting the AI painted onto the
  // blank panel — flat sterile rectangle, obviously composited. The
  // mockup technique instead: keep the photo's own panel and MULTIPLY
  // our content into it, so its lighting gradients, color cast, glow
  // falloff, and edge shading modulate our render. Plus a touch of
  // blur (vector-crisp type doesn't exist in photos) and gaussian
  // grain matched to photographic noise.
  const region = await sharp(frame)
    .extract({ left: x, top: y, width: w, height: h })
    .toBuffer();
  const overlayRaw = await renderSurfaceOverlay(quote, variant, surface, w, h);
  const overlay = await sharp(overlayRaw).blur(0.6).png().toBuffer();
  const grain = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 6 },
    },
  })
    .png()
    .toBuffer();
  const lit = await sharp(region)
    .composite([
      { input: overlay, blend: "multiply" },
      { input: grain, blend: "soft-light" },
    ])
    .png()
    .toBuffer();

  const jpeg = await sharp(frame)
    .composite([{ input: lit, top: y, left: x }])
    .jpeg({ quality: 90 })
    .toBuffer();
  return { jpeg, rect: { x, y, w, h } };
}

/**
 * Compose a text-free raw image + pre-rendered text overlay into the
 * final static slide JPEG (animated-post pipeline).
 */
export async function composeSlideWithOverlay(
  rawImage: Buffer,
  overlayPng: Buffer
): Promise<Buffer> {
  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([{ input: overlayPng, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Render a story-video caption chunk as a transparent PNG (2026-08-14).
 *
 * The prod ffmpeg-static linux binary ships WITHOUT the drawtext filter
 * (verified by grepping the b6.1.1 release binary — zero hits), so every
 * drawtext-based caption mux threw on Vercel and the silent stitch
 * shipped instead. Captions are now rendered here with the same
 * sharp/Pango pipeline the slides use daily in prod, then composited
 * onto the video with ffmpeg's `overlay` filter (which IS in the binary).
 *
 * Style matches the old drawtext intent: white Poppins Bold 58 with a
 * blurred dark shadow so it reads on any footage.
 */
export async function renderCaptionPng(
  text: string
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const fontPath = await ensureFontFile("Bold");
  const lines = wordWrap(text, 24);
  const maxTextW = OUTPUT_W - PADDING_X * 2;

  const shadowMarkup = buildLinesMarkup(lines, 58, "#111111", "#111111");
  const mainMarkup = buildLinesMarkup(lines, 58, "#FFFFFF", "#FFFFFF");
  const shadow = await renderMarkup(shadowMarkup, fontPath, maxTextW, 10, 10);
  const main = await renderMarkup(mainMarkup, fontPath, maxTextW, 10, 10);
  const blurredShadow = await sharp(shadow.buffer).blur(6).png().toBuffer();

  const width = Math.max(main.width, shadow.width + 4);
  const height = Math.max(main.height, shadow.height + 5);
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: blurredShadow, top: 5, left: 4 },
      { input: main.buffer, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return { buffer, width, height };
}

/**
 * Compose a slide — resize the AI-generated image to 9:16 output.
 *
 * Text is now baked into the AI-generated image by gpt-image-2 (not
 * overlaid separately). This function only handles resize + output.
 */
export async function composeSlide(
  rawImage: Buffer,
  _text: string,
  _kind: "COVER" | "REASON",
  _slideNumber?: number
): Promise<Buffer> {
  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Compose the CTA slide — solid burnt-orange background with:
 *   1. White Ripple lockup (mark + wordmark from ripple-lockup-cream.png)
 *   2. CTA text
 *   3. "Free 7-day trial" subtext
 *
 * The lockup has a cream background with coral mark + dark text.
 * We convert it to white-on-transparent by thresholding brightness.
 */
export async function composeCTASlide(
  ctaText: string,
  bgColor: { r: number; g: number; b: number } = { r: 249, g: 126, b: 78 }
): Promise<Buffer> {
  const SAFE_TOP = 285;
  const SAFE_BOTTOM = 1540;
  const SAFE_H = SAFE_BOTTOM - SAFE_TOP;
  const centerY = SAFE_TOP + SAFE_H / 2;

  const fontBoldPath = await ensureFontFile("Bold");
  const fontMediumPath = await ensureFontFile("Medium");

  const composites: sharp.OverlayOptions[] = [];
  const maxTextW = OUTPUT_W - PADDING_X * 2;
  const LOCKUP_W = 680; // target width for the lockup

  // ── 1. White lockup (mark + wordmark) ────────────────────────────
  let lockupH = 0;
  const lockupCandidates = [
    path.join(process.cwd(), "public", "ripple-lockup-cream.png"),
    path.join(process.cwd(), ".next", "server", "public", "ripple-lockup-cream.png"),
  ];

  let lockupFound = false;
  for (const p of lockupCandidates) {
    if (!fs.existsSync(p)) continue;

    // Load, resize, add alpha, then convert to white-on-transparent
    const resized = await sharp(p)
      .resize(LOCKUP_W, undefined, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const brightness = (r + g + b) / 3;
      if (brightness > 210) {
        // Light pixel (cream background) → transparent
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
      } else {
        // Content pixel (mark + text) → white
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      }
    }

    const whiteLockup = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    const lockupMeta = await sharp(whiteLockup).metadata();
    lockupH = lockupMeta.height ?? 260;
    const lockupActualW = lockupMeta.width ?? LOCKUP_W;

    // Center lockup in the upper portion of safe zone
    const lockupY = Math.round(centerY - lockupH / 2 - 120);
    composites.push({
      input: whiteLockup,
      top: lockupY,
      left: Math.round((OUTPUT_W - lockupActualW) / 2),
    });
    lockupFound = true;
    break;
  }

  // If lockup not found locally, try downloading from CDN
  if (!lockupFound) {
    try {
      const tmpLockup = "/tmp/ripple-lockup-cream.png";
      if (!fs.existsSync(tmpLockup)) {
        const res = await fetch("https://goripple.io/ripple-lockup-cream.png");
        if (res.ok) {
          fs.writeFileSync(tmpLockup, Buffer.from(await res.arrayBuffer()));
        }
      }
      if (fs.existsSync(tmpLockup)) {
        const resized = await sharp(tmpLockup)
          .resize(LOCKUP_W, undefined, { fit: "inside" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const { data, info } = resized;
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness > 210) {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
          } else {
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
          }
        }

        const whiteLockup = await sharp(data, {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
          .png()
          .toBuffer();

        const lockupMeta = await sharp(whiteLockup).metadata();
        lockupH = lockupMeta.height ?? 260;
        const lockupActualW = lockupMeta.width ?? LOCKUP_W;
        const lockupY = Math.round(centerY - lockupH / 2 - 120);
        composites.push({
          input: whiteLockup,
          top: lockupY,
          left: Math.round((OUTPUT_W - lockupActualW) / 2),
        });
      }
    } catch (err) {
      console.warn(`[compose] Lockup download failed: ${err}`);
    }
  }

  // ── 2. CTA text ─────────────────────────────────────────────────
  const ctaLines = wordWrap(ctaText, 28);
  const ctaEscaped = ctaLines.map((l) => escapePango(l)).join("\n");
  const ctaMarkup = `<span font_desc="Poppins Bold 44" foreground="white">${ctaEscaped}</span>`;
  const ctaOpts: Record<string, unknown> = {
    text: ctaMarkup,
    width: maxTextW,
    rgba: true,
    align: "centre",
    spacing: 8,
  };
  if (fontBoldPath) ctaOpts.fontfile = fontBoldPath;
  else ctaOpts.font = "sans-serif";

  const ctaBuffer = await sharp({ text: ctaOpts } as any)
    .png()
    .toBuffer();
  const ctaMeta = await sharp(ctaBuffer).metadata();
  const ctaW = ctaMeta.width ?? 800;
  const ctaH = ctaMeta.height ?? 60;
  const ctaY = Math.round(centerY + 60);
  composites.push({
    input: ctaBuffer,
    top: ctaY,
    left: Math.round((OUTPUT_W - ctaW) / 2),
  });

  // ── 3. Subtext ──────────────────────────────────────────────────
  const subMarkup = `<span font_desc="Poppins Medium 28" foreground="white" alpha="70%">Free 7-day trial on iPhone &amp; Android</span>`;
  const subOpts: Record<string, unknown> = {
    text: subMarkup,
    width: maxTextW,
    rgba: true,
    align: "centre",
  };
  if (fontMediumPath) subOpts.fontfile = fontMediumPath;
  else subOpts.font = "sans-serif";

  const subBuffer = await sharp({ text: subOpts } as any)
    .png()
    .toBuffer();
  const subMeta = await sharp(subBuffer).metadata();
  const subW = subMeta.width ?? 400;
  const subY = ctaY + ctaH + 40;
  composites.push({
    input: subBuffer,
    top: subY,
    left: Math.round((OUTPUT_W - subW) / 2),
  });

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 4,
      background: { r: bgColor.r, g: bgColor.g, b: bgColor.b, alpha: 1 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}
