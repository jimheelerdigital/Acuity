/**
 * PUT /api/admin/adlab/angles — batch update angles (advance selected)
 * Accepts { angleIds: string[], advanced: boolean }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { angleIds, advanced } = await req.json();

  if (!Array.isArray(angleIds) || angleIds.length === 0) {
    return NextResponse.json({ error: "angleIds required" }, { status: 400 });
  }

  await prisma.adLabAngle.updateMany({
    where: { id: { in: angleIds } },
    data: { advanced: advanced ?? true },
  });

  return NextResponse.json({ updated: angleIds.length });
}
