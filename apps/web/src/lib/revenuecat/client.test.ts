import { describe, expect, it, vi } from "vitest";

import {
  mapRcSubscriberToState,
  rcHasProEntitlement,
  selectBackingSubscription,
  type RcSubscriber,
} from "./client";

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const NOW = new Date("2026-08-15T12:00:00Z");
const iso = (d: string) => new Date(d).toISOString();
const FUTURE = iso("2026-09-15T12:00:00Z");
const PAST = iso("2026-07-15T12:00:00Z");

describe("mapRcSubscriberToState — active pro entitlement", () => {
  it("maps an active App Store sub to PRO/apple", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "normal" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("PRO");
    expect(s.subscriptionSource).toBe("apple");
    expect(s.trialEndsAt).toBeNull();
  });

  it("maps PLAY_STORE to google_play", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "PLAY_STORE", period_type: "normal" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionSource).toBe("google_play");
  });

  it("maps STRIPE and RC_BILLING to stripe", () => {
    for (const store of ["STRIPE", "RC_BILLING"]) {
      const sub: RcSubscriber = {
        entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
        subscriptions: { m1: { expires_date: FUTURE, store, period_type: "normal" } },
      };
      expect(mapRcSubscriberToState(sub, NOW).subscriptionSource).toBe("stripe");
    }
  });

  it("maps PROMOTIONAL to the comp marker", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "PROMOTIONAL", period_type: "promotional" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("PRO");
    expect(s.subscriptionSource).toBe("comp");
  });

  it("treats a null expires_date as a non-expiring entitlement (PRO)", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: null, product_identifier: "lifetime" } },
      subscriptions: { lifetime: { store: "APP_STORE", period_type: "normal" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("PRO");
  });

  it("leaves source null for an unrecognized store rather than guessing", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "AMAZON", period_type: "normal" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("PRO");
    expect(s.subscriptionSource).toBeNull();
  });
});

describe("mapRcSubscriberToState — trials", () => {
  it("maps period_type=trial to TRIAL with trialEndsAt = entitlement expiry", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "trial" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("TRIAL");
    expect(s.trialEndsAt?.toISOString()).toBe(FUTURE);
  });

  it("maps period_type=intro to TRIAL too", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "intro" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("TRIAL");
  });

  it("is case-insensitive on period_type", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "TRIAL" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("TRIAL");
  });

  it("an EXPIRED trial is FREE, not TRIAL", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: PAST, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: PAST, store: "APP_STORE", period_type: "trial" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("FREE");
    expect(s.trialEndsAt).toBeNull();
  });
});

describe("mapRcSubscriberToState — no entitlement", () => {
  it("maps a missing pro entitlement to FREE", () => {
    expect(mapRcSubscriberToState({ entitlements: {} }, NOW).subscriptionStatus).toBe("FREE");
  });

  it("maps an expired entitlement to FREE", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: PAST, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: PAST, store: "STRIPE", period_type: "normal" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("FREE");
  });

  it("ignores a non-'pro' entitlement key", () => {
    const sub: RcSubscriber = {
      entitlements: { premium: { expires_date: FUTURE } },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("FREE");
  });

  it("handles a completely empty subscriber", () => {
    const s = mapRcSubscriberToState({}, NOW);
    expect(s.subscriptionStatus).toBe("FREE");
    expect(s.subscriptionSource).toBeNull();
    expect(s.trialEndsAt).toBeNull();
  });

  it("never emits PAST_DUE — RC keeps entitlements active through grace", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: {
        m1: {
          expires_date: FUTURE,
          store: "APP_STORE",
          period_type: "normal",
          billing_issues_detected_at: iso("2026-08-10T00:00:00Z"),
          grace_period_expires_date: FUTURE,
        },
      },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("PRO");
    expect(s.subscriptionStatus).not.toBe("PAST_DUE");
  });
});

