/**
 * AdLab image sizing + the "app-proof" format (2026-09-24, per Keenan).
 *
 * SIZES. Weekly-batch creatives used to be one 1024×1024 square. Meta wants
 * 4:5 in the feed (more screen, better performance) and 9:16 in Stories/
 * Reels (a square gets letterboxed there). Every AI-generated creative is
 * now rendered once as a 1024×1536 portrait with all text inside a central
 * safe zone, then turned into both placements:
 *   feed  4:5  — detail-aware 1024×1280 crop → 1080×1350, vision-checked;
 *                if text touches an edge, the whole image fitted over a
 *                blurred fill instead
 *   story 9:16 — whole image fitted to the width over a blurred fill
 *                (never side-cropped) → 1080×1920
 * The launch route sends both to Meta with placement asset customization.
 *
 * APP-PROOF. The image model can't draw our real UI, so this format is
 * composed in code: the hook headline + a REAL app screenshot (the Play
 * Store marketing shots, demo data "Jordan" — never a real user's) + a
 * "Start free trial" pill, rendered natively at both sizes. Women → Life
 * Matrix, men → Theme Map. Text via sharp's Pango renderer + Poppins (the
 * same path content-factory/compose.ts uses on Lambda).
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

import { ensureFontFile } from "@/lib/content-factory/compose";
import type { BatchGroupKey } from "@/lib/adlab/weekly-batch";

export const SOURCE_SIZE = "1024x1536" as const;

export const FEED = { w: 1080, h: 1350 };
export const STORY = { w: 1080, h: 1920 };

/**
 * Feed 4:5: a SMART vertical crop of the 2:3 source. Removing 256px of
 * height is unavoidable; instead of trimming 128 top + 128 bottom blindly
 * (which clipped headlines that sat high), pick the offset whose removed
 * rows carry the least detail — text and edges are high-gradient, empty
 * sky / table / backdrop is low. First pass at even crops cut words (09-24).
 */
