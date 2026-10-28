import "server-only";

/**
 * Store refund check — 2026-10-28 review, finding 7.
 *
 * RevenueCat only sends a refund signal (CANCELLATION, CUSTOMER_SUPPORT /
 * negative price) when the LATEST subscription period is refunded: "refunds
 * for earlier periods do not trigger it" (RC webhook docs). RC has no REFUND
 * event, and its REST API v2 exposes no per-transaction refund status
 * (subscription transactions carry only purchased_at + revenue), so RC
 * can't be reconciled against for this. The stores can:
 *
 *   App Store   Get Refund History (App Store Server API) — every refunded
 *               transaction of a customer, any period. Live path too: Apple's
 *               REFUND notification is forwarded to /api/iap/notifications.
 *   Play Store  voidedpurchases.list (Play Developer API, type=1) — every
 *               refunded / charged-back order incl. subscription renewals,
 *               by orderId (= RC's transaction_id for Play). 30-day lookback,
 *               so this runs daily (Inngest) as well as before payouts.
 *
 * Checked: RC-sourced App Store / Play payments from the last 13 months
 * (12-month commission window + slack) with no refund recorded yet. Matches
 * become clawbacks via recordStoreRefund (one key per transaction, shared
 * with the webhook paths, so nothing is clawed twice).
 *
 * The payout run calls this before approving and executing
 * (lib/creators/payouts): a creator whose customers couldn't be checked, or
 * who just got a clawback, isn't paid until it's sorted.
 *
 * Not covered: RC Web Billing (RC_BILLING) refunds of earlier periods — no
 * documented per-transaction source. Its latest-period refunds arrive via
 * RC CANCELLATION like the stores'.
 *
 * Env (existing): APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY,
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_PACKAGE_NAME.
 */

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { storePaymentKey } from "./ledger";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 400;
const TXN_PREFIX = storePaymentKey("");

export interface RefundSignal {
  transactionId: string;
  refundedAt: number | null;
}

/** Injected for tests; defaults call Apple / Google. */
export interface RefundSources {
  /** All refunded transactions of the customer owning `anyTransactionId`. */
  appleRefunds(anyTransactionId: string): Promise<RefundSignal[]>;
  /** Voided Play orders seen since `sinceMs` (max 30 days back). */
  googleVoided(sinceMs: number): Promise<RefundSignal[]>;
}

export interface StoreCheck {
  ok: boolean;
  /** Payments looked at. */
  checked: number;
  /** Clawbacks recorded by this run. */
  refunds: number;
  errors: string[];
}

export interface RefundReconcileResult {
  ok: boolean;
  app_store: StoreCheck;
  play_store: StoreCheck;
  /** Referred customers whose refunds could NOT be confirmed this run. */
  uncheckedUserIds: string[];
  /** Creators who got a new clawback in this run. */
  clawedCreatorIds: string[];
  /** The check itself crashed (e.g. DB): nobody's refunds are confirmed. */
  allUnchecked?: boolean;
}

export const defaultRefundSources: RefundSources = {
  async appleRefunds(anyTransactionId) {
    const { fetchAppleRefundHistory, readAppleApiConfig } = await import("@/lib/apple-iap");
    const res = await fetchAppleRefundHistory(anyTransactionId, readAppleApiConfig());
    if (!res.ok) throw new Error(`${res.code}: ${res.diagnostic}`);
    return res.refunded.map((r) => ({ transactionId: r.transactionId, refundedAt: r.revocationDate }));
  },
  async googleVoided(sinceMs) {
    const { listGoogleVoidedPurchases, readGooglePlayApiConfig } = await import("@/lib/google-iap");
    const rows = await listGoogleVoidedPurchases(readGooglePlayApiConfig(), sinceMs);
    return rows.map((r) => ({ transactionId: r.orderId, refundedAt: r.voidedTimeMillis }));
  },
};

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

