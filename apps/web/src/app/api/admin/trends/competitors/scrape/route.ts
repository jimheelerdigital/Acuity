import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Manual "rescrape now" trigger for the competitor pipeline
 * (2026-09-17). Fires the same event the 3:30 UTC cron listens to,
 * so a freshly added handle gets scraped + briefed without waiting
 * overnight.
 */
export async function POST() {
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

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/competitor.scrape", data: {} });

  return NextResponse.json({ ok: true });
}
