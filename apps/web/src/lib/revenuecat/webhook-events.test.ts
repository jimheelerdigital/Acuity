import { describe, expect, it, vi } from "vitest";

import {
  decideRcWebhookAction,
  rcDecisionToUpdateData,
  type RcWebhookDecision,
  type RcWebhookEvent,
  type UserStateForRcEvent,
} from "./webhook-events";

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const NOW = new Date("2026-08-15T12:00:00Z");
const FUTURE_MS = new Date("2026-09-15T12:00:00Z").getTime();
const PAST_MS = new Date("2026-07-15T12:00:00Z").getTime();

const ev = (over: Partial<RcWebhookEvent> = {}): RcWebhookEvent => ({
  id: "evt_1",
  type: "RENEWAL",
  app_user_id: "u1",
  product_id: "com.heelerdigital.acuity.pro.monthly",
  period_type: "NORMAL",
  store: "APP_STORE",
  environment: "PRODUCTION",
  entitlement_ids: ["pro"],
  expiration_at_ms: FUTURE_MS,
  ...over,
});

const user = (over: Partial<UserStateForRcEvent> = {}): UserStateForRcEvent => ({
  id: "u1",
  subscriptionStatus: "PRO",
  subscriptionSource: "apple",
  ...over,
});

/** Narrow to a set-status decision or fail the test with a useful message. */
function expectSetStatus(d: RcWebhookDecision) {
  if (d.action !== "set-status") {
    throw new Error(`expected set-status, got ${d.action}: ${d.reason}`);
  }
  return d;
}

// ─── Granting events ─────────────────────────────────────────────────

describe("decideRcWebhookAction — granting events", () => {
  const granting = [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "SUBSCRIPTION_EXTENDED",
    "TEMPORARY_ENTITLEMENT_GRANT",
  ];

  for (const type of granting) {
    it(`${type} grants PRO`, () => {
      const d = expectSetStatus(
        decideRcWebhookAction(ev({ type }), user({ subscriptionStatus: "FREE" }), NOW)
      );
      expect(d.nextStatus).toBe("PRO");
      expect(d.trialEndsAt).toBeNull();
      expect(d.clearBillingIssue).toBe(true);
      expect(d.stampBillingIssue).toBe(false);
    });
  }

  it("INITIAL_PURCHASE in a TRIAL period grants TRIAL with the expiry as trialEndsAt", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "INITIAL_PURCHASE", period_type: "TRIAL" }),
        user({ subscriptionStatus: "FREE" }),
        NOW
      )
    );
    expect(d.nextStatus).toBe("TRIAL");
    expect(d.trialEndsAt?.getTime()).toBe(FUTURE_MS);
  });

  it("treats INTRO period as a trial", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "INITIAL_PURCHASE", period_type: "INTRO" }), user(), NOW)
    );
    expect(d.nextStatus).toBe("TRIAL");
  });

  it("RENEWAL clears the billing anchor — this is the recovery path", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "RENEWAL" }), user({ subscriptionStatus: "FREE" }), NOW)
    );
    expect(d.nextStatus).toBe("PRO");
    expect(d.clearBillingIssue).toBe(true);
  });

  it("a grant still applies to a comped account (comp is only protected from demotion)", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "RENEWAL" }), user({ subscriptionSource: "comp" }), NOW)
    );
    expect(d.nextStatus).toBe("PRO");
  });
});

// ─── Revoking events ─────────────────────────────────────────────────

describe("decideRcWebhookAction — revoking events", () => {
  it("EXPIRATION demotes to FREE", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "EXPIRATION" }), user({ subscriptionStatus: "PRO" }), NOW)
    );
    expect(d.nextStatus).toBe("FREE");
  });

  it("EXPIRATION on an already-FREE user is an idempotent ignore", () => {
    const d = decideRcWebhookAction(
      ev({ type: "EXPIRATION" }),
      user({ subscriptionStatus: "FREE" }),
      NOW
    );
    expect(d.action).toBe("ignore");
  });

  it("SUBSCRIPTION_PAUSED demotes to FREE", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "SUBSCRIPTION_PAUSED", store: "PLAY_STORE" }),
        user(),
        NOW
      )
    );
    expect(d.nextStatus).toBe("FREE");
  });

  it("BILLING_ISSUE demotes to FREE and stamps the anchor (no grace — matches Stripe/Apple)", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "BILLING_ISSUE" }), user({ subscriptionStatus: "PRO" }), NOW)
    );
    expect(d.nextStatus).toBe("FREE");
    expect(d.stampBillingIssue).toBe(true);
    expect(d.clearBillingIssue).toBe(false);
  });

  it("BILLING_ISSUE on an already-FREE user does NOT push the anchor forward", () => {
    const d = decideRcWebhookAction(
      ev({ type: "BILLING_ISSUE" }),
      user({ subscriptionStatus: "FREE" }),
      NOW
    );
    expect(d.action).toBe("ignore");
  });
});

