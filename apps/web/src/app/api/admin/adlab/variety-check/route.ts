/**
 * POST /api/admin/adlab/variety-check — run the batch variety check on one
 * experiment. Body { experimentId, dryRun? } (dryRun reports without
 * changing any creative). Auth: admin session OR CRON bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const { experimentId, dryRun } = (await req.json().catch(() => ({}))) as { experimentId?: string; dryRun?: boolean };
  if (!experimentId) return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  const exp = await prisma.adLabExperiment.findUnique({ where: { id: experimentId }, select: { campaignTags: true } });
  if (!exp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const groupKey = exp.campaignTags.includes("men") ? "men" : "women";
  const { runVarietyCheck } = await import("@/lib/adlab/variety-check");
  return NextResponse.json(await runVarietyCheck(experimentId, groupKey, { dryRun: dryRun !== false }));
}
