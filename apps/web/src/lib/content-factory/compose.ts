/**
 * Content Factory — server-side text compositing with sharp.
 *
 * Overlays slide text onto raw generated images using an SVG text layer.
 * Bundles Poppins Bold + Medium from /public/fonts/ (no system font dependency).
 *
 * Output: 1080x1350 JPEG, quality 90, < 20MB (TikTok limit).
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_W = 1080;
const OUTPUT_H = 1350;
const CREAM = "#FBFAF6";
const BURNT_ORANGE = "#F97E4E";

// Read the font files once and base64-encode for SVG embedding.
// In serverless (Vercel), process.cwd() points to the app root where
// /public is accessible. We cache the result so it's only read once per
// cold start.
let _fontBoldB64: string | null = null;
let _fontMediumB64: string | null = null;

function loadFonts() {
  if (_fontBoldB64) return;

  // Try multiple paths — local dev vs Vercel build
  const candidates = [
    path.join(process.cwd(), "public", "fonts"),
    path.join(process.cwd(), ".next", "server", "public", "fonts"),
  ];

  let fontsDir = "";
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "Poppins-Bold.ttf"))) {
      fontsDir = dir;
      break;
    }
  }

  if (!fontsDir) {
    console.warn("[compose] Poppins fonts not found — text overlay will use fallback sans-serif");
    _fontBoldB64 = "";
    _fontMediumB64 = "";
    return;
  }

  _fontBoldB64 = fs.readFileSync(path.join(fontsDir, "Poppins-Bold.ttf")).toString("base64");
  _fontMediumB64 = fs.readFileSync(path.join(fontsDir, "Poppins-Medium.ttf")).toString("base64");
}

function fontFaceDeclarations(): string {
  loadFonts();
  if (!_fontBoldB64) return "";
  return `
    @font-face {
      font-family: 'Poppins';
      font-weight: 700;
      src: url(data:font/truetype;base64,${_fontBoldB64}) format('truetype');
    }
    @font-face {
      font-family: 'Poppins';
      font-weight: 500;
      src: url(data:font/truetype;base64,${_fontMediumB64}) format('truetype');
    }
  `;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Word-wrap text to fit within maxWidth at a given font size.
 * Returns an array of lines. Simple greedy algorithm.
 */
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

/**
 * Compose text overlay onto a raw generated image.
 * Layout: text in lower third, max 3 lines, cream-white text,
 * bottom-up dark gradient scrim for legibility.
 */
export async function composeSlide(
  rawImage: Buffer,
  text: string,
  kind: "COVER" | "REASON"
): Promise<Buffer> {
  const isCover = kind === "COVER";
  const fontSize = isCover ? 56 : 44;
  const fontWeight = isCover ? 700 : 500;
  const maxChars = isCover ? 22 : 28;
  const lineHeight = fontSize * 1.25;
  const lines = wordWrap(text, maxChars);

  // Auto-shrink if more than 3 lines
  let actualFontSize = fontSize;
  let actualLines = lines;
  if (lines.length > 3) {
    actualFontSize = Math.floor(fontSize * 0.8);
    actualLines = wordWrap(text, Math.floor(maxChars * 1.3));
  }
  const actualLineHeight = actualFontSize * 1.25;

  // Text block vertical positioning: lower third for REASON, centred for COVER
  const textBlockHeight = actualLines.length * actualLineHeight;
  const textY = isCover
    ? (OUTPUT_H - textBlockHeight) / 2 // centre vertically
    : OUTPUT_H - 120 - textBlockHeight; // lower third, 120px from bottom
  const textAlign = isCover ? "middle" : "start";
  const textX = isCover ? OUTPUT_W / 2 : 60;

  // Gradient scrim: bottom-up dark overlay for text legibility
  const scrimHeight = isCover ? OUTPUT_H : Math.max(400, textBlockHeight + 240);
  const scrimY = OUTPUT_H - scrimHeight;

  const svgOverlay = `
    <svg width="${OUTPUT_W}" height="${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${fontFaceDeclarations()}</style>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="40%" stop-color="rgba(0,0,0,0.3)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.7)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${scrimY}" width="${OUTPUT_W}" height="${scrimHeight}" fill="url(#scrim)" />
      ${actualLines
        .map(
          (line, i) =>
            `<text x="${textX}" y="${textY + i * actualLineHeight + actualFontSize}"
                   font-family="Poppins, sans-serif" font-weight="${fontWeight}"
                   font-size="${actualFontSize}" fill="${CREAM}"
                   text-anchor="${textAlign}"
                   filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">${escapeXml(line)}</text>`
        )
        .join("\n")}
    </svg>
  `;

  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Compose the CTA slide — solid burnt-orange background with the Ripple
 * logo centred and CTA text below. No image generation needed.
 */
export async function composeCTASlide(ctaText: string): Promise<Buffer> {
  const logoPath = path.join(process.cwd(), "public", "ripple-mark-coral-t.png");
  let logoBuffer: Buffer | null = null;
  if (fs.existsSync(logoPath)) {
    // Resize logo to fit nicely — 200px wide, preserve aspect
    logoBuffer = await sharp(logoPath)
      .resize(200, undefined, { fit: "inside" })
      .png()
      .toBuffer();
  }

  const logoHeight = 200;
  const logoY = OUTPUT_H / 2 - logoHeight - 40;
  const subtitleY = OUTPUT_H / 2 + 60;

  const svgBg = `
    <svg width="${OUTPUT_W}" height="${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${fontFaceDeclarations()}</style>
      </defs>
      <rect width="${OUTPUT_W}" height="${OUTPUT_H}" fill="${BURNT_ORANGE}" />
      <text x="${OUTPUT_W / 2}" y="${subtitleY}"
            font-family="Poppins, sans-serif" font-weight="700" font-size="38"
            fill="${CREAM}" text-anchor="middle">${escapeXml(ctaText)}</text>
      <text x="${OUTPUT_W / 2}" y="${subtitleY + 52}"
            font-family="Poppins, sans-serif" font-weight="500" font-size="22"
            fill="rgba(251,250,246,0.8)" text-anchor="middle">Free on iPhone &amp; Android</text>
    </svg>
  `;

  let composite: sharp.OverlayOptions[] = [
    { input: Buffer.from(svgBg), top: 0, left: 0 },
  ];

  if (logoBuffer) {
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoW = logoMeta.width ?? 200;
    const logoH = logoMeta.height ?? 200;
    composite.push({
      input: logoBuffer,
      top: Math.round(logoY + (logoHeight - logoH) / 2),
      left: Math.round((OUTPUT_W - logoW) / 2),
    });
  }

  // Create a blank canvas and composite everything
  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 3,
      background: { r: 249, g: 126, b: 78 }, // BURNT_ORANGE
    },
  })
    .composite(composite)
    .jpeg({ quality: 90 })
    .toBuffer();
}
