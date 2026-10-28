import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { featureFlag: { findUnique: vi.fn() } } }));

import { armPlanValueDollars, parsePriceArm, pickPriceArm, pricesForArm, stripePriceIdFor } from "./price-test";

describe("web price test", () => {
  it("low arm is $6.99 / $39.99 with a 52% annual saving", () => {
    const p = pricesForArm("low");
    expect(p).toMatchObject({ monthly: "$6.99", annual: "$39.99", annualAsMonthly: "$3.33", savingsPct: "52%" });
  });
  it("charges the test Stripe prices for the low arm", () => {
    expect(stripePriceIdFor("low", "monthly")).toBe("price_1UVKSDD9XJakJqj5khvXc1Ul");
    expect(stripePriceIdFor("low", "yearly")).toBe("price_1TcSPvD9XJakJqj5C2dITYrR");
  });
  it("reports the arm's real value to Meta", () => {
    expect(armPlanValueDollars("low", "monthly")).toBe(6.99);
    expect(armPlanValueDollars("low", "yearly")).toBe(39.99);
  });
  it("keeps a saved arm and only accepts known values", () => {
    expect(pickPriceArm("low")).toEqual({ arm: "low", fresh: false });
    expect(pickPriceArm("bogus").fresh).toBe(true);
    expect(parsePriceArm("cheap")).toBeNull();
  });
});
