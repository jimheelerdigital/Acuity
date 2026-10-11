import { describe, expect, it } from "vitest";

import { decideWelcome, latestGrant, mayBeWelcomeEligible } from "./welcome-eligibility";

const web = { subscriptionStatus: "PRO", subscriptionSource: "stripe", onboardingCompletedAt: null };

describe("welcome eligibility", () => {
  it("web PRO, never onboarded, no entries: eligible", () => {
    expect(decideWelcome(web, [], false)).toEqual({ welcomeEligible: true, webDebriefEntryId: null });
  });
  it("Stripe TRIAL counts too", () => {
    expect(decideWelcome({ ...web, subscriptionStatus: "TRIAL" }, [], false).welcomeEligible).toBe(true);
  });
  it("one entry from the web first debrief: eligible, returns that entry", () => {
    expect(decideWelcome(web, ["e1"], true)).toEqual({ welcomeEligible: true, webDebriefEntryId: "e1" });
  });
  it("one entry recorded in the app (no web debrief event): not eligible", () => {
    expect(decideWelcome(web, ["e1"], false).welcomeEligible).toBe(false);
  });
  it("two or more entries: not eligible, even with the web event", () => {
    expect(decideWelcome(web, ["e1", "e2"], true).welcomeEligible).toBe(false);
  });
  it("onboarding actually completed: not eligible", () => {
    expect(decideWelcome({ ...web, onboardingCompletedAt: new Date() }, [], false).welcomeEligible).toBe(false);
  });
  it("non-Stripe sources and FREE are left alone", () => {
    expect(mayBeWelcomeEligible({ ...web, subscriptionSource: "apple" })).toBe(false);
    expect(mayBeWelcomeEligible({ ...web, subscriptionSource: null, subscriptionStatus: "TRIAL" })).toBe(false);
    expect(mayBeWelcomeEligible({ ...web, subscriptionStatus: "FREE" })).toBe(false);
  });
  it("consent state is the latest ledger row", () => {
    expect(latestGrant([])).toBe(false);
    expect(latestGrant([{ granted: true }, { granted: false }])).toBe(true);
    expect(latestGrant([{ granted: false }, { granted: true }])).toBe(false);
  });
});
