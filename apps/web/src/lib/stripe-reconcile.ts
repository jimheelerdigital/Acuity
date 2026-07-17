/**
 * Stripe → DB reconciliation engine.
 *
 * WHY: webhooks get dropped, retried, and reordered. PR #35 fixed one path that
 * stranded a paying user on FREE; this sweep catches the whole CLASS by treating
 * Stripe as the source of truth on a schedule. It found Kai's exact failure mode
 * (active-in-Stripe, FREE-in-DB) is now a first-class SEV1 classification.
 *
 * Design:
 *   - Pages EVERY subscription from Stripe (status:"all"), so it catches rows
 *     our stripeSubscriptionId list doesn't know about, in both directions.
 *   - Computes the desired User.subscriptionStatus via the SHARED mapper
 *     (./stripe-subscription-status) — the exact rule the webhook uses. It does
 *     not reimplement the mapping, so it cannot drift from the webhook.
 *   - Dependency-injected prisma + stripe (no "@/" / "server-only" imports) so
 *     the standalone reconcile script can drive the same engine as the Inngest
 *     nightly job.
 *   - Dry-run by default: computes + classifies, writes nothing, fires no alert.
 *     Apply mode repairs and writes an AdminAuditLog row (before/after/reason)
 *     per repair, and hard-fails (repairs nothing) if drift count exceeds a
 *     threshold — a mass drift means something upstream broke and a human
 *     should look before we mutate hundreds of billing rows.
 */
import type Stripe from "stripe";

import {
  mapStripeSubscriptionStatus,
  type DesiredSubscriptionStatus,
} from "./stripe-subscription-status";

// ── Structural types (the app's real Prisma client is a superset) ───────────

export type ReconcileUserRow = {
  id: string;
  email: string | null;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeFirstFailureAt: Date | null;
};

export interface ReconcilePrisma {
  user: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }): Promise<ReconcileUserRow[]>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  adminAuditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export type DriftClass =
  | "SEV1_ACCESS_DENIED_BUT_PAID"
  | "REVENUE_LEAK_GRANTED_BUT_UNPAID"
  | "PERIOD_END_DRIFT"
  | "STATUS_DRIFT_MINOR"
  | "ORPHAN_STRIPE_NO_USER"
  | "ORPHAN_USER_NO_STRIPE";

export interface Drift {
  class: DriftClass;
  userId: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  before: Record<string, unknown>;
  /** Repair payload, or null when unrepairable (orphaned Stripe customer). */
  after: Record<string, unknown> | null;
  reason: string;
}

export interface ReconcileOptions {
  prisma: ReconcilePrisma;
  stripe: Stripe;
  /** Default true — compute + classify, no writes, no alerts. */
  dryRun?: boolean;
  /** Hard-fail (repair nothing) when total drift count exceeds this. Default 25. */
  maxDrifts?: number;
  /** adminUserId stamped on AdminAuditLog repair rows. */
  auditActor?: string;
  /** Fired (apply mode only) with SEV1 drifts, and on threshold abort. */
  onSev1?: (
    drifts: Drift[],
    ctx: { aborted: boolean; totalDrifts: number }
  ) => Promise<void>;
  log?: (msg: string) => void;
}

export interface ReconcileReport {
  scannedSubscriptions: number;
  scannedCustomers: number;
  drifts: Drift[];
  byClass: Record<DriftClass, number>;
  repaired: number;
  aborted: boolean;
  dryRun: boolean;
}

const ACCESS_STATUSES = new Set(["PRO", "TRIAL"]);
const PERIOD_DRIFT_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function emptyByClass(): Record<DriftClass, number> {
  return {
    SEV1_ACCESS_DENIED_BUT_PAID: 0,
    REVENUE_LEAK_GRANTED_BUT_UNPAID: 0,
    PERIOD_END_DRIFT: 0,
    STATUS_DRIFT_MINOR: 0,
    ORPHAN_STRIPE_NO_USER: 0,
    ORPHAN_USER_NO_STRIPE: 0,
  };
}

/** Prefer active/trialing, then past_due, then most recently created. */
function moreAuthoritative(a: Stripe.Subscription, b: Stripe.Subscription): Stripe.Subscription {
  const rank = (s: Stripe.Subscription) =>
    s.status === "active" || s.status === "trialing"
      ? 2
      : s.status === "past_due"
        ? 1
        : 0;
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  return a.created >= b.created ? a : b;
}

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

function emailOf(sub: Stripe.Subscription): string | null {
  if (typeof sub.customer === "string") return null;
  if ("deleted" in sub.customer && sub.customer.deleted) return null;
  return (sub.customer as Stripe.Customer).email ?? null;
}

