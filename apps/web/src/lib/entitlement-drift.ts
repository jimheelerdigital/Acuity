/**
 * Entitlement drift — shared core for the drift MONITOR (read-only alert) and
 * the future self-healing RECONCILER (read + correct).
 *
 * "Drift" = our DB `subscriptionStatus` disagrees with the source-of-truth
 * provider (Stripe / Apple App Store Server API / Google Play). A single missed
 * webhook or notification leaves the DB permanently out of sync until something
 * re-reads the provider — this module is that re-read + comparison.
 *
 * `classifyDrift` is a PURE function (unit-tested). The provider reads live in
 * `resolveProviderActive`, which dispatches to the existing per-source clients.
 */

import {
  readAppleApiConfig,
  fetchAppleSubscriptionStatus,
} from "@/lib/apple-iap";
import {
  fetchGoogleSubscription,
  readGooglePlayApiConfig,
} from "@/lib/google-iap";
import { NOT_IAP_SOURCE_WHERE } from "@/lib/entitlements";
import { safeLog } from "@/lib/safe-log";

export type DriftSeverity = "SEV1" | "SEV2" | "SEV3";

export interface DriftFinding {
  userId: string;
  email: string | null;
  source: string; // "stripe" | "apple" | "google_play"
  dbStatus: string;
  providerActive: boolean;
  providerDetail: string; // raw provider state string, for the alert
  expected: "PRO" | "FREE";
  severity: DriftSeverity;
  kind:
    | "access_denied_but_paid" // DB not PRO but provider ACTIVE  (SEV1)
    | "revenue_leak" // DB PRO but provider INACTIVE     (SEV2)
    | "stale_past_due"; // DB PAST_DUE, provider INACTIVE   (SEV3)
}

/**
 * Pure classification. Returns null when DB and provider agree.
 *
 * `providerActive` = the provider currently grants entitlement (Stripe
 * active/trialing; Apple status 1 active or 4 grace; Google hasAccess).
 */
export function classifyDrift(input: {
  source: string;
  dbStatus: string;
  providerActive: boolean;
}): { kind: DriftFinding["kind"]; severity: DriftSeverity; expected: "PRO" | "FREE" } | null {
  const { dbStatus, providerActive } = input;
  const dbGrantsPro = dbStatus === "PRO";

  if (providerActive && !dbGrantsPro) {
    // Paid but locked out — the emily class. Highest priority.
    return { kind: "access_denied_but_paid", severity: "SEV1", expected: "PRO" };
  }
  if (!providerActive && dbGrantsPro) {
    // DB grants PRO the provider no longer backs — revenue/entitlement leak.
    return { kind: "revenue_leak", severity: "SEV2", expected: "FREE" };
  }
  if (!providerActive && dbStatus === "PAST_DUE") {
    // Provider is terminally inactive (unpaid/uncollectible) but the row is
    // stuck at PAST_DUE — should be FREE. The l.connolly / kayleigh class.
    return { kind: "stale_past_due", severity: "SEV3", expected: "FREE" };
  }
  return null;
}

export interface UnreadableUser {
  userId: string;
  email: string | null;
  source: string | null;
  detail: string; // why the provider read failed
}

export interface DriftScanResult {
  total: number;
  checked: number;
  unreadable: number;
  findings: DriftFinding[];
  unreadableDetails: UnreadableUser[];
}

/**
 * READ-ONLY scan: for every PRO/PAST_DUE user, resolve the source-of-truth
 * provider and classify drift. Shared by the daily monitor cron and the
 * on-demand admin endpoint so both run identical logic. Never writes.
 */
