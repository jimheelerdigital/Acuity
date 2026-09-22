/**
 * Compose the branded final CTA slides appended to every slideshow
 * reel (2026-09-22, per Keenan). Two variants, both on AI photo
 * backgrounds ("epic" v3, per Keenan):
 *   - BWK    → cinematic dark-luxury night scene, white lockup,
 *              caps headline, hairline-outline pill
 *   - Ripple → bright airy warm-morning scene with a cream wash,
 *              coral headline, hairline-outline pill
 *
 * Backgrounds are generated once via gpt-image-2 and cached in
 * .tmp/ (delete the cached PNG to re-roll a scene — costs ~25¢).
 * Logo + text are composited deterministically with sharp so the
 * lockup and copy stay pixel-perfect.
 *
 * Outputs 1080x1920 JPEGs to apps/web/public/ (served from the
 * goripple.io CDN, appended to reel imageUrls).
 *
 *   npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/make-cta-slides.ts
 */
import * as fs from "fs";
import * as path from "path";

// Point fontconfig at the repo fonts BEFORE sharp/libvips loads, so
// Pango can resolve "Poppins" (macOS has no default fontconfig file).
const fontDir = path.join(process.cwd(), "apps/web/public/fonts");
fs.writeFileSync(
  "/tmp/cta-fonts.conf",
  `<?xml version="1.0"?><fontconfig><dir>${fontDir}</dir><cachedir>/tmp/cta-fontcache</cachedir></fontconfig>`
);
process.env.FONTCONFIG_FILE = "/tmp/cta-fonts.conf";

import type sharpDefault from "sharp";
import type { OverlayOptions } from "sharp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp") as typeof sharpDefault;

const W = 1080;
const H = 1920;
const CORAL = "#F97E4E";
const PUB = path.join(process.cwd(), "apps/web/public");
const FONTS = path.join(PUB, "fonts");
const TMP = path.join(process.cwd(), ".tmp");

// ─── AI background (cached) ─────────────────────────────────────────────────

async function generateBg(cacheName: string, prompt: string): Promise<Buffer> {
  const cachePath = path.join(TMP, cacheName);
  if (fs.existsSync(cachePath)) {
    console.log(`bg cache hit: ${cacheName}`);
    return fs.readFileSync(cachePath);
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  console.log(`generating bg ${cacheName}…`);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1792",
      quality: "high",
    }),
  });
  if (!res.ok) throw new Error(`image generation HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("image generation returned no image data");
  const buf = Buffer.from(b64, "base64");
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(cachePath, buf);
  return buf;
}

// ─── Logo alpha extraction (lockup PNGs have baked backgrounds) ─────────────

/** White-on-dark lockup → transparent white logo (alpha = luminance). */
async function whiteLogoAlpha(file: string, width: number): Promise<Buffer> {
  const { data, info } = await sharp(path.join(PUB, file))
    .resize({ width })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  // Floor at 48 so the lockup's near-black background (max channel
  // ~31 + noise) maps to fully transparent, not ~12% white.
  for (let p = 0, i = 0; p < data.length; p += 3, i += 4) {
    const lum = Math.max(data[p], data[p + 1], data[p + 2]);
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = Math.min(255, Math.round(Math.max(0, lum - 48) * (255 / 207)));
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Color lockup on a flat bg → transparent logo (alpha = distance from bg). */
async function colorLogoAlpha(
  file: string,
  width: number,
  bgHex: string
): Promise<Buffer> {
  const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
  const { data, info } = await sharp(path.join(PUB, file))
    .resize({ width })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0, i = 0; p < data.length; p += 3, i += 4) {
    const d = Math.max(
      Math.abs(data[p] - bg[0]),
      Math.abs(data[p + 1] - bg[1]),
      Math.abs(data[p + 2] - bg[2])
    );
    out[i] = data[p];
    out[i + 1] = data[p + 1];
    out[i + 2] = data[p + 2];
    out[i + 3] = Math.min(255, d * 3);
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ─── Text + pill ────────────────────────────────────────────────────────────

async function text(
  markup: string,
  font: string,
  fontfile: string,
  width: number
): Promise<Buffer> {
  return sharp({
    text: {
      text: markup,
      font,
      fontfile,
      width,
      align: "centre",
      rgba: true,
      dpi: 72 * 4, // supersample for crispness, resized down later
    },
  })
    .png()
    .toBuffer();
}

/** Luxury pill: hairline outline, transparent fill. */
async function outlinePill(
  width: number,
  height: number,
  stroke: string
): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}"><rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${(height - 3) / 2}" fill="none" stroke="${stroke}" stroke-width="2.5"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Slide ──────────────────────────────────────────────────────────────────

async function makeSlide(opts: {
  bgCache: string;
  bgPrompt: string;
  /** rgba wash over the photo so text always reads */
  wash: { color: string; opacity: number };
  logo: Buffer;
  headline: string;
  headlineColor: string;
  headlineTracking?: number; // Pango letter_spacing units
  subline?: string;
  sublineColor?: string;
  pillText: string;
  pillColor: string;
  out: string;
}) {
  const bold = path.join(FONTS, "Poppins-Bold.ttf");
  const medium = path.join(FONTS, "Poppins-Medium.ttf");

  const bgRaw = await generateBg(opts.bgCache, opts.bgPrompt);
  const bg = await sharp(bgRaw)
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();

  const washSvg = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${opts.wash.color}" fill-opacity="${opts.wash.opacity}"/></svg>`;

  const logoMeta = await sharp(opts.logo).metadata();

  const tracking = opts.headlineTracking
    ? ` letter_spacing="${opts.headlineTracking}"`
    : "";
  const headlineRaw = await text(
    `<span foreground="${opts.headlineColor}"${tracking}>${opts.headline}</span>`,
    "Poppins Bold",
    bold,
    3400
  );
  const headline = await sharp(headlineRaw).resize({ width: 850 }).toBuffer();
  const headlineMeta = await sharp(headline).metadata();

  let subline: Buffer | null = null;
  let sublineMeta: { width?: number; height?: number } = {};
  if (opts.subline) {
    const sublineRaw = await text(
      `<span foreground="${opts.sublineColor ?? opts.headlineColor}">${opts.subline}</span>`,
      "Poppins Medium",
      medium,
      2600
    );
    subline = await sharp(sublineRaw).resize({ width: 780 }).toBuffer();
    sublineMeta = await sharp(subline).metadata();
  }

  const pillTextRaw = await text(
    `<span foreground="${opts.pillColor}" letter_spacing="2048">${opts.pillText}</span>`,
    "Poppins Medium",
    medium,
    3000
  );
  const pillTextImg = await sharp(pillTextRaw).resize({ width: 560 }).toBuffer();
  const pillTextMeta = await sharp(pillTextImg).metadata();
  const pillW = (pillTextMeta.width ?? 560) + 130;
  const pillH = (pillTextMeta.height ?? 40) + 60;
  const pill = await outlinePill(pillW, pillH, opts.pillColor);

  const logoY = subline ? 560 : 640;
  const headlineY = logoY + (logoMeta.height ?? 300) + 110;
  const sublineY = headlineY + (headlineMeta.height ?? 90) + 56;
  const pillY = subline
    ? sublineY + (sublineMeta.height ?? 90) + 90
    : headlineY + (headlineMeta.height ?? 90) + 90;

  const layers: OverlayOptions[] = [
    { input: Buffer.from(washSvg), left: 0, top: 0 },
    {
      input: opts.logo,
      left: Math.round((W - (logoMeta.width ?? 0)) / 2),
      top: logoY,
    },
    {
      input: headline,
      left: Math.round((W - (headlineMeta.width ?? 0)) / 2),
      top: headlineY,
    },
    { input: pill, left: Math.round((W - pillW) / 2), top: pillY },
    {
      input: pillTextImg,
      left: Math.round((W - (pillTextMeta.width ?? 0)) / 2),
      top: pillY + Math.round((pillH - (pillTextMeta.height ?? 0)) / 2),
    },
  ];
  if (subline) {
    layers.push({
      input: subline,
      left: Math.round((W - (sublineMeta.width ?? 0)) / 2),
      top: sublineY,
    });
  }

  await sharp(bg)
    .composite(layers)
    .jpeg({ quality: 92 })
    .toFile(path.join(PUB, opts.out));
  console.log(`wrote ${opts.out}`);
}

