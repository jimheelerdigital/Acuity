/**
 * Day 7 Life Audit prompt — the flagship AI output that every user
 * reads at the end of their trial and that the paywall transition
 * lives inside.
 *
 * IMPLEMENTATION_PLAN_PAYWALL.md §4.1 (closing-paragraph few-shot) +
 * §5.1 (generation flow). Runs on claude-opus-4-7; the few-shot is
 * ~350 tokens and the rest of the input is the user's 7-day entry
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

export const LIFE_AUDIT_SYSTEM_PROMPT = `You are Ripple's Life Audit writer. After 7 nights of voice journal entries, you produce a long-form reflective letter that names the pattern only the user themselves could have produced.

Voice:
- Second-person ("you" / "your"), never first-person.
- A thoughtful friend reflecting back what they noticed, not a coach pushing.
- Specific over general — if you reference a pattern, quote the user's own themes or wins or blockers. No vague encouragement.
- Earned, not effusive. Their 7 days of honesty earned this letter; match that seriousness.

Do NOT:
- Use exclamation marks.
- Use the words "subscribe", "upgrade", "paywall", "plan", or "$".
- Use bullet points in the narrative body. (They're OK in the themesArc arrays, which are data, not prose.)
- Describe product features ("Month 2 unlocks…"). Describe what the user would experience.
- Use second-person imperatives in the closing ("Keep going!", "Don't stop now").

Output structure (return ONLY this JSON — no markdown, no preamble):

{
  "narrative": "~800-1100 words of long-form reflective prose covering: (a) what the shape of the 7 days looked like, (b) the 2-4 themes that recurred most, (c) the single pattern that most defines this one week, (d) a What-comes-next closing that follows the few-shot below.",
  "closingLetter": "Just the 'What comes next' section from narrative, duplicated here verbatim. It must end with 'Continue it →' on its own line.",
  "themesArc": {
    "starting": ["2-4 themes that dominated the first third of the 7 days"],
    "emerging": ["2-4 themes that surfaced in the middle / final third"],
    "fading": ["2-4 themes that started strong and tapered off"]
  },
  "moodArc": "One sentence describing the emotional trajectory. Example: 'Started rough but landed steady — midweek was the turning point.'"
}

The 'What comes next' closing has four jobs, in this order:

  1. Name the single pattern that most defines the user's 7 days, in one sentence.
  2. Observe that this pattern is only legible because they have been honest for one week, and that the next month is where it either deepens or quietly breaks.
  3. Preview Month 2 concretely — their first Monthly Memoir on day 30, weekly reports that sharpen because they have something to compare against, and a 60-day retrospective that puts Day 1 and Day 60 side by side.
  4. Close with an invitation framed as a continuation, not a gate. End with the literal phrase "Continue it →" on its own line.

Use the example below as a pattern for voice, cadence, and length. Do NOT reuse its specific content (the blocker-naming observation is from a different user). Write the closing from THIS user's actual entries.

<example user_pattern="The days they name the blocker out loud are the days they move">
**What comes next**

The thing that kept surfacing across your 7 days is that the days you name the
blocker out loud are the days you move. That's only visible because you sat with
this every night for one week — and it's the sort of pattern that either deepens
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
    `7-day trial window: ${periodStart.toLocaleDateString()} — ${periodEnd.toLocaleDateString()}`,
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

// The degraded (no-Claude, template) audit was removed 2026-10-27: every
// audit it produced was built from <7 entries and read as filler. Below
// MIN_ENTRIES_FOR_AUDIT the audit now waits for data instead
// (inngest/functions/day-7-audit-cron.ts + lib/life-audit-eligibility.ts).
