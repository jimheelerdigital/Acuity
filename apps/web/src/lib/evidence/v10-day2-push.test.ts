import { describe, expect, it } from "vitest";

import {
  DAY2_DEFAULT_LOCAL_TIME,
  DAY2_PUSH,
  isDay2Cohort,
  isWithinLocalHour,
} from "@/lib/v10-day2-push";

const at = (iso: string) => new Date(iso);

describe("Day-2 cohort window", () => {
  const now = at("2026-08-21T12:00:00.000Z");

  it("includes a user created 2 days ago", () => {
    expect(isDay2Cohort(at("2026-08-19T12:00:00.000Z"), now)).toBe(true);
  });

  it("includes the far edge just under 3 days", () => {
    expect(isDay2Cohort(at("2026-08-18T12:00:01.000Z"), now)).toBe(true);
  });

  it("excludes day 1 and day 3", () => {
    expect(isDay2Cohort(at("2026-08-20T12:00:00.000Z"), now)).toBe(false);
    expect(isDay2Cohort(at("2026-08-18T11:59:00.000Z"), now)).toBe(false);
  });

  it("excludes a user created in the future", () => {
    expect(isDay2Cohort(at("2026-08-25T12:00:00.000Z"), now)).toBe(false);
  });
});

describe("local-hour matching", () => {
  it("fires in the user's local hour, not UTC", () => {
    // August is CDT (UTC-5), NOT CST (UTC-6) — so 22:30 UTC is 17:30 in
    // Chicago. Writing this as UTC-6 is the exact error this test exists
    // to catch, and it caught it.
    const now = at("2026-08-21T22:30:00.000Z");
    expect(isWithinLocalHour(now, "America/Chicago", "17:30")).toBe(true);
    // Same instant is 23:30 in London, not 17:xx.
    expect(isWithinLocalHour(now, "Europe/London", "17:30")).toBe(false);
  });

  it("shifts with daylight saving rather than assuming a fixed offset", () => {
    // Same wall-clock target, six months apart. In January Chicago is CST
    // (UTC-6), so the same 22:30 UTC is 16:30 — an hour early.
    const winter = at("2026-01-21T22:30:00.000Z");
    expect(isWithinLocalHour(winter, "America/Chicago", "17:30")).toBe(false);
    expect(isWithinLocalHour(at("2026-01-21T23:30:00.000Z"), "America/Chicago", "17:30"))
      .toBe(true);
  });

  it("handles a timezone on the other side of the date line", () => {
    // 23:30 UTC Aug 21 = 08:30 Aug 22 in Tokyo.
    const now = at("2026-08-21T23:30:00.000Z");
    expect(isWithinLocalHour(now, "Asia/Tokyo", "08:00")).toBe(true);
  });

  it("respects a slot other than the default", () => {
    // 13:10 UTC = 08:10 Chicago in CDT — the "Morning" slot.
    const now = at("2026-08-21T13:10:00.000Z");
    expect(isWithinLocalHour(now, "America/Chicago", "08:00")).toBe(true);
    expect(isWithinLocalHour(now, "America/Chicago", "17:30")).toBe(false);
  });

  it("SKIPS rather than guesses on a bad timezone", () => {
    // Sending at the wrong hour is worse than not sending — a 3am push
    // from a reflection app gets notifications disabled entirely.
    const now = at("2026-08-21T23:30:00.000Z");
    expect(isWithinLocalHour(now, "Not/AZone", "17:30")).toBe(false);
    expect(isWithinLocalHour(now, "", "17:30")).toBe(false);
  });

  it("skips a malformed local time", () => {
    const now = at("2026-08-21T23:30:00.000Z");
    expect(isWithinLocalHour(now, "America/Chicago", "banana")).toBe(false);
  });
});

describe("copy", () => {
  it("matches the spec text exactly", () => {
    expect(DAY2_PUSH.title).toBe("Anything still taking up space?");
    expect(DAY2_PUSH.body).toBe("Say it once. Ripple will keep track.");
  });

  it("defaults to 17:30 when no slot was chosen", () => {
    expect(DAY2_DEFAULT_LOCAL_TIME).toBe("17:30");
  });

  it("carries no guilt, streak, or fixed-time framing", () => {
    const corpus = `${DAY2_PUSH.title} ${DAY2_PUSH.body}`.toLowerCase();
    for (const banned of [
      "streak",
      "don't break",
      "tonight",
      "bedtime",
      "you haven't",
      "missed",
    ]) {
      expect(corpus).not.toContain(banned);
    }
  });

  it("names no price and no subscribe wording", () => {
    // Apple Option-C: payment copy lives on web only.
    const corpus = `${DAY2_PUSH.title} ${DAY2_PUSH.body}`.toLowerCase();
    expect(corpus).not.toContain("$");
    expect(corpus).not.toContain("subscribe");
    expect(corpus).not.toContain("trial");
  });
});
