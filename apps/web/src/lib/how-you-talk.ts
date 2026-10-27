/**
 * "How you talk" (2026-10-27): shifts in the user's own feeling words,
 * last 30 days vs the 30 days before, from Entry.transcript.
 *
 * Deterministic and transparent: a small, curated lexicon of feeling words
 * in groups, counted per 1,000 spoken words, so a month with more talking
 * doesn't look "more stressed" just because there's more of it.
 *
 * Approach and limits (honest about what this can and can't see):
 *  - Tokens are lower-cased words; a group matches any of its listed forms.
 *  - Negation: a hit is dropped when one of the 3 preceding words is a
 *    negator ("not stressed", "wasn't anxious", "less tired"). This is a
 *    simple window, so it misses some constructions ("not only stressed but
 *    tired" drops a real hit) and can't read sarcasm or quoting someone else.
 *  - It counts words, not meaning. That's why it only reports clear shifts
 *    with enough talking in both periods, and phrases them as what the user
 *    *said*, never as how they *are*.
 *  - Crisis / self-harm language is never tracked or surfaced as a trend.
 *    Those words are not in the lexicon, and EXCLUDED_TERMS is a guard that
 *    strips any form that ever gets added by mistake (a test enforces it).
 *    Distress in an entry is handled by the entry pipeline's safety rules,
 *    not by a word-count card.
 */

export const PERIOD_DAYS = 30;

/** Minimum spoken words in EACH period (~4–5 minutes of talking). */
export const MIN_WORDS_PER_PERIOD = 600;
/** Minimum completed entries in EACH period. */
export const MIN_ENTRIES_PER_PERIOD = 3;
/** A rise/fall needs at least this many uses in the busier period... */
export const MIN_COUNT_FOR_CHANGE = 4;
/** ...a relative change in rate of at least this much... */
export const MIN_RELATIVE_CHANGE = 0.4;
/** ...and an absolute change of at least this many uses per 1,000 words. */
export const MIN_RATE_DELTA_PER_K = 1;
/** "New" needs this many uses now and none before; "gone" the reverse. */
export const MIN_COUNT_FOR_NEW_OR_GONE = 3;
export const MAX_LINES = 3;

/** Cap per transcript so one very long entry can't dominate or slow things. */
export const MAX_CHARS_PER_TRANSCRIPT = 20_000;

export type FeelingGroup = {
  key: string;
  /** Word shown to the user, e.g. 'stressed'. */
  label: string;
  forms: string[];
};

export const FEELING_GROUPS: FeelingGroup[] = [
  { key: "stressed", label: "stressed", forms: ["stressed", "stress", "stressful", "anxious", "anxiety", "overwhelmed", "overwhelming", "worried", "worry", "worrying", "nervous"] },
  { key: "tired", label: "tired", forms: ["tired", "exhausted", "drained", "fatigued", "sleepy", "wiped"] },
  { key: "frustrated", label: "frustrated", forms: ["frustrated", "frustrating", "annoyed", "irritated", "angry"] },
  { key: "sad", label: "sad", forms: ["sad", "lonely", "disappointed", "upset"] },
  { key: "excited", label: "excited", forms: ["excited", "exciting", "thrilled", "pumped"] },
  { key: "grateful", label: "grateful", forms: ["grateful", "thankful", "gratitude", "appreciative"] },
  { key: "proud", label: "proud", forms: ["proud"] },
  { key: "calm", label: "calm", forms: ["calm", "relaxed", "peaceful", "rested"] },
  { key: "happy", label: "happy", forms: ["happy", "glad", "joy", "joyful"] },
  { key: "hopeful", label: "hopeful", forms: ["hopeful", "optimistic", "motivated"] },
];

/** Never tracked, never surfaced. Guard against accidental additions. */
export const EXCLUDED_TERMS = new Set([
  "suicide", "suicidal", "kill", "killing", "die", "dying", "dead", "death",
  "hopeless", "worthless", "self-harm", "selfharm", "harm", "hurt", "hurting",
  "cut", "cutting", "overdose", "overdosed", "pills", "end", "ending",
  "unalive", "numb", "trapped", "burden",
]);

