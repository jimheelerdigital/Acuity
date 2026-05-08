/**
 * Mobile-side StoreKit 2 wrapper around `react-native-iap` v15.x.
 *
 * Phase 3a of the dual-source subscription pivot. UI surfaces (the
 * Subscribe sheet, Profile menu, Paywall, Restore button) call into
 * this module; the module talks to react-native-iap; pure decision
 * logic lives in @acuity/shared/iap-flow.
 *
 * v13 → v15 migration notes (2026-05-08):
 *   - v15 was rewritten on the Nitro framework. Different podspec
 *     (NitroIap), different exports, no more RCT-Folly dependency
 *     in the podspec — instead the plugin's `with-folly-no-coroutines`
 *     option (under `ios:` in app.json) patches the Podfile's
 *     post_install to disable Folly coroutines via preprocessor
 *     defines, sidestepping Expo SDK 54's prebuilt-RN Folly issue.
 *   - API renames: `getSubscriptions` → `fetchProducts({type:'subs'})`,
 *     `requestSubscription({sku})` → `requestPurchase({request:{apple:
 *     {sku}}, type:'subs'})`.
 *   - Product field renames: `productId` → `id`, `localizedPrice` →
 *     `displayPrice`. Our `IapProduct` wrapper shape is preserved at
 *     the public boundary so call sites (subscribe.tsx,
 *     restore-purchases-button.tsx) don't change.
 *   - Purchase field renames: `transactionReceipt` → `purchaseToken`
 *     (unified — iOS JWS / Android purchase token). Our `PurchaseResult`
 *     surface still uses `receipt`; we map purchaseToken → receipt at
 *     the boundary.
 *   - `finishTransaction` now requires the full Purchase object
 *     (v13 accepted `{ transactionId } as never`). To preserve
 *     `verifyAndFinish({ transactionId, receipt })`'s signature we
 *     keep an in-memory cache of Purchases keyed by transactionId,
 *     populated by `purchaseMonthly`, `restorePurchases`, and the
 *     purchase-updated listener.
 *   - iOS deployment target ≥ 15 required by Nitro's openiap dep.
 *     Current Podfile target is 15.1 — fine.
 *
 * Lifecycle (unchanged at public surface):
 *   initIap()              — connect to StoreKit (call lazily on
 *                             Subscribe-sheet mount).
 *   getMonthlyProduct()    — fetch the v1.1 product info from Apple.
 *   purchaseMonthly()      — present Apple's purchase sheet.
 *   verifyAndFinish(...)   — POST receipt to backend, finalize tx.
 *   restorePurchases()     — re-fetch user's existing subs (Apple
 *                             requires this affordance for App Review).
 *   subscribeToPurchaseUpdates(cb) — listen for renewal/refund
 *                             events surfaced by StoreKit (separate
 *                             from Apple's webhook to the backend).
 *   disconnectIap()        — clean shutdown when the app goes idle.
 *
 * Feature flag: every entry point short-circuits via `isIapEnabled()`.
 * When the flag is off, callers see a noop-with-error response and
 * the UI falls back to the existing "Continue on web" path.
 *
 * Error normalization: react-native-iap's error shapes vary across
 * versions. We pass them through `classifyPurchaseError` (shared lib)
 * so call sites get a small enum, not raw vendor strings.
 */

import { Platform } from "react-native";
import {
  classifyPurchaseError,
  classifyRestoreOutcome,
  classifyVerifyResponse,
  purchaseErrorMessage,
  type PurchaseErrorKind,
  type RestoreOutcome,
  type VerifyReceiptOutcome,
} from "@acuity/shared";

import { api } from "@/lib/api";
import { IAP_MONTHLY_PRODUCT_ID, isIapEnabled } from "@/lib/iap-config";

