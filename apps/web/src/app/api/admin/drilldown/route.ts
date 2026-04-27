/**
 * GET /api/admin/drilldown?metric=<key>&start=<iso>&end=<iso>
 *
 * Returns the underlying rows behind a metric tile or chart segment in
 * /admin. Two response shapes:
 *   { kind: "users", title, rows: [...], meta }
 *   { kind: "aggregate", title, columns, rows: [...], meta }
 *
 * Privacy guard mirrors /api/admin/users/[id]: metadata only — never
 * entry content, transcripts, audio, themes, goals, tasks, or AI
 * insights. The shape stays identical across metric kinds so the
 * generic <DrilldownModal> can render any of them.
 *
 * Every successful drilldown writes one row to AdminAuditLog with
 * action=admin.metric.drilldown + metric + count, so we have a record
 * of which user lists each admin pulled and when.
 */

import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ACTIONS, logAdminAction } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-guard";
import { MONTHLY_PRICE_CENTS, ANNUAL_AS_MONTHLY_CENTS, SUBSCRIPTION_STATUS } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  subscriptionStatus: string;
  signInMethod?: string;
  trialEndsAt?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  inferredInterval?: "monthly" | "annual" | null;
  monthlyContributionCents?: number;
  costCents?: number;
  durationMs?: number;
  model?: string;
  invokedAt?: string;
};

type DrilldownPayload =
  | {
      kind: "users";
      title: string;
      rows: UserRow[];
      meta: { count: number; metric: string };
    }
  | {
      kind: "aggregate";
      title: string;
      columns: { key: string; label: string; align?: "left" | "right" }[];
      rows: Record<string, string | number>[];
      meta: { count: number; metric: string; summary?: Record<string, number | string> };
    };

const ANNUAL_THRESHOLD_DAYS = 35;

