/**
 * Entitlement drift — shared core for the drift MONITOR (read-only alert) and
 * the future self-healing RECONCILER (read + correct).
 *
 * "Drift" = our DB `subscriptionStatus` disagrees with the source-of-truth
 * provider (Stripe / Apple App Store Server API / Google Play). A single missed
 * webhook or notification leaves the DB permanently out of sync until something
 * re-reads the provider — this module is that re-read + comparison.
 *
 * `classifyDrift` is a PURE function (unit-tested). The provider reads live in
 * `resolveProviderActive`, which dispatches to the existing per-source clients.
 */

import {
  readAppleApiConfig,
  fetchAppleSubscriptionStatus,
} from "@/lib/apple-iap";
import {
  fetchGoogleSubscription,
  readGooglePlayApiConfig,
} from "@/lib/google-iap";
import { safeLog } from "@/lib/safe-log";

export type DriftSeverity = "SEV1" | "SEV2" | "SEV3";

export interface DriftFinding {
  userId: string;
  email: string | null;
  source: string; // "stripe" | "apple" | "google_play"
  dbStatus: string;
  providerActive: boolean;
  providerDetail: string; // raw provider state string, for the alert
  expected: "PRO" | "FREE";
  severity: DriftSeverity;
  kind:
    | "access_denied_but_paid" // DB not PRO but provider ACTIVE  (SEV1)
    | "revenue_leak" // DB PRO but provider INACTIVE     (SEV2)
    | "stale_past_due"; // DB PAST_DUE, provider INACTIVE   (SEV3)
}

/**
 * Pure classification. Returns null when DB and provider agree.
 *
 * `providerActive` = the provider currently grants entitlement (Stripe
 * active/trialing; Apple status 1 active or 4 grace; Google hasAccess).
 */
export function classifyDrift(input: {
  source: string;
  dbStatus: string;
  providerActive: boolean;
}): { kind: DriftFinding["kind"]; severity: DriftSeverity; expected: "PRO" | "FREE" } | null {
  const { dbStatus, providerActive } = input;
  const dbGrantsPro = dbStatus === "PRO";

  if (providerActive && !dbGrantsPro) {
    // Paid but locked out — the emily class. Highest priority.
    return { kind: "access_denied_but_paid", severity: "SEV1", expected: "PRO" };
  }
  if (!providerActive && dbGrantsPro) {
    // DB grants PRO the provider no longer backs — revenue/entitlement leak.
    return { kind: "revenue_leak", severity: "SEV2", expected: "FREE" };
  }
  if (!providerActive && dbStatus === "PAST_DUE") {
    // Provider is terminally inactive (unpaid/uncollectible) but the row is
    // stuck at PAST_DUE — should be FREE. The l.connolly / kayleigh class.
    return { kind: "stale_past_due", severity: "SEV3", expected: "FREE" };
  }
  return null;
}

export interface ProviderStatus {
  ok: boolean;
  active: boolean;
  detail: string;
}

/**
 * Read the source-of-truth provider for one user and report whether the
 * subscription currently grants entitlement. READ-ONLY. Returns ok:false on any
 * provider/config error so the caller can skip (never treat an API failure as a
 * demotion signal).
 */
export async function resolveProviderActive(user: {
  subscriptionSource: string | null;
  appleOriginalTransactionId: string | null;
  googlePurchaseToken: string | null;
  stripeSubscriptionId: string | null;
}): Promise<ProviderStatus> {
  try {
    if (user.subscriptionSource === "apple" && user.appleOriginalTransactionId) {
      const cfg = readAppleApiConfig();
      const res = await fetchAppleSubscriptionStatus(
        user.appleOriginalTransactionId,
        cfg
      );
      if (!res.ok) return { ok: false, active: false, detail: res.diagnostic };
      return { ok: true, active: res.active, detail: `apple:${res.statusLabel}` };
    }

    if (user.subscriptionSource === "google_play" && user.googlePurchaseToken) {
      const cfg = readGooglePlayApiConfig();
      const res = await fetchGoogleSubscription(user.googlePurchaseToken, cfg);
      if (!res.ok) return { ok: false, active: false, detail: res.diagnostic };
      return { ok: true, active: res.info.hasAccess, detail: `google:${res.info.state}` };
    }

    if (user.subscriptionSource === "stripe" && user.stripeSubscriptionId) {
      const { stripe } = await import("@/lib/stripe");
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const active = sub.status === "active" || sub.status === "trialing";
      return { ok: true, active, detail: `stripe:${sub.status}` };
    }

    // No usable provider handle (source null / missing id) — can't validate.
    return { ok: false, active: false, detail: "no-provider-handle" };
  } catch (err) {
    safeLog.warn("entitlement-drift.provider-read-failed", {
      source: user.subscriptionSource,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, active: false, detail: "provider-error" };
  }
}
