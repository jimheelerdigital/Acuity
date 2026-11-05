import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Quick debrief analysis (2026-11-05, Keenan: "we should have the initial
 * debrief results within 10sec or less and then get more info from the
 * transcript after the fact").
 *
 * Writes only what the first results screen shows: summary, the "Ripple
 * noticed" line, themes and to-dos. The full extraction
 * (pipeline.ts extractFromTranscript) fills in everything else later and
 * must not rewrite these fields. Spec:
 * docs/jimmy-spec-2026-11-05-fast-first-results.md.
 *
 * Not wired into any live path yet; used by the admin bench route only.
 */

export const QUICK_DEBRIEF_MODEL = "claude-haiku-4-5";

const MAX_THEMES = 4;
const MAX_TASKS = 6;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 20_000,
  maxRetries: 1,
});

export const QUICK_DEBRIEF_SYSTEM = `You are Ripple. Someone just recorded a voice debrief: they talked through what's on their mind. Read the transcript and return ONLY a JSON object, no markdown:

{
  "summary": "2 sentences written to them (use 'you'). Name what is really going on for them, in plain words, using their specifics.",
  "pullQuote": "One short sentence Ripple noticed: a pattern, tension or need under what they said. Not a recap of the summary.",
  "themes": ["1-3 word theme"],
  "tasks": [{ "title": "a to-do they actually said they need or want to do" }]
}

Rules:
- Be warm, specific and on their side. Show what's really going on; never lecture or give advice.
- Never diagnose, label a condition, or suggest therapy or treatment.
- Don't mention a time of day.
- themes: up to ${MAX_THEMES}, short labels from what they talked about. Use [] if the debrief is too thin.
- tasks: only things they said they need or want to do, as short actionable titles. Never invent tasks. [] if none.
- If the transcript is very short, keep the summary to what they actually said.`;

export interface QuickDebrief {
  summary: string | null;
  pullQuote: string | null;
  themes: string[];
  tasks: { title: string }[];
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function parseQuickDebrief(raw: string): QuickDebrief | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
  const summary = str(parsed.summary, 600);
  if (!summary) return null;
  const pullQuote = str(parsed.pullQuote, 300);
  const themes = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .map((t) => str(t, 40))
    .filter((t): t is string => !!t)
    .slice(0, MAX_THEMES);
  const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
    .map((t) => str((t as { title?: unknown } | null)?.title, 140))
    .filter((t): t is string => !!t)
    .slice(0, MAX_TASKS)
    .map((title) => ({ title }));
  return { summary, pullQuote: pullQuote && pullQuote !== summary ? pullQuote : null, themes, tasks };
}

/** Returns null when the call fails or the reply can't be parsed; callers fall back to the full extraction. */
export async function quickDebrief(
  transcript: string,
  userId?: string | null
): Promise<{ result: QuickDebrief | null; ms: number; tokensOut: number }> {
  const { loggedMessagesCreate } = await import("@/lib/claude-call-log");
  const startedAt = Date.now();
  try {
    const message = await loggedMessagesCreate(
      anthropic,
      {
        model: QUICK_DEBRIEF_MODEL,
        max_tokens: 600,
        system: QUICK_DEBRIEF_SYSTEM,
        messages: [{ role: "user", content: `Debrief transcript:\n\n${transcript}` }],
      },
      { purpose: "quick_debrief", userId: userId ?? null }
    );
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { result: parseQuickDebrief(text), ms: Date.now() - startedAt, tokensOut: message.usage.output_tokens };
  } catch {
    return { result: null, ms: Date.now() - startedAt, tokensOut: 0 };
  }
}
