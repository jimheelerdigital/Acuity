/**
 * GET /api/creators/payouts/[id]/csv — statement for one of the signed-in
 * creator's payouts. Rows carry no customer identity.
 */
import { NextResponse } from "next/server";

import { labelFor } from "@/lib/creators/emails";
import { currentCreatorId } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Ledger reasons can mention store / plan; never customer data. Keep it generic. */
function safeReason(type: string, reason: string | null): string {
  if (type === "commission" || type === "clawback") return reason?.replace(/[^a-z_ ]/gi, "").trim() ?? "";
  if (type === "milestone_bonus") return reason ?? "";
  if (type === "boost_bonus") return "post run as an ad";
  return reason ?? "";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { prisma } = await import("@/lib/prisma");
  const payout = await prisma.creatorPayout.findFirst({
    where: { id: params.id, creatorId, status: "sent" },
    select: { id: true, entryIds: true, sentAt: true, amount: true },
  });
  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await prisma.creatorLedgerEntry.findMany({
    where: { id: { in: (payout.entryIds as string[]) ?? [] }, creatorId },
    orderBy: { payableAt: "asc" },
    select: { type: true, amount: true, payableAt: true, reason: true },
  });
  const lines = [
    "date,type,amount_usd,detail",
    ...rows.map((r) =>
      [
        r.payableAt.toISOString().slice(0, 10),
        labelFor(r.type),
        (r.amount / 100).toFixed(2),
        safeReason(r.type, r.reason),
      ]
        .map(csvCell)
        .join(",")
    ),
    ["", "Total paid", (payout.amount / 100).toFixed(2), ""].map(csvCell).join(","),
  ];
  const date = payout.sentAt?.toISOString().slice(0, 10) ?? "payout";
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ripple-payout-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
