import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { canManageWebSubscription } from "@/lib/billing/web-manage";
import {
  cancelSubscriptionOnDelete,
  looksLikeRcWebBilling,
  type DeletionUser,
} from "@/lib/cancel-subscription-on-delete";
import {
  cancelRcBillingSubscriptions,
  rcBillingSubWillCharge,
} from "./web-billing-admin";
import {
  rcWebBillingEffectFor,
  rcWebInterval,
  rcWebPurchaseSource,
} from "./web-billing-effects";
import { rcHistoryIsLegacy } from "./web-billing";

// ─── canManageWebSubscription ────────────────────────────────────────

describe("canManageWebSubscription", () => {
  it("is true for any Stripe customer", () => {
    expect(
      canManageWebSubscription({ stripeCustomerId: "cus_1", subscriptionSource: "stripe", subscriptionStatus: "FREE" })
    ).toBe(true);
  });
  it("is true for a live stripe-sourced row with no customer (RC Web Billing)", () => {
    for (const status of ["PRO", "TRIAL", "PAST_DUE"]) {
      expect(
        canManageWebSubscription({ stripeCustomerId: null, subscriptionSource: "stripe", subscriptionStatus: status })
      ).toBe(true);
    }
  });
  it("is false for FREE, comp, store and app-trial rows without a customer", () => {
    expect(canManageWebSubscription({ stripeCustomerId: null, subscriptionSource: "stripe", subscriptionStatus: "FREE" })).toBe(false);
    expect(canManageWebSubscription({ stripeCustomerId: null, subscriptionSource: "comp", subscriptionStatus: "PRO" })).toBe(false);
    expect(canManageWebSubscription({ stripeCustomerId: null, subscriptionSource: "apple", subscriptionStatus: "PRO" })).toBe(false);
    expect(canManageWebSubscription({ stripeCustomerId: null, subscriptionSource: null, subscriptionStatus: "TRIAL" })).toBe(false);
  });
});

// ─── RC v2 cancel ────────────────────────────────────────────────────

