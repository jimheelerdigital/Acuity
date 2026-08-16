/**
 * Product + price catalog, shared by web and mobile.
 *
 * ⚠️ THIS FILE DOES NOT CHANGE ANY LIVE PRICE.
 *
 * `LEGACY` is what every user is charged today ($4.99 / $39.99) and is the
 * ACTIVE tier until `NEW_PRICING_ENABLED` is turned on. `V2` ($8.99 /
 * $79.99) is defined here so the RevenueCat offerings, the paywall copy,
 * and the import script can all be built and typechecked before the
 * products exist in App Store Connect / Play Console / Stripe.
 *
 * Why a catalog instead of two constants: at cutover we must serve TWO
 * prices simultaneously — the 17 existing subscribers keep LEGACY forever
 * (grandfathered), new users get V2. Any design with a single "current
 * price" global cannot express that, and the failure mode is charging an
 * existing subscriber the new price, which is both a support incident and,
 * for an auto-renewable IAP, an Apple-side price-consent prompt that can
 * silently cancel their subscription if they don't accept.
 *
 * Product IDs for V2 are PLACEHOLDERS pending the real SKUs — see
 * PLACEHOLDER_V2_PRODUCT_IDS below. They are structurally correct
 * (reverse-DNS on Apple, flat lowercase on Google) so nothing has to be
 * refactored when the real ones land; only the string values change.
 */

export type PricingTierId = "legacy" | "v2";
export type BillingInterval = "monthly" | "annual";

export interface PlanProducts {
  /** Apple App Store product identifier (reverse-DNS). */
  apple: string;
  /** Google Play product identifier (flat lowercase). */
  google: string;
  /**
   * Stripe Price ID. Null on V2 until the Price is created in Stripe.
   * Production always prefers the env var (STRIPE_PRICE_*) over this —
   * these are the local-dev / documentation fallbacks.
   */
  stripe: string | null;
}

export interface PricingTier {
  id: PricingTierId;
  label: string;
  monthlyCents: number;
  annualCents: number;
  products: Record<BillingInterval, PlanProducts>;
}

// ─── Active (live) pricing — DO NOT EDIT WITHOUT A PRICING DECISION ──

export const LEGACY_TIER: PricingTier = {
  id: "legacy",
  label: "Legacy ($4.99 / $39.99)",
  monthlyCents: 499,
  annualCents: 3999,
  products: {
    monthly: {
      apple: "com.heelerdigital.acuity.pro.monthly",
      google: "acuity_pro_monthly",
      stripe: "price_1Tb335D9XJakJqj5nwTjb4cf",
    },
    annual: {
      apple: "com.heelerdigital.acuity.pro.annual",
      google: "acuity_pro_annual",
      stripe: "price_1TcSPvD9XJakJqj5C2dITYrR",
    },
  },
};

// ─── New pricing — DEFINED, NOT ACTIVE ──────────────────────────────

/**
 * V2 product IDs are placeholders. Replace with the real SKUs once the
 * products are created; keep the `.v2` / `_v2` suffix convention unless
 * the store forces otherwise. Apple product IDs are immutable once
 * created, so a new price = a new product, which is why these can't just
 * reuse the LEGACY ids with a different price.
 */
export const PLACEHOLDER_V2_PRODUCT_IDS = true as const;

export const V2_TIER: PricingTier = {
  id: "v2",
  label: "V2 ($8.99 / $79.99)",
  monthlyCents: 899,
  annualCents: 7999,
  products: {
    monthly: {
      apple: "com.heelerdigital.acuity.pro.monthly.v2",
      google: "acuity_pro_monthly_v2",
      stripe: null, // TODO(jim): create the $8.99 Stripe Price, set STRIPE_PRICE_MONTHLY_V2
    },
    annual: {
      apple: "com.heelerdigital.acuity.pro.annual.v2",
      google: "acuity_pro_annual_v2",
      stripe: null, // TODO(jim): create the $79.99 Stripe Price, set STRIPE_PRICE_YEARLY_V2
    },
  },
};

