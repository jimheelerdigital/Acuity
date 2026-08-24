/**
 * Stripe webhook health — shared core for the `stripe-webhook-health-check`
 * Inngest cron.
 *
 * ## Why this exists in this shape
 *
 * The original check (2026-06-12, after the 7-week silent-outage incident)
 * alerted whenever no `StripeEvent` had been processed in 24h. That is a
 * proxy for "the pipe is broken" that only holds for an app with daily
 * subscription activity. Ripple has ~15 Stripe subscribers, so multi-day
 * silence is the NORMAL state — measured over the 90 days to 2026-08-24 the
 * ledger had **13 quiet gaps longer than 24h, the longest 53.5h**, which
 * would have emitted roughly **28 "webhook DOWN" emails**, every one of them
 * false. An alert that is wrong 28 times out of 28 trains its recipients to
 * delete it, which is strictly worse than no alert at all.
 *
 * So quiet is no longer evidence. This module asks Stripe what Stripe
 * actually knows, and only reports a failure when Stripe itself says
 * something is wrong:
 *
 *   1. **Endpoint config** — missing / disabled / pointing somewhere other
 *      than our apex URL. This is the exact 2026-06-12 failure and it is
 *      observable directly, no inference needed.
 *   2. **Delivery failure** — `events.list({ delivery_success: false })`:
 *      events Stripe has failed to deliver, or is still retrying past our
 *      grace window.
 *   3. **Ingestion gap** — events Stripe recorded that never reached our
 *      `StripeEvent` ledger. Catches everything a delivery-side check
 *      cannot: signature mismatches, a 200-but-crashed handler, a DB write
 *      that silently failed.
 *   4. **Quiet + confirmed activity** (the retained time-based fallback) —
 *      nothing ingested in >72h AND Stripe reports events in that window.
 *      72h is deliberately above the 53.5h observed maximum; over the same
 *      90-day sample it would have fired **zero** times on its own.
 *
 * Quiet with Stripe *also* reporting nothing is a HEALTHY result. That is
 * the false alarm this module is here to stop sending.
 *
 * `assessWebhookHealth` is pure and unit-tested; `collectWebhookHealthSignals`
 * does the live Stripe + Prisma reads. Same split as `lib/entitlement-drift`.
 *
 * See docs/incidents/2026-06-12-stripe-webhook-down.md.
 */

import { stripe } from "@/lib/stripe";

/** Path of our receiver. The host must be the apex — see the incident doc. */
export const WEBHOOK_PATH = "/api/stripe/webhook";
/** The apex URL the endpoint is expected to point at. */
export const EXPECTED_WEBHOOK_URL = `https://goripple.io${WEBHOOK_PATH}`;

/**
 * Event types the receiver is registered for. Used only as a fallback when
 * the live endpoint's `enabled_events` cannot be read — the live list wins,
 * so adding a type in the Stripe dashboard cannot silently fall out of the
 * gap check.
 */
export const FALLBACK_SUBSCRIBED_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

/** How far back to ask Stripe for events. */
export const LOOKBACK_MS = 72 * 60 * 60 * 1000;

/**
 * An event younger than this is not yet evidence of anything: Stripe may
 * still be mid-retry, and our own handler may be in flight. Only events
 * older than the grace window count toward a delivery/ingestion finding.
 */
export const DELIVERY_GRACE_MS = 60 * 60 * 1000;

/**
 * Quiet-fallback threshold. Above the 53.5h longest legitimate gap observed
 * in the 90 days to 2026-08-24, and it still requires Stripe-side
 * confirmation before it can alert.
 */
export const QUIET_THRESHOLD_MS = 72 * 60 * 60 * 1000;

export type WebhookFindingKind =
  | "endpoint_missing"
  | "endpoint_disabled"
  | "endpoint_url_mismatch"
  | "delivery_failure"
  | "ingestion_gap"
  | "quiet_with_stripe_activity";

export interface WebhookFinding {
  kind: WebhookFindingKind;
  detail: string;
  /** Stripe event ids evidencing the finding, when it is event-scoped. */
  eventIds?: string[];
}

export interface StripeEventSummary {
  id: string;
  type: string;
  /** Stripe's `created`, in SECONDS (as the API returns it). */
  created: number;
}

