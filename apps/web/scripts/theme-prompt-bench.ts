/**
 * Phase 2 prompt-iteration harness for theme extraction.
 *
 * Pulls the same 20-entry sample from production (random recent
 * COMPLETE entries with their FULL transcripts), runs each through
 * a list of prompt versions in parallel, and emits a side-by-side
 * report. Does NOT touch the live extraction pipeline; reads only.
 *
 * Run:
 *   cd apps/web
 *   npx tsx -r dotenv/config scripts/theme-prompt-bench.ts dotenv_config_path=.env.local
 *
 * Outputs to stdout (JSON) — pipe to a file. Reading the result back
 * into the markdown report is a separate step.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { CLAUDE_MODEL } from "@acuity/shared";

const prisma = new PrismaClient();
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// ─── Prompt versions ────────────────────────────────────────────────

/**
 * V0 — the existing prompt's theme guidance (extracted verbatim from
 * apps/web/src/lib/pipeline.ts:165 + the schema spec). Used as the
 * baseline. We send only the theme-relevant subset of the schema —
 * other fields (tasks, goals, lifeAreas) are out of scope here.
 */
const V0_BASELINE = `You are Acuity's extraction engine. Analyse the user's nightly voice debrief and return a JSON object with this exact schema:

{
  "themes": [
    { "label": "short theme (1-3 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Guidelines:
- Keep theme labels short (1-3 words). Per-theme sentiment reflects the user's emotional framing of that specific theme in this entry: POSITIVE if they expressed satisfaction/progress, NEGATIVE if strain/frustration, NEUTRAL if they mentioned it factually without strong valence. Up to 5 themes per entry.

Return ONLY valid JSON. No markdown, no prose.`;

/**
 * V1 — first iteration. Reframe themes as DISPOSITIONAL PATTERNS that
 * recur across entries, with explicit examples of bad event-level
 * labels and good pattern-level ones. Cap at 3 themes (not 5) to
 * force abstraction.
 */
const V1_PATTERN_FIRST = `You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief and identify the DISPOSITIONAL PATTERNS underneath the surface events.

A pattern is something that would plausibly recur across many of this user's future entries about different topics. It captures HOW the user relates to the world, not WHAT happened today.

GOOD pattern labels (dispositional, recurring):
- "things outside my control"
- "spectatorship vs doing"
- "decision avoidance"
- "morning clarity"
- "presence with family"
- "defending my calendar"
- "small wins compounding"

BAD labels (event-level, won't recur):
- "Celtics game" (this is what happened, not a pattern)
- "anniversary dinner" (an event, not a disposition)
- "demo no-shows" (a specific situation)
- "leg day reluctance" (today's hesitation, not a pattern)
- "nice weather" (an entity)
- "after-work plans" (a specific event)

Return JSON in this exact schema:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Rules:
- 1-3 themes per entry. Fewer is better. If only one pattern is clear, return one.
- Each label must answer: "Could this label show up tomorrow on an entry about a totally different topic?" If no, it's an event, not a pattern.
- Sentiment reflects the user's relationship to the pattern in this specific entry: POSITIVE if it's a strength they're leaning into, NEGATIVE if it's a friction they're frustrated by, NEUTRAL if mentioned without strong valence.
- Prefer the abstract over the literal. "Anniversary dinner" → "presence with family" or "shared rituals". "Demo no-shows" → "things outside my control" or "rejection without explanation".

Return ONLY valid JSON. No markdown, no prose.`;

/**
 * V2 — adds a two-step think-aloud structure: "name the surface event
 * in one phrase, then name the underlying pattern". The surface event
 * gets discarded; only the pattern is returned. Hypothesis: forcing
 * Claude to articulate the event-level reading first makes it easier
 * to step past it.
 */
const V2_TWO_STEP = `You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief.

For each candidate theme, do two steps INTERNALLY before deciding:

1. SURFACE: name the specific event/situation in one short phrase (e.g. "Celtics lost", "demo no-shows", "anniversary dinner").
2. PATTERN: name the dispositional pattern under it — something that would recur across this user's other entries about totally different topics (e.g. "things outside my control", "presence with people", "rejection without explanation").

Return ONLY the patterns. Discard the surface phrases.

A pattern is dispositional and recurring: it captures HOW the user relates to the world, not WHAT happened today. If you can't articulate a pattern under a surface event, drop the candidate — don't return the surface event as a theme.

GOOD pattern labels:
- "things outside my control"
- "spectatorship vs doing"
- "decision avoidance"
- "presence with family"
- "defending my calendar"
- "small wins compounding"
- "rejection without explanation"

BAD labels (these are surface events, never return them as themes):
- "Celtics game"
- "anniversary dinner"
- "demo no-shows"
- "leg day reluctance"
- "nice weather"
- "after-work plans"
- "product launch"

Return JSON:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Rules:
- 1-3 themes. Fewer is better. Empty array is fine if no clear pattern emerged.
- Sentiment: POSITIVE if it's a strength the user is leaning into, NEGATIVE if friction, NEUTRAL otherwise.
- Use lowercase labels except for proper-noun-like patterns. Prefer noun phrases or "X vs Y" framings.

Return ONLY valid JSON.`;

