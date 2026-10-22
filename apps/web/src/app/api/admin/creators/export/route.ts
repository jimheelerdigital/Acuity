/**
 * GET /api/admin/creators/export?table=creators|ledger|payouts|flags — CSV
 * download of a creator-platform table (admin only). Money columns in
 * dollars.
 */
import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cell(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: unknown[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

const usd = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const table = req.nextUrl.searchParams.get("table") ?? "creators";
  let body: string;

  if (table === "creators") {
    const { adminCreatorRows } = await import("@/lib/creators/stats");
    const rows = await adminCreatorRows();
    body = csv(
      ["id", "handle", "platform", "name", "email", "status", "persona", "creator_type", "code", "clicks", "signups", "trials", "paying", "revenue_usd", "commission_owed_usd", "ad_spend_usd", "roi", "pending_usd", "payable_usd", "paid_usd", "agreement", "payout_ready", "open_flags", "last_click_at"],
      rows.map((r) => [r.id, r.handle, r.platform, r.name, r.email, r.status, r.persona, r.creatorType, r.referralCode, r.clicks, r.signups, r.trials, r.paying, usd(r.revenueCents), usd(r.commissionOwedCents), usd(r.adSpendCents), r.roi == null ? "" : r.roi.toFixed(2), usd(r.balance.pending), usd(r.balance.payable), usd(r.balance.paidToDate), r.agreementAccepted, r.payoutReady, r.openFlags, r.lastClickAt])
    );
  } else if (table === "ledger") {
    const rows = await prisma.creatorLedgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: { creator: { select: { handle: true, referralCode: true } } },
    });
    const evIds = rows.map((r) => r.revenueEventId).filter((x): x is string => !!x);
    const evs = await prisma.creatorRevenueEvent.findMany({
      where: { id: { in: evIds } },
      select: { id: true, externalEventId: true, providerEventId: true, source: true },
    });
    const evBy = new Map(evs.map((e) => [e.id, e]));
    body = csv(
      ["id", "created_at", "creator", "code", "type", "amount_usd", "status", "payable_at", "customer_user_id", "source", "external_event_id", "provider_event_id", "post_id", "milestone_month", "payout_id", "reason", "created_by"],
      rows.map((r) => {
        const e = r.revenueEventId ? evBy.get(r.revenueEventId) : undefined;
        return [r.id, r.createdAt, r.creator.handle, r.creator.referralCode, r.type, usd(r.amount), r.status, r.payableAt, r.userId, e?.source, e?.externalEventId, e?.providerEventId, r.postId, r.milestoneMonth, r.payoutId, r.reason, r.createdBy];
      })
    );
  } else if (table === "payouts") {
    const rows = await prisma.creatorPayout.findMany({
      orderBy: { createdAt: "desc" },
      include: { creator: { select: { handle: true, referralCode: true } } },
    });
    body = csv(
      ["id", "run_key", "creator", "code", "amount_usd", "rail", "status", "external_id", "approved_by", "approved_at", "sent_at", "period_end", "entries", "error"],
      rows.map((r) => [r.id, r.runKey, r.creator.handle, r.creator.referralCode, usd(r.amount), r.rail, r.status, r.externalId, r.approvedBy, r.approvedAt, r.sentAt, r.periodEnd, (r.entryIds as string[]).length, r.error])
    );
  } else if (table === "flags") {
    const rows = await prisma.creatorFlag.findMany({
      orderBy: { createdAt: "desc" },
      include: { creator: { select: { handle: true, referralCode: true } } },
    });
    body = csv(
      ["id", "created_at", "creator", "code", "kind", "detail", "status", "referral_id", "resolved_reason", "resolved_by", "resolved_at"],
      rows.map((r) => [r.id, r.createdAt, r.creator.handle, r.creator.referralCode, r.kind, r.detail, r.status, r.referralId, r.resolvedReason, r.resolvedBy, r.resolvedAt])
    );
  } else {
    return new Response("Unknown table", { status: 400 });
  }

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="creators-${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
