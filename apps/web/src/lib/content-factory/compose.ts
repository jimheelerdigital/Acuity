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
    const url = `https://getacuity.io/fonts/${filename}`;
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
 * Design (2026-08-11 "eye-popping" pass, requested by Keenan):
 *   - UPPERCASE Poppins Bold, big type, starting 15% from the top
 *     (below TikTok's status bar + search pill)
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
   * COVER only (2026-08-13, per Keenan): a short engagement question
   * ("Which one hits the hardest?") rendered as a smaller line anchored
   * near the bottom of the slide — the ask lives on the cover itself,
   * static AND animated.
   */
  subline?: string
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

  // 15% top buffer (2026-08-12, per Keenan): TikTok's status bar + search
  // pill cover roughly the top 13% of the screen — at the old 10% the
  // first headline line rendered underneath the search bar.
  const topStart = Math.round(OUTPUT_H * 0.15);
  const composites: sharp.OverlayOptions[] = [];
  let cursorY = topStart;

  // REASON: accent circle badge with the slide number, centered above the text.
  if (kind === "REASON" && slideNumber) {
    const D = 118;
    const circle = await circlePng(D, hexToRgb(accent), { ringWidth: 5 });
    const numMarkup = `<span font_desc="Poppins Bold 52" foreground="#FFFFFF">${slideNumber}</span>`;
    const num = await renderMarkup(numMarkup, fontPath, D, 0, 0);

    const badgeShadow = await sharp(
      await circlePng(D, { r: 17, g: 17, b: 17 }, { alpha: 0.65 })
    )
      .blur(6)
      .png()
      .toBuffer();
    const badgeLeft = Math.round((OUTPUT_W - D) / 2);
    composites.push(
      { input: badgeShadow, top: cursorY + 5, left: badgeLeft + 4 },
      { input: circle, top: cursorY, left: badgeLeft },
      {
        input: num.buffer,
        top: Math.round(cursorY + (D - num.height) / 2),
        left: Math.round(badgeLeft + (D - num.width) / 2),
      }
    );
    cursorY += D + 26;
  }

  const textLeft = Math.round((OUTPUT_W - main.width) / 2);
  composites.push(
    { input: blurredShadow, top: cursorY + 5, left: textLeft + 4 },
    { input: main.buffer, top: cursorY, left: textLeft }
  );
  cursorY += main.height;

  // COVER: rounded accent bar under the headline for extra pop.
  if (kind === "COVER") {
    const barW = 180;
    const barH = 14;
    const bar = await capsulePng(barW, barH, hexToRgb(accent));
    const barShadow = await sharp(
      await capsulePng(barW, barH, { r: 17, g: 17, b: 17 }, 0.65)
    )
      .blur(5)
      .png()
      .toBuffer();
    const barLeft = Math.round((OUTPUT_W - barW) / 2);
    composites.push(
      { input: barShadow, top: cursorY + 20, left: barLeft + 3 },
      { input: bar, top: cursorY + 16, left: barLeft }
    );
    cursorY += barH + 16;

    // Engagement sub-line anchored near the BOTTOM of the slide
    // (2026-08-14, per Keenan: cleaner than stacking it under the
    // headline). Bottom edge sits at 86% of the frame so TikTok's
    // caption/music UI (bottom ~12-15%) never covers it.
    if (subline) {
      const subLines = wordWrap(subline.toUpperCase(), 26);
      const subShadowMarkup = buildLinesMarkup(subLines, 38, "#111111", "#111111");
      const subMainMarkup = buildLinesMarkup(subLines, 38, "#FFFFFF", accent);
      const subShadow = await renderMarkup(subShadowMarkup, fontPath, maxTextW, 8, 6);
      const subMain = await renderMarkup(subMainMarkup, fontPath, maxTextW, 8, 6);
      const subBlurred = await sharp(subShadow.buffer).blur(5).png().toBuffer();
      const subLeft = Math.round((OUTPUT_W - subMain.width) / 2);
      const subTop = Math.round(OUTPUT_H * 0.86) - subMain.height;
      composites.push(
        { input: subBlurred, top: subTop + 4, left: subLeft + 3 },
        { input: subMain.buffer, top: subTop, left: subLeft }
      );
    }
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
        const res = await fetch("https://getacuity.io/ripple-lockup-cream.png");
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
