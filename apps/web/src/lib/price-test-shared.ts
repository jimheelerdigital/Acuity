/**
 * Web price test (2026-10-27, per Keenan; runs Mon 2026-11-02 → 11-09).
 * Web funnel traffic only (/start, /start-test). Half of new visitors see
 * $6.99/month or $39.99/year ("low"), half the live $9.99 / $89.99 ("std").
 * The app / App Store paywall is untouched.
 *
 * Browser-safe half: the funnel reads the arm from a cookie that the server
 * (api/funnel/price-arm) sets, and checkout reads the SAME cookie, so the
 * price shown is always the price charged. See lib/price-test.ts.
 */
import { displayTier, formatDollars } from "@/lib/pricing";

export const PRICE_TEST_FLAG = "web_price_test";
export const PTEST_COOKIE = "rp_ptest";
export type PriceArm = "low" | "std";

export const LOW_TIER = { monthlyCents: 699, annualCents: 3999 } as const;

export function parsePriceArm(v: string | null | undefined): PriceArm | null {
  return v === "low" || v === "std" ? v : null;
}

/** Arm from document.cookie (client only); "std" when unset. */
export function clientPriceArm(): PriceArm {
  if (typeof document === "undefined") return "std";
  const m = document.cookie.match(new RegExp(`(?:^|; )${PTEST_COOKIE}=([^;]+)`));
  return parsePriceArm(m?.[1]) ?? "std";
}

export interface ArmPrices {
  arm: PriceArm;
  monthlyCents: number;
  annualCents: number;
  monthly: string;
  annual: string;
  annualAsMonthly: string;
  savingsPct: string;
}

export function pricesForArm(arm: PriceArm): ArmPrices {
  const t = arm === "low" ? LOW_TIER : displayTier();
  const run = t.monthlyCents * 12;
  return {
    arm,
    monthlyCents: t.monthlyCents,
    annualCents: t.annualCents,
    monthly: formatDollars(t.monthlyCents),
    annual: formatDollars(t.annualCents),
    annualAsMonthly: formatDollars(Math.round(t.annualCents / 12)),
    savingsPct: `${run > 0 ? Math.round(((run - t.annualCents) / run) * 100) : 0}%`,
  };
}

/** Purchase value in dollars for Meta, per arm. */
export function armPlanValueDollars(arm: PriceArm, interval: string | null | undefined): number {
  const p = pricesForArm(arm);
  const yearly = interval === "yearly" || interval === "annual" || interval === "year";
  return (yearly ? p.annualCents : p.monthlyCents) / 100;
}
