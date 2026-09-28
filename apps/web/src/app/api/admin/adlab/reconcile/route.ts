/**
 * GET /api/admin/adlab/reconcile — run the Ads Manager status sync now
 * (lib/adlab/reconcile.ts) instead of waiting for the 09:00 UTC engine run.
 * Admin only. Open it in the browser while signed in to the admin.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to the admin first" }, { status: 401 });
  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
  if (!me?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { reconcileAdStatuses } = await import("@/lib/adlab/reconcile");
  return NextResponse.json(await reconcileAdStatuses());
}
