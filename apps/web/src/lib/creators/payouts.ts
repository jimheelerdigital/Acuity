import "server-only";

/**
 * Payout runs: preview → Keenan approves → execute. Nothing moves money
 * without an approved CreatorPayout row.
 *
 *   - Scheduled runs: every other Friday (config PAYOUT_ANCHOR_FRIDAY),
 *     covering rows payable before that Friday 00:00 UTC (i.e. as of the
 *     Thursday before).
 *   - Off-cycle: one creator, everything payable now.
 *   - Held out (listed separately): open/held flag, admin payoutHold, no
 *     accepted CURRENT agreement, no payout account, or under $25.
 *   - Stripe Connect transfers only when CREATOR_STRIPE_PAYOUTS=1. PayPal /
 *     manual payouts are sent by hand, then marked sent here (logged).
 */

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { AGREEMENT_VERSION, PAYOUT_MIN_CENTS, SITE_URL, stripePayoutsEnabled } from "./config";
import { nextPayoutDate, payoutCutoff, runKeyFor } from "./money";

export interface PreviewLine {
  creatorId: string;
  name: string;
  amount: number;
  entryCount: number;
  rail: "stripe_connect" | "paypal" | "manual";
  payoutId?: string;
  status?: string;
  blocked: string[];
}

export interface RunPreview {
  runKey: string;
  cutoff: string;
  lines: PreviewLine[];
}

async function blockersFor(creatorIds: string[]) {
  const [creators, flags] = await Promise.all([
    prisma.ugcCreator.findMany({
      where: { id: { in: creatorIds } },
      select: {
        id: true,
        handle: true,
        displayName: true,
        agreementVersion: true,
        agreementAcceptedAt: true,
        stripeAccountId: true,
        stripePayoutsEnabled: true,
        paypalEmail: true,
        payoutHold: true,
      },
    }),
    prisma.creatorFlag.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: creatorIds }, status: { in: ["open", "held"] } },
      _count: { _all: true },
    }),
  ]);
  const flagged = new Set(flags.map((f) => f.creatorId));
  const out = new Map<string, { name: string; rail: PreviewLine["rail"]; blocked: string[] }>();
  for (const c of creators) {
    const blocked: string[] = [];
    if (flagged.has(c.id)) blocked.push("open fraud flag");
    if (c.payoutHold) blocked.push("payout hold");
    if (!c.agreementAcceptedAt || c.agreementVersion !== AGREEMENT_VERSION) blocked.push("agreement not accepted");
    const stripeReady = Boolean(c.stripeAccountId && c.stripePayoutsEnabled);
    const rail: PreviewLine["rail"] = stripeReady ? "stripe_connect" : c.paypalEmail ? "paypal" : "manual";
    if (!stripeReady && !c.paypalEmail) blocked.push("no payout account");
    out.set(c.id, { name: c.displayName ?? `@${c.handle}`, rail, blocked });
  }
  return out;
}

/**
 * Build (or rebuild) the preview for a run. Previewed rows are refreshed;
 * approved / sent rows are left alone.
 */
