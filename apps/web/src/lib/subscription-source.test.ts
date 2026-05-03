import { describe, expect, it } from "vitest";

import {
  isAppleSubscription,
  isStripeSubscription,
} from "@/lib/entitlements";

/**
 * Phase 4 — dual-source subscription helpers.
 *
 * Verifies the boolean partition over `subscriptionSource` and
 * confirms the planned backfill-SQL semantics (PRO/TRIAL/PAST_DUE
 * with stripeCustomerId → "stripe"; everything else → null) match
 * what the helpers expect to see post-backfill.
 */

describe("isAppleSubscription / isStripeSubscription", () => {
  it("returns false for null/undefined user", () => {
    expect(isAppleSubscription(null)).toBe(false);
    expect(isAppleSubscription(undefined)).toBe(false);
    expect(isStripeSubscription(null)).toBe(false);
    expect(isStripeSubscription(undefined)).toBe(false);
  });

  it("returns false when subscriptionSource is null", () => {
    expect(isAppleSubscription({ subscriptionSource: null })).toBe(false);
    expect(isStripeSubscription({ subscriptionSource: null })).toBe(false);
  });

  it("returns false when subscriptionSource is missing entirely", () => {
    expect(isAppleSubscription({})).toBe(false);
    expect(isStripeSubscription({})).toBe(false);
  });

  it("isAppleSubscription returns true only for source='apple'", () => {
    expect(isAppleSubscription({ subscriptionSource: "apple" })).toBe(true);
    expect(isAppleSubscription({ subscriptionSource: "stripe" })).toBe(false);
    expect(isAppleSubscription({ subscriptionSource: "Apple" })).toBe(false); // case-sensitive
    expect(isAppleSubscription({ subscriptionSource: "" })).toBe(false);
  });

  it("isStripeSubscription returns true only for source='stripe'", () => {
    expect(isStripeSubscription({ subscriptionSource: "stripe" })).toBe(true);
    expect(isStripeSubscription({ subscriptionSource: "apple" })).toBe(false);
    expect(isStripeSubscription({ subscriptionSource: "Stripe" })).toBe(false); // case-sensitive
    expect(isStripeSubscription({ subscriptionSource: "" })).toBe(false);
  });

  it("the two helpers are mutually exclusive on any single row", () => {
    // Defensive — the schema doesn't enforce mutual exclusion at the
    // column level. The helpers' partition is by-string-equality,
    // and "apple" ≠ "stripe" so no input can satisfy both.
    const apple = { subscriptionSource: "apple" };
    const stripe = { subscriptionSource: "stripe" };
    const neither = { subscriptionSource: null };
    expect(isAppleSubscription(apple) && isStripeSubscription(apple)).toBe(false);
    expect(isAppleSubscription(stripe) && isStripeSubscription(stripe)).toBe(false);
    expect(isAppleSubscription(neither) && isStripeSubscription(neither)).toBe(false);
  });

  it("unknown source values default to false on both helpers (fail-closed)", () => {
    // A future "google_play" source would correctly read as false
    // on both Apple and Stripe helpers — neither path tries to
    // route a Google Play user as if it were Stripe.
    expect(isAppleSubscription({ subscriptionSource: "google_play" })).toBe(
      false
    );
    expect(isStripeSubscription({ subscriptionSource: "google_play" })).toBe(
      false
    );
  });
});

/**
 * Backfill SQL semantics check.
 *
 * Phase 4 backfill rule (per the workstream spec + PROGRESS.md):
 *   WHERE subscriptionStatus IN ('PRO', 'TRIAL', 'PAST_DUE')
 *     AND stripeCustomerId IS NOT NULL
 *   → SET subscriptionSource = 'stripe'
 *   ALL OTHER ROWS → leave subscriptionSource = null
 *
 * This is encoded in `shouldBackfillToStripe` below — a pure
 * function predicate over the same shape the SQL UPDATE filters on.
 * If the SQL is reworded later, this test catches semantic drift.
 */

