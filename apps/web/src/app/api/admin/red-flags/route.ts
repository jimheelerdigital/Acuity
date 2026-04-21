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

  const { flagId, action } = await req.json();
  if (!flagId || !["resolve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await prisma.redFlag.update({
    where: { id: flagId },
    data: { resolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
