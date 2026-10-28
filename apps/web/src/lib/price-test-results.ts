/**
 * Web price test results (lib/price-test.ts), per group:
 *   std            $9.99 / $89.99 (the 50/50 control)
 *   low            $6.99 / $39.99 early bird (the 50/50 test arm)
 *   low:planners   Planners campaign, always early bird (not in the 50/50)
 *   low:planners-reg  Planners registrations campaign (not in the 50/50)
 *   low:preview / std:preview  internal preview links (shown, not judged)
 *
 * Per group: paywall viewers (funnel_price_arm is logged at the paywall),
 * checkouts started, paid trials, annual share, ended trials, paid (still PRO,
 * no billing failure, 7+ days after the trial started), and estimated
 * first-year revenue per 100 paywall viewers:
 *   paid rate × (annual share × annual price + monthly share × monthly price
 *   × MONTHLY_PAID_MONTHS), using an assumed 42% paid rate until 5 trials
 *   have ended. Plus a day-by-day table (Central time) of viewers and trials.
 * Updated 2026-10-28 for the admin Funnel dashboard (Keenan: early bird vs
 * normal price over the next 10 days).
 */
import { prisma } from "@/lib/prisma";

import { pricesForArm, type PriceArm } from "./price-test-shared";

const TRIAL_MS = 7 * 24 * 3600_000;
const MONTHLY_PAID_MONTHS = 3.7;
const ASSUMED_PAID_RATE = 0.42;
const TZ = "America/Chicago";

export interface ArmResult {
  arm: string;
  label: string;
  inSplit: boolean;
  viewers: number;
  checkouts: number;
  trials: number;
  trialRatePct: number | null;
  annual: number;
  annualPct: number | null;
  ended: number;
  paid: number;
  paidRatePct: number | null;
  yr1Per100ViewersDollars: number | null;
  paidRateAssumed: boolean;
}

export interface DayRow {
  day: string;
  byArm: Record<string, { viewers: number; trials: number }>;
}

function groupLabel(key: string): { label: string; inSplit: boolean } {
  const [arm, src] = key.split(":");
  const p = pricesForArm(arm === "low" ? "low" : "std");
  const price = `${p.monthly}/mo · ${p.annual}/yr`;
  if (!src) return { label: arm === "low" ? `Early bird (${price})` : `Normal price (${price})`, inSplit: true };
  if (src === "planners") return { label: `Planners campaign (${price})`, inSplit: false };
  if (src === "planners-reg") return { label: `Planners registrations campaign (${price})`, inSplit: false };
  return { label: `${src} link (${price})`, inSplit: false };
}

const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export async function priceTestResults(since: Date, until: Date) {
  const armEvents = await prisma.onboardingEvent.findMany({
    where: { event: "funnel_price_arm", createdAt: { gte: since, lt: until }, isBot: false },
    select: { userId: true, sessionToken: true, value: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // A person = userId when known, else the funnel session. Latest group wins.
  const groupOf = new Map<string, string>(); // person → group key
  const keyOfSession = new Map<string, string>(); // session → person
  const firstSeen = new Map<string, Date>();
  for (const e of armEvents) {
    const key = e.value ?? "";
    if (!/^(low|std)(:|$)/.test(key)) continue;
    const who = e.userId ?? e.sessionToken;
    if (!who) continue;
    groupOf.set(who, key);
    if (!firstSeen.has(who)) firstSeen.set(who, e.createdAt);
    if (e.sessionToken) keyOfSession.set(e.sessionToken, who);
  }
  const people = [...groupOf.keys()];
  const userIds = people.filter((p) => armEvents.some((e) => e.userId === p));
  const sessions = [...keyOfSession.keys()];

  // Checkouts started, by person.
  const checkouts = new Set<string>();
  if (userIds.length || sessions.length) {
    const ev = await prisma.onboardingEvent.findMany({
      where: {
        event: "funnel_checkout_started",
        createdAt: { gte: since },
        OR: [{ userId: { in: userIds } }, { sessionToken: { in: sessions } }],
      },
      select: { userId: true, sessionToken: true },
    });
    for (const e of ev) {
      const who = (e.userId && groupOf.has(e.userId) ? e.userId : null) ?? (e.sessionToken ? keyOfSession.get(e.sessionToken) : null);
      if (who) checkouts.add(who);
    }
  }

  // Paid trials (first payment), with plan and outcome.
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
  const trial = new Map<string, { annual: boolean; ended: boolean; paid: boolean; at: Date }>();
  for (const u of users) {
    if (/heelerdigital/i.test(u.email)) continue;
    const f = firstPay.get(u.id)!;
    const ended = now > f.at.getTime() + TRIAL_MS;
    trial.set(u.id, { annual: f.annual, ended, paid: ended && u.subscriptionStatus === "PRO" && !u.stripeFirstFailureAt, at: f.at });
  }

  const keys = [...new Set([...groupOf.values(), "std", "low"])].sort((a, b) => {
    const order = (k: string) => (k === "std" ? 0 : k === "low" ? 1 : k.includes("preview") ? 9 : 2);
    return order(a) - order(b) || a.localeCompare(b);
  });

  const arms: ArmResult[] = keys.map((key) => {
    const { label, inSplit } = groupLabel(key);
    const price = pricesForArm((key.startsWith("low") ? "low" : "std") as PriceArm);
    const members = people.filter((p) => groupOf.get(p) === key);
    const t = members.map((p) => trial.get(p)).filter((x): x is NonNullable<typeof x> => !!x);
    const viewers = members.length;
    const trials = t.length;
    const annual = t.filter((x) => x.annual).length;
    const ended = t.filter((x) => x.ended).length;
    const paid = t.filter((x) => x.paid).length;
    const paidRateAssumed = ended < 5;
    const paidRate = paidRateAssumed ? ASSUMED_PAID_RATE : paid / ended;
    const perTrial = trials
      ? paidRate * ((annual / trials) * (price.annualCents / 100) + (1 - annual / trials) * (price.monthlyCents / 100) * MONTHLY_PAID_MONTHS)
      : 0;
    return {
      arm: key,
      label,
      inSplit,
      viewers,
      checkouts: members.filter((p) => checkouts.has(p)).length,
      trials,
      trialRatePct: viewers ? Math.round((trials / viewers) * 1000) / 10 : null,
      annual,
      annualPct: trials ? Math.round((annual / trials) * 100) : null,
      ended,
      paid,
      paidRatePct: ended ? Math.round((paid / ended) * 1000) / 10 : null,
      yr1Per100ViewersDollars: viewers ? Math.round(((trials * perTrial) / viewers) * 100) : null,
      paidRateAssumed,
    };
  });

  // Day by day (Central): viewers by first paywall view, trials by first payment.
  const days = new Map<string, DayRow>();
  const cell = (day: string, key: string) => {
    const row = days.get(day) ?? { day, byArm: {} };
    days.set(day, row);
    return (row.byArm[key] ??= { viewers: 0, trials: 0 });
  };
  for (const p of people) {
    const key = groupOf.get(p)!;
    cell(dayOf(firstSeen.get(p)!), key).viewers++;
    const t = trial.get(p);
    if (t) cell(dayOf(t.at), key).trials++;
  }
  const daily = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));

  // Back-compat for the old caller: link-pinned view counts.
  const pinnedPaywallViews = Object.fromEntries(arms.filter((a) => !a.inSplit).map((a) => [a.arm, a.viewers]));
  return { since: since.toISOString(), until: until.toISOString(), arms, daily, pinnedPaywallViews };
}
