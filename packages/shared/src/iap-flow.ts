/**
 * Pure decision functions for the iOS IAP purchase flow.
 *
 * Lives in @acuity/shared so the apps/web vitest harness can run
 * tests against it (apps/mobile has no test runner today). Mobile
 * imports these from the wrapper at apps/mobile/lib/iap.ts.
 *
 * Three classes of decisions encoded here:
 *   1. Verify-receipt response classification — given the HTTP
 *      status + body code from POST /api/iap/verify-receipt, decide
 *      what UX state to render (success, retry, contact-support,
 *      manage-on-web).
 *   2. Purchase-error classification — react-native-iap throws
 *      shapes vary across versions; normalize to our 5-state enum.
 *   3. Restore-result classification — single transaction restored,
 *      multiple, or none.
 *
 * Pure: no I/O, no react-native-iap import, no Prisma. Mock-free
 * vitest coverage in apps/web/src/lib/iap-flow.test.ts.
 */

// ─── Verify-receipt response classification ───────────────────

export type VerifyReceiptOutcome =
  | { kind: "success" }
  | { kind: "idempotent-success" }
  | {
      kind: "ux-conflict";
      /** Whether the conflict is fixable in-app or requires routing the user elsewhere. */
      route: "manage-on-web" | "contact-support" | "show-error";
      message: string;
    }
  | {
      kind: "transient-error";
      message: string;
      /** True when the caller should retry without fail surface (rare). */
      retryable: boolean;
    };

interface VerifyResponseShape {
  /** HTTP status from /api/iap/verify-receipt. */
  status: number;
  /** Response body — opaque shape; we read `code`, `error`, `idempotent`. */
  body: {
    ok?: unknown;
    code?: unknown;
    error?: unknown;
    idempotent?: unknown;
  } | null;
}

export function classifyVerifyResponse(
  res: VerifyResponseShape
): VerifyReceiptOutcome {
  const { status, body } = res;
  const code = typeof body?.code === "string" ? body.code : null;
  const error = typeof body?.error === "string" ? body.error : null;

  if (status === 200) {
    if (body?.idempotent === true) {
      return { kind: "idempotent-success" };
    }
    return { kind: "success" };
  }

  // 409 — cross-source / cross-user conflicts. Route to a UX state
  // rather than a generic error.
  if (status === 409) {
    if (code === "ACTIVE_STRIPE_SUB") {
      return {
        kind: "ux-conflict",
        route: "manage-on-web",
        message:
          error ??
          "You already have an active subscription via web. Manage it on the web.",
      };
    }
    if (code === "ANOTHER_USER_OWNS_TRANSACTION") {
      return {
        kind: "ux-conflict",
        route: "contact-support",
        message:
          error ??
          "This Apple subscription is already attached to another Acuity account. Contact support to resolve.",
      };
    }
    return {
      kind: "ux-conflict",
      route: "show-error",
      message: error ?? "Subscription conflict",
    };
  }

  // 400 — bad input from the client. Should not happen if mobile is
  // sending the right body shape; if it does, surface an error so
  // the user can retry / contact support.
  if (status === 400) {
    if (code === "BAD_PRODUCT") {
      return {
        kind: "ux-conflict",
        route: "show-error",
        message:
          "This product is no longer available. Please update Acuity.",
      };
    }
    if (code === "EXPIRED_RECEIPT") {
      return {
        kind: "ux-conflict",
        route: "show-error",
        message:
          "This receipt has already expired. Tap Restore Purchases to refresh.",
      };
    }
    return {
      kind: "transient-error",
      message: error ?? `Bad request (${status})`,
      retryable: false,
    };
  }

  // 401 — auth missing. The mobile bearer was not attached or expired.
  // Caller should re-auth + retry. Not a user-facing error message —
  // tell the caller to re-fetch the token.
  if (status === 401) {
    return {
      kind: "transient-error",
      message: "Session expired. Please sign out and back in.",
      retryable: false,
    };
  }

  // 502 — Apple-side or env-config failure. Includes APPLE_AUTH_FAILED
  // (env vars not set) and APPLE_HTTP_ERROR (Apple's API was unreachable).
  // The user did nothing wrong; show a generic retry copy.
  if (status === 502) {
    return {
      kind: "transient-error",
      message:
        "Couldn't verify your purchase right now. Please try Restore Purchases or contact support.",
      retryable: true,
    };
  }

  // 5xx — server error. Retryable.
  if (status >= 500) {
    return {
      kind: "transient-error",
      message: "Server error verifying purchase. Please try again.",
      retryable: true,
    };
  }

  // Anything else — generic fail.
  return {
    kind: "transient-error",
    message: error ?? `Unexpected response (${status})`,
    retryable: false,
  };
}

// ─── Purchase error classification ────────────────────────────

export type PurchaseErrorKind =
  | "user-cancelled"
  | "already-owned"
  | "payment-not-allowed"
  | "deferred"
  | "network"
  | "store-unknown";

interface IapErrorShape {
  /** react-native-iap surfaces a `code` field; iOS native StoreKit error code in some versions. */
  code?: string | number | null;
  /** Human-readable message (varies by source). */
  message?: string | null;
  /** iOS-specific. */
  responseCode?: number | null;
}

