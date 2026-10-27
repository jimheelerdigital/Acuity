import { describe, expect, it } from "vitest";

import { buildFirstRead, type FirstReadInput } from "./first-read";

const base = (o: Partial<FirstReadInput> = {}): FirstReadInput => ({
  completedEntries: [
    { moodScore: 6, energy: 5 },
    { moodScore: 8, energy: 7 },
    { moodScore: 7, energy: 6 },
  ],
  capturedTaskCount: 4,
  recentTaskTitles: ["Call the bank", "Book dentist", "Email Sam", "Buy milk"],
  emergingThemeLabels: ["sleep"],
  ...o,
});

describe("buildFirstRead", () => {
  it("needs 3 completed entries", () => {
    expect(buildFirstRead(base({ completedEntries: base().completedEntries.slice(0, 2) }))).toBeNull();
    expect(buildFirstRead(base())).not.toBeNull();
  });

  it("averages mood and energy to one decimal, with the 1-10 label", () => {
    const r = buildFirstRead(base())!;
    expect(r.mood).toEqual({ label: "Good", average: 7, basedOn: 3 });
    expect(r.energy).toEqual({ average: 6, basedOn: 3 });
    expect(r.entriesCount).toBe(3);
  });

  it("leaves averages out with fewer than 3 scored entries", () => {
    const r = buildFirstRead(
      base({
        completedEntries: [
          { moodScore: 6, energy: null },
          { moodScore: null, energy: null },
          { moodScore: 9, energy: 4 },
        ],
      })
    )!;
    expect(r.mood).toBeNull();
    expect(r.energy).toBeNull();
  });

  it("ignores out-of-range scores", () => {
    const r = buildFirstRead(
      base({ completedEntries: [{ moodScore: 0, energy: 11 }, { moodScore: 5, energy: 5 }, { moodScore: 5, energy: 5 }] })
    )!;
    expect(r.mood).toBeNull();
  });

  it("caps task titles at 3 and drops the section with no tasks", () => {
    expect(buildFirstRead(base())!.tasks).toEqual({
      count: 4,
      titles: ["Call the bank", "Book dentist", "Email Sam"],
    });
    expect(buildFirstRead(base({ capturedTaskCount: 0, recentTaskTitles: [] }))!.tasks).toBeNull();
  });

  it("renders nothing when there's nothing honest to say", () => {
    expect(
      buildFirstRead(
        base({
          completedEntries: [{ moodScore: null, energy: null }, { moodScore: null, energy: null }, { moodScore: null, energy: null }],
          capturedTaskCount: 0,
          recentTaskTitles: [],
          emergingThemeLabels: [],
        })
      )
    ).toBeNull();
  });
});