function parseRange(req: NextRequest): { start: Date; end: Date } {
  const startStr = req.nextUrl.searchParams.get("start");
  const endStr = req.nextUrl.searchParams.get("end");
  const end = endStr ? new Date(endStr) : new Date();
  const start = startStr
    ? new Date(startStr)
    : new Date(end.getTime() - 7 * 86400000);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const metric = req.nextUrl.searchParams.get("metric") ?? "";
  const { start, end } = parseRange(req);

  let payload: DrilldownPayload;
  try {
    switch (metric) {
      case "signups":
        payload = await drillSignups(start, end);
        break;
      case "trial_to_paid":
        payload = await drillTrialToPaid(start, end);
        break;
      case "paying_subs":
        payload = await drillPayingSubs();
        break;
      case "mrr_breakdown":
        payload = await drillMrrBreakdown();
        break;
      case "ai_spend_breakdown":
        payload = await drillAiSpendBreakdown(start, end);
        break;
      case "signups_on_day": {
        const day = req.nextUrl.searchParams.get("day");
        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return NextResponse.json(
            { error: "Missing/invalid day=YYYY-MM-DD" },
            { status: 400 }
          );
        }
        payload = await drillSignupsOnDay(day);
        break;
      }
      case "ai_spend_for_purpose": {
        const purpose = req.nextUrl.searchParams.get("purpose");
        if (!purpose) {
          return NextResponse.json(
            { error: "Missing purpose" },
            { status: 400 }
          );
        }
        payload = await drillAiSpendForPurpose(purpose, start, end);
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin/drilldown]", metric, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Fire-and-forget audit. Failure is non-fatal (logAdminAction swallows
  // its own errors) so the drilldown still renders if the audit table is
  // briefly unavailable.
  await logAdminAction({
    adminUserId: guard.adminUserId,
    action: ADMIN_ACTIONS.METRIC_DRILLDOWN,
    metadata: {
      metric,
      count: payload.meta.count,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });

  return NextResponse.json(payload);
}

async function drillSignups(start: Date, end: Date): Promise<DrilldownPayload> {
  const rows = await prisma.user.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      subscriptionStatus: true,
      accounts: { select: { provider: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const mapped: UserRow[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    subscriptionStatus: u.subscriptionStatus,
    signInMethod: u.accounts[0]?.provider ?? "email",
  }));

  return {
    kind: "users",
    title: "New Signups",
    rows: mapped,
    meta: { count: mapped.length, metric: "signups" },
  };
}

async function drillTrialToPaid(
  start: Date,
  end: Date
): Promise<DrilldownPayload> {
  const rows = await prisma.user.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCurrentPeriodEnd: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return {
    kind: "users",
    title: "Trial-to-Paid Conversions",
    rows: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      subscriptionStatus: u.subscriptionStatus,
      trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
    meta: { count: rows.length, metric: "trial_to_paid" },
  };
}

async function drillPayingSubs(): Promise<DrilldownPayload> {
  const rows = await prisma.user.findMany({
    where: {
      subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      stripeSubscriptionId: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      subscriptionStatus: true,
      stripeCurrentPeriodEnd: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return {
    kind: "users",
    title: "Active Paying Subscribers",
    rows: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      subscriptionStatus: u.subscriptionStatus,
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
    })),
    meta: { count: rows.length, metric: "paying_subs" },
  };
}

async function drillMrrBreakdown(): Promise<DrilldownPayload> {
  const rows = await prisma.user.findMany({
    where: {
      subscriptionStatus: SUBSCRIPTION_STATUS.PRO,
      stripeSubscriptionId: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      subscriptionStatus: true,
      stripeCurrentPeriodEnd: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Heuristic: if the current period ends within 35 days, treat as
  // monthly; otherwise annual. Real Stripe-driven plan attribution lands
  // in Slice 3 — until then this is the cleanest no-API proxy.
  const now = Date.now();
  let monthly = 0;
  let annual = 0;
  let monthlyMrrCents = 0;
  let annualMrrCents = 0;

  const userRows: UserRow[] = rows.map((u) => {
    const end = u.stripeCurrentPeriodEnd?.getTime() ?? null;
    let inferred: "monthly" | "annual" | null = null;
    let contrib = 0;
    if (end != null) {
      const days = (end - now) / 86400000;
      if (days < ANNUAL_THRESHOLD_DAYS) {
        inferred = "monthly";
        contrib = MONTHLY_PRICE_CENTS;
        monthly += 1;
        monthlyMrrCents += MONTHLY_PRICE_CENTS;
      } else {
        inferred = "annual";
        contrib = ANNUAL_AS_MONTHLY_CENTS;
        annual += 1;
        annualMrrCents += ANNUAL_AS_MONTHLY_CENTS;
      }
    }
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      subscriptionStatus: u.subscriptionStatus,
      stripeCurrentPeriodEnd: u.stripeCurrentPeriodEnd?.toISOString() ?? null,
      inferredInterval: inferred,
      monthlyContributionCents: contrib,
    };
  });

  return {
    kind: "users",
    title: "Monthly Recurring Revenue (MRR) — by inferred plan",
    rows: userRows,
    meta: {
      count: userRows.length,
      metric: "mrr_breakdown",
    },
  };
}

async function drillSignupsOnDay(day: string): Promise<DrilldownPayload> {
  // Day is the user's calendar day in UTC — same convention as the
  // metrics route's signupsOverTime query (DATE("createdAt")).
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);

  const rows = await prisma.user.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      subscriptionStatus: true,
      accounts: { select: { provider: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return {
    kind: "users",
    title: `Signups on ${day}`,
    rows: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      subscriptionStatus: u.subscriptionStatus,
      signInMethod: u.accounts[0]?.provider ?? "email",
    })),
    meta: { count: rows.length, metric: "signups_on_day" },
  };
}

async function drillAiSpendForPurpose(
  purpose: string,
  start: Date,
  end: Date
): Promise<DrilldownPayload> {
  const rows = await prisma.claudeCallLog.findMany({
    where: {
      purpose,
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      purpose: true,
      model: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      durationMs: true,
      success: true,
      createdAt: true,
    },
  });

  const totalCents = rows.reduce((acc, r) => acc + r.costCents, 0);
  const failures = rows.filter((r) => !r.success).length;

  return {
    kind: "aggregate",
    title: `Claude calls — ${purpose}`,
    columns: [
      { key: "createdAt", label: "When" },
      { key: "model", label: "Model" },
      { key: "tokensIn", label: "Tokens In", align: "right" },
      { key: "tokensOut", label: "Tokens Out", align: "right" },
      { key: "costCents", label: "Cost", align: "right" },
      { key: "durationMs", label: "ms", align: "right" },
      { key: "status", label: "Status" },
    ],
    rows: rows.map((r) => ({
      createdAt: new Date(r.createdAt).toLocaleString(),
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costCents: r.costCents,
      durationMs: r.durationMs,
      status: r.success ? "OK" : "FAIL",
    })),
    meta: {
      count: rows.length,
      metric: "ai_spend_for_purpose",
      summary: { totalCents, calls: rows.length, failures },
    },
  };
}

async function drillAiSpendBreakdown(
  start: Date,
  end: Date
): Promise<DrilldownPayload> {
  const rows = await prisma.$queryRaw<
    { purpose: string; total: bigint; calls: bigint; avg_ms: number | null }[]
  >`
    SELECT purpose,
           COALESCE(SUM("costCents"), 0)::bigint as total,
           COUNT(*)::bigint as calls,
           AVG("durationMs")::float as avg_ms
    FROM "ClaudeCallLog"
    WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY purpose
    ORDER BY total DESC
  `;

  return {
    kind: "aggregate",
    title: "Claude Spend by Feature",
    columns: [
      { key: "purpose", label: "Feature" },
      { key: "calls", label: "Calls", align: "right" },
      { key: "totalCents", label: "Total Cost", align: "right" },
      { key: "avgMs", label: "Avg ms", align: "right" },
    ],
    rows: rows.map((r) => ({
      purpose: r.purpose,
      calls: Number(r.calls),
      totalCents: Number(r.total),
      avgMs: r.avg_ms ? Math.round(r.avg_ms) : 0,
    })),
    meta: {
      count: rows.length,
      metric: "ai_spend_breakdown",
      summary: {
        totalCents: rows.reduce((acc, r) => acc + Number(r.total), 0),
        totalCalls: rows.reduce((acc, r) => acc + Number(r.calls), 0),
      },
    },
  };
}
