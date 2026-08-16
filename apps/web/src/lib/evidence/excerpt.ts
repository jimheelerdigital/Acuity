/**
 * Pick the passage of an entry that best supports a given insight.
 *
 * ── Why this is done server-side and deterministically ───────────────
 * The obvious way to get a quote is to send transcripts to Claude and ask
 * it to quote back. We deliberately don't:
 *
 *   1. Today's digest excludes transcripts on purpose — "No transcripts
 *      (privacy + token cost)" (compute-user-insights.ts:397). Sending
 *      full transcripts to the model to obtain receipts would quietly
 *      reverse a standing privacy decision as a side effect of a feature.
 *      That is Jim's call, not this change's.
 *   2. A model asked to quote will sometimes paraphrase, merge two
 *      sentences, or produce a fluent quote that is not in the source —
 *      which is exactly the fabrication mode this whole track exists to
 *      prevent. A receipt that isn't verbatim is worse than none.
 *
 * So: Claude names WHICH entries support an observation (it already sees
 * their summaries), and this module then picks the actual sentence out of
 * the stored text locally. Verbatim by construction, no extra tokens, no
 * change to what leaves our servers.
 *
 * Scoring is intentionally simple — token overlap with the insight text,
 * lightly normalized. This is a "which sentence is most on-topic" problem,
 * not a semantic search problem; the entry is already known to be relevant
 * because the model cited it. Embeddings would add latency and cost for a
 * selection among ~5-20 candidate sentences.
 */

export interface ExcerptSource {
  /** Full transcript, when available. Preferred — it's the user's words. */
  transcript?: string | null;
  /** Model-written summary. Fallback when there's no transcript. */
  summary?: string | null;
}

export interface SelectedExcerpt {
  excerpt: string;
  /** Offsets into `transcript`. Null when the excerpt came from the summary. */
  startIndex: number | null;
  endIndex: number | null;
  /** Which field the excerpt was taken from. */
  source: "transcript" | "summary";
}

/** Words too common to indicate topical overlap. */
const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","than","so","because","as","of","at","by","for","with",
  "about","into","through","during","to","from","in","on","off","out","over","under","again","further",
  "is","are","was","were","be","been","being","am","do","does","did","doing","have","has","had","having",
  "i","me","my","myself","we","our","ours","you","your","yours","he","him","his","she","her","hers",
  "it","its","they","them","their","what","which","who","whom","this","that","these","those",
  "not","no","nor","only","own","same","too","very","can","will","just","should","now","more","most",
]);

/**
 * Light suffix stemmer.
 *
 * Necessary, not a nicety: an insight is written by a model in its own words
 * ("Your energy lifts on days you **run**") while the transcript is the
 * user's speech ("I went for a **run**", "I've been **running**"). Without
 * stemming, exact-token matching misses those pairs and `selectExcerpt`
 * returns null — meaning a genuinely well-supported insight ends up with
 * zero evidence and, by THE RULE, gets suppressed as unsourced. Under-
 * matching here silently destroys real receipts.
 *
 * Deliberately conservative (no irregular forms like ran→run): a wrong stem
 * would create a FALSE match, which is the worse error. Missing a match
 * costs us a receipt; inventing one costs us the promise.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ing")) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith("edly")) w = undouble(w.slice(0, -4));
  else if (w.length > 4 && w.endsWith("ed")) w = undouble(w.slice(0, -2));
  else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
  return w;
}

/** "runn" → "run". Undo the consonant doubling English adds before -ing/-ed. */
function undouble(w: string): string {
  if (w.length < 3) return w;
  const a = w[w.length - 1];
  const b = w[w.length - 2];
  if (a === b && !"aeiou".includes(a)) return w.slice(0, -1);
  return w;
}

/** Tokenize to lowercase alphanumeric word STEMS, minus stopwords. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

/**
 * Split text into sentence-ish spans, preserving the offset of each so an
 * excerpt can be highlighted in the original.
 *
 * Not a full sentence tokenizer — transcripts are speech, frequently
 * missing terminal punctuation. Splits on sentence enders AND newlines, and
 * falls back to the whole text when nothing splits.
 */
export function splitSentences(
  text: string
): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const start = m.index + trimmedStart;
    spans.push({ text: trimmed, start, end: start + trimmed.length });
  }
  if (spans.length === 0 && text.trim().length > 0) {
    const trimmedStart = text.length - text.trimStart().length;
    const trimmed = text.trim();
    spans.push({
      text: trimmed,
      start: trimmedStart,
      end: trimmedStart + trimmed.length,
    });
  }
  return spans;
}

/** Max characters we'll store as a single excerpt. */
export const MAX_EXCERPT_CHARS = 400;

/**
 * Choose the best-supporting excerpt for `insightText` from `source`.
 *
 * Returns null when there is no usable text at all — the caller MUST treat
 * that as "no evidence for this entry" and skip writing an InsightEvidence
 * row, rather than inventing a placeholder. An empty receipt is a fabricated
 * receipt.
 */
export function selectExcerpt(
  insightText: string,
  source: ExcerptSource
): SelectedExcerpt | null {
  const insightTokens = new Set(tokenize(insightText));

  const fromTranscript = pickBest(source.transcript ?? "", insightTokens);
  if (fromTranscript) {
    return {
      excerpt: truncate(fromTranscript.text),
      startIndex: fromTranscript.start,
      endIndex: fromTranscript.start + truncate(fromTranscript.text).length,
      source: "transcript",
    };
  }

  const fromSummary = pickBest(source.summary ?? "", insightTokens);
  if (fromSummary) {
    return {
      excerpt: truncate(fromSummary.text),
      // Offsets are into the transcript by contract; a summary-sourced
      // excerpt has no position in it, so they stay null rather than
      // pointing at the wrong text.
      startIndex: null,
      endIndex: null,
      source: "summary",
    };
  }

  return null;
}

function truncate(s: string): string {
  if (s.length <= MAX_EXCERPT_CHARS) return s;
  // Cut at a word boundary so the stored quote doesn't end mid-word.
  const cut = s.slice(0, MAX_EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_EXCERPT_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function pickBest(
  text: string,
  insightTokens: Set<string>
): { text: string; start: number } | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const spans = splitSentences(text);
  if (spans.length === 0) return null;

  let best: { text: string; start: number; score: number } | null = null;
  for (const span of spans) {
    const tokens = tokenize(span.text);
    if (tokens.length === 0) continue;
    let hits = 0;
    const seen = new Set<string>();
    for (const t of tokens) {
      if (insightTokens.has(t) && !seen.has(t)) {
        hits++;
        seen.add(t);
      }
    }
    // Normalize by length so a long rambling sentence doesn't win purely by
    // containing more words, but keep a mild length bonus so a one-word
    // fragment doesn't beat a genuinely on-topic sentence.
    const score = hits === 0 ? 0 : hits + hits / Math.sqrt(tokens.length);
    if (score > 0 && (best === null || score > best.score)) {
      best = { text: span.text, start: span.start, score };
    }
  }

  // No overlapping content words: we cannot honestly claim this passage
  // supports the insight. Returning null is the correct, conservative answer.
  return best ? { text: best.text, start: best.start } : null;
}
