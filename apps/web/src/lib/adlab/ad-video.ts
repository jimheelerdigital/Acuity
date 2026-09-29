/**
 * AdLab video ads (2026-09-29, per Keenan: "script out and create 5
 * separate animations that fit the 'show people their own words turned
 * into a to do list and pattern and tracked habits'. this should be video
 * based ads that are part of the ad builder. each segment should get 3
 * videos per weekly generation").
 *
 * Why the animation is code-drawn, not an AI video model: the whole point is
 * the viewer READING their own words turning into a list / habit / pattern,
 * and video models can't render exact UI text. The research
 * (reports/Subscription app ad creative conversion.md) names the animated
 * demo card as the cheapest high-hit-rate video format.
 *
 * HIGGSFIELD OPENER (2026-09-29, per Keenan: "we should have an initial hook
 * via higgsfield for the first few seconds followed by the animation"). When
 * an opener clip is passed, the ad opens on ~3s of real-looking footage with
 * the hook as a caption; the footage then fades out while the hook glides up
 * into place and the animation takes over. Without one (Higgsfield failed or
 * slow) the ad opens on the big hook alone — never blocked on Higgsfield.
 *
 * SMOOTH (2026-09-29, per Keenan: "it's extremely granular… we need it to be
 * smooth"). Every animated moment is drawn at a true 30fps with easing —
 * letter-by-letter typing with a cursor, a waveform that keeps moving,
 * eased slide/fade-ins, springy ticks, count-ups, a mood line that draws
 * continuously, a list that scrolls. Holds reuse one encoded frame. Frames
 * stream straight into ffmpeg (image2pipe) at a constant 30fps with the
 * lane's music underneath.
 *
 * CANVAS. 1080×1920 (9:16). Meta shows 9:16 in the feed as the centre 4:5,
 * so every piece of content stays inside y 300–1600.
 *
 * THE FIVE TEMPLATES
 *  1. voice_to_list  — the spoken sentence types out in a recording card →
 *     "Ripple caught" items slide in → each box ticks.
 *  2. habit_week     — a Mon–Sun habit row fills day by day with what they
 *     said on the missed days → Ripple's flag.
 *  3. pattern_weeks  — four weeks of their own quotes stack up → the phrase
 *     that repeats lights up in every one → "came up 4 weeks in a row".
 *  4. weekly_report  — stats count up, the mood line draws across the week,
 *     the top theme, what Ripple noticed.
 *  5. invisible_list — everything they said piles in with a live counter →
 *     Ripple sorts it into life areas → the one insight.
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
/** Everything visible lives inside the feed's centre 4:5 (y 285–1635). */
const ZONE_TOP = 300;
const ZONE_BOTTOM = 1600;
const SIDE = 80;
const INNER = W - SIDE * 2;
/** Seconds of Higgsfield footage before the animation takes over. */
export const OPENER_SECONDS = 3;

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
  /** The real-looking moment the Higgsfield opener shows (no text, no faces). */
  openerScene?: string;
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
  // shared payoff line
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

