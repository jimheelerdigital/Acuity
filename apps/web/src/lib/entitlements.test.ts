import { describe, expect, it } from "vitest";

import { entitlementsFor, type Entitlement } from "./entitlements";

const NOW = new Date("2026-04-19T12:00:00Z");

const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

// PRO-only flags — true on active-side (PRO/TRIAL/PAST_DUE) only.
// canRecord is intentionally NOT in this list as of v1.1 — recording
// is the FREE journaling loop. canExtractEntries replaces canRecord
// as the canonical "PRO gate" inside this set.
const PRO_ONLY_FLAGS = [
  "canExtractEntries",
  "canGenerateNewWeeklyReport",
  "canGenerateNewLifeAudit",
  "canGenerateMonthlyMemoir",
  "canRefreshLifeMap",
] as const;

function expectActive(e: Entitlement) {
  expect(e.canRecord, "canRecord should be true on active side").toBe(true);
  for (const flag of PRO_ONLY_FLAGS) {
    expect(e[flag], `${flag} should be true`).toBe(true);
  }
}

function expectLocked(e: Entitlement) {
  // v1.1: post-trial-free keeps canRecord = true (the journaling loop
  // stays alive). Only the PRO-gated flags flip false.
  expect(e.canRecord, "canRecord should be true even on post-trial-free").toBe(true);
  for (const flag of PRO_ONLY_FLAGS) {
    expect(e[flag], `${flag} should be false`).toBe(false);
  }
}

describe("entitlementsFor — PRO", () => {
  it("grants full access regardless of trialEndsAt", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PRO", trialEndsAt: null },
      NOW
    );
    expectActive(e);
    expect(e.isActive).toBe(true);
    expect(e.isTrialing).toBe(false);
    expect(e.isPastDue).toBe(false);
    expect(e.isPostTrialFree).toBe(false);
    expect(e.trialDaysRemaining).toBeNull();
  });

  it("ignores trialEndsAt in the future", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PRO", trialEndsAt: day(3) },
      NOW
    );
    expectActive(e);
    expect(e.isActive).toBe(true);
    expect(e.trialDaysRemaining).toBeNull();
  });

  it("ignores trialEndsAt long in the past", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PRO", trialEndsAt: day(-30) },
      NOW
    );
    expectActive(e);
    expect(e.isActive).toBe(true);
  });
});

describe("entitlementsFor — active TRIAL", () => {
  it("trialEndsAt === null (brand-new account before hook fires) → active, no countdown", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: null },
      NOW
    );
    expectActive(e);
    expect(e.isTrialing).toBe(true);
    expect(e.trialDaysRemaining).toBeNull();
    expect(e.isPostTrialFree).toBe(false);
  });

  it("trialEndsAt 7 days in the future → 7 days remaining", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: day(7) },
      NOW
    );
    expectActive(e);
    expect(e.isTrialing).toBe(true);
    expect(e.trialDaysRemaining).toBe(7);
  });

  it("trialEndsAt 14 days out → 14 days remaining", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: day(14) },
      NOW
    );
    expect(e.trialDaysRemaining).toBe(14);
  });

  it("fractional day remaining floors (1.5d → 1)", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: day(1.5) },
      NOW
    );
    expectActive(e);
    expect(e.trialDaysRemaining).toBe(1);
  });

  it("less than a day remaining (12h → 0)", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: day(0.5) },
      NOW
    );
    expectActive(e);
    expect(e.trialDaysRemaining).toBe(0);
  });
});

describe("entitlementsFor — expired TRIAL → post-trial free", () => {
  it("trialEndsAt 1 hour in the past → locked", () => {
    const trialEndsAt = new Date(NOW.getTime() - 60 * 60 * 1000);
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
    expect(e.isTrialing).toBe(false);
    expect(e.trialDaysRemaining).toBeNull();
  });

  it("trialEndsAt 30 days in the past → locked", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: day(-30) },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("trialEndsAt EXACTLY now → treated as expired (inclusive past)", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "TRIAL", trialEndsAt: new Date(NOW.getTime()) },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });
});

describe("entitlementsFor — FREE", () => {
  it("FREE post-trial: canRecord=true, canExtractEntries=false (v1.1 split)", () => {
    // The load-bearing rule for the v1.1 free-tier redesign: FREE
    // users keep recording but lose the extraction layer.
    const e = entitlementsFor(
      { subscriptionStatus: "FREE", trialEndsAt: null },
      NOW
    );
    expect(e.canRecord).toBe(true);
    expect(e.canExtractEntries).toBe(false);
    expect(e.canGenerateNewWeeklyReport).toBe(false);
    expect(e.canGenerateNewLifeAudit).toBe(false);
    expect(e.canGenerateMonthlyMemoir).toBe(false);
    expect(e.canRefreshLifeMap).toBe(false);
    expect(e.canViewHistory).toBe(true);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("trialEndsAt null → post-trial free", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "FREE", trialEndsAt: null },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("trialEndsAt in the past → post-trial free", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "FREE", trialEndsAt: day(-1) },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("trialEndsAt in the future (edge case — shouldn't happen) → still post-trial free", () => {
    // Per plan §3: explicit "FREE" wins over a stale trialEndsAt.
    // Status is the source of truth for the active/inactive split.
    const e = entitlementsFor(
      { subscriptionStatus: "FREE", trialEndsAt: day(3) },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });
});

describe("entitlementsFor — PAST_DUE", () => {
  it("grants full access (Stripe grace window)", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PAST_DUE", trialEndsAt: null },
      NOW
    );
    expectActive(e);
    expect(e.isPastDue).toBe(true);
    expect(e.isActive).toBe(false); // distinct flag from isActive
    expect(e.isTrialing).toBe(false);
    expect(e.isPostTrialFree).toBe(false);
  });

  it("ignores trialEndsAt", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PAST_DUE", trialEndsAt: day(-3) },
      NOW
    );
    expectActive(e);
    expect(e.isPastDue).toBe(true);
  });
});

