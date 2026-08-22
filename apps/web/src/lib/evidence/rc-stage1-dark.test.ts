import { describe, expect, it, vi } from "vitest";

import {
  LEGACY_TIER,
  RC_FLAG_DEFAULTS,
  RC_FLAG_KEYS,
  V2_TIER,
  parseRcFlag,
  pricingTierFor,
  resolveRcFlags,
} from "@acuity/shared";

/**
 * Stage 1 proof: RevenueCat is merged but DARK.
 *
 * Asserts the POSTURE, not the plumbing — that with no RC env vars set,
 * nothing changes for a production user. Stage 2 flips flags; this file is
 * what says Stage 1 didn't.
 */

describe("RC flags default off", () => {
  it("all three default to false", () => {
    expect(RC_FLAG_DEFAULTS).toEqual({
      RC_OBSERVER: false,
      RC_SOURCE_OF_TRUTH: false,
      RC_SDK_PURCHASES: false,
    });
  });

  it("an empty environment — production today — resolves every flag off", () => {
    const flags = resolveRcFlags(() => undefined);
    for (const k of RC_FLAG_KEYS) expect(flags[k]).toBe(false);
  });

  it("fails CLOSED on malformed values", () => {
    // A billing flag must never read a typo as "go live".
    for (const bad of ["0", "false", "", "ture", "yes please", "2", "off"]) {
      expect(parseRcFlag(bad), `"${bad}" must not enable`).toBe(false);
    }
  });

  it("enables only on the documented values, trimming whitespace", () => {
    // Trimming is deliberate: an env var that picked up trailing space and
    // silently meant "off" is the worse failure, and it fails OPEN.
    for (const good of ["1", "true", "on", "yes", "TRUE", " on "]) {
      expect(parseRcFlag(good), `"${good}" should enable`).toBe(true);
    }
  });
});

describe("entitlement source stays the DB", () => {
  it("activeSourceName() is 'db' when RC_SOURCE_OF_TRUTH is unset", async () => {
    vi.resetModules();
    vi.stubEnv("RC_SOURCE_OF_TRUTH", "");
    const { activeSourceName } = await import("@/lib/entitlements/resolve");
    expect(activeSourceName()).toBe("db");
    vi.unstubAllEnvs();
  });

  it("activeSourceName() is 'db' when explicitly 'false'", async () => {
    vi.resetModules();
    vi.stubEnv("RC_SOURCE_OF_TRUTH", "false");
    const { activeSourceName } = await import("@/lib/entitlements/resolve");
    expect(activeSourceName()).toBe("db");
    vi.unstubAllEnvs();
  });
});

describe("pricing stays LEGACY — its own separate flag", () => {
  it("everyone resolves LEGACY while newPricingEnabled is off", () => {
    const tier = pricingTierFor(
      { paidSince: null, legacyUnknownStart: false },
      { newPricingEnabled: false, grandfatherExisting: true, cutoverAt: null }
    );
    expect(tier.id).toBe("legacy");
    expect(tier.monthlyCents).toBe(499);
  });

  it("an existing paid user is grandfathered even once new pricing is on", () => {
    const tier = pricingTierFor(
      { paidSince: new Date("2026-01-01"), legacyUnknownStart: false },
      { newPricingEnabled: true, grandfatherExisting: true, cutoverAt: null }
    );
    expect(tier.id).toBe("legacy");
  });

  it("V2 carries the confirmed $9.99 / $89.99", () => {
    expect(V2_TIER.monthlyCents).toBe(999);
    expect(V2_TIER.annualCents).toBe(8999);
  });

  it("LEGACY is untouched at $4.99 / $39.99", () => {
    // The whole promise to existing subscribers.
    expect(LEGACY_TIER.monthlyCents).toBe(499);
    expect(LEGACY_TIER.annualCents).toBe(3999);
  });
});