export interface WebhookHealthInput {
  /** Wall clock, ms. Injected so the assessment is deterministic in tests. */
  now: number;
  /** Our endpoint as Stripe currently has it, or null if no match exists. */
  endpoint: { id: string; status: string; url: string } | null;
  /** `max(StripeEvent.processedAt)`, ms, or null if the ledger is empty. */
  lastProcessedAt: number | null;
  /** Events Stripe created in the lookback window, for our subscribed types. */
  stripeEvents: StripeEventSummary[];
  /** Ids from `stripeEvents` that ARE present in our `StripeEvent` ledger. */
  ingestedIds: Set<string>;
  /** Ids Stripe reports as not successfully delivered (`delivery_success:false`). */
  undeliveredIds: Set<string>;
}

export interface WebhookHealthVerdict {
  healthy: boolean;
  findings: WebhookFinding[];
  /** Hours since our last ingested event; null when the ledger is empty. */
  quietHours: number | null;
  /** Events Stripe recorded in the window (all ages). */
  stripeEventCount: number;
  /** Of those, how many are older than the grace window. */
  agedEventCount: number;
  /** One-line human summary, used as the alert subject/preamble. */
  summary: string;
}

function ageHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10;
}

/**
 * Pure health assessment. Returns `healthy: true` for a quiet-but-working
 * pipe — the whole point of the 2026-08-24 rewrite.
 */
export function assessWebhookHealth(
  input: WebhookHealthInput
): WebhookHealthVerdict {
  const { now, endpoint, lastProcessedAt, stripeEvents, ingestedIds, undeliveredIds } =
    input;

  const findings: WebhookFinding[] = [];

  // ── 1. Endpoint configuration ──────────────────────────────────────────
  if (!endpoint) {
    findings.push({
      kind: "endpoint_missing",
      detail: `No Stripe webhook endpoint matches ${WEBHOOK_PATH}. Nothing is registered to receive subscription events.`,
    });
  } else {
    if (endpoint.status !== "enabled") {
      findings.push({
        kind: "endpoint_disabled",
        detail: `Endpoint ${endpoint.id} status is "${endpoint.status}" (expected "enabled"). This is the 2026-06-12 failure mode — Stripe auto-disables an endpoint after sustained delivery failures.`,
      });
    }
    if (endpoint.url !== EXPECTED_WEBHOOK_URL) {
      findings.push({
        kind: "endpoint_url_mismatch",
        detail: `Endpoint ${endpoint.id} points at ${endpoint.url}, expected ${EXPECTED_WEBHOOK_URL}. A www host 308-redirects and Stripe does not follow redirects.`,
      });
    }
  }

  // ── 2/3. Per-event delivery + ingestion, aged past the grace window ────
  const graceCutoffSec = (now - DELIVERY_GRACE_MS) / 1000;
  const aged = stripeEvents.filter((e) => e.created <= graceCutoffSec);

  // `delivery_success` is account-wide across every destination, so an event
  // we DID ingest is not our failure even when Stripe reports it undelivered
  // (it would belong to some other endpoint). Only uningested ones count.
  const undelivered = aged.filter(
    (e) => undeliveredIds.has(e.id) && !ingestedIds.has(e.id)
  );
  if (undelivered.length > 0) {
    findings.push({
      kind: "delivery_failure",
      detail: `Stripe reports ${undelivered.length} event(s) it has not successfully delivered, none of which reached us: ${undelivered
        .map((e) => `${e.id} (${e.type})`)
        .join(", ")}.`,
      eventIds: undelivered.map((e) => e.id),
    });
  }

  // Anything Stripe recorded that never landed in our ledger. Superset of the
  // delivery failures above, so exclude those to keep the two findings
  // describing different things.
  const undeliveredSet = new Set(undelivered.map((e) => e.id));
  const missing = aged.filter(
    (e) => !ingestedIds.has(e.id) && !undeliveredSet.has(e.id)
  );
  if (missing.length > 0) {
    findings.push({
      kind: "ingestion_gap",
      detail: `${missing.length} event(s) Stripe considers delivered never reached our StripeEvent ledger: ${missing
        .map((e) => `${e.id} (${e.type})`)
        .join(", ")}. Suspect signature verification, a handler crash, or a failed ledger write.`,
      eventIds: missing.map((e) => e.id),
    });
  }

  // ── 4. Quiet fallback — only with Stripe-side confirmation ─────────────
  const quietMs = lastProcessedAt == null ? null : now - lastProcessedAt;
  const quietHours = quietMs == null ? null : ageHours(quietMs);
  const quietPastThreshold = quietMs == null || quietMs > QUIET_THRESHOLD_MS;

  if (quietPastThreshold && aged.length > 0 && findings.length === 0) {
    // Every aged event is accounted for individually above, yet we have
    // ingested nothing in 72h+. Contradictory — surface it rather than
    // assume the per-event checks were exhaustive.
    findings.push({
      kind: "quiet_with_stripe_activity",
      detail:
        lastProcessedAt == null
          ? `No Stripe event has ever been ingested, but Stripe recorded ${aged.length} event(s) in the last 72h.`
          : `Nothing ingested in ${quietHours}h (>72h threshold) while Stripe recorded ${aged.length} event(s) in that window.`,
    });
  }

  const healthy = findings.length === 0;
  const quietLabel =
    quietHours == null ? "ledger empty" : `last ingest ${quietHours}h ago`;
  const agedIngested = aged.filter((e) => ingestedIds.has(e.id)).length;

  const summary = healthy
    ? `Healthy — endpoint enabled at the apex URL, ${agedIngested}/${aged.length} aged Stripe event(s) ingested, no delivery failures (${quietLabel}${
        quietPastThreshold && aged.length === 0
          ? "; quiet, and Stripe has nothing to deliver — expected at this subscriber count"
          : ""
      }).`
    : `${findings.length} finding(s): ${findings.map((f) => f.kind).join(", ")} (${quietLabel}).`;

  return {
    healthy,
    findings,
    quietHours,
    stripeEventCount: stripeEvents.length,
    agedEventCount: aged.length,
    summary,
  };
}

