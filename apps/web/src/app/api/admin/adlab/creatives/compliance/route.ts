/**
 * POST /api/admin/adlab/creatives/compliance — run compliance check.
 * Accepts { experimentId } for batch check,
 * or { experimentId, skip: true } to bypass and mark all as "pass".
 *
 * Logic lives in @/lib/adlab/compliance (shared with the weekly Reddit→ads batch).
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { runComplianceForExperiment } from "@/lib/adlab/compliance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId, skip } = await req.json();

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  // Skip compliance: mark all creatives as "pass" immediately
  if (skip) {
    const experiment = await prisma.adLabExperiment.findUnique({
      where: { id: experimentId },
      include: { angles: { include: { creatives: { select: { id: true } } } } },
    });
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    const allIds = experiment.angles.flatMap((a) => a.creatives.map((c) => c.id));
    await prisma.adLabCreative.updateMany({
      where: { id: { in: allIds } },
      data: { complianceStatus: "passed", complianceNotes: "Skipped — manual review" },
    });
    return NextResponse.json({ checked: allIds.length, skipped: true, failCount: 0, warnCount: 0, passCount: allIds.length });
  }

  try {
    const result = await runComplianceForExperiment(experimentId);
    if (result.checked === 0) {
      return NextResponse.json({ error: "No creatives to check" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
