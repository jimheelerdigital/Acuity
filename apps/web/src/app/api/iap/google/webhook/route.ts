/**
 * POST /api/iap/google/webhook
 *
 * Google Play Real-time Developer Notifications (RTDN), delivered via a
 * Pub/Sub PUSH subscription on projects/acuity-493914/topics/
 * play-billing-notifications. Android counterpart to the Apple
 * notifications webhook (../notifications/route.ts).
 *
 * Auth: the push subscription is configured with OIDC, so Google sends an
 * `Authorization: Bearer <JWT>` signed by accounts.google.com. We verify it
 * against Google's JWKS (issuer + audience + the push service-account email).
 * A User-writing webhook MUST fail closed — unverified calls are rejected.
 *
 * Flow: verify OIDC → parse Pub/Sub envelope → base64-decode the
 * DeveloperNotification → for a subscriptionNotification, RE-QUERY the
 * authoritative state from the Play Developer API (the RTDN only carries a
 * token + type) → set the owning User PRO/FREE. Re-querying makes processing
 * naturally idempotent (state is deterministic), and we also tombstone the
 * Pub/Sub messageId in IapNotificationLog as a second guard.
 *
 * Status guard: only rows with subscriptionSource === "google_play" are
 * modified — an apple/stripe row is never touched (mirrors the Apple webhook).
 *
 * Env: GOOGLE_PUBSUB_AUDIENCE (required — the OIDC audience configured on the
 * push subscription) + GOOGLE_PUBSUB_SA_EMAIL (optional — the push identity SA
 * email to pin).
 */
import { NextRequest, NextResponse } from "next/server";

import {
  fetchGoogleSubscription,
  readGooglePlayApiConfig,
} from "@/lib/google-iap";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PubSubPush {
  message?: { data?: unknown; messageId?: unknown; publishTime?: unknown };
  subscription?: unknown;
}

interface DeveloperNotification {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  testNotification?: { version?: string };
}

// Google subscription notificationType ints → label (for logging only; the
// authoritative access decision comes from re-querying subscriptionsv2).
const RTDN_TYPE_LABEL: Record<number, string> = {
  1: "RECOVERED",
  2: "RENEWED",
  3: "CANCELED",
  4: "PURCHASED",
  5: "ON_HOLD",
  6: "IN_GRACE_PERIOD",
  7: "RESTARTED",
  8: "PRICE_CHANGE_CONFIRMED",
  9: "DEFERRED",
  10: "PAUSED",
  11: "PAUSE_SCHEDULE_CHANGED",
  12: "REVOKED",
  13: "EXPIRED",
};

async function verifyPubSubOidc(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const authz = req.headers.get("authorization");
  if (!authz || !authz.startsWith("Bearer ")) {
    return { ok: false, reason: "missing bearer token" };
  }
  const audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
  if (!audience) {
    return { ok: false, reason: "GOOGLE_PUBSUB_AUDIENCE not configured" };
  }
  const token = authz.slice("Bearer ".length);
  const expectedEmail = process.env.GOOGLE_PUBSUB_SA_EMAIL ?? null;
  try {
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const JWKS = createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs")
    );
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    if (
      (payload as { email_verified?: unknown }).email_verified === false
    ) {
      return { ok: false, reason: "email not verified" };
    }
    if (
      expectedEmail &&
      (payload as { email?: unknown }).email !== expectedEmail
    ) {
      return { ok: false, reason: "email mismatch" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "jwt verify failed",
    };
  }
}

