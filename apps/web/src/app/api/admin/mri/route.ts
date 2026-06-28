// MRI Diagnostic Dashboard — per-section data endpoint.
//
//   GET /api/admin/mri?section=<key>&start=<iso>&end=<iso>
//
// Returns the bare JSON for one section (no envelope). Admin-gated via
// requireAdmin. All section queries are READ-ONLY.

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import {
  getSystemHealth,
  getWebFunnel,
  getActivation,
  getTrial,
  getAcquisition,
  getFeatures,
  getEngagement,
  getFailures,
  getRevenue,
} from "@/lib/mri/queries";
import type { MRISectionKey } from "@/lib/mri/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SECTIONS: MRISectionKey[] = [
  "system-health",
  "web-funnel",
  "activation",
  "trial",
  "acquisition",
  "features",
  "engagement",
  "failures",
  "revenue",
];

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const section = req.nextUrl.searchParams.get("section") ?? "";
  if (!VALID_SECTIONS.includes(section as MRISectionKey)) {
    return NextResponse.json(
      { error: `Unknown section: ${section || "(none)"}` },
      { status: 400 }
    );
  }

  const startStr = req.nextUrl.searchParams.get("start");
  const endStr = req.nextUrl.searchParams.get("end");
  const end = endStr ? new Date(endStr) : new Date();
  const start = startStr
    ? new Date(startStr)
    : new Date(end.getTime() - 30 * 86400000);

  // monthStart for the revenue (business-metrics) current-state slice.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  switch (section as MRISectionKey) {
    case "system-health":
      return NextResponse.json(await getSystemHealth(prisma));
    case "web-funnel":
      return NextResponse.json(await getWebFunnel(prisma, start, end));
    case "activation":
      return NextResponse.json(await getActivation(prisma, start, end));
    case "trial":
      return NextResponse.json(await getTrial(prisma, start, end));
    case "acquisition":
      return NextResponse.json(await getAcquisition(prisma, start, end));
    case "features":
      return NextResponse.json(await getFeatures(prisma, start, end));
    case "engagement":
      return NextResponse.json(await getEngagement(prisma, start, end));
    case "failures":
      return NextResponse.json(await getFailures(prisma, start, end));
    case "revenue":
      return NextResponse.json(await getRevenue(prisma, monthStart));
    default:
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
}
