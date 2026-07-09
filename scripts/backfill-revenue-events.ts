/**
 * One-time (but re-runnable) historical backfill of RevenueEvent from Stripe.
 *
 * The webhook only books revenue going forward. This pulls every historical
 * charge + refund via the Stripe API so lifetime gross/net/refund-rate are real
 * from day one rather than "since we shipped the table."
 *
 * SAFETY
 *   - READ-ONLY against Stripe. Writes only to the RevenueEvent table. Never
 *     touches User, subscriptionStatus, entitlements, or any other table.
 *   - IDEMPOTENT. Every write is an upsert on the @@unique([stripeChargeId, type])
 *     key, so re-running converges on the same rows instead of duplicating.
 *     Safe to run repeatedly, and safe to run while the webhook is live: the
 *     webhook upserts on the same key.
 *   - --dry-run prints the plan and the computed totals without writing.
 *
 * DOUBLE-COUNT RULE (must match lib/revenue-events.ts):
 *   Money-in is booked once per CHARGE. A charge attached to an invoice is
 *   subscription revenue — we read the invoice for `billing_reason` (charge vs
 *   renewal) and the price interval (monthly vs annual). An invoice-less charge
 *   is a one-off. Refunds are a separate NEGATIVE row per charge carrying the
 *   cumulative `amount_refunded`.
 *
 * RUN (from repo root):
 *
 *   # 1. Always dry-run first. Prints totals; writes nothing.
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/backfill-revenue-events.ts --dry-run
 *
 *   # 2. Compare the printed gross/net/refund totals against the Stripe
 *   #    Dashboard (Balance → All activity) before writing anything.
 *
 *   # 3. Commit the backfill.
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/backfill-revenue-events.ts
 *
 * Flags:
 *   --dry-run        compute + print, write nothing
 *   --since <ISO>    only charges created on/after this date (default: all time)
 *   --limit <n>      stop after n charges (smoke-testing)
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

// ─── args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const SINCE = flag("--since");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error(
    "[backfill] STRIPE_SECRET_KEY not set. Run with:\n" +
      "  set -a && source apps/web/.env.local && set +a && npx tsx scripts/backfill-revenue-events.ts --dry-run"
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("[backfill] DATABASE_URL not set. Source apps/web/.env.local first.");
  process.exit(1);
}

const stripe = new Stripe(secret, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });

// ─── helpers ──────────────────────────────────────────────────────────────

const invoiceCache = new Map<string, Stripe.Invoice | null>();

async function getInvoice(id: string): Promise<Stripe.Invoice | null> {
  if (invoiceCache.has(id)) return invoiceCache.get(id)!;
  try {
    const inv = await stripe.invoices.retrieve(id);
    invoiceCache.set(id, inv);
    return inv;
  } catch (err) {
    console.warn(`[backfill]   ! could not retrieve invoice ${id}: ${(err as Error).message}`);
    invoiceCache.set(id, null);
    return null;
  }
}

function planFromInvoice(invoice: Stripe.Invoice | null): string | null {
  const interval = invoice?.lines?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return null;
}

const userCache = new Map<string, string | null>();

/** Resolve app userId by stripeCustomerId, then email. Cached per customer. */
async function resolveUserId(
  customerId: string | null,
  email: string | null
): Promise<string | null> {
  const key = customerId ?? `email:${email ?? ""}`;
  if (userCache.has(key)) return userCache.get(key)!;

  let id: string | null = null;
  if (customerId) {
    const u = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    id = u?.id ?? null;
  }
  if (!id && email) {
    const u = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    id = u?.id ?? null;
  }
  userCache.set(key, id);
  return id;
}

type Row = {
  source: string;
  type: "charge" | "refund" | "renewal";
  stripeEventId: null;
  stripeChargeId: string;
  customerEmail: string | null;
  userId: string | null;
  amountCents: number;
  currency: string;
  plan: string | null;
  occurredAt: Date;
};