// ─── Easing ───────────────────────────────────────────────────────────────

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Overshoots slightly, then settles — for ticks and dots. */
const easeBack = (t: number) => {
  t = clamp01(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ─── Drawing helpers ──────────────────────────────────────────────────────

type Palette = (typeof THEME)[BatchGroupKey] & { card: string; muted: string; dark: boolean };
function palette(groupKey: BatchGroupKey): Palette {
  const t = THEME[groupKey];
  return groupKey === "men"
    ? { ...t, card: "#1C1C1E", muted: "#3A3A3C", dark: true }
    : { ...t, card: "#FFFFFF", muted: "#E4DAD0", dark: false };
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
  if (textCache.size > 4000) textCache.clear();
  return b;
}

const sizes = new WeakMap<Buffer, { w: number; h: number }>();
async function dims(buf: Buffer): Promise<{ w: number; h: number }> {
  const hit = sizes.get(buf);
  if (hit) return hit;
  const m = await sharp(buf).metadata();
  const d = { w: m.width ?? 0, h: m.height ?? 0 };
  sizes.set(buf, d);
  return d;
}

/** Multiply a layer's alpha by `o` (0–1). Quantised + cached per buffer. */
const fadeCache = new WeakMap<Buffer, Map<number, Buffer>>();
async function fade(buf: Buffer, o: number): Promise<Buffer> {
  const q = Math.round(clamp01(o) * 20) / 20;
  if (q >= 1) return buf;
  let m = fadeCache.get(buf);
  if (!m) fadeCache.set(buf, (m = new Map()));
  const hit = m.get(q);
  if (hit) return hit;
  const out = await sharp(buf)
    .ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * q)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .png()
    .toBuffer();
  m.set(q, out);
  return out;
}

/** Scale a buffer by `s` (cached, quantised to 2%). */
const scaleCache = new WeakMap<Buffer, Map<number, Buffer>>();
async function scaled(buf: Buffer, s: number): Promise<Buffer> {
  const q = Math.max(0.02, Math.round(s * 50) / 50);
  if (q === 1) return buf;
  let m = scaleCache.get(buf);
  if (!m) scaleCache.set(buf, (m = new Map()));
  const hit = m.get(q);
  if (hit) return hit;
  const d = await dims(buf);
  const out = await sharp(buf).resize(Math.max(1, Math.round(d.w * q)), Math.max(1, Math.round(d.h * q))).png().toBuffer();
  m.set(q, out);
  return out;
}

/** A layer faded in by `o` and slid up from `dy` px below its resting spot. */
async function entering(l: Layer, o: number, dy = 44): Promise<Layer> {
  return { ...l, input: await fade(l.input, o), top: Math.round(l.top + (1 - o) * dy) };
}

/** A layer scaled about its own centre. */
async function scaleAbout(l: Layer, s: number, o = 1): Promise<Layer> {
  const d = await dims(l.input);
  const b = await fade(await scaled(l.input, s), o);
  const nd = await dims(b);
  return { ...l, input: b, top: Math.round(l.top + (d.h - nd.h) / 2), left: Math.round(l.left + (d.w - nd.w) / 2) };
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
/** A live waveform: bar heights move continuously with `phase`. */
function waveform(w: number, h: number, color: string, phase: number, energy = 1): Buffer {
  const bars = 24;
  const bw = w / bars;
  let body = "";
  for (let i = 0; i < bars; i++) {
    const v = 0.18 + 0.82 * energy * Math.abs(Math.sin(i * 0.55 + phase * 1.9) * Math.cos(i * 0.23 - phase * 1.3));
    const bh = Math.max(8, h * v);
    body += `<rect x="${i * bw + bw * 0.25}" y="${(h - bh) / 2}" width="${bw * 0.5}" height="${bh}" rx="${bw * 0.25}" fill="${color}"/>`;
  }
  return svg(w, h, body);
}

// ─── Timeline ─────────────────────────────────────────────────────────────

interface Frame {
  layers: Layer[];
  /** How many 1/30s frames this image is shown for (holds > 1). */
  n: number;
  /** How much of the section centring offset applies (0–1, eased on the
   *  intro→section transition so the hook glides straight to its spot). */
  weight: number;
  /** Full-bleed background frame (Higgsfield opener) drawn under layers. */
  under?: Buffer;
}

class Timeline {
  frames: Frame[] = [];
  posterIndex = -1;
  /** Frame index where the main (centred) section starts. */
  sectionStart = 0;

  push(layers: Layer[], n = 1, weight = 1, under?: Buffer) {
    this.frames.push({ layers: layers.map((l) => ({ ...l })), n: Math.max(1, n), weight, under });
  }
  hold(layers: Layer[], seconds: number) {
    this.push(layers, Math.round(seconds * FPS));
  }
  /** Run `fn(t)` for every frame over `seconds` (t goes 0→1). */
  async anim(seconds: number, fn: (t: number) => Promise<Layer[]> | Layer[]) {
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) this.push(await fn(i / n));
  }
  /** Eased slide-up + fade-in, then the layers join `base`. */
  async popIn(base: Layer[], add: Layer[], seconds = 0.42) {
    await this.anim(seconds, async (t) => [...base, ...(await Promise.all(add.map((l) => entering(l, easeOut(t)))))]);
    base.push(...add);
  }
  poster() {
    this.posterIndex = this.frames.length - 1;
  }
  get seconds() {
    return this.frames.reduce((s, f) => s + f.n, 0) / FPS;
  }
  /**
   * Centre the finished section vertically: measure how far down it reaches
   * and shift every non-fixed layer (by offset × frame weight) so the block
   * sits mid-zone instead of leaving the bottom half empty.
   */
  async centre() {
    let maxBottom = 0;
    for (const f of this.frames.slice(this.sectionStart)) {
      if (f.weight < 1) continue; // the hook's glide passes through mid-screen
      for (const l of f.layers) {
        if (l.fixed) continue;
        maxBottom = Math.max(maxBottom, l.top + (await dims(l.input)).h);
      }
    }
    const offset = Math.max(0, Math.min(Math.round((ZONE_BOTTOM - 80 - maxBottom) / 2), 320));
    if (!offset) return;
    for (const f of this.frames.slice(this.sectionStart)) {
      const dy = Math.round(offset * f.weight);
      if (dy) f.layers = f.layers.map((l) => (l.fixed ? l : { ...l, top: l.top + dy }));
    }
  }
}

const centred = (b: { width: number }) => Math.round((W - b.width) / 2);

// ─── Intro (Higgsfield opener or big hook) → section ─────────────────────

/**
 * Opens the ad and lands the small hook at the top of the section.
 * With `openerFrames`: ~3s of footage with the hook as a white caption, then
 * the footage fades out while the caption glides up and turns into the
 * section's hook. Without: the big hook pops in on the plain background and
 * glides up the same way.
 */
async function intro(
  tl: Timeline,
  p: Palette,
  hook: string,
  openerFrames: Buffer[] | null
): Promise<{ layers: Layer[]; bottom: number }> {
  const bigSize = 84;
  const smallSize = 54;
  const ratio = smallSize / bigSize;
  const bigTheme = await txt(esc(hook), { weight: "Bold", size: bigSize, color: p.text, align: "centre", spacing: 4 });
  const small = await txt(esc(hook), { weight: "Bold", size: smallSize, color: p.text, align: "centre", spacing: 2 });
  const brand = await txt("Ripple", { weight: "Bold", size: 30, color: p.sub, align: "centre", width: 400 });
  const brandLayer: Layer = { input: brand.buffer, top: ZONE_BOTTOM - brand.height, left: centred(brand), fixed: true };
  const smallLayer: Layer = { input: small.buffer, top: ZONE_TOP, left: centred(small) };

  let bigLayer: Layer;
  let caption: Layer[] = [];
  let lastUnder: Buffer | undefined;

  if (openerFrames?.length) {
    // White caption on a soft dark box, lower-middle, like a native caption.
    const white = await txt(esc(hook), { weight: "Bold", size: bigSize, color: "#FFFFFF", align: "centre", spacing: 4 });
    const boxW = Math.min(W - 80, white.width + 90);
    const boxH = white.height + 70;
    const boxTop = Math.round(H * 0.56 - boxH / 2);
    const box: Layer = { input: roundedRect(boxW, boxH, 36, "#000000", 0.5), top: boxTop, left: Math.round((W - boxW) / 2) };
    const cap: Layer = { input: white.buffer, top: boxTop + 35, left: centred(white) };
    caption = [box, cap];
    bigLayer = { input: bigTheme.buffer, top: cap.top, left: centred(bigTheme) };
    for (let i = 0; i < openerFrames.length; i++) {
      const t = i / FPS;
      const o = easeOut((t - 0.25) / 0.45);
      const layers = o > 0 ? await Promise.all(caption.map((l) => entering(l, o, 30))) : [];
      tl.push(layers, 1, 0, openerFrames[i]);
    }
    lastUnder = openerFrames[openerFrames.length - 1];
  } else {
    bigLayer = { input: bigTheme.buffer, top: Math.round((H - bigTheme.height) / 2) - 40, left: centred(bigTheme) };
    await tl.anim(0.45, async (t) => [await entering(bigLayer, easeOut(t))]);
    tl.push([bigLayer], Math.round(1.3 * FPS), 0);
    // Keep the intro frames out of the section's centring.
    tl.frames.forEach((f) => (f.weight = 0));
  }

  // Glide: shrink + move the hook to the top; footage (if any) fades away;
  // the caption box dissolves and the white caption cross-fades to theme ink.
  tl.sectionStart = tl.frames.length;
  const n = Math.round(0.6 * FPS);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = easeInOut(t);
    const s = lerp(1, ratio, e);
    const top = Math.round(lerp(bigLayer.top, ZONE_TOP, e));
    const layers: Layer[] = [];
    if (lastUnder) {
      // Footage fades to the page colour (drawn as a fading full-bleed layer).
      layers.push({ input: await fade(lastUnder, 1 - e), top: 0, left: 0, fixed: true });
      const [box, cap] = caption;
      const bs = await scaled(box.input, s);
      const bd = await dims(bs);
      layers.push({ input: await fade(bs, 1 - e), top: top - 35 * s, left: Math.round((W - bd.w) / 2) });
      const cs = await scaled(cap.input, s);
      const cd = await dims(cs);
      layers.push({ input: await fade(cs, 1 - e), top, left: Math.round((W - cd.w) / 2) });
    }
    const ts = await scaled(bigLayer.input, s);
    const td = await dims(ts);
    layers.push({ input: lastUnder ? await fade(ts, e) : ts, top, left: Math.round((W - td.w) / 2) });
    layers.push({ ...brandLayer, input: await fade(brandLayer.input, e) });
    tl.push(layers.map((l) => ({ ...l, top: Math.round(l.top) })), 1, e);
  }
  const layers = [smallLayer, brandLayer];
  tl.push(layers, 1, 1);
  return { layers, bottom: ZONE_TOP + small.height + 56 };
}