/**
 * react-native-iap dynamic import. Imported lazily so a build that
 * happens to omit the native module (e.g., a future Android-only
 * release) doesn't crash on app start. Every entry point that needs
 * it goes through `loadIapModule()` so the failure mode is one
 * place.
 *
 * v15 exposes named exports (no default RNIap). We define a minimal
 * typed surface for ONLY the functions we use, then cast the dynamic
 * import to it. Reason: v15's full export types use deeply-generic
 * `QueryField<K>`/`MutationField<K>` mapped types over a Nitro-spec
 * argument map that TypeScript's bundler resolution doesn't fully
 * infer through the package's `react-native` export condition (the
 * raw `src/index.ts` has dependency-typing chains that hit
 * react-native-nitro-modules side-effect imports). Using the full
 * `typeof import("react-native-iap")` type produces TS2339 errors at
 * call sites even though the symbols are exported at runtime —
 * confirmed empirically. A hand-rolled interface for the call
 * surface we actually use sidesteps this and stays robust to v15.x
 * patch additions/removals we don't care about.
 */
type IapPurchaseLike = Record<string, unknown>;
type IapEventSubscription = { remove: () => void };

type RNIAP = {
  initConnection(): Promise<boolean>;
  endConnection(): Promise<void>;
  fetchProducts(args: {
    skus: string[];
    type?: "subs" | "in-app" | "all";
  }): Promise<unknown[] | null>;
  requestPurchase(args: {
    request: {
      apple?: { sku: string };
      google?: { skus: string[] };
    };
    type: "subs" | "in-app";
  }): Promise<unknown | unknown[] | null>;
  finishTransaction(args: {
    purchase: IapPurchaseLike;
    isConsumable?: boolean;
  }): Promise<unknown>;
  getAvailablePurchases(): Promise<unknown[] | null>;
  purchaseUpdatedListener(
    listener: (purchase: IapPurchaseLike) => void
  ): IapEventSubscription;
};

let modulePromise: Promise<RNIAP | null> | null = null;
async function loadIapModule(): Promise<RNIAP | null> {
  if (Platform.OS !== "ios") return null;
  if (!isIapEnabled()) return null;
  if (!modulePromise) {
    modulePromise = import("react-native-iap")
      .then((m) => m as unknown as RNIAP)
      .catch((err) => {
        console.warn("[iap] react-native-iap load failed:", err);
        return null;
      });
  }
  return modulePromise;
}

// ─── Connection lifecycle ─────────────────────────────────────

let connected = false;

/**
 * Connect to StoreKit. Idempotent — repeated calls are no-ops.
 * Returns true on success, false on every flag-off / non-iOS path.
 *
 * Call this on Subscribe-sheet mount (lazy) rather than at app
 * start so flag-off builds never spin up StoreKit.
 */
export async function initIap(): Promise<boolean> {
  if (connected) return true;
  const RNIap = await loadIapModule();
  if (!RNIap) return false;
  try {
    await RNIap.initConnection();
    connected = true;
    return true;
  } catch (err) {
    console.warn("[iap] initConnection failed:", err);
    return false;
  }
}

export async function disconnectIap(): Promise<void> {
  if (!connected) return;
  const RNIap = await loadIapModule();
  if (!RNIap) return;
  try {
    await RNIap.endConnection();
  } catch {
    // Best-effort. If endConnection throws StoreKit will GC anyway
    // when the app goes idle.
  }
  connected = false;
  // Clear the cache too — any cached purchases belong to the prior
  // connection's lifetime.
  purchaseCache.clear();
}

// ─── Purchase cache ───────────────────────────────────────────

/**
 * v15's `finishTransaction` requires the full Purchase object, not
 * just a transactionId. To preserve `verifyAndFinish({ transactionId,
 * receipt })`'s public signature, we cache every Purchase we observe
 * (from purchaseMonthly's return value, getAvailablePurchases during
 * restore, and the purchase-updated listener) keyed by transactionId.
 * `finishCachedTransaction` looks up the Purchase and calls
 * RNIap.finishTransaction with it.
 *
 * Cache lifetime: cleared on disconnectIap. Bounded by the number of
 * StoreKit transactions for this user/session, so memory is fine.
 */
type Purchase = IapPurchaseLike;

const purchaseCache = new Map<string, Purchase>();