describe("entitlementsFor — CANCELED + unknown statuses", () => {
  it("CANCELED → treated as FREE (post-trial free)", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "CANCELED", trialEndsAt: null },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("unknown status string → fail-closed to post-trial free", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "PURPLE_MONKEY_DISHWASHER", trialEndsAt: null },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });

  it("empty status string → fail-closed", () => {
    const e = entitlementsFor(
      { subscriptionStatus: "", trialEndsAt: null },
      NOW
    );
    expectLocked(e);
    expect(e.isPostTrialFree).toBe(true);
  });
});

describe("entitlementsFor — programming-error inputs", () => {
  it("throws when called with null user", () => {
    expect(() => entitlementsFor(null as never, NOW)).toThrowError(
      /entitlementsFor: user is null/
    );
  });
});

describe("entitlementsFor — invariants (property-style sweep)", () => {
  // Sweep every plausible (status, trialOffsetDays) combination
  // and assert universal properties. If any of these fail, the
  // entitlements rule has drifted — review the failure before
  // relaxing the invariant.

  const STATUSES = [
    "PRO",
    "TRIAL",
    "PAST_DUE",
    "FREE",
    "CANCELED",
    "UNKNOWN",
    "",
  ] as const;
  const OFFSETS_DAYS = [-365, -30, -1, 0, 1, 7, 14, 365] as const;

  it("canViewHistory is ALWAYS true (soft-transition invariant)", () => {
    for (const subscriptionStatus of STATUSES) {
      for (const offset of OFFSETS_DAYS) {
        const trialEndsAt = day(offset);
        const e = entitlementsFor({ subscriptionStatus, trialEndsAt }, NOW);
        expect(
          e.canViewHistory,
          `canViewHistory for status=${subscriptionStatus}, offset=${offset}d`
        ).toBe(true);
      }
      // And with trialEndsAt === null
      const e = entitlementsFor(
        { subscriptionStatus, trialEndsAt: null },
        NOW
      );
      expect(e.canViewHistory).toBe(true);
    }
  });

  it("the four state flags partition: exactly one is true at a time", () => {
    const partition = (e: Entitlement) =>
      Number(e.isActive) +
      Number(e.isTrialing) +
      Number(e.isPastDue) +
      Number(e.isPostTrialFree);

    for (const subscriptionStatus of STATUSES) {
      for (const offset of OFFSETS_DAYS) {
        const trialEndsAt = day(offset);
        const e = entitlementsFor({ subscriptionStatus, trialEndsAt }, NOW);
        expect(
          partition(e),
          `partition for status=${subscriptionStatus}, offset=${offset}d`
        ).toBe(1);
      }
      const e = entitlementsFor(
        { subscriptionStatus, trialEndsAt: null },
        NOW
      );
      expect(partition(e)).toBe(1);
    }
  });

  it("PRO-only flags require active side", () => {
    // v1.1 partition rule: PRO-only generate flags are true iff the
    // user is on the active side (isActive | isTrialing | isPastDue).
    // canRecord is excluded — it's true on BOTH the active side AND
    // the post-trial-free side (the FREE journaling loop).
    for (const subscriptionStatus of STATUSES) {
      for (const offset of OFFSETS_DAYS) {
        const trialEndsAt = day(offset);
        const e = entitlementsFor({ subscriptionStatus, trialEndsAt }, NOW);
        const onActiveSide = e.isActive || e.isTrialing || e.isPastDue;
        for (const flag of PRO_ONLY_FLAGS) {
          expect(
            e[flag],
            `${flag} for status=${subscriptionStatus}, offset=${offset}d, onActiveSide=${onActiveSide}`
          ).toBe(onActiveSide);
        }
      }
    }
  });

  it("canRecord is true everywhere except totally unknown / pathological states", () => {
    // v1.1 invariant: every recognized status (PRO, TRIAL, PAST_DUE,
    // FREE, CANCELED) lands canRecord=true. Unknown statuses fall
    // through to post-trial-free which is also canRecord=true.
    for (const subscriptionStatus of STATUSES) {
      for (const offset of OFFSETS_DAYS) {
        const trialEndsAt = day(offset);
        const e = entitlementsFor({ subscriptionStatus, trialEndsAt }, NOW);
        expect(
          e.canRecord,
          `canRecord for status=${subscriptionStatus}, offset=${offset}d`
        ).toBe(true);
      }
    }
  });

  it("trialDaysRemaining is null whenever isTrialing is false", () => {
    for (const subscriptionStatus of STATUSES) {
      for (const offset of OFFSETS_DAYS) {
        const trialEndsAt = day(offset);
        const e = entitlementsFor({ subscriptionStatus, trialEndsAt }, NOW);
        if (!e.isTrialing) {
          expect(
            e.trialDaysRemaining,
            `trialDaysRemaining when !isTrialing (status=${subscriptionStatus}, offset=${offset}d)`
          ).toBeNull();
        }
      }
    }
  });
});

describe("entitlementsFor — defaults `now` to wall-clock time", () => {
  it("uses Date.now() when `now` not passed", () => {
    // Trial 30 days in the future relative to wall-clock — should
    // be active no matter what now-it-is.
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const e = entitlementsFor({
      subscriptionStatus: "TRIAL",
      trialEndsAt,
    });
    expect(e.isTrialing).toBe(true);
    expect(e.trialDaysRemaining).toBeGreaterThanOrEqual(29);
    expect(e.trialDaysRemaining).toBeLessThanOrEqual(30);
  });
});
