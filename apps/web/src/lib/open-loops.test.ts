import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  computeOpenLoops,
  findQuietGoals,
  findRecurringWorries,
  isSensitiveLabel,
  type GoalForLoops,
  type WorryMention,
} from "./open-loops";

const NOW = new Date("2026-10-27T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

let seq = 0;
function m(themeId: string, name: string, d: number, sentiment = "NEGATIVE"): WorryMention {
  seq++;
  return { themeId, themeName: name, entryId: `e${seq}`, createdAt: daysAgo(d), sentiment };
}

function goal(over: Partial<GoalForLoops> = {}): GoalForLoops {
  return {
    id: "g1",
    title: "Run a half marathon",
    status: "IN_PROGRESS",
    lastMentionedAt: daysAgo(24),
    entryRefsCount: 2,
    ...over,
  };
}

describe("findRecurringWorries", () => {
  it("flags a negative theme 3 weeks running that's still current", () => {
    const r = findRecurringWorries([m("t1", "money", 2), m("t1", "money", 9), m("t1", "money", 16)], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe("Money has come up 3 weeks running");
    expect(r[0].weeksRunning).toBe(3);
  });

  it("accepts 3+ debriefs spanning 14+ days even without 3 distinct weeks", () => {
    // weeks 0 and 2 only (no week 1): 2 distinct weeks, span 15 days
    const r = findRecurringWorries([m("t1", "work", 1), m("t1", "work", 3), m("t1", "work", 16)], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].text).toMatch(/^Work keeps coming up: 3 debriefs over/);
  });

  it("ignores themes not mentioned in the last 10 days", () => {
    expect(findRecurringWorries([m("t1", "money", 12), m("t1", "money", 20), m("t1", "money", 30)], NOW)).toEqual([]);
  });

  it("ignores positive/neutral mentions and too-few mentions", () => {
    expect(
      findRecurringWorries(
        [m("t1", "family", 1, "POSITIVE"), m("t1", "family", 8, "POSITIVE"), m("t1", "family", 15, "NEUTRAL")],
        NOW
      )
    ).toEqual([]);
    expect(findRecurringWorries([m("t2", "sleep", 1), m("t2", "sleep", 20)], NOW)).toEqual([]);
  });

  it("counts recurrence over all mentions but needs 2+ negative ones", () => {
    const two = findRecurringWorries(
      [m("t3", "work", 1, "NEUTRAL"), m("t3", "work", 8, "NEGATIVE"), m("t3", "work", 15, "NEGATIVE")],
      NOW
    );
    expect(two).toHaveLength(1);
    const one = findRecurringWorries(
      [m("t4", "work", 1, "NEGATIVE"), m("t4", "work", 8, "POSITIVE"), m("t4", "work", 15, "NEUTRAL")],
      NOW
    );
    expect(one).toEqual([]);
  });

  it("needs a real spread: 3 debriefs in the same week don't count", () => {
    expect(findRecurringWorries([m("t1", "money", 1), m("t1", "money", 2), m("t1", "money", 3)], NOW)).toEqual([]);
  });

  it("never surfaces crisis-like themes", () => {
    expect(
      findRecurringWorries([m("t9", "self-harm", 1), m("t9", "self-harm", 8), m("t9", "self-harm", 15)], NOW)
    ).toEqual([]);
  });
});

describe("findQuietGoals", () => {
  it("flags an active goal quiet for 21+ days", () => {
    const r = findQuietGoals([goal()], NOW);
    expect(r[0].text).toBe("You haven't mentioned “Run a half marathon” in 24 days");
  });

  it("skips completed, archived, on-hold, never-mentioned, too recent and very old goals", () => {
    expect(
      findQuietGoals(
        [
          goal({ status: "COMPLETE" }),
          goal({ status: "ARCHIVED" }),
          goal({ status: "ON_HOLD" }),
          goal({ lastMentionedAt: null }),
          goal({ entryRefsCount: 0 }),
          goal({ lastMentionedAt: daysAgo(10) }),
          goal({ lastMentionedAt: daysAgo(200) }),
        ],
        NOW
      )
    ).toEqual([]);
  });
});

describe("computeOpenLoops", () => {
  it("caps at 3: up to 2 worries, then goals", () => {
    const mentions = ["a", "b", "c"].flatMap((t) => [m(t, t, 1), m(t, t, 8), m(t, t, 15)]);
    const goals = [goal({ id: "g1" }), goal({ id: "g2", title: "Learn Spanish", lastMentionedAt: daysAgo(30) })];
    const r = computeOpenLoops(mentions, goals, NOW);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.kind)).toEqual(["worry", "worry", "quiet_goal"]);
  });

  it("returns nothing when nothing qualifies", () => {
    expect(computeOpenLoops([], [], NOW)).toEqual([]);
  });
});

describe("isSensitiveLabel", () => {
  it.each(["suicidal thoughts", "Self harm", "wanting to die", "abuse"])("flags %s", (s) => {
    expect(isSensitiveLabel(s)).toBe(true);
  });
  it.each(["money", "work stress", "sleep", "Run a half marathon"])("passes %s", (s) => {
    expect(isSensitiveLabel(s)).toBe(false);
  });
});
