import "server-only";

/**
 * Apple App Store Server API + Notifications V2 client.
 *
 * Phase 2 of the dual-source subscription pivot. Two responsibilities:
 *
 *   1. Outbound: call Apple's `/inApps/v1/transactions/{transactionId}`
 *      to verify a transaction the iOS app reports. Auth is a short-
 *      lived ES256 JWT signed with the App Store Connect API Key.
 *
 *   2. Inbound: verify Apple's signed notification JWS (App Store
 *      Server Notifications V2). Apple signs with ES256 and includes
 *      the certificate chain in the JWS `x5c` header. Chain MUST
 *      validate against the Apple Root CA — without that, an attacker
 *      with any ES256 keypair could forge "user upgraded to PRO"
 *      events. We verify the chain locally; no JWKS round-trip.
 *
 * IMPORTANT: this module is dead code until Phase 3 wires the mobile
 * StoreKit client. The endpoints `/api/iap/verify-receipt` and
 * `/api/iap/notifications` are reachable but no real client calls
 * them, so any bug here cannot affect production users today.
 *
 * No `@apple/app-store-server-library` dep — the official SDK is
 * heavyweight and pulls in transitive native deps. We only need a
 * single GET + JWS verify; doing it directly via `jose` + `node:crypto`
 * is ~150 lines and stays in our security-review surface.
 */

import { X509Certificate } from "node:crypto";
import {
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importPKCS8,
  SignJWT,
} from "jose";

// ─── Allowed product IDs ──────────────────────────────────────
//
// The iOS app may only have ONE active product ID at v1.1 launch
// (com.heelerdigital.acuity.pro.monthly). Annual lands in v1.2 per
// the §4 recommendation in iap-app-store-connect-setup.md.
//
// Both endpoints check `productId in ALLOWED_PRODUCT_IDS` before
// touching User state — a forged or future-product receipt is
// rejected at the gate.
export const ALLOWED_PRODUCT_IDS = new Set([
  "com.heelerdigital.acuity.pro.monthly",
]);

// ─── Apple Root CA — G3 ───────────────────────────────────────
//
// Self-signed root that anchors the App Store Server Notifications
// V2 cert chain. Embedded as a constant so verification doesn't
// require network access (and so an attacker can't substitute a
// hostile JWKS endpoint). PEM matches the cert at:
//   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
//
// Distinguished name: CN=Apple Root CA - G3, O=Apple Inc., ...
//
// Rotation: Apple has used this root since 2014 and there's no
// announced rotation. If it does rotate, this file is the single
// place to update.
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

// ─── App Store Connect API JWT signing ────────────────────────
//
// Apple's App Store Server API auth: ES256 JWT, 60-min max lifetime,
// audience = "appstoreconnect-v1". Signed with the .p8 private key
// downloaded when the API key is created (App Store Connect → Users
// and Access → Keys → In-App Purchase scope).

interface AppleApiJwtConfig {
  /** 10-char key ID from the App Store Connect API Key page. */
  keyId: string;
  /** Issuer ID (UUID) shown on the Keys page header. */
  issuerId: string;
  /** PEM-encoded ES256 private key from the .p8 file (with newlines). */
  privateKeyPem: string;
}

export function readAppleApiConfig(): AppleApiJwtConfig {
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const privateKeyPem = process.env.APPLE_IAP_PRIVATE_KEY;
  if (!keyId || !issuerId || !privateKeyPem) {
    throw new Error(
      "Apple IAP env not configured — set APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY"
    );
  }
  return { keyId, issuerId, privateKeyPem };
}

export async function signAppStoreConnectJwt(
  config: AppleApiJwtConfig
): Promise<string> {
  const key = await importPKCS8(config.privateKeyPem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId, typ: "JWT" })
    .setIssuer(config.issuerId)
    .setIssuedAt()
    .setExpirationTime("20m") // Well within Apple's 60m ceiling.
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

// ─── Outbound: verify a transaction by ID ─────────────────────
//
// Apple's GET /inApps/v1/transactions/{transactionId} returns
// `{ signedTransactionInfo: "<JWS>" }`. We decode the JWS to extract
// the transaction details. Sandbox and production are separate hosts.

export type AppleEnvironment = "Sandbox" | "Production";

