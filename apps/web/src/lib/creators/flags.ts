import "server-only";

/**
 * Fraud + data flags. Cheap controls: a flag holds the creator's payouts
 * until Keenan looks; it never bans anyone automatically. The daily scan
 * opens a CreatorFlag per finding (dedupeKey stops re-opening the same one).
 */

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { fingerprintsOf } from "./attribution";
import {
  CLICK_COOKIE_DAYS,
  EMAIL_MATCH_DAYS,
  FLAG_LOW_TRIAL_MIN_SIGNUPS,
  FLAG_LOW_TRIAL_RATE,
  FLAG_REFUND_MIN_PAYMENTS,
  FLAG_REFUND_RATE,
  FLAG_REFUND_WINDOW_DAYS,
  FLAG_VELOCITY_SIGNUPS_PER_DAY,
} from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

export const FLAG_KINDS = [
  "self_referral",
  "refund_rate",
  "velocity",
  "shared_payment",
  "stale_click",
  "existing_user",
] as const;

async function openFlag(params: {
  creatorId: string;
  kind: (typeof FLAG_KINDS)[number];
  detail: string;
  dedupeKey: string;
  referralId?: string | null;
}): Promise<boolean> {
  try {
    await prisma.creatorFlag.create({
      data: {
        creatorId: params.creatorId,
        kind: params.kind,
        detail: params.detail,
        dedupeKey: params.dedupeKey,
        referralId: params.referralId ?? null,
      },
    });
    return true;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") return false;
    throw err;
  }
}

/** A "trial" = the referred account started a paid subscription (card on file or store). */
export async function trialUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      OR: [
        { stripeSubscriptionId: { not: null } },
        { subscriptionSource: { in: ["stripe", "apple", "google_play"] } },
      ],
    },
    select: { id: true },
  });
  const paid = await prisma.creatorRevenueEvent.findMany({
    where: { userId: { in: userIds }, type: "payment" },
    distinct: ["userId"],
    select: { userId: true },
  });
  return new Set([...users.map((u) => u.id), ...paid.map((p) => p.userId)]);
}

