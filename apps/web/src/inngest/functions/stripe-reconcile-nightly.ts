import { inngest } from "@/inngest/client";

/**
 * Nightly Stripe → DB reconciliation. Treats Stripe as the source of truth and
 * heals the class of bug that stranded Kai (PR #35 fixed one path; webhooks can
 * always drop/reorder). Runs on Inngest — not a Vercel cron — because a full
 * sweep at scale exceeds the 300s function ceiling; Inngest gives longer
 * runtime + retries.
 *
 * SAFE POSTURE: observe-only by default. It only repairs when
 * STRIPE_RECON_APPLY === "true" (mirrors the IAP build-flag pattern) — so even
 * once deployed it runs as a dry-run alerter until Jim flips the env var. On any
 * SEV1 (paid customer locked out) or a threshold abort it pings founders.
 */
export const stripeReconcileNightlyFn = inngest.createFunction(
  {
    id: "stripe-reconcile-nightly",
    name: "Billing — Nightly Stripe Reconciliation",
    triggers: [{ cron: "0 8 * * *" }], // 08:00 UTC nightly
    retries: 1,
    concurrency: { limit: 1 }, // never overlap runs
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { stripe } = await import("@/lib/stripe");
    const { reconcileStripe } = await import("@/lib/stripe-reconcile");
    const { notifyFoundersOfReconciliationAlert } = await import(
      "@/lib/founder-notifications"
    );

    const apply = process.env.STRIPE_RECON_APPLY === "true";
    const maxDrifts = Number(process.env.STRIPE_RECON_MAX_DRIFTS ?? "25");

    const report = await reconcileStripe({
      prisma,
      stripe,
      dryRun: !apply,
      maxDrifts,
      auditActor: "system:stripe-reconcile-nightly",
      log: (m) => logger.info(`[stripe-reconcile] ${m}`),
      onSev1: async (sev1, ctx) => {
        await notifyFoundersOfReconciliationAlert({
          sev1Count: sev1.length,
          aborted: ctx.aborted,
          totalDrifts: ctx.totalDrifts,
          applied: apply && !ctx.aborted,
          sampleEmails: sev1.map((d) => d.email ?? "unknown"),
        });
      },
    });

    logger.info("[stripe-reconcile] summary", {
      dryRun: report.dryRun,
      aborted: report.aborted,
      scannedSubscriptions: report.scannedSubscriptions,
      drifts: report.drifts.length,
      byClass: report.byClass,
      repaired: report.repaired,
    });

    return {
      dryRun: report.dryRun,
      aborted: report.aborted,
      drifts: report.drifts.length,
      byClass: report.byClass,
      repaired: report.repaired,
    };
  }
);
