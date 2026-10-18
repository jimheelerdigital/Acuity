import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The failed-payment follow-ups go through sendTrialEmail like every other
 * lifecycle email, with two differences pinned here:
 *   - they only send while Stripe still has an OPEN invoice (stop on pay /
 *     cancel), and leave no TrialEmailLog row when they don't
 *   - a marketing unsubscribe does not silence them (billing notice)
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/email-tokens", () => ({ signUnsubscribeToken: () => "tok" }));

const sendEmailOrThrow = vi.fn(async (_args: { subject: string; html: string }) => ({ id: "re_1" }));
vi.mock("@/lib/resend", () => ({ sendEmailOrThrow: (a: { subject: string; html: string }) => sendEmailOrThrow(a) }));

const invoicesList = vi.fn();
const subscriptionsRetrieve = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    invoices: { list: (...a: unknown[]) => invoicesList(...a) },
    subscriptions: { retrieve: (...a: unknown[]) => subscriptionsRetrieve(...a) },
  },
}));

const userRow = {
  id: "u1",
  email: "a@b.com",
  name: "Sarah",
  trialEndsAt: null,
  totalRecordings: 0,
  foundingMemberNumber: null,
  onboardingUnsubscribed: false,
  signupLandingPath: "/start",
  stripeCustomerId: "cus_1",
  stripeFirstFailureAt: new Date("2026-10-16T12:00:00Z"),
};
const logs: { userId: string; emailKey: string }[] = [];
const prisma = {
  user: { findUnique: vi.fn(async () => userRow) },
  trialEmailLog: {
    findUnique: vi.fn(async ({ where }: { where: { userId_emailKey: { userId: string; emailKey: string } } }) =>
      logs.find((l) => l.userId === where.userId_emailKey.userId && l.emailKey === where.userId_emailKey.emailKey) ?? null
    ),
    upsert: vi.fn(async ({ create }: { create: { userId: string; emailKey: string } }) => {
      logs.push({ userId: create.userId, emailKey: create.emailKey });
    }),
  },
  theme: { findMany: vi.fn(async () => []) },
  entry: { findFirst: vi.fn(async () => null) },
  task: { count: vi.fn(async () => 0) },
};
vi.mock("@/lib/prisma", () => ({ prisma }));

import { sendTrialEmail } from "./trial-emails";

beforeEach(() => {
  logs.length = 0;
  sendEmailOrThrow.mockClear();
  userRow.onboardingUnsubscribed = false;
  userRow.stripeFirstFailureAt = new Date("2026-10-16T12:00:00Z");
  invoicesList.mockReset();
  subscriptionsRetrieve.mockReset();
  subscriptionsRetrieve.mockResolvedValue({ id: "sub_1", trial_end: null });
});

const open = { id: "in_9", hosted_invoice_url: "https://invoice.stripe.com/i/x", amount_due: 999, currency: "usd", billing_reason: "subscription_cycle", subscription: "sub_1" };

describe("payment_failed_2d / 5d through sendTrialEmail", () => {
  it("open invoice → sends with the hosted URL + amount, logs the key", async () => {
    invoicesList.mockImplementation(async (args: { status?: string }) =>
      args.status === "open" ? { data: [open] } : { data: [] }
    );
    const r = await sendTrialEmail("u1", "payment_failed_2d");
    expect(r.sent).toBe(true);
    const call = sendEmailOrThrow.mock.calls[0]![0];
    expect(call.subject).toBe("Pro is still paused");
    expect(call.html).toContain('href="https://invoice.stripe.com/i/x"');
    expect(call.html).toContain("$9.99");
    expect(call.html).toContain("free week"); // no earlier paid invoice → first charge framing
    expect(call.html).not.toMatch(/still active/i);
    expect(logs).toEqual([{ userId: "u1", emailKey: "payment_failed_2d" }]);
  });

  it("no open invoice (paid or canceled) → not_applicable, nothing sent, no log row", async () => {
    invoicesList.mockResolvedValue({ data: [] });
    const r = await sendTrialEmail("u1", "payment_failed_5d");
    expect(r).toEqual({ sent: false, reason: "not_applicable" });
    expect(sendEmailOrThrow).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("anchor cleared (recovered) → not_applicable before touching Stripe", async () => {
    userRow.stripeFirstFailureAt = null as never;
    const r = await sendTrialEmail("u1", "payment_failed_2d");
    expect(r.reason).toBe("not_applicable");
    expect(invoicesList).not.toHaveBeenCalled();
  });

  it("marketing unsubscribe does not block a billing notice, but still blocks marketing", async () => {
    userRow.onboardingUnsubscribed = true;
    invoicesList.mockImplementation(async (args: { status?: string }) =>
      args.status === "open" ? { data: [open] } : { data: [] }
    );
    expect((await sendTrialEmail("u1", "payment_failed_5d")).sent).toBe(true);
    expect((await sendTrialEmail("u1", "day2_nudge")).reason).toBe("unsubscribed");
  });

  it("second run dedupes on TrialEmailLog", async () => {
    invoicesList.mockImplementation(async (args: { status?: string }) =>
      args.status === "open" ? { data: [open] } : { data: [] }
    );
    await sendTrialEmail("u1", "payment_failed_2d");
    const again = await sendTrialEmail("u1", "payment_failed_2d");
    expect(again).toEqual({ sent: false, reason: "already_sent" });
    expect(sendEmailOrThrow).toHaveBeenCalledTimes(1);
  });
});
