/**
 * PUT /api/admin/adlab/angles — advance selected angles AND delete unselected ones.
 * Accepts { angleIds: string[], experimentId: string }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { angleIds, experimentId } = await req.json();

  if (!Array.isArray(angleIds) || angleIds.length === 0) {
    return NextResponse.json({ error: "angleIds required" }, { status: 400 });
  }

  // Mark selected as advanced
  await prisma.adLabAngle.updateMany({
    where: { id: { in: angleIds } },
    data: { advanced: true },
  });

  // Delete non-advanced angles for this experiment (cleanup)
  let deletedCount = 0;
  if (experimentId) {
    const result = await prisma.adLabAngle.deleteMany({
      where: {
        experimentId,
        id: { notIn: angleIds },
      },
    });
    deletedCount = result.count;
  }

  return NextResponse.json({ advanced: angleIds.length, deleted: deletedCount });
}
