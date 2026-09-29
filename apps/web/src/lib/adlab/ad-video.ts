/**
 * AdLab video ads (2026-09-29, per Keenan: "script out and create 5
 * separate animations that fit the 'show people their own words turned
 * into a to do list and pattern and tracked habits'. this should be video
 * based ads that are part of the ad builder. each segment should get 3
 * videos per weekly generation").
 *
 * Why code-drawn animation, not an AI video model: the whole point of these
 * ads is the viewer READING their own words turning into a list / habit /
 * pattern, and video models can't render exact UI text. The research
 * (reports/Subscription app ad creative conversion.md) also names the
 * "static-to-video hybrid" — an animated demo card — as the cheapest
 * high-hit-rate video format, and Reels-native 9:16 as a ~34% cost win.
 *
 * HOW IT RENDERS. Each template builds a timeline of frames (a list of
 * layers + a hold duration). Only frames that change are drawn — typing,
 * pop-ins and count-ups are short 1/30s frames, holds are one long frame —
 * so a ~15s ad is ~100–200 sharp composites, not 450. The frames go through
 * ffmpeg's concat demuxer with the lane's music library track underneath
 * (same ffmpeg-static binary as the content-factory reels; drawtext isn't
 * in the prod binary, so all text is drawn by sharp/Pango first).
 *
 * CANVAS. 1080×1920 (9:16) for Reels/Stories. Meta shows a 9:16 video in
 * the feed as the centre 4:5, so every piece of content stays inside
 * y 300–1600. The poster frame (feed thumbnail) is cut from the same zone.
 *
 * THE FIVE TEMPLATES
 *  1. voice_to_list  — the spoken sentence types out live in a recording
 *     card → "Ripple caught" items pop in → each box ticks.
 *  2. habit_week     — a Mon–Sun habit row fills day by day with what they
 *     said on the key days → Ripple's flag ("missed 4 days running").
 *  3. pattern_weeks  — four weeks of their own quotes stack up → the phrase
 *     that repeats lights up in every one → "came up 4 weeks in a row".
 *  4. weekly_report  — the week report assembles: stats count up, the mood
 *     line draws across the week, the top theme, what Ripple noticed.
 *  5. invisible_list — everything they said this week piles in with a live
 *     counter → Ripple sorts it into life areas → the one insight.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";

import { ensureFontFile } from "@/lib/content-factory/compose";
import { THEME, esc, roundedRect, textBlock } from "@/lib/adlab/ad-render";
import type { BatchGroupKey } from "@/lib/adlab/weekly-batch";

const W = 1080;
const H = 1920;
const FPS = 30;
const F = 1 / FPS;
/** Everything visible lives inside the feed's centre 4:5 (y 285–1635). */
const ZONE_TOP = 300;
const ZONE_BOTTOM = 1600;
const SIDE = 80;
const INNER = W - SIDE * 2;

export const VIDEO_TEMPLATES = [
  "voice_to_list",
  "habit_week",
  "pattern_weeks",
  "weekly_report",
  "invisible_list",
] as const;
export type VideoTemplate = (typeof VIDEO_TEMPLATES)[number];

/** Copy for one video ad. Common fields + the template's own fields. */
export interface VideoScript {
  template: VideoTemplate;
  /** Opening on-screen line, the thumb-stop (≤50 chars). */
  hook: string;
  /** End-card headline (≤40 chars). */
  endHeadline: string;
  // voice_to_list
  said?: string;
  caught?: string[];
  // habit_week
  habit?: string;
  days?: boolean[];
  quotes?: { day: number; text: string }[];
  flag?: string;
  // pattern_weeks
  weeks?: string[];
  phrase?: string;
  // weekly_report
  stats?: { value: string; label: string }[];
  moods?: number[];
  theme?: string;
  // invisible_list
  items?: { text: string; area: string }[];
  total?: number;
  // shared payoff line (pattern_weeks, weekly_report, invisible_list, habit_week)
  insight?: string;
}

/** Which fields each template needs — the batch drops scripts that fail. */
export function validateVideoScript(s: VideoScript): string | null {
  if (!s.hook || !s.endHeadline) return "missing hook/endHeadline";
  switch (s.template) {
    case "voice_to_list":
      return s.said && (s.caught?.length ?? 0) >= 3 ? null : "needs said + 3 caught";
    case "habit_week":
      return s.habit && s.days?.length === 7 && s.flag ? null : "needs habit, 7 days, flag";
    case "pattern_weeks":
      return (s.weeks?.length ?? 0) >= 3 && s.phrase && s.insight ? null : "needs 3–4 weeks, phrase, insight";
    case "weekly_report":
      return s.stats?.length === 3 && (s.moods?.length ?? 0) >= 5 && s.theme && s.insight ? null : "needs 3 stats, moods, theme, insight";
    case "invisible_list":
      return (s.items?.length ?? 0) >= 6 && s.insight ? null : "needs 6+ items and insight";
    default:
      return "unknown template";
  }
}

// ─── Drawing helpers ──────────────────────────────────────────────────────