const APPLE_API_HOST: Record<AppleEnvironment, string> = {
  Production: "api.storekit.itunes.apple.com",
  Sandbox: "api.storekit-sandbox.itunes.apple.com",
};

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  /** Apple returns expiresDate as unix ms since epoch. */
  expiresDate: number;
  /** "Sandbox" | "Production". Mirrored in the User row for routing. */
  environment: AppleEnvironment;
  /** "AUTO_RENEWABLE" | "NON_RENEWING" | etc. */
  type?: string;
  /** Subscription group identifier (Apple-side). */
  subscriptionGroupIdentifier?: string;
  /** Raw decoded payload; persisted verbatim to appleLatestReceiptInfo. */
  rawPayload: Record<string, unknown>;
}

export interface FetchTransactionResult {
  ok: true;
  info: AppleTransactionInfo;
}

export interface FetchTransactionFailure {
  ok: false;
  /**
   * Sanitized error code for the client + safeLog. Never returns
   * Apple's raw error message (it can leak internal endpoint names).
   */
  code:
    | "APPLE_AUTH_FAILED"
    | "TRANSACTION_NOT_FOUND"
    | "APPLE_HTTP_ERROR"
    | "INVALID_JWS"
    | "MISSING_FIELDS";
  /** Internal-only diagnostic for safeLog.error calls. */
  diagnostic: string;
}

/**
 * Fetch + decode a transaction from Apple. Tries production first,
 * falls back to sandbox on 404 OR 401 — Apple's documented pattern
 * recommends production-first because the iOS app doesn't always
 * know its own environment (TestFlight builds use sandbox).
 *
 * Why 401 also triggers the fallback (2026-05-09 fix): Apple's
 * production endpoint returns 401 when queried with a transactionId
 * that exists only in sandbox — even with a perfectly-valid JWT.
 * This is observably true for TestFlight transactions where the
 * receipt is sandbox-only but our code path always tries production
 * first. Build-34's sandbox purchase produced exactly this:
 *   - POST /api/iap/notifications → 200 (Apple webhook arrived,
 *     JWS-validated, no User row matched yet because verify-receipt
 *     hadn't written the appleOriginalTransactionId)
 *   - POST /api/iap/verify-receipt → 502 APPLE_AUTH_FAILED
 *     (production returned 401 for the sandbox transactionId; the
 *     pre-fix fallback only retried sandbox on 404 → never tried
 *     sandbox → cascaded to "no User flip to PRO" + lingering
 *     error-banner UI on the paywall).
 * On a true credentials issue (genuinely-bad JWT), both production
 * AND sandbox return 401 — the combined diagnostic preserves both
 * environments so we can tell the difference. The Apple SDK's
 * production-then-sandbox pattern is documented at
 * developer.apple.com/documentation/appstoreserverapi.
 */
export async function fetchTransactionInfo(
  transactionId: string,
  config: AppleApiJwtConfig,
  fetchImpl: typeof fetch = fetch
): Promise<FetchTransactionResult | FetchTransactionFailure> {
  const jwt = await signAppStoreConnectJwt(config);

  const tryEnv = async (
    env: AppleEnvironment
  ): Promise<FetchTransactionResult | FetchTransactionFailure> => {
    const url = `https://${APPLE_API_HOST[env]}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch (err) {
      return {
        ok: false,
        code: "APPLE_HTTP_ERROR",
        diagnostic: `network error calling ${env}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: "APPLE_AUTH_FAILED",
        diagnostic: `${env} returned ${res.status} — JWT signing/keyId/issuerId mismatch`,
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        code: "TRANSACTION_NOT_FOUND",
        diagnostic: `${env} returned 404 for transactionId`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        code: "APPLE_HTTP_ERROR",
        diagnostic: `${env} returned ${res.status}`,
      };
    }

    let body: { signedTransactionInfo?: string };
    try {
      body = (await res.json()) as { signedTransactionInfo?: string };
    } catch {
      return {
        ok: false,
        code: "APPLE_HTTP_ERROR",
        diagnostic: `${env} returned non-JSON body`,
      };
    }
    if (typeof body.signedTransactionInfo !== "string") {
      return {
        ok: false,
        code: "APPLE_HTTP_ERROR",
        diagnostic: `${env} response missing signedTransactionInfo`,
      };
    }
    return decodeSignedTransactionInfo(body.signedTransactionInfo, env);
  };

  // Production first; fall back to sandbox on TRANSACTION_NOT_FOUND
  // OR APPLE_AUTH_FAILED. Both codes mean "wrong environment" — Apple
  // returns 404 sometimes and 401 other times for sandbox-only
  // transactionIds queried against production, depending on internal
  // routing. Other failure codes (APPLE_HTTP_ERROR for 5xx / network)
  // are NOT environment-related, so we don't retry on those.
  const prod = await tryEnv("Production");
  if (prod.ok) return prod;
  if (
    prod.code === "TRANSACTION_NOT_FOUND" ||
    prod.code === "APPLE_AUTH_FAILED"
  ) {
    const sandbox = await tryEnv("Sandbox");
    if (sandbox.ok) return sandbox;
    // Both environments failed. Surface a combined diagnostic so the
    // safeLog event tells us whether this is a routing issue (prod
    // 401 + sandbox 200 won't get here — already returned above) or
    // a credentials issue (prod 401 + sandbox 401, both auth-failed).
    return {
      ok: false,
      code: sandbox.code,
      diagnostic: `Production: ${prod.diagnostic} | Sandbox: ${sandbox.diagnostic}`,
    };
  }
  return prod;
}