async function endCard(tl: Timeline, p: Palette, headline: string) {
  await tl.centre();
  // Fade the finished scene out.
  const last = tl.frames[tl.frames.length - 1].layers;
  await tl.anim(0.35, (t) => Promise.all(last.map(async (l) => (l.fixed ? l : { ...l, input: await fade(l.input, 1 - easeOut(t)) }))));
  const brand = last.filter((l) => l.fixed);

  const head = await txt(esc(headline), { weight: "Bold", size: 80, color: p.text, align: "centre", spacing: 4 });
  const sub = await txt("Ripple · AI habit tracker, voice journal &amp; insights", { weight: "Medium", size: 32, color: p.sub, align: "centre" });
  const cta = await txt("Start free trial", { weight: "Bold", size: 42, color: p.ctaText, align: "centre", width: 600 });
  const pillW = cta.width + 140;
  const pillH = cta.height + 52;
  const headTop = 700;
  const subTop = headTop + head.height + 28;
  const pillTop = subTop + sub.height + 70;
  const base: Layer[] = [...brand];
  await tl.popIn(base, [{ input: head.buffer, top: headTop, left: centred(head) }], 0.5);
  await tl.popIn(base, [{ input: sub.buffer, top: subTop, left: centred(sub) }], 0.35);
  const pill: Layer = { input: roundedRect(pillW, pillH, pillH / 2, p.accent), top: pillTop, left: Math.round((W - pillW) / 2) };
  const label: Layer = { input: cta.buffer, top: pillTop + Math.round((pillH - cta.height) / 2), left: centred(cta) };
  await tl.anim(0.45, async (t) => [...base, await scaleAbout(pill, lerp(0.6, 1, easeBack(t)), easeOut(t)), await scaleAbout(label, lerp(0.6, 1, easeBack(t)), easeOut(t))]);
  base.push(pill, label);
  // A gentle pulse on the CTA while the card holds.
  await tl.anim(2.2, async (t) => {
    const s = 1 + 0.035 * Math.sin(t * Math.PI * 3);
    return [...base.slice(0, -2), await scaleAbout(pill, s), await scaleAbout(label, s)];
  });
}

const label = (p: Palette, s: string, width = INNER) =>
  txt(esc(s.toUpperCase()), { weight: "Bold", size: 26, color: p.accent, tracking: true, width });

// ─── Template 1: voice → list ─────────────────────────────────────────────