/**
 * Normalize a purchase error from react-native-iap into a small
 * enum the UI can switch on. `user-cancelled` is silent (no error
 * shown); the others get a message.
 *
 * react-native-iap codes vary across versions (string code, numeric
 * responseCode, message-string fallback). Match defensively on each.
 */
export function classifyPurchaseError(err: IapErrorShape | null | undefined): {
  kind: PurchaseErrorKind;
  silent: boolean;
} {
  if (!err) return { kind: "store-unknown", silent: false };

  const codeStr = typeof err.code === "string" ? err.code : null;
  const codeNum = typeof err.code === "number" ? err.code : null;
  const responseCode =
    typeof err.responseCode === "number" ? err.responseCode : null;
  const msg = (err.message ?? "").toLowerCase();

  // iOS StoreKit: SKErrorPaymentCancelled = 2, deferred = 6.
  // react-native-iap on iOS surfaces these as code="E_USER_CANCELLED"
  // and code="E_DEFERRED_PAYMENT" respectively.
  if (
    codeStr === "E_USER_CANCELLED" ||
    codeStr === "E_USER_CANCELED" ||
    codeNum === 2 ||
    responseCode === 2 ||
    msg.includes("cancel")
  ) {
    return { kind: "user-cancelled", silent: true };
  }
  // Already-owned detection. Apple StoreKit doesn't have a single
  // canonical code for "user already subscribed to this product" —
  // empirically it surfaces as various codes depending on the build
  // surface (TestFlight vs sim, sandbox vs prod, freshly-purchased
  // vs cross-device-restored). Match defensively: standard codes from
  // Android Billing + iOS heuristics + message-substring fallback for
  // the "You're already subscribed" / "Already purchased" copy Apple
  // sometimes emits as a generic error.
  //
  // Order matters: cancel check above runs first because Apple's
  // "already subscribed" dialog can be dismissed (which fires
  // cancel) — that path should stay silent.
  //
  // Why this matters at v1.1 launch: users who installed build 34's
  // TestFlight (which had the missing-bid JWT bug + no recovery
  // flow), purchased a sandbox sub, and then upgraded to build 37
  // are left in a state where Apple knows they're subscribed but
  // our User row is still TRIAL. Re-attempting Subscribe in build
  // 37 returns this error class. The wrapper-side recovery flow
  // (recoverPurchasesIfNeeded in lib/iap.ts) handles the silent
  // case; this UI string is the fallback when recovery hasn't fired
  // yet, telling the user explicitly to tap Restore.
  if (
    codeStr === "E_ALREADY_OWNED" ||
    codeStr === "E_PRODUCT_ALREADY_OWNED" ||
    codeStr === "E_ITEM_ALREADY_OWNED" ||
    msg.includes("already own") ||
    msg.includes("already purchase") ||
    msg.includes("already subscribe") ||
    msg.includes("already a subscriber") ||
    msg.includes("currently subscribed")
  ) {
    return { kind: "already-owned", silent: false };
  }
  if (codeStr === "E_DEFERRED_PAYMENT" || codeNum === 6 || responseCode === 6) {
    return { kind: "deferred", silent: false };
  }
  if (codeStr === "E_NOT_ALLOWED" || msg.includes("not allowed")) {
    return { kind: "payment-not-allowed", silent: false };
  }
  if (
    codeStr === "E_NETWORK_ERROR" ||
    msg.includes("network") ||
    msg.includes("offline")
  ) {
    return { kind: "network", silent: false };
  }
  return { kind: "store-unknown", silent: false };
}

/**
 * User-facing copy for a purchase error. Returns null when
 * `silent: true` so the caller can no-op without an Alert.
 */
export function purchaseErrorMessage(kind: PurchaseErrorKind): string | null {
  switch (kind) {
    case "user-cancelled":
      return null;
    case "already-owned":
      return "You already have an active subscription. Tap Restore Purchases below.";
    case "payment-not-allowed":
      return "In-app purchases are restricted on this device. Check Screen Time → Content & Privacy Restrictions.";
    case "deferred":
      return "Purchase is awaiting approval (Ask to Buy or Family Sharing). You'll be notified when it's complete.";
    case "network":
      return "Network error. Check your connection and try again.";
    case "store-unknown":
      return "Couldn't complete the purchase. Please try again.";
  }
}

// ─── Restore classification ───────────────────────────────────

export type RestoreOutcome =
  | { kind: "none" }
  | {
      kind: "restored";
      count: number;
      /** Transaction IDs we sent to verify-receipt; non-empty when count > 0. */
      verifiedTransactionIds: string[];
    }
  | { kind: "error"; message: string };

/**
 * Given the count of restored transactions + any failure that
 * happened during verify-receipt cycling, render the user-facing
 * outcome.
 */
export function classifyRestoreOutcome(input: {
  totalAvailable: number;
  successfulVerifies: number;
  errors: string[];
  verifiedTransactionIds?: string[];
}): RestoreOutcome {
  if (input.totalAvailable === 0) {
    return { kind: "none" };
  }
  if (input.successfulVerifies > 0) {
    return {
      kind: "restored",
      count: input.successfulVerifies,
      verifiedTransactionIds: input.verifiedTransactionIds ?? [],
    };
  }
  // Restorations available but all verify-receipt calls failed.
  return {
    kind: "error",
    message:
      input.errors[0] ??
      "Found purchases but couldn't verify them. Try again or contact support.",
  };
}
