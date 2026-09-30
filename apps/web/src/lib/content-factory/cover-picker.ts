/**
 * Jev #1 — best-of-5 cover lines (2026-09-30, per Keenan: "build out
 * numbers 1-6 right now and link everything").
 *
 * After a lane's writer has produced an accepted post, Sonnet writes FOUR
 * fresh alternative cover lines for the same post in one call (fresh
 * options, never an edit or polish of the original — the humanizer
 * rewrite pass was removed on 2026-09-30 because rewriting made copy
 * worse). Jev then scores the original plus every surviving alternative
 * in ONE call: scroll-stop, save/send, and "makes complete sense as this
 * post's cover". The composite is computed here in code, and the
 * original gets a small incumbency bonus so we only switch for a clear
 * improvement.
 *
 * Called from withHeadlineRetry() (headline-history.ts) via a dynamic
 * import when a generator passes `bestCover`. FAIL OPEN: Jev off, Jev
 * failing, Sonnet failing or nothing surviving the filters all return
 * null, and the lane ships its original cover exactly as before.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
  messageText,
} from "./claude-client";
import { copyObjectives, type CopyBrand } from "./copy-objectives";
import {
  askJev,
  jevEnabled,
  noulOf,
  scoreOf,
  SAVE_SEND_LEVELS,
  SCROLL_STOP_LEVELS,
  type JevQuestion,
} from "./jev";
import { isRecentHeadline, normalizeHeadline } from "./headline-history";

const ALTERNATIVES = 4;
const SONNET_TIMEOUT_MS = 45_000;
const CONTEXT_CHARS = 1500;

/** Composite weights — kept in code (Jev is weak at arithmetic). */
const W_SCROLL = 0.45;
const W_SAVE = 0.25;
const W_SENSE = 0.1;
const W_CLEAR = 0.2;
/** A candidate Jev thinks doesn't make sense on its own can never win. */
const MIN_SENSE = 0.5;
/**
 * COVER-ONLY clarity (2026-09-30, after Keenan on "NAME YOUR UNPAID JOBS":
 * "who would click on that. that makes no sense"). The sense question sees
 * the post, so a cryptic cover passes because the slides explain it. This
 * one is asked with ONLY the cover lines in state. Tested: cryptic covers
 * ("SIT DOWN FOR THESE...", "HAND ONE BACK") score ≤0.16, clear ones
 * 0.44-0.78, so below 0.3 can never win.
 */
const MIN_CLEAR = 0.3;
/** The writer's original only loses to a clearly better line. */
const INCUMBENT_BONUS = 0.03;

/** Who the cover is for, in one line of Jev state. */
const AUDIENCE: Record<CopyBrand, string> = {
  ripple:
    "Women roughly 40-50 carrying the mental load for everyone around them (work, kids, partner, aging parents), scrolling Instagram, Facebook or TikTok on a phone. They want to feel seen and lighter; they skip anything preachy, clinical or written like a brand.",
  bwk:
    "Men roughly 18-30 building discipline and self-respect in private (training, money, focus), scrolling Instagram, Facebook or TikTok on a phone. They skip hype and guru talk and save posts that read like a concrete standard or a direct command.",
  mythicals:
    "Fans of fantasy, mythology, games, anime and epic film, mostly 16-35, scrolling Instagram, Facebook or TikTok on a phone. They stop for an epic 'which would you choose' debate and comment their pick.",
};

export interface PickBestCoverInput {
  /** withHeadlineRetry label, for logs. */
  label: string;
  brand: CopyBrand;
  /** Lane key, for the prompt and logs. */
  lane: string;
  /** The accepted cover line. */
  current: string;
  /** Reader-facing text of the rest of the post. */
  context: string;
  /** The lane's own form rules for its cover line. */
  rules?: string;
}

export interface PickBestCoverResult {
  headline: string;
  candidates: { text: string; score: number }[];
}

const DASH_RE = /[—–]/;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function isAllLower(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toLowerCase();
}

/** Match the original's case style deterministically (not a rewrite). */
function matchCase(alt: string, current: string): string {
  if (isAllCaps(current)) return alt.toUpperCase();
  if (isAllLower(current)) return alt.toLowerCase();
  return alt;
}

