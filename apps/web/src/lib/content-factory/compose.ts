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
async function ensureFontFile(
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
 * Render a text block using sharp's Pango text renderer.
 * Returns the rendered PNG buffer and its dimensions.
 */
async function renderText(
  lines: string[],
  fontSize: number,
  color: string,
  fontPath: string | null,
  maxWidth: number,
  lineSpacing: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const escaped = lines.map((l) => escapePango(l)).join("\n");
  const markup = `<span font_desc="Poppins Bold ${fontSize}" foreground="${color}">${escaped}</span>`;

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

  const buffer = await sharp({ text: textOpts } as any)
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? maxWidth,
    height: meta.height ?? fontSize,
  };
}

// ─── Slide compositing ──────────────────────────────────────────────────────

/**
 * Compose text overlay onto a raw generated image.
 *
 * COVER: headline vertically centred in the safe zone.
 * REASON: text anchored to the bottom of the safe zone.
 *
 * Uses sharp's Pango text renderer with fontfile for reliable rendering
 * in serverless environments. Black outline is created by compositing
 * blurred black text behind crisp white text.
 */
export async function composeSlide(
  rawImage: Buffer,
  text: string,
  kind: "COVER" | "REASON",
  slideNumber?: number
): Promise<Buffer> {
  // If no text, return the base image without overlay
  if (!text || text.trim().length === 0) {
    console.warn(`[compose] Empty text for ${kind} slide — skipping overlay`);
    return sharp(rawImage)
      .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  // Prepend slide number for reason slides (e.g. "1. Meditation")
  const displayText =
    kind === "REASON" && slideNumber != null
      ? `${slideNumber}. ${text}`
      : text;

  const isCover = kind === "COVER";
  const fontSize = isCover ? 72 : 52;
  const maxChars = isCover ? 18 : 26;

  let lines = wordWrap(displayText, maxChars);
  let actualFontSize = fontSize;
  if (lines.length > 3) {
    actualFontSize = Math.floor(fontSize * 0.78);
    lines = wordWrap(displayText, Math.floor(maxChars * 1.3));
  }

  // ── Cross-platform safe zone ──────────────────────────────────
  const SAFE_TOP = 285;
  const SAFE_BOTTOM = 1540;
  const SAFE_H = SAFE_BOTTOM - SAFE_TOP;

  const fontPath = await ensureFontFile("Bold");
  const maxWidth = OUTPUT_W - PADDING_X * 2;
  // Generous line spacing for readability
  const extraSpacing = Math.round(actualFontSize * 0.5);
  const strokeBlur = isCover ? 6 : 5;

  // Render text to measure height for positioning
  const black = await renderText(
    lines,
    actualFontSize,
    "black",
    fontPath,
    maxWidth,
    extraSpacing
  );

  const textBlockH = black.height;
  let textY: number;
  if (isCover) {
    textY = Math.round(SAFE_TOP + (SAFE_H - textBlockH) / 2);
  } else {
    textY = Math.round(SAFE_BOTTOM - textBlockH - 80);
  }
  const textLeft = Math.round((OUTPUT_W - black.width) / 2);

  // Create outline by blurring black text and stacking for opacity
  const shadow = await sharp(black.buffer)
    .blur(Math.max(strokeBlur, 0.5))
    .png()
    .toBuffer();

  // Render white text
  const white = await renderText(
    lines,
    actualFontSize,
    "white",
    fontPath,
    maxWidth,
    extraSpacing
  );

  // Composite: base → shadow (x4 for dense outline) → white text
  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([
      { input: shadow, top: textY, left: textLeft },
      { input: shadow, top: textY, left: textLeft },
      { input: shadow, top: textY, left: textLeft },
      { input: shadow, top: textY, left: textLeft },
      { input: white.buffer, top: textY, left: textLeft },
    ])
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
export async function composeCTASlide(ctaText: string): Promise<Buffer> {
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
      background: { r: 249, g: 126, b: 78, alpha: 1 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}
