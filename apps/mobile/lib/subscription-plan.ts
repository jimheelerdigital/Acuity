/**
 * What the Settings "Subscription" section says about the user's plan.
 *
 * Why (Jimmy, 10/19 on build 183): "There's no manage subscription option
 * in settings... not even a subscription option." His account is PRO with
 * source "comp", and every row in the old block was conditional: Subscribe
 * only for non-PRO, Manage only for App Store / Play / Stripe subscribers.
 * A comped Pro user saw nothing but Restore Purchases. The plan row built
 * from this helper is ALWAYS shown, so every account can see what it has
 * and how it's billed. Pure, so every row is testable without a simulator.
 */

export type PlanInput = {
  status: string | null | undefined;
  source: string | null | undefined;
  trialEndsAt?: string | null;
  /** Stripe current period end (ISO). Only used for Stripe subscribers. */
  periodEnd?: string | null;
  now?: number;
};

export type PlanSummary = { title: string; detail: string };

const DAY = 24 * 60 * 60 * 1000;

function shortDate(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function describePlan(p: PlanInput): PlanSummary {
  const now = p.now ?? Date.now();
  const status = p.status ?? "FREE";
  if (status === "PRO") {
    switch (p.source) {
      case "comp":
        return { title: "Ripple Pro", detail: "Complimentary, nothing to pay or cancel" };
      case "apple":
        return { title: "Ripple Pro", detail: "Billed through the App Store" };
      case "google_play":
        return { title: "Ripple Pro", detail: "Billed through Google Play" };
      case "stripe": {
        const d = p.periodEnd ? shortDate(p.periodEnd) : null;
        return { title: "Ripple Pro", detail: d ? `Billed on the web, renews ${d}` : "Billed on the web" };
      }
      default:
        return { title: "Ripple Pro", detail: "Active" };
    }
  }
  if (status === "TRIAL") {
    if (p.trialEndsAt) {
      const ms = new Date(p.trialEndsAt).getTime() - now;
      if (Number.isFinite(ms)) {
        const days = Math.max(0, Math.ceil(ms / DAY));
        return {
          title: "Free trial",
          detail: days === 0 ? "Ends today" : `${days} day${days === 1 ? "" : "s"} left`,
        };
      }
    }
    return { title: "Free trial", detail: "Active" };
  }
  if (status === "PAST_DUE") {
    return { title: "Ripple Pro", detail: "Payment failed, update your payment method" };
  }
  return { title: "Free plan", detail: "Upgrade for full debriefs and weekly reports" };
}
