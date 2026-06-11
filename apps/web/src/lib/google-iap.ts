/**
 * Google Play Billing — server-side subscription verification.
 *
 * Mirror of apple-iap.ts for the Android IAP path (v1.3.3 parity). Verifies a
 * purchase token against the Google Play Developer API
 * (purchases.subscriptionsv2.get) using the play-submit service account, and
 * exposes a pure decision function (decideGoogleReceiptVerify) parallel to
 * Apple's decideReceiptVerify so /api/iap/verify-receipt can branch by
 * platform with identical idempotency + conflict semantics.
 *
 * Auth: uses the `googleapis` GoogleAuth client with the service-account
 * credentials from GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (it handles the JWT-bearer
 * token exchange + caching internally). Requires the SA to have
 * "View financial data" + "Manage orders and subscriptions" in Play Console.
 *
 * Env:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — full service-account JSON (Vercel env)
 *   GOOGLE_PLAY_PACKAGE_NAME         — e.g. "com.heelerdigital.acuity"
 */
import { google } from "googleapis";

// Android subscription product IDs (Play Console). DISTINCT from the iOS
// reverse-DNS IDs — Google product IDs are flat lowercase/underscore. Mirror
// of apple-iap.ts's ALLOWED_PRODUCT_IDS, used by the decision gate.
export const GOOGLE_ALLOWED_PRODUCT_IDS = new Set([
  "acuity_pro_monthly",
  "acuity_pro_annual",
]);

// subscriptionsv2 states that grant access (PRO). CANCELED still has access
// until expiry; ON_HOLD / PAUSED / EXPIRED / PENDING do not.
const ACCESS_GRANTING_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED", // canceled-but-not-yet-expired keeps access
]);

export interface GooglePlayApiConfig {
  clientEmail: string;
  privateKey: string;
  packageName: string;
}

/**
 * Read + validate the service-account config from env. Throws a typed Error so
 * the route can return a clean 500 ("not configured") rather than a crash.
 */
export function readGooglePlayApiConfig(): GooglePlayApiConfig {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!raw) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set");
  }
  if (!packageName) {
    throw new Error("GOOGLE_PLAY_PACKAGE_NAME is not set");
  }
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing client_email / private_key"
    );
  }
  return {
    clientEmail: creds.client_email,
    privateKey: creds.private_key,
    packageName,
  };
}

export interface GoogleSubscriptionInfo {
  productId: string;
  /** Expiry in epoch ms (parsed from the line item's RFC3339 expiryTime). */
  expiryDate: number;
  purchaseToken: string;
  /** SUBSCRIPTION_STATE_* */
  state: string;
  /** Whether Google considers this state access-granting. */
  hasAccess: boolean;
  acknowledged: boolean;
  /** If Google migrated the token (resubscribe/upgrade), the prior token. */
  linkedPurchaseToken: string | null;
  /** Full v2 payload, persisted to User.googleLatestReceiptInfo. */
  rawPayload: unknown;
}

export type FetchGoogleResult =
  | { ok: true; info: GoogleSubscriptionInfo }
  | { ok: false; code: FetchGoogleFailureCode; diagnostic: string };

export type FetchGoogleFailureCode =
  | "TOKEN_NOT_FOUND" // 404/410 — token unknown/expired at Google
  | "AUTH_ERROR" // 401/403 — SA creds/permissions wrong
  | "NO_LINE_ITEMS" // unexpected shape — no productId/expiry
  | "UPSTREAM_ERROR"; // 5xx / network

let _publisher: ReturnType<typeof google.androidpublisher> | null = null;

function getAndroidPublisher(config: GooglePlayApiConfig) {
  if (_publisher) return _publisher;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  _publisher = google.androidpublisher({ version: "v3", auth });
  return _publisher;
}

/**
 * Verify a purchase token against the Play Developer API. Returns the
 * normalized subscription info or a typed failure.
 */
