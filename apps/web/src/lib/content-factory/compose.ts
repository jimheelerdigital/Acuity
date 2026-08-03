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
 * COVER: headline vertically centred in the safe zone.
 * REASON: text anchored to the bottom of the safe zone.
 *
 * Bold white Poppins text with a thick black outline — no background
 * box or scrim. SVG is pre-rendered to PNG before compositing for
 * reliable text rendering in serverless environments.
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
    textY = SAFE_TOP + (SAFE_H - textBlockH) / 2;
  } else {
    textY = SAFE_BOTTOM - textBlockH - 60;
  }

  const textX = OUTPUT_W / 2;

  // Bold white text with thick black outline — pops on any background
  // without covering the image with a scrim or pill.
  // paint-order: stroke renders behind fill so the outline doesn't eat
  // into the letter shapes.
  const strokeW = isCover ? 10 : 8;

  const textElements = lines
    .map((line, i) => {
      const y = textY + i * actualLineSpacing + actualFontSize;
      const escaped = escapeXml(line);
      return `<text x="${textX}" y="${y}"
                   font-family="Poppins, sans-serif" font-weight="700"
                   font-size="${actualFontSize}" fill="white"
                   stroke="black" stroke-width="${strokeW}"
                   stroke-linejoin="round" paint-order="stroke fill"
                   text-anchor="middle">${escaped}</text>`;
    })
    .join("\n");

  const svgOverlay = `<svg width="${OUTPUT_W}" height="${OUTPUT_H}" viewBox="0 0 ${OUTPUT_W} ${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontFaceDeclarations()}</style></defs>
${textElements}
</svg>`;

  // Pre-render SVG text layer to PNG — more reliable than passing raw
  // SVG to composite(), especially when librsvg has limited fonts.
  const textLayer = await sharp(Buffer.from(svgOverlay), { density: 72 })
    .png()
    .toBuffer();

  return sharp(rawImage)
    .resize(OUTPUT_W, OUTPUT_H, { fit: "cover", position: "centre" })
    .composite([{ input: textLayer, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Compose the CTA slide — solid burnt-orange background with the white
 * Ripple logo large and centred, big CTA text, tagline below.
 */
export async function composeCTASlide(ctaText: string): Promise<Buffer> {
  // Use the white logo on orange background
  const logoPath = path.join(process.cwd(), "public", "ripple-mark-white.png");
  let logoBuffer: Buffer | null = null;
  const LOGO_SIZE = 360; // big and prominent
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
  const ctaY = centerY + 60;
  const ctaLines = wordWrap(ctaText, 20);
  const ctaLineH = 64;
  const subY = ctaY + ctaLines.length * ctaLineH + 50;

  const svgBg = `<svg width="${OUTPUT_W}" height="${OUTPUT_H}" viewBox="0 0 ${OUTPUT_W} ${OUTPUT_H}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontFaceDeclarations()}</style></defs>
<rect width="${OUTPUT_W}" height="${OUTPUT_H}" fill="${BURNT_ORANGE}" />
${ctaLines
  .map(
    (line, i) =>
      `<text x="${OUTPUT_W / 2}" y="${ctaY + i * ctaLineH}"
             font-family="Poppins, sans-serif" font-weight="700" font-size="54"
             fill="white" text-anchor="middle">${escapeXml(line)}</text>`
  )
  .join("\n")}
<text x="${OUTPUT_W / 2}" y="${subY}"
      font-family="Poppins, sans-serif" font-weight="500" font-size="28"
      fill="rgba(255,255,255,0.85)" text-anchor="middle">Free on iPhone &amp; Android</text>
</svg>`;

  // Pre-render SVG to PNG for reliable text rendering in serverless
  const svgLayer = await sharp(Buffer.from(svgBg), { density: 72 })
    .png()
    .toBuffer();

  const composite: sharp.OverlayOptions[] = [
    { input: svgLayer, top: 0, left: 0 },
  ];

  if (logoBuffer) {
    const logoMeta = await sharp(logoBuffer).metadata();
    const logoW = logoMeta.width ?? LOGO_SIZE;
    const logoH = logoMeta.height ?? LOGO_SIZE;
    composite.push({
      input: logoBuffer,
      top: Math.round(logoY + (LOGO_SIZE - logoH) / 2),
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
