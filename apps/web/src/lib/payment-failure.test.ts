import { describe, expect, it, vi } from "vitest";

import {
  detectFirstPostTrialCharge,
  findOpenInvoice,
  invoiceSubscriptionId,
  isFirstPostTrialCharge,
  parsePaymentFailedEventValue,
  paymentFailedEventValue,
} from "./payment-failure";
import { followUpKeyFor } from "./payment-failed-followups";
import { formatAmount, paymentFailedCopy } from "@/emails/payment-failed";

const NOW = new Date("2026-10-18T12:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe("isFirstPostTrialCharge", () => {
  it("subscription_cycle + trial ended 1 day ago → first charge", () => {
    expect(
      isFirstPostTrialCharge({
        billingReason: "subscription_cycle",
        trialEndSec: sec(new Date(NOW.getTime() - 24 * 3600_000)),
        hadEarlierPaidInvoice: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("subscription_cycle with no earlier paid invoice → first charge even if trial_end is old/missing", () => {
    expect(isFirstPostTrialCharge({ billingReason: "subscription_cycle", trialEndSec: null, hadEarlierPaidInvoice: false, now: NOW })).toBe(true);
  });

  it("trial ended 10 days ago and something was paid before → renewal", () => {
    expect(
      isFirstPostTrialCharge({
        billingReason: "subscription_cycle",
        trialEndSec: sec(new Date(NOW.getTime() - 10 * 24 * 3600_000)),
        hadEarlierPaidInvoice: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("anything but subscription_cycle is never a first charge", () => {
    for (const r of ["subscription_create", "manual", "subscription_update", null, undefined]) {
      expect(isFirstPostTrialCharge({ billingReason: r, trialEndSec: sec(NOW), hadEarlierPaidInvoice: false, now: NOW })).toBe(false);
    }
  });
});

describe("detectFirstPostTrialCharge (Stripe reads)", () => {
  function stripeWith(trialEnd: number | null, paid: { id: string; amount_paid: number }[]) {
    return {
      subscriptions: { retrieve: vi.fn(async () => ({ trial_end: trialEnd })) },
      invoices: { list: vi.fn(async () => ({ data: paid })) },
    } as never;
  }

  it("reads trial_end + earlier paid invoices and applies the rule", async () => {
    const s = stripeWith(sec(new Date(NOW.getTime() - 3600_000)), []);
    expect(await detectFirstPostTrialCharge(s, { id: "in_2", billing_reason: "subscription_cycle", subscription: "sub_1" }, NOW)).toBe(true);
  });

  it("ignores the failing invoice itself and $0 trial invoices when looking for earlier payments", async () => {
    const s = stripeWith(sec(new Date(NOW.getTime() - 30 * 24 * 3600_000)), [
      { id: "in_2", amount_paid: 999 },
      { id: "in_1", amount_paid: 0 },
    ]);
    expect(await detectFirstPostTrialCharge(s, { id: "in_2", billing_reason: "subscription_cycle", subscription: "sub_1" }, NOW)).toBe(true);
  });

  it("Stripe error → false (renewal copy is the safe default)", async () => {
    const s = { subscriptions: { retrieve: vi.fn(async () => { throw new Error("boom"); }) }, invoices: { list: vi.fn(async () => ({ data: [] })) } } as never;
    expect(await detectFirstPostTrialCharge(s, { id: "in_2", billing_reason: "subscription_cycle", subscription: "sub_1" }, NOW)).toBe(false);
  });

  it("no subscription on the invoice → false without calling Stripe", async () => {
    const s = stripeWith(null, []);
    expect(await detectFirstPostTrialCharge(s, { id: "in_2", billing_reason: "subscription_cycle", subscription: null }, NOW)).toBe(false);
    expect((s as { subscriptions: { retrieve: ReturnType<typeof vi.fn> } }).subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

describe("findOpenInvoice", () => {
  it("returns the hosted URL of the open invoice, null when nothing is open", async () => {
    const list = vi.fn(async () => ({ data: [{ id: "in_9", hosted_invoice_url: "https://invoice.stripe.com/i/x", amount_due: 999, currency: "usd", billing_reason: "subscription_cycle", subscription: "sub_1" }] }));
    const s = { invoices: { list }, subscriptions: {} } as never;
    expect(await findOpenInvoice(s, "cus_1")).toEqual({ id: "in_9", hostedInvoiceUrl: "https://invoice.stripe.com/i/x", amountDue: 999, currency: "usd", billingReason: "subscription_cycle", subscription: "sub_1" });
    expect(list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 1 });
    const none = { invoices: { list: vi.fn(async () => ({ data: [] })) }, subscriptions: {} } as never;
    expect(await findOpenInvoice(none, "cus_1")).toBeNull();
  });
});

describe("funnel_payment_failed value", () => {
  it("round-trips and tolerates the pre-10/18 format", () => {
    expect(paymentFailedEventValue("insufficient_funds", true)).toBe("decline:insufficient_funds;first_charge:true");
    expect(parsePaymentFailedEventValue("decline:insufficient_funds;first_charge:true")).toEqual({ declineCode: "insufficient_funds", firstCharge: true });
    expect(parsePaymentFailedEventValue("decline:expired_card;first_charge:false")).toEqual({ declineCode: "expired_card", firstCharge: false });
    expect(parsePaymentFailedEventValue("decline:card_declined")).toEqual({ declineCode: "card_declined", firstCharge: null });
    expect(parsePaymentFailedEventValue(null)).toEqual({ declineCode: "unknown", firstCharge: null });
  });
});

describe("followUpKeyFor", () => {
  it("nothing before 44h, 2d until 116h, 5d until 240h, nothing after", () => {
    expect(followUpKeyFor(0)).toBeNull();
    expect(followUpKeyFor(43.9)).toBeNull();
    expect(followUpKeyFor(44)).toBe("payment_failed_2d");
    expect(followUpKeyFor(115.9)).toBe("payment_failed_2d");
    expect(followUpKeyFor(116)).toBe("payment_failed_5d");
    expect(followUpKeyFor(239.9)).toBe("payment_failed_5d");
    expect(followUpKeyFor(240)).toBeNull();
    expect(followUpKeyFor(Number.NaN)).toBeNull();
  });
});

describe("payment-failed copy", () => {
  it("first charge: free-week framing, hosted invoice CTA, no 'still active'", () => {
    const c = paymentFailedCopy({ to: "a@b.com", name: "Sarah K", hostedInvoiceUrl: "https://invoice.stripe.com/i/x", amountDue: 999, currency: "usd", firstCharge: true });
    expect(c.subject).toBe("Your free week ended and your card didn't go through");
    expect(c.ctaUrl).toBe("https://invoice.stripe.com/i/x");
    expect(c.intro).toContain("Hi Sarah");
    expect(c.intro).toContain("$9.99");
    expect(c.intro).toContain("Pro is paused");
    expect(c.intro).toContain("No sign-in needed.");
    expect(c.intro + c.footnote).not.toMatch(/still active/i);
  });

  it("renewal: paused framing, falls back to /api/stripe/manage without a hosted URL", () => {
    const c = paymentFailedCopy({ to: "a@b.com", name: null, firstCharge: false });
    expect(c.subject).toBe("Couldn't charge your card — Pro is paused");
    expect(c.ctaUrl).toMatch(/\/api\/stripe\/manage$/);
    expect(c.intro).toContain("Hi there");
    expect(c.intro).not.toContain("No sign-in needed");
    expect(c.intro + c.footnote).not.toMatch(/still active|this month/i);
  });

  it("copy rules: no time-of-day words, duration claims or therapy claims", () => {
    for (const fc of [true, false]) {
      const c = paymentFailedCopy({ to: "a@b.com", name: "A", firstCharge: fc, hostedInvoiceUrl: "https://x" });
      const all = `${c.subject} ${c.title} ${c.preheader} ${c.intro} ${c.footnote}`;
      expect(all).not.toMatch(/tonight|this morning|this evening|bedtime/i);
      expect(all).not.toMatch(/\b\d+ ?(seconds?|minutes?)\b/i);
      expect(all).not.toMatch(/therap|diagnos|cure/i);
      expect(all).not.toMatch(/brain dump/i);
    }
  });

  it("formatAmount", () => {
    expect(formatAmount(8999, "usd")).toBe("$89.99");
    expect(formatAmount(null, "usd")).toBeNull();
    expect(formatAmount(500, null)).toBe("$5.00");
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads the old top-level field", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
  });
  it("reads the 2026-04-22 parent.subscription_details shape", () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
  });
  it("returns null when neither is present", () => {
    expect(invoiceSubscriptionId({ parent: null })).toBeNull();
  });
});