export const PRICING_TIERS: Record<PricingTierId, PricingTier> = {
  legacy: LEGACY_TIER,
  v2: V2_TIER,
};

// ─── Tier selection + grandfathering ────────────────────────────────

/**
 * Master switch for the new price. OFF means every surface quotes and
 * charges LEGACY — i.e. today's behavior, unchanged.
 *
 * Separate from the three RC_* flags on purpose: the pricing change and
 * the RevenueCat migration are independent decisions that happen to be
 * scheduled together. You can migrate to RC at current prices, or raise
 * prices without RC. Coupling them into one flag would make either
 * rollback impossible without the other.
 */
export interface PricingConfig {
  /** When false (default), V2 is inert and everyone sees LEGACY. */
  newPricingEnabled: boolean;
  /**
   * When true (default), users who already had a paid subscription before
   * the cutover keep LEGACY pricing permanently.
   *
   * There is no scenario where we want this off for the existing 17 — it
   * defaults ON and exists as a flag only so the behavior is explicit and
   * testable, not so it can be casually disabled.
   */
  grandfatherExisting: boolean;
  /**
   * Accounts whose paid subscription started before this instant are
   * grandfathered. Null disables date-based grandfathering (then only the
   * explicit allow-list applies).
   */
  cutoverAt: Date | null;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  newPricingEnabled: false,
  grandfatherExisting: true,
  cutoverAt: null,
};

export interface GrandfatherInput {
  /**
   * When this user's paid subscription began. For the existing 17 this is
   * the Stripe/Apple subscription start. Null for users who have never
   * paid — a never-paid user is NOT grandfathered.
   */
  paidSince: Date | null;
  /**
   * True when the user is currently entitled via a source that predates
   * the cutover but has no reliable start date (legacy rows with a null
   * subscriptionSource). Treated as grandfathered — fail toward the
   * cheaper price, because overcharging an existing subscriber is the
   * strictly worse error.
   */
  legacyUnknownStart?: boolean;
}

/**
 * Which pricing tier applies to one user.
 *
 * Order matters:
 *   1. new pricing off        → LEGACY for everyone (today)
 *   2. grandfathering on AND the user already paid → LEGACY forever
 *   3. otherwise             → V2
 *
 * Pure function, no I/O, so it is unit-testable and callable from both
 * the server (checkout) and the client (paywall copy).
 */
export function pricingTierFor(
  user: GrandfatherInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): PricingTier {
  if (!config.newPricingEnabled) return LEGACY_TIER;

  if (config.grandfatherExisting) {
    if (user.legacyUnknownStart === true) return LEGACY_TIER;
    if (user.paidSince !== null) {
      // No cutover date configured → any prior paid user is grandfathered.
      if (config.cutoverAt === null) return LEGACY_TIER;
      if (user.paidSince.getTime() < config.cutoverAt.getTime()) {
        return LEGACY_TIER;
      }
    }
  }

  return V2_TIER;
}

/**
 * The RC offering id to show a user, derived from their tier. Keeps the
 * paywall from having to know about grandfathering — it asks for a tier
 * and gets the offering that matches.
 */
export function offeringIdForTier(tier: PricingTier): string {
  return tier.id === "legacy" ? "grandfathered" : "default";
}

// ─── Formatting ─────────────────────────────────────────────────────

export function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Annual savings vs the monthly run-rate, for the "save N%" badge.
 * Computed rather than hardcoded so a price change can't leave a stale
 * badge claiming the wrong discount (which happened at the 2026-05-25
 * change: the page advertised $99 while Stripe charged $39.99).
 */
export function annualSavingsPct(tier: PricingTier): number {
  const runRate = tier.monthlyCents * 12;
  if (runRate <= 0) return 0;
  return Math.round(((runRate - tier.annualCents) / runRate) * 100);
}

/** All known product IDs across both tiers — for server-side allow-lists. */
export function allProductIds(): string[] {
  const ids: string[] = [];
  for (const tier of Object.values(PRICING_TIERS)) {
    for (const interval of ["monthly", "annual"] as const) {
      ids.push(tier.products[interval].apple, tier.products[interval].google);
    }
  }
  return ids;
}
