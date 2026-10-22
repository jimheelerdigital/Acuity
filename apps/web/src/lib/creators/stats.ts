import "server-only";

/**
 * Read models for the creator dashboard and the admin console. Customer
 * identities never leave this file toward a creator: the dashboard gets
 * customer NUMBERS only.
 */

import { prisma } from "@/lib/prisma";

import { BOOST_LIST_MAX_COST_PER_TRIAL_CENTS, DORMANT_DAYS } from "./config";
import { trialUserIds } from "./flags";
import { balancesFor, type CreatorBalance } from "./ledger";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Funnel {
  clicks: number;
  signups: number;
  trials: number;
  paying: number;
}

async function funnelFor(creatorId: string, since: Date | null): Promise<Funnel> {
  const createdAt = since ? { gte: since } : undefined;
  const [clicks, refs] = await Promise.all([
    prisma.creatorReferralClick.count({ where: { creatorId, createdAt } }),
    prisma.creatorReferral.findMany({
      where: { creatorId, attributedAt: createdAt },
      select: { userId: true, firstPaidAt: true },
    }),
  ]);
  const trials = await trialUserIds(refs.map((r) => r.userId));
  return {
    clicks,
    signups: refs.length,
    trials: trials.size,
    paying: refs.filter((r) => r.firstPaidAt).length,
  };
}

export async function creatorFunnels(creatorId: string) {
  const [last30, allTime] = await Promise.all([
    funnelFor(creatorId, new Date(Date.now() - 30 * DAY_MS)),
    funnelFor(creatorId, null),
  ]);
  return { last30, allTime };
}

export interface CustomerRow {
  number: number;
  startDate: string | null;
  plan: string | null;
  windowEnd: string | null;
  commissionToDate: number;
  refunded: boolean;
}

/** One row per referred PAYING customer, numbered by first payment. */
export async function creatorCustomers(creatorId: string): Promise<CustomerRow[]> {
  const refs = await prisma.creatorReferral.findMany({
    where: { creatorId, firstPaidAt: { not: null } },
    orderBy: { firstPaidAt: "asc" },
    select: { userId: true, firstPaidAt: true, windowEnd: true },
  });
  if (refs.length === 0) return [];
  const userIds = refs.map((r) => r.userId);
  const [events, entries] = await Promise.all([
    prisma.creatorRevenueEvent.findMany({
      where: { userId: { in: userIds } },
      orderBy: { occurredAt: "asc" },
      select: { userId: true, type: true, plan: true },
    }),
    prisma.creatorLedgerEntry.groupBy({
      by: ["userId"],
      where: { creatorId, userId: { in: userIds }, type: { in: ["commission", "clawback"] }, status: { not: "voided" } },
      _sum: { amount: true },
    }),
  ]);
  const commission = new Map(entries.map((e) => [e.userId, e._sum.amount ?? 0]));
  return refs.map((r, i) => {
    const mine = events.filter((e) => e.userId === r.userId);
    const lastPayment = [...mine].reverse().find((e) => e.type === "payment");
    return {
      number: i + 1,
      startDate: r.firstPaidAt?.toISOString().slice(0, 10) ?? null,
      plan: lastPayment?.plan ?? null,
      windowEnd: r.windowEnd?.toISOString().slice(0, 10) ?? null,
      commissionToDate: commission.get(r.userId) ?? 0,
      refunded: mine.some((e) => e.type === "refund" || e.type === "dispute"),
    };
  });
}

// ── Admin: Creators tab ───────────────────────────────────────────────

export interface AdminCreatorRow {
  id: string;
  handle: string;
  platform: string;
  name: string;
  email: string | null;
  status: string;
  persona: string | null;
  creatorType: string | null;
  referralCode: string | null;
  clicks: number;
  signups: number;
  trials: number;
  paying: number;
  revenueCents: number;
  commissionOwedCents: number;
  adSpendCents: number;
  roi: number | null;
  balance: CreatorBalance;
  agreementAccepted: boolean;
  payoutReady: boolean;
  openFlags: number;
  lastClickAt: string | null;
}

