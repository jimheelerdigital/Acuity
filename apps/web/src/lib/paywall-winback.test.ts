import { describe, expect, it } from "vitest";

import { isWinbackEligible, nextWinbackStep, PAYWALL_WINBACK_START } from "./paywall-winback";

const base = { isAdmin: false, internal: false, subscriptionStatus: "TRIAL", subscriptionSource: null, stripeSubscriptionId: null, paid: false };
const H = 3600_000;
const start = PAYWALL_WINBACK_START.getTime();

describe("isWinbackEligible", () => {
  it("accepts someone who left the paywall without paying", () => {
    expect(isWinbackEligible(base)).toBe(true);
    expect(isWinbackEligible({ ...base, subscriptionStatus: "FREE" })).toBe(true);
  });
  it("skips payers, store/comp subscribers, admins and internal accounts", () => {
    expect(isWinbackEligible({ ...base, subscriptionStatus: "PRO" })).toBe(false);
    expect(isWinbackEligible({ ...base, stripeSubscriptionId: "sub_1" })).toBe(false);
    expect(isWinbackEligible({ ...base, subscriptionSource: "apple" })).toBe(false);
    expect(isWinbackEligible({ ...base, subscriptionSource: "comp" })).toBe(false);
    expect(isWinbackEligible({ ...base, paid: true })).toBe(false);
    expect(isWinbackEligible({ ...base, isAdmin: true })).toBe(false);
    expect(isWinbackEligible({ ...base, internal: true })).toBe(false);
  });
});

describe("nextWinbackStep", () => {
  const paywall = new Date(start + 2 * H);
  it("waits 45 minutes after the last paywall view", () => {
    expect(nextWinbackStep({ now: new Date(paywall.getTime() + 30 * 60_000), lastPaywallAt: paywall, sent: {} })).toBeNull();
    expect(nextWinbackStep({ now: new Date(paywall.getTime() + 50 * 60_000), lastPaywallAt: paywall, sent: {} })).toBe("paywall_winback_1");
  });
  it("sends #2 a day after #1 and #3 two days after #2", () => {
    const s1 = new Date(paywall.getTime() + H);
    expect(nextWinbackStep({ now: new Date(s1.getTime() + 23 * H), lastPaywallAt: paywall, sent: { paywall_winback_1: s1 } })).toBeNull();
    expect(nextWinbackStep({ now: new Date(s1.getTime() + 25 * H), lastPaywallAt: paywall, sent: { paywall_winback_1: s1 } })).toBe("paywall_winback_2");
    const s2 = new Date(s1.getTime() + 25 * H);
    expect(nextWinbackStep({ now: new Date(s2.getTime() + 47 * H), lastPaywallAt: paywall, sent: { paywall_winback_1: s1, paywall_winback_2: s2 } })).toBeNull();
    expect(nextWinbackStep({ now: new Date(s2.getTime() + 49 * H), lastPaywallAt: paywall, sent: { paywall_winback_1: s1, paywall_winback_2: s2 } })).toBe("paywall_winback_3");
  });
  it("stops after #3, ignores old views and anything before the start date", () => {
    const s = new Date(paywall.getTime() + H);
    expect(nextWinbackStep({ now: new Date(paywall.getTime() + 100 * H), lastPaywallAt: paywall, sent: { paywall_winback_1: s, paywall_winback_2: s, paywall_winback_3: s } })).toBeNull();
    expect(nextWinbackStep({ now: new Date(paywall.getTime() + 8 * 24 * H), lastPaywallAt: paywall, sent: {} })).toBeNull();
    const before = new Date(start - H);
    expect(nextWinbackStep({ now: new Date(start + H), lastPaywallAt: before, sent: {} })).toBeNull();
  });
});
