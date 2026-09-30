/**
 * Content Factory — VOICED video media toolbox (2026-09-30, per Keenan:
 * "one script of each, which I'll record and send the file back to you to
 * build the video off of").
 *
 * Keenan records the day's script on his phone; everything here turns that
 * recording into the finished reel:
 *   normalizeVoice    → mono 48k, trimmed silence, loudness-normalized AAC
 *   transcribeVoice   → Whisper word timestamps (what he ACTUALLY said)
 *   alignToScript     → which script line each spoken word belongs to, the
 *                       cut points between shots, and 1-4 word captions
 *   renderShotSegment → one shot's Higgsfield clip fitted to its line, with
 *                       that line's captions burned in (hard cuts, no fades)
 *   joinVoicedVideo   → concat (stream copy) + CTA card, then the voice and
 *                       ducked library music muxed in a separate pass
 *
 * Vercel ffmpeg rules (see living-reel.ts): no xfade, no drawtext; small
 * per-segment passes joined by the concat demuxer; captions are PNGs from
 * compose.ts renderCaptionPng composited with `overlay`.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const W = 1080;
const H = 1920;
const FPS = 30;
/** Seconds the picture holds after his last word, before the CTA card. */
export const VOICE_TAIL_SEC = 0.7;
const CTA_SEC = 3;
/** Caption block vertical centre: lower-middle, clear of IG's bottom UI. */
const CAPTION_CENTER_Y = 1290;
/** Music under the voice; it comes up for the CTA card. */
const MUSIC_UNDER_VOICE = 0.12;
const MUSIC_ON_CTA = 0.4;
/** A short clip may be slowed at most this much before it holds its last frame. */
const MAX_SLOWDOWN = 1.5;

const SEGMENT_ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS)];