export async function previewRun(opts: { runDate?: Date; offCycleCreatorId?: string } = {}): Promise<RunPreview> {
  const offCycle = Boolean(opts.offCycleCreatorId);
  const cutoff = offCycle ? new Date() : payoutCutoff(opts.runDate ?? nextPayoutDate());
  const runKey = offCycle ? `offcycle-${randomUUID().slice(0, 8)}` : runKeyFor(opts.runDate ?? nextPayoutDate());

  const entries = await prisma.creatorLedgerEntry.findMany({
    where: {
      status: "payable",
      payoutId: null,
      payableAt: offCycle ? { lte: cutoff } : { lt: cutoff },
      type: { not: "payout" },
      ...(offCycle ? { creatorId: opts.offCycleCreatorId } : {}),
    },
    select: { id: true, creatorId: true, amount: true },
  });
  const byCreator = new Map<string, { ids: string[]; total: number }>();
  for (const e of entries) {
    const g = byCreator.get(e.creatorId) ?? { ids: [], total: 0 };
    g.ids.push(e.id);
    g.total += e.amount;
    byCreator.set(e.creatorId, g);
  }
  const info = await blockersFor(Array.from(byCreator.keys()));
  const existing = await prisma.creatorPayout.findMany({
    where: { runKey },
    select: { id: true, creatorId: true, status: true, amount: true, entryIds: true },
  });
  const existingBy = new Map(existing.map((p) => [p.creatorId, p]));

  const lines: PreviewLine[] = [];
  for (const [creatorId, g] of Array.from(byCreator.entries())) {
    const i = info.get(creatorId)!;
    const blocked = [...i.blocked];
    if (g.total < PAYOUT_MIN_CENTS) blocked.push(g.total < 0 ? "negative balance" : "under $25");
    const prior = existingBy.get(creatorId);
    if (prior && prior.status !== "previewed") {
      lines.push({
        creatorId,
        name: i.name,
        amount: prior.amount,
        entryCount: (prior.entryIds as string[]).length,
        rail: i.rail,
        payoutId: prior.id,
        status: prior.status,
        blocked: [],
      });
      continue;
    }
    if (blocked.length > 0) {
      if (prior) await prisma.creatorPayout.delete({ where: { id: prior.id } });
      lines.push({ creatorId, name: i.name, amount: g.total, entryCount: g.ids.length, rail: i.rail, blocked });
      continue;
    }
    const row = await prisma.creatorPayout.upsert({
      where: { runKey_creatorId: { runKey, creatorId } },
      create: {
        runKey,
        creatorId,
        periodEnd: cutoff,
        amount: g.total,
        rail: i.rail,
        entryIds: g.ids,
        status: "previewed",
      },
      update: { amount: g.total, rail: i.rail, entryIds: g.ids, periodEnd: cutoff },
      select: { id: true, status: true },
    });
    lines.push({
      creatorId,
      name: i.name,
      amount: g.total,
      entryCount: g.ids.length,
      rail: i.rail,
      payoutId: row.id,
      status: row.status,
      blocked: [],
    });
  }
  lines.sort((a, b) => b.amount - a.amount);
  return { runKey, cutoff: cutoff.toISOString(), lines };
}

/** Keenan's approval. Only previewed rows; returns how many were approved. */
export async function approveRun(runKey: string, by: string, payoutIds?: string[]): Promise<number> {
  const res = await prisma.creatorPayout.updateMany({
    where: { runKey, status: "previewed", ...(payoutIds ? { id: { in: payoutIds } } : {}) },
    data: { status: "approved", approvedBy: by, approvedAt: new Date() },
  });
  return res.count;
}

export interface ExecuteResult {
  sent: string[];
  manual: string[];
  failed: Array<{ payoutId: string; error: string }>;
}

/**
 * Execute an approved run. Stripe Connect payouts transfer now; PayPal /
 * manual ones are left approved for Keenan to send by hand and mark sent.
 *
 * Never pays twice (2026-10-24 review):
 *   - Each payout is CLAIMED first (approved → sending, one atomic update),
 *     so two clicks / two runs can't both work on it.
 *   - Before creating a transfer we look for one already made for this
 *     payout (transfer_group = payout id). Stripe idempotency keys expire
 *     after 24h, so they alone don't protect a retry days later.
 *   - Once money has moved the payout is never marked "failed" (which an
 *     admin could reset and re-send). If recording it fails it stays
 *     "sending" with the transfer id, and the next execute settles it
 *     without a second transfer.
 */
