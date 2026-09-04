import { describe, expect, it } from "vitest";

import {
  FREE_BANNER,
  PINNED_AFTER_FIRST,
  PINNED_AFTER_SECOND,
  formatRenewalDate,
  pinnedCardFor,
  showsFreeLocks,
  showsLegacyTrialBanner,
  trialCardFor,
  trialCardLine,
} from "../../../../../apps/mobile/lib/onboarding-v10/home-state";

describe("Home pinned card", () => {
  it("appears after the first debrief and changes after the second", () => {
    expect(pinnedCardFor(1)).toBe("after_first");
    expect(pinnedCardFor(2)).toBe("after_second");
  });

  it("is GONE from the third debrief onward", () => {
    // A permanent nudge stops being guidance and becomes furniture.
    expect(pinnedCardFor(3)).toBeNull();
    expect(pinnedCardFor(10)).toBeNull();
    expect(pinnedCardFor(500)).toBeNull();
  });

  it("shows nothing at zero debriefs", () => {
    expect(pinnedCardFor(0)).toBeNull();
  });

  it("promises no specific outcome from the next debrief", () => {
    // Spec: "honest progress toward patterns (real state, no fake
    // progress)." Patterns emerge from content, not from a counter.
    const corpus = `${PINNED_AFTER_FIRST} ${PINNED_AFTER_SECOND}`.toLowerCase();
    expect(corpus).not.toContain("will unlock");
    expect(corpus).not.toContain("guaranteed");
    expect(corpus).not.toMatch(/\d+%/);
    expect(corpus).toContain("debrief");
  });
});

describe("trial card", () => {
  const base = {
    subscriptionStatus: "TRIAL" as const,
    trialEndsAt: "2026-09-15T00:00:00.000Z",
    subscriptionSource: "apple",
    localizedPrice: "$79.99",
  };

  it("shows the exact renewal date and price for an App Store trial", () => {
    const state = trialCardFor(base);
    expect(state.show).toBe(true);
    expect(state.price).toBe("$79.99");
    expect(trialCardLine(state)).toContain("Renews at $79.99");
  });

  it("shows a date, never a countdown", () => {
    // "3 days left" is what someone reads right before a surprise charge.
    const line = trialCardLine(trialCardFor(base))!;
    expect(line).not.toMatch(/days? (left|remaining)/i);
    expect(line).toContain(formatRenewalDate(new Date(base.trialEndsAt)));
  });

  it("does NOT take over a web/Stripe trial", () => {
    // Two reasons, either sufficient: the External Purchase Link entitlement
    // forbids in-app prices, and every existing Stripe subscriber already
    // has the legacy TrialBanner. Rendering this card for them would swap a
    // working countdown for a card that legally cannot name a price.
    const state = trialCardFor({ ...base, subscriptionSource: "stripe" });
    expect(state.show).toBe(false);
    expect(trialCardLine(state)).toBeNull();
    expect(showsLegacyTrialBanner({ ...base, subscriptionSource: "stripe" })).toBe(
      true
    );
  });

  it("fails closed to the legacy banner when the source is unknown", () => {
    const unknown = { ...base, subscriptionSource: null };
    expect(trialCardFor(unknown).show).toBe(false);
    expect(showsLegacyTrialBanner(unknown)).toBe(true);
  });

  it("the two trial surfaces are never both visible", () => {
    // The regression this guards: a user seeing a countdown card and a
    // renewal-date card for the same trial, in two visual languages.
    for (const source of ["apple", "google_play", "stripe", "comp", null]) {
      const input = { ...base, subscriptionSource: source };
      const both = trialCardFor(input).show && showsLegacyTrialBanner(input);
      expect(both).toBe(false);
    }
  });

  it("shows a Play Store price", () => {
    const state = trialCardFor({ ...base, subscriptionSource: "google_play" });
    expect(state.price).toBe("$79.99");
  });

  it("hides entirely outside a trial", () => {
    for (const status of ["PRO", "FREE", "PAST_DUE"]) {
      expect(trialCardFor({ ...base, subscriptionStatus: status }).show).toBe(
        false
      );
    }
  });

  it("hides when the date is missing or unparseable", () => {
    expect(trialCardFor({ ...base, trialEndsAt: null }).show).toBe(false);
    expect(trialCardFor({ ...base, trialEndsAt: "not-a-date" }).show).toBe(false);
  });

  it("omits the price when the store gave us no localized string", () => {
    // Rather than formatting our own — the store's number is the only one
    // guaranteed to match what the user is actually charged, in their
    // currency.
    const state = trialCardFor({ ...base, localizedPrice: null });
    expect(state.price).toBeNull();
  });
});

describe("free locks", () => {
  it("locks only FREE users", () => {
    expect(showsFreeLocks("FREE")).toBe(true);
    expect(showsFreeLocks("TRIAL")).toBe(false);
    expect(showsFreeLocks("PRO")).toBe(false);
  });

  it("does NOT lock a PAST_DUE user", () => {
    // A failed payment is a billing problem; stripping features mid-retry
    // punishes someone for an expired card. Matches the entitlement
    // resolver's grace behaviour.
    expect(showsFreeLocks("PAST_DUE")).toBe(false);
  });

  it("tells free users what they keep before what they lose", () => {
    expect(FREE_BANNER.indexOf("keeps")).toBeLessThan(
      FREE_BANNER.indexOf("unlock")
    );
  });
});
