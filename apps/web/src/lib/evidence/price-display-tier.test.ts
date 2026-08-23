import { describe, expect, it, vi } from "vitest";

import { LEGACY_TIER, V2_TIER } from "@acuity/shared";

/**
 * Price DISPLAY must come from the tier system, and must be behaviour-
 * neutral until `newPricingEnabled` flips.
 *
 * The failure this guards is the one named in
 * docs/REVENUECAT_STAGE2_RUNBOOK.md §3.3: checkout starts charging the V2
 * price while a page still advertises the old one. A page that quotes a
 * different number than the card is charged is the worst outcome in the
 * whole pricing change, and nothing about it fails a typecheck.
 */

async function fresh() {
  vi.resetModules();
  return import("@/lib/pricing");
}

describe("display resolves LEGACY while the flag is off — today's state", () => {
  it("shows $4.99 / $39.99 with the flag unset", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_NEW_PRICING_ENABLED", "");
    const p = await fresh();
    expect(p.displayMonthly()).toBe("$4.99");
    expect(p.displayAnnual()).toBe("$39.99");
    vi.unstubAllEnvs();
  });

  it("shows LEGACY when the flag is explicitly false", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "false");
    const p = await fresh();
    expect(p.displayTier().id).toBe("legacy");
    vi.unstubAllEnvs();
  });

  it("fails CLOSED on a malformed flag value", async () => {
    // A typo must never advertise a price checkout is not charging.
    for (const bad of ["0", "ture", "2", "off", "yes please"]) {
      vi.stubEnv("NEW_PRICING_ENABLED", bad);
      const p = await fresh();
      expect(p.displayTier().id, `"${bad}" must not enable`).toBe("legacy");
      vi.unstubAllEnvs();
    }
  });
});

describe("display follows the flag when it flips", () => {
  it("moves to $9.99 / $89.99 once enabled", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "true");
    const p = await fresh();
    expect(p.displayMonthly()).toBe("$9.99");
    expect(p.displayAnnual()).toBe("$89.99");
    expect(p.displayTier().id).toBe("v2");
    vi.unstubAllEnvs();
  });

  it("derives the per-month annual figure rather than hardcoding it", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "true");
    const p = await fresh();
    // 8999 / 12 = 749.9 -> 750
    expect(p.displayAnnualAsMonthly()).toBe("$7.50");
    vi.unstubAllEnvs();
  });
});

describe("legacy copy stays legacy on purpose", () => {
  it("legacyPriceDisplay() is pinned to LEGACY even with the flag on", async () => {
    // Grandfathering copy ("existing subscribers keep $4.99") must NOT move
    // when new pricing ships — that is the promise being described.
    vi.stubEnv("NEW_PRICING_ENABLED", "true");
    const p = await fresh();
    expect(p.legacyPriceDisplay()).toBe("$4.99");
    vi.unstubAllEnvs();
  });

  it("the exported LEGACY constants never move", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "true");
    const p = await fresh();
    expect(p.MONTHLY_PRICE_CENTS).toBe(LEGACY_TIER.monthlyCents);
    expect(p.ANNUAL_PRICE_CENTS).toBe(LEGACY_TIER.annualCents);
    vi.unstubAllEnvs();
  });

  it("V2 is the tier the display resolves to, not a separate literal", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "1");
    const p = await fresh();
    expect(p.displayTier().monthlyCents).toBe(V2_TIER.monthlyCents);
    vi.unstubAllEnvs();
  });
});
