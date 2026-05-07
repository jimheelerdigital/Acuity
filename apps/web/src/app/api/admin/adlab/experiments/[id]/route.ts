/**
 * GET /api/admin/adlab/experiments/[id] — get experiment with angles
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { name: true, slug: true } },
      angles: {
        include: {
          creatives: {
            include: {
              ads: true,
            },
          },
        },
        orderBy: { score: "desc" },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(experiment);
}
