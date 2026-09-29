import { describe, expect, it } from "vitest";

import { LEGACY_TIER, V2_TIER } from "@acuity/shared";

import { customerPricingTier } from "./pricing-tier";

describe("customerPricingTier", () => {
  it("never-paid customer gets current pricing", () => {
    expect(customerPricingTier({})).toBe("v2");
  });

  it("legacy App Store product (monthly or annual) keeps legacy pricing", () => {
    expect(customerPricingTier({ appleProductId: LEGACY_TIER.products.monthly.apple })).toBe("legacy");
    expect(customerPricingTier({ appleProductId: LEGACY_TIER.products.annual.apple })).toBe("legacy");
  });

  it("legacy Play product keeps legacy pricing", () => {
    expect(customerPricingTier({ googleProductId: LEGACY_TIER.products.monthly.google })).toBe("legacy");
  });

  it("legacy Stripe price keeps legacy pricing", () => {
    expect(customerPricingTier({ stripePriceId: LEGACY_TIER.products.monthly.stripe })).toBe("legacy");
    expect(customerPricingTier({ stripePriceId: LEGACY_TIER.products.annual.stripe })).toBe("legacy");
  });

  it("v2 products and prices get current pricing", () => {
    expect(customerPricingTier({ appleProductId: V2_TIER.products.monthly.apple })).toBe("v2");
    expect(customerPricingTier({ googleProductId: V2_TIER.products.annual.google })).toBe("v2");
    // The 5 Stripe payers who started trials before the price change but pay $9.99.
    expect(customerPricingTier({ stripePriceId: V2_TIER.products.monthly.stripe })).toBe("v2");
  });
});