async function writeAlternatives(input: PickBestCoverInput): Promise<string[] | null> {
  const { prisma } = await import("@/lib/prisma");
  const words = wordCount(input.current);
  const system = `${copyObjectives(input.brand)}

YOUR TASK: the post below is finished. Write ${ALTERNATIVES} alternative COVER lines for it, so the strongest one can be picked. Each is a fresh option written from scratch, not an edit of the current cover. Each takes a genuinely different angle on the same post (a different detail, feeling, promise or tension), and each must deliver exactly what the slides deliver.

FORM — every alternative keeps the current cover's form:
- Same case style as the current cover (ALL CAPS stays ALL CAPS, lowercase stays lowercase, sentence case stays sentence case).
- Similar length: about ${words} words, never under ${Math.max(1, Math.ceil(words * 0.5))} or over ${Math.floor(words * 1.6)}.
- A command stays a command, a question stays a question, a statement stays a statement. If the current cover has a number, keep the same number. If it ends with "...", end with "...".
- No em dashes or en dashes. No emojis, no hashtags, no quotation marks.
- It must make complete sense on its own, read in under a second on a phone.${input.rules ? `\n\nTHIS LANE'S COVER RULES (they override anything above):\n${input.rules}` : ""}

Return only a JSON array of ${ALTERNATIVES} strings.`;
  const user = `LANE: ${input.lane}

THE POST (reader-facing text after the cover):
${input.context.slice(0, 3000)}

CURRENT COVER: ${input.current}

Write ${ALTERNATIVES} alternative covers. Return only the JSON array.`;

  const start = Date.now();
  const purpose = `cover-picker:${input.label}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      contentAnthropic.messages.create({
        model: CONTENT_MODEL,
        max_tokens: 500,
        effort: "medium",
        system,
        messages: [{ role: "user", content: user }],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${SONNET_TIMEOUT_MS}ms`)),
          SONNET_TIMEOUT_MS
        );
      }),
    ]).finally(() => clearTimeout(timer));
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    void prisma.claudeCallLog
      .create({
        data: {
          purpose,
          model: CONTENT_MODEL,
          tokensIn,
          tokensOut,
          costCents: Math.ceil(
            (tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN) * 100
          ),
          durationMs: Date.now() - start,
          success: true,
        },
      })
      .catch(() => {});
    const parsed = JSON.parse(lastJsonText(messageText(response))) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((s): s is string => typeof s === "string");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cover-picker] ${input.label}: Sonnet alternatives failed — keeping original: ${msg}`);
    void prisma.claudeCallLog
      .create({
        data: {
          purpose,
          model: CONTENT_MODEL,
          tokensIn: 0,
          tokensOut: 0,
          costCents: 0,
          durationMs: Date.now() - start,
          success: false,
          errorMessage: msg,
        },
      })
      .catch(() => {});
    return null;
  }
}

/** Filters that code can check: dashes, length, exact recent repeats, dupes. */
async function survivingAlternatives(current: string, raw: string[]): Promise<string[]> {
  const words = wordCount(current);
  const seen = new Set([normalizeHeadline(current)]);
  const out: string[] = [];
  for (const r of raw) {
    const alt = matchCase(r.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim(), current);
    const n = normalizeHeadline(alt);
    if (!alt || !n || seen.has(n)) continue;
    if (DASH_RE.test(alt)) continue;
    const w = wordCount(alt);
    if (w > words * 1.6 || w < words * 0.5) continue;
    if (await isRecentHeadline(alt)) continue;
    seen.add(n);
    out.push(alt);
  }
  return out;
}

