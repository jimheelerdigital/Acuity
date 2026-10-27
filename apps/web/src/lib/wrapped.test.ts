import { describe, expect, it } from "vitest";

import {
  parseWrappedPeriod,
  wrappedPeriodForCard,
  wrappedPeriodLabel,
  wrappedPeriodRange,
  wrappedPeriodStarted,
  wrappedShareText,
} from "@acuity/shared";

import {
  computeWrapped,
  firstNameOnly,
  longestRunInRange,
  type WrappedEntryRow,
  type WrappedInput,
} from "./wrapped";

const OCT = { kind: "month", year: 2026, month: 10 } as const;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function entry(localDate: string, over: Partial<WrappedEntryRow> = {}): WrappedEntryRow {
  return { localDate, audioDuration: 120, themes: [], wins: [], moodScore: null, ...over };
}

function input(over: Partial<WrappedInput> = {}): WrappedInput {
  return { period: OCT, entries: [], tasks: [], habits: [], people: [], ...over };
}

describe("wrapped periods (shared)", () => {
  it("parses months and years, rejects junk", () => {
    expect(parseWrappedPeriod("2026-10")).toEqual(OCT);
    expect(parseWrappedPeriod("2026")).toEqual({ kind: "year", year: 2026 });
    expect(parseWrappedPeriod("2026-13")).toBeNull();
    expect(parseWrappedPeriod("26-10")).toBeNull();
    expect(parseWrappedPeriod(null)).toBeNull();
  });

  it("ranges and labels", () => {
    expect(wrappedPeriodRange(OCT)).toEqual({ start: "2026-10-01", end: "2026-11-01" });
    expect(wrappedPeriodRange({ kind: "month", year: 2026, month: 12 })).toEqual({
      start: "2026-12-01",
      end: "2027-01-01",
    });
    expect(wrappedPeriodLabel(OCT)).toBe("October 2026");
    expect(wrappedPeriodLabel({ kind: "year", year: 2026 })).toBe("Your 2026");
    expect(wrappedPeriodStarted(OCT, "2026-09-30")).toBe(false);
    expect(wrappedPeriodStarted(OCT, "2026-10-01")).toBe(true);
  });

  it("offers last month in the first week, the year from Dec 15 to Jan 7", () => {
    expect(wrappedPeriodForCard("2026-11-03")).toEqual(OCT);
    expect(wrappedPeriodForCard("2026-11-08")).toBeNull();
    expect(wrappedPeriodForCard("2026-12-14")).toBeNull();
    expect(wrappedPeriodForCard("2026-12-15")).toEqual({ kind: "year", year: 2026 });
    expect(wrappedPeriodForCard("2027-01-05")).toEqual({ kind: "year", year: 2026 });
    expect(wrappedPeriodForCard("2027-02-02")).toEqual({ kind: "month", year: 2027, month: 1 });
  });
});

