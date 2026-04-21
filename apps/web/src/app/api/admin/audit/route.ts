import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { listRecentAdminActions } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const rows = await listRecentAdminActions(limit);

  // Hydrate admin emails for display — one query, not N round-trips.
  const adminIds = Array.from(new Set(rows.map((r) => r.adminUserId)));
  const targetIds = Array.from(
    new Set(rows.map((r) => r.targetUserId).filter((v): v is string => Boolean(v)))
  );
  const [admins, targets] = await Promise.all([
    adminIds.length
      ? prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
    targetIds.length
      ? prisma.user.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const adminMap = new Map(admins.map((a) => [a.id, a.email]));
  const targetMap = new Map(targets.map((t) => [t.id, t.email]));

  return NextResponse.json({
    actions: rows.map((r) => ({
      id: r.id,
      action: r.action,
      adminUserId: r.adminUserId,
      adminEmail: adminMap.get(r.adminUserId) ?? null,
      targetUserId: r.targetUserId,
      targetEmail: r.targetUserId ? targetMap.get(r.targetUserId) ?? null : null,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  });
}
