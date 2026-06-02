/**
 * Backfill User.{stripeCustomerId,stripeSubscriptionId,subscriptionStatus,
 * subscriptionSource,stripeCurrentPeriodEnd} from current Stripe state.
 *
 * Reason: the Stripe webhook was silently dead from 2026-04-24 22:19
 * to (whenever the hardening commit landed). During that window, eight
 * customers were created in Stripe (one paid $4.99, seven trial signups
 * with payment methods captured) but no User row was ever updated.
 *
 * Strategy:
 *   1. Paginate every Stripe customer (auto_paging_each).
 *   2. For each, list their current subscriptions.
 *   3. Match the Stripe customer to a User row by lowercased email.
 *   4. Reconcile the User row from the live Stripe state — same
 *      mapping table as the webhook handler uses on subscription.updated.
 *   5. Skip Users that already have stripeCustomerId set (the webhook
 *      reached them at some point).
 *   6. Print a summary: reconciled, already-current, orphaned (Stripe
 *      customer with no matching User), and User-not-found-on-our-side
 *      (rare — Stripe customer that we have no record of).
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx apps/web/scripts/backfill-stripe-state.ts
 *
 * Dry run (read-only, no DB writes):
 *   npx tsx apps/web/scripts/backfill-stripe-state.ts --dry-run
 *
 * Idempotent. Safe to re-run. Writes nothing unless a User row's
 * current state differs from what Stripe says.
 */

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const DRY_RUN = process.argv.includes("--dry-run");

type StripeStatus = Stripe.Subscription.Status;

/** Same mapping the webhook handler applies on subscription.updated. */
function mapSubscriptionStatus(s: StripeStatus): string | null {
  if (s === "active" || s === "trialing") return "PRO";
  if (s === "past_due" || s === "unpaid") return "PAST_DUE";
  if (s === "canceled" || s === "incomplete_expired") return "FREE";
  return null; // incomplete, paused — leave alone
}

type Counters = {
  scannedCustomers: number;
  customersWithNoSubs: number;
  reconciled: number;
  alreadyCurrent: number;
  orphanedCustomers: Array<{ id: string; email: string | null }>;
  unmappedStatus: Array<{ id: string; status: string }>;
  errors: Array<{ id: string; err: string }>;
};

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Missing STRIPE_SECRET_KEY. Source apps/web/.env.local first.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Source apps/web/.env.local first.");
    process.exit(1);
  }

  console.log(
    `[backfill-stripe-state] starting${DRY_RUN ? " (DRY RUN — no DB writes)" : ""}`
  );

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    typescript: true,
  });
  const prisma = new PrismaClient();

  const counters: Counters = {
    scannedCustomers: 0,
    customersWithNoSubs: 0,
    reconciled: 0,
    alreadyCurrent: 0,
    orphanedCustomers: [],
    unmappedStatus: [],
    errors: [],
  };

  // Paginated customer list — Stripe auto-paginates with .autoPagingEach.
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    counters.scannedCustomers++;

    const email = customer.email?.toLowerCase().trim() ?? null;
    if (!email) {
      // Customers without email can't be matched to our User rows
      // (we don't capture stripeCustomerId pre-checkout). Surface
      // for manual review.
      counters.orphanedCustomers.push({ id: customer.id, email: null });
      continue;
    }

    // Look up the User row by email. Email is unique in our schema.
    let user: { id: string; stripeCustomerId: string | null; subscriptionStatus: string | null } | null = null;
    try {
      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          stripeCustomerId: true,
          subscriptionStatus: true,
        },
      });
    } catch (err) {
      counters.errors.push({
        id: customer.id,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!user) {
      counters.orphanedCustomers.push({ id: customer.id, email });
      continue;
    }

    // Pull live subscription state. We want the most recent active /
    // trialing / past_due sub. status="all" gives canceled too — we
    // use the first non-canceled if any exists, else the first canceled
    // (so a canceled-then-resubscribed flow still resolves).
    const subList = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });

    if (subList.data.length === 0) {
      counters.customersWithNoSubs++;
      continue;
    }

    // Prefer non-terminal subs over canceled ones, then most recent.
    const subs = subList.data.slice().sort((a, b) => {
      const aTerm =
        a.status === "canceled" || a.status === "incomplete_expired" ? 1 : 0;
      const bTerm =
        b.status === "canceled" || b.status === "incomplete_expired" ? 1 : 0;
      if (aTerm !== bTerm) return aTerm - bTerm;
      return b.created - a.created;
    });
    const sub = subs[0];

    const nextStatus = mapSubscriptionStatus(sub.status);
    if (!nextStatus) {
      counters.unmappedStatus.push({ id: customer.id, status: sub.status });
      continue;
    }

    // Skip if the row already matches what we'd write — defensive
    // check so we don't pollute audit logs with no-op updates.
    if (
      user.stripeCustomerId === customer.id &&
      user.subscriptionStatus === nextStatus
    ) {
      counters.alreadyCurrent++;
      continue;
    }

    const data = {
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: nextStatus,
      subscriptionSource: "stripe" as const,
      stripeCurrentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    };

    console.log(
      `[backfill-stripe-state] ${DRY_RUN ? "(dry) would update" : "updating"} user=${user.id} email=${email} stripeStatus=${sub.status} → ${nextStatus} customer=${customer.id} sub=${sub.id}`
    );

    if (!DRY_RUN) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data,
        });
        counters.reconciled++;
      } catch (err) {
        counters.errors.push({
          id: customer.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      counters.reconciled++;
    }
  }

  await prisma.$disconnect();

  console.log("");
  console.log("───────────────────────────────────────────────────────");
  console.log("[backfill-stripe-state] summary");
  console.log("───────────────────────────────────────────────────────");
  console.log(`  Stripe customers scanned ........ ${counters.scannedCustomers}`);
  console.log(`  Reconciled ${DRY_RUN ? "(would reconcile)" : ""} .. ${counters.reconciled}`);
  console.log(`  Already current ................. ${counters.alreadyCurrent}`);
  console.log(`  Customers without any sub ....... ${counters.customersWithNoSubs}`);
  console.log(`  Orphaned (no User match) ........ ${counters.orphanedCustomers.length}`);
  console.log(`  Errors .......................... ${counters.errors.length}`);
  console.log(`  Unmapped Stripe statuses ........ ${counters.unmappedStatus.length}`);
  console.log("");

  if (counters.orphanedCustomers.length > 0) {
    console.log("Orphaned Stripe customers (no matching User by email):");
    for (const c of counters.orphanedCustomers) {
      console.log(`  ${c.id}  email=${c.email ?? "(no email)"}`);
    }
    console.log("");
  }
  if (counters.unmappedStatus.length > 0) {
    console.log("Unmapped Stripe subscription statuses (left alone):");
    for (const u of counters.unmappedStatus) {
      console.log(`  customer=${u.id}  status=${u.status}`);
    }
    console.log("");
  }
  if (counters.errors.length > 0) {
    console.log("Errors:");
    for (const e of counters.errors) {
      console.log(`  customer=${e.id}  err=${e.err}`);
    }
    console.log("");
  }

  console.log(DRY_RUN ? "Re-run without --dry-run to apply." : "Done.");
}

main().catch((err) => {
  console.error("[backfill-stripe-state] FATAL", err);
  process.exit(1);
});
