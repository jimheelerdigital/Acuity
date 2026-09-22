import { describe, expect, it } from "vitest";

import {
  MAX_EXCERPT_CHARS,
  selectExcerpt,
  splitSentences,
  stem,
  tokenize,
} from "./excerpt";

describe("selectExcerpt — verbatim by construction", () => {
  const transcript =
    "Work was fine today. I went for a run after dinner and felt so much better afterwards. Then I watched TV.";

  it("picks the sentence that actually overlaps the insight", () => {
    const r = selectExcerpt("Your energy lifts on days you run", { transcript });
    expect(r).not.toBeNull();
    expect(r!.excerpt).toContain("run");
    expect(r!.source).toBe("transcript");
  });

  it("returns an excerpt that is a VERBATIM substring of the source", () => {
    // "running" vs the transcript's "run" — only matches because of stemming,
    // which is the common case (model wording vs the user's speech).
    const r = selectExcerpt("running and dinner", { transcript });
    expect(r).not.toBeNull();
    expect(transcript).toContain(r!.excerpt);
  });

  it("reports offsets that actually locate the excerpt in the transcript", () => {
    const r = selectExcerpt("running after dinner", { transcript });
    expect(r!.startIndex).not.toBeNull();
    const sliced = transcript.slice(r!.startIndex!, r!.endIndex!);
    expect(sliced).toBe(r!.excerpt);
  });

  it("prefers the transcript over the summary", () => {
    const r = selectExcerpt("run", {
      transcript,
      summary: "User went running.",
    });
    expect(r!.source).toBe("transcript");
  });

  it("falls back to the summary when there is no transcript", () => {
    const r = selectExcerpt("running", {
      transcript: null,
      summary: "She went running and felt better.",
    });
    expect(r!.source).toBe("summary");
    expect(r!.excerpt).toContain("running");
  });

  it("nulls the offsets on a summary-sourced excerpt (they'd point into the wrong text)", () => {
    const r = selectExcerpt("running", { transcript: null, summary: "Went running today." });
    expect(r!.startIndex).toBeNull();
    expect(r!.endIndex).toBeNull();
  });
});

describe("selectExcerpt — refuses to invent evidence", () => {
  it("returns null when nothing in the entry relates to the insight", () => {
    const r = selectExcerpt("Your spending on groceries is climbing", {
      transcript: "I went for a run and watched television.",
    });
    // No overlapping content words → we cannot honestly cite this entry.
    expect(r).toBeNull();
  });

  it("returns null for an entry with no text at all", () => {
    expect(selectExcerpt("anything", {})).toBeNull();
    expect(selectExcerpt("anything", { transcript: null, summary: null })).toBeNull();
    expect(selectExcerpt("anything", { transcript: "", summary: "" })).toBeNull();
    expect(selectExcerpt("anything", { transcript: "   " })).toBeNull();
  });

  it("returns null when the insight is only stopwords (no signal to match on)", () => {
    expect(selectExcerpt("the and of it", { transcript: "I went running." })).toBeNull();
  });
});

describe("selectExcerpt — truncation", () => {
  it("caps a very long sentence and does not end mid-word", () => {
    const long = "running " .repeat(200) + "end.";
    const r = selectExcerpt("running", { transcript: long });
    expect(r!.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
    expect(r!.excerpt.endsWith(" ")).toBe(false);
    // Still verbatim: the truncated form is a prefix of the original span.
    expect(long).toContain(r!.excerpt);
  });

  it("keeps offsets consistent with the TRUNCATED excerpt", () => {
    const long = "running is good " .repeat(60) + "done.";
    const r = selectExcerpt("running", { transcript: long });
    expect(long.slice(r!.startIndex!, r!.endIndex!)).toBe(r!.excerpt);
  });
});

describe("splitSentences", () => {
  it("splits on terminal punctuation and preserves offsets", () => {
    const t = "One. Two! Three?";
    const spans = splitSentences(t);
    expect(spans.map((s) => s.text)).toEqual(["One.", "Two!", "Three?"]);
    for (const s of spans) expect(t.slice(s.start, s.end)).toBe(s.text);
  });

  it("splits speech-like text on newlines when punctuation is missing", () => {
    const spans = splitSentences("no punctuation here\nsecond line also none");
    expect(spans).toHaveLength(2);
  });

  it("falls back to the whole text when nothing splits", () => {
    const spans = splitSentences("just one unpunctuated run of words");
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("just one unpunctuated run of words");
  });

  it("returns nothing for empty/whitespace input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n  ")).toEqual([]);
  });
});

describe("tokenize", () => {
  it("drops stopwords and short tokens", () => {
    expect(tokenize("I went to the gym and it was good")).toEqual(["went", "gym", "good"]);
  });

  it("lowercases, strips punctuation, and stems", () => {
    expect(tokenize("Running, RUNNING! running?")).toEqual(["run", "run", "run"]);
  });

  it("stems the word forms that matter for matching insight text to speech", () => {
    // These pairs were silently missing before stemming, which meant a
    // well-supported insight could end up with zero evidence and be
    // suppressed as unsourced.
    expect(stem("running")).toBe("run");
    expect(stem("runs")).toBe("run");
    expect(stem("walked")).toBe("walk");
    expect(stem("worries")).toBe("worry");
    expect(stem("mentions")).toBe("mention");
  });

  it("does not over-stem short words or -ss endings", () => {
    expect(stem("gym")).toBe("gym");
    expect(stem("stress")).toBe("stress");
    expect(stem("bed")).toBe("bed");
  });
});
