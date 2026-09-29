import { NextRequest, NextResponse } from "next/server";

/**
 * RevenueCat webhook receiver.
 *
 * ⚠️ FULLY IMPLEMENTED, DELIBERATELY INERT.
 *
 * With `RC_SOURCE_OF_TRUTH` off (the default, and its state in every
 * environment today) this endpoint:
 *   - still verifies the Authorization header,
 *   - still parses the event,
 *   - still computes the FULL decision it *would* apply,
 *   - logs that decision,
 *   - and WRITES NOTHING.
 *
 * That is the point of observer mode: we get to compare RC's opinion against
 * the DB on real production traffic, for as long as we like, before RC is
 * allowed to change anything. `safeLog` output from `revenuecat.webhook.observed`
 * is the data set that proves the mapping is right.
 *
 * When the flag goes on, the same decision starts being applied — no code
 * path changes, which is why the observation is meaningful.
 *
 * Existing Stripe / Apple / Google handlers stay live and authoritative
 * throughout. Nothing here disables them.
 */

import { rcCredentials, rcFlags } from "@/lib/revenuecat/flags";
import { fetchRcEntitlementState } from "@/lib/revenuecat/client";
import {
  candidateUserIds,
  decideRcWebhookAction,
  decideTransferResync,
  rcDecisionToUpdateData,
  transferUserIds,
  type RcWebhookBody,
  type RcWebhookEvent,
} from "@/lib/revenuecat/webhook-events";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
// Node runtime: we do a timing-safe header comparison with node:crypto and
// (once live) Prisma writes. Pinning it means a future Next.js default flip
// can't silently move us to Edge. Mirrors the Stripe webhook's rationale.
export const runtime = "nodejs";

/**
 * Constant-time comparison of the webhook's Authorization header against the
 * configured secret.
 *
 * A plain `===` on a secret is a timing oracle: an attacker can discover the
 * value byte-by-byte from response-latency differences. The Stripe path gets
 * this for free inside `stripe.webhooks.constructEvent`; RC hands us a raw
 * shared secret, so we have to do it ourselves.
 */