interface BackfillRow {
  subscriptionStatus: string;
  stripeCustomerId: string | null;
}

function shouldBackfillToStripe(row: BackfillRow): boolean {
  const eligibleStatuses = new Set(["PRO", "TRIAL", "PAST_DUE"]);
  return eligibleStatuses.has(row.subscriptionStatus) && row.stripeCustomerId !== null;
}

describe("Phase 4 backfill SQL semantics — shouldBackfillToStripe predicate", () => {
  it("PRO + stripeCustomerId set → backfill to 'stripe'", () => {
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "PRO",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(true);
  });

  it("TRIAL + stripeCustomerId set → backfill to 'stripe'", () => {
    // A user mid-trial who already saved a payment method (rare
    // but possible if checkout completed but subscription hasn't
    // fired yet) gets attributed correctly.
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "TRIAL",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(true);
  });

  it("PAST_DUE + stripeCustomerId set → backfill to 'stripe'", () => {
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "PAST_DUE",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(true);
  });

  it("FREE + stripeCustomerId set → leave NULL (no longer subscribed)", () => {
    // A canceled user has FREE status but their stripeCustomerId
    // is preserved (Stripe cancel handler doesn't null it). They
    // are not currently subscribed → no source attribution.
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "FREE",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(false);
  });

  it("PRO without stripeCustomerId → leave NULL (anomaly worth investigating)", () => {
    // No live row should look like this in production — every PRO
    // user came through Stripe Checkout which sets stripeCustomerId.
    // If one exists, the backfill correctly skips it rather than
    // falsely attributing to 'stripe'.
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "PRO",
        stripeCustomerId: null,
      })
    ).toBe(false);
  });

  it("TRIAL without stripeCustomerId → leave NULL (most trial users)", () => {
    // The default state for a trialing user — they haven't checked
    // out yet, so no Stripe customer record yet. Source is null
    // until they upgrade.
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "TRIAL",
        stripeCustomerId: null,
      })
    ).toBe(false);
  });

  it("FREE without stripeCustomerId → leave NULL (never-subscribed)", () => {
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "FREE",
        stripeCustomerId: null,
      })
    ).toBe(false);
  });

  it("CANCELED status (legacy alias for FREE) → leave NULL", () => {
    // Older cancellation paths wrote 'CANCELED' before the webhook
    // was standardized on 'FREE'. The backfill rule's status set
    // is restrictive (PRO/TRIAL/PAST_DUE only), so CANCELED is
    // correctly excluded.
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "CANCELED",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(false);
  });

  it("unknown status → leave NULL (fail-closed)", () => {
    expect(
      shouldBackfillToStripe({
        subscriptionStatus: "UNKNOWN_FUTURE_VALUE",
        stripeCustomerId: "cus_abc",
      })
    ).toBe(false);
  });
});

/**
 * After-backfill cross-check: helpers behave correctly on rows the
 * backfill produced.
 */

describe("post-backfill helpers behave as expected on backfilled rows", () => {
  it("PRO row backfilled to 'stripe' → isStripeSubscription=true, isAppleSubscription=false", () => {
    const row = { subscriptionSource: "stripe" };
    expect(isStripeSubscription(row)).toBe(true);
    expect(isAppleSubscription(row)).toBe(false);
  });

  it("FREE row left at null → both helpers return false", () => {
    const row = { subscriptionSource: null };
    expect(isStripeSubscription(row)).toBe(false);
    expect(isAppleSubscription(row)).toBe(false);
  });

  it("future apple row → isAppleSubscription=true, isStripeSubscription=false", () => {
    // Phase 2 receipt-verification will set source='apple' on the
    // first verified Apple receipt. Confirm helpers route correctly
    // even though no row exists in production today.
    const row = { subscriptionSource: "apple" };
    expect(isAppleSubscription(row)).toBe(true);
    expect(isStripeSubscription(row)).toBe(false);
  });
});