export async function fetchGoogleSubscription(
  purchaseToken: string,
  config: GooglePlayApiConfig
): Promise<FetchGoogleResult> {
  const publisher = getAndroidPublisher(config);
  try {
    const res = await publisher.purchases.subscriptionsv2.get({
      packageName: config.packageName,
      token: purchaseToken,
    });
    const data = res.data;
    const line = (data.lineItems ?? [])[0];
    const productId = line?.productId ?? null;
    const expiryRaw = line?.expiryTime ?? null;
    if (!productId || !expiryRaw) {
      return {
        ok: false,
        code: "NO_LINE_ITEMS",
        diagnostic: `missing productId/expiryTime in lineItems (state=${data.subscriptionState})`,
      };
    }
    const expiryDate = Date.parse(expiryRaw);
    const state = data.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
    return {
      ok: true,
      info: {
        productId,
        expiryDate: Number.isFinite(expiryDate) ? expiryDate : 0,
        purchaseToken,
        state,
        hasAccess: ACCESS_GRANTING_STATES.has(state),
        acknowledged:
          data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        linkedPurchaseToken: data.linkedPurchaseToken ?? null,
        rawPayload: data,
      },
    };
  } catch (err) {
    const status =
      (err as { code?: number; response?: { status?: number } })?.code ??
      (err as { response?: { status?: number } })?.response?.status;
    const diagnostic = err instanceof Error ? err.message : "unknown";
    if (status === 404 || status === 410) {
      return { ok: false, code: "TOKEN_NOT_FOUND", diagnostic };
    }
    if (status === 401 || status === 403) {
      return { ok: false, code: "AUTH_ERROR", diagnostic };
    }
    return { ok: false, code: "UPSTREAM_ERROR", diagnostic };
  }
}

// ─── Receipt-verify decision (mirror of decideReceiptVerify) ──────────────

export type GoogleVerifyDecision =
  | { action: "write"; reason: string }
  | { action: "idempotent-noop"; reason: string }
  | {
      action: "conflict";
      code:
        | "ANOTHER_USER_OWNS_TRANSACTION"
        | "ACTIVE_STRIPE_SUB"
        | "BAD_PRODUCT"
        | "EXPIRED_RECEIPT";
      reason: string;
    };

export interface UserStateForGoogleVerify {
  id: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  googlePurchaseToken: string | null;
  stripeSubscriptionId: string | null;
}

export function decideGoogleReceiptVerify(
  info: GoogleSubscriptionInfo,
  currentUser: UserStateForGoogleVerify,
  /** Other user row (if any) already owning this purchaseToken. */
  otherOwner: { id: string } | null,
  nowMs: number = Date.now()
): GoogleVerifyDecision {
  if (!GOOGLE_ALLOWED_PRODUCT_IDS.has(info.productId)) {
    return {
      action: "conflict",
      code: "BAD_PRODUCT",
      reason: `productId not allowed: ${info.productId}`,
    };
  }
  // No access = treat like an expired/invalid receipt (covers EXPIRED,
  // ON_HOLD, PAUSED, PENDING, and any future-expiry-but-not-active state).
  if (!info.hasAccess || info.expiryDate <= nowMs) {
    return {
      action: "conflict",
      code: "EXPIRED_RECEIPT",
      reason: `state=${info.state} expiryDate=${info.expiryDate} nowMs=${nowMs} hasAccess=${info.hasAccess}`,
    };
  }
  if (otherOwner && otherOwner.id !== currentUser.id) {
    return {
      action: "conflict",
      code: "ANOTHER_USER_OWNS_TRANSACTION",
      reason: `purchaseToken already on user ${otherOwner.id}`,
    };
  }
  if (
    currentUser.subscriptionSource === "stripe" &&
    currentUser.stripeSubscriptionId &&
    currentUser.subscriptionStatus !== "FREE"
  ) {
    return {
      action: "conflict",
      code: "ACTIVE_STRIPE_SUB",
      reason: "user has active Stripe subscription",
    };
  }
  if (
    currentUser.subscriptionSource === "google_play" &&
    currentUser.googlePurchaseToken === info.purchaseToken &&
    currentUser.subscriptionStatus === "PRO"
  ) {
    return {
      action: "idempotent-noop",
      reason: "purchaseToken already attached to this user with PRO status",
    };
  }
  return { action: "write", reason: "happy path" };
}
