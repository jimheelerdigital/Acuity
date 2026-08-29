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

const OUTPUT_W = 1080;
const OUTPUT_H = 1920; // 9:16 TikTok native
const BURNT_ORANGE = "#F97E4E";
const PADDING_X = 72; // horizontal padding for text

// ─── Font management ────────────────────────────────────────────────────────

/**
 * Ensure a Poppins font file is available on disk and return its path.
 * Checks local paths first (local dev), then downloads from the CDN
 * and caches in /tmp/ (Lambda). Returns null if all attempts fail.
 */
export async function ensureFontFile(
  variant: "Bold" | "Medium" = "Bold"
): Promise<string | null> {
  const filename = `Poppins-${variant}.ttf`;
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
  padding = 0
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const textOpts: Record<string, unknown> = {
    text: markup,
    width: maxWidth,
    rgba: true,
    align: "centre",
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
 */
export async function renderMoodyTextOverlay(
  paragraphs: string[],
  kind: "COVER" | "ITEM"
): Promise<Buffer> {
  const fontPath = await ensureFontFile(kind === "COVER" ? "Bold" : "Medium");

  const fontSize = kind === "COVER" ? 72 : 42;
  const wrapChars = kind === "COVER" ? 14 : 30;
  const font = kind === "COVER" ? "Poppins Bold" : "Poppins Medium";

  const body = paragraphs
    .map((p) =>
      wordWrap(
        stripUnrenderable(kind === "COVER" ? p.toUpperCase() : p),
        wrapChars
      )
        .map((l) => escapePango(l))
        .join("\n")
    )
    .join("\n\n"); // blank line = paragraph gap (Pango honors empty lines)

  const spacing = kind === "COVER" ? 16 : 14;
  const letterSpacing = kind === "COVER" ? ` letter_spacing="3072"` : "";
  const mainMarkup = `<span font_desc="${font} ${fontSize}" foreground="#FFFFFF"${letterSpacing}>${body}</span>`;
  const shadowMarkup = `<span font_desc="${font} ${fontSize}" foreground="#000000"${letterSpacing}>${body}</span>`;

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
