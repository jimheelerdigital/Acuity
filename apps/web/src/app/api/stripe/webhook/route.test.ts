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

let users: Row[] = [];
let stripeEvents: { id: string; type: string }[] = [];
// Server-fired funnel telemetry (Task 1/2, 2026-07-10). Seeded with the user's
// original funnel session so we can assert the webhook copies its sessionToken +
// flowVersion forward onto the payment event.
let onboardingEvents: Array<Record<string, unknown>> = [];

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
  },
  onboardingEvent: {
    // Resolves the user's most recent funnel session (resolveFunnelContext).
    findFirst: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { createdAt?: "asc" | "desc" };
      }) => {
        let hits = onboardingEvents.filter((e) => {
          const w = where as Record<string, unknown>;
          if (w.userId && e.userId !== w.userId) return false;
          const ev = w.event as { startsWith?: string; in?: string[] } | undefined;
          if (ev?.startsWith && !String(e.event).startsWith(ev.startsWith)) return false;
          if (ev?.in && !ev.in.includes(e.event as string)) return false;
          const st = w.sessionToken as { not?: unknown } | undefined;
          if (st && "not" in st && st.not === null && e.sessionToken == null) return false;
          return true;
        });
        if (orderBy?.createdAt === "desc") {
          hits = hits.sort(
            (a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()
          );
        }
        return hits[0] ?? null;
      }
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `oe_${onboardingEvents.length + 1}`, createdAt: new Date(), ...data };
      onboardingEvents.push(row);
      return row;
    }),
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
const paymentIntentsRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    // Signature verification is out of scope — the body IS the event.
    webhooks: { constructEvent: (body: string) => JSON.parse(body) },
    customers: { retrieve: (...a: unknown[]) => customersRetrieve(...a) },
    paymentIntents: { retrieve: (...a: unknown[]) => paymentIntentsRetrieve(...a) },
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
  subscription: "sub_1",
  lines: { data: [{ period: { end: 1800000000 } }] },
  ...over,
});

const checkoutSession = (over: Record<string, unknown> = {}) => ({
  id: "cs_1",
  customer: "cus_1",
  subscription: "sub_1",
  metadata: { userId: "u1", interval: "yearly" },
  ...over,
});