/**
 * V3 — adds a "recurrence test" the model must pass for each theme,
 * and explicit instructions for short/sparse entries (where a single
 * pattern or an empty array is correct).
 */
const V3_RECURRENCE_TEST = `You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief and identify the dispositional patterns underneath.

A pattern is something that would plausibly recur in this user's future entries about different topics. Patterns are about HOW the user shows up — disposition, posture, recurring tension or strength — not WHAT happened today.

Internal two-step (don't include in output):
1. Surface: what literally happened today (1 short phrase).
2. Pattern: the dispositional reading of that event (2-5 words).

For every candidate pattern, apply the RECURRENCE TEST: "Could this same label honestly fit an entry six months from now about a completely different domain (e.g. work, family, health, hobbies)?" If the answer is no, drop the candidate.

Examples of patterns that pass the recurrence test:
- "things outside my control"
- "spectatorship vs doing"
- "decision avoidance"
- "presence with family"
- "defending my calendar"
- "small wins compounding"
- "rejection without explanation"
- "morning clarity"
- "showing up tired"

Examples that FAIL the recurrence test (do not return):
- "Celtics game" — sport-specific, won't recur
- "anniversary dinner" — single event
- "demo no-shows" — specific situation
- "leg day reluctance" — today's hesitation, not a pattern
- "nice weather" — entity
- "after-work plans" — specific plan
- "product launch" — specific milestone
- "martial arts" — domain/hobby, not a disposition
- "self-awareness" — too generic; reframe as the specific awareness ("seeing my own avoidance", "noticing when I'm performing")

Sparse entries: if the entry is one sentence ("six hours, choppy"), one pattern is fine — or zero, if no clear disposition emerges. Don't pad to fill a quota.

Return JSON:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Rules:
- 0-3 themes per entry. Empty array IS valid output.
- Sentiment: POSITIVE = strength being leaned into; NEGATIVE = friction/frustration with the pattern; NEUTRAL = mentioned without strong valence.
- Lowercase except where a proper noun is genuinely required (rare).

Return ONLY valid JSON.`;

/**
 * V4 — V3 plus three tightening rules:
 * 1. Prefer canonical SHAPES that recur cleanly across entries
 *    ("X compounding", "Y without explanation", "Z over W", "defending K",
 *    "presence with M", "rules I break"). These reuse across users
 *    and across topics.
 * 2. Never use proper names (people, places, products) as labels —
 *    those are entities, not patterns. Replace with the role they play.
 * 3. Cap at 2 themes. If only one is plausible, return one. If none,
 *    return empty array. No padding.
 */
const V4_CANONICAL_SHAPES = `You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief and identify the dispositional patterns underneath.

A pattern is something that would plausibly recur across this user's future entries about completely different topics. Patterns describe HOW the user shows up — disposition, posture, recurring tension or strength — not WHAT happened today.

Internal two-step (do not include in output):
1. Surface: what literally happened today (1 short phrase).
2. Pattern: the dispositional reading — apply the RECURRENCE TEST: "Could this same label honestly fit an entry six months from now about a completely different domain?" If no, drop the candidate.

Prefer these CANONICAL SHAPES — they describe dispositions and recur cleanly across users and topics:
- "X compounding" / "X compounding into Y" — small disciplined acts adding up
- "Y without explanation" — receiving outcomes without closure
- "Z over W" — choosing one orientation over another ("connection over performance", "presence over productivity", "clarity over cleverness")
- "defending K" — protecting time, energy, or attention from drift
- "presence with M" — being undivided with people
- "rules I break for myself" / "rules I break repeatedly" — gap between intent and action
- "X as Y lever" — recognizing what changes what ("sleep as performance lever", "movement as cognitive fuel")
- "noticing what restores me" / "noticing my own avoidance" — meta-awareness of self-state
- "intention without follow-through" — recurring inability to execute on stated plans
- "showing up tired" / "showing up scattered" — recurring posture under load

You are not limited to these shapes — they're examples of dispositional, reusable framings. New patterns are fine if they pass the recurrence test.

DO NOT return:
- Proper names of people, places, products, sports, hobbies, or domains. "Celtics", "Briarwood", "Keenan", "golf", "karate", "demo", "anniversary" are entities — they belong in entity extraction (a separate pipeline), not in themes.
- Today-specific phrases. "Demo no-shows", "leg day reluctance", "anniversary dinner", "nice weather" are events. Drop them.
- Generic abstractions like "self-awareness", "productivity", "wellbeing". Reframe as the specific dispositional posture ("noticing my own performing", "reactive vs deep work").

Return JSON:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Hard rules:
- 0-2 themes per entry. If only one pattern is clearly present, return one. If no clear pattern emerged (very sparse entry, single-line content), return an empty array. Never pad.
- Sentiment: POSITIVE = a strength being leaned into; NEGATIVE = friction or frustration with the pattern; NEUTRAL = mentioned without strong valence.
- Lowercase labels except where genuinely required by grammar.
- Prefer reusing the canonical shapes above when they fit. Reuse is the goal — patterns that show up across many entries are the entire point of the system.

Return ONLY valid JSON. No markdown, no prose.`;