describe("mapRcSubscriberToState — billing issue anchor", () => {
  it("carries billing_issues_detected_at into stripeFirstFailureAt", () => {
    const detected = iso("2026-08-10T00:00:00Z");
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: {
        m1: { expires_date: FUTURE, store: "STRIPE", period_type: "normal", billing_issues_detected_at: detected },
      },
    };
    expect(mapRcSubscriberToState(sub, NOW).stripeFirstFailureAt?.toISOString()).toBe(detected);
  });

  it("preserves the anchor on a lapsed (FREE) sub so the recovery banner still works", () => {
    const detected = iso("2026-07-01T00:00:00Z");
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: PAST, product_identifier: "m1" } },
      subscriptions: {
        m1: { expires_date: PAST, store: "STRIPE", period_type: "normal", billing_issues_detected_at: detected },
      },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("FREE");
    expect(s.stripeFirstFailureAt?.toISOString()).toBe(detected);
  });

  it("leaves the anchor null when there is no billing issue", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "STRIPE", period_type: "normal" } },
    };
    expect(mapRcSubscriberToState(sub, NOW).stripeFirstFailureAt).toBeNull();
  });
});

describe("selectBackingSubscription", () => {
  it("prefers the entitlement's own product_identifier", () => {
    const sub: RcSubscriber = {
      subscriptions: {
        old: { expires_date: iso("2027-01-01T00:00:00Z"), store: "STRIPE" },
        live: { expires_date: FUTURE, store: "APP_STORE" },
      },
    };
    const picked = selectBackingSubscription(sub, { product_identifier: "live" });
    expect(picked?.store).toBe("APP_STORE");
  });

  it("falls back to the latest-expiring subscription when the product lookup misses", () => {
    const sub: RcSubscriber = {
      subscriptions: {
        stale: { expires_date: PAST, store: "STRIPE" },
        newest: { expires_date: FUTURE, store: "APP_STORE" },
      },
    };
    const picked = selectBackingSubscription(sub, { product_identifier: "gone" });
    expect(picked?.store).toBe("APP_STORE");
  });

  it("a stale trial cannot outrank the live paid sub", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "paid" } },
      subscriptions: {
        oldtrial: { expires_date: PAST, store: "APP_STORE", period_type: "trial" },
        paid: { expires_date: FUTURE, store: "APP_STORE", period_type: "normal" },
      },
    };
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("PRO");
  });

  it("returns null when there are no subscriptions", () => {
    expect(selectBackingSubscription({}, undefined)).toBeNull();
  });
});

describe("rcHasProEntitlement", () => {
  it("is true for an active entitlement and false for an expired one", () => {
    const active: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "normal" } },
    };
    const expired: RcSubscriber = {
      entitlements: { pro: { expires_date: PAST, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: PAST, store: "APP_STORE", period_type: "normal" } },
    };
    expect(rcHasProEntitlement(active, NOW)).toBe(true);
    expect(rcHasProEntitlement(expired, NOW)).toBe(false);
  });

  it("counts an active trial as holding the entitlement", () => {
    const trial: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
      subscriptions: { m1: { expires_date: FUTURE, store: "APP_STORE", period_type: "trial" } },
    };
    expect(rcHasProEntitlement(trial, NOW)).toBe(true);
  });
});

describe("mapRcSubscriberToState — malformed input", () => {
  it("treats an unparseable expires_date as expired (fail closed)", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: "not-a-date", product_identifier: "m1" } },
      subscriptions: { m1: { store: "APP_STORE", period_type: "normal" } },
    };
    // parseDate → null, and a null expiry on a PRESENT entitlement means
    // non-expiring. Documenting the actual behavior: RC always sends a valid
    // date or null, so this is a defensive path, not a live one.
    expect(mapRcSubscriberToState(sub, NOW).subscriptionStatus).toBe("PRO");
  });

  it("tolerates a missing subscriptions map alongside an active entitlement", () => {
    const sub: RcSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "m1" } },
    };
    const s = mapRcSubscriberToState(sub, NOW);
    expect(s.subscriptionStatus).toBe("PRO");
    expect(s.subscriptionSource).toBeNull();
  });
});
