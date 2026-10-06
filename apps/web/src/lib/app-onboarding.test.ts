import { describe, expect, it } from "vitest";

import { appOnboardingCompleted } from "./app-onboarding";

describe("appOnboardingCompleted", () => {
  it("treats paid users as onboarded so the app stops bouncing them off /record", () => {
    expect(appOnboardingCompleted(null, "PRO")).toBe(true);
  });
  it("keeps real completion and leaves non-paid incomplete users in onboarding", () => {
    expect(appOnboardingCompleted(new Date(), "TRIAL")).toBe(true);
    expect(appOnboardingCompleted(null, "TRIAL")).toBe(false);
    // Web (Stripe) trial = onboarded in the funnel; in-app trials still finish app onboarding (2026-10-06).
    expect(appOnboardingCompleted(null, "TRIAL", "stripe")).toBe(true);
    expect(appOnboardingCompleted(null, "TRIAL", "apple")).toBe(false);
    expect(appOnboardingCompleted(null, "FREE")).toBe(false);
  });
});