export async function scanFlags(now: Date = new Date()): Promise<number> {
  let opened = 0;
  const creators = await prisma.ugcCreator.findMany({
    where: { referralCode: { not: null } },
    select: { id: true, email: true, userId: true, selfFingerprints: true },
  });

  for (const c of creators) {
    const refs = await prisma.creatorReferral.findMany({
      where: { creatorId: c.id },
      select: { id: true, userId: true, source: true, clickId: true, attributedAt: true },
    });
    if (refs.length === 0) continue;
    const userIds = refs.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, createdAt: true, pushToken: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    // self_referral (also rejected at write time; this catches later-known fingerprints)
    const fp = fingerprintsOf(c.selfFingerprints);
    const ownEmails = new Set([...fp.emails, ...(c.email ? [c.email.toLowerCase()] : [])]);
    const paymentFps = await prisma.creatorRevenueEvent.findMany({
      where: { userId: { in: userIds }, paymentFingerprint: { not: null } },
      select: { userId: true, paymentFingerprint: true },
    });
    for (const r of refs) {
      const u = userById.get(r.userId);
      if (!u) continue;
      const hit =
        r.userId === c.userId ||
        ownEmails.has(u.email.toLowerCase()) ||
        (u.pushToken && fp.devices.includes(u.pushToken)) ||
        paymentFps.some((p) => p.userId === r.userId && fp.payments.includes(p.paymentFingerprint!));
      if (hit && (await openFlag({
        creatorId: c.id,
        kind: "self_referral",
        detail: `Referred customer matches the creator's own email, device or card.`,
        dedupeKey: `self_referral:${r.id}`,
        referralId: r.id,
      }))) opened++;
    }

    // shared_payment: two referred accounts on one card
    const byFp = new Map<string, Set<string>>();
    for (const p of paymentFps) {
      const s = byFp.get(p.paymentFingerprint!) ?? new Set<string>();
      s.add(p.userId);
      byFp.set(p.paymentFingerprint!, s);
    }
    for (const [fpId, us] of Array.from(byFp.entries())) {
      if (us.size >= 2 && (await openFlag({
        creatorId: c.id,
        kind: "shared_payment",
        detail: `${us.size} referred accounts share one card.`,
        dedupeKey: `shared_payment:${c.id}:${fpId}`,
      }))) opened++;
    }

    // refund_rate over the last 90 days
    const since = new Date(now.getTime() - FLAG_REFUND_WINDOW_DAYS * DAY_MS);
    const [payments, refunds] = await Promise.all([
      prisma.creatorRevenueEvent.count({ where: { userId: { in: userIds }, type: "payment", occurredAt: { gte: since } } }),
      prisma.creatorRevenueEvent.count({
        where: { userId: { in: userIds }, type: { in: ["refund", "dispute"] }, occurredAt: { gte: since } },
      }),
    ]);
    if (payments >= FLAG_REFUND_MIN_PAYMENTS && refunds / payments > FLAG_REFUND_RATE) {
      if (await openFlag({
        creatorId: c.id,
        kind: "refund_rate",
        detail: `${refunds} of ${payments} referred payments refunded or disputed in ${FLAG_REFUND_WINDOW_DAYS} days.`,
        dedupeKey: `refund_rate:${c.id}:${now.toISOString().slice(0, 7)}`,
      })) opened++;
    }

    // velocity: >20 signups in one day
    const perDay = new Map<string, number>();
    for (const r of refs) {
      const d = r.attributedAt.toISOString().slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    for (const [d, n] of Array.from(perDay.entries())) {
      if (n > FLAG_VELOCITY_SIGNUPS_PER_DAY && (await openFlag({
        creatorId: c.id,
        kind: "velocity",
        detail: `${n} referred signups on ${d}.`,
        dedupeKey: `velocity:${c.id}:${d}`,
      }))) opened++;
    }
    // velocity: trial rate under 10% on 30+ signups (accounts older than a week)
    const settled = refs.filter((r) => now.getTime() - r.attributedAt.getTime() > 7 * DAY_MS);
    if (settled.length >= FLAG_LOW_TRIAL_MIN_SIGNUPS) {
      const trials = await trialUserIds(settled.map((r) => r.userId));
      const rate = trials.size / settled.length;
      if (rate < FLAG_LOW_TRIAL_RATE && (await openFlag({
        creatorId: c.id,
        kind: "velocity",
        detail: `Trial rate ${(rate * 100).toFixed(1)}% on ${settled.length} signups.`,
        dedupeKey: `low_trial:${c.id}:${now.toISOString().slice(0, 7)}`,
      }))) opened++;
    }

    // Bug checks: stale click / email, and accounts that weren't new.
    const clickIds = refs.map((r) => r.clickId).filter((x): x is string => Boolean(x));
    const clicks = await prisma.creatorReferralClick.findMany({
      where: { clickId: { in: clickIds } },
      select: { clickId: true, createdAt: true, capturedEmailAt: true },
    });
    const clickBy = new Map(clicks.map((k) => [k.clickId, k]));
    for (const r of refs) {
      const k = r.clickId ? clickBy.get(r.clickId) : null;
      const stale =
        (r.source === "web_cookie" && k && r.attributedAt.getTime() - k.createdAt.getTime() > CLICK_COOKIE_DAYS * DAY_MS) ||
        (r.source === "email_match" && k?.capturedEmailAt &&
          r.attributedAt.getTime() - k.capturedEmailAt.getTime() > EMAIL_MATCH_DAYS * DAY_MS);
      if (stale && (await openFlag({
        creatorId: c.id,
        kind: "stale_click",
        detail: `Referral written from a ${r.source === "web_cookie" ? "click older than 90 days" : "captured email older than 30 days"} (bug check).`,
        dedupeKey: `stale_click:${r.id}`,
        referralId: r.id,
      }))) opened++;
      const u = userById.get(r.userId);
      if (u && r.source !== "admin" && r.attributedAt.getTime() - u.createdAt.getTime() > DAY_MS) {
        if (await openFlag({
          creatorId: c.id,
          kind: "existing_user",
          detail: "Referral written for an account that already existed (bug check).",
          dedupeKey: `existing_user:${r.id}`,
          referralId: r.id,
        })) opened++;
      }
    }
  }
  if (opened > 0) safeLog.info("creators.flags.opened", { opened });
  return opened;
}
