import { describe, expect, it } from "vitest";

import { describePlan } from "../../../../../apps/mobile/lib/subscription-plan";

// Jimmy, 10/19 on build 183: a comped Pro account saw no subscription
// option in Settings at all. The plan row is now always shown; these pin
// what it says for every status/source we store.
describe("Settings plan row", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("names a comped Pro account instead of showing nothing", () => {
    expect(describePlan({ status: "PRO", source: "comp" })).toEqual({
      title: "Ripple Pro",
      detail: "Complimentary, nothing to pay or cancel",
    });
  });

  it("says where a paid Pro sub is billed", () => {
    expect(describePlan({ status: "PRO", source: "apple" }).detail).toBe("Billed through the App Store");
    expect(describePlan({ status: "PRO", source: "google_play" }).detail).toBe("Billed through Google Play");
    expect(describePlan({ status: "PRO", source: "stripe" }).detail).toBe("Billed on the web");
    expect(describePlan({ status: "PRO", source: "stripe", periodEnd: "2026-11-19T00:00:00Z" }).detail).toMatch(
      /^Billed on the web, renews /,
    );
    expect(describePlan({ status: "PRO", source: null }).title).toBe("Ripple Pro");
  });

  it("counts trial days down", () => {
    expect(describePlan({ status: "TRIAL", source: null, trialEndsAt: "2026-10-22T12:00:00Z", now }).detail).toBe("3 days left");
    expect(describePlan({ status: "TRIAL", source: null, trialEndsAt: "2026-10-20T11:00:00Z", now }).detail).toBe("1 day left");
    expect(describePlan({ status: "TRIAL", source: null, trialEndsAt: "2026-10-18T12:00:00Z", now }).detail).toBe("Ends today");
    expect(describePlan({ status: "TRIAL", source: null, trialEndsAt: null, now }).detail).toBe("Active");
  });

  it("covers past-due and free", () => {
    expect(describePlan({ status: "PAST_DUE", source: "stripe" }).detail).toMatch(/Payment failed/);
    expect(describePlan({ status: "FREE", source: null }).title).toBe("Free plan");
    expect(describePlan({ status: undefined, source: undefined }).title).toBe("Free plan");
  });
});
