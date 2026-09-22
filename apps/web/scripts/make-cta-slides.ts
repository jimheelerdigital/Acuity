/**
 * One-off: compose the branded final CTA slides appended to every
 * slideshow reel (2026-09-22, per Keenan). Two variants:
 *   - BWK    → dark mode (dusk lockup on #0E0D1F)
 *   - Ripple → light orange mode (cream lockup on #FAF4EF, coral accents)
 *
 * Outputs 1080x1920 JPEGs to apps/web/public/ so they're served from
 * the goripple.io CDN and can be appended to reel imageUrls.
 *
 *   npx tsx apps/web/scripts/make-cta-slides.ts
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
      dpi: 72 * 4, // supersample for crispness, resize down later if needed
    },
  })
    .png()
    .toBuffer();
}

async function roundedPill(
  width: number,
  height: number,
  fill: string
): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The lockup PNGs carry compression noise in their flat background,
 * which shows as a faint rectangle when composited. Snap any pixel
 * close to the background color to the exact slide background.
 */
async function cleanLockup(
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
  for (let i = 0; i < data.length; i += 3) {
    const d = Math.max(
      Math.abs(data[i] - bg[0]),
      Math.abs(data[i + 1] - bg[1]),
      Math.abs(data[i + 2] - bg[2])
    );
    if (d < 42) {
      data[i] = bg[0];
      data[i + 1] = bg[1];
      data[i + 2] = bg[2];
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .png()
    .toBuffer();
}

async function makeSlide(opts: {
  bg: string;
  lockup: string;
  lockupWidth: number;
  headline: string;
  headlineColor: string;
  subline?: string;
  sublineColor?: string;
  pillText: string;
  pillFill: string;
  pillTextColor: string;
  out: string;
}) {
  const bold = path.join(FONTS, "Poppins-Bold.ttf");
  const medium = path.join(FONTS, "Poppins-Medium.ttf");

  const lockup = await cleanLockup(opts.lockup, opts.lockupWidth, opts.bg);
  const lockupMeta = await sharp(lockup).metadata();

  // Headline — Poppins Bold, supersampled then sized to target
  const headlineRaw = await text(
    `<span foreground="${opts.headlineColor}">${opts.headline}</span>`,
    "Poppins Bold",
    bold,
    3400
  );
  const headline = await sharp(headlineRaw).resize({ width: 850 }).toBuffer();
  const headlineMeta = await sharp(headline).metadata();

  // Optional subline — Poppins Medium, softer color
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

  // CTA pill
  const pillTextRaw = await text(
    `<span foreground="${opts.pillTextColor}">${opts.pillText}</span>`,
    "Poppins Medium",
    medium,
    3000
  );
  const pillText = await sharp(pillTextRaw).resize({ width: 620 }).toBuffer();
  const pillTextMeta = await sharp(pillText).metadata();
  const pillW = (pillTextMeta.width ?? 620) + 120;
  const pillH = (pillTextMeta.height ?? 40) + 64;
  const pill = await roundedPill(pillW, pillH, opts.pillFill);

  const lockupY = subline ? 560 : 640;
  const headlineY = lockupY + (lockupMeta.height ?? 300) + 110;
  const sublineY = headlineY + (headlineMeta.height ?? 90) + 56;
  const pillY = subline
    ? sublineY + (sublineMeta.height ?? 90) + 90
    : headlineY + (headlineMeta.height ?? 90) + 90;

  const layers: OverlayOptions[] = [
    {
      input: lockup,
      left: Math.round((W - (lockupMeta.width ?? 0)) / 2),
      top: lockupY,
    },
    {
      input: headline,
      left: Math.round((W - (headlineMeta.width ?? 0)) / 2),
      top: headlineY,
    },
    { input: pill, left: Math.round((W - pillW) / 2), top: pillY },
    {
      input: pillText,
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

  await sharp({
    create: { width: W, height: H, channels: 3, background: opts.bg },
  })
    .composite(layers)
    .jpeg({ quality: 92 })
    .toFile(path.join(PUB, opts.out));
  console.log(`wrote ${opts.out}`);
}

async function main() {
  // BWK — dark mode (2026-09-22 copy, per Keenan)
  await makeSlide({
    bg: "#0E0D1F",
    lockup: "ripple-lockup-dusk.png",
    lockupWidth: 620,
    headline: "Your AI life optimizer.",
    headlineColor: "#FBFAF6",
    subline: "Tracks your habits. Gives you insights on how to be a better you.",
    sublineColor: "#B9B5CC",
    pillText: "Download in our bio",
    pillFill: CORAL,
    pillTextColor: "#FFFFFF",
    out: "cta-slide-bwk.jpg",
  });

  // Ripple — light orange mode (2026-09-22 copy, per Keenan)
  await makeSlide({
    bg: "#FAF4EF",
    lockup: "ripple-lockup-cream.png",
    lockupWidth: 660,
    headline: "Take the load off.",
    headlineColor: CORAL,
    subline: "Ripple, your daily life optimizer.",
    sublineColor: "#4A4438",
    pillText: "Download at the link in our bio",
    pillFill: CORAL,
    pillTextColor: "#FFFFFF",
    out: "cta-slide-ripple.jpg",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
