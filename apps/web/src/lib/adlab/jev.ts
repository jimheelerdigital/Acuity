/**
 * Jev for the ads builder (2026-09-30, per Keenan: "for all adsets create
 * multiple different ad scripts that run into jev first, checks for
 * viability, and then jev returns the highest probability winners back to
 * us and then we create ads based on those. We need to make Jev part of our
 * automated learning system").
 *
 * Jev (TypeSafe System One, via OpenRouter `typesafe/jev-1.13`) answers
 * typed questions about a state with calibrated probabilities: noul
 * (yes/no → P(yes)), choice, score (ordered levels). It never writes;
 * Claude writes the drafts, Jev judges them.
 *
 * FAIL OPEN: any error, timeout or missing OPENROUTER_API_KEY returns null
 * and the batch behaves exactly as before Jev (first draft per slot).
 * Same question/answer shape as lib/content-factory/jev.ts (TypeSafe
 * direct), so the two can merge once both are settled.
 */
const TIMEOUT_MS = 15_000;

/**
 * Key + endpoint (2026-09-30): Keenan's key may arrive as OPENROUTER_API_KEY
 * or as JEV_API_KEY (the content factory's name). OpenRouter keys start with
 * "sk-or-" and go to OpenRouter's decisions endpoint; any other key is a
 * TypeSafe key and goes to TypeSafe's own endpoint. Same request/response.
 */
function jevTarget(): { key: string; endpoint: string; model: string } | null {
  const key = process.env.OPENROUTER_API_KEY || process.env.JEV_API_KEY || "";
  if (!key) return null;
  if (key.startsWith("sk-or-")) {
    return { key, endpoint: "https://openrouter.ai/api/alpha/decisions", model: process.env.JEV_OPENROUTER_MODEL || "typesafe/jev-1.13" };
  }
  return { key, endpoint: "https://api.typesafe.ai/v1/systemone", model: process.env.JEV_MODEL || "jev-latest" };
}

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number; cost?: number };
}

export function adsJevEnabled(): boolean {
  return !!jevTarget() && process.env.JEV_DISABLED !== "1";
}

export async function askAdsJev(
  purpose: string,
  state: unknown,
  questions: Record<string, JevQuestion>
): Promise<JevResult | null> {
  const target = jevTarget();
  if (!target || process.env.JEV_DISABLED === "1" || Object.keys(questions).length === 0) return null;
  const start = Date.now();
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(target.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: target.model, state, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        break;
      }
      const json = (await res.json()) as JevResult;
      void logJev(purpose, Date.now() - start, json.usage ?? null, null);
      return json;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  console.warn(`[adlab-jev] ${purpose} failed — failing open: ${lastErr}`);
  void logJev(purpose, Date.now() - start, null, lastErr);
  return null;
}

async function logJev(purpose: string, durationMs: number, usage: JevResult["usage"] | null, error: string | null) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.claudeCallLog.create({
      data: {
        purpose: `jev:adlab:${purpose}`,
        model: "jev",
        tokensIn: usage?.input_tokens ?? 0,
        tokensOut: usage?.output_tokens ?? 0,
        costCents: Math.round((usage?.cost ?? 0) * 100),
        durationMs,
        success: !error,
        errorMessage: error,
      },
    });
  } catch {}
}

export function noulOf(r: JevResult | null, key: string): number | null {
  const a = r?.answers?.[key];
  return a && a.type === "noul" ? a.noul : null;
}

/** Score normalized to 0..1 (0 = first level, 1 = last). */
export function scoreOf(r: JevResult | null, key: string): number | null {
  const a = r?.answers?.[key];
  if (!a || a.type !== "score") return null;
  const levels = Object.keys(a.legend ?? {}).length;
  return levels > 1 ? a.score / (levels - 1) : a.score;
}
