import "server-only";

/**
 * RevenueCat webhook event → entitlement decision. PURE, no I/O.
 *
 * This is the module that replaces the per-provider mapping logic we run
 * today (apple-iap.decideNotificationAction, the Stripe webhook's
 * applySubscriptionState, the Google RTDN handler's state math). Keeping it
 * pure means the whole event matrix is unit-testable without Prisma, a
 * network, or a signed payload — the same reason the Apple mapping was
 * extracted out of its route handler.
 *
 * ── The guards that MUST survive (see docs/REVENUECAT_ENTITLEMENT_AUDIT.md §5)
 *
 *  1. NEVER DEMOTE A COMP. `subscriptionSource === "comp"` is an intentional
 *     grant with no provider behind it. RC will happily report such a user
 *     as having no entitlement; acting on that would silently revoke access
 *     that an admin deliberately gave. Any demoting decision short-circuits
 *     to "skip-comp".
 *  2. NULL-SAFE SOURCE. `rcStoreToSource` returns null for a store we don't
 *     recognize. A null NEVER overwrites a known subscriptionSource — the
 *     decision carries `source: null` meaning "leave the column alone".
 *     Overwriting a good source with a guess makes the row unverifiable by
 *     the drift monitor.
 *  3. ENTITLEMENT SCOPING. An event that does not grant/revoke the `pro`
 *     entitlement is not ours to act on.
 *
 * ── One deliberate divergence from RC's model: BILLING_ISSUE ─────────
 * RevenueCat keeps an entitlement ACTIVE through billing retry and grace.
 * Ripple does not: per the 2026-06-12 spec, a failed payment drops to FREE
 * immediately (no grace), with the recovery banner driven by the failure
 * anchor. Both the Stripe webhook (invoice.payment_failed → FREE) and the
 * Apple handler (DID_FAIL_TO_RENEW → FREE) already behave that way.
 * We preserve OUR behavior here rather than adopting RC's, because changing
 * it would be a silent product change bundled into an infrastructure
 * migration. This is the one mapping that deserves an explicit decision
 * before cutover — see docs/REVENUECAT_MIGRATION.md §"Decisions needed".
 */

import { RC_ENTITLEMENT_PRO, rcStoreToSource } from "@acuity/shared";

// ─── RC event payload ────────────────────────────────────────────────

/** RC webhook event types we handle. Unknown types are logged, not acted on. */
export type RcEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_EXTENDED"
  | "TEMPORARY_ENTITLEMENT_GRANT"
  | "CANCELLATION"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "SUBSCRIPTION_PAUSED"
  | "PRODUCT_CHANGE"
  | "TRANSFER"
  | "INVOICE_ISSUANCE"
  | "TEST";

