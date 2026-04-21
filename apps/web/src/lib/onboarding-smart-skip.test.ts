/**
 * Pure-logic tests for the onboarding smart-skip threshold. The
 * /api/user/me handler applies this rule inline; the arithmetic is
 * simple but the 30-day boundary is easy to get wrong, so a unit
 * test keeps it honest.
 *
 * Rule: if (now - createdAt) > 30 days AND onboardingCompletedAt is
 * null, finalize onboarding. Otherwise leave alone.
 */

import { describe, expect, it } from "vitest";

function shouldSmartSkip(params: {
  createdAt: Date;
  onboardingCompletedAt: Date | null;
  now: Date;
}): boolean {
  if (params.onboardingCompletedAt) return false;
  const ABANDON_MS = 30 * 24 * 60 * 60 * 1000;
  return params.now.getTime() - params.createdAt.getTime() > ABANDON_MS;
}

describe("smartSkip threshold", () => {
  const now = new Date("2026-04-21T12:00:00Z");

  it("keeps user on the flow when under 30 days old", () => {
    expect(
      shouldSmartSkip({
        createdAt: new Date("2026-04-10T12:00:00Z"),
        onboardingCompletedAt: null,
        now,
      })
    ).toBe(false);
  });

  it("keeps user on the flow exactly at 30 days old", () => {
    const exactlyThirty = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(
      shouldSmartSkip({
        createdAt: exactlyThirty,
        onboardingCompletedAt: null,
        now,
      })
    ).toBe(false);
  });

  it("skips a user who signed up 31+ days ago and never finished", () => {
    const thirtyOne = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    expect(
      shouldSmartSkip({
        createdAt: thirtyOne,
        onboardingCompletedAt: null,
        now,
      })
    ).toBe(true);
  });

  it("never skips a user who already completed onboarding", () => {
    const yearOld = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(
      shouldSmartSkip({
        createdAt: yearOld,
        onboardingCompletedAt: new Date("2025-05-01T00:00:00Z"),
        now,
      })
    ).toBe(false);
  });

  it("skips a user 3 years old who never finished", () => {
    const ancient = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
    expect(
      shouldSmartSkip({
        createdAt: ancient,
        onboardingCompletedAt: null,
        now,
      })
    ).toBe(true);
  });
});
