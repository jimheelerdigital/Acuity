/**
 * Paywall win-back timing + eligibility (2026-10-26). Pure, unit-tested in
 * paywall-winback.test.ts; the recovery orchestrator does the queries.
 *
 * Who: reached a paywall (app hard paywall `v10_paywall_viewed`, or the web
 * funnel paywall / checkout) and didn't start a trial.
 * When: #1 ≥5 min after their LATEST paywall view (and nothing paywall-ish
 * in the last 5 min: still deciding; was 45 min until 2026-10-27, Keenan:
 * "15 mins after is the latest"; sent by paywall-winback-fast every 5 min), #2 ≥24h after #1, #3 ≥48h after #2.
 * Only paywall views after PAYWALL_WINBACK_START (forward-only) and within
 * the last 7 days.
 */

export const PAYWALL_WINBACK_START = new Date("2026-10-26T17:00:00Z");

export const PAYWALL_EVENTS = [
  "v10_paywall_viewed",
  "funnel_v9_paywall_viewed",
  "funnel_savings_viewed",
  "funnel_checkout_started",
] as const;

export const WINBACK_QUIET_MS = 5 * 60_000;
export const WINBACK_MAX_AGE_MS = 7 * 24 * 3600_000;
const H = 3600_000;

export type WinbackKey = "paywall_winback_1" | "paywall_winback_2" | "paywall_winback_3";

export interface WinbackUser {
  isAdmin: boolean;
  internal: boolean;
  subscriptionStatus: string | null;
  subscriptionSource: string | null;
  stripeSubscriptionId: string | null;
  /** Any funnel_payment_completed on record. */
  paid: boolean;
}

/** Has she paid / is she covered some other way? Then never win-back. */
export function isWinbackEligible(u: WinbackUser): boolean {
  if (u.isAdmin || u.internal || u.paid) return false;
  if (u.subscriptionStatus === "PRO") return false;
  if (u.stripeSubscriptionId) return false;
  if (u.subscriptionSource && ["apple", "google_play", "comp", "stripe"].includes(u.subscriptionSource)) return false;
  return true;
}

/**
 * Which win-back email (if any) is due now. `sent` = when each step went out.
 */
export function nextWinbackStep(params: {
  now: Date;
  lastPaywallAt: Date;
  sent: Partial<Record<WinbackKey, Date>>;
}): WinbackKey | null {
  const { now, lastPaywallAt, sent } = params;
  const t = now.getTime();
  const last = lastPaywallAt.getTime();
  if (last < PAYWALL_WINBACK_START.getTime()) return null;
  if (t - last > WINBACK_MAX_AGE_MS) return null;
  if (t - last < WINBACK_QUIET_MS) return null; // still deciding
  if (!sent.paywall_winback_1) return "paywall_winback_1";
  if (!sent.paywall_winback_2) {
    return t - sent.paywall_winback_1.getTime() >= 24 * H ? "paywall_winback_2" : null;
  }
  if (!sent.paywall_winback_3) {
    return t - sent.paywall_winback_2.getTime() >= 48 * H ? "paywall_winback_3" : null;
  }
  return null;
}