async function tVoiceToList(tl: Timeline, p: Palette, s: VideoScript, top: Layer[], bottom: number) {
  const base = [...top];
  const pad = 40;
  const said = (s.said ?? "").trim();
  const textW = INNER - pad * 2;
  const full = await txt(`“${esc(said)}”`, { weight: "MediumItalic", size: 42, color: p.text, width: textW, spacing: 10 });
  const rec = await txt("RECORDING", { weight: "Bold", size: 24, color: p.accent, tracking: true, width: 400 });
  const cardH = pad + rec.height + 24 + 70 + 24 + full.height + pad;
  const cardTop = bottom;
  const card: Layer = { input: roundedRect(INNER, cardH, 32, p.card), top: cardTop, left: SIDE };
  const recLayer: Layer = { input: rec.buffer, top: cardTop + pad, left: SIDE + pad + 34 };
  const recDot = dot(20, "#E5484D");
  const dotLayer = (o: number): Promise<Layer> =>
    fade(recDot, o).then((b) => ({ input: b, top: cardTop + pad + Math.round((rec.height - 20) / 2), left: SIDE + pad }));
  const waveTop = cardTop + pad + rec.height + 24;
  const capTop = waveTop + 70 + 24;
  await tl.popIn(base, [card, recLayer]);

  // Letter-by-letter typing with a cursor, waveform moving the whole time.
  const cps = Math.max(26, said.length / 5.2);
  const n = Math.round((said.length / cps) * FPS);
  for (let i = 1; i <= n; i++) {
    const shown = said.slice(0, Math.round((i / n) * said.length));
    const cursor = i < n ? `<span foreground="${p.accent}">|</span>` : "”";
    const cap = await txt(`“${esc(shown)}${cursor}`, { weight: "MediumItalic", size: 42, color: p.text, width: textW, spacing: 10 });
    tl.push([
      ...base,
      await dotLayer(0.55 + 0.45 * Math.sin(i / 5)),
      { input: waveform(textW, 70, p.accent, i / 6), top: waveTop, left: SIDE + pad },
      { input: cap.buffer, top: capTop, left: SIDE + pad },
    ]);
  }
  // Recording stops: the waveform calms and greys out.
  const capLayer: Layer = { input: full.buffer, top: capTop, left: SIDE + pad };
  await tl.anim(0.4, async (t) => [
    ...base,
    await dotLayer(1 - t),
    { input: waveform(textW, 70, t < 0.5 ? p.accent : p.muted, n / 6 + t, 1 - 0.7 * t), top: waveTop, left: SIDE + pad },
    capLayer,
  ]);
  base.push({ input: waveform(textW, 70, p.muted, n / 6 + 1, 0.3), top: waveTop, left: SIDE + pad }, capLayer);
  tl.hold(base, 0.35);

  // Ripple caught…
  let y = cardTop + cardH + 44;
  const lab = await label(p, "Ripple caught");
  await tl.popIn(base, [{ input: lab.buffer, top: y, left: SIDE + 4 }], 0.35);
  y += lab.height + 20;
  const icon = 52;
  const boxes: Layer[] = [];
  for (const item of (s.caught ?? []).slice(0, 4)) {
    const t = await txt(esc(item), { weight: "Medium", size: 38, color: p.text, width: INNER - pad * 2 - icon - 24 });
    const rowH = Math.max(icon, t.height) + 34;
    const box: Layer = { input: emptyBox(icon, p.sub), top: y + Math.round((rowH - icon) / 2), left: SIDE + pad - 10 };
    boxes.push(box);
    await tl.popIn(base, [
      { input: roundedRect(INNER, rowH, 24, p.card), top: y, left: SIDE },
      box,
      { input: t.buffer, top: y + Math.round((rowH - t.height) / 2), left: SIDE + pad - 10 + icon + 24 },
    ], 0.38);
    tl.hold(base, 0.12);
    y += rowH + 16;
  }
  // Tick them off, one springy check at a time.
  for (const box of boxes) {
    const check: Layer = { ...box, input: checkCircle(icon, p.accent, p.ctaText) };
    const idx = base.indexOf(box);
    await tl.anim(0.28, async (t) => {
      const layers = [...base];
      layers[idx] = await scaleAbout(check, lerp(0.3, 1, easeBack(t)), easeOut(t * 1.6));
      return layers;
    });
    base[idx] = check;
  }
  tl.hold(base, 1.5);
  tl.poster();
}

// ─── Template 2: the habit week ───────────────────────────────────────────

