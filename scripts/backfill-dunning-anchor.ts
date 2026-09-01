/**
 * One-time backfill: stamp `stripeFirstFailureAt` for users who were dropped to
 * FREE by a dunning `customer.subscription.updated(past_due)` webhook BEFORE the
 * 2026-07-17 fix that stamps the anchor on that path
 * (apps/web/src/app/api/stripe/webhook/route.ts).
 *
 * WHY: those users sit at FREE + null anchor — indistinguishable from a clean
 * cancel — so `proRecoveryWhere` refuses to restore PRO when they fix their card.
 * Stamping the anchor makes them RECOVERABLE (the `stripeFirstFailureAt != null`
 * disjunct) and lights the recovery banner. It does NOT change access:
 * entitlements.ts treats the anchor as audit-only, and FREE stays FREE.
 *
 * SCOPE — this script ONLY sets `stripeFirstFailureAt` where it is currently
 * null, and ONLY for the explicit allowlist below. It never touches
 * subscriptionStatus, never grants PRO, never writes any other field. Kai
 * (already manually patched to PRO) and any cleanly-canceled user are NOT in
 * the list.
 *
 * VALUE — each user's REAL first failed-charge time from Stripe (not now()):
 * the honest audit value, and it aligns the banner's 30-day window with the
 * actual dunning episode. The recovery guard only needs non-null, so the real
 * date satisfies it; no age-based logic takes adverse action on the anchor
 * (the only age check anywhere is the banner's 30-day display cutoff).
 *
 * SAFETY — dry-run by default (prints before/after per row and writes nothing).
 * Pass --apply to write. Idempotent: a row whose anchor is already set is
 * skipped. Every row is re-verified against BOTH the DB and Stripe before any
 * write; a mismatch skips that row rather than guessing.
 *
 * Run (dry-run):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/backfill-dunning-anchor.ts
 * Apply (after reviewing the dry-run output):
 *   ... npx tsx scripts/backfill-dunning-anchor.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const APPLY = process.argv.includes("--apply");

// Explicit allowlist — the 6 stuck users identified 2026-07-17. Kai and the
// canceled account are deliberately excluded. Re-verified per row below.
const TARGET_EMAILS = [
  "b.montoya48@icloud.com",
  "bselesnew@gmail.com",
  "queenie6910@gmail.com",
  "susiewilliams531@gmail.com",
  "alluraora@gmail.com",
  "raelynnlipovsik@gmail.com",
];

type Derived = { at: Date; source: string } | null;

/**
 * Real first-failure time for the current dunning episode: the earliest FAILED
 * charge tied to the subscription's current (unpaid) invoice. Falls back to the
 * invoice creation time, then the current period start. Returns null only if
 * Stripe exposes none of those — in which case we skip rather than fabricate.
 */
async function deriveFirstFailure(
  sub: Stripe.Subscription,
  customerId: string
): Promise<Derived> {
  const inv =
    typeof sub.latest_invoice === "string"
      ? await stripe.invoices.retrieve(sub.latest_invoice).catch(() => null)
      : (sub.latest_invoice as Stripe.Invoice | null);

  const charges = await stripe.charges
    .list({ customer: customerId, limit: 100 })
    .catch(() => ({ data: [] as Stripe.Charge[] }));
  const failedForInvoice = charges.data
    .filter((c) => c.status === "failed" && (!inv || c.invoice === inv.id))
    .sort((a, b) => a.created - b.created);

  if (failedForInvoice[0]) {
    return { at: new Date(failedForInvoice[0].created * 1000), source: "earliest-failed-charge" };
  }
  if (inv?.created) {
    return { at: new Date(inv.created * 1000), source: "invoice-created" };
  }
  if (sub.current_period_start) {
    return { at: new Date(sub.current_period_start * 1000), source: "period-start" };
  }
  return null;
}

async function main() {
  console.log(
    `[backfill-dunning-anchor] mode=${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}\n`
  );

  let wouldWrite = 0;
  let wrote = 0;
  let skipped = 0;

  for (const email of TARGET_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionSource: true,
        stripeSubscriptionId: true,
        stripeFirstFailureAt: true,
      },
    });

    const label = email.padEnd(30);

    if (!user) {
      console.log(`SKIP  ${label} — no user row`);
      skipped++;
      continue;
    }
    // Idempotency + safety gates (DB side).
    if (user.stripeFirstFailureAt !== null) {
      console.log(
        `SKIP  ${label} — anchor already set (${user.stripeFirstFailureAt.toISOString()})`
      );
      skipped++;
      continue;
    }
    if (user.subscriptionStatus !== "FREE") {
      console.log(`SKIP  ${label} — status is ${user.subscriptionStatus}, expected FREE`);
      skipped++;
      continue;
    }
    if (user.subscriptionSource !== "stripe") {
      console.log(`SKIP  ${label} — source is ${user.subscriptionSource}, expected stripe`);
      skipped++;
      continue;
    }
    if (!user.stripeSubscriptionId) {
      console.log(`SKIP  ${label} — no stripeSubscriptionId`);
      skipped++;
      continue;
    }

    // Stripe-side verification: only stamp a genuinely dunning subscription.
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (e) {
      console.log(`SKIP  ${label} — Stripe retrieve failed: ${(e as Error).message}`);
      skipped++;
      continue;
    }
    if (sub.status !== "past_due" && sub.status !== "unpaid") {
      console.log(`SKIP  ${label} — Stripe status is ${sub.status}, not past_due/unpaid`);
      skipped++;
      continue;
    }
    if (sub.cancel_at_period_end) {
      console.log(`SKIP  ${label} — subscription is set to cancel at period end`);
      skipped++;
      continue;
    }

    const derived = await deriveFirstFailure(sub, sub.customer as string);
    if (!derived) {
      console.log(`SKIP  ${label} — could not derive a first-failure time from Stripe`);
      skipped++;
      continue;
    }

    // before/after per row.
    console.log(
      `${APPLY ? "WRITE" : "PLAN "} ${label} stripeFirstFailureAt: null → ${derived.at.toISOString()}  ` +
        `(source=${derived.source}, stripeStatus=${sub.status})`
    );

    if (APPLY) {
      await prisma.user.update({
        where: { id: user.id },
        // ONLY the anchor. Never subscriptionStatus / access.
        data: { stripeFirstFailureAt: derived.at },
      });
      wrote++;
    } else {
      wouldWrite++;
    }
  }

  console.log(
    `\n[backfill-dunning-anchor] done — ${APPLY ? `wrote=${wrote}` : `wouldWrite=${wouldWrite}`}, skipped=${skipped}`
  );
  if (!APPLY && wouldWrite > 0) {
    console.log("[backfill-dunning-anchor] re-run with --apply to write these rows.");
  }
}

main()
  .catch((err) => {
    console.error("[backfill-dunning-anchor] threw:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
