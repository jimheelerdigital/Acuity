/**
 * POST /api/admin/adlab/creatives/finalize — delete unapproved creatives + storage files.
 * Accepts { experimentId }. Also deletes flagged creatives that weren't fixed.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId } = await req.json();
  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  // Find all unapproved or flagged creatives for this experiment
  const toDelete = await prisma.adLabCreative.findMany({
    where: {
      angle: { experimentId },
      OR: [
        { approved: false },
        { complianceStatus: "flagged" },
      ],
    },
    select: { id: true, imageUrl: true, videoUrl: true },
  });

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, storageDeleted: 0 });
  }

  // Delete storage files from Supabase
  let storageDeleted = 0;
  try {
    const { supabase } = await import("@/lib/supabase.server");
    const filesToRemove: string[] = [];

    for (const creative of toDelete) {
      if (creative.imageUrl?.includes("adlab-creatives")) {
        filesToRemove.push(`${creative.id}.png`);
      }
      if (creative.videoUrl?.includes("adlab-creatives")) {
        filesToRemove.push(`${creative.id}.mp4`);
      }
    }

    if (filesToRemove.length > 0) {
      const { error } = await supabase.storage
        .from("adlab-creatives")
        .remove(filesToRemove);

      if (error) {
        console.error("[adlab] Storage cleanup failed:", error.message);
      } else {
        storageDeleted = filesToRemove.length;
      }
    }
  } catch (err) {
    console.error("[adlab] Storage cleanup error:", err);
  }

  // Delete the creative rows (cascade will handle any ad rows)
  const result = await prisma.adLabCreative.deleteMany({
    where: {
      id: { in: toDelete.map((c) => c.id) },
    },
  });

  return NextResponse.json({
    deleted: result.count,
    storageDeleted,
  });
}
