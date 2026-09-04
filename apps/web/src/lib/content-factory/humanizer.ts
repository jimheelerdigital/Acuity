/**
 * Content Factory — HUMANIZER approval gate (2026-09-04, per Keenan:
 * "add all of these to our content generation. every single script must
 * pass through this first in order to be approved content").
 *
 * Pattern library vendored from https://github.com/blader/humanizer
 * (MIT), itself distilled from Wikipedia's "Signs of AI writing"
 * (WikiProject AI Cleanup). Markdown-formatting patterns (bold, lists,
 * headings, emojis) are omitted because carousel copy is plain text —
 * every prose pattern is included.
 *
 * Two layers:
 * 1. HUMAN_VOICE_RULES — a short prevention block appended to every
 *    live topic-generation system prompt so the first draft avoids the
 *    worst tells.
 * 2. humanizePass() — the gate. After a topic is generated and
 *    validated, its reader-facing strings go through one more Claude
 *    call against the FULL pattern library. Same-shape JSON comes back;
 *    the caller merges and re-validates. FAILS OPEN: if the gate call
 *    errors, the original (prompt-side-ruled) copy ships rather than
 *    killing the overnight run — the failure is logged to ClaudeCallLog.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

/**
 * Short prevention block for system prompts. The full library lives in
 * HUMANIZER_PATTERNS; this is the top-offender subset for short social
 * copy, cheap enough to ride on every generation call.
 */
export const HUMAN_VOICE_RULES = `HUMAN VOICE — HARD BANS (the copy must read like a person wrote it, never like AI):
- NEVER "It's not X. It's Y.", "not just X, but Y", "X isn't about Y, it's about Z". State the point straight.
- NO em dashes (—) or en dashes (–) anywhere. Use a period or a comma instead.
- NO fake-deep formulas: "X is the language/currency/architecture of Y", "X becomes a trap", "X is a mirror".
- NO fake-depth setups: "The real question is", "At its core", "What really matters is", "Here's the truth".
- NO forced groups of three ("No excuses. No shortcuts. No mercy."). Vary the count: two beats, or four.
- BANNED WORDS: delve, testament, tapestry, unlock, unleash, harness, elevate, empower, embrace, thrive, game-changer, journey (figurative), landscape (figurative), navigate (figurative).
- NO fake-candid openers: "Honestly?", "Let's be honest", "Here's the thing", "Real talk".
- NO generic uplift endings ("Your best days are ahead."). End on something concrete.
- Read every line aloud. If it sounds like a chatbot or a poster, rewrite it plainer.`;

/**
 * The full pattern library the gate checks against — vendored from
 * blader/humanizer SKILL.md (prose patterns only).
 */
