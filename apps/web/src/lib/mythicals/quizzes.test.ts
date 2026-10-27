import { describe, expect, it } from "vitest";

import { decodePicks, drawQuestions, encodePicks, QUIZ_KINDS, QUIZZES, scorePicks, type Pick } from "./quizzes";

/** Small seeded RNG so the simulation is the same every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe.each(QUIZ_KINDS)("%s quiz", (kind) => {
  const def = QUIZZES[kind];

  it("only awards points to real results, three per answer, four answers per question", () => {
    for (const q of def.pool) {
      expect(q.answers).toHaveLength(4);
      for (const a of q.answers) {
        expect(new Set(a.points).size).toBe(3);
        for (const slug of a.points) expect(def.results[slug], `${kind}: ${slug}`).toBeDefined();
      }
    }
  });

  it("gives every result a fair share of the points in the pool", () => {
    const counts = new Map<string, number>();
    for (const q of def.pool) for (const a of q.answers) for (const s of a.points) counts.set(s, (counts.get(s) ?? 0) + 1);
    const values = Object.keys(def.results).map((s) => counts.get(s) ?? 0);
    expect(Math.max(...values) - Math.min(...values), JSON.stringify(Object.fromEntries(counts))).toBeLessThanOrEqual(2);
  });

  it("reaches every result with random answers on random draws", () => {
    const r = rng(42);
    const hits = new Map<string, number>();
    const runs = 20000;
    for (let n = 0; n < runs; n++) {
      const picks: Pick[] = drawQuestions(kind, r).map((q) => ({ q, a: Math.floor(r() * 4) }));
      const slug = scorePicks(kind, picks);
      hits.set(slug, (hits.get(slug) ?? 0) + 1);
    }
    const fair = runs / Object.keys(def.results).length;
    for (const slug of Object.keys(def.results)) {
      // Each result lands at least 40% of an even share.
      expect(hits.get(slug) ?? 0, `${kind}: ${slug} ${JSON.stringify(Object.fromEntries(hits))}`).toBeGreaterThan(fair * 0.4);
    }
  });

  it("round-trips picks through the result URL and rejects bad ones", () => {
    const picks = drawQuestions(kind, rng(7)).map((q, i) => ({ q, a: i % 4 }));
    const enc = encodePicks(picks);
    expect(decodePicks(kind, enc)).toEqual(picks);
    expect(decodePicks(kind, enc.slice(0, -2))).toBeNull();
    expect(decodePicks(kind, `${enc.slice(0, 2)}${enc.slice(0, 2)}${enc.slice(4)}`)).toBeNull();
    expect(decodePicks(kind, "")).toBeNull();
  });

  it("scores the same answers the same way every time", () => {
    const picks = drawQuestions(kind, rng(3)).map((q) => ({ q, a: 1 }));
    expect(scorePicks(kind, picks)).toBe(scorePicks(kind, picks));
  });
});