async function smartFeedCrop(source: Buffer, W: number, H: number): Promise<Buffer> {
  const feedH = Math.min(H, Math.round((W * 5) / 4));
  const spare = H - feedH;
  let top = Math.round(spare / 2);
  if (spare > 0) {
    const { data, info } = await sharp(source).greyscale().raw().toBuffer({ resolveWithObject: true });
    const rowEnergy = new Float64Array(info.height);
    for (let y = 0; y < info.height; y++) {
      let e = 0;
      const row = y * info.width;
      for (let x = 1; x < info.width; x++) e += Math.abs(data[row + x] - data[row + x - 1]);
      if (y > 0) for (let x = 0; x < info.width; x += 2) e += Math.abs(data[row + x] - data[row - info.width + x]);
      rowEnergy[y] = e;
    }
    const prefix = new Float64Array(info.height + 1);
    for (let y = 0; y < info.height; y++) prefix[y + 1] = prefix[y] + rowEnergy[y];
    let best = Infinity;
    for (let t = 0; t <= spare; t += 4) {
      const removed = prefix[t] + (prefix[info.height] - prefix[t + feedH]);
      if (removed < best) {
        best = removed;
        top = t;
      }
    }
  }
  return sharp(source)
    .extract({ left: 0, top, width: W, height: feedH })
    .resize(FEED.w, FEED.h)
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Story 9:16: NO crop. The full 2:3 source is scaled to the story width and
 * centred on a blurred, darkened copy of itself that fills the top and
 * bottom bands — exactly where IG/FB story chrome (profile header, CTA)
 * sits, so every word survives. Side-cropping clipped headlines (09-24).
 */
async function storyFit(source: Buffer): Promise<Buffer> {
  const fg = await sharp(source).resize({ width: STORY.w }).toBuffer();
  const fgH = (await sharp(fg).metadata()).height ?? STORY.h;
  const bg = await sharp(source)
    .resize(STORY.w, STORY.h, { fit: "cover" })
    .blur(40)
    .modulate({ brightness: 0.55 })
    .toBuffer();
  return sharp(bg)
    .composite([{ input: fg, top: Math.max(0, Math.round((STORY.h - fgH) / 2)), left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Feed 4:5 without cropping: the whole 2:3 source scaled to the feed height
 * and centred on a blurred fill (side bands ~8% each). Used when the crop
 * would jam text or the CTA against an edge.
 */
async function feedFit(source: Buffer): Promise<Buffer> {
  const fg = await sharp(source).resize({ height: FEED.h }).toBuffer();
  const fgW = (await sharp(fg).metadata()).width ?? FEED.w;
  const bg = await sharp(source)
    .resize(FEED.w, FEED.h, { fit: "cover" })
    .blur(40)
    .modulate({ brightness: 0.55 })
    .toBuffer();
  return sharp(bg)
    .composite([{ input: fg, top: 0, left: Math.max(0, Math.round((FEED.w - fgW) / 2)) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Vision check on the cropped feed image: is any text/button cut off or
 * jammed against the top or bottom edge? Pixel-energy heuristics couldn't
 * tell headline text from photo texture (calibrated on the 09-24 batch),
 * so one cheap Claude call decides. Any error → treated as NOT clean, so
 * the safe no-crop fit is used.
 */
async function feedCropIsClean(feed: Buffer): Promise<boolean> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();
    const small = await sharp(feed).resize({ width: 540 }).jpeg({ quality: 80 }).toBuffer();
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } },
            {
              type: "text",
              text: 'This is a cropped 4:5 social ad. Is ANY text, letter, button, or logo cut off at the top or bottom edge, or touching it (closer than ~2% of the height)? Reply ONLY JSON: {"clean": true|false}',
            },
          ],
        },
      ],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    return /"clean"\s*:\s*true/.test(text);
  } catch (err) {
    console.warn(`[ad-render] feed crop check failed — using no-crop fit: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Cut a 1024×1536 portrait into the feed (4:5) and story (9:16) renditions. */
export async function cutPlacements(source: Buffer): Promise<{ feed: Buffer; story: Buffer }> {
  const meta = await sharp(source).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1536;
  const [cropped, story] = await Promise.all([smartFeedCrop(source, W, H), storyFit(source)]);
  const feed = (await feedCropIsClean(cropped)) ? cropped : await feedFit(source);
  return { feed, story };
}

/** Prompt clause for the portrait render so both crops keep every word. */
export const SAFE_ZONE_RULES = `CANVAS + SAFE ZONE (critical): vertical 2:3 portrait. This image is later cropped to 4:5 (up to ~17% of the height trimmed from the top and/or bottom). Keep EVERY piece of text, the CTA button and any brand mark inside the central safe area — at least 12% of the height clear of text at the top AND at the bottom, and at least 8% of the width clear at each side. Backgrounds and photography extend to all edges; only text and buttons stay inside.`;

// ─── App-proof format ─────────────────────────────────────────────────────

export const THEME: Record<BatchGroupKey, { bg: string; text: string; sub: string; accent: string; ctaText: string; phone: string }> = {
  women: {
    bg: "#F6EFE6",
    text: "#2B2522",
    sub: "#6B5E57",
    accent: "#C8623C",
    ctaText: "#FFFFFF",
    phone: "phone-life-matrix.png",
  },
  men: {
    bg: "#111111",
    text: "#F5F1EA",
    sub: "#A8A29E",
    accent: "#F2A93B",
    ctaText: "#111111",
    phone: "phone-theme-map.png",
  },
};

/**
 * Theme pool for the code-drawn formats (2026-10-05, per Keenan: "it spits
 * out virtually the same ad look and feel every time ... the more variance
 * the better"). Each ad picks one from its headline, so a re-render keeps
 * the same look; the lane theme above is one of the options. The phone
 * asset stays per lane.
 */
const THEME_POOL: Omit<(typeof THEME)["women"], "phone">[] = [
  { bg: "#F6EFE6", text: "#2B2522", sub: "#6B5E57", accent: "#C8623C", ctaText: "#FFFFFF" },
  { bg: "#111111", text: "#F5F1EA", sub: "#A8A29E", accent: "#F2A93B", ctaText: "#111111" },
  { bg: "#FFFFFF", text: "#111111", sub: "#6B6B6B", accent: "#2F5BFF", ctaText: "#FFFFFF" },
  { bg: "#0E2A47", text: "#FFFFFF", sub: "#A9C1DB", accent: "#FF8A3D", ctaText: "#0E2A47" },
  { bg: "#E9F2EC", text: "#173528", sub: "#4F6B5D", accent: "#1F7A4D", ctaText: "#FFFFFF" },
  { bg: "#FFE14D", text: "#151515", sub: "#4A4A2A", accent: "#151515", ctaText: "#FFE14D" },
  { bg: "#2B1B3D", text: "#F7F0FF", sub: "#B9A6CF", accent: "#FF6FB5", ctaText: "#2B1B3D" },
  { bg: "#FDE8E4", text: "#4A1F1A", sub: "#8C5A52", accent: "#D6453A", ctaText: "#FFFFFF" },
  { bg: "#1D1F1E", text: "#E8FF5A", sub: "#A7B08A", accent: "#E8FF5A", ctaText: "#1D1F1E" },
  { bg: "#EAE6FF", text: "#1E1A3D", sub: "#5D5884", accent: "#5B4BDB", ctaText: "#FFFFFF" },
  { bg: "#F2F2F0", text: "#1A1A1A", sub: "#777777", accent: "#E03A1E", ctaText: "#FFFFFF" },
  { bg: "#123C3A", text: "#F4EFE4", sub: "#9DBAB4", accent: "#F4C95D", ctaText: "#123C3A" },
];

/** Notes-app chrome pool (light and dark) for the text-wall format. */
const NOTES_POOL: { bg: string; text: string; sub: string; chrome: string }[] = [
  { bg: "#FFFFFF", text: "#1C1C1E", sub: "#8E8E93", chrome: "#D9A21B" },
  { bg: "#1C1C1E", text: "#F2F2F7", sub: "#8E8E93", chrome: "#E5A823" },
  { bg: "#FFFBEA", text: "#2A2414", sub: "#8A7F5C", chrome: "#C9A227" },
  { bg: "#F4F7FB", text: "#14202E", sub: "#7A8899", chrome: "#2F6FDB" },
  { bg: "#101418", text: "#E6EDF3", sub: "#7D8590", chrome: "#3FB950" },
];

function seedIndex(seed: string, n: number): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % n;
}

/** True for a dark hex background (relative luminance below ~0.4). */
function isDarkHex(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
}

/**
 * Card surface that keeps the theme's text readable: a slightly lifted dark
 * card on dark themes, white on light ones (2026-10-05: lane-keyed fills made
 * dark-on-dark cards once themes varied per ad).
 */
export function cardFillFor(bg: string): string {
  return isDarkHex(bg) ? "#2A2A2E" : "#FFFFFF";
}

/** The theme for one ad: picked from the pool by its headline, phone asset from the lane. */
export function themeFor(groupKey: BatchGroupKey, seed: string): (typeof THEME)["women"] {
  return { ...THEME_POOL[seedIndex(seed, THEME_POOL.length)], phone: THEME[groupKey].phone };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function textBlock(
  markup: string,
  fontPath: string | null,
  width: number,
  spacing = 8,
  align: "centre" | "left" = "centre"
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const opts: Record<string, unknown> = { text: markup, width, rgba: true, align, spacing };
  if (fontPath) opts.fontfile = fontPath;
  else opts.font = "sans-serif";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await sharp({ text: opts } as any).png().toBuffer();
  const m = await sharp(buffer).metadata();
  return { buffer, width: m.width ?? width, height: m.height ?? 60 };
}

let phoneCache: Record<string, Buffer> = {};
async function phoneAsset(file: string): Promise<Buffer> {
  if (phoneCache[file]) return phoneCache[file];
  // Local dev / bundled public dir first, then the CDN copy (Lambda).
  const local = path.join(process.cwd(), "public", "ad-assets", file);
  if (fs.existsSync(local)) {
    phoneCache = { ...phoneCache, [file]: fs.readFileSync(local) };
    return phoneCache[file];
  }
  const base = process.env.NEXTAUTH_URL || "https://goripple.io";
  const res = await fetch(`${base}/ad-assets/${file}`);
  if (!res.ok) throw new Error(`ad asset ${file}: HTTP ${res.status}`);
  phoneCache = { ...phoneCache, [file]: Buffer.from(await res.arrayBuffer()) };
  return phoneCache[file];
}

/**
 * Render one app-proof creative at a placement size. Layout (top → bottom):
 * headline, one-line value prop, the real phone screenshot, CTA pill.
 * Story keeps the top ~13% and bottom ~18% clear for IG/FB story chrome.
 */
async function renderAppProof(
  groupKey: BatchGroupKey,
  copy: { headline: string; subline: string; ctaLabel: string },
  size: { w: number; h: number },
  story: boolean
): Promise<Buffer> {
  const t = themeFor(groupKey, copy.headline);
  const bold = await ensureFontFile("Bold");
  const medium = await ensureFontFile("Medium");

  const top = story ? 250 : 64;
  const bottom = story ? 340 : 56;
  const textW = size.w - 144;

  const head = await textBlock(
    `<span font_desc="Poppins Bold ${story ? 72 : 62}" foreground="${t.text}">${esc(copy.headline)}</span>`,
    bold,
    textW,
    0
  );
  const sub = await textBlock(
    `<span font_desc="Poppins Medium ${story ? 36 : 32}" foreground="${t.sub}">${esc(copy.subline)}</span>`,
    medium,
    textW
  );
  const ctaLabel = await textBlock(
    `<span font_desc="Poppins Bold ${story ? 40 : 36}" foreground="${t.ctaText}">${esc(copy.ctaLabel)}</span>`,
    bold,
    600
  );
  const pillW = Math.min(size.w - 200, ctaLabel.width + 120);
  const pillH = ctaLabel.height + 44;
  const pill = Buffer.from(
    `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${t.accent}"/></svg>`
  );

  // Phone fills whatever height is left between the copy and the CTA.
  const gap = story ? 40 : 28;
  const subTop = top + head.height + 20;
  const phoneTop = subTop + sub.height + gap;
  const pillTop = size.h - bottom - pillH;
  const phoneH = Math.max(300, pillTop - gap - phoneTop);
  const phoneRaw = await phoneAsset(t.phone);
  const phone = await sharp(phoneRaw).resize({ height: phoneH }).png().toBuffer();
  const phoneW = (await sharp(phone).metadata()).width ?? Math.round(phoneH * 0.476);

  return sharp({
    create: { width: size.w, height: size.h, channels: 3, background: t.bg },
  })
    .composite([
      { input: head.buffer, top, left: Math.round((size.w - head.width) / 2) },
      { input: sub.buffer, top: subTop, left: Math.round((size.w - sub.width) / 2) },
      { input: phone, top: phoneTop, left: Math.round((size.w - phoneW) / 2) },
      { input: pill, top: pillTop, left: Math.round((size.w - pillW) / 2) },
      {
        input: ctaLabel.buffer,
        top: pillTop + Math.round((pillH - ctaLabel.height) / 2),
        left: Math.round((size.w - ctaLabel.width) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderAppProofPlacements(
  groupKey: BatchGroupKey,
  copy: { headline: string; subline: string; ctaLabel: string }
): Promise<{ feed: Buffer; story: Buffer }> {
  const [feed, story] = await Promise.all([
    renderAppProof(groupKey, copy, FEED, false),
    renderAppProof(groupKey, copy, STORY, true),
  ]);
  return { feed, story };
}

// ─── Say-catch format (2026-09-24, per Keenan: ads "aren't really tying in
// the users pains to what our product does and how we solve it") ─────────
//
// Shows the product's mechanism in one glance, drawn in code so every word
// is exact: the pain as the headline, then "You say it:" with a line she'd
// actually say out loud, then "Ripple catches it:" with the tasks / habits /
// patterns Ripple pulls from that line, then the fix in one sentence and the
// CTA. Same palette as app-proof per group.

export interface SayCatchCopy {
  headline: string;
  said: string;
  caught: string[];
  solution: string;
  ctaLabel: string;
}

export function roundedRect(w: number, h: number, r: number, fill: string, opacity = 1): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="${fill}" fill-opacity="${opacity}"/></svg>`
  );
}

async function renderSayCatch(
  groupKey: BatchGroupKey,
  copy: SayCatchCopy,
  size: { w: number; h: number },
  story: boolean
): Promise<Buffer> {
  const t = themeFor(groupKey, copy.headline);
  const bold = await ensureFontFile("Bold");
  const medium = await ensureFontFile("Medium");
  const italic = await ensureFontFile("MediumItalic").catch(() => medium);
  const k = story ? 1.15 : 1.06;
  const top = story ? 250 : 64;
  const bottom = story ? 340 : 56;
  const side = 64;
  const cardW = size.w - side * 2;
  const pad = 36;
  const inner = cardW - pad * 2;

  // Build every block first (relative y), then center the stack between
  // the top margin and the CTA pill so neither size ends up top-heavy.
  const blocks: { input: Buffer; y: number; left: number }[] = [];
  let y = 0;

  const head = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(62 * k)}" foreground="${t.text}">${esc(copy.headline)}</span>`,
    bold, size.w - side * 2, 0
  );
  blocks.push({ input: head.buffer, y, left: Math.round((size.w - head.width) / 2) });
  y += head.height + Math.round(40 * k);

  const label = async (text: string) =>
    textBlock(
      `<span font_desc="Poppins Bold ${Math.round(25 * k)}" foreground="${t.accent}" letter_spacing="2048">${esc(text.toUpperCase())}</span>`,
      bold, inner, 0, "left"
    );

  const l1 = await label("You say it");
  blocks.push({ input: l1.buffer, y, left: side + 4 });
  y += l1.height + 14;
  const quote = await textBlock(
    `<span font_desc="Poppins Medium Italic ${Math.round(35 * k)}" foreground="${t.text}">“${esc(copy.said)}”</span>`,
    italic, inner, 8, "left"
  );
  const qH = quote.height + pad * 2;
  blocks.push({ input: roundedRect(cardW, qH, 28, t.accent, groupKey === "men" ? 0.14 : 0.1), y, left: side });
  blocks.push({ input: quote.buffer, y: y + pad, left: side + pad });
  y += qH + Math.round(34 * k);

  const l2 = await label("Ripple catches it");
  blocks.push({ input: l2.buffer, y, left: side + 4 });
  y += l2.height + 14;
  // Checkmark drawn as a shape — a glyph isn't guaranteed in Poppins and
  // can render as an empty box on the server.
  const icon = Math.round(36 * k);
  const check = Buffer.from(
    `<svg width="${icon}" height="${icon}" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg"><circle cx="17" cy="17" r="17" fill="${t.accent}"/><path d="M9.5 17.5l5 5 10-11" fill="none" stroke="${t.ctaText}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
  const iconGap = 22;
  const rows: { buffer: Buffer; height: number }[] = [];
  for (const item of copy.caught.slice(0, 3)) {
    rows.push(
      await textBlock(
        `<span font_desc="Poppins Medium ${Math.round(34 * k)}" foreground="${t.text}">${esc(item)}</span>`,
        medium, inner - icon - iconGap, 4, "left"
      )
    );
  }
  const rowGap = Math.round(24 * k);
  const listH = rows.reduce((n, r) => n + r.height, 0) + rowGap * (rows.length - 1) + pad * 2;
  const cardFill = cardFillFor(t.bg);
  blocks.push({ input: roundedRect(cardW, listH, 28, cardFill), y, left: side });
  let ry = y + pad;
  for (const r of rows) {
    const firstLine = Math.min(r.height, Math.round(icon * 1.4));
    blocks.push({ input: check, y: ry + Math.max(0, Math.round((firstLine - icon) / 2)), left: side + pad });
    blocks.push({ input: r.buffer, y: ry, left: side + pad + icon + iconGap });
    ry += r.height + rowGap;
  }
  y += listH + Math.round(40 * k);

  const sol = await textBlock(
    `<span font_desc="Poppins Medium ${Math.round(33 * k)}" foreground="${t.sub}">${esc(copy.solution)}</span>`,
    medium, size.w - side * 2, 6
  );
  blocks.push({ input: sol.buffer, y, left: Math.round((size.w - sol.width) / 2) });
  y += sol.height;
  const stackH = y;

  const cta = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(38 * k)}" foreground="${t.ctaText}">${esc(copy.ctaLabel)}</span>`,
    bold, 600, 0
  );
  const pillW = Math.min(size.w - 200, cta.width + 130);
  const pillH = cta.height + 48;
  const pillTop = size.h - bottom - pillH;
  const avail = pillTop - Math.round(36 * k) - top;
  const offset = top + Math.max(0, Math.round((avail - stackH) / 2));

  const composites = blocks.map((b) => ({ input: b.input, top: offset + b.y, left: b.left }));
  composites.push({ input: roundedRect(pillW, pillH, pillH / 2, t.accent), top: pillTop, left: Math.round((size.w - pillW) / 2) });
  composites.push({ input: cta.buffer, top: pillTop + Math.round((pillH - cta.height) / 2), left: Math.round((size.w - cta.width) / 2) });

  return sharp({ create: { width: size.w, height: size.h, channels: 3, background: t.bg } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderSayCatchPlacements(
  groupKey: BatchGroupKey,
  copy: SayCatchCopy
): Promise<{ feed: Buffer; story: Buffer }> {
  const [feed, story] = await Promise.all([
    renderSayCatch(groupKey, copy, FEED, false),
    renderSayCatch(groupKey, copy, STORY, true),
  ]);
  return { feed, story };
}

// ─── Text-wall + weekly-report formats (2026-09-29, per Keenan: "do advanced
// deep research into app conversion and find which ads convert the best and
// rebuild the pipeline around that") ────────────────────────────────────
//
// reports/Subscription app ad creative conversion.md: plain, phone-native
// statics (text walls, notes, infographics) win far more often than polished
// or recognisably-AI imagery (Motion: text-only 11.6% hit rate vs 6.9% for
// high production). Both are drawn in code so every word is exact and
// nothing looks generated.

/** iOS-Notes-style first-person story: title + 4–8 short lines + CTA. */
export interface TextWallCopy {
  headline: string;
  lines: string[];
  ctaLabel: string;
}


async function renderTextWall(
  groupKey: BatchGroupKey,
  copy: TextWallCopy,
  size: { w: number; h: number },
  story: boolean
): Promise<Buffer> {
  const n = NOTES_POOL[seedIndex(copy.headline + "|notes", NOTES_POOL.length)];
  const t = themeFor(groupKey, copy.headline);
  const bold = await ensureFontFile("Bold");
  const medium = await ensureFontFile("Medium");
  const k = story ? 1.12 : 1;
  const top = story ? 250 : 64;
  const bottom = story ? 340 : 56;
  const side = 72;
  const w = size.w - side * 2;

  const blocks: { input: Buffer; y: number; left: number }[] = [];
  let y = 0;
  const chrome = await textBlock(
    `<span font_desc="Poppins Medium ${Math.round(30 * k)}" foreground="${n.chrome}">‹ Notes</span>`,
    medium, w, 0, "left"
  );
  blocks.push({ input: chrome.buffer, y, left: side - 8 });
  y += chrome.height + Math.round(34 * k);
  const title = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(52 * k)}" foreground="${n.text}">${esc(copy.headline)}</span>`,
    bold, w, 0, "left"
  );
  blocks.push({ input: title.buffer, y, left: side });
  y += title.height + Math.round(12 * k);
  const date = await textBlock(
    `<span font_desc="Poppins Medium ${Math.round(24 * k)}" foreground="${n.sub}">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>`,
    medium, w, 0, "left"
  );
  blocks.push({ input: date.buffer, y, left: side });
  y += date.height + Math.round(30 * k);

  // Shrink the body until the stack fits above the CTA.
  const pillReserve = Math.round(150 * k);
  const avail = size.h - top - bottom - pillReserve;
  let fontPx = Math.round(40 * k);
  let paras: { buffer: Buffer; width: number; height: number }[] = [];
  let paraGap = 0;
  for (;;) {
    paras = await Promise.all(copy.lines.map((line) => textBlock(
      `<span font_desc="Poppins Medium ${fontPx}" foreground="${n.text}">${esc(line)}</span>`,
      medium, w, Math.round(fontPx * 0.22), "left"
    )));
    paraGap = Math.round(fontPx * 0.8);
    const bodyH = paras.reduce((sum, p) => sum + p.height, 0) + paraGap * (paras.length - 1);
    if (y + bodyH <= avail || fontPx <= 24) break;
    fontPx -= 2;
  }
  for (const p of paras) {
    blocks.push({ input: p.buffer, y, left: side });
    y += p.height + paraGap;
  }

  const cta = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(36 * k)}" foreground="${t.ctaText}">${esc(copy.ctaLabel)}</span>`,
    bold, 600, 0
  );
  const pillW = Math.min(size.w - 200, cta.width + 130);
  const pillH = cta.height + 46;
  const pillTop = size.h - bottom - pillH;

  const composites = blocks.map((b) => ({ input: b.input, top: top + b.y, left: b.left }));
  composites.push({ input: roundedRect(pillW, pillH, pillH / 2, t.accent), top: pillTop, left: Math.round((size.w - pillW) / 2) });
  composites.push({ input: cta.buffer, top: pillTop + Math.round((pillH - cta.height) / 2), left: Math.round((size.w - cta.width) / 2) });
  return sharp({ create: { width: size.w, height: size.h, channels: 3, background: n.bg } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderTextWallPlacements(
  groupKey: BatchGroupKey,
  copy: TextWallCopy
): Promise<{ feed: Buffer; story: Buffer }> {
  const [feed, story] = await Promise.all([
    renderTextWall(groupKey, copy, FEED, false),
    renderTextWall(groupKey, copy, STORY, true),
  ]);
  return { feed, story };
}

/** Weekly-report infographic: hook, three stat tiles, one insight, CTA. */
export interface WeeklyReportCopy {
  headline: string;
  stats: { value: string; label: string }[];
  insight: string;
  ctaLabel: string;
}

async function renderWeeklyReport(
  groupKey: BatchGroupKey,
  copy: WeeklyReportCopy,
  size: { w: number; h: number },
  story: boolean
): Promise<Buffer> {
  const t = themeFor(groupKey, copy.headline);
  const bold = await ensureFontFile("Bold");
  const medium = await ensureFontFile("Medium");
  const k = story ? 1.32 : 1.15;
  const top = story ? 250 : 64;
  const bottom = story ? 340 : 56;
  const side = 64;
  const cardW = size.w - side * 2;
  const cardFill = cardFillFor(t.bg);

  const blocks: { input: Buffer; y: number; left: number }[] = [];
  let y = 0;
  const kicker = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(25 * k)}" foreground="${t.accent}" letter_spacing="2048">MY WEEK IN RIPPLE</span>`,
    bold, cardW, 0
  );
  blocks.push({ input: kicker.buffer, y, left: Math.round((size.w - kicker.width) / 2) });
  y += kicker.height + Math.round(22 * k);
  const head = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(58 * k)}" foreground="${t.text}">${esc(copy.headline)}</span>`,
    bold, cardW, 0
  );
  blocks.push({ input: head.buffer, y, left: Math.round((size.w - head.width) / 2) });
  y += head.height + Math.round(44 * k);

  // Three stat tiles in a row.
  const gap = 20;
  const tiles = copy.stats.slice(0, 3);
  const tileW = Math.floor((cardW - gap * (tiles.length - 1)) / tiles.length);
  const values = await Promise.all(tiles.map((s) => textBlock(
    `<span font_desc="Poppins Bold ${Math.round(66 * k)}" foreground="${t.accent}">${esc(s.value)}</span>`, bold, tileW - 24, 0)));
  const labels = await Promise.all(tiles.map((s) => textBlock(
    `<span font_desc="Poppins Medium ${Math.round(25 * k)}" foreground="${t.sub}">${esc(s.label)}</span>`, medium, tileW - 32, 2)));
  const tileH = Math.max(...values.map((v) => v.height)) + Math.max(...labels.map((l) => l.height)) + Math.round(64 * k);
  tiles.forEach((_, i) => {
    const left = side + i * (tileW + gap);
    blocks.push({ input: roundedRect(tileW, tileH, 26, cardFill), y, left });
    blocks.push({ input: values[i].buffer, y: y + Math.round(26 * k), left: left + Math.round((tileW - values[i].width) / 2) });
    blocks.push({ input: labels[i].buffer, y: y + Math.round(26 * k) + values[i].height + 8, left: left + Math.round((tileW - labels[i].width) / 2) });
  });
  y += tileH + Math.round(28 * k);

  // Insight callout with an accent bar.
  const pad = 36;
  const label = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(23 * k)}" foreground="${t.accent}" letter_spacing="2048">WHAT RIPPLE NOTICED</span>`,
    bold, cardW - pad * 2, 0, "left"
  );
  const ins = await textBlock(
    `<span font_desc="Poppins Medium ${Math.round(36 * k)}" foreground="${t.text}">${esc(copy.insight)}</span>`,
    medium, cardW - pad * 2 - 10, 8, "left"
  );
  const insH = label.height + 14 + ins.height + pad * 2;
  blocks.push({ input: roundedRect(cardW, insH, 26, cardFill), y, left: side });
  blocks.push({ input: roundedRect(8, insH - 40, 4, t.accent), y: y + 20, left: side + 16 });
  blocks.push({ input: label.buffer, y: y + pad, left: side + pad + 10 });
  blocks.push({ input: ins.buffer, y: y + pad + label.height + 14, left: side + pad + 10 });
  y += insH;
  const stackH = y;

  const cta = await textBlock(
    `<span font_desc="Poppins Bold ${Math.round(38 * k)}" foreground="${t.ctaText}">${esc(copy.ctaLabel)}</span>`,
    bold, 600, 0
  );
  const pillW = Math.min(size.w - 200, cta.width + 130);
  const pillH = cta.height + 48;
  const pillTop = size.h - bottom - pillH;
  const avail = pillTop - Math.round(36 * k) - top;
  const offset = top + Math.max(0, Math.round((avail - stackH) / 2));

  const composites = blocks.map((b) => ({ input: b.input, top: offset + b.y, left: b.left }));
  composites.push({ input: roundedRect(pillW, pillH, pillH / 2, t.accent), top: pillTop, left: Math.round((size.w - pillW) / 2) });
  composites.push({ input: cta.buffer, top: pillTop + Math.round((pillH - cta.height) / 2), left: Math.round((size.w - cta.width) / 2) });
  return sharp({ create: { width: size.w, height: size.h, channels: 3, background: t.bg } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderWeeklyReportPlacements(
  groupKey: BatchGroupKey,
  copy: WeeklyReportCopy
): Promise<{ feed: Buffer; story: Buffer }> {
  const [feed, story] = await Promise.all([
    renderWeeklyReport(groupKey, copy, FEED, false),
    renderWeeklyReport(groupKey, copy, STORY, true),
  ]);
  return { feed, story };
}