/**
 * Live reads: Stripe endpoint config, Stripe's event log, and our ledger.
 *
 * Throws if Stripe is unreadable. The caller treats that as an operational
 * error to log — NOT as "the webhook is down", because an unreadable Stripe
 * is exactly the kind of inference that produced the false alarms.
 */
export async function collectWebhookHealthSignals(
  now = Date.now()
): Promise<WebhookHealthInput> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const match =
    endpoints.data.find((e) => {
      try {
        return new URL(e.url).pathname === WEBHOOK_PATH;
      } catch {
        return false;
      }
    }) ?? null;

  const endpoint = match
    ? { id: match.id, status: match.status, url: match.url }
    : null;

  // Prefer the live subscription list so a dashboard change can't leave the
  // gap check blind to a type it doesn't know about.
  const liveTypes = match?.enabled_events ?? [];
  const wildcard = liveTypes.includes("*");
  const types = wildcard
    ? undefined
    : liveTypes.length > 0
      ? liveTypes.slice(0, 20)
      : [...FALLBACK_SUBSCRIBED_TYPES];

  const createdGte = Math.floor((now - LOOKBACK_MS) / 1000);

  const [all, undelivered] = await Promise.all([
    stripe.events
      .list({ created: { gte: createdGte }, ...(types ? { types } : {}), limit: 100 })
      .autoPagingToArray({ limit: 500 }),
    stripe.events
      .list({
        created: { gte: createdGte },
        delivery_success: false,
        ...(types ? { types } : {}),
        limit: 100,
      })
      .autoPagingToArray({ limit: 500 }),
  ]);

  const stripeEvents: StripeEventSummary[] = all.map((e) => ({
    id: e.id,
    type: e.type,
    created: e.created,
  }));

  const { prisma } = await import("@/lib/prisma");
  const [rows, agg] = await Promise.all([
    stripeEvents.length > 0
      ? prisma.stripeEvent.findMany({
          where: { id: { in: stripeEvents.map((e) => e.id) } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    prisma.stripeEvent.aggregate({ _max: { processedAt: true } }),
  ]);

  return {
    now,
    endpoint,
    lastProcessedAt: agg._max.processedAt?.getTime() ?? null,
    stripeEvents,
    ingestedIds: new Set(rows.map((r) => r.id)),
    undeliveredIds: new Set(undelivered.map((e) => e.id)),
  };
}
