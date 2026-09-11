/**
 * cancelSubscriptionOnDelete — BILLING-CRITICAL.
 *
 * The test that matters most reproduces the incident (carmenaroberts, 2026-07-15):
 * DB says FREE (dunning downgrade), Stripe says past_due with a live subscription,
 * user deletes → we MUST cancel the sub AND void the open invoice, and MUST NOT
 * short-circuit on the local FREE status.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelSubscriptionOnDelete,
  type DeletionUser,
} from "./cancel-subscription-on-delete";

// ── Minimal Stripe stand-in ─────────────────────────────────────────────────

type Sub = { id: string; status: string; customer: string };

const subRetrieve = vi.fn();
const subList = vi.fn();
const subCancel = vi.fn();
const customerList = vi.fn();
const invoiceList = vi.fn();
const invoiceVoid = vi.fn();

const stripe = {
  subscriptions: {
    retrieve: (...a: unknown[]) => subRetrieve(...a),
    list: (...a: unknown[]) => subList(...a),
    cancel: (...a: unknown[]) => subCancel(...a),
  },
  customers: { list: (...a: unknown[]) => customerList(...a) },
  invoices: {
    list: (...a: unknown[]) => invoiceList(...a),
    voidInvoice: (...a: unknown[]) => invoiceVoid(...a),
  },
} as unknown as import("stripe").default;

const user = (over: Partial<DeletionUser> = {}): DeletionUser => ({
  email: "a@b.com",
  subscriptionStatus: "FREE",
  subscriptionSource: "stripe",
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  ...over,
});

/** Wire the Stripe mock: retrieve(sub)→customer, list(customer)→subs, invoices. */
function seed(opts: {
  retrieveCustomer?: string;
  subsByCustomer?: Record<string, Sub[]>;
  customersByEmail?: string[];
  openInvoicesByCustomer?: Record<string, string[]>;
}) {
  subRetrieve.mockImplementation(async (id: string) => ({
    id,
    customer: opts.retrieveCustomer ?? "cus_1",
  }));
  subList.mockImplementation(async ({ customer }: { customer: string }) => ({
    data: opts.subsByCustomer?.[customer] ?? [],
  }));
  customerList.mockImplementation(async () => ({
    data: (opts.customersByEmail ?? []).map((id) => ({ id })),
  }));
  invoiceList.mockImplementation(async ({ customer }: { customer: string }) => ({
    data: (opts.openInvoicesByCustomer?.[customer] ?? []).map((id) => ({ id })),
  }));
  subCancel.mockResolvedValue({});
  invoiceVoid.mockResolvedValue({});
}

beforeEach(() => {
  [subRetrieve, subList, subCancel, customerList, invoiceList, invoiceVoid].forEach((m) =>
    m.mockReset()
  );
});

// ── THE incident case ───────────────────────────────────────────────────────

describe("the case that actually happened", () => {
  it("DB=FREE, Stripe=past_due live sub → cancels the sub AND voids the open invoice", async () => {
    seed({
      subsByCustomer: { cus_1: [{ id: "sub_1", status: "past_due", customer: "cus_1" }] },
      openInvoicesByCustomer: { cus_1: ["in_1"] },
    });

    const outcome = await cancelSubscriptionOnDelete(stripe, user({ subscriptionStatus: "FREE" }));

    expect(outcome).toBe("cancelled");
    expect(subCancel).toHaveBeenCalledWith("sub_1");
    expect(invoiceVoid).toHaveBeenCalledWith("in_1"); // <-- the separately-required void
  });

  it("does not short-circuit on FREE — it still queries Stripe", async () => {
    seed({ subsByCustomer: { cus_1: [{ id: "sub_1", status: "past_due", customer: "cus_1" }] } });
    await cancelSubscriptionOnDelete(stripe, user({ subscriptionStatus: "FREE" }));
    // Proof it looked, rather than returning "not_applicable" off local status.
    expect(subList).toHaveBeenCalled();
  });
});

// ── Other outcomes ──────────────────────────────────────────────────────────

describe("outcomes", () => {
  it("active PRO sub → cancelled", async () => {
    seed({ subsByCustomer: { cus_1: [{ id: "sub_1", status: "active", customer: "cus_1" }] } });
    const outcome = await cancelSubscriptionOnDelete(stripe, user({ subscriptionStatus: "PRO" }));
    expect(outcome).toBe("cancelled");
    expect(subCancel).toHaveBeenCalledWith("sub_1");
  });

  it("resolves by email when local ids are missing (webhook-outage row)", async () => {
    seed({
      customersByEmail: ["cus_email"],
      subsByCustomer: { cus_email: [{ id: "sub_e", status: "past_due", customer: "cus_email" }] },
      openInvoicesByCustomer: { cus_email: ["in_e"] },
    });
    const outcome = await cancelSubscriptionOnDelete(
      stripe,
      user({ stripeSubscriptionId: null, stripeCustomerId: null })
    );
    expect(outcome).toBe("cancelled");
    expect(subCancel).toHaveBeenCalledWith("sub_e");
    expect(invoiceVoid).toHaveBeenCalledWith("in_e");
  });

  it("Stripe sub already canceled → already_cancelled, no cancel call", async () => {
    seed({ subsByCustomer: { cus_1: [{ id: "sub_1", status: "canceled", customer: "cus_1" }] } });
    const outcome = await cancelSubscriptionOnDelete(stripe, user());
    expect(outcome).toBe("already_cancelled");
    expect(subCancel).not.toHaveBeenCalled();
  });

  it("no Stripe customer/sub at all → none_found (not not_applicable)", async () => {
    seed({ subsByCustomer: {} });
    const outcome = await cancelSubscriptionOnDelete(
      stripe,
      user({ stripeSubscriptionId: null, stripeCustomerId: null })
    );
    expect(outcome).toBe("none_found");
  });

  it("Apple IAP user with no Stripe sub → iap_user_warned", async () => {
    seed({ subsByCustomer: {} });
    const outcome = await cancelSubscriptionOnDelete(
      stripe,
      user({ subscriptionSource: "apple", stripeSubscriptionId: null, stripeCustomerId: null })
    );
    expect(outcome).toBe("iap_user_warned");
    expect(subCancel).not.toHaveBeenCalled();
  });

  it("Stripe error → failed (deletion still proceeds; caller alerts)", async () => {
    subRetrieve.mockRejectedValue(new Error("boom"));
    subList.mockRejectedValue(new Error("boom"));
    customerList.mockRejectedValue(new Error("boom"));
    const outcome = await cancelSubscriptionOnDelete(
      stripe,
      user({ stripeSubscriptionId: null, stripeCustomerId: null })
    );
    expect(outcome).toBe("failed");
  });
});
