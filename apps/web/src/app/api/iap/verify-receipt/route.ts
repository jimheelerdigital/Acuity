/**
 * POST /api/iap/verify-receipt
 *
 * Phase 2 of the dual-source subscription pivot. Mobile (Phase 3)
 * calls this after a successful StoreKit 2 purchase. The endpoint
 * verifies the transaction with Apple, checks for cross-user / cross-
 * source conflicts, and flips the User row to PRO + source=apple.
 *
 * Request body:
 *   {
 *     receipt: string,        // base64; legacy StoreKit 1 field, accepted but unused
 *     productId: string,      // "com.heelerdigital.acuity.pro.monthly"
 *     transactionId: string   // Apple's transactionId for this purchase
 *   }
 *
 * Auth: NextAuth web session OR mobile bearer JWT (getAnySessionUserId).
 *
 * Auth path is the same as /api/record so the iOS app reuses the
 * bearer flow.
 *
 * Response codes:
 *   200 — happy path (write OR idempotent-noop)
 *   400 — bad body OR BAD_PRODUCT OR EXPIRED_RECEIPT
 *   401 — not authenticated
 *   409 — ANOTHER_USER_OWNS_TRANSACTION OR ACTIVE_STRIPE_SUB
 *   502 — Apple API failure (auth, http, decode)
 *
 * IMPORTANT: this endpoint is dead code until Phase 3 ships. The
 * APPLE_IAP_* env vars must also be configured before Apple's API
 * call succeeds. Without env, the endpoint returns 502
 * APPLE_AUTH_FAILED on every call — fail-closed by design.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  decideReceiptVerify,
  fetchTransactionInfo,
  readAppleApiConfig,
} from "@/lib/apple-iap";
import {
  decideGoogleReceiptVerify,
  fetchGoogleSubscription,
  readGooglePlayApiConfig,
} from "@/lib/google-iap";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  receipt?: unknown;
  productId?: unknown;
  transactionId?: unknown;
  // Android (Play Billing) path: purchase token from react-native-iap.
  purchaseToken?: unknown;
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const productId = typeof body.productId === "string" ? body.productId : null;
  const transactionId =
    typeof body.transactionId === "string" ? body.transactionId : null;
  const purchaseToken =
    typeof body.purchaseToken === "string" ? body.purchaseToken : null;

  // Platform branch: a purchaseToken means Android / Google Play Billing;
  // a transactionId means iOS / Apple. The Apple path below is unchanged.
  if (purchaseToken) {
    return handleGoogleVerify(userId, productId, purchaseToken);
  }

  if (!productId || !transactionId) {
    return NextResponse.json(
      { error: "Missing required fields: productId, transactionId" },
      { status: 400 }
    );
  }

  // Configure + fetch Apple's transaction record.
  let appleConfig: ReturnType<typeof readAppleApiConfig>;
  try {
    appleConfig = readAppleApiConfig();
  } catch (err) {
    safeLog.error("iap.verify-receipt.config-missing", err, { userId });
    return NextResponse.json(
      { error: "IAP not configured", code: "APPLE_AUTH_FAILED" },
      { status: 502 }
    );
  }

  const apple = await fetchTransactionInfo(transactionId, appleConfig);
  if (!apple.ok) {
    safeLog.error(
      "iap.verify-receipt.apple-error",
      new Error(apple.diagnostic),
      { userId, code: apple.code, transactionId }
    );
    const status = apple.code === "TRANSACTION_NOT_FOUND" ? 400 : 502;
    return NextResponse.json(
      { error: "Apple verification failed", code: apple.code },
      { status }
    );
  }

  // Sanity-check that the body's productId matches what Apple says.
  // If they diverge, the client is buggy or forged.
  if (apple.info.productId !== productId) {
    safeLog.warn("iap.verify-receipt.product-mismatch", {
      userId,
      bodyProductId: productId,
      appleProductId: apple.info.productId,
    });
    return NextResponse.json(
      { error: "Product ID mismatch", code: "BAD_PRODUCT" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  const [currentUser, otherOwner] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionSource: true,
        appleOriginalTransactionId: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.user.findUnique({
      where: { appleOriginalTransactionId: apple.info.originalTransactionId },
      select: { id: true },
    }),
  ]);
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const decision = decideReceiptVerify(
    apple.info,
    currentUser,
    otherOwner && otherOwner.id !== currentUser.id ? otherOwner : null
  );

  if (decision.action === "conflict") {
    if (decision.code === "ANOTHER_USER_OWNS_TRANSACTION") {
      safeLog.error(
        "iap.verify-receipt.transaction-collision",
        new Error(decision.reason),
        {
          userId,
          otherUserId: otherOwner?.id ?? null,
          originalTransactionId: apple.info.originalTransactionId,
        }
      );
    } else {
      safeLog.warn("iap.verify-receipt.conflict", {
        userId,
        code: decision.code,
        reason: decision.reason,
      });
    }
    const status =
      decision.code === "BAD_PRODUCT" || decision.code === "EXPIRED_RECEIPT"
        ? 400
        : 409;
    return NextResponse.json(
      {
        error:
          decision.code === "ACTIVE_STRIPE_SUB"
            ? "You already have an active subscription via web. Manage it on the web."
            : decision.code === "ANOTHER_USER_OWNS_TRANSACTION"
              ? "This Apple subscription is already attached to another account."
              : decision.code === "BAD_PRODUCT"
                ? "Unrecognized product."
                : "This receipt has already expired.",
        code: decision.code,
      },
      { status }
    );
  }

  if (decision.action === "idempotent-noop") {
    safeLog.info("iap.verify-receipt.idempotent", {
      userId,
      originalTransactionId: apple.info.originalTransactionId,
    });
    return NextResponse.json({
      ok: true,
      subscriptionStatus: "PRO",
      expiresDate: apple.info.expiresDate,
      idempotent: true,
    });
  }

  // action === "write"
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "PRO",
      subscriptionSource: "apple",
      appleOriginalTransactionId: apple.info.originalTransactionId,
      appleProductId: apple.info.productId,
      appleEnvironment:
        apple.info.environment === "Sandbox" ? "sandbox" : "production",
      // Prisma's Json column type rejects bare `Record<string, unknown>`;
      // mirror the existing pattern from process-entry.ts persist
      // (`rawAnalysis: extraction as unknown as object`).
      appleLatestReceiptInfo: apple.info.rawPayload as unknown as object,
      // Apple sub bypasses the trial clock — user paid, we honor it.
      trialEndsAt: null,
      stripeCurrentPeriodEnd: null,
    },
  });

  safeLog.info("iap.verify-receipt.success", {
    userId,
    productId: apple.info.productId,
    environment: apple.info.environment,
    expiresDate: apple.info.expiresDate,
  });

  // Founder notification — only on a genuine NEW paid purchase (this
  // "write" branch; a repeat verify of the same transaction returns
  // "idempotent-noop" above and never reaches here, so this is
  // idempotent on the Apple original transaction id). Fail-soft: a
  // notification error must never affect entitlement.
  try {
    const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
    await notifyFoundersOfPayment({
      userId,
      email: currentUser.email ?? "unknown",
      plan: /annual|yearly/i.test(apple.info.productId) ? "yearly" : "monthly",
      source: "apple",
      timestamp: new Date(),
    });
  } catch (err) {
    safeLog.warn("iap.verify-receipt.founder-notification-failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    subscriptionStatus: "PRO",
    expiresDate: apple.info.expiresDate,
  });
}

// ─── Google Play Billing verify (Android IAP parity) ──────────────────────
// Mirrors the Apple flow above: fetch → cross-check productId → decide →
// conflict/idempotent/write. Writes subscriptionSource "google_play".
async function handleGoogleVerify(
  userId: string,
  productId: string | null,
  purchaseToken: string
): Promise<NextResponse> {
  if (!productId) {
    return NextResponse.json(
      { error: "Missing required field: productId" },
      { status: 400 }
    );
  }

  let config: ReturnType<typeof readGooglePlayApiConfig>;
  try {
    config = readGooglePlayApiConfig();
  } catch (err) {
    safeLog.error(
      "iap.verify-receipt.google-config-error",
      err instanceof Error ? err : new Error("config"),
      { userId }
    );
    return NextResponse.json(
      { error: "Google Play verification not configured" },
      { status: 500 }
    );
  }

  const google = await fetchGoogleSubscription(purchaseToken, config);
  if (!google.ok) {
    safeLog.error(
      "iap.verify-receipt.google-error",
      new Error(google.diagnostic),
      { userId, code: google.code }
    );
    const status = google.code === "TOKEN_NOT_FOUND" ? 400 : 502;
    return NextResponse.json(
      { error: "Google verification failed", code: google.code },
      { status }
    );
  }

  // Cross-check the body productId against what Google reports.
  if (google.info.productId !== productId) {
    safeLog.warn("iap.verify-receipt.google-product-mismatch", {
      userId,
      bodyProductId: productId,
      googleProductId: google.info.productId,
    });
    return NextResponse.json(
      { error: "Product mismatch", code: "BAD_PRODUCT" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");
  const [currentUser, otherOwner] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionSource: true,
        googlePurchaseToken: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.user.findUnique({
      where: { googlePurchaseToken: google.info.purchaseToken },
      select: { id: true },
    }),
  ]);
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const decision = decideGoogleReceiptVerify(
    google.info,
    currentUser,
    otherOwner && otherOwner.id !== currentUser.id ? otherOwner : null
  );

  if (decision.action === "conflict") {
    if (decision.code === "ANOTHER_USER_OWNS_TRANSACTION") {
      safeLog.error(
        "iap.verify-receipt.google-token-collision",
        new Error(decision.reason),
        { userId, otherUserId: otherOwner?.id ?? null }
      );
    } else {
      safeLog.warn("iap.verify-receipt.google-conflict", {
        userId,
        code: decision.code,
        reason: decision.reason,
      });
    }
    const status =
      decision.code === "BAD_PRODUCT" || decision.code === "EXPIRED_RECEIPT"
        ? 400
        : 409;
    return NextResponse.json(
      {
        error:
          decision.code === "ACTIVE_STRIPE_SUB"
            ? "You already have an active subscription via web. Manage it on the web."
            : decision.code === "ANOTHER_USER_OWNS_TRANSACTION"
              ? "This Google Play subscription is already attached to another account."
              : decision.code === "BAD_PRODUCT"
                ? "Unrecognized product."
                : "This subscription is not active.",
        code: decision.code,
      },
      { status }
    );
  }

  if (decision.action === "idempotent-noop") {
    safeLog.info("iap.verify-receipt.google-idempotent", { userId });
    return NextResponse.json({
      ok: true,
      subscriptionStatus: "PRO",
      expiresDate: google.info.expiryDate,
      idempotent: true,
    });
  }

  // action === "write"
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "PRO",
      subscriptionSource: "google_play",
      googlePurchaseToken: google.info.purchaseToken,
      googleProductId: google.info.productId,
      googleLatestReceiptInfo: google.info.rawPayload as unknown as object,
      // Google sub bypasses the trial clock — user paid, we honor it.
      trialEndsAt: null,
      stripeCurrentPeriodEnd: null,
    },
  });

  safeLog.info("iap.verify-receipt.google-success", {
    userId,
    productId: google.info.productId,
    state: google.info.state,
    expiresDate: google.info.expiryDate,
  });

  // Founder notification — same idempotency guarantee as the Apple
  // branch: only the "write" path (new purchase token) reaches here;
  // a repeat verify returns "idempotent-noop" above. Fail-soft.
  try {
    const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
    await notifyFoundersOfPayment({
      userId,
      email: currentUser.email ?? "unknown",
      plan: /annual|yearly/i.test(google.info.productId) ? "yearly" : "monthly",
      source: "google_play",
      timestamp: new Date(),
    });
  } catch (err) {
    safeLog.warn("iap.verify-receipt.google-founder-notification-failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    subscriptionStatus: "PRO",
    expiresDate: google.info.expiryDate,
  });
}
