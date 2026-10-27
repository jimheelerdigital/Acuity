import { describe, expect, it } from "vitest";

import {
  EXCLUDED_TERMS,
  FEELING_GROUPS,
  MAX_LINES,
  compareTalk,
  countPeriod,
  tokenize,
} from "./how-you-talk";

/** n filler words so a period clears MIN_WORDS_PER_PERIOD. */
const filler = (n: number) => Array(n).fill("today").join(" ");
const period = (feelings: string, entries = 3, words = 700) =>
  countPeriod([
    `${feelings} ${filler(words)}`,
    ...Array(entries - 1).fill(filler(10)),
  ]);

describe("countPeriod", () => {
  it("counts group forms and total words", () => {
    const p = countPeriod(["I was stressed and anxious, then calm."]);
    expect(p.counts.stressed).toBe(2);
    expect(p.counts.calm).toBe(1);
    expect(p.words).toBe(tokenize("I was stressed and anxious, then calm.").length);
    expect(p.entries).toBe(1);
  });

  it("drops negated hits within 3 words", () => {
    const p = countPeriod([
      "I'm not stressed. I wasn't really anxious. I feel less tired. Honestly so stressed.",
    ]);
    expect(p.counts.stressed).toBe(1);
    expect(p.counts.tired ?? 0).toBe(0);
  });
});

describe("compareTalk", () => {
  it("needs enough words and entries in both periods", () => {
    const thin = compareTalk(period("stressed stressed stressed stressed", 3, 100), period("calm", 3));
    expect(thin.enoughData).toBe(false);
    expect(thin.shifts).toEqual([]);
    const fewEntries = compareTalk(period("stressed", 2), period("calm", 3));
    expect(fewEntries.enoughData).toBe(false);
  });

  it("reports a clear drop as % less", () => {
    const r = compareTalk(
      period("stressed stressed"),
      period("stressed stressed stressed stressed stressed stressed")
    );
    expect(r.shifts[0]).toMatchObject({ group: "stressed", direction: "down" });
    expect(r.shifts[0].text).toMatch(/You said 'stressed' \d+% less than the month before\./);
  });

  it("ignores small absolute changes (1 → 2 is not +100%)", () => {
    const r = compareTalk(period("excited excited"), period("excited"));
    expect(r.enoughData).toBe(true);
    expect(r.shifts).toEqual([]);
  });

  it("flags new and gone words with enough uses", () => {
    const r = compareTalk(period("proud proud proud"), period("tired tired tired"));
    const byGroup = Object.fromEntries(r.shifts.map((s) => [s.group, s.direction]));
    expect(byGroup).toMatchObject({ proud: "new", tired: "gone" });
  });

  it("returns at most MAX_LINES shifts", () => {
    const now = "proud proud proud excited excited excited calm calm calm happy happy happy";
    const r = compareTalk(period(now), period("tired tired tired"));
    expect(r.shifts.length).toBeLessThanOrEqual(MAX_LINES);
  });
});

describe("safety", () => {
  it("never tracks crisis / self-harm terms", () => {
    for (const g of FEELING_GROUPS) {
      for (const f of g.forms) expect(EXCLUDED_TERMS.has(f)).toBe(false);
    }
    const p = countPeriod(["I feel hopeless and worthless and want to die"]);
    expect(Object.keys(p.counts)).toEqual([]);
  });
});