async function upsert(row: Row): Promise<void> {
  const { stripeChargeId, type, ...rest } = row;
  await prisma.revenueEvent.upsert({
    where: { stripeChargeId_type: { stripeChargeId, type } },
    create: { stripeChargeId, type, ...rest },
    update: {
      amountCents: rest.amountCents,
      currency: rest.currency,
      plan: rest.plan,
      occurredAt: rest.occurredAt,
      userId: rest.userId,
      customerEmail: rest.customerEmail,
      // NOTE: stripeEventId deliberately NOT overwritten. If the webhook
      // already booked this charge with a real event id, the backfill must not
      // clobber it with null.
    },
  });
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `[backfill] mode=${DRY_RUN ? "DRY-RUN (no writes)" : "WRITE"}` +
      `${SINCE ? ` since=${SINCE}` : " since=all-time"}` +
      `${LIMIT !== Infinity ? ` limit=${LIMIT}` : ""}`
  );
  if (secret!.startsWith("sk_test")) {
    console.log("[backfill] NOTE: using a Stripe TEST-mode key.");
  }

  const params: Stripe.ChargeListParams = { limit: 100 };
  if (SINCE) {
    const ts = Math.floor(new Date(SINCE).getTime() / 1000);
    if (Number.isNaN(ts)) {
      console.error(`[backfill] --since is not a valid date: ${SINCE}`);
      process.exit(1);
    }
    params.created = { gte: ts };
  }

  const rows: Row[] = [];
  let seen = 0;
  let skippedUnpaid = 0;

  for await (const charge of stripe.charges.list(params)) {
    if (seen >= LIMIT) break;
    seen++;

    if (!charge.paid || charge.amount <= 0) {
      skippedUnpaid++;
      continue;
    }

    const customerId =
      typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
    const invoiceId =
      typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id ?? null;
    const invoice = invoiceId ? await getInvoice(invoiceId) : null;

    const email =
      invoice?.customer_email ??
      charge.billing_details?.email ??
      charge.receipt_email ??
      null;
    const userId = await resolveUserId(customerId, email);

    // Money-in. One row per charge. Invoice-attached → subscription revenue.
    rows.push({
      source: "stripe",
      type: invoice?.billing_reason === "subscription_cycle" ? "renewal" : "charge",
      stripeEventId: null,
      stripeChargeId: charge.id,
      customerEmail: email,
      userId,
      amountCents: charge.amount_captured ?? charge.amount,
      currency: charge.currency ?? "usd",
      plan: planFromInvoice(invoice),
      occurredAt: new Date(charge.created * 1000),
    });

    // Refund. Cumulative, negative, its own row.
    if ((charge.amount_refunded ?? 0) > 0) {
      const latestRefundAt =
        charge.refunds?.data?.reduce<number>((max, r) => Math.max(max, r.created ?? 0), 0) ?? 0;
      rows.push({
        source: "stripe",
        type: "refund",
        stripeEventId: null,
        stripeChargeId: charge.id,
        customerEmail: email,
        userId,
        amountCents: -charge.amount_refunded,
        currency: charge.currency ?? "usd",
        plan: null,
        occurredAt: new Date((latestRefundAt || charge.created) * 1000),
      });
    }
  }

  // ── totals (the numbers to reconcile against the Stripe Dashboard) ──
  const moneyIn = rows.filter((r) => r.amountCents > 0);
  const refunds = rows.filter((r) => r.amountCents < 0);
  const gross = moneyIn.reduce((s, r) => s + r.amountCents, 0);
  const refunded = refunds.reduce((s, r) => s + r.amountCents, 0); // negative
  const net = gross + refunded;
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

  console.log(`[backfill] charges scanned:      ${seen}`);
  console.log(`[backfill]   skipped (unpaid/$0): ${skippedUnpaid}`);
  console.log(`[backfill]   money-in rows:       ${moneyIn.length}`);
  console.log(`[backfill]     · renewal:         ${rows.filter((r) => r.type === "renewal").length}`);
  console.log(`[backfill]     · charge:          ${rows.filter((r) => r.type === "charge").length}`);
  console.log(`[backfill]   refund rows:         ${refunds.length}`);
  console.log(`[backfill]   unresolved userId:   ${rows.filter((r) => !r.userId).length}`);
  console.log(`[backfill] GROSS:  ${usd(gross)}`);
  console.log(`[backfill] REFUNDS:${usd(refunded)}`);
  console.log(`[backfill] NET:    ${usd(net)}`);
  if (gross > 0) {
    console.log(`[backfill] refund rate: ${((-refunded / gross) * 100).toFixed(1)}%`);
  }

  if (DRY_RUN) {
    console.log("[backfill] DRY-RUN — nothing written. Reconcile the totals above, then re-run without --dry-run.");
    return;
  }

  let written = 0;
  for (const row of rows) {
    await upsert(row);
    written++;
    if (written % 25 === 0) console.log(`[backfill]   … ${written}/${rows.length}`);
  }
  console.log(`[backfill] upserted ${written} row(s).`);

  const total = await prisma.revenueEvent.aggregate({
    _sum: { amountCents: true },
    _count: true,
  });
  console.log(
    `[backfill] RevenueEvent now holds ${total._count} row(s), net ${usd(total._sum.amountCents ?? 0)}.`
  );
}

main()
  .catch((err) => {
    console.error("[backfill] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
