/**
 * Stripe webhook — recovery / relink behaviour (PR #32).
 *
 * BILLING-CRITICAL. These tests exist because two bugs shipped:
 *
 *   Bug B (recovery): invoice.payment_failed downgrades to FREE with NO
 *     PAST_DUE intermediate (2026-06-12 no-grace spec). The old
 *     invoice.payment_succeeded handler gated its upgrade on
 *     `subscriptionStatus: { not: "FREE" }` — which the failure had just
 *     made false. A user who fixed their card was never restored to PRO.
 *
 *   Bug A (relink): if checkout.session.completed never wrote the customer
 *     link, every later paid event matched 0 rows and silently no-op'd.
 *
 * The fix must do both WITHOUT resurrecting a cleanly-canceled user
 * (W-A audit guard): FREE + stripeFirstFailureAt === null is terminal.
 *
 * Strategy: a tiny in-memory Prisma stand-in that implements the subset of
 * `where` semantics these handlers use (equality, `{ not: x }`, `OR`). We
 * assert the resulting ROW STATE, not the call arguments — asserting
 * arguments would pass against the buggy implementation just as happily.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Types ────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  email: string | null;
  name: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeFirstFailureAt: Date | null;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  createdAt: Date;
  trialEndsAt: Date | null;
};

type RevRow = {
  source: string;
  type: string;
  stripeEventId: string | null;
  stripeChargeId: string;
  customerEmail: string | null;
  userId: string | null;
  amountCents: number;
  currency: string;
  plan: string | null;
  occurredAt: Date;
};

let users: Row[] = [];
let stripeEvents: { id: string; type: string }[] = [];
let revenue: RevRow[] = [];

const user = (over: Partial<Row> = {}): Row => ({
  id: "u1",
  email: "a@b.com",
  name: "A",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  stripeCurrentPeriodEnd: null,
  stripeFirstFailureAt: null,
  subscriptionStatus: "PRO",
  subscriptionSource: "stripe",
  createdAt: new Date("2026-01-01"),
  trialEndsAt: null,
  ...over,
});

// ─── Minimal Prisma `where` evaluator ─────────────────────────────────────
// Supports: scalar equality (incl. null), { not: value }, and OR: [...].

function matchLeaf(rowVal: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === "object" && "not" in (cond as object)) {
    const not = (cond as { not: unknown }).not;
    return not === null ? rowVal !== null : rowVal !== not;
  }
  return rowVal === cond;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") {
      const clauses = cond as Record<string, unknown>[];
      return clauses.some((c) => matches(row, c));
    }
    return matchLeaf((row as unknown as Record<string, unknown>)[key], cond);
  });
}

const prismaMock = {
  user: {
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hits = users.filter((u) => matches(u, where));
        hits.forEach((u) => Object.assign(u, data));
        return { count: hits.length };
      }
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      users.filter((u) => matches(u, where))
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row) {
          const err = new Error("Record to update not found") as Error & {
            code?: string;
          };
          err.code = "P2025";
          throw err;
        }
        Object.assign(row, data);
        return row;
      }
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      users.find((u) => matches(u, where)) ?? null
    ),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      users.find((u) => matches(u, where)) ?? null
    ),
  },
  // Mirrors the real @@unique([stripeChargeId, type]) upsert key.
  revenueEvent: {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { stripeChargeId_type: { stripeChargeId: string; type: string } };
        create: RevRow;
        update: Partial<RevRow>;
      }) => {
        const { stripeChargeId, type } = where.stripeChargeId_type;
        const existing = revenue.find(
          (r) => r.stripeChargeId === stripeChargeId && r.type === type
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        revenue.push({ ...create });
        return create;
      }
    ),
  },
  stripeEvent: {
    create: vi.fn(async ({ data }: { data: { id: string; type: string } }) => {
      if (stripeEvents.some((e) => e.id === data.id)) {
        const err = new Error("Unique constraint") as Error & { code?: string };
        err.code = "P2002";
        throw err;
      }
      stripeEvents.push(data);
      return data;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      stripeEvents = stripeEvents.filter((e) => e.id !== where.id);
      return {};
    }),
  },
};

// ─── Module mocks ─────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const customersRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    // Signature verification is out of scope — the body IS the event.
    webhooks: { constructEvent: (body: string) => JSON.parse(body) },
    customers: { retrieve: (...a: unknown[]) => customersRetrieve(...a) },
  },
}));

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => (k === "stripe-signature" ? "sig_test" : null) }),
}));

vi.mock("@/lib/meta-capi", () => ({
  sendConversionEvent: vi.fn().mockResolvedValue(undefined),
  generateEventId: () => "evt_capi",
}));

// Dynamically imported by the handlers — stub so they don't reach the network.
vi.mock("@/emails/payment-failed", () => ({
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/posthog", () => ({ track: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/founder-notifications", () => ({
  notifyFoundersOfPayment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referrals", () => ({
  recordReferralConversion: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

// ─── Harness ──────────────────────────────────────────────────────────────

let evtSeq = 0;

async function send(type: string, object: unknown) {
  const event = {
    id: `evt_${++evtSeq}`,
    type,
    livemode: false,
    data: { object },
  };
  const body = JSON.stringify(event);
  const req = { text: async () => body } as unknown as Parameters<typeof POST>[0];
  return POST(req);
}

const invoice = (over: Record<string, unknown> = {}) => ({
  id: "in_1",
  customer: "cus_1",
  customer_email: "a@b.com",
  subscription: "sub_1",
  charge: "ch_1",
  amount_paid: 499,
  currency: "usd",
  created: 1780000000,
  billing_reason: "subscription_cycle",
  status_transitions: { paid_at: 1780000500 },
  lines: {
    data: [{ period: { end: 1800000000 }, price: { recurring: { interval: "month" } } }],
  },
  ...over,
});

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  current_period_end: 1800000000,
  metadata: {},
  ...over,
});

const charge = (over: Record<string, unknown> = {}) => ({
  id: "ch_1",
  customer: "cus_1",
  invoice: null,
  paid: true,
  amount: 499,
  amount_refunded: 0,
  currency: "usd",
  created: 1780000000,
  billing_details: { email: "a@b.com" },
  refunds: { data: [] },
  ...over,
});

beforeEach(() => {
  users = [];
  stripeEvents = [];
  revenue = [];
  evtSeq = 0;
  customersRetrieve.mockReset();
  customersRetrieve.mockResolvedValue({ id: "cus_1", email: null, metadata: {} });
});

// ─── 1. Bug B — failed, then recovered ────────────────────────────────────

describe("Bug B: dunning recovery", () => {
  it("payment_failed drops PRO → FREE and stamps stripeFirstFailureAt", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send("invoice.payment_failed", invoice());

    expect(users[0].subscriptionStatus).toBe("FREE");
    expect(users[0].stripeFirstFailureAt).toBeInstanceOf(Date);
  });

  it("payment_succeeded restores FREE-with-anchor → PRO and clears the anchor", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send("invoice.payment_failed", invoice());
    expect(users[0].subscriptionStatus).toBe("FREE"); // precondition

    await send("invoice.payment_succeeded", invoice());

    // THE FIX: main gates on `subscriptionStatus: { not: "FREE" }`, which the
    // failure above just falsified → user stranded on FREE forever.
    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeFirstFailureAt).toBeNull();
  });

  it("subscription.updated → active also lifts a FREE-with-anchor user to PRO", async () => {
    users = [
      user({ subscriptionStatus: "FREE", stripeFirstFailureAt: new Date("2026-07-01") }),
    ];

    await send("customer.subscription.updated", subscription({ status: "active" }));

    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeFirstFailureAt).toBeNull();
  });
});

// ─── 2. Bug A — relink an unlinked customer ───────────────────────────────

describe("Bug A: relink when stripeCustomerId matched 0 rows", () => {
  it("resolves by stripeSubscriptionId, back-fills the link, grants PRO", async () => {
    users = [
      user({
        stripeCustomerId: null, // link never written
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: "TRIAL",
      }),
    ];

    await send("invoice.payment_succeeded", invoice());

    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeCustomerId).toBe("cus_1");
  });

  it("falls back to the Stripe customer's email for an unlinked row", async () => {
    users = [
      user({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        email: "found@b.com",
        subscriptionStatus: "TRIAL",
      }),
    ];
    customersRetrieve.mockResolvedValue({
      id: "cus_1",
      email: "found@b.com",
      metadata: {},
    });

    await send("invoice.payment_succeeded", invoice({ subscription: null }));

    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeCustomerId).toBe("cus_1");
  });

  it("falls back to metadata.userId from the Stripe customer", async () => {
    users = [
      user({
        id: "user_meta",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        email: "other@b.com", // email will NOT match
        subscriptionStatus: "TRIAL",
      }),
    ];
    customersRetrieve.mockResolvedValue({
      id: "cus_1",
      email: "nobody@b.com",
      metadata: { userId: "user_meta" },
    });

    await send("invoice.payment_succeeded", invoice({ subscription: null }));

    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeCustomerId).toBe("cus_1");
  });

  it("never steals a row already linked to a different customer (email path)", async () => {
    users = [
      user({
        id: "other_owner",
        stripeCustomerId: "cus_OTHER",
        stripeSubscriptionId: null,
        email: "shared@b.com",
        subscriptionStatus: "FREE",
        stripeFirstFailureAt: null,
      }),
    ];
    customersRetrieve.mockResolvedValue({
      id: "cus_1",
      email: "shared@b.com",
      metadata: {},
    });

    await send("invoice.payment_succeeded", invoice({ subscription: null }));

    expect(users[0].stripeCustomerId).toBe("cus_OTHER");
    expect(users[0].subscriptionStatus).toBe("FREE");
  });
});

// ─── 3. Canceled-user guard (must hold on BOTH implementations) ───────────

describe("canceled-user guard", () => {
  it("does NOT resurrect a cleanly-canceled user (FREE, anchor cleared)", async () => {
    users = [
      user({ subscriptionStatus: "FREE", stripeFirstFailureAt: null }),
    ];

    await send("invoice.payment_succeeded", invoice());

    expect(users[0].subscriptionStatus).toBe("FREE");
  });

  it("does NOT resurrect a canceled user via subscription.updated → active", async () => {
    users = [user({ subscriptionStatus: "FREE", stripeFirstFailureAt: null })];

    await send("customer.subscription.updated", subscription({ status: "active" }));

    expect(users[0].subscriptionStatus).toBe("FREE");
  });
});

// ─── 4. "incomplete" — neither grant nor downgrade ────────────────────────

describe("incomplete (first charge pending)", () => {
  it("does not grant PRO", async () => {
    users = [user({ subscriptionStatus: "TRIAL", stripeFirstFailureAt: null })];

    await send("customer.subscription.updated", subscription({ status: "incomplete" }));

    expect(users[0].subscriptionStatus).toBe("TRIAL");
  });

  it("does not downgrade an existing PRO", async () => {
    users = [user({ subscriptionStatus: "PRO" })];

    await send("customer.subscription.updated", subscription({ status: "incomplete" }));

    expect(users[0].subscriptionStatus).toBe("PRO");
  });
});

// ─── 5. RevenueEvent ingestion (Stage 1) ──────────────────────────────────

describe("RevenueEvent ingestion", () => {
  it("books a renewal on invoice.payment_succeeded, linked to the user", async () => {
    users = [user({ subscriptionStatus: "PRO" })];

    await send("invoice.payment_succeeded", invoice());

    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({
      source: "stripe",
      type: "renewal", // billing_reason: subscription_cycle
      stripeChargeId: "ch_1",
      amountCents: 499,
      plan: "monthly",
      userId: "u1",
    });
  });

  it("classifies a first payment (subscription_create) as a charge, not a renewal", async () => {
    users = [user()];

    await send(
      "invoice.payment_succeeded",
      invoice({ billing_reason: "subscription_create" })
    );

    expect(revenue[0].type).toBe("charge");
  });

  it("derives plan=annual from the price interval", async () => {
    users = [user()];

    await send(
      "invoice.payment_succeeded",
      invoice({
        amount_paid: 3999,
        lines: {
          data: [{ period: { end: 1800000000 }, price: { recurring: { interval: "year" } } }],
        },
      })
    );

    expect(revenue[0]).toMatchObject({ plan: "annual", amountCents: 3999 });
  });

  // The double-count guard. A subscription payment emits BOTH events.
  it("does NOT double-count when charge.succeeded and invoice.paid describe the same charge", async () => {
    users = [user()];

    await send("invoice.payment_succeeded", invoice()); // books ch_1
    await send("charge.succeeded", charge({ invoice: "in_1" })); // must skip

    expect(revenue).toHaveLength(1);
    expect(revenue.reduce((s, r) => s + r.amountCents, 0)).toBe(499);
  });

  it("upserts rather than appends when invoice.paid repeats the same charge", async () => {
    users = [user()];

    await send("invoice.payment_succeeded", invoice());
    await send("invoice.paid", invoice());

    expect(revenue).toHaveLength(1);
    expect(revenue[0].amountCents).toBe(499);
  });

  it("books an invoice-less charge.succeeded as a one-off charge", async () => {
    users = [user()];

    await send("charge.succeeded", charge({ invoice: null, amount: 1500 }));

    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({ type: "charge", amountCents: 1500, plan: null });
  });

  it("writes refunds as NEGATIVE amounts", async () => {
    users = [user()];

    await send(
      "charge.refunded",
      charge({ amount_refunded: 499, refunds: { data: [{ created: 1781000000 }] } })
    );

    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({ type: "refund", amountCents: -499 });
  });

  it("net cash = charge + refund sums to zero on a fully refunded charge", async () => {
    users = [user()];

    await send("invoice.payment_succeeded", invoice());
    await send("charge.refunded", charge({ amount_refunded: 499 }));

    expect(revenue).toHaveLength(2); // one money-in, one refund — distinct types
    expect(revenue.reduce((s, r) => s + r.amountCents, 0)).toBe(0);
  });

  it("a partial refund followed by a larger one upserts to the cumulative total", async () => {
    users = [user()];

    await send("charge.refunded", charge({ amount_refunded: 200 }));
    await send("charge.refunded", charge({ amount_refunded: 499 })); // cumulative

    expect(revenue).toHaveLength(1);
    expect(revenue[0].amountCents).toBe(-499);
  });

  it("still books revenue when the user cannot be resolved", async () => {
    users = []; // nobody matches

    await send("invoice.payment_succeeded", invoice());

    expect(revenue).toHaveLength(1);
    expect(revenue[0].userId).toBeNull();
    expect(revenue[0].customerEmail).toBe("a@b.com");
  });

  it("does not book revenue on invoice.payment_failed (no money moved)", async () => {
    users = [user({ subscriptionStatus: "PRO" })];

    await send("invoice.payment_failed", invoice());

    expect(revenue).toHaveLength(0);
    expect(users[0].subscriptionStatus).toBe("FREE"); // dunning logic still runs
  });
});