/** Jev scores every candidate in one call; composite computed here. */
export async function scoreCovers(input: {
  label: string;
  brand: CopyBrand;
  context: string;
  candidates: string[];
}): Promise<{ text: string; scroll: number; save: number; sense: number; clear: number; score: number }[] | null> {
  const questions: Record<string, JevQuestion> = {};
  input.candidates.forEach((_, i) => {
    questions[`scroll_${i}`] = {
      type: "score",
      instructions: `How strongly would the reader described in \`audience\` stop scrolling for a post whose cover line is \`candidates[${i}]\`, given the post described in \`post\`?`,
      criteria: SCROLL_STOP_LEVELS,
    };
    questions[`save_${i}`] = {
      type: "score",
      instructions: `If the cover line were \`candidates[${i}]\` on the post described in \`post\`, how likely is the reader described in \`audience\` to save it, send it to someone, or comment?`,
      criteria: SAVE_SEND_LEVELS,
    };
    questions[`sense_${i}`] = {
      type: "noul",
      instructions: `Does \`candidates[${i}]\` make complete sense on its own as the cover of the post described in \`post\`?`,
    };
  });
  const clearQuestions: Record<string, JevQuestion> = {};
  input.candidates.forEach((_, i) => {
    clearQuestions[`clear_${i}`] = {
      type: "noul",
      instructions: `Reading ONLY \`covers[${i}]\` as an Instagram post cover, with nothing else to go on, can a stranger tell what the post is about?`,
      criteria: {
        true: "Yes: the cover alone clearly names the topic or situation",
        false: "No: it is vague, cryptic or a command whose subject only makes sense after reading the post",
      },
    };
  });
  const [r, rc] = await Promise.all([
    askJev(
      `cover-pick:${input.label}`,
      {
        audience: AUDIENCE[input.brand],
        post: input.context.slice(0, CONTEXT_CHARS),
        candidates: input.candidates,
      },
      questions
    ),
    askJev(`cover-clear:${input.label}`, { covers: input.candidates }, clearQuestions),
  ]);
  if (!r || !rc) return null;
  const rows = input.candidates.map((text, i) => {
    const scroll = scoreOf(r, `scroll_${i}`);
    const save = scoreOf(r, `save_${i}`);
    const sense = noulOf(r, `sense_${i}`);
    const clear = noulOf(rc, `clear_${i}`);
    if (scroll == null || save == null || sense == null || clear == null) return null;
    return {
      text,
      scroll,
      save,
      sense,
      clear,
      score: W_SCROLL * scroll + W_SAVE * save + W_SENSE * sense + W_CLEAR * clear,
    };
  });
  if (rows.some((x) => x == null)) return null;
  return rows as NonNullable<(typeof rows)[number]>[];
}

/**
 * Best-of-5 cover pick. Returns the winning headline (possibly the
 * original) and the scored table, or null to keep the original as-is.
 */
export async function pickBestCover(input: PickBestCoverInput): Promise<PickBestCoverResult | null> {
  try {
    if (!jevEnabled() || !input.current.trim()) return null;
    const t0 = Date.now();
    const raw = await writeAlternatives(input);
    if (!raw) return null;
    const alts = await survivingAlternatives(input.current, raw);
    if (alts.length === 0) {
      console.log(`[cover-picker] ${input.label}: no alternative survived the filters — keeping original`);
      return null;
    }
    const candidates = [input.current, ...alts];
    const rows = await scoreCovers({
      label: input.label,
      brand: input.brand,
      context: input.context,
      candidates,
    });
    if (!rows) return null;

    let best = -1;
    let bestScore = -Infinity;
    rows.forEach((row, i) => {
      if (row.sense < MIN_SENSE || row.clear < MIN_CLEAR) return;
      const s = row.score + (i === 0 ? INCUMBENT_BONUS : 0);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    const winner = best >= 0 ? rows[best].text : input.current;

    const table = rows
      .map(
        (row, i) =>
          `  ${i === best ? "*" : " "} ${row.score.toFixed(3)}${i === 0 ? `(+${INCUMBENT_BONUS})` : "       "} scroll=${row.scroll.toFixed(2)} save=${row.save.toFixed(2)} sense=${row.sense.toFixed(2)} clear=${row.clear.toFixed(2)}${row.sense < MIN_SENSE || row.clear < MIN_CLEAR ? " INELIGIBLE" : ""}  ${i === 0 ? "[original] " : ""}${row.text}`
      )
      .join("\n");
    console.log(
      `[cover-picker] ${input.label} (${input.brand}/${input.lane}) ${Date.now() - t0}ms — ${
        winner === input.current ? "kept original" : "switched"
      }\n${table}`
    );

    return {
      headline: winner,
      candidates: rows.map((row, i) => ({
        text: row.text,
        score: row.score + (i === 0 ? INCUMBENT_BONUS : 0),
      })),
    };
  } catch (err) {
    console.warn(
      `[cover-picker] ${input.label}: failed — keeping original:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
