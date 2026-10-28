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
import type { EntitlementState } from "@/lib/entitlements/resolve";
import {
  candidateUserIds,
  decideRcWebhookAction,
  decideTransferResync,
  isRcBillingStore,
  rcDecisionToUpdateData,
  redemptionEffectEvent,
  redemptionUserIds,
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

  // Creator commission ledger (2026-10-22). Independent of observer /
  // source-of-truth mode: writes ONLY creator tables, App Store + Play Store
  // events only (web money comes from the Stripe webhook), never throws.
  try {
    const { handleRevenueCatEventForCreators } = await import("@/lib/creators/providers");
    await handleRevenueCatEventForCreators(event as Parameters<typeof handleRevenueCatEventForCreators>[0]);
  } catch (err) {
    safeLog.warn("revenuecat.webhook.creator-ledger-failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

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

  // PURCHASE_REDEEMED: a RevenueCat Web Billing purchase (Purchase Link /
  // Funnel / our own checkout) linked to an app user via a redemption link.
  // No app_user_id on the event — re-sync the redeemer + purchaser from RC.
  // Scoped to RC_BILLING so other stores' redemptions keep today's handling
  // (logged and ignored below: no app_user_id → no User row).
  if (
    (event.type ?? "").trim().toUpperCase() === "PURCHASE_REDEEMED" &&
    isRcBillingStore(event)
  ) {
    return applyRedemption(event);
  }

  const user = await loadUser(event);
  const decision = decideRcWebhookAction(event, user);

  // App Store / Play trial cancelled (2026-10-28, per Keenan): the same "why
  // wasn't Ripple for you?" note the web gets. Runs whatever the status decision.
  if (user) await storeTrialCancelledEmail(event, user.id);

  if (decision.action !== "set-status") {
    if (user) await webBillingEffects(event, user.id);
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

  // Web Billing purchase/renewal side effects (analytics, Meta CAPI, founder
  // email, referral, trial reminder). After the write so a failed write's
  // retry can't run them twice — the dedup row makes them once-per-event.
  await webBillingEffects(event, user.id);
  await storePurchaseFounderEmail(event, user.id);

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
 * Founder email for App Store / Play purchases made through the RevenueCat
 * SDK (2026-10-22, per Keenan: an App Store paid trial from a UGC ad sent no
 * "conversion" email). App 1.9+ buys through RC, so these never hit
 * /api/iap/verify-receipt (the old path that emailed). Once per event (the
 * RevenueCatEvent dedup row above). Skips sandbox, and skips accounts the old
 * receipt path already handled (appleOriginalTransactionId set), so a
 * mirrored pre-1.9 purchase never emails twice. Never throws.
 */
/**
 * CANCELLATION of an App Store / Play subscription still in its free trial,
 * by the customer (cancel_reason UNSUBSCRIBE; not billing errors or refunds).
 * Sends trial_cancelled once per user (sendTrialEmail dedupes). Never throws.
 */
async function storeTrialCancelledEmail(event: RcWebhookEvent, userId: string): Promise<void> {
  try {
    if ((event.type ?? "").trim().toUpperCase() !== "CANCELLATION") return;
    const store = (event.store ?? "").toUpperCase();
    if (store !== "APP_STORE" && store !== "PLAY_STORE") return;
    if ((event.environment ?? "").toUpperCase() === "SANDBOX") return;
    if ((event.period_type ?? "").toUpperCase() !== "TRIAL") return;
    if ((event.cancel_reason ?? "").toUpperCase() !== "UNSUBSCRIBE") return;
    const { sendTrialEmail } = await import("@/lib/trial-emails");
    await sendTrialEmail(userId, "trial_cancelled", { replyTo: "keenan@heelerdigital.com" });
  } catch (err) {
    safeLog.warn("revenuecat.webhook.trial-cancelled-email-failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

async function storePurchaseFounderEmail(event: RcWebhookEvent, userId: string): Promise<void> {
  try {
    const type = (event.type ?? "").trim().toUpperCase();
    // INITIAL_PURCHASE = trial start / purchase; RENEWAL with
    // is_trial_conversion = the first real charge after the free trial.
    const converted = type === "RENEWAL" && event.is_trial_conversion === true;
    if (type !== "INITIAL_PURCHASE" && !converted) return;
    const store = (event.store ?? "").toUpperCase();
    if (store !== "APP_STORE" && store !== "PLAY_STORE") return;
    if ((event.environment ?? "").toUpperCase() === "SANDBOX") return;
    const { prisma } = await import("@/lib/prisma");
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, appleOriginalTransactionId: true } });
    if (!u || (!converted && u.appleOriginalTransactionId)) return;
    const trial = (event.period_type ?? "").toUpperCase() === "TRIAL";
    const prefix = store === "APP_STORE" ? "app_store" : "play_store";
    if (converted) {
      // For the end-of-day summary (lib/founder-daily-summary.ts).
      await prisma.onboardingEvent.create({ data: { userId, event: "trial_converted", value: prefix } }).catch(() => {});
    }
    const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
    await notifyFoundersOfPayment({
      userId,
      email: u.email ?? "unknown",
      plan: /annual|year/i.test(event.product_id ?? "") ? "yearly" : "monthly",
      source: converted ? `${prefix}_trial_converted` : `${prefix}_${trial ? "trial" : "purchase"}`,
      timestamp: new Date(),
    });
  } catch (err) {
    safeLog.warn("revenuecat.webhook.founder-email-failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * RevenueCat Web Billing side effects — what the Stripe webhook does on
 * checkout.session.completed / renewal invoices, for purchases RevenueCat
 * bills itself. No-op for every other store. Never throws.
 */
async function webBillingEffects(event: RcWebhookEvent, userId: string): Promise<void> {
  try {
    const { rcWebBillingEffectFor, runRcWebBillingEffects } = await import(
      "@/lib/revenuecat/web-billing-effects"
    );
    if (!rcWebBillingEffectFor(event)) return;
    await runRcWebBillingEffects(event, userId);
  } catch (err) {
    safeLog.warn("revenuecat.webhook.web-billing-effects-failed", {
      eventId: event.id ?? null,
      err: err instanceof Error ? err.message : String(err),
    });
  }
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
 * Re-sync a set of User rows from RC's CURRENT state (TRANSFER and
 * PURCHASE_REDEEMED). Ids that match no User row — $RCAnonymousID purchasers
 * are already dropped, and a Purchase Link / Funnel id that isn't ours just
 * finds nothing — are skipped, never guessed at. Decision per user lives in
 * `decideTransferResync` (pure, tested).
 *
 * Throws on a DB / RC failure so the caller can 500 (RC retries).
 */
async function resyncUsersFromRc(
  ids: string[],
  ctx: { rcBillingMove: boolean }
): Promise<{
  results: Array<Record<string, unknown>>;
  synced: Array<{ id: string; before: string; rc: EntitlementState | null }>;
}> {
  const { prisma } = await import("@/lib/prisma");
  const users =
    ids.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            subscriptionStatus: true,
            subscriptionSource: true,
            stripeSubscriptionId: true,
          },
        });

  const results: Array<Record<string, unknown>> = [];
  const synced: Array<{ id: string; before: string; rc: EntitlementState | null }> = [];
  for (const u of users) {
    const rc = await fetchRcEntitlementState(u.id);
    const stripeDirectLive =
      ctx.rcBillingMove && u.subscriptionSource === "stripe"
        ? await hasLiveStripeDirectSub(u.stripeSubscriptionId)
        : undefined;
    const d = decideTransferResync(u, rc, { rcBillingMove: ctx.rcBillingMove, stripeDirectLive });
    synced.push({ id: u.id, before: u.subscriptionStatus, rc });
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
  return { results, synced };
}

/**
 * Does this row still have a live Stripe-direct subscription? Only asked for
 * a "stripe" row when RC moved a Web Billing purchase. No id → false. Stripe
 * unreachable → undefined, which the decision treats as live (never demote a
 * possible Stripe payer on a guess). `stripeSubscriptionId` alone is not
 * enough: production has FREE rows with stale ids (2026-10-16: 19 of them).
 */
async function hasLiveStripeDirectSub(
  stripeSubscriptionId: string | null
): Promise<boolean | undefined> {
  if (!stripeSubscriptionId) return false;
  try {
    const { stripe } = await import("@/lib/stripe");
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    return ["trialing", "active", "past_due", "unpaid"].includes(sub.status);
  } catch (err) {
    safeLog.warn("revenuecat.webhook.stripe-liveness-unknown", {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/** Drop the dedup row so RC's retry of a failed event isn't swallowed. */
async function releaseDedup(event: RcWebhookEvent): Promise<void> {
  if (!event.id) return;
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.revenueCatEvent.delete({ where: { id: event.id } });
  } catch {
    /* best effort — a stuck dedup row is visible in the logs */
  }
}

/** Apply a TRANSFER by re-syncing every affected account from RC. */
async function applyTransferResync(event: RcWebhookEvent): Promise<NextResponse> {
  const ids = transferUserIds(event);
  let out: Awaited<ReturnType<typeof resyncUsersFromRc>>;
  try {
    out = await resyncUsersFromRc(ids, { rcBillingMove: isRcBillingStore(event) });
  } catch (err) {
    safeLog.error("revenuecat.webhook.transfer-resync-failed", err, {
      eventId: event.id ?? null,
    });
    await releaseDedup(event);
    return NextResponse.json({ error: "transfer-resync-failed" }, { status: 500 });
  }

  safeLog.info("revenuecat.webhook.transfer-resynced", {
    eventId: event.id ?? null,
    ids,
    matched: out.synced.length,
    results: out.results,
  });
  return NextResponse.json({ received: true, action: "transfer-resync", results: out.results });
}

/**
 * Apply a PURCHASE_REDEEMED: a web purchase was linked to an app user via a
 * RevenueCat redemption link (outcome alias / transfer / redeemer_owns).
 *
 *  1. Re-sync the redeemer and the purchaser from RC, so the DB (which SSR
 *     pages read directly) matches RC's entitlement right away instead of
 *     at the next renewal. For outcome "transfer", RC also sends a TRANSFER
 *     event; both re-syncs are idempotent.
 *  2. First attribution: a Web Billing purchase made while the purchaser was
 *     NOT one of our users (RevenueCat Purchase Link / Funnel, anonymous
 *     $RCAnonymousID) never ran the new-subscription side effects — its
 *     INITIAL_PURCHASE matched no User row. Run them now, once (the event's
 *     dedup row), for the redeemer RC now entitles. If the purchaser WAS one
 *     of our users, its INITIAL_PURCHASE already ran them: skip.
 */
async function applyRedemption(event: RcWebhookEvent): Promise<NextResponse> {
  const { redeemers, purchasers, all } = redemptionUserIds(event);
  const outcome = (event.redemption_outcome ?? "").trim().toLowerCase();
  const rcBilling = isRcBillingStore(event);

  let out: Awaited<ReturnType<typeof resyncUsersFromRc>>;
  try {
    out = await resyncUsersFromRc(all, { rcBillingMove: rcBilling && outcome === "transfer" });
  } catch (err) {
    safeLog.error("revenuecat.webhook.redemption-resync-failed", err, {
      eventId: event.id ?? null,
    });
    await releaseDedup(event);
    return NextResponse.json({ error: "redemption-resync-failed" }, { status: 500 });
  }

  let attributedTo: string | null = null;
  const purchaserWasOurs = out.synced.some((s) => purchasers.includes(s.id));
  if (rcBilling && (outcome === "alias" || outcome === "transfer") && !purchaserWasOurs) {
    const redeemer = out.synced.find((s) => redeemers.includes(s.id));
    const effectEvent = redeemer ? redemptionEffectEvent(event, redeemer.rc) : null;
    if (redeemer && effectEvent) {
      await webBillingEffects(effectEvent, redeemer.id);
      attributedTo = redeemer.id;
    }
  }

  safeLog.info("revenuecat.webhook.redemption-resynced", {
    eventId: event.id ?? null,
    outcome: outcome || null,
    store: event.store ?? null,
    ids: all,
    matched: out.synced.length,
    attributedTo,
    results: out.results,
  });
  return NextResponse.json({
    received: true,
    action: "redemption-resync",
    attributed: attributedTo !== null,
    results: out.results,
  });
}
