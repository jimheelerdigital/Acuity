/**
 * Who is due a paywall win-back email right now (2026-10-27). Shared by the
 * recovery orchestrator (#2, #3 on its 15-min tick) and paywall-winback-fast
 * (#1 on a 5-min tick, so it lands 5–10 min after she leaves). Timing and
 * eligibility rules live in lib/paywall-winback.ts.
 */
import "server-only";

import { isInternalEmail } from "@/lib/internal-traffic";
import {
  isWinbackEligible,
  nextWinbackStep,
  PAYWALL_EVENTS,
  PAYWALL_WINBACK_START,
  WINBACK_MAX_AGE_MS,
  type WinbackKey,
} from "@/lib/paywall-winback";
import { prisma } from "@/lib/prisma";

export interface DueWinback {
  userId: string;
  key: WinbackKey;
  /** Account creation, for the "new account skips the 24h throttle" rule. */
  createdAt: Date;
}

export async function findDueWinbacks(now: Date): Promise<DueWinback[]> {
  const since = new Date(Math.max(PAYWALL_WINBACK_START.getTime(), now.getTime() - WINBACK_MAX_AGE_MS));
  const views = await prisma.onboardingEvent.groupBy({
    by: ["userId"],
    where: { event: { in: [...PAYWALL_EVENTS] }, createdAt: { gte: since }, userId: { not: null } },
    _max: { createdAt: true },
  });
  const ids = views.map((v) => v.userId).filter((id): id is string => !!id);
  if (!ids.length) return [];

  const [users, payments, logs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, isAdmin: true, createdAt: true, subscriptionStatus: true, subscriptionSource: true, stripeSubscriptionId: true },
    }),
    prisma.onboardingEvent.findMany({
      where: { userId: { in: ids }, event: "funnel_payment_completed" },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.trialEmailLog.findMany({
      where: { userId: { in: ids }, emailKey: { in: ["paywall_winback_1", "paywall_winback_2", "paywall_winback_3"] } },
      select: { userId: true, emailKey: true, sentAt: true },
    }),
  ]);
  const paidIds = new Set(payments.map((p) => p.userId));
  const lastView = new Map(views.map((v) => [v.userId, v._max.createdAt]));
  const sentBy = new Map<string, Partial<Record<WinbackKey, Date>>>();
  for (const l of logs) {
    if (!l.userId) continue;
    const m = sentBy.get(l.userId) ?? {};
    m[l.emailKey as WinbackKey] = l.sentAt;
    sentBy.set(l.userId, m);
  }

  const due: DueWinback[] = [];
  for (const u of users) {
    const last = lastView.get(u.id);
    if (!last) continue;
    const eligible = isWinbackEligible({
      isAdmin: u.isAdmin,
      internal: isInternalEmail(u.email),
      subscriptionStatus: u.subscriptionStatus,
      subscriptionSource: u.subscriptionSource,
      stripeSubscriptionId: u.stripeSubscriptionId,
      paid: paidIds.has(u.id),
    });
    if (!eligible) continue;
    const key = nextWinbackStep({ now, lastPaywallAt: last, sent: sentBy.get(u.id) ?? {} });
    if (key) due.push({ userId: u.id, key, createdAt: u.createdAt });
  }
  return due;
}