const NEGATORS = new Set([
  "not", "no", "never", "isn't", "wasn't", "aren't", "weren't", "don't",
  "didn't", "doesn't", "hardly", "barely", "less", "without", "nor",
  "isnt", "wasnt", "dont", "didnt", "doesnt", "ain't",
]);
const NEGATION_WINDOW = 3;

const FORM_TO_GROUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const g of FEELING_GROUPS) {
    for (const f of g.forms) if (!EXCLUDED_TERMS.has(f)) m.set(f, g.key);
  }
  return m;
})();

export function tokenize(text: string): string[] {
  return (text.slice(0, MAX_CHARS_PER_TRANSCRIPT).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []);
}

export type PeriodCounts = { words: number; entries: number; counts: Record<string, number> };

export function countPeriod(transcripts: string[]): PeriodCounts {
  const counts: Record<string, number> = {};
  let words = 0;
  let entries = 0;
  for (const t of transcripts) {
    if (!t) continue;
    entries++;
    const tokens = tokenize(t);
    words += tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      const group = FORM_TO_GROUP.get(tokens[i]);
      if (!group) continue;
      let negated = false;
      for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
        if (NEGATORS.has(tokens[j])) { negated = true; break; }
      }
      if (!negated) counts[group] = (counts[group] ?? 0) + 1;
    }
  }
  return { words, entries, counts };
}

export type TalkShift = {
  group: string;
  word: string;
  direction: "up" | "down" | "new" | "gone";
  text: string;
  /** For ranking only. */
  score: number;
};

export type HowYouTalk = {
  periodDays: number;
  enoughData: boolean;
  shifts: Array<Omit<TalkShift, "score">>;
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function changePhrase(ratio: number): string {
  if (ratio >= 2) return `about ${Math.round(ratio)}× as often`;
  if (ratio > 1) return `${Math.round(((ratio - 1) * 100) / 10) * 10}% more`;
  return `${Math.round(((1 - ratio) * 100) / 10) * 10}% less`;
}

export function compareTalk(current: PeriodCounts, previous: PeriodCounts): HowYouTalk {
  const base = { periodDays: PERIOD_DAYS };
  const enough =
    current.words >= MIN_WORDS_PER_PERIOD &&
    previous.words >= MIN_WORDS_PER_PERIOD &&
    current.entries >= MIN_ENTRIES_PER_PERIOD &&
    previous.entries >= MIN_ENTRIES_PER_PERIOD;
  if (!enough) return { ...base, enoughData: false, shifts: [] };

  const shifts: TalkShift[] = [];
  for (const g of FEELING_GROUPS) {
    const c = current.counts[g.key] ?? 0;
    const p = previous.counts[g.key] ?? 0;
    const rc = (c / current.words) * 1000;
    const rp = (p / previous.words) * 1000;
    const word = `'${g.label}'`;

    if (p === 0 && c >= MIN_COUNT_FOR_NEW_OR_GONE) {
      shifts.push({ group: g.key, word: g.label, direction: "new", score: rc + 10,
        text: `${cap(word)} came up ${c} times in the last month, and not at all the month before.` });
      continue;
    }
    if (c === 0 && p >= MIN_COUNT_FOR_NEW_OR_GONE) {
      shifts.push({ group: g.key, word: g.label, direction: "gone", score: rp + 10,
        text: `You didn't say ${word} once in the last month (${p} times the month before).` });
      continue;
    }
    if (Math.max(c, p) < MIN_COUNT_FOR_CHANGE || rp === 0) continue;
    const ratio = rc / rp;
    const rel = Math.abs(ratio - 1);
    if (rel < MIN_RELATIVE_CHANGE || Math.abs(rc - rp) < MIN_RATE_DELTA_PER_K) continue;
    shifts.push({
      group: g.key, word: g.label, direction: ratio > 1 ? "up" : "down",
      score: Math.abs(rc - rp),
      text: `You said ${word} ${changePhrase(ratio)} than the month before.`,
    });
  }

  shifts.sort((a, b) => b.score - a.score);
  return {
    ...base,
    enoughData: true,
    shifts: shifts.slice(0, MAX_LINES).map(({ score: _s, ...rest }) => rest),
  };
}