export async function adminCreatorRows(): Promise<AdminCreatorRow[]> {
  const creators = await prisma.ugcCreator.findMany({
    where: {
      OR: [
        { referralCode: { not: null } },
        { status: { in: ["deal", "briefed", "delivered", "paid"] } },
      ],
    },
    select: {
      id: true,
      handle: true,
      platform: true,
      displayName: true,
      email: true,
      status: true,
      persona: true,
      creatorType: true,
      referralCode: true,
      agreementAcceptedAt: true,
      stripePayoutsEnabled: true,
      paypalEmail: true,
    },
  });
  const ids = creators.map((c) => c.id);
  const [balances, clickAgg, refs, posts, flags] = await Promise.all([
    balancesFor(ids),
    prisma.creatorReferralClick.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: ids } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.creatorReferral.findMany({
      where: { creatorId: { in: ids } },
      select: { creatorId: true, userId: true, firstPaidAt: true },
    }),
    prisma.creatorPost.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: ids } },
      _sum: { adSpend: true },
    }),
    prisma.creatorFlag.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: ids }, status: { in: ["open", "held"] } },
      _count: { _all: true },
    }),
  ]);
  const userIds = refs.map((r) => r.userId);
  const [trials, revById] = await Promise.all([trialUserIds(userIds), netRevenueByUser(userIds)]);

  const clickBy = new Map(clickAgg.map((c) => [c.creatorId, c]));
  const spendBy = new Map(posts.map((p) => [p.creatorId, p._sum.adSpend ?? 0]));
  const flagBy = new Map(flags.map((f) => [f.creatorId, f._count._all]));

  return creators
    .map((c) => {
      const mine = refs.filter((r) => r.creatorId === c.id);
      const b = balances.get(c.id)!;
      const revenueCents = mine.reduce((s, r) => s + (revById.get(r.userId) ?? 0), 0);
      const adSpendCents = spendBy.get(c.id) ?? 0;
      const totalCommission = b.commissionNet + b.bonuses;
      const cost = totalCommission + adSpendCents;
      return {
        id: c.id,
        handle: c.handle,
        platform: c.platform,
        name: c.displayName ?? `@${c.handle}`,
        email: c.email,
        status: c.status,
        persona: c.persona,
        creatorType: c.creatorType,
        referralCode: c.referralCode,
        clicks: clickBy.get(c.id)?._count._all ?? 0,
        signups: mine.length,
        trials: mine.filter((r) => trials.has(r.userId)).length,
        paying: mine.filter((r) => r.firstPaidAt).length,
        revenueCents,
        commissionOwedCents: b.pending + b.payable,
        adSpendCents,
        roi: cost > 0 ? revenueCents / cost : null,
        balance: b,
        agreementAccepted: Boolean(c.agreementAcceptedAt),
        payoutReady: Boolean(c.stripePayoutsEnabled || c.paypalEmail),
        openFlags: flagBy.get(c.id) ?? 0,
        lastClickAt: clickBy.get(c.id)?._max.createdAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1));
}

/**
 * Net revenue per referred customer: payments, minus the net share of each
 * refund / dispute, plus back any dispute we won.
 */
export async function netRevenueByUser(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const events = await prisma.creatorRevenueEvent.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true, type: true, netRevenue: true, amountPaid: true, relatesToId: true },
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  const reversalNet = (rev: (typeof events)[number]): number => {
    const p = rev.relatesToId ? byId.get(rev.relatesToId) : undefined;
    if (!p || p.amountPaid <= 0) return 0;
    return Math.round(p.netRevenue * Math.min(1, rev.amountPaid / p.amountPaid));
  };
  for (const e of events) {
    let delta = 0;
    if (e.type === "payment") delta = e.netRevenue;
    else if (e.type === "refund" || e.type === "dispute") delta = -reversalNet(e);
    else if (e.type === "dispute_won") {
      const d = e.relatesToId ? byId.get(e.relatesToId) : undefined;
      delta = d ? reversalNet(d) : 0;
    }
    out.set(e.userId, (out.get(e.userId) ?? 0) + delta);
  }
  return out;
}

export async function adminTopline(rows: AdminCreatorRow[]) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [ledgerMonth, postsMonth, refsMonth] = await Promise.all([
    prisma.creatorLedgerEntry.aggregate({
      where: { createdAt: { gte: monthStart }, status: { not: "voided" }, type: { not: "payout" } },
      _sum: { amount: true },
    }),
    prisma.creatorPost.aggregate({ where: { boostedAt: { gte: monthStart } }, _sum: { adSpend: true } }),
    prisma.creatorReferral.findMany({ where: { attributedAt: { gte: monthStart } }, select: { userId: true } }),
  ]);
  const trialsMonth = (await trialUserIds(refsMonth.map((r) => r.userId))).size;
  const spendMonth = (ledgerMonth._sum.amount ?? 0) + (postsMonth._sum.adSpend ?? 0);

  const posts = await prisma.creatorPost.findMany({
    where: { boosted: true },
    include: { creator: { select: { handle: true, displayName: true } } },
    orderBy: { boostedAt: "desc" },
  });
  const boost = posts
    .filter((p) => (p.trials ?? 0) > 0 && (p.adSpend ?? 0) / (p.trials ?? 1) < BOOST_LIST_MAX_COST_PER_TRIAL_CENTS)
    .map((p) => ({
      postId: p.id,
      url: p.url,
      creator: p.creator.displayName ?? `@${p.creator.handle}`,
      costPerTrialCents: Math.round((p.adSpend ?? 0) / (p.trials ?? 1)),
    }));
  const dormantCutoff = now.getTime() - DORMANT_DAYS * DAY_MS;
  const dormant = rows
    .filter((r) => r.referralCode && (!r.lastClickAt || new Date(r.lastClickAt).getTime() < dormantCutoff))
    .map((r) => ({ id: r.id, name: r.name, lastClickAt: r.lastClickAt }));
  return {
    creatorSpendMonthCents: spendMonth,
    attributedRevenueCents: rows.reduce((s, r) => s + r.revenueCents, 0),
    blendedCostPerTrialCents: trialsMonth > 0 ? Math.round(spendMonth / trialsMonth) : null,
    trialsMonth,
    boost,
    dormant,
  };
}
