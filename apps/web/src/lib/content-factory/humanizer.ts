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
 * 2. humanizePass() — was a Claude rewrite pass over every post; since
 *    2026-09-30 it no longer rewrites anything (see below). It is now a
 *    deterministic dash fix plus a Jev flag-only check that sends bad
 *    copy back to the writer.
 */

/**
 * Prompt block appended to every writer. Cut to the two locked style rules
 * on 2026-09-30 (Keenan: the humanizer is "making our posts sound less sharp
 * and more dumb"). The old block banned punchy fragment stacks, triads and
 * contrasts, which flattened the voice; writers now follow their lane's own
 * voice. HUMANIZER_PATTERNS below is kept for reference only; nothing uses it.
 */
export const HUMAN_VOICE_RULES = `STYLE LOCKS: no em dashes (—) or en dashes (–) anywhere. Never invent where a quote or line came from ("found this...", "overheard...", "a stranger said...", "wrote it on a napkin").`;

/**
 * The full pattern library the gate checks against — vendored from
 * blader/humanizer SKILL.md (prose patterns only).
 */
export const HUMANIZER_PATTERNS = `AI-WRITING PATTERNS TO FIND AND FIX (from Wikipedia's "Signs of AI writing"):

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
24. Fake-candid openings — watch: Honestly?, Look, Here's the thing, Let's be honest, Real talk as standalone hooks. ALSO invented provenance stories for a quote or line (these read as fabricated): found-object framing ("found this in/inside...", "found this folded inside a library book", "someone left this on..."), overheard strangers ("overheard this in a car park", "a woman i barely know said this"), copied-down props ("wrote it on my hand", "wrote this on a napkin"). Rewrite the hook around the writer's own reaction to the words, keeping the same length, case, and trailing "...". A first-person letter or text the writer says they wrote and never sent is the format, not provenance — leave it.
25. Answering objections no one raised — watch: this isn't really about, I'm not saying, to be clear, don't get me wrong, some might say... but.
26. Rejecting fake alternatives — watch: a tempting approach would be, one might be tempted to, you might think... but. Cut the fake option; state the real point.

FALSE POSITIVES, leave these alone: short declarative fragments in an account's deliberate command voice; ALL-CAPS titles; all-lowercase lines written that way on purpose; deliberate repeated openings that build pressure; plain dry prose without specific tells; one short sentence for emphasis; specific everyday details (a time on the clock, a school form, a rep count) that are the substance of the post. When unsure, look for several patterns together before rewriting.`;

/**
 * The copy check every writer calls after generating (2026-09-30).
 *
 * The Sonnet REWRITE pass is gone — per Keenan: "eliminate the humanizer
 * step on script writing and content writing. it's making our content
 * worse". Nothing rewrites the writer's copy any more. What remains:
 *
 * 1. A deterministic dash fix (em/en dashes are a locked rule, done in
 *    code, never by a model).
 * 2. A sense check (#3 of the Jev build): Jev flags a wrong word, typo
 *    or line that doesn't make plain sense; code flags banned brand
 *    language and fixed-time language. Deliberately NO "sounds like AI"
 *    judging; that was the humanizer's job and it dulled the copy. Flags are recorded against the post's strings;
 *    withHeadlineRetry() sees them through copyFlagFor() and sends the
 *    post back to the WRITER once with the problem named, instead of a
 *    second model rewriting it.
 *
 * Same signature as before so all writers keep calling it unchanged.
 * Never throws; with Jev off it just returns the payload (dash-fixed).
 */
const FLAG_THRESHOLD = 0.8;
const BANNED_RE = /\bbrain[- ]?dump|\bnightly\b|\bbefore bed\b|\bevery night\b/i;

/** Normalized string → retry feedback, for strings from flagged payloads. */
const copyFlags = new Map<string, string>();

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Retry feedback when `headline` belongs to a payload the copy check flagged, else null. */
export function copyFlagFor(headline: string): string | null {
  return copyFlags.get(normKey(headline)) ?? null;
}

function mapStrings<T>(v: T, fn: (s: string) => string): T {
  if (typeof v === "string") return fn(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = mapStrings(x, fn);
    return out as T;
  }
  return v;
}

function collectStrings(v: unknown, into: string[] = []): string[] {
  if (typeof v === "string") into.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectStrings(x, into));
  return into;
}

/** Deterministic em/en dash removal: " — " reads as a comma pause. */
export function stripDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*(?=\S)/g, ", ")
    .replace(/\s*[—–]\s*$/g, "")
    .replace(/,\s*,/g, ",");
}

export async function humanizePass<T>(opts: {
  /** ClaudeCallLog purpose, e.g. "humanize:moody-topic". */
  purpose: string;
  /** The lane's VOICE line (context for the check). */
  voice: string;
  /** JSON payload of reader-facing strings. */
  payload: T;
}): Promise<T> {
  const payload = mapStrings(opts.payload, stripDashes);
  const lines = collectStrings(payload).filter((s) => s.trim());
  if (lines.length === 0) return payload;

  const problems: string[] = [];
  const banned = lines.find((l) => BANNED_RE.test(l));
  if (banned) {
    problems.push(
      `"${banned}" uses banned language (never "brain dump", never a fixed time like "nightly" or "before bed")`
    );
  }

  try {
    const { askJev, noulOf } = await import("./jev");
    const r = await askJev(
      opts.purpose.replace(/^humanize:/, "copy-check:"),
      { voice: opts.voice, copy: lines },
      {
        nonsense: {
          type: "noul",
          instructions:
            "Does any line in `copy` contain a wrong or out-of-place word, a typo, a garbled phrase, or a sentence that does not make plain sense to a native English speaker?",
        },
      }
    );
    const nonsense = noulOf(r, "nonsense");
    if (nonsense !== null && nonsense >= FLAG_THRESHOLD)
      problems.push("a line has a wrong word, typo or sentence that doesn't make plain sense");
    console.log(
      `[copy-check] ${opts.purpose}: nonsense=${nonsense?.toFixed(2)}${problems.length ? " FLAGGED" : ""}`
    );
  } catch (err) {
    console.warn(`[copy-check] ${opts.purpose} failed open:`, err instanceof Error ? err.message : err);
  }

  if (problems.length) {
    const feedback = `\n\nREJECTED by the copy check: ${problems.join("; ")}. Rewrite the post fixing this, same format and rules.`;
    for (const l of lines) if (l.length <= 160) copyFlags.set(normKey(l), feedback);
  }
  return payload;
}

/** Pull the VOICE line out of a lane's system prompt so the gate keeps the house voice. */
export function extractVoice(systemPrompt: string): string {
  const match = systemPrompt.match(/^VOICE:.*$/m);
  return match
    ? match[0]
    : "Short, declarative, second-person social copy. Match the existing tone of the strings exactly.";
}
