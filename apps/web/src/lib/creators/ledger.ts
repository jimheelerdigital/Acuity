import "server-only";

/**
 * Creator commission ledger. APPEND-ONLY: every money event is a row,
 * balances are sums. Rows only ever change status (pending → payable → paid,
 * or → voided on an admin reassign).
 *
 * Idempotency: CreatorRevenueEvent.externalEventId and
 * CreatorLedgerEntry.dedupeKey are unique, and a revenue event + its ledger
 * row are written in one transaction, so a replayed webhook or job cannot
 * double-pay.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { BOOST_BONUS_CENTS, HOLD_DAYS, MAX_BOOSTS_PER_MONTH, VIEW_BONUS_TIERS } from "./config";
import {
  clawbackFor,
  commissionFor,
  insideWindow,
  milestonesReached,
  monthKey,
  netRevenue,
  payableAt,
  windowEndFor,
} from "./money";

type Tx = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

export interface PaymentInput {
  userId: string;
  source: "stripe" | "revenuecat";
  store: "stripe" | "app_store" | "play_store";
  externalEventId: string;
  providerEventId?: string | null;
  plan?: string | null;
  /** Cents actually charged (after discounts, including tax). */
  amountPaid: number;
  discount?: number;
  tax?: number;
  currency?: string;
  occurredAt: Date;
  paymentFingerprint?: string | null;
}

export type PaymentResult =
  | { recorded: false; reason: "not_referred" | "zero_amount" | "duplicate" }
  | { recorded: true; revenueEventId: string; commissionCents: number; reason?: "outside_window" };

/**
 * A successful payment (first, renewal, plan change). No referral → no rows.
 * Inside the window → a pending commission payable HOLD_DAYS later.
 */