async function authorized(header: string | null): Promise<boolean> {
  const { webhookAuth } = rcCredentials();
  // No secret configured → reject everything. Fail closed: an unauthenticated
  // billing webhook is strictly worse than a missed one.
  if (!webhookAuth) return false;
  if (!header) return false;

  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(header);
  const b = Buffer.from(webhookAuth);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Compare a fixed-size digest instead so every input costs the same.
  const { createHash } = await import("node:crypto");
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const flags = rcFlags();

  // Top-of-handler log BEFORE auth, so Vercel logs prove RC is reaching us
  // at all. Learned from the 38-day Stripe webhook silence (2026-06-01).
  safeLog.info("revenuecat.webhook.received", {
    sourceOfTruth: flags.RC_SOURCE_OF_TRUTH,
    observer: flags.RC_OBSERVER,
  });

  if (!(await authorized(req.headers.get("authorization")))) {
    safeLog.warn("revenuecat.webhook.unauthorized", {
      hasSecret: Boolean(rcCredentials().webhookAuth),
    });
    // Opaque body — never hint at whether the secret is unset vs wrong.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RcWebhookBody;
  try {
    body = (await req.json()) as RcWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event: RcWebhookEvent | undefined = body.event;
  if (!event || typeof event.type !== "string") {
    safeLog.warn("revenuecat.webhook.malformed", { hasEvent: Boolean(event) });
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  const appUserId = event.app_user_id ?? event.original_app_user_id ?? null;

  // ── Observer mode: decide, log, write nothing ──────────────────────
  if (!flags.RC_SOURCE_OF_TRUTH) {
    // Resolve the user READ-ONLY so the logged decision is the real one we
    // would have applied — an observation that skipped the user lookup
    // wouldn't tell us anything about correctness.
    let user = null;
    try {
      user = await loadUser(event);
    } catch (err) {
      safeLog.warn("revenuecat.webhook.observe-user-lookup-failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    const decision = decideRcWebhookAction(event, user);

    safeLog.info("revenuecat.webhook.observed", {
      eventId: event.id ?? null,
      type: event.type,
      appUserId,
      store: event.store ?? null,
      environment: event.environment ?? null,
      periodType: event.period_type ?? null,
      // What we WOULD do, and what the DB says right now — the parity signal.
      wouldAction: decision.action,
      wouldStatus:
        decision.action === "set-status" ? decision.nextStatus : null,
      wouldSource: decision.action === "set-status" ? decision.source : null,
      dbStatus: user?.subscriptionStatus ?? null,
      dbSource: user?.subscriptionSource ?? null,
      agrees:
        decision.action === "set-status" && user
          ? decision.nextStatus === user.subscriptionStatus
          : null,
      reason: decision.reason,
    });

    return NextResponse.json({
      received: true,
      mode: "observer",
      applied: false,
      wouldAction: decision.action,
    });
  }

  // ── Source-of-truth mode: apply ───────────────────────────────────
  // Everything below runs ONLY when the flag is on. Requires the
  // RevenueCatEvent table (prisma db push) — see docs/REVENUECAT_MIGRATION.md.
  const { prisma } = await import("@/lib/prisma");

  // Idempotency: RC retries deliveries. Claim the event id FIRST so a
  // double-delivery in flight can't double-write. Same pattern + ordering as
  // the Stripe handler's StripeEvent row.
  if (event.id) {
    try {
      await prisma.revenueCatEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        safeLog.info("revenuecat.webhook.duplicate", { id: event.id });
        return NextResponse.json({ received: true, duplicate: true });
      }
      safeLog.error("revenuecat.webhook.dedup-write-failed", err, {
        id: event.id,
        type: event.type,
      });
      // Fall through — a dedup bookkeeping failure must not drop a real event.
    }
  }

  // TRANSFER moves a store subscription between app accounts. The event alone
  // doesn't say where each side should land, so re-read RC (the source of
  // truth) for every affected account and write that.
  if ((event.type ?? "").trim().toUpperCase() === "TRANSFER") {
    return applyTransferResync(event);
  }

  const user = await loadUser(event);
  const decision = decideRcWebhookAction(event, user);

  if (decision.action !== "set-status") {
    safeLog.info(`revenuecat.webhook.${decision.action}`, {
      eventId: event.id ?? null,
      type: event.type,
      appUserId,
      userId: user?.id ?? null,
      reason: decision.reason,
    });
    return NextResponse.json({
      received: true,
      action: decision.action,
      reason: decision.reason,
    });
  }

  // user is non-null here: decideRcWebhookAction returns "ignore" otherwise.
  if (!user) {
    return NextResponse.json({ received: true, action: "ignore" });
  }

  const data = rcDecisionToUpdateData(decision);

  try {
    // Re-assert the comp guard at the SQL layer as well as in the decision.
    // Belt-and-suspenders against the row's source flipping between the read
    // and the write — the same defensive pattern the Apple notification
    // handler documents.
    const res = await prisma.user.updateMany({
      where:
        decision.nextStatus === "FREE"
          ? { id: user.id, subscriptionSource: { not: "comp" } }
          : { id: user.id },
      data,
    });

    if (res.count === 0) {
      safeLog.warn("revenuecat.webhook.guard-matched-zero", {
        eventId: event.id ?? null,
        type: event.type,
        userId: user.id,
        nextStatus: decision.nextStatus,
        reason: "source changed between read and write (likely comp)",
      });
      return NextResponse.json({ received: true, action: "guarded-noop" });
    }
  } catch (err) {
    safeLog.error("revenuecat.webhook.update-failed", err, {
      eventId: event.id ?? null,
      type: event.type,
      userId: user.id,
      nextStatus: decision.nextStatus,
    });
    // 500 so RC retries. Our dedup row is already written, so a retry would
    // be swallowed as a duplicate — remove it first, mirroring the Stripe
    // checkout-session recovery.
    if (event.id) {
      try {
        await prisma.revenueCatEvent.delete({ where: { id: event.id } });
      } catch {
        /* best effort — a stuck dedup row is visible in the logs above */
      }
    }
    return NextResponse.json({ error: "update-failed" }, { status: 500 });
  }

  safeLog.info("revenuecat.webhook.applied", {
    eventId: event.id ?? null,
    type: event.type,
    userId: user.id,
    nextStatus: decision.nextStatus,
    source: decision.source,
    reason: decision.reason,
  });

  return NextResponse.json({
    received: true,
    action: "set-status",
    nextStatus: decision.nextStatus,
  });
}

/**
 * Resolve an RC event to a User row, across RC aliases.
 *
 * `Purchases.logIn(user.id)` makes our id an alias of the RC customer, but a
 * customer that started anonymous (onboarding paywall, purchase before
 * account) keeps `$RCAnonymousID:…` as its primary id — so events can arrive
 * with that as `app_user_id` and our id only in `aliases`. We try every real
 * id on the event in preference order (see `candidateUserIds`).
 */
async function loadUser(event: RcWebhookEvent) {
  const ids = candidateUserIds(event);
  if (ids.length === 0) return null;
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, subscriptionStatus: true, subscriptionSource: true },
  });
  for (const id of ids) {
    const hit = rows.find((r) => r.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Apply a TRANSFER by re-syncing every affected account from RC's current
 * state. Decision per user lives in `decideTransferResync` (pure, tested).
 */
async function applyTransferResync(event: RcWebhookEvent): Promise<NextResponse> {
  const { prisma } = await import("@/lib/prisma");
  const ids = transferUserIds(event);
  const users =
    ids.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, subscriptionStatus: true, subscriptionSource: true },
        });

  const results: Array<Record<string, unknown>> = [];
  try {
    for (const u of users) {
      const rc = await fetchRcEntitlementState(u.id);
      const d = decideTransferResync(u, rc);
      if (d.action !== "set-status") {
        results.push({ userId: u.id, action: d.action, reason: d.reason });
        continue;
      }
      const res = await prisma.user.updateMany({
        where:
          d.nextStatus === "FREE"
            ? { id: u.id, subscriptionSource: { not: "comp" } }
            : { id: u.id },
        data: rcDecisionToUpdateData(d),
      });
      results.push({
        userId: u.id,
        action: res.count > 0 ? "set-status" : "guarded-noop",
        nextStatus: d.nextStatus,
        reason: d.reason,
      });
    }
  } catch (err) {
    safeLog.error("revenuecat.webhook.transfer-resync-failed", err, {
      eventId: event.id ?? null,
    });
    // 500 so RC retries; drop the dedup row first or the retry is swallowed.
    if (event.id) {
      try {
        await prisma.revenueCatEvent.delete({ where: { id: event.id } });
      } catch {
        /* best effort */
      }
    }
    return NextResponse.json({ error: "transfer-resync-failed" }, { status: 500 });
  }

  safeLog.info("revenuecat.webhook.transfer-resynced", {
    eventId: event.id ?? null,
    ids,
    matched: users.length,
    results,
  });
  return NextResponse.json({ received: true, action: "transfer-resync", results });
}
