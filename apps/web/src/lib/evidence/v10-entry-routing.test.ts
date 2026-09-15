import { describe, expect, it } from "vitest";

import {
  LEGACY_ONBOARDING_KEYS,
  decideColdStartRoute,
  hasAppHistoryFromKeys,
  isHistoryKey,
  type ColdStartFacts,
} from "../../../../../apps/mobile/lib/onboarding-v10/entry-routing";

const base: ColdStartFacts = {
  v10Enabled: true,
  signedIn: false,
  onboardingCompleted: false,
  subscriptionStatus: null,
  isGuest: false,
  v10Offered: false,
  v10Dismissed: false,
  hasAppHistory: false,
  segment: "(tabs)",
};

const at = (f: Partial<ColdStartFacts>) => decideColdStartRoute({ ...base, ...f });

describe("cold start — the new case", () => {
  it("routes a fresh install into v10", () => {
    expect(at({})).toBe("v10");
  });

  it("does nothing when the flag is off", () => {
    // The whole flag-OFF contract: byte-identical behaviour to before.
    expect(at({ v10Enabled: false })).toBe("signin");
  });
});

describe("cold start — who must NOT get the funnel", () => {
  it("sends a returning signed-out user to sign-in", () => {
    // Idle expiry cleared their token after 30 days. They have an account
    // and possibly a subscription; a signup funnel is the wrong answer.
    expect(at({ hasAppHistory: true })).toBe("signin");
  });

  it("keeps honouring an explicit Sign in choice on later launches", () => {
    // Sticky, not per-launch. Otherwise a reinstalling subscriber who found
    // the escape hatch gets the funnel again every single cold start.
    expect(at({ v10Dismissed: true })).toBe("signin");
    expect(at({ v10Dismissed: true, v10Offered: true })).toBe("signin");
  });

  it("never redirects away from the auth screens", () => {
    expect(at({ segment: "(auth)" })).toBe("stay");
    expect(at({ segment: "(auth)", hasAppHistory: true })).toBe("stay");
  });

  it("never interrupts the magic-link token exchange", () => {
    expect(at({ segment: "auth-callback" })).toBe("stay");
  });

  it("leaves the deep-link funnel path alone", () => {
    expect(at({ segment: "onboarding-new" })).toBe("stay");
  });
});

describe("guest state", () => {
  it("lets a guest stay in the app", () => {
    // The bug this fixes: Screen 7's "Later" does replace('/(tabs)'), and
    // AuthGate immediately bounced it to sign-in. The button looked dead.
    expect(at({ isGuest: true })).toBe("stay");
  });

  it("keeps working for a guest with app history", () => {
    expect(at({ isGuest: true, hasAppHistory: true })).toBe("stay");
  });
});

describe("resuming mid-funnel", () => {
  it("returns to v10 rather than restarting at sign-in", () => {
    // Force-quit on Screen 3 then relaunch. Without this they land on
    // sign-in holding an account they never created.
    expect(at({ v10Offered: true })).toBe("v10");
  });

  it("resumes even once app history exists", () => {
    // By Screen 4 the funnel itself has written cached data, so history
    // would otherwise flip them to sign-in mid-flow.
    expect(at({ v10Offered: true, hasAppHistory: true })).toBe("v10");
  });
});

describe("signed in", () => {
  it("suppresses the legacy post-signup flow for v10 arrivals", () => {
    // They already recorded, saw a reveal, made a paywall decision and set
    // a reminder. /onboarding?step=N would be a second onboarding.
    expect(
      at({ signedIn: true, onboardingCompleted: false, v10Offered: true })
    ).toBe("home");
  });

  it("still runs the legacy flow for non-v10 signups", () => {
    expect(at({ signedIn: true, onboardingCompleted: false })).toBe(
      "legacy-onboarding"
    );
  });

  it("keeps the PRO bypass ahead of everything", () => {
    expect(
      at({ signedIn: true, onboardingCompleted: false, subscriptionStatus: "PRO" })
    ).toBe("home");
  });

  it("sends a completed user out of the auth/onboarding stacks", () => {
    expect(
      at({ signedIn: true, onboardingCompleted: true, segment: "(auth)" })
    ).toBe("home");
    expect(
      at({ signedIn: true, onboardingCompleted: true, segment: "onboarding" })
    ).toBe("home");
  });

  it("leaves a settled signed-in user alone", () => {
    expect(
      at({ signedIn: true, onboardingCompleted: true, segment: "(tabs)" })
    ).toBe("stay");
  });

  it("never routes a signed-in user into v10", () => {
    for (const seg of ["(tabs)", "(auth)", "onboarding", "entry"]) {
      const r = at({ signedIn: true, onboardingCompleted: true, segment: seg });
      expect(r).not.toBe("v10");
    }
  });
});

describe("app-history detection", () => {
  it("ignores keys written during boot", () => {
    // These race the auth-context boot effect. Counting them would make a
    // fresh install look like a returning user about half the time.
    expect(isHistoryKey("acuity_has_launched")).toBe(false);
    expect(isHistoryKey("acuity_last_active_ms")).toBe(false);
    expect(hasAppHistoryFromKeys(["acuity_has_launched", "acuity_last_active_ms"]))
      .toBe(false);
  });

  it("ignores our own v10 markers", () => {
    // They describe the current funnel attempt, not pre-v10 history.
    expect(isHistoryKey("ripple.v10.branch")).toBe(false);
    expect(isHistoryKey("ripple.v10.guest")).toBe(false);
  });

  it("counts real evidence of prior use", () => {
    expect(isHistoryKey("acuity.tour.completed")).toBe(true);
    expect(isHistoryKey("acuity.haptics")).toBe(true);
    expect(isHistoryKey("acuity.push.denied_at")).toBe(true);
  });

  it("treats empty storage as a fresh install", () => {
    expect(hasAppHistoryFromKeys([])).toBe(false);
  });

  it("ignores third-party keys it cannot attribute", () => {
    expect(isHistoryKey("EXPO_CONSTANTS")).toBe(false);
    expect(hasAppHistoryFromKeys(["some-vendor-cache"])).toBe(false);
  });
});

describe("returning signed-out subscriber — the churn case", () => {
  it("every legacy onboarding key routes to sign-in, not the funnel", () => {
    for (const key of LEGACY_ONBOARDING_KEYS) {
      expect(isHistoryKey(key)).toBe(true);
      expect(
        decideColdStartRoute({ ...base, hasAppHistory: hasAppHistoryFromKeys([key]) })
      ).toBe("signin");
    }
  });

  it("a SecureStore token alone is enough to keep them out", () => {
    // use-cold-start-facts ORs the token into hasAppHistory. On iOS the
    // keychain survives app deletion, so this is the signal that catches a
    // reinstalling subscriber whose token the server later rejects.
    expect(decideColdStartRoute({ ...base, hasAppHistory: true })).toBe("signin");
  });

  it("the escape hatch survives a relaunch", () => {
    // Tapping "Sign in" on Screen 1 sets dismissed. If that were not
    // sticky, the next cold launch would drop them back into the funnel.
    expect(decideColdStartRoute({ ...base, v10Dismissed: true })).toBe("signin");
  });
});