/**
 * Day 14 Life Audit prompt — the flagship AI output that every user
 * reads at the end of their trial and that the paywall transition
 * lives inside.
 *
 * IMPLEMENTATION_PLAN_PAYWALL.md §4.1 (closing-paragraph few-shot) +
 * §5.1 (generation flow). Runs on claude-opus-4-7; the few-shot is
 * ~350 tokens and the rest of the input is the user's 14-day entry
 * stream (summaries + themes, NOT transcripts — we keep raw text out
 * of the prompt for privacy + cost).
 *
 * The structured output schema matches the LifeAudit Prisma columns:
 *   { narrative, closingLetter, themesArc, moodArc }
 */

export interface LifeAuditExtraction {
  narrative: string;
  closingLetter: string;
  themesArc: {
    starting: string[];
    emerging: string[];
    fading: string[];
  };
  moodArc: string;
}

export interface LifeAuditEntryInput {
  entryDate: Date;
  summary: string | null;
  mood: string | null;
  moodScore: number | null;
  themes: string[];
  wins: string[];
  blockers: string[];
}

export const LIFE_AUDIT_SYSTEM_PROMPT = `You are Acuity's Life Audit writer. After 14 nights of voice journal entries, you produce a long-form reflective letter that names the pattern only the user themselves could have produced.

Voice:
- Second-person ("you" / "your"), never first-person.
- A thoughtful friend reflecting back what they noticed, not a coach pushing.
- Specific over general — if you reference a pattern, quote the user's own themes or wins or blockers. No vague encouragement.
- Earned, not effusive. Their 14 days of honesty earned this letter; match that seriousness.

Do NOT:
- Use exclamation marks.
- Use the words "subscribe", "upgrade", "paywall", "plan", or "$".
- Use bullet points in the narrative body. (They're OK in the themesArc arrays, which are data, not prose.)
- Describe product features ("Month 2 unlocks…"). Describe what the user would experience.
- Use second-person imperatives in the closing ("Keep going!", "Don't stop now").

Output structure (return ONLY this JSON — no markdown, no preamble):

{
  "narrative": "~800-1100 words of long-form reflective prose covering: (a) what the shape of the 14 days looked like, (b) the 2-4 themes that recurred most, (c) the single pattern that most defines these two weeks, (d) a What-comes-next closing that follows the few-shot below.",
  "closingLetter": "Just the 'What comes next' section from narrative, duplicated here verbatim. It must end with 'Continue it →' on its own line.",
  "themesArc": {
    "starting": ["2-4 themes that dominated the first third of the 14 days"],
    "emerging": ["2-4 themes that surfaced in the middle / final third"],
    "fading": ["2-4 themes that started strong and tapered off"]
  },
  "moodArc": "One sentence describing the emotional trajectory. Example: 'Started rough but landed steady — the middle of week 2 was the turning point.'"
}

The 'What comes next' closing has four jobs, in this order:

  1. Name the single pattern that most defines the user's 14 days, in one sentence.
  2. Observe that this pattern is only legible because they have been honest for two weeks, and that the next month is where it either deepens or quietly breaks.
  3. Preview Month 2 concretely — their first Monthly Memoir on day 30, weekly reports that sharpen because they have something to compare against, and a 60-day retrospective that puts Day 1 and Day 60 side by side.
  4. Close with an invitation framed as a continuation, not a gate. End with the literal phrase "Continue it →" on its own line.

Use the example below as a pattern for voice, cadence, and length. Do NOT reuse its specific content (the blocker-naming observation is from a different user). Write the closing from THIS user's actual entries.

<example user_pattern="The days they name the blocker out loud are the days they move">
**What comes next**

The thing that kept surfacing across your 14 days is that the days you name the
blocker out loud are the days you move. That's only visible because you sat with
this every night for two weeks — and it's the sort of pattern that either deepens
or quietly breaks in the next thirty days.

If you keep going, Month 2 is where the model starts to know your rhythm. Day 30
is your first Monthly Memoir — the long-form version of what you just read. Weekly
reports get sharper because they have something to compare against. Day 60 is a
retrospective: Day 1 beside Day 60, your themes then and now, the words you've
started using that you didn't two months ago.

This was the beginning of the record.

Continue it →
</example>`;

/**
 * Build the user-side message given the user's trial entries. The
 * entries come in chronologically; the prompt relies on that order
 * so the narrative's sense of arc matches reality.
 */
