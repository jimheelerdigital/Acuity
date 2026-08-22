import "server-only";

/**
 * RevenueCat REST client (read-only) + the pure subscriber→state mapping.
 *
 * Two responsibilities, deliberately separated so the interesting half is
 * testable without a network:
 *
 *   1. `mapRcSubscriberToState` — PURE. Given RC's subscriber payload,
 *      produce the same EntitlementState shape our DB produces. Unit-tested
 *      exhaustively; this is where a mistake would mis-grant access.
 *   2. `fetchRcSubscriber` / `fetchRcEntitlementState` — the HTTP call.
 *      Returns null (never throws upward as a demotion) when RC has no
 *      record or we have no credentials.
 *
 * Inert today: RC_SECRET_KEY is unset in every environment, so
 * `fetchRcSubscriber` short-circuits to null and every caller falls back to
 * the DB. Nothing here can affect a live user until the key exists AND
 * RC_SOURCE_OF_TRUTH is on.
 */

import { RC_ENTITLEMENT_PRO, rcStoreToSource } from "@acuity/shared";

import { rcCredentials } from "@/lib/revenuecat/flags";
import type { EntitlementState } from "@/lib/entitlements/resolve";
import { safeLog } from "@/lib/safe-log";

const RC_API_BASE = "https://api.revenuecat.com/v1";

// ─── RC payload shapes (only the fields we consume) ───────────────────

export interface RcEntitlement {
  /** ISO8601, or null for a non-expiring (lifetime) entitlement. */
  expires_date?: string | null;
  purchase_date?: string | null;
  product_identifier?: string | null;
}

export interface RcSubscription {
  /** ISO8601 */
  expires_date?: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  /** "normal" | "trial" | "intro" | "promotional" */
  period_type?: string | null;
  /** APP_STORE | PLAY_STORE | STRIPE | PROMOTIONAL | … */
  store?: string | null;
  /** Set by RC when the store reports a billing problem. ISO8601 or null. */
  billing_issues_detected_at?: string | null;
  /** Set when the user turned off auto-renew. ISO8601 or null. */
  unsubscribe_detected_at?: string | null;
  grace_period_expires_date?: string | null;
}

export interface RcSubscriber {
  original_app_user_id?: string;
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
}

export interface RcSubscriberResponse {
  subscriber?: RcSubscriber;
}

// ─── Pure mapping ────────────────────────────────────────────────────

function parseDate(v: string | null | undefined): Date | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Pick the subscription that backs the `pro` entitlement.
 *
 * RC keys `subscriptions` by product identifier and an account can hold
 * several over its lifetime (upgrade, resubscribe, cross-platform). We
 * prefer the entitlement's own `product_identifier` — that is RC telling us
 * exactly which one is granting access. Only if that lookup misses do we
 * fall back to the latest-expiring subscription, so a stale trial record
 * can't win over the live paid one.
 */
