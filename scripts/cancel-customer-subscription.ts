/**
 * scripts/cancel-customer-subscription.ts
 *
 * One-shot operator script: fully cancel + refund a SINGLE customer's
 * subscription across Stripe and the Acuity DB. Read-only inspection first,
 * then a typed confirmation gate, then the destructive actions.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *   - Requires STRIPE_SECRET_KEY_LIVE and refuses to run unless it starts with
 *     `sk_live_`. It NEVER reads STRIPE_SECRET_KEY (the test key), so it can't
 *     silently operate on the wrong account.
 *   - Prints the DB user, the Stripe subscription, and every charge BEFORE any
 *     write, and requires an explicit `y` at the readline prompt.
 *   - Operates on exactly one user (the email argument).
 *
 * ── RUN ─────────────────────────────────────────────────────────────────────
 *   # DB connection comes from .env.local; the LIVE Stripe key you set yourself.
 *   set -a; source .env.local; set +a
 *   export STRIPE_SECRET_KEY_LIVE='sk_live_...'
 *   npx tsx scripts/cancel-customer-subscription.ts <user-email>
 *
 * Note: writes hit the PRODUCTION database (DATABASE_URL in .env.local).
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function money(cents: number, currency = "usd"): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    fail("Usage: tsx scripts/cancel-customer-subscription.ts <user-email>");
  }

  // ── Live-key guard ────────────────────────────────────────────────────────
  const key = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!key) {
    fail(
      "STRIPE_SECRET_KEY_LIVE is not set. Export the LIVE Stripe key before running " +
        "(this script never falls back to the test key)."
    );
  }
  if (!key.startsWith("sk_live_")) {
    fail(
      `STRIPE_SECRET_KEY_LIVE must be a LIVE key (sk_live_…). Got "${key.slice(0, 8)}…". Refusing to run.`
    );
  }
  const stripe = new Stripe(key, { apiVersion: "2024-06-20", typescript: true });

  // ── 1. Look up the Acuity user ────────────────────────────────────────────
  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
      stripeFirstFailureAt: true,
      createdAt: true,
    },
  });
  if (!user) fail(`No Acuity user found with email "${email}".`);

  console.log("\n=== Acuity DB user (before) ===");
  console.log(user);

  if (!user.stripeCustomerId) {
    fail("User has no stripeCustomerId — nothing to cancel/refund on Stripe.");
  }
  if (user.subscriptionSource && user.subscriptionSource !== "stripe") {
    fail(
      `subscriptionSource is "${user.subscriptionSource}", not "stripe". ` +
        "Apple/Google Play subscriptions cannot be canceled or refunded here."
    );
  }
  if (!user.stripeSubscriptionId) {
    console.warn(
      "\n⚠️  User has no stripeSubscriptionId in the DB. Will still inspect the " +
        "customer's charges; no subscription to cancel unless one is found live."
    );
  }

  // ── 2. Stripe subscription state ──────────────────────────────────────────
  console.log("\n=== Stripe subscription ===");
  let subId = user.stripeSubscriptionId ?? null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["latest_invoice"],
      });
      const inv = sub.latest_invoice;
      const invStatus =
        inv && typeof inv !== "string" ? inv.status : (inv ?? null);
      console.log(`  id:                ${sub.id}`);
      console.log(`  status:            ${sub.status}`);
      console.log(
        `  current period:    ${new Date(sub.current_period_start * 1000).toISOString()}` +
          ` → ${new Date(sub.current_period_end * 1000).toISOString()}`
      );
      console.log(`  cancel_at_period_end: ${sub.cancel_at_period_end}`);
      console.log(`  latest_invoice:    ${invStatus ?? "(none)"}`);
    } catch (err) {
      console.warn(
        `  could not retrieve ${subId}: ${err instanceof Error ? err.message : String(err)}`
      );
      console.warn("  (it may already be canceled/deleted on Stripe)");
    }
  } else {
    console.log("  (no subscription id on the DB user)");
  }

  // ── 3. Charges for the customer ───────────────────────────────────────────
  console.log("\n=== Charges for customer ===");
  const charges = await stripe.charges.list({
    customer: user.stripeCustomerId,
    limit: 100,
  });

  let totalCollectedCents = 0;
  const refundable: Stripe.Charge[] = [];
  for (const c of charges.data) {
    const remaining = c.status === "succeeded" ? c.amount - c.amount_refunded : 0;
    if (c.status === "succeeded") totalCollectedCents += remaining;
    if (remaining > 0) refundable.push(c);
    console.log(
      `  ${c.id}  ${money(c.amount, c.currency)}  status=${c.status}` +
        `  refunded=${money(c.amount_refunded, c.currency)}` +
        `  ${new Date(c.created * 1000).toISOString()}`
    );
  }
  if (charges.data.length === 0) console.log("  (no charges)");

  const refundTotalCents = refundable.reduce(
    (sum, c) => sum + (c.amount - c.amount_refunded),
    0
  );
  console.log(
    `\nTotal successfully collected (succeeded − refunded): ${money(totalCollectedCents)}`
  );
  console.log(
    `Refundable now: ${refundable.length} charge(s), ${money(refundTotalCents)}`
  );

  // ── 4. Confirmation gate ──────────────────────────────────────────────────
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    `\n⚠️  Will refund ${money(refundTotalCents)} across ${refundable.length} charge(s). ` +
      `Will cancel subscription ${subId ?? "(none)"} immediately. Proceed? [y/N] `
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    fail("Aborted by operator. No changes made.");
  }

  // ── 5a. Refund each refundable charge ─────────────────────────────────────
  const refunds: Array<{
    chargeId: string;
    refundId: string;
    amount: number;
    currency: string;
    status: string | null;
  }> = [];
  for (const c of refundable) {
    const r = await stripe.refunds.create({
      charge: c.id,
      reason: "requested_by_customer",
    });
    refunds.push({
      chargeId: c.id,
      refundId: r.id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
    });
    console.log(
      `  refunded ${c.id} → ${r.id} (${money(r.amount, r.currency)}, ${r.status})`
    );
  }

  // ── 5b. Cancel the subscription immediately ───────────────────────────────
  let cancelSummary = "no subscription to cancel";
  if (subId) {
    try {
      const canceled = await stripe.subscriptions.cancel(subId);
      cancelSummary = `${canceled.id} → status=${canceled.status}`;
      console.log(`  canceled subscription ${canceled.id} → ${canceled.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cancelSummary = `${subId} → cancel error: ${msg}`;
      console.warn(`  cancel warning (may already be canceled): ${msg}`);
    }
  }

  // ── 5c. Wait for the customer.subscription.deleted webhook, then verify ────
  console.log(
    "\nWaiting 5s for the customer.subscription.deleted webhook to update the DB…"
  );
  await new Promise((r) => setTimeout(r, 5000));

  let after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { subscriptionStatus: true, stripeSubscriptionId: true },
  });

  let dbVia = "webhook";
  if (
    after &&
    (after.subscriptionStatus !== "FREE" || after.stripeSubscriptionId !== null)
  ) {
    console.log(
      "Webhook hasn't fully updated the DB yet — clearing manually " +
        "(mirrors the subscription.deleted handler)."
    );
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "FREE",
        stripeSubscriptionId: null,
        stripeCurrentPeriodEnd: null,
        stripeFirstFailureAt: null,
      },
    });
    dbVia = "manual";
    after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionStatus: true, stripeSubscriptionId: true },
    });
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────
  console.log("\n=== SUMMARY ===");
  console.log(`User:           ${email} (${user.id})`);
  console.log(`Refunds:        ${refunds.length}`);
  for (const r of refunds) {
    console.log(
      `  ${r.chargeId} → ${r.refundId}  ${money(r.amount, r.currency)}  ${r.status}`
    );
  }
  console.log(
    `Total refunded: ${money(refunds.reduce((s, r) => s + r.amount, 0))}`
  );
  console.log(`Subscription:   ${cancelSummary}`);
  console.log(
    `DB after:       subscriptionStatus=${after?.subscriptionStatus} ` +
      `stripeSubscriptionId=${after?.stripeSubscriptionId} (${dbVia})`
  );
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
