/**
 * Jev (TypeSafe System One) — the content factory's fast decision layer
 * (2026-09-30, per Keenan: "build out numbers 1-6 right now and link
 * everything").
 *
 * Jev answers typed questions about a state in ~150ms with calibrated
 * probabilities: Noul (yes/no → probability of yes), Choice (one of a
 * set → a distribution), Score (ordered levels → a weighted value). It
 * never writes copy. Sonnet writes; Jev judges and picks.
 *
 * Used by:
 *   #1 cover-picker.ts     best-of-5 cover lines, Jev scores, top one ships
 *   #2 publish-gate.ts     rank each brand's day batch, post the best ~2/3
 *   #3 humanizer.ts        yes/no screen before the Sonnet humanize pass
 *   #4 headline-history.ts near-duplicate idea check on every cover
 *   #5 reddit-trends.ts / competitor-mimic.ts  research triage
 *   #6 choice-lane.ts      Mythicals five-option diversity check
 *
 * Rules every caller follows (Jev 1.13 "jaggedness" notes):
 * - FAIL OPEN. askJev() returns null on any error, timeout or missing
 *   key, and every caller treats null as "no opinion" and behaves exactly
 *   as it did before Jev existed. Jev must never fail a lane.
 * - Keep math, counting and dates in code. Ask literal, specific
 *   questions; send only the state a question needs.
 * - Batch questions into ONE call (they are evaluated in isolation, so
 *   one call with 12 questions costs the same answers as 12 calls).
 *
 * The model sits behind this one function so it can be swapped (a Haiku
 * rubric, OpenRouter's typesafe/jev-*) without touching callers.
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.JEV_MODEL || "jev-latest";
const TIMEOUT_MS = 10_000;

export type JevQuestion =
  | {
      type: "noul";
      instructions: string | Record<string, unknown>;
      criteria?: { true?: string; false?: string };
    }
  | {
      type: "choice";
      instructions: string | Record<string, unknown>;
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions: string | Record<string, unknown>;
      /** Ordered levels, worst → best (2 to 10). */
      criteria: string[];
    };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
      legend: Record<string, string>;
    };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

/** True when a key is configured and Jev isn't switched off (JEV_DISABLED=1). */
export function jevEnabled(): boolean {
  return !!process.env.JEV_API_KEY && process.env.JEV_DISABLED !== "1";
}

/**
 * One Jev call. `purpose` is logged to ClaudeCallLog (model "jev") so
 * every decision is traceable next to the Claude calls. Returns null on
 * any failure — callers must fail open.
 */
export async function askJev(
  purpose: string,
  state: unknown,
  questions: Record<string, JevQuestion>
): Promise<JevResult | null> {
  if (!jevEnabled() || Object.keys(questions).length === 0) return null;
  const start = Date.now();
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.JEV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state, model: MODEL, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status === 529) {
        lastErr = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        break;
      }
      const json = (await res.json()) as JevResult;
      void logJev(purpose, Date.now() - start, json.usage, null);
      return json;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  console.warn(`[jev] ${purpose} failed — failing open: ${lastErr}`);
  void logJev(purpose, Date.now() - start, null, lastErr);
  return null;
}

async function logJev(
  purpose: string,
  durationMs: number,
  usage: JevResult["usage"] | null,
  error: string | null
): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.claudeCallLog.create({
      data: {
        purpose: `jev:${purpose}`,
        model: "jev",
        tokensIn: usage?.input_tokens ?? 0,
        tokensOut: usage?.output_tokens ?? 0,
        costCents: 0,
        durationMs,
        success: !error,
        errorMessage: error,
      },
    });
  } catch {
    // Logging must never matter.
  }
}

/** Probability of yes for a Noul answer, or null. */
export function noulOf(r: JevResult | null, key: string): number | null {
  const a = r?.answers?.[key];
  return a && a.type === "noul" ? a.noul : null;
}

/**
 * A Score answer normalized to 0..1 (0 = first level, 1 = last), or null.
 * Levels count comes from the legend so callers don't repeat it.
 */
export function scoreOf(r: JevResult | null, key: string): number | null {
  const a = r?.answers?.[key];
  if (!a || a.type !== "score") return null;
  const levels = Object.keys(a.legend ?? {}).length;
  return levels > 1 ? a.score / (levels - 1) : a.score;
}

/** A Choice answer's winner and its probability, or null. */
export function choiceOf(
  r: JevResult | null,
  key: string
): { choice: string; p: number; confidence: number } | null {
  const a = r?.answers?.[key];
  if (!a || a.type !== "choice") return null;
  return {
    choice: a.choice,
    p: a.probabilities?.[a.choice] ?? 0,
    confidence: a.confidence,
  };
}

/** Standard 5-level rubrics shared across callers, so scores are comparable. */
export const SCROLL_STOP_LEVELS = [
  "The target reader would scroll straight past it: generic, vague, or confusing",
  "Mildly interesting but forgettable; seen a hundred like it",
  "Decent: clear and relevant, but not surprising or specific",
  "Strong: specific and relevant enough that the target reader would stop and open it",
  "Exceptional: the target reader would stop instantly and feel it was written about them",
];

export const SAVE_SEND_LEVELS = [
  "Nothing worth saving, sending or commenting on",
  "Slight: pleasant but nobody would act on it",
  "Some: a few readers might save it or tag someone",
  "Good: many target readers would save it, send it or comment",
  "Very high: the target reader would save it, send it to a specific person, and comment",
];