export async function recordPayment(input: PaymentInput): Promise<PaymentResult> {
  if (!(input.amountPaid > 0)) return { recorded: false, reason: "zero_amount" };
  const referral = await prisma.creatorReferral.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (!referral) return { recorded: false, reason: "not_referred" };

  const tax = input.tax ?? 0;
  const net = netRevenue(input.amountPaid, tax);
  try {
    return await prisma.$transaction(async (tx) => {
      const ev = await tx.creatorRevenueEvent.create({
        data: {
          userId: input.userId,
          source: input.source,
          store: input.store,
          externalEventId: input.externalEventId,
          providerEventId: input.providerEventId ?? null,
          type: "payment",
          plan: input.plan ?? null,
          amountPaid: input.amountPaid,
          discount: input.discount ?? 0,
          tax,
          netRevenue: net,
          currency: (input.currency ?? "usd").toLowerCase(),
          paymentFingerprint: input.paymentFingerprint ?? null,
          occurredAt: input.occurredAt,
        },
        select: { id: true },
      });

      // Re-read inside the transaction: the first payment sets the window.
      const ref = await tx.creatorReferral.findUniqueOrThrow({
        where: { userId: input.userId },
        select: { id: true, creatorId: true, firstPaidAt: true, windowEnd: true },
      });
      let windowEnd = ref.windowEnd;
      // First payment — or an out-of-order webhook for an EARLIER payment.
      if (!ref.firstPaidAt || input.occurredAt < ref.firstPaidAt) {
        windowEnd = windowEndFor(input.occurredAt);
        await tx.creatorReferral.update({
          where: { id: ref.id },
          data: { firstPaidAt: input.occurredAt, windowEnd },
        });
      }
      if (!insideWindow(input.occurredAt, windowEnd)) {
        return { recorded: true, revenueEventId: ev.id, commissionCents: 0, reason: "outside_window" as const };
      }
      const commission = commissionFor(net);
      if (commission > 0) {
        const due = payableAt(input.occurredAt);
        await tx.creatorLedgerEntry.create({
          data: {
            creatorId: ref.creatorId,
            type: "commission",
            amount: commission,
            status: due <= new Date() ? "payable" : "pending",
            payableAt: due,
            revenueEventId: ev.id,
            userId: input.userId,
            dedupeKey: `c:${ev.id}:${ref.creatorId}`,
            reason: `${input.plan ?? "payment"} ${input.store}`,
            createdBy: input.source,
          },
        });
      }
      return { recorded: true, revenueEventId: ev.id, commissionCents: commission };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { recorded: false, reason: "duplicate" };
    throw err;
  }
}

export interface ReversalInput {
  /** externalEventId of the PAYMENT being refunded / disputed. */
  paymentExternalId: string;
  type: "refund" | "dispute";
  source: "stripe" | "revenuecat";
  externalEventId: string;
  providerEventId?: string | null;
  /** Cents returned to the customer (positive). */
  amount: number;
  occurredAt: Date;
}

/**
 * Refund or chargeback: a clawback of the matching share of the commission,
 * applied immediately (payable now, netted against the balance). Never
 * invoiced: a negative balance just carries forward.
 */
export async function recordReversal(input: ReversalInput): Promise<{ clawbackCents: number } | null> {
  const payment = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: input.paymentExternalId },
    select: { id: true, userId: true, store: true, amountPaid: true, netRevenue: true, plan: true },
  });
  if (!payment) return null; // not a referred payment (or never recorded)

  try {
    return await prisma.$transaction(async (tx) => {
      const ev = await tx.creatorRevenueEvent.create({
        data: {
          userId: payment.userId,
          source: input.source,
          store: payment.store,
          externalEventId: input.externalEventId,
          providerEventId: input.providerEventId ?? null,
          type: input.type,
          plan: payment.plan,
          amountPaid: Math.abs(input.amount),
          netRevenue: 0,
          relatesToId: payment.id,
          occurredAt: input.occurredAt,
        },
        select: { id: true },
      });
      const commissions = await tx.creatorLedgerEntry.findMany({
        where: { revenueEventId: payment.id, type: "commission", status: { not: "voided" } },
        select: { creatorId: true, amount: true },
      });
      let total = 0;
      for (const c of commissions) {
        const clawed = await tx.creatorLedgerEntry.aggregate({
          where: {
            creatorId: c.creatorId,
            type: "clawback",
            status: { not: "voided" },
            dedupeKey: { startsWith: `cb:${payment.id}:` },
          },
          _sum: { amount: true },
        });
        const amount = clawbackFor({
          commissionCents: c.amount,
          paymentAmountCents: payment.amountPaid,
          refundAmountCents: Math.abs(input.amount),
          alreadyClawedCents: clawed._sum.amount ?? 0,
        });
        if (amount === 0) continue;
        total += amount;
        await tx.creatorLedgerEntry.create({
          data: {
            creatorId: c.creatorId,
            type: "clawback",
            amount,
            status: "payable",
            payableAt: input.occurredAt,
            revenueEventId: ev.id,
            userId: payment.userId,
            dedupeKey: `cb:${payment.id}:${ev.id}:${c.creatorId}`,
            reason: input.type === "dispute" ? "chargeback" : "refund",
            createdBy: input.source,
          },
        });
      }
      return { clawbackCents: total };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/** We won a chargeback: reverse its clawback with an adjustment. */
export async function recordDisputeWon(params: {
  disputeExternalId: string;
  externalEventId: string;
  providerEventId?: string | null;
  occurredAt: Date;
}): Promise<number> {
  const dispute = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: params.disputeExternalId },
    select: { id: true, userId: true, store: true, amountPaid: true, plan: true },
  });
  if (!dispute) return 0;
  try {
    return await prisma.$transaction(async (tx) => {
      const ev = await tx.creatorRevenueEvent.create({
        data: {
          userId: dispute.userId,
          source: "stripe",
          store: dispute.store,
          externalEventId: params.externalEventId,
          providerEventId: params.providerEventId ?? null,
          type: "dispute_won",
          plan: dispute.plan,
          amountPaid: dispute.amountPaid,
          netRevenue: 0,
          relatesToId: dispute.id,
          occurredAt: params.occurredAt,
        },
        select: { id: true },
      });
      const clawbacks = await tx.creatorLedgerEntry.findMany({
        where: { revenueEventId: dispute.id, type: "clawback", status: { not: "voided" } },
        select: { creatorId: true, amount: true },
      });
      let total = 0;
      for (const c of clawbacks) {
        total += -c.amount;
        await tx.creatorLedgerEntry.create({
          data: {
            creatorId: c.creatorId,
            type: "adjustment",
            amount: -c.amount,
            status: "payable",
            payableAt: params.occurredAt,
            revenueEventId: ev.id,
            userId: dispute.userId,
            dedupeKey: `dw:${dispute.id}:${c.creatorId}`,
            reason: "chargeback won, clawback reversed",
            createdBy: "stripe",
          },
        });
      }
      return total;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return 0;
    throw err;
  }
}

/** Hourly: pending rows whose hold has passed become payable. */
export async function matureLedger(now: Date = new Date()): Promise<number> {
  const res = await prisma.creatorLedgerEntry.updateMany({
    where: { status: "pending", payableAt: { lte: now } },
    data: { status: "payable" },
  });
  return res.count;
}

// ── Bonuses + adjustments ─────────────────────────────────────────────

export type BoostResult =
  | { ok: true; entryId: string }
  | { ok: false; reason: "not_found" | "already_boosted" | "monthly_cap" };

/** Mark a creator post boosted: one $100 boost_bonus per post, payable now. */
export async function markPostBoosted(postId: string, by: string): Promise<BoostResult> {
  const post = await prisma.creatorPost.findUnique({
    where: { id: postId },
    select: { id: true, creatorId: true, boosted: true, url: true },
  });
  if (!post) return { ok: false, reason: "not_found" };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thisMonth = await prisma.creatorLedgerEntry.count({
    where: { type: "boost_bonus", status: { not: "voided" }, createdAt: { gte: monthStart } },
  });
  if (thisMonth >= MAX_BOOSTS_PER_MONTH) return { ok: false, reason: "monthly_cap" };
  try {
    const entry = await prisma.$transaction(async (tx) => {
      await tx.creatorPost.update({
        where: { id: post.id },
        data: { boosted: true, boostedAt: post.boosted ? undefined : now },
      });
      return tx.creatorLedgerEntry.create({
        data: {
          creatorId: post.creatorId,
          type: "boost_bonus",
          amount: BOOST_BONUS_CENTS,
          status: "payable",
          payableAt: now,
          postId: post.id,
          dedupeKey: `boost:${post.id}`,
          reason: `boosted ${post.url}`,
          createdBy: by,
        },
        select: { id: true },
      });
    });
    const { sendBoostEmail } = await import("./emails");
    await sendBoostEmail(post.creatorId, post.url).catch((err) =>
      safeLog.warn("creators.email.boost-failed", { postId, err: err instanceof Error ? err.message : String(err) })
    );
    return { ok: true, entryId: entry.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "already_boosted" };
    throw err;
  }
}

/**
 * View bonus for a post (VIEW_BONUS_TIERS). Pays the tier's total minus what
 * this post already got, so stepping 5k → 25k pays $75 more. Written as an
 * adjustment row (no schema change); dedupeKey views:<postId>:<tier> stops a
 * tier being paid twice.
 */
export async function awardViewBonus(postId: string, tierViews: number, by: string) {
  const tier = VIEW_BONUS_TIERS.find((t) => t.views === tierViews);
  if (!tier) throw new Error("Unknown view tier");
  const post = await prisma.creatorPost.findUnique({ where: { id: postId }, select: { id: true, creatorId: true, url: true } });
  if (!post) throw new Error("Post not found");
  const prior = await prisma.creatorLedgerEntry.findMany({
    where: { postId, dedupeKey: { startsWith: `views:${postId}:` }, status: { not: "voided" } },
    select: { amount: true },
  });
  const paid = prior.reduce((s, r) => s + r.amount, 0);
  const amount = tier.bonusCents - paid;
  if (amount <= 0) throw new Error("This post already has this view bonus or a higher one");
  try {
    return await prisma.creatorLedgerEntry.create({
      data: {
        creatorId: post.creatorId,
        type: "adjustment",
        amount,
        status: "payable",
        payableAt: new Date(),
        postId: post.id,
        dedupeKey: `views:${post.id}:${tier.views}`,
        reason: `view bonus ${tier.views.toLocaleString("en-US")} views: ${post.url}`,
        createdBy: by,
      },
      select: { id: true, amount: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("This post already has this view bonus");
    throw err;
  }
}

export async function addAdjustment(params: {
  creatorId: string;
  amount: number;
  reason: string;
  by: string;
}) {
  const { randomUUID } = await import("node:crypto");
  return prisma.creatorLedgerEntry.create({
    data: {
      creatorId: params.creatorId,
      type: "adjustment",
      amount: Math.round(params.amount),
      status: "payable",
      payableAt: new Date(),
      dedupeKey: `adj:${randomUUID()}`,
      reason: params.reason,
      createdBy: params.by,
    },
  });
}

/**
 * Milestone bonuses. Runs daily; awards any tier a creator has reached for
 * the current or previous calendar month, counting referred customers whose
 * FIRST payment landed in that month, cleared the hold, and wasn't refunded.
 * Idempotent via dedupeKey; never clawed back.
 */
export async function awardMilestones(now: Date = new Date()): Promise<number> {
  const months = [
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  ];
  const clearedBefore = new Date(now.getTime() - HOLD_DAYS * DAY_MS);
  let written = 0;
  for (const start of months) {
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const month = monthKey(start);
    const refs = await prisma.creatorReferral.findMany({
      where: { firstPaidAt: { gte: start, lt: end, lte: clearedBefore } },
      select: { creatorId: true, userId: true, firstPaidAt: true },
    });
    if (refs.length === 0) continue;
    // Drop customers whose first payment was refunded / disputed.
    const firstPayments = await prisma.creatorRevenueEvent.findMany({
      where: { userId: { in: refs.map((r) => r.userId) }, type: "payment" },
      orderBy: { occurredAt: "asc" },
      select: { id: true, userId: true },
    });
    const firstByUser = new Map<string, string>();
    for (const p of firstPayments) if (!firstByUser.has(p.userId)) firstByUser.set(p.userId, p.id);
    const reversed = new Set(
      (
        await prisma.creatorRevenueEvent.findMany({
          where: { relatesToId: { in: Array.from(firstByUser.values()) }, type: { in: ["refund", "dispute"] } },
          select: { relatesToId: true },
        })
      ).map((r) => r.relatesToId)
    );
    const perCreator = new Map<string, number>();
    for (const r of refs) {
      const first = firstByUser.get(r.userId);
      if (!first || reversed.has(first)) continue;
      perCreator.set(r.creatorId, (perCreator.get(r.creatorId) ?? 0) + 1);
    }
    for (const [creatorId, count] of Array.from(perCreator.entries())) {
      for (const tier of milestonesReached(count)) {
        try {
          await prisma.creatorLedgerEntry.create({
            data: {
              creatorId,
              type: "milestone_bonus",
              amount: tier.bonusCents,
              status: "payable",
              payableAt: now,
              milestoneMonth: month,
              dedupeKey: `ms:${creatorId}:${month}:${tier.customers}`,
              reason: `${tier.customers} paying customers in ${month}`,
              createdBy: "ledger/milestones",
            },
          });
          written++;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
    }
  }
  return written;
}

// ── Balances ──────────────────────────────────────────────────────────

export interface CreatorBalance {
  pending: number;
  payable: number;
  paidToDate: number;
  /** commissions only, lifetime, net of clawbacks (excludes voided). */
  commissionNet: number;
  bonuses: number;
}

export async function balancesFor(creatorIds: string[]): Promise<Map<string, CreatorBalance>> {
  const out = new Map<string, CreatorBalance>();
  for (const id of creatorIds) {
    out.set(id, { pending: 0, payable: 0, paidToDate: 0, commissionNet: 0, bonuses: 0 });
  }
  if (creatorIds.length === 0) return out;
  const rows = await prisma.creatorLedgerEntry.groupBy({
    by: ["creatorId", "type", "status"],
    where: { creatorId: { in: creatorIds }, status: { not: "voided" } },
    _sum: { amount: true },
  });
  for (const r of rows) {
    const b = out.get(r.creatorId)!;
    const amt = r._sum.amount ?? 0;
    if (r.type === "payout") {
      b.paidToDate += -amt;
      continue;
    }
    if (r.status === "pending") b.pending += amt;
    if (r.status === "payable") b.payable += amt;
    if (r.type === "commission" || r.type === "clawback") b.commissionNet += amt;
    if (r.type === "boost_bonus" || r.type === "milestone_bonus") b.bonuses += amt;
  }
  return out;
}

// ── Admin reassign ────────────────────────────────────────────────────

/**
 * Move a referral to another creator with a logged reason. The old creator's
 * unpaid rows for this customer are voided and recreated for the new one;
 * rows already paid out are offset with a negative adjustment (netted, never
 * billed).
 */
export async function reassignReferral(params: {
  userId: string;
  toCreatorId: string;
  reason: string;
  by: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx: Tx) => {
    const ref = await tx.creatorReferral.findUnique({ where: { userId: params.userId } });
    if (!ref) {
      await tx.creatorReferral.create({
        data: {
          userId: params.userId,
          creatorId: params.toCreatorId,
          source: "admin",
          reason: params.reason,
        },
      });
      return;
    }
    if (ref.creatorId === params.toCreatorId) return;
    const rows = await tx.creatorLedgerEntry.findMany({
      where: {
        creatorId: ref.creatorId,
        userId: params.userId,
        type: { in: ["commission", "clawback"] },
        status: { not: "voided" },
      },
    });
    for (const r of rows) {
      if (r.status === "paid") {
        await tx.creatorLedgerEntry.create({
          data: {
            creatorId: ref.creatorId,
            type: "adjustment",
            amount: -r.amount,
            status: "payable",
            payableAt: now,
            userId: params.userId,
            revenueEventId: r.revenueEventId,
            dedupeKey: `reassign:${r.id}`,
            reason: `referral reassigned: ${params.reason}`,
            createdBy: params.by,
          },
        });
      } else {
        await tx.creatorLedgerEntry.update({
          where: { id: r.id },
          data: { status: "voided", dedupeKey: `${r.dedupeKey}:void:${r.id}`, reason: `voided: ${params.reason}` },
        });
      }
      const newKey = r.dedupeKey.replace(new RegExp(`:${ref.creatorId}$`), `:${params.toCreatorId}`);
      await tx.creatorLedgerEntry.create({
        data: {
          creatorId: params.toCreatorId,
          type: r.type,
          amount: r.amount,
          status: r.payableAt <= now ? "payable" : "pending",
          payableAt: r.payableAt,
          userId: params.userId,
          revenueEventId: r.revenueEventId,
          dedupeKey: newKey === r.dedupeKey ? `${r.dedupeKey}:to:${params.toCreatorId}` : newKey,
          reason: `reassigned from ${ref.creatorId}: ${params.reason}`,
          createdBy: params.by,
        },
      });
    }
    await tx.creatorReferral.update({
      where: { id: ref.id },
      data: {
        creatorId: params.toCreatorId,
        reassignedFrom: ref.creatorId,
        reason: params.reason,
      },
    });
  });
}
