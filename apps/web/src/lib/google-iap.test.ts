import { describe, expect, it } from "vitest";

import {
  GOOGLE_ALLOWED_PRODUCT_IDS,
  decideGoogleReceiptVerify,
  type GoogleSubscriptionInfo,
  type UserStateForGoogleVerify,
} from "@/lib/google-iap";

/**
 * Android IAP (Google Play Billing) decision function. Pure logic; mirrors
 * apple-iap.test.ts's decideReceiptVerify coverage so the two platforms keep
 * identical idempotency + conflict semantics.
 */

const FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000;
const PAST = Date.now() - 1000;

function info(
  overrides: Partial<GoogleSubscriptionInfo> = {}
): GoogleSubscriptionInfo {
  return {
    productId: "acuity_pro_monthly",
    expiryDate: FUTURE,
    purchaseToken: "tok_aaa",
    state: "SUBSCRIPTION_STATE_ACTIVE",
    hasAccess: true,
    acknowledged: false,
    linkedPurchaseToken: null,
    rawPayload: {},
    ...overrides,
  };
}

function userVerify(
  overrides: Partial<UserStateForGoogleVerify> = {}
): UserStateForGoogleVerify {
  return {
    id: "u1",
    subscriptionStatus: "TRIAL",
    subscriptionSource: null,
    googlePurchaseToken: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

describe("GOOGLE_ALLOWED_PRODUCT_IDS", () => {
  it("contains the monthly + annual Android products", () => {
    expect(GOOGLE_ALLOWED_PRODUCT_IDS.has("acuity_pro_monthly")).toBe(true);
    expect(GOOGLE_ALLOWED_PRODUCT_IDS.has("acuity_pro_annual")).toBe(true);
  });

  it("rejects unknown / iOS-style ids", () => {
    expect(GOOGLE_ALLOWED_PRODUCT_IDS.has("anything_else")).toBe(false);
    expect(
      GOOGLE_ALLOWED_PRODUCT_IDS.has("com.heelerdigital.acuity.pro.monthly")
    ).toBe(false);
  });
});

describe("decideGoogleReceiptVerify", () => {
  it("happy path — TRIAL user, active sub, no other owner → write", () => {
    const d = decideGoogleReceiptVerify(info(), userVerify(), null);
    expect(d.action).toBe("write");
  });

  it("rejects unknown product (BAD_PRODUCT)", () => {
    const d = decideGoogleReceiptVerify(
      info({ productId: "acuity_pro_lifetime" }),
      userVerify(),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("BAD_PRODUCT");
  });

  it("rejects expired receipt (EXPIRED_RECEIPT)", () => {
    const d = decideGoogleReceiptVerify(
      info({ expiryDate: PAST }),
      userVerify(),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("EXPIRED_RECEIPT");
  });

  it("rejects a non-access state even with future expiry (ON_HOLD)", () => {
    const d = decideGoogleReceiptVerify(
      info({ state: "SUBSCRIPTION_STATE_ON_HOLD", hasAccess: false }),
      userVerify(),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("EXPIRED_RECEIPT");
  });

  it("rejects when another user owns the purchaseToken", () => {
    const d = decideGoogleReceiptVerify(info(), userVerify({ id: "u1" }), {
      id: "u2",
    });
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") {
      expect(d.code).toBe("ANOTHER_USER_OWNS_TRANSACTION");
    }
  });

  it("rejects when user has an active Stripe sub (ACTIVE_STRIPE_SUB)", () => {
    const d = decideGoogleReceiptVerify(
      info(),
      userVerify({
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_123",
        subscriptionStatus: "PRO",
      }),
      null
    );
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") expect(d.code).toBe("ACTIVE_STRIPE_SUB");
  });

  it("does NOT block a previously-canceled Stripe user (FREE) from buying via Google", () => {
    const d = decideGoogleReceiptVerify(
      info(),
      userVerify({
        subscriptionSource: "stripe",
        stripeSubscriptionId: "sub_123",
        subscriptionStatus: "FREE",
      }),
      null
    );
    expect(d.action).toBe("write");
  });

  it("returns idempotent-noop on re-verify of the same Google sub", () => {
    const d = decideGoogleReceiptVerify(
      info({ purchaseToken: "tok_aaa" }),
      userVerify({
        subscriptionStatus: "PRO",
        subscriptionSource: "google_play",
        googlePurchaseToken: "tok_aaa",
      }),
      null
    );
    expect(d.action).toBe("idempotent-noop");
  });

  it("writes (not idempotent) when the token differs from the stored one", () => {
    const d = decideGoogleReceiptVerify(
      info({ purchaseToken: "tok_new" }),
      userVerify({
        subscriptionStatus: "PRO",
        subscriptionSource: "google_play",
        googlePurchaseToken: "tok_old",
      }),
      null
    );
    expect(d.action).toBe("write");
  });
});