export function buildLifeAuditUserMessage(
  entries: LifeAuditEntryInput[],
  periodStart: Date,
  periodEnd: Date
): string {
  const entryLines = entries
    .map((e, i) => {
      const date = new Date(e.entryDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const moodLine = `Mood: ${e.mood ?? "—"}${
        e.moodScore != null ? ` (${e.moodScore}/10)` : ""
      }`;
      return [
        `Day ${i + 1} (${date})`,
        `  ${moodLine}`,
        e.summary ? `  Summary: ${e.summary}` : null,
        e.themes.length ? `  Themes: ${e.themes.join(", ")}` : null,
        e.wins.length ? `  Wins: ${e.wins.join("; ")}` : null,
        e.blockers.length ? `  Blockers: ${e.blockers.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const header = [
    `14-day trial window: ${periodStart.toLocaleDateString()} — ${periodEnd.toLocaleDateString()}`,
    `${entries.length} entries across ${daysBetween(periodStart, periodEnd)} days`,
  ].join("\n");

  return `${header}\n\n${entryLines}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(
    1,
    Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  );
}

/**
 * Minimum entries required to produce a meaningful audit. Below this,
 * the real generator rejects the request (status=FAILED with a
 * specific errorMessage) rather than producing a thin narrative.
 */
export const MIN_ENTRIES_FOR_AUDIT = 7;

/**
 * Hard-coded closing paragraph for the degraded fallback (no Claude
 * call). IMPLEMENTATION_PLAN_PAYWALL §7.3 — voice matched to the
 * few-shot so a user comparing two audits wouldn't notice the drop.
 */
export const DEGRADED_CLOSING = `**What comes next**

Across your fourteen days, a few things kept coming up — you can see them in the themes above. That's the thing about two weeks of honest notes: patterns start to surface whether you're looking for them or not. The next month is where those patterns either deepen into something you can work with, or quietly break apart.

If you keep going, Month 2 is where the record starts to compound. Day 30 is your first Monthly Memoir — a longer-form version of what you just read. Weekly reports get sharper because they have something to compare against. And on Day 60, there's a retrospective that puts your first day beside your sixtieth, side by side.

This was the beginning of the record.

Continue it →`;

/**
 * Produce a template-based narrative for the degraded fallback when
 * Claude has failed after all retries. Deterministic — no external
 * calls. IMPLEMENTATION_PLAN_PAYWALL §7.3.
 */
export function buildDegradedAudit(input: {
  entries: LifeAuditEntryInput[];
  periodStart: Date;
  periodEnd: Date;
}): LifeAuditExtraction {
  const { entries, periodStart, periodEnd } = input;
  const themeFrequency = new Map<string, number>();
  let moodSum = 0;
  let moodCount = 0;
  const wins: string[] = [];
  const blockers: string[] = [];

  for (const e of entries) {
    for (const t of e.themes) {
      themeFrequency.set(t, (themeFrequency.get(t) ?? 0) + 1);
    }
    if (e.moodScore != null) {
      moodSum += e.moodScore;
      moodCount++;
    }
    wins.push(...e.wins);
    blockers.push(...e.blockers);
  }

  const topThemes = Array.from(themeFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([theme]) => theme);
  const moodAvg = moodCount > 0 ? moodSum / moodCount : 5;

  const narrative = [
    `Across your fourteen days, you recorded ${entries.length} entries. That's the record itself — not the audit yet, just the fact that you showed up on ${entries.length} nights in a row to say out loud what was going on.`,
    "",
    `The themes that kept surfacing were ${formatList(topThemes.slice(0, 4))}. On the mood side, your average across the window sat around ${moodAvg.toFixed(1)}/10 — not a number to feel good or bad about, just the baseline that Month 2 will have something to compare against.`,
    "",
    wins.length
      ? `The wins you named, in the order they came up: ${formatList(wins.slice(0, 6))}.`
      : "",
    blockers.length
      ? `The blockers you named, in the order they came up: ${formatList(blockers.slice(0, 6))}.`
      : "",
    "",
    DEGRADED_CLOSING,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    narrative,
    closingLetter: DEGRADED_CLOSING,
    themesArc: {
      starting: topThemes.slice(0, 3),
      emerging: topThemes.slice(3, 5),
      fading: [],
    },
    moodArc: moodAvg >= 7
      ? "Mostly steady with an upward lean across the two weeks."
      : moodAvg >= 5
        ? "A mixed two weeks — some harder stretches, some lighter ones."
        : "Heavier than usual across the window; the honest-record itself is worth something.",
  };
}

function formatList(items: string[]): string {
  if (items.length === 0) return "nothing specific";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