function cachePurchase(p: unknown): void {
  if (!p || typeof p !== "object") return;
  const rec = p as Record<string, unknown>;
  const id = stringField(rec.transactionId);
  if (id) purchaseCache.set(id, rec);
}

async function finishCachedTransaction(
  transactionId: string
): Promise<void> {
  const RNIap = await loadIapModule();
  if (!RNIap) return;
  let purchase = purchaseCache.get(transactionId);
  if (!purchase) {
    // Fall back to a fresh fetch — happens when the app was killed
    // between purchase and verify, or the cache was cleared. This
    // costs one StoreKit roundtrip but only on the unhappy path.
    try {
      const available = (await RNIap.getAvailablePurchases()) ?? [];
      const found = available.find(
        (p) =>
          stringField((p as Record<string, unknown>).transactionId) ===
          transactionId
      ) as Record<string, unknown> | undefined;
      if (found) {
        purchase = found;
        cachePurchase(found);
      }
    } catch (err) {
      console.warn("[iap] getAvailablePurchases for finish-fallback failed:", err);
    }
  }
  if (!purchase) {
    // No Purchase object available — server has already recorded the
    // entitlement, but StoreKit may resurface the transaction. The
    // next purchaseUpdatedListener tick will re-trigger verify; the
    // server's idempotent path will return idempotent-success and we
    // try this again with a populated cache.
    console.warn(
      "[iap] finishCachedTransaction: no Purchase for tx",
      transactionId
    );
    return;
  }
  try {
    await RNIap.finishTransaction({ purchase, isConsumable: false });
  } catch (err) {
    // Logged but not surfaced — server-side state is already PRO.
    console.warn("[iap] finishTransaction failed:", err);
  }
}

// ─── Product fetch ────────────────────────────────────────────

export interface IapProduct {
  productId: string;
  /** Localized title from Apple (e.g. "Acuity Pro"). */
  title: string;
  /** Localized description from Apple. */
  description: string;
  /** Localized price string (e.g. "$12.99"). */
  localizedPrice: string;
  /** Currency code from the user's App Store account. */
  currency: string;
}

/**
 * Fetch the v1.1 monthly product from Apple. Returns null if the
 * flag is off, the user is non-iOS, or Apple returned no product
 * (unconfigured product ID = empty array).
 */
export async function getMonthlyProduct(): Promise<IapProduct | null> {
  if (!(await initIap())) return null;
  const RNIap = await loadIapModule();
  if (!RNIap) return null;
  try {
    const result = await RNIap.fetchProducts({
      skus: [IAP_MONTHLY_PRODUCT_ID],
      type: "subs",
    });
    if (!result || !Array.isArray(result) || result.length === 0) return null;
    const p = result[0] as Record<string, unknown>;
    return {
      // v15 uses `id` instead of `productId` at the field level.
      productId: stringField(p.id) ?? IAP_MONTHLY_PRODUCT_ID,
      title: stringField(p.title) ?? "Acuity Pro",
      description: stringField(p.description) ?? "",
      // v15 uses `displayPrice` instead of `localizedPrice`.
      localizedPrice: stringField(p.displayPrice) ?? "",
      currency: stringField(p.currency) ?? "USD",
    };
  } catch (err) {
    console.warn("[iap] fetchProducts failed:", err);
    return null;
  }
}

// ─── Purchase ─────────────────────────────────────────────────

export type PurchaseResult =
  | { kind: "success"; transactionId: string; receipt: string }
  | { kind: "error"; errorKind: PurchaseErrorKind; message: string | null };

/**
 * Present Apple's purchase sheet for the monthly subscription.
 * Returns either a success with the transaction handles needed
 * for backend verification, or a normalized error.
 *
 * IMPORTANT: do NOT call `finishTransaction` here. Apple's StoreKit
 * 2 model is "verify-then-finish" — finishing before backend
 * verification means the receipt is gone if the network call fails.
 * The Subscribe sheet calls `verifyAndFinish` AFTER this returns
 * success.
 *
 * v15 detail: requestPurchase returns Purchase | Purchase[] | null.
 * For subs on iOS we expect a single Purchase, but we handle the
 * array case defensively (in case Apple returns batched
 * transactions, e.g., a deferred Ask-to-Buy that resolves alongside
 * the immediate purchase).
 */
