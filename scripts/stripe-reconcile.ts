/**
 * Manual driver for the Stripe → DB reconciliation engine
 * (apps/web/src/lib/stripe-reconcile.ts). Same engine the nightly Inngest job
 * runs — this is for on-demand dry-runs and (with --apply) manual repairs.
 *
 * Dry-run is READ-ONLY: Stripe read endpoints + Prisma reads only, no writes,
 * no alerts. Safe against prod.
 *
 * Run (dry-run):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/stripe-reconcile.ts
 * Apply (writes repairs + AdminAuditLog rows — review the dry-run first):
 *   ... npx tsx scripts/stripe-reconcile.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

import {
  reconcileStripe,
  type Drift,
  type ReconcilePrisma,
} from "../apps/web/src/lib/stripe-reconcile";

const APPLY = process.argv.includes("--apply");
const maxIdx = process.argv.indexOf("--max-drifts");
const MAX_DRIFTS = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : 25;

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

function line(d: Drift): string {
  const who = (d.email ?? d.userId ?? d.stripeCustomerId ?? "?").padEnd(32);
  const change = d.after
    ? `${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`
    : "(unrepairable — no user row)";
  return `  [${d.class}] ${who} ${d.reason}\n      ${change}`;
}

async function main() {
  console.log(
    `[stripe-reconcile] mode=${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (read-only)"} maxDrifts=${MAX_DRIFTS}\n`
  );

  const report = await reconcileStripe({
    prisma: prisma as unknown as ReconcilePrisma,
    stripe,
    dryRun: !APPLY,
    maxDrifts: MAX_DRIFTS,
    auditActor: "system:stripe-reconcile-manual",
    log: (m) => console.log(`[stripe-reconcile] ${m}`),
    onSev1: async (sev1, ctx) => {
      // Script never emails founders — just surfaces it on the console.
      console.log(
        `\n[stripe-reconcile] onSev1 fired: ${sev1.length} SEV1, aborted=${ctx.aborted}, total=${ctx.totalDrifts}`
      );
    },
  });

  console.log("\n=== CLASSIFICATION ===");
  for (const [cls, n] of Object.entries(report.byClass)) {
    console.log(`  ${cls.padEnd(34)} ${n}`);
  }

  if (report.drifts.length > 0) {
    console.log("\n=== DRIFTS ===");
    // Most severe first.
    const order: Record<string, number> = {
      SEV1_ACCESS_DENIED_BUT_PAID: 0,
      REVENUE_LEAK_GRANTED_BUT_UNPAID: 1,
      ORPHAN_USER_NO_STRIPE: 2,
      ORPHAN_STRIPE_NO_USER: 3,
      PERIOD_END_DRIFT: 4,
      STATUS_DRIFT_MINOR: 5,
    };
    for (const d of [...report.drifts].sort((a, b) => order[a.class] - order[b.class])) {
      console.log(line(d));
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`  scannedSubscriptions: ${report.scannedSubscriptions}`);
  console.log(`  scannedCustomers:     ${report.scannedCustomers}`);
  console.log(`  totalDrifts:          ${report.drifts.length}`);
  console.log(`  aborted:              ${report.aborted}`);
  console.log(`  repaired:             ${report.repaired}${report.dryRun ? " (dry-run — nothing written)" : ""}`);
  if (report.dryRun && report.drifts.length > 0) {
    console.log("\n  Re-run with --apply to repair (writes User rows + AdminAuditLog).");
  }
}

main()
  .catch((err) => {
    console.error("[stripe-reconcile] threw:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
