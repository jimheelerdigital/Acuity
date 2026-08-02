/**
 * Content Factory — server-side text compositing with sharp.
 *
 * Overlays slide text onto raw generated images using an SVG text layer.
 * Bundles Poppins Bold + Medium from /public/fonts/ (no system font dependency).
 *
 * Output: 1080x1920 JPEG (9:16, TikTok native), quality 90, < 20MB.
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_W = 1080;
const OUTPUT_H = 1920; // 9:16 TikTok native
const CREAM = "#FBFAF6";
const BURNT_ORANGE = "#F97E4E";
const PADDING_X = 72; // horizontal padding for text
const TEXT_AREA_W = OUTPUT_W - PADDING_X * 2; // usable text width

let _fontBoldB64: string | null = null;
let _fontMediumB64: string | null = null;

function loadFonts() {
  if (_fontBoldB64) return;
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
 *
 * COVER: headline centred in lower 40% with full-height scrim.
 * REASON: text in the bottom quarter with bottom-up scrim.
 *
 * Text has generous padding (72px sides), wide line-height (1.45),
 * and a strong gradient scrim for legibility.
 */
export async function composeSlide(
  rawImage: Buffer,
  text: string,
  kind: "COVER" | "REASON"
): Promise<Buffer> {
  const isCover = kind === "COVER";
  const fontSize = isCover ? 64 : 48;
  const fontWeight = isCover ? 700 : 500;
  // Approximate chars per line at this font size within the padded area
  const maxChars = isCover ? 20 : 26;
  const lineSpacing = fontSize * 1.45;

  let lines = wordWrap(text, maxChars);

  // Auto-shrink if more than 3 lines
  let actualFontSize = fontSize;
  if (lines.length > 3) {
    actualFontSize = Math.floor(fontSize * 0.78);
    lines = wordWrap(text, Math.floor(maxChars * 1.3));
  }
  const actualLineSpacing = actualFontSize * 1.45;

  const textBlockH = lines.length * actualLineSpacing;

  // ── Cross-platform safe zone ──────────────────────────────────
  // Output is 1080x1920 (9:16). Instagram crops to 4:5 (1080x1350)
  // by cutting 285px from top and bottom. TikTok UI covers the
  // bottom ~300px. So the universal safe zone for text is:
  //   Top:    285px  (Instagram crop)
  //   Bottom: 1540px (1920 - 380 = TikTok UI safe)
  // Text must land within y=285..1540 to be visible on both.
  const SAFE_TOP = 285;     // Instagram 4:5 crop line
  const SAFE_BOTTOM = 1540; // TikTok UI safe line (1920 - 380)
  const SAFE_H = SAFE_BOTTOM - SAFE_TOP; // 1255px of usable space

  let textY: number;
  if (isCover) {
    // Centre in the safe zone
    textY = SAFE_TOP + (SAFE_H - textBlockH) / 2;
  } else {
    // Lower portion of safe zone, with 60px breathing room from bottom
    textY = SAFE_BOTTOM - textBlockH - 60;
  }

  const textX = isCover ? OUTPUT_W / 2 : PADDING_X;
  const anchor = isCover ? "middle" : "start";

  // Scrim: covers bottom 60% for cover, bottom 45% for reason
  const scrimPct = isCover ? 0.65 : 0.50;
  const scrimH = Math.round(OUTPUT_H * scrimPct);
  const scrimY = OUTPUT_H - scrimH;

  const svgOverlay = `
    <svg width="${OUTPUT_W}" height="${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${fontFaceDeclarations()}</style>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="30%" stop-color="rgba(0,0,0,0.25)" />
          <stop offset="70%" stop-color="rgba(0,0,0,0.6)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.8)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${scrimY}" width="${OUTPUT_W}" height="${scrimH}" fill="url(#scrim)" />
      ${lines
        .map(
          (line, i) =>
            `<text x="${textX}" y="${textY + i * actualLineSpacing + actualFontSize}"
                   font-family="Poppins, sans-serif" font-weight="${fontWeight}"
                   font-size="${actualFontSize}" fill="${CREAM}"
                   text-anchor="${anchor}"
                   filter="drop-shadow(0 3px 6px rgba(0,0,0,0.6))">${escapeXml(line)}</text>`
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
    logoBuffer = await sharp(logoPath)
      .resize(240, undefined, { fit: "inside" })
      .png()
      .toBuffer();
  }

  const logoDisplayH = 240;
  const centerY = OUTPUT_H / 2;
  const logoY = centerY - logoDisplayH - 30;
  const ctaY = centerY + 80;

  const ctaLines = wordWrap(ctaText, 24);
  const ctaLineH = 48;

  const svgBg = `
    <svg width="${OUTPUT_W}" height="${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${fontFaceDeclarations()}</style>
      </defs>
      <rect width="${OUTPUT_W}" height="${OUTPUT_H}" fill="${BURNT_ORANGE}" />
      ${ctaLines
        .map(
          (line, i) =>
            `<text x="${OUTPUT_W / 2}" y="${ctaY + i * ctaLineH}"
                   font-family="Poppins, sans-serif" font-weight="700" font-size="42"
                   fill="${CREAM}" text-anchor="middle">${escapeXml(line)}</text>`
        )
        .join("\n")}
      <text x="${OUTPUT_W / 2}" y="${ctaY + ctaLines.length * ctaLineH + 50}"
            font-family="Poppins, sans-serif" font-weight="500" font-size="24"
            fill="rgba(251,250,246,0.8)" text-anchor="middle">Free on iPhone &amp; Android</text>
    </svg>
  `;

  const composite: sharp.OverlayOptions[] = [
    { input: Buffer.from(svgBg), top: 0, left: 0 },
  ];

  if (logoBuffer) {
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoW = logoMeta.width ?? 240;
    const logoH = logoMeta.height ?? 240;
    composite.push({
      input: logoBuffer,
      top: Math.round(logoY + (logoDisplayH - logoH) / 2),
      left: Math.round((OUTPUT_W - logoW) / 2),
    });
  }

  return sharp({
    create: {
      width: OUTPUT_W,
      height: OUTPUT_H,
      channels: 3,
      background: { r: 249, g: 126, b: 78 },
    },
  })
    .composite(composite)
    .jpeg({ quality: 90 })
    .toBuffer();
}