describe("rcBillingSubWillCharge", () => {
  it("only live, renewing rc_billing subs", () => {
    expect(rcBillingSubWillCharge({ id: "s1", store: "rc_billing", status: "active", auto_renewal_status: "will_renew" })).toBe(true);
    expect(rcBillingSubWillCharge({ id: "s1", store: "rc_billing", status: "trialing", auto_renewal_status: "will_renew" })).toBe(true);
    expect(rcBillingSubWillCharge({ id: "s1", store: "rc_billing", status: "expired" })).toBe(false);
    expect(rcBillingSubWillCharge({ id: "s1", store: "rc_billing", status: "active", auto_renewal_status: "will_not_renew" })).toBe(false);
    expect(rcBillingSubWillCharge({ id: "s1", store: "app_store", status: "active" })).toBe(false);
    expect(rcBillingSubWillCharge({ store: "rc_billing", status: "active" })).toBe(false);
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("cancelRcBillingSubscriptions", () => {
  beforeEach(() => {
    process.env.RC_SECRET_KEY = "sk_test";
    process.env.RC_PROJECT_ID = "proj123";
  });

  it("fails closed (failed) without credentials", async () => {
    delete process.env.RC_SECRET_KEY;
    const f = vi.fn();
    expect(await cancelRcBillingSubscriptions("u1", f as unknown as typeof fetch)).toBe("failed");
    expect(f).not.toHaveBeenCalled();
  });

  it("cancels only the live rc_billing subs, with the v2 paths", async () => {
    const calls: Array<[string, string]> = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([init?.method ?? "GET", url]);
      if (url.includes("/customers/")) {
        return json(200, {
          items: [
            { id: "sub_live", store: "rc_billing", status: "active", auto_renewal_status: "will_renew" },
            { id: "sub_apple", store: "app_store", status: "active", auto_renewal_status: "will_renew" },
            { id: "sub_old", store: "rc_billing", status: "expired" },
          ],
        });
      }
      return json(200, {});
    });
    expect(await cancelRcBillingSubscriptions("u 1", f as unknown as typeof fetch)).toBe("success");
    expect(calls).toEqual([
      ["GET", "https://api.revenuecat.com/v2/projects/proj123/customers/u%201/subscriptions?limit=100"],
      ["POST", "https://api.revenuecat.com/v2/projects/proj123/subscriptions/sub_live/actions/cancel"],
    ]);
  });

  it("not_applicable for an unknown customer or no live subs", async () => {
    expect(await cancelRcBillingSubscriptions("u1", (async () => json(404, {})) as unknown as typeof fetch)).toBe("not_applicable");
    expect(await cancelRcBillingSubscriptions("u1", (async () => json(200, { items: [] })) as unknown as typeof fetch)).toBe("not_applicable");
  });

  it("failed when a cancel call fails", async () => {
    const f = vi.fn(async (url: string) =>
      url.includes("/customers/")
        ? json(200, { items: [{ id: "s", store: "rc_billing", status: "active", auto_renewal_status: "will_renew" }] })
        : json(500, {})
    );
    expect(await cancelRcBillingSubscriptions("u1", f as unknown as typeof fetch)).toBe("failed");
  });
});

// ─── cancelSubscriptionOnDelete RC branch ────────────────────────────

const rcUser: DeletionUser = {
  id: "u1",
  email: "a@example.com",
  subscriptionStatus: "PRO",
  subscriptionSource: "stripe",
  stripeSubscriptionId: null,
  stripeCustomerId: null,
};

function fakeStripe(customers: string[] = []) {
  return {
    customers: { list: vi.fn(async () => ({ data: customers.map((id) => ({ id })) })) },
    subscriptions: { list: vi.fn(async () => ({ data: [] })), cancel: vi.fn() },
  } as never;
}

describe("cancelSubscriptionOnDelete — RevenueCat Web Billing", () => {
  it("recognizes the RC Web Billing row shape only", () => {
    expect(looksLikeRcWebBilling(rcUser)).toBe(true);
    expect(looksLikeRcWebBilling({ ...rcUser, stripeCustomerId: "cus_1" })).toBe(false);
    expect(looksLikeRcWebBilling({ ...rcUser, subscriptionSource: "apple" })).toBe(false);
    expect(looksLikeRcWebBilling({ ...rcUser, subscriptionStatus: "FREE" })).toBe(false);
  });

  it("cancels through RevenueCat and reports success", async () => {
    const rcCancel = vi.fn(async () => "success" as const);
    expect(await cancelSubscriptionOnDelete(fakeStripe(), rcUser, { rcCancel })).toBe("success");
    expect(rcCancel).toHaveBeenCalledWith("u1");
  });

  it("reports failed when RevenueCat cancel fails", async () => {
    const rcCancel = vi.fn(async () => "failed" as const);
    expect(await cancelSubscriptionOnDelete(fakeStripe(), rcUser, { rcCancel })).toBe("failed");
  });

  it("never calls RevenueCat for a Stripe-direct subscriber", async () => {
    const rcCancel = vi.fn(async () => "success" as const);
    const stripe = {
      subscriptions: { cancel: vi.fn(async () => ({})) },
    } as never;
    expect(
      await cancelSubscriptionOnDelete(stripe, { ...rcUser, stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" }, { rcCancel })
    ).toBe("success");
    expect(rcCancel).not.toHaveBeenCalled();
  });
});

// ─── webhook side-effect routing ─────────────────────────────────────

describe("rcWebBillingEffectFor", () => {
  it("only RC_BILLING purchases and renewals", () => {
    expect(rcWebBillingEffectFor({ type: "INITIAL_PURCHASE", store: "RC_BILLING" })).toBe("new_subscription");
    expect(rcWebBillingEffectFor({ type: "RENEWAL", store: "RC_BILLING" })).toBe("renewal");
    expect(rcWebBillingEffectFor({ type: "CANCELLATION", store: "RC_BILLING" })).toBeNull();
    // Stripe-direct subs are handled by the Stripe webhook — never twice.
    expect(rcWebBillingEffectFor({ type: "INITIAL_PURCHASE", store: "STRIPE" })).toBeNull();
    expect(rcWebBillingEffectFor({ type: "INITIAL_PURCHASE", store: "APP_STORE" })).toBeNull();
  });
});

describe("rcWebInterval / rcWebPurchaseSource", () => {
  it("maps product ids to intervals", () => {
    expect(rcWebInterval("ripple_pro_annual_web")).toBe("yearly");
    expect(rcWebInterval("ripple_pro_annual_web_legacy_now")).toBe("yearly");
    expect(rcWebInterval("ripple_pro_monthly_web")).toBe("monthly");
    expect(rcWebInterval(null)).toBe("monthly");
  });
  it("labels the purchase source", () => {
    expect(rcWebPurchaseSource("default")).toBe("onboarding_funnel");
    expect(rcWebPurchaseSource("web_upgrade")).toBe("in_app_upgrade");
    expect(rcWebPurchaseSource("web_upgrade_legacy")).toBe("in_app_upgrade");
    expect(rcWebPurchaseSource(null)).toBe("direct");
    expect(rcWebPurchaseSource("default", "upgrade")).toBe("in_app_upgrade");
  });
});

describe("rcHistoryIsLegacy", () => {
  it("detects legacy web products and ignores current ones", () => {
    expect(rcHistoryIsLegacy({ subscriptions: { ripple_pro_monthly_web_legacy_now: {} } })).toBe(true);
    expect(rcHistoryIsLegacy({ subscriptions: { ripple_pro_monthly_web_now: {} } })).toBe(false);
    expect(rcHistoryIsLegacy(null)).toBe(false);
  });
});