type Palette = (typeof THEME)[BatchGroupKey] & { card: string; muted: string };
function palette(groupKey: BatchGroupKey): Palette {
  const t = THEME[groupKey];
  return groupKey === "men"
    ? { ...t, card: "#1C1C1E", muted: "#3A3A3C" }
    : { ...t, card: "#FFFFFF", muted: "#E4DAD0" };
}

interface Layer { input: Buffer; top: number; left: number; fixed?: boolean }
interface Block { buffer: Buffer; width: number; height: number }

type Weight = "Bold" | "Medium" | "MediumItalic";
const fontFiles: Partial<Record<Weight, string | null>> = {};
async function font(weight: Weight): Promise<string | null> {
  if (!(weight in fontFiles)) {
    fontFiles[weight] = await ensureFontFile(weight).catch(() => (weight === "MediumItalic" ? ensureFontFile("Medium") : null));
  }
  return fontFiles[weight] ?? null;
}

const textCache = new Map<string, Block>();
/** One Pango text block; `inner` is already-escaped markup. Cached. */
async function txt(
  inner: string,
  o: { weight: Weight; size: number; color: string; width?: number; align?: "centre" | "left"; spacing?: number; tracking?: boolean }
): Promise<Block> {
  const face = o.weight === "MediumItalic" ? "Poppins Medium Italic" : `Poppins ${o.weight}`;
  const markup = `<span font_desc="${face} ${Math.round(o.size)}" foreground="${o.color}"${o.tracking ? ' letter_spacing="2048"' : ""}>${inner}</span>`;
  const key = `${markup}|${o.width ?? INNER}|${o.align ?? "left"}|${o.spacing ?? 6}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  const b = await textBlock(markup, await font(o.weight), o.width ?? INNER, o.spacing ?? 6, o.align ?? "left");
  textCache.set(key, b);
  return b;
}

/** Multiply a layer's alpha by `o` (0–1). */
async function fade(buf: Buffer, o: number): Promise<Buffer> {
  if (o >= 1) return buf;
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * o)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .png()
    .toBuffer();
}

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

function checkCircle(size: number, fill: string, stroke: string): Buffer {
  return svg(size, size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/><path d="M${size * 0.28} ${size * 0.52}l${size * 0.15} ${size * 0.15} ${size * 0.3}-${size * 0.33}" fill="none" stroke="${stroke}" stroke-width="${size * 0.1}" stroke-linecap="round" stroke-linejoin="round"/>`);
}
function emptyBox(size: number, stroke: string): Buffer {
  return svg(size, size, `<rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="${size * 0.28}" fill="none" stroke="${stroke}" stroke-width="4"/>`);
}
function missedCircle(size: number, stroke: string): Buffer {
  const a = size * 0.34, b = size * 0.66;
  return svg(size, size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="none" stroke="${stroke}" stroke-width="4"/><path d="M${a} ${a}L${b} ${b}M${b} ${a}L${a} ${b}" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>`);
}
function ringCircle(size: number, stroke: string): Buffer {
  return svg(size, size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="none" stroke="${stroke}" stroke-width="4" stroke-dasharray="6 8"/>`);
}
function dot(size: number, fill: string): Buffer {
  return svg(size, size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/>`);
}
function flagIcon(size: number, fill: string): Buffer {
  return svg(size, size, `<path d="M${size * 0.22} ${size * 0.1}V${size * 0.92}" stroke="${fill}" stroke-width="${size * 0.09}" stroke-linecap="round"/><path d="M${size * 0.26} ${size * 0.12}H${size * 0.82}L${size * 0.68} ${size * 0.33}L${size * 0.82} ${size * 0.54}H${size * 0.26}Z" fill="${fill}"/>`);
}
function waveform(w: number, h: number, color: string, seed: number): Buffer {
  const bars = 22;
  const bw = w / bars;
  let body = "";
  for (let i = 0; i < bars; i++) {
    const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + seed * 2.3) * Math.cos(i * 0.6 + seed));
    const bh = Math.max(6, h * v);
    body += `<rect x="${i * bw + bw * 0.25}" y="${(h - bh) / 2}" width="${bw * 0.5}" height="${bh}" rx="${bw * 0.25}" fill="${color}"/>`;
  }
  return svg(w, h, body);
}

// ─── Timeline ─────────────────────────────────────────────────────────────

class Timeline {
  frames: { layers: Layer[]; dur: number }[] = [];
  posterIndex = -1;
  /** Frame index where the main section starts (set by intro). */
  sectionStart = 0;
  onSection?: (start: number, end: number) => Promise<void>;
  hold(layers: Layer[], dur: number) {
    // Snapshot: templates swap a layer's image later (a box ticking, a ring
    // filling) and that must not rewrite frames already recorded.
    this.frames.push({ layers: layers.map((l) => ({ ...l })), dur });
  }
  /** Mark the frame just pushed as the feed thumbnail. */
  poster() {
    this.posterIndex = this.frames.length - 1;
  }
  /** Slide up + fade in over 5 frames, then leave the layer in `base`. */
  async popIn(base: Layer[], add: Layer[]) {
    const steps = [0.2, 0.45, 0.7, 0.9, 1];
    for (const o of steps) {
      const dy = Math.round((1 - o) * 36);
      const faded = await Promise.all(add.map(async (l) => ({ input: await fade(l.input, o), top: l.top + dy, left: l.left })));
      this.hold([...base, ...faded], F);
    }
    base.push(...add);
  }
  /**
   * Centre a finished section vertically. Templates stack content from the
   * top; this measures how far down the section ever reaches and shifts every
   * non-fixed layer of frames [start, end) so the block sits mid-zone
   * instead of leaving the bottom half empty.
   */
  async centre(start: number, end: number) {
    let minTop = Infinity;
    let maxBottom = 0;
    for (const f of this.frames.slice(start, end)) {
      for (const l of f.layers) {
        if (l.fixed) continue;
        minTop = Math.min(minTop, l.top);
        maxBottom = Math.max(maxBottom, l.top + (await layerHeight(l.input)));
      }
    }
    if (!isFinite(minTop)) return;
    const room = ZONE_BOTTOM - 80 - maxBottom;
    const offset = Math.max(0, Math.min(Math.round(room / 2), 320));
    if (!offset) return;
    for (const f of this.frames.slice(start, end)) {
      f.layers = f.layers.map((l) => (l.fixed ? l : { ...l, top: l.top + offset }));
    }
  }
  get duration() {
    return this.frames.reduce((s, f) => s + f.dur, 0);
  }
}

const centred = (b: Block) => Math.round((W - b.width) / 2);

const heights = new WeakMap<Buffer, number>();
async function layerHeight(buf: Buffer): Promise<number> {
  const hit = heights.get(buf);
  if (hit !== undefined) return hit;
  const h = (await sharp(buf).metadata()).height ?? 0;
  heights.set(buf, h);
  return h;
}

/** Hook alone, big and centred — the first ~1.7s thumb-stop. Returns the
 *  small version pinned to the top for the rest of the ad + its height. */
async function intro(tl: Timeline, p: Palette, hook: string): Promise<{ layers: Layer[]; bottom: number }> {
  const big = await txt(esc(hook), { weight: "Bold", size: 88, color: p.text, align: "centre", spacing: 4 });
  const bigLayer = { input: big.buffer, top: Math.round((H - big.height) / 2) - 40, left: centred(big) };
  await tl.popIn([], [bigLayer]);
  tl.hold([bigLayer], 1.6);
  const small = await txt(esc(hook), { weight: "Bold", size: 54, color: p.text, align: "centre", spacing: 2 });
  const brand = await txt("Ripple", { weight: "Bold", size: 30, color: p.sub, align: "centre", width: 400 });
  const layers: Layer[] = [
    { input: small.buffer, top: ZONE_TOP, left: centred(small) },
    { input: brand.buffer, top: ZONE_BOTTOM - brand.height, left: centred(brand), fixed: true },
  ];
  tl.sectionStart = tl.frames.length;
  tl.hold(layers, 0.15);
  return { layers, bottom: ZONE_TOP + small.height + 56 };
}

async function endCard(tl: Timeline, p: Palette, headline: string) {
  await tl.onSection?.(tl.sectionStart, tl.frames.length);
  const head = await txt(esc(headline), { weight: "Bold", size: 80, color: p.text, align: "centre", spacing: 4 });
  const sub = await txt("Ripple · AI habit tracker, voice journal &amp; insights", { weight: "Medium", size: 32, color: p.sub, align: "centre" });
  const cta = await txt("Start free trial", { weight: "Bold", size: 42, color: p.ctaText, align: "centre", width: 600 });
  const pillW = cta.width + 140;
  const pillH = cta.height + 52;
  const headTop = 700;
  const subTop = headTop + head.height + 28;
  const pillTop = subTop + sub.height + 70;
  const base: Layer[] = [];
  await tl.popIn(base, [{ input: head.buffer, top: headTop, left: centred(head) }]);
  await tl.popIn(base, [{ input: sub.buffer, top: subTop, left: centred(sub) }]);
  await tl.popIn(base, [
    { input: roundedRect(pillW, pillH, pillH / 2, p.accent), top: pillTop, left: Math.round((W - pillW) / 2) },
    { input: cta.buffer, top: pillTop + Math.round((pillH - cta.height) / 2), left: centred(cta) },
  ]);
  tl.hold(base, 2.4);
}

/** Card label in small tracked caps. */
const label = (p: Palette, s: string, width = INNER) =>
  txt(esc(s.toUpperCase()), { weight: "Bold", size: 26, color: p.accent, tracking: true, width });

// ─── Template 1: voice → list ─────────────────────────────────────────────

async function tVoiceToList(tl: Timeline, p: Palette, s: VideoScript) {
  const { layers: top, bottom } = await intro(tl, p, s.hook);
  const pad = 40;
  const words = (s.said ?? "").split(/\s+/).filter(Boolean);
  const full = await txt(`“${esc(words.join(" "))}”`, { weight: "MediumItalic", size: 42, color: p.text, width: INNER - pad * 2, spacing: 10 });
  const rec = await txt("RECORDING", { weight: "Bold", size: 24, color: p.accent, tracking: true, width: 400 });
  const cardH = pad + rec.height + 24 + 70 + 24 + full.height + pad;
  const cardTop = bottom;
  const card: Layer = { input: roundedRect(INNER, cardH, 32, p.card), top: cardTop, left: SIDE };
  const recLayer: Layer = { input: rec.buffer, top: cardTop + pad, left: SIDE + pad + 34 };
  const base = [...top];
  await tl.popIn(base, [card, recLayer]);
  const waveTop = cardTop + pad + rec.height + 24;
  const dotLayer = { input: dot(20, "#E5484D"), top: cardTop + pad + Math.round((rec.height - 20) / 2), left: SIDE + pad };
  // Words appear one by one while the waveform moves.
  for (let i = 1; i <= words.length; i++) {
    const cap = await txt(`“${esc(words.slice(0, i).join(" "))}${i === words.length ? "”" : ""}`, { weight: "MediumItalic", size: 42, color: p.text, width: INNER - pad * 2, spacing: 10 });
    const wave = { input: waveform(INNER - pad * 2, 70, p.accent, i), top: waveTop, left: SIDE + pad };
    tl.hold([...base, ...(i % 2 ? [dotLayer] : []), wave, { input: cap.buffer, top: waveTop + 70 + 24, left: SIDE + pad }], 0.17);
  }
  const doneWave = { input: waveform(INNER - pad * 2, 70, p.muted, 0), top: waveTop, left: SIDE + pad };
  base.push(doneWave, { input: full.buffer, top: waveTop + 70 + 24, left: SIDE + pad });
  tl.hold(base, 0.5);

  // Ripple caught…
  let y = cardTop + cardH + 44;
  const lab = await label(p, "Ripple caught");
  await tl.popIn(base, [{ input: lab.buffer, top: y, left: SIDE + 4 }]);
  y += lab.height + 20;
  const icon = 52;
  const icons: Layer[] = [];
  for (const item of (s.caught ?? []).slice(0, 4)) {
    const t = await txt(esc(item), { weight: "Medium", size: 38, color: p.text, width: INNER - pad * 2 - icon - 24 });
    const rowH = Math.max(icon, t.height) + 34;
    const box: Layer = { input: emptyBox(icon, p.sub), top: y + Math.round((rowH - icon) / 2), left: SIDE + pad - 10 };
    icons.push(box);
    await tl.popIn(base, [
      { input: roundedRect(INNER, rowH, 24, p.card), top: y, left: SIDE },
      box,
      { input: t.buffer, top: y + Math.round((rowH - t.height) / 2), left: SIDE + pad - 10 + icon + 24 },
    ]);
    tl.hold(base, 0.35);
    y += rowH + 16;
  }
  // Tick them off.
  for (const box of icons) {
    box.input = checkCircle(icon, p.accent, p.ctaText);
    tl.hold(base, 0.3);
  }
  tl.hold(base, 1.6);
  tl.poster();
  await endCard(tl, p, s.endHeadline);
}

// ─── Template 2: the habit week ───────────────────────────────────────────

async function tHabitWeek(tl: Timeline, p: Palette, s: VideoScript) {
  const { layers: top, bottom } = await intro(tl, p, s.hook);
  const base = [...top];
  const pad = 40;
  const lab = await label(p, `Habit: ${s.habit ?? ""}`, INNER - pad * 2);
  const circle = 92;
  const gap = Math.floor((INNER - pad * 2 - circle * 7) / 6);
  const letters = ["M", "T", "W", "T", "F", "S", "S"];
  const letterBlocks = await Promise.all(letters.map((l) => txt(l, { weight: "Bold", size: 28, color: p.sub, width: circle, align: "centre" })));
  const cardH = pad + lab.height + 30 + circle + 16 + letterBlocks[0].height + pad;
  const cardTop = bottom;
  const rowTop = cardTop + pad + lab.height + 30;
  const cx = (i: number) => SIDE + pad + i * (circle + gap);
  const rings: Layer[] = letters.map((_, i) => ({ input: ringCircle(circle, p.sub), top: rowTop, left: cx(i) }));
  await tl.popIn(base, [
    { input: roundedRect(INNER, cardH, 32, p.card), top: cardTop, left: SIDE },
    { input: lab.buffer, top: cardTop + pad, left: SIDE + pad },
    ...rings,
    ...letterBlocks.map((b, i) => ({ input: b.buffer, top: rowTop + circle + 16, left: cx(i) + Math.round((circle - b.width) / 2) })),
  ]);
  tl.hold(base, 0.4);

  const bubbleTop = cardTop + cardH + 36;
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = (s.days ?? []).slice(0, 7);
  for (let i = 0; i < 7; i++) {
    rings[i].input = days[i] ? checkCircle(circle, p.accent, p.ctaText) : missedCircle(circle, p.sub);
    const q = s.quotes?.find((x) => x.day === i);
    if (q) {
      const qt = await txt(`<b>${dayNames[i]}:</b> “${esc(q.text)}”`, { weight: "MediumItalic", size: 38, color: p.text, width: INNER - pad * 2, spacing: 8 });
      const bh = qt.height + pad * 1.6;
      const bubble: Layer[] = [
        { input: roundedRect(INNER, bh, 28, p.accent, p.bg === THEME.men.bg ? 0.16 : 0.12), top: bubbleTop, left: SIDE },
        { input: qt.buffer, top: bubbleTop + Math.round(pad * 0.8), left: SIDE + pad },
      ];
      await tl.popIn([...base], bubble);
      tl.hold([...base, ...bubble], 1.5);
    } else {
      tl.hold(base, 0.45);
    }
  }
  tl.hold(base, 0.3);

  // Ripple's flag.
  const flagText = await txt(esc(s.flag ?? ""), { weight: "Bold", size: 44, color: p.text, width: INNER - pad * 2 - 80, spacing: 4 });
  const flagLab = await label(p, "Ripple noticed", INNER - pad * 2 - 80);
  const fh = pad * 2 + flagLab.height + 12 + flagText.height;
  const flagCard: Layer[] = [
    { input: roundedRect(INNER, fh, 32, p.card), top: bubbleTop, left: SIDE },
    { input: roundedRect(10, fh - 48, 5, p.accent), top: bubbleTop + 24, left: SIDE + 20 },
    { input: flagIcon(56, p.accent), top: bubbleTop + pad, left: SIDE + pad + 8 },
    { input: flagLab.buffer, top: bubbleTop + pad, left: SIDE + pad + 88 },
    { input: flagText.buffer, top: bubbleTop + pad + flagLab.height + 12, left: SIDE + pad + 88 },
  ];
  await tl.popIn(base, flagCard);
  let y = bubbleTop + fh + 30;
  if (s.insight) {
    const ins = await txt(esc(s.insight), { weight: "Medium", size: 38, color: p.sub, align: "centre", spacing: 6 });
    if (y + ins.height < ZONE_BOTTOM - 60) {
      await tl.popIn(base, [{ input: ins.buffer, top: y, left: centred(ins) }]);
      y += ins.height;
    }
  }
  tl.hold(base, 2);
  tl.poster();
  await endCard(tl, p, s.endHeadline);
}

// ─── Template 3: the same thing, four weeks running ───────────────────────

function highlight(sentence: string, phrase: string, p: Palette): string {
  const i = sentence.toLowerCase().indexOf(phrase.toLowerCase());
  if (!phrase || i < 0) return esc(sentence);
  const a = sentence.slice(0, i), b = sentence.slice(i, i + phrase.length), c = sentence.slice(i + phrase.length);
  return `${esc(a)}<span background="${p.accent}" foreground="${p.ctaText}"> ${esc(b)} </span>${esc(c)}`;
}

async function tPatternWeeks(tl: Timeline, p: Palette, s: VideoScript) {
  const { layers: top, bottom } = await intro(tl, p, s.hook);
  const base = [...top];
  const pad = 34;
  const weeks = (s.weeks ?? []).slice(0, 4);
  let y = bottom;
  const cards: { quoteLayer: Layer; sentence: string }[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const lab = await label(p, `Week ${i + 1}`);
    const q = await txt(`“${esc(weeks[i])}”`, { weight: "MediumItalic", size: 36, color: p.text, width: INNER - pad * 2, spacing: 8 });
    const ch = pad * 2 + lab.height + 10 + q.height;
    const quoteLayer = { input: q.buffer, top: y + pad + lab.height + 10, left: SIDE + pad };
    await tl.popIn(base, [
      { input: roundedRect(INNER, ch, 28, p.card), top: y, left: SIDE },
      { input: lab.buffer, top: y + pad, left: SIDE + pad },
      quoteLayer,
    ]);
    tl.hold(base, 0.7);
    cards.push({ quoteLayer, sentence: weeks[i] });
    y += ch + 18;
  }
  // Light up the repeat in every week.
  for (const c of cards) {
    const hi = await txt(`“${highlight(c.sentence, s.phrase ?? "", p)}”`, { weight: "MediumItalic", size: 36, color: p.text, width: INNER - pad * 2, spacing: 8 });
    const idx = base.indexOf(c.quoteLayer);
    const next = { ...c.quoteLayer, input: hi.buffer };
    if (idx >= 0) base[idx] = next;
    tl.hold(base, 0.4);
  }
  y += 16;
  const lab = await label(p, `Came up ${weeks.length} weeks in a row`);
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 40, color: p.text, width: INNER - pad * 2, spacing: 6 });
  const ih = pad * 2 + lab.height + 12 + ins.height;
  await tl.popIn(base, [
    { input: roundedRect(INNER, ih, 28, p.accent, 0.14), top: y, left: SIDE },
    { input: lab.buffer, top: y + pad, left: SIDE + pad },
    { input: ins.buffer, top: y + pad + lab.height + 12, left: SIDE + pad },
  ]);
  tl.hold(base, 2.2);
  tl.poster();
  await endCard(tl, p, s.endHeadline);
}

// ─── Template 4: the weekly report builds itself ──────────────────────────

async function tWeeklyReport(tl: Timeline, p: Palette, s: VideoScript) {
  const { layers: top, bottom } = await intro(tl, p, s.hook);
  const base = [...top];
  let y = bottom - 10;
  const kicker = await txt("MY WEEK IN RIPPLE", { weight: "Bold", size: 26, color: p.accent, tracking: true, align: "centre" });
  await tl.popIn(base, [{ input: kicker.buffer, top: y, left: centred(kicker) }]);
  y += kicker.height + 22;

  // Stat tiles with count-up.
  const stats = (s.stats ?? []).slice(0, 3);
  const gap = 20;
  const tileW = Math.floor((INNER - gap * 2) / 3);
  const labels = await Promise.all(stats.map((st) => txt(esc(st.label), { weight: "Medium", size: 26, color: p.sub, width: tileW - 30, align: "centre", spacing: 2 })));
  const valueOf = (v: string, frac: number) => {
    const m = v.match(/^(\d+)(.*)$/);
    if (!m) return frac >= 1 ? v : "";
    return `${Math.round(Number(m[1]) * frac)}${frac >= 1 ? m[2] : ""}`;
  };
  const sample = await txt("0", { weight: "Bold", size: 72, color: p.accent, width: tileW - 20, align: "centre" });
  const tileH = sample.height + Math.max(...labels.map((l) => l.height)) + 60;
  const tileLayers: Layer[] = stats.map((_, i) => ({ input: roundedRect(tileW, tileH, 26, p.card), top: y, left: SIDE + i * (tileW + gap) }));
  const labelLayers: Layer[] = labels.map((l, i) => ({ input: l.buffer, top: y + 28 + sample.height + 6, left: SIDE + i * (tileW + gap) + Math.round((tileW - l.width) / 2) }));
  await tl.popIn(base, [...tileLayers, ...labelLayers]);
  const steps = 14;
  let valueLayers: Layer[] = [];
  for (let k = 1; k <= steps; k++) {
    const frac = k / steps;
    valueLayers = await Promise.all(stats.map(async (st, i) => {
      const b = await txt(esc(valueOf(st.value, frac) || " "), { weight: "Bold", size: 72, color: p.accent, width: tileW - 20, align: "centre" });
      return { input: b.buffer, top: y + 28, left: SIDE + i * (tileW + gap) + Math.round((tileW - b.width) / 2) };
    }));
    tl.hold([...base, ...valueLayers], k === steps ? 0.5 : F * 2);
  }
  base.push(...valueLayers);
  y += tileH + 24;

  // Mood line draws across the week.
  const pad = 36;
  const moods = (s.moods ?? []).slice(0, 7).map((m) => Math.min(5, Math.max(1, m)));
  const mlab = await label(p, "Mood this week");
  const chartH = 190;
  const chartW = INNER - pad * 2;
  const cardH = pad * 2 + mlab.height + 16 + chartH;
  const cardTop = y;
  await tl.popIn(base, [
    { input: roundedRect(INNER, cardH, 28, p.card), top: cardTop, left: SIDE },
    { input: mlab.buffer, top: cardTop + pad, left: SIDE + pad },
  ]);
  const chartTop = cardTop + pad + mlab.height + 16;
  const px = (i: number) => 14 + (i * (chartW - 28)) / Math.max(1, moods.length - 1);
  const py = (m: number) => 14 + ((5 - m) / 4) * (chartH - 28);
  for (let n = 1; n <= moods.length; n++) {
    const pts = moods.slice(0, n).map((m, i) => `${px(i)},${py(m)}`).join(" ");
    const dots = moods.slice(0, n).map((m, i) => `<circle cx="${px(i)}" cy="${py(m)}" r="9" fill="${p.accent}"/>`).join("");
    const chart = svg(chartW, chartH, `<polyline points="${pts}" fill="none" stroke="${p.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${dots}`);
    tl.hold([...base, { input: chart, top: chartTop, left: SIDE + pad }], n === moods.length ? 0.4 : 0.14);
    if (n === moods.length) base.push({ input: chart, top: chartTop, left: SIDE + pad });
  }
  y = cardTop + cardH + 24;

  // Top theme + what Ripple noticed.
  const theme = await txt(`Came up most: <b>${esc(s.theme ?? "")}</b>`, { weight: "Medium", size: 36, color: p.text, width: INNER - pad * 2 });
  const th = theme.height + 40;
  await tl.popIn(base, [
    { input: roundedRect(INNER, th, th / 2, p.accent, 0.14), top: y, left: SIDE },
    { input: theme.buffer, top: y + 20, left: SIDE + pad },
  ]);
  y += th + 24;
  const ilab = await label(p, "What Ripple noticed");
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 38, color: p.text, width: INNER - pad * 2, spacing: 6 });
  const ih = pad * 2 + ilab.height + 10 + ins.height;
  if (y + ih <= ZONE_BOTTOM - 50) {
    await tl.popIn(base, [
      { input: roundedRect(INNER, ih, 28, p.card), top: y, left: SIDE },
      { input: ilab.buffer, top: y + pad, left: SIDE + pad },
      { input: ins.buffer, top: y + pad + ilab.height + 10, left: SIDE + pad },
    ]);
  }
  tl.hold(base, 2.2);
  tl.poster();
  await endCard(tl, p, s.endHeadline);
}