export async function reconcileStoreRefunds(
  opts: { now?: Date; sources?: RefundSources } = {}
): Promise<RefundReconcileResult> {
  const now = opts.now ?? new Date();
  const sources = opts.sources ?? defaultRefundSources;
  const empty = (): StoreCheck => ({ ok: true, checked: 0, refunds: 0, errors: [] });
  const out: RefundReconcileResult = {
    ok: true,
    app_store: empty(),
    play_store: empty(),
    uncheckedUserIds: [],
    clawedCreatorIds: [],
  };
  const unchecked = new Set<string>();
  const clawed = new Set<string>();

  const payments = await prisma.creatorRevenueEvent.findMany({
    where: {
      type: "payment",
      source: "revenuecat",
      store: { in: ["app_store", "play_store"] },
      externalEventId: { startsWith: TXN_PREFIX },
      occurredAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS) },
    },
    select: { id: true, userId: true, store: true, externalEventId: true },
  });
  const refunded = new Set(
    (
      await prisma.creatorRevenueEvent.findMany({
        where: { relatesToId: { in: payments.map((p) => p.id) }, type: "refund" },
        select: { relatesToId: true },
      })
    ).map((r) => r.relatesToId)
  );
  const open = payments
    .filter((p) => !refunded.has(p.id))
    .map((p) => ({ ...p, txn: p.externalEventId.slice(TXN_PREFIX.length) }));

  const { recordStoreRefund } = await import("./providers");
  const apply = async (check: StoreCheck, txn: string, refundedAt: number | null) => {
    const res = await recordStoreRefund({
      transactionId: txn,
      amountCents: null,
      providerEventId: null,
      occurredAt: new Date(refundedAt ?? now.getTime()),
    });
    if (res) {
      check.refunds++;
      res.creatorIds.forEach((c) => clawed.add(c));
    }
  };

  // ── App Store: one Refund History lookup per customer ──
  const apple = open.filter((p) => p.store === "app_store");
  out.app_store.checked = apple.length;
  const appleByUser = new Map<string, typeof apple>();
  for (const p of apple) appleByUser.set(p.userId, [...(appleByUser.get(p.userId) ?? []), p]);
  for (const [userId, rows] of Array.from(appleByUser.entries())) {
    try {
      const signals = await sources.appleRefunds(rows[0].txn);
      const byTxn = new Map(signals.map((s) => [s.transactionId, s]));
      for (const r of rows) {
        const hit = byTxn.get(r.txn);
        if (hit) await apply(out.app_store, r.txn, hit.refundedAt);
      }
    } catch (err) {
      out.app_store.ok = false;
      out.app_store.errors.push(msg(err));
      unchecked.add(userId);
    }
  }

  // ── Play Store: one voided-orders listing for everyone ──
  const play = open.filter((p) => p.store === "play_store");
  out.play_store.checked = play.length;
  if (play.length > 0) {
    try {
      const signals = await sources.googleVoided(now.getTime() - 30 * DAY_MS);
      const byTxn = new Map(signals.map((s) => [s.transactionId, s]));
      for (const r of play) {
        const hit = byTxn.get(r.txn);
        if (hit) await apply(out.play_store, r.txn, hit.refundedAt);
      }
    } catch (err) {
      out.play_store.ok = false;
      out.play_store.errors.push(msg(err));
      play.forEach((p) => unchecked.add(p.userId));
    }
  }

  out.app_store.errors = Array.from(new Set(out.app_store.errors));
  out.ok = out.app_store.ok && out.play_store.ok;
  out.uncheckedUserIds = Array.from(unchecked);
  out.clawedCreatorIds = Array.from(clawed);
  const summary = {
    ok: out.ok,
    apple: { checked: out.app_store.checked, refunds: out.app_store.refunds, errors: out.app_store.errors.length },
    play: { checked: out.play_store.checked, refunds: out.play_store.refunds, errors: out.play_store.errors.length },
  };
  if (out.ok) safeLog.info("creators.refund-reconcile", summary);
  else safeLog.warn("creators.refund-reconcile", summary);
  return out;
}

/**
 * Why a payout must wait, given a reconcile result, or null. PURE.
 * `userIds` = the referred customers behind the payout's ledger rows.
 */
export function refundGateReason(
  creatorId: string,
  userIds: string[],
  r: Pick<RefundReconcileResult, "uncheckedUserIds" | "clawedCreatorIds" | "app_store" | "play_store" | "allUnchecked">
): string | null {
  if (r.allUnchecked && userIds.length > 0) {
    return `the store refund check failed (${[...r.app_store.errors, ...r.play_store.errors].join("; ") || "error"}); retry`;
  }
  if (r.clawedCreatorIds.includes(creatorId)) {
    return "a store refund was just clawed back for this creator; re-preview the run";
  }
  const unchecked = new Set(r.uncheckedUserIds);
  const n = userIds.filter((u) => unchecked.has(u)).length;
  if (n > 0) {
    const errs = [...r.app_store.errors, ...r.play_store.errors].join("; ");
    return `couldn't confirm App Store / Google Play refunds for ${n} customer${n === 1 ? "" : "s"} (${errs || "store check failed"}); fix and retry`;
  }
  return null;
}

/** reconcileStoreRefunds that never throws (a crash gates every payout with customers). */
export async function reconcileStoreRefundsSafe(
  opts: { now?: Date; sources?: RefundSources } = {}
): Promise<RefundReconcileResult> {
  try {
    return await reconcileStoreRefunds(opts);
  } catch (err) {
    safeLog.error("creators.refund-reconcile-crashed", err);
    const failed: StoreCheck = { ok: false, checked: 0, refunds: 0, errors: [msg(err)] };
    return {
      ok: false,
      app_store: failed,
      play_store: { ...failed, errors: [] },
      uncheckedUserIds: [],
      clawedCreatorIds: [],
      allUnchecked: true,
    };
  }
}