export async function executeRun(runKey: string): Promise<ExecuteResult> {
  const out: ExecuteResult = { sent: [], manual: [], failed: [] };
  const payouts = await prisma.creatorPayout.findMany({
    where: { runKey, status: { in: ["approved", "sending"] } },
    include: { creator: { select: { stripeAccountId: true, stripePayoutsEnabled: true } } },
  });
  for (const p of payouts) {
    if (p.rail !== "stripe_connect") {
      if (p.status === "approved") out.manual.push(p.id);
      continue;
    }
    // Claim. A "sending" row was claimed by an earlier, interrupted run.
    if (p.status === "approved") {
      const claimed = await prisma.creatorPayout.updateMany({
        where: { id: p.id, status: "approved" },
        data: { status: "sending", error: null },
      });
      if (claimed.count === 0) continue; // another run has it
    }

    let transferId: string | null = null;
    try {
      const { stripe } = await import("@/lib/stripe");
      const group = transferGroupFor(p.id);
      const existing = await stripe.transfers.list({ transfer_group: group, limit: 1 });
      if (existing.data[0]) {
        transferId = existing.data[0].id;
      } else {
        if (!stripePayoutsEnabled()) throw new Error("Stripe payouts are off (CREATOR_STRIPE_PAYOUTS)");
        if (!p.creator.stripeAccountId || !p.creator.stripePayoutsEnabled) {
          throw new Error("creator's Stripe account is not ready");
        }
        const amount = await revalidatedAmount(p.id);
        if (amount < PAYOUT_MIN_CENTS) throw new Error("payable total changed since preview; re-preview the run");
        const transfer = await stripe.transfers.create(
          {
            amount,
            currency: "usd",
            destination: p.creator.stripeAccountId,
            transfer_group: group,
            description: `Ripple creator payout ${p.runKey}`,
            metadata: { payoutId: p.id, creatorId: p.creatorId },
          },
          { idempotencyKey: `creator-payout-${p.id}` }
        );
        transferId = transfer.id;
      }
    } catch (err) {
      // Nothing was sent: safe to mark failed (Reset → re-approve).
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.creatorPayout.update({ where: { id: p.id }, data: { status: "failed", error: msg } });
      safeLog.error("creators.payout.failed", err, { payoutId: p.id });
      out.failed.push({ payoutId: p.id, error: msg });
      continue;
    }

    try {
      await settlePayout(p.id, transferId);
      out.sent.push(p.id);
    } catch (err) {
      // Money moved; only the bookkeeping failed. Stay "sending" with the
      // transfer id so the next execute settles it (no second transfer).
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.creatorPayout
        .update({
          where: { id: p.id },
          data: { externalId: transferId, error: `sent as ${transferId}, not yet recorded: ${msg}` },
        })
        .catch(() => {});
      safeLog.error("creators.payout.settle-failed", err, { payoutId: p.id, transferId });
      out.failed.push({ payoutId: p.id, error: `sent (${transferId}) but not recorded yet: run execute again` });
    }
  }
  return out;
}

export function transferGroupFor(payoutId: string): string {
  return `creator-payout-${payoutId}`;
}

/** Recheck that every covered row is still payable; returns the total. */
async function revalidatedAmount(payoutId: string): Promise<number> {
  const p = await prisma.creatorPayout.findUniqueOrThrow({ where: { id: payoutId } });
  const ids = p.entryIds as string[];
  const rows = await prisma.creatorLedgerEntry.findMany({
    where: { id: { in: ids }, status: "payable", payoutId: null },
    select: { amount: true },
  });
  if (rows.length !== ids.length) return -1;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return total === p.amount ? total : -1;
}

/** Mark a PayPal / manual payout as sent after Keenan sent it by hand. */
export async function markPayoutSentManually(payoutId: string, externalRef: string, by: string): Promise<void> {
  const p = await prisma.creatorPayout.findUniqueOrThrow({ where: { id: payoutId } });
  if (p.status !== "approved") throw new Error(`payout is ${p.status}, not approved`);
  const amount = await revalidatedAmount(payoutId);
  if (amount < 0) throw new Error("payable rows changed since preview; re-preview the run");
  await settlePayout(payoutId, externalRef || `manual by ${by}`);
}