export async function scanEntitlementDrift(batch = 5): Promise<DriftScanResult> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.user.findMany({
    where: { subscriptionStatus: { in: ["PRO", "PAST_DUE"] } },
    select: {
      id: true,
      email: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      appleEnvironment: true,
      appleOriginalTransactionId: true,
      googlePurchaseToken: true,
      stripeSubscriptionId: true,
    },
  });

  // Exclude internal/test accounts and sandbox subs — they legitimately drift
  // (comped founders, TestFlight sandbox subs that lapse) and would otherwise
  // generate perpetual noise. Filtered in code, NOT in the Prisma WHERE: a
  // negated `appleEnvironment != 'sandbox'` is NULL (drops the row) for the many
  // Stripe/null-source users whose appleEnvironment is NULL — the same
  // SQL-NULL-in-negation trap NOT_IAP_SOURCE_WHERE exists to avoid.
  const users = rows.filter((u) => {
    const email = u.email ?? "";
    return (
      !email.endsWith("@heelerdigital.com") &&
      !email.endsWith("@example.com") && // reserved test domain (demo@example.com, App Store reviewer login) — no provider to validate
      u.appleEnvironment !== "sandbox" &&
      u.subscriptionSource !== "comp" // durable comp marker — intentionally granted PRO, no provider to validate
    );
  });

  const findings: DriftFinding[] = [];
  const unreadableDetails: UnreadableUser[] = [];
  let checked = 0;
  let unreadable = 0;

  for (let i = 0; i < users.length; i += batch) {
    const slice = users.slice(i, i + batch);
    const results = await Promise.all(
      slice.map(async (u) => ({ u, provider: await resolveProviderActive(u) }))
    );
    for (const { u, provider } of results) {
      if (!provider.ok) {
        unreadable++;
        unreadableDetails.push({
          userId: u.id,
          email: u.email,
          source: u.subscriptionSource,
          detail: provider.detail,
        });
        continue;
      }
      checked++;
      const drift = classifyDrift({
        source: u.subscriptionSource ?? "unknown",
        dbStatus: u.subscriptionStatus,
        providerActive: provider.active,
      });
      if (drift) {
        findings.push({
          userId: u.id,
          email: u.email,
          source: u.subscriptionSource ?? "unknown",
          dbStatus: u.subscriptionStatus,
          providerActive: provider.active,
          providerDetail: provider.detail,
          expected: drift.expected,
          severity: drift.severity,
          kind: drift.kind,
        });
      }
    }
  }

  findings.sort((a, b) => a.severity.localeCompare(b.severity));
  return { total: users.length, checked, unreadable, findings, unreadableDetails };
}

export interface ProviderStatus {
  ok: boolean;
  active: boolean;
  detail: string;
}

/**
 * Read the source-of-truth provider for one user and report whether the
 * subscription currently grants entitlement. READ-ONLY. Returns ok:false on any
 * provider/config error so the caller can skip (never treat an API failure as a
 * demotion signal).
 */
