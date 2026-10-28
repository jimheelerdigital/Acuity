import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  callbackWindows,
  computeCallback,
  isoWeekStart,
  pickSnippet,
  type CallbackEntry,
} from "./callback";

// Wednesday; week starts Mon 2026-10-26.
const NOW = new Date("2026-10-28T15:00:00Z");
const WEEK = isoWeekStart(NOW);
const beforeWeek = (n: number) => new Date(WEEK.getTime() - n * DAY_MS);

let seq = 0;
function e(over: Partial<CallbackEntry> & { days: number }): CallbackEntry {
  seq++;
  const { days, ...rest } = over;
  return {
    id: `e${seq}`,
    createdAt: beforeWeek(days),
    summary: "Long day at work but got the launch plan done.",
    wins: [],
    moodScore: 6,
    transcript: "fine",
    themes: [{ themeId: "work", name: "Work" }],
    ...rest,
  };
}

describe("callbackWindows", () => {
  it("anchors to the ISO week start so it is stable all week", () => {
    const a = callbackWindows(new Date("2026-10-26T01:00:00Z"));
    const b = callbackWindows(new Date("2026-11-01T22:00:00Z"));
    expect(a.pastFrom.getTime()).toBe(b.pastFrom.getTime());
    expect(WEEK.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("pickSnippet", () => {
  it("prefers a win over the summary", () => {
    expect(pickSnippet({ wins: ["Shipped the first version"], summary: "A day." })).toBe(
      "Shipped the first version"
    );
  });
  it("falls back to the summary's first sentence and clips long text", () => {
    const long = `${"word ".repeat(60)}end. Second sentence.`;
    const s = pickSnippet({ wins: [], summary: long })!;
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(160);
  });
  it("skips sensitive wins and summaries", () => {
    expect(pickSnippet({ wins: ["thought about self-harm less"], summary: "I want to die." })).toBeNull();
  });
});

describe("computeCallback", () => {
  it("returns a past entry that shares a theme with last week", () => {
    const past = [e({ days: 30, wins: ["Started the new role"], moodScore: 5 })];
    const recent = [e({ days: 2, moodScore: 7 }), e({ days: 4, moodScore: 8 })];
    const c = computeCallback(past, recent, NOW, "u1")!;
    expect(c.entryId).toBe(past[0].id);
    expect(c.snippet).toBe("Started the new role");
    expect(c.theme).toBe("Work");
    expect(c.now).toBe("Last week, work came up again — and your mood's been higher.");
  });

  it("omits the mood clause unless mood is noticeably higher", () => {
    const c = computeCallback([e({ days: 30, moodScore: 7 })], [e({ days: 2, moodScore: 6 })], NOW)!;
    expect(c.now).toBe("Last week, work came up again.");
  });

  it("returns null with no shared theme", () => {
    const past = [e({ days: 30, themes: [{ themeId: "family", name: "Family" }] })];
    expect(computeCallback(past, [e({ days: 2 })], NOW)).toBeNull();
  });

  it("never resurfaces a very low-mood entry", () => {
    expect(computeCallback([e({ days: 30, moodScore: 3 })], [e({ days: 2 })], NOW)).toBeNull();
  });

  it("never resurfaces an entry whose transcript hits the crisis guard", () => {
    const past = [e({ days: 30, transcript: "sometimes I think about suicide" })];
    expect(computeCallback(past, [e({ days: 2 })], NOW)).toBeNull();
  });

  it("ignores sensitive theme names on either side", () => {
    const t = [{ themeId: "x", name: "Self-harm" }];
    expect(computeCallback([e({ days: 30, themes: t })], [e({ days: 2, themes: t })], NOW)).toBeNull();
  });

  it("prefers the entry with more overlap with last week", () => {
    const both = [
      { themeId: "work", name: "Work" },
      { themeId: "sleep", name: "Sleep" },
    ];
    const weak = e({ days: 28 });
    const strong = e({ days: 31, themes: both });
    const recent = [e({ days: 1, themes: both }), e({ days: 3, themes: both })];
    expect(computeCallback([weak, strong], recent, NOW)!.entryId).toBe(strong.id);
  });

  it("is deterministic for the same user and week", () => {
    const past = [e({ days: 28 }), e({ days: 30 }), e({ days: 33 })];
    const recent = [e({ days: 2 })];
    const a = computeCallback(past, recent, NOW, "u9")!.entryId;
    const b = computeCallback(past, recent, new Date("2026-11-01T09:00:00Z"), "u9")!.entryId;
    expect(a).toBe(b);
  });

  it("returns null with nothing recent", () => {
    expect(computeCallback([e({ days: 30 })], [], NOW)).toBeNull();
  });
});
