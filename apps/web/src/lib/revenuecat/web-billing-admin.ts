import "server-only";

/**
 * RevenueCat Web Billing — server-side subscription actions (REST API v2).
 *
 * Today this is only "cancel on account deletion". purchases-js cannot cancel
 * from the browser (RC: modifications must come from the backend with the
 * secret key), so account deletion has to do it here — otherwise a deleted
 * account keeps getting billed, which is exactly the 2026-06-13 orphan
 * subscription incident, this time on RevenueCat instead of Stripe.
 *
 * Endpoints (https://www.revenuecat.com/docs/api-v2/subscription, checked
 * 2026-10-14):
 *   GET  /v2/projects/{project_id}/customers/{customer_id}/subscriptions
 *   POST /v2/projects/{project_id}/subscriptions/{subscription_id}/actions/cancel
 *        (permission customer_information:subscriptions:read_write; the
 *        customer keeps access to the end of the period, then it stops —
 *        no further charges)
 *
 * Needs RC_SECRET_KEY (a v2 secret key with that permission) and
 * RC_PROJECT_ID in the server env. Never throws.
 */

import { rcCredentials } from "@/lib/revenuecat/flags";
import { safeLog } from "@/lib/safe-log";

const RC_V2 = "https://api.revenuecat.com/v2";

export type RcCancelResult = "success" | "failed" | "not_applicable";

interface RcV2Subscription {
  id?: string;
  store?: string | null;
  status?: string | null;
  auto_renewal_status?: string | null;
}

/** Will this Web Billing subscription charge the customer again? */
export function rcBillingSubWillCharge(sub: RcV2Subscription): boolean {
  if ((sub.store ?? "").toLowerCase() !== "rc_billing") return false;
  if (!sub.id) return false;
  const status = (sub.status ?? "").toLowerCase();
  if (status === "expired") return false;
  // Already cancelled by the customer (or by us) → nothing to stop.
  if ((sub.auto_renewal_status ?? "").toLowerCase() === "will_not_renew") return false;
  return true;
}

export async function cancelRcBillingSubscriptions(
  appUserId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RcCancelResult> {
  const { secretKey, projectId } = rcCredentials();
  if (!secretKey || !projectId) {
    safeLog.warn("revenuecat.cancel-on-delete.no-credentials", {
      hasSecret: Boolean(secretKey),
      hasProject: Boolean(projectId),
    });
    return "failed";
  }
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };

  try {
    const listRes = await fetchImpl(
      `${RC_V2}/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(appUserId)}/subscriptions?limit=100`,
      { method: "GET", headers }
    );
    // Unknown customer → never bought anything through RevenueCat.
    if (listRes.status === 404) return "not_applicable";
    if (!listRes.ok) {
      safeLog.warn("revenuecat.cancel-on-delete.list-failed", {
        appUserId,
        status: listRes.status,
      });
      return "failed";
    }
    const body = (await listRes.json()) as { items?: RcV2Subscription[] };
    const live = (body.items ?? []).filter(rcBillingSubWillCharge);
    if (live.length === 0) return "not_applicable";

    let allOk = true;
    for (const sub of live) {
      const res = await fetchImpl(
        `${RC_V2}/projects/${encodeURIComponent(projectId)}/subscriptions/${encodeURIComponent(sub.id as string)}/actions/cancel`,
        { method: "POST", headers }
      );
      if (!res.ok) {
        allOk = false;
        safeLog.warn("revenuecat.cancel-on-delete.cancel-failed", {
          appUserId,
          subscriptionId: sub.id,
          status: res.status,
        });
      }
    }
    return allOk ? "success" : "failed";
  } catch (err) {
    safeLog.warn("revenuecat.cancel-on-delete.error", {
      appUserId,
      err: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
