/**
 * New vs old web paywall (2026-10-28, per Keenan: "we just re-vamped the
 * paywall screen yesterday ... metrics pre-today vs today and on").
 *
 *   Old paywall   the 7 Central days before Oct 28
 *   New paywall   Oct 28 (Central) onward, all traffic
 *   New, normal price only   the price test's $9.99/$89.99 group, the
 *                 fairest comparison: same price as the old paywall
 *                 (lib/price-test-results.ts)
 *
 * Per window: paywall viewers (funnel sessions, bots excluded), checkouts
 * started, paid trials (first payment), conversion at each step, yearly
 * share, and per-day averages since the windows differ in length.
 */
import { prisma } from "@/lib/prisma";
import { isInternalEmail } from "@/lib/internal-traffic";

export const NEW_PAYWALL_FROM = new Date("2026-10-28T05:00:00Z"); // Oct 28, 00:00 CT
const OLD_DAYS = 7;

export interface PaywallWindow {
  key: string;
  label: string;
  from: string;
  to: string;
  days: number;
  viewers: number;
  checkouts: number;
  trials: number;
  annualPct: number | null;
  checkoutRatePct: number | null;
  checkoutToTrialPct: number | null;
  trialRatePct: number | null;
  viewersPerDay: number;
  trialsPerDay: number;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

async function windowStats(key: string, label: string, from: Date, to: Date): Promise<PaywallWindow> {
  const notBot = { isBot: false };
  const [pw, co, pays] = await Promise.all([
    prisma.onboardingEvent.findMany({ where: { event: "funnel_v9_paywall_viewed", createdAt: { gte: from, lt: to }, ...notBot }, select: { sessionToken: true, userId: true } }),
    prisma.onboardingEvent.findMany({ where: { event: "funnel_checkout_started", createdAt: { gte: from, lt: to }, ...notBot }, select: { sessionToken: true, userId: true } }),
    prisma.onboardingEvent.findMany({
      where: { event: "funnel_payment_completed", value: { contains: "first_payment" }, createdAt: { gte: from, lt: to }, userId: { not: null } },
      select: { userId: true, value: true },
    }),
  ]);
  const people = (rows: { sessionToken: string | null; userId: string | null }[]) => new Set(rows.map((r) => r.sessionToken ?? r.userId).filter(Boolean)).size;
  const plan = new Map<string, boolean>();
  for (const p of pays) if (!plan.has(p.userId!)) plan.set(p.userId!, /^(annual|yearly)/.test(p.value ?? ""));
  const users = plan.size ? await prisma.user.findMany({ where: { id: { in: [...plan.keys()] }, isAdmin: false }, select: { id: true, email: true } }) : [];
  const real = users.filter((u) => !isInternalEmail(u.email));
  const viewers = people(pw);
  const checkouts = people(co);
  const trials = real.length;
  const annual = real.filter((u) => plan.get(u.id)).length;
  const days = Math.max(0.25, (to.getTime() - from.getTime()) / 86400_000);
  return {
    key,
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    days: Math.round(days * 10) / 10,
    viewers,
    checkouts,
    trials,
    annualPct: trials ? Math.round((annual / trials) * 100) : null,
    checkoutRatePct: pct(checkouts, viewers),
    checkoutToTrialPct: pct(trials, checkouts),
    trialRatePct: pct(trials, viewers),
    viewersPerDay: Math.round((viewers / days) * 10) / 10,
    trialsPerDay: Math.round((trials / days) * 10) / 10,
  };
}

export async function paywallCompare(now: Date = new Date()) {
  const oldFrom = new Date(NEW_PAYWALL_FROM.getTime() - OLD_DAYS * 86400_000);
  const [oldW, newW] = await Promise.all([
    windowStats("old", "Old paywall (7 days before Oct 28)", oldFrom, NEW_PAYWALL_FROM),
    windowStats("new", "New paywall (Oct 28 on, all prices)", NEW_PAYWALL_FROM, now),
  ]);
  // Same price as the old paywall: the price test's normal-price group.
  let normal: PaywallWindow | null = null;
  try {
    const { priceTestResults } = await import("@/lib/price-test-results");
    const r = await priceTestResults(NEW_PAYWALL_FROM, now);
    const std = r.arms.find((a) => a.arm === "std");
    if (std) {
      const days = Math.max(0.25, (now.getTime() - NEW_PAYWALL_FROM.getTime()) / 86400_000);
      normal = {
        key: "new-normal",
        label: "New paywall, normal price only ($9.99 / $89.99)",
        from: NEW_PAYWALL_FROM.toISOString(),
        to: now.toISOString(),
        days: Math.round(days * 10) / 10,
        viewers: std.viewers,
        checkouts: std.checkouts,
        trials: std.trials,
        annualPct: std.annualPct,
        checkoutRatePct: pct(std.checkouts, std.viewers),
        checkoutToTrialPct: pct(std.trials, std.checkouts),
        trialRatePct: std.trialRatePct,
        viewersPerDay: Math.round((std.viewers / days) * 10) / 10,
        trialsPerDay: Math.round((std.trials / days) * 10) / 10,
      };
    }
  } catch {
    normal = null;
  }
  return { windows: [oldW, newW, ...(normal ? [normal] : [])] };
}
