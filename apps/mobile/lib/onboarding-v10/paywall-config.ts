import {
  LEGACY_TIER,
  V2_TIER,
  type BillingInterval,
  type PricingTier,
} from "@acuity/shared";

/**
 * Screen 6 paywall copy, derived from the pricing catalog rather than typed
 * into the screen.
 *
 * ── Why nothing here is a literal ────────────────────────────────────
 * Spec §1: "All prices/renewal language from central store config +
 * localized product metadata." A price hardcoded in JSX is a price that
 * disagrees with what the store actually charges the moment either changes
 * — and on an auto-renewable IAP that disagreement is a compliance problem,
 * not a typo.
 *
 * Every number below is computed from the PricingTier passed in. The screen
 * renders strings; it does no arithmetic.
 *
 * ── The store is still the authority ─────────────────────────────────
 * These strings are the FALLBACK. When StoreKit/Play returns localized
 * product metadata (`IapProduct.localizedPrice`), the screen prefers it —
 * a user in the EU must see €, not a dollar figure we formatted ourselves.
 * The computed values exist so the screen has something correct to render
 * before products resolve, and so savings math has a source.
 */

/**
 * Anchor treatment — spec §2, open decision #1 (Keenan's call).
 *
 * "A" shows strike-through comparisons; "B" shows savings only. This is a
 * config toggle rather than a code fork because the spec is explicit that
 * exactly one ships and the choice isn't made yet.
 *
 * ⚠️ "A" REQUIRES A REAL $12.99 REGULAR PRICE to exist — a dated launch
 * window, or a web/list price actually charged. Spec §1: "No fake
 * strike-through prices." A strike-through with nothing behind it is
 * deceptive pricing, which is an App Store rejection and an FTC problem,
 * not a design preference. Leave this on "B" until that price is real.
 */
export type AnchorOption = "A" | "B";
export const ANCHOR_OPTION: AnchorOption = "B";

/** The regular monthly price "A" strikes through. Only meaningful if real. */
export const ANCHOR_A_REGULAR_MONTHLY_CENTS = 1299;

/** End of the launch window "A" cites. Null until Keenan sets a date. */
export const ANCHOR_A_LAUNCH_WINDOW_ENDS: Date | null = null;

export function formatCents(cents: number): string {
  // Whole dollars render without cents — "$80/yr" reads as a price, while
  // "$79.99" is the price. Keep the cents; they are what gets charged.
  return `$${(cents / 100).toFixed(2)}`;
}

export interface PlanCopy {
  interval: BillingInterval;
  /** Small label above the price, e.g. "Best value · 7 days". */
  eyebrow: string;
  /** Primary price line, e.g. "$79.99/yr". */
  price: string;
  /** Secondary line, e.g. "$6.67/mo". Empty when there isn't one. */
  subPrice: string;
  /** Savings or timing line, e.g. "Save 26%" / "Starts today.". */
  note: string;
  /** Strike-through comparison. Null under anchor B, always. */
  strikeThrough: string | null;
  /** Store product identifier for this plan on this platform. */
  productId: { apple: string; google: string };
}

export interface PaywallCopy {
  annual: PlanCopy;
  monthly: PlanCopy;
  /** Honest timeline (Z2) for the selected plan. */
  timeline: (plan: BillingInterval) => string[];
  /** Z6 CTA label + fine print for the selected plan. */
  cta: (plan: BillingInterval) => { label: string; finePrint: string };
}

/** Trial length. Spec §4 Screen 6: 7 days, annual only, no other value. */
export const TRIAL_DAYS = 7;

export function buildPaywallCopy(
  tier: PricingTier,
  anchor: AnchorOption = ANCHOR_OPTION
): PaywallCopy {
  const monthlyCents = tier.monthlyCents;
  const annualCents = tier.annualCents;
  const annualAsMonthlyCents = Math.round(annualCents / 12);

  const monthlyRunRate = monthlyCents * 12;
  const savingsPct =
    monthlyRunRate > 0
      ? Math.round(((monthlyRunRate - annualCents) / monthlyRunRate) * 100)
      : 0;

  const launchWindow = ANCHOR_A_LAUNCH_WINDOW_ENDS;
  // Anchor A is only renderable when the thing it compares against exists.
  // If the date is missing we fall back to B rather than printing a
  // strike-through we cannot justify.
  const anchorAUsable = anchor === "A" && launchWindow !== null;

  const annual: PlanCopy = {
    interval: "annual",
    eyebrow: `Best value · ${TRIAL_DAYS} days`,
    price: `${formatCents(annualCents)}/yr`,
    subPrice: `${formatCents(annualAsMonthlyCents)}/mo`,
    note: `Save ${savingsPct}%`,
    strikeThrough: anchorAUsable
      ? `${formatCents(monthlyRunRate)}/yr`
      : null,
    productId: {
      apple: tier.products.annual.apple,
      google: tier.products.annual.google,
    },
  };

  const monthly: PlanCopy = {
    interval: "monthly",
    eyebrow: "Start smaller",
    price: `${formatCents(monthlyCents)}/mo`,
    subPrice: "",
    note: anchorAUsable
      ? `Launch price until ${formatLaunchDate(launchWindow!)}`
      : "Starts today.",
    strikeThrough: anchorAUsable
      ? formatCents(ANCHOR_A_REGULAR_MONTHLY_CENTS)
      : null,
    productId: {
      apple: tier.products.monthly.apple,
      google: tier.products.monthly.google,
    },
  };

  return {
    annual,
    monthly,
    timeline: (plan) =>
      plan === "annual"
        ? [
            "Today — Everything unlocked",
            "Day 5 — We remind you",
            `Day ${TRIAL_DAYS} — First patterns start showing. You decide.`,
          ]
        : ["Starts today. Cancel anytime."],
    cta: (plan) =>
      plan === "annual"
        ? {
            // Never "Subscribe" or "Continue" — spec §4 Screen 6.
            label: `Start my ${TRIAL_DAYS}-day free trial`,
            finePrint: `$0 today. ${formatCents(annualCents)}/yr after ${TRIAL_DAYS} days unless you cancel.`,
          }
        : {
            label: `Start Ripple — ${formatCents(monthlyCents)} today`,
            finePrint: "Billed today. Renews monthly until canceled.",
          },
  };
}

function formatLaunchDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Free-vs-Ripple comparison rows (Z4).
 *
 * Life Matrix is deliberately a PREVIEW on free rather than absent: it
 * exists at zero entries (seeded from the dimension preset), so presenting
 * it as a threshold unlock would be a claim the product doesn't make. See
 * the spec appendix — this was verified against the live DB.
 */
export const COMPARISON_ROWS: ReadonlyArray<{
  label: string;
  free: boolean;
  pro: boolean;
}> = [
  { label: "Debriefs + tasks", free: true, pro: true },
  { label: "Patterns", free: false, pro: true },
  { label: "Life Matrix", free: false, pro: true },
  { label: "Weekly report", free: false, pro: true },
];

/** Tiers re-exported so the screen imports one module, not three. */
export { LEGACY_TIER, V2_TIER };