/**
 * V5 — final candidate. Merges V3's structure (two-step extraction,
 * recurrence test, 0-3 themes per entry) with V4's two strongest
 * additions: the canonical-shapes block and the explicit no-proper-
 * names rule. Restores multi-theme output for rich entries (V4 went
 * too sparse — losing valid second-pattern signals like "presence
 * with family" + "intention without follow-through" from a single
 * anniversary entry).
 */
const V5_FINAL = `You are Acuity's pattern-extraction engine. Read the user's nightly voice debrief and identify the dispositional patterns underneath.

A pattern is something that would plausibly recur across this user's future entries about completely different topics. Patterns describe HOW the user shows up — disposition, posture, recurring tension or strength — not WHAT happened today.

Internal two-step (do not include in output):
1. Surface: what literally happened today (1 short phrase).
2. Pattern: the dispositional reading. Apply the RECURRENCE TEST: "Could this same label honestly fit an entry six months from now about a completely different domain (e.g. work vs family vs health vs hobbies)?" If no, drop the candidate.

Prefer these CANONICAL SHAPES — they describe dispositions and recur cleanly across users and topics:
- "X compounding" / "X compounding into Y" — small disciplined acts adding up
- "Y without explanation" / "Y without closure" — receiving outcomes without clarity
- "Z over W" — choosing one orientation over another ("connection over performance", "presence over productivity", "clarity over cleverness", "reactive over deep work")
- "defending K" — protecting time, energy, or attention from drift
- "presence with M" — being undivided with people
- "rules I break for myself" / "rules I break repeatedly" — gap between intent and action
- "X as Y lever" — recognizing what changes what ("sleep as performance lever", "movement as cognitive fuel")
- "noticing what restores me" / "noticing my own avoidance" — meta-awareness of self-state
- "intention without follow-through" — recurring inability to execute on stated plans
- "showing up tired" / "showing up scattered" — recurring posture under load

You are not limited to these shapes — they're examples of dispositional, reusable framings. New patterns are fine if they pass the recurrence test and would describe a disposition rather than an event.

DO NOT return:
- Proper names of people, places, products, sports, hobbies, or domains. "Celtics", "Briarwood", "Keenan", "Mike", "golf", "karate", "demo", "anniversary" are entities — they belong in entity extraction (a separate pipeline), not in themes. If a person's name comes to mind, replace with the role they play in the pattern ("confronting a colleague" → "asserting a boundary").
- Today-specific phrases. "Demo no-shows", "leg day reluctance", "anniversary dinner", "nice weather" are events. Drop them.
- Generic abstractions like "self-awareness", "productivity", "wellbeing", "fulfillment". Reframe as the specific dispositional posture ("noticing my own performing", "reactive over deep work").

Return JSON:

{
  "themes": [
    { "label": "dispositional pattern (2-5 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ]
}

Rules:
- 0-3 themes per entry. Two themes is common when the entry is rich enough to expose a disposition + a recurring tension. One theme is fine for sparse entries. Empty array IS valid output for a single-line entry where no pattern emerges. Never pad to fill a quota.
- Sentiment: POSITIVE = a strength being leaned into; NEGATIVE = friction or frustration with the pattern; NEUTRAL = mentioned without strong valence.
- Lowercase labels except where genuinely required by grammar.
- Reuse is the goal — when a familiar pattern fits, prefer the familiar phrasing over inventing a new one.

Return ONLY valid JSON. No markdown, no prose.`;