// ─── Template 5: the invisible list, counted and sorted ──────────────────

async function tInvisibleList(tl: Timeline, p: Palette, s: VideoScript) {
  const { layers: top, bottom } = await intro(tl, p, s.hook);
  const base = [...top];
  const items = (s.items ?? []).slice(0, 12);
  const total = Math.max(items.length, Math.min(40, s.total ?? items.length));
  let y = bottom;

  const counterFor = async (n: number) => {
    const num = await txt(String(n), { weight: "Bold", size: 120, color: p.accent, align: "centre", width: 400 });
    return num;
  };
  const caption = await txt("things you said this week", { weight: "Medium", size: 34, color: p.sub, align: "centre" });
  const c0 = await counterFor(0);
  const counterTop = y;
  const captionLayer = { input: caption.buffer, top: counterTop + c0.height + 16, left: centred(caption) };
  const listTop = counterTop + c0.height + 16 + caption.height + 34;
  const listBottom = ZONE_BOTTOM - 60;
  const pad = 30;

  // Items pile in; the list scrolls so the newest is always visible.
  const chips: { text: Block; tag: Block }[] = [];
  for (const it of items) {
    chips.push({
      text: await txt(esc(it.text), { weight: "Medium", size: 34, color: p.text, width: INNER - pad * 2 - 220 }),
      tag: await txt(esc(it.area.toUpperCase()), { weight: "Bold", size: 20, color: p.accent, tracking: true, width: 220, align: "left" }),
    });
  }
  const rowH = (c: { text: Block }) => c.text.height + 30;
  const listLayers = (n: number): Layer[] => {
    const shown = chips.slice(0, n);
    let used = 0;
    let start = shown.length;
    while (start > 0 && used + rowH(shown[start - 1]) + 12 <= listBottom - listTop) {
      start--;
      used += rowH(shown[start]) + 12;
    }
    const out: Layer[] = [];
    let ly = listTop;
    for (const c of shown.slice(start)) {
      const h = rowH(c);
      out.push({ input: roundedRect(INNER, h, 20, p.card), top: ly, left: SIDE });
      out.push({ input: c.text.buffer, top: ly + 15, left: SIDE + pad });
      out.push({ input: c.tag.buffer, top: ly + Math.round((h - c.tag.height) / 2), left: W - SIDE - pad - c.tag.width });
      ly += h + 12;
    }
    return out;
  };
  base.push(captionLayer);
  for (let n = 1; n <= chips.length; n++) {
    const cnt = await counterFor(n);
    tl.hold([...base, { input: cnt.buffer, top: counterTop, left: centred(cnt) }, ...listLayers(n)], 0.32);
  }
  for (let n = chips.length + 1; n <= total; n++) {
    const cnt = await counterFor(n);
    tl.hold([...base, { input: cnt.buffer, top: counterTop, left: centred(cnt) }, ...listLayers(chips.length)], F * 3);
  }
  const finalCount = await counterFor(total);
  base.push({ input: finalCount.buffer, top: counterTop, left: centred(finalCount) });
  tl.hold([...base, ...listLayers(chips.length)], 0.8);

  // Ripple sorts it: counts per area, scaled up to the total.
  const byArea = new Map<string, number>();
  for (const it of items) byArea.set(it.area, (byArea.get(it.area) ?? 0) + 1);
  // Scale the sample up to the total with largest-remainder rounding, so
  // the bars always add up to the number on screen.
  const scale = total / items.length;
  const raw = [...byArea.entries()].map(([a, n]) => ({ area: a, exact: n * scale }));
  const areas = raw.map((r) => ({ area: r.area, n: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let short = total - areas.reduce((sum, a) => sum + a.n, 0);
  for (const a of [...areas].sort((x, y) => y.rem - x.rem)) {
    if (short <= 0) break;
    a.n++;
    short--;
  }
  areas.sort((a, b) => b.n - a.n);
  areas.splice(6);
  const max = areas[0]?.n ?? 1;
  const sortLab = await label(p, "Sorted by Ripple");
  y = listTop;
  const sortBase = [...base, { input: sortLab.buffer, top: y, left: SIDE + 4 }];
  y += sortLab.height + 20;
  const barW = INNER - 300;
  const rowsInfo = await Promise.all(areas.map(async (a) => ({
    name: await txt(esc(a.area), { weight: "Bold", size: 32, color: p.text, width: 260 }),
    count: await txt(String(a.n), { weight: "Bold", size: 32, color: p.accent, width: 90, align: "left" }),
    n: a.n,
  })));
  const barSteps = 8;
  for (let k = 1; k <= barSteps; k++) {
    const layers: Layer[] = [];
    let ry = y;
    for (const r of rowsInfo) {
      const w = Math.max(16, Math.round((barW * r.n * k) / (max * barSteps)));
      layers.push({ input: r.name.buffer, top: ry, left: SIDE });
      layers.push({ input: roundedRect(barW, 30, 15, p.muted), top: ry + Math.round((r.name.height - 30) / 2), left: SIDE + 250 });
      layers.push({ input: roundedRect(w, 30, 15, p.accent), top: ry + Math.round((r.name.height - 30) / 2), left: SIDE + 250 });
      if (k === barSteps) layers.push({ input: r.count.buffer, top: ry, left: SIDE + 250 + barW + 16 });
      ry += r.name.height + 26;
    }
    tl.hold([...sortBase, ...layers], k === barSteps ? 0.5 : F * 2);
    if (k === barSteps) {
      sortBase.push(...layers);
      y = ry + 10;
    }
  }
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 40, color: p.text, width: INNER - 60, spacing: 6 });
  const ih = ins.height + 60;
  if (y + ih <= ZONE_BOTTOM - 50) {
    await tl.popIn(sortBase, [
      { input: roundedRect(INNER, ih, 28, p.accent, 0.14), top: y, left: SIDE },
      { input: ins.buffer, top: y + 30, left: SIDE + 30 },
    ]);
  }
  tl.hold(sortBase, 2.2);
  tl.poster();
  await endCard(tl, p, s.endHeadline);
}

// ─── Render + encode ──────────────────────────────────────────────────────

function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export interface RenderedVideoAd {
  mp4: Buffer;
  /** 4:5 1080×1350 thumbnail for the feed (the payoff frame). */
  posterFeed: Buffer;
  /** 9:16 1080×1920 thumbnail. */
  posterStory: Buffer;
  seconds: number;
}

export async function renderVideoAd(
  groupKey: BatchGroupKey,
  script: VideoScript,
  opts?: { musicUrl?: string | null }
): Promise<RenderedVideoAd> {
  const problem = validateVideoScript(script);
  if (problem) throw new Error(`video script invalid (${script.template}): ${problem}`);
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");

  const p = palette(groupKey);
  const tl = new Timeline();
  tl.onSection = (start, end) => tl.centre(start, end);
  switch (script.template) {
    case "voice_to_list": await tVoiceToList(tl, p, script); break;
    case "habit_week": await tHabitWeek(tl, p, script); break;
    case "pattern_weeks": await tPatternWeeks(tl, p, script); break;
    case "weekly_report": await tWeeklyReport(tl, p, script); break;
    case "invisible_list": await tInvisibleList(tl, p, script); break;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adlab-video-"));
  try {
    const bg = await sharp({ create: { width: W, height: H, channels: 3, background: p.bg } }).png().toBuffer();
    const list: string[] = [];
    let posterStory: Buffer | null = null;
    for (let i = 0; i < tl.frames.length; i++) {
      const f = tl.frames[i];
      const jpg = await sharp(bg).composite(f.layers).jpeg({ quality: 90 }).toBuffer();
      const file = path.join(dir, `f${String(i).padStart(4, "0")}.jpg`);
      fs.writeFileSync(file, jpg);
      list.push(`file '${file}'`, `duration ${f.dur.toFixed(4)}`);
      if (i === tl.posterIndex) posterStory = jpg;
    }
    // concat demuxer: the last file must be listed again without a duration.
    list.push(`file '${path.join(dir, `f${String(tl.frames.length - 1).padStart(4, "0")}.jpg`)}'`);
    fs.writeFileSync(path.join(dir, "list.txt"), list.join("\n"));

    const total = tl.duration;
    const args = ["-y", "-loglevel", "warning", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt")];
    let musicPath: string | null = null;
    if (opts?.musicUrl) {
      try {
        const res = await fetch(opts.musicUrl);
        if (res.ok) {
          musicPath = path.join(dir, "music.audio");
          fs.writeFileSync(musicPath, Buffer.from(await res.arrayBuffer()));
        }
      } catch {
        musicPath = null;
      }
    }
    if (musicPath) args.push("-stream_loop", "-1", "-i", musicPath);
    const out = path.join(dir, "out.mp4");
    args.push("-vf", `fps=${FPS},format=yuv420p`);
    if (musicPath) {
      args.push("-af", `volume=0.8,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2`, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "128k");
    }
    args.push(
      "-c:v", "libx264", "-preset", "fast",
      // Fat master (same reasoning as the reels): Meta re-encodes, and a
      // skinny source turns small UI text to mush.
      "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-t", total.toFixed(2),
      out
    );
    let stderr = "";
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args);
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 800)}`))));
    });
    const mp4 = fs.readFileSync(out);
    if (mp4.length < 100_000) throw new Error(`video render suspiciously small (${mp4.length} bytes): ${stderr.slice(0, 400)}`);

    const story = posterStory ?? (await sharp(bg).composite(tl.frames[tl.frames.length - 1].layers).jpeg({ quality: 92 }).toBuffer());
    // Feed thumbnail = the 4:5 window Meta shows in the feed.
    const posterFeed = await sharp(story).extract({ left: 0, top: 285, width: W, height: 1350 }).jpeg({ quality: 92 }).toBuffer();
    console.log(`[adlab-video] ${script.template}: ${tl.frames.length} frames, ${total.toFixed(1)}s, ${mp4.length} bytes, music=${!!musicPath}`);
    return { mp4, posterFeed, posterStory: story, seconds: total };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