export async function purchaseMonthly(): Promise<PurchaseResult> {
  if (!(await initIap())) {
    return {
      kind: "error",
      errorKind: "store-unknown",
      message: "In-app purchases unavailable",
    };
  }
  const RNIap = await loadIapModule();
  if (!RNIap) {
    return {
      kind: "error",
      errorKind: "store-unknown",
      message: "In-app purchases unavailable",
    };
  }
  try {
    const result = await RNIap.requestPurchase({
      request: { apple: { sku: IAP_MONTHLY_PRODUCT_ID } },
      type: "subs",
    });
    // Normalize array-or-single into the first non-null Purchase.
    const purchase = (
      Array.isArray(result) ? result[0] : result
    ) as Record<string, unknown> | null | undefined;
    if (!purchase) {
      return {
        kind: "error",
        errorKind: "store-unknown",
        message: "No purchase returned from StoreKit",
      };
    }
    cachePurchase(purchase);
    const purchaseRec = purchase;
    const transactionId = stringField(purchaseRec.transactionId) ?? "";
    // v15 unified token: iOS purchaseToken is the JWS we POST to the
    // backend (equivalent of v13's transactionReceipt for our verify
    // endpoint).
    const receipt = stringField(purchaseRec.purchaseToken) ?? "";
    if (!transactionId) {
      return {
        kind: "error",
        errorKind: "store-unknown",
        message: "StoreKit returned a purchase without transactionId",
      };
    }
    return { kind: "success", transactionId, receipt };
  } catch (err) {
    const c = classifyPurchaseError(err as never);
    return {
      kind: "error",
      errorKind: c.kind,
      message: c.silent ? null : purchaseErrorMessage(c.kind),
    };
  }
}

// ─── Verify + finish ──────────────────────────────────────────

/**
 * POST the receipt to /api/iap/verify-receipt and, on success,
 * call StoreKit's `finishTransaction` to acknowledge the purchase.
 *
 * Returns the classified outcome from @acuity/shared so the UI can
 * branch (success / idempotent / manage-on-web / contact-support /
 * retryable-error). On retryable errors we deliberately do NOT call
 * `finishTransaction` — StoreKit will resurface the unfinished
 * transaction on next listener tick, and the user can retry.
 */
export async function verifyAndFinish(input: {
  transactionId: string;
  receipt: string;
}): Promise<VerifyReceiptOutcome> {
  let body:
    | {
        ok?: unknown;
        code?: unknown;
        error?: unknown;
        idempotent?: unknown;
      }
    | null = null;
  let status = 0;
  try {
    const res = await fetch(`${api.baseUrl()}/api/iap/verify-receipt`, {
      method: "POST",
      headers: await iapPostHeaders(),
      body: JSON.stringify({
        receipt: input.receipt,
        productId: IAP_MONTHLY_PRODUCT_ID,
        transactionId: input.transactionId,
      }),
    });
    status = res.status;
    body = (await res.json().catch(() => null)) as typeof body;
  } catch (err) {
    return {
      kind: "transient-error",
      message: err instanceof Error ? err.message : "Network error",
      retryable: true,
    };
  }

  const outcome = classifyVerifyResponse({ status, body });

  // Only finish on server-confirmed success. Idempotent-success ALSO
  // finishes (the server already wrote PRO; StoreKit needs the
  // ack to stop resurfacing the transaction).
  if (outcome.kind === "success" || outcome.kind === "idempotent-success") {
    await finishCachedTransaction(input.transactionId);
  }

  return outcome;
}

async function iapPostHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // The api lib handles the Bearer header via getToken; we want the
  // same header here. Inline the call to avoid pulling the whole
  // module's request wrapper.
  const { getToken } = await import("@/lib/auth");
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ─── Restore ──────────────────────────────────────────────────

/**
 * Re-fetch the user's StoreKit purchases and re-verify each with
 * the backend. Required by Apple App Review for any app that
 * presents a paid subscription. Surfaced as a "Restore Purchases"
 * link on the Subscribe sheet, the Profile screen, and the Paywall.
 */