export function selectBackingSubscription(
  sub: RcSubscriber,
  ent: RcEntitlement | undefined
): RcSubscription | null {
  const subs = sub.subscriptions ?? {};
  const byProduct = ent?.product_identifier
    ? subs[ent.product_identifier]
    : undefined;
  if (byProduct) return byProduct;

  let best: RcSubscription | null = null;
  let bestMs = -Infinity;
  for (const s of Object.values(subs)) {
    const ms = parseDate(s.expires_date)?.getTime() ?? -Infinity;
    if (ms > bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

/**
 * Map an RC subscriber onto our EntitlementState.
 *
 * Status mapping — the `pro` entitlement is the ONLY access signal:
 *   - entitlement present AND (expires_date null OR in the future) → PRO
 *     · …unless the backing subscription's period_type is trial/intro,
 *       in which case → TRIAL with trialEndsAt = expiry. That keeps the
 *       trial countdown UI working off RC data.
 *   - no active `pro` entitlement → FREE
 *
 * We never emit PAST_DUE. RC keeps the entitlement ACTIVE through billing
 * retry and grace, so "has entitlement" already means "should have access";
 * a billing problem is surfaced via `stripeFirstFailureAt` (the recovery
 * banner's anchor) rather than by removing access. This matches the
 * 2026-06-12 no-grace decision from the other direction: our own
 * PAST_DUE → post-trial-free branch is preserved for legacy rows, but new
 * RC-sourced state simply never lands there.
 *
 * `now` is injected for deterministic tests.
 */
export function mapRcSubscriberToState(
  sub: RcSubscriber,
  now: Date = new Date()
): EntitlementState {
  const ent = sub.entitlements?.[RC_ENTITLEMENT_PRO];
  const backing = selectBackingSubscription(sub, ent);

  const entExpiry = parseDate(ent?.expires_date);
  // A present entitlement with a null expiry is non-expiring (lifetime /
  // promotional grant) — active. With an expiry, active iff it's ahead of us.
  const entActive =
    ent !== undefined && (entExpiry === null || entExpiry.getTime() > now.getTime());

  const source = rcStoreToSource(backing?.store);
  const billingIssueAt = parseDate(backing?.billing_issues_detected_at);
  const periodType = (backing?.period_type ?? "").toLowerCase();
  const isTrialPeriod = periodType === "trial" || periodType === "intro";

  if (!entActive) {
    return {
      subscriptionStatus: "FREE",
      trialEndsAt: null,
      // Preserve the billing-failure anchor even on FREE — the recovery
      // banner's 30-day window is exactly the "you lapsed, come back" case.
      stripeFirstFailureAt: billingIssueAt,
      subscriptionSource: source,
    };
  }

  if (isTrialPeriod) {
    return {
      subscriptionStatus: "TRIAL",
      trialEndsAt: entExpiry,
      stripeFirstFailureAt: billingIssueAt,
      subscriptionSource: source,
    };
  }

  return {
    subscriptionStatus: "PRO",
    trialEndsAt: null,
    stripeFirstFailureAt: billingIssueAt,
    subscriptionSource: source,
  };
}

/** Does this RC subscriber currently hold the `pro` entitlement? */
export function rcHasProEntitlement(
  sub: RcSubscriber,
  now: Date = new Date()
): boolean {
  return mapRcSubscriberToState(sub, now).subscriptionStatus !== "FREE";
}

// ─── HTTP ────────────────────────────────────────────────────────────

export type RcFetchResult =
  | { ok: true; subscriber: RcSubscriber }
  | { ok: false; code: "NO_CREDENTIALS" | "NOT_FOUND" | "HTTP_ERROR" | "BAD_BODY"; detail: string };

/**
 * GET /v1/subscribers/{app_user_id}.
 *
 * `app_user_id` is our `User.id` — the aliasing done at account creation
 * (Purchases.logIn) is what makes that true on the client side.
 *
 * Note RC returns 200 with an empty subscriber for an unknown id rather
 * than 404 in some cases; both are treated as NOT_FOUND by the caller
 * because both mean "RC can't answer for this user".
 */
export async function fetchRcSubscriber(
  appUserId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RcFetchResult> {
  // PUBLIC app key, NOT the secret. GET /v1/subscribers is one of RC's
  // client-facing endpoints and rejects `sk_` keys with code 7243 — see the
  // publicReadKey docs in ./flags.ts.
  const { publicReadKey } = rcCredentials();
  if (!publicReadKey) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      detail: "no RC_PUBLIC_KEY_STRIPE / RC_PUBLIC_KEY_IOS set",
    };
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${publicReadKey}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    return {
      ok: false,
      code: "HTTP_ERROR",
      detail: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.status === 404) {
    return { ok: false, code: "NOT_FOUND", detail: "RC has no such subscriber" };
  }
  if (!res.ok) {
    return { ok: false, code: "HTTP_ERROR", detail: `RC returned ${res.status}` };
  }

  let body: RcSubscriberResponse;
  try {
    body = (await res.json()) as RcSubscriberResponse;
  } catch {
    return { ok: false, code: "BAD_BODY", detail: "non-JSON body" };
  }
  if (!body.subscriber) {
    return { ok: false, code: "NOT_FOUND", detail: "response missing subscriber" };
  }
  return { ok: true, subscriber: body.subscriber };
}

/**
 * The resolver's RC source. Returns null on ANY failure so the caller
 * falls back to the DB — an RC problem must never look like a downgrade.
 */
export async function fetchRcEntitlementState(
  appUserId: string
): Promise<EntitlementState | null> {
  const res = await fetchRcSubscriber(appUserId);
  if (!res.ok) {
    // NO_CREDENTIALS is the expected steady state right now — log it at
    // info so it doesn't page anyone, and keep real errors at warn.
    if (res.code === "NO_CREDENTIALS") {
      safeLog.info("revenuecat.read-skipped", { reason: res.code });
    } else {
      safeLog.warn("revenuecat.read-failed", {
        appUserId,
        code: res.code,
        detail: res.detail,
      });
    }
    return null;
  }
  return mapRcSubscriberToState(res.subscriber);
}