export interface RcWebhookEvent {
  id?: string;
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  /** "TRIAL" | "NORMAL" | "INTRO" | "PROMOTIONAL" */
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  /** APP_STORE | MAC_APP_STORE | PLAY_STORE | STRIPE | RC_BILLING | PROMOTIONAL */
  store?: string | null;
  /** "PRODUCTION" | "SANDBOX" */
  environment?: string | null;
  entitlement_ids?: string[] | null;
  /** Legacy single-entitlement field; still sent by older RC versions. */
  entitlement_id?: string | null;
  /** UNSUBSCRIBE | BILLING_ERROR | DEVELOPER_INITIATED | PRICE_INCREASE | CUSTOMER_SUPPORT | UNKNOWN */
  cancel_reason?: string | null;
  new_product_id?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

export interface RcWebhookBody {
  api_version?: string;
  event?: RcWebhookEvent;
}

// ─── The user state a decision depends on ────────────────────────────

export interface UserStateForRcEvent {
  id: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
}

// ─── Decision ────────────────────────────────────────────────────────

export type RcWebhookDecision =
  | { action: "ignore"; reason: string }
  | { action: "log-only"; reason: string }
  | { action: "skip-comp"; reason: string }
  | {
      action: "set-status";
      nextStatus: "PRO" | "TRIAL" | "FREE";
      /** Only set when nextStatus === "TRIAL". */
      trialEndsAt: Date | null;
      /**
       * null means "leave subscriptionSource unchanged" (guard 2). A string
       * is a recognized source safe to write.
       */
      source: string | null;
      /** Stamp the billing-failure anchor (drives the recovery banner). */
      stampBillingIssue: boolean;
      /** Clear the anchor — a successful renewal ends the dunning episode. */
      clearBillingIssue: boolean;
      reason: string;
    };

/** Cancel reasons that revoke access immediately rather than at period end. */
const IMMEDIATE_REVOKE_REASONS = new Set(["CUSTOMER_SUPPORT"]);

function grantsPro(event: RcWebhookEvent): boolean {
  const ids = event.entitlement_ids ?? [];
  if (ids.length > 0) return ids.includes(RC_ENTITLEMENT_PRO);
  // Older payloads use the singular field. Absence of BOTH is treated as
  // "unscoped" and allowed through — RC only sends events for products that
  // map to an entitlement, and failing closed here would drop real renewals.
  if (typeof event.entitlement_id === "string") {
    return event.entitlement_id === RC_ENTITLEMENT_PRO;
  }
  return true;
}

function isTrialPeriod(event: RcWebhookEvent): boolean {
  const p = (event.period_type ?? "").trim().toUpperCase();
  return p === "TRIAL" || p === "INTRO";
}

function expiration(event: RcWebhookEvent): Date | null {
  const ms = event.expiration_at_ms;
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Map one RC event + the current user row onto a deterministic action.
 *
 * `user` is null when no User row matches the event's app_user_id — that is
 * an "ignore", never an error: RC may know about a subscriber we deleted, and
 * a webhook must not resurrect them.
 */
export function decideRcWebhookAction(
  event: RcWebhookEvent,
  user: UserStateForRcEvent | null,
  now: Date = new Date()
): RcWebhookDecision {
  const type = (event.type ?? "").trim().toUpperCase();

  // TEST events carry no user and exist purely to validate the endpoint.
  if (type === "TEST") {
    return { action: "log-only", reason: "RC test event" };
  }

  if (!user) {
    return {
      action: "ignore",
      reason: "no User row matches this event's app_user_id",
    };
  }

  if (!grantsPro(event)) {
    return {
      action: "ignore",
      reason: `event does not concern the '${RC_ENTITLEMENT_PRO}' entitlement`,
    };
  }

  const source = rcStoreToSource(event.store);
  const isComp = user.subscriptionSource === "comp";

  /** Guard 1 — a demotion may never touch a comped account. */
  const demote = (reason: string, stampBillingIssue = false): RcWebhookDecision => {
    if (isComp) {
      return {
        action: "skip-comp",
        reason: `${reason} — skipped: comped account is never demoted`,
      };
    }
    return {
      action: "set-status",
      nextStatus: "FREE",
      trialEndsAt: null,
      source,
      stampBillingIssue,
      clearBillingIssue: false,
      reason,
    };
  };

  const grant = (reason: string): RcWebhookDecision => {
    if (isTrialPeriod(event)) {
      return {
        action: "set-status",
        nextStatus: "TRIAL",
        trialEndsAt: expiration(event),
        source,
        stampBillingIssue: false,
        clearBillingIssue: true,
        reason: `${reason} (trial period)`,
      };
    }
    return {
      action: "set-status",
      nextStatus: "PRO",
      trialEndsAt: null,
      source,
      stampBillingIssue: false,
      clearBillingIssue: true,
      reason,
    };
  };

  switch (type) {
    // ── Granting events ──────────────────────────────────────────────
    case "INITIAL_PURCHASE":
      return grant("initial purchase");

    case "RENEWAL":
      // Also the failed-then-recovered path: a successful renewal clears the
      // dunning anchor and restores access, mirroring Stripe's
      // invoice.payment_succeeded recovery.
      return grant("renewal succeeded");

    case "UNCANCELLATION":
      // Auto-renew turned back on before the period ended — still entitled.
      return grant("uncancellation (auto-renew re-enabled)");

    case "NON_RENEWING_PURCHASE":
      return grant("non-renewing purchase");

    case "SUBSCRIPTION_EXTENDED":
      return grant("subscription extended by the store");

    case "TEMPORARY_ENTITLEMENT_GRANT":
      // RC grants this when it cannot reach the store to verify. It is a
      // GRANT, so honoring it can only fail open — never locks anyone out.
      return grant("temporary entitlement grant (store unreachable)");

    // ── Revoking events ──────────────────────────────────────────────
    case "EXPIRATION":
      if (user.subscriptionStatus === "FREE") {
        return {
          action: "ignore",
          reason: "EXPIRATION on already-FREE user (idempotent)",
        };
      }
      return demote("subscription expired");

    case "SUBSCRIPTION_PAUSED":
      // Google Play pause — no access during the pause window.
      return demote("subscription paused (Play Store)");

    case "BILLING_ISSUE": {
      // See the header note: Ripple has NO grace period, so a billing issue
      // drops to FREE immediately AND stamps the anchor that drives the
      // 30-day recovery banner. This intentionally diverges from RC's own
      // model (which keeps the entitlement live through grace) in order to
      // preserve today's behavior exactly.
      if (user.subscriptionStatus === "FREE") {
        // Already FREE — still stamp nothing new; the anchor was set on the
        // first failure and must not be pushed forward by retries.
        return {
          action: "ignore",
          reason: "BILLING_ISSUE on already-FREE user (anchor already set)",
        };
      }
      return demote("billing issue detected (no grace)", true);
    }

    case "CANCELLATION": {
      const reason = (event.cancel_reason ?? "").trim().toUpperCase();
      if (IMMEDIATE_REVOKE_REASONS.has(reason)) {
        // Refund / support-initiated reversal — strip access now, matching
        // the Apple REFUND and REVOKE handling.
        return demote(`cancellation (${reason}) — immediate revoke`);
      }
      const exp = expiration(event);
      if (exp !== null && exp.getTime() > now.getTime()) {
        // The common case: the user turned off auto-renew but has paid
        // through the end of the period. Access CONTINUES — the later
        // EXPIRATION event is what demotes. Demoting here would be the
        // classic "cancelled means cancelled immediately" bug that costs a
        // user access they already paid for.
        return {
          action: "log-only",
          reason: `cancellation (${reason || "UNKNOWN"}) — access continues until ${exp.toISOString()}`,
        };
      }
      return demote(
        `cancellation (${reason || "UNKNOWN"}) with no future expiration`
      );
    }

    // ── Non-entitlement-changing events ──────────────────────────────
    case "PRODUCT_CHANGE":
      // A scheduled plan switch that takes effect at the next renewal. The
      // current entitlement is unaffected; the RENEWAL event will carry the
      // new product.
      return {
        action: "log-only",
        reason: `product change scheduled → ${event.new_product_id ?? "unknown"}`,
      };

    case "TRANSFER":
      // A subscription moved between app_user_ids (usually a store account
      // signing into a different app account). Both sides need reconciling
      // and the event alone doesn't say which side this user is on, so we
      // never guess — log and let the drift monitor's RC-parity mode
      // reconcile from RC's actual customer state.
      return {
        action: "log-only",
        reason: `transfer event — from=${(event.transferred_from ?? []).join(",") || "none"} to=${(event.transferred_to ?? []).join(",") || "none"}; deferred to drift reconciliation`,
      };

    case "INVOICE_ISSUANCE":
      return { action: "log-only", reason: "invoice issued (no entitlement change)" };

    default:
      return { action: "log-only", reason: `unhandled RC event type: ${type || "(empty)"}` };
  }
}

/**
 * Build the Prisma `data` payload for a set-status decision.
 *
 * Split out from the decision so the write shape is testable too, and so the
 * route handler contains no field-level logic. Mirrors the field handling of
 * the existing Apple/Google handlers: the anchor is stamped or cleared, and
 * subscriptionSource is only included when we have a recognized value.
 */
export function rcDecisionToUpdateData(
  decision: Extract<RcWebhookDecision, { action: "set-status" }>,
  now: Date = new Date()
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    subscriptionStatus: decision.nextStatus,
  };

  // Guard 2: only write a source we actually recognized.
  if (decision.source !== null) {
    data.subscriptionSource = decision.source;
  }

  if (decision.nextStatus === "TRIAL") {
    data.trialEndsAt = decision.trialEndsAt;
  } else if (decision.nextStatus === "PRO") {
    // A paid subscription supersedes the app-managed trial clock, matching
    // verify-receipt's "Apple sub bypasses the trial clock" behavior.
    data.trialEndsAt = null;
  }

  if (decision.stampBillingIssue) {
    data.stripeFirstFailureAt = now;
  } else if (decision.clearBillingIssue) {
    data.stripeFirstFailureAt = null;
  }

  return data;
}
