// MRI Diagnostic Dashboard — AI Insights endpoint.
//
//   GET /api/admin/mri/insights                 → latest AdminInsight (or null)
//   GET /api/admin/mri/insights?regenerate=true → force a fresh generation,
//        rate-limited to once / 5 min / admin.
//
// Admin-gated via requireAdmin. The regenerate rate limit is enforced with a
// deterministic DB check (last AdminInsight by this admin within 5 min) rather
// than the fail-open Upstash limiter, so the cap holds even without Upstash.

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { generateInsights, getLatestInsight } from "@/lib/mri/insights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Claude generation can take 30-60s; give it room (Vercel Pro ceiling).
export const maxDuration = 300;

const REGEN_WINDOW_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const regenerate = req.nextUrl.searchParams.get("regenerate") === "true";

  if (!regenerate) {
    return NextResponse.json(await getLatestInsight());
  }

  // 5-min/admin rate limit: reject if this admin generated within the window.
  const recent = await prisma.adminInsight.findFirst({
    where: {
      generatedBy: guard.adminUserId,
      generatedAt: { gte: new Date(Date.now() - REGEN_WINDOW_MS) },
    },
    orderBy: { generatedAt: "desc" },
    select: { generatedAt: true },
  });

  if (recent) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (recent.generatedAt.getTime() + REGEN_WINDOW_MS - Date.now()) / 1000
      )
    );
    return NextResponse.json(
      {
        error: "Rate limited — insights can be regenerated once every 5 minutes.",
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  const row = await generateInsights(guard.adminUserId);
  return NextResponse.json(row);
}