// A seeded funnel event standing in for the user's original funnel session, so
// the payment event we assert on has a sessionToken + flowVersion to inherit.
const funnelSeed = (over: Record<string, unknown> = {}) => ({
  id: "oe_seed",
  userId: "u1",
  event: "funnel_entry_viewed",
  sessionToken: "sess_1",
  flowVersion: "v6",
  createdAt: new Date("2026-07-10T13:00:00Z"),
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

beforeEach(() => {
  users = [];
  stripeEvents = [];
  onboardingEvents = [];
  evtSeq = 0;
  customersRetrieve.mockReset();
  customersRetrieve.mockResolvedValue({ id: "cus_1", email: null, metadata: {} });
  paymentIntentsRetrieve.mockReset();
  paymentIntentsRetrieve.mockResolvedValue({
    last_payment_error: { decline_code: "insufficient_funds", code: "card_declined" },
  });
});

// Convenience: the funnel_payment_completed / funnel_payment_failed row the
// webhook wrote (if any), for the assertions below.
const paymentEvent = (event: string) =>
  onboardingEvents.find((e) => e.event === event);

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

// ─── 1b. Bug C — dunning via subscription.updated must stay recoverable ────
// customer.subscription.updated(past_due|unpaid) downgrades to FREE. Before
// 2026-07-17 it wrote FREE with NO anchor, so the row was indistinguishable
// from a clean cancel and proRecoveryWhere refused to restore PRO when the
// card was fixed — Kai's stranded-but-paying state (2026-07-16). The fix
// stamps stripeFirstFailureAt on the dunning downgrade, mirroring
// invoice.payment_failed, WITHOUT changing the clean-cancel terminal state.

describe("Bug C: dunning via subscription.updated", () => {
  it("past_due downgrades PRO → FREE and stamps stripeFirstFailureAt", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send("customer.subscription.updated", subscription({ status: "past_due" }));

    expect(users[0].subscriptionStatus).toBe("FREE");
    expect(users[0].stripeFirstFailureAt).toBeInstanceOf(Date);
  });

  it("unpaid also stamps the anchor", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send("customer.subscription.updated", subscription({ status: "unpaid" }));

    expect(users[0].subscriptionStatus).toBe("FREE");
    expect(users[0].stripeFirstFailureAt).toBeInstanceOf(Date);
  });

  it("end-to-end: past_due → FREE+anchor, then active → PRO (Kai's scenario)", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    // Renewal charge fails; Stripe moves the sub to past_due.
    await send("customer.subscription.updated", subscription({ status: "past_due" }));
    expect(users[0].subscriptionStatus).toBe("FREE"); // precondition
    expect(users[0].stripeFirstFailureAt).toBeInstanceOf(Date); // recoverable

    // User fixes their card; Stripe moves the sub back to active.
    await send("customer.subscription.updated", subscription({ status: "active" }));

    expect(users[0].subscriptionStatus).toBe("PRO");
    expect(users[0].stripeFirstFailureAt).toBeNull(); // anchor cleared on recovery
  });

  it("anchors the FIRST failure only — a second past_due does not move the window", async () => {
    const firstFailure = new Date("2026-07-15T10:00:00Z");
    users = [
      user({ subscriptionStatus: "FREE", stripeFirstFailureAt: firstFailure }),
    ];

    await send("customer.subscription.updated", subscription({ status: "past_due" }));

    expect(users[0].stripeFirstFailureAt).toEqual(firstFailure);
  });

  it("canceled downgrades to FREE and does NOT stamp the anchor (stays terminal)", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send("customer.subscription.updated", subscription({ status: "canceled" }));

    expect(users[0].subscriptionStatus).toBe("FREE");
    expect(users[0].stripeFirstFailureAt).toBeNull();
  });

  it("incomplete_expired downgrades to FREE and does NOT stamp the anchor", async () => {
    users = [user({ subscriptionStatus: "PRO", stripeFirstFailureAt: null })];

    await send(
      "customer.subscription.updated",
      subscription({ status: "incomplete_expired" })
    );

    expect(users[0].subscriptionStatus).toBe("FREE");
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

// ─── 5. Task 1 — server-side payment telemetry (funnel_payment_completed) ──
// The account-first funnel restructure (2026-06-02) dropped the client-side
// funnel_payment_completed, so payment telemetry went to ZERO. The webhook now
// re-fires it, inheriting the user's original funnel session so it lands in
// admin funnel analytics (which only reads sessionToken-bearing rows).

describe("Task 1: payment telemetry", () => {
  it("checkout.session.completed writes funnel_payment_completed = <plan>:first_payment on the funnel session", async () => {
    users = [user({ id: "u1", subscriptionStatus: "TRIAL" })];
    onboardingEvents = [funnelSeed()];

    await send(
      "checkout.session.completed",
      checkoutSession({ metadata: { userId: "u1", interval: "yearly" } })
    );

    const ev = paymentEvent("funnel_payment_completed");
    expect(ev).toBeTruthy();
    expect(ev!.value).toBe("annual:first_payment");
    // Inherited from the seeded funnel session → visible in admin analytics.
    expect(ev!.sessionToken).toBe("sess_1");
    expect(ev!.flowVersion).toBe("v6");
    expect(ev!.userId).toBe("u1");
  });

  it("renewal invoice (subscription_cycle) writes funnel_payment_completed = <plan>:renewal", async () => {
    users = [user({ id: "u1", subscriptionStatus: "PRO" })];
    onboardingEvents = [funnelSeed()];

    await send(
      "invoice.payment_succeeded",
      invoice({
        billing_reason: "subscription_cycle",
        lines: { data: [{ period: { end: 1800000000 }, price: { recurring: { interval: "month" } } }] },
      })
    );

    const ev = paymentEvent("funnel_payment_completed");
    expect(ev).toBeTruthy();
    expect(ev!.value).toBe("monthly:renewal");
    expect(ev!.sessionToken).toBe("sess_1");
  });

  it("first invoice (subscription_create) does NOT double-count — checkout.session.completed owns first_payment", async () => {
    users = [user({ id: "u1", subscriptionStatus: "PRO" })];
    onboardingEvents = [funnelSeed()];

    await send(
      "invoice.payment_succeeded",
      invoice({ billing_reason: "subscription_create" })
    );

    expect(paymentEvent("funnel_payment_completed")).toBeUndefined();
  });
});

// ─── 6. Task 2 — decline-code telemetry on invoice.payment_failed ─────────

describe("Task 2: decline-code telemetry", () => {
  it("logs funnel_payment_failed carrying the Stripe decline code", async () => {
    users = [user({ id: "u1", subscriptionStatus: "PRO" })];
    onboardingEvents = [funnelSeed()];
    paymentIntentsRetrieve.mockResolvedValue({
      last_payment_error: { decline_code: "insufficient_funds" },
    });

    await send("invoice.payment_failed", invoice({ payment_intent: "pi_1" }));

    const ev = paymentEvent("funnel_payment_failed");
    expect(ev).toBeTruthy();
    expect(ev!.value).toBe("decline:insufficient_funds");
    expect(ev!.userId).toBe("u1");
    // The downgrade still happened (decline logging is additive, best-effort).
    expect(users[0].subscriptionStatus).toBe("FREE");
  });

  it("falls back to decline:unknown when no payment_intent is present", async () => {
    users = [user({ id: "u1", subscriptionStatus: "PRO" })];
    onboardingEvents = [funnelSeed()];

    await send("invoice.payment_failed", invoice()); // no payment_intent

    const ev = paymentEvent("funnel_payment_failed");
    expect(ev).toBeTruthy();
    expect(ev!.value).toBe("decline:unknown");
  });
});
