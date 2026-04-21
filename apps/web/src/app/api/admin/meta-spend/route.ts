import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { weekStart, entries } = await req.json();
  if (!weekStart || !Array.isArray(entries)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ws = new Date(weekStart);
  for (const entry of entries) {
    if (!entry.campaign || entry.spendCents == null) continue;
    await prisma.metaSpend.upsert({
      where: {
        weekStart_campaign: {
          weekStart: ws,
          campaign: entry.campaign,
        },
      },
      update: { spendCents: entry.spendCents },
      create: {
        weekStart: ws,
        campaign: entry.campaign,
        spendCents: entry.spendCents,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