const PROMPTS: { id: string; system: string }[] = [
  { id: "V0_baseline", system: V0_BASELINE },
  { id: "V3_recurrence_test", system: V3_RECURRENCE_TEST },
  { id: "V4_canonical_shapes", system: V4_CANONICAL_SHAPES },
  { id: "V5_final", system: V5_FINAL },
];

// ─── Sample loader ──────────────────────────────────────────────────

const SAMPLE_IDS = [
  "cmohsluf",
  "cmohslr4",
  "cmohslrh",
  "cmobhgk9",
  "cmohslvm",
  "cmohslsy",
  "cmohslpz",
  "cmohslxv",
  "cmo97vkc",
  "cmoblypd",
  "cmohslzs",
  "cmohsm0l",
  "cmohslu2",
  "cmohslqd",
  "cmohsltb",
  "cmoeowaj",
  "cmohslru",
  "cmobxar8",
  "cmohslxi",
  "cmohsluv",
];

async function loadSample() {
  // SAMPLE_IDs are the 8-char prefixes from Phase 1. Resolve to full
  // ids by prefix-matching on cuid.
  const candidates = await prisma.entry.findMany({
    where: {
      status: "COMPLETE",
      OR: SAMPLE_IDS.map((p) => ({ id: { startsWith: p } })),
    },
    select: {
      id: true,
      createdAt: true,
      transcript: true,
      summary: true,
      themes: true,
    },
  });
  return candidates.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

// ─── Per-prompt extraction ──────────────────────────────────────────

type ThemeOut = { label: string; sentiment: string };

async function runPrompt(
  systemPrompt: string,
  transcript: string,
  todayISO: string
): Promise<ThemeOut[]> {
  const userMessage = `Today's date: ${todayISO}\n\nTranscript:\n${transcript}`;
  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Strip code fences if Claude added them despite the rules.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.themes)) {
      return parsed.themes
        .filter(
          (t: unknown): t is ThemeOut =>
            !!t &&
            typeof t === "object" &&
            typeof (t as ThemeOut).label === "string"
        )
        .map((t: ThemeOut) => ({
          label: t.label,
          sentiment: (t.sentiment ?? "NEUTRAL").toUpperCase(),
        }));
    }
    return [];
  } catch (e) {
    return [{ label: `__PARSE_ERROR__: ${cleaned.slice(0, 80)}`, sentiment: "" }];
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const entries = await loadSample();
  if (entries.length === 0) {
    console.error("No sample entries found");
    process.exit(1);
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  // Run all prompts × all entries in parallel. 20 entries × 4 prompts
  // = 80 calls. Anthropic rate limit on tier 1 is 50 RPM, so cap
  // concurrency at 10.
  const tasks: Array<Promise<{
    entryId: string;
    promptId: string;
    themes: ThemeOut[];
  }>> = [];

  for (const e of entries) {
    for (const p of PROMPTS) {
      tasks.push(
        (async () => {
          try {
            const themes = await runPrompt(
              p.system,
              e.transcript ?? e.summary ?? "",
              todayISO
            );
            return { entryId: e.id.slice(0, 8), promptId: p.id, themes };
          } catch (err) {
            return {
              entryId: e.id.slice(0, 8),
              promptId: p.id,
              themes: [
                {
                  label: `__ERROR__: ${(err as Error).message.slice(0, 80)}`,
                  sentiment: "",
                },
              ],
            };
          }
        })()
      );
    }
  }

  // Throttle: chunk tasks into groups of 8 sequential.
  const results: Array<{
    entryId: string;
    promptId: string;
    themes: ThemeOut[];
  }> = [];
  for (let i = 0; i < tasks.length; i += 8) {
    const batch = tasks.slice(i, i + 8);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  // Pivot into per-entry rows.
  const byEntry: Record<
    string,
    {
      date: string;
      transcript: string;
      summary: string;
      currentThemes: string[];
      runs: Record<string, ThemeOut[]>;
    }
  > = {};

  for (const e of entries) {
    const id8 = e.id.slice(0, 8);
    byEntry[id8] = {
      date: e.createdAt.toISOString().slice(0, 10),
      transcript: e.transcript ?? "",
      summary: e.summary ?? "",
      currentThemes: e.themes ?? [],
      runs: {},
    };
  }

  for (const r of results) {
    if (byEntry[r.entryId]) {
      byEntry[r.entryId]!.runs[r.promptId] = r.themes;
    }
  }

  console.log(JSON.stringify({ todayISO, model: CLAUDE_MODEL, byEntry }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
