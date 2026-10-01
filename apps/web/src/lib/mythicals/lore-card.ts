import sharp, { type OverlayOptions } from "sharp";

import { ensureFontFile } from "@/lib/content-factory/compose";

/**
 * Lore card for the paid Mythicals portrait (2026-10-01): 1080x1920 JPEG,
 * portrait in the top 62% fading into near-black, then the creature name
 * (gold), epithet, three powers and the backstory. Text is Pango via
 * sharp, like compose.ts (librsvg has no fonts on Lambda).
 */

const W = 1080;
const H = 1920;
const IMG_H = 1240;
const GOLD = "#D9A441";
const BONE = "#EDE6D6";
const DIM = "#A79F8E";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const FAMILY = {
  Bold: "Poppins Bold",
  Medium: "Poppins Medium",
  MediumItalic: "Poppins Medium Italic",
  QuoteSerif: "Playfair Display Medium Italic",
} as const;

async function text(
  markup: string,
  opts: { width: number; font: keyof typeof FAMILY; size: number; spacing?: number; letterSpacing?: number }
): Promise<{ buf: Buffer; w: number; h: number }> {
  const fontfile = await ensureFontFile(opts.font);
  const ls = opts.letterSpacing ? ` letter_spacing="${opts.letterSpacing * 1024}"` : "";
  const o: Record<string, unknown> = {
    text: `<span font_desc="${FAMILY[opts.font]} ${opts.size}"${ls}>${markup}</span>`,
    width: opts.width,
    align: "centre",
    rgba: true,
    wrap: "word",
    spacing: opts.spacing ?? 0,
  };
  if (fontfile) o.fontfile = fontfile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await sharp({ text: o } as any).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, w: meta.width ?? 0, h: meta.height ?? 0 };
}

export interface LoreCardInput {
  heroName: string;
  creatureName: string;
  title: string;
  powers: string[];
  backstory: string;
}

export async function composeLoreCard(portrait: Buffer, lore: LoreCardInput): Promise<Buffer> {
  const img = await sharp(portrait).resize(W, IMG_H, { fit: "cover", position: "attention" }).toBuffer();
  const fade = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#0B0A09" stop-opacity="0"/>` +
      `<stop offset="${(IMG_H - 560) / H}" stop-color="#0B0A09" stop-opacity="0"/>` +
      `<stop offset="${IMG_H / H}" stop-color="#0B0A09" stop-opacity="1"/>` +
      `<stop offset="1" stop-color="#0B0A09" stop-opacity="1"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/></svg>`
  );

  const pad = 80;
  const tw = W - pad * 2;
  const name = await text(`<span foreground="${GOLD}">${esc(lore.creatureName.toUpperCase())}</span>`, {
    width: tw, font: "Bold", size: 76, letterSpacing: 3,
  });
  const title = await text(`<span foreground="${BONE}">${esc(lore.title)}</span>`, {
    width: tw, font: "QuoteSerif", size: 42,
  });
  const powers = await text(
    lore.powers.map((p) => `<span foreground="${GOLD}">◆</span>  <span foreground="${BONE}">${esc(p)}</span>`).join("\n"),
    { width: tw, font: "Medium", size: 33, spacing: 22 }
  );
  const story = await text(`<span foreground="${DIM}">${esc(lore.backstory)}</span>`, {
    width: tw, font: "Medium", size: 28, spacing: 14,
  });
  const foot = await text(
    `<span foreground="${DIM}">BONDED TO ${esc(lore.heroName.toUpperCase())}  ·  LEGENDARY MYTHICALS</span>`,
    { width: tw, font: "Bold", size: 19, letterSpacing: 3 }
  );

  // Text block sits above the footer; it may rise into the faded bottom
  // of the portrait but never past TOP_LIMIT. If it still does not fit,
  // the backstory is dropped (it is also in the delivery email).
  const TOP_LIMIT = IMG_H - 420;
  const FOOT_Y = H - 60 - foot.h;
  let blocks = [[name, 14], [title, 48], [powers, 48], [story, 0]] as const;
  const total = (bs: typeof blocks) => bs.reduce((n, [t, g]) => n + t.h + g, 0);
  if (FOOT_Y - 70 - total(blocks) < TOP_LIMIT) blocks = blocks.slice(0, 3) as unknown as typeof blocks;
  let y = Math.max(TOP_LIMIT, FOOT_Y - 70 - total(blocks));

  const layers: OverlayOptions[] = [{ input: img, top: 0, left: 0 }, { input: fade, top: 0, left: 0 }];
  for (const [t, gap] of blocks) {
    // Pango output is as wide as the text, not `width`, so centre it here.
    layers.push({ input: t.buf, top: Math.round(y), left: Math.round((W - t.w) / 2) });
    y += t.h + gap;
  }
  layers.push({ input: foot.buf, top: FOOT_Y, left: Math.round((W - foot.w) / 2) });

  return sharp({ create: { width: W, height: H, channels: 3, background: "#0B0A09" } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}
