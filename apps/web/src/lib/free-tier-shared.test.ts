import { describe, expect, it } from "vitest";

import { isFreeTierUser } from "@acuity/shared";

/**
 * Slice 7 dedup — the partition predicate moved to @acuity/shared
 * so mobile + web (client) can share the same rule. This test runs
 * inside the apps/web vitest harness (which already imports from
 * @acuity/shared elsewhere) so any drift between the new helper
 * and the mobile callsite gets caught here.
 *
 * The corresponding rule lives in
 * apps/web/src/lib/entitlements.ts::entitlementsFor — when a user
 * has `isPostTrialFree: true` there, isFreeTierUser MUST also
 * return true. Mismatch = paywall surfaces drift apart.
 */

const NOW = new Date("2026-05-15T12:00:00Z");

describe("isFreeTierUser (shared)", () => {
  it("treats null/undefined as free (logged-out / stale session)", () => {
    expect(isFreeTierUser(null, NOW)).toBe(true);
    expect(isFreeTierUser(undefined, NOW)).toBe(true);
  });

  it("PRO is not free", () => {
    expect(isFreeTierUser({ subscriptionStatus: "PRO" }, NOW)).toBe(false);
  });

  it("PAST_DUE is not free (Stripe grace window)", () => {
    expect(isFreeTierUser({ subscriptionStatus: "PAST_DUE" }, NOW)).toBe(
      false
    );
  });

  it("TRIAL with future trialEndsAt is not free", () => {
    expect(
      isFreeTierUser(
        {
          subscriptionStatus: "TRIAL",
          trialEndsAt: new Date("2026-05-20T12:00:00Z"),
        },
        NOW
      )
    ).toBe(false);
  });

  it("TRIAL with past trialEndsAt IS free", () => {
    expect(
      isFreeTierUser(
        {
          subscriptionStatus: "TRIAL",
          trialEndsAt: new Date("2026-05-10T12:00:00Z"),
        },
        NOW
      )
    ).toBe(true);
  });

  it("TRIAL with null trialEndsAt is not free (brand-new account window)", () => {
    expect(
      isFreeTierUser(
        { subscriptionStatus: "TRIAL", trialEndsAt: null },
        NOW
      )
    ).toBe(false);
  });

  it("accepts ISO string trialEndsAt (mobile/client payloads)", () => {
    expect(
      isFreeTierUser(
        {
          subscriptionStatus: "TRIAL",
          trialEndsAt: "2026-05-20T12:00:00Z",
        },
        NOW
      )
    ).toBe(false);
    expect(
      isFreeTierUser(
        {
          subscriptionStatus: "TRIAL",
          trialEndsAt: "2026-05-10T12:00:00Z",
        },
        NOW
      )
    ).toBe(true);
  });

  it("invalid trialEndsAt string falls through to not-free (defensive)", () => {
    expect(
      isFreeTierUser(
        { subscriptionStatus: "TRIAL", trialEndsAt: "not-a-date" },
        NOW
      )
    ).toBe(false);
  });

  it("FREE is free", () => {
    expect(isFreeTierUser({ subscriptionStatus: "FREE" }, NOW)).toBe(true);
  });

  it("CANCELED is free (alias for FREE)", () => {
    expect(isFreeTierUser({ subscriptionStatus: "CANCELED" }, NOW)).toBe(
      true
    );
  });

  it("unknown subscriptionStatus is free (fail-closed)", () => {
    expect(isFreeTierUser({ subscriptionStatus: "WAT" }, NOW)).toBe(true);
  });

  it("missing subscriptionStatus is free", () => {
    expect(isFreeTierUser({}, NOW)).toBe(true);
  });
});