export async function resolveProviderActive(user: {
  subscriptionSource: string | null;
  appleOriginalTransactionId: string | null;
  googlePurchaseToken: string | null;
  stripeSubscriptionId: string | null;
}): Promise<ProviderStatus> {
  try {
    if (user.subscriptionSource === "apple" && user.appleOriginalTransactionId) {
      const cfg = readAppleApiConfig();
      const res = await fetchAppleSubscriptionStatus(
        user.appleOriginalTransactionId,
        cfg
      );
      if (!res.ok) return { ok: false, active: false, detail: res.diagnostic };
      return { ok: true, active: res.active, detail: `apple:${res.statusLabel}` };
    }

    if (user.subscriptionSource === "google_play" && user.googlePurchaseToken) {
      const cfg = readGooglePlayApiConfig();
      const res = await fetchGoogleSubscription(user.googlePurchaseToken, cfg);
      if (!res.ok) return { ok: false, active: false, detail: res.diagnostic };
      return { ok: true, active: res.info.hasAccess, detail: `google:${res.info.state}` };
    }

    if (user.subscriptionSource === "stripe" && user.stripeSubscriptionId) {
      const { stripe } = await import("@/lib/stripe");
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const active = sub.status === "active" || sub.status === "trialing";
      return { ok: true, active, detail: `stripe:${sub.status}` };
    }

    // No usable provider handle (source null / missing id) — can't validate.
    return { ok: false, active: false, detail: "no-provider-handle" };
  } catch (err) {
    safeLog.warn("entitlement-drift.provider-read-failed", {
      source: user.subscriptionSource,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, active: false, detail: "provider-error" };
  }
}

// ─── Reconciler (correction) ──────────────────────────────────────────
//
// The reconciler turns drift findings into DB corrections, behind a flag.
// Precedence rules (honoring "no cross-source demotion"):
//   - GRANT PRO (access_denied_but_paid): always allowed — the user's OWN
//     provider says active; a grant never wrongly locks anyone out. Written
//     with a source-match guard so a concurrent source change can't misfire.
//   - DEMOTE to FREE (revenue_leak / stale_past_due): allowed ONLY for
//     non-IAP sources (stripe / null). Apple/Google demotions are DEFERRED to
//     their own store webhooks — the reconciler never demotes an IAP-source
//     row (reuses NOT_IAP_SOURCE_WHERE). Those stay monitor-alert-only.

export interface Correction {
  targetStatus: "PRO" | "FREE";
  allowed: boolean;
  reason: string;
}

/** Pure: what the reconciler would do for one finding (independent of apply). */
export function computeCorrection(
  finding: Pick<DriftFinding, "source" | "expected">
): Correction {
  if (finding.expected === "PRO") {
    return { targetStatus: "PRO", allowed: true, reason: "grant PRO — provider active" };
  }
  const isIap = finding.source === "apple" || finding.source === "google_play";
  return {
    targetStatus: "FREE",
    allowed: !isIap,
    reason: isIap
      ? "skip — IAP-source demotion deferred to store webhook (no cross-source demotion)"
      : "demote to FREE — provider inactive",
  };
}

export interface ReconcileEntry {
  userId: string;
  email: string | null;
  source: string;
  kind: DriftFinding["kind"];
  from: string;
  to: "PRO" | "FREE";
  outcome: "applied" | "dry-run" | "skipped";
  reason: string;
}

export interface ReconcileReport {
  apply: boolean;
  scanned: number;
  checked: number;
  unreadable: number;
  drift: number;
  applied: number;
  skipped: number;
  entries: ReconcileEntry[];
}

const RECONCILER_ACTOR = "system:entitlement-reconciler";

/**
 * Scan for drift and (if `apply`) correct it. Dry-run by default — writes
 * NOTHING and just reports what it would do. Every applied correction writes an
 * AdminAuditLog row. Demotions carry NOT_IAP_SOURCE_WHERE; grants carry a
 * source-match guard.
 */
export async function reconcileEntitlementDrift(opts: {
  apply: boolean;
}): Promise<ReconcileReport> {
  const scan = await scanEntitlementDrift();
  const entries: ReconcileEntry[] = [];
  let applied = 0;
  let skipped = 0;

  for (const f of scan.findings) {
    const c = computeCorrection(f);
    const base = {
      userId: f.userId,
      email: f.email,
      source: f.source,
      kind: f.kind,
      from: f.dbStatus,
      to: c.targetStatus,
    };

    if (!c.allowed) {
      skipped++;
      entries.push({ ...base, outcome: "skipped", reason: c.reason });
      continue;
    }
    if (!opts.apply) {
      entries.push({ ...base, outcome: "dry-run", reason: c.reason });
      continue;
    }

    // APPLY.
    const { prisma } = await import("@/lib/prisma");
    const where =
      c.targetStatus === "FREE"
        ? { id: f.userId, ...NOT_IAP_SOURCE_WHERE } // never demote an IAP-source row
        : { id: f.userId, subscriptionSource: f.source }; // grant only if source unchanged
    const res = await prisma.user.updateMany({
      where,
      data: { subscriptionStatus: c.targetStatus },
    });

    if (res.count > 0) {
      applied++;
      const { logAdminAction } = await import("@/lib/admin-audit");
      await logAdminAction({
        adminUserId: RECONCILER_ACTOR,
        action: "entitlement.reconcile",
        targetUserId: f.userId,
        metadata: {
          from: f.dbStatus,
          to: c.targetStatus,
          source: f.source,
          kind: f.kind,
          providerDetail: f.providerDetail,
        },
      });
      entries.push({ ...base, outcome: "applied", reason: c.reason });
    } else {
      skipped++;
      entries.push({
        ...base,
        outcome: "skipped",
        reason: "guard matched 0 rows (source changed between scan and write)",
      });
    }
  }

  return {
    apply: opts.apply,
    scanned: scan.total,
    checked: scan.checked,
    unreadable: scan.unreadable,
    drift: scan.findings.length,
    applied,
    skipped,
    entries,
  };
}