describe("computeWrapped", () => {
  it("needs 4 entries in the month (entries outside the month don't count)", () => {
    const three = input({
      entries: [entry("2026-10-02"), entry("2026-10-03"), entry("2026-10-04"), entry("2026-09-30")],
    });
    expect(computeWrapped(three).eligible).toBe(false);
    expect(computeWrapped(three).entries).toBe(3);
    const four = input({ entries: [...three.entries, entry("2026-10-20")] });
    expect(computeWrapped(four).eligible).toBe(true);
  });

  it("counts minutes only when at least half the entries have audio", () => {
    const r = computeWrapped(
      input({ entries: [entry("2026-10-01", { audioDuration: 90 }), entry("2026-10-02", { audioDuration: null })] })
    );
    expect(r.minutesTalked).toBe(2); // 90s → 1.5 min, rounded
    const typed = computeWrapped(
      input({
        entries: [
          entry("2026-10-01", { audioDuration: null }),
          entry("2026-10-02", { audioDuration: null }),
          entry("2026-10-03", { audioDuration: 60 }),
        ],
      })
    );
    expect(typed.minutesTalked).toBeNull();
  });

  it("top themes need 2+ entries each, case-insensitive, max 3", () => {
    const r = computeWrapped(
      input({
        entries: [
          entry("2026-10-01", { themes: ["sleep", "Work", "work"] }),
          entry("2026-10-02", { themes: ["Sleep", "work"] }),
          entry("2026-10-03", { themes: ["family", "money"] }),
          entry("2026-10-04", { themes: ["family", "money", "gym"] }),
          entry("2026-10-05", { themes: ["family"] }),
        ],
      })
    );
    expect(r.topThemes.map((t) => t.theme)).toEqual(["Family", "Money", "Sleep"]);
    expect(r.topThemes[0].entries).toBe(3);
  });

  it("longest habit run stays inside the period and skips unscheduled days", () => {
    const weekdays = {
      id: "h",
      name: "Stretch",
      daysActive: [1, 2, 3, 4, 5],
      // Thu Oct 1, Fri Oct 2, Mon Oct 5, Tue Oct 6 → 4 in a row (weekend skipped); Sep 30 is outside the month.
      checkedDates: ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"],
    };
    expect(longestRunInRange(weekdays, wrappedPeriodRange(OCT))).toBe(4);
    const short = { ...weekdays, name: "Read", daysActive: EVERY_DAY, checkedDates: ["2026-10-01", "2026-10-02"] };
    const r = computeWrapped(input({ habits: [weekdays, short] }));
    expect(r.habitStreak).toEqual({ habit: "Stretch", days: 4 });
    expect(computeWrapped(input({ habits: [short] })).habitStreak).toBeNull();
  });

  it("tasks: only those captured from recordings in the period", () => {
    const r = computeWrapped(
      input({
        tasks: [
          { fromRecording: true, createdLocalDate: "2026-10-03", completedLocalDate: "2026-10-04" },
          { fromRecording: true, createdLocalDate: "2026-10-09", completedLocalDate: null },
          { fromRecording: false, createdLocalDate: "2026-10-09", completedLocalDate: "2026-10-10" },
          { fromRecording: true, createdLocalDate: "2026-11-01", completedLocalDate: null },
        ],
      })
    );
    expect(r.tasks).toEqual({ captured: 2, completed: 1 });
    expect(computeWrapped(input()).tasks).toBeNull();
  });

  it("biggest win: most repeated, else most recent", () => {
    const repeated = computeWrapped(
      input({
        entries: [
          entry("2026-10-01", { wins: ["Ran 5k"] }),
          entry("2026-10-02", { wins: ["ran 5k", "Shipped it"] }),
          entry("2026-10-09", { wins: ["Called mom"] }),
        ],
      })
    );
    expect(repeated.biggestWin).toBe("Ran 5k");
    const recent = computeWrapped(
      input({ entries: [entry("2026-10-01", { wins: ["A"] }), entry("2026-10-09", { wins: ["B"] })] })
    );
    expect(recent.biggestWin).toBe("B");
  });

  it("person: 3+ mentions in the period, first name only", () => {
    const r = computeWrapped(
      input({
        people: [
          { displayName: "Sarah Johnson", mentionDates: ["2026-10-01", "2026-10-02", "2026-10-05"] },
          { displayName: "Mike", mentionDates: ["2026-10-01", "2026-10-02", "2026-09-29", "2026-09-28"] },
        ],
      })
    );
    expect(r.person).toEqual({ firstName: "Sarah", mentions: 3 });
    expect(firstNameOnly("  Ana   María Lopez ")).toBe("Ana");
  });

  it("mood arc: weekly buckets for a month (day 29-31 join week 4), needs 2 buckets", () => {
    const r = computeWrapped(
      input({
        entries: [
          entry("2026-10-01", { moodScore: 4 }),
          entry("2026-10-03", { moodScore: 6 }),
          entry("2026-10-22", { moodScore: 8 }),
          entry("2026-10-31", { moodScore: 9 }),
        ],
      })
    );
    expect(r.moodArc).toEqual([
      { label: "Week 1", avg: 5 },
      { label: "Week 4", avg: 8.5 },
    ]);
    expect(computeWrapped(input({ entries: [entry("2026-10-01", { moodScore: 4 })] })).moodArc).toBeNull();
  });

  it("year: monthly mood buckets and a 12-entry minimum", () => {
    const year = { kind: "year", year: 2026 } as const;
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry(`2026-${String((i % 2) + 3).padStart(2, "0")}-1${i % 9}`, { moodScore: i % 2 ? 8 : 6 })
    );
    const r = computeWrapped(input({ period: year, entries }));
    expect(r.eligible).toBe(true);
    expect(r.moodArc).toEqual([
      { label: "Mar", avg: 6 },
      { label: "Apr", avg: 8 },
    ]);
    expect(r.period).toEqual({ key: "2026", kind: "year", label: "Your 2026" });
  });
});

describe("wrappedShareText (privacy)", () => {
  const base = computeWrapped(
    input({
      entries: [
        entry("2026-10-01", { themes: ["sleep"], wins: ["Told Dana about the diagnosis"], moodScore: 4 }),
        entry("2026-10-02", { themes: ["sleep"], moodScore: 4 }),
        entry("2026-10-22", { moodScore: 8 }),
        entry("2026-10-23", { moodScore: 8 }),
      ],
      habits: [{ id: "h", name: "Take meds", daysActive: EVERY_DAY, checkedDates: ["2026-10-01", "2026-10-02", "2026-10-03"] }],
      tasks: [{ fromRecording: true, createdLocalDate: "2026-10-02", completedLocalDate: null }],
      people: [{ displayName: "Dana Smith", mentionDates: ["2026-10-01", "2026-10-02", "2026-10-03"] }],
    })
  );

  it("never includes the win, the habit name or a person by default", () => {
    const text = wrappedShareText(base);
    expect(text).toContain("My October 2026 on Ripple");
    expect(text).toContain("4 debriefs over 4 days");
    expect(text).toContain("On my mind: Sleep");
    expect(text).toContain("Longest habit streak: 3 days");
    expect(text).toContain("1 to-dos captured just by talking, 0 done");
    expect(text).toContain("Mood: trending up");
    expect(text).not.toMatch(/diagnosis|Take meds|Dana|Smith/);
  });

  it("adds only the first name when the user opts in", () => {
    const text = wrappedShareText(base, { includePerson: true });
    expect(text).toContain("Most mentioned: Dana");
    expect(text).not.toContain("Smith");
  });

  it("year label reads naturally", () => {
    const y = computeWrapped(input({ period: { kind: "year", year: 2026 } }));
    expect(wrappedShareText(y).split("\n")[0]).toBe("My 2026 on Ripple");
  });
});