// ─── CANCELLATION: the subtle one ────────────────────────────────────

describe("decideRcWebhookAction — CANCELLATION", () => {
  it("does NOT revoke access when the period is still paid for", () => {
    const d = decideRcWebhookAction(
      ev({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", expiration_at_ms: FUTURE_MS }),
      user({ subscriptionStatus: "PRO" }),
      NOW
    );
    // The critical assertion: a user who cancels keeps what they paid for.
    expect(d.action).toBe("log-only");
  });

  it("revokes immediately on a support-initiated refund", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: FUTURE_MS }),
        user({ subscriptionStatus: "PRO" }),
        NOW
      )
    );
    expect(d.nextStatus).toBe("FREE");
  });

  it("revokes when the expiration is already in the past", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", expiration_at_ms: PAST_MS }),
        user({ subscriptionStatus: "PRO" }),
        NOW
      )
    );
    expect(d.nextStatus).toBe("FREE");
  });

  it("revokes when there is no expiration at all", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "CANCELLATION", cancel_reason: "UNKNOWN", expiration_at_ms: null }),
        user({ subscriptionStatus: "PRO" }),
        NOW
      )
    );
    expect(d.nextStatus).toBe("FREE");
  });

  it("BILLING_ERROR cancellation with a future expiry still keeps access", () => {
    const d = decideRcWebhookAction(
      ev({ type: "CANCELLATION", cancel_reason: "BILLING_ERROR", expiration_at_ms: FUTURE_MS }),
      user(),
      NOW
    );
    expect(d.action).toBe("log-only");
  });
});

// ─── Guard 1: never demote a comp ────────────────────────────────────

describe("never demote a comp", () => {
  const demoting: Array<Partial<RcWebhookEvent>> = [
    { type: "EXPIRATION" },
    { type: "SUBSCRIPTION_PAUSED" },
    { type: "BILLING_ISSUE" },
    { type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" },
    { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", expiration_at_ms: PAST_MS },
  ];

  for (const over of demoting) {
    it(`${over.type}${over.cancel_reason ? `/${over.cancel_reason}` : ""} skips a comped account`, () => {
      const d = decideRcWebhookAction(
        ev(over),
        user({ subscriptionStatus: "PRO", subscriptionSource: "comp" }),
        NOW
      );
      expect(d.action).toBe("skip-comp");
      expect(d.reason).toContain("comp");
    });
  }

  it("the same events DO demote a non-comp account", () => {
    for (const over of demoting) {
      const d = decideRcWebhookAction(
        ev(over),
        user({ subscriptionStatus: "PRO", subscriptionSource: "apple" }),
        NOW
      );
      expect(d.action).toBe("set-status");
    }
  });
});

// ─── Guard 2: null-safe source ───────────────────────────────────────

describe("null-safe subscriptionSource", () => {
  it("maps known stores onto our vocabulary", () => {
    const cases: Array<[string, string]> = [
      ["APP_STORE", "apple"],
      ["MAC_APP_STORE", "apple"],
      ["PLAY_STORE", "google_play"],
      ["STRIPE", "stripe"],
      ["RC_BILLING", "stripe"],
      ["PROMOTIONAL", "comp"],
    ];
    for (const [store, expected] of cases) {
      const d = expectSetStatus(
        decideRcWebhookAction(ev({ type: "RENEWAL", store }), user(), NOW)
      );
      expect(d.source).toBe(expected);
    }
  });

  it("carries source=null for an unrecognized store", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "RENEWAL", store: "AMAZON" }), user(), NOW)
    );
    expect(d.source).toBeNull();
  });

  it("a null source is OMITTED from the update payload — never overwrites a known source", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "RENEWAL", store: "WEIRD_NEW_STORE" }), user(), NOW)
    );
    const data = rcDecisionToUpdateData(d, NOW);
    expect(data).not.toHaveProperty("subscriptionSource");
    expect(data.subscriptionStatus).toBe("PRO");
  });

  it("a recognized source IS written", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "RENEWAL", store: "PLAY_STORE" }), user(), NOW)
    );
    expect(rcDecisionToUpdateData(d, NOW).subscriptionSource).toBe("google_play");
  });
});

// ─── Guard 3: entitlement scoping ────────────────────────────────────

