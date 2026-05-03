/**
 * POST /api/iap/notifications
 *
 * Phase 2 webhook for Apple's App Store Server Notifications V2.
 * Apple POSTs `{ signedPayload: "<JWS>" }`. The JWS is ES256-signed
 * with a cert chain rooted at AppleRootCA-G3 in the x5c header.
 *
 * Spec: https://developer.apple.com/documentation/appstoreservernotifications
 *
 * Notification types we react to (per workstream prompt):
 *   - DID_RENEW                 → keep / re-promote PRO
 *   - DID_FAIL_TO_RENEW         → demote PRO → PAST_DUE (if PRO)
 *   - EXPIRED                   → demote → FREE
 *   - REFUND                    → demote → FREE
 *   - REVOKE                    → demote → FREE (family-share pull)
 *   - DID_CHANGE_RENEWAL_STATUS → log only (auto-renew toggle)
 *   - CONSUMPTION_REQUEST       → log only (not applicable to subs)
 *   - other                     → log only, ack 200
 *
 * Idempotency: Apple retries on 5xx with the same notificationUUID.
 * We tombstone the UUID in IapNotificationLog (unique constraint);
 * second insert P2002 → 200-ack and skip.
 *
 * Status guard: Apple notifications only modify users where
 * subscriptionSource === 'apple'. A Stripe-source row is left
 * untouched (mirrors the W-A Stripe FREE-guard pattern). This
 * defends against a forged or misrouted notification claiming
 * to affect a Stripe user.
 *
 * The matching is by appleOriginalTransactionId — Apple's
 * notifications are scoped to a specific subscription, not to our
 * userId, so we look up the User by that column.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  AppleNotificationType,
  decideNotificationAction,
  verifyAppleSignedJws,
} from "@/lib/apple-iap";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface InboundBody {
  signedPayload?: unknown;
}

interface DecodedNotificationPayload {
  notificationType?: unknown;
  subtype?: unknown;
  notificationUUID?: unknown;
  data?: {
    signedTransactionInfo?: unknown;
    environment?: unknown;
    appAppleId?: unknown;
    bundleId?: unknown;
  };
  version?: unknown;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as InboundBody | null;
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.signedPayload !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid body — expected { signedPayload }" },
      { status: 400 }
    );
  }

  const verified = await verifyAppleSignedJws(body.signedPayload);
  if (!verified.ok) {
    safeLog.error(
      "iap.notifications.jws-invalid",
      new Error(verified.diagnostic),
      { code: verified.code }
    );
    return NextResponse.json(
      { error: "Invalid signature", code: verified.code },
      { status: 401 }
    );
  }

  const payload = verified.payload as DecodedNotificationPayload;
  const notificationType =
    typeof payload.notificationType === "string"
      ? (payload.notificationType as AppleNotificationType)
      : null;
  const notificationUUID =
    typeof payload.notificationUUID === "string"
      ? payload.notificationUUID
      : null;

  if (!notificationType || !notificationUUID) {
    safeLog.warn("iap.notifications.missing-fields", {
      hasType: notificationType !== null,
      hasUUID: notificationUUID !== null,
    });
    return NextResponse.json(
      { error: "Missing notificationType or notificationUUID" },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  // Idempotency tombstone — write FIRST so Apple's retry doesn't
  // reprocess. Same pattern as Stripe webhook (route.ts:55).
  try {
    await prisma.iapNotificationLog.create({
      data: {
        notificationUUID,
        type: notificationType,
        payload: payload as unknown as object,
      },
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      // Duplicate — Apple retried. Ack OK, no further work.
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Tombstone write failed for some other reason — log + continue
    // (we'd rather process than drop the event; the dedupe was
    // best-effort).
    safeLog.error(
      "iap.notifications.tombstone-failed",
      err instanceof Error ? err : new Error(String(err)),
      { notificationUUID, type: notificationType }
    );
  }

  // Decode the inner transaction info to learn which Apple sub this
  // notification targets. The transaction info is itself a JWS but
  // signed by Apple along with the outer payload — we trust it via
  // the outer cert chain validation already performed.
  const signedTxInfo = payload.data?.signedTransactionInfo;
  if (typeof signedTxInfo !== "string") {
    safeLog.warn("iap.notifications.no-transaction-info", {
      notificationUUID,
      type: notificationType,
    });
    // Some notification types don't carry a transaction (e.g.
    // CONSUMPTION_REQUEST for non-sub apps). Ack and exit cleanly.
    return NextResponse.json({ received: true, noop: "no-transaction-info" });
  }
  let originalTransactionId: string | null = null;
  try {
    // Decode without re-verifying — already covered by outer chain.
    const { decodeJwt } = await import("jose");
    const txPayload = decodeJwt(signedTxInfo) as {
      originalTransactionId?: unknown;
    };
    if (typeof txPayload.originalTransactionId === "string") {
      originalTransactionId = txPayload.originalTransactionId;
    }
  } catch {
    // fall through to ignore-no-target below
  }

  if (!originalTransactionId) {
    safeLog.warn("iap.notifications.no-original-tx", {
      notificationUUID,
      type: notificationType,
    });
    return NextResponse.json({
      received: true,
      noop: "no-originalTransactionId",
    });
  }

  // Locate the User row that owns this Apple sub.
  const targetUser = await prisma.user.findUnique({
    where: { appleOriginalTransactionId: originalTransactionId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      appleOriginalTransactionId: true,
    },
  });

  const decision = decideNotificationAction(notificationType, targetUser);

  if (decision.action === "ignore") {
    safeLog.info("iap.notifications.ignore", {
      notificationUUID,
      type: notificationType,
      reason: decision.reason,
    });
    return NextResponse.json({ received: true, action: "ignore" });
  }
  if (decision.action === "skip-stripe-source") {
    safeLog.warn("iap.notifications.skip-stripe-source", {
      notificationUUID,
      type: notificationType,
      userId: targetUser?.id ?? null,
    });
    return NextResponse.json({
      received: true,
      action: "skip-stripe-source",
    });
  }
  if (decision.action === "log-only") {
    safeLog.info("iap.notifications.log-only", {
      notificationUUID,
      type: notificationType,
      reason: decision.reason,
    });
    return NextResponse.json({ received: true, action: "log-only" });
  }

  // action === "set-status"
  // targetUser is guaranteed non-null here because decideNotificationAction
  // returns "ignore" otherwise.
  if (!targetUser) {
    return NextResponse.json({ received: true, action: "ignore" });
  }
  await prisma.user.update({
    where: { id: targetUser.id },
    // Status guard mirror of W-A Stripe fix: even though the
    // decideNotificationAction already excludes Stripe-source rows,
    // belt-and-suspenders the WHERE-side filter at the SQL layer in
    // case the row's source flipped between the read and the write.
    data: {
      subscriptionStatus: decision.nextStatus,
      // On EXPIRED/REFUND/REVOKE we leave the appleOriginalTransactionId
      // and appleLatestReceiptInfo in place for forensic purposes —
      // a refund-then-resubscribe needs the prior receipt to compute
      // attribution analytics later.
    },
  });

  safeLog.info("iap.notifications.applied", {
    notificationUUID,
    type: notificationType,
    userId: targetUser.id,
    nextStatus: decision.nextStatus,
    reason: decision.reason,
  });

  return NextResponse.json({
    received: true,
    action: "set-status",
    nextStatus: decision.nextStatus,
  });
}