async function tHabitWeek(tl: Timeline, p: Palette, s: VideoScript, top: Layer[], bottom: number) {
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
  ], 0.5);
  tl.hold(base, 0.25);

  const bubbleTop = cardTop + cardH + 36;
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = (s.days ?? []).slice(0, 7);
  for (let i = 0; i < 7; i++) {
    const idx = base.indexOf(rings[i]);
    const filled: Layer = { ...rings[i], input: days[i] ? checkCircle(circle, p.accent, p.ctaText) : missedCircle(circle, p.sub) };
    await tl.anim(0.26, async (t) => {
      const layers = [...base];
      layers[idx] = await scaleAbout(filled, lerp(0.4, 1, easeBack(t)), easeOut(t * 1.5));
      return layers;
    });
    base[idx] = filled;
    const q = s.quotes?.find((x) => x.day === i);
    if (q) {
      const qt = await txt(`<b>${dayNames[i]}:</b> “${esc(q.text)}”`, { weight: "MediumItalic", size: 38, color: p.text, width: INNER - pad * 2, spacing: 8 });
      const bh = Math.round(qt.height + pad * 1.6);
      const bubble: Layer[] = [
        { input: roundedRect(INNER, bh, 28, p.accent, p.dark ? 0.16 : 0.12), top: bubbleTop, left: SIDE },
        { input: qt.buffer, top: bubbleTop + Math.round(pad * 0.8), left: SIDE + pad },
      ];
      const shown = [...base];
      await tl.popIn(shown, bubble, 0.32);
      tl.hold(shown, 1.1);
      await tl.anim(0.22, async (t) => [...base, ...(await Promise.all(bubble.map(async (l) => ({ ...l, input: await fade(l.input, 1 - t) }))))]);
    } else {
      tl.hold(base, 0.14);
    }
  }
  tl.hold(base, 0.3);

  const flagText = await txt(esc(s.flag ?? ""), { weight: "Bold", size: 44, color: p.text, width: INNER - pad * 2 - 80, spacing: 4 });
  const flagLab = await label(p, "Ripple noticed", INNER - pad * 2 - 80);
  const fh = pad * 2 + flagLab.height + 12 + flagText.height;
  await tl.popIn(base, [
    { input: roundedRect(INNER, fh, 32, p.card), top: bubbleTop, left: SIDE },
    { input: roundedRect(10, fh - 48, 5, p.accent), top: bubbleTop + 24, left: SIDE + 20 },
    { input: flagIcon(56, p.accent), top: bubbleTop + pad, left: SIDE + pad + 8 },
    { input: flagLab.buffer, top: bubbleTop + pad, left: SIDE + pad + 88 },
    { input: flagText.buffer, top: bubbleTop + pad + flagLab.height + 12, left: SIDE + pad + 88 },
  ], 0.5);
  const y = bubbleTop + fh + 30;
  if (s.insight) {
    const ins = await txt(esc(s.insight), { weight: "Medium", size: 38, color: p.sub, align: "centre", spacing: 6 });
    if (y + ins.height < ZONE_BOTTOM - 60) await tl.popIn(base, [{ input: ins.buffer, top: y, left: centred(ins) }], 0.4);
  }
  tl.hold(base, 1.8);
  tl.poster();
}

// ─── Template 3: the same thing, four weeks running ───────────────────────

function highlight(sentence: string, phrase: string, p: Palette): string {
  const i = sentence.toLowerCase().indexOf(phrase.toLowerCase());
  if (!phrase || i < 0) return esc(sentence);
  const a = sentence.slice(0, i), b = sentence.slice(i, i + phrase.length), c = sentence.slice(i + phrase.length);
  return `${esc(a)}<span background="${p.accent}" foreground="${p.ctaText}"> ${esc(b)} </span>${esc(c)}`;
}

async function tPatternWeeks(tl: Timeline, p: Palette, s: VideoScript, top: Layer[], bottom: number) {
  const base = [...top];
  const pad = 34;
  const weeks = (s.weeks ?? []).slice(0, 4);
  let y = bottom;
  const quotes: { layer: Layer; sentence: string }[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const lab = await label(p, `Week ${i + 1}`);
    const q = await txt(`“${esc(weeks[i])}”`, { weight: "MediumItalic", size: 36, color: p.text, width: INNER - pad * 2, spacing: 8 });
    const ch = pad * 2 + lab.height + 10 + q.height;
    const layer = { input: q.buffer, top: y + pad + lab.height + 10, left: SIDE + pad };
    await tl.popIn(base, [
      { input: roundedRect(INNER, ch, 28, p.card), top: y, left: SIDE },
      { input: lab.buffer, top: y + pad, left: SIDE + pad },
      layer,
    ], 0.45);
    tl.hold(base, 0.4);
    quotes.push({ layer, sentence: weeks[i] });
    y += ch + 18;
  }
  // The repeat lights up in every week, one after another.
  for (const q of quotes) {
    const hi = await txt(`“${highlight(q.sentence, s.phrase ?? "", p)}”`, { weight: "MediumItalic", size: 36, color: p.text, width: INNER - pad * 2, spacing: 8 });
    const lit: Layer = { ...q.layer, input: hi.buffer };
    await tl.anim(0.3, async (t) => [...base, { ...lit, input: await fade(lit.input, easeOut(t)) }]);
    base[base.indexOf(q.layer)] = lit;
  }
  tl.hold(base, 0.3);
  y += 16;
  const lab = await label(p, `Came up ${weeks.length} weeks in a row`);
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 40, color: p.text, width: INNER - pad * 2, spacing: 6 });
  const ih = pad * 2 + lab.height + 12 + ins.height;
  await tl.popIn(base, [
    { input: roundedRect(INNER, ih, 28, p.accent, 0.14), top: y, left: SIDE },
    { input: lab.buffer, top: y + pad, left: SIDE + pad },
    { input: ins.buffer, top: y + pad + lab.height + 12, left: SIDE + pad },
  ], 0.5);
  tl.hold(base, 2);
  tl.poster();
}

// ─── Template 4: the weekly report builds itself ──────────────────────────