function periodEndOf(sub: Stripe.Subscription): Date | null {
  return sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
}

/**
 * Build the repair payload for a user who should move to `desired`. Mirrors what
 * the webhook writes: status + link + period end, and clears the recovery anchor
 * when granting PRO (a paid/active sub is not in dunning).
 */
function repairPayload(
  desired: DesiredSubscriptionStatus,
  sub: Stripe.Subscription
): Record<string, unknown> {
  const periodEnd = periodEndOf(sub);
  return {
    subscriptionStatus: desired,
    subscriptionSource: "stripe",
    stripeSubscriptionId: sub.id,
    ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
    ...(desired === "PRO" ? { stripeFirstFailureAt: null } : {}),
  };
}

export async function reconcileStripe(opts: ReconcileOptions): Promise<ReconcileReport> {
  const {
    prisma,
    stripe,
    dryRun = true,
    maxDrifts = 25,
    auditActor = "system:stripe-reconcile",
    onSev1,
    log = () => {},
  } = opts;

  // ── 1. Page every subscription; pick the authoritative one per customer ──
  const bestByCustomer = new Map<string, Stripe.Subscription>();
  let scannedSubscriptions = 0;
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.customer"],
  })) {
    scannedSubscriptions++;
    const cid = customerIdOf(sub);
    const existing = bestByCustomer.get(cid);
    bestByCustomer.set(cid, existing ? moreAuthoritative(existing, sub) : sub);
  }
  const customerIds = [...bestByCustomer.keys()];
  log(`scanned ${scannedSubscriptions} subscriptions across ${customerIds.length} customers`);

  // ── 2. Load matching users in chunks (avoids N round-trips at 10k scale) ──
  const usersByCustomer = new Map<string, ReconcileUserRow>();
  const CHUNK = 300;
  for (let i = 0; i < customerIds.length; i += CHUNK) {
    const chunk = customerIds.slice(i, i + CHUNK);
    const rows = await prisma.user.findMany({
      where: { stripeCustomerId: { in: chunk } },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionSource: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeCurrentPeriodEnd: true,
        stripeFirstFailureAt: true,
      },
    });
    for (const r of rows) if (r.stripeCustomerId) usersByCustomer.set(r.stripeCustomerId, r);
  }

  const drifts: Drift[] = [];

  // ── 3. Diff each Stripe customer against its user row ──
  for (const cid of customerIds) {
    const sub = bestByCustomer.get(cid)!;
    const desired = mapStripeSubscriptionStatus(sub.status);
    if (desired === null) continue; // incomplete/unknown — no opinion, like the webhook

    const user = usersByCustomer.get(cid);
    if (!user) {
      drifts.push({
        class: "ORPHAN_STRIPE_NO_USER",
        userId: null,
        email: emailOf(sub),
        stripeCustomerId: cid,
        stripeSubscriptionId: sub.id,
        stripeStatus: sub.status,
        before: {},
        after: null, // no row to repair — report/alert only
        reason: `Stripe ${sub.status} subscription with no matching User row`,
      });
      continue;
    }

    const before = {
      subscriptionStatus: user.subscriptionStatus,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
    };

    // FREE and PAST_DUE are access-equivalent (entitlements.ts:171-173 — both
    // no-access, both satisfy proRecoveryWhere), so normalize PAST_DUE→FREE
    // before comparing and never flag one as the other. This reconciler is
    // about access correctness, not label cosmetics.
    // TODO(billing): the webhook maps Stripe `unpaid`→FREE while the admin
    // stripe-sync route (app/api/admin/stripe-sync/route.ts) maps `unpaid`→
    // PAST_DUE. They disagree but gate identically; unify to one representation
    // in a follow-up — NOT this PR.
    const actualCmp =
      user.subscriptionStatus === "PAST_DUE" ? "FREE" : user.subscriptionStatus;

    if (desired !== actualCmp) {
      const hasAccess = ACCESS_STATUSES.has(user.subscriptionStatus);
      let cls: DriftClass;
      if (desired === "PRO" && !hasAccess) cls = "SEV1_ACCESS_DENIED_BUT_PAID";
      else if (desired === "FREE" && hasAccess) cls = "REVENUE_LEAK_GRANTED_BUT_UNPAID";
      else cls = "STATUS_DRIFT_MINOR";
      drifts.push({
        class: cls,
        userId: user.id,
        email: user.email,
        stripeCustomerId: cid,
        stripeSubscriptionId: sub.id,
        stripeStatus: sub.status,
        before,
        after: repairPayload(desired, sub),
        reason: `Stripe=${sub.status} → should be ${desired}; DB=${user.subscriptionStatus}`,
      });
      continue;
    }

    // Status agrees. Only reconcile the sub link + period end for a LIVE sub:
    // for past_due/canceled, Stripe's current_period_end is the optimistic NEXT
    // period (unpaid), not a paid-through date — "repairing" it would stamp a
    // future date on someone who hasn't paid. Skip non-live subs entirely.
    if (sub.status !== "active" && sub.status !== "trialing") continue;

    const periodEnd = periodEndOf(sub);
    const subIdDrift = user.stripeSubscriptionId !== sub.id;
    const periodDrift =
      periodEnd != null &&
      (user.stripeCurrentPeriodEnd == null ||
        Math.abs(user.stripeCurrentPeriodEnd.getTime() - periodEnd.getTime()) >
          PERIOD_DRIFT_TOLERANCE_MS);
    if (subIdDrift || periodDrift) {
      drifts.push({
        class: "PERIOD_END_DRIFT",
        userId: user.id,
        email: user.email,
        stripeCustomerId: cid,
        stripeSubscriptionId: sub.id,
        stripeStatus: sub.status,
        before,
        after: {
          stripeSubscriptionId: sub.id,
          ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
        },
        reason: [
          subIdDrift ? `subId ${user.stripeSubscriptionId} → ${sub.id}` : null,
          periodDrift
            ? `periodEnd ${user.stripeCurrentPeriodEnd?.toISOString() ?? "null"} → ${periodEnd?.toISOString()}`
            : null,
        ]
          .filter(Boolean)
          .join("; "),
      });
    }
  }

  // ── 4. Reverse orphans: access-granted stripe users with no Stripe sub ──
  const grantedStripeUsers = await prisma.user.findMany({
    where: {
      subscriptionSource: "stripe",
      subscriptionStatus: { in: ["PRO", "TRIAL"] },
    },
    select: {
      id: true,
      email: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
      stripeFirstFailureAt: true,
    },
  });
  for (const u of grantedStripeUsers) {
    if (u.stripeCustomerId && bestByCustomer.has(u.stripeCustomerId)) continue; // handled above
    drifts.push({
      class: "ORPHAN_USER_NO_STRIPE",
      userId: u.id,
      email: u.email,
      stripeCustomerId: u.stripeCustomerId,
      stripeSubscriptionId: u.stripeSubscriptionId,
      stripeStatus: null,
      before: { subscriptionStatus: u.subscriptionStatus },
      after: { subscriptionStatus: "FREE" },
      reason: `DB=${u.subscriptionStatus} (stripe) but Stripe returned no subscription for this customer`,
    });
  }

  // ── 5. Tally ──
  const byClass = emptyByClass();
  for (const d of drifts) byClass[d.class]++;
  const sev1 = drifts.filter((d) => d.class === "SEV1_ACCESS_DENIED_BUT_PAID");

  const report: ReconcileReport = {
    scannedSubscriptions,
    scannedCustomers: customerIds.length,
    drifts,
    byClass,
    repaired: 0,
    aborted: false,
    dryRun,
  };

  // ── 6. Hard-fail on excessive SEVERE drift — never mass-repair blindly.
  //     Only SEV1 + revenue-leak count toward the threshold; low-severity
  //     classes (period drift, orphans, minor label) must never trip the abort,
  //     or the safety cries wolf on benign noise and gets ignored. ──
  const severeCount =
    byClass.SEV1_ACCESS_DENIED_BUT_PAID +
    byClass.REVENUE_LEAK_GRANTED_BUT_UNPAID;
  if (severeCount > maxDrifts) {
    report.aborted = true;
    log(
      `ABORT: ${severeCount} severe drifts > threshold ${maxDrifts} (total ${drifts.length}); repairing nothing`
    );
    if (!dryRun && onSev1) await onSev1(sev1, { aborted: true, totalDrifts: drifts.length });
    return report;
  }

  // ── 7. Dry-run stops here (no writes, no alerts) ──
  if (dryRun) return report;

  // ── 8. Apply repairs + audit log ──
  for (const d of drifts) {
    if (!d.after || !d.userId) continue;
    await prisma.user.update({ where: { id: d.userId }, data: d.after });
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: auditActor,
        action: "stripe_reconcile_repair",
        targetUserId: d.userId,
        metadata: {
          class: d.class,
          reason: d.reason,
          stripeStatus: d.stripeStatus,
          stripeSubscriptionId: d.stripeSubscriptionId,
          before: JSON.parse(JSON.stringify(d.before)),
          after: JSON.parse(JSON.stringify(d.after)),
        },
      },
    });
    report.repaired++;
  }

  if (onSev1 && sev1.length > 0)
    await onSev1(sev1, { aborted: false, totalDrifts: drifts.length });

  return report;
}