function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg-static binary not found in this environment"));
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1500)}`))
    );
  });
}

function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voiced-"));
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

/** Snap a time to the frame grid so segment lengths never drift from the audio. */
function snap(t: number): number {
  return Math.round(t * FPS) / FPS;
}

// ── 1. Voice ───────────────────────────────────────────────────────────

/**
 * Phone recording (m4a / mp3 / wav / anything ffmpeg reads) → mono 48kHz
 * AAC with leading/trailing silence trimmed (a 0.15s breath kept in front),
 * a rumble high-pass and EBU R128 loudness normalization.
 */
export async function normalizeVoice(input: Buffer, ext: string): Promise<{ buf: Buffer; seconds: number }> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, `in.${ext.replace(/[^a-z0-9]/gi, "") || "m4a"}`);
    const out = path.join(dir, "voice.m4a");
    fs.writeFileSync(inPath, input);
    await runFfmpeg([
      "-i", inPath,
      "-vn", "-ac", "1", "-ar", "48000",
      "-af",
      [
        "highpass=f=70",
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1",
        "areverse",
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3",
        "areverse",
        "adelay=150",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "aresample=48000",
      ].join(","),
      "-c:a", "aac", "-b:a", "160k", out,
    ]);
    const buf = fs.readFileSync(out);
    const { probeMediaDuration } = await import("./story-video");
    return { buf, seconds: await probeMediaDuration(buf, "m4a") };
  });
}

export interface SpokenWord {
  word: string;
  start: number;
  end: number;
}

/** Whisper word timestamps. The script is passed as a prompt so names and spellings match. */
export async function transcribeVoice(voice: Buffer, scriptText: string): Promise<{ text: string; words: SpokenWord[] }> {
  const { default: OpenAI, toFile } = await import("openai");
  const key = process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No OpenAI API key configured (ACUITY_ADLAB_OPENAI_KEY or OPENAI_API_KEY)");
  const client = new OpenAI({ apiKey: key, timeout: 120_000 });
  const res = (await client.audio.transcriptions.create({
    file: await toFile(voice, "voice.m4a", { type: "audio/mp4" }),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    language: "en",
    prompt: scriptText.slice(0, 800),
  })) as unknown as { text: string; words?: SpokenWord[] };
  const words = (res.words ?? []).filter((w) => w.word?.trim());
  if (words.length === 0) throw new Error("Whisper returned no words — is the recording silent?");
  return { text: res.text, words };
}

// ── 2. Alignment ───────────────────────────────────────────────────────

const NUM_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
  "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve",
  "15": "fifteen", "20": "twenty", "30": "thirty", "40": "forty", "50": "fifty", "100": "hundred",
};

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => NUM_WORDS[t] ?? t);
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
    return editDistance(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1);
  }
  return false;
}

export interface CaptionChunk {
  text: string;
  start: number;
  end: number;
}

export interface VoicedTimeline {
  /** Cut points: shot i runs [boundaries[i], boundaries[i+1]). Length = lines + 1. */
  boundaries: number[];
  captions: CaptionChunk[];
  /** Spoken words that matched a script word (a rough read-accuracy signal). */
  matched: number;
  spoken: number;
}

/**
 * Map what he said onto the script. An LCS over fuzzy-equal tokens pairs
 * spoken words with script words (tolerant of ad-libs, skipped words and
 * Whisper's spellings); every spoken word then belongs to the line of the
 * last script word matched at or before it. Cuts land in the pause between
 * one line's last word and the next line's first. Captions are built from
 * the TRANSCRIPT, so they always show what was actually said.
 */
export function alignToScript(lines: string[], words: SpokenWord[], voiceSeconds: number): VoicedTimeline {
  const script: { tok: string; line: number }[] = [];
  lines.forEach((l, li) => tokens(l).forEach((tok) => script.push({ tok, line: li })));
  // Each spoken word may carry punctuation or be several tokens ("don't", "3pm").
  const spokenTok = words.map((w) => tokens(w.word).join(""));

  const n = script.length;
  const m = spokenTok.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        spokenTok[j] && similar(script[i].tok, spokenTok[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lineOfWord: (number | null)[] = new Array(m).fill(null);
  let matched = 0;
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (spokenTok[j] && similar(script[i].tok, spokenTok[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      lineOfWord[j] = script[i].line;
      matched++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  // Unmatched words (ad-libs) belong to the line in progress.
  let current = 0;
  const lineIdx = lineOfWord.map((l) => {
    if (l !== null) current = Math.max(current, l);
    return current;
  });

  // Cut points between lines.
  const total = snap(voiceSeconds + VOICE_TAIL_SEC);
  const raw: (number | null)[] = [0];
  for (let li = 1; li < lines.length; li++) {
    const first = lineIdx.findIndex((x) => x === li);
    if (first <= 0) {
      raw.push(null);
      continue;
    }
    const prevEnd = words[first - 1].end;
    raw.push((prevEnd + words[first].start) / 2);
  }
  // A line he skipped still gets its shot: split the gap evenly.
  const boundaries: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== null) {
      boundaries.push(raw[i]!);
      continue;
    }
    let k = i;
    while (k < raw.length && raw[k] === null) k++;
    const lo = boundaries[boundaries.length - 1];
    const hi = k < raw.length ? raw[k]! : total;
    const gaps = k - i + 1;
    for (let g = 1; g <= k - i; g++) boundaries.push(lo + ((hi - lo) * g) / gaps);
    i = k - 1;
  }
  boundaries.push(total);
  // Every shot at least 0.8s, monotonic, on the frame grid.
  for (let i = 1; i < boundaries.length - 1; i++) {
    boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + 0.8);
  }
  for (let i = boundaries.length - 2; i > 0; i--) {
    boundaries[i] = Math.min(boundaries[i], boundaries[i + 1] - 0.8);
  }
  const snapped = boundaries.map(snap);

  // Captions: 1-4 words, never across a line change, a pause or ~22 chars.
  const captions: CaptionChunk[] = [];
  let chunk: { words: SpokenWord[]; line: number } | null = null;
  const flush = () => {
    if (!chunk || chunk.words.length === 0) return;
    captions.push({
      text: chunk.words.map((w) => w.word.trim()).join(" "),
      start: chunk.words[0].start,
      end: chunk.words[chunk.words.length - 1].end,
    });
    chunk = null;
  };
  words.forEach((w, j) => {
    const prev = j > 0 ? words[j - 1] : null;
    const chars = chunk ? chunk.words.map((x) => x.word.trim()).join(" ").length + 1 + w.word.trim().length : 0;
    if (
      chunk &&
      (chunk.line !== lineIdx[j] ||
        chunk.words.length >= 4 ||
        chars > 22 ||
        (prev && w.start - prev.end > 0.6) ||
        (prev && /[.,!?;:]$/.test(prev.word.trim())))
    ) {
      flush();
    }
    if (!chunk) chunk = { words: [], line: lineIdx[j] };
    chunk.words.push(w);
  });
  flush();
  // Each caption stays up until the next one (short pauses), or 0.3s past its last word.
  for (let i = 0; i < captions.length; i++) {
    const next = captions[i + 1];
    const hold = captions[i].end + 0.3;
    captions[i].end = next && next.start - captions[i].end < 0.8 ? next.start : Math.min(hold, next?.start ?? hold);
  }

  return { boundaries: snapped, captions, matched, spoken: m };
}

// ── 3. Picture ─────────────────────────────────────────────────────────

export interface CaptionPng {
  png: Buffer;
  w: number;
  h: number;
  /** Seconds, relative to the segment start. */
  start: number;
  end: number;
}

/** Caption PNGs for the chunks that overlap one shot, timed relative to it. */
export async function captionsForSegment(captions: CaptionChunk[], segStart: number, segEnd: number): Promise<CaptionPng[]> {
  const { renderCaptionPng } = await import("./compose");
  const out: CaptionPng[] = [];
  for (const c of captions) {
    if (c.end <= segStart || c.start >= segEnd) continue;
    const r = await renderCaptionPng(c.text, 84);
    out.push({
      png: r.buffer,
      w: r.width,
      h: r.height,
      start: Math.max(0, c.start - segStart),
      end: Math.min(segEnd - segStart, c.end - segStart),
    });
  }
  return out;
}

/**
 * One shot of the reel, exactly `seconds` long at 1080x1920/30fps, with its
 * captions burned in. A clip longer than the line is trimmed; a shorter one
 * is slowed (at most 1.5x) and then holds its last frame, never loops. No
 * clip (Higgsfield failed) → the shot's photo with a slow push-in.
 */
export async function renderShotSegment(opts: {
  clip?: Buffer | null;
  image: Buffer;
  seconds: number;
  captions: CaptionPng[];
}): Promise<Buffer> {
  const d = snap(opts.seconds);
  return withTempDir(async (dir) => {
    const out = path.join(dir, "seg.mp4");
    const inputs: string[] = [];
    let base: string;
    if (opts.clip) {
      const clipPath = path.join(dir, "clip.mp4");
      fs.writeFileSync(clipPath, opts.clip);
      const { probeMediaDuration } = await import("./story-video");
      const clipSec = await probeMediaDuration(opts.clip, "mp4").catch(() => 5);
      const factor = clipSec >= d ? 1 : Math.min(MAX_SLOWDOWN, d / clipSec);
      inputs.push("-i", clipPath);
      base = `[0:v]setpts=${factor.toFixed(4)}*PTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=${d},trim=0:${d},setpts=PTS-STARTPTS[bg]`;
    } else {
      const stillPath = path.join(dir, "still.jpg");
      fs.writeFileSync(stillPath, opts.image);
      const frames = Math.round(d * FPS);
      inputs.push("-i", stillPath);
      base = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1[bg]`;
    }
    const chain = [base];
    let last = "bg";
    opts.captions.forEach((c, i) => {
      const p = path.join(dir, `cap-${i}.png`);
      fs.writeFileSync(p, c.png);
      inputs.push("-loop", "1", "-t", String(d), "-i", p);
      const x = Math.round((W - c.w) / 2);
      const y = Math.round(CAPTION_CENTER_Y - c.h / 2);
      const next = `v${i}`;
      chain.push(
        `[${last}][${i + 1}:v]overlay=${x}:${y}:shortest=1:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'[${next}]`
      );
      last = next;
    });
    chain.push(`[${last}]format=yuv420p[v]`);
    await runFfmpeg([...inputs, "-filter_complex", chain.join(";"), "-map", "[v]", "-t", String(d), ...SEGMENT_ENCODE, out]);
    return fs.readFileSync(out);
  });
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Shots + CTA card joined by stream copy, then his voice and the library
 * music mixed in a separate pass: music sits well under the voice and comes
 * up for the CTA card.
 */