async function tWeeklyReport(tl: Timeline, p: Palette, s: VideoScript, top: Layer[], bottom: number) {
  const base = [...top];
  let y = bottom - 10;
  const kicker = await txt("MY WEEK IN RIPPLE", { weight: "Bold", size: 26, color: p.accent, tracking: true, align: "centre" });
  await tl.popIn(base, [{ input: kicker.buffer, top: y, left: centred(kicker) }], 0.35);
  y += kicker.height + 22;

  const stats = (s.stats ?? []).slice(0, 3);
  const gap = 20;
  const tileW = Math.floor((INNER - gap * 2) / 3);
  const labels = await Promise.all(stats.map((st) => txt(esc(st.label), { weight: "Medium", size: 26, color: p.sub, width: tileW - 30, align: "centre", spacing: 2 })));
  const valueAt = (v: string, frac: number) => {
    const m = v.match(/^(\d+)(.*)$/);
    if (!m) return frac >= 1 ? v : "";
    return `${Math.round(Number(m[1]) * frac)}${frac >= 1 ? m[2] : ""}`;
  };
  const sample = await txt("0", { weight: "Bold", size: 72, color: p.accent, width: tileW - 20, align: "centre" });
  const tileH = sample.height + Math.max(...labels.map((l) => l.height)) + 60;
  const tiles: Layer[] = stats.map((_, i) => ({ input: roundedRect(tileW, tileH, 26, p.card), top: y, left: SIDE + i * (tileW + gap) }));
  const tileLabels: Layer[] = labels.map((l, i) => ({ input: l.buffer, top: y + 28 + sample.height + 6, left: SIDE + i * (tileW + gap) + Math.round((tileW - l.width) / 2) }));
  await tl.popIn(base, [...tiles, ...tileLabels], 0.45);
  const valueLayers = async (frac: number) =>
    Promise.all(stats.map(async (st, i) => {
      const b = await txt(esc(valueAt(st.value, frac) || " "), { weight: "Bold", size: 72, color: p.accent, width: tileW - 20, align: "centre" });
      return { input: b.buffer, top: y + 28, left: SIDE + i * (tileW + gap) + Math.round((tileW - b.width) / 2) };
    }));
  await tl.anim(1.0, async (t) => [...base, ...(await valueLayers(easeOut(t)))]);
  base.push(...(await valueLayers(1)));
  tl.hold(base, 0.25);
  y += tileH + 24;

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
  ], 0.4);
  const chartTop = cardTop + pad + mlab.height + 16;
  const px = (i: number) => 14 + (i * (chartW - 28)) / Math.max(1, moods.length - 1);
  const py = (m: number) => 14 + ((5 - m) / 4) * (chartH - 28);
  const chartAt = (progress: number) => {
    // progress 0→1 along the whole line, drawn continuously.
    const span = progress * (moods.length - 1);
    const whole = Math.floor(span);
    const pts: string[] = [];
    for (let i = 0; i <= whole; i++) pts.push(`${px(i)},${py(moods[i])}`);
    if (whole < moods.length - 1) {
      const f = span - whole;
      pts.push(`${lerp(px(whole), px(whole + 1), f)},${lerp(py(moods[whole]), py(moods[whole + 1]), f)}`);
    }
    const dots = moods
      .map((m, i) => {
        const r = 9 * easeBack(clamp01((span - i + 0.3) / 0.5));
        return r > 0.5 ? `<circle cx="${px(i)}" cy="${py(m)}" r="${r}" fill="${p.accent}"/>` : "";
      })
      .join("");
    return svg(chartW, chartH, `<polyline points="${pts.join(" ")}" fill="none" stroke="${p.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${dots}`);
  };
  await tl.anim(1.4, (t) => [...base, { input: chartAt(easeInOut(t)), top: chartTop, left: SIDE + pad }]);
  base.push({ input: chartAt(1), top: chartTop, left: SIDE + pad });
  y = cardTop + cardH + 24;

  const theme = await txt(`Came up most: <b>${esc(s.theme ?? "")}</b>`, { weight: "Medium", size: 36, color: p.text, width: INNER - pad * 2 });
  const th = theme.height + 40;
  await tl.popIn(base, [
    { input: roundedRect(INNER, th, th / 2, p.accent, 0.14), top: y, left: SIDE },
    { input: theme.buffer, top: y + 20, left: SIDE + pad },
  ], 0.4);
  y += th + 24;
  const ilab = await label(p, "What Ripple noticed");
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 38, color: p.text, width: INNER - pad * 2, spacing: 6 });
  const ih = pad * 2 + ilab.height + 10 + ins.height;
  if (y + ih <= ZONE_BOTTOM - 50) {
    await tl.popIn(base, [
      { input: roundedRect(INNER, ih, 28, p.card), top: y, left: SIDE },
      { input: ilab.buffer, top: y + pad, left: SIDE + pad },
      { input: ins.buffer, top: y + pad + ilab.height + 10, left: SIDE + pad },
    ], 0.45);
  }
  tl.hold(base, 2);
  tl.poster();
}

// ─── Template 5: the invisible list, counted and sorted ──────────────────

