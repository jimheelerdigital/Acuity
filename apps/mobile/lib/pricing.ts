/**
 * Mobile-side displayed-price constants.
 *
 * 2026-08-15: the promotion this file's original header asked for is done.
 * These values are no longer a hand-mirrored copy of
 * apps/web/src/lib/pricing.ts — both now derive from ONE definition in
 * packages/shared/src/pricing-plans.ts (LEGACY_TIER), so web/mobile price
 * drift is structurally impossible rather than prevented by a comment.
 *
 * Values are UNCHANGED ($4.99 / $39.99). Raising prices is a config change
 * (newPricingEnabled + grandfathering), not an edit here.
 *
 * Stripe Price IDs intentionally NOT mirrored — mobile never calls
 * Stripe directly. The paywall hands off to web's /upgrade via
 * SFSafariView, where the canonical Price IDs are env-var-driven.
 */

import {
  DEFAULT_PRICING_CONFIG,
  LEGACY_TIER,
  pricingTierFor,
  type PricingTier,
} from "@acuity/shared";

export const MONTHLY_PRICE_CENTS = LEGACY_TIER.monthlyCents;
export const ANNUAL_PRICE_CENTS = LEGACY_TIER.annualCents;

// ── Display tier — what a PROSPECT would be charged ──────────────────
//
// Mirrors apps/web/src/lib/pricing.ts. Every user-visible price must come
// from here so a page can never quote a different number than the store
// charges once newPricingEnabled flips.
//
// On mobile the StoreKit/Play `localizedPrice` is still preferred wherever
// a real product has loaded — it is the only value guaranteed to match the
// user's store account and currency. These helpers are the FALLBACK, and
// the fallback is exactly where a stale literal does the most damage: it
// renders precisely when the store lookup failed, so nobody notices it is
// wrong until someone is charged.
//
// Behaviour today: newPricingEnabled is false, so this resolves LEGACY_TIER
// and every display stays $4.99 / $39.99.

/**
 * THE parser for EXPO_PUBLIC_NEW_PRICING. Exported so there is exactly one
 * implementation on mobile — `lib/feature-flags.ts::isNewPricingEnabled`
 * delegates here rather than re-reading the env var.
 *
 * Why that matters: this file and feature-flags.ts previously each parsed
 * the var, and they disagreed. feature-flags accepted only the literal
 * "true", while the `pricing` EAS profile sets "1". A build with both the
 * v10 and pricing flags on would therefore have shown V2 prices in the app
 * and LEGACY prices on the v10 paywall — the exact "page quotes a different
 * number than the store charges" failure this module exists to prevent.
 *
 * Accepts 1 / true / on / yes (trimmed, case-insensitive); everything else,
 * including a malformed value, is OFF. Fail-closed is deliberate on a
 * billing flag.
 *
 * Static member access is required — Metro only inlines EXPO_PUBLIC_* for
 * static property reads. A dynamic `process.env[key]` lookup resolves to
 * undefined in a release bundle, which reads as "flag off" and is silently
 * unflippable. That is why this read lives in one place rather than being
 * passed around as a value.
 */
export function newPricingEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_NEW_PRICING;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** The tier a brand-new customer would be charged at this moment. */
export function displayTier(): PricingTier {
  return pricingTierFor(
    { paidSince: null, legacyUnknownStart: false },
    { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: newPricingEnabled() }
  );
}

/** Prospect-facing monthly price, e.g. "$4.99". */
export function displayMonthly(): string {
  return formatDollars(displayTier().monthlyCents);
}

/** Prospect-facing annual price, e.g. "$39.99". */
export function displayAnnual(): string {
  return formatDollars(displayTier().annualCents);
}
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

const monthlyRunRate = MONTHLY_PRICE_CENTS * 12;
const annualSavingsCents = monthlyRunRate - ANNUAL_PRICE_CENTS;
const annualSavingsPct =
  monthlyRunRate > 0
    ? Math.round((annualSavingsCents / monthlyRunRate) * 100)
    : 0;

export const PRICING = {
  monthly: {
    price: MONTHLY_PRICE_CENTS / 100,
    cents: MONTHLY_PRICE_CENTS,
  },
  annual: {
    price: ANNUAL_PRICE_CENTS / 100,
    cents: ANNUAL_PRICE_CENTS,
    savingsVsMonthly: `${annualSavingsPct}%`,
    savingsCents: annualSavingsCents,
  },
} as const;

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
