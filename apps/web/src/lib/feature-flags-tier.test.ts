import { describe, expect, it } from "vitest";

import { entitlementsFor } from "@/lib/entitlements";
import { tierMatches } from "@/lib/feature-flags";

/**
 * Guards the single-entitlement-authority fix: flag gating and paywall
 * gating must give the same answer for the same user.
 */

const NOW = new Date("2026-08-16T12:00:00Z");

/** Build the resolver-shaped input from a status, as isEnabled() would. */
function resolved(subscriptionStatus: string, trialEndsAt: Date | null = null) {
  const state = {
    subscriptionStatus,
    trialEndsAt,
    stripeFirstFailureAt: null,
    subscriptionSource: null,
  };
  return { entitlement: entitlementsFor(state, NOW), state };
}

const future = new Date("2026-08-20T12:00:00Z");
const past = new Date("2026-08-01T12:00:00Z");

describe("tierMatches — requiredTier PRO", () => {
  it("allows PRO", () => {
    expect(tierMatches(resolved("PRO"), "PRO")).toBe(true);
  });

  it("allows an ACTIVE TRIAL — the fix", () => {
    // Previously false. entitlementsFor grants trials the full paid feature
    // set, so a PRO-gated flag rejecting them was the inconsistency.
    expect(tierMatches(resolved("TRIAL", future), "PRO")).toBe(true);
  });

  it("denies an EXPIRED trial", () => {
    expect(tierMatches(resolved("TRIAL", past), "PRO")).toBe(false);
  });

  it("allows a brand-new account whose trialEndsAt isn't set yet", () => {
    expect(tierMatches(resolved("TRIAL", null), "PRO")).toBe(true);
  });

  it("denies FREE", () => {
    expect(tierMatches(resolved("FREE"), "PRO")).toBe(false);
  });

  it("denies PAST_DUE (no grace, matching the paywall)", () => {
    expect(tierMatches(resolved("PAST_DUE"), "PRO")).toBe(false);
  });

  it("denies an unknown status (fail closed)", () => {
    expect(tierMatches(resolved("WAT"), "PRO")).toBe(false);
  });
});

/**
 * The point of the change: for every status, a PRO-gated FLAG and a
 * PRO-gated PAYWALL now agree. Before, TRIAL was the disagreement.
 */
describe("tierMatches agrees with the paywall for every status", () => {
  const statuses: Array<[string, Date | null]> = [
    ["PRO", null],
    ["TRIAL", future],
    ["TRIAL", past],
    ["TRIAL", null],
    ["FREE", null],
    ["PAST_DUE", null],
    ["WAT", null],
  ];

  for (const [status, trialEndsAt] of statuses) {
    it(`${status}${trialEndsAt === future ? " (active)" : trialEndsAt === past ? " (expired)" : ""}`, () => {
      const r = resolved(status, trialEndsAt);
      // canExtractEntries is what requireEntitlement gates PRO features on.
      expect(tierMatches(r, "PRO")).toBe(r.entitlement.canExtractEntries);
    });
  }
});

describe("tierMatches — requiredTier FREE is intentionally unchanged", () => {
  it("still allows FREE and TRIAL (upgrade-nudge audience)", () => {
    expect(tierMatches(resolved("FREE"), "FREE")).toBe(true);
    expect(tierMatches(resolved("TRIAL", future), "FREE")).toBe(true);
    expect(tierMatches(resolved("TRIAL", past), "FREE")).toBe(true);
  });

  it("still denies PRO and PAST_DUE", () => {
    expect(tierMatches(resolved("PRO"), "FREE")).toBe(false);
    expect(tierMatches(resolved("PAST_DUE"), "FREE")).toBe(false);
  });

  it("still allows an empty status", () => {
    expect(tierMatches(resolved(""), "FREE")).toBe(true);
  });
});

describe("tierMatches — edges", () => {
  it("passes when the flag has no requiredTier, even with no user", () => {
    expect(tierMatches(null, null)).toBe(true);
    expect(tierMatches(undefined, null)).toBe(true);
  });

  it("denies a tiered flag when the user can't be resolved", () => {
    expect(tierMatches(null, "PRO")).toBe(false);
    expect(tierMatches(null, "FREE")).toBe(false);
  });

  it("denies an unrecognized tier value", () => {
    expect(tierMatches(resolved("PRO"), "ENTERPRISE")).toBe(false);
  });
});