async function tInvisibleList(tl: Timeline, p: Palette, s: VideoScript, top: Layer[], bottom: number) {
  const base = [...top];
  const items = (s.items ?? []).slice(0, 12);
  const total = Math.max(items.length, Math.min(40, s.total ?? items.length));
  const counterTop = bottom;
  const counter = (n: number) => txt(String(n), { weight: "Bold", size: 120, color: p.accent, align: "centre", width: 400 });
  const c0 = await counter(0);
  const caption = await txt("things you said this week", { weight: "Medium", size: 34, color: p.sub, align: "centre" });
  const captionLayer: Layer = { input: caption.buffer, top: counterTop + c0.height + 16, left: centred(caption) };
  const listTop = captionLayer.top + caption.height + 34;
  const listBottom = ZONE_BOTTOM - 60;
  const avail = listBottom - listTop;
  const pad = 30;
  const counterLayer = async (n: number): Promise<Layer> => {
    const c = await counter(n);
    return { input: c.buffer, top: counterTop, left: centred(c) };
  };
  await tl.popIn(base, [await counterLayer(0), captionLayer], 0.4);
  base.splice(base.length - 2, 1); // the counter is redrawn every frame

  const rows = await Promise.all(items.map(async (it) => {
    const text = await txt(esc(it.text), { weight: "Medium", size: 34, color: p.text, width: INNER - pad * 2 - 220 });
    const tag = await txt(esc(it.area.toUpperCase()), { weight: "Bold", size: 20, color: p.accent, tracking: true, width: 220 });
    const h = text.height + 30;
    return { text, tag, h, bg: roundedRect(INNER, h, 20, p.card) };
  }));
  const gap = 12;
  const offsets: number[] = [];
  rows.reduce((acc, r, i) => ((offsets[i] = acc), acc + r.h + gap), 0);
  const heightOf = (n: number) => (n === 0 ? 0 : offsets[n - 1] + rows[n - 1].h);
  const scrollFor = (n: number) => Math.max(0, heightOf(n) - avail);
  const listAt = async (n: number, scroll: number, newest: number): Promise<Layer[]> => {
    const out: Layer[] = [];
    for (let i = 0; i < n; i++) {
      const y = listTop + offsets[i] - scroll;
      if (y + rows[i].h < listTop - 4) continue;
      // Rows scrolling off the top fade out; the newest row fades in.
      let o = clamp01((y - (listTop - rows[i].h)) / rows[i].h);
      let dy = 0;
      if (i === n - 1) {
        o = Math.min(o, newest);
        dy = Math.round((1 - newest) * 30);
      }
      if (o <= 0.02) continue;
      const r = rows[i];
      const put = async (b: Buffer, top: number, left: number) => ({ input: await fade(b, o), top: top + dy, left });
      out.push(await put(r.bg, y, SIDE));
      out.push(await put(r.text.buffer, y + 15, SIDE + pad));
      out.push(await put(r.tag.buffer, y + Math.round((r.h - r.tag.height) / 2), W - SIDE - pad - r.tag.width));
    }
    return out;
  };
  for (let n = 1; n <= rows.length; n++) {
    const from = scrollFor(n - 1);
    const to = scrollFor(n);
    await tl.anim(0.3, async (t) => {
      const e = easeOut(t);
      return [...base, await counterLayer(n), ...(await listAt(n, lerp(from, to, e), e))];
    });
  }
  const finalList = await listAt(rows.length, scrollFor(rows.length), 1);
  await tl.anim(0.9, async (t) => [...base, await counterLayer(Math.round(lerp(rows.length, total, easeOut(t)))), ...finalList]);
  base.push(await counterLayer(total));
  tl.hold([...base, ...finalList], 0.5);
  await tl.anim(0.3, async (t) => [...base, ...(await Promise.all(finalList.map(async (l) => ({ ...l, input: await fade(l.input, 1 - t) }))))]);

  // Ripple sorts it: counts per area scaled up to the total, largest-remainder
  // rounding so the bars always add up to the number on screen.
  const byArea = new Map<string, number>();
  for (const it of items) byArea.set(it.area, (byArea.get(it.area) ?? 0) + 1);
  const scale = total / items.length;
  const areas = [...byArea.entries()].map(([a, c]) => {
    const exact = c * scale;
    return { area: a, n: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let short = total - areas.reduce((sum, a) => sum + a.n, 0);
  for (const a of [...areas].sort((x, y) => y.rem - x.rem)) {
    if (short-- <= 0) break;
    a.n++;
  }
  areas.sort((a, b) => b.n - a.n);
  areas.splice(6);
  const max = areas[0]?.n ?? 1;
  let y = listTop;
  const sortLab = await label(p, "Sorted by Ripple");
  await tl.popIn(base, [{ input: sortLab.buffer, top: y, left: SIDE + 4 }], 0.3);
  y += sortLab.height + 20;
  const barW = INNER - 300;
  const info = await Promise.all(areas.map(async (a) => ({ name: await txt(esc(a.area), { weight: "Bold", size: 32, color: p.text, width: 260 }), n: a.n })));
  const barsAt = async (t: number): Promise<Layer[]> => {
    const out: Layer[] = [];
    let ry = y;
    for (let i = 0; i < info.length; i++) {
      const r = info[i];
      const local = easeOut(clamp01(t * 1.4 - i * 0.08));
      const w = Math.max(30, Math.round((barW * r.n * local) / max));
      const count = await txt(String(Math.round(r.n * local)), { weight: "Bold", size: 32, color: p.accent, width: 90 });
      const barTop = ry + Math.round((r.name.height - 30) / 2);
      out.push({ input: r.name.buffer, top: ry, left: SIDE });
      out.push({ input: roundedRect(barW, 30, 15, p.muted), top: barTop, left: SIDE + 250 });
      out.push({ input: roundedRect(w, 30, 15, p.accent), top: barTop, left: SIDE + 250 });
      out.push({ input: count.buffer, top: ry, left: SIDE + 250 + barW + 16 });
      ry += r.name.height + 26;
    }
    return out;
  };
  await tl.anim(1.2, (t) => barsAt(t).then((b) => [...base, ...b]));
  base.push(...(await barsAt(1)));
  y += info.reduce((sum, r) => sum + r.name.height + 26, 0) + 10;
  const ins = await txt(esc(s.insight ?? ""), { weight: "Bold", size: 40, color: p.text, width: INNER - 60, spacing: 6 });
  const ih = ins.height + 60;
  if (y + ih <= ZONE_BOTTOM - 50) {
    await tl.popIn(base, [
      { input: roundedRect(INNER, ih, 28, p.accent, 0.14), top: y, left: SIDE },
      { input: ins.buffer, top: y + 30, left: SIDE + 30 },
    ], 0.45);
  }
  tl.hold(base, 2);
  tl.poster();
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

function runFfmpeg(bin: string, args: string[], stdin?: (w: NodeJS.WritableStream) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`))));
    if (stdin) {
      stdin(proc.stdin)
        .then(() => proc.stdin.end())
        .catch((err) => {
          proc.kill();
          reject(err);
        });
    }
  });
}

/** Decode the first OPENER_SECONDS of a clip into 1080×1920 JPEG frames. */
async function openerFramesFrom(bin: string, clip: Buffer, dir: string): Promise<Buffer[]> {
  const src = path.join(dir, "opener.mp4");
  fs.writeFileSync(src, clip);
  await runFfmpeg(bin, [
    "-y", "-loglevel", "error", "-i", src, "-t", String(OPENER_SECONDS),
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}`,
    "-q:v", "2", path.join(dir, "op_%04d.jpg"),
  ]);
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("op_"))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f)));
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
  opts?: { musicUrl?: string | null; openerClip?: Buffer | null }
): Promise<RenderedVideoAd> {
  const problem = validateVideoScript(script);
  if (problem) throw new Error(`video script invalid (${script.template}): ${problem}`);
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");

  const p = palette(groupKey);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adlab-video-"));
  try {
    let opener: Buffer[] | null = null;
    if (opts?.openerClip?.length) {
      opener = await openerFramesFrom(bin, opts.openerClip, dir).catch((err) => {
        console.warn(`[adlab-video] opener clip unusable, animation-only intro: ${err instanceof Error ? err.message : err}`);
        return null;
      });
    }

    const tl = new Timeline();
    const { layers: top, bottom } = await intro(tl, p, script.hook, opener);
    switch (script.template) {
      case "voice_to_list": await tVoiceToList(tl, p, script, top, bottom); break;
      case "habit_week": await tHabitWeek(tl, p, script, top, bottom); break;
      case "pattern_weeks": await tPatternWeeks(tl, p, script, top, bottom); break;
      case "weekly_report": await tWeeklyReport(tl, p, script, top, bottom); break;
      case "invisible_list": await tInvisibleList(tl, p, script, top, bottom); break;
    }
    await endCard(tl, p, script.endHeadline);

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

    const total = tl.seconds;
    const out = path.join(dir, "out.mp4");
    const args = ["-y", "-loglevel", "warning", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-"];
    if (musicPath) args.push("-stream_loop", "-1", "-i", musicPath);
    if (musicPath) {
      args.push("-map", "0:v", "-map", "1:a", "-af", `volume=0.8,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2`, "-c:a", "aac", "-b:a", "128k");
    }
    args.push(
      "-c:v", "libx264", "-preset", "medium",
      // Quality-targeted, not bitrate-starved: flat colours + small UI text
      // need a clean master to survive Meta's re-encode.
      "-crf", "16", "-maxrate", "14M", "-bufsize", "20M",
      "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart",
      "-t", total.toFixed(3),
      out
    );

    const bg = await sharp({ create: { width: W, height: H, channels: 3, background: p.bg } }).png().toBuffer();
    let posterStory: Buffer | null = null;
    const draw = async (f: Frame) => {
      const base = f.under ? f.under : bg;
      return sharp(base).composite(f.layers.map(({ input, top, left }) => ({ input, top: Math.round(top), left: Math.round(left) }))).jpeg({ quality: 93 }).toBuffer();
    };
    await runFfmpeg(bin, args, async (stdin) => {
      const write = (b: Buffer) =>
        new Promise<void>((resolve, reject) => {
          const ok = stdin.write(b, (err) => (err ? reject(err) : undefined));
          if (ok) resolve();
          else stdin.once("drain", () => resolve());
        });
      // Render a few frames ahead in parallel, write strictly in order.
      const AHEAD = 6;
      for (let i = 0; i < tl.frames.length; i += AHEAD) {
        const chunk = tl.frames.slice(i, i + AHEAD);
        const jpgs = await Promise.all(chunk.map(draw));
        for (let k = 0; k < chunk.length; k++) {
          if (i + k === tl.posterIndex) posterStory = jpgs[k];
          for (let r = 0; r < chunk[k].n; r++) await write(jpgs[k]);
        }
      }
    });

    const mp4 = fs.readFileSync(out);
    if (mp4.length < 100_000) throw new Error(`video render suspiciously small (${mp4.length} bytes)`);
    const story: Buffer = posterStory ?? (await draw(tl.frames[tl.frames.length - 1]));
    // Feed thumbnail = the 4:5 window Meta shows in the feed.
    const posterFeed = await sharp(story).extract({ left: 0, top: 285, width: W, height: 1350 }).jpeg({ quality: 92 }).toBuffer();
    const drawn = tl.frames.length;
    console.log(`[adlab-video] ${script.template}: ${drawn} drawn frames, ${total.toFixed(1)}s, ${mp4.length} bytes, opener=${!!opener}, music=${!!musicPath}`);
    return { mp4, posterFeed, posterStory: story, seconds: total };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
