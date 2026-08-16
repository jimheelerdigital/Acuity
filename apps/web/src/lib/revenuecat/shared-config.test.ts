import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRICING_CONFIG,
  LEGACY_TIER,
  RC_ENTITLEMENT_PRO,
  RC_FLAG_DEFAULTS,
  RC_FLAG_KEYS,
  V2_TIER,
  allProductIds,
  annualSavingsPct,
  offeringIdForTier,
  parseRcFlag,
  pricingTierFor,
  rcStoreToSource,
  resolveRcFlags,
  type PricingConfig,
} from "@acuity/shared";

/**
 * These assertions guard the migration's default posture. If one of them
 * fails, something has made a billing flag default to ON or moved a live
 * price — both of which are exactly what this migration must not do.
 */

describe("RC flags — default posture", () => {
  it("defines exactly the three migration flags", () => {
    expect([...RC_FLAG_KEYS]).toEqual([
      "RC_OBSERVER",
      "RC_SOURCE_OF_TRUTH",
      "RC_SDK_PURCHASES",
    ]);
  });

  it("defaults ALL flags to off", () => {
    for (const key of RC_FLAG_KEYS) {
      expect(RC_FLAG_DEFAULTS[key]).toBe(false);
    }
  });

  it("resolves every flag to off when the env is empty", () => {
    const flags = resolveRcFlags(() => undefined);
    for (const key of RC_FLAG_KEYS) expect(flags[key]).toBe(false);
  });

  it("resolves flags independently", () => {
    const flags = resolveRcFlags((k) => (k === "RC_OBSERVER" ? "1" : undefined));
    expect(flags.RC_OBSERVER).toBe(true);
    expect(flags.RC_SOURCE_OF_TRUTH).toBe(false);
    expect(flags.RC_SDK_PURCHASES).toBe(false);
  });
});

describe("parseRcFlag — fail closed", () => {
  it("accepts only the explicit truthy allow-list", () => {
    for (const v of ["1", "true", "TRUE", "True", "on", "ON", "yes", " yes "]) {
      expect(parseRcFlag(v)).toBe(true);
    }
  });

  it("rejects everything else, including near-misses", () => {
    for (const v of ["0", "false", "", " ", "no", "off", "ture", "enabled", "2", "y"]) {
      expect(parseRcFlag(v)).toBe(false);
    }
  });

  it("rejects null and undefined", () => {
    expect(parseRcFlag(null)).toBe(false);
    expect(parseRcFlag(undefined)).toBe(false);
  });
});

describe("entitlement identifier", () => {
  it("is 'pro' — must match the RC dashboard exactly", () => {
    expect(RC_ENTITLEMENT_PRO).toBe("pro");
  });
});

describe("rcStoreToSource", () => {
  it("maps every store we support", () => {
    expect(rcStoreToSource("APP_STORE")).toBe("apple");
    expect(rcStoreToSource("MAC_APP_STORE")).toBe("apple");
    expect(rcStoreToSource("PLAY_STORE")).toBe("google_play");
    expect(rcStoreToSource("STRIPE")).toBe("stripe");
    expect(rcStoreToSource("RC_BILLING")).toBe("stripe");
    expect(rcStoreToSource("PROMOTIONAL")).toBe("comp");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(rcStoreToSource(" app_store ")).toBe("apple");
  });

  it("returns null for unknown/missing stores rather than guessing", () => {
    expect(rcStoreToSource("AMAZON")).toBeNull();
    expect(rcStoreToSource("PADDLE")).toBeNull();
    expect(rcStoreToSource(null)).toBeNull();
    expect(rcStoreToSource(undefined)).toBeNull();
    expect(rcStoreToSource("")).toBeNull();
  });
});

// ─── Pricing: the live prices must not move ──────────────────────────

describe("pricing catalog", () => {
  it("keeps the LIVE prices at $4.99 / $39.99", () => {
    expect(LEGACY_TIER.monthlyCents).toBe(499);
    expect(LEGACY_TIER.annualCents).toBe(3999);
  });

  it("defines V2 at $8.99 / $79.99", () => {
    expect(V2_TIER.monthlyCents).toBe(899);
    expect(V2_TIER.annualCents).toBe(7999);
  });

  it("defaults new pricing to OFF and grandfathering to ON", () => {
    expect(DEFAULT_PRICING_CONFIG.newPricingEnabled).toBe(false);
    expect(DEFAULT_PRICING_CONFIG.grandfatherExisting).toBe(true);
  });

  it("preserves the live Apple/Google product IDs on the legacy tier", () => {
    expect(LEGACY_TIER.products.monthly.apple).toBe(
      "com.heelerdigital.acuity.pro.monthly"
    );
    expect(LEGACY_TIER.products.annual.apple).toBe(
      "com.heelerdigital.acuity.pro.annual"
    );
    expect(LEGACY_TIER.products.monthly.google).toBe("acuity_pro_monthly");
    expect(LEGACY_TIER.products.annual.google).toBe("acuity_pro_annual");
  });

  it("computes the annual savings badge instead of hardcoding it", () => {
    // $4.99*12 = $59.88 vs $39.99 → 33%
    expect(annualSavingsPct(LEGACY_TIER)).toBe(33);
    // $8.99*12 = $107.88 vs $79.99 → 26%
    expect(annualSavingsPct(V2_TIER)).toBe(26);
  });

  it("enumerates all product ids across both tiers", () => {
    const ids = allProductIds();
    expect(ids).toContain("com.heelerdigital.acuity.pro.monthly");
    expect(ids).toContain("com.heelerdigital.acuity.pro.monthly.v2");
    expect(ids).toHaveLength(8);
  });
});

describe("pricingTierFor — grandfathering", () => {
  const enabled: PricingConfig = {
    newPricingEnabled: true,
    grandfatherExisting: true,
    cutoverAt: null,
  };

  it("returns LEGACY for everyone while new pricing is off (today)", () => {
    expect(pricingTierFor({ paidSince: null }).id).toBe("legacy");
    expect(pricingTierFor({ paidSince: new Date("2026-01-01") }).id).toBe("legacy");
  });

  it("gives V2 to a never-paid user once new pricing is on", () => {
    expect(pricingTierFor({ paidSince: null }, enabled).id).toBe("v2");
  });

  it("keeps an existing subscriber on LEGACY — the 17 stay put", () => {
    expect(pricingTierFor({ paidSince: new Date("2026-03-01") }, enabled).id).toBe(
      "legacy"
    );
  });

  it("honors a cutover date", () => {
    const cfg: PricingConfig = {
      ...enabled,
      cutoverAt: new Date("2026-09-01T00:00:00Z"),
    };
    expect(pricingTierFor({ paidSince: new Date("2026-08-01") }, cfg).id).toBe("legacy");
    expect(pricingTierFor({ paidSince: new Date("2026-10-01") }, cfg).id).toBe("v2");
  });

  it("fails toward the CHEAPER price for a legacy row with an unknown start date", () => {
    expect(
      pricingTierFor({ paidSince: null, legacyUnknownStart: true }, enabled).id
    ).toBe("legacy");
  });

  it("charges V2 to a prior subscriber only if grandfathering is explicitly off", () => {
    const cfg: PricingConfig = { ...enabled, grandfatherExisting: false };
    expect(pricingTierFor({ paidSince: new Date("2026-03-01") }, cfg).id).toBe("v2");
  });

  it("maps tiers onto the right RC offering", () => {
    expect(offeringIdForTier(LEGACY_TIER)).toBe("grandfathered");
    expect(offeringIdForTier(V2_TIER)).toBe("default");
  });
});