export async function POST(req: NextRequest) {
  // 1. Fail closed on unverified callers.
  const verified = await verifyPubSubOidc(req);
  if (!verified.ok) {
    safeLog.error(
      "iap.google-webhook.unauthorized",
      new Error(verified.reason)
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse the Pub/Sub push envelope.
  const body = (await req.json().catch(() => null)) as PubSubPush | null;
  const messageId =
    body && typeof body.message?.messageId === "string"
      ? body.message.messageId
      : null;
  const dataB64 =
    body && typeof body.message?.data === "string" ? body.message.data : null;
  if (!dataB64) {
    // Malformed (or an empty validation ping) — ack so Pub/Sub doesn't retry.
    return NextResponse.json({ received: true, noop: "no-data" });
  }

  let notification: DeveloperNotification;
  try {
    notification = JSON.parse(
      Buffer.from(dataB64, "base64").toString("utf8")
    ) as DeveloperNotification;
  } catch {
    return NextResponse.json({ received: true, noop: "bad-json" });
  }

  // Test notifications (Play Console "Send test") carry no subscription.
  if (notification.testNotification) {
    safeLog.info("iap.google-webhook.test", { messageId });
    return NextResponse.json({ received: true, test: true });
  }

  const sub = notification.subscriptionNotification;
  const purchaseToken = sub?.purchaseToken ?? null;
  const notificationType = sub?.notificationType ?? null;
  if (!purchaseToken || notificationType == null) {
    // Voided / one-time / unknown — nothing for the subscription path.
    return NextResponse.json({ received: true, noop: "no-subscription" });
  }
  const typeLabel = RTDN_TYPE_LABEL[notificationType] ?? `UNKNOWN_${notificationType}`;

  const { prisma } = await import("@/lib/prisma");

  // 3. Idempotency tombstone (Pub/Sub is at-least-once). messageId reused as
  // the notificationUUID; google labels keep it distinct from Apple UUIDs.
  if (messageId) {
    try {
      await prisma.iapNotificationLog.create({
        data: {
          notificationUUID: messageId,
          type: `google:${typeLabel}`,
          payload: notification as unknown as object,
        },
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "P2002") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      safeLog.error(
        "iap.google-webhook.tombstone-failed",
        err instanceof Error ? err : new Error(String(err)),
        { messageId, type: typeLabel }
      );
    }
  }

  // 4. Re-query the authoritative state (RTDN carries only token + type).
  let config: ReturnType<typeof readGooglePlayApiConfig>;
  try {
    config = readGooglePlayApiConfig();
  } catch (err) {
    safeLog.error(
      "iap.google-webhook.config-error",
      err instanceof Error ? err : new Error("config"),
      { messageId }
    );
    // 500 → Pub/Sub redelivers later once env is fixed.
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const result = await fetchGoogleSubscription(purchaseToken, config);
  if (!result.ok) {
    if (result.code === "TOKEN_NOT_FOUND") {
      // Token gone at Google — nothing to reconcile. Ack.
      safeLog.warn("iap.google-webhook.token-not-found", {
        messageId,
        type: typeLabel,
      });
      return NextResponse.json({ received: true, noop: "token-not-found" });
    }
    safeLog.error(
      "iap.google-webhook.requery-failed",
      new Error(result.diagnostic),
      { messageId, type: typeLabel, code: result.code }
    );
    // Transient → 502 so Pub/Sub redelivers.
    return NextResponse.json({ error: "requery failed" }, { status: 502 });
  }

  const nowMs = Date.now();
  const grantsAccess = result.info.hasAccess && result.info.expiryDate > nowMs;
  const nextStatus = grantsAccess ? "PRO" : "FREE";

  // 5. Locate the owning user. Try the current token, then the linked token
  // (Google issues a new token on resubscribe/upgrade, chaining via
  // linkedPurchaseToken).
  const candidateTokens = [purchaseToken];
  if (result.info.linkedPurchaseToken) {
    candidateTokens.push(result.info.linkedPurchaseToken);
  }
  const targetUser = await prisma.user.findFirst({
    where: { googlePurchaseToken: { in: candidateTokens } },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      googlePurchaseToken: true,
    },
  });

  if (!targetUser) {
    safeLog.warn("iap.google-webhook.no-user", { messageId, type: typeLabel });
    return NextResponse.json({ received: true, noop: "no-user" });
  }

  // Status guard: only touch google_play rows.
  if (targetUser.subscriptionSource !== "google_play") {
    safeLog.warn("iap.google-webhook.skip-non-google-source", {
      messageId,
      type: typeLabel,
      userId: targetUser.id,
      source: targetUser.subscriptionSource,
    });
    return NextResponse.json({ received: true, action: "skip-source" });
  }

  if (targetUser.subscriptionStatus === nextStatus) {
    // No-op — already in the target state (idempotent re-delivery / renewal
    // that didn't change access).
    return NextResponse.json({ received: true, action: "noop", nextStatus });
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      subscriptionStatus: nextStatus,
      // Keep the token current (handles resubscribe token migration).
      googlePurchaseToken: purchaseToken,
      googleProductId: result.info.productId,
      googleLatestReceiptInfo: result.info.rawPayload as unknown as object,
    },
  });

  safeLog.info("iap.google-webhook.applied", {
    messageId,
    type: typeLabel,
    userId: targetUser.id,
    nextStatus,
    state: result.info.state,
  });

  return NextResponse.json({ received: true, action: "set-status", nextStatus });
}