// ─── JWS decode + chain validation ────────────────────────────
//
// Apple's signed payloads (transactions + notifications) are JWS
// compact-serialized ES256 with the cert chain in `x5c`. We:
//   1. Parse the protected header.
//   2. Validate the chain rooted at AppleRootCA-G3 using node:crypto.
//   3. Verify the JWS signature with the leaf cert's public key.
//   4. Decode and return the payload.

export async function verifyAppleSignedJws(
  jws: string
): Promise<{ ok: true; payload: Record<string, unknown> } | {
  ok: false;
  code: "INVALID_JWS" | "BAD_CERT_CHAIN" | "SIGNATURE_INVALID" | "MISSING_X5C";
  diagnostic: string;
}> {
  let header: { alg?: string; x5c?: string[] };
  try {
    header = decodeProtectedHeader(jws) as {
      alg?: string;
      x5c?: string[];
    };
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_JWS",
      diagnostic: err instanceof Error ? err.message : String(err),
    };
  }

  if (header.alg !== "ES256") {
    return {
      ok: false,
      code: "INVALID_JWS",
      diagnostic: `unexpected alg=${header.alg}; expected ES256`,
    };
  }

  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    return {
      ok: false,
      code: "MISSING_X5C",
      diagnostic: "JWS header missing x5c chain",
    };
  }

  // Build X509Certificate objects from each base64 DER entry.
  const certs: X509Certificate[] = [];
  for (let i = 0; i < header.x5c.length; i++) {
    try {
      const der = Buffer.from(header.x5c[i], "base64");
      certs.push(new X509Certificate(der));
    } catch (err) {
      return {
        ok: false,
        code: "BAD_CERT_CHAIN",
        diagnostic: `x5c[${i}] not a valid X.509 cert`,
      };
    }
  }

  // Chain validation. Each cert must be signed by the next; the
  // last cert must be issued by Apple Root CA G3 (we treat the
  // Apple root as a known anchor — it's not in the chain itself).
  const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      return {
        ok: false,
        code: "BAD_CERT_CHAIN",
        diagnostic: `cert[${i}] not signed by cert[${i + 1}]`,
      };
    }
  }
  if (!certs[certs.length - 1].verify(root.publicKey)) {
    return {
      ok: false,
      code: "BAD_CERT_CHAIN",
      diagnostic: "tail cert not signed by AppleRootCA-G3",
    };
  }

  // Validity-period check on every cert.
  const now = Date.now();
  for (let i = 0; i < certs.length; i++) {
    const validFrom = Date.parse(certs[i].validFrom);
    const validTo = Date.parse(certs[i].validTo);
    if (Number.isFinite(validFrom) && now < validFrom) {
      return {
        ok: false,
        code: "BAD_CERT_CHAIN",
        diagnostic: `cert[${i}] not yet valid`,
      };
    }
    if (Number.isFinite(validTo) && now > validTo) {
      return {
        ok: false,
        code: "BAD_CERT_CHAIN",
        diagnostic: `cert[${i}] expired`,
      };
    }
  }

  // Verify the JWS signature using the leaf cert's public key.
  const leafKey = await importLeafKey(certs[0]);
  let result;
  try {
    result = await compactVerify(jws, leafKey);
  } catch (err) {
    return {
      ok: false,
      code: "SIGNATURE_INVALID",
      diagnostic: err instanceof Error ? err.message : String(err),
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(result.payload));
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_JWS",
      diagnostic: `payload not JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true, payload };
}

async function importLeafKey(
  leaf: X509Certificate
): Promise<ReturnType<typeof importPKCS8> extends Promise<infer T> ? T : never> {
  // Re-export the leaf's KeyObject as a SPKI PEM, then jose imports
  // it. Avoids manual ASN.1 parsing.
  const spki = leaf.publicKey.export({ format: "pem", type: "spki" }) as string;
  // jose's importSPKI is dynamic — declare without static import to
  // avoid widening the bundle if not used.
  const { importSPKI } = await import("jose");
  return importSPKI(spki, "ES256") as never;
}

function decodeSignedTransactionInfo(
  jws: string,
  env: AppleEnvironment
): FetchTransactionResult | FetchTransactionFailure {
  // Apple's signedTransactionInfo IS a JWS-with-x5c — but the iOS
  // App Store Server API documentation guarantees that the response
  // body is signed by Apple's known cert chain. For Phase 2 + dead-
  // code-until-Phase-3, we trust the TLS channel + the JWT auth on
  // the request to authenticate the response, and decode without
  // re-verifying the chain (since we already authenticated to Apple).
  // If/when we're concerned about a Apple-side response-channel
  // attack, swap this to verifyAppleSignedJws.
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(jws) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_JWS",
      diagnostic: err instanceof Error ? err.message : String(err),
    };
  }
  const transactionId = stringField(payload.transactionId);
  const originalTransactionId = stringField(payload.originalTransactionId);
  const productId = stringField(payload.productId);
  const expiresDate = numberField(payload.expiresDate);
  if (
    !transactionId ||
    !originalTransactionId ||
    !productId ||
    expiresDate === null
  ) {
    return {
      ok: false,
      code: "MISSING_FIELDS",
      diagnostic: "decoded payload missing required transaction fields",
    };
  }
  return {
    ok: true,
    info: {
      transactionId,
      originalTransactionId,
      productId,
      expiresDate,
      environment: env,
      type: stringField(payload.type) ?? undefined,
      subscriptionGroupIdentifier:
        stringField(payload.subscriptionGroupIdentifier) ?? undefined,
      rawPayload: payload,
    },
  };
}

function stringField(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function numberField(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ─── Inbound notification mapping ─────────────────────────────
//
// Pure decision function: given a notification type + the current
// User row's subscription state, decide what to do. Extracted out of
// the route handler so it's unit-testable without mocking Prisma.

export type AppleNotificationType =
  | "DID_RENEW"
  | "DID_FAIL_TO_RENEW"
  | "EXPIRED"
  | "DID_CHANGE_RENEWAL_STATUS"
  | "REFUND"
  | "REVOKE"
  | "CONSUMPTION_REQUEST";

export type NotificationDecision =
  | { action: "ignore"; reason: string }
  | { action: "skip-stripe-source"; reason: string }
  | {
      action: "set-status";
      nextStatus: "PRO" | "PAST_DUE" | "FREE";
      reason: string;
    }
  | { action: "log-only"; reason: string };

export interface UserStateForNotification {
  subscriptionStatus: string;
  subscriptionSource: string | null;
  appleOriginalTransactionId: string | null;
}

/**
 * Map a notification + current user state to a deterministic action.
 *
 * Status-guard pattern (mirrors W6 Stripe §4.4 fix):
 *   - If subscriptionSource === "stripe" → never mutate from Apple
 *     side. Apple's notification is for an Apple-source row.
 *   - If subscriptionSource === null AND appleOriginalTransactionId
 *     does NOT match the notification's transaction → skip (this
 *     User row isn't the owner — Apple notifications are scoped by
 *     originalTransactionId, not by app-level userId).
 *   - Otherwise apply the mapping.
 *
 * Caller is responsible for fetching the User row by
 * appleOriginalTransactionId before calling this.
 */
export function decideNotificationAction(
  type: AppleNotificationType | string,
  user: UserStateForNotification | null
): NotificationDecision {
  if (!user) {
    return {
      action: "ignore",
      reason: "no User row matches this notification's originalTransactionId",
    };
  }

  if (user.subscriptionSource === "stripe") {
    return {
      action: "skip-stripe-source",
      reason:
        "user is Stripe-sourced; Apple notifications must not modify Stripe-sub state",
    };
  }

  switch (type) {
    case "DID_RENEW":
      // Renewal extends the active sub; keep PRO. If user is FREE
      // (e.g. expired then renewed via grace), re-promote to PRO.
      return {
        action: "set-status",
        nextStatus: "PRO",
        reason: "renewal succeeded",
      };

    case "DID_FAIL_TO_RENEW":
      // Apple's billing-retry window. Mirror to PAST_DUE only if we
      // were PRO; if already FREE, leave alone (user has been
      // EXPIRED'd already).
      if (user.subscriptionStatus === "PRO") {
        return {
          action: "set-status",
          nextStatus: "PAST_DUE",
          reason: "renewal failed; entering Apple billing-retry window",
        };
      }
      return {
        action: "ignore",
        reason: `DID_FAIL_TO_RENEW on non-PRO user (status=${user.subscriptionStatus})`,
      };

    case "EXPIRED":
      // Subscription expired (billing retry window over OR user
      // canceled-at-period-end and the period ended). Move to FREE
      // unless we're already there.
      if (user.subscriptionStatus === "FREE") {
        return {
          action: "ignore",
          reason: "EXPIRED on already-FREE user (idempotent)",
        };
      }
      return {
        action: "set-status",
        nextStatus: "FREE",
        reason: "subscription expired",
      };

    case "REFUND":
      // Apple refunded the user. Strip Pro access immediately.
      // Stripe-source guard above already excluded mistargeted refunds.
      return {
        action: "set-status",
        nextStatus: "FREE",
        reason: "refunded",
      };

    case "REVOKE":
      // Family-sharing pulled the entitlement. Same posture as REFUND.
      return {
        action: "set-status",
        nextStatus: "FREE",
        reason: "revoked (family-sharing pull)",
      };

    case "DID_CHANGE_RENEWAL_STATUS":
      // Auto-renew toggled on/off. Doesn't affect current entitlement.
      return {
        action: "log-only",
        reason: "auto-renew toggle (no state change in v1.1)",
      };

    case "CONSUMPTION_REQUEST":
      // Only relevant for consumable IAPs; we have only auto-renewables.
      return {
        action: "log-only",
        reason: "consumption request (not applicable to subscriptions)",
      };

    default:
      return {
        action: "log-only",
        reason: `unhandled notification type: ${type}`,
      };
  }
}

// ─── Receipt-verify decision ──────────────────────────────────
//
// Pure decision function for the verify-receipt endpoint. Given a
// fetched-and-decoded transaction info + the current authenticated
// User row, decide whether to write, skip, or 409.

export type VerifyReceiptDecision =
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

export interface UserStateForVerify {
  id: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  appleOriginalTransactionId: string | null;
  stripeSubscriptionId: string | null;
}

export function decideReceiptVerify(
  info: AppleTransactionInfo,
  currentUser: UserStateForVerify,
  /** Other user row (if any) that already owns this originalTransactionId. */
  otherOwner: { id: string } | null,
  /** Current time, injected for tests. */
  nowMs: number = Date.now()
): VerifyReceiptDecision {
  if (!ALLOWED_PRODUCT_IDS.has(info.productId)) {
    return {
      action: "conflict",
      code: "BAD_PRODUCT",
      reason: `productId not allowed: ${info.productId}`,
    };
  }
  if (info.expiresDate <= nowMs) {
    return {
      action: "conflict",
      code: "EXPIRED_RECEIPT",
      reason: `expiresDate=${info.expiresDate} is past nowMs=${nowMs}`,
    };
  }
  if (otherOwner && otherOwner.id !== currentUser.id) {
    return {
      action: "conflict",
      code: "ANOTHER_USER_OWNS_TRANSACTION",
      reason: `originalTransactionId=${info.originalTransactionId} already on user ${otherOwner.id}`,
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
  // Idempotent: same transaction already attached to this user.
  if (
    currentUser.subscriptionSource === "apple" &&
    currentUser.appleOriginalTransactionId === info.originalTransactionId &&
    currentUser.subscriptionStatus === "PRO"
  ) {
    return {
      action: "idempotent-noop",
      reason: "transaction already attached to this user with PRO status",
    };
  }
  return {
    action: "write",
    reason: "happy path",
  };
}