describe("entitlement scoping", () => {
  it("ignores an event for a different entitlement", () => {
    const d = decideRcWebhookAction(
      ev({ type: "RENEWAL", entitlement_ids: ["some_other_thing"] }),
      user(),
      NOW
    );
    expect(d.action).toBe("ignore");
  });

  it("acts when 'pro' is among several entitlements", () => {
    const d = decideRcWebhookAction(
      ev({ type: "RENEWAL", entitlement_ids: ["pro", "extra"] }),
      user(),
      NOW
    );
    expect(d.action).toBe("set-status");
  });

  it("honors the legacy singular entitlement_id field", () => {
    expect(
      decideRcWebhookAction(
        ev({ type: "RENEWAL", entitlement_ids: null, entitlement_id: "pro" }),
        user(),
        NOW
      ).action
    ).toBe("set-status");
    expect(
      decideRcWebhookAction(
        ev({ type: "RENEWAL", entitlement_ids: null, entitlement_id: "other" }),
        user(),
        NOW
      ).action
    ).toBe("ignore");
  });

  it("allows an unscoped event through rather than dropping real renewals", () => {
    const d = decideRcWebhookAction(
      ev({ type: "RENEWAL", entitlement_ids: [], entitlement_id: null }),
      user(),
      NOW
    );
    expect(d.action).toBe("set-status");
  });
});

// ─── Non-mutating + edge cases ───────────────────────────────────────

describe("decideRcWebhookAction — non-mutating events", () => {
  it("PRODUCT_CHANGE is log-only (takes effect at renewal)", () => {
    const d = decideRcWebhookAction(
      ev({ type: "PRODUCT_CHANGE", new_product_id: "…annual.v2" }),
      user(),
      NOW
    );
    expect(d.action).toBe("log-only");
    expect(d.reason).toContain("annual.v2");
  });

  it("TRANSFER is log-only and defers to drift reconciliation", () => {
    const d = decideRcWebhookAction(
      ev({ type: "TRANSFER", transferred_from: ["a"], transferred_to: ["b"] }),
      user(),
      NOW
    );
    expect(d.action).toBe("log-only");
    expect(d.reason).toContain("drift");
  });

  it("INVOICE_ISSUANCE is log-only", () => {
    expect(decideRcWebhookAction(ev({ type: "INVOICE_ISSUANCE" }), user(), NOW).action).toBe(
      "log-only"
    );
  });

  it("TEST is log-only and needs no user", () => {
    expect(decideRcWebhookAction(ev({ type: "TEST" }), null, NOW).action).toBe("log-only");
  });

  it("an unknown event type is log-only, never a guess", () => {
    const d = decideRcWebhookAction(ev({ type: "SOMETHING_RC_ADDED_LATER" }), user(), NOW);
    expect(d.action).toBe("log-only");
    expect(d.reason).toContain("unhandled");
  });

  it("ignores an event with no matching user — never resurrects a deleted account", () => {
    expect(decideRcWebhookAction(ev({ type: "RENEWAL" }), null, NOW).action).toBe("ignore");
  });

  it("is case-insensitive on event type", () => {
    expect(decideRcWebhookAction(ev({ type: "renewal" }), user(), NOW).action).toBe("set-status");
  });
});

// ─── Update payload shape ────────────────────────────────────────────

describe("rcDecisionToUpdateData", () => {
  it("PRO clears trialEndsAt (a paid sub supersedes the trial clock)", () => {
    const d = expectSetStatus(decideRcWebhookAction(ev({ type: "RENEWAL" }), user(), NOW));
    const data = rcDecisionToUpdateData(d, NOW);
    expect(data.subscriptionStatus).toBe("PRO");
    expect(data.trialEndsAt).toBeNull();
    expect(data.stripeFirstFailureAt).toBeNull();
  });

  it("TRIAL carries trialEndsAt through", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(
        ev({ type: "INITIAL_PURCHASE", period_type: "TRIAL" }),
        user(),
        NOW
      )
    );
    const data = rcDecisionToUpdateData(d, NOW);
    expect(data.subscriptionStatus).toBe("TRIAL");
    expect((data.trialEndsAt as Date).getTime()).toBe(FUTURE_MS);
  });

  it("BILLING_ISSUE stamps the anchor with `now`", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "BILLING_ISSUE" }), user(), NOW)
    );
    const data = rcDecisionToUpdateData(d, NOW);
    expect(data.subscriptionStatus).toBe("FREE");
    expect(data.stripeFirstFailureAt).toEqual(NOW);
  });

  it("a FREE demotion does not touch trialEndsAt", () => {
    const d = expectSetStatus(
      decideRcWebhookAction(ev({ type: "EXPIRATION" }), user(), NOW)
    );
    expect(rcDecisionToUpdateData(d, NOW)).not.toHaveProperty("trialEndsAt");
  });
});
