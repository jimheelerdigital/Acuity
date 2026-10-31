/**
 * Creator platform jobs (2026-10-22). Money logic lives in lib/creators/*;
 * these only schedule it.
 *
 *   creators-ledger-mature      hourly    pending → payable after the 14-day hold
 *   creators-flags-scan         daily     fraud / data flags (hold payouts)
 *   creators-cleanup            daily     clicks > 90 days deleted, captured emails > 30 days nulled
 *   creators-reconcile          weekly    ledger vs Stripe per creator; gaps → admin email
 *   creators-payout-preview     Fridays   on payout Fridays, build the run preview and email
 *                                         Keenan to approve (nothing is paid without approval)
 *
 * Cron changes need an Inngest resync after deploy (curl -X PUT goripple.io/api/inngest).
 */
import { inngest } from "@/inngest/client";

export const creatorsLedgerMatureFn = inngest.createFunction(
  { id: "creators-ledger-mature", name: "Creators: release held commissions", triggers: [{ cron: "15 * * * *" }], retries: 2 },
  async ({ step }) => {
    const released = await step.run("mature", async () => {
      const { matureLedger } = await import("@/lib/creators/ledger");
      return matureLedger();
    });
    return { released };
  }
);

export const creatorsFlagsScanFn = inngest.createFunction(
  { id: "creators-flags-scan", name: "Creators: fraud flag scan", triggers: [{ cron: "45 6 * * *" }], retries: 1 },
  async ({ step }) => {
    const opened = await step.run("scan", async () => {
      const { scanFlags } = await import("@/lib/creators/flags");
      return scanFlags();
    });
    if (opened > 0) {
      await step.run("notify", async () => {
        const { sendAdminNotice } = await import("@/lib/creators/emails");
        await sendAdminNotice(
          `Creator flags: ${opened} new`,
          `<p>${opened} new creator flag${opened === 1 ? "" : "s"}. Flagged creators are held out of payouts until you resolve them.</p><p><a href="https://goripple.io/admin/creators?tab=flags">Review flags</a></p>`
        );
      });
    }
    return { opened };
  }
);

export const creatorsCleanupFn = inngest.createFunction(
  { id: "creators-cleanup", name: "Creators: click + email retention", triggers: [{ cron: "0 7 * * *" }], retries: 1 },
  async ({ step }) => {
    return step.run("cleanup", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { CLICK_RETENTION_DAYS, EMAIL_MATCH_DAYS } = await import("@/lib/creators/config");
      const day = 24 * 60 * 60 * 1000;
      const emails = await prisma.creatorReferralClick.updateMany({
        where: { capturedEmailAt: { lt: new Date(Date.now() - EMAIL_MATCH_DAYS * day) }, capturedEmail: { not: null } },
        data: { capturedEmail: null },
      });
      const clicks = await prisma.creatorReferralClick.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - CLICK_RETENTION_DAYS * day) } },
      });
      return { emailsCleared: emails.count, clicksDeleted: clicks.count };
    });
  }
);

export const creatorsReconcileFn = inngest.createFunction(
  { id: "creators-reconcile", name: "Creators: weekly Stripe reconciliation", triggers: [{ cron: "0 8 * * 1" }], retries: 1 },
  async ({ step }) => {
    const gaps = await step.run("reconcile", async () => {
      const { reconcileStripe } = await import("@/lib/creators/admin");
      return reconcileStripe();
    });
    if (gaps.length > 0) {
      await step.run("notify", async () => {
        const { sendAdminNotice } = await import("@/lib/creators/emails");
        const { formatCents } = await import("@/lib/creators/money");
        const rows = gaps
          .map((g) => `<li>${g.creatorId}: ledger ${formatCents(g.ledgerCents)} vs Stripe ${formatCents(g.stripeCents)}</li>`)
          .join("");
        await sendAdminNotice(
          "Creator ledger doesn't match Stripe",
          `<p>The weekly check found ${gaps.length} creator${gaps.length === 1 ? "" : "s"} where the ledger and Stripe differ by more than $1:</p><ul>${rows}</ul><p>Usually a missed webhook. Check the Stripe event log for those customers.</p>`
        );
      });
    }
    return { gaps: gaps.length };
  }
);

export const creatorsPayoutPreviewFn = inngest.createFunction(
  { id: "creators-payout-preview", name: "Creators: payout run preview", triggers: [{ cron: "0 14 * * 5" }], retries: 1 },
  async ({ step }) => {
    const { isPayoutFriday } = await import("@/lib/creators/money");
    if (!isPayoutFriday(new Date())) return { skipped: "not a payout Friday" };
    const preview = await step.run("preview", async () => {
      const { previewRun } = await import("@/lib/creators/payouts");
      return previewRun({ runDate: new Date() });
    });
    const ready = preview.lines.filter((l) => l.blocked.length === 0 && l.status === "previewed");
    const held = preview.lines.filter((l) => l.blocked.length > 0);
    if (ready.length === 0 && held.length === 0) return { runKey: preview.runKey, lines: 0 };
    await step.run("notify", async () => {
      const { sendAdminNotice } = await import("@/lib/creators/emails");
      const { formatCents } = await import("@/lib/creators/money");
      const total = ready.reduce((s, l) => s + l.amount, 0);
      await sendAdminNotice(
        `Creator payouts ready to approve: ${formatCents(total)}`,
        `<p>Run ${preview.runKey}: ${ready.length} creator${ready.length === 1 ? "" : "s"} ready (${formatCents(total)}), ${held.length} held out.</p><p>Nothing is paid until you approve and execute it.</p><p><a href="https://goripple.io/admin/creators?tab=payouts">Review the payout run</a></p>`
      );
    });
    return { runKey: preview.runKey, ready: ready.length, held: held.length };
  }
);

export const creatorsFunctions = [
  creatorsLedgerMatureFn,
  creatorsFlagsScanFn,
  creatorsCleanupFn,
  creatorsReconcileFn,
  creatorsPayoutPreviewFn,
];
