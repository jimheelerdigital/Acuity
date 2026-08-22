import { describe, expect, it } from "vitest";

import {
  buildPaywallCopy,
  COMPARISON_ROWS,
  TRIAL_DAYS,
} from "../../../../../apps/mobile/lib/onboarding-v10/paywall-config";
import { LEGACY_TIER, V2_TIER } from "@acuity/shared";

/**
 * Paywall copy is derived, not typed. These assert the derivations, because
 * a wrong price on an auto-renewable subscription is a compliance problem
 * rather than a cosmetic one.
 *
 * Lives in apps/web because that is where the test runner is; the module
 * under test is dependency-free on purpose so it imports cleanly here.
 */

describe("v10 paywall copy", () => {
  it("quotes the V2 prices the spec asks for", () => {
    const c = buildPaywallCopy(V2_TIER, "B");
    expect(c.annual.price).toBe("$89.99/yr");
    expect(c.monthly.price).toBe("$9.99/mo");
    expect(c.annual.subPrice).toBe("$7.50/mo");
  });

  it("computes the annual saving rather than hardcoding it", () => {
    // $9.99 x 12 = $119.88 vs $89.99 → 24.9%, rounds to 25.
    expect(buildPaywallCopy(V2_TIER, "B").annual.note).toBe("Save 25%");
  });

  it("still renders correctly on the legacy tier", () => {
    // newPricingEnabled is off today, so this is what real users would see
    // if the paywall shipped right now.
    const c = buildPaywallCopy(LEGACY_TIER, "B");
    expect(c.annual.price).toBe("$39.99/yr");
    expect(c.monthly.price).toBe("$4.99/mo");
  });

  it("NEVER renders a strike-through under anchor B", () => {
    const c = buildPaywallCopy(V2_TIER, "B");
    expect(c.annual.strikeThrough).toBeNull();
    expect(c.monthly.strikeThrough).toBeNull();
  });

  it("refuses anchor A while no real launch-window date exists", () => {
    // Spec §1 bans fake strike-through prices. Anchor A without the dated
    // window behind it has nothing real to strike through, so it must
    // degrade to B rather than invent a comparison.
    const c = buildPaywallCopy(V2_TIER, "A");
    expect(c.annual.strikeThrough).toBeNull();
    expect(c.monthly.note).toBe("Starts today.");
  });

  it("uses a trial only on annual, and only 7 days", () => {
    const c = buildPaywallCopy(V2_TIER, "B");
    expect(TRIAL_DAYS).toBe(7);
    expect(c.annual.eyebrow).toContain("7 days");
    expect(c.monthly.eyebrow).not.toContain("day");
    expect(c.timeline("monthly")).toHaveLength(1);
    expect(c.timeline("annual")).toHaveLength(3);
  });

  it("never labels the CTA 'Subscribe' or 'Continue'", () => {
    const c = buildPaywallCopy(V2_TIER, "B");
    for (const plan of ["annual", "monthly"] as const) {
      const { label } = c.cta(plan);
      expect(label.toLowerCase()).not.toContain("subscribe");
      expect(label.toLowerCase()).not.toContain("continue");
    }
  });

  it("states the real charge in the annual fine print", () => {
    const { finePrint } = buildPaywallCopy(V2_TIER, "B").cta("annual");
    expect(finePrint).toContain("$0 today");
    expect(finePrint).toContain("$89.99/yr");
    expect(finePrint).toContain("unless you cancel");
  });

  it("carries the product ids for the tier, not the other tier's", () => {
    const c = buildPaywallCopy(V2_TIER, "B");
    expect(c.annual.productId.apple).toBe(V2_TIER.products.annual.apple);
    expect(c.monthly.productId.google).toBe(V2_TIER.products.monthly.google);
  });

  it("lists the four comparison rows with Patterns gated", () => {
    expect(COMPARISON_ROWS).toHaveLength(4);
    const patterns = COMPARISON_ROWS.find((r) => r.label === "Patterns");
    expect(patterns?.free).toBe(false);
    expect(patterns?.pro).toBe(true);
  });
});
