/**
 * Web price test results (lib/price-test.ts), per arm:
 *   viewers     funnel sessions/users that saw the paywall with that arm
 *               (funnel_price_arm is logged at the paywall)
 *   trials      of those, card trials started (first payment event)
 *   annual      of the trials, how many chose the annual plan
 *   ended/paid  trials past day 7, and those still paying (PRO, no failure)
 *   yr1/100     estimated first-year revenue per 100 paywall viewers:
 *               paying annual × annual price + paying monthly × monthly
 *               price × MONTHLY_PAID_MONTHS (~3.7, Ripple's year-1 average),
 *               using the observed paid rate (or an assumed 42% while too
 *               few trials have ended).
 */
import { prisma } from "@/lib/prisma";

import { pricesForArm, type PriceArm } from "./price-test-shared";

const TRIAL_MS = 7 * 24 * 3600_000;
const MONTHLY_PAID_MONTHS = 3.7;
const ASSUMED_PAID_RATE = 0.42;

export interface ArmResult {
  arm: PriceArm;
  label: string;
  viewers: number;
  trials: number;
  trialRatePct: number | null;
  annual: number;
  ended: number;
  paid: number;
  paidRatePct: number | null;
  yr1Per100ViewersDollars: number | null;
  paidRateAssumed: boolean;
}

export async function priceTestResults(since: Date, until: Date) {
  const armEvents = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_price_arm", createdAt: { gte: since, lt: until }, isBot: false },
    select: { userId: true, sessionToken: true, value: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // A person = userId when known, else the funnel session. Latest arm wins.
  const armByPerson = new Map<string, PriceArm>();
  const armByUser = new Map<string, PriceArm>();
  for (const e of armEvents) {
    const arm = e.value === "low" ? "low" : e.value === "std" ? "std" : null;
    if (!arm) continue;
    const who = e.userId ?? e.sessionToken;
    if (who) armByPerson.set(who, arm);
    if (e.userId) armByUser.set(e.userId, arm);
  }

  const userIds = [...armByUser.keys()];
  const pays = userIds.length
    ? await prisma.onboardingEvent.findMany({
        where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, userId: { in: userIds }, createdAt: { gte: since } },
        select: { userId: true, value: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const firstPay = new Map<string, { at: Date; annual: boolean }>();
  for (const p of pays) if (!firstPay.has(p.userId!)) firstPay.set(p.userId!, { at: p.createdAt, annual: /^(annual|yearly)/.test(p.value ?? "") });
  const users = firstPay.size
    ? await prisma.user.findMany({
        where: { id: { in: [...firstPay.keys()] }, isAdmin: false },
        select: { id: true, email: true, subscriptionStatus: true, stripeFirstFailureAt: true },
      })
    : [];
  const now = Date.now();

  // Link-pinned visitors (e.g. "low:planners") are reported on their own.
  const pinned = new Map<string, number>();
  for (const e of armEvents) if (e.value?.includes(":")) pinned.set(e.value, (pinned.get(e.value) ?? 0) + 1);

  const arms: ArmResult[] = (["std", "low"] as const).map((arm) => {
    const price = pricesForArm(arm);
    const viewers = [...armByPerson.values()].filter((a) => a === arm).length;
    const mine = users
      .filter((u) => armByUser.get(u.id) === arm && !/heelerdigital/i.test(u.email))
      .map((u) => {
        const f = firstPay.get(u.id)!;
        const ended = now > f.at.getTime() + TRIAL_MS;
        return { annual: f.annual, ended, paid: ended && u.subscriptionStatus === "PRO" && !u.stripeFirstFailureAt };
      });
    const trials = mine.length;
    const annual = mine.filter((m) => m.annual).length;
    const ended = mine.filter((m) => m.ended).length;
    const paid = mine.filter((m) => m.paid).length;
    const paidRateAssumed = ended < 5;
    const paidRate = paidRateAssumed ? ASSUMED_PAID_RATE : paid / ended;
    const perTrial = trials
      ? paidRate * ((annual / trials) * (price.annualCents / 100) + (1 - annual / trials) * (price.monthlyCents / 100) * MONTHLY_PAID_MONTHS)
      : 0;
    return {
      arm,
      label: `${price.monthly}/mo · ${price.annual}/yr`,
      viewers,
      trials,
      trialRatePct: viewers ? Math.round((trials / viewers) * 1000) / 10 : null,
      annual,
      ended,
      paid,
      paidRatePct: ended ? Math.round((paid / ended) * 1000) / 10 : null,
      yr1Per100ViewersDollars: viewers ? Math.round(((trials * perTrial) / viewers) * 100) : null,
      paidRateAssumed,
    };
  });
  return { since: since.toISOString(), until: until.toISOString(), arms, pinnedPaywallViews: Object.fromEntries(pinned) };
}