export async function restorePurchases(): Promise<RestoreOutcome> {
  if (!(await initIap())) {
    return { kind: "error", message: "In-app purchases unavailable" };
  }
  const RNIap = await loadIapModule();
  if (!RNIap) {
    return { kind: "error", message: "In-app purchases unavailable" };
  }

  let availableList: unknown[] = [];
  try {
    availableList = (await RNIap.getAvailablePurchases()) ?? [];
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Restore failed",
    };
  }

  // Cache every available purchase so the subsequent verifyAndFinish
  // calls can finish them via the cache lookup.
  for (const p of availableList) cachePurchase(p);

  // Filter to subscription products we care about. v15 uses `productId`
  // on Purchase (PurchaseCommon line 1109), not `id`.
  const ours = availableList.filter(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      stringField((p as Record<string, unknown>).productId) ===
        IAP_MONTHLY_PRODUCT_ID
  );

  let successfulVerifies = 0;
  const errors: string[] = [];
  const verifiedTransactionIds: string[] = [];

  for (const p of ours) {
    const pRec = p as unknown as Record<string, unknown>;
    const transactionId = stringField(pRec.transactionId);
    const receipt = stringField(pRec.purchaseToken);
    if (!transactionId) continue;
    const outcome = await verifyAndFinish({
      transactionId,
      receipt: receipt ?? "",
    });
    if (
      outcome.kind === "success" ||
      outcome.kind === "idempotent-success"
    ) {
      successfulVerifies += 1;
      verifiedTransactionIds.push(transactionId);
    } else if (outcome.kind === "transient-error") {
      errors.push(outcome.message);
    } else if (outcome.kind === "ux-conflict") {
      errors.push(outcome.message);
    }
  }

  return classifyRestoreOutcome({
    totalAvailable: ours.length,
    successfulVerifies,
    errors,
    verifiedTransactionIds,
  });
}

// ─── Listener for background StoreKit events ──────────────────

export type PurchaseUpdateListener = (purchase: {
  transactionId: string;
  receipt: string;
}) => void;

/**
 * Subscribe to StoreKit purchase-updated events. These fire when:
 *   - A renewal succeeds in the background.
 *   - A previously-deferred purchase (Ask to Buy) is approved.
 *   - StoreKit re-surfaces an unfinished transaction (e.g., we
 *     crashed mid-purchase).
 *
 * Caller is responsible for calling the returned `unsubscribe`
 * function on unmount. App-level listener typically lives in the
 * AuthProvider so it covers the full app lifetime.
 *
 * NOT the same as Apple's notification webhook to our backend —
 * that's the canonical state. This is a UI-side hook for "the user
 * just resolved a deferred Ask-to-Buy" so we can surface "Welcome
 * to Pro" without waiting for the next /api/user/me poll.
 *
 * v15 detail: purchaseUpdatedListener returns an EventSubscription
 * with a `.remove()` method (same shape as v13's old subscription).
 * We also seed the purchase cache from these events so a deferred
 * purchase that resolves in the background can be finished without
 * a separate getAvailablePurchases roundtrip.
 */
export async function subscribeToPurchaseUpdates(
  listener: PurchaseUpdateListener
): Promise<() => void> {
  const RNIap = await loadIapModule();
  if (!RNIap) return () => {};
  let sub: { remove?: () => void } | undefined;
  try {
    sub = RNIap.purchaseUpdatedListener((purchase) => {
      cachePurchase(purchase);
      const pRec = purchase as unknown as Record<string, unknown>;
      const transactionId = stringField(pRec.transactionId);
      const receipt = stringField(pRec.purchaseToken);
      if (transactionId) {
        listener({ transactionId, receipt: receipt ?? "" });
      }
    }) as { remove?: () => void };
  } catch (err) {
    console.warn("[iap] purchaseUpdatedListener attach failed:", err);
  }
  return () => {
    try {
      sub?.remove?.();
    } catch {
      /* ignore */
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function stringField(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