/** Write the payout ledger row, mark covered rows paid, email the statement. */
async function settlePayout(payoutId: string, externalId: string): Promise<void> {
  const p = await prisma.creatorPayout.findUniqueOrThrow({ where: { id: payoutId } });
  if (p.status === "sent") return; // already recorded (a repeated execute)
  const ids = p.entryIds as string[];
  const now = new Date();
  await prisma.$transaction([
    prisma.creatorLedgerEntry.updateMany({
      where: { id: { in: ids }, status: "payable" },
      data: { status: "paid", payoutId: p.id },
    }),
    prisma.creatorLedgerEntry.create({
      data: {
        creatorId: p.creatorId,
        type: "payout",
        amount: -p.amount,
        status: "paid",
        payableAt: now,
        payoutId: p.id,
        dedupeKey: `payout:${p.id}`,
        reason: `${p.rail} ${externalId}`,
        createdBy: p.approvedBy ?? "admin",
      },
    }),
    prisma.creatorPayout.update({
      where: { id: p.id },
      data: { status: "sent", externalId, sentAt: now, error: null },
    }),
  ]);
  const { sendPayoutStatement } = await import("./emails");
  await sendPayoutStatement(p.id).catch((err) =>
    safeLog.warn("creators.email.statement-failed", {
      payoutId,
      err: err instanceof Error ? err.message : String(err),
    })
  );
}

/** Retry a failed payout: back to previewed so it can be re-approved. */
export async function resetFailedPayout(payoutId: string): Promise<void> {
  await prisma.creatorPayout.updateMany({
    where: { id: payoutId, status: "failed" },
    data: { status: "previewed", error: null, approvedAt: null, approvedBy: null },
  });
}

// ── Stripe Connect Express onboarding ────────────────────────────────

/** Create (once) the creator's Express account and return an onboarding link. */
export async function connectOnboardingLink(creatorId: string): Promise<string> {
  const { stripe } = await import("@/lib/stripe");
  const c = await prisma.ugcCreator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { id: true, email: true, stripeAccountId: true },
  });
  let accountId = c.stripeAccountId;
  // A stored id this platform can't reach (deleted, or made with another
  // Stripe key) would fail every time: forget it and start a fresh account.
  if (accountId) {
    try {
      await stripe.accounts.retrieve(accountId);
    } catch (err) {
      const code = (err as { code?: string; statusCode?: number } | null) ?? {};
      if (code.statusCode === 403 || code.statusCode === 404 || code.code === "account_invalid" || code.code === "resource_missing") {
        safeLog.warn("creators.connect.stale-account-reset", { creatorId, accountId });
        await prisma.ugcCreator.update({ where: { id: c.id }, data: { stripeAccountId: null, stripePayoutsEnabled: false } });
        accountId = null;
      } else {
        throw err;
      }
    }
  }
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      email: c.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { creatorId: c.id },
    });
    accountId = acct.id;
    await prisma.ugcCreator.update({ where: { id: c.id }, data: { stripeAccountId: accountId } });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${SITE_URL}/api/creators/connect?refresh=1`,
    return_url: `${SITE_URL}/creators?connected=1`,
  });
  return link.url;
}

/** Re-read the Express account and store whether payouts can go to it. */
export async function refreshConnectStatus(creatorId: string): Promise<boolean> {
  const c = await prisma.ugcCreator.findUnique({
    where: { id: creatorId },
    select: { stripeAccountId: true, stripePayoutsEnabled: true },
  });
  if (!c?.stripeAccountId) return false;
  try {
    const { stripe } = await import("@/lib/stripe");
    const acct = await stripe.accounts.retrieve(c.stripeAccountId);
    const ready = Boolean(acct.payouts_enabled && acct.capabilities?.transfers === "active");
    if (ready !== c.stripePayoutsEnabled) {
      await prisma.ugcCreator.update({ where: { id: creatorId }, data: { stripePayoutsEnabled: ready } });
    }
    return ready;
  } catch (err) {
    safeLog.warn("creators.connect.refresh-failed", {
      creatorId,
      err: err instanceof Error ? err.message : String(err),
    });
    return c.stripePayoutsEnabled;
  }
}

/** Express dashboard login link (creator views payouts / tax info at Stripe). */
export async function connectDashboardLink(creatorId: string): Promise<string | null> {
  const c = await prisma.ugcCreator.findUnique({ where: { id: creatorId }, select: { stripeAccountId: true } });
  if (!c?.stripeAccountId) return null;
  const { stripe } = await import("@/lib/stripe");
  const l = await stripe.accounts.createLoginLink(c.stripeAccountId);
  return l.url;
}