const HUMANIZER_PATTERNS = `AI-WRITING PATTERNS TO FIND AND FIX (from Wikipedia's "Signs of AI writing"):

CONTENT PATTERNS
1. Inflated importance claims — watch: stands/serves as, is a testament/reminder, vital/crucial/pivotal/key role/moment, underscores/highlights its importance, reflects broader, symbolizing its enduring/lasting, setting the stage for, marks a shift, key turning point, evolving landscape, indelible mark, deeply rooted. Ordinary details claimed as major change or legacy.
2. Shallow -ing analysis — watch: highlighting..., underscoring..., ensuring..., reflecting..., symbolizing..., fostering..., showcasing... A tacked-on -ing phrase making a simple fact sound deep.
3. Sales language — watch: boasts a, vibrant, rich (figurative), profound, enhancing, exemplifies, commitment to, nestled, in the heart of, groundbreaking, renowned, breathtaking, stunning, must-visit.
4. Vague sources — watch: experts argue, observers have cited, some critics argue, industry reports. Claims assigned to unnamed authorities.

LANGUAGE PATTERNS
5. Overused AI words — watch: actually, additionally, align with, crucial, delve, emphasizing, enduring, enhance, fostering, garner, highlight (verb), interplay, intricate, key (adjective), landscape (abstract), pivotal, quietly, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant.
6. Avoiding "is/are/has" — watch: serves as, stands as, marks, represents, boasts, features, offers. Use the plain verb.
7. "Not X but Y" and clipped negative endings — watch: not only... but, it's not just X, it's Y, tailing fragments like "no guessing". State the claim directly.
8. Forced groups of three — ideas crammed into triads to sound complete. Break the rhythm.
9. Synonym cycling and repeated sentence openings — the same subject renamed over and over, or several sentences opening identically by rule rather than by ear.
10. False "from X to Y" ranges — X and Y that do not form a real range.
11. Passive voice and missing subjects — hidden actors. Use active voice when it is clearer.
12. Em and en dashes — the final text must contain NO em dashes (—) or en dashes (–). Replace with a period, comma, colon, or parentheses, or rewrite the sentence. Also catch spaced hyphens and double hyphens used as dashes.

CHATBOT ARTIFACTS
13. Chatbot text left in — watch: I hope this helps, Of course!, Certainly!, Would you like..., let me know, here is a...
14. Knowledge disclaimers and guesses — watch: as of [date], based on available information, it is believed that, likely [did X]. Never present a guess as fact.
15. Overly agreeable tone — praise or agreement before the point.

FILLER AND HEDGING
16. Filler phrases — "in order to" → "to", "due to the fact that" → "because", "at this point in time" → "now", "has the ability to" → "can", "it is important to note that" → cut.
17. Qualifier pileups — watch: could potentially, might arguably, in some cases it may. Keep one qualifier only when the meaning needs it.
18. Generic positive endings — vague optimism instead of a last concrete point.
19. Too many hyphenated pairs — high-quality, data-driven, real-time, long-term everywhere. Hyphenate only before a noun.

STYLE TELLS
20. Pretending to reveal a deeper truth — watch: the real question is, at its core, in reality, what really matters, fundamentally, the heart of the matter.
21. Announcing the next point — watch: let's dive in, let's break this down, here's what you need to know, quick note. State the point, never announce it.
22. Forced punchlines and stacked dramatic fragments — a row of clipped fragments for drama ("No aesthetic prior. No nostalgia. The old rules were gone."). One short sentence is emphasis; a stack is a tell.
23. Formulaic sayings — watch: X is the Y of Z, X becomes a trap, X is not a tool but a mirror, the language/currency/architecture of. Replace the saying with the specific claim.
24. Fake-candid openings — watch: Honestly?, Look, Here's the thing, Let's be honest, Real talk as standalone hooks.
25. Answering objections no one raised — watch: this isn't really about, I'm not saying, to be clear, don't get me wrong, some might say... but.
26. Rejecting fake alternatives — watch: a tempting approach would be, one might be tempted to, you might think... but. Cut the fake option; state the real point.

FALSE POSITIVES — do NOT flag: short declarative fragments used as the account's deliberate command voice; ALL-CAPS titles; deliberate repeated openings that build pressure; plain dry prose without specific tells; one short sentence for emphasis. When unsure, look for several patterns together before rewriting.`;

/**
 * The approval gate. Pass ONLY reader-facing strings (never scene /
 * coverScene image directions — churn there wastes money and can break
 * image markers). Returns the same-shape JSON with AI-pattern strings
 * rewritten; clean strings come back untouched. Throws only after
 * logging — callers are expected to catch and fail open.
 */
export async function humanizePass<T>(opts: {
  /** ClaudeCallLog purpose, e.g. "humanize:moody-topic". */
  purpose: string;
  /** The lane's VOICE line — the rewrite must stay inside this voice. */
  voice: string;
  /** JSON payload of reader-facing strings. */
  payload: T;
}): Promise<T> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      system: `You are the final approval gate for social-media copy. You receive strict JSON for one post. Find every string that shows an AI-writing pattern from the library below and rewrite it so a person could have written it. Leave clean strings EXACTLY as they are, byte for byte.

HARD CONSTRAINTS:
- Return the SAME JSON shape: same keys, same nesting, same array lengths, nothing added or removed.
- Keep every rewritten string in its role: same approximate length, same case style (ALL-CAPS stays ALL-CAPS, lowercase stays lowercase), a command stays a command, a question stays a question.
- Never add a fact, claim, number, name, or quote that was not there.
- Never change what a string says — only how it says it.
- VOICE to preserve (the rewrite must sound like this, not like neutral prose): ${opts.voice}

${HUMANIZER_PATTERNS}

Return ONLY the corrected JSON, no markdown, no commentary.`,
      messages: [{ role: "user", content: JSON.stringify(opts.payload) }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

/** Pull the VOICE line out of a lane's system prompt so the gate keeps the house voice. */
export function extractVoice(systemPrompt: string): string {
  const match = systemPrompt.match(/^VOICE:.*$/m);
  return match
    ? match[0]
    : "Short, declarative, second-person social copy. Match the existing tone of the strings exactly.";
}
