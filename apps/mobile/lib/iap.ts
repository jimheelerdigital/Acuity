/**
 * Mobile-side StoreKit 2 wrapper around `react-native-iap`.
 *
 * Phase 3a of the dual-source subscription pivot. UI surfaces (the
 * Subscribe sheet, Profile menu, Paywall, Restore button) call into
 * this module; the module talks to react-native-iap; pure decision
 * logic lives in @acuity/shared/iap-flow.
 *
 * Lifecycle:
 *   initIap()              — connect to StoreKit (call on app start
 *                             OR lazily on first Subscribe sheet open).
 *   getProducts()          — fetch the v1.1 product info from Apple.
 *   purchaseProduct(id)    — present Apple's purchase sheet.
 *   verifyAndFinish(...)   — POST receipt to backend, finalize tx.
 *   restorePurchases()     — re-fetch user's existing subs (Apple
 *                             requires this affordance for App Review).
 *   subscribeToPurchaseUpdates(cb) — listen for renewal/refund
 *                             events surfaced by StoreKit (separate
 *                             from Apple's webhook to the backend).
 *   disconnect()           — clean shutdown when the app goes idle.
 *
 * Feature flag: every entry point short-circuits via `isIapEnabled()`.
 * When the flag is off, callers see a noop-with-error response and
 * the UI falls back to the existing "Continue on web" path.
 *
 * Error normalization: react-native-iap's error shapes vary across
 * versions. We pass them through `classifyPurchaseError` (shared lib)
 * so call sites get a small enum, not raw vendor strings.
 */

import { Alert, Platform } from "react-native";
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
 */
type RNIAP = typeof import("react-native-iap");

let modulePromise: Promise<RNIAP | null> | null = null;
async function loadIapModule(): Promise<RNIAP | null> {
  if (Platform.OS !== "ios") return null;
  if (!isIapEnabled()) return null;
  if (!modulePromise) {
    modulePromise = import("react-native-iap").catch((err) => {
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
    // Best-effort. If end-connection throws StoreKit will GC anyway
    // when the app goes idle.
  }
  connected = false;
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
    const products = await RNIap.getSubscriptions({
      skus: [IAP_MONTHLY_PRODUCT_ID],
    });
    if (!products || products.length === 0) return null;
    const p = products[0] as Record<string, unknown>;
    return {
      productId: stringField(p.productId) ?? IAP_MONTHLY_PRODUCT_ID,
      title: stringField(p.title) ?? "Acuity Pro",
      description: stringField(p.description) ?? "",
      localizedPrice: stringField(p.localizedPrice) ?? "",
      currency: stringField(p.currency) ?? "USD",
    };
  } catch (err) {
    console.warn("[iap] getSubscriptions failed:", err);
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
    const purchase = (await RNIap.requestSubscription({
      sku: IAP_MONTHLY_PRODUCT_ID,
    })) as Record<string, unknown> | undefined;
    if (!purchase) {
      return {
        kind: "error",
        errorKind: "store-unknown",
        message: "No purchase returned from StoreKit",
      };
    }
    const transactionId =
      stringField(purchase.transactionId) ??
      stringField(purchase.originalTransactionIdentifierIOS) ??
      "";
    const receipt =
      stringField(purchase.transactionReceipt) ??
      stringField(purchase.purchaseToken) ??
      "";
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
    const RNIap = await loadIapModule();
    if (RNIap) {
      try {
        await RNIap.finishTransaction({
          purchase: { transactionId: input.transactionId } as never,
          isConsumable: false,
        });
      } catch (err) {
        // Logged but not surfaced — finishing is best-effort, the
        // server-side state is already PRO.
        console.warn("[iap] finishTransaction failed:", err);
      }
    }
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

  let availableList: Record<string, unknown>[] = [];
  try {
    availableList = ((await RNIap.getAvailablePurchases()) ??
      []) as Record<string, unknown>[];
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Restore failed",
    };
  }

  // Filter to subscription products we care about.
  const ours = availableList.filter(
    (p) => stringField(p.productId) === IAP_MONTHLY_PRODUCT_ID
  );

  let successfulVerifies = 0;
  const errors: string[] = [];
  const verifiedTransactionIds: string[] = [];

  for (const p of ours) {
    const transactionId = stringField(p.transactionId);
    const receipt = stringField(p.transactionReceipt);
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
 */
export async function subscribeToPurchaseUpdates(
  listener: PurchaseUpdateListener
): Promise<() => void> {
  const RNIap = await loadIapModule();
  if (!RNIap) return () => {};
  let sub: { remove?: () => void } | undefined;
  try {
    sub = RNIap.purchaseUpdatedListener(
      (purchase: Record<string, unknown>) => {
        const transactionId = stringField(purchase.transactionId);
        const receipt = stringField(purchase.transactionReceipt);
        if (transactionId) {
          listener({ transactionId, receipt: receipt ?? "" });
        }
      }
    ) as { remove?: () => void };
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