export async function joinVoicedVideo(opts: {
  segments: Buffer[];
  voice: Buffer;
  /** Length of the voice track (normalizeVoice seconds). */
  voiceSeconds: number;
  musicUrl: string | null;
  /** Brand CTA end card image; null to end on the last shot. */
  ctaUrl: string | null;
}): Promise<{ buf: Buffer; seconds: number }> {
  if (opts.segments.length === 0) throw new Error("joinVoicedVideo: no segments");
  return withTempDir(async (dir) => {
    const list: string[] = [];
    opts.segments.forEach((b, i) => {
      const p = path.join(dir, `seg-${i}.mp4`);
      fs.writeFileSync(p, b);
      list.push(`file '${p}'`);
    });
    let ctaSec = 0;
    if (opts.ctaUrl) {
      const img = path.join(dir, "cta.jpg");
      await download(opts.ctaUrl, img);
      const seg = path.join(dir, "cta.mp4");
      await runFfmpeg([
        "-loop", "1", "-t", String(CTA_SEC), "-i", img,
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`,
        "-t", String(CTA_SEC), ...SEGMENT_ENCODE, seg,
      ]);
      list.push(`file '${seg}'`);
      ctaSec = CTA_SEC;
    }
    const listPath = path.join(dir, "list.txt");
    fs.writeFileSync(listPath, list.join("\n"));
    const silent = path.join(dir, "silent.mp4");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silent]);
    const { probeMediaDuration } = await import("./story-video");
    const t = await probeMediaDuration(fs.readFileSync(silent), "mp4");

    const voicePath = path.join(dir, "voice.m4a");
    fs.writeFileSync(voicePath, opts.voice);
    const out = path.join(dir, "reel.mp4");
    const ctaStart = (t - ctaSec).toFixed(2);
    if (opts.musicUrl) {
      const music = path.join(dir, "music.audio");
      await download(opts.musicUrl, music);
      await runFfmpeg([
        "-i", silent,
        "-i", voicePath,
        "-stream_loop", "-1", "-i", music,
        "-filter_complex",
        [
          `[1:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${t.toFixed(2)}[vo]`,
          `[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${t.toFixed(2)},asetpts=PTS-STARTPTS,volume=${MUSIC_UNDER_VOICE},volume=${(MUSIC_ON_CTA / MUSIC_UNDER_VOICE).toFixed(2)}:enable='gte(t,${ctaStart})',afade=t=in:st=0:d=0.6,afade=t=out:st=${(t - 1.2).toFixed(2)}:d=1.2[mu]`,
          `[vo][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
        ].join(";"),
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        "-t", t.toFixed(2), out,
      ]);
    } else {
      await runFfmpeg([
        "-i", silent, "-i", voicePath,
        "-filter_complex", `[1:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${t.toFixed(2)}[aout]`,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        "-t", t.toFixed(2), out,
      ]);
    }
    return { buf: fs.readFileSync(out), seconds: t };
  });
}

/** Resize a generated photo to the 1080x1920 start frame Higgsfield animates. */
export async function toStartFrame(image: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(image).resize(W, H, { fit: "cover", position: "centre" }).sharpen({ sigma: 0.6 }).jpeg({ quality: 93 }).toBuffer();
}
