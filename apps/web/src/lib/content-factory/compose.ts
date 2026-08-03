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
  kind: "COVER" | "REASON"
): Promise<Buffer> {
  // If no text, return the base image without overlay
  if (!text || text.trim().length === 0) {
    console.warn(`[compose] Empty text for ${kind} slide — skipping overlay`);
    return sharp(rawImage)
      .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  const isCover = kind === "COVER";
  const fontSize = isCover ? 72 : 54;
  const maxChars = isCover ? 18 : 24;

  let lines = wordWrap(text, maxChars);
  let actualFontSize = fontSize;
  if (lines.length > 3) {
    actualFontSize = Math.floor(fontSize * 0.78);
    lines = wordWrap(text, Math.floor(maxChars * 1.3));
  }
  const actualLineSpacing = actualFontSize * 1.5;
  const textBlockH = lines.length * actualLineSpacing;

  // ── Cross-platform safe zone ──────────────────────────────────
  const SAFE_TOP = 285;
  const SAFE_BOTTOM = 1540;
  const SAFE_H = SAFE_BOTTOM - SAFE_TOP;

  let textY: number;
  if (isCover) {
    textY = Math.round(SAFE_TOP + (SAFE_H - textBlockH) / 2);
  } else {
    textY = Math.round(SAFE_BOTTOM - textBlockH - 60);
  }

  const fontPath = await ensureFontFile("Bold");
  const maxWidth = OUTPUT_W - PADDING_X * 2;
  // Extra spacing beyond Pango's default ~1.2x line height
  const extraSpacing = actualFontSize * 0.3;
  const strokeBlur = isCover ? 5 : 4;

  // 1. Render black text for outline/shadow
  const black = await renderText(
    lines,
    actualFontSize,
    "black",
    fontPath,
    maxWidth,
    extraSpacing
  );
  const textLeft = Math.round((OUTPUT_W - black.width) / 2);

  // Create outline by blurring black text and stacking for opacity
  const shadow = await sharp(black.buffer)
    .blur(Math.max(strokeBlur, 0.5))
    .png()
    .toBuffer();

  // 2. Render white text
  const white = await renderText(
    lines,
    actualFontSize,
    "white",
    fontPath,
    maxWidth,
    extraSpacing
  );

  // Composite: base → shadow (x3 for density) → white text
  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([
      { input: shadow, top: textY, left: textLeft },
      { input: shadow, top: textY, left: textLeft },
      { input: shadow, top: textY, left: textLeft },
      { input: white.buffer, top: textY, left: textLeft },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Compose the CTA slide — solid burnt-orange background with the white
 * Ripple logo large and centred, big CTA text, tagline below.
 */
export async function composeCTASlide(ctaText: string): Promise<Buffer> {
  // Use the white logo on orange background
  const logoPath = path.join(
    process.cwd(),
    "public",
    "ripple-mark-white.png"
  );
  let logoBuffer: Buffer | null = null;
  const LOGO_SIZE = 360;
  if (fs.existsSync(logoPath)) {
    logoBuffer = await sharp(logoPath)
      .resize(LOGO_SIZE, undefined, { fit: "inside" })
      .png()
      .toBuffer();
  }

  // Layout in the cross-platform safe zone (y=285..1540)
  const SAFE_TOP = 285;
  const SAFE_BOTTOM = 1540;
  const SAFE_H = SAFE_BOTTOM - SAFE_TOP;
  const centerY = SAFE_TOP + SAFE_H / 2;
  const logoY = centerY - LOGO_SIZE - 20;

  const fontBoldPath = await ensureFontFile("Bold");
  const fontMediumPath = await ensureFontFile("Medium");

  // Render CTA text
  const ctaLines = wordWrap(ctaText, 20);
  const ctaEscaped = ctaLines.map((l) => escapePango(l)).join("\n");
  const ctaMarkup = `<span font_desc="Poppins Bold 54" foreground="white">${ctaEscaped}</span>`;
  const ctaOpts: Record<string, unknown> = {
    text: ctaMarkup,
    width: OUTPUT_W - PADDING_X * 2,
    rgba: true,
    align: "centre",
    spacing: 10,
  };
  if (fontBoldPath) ctaOpts.fontfile = fontBoldPath;
  else ctaOpts.font = "sans-serif";

  const ctaBuffer = await sharp({ text: ctaOpts } as any)
    .png()
    .toBuffer();
  const ctaMeta = await sharp(ctaBuffer).metadata();
  const ctaW = ctaMeta.width ?? 800;
  const ctaH = ctaMeta.height ?? 100;
  const ctaY = Math.round(centerY + 60);
  const ctaLeft = Math.round((OUTPUT_W - ctaW) / 2);

  // Render subtext
  const subMarkup = `<span font_desc="Poppins Medium 28" foreground="rgba(255,255,255,0.85)">Free on iPhone &amp; Android</span>`;
  const subOpts: Record<string, unknown> = {
    text: subMarkup,
    width: OUTPUT_W - PADDING_X * 2,
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
  const subY = ctaY + ctaH + 50;
  const subLeft = Math.round((OUTPUT_W - subW) / 2);

  const composites: sharp.OverlayOptions[] = [];

  if (logoBuffer) {
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoW = logoMeta.width ?? LOGO_SIZE;
    const logoH = logoMeta.height ?? LOGO_SIZE;
    composites.push({
      input: logoBuffer,
      top: Math.round(logoY + (LOGO_SIZE - logoH) / 2),
      left: Math.round((OUTPUT_W - logoW) / 2),
    });
  }

  composites.push({ input: ctaBuffer, top: ctaY, left: ctaLeft });
  composites.push({ input: subBuffer, top: subY, left: subLeft });

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 3,
      background: { r: 249, g: 126, b: 78 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}