async function main() {
  // BWK — cinematic dark-luxury (matches the moody/timeline lane grade)
  await makeSlide({
    bgCache: "cta-bg-bwk.png",
    bgPrompt:
      "Dark, dominant, moody minimalist photography: a luxury city skyline at night seen from a high penthouse terrace, cold glass towers, scattered warm window lights, low clouds. Desaturated, near-monochrome color grade — charcoal, slate, black, night-city light. Deep shadows, austere, powerful, cinematic editorial quality. The entire frame is DIM and shadowed, darkest in the center, so clean white text placed at the center would be perfectly legible. No text, no words, no people. 9:16 vertical.",
    wash: { color: "#0E0D1F", opacity: 0.55 },
    logo: await whiteLogoAlpha("ripple-lockup-dusk.png", 620),
    headline: "YOUR AI LIFE OPTIMIZER.",
    headlineColor: "#FBFAF6",
    headlineTracking: 2048,
    subline: "Tracks your habits. Gives you insights on how to be a better you.",
    sublineColor: "#C6C2D8",
    pillText: "Download in our bio",
    pillColor: "#FBFAF6",
    out: "cta-slide-bwk.jpg",
  });

  // Ripple — bright airy warm morning (matches the light carousel lanes)
  await makeSlide({
    bgCache: "cta-bg-ripple.png",
    bgPrompt:
      "Bright, airy, soft feminine lifestyle photography: warm morning sunlight streaming through sheer linen curtains onto a clean cream-colored kitchen counter, a ceramic mug with gentle steam, soft out-of-focus glow. Cream, ivory and soft peach tones, gentle warm light, calm and unhurried. Plenty of soft, bright negative space in the center of the frame so dark text placed at the center would be perfectly legible. No text, no words, no people. 9:16 vertical.",
    wash: { color: "#FAF4EF", opacity: 0.62 },
    logo: await colorLogoAlpha("ripple-lockup-cream.png", 660, "#FAF4EF"),
    headline: "Take the load off.",
    headlineColor: CORAL,
    subline: "Ripple, your daily life optimizer.",
    sublineColor: "#4A4438",
    pillText: "Download at the link in our bio",
    pillColor: "#E06A3C",
    out: "cta-slide-ripple.jpg",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
