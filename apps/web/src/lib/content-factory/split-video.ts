/**
 * Video assembly for the Ripple split lane (split-post.ts), 2026-10-20.
 * Rebuilt from the 10-16 one-off (scripts in the session scratchpad) for the
 * server: sharp renders the text, ffmpeg-static stacks and joins.
 *
 *   - 1080x1920, each pair = top half (heavy) over bottom half (free), 1080x960
 *     each, cover-cropped from the 3:2 illustration / Kling clip, trimmed to
 *     PAIR_SEC at real speed (never retimed).
 *   - The line is set in Patrick Hand SC on both halves. The top half's line
 *     sits below the Instagram/TikTok header (10-16 fix, "it gets cut off");
 *     ink is black on light backgrounds, white with a soft shadow on dark.
 *   - Ending: the last frame fades to black while the 2 ending lines fade in
 *     one after another (Tinos), then holds.
 *   - Music is mixed in afterwards (segments are silent).
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";

export const W = 1080;
export const HALF_H = 960;
export const H = 1920;
export const PAIR_SEC = 3.5;
const FPS = 30;
const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS)];

function ffmpegBin(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p || !fs.existsSync(p)) throw new Error("ffmpeg-static binary not found in this environment");
  return p;
}

function ff(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), ["-y", "-loglevel", "error", ...args]);
    let err = "";
    proc.stderr.on("data", (d) => (err = (err + d.toString()).slice(-3000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-1200)}`))));
  });
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-"));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function fontFile(file: string): Promise<string | null> {
  const tmp = `/tmp/${file}`;
  if (fs.existsSync(tmp)) return tmp;
  for (const p of [
    path.join(process.cwd(), "public", "fonts", file),
    path.join(process.cwd(), ".next", "server", "public", "fonts", file),
    path.join(process.cwd(), ".next", "standalone", "public", "fonts", file),
  ]) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, tmp);
      return tmp;
    }
  }
  try {
    const res = await fetch(`https://goripple.io/fonts/${file}`);
    if (res.ok) {
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      return tmp;
    }
  } catch {
    // fall through: sharp uses a default face
  }
  return null;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function textPng(markup: string, family: string, file: string | null, width: number): Promise<{ buf: Buffer; w: number; h: number }> {
  const opts: Record<string, unknown> = { text: markup, width, rgba: true, align: "centre", font: family };
  if (file) opts.fontfile = file;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await sharp({ text: opts } as any).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width ?? width, h: m.height ?? 0 };
}

/** The illustration cover-cropped to one half (W x HALF_H). */
export async function halfFrame(img: Buffer): Promise<Buffer> {
  return sharp(img).resize(W, HALF_H, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Transparent W x HALF_H layer with the line. half "top" keeps the text
 * below the apps' header (centered at ~31% of the half); "bottom" sits in
 * the upper part of its half (~20%).
 */
export async function lineLayer(halfImg: Buffer, line: string, half: "top" | "bottom"): Promise<Buffer> {
  const file = await fontFile("PatrickHandSC-Regular.ttf");
  const size = Math.round(W * 0.078);
  const probe = await textPng(`<span font_desc="Patrick Hand SC ${size}">${esc(line)}</span>`, "Patrick Hand SC", file, Math.round(W * 0.8));
  const cy = Math.round(HALF_H * (half === "top" ? 0.31 : 0.2));
  const top = Math.max(0, Math.min(HALF_H - probe.h, cy - Math.round(probe.h / 2)));
  const left = Math.round((W - probe.w) / 2);
  // Ink from the background brightness behind the text.
  const region = await sharp(await halfFrame(halfImg))
    .extract({ left: Math.max(0, left), top, width: Math.min(W - Math.max(0, left), probe.w), height: Math.min(HALF_H - top, Math.max(1, probe.h)) })
    .greyscale()
    .stats();
  const light = region.channels[0].mean > 150;
  const ink = light ? "#141414" : "#FAF8F2";
  const text = await textPng(`<span font_desc="Patrick Hand SC ${size}" foreground="${ink}">${esc(line)}</span>`, "Patrick Hand SC", file, Math.round(W * 0.8));
  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (!light) {
    const shadow = await textPng(`<span font_desc="Patrick Hand SC ${size}" foreground="#000000">${esc(line)}</span>`, "Patrick Hand SC", file, Math.round(W * 0.8));
    layers.push({ input: await sharp(shadow.buf).blur(3).ensureAlpha(0.55).png().toBuffer(), left: left + 2, top: top + 3 });
  }
  layers.push({ input: text.buf, left, top });
  return sharp({ create: { width: W, height: HALF_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
}

/** A still of one pair (both halves + text), for the post's slides and email. */
export async function pairStill(topImg: Buffer, botImg: Buffer, line: string): Promise<Buffer> {
  const [t, b, tl, bl] = await Promise.all([halfFrame(topImg), halfFrame(botImg), lineLayer(topImg, line, "top"), lineLayer(botImg, line, "bottom")]);
  return sharp({ create: { width: W, height: H, channels: 3, background: "#000" } })
    .composite([
      { input: t, left: 0, top: 0 },
      { input: tl, left: 0, top: 0 },
      { input: b, left: 0, top: HALF_H },
      { input: bl, left: 0, top: HALF_H },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** One pair: two clips (or stills when a clip failed), stacked, PAIR_SEC long, silent. */
export async function pairSegment(opts: { topClip: Buffer | null; botClip: Buffer | null; topImg: Buffer; botImg: Buffer; line: string }): Promise<Buffer> {
  return withTmp(async (dir) => {
    const inputs: string[] = [];
    const src = async (clip: Buffer | null, img: Buffer, name: string) => {
      if (clip) {
        const p = path.join(dir, `${name}.mp4`);
        fs.writeFileSync(p, clip);
        inputs.push("-i", p);
      } else {
        const p = path.join(dir, `${name}.jpg`);
        fs.writeFileSync(p, await halfFrame(img));
        inputs.push("-loop", "1", "-t", String(PAIR_SEC), "-i", p);
      }
    };
    await src(opts.topClip, opts.topImg, "top");
    await src(opts.botClip, opts.botImg, "bot");
    const tl = path.join(dir, "tl.png");
    const bl = path.join(dir, "bl.png");
    fs.writeFileSync(tl, await lineLayer(opts.topImg, opts.line, "top"));
    fs.writeFileSync(bl, await lineLayer(opts.botImg, opts.line, "bottom"));
    inputs.push("-loop", "1", "-t", String(PAIR_SEC), "-i", tl, "-loop", "1", "-t", String(PAIR_SEC), "-i", bl);
    const half = (i: number, out: string) =>
      `[${i}:v]scale=${W}:${HALF_H}:force_original_aspect_ratio=increase,crop=${W}:${HALF_H},fps=${FPS},tpad=stop_mode=clone:stop_duration=${PAIR_SEC},trim=0:${PAIR_SEC},setpts=PTS-STARTPTS[${out}]`;
    const fc = `${half(0, "t")};${half(1, "b")};[t][2:v]overlay=0:0[t2];[b][3:v]overlay=0:0[b2];[t2][b2]vstack=inputs=2,format=yuv420p[v]`;
    const out = path.join(dir, "seg.mp4");
    await ff([...inputs, "-filter_complex", fc, "-map", "[v]", "-t", String(PAIR_SEC), ...ENCODE, "-an", out]);
    return fs.readFileSync(out);
  });
}

/** Ending: the last pair's final frame fades to black as the 2 lines fade in. */
export async function endingSegment(lastSegment: Buffer, lines: string[]): Promise<Buffer> {
  const FADE = 1.2;
  const START = 1.0;
  const STEP = 1.2;
  const HOLD = 2.4;
  const dur = START + STEP * (lines.length - 1) + 0.8 + HOLD;
  return withTmp(async (dir) => {
    const seg = path.join(dir, "last.mp4");
    fs.writeFileSync(seg, lastSegment);
    const still = path.join(dir, "last.png");
    await ff(["-sseof", "-0.1", "-i", seg, "-frames:v", "1", "-update", "1", still]);
    const file = await fontFile("Tinos-Regular.ttf");
    const size = Math.round(W * 0.064);
    const rendered = await Promise.all(lines.map((l) => textPng(`<span font_desc="Tinos ${size}" foreground="#F6F2E8">${esc(l)}</span>`, "Tinos", file, Math.round(W * 0.82))));
    const gap = Math.round(size * 0.8);
    const total = rendered.reduce((t, r) => t + r.h, 0) + gap * (rendered.length - 1);
    let y = Math.round((H - total) / 2);
    const args = ["-f", "lavfi", "-t", String(dur), "-i", `color=c=black:s=${W}x${H}:r=${FPS}`, "-loop", "1", "-t", String(dur), "-i", still];
    let fc = `[1:v]format=rgba,fade=t=out:st=0.2:d=${FADE}:alpha=1[img];[0:v][img]overlay=0:0[v0];`;
    let cur = "v0";
    for (let k = 0; k < rendered.length; k++) {
      const layer = path.join(dir, `l${k}.png`);
      const canvas = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: rendered[k].buf, left: Math.round((W - rendered[k].w) / 2), top: y }])
        .png()
        .toBuffer();
      fs.writeFileSync(layer, canvas);
      y += rendered[k].h + gap;
      args.push("-loop", "1", "-t", String(dur), "-i", layer);
      fc += `[${k + 2}:v]format=rgba,fade=t=in:st=${(START + STEP * k).toFixed(2)}:d=0.8:alpha=1[l${k}];[${cur}][l${k}]overlay=0:0[v${k + 1}];`;
      cur = `v${k + 1}`;
    }
    fc += `[${cur}]format=yuv420p[v]`;
    const out = path.join(dir, "end.mp4");
    await ff([...args, "-filter_complex", fc, "-map", "[v]", "-t", dur.toFixed(2), ...ENCODE, "-an", out]);
    return fs.readFileSync(out);
  });
}

/** Join the segments (same encode settings) and lay music under them. */
export async function finishSplitVideo(segments: Buffer[], musicUrl: string | null): Promise<{ buf: Buffer; seconds: number }> {
  return withTmp(async (dir) => {
    const list = path.join(dir, "list.txt");
    const names = segments.map((b, i) => {
      const p = path.join(dir, `s${i}.mp4`);
      fs.writeFileSync(p, b);
      return p;
    });
    fs.writeFileSync(list, names.map((n) => `file '${n}'`).join("\n"));
    const joined = path.join(dir, "joined.mp4");
    await ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
    const seconds = (segments.length - 1) * PAIR_SEC + 5.6;
    if (!musicUrl) return { buf: fs.readFileSync(joined), seconds };
    const music = path.join(dir, "music.mp3");
    const r = await fetch(musicUrl);
    if (!r.ok) return { buf: fs.readFileSync(joined), seconds };
    fs.writeFileSync(music, Buffer.from(await r.arrayBuffer()));
    const out = path.join(dir, "final.mp4");
    const fadeAt = Math.max(0, seconds - 2.5).toFixed(2);
    await ff([
      "-i", joined, "-i", music,
      "-filter_complex", `[1:a]atrim=0:${seconds.toFixed(2)},afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeAt}:d=2.5,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", out,
    ]);
    return { buf: fs.readFileSync(out), seconds };
  });
}
