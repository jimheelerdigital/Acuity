/**
 * GET /api/admin/free-cap
 *
 * Returns the current state of the v1.1 free-tier soft cap surface
 * for the admin tab:
 *   - flag      — current `free_recording_cap` row (or null if unseeded)
 *   - cycles    — last 12 FreeCapEvaluation rows, newest first
 *   - audit     — last 30 FreeCapAuditLog rows, newest first
 *   - thresholds — the live CAP_THRESHOLDS + CAP_REQUIRED_CYCLES so
 *                  the tab can render the gating math without
 *                  duplicating constants
 *
 * Read-only. Manual flip lives at POST /api/admin/free-cap/toggle.
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { CAP_REQUIRED_CYCLES, CAP_THRESHOLDS } from "@/lib/free-cap";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FLAG_KEY = "free_recording_cap";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [flag, cycles, audit] = await Promise.all([
    prisma.featureFlag.findUnique({ where: { key: FLAG_KEY } }),
    prisma.freeCapEvaluation.findMany({
      orderBy: { evaluatedAt: "desc" },
      take: 12,
    }),
    prisma.freeCapAuditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    flag,
    cycles,
    audit,
    thresholds: {
      ...CAP_THRESHOLDS,
      requiredCycles: CAP_REQUIRED_CYCLES,
    },
  });
}
