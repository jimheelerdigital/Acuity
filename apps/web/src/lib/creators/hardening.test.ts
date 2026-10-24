/**
 * Creator platform hardening (2026-10-24 review).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { alreadySubscribed } from "./attribution";
import { transferGroupFor } from "./payouts";

describe("alreadySubscribed (new-accounts-only rule)", () => {
  it("a fresh account on the app's own free trial is new", () => {
    expect(alreadySubscribed({ subscriptionStatus: "TRIAL" })).toBe(false);
    expect(alreadySubscribed({ subscriptionStatus: "FREE" })).toBe(false);
  });
  it("any subscription signal means it's not new", () => {
    expect(alreadySubscribed({ subscriptionStatus: "PRO" })).toBe(true);
    expect(alreadySubscribed({ subscriptionStatus: "PAST_DUE" })).toBe(true);
    expect(alreadySubscribed({ subscriptionSource: "apple" })).toBe(true);
    expect(alreadySubscribed({ stripeSubscriptionId: "sub_1" })).toBe(true);
    expect(alreadySubscribed({ appleOriginalTransactionId: "200000" })).toBe(true);
    expect(alreadySubscribed({ googlePurchaseToken: "tok" })).toBe(true);
  });
});

describe("payout transfer group", () => {
  it("is stable per payout, so a retry finds the earlier transfer", () => {
    expect(transferGroupFor("cpo_123")).toBe("creator-payout-cpo_123");
    expect(transferGroupFor("cpo_123")).toBe(transferGroupFor("cpo_123"));
  });
});
