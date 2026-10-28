/**
 * Server half of the web price test (see lib/price-test-shared.ts).
 *
 * Assignment (api/funnel/price-arm, called when the funnel mounts):
 *   - flag on, cookie set   → keep that arm (30 days)
 *   - flag on, no cookie    → coin flip, set cookie
 *   - flag off              → clear the cookie (everyone back to std)
 * Checkout charges whatever the cookie says, flag or not, so someone who saw
 * $6.99 moments before the test was switched off is still charged $6.99.
 * The flag is read from the DB with a 30-second memo (like lib/funnel-split).
 */
import { prisma } from "@/lib/prisma";
import { PRICING } from "@/lib/pricing";

import { PRICE_TEST_FLAG, parsePriceArm, type PriceArm } from "./price-test-shared";

export * from "./price-test-shared";

/** Live Stripe prices for the low arm. $6.99 monthly created 2026-10-27;
 *  $39.99 annual is the pre-September annual price (still active). */
const LOW_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_TEST_MONTHLY ?? "price_1UVKSDD9XJakJqj5khvXc1Ul",
  yearly: process.env.STRIPE_PRICE_TEST_YEARLY ?? "price_1TcSPvD9XJakJqj5C2dITYrR",
};

const TTL_MS = 30_000;
let memo: { at: number; on: boolean } | null = null;

export async function isPriceTestOn(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.PRICE_TEST_FORCE) return process.env.PRICE_TEST_FORCE === "on";
  if (memo && Date.now() - memo.at < TTL_MS) return memo.on;
  let on = false;
  try {
    const row = await prisma.featureFlag.findUnique({ where: { key: PRICE_TEST_FLAG }, select: { enabled: true, rolloutPercentage: true } });
    on = !!row?.enabled && row.rolloutPercentage > 0;
  } catch {
    on = false;
  }
  memo = { at: Date.now(), on };
  return on;
}

export function pickPriceArm(cookieValue: string | undefined): { arm: PriceArm; fresh: boolean } {
  const saved = parsePriceArm(cookieValue);
  if (saved) return { arm: saved, fresh: false };
  return { arm: Math.random() < 0.5 ? "low" : "std", fresh: true };
}

/** Stripe price id to charge for this arm + interval. */
export function stripePriceIdFor(arm: PriceArm, interval: "monthly" | "yearly"): string {
  if (arm === "low") return LOW_PRICE_IDS[interval];
  return interval === "yearly" ? PRICING.annual.stripeId : PRICING.monthly.stripeId;
}
