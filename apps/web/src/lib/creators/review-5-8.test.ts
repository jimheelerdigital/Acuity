/**
 * Creator payments review, findings 5–8 (2026-10-28).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  creatorRevenueEvent: { findMany: vi.fn(), findUnique: vi.fn() },
  creatorReferral: { findFirst: vi.fn(), findUnique: vi.fn() },
  creatorReferralClick: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}));
const ledger = vi.hoisted(() => ({
  recordPayment: vi.fn(),
  recordReversal: vi.fn(),
  recordRefundReversed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./ledger", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ledger")>();
  return { ...real, ...ledger };
});

import { signCaptureToken, verifyCaptureToken } from "./email-capture";
import { attributeNewUser } from "./attribution";
import {
  classifyRcMoneyEvent,
  handleAppleNotificationForCreators,
  handleRevenueCatEventForCreators,
} from "./providers";
import { reconcileStoreRefunds, refundGateReason, type RefundSources } from "./refund-reconcile";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
});

// ── 5. Email capture needs proof of inbox ownership ────────────────────

describe("captured-email token (finding 5)", () => {
  const claim = { clickId: "3b241101-e2bb-4255-8caf-4136c566a962", email: "Jo@Example.com" };

  it("round-trips the click and the lower-cased email", () => {
    expect(verifyCaptureToken(signCaptureToken(claim))).toEqual({
      clickId: claim.clickId,
      email: "jo@example.com",
    });
  });
  it("rejects a forged, altered, re-keyed or expired token", () => {
    const t = signCaptureToken(claim);
    const [payload, mac] = t.split(".");
    const other = Buffer.from(`${claim.clickId}\nattacker@x.com\n${Date.now() + 1e9}`).toString("base64url");
    expect(verifyCaptureToken(`${other}.${mac}`)).toBeNull();
    expect(verifyCaptureToken(`${payload}.${mac}x`)).toBeNull();
    expect(verifyCaptureToken(`${payload}.${mac}.extra`)).toBeNull();
    expect(verifyCaptureToken("")).toBeNull();
    process.env.NEXTAUTH_SECRET = "another-secret";
    expect(verifyCaptureToken(t)).toBeNull();
    process.env.NEXTAUTH_SECRET = "test-secret";
    expect(verifyCaptureToken(t, Date.now() + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
  it("signup only matches a VERIFIED capture", async () => {
    db.creatorReferralClick.findFirst.mockResolvedValue(null);
    const r = await attributeNewUser({ userId: "u1", email: " Jo@Example.com ", clickId: null });
    expect(r).toBeNull();
    const where = db.creatorReferralClick.findFirst.mock.calls[0][0].where;
    expect(where.capturedEmail).toBe("jo@example.com");
    expect(where.capturedEmailVerifiedAt).toEqual({ not: null });
  });

  it("tapping a store button in the email verifies exactly that capture", async () => {
    const { POST } = await import("@/app/c/get/route");
    const { NextRequest } = await import("next/server");
    db.creatorReferralClick.updateMany.mockResolvedValue({ count: 1 });
    db.creatorReferralClick.findUnique.mockResolvedValue({ creator: { referralCode: "TESSA" } });
    const t = signCaptureToken(claim);
    const post = (body: string) =>
      POST(
        new NextRequest("https://goripple.io/c/get", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        })
      );
    const ok = await post(new URLSearchParams({ t, s: "android" }).toString());
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toContain("play.google.com");
    expect(ok.headers.get("location")).toContain("TESSA");
    expect(db.creatorReferralClick.updateMany).toHaveBeenCalledWith({
      where: { clickId: claim.clickId, capturedEmail: "jo@example.com", capturedEmailVerifiedAt: null },
      data: { capturedEmailVerifiedAt: expect.any(Date) },
    });

    vi.clearAllMocks();
    const bad = await post(new URLSearchParams({ t: "forged.token", s: "ios" }).toString());
    expect(bad.status).toBe(303);
    expect(bad.headers.get("location")).toContain("apps.apple.com");
    expect(db.creatorReferralClick.updateMany).not.toHaveBeenCalled();
  });
});

// ── 6 / 7 / 8. RevenueCat event classification ─────────────────────────

describe("RevenueCat money events (findings 6–8)", () => {
  const base = { store: "APP_STORE", environment: "PRODUCTION", price: 9.99, transaction_id: "2000001" };

  it("PRODUCT_CHANGE is not a charge (finding 6)", () => {
    expect(classifyRcMoneyEvent({ ...base, type: "PRODUCT_CHANGE" }).kind).toBe("ignore");
    expect(classifyRcMoneyEvent({ ...base, type: "RENEWAL" })).toMatchObject({ kind: "payment", amountCents: 999 });
    expect(classifyRcMoneyEvent({ ...base, type: "INITIAL_PURCHASE" }).kind).toBe("payment");
    expect(classifyRcMoneyEvent({ ...base, type: "NON_RENEWING_PURCHASE" }).kind).toBe("payment");
  });
  it("trials, zero prices and sandbox carry no money", () => {
    expect(classifyRcMoneyEvent({ ...base, type: "INITIAL_PURCHASE", period_type: "TRIAL" }).kind).toBe("ignore");
    expect(classifyRcMoneyEvent({ ...base, type: "RENEWAL", price: 0 }).kind).toBe("ignore");
    expect(classifyRcMoneyEvent({ ...base, type: "RENEWAL", environment: "SANDBOX" }).kind).toBe("ignore");
    expect(classifyRcMoneyEvent({ ...base, type: "RENEWAL", environment: "SANDBOX" }, true).kind).toBe("payment");
  });
  it("RC Web Billing counts; RC's mirror of Stripe Checkout does not (finding 8)", () => {
    expect(classifyRcMoneyEvent({ ...base, store: "RC_BILLING", type: "RENEWAL" })).toMatchObject({
      kind: "payment",
      store: "rc_billing",
    });
    expect(classifyRcMoneyEvent({ ...base, store: "STRIPE", type: "RENEWAL" }).kind).toBe("ignore");
    expect(classifyRcMoneyEvent({ ...base, store: "PROMOTIONAL", type: "RENEWAL" }).kind).toBe("ignore");
  });
  it("refunds and refund reversals (finding 7)", () => {
    expect(
      classifyRcMoneyEvent({ ...base, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", price: -9.99 })
    ).toEqual({ kind: "refund", store: "app_store", transactionId: "2000001", amountCents: 999 });
    expect(classifyRcMoneyEvent({ ...base, type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", price: 0 }).kind).toBe(
      "ignore"
    );
    expect(classifyRcMoneyEvent({ ...base, type: "REFUND_REVERSED" })).toEqual({
      kind: "refund_reversed",
      transactionId: "2000001",
    });
  });

  it("records a Web Billing renewal for a referred user, keyed by transaction", async () => {
    db.creatorReferral.findFirst.mockResolvedValue({ userId: "u1" });
    ledger.recordPayment.mockResolvedValue({ recorded: true, revenueEventId: "e1", commissionCents: 250 });
    await handleRevenueCatEventForCreators({
      ...base,
      id: "evt1",
      store: "RC_BILLING",
      type: "RENEWAL",
      transaction_id: "rcbtxn_1",
      app_user_id: "u1",
    });
    expect(ledger.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", store: "rc_billing", externalEventId: "rc:txn:rcbtxn_1", amountPaid: 999 })
    );
  });
  it("skips a Web Billing transaction already counted from Stripe", async () => {
    db.creatorReferral.findFirst.mockResolvedValue({ userId: "u1" });
    db.creatorRevenueEvent.findUnique.mockResolvedValue({ id: "stripe-row" });
    await handleRevenueCatEventForCreators({
      ...base,
      store: "RC_BILLING",
      type: "RENEWAL",
      transaction_id: "in_123",
      app_user_id: "u1",
    });
    expect(db.creatorRevenueEvent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalEventId: "stripe:inv:in_123" } })
    );
    expect(ledger.recordPayment).not.toHaveBeenCalled();
  });
  it("never records a PRODUCT_CHANGE", async () => {
    db.creatorReferral.findFirst.mockResolvedValue({ userId: "u1" });
    await handleRevenueCatEventForCreators({ ...base, type: "PRODUCT_CHANGE", app_user_id: "u1" });
    expect(ledger.recordPayment).not.toHaveBeenCalled();
  });
  it("RC refund and Apple REFUND share one key per transaction", async () => {
    db.creatorRevenueEvent.findUnique.mockResolvedValue({ amountPaid: 999 });
    ledger.recordReversal.mockResolvedValue({ clawbackCents: -250, creatorIds: ["c1"] });
    await handleRevenueCatEventForCreators({
      ...base,
      id: "evt2",
      type: "CANCELLATION",
      cancel_reason: "CUSTOMER_SUPPORT",
      price: -9.99,
    });
    await handleAppleNotificationForCreators({
      notificationType: "REFUND",
      transactionId: "2000001",
      revocationDate: 1_700_000_000_000,
      notificationUUID: "n1",
    });
    const keys = ledger.recordReversal.mock.calls.map((c) => c[0].externalEventId);
    expect(keys).toEqual(["rc:refund:txn:2000001", "rc:refund:txn:2000001"]);
    expect(ledger.recordReversal.mock.calls[1][0]).toMatchObject({
      paymentExternalId: "rc:txn:2000001",
      amount: 999,
      occurredAt: new Date(1_700_000_000_000),
    });
  });
  it("Apple REFUND_REVERSED undoes the clawback", async () => {
    ledger.recordRefundReversed.mockResolvedValue(250);
    await handleAppleNotificationForCreators({ notificationType: "REFUND_REVERSED", transactionId: "2000001" });
    expect(ledger.recordRefundReversed).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "2000001" }));
  });
});

// ── 7. Store refund check before payouts ───────────────────────────────

describe("store refund check (finding 7)", () => {
  const payments = [
    { id: "p1", userId: "ua", store: "app_store", externalEventId: "rc:txn:A1" }, // earlier period, refunded
    { id: "p2", userId: "ua", store: "app_store", externalEventId: "rc:txn:A2" },
    { id: "p3", userId: "ub", store: "play_store", externalEventId: "rc:txn:GPA.1..1" }, // voided renewal
    { id: "p4", userId: "uc", store: "play_store", externalEventId: "rc:txn:GPA.2" }, // already refunded
  ];
  const sources = (over: Partial<RefundSources> = {}): RefundSources => ({
    appleRefunds: vi.fn(async () => [{ transactionId: "A1", refundedAt: 1_700_000_000_000 }]),
    googleVoided: vi.fn(async () => [{ transactionId: "GPA.1..1", refundedAt: null }, { transactionId: "GPA.9", refundedAt: null }]),
    ...over,
  });

  beforeEach(() => {
    db.creatorRevenueEvent.findMany
      .mockResolvedValueOnce(payments)
      .mockResolvedValueOnce([{ relatesToId: "p4" }]);
    db.creatorRevenueEvent.findUnique.mockResolvedValue({ amountPaid: 999 });
    ledger.recordReversal.mockResolvedValue({ clawbackCents: -250, creatorIds: ["c1"] });
  });

  it("claws back earlier-period App Store refunds and voided Play renewals", async () => {
    const src = sources();
    const r = await reconcileStoreRefunds({ sources: src });
    expect(r.ok).toBe(true);
    expect(src.appleRefunds).toHaveBeenCalledTimes(1); // one lookup per customer
    const keys = ledger.recordReversal.mock.calls.map((c) => c[0].externalEventId).sort();
    expect(keys).toEqual(["rc:refund:txn:A1", "rc:refund:txn:GPA.1..1"]);
    expect(r.app_store).toMatchObject({ checked: 2, refunds: 1 });
    expect(r.play_store).toMatchObject({ checked: 1, refunds: 1 }); // p4 skipped: already refunded
    expect(r.clawedCreatorIds).toEqual(["c1"]);
    expect(r.uncheckedUserIds).toEqual([]);
  });

  it("a store that can't be checked leaves its customers unconfirmed", async () => {
    const r = await reconcileStoreRefunds({
      sources: sources({ googleVoided: vi.fn(async () => Promise.reject(new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set"))) }),
    });
    expect(r.ok).toBe(false);
    expect(r.uncheckedUserIds).toEqual(["ub"]);
    expect(r.play_store.errors[0]).toMatch(/not set/);
  });

  it("gates payouts: unconfirmed customers or a fresh clawback", () => {
    const res = {
      uncheckedUserIds: ["ub"],
      clawedCreatorIds: ["c9"],
      app_store: { ok: true, checked: 0, refunds: 0, errors: [] },
      play_store: { ok: false, checked: 1, refunds: 0, errors: ["boom"] },
    };
    expect(refundGateReason("c1", ["ua"], res)).toBeNull();
    expect(refundGateReason("c1", ["ua", "ub"], res)).toMatch(/couldn't confirm .* 1 customer \(boom\)/);
    expect(refundGateReason("c9", [], res)).toMatch(/re-preview/);
    expect(refundGateReason("c1", ["ua"], { ...res, allUnchecked: true })).toMatch(/failed/);
    expect(refundGateReason("c1", [], { ...res, allUnchecked: true })).toBeNull(); // bonuses only
  });
});
