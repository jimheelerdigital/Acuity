/**
 * AdLab image sizing + the "app-proof" format (2026-09-24, per Keenan).
 *
 * SIZES. Weekly-batch creatives used to be one 1024×1024 square. Meta wants
 * 4:5 in the feed (more screen, better performance) and 9:16 in Stories/
 * Reels (a square gets letterboxed there). Every AI-generated creative is
 * now rendered once as a 1024×1536 portrait with all text inside a central
 * safe zone, then cut into both placements:
 *   feed  4:5  — centre 1024×1280 → 1080×1350
 *   story 9:16 — centre 864×1536  → 1080×1920
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

/** Cut a 1024×1536 portrait into the feed (4:5) and story (9:16) renditions. */
export async function cutPlacements(source: Buffer): Promise<{ feed: Buffer; story: Buffer }> {
  const meta = await sharp(source).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1536;
  // 4:5 — full width, trim top/bottom evenly
  const feedH = Math.min(H, Math.round((W * 5) / 4));
  const feed = await sharp(source)
    .extract({ left: 0, top: Math.round((H - feedH) / 2), width: W, height: feedH })
    .resize(FEED.w, FEED.h)
    .jpeg({ quality: 92 })
    .toBuffer();
  // 9:16 — full height, trim sides evenly
  const storyW = Math.min(W, Math.round((H * 9) / 16));
  const story = await sharp(source)
    .extract({ left: Math.round((W - storyW) / 2), top: 0, width: storyW, height: H })
    .resize(STORY.w, STORY.h)
    .jpeg({ quality: 92 })
    .toBuffer();
  return { feed, story };
}

/** Prompt clause for the portrait render so both crops keep every word. */
export const SAFE_ZONE_RULES = `CANVAS + SAFE ZONE (critical): vertical 2:3 portrait. This image is later cropped to 4:5 (top and bottom ~9% cut) and to 9:16 (left and right ~8% cut). Keep EVERY piece of text and the CTA button inside the central safe area — at least 12% of the height clear of text at the top and bottom, and at least 11% of the width clear at the left and right. Backgrounds and photography extend to all edges; only text and buttons stay inside.`;

// ─── App-proof format ─────────────────────────────────────────────────────

const THEME: Record<BatchGroupKey, { bg: string; text: string; sub: string; accent: string; ctaText: string; phone: string }> = {
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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function textBlock(
  markup: string,
  fontPath: string | null,
  width: number,
  spacing = 8
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const opts: Record<string, unknown> = { text: markup, width, rgba: true, align: "centre", spacing };
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
  const t = THEME[groupKey];
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
