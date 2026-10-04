import { describe, expect, it } from "vitest";

import { appOnboardingCompleted } from "./app-onboarding";

describe("appOnboardingCompleted", () => {
  it("treats paid users as onboarded so the app stops bouncing them off /record", () => {
    expect(appOnboardingCompleted(null, "PRO")).toBe(true);
  });
  it("keeps real completion and leaves non-paid incomplete users in onboarding", () => {
    expect(appOnboardingCompleted(new Date(), "TRIAL")).toBe(true);
    expect(appOnboardingCompleted(null, "TRIAL")).toBe(false);
    expect(appOnboardingCompleted(null, "FREE")).toBe(false);
  });
});
